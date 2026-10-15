// Drop the animation keyframes a .glb doesn't need — the ones its own linear
// (translation/scale) or spherical (rotation) interpolation already puts
// within a hair of where they were — and repack the file.
//
//   node scripts/reduce-anim.cjs assets/models/ShibaInu.glb [out.glb] [--keep Walk,...]
//
// The Quaternius dogs carry every bone's every channel sampled at every frame
// for all 12 clips, constant channels included: 86 % of the 1.8 MB file was
// animation, and nearly all of it was keys the curve passes through anyway.
// Tolerances are far below anything visible: 0.02° of rotation, 0.1 mm of
// translation (in the model's own units), 1e-4 of scale. The first and last
// key of every channel always stay, so every clip keeps its exact duration.
//
// Clips named with --keep are copied untouched. The default keeps Walk: the
// trot is synthesised from it by resampling each track AT ITS OWN KEY TIMES
// (synthDogTrot), which needs the walk's uniform sampling.
//
// Lossless where it matters and checked: every reduced channel is evaluated
// against the original at every original key time before anything is
// written, and the script refuses to write if any error exceeds tolerance.
"use strict";
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const keepIdx = args.indexOf("--keep");
const KEEP = new Set(keepIdx >= 0 ? (args[keepIdx + 1] || "").split(",").filter(Boolean) : ["Walk"]);
const files = args.filter((a, i) => !(keepIdx >= 0 && (i === keepIdx || i === keepIdx + 1)));
const src = files[0];
if (!src) { console.error("usage: node reduce-anim.cjs <in.glb> [out.glb] [--keep Clip1,Clip2]"); process.exit(1); }
const out = files[1] || src;

const TOL = { rotation: 2e-4, translation: 1e-4, scale: 1e-4, weights: 1e-4 };

// ---- read ----
const glb = fs.readFileSync(src);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error("not a glb");
const jl = glb.readUInt32LE(12);
const g = JSON.parse(glb.subarray(20, 20 + jl).toString("utf8"));
const bl = glb.readUInt32LE(20 + jl);
const bin = glb.subarray(28 + jl, 28 + jl + bl);
if (g.buffers.length !== 1) throw new Error("expected one buffer");
// Reducing an already-reduced file would let the error compound; start from
// the original (in the repository history) instead.
if (g.asset && g.asset.extras && g.asset.extras.animReduced) {
  console.error(path.basename(src) + " is already reduced (asset.extras.animReduced) — run this on the original");
  process.exit(1);
}
const COMP = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };
function readFloat(idx) {
  const a = g.accessors[idx], v = g.bufferViews[a.bufferView];
  if (a.componentType !== 5126 || a.sparse) throw new Error("non-float or sparse animation accessor " + idx);
  if (v.byteStride && v.byteStride !== NUM[a.type] * 4) throw new Error("interleaved accessor " + idx);
  const off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const n = a.count * NUM[a.type];
  const f = new Float32Array(n);
  for (let i = 0; i < n; i++) f[i] = bin.readFloatLE(off + i * 4);
  return f;
}

// ---- interpolation, as three.js does it ----
function slerp(o, a, b, u, out) {   // quaternions o[a*4..], o[b*4..]
  let x0 = o[a * 4], y0 = o[a * 4 + 1], z0 = o[a * 4 + 2], w0 = o[a * 4 + 3];
  let x1 = o[b * 4], y1 = o[b * 4 + 1], z1 = o[b * 4 + 2], w1 = o[b * 4 + 3];
  let cos = x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1;
  const dir = cos >= 0 ? 1 : -1;
  let s = 1 - u, t = u;
  const sqrSin = 1 - cos * cos;
  if (sqrSin > Number.EPSILON) {
    const sin = Math.sqrt(sqrSin), len = Math.atan2(sin, cos * dir);
    s = Math.sin(s * len) / sin; t = Math.sin(t * len) / sin;
  }
  t *= dir;
  let x = x0 * s + x1 * t, y = y0 * s + y1 * t, z = z0 * s + z1 * t, w = w0 * s + w1 * t;
  if (s === 1 - u) { const f = 1 / Math.sqrt(x * x + y * y + z * z + w * w); x *= f; y *= f; z *= f; w *= f; }
  out[0] = x; out[1] = y; out[2] = z; out[3] = w;
}
const _q = [0, 0, 0, 0];
// Error of predicting key i from keys a and b (indices into times/vals).
function errAt(path, times, vals, n, a, b, i) {
  const u = (times[i] - times[a]) / (times[b] - times[a]);
  if (path === "rotation") {
    slerp(vals, a, b, u, _q);
    // q and -q are the same rotation
    const d = _q[0] * vals[i * 4] + _q[1] * vals[i * 4 + 1] + _q[2] * vals[i * 4 + 2] + _q[3] * vals[i * 4 + 3];
    const sg = d < 0 ? -1 : 1;
    let e = 0;
    for (let c = 0; c < 4; c++) e = Math.max(e, Math.abs(_q[c] * sg - vals[i * 4 + c]));
    return e;
  }
  let e = 0;
  for (let c = 0; c < n; c++) {
    const p = vals[a * n + c] + (vals[b * n + c] - vals[a * n + c]) * u;
    e = Math.max(e, Math.abs(p - vals[i * n + c]));
  }
  return e;
}
// Greedy reduction: extend each segment as far as every skipped key stays
// within tolerance of the segment's interpolation.
function reduce(path, times, vals, n) {
  const N = times.length;
  if (N <= 2) return [...Array(N).keys()];
  const tol = TOL[path] ?? 1e-4;
  const keep = [0];
  let a = 0;
  while (a < N - 1) {
    let b = a + 1;
    while (b + 1 < N) {
      let ok = true;
      for (let i = a + 1; i <= b; i++) { if (errAt(path, times, vals, n, a, b + 1, i) > tol) { ok = false; break; } }
      if (!ok) break;
      b++;
    }
    keep.push(b);
    a = b;
  }
  return keep;
}
// Independent check: evaluate the reduced curve at every original time.
function verify(path, times, vals, n, keep) {
  let worst = 0, k = 0;
  for (let i = 0; i < times.length; i++) {
    while (k + 1 < keep.length && keep[k + 1] < i) k++;
    if (keep[k] === i || (k + 1 < keep.length && keep[k + 1] === i)) continue;
    worst = Math.max(worst, errAt(path, times, vals, n, keep[k], keep[k + 1], i));
  }
  return worst;
}

// ---- reduce every sampler ----
const animAcc = new Set();
for (const an of g.animations) for (const s of an.samplers) { animAcc.add(s.input); animAcc.add(s.output); }
const newSamplers = [];   // per animation: [{ times, vals, type }]
let keysBefore = 0, keysAfter = 0, worstAll = { rotation: 0, translation: 0, scale: 0 };
for (const an of g.animations) {
  const keepClip = KEEP.has(an.name);
  const pathOf = new Map(an.channels.map((c) => [c.sampler, c.target.path]));
  newSamplers.push(an.samplers.map((s, si) => {
    const times = readFloat(s.input), vals = readFloat(s.output);
    const type = g.accessors[s.output].type, n = NUM[type];
    const path = pathOf.get(si) || "translation";
    keysBefore += times.length;
    if (keepClip || (s.interpolation && s.interpolation !== "LINEAR")) {
      keysAfter += times.length;
      return { times, vals, type, interpolation: s.interpolation };
    }
    const keep = reduce(path, times, vals, n);
    const w = verify(path, times, vals, n, keep);
    if (w > (TOL[path] ?? 1e-4) * 1.0001) throw new Error(`verify failed: ${an.name} sampler ${si} (${path}) err ${w}`);
    if (worstAll[path] != null) worstAll[path] = Math.max(worstAll[path], w);
    keysAfter += keep.length;
    const t2 = new Float32Array(keep.length), v2 = new Float32Array(keep.length * n);
    keep.forEach((k, j) => { t2[j] = times[k]; for (let c = 0; c < n; c++) v2[j * n + c] = vals[k * n + c]; });
    return { times: t2, vals: v2, type, interpolation: s.interpolation };
  }));
}

// ---- rebuild the buffer ----
// Non-animation bufferViews are copied verbatim (re-offset); animation data is
// packed into two new bufferViews (key times, values) shared by accessors at
// byte offsets, and identical key-time arrays share one accessor.
const oldAnimViews = new Set([...animAcc].map((i) => g.accessors[i].bufferView));
for (let i = 0; i < g.accessors.length; i++) {
  if (!animAcc.has(i) && oldAnimViews.has(g.accessors[i].bufferView)) throw new Error("bufferView shared between animation and other data");
}
const chunks = [];
let off = 0;
const pad4 = () => { const p = (4 - (off % 4)) % 4; if (p) { chunks.push(Buffer.alloc(p)); off += p; } };
const viewMap = new Map();
const bufferViews = [];
g.bufferViews.forEach((v, i) => {
  if (oldAnimViews.has(i)) return;
  pad4();
  const start = v.byteOffset || 0;
  chunks.push(bin.subarray(start, start + v.byteLength));
  const nv = Object.assign({}, v, { byteOffset: off });
  off += v.byteLength;
  viewMap.set(i, bufferViews.length);
  bufferViews.push(nv);
});
// keep non-animation accessors (renumbered), then append animation ones
const accMap = new Map();
const accessors = [];
g.accessors.forEach((a, i) => {
  if (animAcc.has(i)) return;
  const na = Object.assign({}, a);
  if (na.bufferView != null) na.bufferView = viewMap.get(na.bufferView);
  accMap.set(i, accessors.length);
  accessors.push(na);
});
const f32 = (arr) => { const b = Buffer.alloc(arr.length * 4); for (let i = 0; i < arr.length; i++) b.writeFloatLE(arr[i], i * 4); return b; };
const timeParts = [], valParts = [];
let tOff = 0, vOff = 0;
const tView = bufferViews.length, vView = bufferViews.length + 1;
const timeAcc = new Map();
const animations = g.animations.map((an, ai) => ({
  ...an,
  samplers: an.samplers.map((s, si) => {
    const r = newSamplers[ai][si];
    const key = Buffer.from(r.times.buffer, r.times.byteOffset, r.times.byteLength).toString("base64");
    let input = timeAcc.get(key);
    if (input == null) {
      const b = f32(r.times);
      timeParts.push(b);
      let mn = Infinity, mx = -Infinity;
      for (const t of r.times) { mn = Math.min(mn, t); mx = Math.max(mx, t); }
      accessors.push({ bufferView: tView, byteOffset: tOff, componentType: 5126, count: r.times.length, type: "SCALAR", min: [mn], max: [mx] });
      tOff += b.length;
      input = accessors.length - 1;
      timeAcc.set(key, input);
    }
    const vb = f32(r.vals);
    valParts.push(vb);
    accessors.push({ bufferView: vView, byteOffset: vOff, componentType: 5126, count: r.times.length, type: r.type });
    vOff += vb.length;
    const ns = Object.assign({}, s, { input, output: accessors.length - 1 });
    if (ns.interpolation === "LINEAR") delete ns.interpolation;   // the spec default
    return ns;
  }),
}));
pad4();
const tBuf = Buffer.concat(timeParts);
bufferViews.push({ buffer: 0, byteOffset: off, byteLength: tBuf.length });
chunks.push(tBuf); off += tBuf.length;
pad4();
const vBuf = Buffer.concat(valParts);
bufferViews.push({ buffer: 0, byteOffset: off, byteLength: vBuf.length });
chunks.push(vBuf); off += vBuf.length;
const newBin = Buffer.concat(chunks);

// Remap every other accessor reference in the document.
const remapAcc = (i) => { if (!accMap.has(i)) throw new Error("dangling accessor " + i); return accMap.get(i); };
const doc = Object.assign({}, g, { accessors, bufferViews, animations, buffers: [{ byteLength: newBin.length }] });
doc.asset = Object.assign({}, g.asset, { extras: Object.assign({}, (g.asset && g.asset.extras) || {}, { animReduced: { tol: TOL, kept: [...KEEP] } }) });
doc.meshes = (g.meshes || []).map((m) => ({
  ...m,
  primitives: m.primitives.map((p) => {
    const np = { ...p, attributes: {} };
    for (const k in p.attributes) np.attributes[k] = remapAcc(p.attributes[k]);
    if (p.indices != null) np.indices = remapAcc(p.indices);
    if (p.targets) np.targets = p.targets.map((t) => { const o = {}; for (const k in t) o[k] = remapAcc(t[k]); return o; });
    return np;
  }),
}));
doc.skins = (g.skins || []).map((s) => (s.inverseBindMatrices != null ? { ...s, inverseBindMatrices: remapAcc(s.inverseBindMatrices) } : s));
if (g.images && g.images.some((im) => im.bufferView != null)) {
  doc.images = g.images.map((im) => (im.bufferView != null ? { ...im, bufferView: viewMap.get(im.bufferView) } : im));
}
if (!doc.skins.length) delete doc.skins;

// ---- write ----
const pad = (buf, fill) => (buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4), fill)]) : buf);
const json = pad(Buffer.from(JSON.stringify(doc), "utf8"), 0x20);
const body = pad(newBin, 0);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
const chunk = (type, data) => { const h = Buffer.alloc(8); h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4); return Buffer.concat([h, data]); };
const outBuf = Buffer.concat([header, chunk(0x4e4f534a, json), chunk(0x004e4942, body)]);
fs.writeFileSync(out, outBuf);
const kb = (x) => (x / 1024).toFixed(0) + " KB";
console.log(`${path.basename(src)} ${kb(glb.length)} → ${path.basename(out)} ${kb(outBuf.length)}; keys ${keysBefore} → ${keysAfter}; kept clips untouched: ${[...KEEP].join(",") || "none"}; worst err rot ${worstAll.rotation.toExponential(2)} pos ${worstAll.translation.toExponential(2)} scale ${worstAll.scale.toExponential(2)}`);
