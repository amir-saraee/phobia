// The creature coach every realm runs on: the live alarm wave, read-the-moment
// prompts and trial stars (makeDogCoach / makeCreatureCoach).

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

  // ---------------- alarm model ----------------
  let h = 1;                 // sensitivity: 1 = fresh, falls toward hFloor while you stay
  let maxTonic = 0;          // the closest/most intense ground reached so far
  let tonic = 0, phasic = 0; // standing trigger vs decaying spikes
  const evN = {};            // per-kind event counts (barks habituate)
  let alarm = 0;             // what we hand PhobiaFear (0..100 target)
  let lastPulseT = -99, clock = 0;
  let fell = false;          // the alarm has come down at least once
  let peakSinceFall = 0;
  // engagement + settle
  let engaged = false, everEngaged = false, engagedSec = 0, engagedPeak = 0;
  let settledNow = false;
  const distHist = [];       // [t, dist] for escape detection
  let lastEscapeT = -99;

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
  callout.setAttribute("role", "status");
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
  const starRow = (n, fresh = -1) => goals.map((_, i) =>
    `<i class="${i < n ? "on" : ""}${i === fresh ? " new" : ""}">★</i>`).join("");
  function renderGoals() {
    const next = goals.find((g) => !g.done);
    const n = starsDone();
    goalsEl.innerHTML = `<li class="dc-stars-row"><span>${t("dc.stars", "Trial stars")}</span><span class="dc-stars" aria-label="${esc(tf("dc.starsAria", "{n} of {m} stars", { n, m: goals.length }))}">${starRow(n)}</span></li>` + goals.map((g) => {
      const cnt = g.need > 1 ? ` <span class="dc-n">${Math.min(g.n, g.need)}/${g.need}</span>` : "";
      return `<li class="dc-goal${g.done ? " done" : ""}${g.required ? " req" : ""}${g === next ? " next" : ""}"><i>${g.done ? "✓" : g.icon || "○"}</i><span>${esc(g.text)}${cnt}</span><b class="dc-gs" aria-hidden="true">★</b></li>`;
    }).join("");
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
    renderGoals();
    // No chime: exposure scenes carry world sound only. A tick in the palm,
    // a glint on the card and the star itself say it instead.
    try { if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic(12); } catch {}
    root.classList.remove("dc-ping"); void root.offsetWidth; root.classList.add("dc-ping");
    starPop(g);
    if (id === "read") retire("starsLeft");
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
  function teach(key, html, ms = 7000, urgent = false) {
    if (said.has(key)) return false;
    said.add(key);
    const stale = SUPERSEDES[key];
    if (stale) {
      for (const k of stale) said.add(k);
      calloutQueue = calloutQueue.filter((c) => !stale.includes(c.key));
    }
    if (urgent) {
      calloutQueue.unshift({ key, html, ms });
      if (calloutT > 0.4) calloutT = 0.4;
    } else {
      calloutQueue.push({ key, html, ms });
    }
    return true;
  }
  function pumpCallout(dt) {
    if (calloutT > 0) {
      calloutT -= dt;
      if (calloutT <= 0) callout.classList.remove("show");
      return;
    }
    if (!calloutQueue.length || readOpen || readResultT > 0) return;
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return;
    const c = calloutQueue.shift();
    calloutKey = c.key;
    callout.innerHTML = c.html;
    callout.classList.add("show");
    calloutT = c.ms / 1000;
  }

  // The player's own prediction, named back to them as the trial opens —
  // the trial is the test of it.
  if (o.expect && o.expect.fear) {
    try {
      if (K.place) teach("prediction", tf("dc.tPredictPlace",
        "Your alarm's prediction: <b>“{f}”</b>{b}. This trial is the test — notice what actually happens.",
        { f: esc(K.fearText(o.expect.fear)), b: o.expect.belief != null ? tf("dc.tPredictSure", " — {n}% sure", { n: o.expect.belief }) : "" }), 9000);
      else teach("prediction", tf("dc.tPredict",
        "Your alarm's prediction: <b>“{f}”</b>{b}. This trial is the test — keep an eye on what {dog} actually does.",
        { f: esc(K.fearText(o.expect.fear)), b: o.expect.belief != null ? tf("dc.tPredictSure", " — {n}% sure", { n: o.expect.belief }) : "", dog: nameH }), 9000);
    } catch {}
  }

  // ---------------- reading the dog ----------------
  let readOpen = null;       // { id, t0, until }
  let readCooldown = 3;      // seconds before the first prompt may appear
  let readResultT = 0;
  const readPos = { x: null, y: null };
  const seenThisTrial = new Set();
  function signal(id, s = {}) {
    const S = K.signals[id];
    if (!S) return false;
    if (readOpen || readResultT > 0 || readCooldown > 0) return false;
    if (s.onScreen === false) return false;
    if (s.dist != null && s.dist > 9.5) return false;
    // Variety: a signal already read this trial comes back only rarely.
    if (seenThisTrial.has(id) && Math.random() < 0.7) return false;
    readOpen = { id, t0: clock, until: clock + (o.coarse ? 11 : 9) };
    seenThisTrial.add(id);
    callout.classList.remove("show"); calloutT = 0;
    readPos.x = null;
    readBox.innerHTML = `
      <div class="dc-read-q"><span class="dc-read-eye">👁</span> ${tf(K.readQKey || "dc.readQ", K.readQ || "<b>{dog}</b>: {look}. How is it feeling?", { dog: esc(o.title || o.dogName), look: esc(K.place ? (() => { const l = K.signalText(id, "look"); return l.charAt(0).toUpperCase() + l.slice(1); })() : K.signalText(id, "look")) })}</div>
      <div class="dc-read-opts">${Object.keys(K.classes).map((c) =>
        `<button type="button" class="dc-opt dc-${K.classes[c].tone || c}" data-c="${c}"><span>${K.classes[c].dot}</span> ${esc(K.classLabel(c))}${o.coarse ? "" : ` <kbd>${K.classes[c].key}</kbd>`}</button>`).join("")}</div>
      <div class="dc-read-timer"><i></i></div>`;
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
    readResultT = 5.5;
    readCooldown = 7 + Math.random() * 4;
    if (right && ev.readsRight === 1) teach("firstRead", K.texts.firstRead(), 7500);
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
      if (engagedPeak < 12) return true;           // nothing to settle
      if (sec >= minHold * 2.4) return true;       // never hostage to a stubborn wave
      return settledNow;
    },
    label: (sec, minHold, eng, ready) => {
      const zone = o.inZoneDist.toFixed(1).replace(/\.0$/, "");
      const HT = o.holdText || K.holdText;   // place realms word it by place (a rung may word its own)
      if (!everEngaged) return { label: HT ? HT.begin() : tf("dc.hBegin", "Walk within {m} m of {dog} to begin — at your pace", { m: zone, dog: o.dogName }), pill: t("dc.pWalk", "walk in") };
      if (!eng) return { label: HT ? HT.back() : tf("dc.hBack", "Paused — come back within {m} m of {dog} to carry on", { m: zone, dog: o.dogName }), pill: t("dc.pPaused", "paused") };
      if (sec < minHold) return { label: HT ? tf("dc.hStayPlace", "{s} / {n}s · just stay", { s: sec, n: minHold }) : tf("dc.hStay", "{s} / {n}s with {dog} · just stay", { s: sec, n: minHold, dog: o.dogName }), pill: `${sec}/${minHold}s` };
      if (!ready) return { label: t("dc.hSettle", "Stay — let the alarm come down to the line on its own"), pill: t("dc.pSettle", "settling…") };
      return null;
    },
    progress: (sec, minHold) => {
      const tp = Math.min(1, sec / minHold) * 0.72;
      if (sec < minHold || engagedPeak < 12) return tp + (sec >= minHold ? 0.28 : 0);
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
    engaged = engaged ? dist < o.inZoneDist + 0.6 : dist < o.inZoneDist;
    if (engaged) { engagedSec += d; everEngaged = true; }
    const cur = window.PhobiaFear ? window.PhobiaFear.get() : alarm;
    if (engaged) engagedPeak = Math.max(engagedPeak, cur);
    ev.peak = Math.max(ev.peak, Math.round(cur));
    ev.end = Math.round(cur);
    ev.engagedSec = Math.round(engagedSec);
    if (dist < ev.minDist) ev.minDist = dist;
    if (s.dogGazing && dist < 5) ev.stareSec += d;

    // Settled: well under the in-zone peak, and no spike in the last moments.
    const line = settleLine();
    const grounding = !!(window.PhobiaFear && window.PhobiaFear.isGrounding && window.PhobiaFear.isGrounding());
    settledNow = engaged && engagedPeak >= 12 && cur <= line && (clock - lastPulseT) > 2.5 && !grounding;
    if (settledNow && !settledLatched && engagedSec > 5) {
      settledLatched = true; everSettled = true;
      ev.settledAt = Math.round(clock);
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
      // One star still open, and it's one the animal can still give: say so,
      // once, and leave the choice with the player.
      const open = goals.filter((x) => !x.done && x.id !== "settle");
      if (!K.place && open.length === 1 && open[0].id === "read") {
        teach("starsLeft", tf("dc.tStarsLeft",
          "Trial held — continue whenever you like. <b>One star is still open:</b> {g}. Stay a little longer if you want all three.",
          { g: esc(open[0].text) }), 8000);
      }
    }

    // Rise / fall teaching beats
    if (engaged && cur > 22) teach("rise", K.texts.rise ? K.texts.rise() : t("dc.tRise",
      "That rise is your alarm doing its job: <b>loud, not necessarily right</b>. You don't have to do anything about it. Stay, and watch the line."), 7500);
    peakSinceFall = Math.max(peakSinceFall, cur);
    if (!fell && peakSinceFall >= 20 && cur < peakSinceFall * 0.7 && engaged) {
      fell = true;
      teach("fall", t("dc.tFall",
        "See it coming down? You didn't escape, argue or distract yourself — you <b>stayed</b>. That fall is habituation: your body updating, live."), 8000, true);
    }

    // Escape: YOU backing off fast out of the zone while the alarm is up —
    // measured from your own movement, so a dog trotting away is not you
    // escaping.
    if (s.px != null) distHist.push([clock, s.px, s.pz, dist]);
    while (distHist.length && clock - distHist[0][0] > 1.6) distHist.shift();
    let backed = 0, d0 = dist;
    if (distHist.length && s.px != null && s.dogX != null) {
      const h0 = distHist[0];
      d0 = h0[3];
      const ux = s.px - s.dogX, uz = s.pz - s.dogZ, ul = Math.hypot(ux, uz) || 1;
      backed = ((s.px - h0[1]) * ux + (s.pz - h0[2]) * uz) / ul;   // + = moved away from the dog
    }
    if (everEngaged && !engaged && backed > 1.1 && d0 < o.inZoneDist + 0.8 && cur > 30 && clock - lastEscapeT > 6) {
      lastEscapeT = clock;
      ev.escapes++;
      h = Math.min(1, h + 0.14);          // relief without learning: it'll be back
      mark("escape");
      teach("escape", K.texts.escape(), 10000, true);
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

    // HUD
    wordEl.textContent = word(cur);
    root.style.setProperty("--dc-c", colorFor(cur));
    legendEl.classList.toggle("on", engagedPeak >= 12 && !settledLatched);
    draw();

    // Float the card in the band under the top HUD row, following the dog
    // across (clamped clear of this panel), eased so it doesn't jitter with
    // the gait. It used to sit just above the dog's head — which, with the
    // dog at your feet or the camera behind you, put it squarely over the dog
    // you were meant to be reading, and over your own character.
    if ((readOpen || readResultT > 0) && s.anchorX != null && s.stageW) {
      const bw = readBox.offsetWidth || 420, bh = readBox.offsetHeight || 96;
      const panelW = (root.offsetWidth && s.stageW > 700) ? root.offsetWidth + 16 : 0;
      const lo = bw / 2 + 8, hi = s.stageW - bw / 2 - 8 - panelW;
      const tx = hi > lo ? Math.max(lo, Math.min(hi, s.anchorX)) : s.stageW / 2;
      let ty = Math.max(bh + 96, Math.min(bh + 104, s.anchorY - 16));
      // ...and its bottom edge (ty — the card is translated up by its own
      // height) above an open command bar: on a phone held sideways the bar
      // clipped the answer row.
      const stEl = root.parentElement;
      const barTop = stEl ? parseFloat(stEl.style.getPropertyValue("--cmdbar-top")) : 0;
      if (barTop > 0 && stEl.clientHeight) ty = Math.max(bh + 8, Math.min(ty, stEl.clientHeight - barTop - 8));
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
      const bar = readBox.querySelector(".dc-read-timer i");
      if (bar) bar.style.width = (k * 100).toFixed(1) + "%";
      if (clock > readOpen.until) { readOpen = null; readBox.classList.remove("show"); readCooldown = 4; }
    }
    if (readResultT > 0) { readResultT -= d; if (readResultT <= 0) readBox.classList.remove("show", "result"); }
    pumpCallout(d);
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
    if (!everEngaged || clock - lastSafetyT < 4) return;
    lastSafetyT = clock;
    const cur = window.PhobiaFear ? window.PhobiaFear.get() : alarm;
    ev.notes["safety_" + kind] = (ev.notes["safety_" + kind] || 0) + 1;
    if (cur < 18) return;
    ev.escapes++;
    h = Math.min(1, h + 0.12);
    mark("escape");
    teach("escape", K.texts.escape(), 10000, true);
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
  function evidence() {
    const out = Object.assign({}, ev);
    delete out._running; delete out._close; delete out._runFrom; delete out._lastRunT; delete out._explicitRuns;
    out.minDist = isFinite(ev.minDist) ? +ev.minDist.toFixed(1) : null;
    out.stareSec = Math.round(ev.stareSec);
    out.goals = goals.map((g) => ({ id: g.id, done: !!g.done, text: g.text }));
    out.stars = starsDone();
    return out;
  }
  function dispose() {
    window.removeEventListener("keydown", onKey);
    try { root.remove(); callout.remove(); readBox.remove(); } catch {}
  }
  return {
    update, pulse, signal, answer, note, teach, goalDone, goalCount, setTrust, setFoot, safety,
    target: () => alarm, holdPolicy, evidence, dispose,
    get engaged() { return engaged; }, get alarm() { return alarm; },
    get readOpen() { return !!readOpen; }, get settled() { return settledLatched; },
    get readId() { return readOpen ? readOpen.id : null; },
    get stars() { return starsDone(); }, get starsTotal() { return goals.length; },
    // Did the alarm genuinely come down (or never rise far enough to need to)?
    get everSettled() { return everSettled || engagedPeak < 12; },
  };
}

export { makeDogCoach, makeCreatureCoach };
