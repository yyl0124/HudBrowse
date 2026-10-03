use crate::{
    geometry,
    models::{Position, Size, TargetState, UrlConfig, WindowSettings},
    window_capture::{self, WindowRect},
    window_manager::WindowManager,
    window_monitor,
};
use windows::Win32::{
    Foundation::{COLORREF, HWND},
    UI::WindowsAndMessaging::*,
};

pub struct OriginalWindow {
    identity: window_capture::WindowInfo,
    style: i32,
    alpha: u8,
    color: COLORREF,
    flags: LAYERED_WINDOW_ATTRIBUTES_FLAGS,
    topmost: bool,
}
impl OriginalWindow {
    fn capture(hwnd: isize) -> Result<Self, String> {
        unsafe {
            let identity = window_capture::get_window_info(HWND(hwnd))?;
            let style = GetWindowLongW(HWND(hwnd), GWL_EXSTYLE);
            let (mut alpha, mut color, mut flags) = (255, COLORREF(0), LWA_ALPHA);
            let _ = GetLayeredWindowAttributes(
                HWND(hwnd),
                Some(&mut color),
                Some(&mut alpha),
                Some(&mut flags),
            );
            Ok(Self {
                identity,
                style,
                alpha,
                color,
                flags,
                topmost: style & WS_EX_TOPMOST.0 as i32 != 0,
            })
        }
    }
    pub fn restore(&self) {
        let hwnd = self.identity.hwnd;
        if !window_capture::identity_matches(&self.identity) {
            return;
        }
        window_monitor::stop(hwnd);
        unsafe {
            SetWindowLongW(HWND(hwnd), GWL_EXSTYLE, self.style);
            if self.style & WS_EX_LAYERED.0 as i32 != 0 {
                let _ = SetLayeredWindowAttributes(HWND(hwnd), self.color, self.alpha, self.flags);
            }
            let _ = window_capture::set_captured_window_always_on_top(hwnd, self.topmost);
            // A newly launched window may have been captured before its first
            // ShowWindow. Replaying that hidden snapshot strands the user's app.
            // Release our visual effects, then expose any window we had hidden.
            if !IsWindowVisible(HWND(hwnd)).as_bool() {
                let _ = ShowWindow(HWND(hwnd), SW_SHOWNA);
            }
        }
    }
}

pub fn resolve(config: &mut UrlConfig, manager: &WindowManager) -> Result<isize, String> {
    if let Some(current) = manager
        .configs
        .lock()
        .unwrap()
        .get(&config.id)
        .and_then(|current| current.window_info.as_ref())
    {
        if let Some(input) = &config.window_info {
            if !window_capture::identity_matches(input)
                && window_capture::identity_matches(current)
                && input.exe_path == current.exe_path
                && input.class_name == current.class_name
                && input.title == current.title
            {
                config.window_info = Some(current.clone());
            }
        }
    }
    let info = config
        .window_info
        .as_ref()
        .ok_or("Missing window identity")?;
    let hwnd = if window_capture::identity_matches(info) {
        info.hwnd
    } else {
        let found = window_capture::smart_find_window(
            info.exe_path.clone(),
            Some(info.class_name.clone()),
            Some(info.title.clone()),
            Some(info.rect.clone()),
        )?
        .ok_or("目标程序未运行或窗口已关闭")?;
        let hwnd = found.hwnd;
        config.window_info = Some(found);
        hwnd
    };
    manager.remember(config.clone());
    Ok(hwnd)
}
pub fn remember_original(hwnd: isize, manager: &WindowManager) -> Result<(), String> {
    {
        let mut originals = manager.originals.lock().unwrap();
        if !originals
            .get(&hwnd)
            .is_some_and(|original| window_capture::identity_matches(&original.identity))
        {
            originals.insert(hwnd, OriginalWindow::capture(hwnd)?);
        }
    }
    Ok(())
}
pub fn apply(
    hwnd: isize,
    settings: &WindowSettings,
    manager: &WindowManager,
) -> Result<(), String> {
    settings.validate()?;
    remember_original(hwnd, manager)?;
    window_monitor::stop(hwnd);
    window_capture::set_captured_window_opacity(hwnd, settings.alpha())?;
    window_capture::set_captured_window_always_on_top(hwnd, settings.always_on_top)?;
    set_mouse_through(hwnd, settings.mouse_through)?;
    window_monitor::start(hwnd, settings)
}
pub fn set_mouse_through(hwnd: isize, enabled: bool) -> Result<(), String> {
    unsafe {
        if !IsWindow(HWND(hwnd)).as_bool() {
            return Err("Invalid window handle".into());
        }
        let style = GetWindowLongW(HWND(hwnd), GWL_EXSTYLE);
        SetWindowLongW(
            HWND(hwnd),
            GWL_EXSTYLE,
            if enabled {
                style | WS_EX_TRANSPARENT.0 as i32 | WS_EX_LAYERED.0 as i32
            } else {
                style & !(WS_EX_TRANSPARENT.0 as i32)
            },
        );
    }
    Ok(())
}
pub fn rect(hwnd: isize) -> Result<WindowRect, String> {
    if let Some(rect) = window_monitor::normal_rect(hwnd) {
        let current = window_capture::get_captured_window_rect(hwnd)?;
        return Ok(WindowRect {
            x: rect.left,
            y: rect.top,
            width: current.width,
            height: current.height,
        });
    }
    window_capture::get_captured_window_rect(hwnd)
}
pub fn place(hwnd: isize, config: &UrlConfig) -> Result<(), String> {
    let mut rect = window_capture::get_captured_window_rect(hwnd)?;
    if let Some(position) = &config.last_position {
        rect.x = position.x as i32;
        rect.y = position.y as i32;
    }
    if let Some(size) = &config.last_size {
        rect.width = size.width as i32;
        rect.height = size.height as i32;
    }
    window_capture::set_captured_window_rect(hwnd, rect.x, rect.y, rect.width, rect.height)?;
    let rect = geometry::clamp_rect(rect, geometry::work_area(hwnd)?);
    window_capture::set_captured_window_rect(hwnd, rect.x, rect.y, rect.width, rect.height)
}
pub fn state(config: &UrlConfig) -> TargetState {
    let info = match &config.window_info {
        Some(info) if window_capture::identity_matches(info) => info,
        _ => return TargetState::missing(config.id.clone()),
    };
    unsafe {
        let minimized = IsIconic(HWND(info.hwnd)).as_bool();
        let rect = rect(info.hwnd).ok();
        TargetState {
            id: config.id.clone(),
            exists: true,
            visible: IsWindowVisible(HWND(info.hwnd)).as_bool() && !minimized,
            minimized,
            position: if minimized {
                config.last_position.clone().or(Some(Position {
                    x: info.rect.x as f64,
                    y: info.rect.y as f64,
                }))
            } else {
                rect.as_ref().map(|r| Position {
                    x: r.x as f64,
                    y: r.y as f64,
                })
            },
            size: if minimized {
                config.last_size.clone().or(Some(Size {
                    width: info.rect.width as f64,
                    height: info.rect.height as f64,
                }))
            } else {
                rect.map(|r| Size {
                    width: r.width as f64,
                    height: r.height as f64,
                })
            },
            hwnd: Some(info.hwnd),
        }
    }
}
pub fn release(hwnd: isize, manager: &WindowManager) {
    window_monitor::stop(hwnd);
    if let Some(original) = manager.originals.lock().unwrap().remove(&hwnd) {
        original.restore();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::w;
    #[test]
    fn restores_opacity_topmost_and_original_styles() {
        unsafe {
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("STATIC"),
                w!("HudBrowse captured test"),
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
            let original_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            let manager = WindowManager::default();
            remember_original(hwnd.0, &manager).unwrap();
            let _ = ShowWindow(hwnd, SW_SHOWNA);
            assert!(IsWindowVisible(hwnd).as_bool());
            let mut settings = WindowSettings {
                opacity: 40.0,
                mouse_through: true,
                ..WindowSettings::default()
            };
            apply(hwnd.0, &settings, &manager).unwrap();
            assert_ne!(
                GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TRANSPARENT.0 as i32,
                0
            );
            settings.opacity = 100.0;
            settings.always_on_top = false;
            settings.mouse_through = false;
            apply(hwnd.0, &settings, &manager).unwrap();
            let mut alpha = 0;
            GetLayeredWindowAttributes(hwnd, None, Some(&mut alpha), None).unwrap();
            assert_eq!(alpha, 255);
            assert_eq!(
                GetWindowLongW(hwnd, GWL_EXSTYLE)
                    & (WS_EX_TRANSPARENT.0 as i32 | WS_EX_TOPMOST.0 as i32),
                0
            );
            release(hwnd.0, &manager);
            assert_eq!(GetWindowLongW(hwnd, GWL_EXSTYLE), original_style);
            assert!(
                IsWindowVisible(hwnd).as_bool(),
                "Releasing a capture must leave the user's program accessible"
            );
            let _ = DestroyWindow(hwnd);
        }
    }
}
