#!/usr/bin/env node
"use strict";
// language-picker-check.js - prove the in-app path end to end: the row exists inside Cline's own
// Settings page, and clicking one of its buttons changes the language of the whole window without a
// reload. Then it clicks back, so the machine ends where it started.
//
//   node scripts/language-picker-check.js            # round trip through ja
//   node scripts/language-picker-check.js ko         # through another locale
//
// Needs Cline running through cline-kit (`ckit start`).
const path = require("path");
const cfg = require("../src/config");
const cdp = require("../src/cdp");
const dict = require("../src/dict");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROBE_KEY = "Customize";          // a label present on screen in every locale

const OPEN_SETTINGS = `(function(){
  var b = [].slice.call(document.querySelectorAll("button"))
    .find(function(x){ var k=(x.getAttribute("aria-label")||x.getAttribute("title")||""); return /^(设置|Settings)$/.test(k); });
  if(!b) return "no-settings-button";
  b.click();
  return "opened";
})()`;

const READ_ROW = `(function(){
  var r = document.querySelector("[data-ckit-lang]");
  if(!r) return JSON.stringify({ row:false, hint:"no-row" });
  var btns = [].slice.call(r.querySelectorAll("button")).map(function(b){
    return { label: (b.innerText||"").trim(), pressed: b.getAttribute("aria-pressed"), title: b.getAttribute("title")||"" };
  });
  var p = r.parentElement, i = 0;
  for(; i < p.children.length; i++) if(p.children[i] === r) break;
  var prev = i > 0 ? (p.children[i-1].innerText||"").replace(/\\s+/g," ").trim().slice(0,30) : "";
  var title = r.querySelector("p") ? (r.querySelector("p").innerText||"").trim() : "";
  var hint = r.querySelectorAll("p")[1] ? (r.querySelectorAll("p")[1].innerText||"").trim() : "";
  return JSON.stringify({ row:true, index:i, after:prev, title:title, hint:hint, buttons:btns,
                          ownTextTranslated: /\\{\\{|undefined/.test(r.innerText) });
})()`;

const CLICK_LANG = (code) => `(function(){
  var r = document.querySelector("[data-ckit-lang]");
  if(!r) return "no-row";
  var btns = [].slice.call(r.querySelectorAll("button[data-ckit-code]"));
  var want = ${JSON.stringify(code)};
  var b = null;
  for(var i=0;i<btns.length;i++) if(btns[i].getAttribute("data-ckit-code") === want) b = btns[i];
  if(!b) return "no-button-for-" + want + " (of " + btns.length + ")";
  b.click();
  return "clicked";
})()`;

const COUNT_TEXT = (wanted) => `(function(){
  var wanted = ${JSON.stringify(wanted)};
  var hits = 0;
  var w = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT, null, false);
  var n;
  while((n = w.nextNode())){
    var t = (n.nodeValue||"").replace(/\\s+/g," ").trim();
    if(t === wanted) hits++;
  }
  return JSON.stringify({ hits: hits, build: window.__ckitEngineBuild || "" });
})()`;

const CLOSE_SETTINGS = `(function(){
  var b = [].slice.call(document.querySelectorAll("button"))
    .find(function(x){ var k=(x.getAttribute("aria-label")||x.getAttribute("title")||""); return /^(关闭|Close)$/.test(k); });
  if(b){ b.click(); return "closed"; }
  return "no-close-button";
})()`;

async function evalAll(port, expr) {
  const r = await cdp.eachPage(port, async (api) => {
    const res = await api.rpc("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (res && res.exceptionDetails) throw new Error("evaluate failed: " + (res.exceptionDetails.text || JSON.stringify(res.exceptionDetails).slice(0, 200)));
    return res.result ? res.result.value : null;
  });
  const errs = r.filter((x) => x.error);
  if (errs.length) throw new Error(errs[0].error);
  return r.map((x) => x.result);
}

function labelFor(code) {
  if (code === dict.NONE) return PROBE_KEY;      // nothing replaced: the app's own English label
  const d = JSON.parse(require("fs").readFileSync(dict.bundledPath(code), "utf8"));
  return d.entries[PROBE_KEY];
}

async function main() {
  const conf = cfg.read();
  if (!conf.port) throw new Error("no debug port - run ckit start first");
  const target = process.argv.slice(2).filter((a) => !a.startsWith("--"))[0] || "ja";
  const original = conf.dictionary || "zh-CN";
  if (!dict.isKnown(target) || !dict.isKnown(original)) throw new Error("unknown locale: " + target + "/" + original);
  if (target === original) throw new Error("pick a target different from the current language (" + original + ")");

  console.log("opening Cline's own Settings page...");
  const opened = await evalAll(conf.port, OPEN_SETTINGS);
  if (!opened.some((o) => o === "opened")) throw new Error("could not open Settings: " + JSON.stringify(opened));
  await sleep(2000);

  const rows = (await evalAll(conf.port, READ_ROW)).filter(Boolean).map((s) => JSON.parse(s));
  const row = rows.find((r) => r.row);
  if (!row) throw new Error("the language row is not on the Settings page: " + JSON.stringify(rows));
  console.log("  row title      : " + row.title);
  console.log("  sits under     : " + JSON.stringify(row.after));
  console.log("  buttons        : " + row.buttons.map((b) => b.label + (b.pressed === "true" ? " (selected)" : "")).join(" | "));
  const expected = dict.choices().length;
  if (row.buttons.length !== expected) throw new Error("expected " + expected + " buttons, saw " + row.buttons.length);
  if (row.ownTextTranslated) throw new Error("the engine is translating the picker's own labels");
  if (!row.buttons.some((b) => b.pressed === "true")) throw new Error("no button marks the current language");

  console.log("clicking " + target + " inside the window...");
  const clicked = await evalAll(conf.port, CLICK_LANG(target));
  if (!clicked.some((c) => c === "clicked")) throw new Error("click failed: " + JSON.stringify(clicked));
  await sleep(9000);                       // injector cycle is 4 s; give it two

  const after = (await evalAll(conf.port, READ_ROW)).filter(Boolean).map((s) => JSON.parse(s)).find((r) => r.row);
  if (!after) throw new Error("the row vanished after switching");
  console.log("  row title now  : " + after.title);
  console.log("  selected now   : " + after.buttons.filter((b) => b.pressed === "true").map((b) => b.label).join(","));
  if (after.title === row.title && target !== original) throw new Error("the row did not re-render in the new language");

  const want = labelFor(target);
  const counted = (await evalAll(conf.port, COUNT_TEXT(want))).filter(Boolean).map((s) => JSON.parse(s));
  const hits = counted.reduce((a, b) => a + (b.hits || 0), 0);
  const build = (counted[0] || {}).build || "";
  console.log("  window text    : " + JSON.stringify(want) + " on screen x" + hits + "  [" + build + "]");
  if (!hits) throw new Error("the whole window did not follow the click");
  if (build.indexOf("/" + target) < 0) throw new Error("engine still reports " + build);
  if (cfg.read().dictionary !== target) throw new Error("the choice was not persisted to config");

  console.log("clicking back to " + original + "...");
  const back = await evalAll(conf.port, CLICK_LANG(original));
  if (!back.some((c) => c === "clicked")) throw new Error("restore click failed: " + JSON.stringify(back));
  await sleep(9000);
  const restored = cfg.read().dictionary;
  const reRow = (await evalAll(conf.port, READ_ROW)).filter(Boolean).map((s) => JSON.parse(s)).find((r) => r.row);
  if (restored !== original) throw new Error("restore did not stick (config says " + restored + ")");
  console.log("  restored       : " + restored + ", row title " + (reRow ? reRow.title : "?"));
  console.log(await evalAll(conf.port, CLOSE_SETTINGS));
  console.log("in-app language row works: clicked " + target + ", the window followed, and it went back");
}

main().catch((e) => { console.error("language-picker-check: " + e.message); process.exit(1); });
