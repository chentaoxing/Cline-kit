"use strict";
// Merge source-extracted strings into dictionaries/zh-CN.json.
// Keys here are *prefixes*; the script resolves each to the unique full English string taken from
// .cache/source-keys.json, so long sentences never have to be retyped (and typos fail loudly).
//   node scripts/merge-source-keys.js [--dry]
const fs = require("fs");
const path = require("path");

const extracted = JSON.parse(fs.readFileSync(path.join(__dirname, "..", ".cache", "source-keys.json"), "utf8"));
const DICT = path.join(__dirname, "..", "dictionaries", "zh-CN.json");
const dict = JSON.parse(fs.readFileSync(DICT, "utf8"));
const dry = process.argv.includes("--dry");

const MAP = {
  "A curated set of plugins": "来自 Cline 社区的插件、MCP 服务器与技能精选集。",
  "About worktrees": "关于工作树",
  "Add SSH Host": "添加 SSH 主机",
  "Add a message to go with": "为附件补充一条说明",
  "Add an OpenAI-compatible provider": "添加 OpenAI 兼容服务商并选择其可用模型。",
  "Anthropic, OpenAI, OpenRouter": "Anthropic、OpenAI、OpenRouter 等。",
  "Authorization=Bearer token": "Authorization=Bearer 令牌",
  "Back to providers": "返回服务商列表",
  "Behind base": "落后于基线分支",
  "Branch name": "分支名称",
  "Build software with Cline": "用 Cline 构建软件",
  "Cancel rename": "取消重命名",
  "Checking GitHub connection": "正在检查 GitHub 连接",
  "Checking for updates": "正在检查更新…",
  "Checks failing": "检查未通过",
  "Choose PNG, JPEG, GIF": "选择 PNG、JPEG、GIF 或 WebP 图片；其他文件请切换到「本地」。",
  "Choose a model that supports images": "请选择支持图片的模型，或在发送前移除图片。",
  "Clear provider search": "清除服务商搜索",
  "Cline API key": "Cline API 密钥",
  "Cline has a question": "Cline 有个问题",
  "Close details": "收起详情",
  "Close diff view": "关闭差异视图",
  "Close expanded attachment": "收起展开的附件",
  "Close image viewer": "关闭图片查看器",
  "Close menu": "关闭菜单",
  "Cloud attachment limit": "云端附件数量上限",
  "Cloud branch": "云端分支",
  "Cloud repository": "云端代码库",
  "Cloud session": "云端会话",
  "Cloud sessions": "云端会话列表",
  "Command Palette": "命令面板",
  "Configure a model provider to set up voice input": "先配置一个模型服务商才能设置语音输入",
  "Connect GitHub": "连接 GitHub",
  "Connect messaging platforms": "接入消息平台，随时随地与 Cline 对话。点击频道名称即可查看。",
  "Copy API key": "复制 API 密钥",
  "Copy failed": "复制失败",
  "Copy file path": "复制文件路径",
  "Could not load more sessions": "无法加载更多会话",
  "Could not open file": "无法打开文件",
  "Could not steer queued message": "无法插入排队中的消息",
  "Create a copy of the current session": "把当前会话复制为一个新会话",
  "Current model": "当前模型",
  "Daily code review": "每日代码审查",
  "Delete failed": "删除失败",
  "Describe what you want Cline to do": "先说明你希望 Cline 如何处理这些附件，再发送。",
  "Dismiss pull request error": "忽略拉取请求错误",
  "Enable MCP server": "启用 MCP 服务器",
  "Enable voice input": "启用语音输入",
  "Expand sidebar": "展开侧边栏",
  "Expanded attachment": "已展开的附件",
  "Failed to start run": "启动运行失败",
  "Filter by title or folder": "按标题或文件夹筛选",
  "First page": "第一页",
  "Fork failed": "派生失败",
  "Go to next page": "下一页",
  "Go to previous page": "上一页",
  "Header name": "请求头名称",
  "Install Model Context Protocol servers": "向此 CLI 环境安装 MCP（Model Context Protocol）服务器。",
  "Install plugins into this CLI environment": "向此 CLI 环境安装插件。",
  "Install skills globally for Cline": "为 Cline 全局安装技能。",
  "List, create, and update events": "在你的 Google 日历上列出、创建与更新日程。",
  "Loading connector catalog": "正在加载连接器目录",
  "Loading connectors": "正在加载连接器",
  "MCP Server": "MCP 服务器",
  "MCP Servers": "MCP 服务器",
  "MCP servers": "MCP 服务器",
  "Main Agent Session": "主智能体会话",
  "Merge status pending": "合并状态待确认",
  "My Provider": "我的服务商",
  "New model ID": "新模型 ID",
  "Next generated image": "下一张生成图",
  "No app update is available": "暂时没有可下载的应用更新。你仍可继续工作——Cline 会保持与已更新的 Hub 连接——请稍后再试。",
  "No conflicts": "无冲突",
  "Open API providers": "打开 API 服务商",
  "Open GitHub": "打开 GitHub 的分支对比页面。提交前先推送你的 commit。",
  "Open in editor": "在编辑器中打开",
  "Open this agent": "打开该智能体的会话",
  "Parent remote directory": "上级远程目录",
  "Pick your repositories": "选择你的代码库",
  "Previous generated image": "上一张生成图",
  "Pull request status": "拉取请求状态",
  "Read, search, draft, and send email": "从你的 Gmail 账户读取、搜索、起草并发送邮件。",
  "Ready to merge": "可以合并",
  "Refresh channels": "刷新频道",
  "Refresh pull request status": "刷新拉取请求状态",
  "Refresh remote directories": "刷新远程目录",
  "Remote home directory": "远程主目录",
  "Remove header": "移除请求头",
  "Rename failed": "重命名失败",
  "Restart failed": "重启失败",
  "Restore checkpoint": "恢复检查点",
  "Run limits": "运行上限",
  "Run not started": "运行未启动",
  "Run started": "运行已启动",
  "Save title": "保存标题",
  "Search branches": "搜索分支",
  "Search branches…": "搜索分支…",
  "Search channels": "搜索频道",
  "Search connectors": "搜索连接器",
  "Search for a command to run": "搜索要执行的命令…",
  "Search marketplace": "搜索市场",
  "Search repositories": "搜索代码库…",
  "Select all sessions": "全选会话",
  "Select transport": "选择传输方式",
  "Session history is unavailable": "会话历史暂时不可用。",
  "Session history": "会话历史",
  "Sign in to Cline": "登录 Cline",
  "Sign in with Cline": "使用 Cline 账户登录",
  "Sort sessions": "会话排序",
  "Speech input failed": "语音输入失败",
  "Start a session": "新建会话",
  "Start the task with an agent team": "用智能体团队开始该任务",
  "Stop agent": "停止智能体",
  "Stop the agent": "停止智能体 (Esc)",
  "System prompt override": "系统提示词覆盖",
  "Task failed": "任务失败",
  "The file path could not be copied": "文件路径无法复制到剪贴板。",
  "The message could not be copied": "该消息无法复制到剪贴板。",
  "The new version has been downloaded": "新版本已下载完成。可立即重启，或稍后点击 Cline 图标旁的更新按钮。",
  "The session could not be removed": "该会话无法从本地历史中移除。",
  "The update check could not be started": "无法开始更新检查，请稍后重试。",
  "This model doesn": "该模型不支持图片输入",
  "Toggling rules": "暂不支持切换规则开关",
  "Unable to check for updates": "无法检查更新",
  "Unable to open run": "无法打开该运行",
  "Unsupported cloud attachment": "不支持的云端附件",
  "Update check failed": "更新检查失败",
  "Use your own API key": "使用你自己的 API 密钥",
  "Voice input model": "语音输入模型",
  "Work with issues, pull requests": "在 GitHub 上处理 issue、拉取请求与代码库。",
  "Working directory": "工作目录",
  "You're already running the latest": "你已经在运行最新版 Cline。",
  "You're up to date": "已是最新版本"
};

const candidates = extracted.missing.map((m) => m.text);
const uniq = [...new Set(candidates)];
let added = 0, ambiguous = [], unmatched = [];

for (const [prefix, zh] of Object.entries(MAP)) {
  const hits = uniq.filter((t) => t.startsWith(prefix));
  if (!hits.length) { unmatched.push(prefix); continue; }
  if (hits.length > 1) {
    // prefer the shortest match (the prefix itself) only if it is unique by length
    const exact = hits.find((t) => t === prefix);
    if (!exact) { ambiguous.push(prefix + " -> " + hits.length + " hits"); continue; }
    hits.length = 0; hits.push(exact);
  }
  const en = hits[0];
  if (dict.entries[en] && dict.entries[en] !== zh) {
    console.log("keep existing:", en.slice(0, 50), "!=", zh);
    continue;
  }
  if (!dict.entries[en]) { dict.entries[en] = zh; added++; }
}

console.log("added:", added, "ambiguous:", ambiguous.length, "unmatched prefixes:", unmatched.length);
ambiguous.forEach((a) => console.log("  AMBIG " + a));
unmatched.forEach((u) => console.log("  UNMATCHED " + u));

const still = uniq.filter((t) => !dict.entries[t]);
console.log("source strings still untranslated:", still.length);
still.slice(0, 25).forEach((t) => console.log("   - " + t.slice(0, 80)));

if (!dry && added) {
  dict.version = 3;
  dict.updated = new Date().toISOString().slice(0, 10);
  dict.clineVersion = "0.0.32";
  dict.source = "dictionaries/zh-CN.json extended with strings extracted from apps/examples/desktop-app/webview";
  fs.writeFileSync(DICT, JSON.stringify(dict, null, 1) + "\n", "utf8");
  console.log("wrote", DICT, "version", dict.version, "entries", Object.keys(dict.entries).length);
} else if (dry) {
  console.log("(dry run, nothing written)");
}
