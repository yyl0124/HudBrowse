# HudBrowse

HudBrowse 是一个面向 Windows 的悬浮工作区：把常用网页、桌面窗口和工作场景收进一个可快速唤醒的界面。它适合阅读、资料整理、开发和需要频繁切换窗口的桌面工作流。

> 当前版本：`1.0.18`。项目处于公开源码整理阶段，部分原生能力仍需要在不同 Windows 版本、DPI 和多显示器环境中验证。

## 功能

- 网页目标：为网址创建独立浮动 WebView2 窗口，保留 Cookie、缓存和登录状态。
- 桌面窗口：捕获已经运行的 Windows 窗口，支持隐藏、恢复、位置记忆和进程重连。
- 全局快捷键：为目标配置快捷键，快速显示/隐藏或唤醒目标。
- 灵动岛：主窗口可收缩为紧凑入口，支持拖拽、目标排序和更多目标浏览。
- 场景：按保存的顺序组合多个网页或桌面窗口，一次快捷键恢复整套工作状态。
- 独立窗口配置：每个目标可覆盖全局默认的透明度、贴边隐藏、移出隐藏、鼠标穿透、置顶和尺寸设置。
- 分类管理：目标可按自定义分类筛选，支持分类新增、改名、换色和删除。
- 系统集成：系统托盘、开机启动、会话恢复、窗口图标和网页图标。
- 网页休眠：对支持的 WebView2 页面执行休眠和恢复，减少后台资源占用。

## 技术栈

| 层 | 技术 |
| --- | --- |
| UI | React 18、TypeScript、Vite、Zustand |
| 动效与图标 | GSAP、Lucide React |
| 桌面容器 | Tauri 1.5、Rust |
| 网页引擎 | Windows WebView2 |
| 原生能力 | Win32 窗口枚举、捕获、透明度、鼠标穿透、全局快捷键和系统托盘 |

HudBrowse 不需要独立后端服务或数据库。前端配置保存在 WebView 的本地存储，网页数据由 WebView2 用户数据目录持久化，桌面会话由 Rust 层保存到应用数据目录。

## 环境要求

- Windows 10/11 x64
- Node.js 18 或更高版本
- Rust stable、`rustup` 和 Windows MSVC 工具链
- WebView2 Runtime
- 开发原生功能时建议使用 Windows 桌面环境；Linux/macOS 无法运行窗口捕获和 Win32 相关测试

WebView2 Runtime：[Microsoft 官方下载页](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

## 快速开始

```powershell
git clone https://github.com/yyl0124/HudBrowse.git
cd HudBrowse
npm ci
npm run tauri:dev
```

仅预览前端界面：

```powershell
npm run dev
```

浏览器预览不具备窗口捕获、全局快捷键、系统托盘和原生窗口控制能力。

## 常用命令

```powershell
npm run build          # TypeScript 检查 + Vite 生产构建
npm test               # 前端单元测试
npm run test:e2e       # Playwright 流程测试
npm run tauri:build    # 构建 Windows 安装包和便携产物
```

Rust 侧检查：

```powershell
cd src-tauri
cargo test
cargo clippy --all-targets -- -D warnings
```

打包产物位于 `src-tauri/target/release/bundle/`。发布时请将 EXE/MSI 上传到 GitHub Release，不要提交到源码仓库；版本说明和校验文件见 [`release/`](./release/)。

## 项目结构

```text
src/                 React 页面、组件、Hooks、状态和样式
src-tauri/src/       Tauri 命令、窗口调度、Win32 集成和会话管理
public/              应用图标及静态资源
tests/               Playwright 流程测试与 fixture
docs/                架构、开发、UI、性能和历史资料
release/             版本说明与 SHA-256 校验文件
scripts/              图标同步等维护脚本
```

Rust 模块职责见 [`docs/architecture.md`](./docs/architecture.md)。开发环境和测试说明见 [`docs/development.md`](./docs/development.md)。

## 数据与隐私

- HudBrowse 不包含云端账号系统，也不会把目标配置上传到项目服务器。
- 网页 Cookie、缓存和登录状态由本机 WebView2 用户数据目录管理。
- 捕获桌面窗口需要读取本机窗口标题、进程和窗口句柄，用于重连目标；这些数据只用于本地运行。
- 第三方网页的隐私和数据处理规则由对应网站负责。

## 已知限制

- 仅支持 Windows；桌面窗口捕获依赖 Win32 窗口模型。
- 某些管理员权限窗口、受保护窗口、硬件加速内容或特殊框架窗口可能无法捕获或重连。
- 全局快捷键可能与 Windows 或其他软件冲突；注册失败时应用会保留旧配置。
- WebView2 使用多进程架构，任务管理器中看到的内存应按整个 WebView2 进程组评估。
- 真实使用中建议验证高 DPI、多显示器、任务栏位置和睡眠/唤醒后的窗口状态。

## 参与贡献

请先阅读 [`CONTRIBUTING.md`](./CONTRIBUTING.md)。提交问题时请提供 Windows 版本、WebView2 版本、HudBrowse 版本、复现步骤和相关日志，避免上传个人网页数据、Cookie 或完整用户数据目录。

## 许可证

本项目使用 [MIT License](./LICENSE)。第三方依赖及 `src-tauri/icons/` 中的资源仍受各自许可证或来源说明约束。
