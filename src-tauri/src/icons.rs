use crate::window_capture::{identity_matches, WindowInfo};
use base64::{engine::general_purpose::STANDARD, Engine};
use windows::{
    core::HSTRING,
    Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        Graphics::Gdi::*,
        UI::{Shell::ExtractIconExW, WindowsAndMessaging::*},
    },
};

/// Icon acquisition is separate from the frequently polled window identity path.
#[tauri::command]
pub async fn get_window_icon(info: WindowInfo) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || unsafe {
        let icon = acquire(&info);
        if icon.0 == 0 {
            return Ok(None);
        }
        let result = encode(icon);
        let _ = DestroyIcon(icon);
        result.map(Some)
    })
    .await
    .map_err(|error| error.to_string())?
}

unsafe fn acquire(info: &WindowInfo) -> HICON {
    if identity_matches(info) {
        let hwnd = HWND(info.hwnd);
        for kind in [ICON_SMALL2, ICON_SMALL, ICON_BIG] {
            let mut result = 0usize;
            SendMessageTimeoutW(
                hwnd,
                WM_GETICON,
                WPARAM(kind as usize),
                LPARAM(0),
                SMTO_ABORTIFHUNG,
                100,
                Some(&mut result),
            );
            if result != 0 {
                if let Ok(icon) = CopyIcon(HICON(result as isize)) {
                    return icon;
                }
            }
        }
        for kind in [GCLP_HICONSM, GCLP_HICON] {
            let icon = HICON(GetClassLongPtrW(hwnd, kind) as isize);
            if icon.0 != 0 {
                if let Ok(copy) = CopyIcon(icon) {
                    return copy;
                }
            }
        }
    }
    let mut icon = HICON::default();
    ExtractIconExW(&HSTRING::from(&info.exe_path), 0, Some(&mut icon), None, 1);
    icon
}

unsafe fn render(icon: HICON, background: u8) -> Result<Vec<u8>, String> {
    let dc = CreateCompatibleDC(None);
    if dc.0 == 0 {
        return Err("Cannot create icon DC".into());
    }
    let mut info = BITMAPINFO::default();
    info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    info.bmiHeader.biWidth = 32;
    info.bmiHeader.biHeight = -32;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    let mut pixels = std::ptr::null_mut();
    let bitmap = match CreateDIBSection(dc, &info, DIB_RGB_COLORS, &mut pixels, None, 0) {
        Ok(bitmap) => bitmap,
        Err(error) => {
            DeleteDC(dc);
            return Err(error.to_string());
        }
    };
    let previous = SelectObject(dc, bitmap);
    std::ptr::write_bytes(pixels, background, 32 * 32 * 4);
    let result =
        DrawIconEx(dc, 0, 0, icon, 32, 32, 0, None, DI_NORMAL).map_err(|error| error.to_string());
    GdiFlush();
    let bytes = std::slice::from_raw_parts(pixels as *const u8, 32 * 32 * 4).to_vec();
    SelectObject(dc, previous);
    DeleteObject(bitmap);
    DeleteDC(dc);
    result.map(|_| bytes)
}

unsafe fn encode(icon: HICON) -> Result<String, String> {
    let black = render(icon, 0)?;
    let white = render(icon, 255)?;
    // Two backgrounds recover alpha for both modern ARGB and legacy masked icons.
    let mut rgba = Vec::with_capacity(black.len());
    for (dark, light) in black.chunks_exact(4).zip(white.chunks_exact(4)) {
        let alpha = 255 - light[0].saturating_sub(dark[0]);
        for channel in [2, 1, 0] {
            rgba.push(if alpha == 0 {
                0
            } else {
                ((dark[channel] as u32 * 255) / alpha as u32).min(255) as u8
            });
        }
        rgba.push(alpha);
    }
    let mut bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut bytes, 32, 32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|error| error.to_string())?;
        writer
            .write_image_data(&rgba)
            .map_err(|error| error.to_string())?;
    }
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn encodes_real_windows_icon_with_transparency() {
        unsafe {
            let icon = LoadIconW(None, IDI_APPLICATION).unwrap();
            let data = encode(icon).unwrap();
            let bytes = STANDARD.decode(data.split_once(',').unwrap().1).unwrap();
            let mut reader = png::Decoder::new(std::io::Cursor::new(bytes))
                .read_info()
                .unwrap();
            let mut pixels = vec![0; reader.output_buffer_size()];
            reader.next_frame(&mut pixels).unwrap();
            assert!(pixels.chunks_exact(4).any(|p| p[3] == 0));
            assert!(pixels.chunks_exact(4).any(|p| p[3] > 0));
        }
    }
}
