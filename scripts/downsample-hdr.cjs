// Downsample a Radiance .hdr (RGBE, flat or RLE scanlines) by an integer
// factor with a box filter in linear light, and write it back as RLE RGBE.
// The PMREM the game builds from the sky is 256² per face, so a 512×256
// equirect lights the scene the same as the 1024×512 original at a third of
// the bytes and a shorter first-frame PMREM pass.
//
//   node scripts/downsample-hdr.cjs assets/env/meadow_1k.hdr assets/env/meadow_512.hdr 2
"use strict";
const fs = require("fs");
const [src, dst, factorArg] = process.argv.slice(2);
if (!src || !dst) { console.error("usage: node downsample-hdr.cjs <in.hdr> <out.hdr> [factor=2]"); process.exit(1); }
const F = Math.max(1, parseInt(factorArg || "2", 10));
const buf = fs.readFileSync(src);

// ---- header ----
let pos = 0;
const lines = [];
for (;;) {
  const nl = buf.indexOf(0x0a, pos);
  if (nl < 0) throw new Error("no header end");
  const line = buf.subarray(pos, nl).toString("latin1");
  pos = nl + 1;
  if (line === "" && lines.length) break;   // blank line ends the header
  lines.push(line);
}
const resLine = buf.subarray(pos, buf.indexOf(0x0a, pos)).toString("latin1");
pos = buf.indexOf(0x0a, pos) + 1;
const rm = /^-Y (\d+) \+X (\d+)$/.exec(resLine.trim());
if (!rm) throw new Error("unsupported orientation: " + resLine);
const H = +rm[1], W = +rm[2];
if (!lines.some((l) => /^FORMAT=32-bit_rle_rgbe$/.test(l))) throw new Error("not 32-bit_rle_rgbe");

// ---- pixels (RGBE bytes) ----
const rgbe = new Uint8Array(W * H * 4);
let out = 0;
for (let y = 0; y < H; y++) {
  // New-style RLE scanline: 2,2,hi,lo then four channel-planes, each RLE.
  if (W >= 8 && W < 0x8000 && buf[pos] === 2 && buf[pos + 1] === 2 && ((buf[pos + 2] << 8) | buf[pos + 3]) === W) {
    pos += 4;
    const line = new Uint8Array(W * 4);
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < W) {
        let n = buf[pos++];
        if (n > 128) { n -= 128; const v = buf[pos++]; for (let k = 0; k < n; k++) line[(x++) * 4 + c] = v; }
        else { for (let k = 0; k < n; k++) line[(x++) * 4 + c] = buf[pos++]; }
      }
      if (x !== W) throw new Error("scanline overrun at row " + y);
    }
    rgbe.set(line, out); out += W * 4;
  } else {
    // Flat (or old-style RLE, which this sky does not use).
    rgbe.set(buf.subarray(pos, pos + W * 4), out); pos += W * 4; out += W * 4;
  }
}

// ---- RGBE → float, box filter, float → RGBE ----
const W2 = Math.floor(W / F), H2 = Math.floor(H / F);
const outRgbe = new Uint8Array(W2 * H2 * 4);
const acc = new Float64Array(3);
for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
  acc[0] = acc[1] = acc[2] = 0;
  for (let dy = 0; dy < F; dy++) for (let dx = 0; dx < F; dx++) {
    const i = ((y * F + dy) * W + (x * F + dx)) * 4;
    const e = rgbe[i + 3];
    if (e) { const s = Math.pow(2, e - 136); acc[0] += rgbe[i] * s; acc[1] += rgbe[i + 1] * s; acc[2] += rgbe[i + 2] * s; }
  }
  const inv = 1 / (F * F);
  const r = acc[0] * inv, g = acc[1] * inv, b = acc[2] * inv;
  const m = Math.max(r, g, b);
  const o = (y * W2 + x) * 4;
  if (m < 1e-32) { outRgbe[o] = outRgbe[o + 1] = outRgbe[o + 2] = outRgbe[o + 3] = 0; continue; }
  const e = Math.ceil(Math.log2(m)) ;           // frexp-style exponent so mantissas land in [128,256)
  const s = 256 / Math.pow(2, e);
  outRgbe[o] = Math.min(255, Math.floor(r * s));
  outRgbe[o + 1] = Math.min(255, Math.floor(g * s));
  outRgbe[o + 2] = Math.min(255, Math.floor(b * s));
  outRgbe[o + 3] = e + 128;
}

// ---- write: header + RLE scanlines ----
const parts = [Buffer.from(`#?RADIANCE\nGAMMA=1\nFORMAT=32-bit_rle_rgbe\n\n-Y ${H2} +X ${W2}\n`, "latin1")];
for (let y = 0; y < H2; y++) {
  const bytes = [2, 2, (W2 >> 8) & 0xff, W2 & 0xff];
  for (let c = 0; c < 4; c++) {
    const plane = new Uint8Array(W2);
    for (let x = 0; x < W2; x++) plane[x] = outRgbe[(y * W2 + x) * 4 + c];
    let x = 0;
    while (x < W2) {
      // Run?
      let run = 1;
      while (x + run < W2 && run < 127 && plane[x + run] === plane[x]) run++;
      if (run >= 4) { bytes.push(128 + run, plane[x]); x += run; continue; }
      // Literal: up to 128 bytes, stop before a run of 4+.
      let n = 0;
      while (x + n < W2 && n < 128) {
        if (x + n + 3 < W2 && plane[x + n] === plane[x + n + 1] && plane[x + n] === plane[x + n + 2] && plane[x + n] === plane[x + n + 3]) break;
        n++;
      }
      bytes.push(n); for (let k = 0; k < n; k++) bytes.push(plane[x + k]); x += n;
    }
  }
  parts.push(Buffer.from(bytes));
}
fs.writeFileSync(dst, Buffer.concat(parts));
console.log(`${src} ${W}x${H} → ${dst} ${W2}x${H2}  ${(fs.statSync(src).size / 1024).toFixed(0)} KB → ${(fs.statSync(dst).size / 1024).toFixed(0)} KB`);
