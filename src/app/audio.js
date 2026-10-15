// PhobiaAudio — every sound the game makes: ambient beds, creature voices, SFX
// and the scene audio bus.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

const PhobiaAudio = (() => {
  let ctx = null, master = null, creatureBus = null, muted = false;
  // Last-known listener position (updateListener writes it) — used by
  // spatial() for distance-dependent air absorption + reverb send levels.
  let _lp = null;
  // Shared procedural room reverb (see roomReverb below). Scenes opt in.
  let _room = null;
  let _roomIR = null;
  try {
    muted = localStorage.getItem("fobia.muted") === "1";
  } catch {}

  function ensureCtx() {
    if (ctx) return ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.7;
      master.connect(ctx.destination);
      // A second bus for CREATURE vocalisations (bark, growl, pant, whine) that
      // voice-ducking deliberately does NOT pull down. The bark IS the
      // cynophobia trigger; muffling it ~60% every time the guide speaks gutted
      // the climax. Ambient still ducks under the voice; the dog does not.
      creatureBus = ctx.createGain();
      creatureBus.gain.value = muted ? 0 : 0.7;
      creatureBus.connect(ctx.destination);
    } catch { ctx = null; }
    return ctx;
  }

  // Browsers require a user gesture before audio plays. Call this in click handlers.
  // iOS Safari can return AudioContext in "interrupted" state after a phone
  // call or screen lock — we treat both as "suspended" and try to resume.
  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    try {
      if (c.state === "suspended" || c.state === "interrupted") {
        c.resume().catch(() => {});
      }
    } catch {}
  }

  // Master output = base level × duck. Ducking pulls the environmental bed
  // down while the therapist voice speaks (the way a real guide's voice sits
  // ON TOP of a room, not inside its noise) and restores it gently after.
  let duckLevel = 1;
  function applyMasterGain(ramp = 0.2) {
    try {
      if (master && ctx) {
        master.gain.linearRampToValueAtTime((muted ? 0 : 0.7) * duckLevel, ctx.currentTime + ramp);
      }
      // Creature bus follows mute but ignores duck — the dog keeps its voice
      // when the guide speaks.
      if (creatureBus && ctx) {
        creatureBus.gain.linearRampToValueAtTime(muted ? 0 : 0.7, ctx.currentTime + ramp);
      }
    } catch {}
  }
  function duck(on) {
    duckLevel = on ? 0.4 : 1;
    // Restore in 0.35 s, not 0.6: with a voice line every ~14 s the slow
    // swell back read as a "whoosh" after every sentence — ducking pump.
    applyMasterGain(on ? 0.15 : 0.35);
  }
  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem("fobia.muted", muted ? "1" : "0"); } catch {}
    applyMasterGain(0.2);
  }
  const isMuted = () => muted;

  // White noise is copied from a random offset of one 4 s master: a memcpy
  // instead of a Math.random() per sample — up to 96k of them per call, and
  // footsteps and paw plants called this several times a step. A slice of
  // white noise is white noise, and two calls get different offsets.
  let _noiseMaster = null;
  function noiseBuffer(seconds = 2) {
    const c = ensureCtx(); if (!c) return null;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const data = buf.getChannelData(0);
    if (!_noiseMaster || _noiseMaster.rate !== c.sampleRate) {
      const m = new Float32Array(c.sampleRate * 4);
      for (let i = 0; i < m.length; i++) m[i] = Math.random() * 2 - 1;
      _noiseMaster = { data: m, rate: c.sampleRate };
    }
    const m = _noiseMaster.data;
    if (data.length <= m.length) {
      const off = Math.floor(Math.random() * (m.length - data.length + 1));
      data.set(m.subarray(off, off + data.length));
    } else {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    return buf;
  }
  // Pink (1/f) noise — far less harsh than white noise, so natural textures
  // (wind, water, rain, room tone, crowd) read as soft air/water instead of
  // a bright "tssss" hiss. Paul Kellet's economical pink-filter approximation.
  let _pinkBuf = null;
  function pinkNoiseBuffer(seconds = 3) {
    if (_pinkBuf) return _pinkBuf;
    const c = ensureCtx(); if (!c) return null;
    const buf = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate);
    const data = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < data.length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    _pinkBuf = buf;
    return buf;
  }

  // ---- Spatial audio ----
  // PhobiaAudio.spatial(pos) returns an AudioNode connected to master that
  // applies HRTF panning + distance attenuation. The caller wires their
  // sound's final output to the returned node instead of `master`. If pos
  // is omitted (no spatialization desired) we just return `master`.
  function spatial(pos, opts = {}) {
    const c = ensureCtx();
    const outBus = opts.creature ? creatureBus : master;
    if (!c || !pos) return outBus;
    // A position with a missing or NaN coordinate makes the PannerNode throw
    // ("non-finite value"), which aborts the caller mid-graph and the sound is
    // silently never heard. Cheap to check, and it turns a whole dead sound
    // into a merely unpanned one.
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) return outBus;
    const panner = c.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = opts.refDistance != null ? opts.refDistance : 1.5;
    panner.maxDistance = opts.maxDistance != null ? opts.maxDistance : 80;
    panner.rolloffFactor = opts.rolloffFactor != null ? opts.rolloffFactor : 1.6;
    // Older API form (positionX/Y/Z is on AudioParam in newer browsers,
    // but setPosition() works everywhere).
    if (panner.positionX) {
      panner.positionX.value = pos.x;
      panner.positionY.value = pos.y;
      panner.positionZ.value = pos.z;
    } else if (panner.setPosition) {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
    // Directional cone — when `forward` is provided the sound is louder in
    // front of the source and muffled behind. Used for bark direction (real
    // dogs sound louder when facing you).
    if (opts.forward) {
      panner.coneInnerAngle  = opts.coneInnerAngle  != null ? opts.coneInnerAngle  : 90;
      panner.coneOuterAngle  = opts.coneOuterAngle  != null ? opts.coneOuterAngle  : 240;
      panner.coneOuterGain   = opts.coneOuterGain   != null ? opts.coneOuterGain   : 0.35;
      const f = opts.forward;
      if (panner.orientationX) {
        panner.orientationX.value = f.x;
        panner.orientationY.value = f.y;
        panner.orientationZ.value = f.z;
      } else if (panner.setOrientation) {
        panner.setOrientation(f.x, f.y, f.z);
      }
    }
    panner.connect(outBus);
    // ---- Optional acoustics (ADDITIVE — existing callers unchanged) ----
    // opts.air: distance-dependent lowpass (air absorption) so far sources
    // sound duller. opts.reverb (0..1): pre-panner send into the shared room
    // convolver — the dry level falls with distance via the panner while the
    // wet stays constant, so the wet/dry ratio rises with distance and far
    // barks genuinely read as far.
    if (opts.air || (opts.reverb > 0 && _room)) {
      const dist = _lp ? Math.hypot(pos.x - _lp.x, pos.y - _lp.y, pos.z - _lp.z) : 3;
      const input = c.createGain();
      if (opts.air) {
        const lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = Math.max(1200, 16000 / (1 + Math.max(0, dist - 3) * 0.45));
        lp.Q.value = 0.5;
        input.connect(lp);
        lp.connect(panner);
      } else {
        input.connect(panner);
      }
      if (opts.reverb > 0 && _room) {
        const send = c.createGain();
        send.gain.value = opts.reverb * _room.level * (0.7 + Math.min(1, dist / 8) * 0.6);
        input.connect(send);
        send.connect(_room.convolver);
      }
      return input;
    }
    return panner;
  }

  // ---- Output calibration ----
  // Every one-shot below is white or pink noise pushed through a narrow filter,
  // and the gain constants were all written as if the filter were transparent.
  // It is not: a lowpass at 250 Hz throws away ~97% of white noise's energy, a
  // bandpass at Q 2 rather less, so the level a sound ACTUALLY reaches depends
  // on its filter and not on the number its author picked. Measured across the
  // library that put 52 dB between the loudest and quietest one-shot — a splash
  // at −1.9 dBFS (already at the edge of clipping once anything else plays) and
  // the player's own footsteps at −41 to −48 dB, which is inaudible. The whole
  // spider and snake foley layer sat 30–46 dB down, which is why those scenes
  // sounded empty.
  //
  // Rather than re-derive every envelope, each sound gets one calibrated trim.
  // `was` is the peak that sound measured at its nominal call with no distance
  // attenuation; `want` is where it belongs in the mix. Re-measure and update
  // `was` if you change a sound's synthesis.
  //
  // The target bands:
  //   startle / impact   ≈ 0.26–0.30  (−11 dBFS)  bark, thunder, strike, splash
  //   strong event       ≈ 0.12–0.16  (−17 dBFS)  growl, hiss, rattle, bounce
  //   player foley       ≈ 0.04–0.075 (−24 dBFS)  footsteps — heard constantly
  //   creature intimacy  ≈ 0.032–0.055(−27 dBFS)  pant, sniff, skitter, tongue
  //   incidental         ≈ 0.026–0.045(−30 dBFS)  crowd, UI, indicator
  const SFX_CAL = {
    // impact / startle
    splash:        [0.8016, 0.28],
    bark:          [0.4287, 0.30],
    thunder:       [0.50410, 0.30],
    snakeStrike:   [0.1298, 0.26],
    // strong events
    growl:         [0.1623, 0.16],
    snakeHiss:     [0.0945, 0.14],
    hissOnce:      [0.0827, 0.14],
    ballBounce:    [0.1077, 0.13],
    metalRattle:   [0.0669, 0.13],
    doorCreak:     [0.0557, 0.12],
    windHowl:      [0.1003, 0.15],
    // player foley — the most-heard sounds in the game
    footstep_hard:   [0.01581, 0.085],
    footstep_wood:   [0.02148, 0.082],
    footstep_soft:   [0.00408, 0.055],
    footstep_grass:  [0.02000, 0.062],
    footstep_splash: [0.02336, 0.090],
    footstep_glass:  [0.01493, 0.075],
    // creature intimacy
    dogWhine:      [0.0608, 0.070],
    dogPant:       [0.0144, 0.052],
    dogSniff:      [0.0132, 0.055],
    dogFootfall:   [0.0234, 0.058],
    dogSample:     [0.50, 0.48],      // recorded bark/growl/pant/woof — keep close to the take
    collarJingle:  [0.040, 0.048],
    dogMouthGrab:  [0.0438, 0.052],
    dogLapping:    [0.0300, 0.044],
    skitterBurst:  [0.0325, 0.050],
    skitterTicks:  [0.0146, 0.044],
    bristleRustle: [0.0416, 0.040],
    chitinTik:     [0.0443, 0.046],
    webPluck:      [0.0020, 0.042],
    tongueFlick:   [0.0050, 0.046],
    // incidental
    crowdCough:    [0.0322, 0.030],
    crowdShuffle:  [0.0167, 0.026],
    crowdOneShot:  [0.0322, 0.030],
    indicatorClick:[0.0343, 0.046],
    applause:      [0.0545, 0.090],
    ui:            [0.0199, 0.034],
  };
  // Ambient BEDS are calibrated the same way but at their own start() gains,
  // because they are continuous and set the floor everything else sits on.
  // Measured in isolation they ran from rain at −25.1 dB RMS to the auditorium
  // murmur at −47.5: a 22 dB spread, so a volume set in one realm was wrong in
  // the next. They now sit inside a −30…−36 window. Re-measure after changing
  // any start* gain — the bed level is what every one-shot above is judged
  // against.
  // Wrap spatial() with the calibrated trim. Unknown names pass straight
  // through, so a new sound is never silently rescaled by accident.
  function sfxOut(name, pos, opts = {}) {
    const c = ensureCtx(); if (!c) return null;
    const out = spatial(pos, opts);
    const cal = SFX_CAL[name];
    if (!cal || !out) return out;
    const g = c.createGain();
    g.gain.value = cal[1] / cal[0];
    g.connect(out);
    return g;
  }

  // ---- Procedural room reverb ----
  // A small-room impulse response synthesized once (early reflections +
  // exponentially decaying, progressively darkened noise tail) feeding one
  // shared ConvolverNode. Scenes opt in via roomReverb(); every spatial()
  // call with opts.reverb then sends into it. Routed through creatureBus so
  // vocal tails never duck under the therapist voice.
  function makeRoomIR(c) {
    if (_roomIR) return _roomIR;
    const dur = 0.4;
    const len = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(2, len, c.sampleRate);
    const TAU = dur / Math.log(1000);        // −60 dB at dur
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      // Early reflections, decorrelated per channel
      const taps = [0.009, 0.014, 0.021, 0.029, 0.038, 0.045];
      const amps = [0.55, 0.45, 0.38, 0.30, 0.24, 0.19];
      for (let i = 0; i < taps.length; i++) {
        const tt = taps[i] + (Math.random() * 2 - 1) * 0.003;
        const idx = Math.floor(tt * c.sampleRate);
        if (idx < 2 || idx >= len - 3) continue;
        const a = amps[i] * (Math.random() < 0.5 ? -1 : 1);
        data[idx] += a;
        data[idx + 1] += a * 0.5;
        data[idx + 2] += a * 0.25;
      }
      // Late tail: decaying noise, one-pole lowpass that darkens over time
      let y = 0;
      const i0 = Math.floor(0.02 * c.sampleRate);
      for (let i = i0; i < len; i++) {
        const t = i / c.sampleRate;
        const prog = (t - 0.02) / (dur - 0.02);
        const k = 0.55 - prog * 0.40;         // ~6 kHz → ~1.5 kHz
        y = y + k * ((Math.random() * 2 - 1) - y);
        data[i] += y * Math.exp(-t / TAU) * 0.5;
      }
      // Normalize to ≤0.5 peak
      let peak = 0;
      for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(data[i]));
      if (peak > 0.5) for (let i = 0; i < len; i++) data[i] *= 0.5 / peak;
    }
    _roomIR = buf;
    return buf;
  }
  function roomReverb(opts = {}) {
    const c = ensureCtx();
    if (!c) return { stop() {} };
    if (_room) { _room.refs++; return { stop: _roomStop }; }
    const convolver = c.createConvolver();
    convolver.buffer = makeRoomIR(c);
    convolver.normalize = true;
    const wet = c.createGain();
    wet.gain.value = 1;
    convolver.connect(wet);
    wet.connect(creatureBus);
    _room = { convolver, wet, level: opts.level != null ? opts.level : 0.18, refs: 1 };
    return { stop: _roomStop };
  }
  function _roomStop() {
    if (!_room) return;
    _room.refs--;
    if (_room.refs > 0) return;
    const r = _room;
    _room = null;
    try {
      r.wet.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      setTimeout(() => { try { r.convolver.disconnect(); r.wet.disconnect(); } catch {} }, 800);
    } catch {}
  }

  // Update the AudioListener so HRTF panning tracks the camera. The caller
  // passes plain {position, forward, up} vectors as objects with x/y/z so we
  // don't depend on Three.js types here in the classic-script audio module.
  function updateListener({ position, forward, up }) {
    const c = ensureCtx(); if (!c) return;
    const L = c.listener;
    if (!position || !forward || !up) return;
    _lp = { x: position.x, y: position.y, z: position.z };
    if (L.positionX) {
      L.positionX.value = position.x; L.positionY.value = position.y; L.positionZ.value = position.z;
      L.forwardX.value  = forward.x;  L.forwardY.value  = forward.y;  L.forwardZ.value  = forward.z;
      L.upX.value       = up.x;       L.upY.value       = up.y;       L.upZ.value       = up.z;
    } else if (L.setPosition) {
      L.setPosition(position.x, position.y, position.z);
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // ---- Looped textures (wind, water, underwater, room tone) ----
  function startLoop({ baseFreq, q = 0.7, gain: gainTarget = 0.3, lfoRate = 0.3, lfoDepth = 100, type = "lowpass", pink = false }) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const buf = pink ? pinkNoiseBuffer(3) : noiseBuffer(3);
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const filt = c.createBiquadFilter();
    filt.type = type; filt.frequency.value = baseFreq; filt.Q.value = q;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(gainTarget, c.currentTime + 1.2);
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = lfoRate; lfoGain.gain.value = lfoDepth;
    lfo.connect(lfoGain).connect(filt.frequency);
    src.connect(filt).connect(gain).connect(master);
    src.start(); lfo.start();
    return {
      stop() {
        if (!c) return;
        gain.gain.cancelScheduledValues(c.currentTime);
        gain.gain.setTargetAtTime(0, c.currentTime, 0.4);
        setTimeout(() => { try { src.stop(); lfo.stop(); } catch {} }, 1500);
      },
    };
  }

  function startWind(intensity = 0.6) {
    return startLoop({
      baseFreq: 220 + intensity * 700, q: 0.9,
      gain: 0.119 + intensity * 0.145, lfoRate: 0.28, lfoDepth: 250 * intensity, pink: true,
    });
  }
  function startWaterLap(intensity = 0.5) {
    // Slower, deeper filter LFO + pink noise → a gentle wash that swells and
    // recedes like laps on a shore, instead of steady bright hiss.
    return startLoop({
      baseFreq: 480 + intensity * 900, q: 0.7,
      gain: 0.131 + intensity * 0.131, lfoRate: 0.22, lfoDepth: 520 * intensity, pink: true,
    });
  }
  function startUnderwater() {
    return startLoop({
      baseFreq: 220, q: 1.2, gain: 0.248, lfoRate: 0.18, lfoDepth: 60, pink: true,
    });
  }
  // A room's own sound is AIR, not a hum. This used to be pink noise squeezed
  // through a Q-1.2 bandpass at 102 Hz — a resonant drone, the sound of a
  // machine somewhere, and at four times this level. Wide, high and quiet reads
  // as "an indoor space" and leaves headroom for the things that actually
  // happen in the room (see startRoomLife).
  function startRoomTone(intensity = 0.4) {
    return startLoop({
      baseFreq: 300 + intensity * 260, q: 0.30,
      gain: 0.028 + intensity * 0.034, lfoRate: 0.05, lfoDepth: 70, pink: true,
    });
  }

  // ---- Recorded ambience beds ----
  // Pink-noise room tone reads as a machine; a short Mixkit bed filtered and
  // looped reads as a place. Cached by URL, gain-ramped, optional low-pass so
  // outdoor birds through glass stay muffled.
  const _bedCache = new Map();
  function _loadBed(url) {
    if (_bedCache.has(url)) return _bedCache.get(url);
    const c = ensureCtx();
    if (!c) return Promise.resolve(null);
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
      .then((ab) => c.decodeAudioData(ab))
      .catch(() => null);
    _bedCache.set(url, p);
    return p;
  }
  function startAmbienceBed(kind, opts = {}) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const urls = {
      birds: "assets/audio/ambient/birds.mp3",
      forest: "assets/audio/ambient/forest.mp3",
      room: "assets/audio/ambient/room_soft.mp3",
      wind: "assets/audio/ambient/wind_soft.mp3",
    };
    const url = urls[kind] || urls.room;
    const gainLevel = opts.gain == null ? 0.045 : opts.gain;
    const lpHz = opts.lowpass || 0;
    let stopped = false;
    let src = null, g = null, lp = null;
    const startBuf = (buf) => {
      if (stopped || !buf) return;
      src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainLevel), c.currentTime + 1.2);
      let node = src;
      if (lpHz > 0) {
        lp = c.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = lpHz;
        lp.Q.value = 0.5;
        node.connect(lp);
        node = lp;
      }
      node.connect(g);
      // Soft beds sit on the master bus (not the creature bus) so barks stay on top.
      const dest = (typeof master !== "undefined" && master) ? master : c.destination;
      try { g.connect(dest); } catch { g.connect(c.destination); }
      src.start();
    };
    _loadBed(url).then(startBuf);
    return {
      setGain(v) {
        if (g) {
          try {
            g.gain.cancelScheduledValues(c.currentTime);
            g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), c.currentTime + 0.4);
          } catch {}
        }
      },
      stop() {
        stopped = true;
        if (!g) return;
        try {
          const t = c.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
          if (src) src.stop(t + 0.7);
        } catch {}
      },
    };
  }

  // ---- Room life ----
  // What actually makes a room sound like a place: near-silence, and then
  // something happens. A bird beyond the glass, the floor settling, a car two
  // streets away. Sparse, randomly spaced and PLACED — the window sounds come
  // from the window — so the ear builds a room out of them. A continuous bed
  // can never do this however carefully it's filtered.
  function startRoomLife(opts = {}) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const win = opts.window || { x: 0, y: 0.5, z: -6 };
    const room = opts.room || { x: 0, z: 0, rx: 4, rz: 5 };
    const level = opts.level == null ? 1 : opts.level;
    let alive = true;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
      timers.add(id);
    };
    // Birdsong outside. Muffled by the glass — a low-pass is most of what a
    // closed window does to a bird.
    const bird = () => {
      const now = c.currentTime;
      const out = spatial(
        { x: win.x + (Math.random() - 0.5) * 3, y: win.y + 1.2 + Math.random() * 1.5, z: win.z - 1.5 - Math.random() * 5 },
        { refDistance: 2.5, maxDistance: 34, air: true }
      );
      const glass = c.createBiquadFilter();
      glass.type = "lowpass"; glass.frequency.value = 2600; glass.Q.value = 0.6;
      glass.connect(out);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t0 = now + i * (0.09 + Math.random() * 0.07);
        const f = 2000 + Math.random() * 1300;
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(f, t0);
        o.frequency.exponentialRampToValueAtTime(f * (0.88 + Math.random() * 0.34), t0 + 0.07);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.020 * level, t0 + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.09);
        o.connect(g).connect(glass); o.start(t0); o.stop(t0 + 0.12);
      }
      later(bird, 7000 + Math.random() * 13000);
    };
    // The building settling: a short woody creak from somewhere in the room.
    const creak = () => {
      const now = c.currentTime;
      const out = spatial(
        { x: room.x + (Math.random() - 0.5) * room.rx * 1.6, y: -0.6, z: room.z + (Math.random() - 0.5) * room.rz * 1.6 },
        { refDistance: 1.5, maxDistance: 14 }
      );
      const dur = 0.18 + Math.random() * 0.22;
      const o = c.createOscillator(); o.type = "sawtooth";
      const f0 = 120 + Math.random() * 90;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.linearRampToValueAtTime(f0 * (1.10 + Math.random() * 0.25), now + dur);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 900; lp.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.014 * level, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
      o.connect(lp).connect(g).connect(out); o.start(now); o.stop(now + dur + 0.05);
      later(creak, 22000 + Math.random() * 34000);
    };
    // A car, streets away. A slow swell of low noise through the window.
    const car = () => {
      const now = c.currentTime;
      const out = spatial({ x: win.x, y: win.y, z: win.z - 14 }, { refDistance: 6, maxDistance: 60, air: true });
      const dur = 3.5 + Math.random() * 2.5;
      const src = c.createBufferSource(); src.buffer = pinkNoiseBuffer(dur + 0.4); src.loop = false;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.Q.value = 0.5;
      lp.frequency.setValueAtTime(260, now);
      lp.frequency.linearRampToValueAtTime(430, now + dur * 0.5);
      lp.frequency.linearRampToValueAtTime(240, now + dur);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.020 * level, now + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
      src.connect(lp).connect(g).connect(out); src.start(now); src.stop(now + dur + 0.2);
      later(car, 45000 + Math.random() * 70000);
    };
    later(bird, 2500 + Math.random() * 5000);
    later(creak, 12000 + Math.random() * 20000);
    later(car, 20000 + Math.random() * 40000);
    return {
      stop() {
        alive = false;
        for (const id of timers) clearTimeout(id);
        timers.clear();
      },
    };
  }

  // ---- Fire crackle ----
  // A campfire is not a hiss. It's a low roar (filtered noise) with irregular
  // pops as pockets of sap burst. Sparse pops + a dark bed reads as wood fire
  // instead of a gas ring.
  function startFireCrackle(opts = {}) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const level = opts.gain == null ? 0.055 : opts.gain;
    const pos = opts.pos || { x: 0, y: 0.3, z: 0 };
    const out = spatial(pos, { refDistance: 1.4, maxDistance: 18, reverb: 0.12 });
    const src = c.createBufferSource();
    src.buffer = pinkNoiseBuffer(3.2);
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 780; lp.Q.value = 0.55;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 420; bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), c.currentTime + 0.8);
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    lfo.type = "sine"; lfo.frequency.value = 0.28;
    lfoG.gain.value = level * 0.22;
    lfo.connect(lfoG).connect(g.gain);
    src.connect(lp).connect(bp).connect(g).connect(out);
    src.start(); lfo.start();
    let alive = true;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
      timers.add(id);
    };
    const pop = () => {
      if (!alive) return;
      const now = c.currentTime;
      const ns = c.createBufferSource(); ns.buffer = noiseBuffer(0.12);
      const pbp = c.createBiquadFilter();
      pbp.type = "bandpass";
      pbp.frequency.value = 900 + Math.random() * 1600;
      pbp.Q.value = 1.8;
      const pg = c.createGain();
      pg.gain.setValueAtTime(0.0001, now);
      pg.gain.exponentialRampToValueAtTime(0.045 + Math.random() * 0.04, now + 0.004);
      pg.gain.exponentialRampToValueAtTime(0.0004, now + 0.05 + Math.random() * 0.06);
      ns.connect(pbp).connect(pg).connect(out);
      ns.start(now); ns.stop(now + 0.14);
      later(pop, 400 + Math.random() * 1600);
    };
    later(pop, 300 + Math.random() * 700);
    return {
      stop() {
        alive = false;
        for (const id of timers) clearTimeout(id);
        timers.clear();
        try {
          g.gain.cancelScheduledValues(c.currentTime);
          g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.5);
          src.stop(c.currentTime + 0.55);
          lfo.stop(c.currentTime + 0.55);
        } catch {}
      },
    };
  }

  // ---- Outdoor life ----
  // A yard / clearing is air, then something happens: a leaf, a twig, an
  // insect, a distant animal. Sparse and placed, same idea as startRoomLife.
  function startOutdoorLife(opts = {}) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const level = opts.level == null ? 1 : opts.level;
    const night = !!opts.night;
    let alive = true;
    const timers = new Set();
    const later = (fn, ms) => {
      const id = setTimeout(() => { timers.delete(id); if (alive) fn(); }, ms);
      timers.add(id);
    };
    const leaf = () => {
      const now = c.currentTime;
      const out = spatial(
        { x: (Math.random() - 0.5) * 10, y: 0.4 + Math.random() * 1.6, z: -2 - Math.random() * 8 },
        { refDistance: 2.2, maxDistance: 28, air: true }
      );
      const src = c.createBufferSource(); src.buffer = noiseBuffer(0.35);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 1800 + Math.random() * 1400; bp.Q.value = 0.8;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.016 * level, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0004, now + 0.28);
      src.connect(bp).connect(g).connect(out);
      src.start(now); src.stop(now + 0.35);
      later(leaf, 5000 + Math.random() * 11000);
    };
    const twig = () => {
      const now = c.currentTime;
      const out = spatial(
        { x: (Math.random() - 0.5) * 8, y: 0.05, z: -1 - Math.random() * 6 },
        { refDistance: 1.6, maxDistance: 18 }
      );
      const o = c.createOscillator(); o.type = "sawtooth";
      const f0 = 180 + Math.random() * 140;
      o.frequency.setValueAtTime(f0, now);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.55, now + 0.08);
      const lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 1100; lp.Q.value = 0.7;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.012 * level, now + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0004, now + 0.09);
      o.connect(lp).connect(g).connect(out); o.start(now); o.stop(now + 0.12);
      later(twig, 14000 + Math.random() * 22000);
    };
    const insect = () => {
      const now = c.currentTime;
      const dur = night ? (1.4 + Math.random() * 2.2) : (0.5 + Math.random() * 0.9);
      const out = spatial(
        { x: (Math.random() - 0.5) * 12, y: 0.15, z: -3 - Math.random() * 9 },
        { refDistance: 2.4, maxDistance: 30, air: true }
      );
      const src = c.createBufferSource(); src.buffer = noiseBuffer(dur + 0.1);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = (night ? 3800 : 4600) + Math.random() * 900;
      bp.Q.value = night ? 8 : 5;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime((night ? 0.010 : 0.008) * level, now + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0004, now + dur);
      src.connect(bp).connect(g).connect(out);
      src.start(now); src.stop(now + dur);
      later(insect, (night ? 4000 : 8000) + Math.random() * 10000);
    };
    later(leaf, 1800 + Math.random() * 4000);
    later(twig, 8000 + Math.random() * 12000);
    later(insect, 2200 + Math.random() * 5000);
    return {
      stop() {
        alive = false;
        for (const id of timers) clearTimeout(id);
        timers.clear();
      },
    };
  }

  // Night valley bed for the 3D landing: wind + muffled forest + fire + life.
  function startNightValley(opts = {}) {
    const handles = [];
    try { handles.push(startAmbienceBed("wind", { gain: opts.windGain == null ? 0.028 : opts.windGain })); } catch {}
    try { handles.push(startAmbienceBed("forest", { gain: opts.forestGain == null ? 0.018 : opts.forestGain, lowpass: 1400 })); } catch {}
    try { handles.push(startFireCrackle({ gain: opts.fireGain == null ? 0.048 : opts.fireGain, pos: opts.firePos || { x: 0, y: 0.25, z: 0 } })); } catch {}
    try { handles.push(startOutdoorLife({ night: true, level: opts.life == null ? 0.85 : opts.life })); } catch {}
    return {
      stop() { handles.forEach((h) => { try { h && h.stop && h.stop(); } catch {} }); },
    };
  }

  // ---- Dog vocal sample bank ----
  // Recorded CC0 dog vocalizations (assets/audio/dog/) with round-robin
  // selection + pitch jitter, falling back per-kind to synthesis when a kind
  // has no recordings (whine, sniff) or the manifest is empty/offline. The
  // bark IS the cynophobia trigger — a real recording lands where any synth
  // reads as videogame beep.
  let _dogBank = null;   // null=not attempted | 'loading' | 'absent' | bank
  function preloadDogSamples() {
    if (_dogBank !== null) return;
    _dogBank = "loading";
    const c = ensureCtx();
    if (!c) { _dogBank = "absent"; return; }
    fetch("assets/audio/dog/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((man) => {
        const kindsIn = man && man.kinds ? man.kinds : null;
        if (!kindsIn || !Object.keys(kindsIn).length) { _dogBank = "absent"; return; }
        const bank = { kinds: {} };
        const jobs = [];
        for (const kind of Object.keys(kindsIn)) {
          const entry = { bufs: [], order: [], idx: 0, last: -1 };
          bank.kinds[kind] = entry;
          for (const f of kindsIn[kind]) {
            jobs.push(
              fetch("assets/audio/dog/" + f)
                .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
                .then((ab) => c.decodeAudioData(ab))
                .then((buf) => { entry.bufs.push(buf); })
                .catch(() => {})            // per-file failure = smaller bank
            );
          }
        }
        Promise.allSettled(jobs).then(() => {
          const any = Object.values(bank.kinds).some((k) => k.bufs.length > 0);
          _dogBank = any ? bank : "absent";
        });
      })
      .catch(() => { _dogBank = "absent"; });
  }
  function _takeSample(kind, opts = {}) {
    if (!_dogBank || typeof _dogBank === "string") return null;
    // A deep bark prefers the large-breed bank when present.
    let k = kind;
    if (kind === "bark" && (opts.f0 || 400) < 320 && _dogBank.kinds.bark_big
        && _dogBank.kinds.bark_big.bufs.length) k = "bark_big";
    const entry = _dogBank.kinds[k];
    if (!entry || !entry.bufs.length) return null;
    // Round-robin over a shuffled order; reshuffle avoiding immediate repeats.
    if (entry.order.length !== entry.bufs.length || entry.idx >= entry.order.length) {
      const order = entry.bufs.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      if (order.length > 1 && order[0] === entry.last) [order[0], order[1]] = [order[1], order[0]];
      entry.order = order;
      entry.idx = 0;
    }
    const pick = entry.order[entry.idx++];
    entry.last = pick;
    return entry.bufs[pick];
  }
  function _playSample(buf, intensity, pos, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = Math.pow(2, (Math.random() * 2 - 1) / 12) * (opts.rate || 1);
    // Route through SFX_CAL so recordings sit at the same loudness as synth
    // fallbacks — raw 0.9*intensity was ~6 dB hotter and fought the mix.
    const out = sfxOut(opts.cal || "dogSample", pos, {
      refDistance: 1.5, maxDistance: 30, rolloffFactor: 1.6, creature: true,
      air: opts.air, reverb: opts.reverb,
      forward: opts.forward, coneInnerAngle: opts.coneInnerAngle,
      coneOuterAngle: opts.coneOuterAngle, coneOuterGain: opts.coneOuterGain,
    });
    if (!out) return;
    const g = c.createGain();
    const peak = Math.max(0.0002, 0.55 * intensity);
    const when = opts.when || c.currentTime;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(peak, when + 0.008);
    src.connect(g);
    g.connect(out);
    src.start(when);
  }

  // Formant-based bark synthesis — the fallback voice when no recording
  // covers a kind. Pitch-swept sawtooth (plus a detuned subharmonic for
  // big-dog rasp) through three parallel formant bandpasses, a noise attack,
  // a body lowpass, a double-pulse "ra-uff" amplitude envelope and a chest
  // sub. Nothing like the old 4-oscillator beep.
  function _barkFormant(intensity = 0.8, pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const out = spatial(pos, {
      refDistance: 1.5, maxDistance: 30, rolloffFactor: 1.6, creature: true,
      air: opts.air, reverb: opts.reverb != null ? opts.reverb : 0.22,
      forward: opts.forward, coneInnerAngle: opts.coneInnerAngle,
      coneOuterAngle: opts.coneOuterAngle, coneOuterGain: opts.coneOuterGain,
    });
    const t0 = opts.when || c.currentTime;
    const closed = !!opts.closed;
    const f0 = (opts.f0 || 340) * Math.pow(2, (Math.random() * 2 - 1) / 12);
    const srcG = c.createGain();
    const mkSaw = (mult, gain) => {
      const o = c.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(f0 * 0.55 * mult, t0);
      o.frequency.exponentialRampToValueAtTime(f0 * 1.15 * mult, t0 + 0.03);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.75 * mult, t0 + 0.12);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.50 * mult, t0 + 0.22);
      const og = c.createGain();
      og.gain.value = gain;
      o.connect(og);
      og.connect(srcG);
      o.start(t0); o.stop(t0 + 0.30);
      return o;
    };
    mkSaw(1, 1.0);
    if (intensity > 0.6) {
      const sub = mkSaw(0.5, 0.4);       // subharmonic rasp
      sub.detune.value = 150;            // +1.5 Hz-ish beat at these freqs
    }
    // Formants: F1/F2 sweep down as the mouth closes over the bark
    const voiceSum = c.createGain();
    const mkFormant = (fFrom, fTo, Q, gain) => {
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(fFrom, t0);
      if (fTo !== fFrom) bp.frequency.linearRampToValueAtTime(fTo, t0 + 0.15);
      bp.Q.value = Q;
      const fg = c.createGain();
      fg.gain.value = gain;
      srcG.connect(bp);
      bp.connect(fg);
      fg.connect(voiceSum);
    };
    mkFormant(950, 620, 5, 1.0);
    mkFormant(1400, 1100, 7, 0.45);
    if (!closed) mkFormant(2500, 2500, 9, 0.22);
    // Noise attack (the breathy transient of a real bark)
    const nb = noiseBuffer(0.1);
    if (nb) {
      const nsrc = c.createBufferSource();
      nsrc.buffer = nb;
      const nbp = c.createBiquadFilter();
      nbp.type = "bandpass"; nbp.frequency.value = 1800; nbp.Q.value = 1.2;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime((closed ? 0.15 : 0.5) * intensity, t0 + 0.004);
      ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
      nsrc.connect(nbp); nbp.connect(ng); ng.connect(voiceSum);
      nsrc.start(t0); nsrc.stop(t0 + 0.1);
    }
    // Body lowpass → amp envelope → out
    const body = c.createBiquadFilter();
    body.type = "lowpass";
    body.frequency.value = closed ? 1200 : (f0 < 320 ? 2600 : 3200);
    body.Q.value = 0.7;
    const ampG = c.createGain();
    ampG.gain.setValueAtTime(0.0001, t0);
    ampG.gain.exponentialRampToValueAtTime(0.9 * intensity, t0 + 0.012);
    ampG.gain.linearRampToValueAtTime(0.45 * intensity, t0 + 0.07);
    ampG.gain.linearRampToValueAtTime(0.65 * intensity, t0 + 0.10);
    ampG.gain.exponentialRampToValueAtTime(0.001, t0 + (closed ? 0.18 : 0.26));
    voiceSum.connect(body);
    body.connect(ampG);
    ampG.connect(out);
    // Chest sub — the thump you feel from a big dog's bark
    const subO = c.createOscillator();
    subO.type = "sine";
    subO.frequency.setValueAtTime(85, t0);
    subO.frequency.exponentialRampToValueAtTime(50, t0 + 0.14);
    const subG = c.createGain();
    subG.gain.setValueAtTime(0.0001, t0);
    subG.gain.exponentialRampToValueAtTime(0.22 * intensity, t0 + 0.006);
    subG.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
    subO.connect(subG);
    subG.connect(out);
    subO.start(t0); subO.stop(t0 + 0.18);
  }

  // Unified dog vocal entry: recorded sample when the bank covers the kind,
  // synthesis otherwise. Supports bark SEQUENCES (count/gap with micro-timing
  // + per-shot intensity jitter) — real dogs rarely bark exactly once.
  function dogVocal(kind, intensity = 0.8, pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    // Aggressive vocals reach the hand as a short tick (once per call, not per
    // shot of a sequence). Big flinches get their real jolt via Body.startle;
    // this is the low-level "the sound has a body" cue. Pant/sniff stay silent.
    if (kind === "bark" || kind === "woof" || kind === "growl") {
      try {
        if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic(Math.round(8 + intensity * 18));
      } catch {}
    }
    const count = opts.count || 1;
    const gap = opts.gap || 0.16;
    for (let i = 0; i < count; i++) {
      const when = c.currentTime + i * (gap + (Math.random() * 0.06 - 0.03));
      const shot = Math.max(0, Math.min(1, intensity * (1 + (Math.random() * 0.3 - 0.15))));
      const buf = _takeSample(kind, opts);
      if (buf) {
        _playSample(buf, shot, pos, Object.assign({}, opts, { when }));
      } else if (kind === "bark") {
        _barkFormant(shot, pos, Object.assign({}, opts, { when }));
      } else if (kind === "woof") {
        _barkFormant(shot, pos, Object.assign({}, opts, { when, closed: true }));
      } else if (kind === "growl") {
        growl(shot, pos, opts.dur || 1.0);
      } else if (kind === "whine") {
        dogWhine(shot, pos);
      } else if (kind === "pant") {
        dogPant(shot, pos);
      } else if (kind === "sniff") {
        dogSniff(shot, pos);
      }
    }
  }

  // ---- Discrete events (bark, clang, click, breath) ----
  // The optional `pos` argument routes the sound through a PannerNode so it
  // appears to come from that world location. `opts.forward` adds a
  // directional cone so the bark sounds louder when the dog faces you and
  // muffled when it's looking away — real-world acoustic cone behaviour.
  // NOTE: bark()'s synthesis is legacy (heights reuses it as a rattle SFX;
  // all dog upgrades go through dogVocal above). It rides the CREATURE bus
  // deliberately: barks are never ducked under the therapist voice — a side
  // effect being that heights' rattle doesn't duck either, which is fine.
  function bark(intensity = 1.0, pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("bark", pos, Object.assign({
      refDistance: 1.5, maxDistance: 30, rolloffFactor: 1.6, creature: true,
    }, opts));
    const now = c.currentTime;
    // ---- Layered bark synthesis for a more realistic dog voice ----
    // 1. Low growl: sawtooth dropping from 180→60 Hz with throaty body
    // 2. Mid yip:   square wave with formant frequencies of canine vocal tract
    // 3. Noise puff: a bright "wuff" with bandpass for breathy attack
    // 4. Sub thump: sine pulse for body/chest impact
    // Each layer envelopes independently, summed at the panner output.

    // 1. Growl body (low + sawtooth → sounds like vocal-fold vibration)
    const osc1 = c.createOscillator();
    osc1.type = "sawtooth";
    const startF = 180 + Math.random() * 40;
    osc1.frequency.setValueAtTime(startF, now);
    osc1.frequency.exponentialRampToValueAtTime(60, now + 0.20);
    const lp1 = c.createBiquadFilter();
    lp1.type = "lowpass"; lp1.frequency.value = 1100; lp1.Q.value = 0.9;
    const g1 = c.createGain();
    g1.gain.setValueAtTime(0, now);
    g1.gain.linearRampToValueAtTime(0.50 * intensity, now + 0.015);
    g1.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    osc1.connect(lp1).connect(g1).connect(out);
    osc1.start(now); osc1.stop(now + 0.34);

    // 2. Mid yip — formant-tuned square wave, gives the bark its "voice"
    const osc2 = c.createOscillator();
    osc2.type = "square";
    osc2.frequency.setValueAtTime(450 + Math.random() * 80, now);
    osc2.frequency.exponentialRampToValueAtTime(280, now + 0.16);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 2.5;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0, now + 0.005);
    g2.gain.linearRampToValueAtTime(0.18 * intensity, now + 0.025);
    g2.gain.exponentialRampToValueAtTime(0.001, now + 0.20);
    osc2.connect(bp).connect(g2).connect(out);
    osc2.start(now); osc2.stop(now + 0.22);

    // 3. Noise puff — the breathy "wuff" attack
    const buf = noiseBuffer(0.3);
    if (buf) {
      const src = c.createBufferSource(); src.buffer = buf;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, now);
      ng.gain.exponentialRampToValueAtTime(0.32 * intensity, now + 0.003);  // ~3 ms attack kills the onset click
      ng.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      const nbp = c.createBiquadFilter(); nbp.type = "bandpass";
      nbp.frequency.value = 1200; nbp.Q.value = 1.4;
      src.connect(nbp).connect(ng).connect(out);
      src.start(now); src.stop(now + 0.16);
    }

    // 4. Sub thump — chest impact sine, makes the bark feel embodied
    const sub = c.createOscillator();
    sub.type = "sine";
    sub.frequency.setValueAtTime(70, now);
    sub.frequency.exponentialRampToValueAtTime(40, now + 0.14);
    const sg = c.createGain();
    sg.gain.setValueAtTime(0.0001, now);
    sg.gain.exponentialRampToValueAtTime(0.25 * intensity, now + 0.004);   // ~4 ms attack kills the onset click
    sg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    sub.connect(sg).connect(out);
    sub.start(now); sub.stop(now + 0.20);
  }

  function startBarking(rate = 1.4) {
    let alive = true;
    function loop() {
      if (!alive) return;
      const burst = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < burst; i++) setTimeout(() => alive && bark(0.9 + Math.random() * 0.2), i * 220);
      setTimeout(loop, 1400 / rate + Math.random() * 1200);
    }
    setTimeout(loop, 600);
    return { stop() { alive = false; } };
  }

  function startSkittering(pos = null) {
    // Dry "tick-tick" of legs on a hard surface: short bandpass-NOISE clicks,
    // irregularly spaced — NOT pitched square-wave beeps (which sounded 8-bit).
    const c = ensureCtx(); if (!c) return { stop() {} };
    let alive = true, timer = null;
    const out = spatial(pos);          // spatialize when a position is given
    const nb = noiseBuffer(1);
    function click(when) {
      const src = c.createBufferSource(); src.buffer = nb;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600 + Math.random() * 2600;   // 2.6–5.2 kHz dry tick
      bp.Q.value = 1.1;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.055, when + 0.001);  // ~1 ms snap
      g.gain.exponentialRampToValueAtTime(0.0006, when + 0.013); // ~12 ms decay
      src.connect(bp).connect(g).connect(out);
      src.start(when); src.stop(when + 0.025);
    }
    function tick() {
      if (!alive) return;
      const now = c.currentTime;
      const reps = 3 + Math.floor(Math.random() * 6);
      let when = now;
      for (let i = 0; i < reps; i++) { click(when); when += 0.018 + Math.random() * 0.022; }
      timer = setTimeout(tick, 1200 + Math.random() * 2600);
    }
    tick();
    return { stop() { alive = false; if (timer) clearTimeout(timer); } };
  }

  // Movement-synced skitter: a dense click train fired for the duration of one
  // visible dart, positioned where the dart happens. The ambient startSkittering
  // bed stays sparse and atmospheric; THIS is the sound of legs actually moving
  // when the user can see them move — sight and sound agreeing is what sells it.
  function skitterBurst(pos = null, duration = 0.4, intensity = 1.0) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("skitterBurst", pos, { refDistance: 1.0, maxDistance: 20, rolloffFactor: 1.9 });
    const nb = noiseBuffer(1);
    const now = c.currentTime;
    const k = Math.max(0.2, Math.min(1, intensity));
    let when = now;
    while (when < now + duration) {
      const src = c.createBufferSource(); src.buffer = nb;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2600 + Math.random() * 2600;
      bp.Q.value = 1.1;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.04 * k + 0.02, when + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0006, when + 0.012);
      src.connect(bp).connect(g).connect(out);
      src.start(when); src.stop(when + 0.02);
      when += 0.014 + Math.random() * 0.016;   // ~30–60 Hz leg rate — frantic
    }
  }

  // ---- Spider foley (all new, additive; the near-silent spider's movement IS
  // the fear channel). Everything routes through spatial(...,{air,reverb}) so
  // far skitters read duller + wetter automatically. ----
  // Dense 8-leg claw-tick train that accelerates as the dart commits — the
  // audible approach. Richer sibling of skitterBurst (kept separate).
  function skitterTicks(pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const duration = opts.duration || 0.35, legRate = opts.legRate || 42;
    const k = Math.max(0.2, Math.min(1, opts.intensity == null ? 1 : opts.intensity));
    const out = sfxOut("skitterTicks", pos, { refDistance: 1.0, maxDistance: 22, rolloffFactor: 1.9, creature: true, air: true, reverb: 0.14 });
    const nb = noiseBuffer(1);
    const now = c.currentTime;
    let when = now, tick = 0;
    while (when < now + duration) {
      const src = c.createBufferSource(); src.buffer = nb;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 3000 + Math.random() * 3400; bp.Q.value = 1.4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(0.028 * k + 0.014, when + 0.0008);
      g.gain.exponentialRampToValueAtTime(0.0006, when + 0.010);
      src.connect(bp).connect(g).connect(out);
      src.start(when); src.stop(when + 0.05);
      // Every 4th click: a faint low body-drag layer (reads as 8 legs, a body).
      if (tick % 4 === 0) {
        const ds = c.createBufferSource(); ds.buffer = nb;
        const dl = c.createBiquadFilter(); dl.type = "lowpass"; dl.frequency.value = 260; dl.Q.value = 1;
        const dgn = c.createGain();
        dgn.gain.setValueAtTime(0.0001, when);
        dgn.gain.exponentialRampToValueAtTime(0.012 * k, when + 0.002);
        dgn.gain.exponentialRampToValueAtTime(0.0006, when + 0.018);
        ds.connect(dl).connect(dgn).connect(out);
        ds.start(when); ds.stop(when + 0.05);
      }
      // Accelerate: inter-click gap shrinks from 1/legRate to 0.62/legRate.
      const frac = (when - now) / duration;
      const gap = (1 / legRate) * (1 - 0.38 * frac) * (0.75 + Math.random() * 0.5);
      when += Math.max(0.006, gap);
      tick++;
    }
  }
  // Dry leaf/bristle friction fired once at the start of a dart.
  function bristleRustle(pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const intensity = opts.intensity == null ? 0.6 : opts.intensity;
    const out = sfxOut("bristleRustle", pos, { refDistance: 1.2, maxDistance: 18, creature: true, air: true, reverb: 0.12 });
    const now = c.currentTime, dur = 0.12 + Math.random() * 0.06;
    const nb = noiseBuffer(dur + 0.05);
    const src = c.createBufferSource(); src.buffer = nb;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.8;
    bp.frequency.setValueAtTime(5200, now); bp.frequency.exponentialRampToValueAtTime(2600, now + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.05 * intensity, now + 0.02); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    // Ratchety dry-friction gate (tremolo on the gain).
    const trem = c.createOscillator(); trem.type = "square"; trem.frequency.value = 60 + Math.random() * 30;
    const tg = c.createGain(); tg.gain.value = 0.4 * 0.05 * intensity;
    trem.connect(tg).connect(g.gain); trem.start(now); trem.stop(now + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + dur + 0.02);
  }
  // Sharp single "tik" at the pounce apex (reserved for the real lunge).
  function chitinTik(pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const intensity = opts.intensity == null ? 1 : opts.intensity;
    const out = sfxOut("chitinTik", pos, { refDistance: 0.8, maxDistance: 20, rolloffFactor: 2.0, creature: true, reverb: 0.18 });
    const now = c.currentTime;
    const nb = noiseBuffer(0.05);
    const src = c.createBufferSource(); src.buffer = nb;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 4200; bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.11 * intensity, now + 0.0006); g.gain.exponentialRampToValueAtTime(0.0008, now + 0.020);
    src.connect(bp).connect(g).connect(out); src.start(now); src.stop(now + 0.05);
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(520, now); o.frequency.exponentialRampToValueAtTime(300, now + 0.04);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, now); og.gain.exponentialRampToValueAtTime(0.06 * intensity, now + 0.003); og.gain.exponentialRampToValueAtTime(0.0008, now + 0.04);
    o.connect(og).connect(out); o.start(now); o.stop(now + 0.06);
  }
  // Faint plucked web-strand (coil telegraph / wall framing).
  function webPluck(pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const intensity = opts.intensity == null ? 0.5 : opts.intensity;
    const out = sfxOut("webPluck", pos, { refDistance: 1.5, maxDistance: 16, creature: true, reverb: 0.22, air: true });
    const now = c.currentTime, f = 180 + Math.random() * 90;
    const o = c.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.86, now + 0.4);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = f * 3; bp.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.045 * intensity, now + 0.004); g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    o.connect(bp).connect(g).connect(out); o.start(now); o.stop(now + 0.52);
  }
  // Looped cellar bed: low hum + periodic pitch-dropping drips. Returns {stop}.
  function startCellarAmbient(opts = {}) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const intensity = opts.intensity == null ? 0.4 : opts.intensity;
    const hum = startLoop({ baseFreq: 70 + intensity * 30, q: 1.3, gain: 0.131 + intensity * 0.146, lfoRate: 0.08, lfoDepth: 24, pink: true });
    let alive = true, timer = null;
    const drip = () => {
      if (!alive) return;
      const now = c.currentTime;
      const out = spatial({ x: (Math.random() - 0.5) * 3, y: 1.6, z: -1 - Math.random() * 3 }, { refDistance: 1, maxDistance: 14, reverb: 0.3, air: true });
      const o = c.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(900, now); o.frequency.exponentialRampToValueAtTime(260, now + 0.09);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.05, now + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, now + 0.12);
      o.connect(g).connect(out); o.start(now); o.stop(now + 0.14);
      timer = setTimeout(drip, 3500 + Math.random() * 7000);
    };
    timer = setTimeout(drip, 1500 + Math.random() * 4000);
    return { stop() { alive = false; if (timer) clearTimeout(timer); try { hum && hum.stop && hum.stop(); } catch {} } };
  }

  function startMRI() {
    const c = ensureCtx(); if (!c) return { stop() {} };
    let alive = true, timer = null;
    const nb = noiseBuffer(1);
    function clank() {
      if (!alive) return;
      const now = c.currentTime;
      const reps = 10 + Math.floor(Math.random() * 14);
      const period = 0.07 + Math.random() * 0.05;
      const baseFreq = 70 + Math.random() * 90;
      for (let i = 0; i < reps; i++) {
        const t = now + i * period;
        // Low body — a gated square "knock" with a quick attack (was a click).
        const osc = c.createOscillator();
        osc.type = "square";
        osc.frequency.value = baseFreq + (i % 2 === 0 ? 0 : 30);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.20, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        osc.connect(g).connect(master);
        osc.start(t); osc.stop(t + 0.06);
        // Metallic buzz layer — bandpass-noise burst = the gradient-coil "brrr"
        // that makes a real scanner sound mechanical rather than a pure tone.
        const ns = c.createBufferSource(); ns.buffer = nb;
        const bp = c.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 500 + (i % 2) * 760; bp.Q.value = 4;
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.0001, t);
        ng.gain.exponentialRampToValueAtTime(0.10, t + 0.003);
        ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        ns.connect(bp).connect(ng).connect(master);
        ns.start(t); ns.stop(t + 0.06);
      }
      timer = setTimeout(clank, 2000 + Math.random() * 3500);
    }
    timer = setTimeout(clank, 1500);
    return { stop() { alive = false; if (timer) clearTimeout(timer); } };
  }

  // One MRI imaging sequence: `secs` of rhythmic gradient-coil knocking, then
  // quiet. Fired by the scene so the "loud knocking" prompt lands on it.
  // Returns { stop } — asking to come out cuts the scan off, as it would.
  function mriSequence(secs = 6) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const nb = noiseBuffer(1);
    const bus = c.createGain(); bus.gain.value = 1; bus.connect(master);
    const now = c.currentTime;
    const period = 0.07 + Math.random() * 0.05;
    const baseFreq = 70 + Math.random() * 90;
    const reps = Math.floor(secs / period);
    for (let i = 0; i < reps; i++) {
      const t = now + i * period;
      const osc = c.createOscillator(); osc.type = "square";
      osc.frequency.value = baseFreq + (i % 2 === 0 ? 0 : 30);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      osc.connect(g).connect(bus); osc.start(t); osc.stop(t + 0.06);
      if (i % 2 === 0) {
        const ns = c.createBufferSource(); ns.buffer = nb;
        const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 500 + (i % 4) * 380; bp.Q.value = 4;
        const ng = c.createGain();
        ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.08, t + 0.003); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
        ns.connect(bp).connect(ng).connect(bus); ns.start(t); ns.stop(t + 0.06);
      }
    }
    return { stop() { try { bus.gain.setTargetAtTime(0, c.currentTime, 0.03); setTimeout(() => { try { bus.disconnect(); } catch {} }, 400); } catch {} } };
  }
  // A machine hum that swells and fades: a lift motor, a ventilation fan.
  function machineHum(secs = 5, freq = 60, level = 0.08, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = pos ? sfxOut("doorCreak", pos, { refDistance: 1.5, maxDistance: 12 }) : master;
    const now = c.currentTime;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 380;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(level, now + 0.8);
    g.gain.setValueAtTime(level, now + secs - 0.8); g.gain.exponentialRampToValueAtTime(0.0001, now + secs);
    for (const [f, a] of [[freq, 1], [freq * 2, 0.5], [freq * 3.02, 0.2]]) {
      const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = a * 0.4;
      o.connect(og).connect(lp); o.start(now); o.stop(now + secs + 0.1);
    }
    lp.connect(g).connect(out);
  }
  // Soft two-tone lift chime.
  function liftChime() {
    const c = ensureCtx(); if (!c) return;
    const now = c.currentTime;
    for (const [f, t0] of [[880, 0], [698, 0.32]]) {
      const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, now + t0); g.gain.exponentialRampToValueAtTime(0.07, now + t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + t0 + 0.9);
      o.connect(g).connect(master); o.start(now + t0); o.stop(now + t0 + 1);
    }
  }

  function startBreathing(rate = 0.22) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    let alive = true;
    // Swell in over the first two breath cycles — this loop starts the moment
    // fear crosses a threshold, and a full-volume breath appearing from
    // nowhere startled instead of calming.
    let cycles = 0;
    function breath(inhale = true) {
      if (!alive) return;
      const dur = 1.4;
      const buf = noiseBuffer(dur);
      const src = c.createBufferSource(); src.buffer = buf;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = inhale ? 700 : 380;
      const g = c.createGain();
      const now = c.currentTime;
      const swell = Math.min(1, (cycles + 1) / 4);   // 0.25, 0.5, 0.75, 1…
      cycles++;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(0.13 * swell, now + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(lp).connect(g).connect(master);
      src.start(now); src.stop(now + dur);
      setTimeout(() => breath(!inhale), (1 / rate) * 1000);
    }
    breath(true);
    return { stop() { alive = false; } };
  }

  // One sharp involuntary inhale — the breath you take when something makes
  // you jump. Fired with the whole-body startle so the flinch is heard from
  // INSIDE the player's own body (un-panned, like the heartbeat). A quick
  // noise sweep up through the throat band, cut short: caught, not released.
  function breathCatch(intensity = 0.6) {
    const c = ensureCtx(); if (!c) return;
    const k = Math.max(0, Math.min(1, intensity));
    const now = c.currentTime;
    const dur = 0.16 + 0.06 * k;
    const buf = noiseBuffer(dur + 0.05);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(420, now);
    bp.frequency.exponentialRampToValueAtTime(1350, now + dur * 0.85);
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.10 + 0.10 * k, now + 0.03);
    g.gain.setValueAtTime(0.10 + 0.10 * k, now + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, now + dur);   // the catch: cut, not faded
    src.connect(bp).connect(g).connect(master);
    src.start(now); src.stop(now + dur + 0.05);
  }

  function startHeartbeat(bpm = 72) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    let alive = true;
    function pump() {
      if (!alive) return;
      const now = c.currentTime;
      const beat = (t, freq, peak, dur) => {
        const osc = c.createOscillator();
        osc.type = "sine"; osc.frequency.value = freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g).connect(master);
        osc.start(t); osc.stop(t + dur + 0.05);
      };
      beat(now, 60, 0.34, 0.16);
      beat(now + 0.18, 50, 0.22, 0.12);
      setTimeout(pump, 60000 / bpm);
    }
    pump();
    return { stop() { alive = false; }, setBpm(b) { bpm = b; } };
  }

  function startCityHum() {
    return startLoop({ baseFreq: 130, q: 1.0, gain: 0.186, lfoRate: 0.05, lfoDepth: 20, pink: true });
  }

  // Calm ambient pad — 3 sine voices, low-pass + slow LFO. Used as a background
  // music bed on home/ladder pages. Off by default; toggleable in settings.
  function startAmbientPad() {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const freqs = [110, 164.81, 220]; // A2, E3, A3 — a quiet open fifth + octave
    const oscs = freqs.map(f => {
      const o = c.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      // Slight detune + per-voice tremolo for movement
      const det = c.createOscillator();
      det.frequency.value = 0.07 + Math.random() * 0.05;
      const detGain = c.createGain();
      detGain.gain.value = 1.5;
      det.connect(detGain).connect(o.frequency);
      det.start();
      return { osc: o, det };
    });
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    lp.Q.value = 0.7;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.045, c.currentTime + 4); // very gentle
    // Slow filter LFO
    const lfo = c.createOscillator();
    const lfoGain = c.createGain();
    lfo.frequency.value = 0.04;
    lfoGain.gain.value = 200;
    lfo.connect(lfoGain).connect(lp.frequency);
    oscs.forEach(p => p.osc.connect(lp));
    lp.connect(gain).connect(master);
    oscs.forEach(p => p.osc.start());
    lfo.start();
    return {
      stop() {
        gain.gain.cancelScheduledValues(c.currentTime);
        gain.gain.setTargetAtTime(0, c.currentTime, 1.2);
        setTimeout(() => {
          try {
            oscs.forEach(p => { p.osc.stop(); p.det.stop(); });
            lfo.stop();
          } catch {}
        }, 4500);
      },
      setGain(target) {
        try {
          const v = Math.max(0, Math.min(0.2, Number(target) || 0));
          gain.gain.cancelScheduledValues(c.currentTime);
          gain.gain.setTargetAtTime(v, c.currentTime, 0.8);
        } catch {}
      },
    };
  }

  // Engine drone for the airplane scene — layered sub + body + harmonic
  function startEngineDrone(intensity = 0.5, pos = null) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    // Engine pods sit far enough from the cabin that the listener still
    // catches a strong drone, but distance attenuation works.
    const out = spatial(pos, { refDistance: 4, maxDistance: 60, rolloffFactor: 0.6 });
    const buf = noiseBuffer(3);
    const src = c.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 320; lp.Q.value = 0.9;
    const hp = c.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 60;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.linearRampToValueAtTime(0.18 + intensity * 0.18, c.currentTime + 1.5);
    src.connect(hp).connect(lp).connect(gain).connect(out);
    src.start();
    // Two slightly-detuned saw subs through a warmth lowpass — they beat against
    // each other for a slow turbine throb rather than a static buzz.
    const osc = c.createOscillator();  osc.type = "sawtooth";  osc.frequency.value = 75;
    const osc2 = c.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = 76.6;
    const subLp = c.createBiquadFilter(); subLp.type = "lowpass"; subLp.frequency.value = 220;
    const oscGain = c.createGain();
    oscGain.gain.value = 0;
    oscGain.gain.linearRampToValueAtTime(0.05 + intensity * 0.04, c.currentTime + 1.5);
    osc.connect(subLp); osc2.connect(subLp); subLp.connect(oscGain).connect(out);
    osc.start(); osc2.start();
    // Faint high turbine whine with a slow shimmer LFO — sells "jet".
    const whine = c.createOscillator(); whine.type = "triangle"; whine.frequency.value = 230;
    const whineLfo = c.createOscillator(); const whineLfoG = c.createGain();
    whineLfo.frequency.value = 0.3; whineLfoG.gain.value = 12;
    whineLfo.connect(whineLfoG).connect(whine.frequency);
    const whineGain = c.createGain(); whineGain.gain.value = 0;
    whineGain.gain.linearRampToValueAtTime(0.012 + intensity * 0.02, c.currentTime + 2.0);
    whine.connect(whineGain).connect(out);
    whine.start(); whineLfo.start();
    return {
      stop() {
        gain.gain.setTargetAtTime(0, c.currentTime, 0.5);
        oscGain.gain.setTargetAtTime(0, c.currentTime, 0.5);
        whineGain.gain.setTargetAtTime(0, c.currentTime, 0.5);
        setTimeout(() => { try { src.stop(); osc.stop(); osc2.stop(); whine.stop(); whineLfo.stop(); } catch {} }, 1500);
      },
    };
  }

  // Single splash — used when user paddles the water
  function splash(intensity = 1.0, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("splash", pos, { refDistance: 1, maxDistance: 30, rolloffFactor: 1.2 });
    const now = c.currentTime;
    // Main wash — bandpass noise, quick attack ramp (was an instant click).
    const src = c.createBufferSource(); src.buffer = noiseBuffer(0.5);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1400; bp.Q.value = 0.9;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.34 * intensity, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + 0.45);
    // Bright "plip" droplet at the very start.
    const drop = c.createBufferSource(); drop.buffer = noiseBuffer(0.12);
    const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 4500;
    const dg = c.createGain();
    dg.gain.setValueAtTime(0.0001, now);
    dg.gain.exponentialRampToValueAtTime(0.16 * intensity, now + 0.003);
    dg.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    drop.connect(hp).connect(dg).connect(out);
    drop.start(now); drop.stop(now + 0.12);
    // Low "gloop" body/tail — gives the splash weight.
    const glp = c.createOscillator(); glp.type = "sine";
    glp.frequency.setValueAtTime(320, now);
    glp.frequency.exponentialRampToValueAtTime(140, now + 0.25);
    const glpF = c.createBiquadFilter(); glpF.type = "lowpass"; glpF.frequency.value = 400;
    const gg = c.createGain();
    gg.gain.setValueAtTime(0.0001, now + 0.008);
    gg.gain.exponentialRampToValueAtTime(0.12 * intensity, now + 0.03);
    gg.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    glp.connect(glpF).connect(gg).connect(out);
    glp.start(now); glp.stop(now + 0.32);
  }

  // Hiss — for the snake scene
  function startHiss(rate = 0.4, pos = null) {
    // Snake hiss: a breathy band of noise (~3–5 kHz) with a slow wobble so it
    // "breathes", not a thin high "tsss". Bandpass (not highpass) + an LFO on
    // the band centre gives a living sibilance.
    const c = ensureCtx(); if (!c) return { stop() {} };
    let alive = true, timer = null;
    const out = spatial(pos);
    function puff() {
      if (!alive) return;
      const now = c.currentTime;
      const dur = 0.7 + Math.random() * 0.5;
      const buf = noiseBuffer(dur);
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 3800; bp.Q.value = 1.4;
      const lfo = c.createOscillator(); const lg = c.createGain();
      lfo.frequency.value = 5 + Math.random() * 4; lg.gain.value = 700;
      lfo.connect(lg).connect(bp.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.07 + Math.random() * 0.04, now + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
      src.connect(bp).connect(g).connect(out);
      src.start(now); src.stop(now + dur);
      lfo.start(now); lfo.stop(now + dur);
      timer = setTimeout(puff, (1 / rate) * 1000 + Math.random() * 1500);
    }
    timer = setTimeout(puff, 1200);
    return { stop() { alive = false; if (timer) clearTimeout(timer); } };
  }

  // One-shot defensive hiss — immediate (no scheduling delay), spatial, with a
  // sharper attack than the ambient startHiss puffs. Fired when the snake
  // throws a warning display at a player who rushed in.
  function hissOnce(pos = null, intensity = 1.0) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("hissOnce", pos, { refDistance: 1.0, maxDistance: 30 });
    const now = c.currentTime;
    const dur = 0.9 + Math.random() * 0.4;
    const buf = noiseBuffer(dur);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 4200; bp.Q.value = 1.2;
    const lfo = c.createOscillator(); const lg = c.createGain();
    lfo.frequency.value = 7; lg.gain.value = 900;
    lfo.connect(lg).connect(bp.frequency);
    const g = c.createGain();
    const peak = 0.16 * Math.max(0.2, Math.min(1, intensity));
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0008, now + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + dur);
    lfo.start(now); lfo.stop(now + dur);
  }

  // Continuous grass-rustle loop for a moving creature (the snake's slither).
  // Unlike spatial() one-shots, the returned handle lets the scene move the
  // sound source and scale its loudness every frame, so the rustle genuinely
  // travels with the body and falls silent when the snake stops.
  function startSlither() {
    const c = ensureCtx(); if (!c) return { set() {}, stop() {} };
    const panner = c.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1.2;
    panner.maxDistance = 24;
    panner.rolloffFactor = 1.8;
    const g = c.createGain(); g.gain.value = 0.0;
    // Dry grass shear: noise through a mid bandpass, not a wind-like lowpass.
    const src = c.createBufferSource(); src.buffer = noiseBuffer(2.0); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    bp.frequency.value = 1400; bp.Q.value = 0.9;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200;
    src.connect(bp).connect(lp).connect(g).connect(panner).connect(master);
    src.start();
    let alive = true;
    return {
      set(pos, intensity) {
        if (!alive) return;
        try {
          if (panner.positionX) {
            panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z;
          } else if (panner.setPosition) panner.setPosition(pos.x, pos.y, pos.z);
          g.gain.setTargetAtTime(0.11 * Math.max(0, Math.min(1, intensity)), c.currentTime, 0.12);
        } catch {}
      },
      stop() {
        alive = false;
        try {
          g.gain.setTargetAtTime(0, c.currentTime, 0.2);
          setTimeout(() => { try { src.stop(); } catch {} }, 600);
        } catch {}
      },
    };
  }

  // ---- Snake foley (all new, additive; the existing hissOnce/startSlither are
  // left untouched). Outdoors → no reverb, air lowpass for distance. ----
  // Breathy sibilant hiss with a warn/strike intensity contour.
  function snakeHiss(pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const intensity = Math.max(0.2, Math.min(1, opts.intensity == null ? 0.6 : opts.intensity));
    const dur = (opts.dur != null ? opts.dur : 0.85 + Math.random() * 0.35) * (0.7 + 0.3 * intensity);
    const out = sfxOut("snakeHiss", pos, { refDistance: 1.0, maxDistance: 26, rolloffFactor: 1.7, creature: true, air: true });
    const now = c.currentTime;
    const nb = noiseBuffer(dur + 0.1);
    const src = c.createBufferSource(); src.buffer = nb;
    const bp = c.createBiquadFilter(); bp.type = "bandpass";
    const fCore = 4600 + intensity * 1800; bp.Q.value = 0.9 + (1 - intensity) * 0.8;
    bp.frequency.setValueAtTime(fCore * 0.86, now);
    bp.frequency.exponentialRampToValueAtTime(fCore, now + dur * 0.28);
    bp.frequency.exponentialRampToValueAtTime(fCore * 0.80, now + dur);
    const lfo = c.createOscillator(); const lg = c.createGain();
    lfo.frequency.value = 6 + intensity * 4; lg.gain.value = 500 + intensity * 700;
    lfo.connect(lg).connect(bp.frequency);
    const src2 = c.createBufferSource(); src2.buffer = nb;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 560 + intensity * 260; lp.Q.value = 0.6;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, now);
    g2.gain.exponentialRampToValueAtTime(0.035 * intensity, now + 0.06);
    g2.gain.exponentialRampToValueAtTime(0.0006, now + dur);
    src2.connect(lp).connect(g2).connect(out);
    const g = c.createGain();
    const peak = 0.10 + 0.08 * intensity;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + (intensity > 0.8 ? 0.02 : 0.06));
    g.gain.setValueAtTime(peak, now + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0007, now + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + dur); src2.start(now); src2.stop(now + dur);
    lfo.start(now); lfo.stop(now + dur);
  }
  // Grass-rustle slither, keyed to ground speed with a low body-drag layer.
  function startSnakeSlither() {
    const c = ensureCtx(); if (!c) return { set() {}, stop() {} };
    const panner = c.createPanner();
    panner.panningModel = "HRTF"; panner.distanceModel = "inverse";
    panner.refDistance = 1.2; panner.maxDistance = 24; panner.rolloffFactor = 1.8;
    panner.connect(creatureBus);
    const shear = c.createBufferSource(); shear.buffer = noiseBuffer(2.2); shear.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 1500; bp.Q.value = 0.8;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5400;
    const gShear = c.createGain(); gShear.gain.value = 0;
    shear.connect(bp).connect(lp).connect(gShear).connect(panner);
    const drag = c.createBufferSource(); drag.buffer = noiseBuffer(2.2); drag.loop = true;
    const dlp = c.createBiquadFilter(); dlp.type = "lowpass"; dlp.frequency.value = 340; dlp.Q.value = 0.7;
    const gDrag = c.createGain(); gDrag.gain.value = 0;
    drag.connect(dlp).connect(gDrag).connect(panner);
    shear.start(); drag.start();
    let alive = true;
    return {
      set(pos, intensity) {
        if (!alive) return;
        try {
          const k = Math.max(0, Math.min(1, intensity));
          if (panner.positionX) { panner.positionX.value = pos.x; panner.positionY.value = pos.y; panner.positionZ.value = pos.z; }
          else if (panner.setPosition) panner.setPosition(pos.x, pos.y, pos.z);
          gShear.gain.setTargetAtTime(0.10 * k, c.currentTime, 0.12);
          gDrag.gain.setTargetAtTime(0.05 * Math.max(0, (k - 0.35)) / 0.65, c.currentTime, 0.15);
          bp.frequency.setTargetAtTime(1300 + k * 900, c.currentTime, 0.15);
        } catch {}
      },
      stop() { alive = false; try { gShear.gain.setTargetAtTime(0, c.currentTime, 0.2); gDrag.gain.setTargetAtTime(0, c.currentTime, 0.2); setTimeout(() => { try { shear.stop(); drag.stop(); } catch {} }, 700); } catch {} },
    };
  }
  // Very short faint dry tongue tick (fires in pairs from the flick).
  function tongueFlick(pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const k = Math.max(0.2, Math.min(1, opts.intensity == null ? 0.5 : opts.intensity));
    const out = sfxOut("tongueFlick", pos, { refDistance: 0.8, maxDistance: 12, rolloffFactor: 2.2, creature: true, air: true });
    const now = c.currentTime;
    const nb = noiseBuffer(0.03);
    const src = c.createBufferSource(); src.buffer = nb;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 6800 + Math.random() * 1200; bp.Q.value = 2.2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.022 * k, now + 0.0006);
    g.gain.exponentialRampToValueAtTime(0.0005, now + 0.012);
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + 0.03);
  }
  // The strike apex: a downward air-cut whoosh + a low body thud, then a hiss peak.
  function snakeStrike(pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const k = Math.max(0.4, Math.min(1, opts.intensity == null ? 1 : opts.intensity));
    const out = sfxOut("snakeStrike", pos, { refDistance: 0.7, maxDistance: 22, rolloffFactor: 2.0, creature: true, air: true });
    const now = c.currentTime;
    const nb = noiseBuffer(0.18);
    const w = c.createBufferSource(); w.buffer = nb;
    const wbp = c.createBiquadFilter(); wbp.type = "bandpass"; wbp.Q.value = 0.7;
    wbp.frequency.setValueAtTime(3200, now); wbp.frequency.exponentialRampToValueAtTime(700, now + 0.12);
    const wg = c.createGain();
    wg.gain.setValueAtTime(0.0001, now);
    wg.gain.exponentialRampToValueAtTime(0.14 * k, now + 0.012);
    wg.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    w.connect(wbp).connect(wg).connect(out); w.start(now); w.stop(now + 0.18);
    const o = c.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(180, now); o.frequency.exponentialRampToValueAtTime(110, now + 0.09);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, now); og.gain.exponentialRampToValueAtTime(0.05 * k, now + 0.006); og.gain.exponentialRampToValueAtTime(0.0007, now + 0.10);
    o.connect(og).connect(out); o.start(now); o.stop(now + 0.12);
    setTimeout(() => { try { snakeHiss(pos, { intensity: Math.min(1, 0.85 * k + 0.15), dur: 0.5 }); } catch {} }, 40);
  }
  // Warm outdoor bed: gentle breeze + intermittent distant birds + cicada shimmer.
  function startClearingAmbient(opts = {}) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const intensity = opts.intensity == null ? 0.4 : opts.intensity;
    const breeze = startLoop({ baseFreq: 380 + intensity * 260, q: 0.7, gain: 0.119 + intensity * 0.119, lfoRate: 0.16, lfoDepth: 180 * intensity, pink: true });
    let alive = true, birdTimer = null, cicTimer = null;
    const bird = () => {
      if (!alive) return; const now = c.currentTime;
      const out = spatial({ x: (Math.random() - 0.5) * 10, y: 2.5 + Math.random() * 2, z: -4 - Math.random() * 8 }, { refDistance: 2, maxDistance: 30, air: true });
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) {
        const t0 = now + i * (0.10 + Math.random() * 0.06); const f = 2200 + Math.random() * 1200;
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * (0.9 + Math.random() * 0.3), t0 + 0.07);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.018, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0006, t0 + 0.09);
        o.connect(g).connect(out); o.start(t0); o.stop(t0 + 0.12);
      }
      birdTimer = setTimeout(bird, 6000 + Math.random() * 11000);
    };
    const cicada = () => {
      if (!alive) return; const now = c.currentTime; const dur = 0.8 + Math.random() * 1.2;
      const out = spatial({ x: (Math.random() - 0.5) * 8, y: 0.2, z: -3 - Math.random() * 7 }, { refDistance: 2, maxDistance: 24, air: true });
      const src = c.createBufferSource(); src.buffer = noiseBuffer(dur + 0.1);
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 4200 + Math.random() * 900; bp.Q.value = 6;
      const g = c.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.012, now + 0.3); g.gain.setValueAtTime(0.012, now + dur - 0.3); g.gain.exponentialRampToValueAtTime(0.0006, now + dur);
      const trem = c.createOscillator(); trem.type = "sine"; trem.frequency.value = 42 + Math.random() * 10; const tg = c.createGain(); tg.gain.value = 0.006; trem.connect(tg).connect(g.gain);
      src.connect(bp).connect(g).connect(out); src.start(now); src.stop(now + dur); trem.start(now); trem.stop(now + dur);
      cicTimer = setTimeout(cicada, 9000 + Math.random() * 14000);
    };
    birdTimer = setTimeout(bird, 2500 + Math.random() * 4000);
    cicTimer = setTimeout(cicada, 5000 + Math.random() * 6000);
    return { stop() { alive = false; if (birdTimer) clearTimeout(birdTimer); if (cicTimer) clearTimeout(cicTimer); try { breeze && breeze.stop && breeze.stop(); } catch {} } };
  }

  // Audience murmur — sustained crowd-mumble bed. Pink noise through a bandpass
  // that SLOWLY sweeps (a formant wobble) reads as vowel-like babble rather than
  // a steady vent hiss.
  function startAudienceMurmur(crowd = 0.5) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const buf = pinkNoiseBuffer(4);
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = "bandpass"; lp.frequency.value = 550; lp.Q.value = 1.6;
    const lfo = c.createOscillator(); const lfoG = c.createGain();
    lfo.frequency.value = 0.7; lfoG.gain.value = 320;       // formant sweep ≈ 230–870 Hz
    lfo.connect(lfoG).connect(lp.frequency);
    const g = c.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.18 + crowd * 0.30, c.currentTime + 1.5);
    src.connect(lp).connect(g).connect(master);
    src.start(); lfo.start();
    // Periodic cough / throat-clear — breathy filtered NOISE, not a sawtooth buzz.
    let alive = true, timer = null;
    function cough() {
      if (!alive || crowd < 0.2) return;
      const now = c.currentTime;
      const ns = c.createBufferSource(); ns.buffer = noiseBuffer(0.25);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 400 + Math.random() * 300; bp.Q.value = 2;
      const cg = c.createGain();
      cg.gain.setValueAtTime(0.0001, now);
      cg.gain.exponentialRampToValueAtTime(0.07, now + 0.02);
      cg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      ns.connect(bp).connect(cg).connect(master);
      ns.start(now); ns.stop(now + 0.25);
      timer = setTimeout(cough, 9000 + Math.random() * 18000);
    }
    timer = setTimeout(cough, 6000 + Math.random() * 8000);
    return {
      stop() {
        alive = false; if (timer) clearTimeout(timer);
        g.gain.setTargetAtTime(0, c.currentTime, 0.5);
        setTimeout(() => { try { src.stop(); lfo.stop(); } catch {} }, 1500);
      },
    };
  }

  // Applause — a procedural burst of many hand-claps: individual 10–30 ms
  // noise ticks scattered front-loaded through one buffer, band-passed to the
  // palm-smack register, swelling fast and thinning out over the tail.
  function applause(intensity = 0.7) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("applause", null);
    const dur = 2.8 + intensity * 2.2;
    const sr = c.sampleRate;
    const n = Math.floor(dur * sr);
    const buf = c.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    const claps = Math.floor(160 + intensity * 260);
    for (let i = 0; i < claps; i++) {
      const at = Math.pow(Math.random(), 0.62) * dur;      // dense start, thinning tail
      const start = Math.floor(at * sr);
      const decay = (0.010 + Math.random() * 0.020) * sr;  // 10–30 ms smack
      const len = Math.floor(decay * 3);
      const amp = 0.10 + Math.random() * 0.14;
      for (let s = 0; s < len && start + s < n; s++) {
        data[start + s] += (Math.random() * 2 - 1) * amp * Math.exp(-s / decay);
      }
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 1900; bp.Q.value = 0.45;
    const g = c.createGain();
    const now = c.currentTime;
    const peak = 0.28 + intensity * 0.28;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.3);
    g.gain.setValueAtTime(peak, now + dur * 0.5);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + dur + 0.1);
  }

  // Single crowd one-shot from a REAL seat position — a cough or a clothes/
  // chair shuffle, HRTF-panned so the hall is audibly occupied around you.
  function crowdOneShot(pos, kind = "cough", vol = 0.6) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("crowdOneShot", pos, { refDistance: 3, maxDistance: 60, rolloffFactor: 1.0 });
    const now = c.currentTime;
    const isCough = kind === "cough";
    const src = c.createBufferSource();
    src.buffer = noiseBuffer(isCough ? 0.3 : 0.55);
    const bp = c.createBiquadFilter();
    if (isCough) { bp.type = "bandpass"; bp.frequency.value = 380 + Math.random() * 320; bp.Q.value = 2; }
    else { bp.type = "lowpass"; bp.frequency.value = 900 + Math.random() * 600; bp.Q.value = 0.6; }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime((isCough ? 0.16 : 0.10) * vol, now + (isCough ? 0.02 : 0.10));
    g.gain.exponentialRampToValueAtTime(0.001, now + (isCough ? 0.22 : 0.5));
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + 0.6);
  }

  // The user's OWN voice while the speak button is held — never words, just
  // the muffled through-the-skull cadence of speech: band-passed pink noise
  // with two detuned syllable LFOs beating so the phrasing wanders instead of
  // ticking like a metronome tremolo.
  function startSpeechMurmur() {
    const c = ensureCtx(); if (!c) return { set() {}, stop() {} };
    const src = c.createBufferSource(); src.buffer = pinkNoiseBuffer(4); src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 230; bp.Q.value = 1.1;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 950;
    const am = c.createGain(); am.gain.value = 0.55;
    const l1 = c.createOscillator(); l1.frequency.value = 3.2;
    const l2 = c.createOscillator(); l2.frequency.value = 4.6;
    const l1g = c.createGain(); l1g.gain.value = 0.28;
    const l2g = c.createGain(); l2g.gain.value = 0.17;
    l1.connect(l1g).connect(am.gain); l2.connect(l2g).connect(am.gain);
    const g = c.createGain(); g.gain.value = 0;
    src.connect(bp).connect(lp).connect(am).connect(g).connect(master);
    src.start(); l1.start(); l2.start();
    let level = -1;
    return {
      set(v) {
        if (v === level) return;
        level = v;
        g.gain.setTargetAtTime(v * 0.05, c.currentTime, 0.12);
      },
      stop() {
        try { g.gain.setTargetAtTime(0, c.currentTime, 0.15); } catch {}
        setTimeout(() => { try { src.stop(); l1.stop(); l2.stop(); } catch {} }, 800);
      },
    };
  }

  // Thunder — single low rolling rumble, optionally with a sharp crack at the
  // front. When `pos` is provided, the sound is HRTF-panned from that world
  // location (so a bolt off to the left actually rumbles from your left).
  function thunder(intensity = 0.6, withCrack = true, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("thunder", pos, { refDistance: 8, maxDistance: 200, rolloffFactor: 0.6 });
    const now = c.currentTime;
    // The crack keeps almost all of white noise's energy (it is only
    // highpassed), while the rumble throws ~99% of it away in a 200 Hz
    // lowpass. Written with comparable gain constants the crack buried the
    // rumble completely — measured centroid 1263 Hz, which is a hiss, not
    // thunder. The rumble's gain now compensates for what its filter removes.
    if (withCrack) {
      const crack = noiseBuffer(0.18);
      const src = c.createBufferSource(); src.buffer = crack;
      const hp = c.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 800;
      const g = c.createGain();
      g.gain.setValueAtTime(0.26 * intensity, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      src.connect(hp).connect(g).connect(out);
      src.start(now); src.stop(now + 0.2);
    }
    // Long rumble — low-pass noise that decays over ~3 seconds
    const dur = 2.5 + intensity * 2.5;
    const rumbleBuf = noiseBuffer(dur);
    const rsrc = c.createBufferSource(); rsrc.buffer = rumbleBuf;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 200; lp.Q.value = 0.6;
    const rg = c.createGain();
    rg.gain.setValueAtTime(0, now + 0.05);
    rg.gain.linearRampToValueAtTime(5.2 * intensity, now + 0.25);
    rg.gain.exponentialRampToValueAtTime(0.001, now + dur);
    rsrc.connect(lp).connect(rg).connect(out);
    rsrc.start(now + 0.05); rsrc.stop(now + dur + 0.1);
    // A second, even lower body so the strike has weight under the rumble —
    // real thunder has most of its energy below 100 Hz.
    const sub = c.createBufferSource(); sub.buffer = rumbleBuf;
    const slp = c.createBiquadFilter(); slp.type = "lowpass"; slp.frequency.value = 80; slp.Q.value = 0.7;
    const sg = c.createGain();
    sg.gain.setValueAtTime(0, now + 0.04);
    sg.gain.linearRampToValueAtTime(9.0 * intensity, now + 0.35);
    sg.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.9);
    sub.connect(slp).connect(sg).connect(out);
    sub.start(now + 0.04); sub.stop(now + dur + 0.1);
  }

  // Rain — looped white noise with low-pass to feel like real rain
  function startRain(intensity = 0.6) {
    return startLoop({
      baseFreq: 4000 - intensity * 1500, q: 0.4,
      gain: 0.080 + intensity * 0.100, lfoRate: 0.12, lfoDepth: 600 * intensity,
      type: "lowpass",
    });
  }

  // Engine + tyre noise (driving)
  function startDrivingDrone(speed = 0.5) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    // Engine subs — two slightly detuned saws through a warmth lowpass, with a
    // slow pitch lope so the engine breathes instead of sitting on a dead tone.
    const f0 = 80 + speed * 60;
    const osc = c.createOscillator();  osc.type = "sawtooth";  osc.frequency.value = f0;
    const osc2 = c.createOscillator(); osc2.type = "sawtooth"; osc2.frequency.value = f0 + 2.5;
    const engLp = c.createBiquadFilter(); engLp.type = "lowpass"; engLp.frequency.value = 280 + speed * 200;
    const oscG = c.createGain(); oscG.gain.value = 0;
    oscG.gain.linearRampToValueAtTime(0.05 + speed * 0.05, c.currentTime + 1);
    const lope = c.createOscillator(); const lopeG = c.createGain();
    lope.frequency.value = 4 + speed * 6; lopeG.gain.value = 2.5;
    lope.connect(lopeG).connect(osc.frequency);
    osc.connect(engLp); osc2.connect(engLp); engLp.connect(oscG).connect(master);
    osc.start(); osc2.start(); lope.start();
    // Tyre noise (lowpass)
    const src = c.createBufferSource(); src.buffer = noiseBuffer(3); src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 600 + speed * 800;
    const tg = c.createGain(); tg.gain.value = 0;
    tg.gain.linearRampToValueAtTime(0.10 + speed * 0.20, c.currentTime + 1);
    src.connect(lp).connect(tg).connect(master);
    src.start();
    // Wind rush — highpass noise that only really comes up at higher speeds.
    const wind = c.createBufferSource(); wind.buffer = noiseBuffer(3); wind.loop = true;
    const whp = c.createBiquadFilter(); whp.type = "highpass"; whp.frequency.value = 1200 + speed * 1600;
    const wg = c.createGain(); wg.gain.value = 0;
    wg.gain.linearRampToValueAtTime(Math.max(0, speed - 0.3) * 0.14, c.currentTime + 1.2);
    wind.connect(whp).connect(wg).connect(master);
    wind.start();
    return {
      stop() {
        oscG.gain.setTargetAtTime(0, c.currentTime, 0.5);
        tg.gain.setTargetAtTime(0, c.currentTime, 0.5);
        wg.gain.setTargetAtTime(0, c.currentTime, 0.5);
        setTimeout(() => { try { osc.stop(); osc2.stop(); lope.stop(); src.stop(); wind.stop(); } catch {} }, 1500);
      },
    };
  }

  // Indicator click (subtle tick)
  function indicatorClick(pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("indicatorClick", pos, { refDistance: 0.5, maxDistance: 6 });
    const now = c.currentTime;
    // Crisp relay "tk": a short bandpass-noise snap + a faint tonal body, with
    // an attack ramp — instead of a pure 1500 Hz square beep.
    const ns = c.createBufferSource(); ns.buffer = noiseBuffer(0.05);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.09, now + 0.001);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    ns.connect(bp).connect(ng).connect(out);
    ns.start(now); ns.stop(now + 0.05);
    const osc = c.createOscillator(); osc.type = "triangle"; osc.frequency.value = 1300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.03, now + 0.001);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    osc.connect(g).connect(out);
    osc.start(now); osc.stop(now + 0.04);
  }

  // Single footstep — layered heel + ball contact that varies by surface.
  // surface: "hard" | "wood" | "soft" | "grass" | "splash" | "glass"
  // opts.side: -1 left / +1 right (pitch + scuff bias)
  // opts.speed: 0..1 walk pace (creep is quieter, darker; stomp is brighter)
  // A real step is weight transfer: heel lands, foot rolls, ball presses,
  // then a faint fabric/sole scuff. One filtered-noise thump is a dropped box.
  const FOOT_SURFACES = {
    hard:   { type: "lowpass",  hz: 480,  hzJit: 120, q: 0.85, dur: 0.12, gain: 0.22,
              click: { hz: 2800, amp: 0.055, dur: 0.016 }, roll: 0.045, rollAmp: 0.48,
              thud: 95, thudAmp: 0.07, scuff: { hz: 2200, amp: 0.028, dur: 0.04 } },
    wood:   { type: "bandpass", hz: 400,  hzJit: 100, q: 1.05, dur: 0.14, gain: 0.26,
              click: { hz: 1700, amp: 0.035, dur: 0.018 }, roll: 0.052, rollAmp: 0.55,
              thud: 88, thudAmp: 0.08, scuff: { hz: 1600, amp: 0.032, dur: 0.045 },
              modes: [[175, 0.034, 0.14], [410, 0.020, 0.11], [820, 0.010, 0.08]] },
    soft:   { type: "lowpass",  hz: 150,  hzJit: 40,  q: 0.55, dur: 0.16, gain: 0.20,
              roll: 0.058, rollAmp: 0.38, thud: 70, thudAmp: 0.055,
              scuff: { hz: 900, amp: 0.022, dur: 0.055 } },
    grass:  { type: "bandpass", hz: 1400, hzJit: 450, q: 0.55, dur: 0.18, gain: 0.15,
              roll: 0.062, rollAmp: 0.65, thud: 80, thudAmp: 0.04,
              scuff: { hz: 2600, amp: 0.040, dur: 0.07 } },
    splash: { type: "bandpass", hz: 1050, hzJit: 650, q: 0.42, dur: 0.22, gain: 0.19,
              roll: 0.055, rollAmp: 0.58, thud: 90, thudAmp: 0.05 },
    glass:  { type: "bandpass", hz: 1750, hzJit: 450, q: 2.1, dur: 0.10, gain: 0.16,
              click: { hz: 4000, amp: 0.055, dur: 0.012 }, roll: 0.040, rollAmp: 0.42,
              thud: 110, thudAmp: 0.045,
              modes: [[1580, 0.014, 0.22], [3000, 0.008, 0.16]] },
  };
  function footstep(softness = 0.35, surface = "hard", opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const now = c.currentTime;
    const S = FOOT_SURFACES[surface] || FOOT_SURFACES.hard;
    const surName = FOOT_SURFACES[surface] ? surface : "hard";
    const out = sfxOut("footstep_" + surName, null, { reverb: surName === "wood" ? 0.12 : 0.06 });
    if (!out) return;
    const speed = opts.speed == null ? 1 : Math.max(0.05, Math.min(1, opts.speed));
    const side = opts.side || 0;                         // -1 L / +1 R
    // Left slightly lower & duller, right a touch brighter — breaks the
    // metronome twin-sample read that makes synth footsteps fake.
    const sidePitch = 1 + side * 0.035;
    const sideAmp = 1 + side * 0.04;
    const k = Math.max(0.05, softness) * (0.55 + 0.45 * Math.pow(speed, 0.85)) * sideAmp;
    const bright = 0.75 + 0.35 * speed;                  // creep = darker

    const contact = (at, amp, isHeel) => {
      const src = c.createBufferSource(); src.buffer = noiseBuffer(S.dur);
      const f = c.createBiquadFilter();
      f.type = S.type;
      f.frequency.value = (S.hz * bright * sidePitch) + (Math.random() - 0.5) * S.hzJit;
      f.Q.value = S.q;
      const g = c.createGain();
      const peak = Math.max(0.0002, S.gain * k * amp * (isHeel ? 1 : 0.92));
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.0025);
      g.gain.exponentialRampToValueAtTime(0.001, at + S.dur);
      src.connect(f).connect(g).connect(out);
      src.start(at); src.stop(at + S.dur + 0.02);
      if (S.click && isHeel) {
        const cs = c.createBufferSource(); cs.buffer = noiseBuffer(S.click.dur);
        const hp = c.createBiquadFilter(); hp.type = "highpass";
        hp.frequency.value = S.click.hz * bright * sidePitch;
        const cg = c.createGain();
        cg.gain.setValueAtTime(Math.max(0.0002, S.click.amp * k * amp * speed), at);
        cg.gain.exponentialRampToValueAtTime(0.0004, at + S.click.dur);
        cs.connect(hp).connect(cg).connect(out);
        cs.start(at); cs.stop(at + S.click.dur + 0.01);
      }
    };
    // Heel then ball — timing stretches a hair when creeping.
    const rollT = S.roll * (0.9 + Math.random() * 0.25) * (1.15 - 0.15 * speed);
    contact(now, 1.0, true);
    contact(now + rollT, S.rollAmp, false);

    // Low thud — the weight of the body arriving through the sole.
    if (S.thud) {
      const o = c.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(S.thud * sidePitch, now);
      o.frequency.exponentialRampToValueAtTime(S.thud * 0.55, now + 0.07);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, S.thudAmp * k), now + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0004, now + 0.09);
      o.connect(g).connect(out);
      o.start(now); o.stop(now + 0.11);
    }
    // Sole scuff after the ball lands — fabric/rubber drag.
    if (S.scuff) {
      const at = now + rollT * 0.7;
      const ss = c.createBufferSource(); ss.buffer = noiseBuffer(S.scuff.dur);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = S.scuff.hz * sidePitch; bp.Q.value = 0.8;
      const sg = c.createGain();
      sg.gain.setValueAtTime(0.0001, at);
      sg.gain.exponentialRampToValueAtTime(Math.max(0.0002, S.scuff.amp * k * 0.85), at + 0.008);
      sg.gain.exponentialRampToValueAtTime(0.0004, at + S.scuff.dur);
      ss.connect(bp).connect(sg).connect(out);
      ss.start(at); ss.stop(at + S.scuff.dur + 0.02);
    }
    // Resonant body — floorboards and a glass pane ring; carpet does not.
    if (S.modes) {
      for (const [hz, amp, decay] of S.modes) {
        const o = c.createOscillator(); o.type = "sine";
        o.frequency.value = hz * sidePitch * (0.97 + Math.random() * 0.06);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp * k), now + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0004, now + decay);
        o.connect(g).connect(out);
        o.start(now); o.stop(now + decay + 0.02);
      }
    }
  }

  // Metal rattle — one clattery hit of a shaken steel railing: a bandpass
  // noise snap (the segment jumping in its bracket) over inharmonic ring-mode
  // partials that decay fast. Pure hardware — no envelope or formant shared
  // with any creature sound. Call it a few times at 40–90 ms gaps for a shake.
  function metalRattle(intensity = 1.0, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("metalRattle", pos, { refDistance: 0.8, maxDistance: 12 });
    const now = c.currentTime;
    // Clatter snap — the 900–1800 Hz body of rattling tube steel
    const ns = c.createBufferSource(); ns.buffer = noiseBuffer(0.08);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 900 + Math.random() * 900; bp.Q.value = 1.6;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.15 * intensity, now + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    ns.connect(bp).connect(ng).connect(out);
    ns.start(now); ns.stop(now + 0.09);
    // Ring modes — inharmonic partials of the pipe, ~0.25 s decay
    const f0 = 1150 + Math.random() * 500;
    for (const [ratio, amp] of [[1, 0.045], [2.76, 0.026], [5.4, 0.012]]) {
      const osc = c.createOscillator(); osc.type = "sine";
      osc.frequency.value = f0 * ratio * (0.98 + Math.random() * 0.04);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(amp * intensity, now + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.20 + Math.random() * 0.08);
      osc.connect(g).connect(out);
      osc.start(now); osc.stop(now + 0.32);
    }
  }

  // ---- Dog vocalisations (whine / soft pant / sniff) ----
  // These are subtle "alive dog" noises that complement bark(). A real dog
  // is rarely silent — there's always quiet panting + the occasional whine.
  // Add these to the dogs scene's update loop so the dog has constant
  // texture, not just barks-or-silence.

  // Soft whine — short rising-then-falling tone with nasal formants and a
  // breath layer. Higher pitch + vibrato + occasional crack = small-dog "hmm".
  function dogWhine(intensity = 0.6, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("dogWhine", pos, { refDistance: 1.2, maxDistance: 18, creature: true, reverb: 0.18 });
    if (!out) return;
    const now = c.currentTime;
    const dur = 0.60 + Math.random() * 0.28;
    const f0 = 620 + Math.random() * 180;
    const osc = c.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(f0 * 0.72, now);
    osc.frequency.linearRampToValueAtTime(f0 * 1.05, now + dur * 0.38);
    if (Math.random() < 0.55) {
      osc.frequency.setValueAtTime(f0 * 1.55, now + dur * 0.52);
      osc.frequency.setValueAtTime(f0 * 1.45, now + dur * 0.52 + 0.07);
    }
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.78, now + dur);
    const vib = c.createOscillator();
    const vibG = c.createGain();
    vib.frequency.value = 5.8 + Math.random() * 1.6;
    vibG.gain.value = 14;
    vib.connect(vibG).connect(osc.frequency);
    // Second partial for body (not a pure videogame beep)
    const osc2 = c.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.value = f0 * 0.5;
    const o2g = c.createGain(); o2g.gain.value = 0.12;
    const sum = c.createGain();
    const direct = c.createGain(); direct.gain.value = 0.65;
    const nasal = c.createBiquadFilter();
    nasal.type = "bandpass"; nasal.frequency.value = 2300 + Math.random() * 400; nasal.Q.value = 5.5;
    const nasalG = c.createGain(); nasalG.gain.value = 0.35;
    osc.connect(direct); direct.connect(sum);
    osc.connect(nasal); nasal.connect(nasalG); nasalG.connect(sum);
    osc2.connect(o2g); o2g.connect(sum);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 4200;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.20 * intensity, now + 0.07);
    g.gain.linearRampToValueAtTime(0.15 * intensity, now + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    sum.connect(lp); lp.connect(g); g.connect(out);
    const nb = noiseBuffer(dur);
    if (nb) {
      const ns = c.createBufferSource(); ns.buffer = nb;
      const nbp = c.createBiquadFilter();
      nbp.type = "bandpass"; nbp.frequency.value = 1500; nbp.Q.value = 1.1;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0, now);
      ng.gain.linearRampToValueAtTime(0.06 * intensity, now + 0.08);
      ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
      ns.connect(nbp); nbp.connect(ng); ng.connect(out);
      ns.start(now); ns.stop(now + dur + 0.02);
    }
    osc.start(now); osc2.start(now); vib.start(now);
    osc.stop(now + dur + 0.05); osc2.stop(now + dur + 0.05); vib.stop(now + dur + 0.05);
  }

  // Soft pant — inhale (breathy) + voiced exhale with wet lip flutter.
  function dogPant(intensity = 0.5, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("dogPant", pos, { refDistance: 1.0, maxDistance: 8, creature: true, reverb: 0.10 });
    if (!out) return;
    const now = c.currentTime;
    // Inhale
    {
      const dur = 0.20;
      const buf = noiseBuffer(dur);
      if (buf) {
        const src = c.createBufferSource(); src.buffer = buf;
        const bp = c.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 650 + Math.random() * 280; bp.Q.value = 0.85;
        const g = c.createGain();
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0.12 * intensity, now + dur * 0.4);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        src.connect(bp).connect(g).connect(out);
        src.start(now); src.stop(now + dur + 0.02);
      }
    }
    // Exhale — noise puff + faint voiced tone
    {
      const dur = 0.16;
      const t0 = now + 0.17;
      const buf = noiseBuffer(dur);
      if (buf) {
        const src = c.createBufferSource(); src.buffer = buf;
        const bp = c.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 900 + Math.random() * 350; bp.Q.value = 1.3;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.14 * intensity, t0 + 0.025);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        src.connect(bp).connect(g).connect(out);
        src.start(t0); src.stop(t0 + dur + 0.02);
      }
      const o = c.createOscillator(); o.type = "triangle";
      o.frequency.value = 180 + Math.random() * 40;
      const og = c.createGain();
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(0.04 * intensity, t0 + 0.02);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
      o.connect(og).connect(out);
      o.start(t0); o.stop(t0 + 0.14);
    }
  }

  // Sniff — rapid wet breathy puffs with pitch drift across the burst.
  function dogSniff(intensity = 0.5, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("dogSniff", pos, { refDistance: 0.8, maxDistance: 8, creature: true, reverb: 0.06 });
    if (!out) return;
    const N = 5 + Math.floor(Math.random() * 3);
    for (let i = 0; i < N; i++) {
      const t0 = c.currentTime + i * (0.085 + Math.random() * 0.035);
      const dur = 0.065 + Math.random() * 0.02;
      const buf = noiseBuffer(dur);
      if (!buf) continue;
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1200 + i * 80 + Math.random() * 350;
      bp.Q.value = 1.5;
      const g = c.createGain();
      const peak = (0.07 + (i % 2) * 0.025) * intensity;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      src.connect(bp).connect(g).connect(out);
      src.start(t0); src.stop(t0 + dur + 0.01);
    }
  }

  // ---- Dog movement foley ----
  // One paw strike on wood: claw tick + pad thump + board resonance. Driven
  // by DogController's gait-phase events, so footfall RATE and STRENGTH both
  // encode the dog's real speed — the charge becomes a hard, accelerating
  // click-train approaching through the HRTF panner.
  function dogFootfall(strength = 0.5, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("dogFootfall", pos, { refDistance: 1.2, maxDistance: 20, rolloffFactor: 1.5, creature: true, reverb: 0.18 });
    if (!out) return;
    const t0 = c.currentTime;
    const tick = (at, gain, hz) => {
      const buf = noiseBuffer(0.05);
      if (!buf) return;
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = hz;
      bp.Q.value = 1.4;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.016);
      src.connect(bp); bp.connect(g); g.connect(out);
      src.start(at); src.stop(at + 0.05);
    };
    tick(t0, 0.10 * strength, 3200 + Math.random() * 900);
    tick(t0 + 0.008, 0.06 * strength, 4100 + Math.random() * 800);
    if (strength > 0.55) tick(t0 + 0.016, 0.045 * strength, 2800 + Math.random() * 600);
    // Pad thump
    const pb = noiseBuffer(0.11);
    if (pb) {
      const src = c.createBufferSource(); src.buffer = pb;
      const lp = c.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 220 + Math.random() * 90;
      lp.Q.value = 1.1;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18 * strength, t0 + 0.002);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.07);
      src.connect(lp); lp.connect(g); g.connect(out);
      src.start(t0); src.stop(t0 + 0.11);
    }
    // Wood board body + a higher partial
    for (const [hz, amp, decay] of [[92, 0.055, 0.10], [185, 0.025, 0.08]]) {
      const bo = c.createOscillator();
      bo.type = "sine"; bo.frequency.value = hz * (0.97 + Math.random() * 0.06);
      const bg = c.createGain();
      bg.gain.setValueAtTime(0.0001, t0);
      bg.gain.exponentialRampToValueAtTime(amp * strength, t0 + 0.003);
      bg.gain.exponentialRampToValueAtTime(0.001, t0 + decay);
      bo.connect(bg); bg.connect(out);
      bo.start(t0); bo.stop(t0 + decay + 0.02);
    }
  }

  // Rubber ball on wood. v = normalized impact 0..1. Master bus (it's not a
  // creature vocal, so it correctly ducks under the therapist voice).
  function ballBounce(v = 0.5, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("ballBounce", pos, { refDistance: 1.2, maxDistance: 18, reverb: 0.2 });
    const t0 = c.currentTime;
    const o = c.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(190, t0);
    o.frequency.exponentialRampToValueAtTime(85, t0 + 0.09);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.30 * v, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.12);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + 0.14);
    const nb = noiseBuffer(0.05);
    if (nb) {
      const src = c.createBufferSource(); src.buffer = nb;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 1.0;
      const ng = c.createGain();
      ng.gain.setValueAtTime(0.0001, t0);
      ng.gain.exponentialRampToValueAtTime(0.10 * v, t0 + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.001, t0 + 0.02);
      src.connect(bp); bp.connect(ng); ng.connect(out);
      src.start(t0); src.stop(t0 + 0.05);
    }
  }

  // Collar-tag jingle: 2–4 tiny metal pings, inharmonic partials with fast
  // decay + slight per-ping detune — brass tag against a buckle. The sound
  // that announces a real dog before you see it: per-stride ticks while it
  // trots, a full shake-out burst on the shake-off.
  function collarJingle(intensity = 0.4, pos = null, opts = {}) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("collarJingle", pos, { refDistance: 0.9, maxDistance: 9, creature: true, reverb: 0.10 });
    const k = Math.max(0, Math.min(1, intensity));
    const pings = opts.count || (2 + (Math.random() < 0.4 ? 1 : 0));
    const t0 = c.currentTime;
    for (let i = 0; i < pings; i++) {
      const at = t0 + i * (0.028 + Math.random() * 0.035);
      const base = 2300 + Math.random() * 700;
      // Two inharmonic partials per ping — a pure sine reads as a phone chime.
      for (const [mult, amp] of [[1, 1], [2.42 + Math.random() * 0.2, 0.45]]) {
        const o = c.createOscillator();
        o.type = "sine";
        o.frequency.value = base * mult;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.055 * k * amp, at + 0.003);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.055 + Math.random() * 0.03);
        o.connect(g); g.connect(out);
        o.start(at); o.stop(at + 0.1);
      }
    }
  }

  // Jaw pickup: two damped chomps + a soft thump.
  function dogMouthGrab(pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("dogMouthGrab", pos, { refDistance: 1.0, maxDistance: 10, creature: true, reverb: 0.1 });
    const t0 = c.currentTime;
    const chomp = (at, gain) => {
      const buf = noiseBuffer(0.04);
      if (!buf) return;
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 1100; bp.Q.value = 2;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.03);
      src.connect(bp); bp.connect(g); g.connect(out);
      src.start(at); src.stop(at + 0.05);
    };
    chomp(t0, 0.12);
    chomp(t0 + 0.09, 0.08);
    const o = c.createOscillator();
    o.type = "sine"; o.frequency.value = 300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
    o.connect(g); g.connect(out);
    o.start(t0); o.stop(t0 + 0.06);
  }

  // Lapping at the water bowl — wet flicks at ~3.2 Hz + droplet chirps.
  // Returns { stop() } and MUST be registered for scene teardown.
  function dogLapping(pos = null, dur = 3.0) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    const lapG = c.createGain();
    lapG.gain.value = 1;
    const out = sfxOut("dogLapping", pos, { refDistance: 1.0, maxDistance: 10, creature: true, reverb: 0.12 });
    lapG.connect(out);
    const srcs = [];
    const t0 = c.currentTime;
    const n = Math.floor(dur * 3.2);
    for (let i = 0; i < n; i++) {
      const at = t0 + i / 3.2 + Math.random() * 0.04;
      const buf = noiseBuffer(0.08);
      if (buf) {
        const src = c.createBufferSource(); src.buffer = buf;
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.setValueAtTime(800, at);
        bp.frequency.linearRampToValueAtTime(1800, at + 0.06);
        bp.Q.value = 1.8;
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.07, at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
        src.connect(bp); bp.connect(g); g.connect(lapG);
        src.start(at); src.stop(at + 0.09);
        srcs.push(src);
      }
      const drop = c.createOscillator();
      drop.type = "sine";
      drop.frequency.setValueAtTime(2600, at + 0.02);
      drop.frequency.exponentialRampToValueAtTime(1400, at + 0.035);
      const dg = c.createGain();
      dg.gain.setValueAtTime(0.0001, at + 0.02);
      dg.gain.exponentialRampToValueAtTime(0.015, at + 0.023);
      dg.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
      drop.connect(dg); dg.connect(lapG);
      drop.start(at + 0.02); drop.stop(at + 0.05);
      srcs.push(drop);
    }
    return {
      stop() {
        try {
          lapG.gain.setTargetAtTime(0, c.currentTime, 0.05);
          setTimeout(() => { srcs.forEach((s) => { try { s.stop(); } catch {} }); }, 200);
        } catch {}
      },
    };
  }

  // Low throaty GROWL — the menace before a bark/snap. A rising sawtooth
  // rumble with a noisy throat layer + vibrato, swelling over `dur`. Routed
  // through the creature bus so it never ducks under the guide's voice. The dog
  // scene fires this the instant a charge commits, so the lunge has real warning
  // instead of arriving in eerie silence.
  function growl(intensity = 0.8, pos = null, dur = 1.0) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("growl", pos, { refDistance: 1.5, maxDistance: 26, rolloffFactor: 1.6, creature: true, reverb: 0.18 });
    const now = c.currentTime;
    // Voiced body: sawtooth + a detuned SUBHARMONIC saw an octave down —
    // the "two pitches at once" roughness of a real threat growl.
    const formIn = c.createGain();
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(58, now);
    osc.frequency.linearRampToValueAtTime(88 + intensity * 18, now + dur);
    osc.connect(formIn);
    const sub = c.createOscillator();
    sub.type = "sawtooth";
    sub.frequency.setValueAtTime(29, now);
    sub.frequency.linearRampToValueAtTime((88 + intensity * 18) / 2, now + dur);
    sub.detune.value = 30;
    const subG = c.createGain();
    subG.gain.value = 0.5;
    sub.connect(subG); subG.connect(formIn);
    // Throat formants → dark body lowpass → amplitude
    const f1 = c.createBiquadFilter();
    f1.type = "bandpass"; f1.frequency.value = 300; f1.Q.value = 3;
    const f2 = c.createBiquadFilter();
    f2.type = "bandpass"; f2.frequency.value = 750; f2.Q.value = 5;
    const f2g = c.createGain(); f2g.gain.value = 0.35;
    const body = c.createBiquadFilter();
    body.type = "lowpass"; body.frequency.value = 900; body.Q.value = 0.8;
    const ampG = c.createGain();
    formIn.connect(f1); f1.connect(body);
    formIn.connect(f2); f2.connect(f2g); f2g.connect(body);
    body.connect(ampG); ampG.connect(out);
    // FLUTTER: 8-14 Hz AMPLITUDE modulation — the vocal-fold rattle. (The
    // old 24-32 Hz vibrato-on-pitch read as a synth LFO, not a throat.)
    const ampTarget = 0.42 * intensity;
    const lfo = c.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 9 + Math.random() * 5;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.35 * ampTarget;
    lfo.connect(lfoGain);
    lfoGain.connect(ampG.gain);
    // Amp envelope (swell → sustain → release)
    ampG.gain.setValueAtTime(0, now);
    ampG.gain.linearRampToValueAtTime(0.34 * intensity, now + dur * 0.5);
    ampG.gain.linearRampToValueAtTime(ampTarget, now + dur * 0.92);
    ampG.gain.exponentialRampToValueAtTime(0.001, now + dur + 0.12);
    // Throat noise, fluttering coherently with the tone (same LFO)
    const nb = noiseBuffer(dur + 0.2);
    const ns = c.createBufferSource(); ns.buffer = nb;
    const nbp = c.createBiquadFilter(); nbp.type = "bandpass"; nbp.frequency.value = 380; nbp.Q.value = 1.0;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0, now);
    ng.gain.linearRampToValueAtTime(0.12 * intensity, now + dur * 0.6);
    ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
    lfoGain.connect(ng.gain);
    ns.connect(nbp); nbp.connect(ng); ng.connect(out);
    osc.start(now); sub.start(now); lfo.start(now); ns.start(now);
    osc.stop(now + dur + 0.15); sub.stop(now + dur + 0.15);
    lfo.stop(now + dur + 0.15); ns.stop(now + dur + 0.1);
  }

  // ---- Crowd foley (speaking scene) ----
  // A cough from a specific seat: one or two voiced huffs of bandpassed noise,
  // spatialised to an audience member's position so the murmur bed has bodies.
  function crowdCough(intensity = 0.4, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("crowdCough", pos, { refDistance: 2.5, maxDistance: 30, rolloffFactor: 1.3, reverb: 0.3 });
    const now = c.currentTime;
    const bursts = Math.random() < 0.6 ? 2 : 1;
    for (let i = 0; i < bursts; i++) {
      const t0 = now + i * (0.16 + Math.random() * 0.06);
      const src = c.createBufferSource(); src.buffer = noiseBuffer(0.3);
      const bp = c.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 420 + Math.random() * 260;
      bp.Q.value = 1.1;
      const g = c.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime((0.30 + Math.random() * 0.12) * intensity * (i ? 0.7 : 1), t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.14 + Math.random() * 0.06);
      src.connect(bp).connect(g).connect(out);
      src.start(t0); src.stop(t0 + 0.3);
    }
  }

  // Seat shuffle / clothing rustle — somebody shifting their weight. Dark
  // lowpassed noise with a slow swell: the "a hundred people sitting mostly
  // still" texture between coughs.
  function crowdShuffle(intensity = 0.35, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("crowdShuffle", pos, { refDistance: 2.5, maxDistance: 26, rolloffFactor: 1.3, reverb: 0.25 });
    const now = c.currentTime;
    const dur = 0.5 + Math.random() * 0.5;
    const src = c.createBufferSource(); src.buffer = noiseBuffer(dur + 0.1);
    const lp = c.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 700 + Math.random() * 500; lp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16 * intensity, now + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(lp).connect(g).connect(out);
    src.start(now); src.stop(now + dur + 0.05);
  }

  // ---- Wind howl (gust) ----
  // A single low-frequency-modulated noise sweep that layers on top of the
  // continuous wind. Heights uses this as the user nears the railing or
  // tilts their pitch downward — the visceral "the wind is real" cue.
  function windHowl(intensity = 0.6) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("windHowl", null);
    const now = c.currentTime;
    const dur = 1.4 + Math.random() * 0.8;
    const buf = noiseBuffer(dur);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(180, now);
    bp.frequency.linearRampToValueAtTime(900 + intensity * 500, now + dur * 0.5);
    bp.frequency.exponentialRampToValueAtTime(220, now + dur);
    bp.Q.value = 1.4;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16 + intensity * 0.20, now + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(now); src.stop(now + dur + 0.02);
  }

  // ---- Adjustable heartbeat ----
  // Returns a handle similar to startHeartbeat but with a `setIntensity(i)`
  // method that ramps the gain in real time. Heights uses this to make the
  // heartbeat audibly louder when the user is close to the edge / looking
  // straight down — a felt physiological response, not a constant track.
  // `opts.silent` runs the beat CLOCK without sounding it. A heartbeat you can
  // hear is score, not world: nobody standing in a room hears their own pulse,
  // and it was the one thing in the mix that wasn't the dog, the room or your
  // own feet. The clock still drives the vignette throb and the haptic buzz —
  // the body-feel channels that don't lie about being diegetic.
  function startVertigoHeartbeat(initialBpm = 78, onBeat = null, opts = {}) {
    const c = ensureCtx(); if (!c) return { stop() {}, setIntensity() {}, setBpm() {} };
    let alive = true;
    let bpm = initialBpm;
    let intensity = 0;
    const silent = !!opts.silent;
    const dynGain = c.createGain();
    dynGain.gain.value = 0.0;
    dynGain.connect(master);
    function pump() {
      if (!alive) return;
      const now = c.currentTime;
      const beat = (t, freq, peak, dur) => {
        if (silent) return;
        const osc = c.createOscillator();
        osc.type = "sine"; osc.frequency.value = freq;
        const g = c.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g).connect(dynGain);
        osc.start(t); osc.stop(t + dur + 0.05);
      };
      beat(now, 56, 0.45, 0.18);
      beat(now + 0.18, 46, 0.30, 0.14);
      // Let the caller sync OTHER body-feel channels (haptic buzz, vignette
      // pulse) to the same lub-dub the ears hear. One clock, one body.
      if (onBeat) { try { onBeat(bpm, intensity); } catch {} }
      setTimeout(pump, 60000 / bpm);
    }
    pump();
    return {
      stop() {
        alive = false;
        try { dynGain.gain.setTargetAtTime(0, c.currentTime, 0.4); } catch {}
      },
      setIntensity(i) {
        const v = Math.max(0, Math.min(1, i || 0));
        intensity = v;
        try { dynGain.gain.setTargetAtTime(v * 0.95, c.currentTime, 0.18); } catch {}
      },
      setBpm(b) { bpm = Math.max(40, Math.min(160, b || 78)); },
    };
  }

  // Door creak — used at the start of the enclosed scene's tighter rungs
  function doorCreak(pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("doorCreak", pos, { refDistance: 1, maxDistance: 12 });
    const now = c.currentTime;
    const dur = 0.7;
    // Stick-slip creak: a woody mid tone that creeps in pitch, GATED by a fast
    // tremolo so it ratchets like wood catching and releasing — not a smooth
    // low foghorn glide (which is what it used to be).
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(280, now);
    osc.frequency.linearRampToValueAtTime(360, now + dur * 0.6);
    osc.frequency.exponentialRampToValueAtTime(200, now + dur);
    const bp = c.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 520; bp.Q.value = 3.5;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.16, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    // Tremolo "ratchet" added onto the gain envelope.
    const trem = c.createOscillator(); trem.type = "square";
    trem.frequency.setValueAtTime(26, now);
    trem.frequency.linearRampToValueAtTime(44, now + dur);
    const tremGain = c.createGain(); tremGain.gain.value = 0.10;
    trem.connect(tremGain).connect(g.gain);
    osc.connect(bp).connect(g).connect(out);
    osc.start(now); osc.stop(now + dur + 0.05);
    trem.start(now); trem.stop(now + dur + 0.05);
  }

  // ---- Night-house sounds (the dark realm) ----
  // Each one is a sound the house really makes, fired by the scene so the
  // prompt that follows ("a creak…", "tap… tap…") names what you just heard.
  // Floor creak: the door creak's stick-slip, lower and shorter — wood under load.
  function floorCreak(pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("doorCreak", pos, { refDistance: 1, maxDistance: 10 });
    const now = c.currentTime, dur = 0.45 + Math.random() * 0.25;
    const osc = c.createOscillator(); osc.type = "sawtooth";
    const f0 = 150 + Math.random() * 40;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.linearRampToValueAtTime(f0 * 1.25, now + dur * 0.5);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.8, now + dur);
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 340; bp.Q.value = 3;
    const g = c.createGain();
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.13, now + 0.05); g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    const trem = c.createOscillator(); trem.type = "square"; trem.frequency.setValueAtTime(18, now); trem.frequency.linearRampToValueAtTime(30, now + dur);
    const tg = c.createGain(); tg.gain.value = 0.08; trem.connect(tg).connect(g.gain);
    osc.connect(bp).connect(g).connect(out);
    osc.start(now); osc.stop(now + dur + 0.05); trem.start(now); trem.stop(now + dur + 0.05);
  }
  // A twig on glass: 2–4 small, bright, slightly irregular ticks.
  function windowTap(pos = null, n = 3) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("doorCreak", pos, { refDistance: 1, maxDistance: 10 });
    let tt = c.currentTime;
    for (let i = 0; i < n; i++) {
      const len = Math.floor(c.sampleRate * 0.03);
      const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / (len * 0.12));
      const src = c.createBufferSource(); src.buffer = buf;
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2600 + Math.random() * 900; bp.Q.value = 6;
      const g = c.createGain(); g.gain.value = 0.35 * (0.8 + Math.random() * 0.4);
      src.connect(bp).connect(g).connect(out);
      src.start(tt);
      tt += 0.28 + Math.random() * 0.35;
    }
  }
  // Fridge downstairs: a muffled compressor hum that fades out, then a click.
  function fridgeHum(dur = 4.5, pos = null) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("doorCreak", pos, { refDistance: 2, maxDistance: 20 });
    const now = c.currentTime;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 220;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, now); g.gain.exponentialRampToValueAtTime(0.10, now + 0.6);
    g.gain.setValueAtTime(0.10, now + dur - 0.6); g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    for (const [f, a] of [[50, 1], [100, 0.6], [150, 0.25]]) {
      const o = c.createOscillator(); o.type = "sine"; o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.01);
      const og = c.createGain(); og.gain.value = a;
      o.connect(og).connect(lp); o.start(now); o.stop(now + dur + 0.1);
    }
    lp.connect(g).connect(out);
    // the relay click as it cuts out
    const len = Math.floor(c.sampleRate * 0.02);
    const buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let k = 0; k < len; k++) d[k] = (Math.random() * 2 - 1) * Math.exp(-k / (len * 0.1));
    const src = c.createBufferSource(); src.buffer = buf;
    const cg = c.createGain(); cg.gain.value = 0.18;
    src.connect(cg).connect(out); src.start(now + dur - 0.05);
  }

  // Clinical heart-monitor blip — a short steady ECG beep. Gives the needles
  // scene an unmistakable "medical room" identity it was missing.
  function startMonitorBeep(bpm = 72) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    let alive = true, timer = null;
    const period = 60000 / bpm;
    function beep() {
      if (!alive) return;
      const now = c.currentTime;
      const osc = c.createOscillator();
      osc.type = "sine"; osc.frequency.value = 880;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.045, now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.10);
      osc.connect(g).connect(master);
      osc.start(now); osc.stop(now + 0.12);
      timer = setTimeout(beep, period);
    }
    timer = setTimeout(beep, 600);
    return { stop() { alive = false; if (timer) clearTimeout(timer); } };
  }

  // Unsettling random creaks + distant low thumps — the "something in the dark"
  // signature the dark scene was missing (it was just a flat hum, like enclosed).
  function startCreaks(rate = 0.5) {
    const c = ensureCtx(); if (!c) return { stop() {} };
    let alive = true, timer = null;
    function next() {
      if (!alive) return;
      if (Math.random() < 0.5) {
        doorCreak({ x: (Math.random() - 0.5) * 4, y: 0, z: -1 - Math.random() * 3 });
      } else {
        const now = c.currentTime;
        const osc = c.createOscillator(); osc.type = "sine";
        osc.frequency.setValueAtTime(90, now);
        osc.frequency.exponentialRampToValueAtTime(45, now + 0.25);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0008, now + 0.3);
        osc.connect(g).connect(master);
        osc.start(now); osc.stop(now + 0.35);
      }
      timer = setTimeout(next, (3000 + Math.random() * 6000) / Math.max(0.2, rate));
    }
    timer = setTimeout(next, 2500 + Math.random() * 3000);
    return { stop() { alive = false; if (timer) clearTimeout(timer); } };
  }

  // ---------- Shell / game-UI one-shots ----------
  // Tiny, quiet feedback sounds for the SHELL (map, cards, victory) — kept
  // far below the diegetic scene mix so they read as "the game responding",
  // never as noise. All routed through master so the mute toggle covers them.
  function ui(kind = "whoosh", volMul = 1) {
    const c = ensureCtx(); if (!c) return;
    const out = sfxOut("ui", null);
    const now = c.currentTime;
    const bell = (freq, t0, dur = 0.7, vol = 0.055) => {
      vol *= volMul;
      const osc = c.createOscillator(); osc.type = "sine"; osc.frequency.value = freq;
      const shimmer = c.createOscillator(); shimmer.type = "sine"; shimmer.frequency.value = freq * 2.01;
      const g = c.createGain(); const g2 = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
      g2.gain.value = 0.35;
      osc.connect(g); shimmer.connect(g2).connect(g); g.connect(out);
      osc.start(t0); osc.stop(t0 + dur + 0.05);
      shimmer.start(t0); shimmer.stop(t0 + dur + 0.05);
    };
    if (kind === "spark") {
      // A small glass bell, two notes — "you found something".
      bell(880, now, 0.55, 0.05);
      bell(1318.5, now + 0.09, 0.8, 0.045);
    } else if (kind === "victory") {
      // Gentle rising pentatonic triad — earned, not fanfare.
      bell(523.25, now, 0.5, 0.04);
      bell(659.25, now + 0.12, 0.55, 0.04);
      bell(783.99, now + 0.24, 0.9, 0.05);
    } else if (/^star[123]$/.test(kind)) {
      // A trial star landing on the level card: one bright bell and its
      // fifth, a step higher for each star.
      const f = [659.25, 783.99, 987.77][+kind.slice(4) - 1];
      bell(f, now, 0.45, 0.05);
      bell(f * 1.5, now + 0.06, 0.7, 0.032);
    } else {
      // "whoosh" — a soft air swell for stepping into a realm / trial.
      const src = c.createBufferSource(); src.buffer = noiseBuffer(0.8);
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 0.7;
      bp.frequency.setValueAtTime(220, now);
      bp.frequency.exponentialRampToValueAtTime(900, now + 0.35);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.075 * volMul, now + 0.16);
      g.gain.exponentialRampToValueAtTime(0.0008, now + 0.5);
      src.connect(bp).connect(g).connect(out);
      src.start(now); src.stop(now + 0.6);
    }
  }

  return {
    unlock, setMuted, isMuted, duck, ui,
    startMonitorBeep, startCreaks,
    startWind, startWaterLap, startUnderwater, startRoomTone, startAmbienceBed, startCityHum,
    startRoomLife, startFireCrackle, startOutdoorLife, startNightValley,
    startBarking, startSkittering, startMRI, startBreathing, startHeartbeat,
    breathCatch,
    startVertigoHeartbeat,
    startEngineDrone, startHiss, startAudienceMurmur, startAmbientPad,
    // Auditorium foley (additive)
    applause, crowdOneShot, startSpeechMurmur,
    startRain, startDrivingDrone,
    hissOnce, startSlither, skitterBurst,
    // Snake foley (additive)
    snakeHiss, startSnakeSlither, tongueFlick, snakeStrike, startClearingAmbient,
    // Spider foley (additive)
    skitterTicks, bristleRustle, chitinTik, webPluck, startCellarAmbient,
    bark, splash, doorCreak, thunder, indicatorClick, footstep,
    floorCreak, windowTap, fridgeHum, mriSequence, machineHum, liftChime,
    metalRattle,
    // Dog vocalisations — dogVocal is the unified entry (samples-first with
    // synth fallback); the individual synths stay exported for direct use.
    dogVocal, preloadDogSamples,
    dogWhine, dogPant, dogSniff, growl,
    // Crowd foley + applause (speaking scene)
    crowdCough, crowdShuffle,
    // Dog movement foley
    dogFootfall, ballBounce, dogMouthGrab, dogLapping, collarJingle,
    // Room acoustics
    roomReverb,
    // Wind events
    windHowl,
    // Spatial audio
    spatial, updateListener,
  };
})();
window.PhobiaAudio = PhobiaAudio;
