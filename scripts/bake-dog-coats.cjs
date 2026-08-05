#!/usr/bin/env node
/**
 * Bake breed-specific PBR coat maps (albedo / normal / roughness) for the
 * Quaternius dogs.
 *
 * The palettes are SAMPLED from assets/refs/dog-*-reference.png, not
 * hand-picked. Guessed constants are how a shiba ends up the wrong kind of
 * orange: the photographs are already the ground truth, so read them.
 *
 * Output: assets/models/textures/{breed}_{albedo,normal,roughness}.png
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const OUT = path.join(__dirname, "..", "assets", "models", "textures");
const REFS = path.join(__dirname, "..", "assets", "refs");
const SIZE = 1024;

// Per breed: which photo, where the animal's body sits in it, how neutral that
// animal's lightest fur really is (see `wb` below), and a strand seed. Without
// distinct seeds every breed bakes byte-identical normal/roughness maps, which
// is real duplication on disk and in the service-worker precache for no gain.
// The crop is the left-profile body core of the studio sheet — see the crop
// note in samplePalette for why it has to be that tight.
const BREEDS = {
  // A shiba's underside is genuinely cream, so balancing it all the way to
  // white would launder the breed's own colour out of the map.
  shiba: { ref: "dog-shiba-reference.png", crop: [0.10, 0.42, 0.28, 0.72], wb: 0.25, seed: 0 },
  // A husky's underside really is white — take the full correction.
  husky: { ref: "dog-husky-reference.png", crop: [0.10, 0.42, 0.28, 0.72], wb: 1.00, seed: 977 },
};

// Pull a breed's coat palette out of its photo. Sorting the surviving pixels by
// luminance and reading four quantiles gives the tonal ladder a coat actually
// has — shadow tipping, mid, body, and the light underside.
//
// Three rejections do the real work:
//   * Vegetation — foliage is the only thing here whose green sits well above
//     its blue AND above its red. A warm tan coat is red-max, and a gray/white
//     coat is near-neutral (g ≈ b), so neither trips it, while lit grass, grass
//     in shadow, and dark background trees all do.
//   * Sky — blue-dominant.
//   * Studio backdrop — the neutral reference sheets sit on a flat mid-grey
//     seamless. Without rejecting that, the light quantiles become wallpaper
//     grey instead of cream/white fur (which is exactly what the first
//     dog-*-reference bake produced).
function samplePalette(file, crop, wb) {
  const png = PNG.sync.read(fs.readFileSync(path.join(REFS, file)));
  const { width: W, height: H, data } = png;
  const px = [];
  const x0 = Math.floor(W * crop[0]), x1 = Math.floor(W * crop[1]);
  const y0 = Math.floor(H * crop[2]), y1 = Math.floor(H * crop[3]);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * W + x) * 4;
      if (data[i + 3] < 200) continue;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (g > r && g > b * 1.10) continue;                 // grass, foliage
      if (b > r * 1.06 && b > g * 1.02) continue;          // sky / blue cast
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const neut = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      // Flat studio grey / off-white seamless — keep real white fur (high lum
      // AND still slightly warm or cool-cast from the coat) by requiring the
      // neutral band to also be mid-grey, not bright white fur highlights.
      if (neut < 14 && lum > 145 && lum < 235) continue;
      px.push([r, g, b, lum]);
    }
  }
  if (px.length < 500) throw new Error(`ref ${file}: only ${px.length} coat pixels survived`);
  px.sort((a, b) => a[3] - b[3]);
  // Average a band around each quantile rather than trusting one pixel.
  const at = (q) => {
    const c = Math.floor(px.length * q);
    const lo = Math.max(0, c - Math.floor(px.length * 0.02));
    const hi = Math.min(px.length, c + Math.floor(px.length * 0.02) + 1);
    let r = 0, g = 0, b = 0;
    for (let i = lo; i < hi; i++) { r += px[i][0]; g += px[i][1]; b += px[i][2]; }
    const n = hi - lo;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  };
  const pal = { tip: at(0.06), patch: at(0.30), base: at(0.58), cream: at(0.94) };

  // A photograph records radiance, not reflectance: the ref's warm light is
  // baked into every pixel, and pasting that into an albedo map double-counts
  // the lighting the scene is about to add on top. Correct with the white-patch
  // rule — the lightest fur is the nearest thing to a grey card in frame — but
  // only as far as `wb`, because the lightest fur is not neutral in every
  // breed. Full correction on a shiba bleaches the very colour we came for.
  const w = pal.cream;
  const mean = (w[0] + w[1] + w[2]) / 3;
  const gain = w.map((c) => 1 + wb * (mean / Math.max(1, c) - 1));
  for (const k of ["tip", "patch", "base", "cream"]) {
    pal[k] = pal[k].map((v, i) => Math.max(0, Math.min(255, Math.round(v * gain[i]))));
  }
  return { ...pal, n: px.length };
}

function hash(i) {
  let x = (i * 374761393 + 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// Opaque maps, and roughness is greyscale — writing RGBA for all of them cost
// ~4 MB across the texture set, all of it precached by the service worker.
function writePNG(file, rgba, grey) {
  const colorType = grey ? 0 : 2;
  const png = new PNG({ width: SIZE, height: SIZE, colorType, inputColorType: 6, inputHasAlpha: true });
  Buffer.from(rgba).copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType }));
}

function bakeBreed(name, pal, seed) {
  const albedo = new Uint8ClampedArray(SIZE * SIZE * 4);
  const normal = new Uint8ClampedArray(SIZE * SIZE * 4);
  const rough = new Uint8ClampedArray(SIZE * SIZE * 4);

  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = i * 4;
    normal[o] = 128; normal[o + 1] = 128; normal[o + 2] = 255; normal[o + 3] = 255;
    rough[o] = 220; rough[o + 1] = 220; rough[o + 2] = 220; rough[o + 3] = 255;
  }

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const n1 = hash(x * 17 + y * 91);
      const n2 = hash(x * 53 + y * 19 + 7);
      const n3 = hash(x * 3 + y * 101 + 99);
      const creamW = Math.max(0, Math.sin((x / SIZE) * Math.PI) * 0.35 + (n1 - 0.5) * 0.2);
      const tipW = Math.max(0, (n2 - 0.55) * 1.6);
      const patchW = Math.max(0, Math.sin((y / SIZE) * Math.PI * 2 + n3) * 0.25);

      let r = pal.base[0], g = pal.base[1], b = pal.base[2];
      const mix = (a, t) => {
        r = r + (a[0] - r) * t;
        g = g + (a[1] - g) * t;
        b = b + (a[2] - b) * t;
      };
      mix(pal.cream, Math.min(1, creamW));
      mix(pal.patch, Math.min(1, patchW));
      mix(pal.tip, Math.min(1, tipW * 0.55));

      const grain = (hash(x * 131 + y * 17 + 3) - 0.5) * 18;
      albedo[i] = Math.max(0, Math.min(255, r + grain));
      albedo[i + 1] = Math.max(0, Math.min(255, g + grain * 0.9));
      albedo[i + 2] = Math.max(0, Math.min(255, b + grain * 0.8));
      albedo[i + 3] = 255;
    }
  }

  // Scale strand count with resolution so 1024 maps keep similar hair density.
  const HAIR = Math.round(5200 * (SIZE / 512) * (SIZE / 512));
  for (let h = 0; h < HAIR; h++) {
    const s = seed + h;
    const x0 = hash(s * 3) * SIZE;
    const y0 = hash(s * 3 + 1) * SIZE;
    const ang = Math.PI / 2 + (hash(s * 3 + 2) - 0.5) * 0.45;
    const len = (5 + hash(s * 5) * 12) * (SIZE / 512);
    const tone = (hash(s * 7) - 0.5) * 28;
    const nx = Math.cos(ang) * 0.4;
    const ny = -Math.sin(ang) * 0.4;
    const nR = Math.round((nx * 0.5 + 0.5) * 255);
    const nG = Math.round((ny * 0.5 + 0.5) * 255);
    const steps = Math.max(2, Math.floor(len));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.floor(x0 + Math.cos(ang) * len * t) & (SIZE - 1);
      const y = Math.floor(y0 + Math.sin(ang) * len * t) & (SIZE - 1);
      const i = (y * SIZE + x) * 4;
      albedo[i] = Math.max(0, Math.min(255, albedo[i] + tone));
      albedo[i + 1] = Math.max(0, Math.min(255, albedo[i + 1] + tone * 0.85));
      albedo[i + 2] = Math.max(0, Math.min(255, albedo[i + 2] + tone * 0.75));
      normal[i] = (normal[i] * 0.55 + nR * 0.45) | 0;
      normal[i + 1] = (normal[i + 1] * 0.55 + nG * 0.45) | 0;
      normal[i + 2] = 255;
      const rv = 175 + (1 - t) * 40;
      rough[i] = rough[i + 1] = rough[i + 2] = rv | 0;
    }
  }

  writePNG(path.join(OUT, `${name}_albedo.png`), albedo);
  writePNG(path.join(OUT, `${name}_normal.png`), normal);
  writePNG(path.join(OUT, `${name}_roughness.png`), rough, true);
  console.log("baked", name);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, cfg] of Object.entries(BREEDS)) {
  const pal = samplePalette(cfg.ref, cfg.crop, cfg.wb);
  const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
  console.log(
    `${name}: sampled ${pal.n} coat px from ${cfg.ref} →`,
    `tip ${hex(pal.tip)}  patch ${hex(pal.patch)}  base ${hex(pal.base)}  cream ${hex(pal.cream)}`
  );
  bakeBreed(name, pal, cfg.seed);
}
console.log("done →", OUT);
