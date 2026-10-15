// The skinned human rig: hands and fingers, stature landmarks, the hair
// curtain, buildHumanRig() — plus contact shadows, private light rigs and the
// soft sunbeam.

import * as THREE from "three";
import { _hsat, _sstep, SkinGeom, _sweep, BODY_TYPES_3D } from "./human-base.js";
import { _hairReach, getHairStrandTex, HEAD_LIFT, buildHead } from "./human-head.js";

// ---- hands --------------------------------------------------------------
// Four fingers and a thumb, each with three real phalanges on nested pivots.
// `setCurl()` is what makes contact read as contact: the fingers actually
// close around a rail or splay flat on a dog's back instead of the hand
// staying a frozen mitt that happens to be near the object.
// Radii are deliberately larger than the gaps between the roots (spacing is
// ~10.3 mm, diameters ~19 mm) so adjacent fingers MERGE into one hand mass at
// rest instead of standing apart as four separate rods — real fingers touch.
// The splay values are the natural fan of a relaxed hand and are small; the
// `spread` argument to setCurl is what opens them into a flat palm.
const FINGER_SPEC = [
  { name: "index",  x: -0.0155, len: [0.0305, 0.0195, 0.0140], r: 0.0095, splay: -0.075 },
  { name: "middle", x: -0.0052, len: [0.0335, 0.0215, 0.0150], r: 0.0099, splay: -0.015 },
  { name: "ring",   x:  0.0052, len: [0.0300, 0.0200, 0.0140], r: 0.0093, splay:  0.040 },
  { name: "pinky",  x:  0.0150, len: [0.0235, 0.0150, 0.0120], r: 0.0079, splay:  0.110 },
];

function buildHand(side, skinM, sleeveM, opts = {}) {
  const hand = new THREE.Group();
  const S = opts.scale || 1;
  hand.scale.setScalar(S);
  // Palm — flattened and slightly tapered, with a thenar (thumb-base) pad so
  // the silhouette isn't a paddle.
  const palm = new THREE.Mesh(new THREE.SphereGeometry(0.0295, 18, 14), skinM);
  palm.scale.set(0.90, 1.08, 0.46);
  palm.position.y = -0.0225;
  palm.castShadow = true;
  hand.add(palm);
  const thenar = new THREE.Mesh(new THREE.SphereGeometry(0.0145, 12, 10), skinM);
  thenar.scale.set(0.85, 1.15, 0.72);
  thenar.position.set(side * 0.0165, -0.0215, 0.0045);
  hand.add(thenar);
  const knuckleRow = new THREE.Mesh(new THREE.SphereGeometry(0.0135, 14, 10), skinM);
  knuckleRow.scale.set(1.85, 0.62, 0.60);
  knuckleRow.position.set(0, -0.0435, 0.0015);
  hand.add(knuckleRow);
  // Wrist: fills the join between the body's forearm tube (open at its end)
  // and the top of the palm. Without it a ring of daylight showed through —
  // the dark "watch strap" at every wrist, which was the trousers behind.
  if (!opts.forearm) {
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.0182, 14, 10), skinM);
    wrist.scale.set(1.12, 1.30, 0.78);
    wrist.position.y = 0.0035;
    hand.add(wrist);
  }

  const fingers = [];
  for (const spec of FINGER_SPEC) {
    const root = new THREE.Group();
    root.position.set(side * -spec.x, -0.0455, 0.0015);
    root.rotation.z = side * spec.splay;
    hand.add(root);
    const seg = [];
    let parent = root;
    for (let s = 0; s < 3; s++) {
      const pivot = new THREE.Group();
      if (s > 0) pivot.position.y = -spec.len[s - 1];
      parent.add(pivot);
      // 0.17 per segment left the distal phalanx at 0.66 of the proximal and
      // ended each finger in a small hemisphere — a point. A real fingertip is
      // ~0.82 of the base and blunt.
      const r = spec.r * (1 - s * 0.09);
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(r, spec.len[s] - r * 0.9, 5, 8), skinM);
      bone.position.y = -spec.len[s] / 2;
      bone.scale.z = 0.86;
      bone.castShadow = true;
      pivot.add(bone);
      seg.push(pivot);
      parent = pivot;
    }
    // A relaxed hand is never straight — this is the resting curl. See the
    // note on setCurl: these are the k = 0 pose and must match its constants.
    seg[0].rotation.x = 0.34; seg[1].rotation.x = 0.72; seg[2].rotation.x = 0.20;
    fingers.push({ spec, seg });
  }
  // Thumb — rooted low on the side of the palm and rotated out of its plane.
  const thumbRoot = new THREE.Group();
  thumbRoot.position.set(side * 0.0215, -0.0175, 0.0055);
  thumbRoot.rotation.z = side * 0.95;
  thumbRoot.rotation.x = -0.42;
  thumbRoot.rotation.y = side * -0.30;
  hand.add(thumbRoot);
  const thumbSeg = [];
  {
    let parent = thumbRoot;
    const lens = [0.0230, 0.0175];
    for (let s = 0; s < 2; s++) {
      const pivot = new THREE.Group();
      if (s > 0) pivot.position.y = -lens[s - 1];
      parent.add(pivot);
      const r = 0.0102 - s * 0.0014;
      const bone = new THREE.Mesh(new THREE.CapsuleGeometry(r, lens[s] - r * 0.8, 5, 8), skinM);
      bone.position.y = -lens[s] / 2;
      bone.castShadow = true;
      pivot.add(bone);
      thumbSeg.push(pivot);
      parent = pivot;
    }
    thumbSeg[0].rotation.x = 0.18; thumbSeg[1].rotation.x = 0.22;
  }
  // Optional forearm stub, running back up +Y. First-person needs the arm to
  // come from somewhere; the in-scene rig gets its forearm from the skinned
  // body instead.
  if (opts.forearm) {
    // A forearm is not a pipe: slim at the wrist, a soft belly of muscle
    // toward the elbow. Bare skin unless the outfit has long sleeves — a tee
    // in third person with long teal sleeves in first person was two
    // different people.
    const prof = [[0.000, 0.0235], [0.030, 0.0245], [0.080, 0.0270], [0.150, 0.0315],
                  [0.215, 0.0330], [0.262, 0.0318], [0.285, 0.0290]];
    const fa = new THREE.Mesh(
      new THREE.LatheGeometry(prof.map(([yy, r]) => new THREE.Vector2(r, yy)), 18),
      opts.forearmMat || sleeveM || skinM
    );
    fa.position.y = 0.004;
    fa.scale.z = 0.84;
    hand.add(fa);
    const wristBall = new THREE.Mesh(new THREE.SphereGeometry(0.0295, 14, 10), skinM);
    wristBall.scale.set(1.15, 0.95, 0.80);
    wristBall.position.y = 0.010;
    hand.add(wristBall);
  }
  // Optional cuff — hides the wrist seam for long-sleeved outfits.
  if (opts.cuff && sleeveM) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.0295, 0.0275, 0.022, 14), sleeveM);
    cuff.scale.set(1, 1, 0.86);
    cuff.position.y = 0.010;
    hand.add(cuff);
  }

  // curl 0 = open/relaxed, 1 = closed fist; spread pushes the fingers apart
  // (a flat palm laid on a surface), tuck folds the thumb in.
  hand.userData.setCurl = function (curl, spread = 0, thumb = null) {
    const k = Math.max(0, Math.min(1.35, curl));
    for (let i = 0; i < fingers.length; i++) {
      const f = fingers[i];
      // Ring and pinky lead a natural closing sequence.
      const lead = 1 + (i >= 2 ? 0.12 : 0) - (i === 0 ? 0.06 : 0);
      // k = 0 is now the hand's POSITION OF REST, the pose a hand falls into
      // under nothing but its own tendon tension: MCP ~19°, PIP ~41°, DIP
      // ~11°. It used to be 11°/14°/9°, which is not a resting hand, it is a
      // hand being held open — and with the fingers fanned that is the "stop"
      // gesture, which is exactly why they read as claws hanging off the
      // wrists. Gains carry k = 1 to a real closed fist (~85°/100°/70°), so
      // callers keep the 0..1 contract.
      f.seg[0].rotation.x = 0.34 + k * 1.14 * lead - spread * 0.30;
      f.seg[1].rotation.x = 0.72 + k * 1.03 * lead - spread * 0.44;
      f.seg[2].rotation.x = 0.20 + k * 1.02 * lead - spread * 0.16;
      f.seg[0].rotation.z = side * f.spec.splay * (1 + spread * 1.9);
    }
    const tk = thumb == null ? k : thumb;
    thumbSeg[0].rotation.x = 0.18 + tk * 0.70;
    thumbSeg[1].rotation.x = 0.22 + tk * 0.85;
    thumbRoot.rotation.z = side * (0.95 - tk * 0.34 + spread * 0.22);
  };
  hand.userData.fingers = fingers;
  hand.userData.thumb = thumbSeg;
  return hand;
}

// Blend normals across surfaces that MEET but do not share vertices. The body is
// swept as separate tubes — torso, arms, legs — so where the deltoid emerges
// from the shoulder, or the thigh from the pelvis, two surfaces interpenetrate
// with a hard shading crease along the intersection. computeVertexNormals only
// averages across shared indices, so it cannot help there. Averaging over a
// small RADIUS does, and a crease limit keeps genuine edges (the shirt hem, the
// shoe welt) from being smeared along with them.
function blendSeamNormals(geom, radius = 0.024, cosLimit = 0.42) {
  const pos = geom && geom.attributes && geom.attributes.position;
  const nor = geom && geom.attributes && geom.attributes.normal;
  if (!pos || !nor) return;
  const inv = 1 / radius, r2 = radius * radius;
  const grid = new Map();
  const cellKey = (gx, gy, gz) => gx + "," + gy + "," + gz;
  const gi = (i) => [
    Math.floor(pos.getX(i) * inv), Math.floor(pos.getY(i) * inv), Math.floor(pos.getZ(i) * inv),
  ];
  for (let i = 0; i < pos.count; i++) {
    const [gx, gy, gz] = gi(i);
    const k = cellKey(gx, gy, gz);
    let arr = grid.get(k);
    if (!arr) { arr = []; grid.set(k, arr); }
    arr.push(i);
  }
  const src = new Float32Array(nor.array);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const nx = src[i * 3], ny = src[i * 3 + 1], nz = src[i * 3 + 2];
    let ax = 0, ay = 0, az = 0;
    const [gx, gy, gz] = gi(i);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const arr = grid.get(cellKey(gx + dx, gy + dy, gz + dz));
          if (!arr) continue;
          for (const j of arr) {
            const qx = pos.getX(j) - px, qy = pos.getY(j) - py, qz = pos.getZ(j) - pz;
            if (qx * qx + qy * qy + qz * qz > r2) continue;
            const mx = src[j * 3], my = src[j * 3 + 1], mz = src[j * 3 + 2];
            if (nx * mx + ny * my + nz * mz < cosLimit) continue;
            ax += mx; ay += my; az += mz;
          }
        }
      }
    }
    const len = Math.hypot(ax, ay, az);
    if (len > 1e-6) nor.setXYZ(i, ax / len, ay / len, az / len);
  }
  nor.needsUpdate = true;
}

// ---- the rig ------------------------------------------------------------
// Material slots inside the single body SkinnedMesh.
const MAT = { SKIN: 0, SHIRT: 1, PANTS: 2, SHOE: 3, DARK: 4, SOLE: 5 };

// Builds the whole character: skeleton, one continuous skinned body mesh,
// sculpted head, articulated hands, optional scarf.
//
// `dims` carries the landmark heights the rest of the app already agrees on
// (headY is the EYE height and a scene contract — never silently change it).
// ---- landmark heights ---------------------------------------------------
// Where the joints sit on a standing figure, as fractions of stature, from
// ordinary anthropometry. The eye is the fixed point (headY = 1.55 is a scene
// contract), which puts this figure at 1.657 m, and everything else follows.
//
// These replace a set that had drifted badly: the shoulders sat at 0.750 of
// stature against a real 0.818, so eleven centimetres of bare neck stood
// between the collar and the jaw and the character read as a giraffe. The hips
// and knees were each ~6 cm low with it, which shortened the legs and pushed
// the torso down.
const _STATURE = 1.55 / 0.935;                 // eye height ÷ its canon fraction
const ANKLE_Y     = +(0.039 * _STATURE).toFixed(4);   // 0.065
const KNEE_Y      = +(0.285 * _STATURE).toFixed(4);   // 0.472
const HIP_Y       = +(0.530 * _STATURE).toFixed(4);   // 0.878
const WAIST_Y     = +(0.615 * _STATURE).toFixed(4);   // 1.019
const NECK_Y      = +(0.848 * _STATURE).toFixed(4);   // 1.406
// The shoulder BONE lands 2 cm under chestTopY (see armY), so aim that at the
// acromion rather than this.
const CHEST_TOP_Y = +(0.818 * _STATURE + 0.02).toFixed(4);   // 1.376
const UPPER_ARM   = +(0.188 * _STATURE).toFixed(4);   // 0.312 — acromion→elbow
const FOREARM     = +(0.145 * _STATURE).toFixed(4);   // 0.241 — elbow→wrist
const THIGH_FRAC  = (HIP_Y - KNEE_Y) / (HIP_Y - ANKLE_Y);   // ≈ 0.50
// Acromion half-breadth. shoulderX = width x 1.16 puts the shoulder BONE on the
// acromion. The old 0.18 gave a 0.42 m bone span and, with the arm axis hung
// outboard of it, a 0.57 m bideltoid silhouette against a real 0.41 — which is
// most of why the shoulders read as pads bolted onto a barrel.
const SHOULDER_HALF = +((0.115 * _STATURE) / 1.16).toFixed(4);   // 0.164
// Hand length is 0.108 x stature (wrist crease to middle fingertip). The hand
// mesh is authored at 0.128 m, so it needs scaling up to reach a real 0.179 —
// small hands were part of why the figure read as slightly doll-like.
const HAND_SCALE = +((0.108 * _STATURE) / 0.1277).toFixed(3);   // ~1.40

// The mesh stations inside buildHumanRig are hand-authored in ONE fixed frame —
// heights measured on the figure as it used to be proportioned. The bones come
// from L. When the two disagree the surface drifts off the skeleton it is
// skinned to, which is exactly how the neck got stretched to twice its length.
// These map an authored height onto the landmark frame in force, so the surface
// always follows its bones. Authored anchors first, live ones second.
const _REF_BODY = [0, 0.04, 0.4144, 0.82, 0.92, 1.28, 1.40, 1.55];
function _remap(y, ref, act) {
  for (let i = 1; i < ref.length; i++) {
    if (y <= ref[i] || i === ref.length - 1) {
      const t = (y - ref[i - 1]) / (ref[i] - ref[i - 1]);
      return act[i - 1] + t * (act[i] - act[i - 1]);
    }
  }
  return y;
}

// ---- long hair: a skinned curtain ------------------------------------------
// Long hair cannot be parented to the head: turn the head and a rigid sheet
// hanging 30 cm below it swings through the shoulders. So the curtain is its
// own SkinnedMesh on the body's skeleton — rows on the scalp ride the HEAD
// bone, rows lying on the back ride the CHEST, and the fall between them
// blends — built at bind pose from the head's own surface (so the roots sit
// under the scalp shell) and draped over the torso's actual back surface.
function buildHairCurtain(rc) {
  const { headPoint, headObj, skeleton, bindMatrix, bones, torso, H, thick, hairMat } = rc;
  const M = 40, KH = 9, KF = 24;                 // columns; rows on the head; rows falling
  const KR = KH + KF;
  const thA = 1.66, thB = Math.PI * 2 - 1.66;    // behind one ear, round the back, to the other
  const headM = headObj.matrixWorld;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const toRig = (p) => V(p.x, p.y + HEAD_LIFT, p.z).applyMatrix4(headM);
  const headC = V(0, HEAD_LIFT, 0).applyMatrix4(headM);
  const scale = new THREE.Vector3().setFromMatrixScale(headM).x;
  const topY = torso[0].p[1];
  // The back of the body at (x, y): the torso's elliptical station there, or
  // the neck above the collar. Returns +Infinity where the body isn't behind.
  const bumps = rc.bumps || [];
  const zBack = (x, y) => {
    let zb = zBody(x, y);
    // Anything else lying on the back (a hoodie's hood) is an ellipsoid the
    // hair drapes over rather than through.
    for (const e of bumps) {
      const qx = x / e.rx, qy = (y - e.cy) / e.ry;
      const q = 1 - qx * qx - qy * qy;
      if (q > 0) zb = Math.min(zb, e.cz - e.rz * Math.sqrt(q));
    }
    return zb;
  };
  const zBody = (x, y) => {
    if (y >= topY) {
      const rN = 0.056 * H;
      return Math.abs(x) < rN ? -Math.sqrt(rN * rN - x * x) - 0.004 : Infinity;
    }
    for (let i = 0; i < torso.length - 1; i++) {
      const hi = torso[i], lo = torso[i + 1];
      if (y <= hi.p[1] && y >= lo.p[1]) {
        const f = (y - lo.p[1]) / Math.max(1e-4, hi.p[1] - lo.p[1]);
        const rx = lo.rx + (hi.rx - lo.rx) * f, rz = lo.rz + (hi.rz - lo.rz) * f;
        const q = x / rx;
        return Math.abs(q) < 1 ? -rz * Math.sqrt(1 - q * q) : Infinity;
      }
    }
    return Infinity;
  };
  const shY = rc.shoulderY;
  const endBase = shY - 0.175 * H;
  const P = [];                                   // outer surface [u][r]
  const fallFrom = [];                            // per column: y where the fall starts
  for (let i = 0; i <= M; i++) {
    const u = i / M;
    const th = thA + (thB - thA) * u;
    const a = th > Math.PI ? Math.PI * 2 - th : th;
    const ph0 = Math.max(0.50, _hairReach(a) - 0.62);
    const ph1 = 1.80;
    const col = [];
    for (let r = 0; r <= KH; r++) {
      const t = r / KH;
      const ph = ph0 + (ph1 - ph0) * t;
      const q = headPoint(th, ph);
      const n = q.clone().normalize();
      const o = thick * (0.70 + 0.55 * t);        // hair layers stack toward the ends
      col.push(toRig(q.addScaledVector(n, o)));
    }
    const p1 = col[KH];
    fallFrom.push(p1.y);
    const cu = 2 * u - 1;
    const yEnd = endBase + 0.075 * H * cu * cu + 0.010 * Math.sin(u * 37.3) + 0.007 * Math.sin(u * 91.7);
    // Leave the head along its own tangent, then fall.
    const tan = col[KH].clone().sub(col[KH - 1]).normalize();
    for (let r = 1; r <= KF; r++) {
      const t = r / KF;
      const y = p1.y - (p1.y - yEnd) * t;
      const ease = Math.min(1, t * 3.2);
      const x = p1.x * (1 + 0.30 * Math.pow(t, 1.1)) + tan.x * 0.03 * (1 - ease);
      let z = p1.z + tan.z * 0.05 * Math.min(1, t * 2.0) * (1 - 0.5 * t);
      col.push(V(x, y, z));
    }
    // Drape over the body: clear the neck and back, then smooth the profile
    // so the hair lies on the shoulder blades instead of kinking round them.
    const clr = 0.010 + 0.006 * scale;
    for (let pass = 0; pass < 8; pass++) {
      for (let r = KH + 1; r <= KR; r++) {
        const zb = zBack(col[r].x, col[r].y);
        if (isFinite(zb)) col[r].z = Math.min(col[r].z, zb - clr);
      }
      if (pass < 7) {
        for (let r = KH + 1; r < KR; r++) col[r].z = (col[r - 1].z + 2 * col[r].z + col[r + 1].z) * 0.25;
      }
    }
    P.push(col);
  }
  // Thickness along the fall, and the inner sheet.
  const pos = [], nor = [], uv = [], colr = [], si = [], sw = [], idx = [];
  const bi = (b) => b.userData.index;
  const iHead = bi(bones.head), iNeck = bi(bones.neck), iChest = bi(bones.chest);
  const outerIdx = [], innerIdx = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), N = new THREE.Vector3();
  const push = (p, u, v, shade, wH, wN, wC) => {
    pos.push(p.x, p.y, p.z);
    uv.push(u, v);
    colr.push(shade, shade, shade);
    const tot = wH + wN + wC || 1;
    si.push(iHead, iNeck, iChest, 0);
    sw.push(wH / tot, wN / tot, wC / tot, 0);
    return pos.length / 3 - 1;
  };
  for (let i = 0; i <= M; i++) {
    const oc = [], ic = [];
    const tone = 0.93 + 0.07 * Math.sin(i * 2.7) * Math.sin(i * 0.9);
    for (let r = 0; r <= KR; r++) {
      const p = P[i][r];
      tmpA.subVectors(P[Math.min(M, i + 1)][r], P[Math.max(0, i - 1)][r]);
      tmpB.subVectors(P[i][Math.min(KR, r + 1)], P[i][Math.max(0, r - 1)]);
      N.crossVectors(tmpA, tmpB).normalize();
      // Outward = away from the head centre on the scalp, away from the body
      // axis once falling.
      const ref = r <= KH ? tmpA.subVectors(p, headC) : tmpA.set(p.x, 0, p.z);
      if (N.dot(ref) < 0) N.negate();
      const t = r / KR;
      const fall = Math.max(0, fallFrom[i] - p.y);
      const wH = 1 - _sstep(0.0, 0.085, fall);
      const wC = _sstep(0.03, 0.13, fall);
      const wN = Math.max(0, 1 - wH - wC);
      const thk = r <= KH ? thick * 0.9 : (0.015 - 0.010 * Math.pow((r - KH) / KF, 1.4)) * scale;
      const shade = tone * (0.88 + 0.16 * Math.pow(t, 1.5));
      oc.push(push(p, i / M, 1 - t, shade, wH, wN, wC));
      ic.push(push(p.clone().addScaledVector(N, -thk), i / M, 1 - t, shade * 0.62, wH, wN, wC));
    }
    outerIdx.push(oc); innerIdx.push(ic);
  }
  // Faces. Winding is fixed up per triangle against the intended outward
  // direction, so the slab is closed and front-facing everywhere.
  const pv = (k) => tmpA.set(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const tri = (a, b, c, want) => {
    const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2];
    const ux = pos[b * 3] - ax, uy = pos[b * 3 + 1] - ay, uz = pos[b * 3 + 2] - az;
    const vx = pos[c * 3] - ax, vy = pos[c * 3 + 1] - ay, vz = pos[c * 3 + 2] - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * want.x + ny * want.y + nz * want.z < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };
  const W = new THREE.Vector3();
  const outwardAt = (k, sign) => {
    const p = pv(k);
    const r = W.set(p.x, 0, p.z);
    if (p.y > headC.y - 0.12 * scale) r.set(p.x - headC.x, p.y - headC.y, p.z - headC.z);
    return r.multiplyScalar(sign);
  };
  for (let i = 0; i < M; i++) {
    for (let r = 0; r < KR; r++) {
      const a = outerIdx[i][r], b = outerIdx[i + 1][r], c = outerIdx[i + 1][r + 1], d = outerIdx[i][r + 1];
      const w1 = outwardAt(a, 1).clone();
      tri(a, b, c, w1); tri(a, c, d, w1);
      const a2 = innerIdx[i][r], b2 = innerIdx[i + 1][r], c2 = innerIdx[i + 1][r + 1], d2 = innerIdx[i][r + 1];
      const w2 = outwardAt(a2, -1).clone();
      tri(a2, b2, c2, w2); tri(a2, c2, d2, w2);
    }
  }
  // Edges: the tips, the two sides, the buried top.
  const edge = (o0, o1, i0, i1, dir) => { tri(o0, o1, i1, dir); tri(o0, i1, i0, dir); };
  for (let i = 0; i < M; i++) {
    edge(outerIdx[i][KR], outerIdx[i + 1][KR], innerIdx[i][KR], innerIdx[i + 1][KR], V(0, -1, 0));
    edge(outerIdx[i][0], outerIdx[i + 1][0], innerIdx[i][0], innerIdx[i + 1][0], V(0, 1, 0));
  }
  for (let r = 0; r < KR; r++) {
    const side0 = pv(outerIdx[0][r]).clone().sub(pv(outerIdx[1][r]));
    edge(outerIdx[0][r], outerIdx[0][r + 1], innerIdx[0][r], innerIdx[0][r + 1], side0);
    const side1 = pv(outerIdx[M][r]).clone().sub(pv(outerIdx[M - 1][r]));
    edge(outerIdx[M][r], outerIdx[M][r + 1], innerIdx[M][r], innerIdx[M][r + 1], side1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(colr, 3));
  geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = hairMat.clone();
  mat.vertexColors = true;
  const strands = getHairStrandTex(9, 2.2);
  if (strands) { mat.map = strands; mat.bumpMap = strands; mat.bumpScale = 1.4; }
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.name = "hairCurtain";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  rc.group.add(mesh);
  mesh.bind(skeleton, bindMatrix);
  return mesh;
}

// Front dip of a crew neckline: `depth` at the centre front, easing to zero
// at the sides (ring angle: sin > 0 is the front of the body).
function _crewDip(depth) {
  return (ang) => -depth * Math.pow(Math.max(0, Math.sin(ang)), 1.6);
}

function buildHumanRig(o = {}) {
  const bt = BODY_TYPES_3D[o.bodyType] || BODY_TYPES_3D.man;
  const L = {
    headY: o.headY ?? 1.55, neckY: o.neckY ?? NECK_Y, chestTopY: o.chestTopY ?? CHEST_TOP_Y,
    waistY: o.waistY ?? WAIST_Y, hipY: o.hipY ?? HIP_Y, kneeY: o.kneeY ?? KNEE_Y,
    ankleY: o.ankleY ?? ANKLE_Y, width: o.width ?? 0.18,
  };
  const H = L.headY / 1.55;                    // overall height factor
  const SW = (L.width / 0.18);                 // shoulder width factor (already × bt.shoulder)
  const HW = bt.hip;                           // hip width factor
  const LW = bt.limb;                          // limb thickness factor

  // ---------- bones ----------
  const bones = [];
  const B = {};
  function bone(name, parent, x, y, z) {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    if (parent) parent.add(b); 
    B[name] = b;
    b.userData.index = bones.length;
    bones.push(b);
    return b;
  }
  const shoulderX = L.width * 1.16;
  const armY      = L.chestTopY - 0.02;
  const chestY    = L.waistY + (L.chestTopY - L.waistY) * 0.50;
  // Arm segments from anthropometry too. With the shoulder raised to where it
  // belongs, the old 0.268/0.252 left the fingertips 9 cm high — they had been
  // compensating for the low shoulder rather than being right themselves.
  const upperLen  = UPPER_ARM * H, foreLen = FOREARM * H;
  const legLen    = L.hipY - L.ankleY;
  const thighLen  = legLen * THIGH_FRAC, shinLen = legLen * (1 - THIGH_FRAC);
  // Authored height → this rig's height, for the mesh stations. Torso, legs and
  // shoe ride the body landmarks; the arm rides its own chain, because its
  // segment lengths changed independently of the trunk.
  const _actBody = [0, L.ankleY, L.hipY - thighLen, L.hipY, L.waistY, L.chestTopY, L.neckY, L.headY];
  const stationY = (y) => _remap(y, _REF_BODY, _actBody);
  const _REF_ARM = [0.740, 0.992, 1.26];
  const _actArm  = [armY - upperLen - foreLen, armY - upperLen, armY];
  // At and above the shoulder the arm rings ARE the deltoid, weighted to the
  // chest — they have to stay welded to the trunk, so they ride the body map.
  // Below it they ride the arm chain, whose segments changed independently.
  // The two agree exactly at the authored shoulder (1.26 → armY), so the
  // surface is continuous across the join.
  const armStationY = (y) => (y >= 1.26 ? stationY(y) : _remap(y, _REF_ARM, _actArm));

  const pelvis = bone("pelvis", null, 0, L.hipY, 0);
  const spine  = bone("spine",  pelvis, 0, L.waistY - L.hipY, 0);
  const chest  = bone("chest",  spine,  0, chestY - L.waistY, 0);
  const breath = bone("breath", chest,  0, 0, 0);            // scale-only: rib expansion
  const neck   = bone("neck",   chest,  0, L.neckY - chestY, 0);
  const headB  = bone("head",   neck,   0, (L.headY - 0.06) - L.neckY, 0);
  const armBones = [], legBones = [];
  for (const sx of [-1, 1]) {
    const tag = sx > 0 ? "R" : "L";
    const sh = bone(tag + "_shoulder", chest, sx * shoulderX, armY - chestY, 0);
    const el = bone(tag + "_elbow", sh, 0, -upperLen, 0);
    const wr = bone(tag + "_wrist", el, 0, -foreLen, 0);
    armBones.push({ sh, el, wr, side: sx });
    const hp = bone(tag + "_hip", pelvis, sx * 0.10 * HW, 0, 0);
    const kn = bone(tag + "_knee", hp, 0, -thighLen, 0);
    const an = bone(tag + "_ankle", kn, 0, -shinLen, 0);
    legBones.push({ hp, kn, an, side: sx });
  }
  const bi = (b) => b.userData.index;

  // ---------- body mesh ----------
  const sg = new SkinGeom();
  const RAD_T = o.lowDetail ? 16 : 22;      // torso radial segments
  const RAD_L = o.lowDetail ? 12 : 16;      // limb radial segments

  // Torso + neck as ONE surface, so the collar/shoulder/neck junction is
  // continuous rather than three primitives poking through each other.
  const shirtTop = MAT.SHIRT;
  const sqT = 0.86;
  // Above the chest the stations are placed RELATIVE TO THE SHOULDER, not at
  // absolute heights. The old list was authored when the shoulder sat 11 cm
  // lower, and it put the trunk's widest point five centimetres ABOVE where the
  // arm now hangs from — so the deltoid attached to thin air and the shoulders
  // read as pads sitting on a barrel. `ay` is an absolute height; `y` still goes
  // through the body remap.
  const SHY = armY;                                   // acromion
  const torso = [
    // capH: the collar closes nearly flat, under the neck. A full dome here
    // rose around the throat like a turtleneck once the cap stopped being
    // back-face culled (see _sweep's capEnd).
    // The crew neck: high at the nape, dipping ~5 cm at the front so the
    // throat shows the way it does above a real tee. Level rings put the whole
    // neckline up under the chin, which read as a turtleneck.
    { ay: SHY + 0.080, rx: .0575, rz: .0560, w: [[bi(neck), .65], [bi(chest), .35]], mat: shirtTop, sq: 1, cap: 1, capH: 0.10, ymod: _crewDip(0.050) },
    { ay: SHY + 0.062, rx: .0720, rz: .0700, w: [[bi(neck), .38], [bi(chest), .62]], mat: shirtTop, sq: .97, ymod: _crewDip(0.040) },
    { ay: SHY + 0.040, rx: .1030, rz: .0870, w: [[bi(chest), 1]], mat: shirtTop, sq: .93, ymod: _crewDip(0.020) },
    // The acromion shelf stays WIDE up to just above the joint — that is what
    // the deltoid sits on. Narrowing it here (which the first attempt did) left
    // the arm cap protruding into thin air beside the neck.
    // Round through the shoulder band. `sq` squares the cross-section off, which
    // is right for a ribcage and wrong for a shoulder girdle — the corners were
    // reading as hard pointed edges where the sleeve met the yoke.
    { ay: SHY + 0.018, rx: .1450, rz: .0955, w: [[bi(chest), 1]], mat: shirtTop, sq: .99 },
    { ay: SHY - 0.010, rx: .1600, rz: .1030, w: [[bi(chest), 1]], mat: shirtTop, sq: .97 },
    { ay: SHY - 0.055, rx: .1955, rz: .1130, w: [[bi(chest), 1]], mat: shirtTop, sq: .93 },
    { y: 1.212, rx: .1950, rz: .1160, w: [[bi(chest), .70], [bi(breath), .30]], mat: shirtTop, sq: sqT },
    { y: 1.150, rx: .1805, rz: .1195, w: [[bi(breath), 1]], mat: shirtTop, sq: sqT },
    { y: 1.078, rx: .1580, rz: .1090, w: [[bi(breath), .55], [bi(spine), .45]], mat: shirtTop, sq: sqT },
    { y: 1.008, rx: .1415, rz: .0975, w: [[bi(spine), 1]], mat: shirtTop, sq: sqT },
    { y: 0.952, rx: .1435, rz: .1005, w: [[bi(spine), .50], [bi(pelvis), .50]], mat: shirtTop, sq: sqT },
    // A tee hem hangs OVER the waistband. The pants stations used to be wider
    // than the shirt above them (.1690 against .1580), so the trousers stepped
    // out past the hem and the overhang shaded into a hard black ring right
    // across the hips. Carry the shirt down to its own slightly flared hem and
    // start the trousers just inside it, so the step goes the way cloth does.
    { y: 0.902, rx: .1620, rz: .1120, w: [[bi(pelvis), 1]], mat: shirtTop, sq: sqT },
    { y: 0.878, rx: .1712, rz: .1188, w: [[bi(pelvis), 1]], mat: shirtTop, sq: sqT },
    { y: 0.860, rx: .1668, rz: .1152, w: [[bi(pelvis), 1]], mat: MAT.PANTS, sq: sqT },
    { y: 0.826, rx: .1700, rz: .1180, w: [[bi(pelvis), 1]], mat: MAT.PANTS, sq: sqT },
    // Close the trunk NARROW and high. At .1420 the end cap was a disc wider
    // than the gap between the thighs, hanging below the crotch — that pale
    // wedge between the legs was this, seen from underneath. The first shrink
    // (.0760 at y .762) still left the disc hanging ~2 cm proud of the inseam,
    // where its down-facing normals catch the fill light and read as a pale
    // wedge of skin between the trousers. Tuck it up INTO the thigh gap and
    // narrow it to the inseam shadow's width.
    //
    // Two more things were still showing there. `_sweep` pushes a cap's pole
    // out along the axis by 0.85 × the ring radius, so the .056 closing ring
    // grew a 5.6 cm cone hanging down between the thighs — the pale triangle
    // on the traveler page. And the block stepped from .164 to .112 in 6 mm
    // while standing ~3 cm proud of the thighs' front (chestZ deepens the
    // whole trunk): a shelf with a hard lower edge, like shorts over tights.
    // So the lower block now draws in toward the thighs' own depth over
    // 2.5 cm, and closes on a ring small enough that its pole is ~1 cm,
    // high enough that the thighs' inner mass meets in front of it.
    { y: 0.804, rx: .1560, rz: .1040, w: [[bi(pelvis), 1]], mat: MAT.PANTS, sq: sqT },
    { y: 0.792, rx: .1180, rz: .0860, w: [[bi(pelvis), 1]], mat: MAT.PANTS, sq: sqT },
    { y: 0.784, rx: .0620, rz: .0580, w: [[bi(pelvis), 1]], mat: MAT.PANTS, sq: sqT },
    { y: 0.779, rx: .0180, rz: .0200, w: [[bi(pelvis), 1]], mat: MAT.PANTS, sq: sqT, cap: 1 },
  ];
  // Chest / hip widths diverge by body type; `k` is 1 at the shoulders, 0 at
  // the seat, so one lerp shapes the whole silhouette.
  const torsoSt = torso.map((s) => {
    // `ay` stations are already in the live frame; `y` ones come from the
    // authored frame and need the remap. `k` (shoulder→seat blend) is judged in
    // the AUTHORED frame either way, so a re-authored station still gets the
    // body-type widths it should.
    const yAuth = s.ay != null ? 1.28 + (s.ay - armY) : s.y;
    const k = _hsat((yAuth - 0.80) / (1.29 - 0.80));
    // Dampened: stacking the raw hip factor on top of the seat factor pushed a
    // 36 cm hip out past 44 cm, which is what made the pelvis read as a block.
    const wide = SW * k + (1 + (HW - 1) * 0.55) * (1 - k);
    const waistPinch = 1 - (1 - bt.waist) * 0.75 * Math.exp(-Math.pow((yAuth - 0.985) / 0.095, 2));
    const seatK = 1 + (bt.seat - 1) * 0.5 * (1 - k) * (1 - k);
    return {
      p: [0, s.ay != null ? s.ay : stationY(s.y), 0],
      rx: s.rx * wide * waistPinch * seatK,
      rz: s.rz * (0.94 + 0.06 * wide) * bt.chestZ * waistPinch * seatK,
      w: s.w, mat: s.mat, sq: s.sq, cap: s.cap, capH: s.capH,
      ymod: s.ymod ? ((ang) => s.ymod(ang) * H) : null,
    };
  });
  _sweep(sg, torsoSt, RAD_T);

  // Arms. The deltoid's first rings are weighted to the CHEST, so the shoulder
  // stays welded to the torso and stretches instead of hinging open.
  const longSleeve = (o.topStyle === "hoodie" || o.topStyle === "jacket");
  for (const a of armBones) {
    const sx = a.side;
    const U = bi(a.sh), F = bi(a.el), W = bi(a.wr), C = bi(chest);
    const sleeveMat = longSleeve ? MAT.SHIRT : MAT.SKIN;
    const arm = [
      // Deltoid cap. Its crown sits AT the acromion now, not 2.8 cm above it —
      // above the joint there is only neck, and a cap up there reads as a
      // shoulder pad with a gap under it.
      // The humerus hangs INBOARD of the acromion, and the deltoid wraps outside
      // it — so the arm axis sits at ~0.85 of shoulderX and the tube is slim
      // enough that its outer surface lands on the real bideltoid breadth.
      // Riding the axis at 1.05 with a fat tube is what made the pads.
      { y: 1.262, xr: 0.36, rx: .028, rz: .028, w: [[C, 1]], mat: MAT.SHIRT, cap: 1 },
      { y: 1.268, xr: 0.56, rx: .042, rz: .041, w: [[C, .92], [U, .08]], mat: MAT.SHIRT },
      { y: 1.266, xr: 0.73, rx: .049, rz: .047, w: [[C, .62], [U, .38]], mat: MAT.SHIRT },
      { y: 1.250, xr: 0.84, rx: .050, rz: .048, w: [[C, .26], [U, .74]], mat: MAT.SHIRT },
      { y: 1.218, xr: 0.86, rx: .048, rz: .046, w: [[U, 1]], mat: MAT.SHIRT },
      { y: 1.150, xr: 0.865, rx: .0440, rz: .0424, w: [[U, 1]], mat: MAT.SHIRT },
      { y: 1.082, xr: 0.865, rx: .0400, rz: .0392, w: [[U, 1]], mat: sleeveMat },
      { y: 1.032, xr: 0.863, rx: .0370, rz: .0364, w: [[U, 1]], mat: sleeveMat },
      { y: 1.014, xr: 0.862, rx: .0358, rz: .0352, w: [[U, .78], [F, .22]], mat: sleeveMat },
      { y: 0.992, xr: 0.861, rx: .0348, rz: .0343, w: [[U, .50], [F, .50]], mat: sleeveMat },
      { y: 0.968, xr: 0.860, rx: .0355, rz: .0348, w: [[U, .22], [F, .78]], mat: sleeveMat },
      { y: 0.928, xr: 0.859, rx: .0372, rz: .0362, w: [[F, 1]], mat: sleeveMat },
      { y: 0.855, xr: 0.858, rx: .0324, rz: .0312, w: [[F, 1]], mat: sleeveMat },
      // A hoodie / jacket sleeve runs to the wrist; a tee already ended at the
      // upper arm, so only the long-sleeve case changes here.
      { y: 0.790, xr: 0.857, rx: .0262, rz: .0244, w: [[F, .55], [W, .45]], mat: longSleeve ? MAT.SHIRT : MAT.SKIN },
      { y: 0.752, xr: 0.857, rx: .0224, rz: .0202, w: [[W, 1]], mat: MAT.SKIN },
    ];
    _sweep(sg, arm.map((s) => ({
      p: [sx * s.xr * shoulderX, armStationY(s.y), 0],
      rx: s.rx * LW, rz: s.rz * LW, w: s.w, mat: s.mat, cap: s.cap,
    })), RAD_L);
  }

  // Legs — a real calf (offset back), a knee that keeps its section through
  // the bend, and a trouser hem that meets the shoe.
  for (const g of legBones) {
    const sx = g.side;
    const P = bi(pelvis), T = bi(g.hp), S = bi(g.kn), A = bi(g.an);
    // A leg is not a cone. The old list tapered monotonically from hip to
    // ankle, and that single fact is why the legs read as two tubes however
    // well they were shaded: below the knee a real leg gets WIDER before it
    // gets narrower. Circumference against the upper thigh, adult norms —
    // knee ~0.63, calf belly ~0.72, ankle ~0.40. So the calf belly is a good
    // 12% wider than the knee, and it sits about 30% of the way down the shin.
    //
    // Width alone is not enough either. The gastrocnemius is POSTERIOR mass:
    // inflating the whole ring just makes a fatter tube, so the swell goes on
    // through `rmod`, which modulates radius per angle. In a downward sweep
    // the ring's local +Z is world +Z, and the character faces +Z, so
    // sin(ang) < 0 is the back of the leg.
    const back = (a, p = 1.6) => (ang) => 1 + a * Math.pow(Math.max(0, -Math.sin(ang)), p);
    const front = (a, p = 1.6) => (ang) => 1 + a * Math.pow(Math.max(0, Math.sin(ang)), p);
    // The ring's local +X is world +X in a downward sweep, so the INNER thigh
    // (toward the other leg) is cos(ang) < 0 on the right leg, > 0 on the left.
    const inner = (a, p = 1.4) => (ang) => 1 + a * Math.pow(Math.max(0, -sx * Math.cos(ang)), p);
    const both = (f, g) => (ang) => f(ang) * g(ang);
    // The hip junction. Torso and thigh are two tubes, so the thigh's top has
    // to stay INSIDE the trousers block, under the shirt hem, in every pose.
    // It used to start 9.6 cm above the hip joint (authored .888), above the
    // hem (8.2 cm) and ~3 cm wider than the shirt there, with its capped top
    // weighted 38 % to the thigh: the dark cap poked out at both hips even in
    // the bind pose, and Idle_Loop's stance (thighs abducted 9° and 11–15°,
    // one flexed ~23°) lifted it further — the "waistband flaps". Now the top
    // ring is small and sits inside the block (authored .858), and the rings
    // above the joint (.82) are pelvis-heavy, so under 15° of abduction the
    // hip bulge rises ~1–2 cm and stays under the trousers' top edge.
    //
    // The adductors are INNER mass. Without them the thighs started 3.8 cm
    // apart on the wider-hipped body types, and the torso's closing cap
    // showed through the gap as a pale wedge at the crotch. Swelling the inner
    // side of the upper thigh makes the two meet at the midline, then fades
    // out by mid-thigh where a real thigh gap begins.
    const leg = [
      { y: 0.858, z: 0, rx: .062, rz: .084, w: [[P, .80], [T, .20]], mat: MAT.PANTS, cap: 1, rmod: inner(.34) },
      // Hamstring mass high on the back of the thigh, fading by mid-shaft.
      { y: 0.842, z: 0, rx: .084, rz: .100, w: [[P, .55], [T, .45]], mat: MAT.PANTS, rmod: both(back(.045), inner(.34)) },
      { y: 0.824, z: 0, rx: .102, rz: .110, w: [[P, .30], [T, .70]], mat: MAT.PANTS, rmod: both(back(.060), inner(.26)) },
      { y: 0.792, z: 0, rx: .0995, rz: .107, w: [[P, .08], [T, .92]], mat: MAT.PANTS, rmod: both(back(.050), inner(.21)) },
      { y: 0.692, z: 0, rx: .0920, rz: .099, w: [[T, 1]], mat: MAT.PANTS, rmod: both(back(.034), inner(.06)) },
      { y: 0.582, z: 0, rx: .0820, rz: .089, w: [[T, 1]], mat: MAT.PANTS },
      { y: 0.492, z: .002, rx: .0730, rz: .079, w: [[T, 1]], mat: MAT.PANTS },
      { y: 0.450, z: .003, rx: .0700, rz: .0762, w: [[T, .74], [S, .26]], mat: MAT.PANTS },
      // Knee: a narrow joint carrying one anterior bump, the patella. Sharper
      // exponent so it stays a kneecap rather than a swollen front.
      { y: 0.416, z: .004, rx: .0662, rz: .0730, w: [[T, .50], [S, .50]], mat: MAT.PANTS, rmod: front(.070, 2.4) },
      { y: 0.390, z: .001, rx: .0672, rz: .0742, w: [[T, .24], [S, .76]], mat: MAT.PANTS, rmod: back(.055) },
      // Calf belly — the widest point below the knee, and behind the shin.
      { y: 0.336, z: -.006, rx: .0752, rz: .0800, w: [[S, 1]], mat: MAT.PANTS, rmod: back(.200) },
      { y: 0.292, z: -.005, rx: .0715, rz: .0770, w: [[S, 1]], mat: MAT.PANTS, rmod: back(.155) },
      { y: 0.248, z: -.003, rx: .0630, rz: .0690, w: [[S, 1]], mat: MAT.PANTS, rmod: back(.100) },
      // Below the belly the taper is fast, and the Achilles keeps a narrow
      // ridge at the back all the way down to the heel.
      { y: 0.188, z: -.001, rx: .0505, rz: .0552, w: [[S, 1]], mat: MAT.PANTS, rmod: back(.058) },
      { y: 0.128, z: 0, rx: .0420, rz: .0448, w: [[S, .60], [A, .40]], mat: MAT.SHOE },
      { y: 0.086, z: 0, rx: .0392, rz: .0428, w: [[A, 1]], mat: MAT.SHOE },
    ];
    _sweep(sg, leg.map((s) => ({
      p: [sx * 0.10 * HW, stationY(s.y), s.z * H],
      rx: s.rx * LW * (0.66 + 0.34 * HW), rz: s.rz * LW * (0.66 + 0.34 * HW),
      w: s.w, mat: s.mat, cap: s.cap, rmod: s.rmod,
    })), RAD_L);

    // Shoe — swept along +Z from heel to toe with a flat sole. Rigid to the
    // ankle, with a natural few-degrees out-toe baked into the geometry
    // (relaxed people don't stand with parallel feet).
    const toe = sx * 0.09, ct = Math.cos(toe), st = Math.sin(toe);
    const ax = sx * 0.10 * HW, az = 0;
    const shoe = [
      { z: -.082, r: .0270, wdt: .0270, cap: 1 },
      { z: -.058, r: .0420, wdt: .0370 },
      { z: -.020, r: .0400, wdt: .0415 },
      { z:  .030, r: .0362, wdt: .0440 },
      { z:  .088, r: .0322, wdt: .0432 },
      { z:  .140, r: .0272, wdt: .0378 },
      { z:  .174, r: .0210, wdt: .0245, cap: 1 },
    ];
    _sweep(sg, shoe.map((s) => {
      const lz = s.z * H, lx = 0;
      return {
        p: [ax + (lx * ct + lz * st), stationY((0.004 + s.r) * H), az + (-lx * st + lz * ct)],
        rx: s.r * H, rz: s.wdt * H * (0.6 + 0.4 * LW),
        w: [[bi(g.an), 1]], mat: MAT.SHOE, sq: 0.70, cap: s.cap,
      };
    }), RAD_L);
    // Rubber sole: a flat band around the bottom of the shoe, a few mm
    // proud of the upper. It is what makes a shoe read as a sneaker rather
    // than a moulded slipper — and it frames the foot against pale floors.
    _sweep(sg, shoe.map((s) => {
      const lz = s.z * H, lx = 0;
      return {
        p: [ax + (lx * ct + lz * st), stationY(0.0135 * H), az + (-lx * st + lz * ct)],
        rx: 0.0098 * H, rz: s.wdt * H * (0.6 + 0.4 * LW) * 1.06 + 0.0015,
        w: [[bi(g.an), 1]], mat: MAT.SOLE, sq: 0.45, cap: s.cap, capH: 0.35,
      };
    }), RAD_L);
  }

  const geo = sg.toGeometry();
  blendSeamNormals(geo);   // soften where the swept tubes meet
  const skinCol = new THREE.Color(o.skinColor ?? 0xd4a07a);
  const shirtCol = new THREE.Color(o.shirtColor ?? 0x2c9d96);
  const pantsCol = new THREE.Color(o.pantsColor ?? 0x2c3a52);
  const shoeCol = new THREE.Color(o.shoeColor ?? 0xe9e5de);
  const mSkin = new THREE.MeshPhysicalMaterial({
    color: skinCol, roughness: 0.60, metalness: 0,
    sheen: 0.30, sheenRoughness: 0.85,
    sheenColor: skinCol.clone().lerp(new THREE.Color(0xff6a5a), 0.5),
    envMapIntensity: 0.45,
  });
  // Cloth reads as cloth when it has a little fuzz (sheen) and no metal.
  const mShirt = new THREE.MeshPhysicalMaterial({
    color: shirtCol, roughness: 0.92, metalness: 0,
    sheen: 0.5, sheenRoughness: 0.9, sheenColor: shirtCol.clone().lerp(new THREE.Color(0xffffff), 0.35),
    envMapIntensity: 0.35,
  });
  const mPants = new THREE.MeshPhysicalMaterial({
    color: pantsCol, roughness: 0.95, metalness: 0,
    // Sheen 0.4 with a 25%-white sheen colour put a broad warm specular wash
    // across the pelvis front under any warm key — on navy trousers it read
    // as a patch of bare skin at the crotch. Trouser cloth barely sheens.
    sheen: 0.22, sheenRoughness: 0.95, sheenColor: pantsCol.clone().lerp(new THREE.Color(0xffffff), 0.10),
    envMapIntensity: 0.3,
  });
  // Canvas sneakers (the reference turnaround), not patent leather: the old
  // glossy near-black read as a pair of clogs at every distance.
  const mShoe = new THREE.MeshPhysicalMaterial({
    color: shoeCol, roughness: 0.78, metalness: 0, sheen: 0.25, sheenRoughness: 0.9,
    sheenColor: shoeCol.clone().lerp(new THREE.Color(0xffffff), 0.3), envMapIntensity: 0.45,
  });
  const mSole = new THREE.MeshStandardMaterial({
    color: shoeCol.clone().lerp(new THREE.Color(0x8c8378), 0.35), roughness: 0.85, metalness: 0,
  });
  const mDark = new THREE.MeshStandardMaterial({ color: shirtCol.clone().multiplyScalar(0.74), roughness: 0.95 });
  const mats = [mSkin, mShirt, mPants, mShoe, mDark, mSole];

  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;                 // bones move well outside the bind bbox
  const group = new THREE.Group();
  group.add(mesh);
  mesh.add(pelvis);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);

  // ---------- outfit detailing ----------
  // Hoodie and jacket used to be visually identical after the rig rewrite —
  // both were just "long sleeves". These are the details that actually tell
  // the two styles apart in the creator and in scene.
  if (o.topStyle === "hoodie" || o.topStyle === "jacket") {
    const foldM = new THREE.MeshPhysicalMaterial({
      color: shirtCol.clone().multiplyScalar(0.76), roughness: 0.94,
      sheen: 0.4, sheenRoughness: 0.9,
    });
    // Front surface depth at a given station height, so trims sit ON the chest
    // instead of floating off it or sinking inside.
    const frontZ = (y) => {
      let lo = torso[torso.length - 1], hi = torso[0];
      for (let i = 0; i < torso.length - 1; i++) {
        if (y <= torso[i].y && y >= torso[i + 1].y) { hi = torso[i]; lo = torso[i + 1]; break; }
      }
      const f = (y - lo.y) / Math.max(1e-4, hi.y - lo.y);
      return (lo.rz + (hi.rz - lo.rz) * f) * (0.94 + 0.06 * SW) * bt.chestZ;
    };
    const cl = (y) => y * H - chestY;                 // station height → chest-local
    if (o.topStyle === "hoodie") {
      const cowl = new THREE.Mesh(new THREE.TorusGeometry(0.098 * SW, 0.030, 12, 26), foldM);
      cowl.rotation.x = Math.PI / 2;
      cowl.scale.set(1.18, 1.0, 0.92);
      cowl.position.set(0, cl(1.330), -0.004 * H);
      cowl.castShadow = true;
      chest.add(cowl);
      const hood = new THREE.Mesh(
        new THREE.SphereGeometry(0.115 * SW, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), foldM);
      hood.scale.set(1.05, 0.95, 0.70);
      hood.rotation.x = -0.35;
      hood.position.set(0, cl(1.336), -0.085 * H);
      hood.castShadow = true;
      chest.add(hood);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(0.21 * SW, 0.105, 0.035), foldM);
      pocket.position.set(0, 0.978 * H - L.waistY, frontZ(0.978) * 0.92);
      spine.add(pocket);
      // Drawstrings
      for (const sx of [-1, 1]) {
        const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13, 6), foldM);
        cord.position.set(sx * 0.030, cl(1.285), frontZ(1.300) * 0.96);
        cord.rotation.x = -0.12;
        chest.add(cord);
      }
    } else {
      const zipM = new THREE.MeshPhysicalMaterial({
        color: shirtCol.clone().multiplyScalar(1.25), roughness: 0.42, metalness: 0.45,
      });
      // The zip follows the chest's changing depth in short segments; one long
      // straight box would sink into the sternum and poke out at the collar.
      const zy = [1.318, 1.250, 1.170, 1.090, 1.010, 0.940];
      for (let i = 0; i < zy.length - 1; i++) {
        const yMid = (zy[i] + zy[i + 1]) / 2;
        const seg = new THREE.Mesh(
          new THREE.BoxGeometry(0.020, (zy[i] - zy[i + 1]) * H + 0.004, 0.014), zipM);
        seg.position.set(0, cl(yMid), frontZ(yMid) * H + 0.004);
        chest.add(seg);
      }
      // Lapels: two angled panels folding back off the collar.
      for (const sx of [-1, 1]) {
        const lap = new THREE.Mesh(new THREE.BoxGeometry(0.080 * SW, 0.20 * H, 0.016), foldM);
        lap.position.set(sx * 0.062 * SW, cl(1.238), frontZ(1.240) * H - 0.004);
        lap.rotation.z = sx * 0.42;
        lap.rotation.y = sx * -0.20;
        lap.castShadow = true;
        chest.add(lap);
      }
      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.088 * SW, 0.020, 10, 22, Math.PI * 1.25), foldM);
      collar.rotation.x = Math.PI / 2;
      collar.rotation.z = Math.PI * 0.375;
      collar.scale.set(1.15, 1.0, 0.95);
      collar.position.set(0, cl(1.328), -0.006 * H);
      chest.add(collar);
    }
  }

  // ---------- neck ----------
  // A lathe on the neck bone rather than part of the skinned torso: it belongs
  // to the head visually and has to disappear with it in first person.
  let neckPart = null;
  {
    const pts = [];
    // A neck is not a tube. It tucks in under the jaw, runs slightly concave
    // down its length, then flares hard into the trapezius. The old six-point
    // profile was near-cylindrical, which is what made the head look posted on
    // a dowel from the side.
    // Widths matter as much as the curve: a neck reads right at roughly 75% of
    // the head's width at the jaw. At the old ~58% the head sat on a pale dowel,
    // which is the single loudest doll cue in a side view.
    const prof = [
      [1.466, .0392], [1.458, .0442], [1.446, .0472], [1.430, .0492],
      [1.410, .0505], [1.388, .0522], [1.366, .0552],
      [1.348, .0614], [1.334, .0702], [1.324, .0812],
    ];
    for (const [wy, r] of prof) pts.push(new THREE.Vector2(r * H * LW, wy * H - L.neckY));
    const neckMesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), mSkin);
    neckMesh.castShadow = true;
    neckMesh.position.z = -0.004 * H;
    neck.add(neckMesh);
    neckPart = neckMesh;
  }

  // ---------- head ----------
  const head = buildHead({
    skinColor: skinCol, hairColor: o.hairColor ?? 0x4a2c18, shirtColor: shirtCol,
    eyeColor: o.eyeColor ?? 0x3a2410, hairStyle: o.hairStyle, glasses: o.glasses,
    facialHair: o.facialHair, headwear: o.headwear, bodyType: o.bodyType,
    lowDetail: o.lowDetail,
  });
  head.scale.setScalar(bt.head * H);
  headB.add(head);
  head.userData.neckPart = neckPart;
  let hairCurtain = null;
  if (o.hairStyle === "long") {
    try {
      group.updateMatrixWorld(true);
      hairCurtain = buildHairCurtain({
        headPoint: head.userData.headPoint, headObj: head, skeleton, bindMatrix: mesh.bindMatrix,
        bones: { head: headB, neck, chest }, torso: torsoSt, H, shoulderY: armY,
        thick: 0.0165 * bt.head * H, hairMat: head.userData.materials.hairM, group,
        // The hoodie's hood (see the outfit block) — same numbers, rig space.
        bumps: o.topStyle === "hoodie" ? [{
          cy: 1.336 * H, cz: -0.085 * H,
          rx: 0.115 * SW * 1.05 + 0.01, ry: 0.115 * SW * 0.95 + 0.01, rz: 0.115 * SW * 0.70 + 0.012,
        }] : [],
      });
    } catch (e) { console.warn("[rig] hair curtain:", e); }
  }
  head.userData.hairCurtain = hairCurtain;

  // ---------- hands ----------
  const arms = [];
  for (let i = 0; i < armBones.length; i++) {
    const a = armBones[i];
    const hand = buildHand(a.side, mSkin, mShirt, { scale: H * LW * HAND_SCALE, cuff: longSleeve });
    hand.position.set(0, -0.012 * H, 0);
    // A relaxed arm hangs in mid-pronation: palm toward the thigh, thumb
    // forward, knuckles out. At -0.30 the palm faced backward with the fingers
    // fanned toward the viewer — the "reaching for you" hang that made the
    // figure read as a sleepwalker. The sign is −side: +side·1.15 (the value
    // this once had) turned the palm OUT with the thumb pointing back —
    // re-verified from both sides in the creator, 2026-09-27. Body's contact
    // palm-roll reads hand.rotation.y, so it follows this value.
    hand.rotation.y = -a.side * 1.15;
    a.wr.add(hand);
    arms.push({ root: a.sh, elbow: a.el, wrist: a.wr, hand, side: a.side });
  }
  // Sole landmarks in ANKLE-LOCAL space. The shoe is skinned rigid to the ankle
  // bone, so these points travel with it exactly — which is what lets the gait
  // engine roll the foot heel-to-toe and the ground clamp measure real contact
  // instead of guessing from the ankle joint. Derived from the same numbers the
  // shoe was swept with above (sole plane 0.004, heel −0.082, toe 0.174, plus
  // the baked-in out-toe yaw) so the two can never drift apart.
  // The sole plane is a mesh station too, so read it back through the remap —
  // hard-coding 0.004 here would have the gait rocking the foot about a
  // ground plane the shoe no longer sits on.
  const soleDrop = L.ankleY - stationY(0.004 * H);   // ankle joint above the sole
  const legs = legBones.map((g) => {
    const st = Math.sin(g.side * 0.09), ct = Math.cos(g.side * 0.09);
    const pt = (z) => new THREE.Vector3(z * H * st, -soleDrop, z * H * ct);
    return {
      hip: g.hp, knee: g.kn, foot: g.an, ankle: g.an, side: g.side,
      heelPt: pt(-0.082), ballPt: pt(0.100), toePt: pt(0.174),
    };
  });

  return {
    group, mesh, skeleton, bones, materials: { mSkin, mShirt, mPants, mShoe, mDark },
    // Bones by name. The retargeter looks joints up this way rather than
    // through arms/legs, because it maps from an external skeleton's names.
    B,
    pelvis, spine, chest, breath, neck, headBone: headB, head,
    face: head.userData.face, hairFlutter: head.userData.hairFlutter, hairCurtain,
    eyes: head.userData.eyes,
    arms, legs, bt,
    dims: {
      upperLen, foreLen, thighLen, shinLen, H, shoulderX, armY, chestY, L,
      foot: { soleDrop, heelZ: -0.082 * H, ballZ: 0.100 * H, toeZ: 0.174 * H },
    },
  };
}

// ---------- Contact shadow disc ----------
// The grounding patch under a standing figure. This used to be a flat black
// circle at uniform opacity, which is the one thing a real contact shadow
// never is: it had a crisp rim, so it read as a decal stuck to the floor
// rather than as darkness gathering under a body — and it sat there at full
// strength even in rooms where the key light was already casting a true
// shadow, laying an ellipse over the real one.
//
// A radial falloff fixes both. Darkest directly beneath the figure where the
// floor is most occluded, gone by the rim, with the drop biased toward the
// centre (the stops are not linear) because ambient occlusion falls off fast
// — a linear fade reads as fog, not contact. One canvas, cached for the life
// of the page, shared by every figure that needs one.
//
// The ramp runs WHITE→BLACK and is fully opaque: three.js reads an alphaMap
// from the texture's GREEN channel, not from its alpha, so the intuitive
// "black fading to transparent" gradient yields green=0 everywhere, i.e. a
// disc that is uniformly invisible. White is opaque here, black is clear.
// Absolute angle between two headings, in [0, π]. FPControls never wraps its
// yaw, and JS `%` keeps the sign of the dividend, so the old inline
// `(a − b + 3π) % 2π − π` went negative after ~1.5 net turns to the right —
// every "is the player looking at it" test then read "no" for the rest of
// the visit (the dog's stare response and the gaze fear input went dead).
function angleGap(a, b) {
  const TAU = Math.PI * 2;
  let d = (a - b) % TAU;
  if (d < 0) d += TAU;
  return Math.abs(d > Math.PI ? d - TAU : d);
}

let _contactShadowTex = null;
function getContactShadowTex() {
  if (_contactShadowTex) return _contactShadowTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.00, "#ffffff");
  grad.addColorStop(0.35, "#b8b8b8");
  grad.addColorStop(0.62, "#4d4d4d");
  grad.addColorStop(0.84, "#121212");
  grad.addColorStop(1.00, "#000000");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  _contactShadowTex = new THREE.CanvasTexture(c);
  return _contactShadowTex;
}
// ---------- Private light rigs ----------
// The traveler carries a three-point portrait rig in third person (and the
// first-person hands a faint fill) so they never go to silhouette in a dim
// room. Those were scene PointLights, and three.js forward rendering runs
// every point light for every lit pixel on screen — range only fades the
// result, it doesn't skip the work — so three lamps that could not reach
// past the character's shoulders were shaded across the entire room. Worse,
// toggling first/third person changed the scene's light count, which
// recompiles every lit material in the scene: a visible hitch on the camera
// toggle (programs measured 47 → 88).
//
// A private rig is the same lights with the same maths (the material's own
// RE_Direct BRDF and three's distance falloff), injected into ONLY the
// materials that should see them. Scene light counts never change, and the
// rest of the room pays nothing.
const PRIVATE_RIG_N = 3;
function makePrivateRig() {
  return {
    uniforms: {
      uPrivPosW: { value: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()] },
      uPrivCol: { value: [new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0), new THREE.Color(0, 0, 0)] },
      uPrivDist: { value: [1, 1, 1] },
    },
    // Slot i ← world position, colour × intensity, cutoff distance.
    set(i, pos, color, intensity, dist) {
      this.uniforms.uPrivPosW.value[i].copy(pos);
      this.uniforms.uPrivCol.value[i].copy(color).multiplyScalar(Math.max(0, intensity));
      this.uniforms.uPrivDist.value[i] = dist;
    },
    off(i) { this.uniforms.uPrivCol.value[i].setRGB(0, 0, 0); },
  };
}
function applyPrivateRig(root, rig) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
      if (!m || m._privRig || m.isShaderMaterial) continue;
      m._privRig = rig;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = function (shader, renderer) {
        if (prev) prev.call(this, shader, renderer);
        if (shader.fragmentShader.indexOf("#include <lights_fragment_begin>") < 0) return;
        Object.assign(shader.uniforms, rig.uniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>
uniform vec3 uPrivPosW[${PRIVATE_RIG_N}];
uniform vec3 uPrivCol[${PRIVATE_RIG_N}];
uniform float uPrivDist[${PRIVATE_RIG_N}];`)
          .replace("#include <lights_fragment_begin>", `#include <lights_fragment_begin>
#if defined( RE_Direct )
for (int pi = 0; pi < ${PRIVATE_RIG_N}; pi++) {
  if (uPrivCol[pi].r + uPrivCol[pi].g + uPrivCol[pi].b <= 0.0) continue;
  vec3 plv = (viewMatrix * vec4(uPrivPosW[pi], 1.0)).xyz - geometryPosition;
  float pld = length(plv);
  IncidentLight privL;
  privL.direction = plv / max(pld, 1e-4);
  privL.color = uPrivCol[pi] * getDistanceAttenuation(pld, uPrivDist[pi], 2.0);
  privL.visible = true;
  RE_Direct( privL, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
}
#endif`);
      };
      const prevKey = m.customProgramCacheKey;
      m.customProgramCacheKey = function () {
        return (prevKey ? prevKey.call(this) : "") + "|privRig" + PRIVATE_RIG_N;
      };
      m.needsUpdate = true;
    }
  });
}

// Builds the disc itself. `r` is the world radius, `strength` the peak opacity
// at the centre.
function makeContactShadow(r, strength) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 28),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      alphaMap: getContactShadowTex(),
      transparent: true, opacity: strength,
      depthWrite: false,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.set(0, 0.005, 0);
  // renderOrder must be POSITIVE. It was -1, which sorted the disc ahead of
  // the room's opaque geometry: with depthWrite off it left no depth behind
  // it, so the floor then drew straight over the top and the contact shadow
  // was never visible in any scene. Drawing after the opaque pass is what a
  // ground decal wants — it still writes no depth, so it never occludes the
  // feet standing on it.
  m.renderOrder = 1;
  m.userData.noCollide = true;
  return m;
}

// ---------- Soft window sunbeam ----------
// A shaft of light has no surface. A flat-shaded open cone draws its
// silhouette as a hard line across the room — a grey glass sheet hanging in
// the air. This shader fakes the volume instead: brightness follows how
// squarely you look through the cone (edge-on → zero, so there is no edge), is
// strongest at the window and thins toward the floor, and carries a slow
// drifting unevenness like air with dust in it.
//
// Shared by the dog room and the arrival/traveler room (ShellScenes), which
// renders straight to the canvas instead of through a composer — hence the
// tone-mapping and colour-space chunks: into the dog room's linear render
// target they compile to nothing, straight to the canvas they keep the beam
// on the same ACES curve as the MeshBasicMaterial it replaces.
// `origin` is the window centre, `dir` the key light's travel direction,
// `len` the distance to the floor along it, `opts.wallZ` the z of the
// window wall (room interior on +z); set `.userData.uTime.value` per frame
// to animate the drift (optional — it reads fine frozen).
function makeSoftSunbeam(origin, dir, len, opts = {}) {
  const uTime = { value: 0 };
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(opts.rTop ?? 0.55, opts.rBottom ?? 0.95, len, opts.segments ?? 24, 1, true),
    new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(opts.color ?? 0xffe0b4) },
        uOpacity: { value: opts.opacity ?? 0.05 },
        uTime,
        // Window wall as (normal, constant): signed distance = n·p + w.
        // Default is "no wall" (distance 1 everywhere).
        uPlane: { value: opts.wallZ != null
          ? new THREE.Vector4(0, 0, 1, -opts.wallZ)
          : new THREE.Vector4(0, 0, 0, 1) },
      },
      vertexShader: `
        varying vec3 vN; varying vec3 vV; varying float vT; varying vec3 vW;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vN = normalize(mat3(modelMatrix) * normal);
          vV = normalize(cameraPosition - wp.xyz);
          vT = uv.y;
          vW = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uColor; uniform float uOpacity; uniform float uTime; uniform vec4 uPlane;
        varying vec3 vN; varying vec3 vV; varying float vT; varying vec3 vW;
        void main() {
          float facing = abs(dot(normalize(vN), normalize(vV)));
          float core = facing * facing * facing;
          // Both ends of the open cone must fade, or the tube's rim reads.
          // The window end is tilted against the wall: part of its rim sits
          // ~0.2 m behind the wall, where the depth test cut it along the
          // glass as a pale arc, and part up to ~0.5 m in front, where the
          // tube simply stopped. So: a fade over the last 12 % of the length,
          // and a fade to zero at the wall plane.
          float along = smoothstep(0.0, 0.35, vT) * (0.45 + 0.55 * vT)
                      * (1.0 - smoothstep(0.88, 1.0, vT));
          float wall = smoothstep(0.0, 0.3, dot(uPlane.xyz, vW) + uPlane.w);
          float drift = 0.82 + 0.18 * sin(vW.x * 3.1 + vW.z * 2.3 + uTime * 0.35)
                              * sin(vW.y * 4.7 - uTime * 0.22);
          gl_FragColor = vec4(uColor * (uOpacity * 2.6 * core * along * wall * drift), 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  // Kept out of screen-space AO: the SSAO normal pass draws every mesh as
  // solid, and it outlined the beam with dark halos.
  beam.userData.ssaoSkip = true;
  beam.userData.noCollide = true;
  beam.userData.noPick = true;
  beam.userData.uTime = uTime;
  beam.position.copy(origin).addScaledVector(dir, len / 2);
  beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().negate());
  return beam;
}

export { buildHand, ANKLE_Y, KNEE_Y, HIP_Y, WAIST_Y, NECK_Y, CHEST_TOP_Y, SHOULDER_HALF, buildHumanRig, angleGap, makePrivateRig, applyPrivateRig, makeContactShadow, makeSoftSunbeam };
