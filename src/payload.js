"use strict";
// Build the JS source injected into the Cline webview: dictionary + engine + enabled features.
// The composite version lets the injector notice feature toggles, not just dictionary bumps.
const fs = require("fs");
const path = require("path");
const dict = require("./dict");
const features = require("./features");

const ENGINE = fs.readFileSync(path.join(__dirname, "engine.js"), "utf8");

function json(x) {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

function compose(cfgObj) {
  const d = dict.load(cfgObj);
  const { picked } = features.resolve(cfgObj);
  const parts = ["const DICT = " + json(d) + ";", ENGINE];

  for (const f of picked) {
    parts.push(
      "window.__clineZhFeature = window.__clineZhFeature || {};",
      "window.__clineZhFeature[" + json(f.id) + "] = " + json(f.config) + ";",
      "try {\n" + f.source + "\n} catch (e) { try { console.error('[cline-zh] feature " + f.id + " failed:', e && e.message); } catch (_) { } }"
    );
  }

  // Everything is wrapped in one function scope. A top-level `const DICT` would throw
  // "Identifier 'DICT' has already been declared" on the *second* Runtime.evaluate in the same
  // document, which would silently kill every hot update after the first one.
  const version = "d" + d.version + "|" + picked.map((f) => f.id + ":" + f.version).join(",");
  return {
    source: "(function(){\n" + parts.join("\n") + "\n})();",
    version,
    dict: d,
    picked
  };
}

function build(cfgObj) {
  return compose(cfgObj).source;
}

function info(cfgObj) {
  const d = dict.load(cfgObj);
  const { picked, enabled } = features.resolve(cfgObj);
  return {
    language: d.language,
    version: "d" + d.version + "|" + picked.map((f) => f.id + ":" + f.version).join(","),
    dictionaryVersion: d.version,
    clineVersion: d.clineVersion || null,
    updated: d.updated || null,
    entries: Object.keys(d.entries || {}).length,
    rules: (d.rules || []).length,
    prefixes: (d.prefixes || []).length,
    sources: d.sourceVersions,
    features: features.list().map((f) => ({
      id: f.id, title: f.title, version: f.version, enabled: !!enabled[f.id]
    }))
  };
}

module.exports = { build, info, compose };
