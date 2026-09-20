# Features（功能插件）

覆盖层不只是翻译。`src/features/` 下的每个文件都是一个独立的功能插件，由注入器和词典一起装载。

## 列表与开关

```bash
ckit features                      # 查看所有插件及状态
ckit feature enable  sidebar-groups
ckit feature disable sidebar-groups
```

改完约 4 秒内生效，不需要重启 Cline：注入器每轮重读配置，payload 版本形如 `d3+24c3df82e`
（字典版本 + 整段源码哈希），任何代码或词典变动都会让它变化。

升级工具本身（`git pull`）之后跑一次 `ckit start` 即可——常驻注入器是长驻进程，内存里还是旧模块代码，
`start` 会比对它记录的已装载版本，发现是旧的就自动重启它。

## sidebar-groups — 侧边栏全项目常驻

Cline 原生的「项目分组」只列出**已经有会话**的文件夹，登记过但还没建会话的项目全部隐藏。
这个插件把缺失的项目按原生同款样式补在末尾，空项目展开后显示「暂无会话」和
「切到该项目并新建会话」。

切换项目时插件不碰 Cline 的存储、也不调它的后端命令，而是驱动 Cline 自己的工作区选择器
（chip → 搜索框填完整路径 → 点结果行），所以行为与手动操作一致。

两点实现上的取舍：

- **哪些算项目、哪些算容器**：如果某个登记路径是另一个登记路径的父目录（例如
  `…\Cline\workspace`），或它位于 Cline 安装目录内，就不当作项目补全。安装目录由工具从
  `ckit` 探测到的路径注入，不写死任何机器上的盘符。
- **分组模式不持久**：Cline 重启会回到按时间排序，所以插件会持续把它掰回分组模式；
  但只要用户亲手点过 Cline 的排序按钮，本会话内就完全听用户的。自动点击带 6 秒冷却，
  避免「模式判断失误 → 点击 → 又失误」的循环。

- **同名项目**：Cline 的原生分组标题只显示文件夹名，两块盘上各有一个 `LLM` 时，早期版本会
  把第二个直接丢掉。现在标签由 `labelize()` 统一生成：重名就带上级目录 `LLM (workspace)`，
  还重名就加序号，保证一屏之内标签不重复；每行的 `title` 始终是完整路径。
  原生标题拿不到路径，所以当一个重名项目已经有原生分组时，我们无法判断原生那行是哪个 ——
  这时两行都列出（宁可看起来多一行，也不能让真项目消失），并且这种行**不写**「暂无会话」，
  不确定的事实不做声明。

- **登记表键名**：不再写死 `cline.code.workspace-selection.v2`，改为扫描 localStorage 取版本号最大的
  `...vN`（`registryKey()`）；Cline 哪天升到 v3 也不会静默变成 0 行。真要指定，
  `ckit config --storage-key=...` 覆盖；不想出现在侧边栏的目录用 `ckit config --hide=<路径>`。

## language-picker — 在 Cline 里面选语言

Cline 原生没有语言设置，所以这一行由插件加进它自己的设置页：锚在「深色模式」那一行后面，
结构照抄它旁边的行（`div.flex … border-b py-4` + 左侧标题/说明 + 右侧按钮组），选中的按钮用
原生同款 `ring-2 ring-ring`。定位靠 `[role=switch]` 反查容器，而且**给所有候选容器打分**——
通知设置那种小面板也有 8 个开关，取第一个匹配会插错地方。

点一下不在这个窗口里翻译（payload 是在 Node 侧拼装的），而是走一条最短的回路：

1. 按钮把 `cline-kit.language-pending = <code>` 写进 localStorage；
2. 常驻注入器下一轮（≤4 s）读到它，**读后即清**，把 `dictionary` 写进 `%APPDATA%\cline-kit\config.json`；
3. payload 版本变化 → 重新注入 → 引擎按节点上记的原文重新翻译，整个窗口跟着变，不刷新、不重启。

「读后即清」是这里的关键：pending 是一次性的请求，不是第二个状态来源。否则终端里
`ckit locales ko` 改完，会被上一次点击留下的旧 intent 立刻改回去。

`English` 一项对应 `dictionary: "none"`——插件继续跑，但词典是空的，不替换任何文案。

两个必须记住的工程约束：

- **`__build` 要把 config 一起算进去**。只按源码算哈希时，语言变了但插件源码没变，
  `language-picker` 会守卫命中直接 return，界面上选中的还是上一个语言。
- **`data-ckit-ui`**：引擎跳过标记节点内部的文本与属性（结果按节点记忆，避免每次遍历都 `closest()`），
  否则「按钮文案被自己翻译 → observer 再次触发」这类自反馈会在窗口里复现。

## 自检

`ckit doctor` 读的是**页面里**的状态而不是配置文件里的期望值：插件把计数写在
`window.__clineKitFeatureState["sidebar-groups_stats"]`（登记项目数、原生分组数、打算补几行、
实际补了几行），doctor 通过调试端口把它取回来打印。Cline 改版导致选择器失效时，
这里会直接显示 `row(s) added = 0`，而不是让人对着空侧边栏猜。

每个插件的 stats 形状不同，所以 doctor 按形状分别概括：侧边栏报行数，`language-picker` 报
`row present / row not on screen (no-settings-page), current zh-CN, 6 choices`——设置页没打开时
那一行本来就不该在，这不算 FAIL。

路径、标签、容器判定这些纯逻辑放在 `src/features/sidebar-groups.logic.js`（UMD：浏览器里挂到
`window.__ckitSidebarLogic`，测试里按 CommonJS 引入）。`src/features/index.js` 装载插件时把
这个文件拼在脚本前面，`npm test` 直接对它断言。

## 写一个新插件

1. 在 `src/features/` 放一个浏览器端 IIFE 文件。顶部的 `var VER` 只是给人看的版本号——热替换按源码
   内容哈希自动判定（外层 payload 版本 = 字典版本 + 整段源码哈希，每个插件还会收到自己的源码哈希
   `CFG.__build`），改代码不需要手动 bump 任何东西。
2. 在 `src/features/index.js` 的 `DEFS` 里登记 `id / file / title / defaultOn / build(ctx)`，
   `build` 返回的 JSON 会挂到 `window.__clineZhFeature[id]`。
3. 插件内所有动态文本用 `t("key", "English fallback")` 取，**兜底写英文**（英文是应用的源语言，没有
   对应语言包时插件仍可读）。译文放在词典的 `featureText[<id>]` 里，注册表会注入成 `CFG.text`。
4. 自己插入的 DOM 打上 `data-czh-feat="<id>"`，并在扫描时排除自身，否则会和自己的 MutationObserver
   互相触发。

插件源码会被包进一个闭包里执行，抛错只影响该插件本身，不会带走词典和引擎。
