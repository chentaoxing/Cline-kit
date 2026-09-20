"use strict";
// Config + paths. Everything lives in %APPDATA%\cline-kit (or ~/.config/cline-kit).
const fs = require("fs");
const os = require("os");
const path = require("path");

const DIR_NAME = "cline-kit";
const LEGACY_DIR_NAME = "cline-zh";   // pre-rename layout, migrated once on first run

function baseDir() {
  const appdata = process.env.APPDATA;
  if (appdata) return appdata;
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "");
}

function configDir() { return path.join(baseDir(), DIR_NAME); }
function legacyDir() { return path.join(baseDir(), LEGACY_DIR_NAME); }

let migrated;
function migrateLegacy() {
  if (migrated !== undefined) return migrated;
  migrated = false;
  const dst = configDir();
  const src = legacyDir();
  try {
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.mkdirSync(dst, { recursive: true });
      for (const f of ["config.json"]) {
        if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
      }
      for (const d of ["cache", "logs"]) {
        copyDir(path.join(src, d), path.join(dst, d));
      }
      migrated = true;
    }
  } catch (e) { /* a failed migration just means a fresh config; never crash over it */ }
  return migrated;
}

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function configFile() { return path.join(configDir(), "config.json"); }
function cacheDir() { return path.join(configDir(), "cache"); }
function logDir() { return path.join(configDir(), "logs"); }

const DEFAULTS = {
  // Cline executable; null = auto-detect on each run
  clinePath: null,
  // 0 = pick a random free port at launch (avoids clashing with other debug servers)
  port: 0,
  // dictionary updates
  autoUpdate: true,
  updateUrl: "https://raw.githubusercontent.com/chentaoxing/Cline-kit/main/dictionaries/zh-CN.json",
  updateIntervalMs: 24 * 60 * 60 * 1000,
  dictionary: "zh-CN",
  // feature id -> boolean; absent keys fall back to each feature's defaultOn
  features: {},
  // extra paths sidebar-groups must not list as projects (containers, scratch folders)
  featureHide: [],
  // override Cline's workspace-registry localStorage key; empty = detect cline.code.workspace-selection.vN
  storageKey: "",
  // installer state
  shortcutPath: null,
  autostart: false,
  lastUpdateCheck: 0,
  remoteVersion: null
};

function read() {
  migrateLegacy();
  let data = {};
  try { data = JSON.parse(fs.readFileSync(configFile(), "utf8")); } catch (e) { data = {}; }
  return Object.assign({}, DEFAULTS, data);
}

function write(cfg) {
  migrateLegacy();
  fs.mkdirSync(configDir(), { recursive: true });
  const tmp = configFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
  fs.renameSync(tmp, configFile());
  return cfg;
}

function ensureDirs() {
  migrateLegacy();
  fs.mkdirSync(configDir(), { recursive: true });
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.mkdirSync(logDir(), { recursive: true });
}

function localDictFile(name) { return path.join(configDir(), name + ".local.json"); }
function cachedDictFile(name) { return path.join(cacheDir(), name + ".json"); }

module.exports = {
  configDir, configFile, cacheDir, logDir, read, write, ensureDirs, DEFAULTS,
  localDictFile, cachedDictFile, migrateLegacy, legacyDir, DIR_NAME
};
