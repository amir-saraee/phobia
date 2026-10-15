// Body — the player's own skinned figure in a scene: foot-rocker gait, reach,
// posture, face, first / third-person views.

import * as THREE from "three";
import { QUALITY, IS_LOW_POWER } from "./renderer.js";
import { _hsat, _sstep, _wob, _GAIT, _track, _solePitch, _legReach, _legIK, WRIST_REST_FOLD, BODY_TYPES_3D } from "./human-base.js";
import { ANKLE_Y, KNEE_Y, HIP_Y, WAIST_Y, NECK_Y, CHEST_TOP_Y, SHOULDER_HALF, buildHumanRig, makePrivateRig, applyPrivateRig, makeContactShadow } from "./human-rig.js";
import { HUMAN_CLIPS, _humanMotion, loadHumanMotion, RETARGET_UPPER, RETARGET_TORSO_ONLY, applyRetarget } from "./human-motion.js";

// ---------- First-person body (world-anchored) ----------
// A full visible body added to the SCENE (not the camera). Each frame the body
// follows the camera's xz position + yaw, but NOT its pitch. The result: when
// you look down you actually see your own chest + hips + legs + feet, instead
// of a body that rotates out of view with your head.
//
// The mesh is the skinned humanoid built by buildHumanRig(): one continuous
// surface over a real bone chain. Everything below drives BONES.
//
// Joint sign conventions (bones hang along local −Y, character faces +Z):
//   shoulder / hip  .rotation.x < 0  → limb swings FORWARD
//   elbow           .rotation.x < 0  → flexion (hand toward the shoulder)
//   knee            .rotation.x > 0  → flexion (heel toward the seat)
// The old rig flexed elbows backwards; `_elbowFlex()` keeps the sign in one
// place so it can't drift again.
const _bV1 = new THREE.Vector3(), _bV2 = new THREE.Vector3(), _bV3 = new THREE.Vector3();
const _bV4 = new THREE.Vector3(), _bV5 = new THREE.Vector3(), _bV6 = new THREE.Vector3();
const _bM1 = new THREE.Matrix4(), _bQ1 = new THREE.Quaternion(), _bQ2 = new THREE.Quaternion();

const _thE = new THREE.Euler(), _thQ = new THREE.Quaternion();
class Body {
  constructor(scene, camera, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.opts = Object.assign({
      skinColor:  0xd4a07a,
      pantsColor: 0x2c3a52,
      shoeColor:  0xe9e5de,
      shirtColor: 0x2c9d96,
      hairColor:  0x4a2c18,
      hairStyle:  "short",   // "short" | "long" | "buzz" | "pony" | "curly" | "bald"
      eyeColor:   0x3a2410,
      glasses:    "none",    // "none" | "round" | "square"
      facialHair: "none",    // "none" | "stubble" | "beard" | "moustache"
      headwear:   "none",    // "none" | "beanie" | "cap"
      topStyle:   "tee",     // "tee" | "hoodie" | "jacket"
      // Body part offsets in body-local space (foot at y=0, eye at y≈1.55).
      // Anthropometric landmarks — see the constants above buildHumanRig for
      // where the numbers come from. Overriding one of these moves the BONE and
      // the surface together (the mesh stations are remapped through them).
      headY:      1.55,    // camera height = eye line — a scene contract
      neckY:      NECK_Y,
      chestTopY:  CHEST_TOP_Y,
      waistY:     WAIST_Y,
      hipY:       HIP_Y,
      kneeY:      KNEE_Y,
      ankleY:     ANKLE_Y,
      width:      SHOULDER_HALF,   // half torso width (acromion)
      // Wind exposure — used for hair flutter, scarf flap. Caller can crank this
      // up in heights / driving / flying for visible cloth motion that sells
      // "I'm somewhere with a real breeze".
      windExposure: 0.0,
    }, opts);
    // ---- Body type: proportions + gait personality ----
    const BT = BODY_TYPES_3D;
    this.bt = BT[this.opts.bodyType] || BT.man;
    for (const k of ["headY", "neckY", "chestTopY", "waistY", "hipY", "kneeY", "ankleY"]) {
      this.opts[k] *= this.bt.h;
    }
    this.opts.width *= this.bt.shoulder;
    // Camera mode: "fp" hides the head + face (camera IS the head). "tp"
    // pulls the camera back so the user sees their visible character.
    this.cameraMode = "fp";
    // ---------- Posture state ----------
    // The scene drives these every frame to make the character respond to
    // its environment: leaning forward over a railing, crouching to pet a
    // dog, holding arms out for balance in water. Each value is 0..1; the
    // body smoothly lerps toward the targets in update() so transitions
    // are natural, not snappy.
    this.posture = {
      lean: 0,             // forward chest tilt (0 upright → 1 fully leaning)
      crouch: 0,           // knee bend + body drop (0 standing → 1 squat)
      armSpread: 0,        // arms out to the sides for balance
      reach: 0,            // both hands forward, like grabbing a railing
      reachHeight: 0.5,    // 0 hip → 1 chest height for the reach gesture
    };
    this._postureSm = { lean: 0, crouch: 0, armSpread: 0, reach: 0, reachHeight: 0.5 };
    this.group = new THREE.Group();
    // Scene click-pickers must see THROUGH the avatar: in third person the
    // body stands dead centre and its meshes swallowed clicks meant for the
    // world (dogs' pickWorld honours noPick up the parent chain).
    this.group.userData.noPick = true;
    this._build();
    scene.add(this.group);
    // ---- Character portrait rig (third-person only) ----
    // In a dim scene the avatar collapses into a dark silhouette and reads as a
    // faceless blob, so it carries its own short-range lights. But ONE lamp
    // parked on the camera axis is worse than none: light coming from where you
    // are looking casts no shadow you can see, so the nose, the brow and the
    // lip all go flat and a carefully sculpted head renders as a painted mask.
    // That is a three-point rig's whole job — key off-axis for form, a weak
    // opposite fill so the shadow side keeps detail, and a rim to lift the head
    // off the background. Short distance + decay confine all three to the body.
    // Held CLOSE (≈45 cm) with a hard 1.15 m cutoff instead of far and bright.
    // Same illumination on the face, but the floor and the walls are outside
    // the range entirely — a wider lamp was washing a white pool across the
    // room around the player's feet.
    //
    // The three lamps are a PRIVATE rig (makePrivateRig): they light the
    // traveler's own materials and nothing else. The PointLight objects below
    // are kept only as position/colour holders — they are never added to the
    // scene, so they cost the room nothing and never change its light count.
    this.keyLight = new THREE.PointLight(0xfff1dc, 0, 1.15, 2.0);
    this.faceFill = new THREE.PointLight(0xcfe0f2, 0, 1.05, 2.0);
    this.rimLight = new THREE.PointLight(0xffe3c4, 0, 1.00, 2.0);
    this.fillLight = this.keyLight;                 // back-compat alias
    for (const L of [this.keyLight, this.faceFill, this.rimLight]) L.visible = false;
    this._rigOn = false;
    this._privRig = makePrivateRig();
    try { applyPrivateRig(this.group, this._privRig); } catch (e) { console.warn("[body] private rig:", e); }
    // ---- relief beat ----
    // Any scene can announce "the tension just broke" with one event; the face
    // decides for itself whether that is believable yet (see the fear block in
    // update — it only shows while arousal is actually falling).
    this._reliefPulse = 0;
    this._onRelief = () => { this._reliefPulse = 1; };
    try { window.addEventListener("mira-relief", this._onRelief); } catch {}
    // Threat fixation. Scenes publish window.PhobiaThreat = {x,y,z} while a
    // creature is actively threatening; setGazeTarget() is the direct call for
    // anything that would rather push than publish.
    this._threatTarget = new THREE.Vector3();
    this._threatAt = -1e9;
    // Calm watch target (e.g. looking at a friendly dog's head). Separate from
    // threat so low-fear mutual gaze still works.
    this._watchTarget = new THREE.Vector3();
    this._watchAt = -1e9;
  }

  // A world point the eyes should monitor while frightened. Pass null to clear.
  setGazeTarget(v) {
    if (!v) { this._threatAt = -1e9; return; }
    this._threatTarget.set(v.x, v.y, v.z);
    this._threatAt = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  }

  // Calm attention: look at a friendly creature / object without requiring
  // elevated fear. Used for mutual dog gaze. Pass null to clear.
  setWatchTarget(v) {
    if (!v) { this._watchAt = -1e9; return; }
    this._watchTarget.set(v.x, v.y, v.z);
    this._watchAt = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
  }

  _build() {
    const o = this.opts;
    this.rig = buildHumanRig({
      bodyType: o.bodyType,
      skinColor: o.skinColor, shirtColor: o.shirtColor, pantsColor: o.pantsColor,
      shoeColor: o.shoeColor, hairColor: o.hairColor, eyeColor: o.eyeColor,
      hairStyle: o.hairStyle, glasses: o.glasses, facialHair: o.facialHair,
      headwear: o.headwear, topStyle: o.topStyle,
      headY: o.headY, neckY: o.neckY, chestTopY: o.chestTopY, waistY: o.waistY,
      hipY: o.hipY, kneeY: o.kneeY, ankleY: o.ankleY, width: o.width,
      lowDetail: (typeof QUALITY !== "undefined" && QUALITY === "low"),
    });
    this.group.add(this.rig.group);

    // Start streaming the CC0 motion library. It is never awaited: until it
    // lands (and permanently, if it fails) update() falls through to the
    // procedural gait, so a slow network costs a nicer walk, never a stuck one.
    try { loadHumanMotion(); } catch {}
    this._motionBlend = 0;

    // Public handles. These names are the contract the gait / gesture / reach
    // code below (and one throw-animation call site) is written against.
    this.arms = this.rig.arms;               // [{root, elbow, wrist, hand, side}]
    this.legs = this.rig.legs;               // [{hip, knee, foot, side}]
    this.chest = this.rig.chest;             // bone
    this.hips = this.rig.pelvis;             // bone
    this.spine = this.rig.spine;
    this.neck = this.rig.neck;
    this.head = this.rig.head;               // Group riding the head BONE
    this.face = this.rig.face;
    this.eyes = this.rig.eyes;
    this.hairFlutter = this.rig.hairFlutter;
    this._thighLen = this.rig.dims.thighLen;
    this._shinLen = this.rig.dims.shinLen;
    this._upperLen = this.rig.dims.upperLen;
    this._foreLen = this.rig.dims.foreLen;
    this._foot = this.rig.dims.foot;         // sole landmarks (see buildHumanRig)
    // Rest lengths of the torso chain — the gait shortens them a little to
    // absorb the pelvis bob before it reaches the head.
    this._spineY0 = this.spine.position.y;
    this._chestY0 = this.chest.position.y;
    this._neckY0  = this.neck.position.y;
    this._legT = [{}, {}];                   // per-leg gait targets, reused
    this._ikOut = { hip: 0, knee: 0, abduct: 0 };
    // Swing-trajectory keyframes, mutated in place — this runs twice a frame
    // for the life of the scene, and fresh literals here are pure GC churn.
    this._swZ = [[0, 0], [0.30, 0], [0.62, 0], [1, 0]];
    // DO NOT push these key positions later to chase mid-swing knee flexion.
    // Measured against normative gait the swing knee peaks ~0.10 of a cycle
    // early and mid-swing runs ~13° shy, and holding the foot up later does
    // fix that in isolation — but the foot then plants late and high, the
    // closed-loop plant servo takes up the slack, and the STANCE knee ends up
    // 20–25° over-flexed, which reads as a permanent crouch. Tried
    // [0, 0.34, 0.66, 1] with more lift on both mid keys: mean absolute error
    // against the normative curve went 6.9° → 13.4° (reproducible). Stance
    // legs never read this array, so the coupling is entirely through plant
    // timing — which is exactly why it is not obvious from the code.
    this._swY = [[0, 0], [0.30, 0], [0.62, 0], [1, 0]];
    this.head.visible = false;               // FP default — camera is the head
    if (this.head.userData.neckPart) this.head.userData.neckPart.visible = false;
    if (this.rig.hairCurtain) this.rig.hairCurtain.visible = false;

    // Soft contact shadow under the feet. Now that it actually renders (see
    // makeContactShadow) it sits ON TOP of whatever real shadow the scene's
    // key light casts, so it is tuned as contact occlusion — the darkening
    // where body meets floor that a shadow map alone never resolves — rather
    // than as a stand-in shadow. Hence a small radius and a modest peak: the
    // old 0.35 flat black was sized to be the only grounding cue there was.
    // On the low tier, where shadow maps are off entirely, it still is.
    const shadow = makeContactShadow(0.34, IS_LOW_POWER ? 0.42 : 0.26);
    this.group.add(shadow);
    this.shadow = shadow;

    // ---------- Optional scarf ----------
    // Rides the chest bone so it moves with the torso. Only shown when the
    // scene declares wind.
    const scarfMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(o.shirtColor).multiplyScalar(1.15),
      roughness: 1.0, side: THREE.DoubleSide,
    });
    this.scarf = new THREE.Group();
    this.scarf.position.set(0, o.neckY - this.rig.dims.chestY - 0.02, 0);
    this.rig.chest.add(this.scarf);
    const scarfWrap = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.016, 8, 18), scarfMat);
    scarfWrap.rotation.x = Math.PI / 2;
    scarfWrap.scale.set(1, 0.75, 1);
    this.scarf.add(scarfWrap);
    const scarfTails = [];
    for (let i = 0; i < 2; i++) {
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.28 + i * 0.04, 1, 6), scarfMat);
      tail.position.set((i ? -0.03 : 0.03), -0.16 - i * 0.02, 0.05);
      tail.rotation.x = -0.10;
      this.scarf.add(tail);
      scarfTails.push(tail);
    }
    this.scarfTails = scarfTails;
    this.scarf.visible = o.windExposure > 0;

    // Wind / blink phase trackers
    this._windPhase = 0;
    this._blinkTimer = 1 + Math.random() * 4;
    this._blinkStrength = 0;
    this._blinkPhase = 0;
    // Per-hand contact state (finger curl smoothing)
    this._handK = [{ curl: 0, spread: 0 }, { curl: 0, spread: 0 }];
  }

  // Flexion helper — one place owns the elbow's sign so it can never invert.
  _elbowFlex(arm, amount) { arm.elbow.rotation.x = -Math.max(0, amount); }

  // Toggle camera mode — TP reveals the head so the user can SEE their
  // character; FP hides it so the camera isn't inside a skull.
  setCameraMode(mode) {
    this.cameraMode = mode;
    if (this.head) this.head.visible = (mode === "tp");
    // The neck rides its own bone (not the skinned torso) precisely so it can
    // vanish with the head — otherwise looking down in first person shows the
    // underside of your own throat.
    const np = this.head && this.head.userData.neckPart;
    if (np) np.visible = (mode === "tp");
    // Long hair is its own skinned mesh on the body, not under the head.
    if (this.rig && this.rig.hairCurtain) this.rig.hairCurtain.visible = (mode === "tp");
    const tp = (mode === "tp");
    if (this.keyLight) {
      // Third person only (in first person there is no face to light).
      this._rigOn = tp;
      if (!tp) {
        this.keyLight.intensity = this.faceFill.intensity = this.rimLight.intensity = 0;
        if (this._privRig) { this._privRig.off(0); this._privRig.off(1); this._privRig.off(2); }
      }
    }
  }

  // How brightly lit is the scene the avatar is standing in? Sampled at 2 Hz —
  // scenes swap their lighting on a day/night context change, so this can't be
  // measured once at mount.
  _rigStrength(t) {
    if (this._rigK == null || t - (this._rigT || -9) > 0.5) {
      this._rigT = t;
      let amb = 0;
      const own = [this.keyLight, this.faceFill, this.rimLight];
      this.scene.traverse((o) => {
        if (!o.isLight || own.indexOf(o) >= 0) return;
        if (o.isAmbientLight || o.isHemisphereLight) amb += o.intensity;
      });
      this._rigK = Math.max(0.42, Math.min(1, 1.25 - amb * 0.62));
    }
    return this._rigK;
  }

  // ---------- two-bone arm IK ----------
  // Puts the WRIST on `targetLocal` (expressed in the chest bone's space) with
  // the elbow swinging toward `pole`. Returns true when a solution was applied.
  // This is what makes a reach land ON the thing instead of gesturing near it.
  _armIK(arm, targetLocal, k) {
    const A = this._upperLen, B = this._foreLen;
    const s = arm.root.position;
    const v = _bV2.subVectors(targetLocal, s);
    let d = v.length();
    if (d < 1e-4) return false;
    const dmin = Math.abs(A - B) + 0.02, dmax = A + B - 0.012;
    d = Math.max(dmin, Math.min(dmax, d));
    v.normalize();
    // Elbow flexion from the triangle (0 = straight arm).
    const cosE = Math.max(-1, Math.min(1, (A * A + B * B - d * d) / (2 * A * B)));
    const flex = Math.PI - Math.acos(cosE);
    // How far the upper arm sits off the shoulder→target line.
    const corr = Math.acos(Math.max(-1, Math.min(1, (A * A + d * d - B * B) / (2 * A * d))));
    // Pole: a human elbow hangs down-and-back, and a little outboard.
    const pole = _bV3.set(arm.side * 0.30, -0.55, -0.78).normalize();
    // Component of the pole perpendicular to the aim direction.
    const perp = _bV4.copy(pole).addScaledVector(v, -pole.dot(v));
    if (perp.lengthSq() < 1e-6) perp.set(arm.side * 0.3, 0, -1).addScaledVector(v, 0).normalize();
    perp.normalize();
    // Upper-arm direction = aim rotated `corr` toward the elbow pole.
    const upper = _bV5.copy(v).multiplyScalar(Math.cos(corr)).addScaledVector(perp, Math.sin(corr));
    // Basis for the shoulder: local −Y along the upper arm, local +Z on the
    // side the HAND swings toward (i.e. away from the elbow) so a negative
    // elbow rotation is flexion — the same sign the pose code uses.
    const yA = _bV1.copy(upper).multiplyScalar(-1).normalize();
    const zA = perp.clone().multiplyScalar(-1);
    zA.addScaledVector(yA, -zA.dot(yA)).normalize();
    const xA = new THREE.Vector3().crossVectors(yA, zA).normalize();
    _bM1.makeBasis(xA, yA, zA);
    _bQ1.setFromRotationMatrix(_bM1);
    arm.root.quaternion.slerp(_bQ1, k);
    arm.elbow.rotation.x += (-flex - arm.elbow.rotation.x) * k;
    return true;
  }

  // Each frame: anchor the body to the player position, then run the gait,
  // posture, reach, breath and blink layers.
  update(t, walkPhase = 0, walkAmt = 0, controls = null, hands = null) {
    const cam = this.camera;
    const height = this.opts.headY;
    let ax, ay, az;
    if (controls && controls.position) {
      ax = controls.position.x;
      ay = controls.position.y - height;
      az = controls.position.z;
    } else {
      ax = cam.position.x;
      ay = cam.position.y - height;
      az = cam.position.z;
    }
    // Feet pinned to the ACTUAL floor when the scene declares one — deriving
    // ground from "eye minus body height" floated or buried the feet in every
    // scene whose eye height wasn't exactly headY above its floor.
    if (this.opts.groundY != null) ay = this.opts.groundY;
    this.group.position.set(ax, ay, az);
    if (this.keyLight && this._rigOn) {
      // A rig sized for a pitch-black cellar over-lights a sunlit room, so it
      // scales with how much soft light the scene already provides. Ambient and
      // hemisphere only: a scene's directional intensity says nothing about how
      // bright it LOOKS (dusk here runs a 3.0 sun through a dark palette and a
      // low exposure), while the sky/ambient term tracks the fill on a face.
      const rk = this._rigStrength(t);
      // Tuned against the untextured (tint-only) face: the photo bake it was
      // first set for averaged well under white, and at these values the bare
      // skin blew out to a featureless glow that bloom then haloed.
      this.keyLight.intensity  = 0.85 * rk;
      this.faceFill.intensity  = 0.26 * rk;
      this.rimLight.intensity  = 0.50 * rk;
      const hx = ax, hy = ay + this.opts.headY - 0.05, hz = az;
      const ldx = cam.position.x - hx, ldz = cam.position.z - hz;
      const ldl = Math.hypot(ldx, ldz) || 1;
      const ux = ldx / ldl, uz = ldz / ldl;           // head → camera, on the ground plane
      const px = -uz, pz = ux;                        // and its left-hand perpendicular
      // Key: 40° off the viewing axis and above the brow. Off-axis is the whole
      // point — this is the only source that puts a shadow under the nose and
      // the lower lip, which is how a viewer reads a face as three-dimensional.
      this.keyLight.position.set(hx + (ux * 0.28 + px * 0.24), hy + 0.24, hz + (uz * 0.28 + pz * 0.24));
      // Fill: opposite side, weak and cool, just enough that the shadow half
      // keeps its detail instead of clipping to black.
      this.faceFill.position.set(hx + (ux * 0.34 - px * 0.30), hy + 0.05, hz + (uz * 0.34 - pz * 0.30));
      // Rim: behind and above, to peel the head and shoulders off the room.
      this.rimLight.position.set(hx - ux * 0.36 - px * 0.14, hy + 0.30, hz - uz * 0.36 - pz * 0.14);
      // Full-strength values, before the ambient scaling in _rigStrength():
      // roughly 4:1 key-to-fill, where a face stops looking either flat or
      // half-missing.
      if (this._privRig) {
        this._privRig.set(0, this.keyLight.position, this.keyLight.color, this.keyLight.intensity, this.keyLight.distance);
        this._privRig.set(1, this.faceFill.position, this.faceFill.color, this.faceFill.intensity, this.faceFill.distance);
        this._privRig.set(2, this.rimLight.position, this.rimLight.color, this.rimLight.intensity, this.rimLight.distance);
      }
    }
    const dtB = Math.min(0.05, Math.max(0.001, t - (this._lastBodyT || t)));

    // Fade the body out when the TP camera is pulled right up against it, and
    // when an FP eye-drop crouch sinks the camera into your own chest.
    {
      const fdx = cam.position.x - ax;
      const fdy = cam.position.y - (ay + this.opts.headY * 0.8);
      const fdz = cam.position.z - az;
      const dCam = Math.hypot(fdx, fdy, fdz);
      let fadeTarget;
      if (this.cameraMode === "tp") {
        fadeTarget = Math.max(0, Math.min(1, (dCam - 0.35) / 0.35));
      } else {
        const horiz = Math.hypot(fdx, fdz);
        const sink = (ay + this.opts.headY * 0.97) - cam.position.y;
        fadeTarget = horiz < 0.4 ? 1 - Math.max(0, Math.min(1, sink / 0.18)) : 1;
      }
      if (this._fadeK == null) this._fadeK = 1;
      this._fadeK += (fadeTarget - this._fadeK) * Math.min(1, dtB * 15);
      const k = this._fadeK;
      if (k < 0.995 || this._fadeApplied) {
        if (!this._fadeMats) {
          this._fadeMats = [];
          const seen = new Set();
          this.group.traverse(ob => {
            if (!ob.isMesh || !ob.material) return;
            const mats = Array.isArray(ob.material) ? ob.material : [ob.material];
            for (const m of mats) {
              if (seen.has(m)) continue;
              seen.add(m);
              this._fadeMats.push({ m, t: m.transparent, o: m.opacity });
            }
          });
        }
        for (const e of this._fadeMats) {
          if (k >= 0.995) { e.m.transparent = e.t; e.m.opacity = e.o; }
          else { e.m.transparent = true; e.m.opacity = e.o * Math.max(0, k); }
        }
        this._fadeApplied = k < 0.995;
        this.group.visible = k > 0.03;
      }
    }

    // ---------- facing ----------
    // The mesh faces LOCAL +Z while the camera looks toward −Z, hence the π.
    let aimYaw = 0, aimPitch = 0;
    if (controls && typeof controls.yaw === "number") {
      // Third-person travel facing: a person walking left TURNS left and
      // strides forward — only a camera-locked FP torso crab-walks.
      let offTarget = 0;
      if (this.cameraMode === "tp" && controls.getWalkState) {
        const wsT = controls.getWalkState();
        // A live touch OWNS the facing: while the hand is on something (petting
        // the dog, gripping the rail), adjust steps must stay squared to it —
        // stepping sideways around a dog you're touching is a SIDE-STEP, not a
        // spin-away-and-walk. Only a committed stride (amount > 0.75) breaks
        // the square-up; the reach lifecycle drops the hand soon after anyway.
        // Gate on the ANALOG pace (speedNorm), not the binary walk amount —
        // amount saturates to 1 on any input, so it can't tell an adjust
        // step from a committed stride.
        const reachLock = hands && hands._reach && hands._reachStrength > 0.3
          && hands._reachWorld && (wsT.speedNorm == null || wsT.speedNorm < 0.7);
        if (reachLock) {
          const rdx = hands._reachWorld.x - this.group.position.x;
          const rdz = hands._reachWorld.z - this.group.position.z;
          if (rdx * rdx + rdz * rdz > 0.04) {
            let aR = (this._camYawSm != null ? this._camYawSm : controls.yaw) + Math.PI - Math.atan2(rdx, rdz);
            while (aR > Math.PI) aR -= Math.PI * 2;
            while (aR < -Math.PI) aR += Math.PI * 2;
            offTarget = Math.max(-2.4, Math.min(2.4, aR));
          }
        } else if (wsT.amount > 0.2 && Math.hypot(wsT.fwd, wsT.side) > 0.2) {
          let aT = Math.atan2(wsT.side, wsT.fwd);
          // Past 90° the traveler is going BACKWARDS. Facing is flipped so
          // they keep their eyes forward rather than turning their back — in
          // this game that is the whole point: you retreat from the dog while
          // still watching it, and spinning round to jog away would break the
          // exposure. But the legs must then run the stride BACKWARDS too, or
          // the result is a moonwalk: body drifting one way, gait cycling the
          // other. Record it here; the retarget at the end of update() plays
          // the clip in reverse when it is set.
          this._travelReversed = Math.abs(aT) > Math.PI / 2 + 0.05;
          if (this._travelReversed) aT = Math.atan2(-wsT.side, -wsT.fwd);
          offTarget = aT;
        } else {
          this._travelReversed = false;
        }
      }
      if (this._travelOff == null) this._travelOff = 0;
      let dOff = offTarget - this._travelOff;
      while (dOff > Math.PI) dOff -= Math.PI * 2;
      while (dOff < -Math.PI) dOff += Math.PI * 2;
      // Snappier facing into a committed stride; softer for adjust steps.
      const faceRate = walkAmt > 0.45 ? 10 : 6.5;
      this._travelOff += dOff * Math.min(1, dtB * faceRate);
      if (this._camYawSm == null) this._camYawSm = controls.yaw;
      if (this.cameraMode === "tp") {
        let dYawC = controls.yaw - this._camYawSm;
        while (dYawC > Math.PI) dYawC -= Math.PI * 2;
        while (dYawC < -Math.PI) dYawC += Math.PI * 2;
        // Body yaw lags camera more when idle (look around), catches up
        // quickly once walking so the torso isn't crab-walking.
        this._camYawSm += dYawC * Math.min(1, dtB * (walkAmt > 0.3 ? 13 : 4.8));
      } else {
        this._camYawSm = controls.yaw;
      }
      this.group.rotation.y = this._camYawSm + Math.PI - this._travelOff;
      // Head leads, body follows.
      if (this.cameraMode === "tp") {
        aimYaw = (controls.yaw - this._camYawSm) + this._travelOff;
        while (aimYaw > Math.PI) aimYaw -= Math.PI * 2;
        while (aimYaw < -Math.PI) aimYaw += Math.PI * 2;
        aimYaw = Math.max(-0.85, Math.min(0.85, aimYaw));
        aimPitch = Math.max(-0.50, Math.min(0.55, -(controls.pitch || 0) * 0.50));
      }
      if (this._headAimYaw == null) { this._headAimYaw = 0; this._headAimPitch = 0; }
      this._headAimYaw += (aimYaw - this._headAimYaw) * Math.min(1, dtB * 10);
      this._headAimPitch += (aimPitch - this._headAimPitch) * Math.min(1, dtB * 10);
    }

    const idleFactor = 1 - (walkAmt || 0);
    // ---- fear on the face ----
    // PhobiaFear is the same 0..100 signal the narration, audio and grade all
    // read; the character has no business being the only thing in the scene
    // that doesn't react to it.
    {
      let fearRaw = 0;
      try {
        if (window.PhobiaFear && window.PhobiaFear.get) fearRaw = window.PhobiaFear.get() / 100;
      } catch {}
      if (this._fearSm == null) this._fearSm = 0;
      const clamped = Math.max(0, Math.min(1, fearRaw));
      // Fast onset, slow decay. A symmetric lerp put the face ~0.6 s behind a
      // lunge and then let it relax exactly as fast as it startled, which is
      // the one thing real expressions never do.
      const rate = clamped > this._fearSm ? 6.0 : 0.9;
      const prevFear = this._fearSm;
      this._fearSm += (clamped - this._fearSm) * Math.min(1, dtB * rate);
      this._fearFalling = this._fearSm < prevFear - 1e-4;
      if (this.face && this.face.setFear) this.face.setFear(this._fearSm);
      // ---- relief pulse ----
      // Scenes dispatch 'mira-relief' on a completion / calm beat. It only
      // reads as relief while arousal is on the way DOWN, so the pulse is
      // gated on a falling fear signal rather than fired blind.
      if (this._reliefPulse == null) this._reliefPulse = 0;
      if (this._reliefPulse > 0) this._reliefPulse = Math.max(0, this._reliefPulse - dtB / 3.0);
      if (this.face && this.face.setRelief) {
        const gate = (this._fearFalling || this._fearSm < 0.12) ? 1 : 0.25;
        this.face.setRelief(this._reliefPulse * gate * (1 - this._fearSm * 0.6));
      }
      // ---- contact on the face ----
      // Reaching at full stretch is work, and it shows: brow knit and a squint.
      // Landing the hand on a living thing you were afraid of is the beat this
      // whole scene exists for — the face used to stay perfectly blank through
      // it, which is exactly what makes contact read as two props overlapping
      // rather than one person touching another. The smile only comes once
      // arousal has actually come down; a grin on a terrified face is worse
      // than no expression at all.
      if (this.face.setEffort) this.face.setEffort(this._contactStrain || 0);
      if (this.face.setSmile) {
        const settled = Math.max(0, 1 - this._fearSm * 1.6);
        this.face.setSmile((this._contactLanded || 0) * settled * 0.7);
      }
      // Soft/fond eyes once contact has actually landed and arousal has
      // settled: the warm look of touching something living. Builds a touch
      // slower than the smile so the face arrives at fondness, not a snap.
      if (this.face.setSoft) {
        const settled = Math.max(0, 1 - this._fearSm * 1.4);
        const wantSoft = (this._contactLanded || 0) * settled * 0.85;
        this._softSm = (this._softSm || 0)
          + (wantSoft - (this._softSm || 0)) * Math.min(1, dtB * 1.8);
        this.face.setSoft(this._softSm);
      }
      // ---- talking (viseme random-walk) ----
      // window.PhobiaTalk is the same 0/1 hold-to-speak signal the speaking
      // rung already tracks. Real speech is a walk through mouth SHAPES, not
      // a jaw pumping at one amplitude: open "AA", stretched "EE", rounded
      // "OO", and the closed-consonant beat between them. Each viseme lives
      // 90–160 ms and never repeats back-to-back — the rhythm of real speech.
      if (this.face && this.face.setTalkShape) {
        let talkRaw = 0;
        try { talkRaw = Math.max(0, Math.min(1, +window.PhobiaTalk || 0)); } catch {}
        if (talkRaw > 0.02) {
          if (this._talkNextAt == null || t > this._talkNextAt) {
            // Weighted viseme pick (no immediate repeat): AA leads, EE and OO
            // share the middles, M rests between bursts.
            const VISEMES = [
              { open: 0.62, wide: 0.05, round: 0.0,  w: 0.38 },   // AA
              { open: 0.30, wide: 0.85, round: 0.0,  w: 0.24 },   // EE
              { open: 0.38, wide: 0.0,  round: 0.9,  w: 0.20 },   // OO
              { open: 0.06, wide: 0.15, round: 0.10, w: 0.18 },   // M/beat
            ];
            let pick = this._talkVis != null ? this._talkVis : 0, guard = 0;
            if (Math.random() < 0.72) {
              const r = Math.random();
              let acc = 0;
              for (let i = 0; i < VISEMES.length; i++) {
                acc += VISEMES[i].w;
                if (r <= acc) { pick = i; break; }
              }
              while (pick === this._talkVis && guard++ < 4) pick = Math.floor(Math.random() * VISEMES.length);
            }
            this._talkVis = pick;
            const v = VISEMES[pick];
            // Per-phoneme jitter so no two "AA"s land at the same aperture.
            this._talkOpen  = (v.open  * (0.8 + Math.random() * 0.4)) * talkRaw;
            this._talkWideT = v.wide   * (0.75 + Math.random() * 0.35) * talkRaw;
            this._talkRoundT = v.round * (0.75 + Math.random() * 0.35) * talkRaw;
            this._talkNextAt = t + 0.09 + Math.random() * 0.07;
          }
        } else {
          this._talkOpen = 0; this._talkWideT = 0; this._talkRoundT = 0;
          this._talkNextAt = null; this._talkVis = null;
        }
        // Ease between phonemes so the jaw travels instead of teleporting;
        // the shape muscles follow a touch slower than the jaw (real lips lag
        // the mandible by a fraction of a syllable).
        this._talkSm = (this._talkSm || 0)
          + ((this._talkOpen || 0) - (this._talkSm || 0)) * Math.min(1, dtB * 22);
        this._talkWideSm = (this._talkWideSm || 0)
          + ((this._talkWideT || 0) - (this._talkWideSm || 0)) * Math.min(1, dtB * 13);
        this._talkRoundSm = (this._talkRoundSm || 0)
          + ((this._talkRoundT || 0) - (this._talkRoundSm || 0)) * Math.min(1, dtB * 13);
        this.face.setTalkShape(this._talkSm, this._talkWideSm, this._talkRoundSm);
      }
      // ---- micro-expressions (idle liveliness) ----
      // A calm, idle face is never perfectly blank: every few seconds a small
      // asymmetric beat — a left half-smile with a one-brow lift — plays out
      // over ~1 s. Gated on low fear: a startled face raises both brows and
      // never smirks. Relief beats (arousal on the way down) borrow the same
      // channel at full weight, so the "I actually did it" smile arrives
      // lopsided and earned instead of masked on.
      if (this.face && this.face.setHalfSmile) {
        const calm = (this._fearSm || 0) < 0.22 && idleFactor > 0.55;
        const relieved = this._reliefPulse > 0.25;
        if (this._microNextAt == null) this._microNextAt = t + 5 + Math.random() * 7;
        if (relieved && !this._reliefMicroFired) {
          this._reliefMicroFired = true;
          this._microT = 1;                       // fire immediately, stronger
          this._microAmp = 1;
        } else if (!relieved) {
          this._reliefMicroFired = false;
        }
        if (calm && t > this._microNextAt) {
          this._microNextAt = t + 7 + Math.random() * 9;
          this._microT = 1;
          this._microAmp = 0.45 + Math.random() * 0.3;
        }
        let halfSmile = 0, browFlash = 0;
        if (this._microT > 0) {
          this._microT = Math.max(0, this._microT - dtB / 1.05);
          const env = Math.sin((1 - this._microT) * Math.PI);   // 0→1→0
          const amp = this._microAmp || 0.5;
          halfSmile = env * amp;
          browFlash = env * 0.75 * amp;
        }
        this._halfSmileSm = (this._halfSmileSm || 0)
          + (halfSmile - (this._halfSmileSm || 0)) * Math.min(1, dtB * 10);
        this.face.setHalfSmile(this._halfSmileSm);
        if (this.face.setBrowFlash) this.face.setBrowFlash(browFlash);
      }
    }
    const fearK = this._fearSm || 0;
    // Breathing quickens and shallows with arousal — the oldest tell there is.
    const breathRate = 1.4 + fearK * 1.5;
    this._breathPh = (this._breathPh || 0) + dtB * breathRate;
    const breathPhase = Math.sin(this._breathPh);
    // Visible rib expansion. The `breath` bone has no children, so scaling it
    // inflates the ribcage WITHOUT dragging the neck, head or arms with it.
    if (this.rig.breath) {
      const strength = (0.6 + idleFactor * 0.4) * (1 - fearK * 0.35);
      this.rig.breath.scale.set(
        1 + breathPhase * 0.020 * strength,
        1 + breathPhase * 0.014 * strength,
        1 + breathPhase * 0.026 * strength
      );
    }

    // ---------- Gait engine ----------
    // A real human stride: the leg swings forward with the KNEE flexing to
    // clear the ground (peak flex at mid-swing), lands almost straight, then
    // stays near-straight through stance while the body vaults over it.
    let gaitFwd = 1, gaitSide = 0, strideK = 1, speedNorm = 1;
    if (controls && controls.getWalkState) {
      const ws = controls.getWalkState();
      gaitFwd = ws.fwd;
      gaitSide = ws.side;
      speedNorm = ws.speedNorm == null ? 1 : ws.speedNorm;
      strideK = 0.55 + 0.45 * speedNorm;
      // Metres per step, straight from the phase engine — the gait sizes its
      // leg swing to this so the planted foot matches the ground.
      if (ws.stride) this._strideLen = ws.stride;
      // Turn-in-place footwork signal (no translation, just yaw rate) — the
      // legs need to know it's a pivot, because the direction vector is ~0.
      this._wsShuffle = ws.shuffle || 0;
      const off = this._travelOff || 0;
      if (Math.abs(off) > 0.001) {
        const c = Math.cos(off), s = Math.sin(off);
        gaitFwd = ws.fwd * c + ws.side * s;
        gaitSide = -ws.fwd * s + ws.side * c;
      }
      if (ws.amount > walkAmt) walkAmt = ws.amount;
    }
    const fwdShare = Math.abs(gaitFwd);
    const sideShare = Math.abs(gaitSide);
    // How much does LATERAL travel dominate? 0 on a forward walk or a 45°
    // diagonal, 1 on a committed strafe. Below it the legs run the ordinary
    // sagittal cycle; at full strafe the pattern switches to a real side-step
    // (the old code stretched the forward cycle sideways — the classic
    // "gliding crab" tell).
    const latDom = _hsat((sideShare - fwdShare) / 0.25) * sideShare;
    const shufK = Math.max(0, (this._wsShuffle || 0) - walkAmt * 0.5);
    // Body-local travel this frame: how far forward and how far sideways the
    // character actually moved along its own axes. The planted foot gives back
    // exactly this, which is what makes sliding impossible rather than merely
    // unlikely.
    {
      const yawB = this.group.rotation.y;      // already includes the +Z facing flip
      const fx = Math.sin(yawB), fz = Math.cos(yawB);
      if (this._prevPos == null) this._prevPos = { x: ax, z: az };
      const dx = ax - this._prevPos.x, dz = az - this._prevPos.z;
      // A jump this big is not walking — it is a respawn, a scene teleport or a
      // frame hitch. Feeding it to the closed loop would hand the planted foot a
      // target metres out of reach, and a foot the leg cannot reach drags the
      // whole pelvis to the floor. Drop the plant and start the next step clean.
      const teleported = (dx * dx + dz * dz) > 0.25;
      this._stepFwd  = teleported ? 0 : dx * fx + dz * fz;
      this._stepSide = teleported ? 0 : dx * Math.cos(yawB) - dz * Math.sin(yawB);
      this._prevPos.x = ax; this._prevPos.z = az;
      if (teleported) {
        for (const leg of this.legs) {
          leg._plantF = 0; leg._plantSd = 0; leg._plantS = null;
          leg._anchor = null; leg._hipPrev = null;
          leg._hipStepF = 0; leg._hipStepS = 0;
        }
      }
    }

    // ---- stride-locked legs: rockers, planted soles, inverse kinematics ----
    // A foot is not a point at the ankle. It lands on the heel, rolls flat, then
    // pivots over the toe to push off — three rockers, and they are what turns a
    // swinging leg into forward travel. Posing the leg from the ANKLE (as this
    // used to) see-saws the sole about a joint 3.6 cm above the ground: the toe
    // punches through the floor at push-off, the heel sinks at contact, the foot
    // floats up to 7 cm at the moment it is supposed to plant, and no amount of
    // curve-tweaking above that can make it read as a human step.
    //
    // So the order is inverted. Put the CONTACT POINT on the ground, prescribe
    // the sole's pitch, work out where that forces the ankle to be, and let
    // two-link IK find the hip and knee. Both feet then sit exactly on the
    // floor, and the joint curves fall out of the geometry — which is how they
    // arise in a real leg — instead of being drawn by hand.
    const legLen = (this.opts.hipY - this.opts.ankleY);
    const strideLen = this._strideLen || legLen * 0.795 * strideK;
    const G = _GAIT;
    const STANCE = G.stance;
    const ft = this._foot;
    // Half the fore-aft sweep of a planted foot. NOT half a stride: the body
    // covers two strides per gait cycle, so during one foot's 62% stance it
    // travels 1.24 strides — and the foot has to give back exactly that.
    const half = Math.min(legLen * 0.85, STANCE * strideLen) * walkAmt;
    const A = this._thighLen, Bl = this._shinLen;
    // How much of the travel is fore-aft? A committed stride rolls heel-to-toe;
    // a pure side-step or a pivot lands flat-footed, which is what people
    // actually do — you do not heel-strike sideways.
    const rollK = walkAmt * Math.min(1, fwdShare * 1.3);
    // Walking backward reverses the contact sequence: the TOE lands first and
    // the body rocks back onto the heel. Same rockers, mirrored.
    const backw = gaitFwd < 0;
    const leadZ = backw ? ft.toeZ : ft.heelZ;     // first point down
    const pushZ = backw ? ft.heelZ : ft.toeZ;     // last point up
    const pitchSign = backw ? -0.72 : 1;          // a backward push-off is flatter
    // Walking tracks the feet in toward the midline: hips sit ~20 cm apart but
    // step width is ~10 cm. Hanging each leg straight down from its hip — which
    // is what zero adduction does — leaves the feet 22 cm apart, and that wide
    // base is a waddle, not a walk. The target is calibrated against the
    // MEASURED width rather than solved for, because the closed loop is also
    // busy cancelling pelvic list (which swings each ankle ±5 cm laterally over
    // a stance) and the two share the same channel. Standing (walkAmt 0) keeps
    // the hip-width stance, which is also what people do.
    const hipHalf = Math.abs(this.legs[0].hip.position.x);
    const footInset = Math.max(0, hipHalf - 0.022 * (legLen / 0.78)) * walkAmt;

    // ---- pass 1: where each foot has to be ----
    const legT = this._legT;
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i], T = legT[i];
      const th = walkPhase + (leg.side > 0 ? 0 : Math.PI);
      // s: 0 at initial contact, rising through stance then swing.
      let s = ((th - Math.PI / 2) / (Math.PI * 2)) % 1;
      if (s < 0) s += 1;
      // Side-step roles: on a committed strafe the leg on the side of travel
      // LEADS (steps out, lands early, shuffles low) while the trailing leg
      // CROSSES in front of it — travelling further than the body did, with
      // a real knee lift. Blended by latDom so diagonals sit between the two
      // patterns. Latched per leg so stance and swing agree at footfall.
      const leadLeg = (leg.side > 0) === (gaitSide > 0);
      if (s >= STANCE || leg._latAmp == null) {
        // The crossing leg travels further than the leading one, but not by the
        // margin this used to claim: with the lateral reach now costing real hip
        // height (it always did, on a real leg), 1.65× put the character into a
        // half-squat every time it side-stepped.
        leg._latAmp = latDom > 0.001
          ? (leadLeg ? 0.55 + 0.25 * latDom : 0.55 + 0.55 * latDom)
          : 0.55;
      }
      const pitch = _solePitch(s) * rollK * pitchSign;
      const planted = s < STANCE;
      // No two steps are the same length. Real walking carries ~3% step-to-step
      // variability and a standing 1–2% left/right asymmetry (everyone has a
      // dominant leg); a cycle that repeats to the millimetre is the loudest
      // robot tell there is, and it survives however correct the joint angles
      // are. Rolled as the foot LEAVES the ground, so the swing trajectory and
      // the stance that follows are sized by the same number.
      if (leg._wasPlanted && !planted) {
        leg._stepVar = 1 + (Math.random() - 0.5) * 0.075;
        leg._liftVar = 1 + (Math.random() - 0.5) * 0.22;
      }
      leg._wasPlanted = planted;
      if (leg._stepVar == null) { leg._stepVar = 1; leg._liftVar = 1; }
      // A fixed per-side bias on top: the same leg is always the slightly
      // longer stepper, which is what makes a gait belong to a person.
      const halfL = half * leg._stepVar * (leg.side > 0 ? 1.014 : 0.986);
      // Which point of the sole carries the weight right now. Swapping at
      // heel-off is what makes the body vault over the forefoot.
      const pz = planted ? (s < G.heelOff ? leadZ : pushZ) : pushZ;
      // Ankle offsets from the contact anchor. `A + pz(1−cos) + drop·sin` is
      // the ankle of a rigid sole rotated by `pitch` about a pivot `pz` along
      // it — at pitch 0 that collapses to the anchor itself, so a flat-footed
      // strafe costs nothing.
      const rockZ = pz * (1 - Math.cos(pitch)) + ft.soleDrop * Math.sin(pitch);
      const rockY = ft.soleDrop * Math.cos(pitch) + pz * Math.sin(pitch);
      let alongF, alongS, swingT = 0;
      if (planted) {
        if (leg._plantS == null || s < leg._plantS) {     // a fresh footfall
          leg._plantF = 0; leg._plantSd = 0;
          leg._dirF = gaitFwd; leg._dirS = gaitSide;
          leg._anchor = null;                              // re-anchor below
        }
        leg._plantS = s;
        // Measured hip travel, not body travel. The body origin and the hip
        // joint do NOT move together: pelvis yaw swings each hip fore and aft
        // by ~1.7 cm per step, roll lifts it, the reach hinge carries it
        // forward. Cancelling the body's motion leaves all of that as drift.
        leg._plantF  += (leg._hipStepF != null ? leg._hipStepF : this._stepFwd);
        leg._plantSd += (leg._hipStepS != null ? leg._hipStepS : this._stepSide);
        // Standing still there is no stride for the loop to close around, but the
        // servo keeps integrating hip micro-motion — breathing, the idle weight
        // rock — and ten seconds of that is enough to leave one foot hanging a
        // centimetre and a half in the air. Bleed the offset off once the walk
        // has stopped; a live stride re-establishes it within one footfall.
        if (walkAmt < 0.05) {
          const keep = Math.exp(-dtB * 8);
          leg._plantF *= keep; leg._plantSd *= keep;
        }
        alongF = halfL * leg._dirF - leg._plantF + rockZ;
        alongS = halfL * leg._dirS * leg._latAmp - leg._plantSd;
        T.ankleH = rockY;
      } else {
        leg._plantS = null;
        swingT = (s - STANCE) / (1 - STANCE);
        // Toe-off pose → next contact pose. The ankle does not travel straight
        // between them: it stays high and BEHIND for the first third (the knee
        // whip that gives swing its 60° of flexion), then skims forward low.
        const pTO = _solePitch(STANCE - 1e-4) * rollK * pitchSign;
        const pIC = G.pitchIC * rollK * pitchSign;
        const zTO = -halfL * gaitFwd + pushZ * (1 - Math.cos(pTO)) + ft.soleDrop * Math.sin(pTO);
        const yTO = ft.soleDrop * Math.cos(pTO) + pushZ * Math.sin(pTO);
        const zIC =  halfL * gaitFwd + leadZ * (1 - Math.cos(pIC)) + ft.soleDrop * Math.sin(pIC);
        const yIC = ft.soleDrop * Math.cos(pIC) + leadZ * Math.sin(pIC);
        const zMid = zTO + (zIC - zTO) * 0.64;
        // Mid-swing skim height. Scaled by walkAmt so the settle-step pose (which
        // parks one leg at s ≈ 0.75, mid-swing) puts the foot back on the floor
        // instead of leaving the character standing on one leg.
        const lift = 0.055 * (legLen / 0.78) * walkAmt * leg._liftVar;
        const low = ft.soleDrop + lift;
        const kz = this._swZ, ky = this._swY;
        kz[0][1] = zTO; kz[1][1] = zTO * 0.38; kz[2][1] = zMid; kz[3][1] = zIC;
        // Peak clearance earlier in swing (clinical mid-swing ~30% of swing).
        // The 1.35 applies to the LIFT, not to `low` — `low` carries soleDrop,
        // the ankle's height when the sole is flat on the floor, and scaling
        // that scales the floor: at walkAmt 0 the settle-step leg (parked at
        // s ≈ 0.75) hung 18 mm in the air, which is the exact failure the
        // comment above says this term exists to prevent.
        ky[0][1] = yTO; ky[1][1] = low + lift * 0.35; ky[2][1] = low;  ky[3][1] = yIC;
        alongF = _track(kz, swingT);
        T.ankleH = _track(ky, swingT);
        alongS = (-halfL + 2 * halfL * _sstep(0, 1, swingT)) * gaitSide * leg._latAmp;
        // Turning on the spot is foot WORK: alternating knee-ups, not a
        // pirouette on frozen legs. `half` is ~0 here, so lift the ankle
        // directly and let the IK fold the knee to match.
        if (shufK > 0.001) T.ankleH += shufK * 0.055 * Math.sin(Math.PI * swingT);
        // Where this foot is GOING to land. Known from the moment it leaves the
        // ground, and pass 2 uses it to start lowering the pelvis early instead
        // of waiting to be forced down at the instant of contact.
        T.icZ = zIC; T.icY = yIC;
        T.icS = halfL * gaitSide * leg._latAmp - leg.side * footInset;
      }
      alongS -= leg.side * footInset;
      // Never ask for a foot the leg cannot reach. Drift in the closed loop —
      // a collision sliding the body along a wall, a blocked walk, a hitch —
      // can otherwise push the target past full extension, and `sqrt` of a
      // negative reach then folds the pelvis onto the floor.
      const maxH = (A + Bl) * 0.90;
      const need = Math.hypot(alongF, alongS);
      if (need > maxH) {
        const k = maxH / need;
        // Fold the correction into the closed loop so it settles over the next
        // few frames instead of being re-clamped, and re-fought, forever.
        if (planted) {
          leg._plantF  += alongF * (1 - k);
          leg._plantSd += alongS * (1 - k);
        }
        alongF *= k; alongS *= k;
      }
      if (planted) { T.icZ = null; T.icY = 0; T.icS = 0; }
      T.s = s; T.planted = planted; T.pitch = pitch;
      T.alongF = alongF; T.alongS = alongS; T.swingT = swingT; T.leadLeg = leadLeg;
      T.pivotToe = planted && s >= G.heelOff;
    }

    // ---- pass 2: how high the pelvis rides ----
    // Not a hand-drawn bob curve: the highest the hip can sit while every
    // planted foot still reaches its contact with the knee flexion a real leg
    // carries at that point in the cycle. The vertical travel of a walk is a
    // CONSEQUENCE of the leg geometry, and deriving it is what keeps both feet
    // on the floor through double support.
    const hipStand = legLen + ft.soleDrop;
    let hipH = Infinity;
    for (const T of legT) {
      if (!T.planted) continue;
      const L = _legReach(_track(G.kneeKeys, T.s), A, Bl);
      const horiz = T.alongF * T.alongF + T.alongS * T.alongS;
      hipH = Math.min(hipH, T.ankleH + Math.sqrt(Math.max(0, L * L - horiz)));
    }
    // Terminal swing: the body is already lowering to meet the floor before the
    // heel lands. Without it the pelvis holds high until contact and then drops
    // three centimetres in a single frame — a visible hitch at every footfall.
    for (const T of legT) {
      if (T.planted) continue;
      // Aim at the cap this foot will impose AT CONTACT, not the one its
      // current mid-air position implies. The latter only drops below the
      // standing leg's cap in the last fraction of the swing, so the pelvis got
      // no warning and was forced down 26 mm in four frames — a sawtooth, and
      // in first person a lurch at every step. Using the landing point spreads
      // that descent across the whole swing, which is what a walking pelvis
      // actually does. Descending early is always safe: a foot can only fail to
      // reach when the pelvis is too HIGH.
      if (T.icZ == null) continue;
      const w = _sstep(0.05, 1, T.swingT);
      if (w <= 0) continue;
      const L = _legReach(G.kneeKeys[0][1], A, Bl);
      const horiz = T.icZ * T.icZ + T.icS * T.icS;
      const cand = T.icY + Math.sqrt(Math.max(0, L * L - horiz));
      if (cand < hipH) hipH += (cand - hipH) * w;
    }
    if (!isFinite(hipH)) hipH = hipStand;
    // Walking never sinks the hips into a squat. A foot can be left out of reach
    // — reverse direction mid-stance and the trailing one always is — and
    // without this floor the pelvis chases it all the way down. Capped, the
    // over-reaching foot simply lifts early, which is what a person does.
    hipH = Math.max(hipH, hipStand - 0.135 * (legLen / 0.78));
    hipH = hipStand + (hipH - hipStand) * walkAmt;

    // ---- trunk compliance ----
    // A real spine absorbs most of the pelvis's rise and fall: the head
    // oscillates roughly 40% of what the hips do. On a rigid chain the head
    // follows the pelvis 1:1 (measured: 6.2 cm of head bob against 7.1 cm at
    // the hip), and THAT is what leaves a kinematically correct walk still
    // reading as a doll bouncing on springs. Absorbing it across the lumbar,
    // thoracic and cervical joints is both the fix and what actually happens.
    if (this._hipMean == null) this._hipMean = hipH;
    this._hipMean += (hipH - this._hipMean) * Math.min(1, dtB * 1.0);
    // 0.28: absorb more pelvis bob into the spine so the head (and FP camera)
    // stay steadier — the walk-cycle sheet's head barely oscillates vs hips.
    const bobDev = Math.max(-0.05, Math.min(0.05, hipH - this._hipMean)) * 0.28 * walkAmt;
    this.spine.position.y = this._spineY0 - bobDev * 0.42;
    this.chest.position.y = this._chestY0 - bobDev * 0.38;
    this.neck.position.y  = this._neckY0  - bobDev * 0.32;

    // ---- pass 3: solve each leg ----
    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i], T = legT[i];
      const sol = _legIK(T.alongS, T.alongF, T.ankleH - hipH, A, Bl, this._ikOut);
      leg.hip.rotation.x = sol.hip;
      leg.knee.rotation.x = sol.knee;
      leg.hip.rotation.z = sol.abduct;
      // Crossing-leg twist: on a strafe the trailing thigh rotates across the
      // midline during swing instead of describing a wide outward arc — the
      // visible "cross" that separates a side-step from a sideways glide.
      leg.hip.rotation.y = (!T.leadLeg && latDom > 0.001 && T.swingT > 0)
        ? latDom * Math.sign(gaitSide) * Math.sin(Math.PI * T.swingT) * 0.30
        : 0;
      // The sole's WORLD pitch is the thing the rockers prescribe, so the ankle
      // angle is whatever is left after the hip and knee have had their say.
      leg._gaitPitch = T.pitch;
      leg.foot.rotation.x = T.pitch - sol.hip - sol.knee;
      leg.foot.rotation.z = -leg.hip.rotation.z;   // sole stays level sideways
      // Remember which sole point is bearing weight — the closed-loop servo in
      // the ground clamp anchors on it, and it has to re-anchor when the pivot
      // migrates from heel to toe.
      if (T.pivotToe !== leg._pivotToe) { leg._anchor = null; leg._pivotToe = T.pivotToe; }
      leg._pivotPt = T.pivotToe ? leg.toePt : leg.heelPt;
    }
    // Lateral weight shift over the planted foot, expressed as a ROLL of the
    // pelvis and spine rather than a translation of the whole body. Sliding the
    // body sideways drags the planted foot with it; leaning over it is both what
    // a person actually does and what leaves the foot where it was.
    // Split by source. The stride's roll belongs on the PELVIS — that is real
    // pelvic list, and during single support only one foot is down so it costs
    // nothing. The slow idle sway must NOT go there: standing still, both feet
    // are on the floor, and rolling the pelvis lifts one hip ~4 mm, which with
    // honest sole contact is a shoe visibly hanging in the air.
    const rollWalk = Math.sin(walkPhase) * walkAmt * this.bt.sway;
    const rollIdle = Math.sin(t * 0.45) * 0.55 * idleFactor;
    const weightRoll = rollWalk + rollIdle;

    // ---------- Posture (smoothed lerp toward the scene's targets) ----------
    const ps = this._postureSm;
    const pt = this.posture;
    const lerpRate = Math.min(1, dtB * 4.5);
    ps.lean       += (pt.lean       - ps.lean      ) * lerpRate;
    ps.crouch     += (pt.crouch     - ps.crouch    ) * lerpRate;
    ps.armSpread  += (pt.armSpread  - ps.armSpread ) * lerpRate;
    ps.reach      += (pt.reach      - ps.reach     ) * lerpRate;
    ps.reachHeight += (pt.reachHeight - ps.reachHeight) * lerpRate;

    // ---------- World-anchored contact ----------
    // Resolved BEFORE the spine and legs, because touching something is a
    // whole-body act: the arm alone can't reach a dog's back, so the knees and
    // the spine have to take part. Solving it after the crouch (as the old
    // code did) is why a "pet" was an arm waving 25 cm short of the animal.
    let contact = null;
    if (this.cameraMode === "tp" && hands && hands._reach
        && hands._reachStrength > 0.02 && hands._reachWorld) {
      const r = hands._reach;
      contact = {
        k: hands._reachStrength,
        side: r.hand === "left" ? -1 : (r.hand === "both" ? 0 : 1),
        world: hands._reachWorld,
        normal: r.normal || null,
        grip: r.grip || "flat",
        curl: r.curl != null ? r.curl : (r.grip === "wrap" ? 0.95 : 0.12),
      };
      // How far short is the arm? Measure shoulder → target and let the body
      // make up the difference by bending, exactly like a person would.
      const armLen = (this._upperLen + this._foreLen) * 0.94;
      const shY = this.group.position.y + this.opts.chestTopY - 0.02;
      const dxz = Math.hypot(contact.world.x - this.group.position.x,
                             contact.world.z - this.group.position.z);
      const need = Math.hypot(dxz, shY - contact.world.y);
      const over = need - armLen;
      // Below the shoulder → drop into a crouch; out in front → hinge forward.
      const lowness = _hsat((shY - contact.world.y) / 0.75);
      contact.autoCrouch = _hsat(over / 0.40) * lowness * contact.k;
      // Measured at a real pet: shoulder→target 0.67 m against a 0.52 m arm,
      // with the crouch already saturated. The torso has to finish the job, so
      // the hinge is allowed to commit further than it used to.
      contact.autoLean   = _hsat(over / 0.42) * (0.94 + 0.16 * (1 - lowness)) * contact.k;
      // How hard is this reach, and has it actually LANDED? Both feed the face
      // below: reaching out to your limit is visible work, and the moment a
      // frightened hand lands on a warm animal is the emotional beat this whole
      // scene exists for. Touching something used to leave the face blank.
      //
      // `strain` can use the geometric estimate, but "landed" cannot: `shY` is
      // the UNCROUCHED shoulder, and the crouch + hip hinge below are exactly
      // what closes the last 30 cm. Judged from that estimate the hand never
      // counts as landed even while the palm is visibly on the animal. So it is
      // measured from where the wrist actually ended up last frame, after the
      // whole body has had its say.
      // The band is set from the rig's own numbers: the palm sits ~5.5 cm past
      // the wrist, so a wrist within ~11 cm of the surface point IS a hand
      // resting on it, and 20 cm is a hand still on its way.
      contact.strain = _hsat(over / 0.30) * contact.k;
      const gap = this._contactGap == null ? 9 : this._contactGap;
      contact.landed = _hsat((0.20 - gap) / 0.09) * contact.k;
    }
    if (!contact) this._contactGap = null;
    this._contactStrain = (this._contactStrain || 0)
      + ((contact ? contact.strain : 0) - (this._contactStrain || 0)) * Math.min(1, dtB * 4);
    this._contactLanded = (this._contactLanded || 0)
      + ((contact ? contact.landed : 0) - (this._contactLanded || 0)) * Math.min(1, dtB * 2.2);
    if (this._reachAssist == null) this._reachAssist = { crouch: 0, lean: 0 };
    const assistRate = Math.min(1, dtB * 5);
    this._reachAssist.crouch += ((contact ? contact.autoCrouch : 0) - this._reachAssist.crouch) * assistRate;
    this._reachAssist.lean   += ((contact ? contact.autoLean   : 0) - this._reachAssist.lean  ) * assistRate;
    const assistCrouch = this._reachAssist.crouch;
    const assistLean   = this._reachAssist.lean;

    // ---------- Spine ----------
    // With a real chain the lean is spread across pelvis→spine→chest, which is
    // how a back actually bends; a single hinge at the chest reads as a doll
    // folding at the sternum.
    // Walking is a controlled fall forward, and the faster you go the further
    // you lean into it. A fixed lean read as strolling at every pace.
    const walkLean = walkAmt * (0.030 + 0.055 * speedNorm);
    const postureLean = (this.cameraMode === "tp" ? ps.lean : 0) * 0.42;
    const totalLean = walkLean + postureLean;
    // Hip hinge for reach assist — applied to the spine chain below so it
    // carries the shoulders forward rather than just tilting the chest.
    const hinge = assistLean * 0.62;
    // Walk-start commitment: rising walkAmt tips the torso into the first
    // step — real walking begins with a fall forward, not an upright glide.
    const risingWalk = Math.max(0, walkAmt - (this._prevWalkAmtLean || 0));
    this._prevWalkAmtLean = walkAmt;
    const startLean = Math.min(0.14, risingWalk * 5.5 + walkAmt * 0.045);
    this._startLeanSm = (this._startLeanSm || 0)
      + (startLean - (this._startLeanSm || 0)) * Math.min(1, dtB * 6);
    // Hip counter-twist: the pelvis leads each stride while the thorax
    // counter-rotates above it — the hallmark of a real walk cycle. In a bone
    // CHAIN the chest inherits the pelvis, so its local yaw must overshoot to
    // land the shoulders on the opposite side.
    if (this._hipTwist === undefined) this._hipTwist = 0;
    // Pelvis leads the stride while the thorax counter-rotates — in ANY travel
    // direction. Side-steps and pivots get the same counter-twist (scaled a
    // touch softer), which the old fwd-only gate froze out.
    const hipTwistTarget = Math.sin(walkPhase) * walkAmt
      * Math.max(fwdShare, sideShare * 0.8, shufK * 0.6);
    this._hipTwist += (hipTwistTarget - this._hipTwist) * Math.min(1, dtB * 15);
    // Pelvic lead trimmed to clinical range: ±0.085 rad ≈ ±4.9° at full
    // stride (gait-lab norm ±4–5°; the old 0.105 measured ±5.6° on the live
    // rig and, combined with the chest overshoot below, read as a swagger
    // from the third-person back view).
    const pelvisYaw = -this._hipTwist * 0.085;
    const gaitRoll = rollWalk;
    const commitLean = this._startLeanSm || 0;
    // ---- bank into the turn ----
    // Walk a curve and you lean into it; the faster and tighter the turn, the
    // more. Without it a turning character stays bolt upright and pivots like a
    // turret, which is the single most obvious thing missing from a walk that
    // is otherwise correct step for step.
    {
      const yawNow = this._camYawSm || 0;
      if (this._bankPrevYaw == null) this._bankPrevYaw = yawNow;
      let dY = yawNow - this._bankPrevYaw;
      while (dY > Math.PI) dY -= Math.PI * 2;
      while (dY < -Math.PI) dY += Math.PI * 2;
      this._bankPrevYaw = yawNow;
      const yawRate = dtB > 1e-5 ? dY / dtB : 0;
      // NEGATED: a positive rotation.z raises the character's LEFT side, which
      // tips the body to its right. Turning left has to lean left, so the sign
      // flips. (Measured: the unflipped version threw the head 28 mm to the
      // OUTSIDE of the turn — a motorcycle leaning the wrong way.)
      const want = Math.max(-0.13, Math.min(0.13, -yawRate * speedNorm * walkAmt * 0.085));
      this._bankSm = (this._bankSm || 0) + (want - (this._bankSm || 0)) * Math.min(1, dtB * 3.5);
    }
    const bank = this._bankSm || 0;
    // ---- micro-motion ----
    // Small, slow, uncorrelated-looking drift on the trunk and neck. Amplitudes
    // are deliberately below the threshold of "I can see that moving" — the
    // point is that the silhouette is never twice the same.
    const wobT = t * (0.8 + 0.5 * walkAmt);
    const wobA = 0.010 + 0.006 * walkAmt;
    const wobSpineX = _wob(wobT, 1.7) * wobA * 0.5;
    const wobSpineZ = _wob(wobT, 4.1) * wobA;
    const wobChestY = _wob(wobT, 7.3) * wobA * 0.9;
    const wobNeckX = _wob(wobT, 11.9) * wobA * 0.7;
    this.hips.rotation.set(hinge * 0.45 + commitLean * 0.35, pelvisYaw, gaitRoll * 0.070 + bank * 0.30);
    this.spine.rotation.set(totalLean * 0.35 + hinge * 0.35 + commitLean * 0.40 + wobSpineX, -pelvisYaw * 0.9,
      -gaitRoll * 0.026 + rollIdle * 0.030 + bank * 0.42 + wobSpineZ);
    // Chest local −0.6 lands WORLD thorax at −0.5× pelvis (chain: hips +1,
    // spine −0.9, chest −0.6 → −0.5): anti-phase but half-amplitude, which is
    // the physiological ratio. The old −1.15 put the shoulders at 105% of
    // pelvis amplitude — equal-and-opposite shoulder whip, the single
    // strongest "video-game walk" tell when viewed from behind.
    this.chest.rotation.set(totalLean * 0.65 + hinge * 0.20 + commitLean * 0.55, -pelvisYaw * 0.6 + wobChestY,
      -gaitRoll * 0.042 + rollIdle * 0.022 + bank * 0.28);

    // Crouch — bent KNEES, not a shrunken torso: the thigh pitches forward,
    // the shin folds back, and the whole body drops by exactly the geometric
    // shortening of the bent leg, so the feet stay planted.
    const crouchAmt = Math.max(ps.crouch, assistCrouch);
    // ---- Idle soft knees + weight rock ----
    // A standing person never locks both knees; weight drifts slowly side to
    // side. Without this, idle TP characters read as mannequins planted on
    // stilts — especially visible while waiting for a dog to approach.
    const idleSoft = idleFactor * (1 - Math.min(1, crouchAmt * 2));
    if (idleSoft > 0.05) {
      this._idleRockPh = (this._idleRockPh || 0) + dtB * (0.55 + fearK * 0.35);
      const rock = Math.sin(this._idleRockPh) * idleSoft;
      const softKnee = 0.06 * idleSoft;
      for (const leg of this.legs) {
        // Slightly more bend on the loaded leg (the side weight is over).
        const load = 1 + rock * leg.side * 0.55;
        leg.knee.rotation.x += softKnee * load;
        leg.hip.rotation.x -= softKnee * 0.35 * load;
        leg.hip.rotation.z += rock * leg.side * 0.018;
        // Re-level: the sole holds the pitch the rockers asked for, whatever
        // the layers above just did to the hip and knee.
        leg.foot.rotation.x = (leg._gaitPitch || 0) - leg.hip.rotation.x - leg.knee.rotation.x;
        leg.foot.rotation.z = -leg.hip.rotation.z;
      }
      // The sway rides on the SPINE, not the pelvis. Rolling the pelvis lifts one
      // hip ~3 mm, and with the sole now actually meeting the floor that shows up
      // as a foot hanging in the air while the character stands still. Carried on
      // the spine the weight shift reads the same and both feet stay down.
      if (this.spine) this.spine.rotation.z += rock * 0.020;
      if (this.chest) this.chest.rotation.z += rock * 0.012;
    }
    if (crouchAmt > 0.01) {
      const c = crouchAmt;
      // A full crouch is a real squat: ~40 cm of drop. The old angles gave 8 cm,
      // so "crouch to pet the dog" barely moved the character and the hand
      // could never get near the animal.
      const hipBend = c * 1.10;
      const kneeBend = c * 2.15;
      for (const leg of this.legs) {
        leg.hip.rotation.x -= hipBend;
        leg.knee.rotation.x += kneeBend;
        // Soles stay flat on the floor through the squat. The old 0.85 left the
        // sole 9° toe-down at full crouch, which with real sole contact would
        // stand the character on its toes and lift it out of the crouch.
        leg.foot.rotation.x = (leg._gaitPitch || 0) * (1 - c)
          - leg.hip.rotation.x - leg.knee.rotation.x;
      }
      // Squatting tips the torso forward — sitting bolt upright in a deep
      // crouch is a pose no balanced human holds.
      this.spine.rotation.x += c * 0.24;
      this.chest.rotation.x += c * 0.26;
    }
    // ---- One-knee kneel ----
    // Greeting a dog from a full squat — heels up, both knees jutting — read
    // as a sumo crouch. A person who gets down to a dog kneels: the knee on
    // the reaching side goes to the floor, the other foot plants forward and
    // the free hand rests on that knee (the thigh brace below finds it). Only
    // for a deep, still, live contact; the squat still covers everything else.
    {
      const kneelWant = (contact && walkAmt < 0.15) ? _sstep(0.30, 0.70, crouchAmt) : 0;
      if (this._kneelK == null) this._kneelK = 0;
      this._kneelK += (kneelWant - this._kneelK) * Math.min(1, dtB * (kneelWant > this._kneelK ? 3.2 : 4.5));
      const kk = this._kneelK;
      if (kk < 0.02) this._kneelSide = contact && contact.side ? contact.side : 1;
      this._kneeling = kk > 0.3 ? this._kneelSide : 0;
      if (kk > 0.001) {
        const e = kk * kk * (3 - 2 * kk);
        // Angles are WORLD angles: the pelvis is already pitched by the reach
        // hinge, and a thigh set "level" in pelvis space sat 13° off level,
        // which floated the kneeling knee 19 cm off the floor.
        const pp = this.hips.rotation.x;
        for (const leg of this.legs) {
          const down = leg.side === this._kneelSide;
          // Kneeling leg: thigh near vertical, shin along the floor behind,
          // shoe lying on its laces. Front leg: thigh level, shin upright,
          // sole flat, knee turned a little out to clear the torso.
          const tH = down ? 0.04 - pp : -1.50 - pp;
          const tK = down ? Math.PI / 2 - 0.02 - (tH + pp) : -(tH + pp) + 0.04;
          const tZ = down ? leg.side * 0.03 : leg.side * 0.20;
          leg.hip.rotation.x += (tH - leg.hip.rotation.x) * e;
          leg.knee.rotation.x += (tK - leg.knee.rotation.x) * e;
          leg.hip.rotation.z += (tZ - leg.hip.rotation.z) * e;
          const flat = -pp - leg.hip.rotation.x - leg.knee.rotation.x;
          const laces = 2.95 - pp - leg.hip.rotation.x - leg.knee.rotation.x;
          leg.foot.rotation.x += ((down ? laces : flat) - leg.foot.rotation.x) * e;
          leg.foot.rotation.z += (-leg.hip.rotation.z - leg.foot.rotation.z) * e;
          // Don't let the plant servo integrate the pose change as drift.
          leg._anchor = null;
        }
        // Kneeling, the back is upright under the head, not folded over it.
        this.spine.rotation.x -= e * crouchAmt * 0.14;
        this.chest.rotation.x -= e * crouchAmt * 0.12;
      }
    }

    // ---------- ground clamp ----------
    // Whatever the legs are doing — striding, crouching, strafing — the pelvis
    // sits at the height that puts the LOWEST foot exactly on the floor. This
    // is one rule replacing two fudges (a hand-tuned step bob and a separate
    // crouch drop), and it is what stops feet floating above the ground at the
    // ends of a stride or sinking into it in a squat.
    {
      // Measure, don't predict. Asking the scene graph where the lowest bit of
      // SOLE actually ended up absorbs everything that moves a hip joint —
      // pelvis roll, hip twist, the spine hinge, the crouch — which a
      // closed-form guess misses, and those misses are what make a planted foot
      // drift. The heel and toe (not the ankle joint) are the points that touch:
      // measuring the joint left the toe 3 cm under the floor at every push-off
      // and the whole foot hanging in the air at every heel strike.
      const floorY = this.group.position.y;
      this.group.updateMatrixWorld(true);
      let lowest = Infinity;
      for (const leg of this.legs) {
        // A kneeling leg rests on its knee and laces, not its sole: the front
        // foot alone sets the height (see the kneel above).
        if (this._kneeling && leg.side === this._kneeling) continue;
        _bV1.copy(leg.heelPt).applyMatrix4(leg.foot.matrixWorld);
        if (_bV1.y < lowest) lowest = _bV1.y;
        _bV1.copy(leg.toePt).applyMatrix4(leg.foot.matrixWorld);
        if (_bV1.y < lowest) lowest = _bV1.y;
      }
      // While the world matrices are fresh, record how far each hip joint moved
      // along the body's axes. The leg solve consumes this next frame (a single
      // frame of lag, ~0.15% of a step) to keep its planted foot exactly still.
      {
        const yawB = this.group.rotation.y;
        const fx = Math.sin(yawB), fz = Math.cos(yawB);
        const rx = Math.cos(yawB), rz = -Math.sin(yawB);
        for (const leg of this.legs) {
          leg.hip.getWorldPosition(_bV2);
          if (leg._hipPrev) {
            const dx = _bV2.x - leg._hipPrev.x, dz = _bV2.z - leg._hipPrev.z;
            leg._hipStepF = dx * fx + dz * fz;
            leg._hipStepS = dx * rx + dz * rz;
          } else {
            leg._hipPrev = new THREE.Vector3();
            leg._hipStepF = 0; leg._hipStepS = 0;
          }
          leg._hipPrev.copy(_bV2);
          // Servo the planted foot to where it landed. Feeding hip travel
          // forward gets most of the way, but any unmodelled millimetre still
          // accumulates over a whole stance; measuring the ACTUAL world error
          // and handing it back closes the loop without having to enumerate
          // every source.
          // Anchored on the sole point currently bearing weight (heel, then toe
          // after heel-off) — that is the thing physically pinned to the floor.
          // Anchoring on the ankle fought the rockers, which move the ankle
          // several centimetres on purpose while the contact stands still.
          if (leg._plantS != null) {
            _bV3.copy(leg._pivotPt || leg.heelPt).applyMatrix4(leg.foot.matrixWorld);
            if (!leg._anchor) leg._anchor = _bV3.clone();
            else {
              const ex = _bV3.x - leg._anchor.x, ez = _bV3.z - leg._anchor.z;
              leg._plantF  += ex * fx + ez * fz;
              leg._plantSd += ex * rx + ez * rz;
            }
          } else {
            leg._anchor = null;
          }
        }
      }
      const clampDy = floorY - lowest;
      this.group.position.y += clampDy;
      // The clamp moves the group ORIGIN below the floor as the legs fold (the
      // feet are what stay put), so the contact shadow has to be pushed back up
      // or it sinks through the ground in a crouch.
      if (this.shadow) this.shadow.position.y = 0.005 - clampDy;
      // Publish the head's own vertical travel, relative to its running mean.
      // This IS the walk's bob — the pelvis's rise and fall after the spine has
      // absorbed most of it — and the FP camera rides it (setBobSource) so the
      // view and the body can never tell different stories. Measured here, one
      // line after the clamp, because `clampDy` is what makes it true.
      if (this.head) {
        // getWorldPosition() refreshes the ancestors from their CURRENT local
        // transforms, so this is already post-clamp — adding clampDy here
        // double-counted it and reported ~3× the real bob.
        this.head.getWorldPosition(_bV1);
        const headY = _bV1.y;
        // Head height over the floor while standing, learned live, so the TP
        // camera can follow a crouch or kneel down (FPControls.setBodyDrop).
        const overFloor = headY - floorY;
        if (crouchAmt < 0.05 && !this._kneeling) {
          this._headStandY = this._headStandY == null ? overFloor
            : this._headStandY + (overFloor - this._headStandY) * Math.min(1, dtB * 2);
        }
        if (controls && controls.setBodyDrop) {
          controls.setBodyDrop(this.cameraMode === "tp" && this._headStandY != null
            ? this._headStandY - overFloor : 0);
        }
        if (this._headMeanY == null) this._headMeanY = headY;
        this._headMeanY += (headY - this._headMeanY) * Math.min(1, dtB * 1.2);
        this._headBobY = Math.max(-0.06, Math.min(0.06, headY - this._headMeanY));
      }
    }

    // ---------- Head + gaze ----------
    this._nextHeadTurnAt = this._nextHeadTurnAt || (t + 4 + Math.random() * 6);
    this._headTurnAmount = this._headTurnAmount || 0;
    this._headTurnTarget = this._headTurnTarget || 0;
    if (idleFactor > 0.7 && fearK < 0.55 && t > this._nextHeadTurnAt) {
      this._headTurnTarget = (Math.random() - 0.5) * 0.6;
      this._nextHeadTurnAt = t + 5 + Math.random() * 7;
      // Sim time, not wall time. A setTimeout kept firing through pause and a
      // throttled tab, so a glance could snap back the instant the tab woke —
      // a twitch instead of a look. Anxious people also hold glances shorter.
      this._headTurnUntil = t + 1.5 * (1 - fearK * 0.45);
    }
    if (this._headTurnUntil != null && t > this._headTurnUntil) {
      this._headTurnTarget = 0;
      this._headTurnUntil = null;
    }
    this._headTurnAmount += (this._headTurnTarget - this._headTurnAmount) * Math.min(1, dtB * 2.4);
    // Tip the head toward whatever we're watching / touching. Eyes alone
    // track a low dog while the skull stays level — the classic doll stare.
    // Reach wins over calm watch; both fade with committed walking.
    {
      let tipPitch = 0, tipYaw = 0;
      const tipSrc = (hands && hands._reach && hands._reachStrength > 0.2 && hands._reachWorld)
        ? hands._reachWorld
        : ((typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001 - (this._watchAt || -1e9) < 0.5
            ? this._watchTarget : null);
      if (tipSrc && this.head && idleFactor > 0.25) {
        this.head.updateMatrixWorld(true);
        _bV1.copy(tipSrc);
        this.head.worldToLocal(_bV1);
        const dd = Math.max(0.2, _bV1.length());
        tipYaw = Math.max(-0.55, Math.min(0.55, Math.atan2(_bV1.x, Math.max(0.08, _bV1.z))));
        tipPitch = Math.max(-0.55, Math.min(0.35, -Math.asin(Math.max(-1, Math.min(1, _bV1.y / dd)))));
        tipPitch *= idleFactor;
        tipYaw *= idleFactor;
      }
      this._tipPitchSm = (this._tipPitchSm || 0)
        + (tipPitch - (this._tipPitchSm || 0)) * Math.min(1, dtB * 5);
      this._tipYawSm = (this._tipYawSm || 0)
        + (tipYaw - (this._tipYawSm || 0)) * Math.min(1, dtB * 5);
    }
    if (this.head) {
      const aimY = this._headAimYaw || 0;
      const wanderK = Math.max(0, 1 - Math.abs(aimY) * 3);
      // The neck carries part of the turn — a head that swivels alone on a
      // rigid neck is the classic owl tell.
      const yawTotal = this._headTurnAmount * wanderK + aimY + (this._tipYawSm || 0) * 0.55;
      this.neck.rotation.y = yawTotal * 0.35;
      this.neck.rotation.x = totalLean * -0.25 - hinge * 0.30 + (this._tipPitchSm || 0) * 0.35 + wobNeckX;
      this.head.rotation.y = yawTotal * 0.65;
      this.head.rotation.x = totalLean * 0.30 - hinge * 0.55 + (this._headAimPitch || 0)
        + (this._tipPitchSm || 0) * 0.65
        + Math.sin(t * 0.7) * 0.02
        + (Math.abs(Math.sin(walkPhase)) - 0.6) * 0.035 * walkAmt;
      // Eyes stay level through a turn: the head gives back most of the bank.
      this.head.rotation.z = Math.sin(t * 0.53) * 0.012 - weightRoll * 0.02 - bank * 0.62;
      // Fine tremor at high arousal — small enough to feel rather than see.
      if (fearK > 0.25) {
        const tr = (fearK - 0.25) * 0.0075;
        this.head.rotation.y += Math.sin(t * 23.0) * tr;
        this.head.rotation.x += Math.sin(t * 19.7 + 1.3) * tr * 0.7;
      }
    }
    // ---- Whole-body startle jerk (event-driven, additive) ----
    // The camera flinch (kickShake) is FP-only, so in third person a close
    // bark used to leave the avatar statuesque while the fear meter jumped —
    // the one moment the body should visibly answer. Fast attack (~80 ms),
    // ~0.55 s release: shoulders/chest recoil, chin tucks, a tiny lateral
    // jolt — the "jumped out of their skin" silhouette, scaled by amp.
    if ((this._startleT || 0) > 0.001) {
      this._startleT = Math.max(0, this._startleT - dtB / 0.55);
      const sT = this._startleT;
      const atk = Math.min(1, (1 - sT) * 7);           // sharp rise
      const env = atk * sT * sT * (this._startleAmp || 0.5);
      if (this.spine) this.spine.rotation.x -= env * 0.10;   // recoil rearward
      if (this.chest) this.chest.rotation.x -= env * 0.12;
      if (this.head) {
        this.head.rotation.x -= env * 0.30;                  // chin tuck
        this.head.rotation.z += env * 0.06 * (this._startleDir || 1);
      }
      // The flinch-jitter of the first tenth-second, felt through the neck.
      if (sT > 0.72) {
        const j = (sT - 0.72) * 0.10 * (this._startleAmp || 0.5);
        this.head.rotation.y += Math.sin(t * 47.0) * j;
        this.head.rotation.x += Math.sin(t * 41.3 + 0.7) * j;
      }
    }
    // Eyes lead the head: the pupils flick toward whatever the character is
    // reaching for / walking toward slightly before the head follows.
    if (this.face && this.face.setGaze) {
      // ---- what the eyes WANT: reach > threat > idle ----
      // window.PhobiaThreat is the live creature position a scene publishes
      // while something is actively threatening. A stale point (nothing set it
      // this half-second) means calm — otherwise the avatar keeps staring at
      // where the dog used to be long after it wandered off.
      const nowW = (typeof performance !== "undefined" ? performance.now() : Date.now()) * 0.001;
      try {
        const th = window.PhobiaThreat;
        if (th && Number.isFinite(th.x)) {
          this._threatTarget.set(th.x, th.y, th.z);
          this._threatAt = nowW;
        }
      } catch {}
      const threatLive = (nowW - this._threatAt) < 0.5 && fearK > 0.2;
      const watchLive = (nowW - this._watchAt) < 0.5;
      let pt = null;
      if (hands && hands._reach && hands._reachStrength > 0.15 && hands._reachWorld) {
        pt = hands._reachWorld;
        this._nextGlanceAt = null;
      } else if (threatLive) {
        pt = this._threatTarget;
      } else if (watchLive) {
        pt = this._watchTarget;
      } else {
        this._nextGlanceAt = null;
      }
      // Monitoring, not a doll stare: a 1–2 s glance away every 4–6 s.
      // Threat gets more frequent breaks; calm watch glances away less often
      // (you're paying soft attention to a friendly animal).
      let glX = 0, glY = 0;
      if (pt === this._threatTarget || pt === this._watchTarget) {
        const gap = pt === this._threatTarget ? (4 + Math.random() * 2) : (6 + Math.random() * 4);
        if (this._nextGlanceAt == null) this._nextGlanceAt = t + gap;
        if (t > this._nextGlanceAt) {
          this._glanceUntil = t + 1 + Math.random();
          this._nextGlanceAt = this._glanceUntil + gap;
          this._glanceX = (Math.random() < 0.5 ? -1 : 1) * (0.20 + Math.random() * 0.14);
          this._glanceY = (Math.random() - 0.6) * 0.18;
        }
        if (this._glanceUntil != null && t < this._glanceUntil) {
          glX = this._glanceX || 0; glY = this._glanceY || 0;
        }
      }
      let wantX, wantY, wantV = 0;
      if (pt) {
        this._gazeTarget = this._gazeTarget || new THREE.Vector3();
        this._gzL = this._gzL || new THREE.Vector3();
        this._gazeTarget.copy(pt);
        this.head.updateMatrixWorld();
        const g = this._gzL.copy(this._gazeTarget);
        this.head.worldToLocal(g);
        const dd = Math.max(0.15, g.length());
        wantX = Math.max(-0.42, Math.min(0.42, Math.atan2(g.x, Math.max(0.05, g.z))));
        wantY = Math.max(-0.30, Math.min(0.30, -Math.asin(Math.max(-1, Math.min(1, g.y / dd)))));
        wantV = Math.min(0.12, 0.032 / dd);      // converge on a near target
      } else {
        wantX = Math.max(-0.35, Math.min(0.35,
          (this._headAimYaw || 0) * 0.45 + Math.sin(t * 0.31) * 0.05));
        wantY = Math.max(-0.22, Math.min(0.22, -(this._headAimPitch || 0) * 0.35));
      }
      wantX = Math.max(-0.42, Math.min(0.42, wantX + glX));
      wantY = Math.max(-0.30, Math.min(0.30, wantY + glY));
      // ---- saccades ----
      // Real eyes STEP between held fixations; feeding a continuously moving
      // value straight to setGaze is what makes procedural eyes glide like a
      // camera gimbal. Commit a point, hold it for a fixation, then jump.
      if (this._gazeCX == null) { this._gazeCX = wantX; this._gazeCY = wantY; this._gazeDwell = 0; }
      this._gazeDwell -= dtB;
      const gErr = Math.hypot(wantX - this._gazeCX, wantY - this._gazeCY);
      if (this._gazeDwell <= 0 || gErr > 0.05) {
        // Blink-saccade coupling: a large committed jump usually hides behind
        // a blink, and it is the cheapest realism win available here.
        if (gErr > 0.25 && this._blinkPhase <= 0 && Math.random() < 0.6) this._blinkPhase = 1;
        this._gazeCX = wantX; this._gazeCY = wantY;
        this._gazeDwell = 0.22 + Math.random() * 0.45;      // ~3 shifts/s
      }
      // Fixational micro-movement: without it the eyes read as glass beads.
      if (this._msNext == null || t > this._msNext) {
        const ma = Math.random() * Math.PI * 2;
        const mm = 0.005 + Math.random() * 0.005;
        this._msX = Math.cos(ma) * mm; this._msY = Math.sin(ma) * mm * 0.6;
        this._msNext = t + 0.5 + Math.random() * 0.5;
      }
      const sac = Math.min(1, dtB * 32);                    // ~30 ms — a step
      if (this._gazeSX == null) { this._gazeSX = this._gazeCX; this._gazeSY = this._gazeCY; this._gazeSV = wantV; }
      this._gazeSX += (this._gazeCX - this._gazeSX) * sac;
      this._gazeSY += (this._gazeCY - this._gazeSY) * sac;
      this._gazeSV += (wantV - this._gazeSV) * Math.min(1, dtB * 8);
      this.face.setGaze(
        this._gazeSX + (this._msX || 0),
        this._gazeSY + (this._msY || 0),
        this._gazeSV
      );
    }

    // ---------- Footsteps + dust ----------
    // Fire earlier in the walk ramp (0.22) so a cautious creep still plants
    // audible steps; pass side + speed so L/R and creep/stomp sound different.
    if (walkAmt > 0.22) {
      // Fire on the real footfall. A foot reaches initial contact when its
      // phase s hits 0, which is walkPhase = π/2 + kπ — NOT at kπ, where this
      // used to trigger. Half a step out, the step you heard landed while the
      // feet were passing each other in mid-air.
      const stepBucket = Math.floor((walkPhase - Math.PI / 2) / Math.PI);
      if (stepBucket !== this._lastStepBucket) {
        if (this._lastStepBucket != null && window.PhobiaAudio?.footstep) {
          // Even buckets are the side>0 leg's contact (its phase offset is 0).
          const side = (((stepBucket % 2) + 2) % 2) === 0 ? 1 : -1;
          const stepVol = walkAmt * (0.22 + 0.78 * Math.pow(speedNorm, 1.25));
          try {
            window.PhobiaAudio.footstep(stepVol, this.opts.surface, {
              side,
              speed: speedNorm,
            });
          } catch {}
          this._spawnFootDust(side, walkAmt * (0.3 + 0.7 * speedNorm));
        }
        this._lastStepBucket = stepBucket;
      }
    }
    if (this._dustPuffs && this._dustPuffs.length > 0) {
      const dustDt = dtB;
      for (const puff of this._dustPuffs) {
        if (puff.life <= 0) continue;
        puff.life -= dustDt;
        if (puff.life <= 0) { puff.mesh.visible = false; continue; }
        const ageK = 1 - puff.life / puff.maxLife;
        const pos = puff.mesh.geometry.attributes.position;
        for (let i = 0; i < puff.n; i++) {
          pos.array[i * 3]     += puff.velocities[i * 3]     * dustDt;
          pos.array[i * 3 + 1] += puff.velocities[i * 3 + 1] * dustDt;
          pos.array[i * 3 + 2] += puff.velocities[i * 3 + 2] * dustDt;
          puff.velocities[i * 3 + 1] -= 0.4 * dustDt;
        }
        pos.needsUpdate = true;
        puff.mesh.material.opacity = (1 - ageK) * 0.55;
        puff.mesh.material.size = puff.baseSize + ageK * 0.04;
      }
    }
    this._lastBodyT = t;

    // ---------- Arms ----------
    const gesture = hands && hands.gestureType ? hands.gestureType : "rest";
    const gestureStrength = hands?.gestureStrength || 0;
    const pulse = hands?.actionPulse || 0;
    // Gesture targets, per side, as {shoulder pitch, elbow FLEXION (≥0)}.
    let rS = 0, rE = 0, lS = 0, lE = 0;
    if (gesture === "pet") {
      rS = -1.0; rE = 0.75 + pulse * 0.30;
    } else if (gesture === "grab") {
      rS = -0.65; rE = 0.70; lS = -0.65; lE = 0.70;
    } else if (gesture === "paddle") {
      rS = -0.55; rE = 0.60; lS = -0.55; lE = 0.60;
    } else if (gesture === "touch") {
      rS = -0.75; rE = 0.55 + pulse * 0.40;
    } else if (gesture === "brush") {
      rS = -0.45 - 0.30 * pulse; rE = 0.55 + pulse * 0.30;
    }
    const reachStrength = this.cameraMode === "tp" ? ps.reach : 0;
    const spreadStrength = ps.armSpread;
    const reachShoulder = -1.2 + (1 - ps.reachHeight) * 0.35;
    const reachElbow    = 0.45 + reachStrength * 0.20;

    // ---- torso engagement toward the contact point ----
    // The spine turns and tips toward whatever is being touched, so the reach
    // reads as intention rather than an arm operating on its own.
    if (contact) {
      this.chest.updateMatrixWorld();
      const local = _bV1.copy(contact.world);
      this.chest.worldToLocal(local);
      const twist = Math.max(-0.5, Math.min(0.5, Math.atan2(local.x, Math.max(0.1, local.z)) * 0.45));
      this.chest.rotation.y += twist * contact.k;
      this.spine.rotation.y += twist * 0.5 * contact.k;
    }

    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i];
      const side = arm.side;
      // Right arm swings with the LEFT leg, which is how humans walk. The
      // offset has to MATCH this side's leg phase, not oppose it: a positive
      // shoulder rotation swings the arm BACK, so sharing the leg's phase puts
      // the arm behind while that leg is in front. The old inverted offset gave
      // same-side arm and leg — the unmistakable tin-soldier walk.
      const armPhase = walkPhase + (side > 0 ? 0 : Math.PI);
      // Arms do not swing to a metronome either — a slow drift on amplitude,
      // different per side, keeps the two from mirroring each other exactly.
      // Amplitude matched to the protagonist walk-cycle sheet: clearer
      // opposite-arm counter-swing (~42–50° shoulder arc at full stride) and
      // a soft elbow lead so the forearm trails the upper arm like a whip.
      const armVar = 1 + _wob(t * 0.6, side > 0 ? 2.9 : 6.2) * 0.13;
      const swing = Math.sin(armPhase) * (side > 0 ? 0.72 : 0.78) * walkAmt * strideK * armVar;
      const shoulderTarget = side > 0 ? rS : lS;
      const elbowTarget    = side > 0 ? rE : lE;
      const gestureWeight = this.cameraMode === "tp" ? gestureStrength : 0;
      // The arm that ISN'T touching anything shouldn't mirror the reach — a
      // one-handed pet with both arms thrust forward reads as a zombie. It
      // keeps a light brace instead.
      const idleArm = contact && contact.side !== 0 && contact.side !== side;
      const reachW = reachStrength * (idleArm ? 0.30 : 1);
      const reachWeight   = (1 - gestureWeight) * reachW;
      const swingWeight   = (1 - gestureWeight) * (1 - reachW);
      const idle = 1 - walkAmt;
      const idleSway = Math.sin(t * 0.9 + side * 1.7) * 0.025 * idle;
      // Off-hand brace on the thigh while crouching to pet: the free hand
      // rests near the knee instead of hovering. Classic "greeting a dog"
      // silhouette in third person.
      const thighBrace = idleArm && crouchAmt > 0.25
        ? Math.min(1, (crouchAmt - 0.25) / 0.35) * contact.k
        : 0;
      const rotX =
          shoulderTarget * gestureWeight
        + reachShoulder  * reachWeight
        + (swing + 0.05 * idle + idleSway * 0.6) * swingWeight
        + thighBrace * 0.55;                     // upper arm drops toward thigh
      const spreadZ = side * (0.95 * spreadStrength + (idleArm ? 0.18 * contact.k : 0)
        - thighBrace * 0.35);
      const naturalZ = side * (0.10 + (this.bt.armOut || 0)) + Math.sin(armPhase * 0.5) * 0.04 * walkAmt + idleSway;
      // The forearm TRAILS the upper arm by ~0.5 rad of phase (whip-like
      // follow-through) — an elbow that bends in sync reads as one rigid rod.
      // A walking arm carries 20–40° of elbow flexion, most of it on the
      // FORWARD swing; parked near 15° the whole cycle the arms read as two
      // straight sticks hinged at the shoulder.
      const passiveBend = 0.42 + Math.max(0, Math.sin(armPhase - 0.55)) * 0.48 * walkAmt
        + fearK * 0.22 + idleSway * 0.5;
      const elbX =
          elbowTarget   * gestureWeight
        + reachElbow    * reachWeight
        + passiveBend   * swingWeight
        + thighBrace * 0.85;                     // elbow folds so hand finds thigh
      arm.root.rotation.set(rotX, 0, spreadZ + naturalZ * (1 - spreadStrength));
      this._elbowFlex(arm, elbX);
      // Carrying angle (see BODY_TYPES_3D) — only while the arm hangs or
      // swings; gestures, reaches and the thigh brace own the whole arm.
      const restK = swingWeight * (1 - thighBrace);
      arm.elbow.rotation.z = side * (this.bt.carry || 0) * restK;
      arm.wrist.rotation.set(thighBrace * 0.35, 0, side * (thighBrace * 0.20 - WRIST_REST_FOLD * restK));
      // …and then PUT the hand there. The brace above is a fixed backward
      // tilt of the upper arm, which only lands on the thigh for an upright
      // torso; crouched and leaning in to a dog (chest pitched ~50°) the same
      // tilt threw the free hand up behind the back. The arm IK plants the
      // wrist on top of the same-side knee instead, whatever the torso does.
      if (thighBrace > 0.02 && this.rig && this.rig.B) {
        const Bk = this.rig.B;
        const sp = arm.root.getWorldPosition(this._braceS || (this._braceS = new THREE.Vector3()));
        const kA = Bk.L_knee, kB = Bk.R_knee;
        if (kA && kB) {
          const pa = kA.getWorldPosition(this._braceA || (this._braceA = new THREE.Vector3()));
          const pb = kB.getWorldPosition(this._braceB || (this._braceB = new THREE.Vector3()));
          const knee = (Math.hypot(pa.x - sp.x, pa.z - sp.z) < Math.hypot(pb.x - sp.x, pb.z - sp.z)) ? pa : pb;
          const tgt = this._braceT || (this._braceT = new THREE.Vector3());
          tgt.copy(knee); tgt.y += 0.07;
          this.chest.updateMatrixWorld();
          this.chest.worldToLocal(tgt);
          this._armIK(arm, tgt, Math.min(1, thighBrace));
        }
      }

      // Contact overrides the layered pose for the reaching arm(s).
      const hk = this._handK[i];
      let wantCurl = 0, wantSpread = 0;
      if (contact && (contact.side === 0 || contact.side === side)) {
        const k = contact.k;
        // Aim the WRIST at a point one palm-depth off the surface so the palm
        // itself — not the wrist joint — is what lands on the object.
        const n = contact.normal;
        const tgt = _bV3.copy(contact.world);
        // One palm-depth off the surface, less a compliance press that breathes
        // with the stroke: a hand resting on an animal sinks into it and the
        // pressure varies. Holding a fixed stand-off is what makes a pet look
        // like a hand hovering a centimetre above a statue.
        // Stand-off is measured from the WRIST, so it tracks the hand's size —
        // the palm now sits ~3 cm past the wrist rather than ~2.2.
        const give = 0.070 - (contact.landed || 0) * (0.018 + 0.008 * Math.sin(t * 3.1));
        if (n) tgt.addScaledVector(n, give);
        else tgt.y += give;
        this.chest.updateMatrixWorld();
        this.chest.worldToLocal(tgt);
        if (this._armIK(arm, tgt, k)) {
          // Roll the palm onto the surface: the hand's palm side is local −Z.
          if (n) {
            arm.wrist.updateMatrixWorld();
            const nl = _bV4.copy(n);
            arm.wrist.parent.updateMatrixWorld();
            // normal → the wrist's parent space (direction only)
            _bM1.copy(arm.wrist.parent.matrixWorld).invert();
            nl.transformDirection(_bM1).normalize();
            // Palm faces −Z in hand space, offset from the hand's rest yaw:
            // this was tuned when the hand rested at side·1.15 with a −0.30
            // palm yaw, and is kept equivalent now the rest yaw is −side·1.15
            // (see buildHumanRig) — the palm still lands on the coat.
            const palmLocal = _bV5.set(0, 0, -1).applyAxisAngle(
              new THREE.Vector3(0, 1, 0), (arm.hand ? arm.hand.rotation.y : arm.side * 1.15) - arm.side * 1.45);
            _bQ2.setFromUnitVectors(palmLocal.normalize(), nl.multiplyScalar(-1).normalize());
            arm.wrist.quaternion.slerp(_bQ2, k * 0.8);
          }
          wantCurl = contact.curl;
          wantSpread = contact.grip === "flat" ? 0.65 : 0;
        }
        // Where did the wrist ACTUALLY end up? This is the honest measure of
        // whether the hand is on the object, and next frame's `contact.landed`
        // reads it (see the contact block above). Measured OUTSIDE the IK's
        // success branch on purpose: a solver that reports failure on an
        // out-of-range target still leaves the arm stretched toward it, and
        // gating on success froze the gap at whatever it was when the reach
        // began — permanently "not touching" however close the hand got.
        // The whole chain has to be current, not just the wrist: the IK just
        // rewrote the shoulder and elbow rotations, and Object3D.updateMatrix-
        // World() recomputes a node from its PARENT'S cached world matrix — so
        // asking the wrist alone returns a position built on stale ancestors,
        // and the measured gap sat ~0.28 m while the palm was demonstrably
        // 0.055 m from the coat.
        this.group.updateMatrixWorld(true);
        _bV6.setFromMatrixPosition(arm.wrist.matrixWorld);
        const gapNow = _bV6.distanceTo(contact.world);
        this._contactGap = this._contactGap == null
          ? gapNow : this._contactGap + (gapNow - this._contactGap) * Math.min(1, dtB * 8);
      } else if (gestureWeight > 0.3 && side > 0) {
        wantCurl = gesture === "grab" ? 0.7 : 0.18;
      } else {
        // A hand doing nothing is NOT a flat plane with the fingers splayed —
        // that is the pose of someone signalling "stop", and it is what made
        // the character's hands read as claws hanging off the wrists. At rest
        // the fingers fall into a soft curl under their own tendon tension,
        // it tightens toward a half fist under fear, and it tightens further
        // at the front of each arm swing.
        // k = 0 IS the resting curl now (see setCurl), so neutral asks for
        // almost nothing and fear does the tightening it always did. The old
        // 0.26 baseline predates that and would now read as a permanent
        // half-fist. Spread is nearly off at rest too: relaxed fingers touch.
        const swingTight = Math.max(0, Math.sin(armPhase)) * 0.09 * walkAmt;
        wantCurl = 0.06 + fearK * 0.34 + swingTight;
        wantSpread = 0.04 * (1 - fearK);
      }
      hk.curl += (wantCurl - hk.curl) * Math.min(1, dtB * 8);
      hk.spread += (wantSpread - hk.spread) * Math.min(1, dtB * 8);
      if (arm.hand.userData.setCurl) arm.hand.userData.setCurl(hk.curl, hk.spread);
    }

    // ---------- Wind flutter (hair + scarf) ----------
    const wind = Math.max(0, this.opts.windExposure || 0);
    this._windPhase += (wind > 0 ? (0.06 + wind * 0.10) * dtB * 60 : 0);
    if (this.scarf) {
      const visible = wind > 0.001;
      if (this.scarf.visible !== visible) this.scarf.visible = visible;
      if (visible && this.scarfTails) {
        for (let i = 0; i < this.scarfTails.length; i++) {
          const tail = this.scarfTails[i];
          const phase = this._windPhase + i * 1.3;
          tail.rotation.x = -0.10 + Math.sin(phase * 1.4) * 0.30 * wind;
          tail.rotation.z = Math.sin(phase * 0.9 + 0.4) * 0.45 * wind;
          tail.position.x = (i ? -0.03 : 0.03) + Math.sin(phase * 0.7) * 0.04 * wind;
        }
      }
    }
    if (this.hairFlutter) {
      // Long hair / a pony tail sway with the head's motion even indoors —
      // perfectly rigid hair is one of the loudest "this is a doll" cues.
      const phase = this._windPhase * 0.9;
      const swayX = Math.sin(t * 1.7) * 0.02 + walkAmt * Math.sin(walkPhase * 2) * 0.05;
      this.hairFlutter.rotation.x = swayX + Math.sin(phase * 1.6) * 0.15 * wind;
      this.hairFlutter.rotation.z = Math.sin(t * 1.3) * 0.015 - weightRoll * 0.05
        + Math.sin(phase + 0.6) * 0.12 * wind;
    }

    // ---------- Blinking ----------
    // ~12 blinks/minute, each a fast close and a slower open — lids that snap
    // symmetrically read as a shutter, not an eye.
    if (this.face && this.face.setBlink) {
      // Anticipatory anxiety and acute threat pull in OPPOSITE directions:
      // rising unease blinks faster, but at the moment of real danger people
      // freeze and STOP blinking (the wide-eyed stare). A monotonic speed-up
      // put a nervous flutter on the most terrified face in the game and
      // fought the widened lids setWide was drawing.
      const frozen = fearK > 0.7;
      this._blinkTimer -= dtB;
      if (this._blinkTimer < 0 && this._blinkPhase <= 0) {
        this._blinkPhase = 1;
        const calm = 2.5 + Math.random() * 4;
        this._blinkTimer = frozen
          ? calm * 1.6                                   // long stares
          : calm * (1 - Math.min(0.5, fearK) * 0.55);    // anxious flutter
      }
      if (this._blinkPhase > 0) {
        // Between long stares the blinks that DO happen are quick half-blinks.
        this._blinkPhase -= dtB / (frozen ? 0.11 : 0.16);
        const p = 1 - Math.max(0, this._blinkPhase);
        // p: 0→1 across the blink; close fast (first 35%), open slower.
        const k = p < 0.35 ? p / 0.35 : Math.max(0, 1 - (p - 0.35) / 0.65);
        this.face.setBlink(k * k * (3 - 2 * k) * (frozen ? 0.7 : 1));
        if (this._blinkPhase <= 0) this.face.setBlink(0);
      }
    }

    // ---- Retargeted upper body (CC0 motion library) ----
    // Runs LAST, so it overwrites the procedural torso and arm pose that the
    // rest of update() just computed, while every leg decision above it — the
    // ground probes, the two-bone IK, the foot planting — survives untouched.
    // See RETARGET_UPPER for why the split falls exactly there.
    //
    // The clip is driven by this body's OWN walkPhase rather than by wall
    // time. That is the difference between arms that swing and arms that swing
    // *with the legs*: sample the clip on its own clock and the swing drifts in
    // and out of step with a stride whose length depends on this traveler's
    // shins, which reads worse than not swinging at all.
    {
      const m = (typeof _humanMotion !== "undefined") ? _humanMotion : null;
      if (m && m.has) {
        const moving = (walkAmt || 0) > 0.06;
        // Walk clip only. The library's Idle_Loop holds the arms out in a
        // loose A-pose with the palms turned forward — on this character that
        // read as a gunslinger standing in the middle of the room, and the
        // player spends most of every trial standing still. Standing is the
        // procedural idle (arms hanging, palms to the thighs); the walk clip's
        // arm swing fades out over ~0.2 s when the feet stop, sampled at the
        // phase the stride ended on so nothing snaps.
        const clipName = HUMAN_CLIPS.walk;
        const clip = m.clips[clipName];
        if (clip) {
          // Walk: map gait phase → clip time so one stride is one cycle.
          // Idle: free-run, it has no relationship to the legs.
          // The library ships no backward or strafe clips — only Walk/Jog/
          // Sprint forward — so sideways travel is handled by turning the body
          // to face it (above) and backward travel by running this same clip
          // in reverse. Both are what a forward-only clip set can honestly do.
          //
          // The clip runs a QUARTER-CYCLE ahead of walkPhase. Walk_Loop swings
          // its .L foot furthest forward at clip phase ≈0.02; this body's L
          // leg (side < 0, contact at walkPhase 3π/2) gets there at ≈0.77.
          // Sampled in step, the arms swung a quarter-cycle late — neither
          // with nor against the legs (arm/leg correlation 0.17, where a
          // human walk is strongly negative). Measured by a first-harmonic fit
          // of both ankles: +0.2465 forward, and 0.254 as the pivot of the
          // reversed clip walking backwards.
          let frac = ((walkPhase / (Math.PI * 2)) % 1 + 1) % 1;
          frac = this._travelReversed ? 0.25 - frac : frac + 0.25;
          frac = (frac % 1 + 1) % 1;
          if (moving) this._clipFrac = frac;
          const time = (this._clipFrac != null ? this._clipFrac : frac) * clip.duration;
          if (this._motionBlend > 0.004 || moving) {
          if (m.poseAt(clipName, time)) {
            // Reaching out to pet is hand-authored IK aimed at a real point in
            // the world — a clip has no idea the dog is there, so the arms are
            // handed back the moment a reach is live, and only the torso keeps
            // taking the clip.
            const reaching = !!contact && contact.k > 0.02;
            const mask = reaching ? RETARGET_TORSO_ONLY : RETARGET_UPPER;
            // A posture the SCENE asked for — reaching toward the dog, the
            // crouch with the free hand braced on the thigh, arms out for
            // balance on a ledge — is intent, and outranks the clip's idle
            // arms. Blended by how much of the posture is in: the library
            // used to override all of it whenever no contact point was live,
            // so the free arm of a crouching traveler hung wherever the idle
            // clip left it (and, with the heading bug above, flung back).
            const ps2 = this._postureSm || {};
            const posedK = Math.max(0, Math.min(1, Math.max(
              (ps2.reach || 0) * 2.2, ((ps2.crouch || 0) - 0.15) * 2, (ps2.armSpread || 0) * 2.2)));
            // Ease in so the first frame after the library streams in does not
            // snap, and ease the arms back over ~0.2 s when a reach starts.
            const want = (moving ? Math.min(1, (walkAmt || 0) * 1.6) : 0) * (1 - posedK);
            this._motionBlend = (this._motionBlend == null)
              ? 0
              : this._motionBlend + (want - this._motionBlend) * Math.min(1, dtB * 5);
            applyRetarget(this.rig, m, this._motionBlend, mask);
          }
          }
        }
      }
    }

    // ---- One-shot arm action: the toss ----
    if (this._throwAct) {
      const A = this._throwAct;
      A.t += dtB;
      // Keys in seconds, scaled so the release key lands on A.release:
      // [t, shoulder pitch (− = forward), elbow flex, weight, chest twist].
      const r = A.release / 0.62;
      const amp = A.soft ? 0.7 : 1;
      const K = [
        [0.00, 0.05, 0.25, 0, 0],
        [0.14 * r, 0.25, 0.32, 1, 0.3],
        [0.40 * r, 0.72 * amp, 0.40, 1, 1],
        [0.62 * r, -0.95 * amp, 0.14, 1, -0.6],
        [0.85 * r, -1.30 * amp, 0.22, 1, -0.8],
        [0.85 * r + 0.45, -0.30, 0.30, 0, 0],
      ];
      const tt = A.t;
      if (tt >= K[K.length - 1][0]) this._throwAct = null;
      else {
        let i = 1;
        while (i < K.length - 1 && tt > K[i][0]) i++;
        const a0 = K[i - 1], a1 = K[i];
        let f = (tt - a0[0]) / Math.max(1e-4, a1[0] - a0[0]);
        f = f * f * (3 - 2 * f);
        const L = (j) => a0[j] + (a1[j] - a0[j]) * f;
        const w = L(3);
        const arm = this.arms.find((q) => q.side === A.side);
        if (arm && w > 0.001) {
          _thE.set(L(1), 0, A.side * 0.10);
          _thQ.setFromEuler(_thE);
          arm.root.quaternion.slerp(_thQ, w);
          arm.elbow.rotation.x += (-L(2) - arm.elbow.rotation.x) * w;
          // The shoulders turn into it: back on the windup, through on the swing.
          if (this.chest) this.chest.rotation.y += A.side * 0.22 * L(4) * w;
          if (this.spine) this.spine.rotation.y += A.side * 0.10 * L(4) * w;
          const u = arm.hand && arm.hand.userData;
          if (u && u.setCurl) u.setCurl(tt < A.release ? 0.75 : 0.15, 0);
        }
      }
    }
  }

  // Spawn a small dust puff at the planted foot. Surface determines the
  // particle colour so each step matches the floor it lands on.
  _spawnFootDust(side, walkAmt) {
    if (!this.scene) return;
    if (walkAmt < 0.5) return;
    const leg = this.legs && this.legs.find(l => l.side === side);
    if (!leg) return;
    const wp = this._dustWp || (this._dustWp = new THREE.Vector3());
    leg.foot.getWorldPosition(wp);
    const surface = this.opts.surface || "hard";
    // Only loose ground kicks anything up. A puff off a wooden or concrete
    // floor at every step was noise, not grounding.
    if (surface === "hard" || surface === "wood" || surface === "glass") return;
    let colour, baseSize, isWater = false;
    switch (surface) {
      case "wood":   colour = 0x8a6a3e; baseSize = 0.022; break;
      case "soft":   colour = 0xb7a78a; baseSize = 0.020; break;
      case "grass":  colour = 0x6a8a4a; baseSize = 0.025; break;
      case "splash": colour = 0xaccfe6; baseSize = 0.035; isWater = true; break;
      case "hard":
      default:       colour = 0xb0b4b8; baseSize = 0.022; break;
    }
    const N = isWater ? 8 : 6;
    // A small POOL of puffs, reused. Each step used to build a fresh
    // geometry + material and dispose them 0.8 s later — and once the last
    // material of a kind is disposed three.js drops its shader, so the first
    // step after any pause recompiled it (measured +1.5–3.4 ms on that frame,
    // i.e. a hitch on every "start walking").
    if (!this._dustPuffs) this._dustPuffs = [];
    let puff = this._dustPuffs.find((p) => p.life <= 0);
    if (!puff && this._dustPuffs.length < 6) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
      const mesh = new THREE.Points(geo, new THREE.PointsMaterial({
        size: 0.022, transparent: true, opacity: 0.55, depthWrite: false, sizeAttenuation: true,
      }));
      mesh.frustumCulled = false;
      mesh.userData.noPick = true;
      mesh.userData.noCollide = true;
      this.scene.add(mesh);
      puff = { mesh, velocities: new Float32Array(8 * 3), life: 0, maxLife: 0.8, baseSize: 0.022, n: 0 };
      this._dustPuffs.push(puff);
    }
    if (!puff) {   // all six in flight: recycle the oldest
      puff = this._dustPuffs.reduce((a, b) => (a.life < b.life ? a : b));
    }
    const positions = puff.mesh.geometry.attributes.position.array;
    const velocities = puff.velocities;
    for (let i = 0; i < N; i++) {
      positions[i * 3]     = wp.x + (Math.random() - 0.5) * 0.05;
      positions[i * 3 + 1] = wp.y - 0.03 + Math.random() * 0.01;
      positions[i * 3 + 2] = wp.z + (Math.random() - 0.5) * 0.05;
      const a = Math.random() * Math.PI * 2;
      const speed = 0.3 + Math.random() * 0.4;
      velocities[i * 3]     = Math.cos(a) * speed;
      velocities[i * 3 + 1] = (isWater ? 0.5 : 0.2) + Math.random() * 0.2;
      velocities[i * 3 + 2] = Math.sin(a) * speed;
    }
    const geo = puff.mesh.geometry;
    geo.setDrawRange(0, N);
    geo.attributes.position.needsUpdate = true;
    puff.mesh.material.color.setHex(colour);
    puff.mesh.material.size = baseSize;
    puff.mesh.material.opacity = 0.55;
    puff.mesh.visible = true;
    puff.n = N;
    puff.baseSize = baseSize;
    puff.life = puff.maxLife = 0.8;
  }

  // The head's vertical deviation from its own running mean, in metres — the
  // honest bob of this walk. The FP camera rides it (FPControls.setBobSource).
  headBobY() { return this._headBobY || 0; }

  // Step length for these legs AT 1 m/s; the phase engine scales it by √speed.
  // 0.72 × leg length reproduces the measured step length / leg length ratio of
  // ordinary walking, so at this scene's 1.45 m/s the character takes ~0.68 m
  // steps at ~2.1 per second — a walk, where the old fixed 0.62 m gave 2.35, a
  // march.
  strideBase() { return (this.opts.hipY - this.opts.ankleY) * 0.72; }

  setWindExposure(amount) {
    this.opts.windExposure = Math.max(0, Math.min(1.4, amount || 0));
    if (this.scarf) this.scarf.visible = this.opts.windExposure > 0.001;
  }
  // Set posture targets — the body smoothly lerps toward these in update().
  // Pass any subset of { lean, crouch, armSpread, reach, reachHeight }.
  setPosture(opts) {
    if (!opts) return;
    const p = this.posture;
    if (opts.lean       != null) p.lean       = Math.max(0, Math.min(1, opts.lean));
    if (opts.crouch     != null) p.crouch     = Math.max(0, Math.min(1, opts.crouch));
    if (opts.armSpread  != null) p.armSpread  = Math.max(0, Math.min(1, opts.armSpread));
    if (opts.reach      != null) p.reach      = Math.max(0, Math.min(1, opts.reach));
    if (opts.reachHeight != null) p.reachHeight = Math.max(0, Math.min(1, opts.reachHeight));
  }

  // One-arm underhand toss (ball, treat). Runs as the last layer of update()
  // so it wins over the idle, walk clip and reach poses for its ~1.3 s.
  // `release` is when the item should leave the hand, in seconds.
  playThrow(opts = {}) {
    this._throwAct = { t: 0, side: opts.side || 1, release: opts.release || 0.62, soft: !!opts.soft };
  }

  // Event-driven whole-body flinch (the TP twin of the camera's kickShake):
  // a sharp bark, a lunge, a clang — the avatar's shoulders jump, chin tucks,
  // then it releases over ~0.55 s. amp 0..1. Retriggers only harder, never
  // softer, so overlapping events don't visibly reset a big jerk to a small
  // one. The face rides along: a brief arousal bump widens the eyes through
  // the ordinary fear channel.
  startle(amp = 0.5) {
    const a = Math.max(0, Math.min(1, amp));
    if (a <= (this._startleT || 0) * (this._startleAmp || 0)) return;
    // The jolt reaches the palm too — amp-scaled, and only when this startle
    // actually takes (the guard above already filtered weaker repeats).
    try { if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic(Math.round(16 + a * 52)); } catch {}
    this._startleT = 1;
    this._startleAmp = a;
    this._startleDir = Math.random() < 0.5 ? -1 : 1;
    this._fearSm = Math.min(1, (this._fearSm || 0) + a * 0.22);
  }

  dispose() {
    if (this._onRelief) {
      try { window.removeEventListener("mira-relief", this._onRelief); } catch {}
      this._onRelief = null;
    }
    if (this._dustPuffs) {
      this._dustPuffs.forEach(puff => {
        if (puff.mesh && puff.mesh.parent) puff.mesh.parent.remove(puff.mesh);
        if (puff.mesh && puff.mesh.geometry) puff.mesh.geometry.dispose();
        if (puff.mesh && puff.mesh.material) puff.mesh.material.dispose();
      });
      this._dustPuffs = null;
    }
    for (const L of [this.keyLight, this.faceFill, this.rimLight]) {
      if (L && L.parent) L.parent.remove(L);
    }
    if (this.group.parent) this.group.parent.remove(this.group);
    if (this.rig && this.rig.skeleton) this.rig.skeleton.dispose();
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose());
      }
    });
  }
}

export { Body };
