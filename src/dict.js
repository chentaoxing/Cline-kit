"use strict";
// Dictionary loading + optional GitHub-hosted updates.
// Precedence (lowest -> highest): bundled JSON, cached remote JSON, user local override JSON.
const fs = require("fs");
const path = require("path");
const cfg = require("./config");

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

// Heuristic guard for catastrophic backtracking: a quantified group whose body already ends in a
// quantifier, or alternates between quantified atoms - (a+)+ / (a+|b)+ / (a{2,})+.
function nestedQuantifier(pattern) {
  const s = String(pattern).replace(/\\./g, "  "); // drop escapes: \( and \) must not confuse the scan
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] !== ")") continue;
    const q = s[i + 1];
    if (q !== "*" && q !== "+" && q !== "{") continue;
    let depth = 0, j = i;
    for (; j >= 0; j--) {
      if (s[j] === ")") depth++;
      else if (s[j] === "(") { depth--; if (depth === 0) break; }
    }
    if (j < 0) continue;
    const body = s.slice(j + 1, i).replace(/\s+$/, "");
    if (/[*+}]$/.test(body) || /\|[^|]*[*+]/.test(body)) return true;
  }
  return false;
}

function bundledPath(name) {
  return path.join(__dirname, "..", "dictionaries", name + ".json");
}

function validate(d) {
  if (!d || typeof d !== "object") return false;
  if (typeof d.version !== "number") return false;
  if (!d.entries || typeof d.entries !== "object" || Array.isArray(d.entries)) return false;
  if (!Array.isArray(d.rules) || !Array.isArray(d.prefixes)) return false;

  // Remote dictionaries are data, but they do feed new RegExp(). Keep them anchored and small
  // so a hostile or broken file cannot inject arbitrary behaviour or a pathological regex.
  const keys = Object.keys(d.entries);
  if (keys.length > 20000) return false;
  for (const k of keys) {
    if (typeof k !== "string" || k.length > 400) return false;
    if (typeof d.entries[k] !== "string" || d.entries[k].length > 400) return false;
  }
  for (const r of d.rules) {
    if (!r || typeof r.pattern !== "string" || typeof r.out !== "string") return false;
    if (r.pattern.length > 200 || r.out.length > 200) return false;
    if (r.pattern[0] !== "^" || r.pattern[r.pattern.length - 1] !== "$") return false;
    // Patterns reach new RegExp() in the webview, so a nested quantifier such as (a+)+ is a
    // hang risk, not just a style problem. Reject the shape before it is ever compiled.
    if (nestedQuantifier(r.pattern)) return false;
    try { new RegExp(r.pattern); } catch (e) { return false; }
  }
  for (const p of d.prefixes) {
    if (!p || typeof p.from !== "string" || typeof p.to !== "string") return false;
    if (p.from.length > 100 || p.to.length > 100) return false;
  }
  // featureText is optional, but when present it must be id -> key -> string
  if (d.featureText !== undefined) {
    if (!d.featureText || typeof d.featureText !== "object" || Array.isArray(d.featureText)) return false;
    for (const fid of Object.keys(d.featureText)) {
      const block = d.featureText[fid];
      if (!block || typeof block !== "object" || Array.isArray(block)) return false;
      for (const k of Object.keys(block)) {
        if (typeof block[k] !== "string" || block[k].length > 400) return false;
      }
      if (Object.keys(block).length > 200) return false;
    }
  }
  return true;
}

function merge(base, extra) {
  if (!extra) return base;
  const featureText = Object.assign({}, base.featureText || {}, extra.featureText || {});
  for (const id of Object.keys(featureText)) {
    featureText[id] = Object.assign({}, (base.featureText || {})[id] || {}, (extra.featureText || {})[id] || {});
  }
  const out = {
    version: Math.max(base.version || 0, extra.version || 0),
    language: base.language,
    clineVersion: extra.clineVersion || base.clineVersion,
    updated: extra.updated || base.updated,
    entries: Object.assign({}, base.entries, extra.entries),
    prefixes: (base.prefixes || []).concat((extra.prefixes || []).filter((p) => !(base.prefixes || []).some((b) => b.from === p.from))),
    rules: (base.rules || []).concat((extra.rules || []).filter((r) => !(base.rules || []).some((b) => b.pattern === r.pattern)))
  };
  if (Object.keys(featureText).length) out.featureText = featureText;
  return out;
}

function load(cfgObj) {
  const name = cfgObj.dictionary || "zh-CN";
  let dict = readJson(bundledPath(name));
  if (!dict) throw new Error("bundled dictionary missing: " + name);
  const cached = readJson(cfg.cachedDictFile(name));
  if (cached && validate(cached) && cached.version > dict.version) dict = merge(dict, cached);
  const local = readJson(cfg.localDictFile(name));
  if (local && local.entries) dict = merge(dict, local);
  dict.sourceVersions = {
    bundled: readJson(bundledPath(name))?.version || 0,
    cached: cached?.version || 0,
    local: local?.version || 0
  };
  return dict;
}

async function fetchRemote(url, timeoutMs) {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs || 12000), cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return await res.json();
}

// The configured URL points at the reference dictionary; every locale is a sibling file, so swap
// the file name rather than asking users to configure one URL per language.
function remoteUrlFor(cfgObj) {
  const name = cfgObj.dictionary || "zh-CN";
  const url = cfgObj.updateUrl || "";
  return /CHANGE_ME/.test(url) ? url : url.replace(/zh-CN\.json(\?.*)?$/i, name + ".json$1");
}

// returns { updated, from, to, error }
async function update(cfgObj, opts) {
  opts = opts || {};
  const now = Date.now();
  if (!opts.force && !cfgObj.autoUpdate) return { updated: false, reason: "autoUpdate disabled" };
  if (!opts.force && (now - (cfgObj.lastUpdateCheck || 0)) < (cfgObj.updateIntervalMs || 86400000)) {
    return { updated: false, reason: "not due yet" };
  }
  const url = remoteUrlFor(cfgObj);
  if (!url || /CHANGE_ME/.test(url)) {
    return { updated: false, reason: "no update url configured" };
  }
  cfgObj.lastUpdateCheck = now;
  const name = cfgObj.dictionary || "zh-CN";
  try {
    const remote = await fetchRemote(url);
    if (!validate(remote)) return { updated: false, error: "remote dictionary failed validation" };
    if (remote.language && remote.language !== name) {
      // a 404 page or a mis-pointed URL must not overwrite the locale the user selected
      return { updated: false, error: "remote dictionary is for " + remote.language + ", not " + name };
    }
    const current = load(cfgObj);
    cfgObj.remoteVersion = remote.version;
    cfg.write(cfgObj);
    if (remote.version <= current.version && !opts.force) {
      return { updated: false, from: current.version, to: remote.version, reason: "already current" };
    }
    cfg.ensureDirs();
    fs.writeFileSync(cfg.cachedDictFile(name), JSON.stringify(remote, null, 1), "utf8");
    return { updated: true, from: current.version, to: remote.version };
  } catch (e) {
    cfg.write(cfgObj);
    return { updated: false, error: e.message };
  }
}

function available() {
  const dir = path.join(__dirname, "..", "dictionaries");
  try {
    return fs.readdirSync(dir).filter((f) => /^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?\.json$/.test(f))
      .map((f) => f.replace(/\.json$/, ""));
  } catch (e) { return []; }
}

module.exports = { load, update, validate, bundledPath, nestedQuantifier, remoteUrlFor, available };
