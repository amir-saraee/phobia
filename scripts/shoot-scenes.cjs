#!/usr/bin/env node
/**
 * Visual smoke-test harness: boots the game in headless Chrome, mounts a 3D
 * trial scene directly through window.Scene3D, and captures screenshots of
 * the protagonist (idle + gait phases, front/side/back) and the dog.
 *
 * Camera work uses a "rig": a wrapper around the live controls' update that
 * re-seats the camera relative to the player AFTER the follow-cam has run,
 * so the shot is deterministic without fighting the game loop.
 *
 * Usage: node shoot-scenes.cjs [outDir]
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const OUT = process.argv[2] || "/tmp/fobia-shots";
const PORT = 8734;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".gltf": "model/gltf+json",
  ".m4a": "audio/mp4", ".json": "application/json",
};

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      let file = path.join(ROOT, url === "/" ? "index.html" : url);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("nf"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    srv.listen(PORT, () => resolve(srv));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--mute-audio"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));

    await page.evaluateOnNewDocument(() => {
      const c = {
        id: "c-shot", name: "Mira", bodyType: "woman", skinTone: "fair",
        hairColor: "brown", hairStyle: "long", topColor: "teal", topStyle: "tee",
        eyeColor: "hazel", glasses: "none", facialHair: "none", headwear: "none",
        voicePreset: "calm", primaryPhobia: "dogs", additionalPhobias: [],
        createdAt: Date.now(),
      };
      localStorage.setItem("fobia.characters.v2", JSON.stringify([c]));
      localStorage.setItem("fobia.activeCharacter.v1", c.id);
      localStorage.setItem("fobia.tutorialSeen", "1");
      localStorage.setItem("fobia.captions", "0");
    });

    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.Scene3D && window.Scene3D.ready, { timeout: 30000 });
    await sleep(400);

    // ---------- part 1: avatar figure study (front / side / back / face) ----
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.id = "shot-avatar";
      box.style.cssText = "position:fixed;left:0;top:0;width:900px;height:900px;z-index:9999;background:#141824";
      document.body.appendChild(box);
      window.AvatarPreview.mount(box, window.Character.loadCharacter());
    });
    await sleep(2500);
    const avatarBox = { x: 0, y: 0, width: 900, height: 900 };
    for (const [name, yaw] of [["front", 0], ["side", Math.PI / 2], ["back", Math.PI]]) {
      await page.evaluate((y) => { window.__avatarFigure.rotation.y = y; }, yaw + 0.30 * 0.05);
      await sleep(120);
      await page.evaluate((y) => { window.__avatarFigure.rotation.y = y; }, yaw);
      await page.screenshot({ path: path.join(OUT, `avatar-${name}.png`), clip: avatarBox });
    }
    // Face close-up: head sits top-centre of the figure frame.
    await page.evaluate(() => { window.__avatarFigure.rotation.y = 0; });
    await page.screenshot({
      path: path.join(OUT, "avatar-face.png"),
      clip: { x: 330, y: 60, width: 240, height: 260 },
    });
    await page.evaluate(() => { document.getElementById("shot-avatar").remove(); });

    // ---------- part 2: in-scene walk study --------------------------------
    await page.evaluate(() => {
      const stage = document.createElement("div");
      stage.id = "shot-stage";
      stage.style.cssText = "position:fixed;inset:0;z-index:9999;background:#000";
      document.body.appendChild(stage);
      const C = window.Character;
      const ch = C.loadCharacter();
      window.Scene3D.mount("dogs", stage,
        { size: 0.5, intensity: "calm", behavior: {}, breed: "shiba", title: "shot" }, 0,
        {
          skinColor: C.hexToInt(C.skinHex(ch)), shirtColor: C.hexToInt(C.topHex(ch)),
          hairColor: C.hexToInt(C.hairHex(ch)), eyeColor: C.hexToInt(C.eyeHex(ch)),
          bodyType: ch.bodyType, hairStyle: ch.hairStyle, glasses: ch.glasses,
          facialHair: ch.facialHair, headwear: ch.headwear, topStyle: ch.topStyle,
        });
      // Camera rig: re-seat the camera relative to the player after the
      // follow-cam has run, so shots are deterministic.
      const a = window.__active;
      const c = a.controls;
      window.__camRig = null;
      const origUpdate = c.update.bind(c);
      c.update = (dt) => {
        origUpdate(dt);
        const rig = window.__camRig;
        if (rig) {
          const p = c.position;
          a.camera.position.set(p.x + rig.dx, p.y + rig.dy, p.z + rig.dz);
          a.camera.lookAt(p.x, p.y + rig.lookY, p.z);
        }
      };
    });
    await sleep(4500);
    const setRig = (rig) => page.evaluate((r) => { window.__camRig = r; }, rig);

    // Player faces -z at yaw 0. Front = -z side.
    await setRig({ dx: 0.0, dy: 0.35, dz: -2.6, lookY: -0.25 });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, "tp-front-idle.png") });

    await setRig({ dx: 2.6, dy: 0.25, dz: 0.0, lookY: -0.3 });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, "tp-side-idle.png") });

    // Face close-up in scene lighting.
    await setRig({ dx: 0.0, dy: 0.55, dz: -1.1, lookY: 0.42 });
    await sleep(400);
    await page.screenshot({ path: path.join(OUT, "tp-face.png") });

    // Gait phases — side view while walking forward.
    await setRig({ dx: 2.6, dy: 0.25, dz: 0.0, lookY: -0.3 });
    await page.keyboard.down("KeyW");
    await sleep(650);               // let the stride reach full amplitude
    for (let i = 0; i < 6; i++) {
      await page.screenshot({ path: path.join(OUT, `gait-side-${i}.png`) });
      await sleep(190);             // ~1.9 Hz stride → sample across the cycle
    }
    // Front view of the same walk.
    await setRig({ dx: 0.0, dy: 0.35, dz: -2.6, lookY: -0.25 });
    for (let i = 0; i < 3; i++) {
      await page.screenshot({ path: path.join(OUT, `gait-front-${i}.png`) });
      await sleep(210);
    }
    await page.keyboard.up("KeyW");

    // Dog study: stand still, watch the dog move around the yard.
    await setRig(null);
    await page.keyboard.press("KeyV");   // back to the follow cam framing
    await sleep(600);
    for (let i = 0; i < 6; i++) {
      await page.screenshot({ path: path.join(OUT, `dog-${i}.png`) });
      await sleep(800);
    }

    console.log("shots →", OUT);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
