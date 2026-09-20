"use strict";
// One-off dev helper: convert the working zh.js into a declarative dictionaries/zh-CN.json.
// No eval: the object/array literals in zh.js are JSON-compatible once comment lines are dropped.
const fs = require("fs");
const path = require("path");

const SRC = process.argv[2] || "C:\\Users\\AlphaC\\AppData\\Local\\cline-i18n-zh\\zh.js";
const OUT = path.join(__dirname, "..", "dictionaries", "zh-CN.json");
const src = fs.readFileSync(SRC, "utf8");

function sliceBalanced(marker, open, close) {
  const i = src.indexOf(marker);
  if (i < 0) throw new Error("marker not found: " + marker);
  const start = src.indexOf(open, i);
  let depth = 0;
  for (let k = start; k < src.length; k++) {
    if (src[k] === open) depth++;
    else if (src[k] === close) { depth--; if (depth === 0) return src.slice(start, k + 1); }
  }
  throw new Error("unbalanced block after " + marker);
}

// drop // comment lines, then parse as strict JSON
function parseJsonish(text) {
  const cleaned = text.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n");
  return JSON.parse(cleaned);
}

const entries = parseJsonish(sliceBalanced("const D =", "{", "}"));
const prefixArr = parseJsonish(sliceBalanced("const PREFIX =", "[", "]"));
const prefixes = prefixArr.map((p) => ({ from: p[0], to: p[1] }));

const MONTH = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
const rules = [];
for (const [en, num] of Object.entries(MONTH)) {
  rules.push({ pattern: "^" + en + " (\\d{1,2}), (\\d{4})$", out: "$2年" + num + "月$1日" });
}
rules.push(
  { pattern: "^Thought for (\\d+)m (\\d+)s$", out: "思考了 $1 分 $2 秒" },
  { pattern: "^Thought for (\\d+)s$", out: "思考了 $1 秒" },
  { pattern: "^Worked for (.+?) and made (\\d+) tool calls?$", out: "用时 $1，共 $2 次工具调用" },
  { pattern: "^Worked for (.+?)$", out: "用时 $1" },
  { pattern: "^Explored (\\d+) links?$", out: "已浏览 $1 个链接" },
  { pattern: "^Explored (\\d+) files?$", out: "已查看 $1 个文件" },
  { pattern: "^(\\d+) sessions? found$", out: "找到 $1 个会话" },
  { pattern: "^(\\d+) configured · (\\d+) available$", out: "已配置 $1 个 · 可用 $2 个" },
  { pattern: "^Open diff: (\\d+) additions, (\\d+) deletions$", out: "查看改动：+$1 −$2" },
  { pattern: "^Copy model ID (.+)$", out: "复制模型 ID $1" },
  { pattern: "^Searched (.+)$", out: "已搜索 $1" },
  { pattern: "^Used (\\d+) tools?$", out: "使用了 $1 个工具" }
);

// product / identifier strings that must stay English
for (const keep of ["Codex", "MCP", "Cline", "px"]) delete entries[keep];

const dict = {
  version: 1,
  language: "zh-CN",
  label: "简体中文",
  clineVersion: "0.0.32",
  updated: new Date().toISOString().slice(0, 10),
  note: "Whole-string exact matches only. Rules run before prefixes; $1..$9 come from rule capture groups.",
  entries,
  prefixes,
  rules
};

fs.writeFileSync(OUT, JSON.stringify(dict, null, 1) + "\n", "utf8");
console.log("wrote", OUT);
console.log("entries:", Object.keys(entries).length, "prefixes:", prefixes.length, "rules:", rules.length);
