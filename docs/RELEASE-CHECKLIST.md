# 发布前清单

本地内容做完、准备公开之前按顺序走一遍。前四步不做，仓库发出去就是半成品或有隐私泄露。

## 1. 隐私与安全扫描（必须先过）

```bash
# 本机路径 / 个人信息（排除本清单自身，否则模式文本会自我命中）
git grep -n -I -iE "C:\\\\Users|AlphaC|%USERNAME%|gmail[.]com|陈桃行|陈韬行" -- . ':(exclude)docs/RELEASE-CHECKLIST.md'
# 密钥形态
git grep -n -I -E "ghp_[A-Za-z0-9]{10,}|gho_|github_pat_|client_secret" -- . ':(exclude)docs/RELEASE-CHECKLIST.md'
# 确认这些目录没有意外被跟踪
git ls-files | grep -E "^\.cache/|\.local\.json$|audit-report" || echo "clean"
```

三条命令都应为空（最后一条应打印 `clean`）。`.cache/`、`*.local.json`、`audit-report.json` 已在
`.gitignore` 里，但**每次发布前重跑一次**——诊断脚本很容易写进真实路径。

## 2. 定名字

已确认的占用情况（2026-09-20 实测）：

* `cline-desktop-zh` → 已被 `JACK5920` 使用（同方向项目）
* `cline-desktop-zh-cn` → 已被 `ExSchwi` 使用
* `cline-zh-overlay`、`cline-zh-corpus`、`cline-zh-kit` → npm 与账号下均空闲

npm 名必须小写。定了之后，下面三处占位一起替换。

## 3. 替换占位符

```bash
# 三处 CHANGE_ME：包元数据、更新地址、README 安装命令
git grep -n "CHANGE_ME"
```

* `package.json` → `repository.url`、`bugs.url`
* `src/config.js` → `DEFAULTS.updateUrl`（词典热更新的来源；未替换时 `update` 会明确跳过而不是打错地址）
* `README.md` / `README.zh-CN.md` → clone 地址与 `git clone` 示例

替换后跑一次 `node src/cli.js update --force`，词典能拉到才算通。

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

* 把 `cline-zh-overlay` 的链接补进 cline/cline 的 [#12518](https://github.com/cline/cline/issues/12518)
  与 [#13811](https://github.com/cline/cline/pull/13811) 评论（已经在那里说明过本项目，公开后应给出可点的地址）。
* 与并行的 `cline-sidebar-groups` 会话对齐：它的 `apply-to-overlay.js` 会直接改 `src/payload.js`。
  本项目已经提供正式的插件机制（`src/features/` + `cline-zh feature enable <id>`），它那份补丁应当退役，
  否则两边会同时改同一个容器里的侧边栏行并互相判定为"原生分组"。

## 7. 已知未做（发布时要在 README 里承认）

* 仅 Windows；macOS/Linux 的注入通道不同，未实现。
* 模型列表里每条模型的一句英文简介未覆盖（云端动态自由文本）。
* 词典按 0.0.32 校准；Cline 升级后需重跑 `cline-zh audit` 补差量。
