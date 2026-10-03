//! Dock only the compact shell. Its visible cap stays on screen and is the hover target.
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::Window;
use windows::Win32::{
    Foundation::{HWND, POINT, RECT},
    Graphics::Gdi::{
        ClientToScreen, GetMonitorInfoW, MonitorFromPoint, MONITORINFO, MONITOR_DEFAULTTONEAREST,
    },
    UI::{
        HiDpi::GetDpiForWindow,
        Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON},
        WindowsAndMessaging::{
            GetClientRect, GetCursorPos, GetWindowRect, IsIconic, IsWindowVisible, SetWindowPos,
            SystemParametersInfoW, ANIMATIONINFO, SPI_GETANIMATION, SWP_NOACTIVATE, SWP_NOSIZE,
            SWP_NOZORDER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        },
    },
};

#[derive(Clone, Copy, Debug, PartialEq)]
enum Side {
    Left,
    Right,
}

#[derive(Clone, Copy)]
struct Anchor {
    side: Side,
    x: i32,
    y: i32,
    area: RECT,
}

struct Motion {
    from: i32,
    to: i32,
    began: Instant,
}
impl Motion {
    fn position(&self, now: Instant) -> (i32, bool) {
        let t = (now.duration_since(self.began).as_secs_f64() / 0.22).min(1.0);
        let value = self.from as f64 + (self.to - self.from) as f64 * (1.0 - (1.0 - t).powi(3));
        (value.round() as i32, t >= 1.0)
    }
}

/// Offsets of the painted capsule within the native frame, in physical pixels.
#[derive(Clone, Copy)]
struct Capsule {
    left: i32,
    right: i32,
    top: i32,
    bottom: i32,
    radius: i32,
}
impl Capsule {
    fn contains(self, frame: RECT, cursor: POINT) -> bool {
        let x = cursor.x - frame.left;
        let y = cursor.y - frame.top;
        if y < self.top || y > self.bottom || x < self.left || x > self.right {
            return false;
        }
        // Rounded physical coordinates can differ by one pixel at custom DPI.
        let radius = self
            .radius
            .min((self.right - self.left) / 2)
            .min((self.bottom - self.top) / 2);
        let cx = x.clamp(self.left + radius, self.right - radius);
        let cy = y.clamp(self.top + radius, self.bottom - radius);
        (x - cx).pow(2) + (y - cy).pow(2) <= radius.pow(2)
    }
    fn hidden_x(self, side: Side, area: RECT) -> i32 {
        match side {
            Side::Left => area.left - self.right + self.radius,
            Side::Right => area.right - self.left - self.radius,
        }
    }
}

#[derive(Default)]
struct DockState {
    anchor: Option<Anchor>,
    hidden: bool,
    motion: Option<Motion>,
    left_at: Option<Instant>,
}
impl DockState {
    #[allow(clippy::too_many_arguments)]
    fn tick(
        &mut self,
        frame: RECT,
        cap: Capsule,
        area: RECT,
        cursor: POINT,
        dragging: bool,
        animate: bool,
        now: Instant,
        threshold: i32,
    ) -> Option<(i32, i32)> {
        if dragging {
            *self = Self::default();
            return None;
        }
        if let Some(anchor) = self.anchor {
            // Recompute after display/DPI changes instead of retaining an off-screen anchor.
            if anchor.area != area {
                *self = Self::default();
                return Some((
                    anchor.x.clamp(area.left - cap.left, area.right - cap.right),
                    anchor.y.clamp(area.top - cap.top, area.bottom - cap.bottom),
                ));
            }
        }
        if self.anchor.is_none() {
            let left = frame.left + cap.left;
            let right = frame.left + cap.right;
            if frame.top + cap.bottom <= area.top || frame.top + cap.top >= area.bottom {
                return None;
            }
            // A released capsule may already straddle the edge. Require an
            // intersection with this screen, not proximity of its outside end.
            let side = if left <= area.left + threshold && right > area.left {
                Side::Left
            } else if right >= area.right - threshold && left < area.right {
                Side::Right
            } else {
                return None;
            };
            let x = match side {
                Side::Left => area.left - cap.left,
                Side::Right => area.right - cap.right,
            };
            self.anchor = Some(Anchor {
                side,
                x,
                y: frame.top,
                area,
            });
            if left >= area.left && right <= area.right {
                return Some((x, frame.top));
            }
            // Continue from the dropped position instead of snapping fully
            // onscreen before hiding. Hover still keeps the capsule available.
            self.left_at = Some(now);
        }
        let anchor = self.anchor.unwrap();
        // The exposed cap changes ends during reveal. Retain its original hit
        // area so a stationary pointer near the curve cannot trigger oscillation.
        let hint_frame = RECT {
            left: cap.hidden_x(anchor.side, area),
            top: anchor.y,
            ..frame
        };
        let hover =
            cap.contains(frame, cursor) || (!self.hidden && cap.contains(hint_frame, cursor));
        if hover {
            self.left_at = None;
        } else {
            self.left_at.get_or_insert(now);
        }
        let should_hide = !hover
            && self
                .left_at
                .is_some_and(|left| now.duration_since(left) >= Duration::from_millis(280));
        let change = (self.hidden && hover) || (!self.hidden && should_hide);
        if change {
            self.hidden = !self.hidden;
            let to = if self.hidden {
                cap.hidden_x(anchor.side, area)
            } else {
                anchor.x
            };
            if !animate {
                self.motion = None;
                return Some((to, anchor.y));
            }
            self.motion = Some(Motion {
                from: frame.left,
                to,
                began: now,
            });
        }
        if let Some(motion) = &self.motion {
            let (x, finished) = motion.position(now);
            if finished {
                self.motion = None;
            }
            return Some((x, anchor.y));
        }
        None
    }
}

struct Monitor {
    cancelled: Arc<AtomicBool>,
    state: Arc<Mutex<DockState>>,
    worker: JoinHandle<()>,
}

#[derive(Default)]
pub struct IslandDock(Mutex<Option<Monitor>>);
impl IslandDock {
    pub fn start(&self, window: &Window) -> Result<(), String> {
        self.stop(window);
        let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
        let cancelled = Arc::new(AtomicBool::new(false));
        let state = Arc::new(Mutex::new(DockState::default()));
        let stop = cancelled.clone();
        let current = state.clone();
        let window = window.clone();
        let worker = thread::spawn(move || unsafe {
            while !stop.load(Ordering::Acquire) {
                let moving = current.lock().unwrap().motion.is_some();
                thread::sleep(Duration::from_millis(if moving { 16 } else { 50 }));
                if stop.load(Ordering::Acquire) {
                    break;
                }
                if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                    continue;
                }
                let (mut frame, mut client) = (RECT::default(), RECT::default());
                let (mut origin, mut cursor) = (POINT::default(), POINT::default());
                if GetWindowRect(hwnd, &mut frame).is_err()
                    || GetClientRect(hwnd, &mut client).is_err()
                    || !ClientToScreen(hwnd, &mut origin).as_bool()
                    || GetCursorPos(&mut cursor).is_err()
                {
                    continue;
                }
                let scale = GetDpiForWindow(hwnd).max(96) as f64 / 96.0;
                let px = |value: f64| (value * scale).round() as i32;
                let cap = Capsule {
                    left: origin.x - frame.left + px(14.0),
                    right: origin.x - frame.left + client.right - px(14.0),
                    top: origin.y - frame.top + px(14.0),
                    bottom: origin.y - frame.top + px(86.0),
                    radius: px(36.0),
                };
                let mut state = current.lock().unwrap();
                // While hidden on a shared monitor boundary, query the original
                // screen instead of whichever screen contains most of the HWND.
                let center = state.anchor.map_or(
                    POINT {
                        x: (frame.left + frame.right) / 2,
                        y: (frame.top + frame.bottom) / 2,
                    },
                    |a| POINT {
                        x: (a.area.left + a.area.right) / 2,
                        y: (a.area.top + a.area.bottom) / 2,
                    },
                );
                let mut monitor = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                if !GetMonitorInfoW(
                    MonitorFromPoint(center, MONITOR_DEFAULTTONEAREST),
                    &mut monitor,
                )
                .as_bool()
                {
                    continue;
                }
                let mut animation = ANIMATIONINFO {
                    cbSize: std::mem::size_of::<ANIMATIONINFO>() as u32,
                    iMinAnimate: 1,
                };
                let _ = SystemParametersInfoW(
                    SPI_GETANIMATION,
                    animation.cbSize,
                    Some(&mut animation as *mut _ as _),
                    SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
                );
                let dragging = !state.hidden
                    && cap.contains(frame, cursor)
                    && GetAsyncKeyState(VK_LBUTTON.0 as i32) < 0;
                let position = state.tick(
                    frame,
                    cap,
                    monitor.rcWork,
                    cursor,
                    dragging,
                    animation.iMinAnimate != 0,
                    Instant::now(),
                    px(20.0),
                );
                drop(state);
                if let Some((x, y)) = position {
                    let cancelled = stop.clone();
                    // Check cancellation on the UI thread as well: queued moves
                    // must not run after expanding, closing or replacing a monitor.
                    if window
                        .run_on_main_thread(move || {
                            if !cancelled.load(Ordering::Acquire) {
                                let _ = SetWindowPos(
                                    hwnd,
                                    HWND(0),
                                    x,
                                    y,
                                    0,
                                    0,
                                    SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER,
                                );
                            }
                        })
                        .is_err()
                    {
                        break;
                    }
                }
            }
        });
        *self.0.lock().unwrap() = Some(Monitor {
            cancelled,
            state,
            worker,
        });
        Ok(())
    }

    pub fn stop(&self, window: &Window) {
        if let Some(monitor) = self.0.lock().unwrap().take() {
            monitor.cancelled.store(true, Ordering::Release);
            let _ = monitor.worker.join();
            if let Some(anchor) = monitor.state.lock().unwrap().anchor {
                let _ = window.set_position(tauri::PhysicalPosition::new(anchor.x, anchor.y));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn partly_offscreen_release_docks_to_a_cap_without_jumping_fully_onscreen() {
        for scale in [1, 2] {
            let cap = Capsule {
                left: 14 * scale,
                right: 426 * scale,
                top: 14 * scale,
                bottom: 86 * scale,
                radius: 36 * scale,
            };
            let area = RECT {
                left: -1920 * scale,
                top: 0,
                right: 0,
                bottom: 1080 * scale,
            };
            for side in [Side::Left, Side::Right] {
                for outside in [80, 220, 370] {
                    let x = match side {
                        Side::Left => area.left - outside * scale,
                        Side::Right => area.right - (440 - outside) * scale,
                    };
                    let frame = RECT {
                        left: x,
                        top: 100 * scale,
                        right: x + 440 * scale,
                        bottom: 200 * scale,
                    };
                    let away = POINT {
                        x: -900 * scale,
                        y: 600 * scale,
                    };
                    let now = Instant::now();
                    let mut dock = DockState::default();
                    assert!(dock
                        .tick(frame, cap, area, away, true, true, now, 20 * scale)
                        .is_none());
                    assert!(dock.anchor.is_none(), "Do not snap while dragging");
                    let first = dock.tick(frame, cap, area, away, false, true, now, 20 * scale);
                    assert!(
                        dock.anchor.is_some(),
                        "Partly offscreen release must attach: {side:?}, {outside}"
                    );
                    assert!(
                        first.is_none_or(|(position, _)| position == x),
                        "Do not first jump back onto the screen"
                    );
                    dock.tick(
                        frame,
                        cap,
                        area,
                        away,
                        false,
                        true,
                        now + Duration::from_millis(300),
                        20 * scale,
                    );
                    let result = dock.tick(
                        frame,
                        cap,
                        area,
                        away,
                        false,
                        true,
                        now + Duration::from_millis(550),
                        20 * scale,
                    );
                    assert_eq!(result, Some((cap.hidden_x(side, area), frame.top)));
                }
            }
        }
    }
    #[test]
    fn custom_dpi_rounding_keeps_the_cap_hit_area_valid() {
        let cap = Capsule {
            left: 19,
            right: 575,
            top: 19,
            bottom: 116,
            radius: 49,
        };
        let frame = RECT {
            left: 0,
            top: 0,
            right: 594,
            bottom: 135,
        };
        assert!(cap.contains(frame, POINT { x: 570, y: 67 }));
        assert!(!cap.contains(frame, POINT { x: 575, y: 19 }));
    }
    #[test]
    fn caps_remain_exactly_half_a_circle_on_both_sides_at_each_dpi() {
        for scale in [1, 2, 3] {
            let cap = Capsule {
                left: 14 * scale,
                right: 426 * scale,
                top: 14 * scale,
                bottom: 86 * scale,
                radius: 36 * scale,
            };
            let area = RECT {
                left: -1920 * scale,
                top: 0,
                right: 0,
                bottom: 1080 * scale,
            };
            assert_eq!(
                cap.hidden_x(Side::Left, area) + cap.right - area.left,
                36 * scale
            );
            assert_eq!(
                area.right - cap.hidden_x(Side::Right, area) - cap.left,
                36 * scale
            );
        }
    }
    #[test]
    fn hover_on_cap_reverses_slide_and_drag_detaches() {
        let now = Instant::now();
        let cap = Capsule {
            left: 14,
            right: 426,
            top: 14,
            bottom: 86,
            radius: 36,
        };
        let area = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let mut rect = RECT {
            left: 0,
            top: 100,
            right: 440,
            bottom: 200,
        };
        let away = POINT { x: 900, y: 500 };
        let mut dock = DockState::default();
        assert_eq!(
            dock.tick(rect, cap, area, away, false, true, now, 20),
            Some((-14, 100))
        );
        rect.left = -14;
        rect.right = 426;
        dock.tick(rect, cap, area, away, false, true, now, 20);
        dock.tick(
            rect,
            cap,
            area,
            away,
            false,
            true,
            now + Duration::from_millis(300),
            20,
        );
        let (x, _) = dock
            .tick(
                rect,
                cap,
                area,
                away,
                false,
                true,
                now + Duration::from_millis(560),
                20,
            )
            .unwrap();
        assert_eq!(x, -390);
        rect.left = x;
        rect.right = x + 440;
        // Tip of the cap is well beyond the old 20px screen-edge hover strip.
        dock.tick(
            rect,
            cap,
            area,
            POINT { x: 30, y: 150 },
            false,
            true,
            now + Duration::from_millis(570),
            20,
        );
        assert!(!dock.hidden);
        let (x, _) = dock
            .tick(
                rect,
                cap,
                area,
                POINT { x: 30, y: 150 },
                false,
                true,
                now + Duration::from_millis(680),
                20,
            )
            .unwrap();
        assert!(x > -390 && x < -14);
        let corner = POINT { x: 5, y: 120 };
        dock.tick(
            rect,
            cap,
            area,
            corner,
            false,
            true,
            now + Duration::from_millis(800),
            20,
        );
        rect.left = -14;
        rect.right = 426;
        assert!(!cap.contains(rect, corner));
        dock.tick(
            rect,
            cap,
            area,
            corner,
            false,
            true,
            now + Duration::from_millis(1200),
            20,
        );
        dock.tick(
            rect,
            cap,
            area,
            corner,
            false,
            true,
            now + Duration::from_millis(1600),
            20,
        );
        assert!(
            !dock.hidden,
            "Hovering the original cap must keep the island revealed"
        );
        dock.tick(
            rect,
            cap,
            area,
            away,
            true,
            true,
            now + Duration::from_millis(1700),
            20,
        );
        assert!(dock.anchor.is_none() && dock.motion.is_none());
    }
    #[test]
    fn top_edge_does_not_dock_and_reduced_motion_moves_directly() {
        let cap = Capsule {
            left: 14,
            right: 426,
            top: 14,
            bottom: 86,
            radius: 36,
        };
        let area = RECT {
            left: 0,
            top: 0,
            right: 1920,
            bottom: 1080,
        };
        let now = Instant::now();
        let away = POINT { x: 800, y: 400 };
        let mut dock = DockState::default();
        let mut rect = RECT {
            left: 300,
            top: 0,
            right: 740,
            bottom: 100,
        };
        assert!(dock
            .tick(rect, cap, area, away, false, false, now, 20)
            .is_none());
        rect.left = 1480;
        rect.right = 1920;
        dock.tick(rect, cap, area, away, false, false, now, 20);
        dock.tick(rect, cap, area, away, false, false, now, 20);
        assert_eq!(
            dock.tick(
                rect,
                cap,
                area,
                away,
                false,
                false,
                now + Duration::from_millis(300),
                20
            ),
            Some((1870, 0))
        );
        assert!(dock.motion.is_none());
    }
}
