// The House at Night — the dark (nyctophobia).

import * as THREE from "three";
import { IS_COARSE_POINTER, IS_LOW_POWER } from "../renderer.js";
import { sceneContext } from "../scene-context.js";
import { makePlankMaps, makePlasterMaps, makeRugMaps } from "../textures.js";
import { _coachSize } from "../dog-controller.js";
import { makeCreatureCoach } from "../coach.js";
import { active } from "../live.js";

// ---------- The dark (dim room with adjustable light) ----------
// ---------- The dark: "The House at Night" ----------
// A real bedroom (and, on rung 4, the landing outside it) at night. Nothing
// hides in it: the old scene grew red-eyed "lurkers" that crept at you until
// you shone a light on them — the fear's own story, played straight. Here
// every scary moment is something the house or your own eyes really do (a
// creak, a branch on the glass, the fridge, a coat that looks like a person,
// two standby lights), and the coach asks you to name it. The flashlight and
// the match still work, and they're what they are in real life: relief that
// teaches nothing (a safety behaviour) — the coach says so.
function setupDark(scene, camera, level, levelIdx, ctx) {
  const dim = level.dimness != null ? level.dimness : 0.5;
  const rung = Math.max(0, Math.min(4, levelIdx || 0));
  const V = ctx || sceneContext("dark", levelIdx, false);
  const hall = rung === 3;
  const pieces = [];
  const add = (o) => { scene.add(o); pieces.push(o); return o; };
  const r = scene.userData && scene.userData.renderer;
  if (r) r.toneMappingExposure = 1.15;
  scene.background = new THREE.Color(0x010204);
  scene.fog = null;

  // ---- Shared materials ----
  const plank = makePlankMaps();
  const plaster = makePlasterMaps();
  const wood = (hex, rough = 0.62) => new THREE.MeshStandardMaterial({ map: plank.albedo, color: hex, roughness: rough, envMapIntensity: 0.15 });
  const floorMat = new THREE.MeshStandardMaterial({ map: plank.albedo, normalMap: plank.normal, roughnessMap: plank.roughness, color: 0x9a8670, envMapIntensity: 0.12 });
  const wallMat = new THREE.MeshStandardMaterial({ map: plaster.albedo, normalMap: plaster.normal, color: 0xb9bcc6, roughness: 0.94, envMapIntensity: 0.08 });
  const ceilMat = new THREE.MeshStandardMaterial({ map: plaster.albedo, color: 0xcfd0d4, roughness: 0.96, envMapIntensity: 0.05 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d6, roughness: 0.6, envMapIntensity: 0.1 });
  const fabric = (hex, rough = 0.97) => {
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    g.fillStyle = "#808080"; g.fillRect(0, 0, 128, 128);
    for (let y = 0; y < 128; y += 2) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.05})`; g.fillRect(0, y, 128, 1); }
    for (let x = 0; x < 128; x += 2) { g.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.04})`; g.fillRect(x, 0, 1, 128); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(4, 4); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: t, color: hex, roughness: rough, envMapIntensity: 0.05 });
  };
  // Rounded box: a subdivided box whose corners are pulled onto a radius.
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
  const mesh = (geo, mat, x, y, z, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast && !IS_LOW_POWER; m.receiveShadow = true; return m; };

  // ---- Shell ----
  // Bedroom: x −2.2…2.2, z −2.8…2.6, floor y −1, ceiling y 1.6. The landing
  // (rung 4): x −0.8…0.8, z −6.2…2.0.
  const R = hall ? { x0: -0.8, x1: 0.8, z0: -6.2, z1: 2.0, top: 1.5 } : { x0: -2.2, x1: 2.2, z0: -2.8, z1: 2.6, top: 1.6 };
  const W = R.x1 - R.x0, D = R.z1 - R.z0, H = R.top + 1;
  [plank.albedo, plank.normal, plank.roughness].forEach((t) => t && t.repeat.set(W / 1.4, D / 1.4));
  [plaster.albedo, plaster.normal].forEach((t) => t && t.repeat.set(2.5, 1.2));
  const floor = add(mesh(new THREE.PlaneGeometry(W, D), floorMat, (R.x0 + R.x1) / 2, -1, (R.z0 + R.z1) / 2, false));
  floor.rotation.x = -Math.PI / 2;
  const ceil = add(mesh(new THREE.PlaneGeometry(W, D), ceilMat, (R.x0 + R.x1) / 2, R.top, (R.z0 + R.z1) / 2, false));
  ceil.rotation.x = Math.PI / 2; ceil.userData.noCollide = true;
  const wallBox = (w, h, x, y, z, ry) => { const m = add(mesh(new THREE.BoxGeometry(w, h, 0.1), wallMat, x, y, z)); m.rotation.y = ry || 0; return m; };
  // Window opening in the far wall (bedroom), or a small one at the end of
  // the landing. Built around the hole so the moonlight really comes through.
  const WIN = hall ? { cx: 0, cy: 0.55, hw: 0.35, hh: 0.45 } : { cx: 0.55, cy: 0.5, hw: 0.62, hh: 0.66 };
  {
    const z = R.z0, cy = (R.top - 1) / 2;
    const l = WIN.cx - WIN.hw - R.x0, rr = R.x1 - (WIN.cx + WIN.hw);
    wallBox(l, H, R.x0 + l / 2, cy, z);
    wallBox(rr, H, R.x1 - rr / 2, cy, z);
    const below = (WIN.cy - WIN.hh) + 1, above = R.top - (WIN.cy + WIN.hh);
    wallBox(WIN.hw * 2, below, WIN.cx, -1 + below / 2, z);
    wallBox(WIN.hw * 2, above, WIN.cx, R.top - above / 2, z);
  }
  // Near wall with the door you came in by (behind you at spawn).
  const DOOR = { cx: hall ? 0 : 0.2, hw: 0.45, top: 1.05 };
  {
    const z = R.z1, cy = (R.top - 1) / 2;
    const l = DOOR.cx - DOOR.hw - R.x0, rr = R.x1 - (DOOR.cx + DOOR.hw);
    if (l > 0.02) wallBox(l, H, R.x0 + l / 2, cy, z);
    if (rr > 0.02) wallBox(rr, H, R.x1 - rr / 2, cy, z);
    wallBox(DOOR.hw * 2, R.top - DOOR.top, DOOR.cx, DOOR.top + (R.top - DOOR.top) / 2, z);
    // the dark beyond the door (a short, unlit corridor)
    const beyond = add(mesh(new THREE.BoxGeometry(DOOR.hw * 2 + 0.2, 2.1, 1.2), new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 1, side: THREE.BackSide }), DOOR.cx, 0.05, z + 0.62, false));
    beyond.userData.noCollide = true;
    // door leaf, ajar into the corridor
    const leaf = new THREE.Group(); leaf.position.set(DOOR.cx - DOOR.hw, -1, z + 0.02); leaf.rotation.y = -1.1;
    const panel = mesh(new THREE.BoxGeometry(DOOR.hw * 2 - 0.02, 2.03, 0.04), trimMat, DOOR.hw - 0.01, 1.015, 0);
    panel.userData.noCollide = true; leaf.add(panel); add(leaf);
  }
  wallBox(D, H, R.x0, (R.top - 1) / 2, (R.z0 + R.z1) / 2, Math.PI / 2);
  wallBox(D, H, R.x1, (R.top - 1) / 2, (R.z0 + R.z1) / 2, Math.PI / 2);
  // Skirting + door/window trim.
  for (const [w, x, z, ry] of [[W, (R.x0 + R.x1) / 2, R.z0 + 0.06, 0], [D, R.x0 + 0.06, (R.z0 + R.z1) / 2, Math.PI / 2], [D, R.x1 - 0.06, (R.z0 + R.z1) / 2, Math.PI / 2]]) {
    const sk = add(mesh(new THREE.BoxGeometry(w, 0.1, 0.02), trimMat, x, -0.95, z, false)); sk.rotation.y = ry; sk.userData.noCollide = true;
  }
  for (const [w, h, x, y] of [[0.06, WIN.hh * 2 + 0.06, WIN.cx - WIN.hw - 0.03, WIN.cy], [0.06, WIN.hh * 2 + 0.06, WIN.cx + WIN.hw + 0.03, WIN.cy],
    [WIN.hw * 2 + 0.12, 0.06, WIN.cx, WIN.cy + WIN.hh + 0.03], [WIN.hw * 2 + 0.24, 0.05, WIN.cx, WIN.cy - WIN.hh - 0.02]]) {
    const tr = add(mesh(new THREE.BoxGeometry(w, h, 0.14), trimMat, x, y, R.z0 + 0.02)); tr.userData.noCollide = true;
  }
  // Window: mullions + glass, and the night outside (sky, a tree's branches).
  {
    const bars = [[0.035, WIN.hh * 2, WIN.cx, WIN.cy], [WIN.hw * 2, 0.035, WIN.cx, WIN.cy]];
    for (const [w, h, x, y] of bars) { const b = add(mesh(new THREE.BoxGeometry(w, h, 0.05), trimMat, x, y, R.z0)); b.userData.noCollide = true; }
    const glass = add(new THREE.Mesh(new THREE.PlaneGeometry(WIN.hw * 2, WIN.hh * 2), new THREE.MeshStandardMaterial({ color: 0x0c1220, roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.35, envMapIntensity: 0.3 })));
    glass.position.set(WIN.cx, WIN.cy, R.z0 - 0.01); glass.userData.noCollide = true;
    const c = document.createElement("canvas"); c.width = 256; c.height = 256; const g = c.getContext("2d");
    const moonlit = rung === 0 || rung === 2;
    const sky = g.createLinearGradient(0, 0, 0, 256);
    sky.addColorStop(0, moonlit ? "#1a2640" : "#0a0e18"); sky.addColorStop(1, moonlit ? "#2c3a58" : "#121826");
    g.fillStyle = sky; g.fillRect(0, 0, 256, 256);
    if (moonlit) for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(220,230,255,${0.3 + Math.random() * 0.5})`; g.fillRect(Math.random() * 256, Math.random() * 140, 1, 1); }
    // the branch that taps the glass
    g.strokeStyle = "#05070b"; g.lineCap = "round";
    const branch = (x, y, a, len, w) => { if (w < 0.6) return; const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke(); branch(x2, y2, a - 0.4 - Math.random() * 0.3, len * 0.72, w * 0.66); branch(x2, y2, a + 0.3 + Math.random() * 0.3, len * 0.68, w * 0.62); };
    branch(256, 70, Math.PI + 0.25, 70, 9);
    g.fillStyle = "#070a10"; g.fillRect(0, 200, 256, 56);   // a roofline across the street
    const outTex = new THREE.CanvasTexture(c); outTex.colorSpace = THREE.SRGBColorSpace;
    const outside = add(new THREE.Mesh(new THREE.PlaneGeometry(WIN.hw * 2 + 1.4, WIN.hh * 2 + 1.2), new THREE.MeshBasicMaterial({ map: outTex, fog: false })));
    outside.position.set(WIN.cx, WIN.cy, R.z0 - 0.9); outside.userData.noCollide = true;
  }
  // Curtains: pleated fabric either side (drawn across on rung 1).
  const curtainMat = fabric(0x4a5064);
  curtainMat.side = THREE.DoubleSide;
  const curtains = [];
  {
    const closed = rung === 1;
    for (const side of [-1, 1]) {
      const cw = closed ? WIN.hw + 0.12 : 0.34, ch = WIN.hh * 2 + 0.55;
      const geo = new THREE.PlaneGeometry(cw, ch, 24, 6);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) / cw * Math.PI * 7) * 0.035);
      geo.computeVertexNormals();
      const m = add(new THREE.Mesh(geo, curtainMat));
      m.position.set(WIN.cx + side * (closed ? cw / 2 : WIN.hw + 0.05), WIN.cy + 0.1, R.z0 + 0.12);
      m.castShadow = !IS_LOW_POWER; m.receiveShadow = true; m.userData.noCollide = true;
      m.userData.baseX = m.position.x; m.userData.side = side;
      curtains.push(m);
    }
    const rod = add(mesh(new THREE.CylinderGeometry(0.012, 0.012, WIN.hw * 2 + 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.6, roughness: 0.4 }), WIN.cx, WIN.cy + WIN.hh + 0.28, R.z0 + 0.12, false));
    rod.rotation.z = Math.PI / 2; rod.userData.noCollide = true;
  }

  // ---- Furniture ----
  let lampLight = null, lampShade = null;
  const COAT = hall ? { x: 0.74, z: -2.6, ry: -Math.PI / 2 } : { x: 2.14, z: 0.8, ry: -Math.PI / 2 };
  const LEDS = hall ? { x: 0.62, z: -5.95 } : { x: 1.98, z: -2.62 };
  if (!hall) {
    // Bed along the left wall, head at the far wall.
    const bed = new THREE.Group(); bed.position.set(-1.45, -1, -1.72);
    const frameM = wood(0x6b5038);
    bed.add(mesh(new THREE.BoxGeometry(1.46, 0.28, 2.1), frameM, 0, 0.26, 0));
    for (const [x, z] of [[-0.68, -0.99], [0.68, -0.99], [-0.68, 0.99], [0.68, 0.99]]) bed.add(mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), frameM, x, 0.07, z));
    bed.add(mesh(new THREE.BoxGeometry(1.46, 0.9, 0.07), frameM, 0, 0.58, -1.05));
    bed.add(mesh(rbox(1.36, 0.2, 1.98, 0.07), fabric(0xe4e2dc), 0, 0.5, 0.02));
    const duvet = mesh(rbox(1.46, 0.14, 1.45, 0.06), fabric(0x5c6f8f), 0, 0.64, 0.3);
    duvet.rotation.x = -0.01; bed.add(duvet);
    bed.add(mesh(rbox(0.58, 0.14, 0.36, 0.06), fabric(0xeeeae2), -0.33, 0.66, -0.74));
    bed.add(mesh(rbox(0.58, 0.14, 0.36, 0.06), fabric(0xeeeae2), 0.33, 0.66, -0.74));
    add(bed);
    // Nightstand + lamp.
    const ns = new THREE.Group(); ns.position.set(-0.46, -1, -2.54);
    ns.add(mesh(new THREE.BoxGeometry(0.46, 0.52, 0.4), wood(0x5a4230), 0, 0.26, 0));
    ns.add(mesh(new THREE.BoxGeometry(0.4, 0.14, 0.02), wood(0x4a3526), 0, 0.33, 0.205));
    ns.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0xcfc6b8, roughness: 0.35 }), 0.02, 0.65, 0));
    lampShade = mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.2, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.9, side: THREE.DoubleSide, emissive: 0xffc98a, emissiveIntensity: 0 }), 0.02, 0.86, 0, false);
    ns.add(lampShade);
    add(ns);
    lampLight = new THREE.PointLight(0xffc48a, 0, 7, 2);
    lampLight.position.set(-0.44, -0.12, -2.54);
    // Only rung 1 switches the lamp on. A shadow-casting point light renders
    // its cube map — six passes over the room — every frame whether it is lit
    // or not, so the dark rungs no longer pay for a lamp that stays off.
    lampLight.castShadow = !IS_LOW_POWER && rung === 0; lampLight.shadow.mapSize.set(512, 512); lampLight.shadow.bias = -0.002;
    add(lampLight);
    // Wardrobe on the right wall.
    const wd = new THREE.Group(); wd.position.set(1.88, -1, -0.55); wd.rotation.y = -Math.PI / 2;
    const wdM = wood(0x7a5a3e, 0.55);
    wd.add(mesh(new THREE.BoxGeometry(1.24, 2.02, 0.58), wdM, 0, 1.01, 0));
    for (const x of [-0.305, 0.305]) {
      wd.add(mesh(new THREE.BoxGeometry(0.58, 1.86, 0.03), wood(0x86644a, 0.5), x, 1.03, 0.3));
      wd.add(mesh(new THREE.BoxGeometry(0.44, 0.7, 0.012), wood(0x7a5a3e, 0.5), x, 1.45, 0.318));
      wd.add(mesh(new THREE.BoxGeometry(0.44, 0.7, 0.012), wood(0x7a5a3e, 0.5), x, 0.62, 0.318));
      wd.add(mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa08a64, metalness: 0.7, roughness: 0.35 }), x > 0 ? 0.05 : -0.05, 1.05, 0.33));
    }
    add(wd);
    // Desk + chair (a jumper over its back) in the far right corner.
    const dk = new THREE.Group(); dk.position.set(1.55, -1, -2.45);
    dk.add(mesh(new THREE.BoxGeometry(1.1, 0.04, 0.55), wood(0x8a6a4a, 0.5), 0, 0.74, 0));
    for (const [x, z] of [[-0.51, -0.24], [0.51, -0.24], [-0.51, 0.24], [0.51, 0.24]]) dk.add(mesh(new THREE.BoxGeometry(0.04, 0.74, 0.04), wood(0x6b5038), x, 0.37, z));
    dk.add(mesh(new THREE.BoxGeometry(0.34, 0.24, 0.02), new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.3 }), -0.2, 0.9, -0.12));
    for (let i = 0; i < 5; i++) dk.add(mesh(new THREE.BoxGeometry(0.035, 0.22 + Math.random() * 0.05, 0.16), fabric([0x7a3b32, 0x2f4a6a, 0xb49a62, 0x3d5a3a, 0x6a5a7a][i]), 0.28 + i * 0.04, 0.88, -0.14));
    add(dk);
    const ch = new THREE.Group(); ch.position.set(1.35, -1, -1.85); ch.rotation.y = 0.35;
    const chM = wood(0x5a4230);
    ch.add(mesh(new THREE.BoxGeometry(0.44, 0.04, 0.42), chM, 0, 0.46, 0));
    for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) ch.add(mesh(new THREE.CylinderGeometry(0.018, 0.016, 0.46, 8), chM, x, 0.23, z));
    ch.add(mesh(new THREE.BoxGeometry(0.44, 0.5, 0.03), chM, 0, 0.74, 0.2));
    ch.add(mesh(rbox(0.5, 0.36, 0.1, 0.04), fabric(0x7b6a55), 0, 0.84, 0.21));
    add(ch);
    // Bookshelf by the door, a rug, a framed picture.
    const bs = new THREE.Group(); bs.position.set(-2.02, -1, 1.25); bs.rotation.y = Math.PI / 2;
    const bsM = wood(0x6b5038);
    bs.add(mesh(new THREE.BoxGeometry(0.9, 1.5, 0.3), bsM, 0, 0.75, 0));
    for (let s2 = 0; s2 < 4; s2++) for (let i = 0; i < 9; i++) {
      const bh = 0.2 + Math.random() * 0.08;
      bs.add(mesh(new THREE.BoxGeometry(0.07, bh, 0.2), fabric([0x7a3b32, 0x2f4a6a, 0xb49a62, 0x3d5a3a, 0x6a5a7a, 0x8a7a5a][Math.floor(Math.random() * 6)]), -0.36 + i * 0.085, 0.12 + s2 * 0.36 + bh / 2, 0.04, false));
    }
    add(bs);
    const rugMaps = makeRugMaps();
    const rug = add(new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.3), new THREE.MeshStandardMaterial({ map: rugMaps.albedo, normalMap: rugMaps.normal, color: 0x9a8a8a, roughness: 0.98 })));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0.1, -0.992, -0.35); rug.receiveShadow = true; rug.userData.noCollide = true;
    const frame = add(mesh(new THREE.BoxGeometry(0.5, 0.4, 0.03), wood(0x2a2016), -2.17, 0.55, -0.2, false)); frame.rotation.y = Math.PI / 2; frame.userData.noCollide = true;
  } else {
    // The landing: doors along both walls, a runner, a radiator, a hall table.
    for (const [x, z, ry] of [[-0.8, -1.0, Math.PI / 2], [0.8, -3.9, -Math.PI / 2], [-0.8, -4.8, Math.PI / 2]]) {
      const d = add(mesh(new THREE.BoxGeometry(0.84, 2.02, 0.05), trimMat, x + (x < 0 ? 0.03 : -0.03), 0.01, z)); d.rotation.y = ry; d.userData.noCollide = true;
      const k = add(mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshStandardMaterial({ color: 0xa08a64, metalness: 0.7, roughness: 0.35 }), x + (x < 0 ? 0.07 : -0.07), 0.02, z + 0.32, false)); k.userData.noCollide = true;
    }
    const rugMaps = makeRugMaps();
    const runner = add(new THREE.Mesh(new THREE.PlaneGeometry(0.8, 6.8), new THREE.MeshStandardMaterial({ map: rugMaps.albedo, normalMap: rugMaps.normal, color: 0x7a6a6a, roughness: 0.98 })));
    runner.rotation.x = -Math.PI / 2; runner.position.set(0, -0.992, -2.2); runner.receiveShadow = true; runner.userData.noCollide = true;
    const rad = add(mesh(new THREE.BoxGeometry(0.08, 0.5, 0.9), new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.5 }), -0.74, -0.55, -2.8)); rad.userData.noCollide = true;
    const tb = add(mesh(new THREE.BoxGeometry(0.34, 0.03, 0.7), wood(0x6b5038), 0.62, -0.2, -5.2)); tb.userData.noCollide = true;
  }
  // The coat on a hook — the tall "figure" the dark makes of it.
  const coat = new THREE.Group(); coat.position.set(COAT.x, -1, COAT.z); coat.rotation.y = COAT.ry;
  {
    const cm = fabric(0x2a2e36);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.05, 16, 4, true), cm); body.position.set(0, 1.22, 0.07); body.scale.z = 0.55; body.material.side = THREE.DoubleSide;
    const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cm); shoulders.position.set(0, 1.74, 0.07); shoulders.scale.set(1.05, 0.45, 0.6);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), cm); hood.position.set(0, 1.9, 0.02); hood.scale.set(1, 1.2, 0.85);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x8a8070, metalness: 0.7, roughness: 0.3 })); hook.position.set(0, 1.95, -0.02);
    for (const m of [body, shoulders, hood]) { m.castShadow = !IS_LOW_POWER; m.receiveShadow = true; }
    coat.add(body, shoulders, hood, hook);
    coat.traverse((o) => { o.userData.noCollide = true; });
    add(coat);
  }
  // Two standby lights low in the corner — the "eyes".
  const leds = [];
  for (const dx of [-0.05, 0.05]) {
    const led = add(new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: 0x3aff7a })));
    led.position.set(LEDS.x + (hall ? 0 : dx), -0.94, LEDS.z + (hall ? dx : 0)); led.userData.noCollide = true; leds.push(led);
  }
  const ledBox = add(mesh(new THREE.BoxGeometry(hall ? 0.06 : 0.2, 0.04, hall ? 0.2 : 0.06), new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.6 }), LEDS.x, -0.975, LEDS.z, false));
  ledBox.userData.noCollide = true;

  // ---- Light ----
  // Rung 1: bedside lamp. 2: curtains drawn, a plug-in night-light. 3: lights
  // off, moonlight through the window. 4: the landing, a faint streetlight at
  // its end. 5: nothing — only sound (and those two standby lights).
  const hemi = add(new THREE.HemisphereLight(0x3a4a70, 0x0c0a08, [0.05, 0.08, 0.1, 0.05, 0.004][rung]));
  if (lampLight && rung === 0) { lampLight.intensity = 2.2; lampShade.material.emissiveIntensity = 0.9; }
  let nightLight = null;
  if (rung === 1) {
    nightLight = add(new THREE.PointLight(0xffa860, 2.4, 5, 2));
    nightLight.position.set(-2.1, -0.62, 0.55);
    const nl = add(mesh(new THREE.BoxGeometry(0.04, 0.07, 0.05), new THREE.MeshStandardMaterial({ color: 0xffd9a8, emissive: 0xffa860, emissiveIntensity: 1.2 }), -2.16, -0.62, 0.55, false));
    nl.userData.noCollide = true;
  }
  let moon = null;
  if (rung === 0 || rung === 2 || rung === 3) {
    moon = new THREE.SpotLight(hall ? 0xd8c8a0 : 0x9fb6e6, hall ? 2.2 : rung === 2 ? 8 : 1.5, 16, hall ? 0.3 : 0.42, 0.6, 0);
    // The beam falls across the floor toward the wardrobe side, where the
    // coat hangs — so on the moonlit rung the "figure" is a silhouette.
    moon.position.set(WIN.cx - (hall ? 0 : 1.6), WIN.cy + (hall ? 1.2 : 2.2), R.z0 - (hall ? 2.5 : 3.6));
    moon.target.position.set(WIN.cx + (hall ? 0 : 1.3), hall ? -1 : -0.4, R.z0 + (hall ? 1.6 : 3.3));
    moon.castShadow = !IS_LOW_POWER; moon.shadow.mapSize.set(1024, 1024); moon.shadow.bias = -0.0015; moon.shadow.camera.near = 0.5; moon.shadow.camera.far = 16;
    add(moon); add(moon.target);
  }

  // ---- Flashlight + match (kept: they're real, and the coach names what they do) ----
  const flashlight = new THREE.SpotLight(0xfff3dc, 0, 9, 0.42, 0.5, 2);
  flashlight.position.set(0, -0.05, 0); flashlight.target.position.set(0, -0.15, -1);
  camera.add(flashlight); camera.add(flashlight.target);
  if (!scene.children.includes(camera)) scene.add(camera);
  let flashlightHeld = false, matchT = 0, strikeAnim = 0, disposed = false;
  // The match's light exists from the start, at 0 — like the flashlight. Adding
  // a light mid-scene changes the light count, and three then recompiles every
  // lit program on the next frame: a freeze at the very moment the player
  // reaches for the match.
  const matchLight = new THREE.PointLight(0xffb060, 0, 4, 2);
  matchLight.position.set(0.2, -0.13, -0.27); camera.add(matchLight);
  const matchGroup = new THREE.Group();
  const matchStick = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.0045, 0.10, 8), new THREE.MeshStandardMaterial({ color: 0xb8987a, roughness: 0.95 }));
  matchStick.rotation.z = -0.4; matchGroup.add(matchStick);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const matchFlame = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), flameMat);
  matchFlame.scale.set(0.7, 1.6, 0.7); matchFlame.position.set(0.05, 0.07, 0); matchGroup.add(matchFlame);
  matchGroup.position.set(0.18, -0.18, -0.32); matchGroup.visible = false;
  camera.add(matchGroup);

  // ---- The coach ----
  const D_COACH = [
    { sizeMul: 0.40, tau: 11, hFloor: 0.30 },
    { sizeMul: 0.52, tau: 12, hFloor: 0.32 },
    { sizeMul: 0.64, tau: 14, hFloor: 0.34 },
    { sizeMul: 0.74, tau: 16, hFloor: 0.36 },
    { sizeMul: 0.84, tau: 18, hFloor: 0.38 },
  ][rung];
  // The "dark heart": the far end of the room / landing. Walking into it,
  // away from the door you came in by, is the approach.
  const HEART = hall ? { x: 0, z: -5.2 } : { x: 0.4, z: -1.7 };
  const dZone = 1.9;
  // The skill star is naming what's really there (🔍): look at a thing in
  // the dark and say what it is. Reading the shapes is this fear's version
  // of reading the dog — attention ON the dark, not away from it. With the
  // lamp on; then by the night-light alone; then the tall shape itself; then
  // at the far end of the landing. (The last rung is sound only.)
  const dSkill = [
    { id: "name3",      icon: "🔍", verb: "name", need: 3, text: window.t("dc.d.gName3", "Name three things you can see") },
    { id: "nameDark",   icon: "🔍", verb: "name", need: 3, text: window.t("dc.d.gNameDark", "Name three things by the night-light — no flashlight") },
    { id: "nameShape",  icon: "🧥", verb: "name", text: window.t("dc.d.gNameShape", "Look at the tall shape and name it") },
    { id: "nameHall",   icon: "🔍", verb: "name", text: window.t("dc.d.gNameHall", "Walk to the end of the landing and name what's there") },
    { id: "threeSounds",icon: "👂", need: 3, text: window.t("dc.d.gSounds", "Stay through three sounds, no light") },
  ][rung];
  const coach = makeCreatureCoach({
    kit: creatureKit("dark"),
    stage: document.getElementById("stage"),
    levelIdx: rung, intensity: rung >= 4 ? "apex" : rung >= 2 ? "alert" : "calm",
    dogName: window.t("coach.d.name", "the dark"), title: window.t(`level.dark.${rung}.title`, level.title),
    inZoneDist: dZone, nearD: 0.4, farSpan: 3.6,
    sizeMul: D_COACH.sizeMul, tau: D_COACH.tau, hFloor: D_COACH.hFloor,
    minHold: level.minHold || 12, coarse: IS_COARSE_POINTER,
    expect: (() => { const e = window.__pendingExpect; return (e && e.phobia === "dark" && e.level === levelIdx) ? e : null; })(),
    goals: [
      dSkill,
      { id: "read", icon: "👁", need: 2, text: window.t("dc.d.gRead2", "Read each sound and shape for what it is") },
      { id: "settle", icon: "〰", required: true, text: window.t("dc.gSettle", "Stay until your alarm settles") },
    ],
  });
  coach.setFoot(window.t(`dc.d.foot.${rung}`, ["lamp on", "night-light only", "moonlight only", "streetlight only", "no light"][rung]));
  window.__coach = coach;
  let lastDist = 9;
  if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(() => coach.target(), (st) => coach.pulse(st, "event", lastDist));
  window.__holdPolicy = coach.holdPolicy;
  const sig = (id) => {
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return false;
    return coach.signal(id, { dist: lastDist });
  };
  // Night-time happenings, one at a time, each a real thing.
  const EVENTS = ["creak", "hum", "creak"];
  if (!hall) EVENTS.push("tap");
  if (rung === 0 || rung === 2) EVENTS.push("curtain");
  let nextEventAt = 6 + Math.random() * 3, clock = 0, soundsHeard = 0, soundsInDark = 0;
  let figureSeen = false, eyesSeen = false, shadowSaid = false, moved = 0, prevX = null, prevZ = null;
  const _dir = new THREE.Vector3(), _to = new THREE.Vector3();
  const lookingAt = (x, y, z, cos = 0.93) => {
    camera.getWorldDirection(_dir); camera.getWorldPosition(_to);
    _to.set(x - _to.x, y - _to.y, z - _to.z).normalize();
    return _dir.dot(_to) > cos;
  };
  // ---- Naming what's there (the 🔍 button) ----
  // The thing nearest the middle of your view (within ~25°, a few metres)
  // gets its name said back — the same room as in daylight — and counts.
  const NAMEABLE = (hall ? [
    { k: "door", x: -0.8, y: 0, z: -1.0 }, { k: "door", x: 0.8, y: 0, z: -3.9 }, { k: "door", x: -0.8, y: 0, z: -4.8 },
    { k: "runner", x: 0, y: -1, z: -2.2 }, { k: "radiator", x: -0.74, y: -0.55, z: -2.8 },
    { k: "table", x: 0.62, y: -0.2, z: -5.2, end: true }, { k: "window", x: WIN.cx, y: WIN.cy, z: R.z0, end: true },
    { k: "coat", x: COAT.x, y: 0.6, z: COAT.z }, { k: "leds", x: LEDS.x, y: -0.94, z: LEDS.z, end: true },
  ] : [
    { k: "bed", x: -1.45, y: -0.45, z: -1.72 }, { k: "lamp", x: -0.44, y: -0.15, z: -2.54 },
    { k: "wardrobe", x: 1.88, y: 0, z: -0.55 }, { k: "desk", x: 1.55, y: -0.25, z: -2.45 },
    { k: "chair", x: 1.35, y: -0.4, z: -1.85 }, { k: "shelf", x: -2.02, y: -0.25, z: 1.25 },
    { k: "picture", x: -2.17, y: 0.55, z: -0.2 }, { k: "window", x: WIN.cx, y: WIN.cy, z: R.z0 },
    { k: "coat", x: COAT.x, y: 0.6, z: COAT.z }, { k: "rug", x: 0.1, y: -1, z: -0.35 },
    { k: "leds", x: LEDS.x, y: -0.94, z: LEDS.z, minRung: 3 },
  ]).filter((n) => rung >= (n.minRung || 0));
  const NAME_LABEL = {
    door: ["dc.d.n.door", "a door"], runner: ["dc.d.n.runner", "the runner"], radiator: ["dc.d.n.radiator", "the radiator"],
    table: ["dc.d.n.table", "the hall table"], window: ["dc.d.n.window", "the window"], coat: ["dc.d.n.coat", "a coat on a hook"],
    leds: ["dc.d.n.leds", "two standby lights"], bed: ["dc.d.n.bed", "the bed"], lamp: ["dc.d.n.lamp", "the bedside lamp"],
    wardrobe: ["dc.d.n.wardrobe", "the wardrobe"], desk: ["dc.d.n.desk", "the desk"], chair: ["dc.d.n.chair", "the chair"],
    shelf: ["dc.d.n.shelf", "the bookshelf"], picture: ["dc.d.n.picture", "a picture"], rug: ["dc.d.n.rug", "the rug"],
  };
  const namedIdx = new Set();
  let namedDark = 0, nameFlashT = 0;
  function nameWhatYouSee() {
    camera.getWorldDirection(_dir);
    const cp = camera.getWorldPosition(new THREE.Vector3());
    let best = -1, bestDot = 0.9;
    NAMEABLE.forEach((n, i) => {
      _to.set(n.x - cp.x, n.y - cp.y, n.z - cp.z);
      const dist = _to.length();
      if (dist > 6 || dist < 0.2) return;
      const dot = _dir.dot(_to.normalize());
      if (dot > bestDot) { bestDot = dot; best = i; }
    });
    const btnLbl = document.querySelector('.scene-cmd-bar[data-scene="dark"] [data-cmd="name"] > span:last-child');
    const flash = (txt) => {
      if (!btnLbl) return;
      if (!btnLbl.dataset.base) btnLbl.dataset.base = btnLbl.textContent;
      btnLbl.textContent = txt; nameFlashT = 1.8;
    };
    if (best < 0) { flash(window.t("dc.d.lookFirst", "Look at something")); return; }
    const n = NAMEABLE[best];
    const L = NAME_LABEL[n.k];
    const label = window.t(L[0], L[1]);
    const cap = label.charAt(0).toUpperCase() + label.slice(1);
    flash("✓ " + cap);
    const line = n.k === "coat" ? window.t("dc.d.namedCoat", "A coat on a hook — that's the tall shape.")
      : n.k === "leds" ? window.t("dc.d.namedLeds", "Two standby lights — a charger, not eyes.")
      : window.tf("dc.d.named", "{thing} — the same as in daylight.", { thing: cap });
    if (window.PhobiaFX && window.PhobiaFX.contextPrompt) window.PhobiaFX.contextPrompt(line, 2600);
    const fresh = !namedIdx.has(best);
    namedIdx.add(best);
    coach.note("named");
    const lit = flashlightHeld || matchT > 0.05;
    if (!fresh) return;
    if (rung === 0) coach.goalCount("name3", namedIdx.size);
    if (rung === 1 && !lit) coach.goalCount("nameDark", ++namedDark);
    if (rung === 2 && n.k === "coat") coach.goalDone("nameShape");
    if (rung === 3 && n.end && controlsPos.z < -4.2) coach.goalDone("nameHall");
  }
  const controlsPos = { x: 0, z: 0 };
  function fireEvent(kind) {
    const A = window.PhobiaAudio;
    if (kind === "creak") {
      const px = R.x0 + 0.4 + Math.random() * (W - 0.8), pz = R.z0 + 0.4 + Math.random() * (D - 0.8);
      try { A && A.floorCreak && A.floorCreak({ x: px, y: -1, z: pz }); } catch {}
      coach.pulse(0.22, "sound", lastDist); coach.note("creak"); sig("creak");
    } else if (kind === "tap") {
      try { A && A.windowTap && A.windowTap({ x: WIN.cx, y: WIN.cy, z: R.z0 }, 3); } catch {}
      coach.pulse(0.2, "sound", lastDist); coach.note("tap"); setTimeout(() => sig("tap"), 900);
    } else if (kind === "hum") {
      try { A && A.fridgeHum && A.fridgeHum(4.5, { x: 0, y: -4, z: 0 }); } catch {}
      coach.pulse(0.12, "sound", lastDist); coach.note("hum"); setTimeout(() => sig("hum"), 4600);
    } else if (kind === "curtain") {
      curtainSway = 1; coach.note("curtain"); sig("curtain");
    }
    if (kind !== "curtain") {
      soundsHeard++;
      if (coach.engaged && !flashlightHeld && matchT <= 0.05) { soundsInDark++; if (rung === 4) coach.goalCount("threeSounds", soundsInDark); }
    }
  }
  let curtainSway = 0;

  // ---- Command bar ----
  function lightMatch() {
    matchT = 1; strikeAnim = 1; matchGroup.visible = true;
    try { window.PhobiaAudio && window.PhobiaAudio.indicatorClick && window.PhobiaAudio.indicatorClick(); } catch {}
    coach.safety("match");
  }
  function wireDarkCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="dark"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    const fb = bar.querySelector('[data-cmd="flashlight"]');
    if (fb) {
      const press = (e) => { e.stopPropagation(); flashlightHeld = true; fb.classList.add("pressed"); coach.safety("light"); };
      const release = () => { flashlightHeld = false; fb.classList.remove("pressed"); };
      fb.addEventListener("pointerdown", press); fb.addEventListener("pointerup", release);
      fb.addEventListener("pointerleave", release); fb.addEventListener("pointercancel", release);
    }
    const nb = bar.querySelector('[data-cmd="name"]');
    if (nb) nb.onclick = (e) => { e.stopPropagation(); nameWhatYouSee(); };
    const mb = bar.querySelector('[data-cmd="match"]');
    if (mb) mb.onclick = (e) => { e.stopPropagation(); lightMatch(); };
  }
  const timers = [setTimeout(wireDarkCmds, 0)];
  const onKey = (e) => {
    if (e.code !== "KeyF" || e.repeat || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return;
    if (e.type === "keydown") { flashlightHeld = true; coach.safety("light"); } else flashlightHeld = false;
  };
  window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKey);

  const spawnZ = hall ? 1.4 : 1.95;
  return {
    controls: {
      mode: "walkable",
      initialPos: [0, 0, spawnZ], initialYaw: 0, initialPitch: -0.04,
      bounds: { minX: R.x0 + 0.35, maxX: R.x1 - 0.35, minZ: R.z0 + 0.35, maxZ: R.z1 - 0.35 },
      speed: 1.1, lookSpeed: 0.0035,
      cameraModeLocked: "fp",
    },
    hands: { skinColor: 0xd4a07a, sleeveColor: 0x1a1c22 },
    bloom: { strength: 0.35, threshold: 0.9 },
    environment: false,
    surface: hall ? "soft" : "wood",
    groundY: -1,
    update(t, controls, dt) {
      const d = Math.min(0.1, dt || 0.016);
      clock += d;
      if (!controls) return;
      // Flashlight + match.
      flashlight.intensity += ((flashlightHeld ? 14 : 0) - flashlight.intensity) * Math.min(1, d * 9);
      if (matchT > 0 && matchLight) {
        matchT = Math.max(0, matchT - d * 0.2);
        matchLight.intensity = matchT * (1 + Math.sin(t * 18) * 0.15 + (Math.random() - 0.5) * 0.1) * 2.4;
        flameMat.opacity = Math.min(1, matchT * 1.2);
        strikeAnim = Math.max(0, strikeAnim - d * 4);
        matchGroup.position.x = 0.18 + strikeAnim * 0.25; matchGroup.rotation.z = -strikeAnim * 0.4;
      } else if (matchLight) { matchLight.intensity = 0; flameMat.opacity = 0; matchGroup.visible = false; }
      const lightOn = flashlightHeld || matchT > 0.05;
      // Curtain stirs.
      if (curtainSway > 0) {
        curtainSway = Math.max(0, curtainSway - d * 0.35);
        for (const c of curtains) { c.rotation.x = Math.sin(clock * 2.1 + c.userData.side) * 0.06 * curtainSway; c.position.x = c.userData.baseX + Math.sin(clock * 1.7) * 0.02 * curtainSway; }
      }
      // The coach.
      const px = controls.position.x, pz = controls.position.z;
      controlsPos.x = px; controlsPos.z = pz;
      if (nameFlashT > 0) {
        nameFlashT -= d;
        if (nameFlashT <= 0) { const lb = document.querySelector('.scene-cmd-bar[data-scene="dark"] [data-cmd="name"] > span:last-child'); if (lb && lb.dataset.base) lb.textContent = lb.dataset.base; }
      }
      const dh = Math.hypot(px - HEART.x, pz - HEART.z);
      lastDist = dh + (flashlightHeld ? 2.2 : matchT > 0.05 ? 1.4 : 0);
      const facing = lookingAt(HEART.x, -0.2, HEART.z, 0.5) ? 1 : 0.3;
      // (Renderer size, not clientWidth — no forced reflow per frame.)
      if (active && active.renderer) active.renderer.getSize(_coachSize); else _coachSize.set(0, 0);
      const sw = _coachSize.x;
      coach.update(d, {
        dist: lastDist, gaze: facing, dogToward: 0,
        px, pz, dogX: HEART.x, dogZ: HEART.z,
        onScreen: true, dogGazing: false, trust: null,
        anchorX: sw / 2, anchorY: 0, stageW: sw, stageH: 0,
      });
      const eng = coach.engaged;
      if (prevX != null) moved += Math.hypot(px - prevX, pz - prevZ);
      prevX = px; prevZ = pz;
      // Scheduled happenings — quiet once the trial is complete, unless its
      // read star is still open: then the house carries on a little, so the
      // star you stayed for is still there to earn.
      if (clock > nextEventAt && (!window.__rungHoldComplete || coach.goalOpen("read"))) {
        fireEvent(EVENTS[Math.floor(Math.random() * EVENTS.length)]);
        nextEventAt = clock + 10 + Math.random() * 8;
      }
      // Things you notice by looking.
      const coatY = 0.6;
      if (!figureSeen && rung >= 1 && clock > 5 && lookingAt(COAT.x, coatY, COAT.z) && Math.hypot(px - COAT.x, pz - COAT.z) < 5) {
        if (sig("figure")) { figureSeen = true; coach.note("figure"); coach.pulse(0.18, "shape", lastDist); }
      }
      if (!eyesSeen && rung >= 3 && clock > 5 && lookingAt(LEDS.x, -0.94, LEDS.z, 0.95)) {
        if (sig("eyes")) { eyesSeen = true; coach.note("eyes"); coach.pulse(0.16, "shape", lastDist); }
      }
      if (!shadowSaid && eng && coach.alarm > 32 && clock > 14 && Math.random() < d * 0.05) {
        if (sig("shadow")) { shadowSaid = true; coach.note("shadow"); }
      }
      // Rung goals.
      // (Rungs 1–4's stars land in nameWhatYouSee.)
      void soundsHeard;
      // Completion beat: the house goes quiet.
      if (window.__rungHoldComplete && coach.everSettled) coach.goalDone("settle");
    },
    dispose() {
      disposed = true;
      timers.forEach((id) => clearTimeout(id));
      try { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKey); } catch {}
      try {
        const ev = coach.evidence();
        ev.notes.moved = +moved.toFixed(1);
        if (hall) ev.notes.hall = 1;
        window.__lastTrialEvidence = Object.assign(ev, { phobia: "dark", level: levelIdx, ts: Date.now() });
      } catch {}
      try { coach.dispose(); } catch {}
      try { if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(null); } catch {}
      try { if (window.__holdPolicy === coach.holdPolicy) window.__holdPolicy = null; } catch {}
      try { if (window.__coach === coach) window.__coach = null; } catch {}
      try { const bar = document.querySelector('.scene-cmd-bar[data-scene="dark"]'); if (bar) bar.dataset.wired = ""; } catch {}
      void disposed; void pieces;
    },
  };
}

export { setupDark };
