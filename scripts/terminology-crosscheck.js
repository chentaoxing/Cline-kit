#!/usr/bin/env node
"use strict";
// terminology-crosscheck.js - compare our machine-assisted dictionaries against professional human
// localizations of the same software vocabulary, and report where we diverge.
//
//   node scripts/terminology-crosscheck.js            # all four locales, cached glossaries
//   node scripts/terminology-crosscheck.js ja ko      # just these
//   node scripts/terminology-crosscheck.js --fetch    # re-download the reference packs
//   node scripts/terminology-crosscheck.js --terms   # only whole-label matches (highest signal)
//   node scripts/terminology-crosscheck.js --json    # machine-readable report
//
// Why this exists: zh-TW / ja / ko / vi ship complete but were never reviewed by a native speaker.
// "Unreviewed" is not the same as "uncheckable" - VS Code's language packs are translated by
// professional localization vendors under MIT, so where VS Code has a term and we invented a
// different one, that is a real signal worth looking at. This is a *report*, not an auto-fix: the
// tool flags divergence, a human decides. Never treat a flag as a wrong answer.
//
// Reference data is cached under %APPDATA%\cline-kit\cache\l10n and is never committed.
const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const cfg = require("../src/config");
const dict = require("../src/dict");

const REFERENCE = {
  // microsoft/vscode-loc, MIT. The per-language main.i18n.json carries ~24k UI strings, and a large
  // share of the keys *are* the English source text lowercased, which is what makes pairing possible.
  "zh-TW": { url: "https://raw.githubusercontent.com/microsoft/vscode-loc/main/i18n/vscode-language-pack-zh-hant/translations/main.i18n.json", kind: "vscode" },
  ja: { url: "https://raw.githubusercontent.com/microsoft/vscode-loc/main/i18n/vscode-language-pack-ja/translations/main.i18n.json", kind: "vscode" },
  ko: { url: "https://raw.githubusercontent.com/microsoft/vscode-loc/main/i18n/vscode-language-pack-ko/translations/main.i18n.json", kind: "vscode" },
  // Vietnamese has no VS Code pack, so pair Firefox instead: the localized file and en-US share
  // entity ids, which is the same trick in a different container. MPL-2.0.
  vi: {
    kind: "ftl-pairs",
    files: [
      "browser.ftl", "appmenu.ftl", "menubar.ftl", "downloads.ftl", "search.ftl", "pageInfo.ftl",
      "preferences/preferences.ftl"
    ].map((rel) => ({
      en: "https://raw.githubusercontent.com/mozilla-firefox/firefox/main/browser/locales/en-US/browser/" + rel,
      target: "https://raw.githubusercontent.com/mozilla-l10n/firefox-l10n/main/vi/browser/browser/" + rel,
      cache: "vi." + rel.replace(/[\/.]/g, "_"), parser: "ftl"
    }))
  }
};

const ARGS = process.argv.slice(2);
const FETCH = ARGS.includes("--fetch");
const AS_JSON = ARGS.includes("--json");
const TERMS_ONLY = ARGS.includes("--terms");
const ONLY = ARGS.filter((a) => !a.startsWith("--"));

function cacheDir() { return path.join(cfg.cacheDir(), "l10n"); }

function parseFtl(t) {
  // entity = value, with continuation lines indented. Attributes (.label / .tooltiptext) are
  // separate strings and must not be folded into the parent value.
  const out = new Map();
  let key = null, val = null;
  const flush = () => { if (key && val != null) out.set(key, val.trim()); };
  for (const raw of t.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) { flush(); key = null; val = null; continue; }
    if (/^\s*\.[A-Za-z]/.test(line)) continue;                 // attribute of the current entity
    const m = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.*)$/);
    if (m && !/^\s/.test(raw)) { flush(); key = m[1]; val = m[2]; }
    else if (key && /^\s+/.test(raw)) val += " " + line.trim();
  }
  flush();
  return out;
}

function parseProperties(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || t.startsWith("!")) continue;
    const i = t.indexOf("=");
    if (i < 1) continue;
    out.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return out;
}

function getOnce(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "user-agent": "cline-kit-terminology-check", "accept-encoding": "gzip" } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return getOnce(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("HTTP " + res.statusCode + " for " + url));
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("error", reject);
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        resolve(res.headers["content-encoding"] === "gzip" ? zlib.gunzipSync(buf) : buf);
      });
    });
    req.on("error", reject);
    req.setTimeout(25000, () => req.destroy(new Error("timeout after 25s: " + url)));
  });
}

// Reference packs are fetched from overseas CDNs on this machine, where a dropped connection is
// routine; retry rather than making the tool look broken.
async function get(url, tries) {
  let last;
  for (let i = 0; i <= (tries == null ? 3 : tries); i++) {
    try { return await getOnce(url); }
    catch (e) { last = e; await new Promise((r) => setTimeout(r, 600 * (i + 1))); }
  }
  throw last;
}

async function loadReference(code) {
  const ref = REFERENCE[code];
  fs.mkdirSync(cacheDir(), { recursive: true });
  if (ref.kind === "vscode") {
    const file = path.join(cacheDir(), code + ".vscode.json");
    if (!fs.existsSync(file) || FETCH) {
      process.stderr.write("fetching " + code + " reference pack...\n");
      fs.writeFileSync(file, await get(ref.url, 2), "utf8");
    }
    return { kind: "vscode", pack: JSON.parse(fs.readFileSync(file, "utf8")) };
  }
  const maps = [];
  for (const f of ref.files) {
    const file = path.join(cacheDir(), f.cache);
    if (!fs.existsSync(file) || FETCH) {
      process.stderr.write("fetching " + code + " reference (" + f.cache + ")...\n");
      try {
        const [en, tgt] = await Promise.all([get(f.en, 3), get(f.target, 3)]);
        fs.writeFileSync(file, JSON.stringify({ en: en.toString("utf8"), target: tgt.toString("utf8") }), "utf8");
      } catch (e) {
        // One dead URL must not cost the whole report - raw.githubusercontent is flaky from here,
        // and the remaining files still carry plenty of terms.
        process.stderr.write("  skipped " + f.cache + ": " + e.message + "\n");
        continue;
      }
    }
    let both;
    try { both = JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (e) { process.stderr.write("  unreadable " + f.cache + "\n"); continue; }
    const parse = f.parser === "ftl" ? parseFtl : parseProperties;
    maps.push({ en: parse(both.en), tgt: parse(both.target) });
  }
  return { kind: "pairs", maps };
}

// english (lowercased, no punctuation) -> Set of human renderings
function buildGlossary(ref) {
  const g = new Map();
  const add = (en, val) => {
    if (!en || !val) return;
    const key = en.trim().toLowerCase();
    if (key.length < 3 || key.length > 40) return;
    if (!g.has(key)) g.set(key, new Set());
    g.get(key).add(val);
  };
  if (ref.kind === "vscode") {
    const contents = ref.pack.contents || {};
    for (const mod of Object.keys(contents)) {
      for (const [key, val] of Object.entries(contents[mod] || {})) {
        if (typeof val !== "string" || !val.trim()) continue;
        // Pair on keys that are real English text, not internal ids like `dialogErrorMessage`.
        if (!/^[a-z][a-z0-9 ()\-\/',.]*$/i.test(key)) continue;
        if (!/[A-Za-z]{2}/.test(key)) continue;
        // VS Code marks mnemonics like "再試行(&&R)" - strip them.
        const clean = val.replace(/\(&&.\)/g, "").replace(/\(\&.\)/g, "").trim();
        add(key, clean);
      }
    }
    return g;
  }
  for (const m of ref.maps) {
    for (const [id, enVal] of m.en) {
      const tgt = m.tgt.get(id);
      if (!tgt) continue;
      // Firefox strings carry placeholders and whole sentences; keep the bare terms.
      const cleanEn = enVal.replace(/\{[^}]*\}/g, " ").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
      const cleanTg = tgt.replace(/\{[^}]*\}/g, " ").replace(/\\n/g, " ").replace(/\s+/g, " ").trim();
      if (!cleanEn || !cleanTg) continue;
      add(cleanEn, cleanTg);
      for (const w of cleanEn.split(/[^A-Za-z']+/)) if (w.length >= 5) add(w, cleanTg);
    }
  }
  return g;
}

function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

// Our side keeps whole strings ("Delete all chats"), the reference keeps UI labels ("cancel").
// Compare on the terms that can actually match: the full key, then single words long enough to be
// meaningful, and only flag when the reference is confident (one dominant rendering).
function candidateTerms(enKey) {
  const k = norm(enKey).toLowerCase();
  const out = new Set();
  if (k.length >= 3 && k.length <= 40) out.add(k);
  for (const w of k.split(/[^a-z0-9']+/)) {
    if (w.length >= 4 && !STOP.has(w)) out.add(w);
  }
  // singular/plural both, because VS Code keys are frequently plural
  for (const w of Array.from(out)) {
    if (w.endsWith("s") && w.length > 4) out.add(w.slice(0, -1));
    else if (!w.endsWith("s") && w.length > 4) out.add(w + "s");
  }
  return Array.from(out);
}

const STOP = new Set(["with", "from", "this", "that", "your", "the", "and", "for", "not", "all", "are",
  "you", "can", "will", "have", "been", "into", "than", "then", "when", "what", "which", "their",
  "there", "here", "please", "would", "could", "should", "about", "just", "only", "more", "most"]);

// Does our rendering already contain the reference term (or a stem of it)? Case-insensitive:
// "Sao chép" and "sao chép" are the same term, and treating them as a divergence buries the signal.
function containsTerm(hay, term) {
  if (!hay || !term) return false;
  const h = hay.toLowerCase(), t = term.toLowerCase();
  if (h.indexOf(t) >= 0) return true;
  const stem = t.length > 4 ? t.slice(0, t.length - 1) : t;
  return h.indexOf(stem) >= 0;
}

// The reference file mixes label-level terms with whole sentences ("將交談分支為新的聊天工作階段")
// and parameterised strings ("{0} 則訊息"). Only a short, standalone rendering is a *term* we can
// hold our own translation against; anything longer is context we cannot compare.
function isTerm(value) {
  const v = value.trim();
  if (!v || /[{}\$(]/.test(v)) return false;
  if (/[::。.，,；;]$/.test(v)) return false;
  const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g;
  const cjk = v.match(CJK);
  const latin = v.match(/[A-Za-z]/g);
  if (cjk && cjk.length > 8) return false;
  if (!cjk && latin && latin.length > 22) return false;
  return true;
}

function checkLocale(code, glossary) {
  const d = JSON.parse(fs.readFileSync(dict.bundledPath(code), "utf8"));
  const flags = [];
  const keepEnglish = [];
  let checked = 0;
  for (const [en, oursRaw] of Object.entries(d.entries)) {
    const ours = norm(oursRaw);
    const terms = candidateTerms(en);
    let hit = null;
    for (const t of terms) {
      const ref = glossary.get(t);
      if (!ref) continue;
      if (ref.size !== 1) continue;                 // ambiguous in the reference itself - no signal
      const refVal = Array.from(ref)[0];
      if (refVal.length < 2) continue;
      hit = { term: t, ref: refVal };
      break;
    }
    if (!hit) continue;
    checked++;
    // Full-key matches are the only apples-to-apples comparison: the whole label is that one term.
    const exact = hit.term === norm(en).toLowerCase();
    // Two different findings, deliberately separated.
    if (!isTerm(hit.ref)) continue;                  // reference value is a sentence, not a term
    if (/^[A-Za-z0-9 .+\/-]+$/.test(hit.ref)) {
      // The reference left the word in English (VS Code does this for Agent, MCP, Token...). If we
      // translated it, that is worth a look - over-translation reads worse than a loanword.
      if (exact && !containsTerm(ours, hit.ref) && /[㐀-䶿一-鿿぀-ヿ가-힯]/.test(ours)) {
        keepEnglish.push({ en, ours, term: hit.term, reference: hit.ref, exact });
      }
      continue;
    }
    if (containsTerm(ours, hit.ref) || containsTerm(hit.ref, ours)) continue;
    flags.push({ en, ours, term: hit.term, reference: hit.ref, exact });
  }
  return { code, checked, flags, keepEnglish };
}

async function main() {
  const codes = (ONLY.length ? ONLY : Object.keys(REFERENCE)).filter((c) => REFERENCE[c]);
  const skipped = (ONLY.length ? ONLY : Object.keys(REFERENCE)).filter((c) => !REFERENCE[c]);
  const report = [];
  for (const code of codes) {
    const pack = await loadReference(code);
    const glossary = buildGlossary(pack);
    const r = checkLocale(code, glossary);
    r.glossaryTerms = glossary.size;
    report.push(r);
  }
  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 1));
    return;
  }
  for (const r of report) {
    console.log("\n" + r.code + "  (reference terms: " + r.glossaryTerms + ", comparable strings: " +
      r.checked + ", term divergences: " + r.flags.length + ", we translated what the reference keeps in English: " + r.keepEnglish.length + ")");
    const seen = new Map();
    for (const f of r.flags) {
      const k = f.term + " => " + f.reference;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    const repeated = r.flags.filter((f) => seen.get(f.term + " => " + f.reference) > 1);
    const oneOff = r.flags.filter((f) => seen.get(f.term + " => " + f.reference) === 1);
    let all = repeated.concat(oneOff);
    if (TERMS_ONLY) all = all.filter((f) => f.exact);
    const show = all.slice(0, TERMS_ONLY ? 200 : 40);
    for (const f of show) {
      console.log("  [" + f.term + " x" + seen.get(f.term + " => " + f.reference) + "] ref=" + f.reference +
        "\n      ours=" + f.ours + "   («" + f.en + "»)");
    }
    if (all.length > show.length) console.log("  ... " + (all.length - show.length) + " more");
    if (r.keepEnglish.length) {
      console.log("  -- reference leaves these in English, we translated them:");
      r.keepEnglish.slice(0, 12).forEach((f) =>
        console.log("     " + f.reference + "   ours=" + f.ours + " («" + f.en + "»)"));
    }
  }
  if (skipped.length) console.log("\nno reference wired for: " + skipped.join(", ") + " (checked separately)");
  console.log("\nDivergence is a question, not a verdict: VS Code localizes a different product with");
  console.log("different width limits and a different voice. Fix the ones where the reference term is");
  console.log("the one Vietnamese/Japanese/Korean readers of *any* dev tool expect, not all of them.");
}

main().catch((e) => { console.error("terminology-crosscheck: " + e.message); process.exit(1); });
