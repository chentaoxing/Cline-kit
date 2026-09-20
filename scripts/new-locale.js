#!/usr/bin/env node
"use strict";
// new-locale.js <locale> "<Label>" - emit a dictionary skeleton from the reference locale (zh-CN).
// Key sets are copied exactly, values are left empty for the translator, so a new locale cannot
// drift from the source strings without the parity check in scripts/selftest.js noticing.
//   node scripts/new-locale.js ja Japanese
const fs = require("fs");
const path = require("path");

const REFERENCE = "zh-CN";
const [locale, label] = process.argv.slice(2);
if (!locale || !/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,4})*$/.test(locale)) {
  console.error("usage: node scripts/new-locale.js <locale> \"<Label>\"   e.g. ja \"Japanese\"");
  process.exit(1);
}
const target = path.join(__dirname, "..", "dictionaries", locale + ".json");
if (fs.existsSync(target)) { console.error("already exists: " + target); process.exit(1); }

const ref = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dictionaries", REFERENCE + ".json"), "utf8"));
const out = {
  version: 1,
  language: locale,
  label: label || locale,
  clineVersion: ref.clineVersion,
  updated: new Date().toISOString().slice(0, 10),
  note: "Whole-string exact matches only. Rules run before prefixes; $1..$9 come from rule capture groups. Provider, model and product names are intentionally left in English.",
  entries: {},
  prefixes: ref.prefixes.map((p) => ({ from: p.from, to: "" })),
  rules: ref.rules.map((r) => ({ pattern: r.pattern, out: "" })),
  featureText: {}
};
for (const k of Object.keys(ref.entries)) out.entries[k] = "";
for (const id of Object.keys(ref.featureText || {})) {
  out.featureText[id] = {};
  for (const k of Object.keys(ref.featureText[id])) out.featureText[id][k] = "";
}
fs.writeFileSync(target, JSON.stringify(out, null, 1) + "\n", "utf8");
console.log(target + ": " + Object.keys(out.entries).length + " entries, " + out.rules.length +
  " rules, " + out.prefixes.length + " prefixes, " +
  Object.keys(out.featureText["sidebar-groups"] || {}).length + " feature strings - all empty, ready to translate");
