use crate::window_manager::WindowManager;
use tauri::{AppHandle, Manager};
use webview2_com::{ClearBrowsingDataCompletedHandler, Microsoft::Web::WebView2::Win32::*};
use windows_legacy::core::Interface;

#[tauri::command]
pub async fn page_action(id: String, action: String, app: AppHandle) -> Result<(), String> {
    let window = app
        .state::<WindowManager>()
        .window(&id)
        .ok_or("网页窗口尚未打开")?;
    match action.as_str() {
        "refresh" => return window.eval("location.reload()").map_err(|e| e.to_string()),
        "back" => return window.eval("history.back()").map_err(|e| e.to_string()),
        "forward" => return window.eval("history.forward()").map_err(|e| e.to_string()),
        "clear_cache" | "clear_cookies" => {}
        _ => return Err("Unknown page action".into()),
    }
    let (tx, rx) = tokio::sync::oneshot::channel::<Result<(), String>>();
    window
        .with_webview(move |webview| unsafe {
            let mut sender = Some(tx);
            let result = (|| -> Result<(), String> {
                let core = webview
                    .controller()
                    .CoreWebView2()
                    .map_err(|e| e.to_string())?;
                if action == "clear_cookies" {
                    let core: ICoreWebView2_2 = core.cast().map_err(|e| e.to_string())?;
                    core.CookieManager()
                        .and_then(|manager| manager.DeleteAllCookies())
                        .map_err(|e| e.to_string())?;
                } else {
                    let core: ICoreWebView2_13 = core.cast().map_err(|e| {
                        format!("WebView2 Runtime must support profile data clearing: {}", e)
                    })?;
                    let profile: ICoreWebView2Profile2 = core
                        .Profile()
                        .and_then(|profile| profile.cast())
                        .map_err(|e| e.to_string())?;
                    let tx = sender.take().unwrap();
                    let completion =
                        ClearBrowsingDataCompletedHandler::create(Box::new(move |result| {
                            let _ = tx.send(result.map_err(|e| e.to_string()));
                            Ok(())
                        }));
                    profile
                        .ClearBrowsingData(
                            COREWEBVIEW2_BROWSING_DATA_KINDS_DISK_CACHE
                                | COREWEBVIEW2_BROWSING_DATA_KINDS_ALL_DOM_STORAGE,
                            &completion,
                        )
                        .map_err(|e| e.to_string())?;
                }
                Ok(())
            })();
            if let Some(sender) = sender {
                let _ = sender.send(result);
            }
        })
        .map_err(|e| e.to_string())?;
    tokio::time::timeout(std::time::Duration::from_secs(15), rx)
        .await
        .map_err(|_| "清理网页数据超时".to_string())?
        .map_err(|_| "网页窗口已关闭或清理请求失败".to_string())??;
    window.eval("location.reload()").map_err(|e| e.to_string())
}
