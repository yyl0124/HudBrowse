//! A native caption above the existing WebView. No extra renderer, injected DOM or remote IPC.
use std::{cell::Cell, rc::Rc};
use tauri::Window;
use webview2_com::{Microsoft::Web::WebView2::Win32::*, TrySuspendCompletedHandler};
use windows::Win32::{
    Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM},
    Graphics::Gdi::*,
    UI::{
        HiDpi::GetDpiForWindow,
        Shell::{DefSubclassProc, GetWindowSubclass, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::*,
    },
};
use windows_legacy::core::Interface;

const CAPTION_ID: usize = 0x4842;
const RESUME: u32 = WM_APP + 51;
pub const SLEEP: u32 = WM_APP + 52;
const IS_SLEEPING: u32 = WM_APP + 53;
struct Caption {
    controller: ICoreWebView2Controller,
    status: Rc<Cell<u8>>, // 0 awake, 1 suspending, 2 asleep, 3 suspension failed
    generation: Rc<Cell<u64>>,
    alive: Rc<Cell<bool>>,
    hover: Cell<i32>,
}

unsafe fn caption(hwnd: HWND) -> Option<&'static Caption> {
    let mut data = 0;
    if GetWindowSubclass(hwnd, Some(caption_proc), CAPTION_ID, Some(&mut data)).as_bool() {
        Some(&*(data as *const Caption))
    } else {
        None
    }
}
fn px(hwnd: HWND, value: i32) -> i32 {
    let dpi = unsafe { GetDpiForWindow(hwnd) }.max(96);
    (value as f64 * dpi as f64 / 96.0).round() as i32
}
unsafe fn layout(parent: HWND) {
    let bar = GetDlgItem(parent, CAPTION_ID as i32);
    let Some(state) = caption(bar) else { return };
    let mut rect = RECT::default();
    if GetClientRect(parent, &mut rect).is_err() || rect.right <= 0 || rect.bottom <= 0 {
        return;
    }
    let height = px(parent, 40).min(rect.bottom);
    let _ = SetWindowPos(bar, HWND_TOP, 0, 0, rect.right, height, SWP_NOACTIVATE);
    let _ = state
        .controller
        .SetBounds(windows_legacy::Win32::Foundation::RECT {
            left: 0,
            top: height,
            right: rect.right,
            bottom: rect.bottom,
        });
    let _ = SetWindowPos(
        GetDlgItem(parent, (CAPTION_ID + 1) as i32),
        HWND_TOP,
        0,
        height,
        rect.right,
        rect.bottom - height,
        SWP_NOACTIVATE,
    );
}
unsafe fn sleeping_panel(hwnd: HWND, visible: bool) {
    ShowWindow(
        GetDlgItem(GetParent(hwnd), (CAPTION_ID + 1) as i32),
        if visible { SW_SHOWNA } else { SW_HIDE },
    );
}
unsafe fn resume(hwnd: HWND, state: &Caption) {
    state.generation.set(state.generation.get() + 1);
    if let Ok(core) = state
        .controller
        .CoreWebView2()
        .and_then(|core| core.cast::<ICoreWebView2_3>())
    {
        let _ = core.Resume();
    }
    let _ = state.controller.SetIsVisible(true);
    sleeping_panel(hwnd, false);
    state.status.set(0);
    InvalidateRect(hwnd, None, false);
}
unsafe fn suspend(hwnd: HWND, state: &Caption) {
    if state.status.get() == 1 {
        return;
    }
    if state.status.get() == 2 {
        resume(hwnd, state);
        return;
    }
    let result = (|| -> windows_legacy::core::Result<()> {
        let core: ICoreWebView2_3 = state.controller.CoreWebView2()?.cast()?;
        state.controller.SetIsVisible(false)?;
        sleeping_panel(hwnd, true);
        state.status.set(1);
        state.generation.set(state.generation.get() + 1);
        let generation = state.generation.clone();
        let request = generation.get();
        let alive = state.alive.clone();
        let status = state.status.clone();
        let controller = state.controller.clone();
        let callback = TrySuspendCompletedHandler::create(Box::new(move |result, success| {
            if !alive.get() {
                return Ok(());
            }
            if generation.get() != request {
                if let Ok(core) = controller
                    .CoreWebView2()
                    .and_then(|core| core.cast::<ICoreWebView2_3>())
                {
                    let _ = core.Resume();
                }
                return Ok(());
            }
            if result.is_ok() && success {
                status.set(2);
            } else {
                status.set(3);
                let _ = controller.SetIsVisible(true);
                sleeping_panel(hwnd, false);
            }
            InvalidateRect(hwnd, None, false);
            Ok(())
        }));
        core.TrySuspend(&callback)
    })();
    if result.is_err() {
        state.status.set(3);
        let _ = state.controller.SetIsVisible(true);
        sleeping_panel(hwnd, false);
    }
    InvalidateRect(hwnd, None, false);
}
unsafe extern "system" fn sleep_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    _: usize,
) -> LRESULT {
    if msg == WM_PAINT {
        let mut paint = PAINTSTRUCT::default();
        let dc = BeginPaint(hwnd, &mut paint);
        let mut rect = RECT::default();
        let _ = GetClientRect(hwnd, &mut rect);
        let brush = CreateSolidBrush(COLORREF(0x00151916));
        FillRect(dc, &rect, brush);
        DeleteObject(brush);
        SetBkMode(dc, TRANSPARENT);
        let previous = SelectObject(dc, GetStockObject(DEFAULT_GUI_FONT));
        text(
            dc,
            "网页已暂停显示，点击标题栏“唤醒”继续",
            rect,
            COLORREF(0x00bddcc7),
            DT_CENTER,
        );
        SelectObject(dc, previous);
        EndPaint(hwnd, &paint);
        return LRESULT(0);
    }
    if msg == WM_NCDESTROY {
        RemoveWindowSubclass(hwnd, Some(sleep_proc), CAPTION_ID);
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}
unsafe fn text(dc: HDC, value: &str, mut rect: RECT, color: COLORREF, flags: DRAW_TEXT_FORMAT) {
    SetTextColor(dc, color);
    let mut wide: Vec<u16> = value.encode_utf16().collect();
    DrawTextW(
        dc,
        &mut wide,
        &mut rect,
        flags | DT_SINGLELINE | DT_VCENTER | DT_END_ELLIPSIS | DT_NOPREFIX,
    );
}
unsafe extern "system" fn caption_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    data: usize,
) -> LRESULT {
    let state = &*(data as *const Caption);
    match msg {
        WM_NCHITTEST => return LRESULT(HTCLIENT as isize),
        WM_PAINT => {
            let mut paint = PAINTSTRUCT::default();
            let dc = BeginPaint(hwnd, &mut paint);
            let mut rect = RECT::default();
            let _ = GetClientRect(hwnd, &mut rect);
            let brush = CreateSolidBrush(COLORREF(0x001d2420));
            FillRect(dc, &rect, brush);
            DeleteObject(brush);
            SetBkMode(dc, TRANSPARENT);
            let mut font = LOGFONTW {
                lfHeight: -px(hwnd, 13),
                ..Default::default()
            };
            for (slot, ch) in font
                .lfFaceName
                .iter_mut()
                .zip("Microsoft YaHei UI".encode_utf16())
            {
                *slot = ch;
            }
            let font = CreateFontIndirectW(&font);
            let previous = SelectObject(dc, font);
            let unit = px(hwnd, 42).min(rect.right / 7);
            let sleep_width = unit * 12 / 7;
            let mut title = [0u16; 256];
            let n = GetWindowTextW(GetParent(hwnd), &mut title);
            text(
                dc,
                &String::from_utf16_lossy(&title[..n.max(0) as usize]),
                RECT {
                    left: px(hwnd, 12),
                    right: rect.right - unit * 4 - sleep_width,
                    ..rect
                },
                COLORREF(0x00e7eee9),
                DT_LEFT,
            );
            let sleep_label = match state.status.get() {
                1 => "休眠中",
                2 => "唤醒",
                3 => "重试休眠",
                _ => "休眠",
            };
            let labels = [
                ("↻", unit),
                (sleep_label, sleep_width),
                ("−", unit),
                ("□", unit),
                ("×", unit),
            ];
            let mut x = rect.right - unit * 4 - sleep_width;
            for (label, width) in labels {
                if state.hover.get() >= x && state.hover.get() < x + width {
                    let brush = CreateSolidBrush(if label == "×" { COLORREF(0x00434bbc) } else { COLORREF(0x00313f36) });
                    FillRect(dc, &RECT { left:x, right:x+width, ..rect }, brush);
                    DeleteObject(brush);
                }
                if matches!(label, "−" | "□" | "×") {
                    let cx=x+width/2; let cy=rect.bottom/2; let half=px(hwnd,5);
                    let pen=CreatePen(PS_SOLID,px(hwnd,1),COLORREF(0x00dde9e1));
                    let previous_pen=SelectObject(dc,pen);
                    match label {
                        "−" => { MoveToEx(dc,cx-half,cy,None); LineTo(dc,cx+half,cy); }
                        "□" => { MoveToEx(dc,cx-half,cy-half,None); LineTo(dc,cx+half,cy-half); LineTo(dc,cx+half,cy+half); LineTo(dc,cx-half,cy+half); LineTo(dc,cx-half,cy-half); }
                        _ => { MoveToEx(dc,cx-half,cy-half,None); LineTo(dc,cx+half+1,cy+half+1); MoveToEx(dc,cx+half,cy-half,None); LineTo(dc,cx-half-1,cy+half+1); }
                    }
                    SelectObject(dc,previous_pen); DeleteObject(pen);
                    x+=width; continue;
                }
                text(
                    dc,
                    label,
                    RECT {
                        left: x,
                        right: x + width,
                        ..rect
                    },
                    COLORREF(0x00bddcc7),
                    DT_CENTER,
                );
                x += width;
            }
            SelectObject(dc, previous);
            DeleteObject(font);
            EndPaint(hwnd, &paint);
            return LRESULT(0);
        }
        WM_ERASEBKGND => return LRESULT(1),
        WM_MOUSEMOVE => {
            let x=(lp.0 as u16 as i16) as i32;
            if state.hover.replace(x)!=x { InvalidateRect(hwnd,None,false); }
            use windows::Win32::UI::Input::KeyboardAndMouse::{TrackMouseEvent, TRACKMOUSEEVENT, TME_LEAVE};
            let mut tracking=TRACKMOUSEEVENT {cbSize:std::mem::size_of::<TRACKMOUSEEVENT>() as u32,dwFlags:TME_LEAVE,hwndTrack:hwnd,dwHoverTime:0};
            let _=TrackMouseEvent(&mut tracking);
        }
        0x02A3 /* WM_MOUSELEAVE */ => { state.hover.set(-1); InvalidateRect(hwnd,None,false); }
        WM_LBUTTONDBLCLK => {
            let mut rect=RECT::default(); let _=GetClientRect(hwnd,&mut rect);
            if ((lp.0 as u16 as i16) as i32) < rect.right-px(hwnd,240) {
                let parent=GetParent(hwnd);
                ShowWindow(parent,if IsZoomed(parent).as_bool() { SW_RESTORE } else { SW_MAXIMIZE });
            }
            return LRESULT(0);
        }
        WM_LBUTTONDOWN => {
            let mut rect = RECT::default();
            let _ = GetClientRect(hwnd, &mut rect);
            let x = (lp.0 as u16 as i16) as i32;
            let unit = px(hwnd, 42).min(rect.right / 7);
            let parent = GetParent(hwnd);
            let right = rect.right - x;
            if right <= unit {
                let _ = PostMessageW(parent, WM_CLOSE, WPARAM(0), LPARAM(0));
            } else if right <= unit * 2 {
                let _ = ShowWindow(
                    parent,
                    if IsZoomed(parent).as_bool() {
                        SW_RESTORE
                    } else {
                        SW_MAXIMIZE
                    },
                );
            } else if right <= unit * 3 {
                let _ = ShowWindow(parent, SW_MINIMIZE);
            } else if right <= unit * 3 + unit * 12 / 7 {
                suspend(hwnd, state);
            } else if right <= unit * 4 + unit * 12 / 7 {
                resume(hwnd, state);
                if let Ok(core) = state.controller.CoreWebView2() {
                    let _ = core.Reload();
                }
            } else {
                let mut point = windows::Win32::Foundation::POINT::default();
                let _ = GetCursorPos(&mut point);
                let position =
                    LPARAM(((point.y as u16 as u32) << 16 | point.x as u16 as u32) as isize);
                let _ = PostMessageW(
                    parent,
                    WM_NCLBUTTONDOWN,
                    WPARAM(HTCAPTION as usize),
                    position,
                );
            }
            return LRESULT(0);
        }
        RESUME => {
            resume(hwnd, state);
            return LRESULT(0);
        }
        SLEEP => {
            suspend(hwnd, state);
            return LRESULT(0);
        }
        IS_SLEEPING => return LRESULT(isize::from(matches!(state.status.get(), 1 | 2))),
        WM_NCDESTROY => {
            state.alive.set(false);
            RemoveWindowSubclass(hwnd, Some(caption_proc), CAPTION_ID);
            drop(Box::from_raw(data as *mut Caption));
        }
        _ => {}
    }
    DefSubclassProc(hwnd, msg, wp, lp)
}
unsafe extern "system" fn parent_proc(
    hwnd: HWND,
    msg: u32,
    wp: WPARAM,
    lp: LPARAM,
    _: usize,
    _: usize,
) -> LRESULT {
    let result = DefSubclassProc(hwnd, msg, wp, lp);
    match msg {
        WM_SIZE | WM_DPICHANGED => layout(hwnd),
        WM_SETTEXT => {
            InvalidateRect(GetDlgItem(hwnd, CAPTION_ID as i32), None, false);
        }
        WM_NCDESTROY => {
            RemoveWindowSubclass(hwnd, Some(parent_proc), CAPTION_ID);
        }
        _ => {}
    }
    result
}

pub fn install(window: &Window) -> Result<(), String> {
    let parent = HWND(window.hwnd().map_err(|e| e.to_string())?.0);
    let (tx, rx) = std::sync::mpsc::channel();
    window
        .with_webview(move |webview| unsafe {
            let result = (|| -> Result<(), String> {
                let bar = CreateWindowExW(
                    WINDOW_EX_STYLE(0),
                    windows::core::w!("STATIC"),
                    windows::core::w!("网页工具栏"),
                    WS_CHILD | WS_VISIBLE,
                    0,
                    0,
                    1,
                    1,
                    parent,
                    HMENU(CAPTION_ID as isize),
                    None,
                    None,
                );
                if bar.0 == 0 {
                    return Err("无法创建网页工具栏".into());
                }
                let panel = CreateWindowExW(
                    WINDOW_EX_STYLE(0),
                    windows::core::w!("STATIC"),
                    windows::core::w!("网页休眠"),
                    WS_CHILD,
                    0,
                    0,
                    1,
                    1,
                    parent,
                    HMENU((CAPTION_ID + 1) as isize),
                    None,
                    None,
                );
                if panel.0 == 0 {
                    let _ = DestroyWindow(bar);
                    return Err("无法创建休眠提示".into());
                }
                let data = Box::into_raw(Box::new(Caption {
                    controller: webview.controller(),
                    status: Rc::new(Cell::new(0)),
                    generation: Rc::new(Cell::new(0)),
                    alive: Rc::new(Cell::new(true)),
                    hover: Cell::new(-1),
                }));
                if !SetWindowSubclass(bar, Some(caption_proc), CAPTION_ID, data as usize).as_bool()
                {
                    drop(Box::from_raw(data));
                    let _ = DestroyWindow(bar);
                    let _ = DestroyWindow(panel);
                    return Err("无法初始化网页工具栏".into());
                }
                if !SetWindowSubclass(panel, Some(sleep_proc), CAPTION_ID, 0).as_bool()
                    || !SetWindowSubclass(parent, Some(parent_proc), CAPTION_ID, 0).as_bool()
                {
                    let _ = DestroyWindow(bar);
                    let _ = DestroyWindow(panel);
                    return Err("无法初始化网页布局".into());
                }
                layout(parent);
                Ok(())
            })();
            let _ = tx.send(result);
        })
        .map_err(|e| e.to_string())?;
    rx.recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "网页工具栏初始化超时".to_string())?
}
pub fn wake(window: &Window) {
    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let bar = GetDlgItem(HWND(hwnd.0), CAPTION_ID as i32);
            if bar.0 != 0 {
                let _ = PostMessageW(bar, RESUME, WPARAM(0), LPARAM(0));
            }
        }
    }
}

pub fn is_sleeping(window: &Window) -> bool {
    window.hwnd().ok().is_some_and(|hwnd| unsafe {
        let bar = GetDlgItem(HWND(hwnd.0), CAPTION_ID as i32);
        bar.0 != 0 && SendMessageW(bar, IS_SLEEPING, WPARAM(0), LPARAM(0)).0 != 0
    })
}

#[cfg(test)]
pub fn caption_handle(window: &Window) -> HWND {
    unsafe { GetDlgItem(HWND(window.hwnd().unwrap().0), CAPTION_ID as i32) }
}
