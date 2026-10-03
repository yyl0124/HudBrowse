# 贡献指南

感谢参与 HudBrowse。提交代码前请先确认问题可以在 Windows 10/11 上复现，并尽量提供最小复现步骤。

## 开始开发

```powershell
git clone <仓库地址>
cd HudBrowse
npm ci
npm run tauri:dev
```

详细环境、测试和发布流程见 [`docs/development.md`](./docs/development.md)。

## 提交前检查

```powershell
npm run build
npm test
npm run test:e2e
cd src-tauri
cargo fmt --all -- --check
cargo test
cargo clippy --all-targets -- -D warnings
```

如果改动涉及 Win32 窗口、WebView2、快捷键、托盘、DPI 或会话恢复，请在真实 Windows 桌面会话中额外验证，并在 PR 中写明环境。

## 提交约定

- 一个提交尽量只解决一个主题。
- 提交标题使用祈使句，建议格式：`修复 ...`、`新增 ...`、`整理 ...`。
- 不提交 `node_modules/`、`src-tauri/target/`、`dist/`、视频渲染输出、真实用户数据和 EXE/MSI。
- 新增用户可见功能时同步补充测试、README 或版本说明。
- 不要在日志、截图或测试 fixture 中包含 Cookie、个人网址、窗口句柄和本机路径。

## Pull Request

PR 描述应包含：变更目的、用户可见行为、测试命令、Windows/WebView2 版本，以及已知限制。涉及界面时附上前后截图；涉及窗口生命周期时说明启动、隐藏、恢复、退出四种路径。
