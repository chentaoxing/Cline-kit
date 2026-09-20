# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dictionary data changes are versioned inside
`dictionaries/zh-CN.json` rather than here.

## [0.1.0] - 2026-09-20

First public release.

### Added

- `cline-zh` CLI: `start`, `stop`, `status`, `install`, `uninstall`, `update`, `audit`, `dict`, `config`.
- Overlay engine (`src/engine.js`): whole-string text-node replacement plus `placeholder`, `aria-label`
  and `title` attribute translation, driven by a `MutationObserver` with a 1.2 s rescan for portals.
- Declarative zh-CN dictionary (`dictionaries/zh-CN.json`): 343 entries, 6 prefix rules, 24 regex rules
  for dynamic strings (thinking duration, tool-call counts, diff counts, dates, model IDs).
- Cline path auto-detection: running process → registry uninstall entries → common install directories →
  `PATH`, with an explicit `config --cline-path` override.
- Random loopback debug port per session; never written as a system-wide environment variable.
- Installer that repoints existing Start Menu / Desktop Cline shortcuts at a hidden launcher, storing the
  original target so `uninstall` restores it exactly.
- Optional dictionary updates from a configurable raw GitHub URL, with strict validation and offline
  fallback; `--auto-update=off` disables all network access.
- Local override file (`%APPDATA%\cline-zh\zh-CN.local.json`) that wins over bundled and cached data.
- `cline-zh audit`: walks every screen over CDP, filters out hidden-but-mounted panels by hit-testing each
  node, and reports only strings the dictionary does not cover.

### Known limitations

- Windows only (the injection route relies on a WebView2 environment variable).
- Per-model description strings from the remote provider catalogue remain English.
- Provider, model, product and tool-identifier names are deliberately not translated.
