# 发布资产

本地 `release/` 目录可以保留历次 Windows `EXE` 和 `setup.exe`，便于测试旧版本和核对升级路径；这些二进制不纳入 Git，发布时上传到对应的 GitHub Release。

## 发布步骤

```powershell
npm ci
npm run tauri:build
Get-FileHash -Algorithm SHA256 .\src-tauri\target\release\bundle\nsis\*.exe
```

发布说明文件命名为 `RELEASE_NOTES_<version>.md`，校验文件命名为 `SHA256SUMS_<version>.txt`。当前版本的变更见 [`RELEASE_NOTES_1.0.18.md`](./RELEASE_NOTES_1.0.18.md)。
