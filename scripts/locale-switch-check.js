#!/usr/bin/env node
"use strict";
// locale-switch-check.js - prove the whole chain works for every bundled dictionary: config ->
// injector -> engine -> live DOM, without reloading Cline.
//
//   node scripts/locale-switch-check.js            # all bundled locales
//   node scripts/locale-switch-check.js ja ko      # just these
//
// Needs Cline running through cline-kit (ckit start). Requirements are read from the dictionary
// itself, so the expectations can never drift from the data.
const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const cfg = require("../src/config");
const cdp = require("../src/cdp");
const dictModule = require("../src/dict");

const PROBE_KEY = "Customize";      // a label that is on screen in the default sidebar
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));

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
  if (!ok.length) throw new Error("no webview answered - is Cline running? " + (pages[0] && pages[0].error ? pages[0].error : ""));
  return ok[0];
}

async function main() {
  const conf = cfg.read();
  if (!conf.port) throw new Error("no debug port in config - run ckit start first");
  if (!(await require("../src/launcher").isPortAlive(conf.port))) throw new Error("port " + conf.port + " is not answering - run ckit start");

  const locales = (only.length ? only : dictModule.available()).filter((l) => {
    const d = JSON.parse(fs.readFileSync(dictModule.bundledPath(l), "utf8"));
    return !!d.entries[PROBE_KEY];
  });
  const expectations = {};
  const allStrings = [];
  for (const l of locales) {
    const d = JSON.parse(fs.readFileSync(dictModule.bundledPath(l), "utf8"));
    expectations[l] = d.entries[PROBE_KEY];
    if (allStrings.indexOf(expectations[l]) < 0) allStrings.push(expectations[l]);
    if (allStrings.indexOf(PROBE_KEY) < 0) allStrings.push(PROBE_KEY);
  }

  const original = conf.dictionary || "zh-CN";
  const failures = [];
  for (const locale of locales) {
    conf.dictionary = locale;
    cfg.write(conf);
    await sleep(6500);                       // injector cycle is 4 s; no reload in between
    const r = await probe(conf.port, allStrings);
    const got = r.hits[expectations[locale]] || 0;
    const strays = allStrings.filter((s) => s !== expectations[locale] && s !== PROBE_KEY && r.hits[s] > 0);
    const pass = got > 0 && strays.length === 0;
    if (!pass) failures.push(locale);
    console.log((pass ? "  ok   " : "  FAIL ") + locale.padEnd(7) + JSON.stringify(expectations[locale]) +
      " visible x" + got + (strays.length ? "  stale from " + JSON.stringify(strays) : "") + "  [" + r.build + "]");
  }
  conf.dictionary = original;
  cfg.write(conf);
  await sleep(6500);
  console.log(failures.length ? "FAILED: " + failures.join(", ") : "all " + locales.length + " locales render live, no reload needed");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((e) => { console.error("locale-switch-check: " + e.message); process.exit(1); });
