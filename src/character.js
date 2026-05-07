"use strict";

// ---------- Character profile ----------
// A small persistent profile for the user — name + avatar attributes + which
// phobias they want to work on. Lives in localStorage. Avatar is rendered as
// inline SVG so it scales without any external assets.

const SKIN_TONES = [
  { id: "porcelain", label: "Porcelain", hex: "#f5d8c2" },
  { id: "fair",      label: "Fair",      hex: "#e8b794" },
  { id: "olive",     label: "Olive",     hex: "#c79270" },
  { id: "tan",       label: "Tan",       hex: "#a06b3e" },
  { id: "brown",     label: "Brown",     hex: "#7a4823" },
  { id: "deep",      label: "Deep",      hex: "#4d2b14" },
];

const HAIR_COLORS = [
  { id: "black",   label: "Black",   hex: "#1a1410" },
  { id: "brown",   label: "Brown",   hex: "#4a2c18" },
  { id: "blond",   label: "Blond",   hex: "#d8b870" },
  { id: "auburn",  label: "Auburn",  hex: "#7a3018" },
  { id: "grey",    label: "Grey",    hex: "#9a9a9a" },
  { id: "rose",    label: "Rose",    hex: "#d05a8a" },
];

const HAIR_STYLES = [
  { id: "short", label: "Short" },
  { id: "long",  label: "Long" },
  { id: "buzz",  label: "Buzz" },
  { id: "pony",  label: "Pony" },
  { id: "curly", label: "Curly" },
  { id: "bald",  label: "Bald" },
];

const TOP_COLORS = [
  { id: "teal",    label: "Teal",    hex: "#2c9d96" },
  { id: "navy",    label: "Navy",    hex: "#1f3563" },
  { id: "rose",    label: "Rose",    hex: "#c75477" },
  { id: "amber",   label: "Amber",   hex: "#c8862a" },
  { id: "forest",  label: "Forest",  hex: "#2d5d3a" },
  { id: "plum",    label: "Plum",    hex: "#6f3e74" },
  { id: "char",    label: "Charcoal",hex: "#34384a" },
];

const EYE_COLORS = [
  { id: "brown",   label: "Brown",   hex: "#3a2410" },
  { id: "hazel",   label: "Hazel",   hex: "#7a4f1e" },
  { id: "green",   label: "Green",   hex: "#2c5e3a" },
  { id: "blue",    label: "Blue",    hex: "#1f4a7a" },
  { id: "grey",    label: "Grey",    hex: "#4a5560" },
];

const GLASSES = [
  { id: "none",    label: "None" },
  { id: "round",   label: "Round" },
  { id: "square",  label: "Square" },
];

const FACIAL_HAIR = [
  { id: "none",    label: "Clean" },
  { id: "stubble", label: "Stubble" },
  { id: "beard",   label: "Beard" },
  { id: "moustache",label:"Moustache" },
];

function defaultCharacter() {
  return {
    name: "",
    skinTone: "fair",
    hairColor: "brown",
    hairStyle: "short",
    topColor: "teal",
    eyeColor: "brown",
    glasses: "none",
    facialHair: "none",
    voicePreset: "calm",
    primaryPhobia: null,
    additionalPhobias: [],
    createdAt: Date.now(),
  };
}

// Generate a random character (used by the "Surprise me" button in the creator)
function randomCharacter() {
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)].id;
  const presets = ["calm", "encouraging", "brief"];
  return {
    name: "",
    skinTone:   pick(SKIN_TONES),
    hairColor:  pick(HAIR_COLORS),
    hairStyle:  pick(HAIR_STYLES),
    topColor:   pick(TOP_COLORS),
    eyeColor:   pick(EYE_COLORS),
    glasses:    pick(GLASSES),
    facialHair: pick(FACIAL_HAIR),
    voicePreset: presets[Math.floor(Math.random() * presets.length)],
    primaryPhobia: null,
    additionalPhobias: [],
    createdAt: Date.now(),
  };
}

// Storage keys
//   v1: single-character (legacy) — auto-migrated on first read
//   v2: list of characters + an "active" pointer
const CHAR_KEY    = "fobia.character.v1";
const CHARS_KEY   = "fobia.characters.v2";
const ACTIVE_KEY  = "fobia.activeCharacter.v1";

function newCharacterId() { return "c-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7); }

function loadCharacters() {
  // Returns the list, migrating from legacy single-character storage if needed.
  try {
    const arr = JSON.parse(localStorage.getItem(CHARS_KEY));
    if (Array.isArray(arr)) return arr;
  } catch {}
  // Migrate the old single-character format into a 1-element list
  try {
    const old = JSON.parse(localStorage.getItem(CHAR_KEY));
    if (old && typeof old === "object") {
      if (!old.id) old.id = newCharacterId();
      try { localStorage.setItem(CHARS_KEY, JSON.stringify([old])); } catch {}
      try { localStorage.setItem(ACTIVE_KEY, old.id); } catch {}
      return [old];
    }
  } catch {}
  return [];
}
function activeCharacterId() {
  try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
}
function loadCharacter() {
  // Active character (if any). Prefer the saved active id; fall back to the first.
  const all = loadCharacters();
  if (all.length === 0) return null;
  const id = activeCharacterId();
  return all.find(c => c.id === id) || all[0];
}
function saveCharacter(c) {
  if (!c.id) c.id = newCharacterId();
  const all = loadCharacters();
  const idx = all.findIndex(x => x.id === c.id);
  if (idx >= 0) all[idx] = c;
  else all.push(c);
  try { localStorage.setItem(CHARS_KEY, JSON.stringify(all)); } catch {}
  try { localStorage.setItem(ACTIVE_KEY, c.id); } catch {}
  // Notify the host so it can refresh derived state (per-character log, etc.)
  try { window.dispatchEvent(new CustomEvent("character-changed", { detail: { id: c.id } })); } catch {}
}
function setActiveCharacter(id) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
  try { window.dispatchEvent(new CustomEvent("character-changed", { detail: { id } })); } catch {}
}
function deleteCharacter(id) {
  const all = loadCharacters().filter(c => c.id !== id);
  try { localStorage.setItem(CHARS_KEY, JSON.stringify(all)); } catch {}
  if (all.length > 0) {
    try { localStorage.setItem(ACTIVE_KEY, all[0].id); } catch {}
  } else {
    try { localStorage.removeItem(ACTIVE_KEY); } catch {}
  }
  try { window.dispatchEvent(new CustomEvent("character-changed")); } catch {}
}
function clearCharacter() {
  try { localStorage.removeItem(CHAR_KEY); } catch {}
  try { localStorage.removeItem(CHARS_KEY); } catch {}
  try { localStorage.removeItem(ACTIVE_KEY); } catch {}
}

function getById(arr, id) { return arr.find(x => x.id === id); }
function skinHex(c)  { return getById(SKIN_TONES, c.skinTone)?.hex   || SKIN_TONES[1].hex; }
function hairHex(c)  { return getById(HAIR_COLORS, c.hairColor)?.hex || HAIR_COLORS[1].hex; }
function topHex(c)   { return getById(TOP_COLORS, c.topColor)?.hex   || TOP_COLORS[0].hex; }
function eyeHex(c)   { return getById(EYE_COLORS, c.eyeColor)?.hex   || EYE_COLORS[0].hex; }

// Convert a hex like "#e8b794" into a Three.js-friendly numeric color (0xRRGGBB)
function hexToInt(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

// Render an SVG avatar for the given character.
// `size` is the rendered width in pixels (height is auto).
function avatarSVG(c, size = 80) {
  if (!c) c = defaultCharacter();
  const skin = skinHex(c);
  const hair = hairHex(c);
  const top  = topHex(c);
  const skinShadow = shadeColor(skin, -0.18);
  const topShadow  = shadeColor(top,  -0.22);

  // Hair on top of the head — different paths per style
  let hairLayer = "";
  switch (c.hairStyle) {
    case "short":
      hairLayer = `
        <path d="M28 36 Q30 18 50 16 Q72 18 72 36 L72 44 Q66 38 60 38 L40 38 Q34 38 28 44 Z" fill="${hair}"/>
        <path d="M30 38 Q40 30 50 30 Q60 30 70 38 L70 42 L62 36 L50 34 L38 36 L30 42 Z" fill="${shadeColor(hair, 0.12)}" opacity=".8"/>`;
      break;
    case "long":
      hairLayer = `
        <path d="M22 38 Q22 18 50 14 Q78 18 78 38 L78 88 Q72 84 70 80 L70 50 L30 50 L30 80 Q28 84 22 88 Z" fill="${hair}"/>`;
      break;
    case "buzz":
      hairLayer = `<path d="M30 36 Q34 22 50 20 Q66 22 70 36 L68 40 L32 40 Z" fill="${hair}" opacity=".85"/>`;
      break;
    case "pony":
      hairLayer = `
        <path d="M28 36 Q30 18 50 16 Q72 18 72 36 L72 44 L28 44 Z" fill="${hair}"/>
        <path d="M62 40 Q86 50 80 78 L72 76 Q72 60 70 50 Z" fill="${hair}"/>`;
      break;
    case "curly":
      hairLayer = `
        <circle cx="32" cy="32" r="9" fill="${hair}"/>
        <circle cx="42" cy="22" r="9" fill="${hair}"/>
        <circle cx="55" cy="20" r="9" fill="${hair}"/>
        <circle cx="68" cy="30" r="9" fill="${hair}"/>
        <path d="M28 36 L72 36 L72 44 L28 44 Z" fill="${hair}"/>`;
      break;
    case "bald":
      hairLayer = `<path d="M34 30 Q40 26 50 26 Q60 26 66 30" stroke="${shadeColor(skin, -0.15)}" stroke-width="1" fill="none"/>`;
      break;
  }

  return `
    <svg viewBox="0 0 100 110" width="${size}" height="${Math.round(size * 1.1)}" xmlns="http://www.w3.org/2000/svg">
      <!-- Drop shadow -->
      <ellipse cx="50" cy="106" rx="22" ry="3" fill="rgba(0,0,0,.35)"/>
      <!-- Top / shirt -->
      <path d="M20 110 Q20 78 36 72 L64 72 Q80 78 80 110 Z" fill="${top}"/>
      <path d="M20 110 Q20 92 36 86 L36 108 L20 108 Z" fill="${topShadow}" opacity=".6"/>
      <!-- Neck -->
      <path d="M42 58 L42 72 Q50 78 58 72 L58 58 Z" fill="${skinShadow}"/>
      <!-- Head -->
      <ellipse cx="50" cy="44" rx="22" ry="24" fill="${skin}"/>
      <!-- Cheek shading -->
      <ellipse cx="40" cy="50" rx="4" ry="3" fill="${skinShadow}" opacity=".35"/>
      <ellipse cx="60" cy="50" rx="4" ry="3" fill="${skinShadow}" opacity=".35"/>
      <!-- Hair (drawn after head so it sits on top) -->
      ${hairLayer}
      <!-- Eyebrows -->
      <path d="M37 41 Q42 39 47 41" stroke="${shadeColor(hair, -0.2)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M53 41 Q58 39 63 41" stroke="${shadeColor(hair, -0.2)}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <!-- Eye whites -->
      <ellipse cx="42" cy="46" rx="3.2" ry="2.4" fill="#fff"/>
      <ellipse cx="58" cy="46" rx="3.2" ry="2.4" fill="#fff"/>
      <!-- Iris -->
      <circle cx="42" cy="46" r="2.0" fill="${eyeHex(c)}"/>
      <circle cx="58" cy="46" r="2.0" fill="${eyeHex(c)}"/>
      <!-- Pupils -->
      <circle cx="42" cy="46" r="1.0" fill="#1a1006"/>
      <circle cx="58" cy="46" r="1.0" fill="#1a1006"/>
      <!-- Eye highlights -->
      <circle cx="42.6" cy="45.5" r=".5" fill="#fff"/>
      <circle cx="58.6" cy="45.5" r=".5" fill="#fff"/>
      <!-- Glasses overlay -->
      ${renderGlasses(c)}
      <!-- Facial hair -->
      ${renderFacialHair(c, skin, hair)}
      <!-- Mouth -->
      <path d="M44 56 Q50 59 56 56" stroke="#5a3a30" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    </svg>
  `;
}

function renderGlasses(c) {
  const stroke = "#1a1410";
  if (c.glasses === "round") {
    return `
      <circle cx="42" cy="46" r="5" fill="rgba(255,255,255,0.05)" stroke="${stroke}" stroke-width="1.4"/>
      <circle cx="58" cy="46" r="5" fill="rgba(255,255,255,0.05)" stroke="${stroke}" stroke-width="1.4"/>
      <line x1="47" y1="46" x2="53" y2="46" stroke="${stroke}" stroke-width="1.2"/>
    `;
  }
  if (c.glasses === "square") {
    return `
      <rect x="37" y="42" width="10" height="8" rx="1.5" fill="rgba(255,255,255,0.05)" stroke="${stroke}" stroke-width="1.4"/>
      <rect x="53" y="42" width="10" height="8" rx="1.5" fill="rgba(255,255,255,0.05)" stroke="${stroke}" stroke-width="1.4"/>
      <line x1="47" y1="46" x2="53" y2="46" stroke="${stroke}" stroke-width="1.2"/>
    `;
  }
  return "";
}

function renderFacialHair(c, skinHex, hairHex) {
  const colour = shadeColor(hairHex, -0.1);
  if (c.facialHair === "stubble") {
    return `<path d="M40 58 Q50 64 60 58 L58 62 Q50 66 42 62 Z" fill="${colour}" opacity=".55"/>`;
  }
  if (c.facialHair === "beard") {
    return `
      <path d="M37 56 Q40 70 50 72 Q60 70 63 56 Q60 62 50 64 Q40 62 37 56 Z" fill="${colour}"/>
      <path d="M44 60 Q50 64 56 60" stroke="#5a3a30" stroke-width="1.4" fill="none"/>
    `;
  }
  if (c.facialHair === "moustache") {
    return `<path d="M42 55 Q46 53 50 55 Q54 53 58 55 Q54 57 50 56 Q46 57 42 55 Z" fill="${colour}"/>`;
  }
  return "";
}

// Lighten or darken a hex color by `pct` (-1..1)
function shadeColor(hex, pct) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + (pct < 0 ? v * pct : (255 - v) * pct))));
  return "#" + [f(r), f(g), f(b)].map(v => v.toString(16).padStart(2, "0")).join("");
}

// Build the character creator view HTML. The host page wires up event handlers
// after this is inserted. The form posts on submit by calling window.Character.handleCreatorSubmit.
function viewCharacterCreator(existing, allPhobias) {
  const c = existing || defaultCharacter();
  const swatch = (arr, currentId, family) => arr.map(item => `
    <button type="button" class="swatch ${item.id === currentId ? "selected" : ""}"
      data-family="${family}" data-id="${item.id}"
      style="${item.hex ? `background:${item.hex};` : ""}"
      title="${item.label}">${item.hex ? "" : `<span>${item.label}</span>`}</button>
  `).join("");

  // Multi-select for phobias. The first chosen acts as primary.
  const allChosen = new Set([
    ...(c.primaryPhobia ? [c.primaryPhobia] : []),
    ...(c.additionalPhobias || []),
  ]);
  const phobiaOptions = Object.entries(allPhobias).map(([key, p]) => `
    <label class="phobia-pick">
      <input type="checkbox" name="phobias" value="${key}" ${allChosen.has(key) ? "checked" : ""}/>
      <span class="pick-card">
        <span class="pick-icon">${p.icon}</span>
        <span class="pick-text">
          <strong>${p.label}</strong>
          <em>${p.name}</em>
          ${c.primaryPhobia === key ? `<span class="pick-primary">primary</span>` : ""}
        </span>
        <span class="pick-check"></span>
      </span>
    </label>
  `).join("");

  return `
    <div class="creator">
      <div class="creator-grid">
        <div class="creator-preview">
          <div class="avatar-large" id="avatarPreview" data-fallback-svg='${avatarSVG(c, 220).replace(/'/g, "&apos;")}'>${avatarSVG(c, 220)}</div>
          <input class="char-name-input" id="charName" type="text" maxlength="24"
                 placeholder="Your name (optional)" value="${(c.name || "").replace(/"/g, "&quot;")}"/>
          <div class="char-preset-row">
            <button type="button" class="preset-btn ${(c.voicePreset || "calm") === "calm" ? "selected" : ""}" data-preset="calm" title="Slower pace, more grounding">Calm voice</button>
            <button type="button" class="preset-btn ${c.voicePreset === "encouraging" ? "selected" : ""}" data-preset="encouraging" title="Warmer, affirming">Encouraging</button>
            <button type="button" class="preset-btn ${c.voicePreset === "brief" ? "selected" : ""}" data-preset="brief" title="Quicker, fewer words">Brief</button>
          </div>
        </div>
        <div class="creator-form">
          <h2>Make yourself at home.</h2>
          <p class="lead-sm">A character to walk this with you. You can change anything later.</p>

          <div class="creator-row">
            <label>Skin</label>
            <div class="swatches" data-group="skinTone">${swatch(SKIN_TONES, c.skinTone, "skinTone")}</div>
          </div>
          <div class="creator-row">
            <label>Hair colour</label>
            <div class="swatches" data-group="hairColor">${swatch(HAIR_COLORS, c.hairColor, "hairColor")}</div>
          </div>
          <div class="creator-row">
            <label>Hair style</label>
            <div class="swatches text" data-group="hairStyle">${swatch(HAIR_STYLES, c.hairStyle, "hairStyle")}</div>
          </div>
          <div class="creator-row">
            <label>Shirt</label>
            <div class="swatches" data-group="topColor">${swatch(TOP_COLORS, c.topColor, "topColor")}</div>
          </div>
          <div class="creator-row">
            <label>Eyes</label>
            <div class="swatches" data-group="eyeColor">${swatch(EYE_COLORS, c.eyeColor, "eyeColor")}</div>
          </div>
          <div class="creator-row">
            <label>Glasses</label>
            <div class="swatches text" data-group="glasses">${swatch(GLASSES, c.glasses, "glasses")}</div>
          </div>
          <div class="creator-row">
            <label>Facial hair</label>
            <div class="swatches text" data-group="facialHair">${swatch(FACIAL_HAIR, c.facialHair, "facialHair")}</div>
          </div>
        </div>
      </div>

      <div class="creator-phobias">
        <h3>Which fears are on your mind?</h3>
        <p class="lead-sm">Pick one or several. The first one becomes your primary — you can change it from your profile.</p>
        <div class="phobia-grid">${phobiaOptions}</div>
      </div>

      <div class="creator-actions">
        <button class="btn-ghost" id="creatorRandom">🎲 Surprise me</button>
        <button class="btn-primary" id="creatorSave">Save &amp; begin</button>
        ${existing ? `<button class="btn-ghost" id="creatorCancel">Cancel</button>` : ""}
      </div>
    </div>
  `;
}

// Wire up the creator's interactivity. `onSave(character)` is called when the
// user submits. `onCancel()` is optional and only used for editing flows.
function attachCreatorHandlers(existing, allPhobias, onSave, onCancel) {
  const root = document.querySelector(".creator");
  if (!root) return;
  const state = existing ? Object.assign({}, existing) : defaultCharacter();
  // Make sure new fields exist on legacy characters
  if (!state.eyeColor)    state.eyeColor = "brown";
  if (!state.glasses)     state.glasses = "none";
  if (!state.facialHair)  state.facialHair = "none";
  if (!state.voicePreset) state.voicePreset = "calm";
  const preview = document.getElementById("avatarPreview");
  const nameInput = document.getElementById("charName");

  // If the 3D AvatarPreview is available, mount it inside the preview box
  // (the SVG fallback was already inserted as the box's innerHTML in the
  // template, so we clear it before mounting the canvas).
  let use3D = false;
  function mountPreview() {
    if (!preview || use3D) return;
    if (!window.AvatarPreview || !window.AvatarPreview.mount) return;
    preview.innerHTML = "";
    try {
      window.AvatarPreview.mount(preview, charForPreview());
      use3D = true;
    } catch (err) {
      // Fall back to SVG
      use3D = false;
      preview.innerHTML = avatarSVG(state, 220);
    }
  }
  function charForPreview() {
    return Object.assign({}, state, {
      skinHex: skinHex(state),
      hairHex: hairHex(state),
      shirtHex: topHex(state),
      eyeHex: eyeHex(state),
    });
  }
  // Try mount on the next frame so the 3D module has a chance to load
  if (window.AvatarPreview && window.AvatarPreview.ready) mountPreview();
  else window.addEventListener("scene3d-ready", () => mountPreview(), { once: true });

  function rerender() {
    if (use3D && window.AvatarPreview) {
      window.AvatarPreview.update(charForPreview());
    } else if (preview) {
      preview.innerHTML = avatarSVG(state, 220);
    }
  }

  // Swatch buttons
  root.querySelectorAll(".swatches").forEach(group => {
    const family = group.dataset.group;
    group.querySelectorAll(".swatch").forEach(btn => {
      btn.addEventListener("click", () => {
        state[family] = btn.dataset.id;
        // Update selection visuals
        group.querySelectorAll(".swatch").forEach(b => b.classList.toggle("selected", b === btn));
        rerender();
      });
    });
  });

  // Name input
  if (nameInput) {
    nameInput.addEventListener("input", () => { state.name = nameInput.value.trim(); });
  }

  // Voice preset buttons (calm / encouraging / brief)
  root.querySelectorAll(".preset-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      state.voicePreset = btn.dataset.preset;
      root.querySelectorAll(".preset-btn").forEach(b => b.classList.toggle("selected", b === btn));
      // Live-preview the voice rate so the user can hear the difference
      if (window.PhobiaVoice && window.PhobiaVoice.setRate) {
        const rate = state.voicePreset === "calm" ? 0.78
                   : state.voicePreset === "brief" ? 1.04
                   : 0.90;
        window.PhobiaVoice.setRate(rate);
        if (window.PhobiaVoice.speak) {
          const sample = state.voicePreset === "calm" ? "Slow breath. You are safe."
                       : state.voicePreset === "brief" ? "Stay. Breathe."
                       : "You can do this. Stay with it.";
          window.PhobiaVoice.speak(sample);
        }
      }
    });
  });

  // Phobia checkboxes — keep an ordered list of chosen ones; first = primary
  function readChosen() {
    return [...root.querySelectorAll('input[name="phobias"]:checked')].map(c => c.value);
  }
  // Initialise from existing
  let chosen = [];
  if (state.primaryPhobia) chosen.push(state.primaryPhobia);
  if (Array.isArray(state.additionalPhobias)) {
    state.additionalPhobias.forEach(k => { if (!chosen.includes(k)) chosen.push(k); });
  }
  // Sync DOM checkbox state matches order list
  function syncPrimaryBadge() {
    root.querySelectorAll(".phobia-pick").forEach(label => {
      const inp = label.querySelector("input");
      const card = label.querySelector(".pick-card");
      const text = label.querySelector(".pick-text");
      const isPrimary = chosen[0] === inp.value && inp.checked;
      // Remove any existing badge
      const existingBadge = text.querySelector(".pick-primary");
      if (existingBadge) existingBadge.remove();
      if (isPrimary) {
        const b = document.createElement("span");
        b.className = "pick-primary";
        b.textContent = "primary";
        text.appendChild(b);
      }
    });
  }
  syncPrimaryBadge();
  root.querySelectorAll('input[name="phobias"]').forEach(cb => {
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!chosen.includes(cb.value)) chosen.push(cb.value);
      } else {
        chosen = chosen.filter(k => k !== cb.value);
      }
      // If user un-checked the current primary, the next chosen becomes primary
      syncPrimaryBadge();
    });
    // Right-click / long-press to set as primary even if not first
    cb.parentElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (!cb.checked) { cb.checked = true; chosen.push(cb.value); }
      // Reorder so this one is first
      chosen = [cb.value, ...chosen.filter(k => k !== cb.value)];
      syncPrimaryBadge();
    });
  });

  // Save
  const save = document.getElementById("creatorSave");
  if (save) save.addEventListener("click", () => {
    chosen = readChosen().sort((a, b) => chosen.indexOf(a) - chosen.indexOf(b));
    if (chosen.length === 0) {
      alert("Pick at least one fear to start. You can add more later.");
      return;
    }
    state.primaryPhobia = chosen[0];
    state.additionalPhobias = chosen.slice(1);
    state.updatedAt = Date.now();
    saveCharacter(state);
    onSave && onSave(state);
  });
  const cancel = document.getElementById("creatorCancel");
  if (cancel && onCancel) cancel.addEventListener("click", onCancel);

  // "Surprise me" — randomise everything except name + chosen phobias
  const random = document.getElementById("creatorRandom");
  if (random) random.addEventListener("click", () => {
    const r = randomCharacter();
    Object.assign(state, {
      skinTone: r.skinTone, hairColor: r.hairColor, hairStyle: r.hairStyle,
      topColor: r.topColor, eyeColor: r.eyeColor, glasses: r.glasses,
      facialHair: r.facialHair, voicePreset: r.voicePreset,
    });
    // Reflect in the swatch UI
    root.querySelectorAll(".swatches").forEach(group => {
      const family = group.dataset.group;
      const id = state[family];
      group.querySelectorAll(".swatch").forEach(b => b.classList.toggle("selected", b.dataset.id === id));
    });
    root.querySelectorAll(".preset-btn").forEach(b => b.classList.toggle("selected", b.dataset.preset === state.voicePreset));
    rerender();
  });
}

window.Character = {
  SKIN_TONES, HAIR_COLORS, HAIR_STYLES, TOP_COLORS,
  EYE_COLORS, GLASSES, FACIAL_HAIR,
  defaultCharacter, randomCharacter,
  loadCharacter, loadCharacters, activeCharacterId,
  saveCharacter, setActiveCharacter, deleteCharacter, clearCharacter,
  skinHex, hairHex, topHex, eyeHex, hexToInt,
  avatarSVG, viewCharacterCreator, attachCreatorHandlers,
};
