// Shared creature surfacing: scale and fur normal maps, box / photo UVs,
// crease-normal smoothing, and coat colours for dogs, spiders and snakes.

import * as THREE from "three";
import { heightCanvasToNormal } from "./textures.js";

// ---------- Procedural dog model + state machine ----------
// Built from primitives — full control over every state (sit, walk, bark, eat).
// Default colours are a friendly golden-retriever palette.
// Build a coordinated fur PBR map set: albedo + normal + roughness, with the
// normal map encoding individual hair strands flowing in a consistent
// direction. The base colour can be overridden so warm gold, dark brown, etc.
// share the same procedural variety. Cached by base colour so repeated
// builds (e.g. each scene mount) don't re-run the canvas work.
// Reptile scale normal map — staggered rows of overlapping scale humps, run
// through the shared Sobel height→normal step. Cached (built once). Tiled fine
// along a snake body for a scaled-skin read.
let _scaleNormalCache = null;
function makeScaleNormal() {
  if (_scaleNormalCache) return _scaleNormalCache;
  const SIZE = 256;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const h = heightC.getContext("2d");
  h.fillStyle = "#808080"; h.fillRect(0, 0, SIZE, SIZE);
  const cols = 16, rows = 22, cw = SIZE / cols, rh = SIZE / rows;
  for (let ry = 0; ry < rows; ry++) {
    const off = (ry % 2) * cw * 0.5;   // brick-stagger
    for (let cx = 0; cx < cols + 1; cx++) {
      const x = cx * cw - off + cw * 0.5, y = ry * rh + rh * 0.5;
      const grad = h.createRadialGradient(x, y - rh * 0.15, 0, x, y, cw * 0.62);
      grad.addColorStop(0, "rgb(168,168,168)");   // raised scale centre
      grad.addColorStop(0.7, "rgb(120,120,120)");
      grad.addColorStop(1, "rgb(96,96,96)");        // recessed lip
      h.fillStyle = grad;
      h.beginPath();
      h.ellipse(x, y, cw * 0.6, rh * 0.72, 0, 0, Math.PI * 2);
      h.fill();
    }
  }
  const t = (typeof heightCanvasToNormal === "function")
    ? new THREE.CanvasTexture(heightCanvasToNormal(heightC, 2.2))
    : new THREE.CanvasTexture(heightC);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  _scaleNormalCache = t;
  return t;
}

const _furCache = new Map();
function makeFurMaps(baseColor = 0xd6a06a) {
  const cached = _furCache.get(baseColor);
  if (cached) return cached;
  const SIZE = 256;
  const albedoC = document.createElement("canvas"); albedoC.width = albedoC.height = SIZE;
  const normalC = document.createElement("canvas"); normalC.width = normalC.height = SIZE;
  const roughC  = document.createElement("canvas"); roughC.width  = roughC.height  = SIZE;
  const aCtx = albedoC.getContext("2d");
  const nCtx = normalC.getContext("2d");
  const rCtx = roughC.getContext("2d");

  // Base albedo
  const base = new THREE.Color(baseColor);
  const r0 = Math.round(base.r * 255);
  const g0 = Math.round(base.g * 255);
  const b0 = Math.round(base.b * 255);
  aCtx.fillStyle = `rgb(${r0},${g0},${b0})`;
  aCtx.fillRect(0, 0, SIZE, SIZE);
  // Roughness baseline (~0.85 so fur catches a subtle bounce light without
  // looking shiny). 0.85 → 217/255 grey.
  rCtx.fillStyle = "#d8d8d8";
  rCtx.fillRect(0, 0, SIZE, SIZE);
  // Normal map base = flat (RGB 128,128,255 = up in tangent space)
  nCtx.fillStyle = "#8080ff";
  nCtx.fillRect(0, 0, SIZE, SIZE);

  // Paint a few thousand individual hair strands. Each strand is a short
  // anti-aliased line on the albedo (slightly darker/lighter), a thin streak
  // on the normal map (encoding the hair's direction in the tangent plane),
  // and a low-rough streak on the roughness map (the hair tip catches a
  // tiny specular highlight, less rough than the bulk fur).
  const HAIR_COUNT = 2400;
  for (let i = 0; i < HAIR_COUNT; i++) {
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    // All hairs point in the same general direction (slight downward sweep)
    // with a small random jitter — looks like brushed fur on the body
    const baseAng = Math.PI / 2 + (Math.random() - 0.5) * 0.4;   // mostly +y
    const len = 6 + Math.random() * 10;
    const x2 = x + Math.cos(baseAng) * len;
    const y2 = y + Math.sin(baseAng) * len;
    // ALBEDO: darker hair shaft + occasional lighter highlight
    const tone = (Math.random() - 0.5) * 0.4;        // -0.2..0.2
    const rh = Math.max(0, Math.min(255, r0 + tone * 40));
    const gh = Math.max(0, Math.min(255, g0 + tone * 35));
    const bh = Math.max(0, Math.min(255, b0 + tone * 30));
    aCtx.strokeStyle = `rgba(${rh|0},${gh|0},${bh|0},0.85)`;
    aCtx.lineWidth = 0.6 + Math.random() * 0.6;
    aCtx.lineCap = "round";
    aCtx.beginPath();
    aCtx.moveTo(x, y);
    aCtx.lineTo(x2, y2);
    aCtx.stroke();
    // NORMAL: encode the hair's tangent direction. A hair pointing
    // (cos a, sin a) creates a normal that tilts slightly in that direction.
    // We map the tangent to 0..255 in red/green channels.
    const nx = Math.cos(baseAng) * 0.35;     // -0.35..0.35
    const ny = -Math.sin(baseAng) * 0.35;    // negate for y-down canvas
    const nR = Math.round((nx * 0.5 + 0.5) * 255);
    const nG = Math.round((ny * 0.5 + 0.5) * 255);
    nCtx.strokeStyle = `rgba(${nR},${nG},255,0.55)`;
    nCtx.lineWidth = 1.0 + Math.random() * 0.8;
    nCtx.beginPath();
    nCtx.moveTo(x, y);
    nCtx.lineTo(x2, y2);
    nCtx.stroke();
    // ROUGHNESS: hair tips slightly less rough (catch a faint highlight)
    rCtx.strokeStyle = `rgba(180,180,180,0.35)`;
    rCtx.lineWidth = 0.7;
    rCtx.beginPath();
    rCtx.moveTo(x, y);
    rCtx.lineTo(x2, y2);
    rCtx.stroke();
  }

  // Subtle macro variation — patches of slightly darker/lighter fur every
  // ~30 px, like the real shading on a dog's coat
  for (let i = 0; i < 18; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE;
    const r = 30 + Math.random() * 40;
    const grad = aCtx.createRadialGradient(x, y, 0, x, y, r);
    const tone = (Math.random() - 0.5) * 0.18;
    const rt = Math.max(0, Math.min(255, r0 + tone * 25));
    const gt = Math.max(0, Math.min(255, g0 + tone * 22));
    const bt = Math.max(0, Math.min(255, b0 + tone * 20));
    grad.addColorStop(0, `rgba(${rt|0},${gt|0},${bt|0},0.35)`);
    grad.addColorStop(1, `rgba(${rt|0},${gt|0},${bt|0},0)`);
    aCtx.fillStyle = grad;
    aCtx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const make = (canvas, srgb = false) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const result = {
    albedo: make(albedoC, true),
    normal: make(normalC),
    roughness: make(roughC),
  };
  _furCache.set(baseColor, result);
  return result;
}

// Generate box/triplanar UVs for a geometry that ships without any. The
// Quaternius dog models carry NO TEXCOORD_0, so any tiling normal/roughness map
// (our procedural fur) silently samples texel (0,0) everywhere — a no-op that
// left the coat looking like smooth plastic. Box mapping projects each vertex
// along its dominant normal axis, giving a continuous, low-stretch coordinate
// the tiling fur map can actually break up the shading with. `scaleRef`
// normalises so the tiling is consistent regardless of the model's native units.
function ensureBoxUV(geom, scaleRef) {
  if (!geom || !geom.attributes || geom.attributes.uv) return;
  const pos = geom.attributes.position;
  const nor = geom.attributes.normal;
  if (!pos) return;
  const s = scaleRef || 1;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let nx = 0, ny = 1, nz = 0;
    if (nor) { nx = Math.abs(nor.getX(i)); ny = Math.abs(nor.getY(i)); nz = Math.abs(nor.getZ(i)); }
    let u, v;
    if (nx >= ny && nx >= nz)      { u = z; v = y; }   // side-facing → ZY
    else if (ny >= nx && ny >= nz) { u = x; v = z; }   // up/down-facing → XZ
    else                           { u = x; v = y; }   // front/back-facing → XY
    uv[i * 2] = u / s; uv[i * 2 + 1] = v / s;
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

// Bind-pose bounds of everything renderable under `root`, taken from the
// authored geometry only. Box3.setFromObject() cannot be used on a rig that
// has not been posed: it routes SkinnedMesh through computeBoundingBox(),
// which skins each vertex with bone matrices that are still unset this early.
function geometryBox(root) {
  const box = new THREE.Box3();
  const b = new THREE.Box3();
  root.updateWorldMatrix(false, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    if (!o.geometry.boundingBox) return;
    b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

// Side-profile photo projection. The breed albedo is a cropped photograph of
// the real dog (facing −Z in texture space = left). Map mesh length (Z) → U
// and height (Y) → V so the flanks carry the photo; mirror across X so both
// sides of the body show the same profile rather than a stretched underside.
function applySidePhotoUVs(geom, box) {
  if (!geom || !geom.attributes || !geom.attributes.position) return;
  const pos = geom.attributes.position;
  const min = box.min, max = box.max;
  const sx = Math.max(1e-4, max.x - min.x);
  const sy = Math.max(1e-4, max.y - min.y);
  const sz = Math.max(1e-4, max.z - min.z);
  const uv = new Float32Array(pos.count * 2);
  // Quaternius dogs face +Z; the photo faces left (−X in image = nose).
  // U increases toward the tail so the muzzle lands on the left of the photo.
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i), z = pos.getZ(i);
    const u = 1 - (z - min.z) / sz;          // nose (+Z) → left of photo
    // TextureLoader flipY: v=1 samples the top of the PNG (crown).
    const v = (y - min.y) / sy;
    uv[i * 2] = Math.max(0, Math.min(1, u));
    uv[i * 2 + 1] = Math.max(0, Math.min(1, v));
  }
  geom.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  // Silence unused sx — kept so a future cylindrical blend can use lateral.
  void sx;
}

// Angle-limited normal smoothing for flat-shaded GLTF creatures. These models
// duplicate every vertex per triangle with per-face normals — each triangle a
// hard plate. For every cluster of position-duplicate vertices, average the
// normals whose mutual angle is inside the crease limit and write the result
// back per-vertex: curvature goes soft, genuine creases (ear rims, snout
// bridge, paw edges) stay sharp. ONLY the normal attribute is written —
// positions, UVs and skin weights are untouched, so it's skinning-safe and
// composes with the fur relief maps. cosLimit = cos(creaseAngle).
function smoothCreaseNormals(geom, cosLimit = 0.5) {
  const pos = geom && geom.attributes && geom.attributes.position;
  const nor = geom && geom.attributes && geom.attributes.normal;
  if (!pos || !nor) return;
  // Cluster vertex indices by (quantised) position.
  const cell = new Map();
  const key = (i) =>
    (Math.round(pos.getX(i) * 1e4) + "," +
     Math.round(pos.getY(i) * 1e4) + "," +
     Math.round(pos.getZ(i) * 1e4));
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let arr = cell.get(k);
    if (!arr) { arr = []; cell.set(k, arr); }
    arr.push(i);
  }
  const src = new Float32Array(nor.array);       // read pristine face normals
  for (const arr of cell.values()) {
    if (arr.length < 2) continue;
    for (const i of arr) {
      const nx = src[i * 3], ny = src[i * 3 + 1], nz = src[i * 3 + 2];
      let ax = 0, ay = 0, az = 0;
      for (const j of arr) {
        const mx = src[j * 3], my = src[j * 3 + 1], mz = src[j * 3 + 2];
        if (nx * mx + ny * my + nz * mz >= cosLimit) { ax += mx; ay += my; az += mz; }
      }
      const len = Math.hypot(ax, ay, az) || 1;
      nor.setXYZ(i, ax / len, ay / len, az / len);
    }
  }
  nor.needsUpdate = true;
}

// ---------- Dog (real rigged GLTF model) ----------
// The dog is a Quaternius CC0 model (Shiba Inu for the small/calm rungs, Husky
// for the larger/closer rungs) loaded through the shared GLTF cache and animated
// with an AnimationMixer. buildDog() returns a Group SYNCHRONOUSLY so the scene
// can position / parent it right away, then streams the skinned model in. Every
// thing the scene relies on hangs off dog.userData.parts once the model lands.
//
// Forward convention: the dog Group's +Z is "forward" (the snout). The source
// model already faces +Z, so no extra rotation is needed. This matches the
// locomotion math used in setupDogs (yaw = atan2(dx, dz); forward = (sinθ, cosθ)).
// Real coat colours for each breed. Applied as a hue/saturation shift that
// PRESERVES each material's lightness, so the nose stays black and the teeth
// stay white while the fur changes — a blanket tint turns the eyes brown.
const DOG_COATS = {
  shiba: [
    { id: "red",     label: "red",        h: 0.055, s: 0.62, lMul: 1.00 },
    { id: "cream",   label: "cream",      h: 0.095, s: 0.26, lMul: 1.10 },
    { id: "sesame",  label: "sesame",     h: 0.065, s: 0.45, lMul: 0.86 },
    { id: "blacktan",label: "black-and-tan", h: 0.075, s: 0.30, lMul: 0.62 },
  ],
  husky: [
    { id: "grey",    label: "grey",       h: 0.60,  s: 0.06, lMul: 0.96 },
    { id: "black",   label: "black-and-white", h: 0.62, s: 0.03, lMul: 0.74 },
    { id: "copper",  label: "copper",     h: 0.048, s: 0.42, lMul: 0.94 },
    { id: "agouti",  label: "agouti",     h: 0.085, s: 0.24, lMul: 0.80 },
  ],
};
// A dog's coat is IDENTITY, not context — the ladder's fiction is that rung 2
// is "the same small dog, closer now", and an animal that changes colour
// between visits breaks that (and the per-breed trust model built on it). So
// the coat is drawn once per breed per traveller and then kept.
function coatFor(kind, pool) {
  const key = "fobia.coat." + kind;
  try {
    const saved = localStorage.getItem(key);
    const hit = pool.find(c => c.id === saved);
    if (hit) return hit;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    localStorage.setItem(key, chosen.id);
    return chosen;
  } catch { return pool[0]; }
}
const _coatHSL = { h: 0, s: 0, l: 0 };
function applyCoatTint(model, coat) {
  if (!coat) return;
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => {
      if (!m || !m.color) return;
      m.color.getHSL(_coatHSL);
      // Leave the near-black (nose, eyes, pads) and the near-white (teeth,
      // eye-whites) alone — those are features, not fur.
      if (_coatHSL.l < 0.14 || _coatHSL.l > 0.90) return;
      m.color.setHSL(
        coat.h,
        _coatHSL.s + (coat.s - _coatHSL.s) * 0.80,
        Math.max(0.05, Math.min(0.95, _coatHSL.l * coat.lMul))
      );
    });
  });
}

// ---------- Dogs scene ----------
// Small colour lerp on packed hex — used to blend the rung's mood with the
// visit's hour without allocating a Color per field.
function _hexMix(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16 | (ag + (bg - ag) * t) << 8 | (ab + (bb - ab) * t)) & 0xffffff;
}

// House-spider and grass-snake colourings. Same rule as the dog's coat: the
// creature you meet on rung 4 is the one you met on rung 1, so this is drawn
// once per traveller and kept — only its mood and where it sits change.
const SPIDER_COATS = [
  { id: "umber",  h: 0.075, s: 0.34, lMul: 0.78 },
  { id: "sable",  h: 0.070, s: 0.16, lMul: 0.58 },
  { id: "tawny",  h: 0.090, s: 0.44, lMul: 0.92 },
  { id: "ash",    h: 0.085, s: 0.10, lMul: 0.86 },
];
const SNAKE_COATS = [
  { id: "olive",  h: 0.22,  s: 0.32, lMul: 0.90 },
  { id: "bronze", h: 0.085, s: 0.42, lMul: 0.94 },
  { id: "slate",  h: 0.58,  s: 0.12, lMul: 0.80 },
  { id: "sand",   h: 0.115, s: 0.30, lMul: 1.06 },
];

export { makeScaleNormal, makeFurMaps, ensureBoxUV, geometryBox, applySidePhotoUVs, smoothCreaseNormals, DOG_COATS, coatFor, applyCoatTint, _hexMix, SPIDER_COATS, SNAKE_COATS };
