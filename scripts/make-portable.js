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

    fs.writeFileSync(path.join(bundle, "START-HERE.txt"), win([
      "Cline-kit - portable package",
      "============================",
      "",
      "1. Unzip this folder somewhere that will stay put (Documents\\cline-kit is fine).",
      "2. Double-click install.cmd.",
      "3. Open Cline the way you always do. Your Start Menu shortcut now launches it with the",
      "   enhancements: every registered project stays visible in the sidebar, and Settings",
      "   gains an 'Interface language' row.",
      "",
      "Nothing is installed into Windows and Cline's own files are not modified - the shortcut",
      "target is recorded first and `ckit.cmd uninstall` puts it back exactly.",
      "",
      "To change the interface language, open Cline, go to Settings, and use the",
      "'Interface language' row. `ckit.cmd locales` does the same from a command line.",
      "",
      "This folder carries its own Node " + PIN.version + " runtime, so no separate install is",
      "needed. See THIRD-PARTY-NODE.md for what that means for licensing.",
      "",
      "Requires Windows 10/11 and the Cline desktop app.",
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
