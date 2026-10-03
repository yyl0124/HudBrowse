//! Uses the built React UI and OS mouse input, including Tauri's Windows drop handler.
use crate::{
    native_smoke::{pump, script},
    shell,
};
use std::{
    io::{Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicUsize, Ordering},
        mpsc, Arc,
    },
    thread,
    time::{Duration, Instant},
};
use windows::Win32::{
    Foundation::{HWND, POINT},
    Graphics::Gdi::ClientToScreen,
    UI::{Input::KeyboardAndMouse::*, WindowsAndMessaging::*},
};

struct RestorePointer {
    point: POINT,
    foreground: HWND,
}
impl Drop for RestorePointer {
    fn drop(&mut self) {
        unsafe {
            let _ = SetCursorPos(self.point.x, self.point.y);
            SetForegroundWindow(self.foreground);
        }
    }
}
fn mouse(flags: MOUSE_EVENT_FLAGS, data: i32) {
    unsafe {
        assert_eq!(
            SendInput(
                &[INPUT {
                    r#type: INPUT_MOUSE,
                    Anonymous: INPUT_0 {
                        mi: MOUSEINPUT {
                            dwFlags: flags,
                            mouseData: data,
                            ..Default::default()
                        }
                    }
                }],
                std::mem::size_of::<INPUT>() as i32
            ),
            1
        );
    }
}
fn gesture(app: &mut tauri::App, from: (i32, i32), to: (i32, i32)) {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        unsafe {
            SetCursorPos(from.0, from.1).unwrap();
        }
        thread::sleep(Duration::from_millis(100));
        mouse(MOUSEEVENTF_LEFTDOWN, 0);
        for step in 1..=12 {
            unsafe {
                SetCursorPos(
                    from.0 + (to.0 - from.0) * step / 12,
                    from.1 + (to.1 - from.1) * step / 12,
                )
                .unwrap();
            }
            thread::sleep(Duration::from_millis(35));
        }
        mouse(MOUSEEVENTF_LEFTUP, 0);
        thread::sleep(Duration::from_millis(150));
        tx.send(()).unwrap();
    });
    pump(app, rx);
}

#[test]
#[ignore = "Requires npm run build; briefly moves the mouse inside an isolated native WebView"]
fn island_os_pointer_sorts_and_scrolls() {
    let mut point = POINT::default();
    unsafe {
        GetCursorPos(&mut point).unwrap();
    }
    let _restore = RestorePointer {
        point,
        foreground: unsafe { GetForegroundWindow() },
    };
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let dist = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../dist");
    assert!(
        dist.join("index.html").exists(),
        "Run npm run build before the native UI test"
    );
    thread::spawn(move || {
        for stream in listener.incoming() {
            let mut stream = stream.unwrap();
            let mut buffer = [0u8; 4096];
            let n = stream.read(&mut buffer).unwrap_or(0);
            let request = String::from_utf8_lossy(&buffer[..n]);
            let path = request
                .split_whitespace()
                .nth(1)
                .unwrap_or("/")
                .split('?')
                .next()
                .unwrap();
            let path = if path == "/" {
                "index.html"
            } else {
                path.trim_start_matches('/')
            };
            let valid = !path.contains("..") && !path.contains('\\');
            let data = if valid {
                std::fs::read(dist.join(path)).unwrap_or_default()
            } else {
                Vec::new()
            };
            let content = if path.ends_with(".js") {
                "application/javascript"
            } else if path.ends_with(".css") {
                "text/css"
            } else if path.ends_with(".png") {
                "image/png"
            } else {
                "text/html"
            };
            let _=write!(stream,"HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",content,data.len());
            let _ = stream.write_all(&data);
        }
    });
    let mut context = tauri::generate_context!();
    assert!(
        !context.config().tauri.windows[0].file_drop_enabled,
        "Main window must not intercept frontend gestures as file drops"
    );
    context.config_mut().tauri.windows.clear();
    context.config_mut().build.dev_path = tauri::utils::config::AppUrl::Url(
        tauri::WindowUrl::External(format!("http://{address}").parse().unwrap()),
    );
    context.config_mut().tauri.bundle.identifier =
        format!("com.hudbrowse.islandtest.{}", std::process::id());
    let toggles = Arc::new(AtomicUsize::new(0));
    let count = toggles.clone();
    let native: fn(tauri::Invoke<tauri::Wry>) = tauri::generate_handler![shell::set_main_shape];
    let mut app = tauri::Builder::default()
        .any_thread()
        .manage(shell::ShellState::default())
        .invoke_handler(move |invoke| {
            let command = invoke.message.command();
            if command == "set_main_shape" {
                native(invoke);
                return;
            }
            let result = match command {
                "get_main_compact" => serde_json::json!(true),
                "get_auto_start" => serde_json::json!(false),
                "load_session" | "get_target_states" => serde_json::json!([]),
                "toggle_target" => {
                    count.fetch_add(1, Ordering::Relaxed);
                    serde_json::json!({})
                }
                "get_site_icon" => serde_json::json!(""),
                _ => serde_json::Value::Null,
            };
            invoke.resolver.resolve(result);
        })
        .build(context)
        .unwrap();
    let seed = r#"localStorage.setItem('hudbrowse_url_configs',JSON.stringify(Array.from({length:6},(_,i)=>({id:'native_icon_'+i,type:'url',url:'http://127.0.0.1:9/',name:'目标 '+i,hotkey:'',createdAt:i+1,updatedAt:i+1})))); localStorage.setItem('hudbrowse_global_config',JSON.stringify({restoreLastSession:false})); window.fixtureClicks=[];document.addEventListener('click',e=>window.fixtureClicks.push({label:e.target.closest('button')?.getAttribute('aria-label'),x:e.clientX,y:e.clientY}));window.fixtureDragEvents={}; for(const type of ['dragstart','dragover','drop'])document.addEventListener(type,()=>window.fixtureDragEvents[type]=(window.fixtureDragEvents[type]||0)+1);"#;
    let window =
        tauri::WindowBuilder::new(&app, "main", tauri::WindowUrl::App("index.html".into()))
            .disable_file_drop_handler()
            .initialization_script(seed)
            .data_directory(
                std::env::temp_dir().join(format!("hudbrowse-island-test-{}", std::process::id())),
            )
            .inner_size(440.0, 100.0)
            .position(100.0, 100.0)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .build()
            .unwrap();
    window.set_focus().unwrap();
    let deadline = Instant::now() + Duration::from_secs(15);
    while script(
        &mut app,
        &window,
        "document.querySelectorAll('.compact-target:not(:disabled)').length",
    ) != "6"
    {
        assert!(
            Instant::now() < deadline,
            "Native React island did not initialize"
        );
        thread::sleep(Duration::from_millis(30));
    }
    assert_eq!(script(&mut app, &window, "(()=>{const rail=document.querySelector('.compact-target-scroll').getBoundingClientRect();const items=[...document.querySelectorAll('.compact-target')].slice(0,4);const close=document.querySelector('.compact-title .close-button').getBoundingClientRect();const title=document.querySelector('.compact-title').getBoundingClientRect();return items.every(el=>{const r=el.getBoundingClientRect();return r.left>=rail.left&&r.right<=rail.right+.5})&&close.right<=title.right-18})()"), "true", "Four icons and close button must fit at the actual WebView zoom");
    let positions:Vec<(f64,f64)>=serde_json::from_str(&script(&mut app,&window,"Array.from(document.querySelectorAll('.compact-target')).map(el=>{const r=el.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})")).unwrap();
    // WebView zoom/text scaling can differ from the native monitor scale (e.g. 110%).
    // DOM coordinates must be converted with the renderer's actual CSS pixel ratio.
    let scale: f64 = serde_json::from_str(&script(&mut app, &window, "devicePixelRatio")).unwrap();
    let mut origin = POINT::default();
    unsafe {
        ClientToScreen(HWND(window.hwnd().unwrap().0), &mut origin)
            .ok()
            .unwrap();
    }
    let physical = |p: (f64, f64)| {
        (
            origin.x + (p.0 * scale).round() as i32,
            origin.y + (p.1 * scale).round() as i32,
        )
    };
    gesture(&mut app, physical(positions[0]), physical(positions[2]));
    assert_eq!(script(&mut app,&window,"Array.from(document.querySelectorAll('.compact-target')).map(el=>el.dataset.targetId)"),"[\"native_icon_1\",\"native_icon_2\",\"native_icon_0\",\"native_icon_3\",\"native_icon_4\",\"native_icon_5\"]","Native drag failed: {}",script(&mut app,&window,"window.fixtureDragEvents"));
    assert_eq!(
        toggles.load(Ordering::Relaxed),
        0,
        "Sorting must not open a target"
    );
    unsafe {
        let p = physical(positions[1]);
        SetCursorPos(p.0, p.1).unwrap();
    }
    mouse(MOUSEEVENTF_WHEEL, -8);
    let deadline = Instant::now() + Duration::from_secs(3);
    loop {
        if script(
            &mut app,
            &window,
            "document.querySelector('.compact-target-scroll').scrollLeft",
        )
        .parse::<f64>()
        .unwrap()
            > 0.0
        {
            break;
        }
        assert!(
            Instant::now() < deadline,
            "Native fine wheel input did not scroll"
        );
        thread::sleep(Duration::from_millis(20));
    }
    let arrow: (f64,f64)=serde_json::from_str(&script(&mut app,&window,"(()=>{const r=document.querySelector('[aria-label=\"向右浏览目标\"]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")).unwrap();
    gesture(&mut app, physical(arrow), physical(arrow));
    let deadline = Instant::now() + Duration::from_secs(3);
    while script(
        &mut app,
        &window,
        "document.querySelector('.compact-target-scroll').scrollLeft",
    )
    .parse::<f64>()
    .unwrap()
        < 75.0
    {
        assert!(
            Instant::now() < deadline,
            "Mouse browse arrow did not reveal the remaining targets: {}", script(&mut app,&window,"({scroll:document.querySelector('.compact-target-scroll').scrollLeft, clicks:window.fixtureClicks, disabled:document.querySelector('[aria-label=\"向右浏览目标\"]').disabled, width:innerWidth,dpr:devicePixelRatio})")
        );
        thread::sleep(Duration::from_millis(20));
    }
    let fourth: (f64,f64)=serde_json::from_str(&script(&mut app,&window,"(()=>{const r=document.querySelector('[data-target-id=\"native_icon_4\"]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")).unwrap();
    gesture(&mut app, physical(fourth), physical(fourth));
    assert_eq!(
        toggles.load(Ordering::Relaxed),
        1,
        "A normal click on a newly revealed target must still work"
    );
    window.close().unwrap();
    for _ in 0..10 {
        app.run_iteration();
    }
}
