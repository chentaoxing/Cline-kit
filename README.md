# cline-zh-overlay

Simplified Chinese UI for the **Cline desktop app** on Windows — without patching the app.

[中文说明](README.zh-CN.md)

## Why this exists

The Cline desktop app (v0.0.32 at the time of writing) has **no language setting** and ships no
localisation bundles: Settings → General only offers notifications, dark mode, font size, accent
colour, app icon, web search, CLI auto-update and telemetry. Forcing the WebView2 locale
(`--lang=zh-CN`) does nothing, and WebView2 refuses `--load-extension`, so a browser extension is not
a distribution route either. The app's own plugin surface (Tools / Plugins / Skills / Rules / MCP /
Hooks) extends the *agent*, not the renderer, so it cannot change UI strings.

This project takes the only remaining route that does not modify the binary: start Cline with a
private DevTools port and inject a translation overlay into the webview.

## How it works

```
cline-zh start
  ├── launches cline-app.exe with WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<random>
  ├── connects to the DevTools endpoint on 127.0.0.1
  └── keeps a small injector alive that installs src/engine.js + dictionaries/zh-CN.json
        └── MutationObserver replaces English text nodes and placeholder/aria-label/title attributes
```

Nothing is written into `cline-app.exe`; the app signature, install directory and auto-update all stay
untouched. The dictionary is data (JSON), not code.

## Requirements

* Windows 10/11 (macOS/Linux are not supported yet — see [Limitations](#limitations))
* [Node.js](https://nodejs.org) 20.10 or newer (needs the global `WebSocket` and `fetch`)
* Cline desktop app installed

## Install

```bash
git clone https://github.com/CHANGE_ME/cline-zh-overlay.git
cd cline-zh-overlay
npm install -g .        # or run the CLI directly: node src/cli.js
cline-zh install        # points your existing Cline shortcut at the Chinese launcher
cline-zh start          # launch Cline with the overlay right now
```

`cline-zh install` finds the Cline shortcut in the Start Menu / Desktop, saves its original target in
`%APPDATA%\cline-zh\config.json`, and repoints it at a hidden launcher. From then on, opening Cline
the normal way gives you Chinese.

## Usage

| Command | What it does |
| --- | --- |
| `cline-zh start` | Launch Cline with the overlay attached (`--restart` closes the running instance first) |
| `cline-zh status` | Detected Cline path, debug port, injector process, dictionary version |
| `cline-zh install` / `uninstall` | Repoint / restore your Cline shortcut |
| `cline-zh update` | Pull the latest dictionary from GitHub (`--force` to check now) |
| `cline-zh audit` | Walk the UI and list strings still in English — use this after a Cline update |
| `cline-zh dict` | Dictionary statistics and the path of your local override file |
| `cline-zh config` | Inspect or set `--cline-path`, `--port`, `--auto-update=on\|off` |

## Customising wording

Add or edit entries in `dictionaries/zh-CN.json`:

```json
{
  "entries":  { "Save": "保存" },
  "prefixes": [ { "from": "Model: ", "to": "模型：" } ],
  "rules":    [ { "pattern": "^Thought for (\\d+)s$", "out": "思考了 $1 秒" } ]
}
```

Matching is **whole string only** (no substring rewrites), so model names and code can't be mangled.
Rules are evaluated before prefixes, and `$1..$9` come from capture groups. Patterns must be anchored
(`^…$`) — remote dictionaries that fail validation are rejected.

For personal tweaks that should survive a tool update, put them in
`%APPDATA%\cline-zh\zh-CN.local.json`; local overrides win over the bundled and cached dictionary.

The running injector re-reads the dictionary every 4 seconds, so edits apply without restarting Cline.

## Limitations

* **Windows only.** The injection route depends on a WebView2 environment variable. On macOS/Linux
  Cline uses WKWebView/WebKitGTK, which needs a different mechanism.
* **Model blurbs stay English.** Per-model one-liners such as "Leading open-weights model" come from a
  remote provider catalogue with thousands of free-form sentences; no fixed dictionary can cover them.
* **Proper nouns are not translated** on purpose: Cline, ClinePass, Codex, MCP, provider and model
  names, tool identifiers such as `read_files`, folder names, and example values.
* **Cline updates can break strings.** When the app renames a label the overlay simply leaves it in
  English; run `cline-zh audit` and open an issue (or a PR) with the output.
* Opening Cline **directly** (double-clicking `cline-app.exe`, or a shortcut that was not repointed)
  gives an English UI, because there is no debug port to attach to.

## Security

`cline-zh start` opens a DevTools port on `127.0.0.1` for as long as Cline runs. Any process on the
same machine can drive the Cline UI through that port. The port number is random per session, is bound
to loopback only, and is not written as a system-wide environment variable. See
[SECURITY.md](SECURITY.md).

## Uninstall

```bash
cline-zh uninstall      # restores the original Cline shortcut and stops the injector
del /q "%APPDATA%\cline-zh"   # optional: remove config, cache and logs
npm uninstall -g cline-zh-overlay
```

## Contributing

The dictionary is the valuable part. Run `cline-zh audit` after using the app for a while, add the
missing strings to `dictionaries/zh-CN.json`, bump `version`, and open a PR.

There is also an active upstream request for official i18n — see
[`docs/upstream-i18n.md`](docs/upstream-i18n.md) for the existing threads ([#12518](https://github.com/cline/cline/issues/12518),
[#13811](https://github.com/cline/cline/pull/13811)), what we posted there, and the key finding that the
desktop app is not in the public Cline repo. Upstream support would make this tool unnecessary, which is
the better outcome.

## Relationship to other projects

**[cline-chinese](https://github.com/HybridTalentComputing/cline-chinese)** is a widely used
(Apache-2.0, ~660 stars) **fork of the VS Code extension** with translated source. It solves a different
problem on a different surface: it localises the IDE extension, and because it is a fork it tracks
upstream on its own release cadence (its latest release is `v3.46.9`, behind current upstream) and
requires installing a separate extension. It contains no desktop-app code.

This project covers the **desktop app**, does not fork anything, and keeps working across Cline updates
as long as the labels themselves don't change — but it is a runtime overlay, so it inherits the
limitations above and is strictly a stopgap until an official locale exists.

## License

MIT — see [LICENSE](LICENSE). This project is not affiliated with, endorsed by, or part of Cline.
