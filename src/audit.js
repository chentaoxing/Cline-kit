"use strict";
// Walk the Cline UI over CDP and list strings still left in English.
// Useful after a Cline update, to find dictionary gaps. Output: <configDir>/audit-report.json
const fs = require("fs");
const path = require("path");
const cfg = require("./config");
const cdp = require("./cdp");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) {
    const t = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
    if (!t || !en(t) || t.length > 220) continue;
    const el = n.parentElement; if (!el) continue;
    if (!onScreen(el)) continue;
    if (!seen.has('T' + t)) { seen.add('T' + t); out.text.push(t); }
  }
  document.querySelectorAll('*').forEach((e) => {
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

async function run(port) {
  const results = {};
  const pages = await cdp.pageTargets(port);
  if (!pages.length) throw new Error("no Cline page target on port " + port);
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

  cfg.ensureDirs();
  const file = path.join(cfg.configDir(), "audit-report.json");
  fs.writeFileSync(file, JSON.stringify(results, null, 1), "utf8");

  // subtract what the dictionary already covers, so the output is only real gaps
  const dict = require("./dict").load(cfg.read());
  const covered = new Set(Object.keys(dict.entries));
  const ruleRes = (dict.rules || []).map((r) => new RegExp(r.pattern));
  const uniq = new Map();
  for (const [screen, v] of Object.entries(results)) {
    for (const item of [...(v.attr || []), ...(v.text || [])]) {
      const bare = item.replace(/^(title|aria-label|placeholder)::/, "");
      if (covered.has(bare) || ruleRes.some((re) => re.test(bare))) continue;
      if (!uniq.has(bare)) uniq.set(bare, screen);
    }
  }
  return { file, total: uniq.size, items: [...uniq.entries()] };
}

module.exports = { run };

if (require.main === module) {
  const port = Number(process.argv[2] || cfg.read().port);
  run(port).then((r) => {
    console.log("untranslated strings: " + r.total + "  (report: " + r.file + ")");
    r.items.forEach(([s, where]) => console.log("  " + s + "   [" + where + "]"));
  }).catch((e) => { console.error("audit failed: " + e.message); process.exit(1); });
}
