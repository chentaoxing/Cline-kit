"use strict";
// Resident keep-alive: keeps the overlay installed in every Cline webview page.
// Re-reads the dictionary each cycle, so `ckit update` takes effect without a restart.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const cfg = require("./config");
const cdp = require("./cdp");
const dict = require("./dict");
const payload = require("./payload");

const INTERVAL_MS = 4000;
const registered = new Map(); // targetId -> { scriptId, dictVersion }

// The in-app language row cannot swap the dictionary by itself - the payload is composed here. It
// writes one pending intent instead, and this consumes it (read + clear in one expression so a
// second page cannot consume it twice). Clearing is what keeps `ckit locales <code>` authoritative:
// the key is a request, not the stored setting.
const PENDING_KEY = "cline-kit.language-pending";
const CONSUME = "(function(){try{var k=" + JSON.stringify(PENDING_KEY) +
  ";var v=localStorage.getItem(k);if(v)localStorage.removeItem(k);return v||\"\"}catch(e){return\"\"}})()";

async function consumeLanguageIntent(port) {
  let wanted = "";
  const results = await cdp.eachPage(port, async (api) => {
    const r = await api.rpc("Runtime.evaluate", { expression: CONSUME, returnByValue: true });
    if (r && r.exceptionDetails) return "";
    return r && r.result && typeof r.result.value === "string" ? r.result.value : "";
  });
  for (const item of results) if (item && !item.error && item.result) wanted = item.result;
  return wanted;
}

// Surface injection failures instead of swallowing them; a silent no-op is the worst outcome.
function log(msg) {
  try {
    cfg.ensureDirs();
    fs.appendFileSync(path.join(cfg.logDir(), "injector.log"),
      new Date().toISOString() + " " + msg + "\n");
  } catch (e) { /* never fail the loop over logging */ }
}

function clineRunning() {
  if (process.platform !== "win32") return true;
  try {
    const out = execFileSync("tasklist.exe", ["/FI", "IMAGENAME eq cline-app.exe", "/NH"], { encoding: "utf8" });
    return /cline-app\.exe/i.test(out);
  } catch (e) {
    return true; // never exit on a transient query failure while a port still answers
  }
}

async function installOnce(port, source, version) {
  const results = await cdp.eachPage(port, async (api, target) => {
    await api.rpc("Runtime.enable");
    await api.rpc("Page.enable");
    const prev = registered.get(target.id);
    if (!prev || prev.dictVersion !== version) {
      if (prev) {
        try { await api.rpc("Page.removeScriptToEvaluateOnNewDocument", { identifier: prev.scriptId }); } catch (e) { }
      }
      const r = await api.rpc("Page.addScriptToEvaluateOnNewDocument", { source });
      registered.set(target.id, { scriptId: r.identifier, dictVersion: version });
    }
    const r = await api.rpc("Runtime.evaluate", { expression: source });
    if (r && r.exceptionDetails) {
      const ex = r.exceptionDetails.exception || {};
      log("evaluate error on " + target.id + ": " + (ex.description || ex.value || r.exceptionDetails.text));
    }
    return true;
  });
  return results;
}

// The injector is a long-lived process, so editing src/*.js does not affect a running one.
// It records the payload version it actually installed; ckit start compares that with the
// current version and restarts a stale injector (otherwise `git pull` appears to do nothing).
function activeVersionFile() { return path.join(cfg.cacheDir(), "active-version"); }

function readActiveVersion() {
  try { return fs.readFileSync(activeVersionFile(), "utf8").trim(); } catch (e) { return ""; }
}

function writeActiveVersion(v) {
  if (readActiveVersion() === v) return;
  try { cfg.ensureDirs(); fs.writeFileSync(activeVersionFile(), v); } catch (e) { /* best effort */ }
}

async function main() {
  const boot = cfg.read();
  const port = boot.port;
  if (!port) {
    console.error("[cline-kit] injector: no port in config; start via `ckit start`");
    process.exit(2);
  }
  let gone = 0;
  for (;;) {
    try {
      // re-read every cycle so feature toggles, dictionary updates and path changes apply live
      const conf = cfg.read();
      try {
        const wanted = await consumeLanguageIntent(conf.port || port);
        if (wanted && dict.isKnown(wanted) && wanted !== conf.dictionary) {
          conf.dictionary = wanted;
          cfg.write(conf);
          log("language chosen inside Cline -> " + wanted);
        } else if (wanted && !dict.isKnown(wanted)) {
          log("ignored unknown language request: " + wanted);
        }
      } catch (e) { log("language intent failed: " + e.message); }
      const composed = payload.compose(conf);
      await installOnce(conf.port || port, composed.source, composed.version);
      writeActiveVersion(composed.version);
      gone = 0;
    } catch (e) {
      if (!clineRunning() && ++gone > 3) {
        console.log("[cline-kit] cline is gone; injector exiting");
        return;
      }
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { installOnce, readActiveVersion, activeVersionFile, consumeLanguageIntent, PENDING_KEY };
