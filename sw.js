// Mira — Service worker (network-first for shell during active development)
//
// Strategy:
//   - Same-origin requests: NETWORK-FIRST. Try the server first; if the request
//     succeeds, refresh the cache copy and return the fresh response. Only fall
//     back to cache when offline. This means HTML / JS / CSS updates always
//     show on reload — no stale-cache surprise during development.
//   - Cross-origin (CDN) requests: NETWORK-FIRST with cache fallback. Same
//     principle for unpkg / jsdelivr.
//
// If you want true offline-only optimised loads, switch back to cache-first
// later — the version bumping is in place. For now correctness > load speed.

const VERSION = "mira-v25-modules";
// Installed on the first visit, in the background — so it holds only what the
// six open realms need to boot and play offline: their code, plus the models
// and textures of the creature realms (dogs, spiders, snakes; the place realms
// are procedural). Everything else (other creature models, anim clips, voice,
// the three.js addons) is cached at runtime the first time it is fetched.
// Keep this list lean: every byte here is paid by every first-time visitor,
// on phone data too.
const SHELL = [
  "./",                 // the page (manifest start_url is "./" — one copy, not two)
  "./manifest.json",
  "./icon.svg",
  "./src/character.js",
  "./src/phobia-info.js",
  "./src/i18n.js",
  // The game's code: the stylesheet, the app shell (classic scripts, in load
  // order) and the 3D modules — the engine and the six open realms. Legacy
  // realms (?all=1) are cached the first time they are played.
  "./src/styles.css",
  "./src/app/boot-guards.js",
  "./src/app/audio.js",
  "./src/app/fear-voice.js",
  "./src/app/scene-art.js",
  "./src/app/realm-data.js",
  "./src/app/progress.js",
  "./src/app/router.js",
  "./src/app/handlers.js",
  "./src/app/views-journey.js",
  "./src/app/views-trial.js",
  "./src/app/experiments.js",
  "./src/app/exposure.js",
  "./src/app/data-tools.js",
  "./src/app/boot.js",
  "./src/3d/main.js",
  "./src/3d/assets.js",
  "./src/3d/avatar.js",
  "./src/3d/body.js",
  "./src/3d/coach.js",
  "./src/3d/controls.js",
  "./src/3d/creature-kit.js",
  "./src/3d/dog-controller.js",
  "./src/3d/dog-model.js",
  "./src/3d/dog-rig.js",
  "./src/3d/engine.js",
  "./src/3d/hands.js",
  "./src/3d/human-base.js",
  "./src/3d/human-head.js",
  "./src/3d/human-motion.js",
  "./src/3d/human-rig.js",
  "./src/3d/physics.js",
  "./src/3d/postfx.js",
  "./src/3d/renderer.js",
  "./src/3d/scene-context.js",
  "./src/3d/shell-scenes.js",
  "./src/3d/textures.js",
  "./src/3d/therapist.js",
  "./src/3d/realms/dark.js",
  "./src/3d/realms/dogs.js",
  "./src/3d/realms/enclosed.js",
  "./src/3d/realms/heights.js",
  "./src/3d/realms/index.js",
  "./src/3d/realms/snakes.js",
  "./src/3d/realms/spiders.js",
  // Self-hosted three.js (0.160.0). The addons it pulls are runtime-cached.
  "./assets/vendor/three/three.module.min.js",
  // Rigged dogs (Quaternius, CC0) + their photo-projected coats (JPEG ship
  // copies — scripts/compress-textures.cjs).
  "./assets/models/ShibaInu.gltf",
  "./assets/models/Husky.gltf",
  "./assets/models/textures/shiba_photo_albedo.jpg",
  "./assets/models/textures/shiba_photo_normal.jpg",
  "./assets/models/textures/shiba_photo_roughness.jpg",
  "./assets/models/textures/husky_photo_albedo.jpg",
  "./assets/models/textures/husky_photo_normal.jpg",
  "./assets/models/textures/husky_photo_roughness.jpg",
  // The cellar spider and the meadow snake (Quaternius, CC0; ~0.65 MB both).
  "./assets/models/Spider.glb",
  "./assets/models/Snake.glb",
  // Meadow window backdrop + outdoor HDRI (the dog room's window light, and
  // the snake meadow's whole sky).
  "./assets/models/textures/meadow_window.jpg",
  "./assets/env/meadow_1k.hdr",
  // Recorded ambient beds + the dog vocal bank manifest (samples cache at
  // runtime; a missing sample falls back to synthesis per-kind).
  "./assets/audio/ambient/manifest.json",
  "./assets/audio/ambient/room_soft.mp3",
  "./assets/audio/ambient/birds.mp3",
  "./assets/audio/dog/manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = /unpkg\.com|cdn\.jsdelivr\.net|threejs\.org/.test(url.hostname);

  // Bypass everything else (chrome-extension://, blob://, etc.)
  if (!isSameOrigin && !isCDN) return;

  // Network-first for both. Always try the server, refresh the cache, fall
  // back to cache only on network failure.
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && res.type !== "opaque") {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req).then((hit) =>
      // Offline page loads by any path (/, /index.html, an old installed
      // start_url) fall back to the one cached copy of the page.
      hit || (req.mode === "navigate" ? caches.match("./") : undefined)))
  );
});
