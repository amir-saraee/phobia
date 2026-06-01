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

// Curated "quick start" looks — one tap sets a whole tasteful, diverse
// appearance the user can then tweak. (Distinct from the random dice.)
const STARTER_PRESETS = [
  { id: "sage",   label: "Sage",   skinTone: "olive",     hairColor: "grey",   hairStyle: "short", topColor: "forest", eyeColor: "green", glasses: "round",  facialHair: "beard" },
  { id: "ember",  label: "Ember",  skinTone: "fair",      hairColor: "auburn", hairStyle: "curly", topColor: "rose",   eyeColor: "hazel", glasses: "none",   facialHair: "none" },
  { id: "indigo", label: "Indigo", skinTone: "deep",      hairColor: "black",  hairStyle: "buzz",  topColor: "navy",   eyeColor: "brown", glasses: "square", facialHair: "none" },
  { id: "bloom",  label: "Bloom",  skinTone: "porcelain", hairColor: "rose",   hairStyle: "long",  topColor: "plum",   eyeColor: "blue",  glasses: "none",   facialHair: "none" },
  { id: "slate",  label: "Slate",  skinTone: "tan",       hairColor: "brown",  hairStyle: "pony",  topColor: "char",   eyeColor: "grey",  glasses: "none",   facialHair: "stubble" },
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

// Render an SVG avatar for the given character. Polished portrait look:
// shaded face with subtle highlight + shadow gradients, refined eyes with
// iris detail, soft cheek blush, layered hair styles with highlights, and
// a vignette behind the character so the SVG works on any background.
// `size` is the rendered width in pixels (height is auto, ~1.2× size).
function avatarSVG(c, size = 80) {
  if (!c) c = defaultCharacter();
  const skin = skinHex(c);
  const hair = hairHex(c);
  const top  = topHex(c);
  const eye  = eyeHex(c);
  const skinShadow = shadeColor(skin, -0.20);
  const skinDeep   = shadeColor(skin, -0.32);
  const skinLight  = shadeColor(skin, 0.10);
  const skinBlush  = shadeColor(skin, -0.05);
  const topShadow  = shadeColor(top,  -0.28);
  const topLight   = shadeColor(top,  0.10);
  const hairLight  = shadeColor(hair, 0.18);
  const hairDeep   = shadeColor(hair, -0.22);
  const eyeRim     = shadeColor(eye,  -0.30);

  // Unique gradient IDs per render so multiple avatars on the page don't
  // collide. Uses a simple hash of skin+hair+top to keep IDs stable for the
  // same character.
  const gid = "av" + (
    (skin + hair + top + eye + (c.hairStyle || "") + (c.glasses || "") + (c.facialHair || ""))
      .split("").reduce((h, ch) => ((h << 5) - h + ch.charCodeAt(0)) | 0, 0) & 0xffff
  ).toString(16);

  // Hair styles — each rendered with a base + highlight pass for volume
  const hairLayer = (() => {
    const base = `fill="url(#${gid}HairGrad)"`;
    switch (c.hairStyle) {
      case "short":
        return `
          <path d="M28 38 Q26 18 50 14 Q74 18 72 38 L72 46 Q66 40 60 40 L40 40 Q34 40 28 46 Z" ${base}/>
          <path d="M30 40 Q40 30 50 30 Q60 30 70 40 L70 44 L62 38 L50 36 L38 38 L30 44 Z" fill="${hairLight}" opacity=".7"/>
          <!-- Strands at the temple -->
          <path d="M28 38 Q24 32 30 24" stroke="${hairDeep}" stroke-width="1.4" fill="none" opacity=".8" stroke-linecap="round"/>
          <path d="M72 38 Q76 32 70 24" stroke="${hairDeep}" stroke-width="1.4" fill="none" opacity=".8" stroke-linecap="round"/>`;
      case "long":
        return `
          <path d="M22 40 Q20 18 50 12 Q80 18 78 40 L78 92 Q72 88 70 84 L70 52 L30 52 L30 84 Q28 88 22 92 Z" ${base}/>
          <!-- Highlight stripes down the long hair -->
          <path d="M28 50 Q26 70 24 88" stroke="${hairLight}" stroke-width="1.5" fill="none" opacity=".5"/>
          <path d="M72 50 Q74 70 76 88" stroke="${hairLight}" stroke-width="1.5" fill="none" opacity=".5"/>
          <!-- Bangs -->
          <path d="M30 38 Q40 28 50 28 Q60 28 70 38 L66 42 Q58 36 50 36 Q42 36 34 42 Z" fill="${hairLight}" opacity=".55"/>`;
      case "buzz":
        return `
          <path d="M30 38 Q34 22 50 20 Q66 22 70 38 L68 42 L32 42 Z" fill="${hair}" opacity=".90"/>
          <!-- Texture dots for buzz cut -->
          <g fill="${hairLight}" opacity=".5">
            ${[34, 42, 50, 58, 66].map((x, i) => [22 + i*2, 30 + (i%2)*2].map(y => `<circle cx="${x}" cy="${y}" r=".8"/>`).join("")).join("")}
          </g>`;
      case "pony":
        return `
          <path d="M28 38 Q26 18 50 14 Q74 18 72 38 L72 46 L28 46 Z" ${base}/>
          <path d="M30 40 Q40 32 50 32 Q60 32 70 40 L68 44 L32 44 Z" fill="${hairLight}" opacity=".6"/>
          <!-- Pony tail with movement -->
          <path d="M62 42 Q88 50 82 80 Q78 86 72 80 Q72 64 70 52 Z" ${base}/>
          <path d="M68 50 Q82 58 78 76" stroke="${hairLight}" stroke-width="1.5" fill="none" opacity=".5"/>`;
      case "curly":
        return `
          <g ${base}>
            <circle cx="30" cy="32" r="10"/>
            <circle cx="42" cy="22" r="10"/>
            <circle cx="56" cy="20" r="10"/>
            <circle cx="70" cy="30" r="10"/>
            <circle cx="36" cy="38" r="8"/>
            <circle cx="64" cy="38" r="8"/>
          </g>
          <g fill="${hairLight}" opacity=".6">
            <circle cx="34" cy="28" r="3"/>
            <circle cx="48" cy="20" r="3"/>
            <circle cx="62" cy="22" r="3"/>
          </g>`;
      case "bald":
        return `
          <ellipse cx="50" cy="32" rx="20" ry="6" fill="${skinLight}" opacity=".4"/>
          <path d="M34 30 Q40 26 50 26 Q60 26 66 30" stroke="${skinShadow}" stroke-width=".8" fill="none" opacity=".5"/>`;
      default: return "";
    }
  })();

  return `
    <svg viewBox="0 0 100 120" width="${size}" height="${Math.round(size * 1.2)}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- Soft circular vignette behind the portrait so the avatar reads
             cleanly against any background. -->
        <radialGradient id="${gid}Bg" cx=".5" cy=".48" r=".55">
          <stop offset="0" stop-color="${shadeColor(top, -0.15)}" stop-opacity=".55"/>
          <stop offset=".75" stop-color="${shadeColor(top, -0.45)}" stop-opacity=".15"/>
          <stop offset="1" stop-color="${shadeColor(top, -0.45)}" stop-opacity="0"/>
        </radialGradient>
        <!-- Face shading: light from upper-left, shadow on lower-right.
             Subtle but enough to give the head dimensional depth. -->
        <linearGradient id="${gid}FaceGrad" x1="0.25" y1="0.2" x2="0.85" y2="0.95">
          <stop offset="0" stop-color="${skinLight}"/>
          <stop offset=".55" stop-color="${skin}"/>
          <stop offset="1" stop-color="${skinShadow}"/>
        </linearGradient>
        <linearGradient id="${gid}HairGrad" x1="0.3" y1="0.1" x2="0.7" y2="0.9">
          <stop offset="0" stop-color="${hairLight}"/>
          <stop offset=".5" stop-color="${hair}"/>
          <stop offset="1" stop-color="${hairDeep}"/>
        </linearGradient>
        <!-- Shirt: vertical light/shadow gradient suggesting fabric folds. -->
        <linearGradient id="${gid}TopGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${topLight}"/>
          <stop offset=".55" stop-color="${top}"/>
          <stop offset="1" stop-color="${topShadow}"/>
        </linearGradient>
        <!-- Iris radial: lighter rim, darker centre near the pupil. -->
        <radialGradient id="${gid}EyeGrad" cx=".5" cy=".5" r=".55">
          <stop offset="0" stop-color="${shadeColor(eye, 0.18)}"/>
          <stop offset=".7" stop-color="${eye}"/>
          <stop offset="1" stop-color="${eyeRim}"/>
        </radialGradient>
      </defs>

      <!-- Background vignette -->
      <circle cx="50" cy="56" r="48" fill="url(#${gid}Bg)"/>
      <!-- Soft floor shadow -->
      <ellipse cx="50" cy="116" rx="26" ry="3" fill="rgba(0,0,0,.32)"/>

      <!-- Shoulders / shirt -->
      <path d="M16 120 Q16 80 36 74 L64 74 Q84 80 84 120 Z" fill="url(#${gid}TopGrad)"/>
      <!-- Shirt fold detail (mid-line) -->
      <path d="M50 80 L50 120" stroke="${topShadow}" stroke-width="1" opacity=".35"/>
      <!-- Shirt collar V -->
      <path d="M40 76 L50 84 L60 76 Q56 80 50 80 Q44 80 40 76 Z" fill="${topShadow}" opacity=".55"/>

      <!-- Neck (slightly recessed shadow) -->
      <path d="M42 58 L42 74 Q50 78 58 74 L58 58 Z" fill="${skinDeep}"/>
      <ellipse cx="50" cy="74" rx="8" ry="1.5" fill="${skinDeep}" opacity=".55"/>

      <!-- Head with gradient shading -->
      <ellipse cx="50" cy="44" rx="22" ry="25" fill="url(#${gid}FaceGrad)"/>
      <!-- Cheek blush — soft, warm tone -->
      <ellipse cx="38" cy="52" rx="4.5" ry="3.2" fill="#e8a48a" opacity=".30"/>
      <ellipse cx="62" cy="52" rx="4.5" ry="3.2" fill="#e8a48a" opacity=".30"/>
      <!-- Subtle face contour (jawline shadow) -->
      <path d="M30 50 Q34 64 50 68 Q66 64 70 50" stroke="${skinShadow}" stroke-width="1" fill="none" opacity=".25"/>

      <!-- Hair on top of head -->
      ${hairLayer}

      <!-- Eyebrows: thicker and slightly arched -->
      <path d="M37 40 Q42 38 47 41" stroke="${hairDeep}" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M53 41 Q58 38 63 40" stroke="${hairDeep}" stroke-width="1.8" fill="none" stroke-linecap="round"/>

      <!-- Eyes: sclera with soft inner shadow, iris with radial gradient,
           pupil, two highlights for that "alive" wet-eye look. -->
      <ellipse cx="42" cy="46" rx="3.6" ry="2.6" fill="#fff"/>
      <ellipse cx="58" cy="46" rx="3.6" ry="2.6" fill="#fff"/>
      <ellipse cx="42" cy="44.5" rx="3.4" ry="1.4" fill="#000" opacity=".10"/>
      <ellipse cx="58" cy="44.5" rx="3.4" ry="1.4" fill="#000" opacity=".10"/>
      <circle cx="42" cy="46.5" r="2.2" fill="url(#${gid}EyeGrad)"/>
      <circle cx="58" cy="46.5" r="2.2" fill="url(#${gid}EyeGrad)"/>
      <circle cx="42" cy="46.5" r="1.0" fill="#0a0608"/>
      <circle cx="58" cy="46.5" r="1.0" fill="#0a0608"/>
      <circle cx="42.7" cy="45.7" r=".7" fill="#fff"/>
      <circle cx="58.7" cy="45.7" r=".7" fill="#fff"/>
      <circle cx="41.3" cy="47.3" r=".25" fill="#fff" opacity=".7"/>
      <circle cx="57.3" cy="47.3" r=".25" fill="#fff" opacity=".7"/>
      <!-- Subtle eyelid line above each eye -->
      <path d="M38.5 44 Q42 43 45.5 44" stroke="${shadeColor(skin, -0.35)}" stroke-width=".8" fill="none" opacity=".45" stroke-linecap="round"/>
      <path d="M54.5 44 Q58 43 61.5 44" stroke="${shadeColor(skin, -0.35)}" stroke-width=".8" fill="none" opacity=".45" stroke-linecap="round"/>

      <!-- Glasses overlay -->
      ${renderGlasses(c)}

      <!-- Nose: minimal — a soft shadow + a tiny tip highlight -->
      <path d="M48 50 Q47 56 50 58 Q53 56 52 50" stroke="${skinDeep}" stroke-width=".7" fill="none" opacity=".4" stroke-linecap="round"/>
      <ellipse cx="50" cy="56" rx="1" ry=".4" fill="${skinLight}" opacity=".5"/>

      <!-- Facial hair (under the mouth so the mouth sits on top of beards) -->
      ${renderFacialHair(c, skin, hair)}

      <!-- Mouth: lips with a hint of a smile -->
      <path d="M43 60 Q50 64 57 60" stroke="${shadeColor(skin, -0.40)}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M44 60.5 Q50 62.8 56 60.5" stroke="#c46a5a" stroke-width="1" fill="none" opacity=".55" stroke-linecap="round"/>
      <!-- Tiny lower-lip highlight -->
      <path d="M46 62 Q50 63 54 62" stroke="${skinLight}" stroke-width=".6" fill="none" opacity=".5" stroke-linecap="round"/>
    </svg>
  `;
}

function renderGlasses(c) {
  // Refined glasses: subtle gradient on the lens to read like glass, thin
  // metallic-feeling frames, gentle reflection highlight.
  const frame = "#1a1410";
  const reflect = "rgba(255,255,255,.18)";
  if (c.glasses === "round") {
    return `
      <circle cx="42" cy="46.5" r="5.6" fill="rgba(160,200,220,.08)" stroke="${frame}" stroke-width="1.4"/>
      <circle cx="58" cy="46.5" r="5.6" fill="rgba(160,200,220,.08)" stroke="${frame}" stroke-width="1.4"/>
      <path d="M40 44.5 Q42 43.5 44 44.5" stroke="${reflect}" stroke-width="1" fill="none" stroke-linecap="round"/>
      <path d="M56 44.5 Q58 43.5 60 44.5" stroke="${reflect}" stroke-width="1" fill="none" stroke-linecap="round"/>
      <line x1="47.5" y1="46.5" x2="52.5" y2="46.5" stroke="${frame}" stroke-width="1.2"/>
      <!-- Temple arms (sides) -->
      <line x1="36.5" y1="46" x2="30" y2="44" stroke="${frame}" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="63.5" y1="46" x2="70" y2="44" stroke="${frame}" stroke-width="1.2" stroke-linecap="round"/>
    `;
  }
  if (c.glasses === "square") {
    return `
      <rect x="36.5" y="42.5" width="11" height="8.5" rx="1.5" fill="rgba(160,200,220,.08)" stroke="${frame}" stroke-width="1.4"/>
      <rect x="52.5" y="42.5" width="11" height="8.5" rx="1.5" fill="rgba(160,200,220,.08)" stroke="${frame}" stroke-width="1.4"/>
      <path d="M38 44 L40 44" stroke="${reflect}" stroke-width="1" stroke-linecap="round"/>
      <path d="M54 44 L56 44" stroke="${reflect}" stroke-width="1" stroke-linecap="round"/>
      <line x1="47.5" y1="46.5" x2="52.5" y2="46.5" stroke="${frame}" stroke-width="1.2"/>
      <!-- Temple arms -->
      <line x1="36" y1="46" x2="30" y2="44" stroke="${frame}" stroke-width="1.2" stroke-linecap="round"/>
      <line x1="64" y1="46" x2="70" y2="44" stroke="${frame}" stroke-width="1.2" stroke-linecap="round"/>
    `;
  }
  return "";
}

function renderFacialHair(c, skin, hair) {
  // Beard / stubble / moustache rendered with gradient-aware colour and
  // softer edges to integrate with the new shaded face.
  const colour     = shadeColor(hair, -0.12);
  const colourDeep = shadeColor(hair, -0.30);
  if (c.facialHair === "stubble") {
    return `
      <path d="M40 60 Q50 66 60 60 L58 64 Q50 68 42 64 Z" fill="${colour}" opacity=".40"/>
      <!-- Stubble dots — fine speckle effect -->
      <g fill="${colourDeep}" opacity=".35">
        ${[42, 45, 48, 51, 54, 57].map((x, i) => [62 + (i%2), 65 + (i%2)*1.2].map(y => `<circle cx="${x}" cy="${y}" r=".3"/>`).join("")).join("")}
      </g>
    `;
  }
  if (c.facialHair === "beard") {
    return `
      <path d="M35 56 Q38 72 50 74 Q62 72 65 56 Q62 64 50 66 Q38 64 35 56 Z" fill="${colour}"/>
      <!-- Beard texture lines -->
      <path d="M40 62 Q42 68 44 70" stroke="${colourDeep}" stroke-width=".7" fill="none" opacity=".5"/>
      <path d="M50 64 L50 72" stroke="${colourDeep}" stroke-width=".7" fill="none" opacity=".5"/>
      <path d="M60 62 Q58 68 56 70" stroke="${colourDeep}" stroke-width=".7" fill="none" opacity=".5"/>
    `;
  }
  if (c.facialHair === "moustache") {
    return `
      <path d="M40 58 Q44 56 50 58 Q56 56 60 58 Q56 61 50 60 Q44 61 40 58 Z" fill="${colour}"/>
      <path d="M42 58.5 Q46 57.5 50 58.5 Q54 57.5 58 58.5" stroke="${colourDeep}" stroke-width=".5" fill="none" opacity=".7"/>
    `;
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
      <div class="creator-intro">
        <h2>Meet yourself.</h2>
        <p class="lead-sm">This character walks every step with you. The skin, the hair, the shirt — that's what you'll see in third-person on every rooftop, in every room. Make them yours.</p>
      </div>

      <div class="creator-grid">
        <div class="creator-preview">
          <div class="avatar-stage">
            <div class="avatar-large" id="avatarPreview" data-fallback-svg='${avatarSVG(c, 240).replace(/'/g, "&apos;")}'>${avatarSVG(c, 240)}</div>
            <button type="button" class="preview-randomise" id="creatorRandomTop" title="Shuffle appearance"><span aria-hidden="true">🎲</span></button>
          </div>
          <div class="avatar-hint">↔ drag to rotate · 🎲 shuffle</div>
          <input class="char-name-input" id="charName" type="text" maxlength="24"
                 placeholder="Your name (optional)" value="${(c.name || "").replace(/"/g, "&quot;")}"/>
          <div class="creator-section-label">Coach voice</div>
          <div class="char-preset-row">
            <button type="button" class="preset-btn ${(c.voicePreset || "calm") === "calm" ? "selected" : ""}" data-preset="calm" title="Slower pace, more grounding">Calm</button>
            <button type="button" class="preset-btn ${c.voicePreset === "encouraging" ? "selected" : ""}" data-preset="encouraging" title="Warmer, affirming">Encouraging</button>
            <button type="button" class="preset-btn ${c.voicePreset === "brief" ? "selected" : ""}" data-preset="brief" title="Quicker, fewer words">Brief</button>
          </div>
        </div>

        <div class="creator-form">
          <div class="creator-section creator-starters">
            <div class="creator-section-head">
              <span class="creator-section-num">✦</span>
              <h3>Quick start</h3>
            </div>
            <p class="small" style="margin:-2px 0 12px">Tap a look to start from — then tweak anything below.</p>
            <div class="starter-row">
              ${STARTER_PRESETS.map(pr => `
                <button type="button" class="starter-preset" data-starter="${pr.id}" title="${pr.label}">
                  <span class="starter-av">${avatarSVG(Object.assign({}, defaultCharacter(), pr), 46)}</span>
                  <span class="starter-lbl">${pr.label}</span>
                </button>`).join("")}
            </div>
          </div>

          <div class="creator-section">
            <div class="creator-section-head">
              <span class="creator-section-num">1</span>
              <h3>Skin &amp; complexion</h3>
            </div>
            <div class="creator-row">
              <label>Skin tone</label>
              <div class="swatches" data-group="skinTone">${swatch(SKIN_TONES, c.skinTone, "skinTone")}</div>
            </div>
          </div>

          <div class="creator-section">
            <div class="creator-section-head">
              <span class="creator-section-num">2</span>
              <h3>Hair</h3>
            </div>
            <div class="creator-row">
              <label>Colour</label>
              <div class="swatches" data-group="hairColor">${swatch(HAIR_COLORS, c.hairColor, "hairColor")}</div>
            </div>
            <div class="creator-row">
              <label>Style</label>
              <div class="swatches text" data-group="hairStyle">${swatch(HAIR_STYLES, c.hairStyle, "hairStyle")}</div>
            </div>
          </div>

          <div class="creator-section">
            <div class="creator-section-head">
              <span class="creator-section-num">3</span>
              <h3>Face</h3>
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

          <div class="creator-section">
            <div class="creator-section-head">
              <span class="creator-section-num">4</span>
              <h3>Clothing</h3>
            </div>
            <div class="creator-row">
              <label>Shirt</label>
              <div class="swatches" data-group="topColor">${swatch(TOP_COLORS, c.topColor, "topColor")}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="creator-phobias">
        <div class="creator-section-head">
          <span class="creator-section-num">5</span>
          <h3>Which fears are on your mind?</h3>
        </div>
        <p class="lead-sm">Pick one or several. The first becomes your primary — you can change it from your profile.</p>
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

  // "Surprise me" — randomise everything except name + chosen phobias.
  // Same handler is wired to BOTH the bottom "Surprise me" action button
  // and the small dice icon over the preview frame.
  // Apply a full set of appearance fields onto state + re-sync the swatch/voice
  // UI + the live preview. Shared by the dice and the quick-start presets.
  function applyAppearance(fields) {
    Object.assign(state, fields);
    root.querySelectorAll(".swatches").forEach(group => {
      const id = state[group.dataset.group];
      group.querySelectorAll(".swatch").forEach(b => b.classList.toggle("selected", b.dataset.id === id));
    });
    root.querySelectorAll(".preset-btn").forEach(b => b.classList.toggle("selected", b.dataset.preset === state.voicePreset));
    rerender();
  }
  function shuffleAppearance() {
    const r = randomCharacter();
    applyAppearance({
      skinTone: r.skinTone, hairColor: r.hairColor, hairStyle: r.hairStyle,
      topColor: r.topColor, eyeColor: r.eyeColor, glasses: r.glasses,
      facialHair: r.facialHair, voicePreset: r.voicePreset,
    });
    root.querySelectorAll(".starter-preset").forEach(b => b.classList.remove("active"));
  }
  const random = document.getElementById("creatorRandom");
  if (random) random.addEventListener("click", shuffleAppearance);
  const randomTop = document.getElementById("creatorRandomTop");
  if (randomTop) randomTop.addEventListener("click", shuffleAppearance);

  // Quick-start preset looks — one tap applies a curated appearance.
  root.querySelectorAll(".starter-preset").forEach(btn => {
    btn.addEventListener("click", () => {
      const pr = STARTER_PRESETS.find(p => p.id === btn.dataset.starter);
      if (!pr) return;
      const { id, label, ...fields } = pr;
      applyAppearance(fields);
      root.querySelectorAll(".starter-preset").forEach(b => b.classList.toggle("active", b === btn));
    });
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
