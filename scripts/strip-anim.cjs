// Strip the CC0 animation library down to the clips the game plays.
//
//   node scripts/strip-anim.cjs [Clip_Name ...]      (default: Walk_Loop)
//
// assets/anim/human-anim.gltf is 2.5 MB of pretty-printed JSON plus a 1.6 MB
// .bin — 46 clips (combat, swimming, spellcasting…) and a mannequin mesh that
// is thrown away on load — and every traveler figure fetched all of it to
// drive its arms with ONE clip. This writes human-walk.gltf + .bin holding
// the skeleton (every node, transforms untouched) and only the named clips:
// the same sampler code reads it unchanged. The full library stays in the
// repo as the source; re-run this if HUMAN_CLIPS starts using another clip.
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "assets", "anim");
const SRC = path.join(DIR, "human-anim.gltf");
const OUT_GLTF = path.join(DIR, "human-walk.gltf");
const OUT_BIN = "human-walk.bin";
const KEEP = process.argv.slice(2).length ? process.argv.slice(2) : ["Walk_Loop"];

const g = JSON.parse(fs.readFileSync(SRC, "utf8"));
const bin = fs.readFileSync(path.join(DIR, g.buffers[0].uri));

const anims = g.animations.filter((a) => KEEP.includes(a.name));
const missing = KEEP.filter((n) => !anims.some((a) => a.name === n));
if (missing.length) { console.error("no such clip:", missing.join(", ")); process.exit(1); }

// Copy every accessor the kept samplers read into a fresh, tightly packed
// buffer — one bufferView each, 4-byte aligned (glTF requires it for floats).
const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const accessors = [], bufferViews = [], chunks = [];
const remap = new Map();
let offset = 0;
function take(idx) {
  if (remap.has(idx)) return remap.get(idx);
  const a = g.accessors[idx], v = g.bufferViews[a.bufferView];
  if (v.byteStride) throw new Error("interleaved animation data is not handled");
  const len = a.count * COMP[a.componentType] * NUM[a.type];
  const start = (v.byteOffset || 0) + (a.byteOffset || 0);
  const pad = (4 - (offset % 4)) % 4;
  if (pad) { chunks.push(Buffer.alloc(pad)); offset += pad; }
  chunks.push(bin.subarray(start, start + len));
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: len });
  offset += len;
  const na = Object.assign({}, a, { bufferView: bufferViews.length - 1 });
  delete na.byteOffset;
  accessors.push(na);
  remap.set(idx, accessors.length - 1);
  return accessors.length - 1;
}
const animations = anims.map((a) => ({
  name: a.name,
  channels: a.channels,
  samplers: a.samplers.map((s) => Object.assign({}, s, { input: take(s.input), output: take(s.output) })),
}));

// The skeleton: every node, minus the mesh/skin the sampler never draws.
const nodes = g.nodes.map((n) => { const c = Object.assign({}, n); delete c.mesh; delete c.skin; return c; });
const out = {
  asset: { version: "2.0", generator: "strip-anim.cjs (from " + (g.asset.generator || "glTF") + ")" },
  scene: g.scene, scenes: g.scenes, nodes, animations, accessors, bufferViews,
  buffers: [{ uri: OUT_BIN, byteLength: offset }],
};
fs.writeFileSync(path.join(DIR, OUT_BIN), Buffer.concat(chunks, offset));
fs.writeFileSync(OUT_GLTF, JSON.stringify(out));
const kb = (n) => (n / 1024).toFixed(0) + " KB";
console.log(`kept ${KEEP.join(", ")}: ${accessors.length} accessors`);
console.log(`human-walk.gltf ${kb(fs.statSync(OUT_GLTF).size)} + ${OUT_BIN} ${kb(offset)}  (was ${kb(fs.statSync(SRC).size)} + ${kb(bin.length)})`);
