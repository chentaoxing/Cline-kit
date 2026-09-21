#!/usr/bin/env node
"use strict";
// make-portable.js - build the zip that needs nothing preinstalled: it carries its own Node runtime.
//
//   node scripts/make-portable.js <path-to-node.exe> <out.zip>
//
// Why this exists: every current route (npm, the plain zip, source) needs Node on PATH. That is fine
// for a developer and a wall for the people who chose the desktop app precisely to stay out of a
// terminal. This artifact is the "extract, double-click install.cmd, done" path.
//
// The bundled binary is pinned by SHA-256 in scripts/portable-node.json and verified against
// nodejs.org's own SHASUMS256.txt by the caller before it gets here - a release we hand to strangers
// must not contain an unchecked executable. This script re-checks the version by executing it, so a
// wrong or corrupt node.exe cannot slip into the artifact.
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const { build } = require("./make-zip");

const PIN = JSON.parse(fs.readFileSync(path.join(__dirname, "portable-node.json"), "utf8"));
const ROOT = path.join(__dirname, "..");

const APP_FILES = ["src", "dictionaries", "package.json", "README.md", "README.zh-CN.md",
  "LICENSE", "NOTICE", "SECURITY.md", "CHANGELOG.md"];

function win(text) { return text.replace(/\r?\n/g, "\r\n"); }

function main() {
  const [nodeExe, outArg] = process.argv.slice(2);
  if (!nodeExe || !outArg) {
    console.error("usage: node scripts/make-portable.js <path-to-node.exe> <out.zip>");
    process.exit(1);
  }
  const exe = path.resolve(nodeExe);
  if (!fs.existsSync(exe)) { console.error("no such node.exe: " + exe); process.exit(1); }

  // Execute it rather than trust the filename: this is the last gate before it ships.
  const version = cp.execFileSync(exe, ["--version"], { encoding: "utf8" }).trim();
  if (version !== PIN.version) {
    console.error(`bundled node is ${version}, but scripts/portable-node.json pins ${PIN.version}`);
    process.exit(1);
  }
  console.log("bundled runtime: " + version + " (" + Math.round(fs.statSync(exe).size / 1048576) + " MB)");

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "ckit-portable-"));
  try {
    const bundle = path.join(stage, "cline-kit-portable");
    fs.mkdirSync(path.join(bundle, "app"), { recursive: true });
    fs.copyFileSync(exe, path.join(bundle, "node.exe"));

    for (const item of APP_FILES) {
      const from = path.join(ROOT, item);
      if (!fs.existsSync(from)) { console.error("missing payload item: " + item); process.exit(1); }
      fs.cpSync(from, path.join(bundle, "app", item), { recursive: true });
    }

    fs.writeFileSync(path.join(bundle, "ckit.cmd"), win([
      "@echo off",
      "rem Runs the kit on the Node runtime inside this folder - nothing is installed system-wide.",
      "setlocal",
      `set "NODE=%~dp0node.exe"`,
      `set "APP=%~dp0app\\src\\cli.js"`,
      `"%NODE%" "%APP%" %*`,
      "exit /b %ERRORLEVEL%",
      ""
    ].join("\n")));

    fs.writeFileSync(path.join(bundle, "install.cmd"), win([
      "@echo off",
      "rem Double-click this once. It points your existing Cline shortcuts at the kit and then",
      "rem leaves you alone - from then on you just open Cline normally.",
      "setlocal",
      `set "NODE=%~dp0node.exe"`,
      `set "APP=%~dp0app\\src\\cli.js"`,
      `echo Setting up Cline-kit from %~dp0`,
      "echo.",
      `"%NODE%" "%APP%" install`,
      "if errorlevel 1 goto :fail",
      `"%NODE%" "%APP%" locales`,
      "echo.",
      "echo Done. Open Cline from your Start Menu shortcut - the sidebar and language row are active.",
      "echo To undo all of this, run: ckit.cmd uninstall",
      "goto :end",
      ":fail",
      "echo.",
      "echo Setup failed. The message above says why; Cline itself has not been modified.",
      ":end",
      "echo.",
      "pause",
      ""
    ].join("\n")));

    // Bilingual, Chinese first: the audience for a no-terminal package is precisely the person who
    // does not want to read English setup instructions in a terminal tool's README.
    fs.writeFileSync(path.join(bundle, "START-HERE.txt"), win([
      "Cline-kit 便携包 / Portable package",
      "==================================",
      "",
      "【中文】安装只需两步：",
      "",
      "  1. 把整个文件夹解压到一个固定位置（例如 文档\\cline-kit），不要留在压缩包里运行。",
      "  2. 双击 install.cmd。",
      "",
      "完成后照常从开始菜单点开 Cline 就行——侧边栏会常驻列出你登记过的全部项目，",
      "设置页里会多出一行「界面语言」可以换语言。之后不需要再碰命令行。",
      "",
      "这个文件夹自带 Node 运行时，所以电脑上是空的也能用；不会往系统里装任何东西，",
      "也不修改 Cline 自己的文件——快捷方式的原始指向已经先备份，运行 ckit.cmd uninstall",
      "即可完全还原。换语言也可以在命令行输入：ckit.cmd locales",
      "",
      "要求：Windows 10/11，且已安装 Cline 桌面版。",
      "如果点开 Cline 后没有看到这些功能，说明 Cline 不是通过快捷方式启动的；",
      "运行一次 ckit.cmd start 即可。",
      "",
      "-----------------------------------------------------------------------------",
      "",
      "【English】Two steps:",
      "",
      "  1. Unzip this folder somewhere that will stay put (Documents\\cline-kit is fine).",
      "     Do not run it from inside the zip.",
      "  2. Double-click install.cmd.",
      "",
      "Then open Cline from your Start Menu as you always do. Every registered project stays",
      "visible in the sidebar, and Settings gains an 'Interface language' row. No terminal",
      "needed after that.",
      "",
      "This folder carries its own Node runtime, so nothing has to be installed. Nothing is",
      "written into Windows and Cline's own files are not modified - the shortcut target is",
      "recorded first, and `ckit.cmd uninstall` restores it exactly. `ckit.cmd locales`",
      "changes the language from a command line if you prefer.",
      "",
      "Requires Windows 10/11 and the Cline desktop app. If the enhancements are missing after",
      "opening Cline, it was started without the shortcut - run `ckit.cmd start` once.",
      "",
      "Node's licence and provenance: THIRD-PARTY-NODE.md",
      ""
    ].join("\n")));

    fs.writeFileSync(path.join(bundle, "THIRD-PARTY-NODE.md"), win([
      "# Bundled runtime",
      "",
      "This package contains `node.exe` from the official Node.js distribution so it works with",
      "nothing preinstalled.",
      "",
      "* Version: **" + PIN.version + "** (win-x64)",
      "* Downloaded from: " + PIN.url,
      "* SHA-256 of the distribution zip: `" + PIN.sha256 + "`",
      "  (verified against " + PIN.shasumsUrl + " during the build)",
      "* Node.js licence: MIT - full text at " + PIN.licenseUrl,
      "",
      "Node.js is a trademark of the Node Foundation and is not affiliated with, or endorsing,",
      "this project. Cline-kit itself is MIT licensed; see LICENSE.",
      ""
    ].join("\n")));

    const out = path.resolve(outArg);
    const r = build(bundle, out);
    console.log(path.basename(out) + ": " + r.entries + " files, " + Math.round(r.bytes / 1048576) + "." +
      Math.round((r.bytes / 1048576 % 1) * 10) + " MB");
    if (!r.names.includes("node.exe") || !r.names.includes("install.cmd")) {
      console.error("portable package is missing its runtime or its entry point");
      process.exit(1);
    }
    if (r.names.some((n) => n.indexOf("\\") >= 0)) {
      console.error("portable package contains backslash entry names");
      process.exit(1);
    }
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main();
