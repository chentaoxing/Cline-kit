"use strict";
// doctor.js - one command that answers "is the overlay actually live in the window right now?".
// Everything else in the tool reports what it *intends*; this reports what the webview *has*,
// so a Cline update that changes the DOM shows up as a mismatch instead of silent absence.
const fs = require("fs");
const cfg = require("./config");
const cdp = require("./cdp");
const payload = require("./payload");
const launcher = require("./launcher");
const detect = require("./detect");

// Read-only probe. Runs inside the page; returns plain data, never touches the DOM.
const PROBE = `(function () {
  var st = window.__clineKitFeatureState || {};
  var s = window.__ckitStats || { scans: 0, writes: 0, restored: 0 };
  var out = { engineBuild: window.__ckitEngineBuild || null, stats: { scans: s.scans, writes: s.writes, restored: s.restored }, features: {} };
  var ids = Object.keys(st).filter(function (k) { return /_build$/.test(k); });
  ids.forEach(function (k) {
    var id = k.slice(0, -6);
    out.features[id] = { build: String(st[k]), stats: st[id + "_stats"] || null };
  });
  var rows = document.querySelectorAll("[data-ckit-feat]");
  out.domRows = rows.length;
  out.title = document.title || "";
  return JSON.stringify(out);
})()`;

function evaluate(api, expression) {
  return api.rpc("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: false })
    .then((r) => (r && r.result && r.result.value !== undefined ? r.result.value : null));
}

// Each feature publishes its own shape under `__ckitFeatureState[<id>_stats]`, so the doctor line has
// to read the numbers instead of assuming the sidebar's. A feature that is only on screen some of the
// time (the Settings row) must not look like a failure when it is simply not mounted.
function summarize(stats) {
  if (typeof stats.rows === "number") {
    return stats.rows + " row(s) added of " + stats.registered + " registered, " + stats.nativeGroups + " native";
  }
  if (stats.row) {
    const bits = [stats.row === "rendered" ? "row present" : "row not on screen (" + stats.row + ")"];
    if (stats.current) bits.push("current " + stats.current);
    if (stats.pending && stats.pending !== stats.current) {
      bits.push(stats.stalled ? "STUCK waiting for the injector (is it running? ckit start)" : "pending " + stats.pending);
    }
    if (stats.choices) bits.push(stats.choices + " choices");
    return bits.join(", ");
  }
  return JSON.stringify(stats).slice(0, 120);
}

async function run() {
  const conf = cfg.read();
  const found = detect.detect(conf);
  const report = { ok: true, checks: [] };
  const add = (name, pass, detail) => {
    report.checks.push({ name, pass: !!pass, detail: detail || "" });
    if (!pass) report.ok = false;
  };

  add("cline executable", !!found.path, (found.path || "not found") + " (via " + found.source + ")");

  const port = conf.port;
  const alive = port ? await launcher.isPortAlive(port) : false;
  add("debug port", !!alive, port ? "127.0.0.1:" + port + (alive ? " responding" : " NOT responding") : "no port in config - run ckit start");
  if (!alive) {
    add("injector", !!launcher.injectorRunning(), launcher.injectorRunning() ? "pid " + launcher.injectorRunning() : "not running");
    // The confusing case this exists for: Cline is open, the overlay is visible in it, but it was
    // injected by a launcher session that has since ended. The window keeps running whatever payload
    // it got, so the controls on screen can be a different build from the code on disk - and nothing
    // reports that unless we say it here.
    const open = launcher.clineRunning();
    report.hint = alive ? "" : (open
      ? "Cline is running but was NOT started by cline-kit, so this window is unreachable: it is still " +
      "showing the overlay from whenever it was last injected, which may be older than the code on disk. " +
      "Close Cline and open it from the shortcut the kit installed (or run: ckit start --restart)."
      : "Cline is not running. Start it with `ckit start`, or open it from the shortcut `ckit install` set up.");
    return report;
  }

  const current = payload.compose(conf).version;
  const installed = require("./injector").readActiveVersion();
  const fresh = installed === current;
  add("payload version", fresh, (fresh ? "in page " + current : "installed " + (installed || "?") + " but the source builds " + current +
    " - run: ckit start (it restarts an injector whose code or dictionary went stale underneath it)"));

  const pages = await cdp.eachPage(port, async (api) => {
    const raw = await evaluate(api, PROBE);
    try { return JSON.parse(raw); } catch (e) { return null; }
  });
  const live = pages.map((p) => p.result).filter(Boolean);
  add("page reachable", live.length > 0, live.length + " of " + pages.length + " webview target(s) answered");

  const info = payload.info(conf);
  for (const f of info.features) {
    if (!f.enabled) continue;
    const seen = live.map((p) => p.features[f.id]).filter(Boolean);
    add("feature " + f.id, seen.length > 0, seen.length
      ? seen.map((s) => "build " + s.build + (s.stats ? ", " + summarize(s.stats) : "")).join(" | ")
      : "not present in any page - Cline's DOM may have changed");
  }

  // Idle-page write rate: an overlay that keeps rewriting nodes is chasing its own mutations, which
  // freezes the webview long before anything looks wrong on screen.
  const writesBefore = live.map((p) => p.stats && p.stats.writes).filter((v) => typeof v === "number");
  await new Promise((r) => setTimeout(r, 3000));
  const again = (await cdp.eachPage(port, async (api) => {
    const raw = await evaluate(api, PROBE);
    try { return JSON.parse(raw); } catch (e) { return null; }
  })).map((p) => p.result).filter(Boolean);
  const writesAfter = again.map((p) => p.stats && p.stats.writes).filter((v) => typeof v === "number");
  const delta = writesBefore.length && writesAfter.length ? writesAfter[0] - writesBefore[0] : 0;
  add("overlay write rate", delta < 300, delta + " DOM writes over 3 s on an idle page" +
    (delta >= 300 ? " - the overlay looks to be reacting to its own mutations" : ""));

  const eng = live.map((p) => p.engineBuild).filter(Boolean);
  add("locale engine", eng.length > 0, eng.length ? "build " + eng[0] + ", dictionary v" + info.dictionaryVersion : "not installed");
  add("dictionary", info.entries > 0, info.entries + " entries, " + info.rules + " rules"
    + " (bundled " + info.sources.bundled + ", cached " + info.sources.cached +
    ", local " + info.sources.local + ")");

  // Once install() repoints a shortcut its target is wscript.exe, so the exe scan finds nothing;
  // the list recorded at install time is what tells us the wiring exists.
  const wired = (conf.originalShortcuts || []).filter((s) => s && s.lnk);
  if (wired.length) {
    const missing = wired.filter((s) => !fs.existsSync(s.lnk));
    add("shortcuts", missing.length === 0, missing.length
      ? missing.length + " of " + wired.length + " recorded shortcut(s) no longer exist (Cline was reinstalled?) - run ckit install"
      : wired.length + " shortcut(s) go through the cline-kit launcher");
  } else {
    add("shortcuts", true, "not repointed - run ckit install to launch Cline through the overlay");
  }
  return report;
}

function format(r) {
  const lines = r.checks.map((c) => (c.pass ? "  ok   " : "  FAIL ") + c.name + (c.detail ? "  -  " + c.detail : ""));
  if (r.hint) lines.push("  -> " + r.hint);
  return (r.ok ? "Cline-kit looks healthy\n" : "Cline-kit needs attention\n") + lines.join("\n");
}

module.exports = { run, format, PROBE };

if (require.main === module) {
  run().then((r) => { console.log(format(r)); process.exitCode = r.ok ? 0 : 1; })
    .catch((e) => { console.error("doctor: " + e.message); process.exit(1); });
}
