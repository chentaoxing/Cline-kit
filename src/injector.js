"use strict";
// Resident keep-alive: keeps the overlay installed in every Cline webview page.
// Re-reads the dictionary each cycle, so `cline-zh update` takes effect without a restart.
const { execFileSync } = require("child_process");
const cfg = require("./config");
const cdp = require("./cdp");
const payload = require("./payload");

const INTERVAL_MS = 4000;
const registered = new Map(); // targetId -> { scriptId, dictVersion }

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
    await api.rpc("Runtime.evaluate", { expression: source });
    return true;
  });
  return results;
}

async function main() {
  const conf = cfg.read();
  const port = conf.port;
  if (!port) {
    console.error("[cline-zh] injector: no port in config; start via `cline-zh start`");
    process.exit(2);
  }
  let gone = 0;
  for (;;) {
    try {
      const source = payload.build(conf);
      const version = payload.info(conf).version;
      await installOnce(port, source, version);
      gone = 0;
    } catch (e) {
      if (!clineRunning() && ++gone > 3) {
        console.log("[cline-zh] cline is gone; injector exiting");
        return;
      }
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { installOnce };
