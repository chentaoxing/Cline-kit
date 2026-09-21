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

// The whole point of shipping every locale inside the payload is that clicking a language no longer
// depends on a Node process being alive. The English keys are identical across locales (npm test
// enforces it), so they are stored once and each locale is a value array aligned to that list -
// ~74 KB instead of ~112 KB for five full copies.
function embedAllLocales(d, cfgObj) {
  const reference = dict.load(Object.assign({}, cfgObj, { dictionary: "zh-CN" }));
  const keys = Object.keys(reference.entries || {});
  const locales = {};
  for (const code of dict.available()) {
    if (code === d.language) continue;
    const other = dict.load(Object.assign({}, cfgObj, { dictionary: code }));
    locales[code] = {
      version: other.version,
      entries: keys.map((k) => other.entries[k] || ""),
      rules: other.rules || [],
      prefixes: other.prefixes || []
    };
  }
  // "leave Cline's own text alone" has to be selectable from inside the page too.
  locales[dict.NONE] = { version: 0, entries: [], rules: [], prefixes: [] };
  d.keys = keys;
  d.locales = locales;
  return d;
}

function compose(cfgObj) {
  const d = embedAllLocales(dict.load(cfgObj), cfgObj);
  // the engine guards on its own build hash so code edits hot-swap even when the dictionary
  // version is unchanged
  d.engineBuild = hash12(ENGINE);
  const { picked } = features.resolve(cfgObj, d);
  const parts = ["const DICT = " + json(d) + ";", ENGINE];

  for (const f of picked) {
    // Per-feature build hash over source *and* config: editing the script hot-swaps it, and so does a
    // config change (a different `current` language, a new hide path) - keying on source alone left a
    // feature running with stale config until a full reload.
    const plain = Object.assign({}, f.config);
    const cfgObjForFeature = Object.assign({}, plain, { __build: hash12(f.source + "\u0000" + json(plain)) });
    parts.push(
      "window.__clineKitFeature = window.__clineKitFeature || {};",
      "window.__clineKitFeature[" + json(f.id) + "] = " + json(cfgObjForFeature) + ";",
      "try {\n" + f.source + "\n} catch (e) { try { console.error('[cline-kit] feature " + f.id + " failed:', e && e.message); } catch (_) { } }"
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
    // What the engine inside the page will call itself for this payload. The injector compares that
    // before re-sending ~110 KB, so an idle window is not asked to re-parse the whole dictionary set
    // every four seconds.
    pageBuild: d.engineBuild + "/d" + d.version + "/" + d.language,
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
