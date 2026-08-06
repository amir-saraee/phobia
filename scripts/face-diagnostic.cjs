#!/usr/bin/env node
/**
 * Face diagnostic: renders the avatar figure large, then toggles parts
 * (eye globes, hair) to isolate what dominates the face's look.
 * Output: /tmp/fobia-face/*.png
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const puppeteer = require("puppeteer-core");

const ROOT = path.join(__dirname, "..");
const OUT = "/tmp/fobia-face";
const PORT = 8735;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".m4a": "audio/mp4", ".json": "application/json", ".svg": "image/svg+xml" };

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
    executablePath: CHROME, headless: "new",
    args: ["--use-angle=metal", "--enable-webgl", "--ignore-gpu-blocklist", "--mute-audio"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 1000, deviceScaleFactor: 1 });
    page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
    await page.evaluateOnNewDocument(() => {
      const c = {
        id: "c-shot", name: "Mira", bodyType: "woman", skinTone: "fair",
        hairColor: "brown", hairStyle: "long", topColor: "teal", topStyle: "tee",
        eyeColor: "hazel", glasses: "none", facialHair: "none", headwear: "none",
        voicePreset: "calm", primaryPhobia: "dogs", additionalPhobias: [], createdAt: Date.now(),
      };
      localStorage.setItem("fobia.characters.v2", JSON.stringify([c]));
      localStorage.setItem("fobia.activeCharacter.v1", c.id);
    });
    await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.Scene3D && window.Scene3D.ready, { timeout: 30000 });
    await page.evaluate(() => {
      const box = document.createElement("div");
      box.id = "shot-avatar";
      box.style.cssText = "position:fixed;left:0;top:0;width:1400px;height:1000px;z-index:9999;background:#1a2030";
      document.body.appendChild(box);
      window.AvatarPreview.mount(box, window.Character.loadCharacter());
    });
    await sleep(2500);

    // Head occupies top-centre; with a 1400x1000 stage the crown is ~y 90..330.
    const headClip = { x: 560, y: 60, width: 280, height: 300 };
    const snap = async (name) => {
      await page.evaluate(() => { window.__avatarFigure.rotation.y = 0; });
      await sleep(60);
      await page.screenshot({ path: path.join(OUT, name + ".png"), clip: headClip });
    };

    await snap("face-full");

    // Hide the eye assemblies (globes + lids live in deep groups; find by
    // geometry size near the eye radius).
    await page.evaluate(() => {
      window.__hidden = [];
      window.__avatarFigure.traverse((o) => {
        if (!o.isMesh) return;
        const g = o.geometry;
        if (g && g.parameters && g.parameters.radius !== undefined && Math.abs(g.parameters.radius - 0.0125) < 0.004) {
          o.visible = false; window.__hidden.push(o);
        }
      });
    });
    await snap("face-noeyes");
    await page.evaluate(() => { window.__hidden.forEach((o) => (o.visible = true)); });

    // Report whether the face material actually has the baked map bound.
    const info = await page.evaluate(() => {
      const out = { hasMap: false, vertexColors: null, matColor: null };
      window.__avatarFigure.traverse((o) => {
        if (o.isMesh && o.material && o.material.isMeshPhysicalMaterial && o.material.sheen > 0.3 && o.geometry.attributes.color) {
          out.hasMap = !!o.material.map;
          out.vertexColors = o.material.vertexColors;
          out.matColor = o.material.color.getHexString();
        }
      });
      return out;
    });
    console.log("face material:", JSON.stringify(info));
    console.log("shots →", OUT);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
