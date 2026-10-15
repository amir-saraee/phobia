// PhobiaExperiments — the in-scene experiments engine (prediction-first decks,
// detectors, evidence).
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// ---------- Exposure scene mount ----------
// ---------- Behavioral experiments ----------
// The gameplay was "stand near it while a timer fills" — waiting, not play.
// The clinical literature's answer and the game-design answer turn out to be
// the same feature: BEHAVIOURAL EXPERIMENTS. Pick a small test ("call him
// over", "look straight down for three breaths"), say what you expect to
// happen, run it, and let the world answer. The prediction→outcome gap is
// where the learning lives (expectancy violation), and it is also what gives
// a scene verbs, goals and feedback — i.e. gameplay.
//
// Contract:
//  - Experiments are OPTIONAL bonus content. Rung completion stays the hold;
//    nothing here gates progress, and retreat never fails an experiment — the
//    run just quietly pauses until conditions resume.
//  - Prediction comes FIRST (that's the therapeutic point): a run only arms
//    after the traveller picks one of three expectations.
//  - Detection is passive, from signals the scenes already publish. The
//    module lives in the classic-script scope (needs t/awardCourage/state);
//    the 3D module scope feeds it plain numbers via window hooks:
//    begin()/frame()/signal()/end().
const PhobiaExperiments = (() => {
  // per-frame context assembled in frame(); detectors are tiny closures that
  // accumulate their own state and return progress 0..1.
  const near = (dist, sec) => (ctx, st, dt) => {
    if (ctx.dist != null && ctx.dist < dist) st.a = (st.a || 0) + dt;
    return (st.a || 0) / sec;
  };
  const gaze = (dist, sec) => (ctx, st, dt) => {
    if (ctx.dist != null && ctx.dist < dist && ctx.gazeDot > 0.72) st.a = (st.a || 0) + dt;
    return (st.a || 0) / sec;
  };
  const facingAway = (dist, sec) => (ctx, st, dt) => {
    if (ctx.dist != null && ctx.dist < dist && ctx.gazeDot < -0.25) st.a = (st.a || 0) + dt;
    return (st.a || 0) / sec;
  };
  const still = (sec) => (ctx, st, dt) => {
    st.a = ctx.speed < 0.12 ? (st.a || 0) + dt : 0;   // a step resets the stillness
    return (st.a || 0) / sec;
  };
  const endure = (sec) => (ctx, st, dt) => { st.a = (st.a || 0) + dt; return st.a / sec; };
  const traverse = (m) => (ctx, st, dt) => {
    st.a = (st.a || 0) + ctx.speed * dt;
    return st.a / m;
  };
  const pitchBelow = (rad, sec) => (ctx, st, dt) => {
    if (ctx.pitch < rad) st.a = (st.a || 0) + dt;
    return (st.a || 0) / sec;
  };
  const pitchCycles = (n) => (ctx, st, dt) => {
    st.phase = st.phase || "up";
    if (st.phase === "up" && ctx.pitch < -0.75) { st.phase = "down"; }
    else if (st.phase === "down" && ctx.pitch > -0.15) { st.phase = "up"; st.c = (st.c || 0) + 1; }
    return (st.c || 0) / n;
  };
  const onEvent = (name, n = 1) => (ctx, st) => {
    if (ctx.events.has(name)) st.c = (st.c || 0) + 1;
    return (st.c || 0) / n;
  };
  // event, then get the creature close within a window (the "he answered" test)
  const eventThenNear = (name, dist, windowSec) => (ctx, st, dt) => {
    if (ctx.events.has(name)) st.armedAt = ctx.elapsed;
    if (st.armedAt != null && ctx.elapsed - st.armedAt < windowSec
        && ctx.dist != null && ctx.dist < dist) return 1;
    return st.armedAt != null ? 0.35 : 0;
  };
  const contact = (sec) => (ctx, st, dt) => {
    if (ctx.landed > 0.55) st.a = (st.a || 0) + dt;
    return (st.a || 0) / sec;
  };
  const endureThreat = (sec, dist) => (ctx, st, dt) => {
    if (ctx.threat && ctx.dist != null && ctx.dist < dist) st.a = (st.a || 0) + dt;
    return (st.a || 0) / sec;
  };
  // Place realms have no creature to measure against: a run only advances
  // while the coach counts you IN the exposure (at the edge, in the dark,
  // door shut) — looking down from the middle of the roof doesn't count.
  const inZone = (f) => (ctx, st, dt) => {
    if (ctx.engaged) st.p = f(ctx, st, dt);
    return st.p || 0;
  };
  const slowApproach = (dist, vmax) => (ctx, st, dt) => {
    if (ctx.speed > vmax && ctx.dist != null && ctx.dist < dist + 2.5) { st.a = 0; return 0; }
    if (ctx.dist != null && ctx.dist < dist) return 1;
    if (ctx.dist != null) return Math.max(0, Math.min(0.9, 1 - (ctx.dist - dist) / 4));
    return 0;
  };

  // The decks. minRung gates availability; predictions are the three
  // expectations offered before arming; out is the factual line written into
  // evidence when the run completes. Content stays English-with-keys like the
  // whispers (translatable later); the chrome strings are t()'d at render.
  const DECKS = {
    dogs: [
      { id: "watch", minRung: 0, title: "Watch him for 20 seconds", how: "Stay anywhere in the room. Just keep him in view.",
        predictions: ["He'll come at me", "He'll mostly ignore me", "I won't manage 20s"],
        out: "You watched. He did dog things — sniffed, wandered, lay down.", make: () => gaze(8, 20) },
      { id: "call", minRung: 1, maxRung: 3, title: "Call him over", how: "Press C (or the Call button), then hold your ground.",
        predictions: ["He'll rush and jump on me", "He'll trot over, easy", "He won't listen"],
        out: "You called. He came the way dogs come to a friend.", make: () => eventThenNear("dog.call", 2.6, 12) },
      { id: "bark", minRung: 2, title: "Stay through a bark", how: "When he barks, plant your feet and breathe out slow.",
        predictions: ["A bark means a bite is next", "It'll be loud but end", "I'll have to run"],
        out: "He barked. You stayed. Loud — and only loud.", make: () => onEvent("dog.barkEndured") },
      { id: "sniff", minRung: 2, maxRung: 3, title: "Let him sniff your fist", how: "Walk close, click him to offer your hand, then hold still a moment.",
        predictions: ["He'll snap at it", "He'll sniff and move on", "I'll pull back first"],
        out: "A nose on your knuckles. That's how dogs shake hands.", make: () => contact(0.8) },
      { id: "back", minRung: 3, title: "Turn your back on him", how: "Within a few metres, face away and count five slow seconds.",
        predictions: ["He'll lunge the moment I turn", "Nothing will happen", "I won't be able to"],
        out: "Five seconds with your back turned. He didn't need watching.", make: () => facingAway(4.5, 5) },
      { id: "toss", minRung: 1, title: "Make a sudden noise near him", how: "Take something off the side table and throw it — not at him.",
        predictions: ["The clatter will set him off", "He'll startle, then settle", "He won't even care"],
        out: "It clattered. He clocked it, then let it go. Noise is information, not danger.", make: () => onEvent("prop.landed") },
    ],
    spiders: [
      { id: "sight", minRung: 0, title: "Keep it in sight for 15 seconds", how: "Any distance. Watching IS the work.",
        predictions: ["It'll dart at me", "It'll mostly hold still", "I'll look away first"],
        out: "Fifteen seconds of looking. It kept being a small thing, busy with its own life.", make: () => gaze(6, 15) },
      { id: "close", minRung: 1, title: "Stand a step away", how: "Close the distance slowly. Ten seconds there.",
        predictions: ["It'll run up at me", "It'll freeze or retreat", "I'll step back first"],
        out: "A step away, ten seconds. It wanted nothing to do with you.", make: () => near(1.0, 10) },
      { id: "stillMove", minRung: 2, title: "Hold still while it moves", how: "When it stirs, don't step back. Six seconds.",
        predictions: ["Movement means it's coming for me", "It's just relocating", "I'll flinch away"],
        out: "It moved. You didn't. Its errand had nothing to do with you.", make: () => endureThreat(4, 2.5) },
      { id: "reach", minRung: 3, title: "Half a metre, six seconds", how: "The closest you've ever chosen to stand.",
        predictions: ["It'll jump the gap", "Nothing will change", "My nerve will break"],
        out: "Half a metre. The gap stayed a gap.", make: () => near(0.6, 6) },
    ],
    snakes: [
      { id: "tongue", minRung: 0, title: "Watch the tongue work", how: "Fifteen seconds. The flicker is smell, not threat.",
        predictions: ["Tongue out means a strike", "It's just tasting the air", "I'll back off first"],
        out: "The tongue read the air and told it nothing about you mattered.", make: () => gaze(4.5, 15) },
      { id: "slow", minRung: 1, title: "Approach slowly", how: "Close to two metres — slow steps, pause between each.",
        predictions: ["Any approach triggers it", "Slow reads as calm", "I'll rush and spook it"],
        out: "You arrived slowly, and it stayed easy. Your pace was the message.", make: () => slowApproach(2.2, 0.85) },
      { id: "rear", minRung: 2, title: "Stay through the rear-up", how: "If it rises, hold your distance — don't close, don't bolt.",
        predictions: ["Rearing means it will strike", "It's a warning that passes", "I'll run"],
        out: "It rose, held, and settled. A warning is a conversation, not an attack.", make: () => endureThreat(2.5, 4.5) },
      { id: "strike", minRung: 3, title: "Stand at strike distance", how: "Ten seconds inside the range your body says is too close.",
        predictions: ["It will use the range", "Range isn't intent", "I won't last ten"],
        out: "Ten seconds in range. Range turned out not to be intent.", make: () => near(1.7, 10) },
    ],
    heights: [
      { id: "down3", minRung: 0, title: "Look straight down, three breaths", how: "At the edge, tip your gaze all the way down and breathe.",
        predictions: ["I'll get pulled toward it", "It'll surge then settle", "I can't look down"],
        out: "Three breaths looking straight down. The pull was a feeling, not a force.", make: () => inZone(pitchBelow(-0.8, 8)) },
      { id: "cycles", minRung: 1, title: "Horizon, then down — three times", how: "Look far out, then straight down. Three round trips.",
        predictions: ["Each look down gets worse", "Each one gets easier", "I'll stop at one"],
        out: "Three round trips. The third was smaller than the first — you felt it.", make: () => inZone(pitchCycles(3)) },
      { id: "stand", minRung: 2, title: "Stand still at the drop", how: "Twelve seconds, feet planted, no stepping back.",
        predictions: ["My legs will give", "Standing is just standing", "I'll retreat"],
        out: "Twelve still seconds at the drop. Your legs held — they always were going to.", make: () => inZone(still(12)) },
    ],
    dark: [
      { id: "still20", minRung: 0, title: "Stand still in it", how: "Twenty seconds, no walking, hands down.",
        predictions: ["Something will use the dark", "It's the same room, unlit", "I'll bolt for the switch"],
        out: "Twenty still seconds. The room stayed the room.", make: () => inZone(still(20)) },
      { id: "cross", minRung: 1, title: "Cross the dark without stopping", how: "Pick the far side and walk to it.",
        predictions: ["I'll walk into something", "I know this room", "I'll freeze halfway"],
        out: "You crossed it. Your feet knew the floor the whole way.", make: () => traverse(8) },
      { id: "stay", minRung: 2, title: "Give it a full minute", how: "Sixty seconds in the dark, spent however you like.",
        predictions: ["A minute is too long", "A minute is just a minute", "I'll count every second"],
        out: "A whole minute. Somewhere in the middle, it got boring — that's the win.", make: () => inZone(endure(60)) },
    ],
    enclosed: [
      { id: "still20", minRung: 0, title: "Be still in the small space", how: "Door shut, twenty seconds without moving. Notice the air keeps arriving.",
        predictions: ["The air will run short", "Air doesn't care about walls", "I'll need the door"],
        out: "Twenty still seconds. The air kept arriving, breath after breath.", make: () => inZone(still(20)) },
      { id: "walk", minRung: 0, maxRung: 2, title: "Walk its full length", how: "Door shut, pace the space end to end, unhurried.",
        predictions: ["Moving will make it tighter", "It's bigger than it feels", "I'll cut it short"],
        out: "You paced it out. It was bigger than your chest said it was.", make: () => inZone(traverse(6)) },
      { id: "rideTwice", minRung: 2, maxRung: 2, title: "Ride it twice", how: "Two rides, doors shut, one after the other.",
        predictions: ["It'll get stuck", "A lift is a lift", "Once will be enough"],
        out: "Two rides. The doors opened at every floor it stopped at.", make: () => onEvent("lift.arrive", 2) },
      { id: "stay", minRung: 1, title: "Give it a full minute", how: "Sixty seconds inside, door shut, at your own pace.",
        predictions: ["I'll be counting the walls", "It'll fade into background", "I'll leave early"],
        out: "A full minute, and the walls lost your attention before it ended.", make: () => inZone(endure(60)) },
      { id: "scans", minRung: 4, title: "Stay in through two scans", how: "Lie still while the scanner knocks — twice, start to finish.",
        predictions: ["The noise will be too much", "It's loud, not dangerous", "I'll squeeze the ball"],
        out: "Two scans, start to finish. Loud — and nothing else.", make: () => onEvent("mri.scan", 2) },
    ],
  };

  // ---- evidence storage (per character, like worldsteps) ----
  function evidenceOf(phobiaKey) {
    const cs = activeCharSlice();
    if (!cs.evidence) cs.evidence = {};
    if (!Array.isArray(cs.evidence[phobiaKey])) cs.evidence[phobiaKey] = [];
    return cs.evidence[phobiaKey];
  }
  function evidenceCount() {
    const cs = activeCharSlice();
    return Object.values(cs.evidence || {}).reduce((s, a) => s + a.length, 0);
  }
  function addEvidence(phobiaKey, line) {
    const list = evidenceOf(phobiaKey);
    list.push(line);
    if (list.length > 120) list.splice(0, list.length - 120);
    saveState();
  }
  function doneBefore(phobiaKey, id) {
    return evidenceOf(phobiaKey).some((l) => l.id === id);
  }

  // ---- live session ----
  let S = null;          // { phobiaKey, levelIdx, panel, deck, run, els, elapsed, events, lastPos, shownAt }
  let lastSession = null; // summary viewComplete reads after unmount

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function begin(phobiaKey, levelIdx, stage) {
    end();
    // maxRung keeps out tests the rung makes impossible (no calling or
    // hand-offering the excited dog on the dogs' top rung).
    const deck = (DECKS[phobiaKey] || []).filter((x) => levelIdx >= x.minRung && (x.maxRung == null || levelIdx <= x.maxRung));
    if (!deck.length || !stage) return;
    const panel = el("div", "exp-panel collapsed");
    panel.setAttribute("role", "group");
    panel.setAttribute("aria-label", t("exp.aria", "Optional experiments"));
    S = { phobiaKey, levelIdx, stage, panel, deck, run: null, elapsed: 0,
          events: new Set(), lastPos: null, results: [], startTs: Date.now() };
    lastSession = null;
    renderList();
    stage.appendChild(panel);
  }

  // Localized field lookup. Content keys follow the whisper convention —
  // exp.<phobia>.<id>.<title|how|p0|p1|p2|out> with the English inline as
  // fallback — so the decks read Persian in fa without forking the data.
  function xt(phobiaKey, x, field, fallback) {
    return t(`exp.${phobiaKey}.${x.id}.${field}`, fallback);
  }

  function renderList() {
    if (!S) return;
    const open = !S.panel.classList.contains("collapsed");
    S.panel.innerHTML = "";
    const head = el("div", "exp-head",
      `🧪 ${t("exp.head", "Experiments")} <span class="exp-n">${open ? t("exp.optional", "optional · pick one") : S.deck.length}</span>`);
    head.addEventListener("click", () => { S.panel.classList.toggle("collapsed"); renderList(); });
    S.panel.appendChild(head);
    if (!open) return;
    const list = el("div", "exp-list");
    S.deck.forEach((x) => {
      const done = doneBefore(S.phobiaKey, x.id) || S.results.some((r) => r.id === x.id);
      const b = el("button", "exp-item" + (done ? " done" : ""),
        `${done ? `<span class="exp-check">✓</span>` : ""}${escapeHtml(xt(S.phobiaKey, x, "title", x.title))}`);
      b.addEventListener("click", () => renderPick(x));
      list.appendChild(b);
    });
    S.panel.appendChild(list);
  }

  function renderPick(x) {
    if (!S) return;
    S.panel.classList.remove("collapsed");
    S.panel.innerHTML = "";
    const head = el("div", "exp-head", `🧪 ${escapeHtml(xt(S.phobiaKey, x, "title", x.title))}`);
    S.panel.appendChild(head);
    const pick = el("div", "exp-pick",
      `<p class="exp-q">${t("exp.predict", "Before you try — what do you expect?")}</p>`);
    x.predictions.forEach((p, i) => {
      const c = el("button", "exp-chip", escapeHtml(xt(S.phobiaKey, x, "p" + i, p)));
      c.addEventListener("click", () => arm(x, i));
      pick.appendChild(c);
    });
    const back = el("button", "exp-cancel", t("exp.back", "back"));
    back.addEventListener("click", renderList);
    pick.appendChild(back);
    S.panel.appendChild(pick);
  }

  function arm(x, predIdx) {
    if (!S) return;
    S.run = { x, predIdx, st: {}, tick: x.make(), progress: 0 };
    S.panel.innerHTML = "";
    S.panel.appendChild(el("div", "exp-head", `🧪 ${escapeHtml(xt(S.phobiaKey, x, "title", x.title))}`));
    const run = el("div", "exp-run",
      `<p class="exp-how">${escapeHtml(xt(S.phobiaKey, x, "how", x.how))}</p><div class="exp-bar"><i></i></div>`);
    const cancel = el("button", "exp-cancel", t("exp.cancel", "stop this experiment"));
    cancel.addEventListener("click", () => { S.run = null; renderList(); });
    run.appendChild(cancel);
    S.panel.appendChild(run);
    S.barEl = S.panel.querySelector(".exp-bar i");
  }

  function complete() {
    const { x, predIdx } = S.run;
    S.run = null;
    const first = !doneBefore(S.phobiaKey, x.id);
    const pts = first ? 18 + 4 * S.levelIdx : 6;
    // Evidence stores the prediction INDEX plus the canonical English strings:
    // the live surfaces re-resolve through t() at render (so the log follows
    // the UI language), while the printable report always uses the stored
    // English — it is the clinician-facing document and stays clinical-LTR.
    const line = {
      id: x.id, ts: Date.now(), rung: S.levelIdx, predIdx,
      predicted: x.predictions[predIdx], note: x.out,
    };
    addEvidence(S.phobiaKey, line);
    S.results.push({ id: x.id, title: xt(S.phobiaKey, x, "title", x.title),
      predicted: xt(S.phobiaKey, x, "p" + predIdx, line.predicted),
      note: xt(S.phobiaKey, x, "out", x.out), pts });
    try { awardCourage(pts, "experiment"); } catch {}
    try { PhobiaAudio.ui("spark"); } catch {}
    S.panel.innerHTML = "";
    S.panel.appendChild(el("div", "exp-head", `✅ ${escapeHtml(xt(S.phobiaKey, x, "title", x.title))}`));
    S.panel.appendChild(el("div", "exp-result",
      `<p class="exp-out">${escapeHtml(xt(S.phobiaKey, x, "out", x.out))}</p>
       <p class="exp-vs">${tf("exp.vs", "You expected: “{p}” · +{n} courage", { p: escapeHtml(xt(S.phobiaKey, x, "p" + predIdx, line.predicted)), n: pts })}</p>`));
    setTimeout(() => { if (S && !S.run) renderList(); }, 6500);
  }

  // Resolve a stored evidence line into display text in the CURRENT language.
  // Legacy lines (no predIdx) fall back to their stored English strings.
  function lineText(phobiaKey, l) {
    const x = (DECKS[phobiaKey] || []).find((d) => d.id === l.id);
    if (!x) return { note: l.note, predicted: l.predicted };
    return {
      note: xt(phobiaKey, x, "out", l.note || x.out),
      predicted: l.predIdx != null
        ? xt(phobiaKey, x, "p" + l.predIdx, x.predictions[l.predIdx] || l.predicted)
        : l.predicted,
    };
  }

  // Called every frame from the 3D module scope with plain numbers.
  function frame(d) {
    if (!S) return;
    S.elapsed += d.dt;
    // player speed from position deltas — the module keeps its own last-pos
    let speed = 0;
    if (S.lastPos && d.px != null) {
      speed = Math.hypot(d.px - S.lastPos.x, d.pz - S.lastPos.z) / Math.max(0.001, d.dt);
      if (speed > 30) speed = 0;   // teleport (scene swap, respawn) — not walking
    }
    if (d.px != null) S.lastPos = { x: d.px, z: d.pz };
    if (!S.run) { S.events.clear(); return; }
    let dist = null, gazeDot = 0;
    if (d.hasFocus) {
      const dx = d.cx - d.px, dz = d.cz - d.pz;
      dist = Math.hypot(dx, dz);
      const len = Math.max(0.001, Math.hypot(d.fx, d.fz) * Math.hypot(dx, dz));
      gazeDot = (d.fx * dx + d.fz * dz) / len;
    }
    const ctx = {
      dist, gazeDot, speed,
      pitch: Math.asin(Math.max(-1, Math.min(1, d.fy || 0))),
      fear: d.fear || 0, threat: !!d.threat, landed: d.landed || 0,
      engaged: !!(window.__coach && window.__coach.engaged),
      events: S.events, elapsed: S.elapsed,
    };
    let p = 0;
    try { p = S.run.tick(ctx, S.run.st, Math.min(0.1, d.dt)); } catch { p = 0; }
    S.events.clear();
    S.run.progress = Math.max(S.run.progress, Math.min(1, p));
    if (S.barEl) S.barEl.style.width = (S.run.progress * 100).toFixed(0) + "%";
    if (p >= 1) complete();
  }

  function signal(name) { if (S) S.events.add(name); }

  function end() {
    if (!S) return;
    if (S.results.length) {
      lastSession = { phobiaKey: S.phobiaKey, levelIdx: S.levelIdx, ts: Date.now(), results: S.results };
    }
    if (S.panel && S.panel.parentNode) S.panel.parentNode.removeChild(S.panel);
    S = null;
  }

  return { begin, frame, signal, end, evidenceOf, evidenceCount, lineText,
    lastSessionFor(phobiaKey, levelIdx) {
      if (!lastSession) return null;
      if (lastSession.phobiaKey !== phobiaKey || lastSession.levelIdx !== levelIdx) return null;
      if (Date.now() - lastSession.ts > 10 * 60 * 1000) return null;
      return lastSession;
    },
  };
})();
window.PhobiaExperiments = PhobiaExperiments;
