// musicstate.js — Windows 版检测脚本(Node 包装 PowerShell)
// Modes:
//   node musicstate.js --config <path> : detect mode. Reads JSON {"boundApps":["neteasemusic","spotify"]},
//                                        matches ANY listed process name (substring, lowercased).
//                                        Empty/missing boundApps falls back to NetEase defaults.
//   node musicstate.js --list          : list running GUI apps (processes with a main window):
//                                        [{name, processName, bundleId:"", icon(base64 png)}]
// Windows equivalents of the macOS probe:
//   - process match  : Get-Process ProcessName
//   - playing (CPU)  : sample Get-Process .CPU twice (accumulated processor-seconds), diff / interval * 100
//   - idle seconds   : user32 GetLastInputInfo via Add-Type P/Invoke
//   - audioRunning   : no cheap public Win32 "is audio outputting" API -> approximated as (bound player process exists)
// Run from Electron main.js via spawn(process.execPath, [bin, '--config', cfg], {env:{...process.env, ELECTRON_RUN_AS_NODE:'1'}})
// Output (detect): one JSON line: {"appOpen":bool,"appPids":n,"appCpu":float,"playing":bool,"idleSeconds":float,"idleLong":bool,"audioRunning":bool}

const { spawnSync } = require('child_process');
const fs = require('fs');

const DEFAULT_NAMES = ['netease', 'cloudmusic', '163music'];

function readConfig(path) {
  if (!path) return DEFAULT_NAMES;
  try {
    const cfg = JSON.parse(fs.readFileSync(path, 'utf-8'));
    if (Array.isArray(cfg.boundApps) && cfg.boundApps.length > 0) {
      return cfg.boundApps.map((s) => String(s).toLowerCase());
    }
  } catch (e) { /* ignore */ }
  return DEFAULT_NAMES;
}

function runPS(code, timeoutMs) {
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', code],
    { encoding: 'utf-8', timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024, windowsHide: true }
  );
  if (r.error) return '';
  return (r.stdout || '').trim();
}

function detect(configPath) {
  const names = readConfig(configPath);
  const namesJson = JSON.stringify(names);
  const code = `
$targets = @(${names.map((n) => "'" + n.replace(/'/g, "''") + "'").join(',')})
$ps = Get-Process -ErrorAction SilentlyContinue | Where-Object {
  $pn = $_.ProcessName.ToLower()
  $hit = $false
  foreach ($t in $targets) { if ($pn.Contains($t)) { $hit = $true; break } }
  $hit
}
$pids = @($ps | ForEach-Object { $_.Id })
$cpu1 = 0.0
if ($ps) { $cpu1 = ($ps | Measure-Object -Property CPU -Sum).Sum }
Start-Sleep -Milliseconds 400
$ps2 = @()
if ($pids.Count -gt 0) { $ps2 = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Id -in $pids }) }
$cpu2 = 0.0
if ($ps2) { $cpu2 = ($ps2 | Measure-Object -Property CPU -Sum).Sum }
$cpuPct = 0.0
if ($cpu1 -gt 0 -and $cpu2 -gt 0) { $cpuPct = [math]::Max(0.0, (($cpu2 - $cpu1) / 0.4 * 100.0)) }
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class IdleT { [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO p); public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; } }' -ErrorAction SilentlyContinue
$li = New-Object IdleT+LASTINPUTINFO
$li.cbSize = [System.Runtime.InteropServices.Marshal]::SizeOf($li)
[IdleT]::GetLastInputInfo([ref]$li) | Out-Null
$idleMs = [Environment]::TickCount - $li.dwTime
if ($idleMs -lt 0) { $idleMs = 0 }
$idleSec = $idleMs / 1000.0
$obj = @{
  appOpen = ($pids.Count -gt 0)
  appPids = $pids.Count
  appCpu = [math]::Round($cpuPct, 2)
  playing = ($cpuPct -gt 2.0)
  idleSeconds = [math]::Round($idleSec, 2)
  idleLong = ($idleSec -ge 60)
  audioRunning = ($pids.Count -gt 0)
}
$obj | ConvertTo-Json -Compress
`;
  const out = runPS(code, 10000);
  if (out) {
    try {
      const parsed = JSON.parse(out);
      process.stdout.write(JSON.stringify(parsed));
      return;
    } catch (e) { /* fall through */ }
  }
  process.stdout.write(JSON.stringify({ appOpen: false, appPids: 0, appCpu: 0, playing: false, idleSeconds: 0, idleLong: false, audioRunning: false }));
}

function listApps() {
  const code = `
Add-Type -AssemblyName System.Drawing -ErrorAction SilentlyContinue
$result = @()
Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -ne '' } | ForEach-Object {
  $p = $_.Path
  $icon = ''
  if ($p -and (Test-Path $p)) {
    try {
      $ic = [System.Drawing.Icon]::ExtractAssociatedIcon($p)
      if ($ic) {
        $bmp = $ic.ToBitmap()
        $ms = New-Object System.IO.MemoryStream
        $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
        $icon = [Convert]::ToBase64String($ms.ToArray())
        $ic.Dispose(); $bmp.Dispose(); $ms.Dispose()
      }
    } catch { }
  }
  $result += [PSCustomObject]@{ name = $_.ProcessName; processName = $_.ProcessName; bundleId = ''; icon = $icon }
}
if ($result.Count -eq 0) { Write-Output '[]' } else { $result | ConvertTo-Json -Compress }
`;
  const out = runPS(code, 20000);
  if (out) {
    // ConvertTo-Json of a single PSCustomObject returns an object, not array — normalize
    let text = out;
    if (!text.startsWith('[')) {
      try {
        const obj = JSON.parse(text);
        text = '[' + text + ']';
      } catch (e) { text = '[]'; }
    }
    try {
      const parsed = JSON.parse(text);
      process.stdout.write(JSON.stringify(parsed));
      return;
    } catch (e) { /* fall through */ }
  }
  process.stdout.write('[]');
}

const args = process.argv.slice(2);
if (args.includes('--list')) {
  listApps();
} else {
  let configPath = '';
  const i = args.indexOf('--config');
  if (i >= 0 && i + 1 < args.length) configPath = args[i + 1];
  detect(configPath);
}
