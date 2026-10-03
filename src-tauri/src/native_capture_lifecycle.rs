//! Isolated desktop fixtures: never capture or close a user's actual applications.
use crate::{models::UrlConfig, native_smoke, targets, window_capture};
use std::{
    path::PathBuf,
    process::Command,
    thread,
    time::{Duration, Instant},
};
use windows::Win32::{
    Foundation::{HWND, LPARAM, WPARAM},
    UI::WindowsAndMessaging::{IsWindow, IsWindowVisible, PostMessageW, WM_CLOSE},
};

struct Fixture(PathBuf);
impl Fixture {
    fn exe(&self) -> PathBuf {
        self.0.join("desktop fixture.exe")
    }
    fn close(&self) {
        if let Ok(Some(info)) = window_capture::smart_find_window(
            self.exe().to_string_lossy().into(),
            None,
            Some("HudBrowse lifecycle fixture".into()),
            None,
        ) {
            unsafe {
                let _ = PostMessageW(HWND(info.hwnd), WM_CLOSE, WPARAM(0), LPARAM(0));
            }
        }
        let deadline = Instant::now() + Duration::from_secs(5);
        while window_capture::process_is_running(&self.exe().to_string_lossy())
            && Instant::now() < deadline
        {
            thread::sleep(Duration::from_millis(50));
        }
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        self.close();
        for name in [
            "fixture.cs",
            "desktop fixture.exe",
            "result.json",
            "config.json",
        ] {
            let _ = std::fs::remove_file(self.0.join(name));
        }
        let _ = std::fs::remove_dir(&self.0);
    }
}

#[test]
#[ignore = "Launches a private WinForms app through Shell and exits isolated HudBrowse hosts"]
fn captured_app_survives_hudbrowse_exit() {
    let fixture =
        Fixture(std::env::temp_dir().join(format!("hudbrowse 生命周期 {}", std::process::id())));
    std::fs::create_dir_all(&fixture.0).unwrap();
    let source = fixture.0.join("fixture.cs");
    std::fs::write(&source, "using System; using System.Windows.Forms; class Fixture { [STAThread] static void Main() { Application.Run(new Form { Text=\"HudBrowse lifecycle fixture\", Width=440, Height=320 }); } }").unwrap();
    assert!(
        Command::new(r"C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe")
            .args([
                "/nologo",
                "/target:winexe",
                "/reference:System.Windows.Forms.dll"
            ])
            .arg(format!("/out:{}", fixture.exe().display()))
            .arg(&source)
            .status()
            .unwrap()
            .success()
    );
    let mut original = Command::new(fixture.exe()).spawn().unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    let info = loop {
        if let Some(info) = window_capture::smart_find_window(
            fixture.exe().to_string_lossy().into(),
            None,
            Some("HudBrowse lifecycle fixture".into()),
            None,
        )
        .unwrap()
        {
            break info;
        }
        assert!(
            Instant::now() < deadline,
            "Initial fixture window did not appear"
        );
        thread::sleep(Duration::from_millis(50));
    };
    let config: UrlConfig = serde_json::from_value(serde_json::json!({
        "id":"lifecycle_fixture", "type":"window", "url":"", "name":"Lifecycle fixture", "hotkey":"", "createdAt":1, "updatedAt":1, "windowInfo":info
    })).unwrap();
    std::fs::write(
        fixture.0.join("config.json"),
        serde_json::to_vec(&config).unwrap(),
    )
    .unwrap();
    fixture.close();
    if original.try_wait().unwrap().is_none() {
        let _ = original.kill();
        let _ = original.wait();
        panic!("Initial fixture did not close");
    }
    // Both a visible capture and one hidden by HudBrowse must remain accessible.
    for hide in [false, true] {
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "native_capture_lifecycle::capture_exit_child",
                "--ignored",
                "--nocapture",
                "--test-threads=1",
            ])
            .env("HUDBROWSE_LIFECYCLE_FIXTURE", &fixture.0)
            .env("HUDBROWSE_LIFECYCLE_HIDE", hide.to_string())
            .spawn()
            .unwrap();
        let host = child.id();
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if let Some(status) = child.try_wait().unwrap() {
                assert!(status.success());
                break;
            }
            if Instant::now() >= deadline {
                let _ = child.kill();
                let _ = child.wait();
                panic!("Isolated HudBrowse did not exit");
            }
            thread::sleep(Duration::from_millis(50));
        }
        let config: UrlConfig =
            serde_json::from_slice(&std::fs::read(fixture.0.join("result.json")).unwrap()).unwrap();
        let info = config.window_info.unwrap();
        assert!(
            window_capture::identity_matches(&info),
            "Closing HudBrowse must not terminate the captured app"
        );
        assert!(
            unsafe {
                IsWindow(HWND(info.hwnd)).as_bool() && IsWindowVisible(HWND(info.hwnd)).as_bool()
            },
            "The released app window must remain visible, including after a HudBrowse hide"
        );
        assert_ne!(
            native_smoke::parent_process_id(info.process_id),
            host,
            "The launched app must not belong to HudBrowse's process tree"
        );
        fixture.close();
    }
}

#[test]
#[ignore = "Child fixture; only used by captured_app_survives_hudbrowse_exit"]
fn capture_exit_child() {
    let Some(directory) = std::env::var_os("HUDBROWSE_LIFECYCLE_FIXTURE") else {
        return;
    };
    let directory = PathBuf::from(directory);
    let mut app = native_smoke::regression_app();
    tauri::WindowBuilder::new(
        &app,
        "main",
        tauri::WindowUrl::External("about:blank".parse().unwrap()),
    )
    .visible(false)
    .build()
    .unwrap();
    let config: UrlConfig =
        serde_json::from_slice(&std::fs::read(directory.join("config.json")).unwrap()).unwrap();
    targets::sync_targets(vec![config.clone()], app.handle()).unwrap();
    assert!(
        !targets::apply_target_settings(config.clone(), app.handle())
            .unwrap()
            .exists
    );
    assert!(!window_capture::process_is_running(
        &config.window_info.as_ref().unwrap().exe_path
    ));
    assert!(
        targets::show_target(config.clone(), app.handle())
            .unwrap()
            .visible
    );
    if std::env::var("HUDBROWSE_LIFECYCLE_HIDE").as_deref() == Ok("true") {
        assert!(
            !targets::hide_target(config.id.clone(), app.handle())
                .unwrap()
                .visible
        );
    }
    let resolved = targets::resolve_target(config, app.handle()).unwrap();
    std::fs::write(
        directory.join("result.json"),
        serde_json::to_vec(&resolved).unwrap(),
    )
    .unwrap();
    crate::app_settings::set_close_to_tray(false);
    crate::app_settings::request_main_close(app.handle()).unwrap();
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        app.run_iteration();
        thread::sleep(Duration::from_millis(10));
    }
    panic!("HudBrowse close request did not exit");
}
