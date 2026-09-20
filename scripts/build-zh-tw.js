#!/usr/bin/env node
"use strict";
// build-zh-tw.js - derive dictionaries/zh-TW.json from dictionaries/zh-CN.json.
//
// Two steps, because character conversion alone is not localisation:
//   1. OpenCC s2tw converts simplified -> traditional characters (needs python + `pip install opencc`).
//   2. A Taiwan software-term table rewrites the words where the mainland term is simply not what a
//      zh-TW user reads in an app (搜索 -> 搜尋, 界面 -> 介面, 默认 -> 預設, ...).
//
// The generated file is committed, so end users never need python; re-run this whenever zh-CN changes
// and review the diff.  node scripts/build-zh-tw.js [--dry]
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REF = path.join(ROOT, "dictionaries", "zh-CN.json");
const OUT = path.join(ROOT, "dictionaries", "zh-TW.json");
const DRY = process.argv.includes("--dry");

// Applied to the *traditional* output; longest match first so 文件夾 wins over 文件.
const TERMS = [
  ["數據存儲", "資料儲存"], ["存儲空間", "儲存空間"], ["存儲", "儲存"],
  ["文件夾", "資料夾"], ["文件系統", "檔案系統"], ["文件", "檔案"],
  ["數據", "資料"], ["資料庫", "資料庫"], ["數據", "資料"],
  ["界面", "介面"], ["使用者介面", "使用者介面"],
  ["視頻", "影片"], ["音頻", "音訊"],
  ["網路", "網路"], ["網絡", "網路"],
  ["軟件", "軟體"], ["軟體", "軟體"],
  ["加載", "載入"], ["重新載入", "重新整理"],
  ["登錄", "登入"], ["登出", "登出"], ["退出登入", "登出"], ["註冊", "註冊"],
  ["賬號", "帳號"], ["帳號", "帳號"], ["賬戶", "帳戶"], ["賬單", "帳單"], ["账单", "帳單"],
  ["默認", "預設"], ["用戶", "使用者"], ["伺服器", "伺服器"], ["服務器", "伺服器"],
  ["搜索", "搜尋"], ["搜尋", "搜尋"],
  ["設置", "設定"], ["列表", "清單"], ["分區", "區塊"], ["定製", "自訂"], ["擴展", "進階"],
  ["服務商", "服務供應商"], ["菜單", "選單"], ["頁面", "頁面"], ["滑鼠", "滑鼠"],
  ["新建", "新增"], ["後退", "上一頁"], ["連接器", "連線器"], ["連接", "連線"],
  ["遠程", "遠端"], ["消息", "訊息"], ["密鑰", "金鑰"], ["請求頭", "標頭"],
  ["支持", "支援"], ["內存", "記憶體"], ["緩存", "快取"], ["隊列", "佇列"],
  ["窗口", "視窗"], ["全螢幕", "全螢幕"], ["側邊欄", "側邊欄"],
  ["計劃任務", "排程"], ["分組", "群組"], ["專案", "專案"], ["項目", "專案"],
  ["復原", "復原"], ["撤銷", "復原"], ["貼上", "貼上"], ["複製", "複製"],
  ["資訊", "資訊"], ["訊息", "訊息"], ["通知", "通知"],
  ["市集", "市集"], ["儀表板", "儀表板"], ["主控台", "儀表板"],
  ["錯誤", "錯誤"], ["除錯", "偵錯"], ["建置", "建置"], ["部署", "部署"],
  ["匯入", "匯入"], ["匯出", "匯出"], ["導出", "匯出"], ["導入", "匯入"]
];
TERMS.sort((a, b) => b[0].length - a[0].length);

function opencc(lines) {
  for (const s of lines) {
    if (/[\r\n]/.test(s)) throw new Error("a dictionary value contains a line break; the line-based converter cannot be used");
  }
  const tmpIn = path.join(os.tmpdir(), "ckit-s2t-in.txt");
  const tmpOut = path.join(os.tmpdir(), "ckit-s2t-out.txt");
  fs.writeFileSync(tmpIn, lines.join("\n"), "utf8");
  const py = process.platform === "win32" ? "python" : "python3";
  try {
    execFileSync(py, ["-m", "opencc", "-c", "s2tw", "-i", tmpIn, "-o", tmpOut], { stdio: "pipe" });
  } catch (e) {
    throw new Error("OpenCC failed - install it with `pip install opencc` (" + (e.stderr ? e.stderr.toString().trim() : e.message) + ")");
  }
  const out = fs.readFileSync(tmpOut, "utf8").replace(/\r/g, "").split("\n");
  fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut);
  if (out.length < lines.length) throw new Error("OpenCC returned " + out.length + " lines for " + lines.length);
  return out.slice(0, lines.length);
}

function main() {
  const dict = JSON.parse(fs.readFileSync(REF, "utf8"));
  const strings = [];
  const slots = [];
  const take = (obj, key) => { slots.push([obj, key]); strings.push(String(obj[key])); };

  for (const k of Object.keys(dict.entries)) take(dict.entries, k);
  for (const r of dict.rules) take(r, "out");
  for (const p of dict.prefixes) take(p, "to");
  for (const id of Object.keys(dict.featureText || {})) {
    for (const k of Object.keys(dict.featureText[id])) take(dict.featureText[id], k);
  }

  const converted = opencc(strings);
  slots.forEach(([obj, key], i) => {
    let v = converted[i];
    for (const [from, to] of TERMS) if (v.indexOf(from) >= 0) v = v.split(from).join(to);
    obj[key] = v;
  });

  dict.language = "zh-TW";
  dict.label = "繁體中文";
  dict.version = 1;   // a fresh locale starts its own version line
  dict.updated = new Date().toISOString().slice(0, 10);
  dict.note = dict.note + " Derived from zh-CN " + dict.version + " via OpenCC s2tw plus a Taiwan software term table.";

  const rendered = JSON.stringify(dict, null, 1) + "\n";
  if (DRY) {
    const before = JSON.parse(fs.readFileSync(REF, "utf8"));
    Object.keys(dict.entries).slice(0, 12).forEach((k) => console.log("  " + k + "\n    " + before.entries[k] + "  ->  " + dict.entries[k]));
    console.log("(dry run, nothing written)");
    return;
  }
  fs.writeFileSync(OUT, rendered, "utf8");
  console.log("wrote " + path.relative(ROOT, OUT) + ": " + Object.keys(dict.entries).length + " entries");
}

try { main(); } catch (e) { console.error(e.message); process.exit(1); }
