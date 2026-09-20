"use strict";
// Build the JS source that gets injected into the webview: engine + dictionary data.
const fs = require("fs");
const path = require("path");
const dict = require("./dict");

const ENGINE = fs.readFileSync(path.join(__dirname, "engine.js"), "utf8");

function build(cfgObj) {
  const d = dict.load(cfgObj);
  const safe = JSON.stringify(d).replace(/</g, "\\u003c");
  return "const DICT = " + safe + ";\n" + ENGINE;
}

function info(cfgObj) {
  const d = dict.load(cfgObj);
  return {
    language: d.language,
    version: d.version,
    clineVersion: d.clineVersion || null,
    updated: d.updated || null,
    entries: Object.keys(d.entries || {}).length,
    rules: (d.rules || []).length,
    prefixes: (d.prefixes || []).length,
    sources: d.sourceVersions
  };
}

module.exports = { build, info };
