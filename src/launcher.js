"use strict";
// Start Cline with a private debug port and keep the overlay attached.
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const path = require("path");
const cfg = require("./config");
const cdp = require("./cdp");
const detect = require("./detect");

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
  try {
    execFileSync("taskkill.exe", ["/IM", "cline-app.exe", "/F"], { encoding: "utf8" });
    return true;
  } catch (e) { return false; }
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

  if (!alive && clineRunning() && !opts.restart) {
    // Cline is already up without a debug port; a second launch would just focus the old window.
    return { exe: found.path, source: found.source, port: null, debugPortAlive: false, needsRestart: true };
  }
  if (opts.restart) {
    killCline();
    await new Promise((r) => setTimeout(r, 2500));
  }
  if (!alive) {
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
  return { exe: found.path, source: found.source, port, debugPortAlive: alive, restartedInjector: stale };
}

function stop() {
  const ids = injectorRunning();
  if (!ids) return { stopped: false };
  for (const pid of ids.split(",").filter(Boolean)) {
    try { execFileSync("taskkill.exe", ["/PID", pid.trim(), "/F"], { encoding: "utf8" }); } catch (e) { }
  }
  return { stopped: true, pids: ids };
}

module.exports = { start, stop, freePort, isPortAlive, injectorRunning, clineRunning, killCline };
