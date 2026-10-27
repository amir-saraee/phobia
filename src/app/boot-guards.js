// First things: the i18n shim, the global error handlers and the local error
// log (errlog ring buffer).
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// ---------- i18n safety shim ----------
// src/i18n.js is a DEFERRED script, so it defines window.t only after this
// inline block has finished parsing. Anything that renders before that point
// — most easily a `hashchange` that fires while the deferred scripts are
// still in flight, i.e. someone opening a deep link on a cold cache — hits
// `t is not defined` and throws out of render(), leaving a blank page. The
// service worker normally hides this by serving i18n.js instantly from cache,
// which means it only ever breaks for first-time visitors: precisely the
// people who can't know to reload. A shim that returns the English fallback
// costs nothing and i18n.js overwrites it a moment later.
if (typeof window.t !== "function") {
  window.t = (key, fallback) => (fallback != null ? fallback : key);
}
if (typeof window.tf !== "function") {
  window.tf = (key, fallback, vars) =>
    String(fallback != null ? fallback : key)
      .replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
}

// ---------- Global error boundary ----------
// Anything that escapes a try/catch elsewhere lands here. We log it to the
// console (so a developer can find it during testing) but DON'T propagate
// to the user — exposure scenes already self-recover via the per-frame
// guards in tick(). Without this boundary, a single uncaught throw would
// trigger Chrome's "this page is unresponsive" dialog after a few seconds.
window.addEventListener("error", (e) => {
  // Filter out the "ResizeObserver loop limit exceeded" warning that fires
  // benignly when the stage canvas resizes — it's not a real bug.
  if (e && e.message && /ResizeObserver/i.test(e.message)) return;
  try { console.warn("[Lanternwalk] uncaught error:", e.message, e.error || ""); } catch {}
});
window.addEventListener("unhandledrejection", (e) => {
  try { console.warn("[Lanternwalk] unhandled promise:", e.reason); } catch {}
});

// ---------- Procedural audio engine (Web Audio API) ----------
// Builds wind, water, breathing, barks, skittering, MRI clanks, heartbeat, etc.
// All generated on the fly — no external sound files needed.
// ---------- Error journal (launch diagnostics) ----------
// The app has no server, so breakage on a stranger's phone is invisible.
// Unhandled errors land in a small localStorage ring buffer surfaced in
// Settings → Diagnostics (count / copy / clear) — a user can paste them into
// a bug report, which is the whole telemetry budget of a local-only app.
const ERRLOG_KEY = "fobia.errlog.v1";
function readErrLog() {
  try { const l = JSON.parse(localStorage.getItem(ERRLOG_KEY)); return Array.isArray(l) ? l : []; } catch { return []; }
}
function pushErrLog(entry) {
  try {
    const log = readErrLog();
    log.push(entry);
    while (log.length > 25) log.shift();
    localStorage.setItem(ERRLOG_KEY, JSON.stringify(log));
  } catch {}
}
window.addEventListener("error", (e) => {
  pushErrLog({
    ts: Date.now(),
    msg: String((e && (e.message || e.error)) || "unknown").slice(0, 300),
    src: `${(e && e.filename) || ""}:${(e && e.lineno) || 0}`,
    route: location.hash,
  });
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e && e.reason;
  pushErrLog({
    ts: Date.now(),
    msg: ("Promise: " + String((r && (r.message || r)) || "unknown")).slice(0, 300),
    route: location.hash,
  });
});

// Touch-first detection shared by the classic shell (the 3D module has its
// own IS_COARSE_POINTER with the same semantics + the same dev override:
// localStorage fobia.forceTouch = "1").
function isCoarsePointer() {
  const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  let forced = false;
  try { forced = localStorage.getItem("fobia.forceTouch") === "1"; } catch {}
  return !!(coarse || forced);
}
