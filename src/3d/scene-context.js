// Scene context variation: every visit to a rung gets its own hour, weather
// and dressing — deterministic per (phobia, rung, visit).

import * as THREE from "three";

// ---------- Scene context variation ----------
// Exposure that always happens in the SAME room teaches "I am safe in THAT
// room". Varied-context exposure is what generalises to the world, and it costs
// nothing here but a seed — so every visit to a rung gets a different hour of
// the day, a different sky, and different room dressing.
//
// The sequence is DETERMINISTIC per (phobia, rung, visit): refreshing mid-rung
// puts you back in the same room, but coming back tomorrow does not. Visits
// walk a cycle rather than rolling dice, so the same context never lands twice
// in a row.
const CTX_VISITS_KEY = "fobia.sceneVisits.v1";

function _ctxLoadVisits() {
  try { return JSON.parse(localStorage.getItem(CTX_VISITS_KEY)) || {}; } catch { return {}; }
}
function _ctxSaveVisits(v) {
  try { localStorage.setItem(CTX_VISITS_KEY, JSON.stringify(v)); } catch {}
}
// mulberry32 — small, fast, and stable across browsers, which matters because
// the same seed has to reproduce the same room on any device.
function _mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _ctxHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Hours the rooms can sit in. Each is a whole lighting mood, not a tint: sun
// colour AND elevation AND how much sky fills the shadows, because a low winter
// sun and a bright noon differ in all three at once.
const CTX_HOURS = [
  { id: "dawn",      label: "early morning", key: 0xffd9b0, keyI: 0.86, elev: 0.32, sky: 0xdfe9f7, gnd: 0xb09a82, hemiI: 0.80, top: "#8fb6e8", hz: "#ffe0bb" },
  { id: "morning",   label: "mid-morning",   key: 0xffeccf, keyI: 1.00, elev: 0.62, sky: 0xeaf2fb, gnd: 0xb9a184, hemiI: 0.86, top: "#a8d4ff", hz: "#fdeecf" },
  { id: "noon",      label: "midday",        key: 0xfff6e8, keyI: 1.12, elev: 0.90, sky: 0xf0f6ff, gnd: 0xc0ab90, hemiI: 0.94, top: "#8fc4ff", hz: "#f6f2e6" },
  { id: "afternoon", label: "afternoon",     key: 0xffe6bd, keyI: 0.98, elev: 0.55, sky: 0xe4ecf6, gnd: 0xb59c7e, hemiI: 0.80, top: "#9cc6f2", hz: "#fbe6c6" },
  { id: "golden",    label: "late afternoon",key: 0xffcb92, keyI: 0.92, elev: 0.24, sky: 0xdbe1ec, gnd: 0xa89074, hemiI: 0.68, top: "#8fb0d8", hz: "#f7cf9e" },
  { id: "dusk",      label: "dusk",          key: 0xe6bfa2, keyI: 0.72, elev: 0.14, sky: 0xc9d3e2, gnd: 0x8f8070, hemiI: 0.56, top: "#7b93b8", hz: "#dcbb96" },
];

// Weather multiplies on top of the hour: overcast kills the sun and lifts the
// fill, which flattens the room; rain does the same and adds sound.
const CTX_WEATHER = [
  { id: "clear",    label: "clear",    keyMul: 1.00, hemiMul: 1.00, beamMul: 1.00, w: 4 },
  { id: "hazy",     label: "hazy",     keyMul: 0.86, hemiMul: 1.10, beamMul: 1.25, w: 3 },
  { id: "overcast", label: "overcast", keyMul: 0.52, hemiMul: 1.28, beamMul: 0.25, w: 3 },
  { id: "rain",     label: "rainy",    keyMul: 0.42, hemiMul: 1.22, beamMul: 0.15, w: 2 },
];

// Returns the context for this visit. `advance` increments the visit counter —
// mount() passes true exactly once, so previews and probes can read the current
// context without burning a variant.
function sceneContext(phobiaKey, levelIdx, advance) {
  const key = phobiaKey + ":" + (levelIdx | 0);
  const visits = _ctxLoadVisits();
  let n = visits[key] | 0;
  if (advance) { n += 1; visits[key] = n; _ctxSaveVisits(visits); }
  const seed = _ctxHash(key + "|" + n);
  const rng = _mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length) % arr.length];
  const range = (a, b) => a + rng() * (b - a);
  // Walk the hours as a cycle offset by the phobia, so consecutive visits step
  // through the day instead of re-rolling onto the same hour.
  const hour = CTX_HOURS[(n + (_ctxHash(phobiaKey) % CTX_HOURS.length)) % CTX_HOURS.length];
  // Weather is weighted-random but never the same as last visit.
  const wPool = [];
  for (const w of CTX_WEATHER) for (let i = 0; i < w.w; i++) wPool.push(w);
  let weather = wPool[Math.floor(rng() * wPool.length) % wPool.length];
  if (n > 0) {
    // The weather draw is the FIRST rng call in this function, so replaying the
    // previous visit's stream from scratch reproduces exactly what it rolled.
    const prevSeed = _mulberry32(_ctxHash(key + "|" + (n - 1)));
    const prev = wPool[Math.floor(prevSeed() * wPool.length) % wPool.length];
    if (prev && prev.id === weather.id) {
      weather = CTX_WEATHER[(CTX_WEATHER.indexOf(weather) + 1) % CTX_WEATHER.length];
    }
  }
  return {
    visit: n, seed, rng, pick, range, hour, weather,
    // Combined multipliers a scene can apply straight to its own rig.
    keyI: hour.keyI * weather.keyMul,
    hemiI: hour.hemiI * weather.hemiMul,
    beam: weather.beamMul,
    label: weather.id === "clear" ? hour.label : (weather.label + " " + hour.label),
  };
}

// How strongly each scene takes the generic re-grade. A lift, a dark bedroom,
// an aircraft cabin and a cellar have no outside to vary, so they are absent
// and stay exactly as authored. Dogs is absent too — it blends the context into
// its own per-rung mood, which is better than a blanket nudge.
// Whether the scene has an OUTSIDE you could hear. Separate from the daylight
// table: dogs handles its own light blend and so isn't in that table, but its
// room very much has a window.
const CTX_WEATHER_AUDIBLE = new Set(["heights", "water", "snakes", "driving", "dogs", "storms"]);

const CTX_DAYLIGHT = {
  heights: 0.75,
  water: 0.80,
  snakes: 0.80,
  storms: 0.45,     // its own storm cycle already drives the light hard
  driving: 0.55,
};

// A one-line "how it seems today" chip, styled off the creature trust HUD.
// Returns a teardown the scene pushes onto its own timer/overlay registry.
function mountMoodChip(text) {
  const stage = document.getElementById("stage");
  if (!stage) return () => {};
  // A creature card already sits in this corner (spider, snake): the chip
  // used to be drawn exactly on top of it. Ride inside the card as one more
  // quiet line instead of stacking a second box.
  const card = [...stage.querySelectorAll(".trust-hud")].find((c) => !c.classList.contains("mood-chip"));
  if (card) {
    const line = document.createElement("div");
    line.className = "trust-mood mood-line";
    line.style.cssText = "margin-top:4px;opacity:.72;font-style:italic";
    line.textContent = text;
    card.appendChild(line);
    return () => { try { line.remove(); } catch {} };
  }
  const el = document.createElement("div");
  el.className = "trust-hud mood-chip";
  el.innerHTML = `<div class="trust-mood" style="margin:0">${text}</div>`;
  stage.appendChild(el);
  // A standalone chip is context, not a readout — let it go once read.
  const tm = setTimeout(() => { el.style.transition = "opacity .8s"; el.style.opacity = "0"; }, 7000);
  return () => { clearTimeout(tm); try { el.remove(); } catch {} };
}

// Generic light re-grade for scenes that opt in with `vary: { daylight: true }`.
// Deliberately conservative — it nudges what the scene already built rather
// than replacing a rig it knows nothing about, so it cannot wreck a carefully
// tuned room. `strength` scales the whole effect (0 = off).
function applyContextDaylight(scene, ctx, strength) {
  if (!ctx || !(strength > 0)) return;
  const hourC = new THREE.Color(ctx.hour.key);
  const skyC = new THREE.Color(ctx.hour.sky);
  const gndC = new THREE.Color(ctx.hour.gnd);
  scene.traverse((o) => {
    if (!o.isLight || o.userData.noContextGrade) return;
    if (o.isDirectionalLight) {
      if (o.userData._ctxBaseI == null) o.userData._ctxBaseI = o.intensity;
      o.intensity = o.userData._ctxBaseI * (1 + (ctx.keyI - 1) * strength);
      o.color.lerp(hourC, 0.55 * strength);
      // Sun elevation: keep the light's compass bearing, change how high it
      // sits. A low sun rakes long shadows across the floor; a high one
      // flattens them, and that reads before anything else in the room does.
      const p = o.position;
      const horiz = Math.hypot(p.x, p.z);
      if (horiz > 0.01) {
        const targetY = horiz * (0.35 + ctx.hour.elev * 1.5);
        p.y = p.y + (targetY - p.y) * 0.7 * strength;
      }
    } else if (o.isHemisphereLight) {
      if (o.userData._ctxBaseI == null) o.userData._ctxBaseI = o.intensity;
      o.intensity = o.userData._ctxBaseI * (1 + (ctx.hemiI - 1) * strength);
      o.color.lerp(skyC, 0.5 * strength);
      o.groundColor.lerp(gndC, 0.5 * strength);
    } else if (o.isAmbientLight) {
      if (o.userData._ctxBaseI == null) o.userData._ctxBaseI = o.intensity;
      o.intensity = o.userData._ctxBaseI * (1 + (ctx.hemiI - 1) * 0.6 * strength);
      o.color.lerp(skyC, 0.35 * strength);
    }
  });
}

export { sceneContext, CTX_WEATHER_AUDIBLE, CTX_DAYLIGHT, applyContextDaylight };
