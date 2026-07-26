#!/usr/bin/env node
// Pre-renders every static therapist line to a small AAC clip with the
// Kokoro-82M neural TTS (kokoro-js, Apache-2.0 — audio is safe to ship),
// so the app ships ONE consistent, natural calm voice instead of whatever
// TTS the user's browser happens to have. Re-run after editing any spoken
// line:
//
//   node scripts/generate-voice.mjs            # render new/changed lines
//   node scripts/generate-voice.mjs --dry-run  # list lines without rendering
//
// Output: assets/voice/<sha1-10>.m4a + assets/voice/manifest.json keyed by the
// EXACT (whitespace-normalized) line text. Lines built from template strings
// at runtime aren't in the manifest and automatically fall back to live TTS.
//
// Emotional register is baked into the audio: lines from the narrator's
// panic/threatened banks (and speak(...{urgent:true}) sites) render slightly
// faster; habituation praise and bumpTrust reasons render slower and softer.
// The client needs no knowledge of this — it just plays the clip.
//
// First run downloads the ~160 MB fp16 model to the HF cache; offline after.
// (A future Farsi pack can render the same way via Piper + the MIT-licensed
// fa_IR "Mana" model into assets/voice/fa/ — kokoro has no Persian.)

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { KokoroTTS } from "kokoro-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "assets", "voice");
const VOICE = "af_heart";      // kokoro voice id (see tts.list_voices())
const BITRATE = 40000;         // mono AAC; ~5 KB/s
const DRY = process.argv.includes("--dry-run");

// words/min is gone — kokoro takes a speed multiplier around 1.0.
const REGISTERS = {
  calm:   0.88,                // default guide voice — unhurried
  urgent: 1.0,                 // panic support: present, not sleepy
  praise: 0.82,                // habituation/credit beats: warm, slow
};

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

// ---- 1. Structured tables (pure literals — safe to eval in isolation) ----
function extractLiteral(startMarker, openChar, closeChar) {
  const at = html.indexOf(startMarker);
  if (at < 0) throw new Error("marker not found: " + startMarker);
  const open = html.indexOf(openChar, at);
  let depth = 0, i = open;
  for (; i < html.length; i++) {
    const ch = html[i];
    if (ch === openChar) depth++;
    else if (ch === closeChar) { depth--; if (depth === 0) break; }
  }
  return html.slice(open, i + 1);
}

const lines = new Map();       // text -> register
const push = (s, register = "calm") => {
  const t = String(s).replace(/\s+/g, " ").trim();
  if (!t) return;
  // Urgent wins over calm, praise wins over calm; first non-calm sticks.
  const prev = lines.get(t);
  if (!prev || prev === "calm") lines.set(t, register);
};

// VOICE_LINES: { phobia: [ [line, line], ... ] }
const voiceLines = eval("(" + extractLiteral("const VOICE_LINES =", "{", "}") + ")");
for (const rungs of Object.values(voiceLines))
  for (const rung of rungs)
    for (const l of rung) push(l);

// PhobiaNarrator banks: first `const lines = {` after the PhobiaNarrator marker.
// Bucket names carry the emotional register.
{
  const at = html.indexOf("const PhobiaNarrator");
  const sub = html.slice(at);
  const open = sub.indexOf("const lines = {");
  const lit = (() => {
    let depth = 0, i = sub.indexOf("{", open);
    const start = i;
    for (; i < sub.length; i++) {
      if (sub[i] === "{") depth++;
      else if (sub[i] === "}") { depth--; if (depth === 0) break; }
    }
    return sub.slice(start, i + 1);
  })();
  const banks = eval("(" + lit + ")");
  for (const scene of Object.values(banks))
    for (const [bucket, bank] of Object.entries(scene)) {
      const reg = /panic|threat/i.test(bucket) ? "urgent"
                : /habitu/i.test(bucket) ? "praise" : "calm";
      for (const l of bank) push(l, reg);
    }
}

// Grounding script: [{ text, duration }, ...]
{
  const lit = extractLiteral("const groundingScript = [", "[", "]");
  for (const step of eval("(" + lit + ")")) push(step.text, "urgent");
}

// ---- 2. Inline literals: every string inside a speak(...) argument list ----
// Walks to the matching close-paren so ternaries — speak(x ? "a" : "b") —
// and multi-line calls are captured too, not just speak("literal".
// Config-ish short tokens (no space, <15 chars) are skipped.
{
  const re = /\b(?:speak|say)\(\s*/g;
  let m;
  while ((m = re.exec(html))) {
    let depth = 1, i = re.lastIndex, inStr = false, esc = false, cur = "";
    const found = [];
    for (; i < html.length && depth > 0 && i < re.lastIndex + 1200; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) { cur += ch; esc = false; }
        else if (ch === "\\") esc = true;
        else if (ch === '"') { inStr = false; found.push(cur); }
        else cur += ch;
      } else {
        if (ch === '"') { inStr = true; cur = ""; }
        else if (ch === "(") depth++;
        else if (ch === ")") depth--;
      }
    }
    const window = html.slice(re.lastIndex, i);
    const reg = /urgent\s*:\s*true/.test(window) ? "urgent" : "calm";
    for (const s of found) {
      if (!s.includes(" ") && s.length < 15) continue; // option values, keys
      push(s, reg);
    }
  }
}
// bumpTrust(kind, "reason") — the reason string is spoken via speak(reason).
for (const m of html.matchAll(/\bbumpTrust\(\s*"[^"]*"\s*,\s*"((?:[^"\\]|\\.)*)"/g)) {
  push(m[1].replace(/\\"/g, '"'), "praise");
}

// ---- 3. Render ----
const all = [...lines.keys()].sort();
console.log(`${all.length} unique lines`);
if (DRY) { all.forEach(l => console.log(`  • [${lines.get(l)}]`, l)); process.exit(0); }

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = { version: 2, voice: `kokoro:${VOICE}`, rate: null, files: {} };
let rendered = 0, reused = 0;

const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "fp16" });

for (const text of all) {
  const register = lines.get(text);
  const speed = REGISTERS[register];
  // Voice + register are part of the identity: changing either re-renders.
  const hash = createHash("sha1").update(`${VOICE}@${speed}|${text}`).digest("hex").slice(0, 10);
  const file = hash + ".m4a";
  const outPath = path.join(OUT_DIR, file);
  manifest.files[text] = file;
  if (fs.existsSync(outPath)) { reused++; continue; }
  const wav = path.join(OUT_DIR, hash + ".wav");
  const audio = await tts.generate(text, { voice: VOICE, speed });
  await audio.save(wav);
  execFileSync("afconvert", [wav, outPath, "-f", "m4af", "-d", "aac", "-b", String(BITRATE), "-c", "1"]);
  fs.unlinkSync(wav);
  rendered++;
  if (rendered % 25 === 0) console.log(`  …${rendered} rendered`);
}

// Drop orphaned clips from deleted lines so the folder never grows stale.
const wanted = new Set(Object.values(manifest.files));
let pruned = 0;
for (const f of fs.readdirSync(OUT_DIR)) {
  if (f.endsWith(".m4a") && !wanted.has(f)) { fs.unlinkSync(path.join(OUT_DIR, f)); pruned++; }
}

fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 1));
const totalKB = Math.round(
  fs.readdirSync(OUT_DIR).reduce((s, f) => s + fs.statSync(path.join(OUT_DIR, f)).size, 0) / 1024
);
console.log(`rendered ${rendered}, reused ${reused}, pruned ${pruned} → assets/voice/ (${totalKB} KB total)`);
