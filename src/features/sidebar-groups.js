// feature: sidebar-groups
// Shows every registered Cline workspace in the sidebar's project grouping, not just the ones that
// already have sessions. Native Cline hides empty projects; this appends them with the same styling
// and switches project by driving Cline's own workspace picker (chip -> search -> result row).
//
// Runs inside the webview. Config arrives as window.__clineKitFeature["sidebar-groups"].
(function () {
  var ID = "sidebar-groups";
  var VER = 5;                       // human-readable; hot-swap keys off CFG.__build instead
  var CFG = (window.__clineKitFeature && window.__clineKitFeature[ID]) || {};
  var st = window.__clineKitFeatureState = window.__clineKitFeatureState || {};
  var BUILD = String(CFG.__build || "v" + VER);
  if (st[ID + "_build"] === BUILD) return;
  if (st[ID + "_observer"]) { try { st[ID + "_observer"].disconnect(); } catch (e) { } }
  if (st[ID + "_timer"]) clearInterval(st[ID + "_timer"]);
  st[ID + "_build"] = BUILD;
  st[ID] = VER;

  var KEY = "cline.code.workspace-selection.v2";
  // Pure path/filtering helpers live in a sibling file that is prepended to this script by
  // src/features/index.js and unit tested in scripts/selftest.js.
  var L = window.__ckitSidebarLogic;
  if (!L) {
    try { console.warn("[cline-kit:" + ID + "] logic module missing, feature disabled"); } catch (e) { }
    return;
  }
  var INSTALL = (CFG.installDir || "");
  var HIDE = (CFG.hide || []);
  var MAX_ROWS = CFG.maxRows || 80;
  var TEXT = CFG.text || {};
  // Fallbacks are English on purpose: English is the app source language, so a feature stays
  // readable when a locale has no featureText block yet. Translations arrive via CFG.text,
  // which the registry fills from dictionaries/<locale>.json -> featureText[<id>].

  var CHEVRON = "lucide lucide-chevron-down size-3.5 shrink-0 transition-transform";
  var HEAD_CLS = "flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-sm font-medium text-sidebar-foreground hover:bg-surface-hover-lighter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";
  var ACT_CLS = "flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md px-1 text-left text-xs text-muted-foreground hover:bg-surface-hover-lighter hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring";

  function t(key, fallback) { return (TEXT && TEXT[key]) || fallback; }

  var norm = L.norm;
  var base = L.base;
  var strip = L.strip;
  var labelsFor = L.labelsFor;

  function registry() {
    return L.parseRegistry(localStorage.getItem(KEY));
  }

  function listRoot() {
    var vp = document.querySelector("[data-radix-scroll-area-viewport]");
    if (!vp) return null;
    var box = vp.querySelector('div[class*="flex-col"]');
    return box && box.querySelector('button[aria-expanded]') ? box : (box || null);
  }

  function nativeNames(box) {
    var set = {};
    if (!box) return set;
    var bs = box.querySelectorAll('button[aria-expanded]');
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (!/h-8 w-full/.test(b.className)) continue;
      if (b.closest("[data-ckit-feat]")) continue; // our own rows must not hide our own rows
      var sp = b.querySelector("span");
      var name = norm(sp ? sp.textContent : b.textContent);
      if (name) set[name] = true;
    }
    return set;
  }

  function waitFor(fn, ms) {
    return new Promise(function (resolve) {
      var t0 = Date.now();
      (function loop() {
        var v = null;
        try { v = fn(); } catch (e) { }
        if (v) return resolve(v);
        if (Date.now() - t0 > (ms || 2500)) return resolve(null);
        setTimeout(loop, 80);
      })();
    });
  }

  function setNativeValue(inp, val) {
    var d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
    if (d && d.set) d.set.call(inp, val); else inp.value = val;
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function findChip(names) {
    var btns = [].slice.call(document.querySelectorAll("button")).filter(function (e) {
      var r = e.getBoundingClientRect();
      return r.left > 280 && r.width > 0 && names[norm(e.textContent)] && e.querySelector("svg");
    });
    return btns[0] || null;
  }

  function findRow(path) {
    var want = norm(path);
    var all = [].slice.call(document.querySelectorAll("button")).filter(function (e) {
      return norm(e.textContent) === want;
    });
    if (!all.length) return null;
    var inList = all.filter(function (e) {
      return /max-h-48/.test((e.parentElement || {}).className || "");
    });
    return inList[inList.length - 1] || all[all.length - 1];
  }

  var switching = false;
  function switchWorkspace(path) {
    if (switching) return Promise.resolve();
    switching = true;
    var prev = document.activeElement;
    var chip = findChip(registry().workspaces.reduce(function (m, w) { m[base(w)] = 1; return m; }, {}));
    var done = function (msg) {
      switching = false;
      setTimeout(render, 250);
      setTimeout(render, 1200);
      if (prev && prev.focus) { try { prev.focus(); } catch (e) { } }
      if (msg) flash(msg);
      return Promise.resolve();
    };
    if (!chip) return done(t("errNoChip", "Could not find the workspace button"));
    chip.click();
    return waitFor(function () {
      var ins = document.querySelectorAll("input");
      for (var i = 0; i < ins.length; i++) {
        if (/搜索工作区|search workspace|enter a folder path/i.test(ins[i].getAttribute("placeholder") || "")) return ins[i];
      }
      return null;
    }, 2000).then(function (inp) {
      if (!inp) { chip.click(); return done(t("errNoSearch", "Could not find the workspace search box")); }
      setNativeValue(inp, path);
      return waitFor(function () { return findRow(path); }, 2200).then(function (row) {
        if (!row) {
          ["keydown", "keyup"].forEach(function (type) {
            inp.dispatchEvent(new KeyboardEvent(type, { key: "Escape", code: "Escape", bubbles: true }));
          });
          return done(t("errNotListed", "That project is not in the list"));
        }
        row.click();
        return done(null);
      });
    }).catch(function () { return done(t("errSwitch", "Switch failed")); });
  }

  var flashMsg = "";
  function flash(msg) {
    flashMsg = msg;
    render();
    setTimeout(function () { flashMsg = ""; render(); }, 2600);
  }

  var SVG_CHEVRON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"></path></svg>';
  var SVG_FOLDER = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>';

  // static markup only; every dynamic value goes through textContent
  function svgInto(el, markup, cls) {
    el.innerHTML = markup;
    var node = el.firstElementChild;
    if (node && cls) node.setAttribute("class", cls);
    return node;
  }

  function span(cls, text) {
    var s = document.createElement("span");
    if (cls) s.className = cls;
    s.textContent = text;
    return s;
  }

  function buildRow(ws, label, isCurrent) {
    var wrap = document.createElement("div");
    wrap.className = "mb-1 min-w-0";
    wrap.setAttribute("data-ckit-feat", ID);
    wrap.dataset.wsPath = ws;

    var head = document.createElement("button");
    head.type = "button";
    head.className = HEAD_CLS;
    head.setAttribute("aria-expanded", "false");
    head.title = ws;                                  // full path: the label may be shortened
    svgInto(head, SVG_CHEVRON, CHEVRON + " -rotate-90");
    head.appendChild(span("block min-w-0 truncate", label));
    if (isCurrent) head.appendChild(span("ml-auto shrink-0 text-[11px] text-muted-foreground", t("current", "current")));
    wrap.appendChild(head);

    var body = document.createElement("div");
    body.className = "hidden pl-4";
    body.appendChild(span("px-1 py-1 text-xs text-muted-foreground", t("noSessions", "No sessions yet")));

    var act = document.createElement("button");
    act.type = "button";
    act.className = ACT_CLS;
    svgInto(act, SVG_FOLDER, "size-3.5 shrink-0");
    act.appendChild(span(null, t("switchAndNew", "Open this project and start a session")));
    act.addEventListener("click", function (ev) { ev.stopPropagation(); switchWorkspace(ws); });
    body.appendChild(act);

    if (flashMsg) {
      var err = document.createElement("div");
      err.className = "px-1 py-1 text-xs text-destructive";
      err.textContent = flashMsg;
      body.appendChild(err);
    }
    wrap.appendChild(body);

    head.addEventListener("click", function () {
      var open = head.getAttribute("aria-expanded") === "true";
      head.setAttribute("aria-expanded", open ? "false" : "true");
      body.classList.toggle("hidden", open);
      head.firstElementChild.classList.toggle("-rotate-90", open);
    });
    return wrap;
  }

  function projectMode() {
    var btns = document.querySelectorAll("button");
    var headerLabels = {};
    headerLabels[t("projects", "Projects")] = true;
    headerLabels["Projects"] = true;
    var sawSortControl = false;
    for (var i = 0; i < btns.length; i++) {
      var a = btns[i].getAttribute("aria-label") || "";
      // Prefer the sort control's own label: it states the current mode and survives restyling.
      if (/会话排序|Sort sessions/i.test(a)) {
        sawSortControl = true;
        if (/项目|Project/i.test(a)) return true;
        if (/时间|Time/i.test(a)) return false;
      }
      if (headerLabels[norm(btns[i].textContent)]) return true;
    }
    if (!sawSortControl) {
      // no sort control found at all (different Cline build): fall back to the visible header only
      for (var j = 0; j < btns.length; j++) {
        if (headerLabels[norm(btns[j].textContent)]) return true;
      }
    }
    return false;
  }

  // Native grouping mode is not persisted by Cline, so keep it on. We stop interfering the moment
  // the user touches the sort control themselves - their choice wins for the rest of the session,
  // but a mode flip caused by anything else (React state churn, another overlay, a workspace switch
  // that rebuilds the window) is corrected on the next tick instead of leaving the feature off.
  var userTouchedSort = false;
  function sortButton() {
    var btns = document.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      var a = btns[i].getAttribute("aria-label") || "";
      if (/会话排序|Sort sessions/i.test(a)) return btns[i];
    }
    return null;
  }
  document.addEventListener("click", function (ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var b = t.closest("button");
    if (b && /会话排序|Sort sessions/i.test(b.getAttribute("aria-label") || "")) userTouchedSort = true;
  }, true);

  var lastAutoClick = 0;
  function ensureProjectMode() {
    if (userTouchedSort || CFG.groupMode === false) return;
    if (projectMode()) return;
    // cooldown so a detection mismatch cannot turn into a click loop every tick
    if (Date.now() - lastAutoClick < 6000) return;
    var btn = sortButton();
    if (btn) { lastAutoClick = Date.now(); btn.click(); setTimeout(render, 300); }
  }

  var sig = "";
  function render() {
    ensureProjectMode();
    var box = listRoot();
    if (!box || !projectMode()) { clearRows(); sig = ""; return; }
    var reg = registry();
    var have = nativeNames(box);
    var currentPath = strip(reg.last).toLowerCase();
    var missing = L.pickMissing(reg.workspaces, have, {
      maxRows: MAX_ROWS, installDir: INSTALL, hide: HIDE
    });
    var label = labelsFor(missing);
    var s = missing.map(function (p) { return p + "=" + label[p]; }).join("|") + "::" + currentPath + "::" + flashMsg;
    // Self-heal: compare what we intended against what is actually in the DOM. If anything rewrote
    // or dropped our labels (React reconciliation, another overlay, a partial render), rebuild.
    var dom = [];
    var ours = box.querySelectorAll(":scope > [data-ckit-feat]");
    for (var k = 0; k < ours.length; k++) {
      var sp = ours[k].querySelector("span");
      dom.push((ours[k].dataset.wsPath || "") + "=" + (sp ? sp.textContent : ""));
    }
    var want = missing.map(function (p) { return p + "=" + label[p]; }).join("|");
    if (s === sig && dom.join("|") === want) { report(box, ours.length, missing.length, reg); return; }
    sig = s;
    clearRows();
    if (missing.length) {
      var frag = document.createDocumentFragment();
      for (var j = 0; j < missing.length; j++) {
        frag.appendChild(buildRow(missing[j], label[missing[j]], strip(missing[j]).toLowerCase() === currentPath));
      }
      box.appendChild(frag);
    }
    report(box, box.querySelectorAll(":scope > [data-ckit-feat]").length, missing.length, reg);
  }

  // Counters for `ckit doctor`: what the feature believes right now, readable from outside the
  // closure through window.__clineKitFeatureState.
  function report(box, rows, intended, reg) {
    var native = 0;
    var all = box.querySelectorAll('button[aria-expanded]');
    for (var i = 0; i < all.length; i++) {
      if (/h-8 w-full/.test(all[i].className) && !all[i].closest("[data-ckit-feat]")) native++;
    }
    st[ID + "_stats"] = {
      version: VER, build: BUILD, registered: reg.workspaces.length,
      nativeGroups: native, intended: intended, rows: rows, mode: "project"
    };
  }

  function clearRows() {
    var box = listRoot();
    if (!box) return;
    var olds = box.querySelectorAll(":scope > [data-ckit-feat]");
    for (var i = 0; i < olds.length; i++) olds[i].remove();
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; render(); }, 16);
  }

  if (!document.body) return;
  render();
  st[ID + "_observer"] = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var n = muts[i].target;
      if (n && n.nodeType === 3) n = n.parentElement;
      if (n && n.closest && n.closest("[data-ckit-feat]")) continue;
    }
    schedule();
  });
  st[ID + "_observer"].observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-expanded"]
  });
  st[ID + "_timer"] = setInterval(render, 1500);
  try { console.log("[cline-kit:" + ID + "] loaded v" + VER); } catch (e) { }
})();
