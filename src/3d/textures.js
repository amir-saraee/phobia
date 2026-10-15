// Procedural textures: seeded noise, wood, tile, plaster, concrete, earth,
// grass, rugs, leaves, webs and friends — each baked once and shared.

import * as THREE from "three";
import { sceneQuality } from "./renderer.js";

// ---------- Helpers ----------
function rng(seed) {
  // mulberry32 — deterministic noise so each scene looks consistent
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The procedural bakes below used to be redrawn on every mount — the title
// room, then the trial, then the next trial — and the ones with a normal map
// read their height canvas back from the GPU to do it: 1–2.5 s of frozen main
// thread per scene on a phone-class device (2.5 s of getImageData alone in the
// dog room under software GL). Each is now baked once per graphics tier and
// argument set; every call still gets fresh Texture objects (clones over the
// same image), so callers set their own repeat / wrap, and a mount disposing
// its textures never touches the cached canvases.
function bakedOnce(bake) {
  const cache = new Map();
  return (...args) => {
    const key = sceneQuality() + "|" + args.join(",");
    let tpl = cache.get(key);
    if (!tpl) { tpl = bake(...args); cache.set(key, tpl); }
    if (tpl.isTexture) return tpl.clone();
    const out = {};
    for (const k in tpl) out[k] = tpl[k] && tpl[k].isTexture ? tpl[k].clone() : tpl[k];
    return out;
  };
}

function bakeWoodTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#5a3a20";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#3a2410";
  for (let y = 0; y < 256; y += 32) ctx.fillRect(0, y, 256, 1);
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(40, 25, 10, ${Math.random() * 0.32})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 8 + Math.random() * 22);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const makeWoodTexture = bakedOnce(bakeWoodTexture);

function bakeTileTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#3e3e46";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "#1c1c22";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, 256);
    ctx.moveTo(0, i); ctx.lineTo(256, i);
    ctx.stroke();
  }
  for (let i = 0; i < 200; i++) {
    ctx.fillStyle = `rgba(20, 20, 25, ${Math.random() * 0.35})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const makeTileTexture = bakedOnce(bakeTileTexture);

function bakeWallTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#5c5c66";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const v = Math.floor(Math.random() * 30 - 15);
    ctx.fillStyle = `rgba(${100 + v}, ${100 + v}, ${110 + v}, 0.4)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  for (let i = 0; i < 6; i++) {
    const grd = ctx.createRadialGradient(
      Math.random() * 256, Math.random() * 256, 0,
      Math.random() * 256, Math.random() * 256, 30 + Math.random() * 60
    );
    grd.addColorStop(0, "rgba(40, 30, 20, 0.3)");
    grd.addColorStop(1, "rgba(40, 30, 20, 0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const makeWallTexture = bakedOnce(bakeWallTexture);

function bakeAsphaltTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1a1d22";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = Math.floor(Math.random() * 30);
    ctx.fillStyle = `rgba(${30 + v}, ${30 + v}, ${35 + v}, 0.45)`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }
  // dashed center line
  ctx.fillStyle = "#d4c060";
  for (let y = 8; y < 256; y += 36) ctx.fillRect(125, y, 6, 18);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const makeAsphaltTexture = bakedOnce(bakeAsphaltTexture);

// Concrete platform texture for the rooftop / cliff surface. Mottled grey
// aggregate with weathering streaks so the user has a clear sense of "I am
// standing on a real surface" rather than a flat untextured slab.
// Builds a full PBR map set for the rooftop concrete: albedo (the visible
// color), normal (perturbs lighting per-pixel for fake bumps), roughness
// (matte vs slightly polished spots from foot wear), AO (darkens crevices).
// Returned as { albedo, normal, roughness, ao }. All four are CanvasTextures
// sharing the same canvas size + wrap mode. Generated procedurally so they
// stay in sync without a CDN dependency.
function bakeConcreteMaps() {
  const SIZE = 256;
  const albedo = document.createElement("canvas"); albedo.width = albedo.height = SIZE;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const rough = document.createElement("canvas"); rough.width = rough.height = SIZE;
  const ao = document.createElement("canvas"); ao.width = ao.height = SIZE;
  const aCtx = albedo.getContext("2d");
  const hCtx = heightC.getContext("2d", { willReadFrequently: true });
  const rCtx = rough.getContext("2d");
  const oCtx = ao.getContext("2d");

  // ----- 1. Albedo (visible colour, similar to before) -----
  aCtx.fillStyle = "#888a8e";
  aCtx.fillRect(0, 0, SIZE, SIZE);
  hCtx.fillStyle = "#808080";       // mid-grey = "no displacement"
  hCtx.fillRect(0, 0, SIZE, SIZE);
  rCtx.fillStyle = "#bcbcbc";       // base roughness ~0.74 (matte concrete)
  rCtx.fillRect(0, 0, SIZE, SIZE);
  oCtx.fillStyle = "#ffffff";       // base AO = 1 (no occlusion)
  oCtx.fillRect(0, 0, SIZE, SIZE);

  // Aggregate speckle — visible in albedo, raised dots in height, slightly
  // rougher in roughness, slight AO in the dimples
  for (let i = 0; i < 4000; i++) {
    const v = Math.floor(Math.random() * 70);
    const x = Math.random() * SIZE;
    const y = Math.random() * SIZE;
    const r = Math.random() * 1.6 + 0.4;
    aCtx.fillStyle = `rgba(${50 + v}, ${50 + v}, ${55 + v}, 0.35)`;
    aCtx.fillRect(x, y, r, r);
    // Pebbles read as slight bumps — height value above 128
    const heightVal = 128 + Math.floor(20 + Math.random() * 30);
    hCtx.fillStyle = `rgb(${heightVal},${heightVal},${heightVal})`;
    hCtx.fillRect(x, y, r, r);
    // Pebble tops are slightly less rough (worn smoother)
    if (Math.random() < 0.4) {
      rCtx.fillStyle = `rgba(150,150,150,0.55)`;
      rCtx.fillRect(x, y, r, r);
    }
  }
  // Weathering streaks — dark lines in albedo, slightly recessed in height,
  // rougher in roughness, slight AO
  for (let i = 0; i < 18; i++) {
    const y = Math.random() * SIZE;
    const h = 0.6 + Math.random() * 1.4;
    aCtx.fillStyle = `rgba(60,60,65,${0.05 + Math.random() * 0.07})`;
    aCtx.fillRect(0, y, SIZE, h);
    rCtx.fillStyle = `rgba(190,190,190,0.25)`;        // streaks more matte
    rCtx.fillRect(0, y, SIZE, h);
  }
  // Expansion joints — strong dark lines, real recess in height + heavy AO
  aCtx.fillStyle = "rgba(40,40,45,0.55)";
  aCtx.fillRect(0, 127, SIZE, 1.5);
  aCtx.fillRect(127, 0, 1.5, SIZE);
  hCtx.fillStyle = "rgb(60,60,60)";    // recessed (below 128 = below baseline)
  hCtx.fillRect(0, 127, SIZE, 2);
  hCtx.fillRect(127, 0, 2, SIZE);
  oCtx.fillStyle = "rgba(0,0,0,0.55)"; // dark AO in the joints
  oCtx.fillRect(0, 127, SIZE, 2);
  oCtx.fillRect(127, 0, 2, SIZE);

  // ----- 2. Convert height map to normal map via Sobel -----
  // Sample the heightC canvas, build a normal RGB texture in another canvas.
  const normalC = document.createElement("canvas");
  normalC.width = normalC.height = SIZE;
  const nCtx = normalC.getContext("2d");
  const heightData = hCtx.getImageData(0, 0, SIZE, SIZE).data;
  const normalImg = nCtx.createImageData(SIZE, SIZE);
  const sample = (x, y) => {
    x = (x + SIZE) % SIZE;
    y = (y + SIZE) % SIZE;
    return heightData[(y * SIZE + x) * 4] / 255;
  };
  // Strength multiplier — 1.5 gives a clearly visible but not exaggerated
  // bump effect on the platform when grazed by the sun.
  const strength = 1.5;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Sobel x derivative
      const dx = (sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1))
               - (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1));
      // Sobel y derivative
      const dy = (sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1))
               - (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1));
      // Tangent-space normal = (-dx, -dy, 1/strength) normalized, then mapped to 0..255
      const nx = -dx * strength;
      const ny = -dy * strength;
      const nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * SIZE + x) * 4;
      normalImg.data[i]     = Math.round((nx / len * 0.5 + 0.5) * 255);
      normalImg.data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      normalImg.data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      normalImg.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(normalImg, 0, 0);

  // ----- 3. Three.js textures -----
  const make = (canvas, opts = {}) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (opts.colorSpace) t.colorSpace = opts.colorSpace;
    return t;
  };
  return {
    albedo:    make(albedo, { colorSpace: THREE.SRGBColorSpace }),
    normal:    make(normalC),
    roughness: make(rough),
    ao:        make(ao),
  };
}
const makeConcreteMaps = bakedOnce(bakeConcreteMaps);

// Backwards-compatible single-texture helper — anywhere that still calls
// makeConcreteTexture() gets just the albedo map.
function makeConcreteTexture() { return makeConcreteMaps().albedo; }

// Shared Sobel height→normal step for the procedural PBR generators below.
// Same math as the inline pass in makeConcreteMaps; factored so the dog-room
// plank/plaster/rug bakes don't triplicate it.
function heightCanvasToNormal(heightCanvas, strength) {
  const S = heightCanvas.width;
  const normalC = document.createElement("canvas");
  normalC.width = normalC.height = S;
  const nCtx = normalC.getContext("2d");
  const heightData = heightCanvas.getContext("2d").getImageData(0, 0, S, S).data;
  const normalImg = nCtx.createImageData(S, S);
  const sample = (x, y) => heightData[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1))
               - (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1));
      const dy = (sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1))
               - (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1));
      const nx = -dx * strength, ny = -dy * strength, nz = 1.0;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * S + x) * 4;
      normalImg.data[i]     = Math.round((nx / len * 0.5 + 0.5) * 255);
      normalImg.data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      normalImg.data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      normalImg.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(normalImg, 0, 0);
  return normalC;
}

// Wraps canvases as repeating THREE textures. AO maps are skipped on purpose
// across these generators — r160 reads AO from a second UV channel our planes
// don't have, and SSAO already provides contact darkening.
function canvasMapSet(albedoC, normalC, roughC) {
  const make = (canvas, colorSpace) => {
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (colorSpace) t.colorSpace = colorSpace;
    return t;
  };
  return {
    albedo:    make(albedoC, THREE.SRGBColorSpace),
    normal:    normalC ? make(normalC) : null,
    roughness: roughC ? make(roughC) : null,
  };
}

// Warm bare earth: soil grain + organic blotches + pebbles (the dirt path).
function bakeEarthMaps() {
  const SIZE = sceneQuality() === "low" ? 128 : 256;
  const albedo = document.createElement("canvas"); albedo.width = albedo.height = SIZE;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const rough = document.createElement("canvas"); rough.width = rough.height = SIZE;
  const a = albedo.getContext("2d"), h = heightC.getContext("2d", { willReadFrequently: true }), r = rough.getContext("2d");
  a.fillStyle = "#6a5a38"; a.fillRect(0, 0, SIZE, SIZE);
  h.fillStyle = "#808080"; h.fillRect(0, 0, SIZE, SIZE);
  r.fillStyle = "rgb(210,210,210)"; r.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, rr = 12 + Math.random() * 18;
    const g = a.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, "rgba(74,61,38,0.3)"); g.addColorStop(1, "rgba(74,61,38,0)");
    a.fillStyle = g; a.beginPath(); a.arc(x, y, rr, 0, Math.PI * 2); a.fill();
  }
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, s = 0.5 + Math.random() * 1.5;
    a.fillStyle = Math.random() < 0.5 ? "rgba(87,74,46,0.4)" : "rgba(125,106,66,0.4)";
    a.fillRect(x, y, s, s);
    if (Math.random() < 0.15) { const hv = 128 + 18 + Math.floor(Math.random() * 22); h.fillStyle = `rgb(${hv},${hv},${hv})`; h.fillRect(x, y, s + 0.5, s + 0.5); r.fillStyle = "rgba(160,160,160,0.5)"; r.fillRect(x, y, s, s); }
  }
  for (let i = 0; i < 12; i++) { h.fillStyle = "rgb(98,98,98)"; h.fillRect(Math.random() * SIZE, Math.random() * SIZE, 1, 8 + Math.random() * 20); }
  return canvasMapSet(albedo, heightCanvasToNormal(heightC, 2.0), rough);
}
const makeEarthMaps = bakedOnce(bakeEarthMaps);

// Warm olive grass: short blade strokes + macro tone patches.
function bakeGrassMaps() {
  const SIZE = sceneQuality() === "low" ? 128 : 256;
  const albedo = document.createElement("canvas"); albedo.width = albedo.height = SIZE;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const rough = document.createElement("canvas"); rough.width = rough.height = SIZE;
  const a = albedo.getContext("2d"), h = heightC.getContext("2d", { willReadFrequently: true }), r = rough.getContext("2d");
  a.fillStyle = "#59702f"; a.fillRect(0, 0, SIZE, SIZE);
  h.fillStyle = "#808080"; h.fillRect(0, 0, SIZE, SIZE);
  r.fillStyle = "rgb(230,230,230)"; r.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 24; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, rr = SIZE * (0.15 + Math.random() * 0.2);
    const g = a.createRadialGradient(x, y, 0, x, y, rr);
    const dl = (Math.random() - 0.5) * 0.15;
    g.addColorStop(0, `rgba(${89 + dl * 60},${112 + dl * 60},${47 + dl * 40},0.18)`); g.addColorStop(1, "rgba(0,0,0,0)");
    a.fillStyle = g; a.beginPath(); a.arc(x, y, rr, 0, Math.PI * 2); a.fill();
  }
  for (let i = 0; i < 2500; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, len = 5 + Math.random() * 6, ang = -Math.PI / 2 + (Math.random() - 0.5);
    a.strokeStyle = Math.random() < 0.5 ? "rgba(74,102,38,0.7)" : "rgba(111,138,58,0.7)";
    a.lineWidth = 1; a.beginPath(); a.moveTo(x, y); a.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); a.stroke();
    if (Math.random() < 0.2) { const hv = 128 + 8 + Math.floor(Math.random() * 10); h.fillStyle = `rgb(${hv},${hv},${hv})`; h.fillRect(x, y, 1, len); }
  }
  return canvasMapSet(albedo, heightCanvasToNormal(heightC, 1.4), rough);
}
const makeGrassMaps = bakedOnce(bakeGrassMaps);

// Oak plank floor: one 1.4×1.4 m tile, 4 plank columns with staggered end
// joints, per-plank hue jitter, grain streaks, knots. Halved resolution on
// the low tier — baked once per tier (bakedOnce) and shared by every room.
function bakePlankMaps() {
  const SIZE = sceneQuality() === "low" ? 256 : 512;
  const k = SIZE / 512;                       // scale factor for px constants
  const albedo = document.createElement("canvas"); albedo.width = albedo.height = SIZE;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const rough = document.createElement("canvas"); rough.width = rough.height = SIZE;
  const aCtx = albedo.getContext("2d"), hCtx = heightC.getContext("2d", { willReadFrequently: true }), rCtx = rough.getContext("2d");
  hCtx.fillStyle = "#808080"; hCtx.fillRect(0, 0, SIZE, SIZE);
  rCtx.fillStyle = "rgb(158,158,158)"; rCtx.fillRect(0, 0, SIZE, SIZE);
  // Eight boards per tile, not four. Callers map this tile to ~1.4 m of floor,
  // so four columns made every board 35 cm wide — nearly square once the end
  // joints fell about a metre apart, and a grid of near-squares with per-cell
  // tone jitter is read as parquet checkerboard no matter how mild the jitter
  // is. Real oak strip flooring is 12–20 cm wide; at eight columns each board
  // lands at ~17 cm and the same jitter now reads as plank-to-plank colour
  // variation, which is what actually sells a wooden floor.
  const COLS = 8;
  const colW = SIZE / COLS;
  for (let c = 0; c < COLS; c++) {
    // Per-plank colour: warm oak with hue/lightness jitter per column segment
    // (segments = staggered end joints along V). Jitter is deliberately mild —
    // strong per-segment value contrast reads as checkerboard parquet once
    // the tile repeats across the room.
    const joints = [0];
    let y = (0.55 + Math.random() * 0.35) * 400 * k;
    while (y < SIZE) { joints.push(Math.round(y)); y += (340 + Math.random() * 140) * k; }
    joints.push(SIZE);
    for (let j = 0; j + 1 < joints.length; j++) {
      const y0 = joints[j], y1 = joints[j + 1];
      const hue = 32 + (Math.random() - 0.5) * 6;
      const sat = 38 + (Math.random() - 0.5) * 8;
      const lit = 62 + (Math.random() - 0.5) * 7;
      aCtx.fillStyle = `hsl(${hue}, ${sat}%, ${lit}%)`;
      aCtx.fillRect(c * colW, y0, colW, y1 - y0);
      // subtle per-plank height offset for normal variation
      const hv = 128 + Math.round((Math.random() - 0.5) * 12);
      hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
      hCtx.fillRect(c * colW, y0, colW, y1 - y0);
      // end-joint recess
      hCtx.fillStyle = "rgb(40,40,40)";
      hCtx.fillRect(c * colW, y1 - 1, colW, 2);
      rCtx.fillStyle = "rgb(220,220,220)";
      rCtx.fillRect(c * colW, y1 - 1, colW, 2);
    }
    // Grain: fine vertical streaks within the column. Halved per column now
    // that there are twice as many columns — this keeps grain density per
    // square metre of floor the same as before rather than doubling it.
    for (let g = 0; g < 30; g++) {
      const gx = c * colW + Math.random() * colW;
      const gy = Math.random() * SIZE;
      const gl = (40 + Math.random() * 120) * k;
      aCtx.fillStyle = `rgba(90,60,30,${0.05 + Math.random() * 0.09})`;
      aCtx.fillRect(gx, gy, 1, gl);
      hCtx.fillStyle = `rgba(${118 + Math.random() * 10},${118},${118},0.5)`;
      hCtx.fillRect(gx, gy, 1, gl);
    }
    // Knots — sparse. Every board carrying two or three knots reads as
    // reclaimed barn timber; most boards in a domestic floor have none.
    const knots = Math.random() < 0.45 ? 1 : 0;
    for (let n = 0; n < knots; n++) {
      const kx = c * colW + colW * (0.25 + Math.random() * 0.5);
      const ky = Math.random() * SIZE;
      const kr = (4 + Math.random() * 5) * k;
      const grad = aCtx.createRadialGradient(kx, ky, 0, kx, ky, kr);
      grad.addColorStop(0, "rgba(70,45,22,0.5)");
      grad.addColorStop(1, "rgba(70,45,22,0)");
      aCtx.fillStyle = grad;
      aCtx.beginPath(); aCtx.arc(kx, ky, kr, 0, Math.PI * 2); aCtx.fill();
    }
    // Plank gap between columns
    hCtx.fillStyle = "rgb(40,40,40)";
    hCtx.fillRect(c * colW - 1, 0, 2, SIZE);
    rCtx.fillStyle = "rgb(220,220,220)";
    rCtx.fillRect(c * colW - 1, 0, 2, SIZE);
  }
  // Worn gloss streaks along the traffic axis (V) — slightly smoother
  for (let s = 0; s < 6; s++) {
    rCtx.fillStyle = "rgba(120,120,120,0.35)";
    rCtx.fillRect(Math.random() * SIZE, 0, (10 + Math.random() * 26) * k, SIZE);
  }
  return canvasMapSet(albedo, heightCanvasToNormal(heightC, 1.2), rough);
}
const makePlankMaps = bakedOnce(bakePlankMaps);

// Interior plaster: low-frequency mottling + fine speckle. Uniform roughness
// is set on the material (0.92), so no roughness map.
function bakePlasterMaps() {
  const SIZE = sceneQuality() === "low" ? 128 : 256;
  const albedo = document.createElement("canvas"); albedo.width = albedo.height = SIZE;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const aCtx = albedo.getContext("2d"), hCtx = heightC.getContext("2d", { willReadFrequently: true });
  aCtx.fillStyle = "#cbb59a"; aCtx.fillRect(0, 0, SIZE, SIZE);
  hCtx.fillStyle = "#808080"; hCtx.fillRect(0, 0, SIZE, SIZE);
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, r = SIZE * (0.2 + Math.random() * 0.3);
    const grad = aCtx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(120,100,80,0.06)");
    grad.addColorStop(1, "rgba(120,100,80,0)");
    aCtx.fillStyle = grad;
    aCtx.beginPath(); aCtx.arc(x, y, r, 0, Math.PI * 2); aCtx.fill();
  }
  for (let i = 0; i < 3000; i++) {
    const v = Math.round((Math.random() - 0.5) * 20);
    const x = Math.random() * SIZE, y = Math.random() * SIZE;
    aCtx.fillStyle = `rgba(${180 + v},${160 + v},${138 + v},0.25)`;
    aCtx.fillRect(x, y, 1, 1);
    const hv = 128 + Math.round((Math.random() - 0.5) * 12);
    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.fillRect(x, y, 1, 1);
  }
  return canvasMapSet(albedo, heightCanvasToNormal(heightC, 0.6), null);
}
const makePlasterMaps = bakedOnce(bakePlasterMaps);

// Woven rug, non-tiling: field + baked border band (replaces the old
// full-surface "outline" overlay that darkened the whole rug).
function bakeRugMaps() {
  const SIZE = sceneQuality() === "low" ? 256 : 512;
  const k = SIZE / 512;
  const albedo = document.createElement("canvas"); albedo.width = albedo.height = SIZE;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const aCtx = albedo.getContext("2d"), hCtx = heightC.getContext("2d", { willReadFrequently: true });
  aCtx.fillStyle = "#b3766f"; aCtx.fillRect(0, 0, SIZE, SIZE);
  hCtx.fillStyle = "#808080"; hCtx.fillRect(0, 0, SIZE, SIZE);
  // Weave: 2px checker in both albedo value and height — one 4×4 tile filled
  // as a pattern (it was 65k individual fillRects at 512²).
  const weave = (style) => {
    const t = document.createElement("canvas"); t.width = t.height = 4;
    const c = t.getContext("2d");
    c.fillStyle = style; c.fillRect(0, 0, 2, 2); c.fillRect(2, 2, 2, 2);
    return t;
  };
  aCtx.fillStyle = aCtx.createPattern(weave("rgba(0,0,0,0.06)"), "repeat");
  aCtx.fillRect(0, 0, SIZE, SIZE);
  hCtx.fillStyle = hCtx.createPattern(weave("rgb(123,123,123)"), "repeat");
  hCtx.fillRect(0, 0, SIZE, SIZE);
  // Border band, drawn in (not overlaid)
  const inset = 10 * k, band = 26 * k;
  aCtx.fillStyle = "#7d4640";
  aCtx.fillRect(inset, inset, SIZE - inset * 2, band);
  aCtx.fillRect(inset, SIZE - inset - band, SIZE - inset * 2, band);
  aCtx.fillRect(inset, inset, band, SIZE - inset * 2);
  aCtx.fillRect(SIZE - inset - band, inset, band, SIZE - inset * 2);
  aCtx.strokeStyle = "#d8c7b0"; aCtx.lineWidth = 3 * k;
  aCtx.strokeRect(inset + band + 2, inset + band + 2, SIZE - (inset + band + 2) * 2, SIZE - (inset + band + 2) * 2);
  hCtx.fillStyle = "rgb(140,140,140)";
  hCtx.fillRect(inset, inset, SIZE - inset * 2, band);
  hCtx.fillRect(inset, SIZE - inset - band, SIZE - inset * 2, band);
  hCtx.fillRect(inset, inset, band, SIZE - inset * 2);
  hCtx.fillRect(SIZE - inset - band, inset, band, SIZE - inset * 2);
  const set = canvasMapSet(albedo, heightCanvasToNormal(heightC, 0.8), null);
  set.albedo.wrapS = set.albedo.wrapT = THREE.ClampToEdgeWrapping;
  if (set.normal) set.normal.wrapS = set.normal.wrapT = THREE.ClampToEdgeWrapping;
  return set;
}
const makeRugMaps = bakedOnce(bakeRugMaps);

// Single leaf silhouette with midrib, alpha-tested — 14 of these fanned at
// the golden angle replace the old sphere-blob houseplant.
function bakeLeafTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 128;
  const ctx = c.getContext("2d");
  const grad = ctx.createLinearGradient(0, 128, 0, 0);
  grad.addColorStop(0, "#3a6a32");
  grad.addColorStop(1, "#568a3e");
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(32, 126);
  ctx.bezierCurveTo(6, 96, 4, 46, 32, 4);
  ctx.bezierCurveTo(60, 46, 58, 96, 32, 126);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(30,52,26,0.8)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(32, 122); ctx.lineTo(32, 10); ctx.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const makeLeafTexture = bakedOnce(bakeLeafTexture);

// Cold damp cellar plaster: grey concrete-plaster base + vertical water-stain
// streaks + pale efflorescence blooms. Same pipeline as makePlasterMaps but a
// different palette — the opposite of the dog room's warm interior.
function bakeDampPlasterMaps() {
  const SIZE = sceneQuality() === "low" ? 128 : 256;
  const albedo = document.createElement("canvas"); albedo.width = albedo.height = SIZE;
  const heightC = document.createElement("canvas"); heightC.width = heightC.height = SIZE;
  const aCtx = albedo.getContext("2d"), hCtx = heightC.getContext("2d", { willReadFrequently: true });
  aCtx.fillStyle = "#5b5f63"; aCtx.fillRect(0, 0, SIZE, SIZE);
  hCtx.fillStyle = "#808080"; hCtx.fillRect(0, 0, SIZE, SIZE);
  // Low-frequency cold mottling
  for (let i = 0; i < 8; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE, r = SIZE * (0.2 + Math.random() * 0.3);
    const grad = aCtx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(30,38,44,0.10)");
    grad.addColorStop(1, "rgba(30,38,44,0)");
    aCtx.fillStyle = grad;
    aCtx.beginPath(); aCtx.arc(x, y, r, 0, Math.PI * 2); aCtx.fill();
  }
  // Vertical water-stain streaks (the damp cellar tell)
  const streaks = sceneQuality() === "low" ? 8 : 13;
  for (let i = 0; i < streaks; i++) {
    const sx = Math.random() * SIZE, sw = 3 + Math.random() * 7;
    const grad = aCtx.createLinearGradient(0, 0, 0, SIZE);
    grad.addColorStop(0, "rgba(24,30,36,0.02)");
    grad.addColorStop(0.4, `rgba(24,30,36,${0.10 + Math.random() * 0.08})`);
    grad.addColorStop(1, "rgba(24,30,36,0.04)");
    aCtx.fillStyle = grad;
    aCtx.fillRect(sx, 0, sw, SIZE);
  }
  // Efflorescence — pale mineral blooms near the top
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * SIZE, y = Math.random() * SIZE * 0.4, r = SIZE * (0.06 + Math.random() * 0.09);
    const grad = aCtx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(150,160,170,0.06)");
    grad.addColorStop(1, "rgba(150,160,170,0)");
    aCtx.fillStyle = grad;
    aCtx.beginPath(); aCtx.arc(x, y, r, 0, Math.PI * 2); aCtx.fill();
  }
  // Fine speckle + height noise
  for (let i = 0; i < 2600; i++) {
    const v = Math.round((Math.random() - 0.5) * 16);
    const x = Math.random() * SIZE, y = Math.random() * SIZE;
    aCtx.fillStyle = `rgba(${88 + v},${94 + v},${99 + v},0.22)`;
    aCtx.fillRect(x, y, 1, 1);
    const hv = 128 + Math.round((Math.random() - 0.5) * 12);
    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.fillRect(x, y, 1, 1);
  }
  // Low tier: flat walls (skip the normal-map bake)
  const nrm = sceneQuality() === "low" ? null : heightCanvasToNormal(heightC, 0.6);
  return canvasMapSet(albedo, nrm, null);
}
const makeDampPlasterMaps = bakedOnce(bakeDampPlasterMaps);

// Cobweb alpha texture: radial spokes + concentric catenary arcs from a corner
// origin. Used as map+alphaMap on a translucent plane tucked in a wall corner.
function bakeWebTexture() {
  const S = 128;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const ctx = c.getContext("2d");
  ctx.clearRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(210,214,220,0.5)";
  ctx.lineWidth = 0.7;
  const ox = 4, oy = S - 4;               // corner origin (bottom-left)
  const spokes = 7, R = S - 8;
  const ang = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / (spokes - 1)) * (Math.PI / 2);   // 0..90°
    ang.push(a);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + Math.cos(a) * R, oy - Math.sin(a) * R);
    ctx.stroke();
  }
  // Concentric catenary arcs connecting adjacent spokes, sagging inward
  for (let ring = 1; ring <= 5; ring++) {
    const rr = (ring / 5.5) * R;
    ctx.beginPath();
    for (let i = 0; i < spokes; i++) {
      const px = ox + Math.cos(ang[i]) * rr;
      const py = oy - Math.sin(ang[i]) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else {
        // sag toward the origin at the midpoint
        const pa = ang[i - 1], mx = ox + Math.cos((pa + ang[i]) / 2) * rr * 0.86;
        const my = oy - Math.sin((pa + ang[i]) / 2) * rr * 0.86;
        ctx.quadraticCurveTo(mx, my, px, py);
      }
    }
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
const makeWebTexture = bakedOnce(bakeWebTexture);

// Yellow / black hazard stripe along the platform edge. Drawn as a long thin
// canvas (1024×32) so it reads at any zoom — the bright edge marker tells the
// user exactly where the drop begins.
function bakeEdgeStripeTexture() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 32;
  const ctx = c.getContext("2d");
  // Diagonal yellow / black stripes
  for (let i = 0; i < 1024 + 64; i += 32) {
    ctx.fillStyle = "#ffd23d";
    ctx.beginPath();
    ctx.moveTo(i,        0);
    ctx.lineTo(i + 16,   0);
    ctx.lineTo(i - 16,  32);
    ctx.lineTo(i - 32,  32);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.beginPath();
    ctx.moveTo(i + 16,   0);
    ctx.lineTo(i + 32,   0);
    ctx.lineTo(i,       32);
    ctx.lineTo(i - 16,  32);
    ctx.closePath(); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
const makeEdgeStripeTexture = bakedOnce(bakeEdgeStripeTexture);

// ---------- Heights ----------
// Procedural city-street ground: a tiling block+road grid so looking straight
// down from height reads as a real city (streets, lane markings, sidewalks,
// block rooftops) instead of a flat sheet of asphalt with floating car-dots.
// One texture tile == one ~30 m city block; repeated across the ground plane.
function bakeCityGridTexture(tod) {
  const dark = tod === "twilight";
  const dusk = tod === "golden";
  const S = 512;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  // Block / rooftop fill
  const blockCol = dark ? "#15171d" : dusk ? "#2a2622" : "#2d3036";
  x.fillStyle = blockCol; x.fillRect(0, 0, S, S);
  // Rooftop speckle so blocks aren't flat
  for (let i = 0; i < 900; i++) {
    const v = Math.random() * 0.10 - 0.05;
    x.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v)})`;
    x.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }
  // Roads run along two edges of the tile → continuous grid when tiled.
  const roadW = 96;                                  // ≈ wide street
  const roadCol = dark ? "#0c0d11" : dusk ? "#1c1916" : "#202227";
  const walkCol = dark ? "#23252c" : "#3a3d44";       // sidewalk
  x.fillStyle = walkCol; x.fillRect(0, 0, roadW + 14, S); x.fillRect(0, 0, S, roadW + 14);
  x.fillStyle = roadCol; x.fillRect(0, 0, roadW, S);    x.fillRect(0, 0, S, roadW);
  // Lane dashes down the centre of each road
  x.strokeStyle = dark ? "rgba(200,180,90,0.55)" : "rgba(225,205,110,0.7)";
  x.lineWidth = 3; x.setLineDash([22, 26]);
  x.beginPath(); x.moveTo(roadW / 2, 0); x.lineTo(roadW / 2, S);
  x.moveTo(0, roadW / 2); x.lineTo(S, roadW / 2); x.stroke();
  x.setLineDash([]);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const makeCityGridTexture = bakedOnce(bakeCityGridTexture);

export { rng, makeWoodTexture, makeConcreteMaps, heightCanvasToNormal, makeEarthMaps, makeGrassMaps, makePlankMaps, makePlasterMaps, makeRugMaps, makeLeafTexture, makeDampPlasterMaps, makeWebTexture, makeEdgeStripeTexture, makeCityGridTexture };
