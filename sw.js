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

const VERSION = "mira-v22-fa-everywhere";
// Installed on the first visit, in the background — so it holds only what the
// creature realms (dogs, spiders, snakes) need to boot and play offline. The
// place realms (heights, the dark, tight spaces) are procedural and need nothing
// extra; everything else (other
// creature models, anim clips, voice) is cached at runtime the first time it
// is actually fetched. Keep this list lean: every byte here is paid by every
// first-time visitor, on phone data too.
const SHELL = [
  "./",                 // the page (manifest start_url is "./" — one copy, not two)
  "./manifest.json",
  "./icon.svg",
  "./src/character.js",
  "./src/phobia-info.js",
  "./src/i18n.js",
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
