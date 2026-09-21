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

// A real pointer click, not element.click(). The bug this catches is a control that replaces its own
// DOM node on a timer: `element.click()` dispatches against a node that exists for one more
// microsecond and always succeeds, while a human's press-and-release lands on a node that has been
// swapped out, and nothing happens.
async function clickCode(port, code) {
  const where = await evalAll(port, LOCATE(code));
  const raw = where.filter(Boolean)[0];
  if (!raw) throw new Error("could not locate the " + code + " button");
  const at = JSON.parse(raw);
  if (at.err) throw new Error(at.err);
  await cdp.eachPage(port, async (api) => {
    await api.rpc("Input.dispatchMouseEvent", { type: "mouseMoved", x: at.x, y: at.y, button: "none" });
    await api.rpc("Input.dispatchMouseEvent", { type: "mousePressed", x: at.x, y: at.y, button: "left", clickCount: 1 });
    await api.rpc("Input.dispatchMouseEvent", { type: "mouseReleased", x: at.x, y: at.y, button: "left", clickCount: 1 });
    return true;
  });
  return "clicked at " + Math.round(at.x) + "," + Math.round(at.y);
}

const LOCATE = (code) => `(function(){
  var r = document.querySelector("[data-ckit-lang]");
  if(!r) return JSON.stringify({err:"no-row"});
  var b = null;
  [].slice.call(r.querySelectorAll("button[data-ckit-code]")).forEach(function(x){ if(x.getAttribute("data-ckit-code") === ${JSON.stringify(code)}) b = x; });
  if(!b) return JSON.stringify({err:"no-button-for-${code}"});
  var q = b.getBoundingClientRect();
  if (!q.width || !q.height) return JSON.stringify({err:"button has no size"});
  return JSON.stringify({ x: q.x + q.width / 2, y: q.y + q.height / 2 });
})()`;

// How many times our own row was thrown away and rebuilt while nobody touched it. Anything above a
// couple means the control is unstable under the pointer.
const CHURN_START = `(function(){
  var r = document.querySelector("[data-ckit-lang]");
  if(!r || !r.parentElement) return "no-row";
  r.setAttribute("data-churn-probe","1");
  window.__ckitChurn = 0;
  if (window.__ckitChurnStop) window.__ckitChurnStop();
  var mo = new MutationObserver(function(ms){
    ms.forEach(function(m){ [].slice.call(m.addedNodes).forEach(function(n){
      if (n.nodeType===1 && n.hasAttribute && n.hasAttribute("data-ckit-lang") && !n.hasAttribute("data-churn-probe")) window.__ckitChurn++;
    }); });
  });
  mo.observe(r.parentElement, { childList: true });
  window.__ckitChurnStop = function(){ mo.disconnect(); };
  return "watching";
})()`;
const CHURN_READ = `(function(){ var n = window.__ckitChurn || 0; if (window.__ckitChurnStop) window.__ckitChurnStop(); return n; })()`;

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

  console.log("clicking " + target + " inside the window with a real pointer event...");
  await evalAll(conf.port, CHURN_START);
  await sleep(3000);
  const churn = Number((await evalAll(conf.port, CHURN_READ))[0]);
  console.log("  row rebuilt " + churn + " time(s) while untouched");
  if (churn > 2) throw new Error("the row replaces its own DOM node " + churn + "x per 3 s - a real click cannot land on it");
  console.log("  " + await clickCode(conf.port, target));
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
  await clickCode(conf.port, original);
  await sleep(9000);
  const restored = cfg.read().dictionary;
  const reRow = (await evalAll(conf.port, READ_ROW)).filter(Boolean).map((s) => JSON.parse(s)).find((r) => r.row);
  if (restored !== original) throw new Error("restore did not stick (config says " + restored + ")");
  console.log("  restored       : " + restored + ", row title " + (reRow ? reRow.title : "?"));
  console.log(await evalAll(conf.port, CLOSE_SETTINGS));
  console.log("in-app language row works: clicked " + target + ", the window followed, and it went back");
}

main().catch((e) => { console.error("language-picker-check: " + e.message); process.exit(1); });
