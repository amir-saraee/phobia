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
// A phone or tablet: the UA says so, or it is an iPad in desktop clothing
// (iPadOS Safari reports "MacIntel" — the touch points give it away), or its
// primary pointer is a finger. Tablets used to fall through to the desktop
// tiers and got SSAO, VSM shadows and DPR 2 on a phone-class GPU.
const IS_MOBILE = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "")
  || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  || IS_COARSE_POINTER;
const HW_CORES = navigator.hardwareConcurrency || 0;
const HW_MEM = navigator.deviceMemory || 0;      // GB, Chromium only, capped at 8

// ---------- GPU probe ----------
// Cores and RAM said nothing about the part that actually draws the frames:
// an 8-thread laptop on Intel UHD graphics landed on "high" (SSAO, VSM 2048
// shadows, SMAA, DPR 2) and a software rasteriser (SwiftShader, llvmpipe —
// what Chrome falls back to on a blocklisted driver) was never noticed at
// all. One throwaway context, read once per page and remembered per browser
// for a week, so the menus don't pay for it on every visit — and only made
// when a real WebGL context is about to be (a trial, a menu vignette): the
// title screen is SVG and makes none, so `probe = false` (module load, the
// prefetch) settles for the cached answer or none.
let _gpu = null;
function probeGPU(probe = true) {
  if (_gpu) return _gpu;
  const ua = navigator.userAgent || "";
  try {
    const c = JSON.parse(localStorage.getItem("fobia.gpuProbe") || "null");
    if (c && c.ua === ua && Date.now() - c.at < 7 * 864e5 && typeof c.r === "string") {
      _gpu = { renderer: c.r, software: !!c.sw };
      return _gpu;
    }
  } catch {}
  if (!probe) return { renderer: "", software: false };
  let r = "", sw = false;
  try {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    // A context that refuses to exist without a major performance caveat is
    // a software one (or none at all); a second, permissive attempt tells
    // the two apart.
    let gl = cv.getContext("webgl", { failIfMajorPerformanceCaveat: true, antialias: false, depth: false });
    if (!gl) {
      const cv2 = document.createElement("canvas");
      cv2.width = cv2.height = 1;
      gl = cv2.getContext("webgl", { antialias: false, depth: false });
      if (gl) sw = true;
    }
    if (gl) {
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      r = String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
      const lose = gl.getExtension("WEBGL_lose_context");
      if (lose) lose.loseContext();
    }
  } catch {}
  if (/SwiftShader|llvmpipe|softpipe|Software|Basic Render|Mesa OffScreen/i.test(r)) sw = true;
  _gpu = { renderer: r, software: sw };
  try { localStorage.setItem("fobia.gpuProbe", JSON.stringify({ ua, at: Date.now(), r, sw: sw ? 1 : 0 })); } catch {}
  return _gpu;
}
// The GPU's class from its renderer string: "low", "mid", "high", or null
// when the string says nothing useful (Safari reports "Apple GPU" for every
// iPhone, iPad and Mac). Mobile parts are graded against each other — a
// "high" phone GPU still gets the medium tier, phones never get "high".
function gpuClass(r) {
  if (!r) return null;
  let m;
  // ---- Mobile ----
  if ((m = /Adreno\D*(\d{3})/i.exec(r))) {
    const n = +m[1];
    // 6xx below 615 and everything older are budget parts; the 7xx line
    // starts mid-range (710) and goes up.
    if (n >= 700) return n >= 720 ? "high" : "mid";
    return n >= 640 ? "high" : (n >= 615 ? "mid" : "low");
  }
  if (/Immortalis|Xclipse/i.test(r)) return "high";
  if ((m = /Mali-?([GT])(\d+)/i.exec(r))) {
    if (m[1].toUpperCase() === "T") return "low";
    const n = +m[2];
    // G31/G51/G52/G57: budget phones. G68/G71/G72/G76: mid. G77/G78, G610+: high.
    if (n < 60) return "low";
    return (n >= 77 && n < 100) || n >= 610 ? "high" : "mid";
  }
  if (/Mali/i.test(r)) return "low";
  if (/PowerVR|IMG BXM|Rogue/i.test(r)) return "low";
  if (/Apple (M\d|A1[2-9])/i.test(r)) return "high";
  if (/Apple GPU/i.test(r)) return null;
  // ---- Desktop ----
  if (/Intel/i.test(r)) {
    if (/Arc\(?T?M?\)? ?A\d{3}/i.test(r)) return "high";        // discrete Arc A3xx–A7xx
    // Xe-class integrated (Iris Xe, Arc/"Intel Graphics" in Meteor Lake and
    // later, desktop UHD 7xx) and the bigger pre-Xe Iris parts: medium.
    if (/Iris|Arc|Intel\(R\) Graphics\b(?! \d)|UHD Graphics 7\d\d/i.test(r)) return "mid";
    // HD / UHD 6xx (the same Gen9 part under two names) and the unnumbered
    // UHD of Celeron/Pentium/N-series: the weakest GPUs still in use.
    return "low";
  }
  if (/Radeon/i.test(r)) {
    // APU graphics ("Radeon(TM) Graphics", "Vega 8 Graphics", "R7 Graphics").
    if (/Radeon\(TM\) Graphics|Radeon Graphics|Vega \d+ Graphics|Radeon R\d Graphics|Radeon\(TM\) R\d/i.test(r)) return "mid";
    return "high";
  }
  if (/GeForce|NVIDIA|Quadro|RTX/i.test(r)) {
    if (/GeForce (MX|GT |9\d0M|8\d0M|7\d0M)|GT \d{3}/i.test(r)) return "mid";
    return "high";
  }
  return null;
}
// The automatic tier, before any remembered demotion. User override and the
// demotion live in resolveQuality.
function autoTier(probe = true) {
  const g = probeGPU(probe);
  if (g.software) return "low";
  // Hard floors whatever the GPU: 2 threads or 2 GB can't feed any of it.
  if ((HW_CORES && HW_CORES <= 2) || (HW_MEM && HW_MEM <= 2)) return "low";
  const cls = gpuClass(g.renderer);
  if (IS_MOBILE) {
    if (cls === "low") return "low";
    // Unknown GPU (every iPhone/iPad): the old core/RAM read. A 4-thread
    // phone, or a 4 GB Android, is a budget device.
    if (cls == null) return ((HW_CORES && HW_CORES <= 4) || (HW_MEM && HW_MEM <= 4)) ? "low" : "medium";
    // A mid-range GPU in a 4 GB phone is a budget device; a flagship GPU
    // copes with medium even there.
    if (cls === "mid" && HW_MEM && HW_MEM <= 4) return "low";
    return "medium";
  }
  if (cls === "low") return "low";
  if (cls === "mid") return (HW_CORES && HW_CORES <= 4 && HW_MEM && HW_MEM <= 4) ? "low" : "medium";
  if (cls === "high") return "high";
  // Desktop, unknown GPU (Safari on a Mac): 4 threads/4 GB → low, 4 threads → medium.
  if (HW_CORES && HW_CORES <= 4) return (HW_MEM && HW_MEM <= 4) ? "low" : "medium";
  return "high";
}

// Read the user's chosen graphics tier (settings drawer) and resolve to a tier.
// We re-evaluate on every mount, so the user's choice takes effect on the next
// scene without a page reload.
function resolveQuality(probe = true) {
  let pref = "auto";
  try { pref = localStorage.getItem("fobia.quality") || "auto"; } catch {}
  if (pref === "auto") {
    const base = autoTier(probe);
    // A scene that had to shed effects on "auto" remembers it for two weeks
    // (or until the player picks a Graphics setting themselves).
    let demoted = null;
    try {
      const d = JSON.parse(localStorage.getItem("fobia.autoTier") || "null");
      // Three days, not fourteen: one bad session (a hot phone, a background
      // download) shouldn't cost two weeks of the lower tier.
      if (d && d.tier && Date.now() - d.at < 3 * 864e5) demoted = d.tier;
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
let QUALITY = resolveQuality(false);
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
// Anisotropic filtering per tier. 8× on every texture was a texture-bandwidth
// tax the low tier paid on the floor, walls and coats alike; at DPR 1 on a
// small screen 2× is indistinguishable from 8× and medium's 4× nearly so.
// (three clamps to the device maximum on upload.)
function texAniso() { return QUALITY === "low" ? 2 : QUALITY === "medium" ? 4 : 8; }
// The probed GPU, for the performance overlay and the bug-report line.
function gpuInfo() { const g = probeGPU(); return { renderer: g.renderer, software: g.software, cls: gpuClass(g.renderer), mobile: IS_MOBILE }; }

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
  // Reading back every program's compile log costs ~250 ms of a trial's
  // mount on a slow CPU. Kept for QA (?debug=1).
  renderer.debug.checkShaderErrors = /[?&]debug=1/.test(location.search);
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
// Every caller gets its own Texture over the one decoded image: a renderer
// that draws a texture hangs a dispose listener on that object, and on the
// shared cached one those listeners kept every past renderer, scene and
// canvas alive (one per trial, never collected).
function loadMeadowHDR() {
  return loadMeadowHDRBase().then((t) => {
    if (!t) return null;
    const c = t.clone();
    c.needsUpdate = true;
    return c;
  });
}
function loadMeadowHDRBase() {
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

export { disposeObject, IS_COARSE_POINTER, IS_MOBILE, resolveQuality, demoteAutoTier, QUALITY, IS_LOW_POWER, syncFxLite, sceneQuality, texAniso, gpuInfo, makeRenderer, getRoomEnvMap, loadMeadowHDR };
