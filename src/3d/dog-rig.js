// DogLegRig — foot-planted IK for the dog's legs — and the gait-clip
// corrections it relies on.

import * as THREE from "three";

// ---------- Dog leg rig: paw placement + analytic leg IK ----------
// The Quaternius dogs carry two leg systems at once. The FK chains hang off
// the Body bone (FrontUpperLeg → FrontLowerLeg; BackLeg → BackUpperLeg →
// BackLowerLeg), but the PAWS are skinned to separate IK target bones
// (IKFrontLeg / IKBackLeg) parented straight to the armature root. The clips
// were baked from Blender with IK on, so in every clip frame the tip of each
// FK chain sits exactly on its paw bone (measured: 0.867 / 0.44 units along
// the last bone's +Y in Idle, Walk and Gallop alike) — and nothing else keeps
// the two together at runtime.
//
// That split is the cause of the dog's oldest visual bug. Every procedural
// pose (sit, lie, crouch, the walk bob) moved the body and the FK legs while
// the paws stayed wherever the clip left them, and the ground clamp measured
// only the coat mesh — the paws are a separate "white socks" mesh — so it
// pushed the whole dog down until the coat touched the boards. Measured on
// the live rig: paws 8 cm under the floor standing, 6–8 cm walking, 15 cm
// lying, and "sit" was a standing dog sunk to its knees with its torso
// tilted, which reads as a dog frozen mid-leap.
//
// This class owns the legs instead. Each frame, after the clip and the
// procedural layers have posed the skeleton, it decides where every paw
// SHOULD be — on the floor at its clip height, held where it touched down
// while the body moves over it, stepped to a new spot when a standing dog
// turns, or placed by a sit / lie — moves the paw bone there and re-solves
// the leg chain to reach it analytically. Body offsets now bend the legs
// instead of burying the feet, and sit and lie are real whole-body poses.
const _dlA = new THREE.Vector3(), _dlB = new THREE.Vector3(), _dlC = new THREE.Vector3();
const _dlT = new THREE.Vector3(), _dlE = new THREE.Vector3(), _dlN = new THREE.Vector3();
const _dlU = new THREE.Vector3(), _dlW = new THREE.Vector3(), _dlP = new THREE.Vector3();
const _dlH = new THREE.Vector3(), _dlH2 = new THREE.Vector3(), _dlPaw = new THREE.Vector3();
const _dlOut = new THREE.Vector3(), _dlPole = new THREE.Vector3(), _dlMeta = new THREE.Vector3();
const _dlTmp = new THREE.Vector3(), _dlScl = new THREE.Vector3(), _dlLoc = new THREE.Vector3();
const _dlQ = new THREE.Quaternion(), _dlQw = new THREE.Quaternion(), _dlQp = new THREE.Quaternion();
const _dlQd = new THREE.Quaternion();
const _dlR = new THREE.Vector3(), _dlR2 = new THREE.Vector3();
const _dlM = new THREE.Matrix4(), _dlM2 = new THREE.Matrix4(), _dlM3 = new THREE.Matrix4();

// Swing `bone` by a WORLD-space rotation about its own head.
function _dlRotateWorld(bone, qWorld) {
  bone.getWorldQuaternion(_dlQw);
  _dlQw.premultiply(qWorld);
  bone.parent.getWorldQuaternion(_dlQp).invert();
  bone.quaternion.copy(_dlQp.multiply(_dlQw));
  bone.updateMatrixWorld(true);
}

// Two-bone analytic IK in world space. Rotates `a` (root) then `b` (mid) so
// that the point `endLocal` (in b's frame) lands on `target`, bending in the
// plane that already holds the joint — nudged toward `pole` so a near-straight
// leg can never flip its knee. Writes the end's reached position into `out`
// (the target, or the nearest point the chain can reach).
function _dlSolve2(a, b, endLocal, target, pole, out) {
  const A = a.getWorldPosition(_dlA);
  const B = b.getWorldPosition(_dlB);
  const C = _dlC.copy(endLocal); b.localToWorld(C);
  const l0 = A.distanceTo(B), l1 = B.distanceTo(C);
  const dir = _dlT.subVectors(target, A);
  let dist = dir.length();
  if (dist < 1e-6 || l0 < 1e-6 || l1 < 1e-6) return out.copy(C);
  dir.multiplyScalar(1 / dist);
  dist = Math.min(l0 + l1 - 1e-5, Math.max(Math.abs(l0 - l1) + 1e-5, dist));
  const e = _dlE.subVectors(B, A).addScaledVector(pole, 0.25 * l0);
  e.addScaledVector(dir, -e.dot(dir));
  if (e.lengthSq() < 1e-14) return out.copy(C);
  e.normalize();
  const cosA = Math.min(1, Math.max(-1, (l0 * l0 + dist * dist - l1 * l1) / (2 * l0 * dist)));
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  // Where the middle joint has to be, then swing the root onto it…
  _dlN.copy(A).addScaledVector(dir, l0 * cosA).addScaledVector(e, l0 * sinA);
  _dlU.subVectors(B, A).normalize();
  _dlW.subVectors(_dlN, A).normalize();
  _dlQ.setFromUnitVectors(_dlU, _dlW);
  _dlRotateWorld(a, _dlQ);
  // …and the middle bone so its tip lands on the reachable target.
  const Bn = b.getWorldPosition(_dlB);
  const Cn = _dlC.copy(endLocal); b.localToWorld(Cn);
  const reach = _dlP.copy(A).addScaledVector(dir, dist);
  _dlU.subVectors(Cn, Bn).normalize();
  _dlW.subVectors(reach, Bn).normalize();
  _dlQ.setFromUnitVectors(_dlU, _dlW);
  _dlRotateWorld(b, _dlQ);
  out.copy(endLocal); b.localToWorld(out);
  return out;
}

const _dlSmooth = (x) => x * x * (3 - 2 * x);

class DogLegRig {
  // Measured once in buildDog on the scaled model, posed at Idle frame 0 and
  // not yet parented — so "world" there IS dog-local space. Everything the
  // runtime needs as a rest reference comes from here, never from the live
  // pose (which by then has procedural offsets in it).
  static calibrate(model) {
    const find = (n) => model.getObjectByName(n);
    const body = find("Body");
    if (!body || !body.parent) return null;
    model.updateMatrixWorld(true);
    const W = (b) => b.getWorldPosition(new THREE.Vector3());
    const cal = {
      S: body.parent.matrixWorld.getMaxScaleOnAxis(),   // world metres per armature unit
      legs: {},
    };
    for (const s of ["L", "R"]) {
      const fu = find("FrontUpperLeg" + s), fl = find("FrontLowerLeg" + s), fik = find("IKFrontLeg" + s);
      const hf = find("BackLeg" + s), ht = find("BackUpperLeg" + s), hm = find("BackLowerLeg" + s), hik = find("IKBackLeg" + s);
      if (!fu || !fl || !fik || !hf || !ht || !hm || !hik) return null;
      cal.legs["front" + s] = {
        restArmY: fik.position.y,
        restLocal: W(fik),
        endLocal: fl.worldToLocal(W(fik)),
        reach: W(fu).distanceTo(W(fl)) + W(fl).distanceTo(W(fik)),
      };
      cal.legs["hind" + s] = {
        restArmY: hik.position.y,
        restLocal: W(hik),
        endLocal: hm.worldToLocal(W(hik)),
        metaLen: W(hm).distanceTo(W(hik)),
        reach: W(hf).distanceTo(W(ht)) + W(ht).distanceTo(W(hm)) + W(hm).distanceTo(W(hik)),
      };
    }
    // Torso landmarks: the hip joints and the shoulder joints, midpoints.
    const mid = (a, b) => W(find(a)).add(W(find(b))).multiplyScalar(0.5);
    cal.hip0 = mid("BackShoulderL", "BackShoulderR");
    cal.sh0 = mid("FrontShoulderL", "FrontShoulderR");
    cal.torsoLen = Math.hypot(cal.sh0.y - cal.hip0.y, cal.sh0.z - cal.hip0.z);
    cal.phi0 = Math.atan2(cal.sh0.y - cal.hip0.y, cal.sh0.z - cal.hip0.z);
    cal.clipMin = {};
    return cal;
  }
  // Each clip plants its paws at its own height: the gallop's forepaws never
  // come down to the Idle stance height (+0.2–1.4 cm) and its hind paws go
  // ~1 cm below it. Contact is judged against the clip's own lowest point,
  // per paw, sampled once here — otherwise the galloping forepaws never read
  // as planted and skated through every stance.
  static calibrateClips(model, mixer, actions, cal, names) {
    if (!cal) return;
    const iks = {};
    for (const s of ["L", "R"]) {
      iks["front" + s] = model.getObjectByName("IKFrontLeg" + s);
      iks["hind" + s] = model.getObjectByName("IKBackLeg" + s);
    }
    for (const name of names) {
      const act = actions[name];
      if (!act) continue;
      for (const k in actions) actions[k].stop();
      act.reset(); act.setEffectiveWeight(1); act.timeScale = 1; act.play();
      const dur = act.getClip().duration, N = 40;
      const mins = {};
      for (let i = 0; i <= N; i++) {
        mixer.setTime(dur * i / N);
        for (const key in iks) {
          const y = iks[key] ? iks[key].position.y : Infinity;
          if (!(key in mins) || y < mins[key]) mins[key] = y;
        }
      }
      act.stop(); act.reset();
      cal.clipMin[name] = mins;
    }
  }

  constructor(dog, model, cal, height) {
    this.dog = dog; this.model = model; this.cal = cal; this.ok = false;
    this.H = height || 0.6;
    const find = (n) => model.getObjectByName(n);
    this.body = find("Body");
    this.armature = this.body && this.body.parent;
    this.neck = find("Neck1");
    this.head = find("Head");
    const legs = [];
    for (const s of ["L", "R"]) {
      legs.push({ kind: "front", side: s, key: "front" + s,
        chain: [find("FrontUpperLeg" + s), find("FrontLowerLeg" + s)], ik: find("IKFrontLeg" + s) });
      legs.push({ kind: "hind", side: s, key: "hind" + s,
        chain: [find("BackLeg" + s), find("BackUpperLeg" + s), find("BackLowerLeg" + s)], ik: find("IKBackLeg" + s) });
    }
    if (!this.body || !this.armature || !cal || legs.some((l) => !l.ik || l.chain.some((b) => !b))) return;
    for (const l of legs) {
      const c = cal.legs[l.key];
      Object.assign(l, {
        restArmY: c.restArmY, restLocal: c.restLocal, endLocal: c.endLocal,
        metaLen: c.metaLen || 0, reach: c.reach,
        restH: c.restLocal.y,          // paw bone height above the floor, standing
        // Stance test: a paw within this of its resting height is on the
        // ground. Relative to the paw bone's own height so it scales by breed.
        contactTol: c.restLocal.y * 0.22,
        locked: false, lockW: 0, lockX: 0, lockZ: 0,
        relT: 1, relX: 0, relZ: 0,
        step: null, wasStance: true,
      });
    }
    const by = {};
    legs.forEach((l) => { by[l.key] = l; });
    by.frontL.diag = by.hindR; by.hindR.diag = by.frontL;
    by.frontR.diag = by.hindL; by.hindL.diag = by.frontR;
    this.legs = legs;
    // Every bone this class writes. restore() hands the mixer back the clean
    // clip pose before it runs: three.js PropertyMixer only writes a track
    // whose value CHANGED, so an edit left on a bone over a flat keyframe
    // span would otherwise survive into the next frame and compound.
    this._touched = [];
    const touch = (b, pos) => this._touched.push({ b, pos, p: b.position.clone(), q: b.quaternion.clone() });
    touch(this.body, true);
    if (this.neck) touch(this.neck, false);
    if (this.head) touch(this.head, false);
    for (const l of legs) { l.chain.forEach((b) => touch(b, false)); touch(l.ik, true); }
    this._lastX = dog.position.x; this._lastZ = dog.position.z;
    this._poseW = 0; this._poseSettleT = 0;
    this.stepping = 0;
    this.ok = true;
  }

  restore() {
    for (const e of this._touched) { if (e.pos) e.b.position.copy(e.p); e.b.quaternion.copy(e.q); }
  }
  capture() {
    for (const e of this._touched) { if (e.pos) e.p.copy(e.b.position); e.q.copy(e.b.quaternion); }
  }
  // Forget every planted paw — after a teleport or a scene reposition.
  unlockAll() {
    for (const l of this.legs) { l.locked = false; l.lockW = 0; l.relT = 1; l.step = null; }
  }

  // Sit and lie are defined by where two torso landmarks end up: the hip
  // joints come down toward the floor and the shoulders hold (sit) or drop
  // with them (lie). The rigid transform that carries the standing
  // landmarks there is applied to the Body bone — so the spine, neck, head
  // and tail all come along — and the legs are then solved to their paws.
  _poseLandmarks(ws, wl, out) {
    const c = this.cal;
    // Hip heights: the rig's tibia is twice its femur, so the hind leg can't
    // fold tighter than ~|tibia − femur| hip-to-hock; below ~0.38 of the
    // standing hip height the hock target becomes unreachable.
    const hipY = c.hip0.y + (0.38 * c.hip0.y - c.hip0.y) * ws + (0.35 * c.hip0.y - c.hip0.y) * wl;
    const shY = c.sh0.y + (0.93 * c.sh0.y - c.sh0.y) * ws + (0.36 * c.sh0.y - c.sh0.y) * wl;
    const shZ = c.sh0.z + (-0.03 * c.torsoLen) * ws + (0.04 * c.torsoLen) * wl;
    const L = c.torsoLen;
    const phi = Math.asin(Math.max(-0.95, Math.min(0.95, (shY - hipY) / L)));
    out.hipY = hipY; out.shY = shY; out.shZ = shZ;
    out.hipZ = shZ - L * Math.cos(phi);
    out.pitchUp = phi - c.phi0;
    return out;
  }

  _applyBodyPose(lm) {
    const c = this.cal;
    // D (dog-local) = T(hipTarget) · Rx(−pitchUp) · T(−hip0). Positive
    // pitchUp raises the nose: a rotation about +X by −a lifts z > 0.
    _dlM.makeTranslation(-c.hip0.x, -c.hip0.y, -c.hip0.z);
    _dlM2.makeRotationX(-lm.pitchUp).multiply(_dlM);
    _dlM.makeTranslation(c.hip0.x, lm.hipY, lm.hipZ).multiply(_dlM2);
    // World: Body' = Mdog · D · Mdog⁻¹ · Body; local = Armature⁻¹ · Body'.
    const dogW = this.dog.matrixWorld;
    _dlM2.copy(dogW).multiply(_dlM).multiply(_dlM3.copy(dogW).invert());
    _dlM2.multiply(this.body.matrixWorld);
    _dlM3.copy(this.armature.matrixWorld).invert().multiply(_dlM2);
    _dlM3.decompose(this.body.position, this.body.quaternion, _dlScl);
    this.body.updateMatrixWorld(true);
  }

  // Where a paw goes in a pose (dog-local), blended stand → sit → lie.
  _poseTarget(leg, ws, wl, lmS, lmL, out) {
    const r = leg.restLocal, c = this.cal;
    let sx, sz, lx, lz;
    if (leg.kind === "front") {
      // Sit: forelegs stay straight columns under the shoulders.
      sx = r.x; sz = r.z + (lmS.shZ - c.sh0.z);
      // Lie: forearms flat on the boards, paws out in front of the chest.
      lx = r.x * 0.9; lz = lmL.shZ + leg.reach * 0.62;
    } else {
      // Hind paws come forward beside the haunches, hocks on the floor.
      sx = r.x * 1.18; sz = lmS.hipZ + 0.34 * c.torsoLen;
      lx = r.x * 1.25; lz = lmL.hipZ + 0.32 * c.torsoLen;
    }
    out.set(r.x + (sx - r.x) * ws + (lx - r.x) * wl, r.y, r.z + (sz - r.z) * ws + (lz - r.z) * wl);
    return out;
  }

  // o: { d, floorY, sit, lie, moving, allowStep, onPlant(strength) }
  update(o) {
    const d = Math.max(0, Math.min(0.05, o.d || 0.016));
    const dog = this.dog;
    dog.updateWorldMatrix(true, true);
    // A dog that moved more than a stride in one frame was repositioned by
    // the scene, not walked: drop every plant rather than drag four paws
    // across the room.
    if (Math.hypot(dog.position.x - this._lastX, dog.position.z - this._lastZ) > 0.35) this.unlockAll();
    this._lastX = dog.position.x; this._lastZ = dog.position.z;

    const ws = Math.max(0, Math.min(1, o.sit || 0));
    const wl = Math.max(0, Math.min(1, o.lie || 0));
    const poseW = Math.max(ws, wl);
    // A pose in transition moves its paw targets; while it does, paws glide
    // to them on a low arc instead of locking and re-stepping every frame.
    const poseMoving = Math.abs(poseW - this._poseW) > d * 0.05;
    this._poseW = poseW;
    this._poseSettleT = poseMoving ? 0 : this._poseSettleT + d;

    // Metatarsus direction from the clip, taken BEFORE the body pose
    // rotates the hind chains.
    const mdClip = this._mdClip || (this._mdClip = {});
    for (const l of this.legs) {
      if (l.kind !== "hind") continue;
      const m = l.chain[2];
      const H = m.getWorldPosition(_dlH);
      const E = _dlE.copy(l.endLocal); m.localToWorld(E);
      (mdClip[l.key] || (mdClip[l.key] = new THREE.Vector3())).subVectors(E, H).normalize();
    }

    let lmS = null, lmL = null;
    if (poseW > 0.001) {
      lmS = this._lmS || (this._lmS = this._poseLandmarks(1, 0, {}));
      lmL = this._lmL || (this._lmL = this._poseLandmarks(0, 1, {}));
      this._applyBodyPose(this._poseLandmarks(ws, wl, this._lmNow || (this._lmNow = {})));
      // Keep the head near level: the body pitched nose-up for the sit, so
      // hand most of that back through the neck and head.
      const pu = this._lmNow.pitchUp;
      if (this.neck) this.neck.rotateX(-0.42 * pu);
      if (this.head) this.head.rotateX(-0.30 * pu);
      if (this.neck) this.neck.updateMatrixWorld(true);
    }

    const S = this.cal.S;
    const q = dog.quaternion;
    let stepping = 0;
    for (const l of this.legs) if (l.step) stepping++;
    const stepDur = 0.19 + 0.07 * Math.min(1.5, this.H);
    const stepH = 0.075 * this.H;
    for (const l of this.legs) {
      // 1) The clip's paw, grounded. Its lift above rest is read in armature
      //    space, so the walk bob, crouches and the turning bank — all of
      //    which move the armature — never lift or bury a paw.
      const P = l.ik.getWorldPosition(_dlPaw);
      const cm = o.clip && this.cal.clipMin ? this.cal.clipMin[o.clip] : null;
      const base = cm && isFinite(cm[l.key]) ? cm[l.key] : l.restArmY;
      let lift = Math.max(0, (l.ik.position.y - base) * S);
      if (poseW > 0.001) {
        this._poseTarget(l, ws, wl, lmS, lmL, _dlLoc);
        dog.localToWorld(_dlLoc);
        P.x += (_dlLoc.x - P.x) * poseW;
        P.z += (_dlLoc.z - P.z) * poseW;
        lift *= 1 - poseW;
        // A pose on its way in or out carries the paws on a low arc.
        if (poseMoving) lift += Math.sin(Math.PI * Math.min(1, poseW)) * 0.35 * stepH;
      }
      P.y = o.floorY + l.restH + lift;
      const stance = lift < l.contactTol && !poseMoving;
      // Can the leg actually reach where this paw wants to plant? At the
      // extremes of a stride the clips put the forelegs at full extension,
      // and a paw pinned a centimetre past it is dragged along by the leg
      // for the rest of the stance. Such a paw plants a frame or two later,
      // once the body has come over it, and lets go early at the back.
      let reachable = true;
      if (poseW < 0.3) {
        const A = l.chain[0].getWorldPosition(_dlR);
        const md = l.kind === "hind" ? mdClip[l.key] : null;
        const tgt = md ? _dlR2.copy(P).addScaledVector(md, -l.metaLen) : P;
        const lim = 0.985 * (l.reach - (md ? l.metaLen : 0));
        reachable = A.distanceTo(tgt) <= lim;
      }

      // 2) Planting. A paw that touches down stays where it touched down
      //    while the body travels and turns over it.
      if (l.step) {
        l.step.t = Math.min(1, l.step.t + d / stepDur);
        const k = _dlSmooth(l.step.t);
        // Land a little beyond the new spot, in the direction the body is
        // turning, so a slow pivot needs fewer steps.
        const tx = P.x + (P.x - l.step.fx) * 0.3, tz = P.z + (P.z - l.step.fz) * 0.3;
        P.x = l.step.fx + (tx - l.step.fx) * k;
        P.z = l.step.fz + (tz - l.step.fz) * k;
        P.y += Math.sin(Math.PI * l.step.t) * stepH;
        if (l.step.t >= 1) {
          l.step = null;
          l.locked = true; l.lockW = 1; l.lockX = P.x; l.lockZ = P.z;
          if (o.onPlant) { try { o.onPlant(0.25); } catch {} }
        }
      } else if (stance && reachable) {
        if (!l.locked) {
          l.locked = true; l.lockW = 0; l.lockX = P.x; l.lockZ = P.z;
          if (!l.wasStance && o.moving && o.onPlant) { try { o.onPlant(1); } catch {} }
        }
        l.lockW = Math.min(1, l.lockW + d / 0.05);
        const ex = P.x - l.lockX, ez = P.z - l.lockZ;
        const err = Math.hypot(ex, ez);
        const stepTh = 0.2 * l.reach;
        const canStep = o.allowStep && (stepping === 0 || (stepping === 1 && l.diag && l.diag.step));
        if (!o.moving && err > stepTh && canStep) {
          l.step = { t: 0, fx: l.lockX, fz: l.lockZ };
          l.locked = false;
          stepping++;
          P.x = l.lockX; P.z = l.lockZ;
        } else {
          // Slip allowance: while travelling (or when a step isn't allowed)
          // the leg may twist this far from its clip placement, no further.
          const maxErr = (o.moving ? 0.34 : 0.45) * l.reach;
          if (err > maxErr) {
            const k = 1 - maxErr / err;
            l.lockX += ex * k; l.lockZ += ez * k;
          }
          P.x += (l.lockX - P.x) * l.lockW;
          P.z += (l.lockZ - P.z) * l.lockW;
        }
      } else if (l.locked) {
        // Lift-off: release from the plant and blend back onto the clip's
        // swing over a tenth of a second (in the air, so it never reads).
        l.locked = false; l.relT = 0; l.relX = l.lockX; l.relZ = l.lockZ;
      }
      if (!l.locked && !l.step && l.relT < 1) {
        l.relT = Math.min(1, l.relT + d / 0.12);
        const k = _dlSmooth(l.relT);
        P.x = l.relX + (P.x - l.relX) * k;
        P.z = l.relZ + (P.z - l.relZ) * k;
      }
      l.wasStance = stance;

      // 3) Solve the chain to the paw and move the paw bone to what it reached.
      if (l.kind === "front") {
        // Elbows bend back — and down toward the boards when lying.
        _dlPole.set(0, -0.6 * wl, -1).normalize().applyQuaternion(q);
        _dlSolve2(l.chain[0], l.chain[1], l.endLocal, P, _dlPole, _dlOut);
      } else {
        // Stifles forward (and up, folded, in a sit or lie); the metatarsus
        // keeps its clip angle standing and lies along the floor posed.
        _dlPole.set(0, 0.5 * poseW, 1).normalize().applyQuaternion(q);
        _dlMeta.copy(mdClip[l.key]);
        if (poseW > 0.001) {
          _dlTmp.set(0, 0.14, 1).normalize().applyQuaternion(q);
          _dlMeta.lerp(_dlTmp, poseW).normalize();
        }
        const [f, t, m] = l.chain;
        _dlH2.copy(P).addScaledVector(_dlMeta, -l.metaLen);
        _dlSolve2(f, t, m.position, _dlH2, _dlPole, _dlH);
        const Hn = m.getWorldPosition(_dlH);
        const En = _dlE.copy(l.endLocal); m.localToWorld(En);
        _dlU.subVectors(En, Hn).normalize();
        _dlW.subVectors(P, Hn).normalize();
        _dlQd.setFromUnitVectors(_dlU, _dlW);
        _dlRotateWorld(m, _dlQd);
        _dlOut.copy(l.endLocal); m.localToWorld(_dlOut);
      }
      _dlTmp.copy(_dlOut);
      l.ik.parent.worldToLocal(_dlTmp);
      l.ik.position.copy(_dlTmp);
      l.ik.updateMatrixWorld(true);
    }
    this.stepping = stepping;
  }
}

// The pack's gait clips are in-place animations whose FOREPAWS sweep back
// through stance at only ~2/3 the speed of the hind paws (measured at
// timeScale 1 on the 0.56 m shiba: Walk 0.30 vs 0.45 m/s, Gallop 0.8–1.3 vs
// 1.9). No single playback rate can plant both ends of such a dog — match
// the hinds and the forepaws skate forward, match the average and both
// ends skate — and a paw the leg rig pins to the floor drifts out of its
// leg's reach within a stance. Real paws in stance all move at body speed.
// So each paw's fore-aft track is rescaled about its stance centre until
// all four sweep at one common speed. That speed is the FOREPAWS', never
// more: the front leg is a near-straight column that is already at full
// extension at touchdown and lift-off in these clips (measured 22.2 of 22.3
// cm), so a longer fore stride can't be reached and the pinned paw would be
// dragged. The hind legs have reach to spare, so they give up stride
// instead (never below 0.6×). Returns the corrected clip and its ground
// speed at timeScale 1, in armature units per second.
function correctDogGaitClip(clip) {
  const D = clip.duration;
  const PAW = /^IK(Front|Back)Leg[LR]$/;
  const N = 96;
  const info = [];
  for (const tr of clip.tracks) {
    const dot = tr.name.lastIndexOf(".");
    const node = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
    if (!PAW.test(node) || prop !== "position") continue;
    const it = tr.createInterpolant();
    const ys = new Float32Array(N), zs = new Float32Array(N);
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < N; i++) {
      const v = it.evaluate(D * i / N);
      ys[i] = v[1]; zs[i] = v[2];
      if (v[1] < yMin) yMin = v[1];
      if (v[1] > yMax) yMax = v[1];
    }
    const tol = yMin + 0.15 * (yMax - yMin);
    let sweep = 0, n = 0, zSum = 0;
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      if (ys[i] < tol && ys[j] < tol) { sweep += zs[i] - zs[j]; n++; zSum += zs[i]; }
    }
    if (n < 3 || !(sweep > 0)) continue;
    info.push({ tr, front: /Front/.test(node), speed: sweep / (n / N * D), zc: zSum / n });
  }
  if (info.length !== 4) return { clip, speed: null };
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const vStar = mean(info.filter((e) => e.front).map((e) => e.speed));
  const kOf = (e) => Math.max(0.6, Math.min(1.0, vStar / e.speed));
  const tracks = clip.tracks.map((tr) => {
    const e = info.find((x) => x.tr === tr);
    if (!e) return tr.clone();
    const k = kOf(e);
    const values = Float32Array.from(tr.values);
    for (let i = 0; i < tr.times.length; i++) values[i * 3 + 2] = e.zc + (values[i * 3 + 2] - e.zc) * k;
    return new tr.constructor(tr.name, Float32Array.from(tr.times), values);
  });
  return {
    clip: new THREE.AnimationClip(clip.name, D, tracks),
    speed: mean(info.map((e) => e.speed * kOf(e))),
  };
}

// A trot, synthesised from the walk. The pack ships Walk and Gallop and
// nothing between, so a following dog either churned the walk at double
// speed or broke into a full gallop to keep up with someone strolling — the
// "zoomies in a living room" look. A trot is the gait a dog actually uses
// there, and its defining feature is timing: diagonal pairs (left fore +
// right hind, right fore + left hind) land together. The walk's footfalls,
// measured on the clip, go RH 0.28 → RF 0.50 → LH 0.78 → LF 0.94 — delay the
// forelegs by ~0.31 of a cycle and RF lands with LH, LF with RH. A trot also
// reaches further and lifts higher than a walk, so the paw tracks are
// stretched about their mean and raised above their floor; the leg rig
// re-solves the FK chains to the new paws every frame, so the legs follow.
function synthDogTrot(walkClip, opts = {}) {
  const D = walkClip.duration;
  const shift = opts.shift != null ? opts.shift : 0.31;
  const strideGain = opts.strideGain || 1.3;
  const liftGain = opts.liftGain || 1.4;
  const FRONT = /^(FrontShoulder|FrontUpperLeg|FrontLowerLeg|IKFrontLeg|FF|PoleTarget)[LR]$/;
  const PAW = /^IK(Front|Back)Leg[LR]$/;
  const tracks = walkClip.tracks.map((tr) => {
    const dot = tr.name.lastIndexOf(".");
    const node = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
    const front = FRONT.test(node);
    const paw = PAW.test(node) && prop === "position";
    if (!front && !paw) return tr.clone();
    const interp = tr.createInterpolant();
    const size = tr.getValueSize();
    const times = Float32Array.from(tr.times);
    const values = new Float32Array(times.length * size);
    for (let i = 0; i < times.length; i++) {
      let tt = times[i] - (front ? shift * D : 0);
      tt = ((tt % D) + D) % D;
      const v = interp.evaluate(tt);
      for (let k = 0; k < size; k++) values[i * size + k] = v[k];
    }
    if (paw) {
      let zMean = 0, yMin = Infinity;
      for (let i = 0; i < times.length; i++) { zMean += values[i * 3 + 2]; yMin = Math.min(yMin, values[i * 3 + 1]); }
      zMean /= times.length;
      for (let i = 0; i < times.length; i++) {
        values[i * 3 + 2] = zMean + (values[i * 3 + 2] - zMean) * strideGain;
        values[i * 3 + 1] = yMin + (values[i * 3 + 1] - yMin) * liftGain;
      }
    }
    return new tr.constructor(tr.name, times, values);
  });
  return new THREE.AnimationClip("Trot", D, tracks);
}

export { DogLegRig, correctDogGaitClip, synthDogTrot };
