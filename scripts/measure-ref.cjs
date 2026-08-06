#!/usr/bin/env node
/**
 * Overlay a 5% measurement grid on a reference image so landmarks can be
 * read off as exact fractions (the bake scripts register on those numbers).
 *
 * Usage: node measure-ref.cjs <image.png> [out.png]
 * Default output: <image>.grid.png next to the input.
 */
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const SRC = process.argv[2];
if (!SRC) { console.error("usage: node measure-ref.cjs <image.png> [out.png]"); process.exit(1); }
const DST = process.argv[3] || SRC.replace(/\.png$/i, "") + ".grid.png";

const png = PNG.sync.read(fs.readFileSync(SRC));
const { width: W, height: H, data } = png;

// 4x5 pixel font for digits 0-9 (rows of 4 bits)
const FONT = {
  "0": [0b1111, 0b1001, 0b1001, 0b1001, 0b1111],
  "1": [0b0010, 0b0110, 0b0010, 0b0010, 0b0111],
  "2": [0b1111, 0b0001, 0b1111, 0b1000, 0b1111],
  "3": [0b1111, 0b0001, 0b0111, 0b0001, 0b1111],
  "4": [0b1001, 0b1001, 0b1111, 0b0001, 0b0001],
  "5": [0b1111, 0b1000, 0b1111, 0b0001, 0b1111],
  "6": [0b1111, 0b1000, 0b1111, 0b1001, 0b1111],
  "7": [0b1111, 0b0001, 0b0010, 0b0100, 0b0100],
  "8": [0b1111, 0b1001, 0b1111, 0b1001, 0b1111],
  "9": [0b1111, 0b1001, 0b1111, 0b0001, 0b1111],
  ".": [0b0000, 0b0000, 0b0000, 0b0000, 0b0010],
};

function setPx(x, y, r, g, b) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
}

function drawText(x, y, text, r, g, b, scale = 2) {
  for (const ch of text) {
    const glyph = FONT[ch];
    if (glyph) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 4; col++) {
          if (glyph[row] & (1 << (3 - col))) {
            for (let sy = 0; sy < scale; sy++)
              for (let sx = 0; sx < scale; sx++)
                setPx(x + col * scale + sx, y + row * scale + sy, r, g, b);
          }
        }
      }
    }
    x += 5 * scale;
  }
}

// Grid every 5%: faint red lines, solid red every 25%, labels on the 10% lines.
for (let p = 5; p < 100; p += 5) {
  const major = p % 25 === 0;
  const x = Math.round((p / 100) * (W - 1));
  const y = Math.round((p / 100) * (H - 1));
  for (let yy = 0; yy < H; yy += major ? 1 : 3) setPx(x, yy, 255, 60, 60);
  for (let xx = 0; xx < W; xx += major ? 1 : 3) setPx(xx, y, 255, 60, 60);
  if (p % 10 === 0) {
    const label = (p / 100).toFixed(1);
    drawText(x + 4, 4, label, 255, 255, 0);
    drawText(4, y + 4, label, 255, 255, 0);
  }
}

fs.writeFileSync(DST, PNG.sync.write(png));
console.log("grid →", DST);
