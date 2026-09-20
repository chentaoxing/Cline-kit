# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dictionary data changes are versioned inside
`dictionaries/zh-CN.json` rather than here.

## [0.1.0] - 2026-09-20

First public release.

### Repositioned

Renamed from `cline-zh-overlay` to **`cline-kit`**: the sidebar/project behaviour is the product, and
localisation is an optional layer riding the same injection channel. The CLI is now `ckit` (long alias
`cline-kit`). Runtime state moved to `%APPDATA%\cline-kit` with a one-time migration of config, cache and
logs from the old `cline-zh` directory. Browser globals and DOM markers were renamed to match
(`__clineKitFeature*`, `data-ckit-feat`, `__ckitEngineBuild`); launcher files became
`launch-cline-kit.{ps1,vbs}`. Existing installs recover by re-running `ckit install`, which repoints the
shortcut at the new launcher.

### Added

- `ckit doctor` — asks the live webview what is actually installed (payload build, per-feature build,
  rows added, native groups, dictionary source) instead of what the launcher intended, so a Cline
  update that renames a class shows up as a FAIL rather than an empty sidebar.
- `ckit attach --port=N` — inject once into a Cline that is already exposing a debug port, for people
  who keep their own launcher or run another overlay and do not want this one to own the shortcut.
- `scripts/selftest.js` (`npm test`) — 17 dependency-free checks over the path/label/container logic,
  registry parsing, dictionary validation and payload versioning.
- Path, label and filtering helpers moved to `src/features/sidebar-groups.logic.js`, shared by the
  injected script and the tests.

### Fixed

- `sidebar-groups` dropped every project whose folder name was already in use: two workspaces called
  `LLM` on different drives produced one row. Collisions now show `parent\name`, and if the parents
  collide as well the full path, with the whole path in each row's tooltip.
- Remote dictionaries are rejected when a rule pattern contains a nested quantifier (`(a+)+`), which
  would otherwise be compiled inside the webview.
- The release workflow still named its artifact `cline-zh-overlay`.
- CLI output and help text are English, matching the tool's name and position; the `sidebar-groups`
  title reads English-first.
- Dictionary v5: dropped a `featureText` key the feature stopped using (the tooltip now carries the
  full path). `scripts/selftest.js` fails if the dictionary and the feature's `t()` keys drift apart.

### Changed

- `sidebar-groups` no longer enables project grouping once per page load. It keeps grouping on, but
  yields for the rest of the session as soon as the user clicks Cline's own sort control, with a 6 s
  cooldown so a mode-detection mismatch cannot turn into a click loop.
- the injector no longer uses `src/` as its working directory; that locked the checkout and made
  renaming or replacing files fail with 'device or resource busy' while it was alive.
- package description, keywords and README rewritten around the sidebar feature, with a before/after
  table; SECURITY, NOTICE, docs and the release checklist synced to the new name.

### Added

- `ckit` CLI: `start`, `stop`, `status`, `install`, `uninstall`, `update`, `audit`, `dict`, `config`.
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
- Local override file (`%APPDATA%\cline-kit\zh-CN.local.json`) that wins over bundled and cached data.
- `ckit audit`: walks every screen over CDP, filters out hidden-but-mounted panels by hit-testing each
  node, and reports only strings the dictionary does not cover.

### Known limitations

- Windows only (the injection route relies on a WebView2 environment variable).
- Per-model description strings from the remote provider catalogue remain English.
- Provider, model, product and tool-identifier names are deliberately not translated.
