# Upstream i18n status

What we asked Cline for, and where it stands. Last updated 2026-09-20.

## Existing upstream threads (do not file duplicates)

| Thread | Scope | State |
| --- | --- | --- |
| [#12518 — [Feature Request] 添加中文界面支持 / Add Chinese (Simplified) Language Support](https://github.com/cline/cline/issues/12518) | Chinese UI overall; two community comments already ask for **Cline Desktop** coverage | open, created 2026-07-24 |
| [#13811 — Localize the VS Code extension (en, 简体中文, Español, Русский, 한국어)](https://github.com/cline/cline/pull/13811) | **VS Code extension only.** Adds `@cline/i18n` (i18next + JSON catalogues, 18 namespaces, ~1,258 keys × 5 locales), a `Display Language` setting, and `bun run translate -- --lang <locale>` | open, not draft, updated 2026-09-16 |

## Key structural finding

The Cline **desktop app is not in this repository**. `apps/` contains `cli`, `vscode`, `cline-hub`,
`examples`, `vscode-rollout` — no desktop/Tauri app. So #13811's framework cannot be reused for the
desktop UI from this repo, and it is currently unclear where desktop strings live or who owns them.
That is the central question we asked.

## What we posted

* [Comment on #12518](https://github.com/cline/cline/issues/12518#issuecomment-5747674854) — desktop
  evidence (v0.0.32 has no language setting; `--lang=zh-CN` has no effect; WebView2 refuses
  `--load-extension`; the only workaround needs a local DevTools port), the "where does desktop i18n
  live?" question, plus two implementation notes and the offer of a zh-CN corpus.
* [Comment on #13811](https://github.com/cline/cline/pull/13811#issuecomment-5747674963) — asks whether
  `@cline/i18n` catalogues are intended to be shared with the desktop app, and contributes the same
  desktop-specific findings.

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

* If a maintainer answers where desktop strings live, port the corpus into that layout and open a PR.
* Track #13811: if it merges, the desktop request becomes "reuse `@cline/i18n`", which is a much
  smaller change than building a framework twice.
* Re-run `cline-zh audit` after each Cline release and keep the corpus current until upstream wins.
