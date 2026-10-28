// Lanternwalk — service worker
//
// Strategy:
//   - The page and the code (HTML / JS / CSS): NETWORK-FIRST. Try the server,
//     refresh the cache copy, fall back to the cache only when offline — so an
//     update always shows on reload.
//   - /assets/ (models, textures, sky, sounds): CACHE-FIRST with a background
//     refresh — they're large and rarely change, and a phone shouldn't make a
//     round trip for each before a trial.
//   - Cross-origin (CDN) requests: network-first with cache fallback.

const VERSION = "lanternwalk-v30";
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
  "./src/story.js",
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
  "./src/3d/live.js",
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
  // Manifests only: the dog vocal bank and ambient beds list what to fetch.
  "./assets/audio/ambient/manifest.json",
  "./assets/audio/dog/manifest.json",
  // Models, coats, the HDR sky and recordings are NOT precached any more —
  // they were ~9 MB downloaded behind the title screen on every first visit,
  // most of it for realms the visitor never opens. Each is cached the first
  // time its realm loads it (see ASSET below) and plays offline from then on.
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

  // Models, textures, sky and sounds under /assets/: answer from the cache at
  // once and refresh the copy in the background. Network-first re-checked
  // ~80 of them on every visit — 80 round trips on a phone before a trial.
  if (isSameOrigin && /\/assets\//.test(url.pathname)) {
    event.respondWith(caches.open(VERSION).then((cache) => cache.match(req).then((hit) => {
      const net = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type !== "opaque") cache.put(req, res.clone()).catch(() => {});
        return res;
      });
      if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
      return net;
    })));
    return;
  }

  // Code and the page: network-first, so an update always shows on reload.
  // Always try the server, refresh the cache, fall back to cache only on
  // network failure.
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
