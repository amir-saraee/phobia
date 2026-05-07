// Step Up — Service worker
// A conservative cache-first strategy for the app shell, network-first for
// CDN modules so users get updates when online. Big binary models (Khronos
// Fox.glb) are cached on first successful fetch so the dog scene works
// offline after the user has opened it once.

const VERSION = "stepup-v3.0";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg",
  "./src/character.js",
  "./src/phobia-info.js",
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

  if (isSameOrigin) {
    // Cache-first for our own shell
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => cached))
    );
  } else if (isCDN) {
    // Network-first with cache fallback for CDN assets — large binaries cached after first hit
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.status === 200 && res.type !== "opaque") {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
  }
});
