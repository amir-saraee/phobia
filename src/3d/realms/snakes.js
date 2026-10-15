// The Sunlit Clearing — snakes (ophidiophobia): SnakeController and the scene.

import * as THREE from "three";
import { CREATURE_MODELS, buildCreature } from "../assets.js";
import { IS_COARSE_POINTER, IS_LOW_POWER, sceneQuality, loadMeadowHDR } from "../renderer.js";
import { buildHand, angleGap } from "../human-rig.js";
import { sceneContext } from "../scene-context.js";
import { makeEarthMaps, makeGrassMaps, makeLeafTexture } from "../textures.js";
import { makeScaleNormal, makeFurMaps, ensureBoxUV, smoothCreaseNormals, coatFor, SNAKE_COATS } from "../creature-kit.js";
import { _coachSize } from "../dog-controller.js";
import { makeCreatureCoach } from "../coach.js";
import { active } from "../live.js";

// ---------- Procedural snake "alive" layer ----------
// Runs the additive bone deltas AFTER the mixer writes each clip pose (the
// scene owns locomotion + the behaviour brain; this owns body slither, the
// tongue flick, jaw, and the cobra rear). Owns the SOLE mixer.update. Mirrors
// SpiderController's _poseYOff discipline.
class SnakeController {
  constructor(snake, scene, camera) {
    this.snake = snake; this.scene = scene; this.camera = camera;
    this.parts = snake.userData.parts;
    this.baseY = snake.position.y;
    this.height = (this.parts && this.parts.height) || 0.6;
    this.span = (this.parts && this.parts.span) || 0.6;
    this._slitherPhase = 0; this._breathPhase = 0;
    this.slitherAmt = 0.35; this._slitherAmtSm = 0; this._slitherSpeed = 0;
    this.rearTarget = 0; this._rear = 0;
    // Rear pitch per bone, radians at full rear, about the snake's x axis
    // (negative = up/back). The pack's Idle is ALREADY a fully upright cobra
    // S, so no chest/neck pitch can make it taller — both directions lower
    // the head (measured). What reads as "it lifts its head and holds your
    // eye" is the face drawing back and tilting up at you: at rung 4 this set
    // raises the snout 11 cm, draws it back 11 cm and tilts the face 19° up,
    // eyes level (the old −0.16/−0.30/+0.22 dropped the eyes 11 cm).
    this.rearK = { chest: 0, neck: -0.20, head: -0.15 };
    this.jawTarget = 0; this._jaw = 0;
    this._tongueT = -1; this._tongueNext = 1.5; this._tongueFast = false;
    this._tickEcho = null;    // the flick's second dry tick, fired from the update (no stray timer)
    this._poseYOff = 0; this._rig = null; this._needsGround = false;
    this.surfY = 0;   // scene-fed surface lift (riding up onto the basking rock)
    // Post-mixer head tracking (scene computes/smooths the yaw/pitch and hands
    // them over; applied HERE, inside the additive-layer safety net — the scene
    // used to += the neck/head bones directly, outside any protection).
    this.headYaw = 0; this.headPitch = 0;
    this.suspend = true;
    this._q1 = new THREE.Quaternion(); this._q2 = new THREE.Quaternion();
    this._v1 = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._s = new THREE.Vector3();
    this._m1 = new THREE.Matrix4();
    this._hp0 = new THREE.Vector3(); this._hq0 = new THREE.Quaternion();
    this._mp0 = new THREE.Vector3(); this._mq0 = new THREE.Quaternion();
  }
  setRear(r) { this.rearTarget = Math.max(0, Math.min(1, r)); }
  setJaw(j) { this.jawTarget = Math.max(0, Math.min(1, j)); }
  setSlither(a) { this.slitherAmt = Math.max(0, Math.min(1.4, a)); }
  requestTongueFlick(fast) { if (this._tongueT < 0) this._tongueNext = 0; this._tongueFast = !!fast; }
  update(t, d) {
    const p = this.parts;
    if (!p || !p.mixer) return;
    // Zero-dt frames must skip entirely: the mixer may not re-write the clip
    // pose, but the additive layer would still stack — same ratchet the dog
    // scene shook from (see DogController.update).
    if (d != null && d < 0.0015) return;
    p.mixer.update(d);
    if (this.suspend) return;
    this._bodyLife(t, d);
  }
  // Rotate `bone` by `angle` about an axis in the SNAKE's own frame (x = its
  // left, y = up, z = forward), through the bone's pivot. Snake.glb's bones
  // are heavily pre-rotated, so a raw Euler channel means something different
  // on every bone: `.y` on Tail…Tail3 is the bone's own long axis (the slither
  // TWISTED the tail in place instead of bending it), and head tracking
  // through `.y` tilted the skull sideways about (−0.46, −0.28, −0.84) instead
  // of turning it. Same method as DogController._rotDog.
  _rotSnake(bone, ax, ay, az, angle) {
    if (!bone || !angle) return;
    const q = this._q1, qs = this._q2;
    bone.getWorldQuaternion(q);
    this.snake.getWorldQuaternion(qs);
    q.premultiply(qs.invert()).invert();          // snake frame → bone local
    this._v1.set(ax, ay, az).applyQuaternion(q).normalize();
    qs.setFromAxisAngle(this._v1, angle);
    bone.quaternion.multiply(qs);
  }
  _bodyLife(t, d) {
    const model = this.parts.model;
    if (!model) return;
    if (!this._rig) {
      const find = (n) => { let r = null; model.traverse(o => { if (!r && o.isBone && o.name === n) r = o; }); return r; };
      this._rig = {
        body: find("Body"), chest: find("Chest"), neck: find("Neck"), head: find("Head"),
        tail: [find("Tail"), find("Tail1"), find("Tail2"), find("Tail3")].filter(Boolean),
        mouth: find("Mouth"), lowerMouth: find("LowerMouth"),
        tongue: [find("Tongue1"), find("Tongue2"), find("Tongue3")].filter(Boolean),
      };
    }
    const rig = this._rig;
    // ---- Additive-layer safety net (see DogController._bodyLife) ----
    // three.js PropertyMixer skips re-writing bones on flat keyframe spans,
    // so "read pose, ADD delta" compounds on those frames. Restore the clean
    // pre-delta base when the mixer skipped a bone; re-capture when it wrote.
    if (!this._lifeBones) {
      const set = new Set();
      [rig.body, rig.chest, rig.neck, rig.head, ...rig.tail,
       rig.mouth, rig.lowerMouth, ...rig.tongue]
        .forEach(b => { if (b) set.add(b); });
      this._lifeBones = [...set].map(b => ({ b, base: { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z }, fin: { x: NaN, y: NaN, z: NaN } }));
      // POSITIONS too, for the two bones this layer now moves (Mouth follows
      // the head; Tongue1 slides out of the lip notch) — same restore/capture.
      this._posNets = [rig.mouth, rig.tongue[0]].filter(Boolean)
        .map(b => ({ b, base: b.position.clone(), fin: new THREE.Vector3(NaN, NaN, NaN) }));
    }
    for (const r of this._lifeBones) {
      const rot = r.b.rotation;
      if (rot.x === r.fin.x && rot.y === r.fin.y && rot.z === r.fin.z) {
        rot.set(r.base.x, r.base.y, r.base.z);
      } else {
        r.base.x = rot.x; r.base.y = rot.y; r.base.z = rot.z;
      }
    }
    for (const r of this._posNets) {
      if (r.b.position.equals(r.fin)) r.b.position.copy(r.base); else r.base.copy(r.b.position);
    }
    const poseYPrev = this._poseYOff || 0;
    this._poseYOff = 0;

    // Belly grounding self-calibration. It used to plant the lowest BONE
    // origin 2 cm above the ground, but bones run down the body's centreline
    // (Tail1 sits 0.13 model units above its own belly), so every rung's belly
    // was buried 0.6–5 cm — measured 3.2–5.3 cm into the basking rock at rung
    // 4. Measure the skin itself.
    if (this._needsGround) {
      this._needsGround = false;
      this.snake.updateMatrixWorld(true);
      let lowY = Infinity; const v = this._v2;
      model.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const n = o.geometry.attributes.position.count;
        for (let i = 0; i < n; i += 2) { o.getVertexPosition(i, v); o.localToWorld(v); if (v.y < lowY) lowY = v.y; }
      });
      // Belly on the clearing's ground (y = −1); the rock lift (surfY) rides
      // on top of baseY. The skin's offset below the root does not depend on
      // where the root is right now.
      if (isFinite(lowY)) this.baseY = -1 - (lowY - this.snake.position.y);
    }

    // Clip-pose world transforms of Head and Mouth, before any delta. The FACE
    // (eyes, snout, jaw, teeth: 2464 of 3258 vertices) is skinned to Mouth,
    // which is a child of ROOT, not of Head; Head carries 66 vertices at the
    // back of the skull. So every head/neck delta below moved the back of the
    // skull while the face stayed put — a 15 cm tear under a full rear, and a
    // hood-like bulge when tracking. Mouth is re-attached after the deltas.
    if (rig.head && rig.mouth) {
      rig.head.updateWorldMatrix(true, false);
      rig.mouth.updateWorldMatrix(false, false);
      rig.head.matrixWorld.decompose(this._hp0, this._hq0, this._s);
      rig.mouth.matrixWorld.decompose(this._mp0, this._mq0, this._s);
    }

    // ---- Body slither ---- a small travelling wave down Chest→Body→Tail,
    // as a lateral BEND (about the snake's up axis).
    // (The Walk clip carries the primary undulation; this adds life at rest.)
    this._slitherAmtSm += (this.slitherAmt - this._slitherAmtSm) * Math.min(1, d * 6);
    this._slitherPhase += d * (2.2 + this._slitherSpeed * 3.0);
    const SL = 0.055;
    const chain = [rig.chest, rig.body, ...rig.tail].filter(Boolean);
    for (let i = 0; i < chain.length; i++) {
      const amp = SL * (0.35 + i * 0.18);
      const ph = this._slitherPhase - i * 0.7;
      this._rotSnake(chain[i], 0, 1, 0, Math.sin(ph) * amp * this._slitherAmtSm);
    }
    this._rotSnake(rig.neck, 0, 1, 0, Math.sin(this._slitherPhase + 0.4) * SL * 0.5 * this._slitherAmtSm);

    // ---- Breath ---- a slow ripple down the forebody, so a settled bask is
    // never statue-still between tongue flicks (quicker when reared/agitated).
    this._breathPhase += d * (this._rear > 0.3 ? 2.4 : 1.5);
    const br = Math.sin(this._breathPhase);
    this._rotSnake(rig.chest, 1, 0, 0, -br * 0.008);
    this._rotSnake(rig.body, 1, 0, 0, br * 0.005);

    // ---- Cobra rear ---- the face draws back and tilts up at you (rearK),
    // plus a slow hypnotic weave while held. No root lift any more: it raised
    // the WHOLE snake 10 % of its height, belly and tail off the ground.
    this._rear += (this.rearTarget - this._rear) * Math.min(1, d * 4);
    if (this._rear > 0.01) {
      const r = this._rear, K = this.rearK;
      this._rotSnake(rig.chest, 1, 0, 0, K.chest * r);
      this._rotSnake(rig.neck, 1, 0, 0, K.neck * r);
      this._rotSnake(rig.head, 1, 0, 0, K.head * r);
      this._rotSnake(rig.neck, 0, 0, 1, Math.sin(t * 1.3) * 0.05 * r);
    }

    // ---- Head tracking (scene-fed yaw+pitch, in the snake's frame) ----
    // + yaw turns toward +x (the scene's atan2 convention); + pitch looks UP,
    // which about the snake's x axis is a NEGATIVE angle.
    if (Math.abs(this.headYaw) > 0.001) {
      this._rotSnake(rig.neck, 0, 1, 0, this.headYaw * 0.5);
      this._rotSnake(rig.head, 0, 1, 0, this.headYaw * 0.5);
    }
    if (Math.abs(this.headPitch) > 0.001) {
      this._rotSnake(rig.neck, 1, 0, 0, -this.headPitch * 0.5);
      this._rotSnake(rig.head, 1, 0, 0, -this.headPitch * 0.5);
    }

    // ---- Re-attach the face to the head ----
    // Mouth keeps the clip's own motion (its rotation relative to Head varies
    // by up to 0.78 rad in Attack) plus whatever world-space delta the layer
    // above gave Head.
    if (rig.head && rig.mouth) {
      const hp1 = this._v1, hq1 = this._q1, qD = this._q2;
      rig.head.updateWorldMatrix(true, false);
      rig.head.matrixWorld.decompose(hp1, hq1, this._s);
      qD.copy(this._hq0).invert().premultiply(hq1);                    // hq1 · hq0⁻¹
      const np = this._v2.copy(this._mp0).sub(this._hp0).applyQuaternion(qD).add(hp1);
      const par = rig.mouth.parent;
      par.updateWorldMatrix(true, false);
      rig.mouth.position.copy(np).applyMatrix4(this._m1.copy(par.matrixWorld).invert());
      par.getWorldQuaternion(hq1);
      rig.mouth.quaternion.copy(hq1.invert()).multiply(qD.multiply(this._mq0));
    }

    // ---- Jaw ---- open the LowerMouth (hinges on local x; bind ~-0.38); the
    // face tips UP a little as it gapes (it used to pitch the whole face down:
    // Mouth IS the face).
    this._jaw += (this.jawTarget - this._jaw) * Math.min(1, d * (this.jawTarget > this._jaw ? 18 : 10));
    if (this._jaw > 0.01) {
      if (rig.lowerMouth) rig.lowerMouth.rotation.x -= this._jaw * 0.6;
      this._rotSnake(rig.mouth, 1, 0, 0, -this._jaw * 0.10);
    }

    // ---- Tongue flick ---- self-scheduling (d-driven, no timer).
    // A real flick slides the tongue OUT through the lip notch, mouth closed,
    // and waves the fork. The pack's rest pose already has the tongue 1.5–9 cm
    // past the snout, and the old flick swung Tongue1 up 86° — straight up
    // through the top of the snout, every flick. Now: retracted inside the
    // mouth at rest, slid out along its own axis for the flick, fork waving.
    const tg = rig.tongue;
    if (tg[0] && tg[2] && rig.mouth && !this._tongueAxis) {
      // Tongue axis (Tongue1 → Tongue3) in Mouth-local space, and how far back
      // it must sit for the tip to clear inside the snout: the rest overhang
      // plus a margin, as a fraction of the tongue's own length.
      rig.mouth.updateWorldMatrix(true, true);
      const a = new THREE.Vector3(), b = new THREE.Vector3();
      tg[0].getWorldPosition(a); tg[2].getWorldPosition(b);
      const len = a.distanceTo(b);
      const mq = new THREE.Quaternion(); rig.mouth.getWorldQuaternion(mq);
      const ws = new THREE.Vector3(); rig.mouth.getWorldScale(ws);
      this._tongueAxis = b.clone().sub(a).normalize().applyQuaternion(mq.invert());
      this._tongueRetract = (len * 0.95) / Math.max(1e-6, ws.x);     // Mouth-local units
    }
    const FLICK_DUR = 0.42;
    let ext = 0, fork = 0, u = 0;
    if (this._tongueT < 0) {
      this._tongueNext -= d;
      if (this._tongueNext <= 0) {
        this._tongueT = 0;
        // Faint dry tongue tick (a pair), only when close enough to hear.
        const A = window.PhobiaAudio;
        if (A && A.tongueFlick && this.camera) {
          const hp = new THREE.Vector3(); (rig.mouth || rig.head || this.snake).getWorldPosition(hp);
          if (hp.distanceTo(this.camera.position) < 4) {
            const inten = this._tongueFast ? 0.7 : 0.45;
            try { A.tongueFlick(hp, { intensity: inten }); } catch {}
            this._tickEcho = { t: 0.055, hp, inten: inten - 0.05 };
          }
        }
      }
    } else {
      this._tongueT += d;
      u = this._tongueT / FLICK_DUR;
      if (u < 0.3) ext = u / 0.3; else if (u < 0.75) ext = 1; else ext = Math.max(0, 1 - (u - 0.75) / 0.25);
      fork = (u > 0.25 && u < 0.8) ? Math.sin((u - 0.25) / 0.55 * Math.PI) : 0;
      if (u >= 1) {
        this._tongueT = -1;
        const rmin = this._tongueFast ? 0.5 : (this.tongueRest ? this.tongueRest[0] : 2.2);
        const rmax = this._tongueFast ? 1.0 : (this.tongueRest ? this.tongueRest[1] : 5.0);
        this._tongueNext = rmin + Math.random() * (rmax - rmin);
      }
    }
    if (this._tickEcho) {
      this._tickEcho.t -= d;
      if (this._tickEcho.t <= 0) {
        const e = this._tickEcho; this._tickEcho = null;
        try { window.PhobiaAudio && window.PhobiaAudio.tongueFlick && window.PhobiaAudio.tongueFlick(e.hp, { intensity: e.inten }); } catch {}
      }
    }
    if (this._tongueAxis) {
      // ext 0 → fully back inside, 1 → the pack's rest reach.
      tg[0].position.addScaledVector(this._tongueAxis, -this._tongueRetract * (1 - ext));
      if (fork > 0) {
        // Fork waves up and down, fast, about the snake's left-right axis.
        const w = Math.sin(u * 44) * fork;
        this._rotSnake(tg[1], 1, 0, 0, w * 0.22);
        this._rotSnake(tg[2], 1, 0, 0, w * 0.30);
      }
    }

    // ---- Single absolute y-write (belly plant + pose offset + surface lift) ----
    this.snake.position.y += (this.baseY + poseYPrev + this.surfY - this.snake.position.y) * Math.min(1, d * 6);

    // ---- Additive-layer safety net (bookend) ----
    for (const r of this._lifeBones) {
      r.fin.x = r.b.rotation.x; r.fin.y = r.b.rotation.y; r.fin.z = r.b.rotation.z;
    }
    for (const r of this._posNets) r.fin.copy(r.b.position);
  }
}

// ---------- Snakes ----------
// Snake temperaments. strikeDist / strikeApproach / strikeCooldown / watchDist /
// rearDist / wanderSpeed / fearMul / inZoneDist are ALL absent on purpose — the
// strike is the rung's threat and is approach-speed gated; nothing here may
// touch it.
const SNAKE_TEMPERAMENTS = [
  { id: "basking",  label: "sluggish", baskMul: 1.24, tongueMul: 1.18, roamMul: 0.80, hissMul: 1.20, crossMul: 0.80 },
  { id: "watchful", label: "watchful", baskMul: 0.92, tongueMul: 0.86, roamMul: 1.00, hissMul: 0.88, crossMul: 1.00 },
  { id: "roaming",  label: "restless", baskMul: 0.82, tongueMul: 0.96, roamMul: 1.22, hissMul: 1.00, crossMul: 1.18 },
  { id: "settled",  label: "settled",  baskMul: 1.14, tongueMul: 1.08, roamMul: 0.88, hissMul: 1.10, crossMul: 0.90 },
];

// Threat beacon target — ONE module-scope object, mutated in place each frame
// (window.PhobiaThreat points here while the snake is telegraphing/lunging so
// the avatar's gaze fixates the head; nulled when it stands down).
const _snakeThreatPos = { x: 0, y: 0, z: 0 };

function setupSnakes(scene, camera, level, levelIdx, ctx) {
  const size = level.size;
  const intensity = level.intensity || (size >= 0.9 ? "apex" : size >= 0.55 ? "alert" : "calm");
  const baseB = level.behavior || {};
  const V = ctx || sceneContext("snakes", levelIdx, false);
  const temper = V.pick(SNAKE_TEMPERAMENTS);
  const B = (() => {
    const b = Object.assign({}, baseB);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (Array.isArray(b.baskDur)) b.baskDur = b.baskDur.map(x => x * temper.baskMul);
    if (Array.isArray(b.tongueEvery)) b.tongueEvery = b.tongueEvery.map(x => x * temper.tongueMul);
    if (b.homeRadius != null) b.homeRadius = clamp(b.homeRadius * temper.roamMul, 0.4, 2.8);
    if (b.warnHissEvery != null) b.warnHissEvery = clamp(b.warnHissEvery * temper.hissMul, 4, 14);
    if (b.crossChance != null) b.crossChance = clamp(b.crossChance * temper.crossMul, 0.15, 0.75);
    return b;
  })();
  const rung = Math.max(0, Math.min(4, levelIdx || 0));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  // Teardown registries + shell tracking (extends the existing dispose).
  const sceneTimers = [];
  const liveAudio = [];
  const shellPieces = [];
  // Honest per-intensity credit thresholds so full credit is reachable on the
  // gentle rungs (proximity·fearMul caps the fear ceiling low there).
  if (window.PhobiaFear) {
    window.PhobiaFear._duration = 0;
    if (window.PhobiaFear.setCreditThresholds) {
      if (intensity === "calm") window.PhobiaFear.setCreditThresholds(20, 7);
      else if (intensity === "alert") window.PhobiaFear.setCreditThresholds(27, 10);
      // apex keeps the 30/10 defaults
    }
  }

  // ---- Warm sun-dappled clearing (per-rung MOOD; no fog — a real place) ----
  const MOODS = [
    { bg: 0x9fb4c8, sunC: 0xfff2d2, sunI: 2.2, sunPos: [7, 13, 5], hemiSky: 0xbfe0ff, hemiGnd: 0x5a5230, hemiI: 0.85, glowC: 0xffe6b8, glowI: 0.55, skyTop: "#7fb4e8", skyHz: "#f3e6c4", beamO: 0.030, treeC: "rgba(58,74,48,0.9)" },
    { bg: 0x98adc2, sunC: 0xffedc8, sunI: 2.1, sunPos: [7, 12, 5], hemiSky: 0xb6d8fb, hemiGnd: 0x574f2e, hemiI: 0.80, glowC: 0xffe2b0, glowI: 0.55, skyTop: "#79aee2", skyHz: "#f1e0bc", beamO: 0.034, treeC: "rgba(56,70,46,0.9)" },
    { bg: 0x93a6bb, sunC: 0xffe4b6, sunI: 2.2, sunPos: [8, 10, 6], hemiSky: 0xacd0f4, hemiGnd: 0x524b2c, hemiI: 0.72, glowC: 0xffd9a4, glowI: 0.60, skyTop: "#6fa4d8", skyHz: "#f0dbb0", beamO: 0.040, treeC: "rgba(52,66,44,0.9)" },
    { bg: 0x8e9fb2, sunC: 0xffd9a2, sunI: 2.4, sunPos: [9, 8, 6], hemiSky: 0xa4c6ea, hemiGnd: 0x4c4629, hemiI: 0.62, glowC: 0xffce94, glowI: 0.65, skyTop: "#679cce", skyHz: "#eecfa2", beamO: 0.050, treeC: "rgba(48,60,40,0.92)" },
    { bg: 0x8899ab, sunC: 0xffcf90, sunI: 2.6, sunPos: [10, 6.5, 6.5], hemiSky: 0x9cbee2, hemiGnd: 0x453f26, hemiI: 0.54, glowC: 0xffc684, glowI: 0.72, skyTop: "#5f93c6", skyHz: "#ecc596", beamO: 0.062, treeC: "rgba(44,56,38,0.94)" },
  ];
  const mood = MOODS[rung];
  scene.background = new THREE.Color(mood.bg);
  const _coolSun = new THREE.Color(0xcdd6dc);
  const _chargeBg = new THREE.Color(0x6f7a86);
  let _fearGrade = 0;

  const sun = new THREE.DirectionalLight(mood.sunC, mood.sunI);
  sun.position.set(...mood.sunPos);
  sun.target.position.set(0, -1, -6);
  sun.castShadow = !IS_LOW_POWER;
  if (sun.castShadow) {
    const mapRes = sceneQuality() === "high" ? 2048 : 1024;
    sun.shadow.mapSize.set(mapRes, mapRes);
    sun.shadow.camera.left = -9; sun.shadow.camera.right = 9; sun.shadow.camera.top = 9; sun.shadow.camera.bottom = -9;
    sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 34; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  }
  scene.add(sun); scene.add(sun.target); shellPieces.push(sun, sun.target);
  const hemi = new THREE.HemisphereLight(mood.hemiSky, mood.hemiGnd, mood.hemiI);
  scene.add(hemi); shellPieces.push(hemi);
  const groundGlow = new THREE.PointLight(mood.glowC, mood.glowI, 12, 2);
  scene.add(groundGlow); shellPieces.push(groundGlow);
  const lightBase = { sunI: sun.intensity, sunC: sun.color.getHex(), hemiI: hemi.intensity, glowI: groundGlow.intensity };

  // ---- The meadow ----
  // An open, rocky grassland at golden hour: the photographic sky the dog
  // room already ships for its window (Poly Haven "meadow", CC0) wraps the
  // clearing as a dome, and the ground fogs into its horizon. It replaces a
  // painted backdrop of semicircle "trees" whose cream sky band blew out to
  // white, translucent flat-colour grass cards, and an 11-sided puck of a
  // rock — and it is the kind of place a grass snake really basks.
  const FLOOR_W = 76;
  const grassMaps = makeGrassMaps();
  [grassMaps.albedo, grassMaps.normal, grassMaps.roughness].forEach(tx => { if (tx) tx.repeat.set(FLOOR_W / 4.4, FLOOR_W / 4.4); });
  const floorGeo = new THREE.PlaneGeometry(FLOOR_W, FLOOR_W, 48, 48);
  {
    // Macro colour: drier and lusher patches over the tiled detail map, so
    // the ground stops reading as one repeated swatch.
    const pos = floorGeo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const n = Math.sin(x * 0.21 + 1.3) * Math.cos(y * 0.17 - 0.4) * 0.5 + Math.sin(x * 0.07 - y * 0.09 + 2.1) * 0.5;
      const dry = Math.max(0, Math.min(1, 0.5 + n * 0.65));
      col[i * 3] = 0.90 + dry * 0.22; col[i * 3 + 1] = 0.98 + dry * 0.04; col[i * 3 + 2] = 0.84 - dry * 0.10;
    }
    floorGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  }
  const floor = new THREE.Mesh(floorGeo,
    new THREE.MeshStandardMaterial({ map: grassMaps.albedo, normalMap: grassMaps.normal, roughnessMap: grassMaps.roughness, color: 0xffffff, vertexColors: true, envMapIntensity: 0.35 }));
  if (floor.material.normalMap) floor.material.normalScale.set(0.9, 0.9);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1; floor.receiveShadow = true;
  scene.add(floor); shellPieces.push(floor);
  const earthMaps = makeEarthMaps();
  [earthMaps.albedo, earthMaps.normal, earthMaps.roughness].forEach(tx => { if (tx) tx.repeat.set(1.6, FLOOR_W / 4.4); });
  const pathGeo = new THREE.PlaneGeometry(2.6, FLOOR_W, 1, 48);
  { const pos = pathGeo.attributes.position; for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + 0.7 * Math.sin(pos.getY(i) * 0.28)); pos.needsUpdate = true; pathGeo.computeVertexNormals(); }
  const path = new THREE.Mesh(pathGeo, new THREE.MeshStandardMaterial({ map: earthMaps.albedo, normalMap: earthMaps.normal, roughnessMap: earthMaps.roughness, color: 0xffffff, envMapIntensity: 0.3 }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, -0.985, 0); path.receiveShadow = true;
  scene.add(path); shellPieces.push(path);
  // World x of the path's centre line at depth z (the plane's y is world −z).
  const pathX = (z) => 0.7 * Math.sin(-z * 0.28);

  // Sky dome + horizon haze. Until the HDR lands, the flat background colour
  // and a neutral haze stand in (and remain the low-tier look if it fails).
  const backdropMat = null;
  const fogBase = new THREE.Color(0xb9bdb2);
  scene.fog = new THREE.Fog(fogBase.clone(), 13, 33);
  let skyDome = null, skyEnv = null;
  const SKY_GAIN = 0.62, SKY_YAW = -1.34;   // HDR sun turned to sit behind-right, with the scene's key light
  loadMeadowHDR().then((hdr) => {
    if (!hdr || snake.userData.disposed) return;
    try {
      const mat = new THREE.MeshBasicMaterial({ map: hdr, side: THREE.BackSide, fog: false, depthWrite: false });
      mat.color.setScalar(SKY_GAIN);
      skyDome = new THREE.Mesh(new THREE.SphereGeometry(36, 48, 24), mat);
      skyDome.rotation.y = SKY_YAW;
      skyDome.renderOrder = -10; skyDome.frustumCulled = false;
      skyDome.userData.noCollide = true; skyDome.userData.noPick = true;
      scene.add(skyDome);
      // The fog must BE the horizon, or the ground's far edge draws a seam:
      // average the HDR's distant land right at and just below its horizon
      // (the band above is sky, and fogging the turf toward it drew a white
      // strip along the edge of the world).
      const img = hdr.image, W = img.width, H = img.height, data = img.data;
      const half = hdr.type === THREE.HalfFloatType;
      const rd = (v) => half ? THREE.DataUtils.fromHalfFloat(v) : v;
      const ch = data.length / (W * H);
      let r = 0, g = 0, b2 = 0, n = 0;
      for (let row = Math.floor(H * 0.506); row < Math.floor(H * 0.522); row++) {
        for (let x = 0; x < W; x += 4) { const i = (row * W + x) * ch; r += rd(data[i]); g += rd(data[i + 1]); b2 += rd(data[i + 2]); n++; }
      }
      if (n) { fogBase.setRGB(r / n * SKY_GAIN, g / n * SKY_GAIN, b2 / n * SKY_GAIN); scene.fog.color.copy(fogBase); }
      // Image-based light from the same sky (not on the low tier).
      const rr = scene.userData && scene.userData.renderer;
      if (rr && sceneQuality() !== "low") {
        const gl = rr.getContext();
        if (gl && !gl.isContextLost()) {
          const gen = new THREE.PMREMGenerator(rr);
          skyEnv = gen.fromEquirectangular(hdr).texture;
          scene.environment = skyEnv;
          gen.dispose();
        }
      }
    } catch (e) { console.warn("[snakes] sky:", e); }
  });

  // No canopy over an open meadow: the god-ray shaft and the dappled "leaf"
  // gobo are gone. Pollen still drifts in the low sun over the rock.
  const _rayTop = new THREE.Vector3(2.0, 8.0, -4.0);
  const _sdir = new THREE.Vector3(0, -1, -6).sub(new THREE.Vector3(...mood.sunPos)).normalize();
  const _rayLen = (_rayTop.y - (-1)) / Math.max(0.05, -_sdir.y);
  const _rayFloor = _rayTop.clone().addScaledVector(_sdir, _rayLen);
  groundGlow.position.copy(_rayFloor).add(new THREE.Vector3(0, 0.8, 0));
  let gobo = null, dustPoints = null, dustPos = null, dustAttr = null; const dustData = [];
  const dustCount = sceneQuality() === "high" ? 90 : sceneQuality() === "medium" ? 50 : 24;
  dustPos = new Float32Array(dustCount * 3);
  const spawnMote = (i) => { const s = Math.random() * _rayLen; const p = _rayTop.clone().addScaledVector(_sdir, s); dustPos[i * 3] = p.x + (Math.random() - 0.5) * 1.6; dustPos[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.6; dustPos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 1.6; };
  for (let i = 0; i < dustCount; i++) { spawnMote(i); dustData.push({ vx: (Math.random() - 0.5) * 0.03, vy: -0.02 - Math.random() * 0.03, vz: (Math.random() - 0.5) * 0.03, phaseX: Math.random() * 6.28, phaseY: Math.random() * 6.28 }); }
  const dustGeo = new THREE.BufferGeometry(); dustAttr = new THREE.BufferAttribute(dustPos, 3); dustAttr.setUsage(THREE.DynamicDrawUsage); dustGeo.setAttribute("position", dustAttr);
  const dC = document.createElement("canvas"); dC.width = dC.height = 32; const dctx = dC.getContext("2d"); const dg = dctx.createRadialGradient(16, 16, 0, 16, 16, 16); dg.addColorStop(0, "rgba(255,244,214,1)"); dg.addColorStop(1, "rgba(255,244,214,0)"); dctx.fillStyle = dg; dctx.fillRect(0, 0, 32, 32);
  dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.02, map: new THREE.CanvasTexture(dC), transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  dustPoints.userData.noCollide = true; scene.add(dustPoints); shellPieces.push(dustPoints);

  // Stone: one weathered grey-tan material for the basking slab and the
  // scattered rocks, so they read as the same bedrock the sky dome shows.
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7d7466, roughness: 0.9, envMapIntensity: 0.35, vertexColors: true,
    normalMap: earthMaps.normal ? earthMaps.normal.clone() : null });
  if (stoneMat.normalMap) { stoneMat.normalMap.repeat.set(2.2, 2.2); stoneMat.normalMap.needsUpdate = true; stoneMat.normalScale.set(1.2, 1.2); }
  // Low-frequency value noise for rock shapes and lichen colour.
  const rnoise = (x, y, z) => Math.sin(x * 2.1 + y * 1.3) * Math.cos(z * 1.9 - x * 0.7) * 0.5
    + Math.sin(x * 4.3 - z * 3.1 + y * 2.2) * 0.25 + Math.cos(y * 5.7 + z * 4.9) * 0.125;
  const stoneColors = (geo, seed) => {
    const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + seed, y = pos.getY(i), z = pos.getZ(i) - seed;
      const lich = Math.max(0, rnoise(x * 1.7, y * 1.7, z * 1.7) - 0.25) * 0.9;   // pale lichen blooms
      const dark = Math.max(0, -rnoise(x * 0.9 + 3, y, z * 0.9)) * 0.35;            // weathered streaks
      col[i * 3] = 1 - dark + lich * 0.18; col[i * 3 + 1] = 1 - dark + lich * 0.22; col[i * 3 + 2] = 1 - dark * 1.1 + lich * 0.06;
    }
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  };

  // Basking rock (the snake's home) — a LOW, flat-topped slab at the snake's
  // spawn spot. The top stays ≈0.095 m above the ground inside r≈1.2 (the
  // snake's belly grounding assumes it); the rim is broken and irregular.
  const _snakeZ = -(9 - size * 8);
  // Listed rim → centre: LatheGeometry faces outward along the profile's
  // direction of travel, so centre → rim built an upside-down (culled) slab.
  const rockProf = [[1.62, -0.02], [1.57, 0.006], [1.48, 0.034], [1.36, 0.066], [1.2, 0.088], [0.95, 0.096], [0.55, 0.099], [0, 0.098]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const rockGeo = new THREE.LatheGeometry(rockProf, 56);
  {
    const pos = rockGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const r = Math.hypot(x, z);
      if (r < 1e-4) continue;
      const a = Math.atan2(z, x);
      // Irregular outline (the slab is a broken plate, not a lathe).
      const edge = Math.min(1, Math.max(0, (r - 0.9) / 0.7));
      const k = 1 + edge * (0.10 * Math.sin(a * 3 + 0.7) + 0.06 * Math.sin(a * 7 + 2.1) + 0.035 * Math.sin(a * 13));
      // A few centimetres of relief on the top; more on the rounded shoulder.
      const dy = (0.004 + edge * 0.02) * rnoise(x * 2.4, 0, z * 2.4);
      pos.setXYZ(i, x * k, y + dy, z * k);
    }
    rockGeo.computeVertexNormals();
    stoneColors(rockGeo, 0.37);
  }
  const rock = new THREE.Mesh(rockGeo, stoneMat);
  rock.position.set(0, -1.0, _snakeZ); rock.rotation.y = Math.random() * Math.PI * 2;
  rock.receiveShadow = true; rock.castShadow = true; rock.userData.noCollide = true;
  scene.add(rock); shellPieces.push(rock);

  // Fallen log: bark along its length, sawn rings on the ends, a slightly
  // uneven girth.
  const makeBarkTex = () => {
    const c = document.createElement("canvas"); c.width = 128; c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#4b3a29"; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 46; i++) {
      const x0 = Math.random() * 128, w = 1.5 + Math.random() * 4;
      g.strokeStyle = Math.random() < 0.6 ? "rgba(28,20,13,0.85)" : "rgba(112,92,66,0.55)";
      g.lineWidth = w; g.beginPath(); g.moveTo(x0, 0);
      for (let y = 0; y <= 256; y += 16) g.lineTo(x0 + Math.sin(y * 0.05 + i) * 3 + (Math.random() - 0.5) * 2, y);
      g.stroke();
    }
    for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "20,14,9" : "130,116,88"},${0.15 + Math.random() * 0.25})`; g.fillRect(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 3); }
    const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace; t2.wrapS = t2.wrapT = THREE.RepeatWrapping; t2.repeat.set(3, 2);
    return t2;
  };
  const makeRingsTex = () => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = "#7d6443"; g.fillRect(0, 0, 128, 128);
    for (let r = 4; r < 64; r += 3 + Math.random() * 3) { g.strokeStyle = `rgba(60,42,24,${0.35 + Math.random() * 0.3})`; g.lineWidth = 1 + Math.random(); g.beginPath(); g.arc(64 + (Math.random() - 0.5) * 2, 64 + (Math.random() - 0.5) * 2, r, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = "#3a2b1c"; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 61, 0, Math.PI * 2); g.stroke();
    const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace;
    return t2;
  };
  const logGeo = new THREE.CylinderGeometry(0.35, 0.4, 4.5, 20, 8);
  { const pos = logGeo.attributes.position; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); const r = Math.hypot(x, z); if (r < 0.05 || Math.abs(Math.abs(y) - 2.25) < 1e-3 && r < 0.34) continue; const k = 1 + 0.05 * Math.sin(y * 2.3 + Math.atan2(z, x) * 2) + 0.03 * Math.sin(y * 5.1); pos.setX(i, x * k); pos.setZ(i, z * k); } logGeo.computeVertexNormals(); }
  const logMat = new THREE.MeshStandardMaterial({ map: makeBarkTex(), color: 0xffffff, roughness: 0.95, envMapIntensity: 0.25,
    normalMap: earthMaps.normal ? earthMaps.normal.clone() : null });
  const logEndMat = new THREE.MeshStandardMaterial({ map: makeRingsTex(), color: 0xffffff, roughness: 0.9, envMapIntensity: 0.2 });
  const log = new THREE.Mesh(logGeo, [logMat, logEndMat, logEndMat]);
  log.rotation.z = Math.PI / 2; log.rotation.y = 0.4; log.position.set(-3.2, -0.7, -3.5); log.castShadow = true; log.receiveShadow = true; log.userData.noCollide = true;
  // Its axis runs (−0.921, 0, 0.389) after the two rotations; 4.5 m long.
  // The rock moves with the rung (_snakeZ) and the log did not: on rung 3 the
  // log's end was 1.14 m from the rock's centre — 0.66 m of it buried in a
  // slab of 1.4 m radius — and about 28 % of spawns coiled the snake INSIDE
  // the log. Slide it along −x until it clears the rock's base (r 1.6) by a
  // log radius and a margin.
  const LOG_AX = { x: -0.921, z: 0.389 }, LOG_HALF = 2.25, LOG_R = 0.4;
  const logSeg = () => ({ ax: log.position.x - LOG_AX.x * LOG_HALF, az: log.position.z - LOG_AX.z * LOG_HALF,
                          bx: log.position.x + LOG_AX.x * LOG_HALF, bz: log.position.z + LOG_AX.z * LOG_HALF });
  const segDist = (px, pz, sg) => {
    const vx = sg.bx - sg.ax, vz = sg.bz - sg.az;
    const k = Math.max(0, Math.min(1, ((px - sg.ax) * vx + (pz - sg.az) * vz) / (vx * vx + vz * vz)));
    return Math.hypot(px - (sg.ax + vx * k), pz - (sg.az + vz * k));
  };
  { const need = 1.6 + LOG_R + 0.25, have = segDist(0, _snakeZ, logSeg()); if (have < need) log.position.x -= (need - have) / 0.92; }
  scene.add(log); shellPieces.push(log);

  // Where set dressing may NOT go: the path, the basking rock, the log, the
  // spawn point.
  const freeSpot = (x, z, pad = 0) => Math.abs(x - pathX(z)) > 1.55 + pad
    && Math.hypot(x, z - _snakeZ) > 2.0 + pad
    && segDist(x, z, logSeg()) > 0.7 + pad
    && Math.hypot(x, z - 4) > 1.2 + pad;

  // Scattered stones, half sunk in the turf (the dome's own ground is rock).
  {
    const nR = sceneQuality() === "low" ? 5 : 9;
    for (let i = 0, tries = 0; i < nR && tries < 200; tries++) {
      const ang = Math.random() * Math.PI * 2, rad = 4 + Math.random() * 13;
      const x = Math.cos(ang) * rad, z = _snakeZ + 2 + Math.sin(ang) * rad;
      if (!freeSpot(x, z, 0.8)) continue;
      const g2 = new THREE.IcosahedronGeometry(1, 3);
      const pos = g2.attributes.position, sd = Math.random() * 10;
      for (let j = 0; j < pos.count; j++) { const vx = pos.getX(j), vy = pos.getY(j), vz = pos.getZ(j); const k = 1 + 0.22 * rnoise(vx * 1.3 + sd, vy * 1.3, vz * 1.3 - sd); pos.setXYZ(j, vx * k, vy * k, vz * k); }
      g2.computeVertexNormals(); stoneColors(g2, sd);
      const m = new THREE.Mesh(g2, stoneMat);
      const w = 0.25 + Math.random() * 0.7;
      m.scale.set(w * (0.8 + Math.random() * 0.5), w * (0.35 + Math.random() * 0.3), w * (0.8 + Math.random() * 0.5));
      m.position.set(x, -1 + m.scale.y * 0.25, z); m.rotation.y = Math.random() * Math.PI;
      m.castShadow = !IS_LOW_POWER; m.receiveShadow = true; m.userData.noCollide = true;
      scene.add(m); shellPieces.push(m);
      i++;
    }
  }

  // Bushes: clusters of alpha-cut leaf cards round a dark core (one draw call
  // for every leaf), replacing four flat-shaded low-poly balls each.
  const BUSHES = [[4.5, -0.7, -5], [-4.5, -0.6, -7], [3.0, -0.65, -1]];
  {
    const leafTex = makeLeafTexture();
    const leafMat = new THREE.MeshStandardMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, envMapIntensity: 0.3 });
    const leafGeo = new THREE.PlaneGeometry(0.10, 0.19); leafGeo.translate(0, 0.09, 0);
    const PER = sceneQuality() === "low" ? 90 : sceneQuality() === "medium" ? 180 : 260;
    const leaves = new THREE.InstancedMesh(leafGeo, leafMat, BUSHES.length * PER);
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x2f4420, roughness: 1.0 });
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
    let li = 0;
    for (const [bx, by, bz] of BUSHES) {
      const rx = 0.75 + Math.random() * 0.3, ry = 0.55 + Math.random() * 0.2, rz = 0.7 + Math.random() * 0.3;
      const core = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), coreMat);
      core.scale.set(rx * 0.78, ry * 0.8, rz * 0.78); core.position.set(bx, by + 0.05, bz);
      core.castShadow = !IS_LOW_POWER; core.receiveShadow = true; core.userData.noCollide = true;
      scene.add(core); shellPieces.push(core);
      for (let k = 0; k < PER; k++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
        const up = Math.abs(u) * (Math.random() < 0.8 ? 1 : -0.3);       // mostly the upper shell
        _n.set(Math.sqrt(1 - up * up) * Math.cos(th), up, Math.sqrt(1 - up * up) * Math.sin(th)).normalize();
        const d = 0.84 + Math.random() * 0.22;
        _p.set(bx + _n.x * rx * d, by + 0.05 + _n.y * ry * d, bz + _n.z * rz * d);
        _q.setFromUnitVectors(_up, _n);
        _q.multiply(new THREE.Quaternion().setFromAxisAngle(_up, Math.random() * Math.PI * 2));
        const sc = 0.8 + Math.random() * 0.6;
        _s.set(sc, sc, sc);
        leaves.setMatrixAt(li, _m.compose(_p, _q, _s));
        leaves.setColorAt(li, _c.setHSL(0.24 + Math.random() * 0.06, 0.35 + Math.random() * 0.2, 0.34 + Math.random() * 0.18));
        li++;
      }
    }
    leaves.instanceMatrix.needsUpdate = true; if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    leaves.computeBoundingSphere();
    leaves.castShadow = !IS_LOW_POWER; leaves.receiveShadow = true; leaves.userData.noCollide = true;
    scene.add(leaves); shellPieces.push(leaves);
  }

  // Grass: instanced tufts of alpha-cut blades (two crossed cards each), in
  // one draw call, swaying in a vertex-shader breeze. Normals point up, so a
  // tuft is lit like the turf it grows from instead of like a flat sign.
  const grassWind = { value: 0 };
  {
    const c = document.createElement("canvas"); c.width = 128; c.height = 256;
    const g = c.getContext("2d");
    for (let i = 0; i < 34; i++) {
      const x0 = 14 + Math.random() * 100, tipY = 20 + Math.random() * 150, lean = (Math.random() - 0.5) * 60, w = 3 + Math.random() * 5;
      const dry = Math.random() < 0.22;
      const grad = g.createLinearGradient(0, 256, 0, tipY);
      grad.addColorStop(0, dry ? "#5a5230" : "#34471d");
      grad.addColorStop(0.55, dry ? "#8f8248" : "#5d7a2f");
      grad.addColorStop(1, dry ? "#c2b27a" : "#9fb55a");
      g.fillStyle = grad;
      g.beginPath(); g.moveTo(x0 - w / 2, 256);
      g.quadraticCurveTo(x0 + lean * 0.3, (256 + tipY) / 2, x0 + lean, tipY);
      g.quadraticCurveTo(x0 + lean * 0.3 + w * 0.2, (256 + tipY) / 2, x0 + w / 2, 256);
      g.closePath(); g.fill();
    }
    const tuftTex = new THREE.CanvasTexture(c); tuftTex.colorSpace = THREE.SRGBColorSpace;
    // Two crossed 0.5 m cards, base on the ground.
    const P = [], N = [], U = [], I = [];
    for (let q = 0; q < 2; q++) {
      const ca = Math.cos(q * Math.PI / 2), sa = Math.sin(q * Math.PI / 2), b0 = P.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
        const lx = (u - 0.5) * 0.5; P.push(lx * ca, v * 0.5, lx * sa); N.push(0, 1, 0); U.push(u, v);
      }
      I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    }
    const tuftGeo = new THREE.BufferGeometry();
    tuftGeo.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    tuftGeo.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    tuftGeo.setAttribute("uv", new THREE.Float32BufferAttribute(U, 2));
    tuftGeo.setIndex(I);
    const tuftMat = new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95, envMapIntensity: 0.3 });
    tuftMat.onBeforeCompile = (sh) => {
      // DoubleSide flips the normal on back faces — with up-pointing normals
      // that lit half of every tuft from underneath, i.e. black.
      sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>",
        THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
      sh.uniforms.uWind = grassWind;
      sh.vertexShader = "uniform float uWind;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float wph = instanceMatrix[3].x * 0.9 + instanceMatrix[3].z * 0.6;
        #else
          float wph = 0.0;
        #endif
        float wb = (sin(uWind * 1.7 + wph) * 0.6 + sin(uWind * 2.9 + wph * 1.7) * 0.25) * (1.0 + 0.5 * sin(uWind * 0.43));
        transformed.x += wb * 0.07 * uv.y * uv.y;
        transformed.z += wb * 0.04 * uv.y * uv.y;`);
    };
    const NT = sceneQuality() === "high" ? 1400 : sceneQuality() === "medium" ? 800 : 320;
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, NT);
    const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
    let placed = 0;
    for (let tries = 0; placed < NT && tries < NT * 6; tries++) {
      // Denser near the action, thinning out toward the haze.
      const rad = 1.0 + Math.pow(Math.random(), 1.6) * 20, ang = Math.random() * Math.PI * 2;
      const x = Math.cos(ang) * rad, z = _snakeZ + 3 + Math.sin(ang) * rad;
      if (!freeSpot(x, z, -0.15)) continue;
      _p.set(x, -1.0, z);
      _q.setFromAxisAngle(_up, Math.random() * Math.PI);
      const hgt = 0.55 + Math.random() * 0.75, wid = 0.7 + Math.random() * 0.6;
      _s.set(wid, hgt, wid);
      tufts.setMatrixAt(placed, _m.compose(_p, _q, _s));
      tufts.setColorAt(placed, _c.setRGB(0.85 + Math.random() * 0.25, 0.88 + Math.random() * 0.2, 0.8 + Math.random() * 0.15));
      placed++;
    }
    tufts.count = placed;
    tufts.instanceMatrix.needsUpdate = true; if (tufts.instanceColor) tufts.instanceColor.needsUpdate = true;
    tufts.computeBoundingSphere();
    tufts.receiveShadow = true; tufts.castShadow = false; tufts.userData.noCollide = true; tufts.userData.noPick = true;
    scene.add(tufts); shellPieces.push(tufts);
  }

  // Warm outdoor ambient bed (breeze + distant birds + cicadas). No reverb.
  {
    const A = window.PhobiaAudio;
    if (A && A.startClearingAmbient) liveAudio.push(A.startClearingAmbient({ intensity: sceneQuality() === "low" ? 0.2 : (0.25 + size * 0.25) }));
  }

  // Snake — real rigged GLTF (Quaternius "Easy Enemies", CC0), replacing the
  // old procedural tube. It lies along the path; the model animates a constant
  // slither in idle. `size` drives both distance and the snake length.
  const distance = 9 - size * 8;
  // The model's idle is a coiled, reared (cobra-like) pose, so it's tall — size
  // it by overall height to a modest world height that scales with the rung.
  const snake = buildCreature(CREATURE_MODELS.snake, {
    targetSize: 0.5 + size * 0.55,   // reared height in world units (~0.6 -> ~1.05)
    axis: "y",
    coat: coatFor("snake", SNAKE_COATS),
  });
  // Lying somewhere else on the path each visit. Radial distance is the rung's.
  snake.position.set(V.range(-1.1, 1.1), -1, -distance + V.range(-0.35, 0.35));
  if (segDist(snake.position.x, snake.position.z, logSeg()) < LOG_R + 0.5) snake.position.x = Math.abs(snake.position.x);
  let moodChipOff = null;   // the mood is named in the coach card's footer
  // Head anchor near the raised head, for the hand-extend proximity check.
  const headAnchor = new THREE.Group();
  snake.add(headAnchor);
  snake.userData.onReady = () => {
    try {
      const pp = snake.userData.parts;
      // Scale-material pass — pull the flat cartoon colours toward a realistic
      // scaled serpent (dark olive/brown, low sheen, a fine scale normal),
      // taming the loud purple/yellow/red accents; keep teeth + a dark-red
      // mouth readable.
      try {
        // Only built when it will actually be applied (non-low tier, per the
        // guard below) — skip the 256×256 Sobel height→normal pass on low power.
        const scaleNrm = sceneQuality() === "low" ? null : ((typeof makeScaleNormal === "function") ? makeScaleNormal() : (makeFurMaps().normal));
        pp.model.traverse(o => {
          if (!o.isMesh || !o.material) return;
          if (o.geometry && typeof ensureBoxUV === "function") { try { ensureBoxUV(o.geometry, pp.span || 0.6); } catch {} }
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach(m => {
            if (!m || !m.color) return;
            const name = (m.name || "").toLowerCase();
            const isTeeth = name.includes("teeth") || name.includes("tooth");
            const isMouth = name === "red" || (name.includes("red") && !name.includes("dark"));
            if (isTeeth) { m.color.setHex(0xe8e2d0); m.roughness = 0.55; m.envMapIntensity = 0.4; m.needsUpdate = true; return; }
            if (isMouth) { m.color.lerp(new THREE.Color(0x7a1410), 0.4); m.roughness = 0.42; m.envMapIntensity = 0.55; m.needsUpdate = true; return; }
            const hsl = {}; m.color.getHSL(hsl);
            hsl.s *= 0.35; hsl.l *= 0.62;
            hsl.h = hsl.h + (0.16 - hsl.h) * 0.55;   // pull toward olive
            m.color.setHSL(hsl.h, hsl.s, hsl.l);
            if (name.includes("purple") || name.includes("yellow")) m.color.lerp(new THREE.Color(0x4a4326), 0.5);
            m.metalness = 0; m.roughness = 0.5; m.envMapIntensity = 0.4;
            if (scaleNrm && sceneQuality() !== "low") { const n = scaleNrm.clone(); n.repeat.set(6, 18); n.needsUpdate = true; m.normalMap = n; if (m.normalScale) m.normalScale.set(0.5, 0.5); }
            m.needsUpdate = true;
          });
        });
      } catch (e) { console.warn("[snakes] scale material:", e); }
      // Grass-snake markings, painted from the rig itself: olive back, dark
      // bars down the flanks, the pale-yellow collar with its black band
      // behind the head, a cream belly — what makes a grass snake readable at
      // ten metres. The pack's skin is ONE mesh ("DarkGreen"); "Yellow" is the
      // big cartoon eyes and "Purple" the tongue, so those get their own
      // treatment. "How far along the body" is the skin weights over the bone
      // chain; the belly is whichever side of the bind-pose skin faces the
      // way the resting tail's underside does.
      try {
        const ORDER = { Mouth: 0, LowerMouth: 0, Tongue1: 0, Tongue2: 0, Tongue3: 0, Head: 0.5, Neck: 1.5, Chest: 2.6, Body: 3.8, Tail: 5.0, Tail1: 6.0, Tail2: 7.0, Tail3: 8.0 };
        const coat = coatFor("snake", SNAKE_COATS);
        const back = new THREE.Color().setHSL(0.17 + ((coat ? coat.h : 0.2) - 0.17) * 0.35, 0.30, 0.30);
        const barC = new THREE.Color(0x1e1c12), collarC = new THREE.Color(0xe0c65e), neckBand = new THREE.Color(0x15130d), bellyC = new THREE.Color(0xcfc6a0);
        const _n = new THREE.Vector3(), _c2 = new THREE.Color(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
        let skin = null;
        pp.model.traverse(o => { if (o.isSkinnedMesh && o.material && o.material.name === "DarkGreen") skin = o; });
        pp.model.traverse(o => {
          if (!o.isMesh || !o.material) return;
          const nm = o.material.name;
          if (nm === "Yellow") { o.material.color.setHex(0x17110a); o.material.roughness = 0.14; o.material.envMapIntensity = 1.0; o.material.needsUpdate = true; }
          if (nm === "Purple") { o.material.color.setHex(0x2b1d22); o.material.roughness = 0.35; o.material.needsUpdate = true; }
          if (nm === "LightGreen") { o.material.color.copy(bellyC); o.material.needsUpdate = true; }
        });
        if (skin) {
          smoothCreaseNormals(skin.geometry, Math.cos(Math.PI * 0.44));
          const g = skin.geometry, pos = g.attributes.position, nor = g.attributes.normal, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
          const bones = skin.skeleton.bones, ord = bones.map(b => ORDER[b.name] ?? 4);
          // Belly direction in bind-mesh space, from a tail bone lying on the ground.
          let bellyDir = null;
          try {
            if (pp.play) pp.play("Idle", 0); if (pp.mixer) pp.mixer.update(0.016); pp.model.updateMatrixWorld(true);
            const tb = bones.find(b => b.name === "Tail2") || bones.find(b => b.name === "Tail1");
            const ti = bones.indexOf(tb);
            if (tb && ti >= 0) {
              tb.getWorldQuaternion(_q);
              let best = null, bestY = 1;
              for (const ax of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) { _v.set(...ax).applyQuaternion(_q); if (_v.y < bestY) { bestY = _v.y; best = ax; } }
              const bindM = skin.skeleton.boneInverses[ti].clone().invert();
              bindM.decompose(_v, _q, _s);
              const bindQ = new THREE.Quaternion(); new THREE.Matrix4().copy(skin.bindMatrix).decompose(_v, bindQ, _s);
              bellyDir = new THREE.Vector3(...best).applyQuaternion(_q).applyQuaternion(bindQ.invert()).normalize();   // into geometry space
            }
          } catch {}
          const col = new Float32Array(pos.count * 3);
          let bellyN = 0;
          const bellyOf = new Float32Array(pos.count);
          for (let i = 0; i < pos.count; i++) {
            _n.fromBufferAttribute(nor, i);
            bellyOf[i] = bellyDir ? Math.max(0, Math.min(1, (_n.dot(bellyDir) - 0.25) / 0.45)) : 0;
            if (bellyOf[i] > 0.5) bellyN++;
          }
          // A belly that covers most of the skin (or none of it) means the
          // bind pose isn't lying straight — drop it rather than paint nonsense.
          const useBelly = bellyN > pos.count * 0.06 && bellyN < pos.count * 0.42;
          for (let i = 0; i < pos.count; i++) {
            let along = 0, wsum = 0;
            for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); along += w * ord[si.getComponent(i, k)]; wsum += w; }
            along /= wsum || 1;
            const bel = useBelly ? bellyOf[i] : 0;
            _c2.copy(back);
            if (along > 0.9 && along < 1.45) _c2.lerp(collarC, 0.85);
            else if (along >= 1.45 && along < 1.85) _c2.lerp(neckBand, 0.9);
            else if (along >= 1.85) {
              _n.fromBufferAttribute(nor, i);
              const f = ((along * 1.7 + (_n.x >= 0 ? 0 : 0.37)) % 1 + 1) % 1;
              if (f < 0.3) _c2.lerp(barC, 0.55);
            }
            if (along < 0.7) _c2.multiplyScalar(0.85);
            _c2.lerp(bellyC, bel * 0.9);
            col[i * 3] = _c2.r; col[i * 3 + 1] = _c2.g; col[i * 3 + 2] = _c2.b;
          }
          g.setAttribute("color", new THREE.BufferAttribute(col, 3));
          skin.material.color.setRGB(1, 1, 1); skin.material.vertexColors = true; skin.material.roughness = 0.46; skin.material.needsUpdate = true;
        }
      } catch (e) { console.warn("[snakes] markings:", e); }
      pp.play("Idle");
      headAnchor.position.set(0, pp.height * 0.78, pp.span * 0.18);
      // "Head" for every look-at, hand-sniff anchor, strike clamp and threat
      // beacon means the FACE — the Mouth bone. The pack's "Head" bone carries
      // only the back of the skull (66 of 3258 vertices), 21 cm below the eyes
      // at rung 4, so all of those aimed behind and under the face.
      pp.headBone = pp.model.getObjectByName("Mouth") || pp.model.getObjectByName("Head") || null;
      pp.neckBone = pp.model.getObjectByName("Neck") || null;
      // Wake the procedural controller + calibrate belly grounding.
      if (snakeCtl.ctrl) {
        snakeCtl.ctrl.suspend = false;
        snakeCtl.ctrl._needsGround = true;
        snakeCtl.ctrl.tongueRest = B.tongueEvery || [2.2, 5.0];
        snakeCtl.ctrl.height = pp.height || 0.6;
        snakeCtl.ctrl.span = pp.span || 0.6;
      }
    } catch {}
  };
  scene.add(snake);

  camera.fov = 55;
  camera.updateProjectionMatrix();
  const snakePitch = Math.atan2(-(1.0 + 0.95), distance);

  let snakesControls = null;
  let stillness = 0;       // 0..1, builds while user holds the "Hold still" button
  const baseSnakeZ = snake.position.z;
  const snakeHomeX = snake.position.x;
  let stillHeld = false;

  // ---- Snake locomotion controller ----
  // The old scene parked the snake at one spot playing its idle clip — it read
  // as a statue. Real snakes are mostly still, but they MOVE: a slow patrol of
  // their patch, the occasional crossing of open ground, a reared watch when
  // something big approaches, retreat from a calm observer. The rig's Walk clip
  // carries the lateral undulation; this controller supplies the root motion
  // (turn-rate-limited so a direction change reads as a body curve, never a
  // pivot) and picks the behaviour state:
  //   bask      — coiled, tongue flicking (Idle clip), the resting default
  //   wander    — slow slither toward a chosen point; on higher rungs it will
  //               deliberately cross the path a couple of metres AHEAD of the
  //               player — movement, not threat, is the exposure
  //   watch     — reared, body angled toward a player who came close; the
  //               Neck/Head bones gently track the player post-mixer
  //   retreat   — slithers away from a still, calm observer (stillness
  //               mechanic) — the disconfirmation: calm makes it leave
  //   defensive — top rungs only: a player who RUSHES the snake gets a hiss +
  //               strike-feint that stops short, then retreat. Teaches the
  //               real-world rule: slow movement reads as safety.
  const snakeCtl = {
    state: "bask",
    stateT: 0,
    baskDur: 3.0 + Math.random() * 4.0,
    heading: 0,                  // facing, radians (+Z forward like the spider)
    speed: 0,                    // current ground speed (m/s)
    target: null,                // wander/retreat destination {x, z}
    crossing: false,             // current wander leg crosses the path
    headYaw: 0,                  // smoothed head-tracking offset (radians)
    headPitch: 0,                // smoothed head-tracking pitch (+ = look up)
    scanTarget: 0,               // idle head-scan bearing while basking
    scanNext: 4 + Math.random() * 6,
    defenseCooldown: 0,
    defensiveSpoken: false,
    lastWarnHiss: -99,
    // Strike sub-state machine (Package B drives the head lunge + jaw); the
    // scene owns the phase so the narrator + celebration gate can read it.
    strikePhase: "none",  // none | telegraph | lunge | recoil
    strikeT: 0,
    striking: false,
    _lungeFrom: null,     // coil root position — the recoil snaps back here
    jawTarget: 0,
    strikeFired: false,
    sniffing: false,
    ctrl: null,           // the SnakeController (Package B)
  };
  snakeCtl.ctrl = new SnakeController(snake, scene, camera);
  snake.userData.ctrl = snakeCtl.ctrl;   // observability for scene-verification hooks
  const SNAKE_BOUNDS = { minX: -3.4, maxX: 3.4, minZ: -9.3, maxZ: 1.2 };
  // ---- Creature readout (trust-hud pattern; see the spider's) ----
  // The five states + the strike phases were all machine and no window: a
  // rear-up read as "attack incoming" when it is a WARNING that passes, and
  // the approach-speed gate — the scene's whole lesson — was invisible.
  // Retired: the coach (below) asks the player to read the snake instead.
  let snHudEl = null, snHudPhrase = "", snHudDwell = 0;
  function snakePhrase() {
    const sp = snakeCtl.strikePhase;
    if (sp === "telegraph") return t("sn.telegraph", "Drawn back — the warning is loud now. Step back slowly.");
    if (sp === "lunge")     return t("sn.lunge", "A strike at the air — range display, and it ends here.");
    if (sp === "recoil")    return t("sn.recoil", "Recoiling — the warning is spent. It settles if you let it.");
    switch (snakeCtl.state) {
      case "watch":     return t("sn.watch", "It noticed you. Watching is a snake's whole first language.");
      case "defensive": return t("sn.defensive", "Risen — a warning, not an attack. Your pace is the message: slow, or one step back.");
      case "retreat":   return t("sn.retreat", "Leaving. Given a choice, a snake chooses away.");
      case "wander":    return t("sn.wander", "Traveling its own path. You're terrain, not target.");
      default:          return t("sn.bask", "At ease — tongue reading the air. The flicker is smell, not threat.");
    }
  }
  const SNAKE_REF_SPEED = 0.5;   // m/s at Walk clip timeScale 1 — tuned by eye
  // Strike geometry. The snout tip (the face's most forward vertex, tracked
  // live through the Attack clip) stops STRIKE_STOP short of your body centre
  // along the strike line — ~25 cm clear of the body; the root may run at
  // most STRIKE_ROOT_RUN (a strike covers a fraction of the body length).
  const STRIKE_STOP = 0.55;
  const STRIKE_ROOT_RUN = 0.35;
  let _snoutIdx = null;
  // Runs AFTER the controller has posed this frame, through the lunge AND the
  // recoil (the Attack clip keeps reaching forward past the 0.30 s lunge).
  // Measured before the pose update it lagged a frame of root travel and clip
  // extension, and the snout still reached 0.41 m from you.
  function strikeSnoutStop(controls) {
    const ph = snakeCtl.strikePhase;
    if (!controls || !snakeCtl._lungeDir || (ph !== "lunge" && ph !== "recoil")) return;
    const ld = snakeCtl._lungeDir;
    snake.updateMatrixWorld(true);
    snoutTip(_snkV1);
    const along = (controls.position.x - _snkV1.x) * ld.x + (controls.position.z - _snkV1.z) * ld.z;
    snakeCtl._snoutAlong = along;
    if (along < STRIKE_STOP) {
      const back = STRIKE_STOP - along;
      snake.position.x -= ld.x * back; snake.position.z -= ld.z * back;
    }
  }
  function snoutTip(out) {
    const pp = snake.userData.parts;
    if (_snoutIdx === null) {
      _snoutIdx = false;
      // Most forward (snake-frame +z) vertex skinned to the face bone.
      const v = new THREE.Vector3(); let best = -Infinity;
      snake.updateMatrixWorld(true);
      pp.model.traverse((o) => {
        if (!o.isSkinnedMesh) return;
        const mi = o.skeleton.bones.findIndex((b) => b.name === "Mouth");
        if (mi < 0) return;
        const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
        for (let i = 0; i < si.count; i++) {
          let wm = 0, im = -1;
          for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > wm) { wm = w; im = si.getComponent(i, k); } }
          if (im !== mi) continue;
          o.getVertexPosition(i, v); o.localToWorld(v); snake.worldToLocal(v);
          if (v.z > best) { best = v.z; _snoutIdx = { mesh: o, i }; }
        }
      });
    }
    if (_snoutIdx) { _snoutIdx.mesh.getVertexPosition(_snoutIdx.i, out); _snoutIdx.mesh.localToWorld(out); }
    else if (pp && pp.headBone) pp.headBone.getWorldPosition(out);
    return out;
  }
  let slitherSound = null;       // lazy spatial rustle handle
  let prevPlayerDist = null, approachSpeed = 0;  // radial m/s toward the snake
  let prevPlayerPos = null;                      // last player XZ (own-velocity approach calc)
  let arousalFloor = 0, engageDur = 0;           // honest-credit state
  let completionBeatDone = false;
  let retreatPraised = false, holdPraised = false;
  const _snkV1 = new THREE.Vector3();
  const _snkHead = new THREE.Vector3();
  const _snkPalm = new THREE.Vector3();
  const _snkHead2 = new THREE.Vector3();

  // The hold-completion fanfare must never fire mid-strike (apex rung).
  window.__holdCelebrationGate = () =>
    intensity !== "apex" || (snakeCtl.strikePhase === "none" && snakeCtl.state !== "defensive");

  // ---- The coach: the alarm, this trial's card, reading the snake ----
  // Same learning loop as the dog and spider realms (makeCreatureCoach).
  const snRung = Math.max(0, Math.min(4, levelIdx || 0));
  const SN_COACH = [
    { sizeMul: 0.46, tau: 11, hFloor: 0.30 },
    { sizeMul: 0.56, tau: 12, hFloor: 0.32 },
    { sizeMul: 0.68, tau: 14, hFloor: 0.34 },
    { sizeMul: 0.80, tau: 16, hFloor: 0.36 },
    { sizeMul: 0.90, tau: 18, hFloor: 0.38 },
  ][snRung];
  const snZone = B.inZoneDist ?? 3.2;
  const snZoneTxt = snZone.toFixed(1).replace(/\.0$/, "");
  const snSkill = [
    { id: "near",      icon: "→", text: window.tf("dc.sn.gNear", "Get within {m} m of the snake", { m: snZoneTxt }) },
    { id: "stillMove", icon: "🧍", text: window.t("dc.sn.gStill", "Stay put while it slides") },
    { id: "crossHeld", icon: "〰", text: window.t("dc.sn.gCross", "Stay on the path while it crosses") },
    { id: "rearHeld",  icon: "⬆️", text: window.t("dc.sn.gRear", "Stay close while it rears and watches") },
    { id: "slowHeld",  icon: "🐢", text: window.t("dc.sn.gSlow", "Stay close — slowly, so it settles") },
  ][snRung];
  const snCoach = makeCreatureCoach({
    kit: creatureKit("snakes"),
    stage: document.getElementById("stage"),
    levelIdx, intensity, dogName: window.t("coach.sn.name", "the snake"), title: window.t("creature.snake", "Grass snake"),
    inZoneDist: snZone, sizeMul: SN_COACH.sizeMul, tau: SN_COACH.tau, hFloor: SN_COACH.hFloor,
    minHold: level.minHold || 12,
    coarse: IS_COARSE_POINTER,
    expect: (() => { const e = window.__pendingExpect; return (e && e.phobia === "snakes" && e.level === levelIdx) ? e : null; })(),
    goals: [
      snSkill,
      { id: "read", icon: "👁", need: snRung < 2 ? 2 : 3, text: window.t("dc.sn.gRead", "Read the snake's body language") },
      { id: "settle", icon: "〰", required: true, text: window.t("dc.gSettle", "Stay until your alarm settles") },
    ],
  });
  snCoach.setFoot(window.t("mood." + (temper.label || temper.id), "seems " + (temper.label || temper.id) + " today"));
  window.__coach = snCoach;
  let snLastDist = 99;
  if (window.PhobiaFear && window.PhobiaFear.setDirect) {
    window.PhobiaFear.setDirect(() => snCoach.target(), (s) => snCoach.pulse(s, "event", snLastDist));
  }
  window.__holdPolicy = snCoach.holdPolicy;
  let snOnScreen = false;
  function snSignal(id) {
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return false;
    return snCoach.signal(id, { onScreen: snOnScreen, dist: snLastDist });
  }
  function snPulse(strength, kind) { snCoach.pulse(strength, kind, snLastDist); }
  let snToward = 0, snPrevSX = null, snPrevSZ = 0, snPlayerSpeed = 0, snPrevPX = null, snPrevPZ = 0;
  let snStillMoveT = 0, snCrossT = 0, snRearT = 0, snSlowT = 0, snCrossNear = false, snTonguePrev = -1, snBaskT = 0, snGlideT = 0;
  const _snV = new THREE.Vector3();

  function snakeClampToBounds(p) {
    p.x = Math.max(SNAKE_BOUNDS.minX, Math.min(SNAKE_BOUNDS.maxX, p.x));
    p.z = Math.max(SNAKE_BOUNDS.minZ, Math.min(SNAKE_BOUNDS.maxZ, p.z));
    return p;
  }
  // Set pieces are noCollide for the player's sake, but the snake has to go
  // AROUND them: wander and crossing targets used to be picked with no test,
  // so it slid straight through the log and could stop inside the bush.
  function snakePathClear(x0, z0, x1, z1) {
    const sg = logSeg();
    for (let k = 1; k <= 10; k++) {
      const x = x0 + (x1 - x0) * k / 10, z = z0 + (z1 - z0) * k / 10;
      if (segDist(x, z, sg) < LOG_R + 0.3) return false;
      for (const [bx, , bz] of BUSHES) if (Math.hypot(x - bx, z - bz) < 1.0) return false;
    }
    return true;
  }
  function snakePickWanderTarget(controls) {
    for (let tries = 0; tries < 10; tries++) {
      const t = snakePickWanderTarget1(controls);
      if (snakePathClear(snake.position.x, snake.position.z, t.x, t.z)) return t;
    }
    snakeCtl.crossing = false;
    return snakeClampToBounds({ x: snakeHomeX, z: baseSnakeZ });
  }
  function snakePickWanderTarget1(controls) {
    // Higher rungs sometimes cross the open path 2–4 m ahead of the player —
    // the classic "it moved!" beat — otherwise roam near home turf.
    const forced = !!snakeCtl._forceCross; snakeCtl._forceCross = false;
    if (B.cross && controls && (forced || Math.random() < (B.crossChance ?? 0.45))) {
      const aheadZ = Math.max(SNAKE_BOUNDS.minZ + 0.4,
        Math.min(1.0, controls.position.z - (2.2 + Math.random() * 2.0)));
      const side = snake.position.x >= 0 ? -1 : 1;
      snakeCtl.crossing = true;
      return snakeClampToBounds({ x: side * (2.0 + Math.random() * 1.2), z: aheadZ });
    }
    snakeCtl.crossing = false;
    // Within the rung's home patch (homeRadius — "shifts in its patch" on
    // rung 2, and each temperament's roamMul): it was a fixed 5 × 4 m box.
    let t;
    if (B.homeRadius != null) {
      const a = Math.random() * Math.PI * 2, r = B.homeRadius * Math.sqrt(Math.random());
      t = snakeClampToBounds({ x: snakeHomeX + Math.cos(a) * r, z: baseSnakeZ + Math.sin(a) * r });
    } else {
      t = snakeClampToBounds({ x: (Math.random() - 0.5) * 5.0, z: baseSnakeZ + (Math.random() - 0.5) * 4.0 });
    }
    // Never pick a destination on top of the player.
    if (controls) {
      const dx = t.x - controls.position.x, dz = t.z - controls.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.8) { t.z = Math.max(SNAKE_BOUNDS.minZ, controls.position.z - 2.5); }
    }
    return t;
  }
  function snakeEnter(state, controls) {
    snakeCtl.state = state;
    snakeCtl.stateT = 0;
    const sp = snake.userData.parts;
    const hasRig = sp && sp.mixer && sp.play;
    if (state === "bask") {
      { const bd = B.baskDur || (size >= 0.6 ? [2.0, 6.0] : [3.5, 9.5]); snakeCtl.baskDur = bd[0] + Math.random() * (bd[1] - bd[0]); }
      snakeCtl.target = null;
      snakeCtl.scanTarget = 0; snakeCtl.scanNext = 3 + Math.random() * 5;   // idle head-scan cadence (stateT-relative)
      snBaskT = 0;
      if (hasRig) sp.play("Idle", 0.5);
    } else if (state === "wander") {
      snakeCtl.target = snakePickWanderTarget(controls);
      if (hasRig) sp.play("Walk", 0.4);
      // The sudden onset of motion is itself a (small) startle when close.
      snCrossNear = false; snCrossT = 0;
      if (snakeCtl.crossing && controls) {
        const d = Math.hypot(snake.position.x - controls.position.x, snake.position.z - controls.position.z);
        if (d < 6) snPulse(0.24, "cross");
        snSignal("glide");
      }
    } else if (state === "watch") {
      snakeCtl.target = null;
      if (hasRig) sp.play("Idle", 0.35);
      // Noticing you: a real rear-up (rungs 4–5, within rearDist) is the
      // defensive display that habituates; further out it's a look; on the
      // gentle rungs it's the fast, facing tongue flicks — curiosity.
      const pd = controls ? Math.hypot(snake.position.x - controls.position.x, snake.position.z - controls.position.z) : 99;
      if (B.rear && pd < (B.rearDist ?? 2.6)) { snPulse(0.3, "rear"); snCoach.note("rear"); snSignal("rear"); }
      else if (B.rear) snSignal("lookUp");
      else snSignal("sniff");
    } else if (state === "retreat") {
      let tgt;
      if (controls) {
        const dx = snake.position.x - controls.position.x;
        const dz = snake.position.z - controls.position.z;
        const d = Math.hypot(dx, dz) || 1;
        tgt = snakeClampToBounds({
          x: snake.position.x + (dx / d) * 2.6,
          z: snake.position.z + (dz / d) * 2.6,
        });
      } else {
        tgt = snakeClampToBounds({ x: snake.position.x, z: snake.position.z - 2.5 });
      }
      // Cornered: the clamped flee target is basically where we already stand —
      // nowhere left to go. Settle into bask with a short cooldown instead of
      // flip-flopping retreat<->bask every frame (Walk/Idle crossfade thrash).
      if (Math.hypot(tgt.x - snake.position.x, tgt.z - snake.position.z) < 0.5) {
        snakeCtl._retreatCooldown = 2.5;
        return snakeEnter("bask", controls);
      }
      snakeCtl.target = tgt;
      if (hasRig) sp.play("Walk", 0.3);
      snCoach.note("leave");
      snSignal("leave");
    } else if (state === "defensive") {
      // Strike TELEGRAPH onset — reared, jaw parting, a warning hiss. The Attack
      // clip is reserved for the actual lunge (fired in the 'lunge' phase); this
      // is the window the player can still back away from.
      snakeCtl.target = null;
      snakeCtl.strikePhase = "telegraph"; snakeCtl.strikeT = 0; snakeCtl.striking = true; snakeCtl.jawTarget = 0.3;
      if (hasRig) sp.play("Idle", 0.15);
      const hp = new THREE.Vector3();
      headAnchor.getWorldPosition(hp);
      if (window.PhobiaAudio) { if (window.PhobiaAudio.snakeHiss) window.PhobiaAudio.snakeHiss(hp, { intensity: 1.0 }); else if (window.PhobiaAudio.hissOnce) window.PhobiaAudio.hissOnce(hp, 1.0); }
      if (snakeCtl.ctrl) snakeCtl.ctrl.requestTongueFlick(true);
      snPulse(0.42, "telegraph");
      snSignal("sCoil");
      if (!snakeCtl.defensiveSpoken && window.PhobiaVoice) {
        snakeCtl.defensiveSpoken = true;
        window.PhobiaVoice.speak(window.t("sc.n.warning", "It's warning you. Ease back, slow down — slow movement reads as safety."));
      }
      snakeCtl.defenseCooldown = B.strikeCooldown ?? 14;
    }
  }
  // Per-frame brain + root motion. `sniffing` comes from the extend-hand
  // mechanic below — while the snake is investigating the hand it is engaged,
  // so it neither retreats nor wanders off.
  function snakeUpdate(t, dtN, controls, sniffing) {
    const sp = snake.userData.parts;
    const hasRig = sp && sp.mixer && sp.play;
    snakeCtl.stateT += dtN;
    snakeCtl.defenseCooldown = Math.max(0, snakeCtl.defenseCooldown - dtN);
    // The warn-hiss parts the jaw (jawTarget→0.4) while watching; clear it once
    // the snake is no longer alert or striking, so a snake that settled back to
    // basking/wandering doesn't sit with its mouth stuck open (breaks the "it
    // settled, it's calm now" evidence). 'watch' keeps the parted jaw; the strike
    // phases own it while striking.
    if (snakeCtl.strikePhase === "none" && snakeCtl.state !== "watch") snakeCtl.jawTarget = 0;

    // Player kinematics — RADIAL approach speed (m/s closing on the snake),
    // not raw walk speed: max walk speed is only 1.2 m/s here, so "rushing"
    // means closing nearly flat-out, while cautious step-pause-step approaches
    // average well under the threshold.
    let playerDist = Infinity;
    if (controls) {
      playerDist = Math.hypot(controls.position.x - snake.position.x, controls.position.z - snake.position.z);
      // approachSpeed = the PLAYER's own velocity projected toward the snake.
      // The old distance-derivative also counted the snake's motion, so a
      // crossing/retreating snake faked a "rush" (or masked a real one) even
      // when the player stood still — contradicting "slow reads as safe".
      if (prevPlayerPos && dtN > 0) {
        let tsx = snake.position.x - controls.position.x, tsz = snake.position.z - controls.position.z;
        const tsl = Math.hypot(tsx, tsz) || 1;
        const pvx = (controls.position.x - prevPlayerPos.x) / dtN;
        const pvz = (controls.position.z - prevPlayerPos.z) / dtN;
        const inst = (pvx * tsx + pvz * tsz) / tsl;   // + = player moving toward the snake
        approachSpeed += (inst - approachSpeed) * Math.min(1, dtN * 6);
      }
      if (!prevPlayerPos) prevPlayerPos = { x: 0, z: 0 };
      prevPlayerPos.x = controls.position.x; prevPlayerPos.z = controls.position.z;
      prevPlayerDist = playerDist;
    }

    // --- Strike trigger (APEX rung only): RUSHING into its space ---
    // Rushing provokes the coil-and-strike display; staying calm defuses it
    // (the stillness→retreat inversion below). This is the ophidiophobia lesson.
    if (B.strike && snakeCtl.state !== "defensive" && snakeCtl.defenseCooldown <= 0
        && !completionBeatDone
        && controls && playerDist < (B.strikeDist ?? 1.45) && approachSpeed > (B.strikeApproach ?? 0.9)) {
      // No instant snap, no glide. A retreating snake (0.85 m/s, facing away)
      // used to flip 180° in one frame and then coast ~0.23 m TOWARD you on
      // the Idle pose through the warning — shrinking the very room you had
      // to cancel it in. It stops dead, and turns to you during the telegraph.
      snakeCtl.speed = 0;
      snakeEnter("defensive", controls);
    }

    // --- State transitions (per-rung distances) ---
    if (snakeCtl._retreatCooldown > 0) snakeCtl._retreatCooldown -= dtN;   // post-corner settle window
    if (snakeCtl._ignoreT > 0) snakeCtl._ignoreT -= dtN;                   // lost interest: only a close pass re-alerts it
    const watchAt = snakeCtl._ignoreT > 0 ? 1.6 : (B.watchDist ?? 3.2);
    if (snakeCtl.state === "bask") {
      if (controls && playerDist < watchAt) snakeEnter("watch", controls);
      else if (stillness > (B.retreatStill ?? 0.3) && controls && playerDist < 5 && !(snakeCtl._retreatCooldown > 0)) snakeEnter("retreat", controls);
      else if (!B.still && snakeCtl.stateT > snakeCtl.baskDur) snakeEnter("wander", controls);
    } else if (snakeCtl.state === "wander") {
      if (controls && playerDist < (snakeCtl.crossing ? 1.6 : Math.min(watchAt, B.watchDist ?? 2.6))) snakeEnter("watch", controls);
      else if (snakeCtl.target) {
        const d = Math.hypot(snakeCtl.target.x - snake.position.x, snakeCtl.target.z - snake.position.z);
        if (d < 0.35 || snakeCtl.stateT > 18) snakeEnter("bask", controls);
      }
    } else if (snakeCtl.state === "watch") {
      if (sniffing) {
        // Engaged with the offered hand — hold position, stay reared.
      } else if (stillness > (B.retreatStill ?? 0.3) && !(snakeCtl._retreatCooldown > 0)) snakeEnter("retreat", controls);
      else if (!controls || playerDist > (B.watchDist != null ? B.watchDist + 1 : 4.2)) snakeEnter("bask", controls);
      else if (snakeCtl.strikePhase === "none" && snakeCtl.stateT > (snakeCtl._watchFor || (snakeCtl._watchFor = 7 + Math.random() * 5))) {
        // It doesn't watch you forever. Having decided you're not a problem,
        // it goes about its day — across the path on the crossing rungs —
        // and only a close pass catches its attention again for a while.
        snakeCtl._watchFor = 0;
        snakeCtl._ignoreT = 6 + Math.random() * 4;
        if (B.wander) { snakeCtl._forceCross = !!B.cross; snakeEnter("wander", controls); }
        else snakeEnter("bask", controls);
      }
    } else if (snakeCtl.state === "retreat") {
      const d = snakeCtl.target
        ? Math.hypot(snakeCtl.target.x - snake.position.x, snakeCtl.target.z - snake.position.z)
        : 0;
      if (d < 0.35 || snakeCtl.stateT > 8) snakeEnter("bask", controls);
    } else if (snakeCtl.state === "defensive") {
      // --- The strike: telegraph → lunge → recoil (Package B moves the head) ---
      const TELE_DUR = 0.55, LUNGE_DUR = 0.30;
      snakeCtl.strikeT += dtN;
      if (snakeCtl.strikePhase === "telegraph") {
        snakeCtl.striking = true; snakeCtl.jawTarget = 0.3;
        // Draw round to face you — fast (a snake can whip its forebody round),
        // but through the warning, not in a frame.
        if (controls) {
          let dh = Math.atan2(controls.position.x - snake.position.x, controls.position.z - snake.position.z) - snakeCtl.heading;
          dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          snakeCtl.heading += Math.max(-6 * dtN, Math.min(6 * dtN, dh));
        }
        // RETREAT CANCELS — the disconfirming window (mirror the spider coil-cancel).
        if (playerDist > 1.9 || approachSpeed < -0.2) {
          snakeCtl.strikePhase = "recoil"; snakeCtl.strikeT = 0; snakeCtl.jawTarget = 0;
          snakeCtl._lungeFrom = null;   // no lunge happened — nothing to snap back from
          if (!retreatPraised && window.PhobiaVoice) { retreatPraised = true; window.PhobiaVoice.speak(window.t("sc.n.backedOff", "You backed off, and it stood down. Slow reads as safe.")); }
        } else if (snakeCtl.strikeT > TELE_DUR) {
          snakeCtl.strikePhase = "lunge"; snakeCtl.strikeT = 0; snakeCtl.jawTarget = 1.0; snakeCtl.strikeFired = false;
          snakeCtl._lungeFrom = { x: snake.position.x, z: snake.position.z };
          snakeCtl._lungeDir = { x: Math.sin(snakeCtl.heading), z: Math.cos(snakeCtl.heading) };
          snakeCtl._lungeTravel = 0;
          const sp2 = snake.userData.parts; if (sp2 && sp2.play) sp2.play("Attack", 0.05, { once: true, timeScale: 1.3 });
          headAnchor.getWorldPosition(_snkV1);
          if (window.PhobiaAudio) { if (window.PhobiaAudio.snakeStrike) window.PhobiaAudio.snakeStrike(_snkV1); else if (window.PhobiaAudio.hissOnce) window.PhobiaAudio.hissOnce(_snkV1, 1.0); }
          snPulse(0.7, "strike");
          snCoach.note("strike");
          // The strike hits the BODY too: whole-body flinch + the caught
          // breath. kickShake below is FP-only; this reaches third person.
          try {
            if (window.PhobiaFX && window.PhobiaFX.bodyStartle) window.PhobiaFX.bodyStartle(0.85);
            if (window.PhobiaAudio && window.PhobiaAudio.breathCatch) window.PhobiaAudio.breathCatch(0.85);
          } catch {}
          arousalFloor = Math.max(arousalFloor, 0.8);
        }
      } else if (snakeCtl.strikePhase === "lunge") {
        // A strike is ballistic: along the heading it was aimed on at release
        // (it used to chase your LIVE position while the body kept the old
        // heading — a sideways skid if you stepped aside), with a short root
        // run, and the SNOUT stops STRIKE_STOP short of you. The old clamp was
        // a 3D 0.7 m lens floor on the Head bone — the back of the skull, which
        // never came within 0.78 m of the eye on any rung — so it never fired,
        // and the root's 0.96 m run carried the snout past where you stood,
        // shoving you back, under the line "Nothing reached you".
        const ld = snakeCtl._lungeDir || { x: Math.sin(snakeCtl.heading), z: Math.cos(snakeCtl.heading) };
        const room = Math.max(0, STRIKE_ROOT_RUN - (snakeCtl._lungeTravel || 0));
        const step = Math.min(room, 3.2 * dtN);
        snake.position.x += ld.x * step; snake.position.z += ld.z * step;
        snakeCtl._lungeTravel = (snakeCtl._lungeTravel || 0) + step;
        const sp3 = snake.userData.parts;
        if (controls && sp3 && sp3.headBone) {
          sp3.headBone.getWorldPosition(_snkHead);
          // (the snout stop itself runs after the pose update — strikeSnoutStop)
          if (!snakeCtl.strikeFired) {
            snakeCtl.strikeFired = true;
            if (controls.kickShake) controls.kickShake(0.06);
            if (controls.snapLookAt) controls.snapLookAt(_snkHead.x, _snkHead.y, _snkHead.z, 0.7);
          }
        }
        if (snakeCtl.strikeT > LUNGE_DUR) { snakeCtl.strikePhase = "recoil"; snakeCtl.strikeT = 0; snakeCtl.jawTarget = 0; snakeCtl.strikeFired = false;
          if (!holdPraised && window.PhobiaVoice) { holdPraised = true; window.PhobiaVoice.speak(window.t("sc.n.struck", "It struck, and stopped. Nothing reached you. That is the fear, not the danger."), { audible: true, praise: true }); }
        }
      } else { // recoil
        snakeCtl.striking = false; snakeCtl.jawTarget = 0;
        // The snap-back: a strike recoils to the coil FASTER than it extended
        // (pull the root home at ~d*9 vs the 3.2 m/s advance) — without it the
        // snake froze at full extension and the strike read as a shove.
        if (snakeCtl._lungeFrom) {
          const kk = Math.min(1, dtN * 9);
          snake.position.x += (snakeCtl._lungeFrom.x - snake.position.x) * kk;
          snake.position.z += (snakeCtl._lungeFrom.z - snake.position.z) * kk;
        }
        // Gate on the PHASE timer (reset to 0 on recoil entry), not stateT —
        // stateT already ≈0.85 (telegraph+lunge) here, so the old `stateT>0.72`
        // fired on the first recoil frame and the pull-back pose was skipped.
        if (snakeCtl.strikeT > 0.35) { snakeCtl.strikePhase = "none"; snakeCtl._lungeFrom = null; snakeEnter("retreat", controls); }
      }
    }

    // --- Warning hiss when looming over it (throttled, per-rung) ---
    if ((snakeCtl.state === "watch") && (B.warnHissDist != null) && controls && playerDist < B.warnHissDist
        && !sniffing && (t - snakeCtl.lastWarnHiss) > (B.warnHissEvery ?? 9)) {
      snakeCtl.lastWarnHiss = t;
      headAnchor.getWorldPosition(_snkV1);
      if (window.PhobiaAudio) { if (window.PhobiaAudio.snakeHiss) window.PhobiaAudio.snakeHiss(_snkV1, { intensity: 0.55 }); else if (window.PhobiaAudio.hissOnce) window.PhobiaAudio.hissOnce(_snkV1, 0.55); }
      snakeCtl.jawTarget = Math.max(snakeCtl.jawTarget, 0.14);   // a grass snake hisses nearly closed-mouthed
      snPulse(0.22, "hiss");
    }

    // --- Steering + root motion ---
    const moving = snakeCtl.state === "wander" || snakeCtl.state === "retreat";
    let desiredSpeed = 0;
    if (moving && snakeCtl.target) {
      const dx = snakeCtl.target.x - snake.position.x;
      const dz = snakeCtl.target.z - snake.position.z;
      const dist = Math.hypot(dx, dz);
      let desiredHeading = Math.atan2(dx, dz);
      // Serpentine weave on top of the base heading — the path itself curves.
      desiredHeading += Math.sin(t * 2.4) * 0.18;
      let dh = desiredHeading - snakeCtl.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      const turnRate = snakeCtl.state === "retreat" ? 2.6 : 1.6;
      snakeCtl.heading += Math.max(-turnRate * dtN, Math.min(turnRate * dtN, dh));
      desiredSpeed = (snakeCtl.state === "retreat" ? 0.85 : (B.wanderSpeed ?? (0.45 + size * 0.25)));
      desiredSpeed *= Math.min(1, dist / 0.8);            // ease in on arrival
      desiredSpeed *= Math.max(0.25, 1 - Math.abs(dh) / Math.PI); // slow in tight turns
      // Never slither into the camera: full stop just outside personal space.
      if (controls && playerDist < 1.1) desiredSpeed = 0;
    } else if (snakeCtl.state === "watch" && controls) {
      // Rotate the reared body toward the player — slowly; menace is patient.
      const desired = Math.atan2(controls.position.x - snake.position.x, controls.position.z - snake.position.z);
      let dh = desired - snakeCtl.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      snakeCtl.heading += Math.max(-0.9 * dtN, Math.min(0.9 * dtN, dh));
    } else if (snakeCtl.state === "bask" && leaf) {
      // A landing leaf draws a lazy orientation — alive, attentive, harmless.
      const desired = Math.atan2(leaf.position.x - snake.position.x, leaf.position.z - snake.position.z);
      let dh = desired - snakeCtl.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      snakeCtl.heading += Math.max(-0.5 * dtN, Math.min(0.5 * dtN, dh));
    }
    snakeCtl.speed += (desiredSpeed - snakeCtl.speed) * Math.min(1, dtN * 3);
    if (snakeCtl.speed > 0.005) {
      snake.position.x += Math.sin(snakeCtl.heading) * snakeCtl.speed * dtN;
      snake.position.z += Math.cos(snakeCtl.heading) * snakeCtl.speed * dtN;
      snakeClampToBounds(snake.position);
    }
    snake.rotation.y = snakeCtl.heading;

    // Walk clip rate follows actual ground speed so the body's undulation and
    // the root motion agree — no ice-skating.
    if (hasRig && moving && sp.current) {
      sp.current.timeScale = Math.max(0.55, Math.min(2.2, (snakeCtl.speed || 0.001) / SNAKE_REF_SPEED));
    }

    // --- Head anchor follows the actual head bone (the hand-sniff target) ---
    if (sp && sp.headBone) {
      sp.headBone.getWorldPosition(_snkV1);
      headAnchor.position.copy(snake.worldToLocal(_snkV1));
    }

    // --- Procedural "alive" layer (owns the SOLE mixer.update) ---
    // Set per-frame flags from the behaviour state, then advance the controller
    // (which does mixer.update then applies body slither / tongue / jaw / rear).
    const st = snakeCtl.state;
    const slAmp = (st === "wander" || st === "retreat" || st === "defensive" || snakeCtl.striking) ? 1.0 : 0.35;
    snakeCtl.ctrl.setSlither(slAmp * Math.min(1, 0.5 + size * 0.6));
    snakeCtl.ctrl._slitherSpeed = Math.min(1, snakeCtl.speed / SNAKE_REF_SPEED);
    let rearAmt = (st === "watch" || st === "defensive" || snakeCtl.striking) ? (0.6 + 0.4 * size) : (sniffing ? 0.5 : 0);
    // Watching from out past rearDist is a low, alert posture; it lifts fully
    // only when you come within rearDist (the key was never read, so rungs 4–5
    // reared at watchDist, 3.4 / 3.6 m, instead of 2.6 / 3.0 m).
    if (st === "watch" && B.rearDist != null && playerDist > B.rearDist && !sniffing) rearAmt *= 0.35;
    // Strike recoil visibly RE-COILS: the rear collapses 0.9→0.4 across the
    // beat, so the forebody gathers back before the retreat slither.
    if (snakeCtl.strikePhase === "recoil") rearAmt = 0.9 - 0.5 * Math.min(1, snakeCtl.strikeT / 0.35);
    snakeCtl.ctrl.setRear(B.rear === false ? Math.min(rearAmt, sniffing ? 0.5 : 0) : rearAmt);
    // The basking rock stands 9 cm proud of the grass — ride the belly up onto
    // the slab near its centre and ease back off while wandering (fed into the
    // controller's single absolute y-write, never a second y path).
    { const rockD = Math.hypot(snake.position.x - rock.position.x, snake.position.z - rock.position.z);
      // The slab's top is 0.10 m above the grass (y −0.99 + 0.18/2), flat
      // out to r 1.4 and meeting the grass at ~1.5. The lift was 0.09 and full
      // only inside r 1.1, so a coiled snake near the rim sat 3–5 cm INTO the
      // stone (measured). The root is one point on a coil ~1 m across, so the
      // ramp still eases over the rim rather than stepping at it.
      snakeCtl.ctrl.surfY = rockD < 1.55 ? 0.10 * clamp01((1.55 - rockD) / 0.35) : 0; }
    snakeCtl.ctrl.setJaw(snakeCtl.jawTarget || 0);
    snakeCtl.ctrl._tongueFast = sniffing || st === "watch" || snakeCtl.striking;
    if (hasRig) snakeCtl.ctrl.update(t, dtN);
    // Pick the snout-tip vertex in the IDLE pose, before any strike: picked on
    // the first lunge frame, the Attack clip had already pitched the head and
    // "most forward" landed on a vertex 8–12 cm behind the real tip.
    if (_snoutIdx === null && hasRig && snakeCtl.strikePhase === "none" && snake.userData.ready) { snake.updateMatrixWorld(true); snoutTip(_snkV1); }
    strikeSnoutStop(controls);
    // Observability for scene-verification hooks (mirrors spiderDebug).
    snake.userData.snakeDebug = {
      state: snakeCtl.state, strikePhase: snakeCtl.strikePhase, snoutAlong: snakeCtl._snoutAlong,
      snoutIdx: _snoutIdx ? _snoutIdx.i : null,
      speed: +snakeCtl.speed.toFixed(2), playerDist: +(playerDist || 0).toFixed(2),
      approachSpeed: +(approachSpeed || 0).toFixed(2),
    };
    // Creature readout — strike phrases may override the dwell (a telegraph
    // must never wait 0.9 s behind "it noticed you").
    snHudDwell -= dtN;
    if (snHudEl) {
      const ph = snakePhrase();
      const urgent = snakeCtl.strikePhase !== "none";
      if (ph !== snHudPhrase && (snHudDwell <= 0 || urgent)) {
        snHudPhrase = ph; snHudDwell = 0.9;
        const m = snHudEl.querySelector(".trust-mood");
        if (m) m.textContent = ph;
      }
    }

    // --- Head tracking while watching (composes on the rear pitch) ---
    // The smoothed yaw+pitch are handed to the controller, which applies them
    // INSIDE its additive-layer safety net — the direct bone += here compounded
    // on flat keyframe spans exactly like the dog's old vibration bug.
    const trackWeight = (snakeCtl.state === "watch" || snakeCtl.state === "defensive") ? 1 : 0;
    if (hasRig && trackWeight > 0 && controls && sp.neckBone) {
      const worldYaw = Math.atan2(controls.position.x - snake.position.x, controls.position.z - snake.position.z);
      let rel = worldYaw - snake.rotation.y;
      rel = Math.atan2(Math.sin(rel), Math.cos(rel));
      const clamped = Math.max(-0.55, Math.min(0.55, rel)) * trackWeight;
      snakeCtl.headYaw += (clamped - snakeCtl.headYaw) * Math.min(1, dtN * 4);
      // Pitch too: the reared head meets the player's FACE — up when loomed
      // over at close range, level when they back off (yaw-only tracking left
      // it staring at shins).
      let headY = snake.position.y + 0.3;
      if (sp.headBone) { sp.headBone.getWorldPosition(_snkV1); headY = _snkV1.y; }
      const relPitch = Math.max(-0.5, Math.min(0.6, Math.atan2(controls.position.y - headY, Math.max(0.3, playerDist))));
      snakeCtl.headPitch += (relPitch * trackWeight - snakeCtl.headPitch) * Math.min(1, dtN * 4);
      snakeCtl.ctrl.headYaw = snakeCtl.headYaw;
      snakeCtl.ctrl.headPitch = snakeCtl.headPitch;
    } else if (hasRig) {
      // Idle scan — a basking snake periodically sweeps its head to a new
      // bearing and tongue-tastes the air, so the distant snake reads alive
      // long before the watch-distance tracking kicks in.
      if (snakeCtl.state === "bask" && snakeCtl.stateT > snakeCtl.scanNext) {
        snakeCtl.scanTarget = (Math.random() - 0.5) * 0.9;
        snakeCtl.scanNext = snakeCtl.stateT + 5 + Math.random() * 7;
        snakeCtl.ctrl.requestTongueFlick(false);   // look, then taste
      }
      const scanTo = snakeCtl.state === "bask" ? snakeCtl.scanTarget : 0;
      snakeCtl.headYaw += (scanTo - snakeCtl.headYaw) * Math.min(1, dtN * 1.2);
      snakeCtl.headPitch += (0 - snakeCtl.headPitch) * Math.min(1, dtN * 2);
      snakeCtl.ctrl.headYaw = snakeCtl.headYaw;
      snakeCtl.ctrl.headPitch = snakeCtl.headPitch;
    }

    // --- Threat beacon (avatar gaze fixation) ---
    // Live only through the telegraph + lunge; recoil is the stand-down. ONE
    // module-scope object mutated in place — no per-frame allocation.
    const reared = snakeCtl.state === "watch" && B.rear && playerDist < (B.rearDist ?? 2.6);
    if ((snakeCtl.state === "defensive" && snakeCtl.strikePhase !== "recoil") || reared) {
      headAnchor.getWorldPosition(_snkV1);
      _snakeThreatPos.x = _snkV1.x; _snakeThreatPos.y = _snkV1.y; _snakeThreatPos.z = _snkV1.z;
      window.PhobiaThreat = _snakeThreatPos;
    } else if (window.PhobiaThreat === _snakeThreatPos) {
      window.PhobiaThreat = null;
    }

    // --- Slither rustle tracks the moving body ---
    const _slFn = window.PhobiaAudio && (window.PhobiaAudio.startSnakeSlither || window.PhobiaAudio.startSlither);
    if (_slFn) {
      if (!slitherSound && snakeCtl.speed > 0.05) { slitherSound = _slFn(); liveAudio.push(slitherSound); }
      if (slitherSound) {
        slitherSound.set(
          { x: snake.position.x, y: snake.position.y + 0.1, z: snake.position.z },
          Math.min(1, snakeCtl.speed / 0.9)
        );
      }
    }
  }

  // ----- Extend hand (real human action with a calm snake) -----
  // The user can press-and-hold to slowly extend a hand toward the snake.
  // While the hand is close to the snake's head, the snake's tongue flicks
  // faster (sniffing — this is real snake behaviour) and after a few seconds
  // a "calm meeting" trust meter fills. Releasing the button retracts the
  // hand. The user has full agency.
  let extendHeld = false;
  let extension = 0;         // 0 = retracted near camera, 1 = fully extended
  let extensionTarget = 0;
  let sniffT = 0;            // builds while the hand is near the snake's head
  let sniffMet = false;      // becomes true once sniffT reaches threshold
  let _lastSniffFlick = 0;   // throttles the sniff tongue-flick request
  // Visible procedural hand pinned to the camera. We add it as a child of
  // camera so it follows look direction; extension drives a forward offset.
  const handGroup = new THREE.Group();
  handGroup.position.set(0.10, -0.18, -0.30);
  camera.add(handGroup);
  if (!scene.children.includes(camera)) scene.add(camera);
  const sHandSkin = (window.Character && window.Character.loadCharacter())
              ? window.Character.hexToInt(window.Character.skinHex(window.Character.loadCharacter()))
              : 0xe8b794;
  const sHandMat = new THREE.MeshStandardMaterial({ color: sHandSkin, roughness: 0.62, envMapIntensity: 0.5 });
  const sShirt = (() => { try { const ch = window.Character.loadCharacter(); return window.Character.hexToInt(window.Character.topHex(ch)); } catch { return 0x2c9d96; } })();
  const sleeveMat = new THREE.MeshStandardMaterial({ color: sShirt, roughness: 0.9 });
  // The SAME hand the Hands rig and the third-person body use (buildHand):
  // this scene used to draw a white mitten of spheres and capsules on a brown
  // cuff — nobody's hand. Back of the hand up, fingers forward, as you'd
  // offer it to be smelled.
  const sHandObj = buildHand(1, sHandMat, sleeveMat, { scale: 0.8, forearm: true, forearmMat: sHandMat });
  const sHolder = new THREE.Group();
  sHolder.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 1).normalize(), Math.PI);
  sHolder.add(sHandObj);
  sHolder.rotation.z += -0.18;
  handGroup.add(sHolder);
  try { if (sHandObj.userData.setCurl) sHandObj.userData.setCurl(0.0, 0.12); } catch {}
  // Palm marker for the sniff distance check (palm centre, hand-local).
  const sPalm = new THREE.Object3D();
  sPalm.position.set(0, -0.03, 0);
  sHandObj.add(sPalm);

  function wireSnakesCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="snakes"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    const stillBtn = bar.querySelector('[data-cmd="still"]');
    if (stillBtn) {
      const press = (e) => { e.stopPropagation(); stillHeld = true; stillBtn.classList.add("pressed"); };
      const release = () => { stillHeld = false; stillBtn.classList.remove("pressed"); };
      stillBtn.addEventListener("pointerdown", press);
      stillBtn.addEventListener("pointerup", release);
      stillBtn.addEventListener("pointerleave", release);
      stillBtn.addEventListener("pointercancel", release);
    }
    const extendBtn = bar.querySelector('[data-cmd="extend"]');
    if (extendBtn) {
      const press = (e) => {
        e.stopPropagation();
        extendHeld = true;
        extensionTarget = 1;
        extendBtn.classList.add("pressed");
      };
      const release = () => {
        extendHeld = false;
        extensionTarget = 0;
        extendBtn.classList.remove("pressed");
      };
      extendBtn.addEventListener("pointerdown", press);
      extendBtn.addEventListener("pointerup", release);
      extendBtn.addEventListener("pointerleave", release);
      extendBtn.addEventListener("pointercancel", release);
    }
    const backBtn = bar.querySelector('[data-cmd="back-step"]');
    if (backBtn) backBtn.onclick = (e) => {
      e.stopPropagation();
      const c = snakesControls; if (!c) return;
      // A step AWAY from the snake (it went +1 m along world z, which on the
      // apex rung could be sideways or even toward a snake that had wandered
      // to your side), and the approach-speed tracker forgets the jump — the
      // 1 m teleport read as a rush and could set off the strike.
      const ax = c.position.x - snake.position.x, az = c.position.z - snake.position.z;
      const al = Math.hypot(ax, az) || 1;
      const b = c.opts.bounds || {};
      c.position.x = Math.max((b.minX ?? -Infinity) + 0.2, Math.min((b.maxX ?? Infinity) - 0.2, c.position.x + ax / al));
      c.position.z = Math.max((b.minZ ?? -Infinity) + 0.2, Math.min((b.maxZ ?? Infinity) - 0.2, c.position.z + az / al));
      prevPlayerPos = null; approachSpeed = 0;
      if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.n.back", "Stepped back. Notice your feet again."));
    };
    const leafBtn = bar.querySelector('[data-cmd="leaf"]');
    if (leafBtn) leafBtn.onclick = (e) => {
      e.stopPropagation();
      dropLeaf();
      if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.n.leaf", "A leaf. The snake watches. Movement, not threat."));
    };
  }
  // Falling leaf — when one lands the snake briefly turns to track it
  let leaf = null;
  function dropLeaf() {
    if (leaf) { scene.remove(leaf); leaf.geometry.dispose(); leaf.material.dispose(); leaf = null; }
    leaf = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x6e8a3a, roughness: 1.0, side: THREE.DoubleSide })
    );
    // Drop in front of the player (positive z is toward player)
    const c = snakesControls;
    if (c) {
      const ahead = 1.5;
      leaf.position.set(
        c.position.x - Math.sin(c.yaw) * ahead,
        2,
        c.position.z - Math.cos(c.yaw) * ahead
      );
    } else {
      leaf.position.set(0, 2, -2);
    }
    leaf.userData = { vy: -0.5, vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, spin: Math.random() * 6, settled: false };
    scene.add(leaf);
  }
  sceneTimers.push(setTimeout(wireSnakesCmds, 0));

  return {
    controls: {
      mode: "walkable",
      // Spawn back along the path so the snake is something to walk TOWARD,
      // not stand on top of. The path narrows visually toward the snake so
      // the eye reads "this is the way forward" without needing markers.
      initialPos: [0, 0.62, 4.0],
      initialYaw: 0,
      initialPitch: snakePitch * 0.4,
      bounds: { minX: -3, maxX: 3, minZ: -distance + 1.0, maxZ: 5 },
      speed: 1.2,
      lookSpeed: 0.0035,
      // Snake phobia is intimate — first-person locked (the hand-extend gesture
      // + DOM command bar rule out pointer lock / third-person). Fear-gait +
      // look-smoothing still apply; fear-gait's approach-slow reinforces the
      // scene's whole lesson: don't rush the snake.
      cameraModeLocked: "fp",
      lookSmoothing: 10,
      fearGait: true,
    },
    // NOTE: no generic `hands` here — this scene builds its own palm-up
    // `handGroup` (below) for the "extend hand" mechanic. Requesting the
    // generic first-person hands too would render a second forearm on top.
    bloom: { strength: 0.24, threshold: 0.95 },
    fearGradePass: true,
    cameraFar: 45,
    messageQueue: true,
    surface: "grass",   // outdoor path with grass + dirt
    groundY: -1,        // feet + eye line anchored to the path
    update(t, controls, dt) {
      if (controls) snakesControls = controls;
      // Small no-overlap collider around the coiled snake — you can still get
      // close enough to extend a hand, just can't walk through it.
      if (controls && controls.setObstacles) {
        controls.setObstacles([{ x: snake.position.x, z: snake.position.z, r: 0.35 }]);
      }
      const dtN = dt || 0.016;
      // ---- Feed the fear model (honest, non-inverted gaze) ----
      if (controls && window.PhobiaFear) {
        const SP = snake.position, CP = controls.position;
        const dxs = CP.x - SP.x, dzs = CP.z - SP.z;   // camera-minus-target: yaw==dirTo when FACING it (matches dog convention)
        const distS = Math.hypot(dxs, dzs);
        const closeness = clamp01(1 - (distS - 1.2) / 5.0);
        window.PhobiaFear.setInput("proximity", closeness * (B.fearMul ?? 0.80));
        // Gaze: facing the snake yields high gaze. The snake is LOW, so the
        // needed pitch is downward — but yaw-facing is required, so turning
        // away collapses gaze even while pitched down (the spider gaze fix).
        const dirTo = Math.atan2(dxs, dzs);
        const yawDelta = angleGap(controls.yaw, dirTo);
        const yawAlign = Math.max(0, 1 - yawDelta / 1.0);
        const needPitch = Math.atan2(SP.y - CP.y, Math.max(0.2, distS));
        const pitchAlign = Math.max(0, 1 - Math.abs(controls.pitch - needPitch) / 0.7);
        const gazeAlign = yawAlign * (0.5 + 0.5 * pitchAlign);
        window.PhobiaFear.setInput("gaze", gazeAlign * (B.fearMul ?? 0.80) * 0.85);
        // Duration: sustained engagement + a post-strike arousal floor.
        const engaged = distS < (B.inZoneDist ?? 3.2) || snakeCtl.sniffing || snakeCtl.state === "watch" || (intensity === "apex" && yawAlign > 0.35);
        engageDur = Math.max(0, Math.min(24, engageDur + (engaged ? dtN : -dtN * 0.35)));
        arousalFloor = Math.max(0, arousalFloor - dtN / 12);
        window.PhobiaFear._duration = engageDur;
        window.PhobiaFear.setInput("duration", Math.max(engageDur / 24, arousalFloor));
        const isAway = distS > (B.inZoneDist ?? 3.2) + 1.5;
        window.PhobiaFear.bumpAvoidance(dtN, isAway && engageDur > 2);
        if (window.PhobiaNarrator) {
          window.PhobiaNarrator.tick("snakes", {
            minGap: 30,
            threat: intensity === "apex" && (snakeCtl.state === "defensive" || snakeCtl.strikePhase === "telegraph" || snakeCtl.strikePhase === "lunge"),
          });
        }
        // ---- The coach, every frame ----
        {
          snLastDist = distS;
          const dxp = -dxs, dzp = -dzs;   // snake → player is dxs/dzs; keep the dog sign convention below
          if (snPrevSX != null && dtN > 0) {
            const vx = (SP.x - snPrevSX) / dtN, vz = (SP.z - snPrevSZ) / dtN;
            const tw = (vx * dxs + vz * dzs) / (distS || 1);        // + = the snake closing on you
            snToward += ((isFinite(tw) && Math.abs(tw) < 12 ? tw : 0) - snToward) * Math.min(1, dtN * 6);
          }
          snPrevSX = SP.x; snPrevSZ = SP.z;
          if (snPrevPX != null && dtN > 0) {
            const pv = Math.hypot(CP.x - snPrevPX, CP.z - snPrevPZ) / dtN;
            snPlayerSpeed += ((isFinite(pv) && pv < 12 ? pv : 0) - snPlayerSpeed) * Math.min(1, dtN * 6);
          }
          snPrevPX = CP.x; snPrevPZ = CP.z;
          headAnchor.getWorldPosition(_snV);
          camera.updateMatrixWorld();
          _snV.project(camera);
          snOnScreen = _snV.z < 1 && Math.abs(_snV.x) < 0.92 && Math.abs(_snV.y) < 0.92;
          // The renderer's CSS size, not the canvas's clientWidth: reading
          // layout here forced a synchronous reflow every frame.
          if (active && active.renderer) active.renderer.getSize(_coachSize); else _coachSize.set(0, 0);
          const sw = _coachSize.x, shh = _coachSize.y;
          const ax = _snV.z < 1 ? (_snV.x + 1) / 2 * sw : null;
          const ay = _snV.z < 1 ? (1 - _snV.y) / 2 * shh - 30 : null;
          const facing = (Math.sin(snakeCtl.heading) * dxs + Math.cos(snakeCtl.heading) * dzs) / (distS || 1) > 0.8;
          snCoach.update(dtN, {
            dist: distS, gaze: gazeAlign, dogToward: snToward,
            px: CP.x, pz: CP.z, dogX: SP.x, dogZ: SP.z,
            onScreen: snOnScreen, dogGazing: facing && snakeCtl.state === "watch", trust: null,
            anchorX: ax, anchorY: ay, stageW: sw, stageH: shh,
          });
          void dxp; void dzp;
          const inZone = snCoach.engaged;
          const st = snakeCtl.state;
          // A crossing that passes close is "it came at me" — and it went on by.
          if (snakeCtl.crossing && st === "wander" && distS < 2.2 && !snCrossNear) { snCrossNear = true; snCoach.note("run"); }
          // Readable moments that aren't state changes.
          if (st === "bask") {
            snBaskT += dtN;
            if (snBaskT > 5 && Math.random() < dtN * 0.2 && snSignal("bask")) snBaskT = 0;
            const tt = snakeCtl.ctrl ? snakeCtl.ctrl._tongueT : -1;
            if (tt != null && tt >= 0 && snTonguePrev < 0 && Math.random() < 0.3) snSignal("flick");
            snTonguePrev = tt == null ? -1 : tt;
          } else snTonguePrev = -1;
          if (st === "wander" && !snakeCtl.crossing) { snGlideT += dtN; if (snGlideT > 2.5 && Math.random() < dtN * 0.3 && snSignal("glide")) snGlideT = 0; }
          // Rung goals.
          if (snRung === 0 && distS < snZone) snCoach.goalDone("near");
          if (snRung === 1) { snStillMoveT = (st === "wander" && inZone && snPlayerSpeed < 0.3) ? snStillMoveT + dtN : snStillMoveT; if (snStillMoveT > 2) snCoach.goalDone("stillMove"); }
          if (snRung === 2) { if (snakeCtl.crossing && st === "wander" && inZone) snCrossT += dtN; if (snCrossT > 3) snCoach.goalDone("crossHeld"); }
          if (snRung === 3) { if (st === "watch" && distS < (B.rearDist ?? 2.6) + 0.3) snRearT += dtN; if (snRearT > 4) snCoach.goalDone("rearHeld"); }
          if (snRung === 4) { if (distS < (B.strikeDist ?? 1.45) + 0.8) snSlowT += dtN; if (snSlowT > 8) snCoach.goalDone("slowHeld"); }
        }

        // Diegetic completion beat: once the hold is earned, the snake settles
        // for good (no more strikes) — the disconfirming evidence, staged.
        if (window.__rungHoldComplete && !completionBeatDone) {
          if (snCoach.everSettled) snCoach.goalDone("settle");
          completionBeatDone = true;
          snakeCtl.defenseCooldown = Infinity;
          // If the hold completes mid-strike, the strike branch that clears these
          // stops running the moment we leave "defensive" — reset them here or the
          // snake settles with its mouth locked open / striking flag stuck true.
          snakeCtl.strikePhase = "none"; snakeCtl.striking = false; snakeCtl.jawTarget = 0;
          if (snakeCtl.state !== "retreat") snakeEnter(intensity === "apex" && distS < 3 ? "retreat" : "bask", controls);
          if (window.PhobiaFX && window.PhobiaFX.contextPrompt) window.PhobiaFX.contextPrompt(window.t("sc.n.settled", "It settled. You held your ground and it stood down."), 4500);
        }
      }
      // ---- Fear grade the daylight (subtle — it stays a sunny clearing) ----
      {
        const fear01 = (window.PhobiaFear && window.PhobiaFear.get) ? clamp01(window.PhobiaFear.get() / 100) : 0;
        const target = fear01 * (window.__rungHoldComplete ? 0.35 : 1);
        _fearGrade += (target - _fearGrade) * Math.min(1, dtN * 2.5);
        const g = _fearGrade;
        sun.intensity = lightBase.sunI * (1 - g * 0.18);
        sun.color.setHex(lightBase.sunC).lerp(_coolSun, g * 0.30);
        hemi.intensity = lightBase.hemiI * (1 - g * 0.35);
        groundGlow.intensity = lightBase.glowI * (1 - g * 0.30);
        if (skyDome) skyDome.material.color.setScalar(SKY_GAIN * (1 - g * 0.22));
        if (scene.fog) scene.fog.color.copy(fogBase).lerp(_chargeBg, g * 0.25);
        scene.background.setHex(mood.bg).lerp(_chargeBg, g * 0.35);
      }
      // Falling leaf — physics + spin until it lands; snake briefly tracks it
      if (leaf) {
        if (!leaf.userData.settled) {
          leaf.userData.vy -= 4 * dtN;
          leaf.position.x += leaf.userData.vx * dtN;
          leaf.position.y += leaf.userData.vy * dtN;
          leaf.position.z += leaf.userData.vz * dtN;
          leaf.rotation.z += leaf.userData.spin * dtN;
          leaf.rotation.x += leaf.userData.spin * 0.5 * dtN;
          if (leaf.position.y <= -0.95) {
            leaf.position.y = -0.95;
            leaf.rotation.x = -Math.PI / 2;   // lay flat on the ground
            leaf.userData.settled = true;
            // A novel object landed: tongue-taste it (twice — the same
            // chemosensing beat the extend-hand mechanic teaches).
            if (snakeCtl.ctrl && Math.hypot(leaf.position.x - snake.position.x, leaf.position.z - snake.position.z) < 4) {
              snakeCtl.ctrl.requestTongueFlick(true);
              sceneTimers.push(setTimeout(() => { try { snakeCtl.ctrl.requestTongueFlick(true); } catch {} }, 900));
            }
            // After 4 s, fade away — THIS leaf. The timer used to act on the
            // shared `leaf`, so a second leaf dropped within 4 s was deleted
            // by the first one's timer, sometimes mid-fall.
            const mine = leaf;
            sceneTimers.push(setTimeout(() => {
              if (!mine || leaf !== mine) return;
              scene.remove(leaf); leaf.geometry.dispose(); leaf.material.dispose(); leaf = null;
            }, 4000));
          }
        }
        // (Orientation toward the leaf is handled by the locomotion
        // controller's bask state — the whole body turns lazily, no snap.)
      }
      // Stillness mechanic: when user holds "still" + isn't moving, the snake
      // gradually slithers AWAY (it's more afraid of you when you're calm).
      const moving = controls && controls.moving;
      if (stillHeld && !moving) {
        stillness = Math.min(1, stillness + dtN * 0.4);
      } else {
        stillness = Math.max(0, stillness - dtN * 0.5);
      }

      // ---- Extend hand mechanic ----
      // Slowly ease extension toward the target (slow on the way out — the
      // snake is sensitive to fast movement; quicker on the way back).
      const extKEase = extensionTarget > extension ? 2.5 : 5.0;
      extension += (extensionTarget - extension) * Math.min(1, dtN * extKEase);
      // Visually: handGroup z goes from -0.30 (close to camera) to a forward
      // reach of -0.85 (about an outstretched arm length from the eye).
      handGroup.position.z = -0.30 - extension * 0.55;
      // Tilt the palm up slightly as it extends (offering posture)
      handGroup.rotation.x = -extension * 0.25;
      // World-space distance from the extended palm to the snake's head
      // (reuse closure temps — this runs every frame).
      sPalm.getWorldPosition(_snkPalm);
      headAnchor.getWorldPosition(_snkHead2);
      const headWorldDist = _snkPalm.distanceTo(_snkHead2);
      // Sniff trust builds when the palm is within ~0.7 m of the snake head
      // AND the user is holding the extend button (active gesture, not by
      // accident). Decays slowly otherwise.
      const sniffing = extendHeld && extension > 0.6 && headWorldDist < 0.9 && !moving;
      snakeCtl.sniffing = sniffing;   // published for the fear feed + tongue cadence
      if (sniffing) {
        sniffT = Math.min(1, sniffT + dtN * 0.30);
        // The snake visibly tongue-tastes the offered hand — the "it's
        // investigating, not attacking" beat that fills trust.
        if (snakeCtl.ctrl && t - _lastSniffFlick > 0.6) { _lastSniffFlick = t; snakeCtl.ctrl.requestTongueFlick(true); }
        if (sniffT >= 0.999 && !sniffMet) {
          sniffMet = true;
          if (window.PhobiaVoice) {
            window.PhobiaVoice.speak(window.t("sc.n.hand", "It met your hand. You stayed still. The fear is teachable."));
          }
        }
      } else {
        sniffT = Math.max(0, sniffT - dtN * 0.10);
      }

      // Drive the locomotion controller — behaviour states, root motion,
      // clip-rate sync, head tracking, slither rustle. The stillness retreat
      // and the "engaged while sniffing" rule both live inside it now.
      snakeUpdate(t, dtN, controls, sniffing);
      // Meadow life: grass blades sway on individual wind phases, a little
      // harder in the gusts (cheap — rotation only, no shader work).
      grassWind.value = t;
      // The sky is at infinity: the dome travels with your eye.
      if (skyDome && controls) skyDome.position.set(controls.position.x, controls.position.y, controls.position.z);
      // Canopy shimmer + drifting dust motes (tier-gated pieces).
      if (gobo) { gobo.position.x = Math.sin(t * 0.13) * 0.6; gobo.position.z = -4 + Math.cos(t * 0.09) * 0.5; }
      if (dustPoints && dustAttr) {
        for (let i = 0; i < dustData.length; i++) {
          const dd = dustData[i];
          dustPos[i * 3] += dd.vx * dtN + Math.sin(t + dd.phaseX) * 0.06 * dtN;   // was per-frame
          dustPos[i * 3 + 1] += dd.vy * dtN;
          dustPos[i * 3 + 2] += dd.vz * dtN + Math.cos(t + dd.phaseY) * 0.06 * dtN;
          if (dustPos[i * 3 + 1] < -0.95) spawnMote(i);
        }
        dustAttr.needsUpdate = true;
      }
    },
    dispose() {
      try { sceneTimers.forEach(id => { clearTimeout(id); clearInterval(id); }); } catch {}
      try { if (moodChipOff) moodChipOff(); } catch {}
      try { liveAudio.forEach(h => h && h.stop && h.stop()); } catch {}
      try { window.__holdCelebrationGate = null; window.__rungHoldComplete = false; } catch {}
      try { if (window.PhobiaThreat === _snakeThreatPos) window.PhobiaThreat = null; } catch {}
      try { const bar = document.querySelector('.scene-cmd-bar[data-scene="snakes"]'); if (bar) bar.dataset.wired = ""; } catch {}
      try { snake.userData.disposed = true; if (snake.userData.parts && snake.userData.parts.mixer) snake.userData.parts.mixer.stopAllAction(); } catch {}
      try { if (snHudEl) { snHudEl.remove(); snHudEl = null; } } catch {}
      // The sky dome shares the cached HDR (never dispose that); its PMREM is
      // this renderer's own.
      try { if (skyDome) { scene.remove(skyDome); skyDome.geometry.dispose(); skyDome.material.dispose(); skyDome = null; } } catch {}
      try { if (skyEnv) { if (scene.environment === skyEnv) scene.environment = null; skyEnv.dispose(); skyEnv = null; } } catch {}
      try { window.__lastTrialEvidence = Object.assign(snCoach.evidence(), { phobia: "snakes", level: levelIdx, ts: Date.now() }); } catch {}
      try { snCoach.dispose(); } catch {}
      try { if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(null); } catch {}
      try { if (window.__holdPolicy === snCoach.holdPolicy) window.__holdPolicy = null; } catch {}
      try { if (window.__coach === snCoach) window.__coach = null; } catch {}
      // Stop the moving slither rustle (it's a looping source, not a one-shot).
      try { if (slitherSound) { slitherSound.stop(); slitherSound = null; } } catch {}
      // Free the set-dressing this overhaul added (generated textures + materials).
      try {
        shellPieces.forEach(m => {
          scene.remove(m);
          if (m.geometry) m.geometry.dispose();
          if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => {
            if (!x) return;
            // Also dispose the material's generated CanvasTextures — some set-dressing
            // maps are uncached, so a fresh set leaks every mount, and the global
            // disposeObject walk can't reach them once removed from the graph here.
            for (const k in x) { const v = x[k]; if (v && v.isTexture) v.dispose(); }
            x.dispose && x.dispose();
          });
        });
      } catch {}
      // Dispose the hand group's own geometry/materials BEFORE detaching it.
      // (The global disposer walks the scene graph; once we remove handGroup
      // from the camera it's unreachable, so we must free it here ourselves.)
      try {
        handGroup.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m && m.dispose());
        });
        camera.remove(handGroup);
      } catch {}
    },
  };
}

export { setupSnakes };
