// 窗口捕获和控制模块
// 使用 Windows API 获取和控制桌面程序窗口

#![cfg(windows)]

use serde::{Deserialize, Serialize};
use std::mem;
use windows::core::PWSTR;
use windows::Win32::{
    Foundation::{HWND, LPARAM, RECT},
    System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    },
    UI::WindowsAndMessaging::*,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub hwnd: isize,
    pub title: String,
    pub class_name: String,
    pub process_id: u32,
    pub exe_path: String,
    pub rect: WindowRect,
    pub is_visible: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowRect {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

/// 获取窗口详细信息
pub fn get_window_info(hwnd: HWND) -> Result<WindowInfo, String> {
    unsafe {
        // 获取窗口标题
        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, &mut title_buf);
        let title = String::from_utf16_lossy(&title_buf[..title_len as usize]);

        // 获取窗口类名
        let mut class_buf = [0u16; 256];
        let class_len = GetClassNameW(hwnd, &mut class_buf);
        let class_name = String::from_utf16_lossy(&class_buf[..class_len as usize]);

        // 获取进程 ID
        let mut process_id = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));

        // 获取可执行文件路径
        let exe_path = get_process_path(process_id).unwrap_or_else(|_| "未知".to_string());

        // 获取窗口位置和大小
        let mut rect: RECT = mem::zeroed();
        GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;

        // 检查窗口是否可见
        let is_visible = IsWindowVisible(hwnd).as_bool();

        Ok(WindowInfo {
            hwnd: hwnd.0,
            title,
            class_name,
            process_id,
            exe_path,
            rect: WindowRect {
                x: rect.left,
                y: rect.top,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
            },
            is_visible,
        })
    }
}

/// 获取进程可执行文件路径
fn get_process_path(process_id: u32) -> Result<String, String> {
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id)
            .map_err(|e| e.to_string())?;

        let mut path_buf = [0u16; 1024];
        let mut size = path_buf.len() as u32;

        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR::from_raw(path_buf.as_mut_ptr()),
            &mut size,
        )
        .map_err(|e| e.to_string());

        let _ = windows::Win32::Foundation::CloseHandle(handle);
        result?;

        Ok(String::from_utf16_lossy(&path_buf[..size as usize]))
    }
}

pub fn process_is_running(exe_path: &str) -> bool {
    let mut ids = vec![0u32; 65536];
    let mut bytes = 0;
    unsafe {
        if windows::Win32::System::ProcessStatus::EnumProcesses(
            ids.as_mut_ptr(),
            (ids.len() * 4) as u32,
            &mut bytes,
        )
        .is_err()
        {
            // Avoid creating a duplicate when process enumeration fails.
            return true;
        }
    }
    ids[..bytes as usize / 4]
        .iter()
        .any(|id| get_process_path(*id).is_ok_and(|path| path.eq_ignore_ascii_case(exe_path)))
}

/// 显示/隐藏窗口
#[tauri::command]
pub fn toggle_captured_window(hwnd: isize, show: bool) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd);

        // 检查窗口是否有效
        if !IsWindow(hwnd).as_bool() {
            return Err("窗口句柄无效或窗口已关闭".to_string());
        }

        if show {
            ShowWindow(
                hwnd,
                if IsIconic(hwnd).as_bool() {
                    SW_RESTORE
                } else {
                    SW_SHOW
                },
            );
            // 将窗口置于前台
            SetForegroundWindow(hwnd);
        } else {
            ShowWindow(hwnd, SW_HIDE);
        }

        Ok(())
    }
}

/// 设置窗口位置和大小
#[tauri::command]
pub fn set_captured_window_rect(
    hwnd: isize,
    x: i32,
    y: i32,
    width: i32,
    height: i32,
) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd);

        if !IsWindow(hwnd).as_bool() {
            return Err("窗口句柄无效".to_string());
        }

        SetWindowPos(hwnd, HWND_TOP, x, y, width, height, SWP_NOZORDER)
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// 设置窗口透明度
#[tauri::command]
pub fn set_captured_window_opacity(hwnd: isize, opacity: u8) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd);

        if !IsWindow(hwnd).as_bool() {
            return Err("窗口句柄无效".to_string());
        }

        // 获取当前窗口扩展样式
        let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);

        // 添加分层窗口样式
        SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_LAYERED.0 as i32);

        // 设置透明度 (0-255)
        SetLayeredWindowAttributes(
            hwnd,
            windows::Win32::Foundation::COLORREF(0),
            opacity,
            LWA_ALPHA,
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// 设置窗口置顶
#[tauri::command]
pub fn set_captured_window_always_on_top(hwnd: isize, on_top: bool) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd);

        if !IsWindow(hwnd).as_bool() {
            return Err("窗口句柄无效".to_string());
        }

        let insert_after = if on_top { HWND_TOPMOST } else { HWND_NOTOPMOST };

        SetWindowPos(hwnd, insert_after, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE)
            .map_err(|e| e.to_string())?;

        Ok(())
    }
}

/// 获取窗口当前位置和大小
#[tauri::command]
pub fn get_captured_window_rect(hwnd: isize) -> Result<WindowRect, String> {
    unsafe {
        let hwnd = HWND(hwnd);

        if !IsWindow(hwnd).as_bool() {
            return Err("窗口句柄无效".to_string());
        }

        let mut rect: RECT = mem::zeroed();
        GetWindowRect(hwnd, &mut rect).map_err(|e| e.to_string())?;

        Ok(WindowRect {
            x: rect.left,
            y: rect.top,
            width: rect.right - rect.left,
            height: rect.bottom - rect.top,
        })
    }
}

/// 枚举所有可见的顶层窗口
#[tauri::command]
pub fn enumerate_windows() -> Result<Vec<WindowInfo>, String> {
    Ok(enumerate_all_windows()?
        .into_iter()
        .filter(|w| w.is_visible)
        .collect())
}

fn enumerate_all_windows() -> Result<Vec<WindowInfo>, String> {
    unsafe {
        let mut windows: Vec<WindowInfo> = Vec::new();

        // 定义回调函数
        unsafe extern "system" fn enum_callback(
            hwnd: HWND,
            lparam: LPARAM,
        ) -> windows::Win32::Foundation::BOOL {
            let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);

            // 只枚举可见的顶层窗口
            if IsWindow(hwnd).as_bool() {
                // 获取窗口标题长度
                let title_len = GetWindowTextLengthW(hwnd);
                if title_len > 0 {
                    if let Ok(info) = get_window_info(hwnd) {
                        // 过滤掉无标题和特殊窗口
                        if !info.title.is_empty() {
                            windows.push(info);
                        }
                    }
                }
            }

            windows::Win32::Foundation::BOOL(1) // 继续枚举
        }

        let lparam = LPARAM(&mut windows as *mut _ as isize);
        EnumWindows(Some(enum_callback), lparam).map_err(|e| e.to_string())?;

        Ok(windows)
    }
}

/// 智能查找窗口：优先匹配 exePath，如果有多个则使用 className 进一步筛选
#[tauri::command]
pub fn smart_find_window(
    exe_path: String,
    class_name: Option<String>,
    title: Option<String>,
    reference_rect: Option<WindowRect>,
) -> Result<Option<WindowInfo>, String> {
    let all_windows = enumerate_all_windows()?;

    // 第一步：通过 exePath 过滤
    let matched_windows: Vec<WindowInfo> = all_windows
        .into_iter()
        .filter(|w| {
            w.exe_path.eq_ignore_ascii_case(&exe_path)
                && class_name
                    .as_ref()
                    .is_none_or(|class| &w.class_name == class)
        })
        .collect();

    if matched_windows.is_empty() {
        return Ok(None);
    }

    // A restarted application can expose two top-level windows with the same
    // executable, class and title (for example a hidden host plus its main
    // window). Use the saved geometry as the final discriminator before
    // asking the user to reselect.
    select_candidate_with_reference(matched_windows, title.as_deref(), reference_rect.as_ref())
}

fn select_candidate_with_reference(
    windows: Vec<WindowInfo>,
    title: Option<&str>,
    reference: Option<&WindowRect>,
) -> Result<Option<WindowInfo>, String> {
    if windows.len() <= 1 {
        return Ok(windows.into_iter().next());
    }
    let exact: Vec<_> = title
        .filter(|value| !value.is_empty())
        .map(|value| {
            windows
                .iter()
                .filter(|window| window.title == value)
                .cloned()
                .collect()
        })
        .unwrap_or_default();
    if exact.len() == 1 {
        return Ok(exact.into_iter().next());
    }
    let candidates = if exact.len() > 1 { exact } else { windows };
    let Some(reference) = reference else {
        return Err("匹配到多个窗口，请重新选择目标窗口".into());
    };
    let distance = |window: &WindowInfo| {
        (i64::from(window.rect.width) - i64::from(reference.width)).abs()
            + (i64::from(window.rect.height) - i64::from(reference.height)).abs()
    };
    let mut ranked = candidates;
    ranked.sort_by_key(|window| distance(window));
    if ranked.len() >= 2 && distance(&ranked[0]) == distance(&ranked[1]) {
        return Err("匹配到多个窗口，请重新选择目标窗口".into());
    }
    Ok(ranked.into_iter().next())
}

pub fn identity_matches(info: &WindowInfo) -> bool {
    // Do not read the title here: GetWindowTextW sends WM_GETTEXT for windows
    // in this process and would block a monitor while the UI joins that worker.
    unsafe {
        let hwnd = HWND(info.hwnd);
        let mut process_id = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        if process_id == 0 || process_id != info.process_id {
            return false;
        }
        let mut class = [0u16; 256];
        let length = GetClassNameW(hwnd, &mut class);
        length > 0
            && String::from_utf16_lossy(&class[..length as usize]) == info.class_name
            && get_process_path(process_id)
                .is_ok_and(|path| path.eq_ignore_ascii_case(&info.exe_path))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn identity_check_does_not_require_the_owner_thread_to_pump_messages() {
        unsafe {
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                windows::core::w!("STATIC"),
                windows::core::w!("Identity fixture"),
                WS_POPUP,
                0,
                0,
                100,
                100,
                None,
                None,
                None,
                None,
            );
            let info = get_window_info(hwnd).unwrap();
            let (sender, receiver) = std::sync::mpsc::channel();
            let worker = std::thread::spawn(move || {
                let _ = sender.send(identity_matches(&info));
            });
            let result = receiver.recv_timeout(std::time::Duration::from_secs(1));
            DestroyWindow(hwnd).unwrap();
            assert_eq!(result, Ok(true));
            worker.join().unwrap();
        }
    }
    fn candidate(hwnd: isize, title: &str) -> WindowInfo {
        WindowInfo {
            hwnd,
            title: title.into(),
            class_name: "Example".into(),
            process_id: 1,
            exe_path: "example.exe".into(),
            is_visible: true,
            rect: WindowRect {
                x: 0,
                y: 0,
                width: 800,
                height: 600,
            },
        }
    }
    #[test]
    fn ambiguity_requires_explicit_selection() {
        assert!(select_candidate_with_reference(
            vec![candidate(1, "A"), candidate(2, "B")],
            None,
            None
        )
        .is_err());
        assert!(select_candidate_with_reference(
            vec![candidate(1, "A"), candidate(2, "A")],
            Some("A"),
            None
        )
        .is_err());
    }
    #[test]
    fn exact_title_identifies_a_unique_candidate() {
        assert_eq!(
            select_candidate_with_reference(
                vec![candidate(1, "A"), candidate(2, "B")],
                Some("B"),
                None
            )
            .unwrap()
            .unwrap()
            .hwnd,
            2
        );
        assert!(select_candidate_with_reference(Vec::new(), None, None)
            .unwrap()
            .is_none());
    }

    #[test]
    fn geometry_breaks_a_same_title_tie_after_restart() {
        let mut small = candidate(1, "A");
        small.rect.width = 320;
        small.rect.height = 240;
        let mut main = candidate(2, "A");
        main.rect.width = 1280;
        main.rect.height = 800;
        let reference = WindowRect {
            x: 0,
            y: 0,
            width: 1270,
            height: 790,
        };
        assert_eq!(
            select_candidate_with_reference(vec![small, main], Some("A"), Some(&reference))
                .unwrap()
                .unwrap()
                .hwnd,
            2
        );
    }
}
