#!/usr/bin/env node
/**
 * Bake compact facial PBR maps from the canonical protagonist face reference.
 *
 * Input:  assets/refs/protagonist-face-closeup.png
 * Output: assets/models/textures/character_face_{albedo,normal,roughness}.png
 *
 * The procedural head uses spherical UVs (U wraps the skull with the seam on
 * the back; V runs crown→chin). This bake places the photographed face on the
 * front hemisphere and synthesises matching skin detail for the sides/back so
 * the mesh never shows a hard photo cut-off.
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const OUT = path.join(__dirname, "..", "assets", "models", "textures");
const REFS = path.join(__dirname, "..", "assets", "refs");
const SIZE = 1024;
const REF = "protagonist-face-closeup.png";

// ---- landmark registration ------------------------------------------------
// A photo does not land on a sculpt by scaling it into the UV rectangle and
// hoping. The first cut here mapped V linearly (`0.18 + v * 0.64`) and put the
// photographed eyes 0.20 of the head's V-span ABOVE the sculpted sockets —
// about 5 cm up a 21 cm head, on the forehead — while the lips happened to
// land right. Register on measured landmarks instead.
//
// MESH_V: where each landmark sits in the skull's own UVs, measured off the
// built geometry (buildHeadShell writes v = 1 - j/NV, so V RISES toward the
// crown: chin 0.128, nose tip 0.398, eye 0.515, crown 1.0).
// PHOTO_V: the same landmarks in the reference, as a fraction of its height
// (0 = top), found by luminance profiling — see the detection notes below.
//
// Beware the axis flip between the two: this script writes PNG rows top-down,
// but THREE's TextureLoader sets flipY, so a mesh V samples PNG row (1 - V).
// The bake therefore works in `bakeV` and converts with meshV = 1 - bakeV.
const LANDMARKS = [
  // [mesh V, photo V]      detected on the realistic reference (grid-measured,
  // scripts/measure-ref.cjs): brow 0.375, eye 0.420, nostril 0.560,
  [0.561, 0.375],  // brow      lip seam 0.635, chin/neck edge 0.800
  [0.515, 0.420],  // pupil line
  [0.361, 0.560],  // nose base / nostrils
  [0.298, 0.635],  // lip seam
  [0.128, 0.800],  // chin
];
// Horizontal: the sculpted pupil sits at mesh U 0.571 (du = +0.071 from the
// facial midline at U 0.5); the photo's pupils are at u 0.410 / 0.600, so its
// midline is 0.505 and its half-separation 0.095.
const PHOTO_MID_U = 0.505;
const U_SCALE = 0.095 / 0.071;

// Piecewise-linear through LANDMARKS, extrapolating off each end with the
// nearest segment's slope so forehead and under-chin stay continuous.
function photoV(meshV) {
  const L = LANDMARKS;
  if (meshV >= L[0][0]) {
    const s = (L[1][1] - L[0][1]) / (L[1][0] - L[0][0]);
    return L[0][1] + (meshV - L[0][0]) * s;
  }
  for (let i = 1; i < L.length; i++) {
    if (meshV >= L[i][0]) {
      const t = (meshV - L[i][0]) / (L[i - 1][0] - L[i][0]);
      return L[i][1] + (L[i - 1][1] - L[i][1]) * t;
    }
  }
  const n = L.length - 1;
  const s = (L[n][1] - L[n - 1][1]) / (L[n][0] - L[n - 1][0]);
  return L[n][1] + (meshV - L[n][0]) * s;
}

function hash(i) {
  let x = (i * 374761393 + 668265263) | 0;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

// These maps are opaque, and roughness is greyscale, so storing RGBA for all
// of them was ~4 MB of pure encoding waste across the texture set — and every
// byte of it lands in the service worker's precache, which is all-or-nothing
// on install. Write colour maps as RGB and single-channel maps as 8-bit grey.
function writePNG(file, rgba, grey) {
  const colorType = grey ? 0 : 2;
  const png = new PNG({ width: SIZE, height: SIZE, colorType, inputColorType: 6, inputHasAlpha: true });
  Buffer.from(rgba).copy(png.data);
  fs.writeFileSync(file, PNG.sync.write(png, { colorType }));
}

function loadRef() {
  const file = path.join(REFS, REF);
  if (!fs.existsSync(file)) throw new Error(`missing ${file}`);
  return PNG.sync.read(fs.readFileSync(file));
}

function sample(png, u, v) {
  const x = Math.max(0, Math.min(png.width - 1, Math.floor(u * (png.width - 1))));
  const y = Math.max(0, Math.min(png.height - 1, Math.floor(v * (png.height - 1))));
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
}

function bilinear(png, u, v) {
  const fx = u * (png.width - 1);
  const fy = v * (png.height - 1);
  const x0 = Math.max(0, Math.min(png.width - 2, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(png.height - 2, Math.floor(fy)));
  const tx = fx - x0;
  const ty = fy - y0;
  const i00 = (y0 * png.width + x0) * 4;
  const i10 = (y0 * png.width + x0 + 1) * 4;
  const i01 = ((y0 + 1) * png.width + x0) * 4;
  const i11 = ((y0 + 1) * png.width + x0 + 1) * 4;
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const a = png.data[i00 + c] * (1 - tx) + png.data[i10 + c] * tx;
    const b = png.data[i01 + c] * (1 - tx) + png.data[i11 + c] * tx;
    out[c] = a * (1 - ty) + b * ty;
  }
  return out;
}

function sampleSkinPalette(png) {
  // Crop to the central face (eyes/cheeks/nose) — avoid hair and background.
  const crop = [0.33, 0.69, 0.30, 0.70];
  const x0 = Math.floor(png.width * crop[0]);
  const x1 = Math.floor(png.width * crop[1]);
  const y0 = Math.floor(png.height * crop[2]);
  const y1 = Math.floor(png.height * crop[3]);
  const px = [];
  for (let y = y0; y < y1; y += 3) {
    for (let x = x0; x < x1; x += 3) {
      const i = (y * png.width + x) * 4;
      if (png.data[i + 3] < 200) continue;
      const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
      // Reject near-black (pupils, lashes) and near-white specular.
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum < 40 || lum > 230) continue;
      // Reject cool grey background and saturated hair browns that are too dark.
      if (Math.abs(r - g) < 8 && Math.abs(g - b) < 8 && lum > 160) continue;
      px.push([r, g, b, lum]);
    }
  }
  if (px.length < 400) throw new Error(`face ref: only ${px.length} skin pixels survived`);
  px.sort((a, b) => a[3] - b[3]);
  const at = (q) => {
    const c = Math.floor(px.length * q);
    const lo = Math.max(0, c - Math.floor(px.length * 0.02));
    const hi = Math.min(px.length, c + Math.floor(px.length * 0.02) + 1);
    let r = 0, g = 0, b = 0;
    for (let i = lo; i < hi; i++) { r += px[i][0]; g += px[i][1]; b += px[i][2]; }
    const n = hi - lo;
    return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
  };
  const pal = { shadow: at(0.12), mid: at(0.45), light: at(0.78), blush: at(0.62) };
  // Soft white-balance toward the lightest skin so albedo is reflectance-ish.
  const w = pal.light;
  const mean = (w[0] + w[1] + w[2]) / 3;
  const gain = w.map((c) => 1 + 0.55 * (mean / Math.max(1, c) - 1));
  for (const k of Object.keys(pal)) {
    pal[k] = pal[k].map((v, i) => Math.max(0, Math.min(255, Math.round(v * gain[i]))));
  }
  return { ...pal, n: px.length };
}

function bake(png, pal) {
  const albedo = new Uint8ClampedArray(SIZE * SIZE * 4);
  const normal = new Uint8ClampedArray(SIZE * SIZE * 4);
  const rough = new Uint8ClampedArray(SIZE * SIZE * 4);
  const height = new Float32Array(SIZE * SIZE);
  const poreN = new Float32Array(SIZE * SIZE);

  // Face photo occupies the front UV band. After the head's π UV offset,
  // U≈0.5 is the facial midline. V is registered on landmarks, not stretched.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const u = x / SIZE;
      const bakeV = y / SIZE;
      const meshV = 1 - bakeV;          // flipY: PNG row y is sampled at mesh V
      // Distance from front midline in wrapped U.
      let du = u - 0.5;
      if (du > 0.5) du -= 1;
      if (du < -0.5) du += 1;
      const front = Math.max(0, 1 - Math.abs(du) / 0.28);
      // Cover brow-to-chin plus the forehead above it, fading out before the
      // ears. Centred on the face's real V band, not the middle of the map.
      const faceMask = Math.pow(front, 1.35) * Math.max(0, 1 - Math.abs(meshV - 0.40) / 0.42);

      // Sample the close-up into the front hemisphere.
      const refU = PHOTO_MID_U + du * U_SCALE;
      const refV = photoV(meshV);
      const v = bakeV;                  // shading terms below stay in bake space
      let r = pal.mid[0], g = pal.mid[1], b = pal.mid[2];
      if (faceMask > 0.02 && refU >= 0 && refU <= 1 && refV >= 0 && refV <= 1) {
        const s = bilinear(png, refU, refV);
        const t = Math.min(1, faceMask * 1.15);
        r = r + (s[0] - r) * t;
        g = g + (s[1] - g) * t;
        b = b + (s[2] - b) * t;
      } else {
        // Side / back: palette skin with subtle variation.
        const shade = 0.92 + 0.08 * Math.sin(u * Math.PI * 2) * Math.sin(v * Math.PI);
        r = pal.mid[0] * shade + pal.shadow[0] * (1 - shade) * 0.15;
        g = pal.mid[1] * shade + pal.shadow[1] * (1 - shade) * 0.15;
        b = pal.mid[2] * shade + pal.shadow[2] * (1 - shade) * 0.15;
      }

      // Cheek blush, on the apples — stated in mesh V like everything else, so
      // nobody has to hold the flip in their head to read it.
      const cheek =
        Math.exp(-Math.pow((Math.abs(du) - 0.09) / 0.07, 2)) *
        Math.exp(-Math.pow((meshV - 0.42) / 0.10, 2)) *
        faceMask;
      r = r + (pal.blush[0] - r) * cheek * 0.22;
      g = g + (pal.blush[1] - g) * cheek * 0.18;
      b = b + (pal.blush[2] - b) * cheek * 0.12;

      // Pore / freckle micro-variation from hash noise.
      const n1 = hash(x * 17 + y * 91);
      const n2 = hash(x * 53 + y * 19 + 7);
      const pore = (n1 - 0.5) * 10;
      const freckle = n2 > 0.92 ? -14 * faceMask : 0;
      r = Math.max(0, Math.min(255, r + pore + freckle));
      g = Math.max(0, Math.min(255, g + pore * 0.9 + freckle * 0.85));
      b = Math.max(0, Math.min(255, b + pore * 0.8 + freckle * 0.7));

      albedo[i] = r | 0;
      albedo[i + 1] = g | 0;
      albedo[i + 2] = b | 0;
      albedo[i + 3] = 255;

      // Pore noise for the normal bake — kept separately so the height field
      // can be rebuilt from the FINAL albedo after the passes below. Building
      // it here, from the raw sample, baked the photo's macro shading (the
      // hairline gradient, the cheek shadows) into the normal map too, so even
      // a fixed albedo kept re-shading the face with the same wrong forms.
      poreN[y * SIZE + x] = (n1 - 0.5) * 0.045 * (0.4 + faceMask);

      // Roughness: oilier T-zone (forehead + nose), matte cheeks. Centred on
      // the forehead/nose band in mesh V, spanning both.
      const tzone =
        Math.exp(-Math.pow(du / 0.06, 2)) *
        Math.exp(-Math.pow((meshV - 0.58) / 0.22, 2)) *
        faceMask;
      const rv = Math.round(210 - tzone * 55 - faceMask * 18 + (n2 - 0.5) * 12);
      rough[i] = rough[i + 1] = rough[i + 2] = Math.max(120, Math.min(245, rv));
      rough[i + 3] = 255;
    }
  }

  // ---- normalise the albedo to DETAIL ONLY --------------------------------
  // The material multiplies this map by the creator's skin colour, so whatever
  // base tone the map carries is applied TWICE. Baked straight from the photo
  // its face band averaged #c6a494, and against a #d4a07a body that rendered
  // the head ~13% darker than the arms in red and green but equal in blue —
  // a muddy grey head on a warm body, which is exactly how it looked.
  //
  // Divide each channel by its own mean over the face band and rescale to a
  // near-neutral target. Skin tone then comes entirely from the creator's
  // swatch (as it must, or the swatches cannot work), and the map keeps only
  // what it is actually for: lips, brows, sockets, pores, freckles.
  {
    const x0 = Math.floor(SIZE * 0.35), x1 = Math.floor(SIZE * 0.65);
    const y0 = Math.floor(SIZE * 0.40), y1 = Math.floor(SIZE * 0.85);
    let mr = 0, mg = 0, mb = 0, n = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * SIZE + x) * 4;
        mr += albedo[i]; mg += albedo[i + 1]; mb += albedo[i + 2]; n++;
      }
    }
    mr /= n; mg /= n; mb /= n;
    // 236, not 255: leaving a little headroom keeps the brightest skin off the
    // clipping point once the tint and the scene key are applied on top.
    const TARGET = 236;
    const kr = TARGET / Math.max(1, mr), kg = TARGET / Math.max(1, mg), kb = TARGET / Math.max(1, mb);
    for (let i = 0; i < SIZE * SIZE * 4; i += 4) {
      albedo[i]     = Math.max(0, Math.min(255, albedo[i] * kr));
      albedo[i + 1] = Math.max(0, Math.min(255, albedo[i + 1] * kg));
      albedo[i + 2] = Math.max(0, Math.min(255, albedo[i + 2] * kb));
    }
    console.log(`  albedo normalised: face band #${[mr, mg, mb].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")} → neutral ${TARGET}`);

    // The head carries REAL eyeballs — sclera, iris, pupil, lids that rotate.
    // Painting the photograph's eyes on top of them gives every character dark
    // sunken holes, because two sets of eyes are stacked and the map's version
    // cannot blink. Erase the map over each eye and let the geometry do it.
    // Centres are MEASURED off the baked pixels (dark-pixel centroid of each
    // eye region), not derived from the mesh registration: the derived values
    // (u 0.571/0.429, bakeV 0.485) sat ~0.022 inboard and ~0.030 above where
    // the photo's irises actually land, so the erase clipped the upper lids
    // and left both irises intact — and the runtime then stacked its real
    // eyeballs on top of the photo's, which is precisely the sunken double-eye
    // look this pass exists to remove.
    const EYES = [{ u: 0.593, v: 0.515 }, { u: 0.397, v: 0.513 }];
    const RU = 0.056, RV = 0.036;
    const wrapDU = (u, cu) => { let d = u - cu; if (d > 0.5) d -= 1; if (d < -0.5) d += 1; return d; };
    // Blend toward the skin immediately AROUND each eye, not toward the flat
    // neutral: filling with the global target leaves a pale disc that reads as
    // a bag under the eye — which is precisely what the first attempt did.
    const lids = EYES.map((e) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const d = Math.hypot(wrapDU(x / SIZE, e.u) / RU, (y / SIZE - e.v) / RV);
          if (d < 1.25 || d > 2.0) continue;            // annulus just outside
          const i = (y * SIZE + x) * 4;
          r += albedo[i]; g += albedo[i + 1]; b += albedo[i + 2]; n++;
        }
      }
      return n ? [r / n, g / n, b / n] : [TARGET, TARGET, TARGET];
    });
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const u = x / SIZE, v = y / SIZE;
        let m = 0, pick = 0;
        EYES.forEach((e, k) => {
          const d = Math.hypot(wrapDU(u, e.u) / RU, (v - e.v) / RV);
          if (d < 1) { const w = 1 - d * d * (3 - 2 * d); if (w > m) { m = w; pick = k; } }
        });
        if (m <= 0) continue;
        const i = (y * SIZE + x) * 4;
        for (let c = 0; c < 3; c++) {
          albedo[i + c] = albedo[i + c] + (lids[pick][c] - albedo[i + c]) * m;
        }
      }
    }

    // The head builds REAL eyebrows too — sculpted ribbon meshes riding the
    // brow ridge, tinted with the character's hair colour. The map's brows
    // stack underneath them a few millimetres off-register, and two brows per
    // eye read as one thick black scowl. Erase the map's pair exactly the way
    // the eyes are erased above, and let the geometry own the expression.
    const BROWS = [{ u: 0.588, v: 0.456 }, { u: 0.402, v: 0.456 }];
    const BRU = 0.066, BRV = 0.030;
    const browFill = BROWS.map((e) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
          const d = Math.hypot(wrapDU(x / SIZE, e.u) / BRU, (y / SIZE - e.v) / BRV);
          if (d < 1.25 || d > 2.0) continue;
          const i = (y * SIZE + x) * 4;
          r += albedo[i]; g += albedo[i + 1]; b += albedo[i + 2]; n++;
        }
      }
      return n ? [r / n, g / n, b / n] : [TARGET, TARGET, TARGET];
    });
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const u = x / SIZE, v = y / SIZE;
        let m = 0, pick = 0;
        BROWS.forEach((e, k) => {
          const d = Math.hypot(wrapDU(u, e.u) / BRU, (v - e.v) / BRV);
          if (d < 1) { const w = 1 - d * d * (3 - 2 * d); if (w > m) { m = w; pick = k; } }
        });
        if (m <= 0) continue;
        const i = (y * SIZE + x) * 4;
        for (let c = 0; c < 3; c++) {
          albedo[i + c] = albedo[i + c] + (browFill[pick][c] - albedo[i + c]) * m;
        }
      }
    }

    // Strip the photograph's LOW-FREQUENCY shading. Mean-normalising fixes
    // the average, not the layout: the photo's hairline still flooded the
    // whole upper forehead with hair-brown that faded out mid-face, and its
    // cheek and philtrum shadows landed as bruise streaks and a mustache
    // smudge on the sculpt (whose own forms sit elsewhere). A wide blur
    // estimates that macro field per channel; dividing it out keeps only what
    // a detail map is for — lips, nostrils, pores — while the sculpt and the
    // scene's light do the shading. KEEP retains a quarter of the macro form
    // so the face doesn't go poster-flat.
    {
      const R = Math.max(2, Math.round(SIZE * 0.055));
      const KEEP = 0.25;
      const blur = new Float32Array(SIZE * SIZE * 3);
      for (let i = 0; i < SIZE * SIZE; i++) {
        blur[i * 3] = albedo[i * 4];
        blur[i * 3 + 1] = albedo[i * 4 + 1];
        blur[i * 3 + 2] = albedo[i * 4 + 2];
      }
      const tmp = new Float32Array(SIZE * SIZE * 3);
      for (let pass = 0; pass < 3; pass++) {
        // horizontal (U wraps around the head)
        tmp.set(blur);
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            let r = 0, g = 0, b = 0;
            for (let k = -R; k <= R; k += Math.max(1, R >> 3)) {
              const xx = (x + k + SIZE * 4) % SIZE;
              const q = (y * SIZE + xx) * 3;
              r += tmp[q]; g += tmp[q + 1]; b += tmp[q + 2];
            }
            const n = Math.floor((2 * R) / Math.max(1, R >> 3)) + 1;
            const p = (y * SIZE + x) * 3;
            blur[p] = r / n; blur[p + 1] = g / n; blur[p + 2] = b / n;
          }
        }
        // vertical (V clamps at crown / neck)
        tmp.set(blur);
        for (let y = 0; y < SIZE; y++) {
          for (let x = 0; x < SIZE; x++) {
            let r = 0, g = 0, b = 0;
            for (let k = -R; k <= R; k += Math.max(1, R >> 3)) {
              const yy = Math.max(0, Math.min(SIZE - 1, y + k));
              const q = (yy * SIZE + x) * 3;
              r += tmp[q]; g += tmp[q + 1]; b += tmp[q + 2];
            }
            const n = Math.floor((2 * R) / Math.max(1, R >> 3)) + 1;
            const p = (y * SIZE + x) * 3;
            blur[p] = r / n; blur[p + 1] = g / n; blur[p + 2] = b / n;
          }
        }
      }
      for (let i = 0; i < SIZE * SIZE; i++) {
        for (let c = 0; c < 3; c++) {
          const macro = blur[i * 3 + c] - TARGET;
          albedo[i * 4 + c] = Math.max(0, Math.min(255,
            albedo[i * 4 + c] - macro * (1 - KEEP)));
        }
      }
    }

    // Above the brow line the map has nothing true to say: the mesh paints its
    // own hairline (hairlineMask → toHair) and hangs its own hair shells, so
    // any surviving photo tone up there lands on bare forehead or under hair
    // that expects skin. Fade the scalp band to neutral. meshV = 1 - bakeV,
    // so high mesh V is LOW y in the PNG.
    for (let y = 0; y < SIZE; y++) {
      const meshV = 1 - y / SIZE;
      const t = Math.max(0, Math.min(1, (meshV - 0.60) / 0.14));
      const fade = t * t * (3 - 2 * t) * 0.92;
      if (fade <= 0) continue;
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        for (let c = 0; c < 3; c++) {
          albedo[i + c] = albedo[i + c] + (TARGET - albedo[i + c]) * fade;
        }
      }
    }

    // Finally, ease the remaining contrast toward the neutral. Photographic
    // shading is authored for a photograph; on a 22 cm head lit by the scene's
    // own key it doubles up with the real shading and every crease reads as a
    // smudge. 0.62 keeps lips and pores legible without them becoming
    // holes — the sculpt already carries the forms underneath.
    const CONTRAST = 0.62;
    for (let i = 0; i < SIZE * SIZE * 4; i += 4) {
      for (let c = 0; c < 3; c++) {
        albedo[i + c] = Math.max(0, Math.min(255, TARGET + (albedo[i + c] - TARGET) * CONTRAST));
      }
    }

    // Rebuild the height field from the FINAL albedo so the normal map shades
    // pores and lip creases, not the macro field the passes above just removed.
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const i = (y * SIZE + x) * 4;
        const lum = (0.299 * albedo[i] + 0.587 * albedo[i + 1] + 0.114 * albedo[i + 2]) / 255;
        height[y * SIZE + x] = lum * 0.55 + poreN[y * SIZE + x];
      }
    }
  }

  // Sobel normal from height field.
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const xm = (x - 1 + SIZE) % SIZE;
      const xp = (x + 1) % SIZE;
      const ym = Math.max(0, y - 1);
      const yp = Math.min(SIZE - 1, y + 1);
      const dx =
        -height[y * SIZE + xm] + height[y * SIZE + xp] +
        -0.5 * height[ym * SIZE + xm] + 0.5 * height[ym * SIZE + xp] +
        -0.5 * height[yp * SIZE + xm] + 0.5 * height[yp * SIZE + xp];
      const dy =
        -height[ym * SIZE + x] + height[yp * SIZE + x] +
        -0.5 * height[ym * SIZE + xm] + 0.5 * height[yp * SIZE + xm] +
        -0.5 * height[ym * SIZE + xp] + 0.5 * height[yp * SIZE + xp];
      const nx = -dx * 3.2;
      const ny = -dy * 3.2;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      normal[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255);
      normal[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255);
      normal[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255);
      normal[i + 3] = 255;
    }
  }

  writePNG(path.join(OUT, "character_face_albedo.png"), albedo);
  writePNG(path.join(OUT, "character_face_normal.png"), normal);
  writePNG(path.join(OUT, "character_face_roughness.png"), rough, true);
}

fs.mkdirSync(OUT, { recursive: true });
const png = loadRef();
const pal = sampleSkinPalette(png);
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
console.log(
  `face: sampled ${pal.n} skin px from ${REF} →`,
  `shadow ${hex(pal.shadow)}  mid ${hex(pal.mid)}  light ${hex(pal.light)}  blush ${hex(pal.blush)}`
);
bake(png, pal);
console.log("done →", OUT);
