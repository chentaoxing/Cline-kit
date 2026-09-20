# Draft: feature request for the upstream Cline repository

Target: `cline/cline` — desktop app / `cline code` UI.
Paste as an issue (or split into issue + PR). Attached corpus: `dictionaries/zh-CN.json`.

---

## Title

Add a language setting to the Cline desktop app (and a `zh-CN` locale)

## Is your feature request related to a problem? Please describe.

The Cline desktop app has no way to change its UI language. On v0.0.32, **Settings → General** offers
desktop notifications, dark mode, font size, accent colour, app icon, web search, CLI auto-update and
telemetry — but no language or locale control, and the bundle contains no non-English strings. Forcing
the WebView2 locale (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--lang=zh-CN`) has no effect, so the
interface is English-only regardless of the operating system language.

This matters more for the desktop app than for the VS Code extension, because the desktop app is the
primary surface for non-editor users and for Chinese-speaking developer communities. Today the only
workaround is a third-party runtime overlay that injects translations through a DevTools port — which
requires opening a local debug port on every user's machine, a worse security posture than shipping a
locale. I built exactly that ([dictionary attached]) only because there was no supported alternative.

## Describe the solution you'd like

1. A **Language** row in Settings → General: `System default` plus explicit choices, applied live without
   a restart.
2. An i18n layer over the renderer strings (the app already renders everything from React components, so
   a message-catalogue approach fits), with `en` as the source language.
3. Ship `zh-CN` as the first additional locale. The attached `dictionaries/zh-CN.json` is a working
   starting corpus: **343 UI strings plus 30 pattern rules** for dynamic text such as
   `Thought for 12s` → `思考了 12 秒`, `Worked for 4m 31s and made 20 tool calls` →
   `用时 4 分 31 秒，共 20 次工具调用`, `Open diff: 780 additions, 71 deletions` → `查看改动：+780 −71`,
   and `Sep 18, 2026` → `2026年9月18日`. It was produced by walking every screen of the app and
   enumerating the strings, so it covers the sidebar, composer, workspace/folder picker, model and
   provider selectors, the search palette, the schedule and customize pages, and all six settings
   sub-pages.
4. Explicitly out of scope for translation: provider names, model names, tool identifiers
   (`read_files`, `ask_question`, …), file paths and example values — the corpus already leaves these alone.

## Describe alternatives you've considered

* **Overlay/patch tools.** Work, but require a per-user launcher, a local debug port, and break whenever
  a string changes. They are also unmaintainable at the pace the app evolves.
* **Community forks.** They exist for the VS Code extension, but a fork drifts from upstream immediately
  and users lose the auto-updater.
* **Following the OS locale only.** Better than nothing, but a language setting is what users actually ask
  for; `navigator.language` in WebView2 is not reliably the OS language either.

## Additional context

Two strings worth deciding on early, because they are assembled from separate text nodes and read
awkwardly when translated piecewise:

* "Pick the icon Cline shows in the **Taskbar**."
* "Ready to use with **Cline Usage-Billing, ClinePass** on models that support it — no extra setup needed."

Using full-sentence message keys instead of concatenated fragments avoids this class of problem in every
locale.

I'm happy to submit the dictionary as a PR and to keep it updated from the overlay project's audit tooling
until an official locale exists.
