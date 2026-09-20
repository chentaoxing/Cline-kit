"use strict";
// Feature registry. Each feature is a self-contained browser script in this folder.
// Versions are read from the scripts themselves so the registry cannot drift.
const fs = require("fs");
const path = require("path");

const DEFS = [
  {
    id: "sidebar-groups",
    // shared logic first, then the browser script that consumes window.__ckitSidebarLogic
    parts: ["sidebar-groups.logic.js", "sidebar-groups.js"],
    title: "Keep every registered project in the sidebar / 侧边栏全项目常驻",
    defaultOn: true,
    // config handed to the browser script; keep it JSON-serialisable
    build(ctx) {
      return {
        installDir: ctx.installDir || "",
        hide: ctx.cfg.featureHide || [],
        maxRows: 80,
        groupMode: true,
        // leave empty to follow Cline's own cline.code.workspace-selection.vN key
        storageKey: ctx.cfg.storageKey || "",
        text: (ctx.featureText || {})[this.id] || {}
      };
    }
  }
];

function scriptVersion(src) {
  const m = src.match(/var\s+VER\s*=\s*(\d+)/) || src.match(/const\s+VER\s*=\s*(\d+)/);
  return m ? Number(m[1]) : 1;
}

function filesOf(def) { return def.parts || [def.file]; }

function readSource(def) {
  const list = filesOf(def);
  const src = list.map((f) => fs.readFileSync(path.join(__dirname, f), "utf8")).join("\n");
  const main = fs.readFileSync(path.join(__dirname, list[list.length - 1]), "utf8");
  return { src, version: scriptVersion(main), path: path.join(__dirname, list[0]) };
}

function list() {
  return DEFS.map((d) => {
    let version = 0;
    try { version = readSource(d).version; } catch (e) { version = -1; }
    return { id: d.id, title: d.title, version, defaultOn: d.defaultOn };
  });
}

function enabledSet(cfgObj) {
  const out = {};
  for (const d of DEFS) out[d.id] = d.defaultOn;
  const fromCfg = cfgObj.features || {};
  for (const k of Object.keys(fromCfg)) {
    if (k in out) out[k] = !!fromCfg[k];
  }
  return out;
}

function resolve(cfgObj, dictObj) {
  const on = enabledSet(cfgObj);
  const ctx = {
    cfg: cfgObj,
    installDir: cfgObj.clinePath ? path.dirname(cfgObj.clinePath) : "",
    featureText: (dictObj && dictObj.featureText) || {}
  };
  const picked = [];
  for (const d of DEFS) {
    if (!on[d.id]) continue;
    let entry;
    try {
      entry = readSource(d);
    } catch (e) {
      entry = null;
    }
    if (!entry) continue;
    picked.push({ id: d.id, version: entry.version, source: entry.src, config: d.build(ctx) });
  }
  return { picked, enabled: on };
}

module.exports = { list, resolve, enabledSet, DEFS };
