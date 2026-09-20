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
  var out = { engineBuild: window.__ckitEngineBuild || null, features: {} };
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
    report.hint = alive ? "" :
      "Cline has to be started by cline-kit (it sets WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS). " +
      "If Cline is open but has no debug port, run: ckit start --restart";
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
      ? seen.map((s) => "build " + s.build + (s.stats ? ", " + s.stats.rows + " row(s) added of " + s.stats.registered + " registered, " + s.stats.nativeGroups + " native" : "")).join(" | ")
      : "not present in any page - Cline's DOM may have changed");
  }

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
  return (r.ok ? "cline-kit looks healthy\n" : "cline-kit needs attention\n") + lines.join("\n");
}

module.exports = { run, format, PROBE };

if (require.main === module) {
  run().then((r) => { console.log(format(r)); process.exitCode = r.ok ? 0 : 1; })
    .catch((e) => { console.error("doctor: " + e.message); process.exit(1); });
}
