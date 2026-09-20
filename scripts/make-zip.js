#!/usr/bin/env node
"use strict";
// make-zip.js - deterministic, dependency-free ZIP writer for the release artifact.
//
// Why not Compress-Archive / .NET ZipFile from PowerShell 5.1: both write entry names with
// backslashes on Windows, so `dictionaries\ja.json` extracts as one oddly-named file everywhere
// except Explorer. The ZIP spec wants forward slashes.
//
//   node scripts/make-zip.js <sourceDir> <out.zip>
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function dosTime(d) {
  return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
}
function dosDate(d) {
  return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
}

function walk(dir, base, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === ".DS_Store") continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, base, out);
    else out.push({ abs: full, rel: path.relative(base, full).split(path.sep).join("/") });
  }
  return out;
}

function build(sourceDir, outPath) {
  const files = walk(sourceDir, sourceDir, []);
  if (!files.length) throw new Error("nothing to pack inside " + sourceDir);
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const data = fs.readFileSync(f.abs);
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const useDeflate = deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const crc = crc32(data);
    const stamp = fs.statSync(f.abs).mtime;
    const nameBuf = Buffer.from(f.rel, "utf8");

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);              // version needed
    local.writeUInt16LE(0x0800, 6);          // UTF-8 name flag
    local.writeUInt16LE(useDeflate ? 8 : 0, 8);
    local.writeUInt16LE(dosTime(stamp), 10);
    local.writeUInt16LE(dosDate(stamp), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, payload);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);               // version made by
    head.writeUInt16LE(20, 6);               // version needed
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(useDeflate ? 8 : 0, 10);
    head.writeUInt16LE(dosTime(stamp), 12);
    head.writeUInt16LE(dosDate(stamp), 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(payload.length, 20);
    head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28);
    head.writeUInt32LE(0, 38);               // external attrs
    head.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([head, nameBuf]));

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const centralOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  const zip = Buffer.concat([Buffer.concat(chunks), centralBuf, eocd]);
  fs.writeFileSync(outPath, zip);
  return { entries: files.length, bytes: zip.length, names: files.map((f) => f.rel) };
}

const [src, out] = process.argv.slice(2);
if (!src || !out) { console.error("usage: node scripts/make-zip.js <sourceDir> <out.zip>"); process.exit(1); }
const r = build(path.resolve(src), path.resolve(out));
console.log(out + ": " + r.entries + " files, " + r.bytes + " bytes");
r.names.forEach((n) => console.log("  " + n));
