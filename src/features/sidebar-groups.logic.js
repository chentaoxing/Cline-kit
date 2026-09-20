// Pure helpers for the sidebar-groups feature: no DOM, no browser globals.
// Loaded twice from the same file - CommonJS for scripts/selftest.js, and prepended to the
// browser script by src/features/index.js, where it lands on window.__ckitSidebarLogic.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else if (root) root.__ckitSidebarLogic = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var SEP = /[\\/]/;

  // Collapse every run of whitespace (space, tab, newline) to one space. React renders the same
  // label with newlines between children, so without this nothing ever matches.
  function norm(s) { return (s == null ? "" : String(s)).replace(/\s+/g, " ").trim(); }

  function strip(p) { return String(p == null ? "" : p).replace(/[\\/]+$/, ""); }

  function lastSep(s) {
    var i = -1;
    for (var k = 0; k < s.length; k++) if (SEP.test(s[k])) i = k;
    return i;
  }

  function base(p) {
    var s = strip(p);
    var i = lastSep(s);
    return i >= 0 ? s.slice(i + 1) : s;
  }

  function dirname(p) {
    var s = strip(p);
    var i = lastSep(s);
    return i >= 0 ? s.slice(0, i) : "";
  }

  // The folder holding this project, used to tell two same-named projects apart.
  function parent(p) { return base(dirname(p)); }

  function samePath(a, b) { return strip(a).toLowerCase() === strip(b).toLowerCase(); }

  // "p is at or under root". Case-insensitive for drive-letter paths, and separator-aware so
  // "D:\Cl" is not treated as a parent of "D:\Cline".
  function isUnder(p, rootPath) {
    var a = strip(p), b = strip(rootPath);
    if (!a || !b) return false;
    if (/^[A-Za-z]:[\\/]/.test(a) || /^[A-Za-z]:[\\/]/.test(b)) { a = a.toLowerCase(); b = b.toLowerCase(); }
    if (a === b) return true;
    return a.indexOf(b + "\\") === 0 || a.indexOf(b + "/") === 0;
  }

  // Cline stores its workspace registry under a versioned key; follow the highest one present so a
  // v3 bump does not silently read an empty list.
  var REGISTRY_KEY_RE = /^cline\.code\.workspace-selection\.v(\d+)$/;
  function registryKey(keys) {
    var best = null, bestVer = -1;
    for (var i = 0; i < (keys || []).length; i++) {
      var m = REGISTRY_KEY_RE.exec(keys[i]);
      if (m) { var v = Number(m[1]); if (v > bestVer) { bestVer = v; best = keys[i]; } }
    }
    return best;
  }

  function parseRegistry(raw) {
    try {
      var obj = JSON.parse(raw || "{}");
      var env = ((obj.environments || {}).local) || {};
      var ws = Array.isArray(env.workspaces)
        ? env.workspaces.filter(function (x) { return typeof x === "string" && x.trim(); })
        : [];
      return { workspaces: ws, last: typeof env.lastWorkspace === "string" ? env.lastWorkspace : "" };
    } catch (e) { return { workspaces: [], last: "" }; }
  }

  // A registered path is a container rather than a project when another registered path sits
  // inside it, when it is the app's own install directory, or when the user hid it.
  function isContainer(p, all, opts) {
    opts = opts || {};
    var clean = strip(p);
    for (var i = 0; i < (all || []).length; i++) {
      if (!samePath(all[i], clean) && isUnder(all[i], clean)) return true;
    }
    var install = strip(opts.installDir || "");
    if (install && isUnder(clean, install)) return true;
    var hide = opts.hide || [];
    for (var k = 0; k < hide.length; k++) {
      if (hide[k] && isUnder(clean, hide[k])) return true;
    }
    return false;
  }

  // Unique names show as-is; a collision adds the parent folder, "LLM (workspace)"; and if that
  // still collides, a counter. Labels are unique by construction, so the sidebar never shows two
  // indistinguishable rows - the tooltip carries the full path either way.
  function labelize(paths) {
    var counts = {};
    (paths || []).forEach(function (p) { var b = base(p) || p; counts[b] = (counts[b] || 0) + 1; });
    var used = {};
    return (paths || []).map(function (p) {
      var b = base(p) || p;
      var label = counts[b] > 1 ? b + " (" + (parent(p) || "/") + ")" : b;
      var n = 2;
      while (used[label]) label = b + " (" + n++ + ")";
      used[label] = true;
      return { path: p, label: label };
    });
  }

  // Which labelled projects still need a row: skip ones the native UI already shows (matched on the
  // displayed label, so a same-named-but-different project still appears), containers, and repeats.
  function pickMissing(entries, nativeLabels, opts) {
    opts = opts || {};
    var max = typeof opts.maxRows === "number" ? opts.maxRows : 80;
    var have = {};
    (nativeLabels || []).forEach(function (x) { have[x] = true; });
    var out = [], seenLabel = {}, seenPath = {};
    var list = entries || [];
    for (var i = 0; i < list.length && out.length < max; i++) {
      var e = list[i];
      if (!e || !e.path || !e.label) continue;
      if (have[e.label] || seenLabel[e.label] || seenPath[e.path]) continue;
      if (isContainer(e.path, list.map(function (x) { return x.path; }), opts)) continue;
      seenLabel[e.label] = true;
      seenPath[e.path] = true;
      out.push(e);
    }
    return out;
  }

  // Convenience for callers that start from raw paths: containers are removed before labelling,
  // so a container never steals a nice label from a real project.
  function plan(workspaces, nativeLabels, opts) {
    opts = opts || {};
    var kept = (workspaces || []).filter(function (p) {
      return norm(p) && !isContainer(p, workspaces, opts);
    });
    var seen = {};
    kept = kept.filter(function (p) { if (seen[p]) return false; seen[p] = true; return true; });
    return pickMissing(labelize(kept), nativeLabels, opts);
  }

  return {
    norm, strip, base, parent, dirname, samePath, isUnder,
    registryKey, parseRegistry, isContainer, labelize, pickMissing, plan
  };
});
