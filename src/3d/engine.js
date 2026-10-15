// The exposure engine: mount() builds a realm's scene around its setup
// (renderer, camera, controls, body, post-fx, physics) and runs the loop;
// unmount() tears it all down. main.js loads this module on demand, and
// loadRealm() fetches each realm's scene code the first time it is entered.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
// Tier-1 quality passes: contact-shadow AO + cleaner edge anti-aliasing.
import { SSAOPass } from "three/addons/postprocessing/SSAOPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
// ShaderPass hosts the in-render fear grade (desaturate/contrast/black-crush/
// vignette in one full-screen pass) — scenes opt in via result.fearGradePass.
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
// WebXR — lets the user enter immersive VR on a Quest / Vision Pro / any
// WebXR-capable headset. The button only appears if the browser supports
// the WebXR Device API (we hide it gracefully otherwise).
import { VRButton } from "three/addons/webxr/VRButton.js";
// XRControllerModelFactory provides the visible controller mesh that
// matches the user's actual hardware (Quest Touch, Vision Pro, Index, etc.).
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { _audVec1, _audVec2, _audVec3, compileAhead } from "./assets.js";
import { disposeObject, IS_COARSE_POINTER, demoteAutoTier, QUALITY, IS_LOW_POWER, makeRenderer, getRoomEnvMap } from "./renderer.js";
import { TouchJoystick, FPControls } from "./controls.js";
import { Body } from "./body.js";
import { Hands } from "./hands.js";
import { FearGradeShader, makeOutputGradePass } from "./postfx.js";
import { sceneContext, CTX_WEATHER_AUDIBLE, CTX_DAYLIGHT, applyContextDaylight } from "./scene-context.js";
import { PhobiaPhysics, PhobiaGrab } from "./physics.js";
import { REALMS } from "./realms/index.js";
import { active, setActive } from "./live.js";

// The context of the most recently mounted exposure. Outlives `active` on
// purpose — the rating happens after the scene is gone.
let lastSceneCtx = null;
// Per-frame payloads the loop refills in place (see tick).
const _xpFrame = { dt: 0, px: null, pz: null, fx: 0, fy: 0, fz: 0, cx: null, cy: null, cz: null, hasFocus: false, fear: 0, threat: false, landed: 0 };
const _listenerArg = { position: null, forward: null, up: null };

function unmount() {
  if (!active) return;
  // Mark the scene dead FIRST. Scenes kick off async loads (models, HDRI) that
  // check scene.userData.disposed before touching the renderer; the flag was
  // read in setupDogs but never written, so a late HDRI landed on a renderer
  // whose context had already been force-lost.
  if (active.scene && active.scene.userData) active.scene.userData.disposed = true;
  // Close out any experiment run — stores the session summary viewComplete
  // reads, and removes the panel from the stage.
  try { window.PhobiaExperiments && window.PhobiaExperiments.end(); } catch {}
  // Free the physics world (WASM — a dropped world without free() leaks).
  try { window.PhobiaGrab && window.PhobiaGrab.reset(); } catch {}
  try { window.PhobiaPhysics && window.PhobiaPhysics.end(); } catch {}
  window.__perf = null;
  // Stop both the rAF and the WebXR animation loop drivers
  cancelAnimationFrame(active.raf);
  if (active.renderer) {
    try { active.renderer.setAnimationLoop(null); } catch {}
    // End any active VR session so the headset returns to the home view
    if (active.renderer.xr && active.renderer.xr.isPresenting) {
      try { active.renderer.xr.getSession()?.end(); } catch {}
    }
  }
  window.removeEventListener("resize", active.onResize);
  if (active.resizeObs) { try { active.resizeObs.disconnect(); } catch {} }
  // The context weather loop is owned by mount(), not by the scene, so the
  // scene's own dispose() would never reach it.
  if (active.ctxWeatherAudio) { try { active.ctxWeatherAudio.stop(); } catch {} }
  // Scene-specific dispose first so it can clean up its own listeners /
  // HUD elements before the renderer is torn down.
  if (active.sceneResult && typeof active.sceneResult.dispose === "function") {
    try { active.sceneResult.dispose(); } catch {}
  }
  if (active.controls) try { active.controls.dispose(); } catch {}
  if (active.hands) try { active.hands.dispose(); } catch {}
  if (active.body) try { active.body.dispose(); } catch {}
  if (active.joystick) try { active.joystick.dispose(); } catch {}
  if (active.composer) try { active.composer.dispose(); } catch {}
  if (active.pointerListeners && active.renderer && active.renderer.domElement) {
    active.renderer.domElement.removeEventListener("pointerdown", active.pointerListeners.onPointerDownTrack);
    active.renderer.domElement.removeEventListener("pointerup",   active.pointerListeners.onPointerUpInteract);
  }
  if (active.scene) disposeObject(active.scene);
  if (active.renderer) {
    // Force the WebGL context to be released NOW, not whenever GC happens to
    // run. Without this, navigating through enough scenes leaks contexts until
    // the browser's ~16-context cap drops the oldest ("context lost"), and a
    // scene fails to render. _teardown silences the loss handler's warning.
    active.renderer._teardown = true;
    try { active.renderer.forceContextLoss(); } catch {}
    active.renderer.dispose();
    if (active.renderer.domElement && active.renderer.domElement.parentNode) {
      active.renderer.domElement.parentNode.removeChild(active.renderer.domElement);
    }
  }
  // Record this session into the Fear history before tearing down — this
  // is what powers "you held it 8 seconds longer than last time" feedback
  // on the next entry. Also speak a one-shot habituation cue if the user
  // peaked lower than last time (real progress).
  if (window.PhobiaFear) {
    try {
      const sceneKey = window.PhobiaFear.getScene();
      window.PhobiaFear.recordSession(lastRungOutcome
        ? { completed: !!lastRungOutcome.finished, heldSec: lastRungOutcome.heldSec } : {});
      // Defer the speech so it doesn't get cut off by the unmount audio teardown
      if (sceneKey && window.PhobiaNarrator) {
        setTimeout(() => {
          try { window.PhobiaNarrator.speakHabituation(sceneKey); } catch {}
        }, 600);
      }
    } catch {}
  }
  // Unsubscribe from fear updates so the previous scene's overlay doesn't
  // keep getting driven after the next scene mounts.
  if (active.fearUnsubscribe) {
    try { active.fearUnsubscribe(); } catch {}
  }
  // Stop the body-feel rig (heartbeat / breath pacer / haptics) with it.
  if (active.fearFXStop) {
    try { active.fearFXStop(); } catch {}
  }
  // Stop any in-progress grounding script so its timers don't fire in the next
  // scene and its setGroundingMode(false) doesn't toggle the new scene.
  if (active.groundingCleanup) {
    try { active.groundingCleanup(); } catch {}
  }
  // Gyro-look listener and the screen wake lock are scene-scoped.
  if (active.gyroCleanup) {
    try { active.gyroCleanup(); } catch {}
  }
  if (active.wakeLockCleanup) {
    try { active.wakeLockCleanup(); } catch {}
  }
  // Remove overlay elements we added
  if (active.overlays) {
    active.overlays.forEach(el => { if (el.parentNode) el.parentNode.removeChild(el); });
  }
  // Detach any window-level listeners we added (camera toggle key, etc.)
  if (active.keyListeners) {
    active.keyListeners.forEach(({ event, fn }) => {
      try { window.removeEventListener(event, fn); } catch {}
    });
  }
  setActive(null);
  // The debug hooks held the dead scene, renderer and composer reachable
  // until the next trial mounted.
  window.__active = null; window.__tickNow = null; window.__renderNow = null;
}

// Each realm's setup lives in its own module (realms/*.js) and is fetched the
// first time that realm is entered; mount() needs it already loaded, so
// main.js awaits loadRealm() before a realm's first mount.
const SETUPS = {};
function loadRealm(phobiaKey) {
  if (SETUPS[phobiaKey]) return Promise.resolve();
  const load = REALMS[phobiaKey];
  if (!load) return Promise.reject(new Error("Unknown phobia: " + phobiaKey));
  return load().then((setup) => { SETUPS[phobiaKey] = setup; });
}
function realmReady(phobiaKey) {
  return !!SETUPS[phobiaKey];
}

function mount(phobiaKey, container, level, levelIdx, opts = {}) {
  unmount();
  const setup = SETUPS[phobiaKey];
  if (!setup) throw new Error("Realm not loaded (loadRealm first): " + phobiaKey);

  // Loading hint while textures/scene set up (the trial view paints its own
  // first; reuse it).
  let loading = container.querySelector(".loading");
  if (!loading) {
    loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = window.t("stage.loading", "Setting the scene…");
    container.appendChild(loading);
  }

  const renderer = makeRenderer(container);
  container.appendChild(renderer.domElement);

  // Vignette overlay for cinematic edge falloff
  const vignette = document.createElement("div");
  vignette.className = "vignette";
  container.appendChild(vignette);

  // 3D mode badge — hidden by default. The user doesn't need to see "3D ·
  // WebGL" while playing; it was tech-clutter that competed with the
  // achievement-toast for the same corner.
  const badge = document.createElement("div");
  badge.className = "mode-badge";
  badge.textContent = "3D · WebGL";
  badge.style.display = "none";
  container.appendChild(badge);

  // Controls hint (autohides after 5s)
  const hint = document.createElement("div");
  hint.className = "controls-hint";
  container.appendChild(hint);

  const scene = new THREE.Scene();
  // Bake-once room environment map shared across scenes. Each scene can still
  // override scene.environment with its own (e.g. a sky map) but if it doesn't,
  // every PBR surface gets a sensible reflection from this default.
  const envMap = getRoomEnvMap(renderer);
  if (envMap) scene.environment = envMap;
  const aspect = (container.clientWidth || 800) / (container.clientHeight || 360);
  // Near plane 0.02 — safe distance for the world-anchored body's chest at
  // ~0.20 m below the camera; larger near plane could clip the body when the
  // user looks straight down.
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.02, 3000);

  // ---- Post-processing pipeline ----
  // 1. RenderPass    — base scene render
  // 2. SSAOPass      — contact AO darkens corners + object-floor seams
  // 3. UnrealBloom   — emissive bleed (suns, lit windows, lightning, eyes)
  // 4. OutputPass    — final tone-mapped sRGB output
  // 5. SMAAPass      — edge anti-aliasing, high tier below DPR 1.75 only
  // 6. fear grade    — opt-in; fused into (4) whenever (5) is off
  // SSAO and SMAA are off on low-power devices to keep the frame budget.
  const w = container.clientWidth || 800;
  const h = container.clientHeight || 360;
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Screen-space ambient occlusion. The single biggest "this looks like a
  // real photograph" upgrade after tone mapping — corners darken naturally
  // where two surfaces meet, grounding everything in real space. Tuned
  // strong enough to read clearly without crushing the blacks.
  let ssaoPass = null;
  // High tier only: SSAO re-renders scene depth+normals and then samples a
  // per-pixel kernel — three geometry passes' worth of work that phone GPUs
  // (the medium tier's main audience) can't spare.
  if (QUALITY === "high") {
    try {
      ssaoPass = new SSAOPass(scene, camera, w, h);
      ssaoPass.kernelRadius = 0.45;
      // Default output mode — combines AO with the rendered colour
      ssaoPass.output = SSAOPass.OUTPUT.Default;
      // Two things kept this pass from ever producing contact shadows.
      //
      // 1. Its camera uniforms are copied ONCE, in the constructor, while the
      //    camera still has the default far plane of 3000 m. Scenes then set
      //    their own (the dog room uses 60) and the first/third-person toggle
      //    changes the FOV, but the shader kept reading the constructor's
      //    values. min/maxDistance are fractions of that stale depth range,
      //    so 0.14 meant "anything up to 420 m in front occludes": no contact
      //    shading, just dark halos round every silhouette and dirty corners.
      // 2. The normal/depth pre-pass draws every mesh as solid, so light
      //    shafts, glow rings and glass printed outlines of themselves.
      //
      // So the uniforms are refreshed from the live camera every frame, the
      // occlusion window is set in METRES (1.2 cm – 35 cm: contact range)
      // and converted to the current depth range, and see-through effect
      // meshes (additive/transparent, no depth write, or tagged ssaoSkip)
      // sit the pre-pass out.
      const ssaoRender = ssaoPass.render.bind(ssaoPass);
      ssaoPass.render = function (rdr, writeBuffer, readBuffer, deltaTime, maskActive) {
        const cam = this.camera;
        const range = Math.max(1, cam.far - cam.near);
        const u = this.ssaoMaterial.uniforms;
        u.cameraNear.value = cam.near;
        u.cameraFar.value = cam.far;
        u.cameraProjectionMatrix.value.copy(cam.projectionMatrix);
        u.cameraInverseProjectionMatrix.value.copy(cam.projectionMatrixInverse);
        if (this.depthRenderMaterial) {
          this.depthRenderMaterial.uniforms.cameraNear.value = cam.near;
          this.depthRenderMaterial.uniforms.cameraFar.value = cam.far;
        }
        this.minDistance = 0.012 / range;
        this.maxDistance = 0.35 / range;
        if (this.renderToScreen || !rdr.capabilities.isWebGL2) {
          return ssaoRender(rdr, writeBuffer, readBuffer, deltaTime, maskActive);
        }
        // The stock Default output copies the whole frame into the write
        // buffer and then multiplies the AO onto that copy: one full-
        // resolution pass that moves pixels and changes nothing (0.5–1.0 ms
        // at DPR 2 on an M4, paired A/B in the dog room; the spread is the
        // GPU's clock state). The same multiply goes straight onto the read
        // buffer instead, in place — needsSwap is off below.
        this.overrideVisibility();
        this.renderOverride(rdr, this.normalMaterial, this.normalRenderTarget, 0x7777ff, 1.0);
        this.restoreVisibility();
        u.kernelRadius.value = this.kernelRadius;
        u.minDistance.value = this.minDistance;
        u.maxDistance.value = this.maxDistance;
        this.renderPass(rdr, this.ssaoMaterial, this.ssaoRenderTarget);
        this.renderPass(rdr, this.blurMaterial, this.blurRenderTarget);
        this.copyMaterial.uniforms.tDiffuse.value = this.blurRenderTarget.texture;
        this.copyMaterial.blending = THREE.CustomBlending;
        this.renderPass(rdr, this.copyMaterial, readBuffer);
      };
      ssaoPass.needsSwap = false;
      ssaoPass.overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse((o) => {
          cache.set(o, o.visible);
          if (o.isPoints || o.isLine || o.isSprite) { o.visible = false; return; }
          if (o.userData && o.userData.ssaoSkip) { o.visible = false; return; }
          const m = o.material;
          if (m && !Array.isArray(m) && m.transparent && m.depthWrite === false) o.visible = false;
        });
      };
      composer.addPass(ssaoPass);
    } catch (e) {
      console.warn("SSAO unavailable:", e);
    }
  }
  // Bloom is inherently a blur, so non-high tiers feed its mip chain half
  // resolution — visually near-identical, several times cheaper. Low skips
  // the pass entirely (the object still exists so per-scene tuning and
  // onResize stay safe on every tier).
  const bloomHalf = QUALITY !== "high";
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(bloomHalf ? Math.ceil(w / 2) : w, bloomHalf ? Math.ceil(h / 2) : h),
    0.45,  // strength — softer default so emissive surfaces don't blow out
           // surrounding geometry. Scenes can still override per-mount.
    0.55,  // radius — moderate halo
    0.90   // threshold — only the brightest pixels bloom; emissive bodies
           // and windows shouldn't get caught up in it.
  );
  if (!IS_LOW_POWER) composer.addPass(bloomPass);
  const outputPass = new OutputPass();
  composer.addPass(outputPass);
  // SMAA — subpixel-morphological anti-aliasing. Cheaper than FXAA, cleaner.
  // Active on high quality only; medium uses MSAA via the renderer attribute.
  // Runs AFTER OutputPass so edge detection sees display-referred sRGB and
  // catches edges that only appear after tone mapping; the fear-grade pass
  // (chromatic pull) is appended after this so aberration doesn't feed AA.
  //
  // Only below a pixel ratio of 1.75, though. SMAA is three full-resolution
  // passes; at DPR 2 it cost ~1.4 ms of a 9.9 ms dog-room render (M4,
  // 1944×1372, paired A/B), and at that density a stair-step covers a quarter
  // of the area it does at DPR 1. sizePost() re-decides whenever the ratio
  // changes — the adaptive-resolution controller stepping down brings it back.
  // With the in-place SSAO blend and the fused grade below, the whole post
  // chain measured 9.9 → 7.4 ms at DPR 2 (18.8 → 16.0 with the GPU clocked
  // down); at DPR 1.5, where SMAA stays, 12.6 → 12.0.
  let smaaPass = null;
  let _smaaShed = false;   // the frame governor turned it off (see shedEffect)
  if (QUALITY === "high") {
    try {
      smaaPass = new SMAAPass(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
      composer.addPass(smaaPass);
    } catch (e) {
      console.warn("SMAA unavailable:", e);
    }
  }
  // Scene-opt-in fear grade — appended after setup() returns, see below.
  // `gradePass` runs after SMAA (its chromatic pull must not feed the edge
  // detector); `outGradePass` is the same grade fused into the tone-map /
  // sRGB pass for when SMAA is off, one full-resolution pass instead of two.
  let gradePass = null, outGradePass = null;
  function wireFinish() {
    const smaaOn = !!(smaaPass && smaaPass.enabled);
    if (gradePass && outGradePass) {
      outputPass.enabled = smaaOn;
      gradePass.enabled = smaaOn;
      outGradePass.enabled = !smaaOn;
    }
  }
  // addPass() sized every pass at full device resolution; put SSAO and bloom
  // on their reduced targets from the first frame, not the first resize.
  try { sizePost(w, h); } catch {}

  let updateFn = null;
  let controls = null;
  let hands = null;
  let body = null;
  let gyroCleanup = null;
  let joystick = null;
  let interactFn = null;     // optional: returns {gesture, hint, action, target} per frame
  let reachRing = null;      // in-world "this is reachable" ground ring (lazy)
  let _cursorPointer = false;
  let _frameEMA = 0.016;     // adaptive-resolution frame-time tracker
  // How long tick() itself runs (simulation + submitting the frame), so the
  // governor can tell a CPU-bound device — where a lower resolution buys
  // nothing and only reallocates every target — from a GPU-bound one.
  let _workEMA = 0.004;
  let _lastPRDrop = 0;
  // Two-way controller state (see the tick): time spent over / under budget,
  // and the last ratio that proved too heavy (not retried for 30 s, so the
  // controller can't oscillate between two ratios).
  let _prSlowT = 0, _prFastT = 0;
  let _prFailed = Infinity, _prFailedAt = -1e9;
  const _prMax = renderer.getPixelRatio();
  // Below DPR 1 is allowed only as a last resort on a device that is still
  // struggling with every effect off — a softer image beats a slideshow.
  const _prFloor = 0.75;
  // Effects shed, in order, once frames stay slow (see shedEffect). `_shed`
  // counts the steps taken, `_shedLog` names them (perf overlay, __perf).
  // Medium refreshes its shadow maps every other frame from the start: the
  // rooms are static and the casters that move (a dog, the traveler) do so
  // slowly enough that a 30 Hz shadow is invisible.
  let _shed = 0, _shadowEvery = QUALITY === "medium" ? 2 : 1, _shadowFrame = 0, _shadowsOff = false;
  const _shedLog = [];
  // A device whose display or battery saver caps it at a steady 30 (or 40,
  // 50) fps is not a slow device: iOS Low Power Mode and Android battery
  // saver both do it, and the governor used to read the cap as a weak GPU,
  // strip every effect and demote the next fortnight of scenes. The last 64
  // frame intervals: when ~all of them sit within 10 % of their median, the
  // CPU has headroom, and that median is a frame rate worth keeping, it is a
  // cap — the budget becomes the cap itself.
  const _ivl = new Float32Array(64), _ivlSort = new Float32Array(64);
  let _ivlN = 0, _ivlI = 0, _capped = 0, _capCheckT = 0;
  // Point-light (cube) shadows on alternate frames — see the render step.
  const _cubeShadows = [];
  let _cubeScanT = 0, _cubeFrame = 0;
  // Performance overlay (settings → Performance overlay, or fobia.perfHud=1):
  // reads the same EMA the adaptive-resolution logic trusts, so what it shows
  // is what the engine acts on. Lazily created; pref polled at 2 Hz so the
  // settings toggle applies without a remount.
  let _perfHudEl = null;
  let _perfHudNext = 0;
  let onClickFn = null;      // optional: called when user taps the scene
  let sceneCtx = null;       // this visit's time of day / weather / dressing
  let ctxWeatherAudio = null;
  let result = null;
  try {
    // Initialise the unified Fear state for this scene + rung. Scenes will
    // feed inputs (proximity, gaze) inside their own update() callbacks.
    if (window.PhobiaFear) window.PhobiaFear.setScene(phobiaKey, levelIdx);
    // Event beats are once-per-rung, so a fresh rung gets to speak them again.
    if (window.PhobiaNarrator && PhobiaNarrator.resetEvents) PhobiaNarrator.resetEvents();
    // One context per mount — the hour, weather and dressing this visit gets.
    sceneCtx = sceneContext(phobiaKey, levelIdx, true);
    // Survives unmount so the rate view can still record it (see currentContext).
    lastSceneCtx = {
      phobia: phobiaKey, level: levelIdx | 0,
      hour: sceneCtx.hour.id, weather: sceneCtx.weather.id,
      label: sceneCtx.label, visit: sceneCtx.visit,
    };
    scene.userData.renderer = renderer;
    result = setup(scene, camera, level, levelIdx, sceneCtx);
    updateFn = result && result.update;

    // ----- First-person field of view -----
    // Scenes frame themselves at 52–70° vertical, which is a comfortable
    // *photographic* framing and a poor *inhabited* one: at 52° you are
    // looking down a tube, with no periphery for anything to appear at the
    // edge of. Widening the FP view is one of the strongest presence levers
    // there is, and it only became safe to spend once the stage started
    // filling the screen — a wide FOV inside a small window reads as fisheye,
    // because the window's edges contradict it.
    //
    // Third-person keeps the scene's own framing (it is a camera there, and
    // wide angles distort the avatar). Scenes that animate fov themselves —
    // heights drives it from vertigo every frame — simply overwrite this,
    // which is correct: there it is already a deliberate instrument.
    const sceneBaseFov = camera.fov;
    const fpFov = Math.min(70, Math.max(sceneBaseFov, sceneBaseFov + 14));
    const applyModeFov = (mode) => {
      const want = mode === "tp" ? sceneBaseFov : fpFov;
      if (Math.abs(camera.fov - want) < 0.01) return;
      camera.fov = want;
      camera.updateProjectionMatrix();
    };

    if (result && result.controls) {
      controls = new FPControls(camera, renderer.domElement, result.controls);
      // Apply the scene's preferred camera mode at scene mount UNLESS the
      // user has explicitly toggled the camera this session — in which case
      // we respect their choice. This gives the best of both worlds:
      //   1. New / casual users see their character automatically (TP) on
      //      walkable approach scenes (heights, dogs, etc.) and never have
      //      to discover the toggle to get a sensible default.
      //   2. Users who prefer first-person can toggle once and have it
      //      stick across the rest of their session.
      // Session-scoped (sessionStorage) so reopening the tab resets to TP.
      let userToggled = false;
      try { userToggled = sessionStorage.getItem("fobia.userToggledCamera") === "1"; } catch {}
      // Camera-mode locking: scenes can FORCE first-person (e.g. driving,
      // needles — looking at your own arm) or third-person, in which case
      // the toggle button is hidden and the V key is no-op. When locked,
      // the lock wins over the user's session preference.
      const lockedMode = result.controls.cameraModeLocked;     // "fp" | "tp" | undefined
      if (lockedMode === "fp" || lockedMode === "tp") {
        controls.setCameraMode(lockedMode, true);
        controls._cameraModeLocked = lockedMode;
      } else if (result.controls.preferredCameraMode && !userToggled) {
        // instant=true so tpBlend is set to 1 immediately — preserves the
        // cinematic intro position we'll seed below (without instant the
        // first frame's blend < 0.05 reset would discard the wide shot).
        controls.setCameraMode(result.controls.preferredCameraMode, true);
      }
      // Wire camera-collision targets so the TP camera won't clip through
      // walls / structures the scene declared as collidable.
      if (result.collisionObjects && controls.setCollisionScene) {
        controls.setCollisionScene(result.collisionObjects);
      }
      // ---- Pointer lock (scene opt-in) ----
      // Click captures the mouse for true FPS look; a small crosshair dot is
      // the aim reference. First Esc exits the lock (browser-level, the page
      // never sees it); the transient hint teaches that a second Esc grounds.
      if (result.controls.pointerLock && controls.enablePointerLock) {
        controls.enablePointerLock();
        if (controls.canLock && controls.canLock()) {
          // Crosshair dot — the aim reference while the cursor is captured.
          const plDot = document.createElement("div");
          plDot.className = "pl-dot";
          container.appendChild(plDot);
          // Opt-in button: capture is a deliberate choice, not a click side
          // effect. Default look is drag (cursor stays free).
          const mlToggle = document.createElement("button");
          mlToggle.className = "ml-toggle";
          mlToggle.textContent = window.t("stage.mouseLook", "🖱 Mouse look");
          mlToggle.title = window.t("stage.mouseLookTip", "Capture the mouse for smooth FPS look — press Esc to release");
          mlToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            if (controls.requestLockNow) controls.requestLockNow();
          });
          container.appendChild(mlToggle);
          // Persistent release banner — visible the entire time the cursor is
          // captured, so the way out is never hidden.
          const plRelease = document.createElement("div");
          plRelease.className = "pl-release";
          plRelease.innerHTML = window.t("stage.mouseRelease", "Mouse captured · press <b>Esc</b> to free it");
          container.appendChild(plRelease);
          if (active && active.overlays) active.overlays.push(plDot, mlToggle, plRelease);
          renderer.domElement.addEventListener("fp-pointerlock", (ev) => {
            const locked = ev.detail.locked;
            plDot.style.display = locked ? "block" : "none";
            plRelease.classList.toggle("visible", locked);
            mlToggle.style.display = locked ? "none" : "inline-flex";
          });
        }
      }
      // ---- Real eye line ----
      // Scenes that declare groundY (their floor's world height) get a true
      // human eye height: 1.62 m above that floor, identical in every scene.
      // Eye heights used to range 0.7–2.55 m above the floor, so the same
      // dog read as a toy in one room and the room as a dollhouse in the
      // next. eyeY overrides for spaces whose ceiling sits below standing
      // height (the MRI bore).
      if (result.groundY != null && result.controls.mode === "walkable") {
        controls.position.y = result.eyeY != null ? result.eyeY : result.groundY + 1.62;
      }
      // ---- Auto-collected solid colliders ----
      // Walk the populated scene once and turn every furniture-scale mesh
      // into an XZ box the player capsule cannot pass through (resolved with
      // face sliding in FPControls). Heuristics: skip planes/discs (floors,
      // walls, rugs — room bounds already confine the player), skip
      // creatures (they carry per-frame dynamic circle obstacles), skip
      // camera-pinned props (hands, the match), skip ankle clutter,
      // overhead fixtures and building-scale shells.
      if (result.controls.mode === "walkable") {
        const groundRef = result.groundY != null
          ? result.groundY
          : controls.position.y - 1.62;
        const boxes = [];
        const _bb = new THREE.Box3();
        scene.updateMatrixWorld(true);
        scene.traverse((o) => {
          if (!o.isMesh || !o.geometry) return;
          if (o.userData.noCollide) return;
          const gtype = o.geometry.type;
          if (gtype === "PlaneGeometry" || gtype === "CircleGeometry") return;
          for (let p = o; p; p = p.parent) {
            if (p === camera) return;                       // camera-pinned prop
            if (p.userData && p.userData.parts) return;     // animated creature
            if (p.userData && p.userData.noCollide) return;
          }
          _bb.setFromObject(o);
          if (!isFinite(_bb.min.x) || !isFinite(_bb.max.x)) return;
          const spanX = _bb.max.x - _bb.min.x;
          const spanZ = _bb.max.z - _bb.min.z;
          if (_bb.max.y < groundRef + 0.28) return;   // ankle-height clutter
          if (_bb.min.y > groundRef + 1.25) return;   // overhead fixtures
          if (spanX > 7 || spanZ > 7) return;         // environment shells
          if (spanX < 0.06 && spanZ < 0.06) return;   // wires / pebbles
          boxes.push({
            minX: _bb.min.x, maxX: _bb.max.x,
            minZ: _bb.min.z, maxZ: _bb.max.z,
          });
        });
        if (boxes.length) {
          controls.setStaticColliders(boxes);
          // Let the scene share the same furniture solids with creature AI
          // (dog walk/fetch) so player and dog inhabit one physical room.
          if (typeof result.onStaticColliders === "function") {
            try { result.onStaticColliders(boxes); } catch {}
          }
        }
      }
      // Per-scene third-person framing overrides (e.g. the dog scene biases the
      // camera over the shoulder so the dog isn't hidden behind the avatar).
      if (result.controls) {
        if (result.controls.tpShoulder != null) controls.tpShoulder = result.controls.tpShoulder;
        if (result.controls.tpDistance != null) controls.tpDistance = result.controls.tpDistance;
        if (result.controls.tpHeight != null)   controls.tpHeight   = result.controls.tpHeight;
      }
      // Cinematic intro: start the TP smoothed position from a wider /
      // higher angle so the damped follow naturally dollies in to the
      // over-the-shoulder target over ~1 second. Tiny touch but it's the
      // signature "scene establishes itself" feel of a real game.
      if (controls.cameraMode === "tp") {
        const sinY = Math.sin(controls.yaw), cosY = Math.cos(controls.yaw);
        const wideDist = controls.tpDistance * 1.8;
        const wideHeight = controls.tpHeight + 0.9;
        controls._tpSmoothPos = new THREE.Vector3(
          controls.position.x + sinY * wideDist + cosY * controls.tpShoulder * 1.5,
          controls.position.y + wideHeight,
          controls.position.z + cosY * wideDist - sinY * controls.tpShoulder * 1.5,
        );
      }
      // `still`: a walkable rig with nowhere to walk (lying in the MRI bore) —
      // no joystick, no "start walking" nudge.
      const walkable = result.controls.mode === "walkable" && !result.still;
      // Phobia-specific intro hint: tells the user explicitly what to do.
      // For approach-style scenes (heights, dogs, etc.) the FIRST action is
      // to walk forward toward the source of fear. Without this hint the
      // user can stand confused at the back of the scene wondering what to do.
      // Always include a panic-stop reminder. Esc → grounding mode (5-4-3-2-1)
      // is the user's ethical exit at any moment. We bake it into every
      // approach scene's intro so users know it's there before they need it.
      const T = window.t, TF = window.tf;
      const escNote = " &nbsp;·&nbsp; <span style=\"opacity:.75\">" + (IS_COARSE_POINTER
        ? T("intro.esc.m", "Tap <b>🛟</b> any time to ground yourself.")
        : T("intro.esc.d", "Press <b>Esc</b> any time to ground yourself.")) + "</span>";
      // Movement wording follows IS_COARSE_POINTER (where the on-screen joystick
      // actually appears), NOT IS_TOUCH — a touch-capable laptop has WASD, not a
      // joystick, so it should be told to use the keys.
      // Intros are ONE calm line: how to move + "at your own pace". Extra
      // controls (Shift-creep, etc.) live in "Show controls" so the hint never
      // becomes a wall of text a frightened user has to parse.
      const move = IS_COARSE_POINTER ? T("intro.move.m", "<b>the joystick</b>") : T("intro.move.d", "<b>W or ↑</b>");
      const rung = typeof levelIdx === "number" ? levelIdx : 0;
      const sceneIntros = {
        heights: TF("intro.heights", "Walk toward the railing with {move} when you're ready — at your own pace.", { move }) + escNote,
        dogs: (() => {
          // Rung-aware: never claim "the dog is calm" on the barking climax.
          const lv = (typeof levelIdx === "number" && PHOBIAS.dogs && PHOBIAS.dogs.levels[levelIdx])
            || null;
          const inten = (lv && lv.intensity) || "";
          if (inten === "barking") {
            return T("intro.dogs.bark", "The dog is barking across the room. Soften your gaze, and step back any time — you control the distance.") + escNote;
          }
          if (inten === "alert") {
            return TF("intro.dogs.alert", "An alert dog is watching. Walk closer with {move} when you're ready — at your own pace.", { move }) + escNote;
          }
          return TF("intro.dogs", "Walk closer with {move} whenever you're ready.", { move }) + escNote;
        })(),
        spiders: TF("intro.spiders", "Walk forward with {move} when you're ready to face it — no rush.", { move }) + escNote,
        snakes:  TF("intro.snakes", "Walk toward the snake with {move} at your own pace.", { move }) + escNote,
        water:   TF("intro.water", "Wade in with {move} when you're ready — at your own pace.", { move }) + escNote,
        dark:    TF("intro.dark", "Walk into the dark with {move} when you're ready — at your own pace.", { move }) + escNote,
        // Touch copy names the on-screen button by its (translated) label so
        // the hint and the button always read the same.
        enclosed: (rung === 4
          ? (IS_COARSE_POINTER
            ? TF("intro.e.mri.m", "You're lying on the scanner table. Tap <b>{btn}</b> when you're ready — at your own pace.", { btn: T("cmd.e.slideIn", "Slide in") })
            : T("intro.e.mri.d", "You're lying on the scanner table. Press <b>E</b> when you're ready — at your own pace."))
          : rung === 2
            ? (IS_COARSE_POINTER
              ? TF("intro.e.lift.m", "Step into the lift with {move}, then tap <b>{btn}</b> — at your own pace.", { move, btn: T("cmd.e.ride", "Ride two floors") })
              : TF("intro.e.lift.d", "Step into the lift with {move}, then press <b>E</b> — at your own pace.", { move }))
            : (IS_COARSE_POINTER
              ? TF("intro.e.door.m", "Step inside with {move}, then close the door behind you (the 🚪 button) — at your own pace.", { move })
              : TF("intro.e.door.d", "Step inside with {move}, then close the door behind you (<b>E</b>) — at your own pace.", { move }))) + escNote,
      };
      // Replays of a rung the user already completed get a one-line reminder
      // instead of the full orientation — they know the room by now, and the
      // frozen-user nudge/movement-gating below would read as nagging.
      const rungReplay = (() => { try { return getProgress(phobiaKey).highestCompleted >= levelIdx; } catch { return false; } })();
      const intro = sceneIntros[phobiaKey];
      hint.innerHTML = intro || (IS_COARSE_POINTER
        ? (walkable
            ? T("intro.any.mw", "Swipe to look · use the joystick to walk · tap things to interact")
            : T("intro.any.m", "Swipe in any direction to look around · tap things to interact"))
        : (walkable
            ? T("intro.any.dw", "Drag with the mouse to look · <b>W A S D</b> or arrow keys to walk · click to interact")
            : T("intro.any.d", "Drag with the mouse to look · <b>W A S D</b> / arrows to lean · click to interact")));
      // Approach-style hints get a longer reveal — 16 s — because the user
      // is doing something deliberate (walking) and might not have started
      // yet. Other scenes auto-hide after 11 s as before.
      let hintDuration = sceneIntros[phobiaKey] ? 16000 : 11000;
      if (rungReplay) {
        hint.innerHTML = escNote.replace(/^ &nbsp;·&nbsp; /, "");
        hintDuration = 6000;
      }
      if (!rungReplay && walkable && controls && controls.position) {
        // Movement-GATED hint: a frightened person often freezes at the
        // entrance with no idea how to move (desktop has no on-screen walk
        // control). Keep the walk instruction up until they've actually moved;
        // if they're still frozen after ~9 s, re-emphasise the cue instead of
        // leaving them staring at an empty corner. Hard-cap at 30 s so it never
        // lingers once they're underway. The interval self-cleans when the
        // scene unmounts (hint leaves the DOM).
        const spawnX = controls.position.x, spawnZ = controls.position.z;
        const hintShownAt = Date.now();
        let nudged = false;
        const moveWatch = setInterval(() => {
          if (!hint || !hint.isConnected) { clearInterval(moveWatch); return; }
          const moved = Math.hypot(controls.position.x - spawnX, controls.position.z - spawnZ);
          const elapsed = Date.now() - hintShownAt;
          if (moved > 0.4 || elapsed > 30000) {
            hint.style.opacity = "0";
            hint.classList.remove("nudge");
            clearInterval(moveWatch);
            return;
          }
          if (!nudged && elapsed > 12000) {
            nudged = true;
            hint.classList.add("nudge");   // a few soft breaths — "you can move now"
            setTimeout(() => { if (hint) hint.classList.remove("nudge"); }, 8000);
          }
        }, 400);
      } else {
        setTimeout(() => { if (hint && hint.parentNode) hint.style.opacity = "0"; }, hintDuration);
      }

      // Mobile virtual joystick (only when scene allows walking)
      if (IS_COARSE_POINTER && walkable) {
        joystick = new TouchJoystick(container, controls);
      }
      // Gyro look — the phone becomes the window: physically turning the
      // device pans the camera. Opt-in via a stage button (persisted),
      // because physically-coupled look can disorient; drag-look always
      // stays available and the two compose through the same clamps.
      if (IS_COARSE_POINTER && controls && window.DeviceOrientationEvent) {
        const gyroBtn = document.createElement("button");
        gyroBtn.className = "ml-toggle gyro-btn";
        gyroBtn.textContent = window.t("stage.gyro", "📱 Gyro look");
        gyroBtn.title = window.t("stage.gyroTip", "Look around by physically moving the phone");
        // The stage's top-left is already a column (camera toggle, hold pill,
        // experiments chip) — park this one top-right, under the quick bar.
        gyroBtn.style.left = "auto";
        gyroBtn.style.right = "14px";
        gyroBtn.style.top = "90px";
        let gyroOn = false, gyroLast = null;
        const D2R = Math.PI / 180;
        const onGyro = (e) => {
          if (e.alpha == null || !controls) return;
          if (gyroLast) {
            let dA = e.alpha - gyroLast.a;
            if (dA > 180) dA -= 360; else if (dA < -180) dA += 360;
            const dB = e.beta - gyroLast.b;
            // Portrait mapping: compass turn → yaw, front-back tilt → pitch.
            // Pitch sign confirmed on a real device (user-tested 2026-08-15:
            // the −dB variant looked the wrong way). Deadzone swallows hand
            // tremor; the clamp swallows sensor glitches.
            const dy = Math.max(-12, Math.min(12, dA));
            const dp = Math.max(-12, Math.min(12, dB));
            if (Math.abs(dy) > 0.02 || Math.abs(dp) > 0.02) {
              controls.gyroLook(dy * D2R, dp * D2R);
            }
          }
          gyroLast = { a: e.alpha, b: e.beta };
        };
        const setGyro = (on) => {
          gyroOn = on; gyroLast = null;
          gyroBtn.textContent = on ? window.t("stage.gyroOn", "📱 Gyro on") : window.t("stage.gyro", "📱 Gyro look");
          gyroBtn.classList.toggle("gyro-on", on);
          if (on) window.addEventListener("deviceorientation", onGyro);
          else window.removeEventListener("deviceorientation", onGyro);
          try { localStorage.setItem("fobia.gyro", on ? "1" : "0"); } catch {}
        };
        gyroBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const want = !gyroOn;
          // iOS 13+ gates orientation events behind a user-gesture permission.
          if (want && typeof DeviceOrientationEvent.requestPermission === "function") {
            DeviceOrientationEvent.requestPermission()
              .then(s => setGyro(s === "granted")).catch(() => {});
          } else {
            setGyro(want);
          }
        });
        container.appendChild(gyroBtn);
        gyroCleanup = () => window.removeEventListener("deviceorientation", onGyro);
        let gyroPref = false;
        try { gyroPref = localStorage.getItem("fobia.gyro") === "1"; } catch {}
        if (gyroPref) setGyro(true);
      }
    } else {
      hint.style.display = "none";
    }
    // Bloom tuning per scene
    if (result && result.bloom) {
      if (result.bloom.strength != null)  bloomPass.strength  = result.bloom.strength;
      if (result.bloom.radius != null)    bloomPass.radius    = result.bloom.radius;
      if (result.bloom.threshold != null) bloomPass.threshold = result.bloom.threshold;
    }
    // Low tier: forward rendering pays per-fragment for every VISIBLE light,
    // and scene dressings freely place 5-6 accent PointLights. Keep the two
    // strongest and fold the rest into the hemisphere so rooms don't go dark.
    // Zero-intensity lights are left alone — those are scripted one-shots
    // (lightning, flicker) that scenes drive by intensity at runtime. Runs
    // twice: dressings/models attach lamps asynchronously and some ramp on
    // just after mount, so one mount-time sweep misses them.
    if (IS_LOW_POWER) {
      const capAccents = () => {
        if (!container.isConnected) return;
        let hemi = null, kept = 0;
        const candidates = [];
        scene.traverse(o => {
          if (o.isHemisphereLight && !hemi) { hemi = o; return; }
          if (!o.isPointLight) return;
          if (o._lowKept) { kept++; return; }
          if (o.visible && o.intensity > 0) candidates.push(o);
        });
        candidates.sort((a, b) => b.intensity - a.intensity);
        let folded = 0;
        for (const p of candidates) {
          if (kept < 2) { kept++; p._lowKept = true; continue; }
          folded += p.intensity;
          p.visible = false;
        }
        if (hemi && folded) hemi.intensity += Math.min(0.35, folded * 0.06);
      };
      capAccents();
      setTimeout(capAccents, 4000);
    }
    // Per-scene camera far plane — small interiors tighten depth precision
    // for SSAO and VSM by shrinking the default 3000 m frustum.
    if (result && result.cameraFar) {
      camera.far = result.cameraFar;
      camera.updateProjectionMatrix();
    }
    // In-render fear grade (opt-in), on every tier. The low tier used to keep
    // the CSS fallback — a full-stage multiply-blended gradient repainted as
    // fear moved plus a filter over the whole canvas, two compositor passes a
    // frame — on exactly the devices least able to pay for them. Without SMAA
    // the grade is fused into the output pass (wireFinish), so here it costs
    // a few ALU ops in a pass that runs anyway.
    if (result && result.fearGradePass) {
      gradePass = new ShaderPass(FearGradeShader);
      composer.addPass(gradePass);
      outGradePass = makeOutputGradePass(gradePass);
      composer.addPass(outGradePass);
      wireFinish();
      // The pass owns the base vignette now; the overlay div would double it.
      vignette.style.display = "none";
    }
    // VSM shadows want a non-zero radius + a few blur samples to give a soft
    // penumbra. We apply this once per scene mount so individual setups don't
    // have to remember it.
    if (renderer.shadowMap.type === THREE.VSMShadowMap) {
      scene.traverse(o => {
        if (o.isLight && o.castShadow && o.shadow) {
          o.shadow.radius = 4;
          o.shadow.blurSamples = 16;
          // VSM is biased differently from PCF — a tiny normal bias hides
          // self-shadowing acne on detailed geometry like the spider legs.
          o.shadow.normalBias = 0.04;
        }
      });
    }
    // Per-scene environment override. Outdoor scenes can opt out of the
    // default RoomEnvironment by setting result.environment = false (e.g.
    // they have their own sky setup) or to a CubeTexture.
    if (result && result.environment === false) {
      scene.environment = null;
    } else if (result && result.environment && result.environment.isTexture) {
      scene.environment = result.environment;
    }
    // Per-scene SSAO override — some scenes (water surface, rain particles,
    // sky-only views) look worse with AO on. They can set result.ssao = false.
    if (ssaoPass && result && result.ssao === false) {
      ssaoPass.enabled = false;
    }
    // First-person hands (if scene wants them) — the character's own skin and
    // shirt colours win over the scene's literals. (Sleeves used to stay the
    // scene's hard-coded grey, so the FP forearm never matched the traveler.)
    if (result && result.hands) {
      const handOpts = Object.assign({}, result.hands === true ? {} : result.hands);
      if (opts.skinColor != null) handOpts.skinColor = opts.skinColor;
      if (opts.shirtColor != null) handOpts.sleeveColor = opts.shirtColor;
      handOpts.longSleeve = opts.topStyle === "hoodie" || opts.topStyle === "jacket";
      hands = new Hands(scene, camera, handOpts);
    }
    // First-person body — defaults to enabled. Pass through character colours
    // (skin / shirt / hair / eyes / glasses / facial hair) so the visible body
    // and head match the user's saved character profile. The TP toggle below
    // lets users actually SEE this character.
    if (!result || result.body !== false) {
      const bodyOpts = Object.assign(
        {
          bodyType:  opts.bodyType,
          skinColor: opts.skinColor,
          shirtColor: opts.shirtColor,
          hairColor: opts.hairColor,
          hairStyle: opts.hairStyle,
          eyeColor:  opts.eyeColor,
          glasses:   opts.glasses,
          facialHair: opts.facialHair,
          headwear:  opts.headwear,
          topStyle:  opts.topStyle,
          surface: (result && result.surface) || "hard",
          windExposure: (result && result.windExposure) || 0,
          // Feet pinned to the scene's real floor (see Body.update).
          groundY: (result && result.groundY != null) ? result.groundY : undefined,
        },
        (result && result.body) || {}
      );
      // Drop undefined entries so Body's own defaults win — an explicitly-
      // undefined key still overrides defaults through Object.assign.
      Object.keys(bodyOpts).forEach(k => { if (bodyOpts[k] === undefined) delete bodyOpts[k]; });
      body = new Body(scene, camera, bodyOpts);
      // Step length comes from this character's actual legs, and the FP
      // camera's bob comes from that same character's actual head.
      if (controls && controls.setStrideBase) controls.setStrideBase(body.strideBase());
      if (controls && controls.setBobSource) controls.setBobSource(() => body.headBobY());
      // Sync body's head visibility AND the FP hands' visibility to the
      // controls' camera mode. In TP, body's head shows + FP hands hide
      // (so the user sees ONE clear character, not body + floating hands).
      if (controls && controls.cameraMode) {
        body.setCameraMode(controls.cameraMode);
        if (hands && hands.setCameraMode) hands.setCameraMode(controls.cameraMode);
      }
      // …and keep them synced through every later mode change, no matter who
      // calls controls.setCameraMode (toggle button, scene code, debug).
      if (controls) {
        controls.onCameraModeChange = (m) => {
          try {
            if (body) body.setCameraMode(m);
            if (hands && hands.setCameraMode) hands.setCameraMode(m);
          } catch {}
        };
      }
      // Anchor the body to the player's feet immediately. The per-frame
      // body.update() already does this, but running it once now means the body
      // is correctly placed on frame 0 — no 1-frame flash of the body (and its
      // ground-shadow disc) stuck at the world origin / eye level before the
      // first animation tick.
      try { body.update(0, 0, 0, controls, hands); } catch {}
    }
    // Field of view follows the camera mode. Chained here, after the body
    // block above has had its turn at controls.onCameraModeChange, so neither
    // hook clobbers the other — and installed even when a scene runs without
    // a body, which that block would have skipped.
    if (controls) {
      const prevModeHook = controls.onCameraModeChange;
      controls.onCameraModeChange = (m) => {
        try { applyModeFov(m); } catch {}
        if (prevModeHook) { try { prevModeHook(m); } catch {} }
      };
      applyModeFov(controls.cameraMode);
    }
    // Scenes opt into the generic re-grade with `vary: { daylight: <0..1> }`.
    // Rooms with no outside (a lift, a dark bedroom, an aircraft cabin) simply
    // don't, and are untouched.
    {
      const dl = (result && result.vary && result.vary.daylight != null)
        ? result.vary.daylight : CTX_DAYLIGHT[phobiaKey];
      if (dl) {
        try { applyContextDaylight(scene, sceneCtx, dl); }
        catch (e) { console.warn("context daylight:", e); }
      }
    }
    // Audible weather, for scenes that have an outside. Kept well under the
    // scene's own ambience — this is a different DAY, not a different scene.
    // Storms owns its own rain and thunder — a second rain loop under it just
    // muddies the mix.
    if (CTX_WEATHER_AUDIBLE.has(phobiaKey) && phobiaKey !== "storms"
        && sceneCtx && window.PhobiaAudio) {
      try {
        const w = sceneCtx.weather.id;
        if (w === "rain" && PhobiaAudio.startRain) {
          ctxWeatherAudio = PhobiaAudio.startRain(0.22);
        } else if (w === "overcast" && PhobiaAudio.startWind) {
          ctxWeatherAudio = PhobiaAudio.startWind(0.16);
        }
      } catch (e) { console.warn("context weather audio:", e); }
    }
    interactFn = result && result.interact;
    onClickFn = result && result.onClick;
  } catch (err) {
    container.removeChild(loading);
    throw err;
  }
  // Called once the programs are linked and the loop starts (see below): the
  // loading card holds the stage until then.
  function reveal() {
    if (loading.parentNode) loading.parentNode.removeChild(loading);
    // Trigger the canvas fade-in on the next frame so the CSS transition
    // actually runs (browsers skip transitions on freshly added elements).
    requestAnimationFrame(() => {
      if (renderer && renderer.domElement) {
        renderer.domElement.classList.add("scene-ready");
      }
    });
  }

  // Interaction-zone hint banner — shows above the canvas when something is reachable
  const reachHint = document.createElement("div");
  reachHint.className = "reach-hint";
  container.appendChild(reachHint);

  // Click → tell the scene to perform its action; also fire a hand pulse
  function onCanvasClick(e) {
    // Physical props first — and BEFORE the dragging guard: FPControls sets
    // `dragging` on every pointerdown and only clears it in a WINDOW-level
    // pointerup that runs after this canvas handler, so at this moment the
    // flag is true for every genuine tap. The slop/duration check in
    // onPointerUpInteract has already rejected real drags by the time we're
    // here. (Scene click systems use their own listeners and are unaffected.)
    try {
      if (window.PhobiaGrab && PhobiaGrab.click(e, camera, scene, renderer, hands, controls)) return;
    } catch {}
    // Only treat short clicks as interactions, not drags
    if (controls && controls.dragging) return;
    if (hands) hands.fireAction();
    if (onClickFn) {
      try { onClickFn(controls, hands, scene); } catch (err) { console.warn(err); }
    }
  }
  // Use pointerup so we don't conflict with drag-look
  let downX = 0, downY = 0, downT = 0;
  function onPointerDownTrack(e) { downX = e.clientX; downY = e.clientY; downT = performance.now(); }
  function onPointerUpInteract(e) {
    // The click that ACQUIRED pointer lock must never fire an interaction.
    if (controls && controls.wasJustLocked && controls.wasJustLocked()) return;
    const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
    const dur = performance.now() - downT;
    // A fingertip tap wobbles 8–15px and a nervous, deliberate tap is slow — a
    // 5px/350ms mouse tolerance silently reclassified the emotional-peak touch
    // (pet the dog, grip the rail) as a look-drag and did nothing. Widen on touch.
    const touch = e.pointerType === "touch" || IS_COARSE_POINTER;
    const slop = touch ? 16 : 5;
    const maxDur = touch ? 600 : 350;
    if (dist < slop && dur < maxDur) onCanvasClick(e);
  }
  renderer.domElement.addEventListener("pointerdown", onPointerDownTrack);
  renderer.domElement.addEventListener("pointerup", onPointerUpInteract);

  let t0 = performance.now();
  let lastTime = t0;
  let raf;
  // 120 and 144 Hz phones fire rAF twice as often as a 60 Hz screen, and every
  // frame ran the whole simulation, the shadow pass and the post chain — twice
  // the heat for motion nobody can see in a scene this slow. Frames that come
  // sooner than ~10.5 ms after the last drawn one are skipped: 120 Hz draws at
  // 60, 144 at 72, while 60 and 90 Hz screens draw every frame (halving 90 to
  // 45 would read to the frame governor as a device that can't keep up). The
  // XR compositor sets its own pace.
  function pacedTick() {
    if (!renderer.xr.isPresenting && performance.now() - lastTime < 10.5) return;
    tick();
  }
  function tick() {
    if (!container.isConnected || !active) return;
    const now = performance.now();
    const t = (now - t0) / 1000;
    const rawDt = (now - lastTime) / 1000;
    const dt = Math.min(0.05, rawDt);
    lastTime = now;
    // ---- Frame governor ----
    // A weak device otherwise stutters until the player finds the Graphics
    // setting. A slow EMA of the real frame time, aiming at 60 fps (or at
    // the device's own steady cap, see _capped):
    //   - the first two seconds are ignored (shader compiles, uploads);
    //     frames up to 1.5 s count — a 1–3 fps slideshow is load, not a
    //     stall, and the device that most needs help — but each sample is
    //     clamped, so one hitch barely moves the average;
    //   - a full second over budget on a GPU-bound device steps the pixel
    //     ratio down ~20 % (2 → 1.625 → 1.25 → 1), to 1.0 — three target
    //     reallocations where 1/8 steps took eight;
    //   - at 1.0, or on a CPU-bound device straight away (resolution does
    //     nothing for a slow CPU), 1.5 s over budget sheds an effect instead
    //     (shedEffect), and a device that had to shed on "auto" starts its
    //     next scene a tier lower;
    //   - six seconds well under budget steps the ratio back up, never past
    //     the tier's cap and never straight back onto a ratio that just failed.
    // All of it silent: the player is told nothing — on a weak device a
    // notice was one more thing on the screen, at the worst moment.
    if (rawDt < 1.5 && t > 2.0) {
      _frameEMA += (Math.min(rawDt, 0.1) - _frameEMA) * 0.05;
      _ivl[_ivlI] = rawDt; _ivlI = (_ivlI + 1) & 63; if (_ivlN < 64) _ivlN++;
      if (t >= _capCheckT && _ivlN >= 48) {
        _capCheckT = t + 0.5;
        for (let i = 0; i < _ivlN; i++) _ivlSort[i] = _ivl[i];
        const iv = _ivlSort.subarray(0, _ivlN).sort();
        const med = iv[_ivlN >> 1];
        let steady = 0;
        for (let i = 0; i < _ivlN; i++) if (Math.abs(iv[i] - med) < med * 0.1) steady++;
        _capped = (med > 0.0185 && med < 0.036 && steady >= _ivlN * 0.85 && _workEMA < med * 0.6) ? med : 0;
      }
      const slowAt = _capped ? _capped * 1.12 : 0.0185;
      if (_frameEMA > slowAt) { _prSlowT += rawDt; _prFastT = 0; }
      else if (!_capped && _frameEMA < 0.0125) { _prFastT += rawDt; _prSlowT = 0; }
      else { _prSlowT = 0; _prFastT = 0; }
      const pr = renderer.getPixelRatio();
      const cpuBound = _workEMA > _frameEMA * 0.7;
      let newPR = pr;
      if (_prSlowT > 1.0 && pr > 1.0 + 1e-3 && !cpuBound) {
        newPR = Math.max(1.0, Math.min(pr - 0.25, Math.round(pr * 0.8 * 8) / 8));
        _prFailed = pr; _prFailedAt = now;
      } else if (_prSlowT > 1.5 && (pr <= 1.0 + 1e-3 || cpuBound) && shedEffect(cpuBound)) {
        // Shed one effect, then give it a moment to show.
        _prSlowT = 0; _frameEMA = Math.min(_frameEMA, slowAt * 0.92);
      } else if (_prSlowT > 1.5 && cpuBound && pr > 1.0 + 1e-3) {
        // Nothing left to shed and still slow: the CPU read may be a GPU
        // stall surfacing inside a GL call, so try resolution after all.
        newPR = Math.max(1.0, Math.min(pr - 0.25, Math.round(pr * 0.8 * 8) / 8));
        _prFailed = pr; _prFailedAt = now;
      } else if (_prFastT > 6.0 && pr < _prMax - 1e-3
          && !(pr + 0.25 >= _prFailed - 1e-3 && now - _prFailedAt < 30000)) {
        newPR = Math.min(_prMax, pr + 0.25);
      }
      if (newPR !== pr) {
        renderer.setPixelRatio(newPR);
        sizePost(container.clientWidth, container.clientHeight);
        _lastPRDrop = now;
        _prSlowT = 0; _prFastT = 0;
        _frameEMA = 0.0167;   // a fresh window for the new ratio
      }
    }
    if (now >= _perfHudNext) {
      _perfHudNext = now + 500;
      let hudOn = false;
      try { hudOn = localStorage.getItem("fobia.perfHud") === "1"; } catch {}
      if (hudOn && !_perfHudEl) {
        _perfHudEl = document.createElement("div");
        _perfHudEl.className = "perf-hud";
        container.appendChild(_perfHudEl);
        if (active && active.overlays) active.overlays.push(_perfHudEl);
      }
      if (_perfHudEl) {
        _perfHudEl.style.display = hudOn ? "block" : "none";
        if (hudOn) {
          const fps = _frameEMA > 0 ? Math.round(1 / _frameEMA) : 0;
          _perfHudEl.textContent = fps + " fps · " + Math.round(_frameEMA * 1000) + " ms (cpu "
            + Math.round(_workEMA * 1000) + ") · " + QUALITY + " · " + renderer.getPixelRatio().toFixed(2) + "x"
            + (_capped ? " · cap " + Math.round(1 / _capped) : "")
            + (_shedLog.length ? " · −" + _shedLog.join(",") : "");
        }
      }
    }
    // Each per-frame call is wrapped so ONE faulty subsystem can't stop the
    // whole render loop. Errors are silently swallowed in production; they
    // surface in the console so devs can find them. Without this, a single
    // throw in (say) the dog audio scheduler would freeze the entire scene.
    try { if (controls) controls.update(dt); }
    catch (e) { console.warn("controls.update:", e); }
    // Tick the unified Fear state every frame so it can ramp / decay smoothly.
    // Scenes feed inputs in their own update() callbacks (proximity, gaze).
    try { if (window.PhobiaFear) window.PhobiaFear.update(dt); }
    catch (e) { console.warn("PhobiaFear.update:", e); }

    // ---- VR thumbstick locomotion + snap-turn ----
    // When in an immersive session, read the controllers' thumbstick axes:
    //   Left stick: smooth locomotion (strafe + forward), aligned to the
    //               headset's facing direction.
    //   Right stick: snap-turn 30° in the direction of a flick > 0.7.
    // Snap-turn (vs smooth-turn) is the comfort default — smooth rotation
    // is the #1 cause of VR motion sickness.
    if (renderer.xr.isPresenting) {
      const session = renderer.xr.getSession();
      if (session && session.inputSources) {
        for (const src of session.inputSources) {
          if (!src.gamepad || !src.gamepad.axes || src.gamepad.axes.length < 4) continue;
          const ax = src.gamepad.axes;
          // Trackpad axes are sometimes 0,1; thumbstick is 2,3 — both check
          const stickX = ax[2] !== undefined ? ax[2] : ax[0];
          const stickY = ax[3] !== undefined ? ax[3] : ax[1];
          if (src.handedness === "left") {
            if (Math.abs(stickX) > 0.15 || Math.abs(stickY) > 0.15) {
              // Forward = headset's horizontal facing direction
              const xrCam = renderer.xr.getCamera();
              const dir = _audVec1.set(0, 0, -1).applyQuaternion(xrCam.quaternion);
              dir.y = 0;
              if (dir.lengthSq() > 0.0001) dir.normalize();
              const right = _audVec2.set(dir.z, 0, -dir.x);
              const speed = 1.6 * dt;
              camera.position.addScaledVector(dir, -stickY * speed);
              camera.position.addScaledVector(right, stickX * speed);
              // Respect walkable scene bounds when present
              if (controls && controls.opts && controls.opts.bounds) {
                const b = controls.opts.bounds;
                camera.position.x = Math.max(b.minX, Math.min(b.maxX, camera.position.x));
                camera.position.z = Math.max(b.minZ, Math.min(b.maxZ, camera.position.z));
              }
            }
          } else if (src.handedness === "right") {
            // Snap-turn — only triggers once per flick (waits for the stick
            // to return to centre before another turn)
            if (Math.abs(stickX) > 0.7 && !active._lastSnapTurn) {
              camera.rotation.y -= Math.sign(stickX) * (Math.PI / 6);
              active._lastSnapTurn = true;
            } else if (Math.abs(stickX) < 0.3) {
              active._lastSnapTurn = false;
            }
          }
        }
      }
    }

    try { if (updateFn) updateFn(t, controls, dt); }
    catch (e) { console.warn("scene update:", e); }
    // Interaction probe: scene tells us what gesture is appropriate right now
    try {
      if (interactFn && hands) {
        const probe = interactFn(controls, hands, t, dt) || {};
        hands.setGesture(probe.gesture || "rest");
        // Gate NEW hint text through the cross-channel dedupe so a caption or
        // context prompt saying nearly the same thing doesn't triple-stack.
        if ((probe.hint || "") !== active._lastReachHint) {
          active._lastReachHint = probe.hint || "";
          active._reachHintOk = !probe.hint ||
            !window.PhobiaFX || !window.PhobiaFX.promptGate ||
            window.PhobiaFX.promptGate("hint", probe.hint);
        }
        const showHint = probe.hint && active._reachHintOk;
        // Written only on change: rewriting textContent replaced the text node
        // (and invalidated style/layout for the overlay) on every frame.
        const hintText = showHint ? probe.hint : "";
        if (reachHint._text !== hintText) { reachHint._text = hintText; reachHint.textContent = hintText; }
        const hintOp = showHint ? "1" : "0";
        if (reachHint._op !== hintOp) { reachHint._op = hintOp; reachHint.style.opacity = hintOp; }
        // In-world affordance: scenes may return `target` (an Object3D) when
        // something is genuinely reachable — a soft pulsing ring appears on
        // the ground under it, and the cursor becomes a pointer. The bottom
        // text hint alone was easy to miss, especially in third person.
        if (probe.target && probe.target.position) {
          if (!reachRing) {
            reachRing = new THREE.Mesh(
              new THREE.RingGeometry(0.82, 1.0, 40),
              new THREE.MeshBasicMaterial({
                color: 0x7cd1c5, transparent: true, opacity: 0.3,
                depthWrite: false, side: THREE.DoubleSide,
              })
            );
            reachRing.rotation.x = -Math.PI / 2;
            reachRing.userData.noCollide = true;
            scene.add(reachRing);
          }
          const rr = probe.targetRadius || 0.55;
          reachRing.scale.setScalar(rr * (1 + Math.sin(t * 2.6) * 0.06));
          reachRing.position.set(
            probe.target.position.x,
            (probe.targetY != null ? probe.targetY : probe.target.position.y) + 0.02,
            probe.target.position.z
          );
          reachRing.material.opacity = 0.22 + (Math.sin(t * 2.6) * 0.5 + 0.5) * 0.16;
          reachRing.visible = true;
        } else if (reachRing) {
          reachRing.visible = false;
        }
        const wantPointer = !!probe.hint && !(controls.isPointerLocked && controls.isPointerLocked());
        if (wantPointer !== _cursorPointer) {
          _cursorPointer = wantPointer;
          renderer.domElement.style.cursor = wantPointer ? "pointer" : "grab";
        }
      }
    } catch (e) { console.warn("scene interact:", e); }
    try { if (hands) hands.update(t, dt, controls); }
    catch (e) { console.warn("hands.update:", e); }
    try {
      if (body && controls) {
        const w = controls.getWalkState ? controls.getWalkState() : { phase: 0, amount: 0 };
        body.update(t, w.phase, w.amount, controls, hands);
      }
    } catch (e) { console.warn("body.update:", e); }
    // ---- Event beats ----
    // The narrator's normal tick is a poll on an 8-second gap, so the moments
    // that actually land — it came at you, you touched it, it startled you and
    // you stayed — either got missed or got commented on long after they were
    // over. Detected centrally here rather than per scene so every rung of
    // every phobia gets them from the one set of signals the engine already
    // publishes (PhobiaThreat, fear, and the contact the body/hands measure).
    try { detectEventBeats(t, dt); } catch (e) { console.warn("event beats:", e); }
    // Physical layer: carry the held prop (kinematic target must be set
    // BEFORE the world steps), then advance the simulation.
    try {
      if (window.PhobiaPhysics && PhobiaPhysics.active()) {
        PhobiaGrab.update(camera, hands);
        PhobiaPhysics.step(dt);
      }
    } catch (e) { console.warn("physics:", e); }
    // Behavioral experiments read the same signal set the narrator beats do —
    // plain numbers across the module/classic boundary.
    try {
      if (window.PhobiaExperiments) {
        const fwd = _audVec2.set(0, 0, -1).applyQuaternion(camera.quaternion);
        let cx = null, cy = null, cz = null, hasFocus = false;
        const th = window.PhobiaThreat;
        if (_beat.creature) {
          _beat.creature.getWorldPosition(_audVec3);
          cx = _audVec3.x; cy = _audVec3.y; cz = _audVec3.z; hasFocus = true;
        } else if (th) { cx = th.x; cy = th.y; cz = th.z; hasFocus = true; }
        // One payload object, refilled each frame (frame() reads it and
        // keeps nothing) rather than a fresh literal sixty times a second.
        const xf = _xpFrame;
        xf.dt = dt || 0.016;
        xf.px = controls && controls.position ? controls.position.x : null;
        xf.pz = controls && controls.position ? controls.position.z : null;
        xf.fx = fwd.x; xf.fy = fwd.y; xf.fz = fwd.z;
        xf.cx = cx; xf.cy = cy; xf.cz = cz; xf.hasFocus = hasFocus;
        xf.fear = window.PhobiaFear ? PhobiaFear.get() : 0;
        xf.threat = !!window.PhobiaThreat;
        xf.landed = Math.max((body && body._contactLanded) || 0, (hands && hands.contactK) || 0);
        window.PhobiaExperiments.frame(xf);
      }
    } catch {}
    // Update the spatial-audio listener so HRTF panning tracks the camera.
    // We sample the camera's forward + up vectors every frame so any sound
    // played via PhobiaAudio.spatial(pos) is correctly localised. (The
    // listener copies the numbers out; the same three vectors serve.)
    if (window.PhobiaAudio && PhobiaAudio.updateListener) {
      _listenerArg.position = camera.getWorldPosition(_audVec1);
      _listenerArg.forward = _audVec2.set(0, 0, -1).applyQuaternion(camera.quaternion);
      _listenerArg.up = _audVec3.set(0, 1, 0).applyQuaternion(camera.quaternion);
      try { PhobiaAudio.updateListener(_listenerArg); } catch {}
    }
    // In VR mode, the post-process composer must NOT be used — XR requires
    // the renderer to render directly into the headset's framebuffer with
    // per-eye stereo rendering. Fall back to plain renderer.render() while
    // a VR session is active. When the session ends, the composer chain
    // takes over again automatically. Wrapped in try/catch because WebGL
    // context-loss (tab backgrounded too long) can throw during render.
    try {
      // Once per frame (see makeRenderer) — every 2nd frame on medium or once
      // the governor has had to shed effects, and never again once it has
      // turned shadows off (shedEffect drew the maps empty one last time).
      if (!_shadowsOff && (_shadowEvery <= 1 || (++_shadowFrame % _shadowEvery) === 0)) renderer.shadowMap.needsUpdate = true;
      // A point light's shadow is a cube: six renders of every caster around
      // it (the cellar bulb alone was ~130 of the scene's ~170 draws). Those
      // refresh on alternate frames — a 30 Hz shadow under a slow spider or a
      // walking player is not something the eye separates from 60. Lights are
      // re-collected every 2 s, since some scenes add theirs late.
      if (!_shadowsOff && t >= _cubeScanT) {
        _cubeScanT = t + 2;
        _cubeShadows.length = 0;
        scene.traverse((o) => {
          if (o.isPointLight && o.castShadow && o.shadow) {
            if (o.shadow.autoUpdate) { o.shadow.autoUpdate = false; o.shadow.needsUpdate = true; }
            _cubeShadows.push(o);
          }
        });
      }
      if (!_shadowsOff && (++_cubeFrame & 1) === 0) for (const l of _cubeShadows) l.shadow.needsUpdate = true;
      if (renderer.xr.isPresenting) {
        renderer.render(scene, camera);
      } else {
        composer.render();
      }
    } catch (e) {
      console.warn("render:", e);
    }
    // CPU time of this whole tick, for the governor's CPU/GPU-bound read.
    _workEMA += (Math.min(0.1, (performance.now() - now) / 1000) - _workEMA) * 0.05;
  }

  // Discrete narration beats, derived from signals the scenes already publish.
  // Deliberately conservative: each beat fires once per rung (the narrator's own
  // dedupe), and each needs its condition to HOLD for a beat rather than clip a
  // single frame, so a creature that jitters across a threshold stays quiet.
  const _beat = { threatT: 0, calmT: 0, wasThreat: false, contactT: 0, nearT: 0, prevFear: 0, spikeT: 0, creature: null };
  // The effects ladder, cheapest-to-lose first. Each step returns true if it
  // changed anything. `cpu` marks the steps that also take work off the main
  // thread (fewer draws, no extra scene passes); a CPU-bound device takes
  // those first, since resolution and full-screen passes cost it nothing.
  const _shedSteps = [
    // The page's frosted-glass HUD: every backdrop blur re-runs whenever the
    // canvas under it changes, i.e. every frame. Invisible in the 3D view.
    { id: "blur", cpu: false, run: () => {
      const el = document.documentElement;
      if (el.classList.contains("fx-lite")) return false;
      el.classList.add("fx-lite"); return true;
    } },
    // SSAO re-renders the whole scene for normals, then a kernel and a blur.
    { id: "ssao", cpu: true, run: () => {
      if (!ssaoPass || !ssaoPass.enabled) return false;
      ssaoPass.enabled = false; return true;
    } },
    // SMAA: three full-resolution passes.
    { id: "smaa", cpu: false, run: () => {
      if (!smaaPass || _smaaShed) return false;
      _smaaShed = true; smaaPass.enabled = false; wireFinish(); return true;
    } },
    // Dog fur shells: up to six extra skinned draws of each coat mesh.
    { id: "fur", cpu: true, run: () => {
      let any = false;
      scene.traverse((o) => {
        const p = o.userData && o.userData.parts;
        if (p && p.furShells && p.furShells.length && !p.furOff) {
          p.furOff = true;
          for (const sh of p.furShells) sh.visible = false;
          any = true;
        }
      });
      return any;
    } },
    { id: "shadow2", cpu: true, run: () => {
      if (_shadowsOff || !renderer.shadowMap.enabled || _shadowEvery >= 2) return false;
      _shadowEvery = 2; return true;
    } },
    { id: "bloom", cpu: false, run: () => {
      if (!bloomPass.enabled || !composer.passes.includes(bloomPass)) return false;
      bloomPass.enabled = false; return true;
    } },
    // Shadows off, without a recompile: flipping shadowMap.enabled or a
    // light's castShadow changes every lit program and stalls for seconds on
    // exactly these devices. Instead nothing casts any more, the maps are
    // drawn once more (empty — fully lit) and never refreshed again, so the
    // shadow pass's draws are gone and the shaders stay as they are.
    { id: "shadows", cpu: true, run: () => {
      if (_shadowsOff || !renderer.shadowMap.enabled) return false;
      _shadowsOff = true;
      scene.traverse((o) => { if (o.isMesh && o.castShadow) o.castShadow = false; });
      renderer.shadowMap.needsUpdate = true;
      for (const l of _cubeShadows) l.shadow.needsUpdate = true;
      return true;
    } },
    // Last resort: below 1:1 resolution.
    { id: "res", cpu: false, run: () => {
      const pr = renderer.getPixelRatio();
      if (pr > 1.0 + 1e-3 || pr <= _prFloor + 1e-3) return false;
      renderer.setPixelRatio(Math.max(_prFloor, pr - 0.25));
      sizePost(container.clientWidth, container.clientHeight);
      _prFailed = Infinity;   // allow the climb back once things are fast
      return true;
    } },
  ];
  // One step down the ladder. Returns false when nothing is left.
  function shedEffect(cpuFirst) {
    let step = null;
    if (cpuFirst) step = _shedSteps.find((s) => s.cpu && !s.done && s.run());
    if (!step) step = _shedSteps.find((s) => !s.done && s.run());
    if (!step) return false;
    step.done = true;
    _shed++;
    _shedLog.push(step.id);
    // A device that had to give up a real effect on "auto" starts the next
    // scene a tier lower instead of stuttering through its first seconds
    // again — at once on high (its extras are the expensive ones), after the
    // second step below that. Hiding the HUD's blur alone doesn't count.
    const real = _shedLog.filter((id) => id !== "blur").length;
    if (real >= (QUALITY === "high" ? 1 : 2)) demoteAutoTier(QUALITY);
    return true;
  }
  // Debug/QA readout of the governor (harness scripts; inert otherwise).
  window.__perf = () => ({
    tier: QUALITY, pr: renderer.getPixelRatio(), prMax: _prMax,
    frameMs: +(_frameEMA * 1000).toFixed(1), workMs: +(_workEMA * 1000).toFixed(1),
    capped: _capped ? Math.round(1 / _capped) : 0, shed: _shedLog.slice(),
    shadowEvery: _shadowsOff ? 0 : _shadowEvery,
  });
  function detectEventBeats(t, dt) {
    const N = window.PhobiaNarrator;
    if (!N || !N.event || !phobiaKey) return;
    const d = Math.min(0.1, dt || 0.016);
    const fear = window.PhobiaFear ? PhobiaFear.get() : 0;
    const threat = window.PhobiaThreat || null;

    // contact — the hand is genuinely resting on the thing, in either view.
    const landed = Math.max(
      (body && body._contactLanded) || 0,
      (hands && hands.contactK) || 0
    );
    if (landed > 0.55) {
      _beat.contactT += d;
    } else {
      _beat.contactT = 0;
      _beat.contactHapticDone = false;
    }
    if (_beat.contactT > 0.6) {
      N.event(phobiaKey, "contact");
      // One soft tick the moment the touch genuinely lands — skin feedback,
      // not alarm — and never again while the hand keeps resting there.
      if (!_beat.contactHapticDone) {
        _beat.contactHapticDone = true;
        try { if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic(14); } catch {}
      }
    }

    // startle — a real jump in arousal while something is actively threatening.
    const dF = fear - _beat.prevFear;
    _beat.prevFear = fear;
    if (threat && dF > 1.2) _beat.spikeT = 0.9;
    _beat.spikeT = Math.max(0, _beat.spikeT - d);
    if (_beat.spikeT > 0 && fear > 45) N.event(phobiaKey, "startle");

    // settle — it was threatening for a while, and now it has not been for a
    // few seconds. Only worth saying if the player held their ground for it.
    if (threat) { _beat.threatT += d; _beat.calmT = 0; _beat.wasThreat = _beat.wasThreat || _beat.threatT > 1.5; }
    else { _beat.calmT += d; _beat.threatT = 0; }
    if (_beat.wasThreat && _beat.calmT > 3.0) { N.event(phobiaKey, "settle"); _beat.wasThreat = false; }

    // approach — the creature closed on a stationary player. Moving toward it
    // yourself is walking, not being approached, and the walking bank has that.
    // Creatures are found the way every other probe in this file finds them:
    // the group carrying userData.parts.mixer. Cached, and re-looked-up only
    // while nothing has been found (creature GLTFs load asynchronously).
    if (controls) {
      // Heights, the dark and tight spaces have no creature at all, and this
      // used to walk the whole scene graph every frame looking for one. Look
      // twice a second until something turns up (GLTFs stream in), then keep it.
      if ((!_beat.creature || !_beat.creature.parent) && t >= (_beat.nextSearchT || 0)) {
        _beat.creature = null;
        _beat.nextSearchT = t + 0.5;
        scene.traverse((o) => {
          if (!_beat.creature && o.userData && o.userData.parts && o.userData.parts.mixer) _beat.creature = o;
        });
      }
      const c = _beat.creature;
      if (c) {
        const dist = Math.hypot(c.position.x - controls.position.x, c.position.z - controls.position.z);
        const still = !controls.isMovingForward || !controls.isMovingForward();
        // It must have closed the gap ITSELF: walking up to it and stopping
        // used to be announced as "it's coming to you".
        const cMoved = _beat.cPrev ? Math.hypot(c.position.x - _beat.cPrev.x, c.position.z - _beat.cPrev.z) / d : 0;
        if (!_beat.cPrev) _beat.cPrev = { x: 0, z: 0 };
        _beat.cPrev.x = c.position.x; _beat.cPrev.z = c.position.z;
        _beat.cTowardT = (cMoved > 0.25 && dist < (_beat.cPrevDist ?? dist) - 1e-4) ? 1.2 : Math.max(0, (_beat.cTowardT || 0) - d);
        _beat.cPrevDist = dist;
        _beat.nearT = (dist < 2.2 && still && _beat.cTowardT > 0) ? _beat.nearT + d : Math.max(0, _beat.nearT - d);
        if (_beat.nearT > 0.6) N.event(phobiaKey, "approach");
      }
    }
  }

  // One place that sizes every post target for the current pixel ratio —
  // used at mount, on resize and by the adaptive-resolution controller.
  // composer.setSize() resizes EVERY pass to full device resolution, so the
  // cheap passes have to be put back after it each time: the old resolution
  // step only called composer.setSize(), which silently promoted SSAO to 3×
  // its pixels and bloom to full resolution, and a "lower resolution to go
  // faster" step measured 2 ms SLOWER than doing nothing.
  function sizePost(w, h) {
    const pr = renderer.getPixelRatio();
    if (composer.setPixelRatio) composer.setPixelRatio(pr);
    composer.setSize(w, h);
    // Bloom is a blur and SSAO's output is blurred: both run at half the
    // device resolution per axis (bloom at a third below the high tier).
    const bs = bloomHalf ? 0.34 : 0.5;
    bloomPass.setSize(Math.max(1, Math.round(w * pr * bs)), Math.max(1, Math.round(h * pr * bs)));
    if (ssaoPass) ssaoPass.setSize(Math.max(1, Math.round(w * pr * 0.5)), Math.max(1, Math.round(h * pr * 0.5)));
    if (smaaPass) smaaPass.enabled = !_smaaShed && pr < 1.75;
    wireFinish();
  }
  // Resizes are coalesced to one per frame and skipped when the size hasn't
  // changed: window.resize and the ResizeObserver both fire for the same
  // change, and a phone's URL bar sliding in and out fires a burst of them —
  // each one used to reallocate every post-processing target. A direct call
  // with no argument (context restore) applies at once, unconditionally.
  // (Seeded with the size makeRenderer/sizePost already used at mount, so the
  // observer's initial callback doesn't reallocate everything a second time.)
  let _rsW = container.clientWidth, _rsH = container.clientHeight, _rsQueued = false;
  function applyResize(force) {
    _rsQueued = false;
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    if (!force && w === _rsW && h === _rsH) return;
    _rsW = w; _rsH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    sizePost(w, h);
  }
  function onResize(ev) {
    if (ev === undefined) { applyResize(true); return; }
    if (_rsQueued) return;
    _rsQueued = true;
    requestAnimationFrame(() => applyResize(false));
  }
  window.addEventListener("resize", onResize);
  // Container-only size changes (drawer toggle, keyboard pop, theater mode,
  // orientation lock) never fire window.resize — without an observer the
  // canvas kept rendering at the stale resolution, blurry or letterboxed.
  let resizeObs = null;
  try { resizeObs = new ResizeObserver(() => onResize(null)); resizeObs.observe(container); } catch {}

  // ----- "Tips" toggle for the collapsed command bar -----
  // Character-driven scenes (heights, dogs, etc.) have their button bar
  // collapsed by default — events fire from movement / clicking the world.
  // This small toggle reveals the bar for accessibility / touch users who
  // prefer explicit controls. Lives in the bottom-right of the stage.
  let cmdToggle = null;
  setTimeout(() => {
    // Bar may start collapsed (desktop) or open (touch, where the buttons are
    // the primary interface) — the toggle serves both, labelled from state.
    const cmdBarEl = document.querySelector('.scene-cmd-bar');
    if (!cmdBarEl) return;
    const startCollapsed = cmdBarEl.classList.contains("collapsed");
    cmdToggle = document.createElement("button");
    cmdToggle.className = "cmd-toggle";
    const cmdLabel = (collapsed) => collapsed ? window.t("stage.showCtl", "Show controls") : window.t("stage.hideCtl", "Hide controls");
    cmdToggle.textContent = cmdLabel(startCollapsed);
    container.classList.toggle("cmds-open", !startCollapsed);
    // Where the open bar's top edge sits above the stage's bottom, for the
    // message stack to clear it. The bar is 1–3 rows depending on the scene,
    // the language and the phone, so a fixed offset can't do it.
    const syncBarTop = () => {
      if (!container.isConnected) { try { barRO && barRO.disconnect(); } catch {} return; }
      if (cmdBarEl.classList.contains("collapsed")) { container.style.removeProperty("--cmdbar-top"); return; }
      const top = container.getBoundingClientRect().bottom - cmdBarEl.getBoundingClientRect().top;
      if (top > 0) container.style.setProperty("--cmdbar-top", Math.round(top) + "px");
    };
    const barRO = window.ResizeObserver ? new ResizeObserver(syncBarTop) : null;
    if (barRO) barRO.observe(cmdBarEl);
    requestAnimationFrame(syncBarTop);
    cmdToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      const collapsed = cmdBarEl.classList.toggle("collapsed");
      cmdToggle.textContent = cmdLabel(collapsed);
      // The bar floats INSIDE the frame — flag the stage so the caption /
      // prompt stack slides up out of its way while it's open.
      container.classList.toggle("cmds-open", !collapsed);
      requestAnimationFrame(syncBarTop);
    });
    container.appendChild(cmdToggle);
    if (active && active.overlays) active.overlays.push(cmdToggle);
  }, 50);

  // ----- Fear-driven visual overlays -----
  // These are CSS overlays whose opacity / filter properties are driven each
  // frame by the unified Fear value. As fear rises:
  //   - the radial vignette tightens (peripheral vision narrows)
  //   - canvas filter desaturates + shifts red
  //   - the heartbeat audio (already implemented) speeds up
  // Together this is "tunnel vision" — the universal cinematic shorthand
  // for panic. Drives a real psychological response.
  const fearVignette = document.createElement("div");
  fearVignette.className = "fear-vignette";
  container.appendChild(fearVignette);
  // Tiny biofeedback meter at top-left so the user can SEE their level
  // change. Optional — can be hidden via a setting later.
  const fearMeter = document.createElement("div");
  fearMeter.className = "fear-meter";
  fearMeter.innerHTML = `<div class="fear-meter-fill"></div>`;
  fearMeter.style.opacity = "0";
  container.appendChild(fearMeter);
  const fearMeterFill = fearMeter.querySelector(".fear-meter-fill");
  // Subscribe to Fear updates — drive the vignette + meter + the BODY-FEEL rig:
  // a heartbeat you can hear in EVERY scene (not just heights), a slow breath
  // pacer that joins at sustained high fear, a haptic pulse on phones, and a
  // vignette that throbs ON the heartbeat. One fear value, one body — sight,
  // sound and touch agreeing is what makes the panic feel physiological
  // instead of cinematic. Audio starts lazily at the first real fear, by which
  // point a user gesture has long since unlocked the AudioContext.
  let fearUnsubscribe = null;
  let fxHeart = null;          // adjustable heartbeat (audio + beat callback)
  let fxBeatBoost = 0;         // vignette throb, decays between beats
  let fxLastNow = performance.now();
  // Style write that skips unchanged values (custom properties included).
  const fxStyle = (el, prop, val) => {
    if (!el) return;
    const c = el._fxLast || (el._fxLast = {});
    if (c[prop] === val) return;
    c[prop] = val;
    if (prop.startsWith("--")) el.style.setProperty(prop, val);
    else el.style[prop] = val;
  };
  const fxCanVibrate = !!(navigator.vibrate && window.matchMedia
    && window.matchMedia("(pointer: coarse)").matches);
  // User-facing kill switch (settings drawer → Vibration). Read per call so
  // the toggle applies immediately without a scene remount.
  const fxHapticsOn = () => { try { return localStorage.getItem("fobia.haptics") !== "0"; } catch { return true; } };
  // Exposure holds are ruined by the screen dimming mid-stare — keep the
  // display awake while a scene is mounted. Released on unmount; the OS
  // reclaims it on tab-hide, so we re-request when visibility returns.
  let fxWakeLock = null;
  const fxReqWake = () => {
    try {
      if (navigator.wakeLock && document.visibilityState === "visible") {
        navigator.wakeLock.request("screen").then(l => { fxWakeLock = l; }).catch(() => {});
      }
    } catch {}
  };
  const fxOnVis = () => { if (document.visibilityState === "visible") fxReqWake(); };
  fxReqWake();
  document.addEventListener("visibilitychange", fxOnVis);
  const wakeLockCleanup = () => {
    document.removeEventListener("visibilitychange", fxOnVis);
    try { if (fxWakeLock) { fxWakeLock.release().catch(() => {}); } } catch {}
    fxWakeLock = null;
  };
  if (window.PhobiaFear) {
    fearUnsubscribe = window.PhobiaFear.subscribe((value, ctx) => {
      const fear01 = value / 100;
      const fxNow = performance.now();
      const fxDt = Math.min(0.1, (fxNow - fxLastNow) / 1000);
      fxLastNow = fxNow;

      // --- Heartbeat: fades in from ~fear 25, races toward ~120 bpm at 100.
      // Grounding mode doesn't kill it — it slows it, which the user FEELS
      // as their body coming back down.
      if (!fxHeart && value > 25 && window.PhobiaAudio && window.PhobiaAudio.startVertigoHeartbeat) {
        fxHeart = window.PhobiaAudio.startVertigoHeartbeat(64, (bpm, intensity) => {
          if (fxCanVibrate && fxHapticsOn() && intensity > 0.25) {
            try { navigator.vibrate(Math.round(18 + intensity * 30)); } catch {}
          }
          fxBeatBoost = Math.min(0.2, 0.06 + intensity * 0.12);
        }, { silent: true });
      }
      if (fxHeart) {
        const hbI = ctx.grounding ? 0.12 : Math.max(0, (value - 22) / 78);
        fxHeart.setIntensity(hbI * 0.9);
        fxHeart.setBpm(64 + fear01 * 56 - (ctx.grounding ? 18 : 0));
      }

      // --- The slow breath pacer that used to fade in above fear 58 is gone.
      // It was a therapeutic metronome laid over the scene, and like the
      // heartbeat it was audio the world could not account for. The breath-
      // circle HUD already carries that guidance where it belongs — on screen.
      // Scenes that motivate breath DIEGETICALLY (submerged in water, sealed in
      // the MRI bore) still start their own in startSceneAudio.

      // Vignette opacity rises from 0 to ~0.9 as fear climbs — plus the
      // decaying heartbeat throb, so the edges of vision pulse with the lub-dub.
      // Base term is 0 (was 0.05): at fear=0 a calm rung must have CLEAN corners,
      // not a permanent dread-tint working against the safe-entry design.
      fxBeatBoost = Math.max(0, fxBeatBoost - fxDt * 0.5);
      if (gradePass) {
        // In-render grade: the ShaderPass owns desaturation, vignette and the
        // heartbeat throb. DOM vignette + CSS filter stay off so the two
        // pipelines never stack.
        gradePass.uniforms.uFear.value = fear01;
        gradePass.uniforms.uBeat.value = Math.min(1, fxBeatBoost * 5);
        fxStyle(fearVignette, "--fv-opacity", "0");
      } else {
        // (This subscriber runs every frame. Values are rounded and written
        // only when they change — three style writes a frame otherwise. The
        // gradient stop is whole percent: each new value repaints the full-
        // stage gradient, and a tenth of a percent changed nearly every frame.)
        fxStyle(fearVignette, "--fv-opacity", (fear01 * 0.9 + fxBeatBoost).toFixed(2));
        // The clear ellipse SHRINKS as fear rises — peripheral vision narrows
        fxStyle(fearVignette, "--fv-clear", `${Math.round(Math.max(15, 60 - fear01 * 45))}%`);
        // Canvas-level filter: desaturate + slight red bias as fear rises.
        // Removed outright when there is nothing to show: even an identity
        // filter makes the compositor filter the whole canvas every frame.
        if (renderer && renderer.domElement) {
          // In 2 % steps of fear, so the filter string (and the compositor's
          // filter setup) changes a few times a second, not every frame.
          const fq = Math.round(fear01 * 50) / 50;
          const sat = Math.max(0, 1.0 - fq * 0.20);
          const hue = -fq * 6;              // small shift toward red
          const f = fear01 < 0.01 ? ""
            : `saturate(${(sat * 100).toFixed(1)}%) hue-rotate(${hue.toFixed(2)}deg) brightness(${(1 - fq * 0.10).toFixed(3)})`;
          if (renderer.domElement._fxFilter !== f) {
            renderer.domElement._fxFilter = f;
            renderer.domElement.style.filter = f;
          }
        }
      }
      // Meter
      fxStyle(fearMeter, "opacity", value > 5 ? "1" : "0");
      if (fearMeterFill) fxStyle(fearMeterFill, "width", `${Math.round(value)}%`);
      // Camera shake at high fear (over 80) — adds the visceral panic feel
      if (value > 80 && camera && !ctx.grounding && !(controls && controls._reduceMotion)) {
        const k = (value - 80) / 20;
        camera.position.x += (Math.random() - 0.5) * 0.015 * k;
        camera.position.y += (Math.random() - 0.5) * 0.012 * k;
        camera.rotation.z += (Math.random() - 0.5) * 0.003 * k;
      }
    });
  }
  // Single teardown for the body-feel rig — called from unmount alongside
  // the fear unsubscribe so no heartbeat survives a scene change.
  const fearFXStop = () => {
    try { if (fxHeart) fxHeart.stop(); } catch {}
    fxHeart = null;
    try { if (fxCanVibrate) navigator.vibrate(0); } catch {}
  };

  // ----- Grounding mode (panic stop / 5-4-3-2-1) -----
  // The user can press Esc OR hold Space for 0.4 s to enter grounding mode.
  // The 5-4-3-2-1 sensory exercise is a clinical CBT technique for panic:
  // name 5 things you see, 4 you hear, 3 you can touch, 2 you smell, 1 you
  // taste. While in grounding mode: PhobiaFear drains rapidly, screen calms
  // (blue tint, desaturated background), narrator walks the user through
  // each step. This is the ETHICAL backstop — at any moment the user can
  // press Esc and a calming exit fires. Mandatory for a real exposure tool.
  const groundingOverlay = document.createElement("div");
  groundingOverlay.className = "grounding-overlay";
  container.appendChild(groundingOverlay);
  const groundingText = document.createElement("div");
  groundingText.className = "grounding-text";
  groundingText.setAttribute("role", "status");
  groundingText.setAttribute("aria-live", "polite");
  groundingText.setAttribute("aria-atomic", "true");
  container.appendChild(groundingText);
  // Desktop exit affordance — the mobile path has the "I'm okay — continue"
  // button, but desktop's only way out was an undocumented second Esc.
  const groundingExitHint = document.createElement("div");
  groundingExitHint.className = "grounding-exit-hint";
  groundingExitHint.textContent = window.t("grnd.exitHint", "Press Esc when you're ready to continue");
  container.appendChild(groundingExitHint);
  let groundingActive = false;
  let groundingStep = 0;
  let groundingTimer = null;
  const groundingScript = [
    { text: window.t("grnd.s5", "Five things you can see. Look around. Name them silently."), duration: 9000 },
    { text: window.t("grnd.s4", "Four things you can hear. Listen carefully."), duration: 8000 },
    { text: window.t("grnd.s3", "Three things you can touch. Notice the texture."), duration: 8000 },
    { text: window.t("grnd.s2", "Two things you can smell."), duration: 6000 },
    { text: window.t("grnd.s1", "One thing you can taste."), duration: 5000 },
    { text: window.t("grnd.s0", "You're here. You're safe. Take a slow breath."), duration: 4000 },
  ];
  function startGrounding() {
    if (groundingActive) return;
    groundingActive = true;
    if (window.PhobiaFear) window.PhobiaFear.setGroundingMode(true);
    // Soften the world under the exercise even when the voice is muted —
    // "four things you can hear" needs the ambience present but gentle.
    try { if (window.PhobiaAudio) window.PhobiaAudio.duck(true); } catch {}
    groundingOverlay.classList.add("active");
    if (!IS_COARSE_POINTER) groundingExitHint.classList.add("visible");
    groundingStep = 0;
    function nextStep() {
      if (!groundingActive || groundingStep >= groundingScript.length) {
        endGrounding();
        return;
      }
      const s = groundingScript[groundingStep++];
      groundingText.textContent = s.text;
      groundingText.classList.add("visible");
      if (window.PhobiaVoice) {
        // 5-4-3-2-1 is the panic exit — the one flow that must be SPOKEN:
        // a panicking user has stopped reading.
        try { window.PhobiaVoice.speak(s.text, { urgent: true, audible: true }); } catch {}
      }
      groundingTimer = setTimeout(() => {
        groundingText.classList.remove("visible");
        groundingTimer = setTimeout(nextStep, 800);   // tracked so unmount can cancel the chain
      }, s.duration);
    }
    nextStep();
  }
  function endGrounding() {
    if (!groundingActive) return;
    groundingActive = false;
    if (groundingTimer) { clearTimeout(groundingTimer); groundingTimer = null; }
    if (window.PhobiaFear) window.PhobiaFear.setGroundingMode(false);
    try { if (window.PhobiaAudio) window.PhobiaAudio.duck(false); } catch {}
    groundingOverlay.classList.remove("active");
    groundingText.classList.remove("visible");
    groundingExitHint.classList.remove("visible");
  }
  // Esc key → grounding (panic stop)
  function onGroundingKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (groundingActive) endGrounding();
      else startGrounding();
    }
  }
  window.addEventListener("keydown", onGroundingKey);
  // Touch panic-stop: phones have no Esc. A persistent "ground me" button
  // above the joystick grounds IN PLACE — unlike the header's "Pause &
  // breathe", the scene survives, so returning to the exposure is one tap.
  let groundBtn = null;
  if (IS_COARSE_POINTER) {
    groundBtn = document.createElement("button");
    groundBtn.className = "ground-btn";
    groundBtn.textContent = window.t("grnd.btn", "🛟 Ground me");
    groundBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (groundingActive) {
        endGrounding();
      } else {
        startGrounding();
        groundBtn.textContent = window.t("grnd.okBtn", "I'm okay — continue");
      }
    });
    container.appendChild(groundBtn);
  }
  // Keep the button label honest however grounding ends (script finished,
  // Esc on a keyboard-attached tablet, etc.).
  const _endGroundingInner = endGrounding;
  endGrounding = function () {
    _endGroundingInner();
    if (groundBtn) groundBtn.textContent = window.t("grnd.btn", "🛟 Ground me");
  };

  // ----- Achievement toast queue -----
  // Slides in from the right when the player hits a milestone for the
  // first time. Persists in localStorage so a user only sees a given
  // milestone once across sessions. Scenes call
  // window.PhobiaFX.achievement(id, icon, title, message).
  const achievementContainer = document.createElement("div");
  achievementContainer.style.position = "absolute";
  achievementContainer.style.inset = "0";
  achievementContainer.style.pointerEvents = "none";
  achievementContainer.style.zIndex = "8";
  container.appendChild(achievementContainer);
  let achievementOffset = 0;
  function showAchievement(id, icon, title, message) {
    if (!id) return;
    let earned = {};
    try { earned = JSON.parse(localStorage.getItem("fobia.achievements") || "{}"); } catch {}
    if (earned[id]) return;       // already shown
    earned[id] = Date.now();
    try { localStorage.setItem("fobia.achievements", JSON.stringify(earned)); } catch {}
    const toast = document.createElement("div");
    toast.className = "achievement-toast";
    // Below the 38px quick-bar (top:14). If the creature-scene trust-hud is
    // present (top-right), start BELOW it too so the milestone toast doesn't
    // cover the dog name / trust bar for its ~4 s life.
    const trustHud = container.querySelector(".trust-hud, .dog-coach");
    const baseTop = trustHud ? (trustHud.offsetTop + trustHud.offsetHeight + 12) : 64;
    toast.style.top = (baseTop + achievementOffset) + "px";
    toast.innerHTML = `
      <div class="achievement-icon">${icon || "🏅"}</div>
      <div class="achievement-text">
        <strong>${title || "Milestone"}</strong>
        <span>${message || ""}</span>
      </div>
    `;
    achievementContainer.appendChild(toast);
    achievementOffset += 70;
    requestAnimationFrame(() => toast.classList.add("visible"));
    setTimeout(() => {
      toast.classList.remove("visible");
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
        achievementOffset = Math.max(0, achievementOffset - 70);
      }, 500);
    }, 3500);
  }
  window.PhobiaFX = window.PhobiaFX || {};
  window.PhobiaFX.achievement = showAchievement;

  // ----- Contextual prompt overlay -----
  // A soft floating message that fades in when the player crosses a
  // character-driven event boundary — e.g. "You're at the edge", "The dog
  // notices you". No buttons; informational only. The active scene calls
  // window.PhobiaFX.contextPrompt(text, durationMs) to drive it.
  const ctxPrompt = document.createElement("div");
  ctxPrompt.className = "ctx-prompt";
  container.appendChild(ctxPrompt);
  let ctxPromptHideT = null;
  // Dedupe: scenes fire the same beat text every time its trigger re-fires
  // ("The dog is coming to you…" on every approach). Showing it once is
  // guidance; showing it five times is noise. A given text repeats only
  // after a 90 s quiet window; the map dies with the scene mount.
  const ctxPromptSeen = new Map();
  // Cross-CHANNEL dedupe: the same beat often lands as a spoken caption, a
  // context prompt AND a reach hint within a frame of each other, worded
  // almost — but not exactly — alike ("Offer a closed fist…" ×3, stacked).
  // A fuzzy key (first 26 alphanumerics) shared across channels lets the
  // first channel through and mutes near-duplicates from the others for 6 s.
  window.PhobiaFX._recentPrompts = window.PhobiaFX._recentPrompts || new Map();
  window.PhobiaFX.promptGate = function (channel, text, windowMs = 6000) {
    const m = window.PhobiaFX._recentPrompts;
    const k = String(text).toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 26);
    if (!k) return true;
    const now = performance.now();
    if (m.size > 40) { for (const [kk, ee] of m) { if (now - ee.t > 30000) m.delete(kk); } }
    const e = m.get(k);
    if (e && e.channel !== channel && now - e.t < windowMs) return false;
    m.set(k, { t: now, channel });
    return true;
  };
  function showContextPrompt(text, durationMs = 4500) {
    const lastAt = ctxPromptSeen.get(text) || 0;
    if (performance.now() - lastAt < 90000) return;
    if (!window.PhobiaFX.promptGate("ctx", text)) return;
    ctxPromptSeen.set(text, performance.now());
    if (ctxPromptHideT) { clearTimeout(ctxPromptHideT); ctxPromptHideT = null; }
    ctxPrompt.textContent = text;
    ctxPrompt.classList.add("visible");
    if (durationMs > 0) {
      ctxPromptHideT = setTimeout(() => {
        ctxPrompt.classList.remove("visible");
        ctxPromptHideT = null;
      }, durationMs);
    }
  }
  // Expose globally so scene update() callbacks can fire prompts
  window.PhobiaFX = window.PhobiaFX || {};
  window.PhobiaFX.contextPrompt = showContextPrompt;

  // ----- Camera-mode toggle button -----
  // Adds a small button in the corner that flips between first-person and
  // third-person view. Third-person reveals the character's full body + face
  // so the user sees themselves walking the platform / petting the dog. Press
  // V on the keyboard for the same toggle. Persists in localStorage.
  const cameraToggle = document.createElement("button");
  cameraToggle.className = "camera-toggle";
  cameraToggle.title = window.t("stage.camTip", "Toggle first-person / third-person (V)");
  function refreshCameraLabel() {
    if (!controls) return;
    // Show CURRENT mode + a hint that it's tappable. The previous label
    // ("1st person") was the mode you'd switch TO — confusing on first
    // contact. New format is "View: 3rd ⇄" so the user instantly sees
    // both their current mode and that the chip is interactive.
    const inTP = controls.cameraMode === "tp";
    cameraToggle.innerHTML = `${window.tf("stage.cam", "View: {m}", { m: inTP ? window.t("stage.camTP", "3rd") : window.t("stage.camFP", "1st") })} <span style="opacity:.7">⇄</span>`;
    // First-person gets a soft CSS vignette on the stage (.fp-view::after) —
    // the through-the-eyes cue. Class-driven so it tracks every toggle path
    // (chip, V key, scene default).
    container.classList.toggle("fp-view", !inTP);
  }
  refreshCameraLabel();
  // Mark that the user has explicitly toggled the camera mode. Session-scoped
  // so the toggle preference sticks within this tab but doesn't override the
  // scene's default the next time they reopen the page.
  function markUserToggled() {
    try { sessionStorage.setItem("fobia.userToggledCamera", "1"); } catch {}
  }
  cameraToggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!controls) return;
    if (controls._cameraModeLocked) return;
    const next = controls.toggleCameraMode();
    if (body) body.setCameraMode(next);
    if (hands && hands.setCameraMode) hands.setCameraMode(next);
    refreshCameraLabel();
    markUserToggled();
  });
  // Keyboard shortcut "V"
  function onCameraKey(e) {
    if (e.code !== "KeyV") return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!controls) return;
    if (controls._cameraModeLocked) return;
    const next = controls.toggleCameraMode();
    if (body) body.setCameraMode(next);
    if (hands && hands.setCameraMode) hands.setCameraMode(next);
    refreshCameraLabel();
    markUserToggled();
  }
  window.addEventListener("keydown", onCameraKey);
  container.appendChild(cameraToggle);
  // Hide the camera-toggle visually whenever the scene is locked to one
  // mode. We defer the check by one frame so the controls' lock flag (set
  // in the result-handling block below) has been applied first.
  setTimeout(() => {
    if (controls && controls._cameraModeLocked) {
      cameraToggle.style.display = "none";
    }
  }, 0);

  // No NPC characters — the user's own avatar is the only character in the
  // scene. Kept the TherapistNPC class definition for future use but we
  // don't instantiate it.
  let therapist = null;

  setActive({
    renderer, scene, camera, composer, onResize, resizeObs, raf: 0,
    overlays: [loading, vignette, badge, hint, reachHint, cameraToggle, ctxPrompt,
               fearVignette, fearMeter, groundingOverlay, groundingText, groundingExitHint,
               achievementContainer],
    controls, hands, body, joystick,
    pointerListeners: { onPointerDownTrack, onPointerUpInteract },
    sceneResult: result,
    sceneCtx, ctxWeatherAudio,
    keyListeners: [
      { event: "keydown", fn: onCameraKey },
      { event: "keydown", fn: onGroundingKey },
    ],
    fearUnsubscribe,
    gyroCleanup,
    wakeLockCleanup,
    fearFXStop,
    // Cancel the 5-4-3-2-1 grounding script (self-chaining timers) + reset the
    // global grounding mode on unmount, or it speaks over — and toggles
    // grounding on — the NEXT scene.
    groundingCleanup: endGrounding,
  });
  // DEBUG (preview/dev only): force-render hooks so screenshots show ground
  // truth even when the rAF-driven loop is throttled (backgrounded tab). These
  // are inert in normal use — nothing calls them unless a tool/devtools does.
  window.__renderNow = () => { try { composer ? composer.render() : renderer.render(scene, camera); } catch (e) {} };
  window.__tickNow   = (n = 1) => { try { for (let i = 0; i < n; i++) tick(); } catch (e) {} };
  window.__active    = active;   // debug: lets the harness pitch the camera etc.
  // Expose a global "fire a hand pulse" hook so scene-specific click
  // handlers (which bypass the renderer's onCanvasClick) can still trigger
  // visible grip feedback when the user touches an interactive object.
  window.PhobiaFX = window.PhobiaFX || {};
  window.PhobiaFX.firePulse = () => { if (hands) hands.fireAction(); };
  // Whole-body flinch for scenes to fire on sharp events (bark, lunge,
  // clang). Reaches the TP avatar; the FP camera has its own kickShake.
  window.PhobiaFX.bodyStartle = (amp) => { try { if (body && body.startle) body.startle(amp); } catch {} };
  // Positive haptic — until now the ONLY thing a phone let you FEEL was the fear
  // heartbeat. Give bravery/affection/completion their own gentle taps (short +
  // distinct from the fear pulse) so success is physiological, not just text.
  window.PhobiaFX.haptic = (pattern) => { try { if (fxCanVibrate && fxHapticsOn()) navigator.vibrate(pattern); } catch {} };
  // Warm completion bloom — the "you faced it and you're safe" payoff. The fear
  // side gets a full-screen vignette + shake + heartbeat; this gives the
  // resolution equal physical weight (opacity-only, so it's reduce-motion safe).
  const celebrateGlow = document.createElement("div");
  celebrateGlow.className = "celebrate-glow";
  container.appendChild(celebrateGlow);
  if (active && active.overlays) active.overlays.push(celebrateGlow);
  window.PhobiaFX.celebrate = () => {
    if (!celebrateGlow.isConnected) return;
    celebrateGlow.classList.remove("on");
    void celebrateGlow.offsetWidth;            // restart the keyframe
    celebrateGlow.classList.add("on");
    if (window.PhobiaFX.haptic) window.PhobiaFX.haptic([28, 60, 28]);
  };
  // Drive the animation loop via setAnimationLoop so WebXR works correctly
  // (XR sessions require this method instead of requestAnimationFrame).
  // Three.js routes the loop through requestAnimationFrame in non-XR mode
  // and through the XR compositor's frame timing in immersive mode.
  //
  // Shaders first, then the first frame. Every program used to be compiled and
  // linked synchronously inside the first render: 40–50 of them in a trial,
  // a main thread frozen for whole seconds on a phone just as the scene
  // appears (5 s under software GL in the dog room). compileAsync hands them
  // all to the driver at once (KHR_parallel_shader_compile) and resolves when
  // they are linked; the loading card holds the stage meanwhile. The composer
  // renders the scene into its read buffer, which selects other program
  // variants (no tone mapping, linear output) than the screen would — so that
  // target is bound while the programs are requested.
  const mountedActive = active;
  let looping = false;
  const startLoop = () => {
    if (looping || active !== mountedActive || !container.isConnected) return;
    looping = true;
    t0 = lastTime = performance.now();
    reveal();
    renderer.setAnimationLoop(pacedTick);
  };
  try {
    renderer.setRenderTarget(composer.readBuffer);
    const ready = compileAhead(renderer, scene, camera);
    renderer.setRenderTarget(null);
    ready.then(startLoop, startLoop);
    // A driver that never reports completion must not hold the scene back.
    setTimeout(startLoop, 6000);
  } catch (e) {
    try { renderer.setRenderTarget(null); } catch {}
    startLoop();
  }

  // ----- WebGL context-loss handler -----
  // When the browser drops the WebGL context (tab backgrounded too long,
  // GPU driver reset, low-memory pressure on mobile), the canvas would go
  // black and never recover without intervention. We pause the loop on
  // loss and re-arm it on restore — and force a one-shot resize so the
  // post-process composer rebuilds its render targets correctly.
  if (renderer.domElement && renderer.domElement.addEventListener) {
    renderer.domElement.addEventListener("webglcontextlost", (ev) => {
      ev.preventDefault();          // tells the browser we'll restore manually
      try { renderer.setAnimationLoop(null); } catch {}
      if (renderer._teardown) return;   // deliberate loss during unmount — not an error
      console.warn("WebGL context lost — pausing scene");
    }, false);
    renderer.domElement.addEventListener("webglcontextrestored", () => {
      console.warn("WebGL context restored — resuming scene");
      try {
        // Force a resize so the renderer + composer rebuild their targets
        if (typeof onResize === "function") onResize();
      } catch {}
      try { renderer.setAnimationLoop(pacedTick); } catch {}
    }, false);
  }

  // ----- VR button -----
  // Only ADD the button when the device actually supports immersive-vr —
  // otherwise it shows "VR NOT SUPPORTED" which is intrusive noise for
  // users on regular desktops/phones. The async check means VR-capable
  // devices still get the button, just a moment later.
  if (navigator.xr && typeof navigator.xr.isSessionSupported === "function") {
    navigator.xr.isSessionSupported("immersive-vr").then(supported => {
      if (!supported || !active) return;
      try {
        const vrButton = VRButton.createButton(renderer);
        if (vrButton) {
          vrButton.style.position = "absolute";
          vrButton.style.bottom = "16px";
          vrButton.style.left = "50%";
          vrButton.style.transform = "translateX(-50%)";
          vrButton.style.zIndex = "9";
          container.appendChild(vrButton);
          if (active.overlays) active.overlays.push(vrButton);
        }
      } catch {}
    }).catch(() => { /* silent — no VR */ });
  }

  // ----- Suppress mouse-look while in VR -----
  // When XR is presenting, FPControls' yaw/pitch must NOT be applied — the
  // headset's pose is already driving camera orientation. We add a session
  // listener to flip a flag on the controls.
  renderer.xr.addEventListener("sessionstart", () => {
    if (controls) controls.enabled = false;
  });
  renderer.xr.addEventListener("sessionend", () => {
    if (controls) controls.enabled = true;
  });

  // ----- VR controllers (Quest Touch / Vision Pro / etc.) -----
  // Each controller is a tracked Object3D the headset positions in world
  // space. We attach a visible controller mesh + a laser pointer ray so the
  // user can physically aim at things in the scene. Trigger ("select")
  // fires a virtual click at whatever the laser is pointing at — this maps
  // controller input to the same onClick + onPointerUpInteract handlers
  // that already drive every interactive object in the app.
  const controllerModelFactory = new XRControllerModelFactory();
  const xrControllers = [];
  const xrLasers = [];
  for (let i = 0; i < 2; i++) {
    const controller = renderer.xr.getController(i);
    scene.add(controller);
    xrControllers.push(controller);
    // Visible controller model (matches actual hardware via the factory)
    const grip = renderer.xr.getControllerGrip(i);
    grip.add(controllerModelFactory.createControllerModel(grip));
    scene.add(grip);
    // Laser pointer — a thin line from the controller forward, ~2m long.
    // Fades to transparent at the tip so it doesn't dominate the view.
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -2),
    ]);
    const laser = new THREE.Line(
      laserGeo,
      new THREE.LineBasicMaterial({ color: 0x7cd1c5, transparent: true, opacity: 0.65 })
    );
    laser.scale.z = 1;
    controller.add(laser);
    xrLasers.push(laser);
    // Reticle dot at the laser tip — small ring that grows when hovering
    // an interactive object (helps the user aim).
    const reticle = new THREE.Mesh(
      new THREE.RingGeometry(0.025, 0.035, 16),
      new THREE.MeshBasicMaterial({ color: 0x7cd1c5, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    reticle.position.z = -2;
    controller.add(reticle);

    // ----- Trigger handling -----
    // On `selectstart` we cast a ray from the controller forward and hand
    // the hit to whatever the renderer would have called for a normal
    // canvas click — the scene's onClick fn or the universal hands pulse.
    const ctrlRay = new THREE.Raycaster();
    const tempMat = new THREE.Matrix4();
    controller.addEventListener("selectstart", () => {
      // Build a ray from the controller's world position forward
      tempMat.identity().extractRotation(controller.matrixWorld);
      ctrlRay.ray.origin.setFromMatrixPosition(controller.matrixWorld);
      ctrlRay.ray.direction.set(0, 0, -1).applyMatrix4(tempMat);
      // Universal pulse so the hand (or controller-tip) acknowledges the click
      if (hands) hands.fireAction();
      // Forward to the scene's onClick handler with controls + scene as
      // arguments, mirroring what onCanvasClick does. The scene can use
      // the renderer.xr.lastControllerRay if it wants the actual ray.
      if (onClickFn) {
        try { onClickFn(controls, hands, scene); } catch (err) { console.warn(err); }
      }
      // Stash the ray so scene-specific raycaster handlers can pick it up
      // (added a getter on PhobiaFX so scenes don't need to know about XR).
      window.PhobiaFX = window.PhobiaFX || {};
      window.PhobiaFX.lastControllerRay = {
        origin: ctrlRay.ray.origin.clone(),
        direction: ctrlRay.ray.direction.clone(),
      };
      window.PhobiaFX.lastControllerRayT = performance.now();
    });
  }
}

export { lastSceneCtx, unmount, loadRealm, realmReady, mount };
