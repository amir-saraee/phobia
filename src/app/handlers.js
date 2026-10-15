// Global UI wiring: the character page, attachHandlers / handleAction, the
// menu and settings drawers, the stage breath, feedback, primer flags.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

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

function attachHandlers(view, params) {
  const home = document.getElementById("home");
  if (home) home.onclick = () => { PhobiaAudio.unlock(); go("select"); };
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
      app: "Mira — exposure practice export",
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
    a.download = `mira-progress-${new Date().toISOString().slice(0, 10)}.json`;
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
      if (!num || reduce || c1 <= c0) { if (num) num.textContent = c1; return; }
      const t0 = performance.now(), dur = 1300;
      const step = (now) => {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        num.textContent = Math.round(c0 + (c1 - c0) * e);
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
  // delegated on click for any [data-action]
  document.querySelectorAll("[data-action]").forEach(el => {
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
  let wantMusic = (() => { try { return localStorage.getItem("fobia.music") === "1"; } catch { return false; } })();
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
          <strong>${escapeHtml(ch.name || t("card.anon", "Anonymous"))}</strong>
          <span class="small">${(() => { const f = (ch.primaryPhobia ? 1 : 0) + (ch.additionalPhobias?.length || 0), s = state.log.length;
            return tf("pr.counts", `{f} fear${f === 1 ? "" : "s"} · {s} session${s === 1 ? "" : "s"}`, { f, s }); })()}</span>
        </div>
      </div>
    ` : ""}
    <ul class="menu-list">
      <li><button data-go="welcome">${t("menu.title", "🌌 Title screen — the story")}</button></li>
      <li><button data-go="select">${t("menu.valley", "🗺 The Valley of Fears")}</button></li>
      ${ch ? `<li><button data-go="ladder" data-phobia="${(() => { try { return currentRealmKey(); } catch { return ch.primaryPhobia || ""; } })()}">${t("menu.trials", "Continue your trials")}</button></li>` : ""}
      <li><button data-go="journal">${t("menu.sparks", "✦ Book of Sparks")}</button></li>
      <li><button data-go="insights">${t("menu.story", "📜 Your story so far")}</button></li>
      <li><button data-go="report">${t("menu.report", "📄 Progress report — print / share")}</button></li>
      ${allRealmsUnlocked() ? `<li><button data-go="custom">${t("menu.forge", "🛠 Forge a custom fear")}</button></li>` : ""}
    </ul>
    <div class="menu-divider"></div>
    <ul class="menu-list">
      <li><button data-go="traveler">${t("menu.editCharacter", "✎ Edit your traveler")}</button></li>
      ${allChars.length > 1 ? `<li><button data-go="profiles">${t("menu.switchCharacter", "⇄ Switch traveler")}</button></li>` : ""}
      <li><button data-go="about">${t("menu.about", "ℹ️ About Mira")}</button></li>
      <li><button id="menuFeedback">${t("fb.menu", "💬 Send feedback")}</button></li>
      <li><button id="menuOpenSettings">${t("menu.settings", "⚙ Settings")}</button></li>
    </ul>
    <div class="menu-divider"></div>
    <p class="menu-footer">${t("menu.footer", "Mira · a practice game, not therapy.")}</p>
  `;
  const backdrop = document.createElement("div");
  backdrop.className = "menu-backdrop";
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
  requestAnimationFrame(() => { drawer.classList.add("open"); backdrop.classList.add("show"); });

  drawer.querySelector("#closeMenu").onclick = closeMenu;
  backdrop.onclick = closeMenu;
  drawer.querySelector("#menuOpenSettings").onclick = () => { closeMenu(); openSettings(); };
  drawer.querySelector("#menuFeedback").onclick = () => { closeMenu(); openFeedback(location.hash); };
  drawer.querySelectorAll("[data-go]").forEach(btn => {
    btn.onclick = () => {
      closeMenu();
      const v = btn.dataset.go;
      const params = {};
      if (btn.dataset.phobia) params.phobia = btn.dataset.phobia;
      if (btn.dataset.edit) params.editing = true;
      if (v === "ladder" && !params.phobia) { go("select"); return; }
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
  // Read persisted preferences
  const captionsOn = (() => { try { return localStorage.getItem("fobia.captions") !== "0"; } catch { return true; } })();
  const reducedMotion = (() => { try { return localStorage.getItem("fobia.reducedMotion") === "1"; } catch { return false; } })();
  const heartOn = (() => { try { return localStorage.getItem("fobia.heart") !== "0"; } catch { return true; } })();
  const hapticsOn = (() => { try { return localStorage.getItem("fobia.haptics") !== "0"; } catch { return true; } })();
  const perfHudOn = (() => { try { return localStorage.getItem("fobia.perfHud") === "1"; } catch { return false; } })();
  const musicOn = (() => { try { return localStorage.getItem("fobia.music") === "1"; } catch { return false; } })();
  const graphics = (() => { try { return localStorage.getItem("fobia.quality") || "auto"; } catch { return "auto"; } })();
  const lightMode = (() => { try { return localStorage.getItem("fobia.theme") === "light"; } catch { return false; } })();
  const remindersOn = (() => { try { return localStorage.getItem("fobia.reminders") === "1"; } catch { return false; } })();
  const countdownOn = (() => { try { return localStorage.getItem("fobia.skipCountdown") !== "1"; } catch { return true; } })();
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
        <label>${t("set.gfx", "Graphics")}</label>
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
        <label>${t("set.lang", "Language")}</label>
        <div class="small">${t("set.langSub", "English or فارسی — the whole game, except the clinician report, which stays in English.")}</div>
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
        <label>${t("settings.about", "About Mira")}</label>
        <div class="small">${t("settings.aboutSub", "What this is, the science, privacy, credits.")}</div>
      </div>
      <button class="btn-ghost" id="aboutBtn" style="padding:6px 12px;font-size:12px;">${t("settings.aboutOpen", "Open")}</button>
    </div>

    <p class="small" style="margin-top:18px">
      ${t("settings.footer", "This is a practice game, not therapy. If a phobia is interfering with your life, a trained clinician can run real exposure work with you safely.")}
    </p>
  `;
  const backdrop = document.createElement("div");
  backdrop.className = "settings-backdrop";
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);
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
  drawer.querySelector("#editCharBtn").onclick = () => {
    close();
    go("character", { editing: true });
  };
  drawer.querySelector("#toggleCaptions").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.captions") !== "0");
    try { localStorage.setItem("fobia.captions", next ? "1" : "0"); } catch {}
    e.currentTarget.classList.toggle("on", next);
  };
  drawer.querySelector("#toggleHaptics").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.haptics") !== "0");
    try { localStorage.setItem("fobia.haptics", next ? "1" : "0"); } catch {}
    e.currentTarget.classList.toggle("on", next);
    // A confirming tick so turning it on is itself felt.
    if (next && navigator.vibrate) { try { navigator.vibrate(14); } catch {} }
  };
  drawer.querySelector("#togglePerfHud").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.perfHud") === "1");
    try { localStorage.setItem("fobia.perfHud", next ? "1" : "0"); } catch {}
    e.currentTarget.classList.toggle("on", next);
  };
  drawer.querySelector("#toggleHeart").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.heart") !== "0");
    try { localStorage.setItem("fobia.heart", next ? "1" : "0"); } catch {}
    e.currentTarget.classList.toggle("on", next);
  };
  drawer.querySelector("#toggleMotion").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.reducedMotion") === "1");
    try { localStorage.setItem("fobia.reducedMotion", next ? "1" : "0"); } catch {}
    e.currentTarget.classList.toggle("on", next);
  };
  drawer.querySelector("#toggleMusic").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.music") === "1");
    try { localStorage.setItem("fobia.music", next ? "1" : "0"); } catch {}
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
    try { localStorage.setItem("fobia.quality", qSel.value); } catch {}
    // The setting takes effect on the next scene mount — show a small confirmation
    const note = document.createElement("div");
    note.className = "settings-note";
    note.textContent = t("set.gfxSaved", "Saved — applied next time you open a scene.");
    qSel.parentElement.appendChild(note);
    setTimeout(() => note.remove(), 2200);
  };
  // Pre-scene countdown toggle (stored inverted: "1" = skip the countdown)
  drawer.querySelector("#toggleCountdown").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.skipCountdown") !== "1"); // next = countdown ON?
    try { localStorage.setItem("fobia.skipCountdown", next ? "0" : "1"); } catch {}
    e.currentTarget.classList.toggle("on", next);
  };
  // Light/dark mode toggle
  drawer.querySelector("#toggleTheme").onclick = (e) => {
    const next = !(localStorage.getItem("fobia.theme") === "light");
    try { localStorage.setItem("fobia.theme", next ? "light" : "dark"); } catch {}
    e.currentTarget.classList.toggle("on", next);
    applyTheme();
  };
  // Daily reminders (Notifications API)
  const remindersBtn = drawer.querySelector("#toggleReminders");
  if (remindersBtn) remindersBtn.onclick = async () => {
    if (!canNotify) return;
    const isOn = localStorage.getItem("fobia.reminders") === "1";
    if (isOn) {
      try { localStorage.setItem("fobia.reminders", "0"); } catch {}
      remindersBtn.classList.remove("on");
      return;
    }
    let perm = Notification.permission;
    if (perm !== "granted" && perm !== "denied") {
      try { perm = await Notification.requestPermission(); } catch {}
    }
    if (perm === "granted") {
      try { localStorage.setItem("fobia.reminders", "1"); } catch {}
      remindersBtn.classList.add("on");
      try {
        new Notification("Mira", {
          body: t("set.nudgeOn", "Reminders are on. We'll nudge you once a day."),
          icon: "icon.svg",
        });
      } catch {}
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
    try { localStorage.removeItem("fobia.tutorialSeen"); } catch {}
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
  };
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

function handleAction(d, params) {
  switch (d.action) {
    case "begin":           {
      // First-time visitors go through the character creator; returners go to select.
      const existing = window.Character && window.Character.loadCharacter();
      go(existing ? "select" : "character", existing ? {} : { editing: false });
      break;
    }
    // ---- Mobile arrival flow: room → traveler → the dog ----
    case "make-traveler": {
      _travelerDraft = (window.Character && window.Character.loadCharacter())
        || (window.Character && window.Character.defaultCharacter())
        || null;
      go("traveler");
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
      _travelerDraft = Object.assign({}, rolled, keptName ? { name: keptName } : {});
      render("traveler", {});
      break;
    }
    case "traveler-save": {
      const C = window.Character;
      if (!C) break;
      const draft = Object.assign({}, C.defaultCharacter(), _travelerDraft || {});
      // The realm they picked in the creator (an open one), else the dogs.
      if (!draft.primaryPhobia || !PHOBIAS[draft.primaryPhobia] || !realmOpen(draft.primaryPhobia)) draft.primaryPhobia = "dogs";
      if (!draft.name) draft.name = "Traveler";
      try { C.saveCharacter(draft); } catch {}
      _travelerDraft = null;
      // A first-timer walks straight to the gate of trial 1. The realm page,
      // primer and Mirror are all still there — after the first dog, when
      // they have something to refer to. (It used to be eight screens from
      // "Step inside" to the first step on the floor.)
      const fk = draft.primaryPhobia;
      const firstRun = (getProgress(fk).highestCompleted ?? -1) < 0 &&
        !(state.log || []).some((l) => l.phobia === fk);
      if (firstRun) go("predict", { phobia: fk, level: 0 });
      else go("ladder", { phobia: fk });
      break;
    }
    case "go-dogs": go("ladder", { phobia: "dogs" }); break;
    case "open-settings": try { openSettings(); } catch {} break;

    case "try-demo": go("demo"); break;
    case "demo-end": try { showDemoEnd(); } catch {} break;
    case "open-quiz": go("quiz"); break;
    case "quiz-pick": {
      const k = d.phobia;
      if (PHOBIAS[k]) openFearCheckModal(k, getChecks(k).length ? "manual" : "baseline", { quiz: true });
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
    case "start-level": {
      try { PhobiaAudio.ui("whoosh"); } catch {}
      const lvl = parseInt(d.level, 10);
      const toPredict = () => go("predict", { phobia: d.phobia, level: lvl });
      // One minute on what the fear IS — but after the first dog, not before
      // it: trial 1's complete screen offers it, and if it was skipped there
      // it opens in front of trial 2. Before any dog it was just more reading.
      if (hasCreatureKit(d.phobia) && !primerSeen(d.phobia) && (getProgress(d.phobia).highestCompleted ?? -1) >= 0) {
        openPrimer(d.phobia, { then: toPredict, skipGoes: true });
      }
      else toPredict();
      break;
    }
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
      const box = document.getElementById("expectBeliefBox");
      if (box) box.hidden = d.fear === "none";
      break;
    }
    case "confirm-predict": {
      const lvl = parseInt(d.level, 10);
      const slider = document.getElementById("predictedSuds");
      const predicted = slider ? parseInt(slider.value, 10) : null;
      pendingPrediction = { phobia: d.phobia, level: lvl, predicted, ts: Date.now() };
      // The feared outcome, when one was named (dogs). The scene reads it to
      // point the player at the test; the complete screen checks it.
      const chip = document.querySelector(".expect-chip.on");
      const bel = document.getElementById("expectBelief");
      pendingExpect = (chip && chip.dataset.fear !== "none")
        // An untouched slider sits at 50 behind a "—" readout; storing that
        // would invent the player's belief. Only a moved slider counts.
        ? { phobia: d.phobia, level: lvl, fear: chip.dataset.fear, belief: (bel && bel.dataset.touched) ? parseInt(bel.value, 10) : null, ts: Date.now() }
        : null;
      window.__pendingExpect = pendingExpect;
      go("exposure", { phobia: d.phobia, level: lvl });
      break;
    }
    case "to-rate":         go("rate", { phobia: d.phobia, level: parseInt(d.level, 10) }); break;
    case "submit-rate":     handleRateSubmit(d, params); break;
    case "do-breathe": {
      // Inside a trial, a breath is a pause IN the room, not a way out of it:
      // it used to unmount the scene and route breathe → rate, so "pause"
      // quietly ended the exposure (and the tour promised otherwise).
      const st = document.getElementById("stage");
      if (st && st.isConnected && st.closest(".exposure-panel")) { openStageBreath(st); break; }
      go("breathe", { phobia: d.phobia, level: parseInt(d.level, 10) });
      break;
    }
    case "after-breathe":   go("rate", { phobia: d.phobia, level: parseInt(d.level, 10) }); break;
    case "next-level":      go("predict", { phobia: d.phobia, level: parseInt(d.level, 10) }); break;   // through predict (was straight to exposure, dropping the core "predict vs actual" step)
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
    case "edit-character": {
      window.Character.setActiveCharacter(d.id);
      activateCharacterState();
      go("character", { editing: true });
      break;
    }
    case "delete-character": {
      const c = window.Character.loadCharacters().find(x => x.id === d.id);
      if (c && confirm(tf("pr.delConfirm", "Delete the character “{name}” and all its progress?", { name: c.name || t("pr.unnamed", "Unnamed") }))) {
        // Also remove their state slice
        if (state.byCharacter) delete state.byCharacter[d.id];
        saveState();
        window.Character.deleteCharacter(d.id);
        activateCharacterState();
        go("profiles");
      }
      break;
    }
    case "new-character": {
      // Remember who was active so a CANCEL can restore them (otherwise the
      // active id stays stuck on the "__new__" sentinel and milestones get
      // written to a phantom character).
      window._prevActiveCharId = (window.Character.activeCharacterId && window.Character.activeCharacterId()) || null;
      // Open the creator with no existing data
      window.Character.setActiveCharacter("__new__"); // sentinel, won't match anything
      go("character", { editing: false });
      break;
    }
    case "custom-edit":     go("custom", { editing: d.key }); break;
    case "custom-delete": {
      if (confirm(t("cu.delConfirm", "Delete this custom ladder?"))) {
        const all = loadCustomPhobias();
        delete all[d.key];
        saveCustomPhobias(all);
        delete PHOBIAS[d.key];
        go("custom");
      }
      break;
    }
    case "open-select":     go("select"); break;
    case "open-journal":    go("journal"); break;
    case "go-camp":         go("select"); break;
    case "open-custom":     go("custom"); break;
    case "open-report":     go("report"); break;
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
// The belief re-rate on the complete screen writes straight into the log
// entry it belongs to.
function saveBeliefAfter(v) {
  const last = state.log[state.log.length - 1];
  if (!last || !last.expect) return;
  last.expect.beliefAfter = Math.max(0, Math.min(100, Math.round(v)));
  saveState();
  const out = document.getElementById("beliefDelta");
  if (out) out.innerHTML = beliefDeltaText(last.expect.belief, last.expect.beliefAfter);
}
function beliefDeltaText(before, after) {
  if (after == null) return "";
  if (before == null) return tf("rc.noted", "Noted: {b}%. Next time, rate it before the trial as well — the change between the two is the lesson.", { b: after });
  const dlt = before - after;
  if (dlt >= 10) return tf("rc.dropped", "From <b>{a}%</b> to <b>{b}%</b>. That drop — in how sure the fear is — is the real progress. More than any timer.", { a: before, b: after });
  if (dlt <= -10) return tf("rc.rose", "Up from {a}% to {b}%. That's honest, and worth knowing. A repeat of this trial is how that number moves.", { a: before, b: after });
  return tf("rc.same", "About the same ({a}% → {b}%). Beliefs this old move in steps — each repeat is one.", { a: before, b: after });
}
// A guided breath over the live scene: three slow cycles (in 4, out 6 — the
// long exhale is the part that brakes the heart), then back to the room.
// The scene keeps running underneath; the hold keeps counting if you're
// still close. Nothing is faked: the alarm isn't reset, you just breathe.
function openStageBreath(stage) {
  if (!stage || stage.querySelector(".stage-breath")) return;
  const box = document.createElement("div");
  box.className = "stage-breath";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", t("sbreath.aria", "Guided breath"));
  box.innerHTML = `
    <div class="sb-ring"><div class="sb-core"></div></div>
    <div class="sb-text">${t("sbreath.ready", "Stay where you are. Breathe with the circle.")}</div>
    <div class="sb-count"></div>
    <button type="button" class="btn-ghost sb-close">${t("sbreath.back", "Back to the room")}</button>`;
  stage.appendChild(box);
  const ring = box.querySelector(".sb-ring"), text = box.querySelector(".sb-text"), count = box.querySelector(".sb-count");
  const phases = [
    { cls: "in", label: t("sbreath.in", "Breathe in…"), s: 4 },
    { cls: "out", label: t("sbreath.out", "…and out, slowly"), s: 6 },
  ];
  let cycle = 0, pi = 0, timers = [];
  const close = () => { timers.forEach(clearTimeout); box.classList.add("gone"); setTimeout(() => box.remove(), 350); };
  box.querySelector(".sb-close").addEventListener("click", (e) => { e.stopPropagation(); close(); });
  const step = () => {
    if (!box.isConnected) return;
    if (cycle >= 3) {
      text.textContent = t("sbreath.done", "That's it. The room is still here — and so are you.");
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
// FEEDBACK_URL: paste a Google Form / Tally link here. Empty = Copy only —
// for the playtest phase, testers send the note to whoever shared Mira.
const FEEDBACK_URL = "";
const APP_BUILD = "2026-09-27 · launch-dogs";
function feedbackDiag() {
  const lines = [
    `build: ${APP_BUILD}`,
    `route: ${location.hash || "#/"}`,
    `lang: ${(window.I18n && window.I18n.currentLanguage()) || "en"} · quality: ${(() => { try { return resolveQuality(); } catch { return "?"; } })()}`,
    `screen: ${window.innerWidth}×${window.innerHeight} @${window.devicePixelRatio || 1}x · touch: ${(navigator.maxTouchPoints || 0) > 0 ? "yes" : "no"}`,
    `ua: ${navigator.userAgent}`,
  ];
  const errs = readErrLog().slice(-5);
  if (errs.length) {
    lines.push(`recent errors (${errs.length}):`);
    errs.forEach((e) => lines.push(`  - ${new Date(e.ts).toISOString().slice(0, 16)} ${e.route || ""} ${e.msg}${e.src ? " @" + e.src : ""}`));
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
      <p class="small">${t("fb.p", "Mira is new, and what you tell us shapes it. Anything helps — a bug, a moment you got stuck, a moment it helped. Nothing is sent automatically: you copy the note, or send it yourself.")}</p>
      <textarea id="fbText" rows="6" maxlength="4000" placeholder="${escapeHtml(t("fb.ph", "What happened? Where were you?"))}"></textarea>
      <label class="fb-diag"><input type="checkbox" id="fbDiag" checked> <span>${t("fb.diag", "Include technical details (browser, device, recent errors — nothing personal)")}</span></label>
      ${FEEDBACK_URL ? "" : `<p class="small fb-where">${t("fb.where", "Copy it and send it to the person who shared Mira with you.")}</p>`}
      <div class="actions" style="margin-top:12px">
        <button class="btn-ghost" id="fbClose">${t("fb.close", "Close")}</button>
        <button class="${FEEDBACK_URL ? "btn-ghost" : "btn-primary"}" id="fbCopy">${t("fb.copy", "📋 Copy note")}</button>
        ${FEEDBACK_URL ? `<button class="btn-primary" id="fbSend">${t("fb.send", "Open the form ↗")}</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const ta = overlay.querySelector("#fbText");
  const compose = () => {
    const parts = [ta.value.trim() || "(no note)"];
    if (context) parts.push(`context: ${context}`);
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
  const send = overlay.querySelector("#fbSend");
  if (send) send.onclick = async () => { await copy(null); try { window.open(FEEDBACK_URL, "_blank", "noopener"); } catch {} };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  setTimeout(() => { try { ta.focus(); } catch {} }, 60);
}

function primerSeen(key) { try { return !!((activeCharSlice().primer || {})[key]); } catch { return false; } }
function markPrimerSeen(key) {
  try { const cs = activeCharSlice(); cs.primer = cs.primer || {}; cs.primer[key] = Date.now(); saveState(); } catch {}
}
