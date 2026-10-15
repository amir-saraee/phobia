// Streaks, voice presets, the consent gate — and boot().
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// Daily streak: count distinct day-strings in the active character's log,
// counting backwards from today, stopping at the first gap.
function computeStreak() {
  if (!state.log || !state.log.length) return 0;
  const dayKey = (ts) => {
    const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime();
  };
  const days = new Set(state.log.map(l => dayKey(l.ts)));
  let n = 0;
  // Step by CALENDAR day (re-normalising to local midnight each time), not a
  // fixed 86.4M ms — a DST day is 23 or 25 hours, so the old fixed step landed
  // an hour off midnight and broke the streak across the transition.
  const cursor = new Date(dayKey(Date.now()));
  while (days.has(dayKey(cursor.getTime()))) {
    n++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

// Apply the character's saved voice preset to PhobiaVoice on every render
// so the spoken cues match the user's chosen tone (calm / encouraging / brief).
function applyVoicePreset() {
  const c = window.Character && window.Character.loadCharacter();
  if (!c || !window.PhobiaVoice || !window.PhobiaVoice.setRate) return;
  const rate = c.voicePreset === "calm" ? 0.78
             : c.voicePreset === "brief" ? 1.04
             : c.voicePreset === "encouraging" ? 0.90
             : 0.85;
  window.PhobiaVoice.setRate(rate);
}

// ---------- First-run notice (consent) ----------
// Shown once before anything else: what this is (a practice game, not
// therapy), that data never leaves the device, that the user is always in
// control, and where real help lives. Re-readable from the About page.
const CONSENT_KEY = "fobia.consent.v1";
function hasConsented() {
  try { return localStorage.getItem(CONSENT_KEY) === "1"; } catch { return false; }
}
// Three things and a phone number, not five paragraphs: what this is (and
// isn't), that nothing leaves the device, that every scene can be left. The
// long form lives on the About page ("Read more").
function showConsent(rereading, onOk) {
  if (document.querySelector(".consent-overlay")) return;
  const touch = isCoarsePointer();
  const overlay = document.createElement("div");
  overlay.className = "goal-modal-overlay consent-overlay";
  overlay.innerHTML = `
    <div class="goal-modal consent-modal" role="dialog" aria-modal="true" aria-label="${t("consent.title", "Before you begin")}">
      <span class="bridge-invite-kicker">${brandLamp()} ${t("consent.kicker2", "Before you walk in")}</span>
      <h3 style="margin:6px 0 10px">${t("consent.title", "Before you begin")}</h3>
      <ul class="consent-list">
        <li><span>🎮</span>${t("consent.game2", "Lanternwalk is a practice game about how fear works — not therapy, and no substitute for a clinician. If a fear is seriously limiting your life, a professional can help; this can start that conversation.")}</li>
        <li><span>🔒</span>${t("consent.privacy2", "Everything stays on this device. No account, no tracking.")}</li>
        <li><span>🚪</span>${touch
          ? t("consent.control2m", "You're in control: leave any scene, any time — 🛟 grounds you. Stepping out is never a failure.")
          : t("consent.control2d", "You're in control: leave any scene, any time — Esc grounds you. Stepping out is never a failure.")}</li>
      </ul>
      <p class="consent-crisis">☎️ ${t("consent.crisis", "If you're in crisis right now, please reach a real person:")} <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a></p>
      <div class="actions" style="margin-top:14px">
        ${rereading ? "" : `<button class="btn-ghost" id="consentAbout">${t("consent.more", "Read more")}</button>`}
        <button class="btn-primary" id="consentOk">${rereading ? t("consent.close", "Close") : t("consent.ok", "I understand — begin")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector("#consentOk").onclick = () => {
    try { localStorage.setItem(CONSENT_KEY, "1"); } catch {}
    overlay.remove();
    if (typeof onOk === "function") { try { onOk(); } catch (e) { console.warn("[consent]", e); } }
  };
  const aboutBtn = overlay.querySelector("#consentAbout");
  if (aboutBtn) aboutBtn.onclick = () => {
    try { localStorage.setItem(CONSENT_KEY, "1"); } catch {}
    overlay.remove();
    go("about");
  };
}

// The title screen is read before the notice is: the first visit lands on
// the valley and the name, and the notice comes with the first tap on any of
// its buttons — which then carries on to where that tap was going. Every
// other route (a deep link, a shared trial) still shows it at boot.
function gateTitleScreenOnConsent() {
  const v = document.getElementById("view");
  if (!v || hasConsented()) return;
  const onTap = (e) => {
    if (hasConsented()) { v.removeEventListener("click", onTap, true); return; }
    const btn = e.target && e.target.closest && e.target.closest("button[data-action]");
    if (!btn || btn.dataset.action === "open-settings") return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showConsent(false, () => { v.removeEventListener("click", onTap, true); btn.click(); });
  };
  v.addEventListener("click", onTap, true);
}

// ---------- Boot ----------
// Wait for the deferred src/character.js + src/phobia-info.js to load before
// the first render — that way the welcome page can use the avatar SVG and
// phobia info from the start.
function boot() {
  // Scope state to the active character (must run after character.js loads)
  activateCharacterState();
  // Merge any user-defined custom phobias into PHOBIAS
  mergeCustomPhobias();
  applyTheme();
  applyVoicePreset();
  scheduleReminders();
  // Warm caches for heavy assets (the next realm's code and models) in the
  // background. The 3D entry loads async — the title screen no longer waits
  // for three.js — so it may land after boot; prefetch once it has.
  const warm = () => setTimeout(() => {
    let realm = null, level = 0;
    try { if (window.Character && window.Character.loadCharacter()) { const ct = continueTarget(); realm = ct.key; level = ct.level; } } catch {}
    try { window.Scene3D.prefetch({ realm, level }); } catch {}
  }, 1500);
  if (window.Scene3D && window.Scene3D.prefetch) warm();
  else window.addEventListener("scene3d-ready", warm, { once: true });
  // Honor the URL on first load so refreshes / shared links land correctly
  const route = location.hash ? parseRoute(location.hash) : { view: "welcome", params: {} };
  render(route.view, route.params);
  // First visit: the honest-welcome notice comes before anything is played —
  // on the title screen, with the first tap (gateTitleScreenOnConsent, wired
  // in attachHandlers); anywhere else, right away.
  if (!hasConsented() && route.view !== "welcome") showConsent(false);
  // Make sure the URL bar matches what we rendered
  const expected = "#" + serializeRoute(route.view, route.params);
  if (location.hash !== expected) {
    _suppressHashSync = true;
    history.replaceState({ view: route.view, params: route.params }, "", expected);
    _suppressHashSync = false;
  }
  // Initial load also starts at the top — covers the case where the browser
  // restored a scroll position from a previous visit and our SPA route is
  // about to land them on a different view.
  if (typeof scrollToTop === "function") scrollToTop();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
