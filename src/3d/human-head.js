// The SDF-built head: face landmarks and FACS morphs, eyes and lids, hair
// locks and the strand texture.

import * as THREE from "three";
import { _hsat, _sstep, _falloff } from "./human-base.js";

// ---- sculpted head surface ---------------------------------------------
// Returns a function (theta, phi) -> THREE.Vector3 giving a point on a REAL
// head: an ellipsoid pushed and pulled by anatomical fields. Nothing here is
// a separate glued-on mesh — the brow ridge, eye sockets, nose, lips, jaw and
// chin are all one continuous surface, which is the whole reason the face
// finally reads as a face instead of a bowling ball with beads on it.
//
// Head-local space: origin at the middle of the skull, +Z is forward (the
// face), +Y up. Canonical head height ≈ 0.232 m (crown +0.116, chin −0.116).
// Vertical landmarks follow the classical head canon: pupils on the head's
// horizontal midline, nose base halfway from brow to chin, lip seam a third
// of the way down from nose base to chin.
const FACE = {
  eyeY:      0.0050,  // pupil line — a real head's eyes sit at its vertical middle
  eyeX:      0.0318,  // pupil separation / 2 (slightly closer for female soft face)
  eyeZ:      0.0688,  // eyeball CENTRE depth — the cornea apex lands ~8 mm behind the brow
  eyeR:      0.0131,  // eyeball radius — a touch over anatomical, for a readable eye at game distance
  browY:     0.0205,
  noseTipY: -0.0335,
  noseBaseY:-0.0445,
  mouthY:   -0.0635,  // the lip seam
  chinY:    -0.0975,
  earY:     -0.0080,
};

// The head is a signed-distance sculpt: a skull, a face mass, a jaw, a chin,
// cheekbones, a nose and lips as soft solids blended into ONE surface, with
// the eye sockets carved out of it. headPoint(theta, phi) casts a ray from the
// skull centre in that direction and returns where it leaves the solid, so
// every consumer that walks the head by angle (the shells, the brows, the
// mouth patch, the landmark probes) keeps working unchanged.
//
// This replaced an ellipsoid pushed around by ~40 gaussian fields. That
// approach could not hold a face together: every push was centred on a depth
// that the pushes before it had already moved, so each retune shifted the
// others, and the head settled into a flat mask with a wedge for a mouth.
// Solids compose — a nose is a nose wherever the cheek ends up.
function _sdEll(x, y, z, rx, ry, rz) {
  const a = x / rx, b = y / ry, c = z / rz;
  const k0 = Math.sqrt(a * a + b * b + c * c);
  const a1 = a / rx, b1 = b / ry, c1 = c / rz;
  const k1 = Math.sqrt(a1 * a1 + b1 * b1 + c1 * c1);
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : k0 * (k0 - 1) / k1;
}
// Round cone from A (radius ra) to B (radius rb) — a capsule whose radius
// varies linearly along it. Good enough for a nose bridge and a jaw line.
function _sdCone(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const px = x - ax, py = y - ay, pz = z - az;
  const ux = bx - ax, uy = by - ay, uz = bz - az;
  const h = _hsat((px * ux + py * uy + pz * uz) / (ux * ux + uy * uy + uz * uz));
  const dx = px - ux * h, dy = py - uy * h, dz = pz - uz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (ra + (rb - ra) * h);
}
function _smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}
function _smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

// Where the hairline sits, as the polar angle from the crown, for |theta|
// around the head (0 = face). Measured on the SDF sculpt: forehead line ~4.5
// cm above the brow, temples lower, sideburn in front of the ear, clear over
// the ear, down to the nape at the back.
const _HAIR_REACH = [
  [0.00, 0.80], [0.45, 0.84], [0.85, 1.00], [1.12, 1.30], [1.33, 1.44],
  [1.52, 1.30], [1.72, 1.40], [2.05, 1.88], [2.55, 2.10], [Math.PI, 2.14],
];
function _hairReach(a) {
  const T = _HAIR_REACH;
  if (a <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) {
    if (a <= T[i][0]) {
      const f = (a - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
      const k = f * f * (3 - 2 * f);
      return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * k;
    }
  }
  return T[T.length - 1][1];
}

// Fine strand texture shared by every hair surface: soft vertical streaks,
// tileable both ways, used as a light albedo modulation and a bump map. A
// flat-coloured shell is the "helmet"; streaks that run WITH the fall are
// most of what makes a surface read as hair.
let _hairStrandTex = null;
function getHairStrandTex(repU, repV) {
  if (!_hairStrandTex) {
    if (typeof document === "undefined") return null;
    const W = 256, H = 256;
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "rgb(218,218,218)";
    g.fillRect(0, 0, W, H);
    let seed = 1234567;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 1100; i++) {
      const x0 = rnd() * W, v = (150 + rnd() * 105) | 0;
      const amp = rnd() * 2.5, ph = rnd() * Math.PI * 2;
      g.strokeStyle = `rgba(${v},${v},${v},${(0.30 + rnd() * 0.55).toFixed(2)})`;
      g.lineWidth = 0.6 + rnd() * 1.8;
      for (const off of [-W, 0, W]) {
        g.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const xx = x0 + off + Math.sin((y / H) * Math.PI * 2 + ph) * amp;
          if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y);
        }
        g.stroke();
      }
    }
    _hairStrandTex = new THREE.CanvasTexture(c);
    _hairStrandTex.wrapS = _hairStrandTex.wrapT = THREE.RepeatWrapping;
    _hairStrandTex.anisotropy = 4;
  }
  const t = _hairStrandTex.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repU, repV);
  t.needsUpdate = true;
  return t;
}

// Rest angles of the animated lid caps (rotation.x). Positive closes the
// upper lid and opens the lower one.
const LID_UP0 = -0.29, LID_LO0 = 0.23;

// Ambient occlusion of a surface point from its distance field: step out
// along the normal and see how much of the step the solid takes back.
function _sdfAO(sdf, p) {
  const e = 2e-4;
  let nx = sdf(p.x + e, p.y, p.z) - sdf(p.x - e, p.y, p.z);
  let ny = sdf(p.x, p.y + e, p.z) - sdf(p.x, p.y - e, p.z);
  let nz = sdf(p.x, p.y, p.z + e) - sdf(p.x, p.y, p.z - e);
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl; ny /= nl; nz /= nl;
  let occ = 0, wsum = 0;
  const H = [0.0025, 0.005, 0.009, 0.015];
  for (let i = 0; i < H.length; i++) {
    const h = H[i], w = 1 / (i + 1);
    const d = sdf(p.x + nx * h, p.y + ny * h, p.z + nz * h);
    occ += Math.max(0, (h - d) / h) * w;
    wsum += w;
  }
  const ao = 1 - Math.min(1, occ / wsum) * 1.25;
  return 0.76 + 0.24 * Math.max(0, ao);
}

function makeHeadSurface(shape) {
  // shape: 0 = softer/rounder (woman/child), 1 = squarer/heavier (man)
  const sq = shape;
  const EX = FACE.eyeX, EY = FACE.eyeY, EZ = FACE.eyeZ;
  function sdf(x, y, z) {
    const ax = Math.abs(x);
    // --- the big masses -------------------------------------------------
    // Cranium, long front-to-back, and the rounded forehead rising out of it.
    let d = _sdEll(x, y - 0.0200, z + 0.0060, 0.0725 + 0.0015 * sq, 0.0880, 0.0900);
    d = _smin(d, _sdEll(x, y - 0.0450, z - 0.0300, 0.0580, 0.0450, 0.0560), 0.020);
    // Midface — the block the eyes, cheeks and upper jaw sit in.
    d = _smin(d, _sdEll(x, y + 0.0200, z - 0.0300, 0.0570 + 0.0040 * sq, 0.0450, 0.0580), 0.032);
    // Lower face: the maxilla's curve under the lips and the mandible body.
    d = _smin(d, _sdEll(x, y + 0.0585, z - 0.0200, 0.0375 + 0.0080 * sq, 0.0340, 0.0680), 0.034);
    // Mandible: chin → jaw angle → up the ramus toward the ear. A soft V for
    // the soft faces, a wider angle for the square ones.
    const gx = 0.0400 + 0.0100 * sq, gy = -0.0650 + 0.0020 * sq;
    d = _smin(d, _sdCone(ax, y, z, 0.0090, -0.0930, 0.0700, gx, gy, -0.0040, 0.0078, 0.0070 + 0.0025 * sq), 0.018);
    d = _smin(d, _sdCone(ax, y, z, gx, gy, -0.0040, 0.0460, -0.0300, -0.0140, 0.0070 + 0.0025 * sq, 0.0085), 0.016);
    // Chin: a small rounded mass, set well behind the nose tip.
    d = _smin(d, _sdEll(x, y + 0.0870, z - 0.0790, 0.0190 + 0.0050 * sq, 0.0140, 0.0160), 0.014);
    // Cheekbones, and the soft apples of the cheeks under the eyes.
    d = _smin(d, _sdEll(ax - 0.0490, y + 0.0060, z - 0.0500, 0.0130, 0.0100, 0.0180), 0.028);
    d = _smin(d, _sdEll(ax - 0.0330, y + 0.0190, z - 0.0740, 0.0190, 0.0150, 0.0120), 0.026);
    // Buccal fullness: a young face is convex from cheekbone to jaw. Without
    // it the side of the face caves in under the cheekbone (the gaunt look).
    d = _smin(d, _sdEll(ax - 0.0380, y + 0.0440, z - 0.0450, 0.0160 - 0.0020 * sq, 0.0230, 0.0300), 0.030);
    // Brow ridge — a soft shelf over the eye, heavier on square heads.
    d = _smin(d, _sdEll(ax - 0.0260, y - 0.0215, z - 0.0770, 0.0260, 0.0088 + 0.0015 * sq, 0.0105 + 0.0040 * sq), 0.016);

    // --- eyes -----------------------------------------------------------
    // An orbit recessed around each eye, a skin "lid ball" hugging the globe
    // (the eyelids ARE this surface), and an almond fissure cut through it so
    // the globe shows. The animated lid caps sit just inside the lid ball and
    // set the actual aperture, so blinking and fear still work unchanged.
    {
      const ex = ax - EX, ey = y - EY, ez = z - EZ;
      d = _smax(d, -_sdEll(ex, ey - 0.0010, ez - 0.0140, 0.0190, 0.0130, 0.0110), 0.008);
      const lidR = FACE.eyeR * 1.096;
      d = _smin(d, Math.sqrt(ex * ex + ey * ey + ez * ez) - lidR, 0.005);
      // Fissure, tilted a few degrees up at the outer corner.
      const ty = ey - 0.09 * ex;
      d = _smax(d, -_sdEll(ex + 0.0006, ty, ez - lidR, FACE.eyeR * 1.20, FACE.eyeR * 0.54, 0.0100), 0.0012);
    }

    // --- nose -----------------------------------------------------------
    {
      let n = _sdCone(x, y, z, 0, 0.0040, 0.0820, 0, -0.0225, 0.1025, 0.0060, 0.0062);
      n = _smin(n, _sdEll(x, y + 0.0295, z - 0.1050, 0.0078, 0.0074, 0.0080), 0.006);
      n = _smin(n, _sdEll(ax - 0.0100, y + 0.0352, z - 0.0930, 0.0058, 0.0050, 0.0058), 0.006);
      d = _smin(d, n, 0.010);
      // Nostrils: two shallow dents under the tip, so they catch their own shade.
      d = _smax(d, -_sdEll(ax - 0.0072, y + 0.0412, z - 0.0985, 0.0030, 0.0018, 0.0038), 0.003);
    }
    // --- mouth ----------------------------------------------------------
    {
      let lip = _sdEll(x, y + 0.0560, z - 0.0860, 0.0205, 0.0058, 0.0102);
      lip = _smin(lip, _sdEll(x, y + 0.0688, z - 0.0852, 0.0188, 0.0070, 0.0104), 0.004);
      d = _smin(d, lip, 0.006);
      // The seam — a crease, not a cavity.
      d = _smax(d, -_sdEll(x, y - FACE.mouthY, z - 0.0970, 0.0190, 0.0009, 0.0090), 0.0014);
      // Corners tuck in; the philtrum is a faint groove under the nose.
      d = _smax(d, -_sdEll(ax - 0.0198, y - FACE.mouthY, z - 0.0860, 0.0030, 0.0028, 0.0038), 0.003);
      d = _smax(d, -_sdEll(x, y + 0.0490, z - 0.0955, 0.0028, 0.0050, 0.0020), 0.003);
      // Mentolabial crease between the lower lip and the chin.
      d = _smax(d, -_sdEll(x, y + 0.0785, z - 0.0950, 0.0140, 0.0032, 0.0055), 0.004);
    }
    return d;
  }
  // Ray-cast from the skull centre. Sphere-trace inward from outside the head
  // (so the OUTERMOST surface wins where a ray grazes a feature), then bisect.
  const out = () => new THREE.Vector3();
  function headPoint(theta, phi) {
    const sp = Math.sin(phi);
    const dx = sp * Math.sin(theta), dy = Math.cos(phi), dz = sp * Math.cos(theta);
    let t = 0.18;
    for (let i = 0; i < 64; i++) {
      const d = sdf(dx * t, dy * t, dz * t);
      if (d < 4e-5) break;
      t -= Math.max(d * 0.8, 2e-5);
      if (t < 0.02) { t = 0.02; break; }
    }
    let lo = t - 0.004, hi = t + 0.004;
    for (let i = 0; i < 4 && sdf(dx * lo, dy * lo, dz * lo) > 0; i++) lo -= 0.004;
    for (let i = 0; i < 4 && sdf(dx * hi, dy * hi, dz * hi) < 0; i++) hi += 0.004;
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) * 0.5;
      if (sdf(dx * m, dy * m, dz * m) < 0) lo = m; else hi = m;
    }
    const r = (lo + hi) * 0.5;
    const v = out();
    v.set(dx * r, dy * r, dz * r);
    return v;
  }
  headPoint.sdf = sdf;
  return headPoint;
}

// ---- facial expression fields (FACS-lite morph targets) -----------------
// Everything above sculpts ONE face. Until now that face never moved: the only
// expression channels were rotating the brow ribbons, rotating the eyelids and
// popping a dark cap open at the lip line. Skin that never deforms is exactly
// what makes a character read as a mask, however good the neutral sculpt is.
//
// Each entry here is a displacement FIELD over head-local space — a pure
// function of a point on the neutral surface, returning where that point goes
// at full strength. Because it is a function of position and not of (theta,
// phi), the very same field can be applied to any mesh cut from this surface:
// the skull, the beard shell, the hair cap. That is what keeps a beard from
// tearing off the chin when the jaw drops.
//
// Named for the Action Units they stand in for, because that is the vocabulary
// the fear/relief/speech drivers are written in.
const FACE_MORPHS = [
  // AU26 jaw drop. A real jaw ROTATES about a condyle just in front of the ear,
  // so the chin swings down AND back; translating the lower face straight down
  // is the classic puppet-hinge tell.
  { name: "jawOpen", apply(x, y, z, o) {
      const w = _sstep(-0.030, -0.072, y) * _sstep(-0.150, -0.060, z);
      if (w <= 0) return;
      const PY = FACE.earY + 0.012, PZ = -0.030;          // condyle
      const a = 0.30 * w;                                  // radians at full open
      const dy = y - PY, dz = z - PZ;
      o.y += (dy * Math.cos(a) + dz * Math.sin(a)) - dy;
      o.z += (-dy * Math.sin(a) + dz * Math.cos(a)) - dz;
      // The lower lip rides the jaw only partly — it is slung between the
      // corners, so the middle trails and the aperture opens as a lens.
      o.y += 0.0045 * _falloff(x, y + 0.0720, z - 0.1080, 0.0210, 0.0130, 0.040);
    } },
  // AU12 + AU6, the real smile: corners up and OUT, cheek mass lifts, the fold
  // beside the nose deepens. Corners alone give the rictus of a jack-o-lantern.
  { name: "smile", apply(x, y, z, o) {
      const sgn = Math.sign(x || 1);
      const corner = _falloff(Math.abs(x) - 0.0250, y - FACE.mouthY, z - 0.0800, 0.0175, 0.0135, 0.045);
      o.y += 0.0125 * corner;
      o.x += sgn * 0.0090 * corner;
      o.z -= 0.0035 * corner;
      const cheek = _falloff(Math.abs(x) - 0.0430, y + 0.0210, z - 0.0780, 0.0230, 0.0190, 0.050);
      o.y += 0.0058 * cheek; o.z += 0.0042 * cheek;
      const fold = _falloff(Math.abs(x) - 0.0270, y + 0.0480, z - 0.0900, 0.0075, 0.0190, 0.038);
      o.z -= 0.0042 * fold;
      // Lips thin and stretch as they draw back over the teeth.
      const lips = _falloff(x, y + 0.0655, z - 0.1050, 0.0240, 0.0150, 0.040);
      o.z -= 0.0022 * lips;
    } },
  // AU20 + AU15, the fear/grimace mouth: corners pull back and DOWN, the lips
  // flatten and tighten. This is the shape that separates fear from surprise.
  { name: "mouthStretch", apply(x, y, z, o) {
      const sgn = Math.sign(x || 1);
      const corner = _falloff(Math.abs(x) - 0.0250, y - FACE.mouthY, z - 0.0800, 0.0195, 0.0150, 0.045);
      o.x += sgn * 0.0105 * corner;
      o.y -= 0.0060 * corner;
      o.z -= 0.0050 * corner;
      const lips = _falloff(x, y + 0.0655, z - 0.1050, 0.0250, 0.0165, 0.040);
      o.z -= 0.0048 * lips;
      const chin = _falloff(x, y + 0.0880, z - 0.1000, 0.0230, 0.0140, 0.038);
      o.z += 0.0030 * chin; o.y -= 0.0016 * chin;         // mentalis bunches
    } },
  // AU1 + AU2 brow raise — the forehead skin actually travels, which is what
  // puts horizontal folds above the brow. Rotating a brow ribbon cannot.
  { name: "browRaise", apply(x, y, z, o) {
      const w = _falloff(Math.abs(x) - 0.0250, y - 0.0330, z - 0.0800, 0.0330, 0.0260, 0.050);
      o.y += 0.0072 * w;
      o.z += 0.0022 * _falloff(Math.abs(x) - 0.0250, y - 0.0520, z - 0.0720, 0.0340, 0.0170, 0.045);
      const lid = _falloff(Math.abs(x) - FACE.eyeX, y - FACE.eyeY - 0.0130, z - 0.0760, 0.0250, 0.0110, 0.040);
      o.y += 0.0030 * lid;
    } },
  // AU4 brow knit: inner ends down and together, glabella bunches forward.
  // Without the bunch a knit is invisible on a smooth forehead.
  { name: "browFurrow", apply(x, y, z, o) {
      const sgn = Math.sign(x || 1);
      const inner = _falloff(Math.abs(x) - 0.0140, y - FACE.browY - 0.004, z - 0.0870, 0.0175, 0.0150, 0.042);
      o.y -= 0.0052 * inner;
      o.x -= sgn * 0.0058 * inner;
      o.z += 0.0032 * inner;
      const gl = _falloff(x, y - FACE.browY - 0.006, z - 0.0900, 0.0090, 0.0130, 0.038);
      o.z += 0.0030 * gl;
      const dip = _falloff(Math.abs(x) - 0.0210, y - 0.0400, z - 0.0830, 0.0250, 0.0160, 0.045);
      o.y -= 0.0022 * dip;
    } },
  // AU6 + AU7 squint: lower lid rides up, the cheek packs against it, and the
  // outer canthus creases. The eye narrows from BELOW, not by dropping the lid.
  { name: "squint", apply(x, y, z, o) {
      const low = _falloff(Math.abs(x) - FACE.eyeX, y - FACE.eyeY + 0.0135, z - 0.0730, 0.0270, 0.0110, 0.040);
      o.y += 0.0060 * low; o.z += 0.0026 * low;
      const crow = _falloff(Math.abs(x) - 0.0530, y - FACE.eyeY, z - 0.0620, 0.0130, 0.0180, 0.040);
      o.z -= 0.0026 * crow;
    } },
  // AU9/AU10, the sneer that rides on disgust and hard fear: the nose wing
  // lifts, the upper lip lifts with it, the fold beside the nostril deepens.
  { name: "sneer", apply(x, y, z, o) {
      const wing = _falloff(Math.abs(x) - 0.0170, y + 0.0400, z - 0.1000, 0.0110, 0.0130, 0.030);
      o.y += 0.0044 * wing;
      const upper = _falloff(x, y + 0.0580, z - 0.1010, 0.0180, 0.0110, 0.036);
      o.y += 0.0034 * upper; o.z -= 0.0016 * upper;
      const fold = _falloff(Math.abs(x) - 0.0240, y + 0.0500, z - 0.0930, 0.0070, 0.0150, 0.036);
      o.z -= 0.0038 * fold;
    } },
  // AU18, the lip pucker ("OO" viseme): the lips push FORWARD and the corners
  // draw inward toward a rounded aperture. Without it, speech can only ever
  // open and stretch — every rounded vowel reads as the same jaw flap.
  { name: "mouthPucker", apply(x, y, z, o) {
      const sgn = Math.sign(x || 1);
      // Both lips come forward and slightly together.
      const lips = _falloff(x, y + 0.0665, z - 0.1000, 0.0225, 0.0140, 0.034);
      o.z += 0.0105 * lips;
      o.x -= sgn * 0.0065 * lips * Math.min(1, Math.abs(x) / 0.020);
      // Corners pull toward the midline (the round aperture, not the wide one).
      const corner = _falloff(Math.abs(x) - 0.0250, y - FACE.mouthY, z - 0.0800, 0.0160, 0.0130, 0.042);
      o.x -= sgn * 0.0090 * corner;
      o.z += 0.0035 * corner;
      // Chin dimpling under the puckered lower lip.
      const chin = _falloff(x, y + 0.0840, z - 0.1000, 0.0190, 0.0110, 0.034);
      o.z += 0.0020 * chin;
    } },
  // Asymmetric AU12, LEFT side only: the half-smile of a private thought —
  // relief, amusement, the moment a fear first turns into "maybe I can".
  // A full symmetric smile on command reads as a mask; the lopsided one is
  // the expression that makes a face feel like somebody's home.
  { name: "smileL", apply(x, y, z, o) {
      const side = _sstep(0.002, 0.014, x);            // 0 on the right, 1 on the left
      if (side <= 0) return;
      const corner = _falloff(Math.abs(x) - 0.0250, y - FACE.mouthY, z - 0.0800, 0.0175, 0.0135, 0.045) * side;
      o.y += 0.0115 * corner;
      o.x += 0.0075 * corner;
      o.z -= 0.0030 * corner;
      const cheek = _falloff(Math.abs(x) - 0.0430, y + 0.0210, z - 0.0780, 0.0230, 0.0190, 0.050) * side;
      o.y += 0.0045 * cheek; o.z += 0.0035 * cheek;
      // Slight asymmetric squint partner: the left lower lid rides up a touch.
      const lid = _falloff(Math.abs(x) - FACE.eyeX, y - FACE.eyeY + 0.0135, z - 0.0730, 0.0260, 0.0105, 0.040) * side;
      o.y += 0.0030 * lid;
    } },
];

// Turn a neutral position array into one morph-delta array per field above.
// Deltas, not absolute targets — three.js morph attributes are relative, and
// keeping them relative is what lets several expressions stack.
const _fmO = { x: 0, y: 0, z: 0 };
function buildFaceMorphs(posArray) {
  const n = posArray.length;
  const out = [];
  for (const M of FACE_MORPHS) {
    const d = new Float32Array(n);
    for (let i = 0; i < n; i += 3) {
      const x = posArray[i], y = posArray[i + 1], z = posArray[i + 2];
      _fmO.x = 0; _fmO.y = 0; _fmO.z = 0;
      M.apply(x, y, z, _fmO);
      d[i] = _fmO.x; d[i + 1] = _fmO.y; d[i + 2] = _fmO.z;
    }
    out.push({ name: M.name, delta: d });
  }
  return out;
}

// A thin ribbon laid along the head's surface. `path(t)` returns [theta, phi];
// `half(t)` is the ribbon's half-width in radians of phi. Used for eyebrows —
// a mask-thresholded shell gives staircase edges, and a swept tube floats.
function surfaceRibbon(headPoint, path, half, lift, mat, segs = 26) {
  const pos = [], uv = [], idx = [];
  const A = new THREE.Vector3(), Bv = new THREE.Vector3(), C = new THREE.Vector3();
  const n = new THREE.Vector3(), du = new THREE.Vector3(), dv = new THREE.Vector3();
  const ACROSS = 4;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const [th, ph] = path(t);
    const h = half(t);
    for (let k = 0; k <= ACROSS; k++) {
      const w = (k / ACROSS - 0.5) * 2;                 // −1 … +1
      const phk = ph + w * h;
      A.copy(headPoint(th, phk));
      Bv.copy(headPoint(th + 0.012, phk));
      C.copy(headPoint(th, phk + 0.012));
      du.subVectors(Bv, A); dv.subVectors(C, A);
      n.crossVectors(dv, du).normalize();
      if (!isFinite(n.x)) n.copy(A).normalize();
      // Taper to nothing at both ends so the brow has a head and a tail.
      const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.35;
      const off = lift * (1 - w * w * 0.55) * taper;
      pos.push(A.x + n.x * off, A.y + n.y * off, A.z + n.z * off);
      uv.push(t, k / ACROSS);
    }
  }
  const row = ACROSS + 1;
  for (let i = 0; i < segs; i++) {
    for (let k = 0; k < ACROSS; k++) {
      const a = i * row + k, b = a + 1, c = (i + 1) * row + k + 1, d = (i + 1) * row + k;
      idx.push(a, c, b, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = false;
  return m;
}

// Build the sculpted skull mesh plus a matching mask-driven shell generator
// (used for hair and beards, so they conform exactly to this head).
// Sculpted head geometry depends only on SHAPE and STYLE, never on colour —
// but the character creator rebuilds the whole figure on every swatch click.
// Caching the vertex arrays turns a ~77 ms hitch into a copy; the colour
// attribute is still recomputed each time, which is the cheap half.
const _headGeoCache = new Map();
const _earSurfCache = new Map();   // head shape → where the ear meets the skull (buildHead)
function buildHeadShell(headPoint, mat, opts = {}) {
  const NU = opts.nu || 56, NV = opts.nv || 40;
  const off = opts.offset || 0;      // outward thickness (hair / beard shells)
  const mask = opts.mask || null;    // (theta, phi, p) -> 0..1 keep factor
  const tint = opts.tint || null;    // (p) -> [r,g,b] multiplier, for lips/sockets
  // `fade` writes a vec4 vertex colour whose ALPHA follows the mask, so a
  // masked shell dissolves into the skin instead of ending on a polygon edge.
  // A mask boundary always steps along grid lines; no resolution fixes that.
  const fade = !!opts.fade;
  // Expression morph targets are a pure function of the baked positions, so
  // they ride the geometry cache with everything else — the cost is paid once
  // per (shape, resolution), not per swatch click in the creator.
  const attachMorphs = (g, mesh, packed) => {
    if (!packed) return;
    g.morphAttributes.position = packed.pos.map((a) => new THREE.Float32BufferAttribute(a.slice(), 3));
    g.morphAttributes.normal = packed.nor.map((a) => new THREE.Float32BufferAttribute(a.slice(), 3));
    g.morphTargetsRelative = true;
    mesh.morphTargetInfluences = new Array(packed.pos.length).fill(0);
    mesh.morphTargetDictionary = packed.dict;
  };
  const cached = opts.cacheKey ? _headGeoCache.get(opts.cacheKey) : null;
  if (cached) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(cached.pos.slice(), 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(cached.nor.slice(), 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(cached.uv.slice(), 2));
    if (tint) {
      const c = new Float32Array(cached.tintPts.length);
      for (let i = 0; i < cached.tintPts.length; i += 3) {
        const t = tint(_hsP.set(cached.tintPts[i], cached.tintPts[i + 1], cached.tintPts[i + 2]));
        const ao = cached.ao ? cached.ao[i / 3] : 1;
        c[i] = t[0] * ao; c[i + 1] = t[1] * ao; c[i + 2] = t[2] * ao;
      }
      g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    } else if (cached.col) {
      g.setAttribute("color", new THREE.Float32BufferAttribute(cached.col.slice(), 4));
    }
    g.setIndex(new THREE.BufferAttribute(cached.idx.slice(), 1));
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    attachMorphs(g, m, cached.morphs);
    return m;
  }
  const pos = [], uv = [], col = [], idx = [], tintPts = [], aoArr = [];
  const grid = [];
  const P = new THREE.Vector3(), n = new THREE.Vector3();
  let count = 0;
  // Sample density follows the face. A uniform grid spends as many rows on
  // the crown (under hair) as on the lips, and a lip seam is ~2 mm: the warp
  // puts ~2x the columns across the front and ~1.7x the rows through the
  // brow-to-chin band, at the same vertex count.
  const warp = opts.warp !== false;
  const WK_T = 0.5, WK_P = 0.4, WC_P = 0.15;
  for (let j = 0; j <= NV; j++) {
    const sP = (j / NV) * Math.PI;
    const phi = warp ? sP + WK_P * 0.5 * (Math.sin(2 * (sP - WC_P)) + Math.sin(2 * WC_P)) : sP;
    const row = [];
    for (let i = 0; i <= NU; i++) {
      // Offset by π so the wrap seam sits on the back of the skull, never
      // down the middle of the face.
      const sT = (i / NU) * Math.PI * 2 - Math.PI;
      const theta = ((warp ? sT - WK_T * Math.sin(sT) : sT) + Math.PI * 2) % (Math.PI * 2);
      P.copy(headPoint(theta, Math.max(1e-3, Math.min(Math.PI - 1e-3, phi))));
      // Radial approximation is only used to push masked shells (hair, beard)
      // outward; the shading normals come from computeVertexNormals() below.
      // Sampling the sculpt three times per vertex for an analytic normal
      // tripled build cost for no visible gain on a grid this dense.
      n.copy(P).normalize();
      let keep = 1;
      if (mask) keep = mask(theta, phi, P, n);
      row.push({ p: P.clone(), n: n.clone(), keep });
      if (keep > 0 || !mask) {
        // Fading shells keep a floor under the offset: collapsing onto the
        // skull at the edge would z-fight with it.
        const o = off * (mask ? (fade ? 0.12 + 0.88 * keep : Math.min(1, keep * 1.6)) : 1)
          * (opts.thickMul ? opts.thickMul(theta, phi) : 1);
        if (fade) {
          const A = keep * keep * (3 - 2 * keep);
          const sh = opts.shade ? opts.shade(theta, phi) : 1;
          col.push(sh, sh, sh, A);
        }
        pos.push(P.x + n.x * o, P.y + n.y * o, P.z + n.z * o);
        uv.push(i / NU, 1 - j / NV);
        tintPts.push(P.x, P.y, P.z);
        if (tint) {
          const c = tint(P);
          const ao = opts.ao ? opts.ao(P) : 1;
          aoArr.push(ao);
          col.push(c[0] * ao, c[1] * ao, c[2] * ao);
        }
        row[row.length - 1].idx = count++;
      } else {
        row[row.length - 1].idx = -1;
      }
    }
    grid.push(row);
  }
  for (let j = 0; j < NV; j++) {
    for (let i = 0; i < NU; i++) {
      const a = grid[j][i], b = grid[j][i + 1], c = grid[j + 1][i + 1], d = grid[j + 1][i];
      if (a.idx < 0 || b.idx < 0 || c.idx < 0 || d.idx < 0) continue;
      if (mask && Math.min(a.keep, b.keep, c.keep, d.keep) <= 0) continue;
      // (a,c,b)/(a,d,c) — this winding puts the face normal OUTWARD for the
      // theta/phi parameterisation used here; the naive order renders inside-out.
      idx.push(a.idx, c.idx, b.idx, a.idx, d.idx, c.idx);
    }
  }
  if (idx.length === 0) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  if (tint) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  else if (fade) g.setAttribute("color", new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  // Morph normals are computed, not skipped. A jaw drop rotates the whole
  // lower face ~17°, and shading it with the neutral pose's normals is exactly
  // the "the mesh moved but the light didn't" artefact that reads as a puppet.
  let packedMorphs = null;
  if (opts.morphs) {
    const base = g.attributes.position.array;
    const baseNor = g.attributes.normal.array;
    const fields = buildFaceMorphs(base);
    const tmp = new THREE.BufferGeometry();
    tmp.setIndex(g.index);
    const posArrs = [], norArrs = [], dict = {};
    const moved = new Float32Array(base.length);
    for (let f = 0; f < fields.length; f++) {
      const d = fields[f].delta;
      for (let i = 0; i < base.length; i++) moved[i] = base[i] + d[i];
      tmp.setAttribute("position", new THREE.Float32BufferAttribute(moved.slice(), 3));
      tmp.computeVertexNormals();
      const nn = tmp.attributes.normal.array;
      const dn = new Float32Array(base.length);
      for (let i = 0; i < base.length; i++) dn[i] = nn[i] - baseNor[i];
      posArrs.push(d); norArrs.push(dn); dict[fields[f].name] = f;
    }
    tmp.dispose();
    packedMorphs = { pos: posArrs, nor: norArrs, dict };
    attachMorphs(g, m, packedMorphs);
  }
  if (opts.cacheKey) {
    _headGeoCache.set(opts.cacheKey, {
      pos: g.attributes.position.array, nor: g.attributes.normal.array,
      uv: g.attributes.uv.array, idx: g.index.array,
      tintPts: new Float32Array(tintPts),
      ao: (tint && opts.ao) ? new Float32Array(aoArr) : null,
      col: (!tint && fade && g.attributes.color) ? g.attributes.color.array : null,
      morphs: packedMorphs,
    });
  }
  return m;
}
const _hsP = new THREE.Vector3();

// ---- the head assembly (skull + eyes + brows + ears + hair + extras) -----
// Returns a Group whose local origin is the head JOINT (base of the skull),
// so it can be parented straight onto the head bone.
// Distance from the head JOINT up to the centre of the skull. Chosen so the
// pupils land on FACE.eyeY above the head bone, i.e. exactly at the camera's
// eye height — the first-person / third-person camera contract.
const HEAD_LIFT = 0.0555;

// Taper, flatten and curve a capsule along its length so it reads as a LOCK OF
// HAIR rather than a sausage. A capsule is a constant-radius tube, and constant
// radius is the whole tell — real hair narrows toward its tip, is flattened
// against the head rather than round, and falls in a curve instead of hanging
// as a straight rod. `t` runs 0 at the top to 1 at the tip.
function shapeHairLock(geom, opts = {}) {
  const tipR = opts.tipR != null ? opts.tipR : 0.35;
  const flat = opts.flat != null ? opts.flat : 1;
  const curve = opts.curve || 0;
  const widen = opts.widen || 0;          // >0 fans the lock out sideways
  const pos = geom.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(1e-6, maxY - minY);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (maxY - y) / span;
    const s = t * t * (3 - 2 * t);                 // smoothstep, so the taper eases
    const k = 1 + (tipR - 1) * s;
    pos.setXYZ(i, x * (k + widen * s), y, z * k * flat + curve * s);
  }
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  return geom;
}

function buildHead(o) {
  const grp = new THREE.Group();
  const shape = (o.bodyType === "man") ? 1.0 : (o.bodyType === "woman" ? 0.25 : 0.5);
  const headPoint = makeHeadSurface(shape);
  grp.userData.headPoint = headPoint;

  const skinCol = new THREE.Color(o.skinColor);
  const hairCol = new THREE.Color(o.hairColor);
  // Skin: a little translucency-ish warmth in the shadows via sheen instead of
  // a flat diffuse — the cheapest thing that stops skin reading as painted clay.
  const skinM = new THREE.MeshPhysicalMaterial({
    color: skinCol, roughness: 0.58, metalness: 0.0,
    sheen: 0.35, sheenRoughness: 0.85,
    sheenColor: skinCol.clone().lerp(new THREE.Color(0xff6a5a), 0.55),
    envMapIntensity: 0.45,
  });
  // Hair is fibrous, not metallic: a physical material with a light-coloured
  // sheen gives the strand highlight real hair has, so brown hair reads as
  // brown under night lighting instead of collapsing to a black helmet.
  // Sheen lifted every brunette to a dusty tan under the rooms' soft light —
  // the strand texture now carries the fibre read, so the sheen stays low.
  const hairM = new THREE.MeshPhysicalMaterial({
    color: hairCol, roughness: 0.52, metalness: 0.0,
    sheen: 0.28, sheenRoughness: 0.55,
    sheenColor: hairCol.clone().lerp(new THREE.Color(0xfff2e0), 0.28),
    envMapIntensity: 0.6,
  });
  const browM = new THREE.MeshStandardMaterial({
    // Brow hair is sparser than scalp hair — skin shows through it. Straight
    // hair colour ×0.8 rendered near-black on every brunette and the pair
    // read as one heavy scowl (doubled, until the bake stopped painting its
    // own brows underneath these). Lift toward skin instead of darkening.
    color: hairCol.clone().lerp(skinCol, 0.28), roughness: 0.95,
    side: THREE.DoubleSide,   // the ribbon winds the other way on the −X side
  });

  // --- skull ---------------------------------------------------------------
  const fhKind = o.facialHair || "none";
  const hairStyleKind = o.hairStyle || "short";
  // Hairline: front is high (forehead shows), temples dip, sides run to the ear
  // tops, the back drops to the nape. `phi` is polar from the crown.
  function hairlineMask(theta, phi) {
    // Polar angle (from the crown) at which the hair stops, by direction
    // around the head: a rounded forehead line, lower down the temples, a
    // sideburn in front of the ear, clear of the ear itself, then down behind
    // it to the nape. `theta` 0 is the face; the table is by |theta|.
    const a = theta > Math.PI ? Math.PI * 2 - theta : theta;
    const reach = _hairReach(a);
    return _sstep(reach + 0.10, reach - 0.14, phi);
  }
  // Beard region: a cheek line running from the sideburn down to the corner of
  // the mouth, with the lips kept clear.
  function beardMask(p) {
    const ax = Math.abs(p.x);
    const cheekLine = -0.080 + _hsat(ax / 0.070) * 0.046;
    let v = _sstep(cheekLine + 0.012, cheekLine - 0.014, p.y);
    if (v <= 0) return 0;
    v *= 1 - _falloff(p.x, p.y - FACE.mouthY, p.z - 0.086, 0.029, 0.015, 0.030);
    v *= _sstep(-0.030, 0.005, p.z);
    return v;
  }

  // Resolution matters more here than anywhere else in the app: a lip seam is
  // ~5 mm on a 22 cm head, so a coarse grid literally cannot represent the
  // mouth — the old head looked blank because its cells were bigger than its
  // features. Tinting does the other half of the work: skin is not one flat
  // colour, and lips/sockets/brows carry most of a face's readability.
  const dense = o.lowDetail ? { nu: 72, nv: 54 } : { nu: 112, nv: 86 };
  // Skin: slightly oilier T-zone (forehead/nose via roughness map) + cheek
  // sheen warmth so the face stops reading as matte clay. Vertex colours still
  // drive lip / socket / blush tinting on top of the baked albedo.
  const faceM = new THREE.MeshPhysicalMaterial({
    color: skinCol, roughness: 0.56, metalness: 0.0,
    sheen: 0.28, sheenRoughness: 0.80,
    sheenColor: skinCol.clone().lerp(new THREE.Color(0xff6a5a), 0.58),
    envMapIntensity: 0.52, vertexColors: true,
  });
  // The photo bake is NOT applied: it was registered to the old gaussian
  // sculpt, and on any other surface its painted nostrils, lip line and
  // sockets land beside the real ones. The face is shaded by its own
  // geometry plus the tint fields below.
  // Lips are a little redder and darker than the skin around them — not a
  // different material. At 0.545/0.515 they went brown enough that, with the
  // seam shading on top, a closed mouth read as an open one.
  const lipTone = [0.96, 0.640, 0.660];
  // Bust the geometry cache when the sculpt/tint changes so creator previews
  // pick up the new face immediately (old keys would serve stale morphs).
  const skull = buildHeadShell(headPoint, faceM, {
    nu: dense.nu, nv: dense.nv, morphs: true, cacheKey: "skull|v5|" + shape + "|" + dense.nu,
    // Cavity shading baked from the sculpt's own distance field: sockets, the
    // nostrils, the lip seam, the corners of the mouth and the folds read as
    // form even under flat, frontal light (which is most of this game).
    ao: headPoint.sdf ? (p) => _sdfAO(headPoint.sdf, p) : null,
    tint: (p) => {
      let r = 1, g = 1, b = 1;
      const ax = Math.abs(p.x);
      // Every field below is centred on where the SDF sculpt actually puts
      // that landmark (makeHeadSurface) — a tint centred a centimetre behind
      // its feature fires at a fraction of its strength and on the wrong side
      // of the curve, which is how a mouth turns into a brown smear.
      // Lips — upper vermilion a touch darker than the lower (it faces down).
      const lipU = _falloff(p.x, p.y + 0.0560, p.z - 0.0960, 0.0192, 0.0060, 0.030);
      const lipL = _falloff(p.x, p.y + 0.0688, p.z - 0.0955, 0.0175, 0.0072, 0.030);
      const lip = Math.min(1, lipU * 1.05 + lipL);
      r *= 1 + (lipTone[0] - 1) * lip; g *= 1 + (lipTone[1] - 1) * lip; b *= 1 + (lipTone[2] - 1) * lip;
      // Lip seam — darker than skin, never a void; the crease carries the rest.
      const seam = _falloff(p.x, p.y - FACE.mouthY, p.z - 0.0895, 0.0195, 0.0020, 0.040);
      const sk = 1 - 0.30 * seam; r *= sk; g *= sk * 0.95; b *= sk * 0.96;
      // Upper-lid crease and a faint warm shadow in the inner corner.
      const crease = _falloff(ax - FACE.eyeX, p.y - FACE.eyeY - 0.0118, p.z - 0.0800, 0.0150, 0.0035, 0.030);
      const ck = 1 - 0.16 * crease; r *= ck; g *= ck * 0.97; b *= ck * 0.97;
      const inner = _falloff(ax - FACE.eyeX + 0.0135, p.y - FACE.eyeY, p.z - 0.0790, 0.0040, 0.0050, 0.030);
      r *= 1 - 0.05 * inner; g *= 1 - 0.10 * inner; b *= 1 - 0.09 * inner;
      // Nostrils — two small shadowed openings.
      const nos = _falloff(ax - 0.0072, p.y + 0.0412, p.z - 0.0950, 0.0036, 0.0023, 0.014);
      const nk = 1 - 0.72 * nos; r *= nk; g *= nk; b *= nk;
      // Cheek warmth, nose-tip warmth, a slightly cooler forehead and jaw —
      // skin that is not one flat paint.
      const cheek = _falloff(ax - 0.0360, p.y + 0.0240, p.z - 0.0830, 0.0180, 0.0140, 0.040);
      r *= 1 + 0.05 * cheek; g *= 1 - 0.055 * cheek; b *= 1 - 0.060 * cheek;
      const tip = _falloff(p.x, p.y + 0.0295, p.z - 0.1110, 0.0080, 0.0070, 0.020);
      r *= 1 + 0.035 * tip; g *= 1 - 0.015 * tip; b *= 1 - 0.02 * tip;
      const forehead = _falloff(p.x, p.y - 0.055, p.z - 0.080, 0.045, 0.030, 0.050) * _hsat(p.z * 8);
      r *= 1 - 0.015 * forehead; g *= 1 - 0.005 * forehead; b *= 1 + 0.012 * forehead;
      const jaw = _sstep(-0.050, -0.090, p.y) * Math.max(0, p.z) * 12;
      const jk = 1 - 0.035 * Math.min(1, jaw); r *= jk; g *= jk * 0.995; b *= 1 - 0.015 * Math.min(1, jaw);
      // Nasolabial fold and the shadow under the lower lip — faint.
      const nlf = _falloff(ax - 0.0225, p.y + 0.0500, p.z - 0.0920, 0.0060, 0.0140, 0.030);
      const nk2 = 1 - 0.06 * nlf; r *= nk2; g *= nk2 * 0.98; b *= nk2 * 0.98;
      const sulcus = _falloff(p.x, p.y + 0.0785, p.z - 0.0925, 0.0140, 0.0040, 0.030);
      const sk2 = 1 - 0.08 * sulcus; r *= sk2; g *= sk2 * 0.98; b *= sk2 * 0.975;
      // Shade the scalp under the hair and the jaw under a beard toward the
      // hair colour, so the shells' polygon edges land on matching skin.
      const toHair = (amt) => {
        if (amt <= 0) return;
        const hr = hairCol.r / Math.max(0.02, skinCol.r);
        const hg = hairCol.g / Math.max(0.02, skinCol.g);
        const hb = hairCol.b / Math.max(0.02, skinCol.b);
        r += (hr - r) * amt; g += (hg - g) * amt; b += (hb - b) * amt;
      };
      if (hairStyleKind !== "bald") {
        const dir = Math.atan2(p.x, p.z);
        const th2 = dir < 0 ? dir + Math.PI * 2 : dir;
        const ph2 = Math.acos(Math.max(-1, Math.min(1, p.y / Math.max(1e-4, p.length()))));
        toHair(hairlineMask(th2, ph2) * (hairStyleKind === "buzz" ? 0.75 : 0.95));
      }
      if (fhKind === "beard") toHair(beardMask(p) * 0.92);
      else if (fhKind === "stubble") toHair(beardMask(p) * 0.45);
      return [r, g, b];
    },
  });
  skull.position.y = HEAD_LIFT;
  grp.add(skull);
  // Every mesh that carries the expression morphs. Driving them through one
  // list keeps the beard in lockstep with the skin it grows out of.
  const expressionMeshes = [skull];
  const face = new THREE.Group();
  face.position.copy(skull.position);
  grp.add(face);                                      // everything else shares the skull's frame

  // --- eyes ----------------------------------------------------------------
  // A real eyeball in a real socket, with lids that ROTATE shut. (Squashing a
  // lid's scale.y was the old blink and it looked like a shutter.)
  // Wet cornea + clearer limbal read (face-closeup ref): lower roughness,
  // stronger clearcoat, a touch more iris emissive so eyes catch room light.
  const scleraM = new THREE.MeshPhysicalMaterial({
    color: 0xf2ebe3, roughness: 0.10, clearcoat: 1.0, clearcoatRoughness: 0.035,
    envMapIntensity: 0.7,
  });
  const irisM = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(o.eyeColor), roughness: 0.11, metalness: 0.12,
    clearcoat: 1.0, clearcoatRoughness: 0.03,
    // Stronger emissive: at night-scene light levels an unlit iris collapses
    // to a black bead, which is how every eye read before the realistic
    // reference pass. 0.32 keeps the creator's colour visible without glowing.
    emissive: new THREE.Color(o.eyeColor).multiplyScalar(0.32),
    envMapIntensity: 0.65,
  });
  const pupilM = new THREE.MeshBasicMaterial({ color: 0x050408 });
  const lashM  = new THREE.MeshStandardMaterial({
    color: hairCol.clone().multiplyScalar(0.22), roughness: 1.0,
  });
  // Where does the skin actually sit at the pupil? Sample the sculpted surface
  // rather than trusting a constant — this is what keeps the cornea proud of
  // the socket floor no matter how the face is retuned.
  // The sculpt carves each orbit and grows a skin "lid ball" around a globe
  // centred on FACE.eyeZ (see makeHeadSurface), so the globe goes exactly
  // there. eyeSurfZ is the lid skin's front, which the glasses stand off.
  const eyeCz = FACE.eyeZ;
  const eyeSurfZ = FACE.eyeZ + FACE.eyeR * 1.096;
  const eyes = [];
  for (const sx of [-1, 1]) {
    const socket = new THREE.Group();
    socket.position.set(sx * FACE.eyeX, FACE.eyeY, eyeCz);
    face.add(socket);
    // Eyeball — the globe; only the front cap is ever visible.
    const globe = new THREE.Group();
    socket.add(globe);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(FACE.eyeR, 24, 18), scleraM);
    globe.add(sclera);
    // Iris / pupil / catchlight are spherical CAPS on the globe's front — a flat
    // disc at any depth is either swallowed by the sphere or floats off it.
    const cap = (rad, ang) => {
      const g = new THREE.SphereGeometry(rad, 24, 14, 0, Math.PI * 2, 0, ang);
      g.rotateX(Math.PI / 2);          // face +Z
      return g;
    };
    // Limbal ring: the dark band where iris meets sclera. It is the single
    // cheapest thing that stops an eye reading as a painted bead — real irises
    // are never a flat disc of colour with a hard edge.
    //
    // Cap angles are anatomical, not cosmetic: a real iris is ~11.5 mm on a
    // ~24 mm globe, so the iris spans ~0.30 rad of the front cap, the limbal
    // ring a hair past it, the pupil ~0.13. The old 0.50/0.545 covered the
    // whole visible globe in dark iris — the "dead black bead" eye — and
    // doubled up with the photographic iris the baked albedo already paints.
    const limbal = new THREE.Mesh(
      cap(FACE.eyeR * 1.0005, 0.372),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.eyeColor).multiplyScalar(0.28), roughness: 0.3,
      })
    );
    globe.add(limbal);
    const iris = new THREE.Mesh(cap(FACE.eyeR * 1.002, 0.345), irisM);
    globe.add(iris);
    const pupil = new THREE.Mesh(cap(FACE.eyeR * 1.010, 0.140), pupilM);
    globe.add(pupil);
    const glint = new THREE.Mesh(
      cap(FACE.eyeR * 1.020, 0.075),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 })
    );
    glint.rotation.set(-0.42, 0.38, 0);
    globe.add(glint);

    // Lids — spherical caps slightly larger than the globe, hinged at its centre.
    const lidGeo = (from, to) => new THREE.SphereGeometry(
      FACE.eyeR * 1.06, 20, 10, 0, Math.PI * 2, from, to - from
    );
    const upper = new THREE.Mesh(lidGeo(0, Math.PI * 0.47), skinM);
    // A relaxed eye is NOT wide open: the upper lid rests over the top ~1 mm
    // of the iris. Fully exposed irises are a startled stare; much lower and
    // the character looks drowsy (−0.055 had it half-asleep).
    upper.rotation.x = LID_UP0;
    socket.add(upper);
    const lower = new THREE.Mesh(lidGeo(Math.PI * 0.55, Math.PI), skinM);
    lower.rotation.x = LID_LO0;                      // open: sits just under the iris
    socket.add(lower);
    // Lash line — a dark rim at the upper lid margin. Tiny mesh, huge payoff:
    // it's what stops the eye reading as a bead pressed into dough.
    const lash = new THREE.Mesh(
      new THREE.TorusGeometry(FACE.eyeR * 1.0, FACE.eyeR * 0.095, 6, 20, Math.PI),
      lashM
    );
    lash.rotation.x = Math.PI / 2;              // lies IN the lid-margin plane
    lash.position.y = FACE.eyeR * 0.19;         // the margin circle's height on the globe
    upper.add(lash);
    // A fixed per-side lid offset and blink gain. Perfect bilateral symmetry is
    // a subtle doll cue at close range; real lids never sit or close identically.
    eyes.push({
      group: socket, globe, upper, lower, iris, pupil, side: sx,
      lidJit: sx * 0.008, blinkGain: 1 + sx * 0.035,
    });
  }

  // --- eyebrows ------------------------------------------------------------
  // Cut from the SAME sculpted surface as the skull and offset a hair's width
  // outward, so a brow can never float off the brow ridge or poke through the
  // temple — which is exactly what a swept tube did.
  const brows = [];
  for (const sx of [-1, 1]) {
    const brow = surfaceRibbon(
      headPoint,
      // Head-on it runs from just inside the eye to past its outer corner,
      // arching over the middle and dipping at the tail.
      (t) => [sx * (0.150 + t * 0.560), Math.PI * 0.5 - (0.235 + Math.sin(Math.pow(t, 0.8) * Math.PI) * 0.048 - t * 0.034)],
      // Tapered, not a slab. A ribbon of constant half-width ends in two blunt
      // square tips, which is exactly what made the brows read as stickers
      // pressed onto the forehead. Real brows are thickest at the head, thin
      // to nothing at the tail.
      (t) => 0.008 + Math.pow(Math.sin(Math.pow(t, 0.72) * Math.PI), 0.55) * 0.016 * (1 - 0.40 * t),
      0.0026, browM, 30
    );
    brow.position.copy(skull.position);
    brow.userData.baseY = brow.position.y;
    brow.userData.baseX = brow.position.x;
    brow.userData.side = sx;
    grp.add(brow);
    brows.push(brow);
  }

  // --- mouth opening -------------------------------------------------------
  // The lips are paint, so the character used to deliver a whole speech with a
  // sealed face. An opening has to be real geometry — and a flat disc laid on
  // THIS face floats ~2 cm proud at the corners (the lip line runs from z 0.099
  // at the centre to z 0.075 at the corners), so the patch is cut from the SAME
  // sculpted surface as the skull, exactly like the brows. Vertices are authored
  // relative to the lip seam, so scale.y = 0 collapses the patch onto the
  // painted seam and the mouth is genuinely shut.
  const MOUTH_HALF_H = 0.0125;
  const mouthCap = (() => {
    // phi runs down the skull and theta across it, both monotonic through the
    // lip region, so two bisections give the patch's extent on any head shape.
    const solveY = (th, ty) => {
      let lo = 0.9, hi = 2.3;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) * 0.5;
        if (headPoint(th, m).y > ty) lo = m; else hi = m;
      }
      return (lo + hi) * 0.5;
    };
    const solveX = (ph, tx) => {
      let lo = 0, hi = 1.2;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) * 0.5;
        if (headPoint(m, ph).x < tx) lo = m; else hi = m;
      }
      return (lo + hi) * 0.5;
    };
    const ph0 = solveY(0, FACE.mouthY);
    const dph = solveY(0, FACE.mouthY - MOUTH_HALF_H) - ph0;
    const dth = solveX(ph0, 0.0225);
    const NA = 18, NR = 3, LIFT = 0.0009;   // 0.9 mm proud — never z-fights the seam
    const pos = [], idx = [];
    const c0 = headPoint(0, ph0);
    pos.push(0, c0.y - FACE.mouthY, c0.z + LIFT);
    for (let r = 1; r <= NR; r++) {
      const rr = r / NR;
      for (let i = 0; i < NA; i++) {
        const a = (i / NA) * Math.PI * 2;
        const q = headPoint(dth * rr * Math.cos(a), ph0 + dph * rr * Math.sin(a));
        pos.push(q.x, q.y - FACE.mouthY, q.z + LIFT);
      }
    }
    for (let i = 0; i < NA; i++) idx.push(0, 1 + ((i + 1) % NA), 1 + i);
    for (let r = 0; r < NR - 1; r++) {
      const a0 = 1 + r * NA, b0 = a0 + NA;
      for (let i = 0; i < NA; i++) {
        const j = (i + 1) % NA;
        idx.push(a0 + i, a0 + j, b0 + j, a0 + i, b0 + j, b0 + i);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      color: 0x2a0d10, roughness: 0.92, metalness: 0, side: THREE.DoubleSide,
    }));
    m.position.set(0, FACE.mouthY, 0);
    m.scale.y = 0.001;
    m.visible = false;
    face.add(m);
    return m;
  })();

  // --- ears ----------------------------------------------------------------
  // Where is the side of the head, actually? Parked at a hard-coded x = 0.068
  // the whole ear sat INSIDE the skull — the temple flattening and the jaw
  // taper put the surface further out than the constant assumed, so the
  // character simply had no visible ears from any angle. Measure it, the same
  // way the eye socket depth is measured.
  // (A pure function of the head shape — 4,225 ray-marches, ~100k SDF calls —
  // so it's measured once per shape, not on every trial's rebuild.)
  const earSurf = _earSurfCache.get(shape) || (() => {
    let bx = 0.072, bz = -0.012, bd = Infinity;
    for (let i = 0; i <= 64; i++) {
      const th = Math.PI * 0.5 + (i / 64 - 0.5) * 0.9;
      for (let j = 0; j <= 64; j++) {
        const ph = Math.PI * 0.5 + (j / 64 - 0.5) * 0.7;
        const q = headPoint(th, ph);
        const d = Math.pow(q.y - FACE.earY, 2) + Math.pow(q.z + 0.014, 2) * 0.35;
        if (d < bd) { bd = d; bx = Math.abs(q.x); bz = q.z; }
      }
    }
    return { x: bx, z: bz };
  })();
  _earSurfCache.set(shape, earSurf);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group();
    // Sunk 3 mm into the surface so the root never shows a seam, and pitched
    // back ~10° like a real auricle rather than standing square off the skull.
    ear.position.set(sx * (earSurf.x - 0.003), FACE.earY, earSurf.z - 0.004);
    ear.rotation.y = sx * 0.34;
    ear.rotation.z = sx * -0.14;
    ear.rotation.x = -0.16;
    face.add(ear);
    const helix = new THREE.Mesh(new THREE.TorusGeometry(0.0175, 0.0048, 8, 20, Math.PI * 1.55), skinM);
    helix.rotation.y = Math.PI / 2;
    helix.rotation.z = -0.5;
    helix.scale.set(1, 1.30, 1);
    ear.add(helix);
    const concha = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 12, 10), skinM);
    concha.scale.set(0.34, 1.15, 0.85);
    ear.add(concha);
    // Antihelix — the inner Y-shaped ridge. Without it the ear is a ring with
    // a dish in it, which is exactly what a cartoon ear looks like.
    const anti = new THREE.Mesh(new THREE.TorusGeometry(0.0098, 0.0028, 6, 14, Math.PI * 1.1), skinM);
    anti.rotation.y = Math.PI / 2;
    anti.rotation.z = -0.35;
    anti.scale.set(1, 1.25, 0.8);
    anti.position.set(sx * 0.0015, 0.0012, -0.0016);
    ear.add(anti);
    // Tragus — the little flap over the canal, and the one part of an ear the
    // eye actually checks for at conversational distance.
    const tragus = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 8, 6), skinM);
    tragus.scale.set(0.5, 1.25, 0.9);
    tragus.position.set(sx * 0.0016, -0.0035, 0.0092);
    ear.add(tragus);
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 10, 8), skinM);
    lobe.scale.set(0.55, 1.1, 0.9);
    lobe.position.set(0, -0.0195, 0.0025);
    ear.add(lobe);
  }

  // --- hair ----------------------------------------------------------------
  // Every style is a SHELL of the sculpted skull, cut by a hairline mask, so it
  // sits on the head like hair instead of a helmet — and, critically, the
  // hairline stops above the brow instead of curtaining over the face.
  const style = hairStyleKind;
  const hairGroup = new THREE.Group();
  hairGroup.position.copy(skull.position);
  grp.add(hairGroup);
  let hairFlutter = null;
  if (style !== "bald") {
    // Shell thickness IS the hair's volume — it is an offset of the sculpted
    // skull, so raising it lifts the whole mass off the scalp the way hair
    // actually sits. At 8.5 mm the styles with real bulk (long, curly, pony)
    // were a skin painted on the head, which is most of the "helmet" read.
    // Buzz stays thin because a buzz cut genuinely is.
    const thick = style === "buzz" ? 0.0040
      : style === "curly" ? 0.0190
      : style === "long" ? 0.0165
      : style === "pony" ? 0.0145
      : 0.0120;
    const hairShellM = hairM.clone();
    hairShellM.transparent = true;
    hairShellM.vertexColors = true;
    hairShellM.depthWrite = true;
    const strands = getHairStrandTex(22, 3);
    if (strands) { hairShellM.map = strands; hairShellM.bumpMap = strands; hairShellM.bumpScale = 1.4; }
    // Volume is not a uniform offset: hair lifts at the crown, lies flatter
    // over the ears and at the nape, and PARTS down the middle of the top,
    // where the scalp shows as a darker line. A constant-thickness shell of
    // the skull is exactly what reads as a helmet.
    const partW = style === "buzz" ? 0 : 1;
    const partK = (th, ph) => {
      const a = th > Math.PI ? th - Math.PI * 2 : th;
      return partW * Math.exp(-(a / 0.075) * (a / 0.075)) * _sstep(0.95, 0.60, ph) * _sstep(0.10, 0.30, ph);
    };
    const cap = buildHeadShell(headPoint, hairShellM, {
      // Dense enough that the faded hairline does not step along grid lines.
      nu: o.lowDetail ? 72 : 120, nv: o.lowDetail ? 56 : 96, offset: thick, fade: true,
      cacheKey: "hairF5|" + shape + "|" + style + "|" + thick,
      mask: (th, ph) => hairlineMask(th, ph),
      thickMul: (th, ph) => {
        const a = th > Math.PI ? Math.PI * 2 - th : th;
        const crown = _sstep(1.35, 0.35, ph);                   // top of the head
        const ears = Math.exp(-Math.pow((a - 1.52) / 0.32, 2)) * _sstep(1.0, 1.35, ph);
        return (0.80 + 0.32 * crown) * (1 - 0.35 * ears) * (1 - 0.55 * partK(th, ph));
      },
      shade: (th, ph) => 1 - 0.42 * partK(th, ph),
    });
    if (cap) hairGroup.add(cap);
  }
  if (style === "curly") {
    // Curl cluster riding the cap, biased to the upper-back of the skull.
    for (let i = 0; i < 26; i++) {
      const th = (i / 26) * Math.PI * 2 + (i % 3) * 0.4;
      const ph = 0.35 + ((i * 7) % 11) / 11 * 0.75;
      if (hairlineMask(th, ph) <= 0.2) continue;
      const p = headPoint(th, ph);
      const curl = new THREE.Mesh(new THREE.SphereGeometry(0.019 + (i % 4) * 0.004, 10, 8), hairM);
      curl.position.copy(p).multiplyScalar(1.055);
      hairGroup.add(curl);
    }
  } else if (style === "long") {
    // Long hair is a skinned CURTAIN built on the rig (buildHairCurtain): it
    // has to follow the head at the scalp and the upper back where it lies,
    // which a mesh parented to the head alone cannot do.
  } else if (style === "pony") {
    const tail = new THREE.Group();
    tail.position.set(0, 0.030, -0.072);
    hairGroup.add(tail);
    const tie = new THREE.Mesh(
      new THREE.TorusGeometry(0.019, 0.0055, 8, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.8 })
    );
    tie.rotation.x = Math.PI / 2;
    tail.add(tie);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.026, 0.15, 6, 12), hairM);
    body.position.set(0, -0.095, -0.020);
    body.rotation.x = -0.22;
    tail.add(body);
    hairFlutter = tail;
  } else if (style === "short") {
    // A soft fringe sweeping across the forehead — the cue that reads "styled"
    // rather than "shaved cap".
    const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.040, 14, 10), hairM);
    fringe.scale.set(1.55, 0.42, 0.60);
    fringe.position.set(0.008, 0.062, 0.062);
    fringe.rotation.z = 0.12;
    hairGroup.add(fringe);
  }

  // --- facial hair ---------------------------------------------------------
  const fh = fhKind;
  if (fh !== "none") {
    const fhM = new THREE.MeshStandardMaterial({
      color: hairCol.clone().multiplyScalar(0.82), roughness: 0.98,
      transparent: fh === "stubble", opacity: fh === "stubble" ? 0.55 : 1,
    });
    if (fh === "beard" || fh === "stubble") {
      // Jaw-and-chin mask: everything below the mouth line and forward of the ears.
      const beardM = fhM.clone();
      beardM.transparent = true;
      beardM.vertexColors = true;
      beardM.depthWrite = true;
      const beard = buildHeadShell(headPoint, beardM, {
        nu: o.lowDetail ? 52 : 76, nv: o.lowDetail ? 40 : 56,
        offset: fh === "stubble" ? 0.0016 : 0.0055, fade: true,
        // The expression fields are functions of position, so the beard takes
        // the very same morphs as the skin underneath it and rides the jaw
        // instead of tearing off it.
        morphs: true,
        cacheKey: "beardF4|" + shape + "|" + fh,
        // Slightly tighter than the tinted zone so the shell's polygon edge
        // always lands on skin that is already beard-coloured.
        mask: (th, ph, p) => { const v = beardMask(p); return v > 0.30 ? (v - 0.30) / 0.70 : 0; },
      });
      if (beard) { beard.position.copy(skull.position); grp.add(beard); expressionMeshes.push(beard); }
    }
    if (fh === "beard" || fh === "moustache") {
      const stache = new THREE.Mesh(new THREE.SphereGeometry(0.020, 14, 10), fhM);
      stache.scale.set(1.55, 0.42, 0.62);
      stache.position.set(0, -0.0530, 0.0810);
      face.add(stache);
    }
  }

  // --- headwear ------------------------------------------------------------
  const hw = o.headwear || "none";
  if (hw === "beanie" || hw === "cap") {
    const hwM = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.shirtColor), roughness: 0.94 });
    const bandM = new THREE.MeshStandardMaterial({ color: new THREE.Color(o.shirtColor).multiplyScalar(0.78), roughness: 0.94 });
    if (hw === "beanie") {
      const dome = buildHeadShell(headPoint, hwM, {
        nu: 44, nv: 32, offset: 0.014, cacheKey: "beanie|" + shape,
        mask: (th, ph) => _sstep(1.28, 1.12, ph),
      });
      if (dome) { dome.position.copy(skull.position); grp.add(dome); }
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.077, 0.014, 10, 26), bandM);
      band.rotation.x = Math.PI / 2;
      band.scale.set(1.02, 1.0, 1.14);
      band.position.set(0, HEAD_LIFT + 0.036, 0);
      grp.add(band);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), bandM);
      pom.position.set(0, HEAD_LIFT + 0.128, 0);
      grp.add(pom);
    } else {
      const dome = buildHeadShell(headPoint, hwM, {
        nu: 44, nv: 32, offset: 0.011, cacheKey: "cap|" + shape,
        mask: (th, ph) => _sstep(1.24, 1.08, ph),
      });
      if (dome) { dome.position.copy(skull.position); grp.add(dome); }
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.062, 0.008, 20, 1, false, 0, Math.PI), bandM);
      brim.scale.set(1.15, 1, 1.30);
      brim.rotation.y = Math.PI / 2;
      brim.position.set(0, HEAD_LIFT + 0.040, 0.030);
      brim.rotation.x = -0.12;
      grp.add(brim);
    }
  }

  // --- glasses -------------------------------------------------------------
  if (o.glasses === "round" || o.glasses === "square") {
    const fr = new THREE.MeshPhysicalMaterial({
      color: 0x14100f, roughness: 0.28, metalness: 0.55, clearcoat: 0.6,
    });
    const lensM = new THREE.MeshPhysicalMaterial({
      color: 0xbfd6e6, roughness: 0.05, metalness: 0.1, transparent: true,
      opacity: 0.15, depthWrite: false, clearcoat: 1.0, clearcoatRoughness: 0.02,
    });
    const zFront = eyeSurfZ + 0.0085;
    for (const sx of [-1, 1]) {
      const rim = new THREE.Mesh(
        o.glasses === "round"
          ? new THREE.TorusGeometry(0.0196, 0.0017, 8, 26)
          : new THREE.TorusGeometry(0.0206, 0.0017, 4, 4),
        fr
      );
      if (o.glasses === "square") { rim.rotation.z = Math.PI / 4; rim.scale.set(1.0, 0.82, 1); }
      rim.position.set(sx * FACE.eyeX, FACE.eyeY, zFront);
      face.add(rim);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0193, 20), lensM);
      lens.position.copy(rim.position);
      lens.position.z -= 0.0008;
      if (o.glasses === "square") lens.scale.set(1.0, 0.82, 1);
      face.add(lens);
      // Temple arm, angled back to the ear.
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.0026, 0.0026), fr);
      arm.position.set(sx * 0.052, FACE.eyeY + 0.004, zFront - 0.030);
      arm.rotation.y = sx * 0.72;
      face.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.0024, 0.0024), fr);
    bridge.position.set(0, FACE.eyeY + 0.004, zFront);
    face.add(bridge);
  }

  // --- expression + gaze driver -------------------------------------------
  // Blinks close by ROTATING the lids (real eyelids sweep across the globe),
  // gaze swivels the eyeballs, and fear widens the eyes + lifts the brows.
  const _gz = new THREE.Vector3();
  // Morph plumbing. `_mi` is the index map, shared by every expression mesh
  // (they were all built from the same field list, so the order matches).
  const _mIdx = (skull.morphTargetDictionary) || {};
  const _mCount = FACE_MORPHS.length;
  const _mWant = new Float32Array(_mCount);
  grp.userData.face = {
    eyes,
    blink: 0, gazeX: 0, gazeY: 0, wide: 0, verge: 0,
    fear: 0, relief: 0, talk: 0, jaw: 0, smile: 0, effort: 0, soft: 0,
    // Speech is more than aperture: `talkWide` is the stretched "EE" corner
    // pull, `talkRound` the puckered "OO" — the viseme driver sets all three.
    talkWide: 0, talkRound: 0,
    // Asymmetric micro-smile (idle liveliness + relief beats), left corner.
    halfSmile: 0,
    // One place composes every muscle channel, because expressions ADD: a
    // frightened face that then smiles in relief is both at once, and whichever
    // setter ran last used to silently win.
    _applyMorphs() {
      const f = this.fear || 0, rl = this.relief || 0;
      const open = Math.max(this.talk || 0, this.jaw || 0);
      _mWant.fill(0);
      const put = (name, v) => { const i = _mIdx[name]; if (i != null) _mWant[i] = Math.max(_mWant[i], Math.min(1, v)); };
      put("jawOpen", open);
      // Fear: brows up AND knitted, mouth drawn back, a touch of sneer at the
      // top of the range. Raise without knit is surprise; knit without raise is
      // anger. Fear is the corner where both are true.
      put("browRaise", f * 0.85 + rl * 0.12);
      put("browFurrow", f * 0.62 + (this.effort || 0) * 0.5);
      // Speech shares the stretch channel with fear — an "EE" mid-sentence and
      // a grimace both draw the corners back, so they compose instead of fight.
      put("mouthStretch", Math.max(f * 0.70, (this.talkWide || 0) * 0.85));
      // The rounded viseme only reads when the face isn't stretching — fear
      // and "EE" both suppress a pucker in real speech too.
      put("mouthPucker", (this.talkRound || 0) * (1 - Math.max(f, this.talkWide || 0) * 0.8));
      put("sneer", Math.max(0, f - 0.45) * 0.9);
      // Soft/fond: mild contented squint (AU6) that coexists with smile.
      // Fear clamps it — you cannot look fond and terrified at once.
      const softK = (this.soft || 0) * (1 - f * 0.85);
      put("squint", Math.max(rl * 0.55, (this.effort || 0) * 0.35, Math.max(0, f - 0.6) * 0.4, softK * 0.50));
      // Relief reads as a real, small smile — the arousal-comes-down half of
      // the story this whole game is about.
      put("smile", Math.max(this.smile || 0, rl * 0.75, softK * 0.35));
      put("smileL", (this.halfSmile || 0) * (1 - f * 0.7));
      for (const m of expressionMeshes) {
        const inf = m.morphTargetInfluences;
        if (!inf) continue;
        for (let i = 0; i < inf.length && i < _mCount; i++) inf[i] = _mWant[i];
      }
    },
    setBlink(k) {
      this.blink = k;
      // Lids follow vertical gaze (clinical lid excursion primary→downgaze is
      // ~1 mm): fully raised lids over downward-rotated globes is the look of a
      // doll staring at the floor. Relief relaxes the aperture and raises the
      // LOWER lid — the Duchenne cue that separates "calm" from "blank".
      // Soft/fond eyes share that lower-lid rise (contented, not startled).
      const gy = this.gazeY || 0, rl = this.relief || 0;
      const softK = (this.soft || 0) * (1 - (this.fear || 0) * 0.85);
      for (const e of eyes) {
        const kk = Math.min(1, k * e.blinkGain);
        e.upper.rotation.x = LID_UP0 + (1.18 - this.wide * 0.10) * kk - this.wide * 0.20
          + gy * 0.45 + rl * 0.05 + softK * 0.04 + e.lidJit;
        e.lower.rotation.x = LID_LO0 - 0.13 * kk + this.wide * 0.10
          - gy * 0.25 + rl * 0.10 + softK * 0.14 - e.lidJit * 0.6;
      }
    },
    // Eye rotation in HEAD-local space. `verge` converges both globes toward
    // the midline for a near target — parallel eyes at 40 cm are the classic
    // thousand-yard stare through whatever the character is touching.
    setGaze(x, y, verge = 0) {
      this.gazeX = x; this.gazeY = y; this.verge = verge;
      for (const e of eyes) {
        e.globe.rotation.y = x - e.side * verge;
        e.globe.rotation.x = y;
      }
      this.setBlink(this.blink);
    },
    lookAtWorld(target, headObj) {
      if (!target || !headObj) return;
      headObj.updateMatrixWorld();
      _gz.copy(target);
      headObj.worldToLocal(_gz);
      const d = Math.max(0.15, _gz.length());
      this.setGaze(
        Math.max(-0.42, Math.min(0.42, Math.atan2(_gz.x, Math.max(0.05, _gz.z)))),
        Math.max(-0.30, Math.min(0.30, Math.asin(Math.max(-1, Math.min(1, _gz.y / d))) * -1)),
        Math.min(0.12, 0.032 / d)
      );
    },
    setWide(k) { this.wide = k; this.setBlink(this.blink); },
    // Brows carry both the fear shape and the relief release, so one place
    // composes them — otherwise whichever setter ran last silently won.
    _applyBrows() {
      const f = this.fear || 0, rl = this.relief || 0;
      this._applyMorphs();
      // One-sided flash (the "oh!" lift): only on the +x brow so it pairs
      // with the half-smile side. Fear overrides it — a startled face raises
      // BOTH brows and never just one.
      const flash = (this._browFlash || 0) * (1 - f);
      for (const b of brows) {
        const sd = b.userData.side;
        // Inner ends lift and pull together — the distress shape. Rotating the
        // ribbon about the head's centre raises whichever end is further out,
        // so the sign flips per side to lift the INNER end. Relief rolls it the
        // other way, past neutral.
        b.rotation.z = -sd * f * 0.30 + sd * rl * 0.08
          + (sd > 0 ? -flash * 0.06 : 0);
        b.position.y = b.userData.baseY + f * 0.010 - rl * 0.004
          + (sd > 0 ? flash * 0.0055 : 0);
        // AU4, the brow KNIT: without it a wide-eyed raised brow reads as
        // surprise, not fear — the knit is the only thing separating them.
        b.position.x = b.userData.baseX - sd * f * 0.0045;
      }
    },
    // Mouth aperture. Talking wins; a frightened face keeps its lips parted.
    _applyMouth() {
      const open = Math.max(this.talk || 0, this.jaw || 0);
      const s = Math.max(0.001, open * 0.75);
      // The dark interior patch only belongs behind a mouth that is actually
      // open. The idle jaw sits around 0.07, so at 0.03 the cavity showed on a
      // resting face and did most of the work of making it look slack-jawed.
      mouthCap.visible = open > 0.11;
      mouthCap.scale.y = s;
      // A jaw drops; it does not open symmetrically about the lip line. The cap
      // has to travel with the jawOpen morph or the dark interior slides out
      // from behind the lips.
      mouthCap.position.y = FACE.mouthY - MOUTH_HALF_H * s * 0.45 - open * 0.0075;
      mouthCap.position.z = (mouthCap.userData.baseZ || 0) - open * 0.0030;
      this._applyMorphs();
    },
    // Fear, on the face. The whole game is about arousal going up and coming
    // back down, and the character used to walk up to a barking dog wearing the
    // same expression it has on the title screen. 0..1.
    setFear(k) {
      this.fear = k;
      this.setWide(k * 0.95);
      this._applyBrows();
      this.jaw = k * 0.22;                    // AU26 — lips part under real fear
      this._applyMouth();
      // Pupils dilate with arousal — the strongest close-range physiological
      // tell there is, and the mesh has been sitting here unused. Scale in the
      // socket plane only: scaling depth too would push the black cap out
      // through the cornea.
      const ps = Math.min(1.35, 1 + 0.30 * k);
      for (const e of eyes) e.pupil.scale.set(ps, ps, 1);
    },
    // Relief: the arousal-comes-down half of the story the therapy loop tells.
    // Brows past neutral, lids relaxed, lower lid raised (Duchenne). 0..1.
    setRelief(k) {
      this.relief = Math.max(0, Math.min(1, k || 0));
      this._applyBrows();
      this.setBlink(this.blink);
    },
    // Speech aperture, 0..1. Driven in phoneme pulses, not a smooth ramp.
    setTalk(k) {
      this.talk = Math.max(0, Math.min(1, k || 0));
      this._applyMouth();
    },
    // Full viseme state: aperture plus mouth SHAPE (0 corners-back "EE",
    // 1 lips-pursed "OO"). The viseme random-walk in the body drives this;
    // plain setTalk callers leave the shape channels untouched.
    setTalkShape(open, wide, round) {
      this.talk = Math.max(0, Math.min(1, open || 0));
      this.talkWide = Math.max(0, Math.min(1, wide || 0));
      this.talkRound = Math.max(0, Math.min(1, round || 0));
      this._applyMouth();
    },
    // Asymmetric micro-smile (left corner), 0..1 — the idle "somebody's
    // home" cue and the small private smile of a relief beat.
    setHalfSmile(k) {
      this.halfSmile = Math.max(0, Math.min(1, k || 0));
      this._applyMorphs();
    },
    // A one-brow lift, 0..1 (same side as the half-smile) — paired with
    // setHalfSmile it's the universal "oh, interesting" flash. The body's
    // micro-expression driver sets the envelope every frame.
    setBrowFlash(k) {
      this._browFlash = Math.max(0, Math.min(1, k || 0));
      this._applyBrows();
    },
    // A voluntary smile, separate from relief — used when the guide praises
    // you and when a creature finally accepts contact. 0..1.
    setSmile(k) {
      this.smile = Math.max(0, Math.min(1, k || 0));
      this._applyMorphs();
    },
    // Soft/fond eyes: the look of a calm person touching something warm.
    // Lower lids rise (Duchenne cue), mild squint — opposite of the
    // wide-eyed fear stare. Suppressed by fear so the two never fight.
    setSoft(k) {
      this.soft = Math.max(0, Math.min(1, k || 0));
      this._applyMorphs();
      this.setBlink(this.blink);
    },
    // Physical exertion (reaching at full stretch, holding a rail hard). Reads
    // as a brow knit plus a squint, and it is the difference between "the arm
    // moved" and "the person is doing something". 0..1.
    setEffort(k) {
      this.effort = Math.max(0, Math.min(1, k || 0));
      this._applyMorphs();
    },
  };
  grp.userData.brows = brows;
  grp.userData.face.setBlink(0);
  grp.userData.hairFlutter = hairFlutter;
  grp.userData.eyes = eyes;
  grp.userData.materials = { skinM, hairM };
  return grp;
}

export { _hairReach, getHairStrandTex, HEAD_LIFT, buildHead };
