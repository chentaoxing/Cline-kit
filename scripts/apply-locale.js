#!/usr/bin/env node
"use strict";
// apply-locale.js <locale> <map.json> - fill dictionaries/<locale>.json from a flat
// { "English source": "translation" } map, so translators never hand-edit the dictionary file
// itself and cannot break its key order, formatting or rule patterns.
//
//   node scripts/apply-locale.js ja /tmp/ja-map.json
//
// The map may also carry "_rules": { "<pattern>": "output" }, "_prefixes": { "<from>": "to" }
// and "_feature": { "sidebar-groups": { "current": "..." } } sections.
const fs = require("fs");
const path = require("path");

const [locale, mapPath] = process.argv.slice(2);
if (!locale || !mapPath) {
  console.error('usage: node scripts/apply-locale.js <locale> "<map.json>"');
  process.exit(1);
}
const dictPath = path.join(__dirname, "..", "dictionaries", locale + ".json");
const dict = JSON.parse(fs.readFileSync(dictPath, "utf8"));
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));

const strip = (s) => String(s).replace(/\s+/g, " ").trim();
let filled = 0; const missing = []; const extra = [];

const known = new Set(Object.keys(dict.entries));
for (const en of Object.keys(map)) {
  if (en.startsWith("_")) continue;
  if (!known.has(en)) extra.push(en);
}

for (const en of Object.keys(dict.entries)) {
  const hit = Object.prototype.hasOwnProperty.call(map, en) ? map[en] : map[strip(en)];
  if (typeof hit === "string" && hit.trim()) { dict.entries[en] = hit; filled++; }
  else missing.push(en);
}
for (const r of dict.rules) {
  const v = (map._rules || {})[r.pattern];
  if (typeof v === "string" && v.trim()) { r.out = v; filled++; } else missing.push("rule " + r.pattern);
}
for (const p of dict.prefixes) {
  const v = (map._prefixes || {})[p.from];
  if (typeof v === "string" && v.trim()) { p.to = v; filled++; } else missing.push("prefix " + p.from);
}
for (const id of Object.keys(dict.featureText || {})) {
  for (const key of Object.keys(dict.featureText[id])) {
    const v = (map._feature || {})[id] && (map._feature || {})[id][key];
    if (typeof v === "string" && v.trim()) { dict.featureText[id][key] = v; filled++; }
    else missing.push(id + "." + key);
  }
}
dict.version = Number(dict.version) || 1;
dict.updated = new Date().toISOString().slice(0, 10);

if (extra.length) {
  console.error(extra.length + " map key(s) are not in the dictionary (first 5):\n  " + extra.slice(0, 5).join("\n  "));
  process.exit(1);
}
fs.writeFileSync(dictPath, JSON.stringify(dict, null, 1) + "\n", "utf8");
console.log(locale + ": filled " + filled + ", still empty " + missing.length);
if (missing.length) {
  console.log("first 10 empty:\n  " + missing.slice(0, 10).join("\n  "));
  process.exit(2);
}
