// TherapistNPC — the coach figure who stands beside the player in a scene.

import * as THREE from "three";
import { IS_LOW_POWER } from "./renderer.js";
import { makeContactShadow } from "./human-rig.js";

// =============================================================================
// ---------- TherapistNPC ----------
// =============================================================================
//
// A procedural therapist character that stands in the safe zone of approach
// scenes and acts as the user's emotional anchor. She is fully animated:
//   - constant gentle breathing (chest scale + body sway)
//   - eyes blink, head subtly tracks the player (turns toward them when they
//     are near, returns to neutral when they go far)
//   - idle gestures cycle every 8-15 s: hand to chest (warmth), palm out
//     (calming), gentle nod, hands clasped in front (active listening)
//   - SPEAKING animation: mouth opens/closes in sync with PhobiaVoice events,
//     head turns directly to the player, the gesture freezes briefly so she
//     looks like she's making eye contact while talking.
// She replaces the disembodied "voice from nowhere" with a real character
// the user can SEE coaching them — the single biggest UX upgrade for an
// exposure therapy tool. Visible in both first-person (you walk past her)
// and third-person (she's in frame next to you).
//
class TherapistNPC {
  constructor(scene, camera, opts = {}) {
    this.scene = scene;
    this.camera = camera;
    this.opts = Object.assign({
      position: new THREE.Vector3(0, 0, 4),
      facing: 0,                     // initial yaw (radians)
      // Older, kindly appearance — distinct from the player. Soft beige
      // sweater, silver-streaked hair, warm skin tone, friendly green eyes.
      skinColor:  0xeac0a0,
      hairColor:  0x8a8a92,          // grey/silver — visually distinct from player
      shirtColor: 0xc6a07a,          // warm beige sweater
      pantsColor: 0x3a4456,
      shoeColor:  0x282830,
      eyeColor:   0x305838,
      // Greeting line — said on first sight of the player approaching
      greetingLine: "Hello. I'm here. Take your time.",
    }, opts);
    this.group = new THREE.Group();
    this.group.position.copy(this.opts.position);
    this.group.rotation.y = this.opts.facing;
    this.gestureT = 0;
    this.gestureName = "rest";
    this.nextGestureAt = 4 + Math.random() * 4;
    this.speaking = 0;             // seconds of remaining speech animation
    this.lookTarget = null;
    this.headYaw = 0;
    this.headPitch = 0;
    this.handTarget = { left: { sh: 0, el: 0.1 }, right: { sh: 0, el: 0.1 } };
    this._blinkTimer = 1 + Math.random() * 4;
    this._blinkStrength = 0;
    this._build();
    scene.add(this.group);
  }

  _build() {
    const o = this.opts;
    const emissive = (hex, amt = 0.15) => new THREE.Color(hex).multiplyScalar(amt);
    const skin = new THREE.MeshStandardMaterial({
      color: o.skinColor, roughness: 0.78, emissive: emissive(o.skinColor, 0.10),
    });
    const shirt = new THREE.MeshStandardMaterial({
      color: o.shirtColor, roughness: 0.95, emissive: emissive(o.shirtColor, 0.06),
    });
    const pants = new THREE.MeshStandardMaterial({
      color: o.pantsColor, roughness: 0.95,
    });
    const shoes = new THREE.MeshStandardMaterial({
      color: o.shoeColor, roughness: 0.6, metalness: 0.05,
    });
    const hairMat = new THREE.MeshStandardMaterial({
      color: o.hairColor, roughness: 1.0,
      emissive: new THREE.Color(o.hairColor).multiplyScalar(0.04),
    });

    // Soft contact-shadow disc on the ground (see Body's, above, for why the
    // peak is this low when real shadows are available).
    const shadow = makeContactShadow(0.36, IS_LOW_POWER ? 0.38 : 0.24);
    this.group.add(shadow);

    // ---- Body ----
    // Chest — capsule, slightly oblong, with sweater material
    const chestH = 0.36;
    const chest = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, chestH, 8, 14), shirt
    );
    chest.scale.set(1.35, 1.0, 0.65);
    chest.position.set(0, 1.10, 0);
    chest.castShadow = true;
    this.group.add(chest);
    this.chest = chest;
    // Hips
    const hips = new THREE.Mesh(
      new THREE.BoxGeometry(0.40, 0.10, 0.26), pants
    );
    hips.position.set(0, 0.87, 0);
    hips.castShadow = true;
    this.group.add(hips);
    // Legs (stationary, slight stance angle)
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.07, 0.78, 14), pants
      );
      leg.position.set(sx * 0.10, 0.45, 0);
      leg.rotation.z = sx * 0.02;     // slight A-stance
      leg.castShadow = true;
      this.group.add(leg);
    }
    // Feet
    for (const sx of [-1, 1]) {
      const foot = new THREE.Mesh(
        new THREE.BoxGeometry(0.13, 0.05, 0.24), shoes
      );
      foot.position.set(sx * 0.10, 0.025, 0.05);
      foot.castShadow = true;
      this.group.add(foot);
    }
    // Neck
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.075, 0.10, 14), skin
    );
    neck.position.set(0, 1.36, 0);
    this.group.add(neck);
    // Shoulders
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 14, 12), shirt
      );
      shoulder.position.set(sx * 0.22, 1.30, 0);
      shoulder.castShadow = true;
      this.group.add(shoulder);
    }

    // ---- Articulated arms (shoulder + elbow groups) for gestures ----
    this.arms = [];
    const upperLen = 0.27, foreLen = 0.25;
    for (const sx of [-1, 1]) {
      const armRoot = new THREE.Group();
      armRoot.position.set(sx * 0.25, 1.27, 0);
      this.group.add(armRoot);
      const upper = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.07, upperLen, 8, 12), shirt
      );
      upper.position.set(0, -upperLen / 2, 0);
      upper.castShadow = true;
      armRoot.add(upper);
      const elbow = new THREE.Group();
      elbow.position.set(0, -upperLen - 0.02, 0);
      armRoot.add(elbow);
      const fore = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.055, foreLen, 8, 12), skin
      );
      fore.position.set(0, -foreLen / 2, 0);
      fore.castShadow = true;
      elbow.add(fore);
      // Hand
      const hand = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 10), skin
      );
      hand.scale.set(1.0, 1.4, 0.6);
      hand.position.set(0, -foreLen - 0.04, 0);
      elbow.add(hand);
      this.arms.push({ root: armRoot, elbow, side: sx, upper, fore, hand });
    }

    // ---- Head + face ----
    this.head = new THREE.Group();
    this.head.position.set(0, 1.49, 0);
    this.group.add(this.head);
    // Skull
    const skull = new THREE.Mesh(
      new THREE.SphereGeometry(0.115, 28, 22), skin
    );
    skull.scale.set(1.0, 1.10, 0.95);
    skull.castShadow = true;
    this.head.add(skull);
    // Hair — short cap with hint of body
    const hairCap = new THREE.Mesh(
      new THREE.SphereGeometry(0.123, 24, 18, 0, Math.PI * 2, 0, Math.PI / 2.0),
      hairMat
    );
    hairCap.position.set(0, 0.020, 0);
    this.head.add(hairCap);
    // Hair "tucked behind ear" tufts
    for (const sx of [-1, 1]) {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), hairMat);
      tuft.scale.set(0.7, 1.4, 0.6);
      tuft.position.set(sx * 0.108, -0.005, -0.02);
      this.head.add(tuft);
    }

    // Eyes (sclera, iris, pupil, catchlight, eyelid)
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xfdf3e6, roughness: 0.20, emissive: 0x161210, emissiveIntensity: 0.05,
    });
    const irisMat = new THREE.MeshStandardMaterial({
      color: o.eyeColor, roughness: 0.18, metalness: 0.12,
      emissive: new THREE.Color(o.eyeColor).multiplyScalar(0.30),
    });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x05030a });
    const lidMat = new THREE.MeshStandardMaterial({ color: o.skinColor, roughness: 0.9 });
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(sx * 0.040, 0.005, 0.103);
      this.head.add(eyeGroup);
      const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), eyeWhiteMat);
      sclera.scale.set(1.0, 1.0, 0.55);
      eyeGroup.add(sclera);
      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.014, 14, 12), irisMat);
      iris.position.set(0, 0, 0.012);
      iris.scale.set(1, 1, 0.6);
      eyeGroup.add(iris);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), pupilMat);
      pupil.position.set(0, 0, 0.020);
      eyeGroup.add(pupil);
      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.004, 6, 4),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      hl.position.set(sx * 0.004, 0.006, 0.024);
      eyeGroup.add(hl);
      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(0.024, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        lidMat
      );
      lid.scale.set(1.0, 0.05, 0.55);
      lid.position.set(0, 0.001, 0.001);
      eyeGroup.add(lid);
      // Soft eyebrow — a kindly arch
      const brow = new THREE.Mesh(
        new THREE.BoxGeometry(0.040, 0.005, 0.012),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(o.hairColor).multiplyScalar(0.85), roughness: 1.0,
        })
      );
      brow.position.set(sx * 0.001, 0.030, 0.015);
      brow.rotation.z = sx * -0.08;
      eyeGroup.add(brow);
      this.eyes.push({ group: eyeGroup, lid });
    }

    // Nose
    const nose = new THREE.Mesh(
      new THREE.SphereGeometry(0.016, 12, 10),
      new THREE.MeshStandardMaterial({ color: o.skinColor, roughness: 0.85 })
    );
    nose.scale.set(0.9, 1.4, 1.1);
    nose.position.set(0, -0.022, 0.110);
    this.head.add(nose);

    // Mouth — neutral kind half-smile. We open/close it via scale.y to
    // animate speech (jaw drop visible as mouth widens vertically). Arc spun
    // to span the circle's bottom = smile; ±90° put it sideways by the nose.
    this.mouth = new THREE.Mesh(
      new THREE.TorusGeometry(0.024, 0.0035, 6, 16, Math.PI * 0.85),
      new THREE.MeshBasicMaterial({ color: 0x6a3a30 })
    );
    this.mouth.rotation.z = Math.PI * 1.075;
    this.mouth.rotation.x = -0.10;
    this.mouth.position.set(0, -0.057, 0.107);
    this.head.add(this.mouth);
    // Open-mouth shape (small dark oval) under the mouth — visible when speaking
    this.mouthOpen = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x1a0808 })
    );
    this.mouthOpen.scale.set(1.0, 0.0, 0.4);
    this.mouthOpen.position.set(0, -0.060, 0.108);
    this.head.add(this.mouthOpen);

    // Floating name label above head — soft pill, fades in when player is
    // looking at her. Helps the user identify her as a guide / caregiver.
    const nameLabel = (() => {
      const c = document.createElement("canvas");
      c.width = 384; c.height = 80;
      const ctx = c.getContext("2d");
      ctx.font = "500 28px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "rgba(20,16,14,0.55)";
      ctx.beginPath(); ctx.roundRect(48, 16, 288, 48, 24); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText("Maya · your guide", 192, 40);
      return new THREE.CanvasTexture(c);
    })();
    nameLabel.colorSpace = THREE.SRGBColorSpace;
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: nameLabel, transparent: true, depthTest: false, opacity: 0,
    }));
    this.nameSprite.scale.set(1.0, 0.21, 1);
    this.nameSprite.position.set(0, 1.85, 0);
    this.group.add(this.nameSprite);
  }

  // Tell the therapist where to look (typically the player's head world pos)
  setLookTarget(pos) {
    this.lookTarget = pos;
  }
  // Ask her to start a speaking gesture for `seconds`. If `seconds` is 0,
  // we estimate a 4-second talk. The mouth animates while speaking != 0.
  beginSpeaking(seconds) {
    this.speaking = Math.max(this.speaking, seconds || 4);
  }
  // Lines the therapist can offer when the player clicks her — brief,
  // grounding, picks contextually based on player's distance from her.
  speakOnClick(playerPos) {
    const lines = [
      "Take your time. There's no rush at all.",
      "Notice your feet on the ground. You are here.",
      "Slow breath in. Slower breath out.",
      "I'm here. You're safe with me.",
      "Whenever you're ready. Not before.",
      "You have already done something hard by being here.",
    ];
    const line = lines[Math.floor(Math.random() * lines.length)];
    if (window.PhobiaVoice) {
      try { window.PhobiaVoice.speak(line); } catch {}
    }
    // Force speaking animation immediately
    this.beginSpeaking(line.length * 0.08);
  }
  // Returns true if a raycaster hit any of this therapist's child meshes.
  // Allows the scene's onClick to detect clicks on her for guidance.
  isHitBy(raycaster) {
    const hits = raycaster.intersectObject(this.group, true);
    return hits.length > 0;
  }

  // Pick a new idle gesture. Each gesture sets target shoulder + elbow
  // angles; update() lerps the arms toward them so motion is smooth.
  _pickGesture() {
    const choices = ["rest", "handToChest", "palmOut", "clasped", "softNod"];
    // Weighted: mostly rest + clasped (ambient listening); occasional warm gestures
    const weights = [0.30, 0.20, 0.15, 0.25, 0.10];
    let r = Math.random();
    for (let i = 0; i < choices.length; i++) {
      r -= weights[i];
      if (r <= 0) return choices[i];
    }
    return "rest";
  }

  update(t, dt, playerPos) {
    const dtN = dt || 0.016;

    // Auto-look at player when they're nearby (within ~4 m of the therapist),
    // otherwise return to a neutral forward-gaze. Real therapists track you
    // with their eyes — a fixed 1000-yard stare is uncanny.
    if (playerPos) {
      const tp = this.group.position;
      const dx = playerPos.x - tp.x;
      const dz = playerPos.z - tp.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 6) {
        const targetYaw = Math.atan2(dx, dz) - this.group.rotation.y;
        const dy = playerPos.y - (tp.y + 1.55);
        const targetPitch = -Math.atan2(dy, dist);
        // Clamp so the head doesn't crank impossibly
        const yawC = Math.max(-1.2, Math.min(1.2, targetYaw));
        const pitchC = Math.max(-0.4, Math.min(0.3, targetPitch));
        this.headYaw += (yawC - this.headYaw) * Math.min(1, dtN * 3);
        this.headPitch += (pitchC - this.headPitch) * Math.min(1, dtN * 2);
        // Show the name label when player is fairly close (≤ 5 m)
        if (this.nameSprite) {
          const want = (dist < 5.0) ? 0.85 : 0.0;
          this.nameSprite.material.opacity += (want - this.nameSprite.material.opacity) * 0.05;
        }
      } else {
        this.headYaw += (0 - this.headYaw) * 0.02;
        this.headPitch += (0 - this.headPitch) * 0.02;
        if (this.nameSprite) this.nameSprite.material.opacity *= 0.96;
      }
    }
    this.head.rotation.y = this.headYaw + Math.sin(t * 0.45) * 0.015;
    this.head.rotation.x = this.headPitch + Math.sin(t * 0.7) * 0.012;
    // A tiny z-tilt when speaking — like a real "yes I hear you" listening lean
    this.head.rotation.z = (this.speaking > 0 ? Math.sin(t * 0.9) * 0.025 : 0);

    // Breathing — chest scale + tiny vertical bob
    const breath = Math.sin(t * 1.3);
    if (this.chest) {
      this.chest.scale.y = 1.0 + breath * 0.045;
      this.chest.scale.x = 1.35 + breath * 0.025;
    }
    this.group.position.y = this.opts.position.y + breath * 0.005;

    // Blink — same logic as the player body
    if (this.eyes && this.eyes.length === 2) {
      this._blinkTimer -= dtN;
      if (this._blinkTimer < 0) {
        this._blinkStrength = 1.0;
        this._blinkTimer = 4 + Math.random() * 4;
      }
      this._blinkStrength = Math.max(0, this._blinkStrength - 0.10);
      const lidY = 0.05 + this._blinkStrength * 0.95;
      for (const e of this.eyes) e.lid.scale.y = lidY;
    }

    // Mouth animation while speaking — random "phoneme" puffs every 90-150ms
    if (this.speaking > 0) {
      this.speaking -= dtN;
      if (!this._lastMouthAt || (t - this._lastMouthAt) > 0.10 + Math.random() * 0.06) {
        const open = Math.random() * 0.9;
        if (this.mouthOpen) this.mouthOpen.scale.y = open;
        if (this.mouth) this.mouth.position.y = -0.057 - open * 0.012;
        this._lastMouthAt = t;
      }
      // While speaking, freeze the gesture so she looks engaged with the player
    } else {
      if (this.mouthOpen) this.mouthOpen.scale.y *= 0.8;
      if (this.mouth) this.mouth.position.y = -0.057;
      // Cycle gestures
      this.gestureT -= dtN;
      if (this.gestureT < 0 && t > this.nextGestureAt) {
        this.gestureName = this._pickGesture();
        this.nextGestureAt = t + 6 + Math.random() * 9;
        this.gestureT = 1.5 + Math.random() * 1.5;     // hold gesture this long
      }
    }

    // Apply gesture targets to arm rotations
    let leftSh = 0, leftEl = 0.10;
    let rightSh = 0, rightEl = 0.10;
    switch (this.gestureName) {
      case "handToChest":
        // Right hand to chest — warmth gesture
        rightSh = -1.05; rightEl = 1.3;
        break;
      case "palmOut":
        // Both palms slightly out — calming "you're safe" gesture
        leftSh = -0.55; leftEl = 0.85;
        rightSh = -0.55; rightEl = 0.85;
        break;
      case "clasped":
        // Hands clasped in front (the classic active-listening pose)
        leftSh = -0.45; leftEl = 1.1;
        rightSh = -0.45; rightEl = 1.1;
        break;
      case "softNod":
        // Arms relaxed; small head nod added below
        leftSh = 0; leftEl = 0.10;
        rightSh = 0; rightEl = 0.10;
        // Add a one-shot nod
        this.head.rotation.x += Math.sin(t * 4) * 0.06 * Math.max(0, this.gestureT);
        break;
      default:
        leftSh = 0; leftEl = 0.10;
        rightSh = 0; rightEl = 0.10;
    }
    if (this.arms) {
      this.arms.forEach(arm => {
        const sh = arm.side > 0 ? rightSh : leftSh;
        const el = arm.side > 0 ? rightEl : leftEl;
        arm.root.rotation.x += (sh - arm.root.rotation.x) * Math.min(1, dtN * 2.5);
        arm.elbow.rotation.x += (el - arm.elbow.rotation.x) * Math.min(1, dtN * 2.5);
        // Also a tiny outward shoulder rotation for palmOut so the palms
        // actually face the player
        if (this.gestureName === "palmOut") {
          arm.root.rotation.z += ((arm.side * 0.18) - arm.root.rotation.z) * 0.05;
        } else {
          arm.root.rotation.z += (0 - arm.root.rotation.z) * 0.05;
        }
      });
    }
  }

  dispose() {
    if (this.group.parent) this.group.parent.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach(m => m.dispose());
      }
    });
  }
}
