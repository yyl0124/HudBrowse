# WebView2 运行占用优化研究

> 这是一份基于 HudBrowse 当前架构的性能基线与优化建议，不是对所有机器的固定承诺。每次优化应在相同 Windows、WebView2、DPI 和目标集合下重新测量。

## 结论摘要

截图是在没有打开任何网页目标时采集的。约 299 MB 不是 HudBrowse Rust 主进程本身占用了 299 MB，而是 Windows 任务管理器把主窗口对应的 WebView2 进程组归并显示的结果：GPU 进程约 204 MB、浏览器进程约 65 MB，另有 Network/Storage/Manager 和宿主进程。WebView2 的多进程模型本来就包含一个 browser process、一个或多个 renderer process，以及 GPU、音频等辅助进程；因此“只保留一个 HudBrowse.exe”并不能把这部分内存压到几 MB。无网页时应优先检查透明异形窗口的 GPU 合成和 Private Bytes/Commit 口径；网址 UDF 复用只影响后续打开多个网页的增量。

当前项目中最值得优先验证的结构性因素是网址窗口的用户数据目录：`src-tauri/src/browser.rs:16-21` 为每个目标使用 `webview_data/<config.id>`，并在 `:39` 传给 Tauri 的 `data_directory`。WebView2 官方定义是“每个用户数据目录对应一组进程”；不同目录会创建不同的进程组。多个网址窗口使用同一个目录时，浏览器进程和 GPU/辅助进程可以在该组内复用，但 renderer 仍可能按站点隔离增加。因此，当前目录设计在多个网址同时打开时可能比共享目录更占内存。

不建议通过 `--disable-gpu`、关闭 Site Isolation 或随意添加 Chromium flags 来“压”截图数字。微软明确把 browser flags 定位为测试/诊断工具，不保证生产兼容性；禁用 GPU 还可能把渲染成本转移到 CPU，并损害透明窗口、视频和动画性能。

## 当前架构与占用来源

| 组件 | 当前实现 | 对占用的意义 |
| --- | --- | --- |
| 主界面/灵动岛 | Tauri 1.5 + Wry/WebView2 | 至少有一个 WebView2 进程组，即使 Rust 宿主进程很小也会看到 GPU/Browser/Utility 进程 |
| 网址目标 | `WindowBuilder::new(... WindowUrl::External(...))` | 每个目标是一个真正的 WebView，不是普通 HWND 捕获 |
| 网址数据目录 | `app_data/webview_data/<target-id>` | 每个目录是一个独立 WebView2 session；多目录可能对应多组 Browser/GPU/Utility 进程 |
| 网页休眠 | `web_caption.rs:95-129` 调用 `ICoreWebView2_3::TrySuspend` | 已具备官方推荐的降内存路径，但目前主要由网页标题栏按钮触发 |
| 桌面窗口捕获 | Win32 HWND 操作 | 不会新建 WebView2 进程，主要成本是轮询/动画/窗口合成 |
| 灵动岛切换 | `shell.rs:114-168` 调整主窗口尺寸并启动 dock | 现有实现没有销毁 WebView；切换为小尺寸不会自动释放页面 renderer/GPU 资源 |

## 低风险、无需大改的优化顺序

### 1. 先建立可重复的基线

每次只改变一个变量，记录“冷启动、空闲 5 分钟、打开 1/3/5 个网址、最小化/休眠、恢复”五个状态：

1. 任务管理器记录 HudBrowse 进程组的总内存和 CPU。
2. 通过 WebView2 Browser Task Manager 查看 browser、GPU、renderer、utility 的分项；WebView2 官方提供 `OpenTaskManagerWindow`，其显示的是同一浏览器进程关联的全部进程。
3. 用 Process Explorer 或 Windows Performance Recorder 记录 Private Bytes、Working Set 和 Commit，避免把共享 GPU working set 当成完全私有内存。
4. 记录每个测试状态下的 `webview_data` 目录数量、大小和网页数量。

建议把“截图中的 299 MB”作为基准，不把它直接当成回归门槛。真正应该关注的是：第二个网址增加了多少 private bytes、休眠后 renderer/GPU 是否下降、切回是否重新加载页面。

### 2. 评估共享用户数据目录（预计多网址收益最大）

WebView2 官方文档说明：同一个 user data folder 的多个控制共享同一 WebView2 session 和进程集合；不同 folder 会产生不同的进程集合。当前每个目标一个目录，因此可以先做一个可回退的实验开关：

```text
app_data/webview_data/shared/       # 新建目标使用
app_data/webview_data/<target-id>/  # 旧目标兼容/迁移回退
```

建议方案：

- 默认把同一 HudBrowse 安装下的普通网址放入一个共享目录；首次启用时只迁移“配置仍存在且目录非空”的 cookies/cache，迁移失败保留旧目录并回退。
- 不要把不可信、需要强隔离或用户明确要求独立登录态的站点强行合并；可保留一个“独立数据目录”开关。
- 共享目录中的 cookie、权限、缓存会互通，属于行为变化，必须在设置或迁移提示中明确说明。
- 不要在同一目录上同时使用不一致的 WebView2 environment options。官方说明，同一 UDF 的 environment 配置（例如语言）不一致会导致后续 WebView 创建失败。

这是一个小范围实验，不需要重写页面或窗口管理：只需集中生成 `data_directory` 路径，并增加迁移/回退策略。验证重点是打开 3 个不同站点后 Browser/GPU 进程组数量和增量内存。

### 3. 把 TrySuspend 从“手动按钮”扩展为生命周期策略

当前网页标题栏已经在 `web_caption.rs:95-129` 完成 `SetIsVisible(false) -> TrySuspend`，这是正确的底层 API。微软文档明确说明 `TrySuspend` 的目的就是让 WebView2 消耗更少内存，成功完成后才处于 suspended 状态；`Resume` 后可继续交互。

在不改变用户体验的前提下，可以增加三条触发：

- 网页窗口隐藏/最小化持续 10~30 秒后自动尝试休眠；
- 主程序收缩为灵动岛时，所有当前不可见的网页窗口尝试休眠；
- 应用进入托盘时，只休眠不可见网址，不销毁用户仍希望快速恢复的窗口。

注意：`TrySuspend` 是异步且可能失败，不能把“请求已发出”当成“内存已释放”。保留当前 generation/alive 检查，并在回调中记录成功/失败次数；播放音频、WebRTC、下载或页面不支持挂起时应允许失败并继续显示。

### 4. 隐藏时停止高频轮询和无效重绘

桌面窗口捕获不产生 WebView2 进程，但窗口监视器和灵动岛动画仍可能消耗 CPU。建议只做局部优化：

- 隐藏目标后停止对应 `window_monitor` 定时器；显示时再恢复，而不是每次 tick 查询 HWND。
- 灵动岛没有动画、没有鼠标悬停时，把轮询间隔从高频降到 100~250 ms；拖拽/贴边时临时恢复高频。
- React 列表状态只在 target-state 真正变化时更新，避免每次轮询都触发整个列表渲染。
- 不在隐藏窗口上持续发送 `InvalidateRect`、位置同步和图标请求。

这些改动不会改变 WebView2 进程数量，但能降低空闲 CPU 和主线程唤醒次数，通常是最安全的第一批代码优化。

### 5. 收缩模式不要销毁主 WebView，先验证可见性策略

`set_main_compact` 当前只是把主窗口改成约 440x100（`shell.rs:128-167`），这有利于快速恢复，但尺寸变化本身不会释放 renderer/GPU 内存。若测试发现主页面在灵动岛期间仍占用明显资源，可考虑：

- 收缩前暂停主 WebView 中非必要的动画、定时器和实时状态订阅；
- 只隐藏主页面内容层，保留灵动岛所需的最小 DOM；
- 不要在每次切换时销毁/重建 WebView，除非实测长期驻留内存成为主要问题。重建会丢失页面状态、增加恢复延迟，并可能造成新的 WebView2 初始化峰值。

## 不推荐或需要谨慎的方案

### 禁用 GPU

`--disable-gpu` 会让 GPU 进程消失或变小，但可能使透明窗口、视频解码和 CSS 动画回退到软件路径，增加 CPU 和耗电；不同 WebView2 Runtime 版本的行为也可能不同。微软的 flags 文档明确要求生产应用不要依赖这些 flags。

### 关闭 Site Isolation 或限制 renderer

这会改变 Chromium 的安全边界，不能作为普通内存优化。站点隔离导致的 renderer 增长是按安全策略决定的，应该通过减少同时活跃的页面、休眠或关闭窗口处理。

### 通过清空缓存压内存

清理磁盘缓存不等于释放工作集，频繁清缓存反而会增加网络、CPU 和登录恢复成本。应提供用户主动清理数据的入口，不要把它作为自动内存策略。

### 每次隐藏都关闭窗口

关闭 controller 可以释放进程资源，但会牺牲恢复速度和页面状态。若要实现“闲置回收”，应使用可配置的长时间阈值（例如 30 分钟），先保存位置/尺寸/URL，再显式销毁并在下次打开时重建。

## 推荐的实施分期

**第一阶段（低风险）**：增加内存/进程观测日志；网页隐藏/最小化自动 `TrySuspend`；停止隐藏目标的监视器和图标刷新；补充 1/3/5 个网址的回归基线。

**第二阶段（可回退）**：增加共享 UDF 实验开关和旧目录回退；比较进程组数量、private bytes、恢复时间和登录态是否符合预期。若共享 UDF 对站点登录/权限有副作用，默认保留独立目录。

**第三阶段（按数据决定）**：对超过阈值长期未使用的网页执行关闭并按配置恢复；只有在确认 WebView2 renderer/GPU 是主因后，才评估窗口重建，不先引入浏览器 flags。

## 来源与可核验链接

1. Microsoft Learn — [WebView2 process model](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/process-model)：WebView2 process group 的 browser/renderer/GPU 组成；同一 user data folder 共享进程集合；不同目录创建不同集合；提供 Browser Task Manager 和 controller close 的说明。
2. Microsoft Learn — [Manage user data folders](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder)：UDF 与 session 的一一关系、同 UDF 共享 session、数据类型及迁移/权限注意事项。
3. Microsoft Learn — [ICoreWebView2_3](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2_3)：`TrySuspend` 用于降低内存；`IsSuspended` 的完成语义；`Resume` 可以恢复不可见 WebView。
4. Microsoft Learn — [WebView2 browser flags](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags)：flags 适合测试/诊断，生产应用不应依赖；`disable-gpu`、`disk-cache-size` 等参数的定义。
5. Tauri 1.x source — [`WindowBuilder` / Wry WebView2 backend](https://github.com/tauri-apps/tauri/tree/1.x/core/tauri-runtime-wry)：Tauri 1 在 Windows 使用 WebView2 controller；每个 Tauri Webview window 都是宿主控制的 WebView 实例。
6. Microsoft WebView2Samples — [WebView2APISample](https://github.com/MicrosoftEdge/WebView2Samples/tree/main/SampleApps/WebView2APISample)：官方开源 Win32 示例，展示显式创建 environment、管理 UDF、监听 process failure 和关闭 controller 的生命周期模式。
7. Chromium — [Browser architecture](https://developer.chrome.com/blog/inside-browser-part1/)：WebView2 官方 process model 引用的 Chromium 架构说明，可用于理解 renderer/GPU/utility 的拆分原因。

## 判断是否值得继续投入的门槛

以同一台机器、同一 WebView2 Runtime 和同一组网址比较：如果共享 UDF 不能减少进程组，或只减少少量 working set 却引发登录态/权限问题，就保留当前独立目录；如果自动 `TrySuspend` 在隐藏 30 秒后能明显降低 renderer private bytes 且恢复无白屏，就优先合入；如果多数占用来自 GPU shared working set，则不应为了任务管理器数字牺牲透明/视频体验。
