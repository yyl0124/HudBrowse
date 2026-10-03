use serde::Deserialize;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalSize, Window};
use windows::Win32::{
    Foundation::{HWND, LPARAM, POINT, RECT, WPARAM},
    Graphics::Gdi::{ClientToScreen, CreatePolygonRgn, DeleteObject, SetWindowRgn, HRGN, WINDING},
    UI::{
        Input::KeyboardAndMouse::ReleaseCapture,
        WindowsAndMessaging::{GetWindowRect, PostMessageW, SC_SIZE, WM_SYSCOMMAND},
    },
};

#[derive(Default)]
pub struct ShellState {
    previous_size: Mutex<Option<PhysicalSize<u32>>>,
    pub dock: crate::island_dock::IslandDock,
}

#[derive(Clone, Deserialize)]
pub struct ShapePoint {
    pub x: f64,
    pub y: f64,
}

#[tauri::command]
pub fn set_main_shape(
    window: Window,
    points: Vec<ShapePoint>,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Only the main window may change its shape".into());
    }
    if !(1.0..=16384.0).contains(&width)
        || !(1.0..=16384.0).contains(&height)
        || !(4..=512).contains(&points.len())
    {
        return Err("Invalid window outline".into());
    }
    let hwnd = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    let size = window.inner_size().map_err(|e| e.to_string())?;
    // Minimize/restore produces transient zero-sized and very short client
    // rectangles. ResizeObserver can report one of those before WebView2 has
    // laid out the next frame; there is no useful region to apply then.
    if window.is_minimized().unwrap_or(false) || size.width == 0 || size.height == 0 {
        return Ok(());
    }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    // Ignore a stale resize message; its replacement is sent by ResizeObserver.
    if (size.width as f64 - width * scale).abs() > 2.0
        || (size.height as f64 - height * scale).abs() > 2.0
    {
        return Ok(());
    }
    if points.iter().any(|p| {
        !p.x.is_finite()
            || !p.y.is_finite()
            || p.x < 0.0
            || p.y < 0.0
            || p.x > width
            || p.y > height
    }) {
        return Err("Invalid window outline".into());
    }
    unsafe {
        let mut origin = POINT::default();
        let mut frame = RECT::default();
        ClientToScreen(hwnd, &mut origin)
            .ok()
            .map_err(|e| e.to_string())?;
        GetWindowRect(hwnd, &mut frame).map_err(|e| e.to_string())?;
        // SetWindowRgn is relative to the whole native frame, SVG to the WebView client.
        let mapped: Vec<_> = points
            .iter()
            .map(|p| POINT {
                x: (p.x * scale).round() as i32 + origin.x - frame.left,
                y: (p.y * scale).round() as i32 + origin.y - frame.top,
            })
            .collect();
        let region = CreatePolygonRgn(&mapped, WINDING);
        if region.0 == 0 {
            return Err("Failed to create window outline".into());
        }
        // Windows owns the region only after a successful SetWindowRgn call.
        if SetWindowRgn(hwnd, region, true) == 0 {
            let _ = DeleteObject(region);
            return Err("Failed to apply window region".into());
        }
    }
    Ok(())
}

pub fn clear_shape(window: &Window) {
    if window.label() == "main" {
        if let Ok(hwnd) = window.hwnd() {
            unsafe {
                SetWindowRgn(HWND(hwnd.0), HRGN(0), true);
            }
        }
    }
}

#[tauri::command]
pub fn get_main_compact(app: AppHandle) -> bool {
    app.state::<ShellState>()
        .previous_size
        .lock()
        .unwrap()
        .is_some()
}

#[tauri::command]
pub fn set_main_compact(compact: bool, app: AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window is unavailable")?;
    let state = app.state::<ShellState>();
    state.dock.stop(&window);
    let before = window.outer_position().map_err(|e| e.to_string())?;
    let before_width = window.outer_size().map_err(|e| e.to_string())?.width;
    if compact {
        if state.previous_size.lock().unwrap().is_some() {
            state.dock.start(&window)?;
            return Ok(());
        }
        if window.is_maximized().map_err(|e| e.to_string())? {
            window.unmaximize().map_err(|e| e.to_string())?;
        }
        let previous = window.inner_size().map_err(|e| e.to_string())?;
        window
            .set_min_size(None::<tauri::LogicalSize<f64>>)
            .map_err(|e| e.to_string())?;
        *state.previous_size.lock().unwrap() = Some(previous);
        let result = window
            .set_size(tauri::LogicalSize::new(440.0, 100.0))
            .and_then(|_| window.set_resizable(false))
            .and_then(|_| window.set_always_on_top(true));
        if let Err(error) = result {
            *state.previous_size.lock().unwrap() = None;
            let _ = window.set_resizable(true);
            let _ = window.set_size(previous);
            let _ = window.set_min_size(Some(tauri::LogicalSize::new(760.0, 560.0)));
            let _ = window.set_always_on_top(false);
            clear_shape(&window);
            return Err(error.to_string());
        }
    } else {
        let previous = *state.previous_size.lock().unwrap();
        if let Some(previous) = previous {
            window.set_resizable(true).map_err(|e| e.to_string())?;
            window.set_size(previous).map_err(|e| e.to_string())?;
            window
                .set_min_size(Some(tauri::LogicalSize::new(760.0, 560.0)))
                .map_err(|e| e.to_string())?;
            window.set_always_on_top(false).map_err(|e| e.to_string())?;
            *state.previous_size.lock().unwrap() = None;
        }
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    let mut current = crate::window_capture::get_captured_window_rect(hwnd)?;
    // The titlebar stays at the same top/center anchor across both modes.
    current.x = before.x + (before_width as i32 - current.width) / 2;
    current.y = before.y;
    let rect = crate::geometry::clamp_rect(current, crate::geometry::work_area(hwnd)?);
    crate::window_capture::set_captured_window_rect(hwnd, rect.x, rect.y, rect.width, rect.height)?;
    clear_shape(&window);
    if compact {
        state.dock.start(&window)?;
    }
    Ok(())
}

pub fn reveal_main(app: &AppHandle) {
    if let Some(window) = app.get_window("main") {
        let state = app.state::<ShellState>();
        state.dock.stop(&window);
        if state.previous_size.lock().unwrap().is_some() {
            let _ = state.dock.start(&window);
        }
    }
}

#[tauri::command]
pub fn resize_main_window(app: AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("Main window is unavailable")?;
    if window
        .state::<ShellState>()
        .previous_size
        .lock()
        .unwrap()
        .is_some()
        || window.is_maximized().map_err(|e| e.to_string())?
    {
        return Ok(());
    }
    unsafe {
        let _ = ReleaseCapture();
        PostMessageW(
            HWND(window.hwnd().map_err(|e| e.to_string())?.0),
            WM_SYSCOMMAND,
            WPARAM((SC_SIZE + 8) as usize),
            LPARAM(0),
        )
        .map_err(|e| e.to_string())
    }
}
