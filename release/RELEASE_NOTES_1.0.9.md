# HudBrowse 1.0.9

- 修复最小化后恢复偶发的 `Invalid window outline`：异形窗口更新跳过最小化、零尺寸及尚未完成布局的过渡帧。
- 图标切换为 `public/hudbrowse-small.png` 的 285×284 版本；桌面 PNG 保留 285 像素源图，ICO 生成 16、24、32、48、64、128、256px 方形帧。
- 修复捕获窗口重连误报“匹配到多个窗口”：多个同 exe、类名和标题的候选使用原捕获窗口尺寸进行二次消歧，距离相同才要求重新选择。

验证：29 项前端单元测试、9 项端到端测试、13 项 Rust 单元测试、Clippy（`-D warnings`）及 1 项真实 WebView2 集成测试通过；生产构建和 NSIS 打包成功。

Git 分支：`codex/icon-layout-fixes`。修改前回退标签：`v1.0.8`。发布标签：`v1.0.9`。未配置远程仓库，版本保存在本地。

直接运行 `HudBrowse_1.0.9_x64.exe`，或使用 `HudBrowse_1.0.9_x64-setup.exe` 安装。若任务栏仍显示旧图标，请退出旧进程后重新固定程序；Windows 可能继续使用旧图标缓存。
