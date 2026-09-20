# 词典管线（为什么不再靠抓界面）

`dictionaries/zh-CN.json` 现在有两个来源，DOM 抓取只是其中之一。

## 两条采集路径

| 路径 | 命令 | 能得到什么 | 局限 |
| --- | --- | --- | --- |
| 运行界面走查 | `ckit audit` | 用户真的看得到的串；顺带发现被拆成多个文本节点的句子 | 只能看到当时打开过的界面；错误态、空态、未点开的对话框全都漏掉 |
| 官方源码提取 | `node scripts/extract-source-keys.js <webviewDir>` | 全量候选串，包括从未在界面上出现过的 | 启发式解析，会有标识符误报；动态拼接的句子拿不到完整形态 |

## 用法

```bash
# 1. 只拉桌面版 webview，避免整仓下载
git clone --filter=blob:none --no-checkout --depth 1 https://github.com/cline/cline.git .cache/cline-src
cd .cache/cline-src
git sparse-checkout init --cone
git sparse-checkout set apps/examples/desktop-app/webview

# 2. 提取并与现有词典对比
node ../../scripts/extract-source-keys.js apps/examples/desktop-app/webview --json ../../.cache/source-keys.json

# 3. 翻译后合并（key 用英文前缀唯一匹配，长句不必重敲）
node ../../scripts/merge-source-keys.js --dry
node ../../scripts/merge-source-keys.js
```

`merge-source-keys.js` 的匹配规则值得说明：MAP 里写的是英文**前缀**，脚本拿提取结果里的原文做唯一
匹配再写入。前缀命中 0 条或命中多条都会报出来，所以不会出现"以为加了、其实拼错了一个词"这种静默失效。

## 实测数据（Desktop 0.0.32）

- 提取 197 个源文件 → 218 条唯一候选串
- 其中 84 条 DOM 抓取已经覆盖（说明抓取路线本身是准的）
- **134 条从未在界面上出现过**：`Delete failed`、`Rename failed`、`Cloud attachment limit`、
  `Working directory`、`System prompt override`、65 条 `aria-label`、云端/SSH/工作树与市场描述等
- 合并后词典 v3：**476 条词条 + 6 前缀 + 24 规则**

## 版本兼容策略（有意没做重的部分）

社区里 `ExSchwi/cline-desktop-zh-cn` 用「按 Cline 版本分规则文件 + 最近版本回退」，思路是对的。
我们暂时用更轻的方案：`audit` 就是回归检测器——Cline 一升级，跑一次 `ckit audit`，未覆盖列表
就是需要补的差量；配合源码提取，补一轮的成本远低于维护多版本文件树。等真出现"同一版本内多套文案"
的需求再上版本化文件。

## 其它语言包（zh-TW / ja / ko / vi）

同一套 JSON 结构就是同一套流水线，加一门语言不需要改任何代码：

```bash
node scripts/new-locale.js sw "Kiswahili"        # 用 zh-CN 的键集生成骨架，值全部留空
# 填值：写一份扁平映射 { "English source": "translation" }，不要手改词典本体
node scripts/apply-locale.js sw .cache/sw-map.json
npm test                                          # 完整性：键集一致、无空值、值≠英文、$n 合法
node scripts/locale-switch-check.js sw             # 真实界面：不重启就换成这门语言
```

三道关卡各有分工：`new-locale.js` 保证**键**不会跑偏（它直接从基准词典复制）；`apply-locale.js`
只写值、并报告还剩哪些空着，所以没有人需要手改 18KB 的 JSON；`npm test` 的词典检查把「条目齐不齐」
变成机器判定，漏一条就红；`locale-switch-check.js` 才是端到端——它改 `config.json`、等常驻注入器
装载、然后读**运行中窗口里**的那行文字，确认语言真的换过去了（引擎会把原文记在节点上，所以中途换
语言不需要刷新页面）。

zh-TW 特殊一点：`scripts/build-zh-tw.js` 先用 OpenCC `s2tw` 转字符，再套一张台湾软件术语表，最后仍需
逐词复核（`會話/外掛程式/市集/智慧代理/重新整理` 这类是人工判断，不是字符映射能给的）。因此词典里的
zh-TW 是「机械转换 + 人工术语校正」的产物，重跑生成脚本只会给 ja/ko/vi 那样的参考，不要把 zh-TW 再
覆盖回去。

已发布词典的**审校状态**：zh-CN 逐条对着运行中的界面校对过；zh-TW / ja / ko / vi 条目完整、术语一致，
但没有母语者审校。这一点在 README、HELP 和 NOTICE 里都写明，欢迎直接改词的 PR。
