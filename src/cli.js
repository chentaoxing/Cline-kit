#!/usr/bin/env node
"use strict";
// cline-zh - Simplified Chinese UI overlay for the Cline desktop app.
const cfg = require("./config");

function guard() {
  if (typeof WebSocket !== "function") {
    console.error("cline-zh needs Node.js 20.10+ (global WebSocket). Current: " + process.version);
    console.error("Install a newer Node from https://nodejs.org and retry.");
    process.exit(1);
  }
}

const HELP = `cline-zh - Cline 桌面版中文界面覆盖层 (Windows)

用法: cline-zh <命令> [选项]

  start            启动 Cline 并挂上中文界面（推荐日常入口）
  stop             结束后台注入器（Cline 本身不受影响）
  status           显示探测到的 Cline 路径、调试端口、注入器与词典状态
  install          把开始菜单/桌面的 Cline 快捷方式改为中文启动（可还原）
  uninstall        还原快捷方式
  update           从 GitHub 拉取最新词典（离线时自动跳过）
  audit            走查界面，列出仍未翻译的字符串（用于补词典/报 issue）
  dict             显示当前词典统计
  config           查看或修改配置：--cline-path=... --port=... --auto-update=on|off

示例:
  cline-zh start
  cline-zh install
  cline-zh update --force
  cline-zh config --cline-path "D:\\Programs\\Cline\\cline-app.exe"
`;

function parseFlags(argv) {
  const flags = {};
  const rest = [];
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) flags[m[1]] = m[2] === undefined ? true : m[2];
    else rest.push(a);
  }
  return { flags, rest };
}

async function main() {
  guard();
  const argv = process.argv.slice(2);
  const cmd = argv[0] || "help";
  const { flags } = parseFlags(argv.slice(1));
  const conf = cfg.read();

  if (cmd === "start") {
    const out = await require("./launcher").start({ restart: !!flags.restart });
    if (out.needsRestart) {
      console.log("Cline 已在运行，但没有调试端口，无法注入。");
      console.log("请用 `cline-zh start --restart` 重启 Cline，或先手动退出 Cline 再运行 cline-zh start。");
      process.exitCode = 1;
      return;
    }
    console.log(out.debugPortAlive
      ? `Cline 已启动（端口 ${out.port}，来源 ${out.source}），中文界面注入中。`
      : `警告：Cline 已启动但调试端口 ${out.port} 未响应，界面可能仍是英文。`);
    if (!out.debugPortAlive) process.exitCode = 1;
    return;
  }

  if (cmd === "stop") {
    const r = require("./launcher").stop();
    console.log(r.stopped ? "注入器已结束 (pid " + r.pids + ")" : "没有正在运行的注入器");
    return;
  }

  if (cmd === "status") {
    const launcher = require("./launcher");
    const payload = require("./payload");
    const detect = require("./detect");
    const found = detect.detect(conf);
    const alive = conf.port ? await launcher.isPortAlive(conf.port) : false;
    console.log(JSON.stringify({
      clinePath: found.path, clinePathSource: found.source,
      debugPort: conf.port || null, debugPortAlive: alive,
      injector: launcher.injectorRunning() || null,
      dictionary: payload.info(conf),
      shortcut: conf.shortcutPath || null,
      autoUpdate: conf.autoUpdate, updateUrl: conf.updateUrl
    }, null, 2));
    return;
  }

  if (cmd === "install") {
    const r = await require("./install-win").install(conf);
    console.log("已改为中文启动的快捷方式：");
    r.shortcuts.forEach((s) => console.log("  " + s));
    console.log("启动器：" + r.launcher);
    console.log("以后从这些快捷方式打开 Cline 即为中文；`cline-zh uninstall` 可还原。");
    return;
  }

  if (cmd === "uninstall") {
    require("./launcher").stop();
    const r = await require("./install-win").uninstall(cfg.read());
    console.log(r.restored.length ? "已还原：\n  " + r.restored.join("\n  ") : "没有找到需要还原的快捷方式");
    return;
  }

  if (cmd === "update") {
    const r = await require("./dict").update(cfg.read(), { force: !!flags.force });
    if (r.error) { console.error("更新失败（继续使用本地词典）：" + r.error); process.exitCode = 1; return; }
    console.log(r.updated ? `词典已更新：v${r.from} -> v${r.to}` : "无需更新" + (r.reason ? "（" + r.reason + "）" : ""));
    return;
  }

  if (cmd === "audit") {
    if (!conf.port) { console.error("Cline 未通过 cline-zh 启动，先运行 cline-zh start"); process.exit(1); }
    const r = await require("./audit").run(conf.port);
    console.log(`未翻译字符串 ${r.total} 条，明细：${r.file}`);
    r.items.slice(0, Number(flags.limit) || 80).forEach(([s, where]) => console.log("  " + s + "   [" + where + "]"));
    if (r.total > (Number(flags.limit) || 80)) console.log("  ...");
    return;
  }

  if (cmd === "dict") {
    console.log(JSON.stringify(require("./payload").info(conf), null, 2));
    console.log("本地覆盖文件（优先级最高）：" + cfg.localDictFile(conf.dictionary));
    return;
  }

  if (cmd === "config") {
    let changed = false;
    if (flags["cline-path"]) { conf.clinePath = flags["cline-path"]; changed = true; }
    if (flags.port) { conf.port = Number(flags.port); changed = true; }
    if (flags["auto-update"]) { conf.autoUpdate = String(flags["auto-update"]) !== "off"; changed = true; }
    if (flags["update-url"]) { conf.updateUrl = flags["update-url"]; changed = true; }
    if (changed) { cfg.write(conf); console.log("已写入 " + cfg.configFile()); }
    console.log(JSON.stringify(cfg.read(), null, 2));
    return;
  }

  console.log(HELP);
}

main().catch((e) => { console.error("cline-zh: " + e.message); process.exit(1); });
