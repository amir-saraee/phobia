// buildAvatarFigure() and AvatarPreview — the figure on the character
// creator's turntable and in the shell vignettes.

import * as THREE from "three";
import { resolveQuality, getRoomEnvMap } from "./renderer.js";
import { _GAIT, _track, _solePitch, _legIK, WRIST_REST_FOLD, BODY_TYPES_3D } from "./human-base.js";
import { ANKLE_Y, KNEE_Y, HIP_Y, WAIST_Y, NECK_Y, CHEST_TOP_Y, SHOULDER_HALF, buildHumanRig } from "./human-rig.js";
import { makeGrassMaps } from "./textures.js";
import { HUMAN_CLIPS, loadHumanMotion, RETARGET_LIMBS, applyRetarget } from "./human-motion.js";

function buildAvatarFigure(c, mode = "walk") {
  const group = new THREE.Group();
  const bt = BODY_TYPES_3D[c && c.bodyType] || BODY_TYPES_3D.man;
  // Same landmark contract as the in-scene Body: scale the skeleton's height
  // landmarks by the body type, then let the rig derive everything else.
  const L = { headY: 1.55, neckY: NECK_Y, chestTopY: CHEST_TOP_Y, waistY: WAIST_Y, hipY: HIP_Y, kneeY: KNEE_Y, ankleY: ANKLE_Y };
  for (const k of Object.keys(L)) L[k] *= bt.h;
  const rig = buildHumanRig({
    bodyType: c && c.bodyType,
    skinColor:  (c && c.skinHex)  || "#e8b794",
    hairColor:  (c && c.hairHex)  || "#4a2c18",
    shirtColor: (c && c.shirtHex) || "#2c9d96",
    eyeColor:   (c && c.eyeHex)   || "#3a2410",
    hairStyle:  c && c.hairStyle,
    glasses:    c && c.glasses,
    facialHair: c && c.facialHair,
    headwear:   c && c.headwear,
    topStyle:   c && c.topStyle,
    width: SHOULDER_HALF * bt.shoulder,
    headY: L.headY, neckY: L.neckY, chestTopY: L.chestTopY, waistY: L.waistY,
    hipY: L.hipY, kneeY: L.kneeY, ankleY: L.ankleY,
  });
  group.add(rig.group);
  group.userData.rig = rig;

  // Soft contact shadow so the figure stands on something.
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 28),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.30, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  group.add(shadow);

  // Idle loop — breath, blink, weight shift, a slow scan of the room, and a
  // soft in-place walk demo that reuses the shared _GAIT / _legIK helpers so
  // the creator preview shows the same clinical walk the scenes use.
  let blinkAt = 1.5, blinkP = 0, last = 0;
  const walkPhase0 = Math.random() * Math.PI * 2;
  const ikOut = { hip: 0, knee: 0, abduct: 0 };
  // Idle state: which leg carries the weight, re-settled every several
  // seconds the way a person actually stands.
  let idleSide = Math.random() < 0.5 ? -1 : 1;
  let idleSwapAt = 5 + Math.random() * 4;
  let idleW = idleSide;
  // Ask for the CC0 motion library the moment a figure exists. It streams in
  // the background; until it lands (or if it fails) the procedural animation
  // below runs unchanged, so nothing ever waits on the download.
  let motion = null;
  try {
    loadHumanMotion().then((m) => { motion = m || null; });
  } catch { motion = null; }
  // Fade the retarget in over the first half-second rather than snapping the
  // pose the instant the file arrives.
  let motionBlend = 0;

  group.userData.animate = function (t) {
    const dt = Math.min(0.05, Math.max(0.001, t - last)); last = t;
    const br = Math.sin(t * 1.35);
    if (rig.breath) rig.breath.scale.set(1 + br * 0.020, 1 + br * 0.014, 1 + br * 0.026);

    // ---- Retargeted motion ----
    // When the library is available it owns the whole skeleton, so it runs
    // FIRST and the procedural passes below layer on top of its pose (breath
    // scale, blink, hair flutter and gaze are all things the clip does not
    // carry). Where it is not available every one of those passes still works
    // against the rest pose exactly as it did before.
    // Standing figures keep the procedural idle: the library's Idle_Loop
    // holds the arms out in an A-pose with the palms forward (see Body.update).
    const clip = mode === "idle" ? null : HUMAN_CLIPS.walk;
    if (clip && motion && motion.has(clip)) {
      motionBlend = Math.min(1, motionBlend + dt * 2.2);
      if (motion.poseAt(clip, t)) applyRetarget(rig, motion, motionBlend, RETARGET_LIMBS);
    } else {
      motionBlend = 0;
    }
    // Limbs only — the spine chain still wants its procedural pass, so the
    // branches below run their torso work and skip only what the clip owns.
    const retargeted = motionBlend > 0.999;
    // Torso lateral motion for the shared hair-flutter tail below — the walk
    // branch overwrites it with its stride shift. (It used to be a const
    // inside the walk branch, which the idle path then referenced: every
    // idle animate() threw "shift is not defined", the shell's per-tick
    // try/catch swallowed it, and the landing froze with the camera at the
    // origin — staring into the trees.)
    let shift = 0;
    if (retargeted) {
      // The clip owns the limbs, so the limb writes below are skipped — running
      // both means the last writer wins per bone and the result is neither
      // pose. The TORSO still gets its procedural contrapposto, because the
      // retarget deliberately does not touch the spine (see RETARGET_LIMBS),
      // and so do the things no clip carries: hair drape, finger curl (the
      // library has finger bones, this rig does not), breath and blink.
      if (t > idleSwapAt) { idleSide = -idleSide; idleSwapAt = t + 6 + Math.random() * 4; }
      idleW += (idleSide - idleW) * Math.min(1, dt * 0.8);
      const w = idleW;
      shift = w * 0.028;
      rig.pelvis.rotation.set(0.015, w * 0.045, w * 0.050);
      rig.spine.rotation.set(0.030, -w * 0.028, -w * 0.030);
      rig.chest.rotation.set(0.020, -w * 0.020, -w * 0.022);
      rig.group.position.y = br * 0.004;
      rig.arms.forEach((a) => {
        if (a.hand.userData.setCurl) a.hand.userData.setCurl(0.14 + br * 0.02, 0);
      });
    } else if (mode === "idle") {
      // ---- standing idle: contrapposto, breath, and nothing else ----
      // Weight settles onto one leg; the pelvis tips over it and the spine
      // counter-curves back. Every few seconds the weight re-settles to the
      // other side. No leg cycling — feet stay planted.
      if (t > idleSwapAt) { idleSide = -idleSide; idleSwapAt = t + 6 + Math.random() * 4; }
      idleW += (idleSide - idleW) * Math.min(1, dt * 0.8);
      const w = idleW;
      const sway = Math.sin(t * 0.5) * 0.010 + Math.sin(t * 0.23) * 0.007;
      shift = w * 0.028;   // hair drapes gently toward the weighted side
      rig.pelvis.rotation.set(0.015, w * 0.045, w * 0.050);
      rig.spine.rotation.set(0.030, -w * 0.028, -w * 0.030);
      rig.chest.rotation.set(0.020, -w * 0.020, -w * 0.022);
      rig.legs.forEach((leg) => {
        const bearing = (leg.side > 0 ? w : -w) > 0;   // this leg carries the weight
        leg.hip.rotation.set(bearing ? 0.015 : 0.045, 0, leg.side * (bearing ? -0.015 : 0.030));
        leg.knee.rotation.x = bearing ? 0.030 : 0.140;
        // Sole stays flat on the ground: cancel the chain above it.
        leg.foot.rotation.x = -(leg.hip.rotation.x + leg.knee.rotation.x) * 0.9;
      });
      rig.group.position.y = br * 0.004;
      // Arms hang. Elbows carry their resting bend, hands their resting curl,
      // and the two sides drift slightly out of phase so they never mirror.
      rig.arms.forEach((a) => {
        a.root.rotation.set(
          0.045 + sway * (a.side > 0 ? 1.0 : -0.7),
          0,
          a.side * (0.082 + (bt.armOut || 0)) + br * 0.006
        );
        a.elbow.rotation.x = -(0.16 + Math.max(0, sway) * 0.25);
        a.elbow.rotation.z = a.side * (bt.carry || 0);
        if (a.wrist) a.wrist.rotation.z = -a.side * WRIST_REST_FOLD;
        if (a.hand.userData.setCurl) a.hand.userData.setCurl(0.12 + br * 0.015, 0);
      });
    } else {
    // Soft walk demo: ~0.55 of full stride so proportions stay readable while
    // still showing heel-strike / mid-swing clearly against the refs.
    const walkAmt = 0.62;
    const walkPhase = walkPhase0 + t * 3.55;
    const G = _GAIT;
    const thigh = (rig.dims && rig.dims.thighLen) || 0.38;
    const shin = (rig.dims && rig.dims.shinLen) || 0.38;
    const half = 0.18 * walkAmt;
    rig.legs.forEach((leg) => {
      const th = walkPhase + (leg.side > 0 ? 0 : Math.PI);
      let s = ((th - Math.PI / 2) / (Math.PI * 2)) % 1;
      if (s < 0) s += 1;
      const planted = s < G.stance;
      const swingT = planted ? 0 : (s - G.stance) / (1 - G.stance);
      const along = planted
        ? half * (1 - 2 * (s / G.stance))
        : -half + 2 * half * swingT;
      const lift = planted ? 0 : Math.sin(Math.PI * swingT) * 0.085 * walkAmt;
      _legIK(0, along, -(thigh + shin) + lift + 0.02, thigh, shin, ikOut);
      const kneeWant = planted ? _track(G.kneeKeys, s) : Math.max(ikOut.knee, _track(G.kneeKeys, s));
      leg.hip.rotation.set(ikOut.hip * 0.92, 0, ikOut.abduct * 0.4);
      leg.knee.rotation.x = kneeWant;
      leg.foot.rotation.x = _solePitch(s) * walkAmt * 0.85 - (leg.hip.rotation.x + leg.knee.rotation.x) * 0.15;
    });
    shift = Math.sin(walkPhase) * 0.045;
    rig.pelvis.rotation.set(0.02, shift * 0.62, Math.sin(walkPhase) * 0.03);
    rig.spine.rotation.set(0.035, -shift * 0.40, -shift * 0.025);
    rig.chest.rotation.set(0.025, -shift * 0.52, -shift * 0.03);
    rig.group.position.y = br * 0.004 + Math.abs(Math.sin(walkPhase)) * 0.016 * walkAmt;
    // Opposite-arm counter-swing: right arm with left leg. Shoulder arc and
    // trailing elbow match Body.update / the walk-cycle reference sheet.
    rig.arms.forEach((a) => {
      const armPhase = walkPhase + (a.side > 0 ? 0 : Math.PI);
      const swing = Math.sin(armPhase) * (a.side > 0 ? 0.72 : 0.78) * walkAmt;
      a.root.rotation.set(
        swing + 0.05,
        0,
        a.side * (0.10 + (bt.armOut || 0)) + Math.sin(armPhase * 0.5) * 0.04 * walkAmt
      );
      a.elbow.rotation.x = -(0.42 + Math.max(0, Math.sin(armPhase - 0.55)) * 0.48 * walkAmt);
      a.elbow.rotation.z = a.side * (bt.carry || 0);
      if (a.wrist) a.wrist.rotation.z = -a.side * WRIST_REST_FOLD;
      if (a.hand.userData.setCurl) a.hand.userData.setCurl(0.05 + Math.max(0, Math.sin(armPhase)) * 0.07, 0.04);
    });
    }
    // Head + eyes scan slowly; eyes lead, head follows. Shared by both modes.
    const look = Math.sin(t * 0.33) * 0.18 + Math.sin(t * 0.11) * 0.08;
    rig.neck.rotation.set(0.02, look * 0.30, Math.sin(t * 0.27) * 0.02);
    rig.head.rotation.set(Math.sin(t * 0.24) * 0.03, look * 0.55, Math.sin(t * 0.31) * 0.02);
    if (rig.face) rig.face.setGaze(look * 0.45 + Math.sin(t * 0.9) * 0.04, Math.sin(t * 0.5) * 0.04);
    if (rig.hairFlutter) {
      rig.hairFlutter.rotation.x = Math.sin(t * 1.4) * 0.03;
      rig.hairFlutter.rotation.z = Math.sin(t * 1.05) * 0.025 - shift * 0.08;
    }
    // Blink: fast close, slower open.
    blinkAt -= dt;
    if (blinkAt < 0 && blinkP <= 0) { blinkP = 1; blinkAt = 2.5 + Math.random() * 3.5; }
    if (blinkP > 0 && rig.face) {
      blinkP -= dt / 0.16;
      const p = 1 - Math.max(0, blinkP);
      const k = p < 0.35 ? p / 0.35 : Math.max(0, 1 - (p - 0.35) / 0.65);
      rig.face.setBlink(k * k * (3 - 2 * k));
      if (blinkP <= 0) rig.face.setBlink(0);
    }
  };
  return group;
}

// ---------- Mountable avatar preview (used by character creator) ----------
const AvatarPreview = (() => {
  let active = null;
  function mount(container, character) {
    unmount();
    const w = container.clientWidth || 220;
    const h = container.clientHeight || 240;
    // The shell vignettes' budget (see makeCtx): MSAA and full DPR on the high
    // tier only. It rendered at DPR 2 with MSAA on every device.
    const tier = resolveQuality();
    const renderer = new THREE.WebGLRenderer({ antialias: tier === "high", alpha: true });
    renderer.setPixelRatio(tier === "low" ? 1 : Math.min(window.devicePixelRatio, tier === "medium" ? 1.5 : 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Match the in-scene look so the avatar in the creator looks the same
    // way it'll look during exposure. ACES + soft exposure + shared env map.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, w / h, 0.05, 50);
    // Frame the full figure: feet at y=0, head crown at y≈1.75. Centre at y≈0.95.
    // Camera pulled back so the legs are visible at the bottom of frame and the
    // head + face read clearly at the top.
    camera.position.set(0, 1.05, 3.4);
    camera.lookAt(0, 0.95, 0);
    // Three-point lighting — key (warm), fill (cool), rim (back-light for hair).
    const key = new THREE.DirectionalLight(0xfff0d8, 1.5);
    key.position.set(2.5, 3.5, 3); key.castShadow = false;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.55);
    fill.position.set(-2.5, 1.5, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff5e0, 0.45);
    rim.position.set(0, 2.5, -3); scene.add(rim);
    scene.add(new THREE.AmbientLight(0x303a55, 0.55));
    // Apply the shared room env map so skin / glasses / belt buckle pick up
    // proper reflections instead of looking matte.
    const previewEnv = getRoomEnvMap(renderer);
    if (previewEnv) scene.environment = previewEnv;
    // Grass disc so the figure stands in the same world as the valley, not a void.
    let floorMat = new THREE.MeshStandardMaterial({ color: 0x2a3a28, roughness: 1.0 });
    try {
      const grass = makeGrassMaps();
      if (grass && grass.albedo) {
        [grass.albedo, grass.normal, grass.roughness].forEach((tex) => { if (tex) tex.repeat.set(2, 2); });
        floorMat = new THREE.MeshStandardMaterial({
          map: grass.albedo, normalMap: grass.normal, roughnessMap: grass.roughness,
          color: 0xffffff, roughness: 1, envMapIntensity: 0.35,
        });
      }
    } catch {}
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.15, 36), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.005;
    scene.add(floor);
    let figure = buildAvatarFigure(character);
    // DEBUG hook (same spirit as window.__active in mount()): lets tooling
    // pose the turntable for deterministic screenshots. Inert in normal use.
    window.__avatarFigure = figure;
    scene.add(figure);
    // Drag-to-rotate: grab the figure and spin it. The slow turntable auto-spin
    // pauses while dragging and resumes (from wherever you left it) on release.
    let dragging = false, lastX = 0, pid = null;
    const el = renderer.domElement;
    el.style.cursor = "grab";
    el.style.touchAction = "none";
    const onDown = (e) => { dragging = true; lastX = e.clientX; pid = e.pointerId; el.style.cursor = "grabbing"; try { el.setPointerCapture(pid); } catch {} };
    const onMove = (e) => { if (!dragging) return; figure.rotation.y += (e.clientX - lastX) * 0.012; lastX = e.clientX; };
    const onUp = () => { if (!dragging) return; dragging = false; el.style.cursor = "grab"; try { el.releasePointerCapture(pid); } catch {} };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let retired = null;   // the previous figure, freed after the next draw (see update)
    // A slow turntable: 30 fps below the high tier, nothing while hidden.
    const minGap = tier === "high" ? 1000 / 61 : 1000 / 31;
    function tick() {
      if (!container.isConnected) { try { renderer.dispose(); } catch {} return; }
      const now = performance.now();
      if (document.hidden || now - last < minGap) { raf = requestAnimationFrame(tick); return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      elapsed += dt;
      // Slow turntable rotation (paused while the user is dragging)
      if (!dragging) figure.rotation.y += dt * 0.30;
      // Run idle animation (breathing, blinking, head sway, arm sway)
      if (figure.userData && typeof figure.userData.animate === "function") {
        try { figure.userData.animate(elapsed); } catch {}
      }
      renderer.render(scene, camera);
      if (retired) { disposeFigure(retired); retired = null; }
      raf = requestAnimationFrame(tick);
    }
    const disposeFigure = (f) => f.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => m.dispose());
      }
    });
    tick();
    active = {
      renderer, scene, camera, raf,
      cleanup() {
        cancelAnimationFrame(raf);
        if (retired) { disposeFigure(retired); retired = null; }
        el.removeEventListener("pointerdown", onDown);
        el.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        el.removeEventListener("pointercancel", onUp);
        scene.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach(m => m.dispose());
          }
        });
        try { renderer.dispose(); } catch {}
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      },
      update(newChar) {
        const yaw = figure.rotation.y;   // keep the user's chosen angle across edits
        scene.remove(figure);
        // Freed after the new figure's first draw, so its identical materials
        // inherit the compiled programs instead of compiling them again.
        if (retired) disposeFigure(retired);
        retired = figure;
        figure = buildAvatarFigure(newChar);
        figure.rotation.y = yaw;
        window.__avatarFigure = figure;
        scene.add(figure);
      },
    };
  }
  function update(character) { if (active) active.update(character); }
  function unmount() {
    if (active) { try { active.cleanup(); } catch {} active = null; }
  }
  return { mount, update, unmount, ready: true };
})();
window.AvatarPreview = AvatarPreview;

export { buildAvatarFigure };
