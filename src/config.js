"use strict";
// Config + paths. Everything lives in %APPDATA%\cline-zh (or ~/.config/cline-zh).
const fs = require("fs");
const os = require("os");
const path = require("path");

function configDir() {
  const base = process.env.APPDATA ||
    (process.platform === "darwin"
      ? path.join(os.homedir(), "Library", "Application Support")
      : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), ""));
  return path.join(base, "cline-zh");
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
  updateUrl: "https://raw.githubusercontent.com/CHANGE_ME/cline-zh-overlay/main/dictionaries/zh-CN.json",
  updateIntervalMs: 24 * 60 * 60 * 1000,
  dictionary: "zh-CN",
  // installer state
  shortcutPath: null,
  autostart: false,
  lastUpdateCheck: 0,
  remoteVersion: null
};

function read() {
  let data = {};
  try { data = JSON.parse(fs.readFileSync(configFile(), "utf8")); } catch (e) { data = {}; }
  return Object.assign({}, DEFAULTS, data);
}

function write(cfg) {
  fs.mkdirSync(configDir(), { recursive: true });
  const tmp = configFile() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
  fs.renameSync(tmp, configFile());
  return cfg;
}

function ensureDirs() {
  fs.mkdirSync(configDir(), { recursive: true });
  fs.mkdirSync(cacheDir(), { recursive: true });
  fs.mkdirSync(logDir(), { recursive: true });
}

function localDictFile(name) { return path.join(configDir(), name + ".local.json"); }
function cachedDictFile(name) { return path.join(cacheDir(), name + ".json"); }

module.exports = { configDir, configFile, cacheDir, logDir, read, write, ensureDirs, DEFAULTS, localDictFile, cachedDictFile };
