#!/usr/bin/env node
"use strict";
// Cline-kit - desktop enhancement kit for the Cline desktop app.
// Flagship feature: keep every registered project visible in the sidebar.
// Optional: UI locale packs (zh-CN reference; zh-TW / ja / ko / vi ship the same key set).
const cfg = require("./config");

function guard() {
  if (typeof WebSocket !== "function") {
    console.error("Cline-kit needs Node.js 20.10+ (global WebSocket). Current: " + process.version);
    console.error("Install a newer Node from https://nodejs.org and retry.");
    process.exit(1);
  }
}

const HELP = `Cline-kit (ckit) - enhancement kit for the Cline desktop app (Windows)

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
  locales          List the UI languages that ship with the kit, and switch between them
  update           Fetch the latest locale dictionary from GitHub (the injector also checks
                   once a day; ckit config --auto-update=off stops all outbound requests)
  audit            Walk the UI and list strings still without a translation (--raw to not redact)
  dict             Dictionary stats and the local override file path
  config           View or set: --cline-path=... --port=... --auto-update=on|off
                   --dictionary=<locale> --hide=<path> / --unhide=<path> --page-origin=<host>
                   --context-limit=<tokens> --native-meter=hide|show

Main feature
  sidebar-groups   Keeps every registered project visible in the sidebar's "Projects" group.
                   Cline natively lists only folders that already have sessions, so empty
                   projects disappear entirely.

  context-meter    Context-window fill (bar + %) and cache hit rate (🎯 %) in the composer bar,
                   right after the reasoning-effort control. Reads Cline's own token accounting,
                   so it cannot disagree with the app. Several free models report no contextWindow
                   (measured: kimi-k3, muse-spark, deepseek); those show the used count and the hit
                   rate with "no limit" instead of a made-up percentage - supply one with
                   'ckit config --context-limit=262144'. Cline's own 22px ring is hidden while this
                   is on ('ckit config --native-meter=show' keeps both).

Optional feature
  locale packs     dictionaries/<locale>.json - whole-string replacement only, so provider names,
                   model names and code cannot be mangled. Bundled: zh-CN (reference, 523 entries),
                   zh-TW, ja, ko, vi, plus 'none' to leave Cline's own text alone.
                   Pick it INSIDE Cline: Settings -> Interface language (that row is added by this
                   kit, and clicking it applies within ~4 s without a restart). Or from here:
                   'ckit locales' lists the choices, 'ckit locales ja' switches, and 'ckit update'
                   then follows whichever locale is selected.
                   Only zh-CN is proofread against the running app.

Examples:
  ckit start
  ckit install
  ckit features
  ckit locales
  ckit locales ja
  ckit locales none
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

// Tri-state on purpose: `--auto-update=FALSE` should not quietly turn the updater on, and neither
// should a typo. Returns null when the value is not a yes/no at all.
function parseBool(v) {
  const s = String(v).trim().toLowerCase();
  if (["on", "true", "1", "yes", "y"].includes(s)) return true;
  if (["off", "false", "0", "no", "n"].includes(s)) return false;
  return null;
}

// CJK and accented names are not one cell per code unit, and `padEnd` does not know that.
function cellWidth(s) {
  let n = 0;
  for (const ch of String(s)) n += /[㐀-䶿一-鿿぀-가-힯豈-﫿]/.test(ch) ? 2 : 1;
  return n;
}
function padCell(s, width) {
  return String(s) + " ".repeat(Math.max(1, width - cellWidth(s)));
}

// Language choice is a per-install decision, so say where to change it once per
// setup path instead of hiding it in the README. Returns nothing; prints itself.
function languageTip(conf, showOnce) {
  if (showOnce) {
    if (conf.hintLanguageShown) return;
    conf.hintLanguageShown = true;
    cfg.write(conf);
  }
  const dict = require("./dict");
  let codes = [];
  try { codes = dict.choices().map((c) => c.code); } catch (e) { codes = []; }
  const current = conf.dictionary || "zh-CN";
  console.log(`Interface language: ${current}  (choices: ${codes.join(", ") || current})`);
  console.log("  pick it inside Cline: Settings -> Interface language");
  console.log("  or here: ckit locales  /  ckit locales ja");
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
    // Reaping processes has to be said out loud: a killed sidecar can be a session the user thought
    // they still had, even though it is exactly what frees Cline's hub for the new window.
    if (out.reapedSidecars && out.reapedSidecars.length) {
      console.log(`Reaped ${out.reapedSidecars.length} orphaned code-sidecar process(es) ` +
        `(${out.reapedSidecars.join(", ")}) that were still holding Cline's hub port.`);
    }
    if (out.debugPortAlive) languageTip(conf, true);
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
    }, conf.pageOrigin);
    const ok = r.filter((x) => !x.error);
    const bad = r.filter((x) => x.error);
    console.log("Injected once into " + ok.length + " of " + r.length + " page(s)" +
      (bad.length ? ": " + bad.map((x) => "FAIL " + x.error).join(", ") : ""));
    if (!r.length) console.log("No Cline page answered on port " + port +
      ". Check the port, or set the webview host with: ckit config --page-origin=<host>");
    if (r.length) console.log("The resident injector is not running, so a reload (Ctrl+R) drops the overlay.");
    if (!ok.length) process.exitCode = 1;
    return;
  }

  if (cmd === "install") {
    const r = await require("./install-win").install(conf);
    const rep = r.report || {};
    console.log("Launch paths scanned: " + (rep.scanned || 0));
    if (rep.hooked && rep.hooked.length) {
      console.log("Now routed through the kit (" + rep.hooked.length + "):");
      rep.hooked.forEach((s) => console.log("  " + s));
    }
    if (rep.already && rep.already.length) {
      console.log("Already going through the kit (" + rep.already.length + "):");
      rep.already.forEach((s) => console.log("  " + s));
    }
    if (rep.created) console.log("No Cline shortcut existed, so one was created: " + rep.created);
    if (rep.failed && rep.failed.length) {
      console.log("COULD NOT be changed (" + rep.failed.length + ") - Cline opened from these will look unmodified:");
      rep.failed.forEach((f) => console.log("  " + f.lnk + "  ->  " + f.why));
      process.exitCode = 1;
    }
    console.log("Launcher: " + r.launcher);
    console.log("Open Cline from those shortcuts from now on; `ckit uninstall` restores them.");
    languageTip(cfg.read(), false);
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
    if (r.updated) { console.log(`Dictionary updated: v${r.from} -> v${r.to}`); return; }
    // "Already up to date" is only true if something was fetched. Saying it after a skipped check
    // is how a broken update url survives for years.
    if (r.reason === "already current") { console.log(`Already up to date (remote is v${r.to})`); return; }
    const hints = {
      "autoUpdate disabled": "re-enable with: ckit config --auto-update=on  (or run ckit update --force)",
      "translation is off": "pick a language first: ckit locales zh-CN, or Settings -> Interface language in Cline",
      "not due yet": "the last check is under a day old; use ckit update --force to check now",
      "no update url configured": "set one with: ckit config --update-url=<url>"
    };
    console.log("Not checked" + (r.reason ? ": " + r.reason : "") +
      (hints[r.reason] ? "\n  " + hints[r.reason] : ""));
    return;
  }

  if (cmd === "audit") {
    if (!conf.port) { console.error("Cline was not started through cline-kit; run ckit start first"); process.exit(1); }
    const r = await require("./audit").run(conf.port, { raw: !!flags.raw, origin: conf.pageOrigin });
    const limit = Number(flags.limit) || 80;
    console.log(`${r.total} strings still without a translation, details: ${r.file}`);
    if (!flags.raw) {
      console.log("E-mails, paths, URLs and identifiers were redacted (" + r.redacted +
        " entries). Use --raw only on your own machine, and skim before publishing.");
    }
    r.items.slice(0, limit).forEach(([s, where]) => console.log("  " + s + "   [" + where + "]"));
    if (r.total > limit) console.log("  ...");
    if (r.byDesign && r.byDesign.length) {
      console.log("\n" + r.byDesign.length + " more are in English on purpose (tool identifiers, product");
      console.log("names, your own session titles and paths) - listed so nothing is hidden:");
      r.byDesign.slice(0, limit).forEach(([s, where]) => console.log("  " + s + "   [" + where + "]"));
    }
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

  if (cmd === "locales" || cmd === "locale") {
    const dict = require("./dict");
    const conf2 = cfg.read();
    const choices = dict.choices();
    const target = argv.slice(1).filter((a) => !a.startsWith("--"))[0];
    if (target) {
      if (!dict.isKnown(target)) {
        console.error(`Unknown locale "${target}". Bundled: ${choices.map((c) => c.code).join(", ")}`);
        process.exitCode = 1;
        return;
      }
      conf2.dictionary = target;
      cfg.write(conf2);
      console.log(`Language -> ${target} (the injector applies it within ~4 s, no restart needed)`);
      console.log("Cline must be running through cline-kit for the open window to change; otherwise it");
      console.log("applies the next time you start it with `ckit start`.");
      console.log("The same choice is available inside Cline: Settings -> Interface language.");
      return;
    }
    console.log("Bundled UI languages (switch with: ckit locales <code>):\n");
    for (const c of choices) {
      const active = (conf2.dictionary || "zh-CN") === c.code;
      const tail = c.off ? "  (original text, nothing replaced)"
        : `  v${c.version}`;
      console.log(`  ${active ? "*  " : "   "}${c.code.padEnd(7)} ${padCell(c.native, 12)} ${String(c.strings).padStart(4)} strings${tail}`);
    }
    console.log("\nOnly zh-CN is proofread against the running app; the others are complete but not");
    console.log("reviewed by native speakers - see dictionaries/ if you want to fix a term.");
    console.log("You can also pick this inside Cline: Settings -> Interface language.");
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
    if (flags["auto-update"] !== undefined) {
      // a bare --auto-update reads as "turn it on"
      const on = flags["auto-update"] === true ? true : parseBool(flags["auto-update"]);
      if (on === null) {
        console.error(`--auto-update wants on or off, got "${flags["auto-update"]}"`);
        process.exitCode = 1;
        return;
      }
      conf.autoUpdate = on; changed = true;
    }
    if (flags["update-url"]) { conf.updateUrl = flags["update-url"]; changed = true; }
    if (flags["storage-key"] !== undefined) { conf.storageKey = String(flags["storage-key"]); changed = true; }
    if (flags["page-origin"] !== undefined) { conf.pageOrigin = String(flags["page-origin"]); changed = true; }
    if (flags.dictionary) {
      const want = flags.dictionary;
      const dict = require("./dict");
      if (!dict.isKnown(want)) {
        console.error(`Unknown locale "${want}". Choices: ${dict.choices().map((c) => c.code).join(", ")}`);
        process.exitCode = 1;
        return;
      }
      conf.dictionary = want; changed = true;
    }
    if (flags["context-limit"] !== undefined) {
      const n = Number(flags["context-limit"]);
      if (!Number.isFinite(n) || n < 0) {
        console.error(`--context-limit wants a token count (e.g. 262144), got "${flags["context-limit"]}"`);
        process.exitCode = 1;
        return;
      }
      conf.contextLimit = Math.floor(n); changed = true;
    }
    if (flags["native-meter"] !== undefined) {
      const v = String(flags["native-meter"]).toLowerCase();
      if (v !== "hide" && v !== "show") {
        console.error(`--native-meter wants hide or show, got "${flags["native-meter"]}"`);
        process.exitCode = 1;
        return;
      }
      conf.nativeMeter = v; changed = true;
    }
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

main().catch((e) => { console.error("Cline-kit: " + e.message); process.exit(1); });
