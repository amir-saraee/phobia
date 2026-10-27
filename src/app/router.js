// The hash router and render(): parse / serialize routes, go(), and the view
// switch.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// ---------- Routing ----------
// Hash-based router. Each view has a stable URL — refresh keeps you on the
// same page, browser back/forward works, and you can deep-link friends to a
// specific phobia ladder or your insights page.
const root = document.getElementById("app");
let _suppressHashSync = false;

function serializeRoute(view, params = {}) {
  switch (view) {
    case "welcome":   return "/";
    case "select":    return "/fears";
    case "threshold": return "/begin";
    case "traveler":  return "/traveler";
    case "demo":      return "/try";
    case "quiz":      return "/check";
    case "about":     return "/about";
    case "journal":   return "/journal";
    case "story":     return "/story";
    case "report":    return "/report";
    case "insights":  return "/insights";
    case "profiles":  return "/profiles";
    case "character": return params.editing ? "/me/edit" : "/me";
    case "custom":    return "/custom" + (params.editing ? "/" + encodeURIComponent(params.editing) : "");
    case "ladder":    return "/" + encodeURIComponent(params.phobia || "");
    case "phobia-progress": return "/" + encodeURIComponent(params.phobia) + "/progress";
    case "predict":   return "/" + encodeURIComponent(params.phobia) + "/predict/" + (params.level ?? 0);
    case "exposure":  return "/" + encodeURIComponent(params.phobia) + "/exposure/" + (params.level ?? 0);
    case "rate":      return "/" + encodeURIComponent(params.phobia) + "/rate/" + (params.level ?? 0);
    case "breathe":   return "/" + encodeURIComponent(params.phobia) + "/breathe/" + (params.level ?? 0);
    case "complete":  return "/" + encodeURIComponent(params.phobia) + "/done/" + (params.level ?? 0);
    default:          return "/";
  }
}

function parseRoute(hash) {
  const path = (hash || "").replace(/^#/, "");
  const parts = path.replace(/^\//, "").split("/").filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  if (parts.length === 0) return { view: "welcome", params: {} };
  switch (parts[0]) {
    case "fears":    return { view: "select",    params: {} };
    case "begin":    return { view: "threshold", params: {} };
    case "try":      return { view: "demo",      params: {} };
    case "check":    return { view: "quiz",      params: {} };
    case "about":    return { view: "about",     params: {} };
    case "journal":  return { view: "journal",   params: {} };
    case "story":    return { view: "story",     params: {} };
    case "report":   return { view: "report",    params: {} };
    case "insights": return { view: "insights",  params: {} };
    case "profiles": return { view: "profiles",  params: {} };
    case "traveler": return { view: "traveler",  params: {} };
    case "me":       return { view: "character", params: { editing: parts[1] === "edit" } };
    case "custom":   return { view: "custom",    params: { editing: parts[1] || null } };
  }
  // Phobia-scoped routes (built-in or custom)
  const phobia = parts[0];
  if (PHOBIAS[phobia]) {
    // Clamp the level to the ladder's real range — an out-of-range / non-numeric
    // / negative index (bad deep link, or a custom ladder later trimmed shorter)
    // used to crash viewExposure/viewComplete on `lv.title` and blank the page.
    const rawLvl = parts[2] != null ? parseInt(parts[2], 10) : 0;
    const maxLvl = ((PHOBIAS[phobia].levels && PHOBIAS[phobia].levels.length) || 5) - 1;
    const lvl = Math.max(0, Math.min(maxLvl, Number.isFinite(rawLvl) ? rawLvl : 0));
    if (parts[1] === "progress") return { view: "phobia-progress", params: { phobia } };
    if (parts[1] === "predict")  return { view: "predict",  params: { phobia, level: lvl } };
    if (parts[1] === "exposure") return { view: "exposure", params: { phobia, level: lvl } };
    if (parts[1] === "rate")     return { view: "rate",     params: { phobia, level: lvl } };
    if (parts[1] === "breathe")  return { view: "breathe",  params: { phobia, level: lvl } };
    if (parts[1] === "done")     return { view: "complete", params: { phobia, level: lvl } };
    return { view: "ladder", params: { phobia } };
  }
  return { view: "welcome", params: {} };
}

// We control scroll behaviour explicitly: every navigation (in-app click,
// hash change, initial load) starts the new page at top. The browser's
// "scroll restoration" feature would interfere — turn it off so it doesn't
// fight with our scrollToTop().
if ("scrollRestoration" in history) {
  try { history.scrollRestoration = "manual"; } catch {}
}

function go(view, params) {
  params = params || {};
  const hash = "#" + serializeRoute(view, params);
  if (location.hash !== hash) {
    _suppressHashSync = true;
    history.pushState({ view, params }, "", hash);
    _suppressHashSync = false;
  }
  render(view, params);
  // SPA navigation should always start the new page at the top — otherwise
  // the previous page's scroll position bleeds into the next view (e.g. you
  // scroll halfway down the home grid, click a phobia, and land mid-ladder
  // unable to see its title). `instant` skips smooth-scroll so users don't
  // see a fly-by.
  scrollToTop();
}

// popstate (Back / Forward) is handled separately so we DO restore the prior
// scroll position when the user uses browser navigation. Hashchange + a click
// on an in-app button always go to the top.
function scrollToTop() {
  try {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  } catch {
    window.scrollTo(0, 0);
  }
  // Some mobile browsers track scroll on document.documentElement / body
  // differently; reset both to be safe.
  if (document.documentElement) document.documentElement.scrollTop = 0;
  if (document.body) document.body.scrollTop = 0;
}

window.addEventListener("hashchange", () => {
  if (_suppressHashSync) return;
  const route = parseRoute(location.hash);
  render(route.view, route.params);
  scrollToTop();
});
window.addEventListener("popstate", () => {
  const route = parseRoute(location.hash);
  render(route.view, route.params);
  // Don't force scroll on popstate — let the browser restore the prior
  // scroll position so Back / Forward feels natural.
});

// The brand's lantern glyph — header, title screen, wordmarks. Inline SVG so
// it follows the text colour and needs no request.
function brandLamp() {
  return `<svg class="lw-lamp" viewBox="0 0 24 32" aria-hidden="true" focusable="false"><path d="M12 1.5v3.5M7 5h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/><path d="M6.5 8h11l2 3v12l-2 3h-11l-2-3V11z" fill="rgba(255,200,110,.16)" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path class="lw-lamp-flame" d="M12 12.2c3 3.3 3 6.3 0 8.8c-3-2.5-3-5.5 0-8.8z" fill="#ffc86b"/></svg>`;
}

// A page that throws while drawing used to leave the screen blank with no way
// out but clearing site data (and with it, everything). Catch it, log it, and
// offer the way back: the title screen, a copy of the data, or a clean start.
function render(view, params) {
  try { renderView(view, params); if (isRtl()) faDigitsIn(document.getElementById("app")); }
  catch (err) {
    try { console.warn("[Lanternwalk] render failed:", err); } catch {}
    try { pushErrLog({ ts: Date.now(), msg: ("render " + view + ": " + String((err && err.message) || err)).slice(0, 300), route: location.hash }); } catch {}
    showRenderRecovery(view);
  }
}
// Persian pages: every number a view wrote with Latin digits (counts, stars,
// "/5", seconds) is rewritten in Persian digits — text nodes only, never
// attributes, inputs or the clinical report, which stays English by design.
function faDigitsIn(root) {
  if (!root || typeof document.createTreeWalker !== "function") return;
  const skip = (el) => !el || !!el.closest("script, style, textarea, input, select, code, pre, .report-view, [lang='en'], .no-fa-digits");
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const todo = [];
  let n;
  while ((n = w.nextNode())) if (/[0-9]/.test(n.nodeValue) && !skip(n.parentElement)) todo.push(n);
  for (const t of todo) t.nodeValue = fnum(t.nodeValue);
}
function showRenderRecovery(view) {
  const root = document.getElementById("app");
  if (!root) return;
  root.innerHTML = `
    <main id="view" role="main" class="render-recovery">
      <div class="card" style="max-width:520px;margin:12vh auto;padding:24px">
        <h2 style="margin-top:0">${t("rec.title", "Something on this page didn't load")}</h2>
        <p>${t("rec.body", "Your saved data may be damaged, or this page hit a bug. Nothing has been deleted.")}</p>
        <div class="actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">
          ${view !== "welcome" ? `<button class="btn-primary" id="recHome">${t("rec.home", "Back to the start")}</button>` : ""}
          <button class="btn-ghost" id="recSave">${t("rec.save", "Save a copy of my data")}</button>
          <button class="btn-ghost" id="recReset">${t("rec.reset", "Erase data and start over")}</button>
        </div>
      </div>
    </main>`;
  const home = document.getElementById("recHome");
  if (home) home.onclick = () => { location.hash = "#/"; };
  document.getElementById("recSave").onclick = () => {
    const dump = {};
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("fobia.")) dump[k] = localStorage.getItem(k); } } catch {}
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lanternwalk-raw-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
  };
  document.getElementById("recReset").onclick = () => {
    if (!confirm(t("rec.confirm", "Erase every character, session and setting on this device? This can't be undone."))) return;
    eraseAllLocalData();
    location.hash = "#/";
    location.reload();
  };
}
function renderView(view, params) {
  // Tear down any active 3D scene + audio + voice before swapping the DOM
  if (window.Scene3D && typeof window.Scene3D.unmount === "function") {
    window.Scene3D.unmount();
  }
  // Shell vignettes (camp fire, realm heroes) are per-view; drop them too.
  if (window.ShellScenes && typeof window.ShellScenes.unmountAll === "function") {
    window.ShellScenes.unmountAll();
  }
  // The title-screen avatar turntable — full cleanup (listeners + geometry),
  // not just the renderer self-dispose. The character creator re-mounts its
  // own instance after render, so this is always safe.
  if (window.AvatarPreview && typeof window.AvatarPreview.unmount === "function") {
    window.AvatarPreview.unmount();
  }
  if (window.PhobiaVoice) window.PhobiaVoice.stop();
  if (window._landingAudio) {
    try { window._landingAudio.stop(); } catch {}
    window._landingAudio = null;
  }
  // A closed realm (see LAUNCH_OPEN) answers every one of its routes — map
  // link, deep link, old bookmark — with its "coming soon" page.
  if (params && params.phobia && PHOBIAS[params.phobia] && !realmOpen(params.phobia) &&
      ["ladder", "phobia-progress", "predict", "exposure", "rate", "breathe", "complete"].includes(view)) {
    view = "soon";
  }
  // Fetch an open realm's scene code while the player is still on its ladder
  // or predict page, so the trial itself mounts without a wait.
  if (params && params.phobia && view !== "soon" && window.Scene3D && window.Scene3D.preload) {
    window.Scene3D.preload(params.phobia);
  }
  const isLanding = view === "welcome" || view === "threshold";
  document.body.classList.toggle("landing-mode", isLanding);
  const appEl = document.getElementById("app");
  if (appEl) appEl.classList.toggle("landing-mode", isLanding);
  // Immersive views draw their own full-bleed 3D stage and own the whole
  // screen, so the document behind must not scroll — on iOS a scrollable body
  // under a fixed stage means every drag fights the address bar.
  const isImmersive = view === "welcome" || view === "traveler";
  document.body.classList.toggle("mob-immersive", isImmersive);
  // Any leftover tutorial overlays from a previous mount must be removed,
  // otherwise they linger on body when the view re-renders.
  document.querySelectorAll(".tour-overlay").forEach(el => el.remove());
  // The header carries what you check at a glance (courage, who you are,
  // the language) and the way back to camp. Sparks, progress, sound and
  // settings each had a header icon AND a place in the ☰ drawer; on a phone
  // the row ran off the screen. They live in the drawer now.
  const menuBtn = `<button class="audio-btn" id="menuBtn" title="${t("nav.menu", "Menu")}" aria-label="${t("a11y.openMenu", "Open menu")}">☰</button>`;
  // Character avatar in header (when one exists). The badge opens the profile
  // picker if the user has more than one character, otherwise the editor.
  const character = window.Character && window.Character.loadCharacter();
  const allChars = window.Character ? window.Character.loadCharacters() : [];
  const streak = computeStreak();
  const charBadge = character ? `
    <button class="char-badge" id="charBadge" title="${allChars.length > 1 ? t("a11y.switchChar", "Switch character") : t("a11y.editChar", "Edit character")}">
      <span class="char-badge-avatar">${window.Character.avatarSVG(character, 28)}</span>
      ${character.name ? `<span class="char-badge-name">${escapeHtml(character.name)}</span>` : ""}
      ${allChars.length > 1 ? `<span class="char-badge-count">${allChars.length}</span>` : ""}
      ${streak >= 2 ? `<span class="char-badge-streak" title="${tf("a11y.streak", "{n}-day streak", { n: streak })}">🔥 ${streak}</span>` : ""}
    </button>` : "";
  const isFa = window.I18n && window.I18n.currentLanguage() === "fa";
  const langBtn = `<button class="audio-btn lang-btn" id="langBtn" title="${isFa ? "Switch to English" : "تغییر زبان به فارسی"}" aria-label="${t("a11y.lang", "Change language")}" lang="${isFa ? "en" : "fa"}">${isFa ? "EN" : "فا"}</button>`;
  const html = `
    <a class="skip-link" href="#view">${t("a11y.skip", "Skip to main content")}</a>
    <header class="brand" role="banner">
      <div class="brand-left">
        ${menuBtn}
        <h1 class="lw-head">${brandLamp()}<span class="lw-name">${t("brand.name", "Lanternwalk")}</span> <span class="brand-tag">${t("brand.tag", "small steps, brave paths")}</span></h1>
      </div>
      <nav class="nav-actions" aria-label="${t("a11y.nav", "App navigation")}">
        ${getCourage() > 0 ? `<span class="courage-badge" id="courageBadge" title="${t("hud.courage", "Courage — earned every time you face a trial")}">⚡ ${fnum(getCourage())}</span>` : ""}
        ${charBadge}
        ${langBtn}
        ${view !== "welcome" && view !== "character" && view !== "threshold" ? `<button class="home-btn" id="home" aria-label="${t("a11y.home", "Back to the journey map")}">${t("hud.camp", "🏕 Camp")}</button>` : ""}
      </nav>
    </header>
    <main id="view" role="main"></main>
  `;
  root.innerHTML = html;
  const v = document.getElementById("view");
  // Set focus to main content for screen readers when navigating
  if (v && v.setAttribute) { v.setAttribute("tabindex", "-1"); }
  if (view === "welcome")     v.innerHTML = viewArrival();
  if (view === "traveler")    v.innerHTML = viewTraveler();
  if (view === "threshold")   v.innerHTML = viewThreshold();
  if (view === "character")   v.innerHTML = viewCharacterPage(params.editing);
  if (view === "select")      v.innerHTML = viewSelect();
  if (view === "ladder")      v.innerHTML = viewLadder(params.phobia);
  if (view === "soon")        v.innerHTML = viewRealmSoon(params.phobia);
  if (view === "predict")     v.innerHTML = viewPredict(params.phobia, params.level);
  if (view === "exposure")    v.innerHTML = viewExposure(params.phobia, params.level);
  // The instant demo IS the dogs first rung — same view, same mount — with a
  // flag the exposure chrome reads: no character needed (Body falls back to
  // its defaults), the exit goes to an invitation instead of the rate flow,
  // and nothing writes ladder progress. Seven screens stood between a new
  // visitor and the first 3D moment; this is the shortcut past all of them.
  if (view === "demo")      { window.__demoMode = true; v.innerHTML = viewExposure("dogs", 0); }
  else if (window.__demoMode) window.__demoMode = false;
  if (view === "quiz")        v.innerHTML = viewQuiz();
  // A page found on your own needs no signpost: seeing insights or the report
  // retires the camp nudge that would have pointed there.
  if (view === "insights")    markNudgeDone("insights");
  if (view === "report")      markNudgeDone("report");
  if (view === "rate")        v.innerHTML = viewRate(params.phobia, params.level);
  if (view === "breathe")     v.innerHTML = viewBreathe(params.phobia, params.level);
  if (view === "complete") {
    // suds/predicted may not be on params (e.g. on URL refresh) — pull them
    // from the most recent matching log entry instead so the page reads right.
    let suds = params.suds, predicted = params.predicted, peak = params.peak;
    if (suds == null && state.log) {
      const recent = [...state.log].reverse().find(l => l.phobia === params.phobia && l.level === params.level);
      if (recent) { suds = recent.suds; predicted = recent.predicted; peak = recent.peak; }
    }
    v.innerHTML = viewComplete(params.phobia, params.level, suds, predicted, peak);
  }
  if (view === "insights")    v.innerHTML = viewInsights();
  // The Story Book holds the chapters, what you've learned, and the Sparks —
  // one book instead of two. #/journal opens it on the Sparks tab.
  if (view === "journal" || view === "story") {
    v.innerHTML = window.Story
      ? window.Story.viewBook({ tab: view === "journal" ? "sparks" : "chapters", sparksHTML: sparksGridHTML() })
      : viewJournal();
  }
  if (view === "about")       v.innerHTML = viewAbout();
  if (view === "report")      v.innerHTML = viewReport();
  if (view === "profiles")    v.innerHTML = viewProfiles();
  if (view === "custom")      v.innerHTML = viewCustom(params.editing);
  if (view === "phobia-progress") v.innerHTML = viewPhobiaProgress(params.phobia);

  // Background ambient pad — runs on non-exposure views when music is enabled
  ensureAmbient(view);

  attachHandlers(view, params);
  if (view === "character") attachCharacterHandlers(params.editing);
  if (view === "custom")    attachCustomHandlers(params.editing);
  if ((view === "story" || view === "journal") && window.Story) window.Story.mountBook();
  // A frame for the page (and its loading card) to paint before the scene is
  // built — then build, unless the player already left.
  if (view === "exposure" || view === "demo") {
    const key = view === "demo" ? "dogs" : params.phobia, lvl = view === "demo" ? 0 : params.level;
    const stageEl = document.getElementById("stage");
    const mountNow = () => requestAnimationFrame(() => setTimeout(() => {
      if (!stageEl || !stageEl.isConnected) return;
      mountExposure(key, lvl);
    }, 0));
    // A deep link into a trial used to start the scene (the barking dog,
    // the drop) running behind the first-visit notice, before anyone agreed
    // to anything. The scene waits for the notice now.
    if (typeof hasConsented === "function" && !hasConsented()) {
      window.addEventListener("consent-given", () => { if (stageEl && stageEl.isConnected) mountNow(); }, { once: true });
      showConsent(false);
    } else mountNow();
  }
  if (view === "breathe")   runBreathing();
  if (view === "threshold" || view === "select" || view === "ladder") mountShell3D(view, params);
  // The title screen is the SVG valley now; only the creator stands in the room.
  if (view === "traveler") mountRoomStage(view);
  if (view === "traveler")  attachTravelerHandlers();
  if (view === "threshold") mountThresholdHUD();
  if (view === "select")    mountJourney();
  upgradeFaces(root);

  // Move focus to the new view's heading so keyboard + screen-reader users
  // don't get stranded on the just-removed element (which drops focus to
  // <body>, forcing a full re-Tab and announcing nothing). Never focus INTO
  // the WebGL canvas on exposure — focus the container instead.
  try {
    requestAnimationFrame(() => {
      if (!v || !v.isConnected) return;
      const h = (view !== "exposure") ? v.querySelector("h1, h2") : null;
      const target = h || v;
      if (h && !h.hasAttribute("tabindex")) h.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  } catch {}

  // ---- View entrance animation ----
  // Trigger the fade-up animation by toggling the .view-enter class. Strip
  // it after the animation finishes so future re-renders can re-trigger it.
  // Skipped for the exposure scene because the canvas already does its own
  // smooth scene-ready fade — stacking animations looks janky.
  if (v && view !== "exposure" && view !== "welcome" && view !== "threshold") {
    v.classList.remove("view-enter");
    // Force a reflow so removing+adding the class re-runs the animation
    void v.offsetWidth;
    v.classList.add("view-enter");
    setTimeout(() => v && v.classList.remove("view-enter"), 500);
  }
}
