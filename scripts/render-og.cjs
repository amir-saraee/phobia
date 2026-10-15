#!/usr/bin/env node
// The social share card (og:image / twitter:image): Lanternwalk's title
// screen as a 1200×630 still. The valley and the lantern glyph aren't copied
// here — they're lifted out of the app's own source (valleyHeroSVG in
// src/app/views-journey.js, brandLamp in src/app/router.js), so a change to
// the title screen shows up in the card the next time this runs.
//
// Usage:  node scripts/render-og.cjs [out.png]     (default: og-lanternwalk.png)
// Needs Google Chrome (override with CHROME=/path/to/chrome) and
// `npm install` in scripts/ (puppeteer-core).
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "og-lanternwalk.png"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const W = 1200, H = 630;

// A top-level declaration out of an app file, from its first line to the
// closing brace at column 0.
function lift(file, start) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const a = src.indexOf(start);
  const b = a < 0 ? -1 : src.indexOf("\n}\n", a);
  if (b < 0) throw new Error(`render-og: "${start}" not found in ${file} — did it move?`);
  return src.slice(a, b + 2);
}
const { valleyHeroSVG, brandLamp } = vm.runInNewContext(
  `${lift("src/app/views-journey.js", "const VALLEY_KEYS")}
   ${lift("src/app/router.js", "function brandLamp()")}
   ({ valleyHeroSVG, brandLamp })`);

// Two realms walked, the third waiting: lit enough to read as a place with a
// story in it, dark enough that there's somewhere left to go. The window
// sits the lantern path on the right third, the words on the left, and the
// portrait-phone moon (the wide one falls off the edge) above the path.
const valley = valleyHeroSVG({ lit: ["dogs", "spiders"], next: "snakes" })
  .replace(/viewBox="[^"]*"/, 'viewBox="40 150 1100 577.5"')
  .replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMid slice"');

const SERIF = `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`;
const SANS = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Inter, sans-serif`;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #050816; }
  .card { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
  .valley-hero { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

  /* The title screen's lantern states, held still (no flicker in a PNG). */
  .vh-glass { fill: rgba(18, 22, 38, .85); }
  .vh-flame { fill: #ffcf6e; opacity: 0; }
  .vh-glow { opacity: 0; }
  .vh-lantern.on .vh-glass { fill: rgba(255, 214, 140, .32); }
  .vh-lantern.on .vh-flame { opacity: 1; }
  .vh-lantern.on .vh-glow { opacity: .95; }
  .vh-lantern.waiting .vh-glow { opacity: .3; }
  .vh-lantern.waiting .vh-flame { opacity: .5; }
  .vh-fly { fill: #ffe7a3; opacity: .7; }
  .vh-moon-w { display: none; }
  /* The crescent's bite is a sky-coloured disc; at this window it has to
     match the sky right around it, or it shows as a ghost full moon. */
  .vh-moon-n circle:last-child { fill: #0c122d; }

  /* Words sit on the left; the scrim only darkens where they are. */
  .scrim { position: absolute; inset: 0;
    background:
      linear-gradient(to right, rgba(5, 8, 22, .78) 0%, rgba(5, 8, 22, .5) 38%, rgba(5, 8, 22, 0) 62%),
      linear-gradient(to top, rgba(5, 8, 22, .55) 0%, rgba(5, 8, 22, 0) 30%); }
  .copy { position: absolute; left: 76px; top: 128px; width: 600px; }
  .lw-mark { display: flex; align-items: center; gap: .2em; margin: 0;
    font: 700 96px/1 ${SERIF}; letter-spacing: -.01em; color: #fbf1dc;
    text-shadow: 0 0 40px rgba(255, 186, 92, .4), 0 4px 24px rgba(0, 0, 0, .6); }
  .lw-lamp { width: 1em; height: 1.33em; flex: 0 0 auto; font-size: .62em; color: #f3d9a4;
    filter: drop-shadow(0 0 10px rgba(255, 190, 90, .65)); }
  .fa { margin: 14px 0 0 4px; font: 600 26px/1.2 ${SANS}; color: #f3d9a4; opacity: .82;
    direction: rtl; text-align: left; unicode-bidi: isolate; }
  .tagline { margin: 34px 0 0; font: 650 42px/1.18 ${SANS}; color: #eef2ff;
    text-shadow: 0 3px 20px rgba(0, 0, 0, .75); }
  .sub { margin: 16px 0 0; font: 400 25px/1.3 ${SANS}; color: #f3d9a4; opacity: .92;
    text-shadow: 0 2px 14px rgba(0, 0, 0, .7); }
  .foot { position: absolute; left: 80px; bottom: 40px; margin: 0;
    font: 500 19px/1 ${SANS}; letter-spacing: .02em; color: rgba(226, 232, 255, .62); }
</style></head><body><div class="card">
  ${valley}
  <div class="scrim"></div>
  <div class="copy">
    <div class="lw-mark">${brandLamp()}<span>Lanternwalk</span></div>
    <p class="fa" lang="fa">فانوس‌به‌دست</p>
    <p class="tagline">Every fear is a path<br>you stopped walking.</p>
    <p class="sub">Light it again — one small step at a time.</p>
  </div>
  <p class="foot">dogs · spiders · snakes · heights · the dark · tight spaces</p>
</div></body></html>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: OUT, type: "png", clip: { x: 0, y: 0, width: W, height: H } });
  } finally {
    await browser.close();
  }
  const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log(`render-og: ${path.relative(process.cwd(), OUT)} — ${W}×${H}, ${kb} KB`);
})().catch((e) => { console.error(e); process.exit(1); });
