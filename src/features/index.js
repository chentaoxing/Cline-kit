"use strict";
// Feature registry. Each feature is a self-contained browser script in this folder.
// Versions are read from the scripts themselves so the registry cannot drift.
const fs = require("fs");
const path = require("path");

const DEFS = [
  {
    id: "sidebar-groups",
    file: "sidebar-groups.js",
    title: "侧边栏全项目常驻 / always-show registered workspaces",
    defaultOn: true,
    // config handed to the browser script; keep it JSON-serialisable
    build(ctx) {
      return {
        installDir: ctx.installDir || "",
        hide: ctx.cfg.featureHide || [],
        maxRows: 80,
        groupMode: true,
        text: {}
      };
    }
  }
];

function scriptVersion(src) {
  const m = src.match(/var\s+VER\s*=\s*(\d+)/) || src.match(/const\s+VER\s*=\s*(\d+)/);
  return m ? Number(m[1]) : 1;
}

function readSource(def) {
  const p = path.join(__dirname, def.file);
  const src = fs.readFileSync(p, "utf8");
  return { src, version: scriptVersion(src), path: p };
}

function list() {
  return DEFS.map((d) => {
    const { version } = readSource(d);
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

function resolve(cfgObj) {
  const on = enabledSet(cfgObj);
  const ctx = {
    cfg: cfgObj,
    installDir: cfgObj.clinePath ? path.dirname(cfgObj.clinePath) : ""
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
