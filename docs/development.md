# 开发指南

## 环境

- Windows 10/11 x64
- Node.js 18+
- Rust stable + MSVC toolchain
- WebView2 Runtime
- Git

安装 Rust：

```powershell
winget install Rustlang.Rustup
rustup default stable-x86_64-pc-windows-msvc
```

## 安装与运行

```powershell
npm ci
npm run tauri:dev
```

前端独立开发：

```powershell
npm run dev
```

独立前端预览无法调用 Tauri IPC，因此不能验证窗口捕获、快捷键、托盘和 Win32 窗口行为。

## 验证命令

```powershell
npm run build
npm test
npm run test:e2e

cd src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

涉及真实窗口、WebView2 或多显示器时，使用 Windows 桌面会话运行原生测试。原生冒烟测试可能创建临时窗口，并不替代管理员权限窗口、高 DPI、多显示器和第三方应用兼容性测试。

## 代码约定

- React 组件放在 `src/components`，页面放在 `src/pages`，跨页面状态放在 `src/store`。
- 与 Tauri 的调用集中在 `src/services` 或已有 Hook 中，避免组件直接散落 IPC 字符串。
- 目标类型统一走 `UrlConfig.type` 和 target service，不要为网址、捕获窗口和场景复制三套状态机。
- Rust 的 Win32 代码保持在对应模块，跨模块共享的数据放入 `models.rs`。
- 用户可见文案使用简体中文；代码标识、命令和日志保持英文可检索性。
- 动画优先使用 `transform` 和 `opacity`，避免在高频事件中触发布局抖动。

## 版本与发布

同步修改以下版本字段：

- `package.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `package.version`
- `src-tauri/tauri.conf.json` 的 `package.version`

执行生产构建：

```powershell
npm run tauri:build
```

产物在 `src-tauri/target/release/bundle/`。发布时：

1. 为版本创建 Git tag，例如 `v1.0.19`。
2. 将 EXE/MSI 上传到 GitHub Release，不把二进制提交到源码仓库。
3. 在 `release/RELEASE_NOTES_<version>.md` 记录变更。
4. 使用 `Get-FileHash -Algorithm SHA256` 生成校验文件。
5. 更新 README 中的当前版本和已知限制。

## 配置与本地数据

开发过程中不要提交真实的 WebView2 用户数据、Cookie、窗口句柄、个人网址或本地配置快照。测试 fixture 应使用虚构的 URL、窗口标题和进程信息。
