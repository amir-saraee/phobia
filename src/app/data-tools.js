// Theme, reminders, import / export, custom phobias, the progress card and the
// first-trial tutorial tour.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// Apply the saved theme (light or dark) by toggling a body class. CSS uses
// :root vs body.light-mode overrides for the major colour variables.
function applyTheme() {
  let pref = "dark";
  try { pref = localStorage.getItem("fobia.theme") || "dark"; } catch {}
  document.body.classList.toggle("light-mode", pref === "light");
  // Also keep the theme-color meta in sync so installed PWAs match
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", pref === "light" ? "#f0f4f9" : "#0f1724");
}

// Daily reminder scheduler — checks every hour while the app is open. We can't
// schedule across closed-tab time without a push server, but if the user opens
// the app any time after 22h since the last reminder, we'll fire one.
let reminderInterval = null;
function scheduleReminders() {
  if (reminderInterval) clearInterval(reminderInterval);
  // Storage can be blocked outright (cookies off, some in-app browsers):
  // getItem then throws, and at boot that blanked the whole page.
  try { if (localStorage.getItem("fobia.reminders") !== "1") return; } catch { return; }
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const tick = () => {
    let last = 0;
    try { last = parseInt(localStorage.getItem("fobia.lastReminder") || "0", 10) || 0; } catch { return; }
    const now = Date.now();
    if (now - last > 1000 * 60 * 60 * 22) {
      try {
        const ch = window.Character && window.Character.loadCharacter();
        const name = ch?.name ? `, ${ch.name}` : "";
        new Notification("Lanternwalk", {
          body: ch?.name ? tf("remind.bodyName", "A small rung today, {name}? You don't have to climb far.", { name: ch.name }) : t("remind.body", "A small rung today? You don't have to climb far."),
          icon: "icon.svg",
        });
        localStorage.setItem("fobia.lastReminder", String(now));
      } catch {}
    }
  };
  // Run an initial check on app load (foreground reminder for users returning)
  tick();
  reminderInterval = setInterval(tick, 1000 * 60 * 60);   // every hour
}

// Remove every Lanternwalk key on this device (characters, sessions, dog
// trust, settings, diagnostics). Used by the recovery screen and Settings.
function eraseAllLocalData() {
  try {
    const ks = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("fobia.")) ks.push(k); }
    ks.forEach(k => localStorage.removeItem(k));
  } catch {}
}

// Keys export/import carry as their own sections (or never carry: the error
// log is this device's diagnostics, not the player's data).
const EXPORT_SKIP = new Set(["characters.v2", "activeCharacter.v1", "state.v1", "customPhobias.v1", "errlog.v1", "character.v1"]);
function exportedSettings() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith("fobia.")) continue;
      const short = k.slice(6);
      if (!EXPORT_SKIP.has(short)) out[short] = localStorage.getItem(k);
    }
  } catch {}
  return out;
}

// Import a previously-exported JSON file. Restores characters, state and
// settings into localStorage and reloads the app so all caches refresh.
function importData() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== "object" || data.version == null) {
        alert(t("imp.bad", "This doesn't look like a Lanternwalk export. Nothing was changed."));
        return;
      }
      // Check every section's shape BEFORE writing anything: a file that is
      // half right used to be written as-is and blank the app for good.
      const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
      const chars = data.characters == null ? null
        : (Array.isArray(data.characters) ? data.characters.filter(c => isObj(c) && typeof c.id === "string" && c.id) : []);
      if ((data.characters != null && (!chars || !chars.length)) ||
          (data.state != null && !isObj(data.state)) ||
          (data.settings != null && !isObj(data.settings)) ||
          (data.customPhobias != null && !isObj(data.customPhobias))) {
        alert(t("imp.bad", "This doesn't look like a Lanternwalk export. Nothing was changed."));
        return;
      }
      if (!confirm(t("imp.confirm", "Import this file? It will replace every character, session, note and setting on this device."))) return;
      // Restore each section if present
      if (chars) {
        chars.forEach(c => { if (typeof c.name !== "string") c.name = ""; c.name = c.name.slice(0, 24); });
        localStorage.setItem("fobia.characters.v2", JSON.stringify(chars));
      }
      if (typeof data.activeCharacterId === "string" && chars && chars.some(c => c.id === data.activeCharacterId)) {
        localStorage.setItem("fobia.activeCharacter.v1", data.activeCharacterId);
      } else if (chars) {
        localStorage.setItem("fobia.activeCharacter.v1", chars[0].id);
      }
      if (data.state) {
        localStorage.setItem("fobia.state.v1", JSON.stringify(sanitizeState(data.state)));
      }
      if (data.settings) {
        for (const [k, v] of Object.entries(data.settings)) {
          // Settings are flat strings; anything else would be stored as "[object Object]".
          if (v != null && typeof v !== "object" && /^[\w.-]+$/.test(k) && !EXPORT_SKIP.has(k)) localStorage.setItem("fobia." + k, String(v));
        }
      }
      if (data.customPhobias) {
        localStorage.setItem("fobia.customPhobias.v1", JSON.stringify(cleanCustomPhobias(data.customPhobias)));
      }
      alert(t("imp.done", "Imported. Reloading…"));
      location.reload();
    } catch (err) {
      alert(t("imp.err", "Couldn't read that file. Make sure it's a Lanternwalk export.") + "\n\n" + err.message);
    }
  };
  input.click();
}

// ---------- Custom phobia ladders ----------
// Users can build their own phobia + ladder. We store these in localStorage and
// merge them into PHOBIAS at boot. The scene falls back to a calm narrative
// "imagined exposure" — voice + hold timer + ambient pad.
const CUSTOM_PHOBIAS_KEY = "fobia.customPhobias.v1";
function loadCustomPhobias() {
  try { return cleanCustomPhobias(JSON.parse(localStorage.getItem(CUSTOM_PHOBIAS_KEY))); }
  catch { return {}; }
}
// Keep only ladders the app can draw: an object per key with a rungs list.
function cleanCustomPhobias(obj) {
  const out = {};
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return out;
  for (const [k, c] of Object.entries(obj)) {
    if (c && typeof c === "object" && Array.isArray(c.rungs)) {
      c.rungs = c.rungs.filter(r => r && typeof r === "object");
      out[k] = c;
    }
  }
  return out;
}
function saveCustomPhobias(obj) {
  try { localStorage.setItem(CUSTOM_PHOBIAS_KEY, JSON.stringify(obj)); } catch {}
}
function customPhobiaIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linecap="round"><path d="M12 3 L4 7 V13 a8 8 0 0 0 8 8 a8 8 0 0 0 8 -8 V7 Z"/><path d="M9 12 L11 14 L15 10"/></svg>`;
}
function buildCustomPhobiaEntry(custom) {
  return {
    name: custom.clinicalName || "Custom",
    label: custom.label,
    icon: customPhobiaIcon(),
    blurb: custom.blurb || "Your own ladder.",
    levels: custom.rungs.map(r => ({ title: r.title, desc: r.desc })),
    sceneClass: "scene-custom",
    render: renderEnclosed, // 2D fallback if 3D fails
    isCustom: true,
    customId: custom.id,
  };
}
function mergeCustomPhobias() {
  const custom = loadCustomPhobias();
  for (const [key, c] of Object.entries(custom)) {
    PHOBIAS[key] = buildCustomPhobiaEntry(c);
  }
}

function viewCustom(editingKey) {
  const all = loadCustomPhobias();
  const c = editingKey && all[editingKey] ? all[editingKey] : {
    id: "custom-" + Date.now(),
    label: "",
    clinicalName: "",
    blurb: "",
    rungs: [
      { title: "", desc: "" },
      { title: "", desc: "" },
      { title: "", desc: "" },
      { title: "", desc: "" },
      { title: "", desc: "" },
    ],
  };
  const existing = Object.entries(all);
  const list = existing.length ? `
    <h3>${t("cu.listH", "Your custom ladders")}</h3>
    <ul class="custom-list">
      ${existing.map(([k, c]) => `
        <li>
          <strong>${escapeHtml(c.label || t("cu.untitled", "Untitled"))}</strong>
          <span class="small">${tf("cu.rungs", "{n} rungs", { n: (c.rungs || []).length })}</span>
          <button class="btn-ghost" data-action="custom-edit" data-key="${k}" style="padding:4px 10px;font-size:12px;">${t("set.edit", "Edit")}</button>
          <button class="btn-warn" data-action="custom-delete" data-key="${k}" style="padding:4px 10px;font-size:12px;">${t("pr.delete", "Delete")}</button>
        </li>
      `).join("")}
    </ul>
  ` : "";

  return `
    <div class="panel">
      <h2>${t("cu.h", "Build your own ladder")}</h2>
      <p>${t("cu.p", "Define a phobia we don't cover, or break one down differently. Five rungs, easiest first. The scene uses calm narration + breathing — no 3D required.")}</p>

      <div class="custom-form">
        <label>${t("cu.name", "Phobia name")} <span class="small">${t("cu.nameSub", "(what you call it)")}</span>
          <input id="custLabel" type="text" maxlength="40" value="${escapeHtml(c.label)}" placeholder="${t("cu.namePh", "e.g. Driving alone at night")}"/>
        </label>
        <label>${t("cu.clin", "Clinical name")} <span class="small">${t("cu.clinSub", "(optional, e.g. Vehophobia)")}</span>
          <input id="custClinical" type="text" maxlength="40" value="${escapeHtml(c.clinicalName)}" placeholder="${t("cu.optional", "optional")}"/>
        </label>
        <label>${t("cu.blurb", "One-line description")}
          <input id="custBlurb" type="text" maxlength="120" value="${escapeHtml(c.blurb)}" placeholder="${t("cu.blurbPh", "Fear of …")}"/>
        </label>
        <div class="rung-editors">
          ${c.rungs.map((r, i) => `
            <div class="rung-editor">
              <span class="rung-num">${i+1}</span>
              <input type="text" maxlength="40" data-rung="${i}" data-field="title" value="${escapeHtml(r.title)}" placeholder="${tf("cu.rungPh", "Rung {n} title (easier first)", { n: i + 1 })}"/>
              <input type="text" maxlength="120" data-rung="${i}" data-field="desc"  value="${escapeHtml(r.desc)}"  placeholder="${t("cu.blurb", "One-line description")}"/>
            </div>
          `).join("")}
        </div>
        <div class="actions">
          <button class="btn-primary" id="custSaveBtn">${t("cu.save", "Save ladder")}</button>
          <button class="btn-ghost" data-action="open-select">${t("creator.cancel", "Cancel")}</button>
        </div>
      </div>

      ${list}
    </div>
  `;
}

function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function attachCustomHandlers(editingKey) {
  const saveBtn = document.getElementById("custSaveBtn");
  if (saveBtn) saveBtn.onclick = () => {
    const label = document.getElementById("custLabel")?.value.trim();
    const clinicalName = document.getElementById("custClinical")?.value.trim();
    const blurb = document.getElementById("custBlurb")?.value.trim();
    const rungs = [...document.querySelectorAll(".rung-editor")].map(el => ({
      title: el.querySelector('[data-field="title"]').value.trim(),
      desc:  el.querySelector('[data-field="desc"]').value.trim(),
    }));
    if (!label || rungs.some(r => !r.title)) {
      alert(t("cu.need", "Please give your ladder a name and a title for each rung."));
      return;
    }
    const all = loadCustomPhobias();
    const id = editingKey || ("custom-" + Date.now());
    all[id] = { id, label, clinicalName, blurb, rungs };
    saveCustomPhobias(all);
    mergeCustomPhobias();
    go("ladder", { phobia: id });
  };
}

// ---------- Shareable progress card ----------
// Renders the user's progress as a 1080×1080 PNG via Canvas. Uses Web Share
// API when available (mobile), falls back to download.
function generateProgressCard() {
  const W = 1080, H = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  // Background gradient (matches the app's brand)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1f2a44");
  bg.addColorStop(1, "#0f1724");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // Subtle background spotlight
  const spot = ctx.createRadialGradient(W * 0.85, H * 0.05, 50, W * 0.85, H * 0.05, W * 0.6);
  spot.addColorStop(0, "rgba(124,209,197,.15)");
  spot.addColorStop(1, "rgba(124,209,197,0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);

  // Persian mirrors the text columns to the right edge (the mini charts keep
  // time running left to right). X() maps a left-edge x to its mirror.
  const RTL = !!(window.I18n && window.I18n.isRTL());
  const X = (x) => (RTL ? W - x : x);
  ctx.direction = RTL ? "rtl" : "ltr";
  ctx.textAlign = RTL ? "right" : "left";
  const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, 'Noto Sans Arabic', sans-serif";

  // Brand
  ctx.fillStyle = "#7cd1c5";
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(t("card.brand", "● LANTERNWALK"), X(80), 90);
  ctx.fillStyle = "#94a3b8";
  ctx.font = `20px ${FONT}`;
  ctx.fillText(t("card.tag", "Lanternwalk · small steps, brave paths"), X(80), 122);

  // Character name + avatar (rendered through SVG → image)
  const ch = window.Character && window.Character.loadCharacter();
  const name = ch?.name || t("card.anon", "Anonymous");
  ctx.fillStyle = "#fff";
  ctx.font = `700 64px ${FONT}`;
  ctx.fillText(name, X(80), 220);

  // Stats
  const totalSessions = state.log.length;
  const completedRungs = Object.values(state.progress || {}).reduce((s, p) => s + (p.highestCompleted + 1), 0);
  // The shareable card is the one artefact that leaves the app, so it should
  // not claim a realm is complete on rehearsals alone.
  const ladders = Object.keys(PHOBIAS).filter((k) => realmStatus(k).walked).length;
  const predicted = state.log.filter(l => l.predicted != null);
  const avgGap = predicted.length
    ? predicted.reduce((s, l) => s + (l.predicted - feltFor(l)), 0) / predicted.length
    : null;
  const streak = computeStreak();

  function drawStat(x, y, val, label) {
    ctx.fillStyle = "#7cd1c5";
    ctx.font = `700 96px ${FONT}`;
    ctx.fillText(val, X(x), y);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(label, X(x), y + 36);
  }
  drawStat( 80, 380, String(totalSessions),  t("card.sessions", "TOTAL SESSIONS"));
  drawStat(380, 380, String(completedRungs), t("card.rungs", "RUNGS CLIMBED"));
  drawStat(680, 380, streak >= 1 ? `🔥 ${streak}` : "—", t("card.streak", "DAY STREAK"));
  drawStat( 80, 540, ladders > 0 ? String(ladders) : "—", t("card.valleys", "VALLEYS WALKED"));
  drawStat(380, 540, avgGap == null ? "—" : (avgGap >= 0 ? "+" : "") + avgGap.toFixed(1), t("card.over", "AVG OVER-PREDICTION"));

  // Per-phobia mini chart
  const myPhobias = ch
    ? [ch.primaryPhobia, ...(ch.additionalPhobias || [])].filter(Boolean)
    : Object.keys(state.progress || {});
  const lineY = 700;
  ctx.strokeStyle = "#243049";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(80, lineY); ctx.lineTo(W - 80, lineY); ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = `600 28px ${FONT}`;
  ctx.fillText(t("card.motion", "Your fears in motion"), X(80), 760);

  let row = 0;
  for (const key of myPhobias.slice(0, 4)) {
    const p = PHOBIAS[key]; if (!p) continue;
    const sessions = state.log.filter(l => l.phobia === key);
    if (sessions.length === 0) continue;
    const baseY = 800 + row * 60;
    // Phobia label
    ctx.fillStyle = "#cbd5e1";
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText(phLabel(key), X(80), baseY);
    // Mini SUDS line for this phobia (on the side away from the label)
    const chartX = RTL ? 80 : 380, chartW = W - 80 - 380, chartH = 30;
    ctx.strokeStyle = "rgba(124,209,197,.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    sessions.forEach((s, i) => {
      const x = chartX + (sessions.length === 1 ? chartW / 2 : (i / (sessions.length - 1)) * chartW);
      const y = baseY - (s.suds / 10) * chartH;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // Average SUDS pill
    const avg = (sessions.reduce((s, l) => s + l.suds, 0) / sessions.length).toFixed(1);
    ctx.fillStyle = "#94a3b8";
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText(tf("card.avg", "avg {n}", { n: avg }), X(80), baseY + 24);
    row++;
  }

  // Footer
  ctx.fillStyle = "#5a6478";
  ctx.font = `500 20px ${FONT}`;
  ctx.fillText(t("card.footer", "Lanternwalk · a practice game, not therapy"), X(80), H - 60);

  // Output
  canvas.toBlob((blob) => {
    if (!blob) return;
    const file = new File([blob], "lanternwalk-progress.png", { type: "image/png" });
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({
        files: [file],
        title: t("card.shareTitle", "My Lanternwalk progress"),
        text: tf("card.shareText", "{s} sessions, {r} rungs climbed.", { s: totalSessions, r: completedRungs }),
      }).catch(() => {/* user cancelled */});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lanternwalk-progress.png";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }, "image/png");
}

// Export all data as a JSON file the user can save / re-import later
function exportData() {
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    characters: window.Character ? window.Character.loadCharacters() : [],
    activeCharacterId: window.Character ? window.Character.activeCharacterId() : null,
    state: state,
    customPhobias: loadCustomPhobias(),
    // Every other fobia.* key: settings, language, dog trust and names,
    // achievements — so a backup brings back the whole game, not just the log.
    settings: exportedSettings(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `lanternwalk-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- First-run tutorial tour ----------
// Steps the new user through: 1) the scene controls, 2) the command bar,
// 3) the hold timer, 4) the continue button. Each step shows a card with an
// arrow pointing at the relevant UI element.
function runTutorialTour(stage, phobiaKey) {
  // Strip any orphan tour overlays from previous mounts. The tour is appended
  // to document.body, so if the user navigates between scenes before finishing
  // the tour, the old overlay sticks around and a fresh one gets stacked on
  // top — which used to render as duplicate "1 OF 4" cards on screen.
  document.querySelectorAll(".tour-overlay").forEach(el => el.remove());
  // Mark the tour as seen on first show, not on dismiss. This means if the
  // user re-enters a scene without finishing, they don't see it again — the
  // tour is a one-time orientation, not a per-scene popup.
  try { localStorage.setItem("fobia.tutorialSeen", "1"); } catch {}
  // isCoarsePointer() is this (classic) script's helper. IS_COARSE_POINTER is a
  // const inside the 3D module's scope and is NOT visible here — referencing it
  // threw on every first run and killed the tour before it rendered.
  const isTouch = isCoarsePointer() || ("ontouchstart" in window);
  // What the user actually DOES in this specific scene — keyed off the phobia
  // so the orientation never teaches the wrong mental model (the old tour told
  // dog users to "grip the rail / splash the water"). Character-driven scenes
  // are walk-up-and-interact; the button bar is a secondary affordance on
  // desktop and the PRIMARY one on touch, so the copy differs per input.
  const interactCopy = isTouch ? {
    dogs: t("tour.i.dogs.m", "Walk up with the joystick, then tap the dog to pet it. The buttons below the scene throw a ball, share a treat, or call it over."),
    heights: t("tour.i.heights.m", "Walk to the edge with the joystick and look down when you're ready. Tap things in the world to interact."),
    spiders: t("tour.i.spiders.m", "Walk a little closer at your own pace. Tap the spider to lower a glass jar over it."),
    snakes: t("tour.i.snakes.m", "Walk toward the snake slowly. The buttons below help you hold still or extend a hand."),
    water: t("tour.i.water", "Wade in step by step. Look down and splash when you feel ready."),
    dark: t("tour.i.dark.m", "Walk into the dark with the joystick. The buttons below hold a flashlight or strike a match — the coach will count what they do."),
    enclosed: t("tour.i.enclosed.m", "Walk in with the joystick, then use the buttons below to close the door, ride the lift, or slide into the scanner. The door always opens."),
  } : {
    dogs: t("tour.i.dogs.d", "Walk up to the dog, then click it to pet. Click the floor to throw a ball (shift-click for a treat) — the “Show controls” pill reveals buttons too."),
    heights: t("tour.i.heights.d", "Walk to the edge and look down when you're ready. Click things in the world to interact."),
    spiders: t("tour.i.spiders.d", "Walk a little closer at your own pace. Click the spider to lower a glass jar over it."),
    snakes: t("tour.i.snakes.d", "Walk toward the snake slowly. Hold still and it stays calm."),
    water: t("tour.i.water", "Wade in step by step. Look down and splash when you feel ready."),
    dark: t("tour.i.dark.d", "Walk into the dark at your pace. Hold F for a flashlight — the coach will count what it does."),
    enclosed: t("tour.i.enclosed.d", "Walk in, then click the door (or press E) to close it. In the lift, E rides; in the scanner, E slides you in or out. The door always opens."),
  };
  const sceneAction = interactCopy[phobiaKey]
    || (isTouch
      ? t("tour.i.any.m", "Use the buttons under the scene to interact, and stay as long as you can.")
      : t("tour.i.any.d", "Use the action buttons under the scene to interact, and stay as long as you can."));
  const steps = [
    {
      target: () => stage.querySelector("canvas") || stage,
      title: t("tour.g1t", "This is the scene"),
      text: isTouch
        ? t("tour.g1m", "Swipe to look around. Use the joystick to walk.")
        : t("tour.g1d", "Drag with your mouse to look around. WASD or arrows to walk."),
      arrow: "down",
    },
    {
      // Point at the command bar only if it's actually expanded/visible;
      // character-driven scenes keep it collapsed (0 px), so fall back to the
      // scene canvas and describe the real interaction instead of spotlighting
      // empty space.
      target: () => {
        const bar = document.querySelector(".scene-cmd-bar");
        if (bar && !bar.classList.contains("collapsed") && bar.getBoundingClientRect().height > 24) return bar;
        return stage.querySelector("canvas") || stage;
      },
      title: t("tour.g2t", "How to interact"),
      text: sceneAction,
      arrow: "down",
    },
    {
      target: () => document.querySelector(".hold-bar") || document.getElementById("continueBtn"),
      title: t("tour.g3t", "Stay with it"),
      text: t("tour.g3", "The hold timer asks you to remain in the scene long enough for the anxiety to fall. You can continue any time."),
      arrow: "down",
    },
    {
      target: () => document.querySelector('.btn-warn[data-action="do-breathe"]'),
      title: t("tour.g4t", "Pause any time"),
      text: t("tour.g4", "Nothing locks. If anything is too much, take a guided breath instead."),
      arrow: "down",
    },
  ];
  // The creature and place realms teach their own loop — the coach panel says
  // what to do as it becomes relevant — so the orientation is ONE card, and
  // it doesn't stop the game: no dimmed screen, input goes straight through,
  // and the first step you take puts it away. (It was two modal cards on a
  // timer, after a countdown, between the player and the first dog.)
  // Decided by the realm, not by whether the coach panel exists yet: on a
  // cold entry the scene (and its panel) mounts after this runs.
  let soft = false;
  if (hasCreatureKit(phobiaKey)) {
    const isPlace = isPlaceKit(phobiaKey);
    soft = true;
    steps.length = 0;
    steps.push({
      target: () => stage.querySelector(".dog-coach .dc-wave") || stage.querySelector(".dog-coach") || stage.querySelector("canvas") || stage,
      title: t("tour.one.t", "Your alarm"),
      text: isPlace
        ? (isTouch
          ? t("tour.one.pm", "Walk in with the joystick, only as far as you choose. This line is your alarm: it climbs as you go in, and falls on its own if you stay. 🛟 grounds you — leaving is never a failure.")
          : t("tour.one.pd", "Walk in with WASD or the arrows (Shift to creep), only as far as you choose. This line is your alarm: it climbs as you go in, and falls on its own if you stay. Esc grounds you — leaving is never a failure."))
        : (isTouch
          ? t("tour.one.cm", "Walk in with the joystick, only as close as you choose. This line is your alarm: it climbs as you get close, and falls on its own if you stay. 🛟 grounds you — leaving is never a failure.")
          : t("tour.one.cd", "Walk in with WASD or the arrows (Shift to creep), only as close as you choose. This line is your alarm: it climbs as you get close, and falls on its own if you stay. Esc grounds you — leaving is never a failure.")),
      arrow: "up",
    });
  }
  let i = 0;
  const overlay = document.createElement("div");
  overlay.className = "tour-overlay" + (soft ? " soft" : "");
  document.body.appendChild(overlay);
  // A soft card leaves with the first step: a movement key, or a touch on
  // the joystick.
  const MOVE_KEYS = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
  const onMoveKey = (e) => { if (MOVE_KEYS.includes(e.code)) done(); };
  const onStick = (e) => { if (e.target && e.target.closest && e.target.closest(".joystick")) done(); };
  if (soft) {
    window.addEventListener("keydown", onMoveKey);
    window.addEventListener("pointerdown", onStick, true);
  }
  function show(stepIdx) {
    overlay.innerHTML = "";
    const step = steps[stepIdx];
    const target = step.target();
    const r = target ? target.getBoundingClientRect() : null;
    // Skip steps whose target is missing OR collapsed to ~zero size (e.g. the
    // command bar in character-driven scenes) — never spotlight empty space.
    if (!target || !r || r.width < 4 || r.height < 4) {
      if (stepIdx + 1 < steps.length) return show(stepIdx + 1);
      return done();
    }
    // Spotlight ring around target
    const spot = document.createElement("div");
    spot.className = "tour-spot";
    Object.assign(spot.style, {
      left: (r.left - 6) + "px",
      top:  (r.top - 6)  + "px",
      width:  (r.width + 12) + "px",
      height: (r.height + 12) + "px",
    });
    overlay.appendChild(spot);
    // Card with arrow
    const card = document.createElement("div");
    card.className = "tour-card tour-arrow-" + step.arrow;
    const remaining = steps.length - stepIdx - 1;
    card.innerHTML = `
      ${steps.length > 1 ? `<div class="tour-step">${tf("tour.of", "{a} of {b}", { a: stepIdx + 1, b: steps.length })}</div>` : ""}
      <h3>${step.title}</h3>
      <p>${step.text}</p>
      <div class="tour-actions">
        ${steps.length > 1 ? `<button class="btn-ghost" id="tourSkip">${t("tour.skip", "Skip")}</button>` : ""}
        <button class="btn-primary" id="tourNext">${stepIdx === steps.length - 1 ? t("tour.gotIt", "Got it") : t("tour.next", "Next")}</button>
      </div>
    `;
    // Position the card just below or above the target
    const cardW = 280;
    const margin = 20;
    let left = Math.max(margin, Math.min(window.innerWidth - cardW - margin, r.left + r.width / 2 - cardW / 2));
    let top = r.bottom + 16;
    if (top + 240 > window.innerHeight) {
      top = Math.max(margin, r.top - 240 - 16);
      card.classList.remove("tour-arrow-down");
      card.classList.add("tour-arrow-up");
    }
    Object.assign(card.style, { left: left + "px", top: top + "px" });
    overlay.appendChild(card);
    // The tour shows on a 3 s delay — if the user already navigated away the
    // overlay (and its buttons) may be gone. Bail instead of throwing.
    const skipBtn = document.getElementById("tourSkip");
    const nextBtn = document.getElementById("tourNext");
    if (!nextBtn) { done(); return; }
    if (skipBtn) skipBtn.onclick = done;
    nextBtn.onclick = () => {
      if (stepIdx + 1 < steps.length) show(stepIdx + 1); else done();
    };
  }
  function done() {
    window.removeEventListener("keydown", onMoveKey);
    window.removeEventListener("pointerdown", onStick, true);
    try { localStorage.setItem("fobia.tutorialSeen", "1"); } catch {}
    overlay.classList.add("dismiss");
    setTimeout(() => overlay.remove(), 350);
  }
  // A beat for the room to fade in (and the countdown, for players who turned
  // it on) before the card points at anything.
  const cdOn = !!document.querySelector(".countdown");
  const t0 = Date.now();
  const ready = () => {
    if (!overlay.isConnected || overlay.classList.contains("dismiss")) return;
    // A soft card waits (up to ~8 s) for the coach panel it points at.
    if (soft && !stage.querySelector(".dog-coach") && Date.now() - t0 < 8000) { setTimeout(ready, 300); return; }
    show(i);
  };
  setTimeout(ready, cdOn ? 3000 : 1400);
}
