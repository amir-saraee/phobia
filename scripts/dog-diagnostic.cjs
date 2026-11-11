#!/usr/bin/env node
// Render both real dog builders and exercise their skinned animation surfaces.
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');
const root = path.resolve(__dirname, '..');
const out = process.argv[2] || '/tmp/fobia-dogs';
const mime = { '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png' };
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    if (req.url === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (req.url === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<style>body{margin:0}</style><script type="importmap">{"imports":{"three":"/assets/vendor/three/three.module.min.js","three/addons/":"/assets/vendor/three/addons/"}}</script>');
      return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 850 });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(async () => {
      localStorage.setItem('fobia.quality', 'high');
      const THREE = await import('three');
      const { buildDog } = await import('/src/3d/dog-model.js');
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1200, 850); renderer.setPixelRatio(1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.shadowMap.enabled = true;
      document.body.appendChild(renderer.domElement);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xabb7bd);
      scene.add(new THREE.HemisphereLight(0xe5efff, 0x6d6557, 2));
      const key = new THREE.DirectionalLight(0xffefdb, 3); key.position.set(3, 5, 4); scene.add(key);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x929d9b, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.005; scene.add(floor);
      const camera = new THREE.PerspectiveCamera(33, 1200 / 850, 0.01, 100);
      window.study = { renderer, scene, camera, dogs: [], THREE };
      for (const breed of ['shiba', 'husky']) {
        const dog = buildDog({ breed, targetHeight: 0.75 });
        scene.add(dog); window.study.dogs.push(dog);
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(Error('Dog load timed out')), 30000);
          dog.userData.onReady = () => { clearTimeout(timeout); resolve(); };
        });
        if (dog.userData.loadFailed) throw Error('Dog fallback used');
        dog.visible = false;
      }
    });
    for (const [index, breed] of ['shiba', 'husky'].entries()) {
      for (const view of ['three-quarter', 'side', 'front']) {
        const stats = await page.evaluate(({ index, view }) => {
          const { dogs, scene, renderer, camera, THREE } = window.study;
          dogs.forEach((dog, i) => { dog.visible = i === index; });
          const dog = dogs[index], parts = dog.userData.parts;
          Object.values(parts.actions).forEach(action => action.stop());
          parts.actions.Idle.reset().play(); parts.mixer.update(0);
          camera.position.set(...(view === 'side' ? [2.5, 0.9, 0] : view === 'front' ? [0, 0.85, 2.6] : [1.8, 1.0, 2.1]));
          camera.lookAt(0, 0.38, 0);
          for (let i = 0; i < 6; i++) renderer.render(scene, camera);
          let vertices = 0;
          dog.traverse(mesh => {
            if (!mesh.isSkinnedMesh || mesh.userData.furShell) return;
            const weights = mesh.geometry.attributes.skinWeight;
            for (let i = 0; i < weights.count; i++) {
              let total = 0;
              for (let k = 0; k < 4; k++) total += weights.getComponent(i, k);
              if (Math.abs(total - 1) > 0.015) throw Error('Unnormalized skin weights');
            }
            const p = new THREE.Vector3();
            vertices += mesh.geometry.attributes.position.count;
            for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
              mesh.getVertexPosition(i, p);
              if (![p.x, p.y, p.z].every(Number.isFinite)) throw Error('Invalid posed surface');
            }
          });
          return { vertices, triangles: renderer.info.render.triangles };
        }, { index, view });
        await page.screenshot({ path: path.join(out, `${breed}-${view}.png`) });
        console.log(breed, view, stats);
      }
      await page.evaluate(index => {
        const { dogs, renderer, scene, camera, THREE } = window.study;
        const parts = dogs[index].userData.parts;
        for (const name of ['Walk', 'Trot', 'Gallop', 'Sitting']) {
          const action = parts.actions[name]; if (!action) continue;
          Object.values(parts.actions).forEach(a => a.stop()); action.reset().play();
          for (let step = 0; step < 12; step++) {
            parts.mixer.update(action.getClip().duration / 12);
            renderer.render(scene, camera);
            dogs[index].traverse(mesh => {
              if (!mesh.isSkinnedMesh || mesh.userData.furShell) return;
              const p = new THREE.Vector3();
              for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
                mesh.getVertexPosition(i, p);
                if (![p.x, p.y, p.z].every(Number.isFinite)) throw Error(`${name}: invalid skinning`);
              }
            });
          }
        }
      }, index);
    }
    if (errors.length) throw Error(errors.join('\n'));
    console.log('Dog surface and animation checks passed:', out);
  } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
