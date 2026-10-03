use crate::{
    captured, geometry,
    models::{Position, Size, TargetState, UrlConfig, WindowSettings},
    window_capture::WindowRect,
    window_manager::WindowManager,
    window_monitor,
};
use tauri::{AppHandle, Manager, Window, WindowBuilder, WindowUrl};

pub fn create(app: &AppHandle, config: &UrlConfig) -> Result<Window, String> {
    config.validate()?;
    if config.kind != "url" {
        return Err("Captured windows cannot create a WebView".into());
    }
    let settings = config.settings.clone().unwrap_or_default();
    let data_dir = app
        .path_resolver()
        .app_data_dir()
        .ok_or("Missing app data directory")?
        .join("webview_data")
        .join(&config.id);
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;
    let window = WindowBuilder::new(
        app,
        &config.id,
        WindowUrl::External(
            config
                .url
                .parse()
                .map_err(|e: url::ParseError| e.to_string())?,
        ),
    )
    .title(&config.name)
    .inner_size(settings.default_width, settings.default_height)
    .resizable(true)
    .decorations(false)
    .min_inner_size(200.0, 200.0)
    .always_on_top(settings.always_on_top)
    .data_directory(data_dir)
    .build()
    .map_err(|e| e.to_string())?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    if let Err(error) = crate::web_caption::install(&window)
        .and_then(|_| place(&window, config))
        .and_then(|_| apply(&window, &settings))
    {
        window_monitor::stop(hwnd);
        let _ = window.close();
        return Err(error);
    }
    app.state::<WindowManager>()
        .windows
        .lock()
        .unwrap()
        .insert(config.id.clone(), window.clone());
    let id = config.id.clone();
    let app_handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            window_monitor::stop(hwnd);
            app_handle
                .state::<WindowManager>()
                .windows
                .lock()
                .unwrap()
                .remove(&id);
        }
        let _ = app_handle.emit_all("target-state-changed", ());
    });
    Ok(window)
}
pub fn apply(window: &Window, settings: &WindowSettings) -> Result<(), String> {
    settings.validate()?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    window_monitor::stop(hwnd);
    crate::window_capture::set_captured_window_opacity(hwnd, settings.alpha())?;
    captured::set_mouse_through(hwnd, settings.mouse_through)?;
    window
        .set_always_on_top(settings.always_on_top)
        .map_err(|e| e.to_string())?;
    if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
        window_monitor::start(hwnd, settings)?;
    }
    Ok(())
}
pub fn place(window: &Window, config: &UrlConfig) -> Result<(), String> {
    if let Some(size) = &config.last_size {
        window
            .set_size(tauri::PhysicalSize::new(
                size.width as u32,
                size.height as u32,
            ))
            .map_err(|e| e.to_string())?;
    }
    if let Some(position) = &config.last_position {
        window
            .set_position(tauri::PhysicalPosition::new(
                position.x as i32,
                position.y as i32,
            ))
            .map_err(|e| e.to_string())?;
    }
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    let rect = geometry::clamp_rect(
        crate::window_capture::get_captured_window_rect(hwnd)?,
        geometry::work_area(hwnd)?,
    );
    crate::window_capture::set_captured_window_rect(hwnd, rect.x, rect.y, rect.width, rect.height)
}
pub fn hide(window: &Window) -> Result<(), String> {
    let hwnd = window.hwnd().map_err(|e| e.to_string())?.0;
    window_monitor::stop(hwnd);
    window.hide().map_err(|e| e.to_string())
}
pub fn show(window: &Window, config: &UrlConfig) -> Result<(), String> {
    crate::web_caption::wake(window);
    window.unminimize().map_err(|e| e.to_string())?;
    window.show().map_err(|e| e.to_string())?;
    place(window, config)?;
    apply(window, &config.settings.clone().unwrap_or_default())?;
    window.set_focus().map_err(|e| e.to_string())
}
pub fn state(id: &str, manager: &WindowManager) -> TargetState {
    let window = match manager.window(id) {
        Some(window) => window,
        None => return TargetState::missing(id.into()),
    };
    let hwnd = window.hwnd().ok().map(|h| h.0);
    let rect: Option<WindowRect> = hwnd.and_then(|h| captured::rect(h).ok());
    let minimized = window.is_minimized().unwrap_or(false);
    let cached = manager.configs.lock().unwrap().get(id).cloned();
    TargetState {
        id: id.into(),
        exists: true,
        visible: window.is_visible().unwrap_or(false) && !minimized,
        minimized,
        position: if minimized {
            cached
                .as_ref()
                .and_then(|config| config.last_position.clone())
        } else {
            rect.as_ref().map(|r| Position {
                x: r.x as f64,
                y: r.y as f64,
            })
        },
        size: if minimized {
            cached.and_then(|config| config.last_size)
        } else {
            window.inner_size().ok().map(|size| Size {
                width: size.width as f64,
                height: size.height as f64,
            })
        },
        hwnd,
    }
}
