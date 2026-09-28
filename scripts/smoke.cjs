// Launch smoke test — plays the real game in headless Chrome and fails on any
// page error or broken step. Runs before every push (.githooks/pre-push) and
// by hand:  node scripts/smoke.cjs        (SMOKE_SHOTS=1 keeps screenshots)
//
// It serves the repo itself on a free port (no dev server needed), then:
//   1. first run: consent → Step inside → creator → straight to trial 1's gate
//   2. trial 1: walk to the dog, stay until the alarm settles, rate, complete
//   3. the hardest trial mounts and runs
//   4. launch scope: a closed realm shows "coming soon"; ?all=1 opens it
//   5. Persian: the realm page renders RTL with translated trial names
//   6. phone viewport: landing + creator render with no sideways scroll
// Needs Google Chrome (override with CHROME=/path/to/chrome) and
// `npm install` in scripts/ (puppeteer-core).
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SHOTS = process.env.SMOKE_SHOTS ? path.join(ROOT, ".smoke-shots") : null;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".gltf": "model/gltf+json", ".glb": "model/gltf-binary", ".bin": "application/octet-stream",
  ".hdr": "application/octet-stream", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".wasm": "application/wasm", ".txt": "text/plain",
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p.endsWith("/")) p += "index.html";
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT) || /[\\/]\.(git|claude)[\\/]/.test(file)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

const results = [];
let failed = false;
function check(name, ok, detail = "") {
  results.push(`${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
  if (!ok) failed = true;
}

async function newPage(browser, { mobile = false } = {}) {
  const ctx = await browser.createBrowserContext();   // fresh storage per flow
  const page = await ctx.newPage();
  await page.setViewport(mobile
    ? { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { width: 1280, height: 800 });
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push("pageerror: " + String(e).slice(0, 300)));
  page.on("console", (m) => { if (m.type() === "error") page.errors.push("console: " + m.text().slice(0, 300)); });
  page.on("requestfailed", (r) => {
    const u = r.url();
    if (u.startsWith("http://127.0.0.1") && !/favicon/.test(u)) page.errors.push("request failed: " + u.replace(/^http:\/\/127\.0\.0\.1:\d+/, ""));
  });
  return { ctx, page };
}
async function shot(page, name) { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + ".png") }); } }
async function click(page, q) {
  return page.evaluate((q) => {
    let el = null; try { el = document.querySelector(q); } catch {}
    if (!el) el = [...document.querySelectorAll("button, a, [role=button]")].find((b) => b.offsetParent !== null && b.textContent.trim().toLowerCase().includes(q.toLowerCase()));
    if (!el) return false;
    el.click(); return true;
  }, q);
}
async function waitFor(page, fn, ms, arg) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await page.evaluate(fn, arg)) return true; } catch {}
    await sleep(250);
  }
  return false;
}
const hash = (page) => page.evaluate(() => location.hash);

async function firstRunAndTrial(browser, base) {
  const { ctx, page } = await newPage(browser);
  await page.goto(base + "/", { waitUntil: "load" });
  check("landing: consent gate shows", await waitFor(page, () => !!document.querySelector(".consent-overlay"), 8000));
  await click(page, "I understand");
  check("landing: 'Step inside' after consent", await waitFor(page, () => [...document.querySelectorAll("button")].some((b) => /step inside/i.test(b.textContent)), 5000));
  await click(page, "Step inside");
  check("creator: renders with a 3D stage", await waitFor(page, () => location.hash === "#/traveler" && !!document.querySelector("#travelerStage canvas"), 8000));
  await shot(page, "01-creator");
  await page.evaluate(() => { const i = document.getElementById("twName"); i.value = "Smoke"; i.dispatchEvent(new Event("input", { bubbles: true })); });
  await click(page, "Walk in");
  await sleep(600);
  check("first run: creator goes straight to trial 1's gate", (await hash(page)) === "#/dogs/predict/0", await hash(page));
  await page.evaluate(() => { const c = document.querySelector('[data-action="pick-fear"][data-fear="bite"]') || document.querySelector('[data-action="pick-fear"]'); c && c.click(); });
  await click(page, "Enter the trial");
  check("trial 1: scene mounts", await waitFor(page, () => !!(window.__active && window.__active.scene && window.__dogCoach), 15000));
  await sleep(3500);
  for (let k = 0; k < 4; k++) { if (!(await click(page, ".tour-actions button:last-child"))) break; await sleep(300); }
  const tourCards = await page.evaluate(() => document.querySelectorAll(".tour-card").length);
  check("trial 1: tour dismissed", tourCards === 0);
  await shot(page, "02-trial-start");
  // Walk to the dog like a player: face it, hold W until ~2.4 m.
  await page.keyboard.down("KeyW");
  const t0 = Date.now(); let dist = 99;
  while (Date.now() - t0 < 12000) {
    dist = await page.evaluate(() => {
      const A = window.__active; let dog = null;
      A.scene.traverse((o) => { if (!dog && o.userData && o.userData.parts && o.userData.parts.mixer && o.userData.parts.model) dog = o; });
      if (!dog) return 99;
      const c = A.controls, dx = dog.position.x - c.position.x, dz = dog.position.z - c.position.z;
      c.yaw = c._yawT = Math.atan2(-dx, -dz);
      return Math.hypot(dx, dz);
    });
    if (dist < 2.4) break;
    await sleep(100);
  }
  await page.keyboard.up("KeyW");
  check("trial 1: player can walk to the dog", dist < 2.6, `${dist.toFixed(2)} m`);
  // Stay; answer read-the-dog prompts; wait for the hold policy to be met.
  const met = await (async () => {
    const tEnd = Date.now() + 60000;
    while (Date.now() < tEnd) {
      await page.evaluate(() => {
        const C = window.__dogCoach; if (!C || !C.readId) return;
        const b = document.querySelector('.dc-read .dc-opt[data-c="calm"]'); b && b.click();
      });
      if (await page.evaluate(() => /ready|continue/i.test((document.getElementById("continueBtn") || {}).textContent || ""))) return true;
      await sleep(1000);
    }
    return false;
  })();
  check("trial 1: staying completes it (alarm settles)", met);
  await shot(page, "03-trial-met");
  await click(page, "#continueBtn");
  check("rate page renders", await waitFor(page, () => /#\/dogs\/rate\/0/.test(location.hash) && !!document.getElementById("sudsPeak"), 6000), await hash(page));
  await page.evaluate(() => {
    document.querySelectorAll('input[type="range"]').forEach((r) => { r.value = "3"; r.dispatchEvent(new Event("input", { bubbles: true })); r.dispatchEvent(new Event("change", { bubbles: true })); });
  });
  await click(page, "#rateSubmit");
  await sleep(1500);
  // A reality check may sit between rate and complete; step through it.
  for (let i = 0; i < 3 && !/\/done\//.test(await hash(page)); i++) {
    await page.evaluate(() => { const b = [...document.querySelectorAll("button.btn-primary")].find((x) => x.offsetParent); b && b.click(); });
    await sleep(1200);
  }
  check("complete page renders", /#\/dogs\/done\/0/.test(await hash(page)), await hash(page));
  check("complete: primer + Mirror offered after trial 1", await page.evaluate(() => !!document.querySelector(".first-next [data-action='open-primer']")));
  check("complete: feedback link present", await page.evaluate(() => !!document.querySelector(".fb-after [data-action='open-feedback']")));
  await shot(page, "04-complete");
  await page.evaluate(() => document.querySelector(".fb-after [data-action='open-feedback']").click());
  check("feedback box opens", await waitFor(page, () => !!document.querySelector(".fb-modal textarea"), 2000));
  check("first run + trial 1: no page errors", page.errors.length === 0, page.errors.slice(0, 5).join(" | "));
  await ctx.close();
}

async function hardestTrial(browser, base) {
  const { ctx, page } = await newPage(browser);
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem("fobia.consent.v1")) return;
    const c = { id: "c-smoke", name: "Smoke", bodyType: "man", skinTone: "tan", hairColor: "black", hairStyle: "short", topColor: "navy", topStyle: "tee", eyeColor: "brown", glasses: "none", facialHair: "none", headwear: "none", primaryPhobia: "dogs", additionalPhobias: [], createdAt: Date.now() };
    localStorage.setItem("fobia.characters.v2", JSON.stringify([c]));
    localStorage.setItem("fobia.activeCharacter.v1", c.id);
    localStorage.setItem("fobia.consent.v1", "1");
    localStorage.setItem("fobia.tutorialSeen", "1");
  });
  await page.goto(base + "/#/dogs/predict/4", { waitUntil: "load" });
  await sleep(800);
  await click(page, "Skip for now");            // primer may open for a traveler with no dog history
  await click(page, "Enter the trial");
  check("trial 5: scene mounts", await waitFor(page, () => !!(window.__active && window.__active.scene), 15000));
  await page.keyboard.down("KeyW"); await sleep(2500); await page.keyboard.up("KeyW");
  await sleep(4000);
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 1500) requestAnimationFrame(f); else r(n / 1.5); }; requestAnimationFrame(f); }));
  check("trial 5: renders frames", fps > 10, `${fps.toFixed(0)} fps (headless)`);
  await shot(page, "05-trial5");
  // Launch scope
  await page.goto(base + "/#/spiders", { waitUntil: "load" }); await sleep(900);
  check("closed realm shows 'coming soon'", await page.evaluate(() => !!document.querySelector(".soon-panel")));
  await page.goto(base + "/#/fears", { waitUntil: "load" }); await sleep(1500);
  check("map: one open realm + coming-soon strip", await page.evaluate(() => document.querySelectorAll(".realm-node").length === 1 && !!document.querySelector(".jw-soon")));
  await page.goto(base + "/?all=1#/spiders", { waitUntil: "load" }); await sleep(900);
  check("?all=1 opens closed realms for QA", await page.evaluate(() => !document.querySelector(".soon-panel") && !!document.querySelector(".realm-view, .trial")));
  // Persian
  await page.evaluate(() => localStorage.setItem("fobia.lang", "fa"));
  await page.goto(base + "/#/dogs", { waitUntil: "load" }); await sleep(1200);
  const fa = await page.evaluate(() => ({ dir: document.documentElement.dir, en: [...document.querySelectorAll(".trial-head strong")].filter((e) => /[a-z]{3}/i.test(e.textContent)).length }));
  check("Persian: RTL with translated trial names", fa.dir === "rtl" && fa.en === 0, JSON.stringify(fa));
  await shot(page, "06-fa");
  check("trial 5 + scope + fa: no page errors", page.errors.length === 0, page.errors.slice(0, 5).join(" | "));
  await ctx.close();
}

async function phone(browser, base) {
  const { ctx, page } = await newPage(browser, { mobile: true });
  await page.goto(base + "/", { waitUntil: "load" }); await sleep(1500);
  await click(page, "I understand"); await sleep(400);
  await click(page, "Step inside"); await sleep(2500);
  const m = await page.evaluate(() => ({ route: location.hash, sideways: document.documentElement.scrollWidth - window.innerWidth, stage: !!document.querySelector("#travelerStage canvas") }));
  check("phone: creator renders, no sideways scroll", m.route === "#/traveler" && m.stage && m.sideways <= 1, JSON.stringify(m));
  await shot(page, "07-phone-creator");
  check("phone: no page errors", page.errors.length === 0, page.errors.slice(0, 5).join(" | "));
  await ctx.close();
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: "new",
    args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--mute-audio", "--autoplay-policy=no-user-gesture-required"],
  });
  const t0 = Date.now();
  try {
    for (const flow of [firstRunAndTrial, hardestTrial, phone]) {
      try { await flow(browser, base); } catch (e) { check(flow.name + " crashed", false, String(e).slice(0, 300)); }
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(results.join("\n"));
  console.log(`\n${failed ? "SMOKE FAILED" : "smoke ok"} (${((Date.now() - t0) / 1000).toFixed(0)} s)${SHOTS ? " · shots in .smoke-shots/" : ""}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
