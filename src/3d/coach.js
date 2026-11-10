// The creature coach every realm runs on: the live alarm wave, read-the-moment
// prompts and trial stars (makeDogCoach / makeCreatureCoach).

import * as THREE from "three";

// =============================================================================
// ---------- The dog coach: the alarm wave, the trial card, reading the dog ----
// =============================================================================
// The dog realm used to ask one thing of the player — stand near the dog for
// 6–22 s — while it modelled their fear as a number that only ever CLIMBED
// the longer they stayed. Exposure teaches the opposite, and the game was
// saying the right thing in text ("fear is a wave") while showing the wrong
// thing on screen. The coach owns that loop for the dog scene:
//   • an honest alarm: it rises as you close the distance, then falls on its
//     own while you stay (habituation); a step onto new ground brings a fresh,
//     smaller wave; repeated barks spike less each time; escaping drops it
//     fast but teaches nothing, so it comes straight back when you return;
//   • the wave, drawn live, so the player can watch the lesson happen;
//   • the trial card — what this trial asks, ticked off as it happens;
//   • reading the dog — the scene reports real body language as it plays and
//     the player names it (relaxed / alert / uneasy). Telling "alert" from
//     "attack" is a core part of treating this fear, and it turns time near
//     the dog into attention ON the dog instead of waiting it out;
//   • the evidence — what the dog actually did, for the reality check against
//     the player's own prediction once the trial is over.
// The same coach runs every creature realm; what differs is the KIT (see
// creatureKit in the classic script): the body-language catalogue and read
// classes, the feared outcomes, and the teaching lines that name the animal.
// `dogName` is the name used in sentences ("the spider" for creatures with
// no name); `title` (optional) is what the card's footer shows.
function makeDogCoach(opts) { return makeCreatureCoach(Object.assign({ kit: creatureKit("dogs") }, opts)); }
function makeCreatureCoach(opts) {
  const o = Object.assign({
    stage: null, levelIdx: 0, intensity: "calm", dogName: "the dog", title: null,
    inZoneDist: 3.0, sizeMul: 0.6, tau: 16, hFloor: 0.35, minHold: 12,
    coarse: false, goals: [], fears: null, kit: null,
    nearD: 0.8, farSpan: 5.5,          // closeness ramps from full at nearD to none at nearD+farSpan

  }, opts || {});
  const K = o.kit || creatureKit("dogs");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const nameH = esc(o.dogName);
  // The lane (engine.js): one transient line on screen at a time.
  const lane = () => (window.PhobiaFX && window.PhobiaFX.lane) || null;
  // A trial the player has already held: the lessons were read last time —
  // only the moments that matter now (escape, settled) speak.
  const replay = (() => {
    try {
      const m = /#\/(\w+)\/exposure\/(\d+)/.exec(location.hash || "");
      return !!(m && typeof getProgress === "function" && (getProgress(m[1]).highestCompleted ?? -1) >= +m[2]);
    } catch { return false; }
  })();

  // ---------------- alarm model ----------------
  let h = 1;                 // sensitivity: 1 = fresh, falls toward hFloor while you stay
  let maxTonic = 0;          // the closest/most intense ground reached so far
  let tonic = 0, phasic = 0; // standing trigger vs decaying spikes
  const evN = {};            // per-kind event counts (barks habituate)
  let alarm = 0;             // what we hand PhobiaFear (0..100 target)
  let lastPulseT = -99, clock = 0;
  let fell = false;          // the alarm has come down at least once
  let peakSinceFall = 0;
  let baseAtPeak = 0, distAtPeak = 99, fallT = 0;   // closeness + distance at that peak; how long the fall has held
  // engagement + settle
  let engaged = false, everEngaged = false, engagedSec = 0, engagedPeak = 0;
  let settledNow = false;
  const distHist = [];       // [t, dist] for escape detection
  let lastEscapeT = -99;
  let lastAwayT = -99;       // the creature last off on the player's errand (fetch)
  // Grounding (Esc) drains PhobiaFear toward 0 — the panic stop. That number
  // is not a reading of the alarm: the peak, the settle, the fall beat and
  // "nothing to settle" must never come from it, or a player who walked in
  // mid-exercise got the settle star with the alarm never measured. A
  // reading counts again once the value has climbed back to the model's.
  let wasGrounding = false, groundEndT = -99;
  let measuredSec = 0;       // engaged seconds with a trusted reading
  const CALM_SEC = Math.min(6, o.minHold * 0.5);
  // Measured and low (not just never measured): the trial had nothing to settle.
  const calmMeasured = () => engagedPeak < 12 && measuredSec >= CALM_SEC;

  // ---------------- evidence ----------------
  const ev = {
    level: o.levelIdx, dog: o.dogName, barks: 0, ranAtYou: 0, cameClose: 0, minDist: Infinity,
    jumped: 0, bit: 0, stareSec: 0, escapes: 0, reads: 0, readsRight: 0,
    signals: [], peak: 0, end: 0, settledAt: null, engagedSec: 0, newGround: 0,
    wave: [], marks: [], kinds: {}, notes: {},
  };
  let waveAcc = 0;

  // ---------------- DOM ----------------
  const stage = o.stage;
  const root = document.createElement("div");
  root.className = "dog-coach";
  root.innerHTML = `
    <div class="dc-head"><span class="dc-title">${t("dc.alarm", "Your alarm")}</span><span class="dc-level"><b class="dc-word">${t("dc.calm", "calm")}</b></span></div>
    <canvas class="dc-wave" aria-hidden="true"></canvas>
    <div class="dc-legend"><span class="dc-l-line">${t("dc.settleLine", "settle line")}</span></div>
    <ul class="dc-goals" aria-label="${esc(t("dc.goalsAria", "This trial"))}"></ul>
    <div class="dc-foot"><span class="dc-dog">${esc(o.title || o.dogName)}</span><span class="dc-trust" title="${esc(t("dc.trustTip", "How well you two know each other"))}"></span></div>`;
  const canvas = root.querySelector(".dc-wave");
  const wordEl = root.querySelector(".dc-word");
  const goalsEl = root.querySelector(".dc-goals");
  const trustEl = root.querySelector(".dc-trust");
  const legendEl = root.querySelector(".dc-legend");
  const callout = document.createElement("div");
  callout.className = "dc-callout";
  callout.setAttribute("role", "status"); callout.setAttribute("aria-live", "polite");
  const readBox = document.createElement("div");
  readBox.className = "dc-read";
  if (stage) { stage.appendChild(root); stage.appendChild(callout); stage.appendChild(readBox); }
  // Tap the card header on phones to show/hide the goals — the wave stays.
  root.querySelector(".dc-head").addEventListener("click", () => root.classList.toggle("dc-open"));

  // ---------------- goals = the trial's stars ----------------
  // Every trial asks three things — this rung's skill, reading the moment,
  // staying until the alarm settles — and each one met is a star. Stars only
  // ever reward approach and attention (never speed, never a low rating), and
  // a trial with a star still open is a reason to come back: repetition is
  // the part of exposure that does the work.
  const goals = (o.goals || []).map((g) => Object.assign({ n: 0, need: 1, done: false }, g));
  const starsDone = () => goals.filter((g) => g.done).length;
  // Skill goals with no hotbar verb that are still the player's to take
  // after the hold (the "one star still open" nudge names them too).
  const STILL_ON_OFFER = ["glassLook", "scan"];
  // A skill goal that names a hotbar verb (`verb: "treat"`) lights that
  // button while the goal is open, so "what do I do here?" has an answer on
  // screen without another line of text; when the star lands the button
  // ticks. A two-step goal moves the light on with setVerb().
  const verbBtn = (cmd) => cmd ? document.querySelector(`.scene-cmd-bar .cmd-btn[data-cmd="${cmd}"]`) : null;
  let litVerb = null;
  function syncVerb() {
    const g = goals.find((x) => !x.done && x.verb);
    const want = g ? g.verb : null;
    if (want === litVerb && (!want || (verbBtn(want) || {}).classList?.contains("cmd-goal"))) return;
    const old = verbBtn(litVerb); if (old) old.classList.remove("cmd-goal");
    litVerb = want;
    const b = verbBtn(want); if (b) b.classList.add("cmd-goal");
  }
  function setVerb(id, cmd) {
    const g = goals.find((x) => x.id === id);
    if (!g || g.done || g.verb === cmd) return;
    g.verb = cmd; syncVerb();
  }
  const starRow = (n, fresh = -1) => goals.map((_, i) =>
    `<i class="${i < n ? "on" : ""}${i === fresh ? " new" : ""}">★</i>`).join("");
  function renderGoals() {
    const next = goals.find((g) => !g.done);
    const n = starsDone();
    goalsEl.innerHTML = `<li class="dc-stars-row"><span><span class="dc-lamp" aria-hidden="true" title="${esc(t("dc.lampTip", "This trial's flame — it lights when you've held the trial"))}">🏮</span> <span class="dc-stars-lbl">${t("dc.stars", "Trial stars")}</span></span><span class="dc-stars" aria-label="${esc(tf("dc.starsAria", "{n} of {m} stars", { n, m: goals.length }))}">${starRow(n)}</span></li>` + goals.map((g) => {
      const cnt = g.need > 1 ? ` <span class="dc-n">${window.fnum(Math.min(g.n, g.need))}/${window.fnum(g.need)}</span>` : "";
      return `<li class="dc-goal${g.done ? " done" : ""}${g.required ? " req" : ""}${g === next ? " next" : ""}"><i>${g.done ? "✓" : g.icon || "○"}</i><span>${esc(g.text)}${cnt}</span><b class="dc-gs" aria-hidden="true">★</b></li>`;
    }).join("");
    syncVerb();
  }
  renderGoals();
  // A star landing: a gold card drops in at the top of the view, one at a
  // time (two goals can land in the same second), and the coach card glints.
  let popFreeAt = 0;
  function starPop(g) {
    if (!stage) return;
    const n = starsDone(), all = n === goals.length;
    const html = `<span class="sp-row">${starRow(n, n - 1)}</span><span class="sp-txt"><b>${all ? t("dc.starAll", "All three stars!") : t("dc.starOne", "Star earned")}</b><span>${esc(g.text)}</span></span>`;
    const now = performance.now();
    const wait = Math.max(0, popFreeAt - now);
    popFreeAt = now + wait + 1500;
    setTimeout(() => {
      if (!root.isConnected) return;
      stage.querySelectorAll(".star-pop").forEach((e) => e.remove());
      const el = document.createElement("div");
      el.className = "star-pop" + (all ? " all" : "");
      el.setAttribute("role", "status");
      el.innerHTML = html;
      stage.appendChild(el);
      setTimeout(() => { try { el.remove(); } catch {} }, 2900);
    }, wait);
  }
  function goalDone(id) {
    const g = goals.find((x) => x.id === id);
    if (!g || g.done) return;
    g.n = g.need; g.done = true;
    // The verb's button ticks as its star lands (a brief check, then plain).
    if (g.verb) {
      const b = verbBtn(g.verb);
      if (b) { b.classList.remove("cmd-goal"); b.classList.add("cmd-goal-done"); setTimeout(() => { try { b.classList.remove("cmd-goal-done"); } catch {} }, 1600); }
    }
    renderGoals();
    // No chime: exposure scenes carry world sound only. A tick in the palm,
    // a glint on the card and the star itself say it instead.
    try { if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic(12); } catch {}
    root.classList.remove("dc-ping"); void root.offsetWidth; root.classList.add("dc-ping");
    starPop(g);
    // A star landing makes a queued/showing "one star still open" stale. Only
    // then: retiring it before it was ever said marked it said, so any star
    // earned before the hold silenced the nudge for the whole trial.
    if (id !== "settle" && said.has("starsLeft")) retire("starsLeft");
    // Held, and this star leaves exactly one open: that's the moment to say so
    // (two were open at the hold, then the read landed — it never came).
    if (heldSeen) nudgeOpen();
  }
  // One star still open, and it's one the animal can still give: say so,
  // once, and leave the choice with the player.
  // A verb goal is always still on offer — it's the player's move, not
  // the animal's — so it gets the same one-line nudge; so do the skill
  // goals that are the player's move without a hotbar verb (look down
  // through the glass, lie through a scan).
  function nudgeOpen() {
    const open = goals.filter((x) => !x.done && x.id !== "settle");
    if (open.length === 1 && (open[0].id === "read" || open[0].id === "threeSounds" || open[0].verb || STILL_ON_OFFER.includes(open[0].id))) {
      teach("starsLeft", tf("dc.tStarsLeft",
        "Trial held — continue whenever you like. <b>One star is still open:</b> {g}. Stay a little longer if you want all three.",
        { g: esc(open[0].text) }), 8000);
    }
  }
  function goalCount(id, n) {
    const g = goals.find((x) => x.id === id);
    if (!g || g.done) return;
    g.n = n;
    if (g.n >= g.need) goalDone(id); else renderGoals();
  }

  // ---------------- callouts (teaching moments, each once per trial) ----------------
  const said = new Set();
  let calloutT = 0, calloutQueue = [], calloutKey = null;
  // A tip about a moment that has passed is worse than none: drop it from
  // the queue, and cut it short if it's the one on screen.
  function retire(key) {
    said.add(key);
    calloutQueue = calloutQueue.filter((c) => c.key !== key);
    if (calloutKey === key && calloutT > 0.4) calloutT = 0.4;
  }
  // `urgent` beats (you just escaped; it's falling; it settled) are about
  // THIS moment — they jump the queue and cut the current tip short rather
  // than landing fifteen seconds late behind it.
  // A later beat makes earlier ones stale: "it's coming down" retires a
  // still-queued "that rise…", and "settled" retires both.
  const SUPERSEDES = { fall: ["rise"], settled: ["rise", "fall", "newGround"] };
  // At most a few lessons a trial. Up to ten could queue back-to-back, so a
  // text box was on screen for most of a trial; the urgent beats (you just
  // stepped back, it settled) always get through.
  const LESSON_CAP = replay ? 0 : 3;
  let lessons = 0;
  function teach(key, html, ms = 7000, urgent = false) {
    if (said.has(key)) return false;
    // The play invite is an offer, not a lesson — it isn't counted; nor is
    // the "one star still open" nudge (counted, it rarely got through the cap,
    // and never on a replay, where the cap is 0).
    const counted = !urgent && key !== "play" && key !== "starsLeft";
    if (counted && lessons >= LESSON_CAP) { said.add(key); return false; }
    said.add(key);
    if (counted) lessons++;
    const stale = SUPERSEDES[key];
    if (stale) {
      for (const k of stale) said.add(k);
      calloutQueue = calloutQueue.filter((c) => !stale.includes(c.key));
    }
    if (urgent) {
      calloutQueue.unshift({ key, html, ms, urgent: true });
      // Cut the lesson on screen short — unless it is itself an urgent one
      // that only just went up: "Settled" cut "See it coming down?" after
      // under a second (two praise lines, the first lost). It goes next.
      if (calloutT > 0.4 && !(calloutCur && calloutCur.urgent && clock - calloutShownAt < 3)) calloutT = 0.4;
      // ...and a read's answer card steps aside for it (it held "sliding
      // you out now" ~4.5 s). An open question still goes first.
      if (readResultT > 0) {
        readResultT = 0; readBox.classList.remove("show", "result");
        const L = lane(); if (L) L.release("read");
      }
    } else {
      calloutQueue.push({ key, html, ms });
    }
    return true;
  }
  // An escape (stepping back, the door, the ball) makes a pending "settled"
  // or "fall" wrong: they praise staying for a drop that came from leaving,
  // and being urgent they jumped ahead of the escape lesson itself. Drop a
  // queued one — unshown, it may still come later for a real settle — and
  // cut one short that's on screen.
  function retireStayPraise() {
    for (const k of ["settled", "fall"]) {
      if (calloutQueue.some((c) => c.key === k)) {
        calloutQueue = calloutQueue.filter((c) => c.key !== k);
        said.delete(k);
        if (k === "fall") { fell = false; peakSinceFall = 0; fallT = 0; }
      }
      if (calloutCur && calloutCur.key === k && calloutT > 0.4) calloutT = 0.4;
    }
  }
  // Room to breathe between lessons: back-to-back they kept a text box on
  // screen for most of a trial. The urgent beats skip the wait.
  let calloutGap = 0, calloutCur = null, calloutShownAt = 0;
  const dropCallout = () => {
    callout.classList.remove("show");
    // Pushed off by a question in its first seconds: it comes back after.
    if (calloutCur && clock - calloutShownAt < 2) calloutQueue.unshift(calloutCur);
    calloutCur = null; calloutT = 0;
  };
  let groundQuietT = 0;
  const introHintUp = () => {
    const hi = stage && stage.querySelector(".controls-hint");
    return !!hi && hi.style.opacity !== "0" && !!hi.textContent.trim();
  };
  function pumpCallout(dt, grounding) {
    // Never over the grounding exercise: the 5-4-3-2-1 is the one thing on
    // screen. A lesson showing steps back into the queue (if it hadn't been
    // read yet) and the queue waits until a beat after the exercise ends.
    if (grounding) {
      if (calloutCur) {
        callout.classList.remove("show");
        if (calloutT > 2) calloutQueue.unshift(calloutCur);
        calloutCur = null; calloutT = 0;
        const L = lane(); if (L) L.release("callout");
      }
      groundQuietT = 1.5;
      return;
    }
    if (groundQuietT > 0) { groundQuietT -= dt; return; }
    if (calloutGap > 0) calloutGap -= dt;
    if (calloutT > 0) {
      calloutT -= dt;
      if (calloutT <= 0) {
        callout.classList.remove("show"); calloutCur = null; calloutGap = 5;
        const L = lane(); if (L) L.release("callout");
      }
      return;
    }
    if (!calloutQueue.length || readOpen || readResultT > 0) return;
    if (calloutGap > 0 && !calloutQueue[0].urgent) return;
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return;
    // The trial's orientation line (the engine's .controls-hint) stays up
    // until the player first moves. A lesson waits for it: the first seconds
    // of a trial carry one line, not "walk closer…" and Mira's prediction
    // side by side.
    if (!calloutQueue[0].urgent && introHintUp()) return;
    // Wait for the lane: a question or another beat on screen goes first;
    // a lesson outranks a caption or a context beat and takes the slot.
    const L = lane();
    const ms = Math.min(7000, calloutQueue[0].ms);
    // The lesson runs on scene time (slower than the wall clock when frames
    // drop), so it holds the slot with a margin and releases it itself.
    if (L && !L.claim("callout", ms + 4000, dropCallout)) return;
    const c = calloutQueue.shift();
    calloutCur = c; calloutShownAt = clock;
    calloutKey = c.key;
    // These are Mira's lessons — the story's lantern-keeper, beside you in
    // the room — so they carry her face (the baked 3D portrait once it
    // exists; see Story.upgradeFaces).
    const S = window.Story;
    const face = S && S.portrait ? S.portrait("mira", 30) : "";
    callout.innerHTML = face ? `<span class="dc-mira" aria-hidden="true">${face}</span><span class="dc-say">${c.html}</span>` : c.html;
    if (face) { try { S.upgradeFaces(callout); } catch {} }
    callout.classList.add("show");
    calloutT = ms / 1000;
  }

  // The player's own prediction, named back to them as the trial opens —
  // the trial is the test of it. The trial's opening card asks for it while
  // the scene is already mounted behind the card, so it can also arrive
  // later, through setExpect(), the moment the player steps in.
  let expectNamed = false;
  function nameThePrediction(e) {
    if (expectNamed || !e || !e.fear) return;
    expectNamed = true;
    o.expect = e;
    try {
      if (K.place) teach("prediction", tf("dc.tPredictPlace",
        "Your alarm's prediction: <b>“{f}”</b>{b}. This trial is the test — notice what actually happens.",
        { f: esc(K.fearText(o.expect.fear)), b: o.expect.belief != null ? tf("dc.tPredictSure", " — {n}% sure", { n: o.expect.belief }) : "" }), 9000);
      else teach("prediction", tf("dc.tPredict",
        "Your alarm's prediction: <b>“{f}”</b>{b}. This trial is the test — keep an eye on what {dog} actually does.",
        { f: esc(K.fearText(o.expect.fear)), b: o.expect.belief != null ? tf("dc.tPredictSure", " — {n}% sure", { n: o.expect.belief }) : "", dog: nameH }), 9000);
    } catch {}
  }
  if (o.expect && o.expect.fear) nameThePrediction(o.expect);

  // ---------------- reading the dog ----------------
  let readOpen = null;       // { id, t0, until }
  // seconds before the first prompt may appear. A traveler's first trial
  // ever gets room to look around and take a step before the quiz starts.
  let readCooldown = (o.novice != null ? o.novice : window.__lwNovice) ? 16 : 6;
  let readResultT = 0;
  const readPos = { x: null, y: null };
  const seenThisTrial = new Set();
  // Reading questions are the game's quiz — and they used to reopen every
  // 10–25 s for the whole trial, long after their star was earned. Now: none
  // in the first moments, a real gap between them, never over one of Mira's
  // lessons, and once the read star has landed only a rare one (a moment
  // worth naming) for the rest of the trial.
  let readsOffered = 0;
  const readStarDone = () => { const g = goals.find((x) => x.id === "read"); return !g || g.done; };
  function signal(id, s = {}) {
    const S = K.signals[id];
    if (!S) return false;
    if (readOpen || readResultT > 0 || readCooldown > 0) return false;
    // Never a quiz over the grounding exercise (it used to cover the text).
    if (window.PhobiaFear && window.PhobiaFear.isGrounding && window.PhobiaFear.isGrounding()) return false;
    if (stage && stage.classList.contains("breathing")) return false;   // nor over the breath
    if (s.onScreen === false) return false;
    if (s.dist != null && s.dist > 9.5) return false;
    // Variety: a signal already read this trial comes back only rarely.
    if (seenThisTrial.has(id) && Math.random() < 0.7) return false;
    if (readStarDone() && (replay || readsOffered >= 3 || Math.random() < 0.6)) return false;
    const L = lane();
    // Until its star lands, reading the animal outranks a lesson on screen
    // (the lesson steps back and returns); after that a lesson isn't cut.
    if (L && L.busy("callout") && (readStarDone() || L.kind === "read")) return false;
    const openFor = o.coarse ? 11 : 9;
    if (L && !L.claim("read", (openFor + 4) * 1000, null)) return false;
    readOpen = { id, t0: clock, until: clock + openFor };
    readsOffered++;
    seenThisTrial.add(id);
    readPos.x = null;
    readBox.innerHTML = `
      <div class="dc-read-q"><span class="dc-read-eye">👁</span> ${tf(K.readQKey || "dc.readQ", K.readQ || "<b>{dog}</b>: {look}. How is it feeling?", { dog: esc(o.title || o.dogName), look: esc(K.place ? (() => { const l = K.signalText(id, "look"); return l.charAt(0).toUpperCase() + l.slice(1); })() : K.signalText(id, "look")) })}</div>
      <div class="dc-read-opts">${Object.keys(K.classes).map((c) =>
        `<button type="button" class="dc-opt dc-${K.classes[c].tone || c}" data-c="${c}"><span>${K.classes[c].dot}</span> ${esc(K.classLabel(c))}${o.coarse ? "" : ` <kbd>${K.classes[c].key}</kbd>`}</button>`).join("")}</div>
      <div class="dc-read-timer"><i></i></div>`;
    readBox._sz = null;
    readBox.querySelectorAll(".dc-opt").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); answer(b.dataset.c); }));
    readBox.classList.remove("result");
    readBox.classList.add("show");
    try { if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic(8); } catch {}
    return true;
  }
  function answer(cls) {
    if (!readOpen) return;
    const id = readOpen.id, S = K.signals[id];
    readOpen = null;
    const right = cls === S.cls;
    ev.reads++; if (right) ev.readsRight++;
    if (!ev.signals.includes(id)) ev.signals.push(id);
    const isNew = K.recordRead(id, right);
    mark("read");
    // Reading it right takes the edge off: an accurate appraisal is exactly
    // how the alarm recalibrates. A "give space" signal read right relieves
    // too — knowing what to do IS the safety, not the distance itself.
    if (right) {
      h = Math.max(o.hFloor, h - 0.05);
      phasic *= 0.6;
      goalCount("read", ev.readsRight);
    }
    const cl = K.classes[S.cls];
    readBox.innerHTML = `
      <div class="dc-read-res ${right ? "ok" : "no"}">
        <div class="dc-res-top">${right ? "✓" : "↺"} <b>${esc(K.signalText(id, "name"))}</b> · ${cl.dot} ${esc(K.classLabel(S.cls))}${isNew ? ` <span class="dc-new">${t("dc.newSignal", "new in your field guide")}</span>` : ""}</div>
        <div class="dc-res-means">${esc(K.signalText(id, "means"))}</div>
      </div>`;
    readBox.classList.add("result");
    readBox._sz = null;
    readResultT = 4.5;
    { const L = lane(); if (L) L.claim("read", 8000, null); }
    readCooldown = readStarDone() ? 30 + Math.random() * 6 : 8 + Math.random() * 3;
    if (right && ev.readsRight === 1) teach("firstRead", K.texts.firstRead(), 7500);
  }
  // Close an open question quietly, without credit: the moment it asked
  // about has passed (grounding began, you stepped out, the torch came on —
  // answered then, it still counted).
  // Let a read's answer card step aside (as an urgent lesson already makes
  // it): the spider's crouch warning sat 4.5 s behind "✓ A sudden dash" and
  // the jump came unannounced. An open question is left alone.
  function endReadResult() {
    if (!(readResultT > 0)) return false;
    readResultT = 0; readBox.classList.remove("show", "result");
    const L = lane(); if (L) L.release("read");
    return true;
  }
  function closeRead() {
    if (!readOpen) return false;
    readOpen = null;
    readBox.classList.remove("show");
    readCooldown = Math.max(readCooldown, 8);
    const L = lane(); if (L) L.release("read");
    return true;
  }
  function onKey(e) {
    if (!readOpen || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key;
    const cls = Object.keys(K.classes).find((c) => K.classes[c].key === k);
    if (cls) { e.preventDefault(); answer(cls); }
  }
  window.addEventListener("keydown", onKey);

  // ---------------- wave drawing ----------------
  const live = [];           // last ~60 s @ 4 Hz
  const liveMarks = [];      // {i, kind}
  let liveAcc = 0, liveIdx = 0;
  function mark(kind) {
    liveMarks.push({ i: liveIdx, kind });
    ev.marks.push({ t: +clock.toFixed(1), kind });
    if (ev.marks.length > 200) ev.marks.shift();
  }
  function colorFor(v) {
    // teal → amber → coral
    const a = Math.max(0, Math.min(1, v / 100));
    const lerp = (x, y, k) => Math.round(x + (y - x) * k);
    let r, g, b;
    if (a < 0.5) { const k = a / 0.5; r = lerp(124, 245, k); g = lerp(209, 176, k); b = lerp(197, 75, k); }
    else { const k = (a - 0.5) / 0.5; r = lerp(245, 239, k); g = lerp(176, 107, k); b = lerp(75, 91, k); }
    return `rgb(${r},${g},${b})`;
  }
  function draw() {
    const W = canvas.clientWidth || 200, H = canvas.clientHeight || 50;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // The window grows with the trial (20 s → 60 s), so the first wave fills
    // the chart instead of sitting in a sliver at the right edge.
    const N = Math.max(80, Math.min(240, live.length)), pad = 3;
    const y = (v) => H - pad - (Math.max(0, Math.min(100, v)) / 100) * (H - pad * 2);
    const x0 = W - (live.length / N) * W;
    // settle line
    if (engagedPeak >= 12 && !settledLatched) {
      const sy = y(settleLine());
      g.strokeStyle = "rgba(124,209,197,.55)"; g.setLineDash([3, 3]); g.lineWidth = 1;
      g.beginPath(); g.moveTo(0, sy); g.lineTo(W, sy); g.stroke(); g.setLineDash([]);
    }
    if (live.length > 1) {
      // fill
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "rgba(239,107,91,.28)"); grad.addColorStop(0.5, "rgba(245,176,75,.18)"); grad.addColorStop(1, "rgba(124,209,197,.10)");
      g.beginPath(); g.moveTo(x0, H);
      for (let i = 0; i < live.length; i++) g.lineTo(x0 + (i / N) * W, y(live[i]));
      g.lineTo(x0 + ((live.length - 1) / N) * W, H); g.closePath();
      g.fillStyle = grad; g.fill();
      // line, coloured by value
      g.lineWidth = 2; g.lineJoin = "round"; g.lineCap = "round";
      for (let i = 1; i < live.length; i++) {
        g.strokeStyle = colorFor(live[i]);
        g.beginPath(); g.moveTo(x0 + ((i - 1) / N) * W, y(live[i - 1])); g.lineTo(x0 + (i / N) * W, y(live[i])); g.stroke();
      }
      // head dot
      const hx = x0 + ((live.length - 1) / N) * W, hy = y(live[live.length - 1]);
      g.fillStyle = colorFor(live[live.length - 1]);
      g.beginPath(); g.arc(hx, hy, 3, 0, Math.PI * 2); g.fill();
    }
    // markers
    const first = liveIdx - live.length;
    g.font = "9px system-ui, sans-serif"; g.textAlign = "center";
    for (const m of liveMarks) {
      const i = m.i - first; if (i < 0) continue;
      const mx = x0 + (i / N) * W;
      const glyph = m.kind === "escape" ? "↩" : m.kind === "read" ? "◆" : (m.kind === "run" || m.kind === "lunge") ? "»" : m.kind === "settle" ? "✓" : m.kind === "spike" ? "•" : "·";
      g.fillStyle = m.kind === "escape" ? "rgba(239,107,91,.95)" : m.kind === "read" ? "rgba(165,180,252,.95)" : m.kind === "settle" ? "rgba(52,211,153,.95)" : "rgba(255,255,255,.75)";
      g.fillText(glyph, mx, 10);
    }
  }

  const hudCache = { word: null, col: null, legend: null, sig: null };
  // ---------------- settle / hold policy ----------------
  let settledLatched = false, everSettled = false, heldSeen = false;
  let lastHoldSec = 0;       // the hold timer's own credited seconds (wall clock)
  function settleLine() { return Math.max(10, engagedPeak * 0.5); }
  function word(v) {
    return v < 15 ? t("dc.calm", "calm") : v < 35 ? t("dc.uneasy", "uneasy") : v < 55 ? t("dc.alarmed", "alarmed") : v < 75 ? t("dc.high", "high") : t("dc.peak", "peak");
  }
  const holdPolicy = {
    engaged: () => engaged,
    ready: (sec, minHold) => {
      lastHoldSec = sec;
      // Nothing to settle — measured low, not merely unmeasured (a walk-in
      // under grounding had a "peak" of 0 from the drained value).
      if (calmMeasured()) return true;
      if (sec >= minHold * 2.4) return true;       // never hostage to a stubborn wave
      return settledNow;
    },
    label: (sec, minHold, eng, ready) => {
      const zone = o.inZoneDist.toFixed(1).replace(/\.0$/, "");
      const HT = o.holdText || K.holdText;   // place realms word it by place (a rung may word its own)
      if (!everEngaged) return { label: HT ? HT.begin() : tf("dc.hBegin", "Walk within {m} m of {dog} to begin — at your pace", { m: zone, dog: o.dogName }), pill: t("dc.pWalk", "walk in") };
      if (!eng) return { label: HT ? HT.back() : tf("dc.hBack", "Paused — come back within {m} m of {dog} to carry on", { m: zone, dog: o.dogName }), pill: t("dc.pPaused", "paused") };
      if (sec < minHold) return { label: HT ? tf("dc.hStayPlace", "{s} / {n}s · just stay", { s: sec, n: minHold }) : tf("dc.hStay", "{s} / {n}s with {dog} · just stay", { s: sec, n: minHold, dog: o.dogName }), pill: `${window.fnum(sec)}/${window.fsecs(minHold)}` };
      if (!ready) return { label: t("dc.hSettle", "Stay — let the alarm come down to the line on its own"), pill: t("dc.pSettle", "settling…") };
      return null;
    },
    progress: (sec, minHold) => {
      const tp = Math.min(1, sec / minHold) * 0.72;
      if (sec < minHold || engagedPeak < 12) return tp + (sec >= minHold && calmMeasured() ? 0.28 : 0);
      const line = settleLine();
      const k = Math.max(0, Math.min(1, (engagedPeak - alarm) / Math.max(1, engagedPeak - line)));
      return 0.72 + 0.28 * k;
    },
  };

  // ---------------- per-frame ----------------
  // s: { dist, gaze (0..1), dogToward (m/s the dog closes on you), playerSpeed,
  //      onScreen, dogGazing, trust }
  function update(dt, s) {
    const d = Math.min(0.1, dt || 0.016);
    clock += d;
    if (readCooldown > 0) readCooldown -= d;
    // Tonic trigger: closeness scaled by how big/intense this rung's dog is,
    // plus a little for facing it (looking straight at the fear is harder).
    const dist = s.dist != null ? s.dist : 99;
    const close = Math.max(0, Math.min(1, 1 - (dist - o.nearD) / o.farSpan));
    const closeK = Math.pow(close, 1.15);
    const base = o.sizeMul * closeK * (0.86 + 0.14 * (s.gaze || 0));
    // A dog closing on you is its own trigger (bigger when it's quick). It
    // rides on top and does not count as "new ground".
    const toward = Math.max(0, s.dogToward || 0);
    const rushR = o.nearD + o.farSpan * 0.8;
    const rush = (toward > 0.35 * (o.farSpan / 5.5) && dist < rushR) ? Math.min(0.22, toward * 0.09 * (5.5 / o.farSpan)) * (1 - dist / (rushR * 1.2)) : 0;
    tonic = base + rush;
    // New ground → a fresh wave, sized by how much further in it is.
    if (base > maxTonic + 0.035) {
      const jump = (base - maxTonic) * 1.5;
      if (maxTonic > 0.08 && jump > 0.05 && toward < 0.3) {
        ev.newGround++;
        if (fell) teach("newGround", K.texts.newGround ? K.texts.newGround() : t("dc.tNewGround",
          "Closer means a fresh wave — smaller than the first. Up, then down again. That's how a ladder is climbed: one wave at a time."), 7500);
      }
      h = Math.min(1, h + jump);
      maxTonic = base;
    }
    const exposed = tonic > 0.1;
    if (exposed) h -= (h - o.hFloor) * (d / o.tau);          // habituation while you stay
    else h += (1 - h) * (d / 120);                         // slow drift back while away
    phasic -= phasic * d * 0.42;                           // spikes decay (~2.4 s)
    alarm = Math.max(0, Math.min(100, (tonic * h + phasic) * 100));

    // engagement (the hold's definition of being IN the exposure)
    // Hysteresis: in at the zone line, out only a step past it, so a dog
    // pacing at the edge doesn't flicker the hold between "paused" and not.
    const wasEngaged = engaged;
    // A dog sent after a ball or a treat is away on YOUR errand: you were
    // told to stay put, so the hold doesn't pause ("come back within 3 m")
    // while it runs it back.
    if (s.dogAway) lastAwayT = clock;
    engaged = engaged ? (dist < o.inZoneDist + 0.6 || !!s.dogAway) : dist < o.inZoneDist;
    if (engaged) {
      engagedSec += d;
      // (Read by the engine's "walk closer" hint: once the exposure has
      // begun — you walked in, or the creature came to you — it retires.)
      if (!everEngaged && stage) { try { stage.dataset.engaged = "1"; } catch {} }
      everEngaged = true;
    }
    // Back in the zone (from outside, or the spider's glass lifted): the fall
    // beat measures from this stretch only — a peak from out there (the
    // glass-drop startle) read as "you stayed, it came down" on re-entry.
    if (engaged && !wasEngaged) { peakSinceFall = 0; fallT = 0; }
    const cur = window.PhobiaFear ? window.PhobiaFear.get() : alarm;
    // Grounding: the drained value is not a reading (see wasGrounding). After
    // the exercise PhobiaFear climbs back to the model fast (rise rate 4/s);
    // until it has caught up — or 3 s on — nothing is read from it.
    const grounding = !!(window.PhobiaFear && window.PhobiaFear.isGrounding && window.PhobiaFear.isGrounding());
    // A question under the exercise is hidden by CSS but still answerable
    // by key: close it quietly — the next one comes after.
    if (grounding && !wasGrounding) closeRead();
    if (!grounding && wasGrounding) {
      groundEndT = clock;
      // The fall beat starts over: a drop measured across the exercise is
      // the exercise's, and "you didn't distract yourself" would be untrue.
      peakSinceFall = 0; fallT = 0;
      // A breath before the next question, too (not a quiz the instant the
      // exercise ends).
      readCooldown = Math.max(readCooldown, 3);
    }
    wasGrounding = grounding;
    const trusted = !grounding && (clock - groundEndT > 3 || cur >= alarm - 2);
    if (engaged && trusted) { engagedPeak = Math.max(engagedPeak, cur); measuredSec += d; }
    ev.peak = Math.max(ev.peak, Math.round(cur));
    ev.end = Math.round(cur);
    ev.engagedSec = Math.round(engagedSec);
    if (dist < ev.minDist) ev.minDist = dist;
    if (s.dogGazing && dist < 5) ev.stareSec += d;

    // Your own movement over the last moments (+ = away from the animal):
    // the escape test below, and the settle guard — the zone's hysteresis
    // keeps you "engaged" a step past the line, so walking out could read
    // as settling on the way (the alarm drops with every step back).
    if (s.px != null) distHist.push([clock, s.px, s.pz, dist]);
    while (distHist.length && clock - distHist[0][0] > 1.6) distHist.shift();
    let backed = 0, d0 = dist;
    if (distHist.length && s.px != null && s.dogX != null) {
      const h0 = distHist[0];
      d0 = h0[3];
      const ux = s.px - s.dogX, uz = s.pz - s.dogZ, ul = Math.hypot(ux, uz) || 1;
      backed = ((s.px - h0[1]) * ux + (s.pz - h0[2]) * uz) / ul;   // + = moved away from the dog
    }

    // Settled: well under the in-zone peak, and no spike in the last moments.
    // Not from a grounding-drained value, and — like the fall beat — not on
    // the way out (an escape or safety step in the last 8 s, or backing off
    // right now): that drop is relief, and "You stayed" said the opposite.
    const line = settleLine();
    settledNow = engaged && trusted && engagedPeak >= 12 && cur <= line && (clock - lastPulseT) > 2.5
      && clock - lastSafetyT > 8 && clock - lastEscapeT > 8 && backed < 0.5
      // ...nor because the dog ran off after the ball: that fall isn't
      // "same dog, same distance — a quieter alarm".
      && clock - lastAwayT > 5;
    if (settledNow && !settledLatched && engagedSec > 5) {
      settledLatched = true; everSettled = true;
      // In seconds of staying, the same clock as "You stayed" on the done
      // screen — scene time (walk-in included) read as settling after you'd left.
      ev.settledAt = Math.round(engagedSec);
      if (window.__rungHoldComplete) goalDone("settle");   // settled after a long-stay finish
      mark("settle");
      root.classList.add("dc-settled");
      teach("settled", K.texts.settled ? K.texts.settled() : tf("dc.tSettled",
        "<b>Settled.</b> Same {dog}, same distance — a quieter alarm. You didn't fight it or flee it. You stayed, and your body did the rest.",
        { dog: nameH }), 8000, true);
    }
    if (settledLatched && cur > line + 12) { settledLatched = false; root.classList.remove("dc-settled"); }
    // The hold can also finish on the long-stay fallback (a stubborn alarm).
    // Staying that long is exactly the thing the star is for — so it lands,
    // and the goal says honestly how it was earned.
    if (window.__rungHoldComplete && !heldSeen) {
      heldSeen = true;
      const sg = goals.find((x) => x.id === "settle");
      if (sg && !sg.done && !everSettled && engagedPeak >= 12 && lastHoldSec >= o.minHold * 2.4) {
        sg.text = t("dc.gStayedLong", "Stayed the long way — a stubborn alarm today");
        goalDone("settle");
      }
      nudgeOpen();
    }

    // Rise / fall teaching beats
    if (engaged && cur > 22) teach("rise", K.texts.rise ? K.texts.rise() : t("dc.tRise",
      "That rise is your alarm doing its job: <b>loud, not necessarily right</b>. You don't have to do anything about it. Stay, and watch the line."), 7500);
    if (engaged && trusted && cur > peakSinceFall) { peakSinceFall = cur; baseAtPeak = base; distAtPeak = dist; }
    // Not while they're on the way out: a fall that comes with stepping
    // back (the MRI ball, the door) is relief, and praising it as "you
    // stayed" told the player the opposite of what just happened.
    // And only a fall that is habituation: the closeness that raised the
    // peak is still there (the dog trotting off after the ball dropped the
    // alarm too — that's distance, not learning). The model's own target
    // must agree (the smoothed value lags it on the way back up), and the
    // drop has to hold for a second.
    const fallNow = !fell && trusted && engaged && peakSinceFall >= 20
      && Math.max(cur, alarm) < peakSinceFall * 0.7 && base >= baseAtPeak * 0.85
      // …and in metres too: closeness carries the gaze term, so 85% of it still
      // passed with the dog ~1.9 m off, galloping after the ball (verify pass).
      && dist <= distAtPeak + 0.35
      && clock - lastSafetyT > 8 && clock - lastEscapeT > 8;
    fallT = fallNow ? fallT + d : 0;
    if (fallT > 1) {
      fell = true;
      teach("fall", t("dc.tFall",
        "See it coming down? You didn't escape, argue or distract yourself — you <b>stayed</b>. That fall is habituation: your body updating, live."), 8000, true);
    }

    // Escape: YOU backing off fast out of the zone while the alarm is up —
    // measured from your own movement (`backed`, above), so a dog trotting
    // away is not you escaping.
    // (Once the hold is met, leaving is finishing — not an escape to teach.)
    if (everEngaged && !engaged && backed > 1.1 && d0 < o.inZoneDist + 0.8 && cur > 30 && clock - lastEscapeT > 6
        && !window.__rungHoldComplete) {
      lastEscapeT = clock;
      ev.escapes++;
      h = Math.min(1, h + 0.14);          // relief without learning: it'll be back
      closeRead();                        // a question about the moment you just left
      mark("escape");
      teach("escape", K.texts.escape(), 10000, true);
      retireStayPraise();
    }

    // evidence: the dog running at you — a fast approach that started a
    // real distance out and arrived close. (A follower's small catch-up
    // steps are not "running at you".)
    if (!ev._explicitRuns && !ev._running && toward > 1.5 && dist > 2.6 && dist < 7) { ev._running = true; ev._runFrom = dist; }
    if (ev._running) {
      if (dist < 2.5 && clock - (ev._lastRunT || -99) > 3) { ev.ranAtYou++; ev._lastRunT = clock; ev._running = false; mark("run"); }
      else if (toward < 0.2 || dist > ev._runFrom + 0.5) ev._running = false;
    }
    const cc = o.nearD + o.farSpan * 0.07;
    if (dist < cc + 0.4) { if (!ev._close) { ev.cameClose++; ev._close = true; } } else if (dist > cc + 1.0) ev._close = false;

    // waves
    liveAcc += d;
    while (liveAcc >= 0.25) {
      liveAcc -= 0.25; live.push(cur); liveIdx++;
      if (live.length > 240) live.shift();
      while (liveMarks.length && liveMarks[0].i < liveIdx - 240) liveMarks.shift();
    }
    waveAcc += d;
    if (waveAcc >= 0.5) { waveAcc -= 0.5; ev.wave.push(Math.round(cur)); if (ev.wave.length > 720) ev.wave.splice(0, 2); }

    // HUD — only what changed. The wave gains a sample every 0.25 s, yet it
    // was cleared and re-stroked (240 segments) every frame, and the word,
    // colour and legend were rewritten into the DOM 60 times a second.
    const hw = word(cur), hc = colorFor(Math.round(cur));
    if (hw !== hudCache.word) { hudCache.word = hw; wordEl.textContent = hw; }
    if (hc !== hudCache.col) { hudCache.col = hc; root.style.setProperty("--dc-c", hc); }
    const legendOn = engagedPeak >= 12 && !settledLatched;
    if (legendOn !== hudCache.legend) { hudCache.legend = legendOn; legendEl.classList.toggle("on", legendOn); }
    const sig = liveIdx + "|" + liveMarks.length + "|" + (legendOn ? Math.round(settleLine()) : -1);
    if (sig !== hudCache.sig) { hudCache.sig = sig; draw(); }

    // Float the card in the band under the top HUD row, following the dog
    // across (clamped clear of this panel), eased so it doesn't jitter with
    // the gait. It used to sit just above the dog's head — which, with the
    // dog at your feet or the camera behind you, put it squarely over the dog
    // you were meant to be reading, and over your own character.
    // The animal's whole projected body (contract: anchorBox, stage CSS px),
    // when the realm sends it; the head point alone missed the body.
    const B = s.anchorBox && s.anchorBox.r > s.anchorBox.l && s.anchorBox.b > s.anchorBox.t ? s.anchorBox : null;
    const anchX = s.anchorX != null ? s.anchorX : (B ? (B.l + B.r) / 2 : null);
    if ((readOpen || readResultT > 0) && anchX != null && s.stageW) {
      // Sizes are measured once per card (content change), not every frame:
      // reading layout right after this frame's style writes forced a
      // synchronous reflow 60 times a second while a question was open.
      // …and again when the stage itself changes size: a card left open
      // through a rotation kept the portrait height and hung below the stage.
      if (readBox._sz && (readBox._sz.sw !== s.stageW || readBox._sz.sh !== s.stageH)) readBox._sz = null;
      if (!readBox._sz) {
        readBox._sz = { bw: readBox.offsetWidth || 420, bh: readBox.offsetHeight || 96, pw: root.offsetWidth || 0, pb: (root.offsetTop || 0) + (root.offsetHeight || 0), ch: (root.parentElement && root.parentElement.clientHeight) || 0, sw: s.stageW, sh: s.stageH };
        // The touch thumb lane — Ground me over the joystick, bottom-left.
        // Only an open hotbar used to be kept clear, so on a rung without
        // one (the barking dog) the card's answers sat under Ground me and a
        // tap on "Relaxed" started grounding.
        let lane = null;
        const stg = root.parentElement;
        if (stg) for (const el of stg.querySelectorAll(":scope > .ground-btn, :scope > .joystick")) {
          if (!el.offsetWidth) continue;
          const lt = el.offsetTop, lr = el.offsetLeft + el.offsetWidth;
          lane = lane ? { t: Math.min(lane.t, lt), r: Math.max(lane.r, lr) } : { t: lt, r: lr };
        }
        readBox._sz.lane = lane;
      }
      const { bw, bh } = readBox._sz;
      const panelW = (readBox._sz.pw && s.stageW > 700) ? readBox._sz.pw + 16 : 0;
      const lo = bw / 2 + 8, hi = s.stageW - bw / 2 - 8 - panelW;
      let tx = hi > lo ? Math.max(lo, Math.min(hi, anchX)) : s.stageW / 2;
      let ty = Math.max(bh + 96, Math.min(bh + 104, (s.anchorY != null ? s.anchorY : B ? B.t : 0) - 16));
      // A narrow stage can't seat the card beside the coach panel — put it
      // under the panel instead of over it.
      if (s.stageW <= 700 && readBox._sz.pb) ty = Math.max(ty, readBox._sz.pb + 8 + bh);
      // ...and its bottom edge (ty — the card is translated up by its own
      // height) above an open command bar: on a phone held sideways the bar
      // clipped the answer row.
      const stEl = root.parentElement;
      const barTop0 = stEl ? parseFloat(stEl.style.getPropertyValue("--cmdbar-top")) : 0;
      // What the card's bottom edge must stay above: the open hotbar, and on
      // a tall enough stage the thumb lane too (else it sits beside the lane,
      // below). A stage too short to seat the card under the top HUD row and
      // over the bar (a phone held sideways) moves the bar aside while the
      // question is up — it used to push the card over the camera switch.
      const chh0 = readBox._sz.ch || s.stageH || 0;
      const lane = readBox._sz.lane;
      const HUD_ROW = 60;
      const hideBar = barTop0 > 0 && chh0 > 0 && chh0 - barTop0 - 8 - bh < HUD_ROW;
      const wrapEl = stEl && stEl.parentElement;
      if (wrapEl && wrapEl.classList.contains("stage-wrap")) wrapEl.classList.toggle("read-hides-bar", hideBar);
      let barTop = hideBar ? 0 : (barTop0 > 0 ? barTop0 : 0);
      const laneUp = lane && chh0 > 0 ? chh0 - lane.t + 8 : 0;
      const laneAbove = laneUp > 0 && chh0 - laneUp - bh >= HUD_ROW;
      if (laneAbove) barTop = Math.max(barTop, laneUp);
      if (barTop > 0 && readBox._sz.ch) ty = Math.max(bh + 8, Math.min(ty, readBox._sz.ch - barTop - 8));
      // Never over the animal it asks about: the band above clamps the card
      // to a fixed height, and a dog whose head sat in that band (the far dog
      // on rung 1, almost every creature on a portrait phone) was hidden
      // behind the question. Slide beside it; else above; else below.
      const ay = s.anchorY;
      let overPanel = false;
      if (B) {
        // With the body's box: beside it, else above, else below (each kept
        // inside the stage, under the HUD band / coach panel, above an open
        // command bar), else wherever it covers least — a big dog at your
        // feet can fill the view. A spot that went clear stays chosen while
        // it stays clear, so the card doesn't hop with the gait.
        const pb = readBox._sz.pb || 0;
        const chh = readBox._sz.ch || s.stageH || 0;
        const maxBot = chh ? chh - (barTop > 0 ? barTop : 0) - 8 : Infinity;
        let minBot = (s.stageW <= 700 && pb) ? pb + 8 + bh : bh + 96;
        if (maxBot < minBot) minBot = Math.max(bh + 8, maxBot);
        const hiFull = s.stageW - bw / 2 - 8;
        const fit = (cx, by) => {
          by = Math.max(minBot, Math.min(Math.max(minBot, maxBot), by));
          // Below the coach panel the card may use the full width.
          const h2 = (panelW && by - bh >= pb + 8) ? hiFull : hi;
          cx = h2 > lo ? Math.max(lo, Math.min(h2, cx)) : s.stageW / 2;
          return [cx, by];
        };
        const over = (p, m) => {
          const ox = Math.min(p[0] + bw / 2, B.r + m) - Math.max(p[0] - bw / 2, B.l - m);
          const oy = Math.min(p[1], B.b + m) - Math.max(p[1] - bh, B.t - m);
          // (Under half a pixel is touching, not covering: a spot set exactly
          // at the margin came out a float hair inside it.)
          return ox > 0.5 && oy > 0.5 ? ox * oy : 0;
        };
        const M = 12;
        if (readPos.x == null) readPos.kind = null;
        // Each spot is worked out from the box as it is now, so a side spot
        // follows the animal; the kind chosen is remembered.
        const spot = {
          home: () => fit(tx, ty),
          right: () => fit(B.r + M + bw / 2, ty),
          left: () => fit(B.l - M - bw / 2, ty),
          above: () => fit(tx, B.t - M),
          below: () => fit(tx, B.b + M + bh),
        };
        const prev = readPos.kind;
        let kind = null;
        // Home (following the animal across, as without a box) when clear —
        // with a little extra room before leaving a side spot for it; else
        // the side it already sits on, while that stays clear (half margin,
        // so a pixel of growth in the box doesn't send it gliding across).
        if (over(spot.home(), prev && prev !== "home" ? M + 24 : M) === 0) kind = "home";
        else if (prev && prev !== "home" && spot[prev] && over(spot[prev](), M / 2) === 0) kind = prev;
        else kind = ["right", "left", "above", "below"].find((k) => over(spot[k](), M) === 0) || null;
        // A small phone has no clear spot between the coach card and the
        // thumb lane: the question may rise over the coach card (which fades
        // while it's up) rather than cover the animal it asks about.
        if (!kind && s.stageW <= 700 && pb && minBot > HUD_ROW + bh) {
          const keepMin = minBot;
          minBot = Math.max(bh + 8, Math.min(HUD_ROW + bh, maxBot));
          kind = ["home", "right", "left", "above", "below"].find((k) => over(spot[k](), M) === 0) || null;
          if (kind) overPanel = spot[kind]()[1] - bh < pb + 4;
          else minBot = keepMin;
        }
        let pick = kind ? spot[kind]() : null;
        if (!pick) {
          let best = Infinity;
          for (const x of [lo, hiFull, tx, B.r + M + bw / 2, B.l - M - bw / 2]) {
            for (const y of [ty, B.t - M, B.b + M + bh, maxBot]) {
              const p = fit(x, y);
              const a = over(p, 0) + 0.01 * (Math.abs(p[0] - (readPos.x ?? tx)) + Math.abs(p[1] - (readPos.y ?? ty)));
              if (a < best) { best = a; pick = p; }
            }
          }
        }
        readPos.kind = kind;
        tx = pick[0]; ty = pick[1];
        // Moving to a new spot (the animal rose, or walked under the card):
        // jump rather than glide when the glide would pass over the body.
        if (readPos.x != null && kind !== prev && over([(readPos.x + tx) / 2, (readPos.y + ty) / 2], 0) > 0) { readPos.x = tx; readPos.y = ty; }
      } else if (ay != null && ay > 0 && s.anchorX != null) {
        const covers = (bot) => (bot - bh) < ay + 70 && bot > ay - 60;
        if (covers(ty) && Math.abs(tx - s.anchorX) < bw / 2 + 40) {
          const right = s.anchorX + bw / 2 + 70, left = s.anchorX - bw / 2 - 70;
          const ch = readBox._sz.ch || s.stageH || 0;
          const maxBot = ch ? ch - (barTop > 0 ? barTop : 0) - 8 : Infinity;
          if (hi > lo && right <= hi) tx = right;
          else if (hi > lo && left >= lo) tx = left;
          else if (ay - 70 >= ((s.stageW <= 700 && readBox._sz.pb) ? readBox._sz.pb + 8 + bh : bh + 96)) ty = ay - 70;
          else if (ay + 110 + bh <= maxBot) ty = ay + 110 + bh;
        }
      }
      root.classList.toggle("under-read", overPanel);
      // A short stage: beside the thumb lane rather than over it.
      if (lane && !laneAbove && ty > lane.t - 4 && tx - bw / 2 < lane.r + 8) {
        const nx = lane.r + 8 + bw / 2;
        if (nx + bw / 2 <= s.stageW - 8) tx = nx;
      }
      if (readPos.x == null) { readPos.x = tx; readPos.y = ty; }
      readPos.x += (tx - readPos.x) * Math.min(1, d * 6);
      readPos.y += (ty - readPos.y) * Math.min(1, d * 6);
      readBox.style.left = readPos.x.toFixed(0) + "px";
      readBox.style.top = readPos.y.toFixed(0) + "px";
      readBox.style.bottom = "auto";
    }
    // read prompt lifetime
    if (readOpen) {
      const k = Math.max(0, (readOpen.until - clock) / (readOpen.until - readOpen.t0));
      const bar = readBox._bar && readBox._bar.isConnected ? readBox._bar : (readBox._bar = readBox.querySelector(".dc-read-timer i"));
      if (bar) bar.style.transform = `scaleX(${k.toFixed(3)})`;
      if (stage && stage.classList.contains("breathing")) readOpen.until += d;   // the question waits out a breath
      if (clock > readOpen.until) { readOpen = null; readBox.classList.remove("show"); readCooldown = readStarDone() ? 30 : 8; const L = lane(); if (L) L.release("read"); }
    }
    if (readResultT > 0) { readResultT -= d; if (readResultT <= 0) { readBox.classList.remove("show", "result"); const L = lane(); if (L) L.release("read"); } }
    pumpCallout(d, grounding);
    if (s.trust != null) setTrust(s.trust);
  }
  // Discrete spikes, habituated per kind: the fifth bark lands at about a
  // third of the first. Scaled by distance so a bark across the room is less
  // than one at arm's length.
  function pulse(strength = 0.3, kind = "event", dist = null) {
    const n = evN[kind] = (evN[kind] || 0) + 1;
    const hab = 1 / (1 + 0.42 * (n - 1));
    const near = dist == null ? 1 : Math.max(0.35, Math.min(1, 1 - (dist - 1) / 7));
    phasic = Math.min(0.85, phasic + strength * 0.95 * hab * near);
    lastPulseT = clock;
    ev.kinds[kind] = (ev.kinds[kind] || 0) + 1;
    if (kind === "bark") ev.barks++;
    // The kit's repeating trigger (a bark, a dart, a hiss) is marked on the
    // wave, and the third one names habituation out loud.
    if (K.habKinds && K.habKinds.includes(kind)) {
      mark(K.lungeKinds && K.lungeKinds.includes(kind) ? "lunge" : "spike");
      const all = K.habKinds.reduce((a, k2) => a + (evN[k2] || 0), 0);
      if (all === 3) teach("barkHab", K.texts.hab(), 8000);
    } else if (K.lungeKinds && K.lungeKinds.includes(kind)) {
      mark("lunge");
    }
  }
  // A safety behaviour the scene can see (light on in the dark, door opened
  // in a tight space): the same relief-without-learning as backing off.
  let lastSafetyT = -99;
  function safety(kind) {
    if (!everEngaged || clock - lastSafetyT < 4 || window.__rungHoldComplete) return;
    lastSafetyT = clock;
    closeRead();                          // stale: the door/light/ball changed the moment
    const cur = window.PhobiaFear ? window.PhobiaFear.get() : alarm;
    ev.notes["safety_" + kind] = (ev.notes["safety_" + kind] || 0) + 1;
    if (cur < 18) return;
    ev.escapes++;
    h = Math.min(1, h + 0.12);
    mark("escape");
    teach("escape", K.texts.escape(), 10000, true);
    retireStayPraise();
  }
  // A creature with no bond to track (spider, snake) shows its mood instead.
  function setFoot(txt) { trustEl.textContent = txt || ""; trustEl.classList.add("dc-note"); lastTrustN = -2; }
  let lastTrustN = -1;
  function setTrust(v) {
    const n = Math.round(Math.max(0, Math.min(1, v)) * 5);
    if (n === lastTrustN) return;
    lastTrustN = n;
    trustEl.textContent = "♥".repeat(n) + "♡".repeat(5 - n);
  }
  // Discrete facts the scene knows better than any heuristic. A reported run
  // also switches the velocity guess off, so it is never double-counted.
  function note(kind) {
    ev.notes[kind] = (ev.notes[kind] || 0) + 1;
    if (kind === "jump") ev.jumped++;
    if (kind === "run") { ev.ranAtYou++; ev._explicitRuns = true; ev._running = false; mark("run"); }
  }
  // The animal's box on screen, for the read card (anchorBox): the realm
  // calls this with the creature's group and passes the result to update().
  // The world box is pose-true — sampled skinned vertices, since these rigs'
  // bind-pose bbox is far off — re-measured ~6×/s and kept as offsets from
  // the group, so it follows the animal in between; its 8 corners are
  // projected every frame. Only while a card is up: it is the only reader.
  const _sbV = new THREE.Vector3(), _sbO = new THREE.Vector3();
  const sb = { obj: null, t: -99, ok: false, lo: [0, 0, 0], hi: [0, 0, 0] };
  function measureBox(obj) {
    const root = (obj.userData && obj.userData.parts && obj.userData.parts.model) || obj;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    let n = 0;
    // (The rig's matrices are last render's — a frame old, fine at this rate.)
    const add = (v) => {
      n++;
      if (v.x < lo[0]) lo[0] = v.x; if (v.x > hi[0]) hi[0] = v.x;
      if (v.y < lo[1]) lo[1] = v.y; if (v.y > hi[1]) hi[1] = v.y;
      if (v.z < lo[2]) lo[2] = v.z; if (v.z > hi[2]) hi[2] = v.z;
    };
    root.traverseVisible((m) => {
      const pos = m.isMesh && m.geometry && m.geometry.attributes && m.geometry.attributes.position;
      if (!pos) return;
      if (m.isSkinnedMesh && m.skeleton) {
        const step = Math.max(1, Math.floor(pos.count / 400));
        for (let i = 0; i < pos.count; i += step) { m.getVertexPosition(i, _sbV); add(_sbV.applyMatrix4(m.matrixWorld)); }
      } else {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox;
        for (let k = 0; k < 8; k++) {
          add(_sbV.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z).applyMatrix4(m.matrixWorld));
        }
      }
    });
    if (!n || !isFinite(lo[0] + hi[0] + lo[1] + hi[1] + lo[2] + hi[2])) return false;
    obj.getWorldPosition(_sbO);
    sb.lo = [lo[0] - _sbO.x, lo[1] - _sbO.y, lo[2] - _sbO.z];
    sb.hi = [hi[0] - _sbO.x, hi[1] - _sbO.y, hi[2] - _sbO.z];
    return true;
  }
  function screenBox(obj, camera, sw, sh) {
    if (!obj || !camera || !(sw > 0) || !(sh > 0)) return null;
    if (!readOpen && !(readResultT > 0)) { sb.obj = null; return null; }
    try {
      if (sb.obj !== obj || clock - sb.t > 0.16) { sb.obj = obj; sb.t = clock; sb.ok = measureBox(obj); }
      if (!sb.ok) return null;
      obj.getWorldPosition(_sbO);
      // Mid-frame the camera's matrices can still hold an earlier pass's pose.
      camera.updateMatrixWorld();
      const near = camera.near || 0.05;
      let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
      for (let k = 0; k < 8; k++) {
        _sbV.set(_sbO.x + (k & 1 ? sb.hi[0] : sb.lo[0]), _sbO.y + (k & 2 ? sb.hi[1] : sb.lo[1]), _sbO.z + (k & 4 ? sb.hi[2] : sb.lo[2]));
        _sbV.applyMatrix4(camera.matrixWorldInverse);
        // A corner behind the lens (the animal at your feet) is pulled onto
        // the near plane: it then lands far off-screen and the box fills the view.
        if (_sbV.z > -near) _sbV.z = -near;
        _sbV.applyMatrix4(camera.projectionMatrix);
        const x = (_sbV.x + 1) / 2 * sw, y = (1 - _sbV.y) / 2 * sh;
        if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
      }
      l = Math.max(0, l); t = Math.max(0, t); r = Math.min(sw, r); b = Math.min(sh, b);
      return (r - l >= 2 && b - t >= 2) ? { l, t, r, b } : null;
    } catch { return null; }
  }
  function evidence() {
    const out = Object.assign({}, ev);
    delete out._running; delete out._close; delete out._runFrom; delete out._lastRunT; delete out._explicitRuns;
    out.minDist = isFinite(ev.minDist) ? +ev.minDist.toFixed(1) : null;
    out.stareSec = Math.round(ev.stareSec);
    // n/need ride along so the results page can say "1/2" beside a goal
    // that counts — "1/1 read right" next to an unearned read star read as a bug.
    out.goals = goals.map((g) => ({ id: g.id, done: !!g.done, text: g.text, n: g.need > 1 ? Math.min(g.n | 0, g.need) : undefined, need: g.need > 1 ? g.need : undefined }));
    out.stars = starsDone();
    return out;
  }
  function dispose() {
    window.removeEventListener("keydown", onKey);
    { const b = verbBtn(litVerb); if (b) b.classList.remove("cmd-goal"); litVerb = null; }
    { const L = lane(); if (L) { L.release("read"); L.release("callout"); } }
    try { root.remove(); callout.remove(); readBox.remove(); } catch {}
  }
  return {
    update, pulse, signal, answer, note, teach, retire, goalDone, goalCount, setVerb, setTrust, setFoot, safety, screenBox,
    cancelRead: closeRead, endReadResult, setExpect: nameThePrediction,
    goalOpen: (id) => { const g = goals.find((x) => x.id === id); return !!g && !g.done; },
    target: () => alarm, holdPolicy, evidence, dispose,
    get engaged() { return engaged; }, get alarm() { return alarm; },
    get readOpen() { return !!readOpen; }, get settled() { return settledLatched; },
    get readId() { return readOpen ? readOpen.id : null; },
    get stars() { return starsDone(); }, get starsTotal() { return goals.length; },
    // Did the alarm genuinely come down (or, measured, never rise far enough
    // to need to)? A peak of 0 read off a grounding-drained value is neither.
    get everSettled() { return everSettled || calmMeasured(); },
  };
}

export { makeDogCoach, makeCreatureCoach };
