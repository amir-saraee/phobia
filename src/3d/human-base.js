// Groundwork for the human figure (the avatar and the in-scene Body): easing
// helpers, the gait table, leg IK, skinned-geometry sweeps, body-type
// proportions.

import * as THREE from "three";

// =============================================================================
// ---------- Humanoid: skeleton, skinned body, sculpted face ----------
// =============================================================================
// One character builder, used by BOTH the in-scene third-person body and the
// character-creator / title-screen preview — so the person you design is
// literally the person you play.
//
// Why this exists: the avatar used to be a pile of separate primitives (a
// sphere skull with sphere eyes glued on, capsule arms pivoting inside sphere
// shoulders, box feet). Every joint showed a seam, every rotation opened a gap,
// and the face read as a mannequin. Here the body is ONE continuous
// SkinnedMesh over a real bone hierarchy — shoulders, elbows, hips and knees
// deform instead of separating — and the head is a genuinely sculpted surface
// (brow ridge, eye sockets, nose bridge, lips, jaw, chin) rather than parts
// stuck to a ball.
//
// Bone local frames are chosen to match the OLD group hierarchy exactly
// (limbs hang along local -Y, +Z is forward), so all the tuned gait / posture /
// reach maths keeps working against `arms[].root/elbow` and `legs[].hip/knee/foot`.

// ---- small maths helpers -----------------------------------------------
const _hsat = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// smoothstep that also works with a > b (descending edges)
function _sstep(a, b, x) {
  const t = _hsat((x - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
}
// Anisotropic gaussian falloff — the workhorse for face sculpting.
function _falloff(dx, dy, dz, rx, ry, rz) {
  const a = dx / rx, b = dy / ry, c = dz / rz;
  const d2 = a * a + b * b + c * c;
  return d2 > 9 ? 0 : Math.exp(-d2);
}

// Correlated micro-motion. A real body is never still and never exactly
// repeats: there is always a slow sway being corrected. Three incommensurate
// sines give a smooth signal that never returns to the same phase, which is
// what separates "alive" from "looping".
function _wob(t, seed) {
  return (Math.sin(t * 0.73 + seed) * 0.55
        + Math.sin(t * 1.19 + seed * 2.3) * 0.30
        + Math.sin(t * 2.11 + seed * 4.7) * 0.15);
}

// ---- gait shaping -------------------------------------------------------
// Clinical 4-phase walk cycle (see assets/refs/protagonist-walk-cycle.png):
//   1. heel-strike (s≈0)  2. midstance flat (s≈flat..heelOff)
//   3. toe-off (s≈stance) 4. mid-swing flexed knee (s≈0.81)
// Phase s ∈ [0,1), s = 0 at initial contact. Body.update turns these into
// joint angles by inverse kinematics rather than posing the joints directly.
const _GAIT = {
  stance: 0.62,      // duty factor — clinical walk, slightly longer plant
  flat: 0.12,        // heel rocker complete: the sole is flat (midstance start)
  heelOff: 0.42,     // forefoot rocker begins: heel lifts toward toe-off
  pitchIC: -0.40,    // sole pitch at heel-strike (clearer toe-up)
  pitchTO: 0.78,     // at toe-off (toe down, heel high) — clearer push-off
  pitchSwing: -0.12, // mid-swing clearance
  // Stance knee flexion (rad): loading-response dip → midstance re-extend →
  // pre-swing flex that throws the leg into mid-swing peak flexion.
  // Peak flexion sits at 0.76 of the cycle (clinical mid-swing is ~0.75, and
  // the reference sheet's MID-SWING pose lands there); the old 0.81 peak read
  // as a late, marchy knee-lift just before footfall.
  kneeKeys: [[0, 0.12], [0.12, 0.36], [0.32, 0.10], [0.48, 0.26], [0.62, 0.82], [0.76, 1.05], [1.0, 0.12]],
};
// Piecewise-smoothstep through [[x, y], …] keyframes.
function _track(keys, u) {
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const a = keys[i - 1], b = keys[i];
      return a[1] + (b[1] - a[1]) * _sstep(a[0], b[0], u);
    }
  }
  return keys[keys.length - 1][1];
}
// World pitch of the sole across the cycle (+ = toe down).
function _solePitch(s) {
  const G = _GAIT;
  if (s < G.flat) return G.pitchIC * (1 - _sstep(0, G.flat, s));
  if (s < G.heelOff) return 0;
  if (s < G.stance) {
    // Heel-off breaks gently, then the push accelerates.
    const u = (s - G.heelOff) / (G.stance - G.heelOff);
    return G.pitchTO * _sstep(0, 1, u) * (0.30 + 0.70 * u);
  }
  const u = (s - G.stance) / (1 - G.stance);
  return u < 0.30
    ? G.pitchTO + (G.pitchSwing - G.pitchTO) * _sstep(0, 0.30, u)
    : G.pitchSwing + (G.pitchIC - G.pitchSwing) * _sstep(0.30, 1, u);
}
// Hip→ankle distance for a two-segment leg at a given knee flexion.
function _legReach(k, a, b) { return Math.hypot(a + b * Math.cos(k), b * Math.sin(k)); }
// Two-link leg IK. Target is relative to the hip joint: tx to the body's right,
// tz forward, ty below (negative). Writes hip pitch (negative swings the thigh
// forward, matching the rig), hip abduction and knee flexion (≥ 0) into `out`.
// The lateral reach has to be part of the SAME solve as the knee: solving the
// sagittal plane and abducting afterwards shortens the leg by cos(abduction),
// which on a committed side-step is 30° of hidden shortening — enough to drag
// the pelvis a quarter of a metre toward the floor.
function _legIK(tx, tz, ty, a, b, out) {
  const L = Math.min(Math.hypot(tx, tz, ty), (a + b) * 0.9995);
  let c = (L * L - a * a - b * b) / (2 * a * b);
  c = c < -1 ? -1 : c > 1 ? 1 : c;
  out.knee = Math.acos(c);
  const psi = Math.atan2(b * Math.sin(out.knee), a + b * Math.cos(out.knee));
  out.abduct = Math.asin(Math.max(-0.85, Math.min(0.85, L > 1e-6 ? tx / L : 0)));
  out.hip = -(Math.atan2(tz, -ty) + psi);
  return out;
}

// ---- skinned geometry accumulator --------------------------------------
// Collects vertices (position / uv / skinIndex / skinWeight) and triangles
// grouped by material slot, then bakes one indexed BufferGeometry with the
// material groups laid out contiguously.
class SkinGeom {
  constructor() {
    this.pos = []; this.uv = []; this.si = []; this.sw = [];
    this.tris = new Map();          // materialIndex -> flat index array
  }
  // w: array of [boneIndex, weight]; normalised here so callers can be sloppy.
  vert(x, y, z, u, v, w) {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    let tot = 0;
    for (let i = 0; i < w.length; i++) tot += w[i][1];
    if (tot <= 0) tot = 1;
    const si = [0, 0, 0, 0], sw = [0, 0, 0, 0];
    for (let i = 0; i < 4 && i < w.length; i++) { si[i] = w[i][0]; sw[i] = w[i][1] / tot; }
    this.si.push(si[0], si[1], si[2], si[3]);
    this.sw.push(sw[0], sw[1], sw[2], sw[3]);
    return (this.pos.length / 3) - 1;
  }
  tri(a, b, c, m) {
    let arr = this.tris.get(m);
    if (!arr) { arr = []; this.tris.set(m, arr); }
    arr.push(a, b, c);
  }
  quad(a, b, c, d, m) { this.tri(a, b, c, m); this.tri(a, c, d, m); }
  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.sw, 4));
    const slots = [...this.tris.keys()].sort((a, b) => a - b);
    let total = 0;
    for (const m of slots) total += this.tris.get(m).length;
    const idx = new Uint32Array(total);
    let at = 0;
    for (const m of slots) {
      const arr = this.tris.get(m);
      g.addGroup(at, arr.length, m);
      for (let i = 0; i < arr.length; i++) idx[at + i] = arr[i];
      at += arr.length;
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    return g;
  }
}

// ---- limb sweep ---------------------------------------------------------
// Sweeps a (possibly elliptical, possibly squared-off) cross-section along a
// polyline of stations. ALL paths are authored top → bottom so the tangent is
// ~(0,-1,0) and the generated winding stays consistent.
//
// station: { p:[x,y,z], rx, rz, w:[[bone,weight],…], mat, sq?, cap? }
//   sq   — superellipse exponent (<1 squares the section off; torso uses it)
//   cap  — "start" / "end" closes that end with a rounded pole
function _sweep(sg, stations, radial) {
  const N = radial;
  const rings = [];
  const T = new THREE.Vector3(), X = new THREE.Vector3(), Z = new THREE.Vector3(), R = new THREE.Vector3();
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const a = stations[Math.max(0, i - 1)].p, b = stations[Math.min(stations.length - 1, i + 1)].p;
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (T.lengthSq() < 1e-10) T.set(0, -1, 0);
    T.normalize();
    R.set(0, 0, 1);
    if (Math.abs(T.z) > 0.9) R.set(1, 0, 0);
    X.crossVectors(R, T).normalize();
    Z.crossVectors(T, X).normalize();
    const ring = [];
    const sq = s.sq || 1;
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2;
      let cx = Math.cos(ang), cz = Math.sin(ang);
      if (sq !== 1) {
        cx = Math.sign(cx) * Math.pow(Math.abs(cx), sq);
        cz = Math.sign(cz) * Math.pow(Math.abs(cz), sq);
      }
      // A station may modulate its radius per angle (`rmod`) and vary its bone
      // weights per vertex (`wAt`). Both exist so the SHOULDER can carry its
      // deltoids as part of the torso surface: a ring that can only be an
      // ellipse cannot grow two lateral lobes, and a ring with one weight set
      // cannot send its left lobe to the left arm and its right to the right.
      const rm = s.rmod ? s.rmod(ang) : 1;
      const ox = (X.x * s.rx * cx + Z.x * s.rz * cz) * rm;
      const oy = (X.y * s.rx * cx + Z.y * s.rz * cz) * rm;
      const oz = (X.z * s.rx * cx + Z.z * s.rz * cz) * rm;
      const wv = s.wAt ? s.wAt(ang) : s.w;
      // `ymod` tilts a ring — the crew neck dips at the front, sits high behind.
      const ym = s.ymod ? s.ymod(ang) : 0;
      ring.push(sg.vert(s.p[0] + ox, s.p[1] + oy + ym, s.p[2] + oz, k / N, i / (stations.length - 1), wv));
    }
    rings.push(ring);
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const m = stations[i].mat;
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      sg.quad(rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k], m);
    }
  }
  // Rounded end caps: a single pole vertex pushed along the tangent.
  const capEnd = (si, dir) => {
    const s = stations[si];
    const rr = (s.rx + s.rz) * 0.5;
    const a = stations[Math.max(0, si - 1)].p, b = stations[Math.min(stations.length - 1, si + 1)].p;
    T.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (T.lengthSq() < 1e-10) T.set(0, -1, 0);
    T.normalize().multiplyScalar(dir * rr * (s.capH != null ? s.capH : 0.85));
    // The pole sits over the ring's actual centroid, which a tilted (ymod)
    // ring moves off the station point.
    let mx = 0, my = 0, mz = 0;
    for (const vi of rings[si]) { mx += sg.pos[vi * 3]; my += sg.pos[vi * 3 + 1]; mz += sg.pos[vi * 3 + 2]; }
    const nr = rings[si].length || 1;
    const pole = sg.vert(mx / nr + T.x, my / nr + T.y, mz / nr + T.z, 0.5, dir > 0 ? 1 : 0, s.w);
    const ring = rings[si];
    // Winding checked numerically (face normal · outward > 0 for every cap
    // triangle). It used to be the other way round at BOTH ends, so every cap
    // was back-face culled: the collar was an open hole into the torso (the
    // first-person "looking down inside my shirt" view) and the ring of shared
    // vertices averaged in inward normals, which is the black band that sat
    // around the neck in every third-person shot.
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N;
      if (dir > 0) sg.tri(ring[k], ring[k2], pole, s.mat);
      else sg.tri(ring[k], pole, ring[k2], s.mat);
    }
  };
  if (stations[0].cap) capEnd(0, -1);
  if (stations[stations.length - 1].cap) capEnd(stations.length - 1, 1);
}

// ---- body-type proportion table ----------------------------------------
// Height, shoulder width, hip width, head ratio, gait sway personality, plus
// the softer/rounder shaping that separates the presets at silhouette range.
// armOut / carry: how a hanging arm clears the hips. armOut is extra shoulder
// abduction (rad) on top of the shared rest spread; carry is the elbow's
// carrying angle (forearm angled away from the body, larger in women — as in
// life). With hip:shoulder ratios up to 1.4, arms hung straight down through
// the trousers: the forearm vanished into the pelvis and the hand stuck out
// beside the thigh. Measured so the forearm clears the widest hip by ~3 cm.
// WRIST_REST_FOLD tips the hanging hand back in toward the thigh — with the
// carry and no fold, the hands flared out like a shrug.
const WRIST_REST_FOLD = 0.30;
const BODY_TYPES_3D = {
  man:   { h: 1.00, shoulder: 1.00, hip: 1.00, head: 1.00, sway: 1.0, chestZ: 1.00, waist: 1.00, limb: 1.00, seat: 1.00, armOut: 0.025, carry: 0.07 },
  // Tuned against assets/refs/protagonist-turnaround.png: narrower shoulders,
  // slightly longer limb read, fuller hips/seat, softer chest depth.
  woman: { h: 0.96, shoulder: 0.84, hip: 1.16, head: 0.97, sway: 1.40, chestZ: 1.08, waist: 0.84, limb: 0.94, seat: 1.12, armOut: 0.11, carry: 0.10 },
  boy:   { h: 0.80, shoulder: 0.80, hip: 0.96, head: 1.16, sway: 0.9,  chestZ: 0.94, waist: 0.96, limb: 0.90, seat: 0.96, armOut: 0.07, carry: 0.09 },
  girl:  { h: 0.78, shoulder: 0.76, hip: 1.02, head: 1.18, sway: 1.15, chestZ: 0.96, waist: 0.90, limb: 0.88, seat: 1.02, armOut: 0.105, carry: 0.10 },
};

export { _hsat, _sstep, _falloff, _wob, _GAIT, _track, _solePitch, _legReach, _legIK, SkinGeom, _sweep, WRIST_REST_FOLD, BODY_TYPES_3D };
