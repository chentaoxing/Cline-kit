#!/usr/bin/env node
"use strict";
// cline-kit - desktop enhancement kit for the Cline desktop app.
// Flagship feature: keep every registered project visible in the sidebar.
// Optional: UI locale packs (zh-CN today; zh-TW / ja / ko / vi follow the same data format).
const cfg = require("./config");

function guard() {
  if (typeof WebSocket !== "function") {
    console.error("cline-kit needs Node.js 20.10+ (global WebSocket). Current: " + process.version);
    console.error("Install a newer Node from https://nodejs.org and retry.");
    process.exit(1);
  }
}

const HELP = `cline-kit (ckit) - Cline 桌面版增强助手 (Windows)

用法: ckit <命令> [选项]

  start            以增强层启动 Cline（--restart 先退出正在运行的实例）
  stop             结束后台注入器（Cline 本身不受影响）
  status           显示 Cline 路径、调试端口、注入器与已装载内容版本
  install          把开始菜单/桌面的 Cline 快捷方式改为增强层启动（可还原）
  uninstall        还原快捷方式
  features         列出功能插件及开关状态
  feature          开关插件：ckit feature enable|disable <id>
  update           从 GitHub 拉取最新语言词典（离线时自动跳过）
  audit            走查界面，列出仍未翻译的字符串（补词典 / 报 issue 用）
  dict             词典统计与本地覆盖文件路径
  config           查看或设置：--cline-path=... --port=... --auto-update=on|off

主要功能
  sidebar-groups   让侧边栏「项目分组」常驻显示所有已登记项目。Cline 原生只列出
                   已经有会话的文件夹，空项目全部隐藏。

可选功能
  locale zh-CN     界面简体中文（词典 476 条 + 规则；zh-TW / ja / ko / vi 同格式待补）

示例:
  ckit start
  ckit install
  ckit features
  ckit feature disable sidebar-groups
  ckit config --cline-path "D:\\Programs\\Cline\\cline-app.exe"
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
      console.log("Cline 已在运行但没有调试端口，增强层无法挂载。");
      console.log("请用 `ckit start --restart` 重启 Cline，或先手动退出 Cline 再运行 ckit start。");
      process.exitCode = 1;
      return;
    }
    console.log(out.debugPortAlive
      ? `Cline 已启动（端口 ${out.port}，来源 ${out.source}），增强层已装载。`
      : `警告：Cline 已启动但调试端口 ${out.port} 未响应，增强层可能未装载。`);
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
    console.log("以后从这些快捷方式打开 Cline 即带增强层；`ckit uninstall` 可还原。");
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
    if (!conf.port) { console.error("Cline 未通过 cline-kit 启动，先运行 ckit start"); process.exit(1); }
    const r = await require("./audit").run(conf.port);
    console.log(`未翻译字符串 ${r.total} 条，明细：${r.file}`);
    r.items.slice(0, Number(flags.limit) || 80).forEach(([s, where]) => console.log("  " + s + "   [" + where + "]"));
    if (r.total > (Number(flags.limit) || 80)) console.log("  ...");
    return;
  }

  if (cmd === "features" || cmd === "feature") {
    const features = require("./features");
    const conf2 = cfg.read();
    const sub = flags._ || null;
    if (cmd === "features") {
      const enabled = features.enabledSet(conf2);
      for (const f of features.list()) {
        console.log(`${enabled[f.id] ? "on " : "off"}  ${f.id}  (v${f.version})  ${f.title}`);
      }
      console.log("\n切换：ckit feature enable <id> | ckit feature disable <id>");
      return;
    }
    const [action, id] = argv.slice(1).filter((a) => !a.startsWith("--"));
    const known = features.list().map((f) => f.id);
    if (!known.includes(id)) {
      console.error(`未知 feature: ${id || "(空)"}；可用：${known.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    if (action !== "enable" && action !== "disable") {
      console.error("用法：ckit feature <enable|disable> <id>");
      process.exitCode = 1;
      return;
    }
    conf2.features = Object.assign({}, conf2.features || {}, { [id]: action === "enable" });
    cfg.write(conf2);
    console.log(`${id} -> ${action === "enable" ? "已启用" : "已禁用"}（注入器约 4 秒内生效）`);
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

main().catch((e) => { console.error("cline-kit: " + e.message); process.exit(1); });
