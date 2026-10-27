// The Narrow Passage — tight spaces (claustrophobia).

import * as THREE from "three";
import { IS_COARSE_POINTER, IS_LOW_POWER } from "../renderer.js";
import { sceneContext } from "../scene-context.js";
import { makeWoodTexture, makePlankMaps, makePlasterMaps, makeRugMaps, makeLeafTexture } from "../textures.js";
import { _hexMix } from "../creature-kit.js";
import { _coachSize } from "../dog-controller.js";
import { makeCreatureCoach } from "../coach.js";
import { active } from "../live.js";

// ---------- Enclosed ----------
function setupEnclosed(scene, camera, level, levelIdx, ctx) {
  // Five real places, one door each. Nothing here ever moves toward you: the
  // old scene squeezed its walls in and hid the door, which taught the very
  // thing claustrophobia already believes. Now the space keeps its size, the
  // way out is always visible and always works, and the coach counts opening
  // it as the relief-without-learning it is.
  //   0 a small meeting room · 1 an office phone booth · 2 a small lift
  //   3 a storage closet · 4 an MRI scanner (you lie on the table)
  const rung = Math.max(0, Math.min(4, levelIdx || 0));
  const V = ctx || sceneContext("enclosed", rung, false);
  const MRI = rung === 4, LIFT = rung === 2;
  const pieces = [];
  const add = (o) => { scene.add(o); pieces.push(o); return o; };
  const r = scene.userData && scene.userData.renderer;
  if (r) r.toneMappingExposure = 1.0;
  scene.background = new THREE.Color(0x0c0d10);
  scene.fog = null;

  // ---- Shared helpers ----
  const mesh = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast && !IS_LOW_POWER; m.receiveShadow = true; return m; };
  const std = (hex, rough = 0.6, metal = 0, extra) => new THREE.MeshStandardMaterial(Object.assign({ color: hex, roughness: rough, metalness: metal }, extra || {}));
  const rbox = (w, h, d, rad, seg = 4) => {
    const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
    const p = g.attributes.position, v = new THREE.Vector3(), inner = new THREE.Vector3();
    const hx = w / 2 - rad, hy = h / 2 - rad, hz = d / 2 - rad;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      inner.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
      v.sub(inner); if (v.lengthSq() > 1e-9) v.setLength(rad);
      p.setXYZ(i, inner.x + v.x, inner.y + v.y, inner.z + v.z);
    }
    g.computeVertexNormals();
    return g;
  };
  const canvasTex = (w, h, draw, rep) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; draw(c.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
    return t;
  };
  const noiseTex = (base, amt, rep, streak) => canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = Math.random() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${Math.random() * amt})`;
      if (streak) g.fillRect(0, Math.random() * h, w, 1); else g.fillRect(Math.random() * w, Math.random() * h, 1, 1);
    }
  }, rep);
  const fabric = (hex, rep = [4, 4]) => new THREE.MeshStandardMaterial({ map: noiseTex("#808080", 0.08, rep), color: hex, roughness: 0.96, envMapIntensity: 0.1 });
  const plaster = makePlasterMaps();
  // Plaster relief without the tan albedo, so each wall's colour is its own.
  const wallGrain = noiseTex("#e6e6e6", 0.05, [3, 2]);
  const wallMatOf = (hex) => new THREE.MeshStandardMaterial({ map: wallGrain, normalMap: plaster.normal, color: hex, roughness: 0.93, envMapIntensity: 0.15 });
  [plaster.albedo, plaster.normal].forEach((t) => t && t.repeat.set(1.6, 1));
  // Walls are thin boxes (the collider sweep turns them into solids).
  const wallX = (x0, x1, z, y0, y1, mat, th = 0.1) => add(mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, th), mat, (x0 + x1) / 2, (y0 + y1) / 2, z));
  const wallZ = (z0, z1, x, y0, y1, mat, th = 0.1) => add(mesh(new THREE.BoxGeometry(th, y1 - y0, z1 - z0), mat, x, (y0 + y1) / 2, (z0 + z1) / 2));
  const plane = (w, d, mat, x, y, z, up = true) => { const m = add(mesh(new THREE.PlaneGeometry(w, d), mat, x, y, z, false)); m.rotation.x = up ? -Math.PI / 2 : Math.PI / 2; return m; };
  const noCol = (o) => { o.traverse((c) => { c.userData.noCollide = true; }); return o; };
  const lightPanel = (w, d, x, y, z, hex = 0xf4f6ff, e = 1.6) => {
    const m = add(new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: hex, emissiveIntensity: e, roughness: 0.4 })));
    m.rotation.x = Math.PI / 2; m.position.set(x, y - 0.004, z); m.userData.noCollide = true; return m;
  };
  const warm = V.range(0, 1);                                  // lamp temperature drifts per visit
  const lampHex = _hexMix(0xeef2ff, 0xffe6c0, warm);

  // ---- Per-rung layout: an inside (the space) and an outside (the way out) ----
  // The dividing wall sits at z = 0; the space is at −z, the way out at +z.
  const L = [
    { in: { x0: -1.8, x1: 1.8, z0: -3.6 }, top: 1.6, out: { x0: -2.8, x1: 2.8, z1: 2.4 }, outTop: 1.6,
      door: { x0: 0.35, w: 0.9, h: 2.05, swing: 1 }, deep: { x: 0, z: -2.6 }, spawn: { x: 0.8, z: 1.7 } },
    { in: { x0: -0.55, x1: 0.55, z0: -1.1 }, top: 1.2, out: { x0: -4, x1: 4, z0: -3.2, z1: 4 }, outTop: 1.8,
      door: { x0: -0.4, w: 0.8, h: 2.0, swing: -1, glass: true }, deep: { x: 0, z: -0.75 }, spawn: { x: 0, z: 2.1 } },
    { in: { x0: -0.55, x1: 0.55, z0: -1.3 }, top: 1.2, out: { x0: -2, x1: 2, z1: 3 }, outTop: 1.7,
      door: { x0: -0.4, w: 0.8, h: 2.05, sliding: true }, deep: { x: 0, z: -0.9 }, spawn: { x: 0, z: 2.0 } },
    { in: { x0: -0.5, x1: 0.5, z0: -1.0 }, top: 1.1, out: { x0: -1.5, x1: 1.5, z1: 2.6 }, outTop: 1.5,
      door: { x0: -0.375, w: 0.75, h: 1.98, swing: -1 }, deep: { x: 0, z: -0.6 }, spawn: { x: 0, z: 1.9 } },
    null,
  ][rung];

  // Interior lights (switchable), exterior lights (always on).
  const inLights = [], inGlow = [];
  let lightOn = true;
  let doorPivot = null, doorLeaves = [], handleWorld = new THREE.Vector3();
  let doorAmt = MRI ? 0 : 1, doorTarget = MRI ? 0 : 1;   // 1 = open. You come in through an open door.
  const doorBox = { minX: 1e6, maxX: 1e6 + 0.1, minZ: 1e6, maxZ: 1e6 + 0.1 };
  const clickables = [];     // { obj, act, reach }
  let cop = null, digitPaint = null, lobbyPaint = null, cordBead = null, callBall = null, gantryPaint = null, gapStrip = null, wallClock = null, hemiL = null;

  if (!MRI) {
    const I = L.in, O = L.out, D = L.door;
    const oz0 = O.z0 != null ? O.z0 : 0;
    // ---------------- Outside ----------------
    const outWallHex = [0xc9ccd0, 0xd4d6d8, 0xc9c2b4, 0xc2b49e][rung];
    const outWall = wallMatOf(outWallHex);
    const outFloorMat = rung === 1
      ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => {
          g.fillStyle = "#6c7076"; g.fillRect(0, 0, w, h);
          for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = `rgba(${(i + j) % 2 ? 0 : 255},${(i + j) % 2 ? 0 : 255},${(i + j) % 2 ? 0 : 255},0.022)`; g.fillRect(i * 64, j * 64, 64, 64); }
          for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
        }, [8, 8]), roughness: 0.95 })
      : rung === 3
        ? (() => { const pm = makePlankMaps(); [pm.albedo, pm.normal, pm.roughness].forEach((t) => t && t.repeat.set(2, 2)); return new THREE.MeshStandardMaterial({ map: pm.albedo, normalMap: pm.normal, roughnessMap: pm.roughness, color: 0xa08a70 }); })()
        : new THREE.MeshStandardMaterial({ map: noiseTex("#b8b4ac", 0.06, [6, 6]), color: rung === 2 ? 0xc9c2b4 : 0xbcbab4, roughness: 0.55, envMapIntensity: 0.3 });
    const ow = O.x1 - O.x0, od = O.z1 - oz0;
    plane(ow, od, outFloorMat, (O.x0 + O.x1) / 2, -1, (oz0 + O.z1) / 2);
    plane(ow, od, std(0xe8e8e6, 0.95), (O.x0 + O.x1) / 2, O.outTop != null ? O.outTop : L.outTop, (oz0 + O.z1) / 2, false);
    wallX(O.x0, O.x1, O.z1, -1, L.outTop, outWall);
    wallZ(oz0, O.z1, O.x0, -1, L.outTop, outWall);
    wallZ(oz0, O.z1, O.x1, -1, L.outTop, outWall);
    if (O.z0 != null) wallX(O.x0, O.x1, O.z0, -1, L.outTop, outWall);
    // Outside lights: always on — the way out is a lit place.
    const outL = add(new THREE.PointLight(0xfff4e6, rung === 1 ? 4.2 : 3.4, 12, 2));
    outL.position.set(0, L.outTop - 0.15, (Math.max(0, oz0) + O.z1) / 2 + (rung === 1 ? -0.6 : 0));
    // The hall light must not shine through the walls into a switched-off room.
    if (rung !== 1) { outL.castShadow = !IS_LOW_POWER; outL.shadow.mapSize.set(512, 512); outL.shadow.bias = -0.003; outL.shadow.camera.near = 0.1; }
    if (rung === 1) { const o2 = add(new THREE.PointLight(0xfff4e6, 5, 10, 2)); o2.position.set(0.5, L.outTop - 0.15, -2.2); lightPanel(0.6, 0.6, 0.5, L.outTop, -2.2, 0xfff2e2, 1.4); }
    lightPanel(0.6, 0.6, outL.position.x, L.outTop, outL.position.z, 0xfff2e2, 1.4);
    hemiL = add(new THREE.HemisphereLight(0xe8eef8, 0x40362c, rung === 1 ? 0.55 : 0.35));
    // A daylight window somewhere outside: the world carries on out there.
    const dayTex = canvasTex(512, 256, (g, w, h) => {
      const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#8fb4dc"); sky.addColorStop(1, "#dce9f2");
      g.fillStyle = sky; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 18; i++) { const bw = 20 + Math.random() * 50, bh = 40 + Math.random() * 120, x = Math.random() * w; g.fillStyle = `rgb(${120 + Math.random() * 40},${128 + Math.random() * 40},${140 + Math.random() * 30})`; g.fillRect(x, h - bh, bw, bh); for (let yy = h - bh + 6; yy < h - 4; yy += 9) for (let xx = x + 4; xx < x + bw - 4; xx += 8) { g.fillStyle = "rgba(230,240,250,0.35)"; g.fillRect(xx, yy, 4, 5); } }
      g.fillStyle = "rgba(70,110,60,0.9)"; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(Math.random() * w, h - Math.random() * 20, 10 + Math.random() * 16, 0, Math.PI * 2); g.fill(); }
    });
    const dayMat = new THREE.MeshBasicMaterial({ map: dayTex, toneMapped: false, color: 0xe6e6e6 });
    if (rung === 1) {
      // Glazing along the office's left wall.
      for (let k = 0; k < 3; k++) {
        const win = add(new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.7), dayMat));
        win.rotation.y = Math.PI / 2; win.position.set(O.x0 + 0.06, 0.45, -2.1 + k * 2.4); win.userData.noCollide = true;
        for (const y of [-0.42, 1.32]) { const fr = add(mesh(new THREE.BoxGeometry(0.06, 0.05, 2.2), std(0x2e3136, 0.4, 0.6), O.x0 + 0.05, y, win.position.z, false)); fr.userData.noCollide = true; }
        const mull = add(mesh(new THREE.BoxGeometry(0.06, 1.8, 0.05), std(0x2e3136, 0.4, 0.6), O.x0 + 0.05, 0.45, win.position.z + 1.1, false)); mull.userData.noCollide = true;
      }
      const sun = add(new THREE.DirectionalLight(0xfff1dc, 1.2)); sun.position.set(O.x0 - 4, 3, 1); sun.target.position.set(0, -1, 0); add(sun.target);
    } else if (rung === 0) {
      const win = add(new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.2), dayMat));
      win.rotation.y = Math.PI / 2; win.position.set(O.x0 + 0.06, 0.4, 1.2); win.userData.noCollide = true;
    }
    // ---------------- The dividing wall, with the door opening ----------------
    const inWallHex = [0xd4cfc4, 0x4e5a52, 0xb9bec4, 0xd8d2c4][rung];
    const dx0 = D.x0, dx1 = D.x0 + D.w;
    const divMat = outWall;
    const divX0 = rung === 1 ? I.x0 - 0.03 : O.x0, divX1 = rung === 1 ? I.x1 + 0.03 : O.x1;
    if (!D.glass) {
      wallX(divX0, dx0, 0, -1, L.outTop, divMat);
      wallX(dx1, divX1, 0, -1, L.outTop, divMat);
      wallX(dx0, dx1, 0, -1 + D.h, L.outTop, divMat);
    }
    // Door frame (architrave) — thin, and never a collider, so the gap stays walkable.
    const frameMat = rung === 2 ? std(0xb8bcc2, 0.25, 0.9, { envMapIntensity: 1.2 }) : std(0xd6d2ca, 0.5);
    for (const [w, h, x, y] of [[0.06, D.h + 0.06, dx0 - 0.03, -1 + D.h / 2], [0.06, D.h + 0.06, dx1 + 0.03, -1 + D.h / 2], [D.w + 0.12, 0.06, (dx0 + dx1) / 2, -1 + D.h + 0.03]]) {
      for (const zz of [0.06, -0.06]) { if (D.glass || (D.sliding && zz < 0)) continue; const f = add(mesh(new THREE.BoxGeometry(w, h, 0.03), frameMat, x, y, zz, false)); f.userData.noCollide = true; }
    }
    // ---------------- Inside shell ----------------
    const iw = I.x1 - I.x0, id = -I.z0;
    const inWall = rung === 2 ? null : rung === 1 ? fabric(0x4e5a52, [3, 3]) : wallMatOf(inWallHex);
    // Brushed steel: fine horizontal grain, tiled small so it reads as grain, not bands.
    const steelTex = rung === 2 ? canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#a4a9ae"; g.fillRect(0, 0, w, h); for (let i = 0; i < 1400; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * 0.07})`; g.fillRect(Math.random() * w - 40, Math.random() * h, 40 + Math.random() * 160, 1); } }, [3, 6]) : null;
    const steel = rung === 2 ? new THREE.MeshStandardMaterial({ map: steelTex, color: 0xd6d9dd, roughness: 0.42, metalness: 0.72, envMapIntensity: 0.9 }) : null;
    const inFloorMat = rung === 0
      ? new THREE.MeshStandardMaterial({ map: noiseTex("#5d6570", 0.16, [8, 8]), roughness: 0.98, envMapIntensity: 0.05 })
      : rung === 1 ? new THREE.MeshStandardMaterial({ map: noiseTex("#4b4f55", 0.12, [3, 3]), roughness: 0.95 })
      : rung === 2 ? new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#2a2c30"; g.fillRect(0, 0, w, h); for (let y = 8; y < h; y += 16) for (let x = 8; x < w; x += 16) { g.fillStyle = "#3a3d42"; g.beginPath(); g.arc(x + (y % 32 ? 8 : 0), y, 4, 0, Math.PI * 2); g.fill(); } }, [4, 5]), roughness: 0.7 })
      : (() => { const pm = makePlankMaps(); [pm.albedo, pm.normal, pm.roughness].forEach((t) => t && t.repeat.set(0.8, 0.8)); return new THREE.MeshStandardMaterial({ map: pm.albedo, normalMap: pm.normal, roughnessMap: pm.roughness, color: 0x8a7258 }); })();
    plane(iw, id, inFloorMat, (I.x0 + I.x1) / 2, -0.997, I.z0 / 2);
    const ceilMat = rung === 0
      ? new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = "#e9e8e4"; g.fillRect(0, 0, w, h); g.strokeStyle = "#bdbcb8"; g.lineWidth = 3; for (let i = 0; i <= w; i += 128) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); } for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; g.fillRect(Math.random() * w, Math.random() * h, 1, 1); } }, [iw / 1.2, id / 1.2]), roughness: 0.95 })
      : rung === 2 ? std(0x2a2c30, 0.4, 0.7) : rung === 1 ? std(0x303438, 0.9) : std(0xeeeae2, 0.95);
    plane(iw, id, ceilMat, (I.x0 + I.x1) / 2, L.top, I.z0 / 2, false);
    if (rung === 2) {
      // Lift car: steel panels with dark seams, a handrail, a ceiling light.
      const back = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.6 });
      wallX(I.x0, I.x1, I.z0, -1, L.top, back, 0.04);
      wallZ(I.z0, 0, I.x0, -1, L.top, back, 0.04);
      wallZ(I.z0, 0, I.x1, -1, L.top, back, 0.04);
      const pw = iw / 2 - 0.006;
      for (const x of [I.x0 + pw / 2 + 0.003, I.x1 - pw / 2 - 0.003]) { const p2 = add(mesh(new THREE.BoxGeometry(pw, 2.12, 0.012), steel, x, 0.07, I.z0 + 0.03, false)); p2.userData.noCollide = true; }
      const sd = id / 2 - 0.006;
      for (const sx of [I.x0 + 0.03, I.x1 - 0.03]) for (const z of [I.z0 + sd / 2 + 0.003, -sd / 2 - 0.003]) { const p2 = add(mesh(new THREE.BoxGeometry(0.012, 2.12, sd), steel, sx, 0.07, z, false)); p2.userData.noCollide = true; }
      const rail = add(mesh(new THREE.CylinderGeometry(0.018, 0.018, iw - 0.16, 12), std(0xcfd3d8, 0.2, 1, { envMapIntensity: 1.3 }), 0, -0.08, I.z0 + 0.1, false));
      rail.rotation.z = Math.PI / 2; rail.userData.noCollide = true;
      for (const x of [I.x0 + 0.12, I.x1 - 0.12]) { const b = add(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.07, 8), rail.material, x, -0.08, I.z0 + 0.065, false)); b.rotation.x = Math.PI / 2; b.userData.noCollide = true; }
      // front returns + transom (inside faces of the car front)
      for (const [x0, x1] of [[I.x0, dx0], [dx1, I.x1]]) { const f = add(mesh(new THREE.BoxGeometry(x1 - x0, 2.2, 0.05), steel, (x0 + x1) / 2, 0.1, -0.05)); void f; }
      const tr = add(mesh(new THREE.BoxGeometry(iw, L.top - (-1 + D.h), 0.05), steel, 0, (L.top + (-1 + D.h)) / 2, -0.05, false)); tr.userData.noCollide = true;
    } else {
      wallX(I.x0, I.x1, I.z0, -1, L.top, inWall);
      wallZ(I.z0, 0, I.x0, -1, L.top, inWall);
      wallZ(I.z0, 0, I.x1, -1, L.top, inWall);
      if (rung !== 1) for (const [w, x, z, ry] of [[iw, (I.x0 + I.x1) / 2, I.z0 + 0.055, 0], [id, I.x0 + 0.055, I.z0 / 2, Math.PI / 2], [id, I.x1 - 0.055, I.z0 / 2, Math.PI / 2]]) {
        const sk = add(mesh(new THREE.BoxGeometry(w, 0.09, 0.012), std(0xf2eee6, 0.5), x, -0.955, z, false)); sk.rotation.y = ry; sk.userData.noCollide = true;
      }
    }
    // Interior light.
    const inL = add(new THREE.PointLight(lampHex, [4.2, 1.6, 2.2, 0.8][rung] * V.range(0.9, 1.1), [9, 3.5, 4, 4][rung], 2));
    inL.position.set((I.x0 + I.x1) / 2, L.top - (rung === 3 ? 0.18 : 0.12), rung === 0 ? -1.9 : I.z0 / 2);
    inL.castShadow = !IS_LOW_POWER; inL.shadow.mapSize.set(1024, 1024); inL.shadow.bias = -0.002; inL.shadow.camera.near = 0.05;
    inLights.push(inL);
    if (rung === 0) {
      const inL2 = add(new THREE.PointLight(lampHex, 2.2, 7, 2)); inL2.position.set(0, L.top - 0.12, -0.6); inLights.push(inL2);
      for (const z of [-2.5, -0.9]) inGlow.push(lightPanel(0.6, 0.6, 0, L.top, z, lampHex, 1.5));
    } else if (rung === 1) {
      inGlow.push(lightPanel(0.5, 0.5, 0, L.top, -0.55, lampHex, 1.3));
    } else if (rung === 2) {
      inGlow.push(lightPanel(0.7, 0.9, 0, L.top, -0.65, 0xf6f8ff, 0.8));
    } else {
      // Bare bulb on a ceiling rose, with a pull cord.
      const bulb = add(mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 2.2 }), 0, L.top - 0.13, -0.5, false));
      bulb.scale.y = 1.25; bulb.userData.noCollide = true; inGlow.push(bulb);
      const rose = add(mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.05, 16), std(0xeeeeea, 0.6), 0, L.top - 0.03, -0.5, false)); rose.userData.noCollide = true;
      const flex = add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.06, 6), std(0x222222, 0.7), 0, L.top - 0.08, -0.5, false)); flex.userData.noCollide = true;
      const cord = add(mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.62, 5), std(0xe8e0d0, 0.9), 0.06, L.top - 0.38, -0.46, false)); cord.userData.noCollide = true;
      cordBead = add(mesh(new THREE.SphereGeometry(0.014, 10, 8), std(0xd8c8a8, 0.5), 0.06, L.top - 0.7, -0.46, false)); cordBead.userData.noCollide = true;
      inL.position.set(0, L.top - 0.2, -0.5);
      clickables.push({ obj: cordBead, act: "light", reach: 1.4 }, { obj: bulb, act: "light", reach: 1.4 });
    }
    // ---------------- The door ----------------
    if (D.sliding) {
      // Lift car doors: two steel leaves that part to the sides.
      for (const side of [-1, 1]) {
        // At z = 0, inside the landing wall's thickness: open, they vanish into it.
        const leaf = add(mesh(new THREE.BoxGeometry(D.w / 2, D.h, 0.03), steel, side * D.w / 4, -1 + D.h / 2, 0, false));
        leaf.userData.noCollide = true; leaf.userData.side = side; doorLeaves.push(leaf);
      }
      // Landing wall face (the lobby side), a floor sign and a call button.
      const signMat = new THREE.MeshBasicMaterial({ map: null, transparent: true });
      const signC = document.createElement("canvas"); signC.width = 128; signC.height = 128; const signT = new THREE.CanvasTexture(signC); signT.colorSpace = THREE.SRGBColorSpace; signMat.map = signT;
      const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), signMat)); sign.position.set(0.95, 0.75, 0.056); sign.userData.noCollide = true;
      // The number again, big, on the lobby wall facing the lift — what you see when the doors part.
      const sign2 = add(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), signMat)); sign2.position.set(0, 0.5, O.z1 - 0.056); sign2.rotation.y = Math.PI; sign2.userData.noCollide = true;
      const bench = add(mesh(rbox(1.3, 0.06, 0.4, 0.02), new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x9a7650, roughness: 0.6 }), 1.1, -0.55, O.z1 - 0.3));
      for (const x of [0.6, 1.6]) add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.34), std(0x2a2b2e, 0.4, 0.7), x, -0.79, O.z1 - 0.3, false));
      void bench;
      const FLOORS = [null, { wall: 0xc9c2b4, floor: 0xb8b2a6 }, { wall: 0xa8bcc4, floor: 0xa6acb0 }, { wall: 0xc8a888, floor: 0xb4a48c }, { wall: 0xb4c0a0, floor: 0xa8b09c }];
      lobbyPaint = (n) => {
        const g = signC.getContext("2d"); g.clearRect(0, 0, 128, 128);
        g.fillStyle = "#2f3338"; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill();
        g.fillStyle = "#f2f2ee"; g.font = "bold 76px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(String(n), 64, 68);
        signT.needsUpdate = true;
        outWall.color.setHex(FLOORS[n].wall); outFloorMat.color.setHex(FLOORS[n].floor);
      };
      const callPlate = add(mesh(new THREE.BoxGeometry(0.08, 0.16, 0.012), std(0xc4c8cc, 0.3, 0.8), 0.62, 0.08, 0.056, false)); callPlate.userData.noCollide = true;
      clickables.push({ obj: callPlate, act: "open", reach: 1.6 });
      // Car operating panel on the right side wall, near the front.
      cop = new THREE.Group(); cop.position.set(I.x1 - 0.045, 0.02, -0.3); cop.rotation.y = -Math.PI / 2;
      cop.add(mesh(new THREE.BoxGeometry(0.2, 0.6, 0.012), std(0x2b2d31, 0.35, 0.7), 0, 0, 0, false));
      const btnFace = (label) => { const tx = canvasTex(64, 64, (g) => { g.fillStyle = "#1c1d20"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#e8e8e4"; g.font = `bold ${label.length > 1 ? 26 : 34}px sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, 32, 35); }); tx.center.set(0.5, 0.5); tx.rotation = Math.PI / 2; return tx; };
      const mkBtn = (label, x, y, act) => {
        const b = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 24), new THREE.MeshStandardMaterial({ map: btnFace(label), color: 0xffffff, roughness: 0.4, metalness: 0.3, emissive: 0xffa040, emissiveIntensity: 0 }));
        b.rotation.x = Math.PI / 2; b.position.set(x, y, 0.012); cop.add(b);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.003, 8, 24), std(0xc8ccd2, 0.2, 1)); ring.position.set(x, y, 0.014); cop.add(ring);
        clickables.push({ obj: b, act, reach: 1.3 }); return b;
      };
      cop.userData.floorBtns = {};
      for (let n = 1; n <= 4; n++) cop.userData.floorBtns[n] = mkBtn(String(n), (n % 2 ? -0.045 : 0.045), 0.2 - Math.floor((n - 1) / 2) * 0.08, "floor" + n);
      mkBtn("◀▶", -0.045, -0.02, "open"); mkBtn("▶◀", 0.045, -0.02, "close");
      const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.07), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      disp.position.set(0, 0.27, 0.008); cop.add(disp);
      const dC = document.createElement("canvas"); dC.width = 128; dC.height = 64; const dT = new THREE.CanvasTexture(dC); dT.colorSpace = THREE.SRGBColorSpace;
      disp.material.map = dT;
      // A second display above the door, inside, where people actually look.
      const disp2 = add(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.1), new THREE.MeshBasicMaterial({ map: dT, toneMapped: false })));
      disp2.position.set(0, -1 + D.h + 0.08, -0.08); disp2.rotation.y = Math.PI; disp2.userData.noCollide = true;
      digitPaint = (n, dir) => {
        const g = dC.getContext("2d"); g.fillStyle = "#0b0c0e"; g.fillRect(0, 0, 128, 64);
        g.fillStyle = "#ff8a3a"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
        g.fillText((dir > 0 ? "▲ " : dir < 0 ? "▼ " : "") + n, 64, 35); dT.needsUpdate = true;
      };
      noCol(cop); add(cop);
    } else {
      // A hinged leaf, pivoted at x0 so the full opening clears when it swings.
      doorPivot = new THREE.Group(); doorPivot.position.set(dx0, -1, 0);
      const leafW = D.w - 0.01, leafH = D.h - (rung === 3 ? 0.02 : 0.01);
      if (D.glass) {
        const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.1, envMapIntensity: 0.45, depthWrite: false });
        const gl = mesh(new THREE.BoxGeometry(leafW, leafH, 0.012), glassMat, leafW / 2, leafH / 2, 0, false); doorPivot.add(gl);
        const alu = std(0x3a3d42, 0.35, 0.7);
        for (const [w, h, x, y] of [[leafW, 0.04, leafW / 2, 0.02], [leafW, 0.04, leafW / 2, leafH - 0.02], [0.03, leafH, 0.015, leafH / 2], [0.03, leafH, leafW - 0.015, leafH / 2]]) doorPivot.add(mesh(new THREE.BoxGeometry(w, h, 0.03), alu, x, y, 0, false));
        // frosted manifestation band at eye height, and a long pull handle
        doorPivot.add(mesh(new THREE.BoxGeometry(leafW - 0.06, 0.1, 0.013), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, roughness: 0.8, depthWrite: false }), leafW / 2, 1.45, 0, false));
        const bar = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.6, 10), std(0xd0d4d8, 0.2, 1), leafW - 0.09, 1.0, 0.05, false); doorPivot.add(bar);
        const bar2 = bar.clone(); bar2.position.z = -0.05; doorPivot.add(bar2);
        for (const zz of [0.05, -0.05]) for (const y of [0.74, 1.26]) doorPivot.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.045, 6), bar.material, leafW - 0.09, y, zz / 2, false).rotateX(Math.PI / 2));
      } else {
        const leafMat = rung === 0 ? new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0xb08a64, roughness: 0.55 }) : std(0xd2ccc0, 0.55);
        doorPivot.add(mesh(new THREE.BoxGeometry(leafW, leafH, 0.04), leafMat, leafW / 2, (rung === 3 ? 0.02 : 0.01) + leafH / 2, 0, false));
        if (rung === 3) for (const y of [0.55, 1.35]) for (const zz of [0.021, -0.021]) doorPivot.add(mesh(new THREE.BoxGeometry(leafW - 0.16, 0.6, 0.006), std(0xe8e4da, 0.55), leafW / 2, y, zz, false));
        const brass = std(0xc9a860, 0.3, 0.9);
        for (const zz of [0.035, -0.035]) {
          if (rung === 0) {
            const lever = mesh(new THREE.BoxGeometry(0.12, 0.018, 0.018), brass, leafW - 0.12, 1.02, zz * 1.4, false); doorPivot.add(lever);
            doorPivot.add(mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.012, 16), brass, leafW - 0.07, 1.02, zz, false).rotateX(Math.PI / 2));
          } else {
            doorPivot.add(mesh(new THREE.SphereGeometry(0.028, 14, 10), brass, leafW - 0.07, 0.98, zz * 1.3, false));
          }
        }
      }
      noCol(doorPivot); add(doorPivot);
      doorLeaves.push(doorPivot);
      // Light under the door: from inside, the lit hall shows as a thin line.
      if (rung === 3 || rung === 0) {
        gapStrip = add(new THREE.Mesh(new THREE.PlaneGeometry(D.w - 0.04, rung === 3 ? 0.016 : 0.009), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false, transparent: true })));
        gapStrip.position.set((dx0 + dx1) / 2, -0.996 + (rung === 3 ? 0.008 : 0.0045), 0.03); gapStrip.rotation.y = Math.PI; gapStrip.userData.noCollide = true;
      }
    }
    // ---------------- Furnishing ----------------
    if (rung === 0) {
      // Meeting room: table, four chairs, a whiteboard, a clock, a jug.
      const lam = std(0xf2f0ea, 0.35);
      add(mesh(rbox(1.8, 0.04, 0.9, 0.015), lam, 0, -0.26, -1.9));
      for (const x of [-0.6, 0.6]) { add(mesh(new THREE.BoxGeometry(0.06, 0.7, 0.5), std(0x3a3c40, 0.4, 0.6), x, -0.63, -1.9)); add(mesh(new THREE.BoxGeometry(0.1, 0.02, 0.7), std(0x3a3c40, 0.4, 0.6), x, -0.99, -1.9, false)); }
      const chairFab = fabric(0x3c4a5c);
      const chair = (x, z, ry) => {
        const c = new THREE.Group(); c.position.set(x, -1, z); c.rotation.y = ry;
        c.add(mesh(rbox(0.48, 0.08, 0.46, 0.03), chairFab, 0, 0.47, 0));
        c.add(mesh(rbox(0.46, 0.5, 0.06, 0.03), chairFab, 0, 0.8, 0.22));
        c.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.3, 10), std(0x2a2b2e, 0.3, 0.8), 0, 0.3, 0, false));
        for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; const leg = mesh(new THREE.BoxGeometry(0.03, 0.025, 0.3), std(0x2a2b2e, 0.3, 0.8), Math.sin(a) * 0.14, 0.06, Math.cos(a) * 0.14, false); leg.rotation.y = a; c.add(leg); }
        add(c); return c;
      };
      chair(-0.45, -1.2, 0.08); chair(0.45, -1.22, -0.1); chair(-0.45, -2.6, Math.PI - 0.06); chair(0.5, -2.6, Math.PI + 0.12);
      // whiteboard with last meeting's boxes and arrows
      const wb = canvasTex(512, 320, (g, w, h) => {
        g.fillStyle = "#fbfbf8"; g.fillRect(0, 0, w, h);
        g.lineWidth = 4; g.lineCap = "round";
        const pen = ["#2a5db0", "#c0392b", "#1e7a4a"];
        for (let i = 0; i < 4; i++) { g.strokeStyle = pen[i % 3]; g.strokeRect(40 + i * 115, 60 + (i % 2) * 90, 80, 50); if (i < 3) { g.beginPath(); g.moveTo(120 + i * 115, 85 + (i % 2) * 90); g.lineTo(155 + i * 115, 85 + ((i + 1) % 2) * 90); g.stroke(); } }
        g.strokeStyle = "#555"; g.lineWidth = 3; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(60, 230 + i * 16); g.lineTo(60 + 120 + Math.random() * 200, 230 + i * 16); g.stroke(); }
        g.fillStyle = "rgba(0,0,0,0.04)"; for (let i = 0; i < 30; i++) g.fillRect(Math.random() * w, Math.random() * h, 40, 8);
      });
      const board = add(mesh(new THREE.BoxGeometry(1.6, 1.0, 0.02), new THREE.MeshStandardMaterial({ map: wb, color: 0xe2e2e0, roughness: 0.3 }), 0, 0.5, I.z0 + 0.065, false)); board.userData.noCollide = true;
      const tray = add(mesh(new THREE.BoxGeometry(1.6, 0.02, 0.06), std(0xb8bcc0, 0.3, 0.7), 0, -0.01, I.z0 + 0.09, false)); tray.userData.noCollide = true;
      // wall clock with a live second hand
      const face = canvasTex(128, 128, (g) => { g.fillStyle = "#fbfaf6"; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#222"; g.lineWidth = 5; g.stroke(); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.lineWidth = k % 3 ? 2 : 4; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); } });
      const clock = new THREE.Group(); clock.position.set(I.x0 + 0.07, 0.95, -1.9); clock.rotation.y = Math.PI / 2;
      clock.add(mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 32), std(0x222222, 0.4), 0, 0, 0, false).rotateX(Math.PI / 2));
      const cf = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshStandardMaterial({ map: face, roughness: 0.5 })); cf.position.z = 0.016; clock.add(cf);
      const hand = (len, w, hex) => { const g2 = new THREE.Group(); g2.position.z = 0.02; const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004), std(hex, 0.5)); m.position.y = len / 2 - 0.015; g2.add(m); clock.add(g2); return g2; };
      const hh = hand(0.08, 0.012, 0x111111), mh = hand(0.12, 0.008, 0x111111), sh = hand(0.13, 0.003, 0xc0392b);
      const now = new Date(); hh.rotation.z = -((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2; mh.rotation.z = -now.getMinutes() / 60 * Math.PI * 2;
      clock.userData.sec = sh; noCol(clock); add(clock);
      wallClock = clock;
      // jug + glasses, a plant, a vent, the light switch by the door
      const glassM = new THREE.MeshStandardMaterial({ color: 0xe8f2f6, roughness: 0.05, transparent: true, opacity: 0.35, envMapIntensity: 1.2, depthWrite: false });
      const jug = add(mesh(new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.075, 0.05], [0.06, 0.2], [0.05, 0.24], [0.058, 0.26]].map(([x, y]) => new THREE.Vector2(x, y)), 24), glassM, 0.2, -0.24, -1.85, false)); jug.userData.noCollide = true;
      for (const [x, z] of [[-0.05, -1.7], [0.42, -2.05]]) { const g2 = add(mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.1, 16, 1, true), glassM, x, -0.19, z, false)); g2.userData.noCollide = true; }
      const pot = add(mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.36, 20), std(0xd8d0c4, 0.7), I.x1 - 0.3, -0.82, I.z0 + 0.3));
      const leafT = makeLeafTexture ? makeLeafTexture() : null;
      for (let k = 0; k < 14; k++) {
        const a = k * 2.39996, lf = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.42), new THREE.MeshStandardMaterial({ map: leafT, color: 0x5f8a4a, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 }));
        lf.position.set(pot.position.x + Math.sin(a) * 0.08, -0.45 + (k % 5) * 0.08, pot.position.z + Math.cos(a) * 0.08);
        lf.rotation.set(-0.5 - (k % 3) * 0.15, a, 0); lf.userData.noCollide = true; add(lf);
      }
      const vent = add(mesh(new THREE.BoxGeometry(0.5, 0.01, 0.3), std(0xdcdad4, 0.6), -1.1, L.top - 0.006, -0.8, false)); vent.userData.noCollide = true;
      for (let k = 0; k < 6; k++) { const sl = add(mesh(new THREE.BoxGeometry(0.46, 0.012, 0.012), std(0x9a9892, 0.6), -1.1, L.top - 0.012, -0.92 + k * 0.045, false)); sl.userData.noCollide = true; }
      const sw = add(mesh(new THREE.BoxGeometry(0.08, 0.12, 0.012), std(0xf6f4ee, 0.4), dx1 + 0.22, 0.28, -0.058, false)); sw.userData.noCollide = true;
      clickables.push({ obj: sw, act: "light", reach: 1.3 });
      // corridor: a bench and a noticeboard
      add(mesh(rbox(1.2, 0.06, 0.4, 0.02), new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0x9a7650, roughness: 0.6 }), -1.6, -0.55, O.z1 - 0.3));
      for (const x of [-2.1, -1.1]) add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.34), std(0x2a2b2e, 0.4, 0.7), x, -0.79, O.z1 - 0.3, false));
      const nb = add(mesh(new THREE.BoxGeometry(0.9, 0.6, 0.02), fabric(0x8a6a4a, [2, 2]), -1.4, 0.55, 0.06, false)); nb.userData.noCollide = true;
      for (let k = 0; k < 5; k++) { const pp = add(mesh(new THREE.PlaneGeometry(0.16, 0.2), std([0xffffff, 0xfff3b0, 0xcfe8ff][k % 3], 0.9), -1.72 + k * 0.16, 0.52 + (k % 2) * 0.12, 0.072, false)); pp.rotation.z = (Math.random() - 0.5) * 0.2; pp.userData.noCollide = true; }
    } else if (rung === 1) {
      // Phone booth: shell, felt, glass side panels, a desk shelf, a fan.
      const shell = std(0x2f3237, 0.5, 0.1);
      wallX(I.x0 - 0.05, I.x1 + 0.05, I.z0 - 0.04, -1, L.top + 0.06, shell, 0.04);
      wallZ(I.z0 - 0.06, 0, I.x0 - 0.04, -1, L.top + 0.06, shell, 0.04);
      wallZ(I.z0 - 0.06, 0, I.x1 + 0.04, -1, L.top + 0.06, shell, 0.04);
      const roof = add(mesh(new THREE.BoxGeometry(iw + 0.14, 0.08, id + 0.12), shell, 0, L.top + 0.04, I.z0 / 2 - 0.02, false)); roof.userData.noCollide = true;
      const glassMat = new THREE.MeshStandardMaterial({ color: 0xdfe8ee, roughness: 0.05, transparent: true, opacity: 0.1, envMapIntensity: 0.45, depthWrite: false });
      for (const [x0, x1] of [[I.x0 - 0.06, dx0], [dx1, I.x1 + 0.06]]) {
        add(mesh(new THREE.BoxGeometry(x1 - x0, L.top + 1, 0.014), glassMat, (x0 + x1) / 2, (L.top - 1) / 2, 0, false));
        const post = add(mesh(new THREE.BoxGeometry(0.03, L.top + 1, 0.04), std(0x3a3d42, 0.35, 0.7), x0 < 0 ? x0 + 0.015 : x1 - 0.015, (L.top - 1) / 2, 0, false)); void post;
      }
      const head = add(mesh(new THREE.BoxGeometry(iw + 0.12, L.top - (-1 + D.h), 0.04), std(0x3a3d42, 0.35, 0.7), 0, (L.top + (-1 + D.h)) / 2, 0, false)); head.userData.noCollide = true;
      const desk = add(mesh(rbox(iw - 0.02, 0.03, 0.34, 0.01), new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0xc8a882, roughness: 0.5 }), 0, -0.07, I.z0 + 0.18, false)); desk.userData.noCollide = true;
      const plate = add(mesh(new THREE.BoxGeometry(0.12, 0.012, 0.06), std(0x1c1d20, 0.4), 0.3, -0.05, I.z0 + 0.1, false)); plate.userData.noCollide = true;
      const fan = add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.01, 24), std(0x1c1d20, 0.6), 0.25, L.top - 0.006, -0.3, false)); fan.userData.noCollide = true;
      // the office: desks with monitors and chairs, a plant
      const deskTop = std(0xe8e4dc, 0.45);
      for (const z of [-2.2, -0.4, 1.4, 3.0]) {
        add(mesh(new THREE.BoxGeometry(1.6, 0.03, 0.75), deskTop, 2.8, -0.27, z));
        for (const x of [2.05, 3.55]) add(mesh(new THREE.BoxGeometry(0.04, 0.72, 0.65), std(0x3a3c40, 0.4, 0.6), x, -0.64, z, false));
        const mon = add(mesh(new THREE.BoxGeometry(0.55, 0.33, 0.03), std(0x16171a, 0.3), 2.8, 0.02, z - 0.22, false)); mon.userData.noCollide = true;
        const scr = add(new THREE.Mesh(new THREE.PlaneGeometry(0.51, 0.29), new THREE.MeshBasicMaterial({ color: [0x2c4a6e, 0x38506a, 0x24384e][Math.floor(Math.random() * 3)] })));
        scr.position.set(2.8, 0.02, z - 0.204); scr.userData.noCollide = true;
      }
      add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.45, 20), std(0xeae4d8, 0.7), -3.5, -0.78, 3.4));
      // the wall facing the booth door: low storage, a big print, a clock
      const cabs = add(mesh(new THREE.BoxGeometry(3.2, 0.8, 0.45), std(0xd8d2c8, 0.5), -0.6, -0.6, O.z1 - 0.28)); void cabs;
      for (let k = 0; k < 4; k++) { const dline = add(mesh(new THREE.BoxGeometry(0.01, 0.76, 0.01), std(0x8a8680, 0.5), -2.2 + k * 0.8 + 0.8, -0.6, O.z1 - 0.5, false)); dline.userData.noCollide = true; }
      const printT = canvasTex(256, 160, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#e9c9a0"); gr.addColorStop(1, "#7aa0b8"); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = "#f6e6c8"; g.beginPath(); g.arc(180, 60, 22, 0, Math.PI * 2); g.fill(); g.fillStyle = "#4a6a7a"; g.beginPath(); g.moveTo(0, 120); for (let x = 0; x <= w; x += 16) g.lineTo(x, 100 + Math.sin(x * 0.05) * 14); g.lineTo(w, h); g.lineTo(0, h); g.fill(); });
      const print = add(mesh(new THREE.BoxGeometry(1.5, 0.95, 0.03), new THREE.MeshStandardMaterial({ map: printT, roughness: 0.6 }), -0.6, 0.55, O.z1 - 0.07, false)); print.rotation.y = Math.PI; print.userData.noCollide = true;
    } else if (rung === 3) {
      // Closet: shelves at shoulder height, boxes, paint, towels, a mop.
      const shelfM = new THREE.MeshStandardMaterial({ map: makeWoodTexture(), color: 0xc9b08a, roughness: 0.6 });
      const cardboard = canvasTex(128, 128, (g, w, h) => { g.fillStyle = "#b08a5c"; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(60,40,20,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); } g.fillStyle = "rgba(210,190,150,0.8)"; g.fillRect(0, 56, w, 16); });
      const boxM = new THREE.MeshStandardMaterial({ map: cardboard, roughness: 0.9 });
      for (const side of [-1, 1]) {
        const sx = side * (0.5 - 0.1);
        for (const y of [-0.55, -0.05, 0.42, 0.82]) {
          const sh = add(mesh(new THREE.BoxGeometry(0.2, 0.022, 0.8), shelfM, sx, y, -0.56)); sh.userData.noCollide = true;
          const n = 1 + Math.floor(Math.random() * 3);
          for (let k = 0; k < n; k++) {
            const pick = Math.random(), z = -0.82 + k * 0.26 + Math.random() * 0.04;
            let it;
            if (pick < 0.45) { const bh = 0.14 + Math.random() * 0.14; it = mesh(new THREE.BoxGeometry(0.17, bh, 0.24), boxM, sx, y + 0.011 + bh / 2, z); }
            else if (pick < 0.7) { it = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 18), std([0x9aa4ac, 0xc8c2b6][k % 2], 0.35, 0.7), sx, y + 0.086, z); }
            else { it = mesh(rbox(0.18, 0.1, 0.24, 0.03), fabric([0x7a9ab8, 0xd8c8b0, 0xb87a6a][k % 3]), sx, y + 0.061, z); }
            it.userData.noCollide = true; add(it);
          }
        }
        for (const z of [-0.95, -0.17]) { const up = add(mesh(new THREE.BoxGeometry(0.2, 1.9, 0.02), shelfM, sx, -0.05, z)); up.userData.noCollide = true; }
      }
      const bucket = add(mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.26, 20, 1, true), std(0x4a7ab0, 0.5), 0.12, -0.87, I.z0 + 0.16, false)); bucket.userData.noCollide = true; bucket.material.side = THREE.DoubleSide;
      const mop = add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.3, 8), std(0xb08a60, 0.6), 0.16, -0.3, I.z0 + 0.12, false)); mop.rotation.x = 0.12; mop.rotation.z = -0.08; mop.userData.noCollide = true;
      const fuse = add(mesh(new THREE.BoxGeometry(0.22, 0.28, 0.07), std(0xb8b6b0, 0.5), 0.14, 0.86, I.z0 + 0.085, false)); fuse.userData.noCollide = true;
      const fuseLbl = add(mesh(new THREE.BoxGeometry(0.08, 0.03, 0.005), std(0xe2d8b8, 0.8), 0.14, 0.95, I.z0 + 0.122, false)); fuseLbl.userData.noCollide = true;
      // hallway: runner, radiator, a picture, a door at the far end
      const rugMaps = makeRugMaps();
      const runner = add(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 2.2), new THREE.MeshStandardMaterial({ map: rugMaps.albedo, normalMap: rugMaps.normal, color: 0x8a7a70, roughness: 0.98 })));
      runner.rotation.x = -Math.PI / 2; runner.position.set(0, -0.993, 1.35); runner.receiveShadow = true; runner.userData.noCollide = true;
      add(mesh(new THREE.BoxGeometry(0.9, 0.5, 0.08), std(0xe8e6e0, 0.5), -0.7, -0.5, O.z1 - 0.1));
      const pic = add(mesh(new THREE.BoxGeometry(0.02, 0.4, 0.55), std(0x3a2a1c, 0.5), O.x1 - 0.06, 0.55, 1.2, false)); pic.userData.noCollide = true;
      const farDoor = add(mesh(new THREE.BoxGeometry(0.84, 2.0, 0.04), std(0xf0ece2, 0.5), 0.6, 0, O.z1 - 0.06, false)); farDoor.userData.noCollide = true;
    }
    // Door click target: the leaf (or the lift's leaves).
    for (const leaf of doorLeaves) clickables.push({ obj: leaf, act: "door", reach: 1.9 });
  }

  // ---------------- MRI ----------------
  // You lie on the table. The world is built in the patient's own frame
  // (table top y = 0, eye at y = EYE, head toward +z, feet toward −z) and
  // turned so the eye's upward gaze becomes the camera's forward: looking
  // "up" is the bore just above your face, looking "down" runs along your
  // body to your feet, and turning your head turns it about your long axis.
  // The turn stops TILT short of a right angle — the chin tucked on the
  // pillow — because the body lies just below eye level, which a camera that
  // can't pitch past straight down would otherwise never reach.
  // The table slides in by moving the room (and scanner) past you.
  const P = new THREE.Group();
  const room = new THREE.Group();
  // Head on a wedge pillow: the eye sits a hand above the chest, so a glance
  // down the body finds it (flat, the body would sit exactly at eye level).
  const EYE = 0.34, BORE_R = 0.34, BORE_Y = 0.22, SLIDE = 1.3, TILT = 0.52;
  let slideK = 0, slideTarget = 0, boreLight = null;
  if (MRI) {
    if (r) r.toneMappingExposure = 0.88;
    P.rotation.x = -Math.PI / 2 + TILT;
    // camera eye (groundY −1 + 1.62) lands on local (0, EYE, 0)
    P.position.set(0, 0.62 - EYE * Math.sin(TILT), EYE * Math.cos(TILT));
    add(P); P.add(room);
    const FLOOR = -0.78, TOP = 1.95;
    // Room shell.
    const vinyl = new THREE.MeshStandardMaterial({ map: noiseTex("#7d8a96", 0.06, [5, 5]), roughness: 0.45, envMapIntensity: 0.3 });
    const fl = mesh(new THREE.PlaneGeometry(5.2, 8), vinyl, 0, FLOOR, -0.6, false); fl.rotation.x = -Math.PI / 2; room.add(fl);
    const cl = mesh(new THREE.PlaneGeometry(5.2, 8), std(0xeef0f0, 0.95), 0, TOP, -0.6, false); cl.rotation.x = Math.PI / 2; room.add(cl);
    const wm = wallMatOf(0xc4ccd2);
    for (const [w, x, z, ry] of [[5.2, 0, -4.6, 0], [5.2, 0, 3.4, Math.PI], [8, -2.6, -0.6, Math.PI / 2], [8, 2.6, -0.6, -Math.PI / 2]]) {
      const m = mesh(new THREE.PlaneGeometry(w, TOP - FLOOR), wm, x, (TOP + FLOOR) / 2, z, false); m.rotation.y = ry; room.add(m);
    }
    // A backlit "sky" ceiling panel over the table — MRI suites really have them.
    const skyT = canvasTex(256, 256, (g, w, h) => {
      const sk = g.createLinearGradient(0, 0, 0, h); sk.addColorStop(0, "#7fb2e6"); sk.addColorStop(1, "#cfe4f6"); g.fillStyle = sk; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) { const x = Math.random() * w, y = Math.random() * h, rr = 20 + Math.random() * 40; const cg = g.createRadialGradient(x, y, 0, x, y, rr); cg.addColorStop(0, "rgba(255,255,255,0.9)"); cg.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
      g.strokeStyle = "rgba(40,60,30,0.85)"; g.lineCap = "round";
      const br = (x, y, a, len, wd) => { if (wd < 0.8) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.lineWidth = wd; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); g.fillStyle = "rgba(70,120,50,0.8)"; g.beginPath(); g.arc(x2, y2, wd * 1.6, 0, Math.PI * 2); g.fill(); br(x2, y2, a - 0.5, len * 0.7, wd * 0.65); br(x2, y2, a + 0.4, len * 0.7, wd * 0.62); };
      br(0, 30, 0.35, 60, 7); br(w, h - 20, Math.PI + 0.3, 55, 6);
    });
    const skyP = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.8), new THREE.MeshBasicMaterial({ map: skyT, toneMapped: false, color: 0xa8a8a8 }));
    skyP.rotation.x = Math.PI / 2; skyP.rotation.z = Math.PI; skyP.position.set(0, TOP - 0.01, -0.8); room.add(skyP);
    for (const z of [-2.6, 1.4]) { const lp = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ emissive: 0xf4f6ff, emissiveIntensity: 0.9, color: 0xffffff })); lp.rotation.x = Math.PI / 2; lp.position.set(0, TOP - 0.01, z); room.add(lp); }
    const rl1 = new THREE.PointLight(0xf6f8ff, 2.2, 10, 2); rl1.position.set(0, TOP - 0.2, -1.2); rl1.castShadow = !IS_LOW_POWER; rl1.shadow.mapSize.set(1024, 1024); rl1.shadow.bias = -0.002; room.add(rl1);
    const rl2 = new THREE.PointLight(0xf6f8ff, 1.5, 8, 2); rl2.position.set(0, TOP - 0.2, 2.6); room.add(rl2);
    // Hemisphere "up" is the room's up — which, in this turned frame, is (0, sin, −cos) of the tilt.
    const hemi = add(new THREE.HemisphereLight(0xeef4ff, 0x606870, 0.32)); hemi.position.set(0, Math.sin(TILT), -Math.cos(TILT));
    // A door at the foot end, a cabinet, a clock — the suite is a room, not a void.
    const accent = std(0x5a7a94, 0.6);
    for (const [x, z, ry, w] of [[0, -4.57, 0, 5.2], [2.57, -0.6, -Math.PI / 2, 8]]) { const b = mesh(new THREE.BoxGeometry(w, 0.08, 0.02), accent, x, FLOOR + 1.0, z, false); b.rotation.y = ry; room.add(b); }
    const dr = mesh(new THREE.BoxGeometry(1.0, 2.05, 0.05), std(0x8a6a4c, 0.55), 1.2, FLOOR + 1.025, -4.56, false); room.add(dr);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (g) => { g.fillStyle = "#f2c230"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#1a1a1a"; g.font = "bold 58px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("MR", 64, 68); }) }));
    sign.position.set(1.2, FLOOR + 1.6, -4.53); room.add(sign);
    const cab = mesh(new THREE.BoxGeometry(0.5, 1.9, 1.4), std(0xe6e8ea, 0.5), 2.3, FLOOR + 0.95, -2.4); room.add(cab);
    const cabLine = mesh(new THREE.BoxGeometry(0.01, 1.86, 0.01), std(0x9aa0a6, 0.5), 2.045, FLOOR + 0.95, -2.4, false); room.add(cabLine);
    // Control-room window with the technician on the other side.
    const ctrlT = canvasTex(256, 160, (g, w, h) => {
      g.fillStyle = "#3a4450"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#e8d8b8"; g.fillRect(0, 0, w, 24);
      for (const x of [40, 110, 180]) { g.fillStyle = "#101418"; g.fillRect(x, 60, 56, 38); g.fillStyle = "#4a8ab8"; g.fillRect(x + 3, 63, 50, 32); }
      g.fillStyle = "#6a5a4a"; g.fillRect(0, 110, w, 50);
      g.fillStyle = "#1e2a36"; g.beginPath(); g.arc(150, 92, 13, 0, Math.PI * 2); g.fill(); g.fillRect(134, 104, 32, 40);
    });
    const ctrl = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.0), new THREE.MeshBasicMaterial({ map: ctrlT, color: 0xbfbfbf }));
    ctrl.rotation.y = Math.PI / 2; ctrl.position.set(-2.58, 0.45, 0.8); room.add(ctrl);
    for (const y of [-0.07, 0.97]) room.add(mesh(new THREE.BoxGeometry(0.06, 0.05, 1.9), std(0xd8dcde, 0.4), -2.58, y, 0.8, false));
    // The gantry: a white housing with the bore through it, a flared mouth.
    const GZ = 0.5, GD = 1.5;   // mouth at z = 0.5 before sliding in
    const outer = new THREE.Shape();
    const gw = 1.1, gy0 = FLOOR, gy1 = FLOOR + 2.15, cr = 0.4;
    outer.moveTo(-gw + cr, gy0); outer.lineTo(gw - cr, gy0); outer.quadraticCurveTo(gw, gy0, gw, gy0 + cr); outer.lineTo(gw, gy1 - cr); outer.quadraticCurveTo(gw, gy1, gw - cr, gy1);
    outer.lineTo(-gw + cr, gy1); outer.quadraticCurveTo(-gw, gy1, -gw, gy1 - cr); outer.lineTo(-gw, gy0 + cr); outer.quadraticCurveTo(-gw, gy0, -gw + cr, gy0);
    const hole = new THREE.Path(); hole.absarc(0, BORE_Y, BORE_R + 0.2, 0, Math.PI * 2, true); outer.holes.push(hole);
    const shellMat = new THREE.MeshPhysicalMaterial({ color: 0xf1f3f5, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.8 });
    const gantry = new THREE.Mesh(new THREE.ExtrudeGeometry(outer, { depth: GD, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 48 }), shellMat);
    gantry.position.z = GZ; gantry.castShadow = !IS_LOW_POWER; gantry.receiveShadow = true; room.add(gantry);
    // flared mouths (front and back): a lathe from the bore out to the housing hole
    // Each mouth narrows from the housing's hole at the face to the bore,
    // 0.22 m in (lathe y runs from the bore up to the face).
    const MD = 0.22;
    const mouthPts = []; for (let k = 0; k <= 10; k++) { const u = k / 10; mouthPts.push(new THREE.Vector2(BORE_R + 0.2 * Math.pow(u, 1.6), MD * (1 - Math.cos(u * Math.PI / 2)))); }
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xdfe5ec, roughness: 0.35, side: THREE.DoubleSide });
    for (const [face, dir] of [[GZ, 1], [GZ + GD, -1]]) {
      // dir = which way is "into the gantry" from this face
      const m = new THREE.Mesh(new THREE.LatheGeometry(mouthPts, 64), mouthMat);
      m.rotation.x = dir > 0 ? -Math.PI / 2 : Math.PI / 2;   // lathe +y → toward the face
      m.position.set(0, BORE_Y, face + dir * MD); room.add(m);
      const accent = new THREE.Mesh(new THREE.TorusGeometry(BORE_R + 0.205, 0.012, 8, 64), std(0x2f6fb0, 0.4)); accent.position.set(0, BORE_Y, face - dir * 0.045); room.add(accent);
    }
    // bore liner, its light strip and a ventilation grille at the far end
    // The liner: moulded panels with seams, a couple of labels, faint scuffs.
    const linerT = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = "#e4e6e8"; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.035})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1); }
      g.strokeStyle = "rgba(60,66,72,0.16)"; g.lineWidth = 1.5;
      for (const x of [w * 0.125, w * 0.375, w * 0.625, w * 0.875]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (const y of [h * 0.33, h * 0.66]) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = "rgba(90,110,130,0.5)"; g.fillRect(w * 0.44, h * 0.12, 26, 10); g.fillRect(w * 0.54, h * 0.8, 40, 8);
      for (let k = 0; k < 14; k++) { g.fillStyle = "rgba(40,50,60,0.25)"; g.beginPath(); g.arc(w * 0.72 + (k % 7) * 7, h * 0.48 + Math.floor(k / 7) * 7, 2, 0, Math.PI * 2); g.fill(); }
    });
    const liner = new THREE.Mesh(new THREE.CylinderGeometry(BORE_R, BORE_R, GD - 2 * MD + 0.02, 64, 1, true), new THREE.MeshStandardMaterial({ map: linerT, color: 0xc8ccd0, roughness: 0.6, side: THREE.BackSide, envMapIntensity: 0.2 }));
    liner.rotation.x = Math.PI / 2; liner.position.set(0, BORE_Y, GZ + GD / 2); liner.receiveShadow = true; room.add(liner);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(0.035, GD - 2 * MD - 0.08), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0d8, emissiveIntensity: 0.7 }));
    strip.rotation.x = Math.PI / 2; strip.position.set(0, BORE_Y + BORE_R - 0.004, GZ + GD / 2); room.add(strip);
    boreLight = new THREE.PointLight(0xfff2e0, 0.22, 2.2, 2); boreLight.position.set(0, BORE_Y + BORE_R - 0.08, GZ + GD / 2); room.add(boreLight);
    // bore rails the table rides on
    for (const x of [-0.07, 0.07]) { const rl = mesh(new THREE.BoxGeometry(0.03, 0.02, GD - 2 * MD), std(0xb8bcc0, 0.3, 0.8), x, BORE_Y - BORE_R + 0.02, GZ + GD / 2, false); room.add(rl); }
    // a small status screen above the mouth
    const gC = document.createElement("canvas"); gC.width = 256; gC.height = 96; const gT = new THREE.CanvasTexture(gC); gT.colorSpace = THREE.SRGBColorSpace;
    const gScr = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), new THREE.MeshBasicMaterial({ map: gT, toneMapped: false }));
    gScr.rotation.set(0, Math.PI, Math.PI);   // reads upright from the table
    gScr.position.set(0, BORE_Y + BORE_R + 0.42, GZ - 0.05); room.add(gScr);
    gantryPaint = (line1, line2) => {
      const g = gC.getContext("2d"); g.fillStyle = "#0e1418"; g.fillRect(0, 0, 256, 96);
      g.fillStyle = "#8fd6ff"; g.font = "bold 30px sans-serif"; g.textAlign = "center"; g.fillText(line1, 128, 42);
      g.fillStyle = "#cfe6f2"; g.font = "24px sans-serif"; g.fillText(line2 || "", 128, 78); gT.needsUpdate = true;
    };
    gantryPaint("● READY", "");
    // table pedestal (part of the room; the table top slides over it)
    const ped = mesh(rbox(0.56, -0.16 - FLOOR, 1.6, 0.05), shellMat, 0, (FLOOR - 0.16) / 2, -0.4); room.add(ped);
    // ---- the patient (fixed to the camera) ----
    const tableM = std(0x2c3a52, 0.55);
    P.add(mesh(rbox(0.46, 0.06, 2.5, 0.025), tableM, 0, -0.03, -0.85));
    P.add(mesh(new THREE.BoxGeometry(0.28, 0.05, 2.5), std(0xd8dce0, 0.4), 0, -0.085, -0.85, false));
    // the blanket over your body: a draped sheet whose height follows your shape
    const prof = [[0.3, 0.02], [0.12, 0.12], [-0.25, 0.2], [-0.55, 0.22], [-0.85, 0.19], [-1.1, 0.17], [-1.45, 0.13], [-1.65, 0.145], [-1.95, 0.11], [-2.07, 0.19], [-2.14, 0.16], [-2.2, 0.02]];
    const hAt = (z) => { for (let k = 0; k < prof.length - 1; k++) { const [z0, h0] = prof[k], [z1, h1] = prof[k + 1]; if (z <= z0 && z >= z1) { const u = (z0 - z) / (z0 - z1); const s2 = u * u * (3 - 2 * u); return h0 + (h1 - h0) * s2; } } return 0.02; };
    const bg = new THREE.PlaneGeometry(0.52, 2.5, 20, 60); bg.rotateX(-Math.PI / 2);
    const bp = bg.attributes.position;
    for (let k = 0; k < bp.count; k++) {
      const x = bp.getX(k), z = bp.getZ(k) - 0.95;
      const h = hAt(z), wx = Math.abs(x) / 0.26;
      const drape = Math.max(0, 1 - Math.pow(wx, 3.2));
      bp.setXYZ(k, x * (1 - 0.06 * drape), 0.012 + h * Math.sqrt(drape) + Math.sin(z * 9 + x * 5) * 0.006 * drape, z);
    }
    bg.computeVertexNormals();
    const blanket = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ map: noiseTex("#8fb0cc", 0.1, [2, 6]), color: 0xffffff, roughness: 0.95, side: THREE.DoubleSide }));
    blanket.castShadow = !IS_LOW_POWER; blanket.receiveShadow = true; P.add(blanket);
    // the call ball in your hand, resting on your belly, its cable off the side
    callBall = mesh(new THREE.SphereGeometry(0.038, 18, 14), std(0xe8742c, 0.45), 0.09, hAt(-0.78) + 0.04, -0.78, false);
    callBall.scale.set(1, 0.85, 1.25); P.add(callBall);
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0.09, hAt(-0.82) + 0.03, -0.83), new THREE.Vector3(0.22, 0.1, -0.9), new THREE.Vector3(0.3, 0.02, -1.0), new THREE.Vector3(0.31, -0.02, -1.6)]), 24, 0.005, 6), std(0x6a6e74, 0.6));
    P.add(cable);
    clickables.push({ obj: callBall, act: "ball", reach: 9 });
    noCol(P);
    camera.fov = 74; camera.updateProjectionMatrix();
  }

  // ---------------- The coach ----------------
  const E_COACH = [
    { sizeMul: 0.40, tau: 11, hFloor: 0.30 },
    { sizeMul: 0.50, tau: 12, hFloor: 0.32 },
    { sizeMul: 0.62, tau: 14, hFloor: 0.34 },
    { sizeMul: 0.74, tau: 16, hFloor: 0.36 },
    { sizeMul: 0.86, tau: 18, hFloor: 0.38 },
  ][rung];
  // The skill star is the hotbar's verbs, in the space: close the door and
  // go and touch the far wall; in the booth, a hand on two of its walls;
  // ride the lift; pull the closet light. (The scanner is lying still.)
  const eSkill = [
    { id: "shutTouch",  icon: "✋", verb: "door",  need: 2, text: window.t("dc.e.gShutTouch", "Close the door, then touch the far wall") },
    { id: "touchWalls", icon: "✋", verb: "door",  need: 2, text: window.t("dc.e.gTouchWalls", "Door closed, rest a hand on two of the walls") },
    { id: "ride",  icon: "↕",  verb: "ride",  need: 2, text: window.t("dc.e.gRide", "Ride two floors with the doors shut") },
    { id: "dark",  icon: "💡", verb: "light", text: window.t("dc.e.gDark", "Pull the light off for 5 seconds") },
    { id: "scan",  icon: "🥁", text: window.t("dc.e.gScan", "Lie still through a whole scan") },
  ][rung];
  const coach = makeCreatureCoach({
    kit: creatureKit("enclosed"),
    stage: document.getElementById("stage"),
    levelIdx: rung, intensity: rung >= 4 ? "apex" : rung >= 2 ? "alert" : "calm",
    dogName: window.t("coach.e.name", "the space"), title: window.t(`level.enclosed.${rung}.title`, level.title),
    inZoneDist: 1.0, nearD: 0.2, farSpan: 2.6,
    sizeMul: E_COACH.sizeMul, tau: E_COACH.tau, hFloor: E_COACH.hFloor,
    minHold: level.minHold || 12, coarse: IS_COARSE_POINTER,
    holdText: LIFT ? { begin: () => window.t("dc.e.hBeginLift", "Step into the lift and press a floor to begin — at your pace"), back: () => window.t("dc.e.hBackLift", "Paused — the doors are open. Close them, or ride again, to carry on") }
      : MRI ? { begin: () => window.t("dc.e.hBeginMri", "Tap “Slide in” when you're ready — at your pace"), back: () => window.t("dc.e.hBackMri", "Paused — you're out of the scanner. Slide back in when you're ready") }
      : null,
    expect: (() => { const e = window.__pendingExpect; return (e && e.phobia === "enclosed" && e.level === levelIdx) ? e : null; })(),
    goals: [
      eSkill,
      { id: "read", icon: "👁", need: 2, text: window.t("dc.e.gRead", "Name what you feel and hear") },
      { id: "settle", icon: "〰", required: true, text: window.t("dc.gSettle", "Stay until your alarm settles") },
    ],
  });
  const footText = () => (!lightOn && (rung === 0 || rung === 3))
    ? window.t("dc.e.footDark", "lights off, door closed")
    : window.t(`dc.e.foot.${rung}`, ["door closed, lights on", "a glass door, walls within reach", "doors shut between floors", "shelves at your shoulders", "inside the scanner"][rung]);
  coach.setFoot(footText());
  window.__coach = coach;
  let lastDist = 9;
  if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(() => coach.target(), (st) => coach.pulse(st, "event", lastDist));
  window.__holdPolicy = coach.holdPolicy;
  const sig = (id) => {
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return false;
    return coach.signal(id, { dist: lastDist });
  };

  // ---------------- State + actions ----------------
  let clock = 0, disposed = false, inside = false, shut = false, wasEngaged = false;
  let everClosedInside = false, darkT = 0, reachT = 0, touchT = 0, sigGap = 4, moved = 0, prevX = null, prevZ = null;
  let latchSaid = false, ventSaid = false, humSaid = false, knockSaid = false, nextEventAt = 9 + Math.random() * 4;
  const bodySaid = {};
  const A = () => window.PhobiaAudio;
  const doorWorld = () => new THREE.Vector3(L ? L.door.x0 + L.door.w / 2 : 0, 0, 0);
  function setDoor(open, byPlayer) {
    if (MRI) return;
    const was = doorTarget;
    doorTarget = open ? 1 : 0;
    if (was === doorTarget) return;
    const dp = doorWorld();
    try {
      if (LIFT) A() && A().machineHum && A().machineHum(1.5, 110, 0.035, { x: dp.x, y: 0, z: dp.z });
      else A() && A().doorCreak && A().doorCreak({ x: dp.x, y: 0, z: dp.z });
    } catch {}
    if (byPlayer) reachT = 0.7;
    if (open && byPlayer && coach.engaged) { coach.note("door"); coach.safety("door"); }
  }
  // Lift.
  let floor = 1, liftState = "open", liftTarget = 1, moveT = 0, moveDur = 0, idleT = 0, floorsRidden = 0, rideStartInside = false, liftPrevPz = 0;
  function liftGo(n) {
    if (!LIFT) return;
    if (!inside) { coach.teach("liftOut", window.t("dc.e.tLiftOut", "Step inside the lift first — then pick a floor."), 4500, true); return; }
    if (liftState === "moving" || n === floor) return;
    liftTarget = n;
    if (cop) { const b = cop.userData.floorBtns[n]; if (b) b.material.emissiveIntensity = 0.9; }
    try { A() && A().indicatorClick && A().indicatorClick(); } catch {}
    if (doorAmt > 0.001 || doorTarget > 0) { setDoor(false, false); liftState = "closing"; } else startRide();
  }
  function startRide() {
    liftState = "moving"; moveT = 0; moveDur = 2.4 + 2.6 * Math.abs(liftTarget - floor);
    rideStartInside = inside;
    try { A() && A().machineHum && A().machineHum(moveDur, 55, 0.07); } catch {}
    coach.pulse(0.22, "noise", lastDist);
    if (!humSaid) setTimeout(() => { if (!disposed && sig("hum")) humSaid = true; }, 1500);
  }
  // MRI.
  let mriState = "out", scanOn = false, scanT = 0, scanDur = 0, nextScanAt = 0, scanHandle = null, scansDone = 0, techSaid = false;
  function slide(inward) {
    if (!MRI) return;
    if (inward && mriState === "out") {
      mriState = "sliding"; slideTarget = 1;
      try { A() && A().machineHum && A().machineHum(SLIDE / 0.2 + 0.4, 70, 0.05); } catch {}
    } else if (!inward && mriState !== "out") {
      if (coach.engaged) { coach.note("out"); coach.note("door"); coach.safety("out"); }
      stopScan(false);
      mriState = "out"; slideTarget = 0;
      coach.teach("techOut" + Date.now(), window.t("dc.e.tTechOut", "Technician: “I'm here — sliding you out now.”"), 4000, true);
      try { A() && A().machineHum && A().machineHum(SLIDE / 0.3 + 0.3, 70, 0.05); } catch {}
    }
  }
  function startScan() {
    scanOn = true; scanT = 0; scanDur = 6 + Math.random() * 4;
    try { scanHandle = A() && A().mriSequence ? A().mriSequence(scanDur) : null; } catch { scanHandle = null; }
    coach.pulse(0.26, "noise", lastDist); coach.note("knock");
    if (!knockSaid) setTimeout(() => { if (!disposed && scanOn && sig("knock")) knockSaid = true; }, 900);
  }
  function stopScan(completed) {
    if (!scanOn) return;
    scanOn = false;
    try { if (scanHandle && !completed) scanHandle.stop(); } catch {}
    scanHandle = null;
    if (completed) {
      scansDone++; if (coach.engaged) coach.goalDone("scan");
      try { window.PhobiaExperiments && window.PhobiaExperiments.signal("mri.scan"); } catch {}
    }
    nextScanAt = clock + 5 + Math.random() * 4;
  }
  function toggleLight() {
    if (MRI || LIFT) return;
    lightOn = !lightOn;
    coach.setFoot(footText());
    try { A() && A().indicatorClick && A().indicatorClick(); } catch {}
    if (rung === 3 && cordBead) cordBead.userData.pull = 1;
  }
  function act(a) {
    if (a === "door") setDoor(doorTarget < 0.5, true);
    else if (a === "open") { if (LIFT) liftOpen(); else setDoor(true, true); }
    else if (a === "close") { if (LIFT) { if (liftState === "open") { setDoor(false, true); liftState = "closing-idle"; } } else setDoor(false, true); }
    else if (a === "light") toggleLight();
    else if (a === "ride") liftGo(floor <= 2 ? floor + 2 : floor - 2);
    else if (/^floor\d$/.test(a)) liftGo(+a.slice(5));
    else if (a === "slide") slide(mriState === "out");
    else if (a === "ball") slide(false);
    else if (a === "touch") touchWallNow();
  }
  // A hand flat on a wall: the one you're facing within reach (else the
  // nearest). Counted on the first two rungs with the door shut — the walls
  // of a small space, touched by choice, are the space's real size.
  let touchWall = null;
  const touched = new Set();
  function touchWallNow() {
    touchT = 3;
    const c = controlsRef; if (!c || !I || !inside) { touchWall = null; return; }
    const px = c.position.x, pz = c.position.z, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    const cands = [["left", I.x0 + 0.05, pz, 1, 0], ["right", I.x1 - 0.05, pz, -1, 0], ["back", px, I.z0 + 0.05, 0, 1]];
    let best = null, score = -9;
    for (const w of cands) {
      const dx = w[1] - px, dz = w[2] - pz, dd = Math.hypot(dx, dz);
      if (dd > 0.9) continue;
      const sc = (dx * fx + dz * fz) / (dd || 1) - dd * 0.5;
      if (sc > score) { score = sc; best = w; }
    }
    touchWall = best;
    if (!best) return;
    if (!shut) return;
    if (rung === 0 && best[0] === "back") coach.goalCount("shutTouch", 2);
    if (rung === 1) { touched.add(best[0]); coach.goalCount("touchWalls", touched.size); }
    coach.note("touch");
  }
  function liftOpen() {
    if (liftState === "moving") { coach.teach("liftMoving" + Math.floor(clock / 6), window.t("dc.e.tLiftMoving", "Lift doors open at a floor — you'll be there in a few seconds."), 4000, true); return; }
    if (doorTarget < 0.5) {
      setDoor(true, true); liftState = "opening";
      if (cop) for (const n in cop.userData.floorBtns) cop.userData.floorBtns[n].material.emissiveIntensity = 0;
    }
  }

  // ---------------- Input: clicks, keys, command bar ----------------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const canvasEl = r ? r.domElement : document.querySelector("#stage canvas");
  let downX = 0, downY = 0, downT = 0, downId = -1, controlsRef = null;
  const onDown = (e) => { downX = e.clientX; downY = e.clientY; downT = performance.now(); downId = e.pointerId; };
  const onUp = (e) => {
    if (e.pointerId !== downId || Math.hypot(e.clientX - downX, e.clientY - downY) > 6 || performance.now() - downT > 400) return;
    const rect = canvasEl.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(clickables.map((c) => c.obj), true);
    if (!hits.length) return;
    let o = hits[0].object, c = null;
    while (o && !(c = clickables.find((k) => k.obj === o))) o = o.parent;
    if (!c) return;
    const pp = controlsRef ? controlsRef.position : null;
    const wp = hits[0].point;
    if (pp && Math.hypot(wp.x - pp.x, wp.z - pp.z) > c.reach) return;
    act(c.act);
  };
  if (canvasEl) { canvasEl.addEventListener("pointerdown", onDown); canvasEl.addEventListener("pointerup", onUp); }
  const onKey = (e) => {
    if (e.code !== "KeyE" || e.repeat || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    if (MRI) act(mriState === "out" ? "slide" : "ball");
    // Lift: outside, E calls it (opens the doors); inside, E rides two floors.
    // Opening the doors from inside is its own button, never a side effect.
    else if (LIFT) { if (!inside) act("open"); else if (liftState !== "moving") act("ride"); }
    else act("door");
  };
  window.addEventListener("keydown", onKey);
  function wireCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="enclosed"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    bar.querySelectorAll("[data-cmd]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); act(b.dataset.cmd); }; });
  }
  const timers = [setTimeout(wireCmds, 0), setTimeout(wireCmds, 400)];
  const syncCmdLabels = () => {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="enclosed"]');
    if (!bar) return;
    const db = bar.querySelector('[data-cmd="door"] .cmd-label');
    if (db) { const want = doorTarget > 0.5 ? window.t("cmd.e.close", "Close the door") : window.t("cmd.e.open", "Open the door"); if (db.textContent !== want) db.textContent = want; }
    const sb = bar.querySelector('[data-cmd="slide"] .cmd-label');
    if (sb) { const want = mriState === "out" ? window.t("cmd.e.slideIn", "Slide in") : window.t("cmd.e.slideOut", "Squeeze the ball"); if (sb.textContent !== want) sb.textContent = want; }
  };

  // Paint the lift displays.
  if (digitPaint) digitPaint(1, 0);
  if (lobbyPaint) lobbyPaint(1);

  const I = L ? L.in : null;
  const _wp = new THREE.Vector3(), _n = new THREE.Vector3();
  return {
    controls: MRI ? {
      mode: "walkable", initialPos: [0, 0, 0], initialYaw: 0, initialPitch: -0.72,
      bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, speed: 0, lookSpeed: 0.003,
      pitchMin: -1.4, pitchMax: 1.0, yawMin: -1.1, yawMax: 1.1,
      cameraModeLocked: "fp",
    } : {
      mode: "walkable",
      initialPos: [L.spawn.x, 0, L.spawn.z], initialYaw: 0, initialPitch: -0.05,
      bounds: { minX: Math.min(I.x0, L.out.x0) + 0.3, maxX: Math.max(I.x1, L.out.x1) - 0.3, minZ: Math.min(I.z0, L.out.z0 != null ? L.out.z0 : 0) + 0.3, maxZ: L.out.z1 - 0.3 },
      speed: 1.1, lookSpeed: 0.0035,
      cameraModeLocked: "fp",
    },
    still: MRI,
    body: MRI ? false : undefined,
    hands: MRI ? undefined : { skinColor: 0xd4a07a, sleeveColor: 0x3d3d45 },
    bloom: { strength: 0.3, threshold: 0.92 },
    // Matte rooms get no reflection map: it lit a switched-off closet like day.
    environment: rung === 0 || rung === 3 ? false : undefined,
    surface: ["soft", "soft", "hard", "wood", "hard"][rung],
    groundY: -1,
    onStaticColliders(boxes) { if (!MRI) boxes.push(doorBox); },
    interact(controls, hands) {
      if (!controls || MRI) return null;
      controlsRef = controls;
      const px = controls.position.x, pz = controls.position.z;
      const dp = doorWorld();
      const dDoor = Math.hypot(px - dp.x, pz - dp.z);
      // Hands: onto the handle as you work the door; flat on a wall when you touch it.
      if (hands && hands.setReachTarget) {
        if (reachT > 0 && doorPivot) {
          doorPivot.localToWorld(_wp.set(L.door.w - 0.08, 1.0, pz < 0 ? -0.05 : 0.05));
          hands.setReachTarget(_wp, { hand: "right", grip: "wrap", maxReach: 0.8 });
        } else if (touchT > 0 && inside && touchWall) {
          // The wall chosen at the touch, tracked as you shift: the side
          // walls follow your z, the back wall your x.
          const w = touchWall;
          const wx = w[0] === "back" ? px : w[1], wz = w[0] === "back" ? w[2] : pz;
          if (Math.hypot(px - wx, pz - wz) < 0.95) { _wp.set(wx, 0.35, wz); _n.set(w[3], 0, w[4]); hands.setReachTarget(_wp, { hand: "right", grip: "flat", normal: _n, maxReach: 0.85 }); }
          else hands.clearReachTarget();
        } else hands.clearReachTarget();
      }
      if (LIFT && inside && doorTarget > 0.5) return { gesture: "rest", hint: IS_COARSE_POINTER
        ? window.tf("hint.e.floorT", "tap {btn} below — or a floor on the panel", { btn: window.t("cmd.e.ride", "Ride two floors") })
        : window.t("hint.e.floor", "press a floor on the panel · E rides two floors") };
      if (dDoor < 1.4 && !LIFT) return { gesture: "rest", hint: IS_COARSE_POINTER
        ? (doorTarget > 0.5 ? window.t("hint.e.closeT", "tap the door, or the 🚪 button, to close it") : window.t("hint.e.openT", "tap the door, or the 🚪 button, to open it · you can leave any time"))
        : (doorTarget > 0.5 ? window.t("hint.e.close", "click the door to close it · E") : window.t("hint.e.open", "click the door to open it · E · you can leave any time")) };
      return { gesture: "rest" };
    },
    update(t, controls, dt) {
      const d = Math.min(0.1, dt || 0.016);
      clock += d;
      if (reachT > 0) reachT -= d;
      if (touchT > 0) touchT -= d;
      syncCmdLabels();
      // ---- Door ----
      if (!MRI) {
        const sp = LIFT ? 0.7 : 1.3;
        doorAmt += Math.sign(doorTarget - doorAmt) * Math.min(Math.abs(doorTarget - doorAmt), d * sp);
        const e2 = doorAmt * doorAmt * (3 - 2 * doorAmt);
        if (LIFT) for (const leaf of doorLeaves) leaf.position.x = leaf.userData.side * (L.door.w / 4 + e2 * L.door.w / 2);
        else if (doorPivot) doorPivot.rotation.y = L.door.swing * 1.5 * e2;
        const blocking = doorAmt < 0.55;
        if (blocking) { doorBox.minX = L.door.x0; doorBox.maxX = L.door.x0 + L.door.w; doorBox.minZ = -0.04; doorBox.maxZ = 0.04; }
        else { doorBox.minX = doorBox.maxX = 1e6; doorBox.minZ = doorBox.maxZ = 1e6; }
      }
      // ---- Lights ----
      if (gapStrip) { gapStrip.visible = doorAmt < 0.04; gapStrip.material.opacity = lightOn ? 0.35 : 1; }
      // Lights off: the sky fill goes too (the booth keeps the office's light through its glass).
      if (hemiL) { const hb = hemiL.userData.base != null ? hemiL.userData.base : (hemiL.userData.base = hemiL.intensity); hemiL.intensity += ((lightOn || !inside ? hb : hb * (rung === 1 ? 0.7 : 0.1)) - hemiL.intensity) * Math.min(1, d * 10); }
      for (const l of inLights) { const base = l.userData.base != null ? l.userData.base : (l.userData.base = l.intensity); l.intensity += ((lightOn ? base : 0) - l.intensity) * Math.min(1, d * 14); }
      for (const g of inGlow) { const base = g.userData.base != null ? g.userData.base : (g.userData.base = g.material.emissiveIntensity); g.material.emissiveIntensity = lightOn ? base : 0.02; }
      if (cordBead && cordBead.userData.pull > 0) { cordBead.userData.pull = Math.max(0, cordBead.userData.pull - d * 3); cordBead.position.y = L.top - 0.7 - Math.sin(cordBead.userData.pull * Math.PI) * 0.05; }
      if (wallClock) wallClock.userData.sec.rotation.z = -((Date.now() / 1000) % 60) / 60 * Math.PI * 2;
      if (!controls) return;
      controlsRef = controls;
      const px = controls.position.x, pz = controls.position.z;
      if (prevX != null) moved += Math.hypot(px - prevX, pz - prevZ);
      prevX = px; prevZ = pz;

      // ---- Where you are, and how shut in ----
      if (MRI) {
        slideK += Math.sign(slideTarget - slideK) * Math.min(Math.abs(slideTarget - slideK), d * (slideTarget > slideK ? 0.2 : 0.3));
        const e3 = slideK * slideK * (3 - 2 * slideK);
        room.position.z = -SLIDE * e3;
        if (mriState === "sliding" && slideK >= 0.999) {
          mriState = "in"; nextScanAt = clock + 5;
          if (!techSaid) { techSaid = true; coach.teach("tech1", window.t("dc.e.tTech", "Technician, in your headphones: “All good. The scans are loud — knocking, a few seconds each. Squeeze the ball any time and I'll hear you.”"), 9000); }
        }
        inside = slideK > 0.72; shut = inside;
        lastDist = 0.2 + (1 - e3) * 2.8;
        // scans
        if (mriState === "in" && !scanOn && clock > nextScanAt && !window.__rungHoldComplete) startScan();
        if (scanOn) {
          scanT += d;
          const left = Math.max(0, Math.ceil(scanDur - scanT));
          if (gantryPaint) gantryPaint("● " + window.t("mri.scanning", "SCANNING"), "0:" + String(left).padStart(2, "0"));
          P.position.x = Math.sin(clock * 71) * 0.0005;
          if (scanT >= scanDur) { stopScan(true); if (gantryPaint) gantryPaint("● " + window.t("mri.ready", "READY"), ""); }
        } else P.position.x = 0;
        // the bore's own sounds and air, between scans
        if (mriState === "in" && !scanOn && clock > nextEventAt && clock < nextScanAt - 2) {
          nextEventAt = clock + 10 + Math.random() * 6;
          if (!ventSaid && clock > 12) { if (sig("vent")) ventSaid = true; }
          else { try { A() && A().machineHum && A().machineHum(4, 48, 0.05); } catch {} coach.pulse(0.1, "noise", lastDist); if (!humSaid) setTimeout(() => { if (!disposed && sig("hum")) humSaid = true; }, 1200); }
        }
      } else {
        inside = px > I.x0 && px < I.x1 && pz > I.z0 && pz < -0.12;
        shut = doorAmt < 0.06;
        const deep = Math.hypot(px - L.deep.x, pz - L.deep.z);
        const dp = doorWorld();
        lastDist = inside ? (shut ? 0.2 + 0.25 * deep : 1.15 + 0.6 * doorAmt) : 1.6 + 0.6 * Math.hypot(px - dp.x, pz - dp.z);
        // the latch: closing yourself in
        if (inside && shut && doorTarget === 0 && !everClosedInside) {
          everClosedInside = true;
          if (!LIFT) {
            coach.pulse(0.18, "latch", lastDist);
            // Step one of the first two rungs' stars: the door is shut by you.
            if (rung === 0) coach.goalCount("shutTouch", 1);
            if (!latchSaid) setTimeout(() => { if (!disposed && sig("latch")) latchSaid = true; }, 700);
          }
        }
        // ---- Lift ----
        if (LIFT) {
          // Safety edge, as real lifts have: doors that are closing reopen
          // for anyone in the doorway or heading out. Shutting on a player
          // who is leaving (and shoving them back in) taught "trapped" —
          // the one belief this realm exists to undo.
          const headingOut = pz - liftPrevPz > 0.002;
          const atDoor = Math.abs(px) < 0.6 && pz > -0.55;
          liftPrevPz = pz;
          if ((liftState === "closing" || liftState === "closing-idle") && doorAmt > 0.02 && atDoor && (headingOut || Math.abs(pz) < 0.4)) {
            setDoor(true, false); liftState = "opening"; idleT = 0;
          }
          if (liftState === "closing" && doorAmt <= 0.001) startRide();
          else if (liftState === "closing-idle" && doorAmt <= 0.001) liftState = "closed";
          else if (liftState === "opening" && doorAmt >= 0.999) { liftState = "open"; idleT = 0; }
          else if (liftState === "moving") {
            moveT += d;
            const k = Math.min(1, moveT / moveDur);
            const shown = Math.round(floor + (liftTarget - floor) * Math.min(1, Math.max(0, (k - 0.1) / 0.8)));
            if (digitPaint && shown !== digitPaint._last) { digitPaint._last = shown; digitPaint(shown, Math.sign(liftTarget - floor)); }
            const acc = k < 0.12 || k > 0.88 ? 1 : 0.25;
            camera.position.y += Math.sin(clock * 11) * 0.0025 * acc;
            if (k >= 1) {
              const rode = Math.abs(liftTarget - floor);
              floor = liftTarget; liftState = "opening";
              if (digitPaint) { digitPaint._last = floor; digitPaint(floor, 0); }
              if (lobbyPaint) lobbyPaint(floor);
              if (cop) for (const n in cop.userData.floorBtns) cop.userData.floorBtns[n].material.emissiveIntensity = 0;
              try { A() && A().liftChime && A().liftChime(); } catch {}
              coach.pulse(0.1, "noise", lastDist);
              if (inside && rideStartInside) {
                floorsRidden += rode; coach.goalCount("ride", floorsRidden);
                try { window.PhobiaExperiments && window.PhobiaExperiments.signal("lift.arrive"); } catch {}
              }
              setDoor(true, false);
            }
          } else if (liftState === "open") {
            idleT += d;
            const inDoorway = Math.abs(pz) < 0.4 && Math.abs(px) < 0.6;
            // After a ride, an idle lift closes its doors again with you inside —
            // as lifts do. Before the first ride it waits for you to pick a floor.
            if (inDoorway || (headingOut && pz > -0.9)) idleT = 0;
            if (floorsRidden > 0 && idleT > 7 && inside && !inDoorway) { setDoor(false, false); liftState = "closing-idle"; }
          }
        }
        // rung goals
        // (Rungs 1–2's stars land in touchWallNow; the lit button follows
        // the step you're on — the door until it's shut, then a wall.)
        if (rung <= 1) coach.setVerb(rung === 0 ? "shutTouch" : "touchWalls", inside && shut ? "touch" : "door");
        if (rung === 3 && inside && shut && !lightOn) { darkT += d; if (darkT > 5) coach.goalDone("dark"); } else if (rung === 3) darkT = 0;
        // the room's own sounds and air, one at a time, while you're in it
        // (Quiet once the trial is held — unless its read star is still open.)
        if (inside && shut && clock > nextEventAt && (!window.__rungHoldComplete || coach.goalOpen("read")) && (!LIFT || liftState !== "moving")) {
          nextEventAt = clock + 11 + Math.random() * 7;
          const kind = (rung === 0 || rung === 1 || LIFT) && !ventSaid && Math.random() < 0.6 ? "vent" : "hum";
          if (kind === "vent") { try { A() && A().machineHum && A().machineHum(3.5, 38, 0.03); } catch {} coach.pulse(0.08, "noise", lastDist); if (sig("vent")) ventSaid = true; }
          else { try { A() && A().machineHum && A().machineHum(5, rung === 3 ? 52 : 100, rung === 3 ? 0.06 : 0.03); } catch {} coach.pulse(0.12, "noise", lastDist); if (!humSaid) setTimeout(() => { if (!disposed && sig("hum")) humSaid = true; }, 1800); }
        }
      }
      // ---- The coach ----
      // (Renderer size, not clientWidth — no forced reflow per frame.)
      if (active && active.renderer) active.renderer.getSize(_coachSize); else _coachSize.set(0, 0);
      const sw = _coachSize.x;
      coach.update(d, {
        dist: lastDist, gaze: 1, dogToward: 0,
        px: null, pz: null, dogX: null, dogZ: null,
        onScreen: true, dogGazing: false, trust: null,
        anchorX: sw / 2, anchorY: 0, stageW: sw, stageH: 0,
      });
      const eng = coach.engaged;
      if (eng && !wasEngaged) sigGap = Math.max(sigGap, 4);
      wasEngaged = eng;
      // Body signals, by how loud the alarm is — one at a time.
      if (eng) {
        sigGap -= d;
        const a = coach.alarm;
        if (sigGap <= 0 && !coach.readOpen) {
          const order = [["breath", 22], ["exit", 34], ["closer", 30], ["heat", 26]];
          for (const [id, thr] of order) {
            if (bodySaid[id] || a < thr) continue;
            if (sig(id)) { bodySaid[id] = true; sigGap = 9; }
            break;
          }
        }
      }
      if (window.__rungHoldComplete && coach.everSettled) coach.goalDone("settle");
    },
    dispose() {
      disposed = true;
      timers.forEach((id) => clearTimeout(id));
      try { stopScan(false); } catch {}
      try { window.removeEventListener("keydown", onKey); } catch {}
      try { if (canvasEl) { canvasEl.removeEventListener("pointerdown", onDown); canvasEl.removeEventListener("pointerup", onUp); } } catch {}
      try {
        const ev = coach.evidence();
        ev.notes.moved = +moved.toFixed(1);
        if (MRI) { ev.notes.mri = 1; ev.notes.scans = scansDone; }
        if (LIFT) { ev.notes.lift = 1; ev.notes.floors = floorsRidden; }
        window.__lastTrialEvidence = Object.assign(ev, { phobia: "enclosed", level: levelIdx, ts: Date.now() });
      } catch {}
      try { coach.dispose(); } catch {}
      try { if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(null); } catch {}
      try { if (window.__holdPolicy === coach.holdPolicy) window.__holdPolicy = null; } catch {}
      try { if (window.__coach === coach) window.__coach = null; } catch {}
      try { const bar = document.querySelector('.scene-cmd-bar[data-scene="enclosed"]'); if (bar) bar.dataset.wired = ""; } catch {}
      void pieces;
    },
  };
}

export { setupEnclosed };
