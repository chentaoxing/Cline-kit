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
- **分组模式不持久**：Cline 重启会回到按时间排序，所以加载后自动切回分组**一次**；
  之后用户手动改回时间模式，插件本轮就不再干预。

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
