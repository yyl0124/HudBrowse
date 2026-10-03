#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app_settings;
mod browser;
mod captured;
mod desktop_launch;
mod geometry;
mod icons;
mod island_dock;
mod launcher;
mod models;
#[cfg(test)]
mod native_capture_lifecycle;
#[cfg(test)]
mod native_island;
#[cfg(test)]
mod native_smoke;
mod page_data;
mod session;
mod shell;
mod site_icons;
mod targets;
mod web_caption;
mod window_capture;
mod window_manager;
mod window_monitor;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{Manager, SystemTrayEvent};
use window_manager::WindowManager;

fn shutdown(app: &tauri::AppHandle) {
    static SHUTTING_DOWN: AtomicBool = AtomicBool::new(false);
    if SHUTTING_DOWN.swap(true, Ordering::AcqRel) {
        return;
    }
    if let Err(error) = session::save_session(app.clone()) {
        eprintln!("Session save failed: {}", error);
    }
    window_monitor::stop_all();
    if let Some(window) = app.get_window("main") {
        app.state::<shell::ShellState>().dock.stop(&window);
    }
    let originals = std::mem::take(&mut *app.state::<WindowManager>().originals.lock().unwrap());
    for (_, original) in originals {
        original.restore();
    }
}
fn handle_main_window_event(event: tauri::GlobalWindowEvent) {
    if event.window().label() == "main" {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
            api.prevent_close();
            if !app_settings::CLOSE_TO_TRAY.load(Ordering::Acquire) {
                let app = event.window().app_handle();
                shutdown(&app);
                app.exit(0);
                return;
            }
            event
                .window()
                .state::<shell::ShellState>()
                .dock
                .stop(event.window());
            if app_settings::TRAY_VISIBLE.load(Ordering::Acquire) {
                let _ = event.window().hide();
            } else {
                let _ = event.window().minimize();
            }
        }
    }
}
fn main() {
    let app = tauri::Builder::default()
        .manage(WindowManager::default())
        .manage(shell::ShellState::default())
        .system_tray(app_settings::tray())
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } if id == "quit" => {
                shutdown(app);
                app.exit(0);
            }
            SystemTrayEvent::MenuItemClick { .. } | SystemTrayEvent::LeftClick { .. } => {
                if let Some(window) = app.get_window("main") {
                    shell::reveal_main(app);
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .on_window_event(handle_main_window_event)
        .invoke_handler(tauri::generate_handler![
            targets::sync_targets,
            targets::resolve_target,
            targets::toggle_target,
            targets::show_target,
            targets::hide_target,
            targets::apply_target_settings,
            targets::remove_target,
            targets::get_target_states,
            session::save_session,
            session::load_session,
            app_settings::set_auto_start,
            app_settings::get_auto_start,
            app_settings::set_tray_visibility,
            app_settings::set_close_to_tray,
            app_settings::request_main_close,
            page_data::page_action,
            window_capture::enumerate_windows,
            icons::get_window_icon,
            site_icons::get_site_icon,
            shell::set_main_compact,
            shell::get_main_compact,
            shell::resize_main_window,
            shell::set_main_shape,
        ])
        .build(tauri::generate_context!())
        .expect("Failed to build HudBrowse");
    app.run(|app, event| {
        if let tauri::RunEvent::Exit = event {
            shutdown(app);
        }
    });
}
