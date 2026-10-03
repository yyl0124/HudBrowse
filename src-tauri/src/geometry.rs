use crate::window_capture::WindowRect;
use windows::Win32::{
    Foundation::{HWND, RECT},
    Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST},
};

pub fn work_area(hwnd: isize) -> Result<RECT, String> {
    unsafe {
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(
            MonitorFromWindow(HWND(hwnd), MONITOR_DEFAULTTONEAREST),
            &mut info,
        )
        .as_bool()
        {
            return Err("Unable to query monitor work area".into());
        }
        Ok(info.rcWork)
    }
}
pub fn clamp_rect(mut rect: WindowRect, area: RECT) -> WindowRect {
    rect.width = rect.width.min(area.right - area.left).max(1);
    rect.height = rect.height.min(area.bottom - area.top).max(1);
    rect.x = rect.x.clamp(area.left, area.right - rect.width);
    rect.y = rect.y.clamp(area.top, area.bottom - rect.height);
    rect
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn supports_negative_monitor_coordinates() {
        let area = RECT {
            left: -3840,
            top: -100,
            right: 0,
            bottom: 2060,
        };
        let rect = clamp_rect(
            WindowRect {
                x: -3800,
                y: 0,
                width: 800,
                height: 600,
            },
            area,
        );
        assert_eq!(rect.x, -3800);
        let rect = clamp_rect(
            WindowRect {
                x: -4200,
                y: -300,
                width: 5000,
                height: 3000,
            },
            area,
        );
        assert_eq!(
            (rect.x, rect.y, rect.width, rect.height),
            (-3840, -100, 3840, 2160)
        );
    }
}
