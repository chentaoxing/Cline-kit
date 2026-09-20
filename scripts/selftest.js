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
  const out = L.labelsFor(["C:\\x\\LLM", "C:\\y\\爬虫"]);
  assert.deepStrictEqual(out, { "C:\\x\\LLM": "LLM", "C:\\y\\爬虫": "爬虫" });
});

test("colliding folder names gain their parent folder", () => {
  const a = "E:\\one\\projA\\LLM";
  const b = "D:\\two\\projB\\LLM";
  const out = L.labelsFor([a, b]);
  assert.strictEqual(out[a], "projA\\LLM");
  assert.strictEqual(out[b], "projB\\LLM");
});

test("colliding parents fall back to the whole path", () => {
  const a = "E:\\workspace\\LLM";
  const b = "D:\\workspace\\LLM";
  const out = L.labelsFor([a, b]);
  assert.strictEqual(out[a], a, "same parent name on both - the short label would not distinguish them");
  assert.strictEqual(out[b], b);
});

// ---------------------------------------------------------------- row picking
test("pickMissing skips native groups, containers and duplicates", () => {
  const native = { LLM: true };
  const got = L.pickMissing(ALL, native, { installDir: "", hide: [] });
  assert.ok(!got.includes(ALL[0]), "container must not be listed");
  assert.ok(!got.includes(ALL[1]), "already shown natively");
  assert.deepStrictEqual(got, [ALL[2], ALL[3]]);
  // the same path registered twice yields one row
  assert.deepStrictEqual(L.pickMissing([ALL[3], ALL[3], ALL[2]], {}, {}), [ALL[3], ALL[2]]);
});

test("pickMissing honours maxRows and survives empty input", () => {
  const many = [];
  for (let i = 0; i < 50; i++) many.push("C:\\p\\proj" + i);
  assert.strictEqual(L.pickMissing(many, {}, { maxRows: 7 }).length, 7);
  assert.deepStrictEqual(L.pickMissing([], {}, {}), []);
  assert.deepStrictEqual(L.pickMissing(undefined, undefined, undefined), []);
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

test("feature text keys stay in sync with the dictionary", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "features", "sidebar-groups.js"), "utf8");
  const used = new Set([...src.matchAll(/\bt\(\s*"([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "dictionaries", "zh-CN.json"), "utf8"));
  const have = Object.keys((d.featureText || {})["sidebar-groups"] || {});
  for (const k of have) assert.ok(used.has(k), "dictionary carries unused key " + k);
  for (const k of used) assert.ok(have.includes(k), "feature asks for " + k + " which zh-CN does not define");
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

console.log("");
if (failures.length) {
  console.log(failures.length + " of " + (passed + failures.length) + " checks FAILED");
  for (const [n, e] of failures) console.log("\n--- " + n + "\n" + (e && e.stack ? e.stack : e));
  process.exit(1);
}
console.log("all " + passed + " checks passed");
