"use strict";
// Post-audit live check: is the code on disk really the code in the window, and do the fixes hold?
//   1. the page's engine build must equal the one the current source composes
//   2. a kit-injected sidebar row whose folder name is also a UI string must NOT be translated
//      (this is the [data-ckit-feat] exemption - the old engine only exempted [data-ckit-ui])
//   3. an app-side rewrite of a translated node must not be rolled back to stale English
// A leftover `window.__zhUIStats` object from an earlier instance is expected and ignored: globals
// outlive the IIFE that set them, so only a reload clears them.
const path = require("path");
const cdp = require(path.join(__dirname, "..", "src", "cdp"));
const cfg = require(path.join(__dirname, "..", "src", "config"));
const payload = require(path.join(__dirname, "..", "src", "payload"));

const PROBE = `(async () => {
  var out = { engineBuild: window.__ckitEngineBuild || null, locale: window.__ckitLocale || null };

  // (2)+(3) build a fake project row through the real feature DOM, using a folder name that IS a
  // dictionary entry, and see whether the overlay touches it.
  var row = document.createElement("div");
  row.setAttribute("data-ckit-feat", "audit-probe");
  var sp = document.createElement("span");
  sp.textContent = "General";
  row.appendChild(sp);
  document.body.appendChild(row);
  await new Promise(function (r) { setTimeout(r, 1600); });
  out.kitRowAfter = sp.textContent;
  out.kitRowUntouched = sp.textContent === "General";

  // control: the very same string outside our subtree must get translated
  var ctl = document.createElement("div");
  ctl.textContent = "General";
  document.body.appendChild(ctl);
  await new Promise(function (r) { setTimeout(r, 1600); });
  out.controlAfter = ctl.textContent;
  out.controlTranslated = out.controlAfter !== "General";

  // (4) translate a node, then have the "app" replace it with new English, then wait for a scan.
  var live = document.createElement("div");
  live.textContent = "General";
  document.body.appendChild(live);
  await new Promise(function (r) { setTimeout(r, 1600); });
  var translatedTo = live.textContent;
  live.firstChild.nodeValue = "General Account";   // the app rewrote it with a different string
  await new Promise(function (r) { setTimeout(r, 1600); });
  out.appRewriteKept = live.textContent === "General Account";
  out.appRewriteNow = live.textContent;
  out.translatedTo = translatedTo;

  row.remove(); ctl.remove(); live.remove();
  return JSON.stringify(out);
})()`;

(async () => {
  const conf = cfg.read();
  const pages = await cdp.pageTargets(conf.port, conf.pageOrigin);
  if (!pages.length) throw new Error("no Cline page on port " + conf.port);
  const ws = await cdp.open(pages[0].webSocketDebuggerUrl);
  const api = cdp.client(ws, 30000);
  const r = await api.rpc("Runtime.evaluate", { expression: PROBE, returnByValue: true, awaitPromise: true });
  api.close();
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  const got = JSON.parse(r.result.value);
  console.log(JSON.stringify(got, null, 1));
  const fail = [];
  const expected = payload.compose(conf).pageBuild;
  if (got.engineBuild !== expected) {
    fail.push("the window is not running this source: page " + got.engineBuild + ", source " + expected +
      " (restart the injector: ckit start)");
  }
  if (!got.kitRowUntouched) fail.push("a kit row was translated: " + got.kitRowAfter);
  if (!got.controlTranslated) fail.push("control string was NOT translated - is the overlay live at all?");
  if (!got.appRewriteKept) fail.push("the engine rolled back a live app rewrite to " + got.appRewriteNow);
  console.log(fail.length ? "FAIL:\n  " + fail.join("\n  ") : "PASS: new engine live, kit rows exempt, app rewrites kept");
  process.exitCode = fail.length ? 1 : 0;
})().catch((e) => { console.error("audit-live-check: " + e.message); process.exit(1); });
