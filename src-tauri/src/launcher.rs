//! Launch only on an explicit show/toggle request, never while polling or applying settings.
use crate::{captured, models::UrlConfig, window_capture, window_manager::WindowManager};
use std::{
    path::Path,
    thread,
    time::{Duration, Instant},
};

pub fn resolve_or_launch(
    config: &mut UrlConfig,
    manager: &WindowManager,
) -> Result<(isize, bool), String> {
    // Preserve ambiguity errors; launching another instance cannot resolve them.
    match captured::resolve(config, manager) {
        Ok(hwnd) => return Ok((hwnd, false)),
        Err(error) if error != "目标程序未运行或窗口已关闭" => return Err(error),
        Err(_) => {}
    }
    let info = config
        .window_info
        .clone()
        .ok_or("缺少程序信息，请重新捕获窗口")?;
    let path = Path::new(&info.exe_path);
    if !path.is_absolute()
        || !path.is_file()
        || path
            .extension()
            .is_none_or(|e| !e.eq_ignore_ascii_case("exe"))
    {
        return Err("程序路径不存在或不是可执行文件，请重新捕获窗口".into());
    }
    if std::env::current_exe().ok().as_deref() == Some(path) {
        return Err("无法将 HudBrowse 自身作为启动目标".into());
    }
    if !window_capture::process_is_running(&info.exe_path) {
        crate::desktop_launch::launch(path)
            .map_err(|error| format!("无法启动 {}：{}", config.name, error))?;
    }
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        match captured::resolve(config, manager) {
            Ok(hwnd) => return Ok((hwnd, true)),
            Err(error) if error.contains("多个窗口") => return Err(error),
            Err(_) => {}
        }
        if Instant::now() >= deadline {
            return Err("程序已启动，但未找到对应窗口；请打开其主窗口或重新选择目标".into());
        }
        thread::sleep(Duration::from_millis(150));
    }
}
