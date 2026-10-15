// ---------- Three.js 3D scenes ----------
// Each phobia gets its own immersive scene. Mounts a WebGL canvas into a
// container, runs an animation loop, and cleans up on unmount.
//
// This entry module is what the menus need up front: the vignettes behind
// them (ShellScenes), the character creator's turntable (AvatarPreview) and
// the asset prefetch. The exposure engine (engine.js) and each realm's scene
// code are fetched on demand — see mount() below.
import { prefetchDogModels, prefetchCreatureModels } from "./assets.js";
import { REALMS } from "./realms/index.js";
import "./avatar.js";        // window.AvatarPreview
import "./shell-scenes.js";  // window.ShellScenes

// ---------- The engine and realms, on demand ----------
// A failed load can't be retried in place: the browser keeps a module that
// failed to fetch as failed until the page reloads, which is what the 2D
// fallback's note tells the player to do.
let engine = null;           // engine.js, once loaded
let enginePromise = null;
function loadEngine() {
  return enginePromise || (enginePromise = import("./engine.js").then((m) => (engine = m)));
}
// Code a trial is waiting on. The model prefetch holds off until it lands: on
// a slow phone link the multi-MB GLTFs would otherwise starve it.
const codeInFlight = new Set();
function preload(phobiaKey) {
  // Start the realm's module now rather than after the engine: the two
  // download side by side, and loadRealm() then finds the realm already
  // in the browser's module map.
  const p = Promise.all([loadEngine(), REALMS[phobiaKey]()]).then(([m]) => m.loadRealm(phobiaKey));
  const settled = p.catch(() => {});
  codeInFlight.add(settled);
  settled.then(() => codeInFlight.delete(settled));
  return p;
}

// Every mount and unmount bumps this. A mount still waiting on its code checks
// it before landing, so a player who has already moved on never gets a scene
// mounted into a page they left.
let mountSeq = 0;

// Synchronous when the engine and the realm's code are already here — the
// usual case, since render() preloads a realm from its ladder and predict
// pages. A cold first entry (a deep link straight into a trial) shows the same
// loading hint, mounts when the code arrives, and returns a promise that
// rejects if it can't, so the caller falls back to the 2D scene just as it
// does for a synchronous throw.
function mount(phobiaKey, container, level, levelIdx, opts) {
  if (!REALMS[phobiaKey]) throw new Error("Unknown phobia: " + phobiaKey);
  const seq = ++mountSeq;
  if (engine && engine.realmReady(phobiaKey)) return engine.mount(phobiaKey, container, level, levelIdx, opts);
  const loading = document.createElement("div");
  loading.className = "loading";
  loading.textContent = window.t("stage.loading", "Setting the scene…");
  container.appendChild(loading);
  const stale = () => seq !== mountSeq || !container.isConnected;
  return preload(phobiaKey).then(() => {
    loading.remove();
    if (!stale()) engine.mount(phobiaKey, container, level, levelIdx, opts);
  }, (err) => {
    loading.remove();
    if (!stale()) throw err;
  });
}

function unmount() {
  mountSeq++;
  if (engine) engine.unmount();
}

// ---------- Asset prefetch ----------
// Fetches the exposure engine and the scene code of the realm the traveler is
// headed for, then warms the GLTFLoader cache for that realm's models (the
// dogs are ~6 MB of models and coats — no use to someone walking the Summit)
// so its scene mounts without a hitch. Code first: the models wait until no
// realm's code is still on its way. Only once the main thread is idle, and
// nothing at all on a data-saver or 2G connection: the scene loads what it
// needs when it opens.
function prefetch(opts = {}) {
  try {
    const c = navigator.connection;
    if (c && (c.saveData || /(^|-)2g$/.test(c.effectiveType || ""))) return;
  } catch {}
  const realm = opts.realm || "dogs";
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 300));
  idle(() => {
    const code = REALMS[realm] ? preload(realm) : loadEngine();
    const settled = code.catch(() => { /* silent — the trial that needs it shows the fallback */ });
    Promise.all([settled, ...codeInFlight]).then(() => {
      if (realm === "dogs") { try { prefetchDogModels(); } catch { /* not critical */ } }
      if (realm === "spiders" || realm === "snakes") { try { prefetchCreatureModels(realm === "spiders" ? "spider" : "snake"); } catch { /* not critical */ } }
    });
  }, { timeout: 4000 });
}

// ---------- Expose to the classic script ----------
window.Scene3D = {
  ready: true, mount, unmount, prefetch,
  // Fetch a realm's scene code ahead of its trial; render() calls this on
  // every realm page. Custom realms have no 3D scene, so nothing to fetch.
  preload(phobiaKey) {
    if (REALMS[phobiaKey]) preload(phobiaKey).catch(() => { /* silent — the trial shows the fallback */ });
  },
  // Which conditions a rung was practised in. Reads the LAST MOUNTED scene, not
  // the live one: the player rates a rung from the rate view, by which point the
  // scene has already been unmounted and `active` is null. Reading `active` here
  // meant every real session logged no conditions at all — it only ever worked
  // against seeded test data. Caller passes the phobia and rung so a stale
  // context can never be attributed to a different exposure.
  currentContext(phobiaKey, levelIdx) {
    const c = engine && engine.lastSceneCtx;
    if (!c) return null;
    if (phobiaKey != null && (c.phobia !== phobiaKey || c.level !== (levelIdx | 0))) return null;
    return { hour: c.hour, weather: c.weather, label: c.label, visit: c.visit };
  },
};
window.dispatchEvent(new Event("scene3d-ready"));
