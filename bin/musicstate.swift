// musicstate.swift — single-shot macOS state probe for "is a BOUND music app open, playing, idle, audio active"
// Modes:
//   musicstate --config <path> : detect mode (default). Reads JSON {"boundApps":["netease","spotify"]} at <path>;
//                                matches ANY of the listed process names (substring, case-insensitive).
//                                Empty/missing boundApps falls back to NetEase defaults.
//   musicstate --list          : list running GUI apps {name, processName, bundleId, icon(base64 png 36x36)}
// Compile: swiftc -O -o musicstate musicstate.swift   (first compile >60s; run in background w/ notify)
// Output (detect): one JSON line:
//   {"appOpen":bool,"appPids":n,"appCpu":float,"playing":bool,"idleSeconds":float,"idleLong":bool,"audioRunning":bool}
// Run from Electron main.js via spawn(bin, ["--config", cfgPath], {timeout:5000}) every ~3s, JSON.parse(stdout).
//
// Why these APIs (learned the hard way):
//   - MediaRemote now-playing returns NO INFO for CN music apps (NeteaseMusic) — don't use it.
//   - ioreg HIDIdleTime HANGS inside Swift Process.waitUntilExit() — use CGEventSource instead.
//   - macOS 26 SDK removed kCGAnyInputEventType enum member — use rawValue 0xFFFFFFFF.
//   - kAudioDevicePropertyVolumeScalar errors on modern macOS — use DeviceIsRunningSomewhere.

import Foundation
import CoreAudio
import CoreGraphics
import AppKit

// ───────────────────────── config ─────────────────────────
struct Config: Codable {
    var boundApps: [String]?
}

let DEFAULT_NAMES = ["netease", "cloudmusic", "163music"]

func loadBoundNames(_ path: String) -> [String] {
    guard !path.isEmpty else { return DEFAULT_NAMES }
    guard let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
          let cfg = try? JSONDecoder().decode(Config.self, from: data),
          let apps = cfg.boundApps, !apps.isEmpty else {
        return DEFAULT_NAMES
    }
    return apps.map { $0.lowercased() }
}

func matchedPids(names: [String]) -> [Int32] {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/ps")
    task.arguments = ["-axo", "pid,comm"]
    let pipe = Pipe()
    task.standardOutput = pipe
    do { try task.run(); task.waitUntilExit() } catch { return [] }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    guard let out = String(data: data, encoding: .utf8) else { return [] }
    var pids: [Int32] = []
    for line in out.split(separator: "\n") {
        let parts = line.split(separator: " ", omittingEmptySubsequences: true)
        if parts.count >= 2 {
            let name = parts[1].lowercased()
            if names.contains(where: { name.contains($0) }) {
                if let pid = Int32(parts[0]) { pids.append(pid) }
            }
        }
    }
    return pids
}

func cpuUsage(pids: [Int32]) -> Double {
    guard !pids.isEmpty else { return 0 }
    let task = Process()
    task.executableURL = URL(fileURLWithPath: "/bin/ps")
    task.arguments = ["-p", pids.map(String.init).joined(separator: ","), "-o", "%cpu="]
    let pipe = Pipe()
    task.standardOutput = pipe
    do { try task.run(); task.waitUntilExit() } catch { return 0 }
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    guard let out = String(data: data, encoding: .utf8) else { return 0 }
    return out.split(separator: "\n").reduce(0.0) { acc, line in
        acc + (Double(line.trimmingCharacters(in: .whitespaces)) ?? 0)
    }
}

func idleSeconds() -> Double {
    // kCGAnyInputEventType = 0xFFFFFFFF (macOS 26 SDK enum rename)
    let anyInput = CGEventType(rawValue: 0xFFFFFFFF)!
    let seconds = CGEventSource.secondsSinceLastEventType(.hidSystemState, eventType: anyInput)
    return Double(seconds)
}

func audioRunning() -> Bool {
    var defaultDevice: AudioDeviceID = 0
    var size = UInt32(MemoryLayout<AudioDeviceID>.size)
    var addr = AudioObjectPropertyAddress(
        mSelector: kAudioHardwarePropertyDefaultOutputDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size, &defaultDevice)
    guard defaultDevice != 0 else { return false }

    var running: UInt32 = 0
    size = UInt32(MemoryLayout<UInt32>.size)
    var runningAddr = AudioObjectPropertyAddress(
        mSelector: kAudioDevicePropertyDeviceIsRunningSomewhere,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
    )
    let st = AudioObjectGetPropertyData(defaultDevice, &runningAddr, 0, nil, &size, &running)
    return st == noErr && running != 0
}

// ───────────────────────── list mode ─────────────────────────
func pngBase64(_ image: NSImage, size: CGFloat = 36) -> String? {
    let target = NSImage(size: NSSize(width: size, height: size))
    target.lockFocus()
    NSGraphicsContext.current?.imageInterpolation = .high
    image.draw(in: NSRect(x: 0, y: 0, width: size, height: size),
               from: NSRect(origin: .zero, size: image.size),
               operation: .sourceOver, fraction: 1.0)
    target.unlockFocus()
    guard let tiff = target.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:]) else { return nil }
    return png.base64EncodedString()
}

func listApps() -> [[String: Any]] {
    let running = NSWorkspace.shared.runningApplications
    var result: [[String: Any]] = []
    for app in running {
        guard app.activationPolicy == .regular else { continue }
        let name = app.localizedName ?? ""
        let proc = app.executableURL?.lastPathComponent ?? ""
        if name.lowercased().contains("声之球体") || proc.lowercased().contains("electron") { continue }
        var item: [String: Any] = [
            "name": name,
            "processName": proc,
            "bundleId": app.bundleIdentifier ?? ""
        ]
        if let icon = app.icon, let b64 = pngBase64(icon) {
            item["icon"] = b64
        }
        result.append(item)
    }
    result.sort { ($0["name"] as? String ?? "") < ($1["name"] as? String ?? "") }
    return result
}

// ───────────────────────── main ─────────────────────────
let args = CommandLine.arguments

if args.contains("--list") {
    let apps = listApps()
    if let data = try? JSONSerialization.data(withJSONObject: apps),
       let str = String(data: data, encoding: .utf8) {
        print(str)
    }
    exit(0)
}

var configPath = ""
if let i = args.firstIndex(of: "--config"), i + 1 < args.count {
    configPath = args[i + 1]
}

let names = loadBoundNames(configPath)
let pids = matchedPids(names: names)
let cpu1 = cpuUsage(pids: pids)
Thread.sleep(forTimeInterval: 0.4)
let cpu2 = cpuUsage(pids: pids)
let avgCpu = (cpu1 + cpu2) / 2.0
let idle = idleSeconds()

let dict: [String: Any] = [
    "appOpen": !pids.isEmpty,
    "appPids": pids.count,
    "appCpu": avgCpu,
    "playing": avgCpu > 2.0,
    "idleSeconds": idle,
    "idleLong": idle >= 60,
    "audioRunning": audioRunning()
]
if let data = try? JSONSerialization.data(withJSONObject: dict), let str = String(data: data, encoding: .utf8) {
    print(str)
}
exit(0)
