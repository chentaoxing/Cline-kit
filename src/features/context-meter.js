// feature: context-meter
// Shows how full the model's context window is, and what share of the input came back from cache.
//     ▓▓▓▓░░░░  64%   🎯 99.2%
// It goes in the composer's bottom bar, immediately after the reasoning-effort control, which puts it
// before the project name on the right without touching either.
//
// Where the numbers come from: Cline already computes them. Its own meter receives
// {contextWindow, tokensIn, tokensOut, cacheReadTokens, totalCost} and draws a 22px ring next to the
// project name - but it returns null when the model reports no contextWindow, which is the case for
// several of its free models (measured on the running app: cline-free/kimi-k3, muse-spark and
// deepseek have no such key at all, poolside/laguna-s-2.1 does). That is why the ring looks missing
// rather than broken. The component's fiber still carries its props when it renders nothing, so this
// feature reads the same object instead of keeping a second tally.
//
// Consequence of a missing limit, deliberately: the bar and the percentage are dropped, the hit rate
// stays, because cacheReadTokens/tokensIn needs no window size. Nothing is estimated to fill the gap;
// `ckit config --context-limit=<tokens>` is how you supply one yourself.
//
// Runs inside the webview. Config arrives as window.__clineKitFeature["context-meter"].
(function () {
  var ID = "context-meter";
  var VER = 1;
  var CFG = (window.__clineKitFeature && window.__clineKitFeature[ID]) || {};
  var st = window.__clineKitFeatureState = window.__clineKitFeatureState || {};
  var BUILD = String(CFG.__build || "v" + VER);
  if (st[ID + "_build"] === BUILD) return;
  if (st[ID + "_timer"]) clearInterval(st[ID + "_timer"]);
  st[ID + "_build"] = BUILD;
  st[ID] = VER;

  var L = window.__ckitContextLogic;
  var TEXT = CFG.text || {};
  function t(key, fallback) { return (TEXT && TEXT[key]) || fallback; }
  var GLYPH = CFG.glyph || "🎯";
  var HIDE_NATIVE = CFG.hideNative !== false;
  var FALLBACK_LIMIT = Number(CFG.fallbackLimit) || 0;
  var MAX_VISITED = 14000;

  // ---------------------------------------------------------------- locating the numbers
  function fiberOf(node) {
    for (var k in node) if (k.indexOf("__reactFiber$") === 0) return node[k];
    return null;
  }

  function usageAbove(f) {
    var hops = 0;
    while (f && hops++ < 40) {
      var p = f.memoizedProps;
      if (p && p.usage && typeof p.usage === "object") return p.usage;
      f = f.return;
    }
    return null;
  }

  function footerBox() {
    var ds = document.querySelectorAll("div");
    for (var i = 0; i < ds.length; i++) {
      var c = ds[i].className;
      if (typeof c === "string" && c.indexOf("rounded-b-xl") >= 0 && c.indexOf("border-t") >= 0) return ds[i];
    }
    return null;
  }

  // Returns { usage, via } - via is reported to `ckit doctor`, because "we could not find the data"
  // and "the data says zero" are different failures needing different fixes.
  function readUsage() {
    var ring = document.getElementById("token-usage");
    if (ring) {
      var rf = fiberOf(ring);
      if (rf) { var u = usageAbove(rf); if (u) return { usage: u, via: "ring" }; }
    }
    var cached = st[ID + "_fiber"];
    if (cached && cached.memoizedProps && cached.memoizedProps.usage) {
      return { usage: cached.memoizedProps.usage, via: "cached" };
    }
    var nodes = document.querySelectorAll("body *"), start = null;
    for (var i = 0; i < nodes.length && !start; i++) start = fiberOf(nodes[i]);
    if (!start) return { usage: null, via: "none" };
    while (start.return) start = start.return;
    var q = [start], seen = new Set(), visited = 0;
    while (q.length && visited < MAX_VISITED) {
      var f = q.shift();
      if (!f || typeof f !== "object" || seen.has(f)) continue;
      seen.add(f); visited++;
      var p = f.memoizedProps;
      if (p && p.usage && typeof p.usage === "object") {
        st[ID + "_fiber"] = f;                       // re-read next tick without walking again
        return { usage: p.usage, via: "walk" };
      }
      if (f.child) q.push(f.child);
      if (f.sibling) q.push(f.sibling);
    }
    return { usage: null, via: "none" };
  }

  // ---------------------------------------------------------------- the widget
  // Built once, then only repainted. The language row used to replace its own node every refresh and
  // the replacement queued the next refresh, so a real click never landed on the same element twice;
  // this feature has no buttons, but the same rule keeps the observer-free loop cheap.
  var host = null, root = null, fill = null, pctEl = null, hitEl = null, last = "";

  function build(inHost) {
    root = document.createElement("span");
    root.setAttribute("data-ckit-feat", ID);
    root.setAttribute("title", "");
    root.style.cssText = "display:inline-flex;align-items:center;gap:6px;flex:none;font-size:12px;" +
      "line-height:1;opacity:.75;padding-left:2px";

    var track = document.createElement("span");
    track.style.cssText = "display:inline-block;width:56px;height:5px;border-radius:999px;" +
      "background:rgba(128,128,128,.28);overflow:hidden;flex:none";
    fill = document.createElement("span");
    fill.style.cssText = "display:block;height:100%;width:0%;border-radius:999px;transition:width .3s ease";
    track.appendChild(fill);

    pctEl = document.createElement("span");
    pctEl.style.cssText = "min-width:30px;font-variant-numeric:tabular-nums";
    hitEl = document.createElement("span");
    hitEl.style.cssText = "font-variant-numeric:tabular-nums;opacity:.9";

    root.appendChild(track);
    root.appendChild(pctEl);
    root.appendChild(hitEl);
    inHost.appendChild(root);
    host = inHost;
    last = "";
  }

  function destroy() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = fill = pctEl = hitEl = host = null;
    last = "";
  }

  function paint(s, via) {
    // The footer element is React's and gets replaced when the view changes; re-attach then.
    if (!root || !host || !host.isConnected || root.parentNode !== host) {
      var box = footerBox();
      if (!box) { destroy(); return; }
      var group = null;
      for (var i = 0; i < box.children.length; i++) {
        var c = box.children[i];
        if (c === root) continue;
        if (String(c.className).indexOf("flex-auto") >= 0) { group = c; break; }
      }
      build(group || box);
    }
    var sig = s.used + "|" + s.limit + "|" + s.pct + "|" + s.hit + "|" + via;
    if (sig === last) return;
    last = sig;

    fill.style.width = (s.pct == null ? 0 : s.pct) + "%";
    fill.style.background = L.fillColor(s.pct);
    pctEl.textContent = s.pct == null ? t("unknown", "no limit") : s.pct + "%";
    hitEl.textContent = GLYPH + " " + (s.hit == null ? "-" : s.hit + "%");

    var tip = t("label", "Context") + ": " + s.usedText +
      (s.limit ? " / " + s.limitText + " (" + s.pct + "%)" : "") +
      (s.hit == null ? "" : "  ·  " + t("hit", "cache hit") + " " + s.hit + "%");
    if (root.getAttribute("title") !== tip) root.setAttribute("title", tip);

    if (HIDE_NATIVE) {
      var ring = document.getElementById("token-usage");
      // Writing the same value is not a mutation, so this cannot feed its own observer loop.
      if (ring && ring.style.display !== "none") ring.style.display = "none";
    }
  }

  function render() {
    if (!L) return;
    var got = readUsage();
    var s = got.usage ? L.summarize(got.usage, { fallbackLimit: FALLBACK_LIMIT }) : null;
    if (!s) {
      destroy();
      st[ID + "_stats"] = { version: VER, build: BUILD, meter: "no data", via: got.via };
      return;
    }
    paint(s, got.via);
    st[ID + "_stats"] = {
      version: VER, build: BUILD, meter: (s.pct == null ? s.usedText + " / ?" : s.usedText + " / " + s.limitText + " = " + s.pct + "%") +
        (s.hit == null ? "" : ", hit " + s.hit + "%"),
      used: s.used, limit: s.limit, pct: s.pct, hit: s.hit, limitSource: s.limitSource, via: got.via
    };
  }

  if (!document.body) return;
  render();
  // Deliberately interval-only: a token counter moves on its own, and watching the whole document for
  // it would wake this feature on every unrelated repaint.
  st[ID + "_timer"] = setInterval(render, 1000);
  try { console.log("[cline-kit:" + ID + "] loaded v" + VER); } catch (e) { }
})();
