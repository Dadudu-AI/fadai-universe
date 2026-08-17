# Fadai Universe 🎵

A living screen creature that dances with your music. Open your music player and its little orb appears; when music plays and your computer has been idle for a moment, it automatically goes fullscreen — turning sound waves into spheres, whales, and jellyfish drifting through a starry sea.

**Fadai Universe · come and daydream**

## Features

- 🎧 **Bind your player**: on first launch, pick the music apps you use (NetEase Cloud Music / QQ Music / Spotify / Apple Music, etc., multi-select allowed). The floating orb appears automatically whenever a bound player is open
- 🌌 **Auto-fullscreen screensaver**: music playing + 60s idle → automatic fullscreen visualization (even if the window is already open but not fullscreen, it switches in by itself)
- 🐋 **Three living forms**: Orb / Whale / Jellyfish — born, dancing, and dissolving with the rhythm
- ⛶ **Exit fullscreen**: click the ⛶ button or press ESC (wiggling the mouse does NOT exit — avoids accidental interrupts)
- 🎙️ **Microphone input**: captures ambient music to drive real-time visuals. Runs 100% locally, nothing is ever uploaded

## Download & Install

Grab the installer for your platform from [Releases](https://github.com/Dadudu-AI/fadai-universe/releases):

| Platform | File | Notes |
|----------|------|-------|
| macOS (Apple Silicon) | `fadai-universe-x.x.x-arm64.dmg` | Double-click to mount, drag into Applications |
| Windows 10/11 x64 | `fadai-universe-Setup-x.x.x.exe` | Double-click and follow the wizard |

> Unsigned apps may warn "cannot verify developer" on first open (macOS: right-click → Open; Windows: More info → Run anyway). This is normal.

## Usage

1. On first launch, the "Bind Music Player" window pops up → pick your players → Save
2. Open a bound player → the floating orb appears in a screen corner
3. Click the orb to open the visualization; or just let music play + ~1 minute idle for auto-fullscreen
4. Switch players: right-click the orb → "Bind Player…"

See [USAGE.md](USAGE.md) for details.

## Tech Stack

- **Electron** desktop wrapper (macOS + Windows)
- **Three.js** 3D visualization (particle systems, shader effects, Bloom post-processing)
- **Web Audio API** real-time microphone spectrum analysis
- Player detection: native Swift probe on macOS (`bin/musicstate.swift`), PowerShell script on Windows (`bin/musicstate.js`)

## Development

```bash
npm install
npm start          # run locally
npm run dist       # build macOS dmg
npx electron-builder --win --x64   # build Windows exe
```

> Building from China? Set mirrors first: `export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"`, `export ELECTRON_BUILDER_BINARIES_MIRROR="https://npmmirror.com/mirrors/electron-builder-binaries/"`

## Privacy

- Runs 100% locally, uploads nothing
- Microphone capture only happens while the app is running, used for real-time sound analysis
- Player detection only reads whether a process is running — it never reads your play history

---
© 2026 Fadai Universe
