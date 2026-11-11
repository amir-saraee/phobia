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
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".glb": "model/gltf-binary", ".gltf": "model/gltf+json", ".m4a": "audio/mp4", ".json": "application/json", ".svg": "image/svg+xml" };

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
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
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
        if (o.isMesh && o.material && o.material.isMeshPhysicalMaterial && o.morphTargetDictionary?.jawOpen != null && o.geometry.attributes.color) {
          out.hasMap = !!o.material.map;
          out.vertexColors = o.material.vertexColors;
          out.matColor = o.material.color.getHexString();
        }
      });
      return out;
    });
    console.log("face material:", JSON.stringify(info));
    // Exercise all body types, skin tones and facial channels on the real
    // creator builder. Verify skinning after animation, not just bind arrays.
    for (const [bodyType, skinHex] of [["woman", "#e8b794"], ["man", "#734b36"], ["boy", "#b67d55"], ["girl", "#a26845"]]) {
      await page.evaluate(({ bodyType, skinHex }) => {
        window.AvatarPreview.update({ ...window.Character.loadCharacter(), bodyType, skinHex });
      }, { bodyType, skinHex });
      await sleep(700);
      await page.evaluate(async () => {
        const THREE = await import('/assets/vendor/three/three.module.min.js');
        const figure = window.__avatarFigure;
        const v = new THREE.Vector3();
        for (const t of [0, 0.2, 0.5, 0.8]) {
          figure.userData.animate(t);
          figure.updateMatrixWorld(true);
          figure.traverse(mesh => {
            if (!mesh.isSkinnedMesh) return;
            mesh.skeleton.update();
            const weights = mesh.geometry.attributes.skinWeight;
            for (let i = 0; i < weights.count; i++) {
              let sum = 0; for (let k = 0; k < 4; k++) sum += weights.getComponent(i, k);
              if (Math.abs(sum - 1) > 0.001) throw Error('Invalid skin weights');
              mesh.getVertexPosition(i, v);
              if (![v.x, v.y, v.z].every(Number.isFinite)) throw Error('Invalid posed vertex');
            }
          });
        }
        figure.userData.animate = () => {};
        figure.rotation.y = 0;
        figure.traverse(o => { if (o.userData.face) o.userData.face.setBlink(0); });
      });
      await sleep(60);
      await page.screenshot({ path: path.join(OUT, bodyType + "-full.png") });
      for (const expression of ["neutral", "smile", "fear", "talk", "blink"]) {
        await page.evaluate(expression => {
          window.__avatarFigure.traverse(o => {
            const face = o.userData.face; if (!face) return;
            face.setFear(expression === "fear" ? 0.75 : 0);
            face.setSmile(expression === "smile" ? 0.8 : 0);
            face.setTalk(expression === "talk" ? 0.6 : 0);
            face.setBlink(expression === "blink" ? 1 : 0);
          });
        }, expression);
        await sleep(60);
        await page.screenshot({ path: path.join(OUT, `${bodyType}-${expression}.png`), clip: headClip });
      }
    }
    if (errors.length) throw Error(errors.join("\n"));
    console.log("Body variants, skin weights, animation and expressions passed");
    console.log("shots →", OUT);
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
