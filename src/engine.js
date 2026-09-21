/* cline-kit overlay engine (browser side).
 * Runs inside the Cline webview. Expects a `DICT` const in scope:
 *   { version, language, entries: {en: text}, prefixes: [{from,to}], rules: [{pattern,out}],
 *     keys: [en...], locales: { code: { version, entries:[...aligned to keys], rules, prefixes } } }
 * `locales` is optional; without it this behaves exactly as the single-dictionary engine.
 * No dependencies, no network, no eval of remote code beyond this data.
 */
(function () {
  var VER = (DICT && DICT.version) || 1;
  var BASE = String((DICT && DICT.engineBuild) || "v" + VER);
  var LANG = (DICT && DICT.language) || "none";
  // Guard on the engine build *and* the dictionary version. Engine-only edits must re-run, and so
  // must a locale switch or `ckit update`: those change DICT while this file stays byte-identical.
  var BUILD = BASE + "/d" + VER + "/" + LANG;
  if (window.__ckitEngineBuild === BUILD) return;
  if (window.__ckitObserver) { try { window.__ckitObserver.disconnect(); } catch (e) { } }
  if (window.__ckitTimer) { clearInterval(window.__ckitTimer); }
  window.__ckitEngineBuild = BUILD;
  window.__ckitEngineVersion = VER;

  // Every bundled locale is compiled once, on demand, and kept in a table. Compiling all five up
  // front would build ~120 regexes nobody asked for yet; compiling none is what made the language
  // row depend on a Node process being alive.
  var TABLES = {};
  function tableFor(code) {
    if (TABLES[code]) return TABLES[code];
    var src = null;
    if (code === LANG) {
      src = { entries: DICT.entries || {}, rules: DICT.rules || [], prefixes: DICT.prefixes || [] };
    } else if (DICT.locales && DICT.keys && DICT.locales[code]) {
      var col = DICT.locales[code], entries = {};
      var values = col.entries || [];
      for (var i = 0; i < DICT.keys.length && i < values.length; i++) {
        if (values[i]) entries[DICT.keys[i]] = values[i];
      }
      src = { entries: entries, rules: col.rules || [], prefixes: col.prefixes || [] };
    }
    if (!src) return null;
    var rules = [];
    for (var r = 0; r < src.rules.length; r++) {
      try { rules.push({ re: new RegExp(src.rules[r].pattern), out: src.rules[r].out }); }
      catch (e) { /* one bad rule must not cost the whole locale */ }
    }
    TABLES[code] = { entries: src.entries, prefixes: src.prefixes, rules: rules };
    return TABLES[code];
  }

  var ACTIVE = tableFor(LANG) || { entries: {}, prefixes: [], rules: [] };
  window.__ckitLocale = LANG;
  window.__ckitLocales = function () {
    var out = [LANG];
    if (DICT.locales) for (var c in DICT.locales) if (Object.prototype.hasOwnProperty.call(DICT.locales, c) && c !== LANG) out.push(c);
    return out;
  };

  /**
   * Switch the interface language inside the page. Returns false when that locale was not shipped,
   * which is the only honest failure - the caller can then say so instead of going quiet.
   */
  window.__ckitSetLocale = function (code) {
    var t = tableFor(code);
    if (!t) return false;
    ACTIVE = t;
    window.__ckitLocale = code;
    // Keep the rebuild guard in step, or the next re-injection would short-circuit and leave the
    // engine's own idea of the locale behind the one the user just picked.
    window.__ckitEngineBuild = BASE + "/d" + VER + "/" + code;
    scan(document.documentElement);
    return true;
  };

  function expand(str, m) {
    return str.replace(/\$(\d)/g, function (_, n) { return m[+n] === undefined ? "" : m[+n]; });
  }

  function lookup(s) {
    if (!s) return null;
    var hit = ACTIVE.entries[s];
    if (hit) return hit;
    for (var i = 0; i < ACTIVE.rules.length; i++) {
      var m = s.match(ACTIVE.rules[i].re);
      if (m) {
        var r = expand(ACTIVE.rules[i].out, m);
        if (r && r !== s) return r;
      }
    }
    for (var j = 0; j < ACTIVE.prefixes.length; j++) {
      var from = ACTIVE.prefixes[j].from, to = ACTIVE.prefixes[j].to;
      if (s.length > from.length && s.slice(0, from.length) === from) return to + s.slice(from.length);
    }
    return null;
  }

  var ATTRS = (DICT.attributes || ["placeholder", "aria-label", "title"]);
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1 };
  var CJK = /[一-鿿]/;
  var LATIN = /[A-Za-z]{3}/;

  // Write counter: an overlay that keeps rewriting the same nodes is chasing its own mutations,
  // which shows up as a frozen webview long before it shows up as a visual bug. `ckit doctor`
  // samples this twice and fails when an idle page keeps taking writes.
  var STATS = window.__ckitStats = { scans: 0, writes: 0, restored: 0 };

  function norm(s) { return String(s || "").replace(/\s+/g, " ").trim(); }

  // The kit's own controls (the in-app language row) are already rendered in the language the user
  // picked, and translating them would let the observer chase its own output. The check is memoised
  // on the node because this runs for every text node on every mutation.
  function isKitUI(el) {
    if (!el || el.nodeType !== 1) return false;
    if (el.__ckitOwn == null) {
      try { el.__ckitOwn = el.closest && el.closest("[data-ckit-ui]") ? 1 : 0; }
      catch (e) { el.__ckitOwn = 0; }
    }
    return el.__ckitOwn === 1;
  }

  // Text we replaced is remembered on the node, so switching locale (or pulling a newer dictionary)
  // can start from the original English instead of from last run's output.
  function translateText(node) {
    var raw = node.nodeValue;
    if (!raw || raw.length > 800) return;
    var el = node.parentElement;
    if (el && SKIP[el.tagName]) return;
    if (isKitUI(el)) return;
    var src = raw;
    if (node.__ckitOut != null) {
      src = norm(raw) === norm(node.__ckitOut) ? node.__ckitSrc : raw;  // the app rewrote it: stale
    }
    var key = norm(src);
    if (key.length < 2) return;
    if (node.__ckitSrc == null && (CJK.test(key) || !LATIN.test(key))) return;
    var rep = lookup(key);
    var lead = raw.match(/^\s*/)[0];
    var trail = raw.match(/\s*$/)[0];
    if (!rep || rep === src) {
      if (node.__ckitSrc != null) { node.nodeValue = lead + node.__ckitSrc + trail; node.__ckitSrc = null; node.__ckitOut = null; STATS.restored++; }
      return;
    }
    node.__ckitSrc = src;
    node.__ckitOut = rep;
    // Never write an identical value: our own mutation would wake the observer again and the two
    // would chase each other forever (that is a frozen webview, not a slow one).
    var next = lead + rep + trail;
    if (next !== raw) { node.nodeValue = next; STATS.writes++; }
  }

  function translateEl(el) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    if (isKitUI(el)) return;
    var keep = el.__ckitAttrSrc || (el.__ckitAttrSrc = {});
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      var v = el.getAttribute(a);
      if (!v && keep[a] == null) continue;
      var src = keep[a] != null && norm(v) === norm(keep[a].out) ? keep[a].src : v;
      var rep = lookup(norm(src));
      if (!rep || rep === src) {
        if (keep[a]) { el.setAttribute(a, keep[a].src); delete keep[a]; STATS.restored++; }
        continue;
      }
      keep[a] = { src: src, out: rep };
      if (rep !== v) { el.setAttribute(a, rep); STATS.writes++; }
    }
  }

  function scan(root) {
    var el = root && root.nodeType ? root : document.documentElement;
    if (!el) return;
    try {
      STATS.scans++;
      var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
      var n;
      while ((n = w.nextNode())) {
        if (n.nodeType === 3) translateText(n);
        else translateEl(n);
      }
    } catch (e) { /* DOM raced away; next pass will catch it */ }
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    var run = function () { queued = false; scan(document.documentElement); };
    (window.requestAnimationFrame || setTimeout)(run, 16);
  }

  if (!document.documentElement) return;
  scan(document.documentElement);

  window.__ckitObserver = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === "characterData") { translateText(m.target); continue; }
      if (m.type === "attributes") { translateEl(m.target); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) scan(m.addedNodes[j]);
    }
    schedule();
  });
  window.__ckitObserver.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS
  });

  // safety net for portals/menus mounted outside the observed subtree
  window.__ckitTimer = setInterval(function () { scan(document.documentElement); }, 1200);

  window.__zhUIStats = { version: VER, entries: Object.keys(ACTIVE.entries).length };
  try { console.log("[cline-kit] overlay v" + VER + " loaded (" + Object.keys(ACTIVE.entries).length + " entries, " + window.__ckitLocales().length + " locales)"); } catch (e) { }
})();
