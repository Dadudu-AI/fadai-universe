const { app, BrowserWindow, session, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let win;          // visualization fullscreen window
let ballWin;      // floating orb window
let bindWin;      // bind-player settings window
let detectTimer;  // foreground-app detection timer
let ballPos = null; // remembered orb position {x, y}

const BALL_STATE_FILE = () => path.join(app.getPath('userData'), 'ball-pos.json');

function loadBallPos() {
  try {
    const d = JSON.parse(fs.readFileSync(BALL_STATE_FILE(), 'utf-8'));
    if (typeof d.x === 'number' && typeof d.y === 'number') return d;
  } catch (e) { /* no state file on first run */ }
  return null;
}

function saveBallPos(x, y) {
  try {
    const d = loadBallPos() || {};
    d.x = x; d.y = y;
    fs.writeFileSync(BALL_STATE_FILE(), JSON.stringify(d));
  } catch (e) {}
}

function loadBallSkin() {
  try {
    const d = JSON.parse(fs.readFileSync(BALL_STATE_FILE(), 'utf-8'));
    if (d.skin) return d.skin;
  } catch (e) {}
  return 'orb';
}

function saveBallSkin(skin) {
  try {
    const d = loadBallPos() || {};
    d.skin = skin;
    fs.writeFileSync(BALL_STATE_FILE(), JSON.stringify(d));
  } catch (e) {}
}

// -- bound-player config (stores lowercase process names, e.g. ["neteasemusic","spotify"]) --
function loadBoundApps() {
  try {
    const d = JSON.parse(fs.readFileSync(BALL_STATE_FILE(), 'utf-8'));
    if (Array.isArray(d.boundApps) && d.boundApps.length > 0) return d.boundApps;
  } catch (e) {}
  return null; // null = never bound; default detection targets NetEase
}

function saveBoundApps(apps) {
  try {
    const d = loadBallPos() || {};
    d.boundApps = apps;
    fs.writeFileSync(BALL_STATE_FILE(), JSON.stringify(d));
  } catch (e) {}
}

// -- first-run guide flag: independent from the binding config --
// Whether the bind guide has been shown (regardless of save/skip/close).
// Uses a dedicated flag instead of boundApps: after a reinstall/re-download,
// leftover binding config in userData must NOT suppress the first-run guide.
function loadFirstRunDone() {
  try {
    const d = JSON.parse(fs.readFileSync(BALL_STATE_FILE(), 'utf-8'));
    if (d.firstRunDone) return true;
  } catch (e) {}
  return false;
}

function saveFirstRunDone() {
  try {
    const d = loadBallPos() || {};
    d.firstRunDone = true;
    fs.writeFileSync(BALL_STATE_FILE(), JSON.stringify(d));
  } catch (e) {}
}

function createWindow() {
  if (win && !win.isDestroyed()) return win;
  win = new BrowserWindow({
    width: 1280,
    height: 800,
    fullscreen: true,
    backgroundColor: '#010109',
    title: 'Fadai Universe',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  // Auto-allow microphone (no in-page prompt needed; OS-level permission is handled by Info.plist)
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture') callback(true);
    else callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // Shortcuts: F / F11 toggle fullscreen, Esc exits fullscreen
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const k = (input.key || '').toLowerCase();
    if (k === 'f' || input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.key === 'Escape') {
      if (win.isFullScreen()) {
        win.setFullScreen(false);
        event.preventDefault();
      }
    }
  });

  win.on('closed', () => { win = null; });
  return win;
}

function createBall() {
  ballPos = loadBallPos();
  const ballSkin = loadBallSkin();
  const { screen } = require('electron');
  const scr = screen.getPrimaryDisplay().workAreaSize;

  ballWin = new BrowserWindow({
    width: 320,
    height: 360,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    x: ballPos ? ballPos.x : scr.width - 336,
    y: ballPos ? ballPos.y : scr.height - 456,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  ballWin.loadFile('ball.html');
  ballWin.setAlwaysOnTop(true, 'screen-saver');
  ballWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Click-through on empty areas: only the orb/menu receive the mouse, the rest passes to the window below
  ballWin.setIgnoreMouseEvents(true, { forward: true });
  ballWin.hide(); // hidden initially; shown when a bound music app is detected

  // Send the remembered skin to the renderer
  ballWin.webContents.on('did-finish-load', () => {
    const skin = loadBallSkin();
    ballWin.webContents.send('ball-skin', skin);
  });

  // Don't steal keyboard focus, so music playback isn't interrupted
  ballWin.on('show', () => ballWin.blur());
  return ballWin;
}

// Bind-player settings window (lists running apps so the user picks what to watch)
function createBindWindow() {
  if (bindWin && !bindWin.isDestroyed()) {
    bindWin.show();
    bindWin.focus();
    return bindWin;
  }
  bindWin = new BrowserWindow({
    width: 540,
    height: 600,
    title: 'Bind Music Player',
    backgroundColor: '#0b1020',
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  bindWin.loadFile('bind.html');
  bindWin.on('closed', () => {
    bindWin = null;
    // Whether saved, skipped, or closed, mark the first-run guide as done to avoid re-prompting
    saveFirstRunDone();
  });
  return bindWin;
}

// Query bound-player state: is the process open, is it playing, system idle time, is audio active
let stateInFlight = false; // anti-concurrency: Windows detection via PowerShell is slow, avoid stacking the 3s timer

function queryMusicState(cb) {
  if (stateInFlight) return;
  stateInFlight = true;
  const isWin = process.platform === 'win32';
  const bin = path.join(__dirname, 'bin', isWin ? 'musicstate.js' : 'musicstate');
  const cfg = BALL_STATE_FILE();
  // Windows: run the JS detection script with Electron's bundled Node (ELECTRON_RUN_AS_NODE)
  // macOS: run the compiled Swift binary directly
  const proc = isWin
    ? spawn(process.execPath, [bin, '--config', cfg], { timeout: 8000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    : spawn(bin, ['--config', cfg], { timeout: 5000 });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.on('error', () => { stateInFlight = false; cb(null); });
  proc.on('close', () => {
    stateInFlight = false;
    try {
      cb(JSON.parse(out.trim()));
    } catch (e) {
      cb(null);
    }
  });
}

// List running GUI apps (used by the bind-player window)
function listRunningApps(cb) {
  const isWin = process.platform === 'win32';
  const bin = path.join(__dirname, 'bin', isWin ? 'musicstate.js' : 'musicstate');
  const proc = isWin
    ? spawn(process.execPath, [bin, '--list'], { timeout: 20000, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
    : spawn(bin, ['--list'], { timeout: 8000 });
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.on('error', () => cb([]));
  proc.on('close', () => {
    try {
      cb(JSON.parse(out.trim()));
    } catch (e) {
      cb([]);
    }
  });
}

let screensaverArmed = false; // whether the screensaver has been triggered (avoid re-opening)

// Detection loop (every 3s):
// 1. Bound player open -> show the orb (foreground or background); closed -> hide
// 2. Playing + idle >= 60s -> auto-open fullscreen visualization as a screensaver
function startDetection() {
  detectTimer = setInterval(() => {
    if (!ballWin || ballWin.isDestroyed()) return;
    queryMusicState((state) => {
      if (!state) return;
      // Orb: show whenever a bound player process exists
      if (state.appOpen) {
        if (!ballWin.isVisible()) ballWin.showInactive();
      } else {
        if (ballWin.isVisible()) ballWin.hide();
      }
      // Screensaver: playing + idle >= 60s -> auto-fullscreen.
      // No window -> create and fullscreen; window open but not fullscreen (user pressed Esc/⛶) -> switch in
      if (state.playing && state.idleLong && state.audioRunning) {
        const winAlive = !!(win && !win.isDestroyed());
        if (!screensaverArmed && (!winAlive || !win.isFullScreen())) {
          screensaverArmed = true;
          if (!winAlive) {
            createWindow();
            if (win && !win.isDestroyed()) {
              win.setFullScreen(true);
              // After the page loads, auto-click "Use Microphone" and go straight into mic-driven mode
              win.webContents.once('did-finish-load', () => {
                win.webContents.send('auto-mic');
              });
            }
          } else {
            // Window exists but not fullscreen: switch in (page already loaded, don't re-trigger auto-mic)
            win.setFullScreen(true);
          }
        }
      } else {
        // Only reset the trigger flag. Mouse movement / pausing playback etc. do NOT auto-close or exit fullscreen —
        // the only ways out: click the ⛶ button or press ESC (see before-input-event handler)
        screensaverArmed = false;
      }
    });
  }, 3000);
}

ipcMain.on('toggle-fullscreen', () => {
  if (win) win.setFullScreen(!win.isFullScreen());
});

ipcMain.on('open-visualizer', () => {
  createWindow();
});

// -- bind player --
ipcMain.on('open-bind-dialog', () => {
  createBindWindow();
});

ipcMain.handle('list-apps', () => new Promise((resolve) => listRunningApps(resolve)));

ipcMain.handle('get-bound-apps', () => loadBoundApps() || []);

ipcMain.on('set-bound-apps', (e, apps) => {
  const clean = Array.isArray(apps)
    ? apps.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim().toLowerCase())
    : [];
  saveBoundApps(clean);
  if (bindWin && !bindWin.isDestroyed()) bindWin.close();
});

ipcMain.on('move-ball', (e, { dx, dy }) => {
  if (!ballWin || ballWin.isDestroyed()) return;
  const [cx, cy] = ballWin.getPosition();
  const nx = Math.round(cx + dx);
  const ny = Math.round(cy + dy);
  ballWin.setPosition(nx, ny);
  saveBallPos(nx, ny);
});

ipcMain.on('quit-app', () => {
  app.quit();
});

ipcMain.on('set-viz-mode', (e, mode) => {
  if (win && !win.isDestroyed()) {
    win.webContents.send('set-viz-mode', mode);
  }
});

ipcMain.on('set-ball-skin', (e, skin) => {
  saveBallSkin(skin);
  if (ballWin && !ballWin.isDestroyed()) {
    ballWin.webContents.send('ball-skin', skin);
  }
});

ipcMain.on('ball-interactive', (e, interactive) => {
  if (ballWin && !ballWin.isDestroyed()) {
    // interactive=true: window receives the mouse (over orb/menu); false: click-through
    ballWin.setIgnoreMouseEvents(!interactive, { forward: true });
  }
});

app.whenReady().then(() => {
  createBall();
  startDetection();
  // First run: guide the user to bind a music player (delayed so it doesn't clash with the orb appearing)
  if (!loadFirstRunDone()) {
    setTimeout(() => createBindWindow(), 1500);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBall();
  });
});

app.on('window-all-closed', () => {
  // The orb window closing doesn't quit (keeps tray-like behavior); stays resident even with all windows closed
  if (process.platform !== 'darwin') app.quit();
});
