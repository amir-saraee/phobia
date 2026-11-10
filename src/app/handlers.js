// Global UI wiring: the character page, attachHandlers / handleAction, the
// menu and settings drawers, the stage breath, feedback, primer flags.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// The name a traveler is shown by. A traveler may have none (the one-tap
// start makes one for you, and the name is optional): they're shown as
// "Traveler" — never saved as that, or the creator offered "Traveler" back as
// the name they'd chosen.
function travelerDisplayName(ch) {
  const n = ch && typeof ch.name === "string" ? ch.name.trim() : "";
  return n || t("tw.defaultName", "Traveler");
}

function viewCharacterPage(editing) {
  if (!window.Character) return `<div class="panel"><p>${t("loading", "Loading…")}</p></div>`;
  const existing = editing ? window.Character.loadCharacter() : null;
  const kicker = editing ? "" : `<p class="landing-kicker" style="text-align:center;margin-bottom:10px">${t("story.creatorKicker", "chapter one — become someone")}</p>`;
  return `
    <div class="panel">
      ${kicker}
      ${window.Character.viewCharacterCreator(existing, pickablePhobias(existing))}
    </div>
  `;
}

function attachCharacterHandlers(editing) {
  if (!window.Character) return;
  const existing = editing ? window.Character.loadCharacter() : null;
  window.Character.attachCreatorHandlers(
    existing, pickablePhobias(existing),
    (savedChar) => {
      window._prevActiveCharId = null;
      // First creation: a 3D threshold scene names the fear and opens the path.
      // Editing an existing traveler returns to their ladder.
      if (editing) go("ladder", { phobia: savedChar.primaryPhobia });
      else go("threshold");
    },
    () => {
      // Cancelling a NEW character: restore the previously-active character so
      // the active id doesn't stay stuck on the "__new__" sentinel.
      if (!existing && window._prevActiveCharId) {
        try { window.Character.setActiveCharacter(window._prevActiveCharId); } catch {}
      }
      window._prevActiveCharId = null;
      go(existing ? "select" : "welcome");
    }
  );
}

// A creator draft belongs to the traveler it was started for. Left behind, it
// made "Edit your traveler" after a profile switch edit — and save over — the
// one before. Dropped whenever the traveler changes (and on leaving the
// creator, in renderView).
window.addEventListener("character-changed", () => { try { _travelerDraft = null; } catch {} });

function attachHandlers(view, params) {
  if (view === "welcome") gateTitleScreenOnConsent();
  const home = document.getElementById("home");
  if (home) home.onclick = () => { PhobiaAudio.unlock(); go("welcome"); };
  const audioBtn = document.getElementById("audioBtn");
  if (audioBtn) {
    audioBtn.onclick = () => {
      PhobiaAudio.unlock();
      const next = !PhobiaAudio.isMuted();
      PhobiaAudio.setMuted(next);
      audioBtn.textContent = next ? "🔇" : "🔊";
    };
  }
  const settingsBtn = document.getElementById("settingsBtn");
  if (settingsBtn) settingsBtn.onclick = openSettings;
  const menuBtn = document.getElementById("menuBtn");
  if (menuBtn) menuBtn.onclick = openMenu;
  const sparksHud = document.getElementById("sparksBtn");
  if (sparksHud) sparksHud.onclick = () => go("journal");
  // Language toggle: swap en <-> fa, re-render in place (applyLang inside
  // setLang stamps <html lang dir>, so RTL flips without a reload).
  const langBtnEl = document.getElementById("langBtn");
  if (langBtnEl) langBtnEl.onclick = () => {
    window.I18n.setLang(window.I18n.currentLanguage() === "fa" ? "en" : "fa");
    const route = parseRoute(location.hash);
    render(route.view, route.params);
  };
  // Progress report: print (browser print → PDF) + raw JSON download of the
  // active character's data. No network — a local Blob, revoked after click.
  const reportPrint = document.getElementById("reportPrint");
  if (reportPrint) reportPrint.onclick = () => window.print();
  const reportJson = document.getElementById("reportJson");
  if (reportJson) reportJson.onclick = () => {
    const ch = window.Character && window.Character.loadCharacter();
    const cs = activeCharSlice();
    const payload = {
      app: "Lanternwalk — exposure practice export",
      exportedAt: new Date().toISOString(),
      character: ch ? { name: ch.name || null, primaryPhobia: ch.primaryPhobia || null } : null,
      progress: state.progress,
      sessions: state.log,
      worldsteps: cs.worldsteps || {},
      fearChecks: cs.checks || {},
      courage: cs.courage || 0,
      sparks: cs.sparks || [],
      milestones: cs.milestones || [],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lanternwalk-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  // Spark of Wisdom card on the victory screen: tap (or wait) to flip it over.
  const sparkCard = document.getElementById("sparkCard");
  if (sparkCard) {
    const flip = () => {
      if (!sparkCard.classList.contains("flipped")) { try { PhobiaAudio.ui("spark"); } catch {} }
      sparkCard.classList.add("flipped");
    };
    sparkCard.addEventListener("click", flip);
    sparkCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); }
    });
    // It turns itself over once you can actually see it — it now sits under
    // the level card, and flipping off-screen wasted the reveal.
    try {
      const io = new IntersectionObserver((ents) => {
        if (ents.some((e) => e.isIntersecting)) { io.disconnect(); setTimeout(() => { if (sparkCard.isConnected) flip(); }, 1100); }
      }, { threshold: 0.6 });
      io.observe(sparkCard);
    } catch { setTimeout(() => { if (sparkCard.isConnected) flip(); }, 2200); }
  }
  // Level card: courage counts up and the rank bar fills, after the stars land.
  const vcRank = document.querySelector(".vc-rank");
  if (vcRank) {
    const fill = vcRank.querySelector(".rank-fill"), num = vcRank.querySelector(".vc-courage");
    const c0 = +vcRank.dataset.c0 || 0, c1 = +vcRank.dataset.c1 || 0;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const run = () => {
      if (!vcRank.isConnected) return;
      if (fill) fill.style.width = vcRank.dataset.to + "%";
      if (!num || reduce || c1 <= c0) { if (num) num.textContent = fnum(c1); return; }
      const t0 = performance.now(), dur = 1300;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        num.textContent = fnum(Math.round(c0 + (c1 - c0) * e));
        if (k < 1 && num.isConnected) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    setTimeout(run, reduce ? 0 : 1700);
  }
  // Victory shimmer — once, only when this render carries the fresh celebration.
  // With stars on the card, each one chimes as it lands and the shimmer
  // follows the last.
  if (view === "complete" && document.querySelector(".ember-burst")) {
    const lit = document.querySelectorAll(".vc-stars i.on").length;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!lit || reduce) { try { PhobiaAudio.ui("victory"); } catch {} }
    else {
      for (let i = 0; i < lit; i++) setTimeout(() => { try { if (document.querySelector(".vc-stars")) PhobiaAudio.ui("star" + (i + 1)); } catch {} }, 600 + i * 380);
      setTimeout(() => { try { if (document.querySelector(".vc-stars")) PhobiaAudio.ui("victory", 0.8); } catch {} }, 600 + lit * 380 + 250);
    }
  }
  const howBtn = document.getElementById("howItWorksBtn");
  if (howBtn) howBtn.onclick = () => {
    const panel = document.getElementById("howItWorksPanel");
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const charBadge = document.getElementById("charBadge");
  if (charBadge) charBadge.onclick = () => {
    const all = window.Character ? window.Character.loadCharacters() : [];
    if (all.length > 1) go("profiles");
    else { _travelerDraft = null; go("traveler"); }
  };
  // Share progress card (on the insights view)
  const shareBtn = document.getElementById("shareCardBtn");
  if (shareBtn) shareBtn.onclick = () => generateProgressCard();

  // Session journal save (on the complete view)
  const saveJournal = document.getElementById("saveJournal");
  if (saveJournal) saveJournal.onclick = () => {
    const note = (document.getElementById("journalNote")?.value || "").trim();
    if (!note) return;
    // Attach the note to the most recent log entry for this phobia
    const last = state.log[state.log.length - 1];
    if (last) {
      last.note = note.slice(0, 500);
      saveState();
      const ind = document.getElementById("journalSaved");
      if (ind) {
        ind.style.opacity = "1";
        setTimeout(() => { ind.style.opacity = "0"; }, 1800);
      }
    }
  };
  wireActions(document, params);
}
// Every [data-action] under `scope` runs handleAction on click. Markup a
// handler writes in after the page rendered (the self-check's result) calls
// this on itself — wired only at render time, those buttons were dead. Each
// element is wired once, however often it's called.
function wireActions(scope, params) {
  scope.querySelectorAll("[data-action]").forEach(el => {
    if (el._actWired) return;
    el._actWired = true;
    el.addEventListener("click", (e) => {
      // Stop propagation if marked, so inner buttons don't trigger the parent card
      if (el.dataset.stop) e.stopPropagation();
      // First-click audio unlock per browser autoplay policy
      PhobiaAudio.unlock();
      handleAction(el.dataset, params);
    });
    // Keyboard activation for elements we've made focusable (role="button"),
    // e.g. the phobia cards — Enter / Space triggers the same click handler.
    if (el.getAttribute("role") === "button" && el.tabIndex >= 0) {
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
          e.preventDefault();
          el.click();
        }
      });
    }
  });
}

// ---------- Ambient pad (background music on non-exposure views) ----------
function ensureAmbient(view) {
  let wantMusic = prefGet("fobia.music") === "1";
  // …but never inside a trial. A scene should sound like the place it is: your
  // feet, the room, and whatever the animal or the objects are doing. A pad
  // underneath it — however quiet — is the one voice in the mix that isn't
  // coming from anywhere in the world. Menus and the camp keep their music.
  if (view === "exposure") wantMusic = false;
  if (!wantMusic) {
    if (ambientPad) { try { ambientPad.stop(); } catch {} ambientPad = null; }
    return;
  }
  if (!ambientPad) {
    PhobiaAudio.unlock();
    ambientPad = PhobiaAudio.startAmbientPad();
  }
  try { if (ambientPad.setGain) ambientPad.setGain(0.045); } catch {}
}

// ---------- App side menu (slide-out from the left) ----------
function openMenu() {
  if (document.querySelector(".menu-drawer")) { closeMenu(); return; }
  const ch = window.Character && window.Character.loadCharacter();
  const allChars = window.Character ? window.Character.loadCharacters() : [];
  const drawer = document.createElement("aside");
  drawer.className = "menu-drawer";
  drawer.setAttribute("role", "navigation");
  drawer.setAttribute("aria-label", t("a11y.mainMenu", "Main menu"));
  drawer.innerHTML = `
    <button class="close-btn" id="closeMenu" aria-label="${t("a11y.closeMenu", "Close menu")}">✕</button>
    ${ch ? `
      <div class="menu-character">
        <div class="menu-avatar">${window.Character.avatarSVG(ch, 56)}</div>
        <div class="menu-character-text">
          <strong>${escapeHtml(travelerDisplayName(ch))}</strong>
          <span class="small">${(() => { const f = (ch.primaryPhobia ? 1 : 0) + (ch.additionalPhobias?.length || 0), s = state.log.length;
            return tf("pr.counts", `{f} fear${f === 1 ? "" : "s"} · {s} session${s === 1 ? "" : "s"}`, { f, s }); })()}${getCourage() > 0 ? ` · ⚡ ${fnum(getCourage())}` : ""}</span>
        </div>
      </div>
    ` : ""}
    <ul class="menu-list">
      <li><button data-go="welcome">${t("menu.home", "🏮 Home")}</button></li>
      ${ch ? `<li><button data-go="ladder" data-phobia="${escapeHtml((() => { try { return currentRealmKey(); } catch { return ch.primaryPhobia || ""; } })())}">${t("menu.realm", "🧭 Trials & real-world steps")}</button></li>` : ""}
      <li><button data-go="story">${t("menu.storyBook", "📖 The story — Mira's lanterns")}</button></li>
      ${ch && state.log.length ? `<li><button data-go="insights">${t("menu.progress", "📈 Your progress")}</button></li>` : ""}
      ${ch && state.log.length ? `<li><button data-go="report">${t("menu.report", "📄 Progress report — print / share")}</button></li>` : ""}
      ${ch && getSparks().length ? `<li><button data-go="journal">${t("menu.sparks", "✦ Book of Sparks")} <span class="menu-count">${fnum(getSparks().length)}</span></button></li>` : ""}
      ${allRealmsUnlocked() ? `<li><button data-go="custom">${t("menu.forge", "🛠 Forge a custom fear")}</button></li>` : ""}
    </ul>
    <div class="menu-divider"></div>
    <ul class="menu-list">
      <li><button data-go="traveler">${t("menu.editCharacter", "✎ Edit your traveler")}</button></li>
      ${allChars.length > 1 ? `<li><button data-go="profiles">${t("menu.switchCharacter", "⇄ Switch traveler")}</button></li>` : ""}
      <li><button id="menuLang" lang="${(window.I18n && window.I18n.currentLanguage() === "fa") ? "en" : "fa"}">${(window.I18n && window.I18n.currentLanguage() === "fa") ? "🌐 English" : "🌐 فارسی"}</button></li>
      <li><button id="menuSound">${PhobiaAudio.isMuted() ? t("menu.soundOff", "🔇 Sound: off") : t("menu.soundOn", "🔊 Sound: on")}</button></li>
      <li><button id="menuOpenSettings">${t("menu.settings", "⚙ Settings")}</button></li>
      <li><button data-go="about">${t("menu.about", "ℹ️ About Lanternwalk")}</button></li>
      <li><button id="menuFeedback">${t("fb.menu", "💬 Send feedback")}</button></li>
    </ul>
    <div class="menu-divider"></div>
    <p class="menu-footer">${t("menu.footer", "Lanternwalk · a practice game, not therapy.")}</p>
  `;
  // One icon column. Each label carries its icon as its first character (in
  // both languages); split it into its own fixed-width cell so the labels
  // line up, and swap the four text glyphs (✦ ✎ ⇄ ⚙) for emoji — they drew
  // smaller and in text colour, and pushed their labels out of line.
  const GLYPH_EMOJI = { "✦": "✨", "✎": "✏️", "⇄": "👥", "⚙": "⚙️" };
  const iconize = (b) => {
    const tn = b.firstChild;
    if (!tn || tn.nodeType !== 3) return;
    const m = /^\s*(\p{Extended_Pictographic}\p{Variation_Selector}?|[✦✎⇄⚙ℹ]\p{Variation_Selector}?)\s*/u.exec(tn.nodeValue);
    if (!m) return;
    tn.nodeValue = tn.nodeValue.slice(m[0].length);
    const ic = document.createElement("span");
    ic.className = "mi-ic"; ic.setAttribute("aria-hidden", "true");
    ic.textContent = GLYPH_EMOJI[m[1].replace(/\p{Variation_Selector}/gu, "")] || m[1];
    b.insertBefore(ic, b.firstChild);
  };
  drawer.querySelectorAll(".menu-list button").forEach(iconize);
  const backdrop = document.createElement("div");
  backdrop.className = "menu-backdrop";
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
  requestAnimationFrame(() => { drawer.classList.add("open"); backdrop.classList.add("show"); });
  upgradeFaces(drawer);

  drawer.querySelector("#closeMenu").onclick = closeMenu;
  backdrop.onclick = closeMenu;
  drawer.querySelector("#menuOpenSettings").onclick = () => { closeMenu(); openSettings(); };
  drawer.querySelector("#menuSound").onclick = (e) => {
    PhobiaAudio.unlock();
    const next = !PhobiaAudio.isMuted();
    PhobiaAudio.setMuted(next);
    e.currentTarget.textContent = next ? t("menu.soundOff", "🔇 Sound: off") : t("menu.soundOn", "🔊 Sound: on");
    iconize(e.currentTarget);
  };
  drawer.querySelector("#menuFeedback").onclick = () => { closeMenu(); openFeedback(location.hash); };
  drawer.querySelector("#menuLang").onclick = () => {
    closeMenu();
    window.I18n.setLang(window.I18n.currentLanguage() === "fa" ? "en" : "fa");
    const route = parseRoute(location.hash);
    render(route.view, route.params);
  };
  drawer.querySelectorAll("[data-go]").forEach(btn => {
    btn.onclick = () => {
      closeMenu();
      const v = btn.dataset.go;
      const params = {};
      if (btn.dataset.phobia) params.phobia = btn.dataset.phobia;
      if (btn.dataset.edit) params.editing = true;
      if (v === "ladder" && !params.phobia) { go("welcome"); return; }
      go(v, params);
    };
  });
  // Esc closes
  function onEsc(e) {
    if (e.key === "Escape") { closeMenu(); document.removeEventListener("keydown", onEsc); }
  }
  document.addEventListener("keydown", onEsc);
}
function closeMenu() {
  const d = document.querySelector(".menu-drawer");
  const b = document.querySelector(".menu-backdrop");
  if (d) { d.classList.remove("open"); setTimeout(() => d.remove(), 280); }
  if (b) { b.classList.remove("show"); setTimeout(() => b.remove(), 280); }
}

// ---------- Settings drawer ----------
function openSettings() {
  const existing = document.querySelector(".settings-drawer");
  if (existing) { closeSettings(); return; }
  const audioMuted = PhobiaAudio.isMuted();
  const drawer = document.createElement("div");
  drawer.className = "settings-drawer";
  // Read persisted preferences. prefGet/prefSet (boot-guards.js) never throw,
  // and keep this visit's choices in memory when storage is blocked — the
  // switches below used to throw on every tap there.
  const captionsOn = prefGet("fobia.captions") !== "0";
  const reducedMotion = prefGet("fobia.reducedMotion") === "1";
  const heartOn = prefGet("fobia.heart") !== "0";
  const hapticsOn = prefGet("fobia.haptics") !== "0";
  const perfHudOn = prefGet("fobia.perfHud") === "1";
  const musicOn = prefGet("fobia.music") === "1";
  const graphics = prefGet("fobia.quality") || "auto";
  const lightMode = prefGet("fobia.theme") === "light";
  const remindersOn = prefGet("fobia.reminders") === "1";
  const countdownOn = prefGet("fobia.countdown") === "1";
  const bigTextOn = prefGet("fobia.bigText") === "1";
  const canNotify = "Notification" in window;

  drawer.innerHTML = `
    <button class="close-btn" id="closeSettings" aria-label="${t("a11y.closeSettings", "Close settings")}">✕</button>
    <h3>${t("nav.settings", "Settings")}</h3>

    <div class="settings-section">${t("set.secSound", "Sound")}</div>
    <div class="row">
      <div>
        <label>${t("set.ambient", "Ambient sound")}</label>
        <div class="small">${t("set.ambientSub", "Wind, water, room tone, MRI clanging.")}</div>
      </div>
      <div class="toggle ${audioMuted ? "" : "on"}" id="toggleAudio"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.tips", "Guidance tips")}</label>
        <div class="small">${t("set.tipsSub", "Calm written cues on screen during exposure.")}</div>
      </div>
      <div class="toggle ${captionsOn ? "on" : ""}" id="toggleCaptions"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.vibe", "Vibration")}</label>
        <div class="small">${t("set.vibeSub", "Feel barks, touches and jolts in your hand (phones).")}</div>
      </div>
      <div class="toggle ${hapticsOn ? "on" : ""}" id="toggleHaptics"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.perf", "Performance overlay")}</label>
        <div class="small">${t("set.perfSub", "FPS and frame time at the top of the scene (debugging).")}</div>
      </div>
      <div class="toggle ${perfHudOn ? "on" : ""}" id="togglePerfHud"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.music", "Calm music")}</label>
        <div class="small">${t("set.musicSub", "A quiet pad on non-exposure pages. Off by default.")}</div>
      </div>
      <div class="toggle ${musicOn ? "on" : ""}" id="toggleMusic"></div>
    </div>

    <div class="settings-section">${t("set.secPerf", "Performance")}</div>
    <div class="row">
      <div>
        <label for="qualitySelect">${t("set.gfx", "Graphics")}</label>
        <div class="small">${t("set.gfxSub", "Lower if the scene stutters. \"Auto\" picks based on your device.")}</div>
      </div>
      <select id="qualitySelect" class="select-pill">
        <option value="auto" ${graphics === "auto" ? "selected" : ""}>${t("set.gfxAuto", "Auto")}</option>
        <option value="low" ${graphics === "low" ? "selected" : ""}>${t("set.gfxLow", "Low")}</option>
        <option value="medium" ${graphics === "medium" ? "selected" : ""}>${t("set.gfxMed", "Medium")}</option>
        <option value="high" ${graphics === "high" ? "selected" : ""}>${t("set.gfxHigh", "High")}</option>
      </select>
    </div>
    <div class="row">
      <div>
        <label for="langSelect">${t("set.lang", "Language")}</label>
        <div class="small">${t("set.langSub2", "English or فارسی — the whole game, the progress report too.")}</div>
      </div>
      <select id="langSelect" class="select-pill">
        <option value="en" ${(window.I18n?.currentLanguage() === "en") ? "selected" : ""}>English</option>
        <option value="fa" ${(window.I18n?.currentLanguage() === "fa") ? "selected" : ""}>فارسی</option>
      </select>
    </div>

    <div class="settings-section">${t("set.secSense", "Sensation")}</div>
    <div class="row">
      <div>
        <label>${t("set.heart", "Heart-rate vignette")}</label>
        <div class="small">${t("set.heartSub", "Red pulse around the screen at higher rungs.")}</div>
      </div>
      <div class="toggle ${heartOn ? "on" : ""}" id="toggleHeart"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.motion", "Reduce motion")}</label>
        <div class="small">${t("set.motionSub", "Less camera shake, calmer transitions.")}</div>
      </div>
      <div class="toggle ${reducedMotion ? "on" : ""}" id="toggleMotion"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.bigText", "Larger text")}</label>
        <div class="small">${t("set.bigTextSub", "Bigger words on every page and in the trial's labels.")}</div>
      </div>
      <div class="toggle ${bigTextOn ? "on" : ""}" id="toggleBigText"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.light", "Light mode")}</label>
        <div class="small">${t("set.lightSub", "Bright theme. Easier in daylight.")}</div>
      </div>
      <div class="toggle ${lightMode ? "on" : ""}" id="toggleTheme"></div>
    </div>
    <div class="row">
      <div>
        <label>${t("set.cd", "Pre-scene countdown")}</label>
        <div class="small">${t("set.cdSub", "\"Get ready · 3 · 2 · 1\" breathing beat before each scene.")}</div>
      </div>
      <div class="toggle ${countdownOn ? "on" : ""}" id="toggleCountdown"></div>
    </div>

    <div class="settings-section">${t("set.secRemind", "Reminders")}</div>
    <div class="row">
      <div>
        <label>${t("set.nudge", "Daily nudge")}</label>
        <div class="small">${canNotify ? t("set.nudgeSub", "A short notification once a day so you don't lose the streak.") : t("set.nudgeNo", "Notifications aren't supported in this browser.")}</div>
      </div>
      <div class="toggle ${remindersOn ? "on" : ""} ${canNotify ? "" : "disabled"}" id="toggleReminders"></div>
    </div>

    <div class="settings-section">${t("set.secProfile", "Profile")}</div>
    <div class="row">
      <div>
        <label>${t("set.editChar", "Edit your character")}</label>
        <div class="small">${t("set.editCharSub", "Change name, look, or which fears you're working on.")}</div>
      </div>
      <button class="btn-ghost" id="editCharBtn" style="padding:6px 12px;font-size:12px;">${t("set.edit", "Edit")}</button>
    </div>
    <div class="row">
      <div>
        <label>${t("set.switch", "Switch / add character")}</label>
        <div class="small">${(() => { const n = (window.Character?.loadCharacters() || []).length; return tf(n === 1 ? "set.switchSub1" : "set.switchSub", `{n} character${n === 1 ? "" : "s"} on this device.`, { n }); })()}</div>
      </div>
      <button class="btn-ghost" id="profilesBtn" style="padding:6px 12px;font-size:12px;">${t("set.profiles", "Profiles")}</button>
    </div>
    <div class="row">
      <div>
        <label>${t("set.export", "Export your data")}</label>
        <div class="small">${t("set.exportSub", "Download a JSON of every character, session, and note.")}</div>
      </div>
      <button class="btn-ghost" id="exportBtn" style="padding:6px 12px;font-size:12px;">${t("set.exportBtn", "Export")}</button>
    </div>
    <div class="row">
      <div>
        <label>${t("set.import", "Import data")}</label>
        <div class="small">${t("set.importSub", "Restore from a previous export. Overwrites current data.")}</div>
      </div>
      <button class="btn-ghost" id="importBtn" style="padding:6px 12px;font-size:12px;">${t("set.importBtn", "Import")}</button>
    </div>
    ${allRealmsUnlocked() ? `<div class="row">
      <div>
        <label>${t("set.custom", "Custom ladder")}</label>
        <div class="small">${t("set.customSub", "Build your own phobia and rungs.")}</div>
      </div>
      <button class="btn-ghost" id="customBtn" style="padding:6px 12px;font-size:12px;">${t("set.build", "Build")}</button>
    </div>` : ""}
    <div class="row">
      <div>
        <label>${t("settings.tour", "Replay onboarding tour")}</label>
        <div class="small">${t("settings.tourSub", "See the short intro again the next time you start a trial.")}</div>
      </div>
      <button class="btn-ghost" id="replayTourBtn" style="padding:6px 12px;font-size:12px;">${t("set.replay", "Replay")}</button>
    </div>
    <div class="row">
      <div>
        <label>${t("set.reset", "Reset this character's progress")}</label>
        <div class="small">${t("set.resetSub", "Clears this character's ladder, SUDS log, courage and goals. Other characters are untouched.")}</div>
      </div>
      <button class="btn-warn" id="resetAllBtn" style="padding:6px 12px;font-size:12px;">${t("set.resetBtn", "Reset")}</button>
    </div>
    <div class="row">
      <div>
        <label>${t("set.erase", "Erase everything on this device")}</label>
        <div class="small">${t("set.eraseSub", "Every character, session, note, dog and setting. For a shared device, or a fresh start.")}</div>
      </div>
      <button class="btn-warn" id="eraseAllBtn" style="padding:6px 12px;font-size:12px;">${t("set.eraseBtn", "Erase")}</button>
    </div>

    <div class="settings-section">${t("settings.diag", "Diagnostics")}</div>
    <div class="row">
      <div>
        <label>${t("settings.diagErrors", "Error journal")}</label>
        <div class="small" id="diagCount">${readErrLog().length ? tf("settings.diagCount", "{n} error(s) recorded on this device.", { n: readErrLog().length }) : t("settings.diagNone", "No errors recorded. If something breaks, it lands here.")}</div>
      </div>
      <div style="display:flex;gap:6px">
        <button class="btn-ghost" id="diagCopyBtn" style="padding:6px 12px;font-size:12px;" ${readErrLog().length ? "" : "disabled"}>${t("settings.diagCopy", "Copy")}</button>
        <button class="btn-ghost" id="diagClearBtn" style="padding:6px 12px;font-size:12px;" ${readErrLog().length ? "" : "disabled"}>${t("settings.diagClear", "Clear")}</button>
      </div>
    </div>
    <div class="row">
      <div>
        <label>${t("fb.settings", "Feedback")}</label>
        <div class="small">${t("fb.settingsSub", "A bug, a stuck moment, something that helped — tell us.")}</div>
      </div>
      <button class="btn-ghost" id="fbBtn" style="padding:6px 12px;font-size:12px;">${t("fb.write", "Write")}</button>
    </div>
    <div class="row">
      <div>
        <label>${t("settings.about", "About Lanternwalk")}</label>
        <div class="small">${t("settings.aboutSub", "What this is, the science, privacy, credits.")}</div>
      </div>
      <button class="btn-ghost" id="aboutBtn" style="padding:6px 12px;font-size:12px;">${t("settings.aboutOpen", "Open")}</button>
    </div>

    <p class="small" style="margin-top:18px">
      ${t("settings.footer", "This is a practice game, not therapy. If a phobia is interfering with your life, a trained clinician can run real exposure work with you safely.")}
    </p>
    <p class="small settings-links">
      <a href="${PRIVACY_URL}" target="_blank" rel="noopener">${t("legal.privacy", "Privacy policy")}</a>
      · ${t("legal.contact", "Contact:")} <a href="mailto:${SUPPORT_EMAIL}" dir="ltr" lang="en">${SUPPORT_EMAIL}</a>
      · ${tf("legal.version", "Version {v}", { v: `<bdi class="no-fa-digits" dir="ltr">${APP_VERSION}</bdi>` })}
    </p>
  `;
  const backdrop = document.createElement("div");
  backdrop.className = "settings-backdrop";
  document.body.appendChild(backdrop);
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-label", t("settings.title", "Settings"));
  document.body.appendChild(drawer);
  a11ySwitches(drawer);
  // A drawer left open across a route change sat over the next page.
  window.addEventListener("hashchange", closeSettings, { once: true });
  // Trigger transitions on next frame
  requestAnimationFrame(() => {
    drawer.classList.add("open");
    backdrop.classList.add("show");
  });

  const close = () => closeSettings();
  drawer.querySelector("#closeSettings").onclick = close;
  backdrop.onclick = close;
  drawer.querySelector("#toggleAudio").onclick = (e) => {
    PhobiaAudio.unlock();
    const next = !PhobiaAudio.isMuted();
    PhobiaAudio.setMuted(next);
    e.currentTarget.classList.toggle("on", !next);
    const ab = document.getElementById("audioBtn");
    if (ab) ab.textContent = next ? "🔇" : "🔊";
  };
  // (Voice-guidance controls removed with spoken narration itself — guidance
  // now renders as on-screen tips; the "Guidance tips" toggle below owns it.)
  drawer.querySelector("#resetAllBtn").onclick = () => {
    if (confirm(t("set.resetConfirm", "Reset this character's progress? Other characters are not affected."))) {
      resetActiveProgress();
      close();
      go("select");
    }
  };
  drawer.querySelector("#eraseAllBtn").onclick = () => {
    if (confirm(t("rec.confirm", "Erase every character, session and setting on this device? This can't be undone."))) {
      eraseAllLocalData();
      location.hash = "#/";
      location.reload();
    }
  };
  drawer.querySelector("#editCharBtn").onclick = () => {
    close();
    go("character", { editing: true });
  };
  drawer.querySelector("#toggleCaptions").onclick = (e) => {
    const next = !(prefGet("fobia.captions") !== "0");
    prefSet("fobia.captions", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
  };
  drawer.querySelector("#toggleHaptics").onclick = (e) => {
    const next = !(prefGet("fobia.haptics") !== "0");
    prefSet("fobia.haptics", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
    // A confirming tick so turning it on is itself felt.
    if (next && navigator.vibrate) { try { navigator.vibrate(14); } catch {} }
  };
  drawer.querySelector("#togglePerfHud").onclick = (e) => {
    const next = !(prefGet("fobia.perfHud") === "1");
    prefSet("fobia.perfHud", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
  };
  drawer.querySelector("#toggleHeart").onclick = (e) => {
    const next = !(prefGet("fobia.heart") !== "0");
    prefSet("fobia.heart", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
  };
  drawer.querySelector("#toggleMotion").onclick = (e) => {
    const next = !(prefGet("fobia.reducedMotion") === "1");
    prefSet("fobia.reducedMotion", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
    try { applyTheme(); } catch {}
  };
  drawer.querySelector("#toggleBigText").onclick = (e) => {
    const next = !(prefGet("fobia.bigText") === "1");
    prefSet("fobia.bigText", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
    try { applyTheme(); } catch {}
  };
  drawer.querySelector("#toggleMusic").onclick = (e) => {
    const next = !(prefGet("fobia.music") === "1");
    prefSet("fobia.music", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
    PhobiaAudio.unlock();
    if (next) {
      if (!ambientPad) ambientPad = PhobiaAudio.startAmbientPad();
    } else {
      if (ambientPad) { ambientPad.stop(); ambientPad = null; }
    }
  };
  const qSel = drawer.querySelector("#qualitySelect");
  if (qSel) qSel.onchange = () => {
    prefSet("fobia.quality", qSel.value); prefSet("fobia.autoTier", null);
    // The setting takes effect on the next scene mount — show a small confirmation
    const note = document.createElement("div");
    note.className = "settings-note";
    note.textContent = t("set.gfxSaved", "Saved — applied next time you open a scene.");
    qSel.parentElement.appendChild(note);
    setTimeout(() => note.remove(), 2200);
  };
  // Pre-scene countdown toggle — off unless asked for ("1" = on).
  drawer.querySelector("#toggleCountdown").onclick = (e) => {
    const next = prefGet("fobia.countdown") !== "1"; // next = countdown ON?
    prefSet("fobia.countdown", next ? "1" : "0");
    e.currentTarget.classList.toggle("on", next);
  };
  // Light/dark mode toggle
  drawer.querySelector("#toggleTheme").onclick = (e) => {
    const next = !(prefGet("fobia.theme") === "light");
    prefSet("fobia.theme", next ? "light" : "dark");
    e.currentTarget.classList.toggle("on", next);
    applyTheme();
  };
  // Daily reminders (Notifications API)
  const remindersBtn = drawer.querySelector("#toggleReminders");
  if (remindersBtn) remindersBtn.onclick = async () => {
    if (!canNotify) return;
    const isOn = prefGet("fobia.reminders") === "1";
    if (isOn) {
      prefSet("fobia.reminders", "0");
      remindersBtn.classList.remove("on");
      return;
    }
    let perm = Notification.permission;
    if (perm !== "granted" && perm !== "denied") {
      try { perm = await Notification.requestPermission(); } catch {}
    }
    if (perm === "granted") {
      prefSet("fobia.reminders", "1");
      remindersBtn.classList.add("on");
      showLocalNotification(t("set.nudgeOn", "Reminders are on. We'll nudge you once a day."));
      scheduleReminders();
    } else {
      // Permission denied — show a tiny inline note
      const note = document.createElement("div");
      note.className = "settings-note";
      note.textContent = t("set.nudgeBlocked", "Browser blocked notifications. Enable in your browser settings.");
      remindersBtn.parentElement.appendChild(note);
      setTimeout(() => note.remove(), 3000);
    }
  };
  // Profile picker shortcut
  drawer.querySelector("#profilesBtn").onclick = () => {
    close();
    go("profiles");
  };
  // Export your data
  drawer.querySelector("#exportBtn").onclick = () => {
    exportData();
    // Remember the backup moment — the camp nudge keys off it.
    try { localStorage.setItem("fobia.lastExportAt", String(Date.now())); } catch {}
  };
  drawer.querySelector("#aboutBtn").onclick = () => { close(); go("about"); };
  drawer.querySelector("#diagCopyBtn").onclick = () => {
    const text = JSON.stringify(readErrLog(), null, 2);
    try { navigator.clipboard.writeText(text); } catch {
      try { prompt(t("set.diagPrompt", "Copy the error journal:"), text); } catch {}
    }
  };
  drawer.querySelector("#diagClearBtn").onclick = () => {
    try { localStorage.removeItem(ERRLOG_KEY); } catch {}
    const c = drawer.querySelector("#diagCount");
    if (c) c.textContent = t("settings.diagNone", "No errors recorded. If something breaks, it lands here.");
    drawer.querySelector("#diagCopyBtn").disabled = true;
    drawer.querySelector("#diagClearBtn").disabled = true;
  };
  drawer.querySelector("#importBtn").onclick = () => importData();
  const customBtn = drawer.querySelector("#customBtn");
  if (customBtn) customBtn.onclick = () => { close(); go("custom"); };
  drawer.querySelector("#fbBtn").onclick = () => { close(); openFeedback("settings"); };
  drawer.querySelector("#replayTourBtn").onclick = (e) => {
    try { localStorage.removeItem("fobia.tutorialSeen"); localStorage.setItem("fobia.tourReplay", "1"); } catch {}
    const note = document.createElement("div");
    note.className = "settings-note";
    note.textContent = t("set.tourSaved", "Saved — you'll see the tour at your next rung.");
    e.currentTarget.parentElement.appendChild(note);
    setTimeout(() => note.remove(), 2200);
  };
  const langSel = drawer.querySelector("#langSelect");
  if (langSel) langSel.onchange = () => {
    if (window.I18n) window.I18n.setLang(langSel.value);
    // Re-render the current view so translated strings appear
    const route = parseRoute(location.hash);
    render(route.view, route.params);
    // ...and the drawer itself, which stayed in the old language (with RTL
    // punctuation on English text) until it was closed and reopened.
    const old = document.querySelector(".settings-drawer");
    if (old) {
      old.remove();
      const bd = document.querySelector(".settings-backdrop"); if (bd) bd.remove();
      openSettings();
      requestAnimationFrame(() => { const sel = document.getElementById("langSelect"); if (sel) sel.focus(); });
    }
  };
}
// The settings switches were bare <div>s with a click handler: no keyboard
// focus, no role, no state for a screen reader. Each becomes a real switch
// named by its row's label; aria-checked follows the "on" class whatever
// code flips it.
function a11ySwitches(root) {
  root.querySelectorAll(".toggle").forEach((sw, i) => {
    sw.setAttribute("role", "switch");
    sw.tabIndex = sw.classList.contains("disabled") ? -1 : 0;
    if (sw.classList.contains("disabled")) sw.setAttribute("aria-disabled", "true");
    const row = sw.closest(".row");
    const lab = row && row.querySelector("label");
    if (lab) { if (!lab.id) lab.id = "swl-" + (sw.id || i); sw.setAttribute("aria-labelledby", lab.id); }
    const sync = () => sw.setAttribute("aria-checked", sw.classList.contains("on") ? "true" : "false");
    sync();
    new MutationObserver(sync).observe(sw, { attributes: true, attributeFilter: ["class"] });
    sw.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); sw.click(); }
    });
    // The switch is a 40×22 target, and tapping its label or description did
    // nothing: the whole row toggles it now. A tap ON the switch is left to
    // the switch (no double toggle), and so is anything else in the row
    // that has its own job (a button, a link).
    if (row && !row._rowToggle) {
      row._rowToggle = true;
      row.classList.add("row-toggle");
      row.addEventListener("click", (e) => {
        if (sw.contains(e.target) || sw.classList.contains("disabled")) return;
        if (e.target.closest && e.target.closest("button, a, input, select, textarea, [role='switch']")) return;
        sw.click();
      });
    }
  });
}
function closeSettings() {
  const drawer = document.querySelector(".settings-drawer");
  const backdrop = document.querySelector(".settings-backdrop");
  if (drawer) {
    drawer.classList.remove("open");
    setTimeout(() => drawer.remove(), 300);
  }
  if (backdrop) {
    backdrop.classList.remove("show");
    setTimeout(() => backdrop.remove(), 300);
  }
}

// ---------- Starting a trial (one door for every button) ----------
// Where "Continue" goes: the next untried trial of the current realm, or of
// the next realm whose lantern isn't lit yet.
function continueTarget() {
  const keys = journeyKeys();
  const walked = (k) => (getProgress(k).highestCompleted ?? -1) + 1 >= PHOBIAS[k].levels.length;
  const nextOf = (k) => Math.min(PHOBIAS[k].levels.length - 1, (getProgress(k).highestCompleted ?? -1) + 1);
  let k = currentRealmKey();
  if (walked(k)) { const nk = keys.find((x) => !walked(x)); if (nk) k = nk; }
  return { key: k, level: nextOf(k), allWalked: keys.length > 0 && keys.every(walked) };
}
// The story no longer stands in front of a trial as a slideshow. The page
// that belongs before it (the chapter's opening, or the one the last trial
// turned) is told on the gate page itself, as a card — the resident's own
// words and the way to read the whole page (Story.gateHTML). Players read
// four-panel overlays twice on the way to their first trial, and skipped them.
function storyGate(phobia, lvl, then) { then(); }
// Every "face this trial" button lands here: story page → predict → scene.
// (The one-minute primer no longer stands in front of trial 2 as well — the
// story carries the why now; the primer stays one tap away on the realm page
// and after trial 1.)
function startTrial(phobia, lvl) {
  if (!isPhobiaKey(phobia)) { go("select"); return; }
  try { PhobiaAudio.ui("whoosh"); } catch {}
  const max = PHOBIAS[phobia].levels.length - 1;
  const level = Math.max(0, Math.min(max, Number.isFinite(lvl) ? lvl : 0));
  // From inside the loop (a trial, its rating or results) the next trial
  // takes this entry's place; from anywhere else it's a new page.
  const inLoop = ["exposure", "rate", "complete"].includes(parseRoute(location.hash).view);
  storyGate(phobia, level, () => (inLoop ? goReplace : go)("exposure", { phobia, level }));
}
function continueJourney() {
  const ch = window.Character && window.Character.loadCharacter();
  if (!ch) { handleAction({ action: "make-traveler" }, {}); return; }
  const tgt = continueTarget();
  if (tgt.allWalked) {
    // Every lantern lit: the epilogue once, then the current realm's trials
    // to pick a booster walk from (home again was a button that did nothing).
    const S = window.Story;
    const toRealm = () => go("ladder", { phobia: tgt.key });
    if (S && S.isUnlocked("epilogue") && !S.isSeen("epilogue")) { S.play("epilogue", { onDone: toRealm }); return; }
    toRealm();
    return;
  }
  startTrial(tgt.key, tgt.level);
}

function handleAction(d, params) {
  switch (d.action) {
    case "begin":           {
      // First-time visitors go through the (3D) traveler creator, the same
      // door the title screen uses; returners go to camp.
      const existing = window.Character && window.Character.loadCharacter();
      if (existing) go("select");
      else handleAction({ action: "make-traveler" }, params);
      break;
    }
    // ---- Arrival flow: room → prologue → traveler → chapter → trial 1 ----
    // One tap from the title screen into the fear they chose: a traveler is
    // made for them (the creator is offered after the first trial) and they
    // land at the gate of that realm's first trial.
    case "quick-start": {
      const k = d.phobia;
      if (!isPhobiaKey(k) || !realmOpen(k)) { go("select"); break; }
      const C = window.Character;
      let ch = C && C.loadCharacter();
      if (!ch && C) {
        // No name: "Traveler" is how they're shown (travelerDisplayName), not
        // what they're called — saved, it came back as their name in the creator.
        ch = Object.assign({}, C.defaultCharacter(), { name: "", primaryPhobia: k, autoMade: true });
        try { C.saveCharacter(ch); } catch {}
        try { activateCharacterState(); } catch {}
      } else if (ch && C && ch.primaryPhobia !== k) {
        // A traveler with no trials yet is still choosing: the fear they tap
        // becomes theirs. One with a history keeps their main fear and this
        // one joins their path (a tap from the self-check swapped it silently).
        const extra = Array.isArray(ch.additionalPhobias) ? ch.additionalPhobias : [];
        ch = (state.log || []).length
          ? Object.assign({}, ch, { additionalPhobias: extra.includes(k) ? extra : extra.concat([k]) })
          : Object.assign({}, ch, { primaryPhobia: k });
        try { C.saveCharacter(ch); } catch {}
      }
      startTrial(k, Math.max(0, Math.min(PHOBIAS[k].levels.length - 1, (getProgress(k).highestCompleted ?? -1) + 1)));
      break;
    }
    case "make-traveler": {
      _travelerDraft = (window.Character && window.Character.loadCharacter())
        || (window.Character && window.Character.defaultCharacter())
        || null;
      const S = window.Story;
      if (S && !S.isSeen("prologue")) S.play("prologue", { onDone: () => go("traveler"), cta: t("st.toCreator", "Become a traveler →") });
      else go("traveler");
      break;
    }
    case "edit-character": {
      _travelerDraft = (window.Character && window.Character.loadCharacter()) || null;
      go("traveler");
      break;
    }
    case "arrival-back": go("welcome"); break;
    case "traveler-dice": {
      const C = window.Character;
      if (!C) break;
      const rolled = C.randomCharacter();
      // Never overwrite a name the player typed themselves.
      const keptName = (_travelerDraft && _travelerDraft.name) || "";
      // A roll restyles the traveler being edited — it keeps that one's id,
      // or saving would add a second character next to it.
      const keep = {};
      if (_travelerDraft && _travelerDraft.id) { keep.id = _travelerDraft.id; keep.createdAt = _travelerDraft.createdAt; }
      _travelerDraft = Object.assign({}, rolled, keep, keptName ? { name: keptName } : {});
      render("traveler", {});
      break;
    }
    case "traveler-save": {
      const C = window.Character;
      if (!C) break;
      const draft = Object.assign({}, C.defaultCharacter(), _travelerDraft || {});
      // The realm they picked in the creator (an open one), else the dogs.
      if (!draft.primaryPhobia || !isPhobiaKey(draft.primaryPhobia) || !realmOpen(draft.primaryPhobia)) draft.primaryPhobia = "dogs";
      // An empty name stays empty: they're shown as "Traveler", never saved as it.
      draft.name = String(draft.name || "").trim();
      delete draft.autoMade;
      try { C.saveCharacter(draft); } catch {}
      try { localStorage.setItem("fobia.travelerMade", "1"); } catch {}
      _travelerDraft = null;
      // A first-timer walks straight to the gate of trial 1. The realm page,
      // primer and Mirror are all still there — after the first dog, when
      // they have something to refer to. (It used to be eight screens from
      // "Step inside" to the first step on the floor.)
      const fk = draft.primaryPhobia;
      const firstRun = (getProgress(fk).highestCompleted ?? -1) < 0 &&
        !(state.log || []).some((l) => l.phobia === fk);
      // The creator's place in history is taken by where it leads (Back
      // never reopens it). A trial that's waiting to be rated comes first —
      // opened from the menu mid-debrief, the creator used to throw it away.
      const owed = lastRungOutcome && isPhobiaKey(lastRungOutcome.phobia) ? lastRungOutcome : null;
      if (owed) goReplace("rate", { phobia: owed.phobia, level: owed.level });
      else if (firstRun) storyGate(fk, 0, () => goReplace("exposure", { phobia: fk, level: 0 }));
      else goReplace("welcome");
      break;
    }
    case "go-dogs": continueJourney(); break;
    case "story-continue": continueJourney(); break;
    case "open-story": go("story"); break;
    case "story-play": {
      const S = window.Story, id = d.beat;
      if (!S || !id) break;
      S.play(id, { onDone: () => {
        // The card that opened it now reads as read; the book re-renders.
        document.querySelectorAll(`.gs-read[data-beat="${id}"]`).forEach((b) => { b.textContent = t("st.reread", "Read again"); });
        document.querySelectorAll(".story-card").forEach((c) => {
          if (c.dataset.beat !== id) return;
          c.classList.add("read");
          const b = c.querySelector(".sc-read");
          if (b) { b.textContent = t("st.reread", "Read again"); b.classList.replace("btn-primary", "btn-ghost"); }
        });
        if (document.getElementById("storyBook")) { const r = parseRoute(location.hash); render(r.view, r.params); }
      } });
      break;
    }
    case "open-settings": try { openSettings(); } catch {} break;
    case "open-menu": try { openMenu(); } catch {} break;
    case "go-home": go("welcome"); break;
    case "ti-begin": if (typeof window.__trialBegin === "function") window.__trialBegin(null); break;
    case "toggle-lang": {
      window.I18n.setLang(window.I18n.currentLanguage() === "fa" ? "en" : "fa");
      const route = parseRoute(location.hash);
      render(route.view, route.params);
      break;
    }

    case "try-demo": go("demo"); break;
    case "demo-end": try { showDemoEnd(); } catch {} break;
    case "open-quiz": go("quiz"); break;
    case "quiz-rate": quizRate(document.querySelector(`.quiz-moment[data-phobia="${d.phobia}"] .quiz-lv-b[data-v="${d.v}"]`)); break;
    case "quiz-pick": {
      const k = d.phobia;
      if (isPhobiaKey(k)) openFearCheckModal(k, getChecks(k).length ? "manual" : "baseline", { quiz: true });
      break;
    }
    case "nudge-dismiss": {
      markNudgeDone(d.id);
      const card = document.querySelector(`.nudge-card[data-nudge="${d.id}"]`);
      if (card) card.remove();
      break;
    }
    case "enter-path": {
      const ch = window.Character && window.Character.loadCharacter();
      if (ch && ch.primaryPhobia) go("ladder", { phobia: ch.primaryPhobia });
      else go("select");
      break;
    }
    case "select-phobia":   if (d.nudgeId) markNudgeDone(d.nudgeId); try { PhobiaAudio.ui("whoosh"); } catch {} go("ladder", { phobia: d.phobia }); break;
    case "start-level": startTrial(d.phobia, parseInt(d.level, 10)); break;
    case "open-primer": openPrimer(d.phobia || "dogs"); break;
    case "open-feedback": openFeedback(d.context || ""); break;
    case "scroll-to": {
      const el = document.querySelector(d.target || "");
      if (el) { try { el.scrollIntoView({ behavior: "smooth", block: "start" }); } catch { el.scrollIntoView(); } }
      break;
    }
    case "open-keep": openKeepPlan(d.phobia || "dogs"); break;
    case "pick-fear": {
      document.querySelectorAll(".expect-chip").forEach((c) => {
        const on = c.dataset.fear === d.fear;
        c.classList.toggle("on", on);
        c.setAttribute("aria-checked", on ? "true" : "false");
      });
      break;
    }
    // (The gate page's "confirm-predict" lived here. The trial's own opening
    // card took over the guess — armTrialIntro in exposure.js.)
    case "to-rate": {
      // The room fades out before the debrief comes in — a cut from a live
      // scene to a form read as the game breaking.
      const st = document.getElementById("stage");
      const lvl = parseInt(d.level, 10);
      // Back pressed during the fade has already left the trial: rating it
      // now would replaceState over wherever Back went — the home entry, so
      // the next Back left the app.
      const from = location.hash;
      const goNow = () => { if (location.hash === from) goReplace("rate", { phobia: d.phobia, level: lvl }); };
      const calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (st && st.isConnected && !calm) {
        if (st.classList.contains("leaving")) break;
        st.classList.add("leaving");
        const panel = st.closest(".exposure-panel");
        if (panel) panel.classList.add("leaving");
        setTimeout(goNow, 240);
      } else goNow();
      break;
    }
    case "submit-rate":     handleRateSubmit(d, params); break;
    case "do-breathe": {
      // Inside a trial, a breath is a pause IN the room, not a way out of it:
      // it used to unmount the scene and route breathe → rate, so "pause"
      // quietly ended the exposure (and the tour promised otherwise).
      const st = document.getElementById("stage");
      if (st && st.isConnected && st.closest(".exposure-panel")) { openStageBreath(st); break; }
      // Anywhere else (the rating, the results' check-in) it's the same
      // guided breath over the page — not a page of its own to come back from.
      openPageBreath();
      break;
    }
    case "after-breathe": {
      const after = window.__breatheAfter; window.__breatheAfter = null;
      if (after === "ladder") go("ladder", { phobia: d.phobia });
      else go("rate", { phobia: d.phobia, level: parseInt(d.level, 10) });
      break;
    }
    case "next-level":      startTrial(d.phobia, parseInt(d.level, 10)); break;   // story page (if one is waiting) → predict → the trial
    case "back-ladder":     go("ladder", { phobia: d.phobia }); break;
    case "open-insights":   go("insights"); break;
    case "open-profiles":   go("profiles"); break;
    case "select-character": {
      window.Character.setActiveCharacter(d.id);
      activateCharacterState();
      applyVoicePreset();
      const c = window.Character.loadCharacter();
      // Take them straight to the ladder of their primary phobia
      if (c && c.primaryPhobia) go("ladder", { phobia: c.primaryPhobia });
      else go("select");
      break;
    }
    // (Was a second "edit-character" case — unreachable behind the first, so
    // a profile card's Edit opened whichever traveler happened to be active.)
    case "edit-character-id": {
      window.Character.setActiveCharacter(d.id);
      activateCharacterState();
      go("character", { editing: true });
      break;
    }
    case "delete-character": {
      const c = window.Character.loadCharacters().find(x => x.id === d.id);
      if (c && confirm(tf("pr.delConfirm", "Delete the character “{name}” and all its progress?", { name: travelerDisplayName(c) }))) {
        // Also remove their state slice
        if (state.byCharacter && Object.prototype.hasOwnProperty.call(state.byCharacter, d.id)) delete state.byCharacter[d.id];
        saveState();
        // …and what the dogs remember of them (trust, last visit), kept per
        // traveler under their id — these stayed behind after the delete.
        try {
          const pre = [`fobia.dogs.trust.${d.id}`, `fobia.dogs.lastSeen.${d.id}`];
          const ks = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && pre.some((p) => k === p || k.startsWith(p + "."))) ks.push(k);
          }
          ks.forEach((k) => localStorage.removeItem(k));
        } catch {}
        window.Character.deleteCharacter(d.id);
        activateCharacterState();
        go("profiles");
      }
      break;
    }
    case "new-character": {
      // The creator opens blank on its own (editing: false). The active
      // traveler stays active until the new one is saved — it used to be
      // switched to a "__new__" sentinel, and leaving the creator without
      // saving sent every later reward to that phantom slot.
      window._prevActiveCharId = null;
      go("character", { editing: false });
      break;
    }
    case "custom-edit":     go("custom", { editing: d.key }); break;
    case "custom-delete": {
      if (confirm(t("cu.delConfirm2", "Delete this custom ladder and the sessions you logged on it?"))) {
        const all = loadCustomPhobias();
        delete all[d.key];
        saveCustomPhobias(all);
        delete PHOBIAS[d.key];
        // Its sessions go with it: left behind, they still counted on
        // Insights, Profiles and the report ("1 session") for a ladder that
        // was nowhere to be found. In place — state.log/progress are the
        // active slice's own arrays.
        try {
          for (const sl of Object.values(state.byCharacter || {})) {
            if (!sl) continue;
            if (sl.progress && Object.prototype.hasOwnProperty.call(sl.progress, d.key)) delete sl.progress[d.key];
            if (Array.isArray(sl.log)) for (let i = sl.log.length - 1; i >= 0; i--) if (sl.log[i] && sl.log[i].phobia === d.key) sl.log.splice(i, 1);
          }
          saveState();
        } catch {}
        go("custom");
      }
      break;
    }
    case "open-select":     go("select"); break;
    case "open-journal":    go("journal"); break;
    case "open-custom":     go("custom"); break;
    case "open-report":     go("report"); break;
    case "report-lang":     reportEnglish = !reportEnglish; render("report", {}); break;
    case "do-worldstep":    openWorldstepModal(d.phobia, parseInt(d.step, 10)); break;
    case "fear-check":      openFearCheckModal(d.phobia, d.at || "manual"); break;
    case "open-about":      go("about"); break;
    case "show-consent":    showConsent(true); break;
    case "backup-now": {
      exportData();
      try { localStorage.setItem("fobia.lastExportAt", String(Date.now())); } catch {}
      go("select");
      break;
    }
    case "backup-later": {
      try { localStorage.setItem("fobia.backupSnooze", String(Date.now())); } catch {}
      go("select");
      break;
    }
    case "edit-goal":       openGoalEditor(d.phobia); break;
    case "reset-progress":  if (confirm("Reset this character's progress? Other characters are not affected.")) { resetActiveProgress(); go("select"); } break;
  }
}

// Max-pooled, so a short spike survives the squeeze (a bark is the point).
function downsampleWave(w, n) {
  if (!Array.isArray(w) || !w.length) return [];
  if (w.length <= n) return w.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * w.length / n), b = Math.max(a + 1, Math.floor((i + 1) * w.length / n));
    let m = 0;
    for (let k = a; k < b; k++) m = Math.max(m, w[k]);
    out.push(m);
  }
  return out;
}
// A guided breath over the live scene: three slow cycles (in 4, out 6 — the
// long exhale is the part that brakes the heart), then back to the room.
// The scene keeps running underneath; the hold keeps counting if you're
// still close. Nothing is faked: the alarm isn't reset, you just breathe.
function openPageBreath() {
  if (document.querySelector(".page-breath")) return;
  const wrap = document.createElement("div");
  wrap.className = "page-breath";
  document.body.appendChild(wrap);
  openStageBreath(wrap, { closeLabel: t("sbreath.done2", "I'm ready — continue"), stay: t("sbreath.readyPage", "Breathe with the circle. There's no hurry."), doneText: t("sbreath.donePage", "That's it. You're here, and you're okay.") });
  const closeIt = () => { const c = wrap.querySelector(".sb-close"); if (c) c.click(); };
  const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); closeIt(); } };
  document.addEventListener("keydown", onKey);
  const mo = new MutationObserver(() => { if (!wrap.querySelector(".stage-breath")) { mo.disconnect(); document.removeEventListener("keydown", onKey); wrap.remove(); } });
  mo.observe(wrap, { childList: true });
  wrap.addEventListener("click", (e) => { if (e.target === wrap) closeIt(); });
  setTimeout(() => { const c = wrap.querySelector(".sb-close"); try { c && c.focus({ preventScroll: true }); } catch {} }, 50);
}
function openStageBreath(stage, opts = {}) {
  if (!stage || stage.querySelector(".stage-breath")) return;
  const box = document.createElement("div");
  box.className = "stage-breath";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", t("sbreath.aria", "Guided breath"));
  box.innerHTML = `
    <div class="sb-ring"><div class="sb-core"></div></div>
    <div class="sb-text">${opts.stay || t("sbreath.ready", "Stay where you are. Breathe with the circle.")}</div>
    <div class="sb-count"></div>
    <button type="button" class="btn-ghost sb-close">${opts.closeLabel || t("sbreath.back", "Back to the room")}</button>`;
  stage.appendChild(box);
  const ring = box.querySelector(".sb-ring"), text = box.querySelector(".sb-text"), count = box.querySelector(".sb-count");
  const phases = [
    { cls: "in", label: t("sbreath.in", "Breathe in…"), s: 4 },
    { cls: "out", label: t("sbreath.out", "…and out, slowly"), s: 6 },
  ];
  let cycle = 0, pi = 0, timers = [];
  // The room's quiz and Mira's lines step aside for the breath (the coach
  // reads this class and holds an open question's clock too).
  stage.classList.add("breathing");
  const close = () => { timers.forEach(clearTimeout); box.classList.add("gone"); stage.classList.remove("breathing"); setTimeout(() => box.remove(), 350); };
  box.querySelector(".sb-close").addEventListener("click", (e) => { e.stopPropagation(); close(); });
  const step = () => {
    if (!box.isConnected) return;
    if (cycle >= 3) {
      text.textContent = opts.doneText || t("sbreath.done", "That's it. The room is still here — and so are you.");
      count.textContent = "";
      ring.className = "sb-ring";
      timers.push(setTimeout(close, 2600));
      return;
    }
    const ph = phases[pi];
    ring.className = "sb-ring " + ph.cls;
    ring.style.setProperty("--sb-s", ph.s + "s");
    text.textContent = ph.label;
    count.textContent = tf("sbreath.of", "{n} of 3", { n: cycle + 1 });
    timers.push(setTimeout(() => { pi = (pi + 1) % 2; if (pi === 0) cycle++; step(); }, ph.s * 1000));
  };
  requestAnimationFrame(() => box.classList.add("show"));
  timers.push(setTimeout(step, 700));
}
// ---------- How dog fear works: the one-minute primer ----------
// A new traveller used to meet the dog before anything had told them what a
// phobia IS — the fear-cycle story lived in a welcome screen the router no
// longer reaches. This is that lesson, made playable: the avoidance trap and
// the way out, as two loops, plus a tiny sim where the player chooses Leave
// or Stay across three encounters and watches what each does to the alarm.
// ---------- Feedback ----------
// The one channel back from players. Nothing is sent automatically: the note
// is composed here and the player copies it (or, once FEEDBACK_URL is set,
// it's copied and the form opens in a new tab to paste it into).
// FEEDBACK_URL: an optional form link (Google Forms and the like are often
// unreachable from Iran, so the default channel is email: SUPPORT_EMAIL in
// boot-guards.js). Set, it adds "Open the form" beside "Email it".
const FEEDBACK_URL = "";
function feedbackDiag() {
  const lines = [
    `build: ${APP_VERSION} (${APP_BUILD})`,
    `route: ${safeRoute() || "#/"}`,
    `lang: ${(window.I18n && window.I18n.currentLanguage()) || "en"} · quality: ${(() => { try { return resolveQuality(); } catch { return "?"; } })()}`,
    `screen: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x · touch: ${(navigator.maxTouchPoints || 0) > 0 ? "yes" : "no"}`,
    `ua: ${navigator.userAgent}`,
  ];
  const errs = readErrLog().slice(-5);
  if (errs.length) {
    lines.push(`recent errors (${errs.length}):`);
    errs.forEach((e) => lines.push(`  - ${new Date(e.ts).toISOString().slice(0, 16)} ${safeRoute(e.route || "")} ${e.msg}${e.src ? " @" + e.src : ""}`));
  }
  return lines.join("\n");
}
function openFeedback(context = "") {
  const overlay = document.createElement("div");
  overlay.className = "goal-modal-overlay";
  overlay.innerHTML = `
    <div class="goal-modal fb-modal" role="dialog" aria-label="${escapeHtml(t("fb.title", "What worked, what didn't?"))}">
      <span class="bridge-invite-kicker">${t("fb.kicker", "💬 Your feedback")}</span>
      <h3 style="margin:6px 0 4px">${t("fb.title", "What worked, what didn't?")}</h3>
      <p class="small">${t("fb.p", "Lanternwalk is new, and what you tell us shapes it. Anything helps — a bug, a moment you got stuck, a moment it helped. Nothing is sent automatically: you copy the note, or send it yourself.")}</p>
      <textarea id="fbText" rows="6" maxlength="4000" placeholder="${escapeHtml(t("fb.ph", "What happened? Where were you?"))}"></textarea>
      <label class="fb-diag"><input type="checkbox" id="fbDiag" checked> <span>${t("fb.diag", "Include technical details (browser, device, recent errors — nothing personal)")}</span></label>
      <p class="small fb-where">${tf("fb.whereMail", "Send it to {mail} — “Email it” opens your mail app with the note already written, or copy it and paste it anywhere.", { mail: `<a href="mailto:${SUPPORT_EMAIL}" dir="ltr" lang="en">${SUPPORT_EMAIL}</a>` })}</p>
      <div class="actions" style="margin-top:12px">
        <button class="btn-ghost" id="fbClose">${t("fb.close", "Close")}</button>
        <button class="btn-ghost" id="fbCopy">${t("fb.copy", "📋 Copy note")}</button>
        ${FEEDBACK_URL ? `<button class="btn-ghost" id="fbSend">${t("fb.send", "Open the form ↗")}</button>` : ""}
        <button class="btn-primary" id="fbMail">${t("fb.mail", "✉️ Email it")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const ta = overlay.querySelector("#fbText");
  const compose = () => {
    const parts = [ta.value.trim() || "(no note)"];
    if (context) parts.push(`context: ${safeRoute(context)}`);
    if (overlay.querySelector("#fbDiag").checked) parts.push("---", feedbackDiag());
    return parts.join("\n");
  };
  const copy = async (btn) => {
    const text = compose();
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    if (!ok) { try { prompt(t("fb.copy", "📋 Copy note"), text); } catch {} }
    if (btn && ok) { const was = btn.textContent; btn.textContent = t("fb.copied", "Copied ✓"); setTimeout(() => { btn.textContent = was; }, 1800); }
    return ok;
  };
  const close = () => overlay.remove();
  overlay.querySelector("#fbClose").onclick = close;
  overlay.querySelector("#fbCopy").onclick = (e) => copy(e.currentTarget);
  // A mailto: link with the note as its body. Mail apps cap a link's length,
  // so a long note is cut (the full one is copied as well, to paste over it).
  overlay.querySelector("#fbMail").onclick = async () => {
    const text = compose();
    const body = text.length > 1800 ? text.slice(0, 1800) + "\n…" : text;
    if (text.length > 1800) await copy(null);
    const subject = `${t("brand.name", "Lanternwalk")} — ${t("fb.subject", "feedback")} (${APP_VERSION})`;
    location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  const send = overlay.querySelector("#fbSend");
  if (send) send.onclick = async () => { await copy(null); try { window.open(FEEDBACK_URL, "_blank", "noopener"); } catch {} };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  setTimeout(() => { try { ta.focus(); } catch {} }, 60);
}

function primerSeen(key) { try { return !!((activeCharSlice().primer || {})[key]); } catch { return false; } }
function markPrimerSeen(key) {
  try { const cs = activeCharSlice(); cs.primer = cs.primer || {}; cs.primer[key] = Date.now(); saveState(); } catch {}
}
