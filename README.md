# Cline-kit

Enhancements for the **Cline desktop app** on Windows, delivered as a runtime overlay — no patched
binaries, no fork.

[中文说明](README.zh-CN.md)

*The product name is **Cline-kit**; the npm package, the on-disk folder and the `%APPDATA%` state
directory are lowercase `cline-kit` because npm ids cannot contain capitals. The CLI is `ckit`.*

**Flagship feature:** Cline's sidebar project groups only show folders that already have sessions.
Every project you registered but have not opened yet is simply invisible. `cline-kit` keeps all of
them listed, with the same styling as the native groups, and lets you switch into an empty project
straight from the sidebar.

**Secondary feature:** UI locale packs — 简体中文 (reference, proofread), 繁體中文, 日本語, 한국어,
Tiếng Việt, plus an `English` opt-out. Pick one inside Cline itself: Settings gains an **Interface
language** row. Locales exist because the same injection channel can carry them — they are not what
the project is for.

## The sidebar problem

Native Cline groups sessions by project (the `Sort sessions: Time ⇄ Project` toggle), but the group
list is derived from *existing sessions*. Register 17 project folders, keep sessions in 3 of them, and
the sidebar shows 3. The `sidebar-groups` feature fixes that:

| | before | after |
| --- | --- | --- |
| registered projects shown | 3 | 17 |
| projects without sessions | hidden | listed and expandable, marked "No sessions yet" |
| switching into an empty project | not possible from the sidebar | one click, driven through Cline's own workspace picker |

Nothing is written into Cline's storage: switching a project drives the app's own picker (chip →
search → result row), so the behaviour is identical to doing it by hand.

## How it works

```
ckit start
  ├── launches cline-app.exe with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<random>
  ├── connects to the DevTools endpoint on 127.0.0.1
  └── a keep-alive injector installs engine.js + enabled features (+ locale data when a dictionary is loaded)
        └── MutationObserver keeps the project groups present and, with a locale active,
            replaces English text nodes and placeholder/aria-label/title attributes
```

`cline-app.exe` is never modified: signature, install directory and auto-update all stay as shipped.
Feature code and locale data are independent — run cline-kit for the sidebar only, for locales only,
or both.

## Requirements

* Windows 10/11 (macOS/Linux not supported yet — see [Limitations](#limitations))
* [Node.js](https://nodejs.org) 20.10 or newer (global `WebSocket` and `fetch`) — not needed if you use the
  portable zip, which bundles its own runtime
* The Cline desktop app installed (verified against v0.0.32)

## Install

Four routes, same tool. None of them touch `cline-app.exe`.

**1. Portable zip — nothing to install, no Node needed (recommended)**

Download `cline-kit-vX.Y.Z-portable-win.zip` from
[Releases](https://github.com/chentaoxing/Cline-kit/releases), unzip it somewhere that will stay put,
and **double-click `install.cmd`**. That's the whole setup: it points your existing Cline shortcut at
the kit, and from then on you open Cline exactly as before. No terminal, no PATH, and the folder
carries its own Node runtime (see [`scripts/portable-node.json`](scripts/portable-node.json) — the
binary's SHA-256 is pinned and re-checked against nodejs.org's own list during the build).

`ckit.cmd locales` and `ckit.cmd uninstall` live in the same folder.

**2. npm — if you already have Node.js 20.10+**

```bash
npm install -g cline-kit
ckit install                # point your existing Cline shortcut at the kit launcher
ckit start                  # launch Cline with the enhancements now
```

Worth it when you want `npm update -g cline-kit` and a `ckit` on PATH.

**3. Release zip without the runtime**

`cline-kit-vX.Y.Z-win.zip` is the same package minus the bundled Node, for anyone who would rather not
carry an 84 MB runtime. Unzip and run `ckit.cmd install` from that folder.

**4. From source (contributing)**

```bash
git clone https://github.com/chentaoxing/Cline-kit.git
cd cline-kit
npm install -g .            # or call it directly: node src/cli.js <command>
npm test                    # 29 checks, no dependencies
```

Then in every case:

```bash
ckit doctor                 # confirms the overlay is live inside the running window
ckit locales                # optional: list / switch the interface language
```

`ckit install` locates the Cline shortcut in the Start Menu / Desktop, saves its original target in
`%APPDATA%\cline-kit\config.json`, and repoints it at a hidden launcher. Opening Cline the normal way
then gives you the enhanced sidebar. If you would rather keep your own launcher, skip `install` and run
`ckit start` (or `ckit attach --port=N` against a Cline you started with a debug port).

## Usage

| Command | What it does |
| --- | --- |
| `ckit start` | Launch Cline with the overlay attached (`--restart` closes the running instance first) |
| `ckit stop` | Stop the background injector; Cline itself is untouched |
| `ckit status` | Detected Cline path, debug port, injector process, loaded build version |
| `ckit doctor` | Ask the live window what is really installed: payload build, rows added, native groups |
| `ckit attach` | Inject once into a Cline you started yourself (`--port=N`), without owning the shortcut |
| `ckit features` | List feature plugins and whether each is on |
| `ckit feature enable\|disable <id>` | Toggle a feature (applies within ~4 s, no restart) |
| `ckit locales` | List the bundled interface languages |
| `ckit locales <code>` | Switch language — e.g. `ckit locales ja` (applies within ~4 s, no restart) |
| `ckit install` / `uninstall` | Repoint / restore your Cline shortcut |
| `ckit update` | Pull the latest locale dictionary from GitHub (`--force` to check now) |
| `ckit audit` | Walk the UI and list strings still in English |
| `ckit dict` | Dictionary statistics and the local override path |
| `ckit config` | Inspect or set `--cline-path`, `--port`, `--auto-update=on\|off`, `--dictionary=<code>` |

### Choosing a language

**In the app:** open Cline's Settings (the gear at the bottom of the sidebar) and use the **Interface
language** row. It sits under Dark mode, looks like its neighbours, and takes effect in about four
seconds — no restart, and the choice is remembered. `English` there means "change nothing".

**From the terminal**, which is the same setting:

```bash
ckit locales          # what ships, how many strings each covers, which one is active
ckit locales ja       # switch; the open window changes within ~4 s, no restart
ckit locales none     # stop replacing Cline's own text
```

`ckit install` prints the current language and this command, and the first `ckit start` says it once.
`ckit config --dictionary=<code>` is the equivalent low-level write. Once a non-default locale is
selected, `ckit update` hot-updates *that* dictionary.

The row is added by this kit — Cline has no language setting of its own. Turn it off with
`ckit feature disable language-picker`.

## Features

`ckit features` shows the live list.

* **`sidebar-groups`** (on by default) — the always-listed project groups described above. It decides
  what counts as a project on its own: a registered path that contains other registered paths, or sits
  inside the app's install directory, is treated as a container and not listed. No per-machine
  configuration is needed. If you click Cline's own sort control, your choice wins for the rest of the
  session; otherwise the kit keeps project grouping on. Two projects that share a folder name are
  labelled with their parent folder - `LLM (workspace)` - and every row carries the full path as its
  tooltip. Design notes: [`docs/features.zh-CN.md`](docs/features.zh-CN.md).
* **`language-picker`** (on by default) — the Interface language row inside Cline's own Settings page.
  See [Choosing a language](#choosing-a-language).
* **locale packs** (`dictionaries/<locale>.json`) — whole-string text replacement only, so model
  names, provider names, tool identifiers and code cannot be mangled. The corpus is 476 strings plus
  30 pattern rules, built by combining a UI walk with extraction from the app's own source. Five
  dictionaries ship: **zh-CN** (reference, proofread against the running app), **zh-TW**, **ja**,
  **ko**, **vi** - complete but machine-assisted and *not* reviewed by native speakers, so a pull
  request fixing a term is genuinely welcome. Choose one in Cline's Settings, or with
  `ckit locales` — see [Choosing a language](#choosing-a-language). Terminology was cross-checked against
  professional human localizations and the deliberate differences are listed in
  [`docs/terminology.md`](docs/terminology.md); authoring guide:
  [`docs/dictionary-pipeline.zh-CN.md`](docs/dictionary-pipeline.zh-CN.md).

## Limitations

* **Windows only.** The injection route relies on a WebView2 environment variable; macOS/Linux use
  WKWebView/WebKitGTK and need a different mechanism.
* **No standalone executable on purpose.** Packaging Node inside a `.exe` would remove the Node
  requirement, but unsigned binaries attract SmartScreen and antivirus warnings, and the injector has
  to keep talking to a local DevTools port anyway. npm or the zip are the supported routes.
* **Launch through the kit.** Opening `cline-app.exe` directly (or via a shortcut that was never
  repointed) has no debug port to attach to, so you get plain Cline.
* **Cline updates can break things.** If the app renames a label, the locale leaves it in English; if
  it restructures the sidebar, `sidebar-groups` needs updating. Run `ckit audit` and open an issue.
* **The language row is ours, not Cline's.** It is inserted into the Settings page next to Dark mode,
  which is the right place to look but not a location Cline documents. If that page is restructured,
  `language-picker` needs its anchor updated (`ckit doctor` reports whether the row is present);
  `ckit feature disable language-picker` removes it.
* **Per-model description blurbs stay English** — free-form text from a remote provider catalogue.
* **Same-named projects.** Cline's own group headers expose only the folder name, never the path, so if
  the registry holds two different `LLM` folders and one already has a native group, the kit cannot tell
  which one that is. It lists both, qualified with the parent folder, and drops the "no sessions yet"
  line on those rows rather than asserting something it does not know.
* Proper nouns are never translated: Cline, provider and model names, tool identifiers, paths.

## Security

`ckit start` opens a DevTools port on `127.0.0.1` for as long as Cline runs; any process running as
you can drive the Cline UI through it. The port is random per session, loopback-only, and never set as
a system-wide environment variable. Remote dictionaries are validated (shape, size, anchored regexes)
and rejected outright if malformed. Details in [SECURITY.md](SECURITY.md).

## Uninstall

```bash
ckit uninstall                    # restores the original Cline shortcut and stops the injector
del /q "%APPDATA%\cline-kit"      # optional: remove config, cache, logs
npm uninstall -g cline-kit
```

## Relationship to other projects

[`JACK5920/cline-desktop-zh`](https://github.com/JACK5920/cline-desktop-zh) and
[`ExSchwi/cline-desktop-zh-cn`](https://github.com/ExSchwi/cline-desktop-zh-cn) cover the **language**
half of this well and are worth using if all you want is a Chinese UI;
[`cline-chinese`](https://github.com/HybridTalentComputing/cline-chinese) is a fork of the **VS Code
extension**, a different surface again. cline-kit overlaps them only on locales — its reason to exist
is the sidebar/project behaviour, plus the packaging (reversible installer, path auto-detection,
random port, feature toggles, `ckit audit`). Design credit is recorded in [NOTICE](NOTICE).

The better long-term outcome is upstream: an official language setting, and a sidebar that lists all
registered projects. See [`docs/upstream-i18n.md`](docs/upstream-i18n.md) for the threads we have
engaged on ([#12518](https://github.com/cline/cline/issues/12518),
[#13811](https://github.com/cline/cline/pull/13811)).

## License

MIT — see [LICENSE](LICENSE). [NOTICE](NOTICE) records provenance: unofficial project, no upstream code
or assets shipped, English locale keys are Cline's own UI strings read from `apps/examples/desktop-app`
in the Apache-2.0 [`cline/cline`](https://github.com/cline/cline) repository, translated values are
original. Not affiliated with, endorsed by, or part of Cline.
