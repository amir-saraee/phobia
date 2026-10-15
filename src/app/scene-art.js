// The 2D side: SVG fallback scenes for when WebGL is unavailable, realm icons
// and thumbnails.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.
// Loads before realm-data.js: PHOBIAS stores these icons and renderers.

"use strict";

// ---------- Scene renderers ----------
function renderHeights(el, lv, idx) {
  const h = lv.height; // 0..1
  // Sky gradient gets darker with height; horizon drops as we go up.
  const horizon = 70 - h*45; // % from top
  el.innerHTML = `
    <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="sky${idx}" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#1e3a8a"/>
          <stop offset="1" stop-color="#7dd3fc"/>
        </linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#sky${idx})"/>
      <!-- distant clouds -->
      <ellipse cx="120" cy="${60+ (1-h)*60}" rx="60" ry="10" fill="rgba(255,255,255,.5)"/>
      <ellipse cx="600" cy="${100+(1-h)*40}" rx="80" ry="12" fill="rgba(255,255,255,.4)"/>
      <!-- ground / city / street -->
      <g class="ground" transform="translate(0,${horizon*3.6})">
        <rect x="0" y="0" width="800" height="400" fill="#1f2937"/>
        ${Array.from({length: 12}).map((_,i) => {
          const x = i*70 + 10;
          const w = 50;
          const bh = 20 + (i*7)%80;
          return `<rect x="${x}" y="${-bh}" width="${w}" height="${bh}" fill="#0f172a" stroke="#334155"/>`;
        }).join("")}
        <!-- street -->
        <rect x="0" y="-2" width="800" height="6" fill="#334155"/>
      </g>
      <!-- foreground edge / railing -->
      <rect x="0" y="320" width="800" height="40" fill="#0b1020"/>
      <rect x="0" y="316" width="800" height="6" fill="#475569"/>
      <!-- vertigo dots -->
      ${h > 0.6 ? '<circle cx="400" cy="180" r="3" fill="rgba(255,255,255,.6)"><animate attributeName="r" values="2;6;2" dur="2s" repeatCount="indefinite"/></circle>' : ''}
    </svg>
  `;
}

function renderWater(el, lv) {
  const fill = lv.level; // 0..1
  el.innerHTML = `
    <svg viewBox="0 0 800 360" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">
      <defs>
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#0c4a6e"/>
          <stop offset="1" stop-color="#0e7490"/>
        </linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#bg)"/>
      ${fill > 0.7 ? Array.from({length: 30}).map((_,i)=>{
        const x = (i*53)%800, y=(i*97)%360, r=Math.random()*2+0.5;
        return `<circle cx="${x}" cy="${y}" r="${r}" fill="rgba(255,255,255,.6)"><animate attributeName="cy" from="${y}" to="${y-30}" dur="${3+Math.random()*3}s" repeatCount="indefinite"/></circle>`;
      }).join("") : ""}
    </svg>
    <div class="water-fill" style="height:${fill*100}%"></div>
    <div class="ripple" style="left:30%;top:${(1-fill)*70+10}%;width:120px;height:120px"></div>
    <div class="ripple" style="left:60%;top:${(1-fill)*60+15}%;width:80px;height:80px;animation-delay:1.2s"></div>
    <div class="ripple" style="left:45%;top:${(1-fill)*80+5}%;width:140px;height:140px;animation-delay:2s"></div>
  `;
}

function renderDog(el, lv) {
  const size = 100 + lv.size * 240; // px — slightly bigger than before
  // Friendlier palette across the board. Even the "barking" rung shows a
  // tan/golden dog, not a scorched-red guard dog.
  const fur     = lv.intensity === "barking" ? "#a8704a" : lv.intensity === "alert" ? "#c2895a" : "#d6a06a";
  const furDark = lv.intensity === "barking" ? "#7a4a2c" : lv.intensity === "alert" ? "#92603c" : "#a97442";
  const cream   = "#efd2a6";
  // Mouth — a smile at calm, an open pant at alert, an open bark at barking.
  const mouth = lv.intensity === "barking"
    ? `<path d="M-20 8 Q0 26 20 8 L18 16 Q0 32 -18 16 Z" fill="#2a1410"/>
       <ellipse cx="0" cy="18" rx="10" ry="5" fill="#ff6b86"/>
       <polygon points="-12,8 -8,22 -4,8" fill="#ffffff"/>
       <polygon points="4,8 8,22 12,8" fill="#ffffff"/>`
    : lv.intensity === "alert"
    ? `<path d="M-16 14 Q0 28 16 14 L14 20 Q0 30 -14 20 Z" fill="#2a1410"/>
       <ellipse cx="0" cy="22" rx="9" ry="4" fill="#ff8a9a"/>`
    : `<path d="M-14 16 Q0 24 14 16" stroke="#2a1410" stroke-width="3.5" fill="none" stroke-linecap="round"/>
       <ellipse cx="0" cy="22" rx="6" ry="2.5" fill="#ff8a9a"/>`;
  el.innerHTML = `
    <svg viewBox="0 0 800 360" style="position:absolute;inset:0">
      <defs>
        <linearGradient id="dogRoom" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f3dab2"/>
          <stop offset="60%" stop-color="#e8c89a"/>
          <stop offset="100%" stop-color="#caa478"/>
        </linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#dogRoom)"/>
      <!-- floor -->
      <rect x="0" y="260" width="800" height="100" fill="#caa478"/>
      <line x1="0" y1="270" x2="800" y2="270" stroke="#a98452" stroke-width="2"/>
      <!-- window -->
      <rect x="80" y="50" width="180" height="140" fill="#eaf0fa" stroke="#4a3528" stroke-width="6"/>
      <line x1="170" y1="50" x2="170" y2="190" stroke="#4a3528" stroke-width="3"/>
      <line x1="80" y1="120" x2="260" y2="120" stroke="#4a3528" stroke-width="3"/>
      <!-- rug -->
      <ellipse cx="500" cy="320" rx="240" ry="36" fill="#c0807a"/>
      <ellipse cx="500" cy="320" rx="220" ry="28" fill="none" stroke="#8a4f4a" stroke-width="3"/>
    </svg>
    <div class="creature" style="width:${size}px;height:${size}px">
      <svg viewBox="-100 -100 200 200" width="100%" height="100%">
        <!-- tail -->
        <path d="M-60 30 Q-80 0 -70 -30" stroke="${fur}" stroke-width="14" fill="none" stroke-linecap="round"/>
        <!-- body -->
        <ellipse cx="-5" cy="40" rx="68" ry="38" fill="${fur}"/>
        <!-- belly blaze -->
        <ellipse cx="-5" cy="55" rx="40" ry="20" fill="${cream}"/>
        <!-- back legs -->
        <ellipse cx="-30" cy="68" rx="14" ry="20" fill="${fur}"/>
        <ellipse cx="20" cy="68" rx="14" ry="20" fill="${fur}"/>
        <!-- front legs -->
        <rect x="-26" y="50" width="14" height="36" rx="6" fill="${fur}"/>
        <rect x="6" y="50" width="14" height="36" rx="6" fill="${fur}"/>
        <!-- ears (behind head) -->
        <ellipse cx="-46" cy="-30" rx="20" ry="34" fill="${furDark}" transform="rotate(-12 -46 -30)"/>
        <ellipse cx="46" cy="-30" rx="20" ry="34" fill="${furDark}" transform="rotate(12 46 -30)"/>
        <!-- head -->
        <circle cx="0" cy="-12" r="58" fill="${fur}"/>
        <!-- forehead patch -->
        <ellipse cx="0" cy="-30" rx="22" ry="14" fill="${cream}"/>
        <!-- eyes (big + soulful) -->
        <g class="blink">
          <ellipse cx="-22" cy="-16" rx="10" ry="11" fill="#fff4ea"/>
          <ellipse cx="22" cy="-16" rx="10" ry="11" fill="#fff4ea"/>
          <circle cx="-22" cy="-14" r="7" fill="#3a2418"/>
          <circle cx="22" cy="-14" r="7" fill="#3a2418"/>
          <circle cx="-22" cy="-14" r="3.5" fill="#080404"/>
          <circle cx="22" cy="-14" r="3.5" fill="#080404"/>
          <circle cx="-19.5" cy="-16.5" r="2" fill="#fff"/>
          <circle cx="24.5" cy="-16.5" r="2" fill="#fff"/>
        </g>
        <!-- brows -->
        <path d="M-32 -30 Q-22 -34 -12 -30" stroke="${furDark}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M12 -30 Q22 -34 32 -30" stroke="${furDark}" stroke-width="3" fill="none" stroke-linecap="round"/>
        <!-- snout -->
        <ellipse cx="0" cy="14" rx="26" ry="20" fill="${cream}"/>
        <ellipse cx="0" cy="6" rx="14" ry="9" fill="#1a1416"/>
        <circle cx="3" cy="3" r="2" fill="#fff"/>
        ${mouth}
        <!-- collar -->
        <rect x="-40" y="55" width="80" height="9" fill="#c92e2e" rx="3"/>
        <circle cx="0" cy="68" r="6" fill="#d4b34a" stroke="#8a7430" stroke-width="1"/>
      </svg>
    </div>
  `;
}

function renderSpider(el, lv) {
  const size = 60 + lv.size * 240;
  el.innerHTML = `
    <svg viewBox="0 0 800 360" style="position:absolute;inset:0">
      <rect width="800" height="360" fill="#1f2937"/>
      <pattern id="wall" width="40" height="40" patternUnits="userSpaceOnUse">
        <rect width="40" height="40" fill="#1f2937"/>
        <rect x="0" y="0" width="40" height="2" fill="#0f172a"/>
        <rect x="0" y="0" width="2" height="40" fill="#0f172a"/>
      </pattern>
      <rect width="800" height="360" fill="url(#wall)" opacity=".5"/>
    </svg>
    <div class="creature" style="width:${size}px;height:${size}px">
      <svg viewBox="-100 -100 200 200" width="100%" height="100%">
        <!-- legs (4 each side) -->
        ${[-1,1].map(side => [-30,-15,15,30].map(off => `
          <path d="M${side*30} 0 Q${side*70} ${off-30} ${side*90} ${off}"
                stroke="#0a0a0a" stroke-width="6" fill="none" stroke-linecap="round"/>
        `).join("")).join("")}
        <!-- abdomen -->
        <ellipse cx="0" cy="20" rx="40" ry="55" fill="#0a0a0a"/>
        <ellipse cx="-12" cy="10" rx="6" ry="14" fill="#7f1d1d" opacity=".6"/>
        <ellipse cx="12" cy="10" rx="6" ry="14" fill="#7f1d1d" opacity=".6"/>
        <!-- head -->
        <circle cx="0" cy="-30" r="28" fill="#0a0a0a"/>
        <!-- eyes -->
        <circle cx="-10" cy="-35" r="4" fill="#fbbf24"/>
        <circle cx="10" cy="-35" r="4" fill="#fbbf24"/>
        <circle cx="-14" cy="-25" r="3" fill="#fbbf24"/>
        <circle cx="14" cy="-25" r="3" fill="#fbbf24"/>
      </svg>
    </div>
  `;
}

function renderEnclosed(el, lv) {
  const pct = 30 + lv.size * 60; // % size of room
  el.innerHTML = `<div class="room" style="width:${pct}%;height:${pct}%"></div>`;
}

function renderSnake(el, lv) {
  const size = 80 + lv.size * 240;
  // The snake is shown coiled on a path with grass alongside, matching
  // the 3D scene. Calmer green palette than the spider scene.
  el.innerHTML = `
    <svg viewBox="0 0 800 360" style="position:absolute;inset:0">
      <defs>
        <linearGradient id="snakeSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#a5c186"/>
          <stop offset="60%" stop-color="#82a061"/>
          <stop offset="100%" stop-color="#5e6b3a"/>
        </linearGradient>
      </defs>
      <rect width="800" height="360" fill="url(#snakeSky)"/>
      <!-- dirt path -->
      <path d="M 200 360 L 320 200 L 480 200 L 600 360 Z" fill="#8a6d40"/>
      <!-- grass tufts -->
      ${[100,160,640,720].map(x => `
        <path d="M${x} 320 l 4 -22 l 6 22 l 4 -28 l 6 28" stroke="#6d7a3a" stroke-width="2" fill="none"/>
      `).join("")}
      <!-- a few stones -->
      <ellipse cx="640" cy="290" rx="24" ry="10" fill="#6a6a5a"/>
      <ellipse cx="160" cy="305" rx="20" ry="8" fill="#6a6a5a"/>
    </svg>
    <div class="creature" style="width:${size}px;height:${size}px">
      <svg viewBox="-100 -100 200 200" width="100%" height="100%">
        <!-- coiled body — outer loop -->
        <ellipse cx="0" cy="30" rx="78" ry="28" fill="none" stroke="#4a6028" stroke-width="22" stroke-linecap="round"/>
        <!-- inner coil -->
        <ellipse cx="-10" cy="20" rx="50" ry="18" fill="none" stroke="#5b7032" stroke-width="18" stroke-linecap="round"/>
        <!-- belly markings -->
        <path d="M-70 30 Q-35 24 0 30 Q35 36 70 30" stroke="#c9c08a" stroke-width="6" fill="none" opacity="0.6"/>
        <!-- head (raised slightly off the coil) -->
        <ellipse cx="40" cy="-10" rx="22" ry="14" fill="#4a6028" transform="rotate(-12 40 -10)"/>
        <ellipse cx="40" cy="-10" rx="20" ry="12" fill="#5b7032" transform="rotate(-12 40 -10)" opacity="0.7"/>
        <!-- eyes (yellow with vertical pupil) -->
        <ellipse cx="50" cy="-15" rx="4" ry="3.5" fill="#ddd000"/>
        <ellipse cx="50" cy="-15" rx="1" ry="3" fill="#1a1a0a"/>
        <!-- forked tongue -->
        <path d="M62 -8 Q72 -6 78 -10 M62 -8 Q72 -10 78 -6" stroke="#ff5577" stroke-width="2" fill="none" stroke-linecap="round"/>
        <!-- subtle scale pattern (dots) -->
        ${Array.from({length:14},(_, i) => {
          const a = i * (Math.PI * 2 / 14);
          const x = Math.cos(a) * 65;
          const y = 30 + Math.sin(a) * 22;
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2" fill="#3a4a1c" opacity="0.5"/>`;
        }).join("")}
      </svg>
    </div>
  `;
}

// ---------- Icons (SVG) ----------
function heightsIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 21l5-9 4 6 4-12 5 15z" stroke="#7cd1c5"/></svg>`;
}
function waterIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2"><path d="M12 2 C 7 8, 4 12, 4 16 a 8 8 0 0 0 16 0 c 0-4 -3-8 -8 -14z"/></svg>`;
}
function dogIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="#7cd1c5"><path d="M4 9 L7 5 L9 7 L15 7 L17 5 L20 9 L20 15 Q20 20 12 20 Q4 20 4 15 Z"/><circle cx="9" cy="12" r="1.2" fill="#0b1020"/><circle cx="15" cy="12" r="1.2" fill="#0b1020"/></svg>`;
}
function spiderIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3" fill="#7cd1c5"/><path d="M12 9 L8 4 M12 9 L16 4 M12 15 L8 20 M12 15 L16 20 M9 12 L4 10 M9 12 L4 14 M15 12 L20 10 M15 12 L20 14"/></svg>`;
}
function roomIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2"><rect x="4" y="4" width="16" height="16"/><path d="M9 12 h 6"/></svg>`;
}
function planeIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="#7cd1c5"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 1 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1L15 22v-1.5L13 19v-5.5z"/></svg>`;
}
function syringeIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linecap="round"><path d="M3 21l3-3M5 19l5-5M14 14l-3 3M14 6l4 4M11 9l4 4M16 4l4 4"/></svg>`;
}
function snakeIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linecap="round"><path d="M4 18 Q8 14 12 18 T20 18 Q22 18 22 16 Q22 14 20 14"/><circle cx="20" cy="14" r="1" fill="#7cd1c5"/></svg>`;
}
function micIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 12 a7 7 0 0 0 14 0M12 19 v 3"/></svg>`;
}
function carIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 14 l1 -4 a2 2 0 0 1 2 -1 h8 a2 2 0 0 1 2 1 l1 4"/><rect x="3" y="14" width="18" height="5" rx="1"/><circle cx="7" cy="19" r="1.5" fill="#7cd1c5"/><circle cx="17" cy="19" r="1.5" fill="#7cd1c5"/></svg>`;
}
function stormIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10 a4 4 0 1 1 8 0 h2 a3 3 0 0 1 0 6 h-9 a3 3 0 0 1 0 -6 z"/><path d="M11 14 l-2 4 h3 l-2 4" stroke="#fbbf24" stroke-width="2" fill="none"/></svg>`;
}
function moonIcon() {
  return `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8 A8 8 0 1 1 11.2 3 a6 6 0 0 0 9.8 9.8z"/><circle cx="17" cy="6" r=".7" fill="#7cd1c5"/><circle cx="20" cy="9" r=".7" fill="#7cd1c5"/></svg>`;
}

// ---------- In-scene action / command icons (SVG) ----------
// These replace the emoji glyphs that used to label the scene command bars,
// achievement toasts, quick-bar pills and camera toggle. They follow the same
// convention as the phobia icons above (24×24 viewBox, 2px stroke, teal
// accent) but render at the size of their parent — every svg carries
// width="100%" height="100%" so the .cmd-icon CSS box controls the rendered
// size. One coherent icon set = "feels like a real game", not "prototype".
const C = "#7cd1c5";   // accent (matches --accent)
const CM = "#94a3b8";  // muted (matches --muted), for secondary detail
function _svg(inner) {
  return `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="${C}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
// --- Directions: a single arrow() helper draws clean strokes for every
// kind of step / look / lean / swap the command bars need. ---
function arrowIcon(dir) {
  const a = {
    // graph arrows (walk toward / away)
    right:  `<path d="M4 12h13"/><path d="M13 6l6 6-6 6"/>`,
    left:   `<path d="M20 12H7"/><path d="M11 6l-6 6 6 6"/>`,
    // diagonals (walk to edge / step back)
    "br":   `<path d="M7 17L17 7"/><path d="M9 7h8v8"/>`,
    "tl":   `<path d="M17 7L7 17"/><path d="M15 17H7V9"/>`,
    // verticals (look down / lean over)
    down:   `<path d="M12 4v13"/><path d="M6 11l6 6 6-6"/>`,
    up:     `<path d="M12 20V7"/><path d="M6 13l6-6 6 6"/>`,
    // swap / camera toggle (two-way)
    swap:   `<path d="M7 7h11l-3-3"/><path d="M17 17H6l3 3"/>`,
    // indicator (driving, left-then-right waggle)
    wag:    `<path d="M5 9l3 3-3 3"/><path d="M19 9l-3 3 3 3"/><path d="M8 12h8"/>`,
    // u-turn (step back / retreat)
    back:   `<path d="M19 9v5a4 4 0 0 1-4 4H7"/><path d="M10 7L7 9l3 3"/>`,
  };
  return _svg(a[dir] || a.right);
}
// --- Actions (deduplicated across all 12 scenes) ---
const iconPaw       = () => _svg(`<circle cx="7" cy="8" r="1.6"/><circle cx="11" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="18.5" cy="8.5" r="1.6"/><path d="M12 11c-3 0-5 2.5-5 5 0 2 1.8 3 4 3h2c2.2 0 4-1 4-3 0-2.5-2-5-5-5z"/>`);
const iconBall      = () => _svg(`<circle cx="12" cy="12" r="8"/><path d="M4 12c4 2 12 2 16 0M12 4c2 4 2 12 0 16"/>`);
const iconBone      = () => _svg(`<path d="M6 7a2.2 2.2 0 1 0-2.2 2.2 2.2 2.2 0 1 0 2.2 2.2v0a2.2 2.2 0 1 0 2.2-2.2A2.2 2.2 0 1 0 6 7z" transform="rotate(45 6 7)"/><path d="M9.5 9.5l5 5"/><path d="M18 17a2.2 2.2 0 1 0 2.2-2.2 2.2 2.2 0 1 0-2.2-2.2v0a2.2 2.2 0 1 0-2.2 2.2A2.2 2.2 0 1 0 18 17z" transform="rotate(45 18 17)"/>`);
const iconWave      = () => _svg(`<path d="M5 14v-2a2 2 0 1 1 4 0v3"/><path d="M9 13V8a2 2 0 1 1 4 0v6"/><path d="M13 10a2 2 0 1 1 4 0v6a5 5 0 0 1-5 5h-2a4 4 0 0 1-3-1.5L4 16"/>`);
const iconCoin      = () => _svg(`<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4"/>`);
const iconSplash    = () => _svg(`<path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/><path d="M8 16c-1 1-2 1-3 0M16 16c1 1 2 1 3 0"/>`);
const iconJar       = () => _svg(`<path d="M7 7h10v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/><path d="M6 7h12"/><path d="M8 7V5h8v2"/><path d="M7 11h10"/>`);
const iconWindow    = () => _svg(`<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M12 4v16M4 12h16"/>`);
const iconHands     = () => _svg(`<path d="M8 11V6a1.5 1.5 0 0 1 3 0v4"/><path d="M11 10V5a1.5 1.5 0 0 1 3 0v5"/><path d="M14 10V7a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6 4 4 0 0 1-4-4v-1l-2-2a1.4 1.4 0 0 1 2-2l1 1"/>`);
const iconTray      = () => _svg(`<rect x="3" y="13" width="18" height="3" rx="1"/><path d="M5 13l1.5-4a2 2 0 0 1 1.9-1.4h7.2a2 2 0 0 1 1.9 1.4L19 13"/><path d="M3 16v1a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-1"/>`);
const iconLungs     = () => _svg(`<path d="M12 3v8"/><path d="M9 11c0 3-1 4-3 5-1.5.8-2 2-2 3.5C4 21 5 21 6 21c2 0 3-2 3-5"/><path d="M15 11c0 3 1 4 3 5 1.5.8 2 2 2 3.5 0 1.5-1 1.5-2 1.5-2 0-3-2-3-5"/><path d="M9 8c0-1 1.3-2 3-2s3 1 3 2"/>`);
const iconMic       = () => _svg(`<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 12a7 7 0 0 0 14 0M12 19v3"/>`);
const iconDrop      = () => _svg(`<path d="M12 3c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z"/>`);
const iconNotes     = () => _svg(`<path d="M5 4h11l3 3v13H5z"/><path d="M8 9h7M8 13h7M8 17h4"/>`);
const iconDoor      = () => _svg(`<path d="M6 21V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v17"/><path d="M4 21h14"/><circle cx="13" cy="12" r="1" fill="${C}"/>`);
const iconHand      = () => _svg(`<path d="M7 11V6a1.5 1.5 0 0 1 3 0v4"/><path d="M10 10V5a1.5 1.5 0 0 1 3 0v5"/><path d="M13 10V7a1.5 1.5 0 0 1 3 0v6a6 6 0 0 1-6 6 4 4 0 0 1-4-4v-1l-2-2a1.4 1.4 0 0 1 2-2l1 1"/>`);
const iconBulb      = () => _svg(`<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4 10c.8.8 1 1.5 1 3h6c0-1.5.2-2.2 1-3a6 6 0 0 0-4-10z"/>`);
const iconEye       = () => _svg(`<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>`);
const iconEyeOff    = () => _svg(`<path d="M4 4l16 16"/><path d="M9.5 9.6A3 3 0 0 0 12 15a3 3 0 0 0 2.4-1.2"/><path d="M6.5 6.7C3.8 8.4 2 12 2 12s3.5 7 10 7c1.6 0 3-.3 4.2-.8M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-2.2 3"/>`);
const iconBandage   = () => _svg(`<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="M9 11v2M12 9v4M15 11v2" transform="rotate(-45 12 12)"/>`);
const iconLotus     = () => _svg(`<path d="M12 13c-2 0-4-1-4-3 0-2 2-4 4-4s4 2 4 4c0 2-2 3-4 3z"/><path d="M5 14c-1 0-2-1-2-2 0-2 2-3 4-3"/><path d="M19 14c1 0 2-1 2-2 0-2-2-3-4-3"/><path d="M12 21c-3 0-5-2-5-5 0-1 .5-2 1-3M12 21c3 0 5-2 5-5 0-1-.5-2-1-3"/>`);
const iconLeaf      = () => _svg(`<path d="M5 19c0-8 5-13 14-13 0 9-5 14-14 13z"/><path d="M9 15c2-3 4-5 7-6"/>`);
const iconMirror    = () => _svg(`<rect x="5" y="3" width="14" height="16" rx="7"/><path d="M12 19v3"/>`);
const iconBrake     = () => _svg(`<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 4v3M12 17v3M4 12h3M17 12h3"/>`);
const iconCounter   = () => _svg(`<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h2M14 8h2M8 13h2M14 13h2M8 18h2M14 18h2"/>`);
const iconHouse     = () => _svg(`<path d="M4 11l8-6 8 6"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/>`);
const iconCandle    = () => _svg(`<path d="M12 3c1 1.5 1 2.5 0 4-1-1.5-1-2.5 0-4z"/><path d="M8 21v-6a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v6z"/><path d="M7 21h10"/>`);
const iconFlash     = () => _svg(`<path d="M9 3h6l-1 5h3l-8 13 2-9H7z"/>`);
const iconMatch     = () => _svg(`<path d="M6 3c1 2 1 3 0 5 2-1 3-1 5 0-1-2-1-3 0-5-2 1-3 1-5 0z"/><path d="M9 8l8 12"/>`);
const iconFocus     = () => _svg(`<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L21 21"/>`);
const iconPause     = () => _svg(`<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>`);
const iconSpark     = () => _svg(`<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="M12 8c1 2 2 3 4 4-2 1-3 2-4 4-1-2-2-3-4-4 2-1 3-2 4-4z"/>`);
const iconPeak      = () => _svg(`<path d="M3 20l5-11 4 6 3-5 6 10z"/>`);
const iconChute     = () => _svg(`<path d="M21 11a9 9 0 0 0-18 0z"/><path d="M3 11l4 4 5-4 5 4 4-4"/><path d="M12 11v9"/>`);
const iconPawFriend = () => _svg(`<circle cx="8" cy="7" r="1.4"/><circle cx="12" cy="5.5" r="1.4"/><circle cx="16" cy="7" r="1.4"/><path d="M12 10c-2.5 0-4 2-4 4 0 1.5 1.5 2.5 3 2.5h2c1.5 0 3-1 3-2.5 0-2-1.5-4-4-4z"/><path d="M18 14l3-1-1 3 2 1-3 1"/>`);
const iconShake     = () => _svg(`<path d="M9 11l-3 3a2 2 0 0 0 3 3l3-3"/><path d="M13 8l3-3a2 2 0 0 1 3 3l-6 6"/><path d="M7 15l-2 4M17 9l2-4"/>`);
const iconMedal     = () => _svg(`<circle cx="12" cy="14" r="6"/><path d="M12 12.5l1 2h2l-1.6 1.3.6 1.9-2-1.3-2 1.3.6-1.9L9 14.5h2z" fill="${C}"/><path d="M8 9l-2-5M16 9l2-5"/>`);
// Muted variants for the quick-bar pills (voice / audio) — these sit in the
// scene corner and read better at lower contrast than the action glyphs.
const iconVoiceOn   = () => _svg(`<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a3 3 0 0 1 0 6"/><path d="M18.5 6.5a7 7 0 0 1 0 11"/>`);
const iconVoiceOff  = () => _svg(`<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a3 3 0 0 1 0 6"/><path d="M3 3l18 18"/>`);
const iconSoundOn   = () => _svg(`<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 8a5 5 0 0 1 0 8"/><path d="M19.5 5.5a9 9 0 0 1 0 13"/>`);
const iconSoundOff  = () => _svg(`<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 8a5 5 0 0 1 0 8"/><path d="M3 3l18 18"/>`);

// ---------- Phobia scene thumbnails ----------
// Larger, richer SVG scene-sketches used on the home page showcase. Each one
// gives a sense of the phobia at a glance — the visual hook that the icon
// alone can't carry.
function phobiaThumbnail(key) {
  // Cleaner, more polished thumbnail illustrations. Each uses:
  //   - layered gradients for atmospheric depth (sky, ground, fog)
  //   - one clear focal point silhouetted against contrast
  //   - subtle texture / atmospheric haze
  //   - consistent dimensions (200×120) and cinematic 5:3 aspect ratio
  // The visual language matches across cards: dawn/dusk gradients,
  // soft glows, gentle vignettes — so the showcase reads as ONE product.
  const T = {
    heights: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="hSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#1a2547"/>
          <stop offset=".4" stop-color="#3a4a78"/>
          <stop offset=".75" stop-color="#c89a8a"/>
          <stop offset="1" stop-color="#e8c8a8"/>
        </linearGradient>
        <linearGradient id="hCity" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#0a0e1a"/>
          <stop offset="1" stop-color="#1a2235"/>
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#hSky)"/>
      <circle cx="155" cy="55" r="10" fill="#ffe4b8" opacity=".75"/>
      <circle cx="155" cy="55" r="20" fill="#ffe4b8" opacity=".18"/>
      <!-- city silhouette layered for depth -->
      <g fill="url(#hCity)" opacity=".55">
        <rect x="0" y="78" width="14" height="42"/>
        <rect x="14" y="84" width="18" height="36"/>
        <rect x="32" y="76" width="12" height="44"/>
        <rect x="170" y="80" width="16" height="40"/>
        <rect x="186" y="86" width="14" height="34"/>
      </g>
      <g fill="url(#hCity)">
        <rect x="40" y="62" width="22" height="58"/>
        <rect x="64" y="72" width="16" height="48"/>
        <rect x="82" y="50" width="24" height="70"/>
        <rect x="108" y="68" width="18" height="52"/>
        <rect x="128" y="58" width="22" height="62"/>
        <rect x="152" y="74" width="16" height="46"/>
      </g>
      ${[
        [46,68],[52,76],[58,68],[88,58],[94,66],[100,78],[112,76],[136,68],[136,80],[144,74]
      ].map(([x,y]) => `<rect x="${x}" y="${y}" width="2" height="3" fill="#ffe089" opacity=".9"/>`).join("")}
      <!-- railing in foreground (the user's perspective) -->
      <line x1="0" y1="100" x2="200" y2="100" stroke="#aab2bf" stroke-width="1.5" opacity=".8"/>
      <line x1="0" y1="108" x2="200" y2="108" stroke="#aab2bf" stroke-width="1" opacity=".5"/>
      ${[20, 60, 100, 140, 180].map(x => `<line x1="${x}" y1="100" x2="${x}" y2="120" stroke="#aab2bf" stroke-width="1.2" opacity=".7"/>`).join("")}
    </svg>`,

    water: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="wSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#fce6c8"/>
          <stop offset=".5" stop-color="#a8c8e0"/>
          <stop offset="1" stop-color="#5a8aa8"/>
        </linearGradient>
        <linearGradient id="wSea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#3a7898"/>
          <stop offset=".6" stop-color="#1a4258"/>
          <stop offset="1" stop-color="#082030"/>
        </linearGradient>
      </defs>
      <rect width="200" height="60" fill="url(#wSky)"/>
      <rect y="60" width="200" height="60" fill="url(#wSea)"/>
      <!-- low sun + reflection on horizon -->
      <circle cx="155" cy="50" r="8" fill="#ffd098" opacity=".95"/>
      <ellipse cx="155" cy="60" rx="14" ry="2" fill="#ffd098" opacity=".4"/>
      <!-- distant headland -->
      <path d="M0 58 Q40 52, 80 58 L80 60 L0 60 Z" fill="#2a3550" opacity=".6"/>
      <path d="M120 58 Q160 53, 200 58 L200 60 L120 60 Z" fill="#2a3550" opacity=".6"/>
      <!-- water ripples -->
      <path d="M0 70 Q25 67, 50 70 T100 70 T150 70 T200 70" fill="none" stroke="#7cd1c5" stroke-width=".8" opacity=".7"/>
      <path d="M0 84 Q30 81, 60 84 T120 84 T200 84" fill="none" stroke="#a5b4fc" stroke-width=".7" opacity=".55"/>
      <path d="M0 100 Q35 97, 70 100 T140 100 T200 100" fill="none" stroke="#7cd1c5" stroke-width=".6" opacity=".4"/>
      <!-- sun reflection shimmer -->
      <ellipse cx="155" cy="74" rx="3" ry=".6" fill="#ffd098" opacity=".6"/>
      <ellipse cx="155" cy="86" rx="5" ry=".7" fill="#ffd098" opacity=".4"/>
      <ellipse cx="155" cy="100" rx="7" ry=".8" fill="#ffd098" opacity=".25"/>
    </svg>`,

    dogs: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="dgRoom" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#f4d8b8"/>
          <stop offset="1" stop-color="#c8a880"/>
        </linearGradient>
        <radialGradient id="dgSun" cx=".15" cy=".2" r=".5">
          <stop offset="0" stop-color="#fff4d8" stop-opacity=".8"/>
          <stop offset="1" stop-color="#fff4d8" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="200" height="120" fill="url(#dgRoom)"/>
      <rect width="200" height="120" fill="url(#dgSun)"/>
      <!-- floor -->
      <rect y="80" width="200" height="40" fill="#a07050"/>
      <rect y="80" width="200" height="3" fill="#806040"/>
      <!-- window frame upper-left -->
      <rect x="14" y="14" width="36" height="32" fill="#88c0e0" opacity=".55"/>
      <line x1="32" y1="14" x2="32" y2="46" stroke="#7a5a3a" stroke-width="1.4"/>
      <line x1="14" y1="30" x2="50" y2="30" stroke="#7a5a3a" stroke-width="1.4"/>
      <rect x="12" y="12" width="40" height="36" fill="none" stroke="#5a4028" stroke-width="2"/>
      <!-- dog body — golden retriever silhouette -->
      <ellipse cx="118" cy="84" rx="38" ry="18" fill="#c89060"/>
      <ellipse cx="118" cy="80" rx="34" ry="13" fill="#d8a070"/>
      <!-- legs -->
      <rect x="92" y="86" width="8" height="14" fill="#a87850" rx="2"/>
      <rect x="108" y="86" width="8" height="14" fill="#a87850" rx="2"/>
      <rect x="128" y="86" width="8" height="14" fill="#a87850" rx="2"/>
      <rect x="142" y="86" width="8" height="14" fill="#a87850" rx="2"/>
      <!-- head -->
      <ellipse cx="148" cy="68" rx="20" ry="18" fill="#d8a070"/>
      <!-- ears -->
      <ellipse cx="138" cy="58" rx="8" ry="14" fill="#a87850" transform="rotate(-12 138 58)"/>
      <ellipse cx="160" cy="58" rx="8" ry="14" fill="#a87850" transform="rotate(15 160 58)"/>
      <!-- snout -->
      <ellipse cx="160" cy="74" rx="9" ry="6" fill="#e8b48a"/>
      <ellipse cx="166" cy="73" rx="2.5" ry="2" fill="#1a1010"/>
      <!-- eye -->
      <circle cx="152" cy="65" r="2.2" fill="#1a1010"/>
      <circle cx="152.5" cy="64.5" r=".7" fill="#fff"/>
      <!-- collar -->
      <ellipse cx="148" cy="85" rx="14" ry="3" fill="#c92e2e"/>
      <circle cx="148" cy="86" r="1.5" fill="#ddc060"/>
      <!-- tail wagging -->
      <path d="M82 78 Q70 72, 76 62" stroke="#c89060" stroke-width="6" fill="none" stroke-linecap="round"/>
    </svg>`,

    spiders: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="spGlow" cx=".5" cy=".5" r=".55">
          <stop offset="0" stop-color="#2a2a32"/>
          <stop offset="1" stop-color="#0a0a10"/>
        </radialGradient>
      </defs>
      <rect width="200" height="120" fill="url(#spGlow)"/>
      <!-- web — radial + concentric -->
      ${[0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, 5*Math.PI/4, 3*Math.PI/2, 7*Math.PI/4].map(a => `<line x1="100" y1="60" x2="${100 + Math.cos(a)*100}" y2="${60 + Math.sin(a)*100}" stroke="#3a3a45" stroke-width=".6" opacity=".6"/>`).join("")}
      ${[18, 32, 48, 65, 82].map(r => `<circle cx="100" cy="60" r="${r}" fill="none" stroke="#3a3a45" stroke-width=".5" opacity=".55"/>`).join("")}
      <!-- spider body — abdomen + head -->
      <ellipse cx="100" cy="68" rx="13" ry="16" fill="#0a0a0e"/>
      <ellipse cx="100" cy="68" rx="13" ry="16" fill="url(#spGlow)" opacity=".5"/>
      <!-- subtle markings on abdomen -->
      <path d="M97 60 L100 75 L103 60" stroke="#5a3a2a" stroke-width="1.2" fill="none" opacity=".7"/>
      <ellipse cx="100" cy="48" rx="9" ry="8" fill="#0a0a0e"/>
      <!-- legs (8) -->
      ${[-1,1].map(s => [
        `M${100 + s*7},${52} Q${100 + s*30},${42} ${100 + s*44},${52}`,
        `M${100 + s*8},${58} Q${100 + s*32},${56} ${100 + s*48},${66}`,
        `M${100 + s*8},${66} Q${100 + s*32},${72} ${100 + s*48},${82}`,
        `M${100 + s*7},${74} Q${100 + s*28},${88} ${100 + s*42},${100}`,
      ].map(d => `<path d="${d}" stroke="#0a0a0e" stroke-width="2.2" fill="none" stroke-linecap="round"/>`).join("")).join("")}
      <!-- eyes -->
      <circle cx="96" cy="46" r="1.6" fill="#fbbf24"/>
      <circle cx="104" cy="46" r="1.6" fill="#fbbf24"/>
      <circle cx="98" cy="50" r=".9" fill="#fbbf24" opacity=".7"/>
      <circle cx="102" cy="50" r=".9" fill="#fbbf24" opacity=".7"/>
    </svg>`,

    enclosed: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="enWall" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#4a4c52"/>
          <stop offset="1" stop-color="#1a1c20"/>
        </linearGradient>
        <radialGradient id="enLight" cx=".5" cy=".18" r=".35">
          <stop offset="0" stop-color="#ffe4b0" stop-opacity=".7"/>
          <stop offset="1" stop-color="#ffe4b0" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="200" height="120" fill="url(#enWall)"/>
      <!-- vanishing-point perspective box (1-point) -->
      <polygon points="0,0 200,0 140,40 60,40" fill="#2a2c34" opacity=".85"/>
      <polygon points="0,120 200,120 140,80 60,80" fill="#2a2c34" opacity=".85"/>
      <polygon points="0,0 60,40 60,80 0,120" fill="#15171c"/>
      <polygon points="200,0 140,40 140,80 200,120" fill="#15171c"/>
      <!-- back wall -->
      <rect x="60" y="40" width="80" height="40" fill="#3a3c44"/>
      <!-- ceiling light -->
      <rect width="200" height="120" fill="url(#enLight)"/>
      <circle cx="100" cy="22" r="5" fill="#fff5d8" opacity=".85"/>
      <!-- door at the back -->
      <rect x="92" y="52" width="16" height="28" fill="#5a3a20"/>
      <rect x="92" y="52" width="16" height="28" fill="none" stroke="#704a30" stroke-width=".8"/>
      <circle cx="105" cy="68" r="1" fill="#ddc060"/>
      <!-- subtle floor lines for depth -->
      <line x1="0" y1="120" x2="60" y2="80" stroke="#0a0a0e" stroke-width=".4" opacity=".6"/>
      <line x1="200" y1="120" x2="140" y2="80" stroke="#0a0a0e" stroke-width=".4" opacity=".6"/>
    </svg>`,

    flying: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="flSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#1a2547"/>
          <stop offset=".5" stop-color="#5a7898"/>
          <stop offset="1" stop-color="#c8d8e8"/>
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#flSky)"/>
      <!-- soft cloud layers -->
      <ellipse cx="40" cy="50" rx="30" ry="6" fill="#fff" opacity=".35"/>
      <ellipse cx="120" cy="62" rx="40" ry="7" fill="#fff" opacity=".40"/>
      <ellipse cx="170" cy="42" rx="22" ry="5" fill="#fff" opacity=".30"/>
      <ellipse cx="80" cy="78" rx="50" ry="6" fill="#fff" opacity=".25"/>
      <!-- airplane silhouette -->
      <g fill="#cdd6e0">
        <!-- fuselage -->
        <ellipse cx="100" cy="80" rx="60" ry="6"/>
        <!-- main wings -->
        <path d="M70 80 L40 92 L80 86 Z"/>
        <path d="M130 80 L160 92 L120 86 Z"/>
        <!-- tail -->
        <path d="M158 76 L168 70 L162 80 Z"/>
        <!-- vertical fin -->
        <path d="M152 80 L160 70 L156 80 Z"/>
      </g>
      <!-- windows -->
      ${[68, 78, 88, 98, 108, 118, 128].map(x => `<rect x="${x}" y="78" width="3" height="3" fill="#1a2235" rx=".5"/>`).join("")}
      <!-- engine pod -->
      <ellipse cx="76" cy="86" rx="6" ry="2.5" fill="#5a6878"/>
      <ellipse cx="124" cy="86" rx="6" ry="2.5" fill="#5a6878"/>
      <!-- contrails -->
      <path d="M40 80 Q20 78, 0 84" stroke="#fff" stroke-width="1" fill="none" opacity=".5"/>
      <path d="M40 92 Q20 90, 0 96" stroke="#fff" stroke-width="1" fill="none" opacity=".4"/>
    </svg>`,

    needles: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="ndBg" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#f0f4f8"/>
          <stop offset="1" stop-color="#cdd6e0"/>
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#ndBg)"/>
      <!-- examination table edge -->
      <rect y="86" width="200" height="34" fill="#a8b4c0"/>
      <rect y="86" width="200" height="2" fill="#7a8a9a"/>
      <!-- syringe (clean medical illustration) -->
      <g transform="translate(20 50)">
        <!-- plunger handle (left) -->
        <rect x="0" y="6" width="6" height="14" fill="#4a5260" rx="1"/>
        <rect x="-2" y="2" width="10" height="6" fill="#4a5260" rx="1"/>
        <!-- barrel -->
        <rect x="6" y="4" width="80" height="18" rx="3" fill="#f4f8fc" stroke="#7a8a9a" stroke-width=".8"/>
        <!-- liquid inside (teal accent) -->
        <rect x="9" y="7" width="50" height="12" fill="#7cd1c5" opacity=".55" rx="1"/>
        <!-- graduation marks -->
        ${[10, 22, 34, 46, 58, 70].map(x => `<line x1="${6+x}" y1="6" x2="${6+x}" y2="9" stroke="#7a8a9a" stroke-width=".6"/>`).join("")}
        <!-- finger flanges -->
        <rect x="84" y="0" width="3" height="26" fill="#4a5260" rx=".5"/>
        <!-- needle hub -->
        <polygon points="86,10 96,12 96,14 86,16" fill="#9aa3ad"/>
        <!-- needle shaft -->
        <rect x="96" y="12" width="55" height="2" fill="#a8b0bc"/>
        <!-- needle tip -->
        <polygon points="151,12 158,13 151,14" fill="#5a6470"/>
        <!-- single drop at tip -->
        <circle cx="160" cy="13" r="1.4" fill="#7cd1c5" opacity=".7"/>
      </g>
      <!-- subtle medical cross watermark -->
      <g opacity=".06" transform="translate(160 14)">
        <rect x="6" y="0" width="6" height="20" fill="#1a2238"/>
        <rect x="0" y="6" width="20" height="6" fill="#1a2238"/>
      </g>
    </svg>`,

    snakes: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="snGrass" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#a8c08a"/>
          <stop offset=".6" stop-color="#5a7c48"/>
          <stop offset="1" stop-color="#2a3d22"/>
        </linearGradient>
        <linearGradient id="snBody" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#7a8c44"/>
          <stop offset="1" stop-color="#3a4a20"/>
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#snGrass)"/>
      <!-- dappled sunlight -->
      <ellipse cx="40" cy="30" rx="38" ry="14" fill="#fce0a8" opacity=".25"/>
      <ellipse cx="160" cy="20" rx="34" ry="10" fill="#fce0a8" opacity=".18"/>
      <!-- dirt path -->
      <path d="M0 90 Q50 78, 100 86 T200 92 L200 120 L0 120 Z" fill="#806040" opacity=".75"/>
      <path d="M0 92 Q50 80, 100 88 T200 94" stroke="#5a4028" stroke-width=".8" fill="none" opacity=".5"/>
      <!-- grass blades scattered -->
      ${[15, 28, 42, 55, 145, 168, 182].map(x => `<line x1="${x}" y1="${85 + (x%9)}" x2="${x+2}" y2="${75 + (x%9)}" stroke="#4a6028" stroke-width="1.5" opacity=".7"/>`).join("")}
      <!-- snake body — sinuous coil -->
      <path d="M30 84 Q60 70, 90 82 T140 78 Q160 76, 168 70" stroke="url(#snBody)" stroke-width="9" fill="none" stroke-linecap="round"/>
      <path d="M30 84 Q60 70, 90 82 T140 78 Q160 76, 168 70" stroke="#a0b070" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>
      <!-- diamond pattern dashes -->
      ${[40, 56, 72, 92, 108, 130, 148].map((x,i) => `<circle cx="${x}" cy="${82 - (i%2)*4}" r="2" fill="#2a3618" opacity=".7"/>`).join("")}
      <!-- head -->
      <ellipse cx="170" cy="68" rx="6" ry="4" fill="#3a4a20"/>
      <path d="M173 67 L178 65 L177 68 L181 67" stroke="#3a4a20" stroke-width="1.2" fill="none"/>
      <!-- eye + tongue -->
      <circle cx="173" cy="67" r="1" fill="#ddd000"/>
      <path d="M176 69 L180 70 L184 69" stroke="#c92e2e" stroke-width="1" fill="none" stroke-linecap="round"/>
    </svg>`,

    speaking: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="spkLight" cx=".5" cy=".15" r=".55">
          <stop offset="0" stop-color="#ffe4b0" stop-opacity=".5"/>
          <stop offset="1" stop-color="#0c0e1a" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="200" height="120" fill="#0c0e1a"/>
      <!-- spotlight -->
      <rect width="200" height="120" fill="url(#spkLight)"/>
      <!-- stage floor -->
      <rect y="92" width="200" height="28" fill="#3a2818"/>
      <rect y="92" width="200" height="2" fill="#5a3828"/>
      <!-- back curtain -->
      <rect y="0" width="200" height="92" fill="#1a1f2a" opacity=".6"/>
      ${[10, 30, 50, 70, 130, 150, 170, 190].map(x => `<rect x="${x}" y="0" width="2" height="92" fill="#0a0e1a" opacity=".5"/>`).join("")}
      <!-- lectern -->
      <polygon points="92,55 108,55 110,92 90,92" fill="#3a2818"/>
      <rect x="86" y="52" width="28" height="6" fill="#4a3528" rx="1"/>
      <!-- microphone -->
      <line x1="100" y1="52" x2="100" y2="38" stroke="#222" stroke-width="1.4"/>
      <ellipse cx="100" cy="36" rx="3" ry="4" fill="#3a3a44"/>
      <ellipse cx="100" cy="35" rx="2.2" ry="3" fill="#222"/>
      <!-- audience silhouettes (depth-based sizes) -->
      ${[
        [25,86,5],[42,84,5.5],[60,86,5],[78,85,5.2],
        [122,85,5.2],[140,86,5],[158,84,5.5],[175,86,5]
      ].map(([x,y,r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#1a1f2a"/><rect x="${x-r-2}" y="${y+2}" width="${(r+2)*2}" height="20" fill="#1a1f2a" rx="3"/>`).join("")}
      <!-- water glass on lectern -->
      <rect x="98" y="48" width="4" height="6" fill="#7cd1c5" opacity=".6" rx=".5"/>
    </svg>`,

    driving: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="drvSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#88a8c8"/>
          <stop offset="1" stop-color="#445a78"/>
        </linearGradient>
        <linearGradient id="drvRoad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#3a4458"/>
          <stop offset="1" stop-color="#1a1d22"/>
        </linearGradient>
      </defs>
      <rect width="200" height="50" fill="url(#drvSky)"/>
      <rect y="50" width="200" height="70" fill="url(#drvRoad)"/>
      <!-- horizon haze -->
      <rect y="46" width="200" height="8" fill="#fce0a8" opacity=".25"/>
      <!-- road perspective lines -->
      <polygon points="100,50 60,120 30,120 90,50" fill="#202428"/>
      <polygon points="100,50 140,120 170,120 110,50" fill="#202428"/>
      <!-- center lane dashes -->
      <rect x="98" y="56" width="4" height="6" fill="#fce098"/>
      <rect x="96" y="68" width="6" height="9" fill="#fce098"/>
      <rect x="93" y="84" width="9" height="13" fill="#fce098"/>
      <rect x="89" y="104" width="13" height="16" fill="#fce098"/>
      <!-- distant traffic -->
      <rect x="86" y="48" width="6" height="3" fill="#5a3a3a"/>
      <circle cx="87" cy="48.5" r=".7" fill="#ff5050" opacity=".9"/>
      <circle cx="91" cy="48.5" r=".7" fill="#ff5050" opacity=".9"/>
      <!-- dashboard silhouette -->
      <path d="M0 110 Q50 96, 100 96 Q150 96, 200 110 L200 120 L0 120 Z" fill="#0a0d12"/>
      <!-- steering wheel -->
      <ellipse cx="100" cy="118" rx="48" ry="8" fill="none" stroke="#202428" stroke-width="3"/>
      <ellipse cx="100" cy="118" rx="48" ry="8" fill="#0a0d12"/>
      <ellipse cx="100" cy="118" rx="42" ry="6" fill="none" stroke="#3a3e44" stroke-width="1.2"/>
      <!-- steering wheel hub -->
      <circle cx="100" cy="118" r="4" fill="#3a3e44"/>
      <line x1="100" y1="114" x2="100" y2="122" stroke="#202428" stroke-width="1.5"/>
      <!-- rear-view mirror -->
      <rect x="92" y="14" width="16" height="6" fill="#0a0d12" rx="1"/>
      <rect x="93" y="15" width="14" height="4" fill="#3a4458"/>
    </svg>`,

    storms: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="stSky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color="#1a2030"/>
          <stop offset="1" stop-color="#3a4258"/>
        </linearGradient>
      </defs>
      <rect width="200" height="120" fill="url(#stSky)"/>
      <!-- layered storm clouds -->
      <ellipse cx="40" cy="32" rx="38" ry="14" fill="#1a1f2a"/>
      <ellipse cx="100" cy="25" rx="48" ry="13" fill="#262d3c"/>
      <ellipse cx="160" cy="32" rx="36" ry="12" fill="#1a1f2a"/>
      <ellipse cx="70" cy="40" rx="30" ry="10" fill="#15182a" opacity=".8"/>
      <ellipse cx="140" cy="42" rx="32" ry="11" fill="#15182a" opacity=".8"/>
      <!-- lightning bolt — bright, layered glow -->
      <g>
        <polygon points="92,42 80,68 95,68 78,98 100,72 86,72 96,52" fill="#fff" opacity=".25"/>
        <polygon points="92,44 82,68 94,68 80,96 98,72 88,72 96,54" fill="#fde68a"/>
        <polygon points="92,44 82,68 94,68 80,96 98,72 88,72 96,54" fill="#fff" opacity=".55" transform="scale(.9 .95) translate(10 4)"/>
      </g>
      <!-- heavy rain streaks -->
      ${Array.from({length: 30}).map((_,i) => {
        const x = (i * 7 + 5) % 200;
        const y = 50 + (i*11 % 60);
        return `<line x1="${x}" y1="${y}" x2="${x-3}" y2="${y+10}" stroke="#a8b8c8" stroke-width=".7" opacity=".55"/>`;
      }).join("")}
      <!-- window frame around the view -->
      <rect x="0" y="0" width="200" height="6" fill="#1a1d22"/>
      <rect x="0" y="114" width="200" height="6" fill="#1a1d22"/>
      <rect x="0" y="0" width="6" height="120" fill="#1a1d22"/>
      <rect x="194" y="0" width="6" height="120" fill="#1a1d22"/>
      <rect x="98" y="6" width="4" height="108" fill="#1a1d22"/>
      <rect x="6" y="58" width="188" height="4" fill="#1a1d22"/>
    </svg>`,

    dark: `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="dkMoon" cx=".5" cy=".5" r=".5">
          <stop offset="0" stop-color="#fce6c8" stop-opacity="1"/>
          <stop offset=".7" stop-color="#fce6c8" stop-opacity=".3"/>
          <stop offset="1" stop-color="#fce6c8" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="dkRoom" cx=".5" cy=".55" r=".7">
          <stop offset="0" stop-color="#1a1f2a"/>
          <stop offset="1" stop-color="#05060a"/>
        </radialGradient>
      </defs>
      <rect width="200" height="120" fill="url(#dkRoom)"/>
      <!-- moon through window -->
      <rect x="20" y="14" width="44" height="40" fill="#0a1020" stroke="#2a2c34" stroke-width="1.5"/>
      <line x1="42" y1="14" x2="42" y2="54" stroke="#2a2c34" stroke-width="1"/>
      <line x1="20" y1="34" x2="64" y2="34" stroke="#2a2c34" stroke-width="1"/>
      <circle cx="50" cy="28" r="14" fill="url(#dkMoon)"/>
      <circle cx="50" cy="28" r="7" fill="#fce6c8" opacity=".95"/>
      <circle cx="53" cy="26" r="5.5" fill="#0a1020" opacity=".25"/>
      <!-- furniture silhouettes -->
      <rect x="100" y="78" width="40" height="32" fill="#0a0e16"/>
      <rect x="100" y="78" width="40" height="3" fill="#1a1f2a"/>
      <rect x="150" y="84" width="36" height="28" fill="#0a0e16"/>
      <!-- floor — slight gradient toward viewer -->
      <rect y="108" width="200" height="12" fill="#05060a"/>
      <!-- ambient stars through the window -->
      <circle cx="36" cy="42" r=".7" fill="#fff" opacity=".7"/>
      <circle cx="60" cy="22" r=".5" fill="#fff" opacity=".5"/>
      <circle cx="58" cy="48" r=".6" fill="#fff" opacity=".6"/>
      <!-- soft moonlight wash on the floor -->
      <ellipse cx="60" cy="100" rx="32" ry="4" fill="#fce6c8" opacity=".10"/>
    </svg>`,
  };
  return T[key] || phobiaIconForFallback(key);
}

function phobiaIconForFallback(key) {
  const p = PHOBIAS[key];
  return p ? `<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="120" fill="var(--panel-3)"/><g transform="translate(84 44) scale(1.3)">${p.icon.replace(/<svg[^>]*>|<\/svg>/g, "")}</g></svg>` : "";
}

// SVG fallback renderers for the new phobias (used only if 3D fails)
function renderFlying(el, lv) {
  el.innerHTML = `<div style="color:#94a3b8;padding:30px;text-align:center;">Flying scene — 3D loading…</div>`;
}
function renderNeedles(el, lv) {
  el.innerHTML = `<div style="color:#94a3b8;padding:30px;text-align:center;">Needles scene — 3D loading…</div>`;
}
function renderSpeaking(el, lv) {
  el.innerHTML = `<div style="color:#94a3b8;padding:30px;text-align:center;">Speaking scene — 3D loading…</div>`;
}
function renderDriving(el, lv)  { el.innerHTML = `<div style="color:#94a3b8;padding:30px;text-align:center;">Driving scene — 3D loading…</div>`; }
function renderStorms(el, lv)   { el.innerHTML = `<div style="color:#94a3b8;padding:30px;text-align:center;">Storms scene — 3D loading…</div>`; }
function renderDark(el, lv)     { el.innerHTML = `<div style="color:#94a3b8;padding:30px;text-align:center;">Dark scene — 3D loading…</div>`; }
