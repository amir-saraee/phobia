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
const _TOSS_KEYS = [
  [0.00, 0.16, -0.13, -0.44, 0.10, 1],
  [0.45, 0.19, -0.19, -0.36, 0.38, 1],
  [1.00, 0.12, -0.04, -0.56, -0.30, 1],
  [1.40, 0.10, 0.01, -0.60, -0.45, 1],
  [1.90, 0.12, -0.08, -0.50, -0.20, 0],
];
const _tossP = new THREE.Vector3();
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
    const hand = buildHand(side, skin, sleeve, { scale: 0.76, forearm: true, forearmMat: this._forearmMat });
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

  // Underhand toss with the right hand, `dur` seconds to the release. The
  // scene parents the item to this.right (palm-up, see tossHoldOffset) and
  // lets go when its own windup ends; the swing carries on into a short
  // follow-through and hands back to the normal pose.
  playToss(dur = 0.5) { this._toss = { t: 0, dur: Math.max(0.2, dur) }; }
  // Where an item of radius r sits in the palm-up right hand (root-local).
  tossHoldOffset(r) { return new THREE.Vector3(0, -(0.016 + r), -0.05); }

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
  setReachTarget(world, opts = {}) {
    if (!world) { this._reach = null; return; }
    this._reachWorld.copy(world);
    this._reach = {
      hand: opts.hand || "right",
      grip: opts.grip || "flat",
      normal: opts.normal || null,
      maxReach: opts.maxReach || 0.62,
      curl: opts.curl,
      spread: opts.spread || 0,   // for "both" on a bar: lateral half-gap per hand
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
    const busy = !!this._reach || !!this._toss || this.gestureTargetStrength > 0 || this.actionPulse > 0.02 || holding;
    this._restT = busy ? 0 : this._restT + d;
    const wantShow = (!this.hideAtRest || busy || this._restT < 0.9) ? 1 : 0;
    this._showK += (wantShow - this._showK) * Math.min(1, d * (wantShow > this._showK ? 7 : 2.4));
    const hideDrop = (1 - this._showK) * (1 - this._showK) * 0.30;

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
      const gestureK = (reachThisHand && rk > 0.001) ? Math.max(0, 1 - rk) : 1;
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
        // Two-handed bar grip: spread the hands shoulder-width along the bar
        // (camera-local x ≈ the bar's tangent when you face it).
        if (reach.spread) local.x += side * reach.spread;
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
        this.contactK = Math.max(this.contactK || 0, contactK * rk);
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
        const yAxis = this._rcY.copy(nrm);
        yAxis.addScaledVector(zAxis, -yAxis.dot(zAxis));          // orthonormalise vs z
        if (yAxis.lengthSq() < 1e-6) { yAxis.set(0, 1, 0).addScaledVector(zAxis, -zAxis.y); }
        yAxis.normalize();
        const xAxis = this._rcX.crossVectors(yAxis, zAxis).normalize();
        const q = this._rcQ.setFromRotationMatrix(this._rcMat.makeBasis(xAxis, yAxis, zAxis));
        // ---- contact compliance ----
        // Skin, fur and padded rails all GIVE. A hand that halts on the exact
        // mathematical surface point reads as a decal laid over the object, so
        // the palm sinks a centimetre or so in, the pressure breathes with the
        // stroke, and the arm's momentum spends itself in one small damped
        // bounce the moment it lands instead of stopping like a servo.
        {
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
        const k = Math.min(1, d * (4.5 + 6 * Math.min(1, distNow * 2.5))) * rk;
        hand.position.lerp(local, k);
        hand.quaternion.slerp(q, k);
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
        _tossP.set(L(1), L(2), L(3));
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
    });
    // Out of frame at rest: stop drawing them altogether once they're down.
    const vis = this.cameraMode === "fp" && this._showK > 0.02;
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

export { _UP, Hands };
