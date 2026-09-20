"use strict";
// Build the JS source injected into the Cline webview: dictionary + engine + enabled features.
// The composite version lets the injector notice feature toggles, not just dictionary bumps.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dict = require("./dict");
const features = require("./features");

const ENGINE = fs.readFileSync(path.join(__dirname, "engine.js"), "utf8");

function json(x) {
  return JSON.stringify(x).replace(/</g, "\\u003c");
}

function hash12(s) {
  return crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
}

function compose(cfgObj) {
  const d = dict.load(cfgObj);
  const { picked } = features.resolve(cfgObj);
  const parts = ["const DICT = " + json(d) + ";", ENGINE];

  for (const f of picked) {
    // per-feature build hash: the feature's own guard compares against it, so editing the script
    // hot-swaps it without anyone remembering to bump a VER constant
    const cfgObjForFeature = Object.assign({}, f.config, { __build: hash12(f.source) });
    parts.push(
      "window.__clineZhFeature = window.__clineZhFeature || {};",
      "window.__clineZhFeature[" + json(f.id) + "] = " + json(cfgObjForFeature) + ";",
      "try {\n" + f.source + "\n} catch (e) { try { console.error('[cline-zh] feature " + f.id + " failed:', e && e.message); } catch (_) { } }"
    );
  }

  // Version = dictionary version + a hash of the composed source. Keying on the hash means editing
  // engine or feature code triggers a re-inject on its own; a hand-maintained per-feature VER can be
  // forgotten, and the symptom (stale overlay, no error) is nasty to debug.
  const body = parts.join("\n");
  const hash = crypto.createHash("sha1").update(body).digest("hex").slice(0, 9);
  const version = "d" + d.version + "+" + hash;

  // Everything is wrapped in one function scope. A top-level `const DICT` would throw
  // "Identifier 'DICT' has already been declared" on the *second* Runtime.evaluate in the same
  // document, which would silently kill every hot update after the first one.
  return {
    source: "(function(){\n" + body + "\n})();",
    version,
    dict: d,
    picked
  };
}

function build(cfgObj) {
  return compose(cfgObj).source;
}

function info(cfgObj) {
  const { version, dict: d, picked } = compose(cfgObj);
  const enabled = features.enabledSet(cfgObj);
  return {
    language: d.language,
    version,
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
