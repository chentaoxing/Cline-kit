// feature: language-picker
// Puts Cline's own Settings page in charge of the interface language. Cline has no language setting,
// so this adds a row that looks like the neighbours it sits between (same structure as the Dark mode
// and App icon rows) and lists the dictionaries that ship with the kit, plus "English" to opt out.
//
// Clicking does not translate the page from inside the page - the payload is composed in Node. The
// click stores one pending intent in localStorage; the resident injector consumes it on its next
// cycle (<= 4 s), writes `dictionary` into %APPDATA%\cline-kit\config.json, and re-injects. The
// engine then re-translates from the original text, so no reload happens and the choice survives a
// restart. Because the injector clears the key after consuming it, `ckit locales <code>` from the
// terminal stays authoritative instead of being overwritten by a stale click.
//
// Runs inside the webview. Config arrives as window.__clineKitFeature["language-picker"].
(function () {
  var ID = "language-picker";
  var VER = 3;                       // human-readable; hot-swap keys off CFG.__build instead
  var CFG = (window.__clineKitFeature && window.__clineKitFeature[ID]) || {};
  var st = window.__clineKitFeatureState = window.__clineKitFeatureState || {};
  var BUILD = String(CFG.__build || "v" + VER);
  if (st[ID + "_build"] === BUILD) return;
  if (st[ID + "_observer"]) { try { st[ID + "_observer"].disconnect(); } catch (e) { } }
  if (st[ID + "_timer"]) clearInterval(st[ID + "_timer"]);
  st[ID + "_build"] = BUILD;
  st[ID] = VER;

  var TEXT = CFG.text || {};
  var CHOICES = CFG.choices || [];
  var CURRENT = CFG.current || "zh-CN";
  var PENDING = CFG.pendingKey || "cline-kit.language-pending";
  // The row goes under the Dark mode switch. Its label is translated like everything else, so the
  // registry hands over both the English key and this locale's rendering of it.
  var ANCHORS = CFG.anchors || ["Dark mode"];

  // Fallbacks are English on purpose: English is the app source language, so the row stays
  // readable when a locale has no featureText block yet.
  function t(key, fallback) { return (TEXT && TEXT[key]) || fallback; }

  // Classes copied from Cline's own rows so the addition does not look bolted on.
  var ROW_CLS = "flex items-center justify-between gap-5 border-b py-4 max-[720px]:flex-col max-[720px]:items-stretch";
  var LEFT_CLS = "flex flex-col gap-1";
  var TITLE_CLS = "text-base font-semibold text-foreground";
  var HINT_CLS = "text-sm text-muted-foreground";
  var GROUP_CLS = "flex shrink-0 items-center gap-2 max-[720px]:flex-wrap";
  var BTN_CLS = "inline-flex h-8 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border bg-background px-3 text-sm font-medium shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] hover:bg-surface-hover hover:text-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50";
  var ON_CLS = " ring-2 ring-ring ring-offset-2 ring-offset-background text-foreground";
  var OFF_CLS = " text-muted-foreground";

  function txt(el) { return (el && (el.innerText || el.textContent) || "").replace(/\s+/g, " ").trim(); }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // The Settings page is the container that holds several native switch rows. Anchoring on the
  // switches instead of a class keeps this working when Tailwind reorders its utility list - but the
  // page is not the only place with switches (a notification grid has eight of its own), so every
  // candidate is scored and the densest one wins.
  function settingsSection() {
    var existing = document.querySelector("[data-ckit-lang]");
    if (existing && existing.parentElement) return existing.parentElement;
    var sws = document.querySelectorAll("[role=switch]");
    var best = null, bestScore = 0;
    for (var i = 0; i < sws.length; i++) {
      var row = sws[i].closest("div.flex");
      var box = row && row.parentElement;
      if (!box || box === best) continue;
      var switchRows = 0, bordered = 0;
      for (var j = 0; j < box.children.length; j++) {
        var c = box.children[j];
        if (c.hasAttribute("data-ckit-lang")) continue;
        if (c.querySelector("[role=switch]")) switchRows++;
        if (/border/.test(String(c.className))) bordered++;
      }
      var score = switchRows * 2 + bordered;
      if (switchRows >= 3 && score > bestScore) { best = box; bestScore = score; }
    }
    return best;
  }

  function anchorRow(box) {
    for (var i = 0; i < box.children.length; i++) {
      var c = box.children[i];
      if (c.hasAttribute("data-ckit-lang")) continue;
      var t2 = txt(c);
      for (var k = 0; k < ANCHORS.length; k++) {
        if (ANCHORS[k] && t2.indexOf(ANCHORS[k]) === 0) return c;
      }
    }
    return null;
  }

  function pendingCode() {
    try { return localStorage.getItem(PENDING); } catch (e) { return null; }
  }

  // A click applies immediately, inside the page: every locale travels in the payload, so the
  // language row does not depend on a Node process being alive. The pending key is only how the
  // choice gets written back to the config for the *next* launch.
  function choose(code) {
    var applied = false;
    try { applied = !!(window.__ckitSetLocale && window.__ckitSetLocale(code)); } catch (e) { applied = false; }
    if (applied) CURRENT = code;
    try { localStorage.setItem(PENDING, code); } catch (e) { /* nothing to persist to */ }
    if (!applied) armStallWatch(code);
    armUnsavedWatch();
    render();
  }

  // The injector gets to the request within one cycle, so claiming "it will not persist" the instant
  // someone clicks is just wrong. Only say it once the request has visibly aged.
  var unsaved = false;
  var unsavedTimer = null;
  function armUnsavedWatch() {
    unsaved = false;
    if (unsavedTimer) clearTimeout(unsavedTimer);
    unsavedTimer = setTimeout(function () { unsavedTimer = null; unsaved = true; render(); }, 8000);
  }

  // Only reachable when the payload carried a single locale (an older injector) or the code was not
  // shipped: then the click really is a request, and a request nobody takes must not look like
  // success.
  var stalled = false;
  var stallTimer = null;
  function armStallWatch(code) {
    stalled = false;
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(function () {
      stallTimer = null;
      if (pendingCode() === code) { stalled = true; render(); }
    }, 12000);
  }

  function buildRow() {
    var row = el("div", ROW_CLS);
    row.setAttribute("data-ckit-lang", String(VER));
    row.setAttribute("data-ckit-ui", "");  // the engine must not re-translate our own labels
    var left = el("div", LEFT_CLS);
    var title = el("p", TITLE_CLS, t("title", "Interface language"));
    var hint = el("p", HINT_CLS, "");
    left.appendChild(title); left.appendChild(hint);
    row.appendChild(left);

    var group = el("div", GROUP_CLS);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t("title", "Interface language"));
    var buttons = {};
    for (var i = 0; i < CHOICES.length; i++) {
      (function (c) {
        var b = el("button", "", c.native);
        b.type = "button";
        b.setAttribute("data-ckit-code", c.code);   // stable handle for tests and for `ckit doctor`
        b.setAttribute("title", c.off
          ? t("offTip", "Show Cline's original text")
          : c.code + " - " + c.strings + " " + t("stringsWord", "strings") + " v" + c.version);
        b.addEventListener("click", function () { if (c.code !== CURRENT) choose(c.code); });
        group.appendChild(b);
        buttons[c.code] = b;
      })(CHOICES[i]);
    }
    row.appendChild(group);
    return { row: row, hint: hint, buttons: buttons };
  }

  // Only what changes: the selected button, and the hint line.
  function paint(built) {
    var p = pendingCode();
    var waiting = p && p !== CURRENT;
    var stuck = waiting && stalled;
    var showingUnsaved = !!(p && p === CURRENT) && unsaved;
    built.hint.textContent = stuck ? t("stalled",
      "Nothing is applying the change - start the kit with `ckit start`, then click again.")
      : waiting ? t("switching", "Switching...")
      : showingUnsaved ? t("unsaved", "Applied now; it will not persist until the kit's background service is running.")
      : t("hint", "Added by cline-kit. Applies in a few seconds, no restart.");
    built.hint.style.color = stuck ? "var(--destructive, #d13438)"
      : showingUnsaved ? "var(--warning, #b58900)" : "";
    for (var i = 0; i < CHOICES.length; i++) {
      var c = CHOICES[i], b = built.buttons[c.code];
      if (!b) continue;
      var on = c.code === CURRENT;
      b.className = BTN_CLS + (on ? ON_CLS : OFF_CLS);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  // A signature, not a rebuild. The previous version replaced the whole row on every refresh, and
  // replacing it is itself a DOM mutation - so the observer queued another refresh and the row was
  // recreated continuously. Every pointer-down landed on a button that was gone by mouse-up, which is
  // exactly "点击了没用", while a scripted click dispatched in the same frame as a rebuild always
  // appeared to work.
  function signature() {
    return CURRENT + "|" + (pendingCode() || "") + "|" + (stalled ? 1 : 0) + "|" + (unsaved ? 1 : 0) + "|" + CHOICES.length;
  }

  var built = null;      // { row, hint, buttons }
  var sig = "";

  function render() {
    var box = settingsSection();
    if (!box) { st[ID + "_stats"] = { version: VER, build: BUILD, row: "no-settings-page", choices: CHOICES.length }; return; }
    var mine = box.querySelector(":scope > [data-ckit-lang]");
    if (built && mine !== built.row) built = null;   // Cline re-rendered the page under us
    if (!built) {
      built = buildRow();
      if (mine) box.replaceChild(built.row, mine);
      else {
        var after = anchorRow(box);
        if (after && after.nextSibling) box.insertBefore(built.row, after.nextSibling);
        else box.appendChild(built.row);
      }
      sig = "";
    }
    var s = signature();
    var p = pendingCode();
    if (!p || p === CURRENT) {
      // The request is gone or already reflected: stop warning about it.
      if (stalled) { stalled = false; s = ""; }
      if (unsaved) { unsaved = false; if (unsavedTimer) { clearTimeout(unsavedTimer); unsavedTimer = null; } s = ""; }
    }
    if (s !== sig) { sig = s; paint(built); }
    st[ID + "_stats"] = {
      version: VER, build: BUILD, row: "rendered", current: CURRENT,
      pending: pendingCode(), stalled: stalled, choices: CHOICES.length
    };
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    (window.requestAnimationFrame || setTimeout)(function () { queued = false; render(); }, 16);
  }

  if (!document.body) return;
  render();
  // The settings page mounts and unmounts as the user navigates; an observer keeps the row present
  // without polling, and the interval is the safety net for subtrees that report no mutation.
  st[ID + "_observer"] = new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var n = muts[i].target && muts[i].target.nodeType === 1 ? muts[i].target : muts[i].target && muts[i].target.parentElement;
      if (n && n.closest && n.closest("[data-ckit-lang]")) return;   // our own click feedback
    }
    schedule();
  });
  st[ID + "_observer"].observe(document.body, { childList: true, subtree: true, characterData: true });
  st[ID + "_timer"] = setInterval(render, 1500);
})();
