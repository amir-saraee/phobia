#!/usr/bin/env node
/**
 * Bake PHOTO-PROJECTED coat maps from assets/refs/dog-*-reference.png.
 *
 * Previous baker only sampled a colour palette and painted procedural noise —
 * so the dogs stayed flat brown. This one:
 *   1. Isolates the dog from the studio grey / outdoor background
 *   2. Crops tightly to the animal's silhouette
 *   3. Writes a side-projection albedo (U = length, V = height) that the
 *      runtime maps onto the mesh with applySidePhotoUVs()
 *   4. Derives normal + roughness from the photo's luminance / grain
 *
 * Output: assets/models/textures/{breed}_photo_{albedo,normal,roughness}.png
 *         assets/models/textures/{breed}_photo_mask.png  (debug silhouette)
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const OUT = path.join(__dirname, "..", "assets", "models", "textures");
const REFS = path.join(__dirname, "..", "assets", "refs");
const SIZE = 1024;

const BREEDS = {
  // Studio sheet: dog fills most of frame, facing left on grey seamless.
  shiba: {
    ref: "dog-shiba-reference.png",
    // Soft padding around the animal so ears/tail aren't clipped.
    pad: 0.04,
  },
  husky: {
    ref: "dog-husky-reference.png",
    pad: 0.04,
  },
};

function writePNG(file, rgba, grey) {
  const colorType = grey ? 0 : 2;
  const png = new PNG({ width: SIZE, height: SIZE, colorType, inputColorType: 6, inputHasAlpha: true });
  Buffer.from(rgba).copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType }));
}

function loadPng(file) {
  return PNG.sync.read(fs.readFileSync(path.join(REFS, file)));
}

function colorDist(r, g, b, cr, cg, cb) {
  return Math.hypot(r - cr, g - cg, b - cb);
}

// Flood-fill from the image corners to find the seamless studio backdrop.
// Colour-threshold alone eats a husky's white legs (they're near-neutral and
// bright, just like the grey card). Connectivity from the border is the
// reliable signal: fur never touches all four corners.
function isolateDog(png) {
  const { width: W, height: H, data } = png;
  // TWO backdrop references, not one mean. These refs are not seamless: the
  // wall is warm tan and the floor it meets is cool grey, with a hard horizon
  // between them. Averaging the two lands on a colour that is neither, so the
  // flood fill stalled at the horizon and the whole floor survived as "dog" —
  // which is where the grey slabs on the rendered legs came from. Sample the
  // upper border and the lower border separately and score each pixel against
  // whichever backdrop it is actually closer to.
  const sampleRef = (pts) => {
    let r = 0, g = 0, b = 0;
    for (const [x, y] of pts) {
      const i = (y * W + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2];
    }
    const n = pts.length;
    return { r: r / n, g: g / n, b: b / n, lum: (0.299 * r + 0.587 * g + 0.114 * b) / n };
  };
  const upper = sampleRef([[2, 2], [W - 3, 2], [W >> 1, 2], [2, H >> 2], [W - 3, H >> 2]]);
  const lower = sampleRef([[2, H - 3], [W - 3, H - 3], [W >> 1, H - 3],
                           [2, H - (H >> 2)], [W - 3, H - (H >> 2)]]);
  // Distance to the NEARER backdrop, plus that backdrop's luminance — the
  // white-fur guard below has to compare against the wall the pixel sits on.
  const bgScore = (r, g, b) => {
    const du = colorDist(r, g, b, upper.r, upper.g, upper.b);
    const dl = colorDist(r, g, b, lower.r, lower.g, lower.b);
    return du <= dl ? { d: du, lum: upper.lum } : { d: dl, lum: lower.lum };
  };
  // Tight threshold. A husky's white legs sit only ~20–40 RGB from the studio
  // grey — anything looser than ~16 leaks the flood fill into the coat and
  // eats the limbs. Studio refs are flat enough that 14 still clears the wall.
  const thresh = 14;

  const backdrop = new Uint8Array(W * H); // 1 = backdrop
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const idx = y * W + x;
    if (backdrop[idx]) return;
    const i = idx * 4;
    if (data[i + 3] < 200) { backdrop[idx] = 1; stack.push(x, y); return; }
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const bg = bgScore(r, g, b);
    if (bg.d > thresh) return;
    // Never claim bright fur as backdrop, even when soft shadow brings it
    // near the grey card. White urajiro / husky legs live above the wall.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > bg.lum + 22) return;
    // Warm / cool coat patches near the wall stay with the dog.
    const neut = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
    if (neut > 14) return;
    backdrop[idx] = 1;
    stack.push(x, y);
  };
  // Seed from the entire border so gaps in the silhouette still fill.
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
  // Second pass: studio sheets sometimes have a second backdrop tone (tan
  // paper floor, soft vignette) that the corner flood never reaches. Any
  // remaining near-neutral mid-grey/tan that isn't brighter than the wall
  // gets claimed too — but bright white fur stays with the dog.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (backdrop[idx]) continue;
      const i = idx * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const bg = bgScore(r, g, b);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > bg.lum + 22) continue;
      const neut = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      if (neut > 16) continue;
      if (bg.d <= 22) backdrop[idx] = 1;
    }
  }

  const raw = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) raw[i] = backdrop[i] ? 0 : 1;

  // Keep only the dog. Whatever the two passes above miss — a strip of lit
  // floor, the seam shadow, a lens vignette in a corner — survives as its own
  // blob, and a blob of floor pasted onto the coat is exactly the artefact
  // this bake exists to avoid. The animal is always the largest region.
  const label = new Int32Array(W * H).fill(-1);
  const areas = [];
  const q = new Int32Array(W * H);
  for (let s = 0; s < W * H; s++) {
    if (!raw[s] || label[s] >= 0) continue;
    const id = areas.length;
    let head = 0, tail = 0, area = 0;
    q[tail++] = s; label[s] = id;
    while (head < tail) {
      const p = q[head++];
      area++;
      const px = p % W, py = (p / W) | 0;
      const nb = [px > 0 ? p - 1 : -1, px < W - 1 ? p + 1 : -1,
                  py > 0 ? p - W : -1, py < H - 1 ? p + W : -1];
      for (const n of nb) {
        if (n < 0 || !raw[n] || label[n] >= 0) continue;
        label[n] = id;
        q[tail++] = n;
      }
    }
    areas.push(area);
  }
  let best = -1;
  for (let i = 0; i < areas.length; i++) if (best < 0 || areas[i] > areas[best]) best = i;
  if (best < 0) throw new Error("no dog pixels found");

  const mask = new Uint8Array(W * H);
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (label[idx] !== best) continue;
      mask[idx] = 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) throw new Error("no dog pixels found");

  // The lit floor the dog stands on is the one piece of backdrop that survives
  // everything above: it is joined to the animal through the paws, so it is
  // part of the same region and cannot be dropped as a separate blob. Leaving
  // it in is expensive — it is the sole large grey area in the map, and the
  // coat-growing pass below spreads it over the haunches and tail.
  //
  // Cut it on the row-coverage profile, which has an unmistakable shape for a
  // standing animal: wide across the body, narrowing to a minimum through the
  // legs, then widening again the moment the ground appears. Everything from
  // that second widening down is floor. (Run-length was the obvious test and
  // the wrong one — the band's edge is dithered, so it is not one wide run but
  // hundreds of narrow ones.)
  const cnt = new Int32Array(H);
  for (let y = minY; y <= maxY; y++) {
    let c = 0;
    for (let x = minX; x <= maxX; x++) if (mask[y * W + x]) c++;
    cnt[y] = c;
  }
  let bodyMax = 0;
  for (let y = minY; y <= maxY; y++) if (cnt[y] > bodyMax) bodyMax = cnt[y];
  let floorTop = -1, m = Infinity, inLegs = false;
  for (let y = minY + Math.round((maxY - minY) * 0.5); y <= maxY; y++) {
    if (!inLegs) {
      if (cnt[y] < bodyMax * 0.40) inLegs = true;   // past the belly, into legs
      continue;
    }
    if (cnt[y] < m) { m = cnt[y]; continue; }
    // A rise well clear of the narrowest leg row, sustained rather than a
    // single noisy scanline, is the ground.
    if (cnt[y] > m * 1.6) {
      let ahead = 0, n = 0;
      for (let k = y; k <= Math.min(maxY, y + Math.round((maxY - minY) * 0.02)); k++) { ahead += cnt[k]; n++; }
      if (n && ahead / n > m * 1.4) { floorTop = y; break; }
    }
  }
  let cut = 0;
  if (floorTop > 0) {
    for (let y = floorTop; y <= maxY; y++) {
      for (let x = 0; x < W; x++) if (mask[y * W + x]) { mask[y * W + x] = 0; cut++; }
    }
  }
  // Shave the rim. A photographed edge is anti-aliased, so the outermost ring
  // of "dog" pixels is really a blend of fur and wall — backdrop-coloured, but
  // inside the mask. That ring is the closest source to every off-silhouette
  // texel, so the coat-growing pass below was faithfully painting the entire
  // background grey with it: the map came out as a dog on a grey field rather
  // than a dog on more dog. Four pixels of the coat are not missed; the wall
  // smeared over the haunches was.
  const ERODE = 4;
  for (let k = 0; k < ERODE; k++) {
    const prev = mask.slice();
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!prev[i]) continue;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1
            || !prev[i - 1] || !prev[i + 1] || !prev[i - W] || !prev[i + W]) mask[i] = 0;
      }
    }
  }

  // Re-measure: with the ground gone the crop now ends at the paws, which is
  // what the side projection assumes when it maps mesh height onto V.
  minX = W; minY = H; maxX = 0; maxY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX <= minX || maxY <= minY) throw new Error("no dog pixels found");
  const dropped = areas.reduce((a, b) => a + b, 0) - areas[best];
  console.log(`  isolate: ${areas.length} region(s), kept ${areas[best]} px, `
    + `dropped ${dropped} px as stray regions, ${cut} px as ground`);
  return { mask, minX, minY, maxX, maxY, W, H, data };
}

function sampleBilinear(data, W, H, fx, fy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const a = at(x0, y0), b = at(x1, y0), c = at(x0, y1), d = at(x1, y1);
  const mix = (p, q, t) => p + (q - p) * t;
  return [
    mix(mix(a[0], b[0], tx), mix(c[0], d[0], tx), ty),
    mix(mix(a[1], b[1], tx), mix(c[1], d[1], tx), ty),
    mix(mix(a[2], b[2], tx), mix(c[2], d[2], tx), ty),
    mix(mix(a[3], b[3], tx), mix(c[3], d[3], tx), ty),
  ];
}

function bakeBreed(name, cfg) {
  const png = loadPng(cfg.ref);
  const iso = isolateDog(png);
  const padX = (iso.maxX - iso.minX) * cfg.pad;
  const padY = (iso.maxY - iso.minY) * cfg.pad;
  const x0 = Math.max(0, iso.minX - padX);
  const y0 = Math.max(0, iso.minY - padY);
  const x1 = Math.min(iso.W - 1, iso.maxX + padX);
  const y1 = Math.min(iso.H - 1, iso.maxY + padY);
  const cropW = x1 - x0;
  const cropH = y1 - y0;

  // White-balance: lightest surviving fur ≈ grey card (partial for warm breeds).
  let maxLum = 0;
  let wbR = 0, wbG = 0, wbB = 0, wbN = 0;
  for (let y = Math.floor(y0); y < y1; y += 3) {
    for (let x = Math.floor(x0); x < x1; x += 3) {
      if (!iso.mask[y * iso.W + x]) continue;
      const i = (y * iso.W + x) * 4;
      const r = iso.data[i], g = iso.data[i + 1], b = iso.data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > maxLum * 0.92) {
        if (lum > maxLum) maxLum = lum;
        wbR += r; wbG += g; wbB += b; wbN++;
      }
    }
  }
  const mean = wbN ? (wbR + wbG + wbB) / (3 * wbN) : 200;
  const wb = name === "shiba" ? 0.35 : 0.85;
  const gain = wbN
    ? [1 + wb * (mean / Math.max(1, wbR / wbN) - 1),
       1 + wb * (mean / Math.max(1, wbG / wbN) - 1),
       1 + wb * (mean / Math.max(1, wbB / wbN) - 1)]
    : [1, 1, 1];

  const albedo = new Uint8ClampedArray(SIZE * SIZE * 4);
  const normal = new Uint8ClampedArray(SIZE * SIZE * 4);
  const rough = new Uint8ClampedArray(SIZE * SIZE * 4);
  const maskOut = new Uint8ClampedArray(SIZE * SIZE * 4);

  // Build a height field from luminance for normals.
  const height = new Float32Array(SIZE * SIZE);

  // Pass 1 — sample the photo where the texel lands on the animal, and record
  // which texels those were.
  const src = new Float32Array(SIZE * SIZE * 3);
  const on = new Uint8Array(SIZE * SIZE);
  for (let v = 0; v < SIZE; v++) {
    for (let u = 0; u < SIZE; u++) {
      // Photo maps: U left→right along body length, V top→bottom crown→paws
      // (PNG row 0 is top). Facing-left refs: keep as-is so nose is on the left.
      const sx = x0 + (u / (SIZE - 1)) * cropW;
      const sy = y0 + (v / (SIZE - 1)) * cropH;
      const ix = Math.round(sx), iy = Math.round(sy);
      if (!(ix >= 0 && iy >= 0 && ix < iso.W && iy < iso.H && iso.mask[iy * iso.W + ix])) continue;
      const p = v * SIZE + u;
      const s = sampleBilinear(iso.data, iso.W, iso.H, sx, sy);
      src[p * 3] = Math.max(0, Math.min(255, s[0] * gain[0]));
      src[p * 3 + 1] = Math.max(0, Math.min(255, s[1] * gain[1]));
      src[p * 3 + 2] = Math.max(0, Math.min(255, s[2] * gain[2]));
      on[p] = 1;
    }
  }

  // Pass 2 — grow the coat outward into every off-silhouette texel, taking the
  // colour of the NEAREST on-dog texel (two-sweep dead-reckoning, so it costs
  // two linear passes rather than a search per texel).
  //
  // This is what makes the misregistration forgiving. A side projection cannot
  // line a photographed dog up with a modelled one exactly — a hock or a tail
  // root will always sample a little outside the animal — and the old flat
  // average painted those spots one uniform tan, which read as a slab of
  // backdrop stuck to the leg. Nearest-fur means an overshoot at the belly
  // picks up belly white and an overshoot at the spine picks up spine ginger:
  // still wrong, but wrong in fur.
  const near = new Int32Array(SIZE * SIZE).fill(-1);
  const dist = new Float32Array(SIZE * SIZE).fill(Infinity);
  for (let p = 0; p < SIZE * SIZE; p++) if (on[p]) { near[p] = p; dist[p] = 0; }
  const relax = (p, q) => {
    if (near[q] < 0) return;
    const s = near[q];
    const dx = (p % SIZE) - (s % SIZE);
    const dy = ((p / SIZE) | 0) - ((s / SIZE) | 0);
    const d = Math.hypot(dx, dy);
    if (d < dist[p]) { dist[p] = d; near[p] = s; }
  };
  for (let v = 0; v < SIZE; v++) {
    for (let u = 0; u < SIZE; u++) {
      const p = v * SIZE + u;
      if (u > 0) relax(p, p - 1);
      if (v > 0) relax(p, p - SIZE);
      if (v > 0 && u > 0) relax(p, p - SIZE - 1);
      if (v > 0 && u < SIZE - 1) relax(p, p - SIZE + 1);
    }
  }
  for (let v = SIZE - 1; v >= 0; v--) {
    for (let u = SIZE - 1; u >= 0; u--) {
      const p = v * SIZE + u;
      if (u < SIZE - 1) relax(p, p + 1);
      if (v < SIZE - 1) relax(p, p + SIZE);
      if (v < SIZE - 1 && u < SIZE - 1) relax(p, p + SIZE + 1);
      if (v < SIZE - 1 && u > 0) relax(p, p + SIZE - 1);
    }
  }

  // Resolve the grown colour, then soften it. A nearest-source fill is a
  // Voronoi diagram, and its cell walls are hard edges — on the model they
  // showed up as bands ruled across the tail and hocks. Blurring only the
  // grown texels (reading the animal, never overwriting it) turns those walls
  // into gradients while the photographed silhouette stays sharp.
  const col = new Float32Array(SIZE * SIZE * 3);
  for (let p = 0; p < SIZE * SIZE; p++) {
    const s = on[p] ? p : (near[p] >= 0 ? near[p] : -1);
    if (s < 0) { col[p * 3] = 180; col[p * 3 + 1] = 140; col[p * 3 + 2] = 100; continue; }
    col[p * 3] = src[s * 3]; col[p * 3 + 1] = src[s * 3 + 1]; col[p * 3 + 2] = src[s * 3 + 2];
  }
  const BLUR_R = 6, BLUR_PASSES = 3;
  const tmp = new Float32Array(SIZE * SIZE * 3);
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    for (const horizontal of [true, false]) {
      tmp.set(col);
      for (let v = 0; v < SIZE; v++) {
        for (let u = 0; u < SIZE; u++) {
          const p = v * SIZE + u;
          if (on[p]) continue;                       // the photograph is final
          let r = 0, g = 0, b = 0, n = 0;
          for (let k = -BLUR_R; k <= BLUR_R; k++) {
            const uu = horizontal ? u + k : u;
            const vv = horizontal ? v : v + k;
            if (uu < 0 || vv < 0 || uu >= SIZE || vv >= SIZE) continue;
            const q = vv * SIZE + uu;
            r += tmp[q * 3]; g += tmp[q * 3 + 1]; b += tmp[q * 3 + 2]; n++;
          }
          if (!n) continue;
          col[p * 3] = r / n; col[p * 3 + 1] = g / n; col[p * 3 + 2] = b / n;
        }
      }
    }
  }

  // Pass 3 — grain, and write the maps.
  for (let v = 0; v < SIZE; v++) {
    for (let u = 0; u < SIZE; u++) {
      const p = v * SIZE + u;
      const o = p * 4;
      const r = col[p * 3], g = col[p * 3 + 1], b = col[p * 3 + 2];
      maskOut[o] = maskOut[o + 1] = maskOut[o + 2] = on[p] ? 255 : 0;
      maskOut[o + 3] = 255;

      // Micro grain so flat photo regions still catch light like fur. It runs
      // over the grown region too — a grainless patch reads as painted vinyl.
      const grain = (Math.sin(u * 12.9898 + v * 78.233) * 43758.5453) % 1;
      const gAmt = (grain - 0.5) * 10;
      albedo[o] = Math.max(0, Math.min(255, r + gAmt));
      albedo[o + 1] = Math.max(0, Math.min(255, g + gAmt * 0.9));
      albedo[o + 2] = Math.max(0, Math.min(255, b + gAmt * 0.8));
      albedo[o + 3] = 255;

      const lum = (0.299 * albedo[o] + 0.587 * albedo[o + 1] + 0.114 * albedo[o + 2]) / 255;
      height[p] = lum;

      // Fur is dielectric matte; slightly smoother on dark wet nose/eyes. Only
      // real photo texels may claim the wet-nose value — a grown texel that
      // happens to be dark is shadow, not a nose.
      const rv = on[p] && lum < 0.12 ? 90 : 200 + (1 - lum) * 30;
      rough[o] = rough[o + 1] = rough[o + 2] = rv | 0;
      rough[o + 3] = 255;
    }
  }

  // Sobel normals from height
  for (let v = 0; v < SIZE; v++) {
    for (let u = 0; u < SIZE; u++) {
      const o = (v * SIZE + u) * 4;
      const at = (uu, vv) => height[((vv + SIZE) % SIZE) * SIZE + ((uu + SIZE) % SIZE)];
      const dx =
        at(u + 1, v - 1) + 2 * at(u + 1, v) + at(u + 1, v + 1) -
        (at(u - 1, v - 1) + 2 * at(u - 1, v) + at(u - 1, v + 1));
      const dy =
        at(u - 1, v + 1) + 2 * at(u, v + 1) + at(u + 1, v + 1) -
        (at(u - 1, v - 1) + 2 * at(u, v - 1) + at(u + 1, v - 1));
      const strength = 2.4;
      let nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
    }
  }

  writePNG(path.join(OUT, `${name}_photo_albedo.png`), albedo);
  writePNG(path.join(OUT, `${name}_photo_normal.png`), normal);
  writePNG(path.join(OUT, `${name}_photo_roughness.png`), rough, true);
  writePNG(path.join(OUT, `${name}_photo_mask.png`), maskOut, true);
  console.log(
    `baked ${name}: crop ${Math.round(cropW)}×${Math.round(cropH)} from ${cfg.ref} → photo maps`
  );
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, cfg] of Object.entries(BREEDS)) {
  bakeBreed(name, cfg);
}
console.log("done →", OUT);
