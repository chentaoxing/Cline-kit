# Upstream i18n status

What we asked Cline for, and where it stands. Last updated 2026-09-20.

## Existing upstream threads (do not file duplicates)

| Thread | Scope | State |
| --- | --- | --- |
| [#12518 — [Feature Request] 添加中文界面支持 / Add Chinese (Simplified) Language Support](https://github.com/cline/cline/issues/12518) | Chinese UI overall; two community comments already ask for **Cline Desktop** coverage | open, created 2026-07-24 |
| [#13811 — Localize the VS Code extension (en, 简体中文, Español, Русский, 한국어)](https://github.com/cline/cline/pull/13811) | **VS Code extension only.** Adds `@cline/i18n` (i18next + JSON catalogues, 18 namespaces, ~1,258 keys × 5 locales), a `Display Language` setting, and `bun run translate -- --lang <locale>` | open, not draft, updated 2026-09-16 |

## Key structural finding (corrected 2026-09-20)

**The desktop app IS in the public monorepo**: [`apps/examples/desktop-app`](https://github.com/cline/cline/tree/main/apps/examples/desktop-app)
— Tauri 2 (`src-tauri/`) plus a Next.js webview (`webview/`), and its `package.json` version is
`0.0.32`, i.e. the build shipping today. It has **no i18n dependency at all** (no i18next / intl / locale
files), which is why the UI is English-only and why forcing `--lang=zh-CN` does nothing.

An earlier version of this document claimed the desktop app was not in the repository (we had only looked
at the top level of `apps/`). That was wrong and we posted corrections on both upstream threads.

Consequence for strategy: because the desktop UI source is open and React-based, the highest-value
contribution is **porting #13811's `@cline/i18n` into the desktop webview**, not growing another overlay
corpus. Overlay work remains useful as the interim and as the carrier for non-translation features.

## Community tools doing desktop Chinese localisation (surveyed 2026-09-20)

| Project | Created / updated | Coverage | Mechanism | License |
| --- | --- | --- | --- | --- |
| `JACK5920/cline-desktop-zh` | 09-15 / 09-16 | ≈531 (418 texts, 94 attrs, 12+5 patterns, 2 whole-element) | DOM injection + silent vbs launcher | MIT |
| `ExSchwi/cline-desktop-zh-cn` | 09-17 / 09-19 | 545 entries + 98 explicitly skipped | DOM injection + **per-Cline-version rule files** (`0.0.30`, `0.0.32`) with a documented fallback strategy, generated dictionary | Apache-2.0 (NOTICE: derived from upstream source) |
| this project | 09-20 | ≈373 (343 entries, 6 prefixes, 24 rules) | DOM injection + reversible installer, path autodetection, random loopback port, validated remote dictionary, `audit` | MIT |

All three are permissively licensed, so approaches can be studied and reused with attribution. Note that
ExSchwi's dictionary is derived from upstream (Apache-2.0) source, so reusing its *content* requires
keeping their NOTICE attribution.

## What we posted

* [Comment on #12518](https://github.com/cline/cline/issues/12518#issuecomment-5747674854) and its
  [correction](https://github.com/cline/cline/issues/12518#issuecomment-5747750793).
* [Comment on #13811](https://github.com/cline/cline/pull/13811#issuecomment-5747674963) and its
  [correction](https://github.com/cline/cline/pull/13811#issuecomment-5747750921), which offers to open the
  desktop-webview port as a follow-up PR.

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

`dictionaries/zh-CN.json` — 343 whole-string entries + 6 prefix rules + 24 pattern rules, produced by
enumerating the rendered DOM of every desktop screen (sidebar, composer, search palette,
workspace/folder picker, model + provider selectors, schedule page, customize page including the 11
built-in tool descriptions, and all six settings sub-pages). It is MIT-licensed and can be relicensed
to match Cline's Apache-2.0 for upstreaming.

## Next actions

* Open the upstream PR that wires `@cline/i18n` into `apps/examples/desktop-app/webview`, with a
  `Display Language` control in desktop Settings → General. This is the single highest-leverage move
  available and it makes the overlay's translation half obsolete.
* Keep the overlay as (a) the interim for users who cannot wait for a release, and (b) the carrier for
  non-translation features such as always-visible project groups in the sidebar.
* Adopt per-Cline-version rule files (the approach `ExSchwi` uses) so a broken dictionary degrades to the
  nearest verified version instead of failing silently.
* Treat extra locales as a pipeline, not a workload: extract keys from source, emit a translation
  template, validate, archive per version. Ship `zh-CN` + `zh-TW` as proof; let `ja` / `ko` / `vi` come
  from contributors or upstream.
* Re-run `cline-zh audit` after each Cline release and keep the corpus current until upstream wins.
