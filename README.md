# cline-kit

Enhancements for the **Cline desktop app** on Windows, delivered as a runtime overlay — no patched
binaries, no fork.

[中文说明](README.zh-CN.md)

**Flagship feature:** Cline's sidebar project groups only show folders that already have sessions.
Every project you registered but have not opened yet is simply invisible. `cline-kit` keeps all of
them listed, with the same styling as the native groups, and lets you switch into an empty project
straight from the sidebar.

**Secondary feature:** UI locale packs (简体中文 today; 繁體中文 / 日本語 / 한국어 / Tiếng Việt use the
same format). Locales exist because the same injection channel can carry them — they are not what the
project is for.

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
* [Node.js](https://nodejs.org) 20.10 or newer (global `WebSocket` and `fetch`)
* The Cline desktop app installed (verified against v0.0.32)

## Install

```bash
git clone https://github.com/CHANGE_ME/cline-kit.git
cd cline-kit
npm install -g .            # or run it directly: node src/cli.js
ckit install                # point your existing Cline shortcut at the kit launcher
ckit start                  # launch Cline with the enhancements now
```

`ckit install` locates the Cline shortcut in the Start Menu / Desktop, saves its original target in
`%APPDATA%\cline-kit\config.json`, and repoints it at a hidden launcher. Opening Cline the normal way
then gives you the enhanced sidebar.

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
| `ckit install` / `uninstall` | Repoint / restore your Cline shortcut |
| `ckit update` | Pull the latest locale dictionary from GitHub (`--force` to check now) |
| `ckit audit` | Walk the UI and list strings still in English |
| `ckit dict` | Dictionary statistics and the local override path |
| `ckit config` | Inspect or set `--cline-path`, `--port`, `--auto-update=on\|off` |

## Features

`ckit features` shows the live list.

* **`sidebar-groups`** (on by default) — the always-listed project groups described above. It decides
  what counts as a project on its own: a registered path that contains other registered paths, or sits
  inside the app's install directory, is treated as a container and not listed. No per-machine
  configuration is needed. If you click Cline's own sort control, your choice wins for the rest of the
  session; otherwise the kit keeps project grouping on. Two projects that share a folder name are
  labelled with their parent folder (whole path if even the parents match), and every row carries the
  full path as its tooltip. Design notes:
  [`docs/features.zh-CN.md`](docs/features.zh-CN.md).
* **locale packs** (`dictionaries/<locale>.json`) — whole-string text replacement only, so model
  names, provider names, tool identifiers and code cannot be mangled. The zh-CN corpus is 476 entries
  plus 30 pattern rules, built by combining a UI walk with extraction from the app's own source; see
  [`docs/dictionary-pipeline.zh-CN.md`](docs/dictionary-pipeline.zh-CN.md).

## Limitations

* **Windows only.** The injection route relies on a WebView2 environment variable; macOS/Linux use
  WKWebView/WebKitGTK and need a different mechanism.
* **Launch through the kit.** Opening `cline-app.exe` directly (or via a shortcut that was never
  repointed) has no debug port to attach to, so you get plain Cline.
* **Cline updates can break things.** If the app renames a label, the locale leaves it in English; if
  it restructures the sidebar, `sidebar-groups` needs updating. Run `ckit audit` and open an issue.
* **Per-model description blurbs stay English** — free-form text from a remote provider catalogue.
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
