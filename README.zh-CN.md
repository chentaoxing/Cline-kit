# cline-zh-overlay（中文说明）

给 **Cline 桌面版**（Windows）加上简体中文界面，不改动程序本体。

[English README](README.md)

## 为什么需要它

Cline 桌面版（写作本文时是 v0.0.32）**没有语言设置**，也没有内置任何语言包：设置 → 通用里只有桌面通知、
深色模式、字号、强调色、应用图标、网页搜索、CLI 自动更新、遥测。强制 WebView2 区域语言
（`--lang=zh-CN`）无效；WebView2 又拒绝 `--load-extension`，所以浏览器扩展这条路也走不通。Cline 自己的
插件体系（Tools / Plugins / Skills / Rules / MCP / Hooks）扩展的是 agent 能力，改不了界面文案。

于是只剩一条不碰二进制的路：让 Cline 带一个本机调试端口启动，再往 WebView 里注入翻译覆盖层。

## 工作原理

```
cline-zh start
  ├── 以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<随机端口> 启动 cline-app.exe
  ├── 连接 127.0.0.1 上的 DevTools 接口
  └── 常驻注入器负责安装 src/engine.js + dictionaries/zh-CN.json
        └── MutationObserver 替换英文文本节点与 placeholder / aria-label / title 属性
```

`cline-app.exe` 一个字节都没改：签名、安装目录、自动更新全部照旧。词典是数据（JSON），不是代码。

## 环境要求

* Windows 10/11（macOS / Linux 暂不支持，见[已知限制](#已知限制)）
* [Node.js](https://nodejs.org) 20.10 及以上（需要全局 `WebSocket` 与 `fetch`）
* 已安装 Cline 桌面版

## 安装

```bash
git clone https://github.com/CHANGE_ME/cline-zh-overlay.git
cd cline-zh-overlay
npm install -g .        # 或者直接用：node src/cli.js
cline-zh install        # 把你现有的 Cline 快捷方式指向中文启动器
cline-zh start          # 立刻以中文界面启动 Cline
```

`cline-zh install` 会在开始菜单 / 桌面找到 Cline 快捷方式，把原始目标写进
`%APPDATA%\cline-zh\config.json` 备份，然后改为指向一个无黑框启动器。之后正常点开 Cline 就是中文。

## 命令

| 命令 | 作用 |
| --- | --- |
| `cline-zh start` | 启动 Cline 并挂上中文界面（`--restart` 会先退出正在运行的实例） |
| `cline-zh status` | 显示探测到的 Cline 路径、调试端口、注入器进程、词典版本 |
| `cline-zh install` / `uninstall` | 改写 / 还原 Cline 快捷方式 |
| `cline-zh update` | 从 GitHub 拉取最新词典（`--force` 立即检查） |
| `cline-zh audit` | 走查界面，列出仍是英文的字符串——Cline 更新后先跑这个 |
| `cline-zh dict` | 词典统计与本地覆盖文件路径 |
| `cline-zh config` | 查看或设置 `--cline-path`、`--port`、`--auto-update=on\|off` |

## 改措辞 / 补词条

编辑 `dictionaries/zh-CN.json`：

```json
{
  "entries":  { "Save": "保存" },
  "prefixes": [ { "from": "Model: ", "to": "模型：" } ],
  "rules":    [ { "pattern": "^Thought for (\\d+)s$", "out": "思考了 $1 秒" } ]
}
```

匹配**只按整串精确匹配**（不做子串替换），因此不会误伤模型名和代码。规则先于前缀执行，`$1..$9`
取自捕获组。正则必须以 `^…$` 锚定，校验不过的远端词典会被直接拒绝。

想让自己的改法在工具升级后仍然保留，写到 `%APPDATA%\cline-zh\zh-CN.local.json`，本地覆盖优先级最高。

注入器每 4 秒重读一次词典，改完不用重启 Cline。

## 已知限制

* **仅 Windows。** 注入依赖 WebView2 的环境变量；macOS/Linux 用的是 WKWebView / WebKitGTK，需要另一套机制。
* **模型简介仍是英文。** 每个模型下面那句 "Leading open-weights model" 来自云端目录，成千上万条自由文本，
  固定词典无法穷举。
* **专有名词故意不翻**：Cline、ClinePass、Codex、MCP、服务商与模型名、`read_files` 这类工具标识、
  文件夹名与示例值。
* **Cline 更新后可能失效。** 界面文案一改，覆盖层只会保持英文。跑 `cline-zh audit` 把结果发到 issue
  或直接提 PR。
* 直接双击 `cline-app.exe`（或用没被改写的快捷方式）打开，界面还是英文——因为没有可注入的调试端口。

## 安全说明

`cline-zh start` 会在 Cline 运行期间于 `127.0.0.1` 开一个 DevTools 端口，本机任意进程都能通过它操作
Cline 界面。端口每次启动随机、只绑定回环地址，也不会写成系统级环境变量。详见 [SECURITY.md](SECURITY.md)。

## 卸载

```bash
cline-zh uninstall               # 还原原始快捷方式并结束注入器
del /q "%APPDATA%\cline-zh"      # 可选：删除配置、缓存与日志
npm uninstall -g cline-zh-overlay
```

## 参与

真正有价值的是词典。日常用一段时间后跑 `cline-zh audit`，把缺的补进 `dictionaries/zh-CN.json`，
把 `version` 加一，提 PR。

另外我们更希望官方直接支持多语言——见 [`docs/upstream-i18n-issue.md`](docs/upstream-i18n-issue.md)，
那是给 Cline 官方写的功能请求草稿，并把这份词典作为 zh-CN 初始语料附上。官方一旦支持，这个工具就可以
退休，那是更好的结果。

## 许可

MIT，见 [LICENSE](LICENSE)。本项目与 Cline 无隶属关系，也未获其背书。
