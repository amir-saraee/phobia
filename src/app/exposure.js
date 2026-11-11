// mountExposure(): the trial stage around the 3D scene — countdown, hold
// timer, HUD, scene audio, breathing.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// The demo's exit: not a rating screen (a visitor rated nothing) but an
// invitation. Overlaid on the stage so the room stays visible behind it —
// the point is "this is real, and it can be yours", not a modal wall.
function showDemoEnd() {
  const stage = document.getElementById("stage");
  if (!stage || stage.querySelector(".demo-end")) return;
  const d = document.createElement("div");
  d.className = "demo-end";
  d.innerHTML = `
    <div class="demo-end-card">
      <span class="bridge-invite-kicker">${t("demo.kicker", "that was a minute of the valley")}</span>
      <h3>${t("demo.h", "The valley is real — and it can remember you.")}</h3>
      <p>${t("demo.p", "Make a traveler and every step counts: the trust you build with the dog stays built, your fear curve starts drawing itself, and five more fears are waiting with their own rooms.")}</p>
      <div class="actions">
        <button class="btn-primary" data-action="begin">✨ ${t("demo.create", "Create your traveler")}</button>
        <button class="btn-ghost" data-action="open-select">${t("demo.valley", "🗺 See the whole valley")}</button>
      </div>
      <button class="demo-stay">${t("demo.stay", "keep exploring this room")}</button>
    </div>`;
  d.querySelector(".demo-stay").addEventListener("click", () => d.remove());
  // Buttons appended after render() miss the per-render [data-action] bind
  // pass (it's querySelectorAll-at-render, not delegation) — wire directly.
  d.querySelectorAll("[data-action]").forEach((el) => {
    el.addEventListener("click", () => { try { handleAction(el.dataset, {}); } catch {} });
  });
  stage.appendChild(d);
}

function mountExposure(phobiaKey, levelIdx) {
  const p = PHOBIAS[phobiaKey];
  const lv = p.levels[levelIdx];
  const stage = document.getElementById("stage");
  const minHold = parseInt(stage.dataset.minHold, 10) || 6;
  // The opening card (views-trial.js trialIntroHTML): the scene mounts behind
  // it and holds still (engine.js, .pre-start); nothing about the trial —
  // its clock, its hold, its sound, its keys — starts until the player steps
  // in by making their guess.
  const intro = document.getElementById("trialIntro");
  let begunAt = 0;
  let unblockKeys = () => {};
  if (intro) {
    // The scene's own keys (E settle, T treat, W walk…) must not act on a
    // room that is holding still behind the card. Capture phase on window:
    // this runs before any listener the scene adds.
    // Key-down only: a key-up for a key the room never saw go down is
    // harmless, and passing them all means no key can stick "held" into the
    // trial. A story page, a menu or a field typed into keeps its keys.
    const blockKeys = (e) => {
      if (!stage.isConnected) { window.removeEventListener("keydown", blockKeys, true); return; }
      if (!stage.classList.contains("pre-start")) return;
      // (Esc too: under the card it started the grounding exercise behind
      // it. A story page or a menu over the card still gets its Esc below.)
      if (e.key === "Tab" || e.key === "Enter" || e.key === " ") return;
      const tg = e.target;
      if (tg && tg.closest && tg.closest("input, textarea, select, [contenteditable='true']")) return;
      if (document.querySelector(".story-ov, .goal-modal-overlay, .settings-drawer, .menu-drawer")) return;
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", blockKeys, true);
    unblockKeys = () => { window.removeEventListener("keydown", blockKeys, true); };
  }
  // The experiment deck for this realm/rung (renders nothing when the realm
  // has no deck). Torn down by unmount() via PhobiaExperiments.end().
  // Not on a realm's very first trial: that one is for meeting the room and
  // the alarm, and an "Experiments" chip beside the camera toggle was one more
  // thing to read before the first step. From the second visit on, it's there.
  const firstVisitHere = (() => { try { return (getProgress(phobiaKey).highestCompleted ?? -1) < 0 && !state.log.some((l) => l.phobia === phobiaKey); } catch { return false; } })();
  if (!firstVisitHere || window.__demoMode) {
    try { PhobiaExperiments.begin(phobiaKey, levelIdx, stage); } catch {}
  }
  // ---- Instant-demo chrome ----
  // Same scene, different exits: the Continue button leads to the invitation
  // instead of the rate flow (no ladder writes for a visitor with no
  // traveler), a small chip names the situation, and after ~75 s the
  // invitation offers itself once. Everything else — the hold, the dog, the
  // experiments — is the real product, deliberately.
  if (window.__demoMode) {
    const cont = document.getElementById("continueBtn");
    if (cont) {
      cont.dataset.action = "demo-end";
      cont.textContent = t("demo.stepOut", "Step out — I've had a taste");
      cont.classList.remove("holding");
    }
    const chip = document.createElement("div");
    chip.className = "demo-chip";
    chip.innerHTML = `✨ ${t("demo.chip", "A taste of the valley — walk to the dog, call it (C), try an experiment")}`;
    stage.appendChild(chip);
    setTimeout(() => {
      if (window.__demoMode && location.hash.replace(/^#/, "") === "/try" && !document.querySelector(".demo-end")) {
        try { showDemoEnd(); } catch {}
      }
    }, 75000);
  }

  // ---------- Immersion ----------
  // The scene was a ~1150×560 card with a step badge above it and a button row
  // below — the user looked AT a room instead of standing in one, and no
  // amount of texture work fixes that framing. Two layers, because they have
  // different costs: theater mode is pure CSS and can apply immediately, while
  // true fullscreen needs a user gesture and can be refused.
  const immersiveOn = (() => {
    try { return localStorage.getItem("fobia.immersive") !== "0"; } catch { return true; }
  })();
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (immersiveOn) {
    stage.classList.add("theater");
    // Theater makes the stage ~100dvh tall. On phones the page above it
    // (header + step badge) pushes the stage's BOTTOM below the fold — which
    // is exactly where the joystick lives, so touch players got half a
    // joystick clipped off-screen. Scroll the stage to the top of the
    // viewport AFTER the router's own scroll-to-top runs (that one fires
    // post-render, which is why a bare rAF here lost the race).
    setTimeout(() => {
      try { stage.scrollIntoView({ block: "start" }); } catch {}
    }, 180);
    fitTheaterStage();
  }

  // The stage and the row under it (Pause & breathe, Step out / Continue,
  // the hold bar) share exactly one screen. The stage used to be a fixed
  // 100dvh − 80px, which on a phone (where that row wraps) and on most
  // laptops left the way out — and the Continue button — below the fold, to
  // be found by scrolling a page that was otherwise a game screen.
  function fitTheaterStage() {
    const row = document.querySelector(".exposure-panel .step-controls");
    if (!row || typeof ResizeObserver === "undefined") return;
    const apply = () => {
      if (!stage.isConnected) { ro.disconnect(); return; }
      if (fsEl() === stage) return;
      stage.style.setProperty("--stepctl-h", Math.ceil(row.getBoundingClientRect().height) + "px");
    };
    const ro = new ResizeObserver(apply);
    ro.observe(row);
    apply();
  }

  // Fullscreen hides every sibling of #stage, which includes the hold bar and
  // the continue button — leaving the user with no way to see progress or move
  // on. Carry them inside for the duration and put them back after. Listeners
  // are bound per-element, so they survive the move.
  let fsMoved = null;
  const onFsChange = () => {
    const full = fsEl() === stage;
    if (full && !fsMoved) {
      fsMoved = [];
      for (const sel of [".scene-cmd-bar", ".step-controls"]) {
        const el = document.querySelector(sel);
        if (el && !stage.contains(el)) {
          fsMoved.push({ el, parent: el.parentNode, next: el.nextSibling });
          stage.appendChild(el);
        }
      }
    } else if (!full && fsMoved) {
      for (const m of fsMoved) {
        try { m.parent.insertBefore(m.el, m.next); } catch { try { m.parent.appendChild(m.el); } catch {} }
      }
      fsMoved = null;
    }
  };
  document.addEventListener("fullscreenchange", onFsChange);
  document.addEventListener("webkitfullscreenchange", onFsChange);

  // No longer asked for on the first click or key. The browser spends Esc on
  // leaving fullscreen, so the first press of the key every trial promises
  // will ground you did nothing — and a page jumping to fullscreen when you
  // touch W is a surprise, not immersion. The theater layout already fills
  // the screen (stage + controls fit the viewport, see fitTheaterStage).

  // Leaving the rung must not leave the browser in fullscreen or the listeners
  // on the window.
  const releaseImmersion = () => {
    window.removeEventListener("hashchange", releaseImmersion);
    document.removeEventListener("fullscreenchange", onFsChange);
    document.removeEventListener("webkitfullscreenchange", onFsChange);
    // (These two held every finished trial's stage — and this whole scope —
    // alive for the rest of the session.)
    document.removeEventListener("fullscreenchange", refreshQuickBar);
    document.removeEventListener("webkitfullscreenchange", refreshQuickBar);
    if (fsEl() === stage) {
      try {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) Promise.resolve(exit.call(document)).catch(() => {});
      } catch {}
    }
    onFsChange();   // put the borrowed rows back even if exit is async
  };
  window.addEventListener("hashchange", releaseImmersion, { once: true });

  // Read user preferences
  const heartEnabled = (() => {
    try { return localStorage.getItem("fobia.heart") !== "0"; } catch { return true; }
  })();
  // The app's own toggle OR the system setting (the trial used to read only
  // the toggle, so "reduce motion" in the OS still got a shaking stage and a
  // 4 Hz pulsing vignette).
  const motionReduced = (() => {
    let app = false;
    try { app = localStorage.getItem("fobia.reducedMotion") === "1"; } catch {}
    return app || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  })();

  // Heart rate ramps up with the rung: rung 1 ≈ 70 bpm, rung 5 ≈ 132 bpm
  const bpm = 68 + levelIdx * 16;
  // Vignette opacity: only really visible on the harder rungs, and even then
  // capped at ~0.55 so it never feels like an alarm. Lower rungs get nothing.
  // The dog realm draws the alarm itself (the coach's wave + the fear grade);
  // a second, fixed-tempo pulse on top beat out of step with it.
  const heartIntensity = (heartEnabled && phobiaKey !== "dogs") ? Math.max(0, (levelIdx - 2) / 3) * 0.55 : 0;

  // Heart-rate vignette overlay (sits over the scene)
  const heart = document.createElement("div");
  heart.className = "heart";
  heart.style.setProperty("--bpm-dur", (60 / bpm) + "s");
  heart.style.setProperty("--heart-opacity", "0");
  // No pulse on this rung (or switched off): no element animating unseen.
  if (!heartIntensity) heart.hidden = true;
  // Reduced motion: a still glow, no pulse.
  if (motionReduced) heart.classList.add("still");
  stage.appendChild(heart);

  // Continuous shake only on the very top rung (unless reduce-motion is on).
  // Anything more felt like a panic-trigger rather than a stress cue.
  // (Not for the dogs' top rung: that dog is loud and friendly now, and a
  // screen that never stops shaking says "danger" over every calm moment.)
  if (levelIdx >= 4 && !motionReduced && phobiaKey !== "dogs") stage.classList.add("shake");

  // Quick action bar — always-visible icons in the top-right of the stage:
  //  - voice mute / unmute
  //  - sound mute / unmute
  //  - theater mode (taller stage that fills the viewport)
  //  - fullscreen mode (browser fullscreen API)
  // Theater + fullscreen are independent so the user can pick whichever
  // feels right (theater stays inside the page, fullscreen takes the screen).
  const quickBar = document.createElement("div");
  quickBar.className = "stage-quick-bar";
  function isTheater() { return stage.classList.contains("theater"); }
  function isFullscreen() {
    return document.fullscreenElement === stage ||
           document.webkitFullscreenElement === stage;
  }
  function refreshQuickBar() {
    const aMuted = window.PhobiaAudio && window.PhobiaAudio.isMuted();
    const theater = isTheater();
    const full = isFullscreen();
    // One essential control — scene sound. (The voice-guidance mute is gone
    // with spoken narration itself: guidance now shows as on-screen tips,
    // and the Settings captions toggle controls those.)
    quickBar.innerHTML = `
      <button class="stage-quick-btn ${aMuted ? "muted" : ""}" id="quickAudio"
        title="${aMuted ? t("qa.mutedTip", "Scene sound muted — click to unmute") : t("qa.muteTip", "Mute scene sound")}"
        aria-label="${aMuted ? t("qa.muted", "Sound muted") : t("qa.mute", "Mute sound")}">${aMuted ? "🔈" : "🔊"}</button>
    `;
    const a = quickBar.querySelector("#quickAudio");
    if (a) a.onclick = () => {
      window.PhobiaAudio.unlock();
      const next = !window.PhobiaAudio.isMuted();
      window.PhobiaAudio.setMuted(next);
      const ab = document.getElementById("audioBtn");
      if (ab) ab.textContent = next ? "🔇" : "🔊";
      refreshQuickBar();
    };
  }
  // Re-render the icons when fullscreen state changes (e.g. user pressed Esc)
  document.addEventListener("fullscreenchange", refreshQuickBar);
  document.addEventListener("webkitfullscreenchange", refreshQuickBar);
  refreshQuickBar();
  stage.appendChild(quickBar);

  // Compact hold-progress pill — the ONLY progress readout ≤600px where the
  // hold-bar is display:none (phone users previously had no idea whether
  // they were earning the hold at all). CSS keeps it hidden on desktop.
  const holdPill = document.createElement("div");
  holdPill.className = "hold-pill";
  holdPill.innerHTML = `<span class="hp-txt">${fnum(0)}/${fsecs(minHold)}</span><span class="hp-bar"><span class="hp-fill"></span></span>`;
  stage.appendChild(holdPill);

  // Closed captions for voice (respect user's preference)
  let captions = null;
  let captionsTimer = null;
  const shownCaptions = new Set();
  const captionsEnabled = (() => {
    try { return localStorage.getItem("fobia.captions") !== "0"; } catch { return true; }
  })();
  if (captionsEnabled) {
    captions = document.createElement("div");
    captions.className = "captions";
    // Live region so screen readers announce the guidance even when the app's
    // own TTS voice is muted (a legitimate choice) or fails to load.
    captions.setAttribute("role", "status");
    captions.setAttribute("aria-live", "polite");
    captions.setAttribute("aria-atomic", "true");
    stage.appendChild(captions);
  }
  const hideCaption = () => {
    if (captionsTimer) { clearTimeout(captionsTimer); captionsTimer = null; }
    if (captions) captions.classList.remove("show");
  };
  function onVoiceLine(e) {
    if (!captions || !captions.isConnected) return;
    // The player's own commands ("You: Go fetch.") were echoed back as
    // captions on every press — they did the thing; they don't need to read
    // it. And during grounding the 5-4-3-2-1 text is already mid-screen.
    if (e.detail.speaker === "you" || !e.detail.text || shownCaptions.has(e.detail.text)) return;
    try { if (window.PhobiaFear && window.PhobiaFear.isGrounding && window.PhobiaFear.isGrounding()) return; } catch {}
    // One message at a time: a caption waits its turn behind a lesson, a
    // question or a beat already on screen (and is simply dropped — it was
    // about this moment).
    const ms = Math.min(6500, e.detail.durationMs || 3000);
    const L = window.PhobiaFX && window.PhobiaFX.lane;
    if (L?.busy()) return;
    if (L && !L.claim("caption", ms, hideCaption)) return;
    shownCaptions.add(e.detail.text);
    captions.textContent = e.detail.text;
    captions.classList.remove("you");
    captions.classList.add("show");
    if (captionsTimer) clearTimeout(captionsTimer);
    captionsTimer = setTimeout(() => {
      captions.classList.remove("show");
      captionsTimer = null;
      if (L) L.release("caption");
    }, ms);
  }
  window.addEventListener("voice-line", onVoiceLine);

  // ---- Is the scene on screen? (contract 3) ----
  // The hold and the room's sound wait for the scene to actually be drawn. On
  // a slow link the hold used to start counting — and the room tone to start
  // — behind "Setting the scene…", so a player could be a third of the way
  // through a hold they had not seen yet. The engine marks the stage
  // (data-scene-ready="1" + a "scene-ready" event) after its first real
  // frame, and takes the mark back while the GPU context is lost; the 2D
  // stand-in counts as shown the moment it is drawn.
  let svgShown = false;
  let sceneShown = false, sceneShownAt = 0;
  let sceneWaiters = [];
  const sceneOnScreen = () => svgShown || stage.dataset.sceneReady === "1";
  function markSceneShown() {
    if (sceneShown) return;
    sceneShown = true; sceneShownAt = Date.now();
    window.removeEventListener("scene-ready", onSceneReady);
    const w = sceneWaiters; sceneWaiters = [];
    w.forEach((fn) => { try { fn(); } catch {} });
  }
  function onSceneReady(e) {
    if (e && e.detail && e.detail.container && e.detail.container !== stage) return;
    if (sceneOnScreen()) markSceneShown();
  }
  window.addEventListener("scene-ready", onSceneReady);

  // Try 3D first; fall back to SVG if not available or it fails
  function mountSVGFallback() {
    const sc = document.createElement("div");
    sc.className = "scene";
    stage.insertBefore(sc, stage.firstChild);
    p.render(sc, lv, levelIdx);
    // The stand-in is the scene now: nothing is still being set.
    stage.querySelectorAll(".loading").forEach((n) => n.remove());
    svgShown = true;
    markSceneShown();
  }
  function show3DFailure(err) {
    console.warn("3D scene failed, using SVG fallback:", err);
    console.error(err);
    // Make the failure VISIBLE. The silent fallback has already masked two
    // real scene crashes (heights, needles) — the flat SVG looked like a
    // deliberate art choice and nobody noticed for days.
    try {
      const note = document.createElement("div");
      note.className = "scene-fallback-note";
      note.textContent = t("stage.3dFail", "3D scene couldn't load — showing the simple version. Reloading the page usually fixes it.");
      stage.appendChild(note);
      stage.querySelectorAll(".loading").forEach((n) => n.remove());
      setTimeout(() => { note.style.opacity = "0"; setTimeout(() => note.remove(), 600); }, 9000);
    } catch {}
  }
  function mount3DIfPossible() {
    if (!window.Scene3D || !window.Scene3D.ready) return false;
    try {
      // Preserve the heart overlay; only remove canvases/scene divs
      [...stage.querySelectorAll("canvas, .scene, .vignette, .mode-badge, .loading, .controls-hint, .reach-hint")].forEach(el => el.remove());
      // If a character profile exists, propagate its full appearance (skin /
      // shirt / hair / eyes / glasses / facial hair) through to the first-person
      // hands and visible body so the user really sees themselves — both in
      // first-person (their own hands and chest) and third-person (full head
      // with hair, eyes that match, optional glasses + beard).
      const character = window.Character && window.Character.loadCharacter();
      const opts = {};
      // Demo visitors have no character yet — give them the same warm default
      // traveler the landing shows (woman, long brown hair, teal), not the
      // Body class's bare fallbacks. The bald default read as a mannequin.
      if (!character && window.__demoMode && window.Character) {
        const C = window.Character;
        const demoChar = { skinTone: "fair", hairColor: "brown", hairStyle: "long", topColor: "teal", eyeColor: "hazel", bodyType: "woman" };
        opts.skinColor  = C.hexToInt(C.skinHex(demoChar));
        opts.shirtColor = C.hexToInt(C.topHex(demoChar));
        opts.hairColor  = C.hexToInt(C.hairHex(demoChar));
        opts.eyeColor   = C.hexToInt(C.eyeHex(demoChar));
        opts.bodyType = "woman"; opts.hairStyle = "long";
        opts.glasses = "none"; opts.facialHair = "none"; opts.headwear = "none"; opts.topStyle = "tee";
      }
      if (character) {
        // Only forward colours that actually resolved. A legacy character
        // saved before a palette existed yields undefined here, and an
        // `undefined` value still OVERRIDES Body's defaults through
        // Object.assign — which is how every material went grey + THREE
        // warned "parameter 'color' has value of undefined" 14× per mount.
        const C = window.Character;
        const setIf = (key, v) => {
          if (v !== undefined && v !== null && !Number.isNaN(v)) opts[key] = v;
        };
        setIf("skinColor",  C.hexToInt(C.skinHex(character)));
        setIf("shirtColor", C.hexToInt(C.topHex(character)));
        setIf("hairColor",  C.hexToInt(C.hairHex(character)));
        setIf("eyeColor",   C.hexToInt(C.eyeHex(character)));
        opts.bodyType  = character.bodyType || "man";
        opts.hairStyle = character.hairStyle || "short";
        opts.glasses   = character.glasses || "none";
        opts.facialHair = character.facialHair || "none";
        opts.headwear  = character.headwear || "none";
        opts.topStyle  = character.topStyle || "tee";
      }
      const pending = window.Scene3D.mount(phobiaKey, stage, lv, levelIdx, opts);
      // A realm's first trial mounts once its scene code has loaded; a failed
      // load or mount then falls back exactly like a synchronous one.
      if (pending && typeof pending.then === "function") {
        pending.catch((err) => {
          if (!stage.isConnected) return;
          show3DFailure(err);
          mountSVGFallback();
        });
      }
      return true;
    } catch (err) {
      show3DFailure(err);
      return false;
    }
  }

  // A traveler's own forged ladder has no 3D room (the engine knows only the
  // built-in realms): mounting one threw "Unknown phobia" and the trial opened
  // on "3D scene couldn't load… Reloading usually fixes it", which it never
  // would. Custom ladders are the simple 2D scene, on purpose.
  if (p.isCustom) {
    [...stage.querySelectorAll("canvas, .scene")].forEach(el => el.remove());
    mountSVGFallback();
  } else if (!mount3DIfPossible()) {
    if (!window.Scene3D || !window.Scene3D.ready) {
      // The 3D layer loads async and simply hasn't arrived yet (a cold deep
      // link into a trial): keep "Setting the scene…" up rather than flashing
      // the flat stand-in for a second. Only if it never arrives does the
      // stand-in take over.
      let waited = false;
      const late = setTimeout(() => { waited = true; if (stage.isConnected && !stage.querySelector("canvas")) mountSVGFallback(); }, 15000);
      window.addEventListener("scene3d-ready", () => {
        clearTimeout(late);
        if (!stage.isConnected) return;
        if (waited) { [...stage.querySelectorAll(".scene")].forEach(el => el.remove()); svgShown = false; }
        if (!mount3DIfPossible()) mountSVGFallback();
      }, { once: true });
    } else {
      mountSVGFallback();
    }
  }

  // ---- First-time tutorial — only shown once per device ----
  // Three steps with animated arrows pointing at the relevant UI element.
  const seenTutorial = (() => { try { return localStorage.getItem("fobia.tutorialSeen") === "1"; } catch { return false; } })();
  // Not in coach realms (all six open ones): the tour's one card said what
  // the intro hint, the hold label and the coach card already say, in the
  // same second the room appeared. The intro hint is the one onboarding line.
  // Settings → "Replay onboarding tour" asks for it back, in any realm.
  const tourAsked = (() => { try { return localStorage.getItem("fobia.tourReplay") === "1"; } catch { return false; } })();
  if (!seenTutorial && (tourAsked || !hasCreatureKit(phobiaKey))) {
    try { localStorage.removeItem("fobia.tourReplay"); } catch {}
    runTutorialTour(stage, phobiaKey);
  }

  // ---- Pre-stage countdown ("Get ready · 3 · 2 · 1 · go") ----
  // Off unless the player turns it on (Settings → "Pre-scene countdown").
  // Every trial is already player-paced — the creature starts far away and
  // nothing happens until you walk — so a count before it was a gate in
  // front of a gate, and on a first trial it stacked with the tour.
  const countdownOff = (() => { try { return localStorage.getItem("fobia.countdown") !== "1"; } catch { return true; } })();
  const countdown = document.createElement("div");
  if (!countdownOff) {
    countdown.className = "countdown";
    countdown.innerHTML = `
      <div class="label">${t("cd.ready", "Get ready — there's no rush")}</div>
      <div class="num" id="cdNum">3</div>
      <div class="hint">${t("cd.breath", "Notice your breath. Soften your shoulders.<br>Take a moment.")}</div>
      <button class="btn-ghost" id="cdStartNow" style="margin-top:14px;font-size:13px;padding:6px 14px;">${t("cd.startNow", "Start when you're ready")}</button>
      <div class="hint" style="margin-top:8px;font-size:11px;opacity:.55">${t("cd.skipNote", "Starting early skips this countdown from now on")}</div>
    `;
    stage.appendChild(countdown);
  }

  let started = false;
  let stageAudio = []; // collection of audio handles to stop on unmount
  let voiceTimers = [];  // timeouts for scripted voice cues
  // Inactivity reminder — fires once if the user is completely still for 30s
  // after the scene starts. The cue is gentle ("you're still with it — keep
  // breathing") and never repeats during the same rung.
  let lastActivity = Date.now();
  let inactivityFired = false;
  let inactivityInterval = null;
  const onAnyActivity = () => { lastActivity = Date.now(); };
  const INACTIVITY_EVENTS = ["mousemove", "mousedown", "wheel", "keydown", "touchstart", "touchmove", "pointerdown"];
  const startScene = () => {
    if (started) return;
    // The room's sound and the scripted cues begin with the room itself, not
    // behind the loading card (every caller — countdown, its skip button, the
    // no-countdown start — comes through here).
    if (!sceneShown) { if (!sceneWaiters.includes(startScene)) sceneWaiters.push(startScene); return; }
    started = true;
    begunAt = Date.now();
    // Reveal heart-rate vignette gradually
    setTimeout(() => {
      heart.style.setProperty("--heart-opacity", String(heartIntensity));
    }, 250);
    // Start audio appropriate to this scene
    PhobiaAudio.unlock();
    stageAudio = startSceneAudio(phobiaKey, levelIdx);
    // (The fixed-rate rung heartbeat was retired: the global body-feel rig in
    // mount() now drives ONE heartbeat from the live fear value — it speeds up
    // because the user is actually afraid, not because the level number is big.)
    // Schedule scripted voice cues — about every 14 seconds (slower cadence
    // so the user has time to actually sit with the previous instruction).
    // Quiet on replays: a rung the user has already completed doesn't need
    // the same guidance read out again — repetition turns coaching into
    // nagging. Event-driven cues and the grounding exit still speak.
    const rungReplay = (() => { try { return getProgress(phobiaKey).highestCompleted >= levelIdx; } catch { return false; } })();
    const lines = rungReplay ? [] : ((VOICE_LINES[phobiaKey] || [])[levelIdx] || []);
    // (Today's practice used to pop up here nine seconds in. It is on the
    // gate page and in the header; mid-trial it was one more card.)
    // The rung's framing line nearly repeats the subtitle printed right above
    // the stage. When that header is actually on screen, the caption would be
    // the same sentence twice — skip it (fullscreen hides the header, so the
    // caption is then the only place the framing appears, and it stays).
    const _words = (x) => new Set(String(x || "").toLowerCase().replace(/[^a-z0-9\u0600-\u06ff ]+/g, " ").split(/\s+/).filter(w => w.length > 2));
    const _similar = (a, b) => {
      const A = _words(a), B = _words(b);
      if (!A.size || !B.size) return false;
      let n = 0; A.forEach(w => { if (B.has(w)) n++; });
      return n / Math.min(A.size, B.size) >= 0.6;
    };
    const headerShowing = () => {
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) return false;
        const h = document.querySelector(".exposure-header");
        if (!h) return false;
        const r = h.getBoundingClientRect();
        return r.bottom > 8 && r.top < window.innerHeight && getComputedStyle(h).display !== "none";
      } catch { return false; }
    };
    lines.forEach((line0, i) => {
      const line = t(`vl.${phobiaKey}.${levelIdx}.${i}`, line0);
      // Jittered cadence — a fixed 14 s metronome reads as scripted tape.
      // Only the FIRST cue (the rung's framing line) is spoken aloud; the
      // follow-ups stay caption-only so the voice keeps its scarcity.
      const delay = 1400 + i * (12000 + Math.random() * 6000);
      voiceTimers.push(setTimeout(() => {
        if (!(timer && timer.isConnected)) return;
        // A realm with a live coach narrates from what actually happens; a
        // timed follow-up ("Walk in at your own pace…") landing after the
        // player has already walked in reads as the game not watching.
        if (i > 0 && (window.__coach || window.__dogCoach)) return;
        // A coach realm's framing line repeats the gate page and the intro
        // hint landing in the same second.
        if (i === 0 && hasCreatureKit(phobiaKey)) return;
        if (i === 0 && headerShowing() && (_similar(line0, lv && lv.desc) || _similar(line, lvDesc(phobiaKey, levelIdx)))) return;
        PhobiaVoice.speak(line, { audible: i === 0 });
      }, delay));
    });
    // The room is live — let the interface start getting out of the way, and
    // glide the page so the scene is what fills the screen rather than the
    // rung's title card. (A no-op in true fullscreen, where it already does.)
    // (The chrome no longer auto-hides: buttons that faded after 3.5 s and
    // came back on every key press and mouse move read as buttons constantly
    // popping up. The HUD is small and stays put instead.)
    if (immersiveOn) {
      // "start", not "center": the stage and the controls row under it are
      // sized to fill the screen together, so the stage's top is the
      // screen's top (centring it pushed the controls row back off-screen).
      try { stage.scrollIntoView({ block: "start", behavior: "smooth" }); } catch {}
      // A smooth scroll is cancelled by any layout change while it runs (the
      // canvas, the hotbar and the controls row all settle in the first
      // second), which left the scene part-way down the page — half the
      // view and the joystick below the fold. Check it landed, a few times
      // while the page settles, and snap it there if not. Not once the
      // player has scrolled the page themselves.
      let userScrolled = false;
      const markUser = (e) => { if (!(e.target && e.target.closest && e.target.closest("#stage"))) userScrolled = true; };
      window.addEventListener("wheel", markUser, { passive: true, once: true });
      window.addEventListener("touchmove", markUser, { passive: true, once: true });
      // "once" only removes the one that fires — the other kept this trial's
      // whole stage (and through it the scene) alive after unmount.
      setTimeout(() => {
        window.removeEventListener("wheel", markUser);
        window.removeEventListener("touchmove", markUser);
      }, 3200);
      [700, 1500, 3000].forEach((ms) => setTimeout(() => {
        if (userScrolled || !stage.isConnected) return;
        const top = stage.getBoundingClientRect().top;
        if (Math.abs(top) > 4) { try { stage.scrollIntoView({ block: "start" }); } catch {} }
      }, ms));
      // Turning the phone re-lays the page; back to portrait it left the
      // stage half below the fold with the joystick out of reach. Re-seat it
      // once the new layout has settled. (Removed with the trial's audio.)
      stage._orientSnap = () => setTimeout(() => {
        if (!stage.isConnected) return;
        if (Math.abs(stage.getBoundingClientRect().top) > 4) { try { stage.scrollIntoView({ block: "start" }); } catch {} }
      }, 450);
      window.addEventListener("orientationchange", stage._orientSnap);
    }
    // Inactivity watcher — start once the scene is live.
    lastActivity = Date.now();
    INACTIVITY_EVENTS.forEach(ev => window.addEventListener(ev, onAnyActivity, { passive: true }));
    inactivityInterval = setInterval(() => {
      if (inactivityFired) return;
      if (!timer || !timer.isConnected) return;
      const stillFor = (Date.now() - lastActivity) / 1000;
      if (stillFor >= 30) {
        inactivityFired = true;
        try {
          // A scene with a live coach (the dog realm) already narrates what
          // the body is doing from the alarm itself — a canned "your body is
          // learning this is safe" over a wave at its peak was simply false.
          if (window.PhobiaVoice && !window.__dogCoach) {
            window.PhobiaVoice.speak(t("vo.still", "Still with it. Look around if you like — your body is learning that this is safe."));
          }
        } catch {}
      }
    }, 1000);
  };

  // Slower 4-second countdown (3 → 2 → 1 → go) so the user has time to
  // actually settle their breath before the scene begins. Holding the
  // count-numbers for ~1100 ms each instead of 800 ms feels noticeably
  // less rushed without dragging.
  const cdNum = countdown.querySelector("#cdNum");
  let cdTimers = [];
  let cdDone = false;
  const kickoff = () => {
  if (countdownOff) {
    // User opted out of the countdown — start right away (one tick later so
    // the scene mount settles before audio/voice kick in).
    cdDone = true;
    cdTimers.push(setTimeout(startScene, 250));
  } else {
    // Faster count — 800 ms per number for a snappier "ready, set, go" feel.
    // Total wait drops from ~3.3 s to ~2.4 s. Users can still skip via the
    // "Start when you're ready" button below.
    cdTimers.push(setTimeout(() => { if (cdNum) cdNum.textContent = "2"; }, 800));
    cdTimers.push(setTimeout(() => { if (cdNum) cdNum.textContent = "1"; }, 1600));
    cdTimers.push(setTimeout(() => {
      if (cdDone || !countdown.isConnected) return;
      cdDone = true;
      countdown.style.opacity = "0";
      startScene();
      setTimeout(() => countdown.remove(), 600);
    }, 2400));
  }
  };
  if (intro) armTrialIntro(kickoff); else kickoff();
  // Manual override: skip the rest of the count if the user is ready early.
  // Doing so remembers the preference — future scenes start instantly
  // (Settings → "Pre-scene countdown" turns it back on).
  const startNowBtn = countdown.querySelector("#cdStartNow");
  if (startNowBtn) {
    startNowBtn.onclick = () => {
      if (cdDone || !countdown.isConnected) return;
      cdDone = true;
      try { localStorage.setItem("fobia.countdown", "0"); } catch {}
      cdTimers.forEach(id => clearTimeout(id));
      cdTimers = [];
      countdown.style.opacity = "0";
      startScene();
      setTimeout(() => countdown.remove(), 600);
    };
  }

  // ---- The opening card ----
  // A number tapped is the guess, and stepping in. "Step in without a guess"
  // goes in with none. What the gate page's Enter used to record is recorded
  // here: the guess, the fear the alarm named (if one was picked), the
  // chapter's opening page as read.
  function armTrialIntro(kick) {
    let begun = false;
    const begin = (predicted) => {
      if (begun || !intro.isConnected) return;
      begun = true;
      window.__trialBegin = null;
      unblockKeys();
      pendingPrediction = { phobia: phobiaKey, level: levelIdx, predicted: Number.isFinite(predicted) ? predicted : null, ts: Date.now() };
      const chip = intro.querySelector(".expect-chip.on");
      pendingExpect = (chip && chip.dataset.fear && chip.dataset.fear !== "none")
        ? { phobia: phobiaKey, level: levelIdx, fear: chip.dataset.fear, belief: null, ts: Date.now() } : null;
      window.__pendingExpect = pendingExpect;
      try { if (pendingExpect && window.__coach && window.__coach.setExpect) window.__coach.setExpect(pendingExpect); } catch {}
      lastRungOutcome = { heldSec: 0, minHold, finished: false, phobia: phobiaKey, level: levelIdx };
      saveTrialSnap();
      // The chapter's opening counts as read only if it was on the card to be
      // seen (a short landscape screen may not have room for it).
      try {
        const st = intro.querySelector(".ti-story");
        if (st && st.offsetParent !== null && window.Story && !window.Story.isSeen(`${phobiaKey}.open`)) window.Story.markSeen(`${phobiaKey}.open`);
      } catch {}
      try { PhobiaAudio.unlock(); } catch {}
      intro.classList.add("gone");
      stage.classList.remove("pre-start");
      const panel = stage.closest(".exposure-panel");
      if (panel) panel.classList.remove("pre-start");
      try { window.dispatchEvent(new CustomEvent("trial-begin", { detail: { phobia: phobiaKey, level: levelIdx } })); } catch {}
      setTimeout(() => { try { intro.remove(); } catch {} }, 450);
      try { stage.focus({ preventScroll: true }); } catch {}
      kick();
    };
    window.__trialBegin = begin;
    intro.addEventListener("click", (e) => {
      const sc = e.target && e.target.closest && e.target.closest('.suds-chips[data-for="predictedSuds"] .sc');
      // A beat for the number to light before the card goes.
      if (sc) setTimeout(() => begin(parseInt(sc.dataset.v, 10)), 180);
    });
    // Keyboard: the first number chip gets focus, so Tab/arrows/Enter work.
    setTimeout(() => {
      if (!intro.isConnected) return;
      const first = intro.querySelector('.suds-chips .sc');
      try { (intro.querySelector(".ti-title") || first).focus({ preventScroll: true }); } catch {}
    }, 60);
  }

  // ---- Hold timer ----
  // The rung COMPLETES when the user has spent `minHold` seconds actually
  // FACING the fear — not just sitting in the scene. We weight time by the
  // PhobiaFear value, which scenes drive from proximity / gaze:
  //   fear > 30  → 1.0× time credit (genuinely facing it)
  //   fear > 10  → 0.4× credit  (in scene, not yet engaged)
  //   fear ≤ 10  → 0×           (back at safety, not earning credit)
  // Look-only scenes (driving, flying, speaking, needles, enclosed, storms,
  // dark) don't have an approach mechanic — the user just sits and lets the
  // scene happen. For these we detect "fear never climbed > 25 in the first
  // 5 s" → switch to wall-clock crediting so the rung still completes.
  const t0 = Date.now();
  let facingTimeMs = 0;
  let lastTickAt = Date.now();
  let isLookOnlyScene = false;
  let peakFearSoFar = 0;
  // Celebration is decoupled from the button flip: the button unlocks the
  // moment the hold completes (agency is immediate), but the fanfare waits
  // for a scene-provided "safe beat" gate — congratulating the user mid-snap
  // undercut both the praise and the fear.
  let celebrationDue = 0;
  let celebrationFired = false;
  // Once the hold is met it stays met — a scene's "settled" test can flip
  // back when the alarm spikes again after completion, and the exit must
  // never re-lock.
  let holdMet = false;
  // From the first moment, so leaving before the first tick still rates
  // this trial (as an early step-out) rather than "no trial to rate".
  // (Under the opening card there is no trial yet: leaving from the card
  // rates nothing. armTrialIntro writes it when the player steps in.)
  if (!intro) {
    lastRungOutcome = { heldSec: 0, minHold, finished: false, phobia: phobiaKey, level: levelIdx };
    saveTrialSnap();
  } else {
    // …and in the reload snapshot: one left by a trial reloaded mid-way
    // brought its outcome back on the next load, rateable as a phantom.
    lastRungOutcome = null;
    saveTrialSnap();
  }
  window.__rungHoldComplete = false;
  const timer = document.getElementById("timer");
  const continueBtn = document.getElementById("continueBtn");
  const holdBar = document.getElementById("holdBarFill");
  const holdLabel = document.getElementById("holdLabel");
  continueBtn && (continueBtn.title = t("hold.stopTip", "You can stop at any time. Stopping early is logged as an early exit — never a failure."));
  // Approach scenes require physically closing the distance to the feared
  // thing. For these, standing at safety must earn ZERO credit and the
  // look-only wall-clock fallback never applies — otherwise a frightened user
  // "completes" the rung by waiting in the far corner, rehearsing the very
  // avoidance that exposure therapy exists to break.
  const isApproachScene = ["heights", "water", "dogs", "spiders", "snakes"].includes(phobiaKey);

  // Visual state: hold-bar dims when user isn't in fear zone, brightens
  // when they are. Communicates "you're earning credit right now".
  const interval = setInterval(() => {
    if (!timer || !timer.isConnected) {
      clearInterval(interval); stopAllAudio(); unblockKeys();
      // go() navigates with pushState, which fires no hashchange — so the
      // immersion listeners (chrome wake, goImmersive, fullscreenchange)
      // used to leak into every later page. The stage leaving the DOM is the
      // one signal every exit shares.
      try { releaseImmersion(); } catch {}
      return;
    }
    // Before the player steps in there is no trial to time or credit (the
    // scene's first frame is still noticed, or the start would wait on it).
    if (!started) { if (!sceneShown && sceneOnScreen()) markSceneShown(); lastTickAt = Date.now(); return; }
    const wallElapsed = Math.floor((Date.now() - (begunAt || t0)) / 1000);
    timer.textContent = fnum(String(Math.floor(wallElapsed / 60)).padStart(2, "0") + ":" + String(wallElapsed % 60).padStart(2, "0"));

    // Compute credit based on current fear value
    const now = Date.now();
    const dtMs = Math.max(0, Math.min(500, now - lastTickAt));
    lastTickAt = now;
    // Contract 3: time counts only while the player can see the scene. A
    // hidden tab stops drawing but this interval keeps running, so a hold
    // credited from the last frame's state completed trials nobody watched
    // (45 s in another tab → "held — well done"). Before the first frame —
    // or while the GPU context is lost — there is nothing to be in yet.
    // Skipped ticks still move lastTickAt, so coming back adds no catch-up.
    if (!sceneShown && sceneOnScreen()) markSceneShown();
    if (document.hidden || !sceneShown || !sceneOnScreen()) return;
    const fear = (window.PhobiaFear && window.PhobiaFear.get) ? window.PhobiaFear.get() : 0;
    peakFearSoFar = Math.max(peakFearSoFar, fear);
    lastRungPeakFear = peakFearSoFar;   // surfaced as the within-rung drop at completion
    // After 5 seconds, if fear never climbed > 25, this is a look-only scene
    // (driving, flying, speaking, needles, enclosed, storms, dark). Switch
    // to wall-clock crediting so the user can still complete the rung by
    // simply staying present. (Five seconds of the scene, not of the
    // loading card in front of it.)
    if (!isApproachScene && !isLookOnlyScene && now - sceneShownAt > 5000 && peakFearSoFar < 25) {
      isLookOnlyScene = true;
    }
    // Credit thresholds come from the fear model — scenes with gentler fear
    // ceilings (a calm dog rung) lower them via setCreditThresholds so
    // "full credit" is genuinely reachable. Defaults: 30/10.
    const th = (window.PhobiaFear && window.PhobiaFear.getCreditThresholds)
      ? window.PhobiaFear.getCreditThresholds() : { full: 30, partial: 10 };
    let creditFactor;
    if (isLookOnlyScene) {
      creditFactor = 1.0;
    } else if (fear > th.full) {
      creditFactor = 1.0;          // facing the fear → full credit
    } else if (fear > th.partial) {
      creditFactor = 0.5;          // approaching → partial credit
    } else {
      // At safety. Approach scenes earn NOTHING — you must engage to progress.
      // Other graded scenes keep a small floor so no one is hard-stuck.
      creditFactor = isApproachScene ? 0 : 0.25;
    }
    // Ungrounded scenes (no PhobiaFear set up at all) also fall back to wall-clock.
    const sceneKey = window.PhobiaFear && window.PhobiaFear.getScene && window.PhobiaFear.getScene();
    const hasFearInputs = !!sceneKey;
    if (!hasFearInputs) creditFactor = 1.0;
    // Scene-owned hold policy (opt-in, the dog realm). Fear-weighted credit
    // punishes the very thing exposure is for: once the alarm falls while you
    // stay, "fear > threshold" stops paying. A policy scene says instead what
    // being IN the exposure means (engaged: close enough, really there) and
    // what finishing means (ready: the alarm has come down on its own), and
    // may supply its own label and progress. Everything else — the honest
    // outcome, the celebration gate, the always-live exit — is unchanged.
    const pol = window.__holdPolicy || null;
    let polEngaged = null;
    if (pol && typeof pol.engaged === "function") {
      try { polEngaged = !!pol.engaged(); } catch { polEngaged = false; }
      creditFactor = polEngaged ? 1 : 0;
    }
    // Grounding (Esc / Ground me) is a pause, not progress: it drains the fear
    // value on purpose, and the hold must not bank time — or let a policy
    // read that drained value as "settled" — while the player is looking
    // after themselves. The label says so (below).
    const grounding = !!(window.PhobiaFear && window.PhobiaFear.isGrounding && window.PhobiaFear.isGrounding());
    if (grounding) creditFactor = 0;
    facingTimeMs += dtMs * creditFactor;
    const facingSec = Math.floor(facingTimeMs / 1000);
    let polReady = true;
    if (pol && typeof pol.ready === "function") { try { polReady = !!pol.ready(facingSec, minHold); } catch { polReady = true; } }
    if (!holdMet && !grounding && facingSec >= minHold && polReady) holdMet = true;
    // Honest outcome, written every tick: leaving at ANY moment (the
    // continue button is always live) captures held time + finished state.
    const _o = lastRungOutcome;
    lastRungOutcome = { heldSec: facingSec, minHold, finished: holdMet, phobia: phobiaKey, level: levelIdx };
    if (!_o || _o.heldSec !== facingSec || _o.finished !== holdMet) saveTrialSnap();

    if (continueBtn && holdBar && holdLabel) {
      let pct = Math.min(100, (facingTimeMs / 1000 / minHold) * 100);
      if (pol && typeof pol.progress === "function") {
        try { const pr = pol.progress(facingTimeMs / 1000, minHold); if (pr != null && isFinite(pr)) pct = Math.max(0, Math.min(100, pr * 100)); } catch {}
      }
      if (holdMet) pct = 100;
      holdBar.style.width = pct + "%";
      // Mark the hold-bar "active" when credit is being earned, "idle" otherwise
      const inZone = creditFactor > 0.5;
      holdBar.parentElement.classList.toggle("in-zone", inZone);
      holdBar.parentElement.classList.toggle("idle", !inZone && hasFearInputs);
      // Mobile pill mirrors the bar
      const hpF = holdPill.querySelector(".hp-fill");
      const hpT = holdPill.querySelector(".hp-txt");
      if (hpF) hpF.style.width = pct + "%";
      let polLabel = null, polPill = null;
      if (pol && typeof pol.label === "function") {
        try { const L = pol.label(facingSec, minHold, polEngaged, polReady); if (L) { polLabel = L.label || null; polPill = L.pill || null; } } catch {}
      }
      // Held: the pill becomes the exit, carrying the stars so far — a star
      // that lands after the hold shows up here too.
      let starTxt = "";
      const SC = window.__coach;
      if (holdMet && SC && SC.starsTotal) starTxt = "★".repeat(SC.stars) + "☆".repeat(Math.max(0, SC.starsTotal - SC.stars));
      const pillTxt = holdMet ? (starTxt ? `🏮 ${starTxt}` : t("hold.pillDone3", "🏮 held"))
        : grounding ? tf("hold.pillGround", "⏸ {a}/{b}", { a: facingSec, b: fsecs(minHold) })
        : (polPill || `${fnum(facingSec)}/${fsecs(minHold)}`);
      if (hpT && hpT.textContent !== pillTxt) hpT.textContent = pillTxt;
      holdPill.classList.toggle("in-zone", inZone);
      // Held: the pill shows it (and the stars so far). It is no longer a
      // second Continue button — the one under the stage is always on screen
      // (fitTheaterStage), and two exits saying the same thing read as noise.
      if (holdMet && !holdPill.classList.contains("complete")) holdPill.classList.add("complete");

      if (!holdMet) {
        const remain = Math.max(0, minHold - facingSec);
        // The demo's button is an exit, not a hold coach — the per-tick label
        // rewrite would clobber "Step out — I've had a taste" within a second.
        // This button is the always-live EXIT. It used to read "Stay with
        // it · 6s", so the one control that leaves said to stay.
        if (!window.__demoMode) {
          continueBtn.textContent = t("hold.stepOut2", "Step out");
        }
        if (grounding) {
          holdLabel.textContent = tf("hold.groundPause", "{a} / {b}s · paused while you ground", { a: facingSec, b: minHold });
        } else if (polLabel) {
          holdLabel.textContent = polLabel;
        } else if (isLookOnlyScene || !hasFearInputs) {
          holdLabel.textContent = tf("hold.stay", "{a} / {b}s · stay with it", { a: facingSec, b: minHold });
        } else if (inZone) {
          holdLabel.textContent = tf("hold.full", "{a} / {b}s · holding · full credit", { a: facingSec, b: minHold });
        } else if (fear > 5 && creditFactor > 0) {
          holdLabel.textContent = tf("hold.closerFull", "{a} / {b}s · walk closer for full credit", { a: facingSec, b: minHold });
        } else if (isApproachScene) {
          holdLabel.textContent = tf("hold.closerBegin", "{a} / {b}s · walk closer to begin", { a: facingSec, b: minHold });
        } else {
          holdLabel.textContent = tf("hold.takeTime", "{a} / {b}s · take your time", { a: facingSec, b: minHold });
        }
      } else if (continueBtn.classList.contains("holding")) {
        // The BUTTON flips immediately — the user's exit is never gated.
        continueBtn.classList.remove("holding");
        continueBtn.classList.add("ready-pulse");
        continueBtn.textContent = window.__demoMode
          ? t("demo.stepOut", "Step out — I've had a taste")
          : t("hold.ready", "Continue");
        holdLabel.textContent = tf("hold.held", "held {n}s — well done", { n: facingSec });
        window.__rungHoldComplete = true;   // scenes read this for a diegetic beat
        // The story's spine, in the HUD: holding a trial lights its flame in
        // the realm's lantern (the coach card's lamp catches).
        try { stage.querySelectorAll(".dog-coach").forEach((c) => c.classList.add("dc-lit")); } catch {}
        // The held-it moment, made physical: a tiny double pulse in the palm.
        try { if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic([16, 90, 16]); } catch {}
        celebrationDue = Date.now();
      }
      // ---- Completion celebration (deferred) ----
      // Fires when the scene says it's a safe beat (gate function), or after
      // 6 s regardless — praise mid-lunge would undercut both the praise and
      // the fear.
      if (celebrationDue && !celebrationFired) {
        const gate = window.__holdCelebrationGate;
        let gateOpen = true;
        try { gateOpen = !gate || !!gate(); } catch {}
        if (gateOpen || Date.now() - celebrationDue > 6000) {
          celebrationFired = true;
          // Warm full-screen bloom + reward haptic land WITH the voice line, so
          // the resolution has the same physical weight the fear did.
          if (window.PhobiaFX && window.PhobiaFX.celebrate) window.PhobiaFX.celebrate();
          // Not in a policy scene: its coach says "Settled" in its own words
          // and the star lands — the same praise as a caption was a third
          // message on the same second.
          if (window.PhobiaVoice && !window.__holdPolicy) {
            try {
              // Spoken, in the warm register — the emotional payoff beat.
              window.PhobiaVoice.speak(t("vo.didIt", "You did it. You stayed with it. That is real progress."), { audible: true, praise: true });
            } catch {}
          }
          // The avatar's face relaxes with the praise (brows past neutral,
          // soft lower-lid raise) — Body listens for this event.
          try { window.dispatchEvent(new CustomEvent("mira-relief")); } catch {}
          // Not in a policy scene (dogs): its coach panel already ticks the
          // goal and the caption says it aloud — the toast was a fourth card
          // stacked on the same second.
          if (window.PhobiaFX && window.PhobiaFX.achievement && !window.__holdPolicy) {
            window.PhobiaFX.achievement(
              `${phobiaKey}.rungHeld.${levelIdx}`,
              "✨",
              t("hold.toastH", "Rung held"),
              tf("hold.toastP", "You faced rung {n} for {s}s. Real exposure.", { n: levelIdx + 1, s: Math.floor(facingTimeMs / 1000) })
            );
          }
          // A policy scene's coach has just said what happened, in its own
          // words, off the wave — a third line on top of the caption and the
          // toast only buried it.
          if (!window.__holdPolicy && window.PhobiaFX && window.PhobiaFX.contextPrompt) {
            window.PhobiaFX.contextPrompt(
              t("vo.didIt2", "You did it. You stayed with the fear and it didn't break you."),
              5000
            );
          }
          if (holdBar && holdBar.parentElement) {
            holdBar.parentElement.classList.add("complete");
            setTimeout(() => {
              if (holdBar.parentElement) holdBar.parentElement.classList.remove("complete");
            }, 2000);
          }
        }
      }
    }
  }, 250);

  function stopAllAudio() {
    stageAudio.forEach(a => { try { a.stop && a.stop(); } catch {} });
    stageAudio = [];
    window.PhobiaAudio?.stopFoley?.();
    voiceTimers.forEach(id => clearTimeout(id));
    voiceTimers = [];
    if (window.PhobiaVoice) window.PhobiaVoice.stop();
    window.removeEventListener("voice-line", onVoiceLine);
    // A trial left before its scene ever drew: nothing may start later, and
    // the listener must not keep this scope alive.
    window.removeEventListener("scene-ready", onSceneReady);
    sceneWaiters = [];
    if (captionsTimer) clearTimeout(captionsTimer);
    // Tear down the inactivity watcher
    if (inactivityInterval) { clearInterval(inactivityInterval); inactivityInterval = null; }
    INACTIVITY_EVENTS.forEach(ev => window.removeEventListener(ev, onAnyActivity));
    if (window.__stopTrialAudio === stopAllAudio) window.__stopTrialAudio = null;
    if (stage && stage._orientSnap) { window.removeEventListener("orientationchange", stage._orientSnap); stage._orientSnap = null; }
  }
  // Also stop audio when the page goes away. One listener for the page's
  // life, calling whichever trial is current — this used to add a new one
  // (a new closure) every time a trial opened.
  window.__stopTrialAudio = stopAllAudio;
  if (!window.__trialUnloadWired) {
    window.__trialUnloadWired = true;
    // A closure made here would hold this first trial's whole scope (stage,
    // scene, renderer) for the rest of the session; the handler lives outside.
    window.addEventListener("beforeunload", stopCurrentTrialAudio);
  }

  // SUDS slider live update. The readout starts blank ("—") and Save stays
  // disabled until the user actually moves the slider, so the rating is a
  // self-generated reading, not a confirmed low default that skews the whole
  // learning loop (predicted-vs-actual gap, habituation, insights).
  // Both sliders must be moved before the rating can be saved: the peak is
  // what the prediction is scored against, so an untouched default there
  // would quietly fabricate the expectancy-violation result.
  const suds = document.getElementById("suds");
  const sudsPeak = document.getElementById("sudsPeak");
  if (suds) {
    const submit = document.getElementById("rateSubmit");
    const touched = { now: false, peak: false };
    const refresh = () => {
      if (submit) submit.disabled = !(touched.now && touched.peak);
    };
    const wire = (el, outId, hintId, key) => {
      if (!el) { touched[key] = true; return; }
      const out = document.getElementById(outId);
      const hint = document.getElementById(hintId);
      const onFirst = () => {
        if (out) out.textContent = el.value;
        touched[key] = true;
        if (hint) hint.style.display = "none";
        refresh();
      };
      el.addEventListener("input", onFirst);
      el.addEventListener("change", onFirst);
    };
    wire(sudsPeak, "sudsPeakValue", "sudsPeakHint", "peak");
    wire(suds, "sudsValue", "sudsHint", "now");
    refresh();
  }
}

// ---------- Per-scene audio mixes ----------
// What a realm sounds like lives in ONE place: PhobiaAudio.startEnvironment
// (src/app/audio.js, envBeds). This passes it what only the app knows — the
// rung's data and the hour/weather this visit was given — and owns the handles.
function startSceneAudio(phobiaKey, levelIdx) {
  const A = window.PhobiaAudio; if (!A || !A.startEnvironment) return [];
  const lv = (PHOBIAS[phobiaKey] && PHOBIAS[phobiaKey].levels && PHOBIAS[phobiaKey].levels[levelIdx]) || {};
  let ctx = null;
  try { ctx = window.Scene3D && window.Scene3D.currentContext && window.Scene3D.currentContext(phobiaKey, levelIdx); } catch {}
  try {
    return A.startEnvironment(phobiaKey, levelIdx, { lv, hour: ctx && ctx.hour, weather: ctx && ctx.weather }) || [];
  } catch (e) { console.warn("scene audio:", e); return []; }
}

// SUDS slider live update (also used on rate + predict views)
document.addEventListener("input", (e) => {
  if (!e.target) return;
  if (e.target.classList && e.target.classList.contains("suds-range")) syncSudsChips(e.target);
  if (e.target.id === "suds" || e.target.id === "sudsPeak") {
    // First move records the reading: reveal it, hide its hint. Save waits
    // for BOTH readings — the peak is what the prediction is scored against,
    // and the old handler only watched "right now", so an untouched peak
    // slider silently submitted its default 5 (the rate view never ran the
    // two-slider wiring that lives in mountExposure).
    const isPeak = e.target.id === "sudsPeak";
    const out = document.getElementById(isPeak ? "sudsPeakValue" : "sudsValue");
    if (out) out.textContent = e.target.value;
    const hint = document.getElementById(isPeak ? "sudsPeakHint" : "sudsHint");
    if (hint) hint.style.display = "none";
    // Once the peak is in (never before — it would anchor the rating), set
    // it beside the guess made at the gate.
    const echo = isPeak && document.getElementById("predEcho");
    if (echo) {
      echo.textContent = tf("rate.predEcho2", "Before you stepped in, you guessed {p}. It peaked at {v}.", { p: +echo.dataset.p, v: +e.target.value });
      echo.hidden = false;
    }
    // The second question steps in once the first is answered (views-trial
    // viewRate), and scrolls into reach on a short screen.
    const step2 = isPeak && document.getElementById("dbStep2");
    if (step2 && step2.hidden) {
      step2.hidden = false;
      setTimeout(() => { try { step2.scrollIntoView({ block: "nearest", behavior: "smooth" }); } catch {} }, 80);
    }
    const submit = document.getElementById("rateSubmit");
    if (submit) {
      submit.dataset[isPeak ? "peakTouched" : "nowTouched"] = "1";
      const needPeak = !!document.getElementById("sudsPeak");
      submit.disabled = !(submit.dataset.nowTouched && (!needPeak || submit.dataset.peakTouched));
    }
  } else if (e.target.id === "predictedSuds") {
    e.target.dataset.touched = "1";
    const out = document.getElementById("predictedValue");
    if (out) out.textContent = e.target.value;
  }
});

// ---------- Breathing animation ----------
function runBreathing() {
  const c = document.getElementById("breathCircle");
  if (!c) return;
  // In 4, out 6 — the same rhythm as the in-scene breath and the Spark card
  // (this page used to count 4-hold-4-hold, contradicting both).
  const phases = [
    { cls: "inhale", text: t("breath.in", "Inhale…"), ms: 4000 },
    { cls: "exhale", text: t("breath.out", "Exhale…"), ms: 6000 },
  ];
  let i = 0;
  function step() {
    if (!c.isConnected) return;
    c.classList.remove("inhale", "exhale");
    const phase = phases[i % phases.length];
    c.style.transitionDuration = phase.ms + "ms";
    if (phase.cls) c.classList.add(phase.cls);
    c.textContent = phase.text;
    i++;
    setTimeout(step, phase.ms);
  }
  step();
}

// The page-lifetime unload hook for whichever trial is current (see
// mountExposure). Top-level so it captures no trial's scope.
function stopCurrentTrialAudio() {
  try { window.__stopTrialAudio && window.__stopTrialAudio(); } catch {}
}

// ---- Second-finger taps ----
// A browser only turns a touch into a `click` when it is the ONLY finger on
// the screen. In a trial one thumb lives on the joystick, so every button the
// other thumb tapped — a read answer, a verb, Step out, even Ground me — got
// its pointerdown and pointerup and then nothing. For a touch that is not the
// primary pointer, a short tap that starts and ends on the same control is
// delivered as the click it was meant to be.
(function secondFingerTaps() {
  const downs = new Map();   // pointerId → { el, x, y, t }
  const control = (n) => n && n.closest && n.closest("button, [role=button], a[href], [data-action], .cmd-btn, .dc-opt");
  const inTrial = (el) => !!el.closest(".stage-wrap, .step-controls, .exposure-panel");
  document.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch" || e.isPrimary) return;
    const el = control(e.target);
    if (!el || el.disabled || !inTrial(el)) return;
    downs.set(e.pointerId, { el, x: e.clientX, y: e.clientY, t: performance.now() });
  }, true);
  document.addEventListener("pointerup", (e) => {
    const d = downs.get(e.pointerId);
    if (!d) return;
    downs.delete(e.pointerId);
    if (performance.now() - d.t > 700 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 22) return;
    const at = control(document.elementFromPoint(e.clientX, e.clientY));
    if (at !== d.el || !d.el.isConnected || d.el.disabled) return;
    try { d.el.click(); } catch {}
  }, true);
  document.addEventListener("pointercancel", (e) => downs.delete(e.pointerId), true);
})();
