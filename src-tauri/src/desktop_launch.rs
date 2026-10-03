//! Ask the existing desktop Shell to launch user apps outside HudBrowse's process tree.
use std::{mem::ManuallyDrop, os::windows::ffi::OsStrExt, path::Path, thread};
use windows::{
    core::{ComInterface, Interface, BSTR},
    Win32::{
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, IDispatch, IServiceProvider,
                CLSCTX_LOCAL_SERVER, COINIT_APARTMENTTHREADED,
            },
            Variant::{VariantClear, VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_BSTR},
        },
        UI::Shell::{
            IShellBrowser, IShellDispatch2, IShellFolderViewDual, IShellWindows,
            SID_STopLevelBrowser, ShellWindows, SVGIO_BACKGROUND, SWC_DESKTOP, SWFO_NEEDDISPATCH,
        },
    },
};

struct Apartment;
impl Drop for Apartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

struct DirectoryVariant(VARIANT);
impl Drop for DirectoryVariant {
    fn drop(&mut self) {
        unsafe {
            let _ = VariantClear(&mut self.0);
        }
    }
}

pub fn launch(path: &Path) -> Result<(), String> {
    let path = path.to_owned();
    // Tauri workers can use different COM apartment types. A short-lived STA owns
    // all Shell interfaces and releases them before balancing CoInitializeEx.
    thread::spawn(move || unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).map_err(|e| e.to_string())?;
        let _apartment = Apartment;
        launch_in_apartment(&path).map_err(|e| format!("无法通过 Windows 桌面启动程序：{e}"))
    })
    .join()
    .map_err(|_| "Windows 桌面启动线程异常".to_string())?
}

unsafe fn launch_in_apartment(path: &Path) -> windows::core::Result<()> {
    let shell_windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_LOCAL_SERVER)?;
    let empty = VARIANT::default();
    let mut desktop = None;
    let mut hwnd = 0;
    shell_windows.FindWindowSW(
        &empty,
        &empty,
        SWC_DESKTOP,
        &mut hwnd,
        SWFO_NEEDDISPATCH,
        &mut desktop,
    )?;
    let desktop = desktop.ok_or_else(|| {
        windows::core::Error::new(
            windows::Win32::Foundation::E_FAIL,
            "找不到 Windows 桌面，请稍后重试".into(),
        )
    })?;
    let provider: IServiceProvider = desktop.cast()?;
    let mut browser = std::ptr::null_mut();
    provider.QueryService(&SID_STopLevelBrowser, &IShellBrowser::IID, &mut browser)?;
    let browser = IShellBrowser::from_raw(browser);
    let view = browser.QueryActiveShellView()?;
    let background: IDispatch = view.GetItemObject(SVGIO_BACKGROUND)?;
    let folder: IShellFolderViewDual = background.cast()?;
    let shell: IShellDispatch2 = folder.Application()?.cast()?;
    let file = BSTR::from_wide(&path.as_os_str().encode_wide().collect::<Vec<_>>())?;
    let directory = BSTR::from_wide(
        &path
            .parent()
            .unwrap_or(path)
            .as_os_str()
            .encode_wide()
            .collect::<Vec<_>>(),
    )?;
    let directory = DirectoryVariant(VARIANT {
        Anonymous: VARIANT_0 {
            Anonymous: ManuallyDrop::new(VARIANT_0_0 {
                vt: VT_BSTR,
                Anonymous: VARIANT_0_0_0 {
                    bstrVal: ManuallyDrop::new(directory),
                },
                ..Default::default()
            }),
        },
    });
    // ShellExecute receives values by ABI, but does not take ownership of their BSTRs.
    // Keep the directory allocation alive until the synchronous COM call completes.
    shell.ShellExecute(
        &file,
        empty.clone(),
        directory.0.clone(),
        empty.clone(),
        empty,
    )
}
