// Device detection, the graphics quality tier, the WebGLRenderer factory and
// the shared environment maps (room PMREM, meadow HDR).

import * as THREE from "three";
// PMREM + RoomEnvironment gives every PBR surface real reflections without
// loading an HDR file. Drop-in cinematic look upgrade.
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";

function disposeObject(root) {
  root.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const m of mats) {
        for (const k of Object.keys(m)) {
          const v = m[k];
          if (v && v.isTexture) v.dispose();
        }
        m.dispose();
      }
    }
  });
}

// ---------- Device detection + quality tier ----------
const IS_TOUCH = (typeof window !== "undefined") && (("ontouchstart" in window) || (navigator.maxTouchPoints > 0));
// A genuinely touch-FIRST device (phone/tablet) — distinct from a touch-capable
// laptop with a trackpad+mouse. Only these get the on-screen joystick; a touch
// laptop keeps mouse-look + WASD.
const IS_COARSE_POINTER = ((typeof window !== "undefined") && window.matchMedia
  && window.matchMedia("(pointer: coarse)").matches)
  // Dev override so the touch UI can be exercised on a desktop browser:
  // localStorage.setItem("fobia.forceTouch", "1") + reload.
  || (() => { try { return localStorage.getItem("fobia.forceTouch") === "1"; } catch { return false; } })();
const IS_MOBILE = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
// Only genuinely weak hardware auto-drops to "low": 2 threads, 2 GB, or a
// 4-thread phone / low-memory machine (deviceMemory is absent on iOS, but
// every iPhone that runs this clears the core check). A modern phone GPU
// handles medium comfortably — "is a phone" alone doesn't force the flat,
// shadowless tier. A 4-thread laptop with memory to spare used to land on
// low too; it starts on medium now, and the frame governor (plus the
// remembered demotion in resolveQuality) catches any that can't hold it.
const WEAK_DEVICE = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2)
  || (navigator.deviceMemory && navigator.deviceMemory <= 2)
  || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4
      && (IS_MOBILE || (navigator.deviceMemory && navigator.deviceMemory <= 4)));
const MODEST_DEVICE = !!(navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

// Read the user's chosen graphics tier (settings drawer) and resolve to a tier.
// We re-evaluate on every mount, so the user's choice takes effect on the next
// scene without a page reload.
function resolveQuality() {
  let pref = "auto";
  try { pref = localStorage.getItem("fobia.quality") || "auto"; } catch {}
  if (pref === "auto") {
    const base = WEAK_DEVICE ? "low" : (IS_MOBILE || MODEST_DEVICE) ? "medium" : "high";
    // A scene that had to shed effects on "auto" remembers it for two weeks
    // (or until the player picks a Graphics setting themselves).
    let demoted = null;
    try {
      const d = JSON.parse(localStorage.getItem("fobia.autoTier") || "null");
      if (d && d.tier && Date.now() - d.at < 14 * 864e5) demoted = d.tier;
    } catch {}
    const rank = { low: 0, medium: 1, high: 2 };
    return demoted && rank[demoted] < rank[base] ? demoted : base;
  }
  return pref;
}
// Called by the frame governor: on "auto", start the next scene one tier down.
function demoteAutoTier(current) {
  try {
    if ((localStorage.getItem("fobia.quality") || "auto") !== "auto") return;
    const next = current === "high" ? "medium" : "low";
    if (next === current) return;
    localStorage.setItem("fobia.autoTier", JSON.stringify({ tier: next, at: Date.now() }));
  } catch {}
}
let QUALITY = resolveQuality();
let IS_LOW_POWER = QUALITY === "low";
// CSS backdrop blurs are dropped below the high tier (html.fx-lite — see the
// end of the main style block). Re-synced whenever a renderer is made, so a
// changed Graphics setting reaches the page's chrome with the next scene.
function syncFxLite(tier) {
  try { document.documentElement.classList.toggle("fx-lite", (tier || resolveQuality()) !== "high"); } catch {}
}
syncFxLite(QUALITY);
// The one scene-facing tier accessor. QUALITY is re-resolved inside
// makeRenderer, which mount() calls before any scene's setup() runs, so scene
// code may branch on this safely without re-reading localStorage.
function sceneQuality() { return QUALITY; }

function makeRenderer(container) {
  // Re-evaluate every mount so settings changes apply immediately
  QUALITY = resolveQuality();
  IS_LOW_POWER = QUALITY === "low";
  syncFxLite(QUALITY);
  const isMedium = QUALITY === "medium";
  const renderer = new THREE.WebGLRenderer({
    // No canvas MSAA on any tier. The scene is drawn into the EffectComposer's
    // own (single-sampled) target, so a multisampled canvas only ever received
    // the final full-screen copy: medium paid for 4× colour + depth at device
    // resolution (~24 MB on a DPR-1.5 phone) and got no anti-aliasing for it.
    // High anti-aliases with SMAA in the post chain.
    antialias: false,
    powerPreference: IS_LOW_POWER ? "low-power" : "high-performance",
    stencil: false,                    // we don't use stencil; saves bandwidth
  });
  renderer.setPixelRatio(IS_LOW_POWER ? 1 : Math.min(window.devicePixelRatio, isMedium ? 1.5 : 2));
  renderer.setSize(container.clientWidth || 800, container.clientHeight || 360);
  renderer.shadowMap.enabled = !IS_LOW_POWER;
  // VSM (Variance Shadow Maps) give a real soft penumbra at the cost of one
  // extra blur pass per shadow caster — much cleaner than PCF stair-stepping.
  // Falls back to PCF on medium and Basic on low.
  renderer.shadowMap.type = IS_LOW_POWER ? THREE.BasicShadowMap
                          : isMedium    ? THREE.PCFSoftShadowMap
                          : THREE.VSMShadowMap;
  // ACES Filmic — the gold-standard cinematic tone mapping. Real cameras
  // and films use this curve so our output matches viewer expectations of
  // "this looks like a real photograph". Exposure 1.05 lifts mid-tones a
  // touch (real cinematography under-exposes slightly compared to our
  // procedural lighting which lacks bounce), making every scene feel less
  // washed out and more like a professional render.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // ACES Filmic rolls off highlights and darkens mid-tones, so 1.05 left every
  // scene reading as overcast/dusk. 1.32 lifts the mid-tones into real daylight
  // without blowing out highlights (ACES handles the top end gracefully).
  renderer.toneMappingExposure = 1.32;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // (Physical light units are the r155+ default; setting useLegacyLights
  // explicitly only triggered a deprecation warning on every mount.)
  // ---- High-quality shadow tuning ----
  // Soft shadows give the single biggest "this isn't a video game" lift.
  // Shadows still re-render every frame so they track moving meshes (cars,
  // the dog) — but ONCE per frame. With autoUpdate on, EVERY renderer.render
  // call redraws every shadow map, and the frame makes more than one: the
  // SSAO pass re-renders the scene for its normal/depth buffer, so the
  // shadow maps were drawn twice a frame (measured ~2 ms at DPR 2 in the dog
  // room, 90 draws each). mount()'s tick raises needsUpdate right before its
  // one frame render; the first render consumes it, later ones reuse it.
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  // Enable WebXR — required for VRButton.createButton() to actually start a
  // session when the user clicks "ENTER VR". Browsers without WebXR support
  // simply ignore this flag.
  renderer.xr.enabled = true;
  return renderer;
}

// PMREM-baked studio environment, one PER RENDERER. Building it costs ~10 ms
// and gives every metal/roughness surface real reflections. It used to be one
// global built for whichever view mounted first — but a PMREM result is a
// render target living in THAT renderer's GL context, and every view (shell
// vignettes, each trial) makes its own renderer. Every later view bound an
// empty texture as its environment: the camp after a language toggle went
// near-black, and each trial after the first lost its image-based light.
const _envMaps = new WeakMap();
function getRoomEnvMap(renderer) {
  if (!renderer) return null;
  if (_envMaps.has(renderer)) return _envMaps.get(renderer);
  let tex = null;
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = new RoomEnvironment(renderer);
    tex = pmrem.fromScene(env, 0.04).texture;
    pmrem.dispose();
  } catch (e) {
    console.warn("PMREM env map build failed:", e);
    tex = null;
  }
  _envMaps.set(renderer, tex);
  return tex;
}

// Outdoor equirect HDR for scenes that want real sky/ground reflections rather
// than the RoomEnvironment studio box. Cached as the DECODED DataTexture, not
// as a PMREM: the PMREM output lives in a renderer's GL context, so it must be
// rebuilt (and disposed) per mount, while the 1.4 MB decode is renderer-
// agnostic and worth keeping. Resolves to null if the file is missing.
let _meadowHDR = null;
function loadMeadowHDR() {
  if (_meadowHDR) return _meadowHDR;
  _meadowHDR = new Promise((resolve) => {
    try {
      new RGBELoader().load(
        "assets/env/meadow_1k.hdr",
        (tex) => resolve(tex),
        undefined,
        () => resolve(null),
      );
    } catch { resolve(null); }
  });
  return _meadowHDR;
}

export { disposeObject, IS_COARSE_POINTER, resolveQuality, demoteAutoTier, QUALITY, IS_LOW_POWER, syncFxLite, sceneQuality, makeRenderer, getRoomEnvMap, loadMeadowHDR };
