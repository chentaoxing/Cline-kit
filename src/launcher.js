"use strict";
// Start Cline with a private debug port and keep the overlay attached.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const cfg = require("./config");
const cdp = require("./cdp");
const detect = require("./detect");

// Cline's own hub. `code-sidecar.exe` binds 127.0.0.1:25463 and *is* the hub daemon for as long as
// it lives; every other sidecar on the box dials that one port. The port number is a constant inside
// Cline, so a stale daemon cannot be worked around by picking another one - the next launch attaches
// to it, sessions and runs included, and the UI reports "Hub connection closed (code=1006)".
const APP_IMAGE = "cline-app.exe";
const SIDECAR_IMAGE = "code-sidecar.exe";
const HUB_PORT = 25463;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

function isPortAlive(port) {
  return cdp.pageTargets(port).then((t) => t.length > 0).catch(() => false);
}

function injectorRunning() {
  if (process.platform !== "win32") return false;
  try {
    const script = "$m='injector.js';" +
      "$ps=Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
      "Where-Object { $_.CommandLine -match $m }; $ps.ProcessId -join ','";
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 15000 });
    return out.trim() || "";
  } catch (e) { return ""; }
}

function spawnHidden(file, args, opts) {
  const child = spawn(file, args, Object.assign({
    detached: true,
    stdio: "ignore",
    windowsHide: true
  }, opts || {}));
  child.unref();
  return child;
}

function clineRunning() {
  if (process.platform !== "win32") return false;
  try {
    const out = execFileSync("tasklist.exe", ["/FI", "IMAGENAME eq cline-app.exe", "/NH"], { encoding: "utf8" });
    return /cline-app\.exe/i.test(out);
  } catch (e) { return false; }
}

function killCline() {
  if (process.platform !== "win32") return false;
  // Both images, not just the window. `taskkill /IM cline-app.exe /F` used to be the whole story and
  // it left every code-sidecar behind - including the one holding the hub - which is how a box ends
  // up with a day-old hub serving a brand new window.
  let killed = false;
  for (const image of [APP_IMAGE, SIDECAR_IMAGE]) {
    try {
      execFileSync("taskkill.exe", ["/IM", image, "/F"], { encoding: "utf8" });
      killed = true;
    } catch (e) { /* not running - nothing to kill */ }
  }
  return killed;
}

// Flat rows for the whole Cline family: pid, ppid, image name, and age in seconds.
function clineProcesses() {
  if (process.platform !== "win32") return [];
  const script = "Get-CimInstance Win32_Process -Filter \"Name='" + APP_IMAGE + "' OR Name='" + SIDECAR_IMAGE + "'\" | " +
    "ForEach-Object { $t=0; if ($_.CreationDate) { $t=$_.CreationDate.ToFileTimeUtc() }; " +
    "'{0}|{1}|{2}|{3}' -f $_.ProcessId, $_.ParentProcessId, $_.Name, $t }";
  let out = "";
  try {
    out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", timeout: 20000 });
  } catch (e) { return []; }
  const now = Date.now();
  const rows = [];
  for (const line of String(out).split(/\r?\n/)) {
    const c = line.trim().split("|");
    if (c.length < 4) continue;
    const pid = Number(c[0]);
    const ppid = Number(c[1]);
    const fileTime = Number(c[3]);
    if (!pid) continue;
    // FILETIME is 100 ns ticks since 1601-01-01; 11644473600000 ms is the offset to the unix epoch.
    const born = fileTime ? fileTime / 1e4 - 11644473600000 : 0;
    rows.push({ pid, ppid, name: c[2], ageSec: born ? Math.round((now - born) / 1000) : -1 });
  }
  return rows;
}

// Pure: which sidecars have outlived the window that started them. A sidecar is rooted as long as
// some ancestor is a live cline-app; the hub daemon is a sidecar spawned by a sidecar, so the walk
// has to follow the chain rather than just look at the parent. Anything whose ancestors are all gone
// is holding a hub session nobody will ever close.
function planOrphanReap(rows) {
  const byPid = new Map();
  for (const r of rows || []) if (r && r.pid) byPid.set(r.pid, r);
  const image = (s) => String(s || "").toLowerCase();
  function rooted(row) {
    const seen = new Set();
    let cur = row;
    while (cur && !seen.has(cur.pid)) {
      seen.add(cur.pid);
      if (image(cur.name) === APP_IMAGE) return true;
      cur = byPid.get(cur.ppid);
    }
    return false;
  }
  return rows.filter((r) => image(r.name) === SIDECAR_IMAGE && !rooted(r)).map((r) => r.pid);
}

function orphanSidecars() {
  const rows = clineProcesses();
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  return planOrphanReap(rows).map((pid) => byPid.get(pid)).filter(Boolean);
}

// Who currently owns Cline's hub port, if anyone.
function listenPid(port) {
  try {
    const out = execFileSync("netstat.exe", ["-ano", "-p", "tcp"], { encoding: "utf8", timeout: 20000 });
    for (const line of String(out).split(/\r?\n/)) {
      const c = line.trim().split(/\s+/);
      if (c.length >= 5 && c[1].endsWith(":" + port) && /listening/i.test(c[3])) return Number(c[4]) || null;
    }
  } catch (e) { /* no netstat, no listener */ }
  return null;
}

function hubOwner() {
  const pid = listenPid(HUB_PORT);
  if (!pid) return null;
  const row = clineProcesses().find((r) => r.pid === pid);
  return Object.assign({ port: HUB_PORT, pid, name: "?", ageSec: -1, ppid: 0 }, row || {});
}

// Cheap on purpose: this one spins in a loop after a kill, and a process-enumerating powershell per
// iteration would cost more than the shutdown it is waiting for.
async function waitHubReleased(ms) {
  const deadline = Date.now() + (ms || 10000);
  while (Date.now() < deadline) {
    if (!listenPid(HUB_PORT)) return true;
    await sleep(250);
  }
  return !listenPid(HUB_PORT);
}

// Drop sidecars whose window is gone, so the next launch cannot attach to their hub.
function reapOrphanSidecars() {
  const orphans = orphanSidecars();
  for (const row of orphans) {
    try { execFileSync("taskkill.exe", ["/PID", String(row.pid), "/F"], { encoding: "utf8" }); } catch (e) { }
  }
  return orphans;
}

async function start(opts) {
  opts = opts || {};
  const conf = cfg.read();
  const found = detect.detect(conf);
  if (!found.path) {
    throw new Error("cline-app.exe not found. Set it with: cline-kit config --cline-path \"C:\\path\\cline-app.exe\"");
  }
  let port = conf.port;
  let alive = port ? await isPortAlive(port) : false;
  let reaped = [];

  if (!alive && clineRunning() && !opts.restart) {
    // Cline is already up without a debug port; a second launch would just focus the old window.
    return { exe: found.path, source: found.source, port: null, debugPortAlive: false, needsRestart: true };
  }
  if (opts.restart) {
    killCline();
    await waitHubReleased(6000);
    await sleep(500);
  }
  if (!alive) {
    // The window can be gone while its sidecars are not, and one of those sidecars owns the hub port.
    // Cline picks that hub up again by port number, so a "fresh" launch would otherwise be handed the
    // sessions, runs and event database of a process that has been running for days.
    reaped = reapOrphanSidecars();
    if (reaped.length) await waitHubReleased(10000);
    port = await freePort();
    conf.port = port;
    conf.clinePath = found.path;
    cfg.ensureDirs();
    cfg.write(conf);
    const env = Object.assign({}, process.env, {
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=" + port
    });
    spawnHidden(found.path, [], { env, cwd: path.dirname(found.path) });
    for (let i = 0; i < 40 && !(alive = await isPortAlive(port)); i++) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  // cwd must NOT be src/: a process whose working directory is inside the folder locks it,
  // which blocks renaming the checkout or replacing files on update.
  const repoRoot = path.join(__dirname, "..");
  const injectorPath = path.join(__dirname, "injector.js");
  let stale = false;
  try {
    const running = injectorRunning();
    if (running) {
      const current = require("./payload").compose(cfg.read()).version;
      stale = require("./injector").readActiveVersion() !== current;
    }
  } catch (e) { stale = false; }
  if (stale) stop();
  if (!injectorRunning() || stale) {
    spawnHidden(process.execPath, [injectorPath], { cwd: repoRoot });
  }
  return { exe: found.path, source: found.source, port, debugPortAlive: alive, restartedInjector: stale,
    reapedSidecars: reaped.map((r) => r.pid) };
}

function stop() {
  const ids = injectorRunning();
  // Drop the recorded payload version with the process that wrote it: active-version answers "what
  // is the injector keeping installed", and leaving it behind lets `ckit doctor` vouch for a
  // version nobody is maintaining any more.
  try { fs.unlinkSync(require("./injector").activeVersionFile()); } catch (e) { }
  if (!ids) return { stopped: false };
  for (const pid of ids.split(",").filter(Boolean)) {
    try { execFileSync("taskkill.exe", ["/PID", pid.trim(), "/F"], { encoding: "utf8" }); } catch (e) { }
  }
  return { stopped: true, pids: ids };
}

module.exports = {
  start, stop, freePort, isPortAlive, injectorRunning, clineRunning, killCline,
  clineProcesses, planOrphanReap, orphanSidecars, reapOrphanSidecars, hubOwner, waitHubReleased,
  HUB_PORT
};
