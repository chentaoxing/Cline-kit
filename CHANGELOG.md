# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); dictionary data changes are versioned inside
each `dictionaries/<locale>.json` rather than here.

## [0.4.2] - 2026-09-21

### Fixed

- **A real mouse click on the language row now registers.** The row was rebuilding itself on every
  refresh, and rebuilding is itself a DOM change, which queued another refresh - so the button under
  the pointer was being destroyed and replaced continuously, and press-and-release never landed on
  the same element. This is why "clicking does nothing" survived three rounds of debugging: a
  scripted click dispatches against a node that exists for one more microsecond and always appeared
  to work.
- The row is built once and afterwards only its text and selected state are updated, and only when
  something actually changed. Measured: 0 rebuilds per 3 s while untouched (was continuous).
- The "will not persist" note appeared the instant you clicked, blaming a background service that
  was about to handle the request. It now waits until the request has actually aged out.

### Added

- `scripts/language-picker-check.js` clicks with dispatched mouse events at the button coordinates
  and fails if the row rebuilds itself more than twice in three seconds, so this class of bug cannot
  come back looking green.

## [0.4.1] - 2026-09-21


### Fixed

- **`ckit install` now re-scans every launch path on every run.** It used to re-point only the
  shortcuts it had backed up the first time, so a shortcut or taskbar pin created afterwards kept
  launching a plain Cline and nothing said so. The scan also now covers taskbar pins
  (`Quick Launch\User Pinned\TaskBar`), which were missed entirely - for a desktop-app tool that is
  most people's actual launch path.
- `ckit doctor` distinguishes "Cline is not running" from "Cline is running but was not started by
  the kit". The second case is the one that cost the maintainer three rounds of debugging: the open
  window keeps whatever overlay it was injected with, so the controls on screen can be an older
  build than the code on disk, and every test run against a *different* window still passed.
- `ckit install` prints what it found instead of one line: paths scanned, newly routed, already
  routed, and any it could not change (which now also sets a non-zero exit code).

### Notes

- An overlay window that is already open will not upgrade itself. After updating, close Cline and
  reopen it from the shortcut - `ckit doctor` will tell you when the window you have open is stale.

## [0.4.0] - 2026-09-21


### Changed

- **Switching the interface language inside Cline is now instant and needs no background service.**
  Every locale ships inside the injected payload, so a click translates the open window on the
  spot. Until now a click only wrote a request that the resident injector had to pick up - which
  meant that if the injector was not running, the control looked outright broken. That was the
  maintainer's own report: "界面语言切换点击了没用". The background service is now only
  responsible for persisting the choice to the config, and when it is absent the row says so
  without blocking the switch.
- Payload 59 KB -> 114 KB, because five dictionaries travel with it. The English key list is stored
  once and each locale is a value array aligned to it, so the cost is 74 KB rather than 112 KB.
- To keep that from being re-parsed every four seconds, the injector now probes the page's own
  build string and only re-sends the payload when it differs.

### Added

- `window.__ckitSetLocale(code)` / `__ckitLocale` / `__ckitLocales()` - the engine can change
  language inside the page, re-translating from the originals it already keeps per node.
- A 30th check asserts the payload still carries every locale and that each value array is aligned
  to the key list, so a future refactor cannot quietly reintroduce the background dependency.

### Fixed

- The language row reported a stall as a red error. With in-page switching that case is now about
  persistence, not about the click failing, so it reads as a note: the change applied, and it will
  not survive a restart until the service is running again.

## [0.3.1] - 2026-09-21


### Fixed

- **The language row now says so when nothing is applying the change.** Clicking a language with the
  background injector not running (Cline opened straight from `cline-app.exe`, or through
  `ckit attach`, which injects once and exits) used to look like a dead control: the request was
  written, nobody consumed it, and the row kept saying "Switching..." forever. After two injector
  cycles without progress it turns red and states the cause and the fix. Reported by the maintainer
  as "点击了没用", which was exactly this case.

### Added

- `START-HERE.txt` inside the portable package is bilingual, Chinese first - the audience for a
  no-terminal install is precisely the reader who does not want English setup instructions.
- `ckit doctor` surfaces the stall (`STUCK waiting for the injector`) rather than reporting a
  harmless `pending` as if it were progress.

## [0.3.0] - 2026-09-21


### Added

- **A portable package that needs nothing installed**: `cline-kit-vX.Y.Z-portable-win.zip` carries
  its own Node runtime, so the whole setup is unzip-and-double-click-`install.cmd`. This closes the
  gap every previous route had - npm, the plain zip and source all assumed Node was already on
  `PATH`, which is exactly what someone who chose a desktop app over a command line does not have.
  The bundled binary is pinned by SHA-256 in `scripts/portable-node.json` and CI re-checks that pin
  against nodejs.org's own `SHASUMS256.txt` before packaging, because an unchecked 84 MB executable
  inside a release we hand to strangers is a supply-chain risk, not a convenience. Node's MIT
  licence and provenance travel in `THIRD-PARTY-NODE.md`.
- `scripts/make-portable.js` assembles it, and refuses to produce a package whose runtime does not
  report the pinned version or whose entries contain backslash paths.
- `scripts/npm-auth.ps1` keeps the local maintenance token in the Windows Credential Manager (the
  same store `gh` uses) instead of a plaintext `~/.npmrc`, materialising a one-off npmrc only for the
  lifetime of the command it runs.
- The ship-clean check now fails on an `npm_`-shaped token anywhere in the tree, and a 29th check
  verifies the Node pin is self-consistent and satisfies `engines.node`.

### Changed

- The portable zip is the recommended install route in both READMEs; npm moves to second and is
  described as what to use when you already have Node.

### Known limitations

- `npm deprecate cline-kit@0.1.0` cannot be done without an interactive authentication step: npm
  returns 401 EOTP / browser-auth-required even with a bypass-2FA package token, and the website's
  Deprecate control is all-versions. 0.1.0 therefore keeps its missing provenance on purpose - the
  package has no external downloads and `latest` points at 0.3.0.

## [0.2.1] - 2026-09-21


### Changed

- **zh-TW dictionary v3**: the send action was rendered two different ways in the same locale
  (發送 in four strings, 送出 in four others). It is now 傳送, which is both what a zh-TW reader sees
  in Microsoft and Google products for that button and, more importantly, self-consistent.
- Locale terminology was cross-checked against professional human localizations - the MIT-licensed
  `microsoft/vscode-loc` packs (zh-hant/ja/ko) and the MPL-2.0 Firefox localizations (vi, since no
  VS Code Vietnamese pack exists). `scripts/terminology-crosscheck.js` reports divergences and
  changes nothing; [`docs/terminology.md`](docs/terminology.md) records the sources, the coverage
  limits, and every divergence that was reviewed and deliberately kept (會話 for a chat session
  rather than Microsoft's 工作階段, 작업 공간 over 작업 영역, 스킬 for a product noun). One item is
  marked genuinely arguable rather than settled: 智慧代理 for "agent".
- NOTICE no longer claims nothing was taken from third-party translation projects, which stopped
  being true the moment a term was adopted from one.


## [0.2.0] - 2026-09-21


### Added

- **`language-picker` feature - the interface language is now chosen inside Cline.** Settings gains an
  "Interface language" row under Dark mode, built from the same markup as the rows around it, listing
  each language in its own script (English / 日本語 / 한국어 / Tiếng Việt / 简体中文 / 繁體中文).
  Clicking writes one pending intent into `localStorage`; the resident injector consumes it on its next
  cycle, stores it as the configured dictionary, and re-injects, so the open window follows in ~4 s with
  no reload and the choice survives a restart. `ckit feature disable language-picker` removes the row.
- `none` / `English` as a first-class language: run the overlay for the sidebar only and leave every
  string Cline shipped. Available in the app row, `ckit locales none` and `--dictionary=none`; with it
  selected `ckit update` reports "translation is off" instead of fetching.

### Changed

- The terminal is now the secondary route, not the only one: `ckit locales`, `--help` and both READMEs
  point at Settings first, and `ckit install` / the first `ckit start` say "pick it inside Cline".
- Language names are listed in the language they name. `label` inside a dictionary is that language's
  own wording (English for the machine-assisted packs), so a list built from it read as
  "简体中文 / Japanese / Korean" - a translation of whatever is on screen instead of a choice.
- Per-feature build hashes now cover the feature's **config** as well as its source. Keyed on source
  alone, a locale switch left `language-picker` running with the previous `current` until a full reload.
- `ckit doctor` summarises each feature with its own numbers instead of assuming the sidebar's, and a
  feature that is only mounted some of the time (a Settings row) no longer reads as a failure.
- The overlay leaves its own UI alone: nodes marked `data-ckit-ui` are skipped by the translator
  (memoised per node), which is what keeps the language row from being re-translated by itself.
- `npm test` is 28 checks: feature text is compared against **every** dictionary and every feature,
  the picker's choice list and native names are pinned, `none` is verified as a real setting, and a
  config-only change is required to bump the payload version.

## [0.1.2] - 2026-09-21

### Added

- `ckit locales` — lists the interface languages that ship with the kit (code, native name, string
  count, dictionary version, `*` on the active one) and `ckit locales <code>` switches to one. Language
  choice used to be reachable only through `ckit config --dictionary=<code>`, which no one finds without
  reading the middle of the README; the old flag still works and writes the same field.
- `ckit install` prints the current language and the switch command every time, and the first successful
  `ckit start` says it once (`hintLanguageShown` in `%APPDATA%\cline-kit\config.json`).
- `scripts/cli-locale-switch-check.js` — drives the CLI as a subprocess and probes the live DOM, so the
  check covers the command a user types rather than the internal config write.

### Changed

- `npm test` is 25 checks: the new one asserts every bundled locale appears in `ckit locales`, that
  `--help` documents each command, and that an unknown code fails instead of storing a broken language.

## [0.1.1] - 2026-09-20

### Changed

- First npm publication is live: `cline-kit@0.1.0` was bootstrapped with a one-time granular token
  that was deleted immediately afterwards, and the package now carries an **OIDC trusted publisher**
  (`chentaoxing / Cline-kit / release.yml`). Every later version is published by the release
  workflow itself - no npm token or repository secret exists or is needed.
- `publishConfig` pins `registry.npmjs.org` so a contributor whose `.npmrc` points at a mirror cannot
  publish to the wrong place.

## [0.1.0] - 2026-09-20

First public release. Windows only.

### Added

- **`sidebar-groups` feature** — keeps every registered Cline workspace visible in the sidebar's
  project grouping. Cline natively lists only folders that already have sessions, so registered-but-empty
  projects are simply absent. Empty projects get a native-styled group with an "open this project" action
  that drives Cline's own workspace picker (chip → search → result row) rather than rewriting its storage.
- `ckit` CLI: `start`, `stop`, `status`, `doctor`, `attach`, `install`, `uninstall`, `update`, `audit`,
  `features`, `feature enable|disable`, `dict`, `config`.
- Overlay engine (`src/engine.js`): whole-string text-node replacement plus `placeholder`, `aria-label`
  and `title` attribute translation, driven by a `MutationObserver` with a 1.2 s rescan for portals.
- Five locale dictionaries in `dictionaries/`: **zh-CN** (reference, 476 strings + 6 prefix rules +
  24 regex rules, proofread against the running app), plus **zh-TW**, **ja**, **ko**, **vi** carrying the
  same key set. Switch with `ckit config --dictionary=ja`; the change applies to the open window with no
  reload, and `ckit update` follows whichever locale is selected.
- Locale authoring pipeline: `scripts/new-locale.js` (skeleton copied from the reference key set),
  `scripts/apply-locale.js` (fills values from a flat map so nobody hand-edits the JSON),
  `scripts/build-zh-tw.js` (OpenCC s2tw plus a Taiwan software term table), and
  `scripts/locale-switch-check.js` (proves each locale reaches the live DOM).
- `scripts/selftest.js` (`npm test`, 24 dependency-free checks): path/label/container logic, registry
  parsing and key-version discovery, dictionary schema validation, locale completeness against the
  reference, payload versioning, and a ship-clean check that fails on a personal profile path, this
  machine's username, a GitHub token or a stray e-mail inside shipped files.
- `ckit doctor` — asks the live webview what is actually installed (payload build, per-feature build,
  rows added vs registered workspaces, dictionary sources, idle DOM write rate) instead of trusting what
  the launcher intended, so a Cline update that renames a class shows up as a FAIL rather than an empty
  sidebar.
- `ckit attach --port=N` — inject once into a Cline that already exposes a debug port, for anyone who
  keeps their own launcher and does not want this tool to own the shortcut.
- Feature-plugin mechanism: `src/features/` with per-feature toggles that hot-apply within ~4 s, and
  shared pure helpers in `src/features/sidebar-groups.logic.js`.
- Cline path auto-detection: running process → registry uninstall entries → common install directories →
  `PATH`, with `ckit config --cline-path` as the override.
- Random loopback debug port per session; never written as a system-wide environment variable.
- Installer that repoints existing Start Menu / Desktop Cline shortcuts at a hidden launcher, storing the
  original target so `ckit uninstall` restores it exactly.
- Optional dictionary updates from a configurable raw GitHub URL, with strict validation and offline
  fallback; `ckit config --auto-update=off` removes all network access.
- Local override file (`%APPDATA%\cline-kit\<locale>.local.json`) that wins over bundled and cached data.
- `ckit audit` — walks the screens over CDP, filters hidden-but-mounted panels by hit-testing each node,
  and reports only strings the dictionary does not cover.
- `ckit.cmd` so a release-zip download has an entry point without a global install.
- CI: `npm test` plus a CLI smoke pass on tag, a portable Windows zip artifact, and `npm publish` through
  npm's OIDC trusted publishing - the repository holds no npm credential.

### Changed

- Positioned as **Cline-kit**, an enhancement kit: the sidebar behaviour is the product and localisation
  is one optional layer riding the same injection channel. The npm package, the checkout folder and the
  `%APPDATA%` state directory stay lowercase `cline-kit` because npm ids cannot contain capitals.
- `sidebar-groups` keeps project grouping on (Cline does not persist it), but yields for the rest of the
  session as soon as the user touches Cline's own sort control, with a 6 s cooldown so a mode-detection
  mismatch cannot turn into a click loop.
- Workspaces are recognised as *projects* or *containers* by structure: a registered path that contains
  other registered paths, or sits inside the detected install directory, is not a project. No per-machine
  hardcoded paths; `ckit config --hide=<path>` adds an exception.
- Registry access follows the highest `cline.code.workspace-selection.vN` key instead of pinning v2
  (`ckit config --storage-key=` forces one), and drops non-string entries.
- Project labels are generated across the whole registry: a duplicate folder name reads
  `LLM (workspace)`, further collisions get a counter, and every row's tooltip is the full path. Rows we
  cannot be certain are absent from the native list no longer claim "no sessions yet".
- The workspace-chip lookup matches structurally (anything outside the sidebar container) instead of
  guessing `left > 280px`, and the picker list matches `max-h-*` instead of `max-h-48`.
- CLI output, help text and the feature title are English-first; Chinese instructions live in
  `README.zh-CN.md` and `docs/`.
- The injector no longer runs with `src/` as its working directory; that locked the checkout so files
  could not be renamed or replaced while it was alive.

### Fixed

- Changing locale mid-session left the previous language on screen, because the overlay kept no record of
  what it had replaced. The engine now stores the original text per node and attribute and re-translates
  from English when the dictionary changes; a string the new locale lacks falls back to English instead
  of staying translated.
- An identical value is never written back. That one missing comparison was enough for the observer and
  the translator to chase each other's mutations and freeze the webview; `ckit doctor`'s idle write-rate
  check now surfaces that class of bug instead of hanging the app.
- CDP commands time out. A wedged or navigating renderer used to hang `ckit status` / `doctor` / `audit`
  indefinitely; they report FAIL now.
- Two workspaces with the same folder name collapsed into a single row; they are now both listed.
- Payload re-evaluation used to fail silently on the second injection of the same document
  (`Identifier 'DICT' has already been declared`), which killed every hot update; the payload is wrapped
  in its own closure and evaluate errors are logged and reported.
- The engine's reload guard keyed on the dictionary version only, so editing the engine itself never took
  effect; it now keys on the engine build hash plus the dictionary version and language.
- Remote dictionaries are rejected when a rule pattern contains a nested quantifier (`(a+)+`), which
  would otherwise be compiled inside the webview.
- Launcher scripts are written with a BOM (`launch-cline-kit.ps1` UTF-8, `.vbs` UTF-16LE); without them
  Windows read the install path as ANSI and the shortcut silently did nothing on non-ASCII paths.
- PowerShell path comparisons used `JSON.stringify`, which leaves doubled backslashes that PowerShell
  keeps literally, so shortcut detection matched nothing; paths are now single-quoted literals.

### Known limitations

- Windows only: the injection route relies on `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`.
- Launch through the kit. Opening `cline-app.exe` directly has no debug port, so you get plain Cline.
- Selectors are Cline's internal class names, not a public API; a Cline redesign needs `sidebar-groups`
  updated (`ckit doctor` tells you when it stopped matching).
- zh-TW / ja / ko / vi are complete but machine-assisted and not reviewed by native speakers; zh-CN is the
  only corpus proofread against the running app.
- Per-model description strings from the remote provider catalogue stay English.
- Provider, model, product and tool-identifier names are deliberately never translated.
- Changing workspace makes Cline rebuild its window (new process, default geometry): that is Cline's own
  behaviour, not the overlay's.
