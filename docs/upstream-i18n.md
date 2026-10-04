# Upstream i18n status

What we asked Cline for, what we built ourselves, and where it stands. Last updated 2026-10-04.

## Existing upstream threads (do not file duplicates)

| Thread | Scope | State |
| --- | --- | --- |
| [#12518 — [Feature Request] 添加中文界面支持 / Add Chinese (Simplified) Language Support](https://github.com/cline/cline/issues/12518) | Chinese UI overall; community comments ask for **Cline Desktop** coverage | open, 14 comments, last activity 2026-10-04 — we answered all six community voices in the thread |
| [#13811 — Localize the VS Code extension (en, 简体中文, Español, Русский, 한국어)](https://github.com/cline/cline/pull/13811) | **VS Code extension only.** Adds `@cline/i18n` (i18next + JSON catalogues, 18 namespaces, ~1,258 keys × 5 locales), a `Display Language` setting, and `bun run translate -- --lang <locale>` | open, **`CONFLICTING` against main** as of 2026-09-21; `@cline/i18n` is therefore not merged and nothing can build on it |
| [#14337 — feat(desktop): add an interface-language setting to the desktop app](https://github.com/cline/cline/pull/14337) | **Desktop app, self-contained.** i18n foundation inside `apps/examples/desktop-app/webview` + a Language row in its own Settings + 5 locale catalogues (523 strings each) as data | ours, open as a draft, **`CONFLICTING` against main** as of 2026-10-04, no review yet |

We stopped waiting on #13811. It conflicts with `main` today and the desktop app has no i18n
dependency at all, so #14337 deliberately depends on nothing outside `apps/examples/desktop-app`. If
`@cline/i18n` lands first, that PR collapses into a thin adapter over it - the description says so.

## Key structural finding (corrected 2026-09-20)

**The desktop app IS in the public monorepo**: [`apps/examples/desktop-app`](https://github.com/cline/cline/tree/main/apps/examples/desktop-app)
— Tauri 2 (`src-tauri/`) plus a Next.js webview (`webview/`). When this was written its `package.json`
version was `0.0.32`, the build shipping on 2026-09-20; the app has moved since (0.0.43 on this machine
as of 2026-10-04), and the finding still holds: **no i18n dependency at all** (no i18next / intl /
locale files), which is why the UI is English-only and why forcing `--lang=zh-CN` does nothing.

An earlier version of this document claimed the desktop app was not in the repository (we had only looked
at the top level of `apps/`). That was wrong and we posted corrections on both upstream threads.

Consequence for strategy: because the desktop UI source is open and React-based, the highest-value
contribution is **an i18n foundation inside the desktop webview**, not growing another overlay corpus.
That is what #14337 does. The overlay stays useful as the interim for anyone who cannot wait for a
release, and as the carrier for features upstream has no reason to build - the always-visible project
groups in the sidebar being the main one.

## Community tools doing desktop Chinese localisation (surveyed 2026-09-20)

| Project | Created / updated | Coverage | Mechanism | License |
| --- | --- | --- | --- | --- |
| `JACK5920/cline-desktop-zh` | 09-15 / 09-16 | ≈531 (418 texts, 94 attrs, 12+5 patterns, 2 whole-element) | DOM injection + silent vbs launcher | MIT |
| `ExSchwi/cline-desktop-zh-cn` | 09-17 / 09-19 | 545 entries + 98 explicitly skipped | DOM injection + **per-Cline-version rule files** (`0.0.30`, `0.0.32`) with a documented fallback strategy, generated dictionary | Apache-2.0 (NOTICE: derived from upstream source) |
| this project | 09-20 → 10-04 | 523 whole-string entries + 8 prefixes + 24 rules, in **5 locales** (zh-CN reference, zh-TW, ja, ko, vi) | DOM injection + reversible installer covering every launch path, path autodetection, random loopback port, validated per-locale remote updates (regexes timed, not just shaped), an in-app language picker, `ckit doctor`, and a dependency-free selftest | MIT |

All three are permissively licensed, so approaches can be studied and reused with attribution. Note that
ExSchwi's dictionary is derived from upstream (Apache-2.0) source, so reusing its *content* requires
keeping their NOTICE attribution.

## What we posted

* [Comment on #12518](https://github.com/cline/cline/issues/12518#issuecomment-5747674854) and its
  [correction](https://github.com/cline/cline/issues/12518#issuecomment-5747750793).
* [Comment on #13811](https://github.com/cline/cline/pull/13811#issuecomment-5747674963) and its
  [correction](https://github.com/cline/cline/pull/13811#issuecomment-5747750921), which offers to open the
  desktop-webview port as a follow-up PR.
* On 2026-10-04 we answered **every community voice in #12518 individually**, each reply aimed at what
  that person actually asked for, and pointed them at `cline-kit` as the interim - with the caveats
  stated rather than glossed over (Windows only, dictionaries calibrated against 0.0.37, an overlay is a
  downgrade and upstream is still the real fix):
  [@liangneason](https://github.com/cline/cline/issues/12518#issuecomment-5980527668) — UI strings and
  "reply in Chinese" are separate concerns, the latter being `~/.cline/rules/*.md`, which the kit does
  not touch;
  [@MoJo-Spy](https://github.com/cline/cline/issues/12518#issuecomment-5980527661) — each of their Desktop
  asks (persisted switcher, coverage, unified i18n) answered one by one;
  [@Adgerr](https://github.com/cline/cline/issues/12518#issuecomment-5980527653);
  [@13111655587xl-jpg](https://github.com/cline/cline/issues/12518#issuecomment-5980527833) — told plainly
  that a Windows-only overlay is no help on macOS, and routed to #14337 for contributing translations;
  [@kesulxx](https://github.com/cline/cline/issues/12518#issuecomment-5980527676) — their v0.0.39
  binary/config findings agreed with, `ckit audit` offered as the operational answer to their "breaks on
  every Cline update" objection, and the 0.0.37 calibration stated up front;
  [@Muss0504](https://github.com/cline/cline/issues/12518#issuecomment-5980551652) — the original requester.

We deliberately did **not** open a new issue: #12518 already tracks the request, and a duplicate would
have split the discussion.

## Findings worth carrying into any desktop locale work

1. **Sentences split across DOM text nodes** read wrong when translated fragment-wise and need
   whole-sentence keys with interpolation:
   * `Pick the icon Cline shows in the **Taskbar**.`
   * `Ready to use with **Cline Usage-Billing, ClinePass** on models that support it — no extra setup needed.`
2. **Dynamic strings need ICU formatting**, not concatenation — Chinese word order can't be recovered:
   * `Thought for 12s` → 思考了 12 秒
   * `Worked for 4m 31s and made 20 tool calls` → 用时 4 分 31 秒，共 20 次工具调用
   * `Open diff: 780 additions, 71 deletions` → 查看改动：+780 −71
   * `2 configured · 220 available` → 已配置 2 个 · 可用 220 个
   * `Sep 18, 2026` → 2026年9月18日
3. **Never translate**: provider names, model names, tool identifiers (`read_files`, `ask_question`, …),
   file paths, example values.

## Corpus on offer

`dictionaries/zh-CN.json` — 523 whole-string entries + 8 prefix rules + 24 pattern rules, produced by
enumerating the rendered DOM of every desktop screen (sidebar, composer, search palette,
workspace/folder picker, model + provider selectors, schedule page, customize page including the built-in
tool descriptions, and all settings sub-pages), then merged with keys extracted from the app's own source.
`zh-TW`, `ja`, `ko` and `vi` carry the identical key set; their terminology was cross-checked against
professional human localizations (see [`terminology.md`](terminology.md)) but none of the four has been
read by a native speaker. It is MIT-licensed and can be relicensed to match Cline's Apache-2.0 for
upstreaming - #14337 already ships it as data.

## Where this stands now

* The desktop port is **open as our own PR** (#14337) rather than blocked behind #13811 - but it went
  **`CONFLICTING` against main** somewhere between 2026-09-21 and 2026-10-04, and it is still a draft
  with no review, so it needs a rebase before upstream can act on it. This matters because the
  2026-10-04 replies on #12518 point people at it.
* Extra locales are **already shipped** (five), as a pipeline rather than a workload -
  `scripts/new-locale.js` → translate → `apply-locale.js` → `npm test` → `locale-switch-check.js`.
* Still not done, still worth doing:
  - Adopt per-Cline-version rule files (the approach `ExSchwi` uses) so a broken dictionary degrades to
    the nearest verified version instead of failing silently. `ckit audit` catches the diff today, but
    only after someone runs it.
  - Re-run `ckit audit` after each Cline release and keep the corpus current until upstream wins.
  - Get #14337 out of draft only once their CI has actually run it - it has not been built or rendered
    in a real window by anyone yet, which the PR description states.
