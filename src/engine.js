/* cline-zh-overlay engine (browser side).
 * Runs inside the Cline webview. Expects a `DICT` const in scope:
 *   { version, entries: {en: zh}, prefixes: [{from,to}], rules: [{pattern,out}] }
 * No dependencies, no network, no eval of remote code beyond this data.
 */
(function () {
  var VER = (DICT && DICT.version) || 1;
  // Guard on the engine's own build hash, not just the dictionary version: editing this file
  // changes behaviour but leaves DICT.version untouched, so a version-only guard would keep the
  // old engine running forever.
  var BUILD = String((DICT && DICT.engineBuild) || "v" + VER);
  if (window.__zhUIBuild === BUILD) return;
  if (window.__zhUIObserver) { try { window.__zhUIObserver.disconnect(); } catch (e) { } }
  if (window.__zhUITimer) { clearInterval(window.__zhUITimer); }
  window.__zhUIBuild = BUILD;
  window.__zhUIVersion = VER;

  var ENTRIES = DICT.entries || {};
  var PREFIXES = DICT.prefixes || [];
  var RULES = (DICT.rules || []).map(function (r) {
    try { return { re: new RegExp(r.pattern), out: r.out }; } catch (e) { return null; }
  }).filter(Boolean);

  function expand(str, m) {
    return str.replace(/\$(\d)/g, function (_, n) { return m[+n] === undefined ? "" : m[+n]; });
  }

  function lookup(s) {
    if (!s) return null;
    var hit = ENTRIES[s];
    if (hit) return hit;
    for (var i = 0; i < RULES.length; i++) {
      var m = s.match(RULES[i].re);
      if (m) {
        var r = expand(RULES[i].out, m);
        if (r && r !== s) return r;
      }
    }
    for (var j = 0; j < PREFIXES.length; j++) {
      var from = PREFIXES[j].from, to = PREFIXES[j].to;
      if (s.length > from.length && s.slice(0, from.length) === from) return to + s.slice(from.length);
    }
    return null;
  }

  var ATTRS = (DICT.attributes || ["placeholder", "aria-label", "title"]);
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, CODE: 1, PRE: 1, SVG: 1 };
  var CJK = /[一-鿿]/;
  var LATIN = /[A-Za-z]{3}/;

  function translateText(node) {
    var raw = node.nodeValue;
    if (!raw || raw.length > 800) return;
    var el = node.parentElement;
    if (el && SKIP[el.tagName]) return;
    var key = raw.replace(/\s+/g, " ").trim();
    if (key.length < 2 || !LATIN.test(key) || CJK.test(key)) return;
    var rep = lookup(key);
    if (!rep || rep === key) return;
    var lead = raw.match(/^\s*/)[0];
    var trail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + rep + trail;
  }

  function translateEl(el) {
    if (!el || el.nodeType !== 1 || !el.getAttribute) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var a = ATTRS[i];
      var v = el.getAttribute(a);
      if (!v) continue;
      var rep = lookup(v.replace(/\s+/g, " ").trim());
      if (rep && rep !== v) el.setAttribute(a, rep);
    }
  }

  function scan(root) {
    var el = root && root.nodeType ? root : document.documentElement;
    if (!el) return;
    try {
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

  window.__zhUIObserver = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === "characterData") { translateText(m.target); continue; }
      if (m.type === "attributes") { translateEl(m.target); continue; }
      for (var j = 0; j < m.addedNodes.length; j++) scan(m.addedNodes[j]);
    }
    schedule();
  });
  window.__zhUIObserver.observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ATTRS
  });

  // safety net for portals/menus mounted outside the observed subtree
  window.__zhUITimer = setInterval(function () { scan(document.documentElement); }, 1200);

  window.__zhUIStats = { version: VER, entries: Object.keys(ENTRIES).length };
  try { console.log("[cline-zh] overlay v" + VER + " loaded (" + Object.keys(ENTRIES).length + " entries)"); } catch (e) { }
})();
