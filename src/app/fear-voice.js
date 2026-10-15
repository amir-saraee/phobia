// PhobiaFear (the live fear signal), PhobiaNarrator, PhobiaVoice and the
// voice-line tables.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// =============================================================================
// ---------- Unified Fear State Machine ----------
// =============================================================================
//
// A single 0–100 "fear" value that EVERY other system reads from. Inputs:
//   - proximity to source (per-scene-defined function)
//   - gaze (looking at the source for a sustained beat)
//   - exposure duration (slowly climbs while in the fear zone)
//   - sudden events (a bark, a spider lunge)
// Behaviour:
//   - Rises with input, falls slowly when player is in safety / using grounding
//   - Drives visual effects (vignette, desat, FOV), audio (heartbeat tempo + LP
//     muffle), camera sway, breathing audio rate, narration selection.
//   - Records the session's peak + duration so habituation can be reported back
//     to the user across sessions ("You held it 8 s longer than last time.")
// Why it matters:
//   - Real exposure therapy works on a habituation curve, not a binary pass/fail.
//   - A unified value lets all the "this looks like a real person panicking"
//     effects (vignette, audio, body sway) move together — instead of each
//     scene having its own ad-hoc panic cues.
//
const PhobiaFear = (() => {
  let value = 0;                  // 0..100
  let listeners = [];
  let peak = 0;                   // peak this rung
  let timeInZone = 0;             // seconds spent above 30
  let sessionStart = 0;
  let groundingMode = false;      // 5-4-3-2-1 exercise active
  let inputs = { proximity: 0, gaze: 0, event: 0, duration: 0 };
  let scene = "";                 // current phobia key
  let levelIdx = 0;
  let lastNarrationAt = 0;        // throttle adaptive cues
  let avoidanceTimer = 0;         // seconds player has spent in the safe zone after engaging
  // Per-scene credit thresholds: the hold timer grants full credit above
  // `full` and half credit above `partial`. Scenes with gentler fear ceilings
  // (a calm rung's proximity input alone can't reach 30) lower these so
  // "full credit" is genuinely reachable. Reset to defaults on every
  // setScene so no scene inherits another's tuning.
  let creditFull = 30, creditPartial = 10;
  // Scene-owned alarm (opt-in). The weighted-input model below has no
  // habituation: every input only climbs while you stay, so a player standing
  // quietly beside a sitting dog watched their "fear" rise for the whole hold
  // — the opposite of what exposure teaches. A scene that models the alarm
  // properly (rise on approach, fall while you stay, shrinking spikes on
  // repeated barks) hands it over here: `targetFn()` returns the 0..100
  // target and discrete pulses are routed to `pulseFn` so the scene can
  // habituate them too. Smoothing, peak, grounding and listeners stay here.
  let directFn = null, directPulse = null;
  function setDirect(targetFn, pulseFn) {
    directFn = typeof targetFn === "function" ? targetFn : null;
    directPulse = typeof pulseFn === "function" ? pulseFn : null;
  }

  function setScene(s, idx) {
    scene = s;
    levelIdx = idx || 0;
    value = 0;
    peak = 0;
    timeInZone = 0;
    sessionStart = performance.now() / 1000;
    inputs = { proximity: 0, gaze: 0, event: 0, duration: 0 };
    groundingMode = false;
    avoidanceTimer = 0;
    lastNarrationAt = 0;
    creditFull = 30; creditPartial = 10;
    directFn = null; directPulse = null;
    // The shared engagement accumulator scenes write from outside
    // (PhobiaFear._duration) resets with the scene, or a long dog session
    // would start the next heights mount with ~16 phantom fear points.
    try { PhobiaFear._duration = 0; } catch {}
    notify();
  }
  function setCreditThresholds(full, partial) { creditFull = full; creditPartial = partial; }
  function getCreditThresholds() { return { full: creditFull, partial: creditPartial }; }
  function setInput(name, v) {
    if (groundingMode) return;     // grounding pauses fear input
    inputs[name] = Math.max(0, Math.min(1, v));
  }
  // Discrete events (a bark, a spider lunge). Pulse adds a quick spike that
  // decays back to the proximity-driven baseline.
  let eventPulse = 0;
  function pulseEvent(strength = 0.4) {
    if (directPulse) { try { directPulse(strength); } catch {} return; }
    eventPulse = Math.max(eventPulse, strength);
  }
  function setGroundingMode(on) {
    groundingMode = !!on;
    notify();
  }
  function update(dt) {
    if (!sessionStart) sessionStart = performance.now() / 1000;
    if (groundingMode) {
      // Grounding rapidly drains fear back to baseline — this is the user's
      // panic stop. They can recover.
      value = Math.max(0, value - dt * 18);
      eventPulse = Math.max(0, eventPulse - dt * 2);
      notify();
      return;
    }
    // Target = weighted sum of inputs, in 0..100 space.
    // Proximity is the biggest contributor — being close to the fear is the
    // fundamental trigger. Gaze + duration both build slowly. Event pulses
    // add a brief spike on top.
    eventPulse = Math.max(0, eventPulse - dt * 0.6);
    let target;
    if (directFn) {
      try { target = +directFn(dt) || 0; } catch { target = 0; }
      target = Math.max(0, Math.min(100, target));
    } else {
      target = Math.min(100,
        inputs.proximity * 55
        + inputs.gaze * 25
        + inputs.duration * 20
        + eventPulse * 30
      );
    }
    // Asymmetric tracking: fear RISES quickly when target > value (panic
    // climbs fast) and FALLS slowly when target < value (anxiety lingers).
    // This is psychologically accurate — it's much easier to startle than
    // to recover.
    const rate = (target > value) ? 4.0 : 1.6;
    value += (target - value) * Math.min(1, dt * rate);
    if (value < 0) value = 0;
    if (value > 100) value = 100;
    peak = Math.max(peak, value);
    if (value > 30) timeInZone += dt;
    notify();
  }
  function get() { return value; }
  function getPeak() { return peak; }
  function getTimeInZone() { return timeInZone; }
  function isGrounding() { return groundingMode; }
  function getInputs() { return Object.assign({}, inputs); }
  function getScene() { return scene; }

  // Subscribe to fear-value changes — used by the post-process pipeline,
  // audio bus, and HUD.
  function subscribe(fn) { listeners.push(fn); return () => { listeners = listeners.filter(x => x !== fn); }; }
  function notify() {
    for (const fn of listeners) {
      try { fn(value, { peak, timeInZone, grounding: groundingMode, inputs }); } catch {}
    }
  }

  // Avoidance detection — the player has retreated to safety after engaging.
  // The scene calls bumpAvoidance(dt, isAvoiding) per frame; if the user
  // stays away for >12 s after engaging, we flag adaptive narration.
  function bumpAvoidance(dt, isAvoiding) {
    if (isAvoiding) avoidanceTimer += dt;
    else avoidanceTimer = 0;
  }
  function getAvoidanceTime() { return avoidanceTimer; }

  // Narration throttle so we don't speak over ourselves.
  function canNarrate(minGap = 6) {
    const now = performance.now() / 1000;
    if (now - lastNarrationAt < minGap) return false;
    return true;
  }
  function markNarrated() { lastNarrationAt = performance.now() / 1000; }

  // Habituation: read the previous best from localStorage, return delta strings.
  // `extra` lets the caller attach outcome facts (completed, heldSec) —
  // legacy callers pass nothing and the shape stays compatible.
  function recordSession(extra) {
    if (!scene) return null;
    const key = `fobia.fear.${scene}.${levelIdx}.history`;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
    const session = Object.assign({
      peak: Math.round(peak),
      duration: Math.round((performance.now() / 1000) - sessionStart),
      timeInZone: Math.round(timeInZone),
      ts: Date.now(),
    }, extra || {});
    history.push(session);
    // Keep last 10 sessions
    if (history.length > 10) history = history.slice(-10);
    try { localStorage.setItem(key, JSON.stringify(history)); } catch {}
    return session;
  }
  function getHabituationDelta() {
    if (!scene) return null;
    const key = `fobia.fear.${scene}.${levelIdx}.history`;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch {}
    if (history.length < 1) return null;
    // The CURRENT session is already recorded (last entry) by the time this is
    // read at unmount, so the comparison baseline is the PREVIOUS session — else
    // speakHabituation compared the peak to itself (peak < peak-5 → never fired).
    const baseline = history.length >= 2 ? history[history.length - 2] : history[history.length - 1];
    return {
      lastPeak: baseline.peak,
      lastTimeInZone: baseline.timeInZone,
      lastDuration: baseline.duration,
      sessionsLogged: history.length,
    };
  }

  return {
    setScene, update, get, getPeak, getTimeInZone, getInputs, getScene,
    setInput, pulseEvent, setGroundingMode, isGrounding,
    setCreditThresholds, getCreditThresholds, setDirect,
    subscribe,
    bumpAvoidance, getAvoidanceTime,
    canNarrate, markNarrated,
    recordSession, getHabituationDelta,
  };
})();
window.PhobiaFear = PhobiaFear;

// =============================================================================
// ---------- Adaptive Narration Engine ----------
// =============================================================================
//
// Picks contextually appropriate voice cues based on the current PhobiaFear
// state + scene-specific events. Feels like an AI therapist coaching the user
// without an LLM — uses pre-written line banks indexed by player state.
//
// State buckets:
//   - calm (fear < 25): exploration, gentle invitations
//   - rising (25–55): grounding, "notice your breath"
//   - panic (55–80): "you're safe, the rail is solid", encouragement
//   - shutdown (>80): emergency softening, suggest grounding mode
//   - avoidance (long time in safe zone): gentle invitation back
//   - habituation (peak < last peak): celebrate progress
//
const PhobiaNarrator = (() => {
  // Pre-written lines per scene, per state bucket. Multiple variants per
  // bucket so it doesn't sound like a tape on repeat.
  const lines = {
    heights: {
      arrival: [
        "You're on the rooftop. Take a moment. There's no rush.",
        "You made it to the roof. Notice the air on your skin.",
      ],
      walking: [
        "You're walking toward the edge. Your body is doing this.",
        "One step at a time. Notice your feet on the concrete.",
      ],
      atEdge: [
        "You're at the edge. The railing is solid in front of you.",
        "Look out at the city. You are here, you are safe, you are watching.",
      ],
      lookingDown: [
        "The drop is real. So is the railing under your hand.",
        "Your body knows what to do. Notice your breath.",
      ],
      panic: [
        "You're safe. Your feet are on the ground. The railing is holding.",
        "Slow breath in. Slower breath out. The railing is solid.",
        "You can step back any time. Right now you are safe.",
      ],
      avoidance: [
        "You stepped back. Good. Whenever you're ready, walk forward again.",
        "There's no rush. Try walking a few steps closer when you're ready.",
      ],
      habituation: [
        "Your peak fear was lower than last time. Your body is learning.",
        "You're holding longer than last time. This is real progress.",
      ],
    },
    dogs: {
      arrival: [
        "You've entered the room. The dog is here, doing its own thing.",
        "Take a moment. Notice the room before you walk in.",
      ],
      walking: [
        "You're walking toward the dog. Slowly. There's no rush.",
        "Your body is learning the dog is calm. Keep your pace.",
      ],
      close: [
        "You're close. The dog is calm. Notice the warmth in the room.",
        "The dog sees you. You can pet it, or just stand here.",
      ],
      panic: [
        "The dog is calm. You are safe. Slow breath in.",
        "Step back any time. Space is allowed. Come back when you're ready.",
      ],
      // Used INSTEAD of panic whenever the scene reports an actively
      // threatening dog (barking rung warning posture) — the guide must
      // never say "the dog is calm" over a loud bark.
      threatened: [
        "It is loud. You are still standing. Soften your gaze and breathe.",
        "The bark is big. Step back slowly if you need space — you are in control.",
        "Feet planted. Soften your eyes. Let the sound wash past you.",
      ],
      avoidance: [
        "You stepped back. Good. Try a few steps closer when you're ready.",
        "There's no rush. The dog is patient.",
      ],
      habituation: [
        "Your fear was lower this time. The dog feels less threatening.",
        "You stayed longer than last time. Real progress.",
      ],
    },
    spiders: {
      arrival: [
        "You're in the room. The spider is over there, keeping to itself.",
        "Take the room in first. Cool air, concrete, one small creature.",
      ],
      walking: [
        "You're stepping closer. Slow is fine. Notice your feet.",
        "Your body is doing this — one step, then the next.",
      ],
      close: [
        "You're close now. You can watch the legs move. You can also step back.",
        "It's small and it's busy. You are here, watching, safe.",
      ],
      panic: [
        "You're safe. It's small. Feet on the floor, slow breath out.",
        "Step back whenever you need to. The jar is always there.",
      ],
      // Used INSTEAD of panic while the spider is actively darting/pouncing —
      // the guide must never say "it hasn't moved" over a skitter.
      threatened: [
        "It darted. You flinched and stayed. That's the whole skill.",
        "Fast legs, small body. The fear spikes, then it settles. Stay with it.",
        "You can jar it any time. For this breath, just hold your ground.",
      ],
      avoidance: [
        "You gave yourself space. Good. Step back in when you're ready.",
        "There's no rush. It'll keep to its corner.",
      ],
      habituation: [
        "Your fear was lower this time. Your body is learning it's safe.",
        "You stayed longer than last time. Real progress.",
      ],
    },
    snakes: {
      arrival: [
        "A snake basking in the sun ahead. It's coiled, tongue testing the air.",
        "Take the clearing in first. Warm light, long grass, one snake sunning itself.",
      ],
      walking: [
        "You're stepping closer. Slow is the whole point here. Notice your feet.",
        "Move gently — a snake reads fast movement as a threat. Your pace is the lesson.",
      ],
      close: [
        "You're close. It's watching you, tongue flicking. You are watching it.",
        "It rears to keep an eye on you. You can hold here, or ease back. Both are fine.",
      ],
      panic: [
        "You're safe. It wants distance as much as you do. Slow breath out.",
        "Step back whenever you need to. Stay calm and it will move away, not toward you.",
      ],
      // Used INSTEAD of panic while the snake is hissing / rearing to strike —
      // the guide must never say "it hasn't moved" over a strike.
      threatened: [
        "It struck the air and stopped short. You are still standing. That's the skill.",
        "That was a warning, not an attack. Ease back, slow down — slow reads as safe.",
        "The hiss is big. The danger is not. Long breath out, and give it room.",
      ],
      avoidance: [
        "You gave it space. Good. Try easing a little closer when you're ready.",
        "There's no rush. It'll keep to its warm patch of ground.",
      ],
      habituation: [
        "Your fear was lower this time. Your body is learning the snake is not chasing you.",
        "You held longer than last time, and slower. Real progress.",
      ],
    },
    water: {
      arrival: [
        "You're at the shore. The water is here. You can wade in or not.",
        "Shore under your feet. The water starts where you decide it does.",
        "The lake is quiet today. Wade in whenever you're ready.",
      ],
      walking: [
        "Wading in. The water is cool. Notice your feet.",
        "A little deeper with each step. You set the pace.",
        "Cold at the ankles, then the knees. Your breath stays yours.",
      ],
      close: [
        "You're in the water. Notice it holds you up.",
        "You're in. Feel how the water carries some of your weight.",
        "Deep enough to feel it hold you. You can stop right here.",
      ],
      panic: [
        "You're safe. You can step back to shore any time.",
        "Your feet still reach the bottom. The shore is right behind you.",
        "One slow breath out. Then decide — stay, or step back. Both are safe.",
      ],
      avoidance: [
        "You stepped back. Good.",
        "Back on the sand. That counts too. In again when you're ready.",
        "You chose space. Good. The water isn't going anywhere.",
      ],
      habituation: [
        "Lower fear than last time.",
        "Lower fear, deeper water. That's your body learning.",
      ],
    },
  };
  // ---- Event beats -------------------------------------------------------
  // Everything above is POLLED: the engine samples fear and proximity every few
  // seconds and picks a bucket. That is right for ambient coaching and wrong
  // for the moments that actually land — the dog stands up and starts toward
  // you, your hand finally reaches its back, it startles you and you stay.
  // Those are discrete events, they matter for about two seconds, and a poll on
  // an 8-second gap misses them completely or comments on them long after they
  // are over. `event()` speaks them the moment they happen, in the register the
  // moment deserves, and each one fires at most once per rung.
  const eventLines = {
    // Something you feared moved toward you and you are still here.
    approach: {
      dogs:    ["It's coming to you. Let it come — this is the part your fear predicted."],
      spiders: ["It moved toward you. You're still here. That's the whole exercise."],
      snakes:  ["It's coming closer. Slow is safe. Let it come, or give it room."],
      _:       ["It's closer now. You're still here."],
    },
    // The hand actually landed. This is the beat the whole scene exists for.
    contact: {
      dogs:    ["Your hand is on it. Feel the warmth. That's a real dog under your palm."],
      spiders: ["You're touching it. Nothing happened. Stay one more breath."],
      snakes:  ["Your hand is on it. Cool and dry — not what fear promised."],
      heights: ["Your hands are on the rail. Solid. Let them rest there, not grip."],
      enclosed:["Solid, and exactly where it was. Nothing in here has moved."],
      dark:    ["Your hand found it. The same thing it is in daylight."],
      _:       ["You're touching it. Notice what your body does now."],
    },
    // It startled you — barked, lunged, struck — and you did not run.
    startle: {
      dogs:    ["That was loud. You flinched and you stayed. That counts."],
      spiders: ["It moved fast. Your body jumped. Let it settle. Nothing reached you."],
      snakes:  ["It struck the air and stopped short. You're untouched. Breathe out."],
      _:       ["Your body jumped. That's the alarm doing its job. Nothing happened."],
    },
    // It stopped being agitated while you held your ground.
    settle: {
      dogs:    ["It's settling. You held your ground and the room got calmer."],
      spiders: ["It's still again. The wave passed on its own — it always does."],
      snakes:  ["It's lowering. You waited, and it chose to stand down."],
      _:       ["It settled. You stayed, and the moment passed."],
    },
    // You backed off after being close. Never a scolding.
    retreat: {
      _: ["You gave yourself space. That's a choice, not a failure. Go back in when you're ready."],
    },
  };
  const eventFired = new Set();
  // `kind` is one of the keys above. Repeat suppression is per rung, so a
  // second dog scene says it again but one session never repeats itself.
  function event(scenePhobia, kind, opts = {}) {
    if (!window.PhobiaVoice) return false;
    const bank = eventLines[kind];
    if (!bank) return false;
    const key = scenePhobia + "|" + kind;
    if (eventFired.has(key)) return false;
    const arr = bank[scenePhobia] || bank._;
    if (!arr || !arr.length) return false;
    eventFired.add(key);
    try {
      // Startles interrupt; the rest wait their turn. All of them are audible:
      // an event beat that only shows as a caption is a beat the player misses
      // precisely when they are staring at the animal instead of the text.
      const line = pick(arr);
      const text = (typeof t === "function") ? t(`nar.${kind}.${bank[scenePhobia] ? scenePhobia : "_"}.${arr.indexOf(line)}`, line) : line;
      window.PhobiaVoice.speak(text, {
        urgent: kind === "startle",
        audible: true,
        praise: kind === "contact" || kind === "settle",
      });
      PhobiaFear.markNarrated();
    } catch {}
    return true;
  }
  // Scenes call this on mount so a fresh rung can speak its beats again.
  function resetEvents() { eventFired.clear(); }

  // Shuffled round-robin per bucket (WeakMap keyed by the bank array): every
  // variant plays before any repeats, and a reshuffle never lands the same
  // line twice in a row. Uniform random over 2-3 variants repeated itself
  // back-to-back often enough to read as a tape loop over a 2-minute hold.
  const rrState = new WeakMap();
  function pick(arr) {
    if (!arr || arr.length === 0) return undefined;
    if (arr.length === 1) return arr[0];
    let st = rrState.get(arr);
    if (!st || st.i >= st.order.length) {
      const order = arr.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (st && order[0] === st.last && order.length > 1) {
        [order[0], order[1]] = [order[1], order[0]];
      }
      st = { order, i: 0, last: st ? st.last : -1 };
      rrState.set(arr, st);
    }
    st.last = st.order[st.i++];
    return arr[st.last];
  }

  // The engine's main entrypoint — called per frame from the scene's update.
  // Bank lines localize as narb.<scene>.<bucket>.<i> (the scene whose bank
  // was actually used — dark/enclosed borrow the heights bank).
  function bankText(scenePhobia, sceneLines, bucket, line) {
    if (typeof t !== "function") return line;
    const bucketName = Object.keys(sceneLines).find(k => sceneLines[k] === bucket);
    return t(`narb.${lines[scenePhobia] ? scenePhobia : "heights"}.${bucketName}.${bucket.indexOf(line)}`, line);
  }
  // Reads PhobiaFear state and decides whether (and what) to say.
  function tick(scenePhobia, opts = {}) {
    if (!window.PhobiaVoice) return;
    if (!PhobiaFear.canNarrate(opts.minGap || 8)) return;
    const fear = PhobiaFear.get();
    const peak = PhobiaFear.getPeak();
    const inputs = PhobiaFear.getInputs();
    const sceneLines = lines[scenePhobia] || lines.heights;
    let bucket = null;
    // Priority order: panic > habituation > close > looking down > walking > arrival.
    // At panic-level fear, an actively threatening stimulus (opts.threat,
    // supplied by the scene) swaps panic for the honest "threatened" bucket —
    // the guide must never say "the dog is calm" over a loud bark. At lower fear
    // the normal ladder applies (arrival/walking/avoidance still fire).
    if (fear > 70) {
      bucket = (opts.threat && sceneLines.threatened) ? sceneLines.threatened : sceneLines.panic;
    }
    // An ACTIVE threat (dog warning/barking, snake striking) must never get a
    // calm "it's calm, you can pet it" line just because fear briefly dipped
    // below 70 between beats. Route to the honest threatened bank from fear 40.
    else if (opts.threat && sceneLines.threatened && fear > 20) bucket = sceneLines.threatened;
    // While a threat is active, the calm banks (close / walking / arrival —
    // "The dog is calm. You can pet it.") are OFF LIMITS even at low fear:
    // avoidance coaching is still fine, everything else stays silent.
    else if (opts.threat) {
      if (PhobiaFear.getAvoidanceTime() > 14) bucket = sceneLines.avoidance;
    }
    else if (PhobiaFear.getAvoidanceTime() > 14) bucket = sceneLines.avoidance;
    else if (fear > 40 && inputs.gaze > 0.5) bucket = sceneLines.lookingDown || sceneLines.close;
    else if (fear > 30) bucket = sceneLines.close;
    else if (inputs.proximity > 0.2) bucket = sceneLines.walking;
    else bucket = sceneLines.arrival;
    if (!bucket || bucket.length === 0) return;
    const line = pick(bucket);
    try {
      // Panic/threatened support interrupts whatever ambient cue is
      // mid-sentence; everything else waits its turn in the voice queue.
      // Those two buckets (plus avoidance coaching) are also AUDIBLE — the
      // moments a scared user most needs a human voice. Ambient commentary
      // (arrival/walking/close) stays caption-only.
      const isUrgent = bucket === sceneLines.panic || bucket === sceneLines.threatened;
      const isCoaching = bucket === sceneLines.avoidance;
      window.PhobiaVoice.speak(bankText(scenePhobia, sceneLines, bucket, line), { urgent: isUrgent, audible: isUrgent || isCoaching });
      PhobiaFear.markNarrated();
    } catch {}
  }

  // Habituation feedback — call ONCE at end of session.
  function speakHabituation(scenePhobia) {
    if (!window.PhobiaVoice) return;
    const delta = PhobiaFear.getHabituationDelta();
    if (!delta || delta.sessionsLogged < 2) return;
    const peakNow = PhobiaFear.getPeak();
    const sceneLines = lines[scenePhobia] || lines.heights;
    if (peakNow < delta.lastPeak - 5) {
      const line = pick(sceneLines.habituation);
      // The one unambiguous good-news beat of a session — spoken, warmly.
      try { window.PhobiaVoice.speak(bankText(scenePhobia, sceneLines, sceneLines.habituation, line), { audible: true, praise: true }); } catch {}
      return true;
    }
    return false;
  }
  return { tick, speakHabituation, event, resetEvents };
})();
window.PhobiaNarrator = PhobiaNarrator;

// ---------- Voice guidance (Web Speech Synthesis) ----------
// A calm therapist-style narrator that delivers grounding cues during exposure.
// MUTED BY DEFAULT — voice quality varies wildly by browser/OS and many users
// prefer the silence. The user can toggle voice on via the in-stage 🗣️ pill
// or in Settings. Captions still fire when voice is muted, so the prompts are
// readable on screen even with no audio. Once the user explicitly toggles it
// (either way), their preference persists in localStorage.
const PhobiaVoice = (() => {
  // The spoken guide track is RETIRED: guidance is captions/tips only, and
  // the soundscape belongs to the world (creature, room, weather, foley).
  // Flip to true to re-enable the recorded-clip/TTS delivery below.
  const VOICE_TRACK = false;
  const synth = typeof window !== "undefined" && window.speechSynthesis;
  let voice = null;
  // Default: guide AUDIBLE. A scared first-time user needs Mira talking them
  // through it ("you are safe", "it lunged and you stayed") — silence turns a
  // guided exposure into a horror sim. Matches PhobiaAudio, which is also
  // un-muted by default. Captions still show regardless, and the in-stage 🗣️
  // pill / Settings let anyone mute; the choice then persists.
  let muted = false;
  let voiceRate = 0.85;
  try {
    // Honour saved preference (either "1" muted or "0" unmuted). If the key
    // isn't set yet (new user), default to UNMUTED via the line above.
    const stored = localStorage.getItem("fobia.voiceMuted");
    if (stored === "0") muted = false;
    else if (stored === "1") muted = true;
  } catch {}

  // ---- Recorded "Mira" voice ----
  // Every static line is pre-rendered to a small AAC clip (assets/voice/,
  // built by scripts/generate-voice.mjs) so the guide sounds IDENTICAL on
  // every device — browser TTS quality is a lottery, and on some Android/
  // Linux builds it's a robot or nothing. Recorded mode is the default once
  // the manifest loads; any line not in it (runtime-templated text) falls
  // back to live TTS seamlessly. Picking a system voice in Settings switches
  // the mode to "tts" and persists.
  let manifest = null;            // { "<normalized line>": "<hash>.m4a" }
  let mode = "tts";               // flips to "recorded" when the manifest lands
  let player = null;              // shared HTMLAudioElement for clips
  const canPlayAAC = (() => {
    try { return !!new Audio().canPlayType('audio/mp4; codecs="mp4a.40.2"'); }
    catch { return false; }
  })();
  const normalize = (s) => String(s).replace(/\s+/g, " ").trim();
  if (canPlayAAC && typeof fetch === "function") {
    fetch("assets/voice/manifest.json")
      .then(r => (r && r.ok ? r.json() : null))
      .then(j => {
        if (j && j.files && Object.keys(j.files).length) {
          manifest = j.files;
          let pref = null;
          try { pref = localStorage.getItem("fobia.voiceMode"); } catch {}
          if (pref !== "tts") mode = "recorded";
        }
      })
      .catch(() => {});
  }
  function ensurePlayer() {
    if (!player) {
      player = new Audio();
      player.preload = "auto";
    }
    return player;
  }
  function stopPlayback() {
    if (synth) try { synth.cancel(); } catch {}
    if (player) {
      try {
        player.onended = player.onerror = null;   // orphan the old closures
        player.pause();
        player.removeAttribute("src");
      } catch {}
    }
  }

  // ---- Voice selection: score EVERY installed voice instead of walking a
  // fixed name list. Premium / enhanced / neural variants (the ones that
  // actually sound human) outrank their plain siblings, which outrank remote
  // generic voices; novelty voices are pushed to the bottom so "Bubbles"
  // never narrates someone's panic. A user-saved voiceURI wins outright.
  function scoreVoice(v) {
    let s = 0;
    const name = v.name || "";
    if (!/^en/i.test(v.lang || "")) s -= 40;
    if (/premium|enhanced|natural|neural/i.test(name)) s += 50;
    if (/\b(Ava|Samantha|Allison|Zoe|Susan|Karen|Moira|Tessa|Serena)\b/i.test(name)) s += 24;
    if (/\b(Aria|Jenny|Sonia|Libby|Michelle)\b/i.test(name)) s += 22;   // MS neural set
    if (/google/i.test(name)) s += 14;
    if (/female/i.test(name)) s += 6;
    if (v.localService) s += 8;          // immune to network stutter
    if (/compact|whisper|albert|bad news|good news|bahh|jester|deranged|hysterical|princess|superstar|bells|boing|bubbles|cellos|wobble|zarvox|trinoids|organ\b|fred|junior|kathy|ralph|grandma|grandpa|rocko|shelley|flo\b|eddy|reed/i.test(name)) s -= 60;
    return s;
  }
  function pickVoice() {
    if (!synth) return;
    const voices = synth.getVoices();
    if (!voices.length) return;
    try {
      const savedURI = localStorage.getItem("fobia.voiceURI");
      if (savedURI) {
        const v = voices.find(v => v.voiceURI === savedURI);
        if (v) { voice = v; return; }
      }
    } catch {}
    voice = voices.slice().sort((a, b) => scoreVoice(b) - scoreVoice(a))[0] || null;
  }
  if (synth) {
    pickVoice();
    if (synth.onvoiceschanged !== undefined) synth.onvoiceschanged = pickVoice;
  }

  // ---- Delivery queue with breath pacing ----
  // The old speak() called synth.cancel() on EVERY line, so any new cue cut
  // the previous one off mid-word — the single least-calm thing a therapist
  // voice can do. Now: lines queue; each line is split at sentence boundaries
  // and delivered with a short breath gap between sentences and a longer one
  // between lines, like a person pacing themselves. Urgent lines (panic
  // support, grounding steps) jump the queue and DO interrupt.
  let queue = [];
  let speaking = false;
  let gapTimer = null;
  let watchdog = null;

  function splitSentences(text) {
    return String(text).split(/(?<=[.!?…])\s+/).filter(s => s.trim().length);
  }
  function clearTimers() {
    if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; }
    if (watchdog) { clearTimeout(watchdog); watchdog = null; }
  }
  function setDuck(on) {
    try { if (window.PhobiaAudio && window.PhobiaAudio.duck) window.PhobiaAudio.duck(on); } catch {}
  }
  function playNext() {
    clearTimers();
    const item = queue.shift();
    if (!item) { speaking = false; setDuck(false); return; }
    speaking = true;
    setDuck(true);
    let advanced = false;
    const advance = (delay) => {
      if (advanced) return;
      advanced = true;
      gapTimer = setTimeout(playNext, delay);
    };
    // --- Recorded clip: one file per line, pacing baked in at render time ---
    if (item.kind === "clip") {
      // If the file can't load/play (offline before it was cached, decode
      // problem, autoplay not unlocked), the line is re-queued as live TTS
      // rather than silently dropped.
      let fellBack = false;
      const fallbackToTTS = () => {
        // Both a.onerror AND the rejected play() promise can fire for one failed
        // clip — guard so the sentence isn't queued (and spoken) twice.
        if (fellBack) return;
        fellBack = true;
        if (item.text && synth) {
          const parts = splitSentences(item.text);
          queue.unshift(...parts.map((p, i) => ({
            kind: "tts", text: p, endOfLine: i === parts.length - 1, volume: item.volume,
          })));
        }
        advance(80);
      };
      try {
        const a = ensurePlayer();
        a.onended = a.onerror = null;
        a.src = item.url;
        a.volume = Math.max(0, Math.min(1, item.volume == null ? 0.95 : item.volume));
        a.onended = () => advance(620);                    // breath gap between lines
        a.onerror = fallbackToTTS;
        const p = a.play();
        if (p && p.catch) p.catch(fallbackToTTS);
        watchdog = setTimeout(() => advance(0), 30000);    // clips are < 20 s
      } catch {
        fallbackToTTS();
      }
      return;
    }
    // --- Live TTS sentence chunk ---
    if (!synth) { speaking = false; setDuck(false); return; }
    try {
      const u = new SpeechSynthesisUtterance(item.text);
      if (voice) u.voice = voice;
      // Calm therapist tone — slightly slower than default, slightly lower
      // pitch for warmth, gentle volume. Clamped to spec-safe ranges.
      u.rate = Math.max(0.1, Math.min(10, item.rate || voiceRate));
      u.pitch = Math.max(0, Math.min(2, item.pitch != null ? item.pitch : 0.92));
      u.volume = Math.max(0, Math.min(1, item.volume == null ? 0.9 : item.volume));
      // Breath gap: short between sentences of one line, longer between lines.
      u.onend = () => advance(item.endOfLine ? 700 : 350);
      u.onerror = () => advance(120);
      synth.speak(u);
      // Chrome's synth occasionally goes silent without onend/onerror —
      // a watchdog keeps the queue moving (generous estimate: 90 ms/char).
      watchdog = setTimeout(() => advance(0), Math.max(3000, item.text.length * 90 + 1500));
    } catch (e) {
      // Some Safari versions throw on .speak() if the page is hidden.
      advance(150);
    }
  }
  function speak(text, opts = {}) {
    // Always emit caption event for closed captions, even when muted
    try {
      // Caption on-screen time must outlast actual delivery: recorded "Mira"
      // clips are paced slower than 70 ms/char and each sentence adds a
      // 350–700 ms breath gap, so the old estimate cleared the caption while the
      // later sentences were still being spoken. Slower per-char + per-gap time.
      const _sentences = (text.match(/[.!?]+(\s|$)/g) || []).length || 1;
      const _capMs = Math.max(2600, text.length * 95 + (_sentences - 1) * 650);
      window.dispatchEvent(new CustomEvent("voice-line", {
        detail: { text, durationMs: _capMs, speaker: opts.speaker || "guide" }
      }));
      // Register with the cross-channel prompt dedupe (result ignored — the
      // caption always shows; it mutes near-identical ctx prompts/hints).
      if (window.PhobiaFX && window.PhobiaFX.promptGate) {
        window.PhobiaFX.promptGate("voice", text);
      }
    } catch {}
    // ---- Guidance is VISUAL-ONLY: the spoken voice track is retired ----
    // All guidance renders as the on-screen caption/tip dispatched above and
    // nothing is ever synthesized or played — the world (dog, room, weather)
    // is the only thing the player hears. The recorded-clip/TTS machinery
    // below is kept intact behind this gate in case a voice track returns.
    if (!VOICE_TRACK) return;
    if (!text) return;
    // The player's own lines ("Come here.", "Treat.") are captioned as the
    // player, never voiced — Mira's voice speaking YOUR commands breaks the
    // embodiment contract.
    if (opts.speaker && opts.speaker !== "guide") return;
    if (!opts.force && (!opts.audible || muted)) return;
    // Recorded clip when we have one for this exact line; live TTS otherwise.
    const norm = normalize(text);
    let items;
    if (mode === "recorded" && manifest && manifest[norm]) {
      items = [{ kind: "clip", url: "assets/voice/" + manifest[norm], volume: opts.volume, text: norm }];
    } else {
      if (!synth) return;
      const parts = splitSentences(text);
      // Register shapes delivery on the live-TTS fallback the way the
      // pre-rendered clips bake it in: panic support is present (not sleepy),
      // praise beats are warm and slow. Explicit opts always win.
      const regRate = opts.urgent ? 0.95 : opts.praise ? 0.78 : null;
      const regPitch = opts.urgent ? 1.0 : opts.praise ? 0.9 : null;
      items = parts.map((p, i) => ({
        kind: "tts",
        text: p,
        endOfLine: i === parts.length - 1,
        rate: opts.rate != null ? opts.rate : regRate,
        pitch: opts.pitch != null ? opts.pitch : regPitch,
        volume: opts.volume,
      }));
    }
    if (opts.urgent) {
      // Panic support cannot wait behind ambient commentary.
      queue = items;
      clearTimers();
      stopPlayback();
      speaking = false;
      playNext();
      return;
    }
    // Never build a backlog: guidance that lags the moment it described is
    // worse than silence. Keep at most the current line + one waiting.
    if (speaking && queue.length > 2) queue = queue.slice(0, 2);
    queue.push(...items);
    if (!speaking) playNext();
  }
  function stop() {
    queue = [];
    clearTimers();
    speaking = false;
    setDuck(false);
    stopPlayback();
  }
  function setMode(m) {
    mode = m === "recorded" && manifest ? "recorded" : "tts";
    try { localStorage.setItem("fobia.voiceMode", mode); } catch {}
  }
  function getMode() { return mode; }
  function hasRecorded() { return !!manifest; }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem("fobia.voiceMuted", muted ? "1" : "0"); } catch {}
    if (muted) stop();
  }
  function setRate(r) { voiceRate = r; }
  function listVoices() {
    if (!synth) return [];
    return synth.getVoices()
      .filter(v => /^en/i.test(v.lang || ""))
      .sort((a, b) => scoreVoice(b) - scoreVoice(a))
      .map(v => ({ name: v.name, uri: v.voiceURI, score: scoreVoice(v) }));
  }
  function setVoice(uri) {
    try { localStorage.setItem("fobia.voiceURI", uri || ""); } catch {}
    pickVoice();
  }

  return {
    speak, stop, setMuted, isMuted: () => muted, setRate,
    hasVoice: () => !!synth || !!manifest,
    listVoices, setVoice, isSpeaking: () => speaking,
    setMode, getMode, hasRecorded,
  };
})();
window.PhobiaVoice = PhobiaVoice;

// Scripted lines for each phobia × rung. Each entry plays in order during the
// hold timer, paced about every 9 seconds to mirror a therapist's cadence.
const VOICE_LINES = {
  heights: [
    ["A low ledge over a city square.", "Step up and look down. Notice your feet on solid stone."],
    ["A first-floor balcony. The railing is solid.", "Let your hands rest on it. If the alarm rises, let it — and watch it."],
    ["Ten floors up. Some of the floor is glass.", "Look down when you're ready. The glass is built to hold far more than you."],
    ["A rooftop, 90 metres up. The wind is real.", "Gusts push, and the railing holds. Stay, and let the alarm do its wave."],
    ["Glass underfoot, 165 metres up, at dusk.", "Your legs will say fall. The glass says hold. Watch which one is right."],
  ],
  water: [
    ["Just your feet. Cool. Quiet.", "You can step out any time."],
    ["Knee deep. The bottom is right there.", "Wiggle your toes. Notice you are held."],
    ["Waist deep. The water moves around you.", "You are still in control. Slow breath."],
    ["No floor under you. Treading.", "Trust your arms and legs. They know what to do."],
    ["Open water. Nothing visible below.", "Notice fear, then notice your breath. Both can exist."],
  ],
  // Lines must describe what the SCENE actually shows: rung 1 is a live,
  // pettable shiba across a real room (not "a drawing"); the rung-5 husky
  // barks from a safe distance and settles when you give space — never claim
  // it charges or that "it cannot reach you".
  // Match what each rung actually stages (see PHOBIAS.dogs.levels), and
  // never coach retreat as the skill — the rung-5 line used to say "step
  // back slowly" over the one dog the whole ladder climbs toward.
  dogs: [
    ["A small dog across the room, busy with its own nose.", "Walk in at your own pace. Watch what it does — and what your alarm does."],
    ["The same small dog. This time it comes over to see you.", "Let it come. Standing still is a whole skill."],
    ["A bigger dog, lying down. It may get up to look at you.", "Up and watching is alert, not attack. Stay, and see what comes next."],
    ["A large dog that likes to stay close. Now and then, it barks.", "A bark is a voice, not a bite. Stay near through one."],
    ["A big, loud, excited dog. It will bark — and it will run over.", "Watch where it stops. Stay still, and it runs out of steam."],
  ],
  // Lines describe the real cellar + skitter + jar + on-wall arc — never claim
  // the spider is motionless (it skitters and pounces).
  spiders: [
    ["A dim cellar. Something small in the far corner.", "Just look from here. Notice your feet on the cold floor."],
    ["A small spider on the concrete. It shifts, then stills.", "Watch the legs. Watch your breath. Both can happen at once."],
    ["It's closer now, and it darts when it moves.", "When it skitters, your body jumps. Let it. Then settle."],
    ["A big one, near your feet. You can see the legs work.", "Step back any time. Or lower the jar over it. You're in control."],
    ["On the wall, right at eye level. Legs twitching.", "Hold your ground for one breath. If it lunges, you can back away."],
  ],
  enclosed: [
    ["A small meeting room. Close the door behind you.", "Notice the air. There is plenty of it, and the door opens any time."],
    ["A phone booth in an open office.", "Glass on one side, walls within reach. Stand at the back, and stay."],
    ["A small lift. The doors close between floors.", "A lift is a small room that moves. Ride it, and watch what your alarm does."],
    ["A storage closet. Shelves at your shoulders.", "The light is yours. Try it off, just for a few breaths."],
    ["The scanner table. The bore is just behind your head.", "The knocking is the scanner working. The ball in your hand brings you out, any time."],
  ],
  flying: [
    ["Watching planes from the gate.", "Tens of thousands of these take off safely every day."],
    ["Walking the aisle to your seat.", "Notice the carpet, the rows, the people. Just normal."],
    ["Seated. Engines humming.", "Slow breath. Feel the seat under you."],
    ["Takeoff. Pressure in your chest.", "This sensation is acceleration, not danger. It will pass."],
    ["Bumps in the air. Sign on.", "Turbulence is air, not a fall. The plane is built for this."],
  ],
  needles: [
    ["A syringe across the room.", "It is just metal and plastic. Notice your breath."],
    ["The nurse picks it up.", "This is routine. Hundreds of times a day in this clinic."],
    ["The dose is drawn.", "You can look away. Your job is to breathe."],
    ["The needle approaches your arm.", "A small pinch is coming. Soft jaw, soft shoulders."],
    ["The injection.", "Less than a second. Then it is over. Notice the relief."],
  ],
  snakes: [
    ["A snake sunning itself, far across the clearing.", "Just watch from here. Notice your feet on the warm path."],
    ["The same snake, nearer now, tongue tasting the air.", "Slow movement reads as safety. Let your shoulders drop."],
    ["It slides across the path ahead of you. Movement, not threat.", "Stay still and it settles. You are larger than it fears."],
    ["Coiled on a warm rock, reared, watching you.", "Hold your pace. Hold still and it will choose to leave."],
    ["Close and alert. The tongue flicks. It may strike the air.", "If it strikes, it stops short. Stay slow. Notice the urge to run, and stay."],
  ],
  speaking: [
    ["An empty room.", "Hear your own voice. It is yours. It belongs."],
    ["A small group of friends.", "They want you to do well. Look at one face."],
    ["Twenty people, listening.", "Pause. Breathe. They cannot read your mind."],
    ["A roomful of strangers.", "The fear is in your body, not in the room. Speak slowly."],
    ["A packed auditorium.", "Spotlight, silence. You can begin. You can pause. You are okay."],
  ],
  driving: [
    ["Parked. Engine running.", "Notice your hands on the wheel. They know what to do."],
    ["A quiet street.", "Eyes ahead. Eyes mirror. Eyes ahead. Steady."],
    ["A city avenue.", "Other drivers are predictable. Most of the time. So are you."],
    ["A highway. Sustained speed.", "Speed feels different than it is. Your body is built for this."],
    ["Rain on the motorway.", "Slow your shoulders. Loosen your grip. The road is still there."],
  ],
  storms: [
    ["A grumble far away.", "Far. Notice how far. Count the seconds between flash and sound."],
    ["The front is coming.", "Wind, flashes. Your house is solid. The lightning seeks the ground."],
    ["The storm is overhead.", "Loud. Bright. Brief. Each strike lasts less than a second."],
    ["A strike nearby.", "Your body jumps. That's normal. The strike is already over."],
    ["Right above you.", "Flash and crack together. You are inside, you are dry. It will pass."],
  ],
  dark: [
    ["Your bedroom at night. The lamp is on.", "Walk to the window. Notice how much you can still see."],
    ["Curtains drawn. Only a night-light.", "Shapes in low light are the same furniture as in daylight."],
    ["Lights off. Moonlight through the window.", "Your eyes are adjusting. Give them a minute and watch the room come back."],
    ["The landing at night.", "A long, dark hallway — the same one you walk every day."],
    ["Total dark. Only the house's sounds.", "Creaks, hums, taps. Name each one, and stay."],
  ],
};
