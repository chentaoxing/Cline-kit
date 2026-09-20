"use strict";
// Extract candidate user-visible English strings from the Cline desktop webview source.
// Heuristic on purpose: this is a *coverage* tool, not a parser. Every hit is a suggestion to
// review, and the overlay still matches on the rendered English text.
//
//   node scripts/extract-source-keys.js <webviewDir> [--json out.json] [--report]
const fs = require("fs");
const path = require("path");

const argv = process.argv.slice(2);
const ROOT = argv.find((a) => !a.startsWith("--"));
const jsonOut = (argv.find((a) => a.startsWith("--json")) && argv[argv.indexOf("--json") + 1]) || null;

const SKIP_FILE = /(\.test\.|\.spec\.|\.d\.ts$|node_modules|\.next|generated|mock|fixtures?|icons?\/)/i;
const VISIBLE_PROPS = ["title", "placeholder", "aria-label", "label", "description", "tooltip", "emptyMessage", "errorMessage", "heading", "subtitle", "hint"];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_FILE.test(p + "/")) walk(p, out);
    } else if (/\.(tsx|ts)$/.test(name) && !SKIP_FILE.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function isProse(s) {
  if (!/[A-Za-z]{3}/.test(s)) return false;
  if (/[{}<>`$]|=>|https?:|\.[a-z]{2,4}$|\/|\//i.test(s)) return false;
  if (/^[A-Z][A-Z0-9_]+$/.test(s)) return false;          // CONSTANT
  if (/^[A-Z][a-zA-Z0-9]*$/.test(s) && !/\s/.test(s)) return false; // ComponentName
  if (/^[a-z][a-zA-Z0-9]*[A-Z]/.test(s) && !/\s/.test(s)) return false; // camelCase identifier
  if (/^[\w.-]+@[\w.-]+$/.test(s)) return false;
  // JSX interpolation leftovers and member expressions: {task.title}, a ? "x" : "y", i18n keys
  if (/[?:]/.test(s) && !/[.!?]$/.test(s)) return false;
  if (/^[a-z][\w$]*\.[a-z][\w$]*$/i.test(s)) return false;
  if (/^[a-z][a-z0-9]*([.-][a-z0-9]+)+$/i.test(s)) return false; // dotted key path
  if (!/\s/.test(s) && s.length <= 12 && /^[a-z]/.test(s)) return false; // bare identifier
  if (/\b(types?|interface|enum|const|function|import|export|require|node_modules|cmd|powershell|regex)\b/i.test(s) && !/[.!?]$/.test(s)) return false;
  return true;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

function extract(file) {
  const src = fs.readFileSync(file, "utf8");
  const hits = [];
  const push = (text, kind, idx) => {
    const t = String(text).replace(/\s+/g, " ").trim();
    if (t.length > 2 && t.length < 300 && isProse(t)) hits.push({ file: path.relative(ROOT, file), line: lineOf(src, idx), kind, text: t });
  };

  // 1. JSX text children:  >Text<  and  >Text{' '}More<
  const jsxText = />{([^<>{}]+)}/g;
  let m;
  while ((m = jsxText.exec(src))) push(m[1], "jsx-text", m.index);

  // 2. visible props with string literals:  title="..."  aria-label={'...'}  placeholder={`...`}
  for (const prop of VISIBLE_PROPS) {
    const re = new RegExp("\\b" + prop.replace(/-/g, "\\-") + "\\s*=\\s*(?:\"([^\"]+)\"|'([^']+)'|\\{\\s*[\"`]([^\"`]+)[\"`]\\s*\\})", "g");
    while ((m = re.exec(src))) push(m[1] || m[2] || m[3], "prop:" + prop, m.index);
  }

  // 3. label tables:  { label: "Save", description: "..." }
  for (const prop of VISIBLE_PROPS) {
    const re = new RegExp("[{,]\\s*" + prop + "\\s*:\\s*(?:\"([^\"]+)\"|'([^']+)')", "g");
    while ((m = re.exec(src))) push(m[1] || m[2], "table:" + prop, m.index);
  }
  return hits;
}

const files = walk(ROOT);
const all = [];
for (const f of files) { try { all.push(...extract(f)); } catch (e) { /* unreadable */ } }

const byText = new Map();
for (const h of all) if (!byText.has(h.text)) byText.set(h.text, h);
const unique = [...byText.values()];

// compare against the overlay dictionary we already have
const dictPath = path.join(__dirname, "..", "dictionaries", "zh-CN.json");
const have = new Set(Object.keys(JSON.parse(fs.readFileSync(dictPath, "utf8")).entries));
const missing = unique.filter((u) => !have.has(u.text));

console.log("scanned files :", files.length);
console.log("raw hits      :", all.length);
console.log("unique strings:", unique.length);
console.log("already covered by dictionaries/zh-CN.json:", unique.length - missing.length);
console.log("NOT covered   :", missing.length);
console.log("\nby kind:");
const kinds = {};
for (const u of unique) kinds[u.kind] = (kinds[u.kind] || 0) + 1;
Object.entries(kinds).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log("  " + String(v).padStart(5) + "  " + k));
console.log("\nsample uncovered strings:");
for (const u of missing.slice(0, 30)) console.log(`  [${u.kind}] ${u.file}:${u.line}  ${u.text.slice(0, 90)}`);

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ root: ROOT, files: files.length, unique, missing }, null, 1), "utf8");
  console.log("\nwrote", jsonOut);
}
