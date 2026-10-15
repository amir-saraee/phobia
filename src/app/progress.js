// Progress and the save: state and character slices, courage and stars,
// sparks, bridges and Real Path worldsteps, companions, fear checks,
// milestones and goals.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// ---------- Sparks of Wisdom (collectible psychoeducation) ----------
// One card is earned per finished trial, in a deliberate teaching order —
// the psychology arrives little by little, at the exact moment it was just
// FELT in the scene. Collected cards live in the Journal (#/journal).
const INSIGHT_CARDS = [
  { id: "wave",       icon: "🌊", title: "Fear is a wave",
    text: "Anxiety rises, peaks, and falls on its own — even if you do nothing but stay. You just rode one. No wave is endless." },
  { id: "avoidance",  icon: "🍂", title: "Avoidance feeds the shadow",
    text: "Escaping a fear feels great for a minute — and teaches your brain the danger was real. Every avoided yard makes the bark louder. Facing is the only diet a shadow can't survive." },
  { id: "brave",      icon: "🛡️", title: "Brave is not calm",
    text: "Courage isn't the absence of fear — it's your hands shaking while you stay anyway. If you felt afraid in there, you weren't doing it wrong. You were doing it exactly right." },
  { id: "habituation",icon: "🧠", title: "The body learns by staying",
    text: "Stay near a fear long enough and the alarm quiets on its own. That's habituation — no willpower required, just time in the room. Boredom is the sound of it working." },
  { id: "gap",        icon: "🎯", title: "The gap is the lesson",
    text: "You predicted an 8. It was a 4. That gap — felt in the body, not read in a book — is literally your brain rewriting what counts as dangerous." },
  { id: "exhale",     icon: "🌬️", title: "The long exhale",
    text: "A slow out-breath presses your body's brake pedal (the vagus nerve). Out longer than in — 4 in, 6 out — and the heart has no choice but to follow." },
  { id: "steps",      icon: "🪜", title: "Small steps beat big leaps",
    text: "The nervous system trusts gradual evidence, not heroic jumps. A trial that's only a little scary, repeated, rewires more than one terrifying plunge." },
  { id: "newmemory",  icon: "🌱", title: "A new memory, not a deleted one",
    text: "Exposure doesn't erase the fear memory — it grows a stronger 'this is safe' memory on top of it. That's why practice matters: you're feeding the new one." },
  { id: "attention",  icon: "👁️", title: "Look at it, not away",
    text: "Distraction feels kinder, but attention is what lets safety learning stick. Watching the thing you fear do nothing much is the medicine. Looking away skips the dose." },
  { id: "openhand",   icon: "🫱", title: "Open hand, not clenched fist",
    text: "Fighting the feeling amplifies it. Letting fear be there — in the room, unfought — while you keep doing the thing loosens its grip faster than any struggle." },
  { id: "spiral",     icon: "🌀", title: "Wobbles are part of the path",
    text: "A scared day after a brave week isn't relapse. Learning is a spiral, not a line — you pass the same spot again, but higher up." },
  { id: "bodyfirst",  icon: "⚡", title: "The body votes first",
    text: "Racing heart, then scary thought — in that order. The alarm is a reflex, not a report. You can feel danger and be perfectly safe at the same time." },
  { id: "portable",   icon: "🧭", title: "Courage travels",
    text: "Practicing in different places, moods and times of day makes the safety learning portable — so it shows up in the real yard, not just this one." },
  { id: "rest",       icon: "🌙", title: "Rest writes it down",
    text: "Your brain consolidates the day's safety learning while you sleep. The bravest thing you can do after a trial is nothing at all." },
  { id: "coach",      icon: "💬", title: "Talk like a coach, not a critic",
    text: "'This is hard and I can stay' beats 'don't panic'. The voice that gets you through a trial is kind, specific, and on your side — practice using it on yourself." }
];
function getSparks() {
  const cs = activeCharSlice();
  if (!Array.isArray(cs.sparks)) cs.sparks = [];
  return cs.sparks;
}
function awardSpark() {
  const owned = getSparks();
  const next = INSIGHT_CARDS.find(c => !owned.includes(c.id));
  if (!next) return null;
  owned.push(next.id);
  saveState();
  return next;
}

// ---------- The Real Path (real-world bridge quests) ----------
// Screen exposure is the on-ramp; the destination is real life. Each in-game
// trial, once finished, unlocks a matching tiny REAL-WORLD step. Design rules:
// real steps are never required to progress in the game (pressure backfires),
// they self-report on the same SUDS scale, and they pay MORE than game trials
// (30 + 10×step courage) because they are worth more. Stored separately from
// state.log (cs.worldsteps) so no existing session consumer double-counts.
const BRIDGES = {
  dogs: [
    { t: "Look at photos of dogs for 2 minutes", how: "Let the alarm rise and settle while you keep looking." },
    { t: "Watch a dog video with the sound ON", how: "Barking included. Notice it's loud, not dangerous." },
    { t: "Stand across the street from a dog park for 5 minutes", how: "Just watch. Distance is yours to choose." },
    { t: "Let a leashed dog walk past you", how: "Don't cross the street. Feet planted, long exhale." },
    { t: "Stand near a calm, leashed dog with someone you trust", how: "Ask the owner first. You don't have to touch." }
  ],
  spiders: [
    { t: "Look at spider photos for 2 minutes", how: "Full-screen, not thumbnails. Stay till it's boring." },
    { t: "Watch a short spider video", how: "Legs moving and all. Watch it do ordinary spider things." },
    { t: "Stay in the same room as a house spider", how: "Don't leave, don't make anyone remove it. 5 minutes." },
    { t: "Watch a real spider from a metre away", how: "2 minutes. Notice it wants nothing to do with you." },
    { t: "Cup-and-release a small spider", how: "Glass and paper. You're in charge of every second." }
  ],
  snakes: [
    { t: "Look at snake photos for 2 minutes", how: "Coiled and moving ones. Breathe out longer than in." },
    { t: "Watch a snake documentary clip with sound", how: "The slide and the tongue — let your body get used to both." },
    { t: "Visit a reptile section and look from the doorway", how: "Pet shop or zoo. Doorway counts. Stay 2 minutes." },
    { t: "Stand at the glass of a snake enclosure", how: "5 minutes at the glass. It cannot reach you; teach your body that." },
    { t: "Stay at the glass while the snake moves", how: "The movement is the hard part. Watch one full glide." }
  ],
  heights: [
    { t: "Stand on the first step of a staircase for 1 minute", how: "Both feet, no hand on the rail if you can." },
    { t: "Look out of a 2nd or 3rd floor window for 2 minutes", how: "Open the curtain fully. Look out, then briefly down." },
    { t: "Stand on a balcony or bridge, one step from the rail", how: "One step back is still ON the balcony. 3 minutes." },
    { t: "Stand at the rail and look OUT for 2 minutes", how: "Horizon first. Hands resting on the rail is allowed." },
    { t: "Stand at the rail and look DOWN", how: "Three slow breaths while looking down. Then step back proud." }
  ],
  dark: [
    { t: "Sit in a dim room for 5 minutes", how: "One small lamp only. Do nothing else — just sit." },
    { t: "Sit in your room with lights off, door open", how: "2 minutes. The hallway light is your safety line — that's fine." },
    { t: "Lie in bed in the dark, door closed, before sleep", how: "5 minutes before reaching for any light. Name what you hear." },
    { t: "Walk through your dark home without turning lights on", how: "One slow lap. Hands out is allowed, phone stays in pocket." },
    { t: "Spend 10 minutes in full dark, breathing slowly", how: "Sitting or lying. Nothing was added to the room when the light left." }
  ],
  enclosed: [
    { t: "Sit in a small room with the door closed for 5 minutes", how: "Bathroom or closet-office. Notice the air keeps arriving." },
    { t: "Ride an elevator one floor with someone", how: "One floor, together. Long exhale on the ride." },
    { t: "Ride an elevator three floors alone", how: "No phone in hand. Watch the numbers, breathe out slow." },
    { t: "Sit in a parked car, doors closed, windows up", how: "5 minutes. You hold the handle the whole time if you want." },
    { t: "Choose one tight space you usually avoid — and stay", how: "Crowded aisle, middle seat, small café corner. 5 minutes." }
  ]
};
const BRIDGE_FALLBACK = [
  { t: "Look at pictures of the thing you fear for 2 minutes", how: "Let the alarm rise and settle while you keep looking." },
  { t: "Watch a video of it with the sound on", how: "Stay until interest replaces alarm, even a little." },
  { t: "Observe the real thing from a safe distance", how: "You choose the distance. Stay 5 minutes." },
  { t: "Close half the distance, briefly", how: "One minute closer than comfortable, then step back proud." },
  { t: "Stay close on purpose", how: "Five minutes at the closest distance you can allow. That's the summit." }
];
// bridgeRaw is the English source (the clinician report reads it);
// bridgeOf is what the traveller sees, through bridge.<key>.<i>.t|how.
function bridgeRaw(key) { return BRIDGES[key] || BRIDGE_FALLBACK; }
function bridgeOf(key) {
  const ns = BRIDGES[key] ? key : "any";
  return bridgeRaw(key).map((s, i) => ({ t: t(`bridge.${ns}.${i}.t`, s.t), how: t(`bridge.${ns}.${i}.how`, s.how) }));
}
function getWorldsteps(phobiaKey) {
  const cs = activeCharSlice();
  if (!cs.worldsteps) cs.worldsteps = {};
  if (!Array.isArray(cs.worldsteps[phobiaKey])) cs.worldsteps[phobiaKey] = [];
  return cs.worldsteps[phobiaKey];
}
function worldstepDone(phobiaKey, step) {
  return getWorldsteps(phobiaKey).some(w => w.step === step);
}
// Where a realm actually stands, on both tracks. The valley was always the
// only one that counted: five trials done and the realm read as "tamed", even
// if the traveller had never once faced the thing outside the game. But the
// in-game ladder is the rehearsal — the real steps are what generalises, and a
// realm that calls itself finished without them is overclaiming.
//
// Nothing here gates: every trial stays playable at any time, and no real step
// is ever required to continue. It only changes what "finished" means.
function realmStatus(phobiaKey) {
  const p = PHOBIAS[phobiaKey];
  const totalTrials = (p && p.levels && p.levels.length) || 5;
  const trials = Math.min(totalTrials, getProgress(phobiaKey).highestCompleted + 1);
  const totalSteps = bridgeOf(phobiaKey).length;
  const steps = getWorldsteps(phobiaKey).length;
  const walked = trials >= totalTrials;          // every trial faced in here
  return { trials, totalTrials, steps, totalSteps, walked, tamed: walked && steps >= totalSteps };
}
// ---------- The dogs, as individuals ----------
// The scene has always known these two: a name, a temperament that changes by
// the day, and a trust value that persists per breed and per traveller. None
// of it ever reached a page the user reads, so the realm advertised "the Hound
// Shadow" while the room contained a shiba called Buddy who remembered them.
//
// Trust is the arc the whole realm is actually about — a dog you were afraid
// of becoming a dog you know — so it gets said in relationship terms rather
// than as a percentage. The bands match the thresholds the scene itself uses
// for proximity permission (see setTrust: minDistance shrinks with trust).
const DOG_COMPANIONS = [
  { breed: "shiba", species: "shiba", nameKey: "fobia.dogName",       fallback: "Buddy", rungs: "trials 1–2" },
  { breed: "husky", species: "husky", nameKey: "fobia.dogName.husky", fallback: "Koda",  rungs: "trials 3–5" },
];
function dogTrustBand(trust, met) {
  if (!met)            return { label: t("dog.band.0", "hasn't met you yet"),    tone: "none" };
  if (trust < 0.12)    return { label: t("dog.band.1", "knows your face"),       tone: "low" };
  if (trust < 0.35)    return { label: t("dog.band.2", "comes when you call"),   tone: "low" };
  if (trust < 0.60)    return { label: t("dog.band.3", "lets you stand close"),  tone: "mid" };
  if (trust < 0.85)    return { label: t("dog.band.4", "leans into your hand"),  tone: "high" };
  return { label: t("dog.band.5", "trusts you completely"), tone: "high" };
}
// The scene saves the day's temperament by its English label (the module's
// DOG_TEMPERAMENTS); the realm page reads it back through temper.<id>.
const TEMPER_IDS = { "sleepy": "sleepy", "curious": "curious", "distracted": "busy", "bright-eyed": "keen" };
function temperText(label) { return TEMPER_IDS[label] ? t(`temper.${TEMPER_IDS[label]}`, label) : label; }
function dogCompanions() {
  // loadCharacter() returns null before a traveller is created — the optional
  // chain matters, the && chain does not (it only proves the function exists).
  const charId = (window.Character?.loadCharacter?.()?.id) || "default";
  return DOG_COMPANIONS.map((c) => {
    let name = c.fallback, trust = 0, seen = null;
    try {
      name = localStorage.getItem(c.nameKey) || c.fallback;
      trust = Math.max(0, Math.min(1, parseFloat(localStorage.getItem(`fobia.dogs.trust.${charId}.${c.breed}`) || "0")));
      seen = JSON.parse(localStorage.getItem(`fobia.dogs.lastSeen.${c.breed}`) || "null");
    } catch {}
    // "Met" is having been in the room together, which trust alone can't say:
    // a traveller who kept their distance the whole time is still someone the
    // dog has met, and trust would read 0 for them exactly as for a stranger.
    const met = !!seen || trust > 0;
    return Object.assign({}, c, { name, trust, seen, met, band: dogTrustBand(trust, met) });
  });
}
// Who waits at the campfire: a dog joins once you've faced all of its
// trials — Buddy after trials 1–2, Koda after 3–5. The animal the realm was
// afraid of, lying by your fire, is the reward that says what changed.
const CAMP_COMPANION_AT = { shiba: 1, husky: 4 };
function campCompanions() {
  const hc = getProgress("dogs").highestCompleted ?? -1;
  return dogCompanions().filter((c) => hc >= CAMP_COMPANION_AT[c.breed]);
}
function worldstepCount() {
  const cs = activeCharSlice();
  return Object.values(cs.worldsteps || {}).reduce((s, arr) => s + arr.length, 0);
}
function completeWorldstep(phobiaKey, step, suds) {
  const list = getWorldsteps(phobiaKey);
  if (list.some(w => w.step === step)) return;
  list.push({ step, suds: Number.isFinite(suds) ? suds : null, ts: Date.now() });
  saveState();
  awardCourage(30 + 10 * step, t("courage.real", "a real-world step"));
  showAchievement(t("ach.real", "A real-world step"), t("ach.realP", "You faced it out there — that's worth more than any trial in here."), "🌍");
  checkMilestones();
}

// ---------- The Mirror (fear-severity check-ins) ----------
// Outcome measurement, not activity measurement: a 5-item self-check rated
// about REAL LIFE (not the game), covering the dimensions standard fear
// instruments measure — avoidance, peak intensity, physiological reaction,
// interference, danger belief — in original wording. 0–4 each, total 0–20.
// Taken as a baseline when a realm is first entered, re-offered after trials
// 3 and 5. The baseline→latest delta is the number that says whether any of
// this is working, and it feeds the therapist report. Not a diagnosis.
const FEAR_CHECK_ITEMS = [
  { id: "avoid",  q: "Out in real life, how much do you go out of your way to avoid it?" },
  { id: "peak",   q: "When you do meet it, how strong is the fear at its peak?" },
  { id: "body",   q: "How strongly does your body react — heart, breath, sweat, freeze?" },
  { id: "limit",  q: "How much does this fear limit your daily life — routes, places, plans?" },
  { id: "danger", q: "Right now, how convinced are you that meeting it would end badly?" },
];
const FEAR_CHECK_SCALE = ["not at all", "a little", "somewhat", "a lot", "extremely"];
function fearCheckBand(total) {
  const idx = total <= 4 ? 0 : total <= 9 ? 1 : total <= 14 ? 2 : 3;
  const tones  = ["calm", "mild", "warm", "hot"];
  const labels = ["a whisper", "audible", "loud", "very loud"];
  return { label: t(`mirror.b${idx}`, labels[idx]), tone: tones[idx] };
}
function getChecks(phobiaKey) {
  const cs = activeCharSlice();
  if (!cs.checks) cs.checks = {};
  if (!Array.isArray(cs.checks[phobiaKey])) cs.checks[phobiaKey] = [];
  return cs.checks[phobiaKey];
}
function latestCheck(phobiaKey) {
  const c = getChecks(phobiaKey);
  return c.length ? c[c.length - 1] : null;
}
function saveCheck(phobiaKey, scores, at) {
  const total = scores.reduce((s, v) => s + v, 0);
  getChecks(phobiaKey).push({ ts: Date.now(), scores, total, at: at || "manual" });
  saveState();
  return total;
}
// A re-check is "due" on the victory screen after trials 3 and 5 (level idx
// 2 / 4) when the traveler hasn't already checked at that stage.
function fearCheckDue(phobiaKey, levelIdx) {
  if (levelIdx !== 2 && levelIdx !== 4) return false;
  const stage = levelIdx === 2 ? "mid" : "post";
  const checks = getChecks(phobiaKey);
  if (!checks.length) return false;          // no baseline — don't nag mid-flow
  return !checks.some(c => c.at === stage);
}

// The realms shown on the journey map: the six featured fears, plus anything
// the traveler already carries (legacy progress, a non-featured primary fear,
// or a forged/custom ladder) so nothing they own ever disappears.
function journeyKeys() {
  const keys = FEATURED.filter(k => PHOBIAS[k] && realmOpen(k));
  const extra = [];
  const ch = window.Character && window.Character.loadCharacter();
  if (ch) [ch.primaryPhobia, ...(ch.additionalPhobias || [])].forEach(k => {
    if (k && PHOBIAS[k] && realmOpen(k) && !keys.includes(k) && !extra.includes(k)) extra.push(k);
  });
  Object.keys(state.progress || {}).forEach(k => {
    if (PHOBIAS[k] && (state.progress[k].highestCompleted ?? -1) >= 0 && !keys.includes(k) && !extra.includes(k)) extra.push(k);
  });
  Object.keys(PHOBIAS).forEach(k => {
    if (PHOBIAS[k].isCustom && !keys.includes(k) && !extra.includes(k)) extra.push(k);
  });
  return keys.concat(extra);
}
// Subset of PHOBIAS offered in pickers (character creator): featured + custom
// + whatever this character already selected, so editing never loses a fear.
function pickablePhobias(existingChar) {
  const keys = FEATURED.filter(k => PHOBIAS[k]);
  Object.keys(PHOBIAS).forEach(k => { if (PHOBIAS[k].isCustom && !keys.includes(k)) keys.push(k); });
  if (existingChar) [existingChar.primaryPhobia, ...(existingChar.additionalPhobias || [])].forEach(k => {
    if (k && PHOBIAS[k] && !keys.includes(k)) keys.push(k);
  });
  const out = {};
  keys.forEach(k => { out[k] = PHOBIAS[k]; });
  return out;
}
// Where the traveler "is" on the map: the realm of their most recent session,
// else their primary fear, else the first featured realm they haven't cleared.
function currentRealmKey() {
  const keys = journeyKeys();
  const lastEntry = (state.log && state.log.length) ? state.log[state.log.length - 1] : null;
  if (lastEntry && keys.includes(lastEntry.phobia)) return lastEntry.phobia;
  const ch = window.Character && window.Character.loadCharacter();
  if (ch && ch.primaryPhobia && keys.includes(ch.primaryPhobia)) return ch.primaryPhobia;
  const firstOpen = keys.find(k => (getProgress(k).highestCompleted ?? -1) < (PHOBIAS[k].levels.length - 1));
  return firstOpen || keys[0];
}

// ---------- State ----------
const STATE_KEY = "fobia.state.v1";
let state = loadState();
// Make state per-character: each character has its own progress + log. The
// global state.progress / state.log fields are kept as references to the
// active character's data so existing code continues to work.
function activateCharacterState() {
  if (!state.byCharacter) state.byCharacter = {};
  const ch = window.Character && window.Character.loadCharacter();
  const id = ch?.id || "default";
  if (!state.byCharacter[id]) {
    // Migrate any legacy global progress/log into this character on first access
    state.byCharacter[id] = {
      progress: state.progress && Object.keys(state.progress).length ? state.progress : {},
      log: state.log && state.log.length ? state.log : [],
    };
    // What a visitor did before they had a traveler — the self-check's
    // answers (the Mirror baseline), the story pages read — belongs to the
    // traveler they become. The quiz promised its answers seed the Mirror;
    // they used to stay behind in the "default" slot.
    const pre = id !== "default" && state.byCharacter.default;
    if (pre) {
      const mine = state.byCharacter[id];
      if (pre.checks && Object.keys(pre.checks).length) { mine.checks = pre.checks; delete pre.checks; }
      if (pre.story) mine.story = JSON.parse(JSON.stringify(pre.story));
      if (pre.primer) mine.primer = Object.assign({}, pre.primer);
    }
  }
  state.progress = state.byCharacter[id].progress;
  state.log      = state.byCharacter[id].log;
  // Courage + goals are per-character too (they used to live on the root state
  // and leaked across characters). Migrate any legacy global values into the
  // FIRST character that loads, once, then clear the globals so switching
  // characters can't re-inherit them.
  const _slice = state.byCharacter[id];
  if (_slice.courage == null) _slice.courage = state._charScoped ? 0 : (state.courage || 0);
  if (_slice.goals == null)   _slice.goals   = state._charScoped ? {} : (state.goals || {});
  state._charScoped = true;
  delete state.courage; delete state.goals;
}
// The active character's mutable slice (progress/log/courage/goals/milestones).
// Ensures the slice + its courage/goals fields exist so gameplay writes land on
// the right character instead of a shared global.
function activeCharSlice() {
  if (!state.byCharacter) state.byCharacter = {};
  const id = (window.Character && window.Character.activeCharacterId && window.Character.activeCharacterId()) || "default";
  if (!state.byCharacter[id]) state.byCharacter[id] = { progress: {}, log: [] };
  const s = state.byCharacter[id];
  if (s.courage == null) s.courage = 0;
  if (s.goals == null) s.goals = {};
  return s;
}
// Reset ONLY the active character's data — the old handlers reassigned the whole
// root state, silently wiping every OTHER character's progress, log, courage and
// goals too.
function resetActiveProgress() {
  if (!state.byCharacter) state.byCharacter = {};
  const id = (window.Character && window.Character.activeCharacterId && window.Character.activeCharacterId()) || "default";
  state.byCharacter[id] = { progress: {}, log: [], courage: 0, goals: {}, milestones: [] };
  state.progress = state.byCharacter[id].progress;
  state.log = state.byCharacter[id].log;
  saveState();
}
// Refresh state when the user switches/creates/deletes a character
window.addEventListener("character-changed", () => { activateCharacterState(); });
// Non-persisted prediction (cleared on submit-rate). Drives the post-rung
// "you expected X, you felt Y" comparison that powers prediction-error learning.
let pendingPrediction = null;
// Peak fear (0–100) the body reached during the most recent rung, stashed by
// the hold timer. Drives the within-rung HABITUATION message ("at its peak you
// were ~7/10, you stayed, and now you're at 4/10") — the single most motivating
// feedback in graded exposure, which was previously never surfaced.
let lastRungPeakFear = 0;
// Outcome of the most recent hold — written EVERY tick by the hold timer so
// leaving at any moment captures the honest state: how long they held, what
// the target was, whether they finished. Makes "finished the hold" and
// "stepped out early" distinguishable in the log (both are always allowed).
let lastRungOutcome = null;   // { heldSec, minHold, finished, phobia, level }
// Active background pad handle, if music is enabled.
let ambientPad = null;

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STATE_KEY)) || {};
    return Object.assign({ progress: {}, log: [], courage: 0 }, s);
  } catch { return { progress: {}, log: [], courage: 0 }; }
}
// saveState swallows storage errors (Safari Private Mode rejects writes
// past a tiny quota — without the catch, the whole render thread can throw
// when persisting after a session).
function saveState() {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
}

function getProgress(phobiaKey) {
  return state.progress[phobiaKey] || { highestCompleted: -1 };
}
// ---------- Courage Points ----------
// A simple gamification XP value: each rung completion grants points scaled
// by difficulty (10 + 5 × levelIdx), with a 2× bonus the FIRST time the
// user clears a particular rung. Total displays in the header so the user
// has a tangible "I'm growing" number.
function awardCourage(points, reason) {
  if (!Number.isFinite(points) || points <= 0) return;
  const cs = activeCharSlice();
  const before = cs.courage || 0;
  cs.courage = before + Math.round(points);
  saveState();
  // Rank-up: crossing a threshold is a named moment, not just a bigger number.
  try {
    const rBefore = courageRank(before), rAfter = courageRank(cs.courage);
    if (rAfter.idx > rBefore.idx) {
      const show = () => showAchievement(tf("ach.rankUp", "Rank up — {title}", { title: rAfter.title }), tf("ach.rankUpP", "The valley knows your name now. ({n} courage)", { n: cs.courage }), rAfter.icon, "rank");
      if (window.__achSink) show(); else setTimeout(show, 900);
    }
  } catch {}
  // Re-render the header courage badge if visible
  try {
    const badge = document.getElementById("courageBadge");
    if (badge) {
      badge.textContent = `⚡ ${cs.courage}`;
      badge.classList.add("pop");
      setTimeout(() => badge.classList.remove("pop"), 600);
    }
  } catch {}
  if (reason && window.PhobiaFX && window.PhobiaFX.contextPrompt) {
    // Light, non-intrusive notification — only when the courage gain is
    // big enough to celebrate.
    if (points >= 20) {
      try { window.PhobiaFX.contextPrompt(tf("courage.gain", "+{n} courage · {why}", { n: Math.round(points), why: reason }), 2800); } catch {}
    }
  }
}
function getCourage() { return activeCharSlice().courage || 0; }

// ---------- Trial stars ----------
// Three per trial (the coach's three goals). A trial's stars are its best
// attempt; sessions from before stars existed count a finished hold as the
// one star it would have been.
function entryStars(l) {
  if (typeof l.stars === "number") return l.stars;
  return l.finished ? 1 : 0;
}
function bestStars(phobiaKey, levelIdx) {
  let b = -1;   // -1: never played
  for (const l of state.log) if (l.phobia === phobiaKey && l.level === levelIdx) b = Math.max(b, entryStars(l));
  return b;
}
// The goals of the best attempt — so "replay for ★★★" can name what's left.
function bestStarGoals(phobiaKey, levelIdx) {
  let best = null, bs = -1;
  for (const l of state.log) {
    if (l.phobia !== phobiaKey || l.level !== levelIdx || !Array.isArray(l.goals)) continue;
    const s = entryStars(l);
    if (s >= bs) { bs = s; best = l.goals; }
  }
  return best;
}
function realmStars(phobiaKey) {
  const n = (PHOBIAS[phobiaKey] && PHOBIAS[phobiaKey].levels.length) || 5;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.max(0, bestStars(phobiaKey, i));
  return { stars: s, total: n * 3 };
}
function starsHTML(n, total = 3, cls = "") {
  return `<span class="stars ${cls}" aria-label="${escapeHtml(tf("stars.aria", "{n} of {m} stars", { n: Math.max(0, n), m: total }))}">${
    Array.from({ length: total }, (_, i) => `<i class="${i < n ? "on" : ""}">★</i>`).join("")}</span>`;
}

let lastAward = null;   // {points, streakAfter, milestones[], badges[], key, ts} — surfaced on the Complete screen
// Finishing a trial used to fire its achievements as toasts — "First rung
// climbed", the milestone, a rank-up, "Held the line" — stacked over the
// Complete screen, covering its buttons, saying what the screen already
// says. While a trial is being recorded they collect here instead, and the
// Complete screen shows them in its own reward row.
function markCompleted(...args) {
  const sink = [];
  window.__achSink = sink;
  try { return recordCompletion(...args); }
  finally {
    window.__achSink = null;
    if (lastAward) lastAward.badges = sink.filter((b) => b.kind === "trial").map((b) => `${b.icon} ${b.title}`);
  }
}
function recordCompletion(phobiaKey, levelIdx, suds, predicted, peak, outcome, extra) {
  const p = getProgress(phobiaKey);
  // Ladder honesty: the marker only advances on a real finish. An early exit
  // is logged (and still earns), but doesn't tick the ladder — otherwise
  // "clicked continue at second two" and "held the full time" read the same.
  // A rating with no trial behind it (a refreshed or deep-linked rate page)
  // is not a finish: it used to advance the ladder, pay double courage and
  // deal a Spark for a trial that never happened.
  const outcomeOk = !!(outcome && outcome.phobia === phobiaKey && outcome.level === levelIdx);
  const finished = outcomeOk && outcome.finished !== false;
  const wasNew = finished && levelIdx > p.highestCompleted;
  // Daily ember: the FIRST finished trial each day earns a small bonus —
  // a daily-quest loop that rewards showing up, checked BEFORE this session
  // is pushed to the log.
  const firstToday = finished && !state.log.some(l => l.finished !== false && isSameLocalDay(l.ts));
  // The trial's best stars BEFORE this attempt — new stars pay a bonus.
  const prevBest = Math.max(0, bestStars(phobiaKey, levelIdx));
  if (finished) p.highestCompleted = Math.max(p.highestCompleted, levelIdx);
  state.progress[phobiaKey] = p;
  // The conditions this rung was practised in. Varied-context practice is what
  // generalises, so it belongs in the record next to the numbers.
  let ctxLabel = null, ctxKey = null;
  try {
    const c = window.Scene3D && window.Scene3D.currentContext
      && window.Scene3D.currentContext(phobiaKey, levelIdx);
    if (c) { ctxLabel = c.label; ctxKey = c.hour + "/" + c.weather; }
  } catch {}
  const entry = Object.assign({
    phobia: phobiaKey, level: levelIdx, suds, predicted, peak, ts: Date.now(),
    heldSec: outcomeOk ? outcome.heldSec : null,
    minHold: outcomeOk ? outcome.minHold : null,
    finished: outcomeOk ? !!outcome.finished : false,
    ctx: ctxKey, ctxLabel,
  }, extra || {});
  state.log.push(entry);
  saveState();
  // ---- Courage Points award ----
  // Base 10 + 5 per difficulty rung. 2× bonus for first-time clears; early
  // exits earn half — leaving is allowed and never punished, just distinct.
  const basePoints = 10 + 5 * levelIdx;
  const isFirstTime = wasNew;
  const points = Math.round((isFirstTime ? basePoints * 2 : basePoints) * (finished ? 1 : 0.5));
  const courageBefore = getCourage();
  awardCourage(points, finished ? (isFirstTime ? t("courage.first", "first time") : t("courage.well", "well done")) : t("courage.showed", "you showed up"));
  if (firstToday) awardCourage(15, t("courage.ember", "daily ember"));
  // Stars beyond this trial's old best: +5 each. A replay that earns the
  // star you missed pays — coming back is the point.
  const stars = entryStars(entry);
  const newStars = Math.max(0, stars - prevBest);
  if (newStars) awardCourage(5 * newStars, t("courage.stars", "new stars"));
  // Check for newly-unlocked milestones (after the log push so they see this entry)
  const newMilestones = checkMilestones() || [];
  // Stash the concrete reward so the Complete screen can surface it at the peak
  // motivation moment (the +courage prompt only shows in-scene and only >=20).
  lastAward = {
    points,
    streakAfter: computeStreak(),
    milestones: newMilestones.map(m => m.title),
    key: `${phobiaKey}.${levelIdx}`,
    ts: Date.now(),
    // Spark of Wisdom: one psychoeducation card per FINISHED trial, dealt in
    // teaching order. Early exits still earn courage but not a card — the
    // card celebrates a completed hold, and the deck is finite.
    spark: finished ? (awardSpark()?.id || null) : null,
    daily: firstToday,
    advanced: wasNew,
    stars, prevBest, starBonus: 5 * newStars,
    courageBefore, courageAfter: getCourage(),
  };
  // Award an achievement toast for first-time completions
  if (wasNew) {
    const phobia = PHOBIAS[phobiaKey];
    const isLast = levelIdx === phobia.levels.length - 1;
    if (isLast) {
      showAchievement(t("ach.ladder", "Ladder complete"), tf("ach.ladderP", "You walked all 5 rungs of {fear}.", { fear: phLabel(phobiaKey) }), "🪜", "trial");
    } else if (levelIdx === 0) {
      showAchievement(t("ach.first", "First rung climbed"), tf("ach.firstP", "You started {fear}.", { fear: phLabel(phobiaKey) }), "🌱", "trial");
    } else if (levelIdx === Math.floor(phobia.levels.length / 2)) {
      showAchievement(t("ach.half", "Halfway there"), tf("ach.halfP", "Rung {n} on {fear}.", { n: levelIdx + 1, fear: phLabel(phobiaKey) }), "🚩", "trial");
    }
  }
  // Award a brave-face if anxiety was high but you stayed (a full hold —
  // the badge would ring false on an early exit)
  if (finished && suds >= 7) showAchievement(t("ach.held", "Held the line"), tf("ach.heldP", "Anxiety {n}/10 and you stayed.", { n: suds }), "🫁", "trial");
}

// ---------- Progress milestones ----------
// Auto-detected achievements that unlock as the user makes progress. Each one
// fires once. Stored in state.byCharacter[id].milestones so they're per-character.
const MILESTONES = [
  { id: "first_session",  title: "First session",      icon: "🌱",
    desc: "You started. That is the hardest rung of all.",
    check: () => state.log.length >= 1 },
  { id: "rung_3",         title: "Mid-ladder",          icon: "🚩",
    desc: "Reached the third rung on a phobia.",
    check: () => Object.values(state.progress).some(p => p.highestCompleted >= 2) },
  { id: "low_on_high",    title: "Low SUDS on a high rung", icon: "🧘",
    desc: "Felt 4 or less on rung 4 or 5 — habituation working.",
    check: () => state.log.some(l => l.level >= 3 && l.suds <= 4) },
  { id: "first_journal",  title: "Reflective journaler", icon: "📓",
    desc: "Wrote a journal note on a session.",
    check: () => state.log.some(l => l.note) },
  { id: "ladder_complete",title: "Ladder conquered",     icon: "🪜",
    desc: "Climbed every rung of a phobia.",
    check: () => Object.entries(PHOBIAS).some(([k, p]) =>
      state.progress[k] && state.progress[k].highestCompleted >= p.levels.length - 1) },
  { id: "custom_ladder",  title: "Architect",            icon: "🛠",
    desc: "Built your own custom ladder.",
    check: () => Object.keys(loadCustomPhobias()).length > 0 },
  { id: "three_phobias",  title: "Multi-fear practice",  icon: "🌐",
    desc: "Worked on three different fears.",
    check: () => Object.keys(state.progress).filter(k => state.progress[k].highestCompleted >= 0).length >= 3 },
  { id: "first_worldstep", title: "Out of the valley",   icon: "🌍",
    desc: "Took your first real-world step. The game was practice — this was the point.",
    check: () => worldstepCount() >= 1 },
  { id: "five_worldsteps", title: "Walking the real path", icon: "🥾",
    desc: "Five real-world steps faced outside the game.",
    check: () => worldstepCount() >= 5 },
  { id: "streak_7",       title: "Seven days running",   icon: "🔥",
    desc: "A 7-day session streak.",
    check: () => computeStreak() >= 7 },
  { id: "good_predictor", title: "Steady predictor",     icon: "🎯",
    desc: "Average over-prediction below 1 — you read your body well.",
    check: () => {
      const preds = state.log.filter(l => l.predicted != null);
      if (preds.length < 5) return false;
      const avgGap = preds.reduce((s, l) => s + Math.abs(l.predicted - l.suds), 0) / preds.length;
      return avgGap < 1;
    } },
];
// Titles and descriptions read through ms.<id>.title|desc at use time, so
// every consumer (toast, complete page, insights) follows the language.
MILESTONES.forEach((m) => {
  const title = m.title, desc = m.desc;
  Object.defineProperty(m, "title", { get: () => t(`ms.${m.id}.title`, title) });
  Object.defineProperty(m, "desc", { get: () => t(`ms.${m.id}.desc`, desc) });
});
function unlockedMilestones() {
  const cs = state.byCharacter || {};
  const id = (window.Character && window.Character.activeCharacterId()) || "default";
  cs[id] = cs[id] || { progress: {}, log: [] };
  if (!Array.isArray(cs[id].milestones)) cs[id].milestones = [];
  return cs[id].milestones;
}
function setUnlockedMilestones(arr) {
  const cs = state.byCharacter || {};
  const id = (window.Character && window.Character.activeCharacterId()) || "default";
  cs[id].milestones = arr;
}
function checkMilestones() {
  const already = unlockedMilestones();
  const newlyUnlocked = [];
  for (const m of MILESTONES) {
    if (already.includes(m.id)) continue;
    try {
      if (m.check()) {
        already.push(m.id);
        newlyUnlocked.push(m);
      }
    } catch {}
  }
  if (newlyUnlocked.length) {
    setUnlockedMilestones(already);
    saveState();
    // Show toasts for each
    newlyUnlocked.forEach((m) => showAchievement(m.title, m.desc, m.icon, "milestone"));
  }
  return newlyUnlocked;
}

// Modal dialog for self-reporting a real-world bridge step. Same SUDS scale
// as in-game trials; saving awards the (bigger) worldstep courage and
// re-renders the realm so the step flips to done.
function openWorldstepModal(phobiaKey, stepIdx) {
  const s = bridgeOf(phobiaKey)[stepIdx];
  if (!s || worldstepDone(phobiaKey, stepIdx)) return;
  const overlay = document.createElement("div");
  overlay.className = "goal-modal-overlay";
  overlay.innerHTML = `
    <div class="goal-modal ws-modal" role="dialog" aria-label="Record a real-world step">
      <span class="bridge-invite-kicker">${t("ws.kicker", "🌍 The Real Path")}</span>
      <h3 style="margin:6px 0 4px">${escapeHtml(s.t)}</h3>
      <p class="small" style="margin-bottom:12px">${t("ws.p", "You did this out in the world — that's the bravest kind of trial. One honest question:")}</p>
      <label for="wsSuds" style="font-size:13.5px">${t("ws.q", "How loud was the fear at its peak out there?")}</label>
      <div class="scale-row" style="margin-top:6px">
        <span class="small">${t("scale.calm", "0 calm")}</span>
        <input type="range" id="wsSuds" min="0" max="10" value="5"/>
        <span class="small">${t("scale.panic", "10 panic")}</span>
        <div class="value" id="wsSudsValue">5</div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn-ghost" id="wsCancel">${t("ws.notYet", "Not yet")}</button>
        <button class="btn-primary" id="wsSave">${t("ws.save", "🌍 I faced it")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const slider = overlay.querySelector("#wsSuds");
  slider.oninput = () => { overlay.querySelector("#wsSudsValue").textContent = slider.value; };
  const close = () => overlay.remove();
  overlay.querySelector("#wsCancel").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector("#wsSave").onclick = () => {
    completeWorldstep(phobiaKey, stepIdx, parseInt(slider.value, 10));
    close();
    go("ladder", { phobia: phobiaKey });
  };
}

// The Mirror modal: five 0–4 items answered about real life. On submit it
// shows the score + band + delta vs baseline inline, then re-renders the
// current view so chips update. `at` tags the stage: baseline | mid | post |
// manual — the report charts these over time.
// ---------- Self-check quiz (the topic-interested visitor's front door) ----
// A 60-second screener that needs no character and no commitment: pick the
// fear, answer the Mirror's five questions about real life, get a severity
// band plus the matching realm and its first real-world steps. The answers
// seed that realm's Mirror baseline, so a visitor who later becomes a
// traveler starts with their history already begun.
function viewQuiz() {
  const cards = FEATURED.filter((k) => PHOBIAS[k]).map((k) => {
    const p = PHOBIAS[k];
    const realm = realmOf(k);
    return `
      <button class="quiz-card" data-action="quiz-pick" data-phobia="${k}">
        <strong>${escapeHtml(t(`phobia.${k}.label`, p.label))}</strong>
        <span class="quiz-realm">${escapeHtml(realm.realmName)} · ${escapeHtml(realm.epithet)}</span>
      </button>`;
  }).join("");
  return `
    <div class="panel quiz-panel">
      <span class="badge">${t("quiz.badge", "🪞 A 60-second self-check")}</span>
      <h2 style="margin-top:10px">${t("quiz.h2", "Which fear runs your life?")}</h2>
      <p>${t("quiz.p", "Pick the one that costs you the most, answer five honest questions about <strong>real life</strong>, and see where it stands — plus the first real-world steps people use to face it. A self-check, not a diagnosis.")}</p>
      <div class="quiz-grid">${cards}</div>
      <p class="small quiz-note">${t("quiz.note", "Private to this device — nothing is sent anywhere.")}</p>
      <div class="actions">
        <button class="btn-ghost" data-action="begin">${t("quiz.skip", "Skip — take me to the valley")}</button>
      </div>
    </div>`;
}

// ---------- One-per-session discovery nudges ----------
// The features that keep people are the ones they never find: the fear curve,
// the evidence file, the printable report. One quiet signpost per page-load,
// each retiring forever once acted on, dismissed, or found unaided.
function nudgesDone() {
  try { return JSON.parse(localStorage.getItem("fobia.nudges.v1") || "[]"); } catch { return []; }
}
function markNudgeDone(id) {
  try {
    const d = nudgesDone();
    if (!d.includes(id)) { d.push(id); localStorage.setItem("fobia.nudges.v1", JSON.stringify(d)); }
  } catch {}
}
function nudgeBlock() {
  // The choice is STICKY for the page-load, not consumed by it: the camp view
  // renders more than once per navigation (shell re-renders), and a
  // consume-once flag meant render #1 got the nudge and render #2 — the one
  // that stays on screen — got nothing. "" = decided that this load shows none.
  const done = nudgesDone();
  if (window.__nudgeThisLoad !== undefined && (window.__nudgeThisLoad === "" || done.includes(window.__nudgeThisLoad))) {
    if (window.__nudgeThisLoad !== "" ) return "";   // acted on mid-load — gone
    return "";
  }
  let n = null;
  const pick = (id) => window.__nudgeThisLoad === undefined || window.__nudgeThisLoad === id;
  if (pick("report") && !done.includes("report") && Object.keys(PHOBIAS).some((k) => { try { return realmStatus(k).walked; } catch { return false; } })) {
    n = { id: "report", icon: "📄", act: "open-report",
      txt: t("nudge.report", "A realm is fully walked. The printable report is something you could hand a therapist."),
      btn: t("nudge.reportBtn", "See the report") };
  } else if (pick("evidence") && !done.includes("evidence") && window.PhobiaExperiments && PhobiaExperiments.evidenceCount() >= 1) {
    const ch = window.Character && window.Character.loadCharacter();
    n = { id: "evidence", icon: "🧾", act: "select-phobia", phobia: (ch && ch.primaryPhobia) || "dogs",
      txt: t("nudge.evidence", "Your first experiment is in the evidence file — the realm page keeps your proof."),
      btn: t("nudge.evidenceBtn", "See the evidence") };
  } else if (pick("insights") && !done.includes("insights") && state.log.length >= 3) {
    n = { id: "insights", icon: "📈", act: "open-insights",
      txt: t("nudge.insights", "Three sessions in — your fear curve has started drawing itself."),
      btn: t("nudge.insightsBtn", "See the curve") };
  }
  if (!n) { if (window.__nudgeThisLoad === undefined) window.__nudgeThisLoad = ""; return ""; }
  window.__nudgeThisLoad = n.id;
  return `
    <div class="nudge-card" data-nudge="${n.id}">
      <span class="nudge-icon">${n.icon}</span>
      <span class="nudge-txt">${n.txt}</span>
      <button class="btn-ghost nudge-go" data-action="${n.act}" ${n.phobia ? `data-phobia="${n.phobia}"` : ""} data-nudge-id="${n.id}">${n.btn}</button>
      <button class="nudge-x" data-action="nudge-dismiss" data-id="${n.id}" aria-label="${t("nudge.dismiss", "Dismiss")}">✕</button>
    </div>`;
}

function openFearCheckModal(phobiaKey, at, mOpts = {}) {
  const p = PHOBIAS[phobiaKey];
  if (!p) return;
  const realm = realmOf(phobiaKey);
  const overlay = document.createElement("div");
  overlay.className = "goal-modal-overlay";
  const items = FEAR_CHECK_ITEMS.map((it, i) => `
    <div class="fc-item" data-item="${i}">
      <p class="fc-q">${i + 1}. ${escapeHtml(t(`mirror.q${i + 1}`, it.q))}</p>
      <div class="fc-scale" role="radiogroup" aria-label="${escapeHtml(it.q)}">
        ${FEAR_CHECK_SCALE.map((lab, v) => `
          <button type="button" class="fc-opt" data-v="${v}" role="radio" aria-checked="false" title="${t(`mirror.s${v}`, lab)}">
            <span class="fc-n">${v}</span><span class="fc-lab">${t(`mirror.s${v}`, lab)}</span>
          </button>`).join("")}
      </div>
    </div>`).join("");
  overlay.innerHTML = `
    <div class="goal-modal fc-modal" role="dialog" aria-label="Fear check-in">
      <span class="bridge-invite-kicker">${t("mirror.kicker", "🪞 The Mirror")} — ${escapeHtml(realm.realmName)}</span>
      <h3 style="margin:6px 0 2px">${t("mirror.modalTitle", "How is this fear, out there?")}</h3>
      <p class="small" style="margin-bottom:12px">${t("mirror.modalP", "Answer about <strong>real life</strong> — not the game. 60 seconds, just for you. A self-check, not a diagnosis.")}</p>
      <div class="fc-items">${items}</div>
      <div class="fc-result" id="fcResult" hidden></div>
      <div class="actions" style="margin-top:14px">
        <button class="btn-ghost" id="fcCancel">${t("mirror.notNow", "Not now")}</button>
        <button class="btn-primary" id="fcSave" disabled>${t("mirror.save", "Hold up the mirror")}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const answers = new Array(FEAR_CHECK_ITEMS.length).fill(null);
  const saveBtn = overlay.querySelector("#fcSave");
  overlay.querySelectorAll(".fc-item").forEach((itemEl, i) => {
    itemEl.querySelectorAll(".fc-opt").forEach(btn => {
      btn.addEventListener("click", () => {
        answers[i] = parseInt(btn.dataset.v, 10);
        itemEl.querySelectorAll(".fc-opt").forEach(b => {
          b.classList.toggle("sel", b === btn);
          b.setAttribute("aria-checked", b === btn ? "true" : "false");
        });
        saveBtn.disabled = answers.some(v => v == null);
      });
    });
  });
  const close = () => overlay.remove();
  overlay.querySelector("#fcCancel").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  saveBtn.onclick = () => {
    if (answers.some(v => v == null)) return;
    const baseline = getChecks(phobiaKey)[0] || null;
    const total = saveCheck(phobiaKey, answers.slice(), at);
    const band = fearCheckBand(total);
    const res = overlay.querySelector("#fcResult");
    let deltaLine = "";
    if (baseline && baseline.total !== total) {
      const d = total - baseline.total;
      deltaLine = d < 0
        ? `<p class="fc-delta down">${tf("mirror.gotQuieter", "▼ {d} quieter than your first mirror ({a} → {b}). That change happened out there, in your life.", { d: Math.abs(d), a: baseline.total, b: total })}</p>`
        : `<p class="fc-delta up">${tf("mirror.gotLouder", "▲ {d} louder than your first mirror ({a} → {b}). Fear wobbles — this is information, not failure.", { d, a: baseline.total, b: total })}</p>`;
    } else if (!baseline) {
      deltaLine = `<p class="fc-delta">${t("mirror.first", "This is your starting point. The next mirrors will show the change.")}</p>`;
    }
    // Quiz mode: the score alone answers nothing — pair it with where to go.
    // The matching realm, the first real-world steps people actually use, and
    // (only when the fear reads loud) the see-a-clinician line.
    let quizNext = "";
    if (mOpts.quiz) {
      const steps = bridgeOf(phobiaKey).slice(0, 3).map((s) =>
        `<li>${escapeHtml(s.t)}</li>`).join("");
      const clinLine = band.tone === "hot"
        ? `<p class="fc-clin">${t("quiz.clin", "A fear this loud deserves real support: a trained clinician can pace exposure safely with you — and this self-check is a good conversation starter.")}</p>`
        : "";
      quizNext = `
        <div class="quiz-next">
          <p class="quiz-next-head">${tf("quiz.realm", "This fear lives in <strong>{realm}</strong> — {epithet}.", { realm: escapeHtml(realm.realmName), epithet: escapeHtml(realm.epithet) })}</p>
          <p class="quiz-next-sub">${t("quiz.steps", "The first real-world steps people use to face it:")}</p>
          <ol class="quiz-steps">${steps}</ol>
          ${clinLine}
          <div class="actions" style="margin-top:10px">
            <button class="btn-primary" id="quizEnter">${realmOpen(phobiaKey)
              ? tf("quiz.enter", "Step into {realm}", { realm: escapeHtml(realm.realmName) })
              : tf("quiz.enterSoon", "{realm} — opening soon", { realm: escapeHtml(realm.realmName) })}</button>
            <button class="btn-ghost" id="quizValley">${t("quiz.valley", "🗺 See the whole valley")}</button>
          </div>
        </div>`;
    }
    res.innerHTML = `
      <div class="fc-score band-${band.tone}"><strong>${total}</strong><span>/ 20 — ${band.label}</span></div>
      ${deltaLine}
      ${quizNext}`;
    res.hidden = false;
    if (mOpts.quiz) {
      const enter = res.querySelector("#quizEnter");
      if (enter) enter.addEventListener("click", () => { close(); go("ladder", { phobia: phobiaKey }); });
      const valley = res.querySelector("#quizValley");
      if (valley) valley.addEventListener("click", () => { close(); go("select"); });
      // hide the questions so the result reads as its own page
      const itemsEl = overlay.querySelector(".fc-items");
      if (itemsEl) itemsEl.style.display = "none";
    }
    saveBtn.textContent = t("mirror.done", "Done");
    saveBtn.onclick = () => {
      close();
      const route = parseRoute(location.hash);
      render(route.view, route.params);
    };
    overlay.querySelector("#fcCancel").style.display = "none";
  };
}

// Modal dialog for setting / editing a per-phobia goal
function openGoalEditor(phobiaKey) {
  const p = PHOBIAS[phobiaKey]; if (!p) return;
  const existing = getGoal(phobiaKey) || { targetRung: Math.min(p.levels.length - 1, 2), perWeek: 3 };
  const overlay = document.createElement("div");
  overlay.className = "goal-modal-overlay";
  overlay.innerHTML = `
    <div class="goal-modal">
      <h3>Set a goal — ${p.label}</h3>
      <p class="small">Goals are private to you. We'll show progress on the ladder page.</p>
      <label>Target rung
        <select id="goalRung">
          ${p.levels.map((lv, i) => `<option value="${i}" ${i === existing.targetRung ? "selected" : ""}>Rung ${i+1} — ${escapeHtml(lv.title)}</option>`).join("")}
        </select>
      </label>
      <label>Sessions per week
        <select id="goalPerWeek">
          ${[1,2,3,4,5,6,7].map(n => `<option value="${n}" ${n === existing.perWeek ? "selected" : ""}>${n}</option>`).join("")}
        </select>
      </label>
      <div class="actions">
        ${getGoal(phobiaKey) ? `<button class="btn-warn" id="goalDelete">Remove goal</button>` : ""}
        <button class="btn-ghost" id="goalCancel">Cancel</button>
        <button class="btn-primary" id="goalSave">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  function close() { overlay.remove(); }
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
  overlay.querySelector("#goalCancel").onclick = close;
  overlay.querySelector("#goalSave").onclick = () => {
    setGoal(phobiaKey, {
      targetRung: parseInt(overlay.querySelector("#goalRung").value, 10),
      perWeek: parseInt(overlay.querySelector("#goalPerWeek").value, 10),
    });
    close();
    go("ladder", { phobia: phobiaKey });
  };
  const del = overlay.querySelector("#goalDelete");
  if (del) del.onclick = () => {
    setGoal(phobiaKey, null);
    close();
    go("ladder", { phobia: phobiaKey });
  };
}

// ---------- Per-phobia goals ----------
// Stored as state.goals[phobiaKey] = { targetRung: 0..4, perWeek: 1..7 }
function getGoals() {
  return activeCharSlice().goals;
}
function getGoal(phobiaKey) { return getGoals()[phobiaKey] || null; }
function setGoal(phobiaKey, goal) {
  const g = activeCharSlice().goals;
  if (goal == null) delete g[phobiaKey];
  else g[phobiaKey] = goal;
  saveState();
}
function thisWeekSessions(phobiaKey) {
  const now = new Date();
  const sevenDaysAgo = now.getTime() - 7 * 86400000;
  return state.log.filter(l => l.phobia === phobiaKey && l.ts >= sevenDaysAgo).length;
}

// ---------- Achievement toast (game feel) ----------
// One at a time, never stacked. While a trial is being recorded they go to
// window.__achSink instead (see markCompleted) — the Complete screen shows
// them itself.
const _achQueue = [];
let _achShowing = false;
function showAchievement(title, desc, icon = "🏆", kind = "") {
  if (window.__achSink) { window.__achSink.push({ title, desc, icon, kind }); return; }
  _achQueue.push({ title, desc, icon });
  if (!_achShowing) nextAchievement();
}
function nextAchievement() {
  const a = _achQueue.shift();
  if (!a) { _achShowing = false; return; }
  _achShowing = true;
  const el = document.createElement("div");
  el.className = "achievement-toast";
  el.setAttribute("role", "status");
  el.innerHTML = `
    <span class="ach-icon">${a.icon}</span>
    <div class="ach-text">
      <strong>${a.title}</strong>
      <span>${a.desc}</span>
    </div>
  `;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => { el.remove(); nextAchievement(); }, 350);
  }, 3600);
}
