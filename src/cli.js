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

const HELP = `cline-kit (ckit) - enhancement kit for the Cline desktop app (Windows)

Usage: ckit <command> [options]

  start            Launch Cline with the overlay loaded (--restart quits a running instance first)
  stop             Stop the background injector (Cline itself is untouched)
  status           Show the Cline path, debug port, injector and loaded payload version
  doctor           Check the live window: does each feature exist in the DOM right now?
  attach           Inject once into a Cline that is already running with a debug port
  install          Point the Start Menu / Desktop Cline shortcuts at the enhanced launcher
  uninstall        Restore the original shortcuts
  features         List feature plugins and whether each is on
  feature          Toggle a plugin: ckit feature enable|disable <id>
  update           Fetch the latest locale dictionary from GitHub (skipped when offline)
  audit            Walk the UI and list strings still without a translation
  dict             Dictionary stats and the local override file path
  config           View or set: --cline-path=... --port=... --auto-update=on|off
                   --hide=<path> / --unhide=<path> keep folders out of the sidebar

Main feature
  sidebar-groups   Keeps every registered project visible in the sidebar's "Projects" group.
                   Cline natively lists only folders that already have sessions, so empty
                   projects disappear entirely.

Optional feature
  locale zh-CN     Simplified Chinese UI (476 entries + rules; zh-TW / ja / ko / vi use the
                   same file format and are not written yet)

Examples:
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
      console.log("Cline is already running without a debug port, so the overlay cannot attach.");
      console.log("Run `ckit start --restart`, or quit Cline first and run ckit start again.");
      process.exitCode = 1;
      return;
    }
    console.log(out.debugPortAlive
      ? `Cline is up (port ${out.port}, path from ${out.source}) and the overlay is loaded.`
      : `Warning: Cline started but port ${out.port} is not answering; the overlay may not be loaded.`);
    if (!out.debugPortAlive) process.exitCode = 1;
    return;
  }

  if (cmd === "stop") {
    const r = require("./launcher").stop();
    console.log(r.stopped ? "Injector stopped (pid " + r.pids + ")" : "No injector was running");
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

  if (cmd === "doctor") {
    const doctor = require("./doctor");
    const r = await doctor.run();
    console.log(doctor.format(r));
    process.exitCode = r.ok ? 0 : 1;
    return;
  }

  if (cmd === "attach") {
    const port = Number(flags.port) || conf.port;
    if (!port) { console.error("No debug port to attach to. Pass --port=NNNNN"); process.exit(1); }
    const src = require("./payload").build(conf);
    const r = await require("./cdp").eachPage(port, async (api) => {
      const res = await api.rpc("Runtime.evaluate", { expression: src });
      if (res && res.exceptionDetails) throw new Error(res.exceptionDetails.text || "evaluate failed");
      return "ok";
    });
    console.log("Injected once into " + r.length + " page(s): " +
      r.map((x) => x.error ? "FAIL " + x.error : x.result).join(", "));
    console.log("The resident injector is not running, so a reload (Ctrl+R) drops the overlay.");
    return;
  }

  if (cmd === "install") {
    const r = await require("./install-win").install(conf);
    console.log("Shortcuts now launch Cline with the overlay:");
    r.shortcuts.forEach((s) => console.log("  " + s));
    console.log("Launcher: " + r.launcher);
    console.log("Open Cline from those shortcuts from now on; `ckit uninstall` restores them.");
    return;
  }

  if (cmd === "uninstall") {
    require("./launcher").stop();
    const r = await require("./install-win").uninstall(cfg.read());
    console.log(r.restored.length ? "Restored:\n  " + r.restored.join("\n  ") : "No shortcuts needed restoring");
    return;
  }

  if (cmd === "update") {
    const r = await require("./dict").update(cfg.read(), { force: !!flags.force });
    if (r.error) { console.error("Update failed (keeping the local dictionary): " + r.error); process.exitCode = 1; return; }
    console.log(r.updated ? `Dictionary updated: v${r.from} -> v${r.to}` : "Already up to date" + (r.reason ? " (" + r.reason + ")" : ""));
    return;
  }

  if (cmd === "audit") {
    if (!conf.port) { console.error("Cline was not started through cline-kit; run ckit start first"); process.exit(1); }
    const r = await require("./audit").run(conf.port);
    console.log(`${r.total} untranslated strings, details: ${r.file}`);
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
      console.log("\nToggle with: ckit feature enable <id> | ckit feature disable <id>");
      return;
    }
    const [action, id] = argv.slice(1).filter((a) => !a.startsWith("--"));
    const known = features.list().map((f) => f.id);
    if (!known.includes(id)) {
      console.error(`Unknown feature: ${id || "(none)"}; available: ${known.join(", ")}`);
      process.exitCode = 1;
      return;
    }
    if (action !== "enable" && action !== "disable") {
      console.error("Usage: ckit feature <enable|disable> <id>");
      process.exitCode = 1;
      return;
    }
    conf2.features = Object.assign({}, conf2.features || {}, { [id]: action === "enable" });
    cfg.write(conf2);
    console.log(`${id} -> ${action === "enable" ? "enabled" : "disabled"} (the injector picks it up within ~4s)`);
    return;
  }

  if (cmd === "dict") {
    console.log(JSON.stringify(require("./payload").info(conf), null, 2));
    console.log("Local override file (highest priority): " + cfg.localDictFile(conf.dictionary));
    return;
  }

  if (cmd === "config") {
    let changed = false;
    if (flags["cline-path"]) { conf.clinePath = flags["cline-path"]; changed = true; }
    if (flags.port) { conf.port = Number(flags.port); changed = true; }
    if (flags["auto-update"]) { conf.autoUpdate = String(flags["auto-update"]) !== "off"; changed = true; }
    if (flags["update-url"]) { conf.updateUrl = flags["update-url"]; changed = true; }
    if (flags["storage-key"] !== undefined) { conf.storageKey = String(flags["storage-key"]); changed = true; }
    if (flags["hide"]) {
      const kept = (conf.featureHide || []).slice();
      if (kept.indexOf(flags["hide"]) < 0) kept.push(flags["hide"]);
      conf.featureHide = kept;
      changed = true;
    }
    if (flags["unhide"]) {
      conf.featureHide = (conf.featureHide || []).filter((p) => p !== flags["unhide"]);
      changed = true;
    }
    if (changed) { cfg.write(conf); console.log("Wrote " + cfg.configFile()); }
    console.log(JSON.stringify(cfg.read(), null, 2));
    return;
  }

  console.log(HELP);
}

main().catch((e) => { console.error("cline-kit: " + e.message); process.exit(1); });
