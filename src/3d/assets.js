// Model and texture loading: the GLTF cache, the rigged dog and creature
// models, their photo coats, prefetch, and buildCreature().

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
// SkeletonUtils.clone() correctly deep-clones a rigged/skinned mesh (bones +
// skin bindings). A plain Object3D.clone() shares the skeleton and breaks
// animation, so any model we instance from the GLTF cache must use this.
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { smoothCreaseNormals, applyCoatTint } from "./creature-kit.js";

// Scratch vectors reused every frame for the spatial audio listener update
// (avoids per-frame allocation in the render hot path).
const _audVec1 = new THREE.Vector3();
const _audVec2 = new THREE.Vector3();
const _audVec3 = new THREE.Vector3();

// ---------- Asset loader cache (GLTF models from CDN) ----------
const gltfLoader = new GLTFLoader();
const modelCache = new Map();
// One-time migration: clear stale "cameraModeSeen" flags from earlier builds
// so users get the new approach-style flow with their character visible.
// Runs exactly once per device. Without this users who'd opened the page
// before would see the scene without their character because the old code
// persisted a "seen" flag — defeating the whole "see yourself" upgrade.
try {
  if (!localStorage.getItem("fobia.cameraFlowMigratedV2")) {
    ["heights", "dogs", "spiders", "snakes", "water"].forEach(k => {
      try { localStorage.removeItem(k + ".cameraModeSeen"); } catch {}
    });
    localStorage.setItem("fobia.cameraFlowMigratedV2", "1");
  }
} catch {}

function loadGLTF(url) {
  if (modelCache.has(url)) return modelCache.get(url);
  const promise = new Promise((resolve, reject) => {
    gltfLoader.load(url, resolve, undefined, reject);
  });
  modelCache.set(url, promise);
  return promise;
}

// ---------- Dog models (real rigged GLTF — Quaternius "Ultimate Animated
// Animals", CC0 / public domain) ----------
// Two breeds drive the cynophobia difficulty ramp: a small friendly Shiba Inu
// for the early, calm rungs and a larger Husky for the closer / barking rungs.
// Both share an identical armature + animation set, so the DogController code
// is breed-agnostic. Vendored locally under assets/models/ so the app keeps
// working offline (it's an installable PWA).
const DOG_MODELS = {
  shiba: "assets/models/ShibaInu.gltf",
  husky: "assets/models/Husky.gltf",
};
// Breed PBR coat maps — PHOTO-PROJECTED from assets/refs/dog-*-reference.png
// via scripts/bake-dog-photo-coats.cjs. Side-projection UVs (applySidePhotoUVs)
// map these onto the Quaternius meshes so the coat reads as the real animal
// while the armature / clips stay DogController-compatible.
const DOG_COAT_MAPS = {
  shiba: {
    albedo: "assets/models/textures/shiba_photo_albedo.jpg",
    normal: "assets/models/textures/shiba_photo_normal.jpg",
    roughness: "assets/models/textures/shiba_photo_roughness.jpg",
    photo: true,
  },
  husky: {
    albedo: "assets/models/textures/husky_photo_albedo.jpg",
    normal: "assets/models/textures/husky_photo_normal.jpg",
    roughness: "assets/models/textures/husky_photo_roughness.jpg",
    photo: true,
  },
};
const _dogCoatTexCache = new Map();
let _dogTexLoader = null;
function getDogTexLoader() {
  if (_dogTexLoader) return _dogTexLoader;
  try { _dogTexLoader = new THREE.TextureLoader(); } catch { return null; }
  return _dogTexLoader;
}
function loadDogCoatTextures(breed) {
  const urls = DOG_COAT_MAPS[breed] || DOG_COAT_MAPS.shiba;
  const loader = getDogTexLoader();
  if (!urls || !loader) return Promise.resolve(null);
  if (_dogCoatTexCache.has(breed)) return _dogCoatTexCache.get(breed);
  // Photo-projected coats cover the dog once (side UVs); procedural legacy
  // maps tiled because box UVs had no breed silhouette to land on.
  const photo = !!urls.photo;
  const COAT_REPEAT = photo ? 1.0 : 3.0;
  const loadOne = (url, srgb) => new Promise((resolve) => {
    loader.load(url, (t) => {
      if (photo) {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      } else {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
      }
      t.anisotropy = 8;
      t.repeat.set(COAT_REPEAT, COAT_REPEAT);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      resolve(t);
    }, undefined, () => resolve(null));
  });
  const p = Promise.all([
    loadOne(urls.albedo, true),
    loadOne(urls.normal, false),
    loadOne(urls.roughness, false),
  ]).then(([albedo, normal, roughness]) => {
    if (!albedo && !normal && !roughness) return null;
    return { albedo, normal, roughness, photo };
  });
  _dogCoatTexCache.set(breed, p);
  return p;
}
function prefetchDogModels() {
  Object.values(DOG_MODELS).forEach((url) => { try { loadGLTF(url); } catch {} });
  // Warm the coat maps too so the first dog scene doesn't flash plastic.
  Object.keys(DOG_COAT_MAPS).forEach((b) => { try { loadDogCoatTextures(b); } catch {} });
}

// (The protagonist's photo face bake — character_face_*.png — is retired: the
// SDF head is shaded by its own geometry + tint fields. Nothing loads those
// maps any more; they were a 3.2 MB download on every visit for no pixels.)

// ---------- Other creature models (Quaternius "Easy Enemies", CC0) ----------
// Real rigged + animated spider and snake (clips: <Name>_Idle / _Walk / _Attack
// / _Jump). Self-contained GLB (no external textures). Used by setupSpiders /
// setupSnakes via buildCreature() below.
const CREATURE_MODELS = {
  spider: "assets/models/Spider.glb",
  snake:  "assets/models/Snake.glb",
  // (A separate "angry" snake variant was dropped: the base rig's Attack /
  // Walk clips now cover the defensive display, and the extra file never
  // shipped — prefetching it just 404'd on every boot.)
};
function prefetchCreatureModels() {
  Object.values(CREATURE_MODELS).forEach((url) => { try { loadGLTF(url); } catch {} });
}

// Generic rigged-creature loader. Returns a Group SYNCHRONOUSLY (so scenes can
// position it immediately) and streams the skinned model in. Once loaded,
// group.userData.parts holds { model, mixer, height, span, footOffset, play() }.
// `play(nameSubstr, fade, { once, timeScale })` cross-fades to the first clip
// whose name matches (case-insensitive), so it works regardless of the pack's
// "Armature|Creature_Idle" naming. Geometry + materials are deep-cloned per
// instance so unmount's disposeObject() never touches the shared cache.
function buildCreature(url, opts = {}) {
  const group = new THREE.Group();
  const parts = {};
  group.userData.parts = parts;
  group.userData.ready = false;
  loadGLTF(url).then((gltf) => {
    if (group.userData.disposed) return;
    const model = cloneSkinned(gltf.scene);
    model.traverse((o) => {
      if (o.isMesh) {
        o.geometry = o.geometry.clone();
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        // Same crease-limited smoothing as the dogs: chitin and scale plates
        // curve under light instead of reading as folded paper; leg joints
        // and fangs keep their edges (see smoothCreaseNormals by buildDog).
        smoothCreaseNormals(o.geometry, Math.cos(Math.PI / 3));
      }
    });
    // Per-traveller colouring, if the caller asked for one. Materials are
    // already cloned above, so this never touches the shared cache.
    if (opts.coat) applyCoatTint(model, opts.coat);
    if (opts.yaw) model.rotation.y = opts.yaw;
    // Measure from the actual MESH geometry (bind pose), not setFromObject() of
    // the whole model — these rigs carry IK pole-target bones positioned far
    // from the body, which inflate an object-level bbox and would scale the
    // creature down to nothing. Union each skinned mesh's own geometry bbox.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3();
    let measured = false;
    model.traverse((o) => {
      if (o.isMesh && o.geometry) {
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
        if (!measured) { box.copy(b); measured = true; } else box.union(b);
      }
    });
    const sz = new THREE.Vector3(); box.getSize(sz);
    const axis = opts.axis || "max";
    const ref = axis === "y" ? sz.y : Math.max(sz.x, sz.y, sz.z);
    const S = opts.targetSize ? opts.targetSize / Math.max(0.001, ref) : (opts.scale || 1);
    model.scale.setScalar(S);
    model.position.y = -box.min.y * S;     // feet/belly on the Group origin
    parts.height = sz.y * S;
    parts.span = Math.max(sz.x, sz.z) * S;
    parts.footOffset = -box.min.y * S;
    group.add(model);
    parts.model = model;
    const mixer = new THREE.AnimationMixer(model);
    parts.mixer = mixer;
    const actions = {};
    gltf.animations.forEach((c) => { actions[c.name] = mixer.clipAction(c); });
    parts.actions = actions;
    parts.current = null;
    parts.play = (substr, fade = 0.3, o2 = {}) => {
      const clip = gltf.animations.find((c) => new RegExp(substr, "i").test(c.name));
      if (!clip) return;
      const a = actions[clip.name];
      if (parts.current === a && !o2.force) return;
      if (parts.current && parts.current !== a) parts.current.fadeOut(fade);
      a.reset(); a.enabled = true;
      a.setLoop(o2.once ? THREE.LoopOnce : THREE.LoopRepeat, o2.once ? 1 : Infinity);
      a.clampWhenFinished = !!o2.once;
      a.timeScale = o2.timeScale || 1;
      a.fadeIn(fade).play();
      parts.current = a;
    };
    group.userData.ready = true;
    if (typeof group.userData.onReady === "function") group.userData.onReady();
  }).catch((err) => {
    console.warn("[creature] model load failed:", url, err);
    // Fallback so the exposure is never a silently EMPTY scene (e.g. a CDN
    // hiccup or a missing asset). A simple dark placeholder at the creature's
    // spot keeps the proximity/gaze fear mechanic working (it keys off the
    // group's position, not the model) and gives the user something to face.
    // No animation clips, so the scene's mixer-guarded update simply skips them.
    try {
      const ph = new THREE.Mesh(
        new THREE.SphereGeometry(0.25, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.6 })
      );
      ph.scale.set(1.7, 0.7, 1.1);
      ph.position.y = 0.18;
      ph.castShadow = true;
      group.add(ph);
      parts.height = 0.35; parts.span = 0.6; parts.footOffset = 0;
      group.userData.ready = true;
      group.userData.loadFailed = true;
      if (typeof group.userData.onReady === "function") group.userData.onReady();
    } catch (e) { console.warn("[creature] fallback failed:", e); }
  });
  return group;
}

export { _audVec1, _audVec2, _audVec3, loadGLTF, DOG_MODELS, DOG_COAT_MAPS, getDogTexLoader, loadDogCoatTextures, prefetchDogModels, CREATURE_MODELS, prefetchCreatureModels, buildCreature };
