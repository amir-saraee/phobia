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
// Right-to-left right now (Persian)? For arrows and other glyphs whose
// direction is meaning, not decoration.
function isRtl() { return !!(window.I18n && window.I18n.isRTL && window.I18n.isRTL()); }
if (typeof window.fnum !== "function") window.fnum = (v) => String(v);
if (typeof window.fsecs !== "function") window.fsecs = (n) => n + "s";
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
// The page an error happened on, minus what it says about the player: the
// fear in "#/spiders/exposure/2" is health information, and diagnostics are
// pasted into feedback notes. View and level are enough to reproduce.
function safeRoute(h) {
  try { return String(h != null ? h : (location.hash || "")).replace(/^#\/[a-z]+(?=\/|$)/i, (m) => /^#\/(about|settings|camp|map|journal|story|insights|report|quiz|select|traveler|welcome|arrival)$/i.test(m) ? m : "#/*"); } catch { return ""; }
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
    route: safeRoute(),
  });
});
window.addEventListener("unhandledrejection", (e) => {
  const r = e && e.reason;
  pushErrLog({
    ts: Date.now(),
    msg: ("Promise: " + String((r && (r.message || r)) || "unknown")).slice(0, 300),
    route: safeRoute(),
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

// ---------- Dialog focus ----------
// The consent notice, Settings, the menu and every modal opened without
// taking focus: Tab walked the page behind them (the consent's button was
// the ninth stop), Esc did nothing in most, and closing one dropped focus on
// <body>. One watcher gives every dialog the same contract: focus moves in,
// Tab stays inside, Esc closes where closing is allowed, and focus returns
// to whatever opened it.
(function dialogFocus() {
  const SEL = ".goal-modal-overlay, .settings-drawer, .menu-drawer";
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const visible = (el) => el.offsetParent !== null || el.getClientRects().length > 0;
  const focusables = (root) => [...root.querySelectorAll(FOCUSABLE)].filter(visible);
  function closeOf(root) {
    if (root.classList.contains("settings-drawer")) return () => { try { closeSettings(); } catch {} };
    if (root.classList.contains("menu-drawer")) return () => { try { closeMenu(); } catch {} };
    // A first-visit notice is agreed to, not dismissed.
    if (root.classList.contains("consent-overlay")) {
      if (root.querySelector("#consentAbout")) return null;
      const ok = root.querySelector("#consentOk");
      return ok ? () => ok.click() : null;
    }
    const btn = root.querySelector('.close-btn, [data-dismiss], #fbClose, #wsCancel, #fcCancel, #goalCancel, #prClose, #kpClose');
    return btn ? () => btn.click() : null;
  }
  function wire(root) {
    if (root._dlg) return;
    const opener = document.activeElement;
    root._dlg = true;
    const box = root.matches(".goal-modal-overlay") ? (root.querySelector('[role="dialog"], .goal-modal') || root) : root;
    if (!box.getAttribute("role")) box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    requestAnimationFrame(() => {
      if (!root.isConnected) return;
      const f = focusables(box);
      const first = box.querySelector(".btn-primary:not([disabled])") || f.find((el) => !el.classList.contains("close-btn")) || f[0];
      if (first) { try { first.focus({ preventScroll: true }); } catch {} }
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const close = closeOf(root);
        if (close) { e.stopPropagation(); close(); }
        return;
      }
      if (e.key !== "Tab") return;
      const f = focusables(box);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      else if (!box.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
    });
    const mo = new MutationObserver(() => {
      if (root.isConnected) return;
      mo.disconnect();
      if (opener && opener.isConnected && typeof opener.focus === "function") { try { opener.focus({ preventScroll: true }); } catch {} }
    });
    mo.observe(document.body, { childList: true });
  }
  const start = () => {
    new MutationObserver((muts) => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches && n.matches(SEL)) wire(n);
      }
    }).observe(document.body, { childList: true });
  };
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start, { once: true });
})();
