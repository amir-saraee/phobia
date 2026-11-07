// KTX2 (Basis Universal) copies of the dog coat maps for the phone tiers.
// gltfpack carries the Basis encoder, but only encodes textures that hang off
// a glTF material — so each breed's three PNG bakes are wrapped in a throwaway
// one-quad glTF, run through gltfpack, and the .ktx2 images are lifted back
// out of the result next to the JPEGs the high tier still loads:
//
//   assets/models/textures/<breed>_photo_{albedo,normal,roughness}.ktx2
//
// All three are ETC1S (transcodes to ETC2/ASTC on every phone GPU): a breed
// is ~530 KB on the wire against ~590 KB of JPEG, at a quarter of the GPU
// memory. UASTC normals would be cleaner but weigh 1.27 MB each — on a data
// plan that is the wrong trade for fur; `--uastc-normal` opts in. `-tfy`
// flips the images so the un-flipped compressed texture lands on the same
// side-projection UVs the flipY JPEGs use. Re-run after any re-bake:
//
//   node scripts/encode-coats-ktx2.cjs            (bake-all does not chain it; then set ktx2: true in DOG_COAT_MAPS)
//
// Needs a NATIVE gltfpack (GLTFPACK=/path/to/gltfpack): the npm build has no
// Basis encoder. https://github.com/zeux/meshoptimizer/releases ships one.
//   GLTFPACK=... node scripts/encode-coats-ktx2.cjs --uastc-normal   # 1.27 MB normals, cleaner
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const TEX = path.join(ROOT, "assets", "models", "textures");
const GLTFPACK = process.env.GLTFPACK || path.join(__dirname, "node_modules", "gltfpack", "cli.js");
const BREEDS = ["shiba", "husky"];
const SLOTS = { albedo: "baseColorTexture", normal: "normalTexture", roughness: "metallicRoughnessTexture" };
const uastcNormal = process.argv.includes("--uastc-normal");

// A unit quad: positions (4×3 f32), uvs (4×2 f32), indices (6 u16).
const pos = new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]);
const uv = new Float32Array([0, 1, 1, 1, 1, 0, 0, 0]);
const idx = new Uint16Array([0, 1, 2, 0, 2, 3]);
const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(uv.buffer), Buffer.from(idx.buffer)]);

function ktx2Levels(buf) {
  return buf.readUInt32LE(40);   // 12-byte identifier, then 7 u32s before levelCount
}

for (const breed of BREEDS) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "coat-ktx2-"));
  const names = ["albedo", "normal", "roughness"];
  for (const n of names) fs.copyFileSync(path.join(TEX, `${breed}_photo_${n}.png`), path.join(tmp, `${n}.png`));
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: bin.length, uri: "quad.bin" }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: pos.byteLength },
      { buffer: 0, byteOffset: pos.byteLength, byteLength: uv.byteLength },
      { buffer: 0, byteOffset: pos.byteLength + uv.byteLength, byteLength: idx.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 4, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 4, type: "VEC2" },
      { bufferView: 2, componentType: 5123, count: 6, type: "SCALAR" },
    ],
    images: names.map((n) => ({ uri: `${n}.png` })),
    textures: names.map((_, i) => ({ source: i })),
    materials: [{
      pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicRoughnessTexture: { index: 2 } },
      normalTexture: { index: 1 },
    }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  fs.writeFileSync(path.join(tmp, "quad.bin"), bin);
  fs.writeFileSync(path.join(tmp, "wrap.gltf"), JSON.stringify(gltf));
  const out = path.join(tmp, "out.glb");
  const args = ["-i", path.join(tmp, "wrap.gltf"), "-o", out, "-tfy", "-tj", "4",
    "-tc", "color,attrib", "-tq", "color", "9", "-tq", "attrib", "8"];
  if (uastcNormal) args.push("-tu", "normal", "-tq", "normal", "7");
  else args.push("-tc", "normal", "-tq", "normal", "10");
  if (/\.js$/.test(GLTFPACK)) execFileSync(process.execPath, [GLTFPACK, ...args], { stdio: "inherit" });
  else execFileSync(GLTFPACK, args, { stdio: "inherit" });

  // Lift the KTX2 images back out, named by the material slot they filled.
  const glb = fs.readFileSync(out);
  const jsonLen = glb.readUInt32LE(12);
  const j = JSON.parse(glb.subarray(20, 20 + jsonLen).toString("utf8"));
  const binStart = 20 + jsonLen + 8;
  const mat = j.materials[0];
  const slotTex = { albedo: mat.pbrMetallicRoughness.baseColorTexture.index, normal: mat.normalTexture.index, roughness: mat.pbrMetallicRoughness.metallicRoughnessTexture.index };
  for (const [slot, ti] of Object.entries(slotTex)) {
    const tex = j.textures[ti];
    const src = tex.extensions && tex.extensions.KHR_texture_basisu ? tex.extensions.KHR_texture_basisu.source : tex.source;
    const img = j.images[src];
    if (!/ktx2/.test(img.mimeType || "")) throw new Error(`${breed} ${slot}: not ktx2 (${img.mimeType})`);
    const bv = j.bufferViews[img.bufferView];
    const bytes = glb.subarray(binStart + (bv.byteOffset || 0), binStart + (bv.byteOffset || 0) + bv.byteLength);
    const dst = path.join(TEX, `${breed}_photo_${slot}.ktx2`);
    fs.writeFileSync(dst, bytes);
    const jpg = fs.statSync(path.join(TEX, `${breed}_photo_${slot}.jpg`)).size;
    console.log(`${path.basename(dst).padEnd(30)} ${(bytes.length / 1024).toFixed(0).padStart(5)} KB  (jpg ${(jpg / 1024).toFixed(0)} KB, ${ktx2Levels(bytes)} mip levels)`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}
