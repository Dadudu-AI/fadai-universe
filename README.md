# 发呆音宇宙 🎵

一个会随音乐律动的屏幕生命体。打开你的音乐播放器，它的小球会出现；播放音乐且电脑空闲片刻，它会自动全屏，让声波化作球体、鲸鱼、水母在星海里游动。

**发呆音宇宙 · 进来发发呆**

## 功能特性

- 🎧 **绑定你的播放器**：首次启动选择你常用的音乐播放器（网易云 / QQ音乐 / Spotify / Apple Music 等，可多选），打开它时悬浮球自动出现
- 🌌 **自动全屏屏保**：播放音乐 + 电脑空闲 60 秒 → 自动全屏律动（窗口已打开但没全屏也会自动切入全屏）
- 🐋 **三种生命形态**：球体 / 鲸鱼 / 水母，随音乐节奏生成、律动、消散
- ⛶ **退出全屏**：点右上角缩放按钮或按 ESC（晃动鼠标不会退出，避免误触）
- 🎙️ **麦克风拾音**：采集环境音乐声音驱动实时可视化，全程本地运行、不上传任何数据

## 下载安装

前往 [Releases](https://github.com/Dadudu-AI/fadai-universe/releases) 下载对应平台的安装包：

| 平台 | 文件 | 说明 |
|------|------|------|
| macOS (Apple Silicon) | `发呆音宇宙-x.x.x-arm64.dmg` | 双击安装，拖入应用程序 |
| Windows 10/11 x64 | `发呆音宇宙-Setup-x.x.x.exe` | 双击安装，按向导操作 |

> 未签名应用首次打开可能提示"无法验证开发者"（macOS 右键→打开；Windows 点"更多信息→仍要运行"），属正常现象。

## 使用

1. 安装后首次打开，弹出「绑定音乐播放器」→ 选择你的播放器 → 保存
2. 打开绑定的播放器 → 屏幕角落出现悬浮球
3. 点悬浮球打开可视化；或等播放音乐 + 电脑空闲约 1 分钟自动全屏
4. 换播放器：右键悬浮球 →「绑定播放器…」

详细说明见 [使用说明.md](使用说明.md)

## 技术栈

- **Electron** 桌面封装（macOS + Windows）
- **Three.js** 3D 可视化（粒子系统、Shader 特效、Bloom 后期）
- **Web Audio API** 麦克风实时频谱分析
- 播放器检测：macOS 用 Swift 原生探针（`bin/musicstate.swift`），Windows 用 PowerShell 脚本（`bin/musicstate.js`）

## 开发

```bash
npm install
npm start          # 本地运行
npm run dist       # 打包 macOS dmg
npx electron-builder --win --x64   # 打包 Windows exe
```

> 国内网络打包前设置镜像：`export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`、`export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"`

## 隐私

- 全程本地运行，不上传任何数据
- 麦克风采集仅在 App 运行时进行，用于实时声波分析
- 检测播放器状态只读取进程是否运行，不读取你的播放记录

---
© 2026 发呆音宇宙
