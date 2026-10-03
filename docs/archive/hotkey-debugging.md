# 快捷键调试指南

## 问题现象

- 重新录制快捷键后可以正常工作
- 但重启应用后，快捷键失效
- 按快捷键时没有任何控制台输出

## 调试步骤

### 1. 查看应用启动日志

重启应用后，控制台应该显示：

```
数据加载中...
URL 配置加载完成，共 X 个
✅ 数据加载完成，开始初始化应用
📊 URL 配置数量: X
🔑 重新注册快捷键...
=== 开始重新注册快捷键 ===
传入的 URL 配置数量: X
从存储中读取的快捷键数量: X
快捷键映射: [...]
```

**如果没有看到这些日志，说明初始化流程没有执行。**

### 2. 检查 localStorage

打开浏览器开发者工具（F12），在 Console 中输入：

```javascript
// 查看存储的 URL 配置
console.log('URL 配置:', localStorage.getItem('url_configs'));

// 查看存储的快捷键
console.log('快捷键:', localStorage.getItem('hotkeys'));
```

应该看到 JSON 格式的数据。

### 3. 手动测试快捷键 API

在控制台中运行：

```javascript
import { register, isRegistered } from '@tauri-apps/api/globalShortcut';

// 测试注册
await register('CommandOrControl+F1', () => {
  console.log('测试快捷键触发!');
});

// 检查是否注册成功
const registered = await isRegistered('CommandOrControl+F1');
console.log('CommandOrControl+F1 已注册:', registered);
```

然后按 `Ctrl+F1`，看是否有输出。

### 4. 常见问题排查

#### 问题 A：没有初始化日志

**可能原因**：
- `isLoading` 状态卡住了
- `urlConfigs` 为空但实际有数据

**解决**：检查 `useUrlManager` Hook 的日志

#### 问题 B：快捷键注册失败

**可能原因**：
- 快捷键格式不对（应该是 `CommandOrControl+X`）
- 快捷键被系统或其他应用占用
- Tauri API 权限问题

**解决**：
1. 检查快捷键格式
2. 尝试不同的快捷键组合
3. 检查 `tauri.conf.json` 中的 `globalShortcut.all: true`

#### 问题 C：注册成功但不触发

**可能原因**：
- 回调函数闭包问题
- 异步问题

**解决**：查看详细的错误日志

## 预期的完整日志流程

```
1. 应用启动
   └─ 数据加载中...
   
2. 数据加载完成
   └─ URL 配置加载完成，共 1 个
   
3. 初始化应用
   ├─ ✅ 数据加载完成，开始初始化应用
   ├─ 📊 URL 配置数量: 1
   └─ 🔑 重新注册快捷键...
   
4. 注册快捷键
   ├─ === 开始重新注册快捷键 ===
   ├─ 传入的 URL 配置数量: 1
   ├─ 从存储中读取的快捷键数量: 1
   ├─ 快捷键映射: [["url_xxx", "CommandOrControl+2"]]
   ├─ --- 注册快捷键 1/1 ---
   ├─ URL ID: url_xxx
   ├─ 快捷键: CommandOrControl+2
   ├─ 找到配置: jimeng https://jimeng.jianying.com/
   ├─ 保存配置到后端...
   ├─ 在前端注册全局快捷键...
   ├─ ✅ 重新注册快捷键成功: CommandOrControl+2 for jimeng
   └─ === 快捷键注册完成 ===
      成功: 1, 失败: 0, 总计: 1
      
5. 初始化完成
   └─ ✨ 应用初始化完成
   
6. 按下快捷键
   ├─ 🎯 快捷键触发: CommandOrControl+2 URL ID: url_xxx
   ├─ toggle_or_create_window 被调用，URL ID: url_xxx
   └─ 窗口不存在，尝试创建新窗口...
```

## 如果问题仍然存在

请将完整的控制台日志发给我，包括：
1. 应用启动时的所有日志
2. 按快捷键时的输出（或没有输出）
3. localStorage 的内容

