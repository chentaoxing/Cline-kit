#!/usr/bin/env node
"use strict";
// cli-locale-switch-check.js - prove the user-facing path end to end:
//   `ckit locales <code>`  ->  config  ->  injector  ->  live DOM (no reload)
//
//   node scripts/cli-locale-switch-check.js          # ja, then back to the original
//   node scripts/cli-locale-switch-check.js ko vi    # those, then back
//
// Deliberately drives the CLI as a subprocess: the point is that the command a user types is what
// changes the window, not that an internal module can write a field.
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const cfg = require("../src/config");
const cdp = require("../src/cdp");
const dict = require("../src/dict");

const PROBE_KEY = "Customize";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CLI = path.join(__dirname, "..", "src", "cli.js");

function ckit(args) {
  const r = cp.spawnSync(process.execPath, [CLI].concat(args), { encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "") + (r.stderr || "") };
}

const PROBE = (wanted) => `(function () {
  var wanted = ${JSON.stringify(wanted)};
  var hits = {}; wanted.forEach(function (w) { hits[w] = 0; });
  var tw = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT, null, false);
  var n;
  while ((n = tw.nextNode())) {
    var t = (n.nodeValue || "").replace(/\\s+/g, " ").trim();
    for (var i = 0; i < wanted.length; i++) if (t === wanted[i]) hits[wanted[i]]++;
  }
  return JSON.stringify({ hits: hits, build: window.__ckitEngineBuild || "" });
})()`;

async function probe(port, wanted) {
  const pages = await cdp.eachPage(port, async (api) => {
    const r = await api.rpc("Runtime.evaluate", { expression: PROBE(wanted), returnByValue: true });
    try { return JSON.parse(r.result.value); } catch (e) { return null; }
  });
  const ok = pages.map((p) => p.result).filter(Boolean);
  if (!ok.length) throw new Error("no webview answered - run ckit start first");
  return ok[0];
}

async function main() {
  const conf = cfg.read();
  if (!conf.port) throw new Error("no debug port in config - run ckit start first");
  if (!(await require("../src/launcher").isPortAlive(conf.port))) throw new Error("port not answering - run ckit start");

  const original = conf.dictionary || "zh-CN";
  const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const locales = (targets.length ? targets : ["ja"]).filter((l) => dict.available().includes(l));
  const wanted = [PROBE_KEY];
  for (const l of locales) wanted.push(JSON.parse(fs.readFileSync(dict.bundledPath(l), "utf8")).entries[PROBE_KEY]);
  if (wanted.indexOf(JSON.parse(fs.readFileSync(dict.bundledPath(original), "utf8")).entries[PROBE_KEY]) < 0) {
    wanted.push(JSON.parse(fs.readFileSync(dict.bundledPath(original), "utf8")).entries[PROBE_KEY]);
  }

  const failures = [];
  for (const locale of locales) {
    const r = ckit(["locales", locale]);
    const saved = cfg.read().dictionary;
    if (r.code !== 0 || saved !== locale) failures.push(locale + " (cli exit " + r.code + ", config " + saved + ")");
    await sleep(6500);
    const p = await probe(conf.port, wanted);
    const expect = JSON.parse(fs.readFileSync(dict.bundledPath(locale), "utf8")).entries[PROBE_KEY];
    const hits = p.hits[expect] || 0;
    const strays = wanted.filter((s) => s !== expect && s !== PROBE_KEY && p.hits[s] > 0);
    const pass = hits > 0 && strays.length === 0;
    if (!pass) failures.push(locale + " (visible " + hits + ", stale " + JSON.stringify(strays) + ")");
    console.log((pass ? "  ok   " : "  FAIL ") + "ckit locales " + locale.padEnd(7) + "-> " + JSON.stringify(expect) +
      " on screen x" + hits + "  [" + p.build + "]");
  }

  const back = ckit(["locales", original]);
  if (back.code !== 0 || cfg.read().dictionary !== original) failures.push("restore to " + original);
  console.log("  " + (back.code === 0 ? "restored: " + original : "FAILED to restore " + original));
  console.log(failures.length ? "FAILED: " + failures.join("; ") : "the CLI switch drives the live window for " + locales.length + " locale(s)");
  if (failures.length) process.exit(1);
}

main().catch((e) => { console.error("cli-locale-switch-check: " + e.message); process.exit(1); });
