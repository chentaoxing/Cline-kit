// Pure helpers for the sidebar-groups feature: no DOM, no browser globals.
// Loaded twice from the same file - CommonJS for scripts/selftest.js, and prepended to the
// browser script by src/features/index.js, where it lands on window.__ckitSidebarLogic.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else if (root) root.__ckitSidebarLogic = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // Collapse every run of whitespace (space, tab, newline) to one space. React renders the same
  // label with newlines between children, so without this nothing ever matches.
  function norm(s) { return (s || "").replace(/\s+/g, " ").trim(); }

  function strip(p) { return (p || "").replace(/[\\/]+$/, ""); }

  function sepIndex(s) { return Math.max(s.lastIndexOf("\\"), s.lastIndexOf("/")); }

  function base(p) {
    var s = strip(p);
    var i = sepIndex(s);
    return i >= 0 ? s.slice(i + 1) : s;
  }

  // The folder holding this project, used to tell two same-named projects apart.
  function parent(p) {
    var s = strip(p);
    var i = sepIndex(s);
    if (i <= 0) return "";
    var up = s.slice(0, i);
    var j = sepIndex(up);
    return j >= 0 ? up.slice(j + 1) : up;
  }

  function samePath(a, b) { return strip(a).toLowerCase() === strip(b).toLowerCase(); }

  // A registered path is a container rather than a project when another registered path sits
  // inside it, when it is the app's own install directory, or when the user hid it.
  function isContainer(p, all, opts) {
    opts = opts || {};
    var clean = strip(p).toLowerCase();
    var withSep = clean + "\\";
    for (var i = 0; i < (all || []).length; i++) {
      var q = strip(all[i]).toLowerCase();
      if (q !== clean && q.indexOf(withSep) === 0) return true;
    }
    var install = strip(opts.installDir || "").toLowerCase();
    if (install && (clean === install || clean.indexOf(install + "\\") === 0)) return true;
    var hide = opts.hide || [];
    for (var k = 0; k < hide.length; k++) {
      if (clean === strip(hide[k]).toLowerCase()) return true;
    }
    return false;
  }

  // Unique names show as-is; a collision adds the parent folder; colliding parents fall back to
  // the whole path so the two rows stay distinguishable.
  function labelsFor(paths) {
    var groups = {};
    (paths || []).forEach(function (p) { var b = base(p); (groups[b] = groups[b] || []).push(p); });
    var out = {};
    Object.keys(groups).forEach(function (b) {
      var same = groups[b];
      if (same.length === 1) { out[same[0]] = b; return; }
      var parents = same.map(parent);
      var unique = parents.filter(function (x, i) { return parents.indexOf(x) === i; }).length === same.length;
      same.forEach(function (p, i) {
        out[p] = unique && parents[i] ? parents[i] + "\\" + b : p;
      });
    });
    return out;
  }

  function parseRegistry(raw) {
    try {
      var obj = JSON.parse(raw || "{}");
      var env = ((obj.environments || {}).local) || {};
      return {
        workspaces: Array.isArray(env.workspaces) ? env.workspaces : [],
        last: env.lastWorkspace || ""
      };
    } catch (e) { return { workspaces: [], last: "" }; }
  }

  // Which registered workspaces still need a row: skip ones the native UI already shows (matched by
  // displayed folder name), containers, exact duplicates, and anything past maxRows.
  function pickMissing(workspaces, nativeNames, opts) {
    opts = opts || {};
    var max = opts.maxRows || 80;
    var out = [];
    var seen = {};
    var list = workspaces || [];
    for (var i = 0; i < list.length && out.length < max; i++) {
      var ws = list[i];
      var n = base(ws);
      if (!n) continue;
      if (nativeNames && nativeNames[n]) continue;
      if (seen[ws]) continue;
      if (isContainer(ws, list, opts)) continue;
      seen[ws] = true;
      out.push(ws);
    }
    return out;
  }

  return {
    norm, strip, base, parent, samePath, isContainer, labelsFor, parseRegistry, pickMissing
  };
});
