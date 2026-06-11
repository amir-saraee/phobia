#!/usr/bin/env node
// Pre-renders every static therapist line to a small AAC clip using macOS
// `say` + `afconvert`, so the app ships ONE consistent calm voice instead of
// whatever TTS the user's browser happens to have. Re-run after editing any
// spoken line:
//
//   node scripts/generate-voice.mjs            # render new/changed lines
//   node scripts/generate-voice.mjs --dry-run  # list lines without rendering
//
// Output: assets/voice/<sha1-10>.m4a + assets/voice/manifest.json keyed by the
// EXACT (whitespace-normalized) line text. Lines built from template strings
// at runtime aren't in the manifest and automatically fall back to live TTS.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "assets", "voice");
const VOICE = "Samantha";
const RATE = 152;              // words/min — calm but not sleepy
const BITRATE = 40000;         // mono AAC; ~5 KB/s
const DRY = process.argv.includes("--dry-run");

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

const lines = new Set();
const push = (s) => {
  const t = String(s).replace(/\s+/g, " ").trim();
  if (t) lines.add(t);
};

// VOICE_LINES: { phobia: [ [line, line], ... ] }
const voiceLines = eval("(" + extractLiteral("const VOICE_LINES =", "{", "}") + ")");
for (const rungs of Object.values(voiceLines))
  for (const rung of rungs)
    for (const l of rung) push(l);

// PhobiaNarrator banks: first `const lines = {` after the PhobiaNarrator marker
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
    for (const bucket of Object.values(scene))
      for (const l of bucket) push(l);
}

// Grounding script: [{ text, duration }, ...]
{
  const lit = extractLiteral("const groundingScript = [", "[", "]");
  for (const step of eval("(" + lit + ")")) push(step.text);
}

// ---- 2. Inline literals: PhobiaVoice.speak("...") / V.speak("...") ----
for (const m of html.matchAll(/\bspeak\(\s*"((?:[^"\\]|\\.)*)"/g)) {
  push(m[1].replace(/\\"/g, '"'));
}

// ---- 3. Render ----
const all = [...lines].sort();
console.log(`${all.length} unique lines`);
if (DRY) { all.forEach(l => console.log("  •", l)); process.exit(0); }

fs.mkdirSync(OUT_DIR, { recursive: true });
const manifest = { version: 1, voice: VOICE, rate: RATE, files: {} };
let rendered = 0, reused = 0;

for (const text of all) {
  const hash = createHash("sha1").update(text).digest("hex").slice(0, 10);
  const file = hash + ".m4a";
  const outPath = path.join(OUT_DIR, file);
  manifest.files[text] = file;
  if (fs.existsSync(outPath)) { reused++; continue; }
  // Breathing room at sentence boundaries — the recorded equivalent of the
  // live-TTS queue's breath gaps.
  const paced = text
    .replace(/([.!?]) +/g, "$1 [[slnc 380]] ")
    .replace(/ — /g, " [[slnc 220]] — ");
  const aiff = path.join(OUT_DIR, hash + ".aiff");
  execFileSync("say", ["-v", VOICE, "-r", String(RATE), "-o", aiff, paced]);
  execFileSync("afconvert", [aiff, outPath, "-f", "m4af", "-d", "aac", "-b", String(BITRATE), "-c", "1"]);
  fs.unlinkSync(aiff);
  rendered++;
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
