# 发布前清单

本地内容做完、准备公开之前按顺序走一遍。前四步不做，仓库发出去就是半成品或有隐私泄露。

## 1. 隐私与安全扫描（必须先过）

```bash
npm test                                   # 17 项纯逻辑自检，必须全绿
git grep -n -I -iE "C:\\\\Users|AlphaC|%USERNAME%|gmail[.]com|陈桃行|陈韬行" -- . ':(exclude)docs/RELEASE-CHECKLIST.md'
# 密钥形态
git grep -n -I -E "ghp_[A-Za-z0-9]{10,}|gho_|github_pat_|client_secret" -- . ':(exclude)docs/RELEASE-CHECKLIST.md'
# 确认这些目录没有意外被跟踪
git ls-files | grep -E "^\.cache/|\.local\.json$|audit-report" || echo "clean"
```

后面三条命令都应为空（最后一条应打印 `clean`）。`.cache/`、`*.local.json`、`audit-report.json` 已在
`.gitignore` 里，但**每次发布前重跑一次**——诊断脚本很容易写进真实路径。

注意 `%APPDATA%\cline-kit\audit-report.json`（工具输出，不在仓库里）会把界面上看到的**账号邮箱**
当成"未翻译字符串"记下来，别把它复制进 issue 或提交。

## 2. 定名字

已定：**`cline-kit`**（2026-09-20）。占用情况实测：

* `cline-desktop-zh` → 已被 `JACK5920` 使用（同方向项目）
* `cline-desktop-zh-cn` → 已被 `ExSchwi` 使用
* `cline-kit`、`cline-kit-corpus` → npm 与账号下均空闲（发布前再核一次，空闲状态会变）

npm 名必须小写。剩下要定的只有 `<owner>`：GitHub 账号名。

## 3. 替换占位符

```bash
# 五处 CHANGE_ME：包元数据 ×2、更新地址 ×1、README clone ×2
git grep -n "CHANGE_ME"
```

* `package.json` → `repository.url`、`bugs.url`
* `src/config.js` → `DEFAULTS.updateUrl`（词典热更新的来源；未替换时 `update` 会明确跳过而不是打错地址）
* `README.md` / `README.zh-CN.md` → clone 地址与 `git clone` 示例

替换后跑一次 `node src/cli.js update --force`，词典能拉到才算通。老版本装在 `%APPDATA%\cline-kit\config.json`
里的 `updateUrl` 不会被 DEFAULTS 覆盖，要一并 `ckit config --update-url=...` 改本机这份。

## 4. 许可与归属

* `LICENSE` 的版权行是否是你的名字
* `NOTICE` 里的上游出处、社区致谢、图标说明是否符合事实（尤其：不要声称任何官方关系）
* `CHANGELOG.md` 顶部版本号与 `package.json` 的 `version` 一致

## 5. 建库与推送

```bash
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
git tag v0.1.0 && git push origin v0.1.0     # 触发 .github/workflows/release.yml 打 zip
```

发布到 npm 需要在仓库 Secrets 里配 `NPM_TOKEN`，否则 workflow 的 publish job 会跳过（设计上如此）。

## 6. 发布后的两件事

* 把 `cline-kit` 的链接补进 cline/cline 的 [#12518](https://github.com/cline/cline/issues/12518)
  与 [#13811](https://github.com/cline/cline/pull/13811) 评论（已经在那里说明过本项目，公开后应给出可点的地址）。
* 与同一工作区里的两个并行会话对齐，它们做的是同一件事的另外两个版本：

  * `cline-sidebar-groups/apply-to-overlay.js` —— 直接改本项目的 `src/payload.js` 打补丁。
    本项目已有正式插件机制（`src/features/` + `ckit feature enable <id>`），这份补丁应当退役，
    否则两边会同时往同一个列表容器里补行，并互相把对方的行判定为"原生分组"。
  * `cline-sidebar-projects/` —— 独立成品（自带 CLI `csproj`、`run-once`/`attach`、13 组自检）。
    它的侧边栏行为已经并入本项目 v5（同名项目上级目录区分、安装目录过滤、计数自检），
    发布前要决定：合成为一份，还是各发一个仓库。**两份都发出去只会互相抢快捷方式**，
    用户搜到的第一个也可能是错的。

## 5.5 发布前的最后体检

```bash
npm test
node src/cli.js doctor        # 全绿；任何 FAIL 都说明装的东西和源码不一致
git status --short            # 应为空
```

## 7. 已知未做（发布时要在 README 里承认）

* 仅 Windows；macOS/Linux 的注入通道不同，未实现。
* 模型列表里每条模型的一句英文简介未覆盖（云端动态自由文本）。
* 词典按 0.0.32 校准；Cline 升级后需重跑 `ckit audit` 补差量。
