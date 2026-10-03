use crate::{
    browser, captured,
    models::{TargetState, UrlConfig},
    window_capture,
    window_manager::WindowManager,
    window_monitor,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn sync_targets(configs: Vec<UrlConfig>, app: AppHandle) -> Result<(), String> {
    for config in &configs {
        config.validate()?;
    }
    let manager = app.state::<WindowManager>();
    let mut next = std::collections::HashMap::new();
    for mut config in configs {
        if let Some(existing) = manager.configs.lock().unwrap().get(&config.id) {
            if let (Some(old), Some(new)) = (&existing.window_info, &config.window_info) {
                if old.exe_path == new.exe_path
                    && old.class_name == new.class_name
                    && old.title == new.title
                    && window_capture::identity_matches(old)
                    && !window_capture::identity_matches(new)
                {
                    config.window_info = Some(old.clone());
                }
            }
        }
        next.insert(config.id.clone(), config);
    }
    *manager.configs.lock().unwrap() = next;
    Ok(())
}
#[tauri::command]
pub fn resolve_target(mut config: UrlConfig, app: AppHandle) -> Result<UrlConfig, String> {
    config.validate()?;
    if config.kind == "window" {
        captured::resolve(&mut config, &app.state::<WindowManager>())?;
    }
    Ok(config)
}
pub fn target_state(config: &UrlConfig, manager: &WindowManager) -> TargetState {
    if config.kind == "window" {
        captured::state(config)
    } else {
        browser::state(&config.id, manager)
    }
}
#[tauri::command]
pub fn get_target_states(app: AppHandle) -> Vec<TargetState> {
    let manager = app.state::<WindowManager>();
    let states: Vec<_> = manager
        .configs()
        .iter()
        .map(|config| target_state(config, &manager))
        .collect();
    let mut configs = manager.configs.lock().unwrap();
    for state in &states {
        if state.exists && !state.minimized {
            if let Some(config) = configs.get_mut(&state.id) {
                config.last_position = state.position.clone().or(config.last_position.clone());
                config.last_size = state.size.clone().or(config.last_size.clone());
            }
        }
    }
    states
}
fn operate(
    mut config: UrlConfig,
    app: &AppHandle,
    force_show: bool,
) -> Result<TargetState, String> {
    config.validate()?;
    let manager = app.state::<WindowManager>();
    let _operation = manager.operation.lock().unwrap();
    let current = manager.configs.lock().unwrap().get(&config.id).cloned();
    if let Some(current) = current {
        let state = target_state(&current, &manager);
        if state.exists {
            config.last_position = if force_show {
                config.last_position.or(state.position)
            } else {
                state.position.or(config.last_position)
            };
            config.last_size = if force_show {
                config.last_size.or(state.size)
            } else {
                state.size.or(config.last_size)
            };
            if config.kind == "window" {
                config.window_info = current.window_info;
            }
        }
    }
    if config.kind == "window" {
        let (hwnd, launched) = crate::launcher::resolve_or_launch(&mut config, &manager)?;
        captured::remember_original(hwnd, &manager)?;
        let visible = captured::state(&config).visible;
        if !force_show && !launched && visible {
            window_monitor::stop(hwnd);
            let state = captured::state(&config);
            config.last_position = state.position;
            config.last_size = state.size;
            window_capture::toggle_captured_window(hwnd, false)?;
        } else {
            window_monitor::stop(hwnd);
            window_capture::toggle_captured_window(hwnd, true)?;
            captured::place(hwnd, &config)?;
            captured::apply(hwnd, &config.settings.clone().unwrap_or_default(), &manager)?;
        }
    } else if let Some(window) = manager.window(&config.id) {
        if !force_show
            && browser::state(&config.id, &manager).visible
            && !crate::web_caption::is_sleeping(&window)
        {
            browser::hide(&window)?;
            let state = browser::state(&config.id, &manager);
            config.last_position = state.position;
            config.last_size = state.size;
        } else {
            browser::show(&window, &config)?;
        }
    } else {
        browser::create(app, &config)?;
    }
    let state = target_state(&config, &manager);
    config.last_position = state.position.clone().or(config.last_position);
    config.last_size = state.size.clone().or(config.last_size);
    manager.remember(config);
    let _ = app.emit_all("target-state-changed", ());
    Ok(state)
}
#[tauri::command(async)]
pub fn toggle_target(config: UrlConfig, app: AppHandle) -> Result<TargetState, String> {
    operate(config, &app, false)
}
#[tauri::command(async)]
pub fn show_target(config: UrlConfig, app: AppHandle) -> Result<TargetState, String> {
    operate(config, &app, true)
}
#[tauri::command(async)]
pub fn hide_target(id: String, app: AppHandle) -> Result<TargetState, String> {
    let manager = app.state::<WindowManager>();
    let _operation = manager.operation.lock().unwrap();
    let mut config = manager
        .configs
        .lock()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or("配置不存在")?;
    // Resolving an existing capture is safe; hiding must never launch a program.
    if config.kind == "window" {
        match captured::resolve(&mut config, &manager) {
            Ok(hwnd) => {
                captured::remember_original(hwnd, &manager)?;
                window_monitor::stop(hwnd);
                let state = captured::state(&config);
                if state.exists && !state.minimized {
                    config.last_position = state.position;
                    config.last_size = state.size;
                }
                window_capture::toggle_captured_window(hwnd, false)?;
            }
            Err(error) if error.contains("多个窗口") => return Err(error),
            Err(_) => {}
        }
    } else if let Some(window) = manager.window(&id) {
        browser::hide(&window)?;
        let state = browser::state(&id, &manager);
        config.last_position = state.position.or(config.last_position);
        config.last_size = state.size.or(config.last_size);
    }
    let state = target_state(&config, &manager);
    manager.remember(config);
    let _ = app.emit_all("target-state-changed", ());
    Ok(state)
}
#[tauri::command]
pub fn apply_target_settings(mut config: UrlConfig, app: AppHandle) -> Result<TargetState, String> {
    config.validate()?;
    let manager = app.state::<WindowManager>();
    let previous = manager.configs.lock().unwrap().get(&config.id).cloned();
    if let (Some(old), Some(new)) = (
        previous.as_ref().and_then(|old| old.window_info.as_ref()),
        config.window_info.as_ref(),
    ) {
        if old.hwnd != new.hwnd && window_capture::identity_matches(new) {
            captured::release(old.hwnd, &manager);
        }
    }
    let size_changed = previous
        .as_ref()
        .and_then(|old| old.settings.as_ref())
        .zip(config.settings.as_ref())
        .is_some_and(|(old, new)| {
            old.default_width != new.default_width || old.default_height != new.default_height
        });
    if config.kind == "window" {
        match captured::resolve(&mut config, &manager) {
            Ok(hwnd) => {
                if captured::state(&config).visible {
                    captured::apply(hwnd, &config.settings.clone().unwrap_or_default(), &manager)?;
                    if size_changed {
                        window_monitor::stop(hwnd);
                        let rect = captured::rect(hwnd)?;
                        let settings = config.settings.clone().unwrap_or_default();
                        config.last_position = Some(crate::models::Position {
                            x: rect.x as f64,
                            y: rect.y as f64,
                        });
                        config.last_size = Some(crate::models::Size {
                            width: settings.default_width,
                            height: settings.default_height,
                        });
                        captured::place(hwnd, &config)?;
                        captured::apply(hwnd, &settings, &manager)?;
                    }
                }
            }
            Err(error) if error.contains("多个窗口") => return Err(error),
            Err(_) => {}
        }
    } else if let Some(window) = manager.window(&config.id) {
        window.set_title(&config.name).map_err(|e| e.to_string())?;
        if previous.as_ref().is_some_and(|old| old.url != config.url) {
            let url = serde_json::to_string(&config.url).map_err(|e| e.to_string())?;
            window
                .eval(&format!("location.href = {}", url))
                .map_err(|e| e.to_string())?;
        }
        browser::apply(&window, &config.settings.clone().unwrap_or_default())?;
        if size_changed {
            let settings = config.settings.clone().unwrap_or_default();
            window_monitor::stop(window.hwnd().map_err(|e| e.to_string())?.0);
            window
                .set_size(tauri::LogicalSize::new(
                    settings.default_width,
                    settings.default_height,
                ))
                .map_err(|e| e.to_string())?;
            let mut positioned = config.clone();
            positioned.last_size = None;
            positioned.last_position = browser::state(&config.id, &manager).position;
            browser::place(&window, &positioned)?;
            browser::apply(&window, &settings)?;
        }
    }
    manager.remember(config.clone());
    Ok(target_state(&config, &manager))
}
#[tauri::command]
pub fn remove_target(id: String, app: AppHandle) -> Result<(), String> {
    let manager = app.state::<WindowManager>();
    let config = manager.configs.lock().unwrap().get(&id).cloned();
    if let Some(config) = config {
        if config.kind == "window" {
            if let Some(info) = config.window_info {
                captured::release(info.hwnd, &manager);
            }
        } else if let Some(window) = manager.window(&id) {
            if let Ok(hwnd) = window.hwnd() {
                window_monitor::stop(hwnd.0);
            }
            window.close().map_err(|e| e.to_string())?;
            manager.windows.lock().unwrap().remove(&id);
        }
    }
    manager.configs.lock().unwrap().remove(&id);
    Ok(())
}
