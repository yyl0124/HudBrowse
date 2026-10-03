use crate::{geometry::work_area, models::WindowSettings};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use windows::Win32::{
    Foundation::{COLORREF, HWND, POINT, RECT},
    UI::WindowsAndMessaging::*,
};

struct Monitor {
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
    docked_rect: Arc<Mutex<Option<RECT>>>,
    alpha: u8,
    identity: crate::window_capture::WindowInfo,
}
lazy_static::lazy_static! {
    static ref MONITORS: Mutex<HashMap<isize, Monitor>> = Mutex::new(HashMap::new());
}

struct Slide {
    from: (i32, i32),
    to: (i32, i32),
    began: Instant,
}
impl Slide {
    fn new(rect: RECT, to: (i32, i32)) -> Self {
        Self {
            from: (rect.left, rect.top),
            to,
            began: Instant::now(),
        }
    }
    fn position(&self, elapsed: Duration) -> ((i32, i32), bool) {
        let t = (elapsed.as_secs_f64() / 0.22).clamp(0.0, 1.0);
        let eased = 1.0 - (1.0 - t).powi(3);
        let interpolate =
            |from: i32, to: i32| (from as f64 + (to as f64 - from as f64) * eased).round() as i32;
        (
            (
                interpolate(self.from.0, self.to.0),
                interpolate(self.from.1, self.to.1),
            ),
            t >= 1.0,
        )
    }
    unsafe fn tick(&self, hwnd: HWND) -> bool {
        let ((x, y), finished) = self.position(self.began.elapsed());
        let _ = SetWindowPos(
            hwnd,
            HWND_TOP,
            x,
            y,
            0,
            0,
            SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER | SWP_ASYNCWINDOWPOS,
        );
        finished
    }
}

pub fn start(hwnd: isize, settings: &WindowSettings) -> Result<(), String> {
    stop(hwnd);
    settings.validate()?;
    if !settings.auto_hide_on_edge && !settings.hide_on_mouse_leave {
        return Ok(());
    }
    let identity = crate::window_capture::get_window_info(HWND(hwnd))?;
    let window_identity = identity.clone();
    let stop = Arc::new(AtomicBool::new(false));
    let docked_rect = Arc::new(Mutex::new(None::<RECT>));
    let cancelled = stop.clone();
    let saved_rect = docked_rect.clone();
    let settings = settings.clone();
    let alpha = settings.alpha();
    let handle = thread::spawn(move || unsafe {
        let hwnd = HWND(hwnd);
        let mut edge: Option<u8> = None;
        let mut popped = false;
        let mut slide: Option<Slide> = None;
        let mut inside_before: Option<bool> = None;
        while !cancelled.load(Ordering::Acquire) {
            thread::sleep(Duration::from_millis(if slide.is_some() { 16 } else { 50 }));
            if cancelled.load(Ordering::Acquire)
                || !crate::window_capture::identity_matches(&window_identity)
            {
                break;
            }
            if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
                continue;
            }
            if slide.as_ref().is_some_and(|motion| motion.tick(hwnd)) {
                slide = None;
                if popped {
                    *saved_rect.lock().unwrap() = None;
                }
            }
            let mut rect = RECT::default();
            let mut cursor = POINT::default();
            if GetWindowRect(hwnd, &mut rect).is_err() || GetCursorPos(&mut cursor).is_err() {
                continue;
            }
            let inside = cursor.x >= rect.left
                && cursor.x < rect.right
                && cursor.y >= rect.top
                && cursor.y < rect.bottom;
            if settings.hide_on_mouse_leave {
                if inside_before != Some(inside) {
                    let _ = SetLayeredWindowAttributes(
                        hwnd,
                        COLORREF(0),
                        if inside { alpha } else { 0 },
                        LWA_ALPHA,
                    );
                    inside_before = Some(inside);
                }
                continue;
            }
            let area = match work_area(hwnd.0) {
                Ok(area) => area,
                Err(_) => continue,
            };
            let width = rect.right - rect.left;
            let height = rect.bottom - rect.top;
            if edge.is_none() {
                edge = if (rect.left - area.left).abs() <= 5 {
                    Some(0)
                } else if (rect.right - area.right).abs() <= 5 {
                    Some(1)
                } else if (rect.top - area.top).abs() <= 5 {
                    Some(2)
                } else if (rect.bottom - area.bottom).abs() <= 5 {
                    Some(3)
                } else {
                    None
                };
                if edge.is_some() {
                    popped = true;
                }
            }
            if let Some(side) = edge {
                let near = match side {
                    0 => {
                        (cursor.x - area.left).abs() <= 20
                            && cursor.y >= rect.top
                            && cursor.y <= rect.bottom
                    }
                    1 => {
                        (cursor.x - area.right).abs() <= 20
                            && cursor.y >= rect.top
                            && cursor.y <= rect.bottom
                    }
                    2 => {
                        (cursor.y - area.top).abs() <= 20
                            && cursor.x >= rect.left
                            && cursor.x <= rect.right
                    }
                    _ => {
                        (cursor.y - area.bottom).abs() <= 20
                            && cursor.x >= rect.left
                            && cursor.x <= rect.right
                    }
                };
                let distance = match side {
                    0 => rect.left - area.left,
                    1 => area.right - rect.right,
                    2 => rect.top - area.top,
                    _ => area.bottom - rect.bottom,
                };
                if popped && slide.is_none() && distance > 20 {
                    edge = None;
                    *saved_rect.lock().unwrap() = None;
                    continue;
                }
                if !popped && near {
                    let normal = *saved_rect.lock().unwrap();
                    if let Some(normal) = normal {
                        slide = Some(Slide::new(rect, (normal.left, normal.top)));
                    }
                    popped = true;
                } else if popped && !inside && !near {
                    let normal = {
                        let mut saved = saved_rect.lock().unwrap();
                        *saved.get_or_insert(rect)
                    };
                    let (x, y) = match side {
                        0 => (area.left - width + 2, normal.top),
                        1 => (area.right - 2, normal.top),
                        2 => (normal.left, area.top - height + 2),
                        _ => (normal.left, area.bottom - 2),
                    };
                    slide = Some(Slide::new(rect, (x, y)));
                    popped = false;
                }
            }
        }
        // Queue restoration after this worker's pending animation positions. The
        // UI thread may be joining us, so a synchronous move here would deadlock.
        if cancelled.load(Ordering::Acquire)
            && crate::window_capture::identity_matches(&window_identity)
        {
            if let Some(normal) = *saved_rect.lock().unwrap() {
                let _ = SetWindowPos(
                    hwnd,
                    HWND_TOP,
                    normal.left,
                    normal.top,
                    0,
                    0,
                    SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER | SWP_ASYNCWINDOWPOS,
                );
            }
        }
    });
    MONITORS.lock().unwrap().insert(
        hwnd,
        Monitor {
            stop,
            handle: Some(handle),
            docked_rect,
            alpha,
            identity,
        },
    );
    Ok(())
}

pub fn normal_rect(hwnd: isize) -> Option<RECT> {
    MONITORS
        .lock()
        .unwrap()
        .get(&hwnd)
        .and_then(|monitor| *monitor.docked_rect.lock().unwrap())
}
pub fn stop(hwnd: isize) {
    let monitor = MONITORS.lock().unwrap().remove(&hwnd);
    if let Some(mut monitor) = monitor {
        monitor.stop.store(true, Ordering::Release);
        if let Some(handle) = monitor.handle.take() {
            let _ = handle.join();
        }
        unsafe {
            let hwnd = HWND(hwnd);
            if crate::window_capture::identity_matches(&monitor.identity) {
                if let Some(rect) = *monitor.docked_rect.lock().unwrap() {
                    let _ = SetWindowPos(
                        hwnd,
                        HWND_TOP,
                        rect.left,
                        rect.top,
                        0,
                        0,
                        SWP_NOSIZE | SWP_NOACTIVATE | SWP_NOZORDER,
                    );
                }
                let _ = SetLayeredWindowAttributes(hwnd, COLORREF(0), monitor.alpha, LWA_ALPHA);
            }
        }
    }
}
pub fn stop_all() {
    let handles: Vec<_> = MONITORS.lock().unwrap().keys().copied().collect();
    for hwnd in handles {
        stop(hwnd);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::w;
    #[test]
    fn slides_through_intermediate_positions_and_reverses_without_jumping() {
        let rect = RECT {
            left: -1920,
            top: 20,
            right: -1520,
            bottom: 320,
        };
        let hide = Slide::new(rect, (-2318, 20));
        assert_eq!(hide.position(Duration::ZERO), ((-1920, 20), false));
        let ((x, y), finished) = hide.position(Duration::from_millis(90));
        assert!(!finished && x < -1920 && x > -2318);
        let show = Slide::new(
            RECT {
                left: x,
                top: y,
                ..rect
            },
            (-1920, 20),
        );
        assert_eq!(show.position(Duration::ZERO).0, (x, y));
        assert!(show.position(Duration::from_millis(90)).0 .0 > x);
        assert_eq!(
            show.position(Duration::from_millis(220)),
            ((-1920, 20), true)
        );
        assert_eq!(hide.position(Duration::from_secs(1)), ((-2318, 20), true));
    }
    #[test]
    fn animation_moves_a_real_native_window_through_intermediate_positions() {
        unsafe {
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("Slide fixture"),
                WS_POPUP,
                100,
                100,
                400,
                300,
                None,
                None,
                None,
                None,
            );
            assert_ne!(hwnd.0, 0);
            let mut motion = Slide::new(
                RECT {
                    left: 100,
                    top: 100,
                    right: 500,
                    bottom: 400,
                },
                (-298, 100),
            );
            motion.began = Instant::now() - Duration::from_millis(80);
            assert!(!motion.tick(hwnd));
            let mut rect = RECT::default();
            GetWindowRect(hwnd, &mut rect).unwrap();
            assert!(
                rect.left < 100 && rect.left > -298,
                "Expected intermediate position: {}",
                rect.left
            );
            motion.began = Instant::now() - Duration::from_millis(250);
            assert!(motion.tick(hwnd));
            GetWindowRect(hwnd, &mut rect).unwrap();
            assert_eq!(rect.left, -298);
            DestroyWindow(hwnd).unwrap();
        }
    }
    #[test]
    fn replaces_and_joins_monitors_even_when_the_window_is_hidden() {
        unsafe {
            let hwnd = CreateWindowExW(
                WS_EX_LAYERED,
                w!("STATIC"),
                w!("HudBrowse monitor test"),
                WS_OVERLAPPEDWINDOW,
                100,
                100,
                400,
                300,
                None,
                None,
                None,
                None,
            );
            assert_ne!(hwnd.0, 0);
            let settings = WindowSettings {
                auto_hide_on_edge: true,
                ..WindowSettings::default()
            };
            let began = std::time::Instant::now();
            for _ in 0..5 {
                start(hwnd.0, &settings).unwrap();
            }
            assert_eq!(MONITORS.lock().unwrap().len(), 1);
            stop(hwnd.0);
            assert!(MONITORS.lock().unwrap().is_empty());
            assert!(began.elapsed() < Duration::from_secs(2));
            let _ = DestroyWindow(hwnd);
        }
    }
}
