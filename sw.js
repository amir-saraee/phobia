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

const VERSION = "mira-v8.1-real-creatures";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./src/character.js",
  "./src/phobia-info.js",
  // Real rigged creature models (Quaternius, CC0) used by the dog / spider /
  // snake scenes. Precached so those scenes work fully offline once installed.
  "./assets/models/ShibaInu.gltf",
  "./assets/models/Husky.gltf",
  "./assets/models/Spider.glb",
  "./assets/models/Snake.glb",
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
    }).catch(() => caches.match(req))
  );
});
