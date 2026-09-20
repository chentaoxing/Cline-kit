# 发布检查表

面向维护者：每次发版按顺序走一遍。第 1 条是硬门槛，不过就不要推。

## 1. 本地体检（硬门槛）

```bash
npm test                              # 25 项无依赖自检，必须全绿
node scripts/locale-switch-check.js    # 需 Cline 正由本工具启动：五份词典逐个真机验证
node scripts/cli-locale-switch-check.js ja   # 用户那条指令（ckit locales）是否真的改变了窗口
node src/cli.js doctor                 # 全绿；任何 FAIL 都表示装进窗口的东西和源码不一致
node src/cli.js locales                # 五份语言都在表里，当前语言带 *
git status --short                     # 应为空
```

`npm test` 里已包含 ship-clean 检查：仓库内出现个人路径、本机用户名、GitHub token 或散落邮箱就红。
它是自动的，但**每次发布前仍然重跑一次**——诊断脚本很容易把真实路径写进文件。

`%APPDATA%\cline-kit\audit-report.json`（工具输出，不在仓库里）会把界面上看到的账号邮箱当成
"未翻译字符串"记录下来，别把它复制进 issue 或提交。

## 2. 语言包

`dictionaries/` 五份词典的键集必须完全一致，这条由 `npm test` 判定（少一条就红）。
审校状态要在 README、`--help` 与 NOTICE 里写明：只有 zh-CN 是对着运行中的界面逐条校过的，
zh-TW / ja / ko / vi 条目完整但未经母语者审校。新增语言的流程见
[`dictionary-pipeline.zh-CN.md`](dictionary-pipeline.zh-CN.md)。

## 3. 版本与归属

* `package.json` 的 `version` 与 `CHANGELOG.md` 顶部条目一致
* `LICENSE` 版权行、`NOTICE` 的上游出处与社区致谢是否符合事实（尤其：不得声称任何官方关系）
* 各词典自身的 `version` 独立递增（远端更新按语言分别比较）

## 4. 打标签发布

```bash
git tag v0.1.1 && git push origin v0.1.1     # 触发 .github/workflows/release.yml
```

一次 `git push --tags` 就够：workflow 跑 `npm test` + CLI 冒烟 → 产出 `cline-kit-vX.Y.Z-win.zip` 挂到
Release → publish job 用 **npm Trusted Publishing（OIDC）** 执行 `npm publish --provenance`。
仓库、runner、本机都不存 npm 凭据（npm 从 2026-08 起限制绕过 2FA 的 token、2027-01 起限制直接用 token
发布，所以这里刻意不用 `NPM_TOKEN`）。

信任关系已注册好，只在 npm 侧做过一次：包 `cline-kit` 的 Trusted Publisher = `chentaoxing` /
`Cline-kit` / `release.yml`，并勾选 "Allow npm publish"。它**不可修改**，只能删了重建；所以改名
workflow 文件时必须同步改这里，否则 publish job 会失败。发布 job 里另外两处坑已经处理：setup-node 在
没有 secret 时仍会写一个占位 `_authToken`，会让 npm 走 token 而不是 OIDC（registry 回 404），所以用
一份不含 auth 行的 userconfig 顶掉它；trusted publishing 需要 npm ≥ 11.5.1，runner 的 Node 22 自带
10.x 只会报 `ENEEDAUTH`，所以 publish job 钉 Node 24 + npm 12。

发布后跑一次 `ckit update --force`，远端词典能拉到才算通。注意本机
`%APPDATA%\cline-kit\config.json` 里的 `updateUrl` 不会被新的默认值覆盖，改地址时要一并
`ckit config --update-url=...`。

## 5. 发布之后

* 把仓库链接补进 cline/cline 的 [#12518](https://github.com/cline/cline/issues/12518)
  与 [#13811](https://github.com/cline/cline/pull/13811)（那两处已经说明过本项目，公开后应给可点地址）。
* 桌面版 i18n 移植 PR 仍被上游阻塞：`@cline/i18n` 只存在于 PR #13811 的 `feat/i18n-foundation` 分支，
  2026-09-20 实测 `mergeable:false`，等它落地才有可依附的地基。

## 6. 一次性决定（留档，不必重复执行）

* 名字：产品名 **Cline-kit**；npm 包名、仓库目录与 `%APPDATA%` 状态目录都是小写 `cline-kit`
  （npm 包名不允许大写字母）。占用情况实测：`cline-desktop-zh`、`cline-desktop-zh-cn` 已被他人使用。
* 同一工作区曾有另一份独立实现（`cline-sidebar-projects`，自带 `csproj`）和它更早的脚本目录，
  已于 2026-09-20 合并进本项目并移入 `_superseded/`：只发一份，避免两个工具互抢 Cline 快捷方式，
  或互相把对方的补全行判定成"原生分组"。以后要改侧边栏行为就改 `src/features/`，不要复活归档目录。
* 有意不做：按界面文字自动判定语言（语言由词典显式决定，两处"当前语言"会互相矛盾）、
  独立 exe（未签名单文件会被 SmartScreen/杀软拦，而注入器本就要一直开本地调试端口）、
  按 Cline 版本拆分规则文件（用 `ckit audit` 出差量，成本远低于维护版本树）。

## 7. 已知未做（README 已承认）

* 仅 Windows；macOS/Linux 的注入通道不同，未实现。
* 模型列表里每条模型的一句英文简介未覆盖（云端动态自由文本）。
* 词典按 0.0.32 校准；Cline 升级后需重跑 `ckit audit` 补差量。
