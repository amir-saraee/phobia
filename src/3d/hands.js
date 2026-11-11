// First-person hands: procedural hands on the camera that idle-sway, reach,
// pet, grab and toss.

import * as THREE from "three";
import { buildHand, makePrivateRig, applyPrivateRig } from "./human-rig.js";

// ---------- First-person hands ----------
// Two procedurally built hands attached to the camera. They idle-sway while
// breathing and animate to scene-specific gestures: pet, grab, paddle, touch.
const _UP = new THREE.Vector3(0, 1, 0);   // default surface normal for reach
// Right-hand underhand toss, camera-local: hold → swing back and down →
// through and up to the release at u = 1 → follow-through → let go.
// The release stays in the lower right of the view: lifted to eye level at
// screen centre the arm read as a club hanging in mid-air.
const _TOSS_KEYS = [
  [0.00, 0.17, -0.14, -0.44, 0.10, 1],
  [0.45, 0.20, -0.20, -0.37, 0.38, 1],
  [1.00, 0.15, -0.105, -0.55, -0.26, 1],
  [1.40, 0.14, -0.070, -0.60, -0.40, 1],
  [1.90, 0.15, -0.12, -0.50, -0.20, 0],
];
const _tossP = new THREE.Vector3();
// ---- The arm behind the hand ----
// The hand used to carry a rigid 23 cm forearm stub that ended in a rounded
// cap. Any pose that lifted the hand (the toss, a reach at eye level) put
// that cap in the middle of the view: a hand on a club, attached to nothing.
// The arm is now a real two-segment chain solved every frame from the wrist
// back to a shoulder that sits BEHIND the camera plane (z > 0), so the far end
// can never be in frame: whatever the hand does, the arm runs out through the
// bottom/side edge of the screen. Past full stretch the upper arm lengthens
// rather than letting go of the shoulder.
const ARM_FORE = 0.245, ARM_UPPER = 0.29;
const _ARM_SHOULDER = [0.25, -0.36, 0.08];     // camera-local, × side on x
const _aS = new THREE.Vector3(), _aW = new THREE.Vector3(), _aE = new THREE.Vector3();
const _aD = new THREE.Vector3(), _aP = new THREE.Vector3(), _aX = new THREE.Vector3();
const _aY = new THREE.Vector3(), _aZ = new THREE.Vector3(), _aM = new THREE.Matrix4();
const _pA = new THREE.Vector3(), _pB = new THREE.Vector3();
const _holdE = new THREE.Euler(), _holdQ = new THREE.Quaternion();
class Hands {
  constructor(scene, camera, opts = {}) {
    this.camera = camera;
    this.opts = Object.assign({ skinColor: 0xd4a07a, sleeveColor: 0x2d3a52 }, opts);
    this.group = new THREE.Group();
    this.gestureType = "rest";
    this.gestureStrength = 0;       // 0..1 — how engaged the gesture is
    this.gestureTargetStrength = 0;
    this.actionPulse = 0;           // 0..1 — momentary "action just fired"
    // Hands ride on the camera, so in third-person they'd float ~3 m behind
    // the player's body — the user sees their character PLUS a pair of
    // disembodied hands. This flag hides the entire hand group when the
    // camera mode is "tp" so it's clearly ONE character.
    this.cameraMode = "fp";

    // ---- World-anchored reach + surface contact ----
    // Scenes can call setReachTarget(worldPoint, opts) each frame while
    // something is touchable (a dog's back, a railing). The matching hand then
    // drives to the REAL world point — converted into camera space — and
    // conforms its palm to the surface normal, fingers curling on contact. This
    // is what turns "pet"/"grab" from a fixed mid-air pose into an actual touch
    // that tracks the moving object. Default null → zero change for scenes that
    // don't opt in. Scratch objects are pre-allocated to avoid per-frame GC.
    this._reach = null;
    this._reachStrength = 0;
    this._reachWorld   = new THREE.Vector3();
    this._rcTarget     = new THREE.Vector3();
    this._rcSpread     = new THREE.Vector3();
    this._rcLocal      = new THREE.Vector3();
    this._rcShoulder   = new THREE.Vector3();
    this._rcArm        = new THREE.Vector3();
    this._rcDir        = new THREE.Vector3();
    this._rcNormal     = new THREE.Vector3();
    this._rcZ          = new THREE.Vector3();
    this._rcY          = new THREE.Vector3();
    this._rcX          = new THREE.Vector3();
    this._rcMat        = new THREE.Matrix4();
    this._rcQ          = new THREE.Quaternion();
    this._rcCamQ       = new THREE.Quaternion();

    // Skin / sleeve lit by the scene (almost no self-emission), so the hands
    // read with natural light + shadow like your real hands under the room's
    // own lighting — not glowing plastic. Skin has a touch of warmth.
    const skin = new THREE.MeshStandardMaterial({
      color: this.opts.skinColor, roughness: 0.62, metalness: 0,
      // Near-zero self-glow: visible glow in a pitch-dark scene broke the
      // "these are my hands lit by this room" illusion. The (slightly
      // stronger) camera fill below carries dim scenes instead.
      emissive: new THREE.Color(this.opts.skinColor).multiplyScalar(0.02),
      envMapIntensity: 0.5,
    });
    const sleeve = new THREE.MeshStandardMaterial({
      color: this.opts.sleeveColor, roughness: 0.9,
      emissive: new THREE.Color(this.opts.sleeveColor).multiplyScalar(0.02),
    });
    this.skin = skin;
    this._forearmMat = this.opts.longSleeve ? sleeve : skin;
    this.left  = this._buildHand(skin, sleeve, -1);
    this.right = this._buildHand(skin, sleeve,  1);
    this.group.add(this.left, this.right);
    this.left.userData.arm = this._buildArm(skin, sleeve);
    this.right.userData.arm = this._buildArm(skin, sleeve);
    // A held pose (a match pinched in the fingers, a torch in the fist):
    // see setHold().
    this._hold = null;
    this._holdK = 0;
    // Hands come up when there is something to do and drop out of frame when
    // there isn't. Two hands parked at the bottom of the view for a whole
    // trial were the most constant thing on screen and belonged to nothing.
    this.hideAtRest = this.opts.hideAtRest !== false;
    this._showK = 0;
    this._restT = 99;
    for (const h of [this.left, this.right]) h.userData._baseKids = h.children.length;

    // A very gentle, warm fill on the camera so the hands never go pitch-black
    // in dim scenes. Range is clamped HARD (0.6 m, quadratic decay): at 1.4 m
    // it reached the floor and pooled a blown-white ellipse across the bottom
    // of every first-person view. 0.6 m covers the hands (~0.35 m away) and
    // physically cannot touch the ground from eye height.
    //
    // A PRIVATE light (makePrivateRig): it lights the hands and nothing else,
    // so it no longer costs every pixel of the room or changes the scene's
    // light count when the view switches. The PointLight is kept only as a
    // colour/intensity/visibility holder — it is never added to the scene.
    this.fillLight = new THREE.PointLight(0xffe9d2, 0.13, 0.6, 2);
    this.fillLight.position.set(0, 0.04, 0);
    this._privRig = makePrivateRig();
    this._privPos = new THREE.Vector3();
    try { applyPrivateRig(this.group, this._privRig); } catch (e) { console.warn("[hands] private rig:", e); }

    // Attach to the camera so hands always follow the view
    camera.add(this.group);
    if (scene && !scene.children.includes(camera)) scene.add(camera);
  }

  _buildHand(skin, sleeve, side) {
    // The SAME hand the third-person rig uses, so the pair you see in first
    // person and the pair on your character are one asset. They used to be two
    // separate builds that had quietly drifted apart.
    // No forearm stub from the shared builder: the arm is this file's own
    // two-segment chain (_buildArm / _solveArm).
    const hand = buildHand(side, skin, sleeve, { scale: 0.76 });
    // Rig hands hang along −Y with the palm facing −Z. First person wants
    // fingers pointing away from the camera (−Z) with the palm DOWN (−Y): a
    // 180° turn about the Y+Z diagonal swaps those two axes, which is a proper
    // rotation (it also mirrors X, putting the thumb inboard where it belongs).
    const holder = new THREE.Group();
    holder.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 1).normalize(), Math.PI);
    holder.add(hand);
    const root = new THREE.Group();
    root.add(holder);
    // Rest pose in camera space (−Z forward, −Y down). Not flat-palms-down
    // fingers-dead-ahead: real relaxed hands sit lower and wider, droop at the
    // wrist, turn slightly inward and roll a few degrees toward thumbs-up.
    // At z −0.31 a 60° vertical FOV shows ±0.179 m, so y −0.185 put the hands
    // entirely BELOW the bottom edge: the first-person view had two pale slivers
    // clipped by the frame and nothing else. Raised and pushed out a little so
    // the whole hand and a length of forearm sit in the lower third, which is
    // where a first-person player expects to find their own hands.
    root.position.set(side * 0.185, -0.148, -0.335);
    root.rotation.set(0.24, side * -0.10, side * -0.24);
    root.userData = {
      side,
      basePos: root.position.clone(),
      baseRot: root.rotation.clone(),
      setCurl: hand.userData.setCurl,
      fingers: hand.userData.fingers,
      thumb: hand.userData.thumb,
    };
    return root;
  }

  // Forearm + upper arm, in the hand group's (camera) space. Each is a lathe
  // along +Y from its distal joint: the forearm from the wrist to the elbow,
  // the upper arm from the elbow to the shoulder. Bare skin below a short
  // sleeve; all sleeve for a long-sleeved outfit.
  _buildArm(skin, sleeve) {
    const lathe = (prof, mat) => new THREE.Mesh(
      new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)), 18), mat);
    const armMat = this._forearmMat;
    // Slim at the wrist, a belly of muscle toward the elbow.
    const fore = lathe([[0.000, 0.0], [0.000, 0.0180], [0.025, 0.0190], [0.070, 0.0222], [0.130, 0.0268],
      [0.185, 0.0290], [0.225, 0.0284], [ARM_FORE, 0.0270]], armMat);
    fore.scale.z = 0.86;
    const upper = lathe([[0.000, 0.0270], [0.060, 0.0290], [0.150, 0.0325], [0.230, 0.0340],
      [0.275, 0.0325], [0.288, 0.0210], [ARM_UPPER, 0.0]], armMat);
    upper.scale.z = 0.92;
    // Short sleeve over the top of the upper arm (a tee); a long sleeve has
    // the whole arm in cloth already.
    if (armMat !== sleeve) {
      const cuff = lathe([[0.125, 0.0], [0.125, 0.0365], [0.180, 0.0375], [0.275, 0.0362], [0.292, 0.0230], [0.296, 0.0]], sleeve);
      upper.add(cuff);
    }
    const elbow = new THREE.Mesh(new THREE.SphereGeometry(0.0272, 14, 10), armMat);
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.0176, 14, 10), skin);
    wrist.scale.set(1, 1, 0.86);
    for (const m of [fore, upper, elbow, wrist]) { m.userData.noPick = true; this.group.add(m); }
    return { fore, upper, elbow, wrist };
  }
  // Two-bone solve, wrist → elbow → shoulder, in camera space. Called after
  // the hand has its final pose for the frame.
  _solveArm(hand) {
    const a = hand.userData.arm; if (!a) return;
    const side = hand.userData.side;
    const W = _aW.copy(hand.position);
    const S = _aS.set(_ARM_SHOULDER[0] * side, _ARM_SHOULDER[1], _ARM_SHOULDER[2]);
    const dir = _aD.copy(W).sub(S);               // shoulder → wrist
    let d = Math.max(1e-4, dir.length());
    dir.multiplyScalar(1 / d);
    // A long reach leans the shoulder in after the hand, as far as it can go
    // while staying under the bottom edge of the view; only what is left
    // over stretches the upper arm. (Reaching down to a dog at your feet
    // otherwise drew an arm twice its length.)
    const excess = d - (ARM_FORE + ARM_UPPER) * 0.995;
    if (excess > 0) {
      const c = this.camera;
      const tanH = c && c.isPerspectiveCamera ? Math.tan((c.fov * Math.PI / 180) / 2) : 0.6;
      let lo = 0, hi = excess;
      for (let i = 0; i < 5; i++) {
        const tt = (lo + hi) / 2;
        const cy = S.y + dir.y * tt, cz = S.z + dir.z * tt;
        if (cz > -0.02 || cy < cz * tanH * 1.25 - 0.06) lo = tt; else hi = tt;
      }
      S.addScaledVector(dir, lo);
      d -= lo;
    }
    let upperLen = ARM_UPPER;
    const E = _aE;
    if (d >= (ARM_FORE + ARM_UPPER) * 0.995) {
      // Full stretch (or beyond): a straight arm; the upper arm takes the slack.
      E.copy(W).addScaledVector(dir, -ARM_FORE);
      upperLen = Math.max(0.05, d - ARM_FORE);
    } else {
      // Bent: the elbow drops down and outward, the way an arm hangs.
      const dd = Math.max(d, Math.abs(ARM_UPPER - ARM_FORE) + 0.01);
      const k = (ARM_UPPER * ARM_UPPER - ARM_FORE * ARM_FORE + dd * dd) / (2 * dd);
      const h = Math.sqrt(Math.max(0, ARM_UPPER * ARM_UPPER - k * k));
      const pole = _aP.set(side * 0.55, -1, 0.12);
      pole.addScaledVector(dir, -pole.dot(dir));
      if (pole.lengthSq() < 1e-6) pole.set(side, 0, 0);
      pole.normalize();
      E.copy(S).addScaledVector(dir, k).addScaledVector(pole, h);
    }
    // Forearm: +Y from the wrist to the elbow, rolled with the hand so the
    // oval section follows the wrist instead of staying square to the camera.
    const y = _aY.copy(E).sub(W).normalize();
    const x = _aX.set(1, 0, 0).applyQuaternion(hand.quaternion);
    x.addScaledVector(y, -x.dot(y));
    if (x.lengthSq() < 1e-6) x.set(0, 0, 1).addScaledVector(y, -y.z);
    x.normalize();
    const z = _aZ.crossVectors(x, y);
    a.fore.quaternion.setFromRotationMatrix(_aM.makeBasis(x, y, z));
    a.fore.position.copy(W);
    a.wrist.position.copy(W);
    a.wrist.quaternion.copy(a.fore.quaternion);
    // Upper arm: +Y from the elbow to the shoulder.
    y.copy(S).sub(E).normalize();
    x.addScaledVector(y, -x.dot(y));
    if (x.lengthSq() < 1e-6) x.set(0, 0, 1).addScaledVector(y, -y.z);
    x.normalize();
    z.crossVectors(x, y);
    a.upper.quaternion.setFromRotationMatrix(_aM.makeBasis(x, y, z));
    a.upper.position.copy(E);
    a.upper.scale.y = upperLen / ARM_UPPER;
    a.elbow.position.copy(E);
  }
  // Half-width of the view at camera-local depth z (metres).
  _halfW(z) {
    const c = this.camera;
    if (!c || !c.isPerspectiveCamera) return 1;
    return Math.abs(z) * Math.tan((c.fov * Math.PI / 180) / 2) * (c.aspect || 1);
  }

  // Hold the right (or left) hand up in a fixed camera-local pose while it
  // carries something — a match pinched in the fingers, a torch in the fist.
  // Call every frame it applies (like setReachTarget); clearHold() or null
  // lets go. opts:
  //   pos:  [x, y, z] camera-local wrist position (x is for the right hand;
  //         mirrored for the left, and pulled in on a narrow portrait view)
  //   rot:  [x, y, z] euler of the hand root (mirrored on y/z for the left)
  //   grip: "pinch" (thumb + index tips meet, the rest curled) | "fist" | "open"
  //   hand: "right" | "left"
  setHold(opts) {
    if (!opts) { this._hold = null; return; }
    this._hold = {
      pos: opts.pos || [0.15, -0.12, -0.40],
      rot: opts.rot || [0.3, -0.1, -1.2],
      grip: opts.grip || "fist",
      hand: opts.hand === "left" ? -1 : 1,
      src: opts,
    };
    this._holdLast = this._hold;
  }
  clearHold() { this._hold = null; }
  // Where the thumb and index tips meet, in camera-local space (the parent
  // space of anything added to the camera). Returns `out`.
  getPinchPoint(out, hand = "right") {
    const h = hand === "left" ? this.left : this.right;
    const u = h.userData;
    out.set(0, 0, 0);
    if (!u.fingers || !u.thumb) return h.getWorldPosition(out) && this.camera.worldToLocal(out);
    h.updateWorldMatrix(true, true);
    const f = u.fingers[0];
    _pA.set(0, -f.spec.len[2], 0); f.seg[2].localToWorld(_pA);
    _pB.set(0, -0.0165, 0); u.thumb[1].localToWorld(_pB);
    out.copy(_pA).add(_pB).multiplyScalar(0.5);
    return this.camera.worldToLocal(out);
  }

  // Underhand toss with the right hand. The scene samples the palm after
  // the pose update and releases the item at the end of the windup.
  playToss(dur = 0.5) { this._toss = { t: 0, dur: Math.max(0.2, dur) }; }
  palmPoint(out, radius = 0) {
    return this.right.localToWorld(out.set(0, -0.011 - radius, -0.029));
  }

  setGesture(type) {
    if (this.gestureType !== type) {
      this.gestureType = type;
      this.gestureTargetStrength = type === "rest" ? 0 : 1;
    }
  }
  // Trigger a brief animation pulse (e.g. after a click)
  fireAction() { this.actionPulse = 1.0; }

  // Drive the matching hand(s) to a REAL world point with surface contact.
  // Call every frame while the target is touchable; call clearReachTarget()
  // (or pass null) when it isn't. opts:
  //   hand:    "right" | "left" | "both"   (default "right")
  //   grip:    "flat"  (lay palm on a surface — petting)
  //          | "wrap"  (curl fingers around a bar — railing grip)
  //   normal:  THREE.Vector3 world-space surface normal (palm faces it)
  //   maxReach: arm length in metres before the hand stops at full stretch
  //   curl:    optional explicit finger curl override (0..1.4)
  //   fingers: optional world direction for the fingers (default: the reach)
  //   contact: false for a hand held out in the air (never reports contactK)
  //   palm: aim the palm center at the world point
  //   offset: distance beyond the palm for the center of a held object
  //   spreadAxis: optional world direction between the two grip points
  setReachTarget(world, opts = {}) {
    if (!world) { this._reach = null; return; }
    this._reachWorld.copy(world);
    this._reach = {
      hand: opts.hand || "right",
      grip: opts.grip || "flat",
      normal: opts.normal || null,
      maxReach: opts.maxReach || 0.62,
      curl: opts.curl,
      spreadAxis: opts.spreadAxis || null,
      spread: opts.spread || 0,   // for "both" on a bar: lateral half-gap per hand
      // World direction the fingers point (default: along the reach). A hand
      // held OUT rather than laid ON something wants its own attitude.
      fingers: opts.fingers || null,
      // false = a hand held out in the air: it never reports contact.
      contact: opts.contact !== false,
      palm: !!opts.palm,
      offset: opts.offset || 0,
    };
  }
  clearReachTarget() { this._reach = null; }

  update(t, dt, controls) {
    const d = dt || 0.016;
    // Private fill: 4 cm above the eye, only while the hands are shown.
    if (this._privRig) {
      if (this.fillLight.visible && this.group.visible) {
        this._privPos.set(0, 0.04, 0).applyQuaternion(this.camera.quaternion).add(this.camera.position);
        this._privRig.set(0, this._privPos, this.fillLight.color, this.fillLight.intensity, this.fillLight.distance);
      } else {
        this._privRig.off(0);
      }
    }
    // Delta-timed smoothing (the old per-frame 0.12 factor ran 2× faster on
    // 120 Hz displays).
    this.gestureStrength += (this.gestureTargetStrength - this.gestureStrength) * Math.min(1, d * 7.5);
    this.actionPulse = Math.max(0, this.actionPulse - d * 1.4);
    // Ease the world-reach blend in/out so a hand glides to/from a real target.
    this._reachStrength += ((this._reach ? 1 : 0) - this._reachStrength) * Math.min(1, d * 6);
    // Busy = a reach, a gesture, a click squeeze, or something held in a hand.
    const holding = this.left.children.length > this.left.userData._baseKids
      || this.right.children.length > this.right.userData._baseKids;
    if (this._toss) { this._toss.t += d; if (this._toss.t > this._toss.dur + 0.45) this._toss = null; }
    this._holdK += ((this._hold ? 1 : 0) - this._holdK) * Math.min(1, d * (this._hold ? 7 : 5));
    const busy = !!this._reach || !!this._toss || !!this._hold || this._holdK > 0.05 || this.gestureTargetStrength > 0 || this.actionPulse > 0.02 || holding;
    this._restT = busy ? 0 : this._restT + d;
    const wantShow = (!this.hideAtRest || busy || this._restT < 0.9) ? 1 : 0;
    this._showK += (wantShow - this._showK) * Math.min(1, d * (wantShow > this._showK ? 7 : 2.4));
    // Per hand: a one-handed action (a reach, a toss, something held) brings
    // up THAT hand. The other one used to come up with it and sit in the
    // bottom corner as a pale fist with nothing to do.
    const twoHanded = this.gestureTargetStrength > 0 || (this._reach && this._reach.hand === "both");
    for (const h of [this.left, this.right]) {
      const ud = h.userData, sd = ud.side;
      const mine = !this.hideAtRest || twoHanded
        || (this._reach && (this._reach.hand === (sd > 0 ? "right" : "left")))
        || (this._toss && sd > 0)
        || ((this._hold || (this._holdK > 0.05 && this._holdLast)) && (this._hold || this._holdLast).hand === sd)
        || h.children.length > ud._baseKids
        || (this.actionPulse > 0.02 && !this._reach && !this._toss && !this._hold);
      if (mine) ud._mineT = 0; else ud._mineT = (ud._mineT == null ? 99 : ud._mineT) + d;
      const want = (mine || ud._mineT < 0.9) ? 1 : 0;
      ud._showK = (ud._showK || 0) + (want - (ud._showK || 0)) * Math.min(1, d * (want > (ud._showK || 0) ? 7 : 2.4));
    }

    // Body-feel inputs: the walk gait (hands counter-sway like real arms),
    // breath that quickens with fear, and a fear tremor that puts the
    // anxiety in the user's OWN hands — the most personal place it can live.
    const w = controls && controls.getWalkState ? controls.getWalkState() : { phase: 0, amount: 0 };
    const fearK = (window.PhobiaFear ? window.PhobiaFear.get() : 0) / 100;
    const breathRate = 1.2 + fearK * 1.6;
    const breathAmp = 0.005 + fearK * 0.004;
    // Soft cloth whoosh as a reach engages — touch you can HEAR beginning.
    if (this._reach && this._reachStrength > 0.45 && !this._reachSounded) {
      this._reachSounded = true;
      try { window.PhobiaAudio && window.PhobiaAudio.ui && window.PhobiaAudio.ui("whoosh", 0.4); } catch {}
    } else if (!this._reach && this._reachStrength < 0.1) {
      this._reachSounded = false;
    }
    // Camera-look inertia: the hand meshes ride the camera, so without lag
    // they pan AS the camera — weightless. Track smoothed look velocity and
    // let the hands trail the turn by a few centimetres (and roll slightly
    // with the drag), the single cheapest "my hands have mass" cue.
    {
      const yawNow = controls && typeof controls.yaw === "number" ? controls.yaw : 0;
      const pitchNow = controls && typeof controls.pitch === "number" ? controls.pitch : 0;
      if (this._lastYaw == null) { this._lastYaw = yawNow; this._lastPitch = pitchNow; }
      let dyaw = yawNow - this._lastYaw;
      dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
      const dpitch = pitchNow - this._lastPitch;
      this._lastYaw = yawNow; this._lastPitch = pitchNow;
      const yawVel = Math.max(-3.5, Math.min(3.5, dyaw / Math.max(0.001, d)));
      const pitchVel = Math.max(-3.5, Math.min(3.5, dpitch / Math.max(0.001, d)));
      this._lagX = (this._lagX || 0) + (yawVel * 0.014 - (this._lagX || 0)) * Math.min(1, d * 6.5);
      this._lagY = (this._lagY || 0) + (pitchVel * -0.011 - (this._lagY || 0)) * Math.min(1, d * 6.5);
    }

    // Recomputed from scratch each frame by whichever hand is reaching; a
    // stale value here would leave "you are touching it" true forever.
    this.contactK = 0;

    // ---- Frame the rest pose against the ACTUAL viewport ----
    // A hand parked at a fixed ±0.185 m is only in shot at one aspect ratio.
    // Measured on a 1.04-aspect stage the pair projected to x = −3% and 105% —
    // both hands entirely outside the frame, which is why first person looked
    // like it had no hands at all. The stage is a responsive element and the
    // scene adapts its fov, so the rest pose has to be derived from the
    // camera's own frustum rather than guessed once at build time.
    if (this.camera && this.camera.isPerspectiveCamera) {
      const spec = this._restSpec || (this._restSpec = { z: -0.337, xFrac: 0.70, yFrac: -0.80 });
      const halfH = Math.abs(spec.z) * Math.tan((this.camera.fov * Math.PI / 180) / 2);
      const halfW = halfH * (this.camera.aspect || 1);
      const bx = Math.max(0.105, Math.min(0.205, halfW * spec.xFrac));
      const by = Math.max(-0.205, Math.min(-0.105, halfH * spec.yFrac));
      for (const h of [this.left, this.right]) {
        const bp = h.userData.basePos;
        bp.set(h.userData.side * bx, by, spec.z);
      }
    }
    [this.left, this.right].forEach((hand) => {
      const side = hand.userData.side;
      const base = hand.userData.basePos;
      const baseRot = hand.userData.baseRot;
      let target = base.clone();
      let targetRotX = baseRot.x, targetRotY = baseRot.y, targetRotZ = baseRot.z;
      let fingerCurl = 0;

      // Per-hand breath: real arms don't rise and fall in perfect unison —
      // a small phase offset per side breaks the mirrored-mannequin read.
      target.y += Math.sin(t * breathRate + side * 0.9) * breathAmp;

      switch (this.gestureType) {
        case "grab": {
          // Hands rise and grip an imaginary bar in front
          target.x = side * 0.16;
          target.y = -0.18;
          target.z = -0.42;
          targetRotX = -0.4;
          fingerCurl = 1.4;
          break;
        }
        case "pet": {
          // Right hand offers forward; the stroking wave only plays while a
          // pet is actually HAPPENING (actionPulse from the click) — before,
          // the hand pawed at empty air the whole time the dog was merely
          // within invite range. Sustained reach onto a flat surface (dog's
          // coat) also drives a gentler continuous stroke so the pet doesn't
          // freeze the moment the click pulse dies. Uses _reachStrength (set
          // before this loop) — contactK is zeroed earlier in the frame.
          if (side === 1) {
            const contactStroke = (this._reachStrength || 0)
              * (this._reach && this._reach.grip === "flat" ? 1 : 0);
            const strokeK = 0.15 + 0.85 * this.actionPulse + 0.55 * contactStroke;
            const wave = Math.sin(t * (3.2 + contactStroke * 1.4)) * 0.04 * strokeK;
            target.x = 0.06 + wave * 0.35 * contactStroke;
            target.y = -0.18 + wave * 0.5 - this.actionPulse * 0.05;
            target.z = -0.55 - this.actionPulse * 0.15 - contactStroke * 0.04;
            targetRotX = -1.0 + wave;
            fingerCurl = 0.35 + contactStroke * 0.15;
          } else {
            target.y = -0.32;
          }
          break;
        }
        case "paddle": {
          // Both hands swing alternately through water
          const phase = side === -1 ? 0 : Math.PI;
          const sweep = Math.sin(t * 2.2 + phase);
          target.x = side * (0.20 + sweep * 0.06);
          target.y = -0.32 + sweep * 0.08;
          target.z = -0.34 + sweep * 0.05;
          targetRotX = -0.3 + sweep * 0.4;
          targetRotZ = side * 0.2 + sweep * 0.2;
          fingerCurl = 0.3;
          break;
        }
        case "touch": {
          // Single right hand reaches out tentatively
          if (side === 1) {
            target.x = 0.08;
            target.y = -0.20;
            target.z = -0.45 - this.actionPulse * 0.1;
            targetRotX = -0.5;
          }
          fingerCurl = 0.2;
          break;
        }
        case "brush": {
          // Right hand sweeps left-to-right with a downward arc — driven
          // by the actionPulse so it's a one-shot motion fired by clicks.
          if (side === 1) {
            const k = this.actionPulse;     // 1 → 0 over the action
            const sweep = Math.sin(Math.max(0, k) * Math.PI);  // 0..1..0
            target.x = 0.04 + sweep * 0.18;
            target.y = -0.16 - sweep * 0.04;
            target.z = -0.42 - sweep * 0.08;
            targetRotZ = sweep * 0.7;
            targetRotX = -0.4 - sweep * 0.4;
          }
          fingerCurl = 0.1;
          break;
        }
      }

      // Lerp position + rotation toward (base + (target - base) * gestureStrength)
      const finalPos = base.clone().lerp(target, this.gestureStrength);
      const hideDrop = (1 - hand.userData._showK) * (1 - hand.userData._showK) * 0.30;
      finalPos.y -= hideDrop;
      finalPos.z += hideDrop * 0.12;
      // Gait counter-swing: each hand drifts forward/back opposite its
      // same-side leg with a small bounce at each plant — faded out while a
      // gesture needs the hand steady.
      const gaitFree = 1 - this.gestureStrength;
      // Asymmetric counter-swing: the off hand swings a touch shorter and a
      // hair behind — perfectly mirrored arms are the classic robot tell.
      const armAmp = side > 0 ? 0.88 : 1.0;
      const armPhase = w.phase + (side > 0 ? Math.PI * 1.04 : 0);
      finalPos.z += Math.sin(armPhase) * 0.030 * armAmp * w.amount * gaitFree;
      finalPos.y += (Math.abs(Math.sin(w.phase)) - 0.5) * 0.012 * armAmp * w.amount * gaitFree;
      finalPos.x += Math.sin(w.phase * 0.5) * 0.008 * w.amount * side * gaitFree;
      // Idle life: when nothing else owns the hand, it wanders a few
      // millimetres on slow, per-hand noise — never perfectly still.
      const idleK = gaitFree * (1 - this._reachStrength) * (1 - w.amount * 0.6);
      finalPos.x += Math.sin(t * 0.53 + side * 2.1) * 0.0045 * idleK;
      finalPos.y += Math.sin(t * 0.71 + side * 4.7) * 0.0040 * idleK;
      finalPos.z += Math.sin(t * 0.41 + side * 1.3) * 0.0035 * idleK;
      // Look inertia: hands trail a fast camera turn and roll slightly into
      // the drag (position offset here; the matching wrist roll is folded
      // into the rotation targets below).
      finalPos.x += (this._lagX || 0) * gaitFree;
      finalPos.y += (this._lagY || 0) * gaitFree;
      // Organic wrist motion with the stride — pure translation read as
      // gliding mannequin gloves.
      const gaitRotX = Math.sin(armPhase) * 0.07 * w.amount * gaitFree;
      const lagRotZ = (this._lagX || 0) * 1.3 * gaitFree;
      // Fear tremor — tiny, high-frequency, slightly different per hand so it
      // reads as nerves rather than screen shake. Builds above ~fear 45 and
      // stays ON during gestures: a trembling reach toward the snake is
      // exactly the honest body the exposure should show.
      const tremor = Math.max(0, fearK - 0.45) * 0.012;
      if (tremor > 0) {
        finalPos.x += Math.sin(t * 21 + side * 7) * tremor;
        finalPos.y += Math.sin(t * 27 + side * 3) * tremor * 0.7;
      }
      // A live world reach target owns this hand: attenuate the canned-pose
      // lerp as the reach engages. Both lerps ran at full weight before, and
      // their per-frame fight settled at a ~50/50 equilibrium — the palm
      // permanently hovered ~20 cm short of the dog's back / the rail while
      // the fingers curled around empty air.
      const reach = this._reach;
      const rk = this._reachStrength;
      const reachThisHand = reach && (reach.hand === "both"
        || (reach.hand === "right" && side === 1)
        || (reach.hand === "left"  && side === -1));
      // A held pose owns its hand the same way (see the hold block below).
      const holdThisHand = (this._hold || this._holdLast) && (this._hold || this._holdLast).hand === side ? this._holdK : 0;
      const gestureK = ((reachThisHand && rk > 0.001) ? Math.max(0, 1 - rk) : 1) * (1 - holdThisHand);
      const posK = Math.min(1, d * 11) * gestureK;
      hand.position.lerp(finalPos, posK);
      hand.rotation.x += (baseRot.x + (targetRotX - baseRot.x) * this.gestureStrength + gaitRotX - hand.rotation.x) * posK;
      hand.rotation.y += (baseRot.y + (targetRotY - baseRot.y) * this.gestureStrength - hand.rotation.y) * posK;
      hand.rotation.z += (baseRot.z + (targetRotZ - baseRot.z) * this.gestureStrength + lagRotZ - hand.rotation.z) * posK;

      // Curl fingers — base curl from the gesture, plus a brief universal
      // squeeze whenever actionPulse > 0 so EVERY click on an interactive
      // object produces visible grip feedback (not just clicks during pet
      // / brush / touch states). The pulse decays over ~0.7 s.
      const pulseCurl = this.actionPulse * 0.5;
      // Resting curl: a relaxed hand is never flat — fingers hold a soft
      // natural bend that slowly "breathes", and each finger flexes on its
      // own tiny phase. Straight rigid fingers were the strongest mannequin
      // tell in first person. Fades out as a gesture/reach takes the hand.
      const restCurl = (0.16 + Math.sin(t * 0.8 + side * 1.7) * 0.035)
        * (1 - this.gestureStrength) * (1 - this._reachStrength);
      // Curl is accumulated here and APPLIED once at the end of this hand's
      // pass, after any reach has had its say — the shared hand drives all three
      // phalanges plus the thumb from one call, so it can't be set twice.
      hand.userData._curl = restCurl + (fingerCurl * this.gestureStrength) + pulseCurl;
      hand.userData._spread = 0;
      hand.userData._thumb = null;
      // Universal pulse: hand jiggles up slightly with the squeeze so
      // even idle hands react visibly to a click.
      hand.position.y += this.actionPulse * 0.018 * (side === 1 ? 1 : 0.5);

      // ---- World-anchored reach + surface contact (override) ----
      // Applied last, scaled by _reachStrength (computed above so the gesture
      // lerp yields to it), so when no scene sets a target this is a no-op
      // and the gesture system above is untouched.
      if (reachThisHand && rk > 0.001) {
        // World point → camera-local (the hand group rides the camera at an
        // identity transform, so camera space IS hand-parent space). Refresh
        // the camera's world matrix first — hands.update() runs before render.
        this.camera.updateWorldMatrix(true, false);
        const local = this._rcLocal.copy(this._reachWorld);
        this.camera.worldToLocal(local);
        if (reach.spreadAxis) {
          this._rcSpread.copy(reach.spreadAxis).transformDirection(this.camera.matrixWorldInverse);
          local.addScaledVector(this._rcSpread, side * reach.spread);
        } else {
          local.x += side * reach.spread;
        }
        const contactPoint = this._rcTarget.copy(local);
        // Clamp to arm reach from a per-side shoulder anchor: a too-far target
        // reads as "reaching at full stretch" rather than teleporting out.
        const sh = this._rcShoulder.set(side * 0.17, -0.22, -0.02);
        const arm = this._rcArm.copy(local).sub(sh);
        const armLen = arm.length() || 1e-6;
        const maxR = reach.maxReach;
        const overshoot = Math.max(0, armLen - maxR);
        if (overshoot > 0) { arm.multiplyScalar(maxR / armLen); local.copy(sh).add(arm); }
        // 1 when the hand is essentially on the surface, fading as it falls short.
        const contactK = Math.max(0, Math.min(1, 1 - overshoot / 0.25));
        // Published so the scene loop can tell that first person has ACTUALLY
        // made contact — third person measures this off the body's wrist, and
        // without this the whole event-beat channel was blind in first person.
        if (reach.contact && !reach.palm) this.contactK = Math.max(this.contactK || 0, contactK * rk);
        // Fingers (-Z) point at the target; palm (+Y local) faces the surface
        // normal so the hand lies flat on / wraps the surface.
        const reachDir = this._rcDir.copy(local).sub(sh);
        if (reachDir.lengthSq() < 1e-6) reachDir.set(0, 0, -1);
        reachDir.normalize();
        const camQ = this.camera.getWorldQuaternion(this._rcCamQ);
        const nrm = this._rcNormal.copy(reach.normal || _UP).applyQuaternion(camQ.invert());
        if (nrm.lengthSq() < 1e-6) nrm.set(0, 1, 0);
        nrm.normalize();
        const zAxis = this._rcZ.copy(reachDir).negate();          // local +Z = away from target
        if (reach.fingers) {
          zAxis.copy(reach.fingers).applyQuaternion(camQ).negate();   // camQ is inverted above
          if (zAxis.lengthSq() < 1e-6) zAxis.copy(reachDir).negate();
          zAxis.normalize();
        }
        if (reach.palm) {
          zAxis.addScaledVector(nrm, -zAxis.dot(nrm));
          if (zAxis.lengthSq() < 1e-6) {
            if (Math.abs(nrm.x) < 0.9) zAxis.set(1, 0, 0).addScaledVector(nrm, -nrm.x);
            else zAxis.set(0, 1, 0).addScaledVector(nrm, -nrm.y);
          }
          zAxis.normalize();
        }
        const yAxis = this._rcY.copy(nrm);
        yAxis.addScaledVector(zAxis, -yAxis.dot(zAxis));          // orthonormalise vs z
        if (yAxis.lengthSq() < 1e-6) { yAxis.set(0, 1, 0).addScaledVector(zAxis, -zAxis.y); }
        yAxis.normalize();
        const xAxis = this._rcX.crossVectors(yAxis, zAxis).normalize();
        const q = this._rcQ.setFromRotationMatrix(this._rcMat.makeBasis(xAxis, yAxis, zAxis));
        if (reach.palm) {
          arm.set(0, -0.011 - reach.offset, -0.029).applyQuaternion(q);
          local.copy(contactPoint).sub(arm);
          arm.copy(local).sub(sh);
          if (arm.lengthSq() > maxR * maxR) local.copy(sh).add(arm.setLength(maxR));
        }
        // ---- contact compliance ----
        // Skin, fur and padded rails all GIVE. A hand that halts on the exact
        // mathematical surface point reads as a decal laid over the object, so
        // the palm sinks a centimetre or so in, the pressure breathes with the
        // stroke, and the arm's momentum spends itself in one small damped
        // bounce the moment it lands instead of stopping like a servo.
        if (reach.contact) {
          const ud = hand.userData;
          const nowOn = contactK > 0.7 ? 1 : 0;
          if (nowOn && !(ud._onSurface || 0)) ud._settle = 1;
          ud._onSurface = nowOn;
          ud._settle = Math.max(0, (ud._settle || 0) - d * 3.4);
          const press = contactK * (0.013 + 0.005 * Math.sin(t * 3.1 + side * 1.7));
          const bounce = ud._settle > 0
            ? Math.sin(ud._settle * Math.PI * 2) * ud._settle * ud._settle * 0.022 : 0;
          local.addScaledVector(nrm, bounce - press);
        }
        // Approach ARC + soft landing: the hand comes in slightly from above
        // and decelerates onto the surface (fast while far, gentle at
        // contact) — the straight full-speed beeline read as a robotic poke.
        const distNow = hand.position.distanceTo(local);
        local.y += Math.min(0.055, distNow * 0.35);
        const reachRate = (reach.palm ? 8 : 4.5) + 6 * Math.min(1, distNow * 2.5);
        const k = Math.min(1, d * reachRate) * rk;
        hand.position.lerp(local, k);
        hand.quaternion.slerp(q, k);
        if (reach.palm && reach.contact) {
          this._rcArm.set(0, -0.011 - reach.offset, -0.029).applyQuaternion(hand.quaternion).add(hand.position);
          const gap = this._rcArm.distanceTo(contactPoint);
          this.contactK = Math.max(this.contactK, Math.max(0, 1 - gap / 0.10) * rk);
        }
        // Finger conform: relaxed flat for petting, full wrap for a grip,
        // closing as contact is made.
        const baseCurl = reach.curl != null ? reach.curl : (reach.grip === "wrap" ? 1.25 : 0.20);
        const reachCurl = baseCurl * (0.4 + 0.6 * contactK);
        const u = hand.userData;
        u._curl += (reachCurl - u._curl) * rk;
        // A flat palm laid on a surface splays; a grip does not.
        u._spread += ((reach.grip === "flat" ? 0.6 : 0) - u._spread) * rk;
        if (reach.grip === "wrap") u._thumb = reachCurl * 0.8;
      }
      // ---- Held pose (match, torch): owns the hand while it is held ----
      const H = this._hold || this._holdLast;
      if (H && H.hand === side && this._holdK > 0.001) {
        const hk = this._holdK;
        const kk = Math.min(1, d * 14) * hk;
        const hz = H.pos[2];
        _tossP.set(side * Math.min(H.pos[0], this._halfW(hz) * 0.80), H.pos[1], hz);
        _tossP.y += Math.sin(t * breathRate + side * 0.9) * breathAmp - (1 - hk) * (1 - hk) * 0.12;
        hand.position.lerp(_tossP, kk);
        _holdQ.setFromEuler(_holdE.set(H.rot[0], side * H.rot[1], side * H.rot[2]));
        hand.quaternion.slerp(_holdQ, kk);
        const ud = hand.userData;
        const gc = H.grip === "pinch" ? 0.62 : H.grip === "fist" ? 1.0 : 0.1;
        ud._curl += (gc - ud._curl) * hk;
        ud._spread *= 1 - hk;
        ud._thumb = H.grip === "pinch" ? 0.55 : H.grip === "fist" ? 0.7 : null;
        ud._grip = H.grip; ud._gripK = hk;
      } else hand.userData._gripK = 0;
      // ---- Toss (right hand): keyed swing, owns the hand while it runs ----
      if (this._toss && side === 1) {
        const T = this._toss, u = T.t / T.dur;
        // [u, x, y, z, rotX, weight] — camera-local; palm up throughout.
        const K = _TOSS_KEYS;
        let i = 1;
        while (i < K.length - 1 && u > K[i][0]) i++;
        const a0 = K[i - 1], a1 = K[i];
        let f = Math.max(0, Math.min(1, (u - a0[0]) / Math.max(1e-4, a1[0] - a0[0])));
        f = f * f * (3 - 2 * f);
        const L = (j) => a0[j] + (a1[j] - a0[j]) * f;
        const w = L(5);
        const kk = Math.min(1, d * 22) * w;
        // Pulled in on a narrow (portrait) view so the swing stays in frame.
        _tossP.set(Math.min(L(1), this._halfW(L(3)) * 0.78), L(2), L(3));
        hand.position.lerp(_tossP, kk);
        hand.rotation.x += (L(4) - hand.rotation.x) * kk;
        hand.rotation.y += (-0.10 - hand.rotation.y) * kk;
        hand.rotation.z += (-2.55 - hand.rotation.z) * kk;
        const holdCurl = u < 1 ? 0.55 : 0.12;
        hand.userData._curl += (holdCurl - hand.userData._curl) * w;
        hand.userData._spread *= 1 - w;
      }
      // ---- apply this hand's finger pose ----
      const u2 = hand.userData;
      if (u2.setCurl) {
        u2.setCurl(u2._curl || 0, u2._spread || 0, u2._thumb);
        // Pinch: the index stays long and meets the thumb pad; the other
        // three fold into the palm behind it.
        if (u2._gripK > 0.001 && u2._grip === "pinch" && u2.fingers) {
          const g = u2._gripK, P = Hands.PINCH;
          const ix = u2.fingers[0].seg;
          ix[0].rotation.x += (P.index[0] - ix[0].rotation.x) * g;
          ix[1].rotation.x += (P.index[1] - ix[1].rotation.x) * g;
          ix[2].rotation.x += (P.index[2] - ix[2].rotation.x) * g;
          for (let fi = 1; fi < u2.fingers.length; fi++) {
            const sg = u2.fingers[fi].seg;
            sg[0].rotation.x += (P.rest[0] - sg[0].rotation.x) * g;
            sg[1].rotation.x += (P.rest[1] - sg[1].rotation.x) * g;
            sg[2].rotation.x += (P.rest[2] - sg[2].rotation.x) * g;
          }
          if (u2.thumb) {
            u2.thumb[0].rotation.x += (P.thumb[0] - u2.thumb[0].rotation.x) * g;
            u2.thumb[1].rotation.x += (P.thumb[1] - u2.thumb[1].rotation.x) * g;
          }
        }
        // Per-finger micro-flex on its own phase: fingers that move in perfect
        // lockstep are the loudest mannequin tell at first-person range.
        const idleK = (1 - this.gestureStrength) * (1 - this._reachStrength);
        if (idleK > 0.01 && u2.fingers) {
          for (let fi = 0; fi < u2.fingers.length; fi++) {
            const m = Math.sin(t * 0.9 + fi * 1.25 + side * 3.1) * 0.035 * idleK;
            u2.fingers[fi].seg[0].rotation.x += m;
            u2.fingers[fi].seg[1].rotation.x += m * 0.8;
          }
        }
      }
      this._solveArm(hand);
      const hv = hand.userData._showK > 0.02;
      if (hand.visible !== hv) {
        hand.visible = hv;
        const am = hand.userData.arm;
        if (am) { am.fore.visible = am.upper.visible = am.elbow.visible = am.wrist.visible = hv; }
      }
    });
    // Out of frame at rest: stop drawing them altogether once they're down.
    const vis = this.cameraMode === "fp" && (this.left.visible || this.right.visible);
    if (this.group.visible !== vis) this.group.visible = vis;
  }

  // Show / hide the FP hand meshes based on camera mode. In TP we hide
  // them entirely — the visible Body's arms take over. We also turn off the
  // selfie fill-light so it doesn't bleach the back of the character.
  setCameraMode(mode) {
    this.cameraMode = mode === "tp" ? "tp" : "fp";
    const visible = this.cameraMode === "fp";
    if (this.group) this.group.visible = visible;
    if (this.fillLight) this.fillLight.visible = visible;
  }

  dispose() {
    if (this.camera) {
      if (this.group.parent === this.camera) this.camera.remove(this.group);
      if (this.fillLight && this.fillLight.parent === this.camera) this.camera.remove(this.fillLight);
    }
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose());
      }
    });
  }
}

// Pinch pose (radians): index MCP/PIP/DIP, the other fingers, thumb MP/IP.
Hands.PINCH = { index: [0.95, 0.85, 0.45], rest: [1.35, 1.45, 0.9], thumb: [0.55, 0.50] };

export { _UP, Hands };
