# Fadai Universe · Usage Guide

A living screen creature that dances with your music: open your music player and its little orb appears; when music plays and the computer has been idle for a moment, it automatically goes fullscreen, turning sound waves into spheres, whales, and jellyfish drifting across the screen.

## Supported Platforms

- **macOS 14+** (Apple Silicon: M1 / M2 / M3 / M4) → installer `fadai-universe-x.x.x-arm64.dmg`
- **Windows 10 / 11** (64-bit) → installer `fadai-universe-Setup-x.x.x.exe`
- First use requires microphone permission (used to capture music and drive the visualization)

## Installation

### macOS
1. Double-click the `.dmg`, drag **Fadai Universe** into **Applications**
2. If "cannot verify developer" appears on first open: find it in **Applications**, **right-click → Open** → click **Open**

### Windows
1. Double-click `fadai-universe-Setup-x.x.x.exe` and follow the wizard (you can change the install directory; a desktop shortcut is created automatically)
2. If a microphone permission prompt appears on first use: Windows Settings → Privacy & Security → Microphone → allow **Fadai Universe**

### First Launch (same on both platforms)
The **Bind Music Player** window pops up: pick the players you use (multi-select allowed), click **Save Binding**.

## Usage

1. After binding, **open a bound player** (NetEase Cloud Music / QQ Music / Spotify / Apple Music, etc.) → the floating orb appears in a screen corner
2. Click the orb → opens the visualization; or let music play + ~1 minute idle and it goes fullscreen automatically
3. While fullscreen: click the ⛶ button in the corner, or press ESC to exit
4. Switch players: right-click the orb → "Bind Player…" and pick again

## FAQ

**Q: The orb doesn't appear?**
Check that you finished binding and the player was opened AFTER binding (if the player was already running when the app started, you may need to restart the app or reopen the player once).

**Q: How do I exit fullscreen?**
Click the ⛶ button or press ESC. Wiggling the mouse won't exit (by design — avoids accidental interruption).

**Q: No visible reaction to the music?**
Make sure the system allows **Fadai Universe** to use the microphone (macOS: System Settings → Privacy & Security → Microphone; Windows: Settings → Privacy & Security → Microphone). Keep playback volume reasonable; it works best when sound comes out of speakers/headphones.

**Q: Want to switch to a different player?**
Right-click the orb → "Bind Player…" → pick and save again.

**Q: How do I quit completely?**
Right-click the orb → "Quit"; or quit the app from the taskbar/Dock.

## Privacy

- Runs 100% locally, uploads nothing
- Microphone capture only happens while the app is running, used for real-time sound analysis
- Player detection only reads whether a process is running — it never reads your play history
