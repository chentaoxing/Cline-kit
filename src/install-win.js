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
    path.join(process.env.Public || "C:\\Users\\Public", "Desktop")
  ];
}

function findShortcuts(exePath) {
  if (process.platform !== "win32") return [];
  const dirs = lnkSearchDirs().filter((d) => fs.existsSync(d));
  const script = `$exe = ${psQuote(exePath)}
$dirs = ${psArray(dirs)}
$sh = New-Object -ComObject WScript.Shell
foreach ($d in $dirs) {
  if (-not (Test-Path -LiteralPath $d)) { continue }
  Get-ChildItem -LiteralPath $d -Filter *.lnk -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $t = $sh.CreateShortcut($_.FullName).TargetPath
      if ($t -and ($t -ieq $exe)) { Write-Output $_.FullName }
    } catch {}
  }
}`;
  try {
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 60000 });
    return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  } catch (e) { return []; }
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

  // Re-running `install` must not lose the backup of the original shortcut targets.
  const known = (cfgObj.originalShortcuts || []).filter((s) => s && s.lnk && fs.existsSync(s.lnk));
  let toPoint;
  if (known.length) {
    toPoint = known.map((s) => s.lnk);
  } else {
    const existing = findShortcuts(found.path);
    if (existing.length) {
      cfgObj.originalShortcuts = existing.map((p) => Object.assign({ lnk: p }, readShortcut(p)));
      toPoint = existing;
    } else {
      const appdata = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
      const lnk = path.join(appdata, "Microsoft", "Windows", "Start Menu", "Programs", "Cline (中文).lnk");
      cfgObj.originalShortcuts = [];
      toPoint = [lnk];
    }
  }

  const touched = [];
  for (const lnk of toPoint) {
    setShortcut(lnk, "C:\\Windows\\System32\\wscript.exe", '"' + vbs + '"', found.path + ",0",
      path.dirname(found.path), "Cline (cline-kit enhanced)");
    touched.push(lnk);
  }
  cfgObj.shortcutPath = touched[0];
  cfgObj.clineExeForShortcut = found.path;
  cfg.write(cfgObj);
  return { exe: found.path, shortcuts: touched, launcher: vbs };
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
