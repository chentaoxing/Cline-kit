# Cline-kit（中文说明）

给 **Cline 桌面版**（Windows）加功能的运行时覆盖层——不改二进制，不 fork。

[English README](README.md)

*产品名写作 **Cline-kit**；npm 包名、代码目录和 `%APPDATA%` 状态目录都是小写 `cline-kit`（npm 包名不允许大写）。命令行是 `ckit`。*

**主打功能：** Cline 侧边栏的「项目分组」只显示**已经有会话**的文件夹。你登记过但还没打开过的项目，
在界面上根本不存在。cline-kit 把所有已登记项目常驻列出，样式与原生分组一致，并且可以直接从侧边栏
切进一个还没有会话的项目。

**附属功能：** 界面语言包，随包 5 份：**zh-CN**（基准，逐条对着界面校过）、繁體中文 / 日本語 / 한국어 /
Tiếng Việt，另加一项 `English` 表示不替换。选择入口在 Cline 里面：设置页会多出一行**界面语言**。
语言包之所以在这里，是因为同一条注入通道顺带能承载它——它不是这个项目存在的理由。

## 要解决的问题

Cline 原生其实有一半：侧边栏那个 `会话排序：时间 ⇄ 项目` 开关就是按项目分组。但分组列表是从
*已有会话*推导出来的——登记 17 个项目文件夹、只在其中 3 个里建过会话，侧边栏就只有 3 个。
`sidebar-groups` 补的就是这一段：

| | 之前 | 之后 |
| --- | --- | --- |
| 显示的已登记项目 | 3 | 17 |
| 没有会话的项目 | 完全不出现 | 列出、可展开，标注「暂无会话」 |
| 切进空项目 | 侧边栏做不到 | 一键，走 Cline 自己的工作区选择器 |

不写 Cline 的任何存储：切换项目是驱动它自己的选择器（chip → 搜索框填路径 → 点结果行），
行为与你手动操作完全一致。

## 工作原理

```
ckit start
  ├── 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<随机端口> 启动 cline-app.exe
  ├── 连接 127.0.0.1 上的 DevTools 接口
  └── 常驻注入器装载 engine.js + 已启用插件（加载词典时一并装载语言数据）
        └── MutationObserver 维持项目分组常驻；启用语言包时替换英文文本节点
            与 placeholder / aria-label / title 属性
```

`cline-app.exe` 一个字节都没改：签名、安装目录、自动更新全部照旧。插件代码与语言数据彼此独立——
可以只用项目栏、只用语言包，或两个都开。

## 环境要求

* Windows 10/11（macOS / Linux 暂不支持，见[已知限制](#已知限制)）
* [Node.js](https://nodejs.org) 20.10 及以上（需要全局 `WebSocket` 与 `fetch`）
* 已安装 Cline 桌面版（在 v0.0.32 上验证）

## 安装

四条路都是同一个工具，都不碰 `cline-app.exe`。用便携包的话连 Node 都不用装。

**1. 便携包 —— 不用装任何东西，也不需要 Node（推荐）**

从 [Releases](https://github.com/chentaoxing/Cline-kit/releases) 下载 `cline-kit-vX.Y.Z-portable-win.zip`，
解压到一个固定位置，**双击 `install.cmd`** 就完事：它把你的 Cline 快捷方式指向增强启动器，之后照常
点开 Cline 即可。不用命令行、不用配 PATH，文件夹里自带 Node 运行时（版本与校验值钉在
`scripts/portable-node.json`，构建时会拿 nodejs.org 官方的 SHASUMS256.txt 再核一遍）。
同一个目录里的 `ckit.cmd locales` 可以换语言，`ckit.cmd uninstall` 一键还原。

**2. npm —— 已经装了 Node.js 20.10+ 的人**

```bash
npm install -g cline-kit
ckit install                # 把现有 Cline 快捷方式指向增强启动器
ckit start                  # 立刻带增强功能启动 Cline
```

好处是 `npm update -g cline-kit` 升级，以及 `ckit` 直接进 PATH。

**3. 不带运行时的 release zip**

`cline-kit-vX.Y.Z-win.zip` 是同一个包去掉自带 Node 的版本，给不想多背 84 MB 的人用；解压后在该目录跑
`ckit.cmd install`。

**4. 源码（要改代码时）**

```bash
git clone https://github.com/chentaoxing/Cline-kit.git
cd cline-kit
npm install -g .        # 或直接用：node src/cli.js <命令>
npm test                # 29 项无依赖自检
```

装完统一确认一次：

```bash
ckit doctor             # 直接问运行中的窗口：增强层到底进没进去
ckit locales            # 可选：看有哪些语言、换语言
```

`ckit install` 会在开始菜单 / 桌面找到 Cline 快捷方式，把原始目标备份进 `%APPDATA%\cline-kit\config.json`，
再改为指向一个无黑框启动器。之后正常点开 Cline 就带增强功能。想继续用自己的启动方式，就跳过 `install`，
用 `ckit start`，或者对一个已经开着调试端口的 Cline 用 `ckit attach --port=N`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `ckit start` | 以增强层启动 Cline（`--restart` 先退出正在运行的实例） |
| `ckit stop` | 结束后台注入器，不影响 Cline 本身 |
| `ckit status` | 探测到的 Cline 路径、调试端口、注入器进程、已装载构建版本 |
| `ckit doctor` | 直接问正在运行的窗口装了些什么：构建版本、补了几行、原生分组数 |
| `ckit attach` | 往你自己启动、已开调试端口的 Cline 注入一次（`--port=N`），不接管快捷方式 |
| `ckit features` | 列出功能插件与开关状态 |
| `ckit feature enable\|disable <id>` | 开关某个插件（约 4 秒生效，无需重启） |
| `ckit locales` | 列出随包发行的界面语言、字符串数与当前语言 |
| `ckit locales <语言>` | 切换语言，如 `ckit locales ja`（约 4 秒生效，无需重启） |
| `ckit install` / `uninstall` | 改写 / 还原 Cline 快捷方式 |
| `ckit update` | 从 GitHub 拉取最新语言词典（`--force` 立即检查） |
| `ckit audit` | 走查界面，列出仍是英文的字符串 |
| `ckit dict` | 词典统计与本地覆盖文件路径 |
| `ckit config` | 查看或设置 `--cline-path`、`--port`、`--auto-update=on\|off`、`--dictionary=<语言>`、`--hide=<路径>` |

### 选择语言

**在软件里**：点开 Cline 侧边栏底部的齿轮进「设置」，用**界面语言**那一行。它排在「深色模式」下面，
样式和邻居一致，点完约 4 秒生效——不用重启，选择会记住。列表里的 `English` 表示不替换任何文案。

**在终端里**（改的是同一个设置）：

```bash
ckit locales          # 看有哪些语言、各覆盖多少条、当前用的是哪一个（* 号标记）
ckit locales ja       # 切换；正在打开的窗口约 4 秒内跟着变，不用重启
ckit locales none     # 不再替换 Cline 自己的文案
```

`ckit install` 每次都会打印当前语言和这条命令，第一次 `ckit start` 成功后也会提示一次。
`ckit config --dictionary=<语言>` 是等价的底层写法。选定非默认语言后，`ckit update` 热更新的就是那一份。

如果点了十几秒没反应，那一行会变红并直接说明原因：换语言是后台注入器在做的事，只有 Cline 是**经本工具启动**的（它改写的快捷方式、`ckit start`、或便携包的 `install.cmd`）才有效。直接双击 `cline-app.exe` 会看到那一行，但背后没人执行。

这一行是本工具加进去的，Cline 原生没有语言设置；不想要就 `ckit feature disable language-picker`。

## 功能

`ckit features` 看实时列表。

* **`sidebar-groups`**（默认开启）——上面说的常驻项目分组。它自己判断什么算项目：某个登记路径如果
  包含着其他登记路径，或者位于应用安装目录内，就当作容器不显示，因此**不需要按机器配置**。
  如果你亲手点了 Cline 的排序按钮，本会话内就以你的选择为准不再干预；否则增强层会持续保持分组模式。
  两个同名项目（比如两块盘上都有 `LLM`）会带上上级目录名显示成 `LLM (workspace)`，仍然重名就加序号，
  而鼠标悬停始终是完整路径。设计说明见 [`docs/features.zh-CN.md`](docs/features.zh-CN.md)。
* **`language-picker`**（默认开启）——在 Cline 自己的设置页里加一行「界面语言」，见
  [选择语言](#选择语言)。
* **语言包**（`dictionaries/<locale>.json`）——只做**整串精确匹配**替换，因此不会误伤模型名、服务商名、
  工具标识和代码。语料为 476 条词条 + 30 条规则，来源是「界面走查 + 从应用自身源码提取」两路合并。
  现在随包附带 5 份词典：**zh-CN**（基准，逐条对着运行中的界面校对过）、**zh-TW**、**ja**、**ko**、
  **vi** —— 后四份条目齐全但属于机器辅助翻译、未经母语者审校，术语有偏差欢迎提 PR 直接改。
  切换：Cline 设置页的「界面语言」，或 `ckit locales ja`，正在打开的窗口**不需要重启或刷新**就会跟着变；
  `ckit update` 也只更新你选的那一份。详见[选择语言](#选择语言)。术语已对照官方人工本地化校验，
  有意保留的差异见 [`docs/terminology.md`](docs/terminology.md)；制作流程见
  [`docs/dictionary-pipeline.zh-CN.md`](docs/dictionary-pipeline.zh-CN.md)。

## 已知限制

* **仅 Windows。** 注入依赖 WebView2 的环境变量；macOS/Linux 用 WKWebView / WebKitGTK，需要另一套机制。
* **故意不出独立 exe。** 把 Node 打进可执行文件确实能省掉运行环境，但未签名的单文件程序会被
  SmartScreen 和杀软拦，而注入器本来也要一直开着本地调试端口。npm 或 Release 压缩包就是官方路径。
* **必须经由增强层启动。** 直接双击 `cline-app.exe`（或用没被改写的快捷方式）没有可注入的调试端口，
  得到的是原版界面。
* **Cline 升级可能失效。** 文案改了，语言包会留英文；侧边栏结构改了，`sidebar-groups` 需要跟进。
  跑一次 `ckit audit` 并开 issue。
* **语言那一行是本项目加的，不是 Cline 原生的。** 它插在设置页「深色模式」下面——位置符合直觉，
  但那个位置并不是 Cline 公开约定的。那一页改版时需要更新 `language-picker` 的锚点
  （`ckit doctor` 会报这一行在不在），不想要就 `ckit feature disable language-picker`。
* **模型下方的一句英文简介不覆盖**——来自云端目录的自由文本，条数随服务商变化。
* **同名项目。** Cline 自己的分组标题只有文件夹名、没有路径，所以登记表里出现两个不同盘符下的 `LLM`
  且其中一个已有原生分组时，无法判断哪一个才是它。此时两行都列出（带上级目录区分），并且不在这种行里
  写「暂无会话」——不确定的事就不声明。
* 专有名词一律不翻：Cline、服务商与模型名、工具标识、路径。

## 安全说明

`ckit start` 会在 Cline 运行期间于 `127.0.0.1` 开一个 DevTools 端口，本机以你身份运行的任意进程都能
通过它操作 Cline 界面。端口每次启动随机、只绑定回环地址、不写成系统级环境变量。远端词典会做校验
（结构、规模、正则必须锚定），不合规直接拒绝。详见 [SECURITY.md](SECURITY.md)。

## 卸载

```bash
ckit uninstall                 # 还原原始快捷方式并结束注入器
del /q "%APPDATA%\cline-kit"   # 可选：删除配置、缓存与日志
npm uninstall -g cline-kit
```

## 与同类项目的关系

[`JACK5920/cline-desktop-zh`](https://github.com/JACK5920/cline-desktop-zh) 和
[`ExSchwi/cline-desktop-zh-cn`](https://github.com/ExSchwi/cline-desktop-zh-cn) 把**语言**这一半做得不错，
只想要中文界面的话用它们就够了；[`cline-chinese`](https://github.com/HybridTalentComputing/cline-chinese)
是 **VS Code 插件**的分叉，属于另一个界面。本项目与它们的交集只在语言包上——存在理由是侧边栏/项目行为，
加上工程化部分（可逆安装、路径自动探测、随机端口、插件开关、`ckit audit`）。思路致谢记录在 [NOTICE](NOTICE)。

更好的长期结果是官方支持：一个语言设置，以及一个列出全部已登记项目的侧边栏。我们已在
[#12518](https://github.com/cline/cline/issues/12518) 与 [#13811](https://github.com/cline/cline/pull/13811)
发言，脉络见 [`docs/upstream-i18n.md`](docs/upstream-i18n.md)。

## 许可

MIT，见 [LICENSE](LICENSE)。[NOTICE](NOTICE) 记录来源边界：非官方项目、不打包任何上游代码或图标资源、
语言包的英文键取自 Apache-2.0 的 [`cline/cline`](https://github.com/cline/cline) 仓库中
`apps/examples/desktop-app`（即应用自身界面文案），译文为原创。与 Cline 无隶属关系，也未获其背书。
