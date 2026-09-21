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
  var VER = 1;                       // human-readable; hot-swap keys off CFG.__build instead
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

  // A click cannot apply itself: the resident injector has to consume the request. When it is not
  // running - Cline opened directly, or via `ckit attach`, which injects once and stays out of the
  // way - the row would otherwise look broken with no explanation. So if the request is still
  // sitting there after two injector cycles, say so in the row.
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

  function choose(code) {
    try { localStorage.setItem(PENDING, code); } catch (e) { return; }
    armStallWatch(code);
    render();                              // show "switching" immediately, the injector applies it
  }

  function buildRow() {
    var row = el("div", ROW_CLS);
    row.setAttribute("data-ckit-lang", String(VER));
    row.setAttribute("data-ckit-ui", "");  // the engine must not re-translate our own labels
    var left = el("div", LEFT_CLS);
    left.appendChild(el("p", TITLE_CLS, t("title", "Interface language")));
    var p = pendingCode();
    var waiting = p && p !== CURRENT;
    if (!waiting && stalled) stalled = false;         // the injector took the request
    var stuck = waiting && stalled;
    left.appendChild(el("p", HINT_CLS, stuck ? t("stalled",
      "Nothing is applying the change - start the kit with `ckit start`, then click again.")
      : (waiting ? t("switching", "Switching...")
        : t("hint", "Added by cline-kit. Applies in a few seconds, no restart."))));
    if (stuck) left.lastChild.style.color = "var(--destructive, #d13438)";
    row.appendChild(left);

    var group = el("div", GROUP_CLS);
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", t("title", "Interface language"));
    for (var i = 0; i < CHOICES.length; i++) {
      (function (c) {
        var on = c.code === CURRENT;
        var b = el("button", BTN_CLS + (on ? ON_CLS : OFF_CLS), c.native);
        b.type = "button";
        b.setAttribute("data-ckit-code", c.code);   // stable handle for tests and for `ckit doctor`
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.setAttribute("title", c.off
          ? t("offTip", "Show Cline's original text")
          : c.code + " - " + c.strings + " " + t("stringsWord", "strings") + " v" + c.version);
        if (waiting && c.code === p) b.className += ON_CLS;
        b.addEventListener("click", function () { if (c.code !== CURRENT) choose(c.code); });
        group.appendChild(b);
      })(CHOICES[i]);
    }
    row.appendChild(group);
    return row;
  }

  function removeRow(box) {
    var olds = box.querySelectorAll(":scope > [data-ckit-lang]");
    for (var i = 0; i < olds.length; i++) olds[i].remove();
  }

  function render() {
    var box = settingsSection();
    if (!box) { st[ID + "_stats"] = { version: VER, build: BUILD, row: "no-settings-page", choices: CHOICES.length }; return; }
    var prev = box.querySelector(":scope > [data-ckit-lang]");
    if (prev) {
      // Text-only refresh keeps focus on a button the user may be tabbing through.
      var fresh = buildRow();
      box.replaceChild(fresh, prev);
    } else {
      var after = anchorRow(box);
      if (after && after.nextSibling) box.insertBefore(buildRow(), after.nextSibling);
      else if (after) box.appendChild(buildRow());
      else box.appendChild(buildRow());
    }
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
