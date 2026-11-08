// Renders the environment beds in assets/audio/env/ — one distinct set of
// sounds per realm — from first principles: shaped noise, oscillators, modal
// resonators, Poisson event trains and a Schroeder reverb, all in plain Node.
// No recordings are used, so the result is ours to ship (CC0). ffmpeg encodes
// the rendered WAVs to AAC and reports each file's level.
//
//   node scripts/render-ambience.cjs            # every layer
//   node scripts/render-ambience.cjs wind_high  # just these layers
//   KEEP_WAV=1 …                                # keep the WAVs next to the m4a
//
// Each layer is rendered a little longer than its loop, and the overrun is
// crossfaded into the head, so the file loops without a seam. Every file is
// normalised to the same RMS (−20 dBFS), so the gain a scene plays it at
// (src/app/exposure.js, startSceneAudio) is the whole story of how loud it is.
// The runtime looper (PhobiaAudio.startEnvLayer) crossfades the loop point
// itself, so codec padding can't click.
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const SR = 44100;
const OUT_DIR = path.join(__dirname, "..", "assets", "audio", "env");
const TARGET_RMS_DB = -20;
const ENCODE_SR = 32000;
const BITRATE = "40k";

// ---------- small DSP kit ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(1);
const R = () => rnd();
const RR = (a, b) => a + (b - a) * rnd();
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const TAU = Math.PI * 2;

// RBJ biquad, transposed direct form II.
class BQ {
  constructor(type = "lp", f = 1000, q = 0.707, gdb = 0) { this.z1 = 0; this.z2 = 0; this.set(type, f, q, gdb); }
  set(type, f, q, gdb = 0) {
    f = clamp(f, 10, SR * 0.47);
    const w = TAU * f / SR, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "lp") { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === "hp") { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === "bp") { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }   // constant-skirt, peak gain Q
    else if (type === "notch") { b0 = 1; b1 = -2 * cs; b2 = 1; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { // peaking
      const A = Math.pow(10, gdb / 40);
      b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
  }
  p(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}
// Paul Kellet's pink filter (white in, pink out).
class Pink {
  constructor() { this.b = [0, 0, 0, 0, 0, 0, 0]; }
  p(w) {
    const b = this.b;
    b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759;
    b[2] = 0.96900 * b[2] + w * 0.1538520; b[3] = 0.86650 * b[3] + w * 0.3104856;
    b[4] = 0.55000 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.0168980;
    const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362;
    b[6] = w * 0.115926;
    return out * 0.11;
  }
}
// Brown: leaky integrator of white.
class Brown { constructor() { this.y = 0; } p(w) { this.y = 0.998 * this.y + w * 0.02; return this.y * 3.5; } }
// Slowly wandering value: random targets reached by cosine interpolation.
class Slow {
  constructor(rateHz, lo = 0, hi = 1) { this.lo = lo; this.hi = hi; this.n = Math.max(1, Math.floor(SR / rateHz)); this.i = this.n; this.a = RR(lo, hi); this.b = RR(lo, hi); this.v = this.a; }
  // `step` = samples since the last call (a block that reads the walk every
  // 64 samples passes 64, or its segments silently run 64× too long).
  next(step = 1) {
    if (this.i >= this.n) { this.i = 0; this.a = this.b; this.b = RR(this.lo, this.hi); this.n = Math.floor(this.n * RR(0.7, 1.3)) || 1; }
    const t = this.i / this.n, k = 0.5 - 0.5 * Math.cos(Math.PI * t);
    this.i += step;
    return this.v = this.a + (this.b - this.a) * k;
  }
}
const white = () => R() * 2 - 1;
const db = (d) => Math.pow(10, d / 20);

// Schroeder reverb over a whole buffer: 8 combs (damped) + 4 allpasses.
function reverb(buf, { rt60 = 1.5, damp = 0.4, wet = 0.3, pre = 0.01 } = {}) {
  const N = buf.length;
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ d, buf: new Float32Array(d), i: 0, lp: 0, g: Math.pow(10, -3 * d / (rt60 * SR)) }));
  const aps = [556, 441, 341, 225].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  const preN = Math.floor(pre * SR);
  const out = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    const x = n >= preN ? buf[n - preN] : 0;
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * (1 - damp) + c.lp * damp;
      c.buf[c.i] = x + c.lp * c.g;
      c.i = (c.i + 1) % c.d;
      s += y;
    }
    s *= 0.125;
    for (const a of aps) {
      const y = a.buf[a.i];
      const v = s + y * -0.5;
      a.buf[a.i] = v;
      a.i = (a.i + 1) % a.d;
      s = y + v * 0.5;
    }
    out[n] = buf[n] * (1 - wet) + s * wet;
  }
  return out;
}
// Add a damped sine ("mode") into buf at sample t0.
function mode(buf, t0, f, tau, amp, phase = 0) {
  const len = Math.min(buf.length - t0, Math.floor(tau * 7 * SR));
  const w = TAU * f / SR, k = 1 / (tau * SR);
  for (let i = 0; i < len; i++) buf[t0 + i] += amp * Math.exp(-i * k) * Math.sin(w * i + phase);
}
// Add a short noise burst with exponential decay (and optional bandpass).
function burst(buf, t0, dur, amp, bq) {
  const len = Math.min(buf.length - t0, Math.floor(dur * SR));
  for (let i = 0; i < len; i++) {
    let v = white() * Math.exp(-4 * i / len);
    if (bq) v = bq.p(v);
    buf[t0 + i] += v * amp;
  }
}
function mix(dst, src, g = 1) { for (let i = 0; i < dst.length; i++) dst[i] += src[i] * g; return dst; }
function gauss(t, c, w) { const d = (t - c) / w; return Math.exp(-0.5 * d * d); }

// Seamless loop + normalise. `buf` holds loopSec + xfSec seconds.
function finish(buf, loopSec, xfSec = 2.0) {
  const N = Math.floor(loopSec * SR), X = Math.floor(xfSec * SR);
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    if (i < X) { const th = (i / X) * Math.PI / 2; out[i] = buf[i] * Math.sin(th) + buf[i + N] * Math.cos(th); }
    else out[i] = buf[i];
  }
  // DC block
  let m = 0; for (let i = 0; i < N; i++) m += out[i]; m /= N;
  let e = 0, pk = 0;
  for (let i = 0; i < N; i++) { out[i] -= m; e += out[i] * out[i]; const a = Math.abs(out[i]); if (a > pk) pk = a; }
  const rms = Math.sqrt(e / N) || 1e-9;
  let s = db(TARGET_RMS_DB) / rms;
  if (pk * s > 0.95) s = 0.95 / pk;      // high-crest layers keep their peaks under −0.5 dBFS
  for (let i = 0; i < N; i++) out[i] *= s;
  return { pcm: out, rmsDb: 20 * Math.log10(rms * s), peakDb: 20 * Math.log10(pk * s) };
}
function wav(pcm) {
  const h = Buffer.alloc(44);
  const bytes = pcm.length * 4;
  h.write("RIFF", 0); h.writeUInt32LE(36 + bytes, 4); h.write("WAVE", 8); h.write("fmt ", 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(3, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(32, 34); h.write("data", 36); h.writeUInt32LE(bytes, 40);
  return Buffer.concat([h, Buffer.from(pcm.buffer, pcm.byteOffset, bytes)]);
}
const secs = (loop, xf = 2) => Math.floor((loop + xf) * SR);

// ---------- generators ----------
// Each returns a Float32Array of secs(loop) samples; LAYERS maps name → {loop, gen}.

// Wind: pink noise under a lowpass whose cutoff and level ride a gust that is
// the sum of three random walks. The exposed version adds an aeolian whistle
// (a narrow resonance that only opens on strong gusts) and tarp flutter.
function genWind(loop, high) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), lp = new BQ("lp", 400, 0.8), wbp = new BQ("bp", 900, 12), fbp = new BQ("bp", 1300, 2.5);
  const g1 = new Slow(0.06), g2 = new Slow(0.22), g3 = new Slow(0.8);
  let gust = 0;
  for (let n = 0; n < N; n++) {
    if ((n & 63) === 0) {
      // Three walks summed sit near 0.5 most of the time; squaring pushes
      // the sum into real lulls and real gusts.
      // The sum of three walks hugs 0.5; stretch its middle so the wind has
      // real lulls (near silence) and real gusts, ~18 dB apart.
      const g = clamp(0.5 * g1.next(64) + 0.35 * g2.next(64) + 0.15 * g3.next(64), 0, 1);
      gust = Math.pow(clamp((g - 0.22) / 0.56, 0, 1), 1.4);
      lp.set("lp", (high ? 260 : 200) + gust * (high ? 1900 : 900), 0.8);
      if (high) wbp.set("bp", 650 + gust * 900, 14);
    }
    const p = pk.p(white());
    let v = lp.p(p) * Math.pow(0.06 + gust, 2) * 2.2;
    if (high) {
      const open = Math.max(0, gust - 0.55);
      v += wbp.p(p) * open * open * 2.2;                              // whistle through railings
      const flut = 0.5 + 0.5 * Math.sin(TAU * (9 + gust * 5) * n / SR);  // tarp / flag flutter
      v += fbp.p(white()) * Math.max(0, gust - 0.6) * flut * 0.5;
    }
    out[n] = v;
  }
  return out;
}

// Rain on a window: a dense Poisson train of droplets, each ringing a glass
// mode, over a steady hiss, heard from inside (lowpassed).
function genRainGlass(loop) {
  const N = secs(loop), out = new Float32Array(N), hiss = new Float32Array(N);
  const rate = new Slow(0.05, 0.6, 1.4);
  let t = 0;
  while (t < N) {
    const r = 90 * rate.next();
    t += Math.floor(-Math.log(1 - R()) / r * SR) + 1;
    if (t >= N) break;
    const a = Math.pow(R(), 2.2) * 0.9;
    mode(out, t, RR(2300, 6200), RR(0.003, 0.009), a, R() * TAU);
    if (R() < 0.04) { mode(out, t, RR(700, 1500), RR(0.015, 0.03), a * 0.8); }   // a heavier drop
  }
  const lp = new BQ("lp", 3200, 0.6), sl = new Slow(0.08, 0.7, 1.1);
  for (let n = 0; n < N; n++) hiss[n] = lp.p(white()) * 0.22 * sl.next();
  mix(out, hiss);
  const glass = new BQ("lp", 5200, 0.6);
  for (let n = 0; n < N; n++) out[n] = glass.p(out[n]);
  return out;
}
// Rain outdoors: patter on leaves + broadband hiss + the low body of a shower.
function genRainLeaves(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const sl = new Slow(0.04, 0.75, 1.25), lp = new BQ("lp", 6500, 0.6), body = new BQ("lp", 160, 0.8), br = new Brown();
  let t = 0;
  const pbq = new BQ("lp", 3800, 0.7);
  while (t < N) {
    t += Math.floor(-Math.log(1 - R()) / 240 * SR) + 1;
    if (t >= N) break;
    const a = Math.pow(R(), 3) * 1.6;
    const len = 2 + Math.floor(R() * 4);
    for (let i = 0; i < len && t + i < N; i++) out[t + i] += pbq.p(white()) * a * (1 - i / len);
    if (R() < 0.012) mode(out, t, RR(900, 2200), RR(0.008, 0.016), a * 0.5);   // a drip off a leaf
  }
  for (let n = 0; n < N; n++) {
    const s = sl.next();
    out[n] = out[n] * s + lp.p(white()) * 0.16 * s + body.p(br.p(white())) * 0.5;
  }
  return out;
}

// City heard from above (far) or from the pavement (near): a rumble, a
// traffic body with slow swells, tyre hiss, and individual cars passing with
// a falling filter sweep.
function genCity(loop, near) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), rum = new BQ("lp", 380, 0.8), bod = new BQ("bp", 240, 0.8), hiss = new BQ("bp", near ? 1400 : 1000, 0.6);
  const s1 = new Slow(0.04, 0.6, 1), s2 = new Slow(0.15, 0.5, 1), s3 = new Slow(0.3, 0.3, 1);
  for (let n = 0; n < N; n++) {
    const p = pk.p(white());
    out[n] = rum.p(p) * 0.9 * s1.next() + bod.p(p) * 0.5 * s2.next() + hiss.p(white()) * (near ? 0.12 : 0.05) * s3.next();
  }
  // Passing cars.
  const passes = near ? 12 : 7;
  for (let k = 0; k < passes; k++) {
    const c = RR(2, loop + 2), w = RR(1.2, near ? 2.2 : 3.2), a = RR(0.25, near ? 0.9 : 0.55);
    const f = new BQ("bp", 800, 0.9);
    const i0 = Math.max(0, Math.floor((c - 3 * w) * SR)), i1 = Math.min(N, Math.floor((c + 3 * w) * SR));
    for (let n = i0; n < i1; n++) {
      const t = n / SR;
      if ((n & 127) === 0) f.set("bp", (near ? 1300 : 900) - 450 * Math.tanh((t - c) / w), 0.9);
      out[n] += f.p(white()) * a * gauss(t, c, w);
    }
  }
  const dist = new BQ("lp", near ? 4500 : 1700, 0.6);
  for (let n = 0; n < N; n++) out[n] = dist.p(out[n]);
  return out;
}

// Cellar: a boiler's rumble through the wall, a mains hum, a damp vent hiss
// and two pipe resonances — the hiss and pipes put in a hard, long room.
function genCellar(loop) {
  const N = secs(loop), out = new Float32Array(N), wet = new Float32Array(N);
  const br = new Brown(), rum = new BQ("lp", 110, 0.9), sw = new Slow(0.05, 0.5, 1);
  const pk = new Pink(), vent = new BQ("bp", 850, 0.45), vlp = new BQ("lp", 2400, 0.7), vs = new Slow(0.12, 0.6, 1);
  const p1 = new BQ("bp", 188, 5), p2 = new BQ("bp", 311, 6);
  for (let n = 0; n < N; n++) {
    const t = n / SR, w = white(), p = pk.p(w);
    const hum = (Math.sin(TAU * 50 * t) + 0.45 * Math.sin(TAU * 100 * t + 1) + 0.18 * Math.sin(TAU * 150 * t + 2)) * (0.85 + 0.15 * Math.sin(TAU * 0.3 * t));
    out[n] = rum.p(br.p(w)) * 1.1 * sw.next() + hum * 0.035;
    wet[n] = vlp.p(vent.p(w)) * 0.09 * vs.next() + p1.p(p) * 0.35 + p2.p(p) * 0.22;
  }
  mix(out, reverb(wet, { rt60: 1.8, damp: 0.45, wet: 0.55 }));
  return out;
}

// Warm clearing: breeze with grass shear — the blades add a fast flutter
// when the gust is up.
function genMeadowBreeze(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), lp = new BQ("lp", 500, 0.8), grass = new BQ("bp", 1800, 0.7), warm = new BQ("lp", 5500, 0.7);
  const g1 = new Slow(0.07), g2 = new Slow(0.25), g3 = new Slow(0.9);
  let gust = 0, fl = 0;
  for (let n = 0; n < N; n++) {
    if ((n & 63) === 0) {
      const g = clamp(0.5 * g1.next(64) + 0.35 * g2.next(64) + 0.15 * g3.next(64), 0, 1);
      gust = Math.pow(clamp((g - 0.22) / 0.56, 0, 1), 1.4);
      lp.set("lp", 350 + gust * 900, 0.8);
      grass.set("bp", 1500 + gust * 900, 0.7);
      fl = 10 + gust * 8;
    }
    const w = white();
    const flutter = 0.65 + 0.35 * Math.sin(TAU * fl * n / SR);
    out[n] = warm.p(lp.p(pk.p(w)) * Math.pow(0.08 + gust, 1.8) * 1.6 + grass.p(w) * Math.pow(gust, 1.8) * flutter * 0.7);
  }
  return out;
}

// Daytime insects: three cicadas (noise carrier, ~110 Hz pulse, songs that
// start and stop) and grasshopper click trains.
function genInsectsDay(loop) {
  const N = secs(loop), out = new Float32Array(N);
  // A far chorus that never stops (many cicadas blur into a shimmer) …
  { const bp = new BQ("bp", 5600, 1.2), sl = new Slow(0.1, 0.6, 1); for (let n = 0; n < N; n++) out[n] += bp.p(white()) * 0.12 * sl.next(); }
  // … and three near ones with songs of their own, staggered so the field is
  // never silent all at once.
  for (let k = 0; k < 3; k++) {
    const bp = new BQ("bp", RR(4800, 6600), 3), pr = RR(95, 130), amp = [0.5, 0.3, 0.2][k];
    let on = k === 0, next = (k === 0 ? RR(3, 6) : RR(1, 5) + k * 3) * SR, env = on ? 1 : 0;
    for (let n = 0; n < N; n++) {
      if (n >= next) { on = !on; next = n + (on ? RR(3, 7) : RR(2, 5)) * SR; }
      env += ((on ? 1 : 0) - env) * (on ? 0.00006 : 0.00012);
      // raised-cosine pulses: a buzz, not a click train
      const pulse = 0.5 - 0.5 * Math.cos(TAU * pr * n / SR);
      out[n] += bp.p(white()) * pulse * pulse * env * amp;
    }
  }
  const gcount = 7;
  for (let k = 0; k < gcount; k++) {
    const t0 = Math.floor(RR(0, loop + 1) * SR), dur = RR(0.8, 1.8), rate = RR(10, 14), bq = new BQ("bp", RR(6500, 8000), 2), a = RR(0.12, 0.25);
    for (let c = 0; c < dur * rate; c++) burst(out, t0 + Math.floor(c / rate * SR), 0.007, a, bq);
  }
  return out;
}
// Dusk insects: five crickets with their own pitch, chirp rhythm and
// distance; a tree cricket's long trills; a katydid now and then.
function genInsectsDusk(loop, glass) {
  const N = secs(loop), out = new Float32Array(N);
  for (let k = 0; k < 5; k++) {
    const f = RR(4000, 5300), per = RR(0.45, 1.1), amp = [0.45, 0.3, 0.22, 0.15, 0.1][k], pulses = 3 + Math.floor(R() * 2);
    let t = RR(0, per);
    while (t < loop + 2) {
      for (let p = 0; p < pulses; p++) {
        const t0 = Math.floor((t + p * 0.028) * SR), len = Math.floor(0.018 * SR);
        for (let i = 0; i < len && t0 + i < N; i++) {
          const e = Math.sin(Math.PI * i / len);
          out[t0 + i] += (Math.sin(TAU * f * i / SR) + 0.25 * Math.sin(TAU * 2 * f * i / SR)) * e * amp;
        }
      }
      t += per * RR(0.95, 1.05);
    }
  }
  { // tree cricket trill
    const f = RR(2600, 3200);
    let t = RR(0, 3);
    while (t < loop + 2) {
      const dur = RR(2, 4), t0 = Math.floor(t * SR), len = Math.floor(dur * SR);
      for (let i = 0; i < len && t0 + i < N; i++) {
        const env = Math.min(1, i / (0.5 * SR), (len - i) / (0.5 * SR));
        const pulse = 0.5 + 0.5 * Math.sin(TAU * 32 * i / SR);
        out[t0 + i] += Math.sin(TAU * f * i / SR) * pulse * env * 0.12;
      }
      t += dur + RR(3, 7);
    }
  }
  for (let k = 0; k < 5; k++) { // katydid
    const t0 = Math.floor(RR(0, loop + 1) * SR), bq = new BQ("bp", RR(7000, 9000), 3);
    for (let c = 0; c < 3; c++) burst(out, t0 + Math.floor(c * 0.11 * SR), 0.04, 0.25, bq);
  }
  if (glass) { const lp = new BQ("lp", 3600, 0.6); for (let n = 0; n < N; n++) out[n] = lp.p(out[n]); }
  return out;
}

// A house at night: the mains hum of something downstairs, the town very far
// off, the wind in the eaves. Quiet by design — the scene's own named sounds
// (creaks, the branch, the fridge) sit on top.
function genHouseNight(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), far = new BQ("lp", 170, 0.8), eaves = new BQ("lp", 380, 0.9), sl = new Slow(0.04, 0.4, 1), g = new Slow(0.08);
  for (let n = 0; n < N; n++) {
    const t = n / SR, p = pk.p(white());
    const hum = (Math.sin(TAU * 50 * t) + 0.4 * Math.sin(TAU * 100 * t + 0.7) + 0.15 * Math.sin(TAU * 150 * t)) * (0.9 + 0.1 * Math.sin(TAU * 0.2 * t));
    const gust = g.next();
    out[n] = hum * 0.05 + far.p(p) * 0.5 * sl.next() + eaves.p(p) * Math.pow(gust, 2) * 0.7;
  }
  return out;
}

// Ventilation in a small room: airflow, low turbulence and a slightly
// unbalanced fan.
function genVent(loop, { fan = 118, flow = 1100, level = 1 } = {}) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), air = new BQ("lp", flow, 0.7), turb = new BQ("lp", 250, 0.9), ts = new Slow(0.5, 0.5, 1);
  for (let n = 0; n < N; n++) {
    const t = n / SR, w = white();
    const wob = 1 + 0.004 * Math.sin(TAU * 0.11 * t);
    const tone = (Math.sin(TAU * fan * wob * t) + 0.4 * Math.sin(TAU * 2 * fan * wob * t) + 0.15 * Math.sin(TAU * 3 * fan * wob * t)) * (0.85 + 0.15 * Math.sin(TAU * 1.9 * t));
    out[n] = (air.p(w) * 0.5 + turb.p(pk.p(w)) * 0.9 * ts.next() + tone * 0.08) * level;
  }
  return out;
}
// Fluorescent tube: a 100 Hz buzz with a long harmonic tail, a ballast hiss,
// and the odd tick.
function genFluorescent(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const ph = []; for (let h = 1; h <= 16; h++) ph.push(R() * TAU);
  const hiss = new BQ("bp", 4200, 1), hs = new Slow(2, 0.6, 1);
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    let b = 0; for (let h = 1; h <= 16; h++) b += Math.sin(TAU * 100 * h * t + ph[h - 1]) / Math.pow(h, 1.25);
    out[n] = b * 0.09 * (0.9 + 0.1 * Math.sin(TAU * 0.5 * t)) + hiss.p(white()) * 0.03 * hs.next();
  }
  for (let k = 0; k < 9; k++) burst(out, Math.floor(RR(0, loop + 1) * SR), 0.006, 0.35, new BQ("bp", RR(3000, 6000), 2));
  return out;
}
// An office beyond a glass door: murmur in phrases, keyboards, one phone.
function genOfficeBeyond(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), glass = new BQ("lp", 650, 0.7), hv = new BQ("lp", 500, 0.7);
  // Two conversations, each in phrases (on 1–3 s, off 1–4 s) that swell and
  // fade over ~0.4 s, with their own syllable rhythm and formant drift. They
  // overlap, so the murmur breathes instead of switching.
  const talk = [0, 1].map((k) => ({ form: new BQ("bp", 450, 1.6), fl: new Slow(RR(0.4, 0.8), 280, 720), syl: new Slow(RR(3, 5), 0.3, 1), on: k === 0, next: RR(0.5, 3) * SR, env: 0, amp: k === 0 ? 0.55 : 0.35 }));
  for (let n = 0; n < N; n++) {
    const p = pk.p(white());
    let m = 0;
    for (const t of talk) {
      if (n >= t.next) { t.on = !t.on; t.next = n + (t.on ? RR(1, 3) : RR(1, 4)) * SR; }
      t.env += ((t.on ? 1 : 0) - t.env) * 0.00006;
      if ((n & 63) === 0) t.form.set("bp", t.fl.next(64), 1.6);
      m += t.form.p(p) * t.env * t.syl.next() * t.amp;
    }
    out[n] = glass.p(m) + hv.p(white()) * 0.1;
  }
  for (let k = 0; k < 8; k++) { // keyboard clusters
    const t0 = Math.floor(RR(0, loop + 1) * SR), count = 8 + Math.floor(R() * 12), rate = RR(8, 12), bq = new BQ("bp", 1600, 1.5), lp = new BQ("lp", 900, 0.7);
    for (let c = 0; c < count; c++) {
      const t = t0 + Math.floor(c / rate * SR * RR(0.8, 1.2)), len = Math.floor(0.005 * SR);
      for (let i = 0; i < len && t + i < N; i++) out[t + i] += lp.p(bq.p(white())) * 0.5 * (1 - i / len);
    }
  }
  { // one phone, two rings
    const t0 = Math.floor(RR(4, loop - 4) * SR), lp = new BQ("lp", 1200, 0.7);
    for (let r = 0; r < 2; r++) {
      const s = t0 + Math.floor(r * 2.0 * SR), len = Math.floor(0.9 * SR);
      for (let i = 0; i < len && s + i < N; i++) {
        const env = Math.min(1, i / (0.02 * SR), (len - i) / (0.05 * SR));
        const am = 0.5 + 0.5 * Math.sin(TAU * 20 * i / SR);
        out[s + i] += lp.p((Math.sin(TAU * 1000 * i / SR) + Math.sin(TAU * 1340 * i / SR)) * am) * env * 0.03;
      }
    }
  }
  return out;
}
// A lift at rest: fan, a cable/motor hum that wanders, a metal-box ring.
function genLiftCab(loop) {
  const N = secs(loop), out = genVent(loop, { fan: 96, flow: 900, level: 0.6 });
  const wand = new Slow(0.15, -1, 1), ring = new BQ("bp", 2300, 9), rs = new Slow(0.3, 0.3, 1);
  let ph = 0;
  for (let n = 0; n < N; n++) {
    const t = n / SR, f = 80 + wand.next();
    ph += TAU * f / SR;
    let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(ph * h) / h;
    out[n] += s * 0.05 + Math.sin(TAU * 100 * t) * 0.02 + Math.sin(TAU * 1100 * t) * (0.5 + 0.5 * Math.sin(TAU * 3 * t)) * 0.006 + ring.p(white()) * 0.05 * rs.next();
  }
  return out;
}
// The MRI room between scans: hard-room ventilation and the cold-head pump's
// knock once a second.
function genMriRoom(loop) {
  const N = secs(loop), out = genVent(loop, { fan: 140, flow: 1500, level: 0.7 });
  const knocks = new Float32Array(N);
  for (let t = 0.3; t < loop + 2; t += 1.02 * RR(0.995, 1.005)) {
    const t0 = Math.floor(t * SR);
    mode(knocks, t0, 1700, 0.025, 0.5); mode(knocks, t0, 3100, 0.014, 0.3);
    for (let i = 0; i < 0.04 * SR && t0 + i < N; i++) knocks[t0 + i] += Math.sin(TAU * (120 - 60 * i / (0.04 * SR)) * i / SR) * 0.6 * (1 - i / (0.04 * SR));
    const t1 = t0 + Math.floor(0.12 * SR);
    mode(knocks, t1, 1900, 0.015, 0.22);
  }
  mix(out, reverb(knocks, { rt60: 0.55, damp: 0.3, wet: 0.35 }));
  return out;
}

// A lake shore: waves that build, break and wash out at their own pace, a
// trickle of pebbles in the wash, and the constant far surf.
function genLakeShore(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), surf = new BQ("lp", 260, 0.8), ss = new Slow(0.05, 0.6, 1);
  for (let n = 0; n < N; n++) out[n] = surf.p(pk.p(white())) * 0.35 * ss.next();
  let t = RR(0, 2);
  while (t < loop + 2) {
    const build = RR(1.4, 2.4), wash = RR(3, 5), a = RR(0.5, 1), f = new BQ("lp", 800, 0.7);
    const t0 = Math.floor(t * SR), len = Math.floor((build + wash) * SR);
    for (let i = 0; i < len && t0 + i < N; i++) {
      const s = i / SR;
      let env, fc;
      if (s < build) { env = Math.pow(s / build, 2.2); fc = 500 + 1700 * (s / build); }
      else { const u = (s - build) / wash; env = Math.exp(-3.2 * u) * (1 - u * 0.3); fc = 2200 - 1600 * u; }
      if ((i & 63) === 0) f.set("lp", fc, 0.7);
      out[t0 + i] += f.p(white()) * env * a * 0.7;
      if (s > build && R() < 0.0008 * (1 - (s - build) / wash)) mode(out, t0 + i, RR(1500, 3200), 0.005, a * 0.22);
    }
    t += build + wash * RR(0.5, 0.9);
  }
  return out;
}
// A jet cabin: the engines' low body, air rush, the air-con's hiss, two
// beating tones and the faint N1 whine.
function genCabinJet(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const br = new Brown(), pk = new Pink(), low = new BQ("lp", 180, 0.9), rush = new BQ("lp", 900, 0.7), ac = new BQ("bp", 2800, 0.5), warm = new BQ("lp", 400, 0.7);
  const sw = new Slow(0.05, 0.7, 1), wn = new Slow(0.2, -0.003, 0.003);
  for (let n = 0; n < N; n++) {
    const t = n / SR, w = white();
    let s = 0; for (let h = 1; h <= 5; h++) s += (Math.sin(TAU * 84 * h * t) + Math.sin(TAU * 85.7 * h * t)) / h;
    out[n] = low.p(br.p(w)) * 1.1 * sw.next() + rush.p(pk.p(w)) * 0.45 + ac.p(w) * 0.18 + warm.p(s) * 0.07 + Math.sin(TAU * 1350 * (1 + wn.next()) * t) * 0.012;
  }
  return out;
}
// An airport gate: a big hall's murmur in a long reverb, luggage wheels, a
// far chime.
function genAirportGate(loop) {
  const N = secs(loop), wet = new Float32Array(N), out = new Float32Array(N);
  const pk = new Pink(), hv = new BQ("lp", 500, 0.7);
  const streams = [0, 1, 2].map(() => ({ bp: new BQ("bp", RR(380, 560), 1.4), syl: new Slow(RR(3, 5), 0.2, 1), ph: new Slow(0.3, 0.2, 1) }));
  for (let n = 0; n < N; n++) {
    const p = pk.p(white());
    let m = 0; for (const s of streams) m += s.bp.p(p) * s.syl.next() * s.ph.next();
    wet[n] = m * 0.9;
    out[n] = hv.p(white()) * 0.12;
  }
  for (let k = 0; k < 4; k++) { // luggage wheels
    const t0 = Math.floor(RR(0, loop) * SR), len = Math.floor(RR(1.2, 2.4) * SR), lp = new BQ("lp", 300, 0.9), br = new Brown();
    for (let i = 0; i < len && t0 + i < N; i++) wet[t0 + i] += lp.p(br.p(white())) * Math.sin(Math.PI * i / len) * 0.22 * (0.7 + 0.3 * Math.sin(TAU * 7 * i / SR));
  }
  { const t0 = Math.floor(RR(5, loop - 5) * SR); mode(wet, t0, 880, 0.5, 0.08); mode(wet, t0 + Math.floor(0.45 * SR), 1108, 0.6, 0.07); }
  mix(out, reverb(wet, { rt60: 2.8, damp: 0.5, wet: 0.6 }));
  return out;
}
// A clinic: ventilation, a tube, a fridge compressor that cycles, the
// corridor beyond the door.
function genClinic(loop) {
  const N = secs(loop), out = genVent(loop, { fan: 125, flow: 1000, level: 0.55 });
  const ph = []; for (let h = 1; h <= 10; h++) ph.push(R() * TAU);
  const fr = new BQ("lp", 160, 0.9), corr = new BQ("lp", 420, 0.8), pk = new Pink();
  for (let n = 0; n < N; n++) {
    const t = n / SR;
    let b = 0; for (let h = 1; h <= 10; h++) b += Math.sin(TAU * 100 * h * t + ph[h - 1]) / Math.pow(h, 1.3);
    const cyc = (t % 20) < 12 ? Math.min(1, (t % 20) / 0.6, (12 - (t % 20)) / 0.3) : 0;
    const fridge = fr.p(Math.sin(TAU * 50 * t) + 0.5 * Math.sin(TAU * 100 * t)) * cyc;
    out[n] += b * 0.03 + fridge * 0.07 + corr.p(pk.p(white())) * 0.06;
  }
  for (let k = 0; k < 3; k++) { // footsteps in the corridor
    const t0 = Math.floor(RR(0, loop) * SR), lp = new BQ("lp", 220, 0.9);
    for (let s = 0; s < 6; s++) burst(out, t0 + Math.floor(s * 0.52 * SR), 0.08, 0.5, lp);
  }
  return out;
}
// A large hall: HVAC rumble and the long, soft air of a big room.
function genHallLarge(loop) {
  const N = secs(loop), out = new Float32Array(N), wet = new Float32Array(N);
  const pk = new Pink(), br = new Brown(), lp = new BQ("lp", 520, 0.7), rum = new BQ("lp", 120, 0.9), hi = new BQ("hp", 1000, 0.7), sw = new Slow(0.04, 0.6, 1);
  for (let n = 0; n < N; n++) { const w = white(); out[n] = rum.p(br.p(w)) * 0.9 * sw.next(); wet[n] = lp.p(pk.p(w)) * 0.6 + hi.p(w) * 0.03; }
  mix(out, reverb(wet, { rt60: 3.5, damp: 0.5, wet: 0.5 }));
  return out;
}
// A car at idle, from the driver's seat: firing pulses through the body,
// exhaust, a faint alternator whine and the blower.
function genCarIdle(loop) {
  const N = secs(loop), out = new Float32Array(N);
  const body = new BQ("lp", 140, 1.4), ex = new BQ("lp", 90, 0.9), br = new Brown(), blow = new BQ("lp", 800, 0.7), cab = new BQ("lp", 1500, 0.7);
  const rpm = new Slow(0.3, 0.98, 1.02);
  let ph = 0, pulse = 0;
  for (let n = 0; n < N; n++) {
    const t = n / SR, f = 26.7 * rpm.next();
    ph += f / SR; if (ph >= 1) { ph -= 1; pulse = 1; }
    pulse *= 0.994;
    const w = white();
    const alt = Math.sin(TAU * 1400 * t) * (0.6 + 0.4 * Math.sin(TAU * f * t)) * 0.015;
    out[n] = cab.p(body.p(pulse * (0.8 + 0.2 * w)) * 1.4 + ex.p(br.p(w)) * 0.8 * (0.6 + 0.4 * pulse) + alt + blow.p(w) * 0.08 + Math.sin(TAU * 70 * t) * pulse * 0.2);
  }
  return out;
}
// A suburban yard through the window: far traffic, leaves in gusts, a far
// mower that comes and goes once; the dusk version swaps in crickets.
function genYard(loop, dusk) {
  const N = secs(loop), out = new Float32Array(N);
  const pk = new Pink(), far = new BQ("lp", 240, 0.8), leaves = new BQ("bp", 2000, 0.8), g = new Slow(0.1), sl = new Slow(0.05, 0.5, 1);
  for (let n = 0; n < N; n++) {
    const w = white(), gust = g.next();
    out[n] = far.p(pk.p(w)) * 0.45 * sl.next() + leaves.p(w) * gust * gust * (dusk ? 0.12 : 0.22);
  }
  if (!dusk) {
    const c = RR(10, loop - 10), lp = new BQ("lp", 500, 0.7);
    for (let n = 0; n < N; n++) {
      const t = n / SR, e = gauss(t, c, 6);
      if (e < 0.01) continue;
      let s = 0; for (let h = 1; h <= 6; h++) s += Math.sin(TAU * 95 * h * t) / h;
      out[n] += lp.p(s * (0.8 + 0.2 * Math.sin(TAU * 20 * t))) * e * 0.05;
    }
  } else {
    mix(out, genInsectsDusk(loop, true), 0.5);
  }
  const glass = new BQ("lp", 3000, 0.6);
  for (let n = 0; n < N; n++) out[n] = glass.p(out[n]);
  return out;
}

const LAYERS = {
  wind_low:      { loop: 20, gen: (l) => genWind(l, false),  note: "gentle outdoor wind" },
  wind_high:     { loop: 24, gen: (l) => genWind(l, true),   note: "exposed wind with whistle and flutter" },
  rain_glass:    { loop: 24, gen: genRainGlass,              note: "rain on a window, heard from inside" },
  rain_leaves:   { loop: 24, gen: genRainLeaves,             note: "rain outdoors on leaves" },
  city_far:      { loop: 40, gen: (l) => genCity(l, false),  note: "a city heard from high up" },
  city_near:     { loop: 40, gen: (l) => genCity(l, true),   note: "a street at pavement level" },
  cellar:        { loop: 24, gen: genCellar,                 note: "boiler, mains hum, vent and pipes in a hard room" },
  meadow_breeze: { loop: 24, gen: genMeadowBreeze,           note: "breeze through grass" },
  insects_day:   { loop: 40, gen: genInsectsDay,             note: "cicadas and grasshoppers" },
  insects_dusk:  { loop: 40, gen: (l) => genInsectsDusk(l, false), note: "crickets, a tree cricket, a katydid" },
  house_night:   { loop: 24, gen: genHouseNight,             note: "a house at night: hum, far town, eaves" },
  vent_small:    { loop: 20, gen: (l) => genVent(l),         note: "ventilation in a small room" },
  fluorescent:   { loop: 20, gen: genFluorescent,            note: "a fluorescent tube" },
  office_beyond: { loop: 40, gen: genOfficeBeyond,           note: "an office through a glass door" },
  lift_cab:      { loop: 20, gen: genLiftCab,                note: "a lift car at rest" },
  mri_room:      { loop: 20, gen: genMriRoom,                note: "the MRI room between scans" },
  lake_shore:    { loop: 40, gen: genLakeShore,              note: "waves on a lake shore" },
  cabin_jet:     { loop: 24, gen: genCabinJet,               note: "a jet cabin in cruise" },
  airport_gate:  { loop: 40, gen: genAirportGate,            note: "an airport gate hall" },
  clinic:        { loop: 40, gen: genClinic,                 note: "a clinic room" },
  hall_large:    { loop: 24, gen: genHallLarge,              note: "a large hall's air" },
  car_idle:      { loop: 20, gen: genCarIdle,                note: "a car at idle, from inside" },
  yard_day:      { loop: 40, gen: (l) => genYard(l, false),  note: "a suburban yard through glass, daytime" },
  yard_dusk:     { loop: 40, gen: (l) => genYard(l, true),   note: "the same yard at dusk, crickets" },
};

// ---------- main ----------
function main() {
  const want = process.argv.slice(2);
  const names = want.length ? want : Object.keys(LAYERS);
  for (const n of names) if (!LAYERS[n]) { console.error("unknown layer: " + n); process.exit(1); }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const manPath = path.join(OUT_DIR, "manifest.json");
  let man = { version: 1, credits: "", sr: ENCODE_SR, layers: {} };
  try { man = Object.assign(man, JSON.parse(fs.readFileSync(manPath, "utf8"))); } catch {}
  man.credits = "Environment beds synthesized from first principles by scripts/render-ambience.cjs (noise shaping, oscillators, modal resonators, Schroeder reverb). No recordings. CC0.";
  man.sr = ENCODE_SR;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lw-amb-"));
  const rows = [];
  for (const name of names) {
    const L = LAYERS[name];
    rnd = mulberry32(hash(name));                 // every render of a layer is identical
    const t0 = Date.now();
    const raw = L.gen(L.loop);
    const { pcm, rmsDb, peakDb } = finish(raw, L.loop);
    const wavPath = path.join(tmp, name + ".wav");
    fs.writeFileSync(wavPath, wav(pcm));
    const outPath = path.join(OUT_DIR, name + ".m4a");
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", wavPath, "-ac", "1", "-ar", String(ENCODE_SR),
      "-c:a", "aac", "-b:a", BITRATE, "-movflags", "+faststart", outPath]);
    if (process.env.KEEP_WAV) fs.copyFileSync(wavPath, path.join(OUT_DIR, name + ".wav"));
    const kb = Math.round(fs.statSync(outPath).size / 1024);
    man.layers[name] = { file: name + ".m4a", dur: L.loop, rms: +rmsDb.toFixed(1), peak: +peakDb.toFixed(1), note: L.note };
    rows.push([name, L.loop + " s", rmsDb.toFixed(1), peakDb.toFixed(1), kb + " KB", ((Date.now() - t0) / 1000).toFixed(1) + " s"]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  man.layers = Object.fromEntries(Object.keys(man.layers).sort().map((k) => [k, man.layers[k]]));
  fs.writeFileSync(manPath, JSON.stringify(man, null, 2) + "\n");
  const w = [14, 6, 7, 7, 8, 7];
  console.log(["layer", "loop", "rms dB", "peak dB", "size", "render"].map((s, i) => s.padEnd(w[i])).join(" "));
  for (const r of rows) console.log(r.map((s, i) => String(s).padEnd(w[i])).join(" "));
  console.log("→ " + path.relative(process.cwd(), manPath));
}
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
main();
