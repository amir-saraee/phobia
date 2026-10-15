// The Old Cellar — spiders (arachnophobia): SpiderController and the scene.

import * as THREE from "three";
import { CREATURE_MODELS, buildCreature } from "../assets.js";
import { IS_COARSE_POINTER, IS_LOW_POWER, sceneQuality } from "../renderer.js";
import { angleGap } from "../human-rig.js";
import { sceneContext } from "../scene-context.js";
import { makeConcreteMaps, makeDampPlasterMaps, makeWebTexture } from "../textures.js";
import { makeFurMaps, ensureBoxUV, coatFor, _hexMix, SPIDER_COATS } from "../creature-kit.js";
import { _coachSize } from "../dog-controller.js";
import { makeCreatureCoach } from "../coach.js";
import { active } from "../live.js";

// Live threat handoff: while a creature is loaded (spider coil/pounce, snake
// defensive display) its scene publishes the head position here each frame so
// the FP layers can read it; null outside a threat window. One shared object —
// the scenes never run concurrently.
const _threatPos = { x: 0, y: 0, z: 0 };

// ---------- Procedural spider "alive" layer ----------
// Mirrors DogController._bodyLife: after the mixer writes each clip pose, we
// READ the bones and ADD small deltas (never accumulate) — 8-leg micro-twitch,
// a breathing bob, front-leg feelers, an alert stilt-stand when the player is
// close, a coil-load before a pounce, and a fangs-first rear at the apex.
// Scene-scoped (spiders only); the scene owns locomotion + the pounce machine.
class SpiderController {
  constructor(spider, scene, camera) {
    this.spider = spider; this.scene = scene; this.camera = camera;
    this.parts = spider.userData.parts;
    this.baseY = spider.position.y;
    this.height = (this.parts && this.parts.height) || 0.3;
    this.span = (this.parts && this.parts.span) || 0.9;
    this.walkAmt = 0; this._walkAmtSm = 0;      // scene sets 1 while skittering
    this.alert = 0; this._alertSm = 0;          // drawn-up defensive posture
    this.coil = 0; this._coilSm = 0;            // pounce load telegraph
    this.pounceImpulse = 0; this._pounceSm = 0; // one-shot rear at the apex
    this._legPhase = 0; this._breathPhase = 0;
    this._twitchT = []; for (let i = 0; i < 8; i++) this._twitchT.push(Math.random() * Math.PI * 2);
    this._twitchClock = 0.8 + Math.random() * 2.2; this._flickLeg = 0; this._flickT = 0;
    this._poseYOff = 0;
    this._rig = null;
    this.suspend = false;    // scene sets true during jar / removed states (skips whole layer)
    this.suspendY = false;   // scene sets true when it owns y (wall-pounce parabola)
    this.calm = false;       // scene sets true under the jar: breath + faint twitch only
  }
  setAlert(a) { this.alert = Math.max(0, Math.min(1, a)); }
  setCoil(c) { this.coil = Math.max(0, Math.min(1, c)); }
  pounceRear(a = 1) { this.pounceImpulse = Math.max(this.pounceImpulse, a); }
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
  _bodyLife(t, d) {
    const model = this.parts.model;
    if (!model) return;
    if (!this._rig) {
      const find = (n) => { let r = null; model.traverse(o => { if (!r && o.isBone && o.name === n) r = o; }); return r; };
      // Quaternius spider bone names carry NO dot: FrontLegL / FrontLeg2L /
      // FrontLeg3L (femur / tibia / tarsus), sides L|R.
      const bases = ["FrontLeg", "MidFrontLeg", "MidBackLeg", "BackLeg"];
      const legs = [];
      for (const base of bases) for (const side of ["L", "R"]) {
        const up = find(base + side), mid = find(base + "2" + side), tip = find(base + "3" + side);
        if (up || mid || tip) legs.push({ up, mid, tip, isFeeler: base === "FrontLeg" });
      }
      this._rig = { body: find("Body") || find("Thorax"), legs };
      if (!this._rig.body && !legs.length) { this._rig = { body: null, legs: [] }; }
    }
    const rig = this._rig;
    const legs = rig.legs;
    // ---- Additive-layer safety net (see DogController._bodyLife) ----
    // three.js PropertyMixer skips re-writing bones on flat keyframe spans,
    // so "read pose, ADD delta" compounds on those frames. Restore the clean
    // pre-delta base when the mixer skipped a bone; re-capture when it wrote.
    if (!this._lifeBones) {
      const set = new Set();
      if (rig.body) set.add(rig.body);
      for (const L of legs) { if (L.up) set.add(L.up); if (L.mid) set.add(L.mid); if (L.tip) set.add(L.tip); }
      this._lifeBones = [...set].map(b => ({ b, base: { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z }, fin: { x: NaN, y: NaN, z: NaN } }));
    }
    for (const r of this._lifeBones) {
      const rot = r.b.rotation;
      if (rot.x === r.fin.x && rot.y === r.fin.y && rot.z === r.fin.z) {
        rot.set(r.base.x, r.base.y, r.base.z);
      } else {
        r.base.x = rot.x; r.base.y = rot.y; r.base.z = rot.z;
      }
    }
    const poseYPrev = this._poseYOff || 0;
    this._poseYOff = 0;

    // ---- Breath ---- (abdomen swell faked on the Body bone)
    this._breathPhase += d * (this._coilSm > 0.3 ? 2.5 : 1.9);
    const br = Math.sin(this._breathPhase);
    if (rig.body) rig.body.rotation.x += br * 0.010;

    // ---- Walk cadence + body bob ----
    this._walkAmtSm += ((this.walkAmt || 0) - this._walkAmtSm) * Math.min(1, d * 8);
    this._legPhase += d * (6 + this._walkAmtSm * 22);   // idle ~1Hz → dart ~4.5Hz
    const bobP = this._legPhase;

    // ---- Gait leg swing (alternating tetrapod, only while moving) ----
    // Phase groups are L1+R2+L3+R4 anti-phase to R1+L2+R3+L4 (the old i%2
    // split rowed each whole side in unison), plus a small front-to-back
    // metachronal lag. Swing legs also fold slightly so the tarsi arc clear
    // instead of skating.
    if (this._walkAmtSm > 0.01) {
      for (let i = 0; i < legs.length; i++) {
        const row = i >> 1, sd = i & 1;   // legs built base-major: L,R per row
        const off = ((row + sd) & 1) * Math.PI + row * 0.18;
        const sw = Math.sin(bobP + off);
        if (legs[i].mid) legs[i].mid.rotation.z += sw * 0.18 * this._walkAmtSm;
        if (legs[i].tip) legs[i].tip.rotation.z += sw * 0.12 * this._walkAmtSm;
        if (legs[i].up)  legs[i].up.rotation.y += Math.cos(bobP + off) * 0.06 * this._walkAmtSm;
        if (sw > 0) {
          const lift = sw * sw * this._walkAmtSm;
          if (legs[i].mid) legs[i].mid.rotation.x -= lift * 0.16;
          if (legs[i].tip) legs[i].tip.rotation.x += lift * 0.10;
        }
      }
    }

    // ---- Idle micro-twitch + isolated single-leg flick (the "it's alive" tell) ----
    // Under the jar (calm) the twitch halves but never stops — a fully frozen
    // additive layer read as a dead prop at point-blank range.
    const calmMul = this.calm ? 0.5 : 1;
    const stillness = (1 - Math.min(1, this._coilSm + this._pounceSm)) * calmMul;   // no fidget while loaded
    for (let i = 0; i < legs.length; i++) {
      const ph = this._twitchT[i] + t * (2.2 + (i % 3) * 0.6);
      if (legs[i].tip) legs[i].tip.rotation.x += Math.sin(ph) * 0.03 * (1 - 0.6 * this._walkAmtSm) * stillness;
      if (legs[i].mid) legs[i].mid.rotation.x += Math.sin(ph * 0.7) * 0.015 * stillness;
    }
    this._twitchClock -= d;
    if (this._twitchClock <= 0 && stillness > 0.5) {
      this._twitchClock = 0.8 + Math.random() * 2.2;
      this._flickLeg = Math.floor(Math.random() * Math.max(1, legs.length));
      this._flickT = 0.22;
    }
    if (this._flickT > 0) {
      this._flickT -= d;
      const f = Math.sin((1 - this._flickT / 0.22) * Math.PI) * calmMul;
      const L = legs[this._flickLeg];
      if (L) { if (L.tip) L.tip.rotation.x += f * 0.35; if (L.mid) L.mid.rotation.x += f * 0.18; }
    }

    // ---- Feeler wave (the two front legs paw the air) ----
    if (!this.calm) {
      const feelDamp = 1 - 0.7 * this._coilSm;
      const feelP = t * 3.4;
      let fi = 0;
      for (const L of legs) {
        if (!L.isFeeler) continue;
        const side = (fi++) * Math.PI;
        if (L.up)  L.up.rotation.x  -= (0.12 + Math.sin(feelP + side) * 0.14) * feelDamp;
        if (L.mid) L.mid.rotation.x -= 0.10 * feelDamp;
        if (L.tip) L.tip.rotation.x += Math.sin(feelP * 1.3 + side) * 0.10 * feelDamp;
      }
    }

    // ---- Alert posture (hikes up on its legs, front legs raise) ----
    this._alertSm += ((this.calm ? 0 : this.alert) - this._alertSm) * Math.min(1, d * 6);
    if (this._alertSm > 0.01) {
      const a = this._alertSm;
      this._poseYOff += 0.08 * a * this.height;
      for (let i = 0; i < legs.length; i++) {
        const L = legs[i];
        // De-phased per-leg tremor with a slow wax/wane envelope — a unison
        // 30 Hz sine across all eight legs read as a render glitch, not an
        // aroused animal.
        const quiver = Math.sin(t * (26 + (i % 3) * 5) + this._twitchT[i]) * 0.012 * a * (0.6 + 0.4 * Math.sin(t * 1.7 + i));
        if (L.up)  L.up.rotation.x  -= 0.18 * a + (L.isFeeler || i < 4 ? 0.22 * a : 0);
        if (L.mid) L.mid.rotation.x += 0.28 * a + quiver;
        if (L.tip) L.tip.rotation.x -= 0.10 * a;
      }
    }

    // ---- Coil telegraph (hunkers + gathers legs, loading the spring) ----
    this._coilSm += ((this.calm ? 0 : this.coil) - this._coilSm) * Math.min(1, d * 8);
    if (this._coilSm > 0.01) {
      const c = this._coilSm;
      this._poseYOff -= 0.06 * c * this.height;
      for (let i = 0; i < legs.length; i++) {
        const L = legs[i];
        if (L.up)  L.up.rotation.x  += 0.30 * c + (L.isFeeler ? 0.15 * c : 0);
        if (L.mid) L.mid.rotation.x -= 0.40 * c - (L.isFeeler ? 0.10 * c : 0);
        if (L.tip) L.tip.rotation.x += 0.20 * c;
      }
    }

    // ---- Pounce rear (one-shot at the apex: body pitches up, front legs throw up) ----
    this.pounceImpulse = Math.max(0, this.pounceImpulse - d * 2.2);
    this._pounceSm += (this.pounceImpulse - this._pounceSm) * Math.min(1, d * 14);
    if (this._pounceSm > 0.01) {
      const r = this._pounceSm;
      this._poseYOff += 0.10 * r * this.height;
      if (rig.body) rig.body.rotation.x -= 0.45 * r;
      for (let i = 0; i < legs.length; i++) {
        const L = legs[i];
        if (L.isFeeler || i < 4) { if (L.up) L.up.rotation.x -= 0.55 * r; if (L.tip) L.tip.rotation.x -= 0.30 * r; }
      }
    }

    // ---- Body bob applied through the ABSOLUTE y write (poseY accumulator) ----
    // Skipped when the scene owns y (the wall-rung pounce parabola).
    // sin² instead of |sin| — the |sin| kink put a sharp V into every gait
    // beat (same vibration source the dog bob had).
    if (!this.suspendY && !this.calm) {
      const bobK = Math.sin(bobP * 0.5);
      const bob = this._walkAmtSm > 0.01
        ? bobK * bobK * 0.010 * this.height * this._walkAmtSm : 0;
      if (this._walkAmtSm > 0.01) {
        this.spider.position.y = this.baseY + poseYPrev + bob;
      } else {
        this.spider.position.y += (this.baseY + poseYPrev - this.spider.position.y) * Math.min(1, d * 6);
      }
    }

    // ---- Additive-layer safety net (bookend) ----
    for (const r of this._lifeBones) {
      r.fin.x = r.b.rotation.x; r.fin.y = r.b.rotation.y; r.fin.z = r.b.rotation.z;
    }
  }
}

// The claws are NOT on the leg chain. Spider.glb skins the last ~60 vertices
// of every leg (the pointed tarsus end) to a *Foot* IK bone parented straight
// to Root — FrontFootL, MidFrontFootL, …, FrontFoot2R — the same split the
// dog pack's paws had. Anything that measures or plants the feet has to read
// these vertices; the Leg3 bones are a joint a tarsus-length higher.
function spiderClawVerts(model) {
  const out = [];
  model.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    if (!si || !sw) return;
    const foot = new Set();
    o.skeleton.bones.forEach((b, i) => { if (/Foot/.test(b.name)) foot.add(i); });
    if (!foot.size) return;
    const idx = [];
    for (let i = 0; i < si.count; i++) {
      let wm = 0, im = -1;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > wm) { wm = w; im = si.getComponent(i, k); } }
      if (foot.has(im)) idx.push(i);
    }
    if (idx.length) out.push({ mesh: o, idx });
  });
  return out;
}
// Wall pose for a spider on a face whose outward normal is world +z: local up
// (+y, its back) → +z, local forward (+z, head) → +y, local +x → −x.
const SPIDER_WALL_Q = new THREE.Quaternion().setFromRotationMatrix(
  new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
// Lowest claw coordinate along world "y" or "z" for the current pose.
const _clawV = new THREE.Vector3();
function spiderClawMin(claws, axis, root) {
  // getVertexPosition reads bone.matrixWorld as it stands, and the armature is
  // a SIBLING of the skinned mesh — refreshing the mesh alone leaves the bones
  // wherever the last render (or buildCreature's pre-scale pass) put them.
  if (root) root.updateMatrixWorld(true);
  let lo = Infinity;
  for (const c of claws) {
    c.mesh.updateMatrixWorld(true);
    for (const i of c.idx) {
      c.mesh.getVertexPosition(i, _clawV);
      c.mesh.localToWorld(_clawV);
      if (_clawV[axis] < lo) lo = _clawV[axis];
    }
  }
  return lo;
}

// ---------- Spiders ----------
// Spider temperaments. Bounded the same way the dog's are, and the same fields
// are off limits: guardDist, inZoneDist, fearMul, approachBias, skitterSpeed and
// every pounce parameter ARE the rung's threat level.
const SPIDER_TEMPERAMENTS = [
  { id: "settled",  startMul: 1.25, cadenceMul: 1.22, roamMul: 0.75, settleMul: 0.86 },
  { id: "restless", startMul: 0.85, cadenceMul: 0.86, roamMul: 1.22, settleMul: 1.06 },
  { id: "wary",     startMul: 1.10, cadenceMul: 1.05, roamMul: 0.88, settleMul: 0.94 },
  { id: "busy",     startMul: 0.92, cadenceMul: 0.94, roamMul: 1.10, settleMul: 1.00 },
];

function setupSpiders(scene, camera, level, levelIdx, ctx) {
  const size = level.size;
  const intensity = level.intensity || "calm";
  const baseB = level.behavior || {};
  const V = ctx || sceneContext("spiders", levelIdx, false);
  const temper = V.pick(SPIDER_TEMPERAMENTS);
  const B = (() => {
    const b = Object.assign({}, baseB);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (b.firstSkitterAt != null) b.firstSkitterAt = clamp(b.firstSkitterAt * temper.startMul, 1.5, 14);
    if (Array.isArray(b.skitterEvery)) b.skitterEvery = b.skitterEvery.map(x => x * temper.cadenceMul);
    if (b.homeRadius != null) b.homeRadius = clamp(b.homeRadius * temper.roamMul, 0.35, 3.4);
    if (b.settleAfter != null) b.settleAfter = clamp(b.settleAfter / temper.settleMul, 25, 70);
    return b;
  })();
  const rung = Math.max(0, Math.min(4, levelIdx || 0));
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  // Teardown registries + shell tracking (this scene had NO dispose before).
  const sceneTimers = [];
  const liveAudio = [];
  const shellPieces = [];

  // ---- Per-rung cellar MOOD (cold/dim/damp, tighter + darker toward rung 5) ----
  const MOODS = [
    { bg: 0x0d0f12, bulbC: 0xf6ead0, bulbI: 1.15, bulbY: 1.35, fillC: 0x223040, fillI: 0.34, keyC: 0xcdd6e2, keyI: 0.85, keyPos: [2.4, 3.2, 1.0] },
    { bg: 0x0b0d10, bulbC: 0xf3e4c6, bulbI: 1.05, bulbY: 1.30, fillC: 0x1f2c3a, fillI: 0.30, keyC: 0xc6d0dd, keyI: 0.80, keyPos: [2.2, 3.0, 0.8] },
    { bg: 0x090b0e, bulbC: 0xefdcbc, bulbI: 0.95, bulbY: 1.25, fillC: 0x1b2733, fillI: 0.26, keyC: 0xbfcbd8, keyI: 0.78, keyPos: [2.0, 2.9, 0.6] },
    { bg: 0x07080b, bulbC: 0xecd6b2, bulbI: 0.88, bulbY: 1.20, fillC: 0x18222d, fillI: 0.22, keyC: 0xb8c4d2, keyI: 0.80, keyPos: [1.8, 2.7, 0.4] },
    { bg: 0x050608, bulbC: 0xe6cca6, bulbI: 0.80, bulbY: 1.15, fillC: 0x141d27, fillI: 0.18, keyC: 0xb0bccb, keyI: 0.85, keyPos: [1.6, 2.5, 0.2] },
  ];
  const baseMood = MOODS[rung];
  // A cellar has no sky, so its context is the BULB: colour temperature and
  // brightness drift between visits the way a swapped or dirtier bulb would.
  // Kept narrow — the rung's own ramp still has to read through it.
  const mood = Object.assign({}, baseMood, {
    bulbC: _hexMix(baseMood.bulbC, V.rng() < 0.5 ? 0xfff0d2 : 0xdfe6f0, V.range(0.15, 0.45)),
    bulbI: baseMood.bulbI * V.range(0.86, 1.14),
    bulbY: baseMood.bulbY + V.range(-0.08, 0.08),
    fillI: baseMood.fillI * V.range(0.88, 1.12),
  });
  scene.background = new THREE.Color(mood.bg);
  // No fog — a real enclosed cellar shell; cameraFar tightens depth precision.
  const _coolKey = new THREE.Color(0x8fa4bd);
  const _coolBg = new THREE.Color(0x020304);
  let _fearGrade = 0;

  // Reset the shared engagement accumulator + set honest per-rung credit
  // thresholds so full credit is reachable on the gentle rungs (proximity
  // alone caps low). setScene resets these to 30/10 for every scene.
  if (window.PhobiaFear) {
    window.PhobiaFear._duration = 0;
    if (window.PhobiaFear.setCreditThresholds) {
      if (intensity === "calm") window.PhobiaFear.setCreditThresholds(18, 6);
      else if (intensity === "alert") window.PhobiaFear.setCreditThresholds(26, 9);
      // apex keeps 30/10 defaults
    }
  }

  // ---- Cellar lighting: one motivated bare bulb + cold fill + tracking rim ----
  // The wall rung's pier stands where the bulb hangs on every other rung —
  // the bulb and its cord were INSIDE it: the room's one bloom source hidden,
  // and the shadow-casting light boxed in by a shadow-casting column. Hang it
  // in front of the face instead, off to the side, so it rakes the spider.
  const bulbBase = B.onWall ? new THREE.Vector3(-1.3, mood.bulbY, -1.7) : new THREE.Vector3(0.8, mood.bulbY, -3.0);
  const bulbMat = new THREE.MeshStandardMaterial({ color: mood.bulbC, emissive: mood.bulbC, emissiveIntensity: 2.4, fog: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), bulbMat);
  bulb.position.copy(bulbBase);
  scene.add(bulb); shellPieces.push(bulb);
  const cord = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.004, Math.max(0.05, 1.6 - mood.bulbY), 4),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 })
  );
  cord.position.set(bulbBase.x, (1.6 + mood.bulbY) / 2, bulbBase.z);
  scene.add(cord); shellPieces.push(cord);
  const bulbLight = new THREE.PointLight(mood.bulbC, mood.bulbI, 9, 2);
  bulbLight.position.copy(bulbBase);
  bulbLight.castShadow = !IS_LOW_POWER;
  if (bulbLight.castShadow) {
    // A point light renders its casters six times, into a cube. At 2048² per
    // face the shadow pass was 4.4 ms of an 11.2 ms rung-4 frame (M4, DPR 2);
    // 1024² saved 1.6 ms of that, and a face texel is still 3–8 mm on the
    // floor 2–5 m from the bulb, where the spider is. far = the light's range: past
    // 9 m the bulb contributes nothing, so depth precision was spent on dark.
    bulbLight.shadow.mapSize.set(1024, 1024);
    bulbLight.shadow.camera.near = 0.3; bulbLight.shadow.camera.far = 9;
    bulbLight.shadow.bias = -0.0004; bulbLight.shadow.normalBias = 0.02;
  }
  scene.add(bulbLight); shellPieces.push(bulbLight);
  // Raking key — edge-models the legs, gated by the shell (reads as spill).
  const key = new THREE.DirectionalLight(mood.keyC, mood.keyI);
  key.position.set(...mood.keyPos);
  key.target.position.set(0, -0.9, -3);
  key.castShadow = !IS_LOW_POWER;
  if (key.castShadow) {
    const mr = sceneQuality() === "high" ? 2048 : 1024;
    key.shadow.mapSize.set(mr, mr);
    key.shadow.camera.left = -6; key.shadow.camera.right = 6;
    key.shadow.camera.top = 6; key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 24;
    key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
  }
  scene.add(key); scene.add(key.target); shellPieces.push(key, key.target);
  // Cold fill (hemisphere lifts shadows without killing the mood).
  const fill = new THREE.HemisphereLight(mood.fillC, 0x0a0c10, mood.fillI);
  scene.add(fill); shellPieces.push(fill);
  // Rim tracked behind the spider each frame (sharp cold edge on the legs).
  const spiderRim = new THREE.PointLight(0xbcd0e8, 0.0, 5, 2);
  scene.add(spiderRim); shellPieces.push(spiderRim);
  const lightBase = { bulbI: bulbLight.intensity, bulbC: bulbLight.color.getHex(), keyI: key.intensity, keyC: key.color.getHex(), fillI: fill.intensity };

  // ---- Room shell (real cellar sized to the play space) ----
  const ROOM = { x0: -4.0, x1: 4.0, z0: -9.5, z1: 5.6, ceilY: 1.6 };
  const wallH = ROOM.ceilY - (-1);   // 2.6 m — a low, oppressive cellar ceiling
  const addShell = (mesh, cast) => {
    mesh.castShadow = !!cast && !IS_LOW_POWER;
    mesh.receiveShadow = true;
    mesh.userData.noCollide = true;
    scene.add(mesh); shellPieces.push(mesh);
    return mesh;
  };
  // Damp concrete floor (reuse the shared concrete maps, tinted cold).
  const cMaps = makeConcreteMaps();
  [cMaps.albedo, cMaps.normal, cMaps.roughness].forEach(tx => { if (tx) tx.repeat.set(5, 9); });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8.4, 15.5),
    new THREE.MeshStandardMaterial({ map: cMaps.albedo, normalMap: cMaps.normal, roughnessMap: cMaps.roughness, color: 0x6a6e74, envMapIntensity: 0.3 })
  );
  // Softer relief: looking closer at a real-size spider puts the concrete
  // right in the lens, and at 0.9 its pits read as bubble wrap.
  if (floor.material.normalMap) floor.material.normalScale.set(0.45, 0.45);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -1, (ROOM.z0 + ROOM.z1) / 2);
  floor.receiveShadow = true; floor.userData.noCollide = true;
  scene.add(floor); shellPieces.push(floor);
  // Damp plaster walls.
  const wMaps = makeDampPlasterMaps();
  [wMaps.albedo, wMaps.normal].forEach(tx => { if (tx) tx.repeat.set(3.5, 1.2); });
  const wallMat = new THREE.MeshStandardMaterial({ map: wMaps.albedo, normalMap: wMaps.normal, color: 0xffffff, roughness: 0.94, envMapIntensity: 0.25 });
  if (wallMat.normalMap) wallMat.normalScale.set(0.7, 0.7);
  const midZ = (ROOM.z0 + ROOM.z1) / 2;
  const backWall = addShell(new THREE.Mesh(new THREE.BoxGeometry(8.0, wallH, 0.12), wallMat), true);
  backWall.position.set(0, -1 + wallH / 2, ROOM.z0);
  const leftWall = addShell(new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, ROOM.z1 - ROOM.z0), wallMat), true);
  leftWall.position.set(ROOM.x0, -1 + wallH / 2, midZ);
  const rightWall = addShell(new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, ROOM.z1 - ROOM.z0), wallMat), false);
  rightWall.position.set(ROOM.x1, -1 + wallH / 2, midZ);
  const ceilMat = wallMat.clone(); ceilMat.color.setHex(0x2a2a2e);
  const ceiling = addShell(new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.10, 15.1), ceilMat), true);
  ceiling.position.set(0, ROOM.ceilY, midZ);
  // Front wall + door: inward-facing single-sided planes (dollhouse trick).
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(8.0, wallH), wallMat);
  frontWall.rotation.y = Math.PI; frontWall.position.set(0, -1 + wallH / 2, ROOM.z1);
  frontWall.receiveShadow = true; frontWall.userData.noCollide = true;
  scene.add(frontWall); shellPieces.push(frontWall);
  const doorX = -1.4;
  const jambMat = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.85 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.8 });
  const dPlane = (w, h, x, y, z, mat) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.rotation.y = Math.PI; p.position.set(x, y, z); p.userData.noCollide = true; scene.add(p); shellPieces.push(p); };
  for (const dx of [-0.55, 0.55]) dPlane(0.08, 2.05, doorX + dx, -1 + 2.05 / 2, ROOM.z1 - 0.03, jambMat);
  dPlane(1.10, 0.08, doorX, 1.09, ROOM.z1 - 0.03, jambMat);
  dPlane(0.94, 2.0, doorX, -1 + 1.0, ROOM.z1 - 0.05, doorMat);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.09, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.6, roughness: 0.4 }));
  handle.position.set(doorX + 0.34, -0.05, ROOM.z1 - 0.09); handle.userData.noCollide = true;
  scene.add(handle); shellPieces.push(handle);
  // Skirting.
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x35322e, roughness: 0.9 });
  const skirt = (w, dpt, x, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, dpt), baseMat); b.position.set(x, -0.955, z); b.userData.noCollide = true; scene.add(b); shellPieces.push(b); };
  skirt(8.0, 0.02, 0, ROOM.z0 + 0.08);
  skirt(0.02, ROOM.z1 - ROOM.z0, ROOM.x0 + 0.08, midZ);
  skirt(0.02, ROOM.z1 - ROOM.z0, ROOM.x1 - 0.08, midZ);

  // ---- Cobwebs in the corners + dust motes in the bulb light ----
  const webTex = makeWebTexture();
  const webMat = new THREE.MeshBasicMaterial({ map: webTex, alphaMap: webTex, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const webCount = sceneQuality() === "low" ? 2 : 4;
  const webSpots = [
    [ROOM.x0 + 0.04, 1.15, ROOM.z0 + 0.3, Math.PI / 4],
    [ROOM.x1 - 0.04, 1.15, ROOM.z0 + 0.3, -Math.PI / 4],
    [ROOM.x0 + 0.04, 1.15, -3.0, Math.PI / 4],
    [doorX + 0.7, 1.05, ROOM.z1 - 0.08, Math.PI],
  ];
  for (let i = 0; i < webCount; i++) {
    const [wx, wy, wz, wr] = webSpots[i];
    const web = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), webMat);
    web.position.set(wx, wy, wz); web.rotation.y = wr; web.userData.noCollide = true;
    scene.add(web); shellPieces.push(web);
  }
  // Dust motes drifting under the bulb (single THREE.Points, cold tint).
  const dustCount = sceneQuality() === "high" ? 90 : sceneQuality() === "medium" ? 50 : 25;
  const dustData = [];
  const dustPos = new Float32Array(dustCount * 3);
  const spawnMote = (i) => {
    const ang = Math.random() * Math.PI * 2, r = Math.random() * 1.4;
    dustPos[i * 3] = bulbBase.x + Math.cos(ang) * r;
    dustPos[i * 3 + 1] = -1 + Math.random() * (bulbBase.y + 1);
    dustPos[i * 3 + 2] = bulbBase.z + Math.sin(ang) * r;
  };
  for (let i = 0; i < dustCount; i++) { spawnMote(i); dustData.push({ vx: (Math.random() - 0.5) * 0.03, vy: -0.02 - Math.random() * 0.03, vz: (Math.random() - 0.5) * 0.03, phaseX: Math.random() * 6.28, phaseY: Math.random() * 6.28 }); }
  const dustGeo = new THREE.BufferGeometry();
  const dustAttr = new THREE.BufferAttribute(dustPos, 3); dustAttr.setUsage(THREE.DynamicDrawUsage);
  dustGeo.setAttribute("position", dustAttr);
  const discC = document.createElement("canvas"); discC.width = discC.height = 32;
  const dctx = discC.getContext("2d");
  const dg = dctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  dg.addColorStop(0, "rgba(200,210,224,1)"); dg.addColorStop(1, "rgba(200,210,224,0)");
  dctx.fillStyle = dg; dctx.fillRect(0, 0, 32, 32);
  const dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.018, map: new THREE.CanvasTexture(discC), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  dustPoints.userData.noCollide = true;
  scene.add(dustPoints); shellPieces.push(dustPoints);

  // ---- Set dressing (drain grate, cardboard boxes; the spider's homes) ----
  const drainPos = new THREE.Vector3(1.2, -1, -4.5);
  const drain = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.42), new THREE.MeshStandardMaterial({ color: 0x14151a, metalness: 0.4, roughness: 0.6 }));
  drain.position.set(drainPos.x, -0.985, drainPos.z); drain.receiveShadow = true; drain.userData.noCollide = true;
  scene.add(drain); shellPieces.push(drain);
  const slatMat = new THREE.MeshStandardMaterial({ color: 0x22242a, metalness: 0.3, roughness: 0.7 });
  for (let s = -2; s <= 2; s++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.012, 0.03), slatMat); bar.position.set(drainPos.x, -0.975, drainPos.z + s * 0.08); bar.userData.noCollide = true; scene.add(bar); shellPieces.push(bar); }
  if (sceneQuality() !== "low") {
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x8a6d47, roughness: 0.95 });
    const boxDefs = [[-2.8, -0.65, -6.5, 0.6, 0.15], [-2.55, -0.72, -6.1, 0.5, -0.3], [-2.95, -0.4, -6.6, 0.55, 0.1]];
    for (const [bx, by, bz, bs, brot] of boxDefs) { const box = addShell(new THREE.Mesh(new THREE.BoxGeometry(bs, bs, bs), boxMat), true); box.position.set(bx, by, bz); box.rotation.y = brot; box.userData.noCollide = false; }   // solid, not walk-through
  }

  // ---- Room reverb + cellar ambient (dead concrete acoustics) ----
  {
    const A = window.PhobiaAudio;
    if (A && A.roomReverb && sceneQuality() !== "low") liveAudio.push(A.roomReverb({ level: 0.20 }));
    if (A && A.startCellarAmbient) liveAudio.push(A.startCellarAmbient({ intensity: 0.35 + size * 0.25 }));
  }

  // Build spider — real rigged GLTF (Quaternius, CC0), at a REAL spider's
  // size. It used to be 0.9–1.7 m across (knee-high to the traveller): a
  // horror prop, not the thing people are afraid of in their bathroom, and
  // exposure to a monster doesn't carry over to the real animal. Now the
  // ladder climbs house spider → large house spider → wolf spider → a
  // tarantula-sized huntsman on the wall at eye level (8–26 cm leg span).
  // Hold Z (or hold 🔍) to look closer — you have to look to see one.
  const SP_SPAN = [0.08, 0.12, 0.16, 0.21, 0.26][rung];
  const SP_Z = [-2.2, -1.2, -0.6, -0.1, 0][rung];            // floor rungs: where it sits (you start at z 4)
  const distance = -SP_Z;
  const spiderSpan = SP_SPAN;                                // leg span, m (buildCreature axis "max")
  const spider = buildCreature(CREATURE_MODELS.spider, {
    targetSize: spiderSpan,
    axis: "max",
    coat: coatFor("spider", SPIDER_COATS),
  });
  const GROUND_NUDGE = 0.03;
  const onWall = !!B.onWall;
  if (onWall) {
    // A cellar support pillar gives the vertical spider a real surface to sit
    // on at eye level (the back wall is 7 m away). Concrete column, floor→ceiling.
    const wallZ = B.wallZ ?? -2.6;
    // As wide as the spider's leg span (buildCreature's targetSize, axis max)
    // plus a margin: at 0.7 m, lying flat, the 1.7 m apex spider's outer legs
    // hung in the air beyond both edges. Wide enough for its climb too (±
    // homeRadius along x) — a pier rather than a column.
    const pillarW = Math.max(0.7, spiderSpan * 1.12 + 2 * (B.homeRadius ?? 0.5));
    // Same plaster as the walls, at the walls' texture density (they tile 3.5×
    // over 8 m). It used a CLONE of the wall albedo, and the cloned
    // CanvasTexture sampled as black: the apex spider sat on a pitch-black
    // slab that swallowed its silhouette.
    const pillarGeo = new THREE.BoxGeometry(pillarW, wallH, 0.5);
    const puv = pillarGeo.attributes.uv;
    for (let i = 0; i < puv.count; i++) puv.setX(i, puv.getX(i) * pillarW / 8.0);
    const pillar = new THREE.Mesh(pillarGeo, wallMat);
    pillar.position.set(1.0, -1 + wallH / 2, wallZ - 0.25);
    // Solid: you could walk straight through the pier the spider sits on.
    pillar.castShadow = !IS_LOW_POWER; pillar.receiveShadow = true;
    scene.add(pillar); shellPieces.push(pillar);
    // Flat on the pillar's front face at eye level (Package B rung-5 placement):
    // belly into the concrete, back to the viewer, head up. The old roll about
    // z stood the spider on an imaginary wall at its left — its body plane was
    // PERPENDICULAR to the face, claws 63 cm into the concrete and 80 cm out
    // into the room (measured), and from the locked first-person spot the
    // apex spider was an edge-on sliver. z is set properly once the claws can
    // be measured (grounding in the update loop).
    spider.position.set(1.0, -1 + (B.wallEyeY ?? 0.5) + 1.0, wallZ + 0.02);
    spider.quaternion.copy(SPIDER_WALL_Q);
  } else {
    // Somewhere else on the floor each visit. Radial distance still belongs to
    // the rung; only the lateral placement and a small depth jitter move. The
    // wall rung is exempt — it has to stay on its pillar.
    spider.position.set(V.range(-1.0, 1.0), -1, SP_Z + V.range(-0.3, 0.3));
  }
  // The mood this visit rolled is named in the coach card's footer (below).
  let moodChipOff = null;
  const spiderCtrl = new SpiderController(spider, scene, camera);
  spider.userData.ctrl = spiderCtrl;   // observability for scene-verification hooks
  let spiderClaws = null;              // claw vertices (spiderClawVerts), set on ready
  // Ground speed the Walk clip implies at timeScale 1. A fixed 0.9 m/s served
  // every rung, but the clip's stride is in model units, so it scales with the
  // spider. Measured by driving the clip at constant speed and minimising the
  // planted claws' slip: best at 0.9 m/s for the 1.27 m rung-3 spider → 0.71
  // per metre of span. Even there the claws slip ~25 % of body speed — the
  // pack's eight feet sweep at 0.56–0.97 m/s, so no single rate fits them all.
  const walkRef = 0.71 * spiderSpan;
  const spPrevPos = new THREE.Vector3(); let spPrevOk = false;
  spiderCtrl.suspend = true;   // stays suspended until the model is ready
  spider.userData.onReady = () => {
    try {
      const pp = spider.userData.parts;
      // Dark chitinous material pass — a slightly-glossy near-black carapace so
      // the cold key + rim catch every leg edge sharply against the cellar.
      const model = pp.model;
      let furNrm = null;
      try { furNrm = makeFurMaps().normal; } catch {}
      model.traverse(o => {
        if (!o.isMesh || !o.material) return;
        if (o.geometry && typeof ensureBoxUV === "function") { try { ensureBoxUV(o.geometry, pp.span || 1); } catch {} }
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => {
          if (!m || !m.color) return;
          m.color.multiplyScalar(0.42);
          m.color.lerp(new THREE.Color(0x4a3a2b), 0.55);
          m.metalness = 0;
          m.roughness = 0.42;
          m.envMapIntensity = 0.35;
          if (furNrm) { const n = furNrm.clone(); n.repeat.set(4, 4); n.needsUpdate = true; m.normalMap = n; if (m.normalScale) m.normalScale.set(0.35, 0.35); }
          m.needsUpdate = true;
        });
      });
      pp.play("Idle");
      spiderCtrl.height = pp.height || 0.3;
      spiderCtrl.span = pp.span || 0.9;
      spiderCtrl.baseY = spider.position.y;
      spiderClaws = spiderClawVerts(model);
      spiderCtrl._needsGround = true;   // self-calibrate the claws onto floor / pillar face
      spiderCtrl.suspend = false;
    } catch (e) { console.warn("[spiders] onReady:", e); }
  };
  scene.add(spider);

  // Camera framing (eye = groundY+1.62; mount overrides initialPos.y).
  camera.fov = 55;
  camera.updateProjectionMatrix();
  const spiderPitch = onWall
    ? 0
    : Math.atan2(-1.3, 4.0 - SP_Z);
  const minZ = onWall ? -6.0 : SP_Z - 0.2;

  // ---- Skitter state (the arachnophobic apex) ----
  // Instead of a timid 0.5 m crawl-and-retreat, the spider darts TOWARD you in
  // erratic stop-start bursts — fast, with a sideways jag and a dead-still
  // freeze between — and can come right up to your feet. Your agency: contain
  // it under the jar, or simply back away (the scene is walkable). Speed and
  // frequency scale with the rung's `size`.
  const baseZ = spider.position.z;
  const homeAnchor = { x: spider.position.x, z: spider.position.z };
  let skitterState = "lurking";       // lurking | skittering | pausing
  let skitterT = 0;
  let nextSkitter = 2.5 + Math.random() * 2.5;
  let skitterDur = 0.3;
  let skitterDir = { x: 0, z: 1 };
  let skitterTargetYaw = 0;           // heading goal — turned toward, never snapped
  let skitterSpeedMul = 1;            // 1 = full dart, ~0.3 = idle micro-shuffle
  let microShuffleAt = 1.5 + Math.random() * 2.0;
  let dartClock = 0;                  // time since the last full dart (shuffles don't reset it)
  let pauseDur = 0.6;                 // this pause's length, rolled at entry
  let wallSpin = 0;                   // wall rung: heading spin about the wall normal
  let recoilTgt = null;               // where this recoil is heading (fixed at entry)
  let wallDetach = 0;                 // wall rung: 0 flat on the face, 1 turned to the player mid-leap
  const _spWallQ = new THREE.Quaternion(), _spFaceQ = new THREE.Quaternion();
  const _spWallAxis = new THREE.Vector3(0, 0, 1), _spYAxis = new THREE.Vector3(0, 1, 0);
  let spPrevPlayer = null, spApproachSpeed = 0, startleCd = 0;  // player's radial rush (m/s)
  let spiderControls = null;
  let scriptedGesture = null;   // overrides the default "rest" gesture briefly
  let scriptedGestureUntil = 0;
  // ---- Pounce machine (coil→pounce→recoil), rungs with B.pounce only ----
  let pounceState = "idle";     // idle | coiling | pouncing | recoiling
  let pounceT = 0;
  let elapsed = 0;              // scene clock
  let nextPounceAt = B.firstPounceAt ?? Infinity;
  let coilStartDist = 0, thisCoil = 0.9, pounceFired = false, recoilTicked = false;
  let heldCycles = 0, retreatPraised = false, holdPraised = false;
  let completionBeatDone = false;
  let arousalFloor = 0, engageDur = 0;
  // ---- Creature readout (the dog's trust-hud pattern) ----
  // The coil-pounce machine was fully built and fully invisible: the player
  // had no way to know a dart was relocation, a crouch was their own approach
  // speed, or a hop was already over. Reading the animal is the transferable
  // skill — the readout teaches it in plain language.
  // The old one-line readout card is retired: the coach (below) asks the
  // player to read the spider instead of telling them, which is the skill.
  let spHudEl = null, spHudPhrase = "", spHudDwell = 0;
  function spiderPhrase() {
    // The readout used to keep describing a spider that had been carried out
    // ("Still. Spiders spend most of their lives…") for the rest of the rung.
    if (spiderReleased) return t("sp.gone", "Gone — carried outside. The room is just a room again.");
    if (jarPhase === "held" || (jarPhase === "lifting" && jar && !jar.userData.staleMiss)) return t("sp.jarred", "Under the glass. Contained, and calm.");
    if (pounceState === "coiling")   return t("sp.coiling", "It crouched — it's winding up. Hold still, or give it a step.");
    if (pounceState === "pouncing")  return t("sp.pouncing", "A hop — startle, not attack. It's already over.");
    if (pounceState === "recoiling") return t("sp.recoiling", "Retreating. It wants distance more than you do.");
    if (skitterState === "skittering") return t("sp.skitter", "Moving — relocating, not approaching. Darting is how small things stay alive.");
    if (skitterState === "pausing")  return t("sp.pausing", "Paused mid-run. It re-reads the room between bursts.");
    return t("sp.still", "Still. Spiders spend most of their lives exactly like this.");
  }
  const GUARD = B.guardDist ?? 0.35;
  // How close a jump may land (XZ from your eye on the floor rungs, 3D on the
  // wall): short of your shoes, and short of your face.
  const LENS_FLOOR = onWall ? 0.5 : 0.42;
  // Clearances sized to the animal (half its leg span is 0.45–0.85 m here):
  // the player collider, how close a dart may end, and how near a wall the
  // body may go, so the legs don't pass through feet, walls or the jar.
  const spHalfSpan = spiderSpan / 2;
  const spObstR = Math.max(0.26, spiderSpan * 0.3);   // your feet never land on it
  const spWallGap = Math.max(0.12, spHalfSpan * 0.85);
  // Jar big enough to hold what it catches: the 0.40 m rim was narrower than
  // every rung's half-span, so legs poked through the glass while "contained".
  // (A drinking glass, now the spider is spider-sized.)
  const jarScale = Math.max(0.16, (spHalfSpan + 0.035) / 0.42);

  // ----- Glass jar (humane catch) -----
  // The user can lower a real glass jar over the spider. The spider stays
  // calm inside it (no panic-fighting). After 2 seconds, the jar lifts
  // and the spider has been "released outside" — it's gone, the user wins.
  // Clicking the floor near the spider also lowers the jar there.
  let jarMode = false;
  let jar = null;
  // Set once the spider has been jarred and carried outside. It is parked at
  // y = −50, but its x/z stayed live in the obstacle list, the fear inputs,
  // the hints and the jar button — an invisible 0.6 m collider at the room's
  // origin and a fear trace still tracking "the spider" after it had gone.
  let spiderReleased = false;
  let jarPhase = "idle"; // idle | falling | held | lifting
  let jarLifeT = 0;
  function buildJar() {
    const g = new THREE.Group();
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.40, 0.85, 24, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xc8e6f0, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
        roughness: 0.05, metalness: 0.5,
      })
    );
    glass.position.y = 0.42;
    g.add(glass);
    const top = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 24),
      new THREE.MeshStandardMaterial({
        color: 0xc8e6f0, transparent: true, opacity: 0.30, side: THREE.DoubleSide,
        roughness: 0.05, metalness: 0.5,
      })
    );
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.85;
    g.add(top);
    // Wider, not longer: the spider is flat, so only the rim has to grow. A
    // uniform scale made the apex rung's jar 1.9 m long, its glass end 0.7 m
    // from your eye — the whole view washed out through it.
    g.scale.set(jarScale, 1, jarScale);
    return g;
  }
  // Where the jar starts and rests. Floor rungs: open end down, lowered from
  // just under the ceiling (it used to start at y = 4, 2.4 m above the 1.6 m
  // ceiling, and lift out through it too). Wall rung: laid on its side, open
  // end toward the pillar, pressed flat against the face over the spider — an
  // upright jar there stood half inside the concrete and covered only the top
  // half of the spider.
  const JAR_H = 0.85;
  function jarRest() {
    if (onWall) return { x: spider.position.x, y: spider.position.y, z: (B.wallZ ?? -2.6) + 0.004 };
    return { x: spider.position.x, y: -0.95, z: spider.position.z };
  }
  function placeJar(rest, k) {   // k: 0 = start (away), 1 = seated
    const e = 1 - Math.pow(1 - k, 2);
    if (onWall) {
      jar.rotation.set(Math.PI / 2, 0, 0);    // local +y (open → closed) → world +z
      jar.position.set(rest.x, rest.y, rest.z + (1 - e) * 1.2);
    } else {
      const yStart = ROOM.ceilY - JAR_H - 0.03;
      jar.rotation.set(0, 0, 0);
      jar.position.set(rest.x, yStart + (rest.y - yStart) * e, rest.z);
    }
  }
  function dropJarAt(x, z) {
    if (jarPhase !== "idle") return;
    // A catch mid-pounce MISSES (the spider has left its spot) — timing the
    // jar between pounces is the skill, parallel to the dog's coil-cancel.
    const staleMiss = pounceState === "pouncing";
    if (!jar) { jar = buildJar(); scene.add(jar); }
    jar.userData.staleMiss = staleMiss;
    // On the wall rung the spider is at eye level (y≈0.5), so the jar must come
    // to REST at the spider's height and press it against the wall — dropping to
    // the floor "caught" a spider a metre and a half above the empty glass.
    const rest = jarRest();
    if (!onWall) { rest.x = x; rest.z = z; }
    jar.userData.rest = rest;
    placeJar(rest, 0);
    jarPhase = "falling";
    jarLifeT = 0;
    // The spider sees it coming — a rear-up startle (the rig's Jump clip)
    // right before the glass lands. A creature that REACTS feels real.
    const pp = spider.userData.parts;
    if (pp && pp.play && spider.position.y > -10) {
      pp.play("Jump", 0.06, { once: true });
      spiderCtrl.pounceRear(0.6);
      const A = window.PhobiaAudio;
      if (A && A.chitinTik) try { A.chitinTik({ x: spider.position.x, y: spider.position.y, z: spider.position.z }, { intensity: 0.6 }); } catch {}
      if (window.PhobiaFear) window.PhobiaFear.pulseEvent(0.25);
    }
  }

  // ----- Click-on-spider / click-on-floor (mouse / touch) -----
  // When in "jar mode" (the user clicked the Glass jar button) the next
  // click drops the jar. Otherwise click on the spider gently nudges it
  // away (the original brush behaviour, kept as a fallback).
  const spRaycaster = new THREE.Raycaster();
  const spMouse = new THREE.Vector2();
  let spCanvasDom = null;
  function spPickWorld(clientX, clientY, dom) {
    const rect = dom.getBoundingClientRect();
    spMouse.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
    spMouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    spRaycaster.setFromCamera(spMouse, camera);
    // The dust motes are a THREE.Points cloud between you and the spider on
    // most rungs, and the default Points threshold is a whole metre: the first
    // hit was a mote, so a click on the spider read as a click on the floor
    // (and in jar mode dropped the glass at the mote — "It moved"). The
    // third-person avatar (noPick) stood in the way on rungs 1–3 too. Same
    // filter as the dog scene: meshes only, noPick honoured up the chain.
    spRaycaster.params.Points = { threshold: 0.001 };
    const pickable = (o) => { for (let q = o; q; q = q.parent) if (q.userData && q.userData.noPick) return false; return true; };
    return spRaycaster.intersectObject(scene, true).find(h => h.object.isMesh && !h.object.isSprite && pickable(h.object)) || null;
  }
  let spDownX = 0, spDownY = 0, spDownT = 0, spDownPid = -1;
  function onSpDown(e) {
    spDownX = e.clientX; spDownY = e.clientY;
    spDownT = performance.now(); spDownPid = e.pointerId;
  }
  function onSpUp(e) {
    if (e.pointerId !== spDownPid) return;
    // Under pointer lock the click aims at the crosshair (canvas centre).
    const locked = !!(spiderControls && spiderControls.isPointerLocked && spiderControls.isPointerLocked());
    if (spiderControls && spiderControls.wasJustLocked && spiderControls.wasJustLocked()) return;
    const dx = e.clientX - spDownX, dy = e.clientY - spDownY;
    // A fingertip wobbles 8–15 px and a nervous tap is slow — the dog scene's
    // touch forgiveness, so the phone build can actually catch the spider.
    const touch = e.pointerType === "touch" || IS_COARSE_POINTER;
    if (!locked && (Math.hypot(dx, dy) > (touch ? 16 : 6) || performance.now() - spDownT > (touch ? 600 : 350))) return;
    const rect = spCanvasDom.getBoundingClientRect();
    const px = locked ? rect.left + rect.width / 2 : e.clientX;
    const py = locked ? rect.top + rect.height / 2 : e.clientY;
    const hit = spPickWorld(px, py, spCanvasDom);
    if (!hit) return;
    // Drop the jar over wherever the user clicked (preferring the spider)
    let p = hit.object, hitSpider = false;
    while (p) { if (p === spider) { hitSpider = true; break; } p = p.parent; }
    if (jarMode || hitSpider) {
      const tx = hitSpider ? spider.position.x : hit.point.x;
      const tz = hitSpider ? spider.position.z : hit.point.z;
      dropJarAt(tx, tz);
      if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.s.jarDown", "Jar down. It's contained. Slow breath."));
      jarMode = false;
    }
  }
  function bindSpiderClicks() {
    if (spCanvasDom) return;
    spCanvasDom = document.querySelector("#stage canvas");
    if (!spCanvasDom) return;
    spCanvasDom.addEventListener("pointerdown", onSpDown);
    spCanvasDom.addEventListener("pointerup", onSpUp);
  }
  sceneTimers.push(setTimeout(bindSpiderClicks, 60));

  function wireSpiderCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="spiders"]');
    const fb = bar && bar.querySelector('[data-cmd="focus"]');
    if (fb && !fb.dataset.holdWired) {
      fb.dataset.holdWired = "1";
      let holdT = 0;
      fb.addEventListener("pointerdown", () => { holdT = setTimeout(() => { spZoomHeld = true; }, 220); sceneTimers.push(holdT); });
      const up = () => { clearTimeout(holdT); setTimeout(() => { spZoomHeld = false; }, 0); };
      fb.addEventListener("pointerup", up); fb.addEventListener("pointerleave", up); fb.addEventListener("pointercancel", up);
    }
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = spiderControls; if (!c && btn.dataset.cmd !== "jar") return;
        switch (btn.dataset.cmd) {
          case "closer":
            c.position.z = Math.max(c.opts.bounds.minZ + 0.2, c.position.z - 1.0);
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.s.closer", "Closer. It is still. You are still."));
            break;
          case "back":
            c.position.z = Math.min(c.opts.bounds.maxZ - 0.2, c.position.z + 1.0);
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.s.back", "Stepped back. Notice the relief. Then notice it pass."));
            break;
          case "focus": {
            spZoomHeld = false;
            const dx = spider.position.x - c.position.x;
            const dz = spider.position.z - c.position.z;
            const dy = spider.position.y - c.position.y;
            // Face the spider: camera forward is (-sin yaw,-cos yaw), so the yaw
            // that looks AT a target is atan2(cam-target) = atan2(-dx,-dz).
            // atan2(dx,dz) aimed 180 deg the wrong way (turned AWAY from it).
            // Yaw is unbounded, so aim at the NEAREST equivalent of the target
            // (the raw difference could spin the long way round), and steer
            // through _lookTo: with lookSmoothing on, a bare c.yaw write was
            // pulled straight back to the old target by the filter.
            const fromY = c.yaw, fromP = c.pitch;
            const targetYaw = fromY + Math.atan2(Math.sin(Math.atan2(-dx, -dz) - fromY), Math.cos(Math.atan2(-dx, -dz) - fromY));
            const targetPitch = Math.atan2(dy, Math.hypot(dx, dz));
            const look = (y, pt) => { if (c._lookTo) c._lookTo(y, pt); else { c.yaw = y; c.pitch = pt; } };
            let k = 0;
            const id = setInterval(() => {
              k += 0.05;
              if (k >= 1) { look(targetYaw, targetPitch); clearInterval(id); return; }
              const e2 = k * k * (3 - 2 * k);
              look(fromY + (targetYaw - fromY) * e2, fromP + (targetPitch - fromP) * e2);
            }, 16);
            sceneTimers.push(id);
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.s.look", "Look at it. Really look. The fear will rise. Then settle."));
            break;
          }
          case "jar":
            // Arms the next click to lower the jar (or drops it on the spider directly)
            if (jarPhase !== "idle" || spiderReleased) return;
            jarMode = true;
            // If they clicked the button while reasonably close, just drop directly
            if (c) {
              const dx = spider.position.x - c.position.x;
              const dz = spider.position.z - c.position.z;
              if (Math.hypot(dx, dz) < 4) {
                dropJarAt(spider.position.x, spider.position.z);
                jarMode = false;
                if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.s.jarDown", "Jar down. It's contained. Slow breath."));
              } else if (window.PhobiaVoice) {
                window.PhobiaVoice.speak(IS_COARSE_POINTER ? window.t("sc.s.tapJar", "Tap the spider to lower the jar.") : window.t("sc.s.clickJar", "Click the spider to lower the jar."));
              }
            }
            break;
        }
      };
    });
  }
  sceneTimers.push(setTimeout(wireSpiderCmds, 0));

  // The hold-completion fanfare must never fire mid-coil / mid-pounce.
  window.__holdCelebrationGate = () =>
    !B.pounce || pounceState === "idle" || pounceState === "recoiling";

  // ---- The coach: the alarm, this trial's card, reading the spider ----
  // Same learning loop as the dog realm (makeCreatureCoach): the alarm rises
  // as you close in and falls while you stay; repeated dashes habituate; the
  // trial ends when you've been close long enough AND the alarm came down.
  // Replaces the fear-weighted credit, whose "duration" input made the fear
  // CLIMB the longer you stayed.
  const SP_COACH = [
    { sizeMul: 0.50, tau: 11, hFloor: 0.30 },
    { sizeMul: 0.58, tau: 12, hFloor: 0.32 },
    { sizeMul: 0.70, tau: 14, hFloor: 0.34 },
    { sizeMul: 0.80, tau: 16, hFloor: 0.36 },
    { sizeMul: 0.90, tau: 18, hFloor: 0.38 },
  ][rung];
  const spZone = B.inZoneDist ?? 3.0;
  const spZoneTxt = spZone.toFixed(1).replace(/\.0$/, "");
  const spName = window.t("coach.sp.name", "the spider");
  const spSkill = [
    { id: "near",       icon: "→", text: window.tf("dc.sp.gNear", "Get within {m} m of the spider", { m: spZoneTxt }) },
    { id: "stillMove",  icon: "🧍", text: window.t("dc.sp.gStill", "Stay put while it moves") },
    { id: "dashHeld",   icon: "💨", text: window.t("dc.sp.gDash", "Stay close through a dash your way") },
    { id: "pounceHeld", icon: "»", text: window.t("dc.sp.gJump", "Stay put through a jump") },
    { id: "pounceHeld", icon: "»", text: window.t("dc.sp.gWall", "Stay put when it jumps off the wall") },
  ][rung];
  const spCoach = makeCreatureCoach({
    kit: creatureKit("spiders"),
    stage: document.getElementById("stage"),
    levelIdx, intensity, dogName: spName, title: window.t("creature.spider", "House spider"),
    inZoneDist: spZone, sizeMul: SP_COACH.sizeMul, tau: SP_COACH.tau, hFloor: SP_COACH.hFloor,
    nearD: 0.3, farSpan: 2.7,
    minHold: level.minHold || 12,
    coarse: IS_COARSE_POINTER,
    expect: (() => { const e = window.__pendingExpect; return (e && e.phobia === "spiders" && e.level === levelIdx) ? e : null; })(),
    goals: [
      spSkill,
      { id: "read", icon: "👁", need: rung < 2 ? 2 : 3, text: window.t("dc.sp.gRead", "Read the spider's body language") },
      { id: "settle", icon: "〰", required: true, text: window.t("dc.gSettle", "Stay until your alarm settles") },
    ],
  });
  spCoach.setFoot(window.t("mood." + temper.id, "seems " + temper.id + " today"));
  spCoach.teach("zoom", IS_COARSE_POINTER
    ? window.t("dc.sp.tZoomM", "It's a real spider — small. <b>Hold 🔍</b> to lean in and look closer.")
    : window.t("dc.sp.tZoom", "It's a real spider — small. <b>Hold Z</b> (or hold 🔍) to lean in and look closer."), 7000);
  // Look closer: a held lean-in — the field of view narrows onto it. Tap 🔍
  // still turns you to face it.
  let spZoomHeld = false, spBaseFov = null, spFovMode = null;
  const spZoomKey = (e) => {
    if (e.code !== "KeyZ" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    spZoomHeld = e.type === "keydown";
  };
  window.addEventListener("keydown", spZoomKey);
  window.addEventListener("keyup", spZoomKey);
  window.__coach = spCoach;
  let spLastDist = 99;
  if (window.PhobiaFear && window.PhobiaFear.setDirect) {
    window.PhobiaFear.setDirect(() => spCoach.target(), (s) => spCoach.pulse(s, "event", spLastDist));
  }
  // Carried outside under the jar: the spider is gone, and so is the thing to
  // stay near — the trial finishes on time in the cellar, not on the wave.
  const spPolicy = {
    engaged: () => spiderReleased || spCoach.holdPolicy.engaged(),
    ready: (sec, mh) => spiderReleased || spCoach.holdPolicy.ready(sec, mh),
    label: (sec, mh, eng, ready) => spiderReleased
      ? (sec < mh ? { label: window.tf("dc.sp.hGone", "{s} / {n}s — it's outside now. Stay a moment in the cellar.", { s: sec, n: mh }), pill: `${sec}/${mh}s` } : null)
      : spCoach.holdPolicy.label(sec, mh, eng, ready),
    progress: (sec, mh) => spiderReleased ? Math.min(1, sec / mh) : spCoach.holdPolicy.progress(sec, mh),
  };
  window.__holdPolicy = spPolicy;
  // Body language the player can read (never over the tour or countdown).
  function spSignal(id) {
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return false;
    return spCoach.signal(id, { onScreen: spOnScreen, dist: spLastDist });
  }
  function spPulse(strength, kind, dist) { spCoach.pulse(strength, kind, dist); }
  let spOnScreen = false, spStillT = 0, spAlertPrev = 0, spFlickPrev = 0, spDartToward = 0;
  let spToward = 0, spPrevSX = null, spPrevSZ = 0, spMovedT = 0, spPlayerSpeed = 0, spPrevPX = null, spPrevPZ = 0;
  const spSubj = { x: 0, z: 0 };
  const _spV = new THREE.Vector3();

  return {
    controls: {
      mode: "walkable",
      // Spawn near the doorway, well back from the spider. Approach is the
      // exposure. Gentle rungs open in third-person (watch your body cross
      // the cellar); the close/apex rungs lock first-person for the intimate,
      // in-your-space framing arachnophobia lives in.
      initialPos: [0, 0.62, 4.0],
      initialYaw: 0,
      initialPitch: spiderPitch * 0.4,
      bounds: { minX: -3.6, maxX: 3.6, minZ: minZ, maxZ: 5.2 },
      speed: 1.4,
      lookSpeed: 0.0035,
      // First person on every rung now the spider is its real size: from
      // behind your own back it would be a speck.
      preferredCameraMode: "fp",
      cameraModeLocked: rung === 4 ? "fp" : undefined,
      tpShoulder: 0.6, tpDistance: 3.6, tpHeight: 0.5,
      // Embodiment opt-ins (mirror dogs): captured-mouse look, smoothing, and
      // fear-modulated gait (approach slows/trembles at high fear, retreat never).
      pointerLock: true,
      lookSmoothing: 10,
      fearGait: true,
    },
    collisionObjects: [backWall, leftWall, rightWall, ceiling],
    bloom: { strength: 0.16, threshold: 0.97 },   // dim room — only the filament blooms
    fearGradePass: true,
    cameraFar: 30,
    hands: { skinColor: 0xc99a72, sleeveColor: 0x2b2e38 },
    messageQueue: true,
    surface: "hard",   // concrete cellar floor
    groundY: -1,       // feet + eye line anchored to the floor
    interact(controls) {
      if (scriptedGesture && performance.now() < scriptedGestureUntil) {
        return { gesture: scriptedGesture, hint: "" };
      }
      if (jarPhase !== "idle") {
        return { gesture: "rest", hint: window.t("sc.s.hintContained", "contained — slow breath, it releases in a moment") };
      }
      if (spiderReleased) return { gesture: "rest", hint: "" };
      if (controls) {
        const dx = spider.position.x - controls.position.x;
        const dz = spider.position.z - controls.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 4) return { gesture: "rest", hint: "" };
        // During a dart / close pass, prefer a calming ground-oriented hint
        // over a raw tooltip so the UX doesn't read as a game prompt mid-spike.
        if (pounceState !== "idle" || (skitterState === "skittering" && dist < 1.6)) {
          return { gesture: "rest", hint: window.t("sc.s.hintFast", "it's fast — you can step back, or jar it") };
        }
        return {
          gesture: "rest",
          hint: IS_COARSE_POINTER
            ? (jarMode ? window.t("sc.s.hintJarT", "tap the spider to lower the jar") : window.t("sc.s.hintCatchT", "tap the spider to catch it under a jar"))
            : (jarMode ? window.t("sc.s.hintJar", "click the spider to lower the jar") : window.t("sc.s.hintCatch", "click the spider to catch it under a jar")),
        };
      }
      return { gesture: "rest" };
    },
    // Generic click — pickWorld already handles the rich behaviour. No-op
    // here so we don't double-trigger the jar drop.
    onClick(controls) {},
    update(t, controls, dt) {
      if (controls) spiderControls = controls;
      const d = dt || 0.016;
      elapsed += d;
      const A = window.PhobiaAudio;
      const loose = jarPhase === "idle" && spider.position.y > -10;
      // No-overlap collider (shrunk during a pounce so retreat stays possible).
      // Sized to the animal: 0.3 m was smaller than even the rung-1 spider's
      // body, so darts ended with its legs through your feet.
      if (controls && controls.setObstacles && jarPhase === "idle" && !spiderReleased) {
        controls.setObstacles([{ x: spider.position.x, z: spider.position.z, r: pounceState === "pouncing" ? 0.15 : spObstR }]);
      } else if (controls && controls.setObstacles) {
        controls.setObstacles(null);
      }

      // ---- Feed the fear model (honest, non-inverted gaze) ----
      if (controls && window.PhobiaFear && spiderReleased) {
        // Gone: nothing left to be near or to look at. The duration term
        // decays on its own (engaged → false).
        window.PhobiaFear.setInput("proximity", 0);
        window.PhobiaFear.setInput("gaze", 0);
        engageDur = Math.max(0, engageDur - d * 0.35);
        window.PhobiaFear.setInput("duration", Math.max(engageDur / 24, arousalFloor));
      } else if (controls && window.PhobiaFear) {
        const SP = spider.position, CP = controls.position;
        const dxs = CP.x - SP.x, dzs = CP.z - SP.z;   // camera-minus-target: yaw==dirTo when FACING it (matches dog convention)
        const distS = Math.hypot(dxs, dzs);
        const closeness = clamp01(1 - (distS - 1.0) / 4.0);
        window.PhobiaFear.setInput("proximity", closeness * (B.fearMul ?? 0.6));
        // Gaze: facing the spider yields high gaze (yaw + look-elevation).
        const dirTo = Math.atan2(dxs, dzs);
        const yawDelta = angleGap(controls.yaw, dirTo);
        const yawAlign = Math.max(0, 1 - yawDelta / 1.0);
        const needPitch = Math.atan2(SP.y - CP.y, Math.max(0.2, Math.hypot(dxs, dzs)));
        const pitchAlign = Math.max(0, 1 - Math.abs(controls.pitch - needPitch) / 0.7);
        const gazeAlign = yawAlign * (0.5 + 0.5 * pitchAlign);
        window.PhobiaFear.setInput("gaze", gazeAlign * (B.fearMul ?? 0.6) * 0.8);
        // Duration: sustained engagement + a post-pounce arousal floor.
        const engaged = distS < (B.inZoneDist ?? 3.0) || jarPhase !== "idle" || (intensity === "apex" && yawAlign > 0.35);
        engageDur = Math.max(0, Math.min(24, engageDur + (engaged ? d : -d * 0.35)));
        arousalFloor = Math.max(0, arousalFloor - d / 12);
        window.PhobiaFear._duration = engageDur;
        window.PhobiaFear.setInput("duration", Math.max(engageDur / 24, arousalFloor));
        const isAway = distS > (B.inZoneDist ?? 3.0) + 1.5;
        window.PhobiaFear.bumpAvoidance(d, isAway && engageDur > 2);
        if (window.PhobiaNarrator) {
          window.PhobiaNarrator.tick("spiders", {
            minGap: 30,
            threat: intensity === "apex" || pounceState === "coiling" || pounceState === "pouncing",
          });
        }
      }

      // ---- Fear-grade the room (bulb dims/cools, fill drains, bg darkens) ----
      const fear01 = (window.PhobiaFear && window.PhobiaFear.get) ? clamp01(window.PhobiaFear.get() / 100) : 0;
      {
        const target = fear01 * (window.__rungHoldComplete ? 0.35 : 1);
        _fearGrade += (target - _fearGrade) * Math.min(1, d * 2.5);
        const g = _fearGrade;
        bulbLight.intensity = lightBase.bulbI * (1 - g * 0.45);
        bulbLight.color.setHex(lightBase.bulbC).lerp(_coolKey, g * 0.6);
        key.intensity = lightBase.keyI * (1 + g * 0.15);
        key.color.setHex(lightBase.keyC).lerp(_coolKey, g * 0.7);
        fill.intensity = lightBase.fillI * (1 - g * 0.55);
        scene.background.setHex(mood.bg).lerp(_coolBg, g * 0.6);
        // Bulb flicker + sway (motivated, grows with dread)
        const flick = 1 - (0.03 + g * 0.10) * (0.5 + 0.5 * Math.sin(t * 37.0) * Math.sin(t * 13.3));
        bulbLight.intensity *= Math.max(0.55, flick);
        if (bulb.material) bulb.material.emissiveIntensity = 2.4 * Math.max(0.5, flick);
        bulb.position.set(bulbBase.x + Math.sin(t * 0.7) * 0.05, bulbBase.y, bulbBase.z + Math.cos(t * 0.55) * 0.04);
        bulbLight.position.copy(bulb.position);
      }
      // Spider rim tracks behind the spider at leg height.
      if (loose && controls) {
        const cpos = controls.position;
        const rdx = spider.position.x - cpos.x, rdz = spider.position.z - cpos.z;
        const rdist = Math.hypot(rdx, rdz) || 1;
        spiderRim.position.set(spider.position.x + (rdx / rdist) * 0.7, spider.position.y + 0.25, spider.position.z + (rdz / rdist) * 0.7);
        const close = clamp01((4 - rdist) / 3);
        spiderRim.intensity = 0.35 + close * 1.1 + _fearGrade * 0.6;
      } else {
        spiderRim.intensity = 0;
      }
      // Dust motes drift.
      for (let i = 0; i < dustData.length; i++) {
        const dd = dustData[i];
        // The wobble was a per-FRAME 1 mm — twice the drift at 120 Hz.
        dustPos[i * 3] += dd.vx * d + Math.sin(t + dd.phaseX) * 0.06 * d;
        dustPos[i * 3 + 1] += dd.vy * d;
        dustPos[i * 3 + 2] += dd.vz * d + Math.cos(t + dd.phaseY) * 0.06 * d;
        if (dustPos[i * 3 + 1] < -0.95) spawnMote(i);
      }
      dustAttr.needsUpdate = true;

      // ---- Glass jar physics ----
      if (jar && jarPhase === "falling") {
        jarLifeT += d;
        const k = Math.min(1, jarLifeT / 0.5);
        placeJar(jar.userData.rest, k);
        if (k >= 1) {
          jarPhase = "held"; jarLifeT = 0;
          // A catch that landed while the spider fled MISSES — flag it so the
          // lift path knows not to remove the spider (it wasn't caught). Uses a
          // full 3D distance so the glass actually encloses the spider (the wall
          // rung sits it off the floor).
          const rest = jar.userData.rest;
          const off = onWall ? Math.hypot(rest.x - spider.position.x, rest.y - spider.position.y)
                             : Math.hypot(rest.x - spider.position.x, rest.z - spider.position.z);
          if (jar.userData.staleMiss || off > 0.6 * jarScale) {
            jar.userData.staleMiss = true;
            jarPhase = "lifting"; jarLifeT = 0;
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.s.moved", "It moved — try again when it settles."));
          } else {
            if (!onWall) { spider.position.x = rest.x; spider.position.z = rest.z; }
            pounceState = "idle";
            // Under the glass it settles — breath and a faint twitch, never a
            // frozen prop (SpiderController.calm), back on its Idle clip.
            if (spider.userData.parts && spider.userData.parts.play) spider.userData.parts.play("Idle", 0.25);
          }
        }
      } else if (jar && jarPhase === "held") {
        jarLifeT += d;
        if (jarLifeT > 2.0) {
          jarPhase = "lifting"; jarLifeT = 0;
          if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.s.released", "Released outside. You did that calmly."));
          // A settled catch is a legitimate completion route — route it through
          // the same honest hold path (the fanfare still waits for the gate).
          window.__rungHoldComplete = true;
          if (window.PhobiaFear) window.PhobiaFear.pulseEvent(0.15);
        }
      } else if (jar && jarPhase === "lifting") {
        jarLifeT += d;
        const k = Math.min(1, jarLifeT / 0.6);
        placeJar(jar.userData.rest, 1 - k);
        // Only shrink the spider on a real catch (it's "taken outside"); a miss
        // leaves it in place.
        if (!jar.userData.staleMiss) spider.scale.setScalar(1 - k);
        if (k >= 1) {
          scene.remove(jar);
          jar.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
          const missed = jar.userData.staleMiss;
          jar = null; jarPhase = "idle";
          if (missed) { spider.scale.setScalar(1); if (spider.userData.parts && spider.userData.parts.play) spider.userData.parts.play("Idle", 0.2); }
          else { spider.position.set(0, -50, 0); spiderReleased = true; }   // released — gone for the rung
        }
      }

      const p = spider.userData.parts;
      if (p && p.mixer) {
        const dxp = controls ? controls.position.x - spider.position.x : 0;
        const dzp = controls ? controls.position.z - spider.position.z : 0;
        const distP = Math.hypot(dxp, dzp) || 0.0001;

        // Player's OWN radial approach speed (the snake's calc): a rush and a
        // careful creep must not read the same to the flagship creature.
        if (controls && d > 0) {
          if (spPrevPlayer) {
            const pvx = (controls.position.x - spPrevPlayer.x) / d;
            const pvz = (controls.position.z - spPrevPlayer.z) / d;
            const inst = (pvx * -dxp + pvz * -dzp) / distP;   // + = closing on the spider
            spApproachSpeed += (inst - spApproachSpeed) * Math.min(1, d * 6);
          } else spPrevPlayer = { x: 0, z: 0 };
          spPrevPlayer.x = controls.position.x; spPrevPlayer.z = controls.position.z;
        }

        // ---- Startle: a rush triggers an immediate BACKWARD escape dart ----
        // (a spider's fastest recorded locomotion is the backward escape). It
        // keeps facing you while it shoots away — accurate, and more relieving
        // than a turn-and-run.
        startleCd = Math.max(0, startleCd - d);
        if (B.skitter && loose && controls && pounceState === "idle" && startleCd <= 0
            && elapsed > (B.firstSkitterAt ?? 0) && spApproachSpeed > 0.7 && distP < 1.8) {
          startleCd = 2.2 + Math.random() * 1.5;
          skitterState = "skittering"; skitterT = 0;
          skitterDur = 0.30 + Math.random() * 0.12; skitterSpeedMul = 1.7;
          let vx = -dxp / distP + (Math.random() - 0.5) * 0.5, vz = -dzp / distP;
          const m = Math.hypot(vx, vz) || 1;
          skitterDir = { x: vx / m, z: vz / m };
          skitterTargetYaw = Math.atan2(dxp, dzp);   // face the player; retreat backward
          if (p.play) p.play("Walk", 0.05);
          if (A && A.skitterTicks) try { A.skitterTicks({ x: spider.position.x, y: spider.position.y + 0.1, z: spider.position.z }, { duration: skitterDur, intensity: 0.7, legRate: 55 }); } catch {}
          spPulse(0.3, "startle", distP);
          spDartToward = -1;
          spSignal("dart");
        }

        // ---- Ambient skitter machine (data-driven, suppressed during a pounce) ----
        if (B.skitter && loose && controls && pounceState === "idle" && elapsed > (B.firstSkitterAt ?? 0)) {
          skitterT += d;
          const esc = B.escalate ? clamp01((elapsed - (B.firstSkitterAt ?? 0)) / (B.settleAfter ?? 45)) : 0;
          const baseSpd = (B.skitterSpeed ?? 1.2) * (1 + 0.4 * esc);
          const evr = B.skitterEvery ?? [2.5, 4.5];
          if (skitterState !== "skittering") dartClock += d;
          if (skitterState === "lurking") {
            // Darts run on their own clock. The shuffle used to reset the one
            // shared timer, so a dart only ever fired when the shuffle delay
            // happened to exceed 0.8 × the dart gap: with you further than
            // 3.5 m, rung 2 never darted and rung 3 almost never did.
            if (skitterT > microShuffleAt && dartClock < nextSkitter * 0.8) {
              skitterState = "skittering"; skitterT = 0;
              skitterDur = 0.10 + Math.random() * 0.10; skitterSpeedMul = 0.3;
              const ang = Math.random() * Math.PI * 2;
              skitterDir = { x: Math.sin(ang), z: Math.cos(ang) };
              skitterTargetYaw = ang;
              microShuffleAt = 1.5 + Math.random() * 2.5;
              spDartToward = 0;
              if (Math.random() < 0.3) spSignal("wander");
              if (p.play) p.play("Walk", 0.06);
              if (A && A.skitterTicks) try { A.skitterTicks({ x: spider.position.x, y: spider.position.y + 0.1, z: spider.position.z }, { duration: 0.10, intensity: 0.22, legRate: 26 }); } catch {}
            } else if (dartClock > nextSkitter) {
              skitterState = "skittering"; skitterT = 0; dartClock = 0;
              skitterDur = 0.22 + Math.random() * 0.4; skitterSpeedMul = 1;
              // Heading = approachBias·(toward player) + jag·(sideways) + wander.
              const bias = B.approachBias ?? 0;
              const jag = (Math.random() - 0.5) * 2 * (B.jagAmt ?? 1.0);
              const wander = Math.random() * Math.PI * 2;
              let vx = bias * (dxp / distP) + jag + (1 - bias) * Math.sin(wander) * 0.5;
              let vz = bias * (dzp / distP) + (1 - bias) * Math.cos(wander) * 0.5;
              // Saltatory coupling: a short pause continues the previous
              // displacement; only a long pause is a reorientation bout (turn
              // angle grows with pause length — the measured statistic).
              // skitterT was just reset; the pause length is nextSkitter.
              const keepK = Math.max(0, 1 - nextSkitter / 2.5) * 0.65;
              vx = vx * (1 - keepK) + skitterDir.x * keepK;
              vz = vz * (1 - keepK) + skitterDir.z * keepK;
              // Non-pounce rungs stop short of the player (guardDist). Pounce
              // rungs hold off just outside the pounce's own minimum range: once
              // the darts actually fired on cadence, the approach bias walked the
              // spider inside GUARD·1.2 and parked it there, where the pounce can
              // never trigger (0 pounces in 80 s at rung 4, measured).
              const keep = B.pounce ? GUARD * 1.2 + 0.3 : (B.guardDist ?? 1.2) + 0.4;
              if (distP < keep) { vx -= (dxp / distP) * 0.8; vz -= (dzp / distP) * 0.8; }
              const m = Math.hypot(vx, vz) || 1;
              skitterDir = { x: vx / m, z: vz / m };
              skitterTargetYaw = Math.atan2(skitterDir.x, skitterDir.z);
              // A dash your way is the trigger that habituates (each one hits
              // softer); a dash away is the evidence it's going somewhere else.
              spDartToward = (skitterDir.x * dxp + skitterDir.z * dzp) / distP;
              if (spDartToward > 0.35 && distP < 6) {
                spPulse(0.16 + 0.3 * clamp01(1 - distP / 3.2), "dart", distP);
                spSignal("dart");
              } else if (spDartToward < -0.3) spSignal("turnAway");
              else if (Math.random() < 0.5) spSignal("dart");
              if (p.play) p.play("Walk", 0.06);
              if (A && A.bristleRustle) try { A.bristleRustle({ x: spider.position.x, y: spider.position.y + 0.1, z: spider.position.z }, { intensity: 0.5 + size * 0.4 }); } catch {}
              if (A && A.skitterTicks) try { A.skitterTicks({ x: spider.position.x, y: spider.position.y + 0.1, z: spider.position.z }, { duration: skitterDur, intensity: 0.5 + size * 0.5, legRate: 34 + Math.min(26, baseSpd * 12) }); } catch {}
            }
          } else if (skitterState === "skittering") {
            const speed = baseSpd * skitterSpeedMul;
            if (onWall) {
              // Climb within a wall patch: move along x + up/down y, not z.
              spider.position.x += skitterDir.x * speed * d;
              spider.position.y += (skitterDir.z) * speed * d * 0.5;
              spider.position.x = Math.max(homeAnchor.x - (B.homeRadius ?? 0.5), Math.min(homeAnchor.x + (B.homeRadius ?? 0.5), spider.position.x));
              // Keep the whole animal on the face: −0.4…1.0 let a 1.7 m spider's
              // legs through the floor and the 1.6 m ceiling.
              spider.position.y = Math.max(-1 + spHalfSpan * 0.9, Math.min(ROOM.ceilY - spHalfSpan * 0.9, spider.position.y));
            } else if (distP > Math.max(spObstR + 0.32, B.pounce ? GUARD * 1.2 + 0.05 : 0)
                       || skitterDir.x * dxp + skitterDir.z * dzp < 0) {   // a dart AWAY is always allowed
              spider.position.x += skitterDir.x * speed * d;
              spider.position.z += skitterDir.z * speed * d;
              // Keep home-zone rungs near their spot.
              if (B.homeRadius != null) {
                const hdx = spider.position.x - homeAnchor.x, hdz = spider.position.z - homeAnchor.z;
                const hr = Math.hypot(hdx, hdz);
                if (hr > B.homeRadius) { spider.position.x = homeAnchor.x + hdx / hr * B.homeRadius; spider.position.z = homeAnchor.z + hdz / hr * B.homeRadius; }
              }
            }
            if (skitterT > skitterDur) {
              skitterState = "pausing"; skitterT = 0;
              // Rolled ONCE: re-rolling `0.3 + rand·0.7` every frame made the
              // pause a race against a fresh die each tick (median 0.43 s at
              // 60 Hz, shorter at 120 Hz) instead of uniform 0.3–1.0 s.
              pauseDur = 0.3 + Math.random() * 0.7;
              if (p.play) p.play("Idle", 0.12);
              // Evidence, not a second spike: a dash that came your way and
              // ended close is "it ran at me" — and it stopped.
              if (skitterSpeedMul >= 1 && spDartToward > 0.35 && distP < 2.2) {
                spCoach.note("run");
                if (rung === 2 && spCoach.engaged) spCoach.goalDone("dashHeld");
              }
            }
          } else {   // pausing
            if (skitterT > pauseDur) {
              skitterState = "lurking"; skitterT = 0;
              microShuffleAt = 1.2 + Math.random() * 2.2;
              nextSkitter = (distP > 3.5 ? evr[1] : evr[0]) + Math.random() * (evr[1] - evr[0]);
            }
          }
        }

        // ---- Orientation: dart heading, or slowly FACE the player at rest ----
        if (loose && !onWall) {
          if (skitterState === "skittering") {
            let dy = skitterTargetYaw - spider.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            spider.rotation.y += dy * Math.min(1, d * 14);
          } else if (controls && distP < 5.0) {
            const faceYaw = Math.atan2(dxp, dzp);
            const k = pounceState === "idle" ? d * 2.5 : d * 9;
            let dy = faceYaw - spider.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            spider.rotation.y += dy * Math.min(1, k);
          }
          spider.position.x = Math.max(ROOM.x0 + spWallGap, Math.min(ROOM.x1 - spWallGap, spider.position.x));
          spider.position.z = Math.max(ROOM.z0 + spWallGap, Math.min(2.5, spider.position.z));
        } else if (loose && onWall) {
          // Heading spin about the wall normal (world +z). Spin 0 is the
          // head-up watching pose; while climbing, the head (−sin s, cos s in
          // the face plane) swings toward the travel direction — the climb
          // moves x by dir.x and y by dir.z·0.5 — and eases back after.
          const spinTarget = (skitterState === "skittering" && pounceState === "idle")
            ? Math.atan2(-skitterDir.x, skitterDir.z * 0.5)
            : 0;
          let dsp = spinTarget - wallSpin; dsp = Math.atan2(Math.sin(dsp), Math.cos(dsp));
          wallSpin += dsp * Math.min(1, d * (skitterState === "skittering" ? 10 : 3));
          // Mid-leap it turns off the face to come at you head-first, and lies
          // back down flat on the way home.
          const detachT = pounceState === "pouncing" ? 1 : 0;
          wallDetach += (detachT - wallDetach) * Math.min(1, d * (detachT ? 14 : 4));
          _spWallQ.setFromAxisAngle(_spWallAxis, wallSpin).multiply(SPIDER_WALL_Q);
          if (wallDetach > 0.001) {
            _spFaceQ.setFromAxisAngle(_spYAxis, Math.atan2(dxp, dzp));
            _spWallQ.slerp(_spFaceQ, wallDetach);
          }
          spider.quaternion.copy(_spWallQ);
        }

        // ---- Alert posture from proximity ----
        spiderCtrl.setAlert(clamp01((1.35 - distP) / 0.9) * (pounceState === "idle" ? 1 : 0));

        // ---- Pounce machine (coil → pounce → recoil), pounce rungs only ----
        if (B.pounce && loose && controls && spider.userData.ready) {
          if (pounceState === "idle") {
            spiderCtrl.setCoil(0);
            if (elapsed > nextPounceAt && distP < (B.inZoneDist ?? 3.4) && distP > GUARD * 1.2) {
              pounceState = "coiling"; pounceT = 0; coilStartDist = distP; pounceFired = false;
              // A coil can land mid-dart; the skitter machine is frozen while it
              // runs, so a dart left "skittering" kept the Walk loop cycling in
              // place, chased its old heading through the coil (and fought the
              // pounce's own turn), and resumed on the Idle clip after the recoil.
              if (skitterState === "skittering") { skitterState = "lurking"; skitterT = 0; if (p.play) p.play("Idle", 0.1); }
              const cd = B.coilDur ?? [0.7, 1.1];
              thisCoil = cd[0] + Math.random() * (cd[1] - cd[0]);
              spPulse(0.26, "coil", distP);
              spSignal("crouch");
              if (A && A.webPluck) try { A.webPluck({ x: spider.position.x, y: spider.position.y, z: spider.position.z }, { intensity: 0.4 }); } catch {}
            }
          } else if (pounceState === "coiling") {
            pounceT += d; spiderCtrl.setCoil(1);
            // RETREAT CANCELS — real, learnable agency.
            if (distP > coilStartDist + 0.5 || distP > (B.inZoneDist ?? 3.4) + 0.6) {
              pounceState = "recoiling"; pounceT = 0; spiderCtrl.setCoil(0);
              if (!completionBeatDone) nextPounceAt = elapsed + 4 + Math.random() * 3;
              if (!retreatPraised && window.PhobiaVoice) { retreatPraised = true; window.PhobiaVoice.speak(window.t("sc.s.backedDown", "It backed down when you did. You control this distance.")); }
            } else if (pounceT > thisCoil) {
              pounceState = "pouncing"; pounceT = 0; spiderCtrl.setCoil(0);
              if (p.play) p.play("Jump", 0.05, { once: true, timeScale: 1.4 });
              arousalFloor = Math.max(arousalFloor, 0.5);
            }
          } else if (pounceState === "pouncing") {
            pounceT += d;
            const aim = Math.max(LENS_FLOOR, GUARD);
            const tx = controls.position.x - (dxp / distP) * aim;
            const tz = controls.position.z - (dzp / distP) * aim;
            const step = 5.5 * d;
            spider.position.x += (tx - spider.position.x) * Math.min(1, step / (Math.hypot(tx - spider.position.x, tz - spider.position.z) || 1));
            spider.position.z += (tz - spider.position.z) * Math.min(1, step / (Math.hypot(tx - spider.position.x, tz - spider.position.z) || 1));
            if (onWall) {
              // Parabolic hop off the wall toward eye level, then drop.
              const k = Math.min(1, pounceT / 0.35);
              spider.position.y = (-1 + (B.wallEyeY ?? 0.5) + 1.0) + Math.sin(k * Math.PI) * 0.3 - k * (B.wallEyeY ?? 0.5) * 1.4;
            }
            // Full-3D lens clamp so the front never crosses the near plane.
            const d3 = Math.hypot(spider.position.x - controls.position.x, spider.position.y - controls.position.y, spider.position.z - controls.position.z);
            if (d3 < LENS_FLOOR) {
              const s = LENS_FLOOR / d3;
              spider.position.x = controls.position.x + (spider.position.x - controls.position.x) * s;
              spider.position.z = controls.position.z + (spider.position.z - controls.position.z) * s;
            }
            let dy = Math.atan2(dxp, dzp) - spider.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
            if (!onWall) spider.rotation.y += dy * Math.min(1, d * 12);
            if (!pounceFired) {
              pounceFired = true;
              const closeness = clamp01((2.0 - distP) / 2.0);
              if (p.play) p.play("Attack", 0.04, { once: true });
              spiderCtrl.pounceRear(1);
              spPulse(0.62 + 0.2 * closeness, "pounce", distP);
              spCoach.note("jump");
              if (controls.kickShake) controls.kickShake(0.05 + 0.04 * closeness);
              // Whole-body flinch + caught breath — the TP twin of kickShake.
              try {
                if (window.PhobiaFX && window.PhobiaFX.bodyStartle) window.PhobiaFX.bodyStartle(0.6 + 0.3 * closeness);
                if (window.PhobiaAudio && window.PhobiaAudio.breathCatch) window.PhobiaAudio.breathCatch(0.55 + 0.35 * closeness);
              } catch {}
              if (controls.snapLookAt) controls.snapLookAt(spider.position.x, spider.position.y + 0.05, spider.position.z, 0.6);
              if (A && A.chitinTik) try { A.chitinTik({ x: spider.position.x, y: spider.position.y, z: spider.position.z }, { intensity: 0.9 }); } catch {}
              arousalFloor = 1.0;
              if (!holdPraised && window.PhobiaVoice) { holdPraised = true; window.PhobiaVoice.speak(window.t("sc.s.rushed", "It rushed you, and you stayed. Nothing happened. That is the fear letting go.")); }
            }
            if (pounceT > 0.35 || distP <= aim + 0.2) { pounceState = "recoiling"; pounceT = 0; }
          } else if (pounceState === "recoiling") {
            pounceT += d;
            // Target fixed at recoil entry. homeZ used to be "1.2 m back from
            // where the spider is NOW", a point that moved with it, so z kept
            // retreating at ~3.6 m/s for the whole 0.9 s whatever the distance;
            // nor did it respect the home radius. Floor: back out to the edge
            // of its zone along the line from you, inside its home and the room.
            if (!recoilTgt) {
              if (onWall) recoilTgt = { x: homeAnchor.x, y: -1 + (B.wallEyeY ?? 0.5) + 1.0, z: homeAnchor.z };
              else {
                let hx = controls.position.x - (dxp / distP) * (B.inZoneDist ?? 3.4);
                let hz = controls.position.z - (dzp / distP) * (B.inZoneDist ?? 3.4);
                if (B.homeRadius != null) {
                  const ox = hx - homeAnchor.x, oz = hz - homeAnchor.z, or = Math.hypot(ox, oz);
                  if (or > B.homeRadius) { hx = homeAnchor.x + ox / or * B.homeRadius; hz = homeAnchor.z + oz / or * B.homeRadius; }
                }
                hx = Math.max(ROOM.x0 + spWallGap, Math.min(ROOM.x1 - spWallGap, hx));
                hz = Math.max(ROOM.z0 + spWallGap, Math.min(2.5, hz));
                recoilTgt = { x: hx, y: spider.position.y, z: hz };
              }
            }
            const kr = Math.min(1, d * 5);
            spider.position.x += (recoilTgt.x - spider.position.x) * kr;
            spider.position.z += (recoilTgt.z - spider.position.z) * kr;
            if (onWall) spider.position.y += (recoilTgt.y - spider.position.y) * kr;
            if (p.play && pounceT < 0.1) p.play("Walk", 0.06);
            if (pounceT > 0.9) {
              if (Math.hypot(spider.position.x - controls.position.x, spider.position.z - controls.position.z) < 1.8) heldCycles++;
              // Still in the zone after it jumped and went back: you held it.
              if (spCoach.engaged) spCoach.goalDone("pounceHeld");
              // Back ON the face, not hovering the last few percent of an ease.
              if (onWall) spider.position.set(recoilTgt.x, recoilTgt.y, recoilTgt.z);
              recoilTgt = null;
              pounceState = "idle"; pounceT = 0;
              if (p.play) p.play("Idle", 0.15);
              const pev = B.pounceEvery ?? [10, 16];
              // Never after the completion beat: the beat is accepted during a
              // recoil, and this line used to overwrite its Infinity 0.9 s later
              // — "It settled. You outlasted it." then another pounce.
              if (!completionBeatDone) nextPounceAt = elapsed + (pev[0] + Math.random() * (pev[1] - pev[0])) * (1 + Math.min(0.6, heldCycles * 0.15));
            }
          }
        }

        // ---- Threat beacon (FP gaze fixation, "hold still while it moves") ----
        // Live while it moves or winds up — the moments the experiments and
        // the narrator's startle/settle beats are about.
        if (loose && !spiderReleased && (skitterState === "skittering" || pounceState === "coiling" || pounceState === "pouncing")) {
          _threatPos.x = spider.position.x; _threatPos.y = spider.position.y + (spiderCtrl.height || 0.05) * 0.5; _threatPos.z = spider.position.z;
          window.PhobiaThreat = _threatPos;
        } else if (window.PhobiaThreat === _threatPos) {
          window.PhobiaThreat = null;
        }

        // ---- Look closer (held) ----
        if (controls) {
          if (spBaseFov == null || controls.cameraMode !== spFovMode) { spBaseFov = camera.fov; spFovMode = controls.cameraMode; }
          const wantFov = spZoomHeld ? Math.min(spBaseFov, 26) : spBaseFov;
          if (Math.abs(camera.fov - wantFov) > 0.05) { camera.fov += (wantFov - camera.fov) * Math.min(1, d * 7); camera.updateProjectionMatrix(); }
          // (No crouch: the body doesn't crouch with the eye here, so a lowered
          // camera ended up inside your own chest when looking down.)
          // Looking closer means looking AT it: if it's already near the
          // middle of the view, ease the gaze onto it (through a narrow lens a
          // 10 cm spider otherwise slides straight out of frame).
          if (spZoomHeld && !spiderReleased && controls._lookTo) {
            camera.getWorldPosition(_spV);
            const ex = spider.position.x - _spV.x, ez = spider.position.z - _spV.z;
            const ey = spider.position.y + (spiderCtrl.height || 0.05) * 0.4 - _spV.y;
            const wantYaw = Math.atan2(-ex, -ez), wantPitch = Math.atan2(ey, Math.hypot(ex, ez));
            const dyaw = Math.atan2(Math.sin(wantYaw - controls.yaw), Math.cos(wantYaw - controls.yaw)), dp = wantPitch - controls.pitch;
            if (Math.abs(dyaw) < 0.4 && Math.abs(dp) < 0.4) {
              const k = Math.min(1, d * 3.2);
              controls._lookTo(controls.yaw + dyaw * k, controls.pitch + dp * k);
            }
          }
        }

        // ---- The coach, every frame ----
        {
          spLastDist = spiderReleased ? 99 : distP;
          // The spider's own speed toward you (m/s), and yours.
          if (spPrevSX != null && d > 0) {
            const vx = (spider.position.x - spPrevSX) / d, vz = (spider.position.z - spPrevSZ) / d;
            const tw = (vx * dxp + vz * dzp) / distP;
            spToward += ((isFinite(tw) && Math.abs(tw) < 12 ? tw : 0) - spToward) * Math.min(1, d * 6);
            const moved = Math.hypot(vx, vz) > 0.08;
            spMovedT = moved ? 0.6 : Math.max(0, spMovedT - d);
          }
          spPrevSX = spider.position.x; spPrevSZ = spider.position.z;
          if (controls && d > 0) {
            if (spPrevPX != null) {
              const pv = Math.hypot(controls.position.x - spPrevPX, controls.position.z - spPrevPZ) / d;
              spPlayerSpeed += ((isFinite(pv) && pv < 12 ? pv : 0) - spPlayerSpeed) * Math.min(1, d * 6);
            }
            spPrevPX = controls.position.x; spPrevPZ = controls.position.z;
          }
          // On screen + where its body sits on screen (for the read prompt).
          const sh = spiderCtrl.height || 0.3;
          camera.updateMatrixWorld();
          _spV.set(spider.position.x, spider.position.y + sh * 0.5, spider.position.z).project(camera);
          spOnScreen = !spiderReleased && _spV.z < 1 && Math.abs(_spV.x) < 0.92 && Math.abs(_spV.y) < 0.92;
          _spV.set(spider.position.x, spider.position.y + sh * 1.3, spider.position.z).project(camera);
          // The renderer's CSS size, not the canvas's clientWidth: reading
          // layout here forced a synchronous reflow every frame.
          if (active && active.renderer) active.renderer.getSize(_coachSize); else _coachSize.set(0, 0);
          const sw = _coachSize.x, shh = _coachSize.y;
          const ax = _spV.z < 1 ? (_spV.x + 1) / 2 * sw : null;
          const ay = _spV.z < 1 ? (1 - _spV.y) / 2 * shh : null;
          // Your gaze on it (yaw toward, pitch toward, like the fear block).
          const dirTo = Math.atan2(-dxp, -dzp);
          const yawGap = Math.abs(Math.atan2(Math.sin(controls.yaw - dirTo), Math.cos(controls.yaw - dirTo)));
          const gazeK = clamp01(1 - yawGap / 1.0);
          const facing = !onWall && (Math.sin(spider.rotation.y) * dxp + Math.cos(spider.rotation.y) * dzp) / distP > 0.8;
          if (!onWall) { spSubj.x = spider.position.x; spSubj.z = spider.position.z; controls.tpSubject = spiderReleased ? null : spSubj; }
          spCoach.update(d, {
            dist: spLastDist, gaze: gazeK, dogToward: spToward,
            px: controls.position.x, pz: controls.position.z, dogX: spider.position.x, dogZ: spider.position.z,
            onScreen: spOnScreen, dogGazing: facing, trust: null,
            anchorX: ax, anchorY: ay, stageW: sw, stageH: shh,
          });
          // Rung goals about where you stand.
          if (rung === 0 && distP < spZone) spCoach.goalDone("near");
          if (rung === 1 && spMovedT > 0 && distP < spZone && spPlayerSpeed < 0.3 && skitterState === "skittering") spCoach.goalDone("stillMove");
          // Readable moments that aren't events: stillness, feelers, a leg
          // flick, the stilt-stand as you come close.
          if (loose && !spiderReleased && pounceState === "idle") {
            if (skitterState === "lurking") spStillT += d; else spStillT = 0;
            if (spStillT > 4 && Math.random() < d * 0.25) { if (spSignal(Math.random() < 0.55 ? "still" : "feel")) spStillT = 0; }
            const fl = spiderCtrl._flickT || 0;
            if (fl > 0 && spFlickPrev <= 0 && Math.random() < 0.35) spSignal("flick");
            spFlickPrev = fl;
            const alertV = clamp01((1.35 - distP) / 0.9);
            if (alertV > 0.7 && spAlertPrev <= 0.7) spSignal("stilt");
            spAlertPrev = alertV;
          }
        }

        // ---- Diegetic completion beat ----
        if (window.__rungHoldComplete && !completionBeatDone) {
          if (spCoach.everSettled) spCoach.goalDone("settle");
          if (!B.pounce) { completionBeatDone = true; }
          else if (pounceState === "idle" || pounceState === "recoiling") {
            completionBeatDone = true;
            nextPounceAt = Infinity;
            if (window.PhobiaFX && window.PhobiaFX.contextPrompt) window.PhobiaFX.contextPrompt(window.t("sc.s.settled", "It settled. You outlasted it."), 4500);
          }
        }

        // ---- Drive the procedural spider (owns mixer.update + the pose layer) ----
        // ---- Walk clip rate from the ACTUAL motion, signed ----
        // One place owns it now. The per-state rates were fixed guesses (2.2
        // for the startle, 2.0 for the recoil, speed/0.9 for darts), and two of
        // those states move the spider BACKWARD while it faces you — the legs
        // walked forward as the body slid back (a moonwalk). The rate is the
        // body's speed over the clip's own measured stride speed (walkRef),
        // negative when the motion is against the facing direction.
        if (d > 0.0015) {
          if (spPrevOk && p.current && /Walk/i.test(p.current.getClip().name)) {
            const vx = (spider.position.x - spPrevPos.x) / d;
            const vy = (spider.position.y - spPrevPos.y) / d;
            const vz = (spider.position.z - spPrevPos.z) / d;
            let fwd, spd;
            if (onWall) { fwd = -Math.sin(wallSpin) * vx + Math.cos(wallSpin) * vy; spd = Math.hypot(vx, vy); }
            else { fwd = Math.sin(spider.rotation.y) * vx + Math.cos(spider.rotation.y) * vz; spd = Math.hypot(vx, vz); }
            if (spd > 0.03) {
              const mag = Math.max(0.6, Math.min(3.4, spd / walkRef));
              p.current.timeScale = fwd < -0.25 * spd ? -mag : mag;
            }
          }
          spPrevPos.copy(spider.position); spPrevOk = true;
        }
        spiderCtrl.walkAmt = skitterState === "skittering" ? 1 : 0;
        // Under the jar the layer runs CALM (breath + faint twitch) instead of
        // being suspended — a fully frozen spider read as a dead prop at arm's
        // length, and a missed jar left it stuck in the Jump pose. `calm` was
        // never set anywhere before.
        spiderCtrl.suspend = spider.position.y < -10;
        spiderCtrl.calm = jarPhase === "held" || (jarPhase === "lifting" && jar && !jar.userData.staleMiss);
        // On the wall rung the SCENE owns y at all times (climb + pounce hop +
        // recoil). If the controller's absolute y-write ran, it would snap the
        // climbing spider back to baseY every frame — a dead vertical skitter.
        spiderCtrl.suspendY = onWall;
        spiderCtrl.update(t, d);
        // Self-calibrate grounding once, AFTER the mixer has written the Idle
        // pose (on the ready frame the bones were still in bind pose). The
        // bind-pose bbox differs from the animated stance, so measure where the
        // claws really are and put them on the surface. This used to measure
        // the Leg3 bones — a joint a tarsus-length above the claws — and add
        // 4.5 cm "so the gait's dips land at floor level": every claw sat
        // 3.2–3.5 cm under the concrete, idle and walking alike (measured,
        // rung 2).
        if (spiderCtrl._needsGround && spiderClaws && spiderClaws.length && !spiderCtrl.suspend) {
          spiderCtrl._needsGround = false;
          if (onWall) {
            const face = B.wallZ ?? -2.6;
            const lo = spiderClawMin(spiderClaws, "z", spider);
            if (isFinite(lo)) { spider.position.z += face + 0.004 - lo; homeAnchor.z = spider.position.z; }
          } else {
            const lo = spiderClawMin(spiderClaws, "y", spider);
            if (isFinite(lo)) { spiderCtrl.baseY = -1 - (lo - spider.position.y); spider.position.y = spiderCtrl.baseY; }
          }
        }
        // Observability for scene-verification hooks (nothing in-app reads this).
        spider.userData.spiderDebug = { pounceState, skitterState, elapsed: +elapsed.toFixed(1), nextPounceAt: isFinite(nextPounceAt) ? +nextPounceAt.toFixed(1) : "Inf", distP: +distP.toFixed(2),
          skitterT: +skitterT.toFixed(2), nextSkitter: +nextSkitter.toFixed(2), microShuffleAt: +microShuffleAt.toFixed(2) };
        // Creature readout — min dwell 0.9 s so a two-frame pause never flickers the line.
        spHudDwell -= d;
        if (spHudEl) {
          const ph = spiderPhrase();
          if (ph !== spHudPhrase && spHudDwell <= 0) {
            spHudPhrase = ph; spHudDwell = 0.9;
            const m = spHudEl.querySelector(".trust-mood");
            if (m) m.textContent = ph;
          }
        }
      }
    },
    dispose() {
      try { sceneTimers.forEach(id => { clearTimeout(id); clearInterval(id); }); } catch {}
      try { if (moodChipOff) moodChipOff(); } catch {}
      try { if (spCanvasDom) { spCanvasDom.removeEventListener("pointerdown", onSpDown); spCanvasDom.removeEventListener("pointerup", onSpUp); } } catch {}
      try { spider.userData.disposed = true; if (spider.userData.parts && spider.userData.parts.mixer) spider.userData.parts.mixer.stopAllAction(); } catch {}
      try { if (spHudEl) { spHudEl.remove(); spHudEl = null; } } catch {}
      // The trial's evidence outlives the scene: the rate and complete screens
      // compare it with the player's own prediction.
      try { window.__lastTrialEvidence = Object.assign(spCoach.evidence(), { phobia: "spiders", level: levelIdx, ts: Date.now() }); } catch {}
      try { spCoach.dispose(); } catch {}
      try { if (window.PhobiaThreat === _threatPos) window.PhobiaThreat = null; } catch {}
      try { window.removeEventListener("keydown", spZoomKey); window.removeEventListener("keyup", spZoomKey); } catch {}
      try { if (spiderControls && spiderControls.tpSubject === spSubj) spiderControls.tpSubject = null; } catch {}
      try { if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(null); } catch {}
      try { if (window.__holdPolicy === spPolicy) window.__holdPolicy = null; } catch {}
      try { if (window.__coach === spCoach) window.__coach = null; } catch {}
      try { window.__holdCelebrationGate = null; window.__rungHoldComplete = false; } catch {}
      try { liveAudio.forEach(h => h && h.stop && h.stop()); } catch {}
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
      try { if (jar) { scene.remove(jar); jar.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); jar = null; } } catch {}
      try { const bar = document.querySelector('.scene-cmd-bar[data-scene="spiders"]'); if (bar) bar.dataset.wired = ""; } catch {}
    },
  };
}

export { setupSpiders };
