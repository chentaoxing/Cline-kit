"use strict";
// Locate cline-app.exe without hardcoding anyone's install path.
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const EXE = process.platform === "win32" ? "cline-app.exe" : "cline-app";

function fromRunningProcess() {
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSync("powershell.exe", [
      "-NoProfile", "-Command",
      "(Get-Process -Name cline-app -ErrorAction SilentlyContinue | Select-Object -First 1).Path"
    ], { encoding: "utf8", timeout: 15000 });
    const p = out.trim().replace(/^"|"$/g, "");
    return p && fs.existsSync(p) ? p : null;
  } catch (e) { return null; }
}

function fromRegistry() {
  if (process.platform !== "win32") return null;
  const roots = [
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
  ];
  // PowerShell treats backslash literally, so paths must be single-quoted, not JSON-encoded.
  const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
  const script = `$roots = @(${roots.map(q).join(",")})
foreach ($r in $roots) {
  Get-ChildItem $r -ErrorAction SilentlyContinue | ForEach-Object {
    $p = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
    if ($p.DisplayName -match 'cline') {
      foreach ($k in @('InstallLocation','DisplayIcon','UninstallString')) {
        $v = $p.$k
        if ($v) { Write-Output ("$k=$v") }
      }
    }
  }
}`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 20000 });
    let installLocation = null;
    for (const line of out.split(/\r?\n/)) {
      const i = line.indexOf("=");
      if (i < 0) continue;
      const k = line.slice(0, i), v = line.slice(i + 1).trim().replace(/^"|"$/g, "");
      if (k === "InstallLocation" && v) installLocation = v;
      if (k === "DisplayIcon" && /cline-app\.exe/i.test(v)) return v.split(",")[0];
      if (k === "UninstallString") {
        const m = v.match(/^(?:"([^"]+)"|[^\s]+)|(.+)/);
        const guess = (v.match(/[A-Za-z]:[^"]*?cline-app\.exe/i) || [])[0];
        if (guess) return guess;
      }
    }
    if (installLocation) {
      const p = path.join(installLocation, EXE);
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { /* registry unreadable */ }
  return null;
}

function fromCommonPaths() {
  const candidates = [];
  const env = process.env;
  if (process.platform === "win32") {
    const roots = [
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "Cline"),
      env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs", "cline-app"),
      env.PROGRAMFILES && path.join(env.PROGRAMFILES, "Cline"),
      env["PROGRAMFILES(X86)"] && path.join(env["PROGRAMFILES(X86)"], "Cline"),
      env.ProgramFiles && path.join(env.ProgramFiles, "cline")
    ];
    candidates.push(...roots.filter(Boolean).map((d) => path.join(d, EXE)));
    // a few fixed-drive variants people commonly use
    for (const drive of ["C:", "D:", "E:"]) {
      candidates.push(path.join(drive + "\\", "Programs", "Cline", EXE));
      candidates.push(path.join(drive + "\\", "Program Files", "Cline", EXE));
    }
  } else {
    candidates.push("/Applications/Cline.app/Contents/MacOS/" + EXE);
    candidates.push(path.join(os.homedir(), ".cline", "bin", EXE));
    candidates.push(path.join("/usr/local/bin", EXE));
  }
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch (e) { } }
  return null;
}

function fromPath() {
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const out = execFileSync(cmd, [EXE], { encoding: "utf8", timeout: 8000 });
    const p = out.split(/\r?\n/)[0].trim();
    return p && fs.existsSync(p) ? p : null;
  } catch (e) { return null; }
}

// ordered resolution; each source is labelled so `status` can explain the choice
function detect(cfg) {
  const sources = [
    ["config", () => (cfg && cfg.clinePath && fs.existsSync(cfg.clinePath) ? cfg.clinePath : null)],
    ["running-process", fromRunningProcess],
    ["registry", fromRegistry],
    ["common-paths", fromCommonPaths],
    ["path-env", fromPath]
  ];
  for (const [name, fn] of sources) {
    let p = null;
    try { p = fn(); } catch (e) { p = null; }
    if (p) return { path: p, source: name };
  }
  return { path: null, source: null };
}

module.exports = { detect, EXE };
