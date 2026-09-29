"use strict";
// Walk the Cline UI over CDP and list strings still left in English.
// Useful after a Cline update, to find dictionary gaps. Output: <configDir>/audit-report.json
//
// The report is meant to be pasted into an issue, and the UI it walks contains the signed-in account's
// e-mail, session titles, project names and file paths. So everything written out is redacted first,
// by default, and `--raw` is opt-in for your own machine only.
const fs = require("fs");
const path = require("path");
const cfg = require("./config");
const cdp = require("./cdp");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Patterns that identify a person rather than a UI string.
const SECRET_SHAPES = [
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, with: "<e-mail>" },
  { re: /[A-Za-z]:[\\/][^\s"',;]*/g, with: "<windows-path>" },
  { re: /(?:file|https?|ws|wss):\/\/[^\s"',;]*/gi, with: "<url>" },
  { re: /\/(?:Users|home|root)\/[^\s"',;]*/g, with: "<unix-path>" },
  // long unbroken alphanumerics: ids, tokens, hashes, uuids
  { re: /\b[A-Za-z0-9_-]{20,}\b/g, with: "<id>" },
  { re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, with: "<uuid>" }
];

function redact(text) {
  let out = String(text);
  let changed = false;
  for (const s of SECRET_SHAPES) {
    const next = out.replace(s.re, s.with);
    if (next !== out) { out = next; changed = true; }
  }
  return { text: out, changed };
}

// Most of what a walk "finds" is not a gap: tool identifiers, provider and model names, and the
// user's own content (session titles, host names, paths) stay in English by policy. Classifying them
// here means the headline number is "strings to translate", instead of a human re-reading the same
// list after every Cline release. The rules are deliberately narrow, and nothing is hidden - these
// items are still printed, under their own heading.
const BY_DESIGN = [
  { re: /<[^>]+>/, why: "redacted user content" },
  { re: /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/, why: "tool identifier" },
  { re: /^(editor|skills|mcp|MCP|terminal|browser)$/, why: "tool identifier" },
  {
    re: /^(Claude Code|Codex|opencode|Cline( Usage-Billing)?|OpenRouter|Vercel AI Gateway|Ollama|LM Studio|Baseten|GitHub|GitLab)$/,
    why: "product name"
  },
  { re: /^[~\/][\w.\/-]+$/, why: "path or file name" }
];

function byDesign(text) {
  const hit = BY_DESIGN.find((r) => r.re.test(text));
  return hit ? hit.why : null;
}

const COLLECT = `(() => {
  const en = (s) => /[A-Za-z]{3}/.test(s) && !/[\\u4e00-\\u9fa5]/.test(s);
  // A node counts as visible only if it is inside the viewport AND is the top-most element
  // at its own centre point. This skips panels React keeps mounted but has hidden.
  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
    const x = Math.min(r.left + r.width / 2, innerWidth - 1);
    const y = Math.min(r.top + r.height / 2, innerHeight - 1);
    const hit = document.elementFromPoint(x, y);
    if (!hit) return false;
    return hit === el || el.contains(hit) || hit.contains(el);
  };
  const out = { text: [], attr: [] };
  const seen = new Set();
  // Never report the kit's own UI: the language row renders a button literally labelled "English",
  // and the sidebar rows carry project folder names. This command exists to find strings *Cline*
  // left in English, so counting our own labels would report a gap that is not there. Same selector
  // the engine exempts.
  const ours = (el) => !!(el && el.closest && el.closest('[data-ckit-ui],[data-ckit-feat]'));
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
    if (!t || !en(t) || t.length > 220) continue;
    const el = n.parentElement; if (!el) continue;
    if (ours(el)) continue;
    if (!onScreen(el)) continue;
    if (!seen.has('T' + t)) { seen.add('T' + t); out.text.push(t); }
  }
  document.querySelectorAll('*').forEach((e) => {
    if (ours(e)) return;
    for (const a of ['placeholder', 'aria-label', 'title']) {
      const v = e.getAttribute(a);
      if (!v || !en(v) || v.length > 220) continue;
      if (!onScreen(e)) continue;
      if (!seen.has('A' + a + v)) { seen.add('A' + a + v); out.attr.push(a + '::' + v); }
    }
  });
  return JSON.stringify(out);
})()`;

function click(cands) {
  return `(() => {
    const want = ${JSON.stringify(cands)};
    const els = [...document.querySelectorAll('button,[role=button],[role=tab],[role=combobox],a,summary,[role=menuitem]')];
    for (const target of want) {
      const hit = els.find((e) => {
        const t = (e.textContent || '').replace(/\\s+/g, ' ').trim();
        const al = e.getAttribute('aria-label') || '';
        return t === target || al === target || t.startsWith(target + ' ') || al.startsWith(target);
      });
      if (hit) { hit.click(); return 'clicked:' + target; }
    }
    return 'MISS:' + want.join('|');
  })()`;
}

const SCREENS = [
  ["settings.general", ["Settings", "设置"], null],
  ["settings.apiProviders", null, ["General", "通用"]],
  ["settings.voice", null, ["API Providers", "API 服务商"]],
  ["settings.import", null, ["Voice", "语音"]],
  ["settings.remote", null, ["Import", "导入"]],
  ["settings.account", null, ["Remote", "远程"]],
  ["home", null, ["Account", "账户"]],
  ["picker.workspace", ["Session", "会话"], null],
  ["page.schedule", null, ["Schedule", "计划任务"]],
  ["page.customize", null, ["Customize", "扩展定制"]],
  ["home.final", null, ["Session", "会话"]]
];

async function run(port, opts) {
  opts = opts || {};
  const results = {};
  // Same guard as the injector: this command clicks through the app, so it must only ever talk to a
  // Cline webview and not whatever else happens to own the port number left in the config.
  const pages = await cdp.pageTargets(port, opts.origin);
  if (!pages.length) throw new Error("no Cline page target on port " + port +
    " (if Cline moved off its usual origin, set it with: ckit config --page-origin=<host>)");
  const ws = await cdp.open(pages[0].webSocketDebuggerUrl);
  const api = cdp.client(ws);
  await api.rpc("Runtime.enable");
  const ev = async (expr) => {
    const r = await api.rpc("Runtime.evaluate", { expression: expr, returnByValue: true });
    return r && r.result ? r.result.value : null;
  };

  for (const [name, nav, sub] of SCREENS) {
    if (nav) await ev(click(nav));
    if (sub) await ev(click(sub));
    await sleep(800);
    const raw = await ev(COLLECT);
    results[name] = raw ? JSON.parse(raw) : { text: [], attr: [] };
  }
  api.close();

  // subtract what the dictionary already covers, so the output is only real gaps
  const dict = require("./dict").load(cfg.read());
  // Scrub the per-screen walk FIRST, then derive the gap list from the scrubbed copy. The report file
  // used to hold the raw strings while only the printed list was redacted - so the e-mail address that
  // "Restore" sits next to went into the JSON the user is told is safe to attach. One redaction path,
  // applied before anything is written or printed, is the only version of this that can be trusted.
  let redactedCount = 0;
  const scrub = (item) => {
    const m = /^(title|aria-label|placeholder)::/.exec(item);
    const bare = m ? item.slice(m[0].length) : item;
    const safe = opts.raw ? { text: bare, changed: false } : redact(bare);
    if (safe.changed) redactedCount++;
    return m ? m[0] + safe.text : safe.text;
  };
  const screens = {};
  for (const [name, v] of Object.entries(results)) {
    screens[name] = { text: (v.text || []).map(scrub), attr: (v.attr || []).map(scrub) };
  }

  const covered = new Set(Object.keys(dict.entries));
  const ruleRes = (dict.rules || []).map((r) => new RegExp(r.pattern));
  const uniq = new Map();
  for (const [screen, v] of Object.entries(screens)) {
    for (const item of [...(v.attr || []), ...(v.text || [])]) {
      const bare = item.replace(/^(title|aria-label|placeholder)::/, "");
      if (covered.has(bare) || ruleRes.some((re) => re.test(bare))) continue;
      if (!uniq.has(bare)) uniq.set(bare, screen);
    }
  }

  const gaps = new Map(), designed = new Map();
  for (const [text, screen] of uniq) {
    const why = byDesign(text);
    if (why && !designed.has(text)) designed.set(text, screen + " · " + why);
    else if (!why) gaps.set(text, screen);
  }

  cfg.ensureDirs();
  const file = path.join(cfg.configDir(), "audit-report.json");
  const report = opts.raw
    ? screens
    : {
      "_note": "Redacted: e-mail addresses, file paths, URLs and long identifiers were replaced with " +
        "placeholders before writing - in this file as well as on screen - because it is meant to be " +
        "attached to an issue. It still lists on-screen text, which can include session titles and " +
        "project names, so skim it before publishing. Re-run with --raw (local only) for the unredacted walk.",
      "_redactedEntries": redactedCount,
      "screens": screens
    };
  fs.writeFileSync(file, JSON.stringify(report, null, 1), "utf8");

  return {
    file, total: gaps.size, redacted: redactedCount, items: [...gaps.entries()],
    byDesign: [...designed.entries()]
  };
}

module.exports = { run, redact, byDesign };

if (require.main === module) {
  const port = Number(process.argv[2] || cfg.read().port);
  run(port).then((r) => {
    console.log("untranslated strings: " + r.total + "  (report: " + r.file + ")");
    r.items.forEach(([s, where]) => console.log("  " + s + "   [" + where + "]"));
  }).catch((e) => { console.error("audit failed: " + e.message); process.exit(1); });
}
