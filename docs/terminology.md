# Locale terminology — what was checked, against what, and what is deliberately different

The four non-Chinese-simple dictionaries (**zh-TW, ja, ko, vi**) were produced by machine
translation plus a terminology table, and they have **not** been read by a native-speaking reviewer.
That is stated in the README, in `--help`, and in NOTICE, and it will stay stated until someone
actually reviews them.

"Unreviewed" is not the same as "uncheckable", though. Professional human localizations of the same
software vocabulary exist under permissive licenses, so every dictionary was cross-checked against
them. This page records the method, the result, and the places where we knowingly disagree.

## How to re-run it

```bash
node scripts/terminology-crosscheck.js            # all four locales
node scripts/terminology-crosscheck.js --terms    # whole-label matches only (highest signal)
node scripts/terminology-crosscheck.js ja --fetch # re-download the reference
```

Reference data is cached under `%APPDATA%\cline-kit\cache\l10n\` and is **never** committed. The
script prints a report and changes nothing on purpose: a divergence is a question for a human, not a
todo item.

## Sources

| Source | License | Languages | Why it is usable |
| --- | --- | --- | --- |
| [`microsoft/vscode-loc`](https://github.com/microsoft/vscode-loc) `main.i18n.json` | MIT | zh-hant, ja, ko (**no vi**) | ~24k UI strings per language, translated by professional localization vendors; a large share of the keys are the English source text lowercased, so `cancel → キャンセル` pairs fall out directly |
| [`mozilla-l10n/firefox-l10n`](https://github.com/mozilla-l10n/firefox-l10n) + en-US from [`mozilla-firefox/firefox`](https://github.com/mozilla-firefox/firefox) | MPL-2.0 | vi (plus any other locale) | no VS Code Vietnamese pack exists; Firefox and en-US share entity ids, so `browser.ftl` / `appmenu.ftl` / `preferences.ftl` pair up by id |

Checked on 2026-09-21. Chromium's localized strings were looked for and are **not** usable — the
`chromium-l10n` archive was never mirrored to GitHub and the monorepo fetches translations at build
time, so there is nothing to download. JetBrains' localization resources are not in
`intellij-community` either.

## What the check found

Whole-label comparisons across 476 strings: **zh-TW 6, ja 5, ko 8, vi ~10** divergences, out of 169–236
comparable strings per locale. After reading every one of them, exactly **one** was a defect:

- **zh-TW used both 發送 and 送出 for "send".** Fixed to 傳送 in four strings (`Send message`,
  `Send (Enter)`, notification text, Gmail description). 傳送 is what a zh-TW user sees in Microsoft
  and Google products for the send action, and more importantly the dictionary now agrees with itself.

Everything else below is a deliberate choice, not an oversight.

## House terms (intentionally different from VS Code)

| Term | VS Code | Ours | Why |
| --- | --- | --- | --- |
| session / sessions | 工作階段 (zh-TW) | 會話 | Cline's sessions *are* conversations — the sidebar lists them as chats. 會話 reads correctly on first sight; 工作階段 reads like a workspace/terminal session. Applied consistently in 31 strings |
| workspace | 작업 영역 (ko) | 작업 공간 | Korean developer tools (GitHub, Cursor, Notion) use 작업 공간; 작업 영역 is Microsoft's older house term |
| skill | 技術 (ko) / 候補 (ja) | 스킬 / スキル | Here "Skill" is a named Cline feature, not an ability. Transliterating marks it as a product noun |
| image | イメージ (ja) | 画像 | ja software uses 画像 for image files; イメージ means "impression" or a Docker image |
| font size | フォント (ja), 글꼴 (ko) | 文字サイズ / 글자 크기 | The setting scales all UI text, it does not pick a typeface |
| usage | 使用法 (ja), 使用方式 (zh-TW) | 使用量 / 用量 | Ours is the token/quota sense; the reference term is the "how to use" sense |
| agent | Agent (left in English) | 智慧代理 / 子智慧代理 | Debatable and worth a native opinion — flagged, not changed. VS Code leaves it untranslated; we translate it everywhere, consistently |
| disconnect | 연결 끊기 (ko) | 연결 해제 | Both are standard; 연결 해제 matches the account/sign-out sense we use it in |

## What this does *not* buy

- It says nothing about **fluency, politeness level or register** — the thing only a native reader
  catches. Korean honorific level and Vietnamese word order are exactly where machine translation
  goes wrong and no glossary detects it.
- The reference products have different width constraints and a different voice. A shorter term is
  not automatically the better one inside Cline's layout.
- Coverage is uneven: the vi reference is ~900 terms against ~20k for the others, so "vi found
  fewer divergences" means "vi was checked less", not "vi is better".

A pull request fixing one term is more valuable than this whole file. If you are a native reader of
ja, ko, vi or zh-TW and something below the term level bothers you, that is the gap this process
cannot close.
