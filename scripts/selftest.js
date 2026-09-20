#!/usr/bin/env node
"use strict";
// selftest.js - dependency-free checks for everything that does not need a browser.
// Run with: npm test   (node scripts/selftest.js)
// The point is to catch the failures that cost real debugging time here: whitespace normalisation,
// path handling, the label collision rule, container filtering, dictionary validation, and payload
// version churn.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const L = require("../src/features/sidebar-groups.logic.js");
const features = require("../src/features");
const dict = require("../src/dict");
const payload = require("../src/payload");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failures.push([name, e]); console.log("  FAIL " + name + "\n       " + (e && e.message ? e.message.split("\n")[0] : e)); }
}

console.log("cline-kit selftest");

// ---------------------------------------------------------------- path helpers
test("norm collapses every kind of whitespace", () => {
  assert.strictEqual(L.norm("  New   Task\n\t here "), "New Task here");
  // regression: a lost backslash here turns the class into "one or more s", which matches nothing
  assert.strictEqual(L.norm("a\nb"), "a b");
  assert.strictEqual(L.norm("session history"), "session history");
  assert.strictEqual(L.norm(null), "");
  assert.strictEqual(L.norm(undefined), "");
});

test("base / parent handle Windows, POSIX and trailing separators", () => {
  assert.strictEqual(L.base("E:\\Agent\\Date\\Cline\\workspace\\APP开发"), "APP开发");
  assert.strictEqual(L.base("/home/me/proj/"), "proj");
  assert.strictEqual(L.base("Cline"), "Cline");
  assert.strictEqual(L.base(""), "");
  assert.strictEqual(L.parent("E:\\a\\b\\c"), "b");
  assert.strictEqual(L.parent("/a/b/c"), "b");
  assert.strictEqual(L.parent("solo"), "");
  assert.strictEqual(L.strip("E:\\a\\b\\\\"), "E:\\a\\b");
});

test("samePath ignores case and trailing slashes", () => {
  assert.ok(L.samePath("D:\\Programs\\Cline\\", "d:\\programs\\cline"));
  assert.ok(!L.samePath("D:\\A", "D:\\AB"));
});

// ---------------------------------------------------------------- containers
const ALL = [
  "E:\\Agent\\Date\\Cline\\workspace",
  "E:\\Agent\\Date\\Cline\\workspace\\LLM",
  "E:\\Agent\\Date\\Cline\\workspace\\爬虫",
  "D:\\Projects\\solo"
];
test("a path that contains other registered paths is a container", () => {
  assert.ok(L.isContainer(ALL[0], ALL, {}));
  assert.ok(!L.isContainer(ALL[1], ALL, {}));
  assert.ok(!L.isContainer(ALL[3], ALL, {}));
});

test("the app install directory and hidden paths are filtered too", () => {
  const opts = { installDir: "D:\\Programs\\Cline\\", hide: ["E:\\Secret\\Project"] };
  assert.ok(L.isContainer("D:\\Programs\\Cline", ALL, opts));
  assert.ok(L.isContainer("D:\\Programs\\Cline\\sub\\thing", ALL, opts));
  assert.ok(L.isContainer("E:\\Secret\\Project\\", ALL, opts));
  assert.ok(!L.isContainer("D:\\Programs\\Other", ALL, opts));
});

// ---------------------------------------------------------------- labels
test("unique folder names are shown as-is", () => {
  const out = L.labelize(["C:\\x\\LLM", "C:\\y\\爬虫"]);
  assert.deepStrictEqual(out, [{ path: "C:\\x\\LLM", label: "LLM" }, { path: "C:\\y\\爬虫", label: "爬虫" }]);
});

test("colliding folder names gain their parent folder", () => {
  const out = L.labelize(["E:\\one\\projA\\LLM", "D:\\two\\projB\\LLM"]);
  assert.deepStrictEqual(out.map((e) => e.label), ["LLM (projA)", "LLM (projB)"]);
});

test("labels stay unique even when the parents collide", () => {
  const out = L.labelize(["E:\\workspace\\LLM", "D:\\workspace\\LLM", "F:\\workspace\\LLM"]);
  assert.deepStrictEqual(out.map((e) => e.label), ["LLM (workspace)", "LLM (2)", "LLM (3)"]);
  assert.strictEqual(new Set(out.map((e) => e.label)).size, 3);
});

// ---------------------------------------------------------------- row picking
test("plan skips native groups, containers and duplicates", () => {
  const got = L.plan(ALL, ["LLM"], { installDir: "", hide: [] });
  assert.ok(!got.some((e) => e.path === ALL[0]), "container must not be listed");
  assert.ok(!got.some((e) => e.path === ALL[1]), "already shown natively");
  assert.deepStrictEqual(got.map((e) => e.path), [ALL[2], ALL[3]]);
  // the same path registered twice yields one row
  assert.deepStrictEqual(L.plan([ALL[3], ALL[3], ALL[2]], [], {}).map((e) => e.path), [ALL[3], ALL[2]]);
});

test("a same-named project is never silently dropped", () => {
  // Cline's own headers carry no path, only the folder name, so when the registry holds two
  // different folders called LLM we cannot tell which one the native "LLM" group is. Showing both
  // (qualified, and without the "no sessions" claim) beats hiding a real project.
  const paths = ["D:\\chat\\LLM", "E:\\work\\LLM"];
  const got = L.plan(paths, ["LLM"], { installDir: "" });
  assert.deepStrictEqual(got.map((e) => e.label), ["LLM (chat)", "LLM (work)"]);
  assert.deepStrictEqual(got.map((e) => e.path), paths);
});

test("plan honours maxRows and survives empty input", () => {
  const many = [];
  for (let i = 0; i < 50; i++) many.push("C:\\p\\proj" + i);
  assert.strictEqual(L.plan(many, [], { maxRows: 7 }).length, 7);
  assert.deepStrictEqual(L.plan([], [], {}), []);
  assert.deepStrictEqual(L.plan(undefined, undefined, undefined), []);
});

test("pickMissing works on pre-labelled entries too", () => {
  const entries = L.labelize(["C:\\a\\One", "C:\\b\\Two"]);
  assert.deepStrictEqual(L.pickMissing(entries, ["Two"], {}).map((e) => e.label), ["One"]);
});

// ---------------------------------------------------------------- registry key
test("registryKey follows the highest versioned key Cline exposes", () => {
  assert.strictEqual(
    L.registryKey(["something.else", "cline.code.workspace-selection.v2", "cline.code.workspace-selection.v3"]),
    "cline.code.workspace-selection.v3");
  assert.strictEqual(L.registryKey(["cline.code.workspace-selection.v10", "cline.code.workspace-selection.v2"]),
    "cline.code.workspace-selection.v10");
  assert.strictEqual(L.registryKey(["foo", "cline.code.workspace-selection"]), null);
  assert.strictEqual(L.registryKey([]), null);
});

test("isUnder respects separators and drive letters", () => {
  assert.ok(L.isUnder("D:\\Programs\\Cline\\app", "d:\\programs\\cline"));
  assert.ok(L.isUnder("D:\\Programs\\Cline", "D:\\Programs\\Cline"), "equal counts as under");
  assert.ok(!L.isUnder("D:\\Programs\\ClineX", "D:\\Programs\\Cline"), "prefix is not containment");
  assert.ok(!L.isUnder("D:\\A", "E:\\A"));
});

test("parseRegistry survives malformed storage", () => {
  assert.deepStrictEqual(L.parseRegistry(null), { workspaces: [], last: "" });
  assert.deepStrictEqual(L.parseRegistry("{ not json"), { workspaces: [], last: "" });
  const ok = JSON.stringify({ environments: { local: { workspaces: ["C:\\a"], lastWorkspace: "C:\\a" } } });
  assert.deepStrictEqual(L.parseRegistry(ok), { workspaces: ["C:\\a"], last: "C:\\a" });
  assert.deepStrictEqual(L.parseRegistry(JSON.stringify({ environments: { local: { workspaces: "nope" } } })),
    { workspaces: [], last: "" });
});

// ---------------------------------------------------------------- registry wiring
test("every declared feature file exists and parses a version", () => {
  for (const f of features.list()) {
    assert.ok(f.version > 0, f.id + " version parsed as " + f.version + " (file missing?)");
    assert.ok(/[a-z0-9-]+/.test(f.id));
  }
});

test("the injected feature source carries its logic module", () => {
  const { picked } = features.resolve({ features: {} }, {});
  const f = picked.find((x) => x.id === "sidebar-groups");
  assert.ok(f, "sidebar-groups should be on by default");
  assert.ok(f.source.includes("__ckitSidebarLogic"), "logic module must be prepended");
  assert.ok(f.source.includes("var VER = " + f.version), "version marker must survive concatenation");
});

test("every feature's text keys stay in sync with every dictionary", () => {
  const dir = path.join(__dirname, "..", "src", "features");
  for (const def of features.DEFS) {
    const file = (def.parts || [def.file])[def.parts ? def.parts.length - 1 : 0];
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    const used = new Set([...src.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
    if (!used.size) continue;
    for (const code of dict.available()) {
      const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dictionaries", code + ".json"), "utf8"));
      const have = Object.keys((d.featureText || {})[def.id] || {});
      for (const k of used) assert.ok(have.includes(k), `${def.id} asks for "${k}" which ${code} does not define`);
      for (const k of have) assert.ok(used.has(k), `${code} carries unused key ${def.id}.${k}`);
    }
  }
});

// ---------------------------------------------------------------- dictionary
test("the bundled zh-CN dictionary validates", () => {
  const d = JSON.parse(fs.readFileSync(dict.bundledPath("zh-CN"), "utf8"));
  assert.ok(dict.validate(d), "bundled dictionary rejected");
  assert.ok(Object.keys(d.entries).length > 300, "dictionary got smaller than it should be");
  for (const k of Object.keys(d.entries)) {
    assert.strictEqual(k, k.trim(), "entry key has surrounding space: " + JSON.stringify(k));
    assert.ok(!/[一-鿿]/.test(k), "entry key must be an English source string: " + k);
    assert.ok(d.entries[k].length > 0);
  }
  for (const r of d.rules) assert.ok(r.pattern.startsWith("^") && r.pattern.endsWith("$"));
});

test("validate rejects the shapes a remote file could wrongly have", () => {
  const good = { version: 1, entries: { A: "甲" }, rules: [], prefixes: [] };
  assert.ok(dict.validate(good));
  assert.ok(!dict.validate({ ...good, version: "1" }), "version must be numeric");
  assert.ok(!dict.validate({ ...good, entries: [] }), "entries must be an object");
  assert.ok(!dict.validate({ ...good, rules: [{ pattern: "Delete", out: "甲" }] }), "unanchored regex rejected");
  assert.ok(!dict.validate({ ...good, rules: [{ pattern: "^([)", out: "甲" }] }), "uncompilable regex rejected");
  assert.ok(!dict.validate({ ...good, rules: [{ pattern: "^(x+)+$", out: "甲" }] }), "nested quantifier rejected");
  assert.ok(dict.validate({ ...good, prefixes: [{ from: "New", to: "新建" }] }), "well-formed prefix rule accepted");
  assert.ok(!dict.validate({ ...good, prefixes: [{ from: "New" }] }), "prefix needs a replacement");
  assert.ok(!dict.validate({ ...good, featureText: { x: { k: 1 } } }), "featureText values must be strings");
  assert.strictEqual(dict.nestedQuantifier("^(a+)+$"), true);
  assert.strictEqual(dict.nestedQuantifier("^(a){2,}$"), false);
  assert.strictEqual(dict.nestedQuantifier("^(Delete|Remove)\\s(.*)$"), false);
  assert.strictEqual(dict.nestedQuantifier("^\\(weird\\)+$"), false, "escaped parens are not groups");
});

// ---------------------------------------------------------------- payload version
test("payload version is stable and reacts to content, not to call order", () => {
  const conf = { clinePath: "D:\\Programs\\Cline\\cline-app.exe", dictionary: "zh-CN", features: {}, featureHide: [] };
  const a = payload.compose(conf).version;
  const b = payload.compose(Object.assign({}, conf)).version;
  assert.strictEqual(a, b, "same inputs must give the same version");
  assert.ok(/^d\d+\+[0-9a-f]{9}$/.test(a), "version shape: " + a);
  const off = payload.compose(Object.assign({}, conf, { features: { "sidebar-groups": false } })).version;
  assert.notStrictEqual(a, off, "disabling a feature has to change the payload");
});

// ---------------------------------------------------------------- release hygiene
test("no personal paths or addresses in anything we ship", () => {
  // Patterns are assembled so this file cannot match itself.
  const user = (process.env.USERNAME || process.env.USER || "").toLowerCase();
  const BS = String.fromCharCode(92); // assembled so this file cannot match its own needles
  const profileRe = new RegExp("c:[" + BS + BS + "/]{1,}users[" + BS + BS + "/]{1,}([^" + BS + "/\\s\"']{1,40})", "gi");
  const profileHit = (body) => {
    profileRe.lastIndex = 0;
    let m;
    while ((m = profileRe.exec(body))) {
      // C:\Users\Public is a Windows well-known folder, not a personal profile
      if (m[1].toLowerCase() !== "public") return m[1];
    }
    return null;
  };
  const needles = [
    { test: (b) => profileHit(b), what: "a Windows user profile path", where: null },
    { test: (b) => /ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9]{10,}/.test(b), what: "a GitHub token", where: null },
    // an e-mail is legitimate author attribution in package.json / NOTICE / README; anywhere else it
    // is almost certainly an audit report or a screenshot note that escaped into the repo.
    { test: (b) => /[\w.+-]+@(gmail|outlook|qq|163|foxmail)\./i.test(b), what: "a personal e-mail address", where: ["src/", "scripts/", "dictionaries/", "docs/"] }
  ];
  if (user.length > 3) {
    const re = new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    needles.push({ test: (b) => re.test(b), what: "this machine's username", where: null });
  }
  const root = path.join(__dirname, "..");
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return [".git", "node_modules", ".cache"].includes(e.name) ? [] : walk(p);
    return /\.(js|json|md|yml|yaml|txt|ps1|vbs)$/.test(e.name) ? [p] : [];
  });
  const offenders = [];
  for (const f of walk(root)) {
    const rel = path.relative(root, f).replace(/\\/g, "/");
    if (rel === "scripts/selftest.js" || rel === "docs/RELEASE-CHECKLIST.md") continue;
    const body = fs.readFileSync(f, "utf8");
    for (const n of needles) {
      if (n.where && !n.where.some((dir) => rel.startsWith(dir))) continue;
      if (n.test(body)) offenders.push(rel + " -> " + n.what);
    }
  }
  assert.deepStrictEqual(offenders, [], "ship-clean check failed:\n        " + offenders.join("\n        "));
});

// ---------------------------------------------------------------- locale packs
test("every bundled dictionary is complete against the reference", () => {
  const ref = JSON.parse(fs.readFileSync(dict.bundledPath("zh-CN"), "utf8"));
  const locales = process.env.CKIT_LOCALE ? [process.env.CKIT_LOCALE] : dict.available();
  assert.ok(locales.includes("zh-CN") || process.env.CKIT_LOCALE, "reference locale missing");
  const keySet = (o) => Object.keys(o).sort();
  for (const name of locales) {
    const d = JSON.parse(fs.readFileSync(dict.bundledPath(name), "utf8"));
    assert.ok(dict.validate(d), name + ": failed schema validation");
    assert.strictEqual(d.language, name, name + ": language field must match the file name");
    assert.ok(typeof d.label === "string" && d.label.length > 1, name + ": needs a display label");
    assert.deepStrictEqual(keySet(d.entries), keySet(ref.entries), name + ": entry keys differ from zh-CN");
    assert.strictEqual(d.clineVersion, ref.clineVersion, name + ": calibrated against a different Cline");
    for (const k of Object.keys(d.entries)) {
      const v = d.entries[k];
      assert.ok(v && v.trim(), name + ": empty translation for " + JSON.stringify(k));
      assert.notStrictEqual(v, k, name + ": untranslated (value equals the English key) " + JSON.stringify(k));
      assert.strictEqual(v, v.trim(), name + ": translation has padding: " + JSON.stringify(k));
    }
    assert.deepStrictEqual(d.rules.map((r) => r.pattern), ref.rules.map((r) => r.pattern), name + ": rule set drifted");
    d.rules.forEach((r, i) => {
      assert.ok(r.out && r.out.trim(), name + ": rule " + i + " has no output");
      const groups = (r.pattern.match(/\(/g) || []).length;
      for (const m of r.out.matchAll(/\$(\d+)/g)) {
        assert.ok(Number(m[1]) <= groups, name + ": rule " + i + " references $" + m[1] + " but the pattern has " + groups + " group(s)");
      }
    });
    assert.deepStrictEqual(d.prefixes.map((p) => p.from), ref.prefixes.map((p) => p.from), name + ": prefix set drifted");
    for (const p of d.prefixes) assert.ok(p.to && p.to.trim(), name + ": empty prefix translation for " + JSON.stringify(p.from));
    for (const id of Object.keys(ref.featureText || {})) {
      assert.ok(d.featureText && d.featureText[id], name + ": no featureText block for " + id);
      assert.deepStrictEqual(keySet(d.featureText[id]), keySet(ref.featureText[id]), name + ": featureText keys differ for " + id);
      for (const k of Object.keys(d.featureText[id])) {
        assert.ok(d.featureText[id][k] && d.featureText[id][k].trim(), name + ": empty feature string " + id + "." + k);
      }
    }
  }
});

test("the updater maps the reference URL onto the selected locale", () => {
  const base = { updateUrl: "https://raw.githubusercontent.com/o/r/main/dictionaries/zh-CN.json" };
  assert.strictEqual(dict.remoteUrlFor(Object.assign({ dictionary: "ja" }, base)),
    "https://raw.githubusercontent.com/o/r/main/dictionaries/ja.json");
  assert.strictEqual(dict.remoteUrlFor(Object.assign({ dictionary: "zh-TW" }, base)),
    "https://raw.githubusercontent.com/o/r/main/dictionaries/zh-TW.json");
  const placeholder = { dictionary: "ja", updateUrl: "https://raw.githubusercontent.com/CHANGE_ME/x/main/dictionaries/zh-CN.json" };
  assert.ok(/CHANGE_ME/.test(dict.remoteUrlFor(placeholder)), "unconfigured URL stays marked");
});

test("ckit locales lists every bundled dictionary, and --help points at it", () => {
  const { spawnSync } = require("child_process");
  const node = process.execPath;
  const cli = path.join(__dirname, "..", "src", "cli.js");
  const codes = dict.available();
  assert.ok(codes.length >= 5, "expected the five bundled locales, got " + codes.join(","));

  const list = spawnSync(node, [cli, "locales"], { encoding: "utf8" });
  assert.strictEqual(list.status, 0, "ckit locales exited " + list.status + ": " + list.stderr);
  assert.match(list.stdout, /^\s+\S*none\s+English/m, "'none' must be pickable from the CLI too");
  assert.match(list.stdout, /Settings -> Interface language/, "point at the in-app choice");
  for (const code of codes) {
    assert.match(list.stdout, new RegExp("(^|\\s)" + code.replace("-", "\\-") + "\\s"), code + " missing from `ckit locales`");
    // every real locale shows its string count and dictionary version so the choice is informed
    assert.match(list.stdout, new RegExp(code.replace("-", "\\-") + "\\s+\\S+.*\\d+ strings.*v\\d+"), code + " row incomplete");
  }
  assert.match(list.stdout, /\*/, "the active language should be marked");
  assert.match(list.stdout, /ckit locales </, "should tell the user how to switch");

  const help = spawnSync(node, [cli, "help"], { encoding: "utf8" });
  assert.strictEqual(help.status, 0);
  assert.match(help.stdout, /^\s+locales\s+List the UI languages/m, "--help must document ckit locales");
  for (const c of ["start", "stop", "status", "doctor", "attach", "install", "uninstall", "features", "update", "audit", "dict", "config"])
    assert.match(help.stdout, new RegExp("^\\s+" + c + "\\s+\\S", "m"), "help is missing the " + c + " row");

  // an unknown code must fail loudly instead of writing a broken config
  const bad = spawnSync(node, [cli, "locales", "de"], { encoding: "utf8" });
  assert.notStrictEqual(bad.status, 0, "unknown locale should exit non-zero");
  assert.match(bad.stderr || bad.stdout, /Unknown locale/);

  // the language has to be discoverable: install says it every time, start once
  const cliSrc = fs.readFileSync(cli, "utf8");
  assert.strictEqual((cliSrc.match(/languageTip\(/g) || []).length, 3, "one definition + install + start call");
  const cfg = require("../src/config");
  assert.strictEqual(cfg.DEFAULTS.hintLanguageShown, false, "the start hint is shown once and defaults to unseen");
});

// ---------------------------------------------------------------- in-app language row
test("the language-picker reaches the payload with every choice and the right anchor", () => {
  const base = { dictionary: "zh-CN", features: {} };
  const d = dict.load(base);
  const resolved = features.resolve(base, d);
  const f = resolved.picked.find((x) => x.id === "language-picker");
  assert.ok(f, "language-picker should be on by default");
  const codes = f.config.choices.map((c) => c.code);
  assert.deepStrictEqual(codes, ["none", "ja", "ko", "vi", "zh-CN", "zh-TW"], "choice list drifted: " + codes);
  assert.strictEqual(f.config.current, "zh-CN", "the row must show the applied locale");
  assert.strictEqual(f.config.pendingKey, "cline-kit.language-pending");
  assert.deepStrictEqual(f.config.anchors, ["Dark mode", d.entries["Dark mode"]], "anchor needs both spellings");
  // every button label the row will render
  for (const c of f.config.choices) assert.ok(c.native, c.code + " has no display name");
  const natives = f.config.choices.map((c) => c.native);
  assert.strictEqual(new Set(natives).size, natives.length, "two languages share one display name: " + natives);
  assert.deepStrictEqual(natives, ["English", "日本語", "한국어", "Tiếng Việt", "简体中文", "繁體中文"],
    "each language must be named in its own script, got " + natives.join(" / "));
  assert.ok(f.config.choices[0].off, "English/no-replacement must lead the list");
  assert.ok(f.source.includes("data-ckit-ui"), "the row must exempt itself from translation");
});

test("turning replacement off is a real setting, not a missing file", () => {
  const d = dict.load({ dictionary: dict.NONE });
  assert.strictEqual(d.language, "none");
  assert.deepStrictEqual(d.entries, {}, "off must not carry strings");
  assert.ok(dict.validate(d), "the empty dictionary must still validate");
  assert.strictEqual(dict.remoteUrlFor({ dictionary: "none", updateUrl: "https://x/zh-CN.json" }), "", "off must not fetch");
  assert.ok(dict.isKnown("none") && dict.isKnown("ja") && !dict.isKnown("de"));
});

test("a config change alone re-injects, so a feature cannot run on stale config", () => {
  const a = payload.compose({ dictionary: "ja", features: {} });
  const b = payload.compose({ dictionary: "ko", features: {} });
  assert.notStrictEqual(a.version, b.version, "same dictionary version, different language -> same version");
  assert.ok(a.source.includes('"current":"ja"') && b.source.includes('"current":"ko"'), "current locale must reach the feature");
});

console.log("");
if (failures.length) {
  console.log(failures.length + " of " + (passed + failures.length) + " checks FAILED");
  for (const [n, e] of failures) console.log("\n--- " + n + "\n" + (e && e.stack ? e.stack : e));
  process.exit(1);
}
console.log("all " + passed + " checks passed");
