const { app, BrowserWindow, session, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let win;          // 可视化全屏窗口
let ballWin;      // 悬浮球窗口
let bindWin;      // 绑定播放器设置窗口
let detectTimer;  // 前台应用检测定时器
let ballPos = null; // 悬浮球记忆位置 {x, y}

const BALL_STATE_FILE = () => path.join(app.getPath('userData'), 'ball-pos.json');

function loadBallPos() {
  try {
    const d = JSON.parse(fs.readFileSync(BALL_STATE_FILE(), 'utf-8'));
    if (typeof d.x === 'number' && typeof d.y === 'number') return d;
  } catch (e) { /* 首次运行无文件 */ }
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

// ── 绑定播放器配置（存进程名小写列表，如 ["neteasemusic","spotify"]）──
function loadBoundApps() {
  try {
    const d = JSON.parse(fs.readFileSync(BALL_STATE_FILE(), 'utf-8'));
    if (Array.isArray(d.boundApps) && d.boundApps.length > 0) return d.boundApps;
  } catch (e) {}
  return null; // null = 从未绑定过；默认检测网易云
}

function saveBoundApps(apps) {
  try {
    const d = loadBallPos() || {};
    d.boundApps = apps;
    fs.writeFileSync(BALL_STATE_FILE(), JSON.stringify(d));
  } catch (e) {}
}

// ── 首次运行引导标志：独立于绑定配置 ──
// 绑定引导是否已展示过（无论用户保存、暂不绑定还是直接关窗）。
// 用独立标志而非 boundApps 判断：重装/重新下载后 userData 残留的绑定配置
// 不应阻止首次引导再次弹出。
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
    title: '发呆音宇宙',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');

  // 自动授权麦克风（桌面 App 无需再弹网页授权框；系统级授权由 Info.plist 处理）
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    if (permission === 'media' || permission === 'audioCapture') callback(true);
    else callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // 快捷键：F / F11 切换全屏，Esc 退出全屏
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
  // 空白区域鼠标穿透：只有球/菜单所在位置接收鼠标，其余穿透到下层窗口
  ballWin.setIgnoreMouseEvents(true, { forward: true });
  ballWin.hide(); // 初始隐藏，检测到音乐 App 才显示

  // 把记忆的皮肤传给渲染进程
  ballWin.webContents.on('did-finish-load', () => {
    const skin = loadBallSkin();
    ballWin.webContents.send('ball-skin', skin);
  });

  // 不抢占键盘焦点，避免影响正在播放的音乐
  ballWin.on('show', () => ballWin.blur());
  return ballWin;
}

// 绑定播放器设置窗口（列出正在运行的应用，让用户选择监听谁）
function createBindWindow() {
  if (bindWin && !bindWin.isDestroyed()) {
    bindWin.show();
    bindWin.focus();
    return bindWin;
  }
  bindWin = new BrowserWindow({
    width: 540,
    height: 600,
    title: '绑定音乐播放器',
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
    // 无论保存绑定、暂不绑定还是直接关窗，都标记首次引导已完成，避免下次启动重复弹窗
    saveFirstRunDone();
  });
  return bindWin;
}

// 查询绑定播放器状态：进程是否打开、是否在播放、系统空闲时长、音频是否活动
let stateInFlight = false; // 防并发：Windows 检测走 PowerShell 较慢，避免 3s 定时器堆叠

function queryMusicState(cb) {
  if (stateInFlight) return;
  stateInFlight = true;
  const isWin = process.platform === 'win32';
  const bin = path.join(__dirname, 'bin', isWin ? 'musicstate.js' : 'musicstate');
  const cfg = BALL_STATE_FILE();
  // Windows: 用 Electron 自带 Node 运行 JS 检测脚本（ELECTRON_RUN_AS_NODE）
  // macOS: 直接运行编译好的 Swift 二进制
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

// 列出正在运行的 GUI 应用（绑定播放器窗口用）
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

let screensaverArmed = false; // 屏保是否已触发（避免重复打开）

// 检测循环（每 3 秒）：
// 1. 网易云打开 → 显示悬浮球（无论前后台）；关闭 → 隐藏
// 2. 播放中 + 空闲≥60s → 自动打开全屏可视化作为屏保
function startDetection() {
  detectTimer = setInterval(() => {
    if (!ballWin || ballWin.isDestroyed()) return;
    queryMusicState((state) => {
      if (!state) return;
      // 悬浮球：绑定的播放器进程存在即显示
      if (state.appOpen) {
        if (!ballWin.isVisible()) ballWin.showInactive();
      } else {
        if (ballWin.isVisible()) ballWin.hide();
      }
      // 屏保：播放中 + 空闲≥60s → 自动全屏。
      // 窗口不存在 → 新建并全屏；窗口已打开但未全屏（用户 ESC/⛶ 退出过）→ 直接切入全屏
      if (state.playing && state.idleLong && state.audioRunning) {
        const winAlive = !!(win && !win.isDestroyed());
        if (!screensaverArmed && (!winAlive || !win.isFullScreen())) {
          screensaverArmed = true;
          if (!winAlive) {
            createWindow();
            if (win && !win.isDestroyed()) {
              win.setFullScreen(true);
              // 页面加载完成后自动点击"使用麦克风"，直接进入拾音律动
              win.webContents.once('did-finish-load', () => {
                win.webContents.send('auto-mic');
              });
            }
          } else {
            // 窗口已存在但非全屏：切入全屏（页面早已加载，不重复触发 auto-mic）
            win.setFullScreen(true);
          }
        }
      } else {
        // 仅复位触发标记。用户晃动鼠标/暂停播放等都不再自动关闭或退出全屏——
        // 退出全屏的唯一途径：点击缩放按钮(⛶)或按 ESC（见 before-input-event 处理）
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

// ── 绑定播放器 ──
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
    // interactive=true 时窗口接收鼠标（球/菜单上）；false 时穿透
    ballWin.setIgnoreMouseEvents(!interactive, { forward: true });
  }
});

app.whenReady().then(() => {
  createBall();
  startDetection();
  // 首次运行：引导绑定音乐播放器（未展示过引导时延迟弹出，避免与悬浮球同时出现）
  if (!loadFirstRunDone()) {
    setTimeout(() => createBindWindow(), 1500);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createBall();
  });
});

app.on('window-all-closed', () => {
  // 悬浮球窗口关闭不退出（保留托盘行为），仅当所有窗口都关掉时仍驻留
  if (process.platform !== 'darwin') app.quit();
});
