// Repack a .gltf whose single buffer is an embedded base64 data URI as a
// binary .glb — the same JSON and the same bytes, without the base64 (+33 %)
// or the JSON's whitespace, and nothing for the loader to decode as text.
// Lossless: it checks the round trip before writing.
//
//   node scripts/pack-glb.cjs assets/models/ShibaInu.gltf [out.glb]
//
// The dogs ship as .glb made this way (2.9 → 1.7 MB each).
"use strict";
const fs = require("fs");
const path = require("path");

const src = process.argv[2];
if (!src) { console.error("usage: node pack-glb.cjs <in.gltf> [out.glb]"); process.exit(1); }
const out = process.argv[3] || src.replace(/\.gltf$/i, ".glb");

const gltf = JSON.parse(fs.readFileSync(src, "utf8"));
if (!gltf.buffers || gltf.buffers.length !== 1) throw new Error("expected exactly one buffer");
const uri = gltf.buffers[0].uri || "";
const m = /^data:[^;]*;base64,(.*)$/s.exec(uri);
if (!m) throw new Error("buffer 0 is not an embedded base64 data URI");
if ((gltf.images || []).some((im) => im.uri)) throw new Error("external/data-URI images are not handled");
const bin = Buffer.from(m[1], "base64");
if (bin.length !== gltf.buffers[0].byteLength) throw new Error("decoded buffer length mismatch");

gltf.buffers[0] = { byteLength: bin.length };
const pad = (buf, fill) => (buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4), fill)]) : buf);
const json = pad(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
const body = pad(bin, 0);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);                 // "glTF"
header.writeUInt32LE(2, 4);                          // version
header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
const glb = Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, body)]);

// Round trip: the JSON and the bytes must come back exactly.
const jl = glb.readUInt32LE(12);
const back = JSON.parse(glb.subarray(20, 20 + jl).toString("utf8"));
const bl = glb.readUInt32LE(20 + jl);
const backBin = glb.subarray(28 + jl, 28 + jl + bl).subarray(0, bin.length);
const orig = JSON.parse(fs.readFileSync(src, "utf8"));
orig.buffers[0] = { byteLength: bin.length };
if (JSON.stringify(back) !== JSON.stringify(orig) || !backBin.equals(bin)) throw new Error("round trip failed");

fs.writeFileSync(out, glb);
console.log(`${path.basename(src)} ${(fs.statSync(src).size / 1048576).toFixed(2)} MB → ${path.basename(out)} ${(glb.length / 1048576).toFixed(2)} MB`);
