use crate::{
    models::{UrlConfig, WindowSettings},
    page_data, session, shell, targets, window_capture,
    window_manager::WindowManager,
};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::Manager;
use webview2_com::{GetCookiesCompletedHandler, Microsoft::Web::WebView2::Win32::ICoreWebView2_2};
use windows::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, GetLayeredWindowAttributes, GetWindowLongW,
        IsWindowVisible, GWL_EXSTYLE, WINDOW_EX_STYLE, WS_EX_TOPMOST, WS_EX_TRANSPARENT,
        WS_OVERLAPPEDWINDOW,
    },
};
use windows_legacy::core::{Interface, HSTRING};

struct Watchdog(Arc<AtomicBool>);
impl Watchdog {
    fn start() -> Self {
        let stopped = Arc::new(AtomicBool::new(false));
        let flag = stopped.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_secs(30));
            if !flag.load(Ordering::Acquire) {
                eprintln!("Native IPC regression timed out");
                std::process::exit(1);
            }
        });
        Self(stopped)
    }
}
impl Drop for Watchdog {
    fn drop(&mut self) {
        self.0.store(true, Ordering::Release);
    }
}

pub(super) fn pump<T>(app: &mut tauri::App, receiver: mpsc::Receiver<T>) -> T {
    let deadline = Instant::now() + Duration::from_secs(20);
    loop {
        app.run_iteration();
        if let Ok(value) = receiver.try_recv() {
            return value;
        }
        assert!(Instant::now() < deadline, "Native workflow timed out");
        thread::sleep(Duration::from_millis(10));
    }
}

pub(super) fn regression_app() -> tauri::App {
    let mut context = tauri::generate_context!();
    context.config_mut().tauri.windows.clear();
    context.config_mut().tauri.bundle.identifier =
        format!("com.hudbrowse.regression.{}", std::process::id());
    tauri::Builder::default()
        .any_thread()
        .manage(WindowManager::default())
        .manage(shell::ShellState::default())
        .on_window_event(crate::handle_main_window_event)
        .build(context)
        .unwrap()
}

fn capture_window(window: &tauri::Window, name: &str) {
    use windows::Win32::{
        Foundation::RECT,
        Graphics::Gdi::*,
        Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS},
        UI::WindowsAndMessaging::GetWindowRect,
    };
    unsafe {
        let hwnd = HWND(window.hwnd().unwrap().0);
        let mut rect = RECT::default();
        GetWindowRect(hwnd, &mut rect).unwrap();
        let (width, height) = (rect.right - rect.left, rect.bottom - rect.top);
        let dc = GetDC(hwnd);
        let memory = CreateCompatibleDC(dc);
        let bitmap = CreateCompatibleBitmap(dc, width, height);
        let previous = SelectObject(memory, bitmap);
        assert!(PrintWindow(hwnd, memory, PRINT_WINDOW_FLAGS(2)).as_bool());
        SelectObject(memory, previous);
        let mut info = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut pixels = vec![0u8; (width * height * 4) as usize];
        assert_ne!(
            GetDIBits(
                memory,
                bitmap,
                0,
                height as u32,
                Some(pixels.as_mut_ptr().cast()),
                &mut info,
                DIB_RGB_COLORS
            ),
            0
        );
        DeleteObject(bitmap);
        DeleteDC(memory);
        ReleaseDC(hwnd, dc);
        for pixel in pixels.chunks_exact_mut(4) {
            pixel.swap(0, 2);
            pixel[3] = 255;
        }
        let directory = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../test-results");
        std::fs::create_dir_all(&directory).unwrap();
        let file = std::fs::File::create(directory.join(name)).unwrap();
        let mut encoder = png::Encoder::new(file, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder
            .write_header()
            .unwrap()
            .write_image_data(&pixels)
            .unwrap();
    }
}

pub(super) fn script(app: &mut tauri::App, window: &tauri::Window, source: &str) -> String {
    let (tx, rx) = mpsc::channel();
    let source = source.to_string();
    window
        .with_webview(move |webview| unsafe {
            let callback = webview2_com::ExecuteScriptCompletedHandler::create(Box::new(
                move |result, value| {
                    let _ = tx.send(result.map(|_| value));
                    Ok(())
                },
            ));
            webview
                .controller()
                .CoreWebView2()
                .unwrap()
                .ExecuteScript(&HSTRING::from(source), &callback)
                .unwrap();
        })
        .unwrap();
    pump(app, rx).unwrap()
}

#[test]
#[ignore = "Creates a real native window"]
fn close_to_tray_keeps_main_alive() {
    let mut app = regression_app();
    let main = tauri::WindowBuilder::new(
        &app,
        "main",
        tauri::WindowUrl::External("about:blank".parse().unwrap()),
    )
    .build()
    .unwrap();
    crate::app_settings::set_close_to_tray(true);
    crate::app_settings::request_main_close(app.handle()).unwrap();
    for _ in 0..20 {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        app.get_window("main").is_some(),
        "Close-to-tray destroyed the main window"
    );
    assert!(
        !main.is_visible().unwrap(),
        "Close-to-tray left main visible"
    );
    crate::app_settings::TRAY_VISIBLE.store(false, Ordering::Release);
    main.show().unwrap();
    crate::app_settings::request_main_close(app.handle()).unwrap();
    for _ in 0..10 {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        main.is_minimized().unwrap(),
        "No-tray fallback should minimize instead of exiting"
    );
    crate::app_settings::TRAY_VISIBLE.store(true, Ordering::Release);
}

#[test]
#[ignore = "Verifies process exit in an isolated child test process"]
fn close_exit_mode_terminates_process() {
    let output = std::process::Command::new(std::env::current_exe().unwrap())
        .args([
            "--exact",
            "native_smoke::close_exit_child",
            "--ignored",
            "--nocapture",
            "--test-threads=1",
        ])
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    assert!(String::from_utf8_lossy(&output.stdout).contains("requesting configured exit"));
}

#[test]
#[ignore = "Child-process fixture for close_exit_mode_terminates_process"]
fn close_exit_child() {
    let _watchdog = Watchdog::start();
    let mut app = regression_app();
    tauri::WindowBuilder::new(
        &app,
        "main",
        tauri::WindowUrl::External("about:blank".parse().unwrap()),
    )
    .build()
    .unwrap();
    crate::app_settings::set_close_to_tray(false);
    println!("requesting configured exit");
    crate::app_settings::request_main_close(app.handle()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    panic!("Configured exit did not terminate the process");
}

#[test]
#[ignore = "Replays the actual WebView IPC callback and waits for target navigation"]
fn shortcut_ipc_loads_page_and_can_close() {
    let _watchdog = Watchdog::start();
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let config = serde_json::json!({"id":"ipc_fixture", "type":"url", "url":format!("http://{address}/target"), "name":"IPC fixture", "hotkey":"", "createdAt":1,"updatedAt":1});
    let html = format!(
        r#"<h1>Main fixture</h1><script>setTimeout(() => {{ window._41=()=>{{document.title='command-completed'}}; window._42=e=>{{document.title='error:'+e}}; window.__TAURI_IPC__({{cmd:'toggle_target',config:{config},callback:41,error:42}}); }}, 300);</script>"#
    );
    thread::spawn(move || {
        for stream in listener.incoming() {
            let mut stream = stream.unwrap();
            let mut request = [0; 2048];
            let n = stream.read(&mut request).unwrap_or(0);
            let body = if String::from_utf8_lossy(&request[..n]).starts_with("GET /target") {
                "<h1>Target loaded</h1>"
            } else {
                &html
            };
            let _ = write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",body.len(),body);
        }
    });
    let (tx, rx) = mpsc::channel();
    let mut context = tauri::generate_context!();
    context.config_mut().tauri.windows.clear();
    context.config_mut().build.dev_path = tauri::utils::config::AppUrl::Url(
        tauri::WindowUrl::External(format!("http://{address}").parse().unwrap()),
    );
    context.config_mut().tauri.bundle.identifier =
        format!("com.hudbrowse.ipctest.{}", std::process::id());
    let mut app = tauri::Builder::default()
        .any_thread()
        .manage(WindowManager::default())
        .invoke_handler(tauri::generate_handler![targets::toggle_target])
        .on_page_load(move |window, _| {
            if window.label() == "ipc_fixture" {
                let _ = tx.send(());
            }
        })
        .build(context)
        .unwrap();
    let main = tauri::WindowBuilder::new(&app, "main", tauri::WindowUrl::App("index.html".into()))
        .build()
        .unwrap();
    pump(&mut app, rx);
    let deadline = Instant::now() + Duration::from_secs(5);
    while script(&mut app, &main, "document.title") != "\"command-completed\"" {
        assert!(
            Instant::now() < deadline,
            "The shortcut IPC response never completed"
        );
        thread::sleep(Duration::from_millis(10));
    }
    let target = app.state::<WindowManager>().window("ipc_fixture").unwrap();
    assert_eq!(
        script(
            &mut app,
            &target,
            "document.querySelector('h1').textContent"
        ),
        "\"Target loaded\""
    );
    script(&mut app, &target, "window.sleepProof=42");
    target
        .set_size(tauri::LogicalSize::new(700.0, 480.0))
        .unwrap();
    for _ in 0..10 {
        app.run_iteration();
    }
    let (tx, rx) = mpsc::channel();
    target
        .with_webview(move |webview| unsafe {
            let mut bounds = windows_legacy::Win32::Foundation::RECT::default();
            webview.controller().Bounds(&mut bounds).unwrap();
            tx.send(bounds.top).unwrap();
        })
        .unwrap();
    assert_eq!(
        pump(&mut app, rx),
        (40.0 * target.scale_factor().unwrap()).round() as i32
    );
    let caption = crate::web_caption::caption_handle(&target);
    assert_ne!(caption.0, 0, "Missing native webpage caption");
    capture_window(&target, "native-web-caption.png");
    // Small widths configured before this version must still leave every control reachable.
    target
        .set_size(tauri::LogicalSize::new(200.0, 240.0))
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        app.run_iteration();
        let mut rect = windows::Win32::Foundation::RECT::default();
        unsafe {
            windows::Win32::UI::WindowsAndMessaging::GetClientRect(caption, &mut rect).unwrap();
        }
        if rect.right == target.inner_size().unwrap().width as i32 {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "Caption did not follow the resized window"
        );
        thread::sleep(Duration::from_millis(10));
    }
    for _ in 0..10 {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    capture_window(&target, "native-web-narrow.png");
    target
        .set_size(tauri::LogicalSize::new(700.0, 480.0))
        .unwrap();
    for _ in 0..10 {
        app.run_iteration();
    }
    unsafe {
        windows::Win32::UI::WindowsAndMessaging::PostMessageW(
            caption,
            crate::web_caption::SLEEP,
            windows::Win32::Foundation::WPARAM(0),
            windows::Win32::Foundation::LPARAM(0),
        )
        .unwrap();
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let (tx, rx) = mpsc::channel();
        target
            .with_webview(move |webview| unsafe {
                let core: webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_3 =
                    webview.controller().CoreWebView2().unwrap().cast().unwrap();
                let mut asleep = windows_legacy::Win32::Foundation::BOOL(0);
                core.IsSuspended(&mut asleep).unwrap();
                tx.send(asleep.as_bool()).unwrap();
            })
            .unwrap();
        if pump(&mut app, rx) {
            break;
        }
        assert!(Instant::now() < deadline, "Webpage did not suspend");
        thread::sleep(Duration::from_millis(20));
    }
    capture_window(&target, "native-web-sleep.png");
    // A shortcut on a visible sleeping page resumes it instead of hiding it.
    let (tx, rx) = mpsc::channel();
    let handle = app.handle();
    let config = handle
        .state::<WindowManager>()
        .configs()
        .into_iter()
        .find(|c| c.id == "ipc_fixture")
        .unwrap();
    thread::spawn(move || {
        let _ = tx.send(targets::toggle_target(config, handle));
    });
    assert!(pump(&mut app, rx).unwrap().visible);
    for _ in 0..10 {
        app.run_iteration();
    }
    assert_eq!(
        script(&mut app, &target, "window.sleepProof"),
        "42",
        "Resume must retain the live page"
    );
    unsafe {
        windows::Win32::UI::WindowsAndMessaging::PostMessageW(
            caption,
            windows::Win32::UI::WindowsAndMessaging::WM_LBUTTONDOWN,
            windows::Win32::Foundation::WPARAM(0),
            windows::Win32::Foundation::LPARAM(
                ((target.inner_size().unwrap().width - 15) | (15 << 16)) as isize,
            ),
        )
        .unwrap();
    }
    for _ in 0..20 {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    assert!(
        app.get_window("ipc_fixture").is_none(),
        "Loaded webpage cannot close"
    );
}

#[test]
#[ignore = "Builds and launches an isolated WinForms fixture executable"]
fn captured_program_launches_and_reconnects() {
    use windows::Win32::Foundation::{LPARAM, WPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{PostMessageW, WM_CLOSE};
    let directory =
        std::env::temp_dir().join(format!("hudbrowse-launch-fixture-{}", std::process::id()));
    std::fs::create_dir_all(&directory).unwrap();
    let source = directory.join("fixture.cs");
    let exe = directory.join("fixture.exe");
    std::fs::write(&source,"using System; using System.Windows.Forms; class Fixture { [STAThread] static void Main() { Application.Run(new Form { Text=\"HudBrowse launch fixture\", Width=440, Height=320 }); } }").unwrap();
    assert!(
        std::process::Command::new(r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe")
            .arg("/nologo")
            .arg("/target:winexe")
            .arg("/reference:System.Windows.Forms.dll")
            .arg(format!("/out:{}", exe.display()))
            .arg(&source)
            .status()
            .unwrap()
            .success()
    );
    let manager = WindowManager::default();
    let mut config: UrlConfig=serde_json::from_value(serde_json::json!({"id":"launch_fixture","type":"window","url":"","name":"Launch fixture","hotkey":"","createdAt":1,"updatedAt":1,"windowInfo":{"hwnd":0,"processId":0,"exePath":exe.to_string_lossy(),"className":"","title":"HudBrowse launch fixture","isVisible":false,"rect":{"x":0,"y":0,"width":440,"height":320}}})).unwrap();
    // Capture a real prior identity, close it, then exercise the missing-process path.
    let mut original = std::process::Command::new(&exe).spawn().unwrap();
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        if let Some(info) = window_capture::smart_find_window(
            exe.to_string_lossy().into(),
            None,
            Some("HudBrowse launch fixture".into()),
            None,
        )
        .unwrap()
        {
            config.window_info = Some(info);
            break;
        }
        assert!(Instant::now() < deadline);
        thread::sleep(Duration::from_millis(50));
    }
    unsafe {
        PostMessageW(
            HWND(config.window_info.as_ref().unwrap().hwnd),
            WM_CLOSE,
            WPARAM(0),
            LPARAM(0),
        )
        .unwrap();
    }
    original.wait().unwrap();
    let (hwnd, launched) = crate::launcher::resolve_or_launch(&mut config, &manager).unwrap();
    assert!(launched);
    assert!(window_capture::identity_matches(
        config.window_info.as_ref().unwrap()
    ));
    let (same, again) = crate::launcher::resolve_or_launch(&mut config, &manager).unwrap();
    assert_eq!(same, hwnd);
    assert!(!again, "Existing program must not launch twice");
    let parent = parent_process_id(config.window_info.as_ref().unwrap().process_id);
    unsafe {
        PostMessageW(HWND(hwnd), WM_CLOSE, WPARAM(0), LPARAM(0)).unwrap();
    }
    let deadline = Instant::now() + Duration::from_secs(5);
    while window_capture::process_is_running(&exe.to_string_lossy()) && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(50));
    }
    // Only fixture files in this uniquely created temp directory are removed.
    let _ = std::fs::remove_file(exe);
    let _ = std::fs::remove_file(source);
    let _ = std::fs::remove_dir(directory);
    assert_ne!(
        parent,
        std::process::id(),
        "Desktop apps must be launched by Windows Shell, not as HudBrowse children"
    );
}

pub(super) fn parent_process_id(pid: u32) -> u32 {
    use windows::Win32::{Foundation::CloseHandle, System::Diagnostics::ToolHelp::*};
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0).unwrap();
        let mut entry = PROCESSENTRY32W {
            dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };
        let mut found = 0;
        let mut next = Process32FirstW(snapshot, &mut entry);
        while next.is_ok() {
            if entry.th32ProcessID == pid {
                found = entry.th32ParentProcessID;
                break;
            }
            next = Process32NextW(snapshot, &mut entry);
        }
        CloseHandle(snapshot).unwrap();
        assert_ne!(found, 0, "Fixture process must exist in the snapshot");
        found
    }
}

fn cookies(app: &mut tauri::App, window: &tauri::Window, add: bool) -> u32 {
    let (sender, receiver) = mpsc::channel();
    window
        .with_webview(move |webview| unsafe {
            let core: ICoreWebView2_2 =
                webview.controller().CoreWebView2().unwrap().cast().unwrap();
            let manager = core.CookieManager().unwrap();
            if add {
                let cookie = manager
                    .CreateCookie(
                        &HSTRING::from("fixture"),
                        &HSTRING::from("hidden-value"),
                        &HSTRING::from("127.0.0.1"),
                        &HSTRING::from("/"),
                    )
                    .unwrap();
                cookie.SetIsHttpOnly(true).unwrap();
                manager.AddOrUpdateCookie(&cookie).unwrap();
            }
            let callback = GetCookiesCompletedHandler::create(Box::new(move |result, list| {
                let result = result.and_then(|_| {
                    let mut count = 0;
                    list.unwrap().Count(&mut count)?;
                    Ok(count)
                });
                let _ = sender.send(result.map_err(|error| error.to_string()));
                Ok(())
            }));
            manager.GetCookies(&HSTRING::from(""), &callback).unwrap();
        })
        .unwrap();
    pump(app, receiver).unwrap()
}

fn assert_shell_region(window: &tauri::Window, compact: bool) {
    use windows::Win32::{
        Foundation::{POINT, RECT},
        Graphics::Gdi::{ClientToScreen, CreateRectRgn, DeleteObject, GetWindowRgn, PtInRegion},
        UI::WindowsAndMessaging::GetWindowRect,
    };
    unsafe {
        let hwnd = HWND(window.hwnd().unwrap().0);
        let scale = window.scale_factor().unwrap();
        let mut origin = POINT::default();
        let mut frame = RECT::default();
        ClientToScreen(hwnd, &mut origin).ok().unwrap();
        GetWindowRect(hwnd, &mut frame).unwrap();
        let region = CreateRectRgn(0, 0, 0, 0);
        assert_ne!(GetWindowRgn(hwnd, region).0, 0);
        let contains = |x: f64, y: f64| {
            PtInRegion(
                region,
                (x * scale).round() as i32 + origin.x - frame.left,
                (y * scale).round() as i32 + origin.y - frame.top,
            )
            .as_bool()
        };
        let visible = if compact {
            vec![(40., 36.), (400., 36.), (400., 64.), (40., 64.)]
        } else {
            vec![
                (210., 34.),
                (910., 34.),
                (910., 64.),
                (210., 64.),
                (560., 80.),
                (560., 84.),
            ]
        };
        for (x, y) in visible {
            assert!(contains(x, y), "Clipped control or seam at {x},{y}");
        }
        assert!(!contains(0., 0.));
        if compact {
            assert!(!contains(220., 94.));
        } else {
            assert!(!contains(30., 30.));
        }
        DeleteObject(region);
    }
}

#[test]
#[ignore = "Creates real WebView2 windows; run explicitly on a Windows desktop"]
fn native_webview_workflows() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    listener.set_nonblocking(true).unwrap();
    let stopped = Arc::new(AtomicBool::new(false));
    let stop = stopped.clone();
    let server = thread::spawn(move || {
        while !stop.load(Ordering::Acquire) {
            if let Ok((mut stream, _)) = listener.accept() {
                let _ = stream.set_read_timeout(Some(Duration::from_secs(1)));
                let _ = stream.read(&mut [0u8; 2048]);
                let body = "<!doctype html><title>HudBrowse test</title><h1>Native fixture</h1>";
                let _ = write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
            } else {
                thread::sleep(Duration::from_millis(10));
            }
        }
    });
    let mut context = tauri::generate_context!();
    match context.default_window_icon() {
        Some(tauri::Icon::Rgba {
            rgba,
            width,
            height,
        }) => {
            assert_eq!((*width, *height, rgba.len()), (64, 64, 64 * 64 * 4));
        }
        _ => panic!("Expected the supplied 64px ICO as the live window icon"),
    }
    context.config_mut().tauri.windows.clear();
    context.config_mut().tauri.bundle.identifier =
        format!("com.hudbrowse.smoketest.{}", std::process::id());
    let mut app = tauri::Builder::default()
        .any_thread()
        .manage(WindowManager::default())
        .manage(shell::ShellState::default())
        .build(context)
        .unwrap();
    let handle = app.handle();
    let main = tauri::WindowBuilder::new(
        &handle,
        "main",
        tauri::WindowUrl::External(format!("http://{address}/").parse().unwrap()),
    )
    .title("HudBrowse shell fixture")
    .decorations(false)
    .transparent(true)
    .inner_size(1120.0, 760.0)
    .min_inner_size(760.0, 560.0)
    .build()
    .unwrap();
    let shapes: serde_json::Value =
        serde_json::from_str(include_str!("../../tests/fixtures/shell-shapes.json")).unwrap();
    let apply_shape = |index: usize| {
        shell::set_main_shape(
            main.clone(),
            serde_json::from_value(shapes[index]["points"].clone()).unwrap(),
            shapes[index]["width"].as_f64().unwrap(),
            shapes[index]["height"].as_f64().unwrap(),
        )
        .unwrap();
    };
    apply_shape(0);
    assert_shell_region(&main, false);
    let original_size = main.inner_size().unwrap();
    shell::set_main_compact(true, handle.clone()).unwrap();
    apply_shape(1);
    for _ in 0..5 {
        app.run_iteration();
    }
    assert_shell_region(&main, true);
    let scale = main.scale_factor().unwrap();
    assert_eq!(
        main.inner_size().unwrap(),
        tauri::PhysicalSize::new(
            (440.0 * scale).round() as u32,
            (100.0 * scale).round() as u32
        )
    );
    // Exercise actual docking without moving the user's cursor. Place the
    // fixture away from the pointer and pump the UI so queued native moves run.
    let hwnd = HWND(main.hwnd().unwrap().0);
    let area = crate::geometry::work_area(hwnd.0).unwrap();
    let mut cursor = windows::Win32::Foundation::POINT::default();
    unsafe {
        windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut cursor).unwrap();
    }
    let y = if cursor.y < (area.top + area.bottom) / 2 {
        area.bottom - (140.0 * scale) as i32
    } else {
        area.top + (30.0 * scale) as i32
    };
    for (left, fraction) in [true, false]
        .into_iter()
        .flat_map(|left| [0.0, 0.2, 0.5, 0.85].map(|fraction| (left, fraction)))
    {
        let dock = &handle.state::<shell::ShellState>().dock;
        dock.stop(&main);
        let width = main.outer_size().unwrap().width as i32;
        let outside = (width as f64 * fraction) as i32;
        main.set_position(tauri::PhysicalPosition::new(
            if left {
                area.left - outside
            } else {
                area.right - width + outside
            },
            y,
        ))
        .unwrap();
        dock.start(&main).unwrap();
        let deadline = Instant::now() + Duration::from_secs(4);
        loop {
            app.run_iteration();
            let mut origin = windows::Win32::Foundation::POINT::default();
            unsafe {
                windows::Win32::Graphics::Gdi::ClientToScreen(hwnd, &mut origin)
                    .ok()
                    .unwrap();
            }
            let visible = if left {
                origin.x + (426.0 * scale).round() as i32 - area.left
            } else {
                area.right - origin.x - (14.0 * scale).round() as i32
            };
            if (visible - (36.0 * scale).round() as i32).abs() <= 1 {
                break;
            }
            assert!(
                Instant::now() < deadline,
                "Island cap did not reach half-circle exposure: {visible}"
            );
            thread::sleep(Duration::from_millis(10));
        }
    }
    shell::set_main_compact(false, handle.clone()).unwrap();
    apply_shape(0);
    for _ in 0..5 {
        app.run_iteration();
    }
    assert_shell_region(&main, false);
    assert_eq!(main.inner_size().unwrap(), original_size);
    let expanded_position = main.outer_position().unwrap();
    let deadline = Instant::now() + Duration::from_millis(400);
    while Instant::now() < deadline {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(
        main.outer_position().unwrap(),
        expanded_position,
        "Old docking moves must not affect the expanded window"
    );
    assert!(expanded_position.x >= area.left && expanded_position.y >= area.top);
    unsafe {
        use windows::Win32::Graphics::Gdi::{
            CreateRectRgn, DeleteObject, GetWindowRgn, PtInRegion,
        };
        let region = CreateRectRgn(0, 0, 0, 0);
        assert_ne!(GetWindowRgn(HWND(main.hwnd().unwrap().0), region).0, 0);
        assert!(!PtInRegion(region, (30.0 * scale) as i32, (30.0 * scale) as i32).as_bool());
        assert!(PtInRegion(region, (560.0 * scale) as i32, (40.0 * scale) as i32).as_bool());
        let _ = DeleteObject(region);
    }
    main.close().unwrap();
    for _ in 0..10 {
        app.run_iteration();
    }
    let mut config = UrlConfig {
        id: "native_fixture".into(),
        kind: "url".into(),
        url: format!("http://{}/", address),
        name: "Native fixture".into(),
        hotkey: String::new(),
        category: None,
        settings: Some(WindowSettings {
            always_on_top: false,
            ..WindowSettings::default()
        }),
        last_position: None,
        last_size: None,
        created_at: 1,
        updated_at: 1,
        window_info: None,
    };
    targets::sync_targets(vec![config.clone()], handle.clone()).unwrap();
    assert!(
        !targets::hide_target(config.id.clone(), handle.clone())
            .unwrap()
            .exists
    );
    assert!(
        targets::toggle_target(config.clone(), handle.clone())
            .unwrap()
            .visible
    );
    for _ in 0..20 {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    let window = handle.state::<WindowManager>().window(&config.id).unwrap();
    let initial_size = window.inner_size().unwrap();
    for _ in 0..2 {
        assert!(
            !targets::hide_target(config.id.clone(), handle.clone())
                .unwrap()
                .visible
        );
    }
    assert!(
        targets::show_target(config.clone(), handle.clone())
            .unwrap()
            .visible
    );
    assert_eq!(
        handle
            .state::<WindowManager>()
            .windows
            .lock()
            .unwrap()
            .len(),
        1
    );
    assert_eq!(window.inner_size().unwrap(), initial_size);
    config.settings.as_mut().unwrap().opacity = 40.0;
    config.settings.as_mut().unwrap().mouse_through = true;
    targets::apply_target_settings(config.clone(), handle.clone()).unwrap();
    config.settings.as_mut().unwrap().opacity = 100.0;
    config.settings.as_mut().unwrap().mouse_through = false;
    targets::apply_target_settings(config.clone(), handle.clone()).unwrap();
    unsafe {
        let hwnd = HWND(window.hwnd().unwrap().0);
        let mut alpha = 0;
        GetLayeredWindowAttributes(hwnd, None, Some(&mut alpha), None).unwrap();
        assert_eq!(alpha, 255);
        assert_eq!(
            GetWindowLongW(hwnd, GWL_EXSTYLE)
                & (WS_EX_TRANSPARENT.0 as i32 | WS_EX_TOPMOST.0 as i32),
            0
        );
    }
    session::save_session(handle.clone()).unwrap();
    assert!(session::load_session(handle.clone()).unwrap()[0].visible);
    config.settings.as_mut().unwrap().auto_hide_on_edge = true;
    targets::apply_target_settings(config.clone(), handle.clone()).unwrap();
    assert!(
        !targets::toggle_target(config.clone(), handle.clone())
            .unwrap()
            .visible
    );
    session::save_session(handle.clone()).unwrap();
    assert!(!session::load_session(handle.clone()).unwrap()[0].visible);
    assert!(
        targets::show_target(config.clone(), handle.clone())
            .unwrap()
            .visible
    );
    assert_eq!(cookies(&mut app, &window, true), 1);
    for action in ["clear_cookies", "clear_cache"] {
        let (sender, receiver) = mpsc::channel();
        let handle = handle.clone();
        let id = config.id.clone();
        tauri::async_runtime::spawn(async move {
            let _ = sender.send(page_data::page_action(id, action.into(), handle).await);
        });
        pump(&mut app, receiver).unwrap();
        if action == "clear_cookies" {
            assert_eq!(cookies(&mut app, &window, false), 0);
        }
    }
    targets::remove_target(config.id.clone(), handle.clone()).unwrap();
    for _ in 0..10 {
        app.run_iteration();
    }
    assert!(handle
        .state::<WindowManager>()
        .windows
        .lock()
        .unwrap()
        .is_empty());
    unsafe {
        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            windows::core::w!("STATIC"),
            windows::core::w!("HudBrowse captured fixture"),
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
        config.id = "captured_fixture".into();
        config.kind = "window".into();
        config.url.clear();
        config.last_position = None;
        config.last_size = None;
        config.window_info = Some(window_capture::get_window_info(hwnd).unwrap());
        config.settings = Some(WindowSettings::default());
        assert!(
            targets::show_target(config.clone(), handle.clone())
                .unwrap()
                .visible
        );
        for _ in 0..2 {
            assert!(
                !targets::hide_target(config.id.clone(), handle.clone())
                    .unwrap()
                    .visible
            );
        }
        assert!(
            targets::show_target(config.clone(), handle.clone())
                .unwrap()
                .visible
        );
        assert!(handle
            .state::<WindowManager>()
            .windows
            .lock()
            .unwrap()
            .is_empty());
        targets::remove_target(config.id.clone(), handle.clone()).unwrap();
        assert!(IsWindowVisible(hwnd).as_bool());
        assert_eq!(GetWindowLongW(hwnd, GWL_EXSTYLE), original_style);
        DestroyWindow(hwnd).unwrap();
    }
    config.id = "absent_capture".into();
    if let Some(info) = config.window_info.as_mut() {
        info.hwnd = 0;
        info.process_id = 0;
        info.exe_path = "C:\\hudbrowse-missing-fixture.exe".into();
    }
    targets::sync_targets(vec![config.clone()], handle.clone()).unwrap();
    assert!(
        !targets::hide_target(config.id.clone(), handle.clone())
            .unwrap()
            .exists
    );
    stopped.store(true, Ordering::Release);
    server.join().unwrap();
}
