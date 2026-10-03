# 窗口透明度修复说明

## 问题原因

之前的实现使用 CSS 的 `opacity` 来设置透明度，这只影响网页内容，不影响窗口本身。

```rust
// ❌ 错误的方法
let script = format!("document.documentElement.style.opacity = '{}'", opacity);
window.eval(&script)?;
```

## 修复方案

在 Windows 上，需要使用 Windows API 的 `SetLayeredWindowAttributes` 来设置窗口级别的透明度。

### 实现步骤

1. **设置 WS_EX_LAYERED 样式**
   - 这是使用分层窗口功能的前提

2. **调用 SetLayeredWindowAttributes**
   - 参数：窗口句柄、颜色键、alpha 值（0-255）、标志
   - `LWA_ALPHA` 表示使用 alpha 通道

### 代码实现

```rust
fn set_window_opacity_internal(window: &Window, opacity: f64) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::WindowsAndMessaging::*;
        use windows::Win32::Graphics::Gdi::*;

        let hwnd = HWND(window.hwnd()?.0 as isize);
        
        unsafe {
            // 1. 设置 WS_EX_LAYERED 样式
            let mut style = GetWindowLongW(hwnd, GWL_EXSTYLE);
            style |= WS_EX_LAYERED.0 as i32;
            SetWindowLongW(hwnd, GWL_EXSTYLE, style);
            
            // 2. 设置透明度 (0.0-1.0 -> 0-255)
            let alpha = (opacity * 255.0) as u8;
            SetLayeredWindowAttributes(hwnd, COLORREF(0), alpha, LWA_ALPHA)?;
        }
    }
    
    Ok(())
}
```

## 测试步骤

1. **设置全局透明度**
   - 打开应用 → 全局设置
   - 调整"默认透明度"滑块（例如设为 50%）
   - 保存设置

2. **创建新窗口**
   - 添加一个新网址
   - 设置快捷键并保存

3. **验证透明度**
   - 按快捷键打开窗口
   - 查看终端输出：`应用窗口设置: opacity=50`
   - 查看终端输出：`窗口透明度已设置为: 0.5 (alpha: 127)`
   - **窗口应该是半透明的，能看到后面的内容**

## 已应用的位置

透明度设置已在以下两个地方应用：

1. **`create_browser_window`** - 通过"打开"按钮创建窗口时
2. **`toggle_or_create_window`** - 通过快捷键创建窗口时

## 其他注意事项

### 透明度范围
- 前端：0-100（百分比）
- 后端：0.0-1.0（小数）
- Windows API：0-255（字节）

### 与鼠标穿透的关系
- 透明度和鼠标穿透是独立的功能
- 两者可以同时启用
- 都需要设置 `WS_EX_LAYERED` 样式

### 平台差异
- Windows：使用 `SetLayeredWindowAttributes`
- macOS/Linux：可能需要不同的实现（目前使用 CSS fallback）

## 下一步

修复其他功能：
- [x] 透明度 ✅
- [ ] 鼠标移出隐藏
- [ ] 鼠标穿透
- [ ] 贴边隐藏
- [ ] 默认宽度和高度

