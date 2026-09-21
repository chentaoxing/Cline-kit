"use strict";
// Windows integration: a no-console launcher + repointing the user's Cline shortcut.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const cfg = require("./config");

const VBS = (ps1) => `' cline-kit launcher - starts the Cline desktop app with the enhancement overlay
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""${ps1}""", 0, False
`;

const PS1 = (nodeExe, argsString) => `# cline-kit launcher
$ErrorActionPreference = 'Stop'
try {
  Start-Process -FilePath ${psQuote(nodeExe)} -ArgumentList ${psQuote(argsString)} -WindowStyle Hidden
} catch {
  # surface failures instead of silently doing nothing
  $log = Join-Path $env:APPDATA 'cline-kit\\launcher-error.log'
  Set-Content -LiteralPath $log -Value ((Get-Date).ToString('o') + ' ' + $_.Exception.Message)
}
`;

function psQuote(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }
// PowerShell does not treat backslash as an escape character, so JSON.stringify would leave
// doubled backslashes in paths and every comparison downstream would fail. Build a real
// PowerShell array of single-quoted literals instead.
function psArray(items) { return "@(" + items.map(psQuote).join(",") + ")"; }

function lnkSearchDirs() {
  const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const progdata = process.env.ProgramData || "C:\\ProgramData";
  return [
    path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(progdata, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(os.homedir(), "Desktop"),
    path.join(process.env.Public || "C:\\Users\\Public", "Desktop"),
    // A taskbar pin is a .lnk too, and it is the launch path most desktop users actually take.
    // Missing this is what made "I installed it but Cline opened plain" unexplainable.
    path.join(appdata, "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar"),
    path.join(appdata, "Microsoft", "Internet Explorer", "Quick Launch")
  ];
}

// Every .lnk we can see, with what it currently points at. Returning the target lets the caller
// classify (raw exe / already routed through the kit / something else) instead of running one scan
// per question, which is how a newly created shortcut used to slip through.
function scanShortcuts() {
  if (process.platform !== "win32") return [];
  const dirs = lnkSearchDirs().filter((d) => fs.existsSync(d));
  if (!dirs.length) return [];
  const script = `$dirs = ${psArray(dirs)}
$sh = New-Object -ComObject WScript.Shell
foreach ($d in $dirs) {
  if (-not (Test-Path -LiteralPath $d)) { continue }
  Get-ChildItem -LiteralPath $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $sh.CreateShortcut($_.FullName)
      Write-Output ($_.FullName + [char]9 + $sc.TargetPath + [char]9 + $sc.Arguments)
    } catch {}
  }
}`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 90000 });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((line) => {
      const parts = line.split("\t");
      return { lnk: parts[0] || "", target: parts[1] || "", args: parts[2] || "" };
    }).filter((s) => s.lnk);
  } catch (e) { return []; }
}

function findShortcuts(exePath) {
  const want = String(exePath || "").toLowerCase();
  return scanShortcuts().filter((s) => s.target && s.target.toLowerCase() === want).map((s) => s.lnk);
}

function setShortcut(lnkPath, target, args, icon, workingDir, description) {
  const script = `$sh = New-Object -ComObject WScript.Shell
$o = $sh.CreateShortcut(${psQuote(lnkPath)})
$o.TargetPath = ${psQuote(target)}
$o.Arguments = ${psQuote(args || "")}
$o.IconLocation = ${psQuote(icon || target + ",0")}
$o.WorkingDirectory = ${psQuote(workingDir || path.dirname(target))}
$o.Description = ${psQuote(description || "")}
$o.Save()
Write-Output "ok"`;
  execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 30000 });
}

function readShortcut(lnkPath) {
  const script = `$sh = New-Object -ComObject WScript.Shell
$o = $sh.CreateShortcut(${psQuote(lnkPath)})
Write-Output ($o.TargetPath + [char]9 + $o.Arguments)`;
  const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 30000 });
  const line = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0] || "";
  const parts = line.split("\t");
  return { target: parts[0] || "", args: parts[1] || "" };
}

function writeLauncherFiles(cfgObj) {
  cfg.ensureDirs();
  const cli = path.join(__dirname, "cli.js");
  const ps1 = path.join(cfg.configDir(), "launch-cline-kit.ps1");
  const vbs = path.join(cfg.configDir(), "launch-cline-kit.vbs");
  // Windows PowerShell 5.1 reads .ps1 as ANSI unless a UTF-8 BOM is present, and wscript reads
  // .vbs as ANSI unless it is UTF-16LE with a BOM. Without these, any non-ASCII character in the
  // install path (a Chinese username, for example) silently breaks the launcher.
  fs.writeFileSync(ps1, "﻿" + PS1(process.execPath, '"' + cli + '" start'), "utf8");
  fs.writeFileSync(vbs, "﻿" + VBS(ps1), "utf16le");
  return { ps1, vbs };
}

async function install(cfgObj, opts) {
  opts = opts || {};
  if (process.platform !== "win32") throw new Error("shortcut install is Windows-only for now");
  const detect = require("./detect");
  const found = detect.detect(cfgObj);
  if (!found.path) throw new Error("cline-app.exe not found; set it with `ckit config --cline-path ...`");
  const { vbs } = writeLauncherFiles(cfgObj);

  const exeLower = String(found.path).toLowerCase();
  const backup = new Map();
  for (const s of (cfgObj.originalShortcuts || [])) {
    if (s && s.lnk) backup.set(s.lnk.toLowerCase(), s);
  }

  // Scan every time. The previous behaviour - only re-pointing whatever was backed up on the first
  // run - silently left a shortcut created afterwards (or a taskbar pin) pointing at the bare exe,
  // and the user had no way to know.
  const seen = scanShortcuts();
  const hooked = [], already = [], failed = [];
  for (const s of seen) {
    const isRawCline = s.target && s.target.toLowerCase() === exeLower;
    const isOurs = s.args && s.args.toLowerCase().includes(String(vbs).toLowerCase());
    if (!isRawCline && !isOurs) continue;
    if (isOurs) { already.push(s.lnk); continue; }
    if (!backup.has(s.lnk.toLowerCase())) {
      const before = readShortcut(s.lnk);
      if (before) backup.set(s.lnk.toLowerCase(), Object.assign({ lnk: s.lnk }, before));
    }
    try {
      setShortcut(s.lnk, "C:\\Windows\\System32\\wscript.exe", '"' + vbs + '"', found.path + ",0",
        path.dirname(found.path), "Cline (Cline-kit enhanced)");
      hooked.push(s.lnk);
    } catch (e) {
      failed.push({ lnk: s.lnk, why: e.message });
    }
  }

  let created = null;
  if (!hooked.length && !already.length) {
    // Nothing to take over: give the user a shortcut that does the right thing.
    const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    created = path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Cline (Cline-kit).lnk");
    setShortcut(created, "C:\\Windows\\System32\\wscript.exe", '"' + vbs + '"', found.path + ",0",
      path.dirname(found.path), "Cline (Cline-kit enhanced)");
    hooked.push(created);
  }

  cfgObj.originalShortcuts = Array.from(backup.values());
  cfgObj.shortcutPath = (already.concat(hooked)[0]) || created || null;
  cfgObj.clineExeForShortcut = found.path;
  cfg.write(cfgObj);
  return {
    exe: found.path, launcher: vbs,
    shortcuts: already.concat(hooked),
    report: { hooked, already, failed, created, scanned: seen.length }
  };
}

async function uninstall(cfgObj) {
  const restore = [];
  for (const s of (cfgObj.originalShortcuts || [])) {
    try {
      setShortcut(s.lnk, s.target, s.args, s.target + ",0", path.dirname(s.target), "");
      restore.push(s.lnk);
    } catch (e) { /* ignore individual failures */ }
  }
  // remove a shortcut we created ourselves (no original to restore)
  if (!restore.length && cfgObj.shortcutPath && fs.existsSync(cfgObj.shortcutPath)) {
    try { fs.unlinkSync(cfgObj.shortcutPath); restore.push("removed " + cfgObj.shortcutPath); } catch (e) { }
  }
  cfgObj.shortcutPath = null;
  cfgObj.originalShortcuts = [];
  cfg.write(cfgObj);
  return { restored: restore };
}

module.exports = { install, uninstall, findShortcuts, writeLauncherFiles };
