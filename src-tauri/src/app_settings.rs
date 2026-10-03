use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayMenu, SystemTrayMenuItem};
use winreg::{
    enums::{HKEY_CURRENT_USER, KEY_QUERY_VALUE},
    RegKey,
};

pub static TRAY_VISIBLE: AtomicBool = AtomicBool::new(true);
pub static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);

#[tauri::command]
pub fn set_close_to_tray(enabled: bool) {
    CLOSE_TO_TRAY.store(enabled, Ordering::Release);
}

// Tauri 1's Window::close destroys directly; WM_CLOSE follows CloseRequested.
#[tauri::command]
pub fn request_main_close(app: AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("主窗口不存在")?;
    unsafe {
        windows::Win32::UI::WindowsAndMessaging::PostMessageW(
            windows::Win32::Foundation::HWND(window.hwnd().map_err(|e| e.to_string())?.0),
            windows::Win32::UI::WindowsAndMessaging::WM_CLOSE,
            windows::Win32::Foundation::WPARAM(0),
            windows::Win32::Foundation::LPARAM(0),
        )
        .map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn set_tray_visibility(visible: bool, app: AppHandle) -> Result<(), String> {
    if !visible {
        if let Some(window) = app.get_window("main") {
            window.show().map_err(|e| e.to_string())?;
            window.unminimize().map_err(|e| e.to_string())?;
        }
    }
    if visible != TRAY_VISIBLE.load(Ordering::Acquire) {
        if visible {
            tray().build(&app).map_err(|e| e.to_string())?;
        } else if let Some(handle) = app.tray_handle_by_id("hudbrowse") {
            handle.destroy().map_err(|e| e.to_string())?;
        }
    }
    TRAY_VISIBLE.store(visible, Ordering::Release);
    Ok(())
}
pub fn tray() -> SystemTray {
    SystemTray::new().with_id("hudbrowse").with_menu(
        SystemTrayMenu::new()
            .add_item(CustomMenuItem::new("show", "打开 HudBrowse"))
            .add_native_item(SystemTrayMenuItem::Separator)
            .add_item(CustomMenuItem::new("quit", "退出")),
    )
}
#[tauri::command]
pub fn set_auto_start(enable: bool) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let (key, _) = hkcu
        .create_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Run")
        .map_err(|e| e.to_string())?;
    if enable {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        key.set_value("HudBrowse", &format!("\"{}\"", exe.display()))
            .map_err(|e| e.to_string())?;
    } else {
        match key.delete_value("HudBrowse") {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.to_string()),
        }
    }
    Ok(())
}
#[tauri::command]
pub fn get_auto_start() -> Result<bool, String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    match hkcu.open_subkey_with_flags(
        "Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        KEY_QUERY_VALUE,
    ) {
        Ok(key) => Ok(key.get_value::<String, _>("HudBrowse").is_ok()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error.to_string()),
    }
}
