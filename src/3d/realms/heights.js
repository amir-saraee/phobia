// The Summit — heights (acrophobia).

import * as THREE from "three";
import { IS_COARSE_POINTER, IS_LOW_POWER } from "../renderer.js";
import { _UP } from "../hands.js";
import { active } from "../engine.js";
import { rng, makeConcreteMaps, makeEdgeStripeTexture, makeCityGridTexture } from "../textures.js";
import { makeCreatureCoach } from "../coach.js";

function setupHeights(scene, camera, level, levelIdx, ctx) {
  const h = level.height;            // 0..1 (drives time of day, city dressing, wind)
  const rung = Math.max(0, Math.min(4, levelIdx || 0));
  // The real drop below your feet, per rung — it used to be 1.6 + h·120, so
  // the "one small step" stood on a slab 6 m up and the "3 m balcony" was 24 m
  // up. Ledge → balcony → tenth-floor terrace → rooftop → glass skywalk.
  const DROP = [0.6, 3.4, 31, 92, 165][rung];
  const cameraY = 1.6 + DROP;        // eye height above the street
  const lookDown = 0.18 + h * 0.55;  // tilt down more at higher levels
  // Street level. The actual visible ground plane lives at y=0 (we move the
  // camera up rather than the ground down), so anything that sits "on the
  // street" — cars, pedestrians, landing coins — also lives at y≈0. Earlier
  // versions placed them far below the ground plane, which made them
  // invisible: the asphalt occluded them from above.
  const groundY = 0;

  // ---------- Time of day ----------
  // Each rung has a clear, distinct time so the user knows whether it's
  // morning, midday, sunset, or twilight at a glance. Times of day were
  // tuned so the lower rungs feel safe-and-bright and the highest rungs
  // feel dramatic-but-still-legible (city lights instead of pitch black).
  //   0.05 → morning           sun front-right, warm
  //   0.20 → midday             sun overhead, neutral
  //   0.45 → afternoon          sun back-right, slightly warm
  //   0.75 → golden hour        sun low, orange
  //   1.00 → twilight           sun set, deep blue with city glow
  const tod = (() => {
    if (h < 0.12) return "morning";
    if (h < 0.30) return "midday";
    if (h < 0.55) return "afternoon";
    if (h < 0.85) return "golden";
    return "twilight";
  })();
  // Sky gradient + sun direction + sun colour per time of day.
  // Daytime rungs were rendering as dusk: the sun/hemisphere intensities were
  // tuned before ACES tone mapping went in, and ACES crushes mid-tones — so
  // "morning" looked overcast-grey. These values are lifted hard (sun ~+75%,
  // hemisphere ~2×, brighter+more-saturated sky) so daytime reads as genuine
  // open-air daylight. Twilight stays moody but gets a small lift off black.
  const TOD = {
    morning:  { skyTop: [0.58, 0.66, 0.72], skyBot: [0.09, 0.70, 0.88],
                sunDir: [120, 200, 160], sunCol: 0xfff2d8, sunInt: 2.5,
                hemi: { sky: 0xbcd6f6, ground: 0x5c6470, intensity: 1.05 },
                fogCol: 0xc8d8ee, fogNear: 240, fogFar: 2000,
                exposure: 1.0, label: "morning" },
    midday:   { skyTop: [0.58, 0.62, 0.74], skyBot: [0.56, 0.55, 0.96],
                sunDir: [40, 280, 30],     sunCol: 0xffffff, sunInt: 2.8,
                hemi: { sky: 0xd8e8fc, ground: 0x4c525c, intensity: 1.15 },
                fogCol: 0xe0eefc, fogNear: 280, fogFar: 2400,
                exposure: 1.0, label: "midday" },
    afternoon:{ skyTop: [0.58, 0.58, 0.68], skyBot: [0.07, 0.66, 0.84],
                sunDir: [-180, 200, -60],  sunCol: 0xffe6c0, sunInt: 2.4,
                hemi: { sky: 0xc8d8ee, ground: 0x46464e, intensity: 1.0 },
                fogCol: 0xccd8ea, fogNear: 240, fogFar: 2000,
                exposure: 0.98, label: "afternoon" },
    golden:   { skyTop: [0.62, 0.64, 0.54], skyBot: [0.07, 0.85, 0.70],
                sunDir: [-260, 60, -80],   sunCol: 0xffb878, sunInt: 2.2,
                hemi: { sky: 0xffc8a6, ground: 0x342a2e, intensity: 0.85 },
                fogCol: 0xc09c86, fogNear: 260, fogFar: 1900,
                exposure: 0.98, label: "golden hour" },
    twilight: { skyTop: [0.66, 0.64, 0.18], skyBot: [0.62, 0.50, 0.38],
                sunDir: [-280, 25, -100],  sunCol: 0x9a86a8, sunInt: 0.75,
                hemi: { sky: 0x4c5684, ground: 0x18181f, intensity: 0.6 },
                fogCol: 0x383d5c, fogNear: 180, fogFar: 1400,
                exposure: 0.90, label: "twilight" },
  };
  const cfg = TOD[tod];
  const skyTop = new THREE.Color().setHSL(...cfg.skyTop);
  const skyBot = new THREE.Color().setHSL(...cfg.skyBot);
  scene.background = skyTop.clone();

  // ---------- Atmospheric sky shader ----------
  // Three-band gradient (zenith / horizon / nadir) plus a sun-direction
  // bias that brightens the sky near the sun direction. This replaces the
  // simple two-color gradient with a real atmospheric look — the horizon
  // glows orange near the sun at golden hour, the zenith stays deep blue
  // at midday, and the falloff curve matches what you'd see looking out a
  // skyscraper window. Combined with our visible sun disc + tinted fog
  // it sells "sky" instead of "blue dome".
  const sunDirNorm = new THREE.Vector3(...cfg.sunDir).normalize();
  const sunGlowCol = new THREE.Color(cfg.sunCol);
  const horizCol   = new THREE.Color().lerpColors(skyBot, sunGlowCol,
    tod === "golden" ? 0.55 : tod === "twilight" ? 0.25 : 0.15);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor:   { value: skyTop },
      horizColor: { value: horizCol },
      botColor:   { value: skyBot },
      sunDir:     { value: sunDirNorm },
      sunGlow:    { value: sunGlowCol },
      sunStrength:{ value: tod === "twilight" ? 0.10 : tod === "golden" ? 0.85 : 0.35 },
      cloudCol:   { value: new THREE.Color(tod === "twilight" ? 0x565d80 : tod === "golden" ? 0xffd9b8 : 0xf4f6fa) },
      cloudShade: { value: new THREE.Color(tod === "twilight" ? 0x23283f : tod === "golden" ? 0xa9868a : 0xaab6c6) },
      cloudCover: { value: tod === "midday" ? 0.42 : tod === "twilight" ? 0.5 : 0.48 },
      uTime:      { value: 0 },
    },
    vertexShader: `
      varying vec3 vPos;
      void main(){
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 horizColor;
      uniform vec3 botColor;
      uniform vec3 sunDir;
      uniform vec3 sunGlow;
      uniform float sunStrength;
      uniform vec3 cloudCol;
      uniform vec3 cloudShade;
      uniform float cloudCover;
      uniform float uTime;
      varying vec3 vPos;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int k = 0; k < 5; k++){ v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 dir = normalize(vPos);
        float h = dir.y;                     // -1 (down) .. 1 (up)
        // Sky: smooth blend between three colours along altitude.
        // Zenith dominates above 0.3, horizon is the band -0.05..0.3, ground
        // colour below the horizon.
        vec3 sky;
        if (h > 0.30) {
          sky = mix(horizColor, topColor, smoothstep(0.30, 0.85, h));
        } else if (h > -0.05) {
          sky = mix(botColor, horizColor, smoothstep(-0.05, 0.30, h));
        } else {
          sky = botColor;
        }
        // Sun-direction warmth: brighten + tint pixels near the sun direction.
        // The dot product gives a smooth halo. Falls off quickly so only the
        // hemisphere around the sun glows.
        float sunDot = max(0.0, dot(dir, normalize(sunDir)));
        float halo = pow(sunDot, 6.0) * sunStrength;
        sky += sunGlow * halo * 0.6;
        // A wider, softer additional glow that fills the sun-side of the sky
        float wide = pow(sunDot, 1.5) * sunStrength * 0.18;
        sky += sunGlow * wide;
        // A cloud layer: fbm projected onto a high plane, drifting slowly,
        // thinning toward the horizon (where it would be seen edge-on).
        if (h > 0.02) {
          vec2 cp = dir.xz / (h + 0.12) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
          float n = fbm(cp) * 0.75 + fbm(cp * 2.7 + 3.1) * 0.25;
          float c = smoothstep(cloudCover, cloudCover + 0.22, n) * smoothstep(0.02, 0.22, h);
          float lit = clamp(0.55 + 0.45 * dot(normalize(vec3(dir.x, 0.0, dir.z) + 1e-4), normalize(vec3(sunDir.x, 0.0, sunDir.z) + 1e-4)), 0.0, 1.0);
          vec3 cc = mix(cloudShade, cloudCol, clamp(lit * 0.7 + (n - cloudCover) * 1.4, 0.0, 1.0));
          sky = mix(sky, cc + sunGlow * halo * 0.35, c * 0.92);
        }
        gl_FragColor = vec4(sky, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 24), skyMat);
  scene.add(sky);

  // Distance fog tinted to the horizon colour, so far-off buildings fade
  // softly into the sky instead of cutting off as a hard edge.
  scene.fog = new THREE.Fog(new THREE.Color(cfg.fogCol), cfg.fogNear, cfg.fogFar);

  // ---- Sun ---- direction-aware so morning sun is in front, golden-hour
  // sun is low to the side, twilight sun is essentially absent.
  const sun = new THREE.DirectionalLight(cfg.sunCol, cfg.sunInt);
  sun.position.set(...cfg.sunDir);
  sun.castShadow = !IS_LOW_POWER;
  if (sun.castShadow) {
    sun.shadow.mapSize.set(IS_LOW_POWER ? 512 : 1024, IS_LOW_POWER ? 512 : 1024);
    sun.shadow.camera.left = -200; sun.shadow.camera.right = 200;
    sun.shadow.camera.top = 200; sun.shadow.camera.bottom = -200;
    sun.shadow.camera.far = 600;
  }
  scene.add(sun);

  // Visible sun disc (only when the sun is genuinely up — golden hour is
  // the latest time we still draw it). Helps the user *see* what time it is.
  if (tod !== "twilight") {
    const sunPos = new THREE.Vector3(...cfg.sunDir).normalize().multiplyScalar(1500);
    const sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(tod === "golden" ? 90 : 55, 24, 16),
      new THREE.MeshBasicMaterial({ color: cfg.sunCol, fog: false })
    );
    sunDisc.position.copy(sunPos);
    scene.add(sunDisc);
  }

  // Hemisphere fill — lights up the underside of objects (useful so the
  // platform doesn't read as an unlit silhouette at lower rungs).
  scene.add(new THREE.HemisphereLight(cfg.hemi.sky, cfg.hemi.ground, cfg.hemi.intensity));

  // Soft moon for twilight so the scene isn't pitch-dark
  if (tod === "twilight") {
    const moonPos = new THREE.Vector3(220, 260, -400);
    // A real moon is half a degree across; at 36 m radius, 530 m away, this
    // one was fifteen moons wide with a hard-edged halo ball around it.
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(6.5, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xeef2f8, fog: false })
    );
    moon.position.copy(moonPos);
    scene.add(moon);
    const moonHalo = new THREE.Mesh(
      new THREE.SphereGeometry(20, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0x8898b4, transparent: true, opacity: 0.12, fog: false, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    moonHalo.position.copy(moonPos);
    scene.add(moonHalo);
    const moonLight = new THREE.DirectionalLight(0x9aaccc, 0.35);
    moonLight.position.copy(moonPos);
    scene.add(moonLight);
  }

  // Ground (street level — always at y=0; we change camera height instead).
  // Brighter base colour at warmer times of day so the user can clearly see
  // what's down there. Fog still does its work for distance.
  // City-street grid: one tile ≈ a 30 m block, repeated across the 2000 m plane
  // so the streets line up with the building blocks and read as a real city
  // from above (the single biggest "I'm actually high up" cue when looking down).
  const cityTex = makeCityGridTexture(tod);
  cityTex.repeat.set(66, 66);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    new THREE.MeshStandardMaterial({ map: cityTex, color: 0xffffff, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // City buildings — textured facades instead of flat grey boxes and one mesh
  // per lit window (thousands of draw calls). A few facade styles are painted
  // once per visit (window grid, glass/concrete/brick, lit windows at dusk);
  // each building's UVs are scaled by its size so the windows keep a real
  // storey height, and all buildings of a style share one material.
  const seed = rng(123);
  const blockSize = 30;
  const cityRange = IS_LOW_POWER ? 6 : 10;
  const litShare = { morning: 0.04, midday: 0.03, afternoon: 0.08, golden: 0.38, twilight: 0.7 }[tod] || 0.1;
  const FACADES = [
    { base: "#4f5961", win: "#1f2831", frame: "#7b848c", reflect: "#56697c", bays: 6, floors: 5, glass: true },   // glass curtain wall
    { base: "#8b8176", win: "#2a2d33", frame: "#a59a8c", reflect: "#6f7f90", bays: 3, floors: 5, glass: false },  // stone / concrete
    { base: "#7a4f3f", win: "#23262c", frame: "#9c8c7c", reflect: "#6b7a88", bays: 3, floors: 5, glass: false },  // brick
    { base: "#b9b3a7", win: "#2d333b", frame: "#d4cec3", reflect: "#8497aa", bays: 4, floors: 5, glass: false },  // pale render
  ];
  const facadeTex = (F) => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 320;
    const g = c.getContext("2d");
    const e = document.createElement("canvas"); e.width = 256; e.height = 320;
    const ge = e.getContext("2d"); ge.fillStyle = "#000"; ge.fillRect(0, 0, 256, 320);
    g.fillStyle = F.base; g.fillRect(0, 0, 256, 320);
    // surface grain
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${0.02 + Math.random() * 0.04})`; g.fillRect(Math.random() * 256, Math.random() * 320, 2, 2); }
    const bw = 256 / F.bays, fh = 320 / F.floors;
    for (let fl = 0; fl < F.floors; fl++) {
      // slab line between floors
      g.fillStyle = "rgba(0,0,0,0.18)"; g.fillRect(0, fl * fh, 256, F.glass ? 3 : 5);
      for (let bx = 0; bx < F.bays; bx++) {
        const x0 = bx * bw + (F.glass ? 2 : bw * 0.18), y0 = fl * fh + (F.glass ? 5 : fh * 0.22);
        const ww = F.glass ? bw - 4 : bw * 0.64, wh = F.glass ? fh - 8 : fh * 0.56;
        const lit = Math.random() < litShare;
        if (lit) {
          const warm = ["#ffd28a", "#ffe2a8", "#fff1cf", "#cfe4ff"][Math.floor(Math.random() * 4)];
          g.fillStyle = warm; g.fillRect(x0, y0, ww, wh);
          ge.fillStyle = warm; ge.fillRect(x0, y0, ww, wh);
          if (Math.random() < 0.6) { g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(x0, y0, ww, wh * 0.18); ge.fillStyle = "rgba(0,0,0,0.5)"; ge.fillRect(x0, y0, ww, wh * 0.18); }
        } else {
          const gr = g.createLinearGradient(x0, y0, x0 + ww, y0 + wh);
          gr.addColorStop(0, F.reflect); gr.addColorStop(0.45, F.win); gr.addColorStop(1, F.win);
          g.fillStyle = gr; g.fillRect(x0, y0, ww, wh);
        }
        g.strokeStyle = F.frame; g.lineWidth = F.glass ? 2 : 3; g.strokeRect(x0, y0, ww, wh);
      }
    }
    const t1 = new THREE.CanvasTexture(c); t1.colorSpace = THREE.SRGBColorSpace; t1.wrapS = t1.wrapT = THREE.RepeatWrapping; t1.anisotropy = 4;
    const t2 = new THREE.CanvasTexture(e); t2.colorSpace = THREE.SRGBColorSpace; t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
    return { map: t1, emissiveMap: t2, bayW: 3.2 * F.bays, floorsH: 3.4 * F.floors };
  };
  const roofTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
    g.fillStyle = "#6b6d70"; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${0.04 + Math.random() * 0.06})`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    g.fillStyle = "#55575b"; g.fillRect(20, 30, 30, 22); g.fillRect(80, 70, 26, 34);
    const t2 = new THREE.CanvasTexture(c); t2.colorSpace = THREE.SRGBColorSpace; t2.wrapS = t2.wrapT = THREE.RepeatWrapping; return t2;
  })();
  const roofDusk = tod === "twilight" ? 0.4 : tod === "golden" ? 0.8 : 1.0;
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.95, color: new THREE.Color(roofDusk, roofDusk, roofDusk), envMapIntensity: 0.3 });
  const nightGlow = tod === "twilight" ? 0.62 : tod === "golden" ? 0.16 : 0.0;
  const facadeMats = FACADES.map((F) => {
    const T = facadeTex(F);
    const dusk = tod === "twilight" ? 0.42 : tod === "golden" ? 0.8 : 1.0;
    const m = new THREE.MeshStandardMaterial({
      map: T.map, roughness: F.glass ? 0.5 : 0.88, metalness: F.glass ? 0.15 : 0.0,
      color: new THREE.Color(dusk, dusk, dusk),
      emissive: 0xffffff, emissiveMap: T.emissiveMap, emissiveIntensity: nightGlow * 0.9,
      envMapIntensity: F.glass ? 0.4 : 0.25,
    });
    m.userData.unitW = T.bayW; m.userData.unitH = T.floorsH;
    return m;
  });
  // Scale a box's side UVs so one texture repeat = unitW m across × unitH m up.
  const cityBox = (w, bh, d, mi) => {
    const geo = new THREE.BoxGeometry(w, bh, d);
    const uv = geo.attributes.uv, M = facadeMats[mi];
    // groups: +x, -x, +y, -y, +z, -z (4 verts each)
    const faceW = [d, d, w, w, w, w], faceH = [bh, bh, d, d, bh, bh];
    for (let f = 0; f < 6; f++) {
      if (f === 2 || f === 3) continue;
      for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * faceW[f] / M.userData.unitW, uv.getY(i) * faceH[f] / M.userData.unitH); }
    }
    return new THREE.Mesh(geo, [M, M, roofMat, roofMat, M, M]);
  };
  for (let gx = -cityRange; gx <= cityRange; gx++) {
    for (let gz = -cityRange; gz <= cityRange; gz++) {
      const cx = gx * blockSize + (seed() - 0.5) * 4;
      const cz = gz * blockSize + (seed() - 0.5) * 4;
      // Skip directly under viewer for low levels (where they'd see right beneath)
      if (Math.abs(cx) < 15 && Math.abs(cz) < 15) { void seed(); void seed(); void seed(); void seed(); continue; }
      // A wide avenue straight ahead: you look ACROSS the city and down into
      // the street, instead of into the glass of the building opposite.
      if (Math.abs(cx) < 24 && cz < 0 && cz > -130) { void seed(); void seed(); void seed(); void seed(); continue; }
      const w = 12 + seed() * 14;
      const d = 12 + seed() * 14;
      // Storeys, so the facade's floors line up with the building's top.
      const bh = 3.4 * Math.round((12 + seed() * 90) / 3.4);
      const mi = Math.floor(seed() * FACADES.length);
      void seed();
      const b = cityBox(w, bh, d, mi);
      b.position.set(cx, bh / 2, cz);
      b.castShadow = true;
      b.receiveShadow = true;
      scene.add(b);
    }
  }

  // Foreground: long walkable platform + segmented railing.
  // Length scales with rung — higher rungs feel like wider rooftops/cliffs.
  // The platform uses a full PBR map set: albedo + normal (for fake bumps
  // from aggregate pebbles), roughness (foot-worn polish), and AO (deep dark
  // in the expansion joints). Combined with the env map / SSAO from the
  // post-processing pipeline this gives the slab the right physical feel.
  // Deeper platform so the user spawns BACK from the railing and has to walk
  // forward to face the drop. The first thing the user sees is their own
  // character standing safely in front of a rooftop access door — they
  // choose when (and whether) to approach the edge. This is the single
  // biggest realism upgrade: a fear sim should let the user APPROACH the fear,
  // not start them already-at-it.
  const platLen = 14 + h * 14;         // walking corridor along the edge
  // Depth scales with rung height — a "step" rung is a small balcony, the
  // skyscraper rooftop is bigger. Either way the user spawns near the back
  // and walks forward, but the visible scale matches the height fear.
  const platDepth = 4 + h * 4;          // 4 m at street level, 8 m at the top
  const platCenterZ = (platDepth / 2) - 0.5;   // front edge at z = -0.5, back at z = platDepth - 0.5
  const concreteMaps = makeConcreteMaps();
  // Tile every map identically so the bumps line up with the visible specks
  const tilesX = Math.max(2, platLen / 1.5);
  const tilesY = Math.max(2, platDepth / 1.5);
  for (const tex of [concreteMaps.albedo, concreteMaps.normal, concreteMaps.roughness, concreteMaps.ao]) {
    tex.repeat.set(tilesX, tilesY);
  }
  const platMat = new THREE.MeshStandardMaterial({
    map:          concreteMaps.albedo,
    normalMap:    concreteMaps.normal,
    normalScale:  new THREE.Vector2(0.7, 0.7),
    roughnessMap: concreteMaps.roughness,
    roughness:    1.0,                  // multiplied by the map
    aoMap:        concreteMaps.ao,
    aoMapIntensity: 1.0,
    color:        tod === "twilight" ? 0x6e7078 : 0x9a9c9f,
    metalness:    0.0,
    envMapIntensity: tod === "twilight" ? 0.6 : 0.4,
  });
  // Glass skywalk: from the mid rungs up, the front strip of the floor is a
  // transparent glass panel — walk onto it and the city is straight down
  // through your feet. The single most iconic acrophobia trigger, and a clear
  // escalation: solid ground low down, glass over the void up high.
  const hasGlass = h >= 0.45;
  const glassDepth = hasGlass ? Math.min(1.8, platDepth * 0.42) : 0;
  // Glass-skywalk crossing state. These were never declared: reading `_onGlass`
  // threw a ReferenceError on the FIRST frame of the top rung, and the render
  // loop's try/catch swallowed it — so everything after that line in the
  // heights update (edge vertigo, rail grip, narration) silently never ran.
  let _onGlass = false;
  let _glassCrossed = false;
  const concreteDepth = platDepth - glassDepth;
  const concreteCenterZ = platCenterZ + glassDepth / 2;   // front edge retreats to make room
  const platform = new THREE.Mesh(new THREE.BoxGeometry(platLen, 0.25, concreteDepth), platMat);
  platform.position.set(0, cameraY - 1.6, concreteCenterZ);
  // aoMap requires a second UV channel — copy the default one
  platform.geometry.setAttribute("uv2", platform.geometry.attributes.uv);
  platform.castShadow = true;
  platform.receiveShadow = true;
  scene.add(platform);
  if (hasGlass) {
    const glassTopY = cameraY - 1.6 + 0.125;              // flush with the concrete surface
    const glassZ = -0.5 + glassDepth / 2;
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(platLen, 0.06, glassDepth),
      new THREE.MeshStandardMaterial({
        color: 0xdde8ee, transparent: true, opacity: 0.08,
        roughness: 0.14, metalness: 0.0, envMapIntensity: 0.3, depthWrite: false,
      })
    );
    glass.position.set(0, glassTopY - 0.02, glassZ);
    glass.renderOrder = 2;
    scene.add(glass);
    // Metal frame ribs so the pane reads as solid glass you can stand on, not a
    // hole in the floor.
    const ribMat = new THREE.MeshStandardMaterial({ color: 0x8fa6b6, metalness: 0.7, roughness: 0.4 });
    const ribs = Math.max(2, Math.round(platLen / 2.5));
    for (let i = 1; i < ribs; i++) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.07, glassDepth), ribMat);
      rib.position.set(-platLen / 2 + i * (platLen / ribs), glassTopY - 0.02, glassZ);
      scene.add(rib);
    }
  }

  // ---------- Rooftop access (compact, off-centre) ----------
  // A small access structure to the LEFT side of the back of the platform —
  // OFF the camera-behind-character axis so the third-person camera doesn't
  // end up inside the structure. Smaller than before so it doesn't dominate.
  // Includes a door + roof access sign so it reads as a real building top.
  // Skipped on the lowest "step" rung (h ≤ 0.05) where the user is at
  // street level.
  const platTopY = cameraY - 1.6 + 0.125;       // top of the 0.25-thick platform
  // Collidable structures the TP camera shouldn't clip through. We collect
  // major occluders here and pass them to the camera as collision targets
  // (set on the controls in the return-result wiring).
  const collisionObjects = [];
  // The TP camera must not dip below the roof slab (looking up drops the
  // orbit camera by up to 1.4 m — it could clip under the platform and show
  // the void beneath the building).
  collisionObjects.push(platform);
  if (rung >= 3) {   // a "ROOF ACCESS" stair head belongs on a roof, not a balcony
    const backZ = platDepth - 0.5;
    const sideX = -platLen * 0.30;                // left side of the platform
    const houseMat = new THREE.MeshStandardMaterial({
      color: tod === "twilight" ? 0x484850 : 0x8c8e92,
      roughness: 0.85, metalness: 0.0,
    });
    const penthouseW = 2.0;
    const penthouseH = 2.4;
    const penthouseD = 1.0;
    const penthouse = new THREE.Mesh(
      new THREE.BoxGeometry(penthouseW, penthouseH, penthouseD),
      houseMat
    );
    penthouse.position.set(sideX, platTopY + penthouseH / 2, backZ - penthouseD / 2 - 0.1);
    penthouse.castShadow = true; penthouse.receiveShadow = true;
    scene.add(penthouse);
    collisionObjects.push(penthouse);
    // Sloped roof
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(penthouseW + 0.3, 0.08, penthouseD + 0.3),
      new THREE.MeshStandardMaterial({
        color: tod === "twilight" ? 0x2a2a30 : 0x4a4c52, roughness: 0.7,
      })
    );
    roof.position.set(sideX, platTopY + penthouseH + 0.05, backZ - penthouseD / 2 - 0.1);
    roof.rotation.x = -0.04;
    roof.castShadow = true; roof.receiveShadow = true;
    scene.add(roof);
    // Door — facing toward the platform centre so the user emerges from it
    // walking forward, not sideways.
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x5a3a20, roughness: 0.6, metalness: 0.05,
    });
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 1.95, 0.06),
      doorMat
    );
    door.position.set(sideX + penthouseW / 2 + 0.03, platTopY + 0.97, backZ - penthouseD / 2 - 0.1);
    door.rotation.y = Math.PI / 2;       // door faces +x (toward platform centre)
    door.castShadow = true; door.receiveShadow = true;
    scene.add(door);
    // Doorknob
    const knob = new THREE.Mesh(
      new THREE.SphereGeometry(0.025, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0xc0a050, metalness: 0.85, roughness: 0.25 })
    );
    knob.position.set(sideX + penthouseW / 2 + 0.10, platTopY + 0.97, backZ - penthouseD / 2 + 0.20);
    scene.add(knob);
    // "Roof access" sign above the door
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 256; signCanvas.height = 64;
    const sctx = signCanvas.getContext("2d");
    sctx.fillStyle = "#2a2a32"; sctx.fillRect(0, 0, 256, 64);
    sctx.fillStyle = "#dde1e8";
    sctx.font = "bold 24px sans-serif"; sctx.textAlign = "center"; sctx.textBaseline = "middle";
    sctx.fillText("ROOF ACCESS", 128, 32);
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.24),
      new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6, metalness: 0.3 })
    );
    sign.position.set(sideX + penthouseW / 2 + 0.03, platTopY + 2.05, backZ - penthouseD / 2 - 0.1);
    sign.rotation.y = Math.PI / 2;
    scene.add(sign);
  }

  // Yellow / black hazard stripe along the front edge of the platform — sits
  // 1 cm above the slab so it's clearly visible. This is the single most
  // important visual cue: it tells the user EXACTLY where the drop begins.
  const stripeTex = makeEdgeStripeTexture();
  stripeTex.repeat.set(Math.ceil(platLen / 1.5), 1);
  const stripe = new THREE.Mesh(
    new THREE.PlaneGeometry(platLen, 0.25),
    new THREE.MeshStandardMaterial({
      map: stripeTex,
      roughness: 0.7,
      // Very slight emissive so the stripe glows softly at twilight too
      emissive: 0xffd23d, emissiveIntensity: tod === "twilight" ? 0.25 : 0.05,
    })
  );
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(0, cameraY - 1.47, -0.39);
  stripe.receiveShadow = true;
  scene.add(stripe);

  // ---------- Goal indicator: the "fear zone" at the railing ----------
  // A soft outline on the platform a meter back from the edge — tells the
  // user WHERE to stand to start earning full credit on the rung's hold
  // timer. Uses NORMAL alpha-blending (was additive — additive teal on
  // bright concrete bloomed near-white and obscured the ground in TP).
  // Pulses gently. Fades away once the user reaches it (in update()).
  // Skipped on glass-floor rungs — the glass panel itself marks the edge zone,
  // and a teal ring laid over the glass at a grazing angle reads as a blob.
  let goalZone = null;
  if (!hasGlass) {
    goalZone = new THREE.Mesh(
      new THREE.RingGeometry(0.20, 0.55, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7cd1c5,
        transparent: true,
        opacity: 0.40,
        side: THREE.DoubleSide,
        depthWrite: false,
        fog: false,
      })
    );
    goalZone.rotation.x = -Math.PI / 2;
    goalZone.position.set(0, cameraY - 1.46, 0.30);
    scene.add(goalZone);
  }

  // Lip / kerb at the very edge — a low concrete lip so the eye reads the
  // platform as a real solid edge, not a paper-thin slab. About 6 cm tall.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(platLen, 0.06, 0.10),
    new THREE.MeshStandardMaterial({ color: 0x70737a, roughness: 0.85 })
  );
  lip.position.set(0, cameraY - 1.45, -0.45);
  lip.castShadow = true; lip.receiveShadow = true;
  scene.add(lip);

  // Outside-edge "fascia" face — a thick coloured strip that drops below the
  // platform on the outside, visible from above when looking down. Without
  // this, the bottom of the platform geometry has no shading and the eye
  // can't tell how thick the slab is.
  const fasciaH = Math.min(1.2, DROP - 0.05);
  const fascia = new THREE.Mesh(
    new THREE.BoxGeometry(platLen, fasciaH, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x4a4d54, roughness: 0.85 })
  );
  fascia.position.set(0, cameraY - 1.6 - fasciaH / 2, -0.51);
  fascia.castShadow = true; fascia.receiveShadow = true;
  scene.add(fascia);

  // The building the platform belongs to. The city loop skips the
  // |cx|<15 && |cz|<15 zone, so without this shaft the slab (and its ROOF
  // ACCESS penthouse) floats in mid-air — the lean-over view looked straight
  // down at bare street where a facade must be. The front face is inset
  // ~0.5–1 m behind the slab edge so the drop past the glass / lean line
  // stays sheer (observation-deck overhang).
  {
    const shaftH = cameraY - 1.7;
    const shaftD = concreteDepth * 0.9;
    const shaftW = platLen * 0.9;
    const shaftZ = concreteCenterZ + 0.3;
    // Same facade as the city (a stone face on the ledge and balcony rungs,
    // glass above) — the drop face used to be a blank grey slab dotted with
    // one mesh per lit window.
    const shaft = rung <= 1
      ? new THREE.Mesh(new THREE.BoxGeometry(shaftW, shaftH, shaftD),
          new THREE.MeshStandardMaterial({ color: 0x8e8578, roughness: 0.9, map: concreteMaps.albedo, normalMap: concreteMaps.normal }))
      : cityBox(shaftW, shaftH, shaftD, 0);
    shaft.position.set(0, shaftH / 2, shaftZ);
    shaft.castShadow = true; shaft.receiveShadow = true;
    scene.add(shaft);
    collisionObjects.push(shaft);
  }

  // Brushed steel railing — lower roughness for sharper highlights, with the
  // env map doing the heavy lifting. envMapIntensity > 1 gives a real metal
  // pop against the sky.
  // (The studio env map is white: at 1.4 the rail glowed like a neon tube at
  // dusk. It reflects a little less as the light goes.)
  const railMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3ad, metalness: 0.92, roughness: 0.32,
    envMapIntensity: tod === "twilight" ? 0.35 : tod === "golden" ? 0.7 : 1.1,
  });
  // Segmented top rail — each segment can wobble independently when shaken
  const railSegments = [];
  const segLen = 2.0;
  const halfLen = platLen / 2;
  for (let x = -halfLen + segLen / 2; x <= halfLen - segLen / 2; x += segLen) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, segLen, 12), railMat);
    seg.rotation.z = Math.PI / 2;
    seg.position.set(x, cameraY - 0.5, -0.4);
    seg.userData = { baseX: x, baseY: cameraY - 0.5, baseZ: -0.4, shake: 0, noCollide: true };
    scene.add(seg);
    railSegments.push(seg);
  }
  // Posts every ~1.8 m along the platform
  const railPosts = [];
  for (let x = -halfLen + 0.8; x < halfLen - 0.7; x += 1.8) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8), railMat);
    post.position.set(x, cameraY - 1.0, -0.4);
    post.userData = { baseX: x, baseY: cameraY - 1.0, baseZ: -0.4, shake: 0, noCollide: true };
    scene.add(post);
    railPosts.push(post);
  }

  // Moving cars on the streets — bright lit dots at GROUND level. They give
  // the height a real scale: the eye reads the bright pinpricks as "those are
  // cars, far below me." Crucial for the visceral feeling of altitude.
  // Headlights and taillights are emissive at twilight so they pop against
  // the dim city, faded during midday so they read as ordinary cars.
  const cars = [];
  const carCount = Math.floor(20 + h * 50);
  const isDark = (tod === "twilight" || tod === "golden");
  const headBright = isDark ? 1.0 : 0.4;
  const tailBright = isDark ? 1.0 : 0.4;
  const headlightMat = new THREE.MeshBasicMaterial({
    color: isDark ? 0xffffff : 0xfff8d8,
  });
  const taillightMat = new THREE.MeshBasicMaterial({
    color: isDark ? 0xff3322 : 0xff5544,
  });
  for (let i = 0; i < carCount; i++) {
    const car = new THREE.Group();
    const heading = i % 2 === 0 ? 1 : -1;
    // Headlights — the glow-ball size scales with rung height: from a rooftop
    // a car needs an oversized bloom to read at all, but at the low rungs the
    // same sphere was wider than half the car body and skewered through it.
    // Slightly larger at dark times so they still pop from far away.
    const headR = (0.15 + h * 0.70) * (isDark ? 1.0 : 0.7);
    const head = new THREE.Mesh(new THREE.SphereGeometry(headR), headlightMat);
    head.position.set(heading * 1.4, 0.05, 0); car.add(head);
    const tailR = (0.12 + h * 0.55) * (isDark ? 1.0 : 0.7);
    const tail = new THREE.Mesh(new THREE.SphereGeometry(tailR), taillightMat);
    tail.position.set(-heading * 1.4, 0.05, 0); car.add(tail);
    // Car body — colour varies a bit so the city doesn't look uniform
    const colour = new THREE.Color().setHSL(Math.random(), 0.15, 0.22);
    const carBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.3, 1.7),
      new THREE.MeshStandardMaterial({ color: colour, roughness: 0.5, metalness: 0.4 })
    );
    carBody.position.y = -0.25; car.add(carBody);
    const row = Math.floor(i / 4) - 3;
    car.position.set(
      (Math.random() - 0.5) * 800,
      groundY + 0.6,
      row * 60 + (i % 2) * 4
    );
    car.userData.heading = heading;
    car.userData.speed = 8 + Math.random() * 6;
    scene.add(car);
    cars.push(car);
  }

  // Pedestrians on the street — slim figures with a head + body so they're
  // recognisable as people from height (rather than just black cylinders).
  const people = [];
  const personCount = Math.floor(8 + h * 30);
  const personBodyMat = new THREE.MeshStandardMaterial({
    color: tod === "twilight" ? 0x14141c : 0x1a1a22,
    roughness: 0.9,
  });
  const personHeadMat = new THREE.MeshStandardMaterial({
    color: 0xc9a07a, roughness: 0.85,
  });
  for (let i = 0; i < personCount; i++) {
    const p = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.30, 1.4, 6),
      personBodyMat
    );
    body.position.y = 0.7;
    p.add(body);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 8, 6),
      personHeadMat
    );
    head.position.y = 1.55;
    p.add(head);
    p.position.set(
      (Math.random() - 0.5) * 500,
      groundY,
      (Math.random() - 0.5) * 500
    );
    p.userData.dir = Math.random() * Math.PI * 2;
    p.userData.speed = 0.3 + Math.random() * 0.4;
    scene.add(p);
    people.push(p);
  }

  // Drifting clouds — volumetric stack instead of a single flat sphere.
  // Each cloud is a Group of 4-6 overlapping spheres at varied scales, all
  // translucent. The eye reads the silhouette as a real cumulus puff because
  // the edges have natural irregular bumps, not a single round outline.
  const cloudColor = (tod === "twilight") ? 0xb8c0d4
                   : (tod === "golden")   ? 0xffe0c0
                                          : 0xffffff;
  const cloudOpacity = (tod === "twilight") ? 0.55 : 0.78;
  const clouds = [];   // (sphere-puff clouds retired: the sky shader draws a cloud layer)
  for (let i = 0; i < 0; i++) {
    const cloud = new THREE.Group();
    const baseR = 14 + Math.random() * 22;
    const puffCount = 4 + Math.floor(Math.random() * 3);
    for (let p = 0; p < puffCount; p++) {
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(baseR * (0.7 + Math.random() * 0.5), 10, 7),
        new THREE.MeshStandardMaterial({
          color: cloudColor, transparent: true, opacity: cloudOpacity,
          fog: false, roughness: 1.0,
        })
      );
      // Lateral spread so the puffs don't all stack on top of each other
      puff.position.set(
        (Math.random() - 0.5) * baseR * 1.2,
        (Math.random() - 0.5) * baseR * 0.25,
        (Math.random() - 0.5) * baseR * 0.6,
      );
      puff.scale.y = 0.5 + Math.random() * 0.15;
      cloud.add(puff);
    }
    cloud.position.set(
      (Math.random() - 0.5) * 1200,
      cameraY - 8 + Math.random() * 80 + h * 30,
      -200 - Math.random() * 800
    );
    cloud.userData.driftSpeed = 0.6 + Math.random() * 1.2;
    scene.add(cloud);
    clouds.push(cloud);
  }

  // ---- Wind particles ----
  // Fine motes (dust / mist / the odd bit of debris) streaking laterally past
  // the viewer, faster and denser the higher you are and during gusts. Real
  // height in real wind has visible air movement — it's a strong "there is
  // wind up here" cue that the audio alone can't give. Cheap: one Points cloud
  // in a box around the camera, wrapped as motes drift out of range.
  let windParticles = null;
  if (!IS_LOW_POWER && h > 0.15) {
    const WP = Math.floor(70 + h * 90);
    const wpPos = new Float32Array(WP * 3);
    const wpVel = new Float32Array(WP);            // per-mote speed scatter
    for (let i = 0; i < WP; i++) {
      wpPos[i * 3]     = camera.position.x + (Math.random() - 0.5) * 24;
      wpPos[i * 3 + 1] = cameraY + (Math.random() - 0.5) * 12;
      wpPos[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 16 - 2;
      wpVel[i] = 0.6 + Math.random() * 0.9;
    }
    const wpGeo = new THREE.BufferGeometry();
    wpGeo.setAttribute("position", new THREE.BufferAttribute(wpPos, 3));
    const wpMat = new THREE.PointsMaterial({
      color: tod === "twilight" ? 0xc8d2e4 : 0xeae4d6,
      size: 0.06, transparent: true, opacity: 0.5,
      depthWrite: false, sizeAttenuation: true, fog: true,
    });
    windParticles = new THREE.Points(wpGeo, wpMat);
    windParticles.userData = { vel: wpVel, count: WP };
    windParticles.frustumCulled = false;
    scene.add(windParticles);
  }

  // Birds — small dark V-silhouettes drifting in formations far away.
  // A subtle "this is the sky" cue that gives the eye real depth references
  // beyond the static clouds. Only on rungs where the user is genuinely
  // up high (h > 0.30) so a "step" rung doesn't have birds at eye level.
  const birds = [];
  if (h > 0.30 && tod !== "twilight") {
    const flockCount = 2 + Math.floor(h * 3);
    for (let f = 0; f < flockCount; f++) {
      const flock = new THREE.Group();
      const flockSize = 5 + Math.floor(Math.random() * 6);
      const birdMat = new THREE.MeshBasicMaterial({
        color: 0x1a1f28, transparent: true, opacity: 0.85,
      });
      for (let bi = 0; bi < flockSize; bi++) {
        // Each bird is a tiny V-shape made of two thin boxes
        const bird = new THREE.Group();
        for (const sx of [-1, 1]) {
          const wing = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 0.04, 0.04),
            birdMat
          );
          wing.position.set(sx * 0.3, 0, 0);
          wing.rotation.z = sx * -0.3;
          bird.add(wing);
        }
        // V-formation: birds offset behind the leader
        bird.position.set(
          (bi - flockSize / 2) * 0.9 + Math.random() * 0.2,
          (Math.abs(bi - flockSize / 2) * -0.4),
          (Math.abs(bi - flockSize / 2) * -1.2)
        );
        flock.add(bird);
      }
      flock.position.set(
        (Math.random() - 0.5) * 600,
        cameraY - 5 + Math.random() * 50,
        -180 - Math.random() * 400
      );
      flock.userData.driftSpeed = 1.5 + Math.random() * 1.0;
      flock.userData.dir = Math.random() < 0.5 ? -1 : 1;
      scene.add(flock);
      birds.push(flock);
    }
  }

  // Rooftop clutter — antenna mast, vent stack, satellite dish. Only at
  // rooftop+ rungs (h > 0.55). Adds visual scale + makes the platform read
  // as a real building top, not a floating slab.
  const rooftopProps = [];
  if (h > 0.55) {
    // Antenna mast at one end of the platform
    const mastBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.10, 0.18, 10),
      new THREE.MeshStandardMaterial({ color: 0x4a4a52, metalness: 0.5, roughness: 0.6 })
    );
    mastBase.position.set(halfLen - 1.4, cameraY - 1.30, 1.6);
    mastBase.castShadow = true;
    scene.add(mastBase);
    rooftopProps.push(mastBase);
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.025, 4.5, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 0.7, roughness: 0.4 })
    );
    mast.position.set(halfLen - 1.4, cameraY + 0.95, 1.6);
    scene.add(mast);
    // Crossbeam near the top
    const cross = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.025, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 0.7, roughness: 0.4 })
    );
    cross.position.set(halfLen - 1.4, cameraY + 2.4, 1.6);
    scene.add(cross);
    // Red warning beacon on the very top (emissive — flickers in update)
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a })
    );
    beacon.position.set(halfLen - 1.4, cameraY + 3.20, 1.6);
    scene.add(beacon);
    rooftopProps.push({ beacon });

    // HVAC vent stack on the other end — silver box + cylinder
    const vent = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x9a9aa2, metalness: 0.6, roughness: 0.5 })
    );
    vent.position.set(-(halfLen - 1.4), cameraY - 1.20, 1.6);
    vent.castShadow = true;
    scene.add(vent);
    rooftopProps.push(vent);
    const ventPipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.10, 0.10, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6a6a72, metalness: 0.7, roughness: 0.4 })
    );
    ventPipe.position.set(-(halfLen - 1.4), cameraY - 0.65, 1.6);
    scene.add(ventPipe);
    // Cap on the vent pipe
    const ventCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12),
      new THREE.MeshStandardMaterial({ color: 0x4a4a52, metalness: 0.7, roughness: 0.4 })
    );
    ventCap.position.set(-(halfLen - 1.4), cameraY - 0.32, 1.6);
    scene.add(ventCap);
  }

  // ---------- Helicopter (h > 0.50) ----------
  // A distant chopper that drifts across the skyline — adds real LIFE to
  // the skyline. Its blade rotation, slight body sway, and slow trajectory
  // sell "the world is going on around me, I'm just up here looking at it."
  // The rotor sound is panned spatially through the audio system so as the
  // helicopter passes the user actually hears it move.
  let helicopter = null;
  let helicopterAudio = null;
  // Skip helicopter on low-power devices — saves ~15 meshes + per-frame
  // rotor animations.
  if (h > 0.50 && !IS_LOW_POWER) {
    helicopter = new THREE.Group();
    const heliBodyMat = new THREE.MeshStandardMaterial({
      color: 0x2a3340, metalness: 0.55, roughness: 0.4,
    });
    // Body — capsule
    const heliBody = new THREE.Mesh(
      new THREE.CapsuleGeometry(1.0, 2.4, 6, 12), heliBodyMat
    );
    heliBody.rotation.z = Math.PI / 2;
    helicopter.add(heliBody);
    // Tail boom
    const tailBoom = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.10, 2.6, 10), heliBodyMat
    );
    tailBoom.rotation.z = Math.PI / 2;
    tailBoom.position.set(-2.4, 0.0, 0);
    helicopter.add(tailBoom);
    // Tail fin (vertical)
    const tailFin = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.7, 0.06), heliBodyMat
    );
    tailFin.position.set(-3.5, 0.45, 0);
    helicopter.add(tailFin);
    // Cockpit window (lit emissive at twilight)
    const cockpit = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 14, 10, 0, Math.PI),
      new THREE.MeshStandardMaterial({
        color: 0x4a6480, metalness: 0.2, roughness: 0.1,
        emissive: tod === "twilight" ? 0x4a5a80 : 0x1a2030,
        emissiveIntensity: tod === "twilight" ? 0.6 : 0.1,
      })
    );
    cockpit.rotation.z = Math.PI / 2;
    cockpit.scale.set(1.0, 0.7, 0.85);
    cockpit.position.set(1.2, 0, 0);
    helicopter.add(cockpit);
    // Main rotor — 4 blades that we spin in update(). Hub plus thin
    // capsules. Motion blur is implicit because they spin fast enough that
    // the eye reads a disc.
    const rotorHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.10, 10),
      new THREE.MeshStandardMaterial({ color: 0x14181e, metalness: 0.7 })
    );
    rotorHub.position.set(0.4, 1.1, 0);
    helicopter.add(rotorHub);
    const mainRotor = new THREE.Group();
    mainRotor.position.set(0.4, 1.1, 0);
    helicopter.add(mainRotor);
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(4.6, 0.04, 0.18),
        new THREE.MeshStandardMaterial({
          color: 0x202428, metalness: 0.4, roughness: 0.6,
          transparent: true, opacity: 0.65,
        })
      );
      blade.rotation.y = i * (Math.PI / 2);
      mainRotor.add(blade);
    }
    helicopter.userData.mainRotor = mainRotor;
    // Tail rotor
    const tailRotor = new THREE.Group();
    tailRotor.position.set(-3.5, 0.30, 0.18);
    tailRotor.rotation.y = Math.PI / 2;
    helicopter.add(tailRotor);
    for (let i = 0; i < 2; i++) {
      const tblade = new THREE.Mesh(
        new THREE.BoxGeometry(0.85, 0.025, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0x202428, metalness: 0.4, roughness: 0.6,
          transparent: true, opacity: 0.55,
        })
      );
      tblade.rotation.y = i * (Math.PI / 2);
      tailRotor.add(tblade);
    }
    helicopter.userData.tailRotor = tailRotor;
    // Navigation lights — small emissive blinkers (red+green nav, white belly)
    const navRed = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xff2a2a })
    );
    navRed.position.set(0.6, -0.4, -1.0);
    helicopter.add(navRed);
    const navGreen = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x2aff60 })
    );
    navGreen.position.set(0.6, -0.4, 1.0);
    helicopter.add(navGreen);
    helicopter.userData.navRed = navRed;
    helicopter.userData.navGreen = navGreen;
    // Initial position — far across the city, slightly below or at user height
    helicopter.position.set(-300 - Math.random() * 200, cameraY - 8 + Math.random() * 30, -180 - Math.random() * 120);
    helicopter.userData.driftSpeed = 4 + Math.random() * 3;     // x m/s
    helicopter.userData.heading = Math.random() < 0.5 ? 1 : -1;
    // Slow body bob so the heli "settles" with weight — every helicopter has
    // this signature in real life.
    helicopter.userData.bobPhase = Math.random() * Math.PI * 2;
    scene.add(helicopter);
  }

  // ---------- Neighbour figures on adjacent rooftops (h > 0.65) ----------
  // At rooftop+ rungs, far-away figures on neighbouring buildings doing
  // ordinary things — stretching, leaning on a railing, sweeping. They give
  // the city a sense of LIFE. Each is a 1.7 m capsule + sphere head with
  // slow idle motion. Distance is far enough that low-poly geometry reads
  // as a real silhouette.
  const neighbours = [];
  // Skip neighbour figures on low-power devices — saves 4 figures + idle anims.
  if (h > 0.65 && !IS_LOW_POWER) {
    const nMat = new THREE.MeshStandardMaterial({
      color: tod === "twilight" ? 0x16181e : 0x2a2c34,
      roughness: 0.95,
    });
    const nHeadMat = new THREE.MeshStandardMaterial({
      color: 0xc9a07a, roughness: 0.85,
    });
    const angles = [-0.55, 0.65, -1.1, 1.3];
    for (const a of angles) {
      const dist = 80 + Math.random() * 60;
      const px = Math.sin(a) * dist;
      const pz = -Math.cos(a) * dist;
      // Find a rooftop close to this xz — a height between 30 and 80 m
      const rooftopY = cameraY - 20 - Math.random() * 60;
      const fig = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.34, 1.10, 6, 10), nMat
      );
      body.position.y = 0.85;
      fig.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), nHeadMat);
      head.position.y = 1.65;
      fig.add(head);
      fig.position.set(px, rooftopY, pz);
      fig.userData.basePhase = Math.random() * Math.PI * 2;
      fig.userData.kind = ["lean", "stretch", "look", "sweep"][Math.floor(Math.random() * 4)];
      scene.add(fig);
      neighbours.push(fig);
    }
  }

  // Wind-blown particles at high altitudes
  let wind = null;
  if (h > 0.55) {
    const N = 200 + Math.floor(h * 200);
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 120;
      positions[i * 3 + 1] = cameraY + (Math.random() - 0.5) * 60;
      positions[i * 3 + 2] = -Math.random() * 200 - 5;
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    wind = new THREE.Points(
      wg,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.18, transparent: true, opacity: 0.55, fog: true })
    );
    scene.add(wind);
  }

  // Falling debris (small pebbles) tumbling past at the highest rungs —
  // makes the drop feel real and scaled.
  let debris = null;
  let debrisData = null;
  if (h > 0.7) {
    const N = 25;
    const positions = new Float32Array(N * 3);
    debrisData = [];
    for (let i = 0; i < N; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 12;
      positions[i * 3 + 1] = cameraY - Math.random() * 80;
      positions[i * 3 + 2] = -2 - Math.random() * 12;
      debrisData.push({ vy: -2 - Math.random() * 4 });
    }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    debris = new THREE.Points(
      dg,
      new THREE.PointsMaterial({ color: 0x8a8a8a, size: 0.4, transparent: true, opacity: 0.85 })
    );
    scene.add(debris);
  }

  // Wind-blown paper / leaves at higher rungs — small flat planes that
  // tumble across the field of view in a natural arc. Adds atmospheric
  // realism that wind PARTICLES (small dots) can't sell on their own —
  // the paper visibly catches the wind and tumbles end-over-end.
  const papers = [];
  if (h > 0.40 && !IS_LOW_POWER) {
    const paperCount = 4 + Math.floor(h * 4);
    const paperColours = [0xfaf6ec, 0xeae3d2, 0xd6e0c8, 0xefd8b8];
    for (let i = 0; i < paperCount; i++) {
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(0.18 + Math.random() * 0.10, 0.24 + Math.random() * 0.08),
        new THREE.MeshStandardMaterial({
          color: paperColours[i % paperColours.length],
          side: THREE.DoubleSide,
          roughness: 0.9,
          metalness: 0,
        })
      );
      paper.position.set(
        -50 + Math.random() * 100,
        cameraY - 6 + Math.random() * 14,
        -2 - Math.random() * 30
      );
      paper.userData = {
        spinX: (Math.random() - 0.5) * 5,
        spinY: (Math.random() - 0.5) * 4,
        spinZ: (Math.random() - 0.5) * 6,
        driftX: 0.6 + Math.random() * 0.8,
        driftY: -0.05 + Math.random() * 0.10,
        bobPhase: Math.random() * Math.PI * 2,
      };
      scene.add(paper);
      papers.push(paper);
    }
  }

  // Camera position + tilt — controls take over after this
  camera.fov = 62 + h * 8;
  camera.updateProjectionMatrix();

  // Fence-shake state: which segments are wobbling, and timer
  let shakeT = 0;
  // Wind-gust state for chaotic (non-sinusoidal) sway, and a reusable vector
  // for driving the FP hands onto the real top rail.
  let _gustT = 0, _gustDur = 0, _gustPeak = 0, _gustDir = 1, _nextGust = 2;
  let _vertigoSm = 0;   // smoothed vertigo — raw value can step instantly
  const _railGrip = new THREE.Vector3();
  // Grip strength from last frame's posture pass — a held rail steadies the
  // body against the sway, and rail shakes only reach the head through it.
  let _gripSteady = 0;
  // Glass-skywalk underfoot edge-detect (first-crossing jolt fires once)
  let _wasOnGlass = false;
  // Auto-look-down animation state (driven by the "Look down" command button)
  let autoLookT = 0;
  let autoLookFrom = 0, autoLookTarget = 0;
  // "Walk to" animation state — user clicks "edge" / "back", camera position
  // smoothly lerps over a couple of seconds so the body visibly steps. The
  // walk amount is also fed into FPControls.moving so the legs cycle.
  let walkAnimT = 0;
  let walkAnimFrom = 0, walkAnimTo = 0;
  // "Lean over" animation — camera pitch drops AND z slides forward past the
  // bound for a held moment, then returns. The visceral peek-over.
  let leanT = 0;
  let leanFromPitch = 0;
  let leanFromZ = 0;
  let storedActiveControls = null;

  // ---- Character-driven event state machine ----
  // The scene tracks the player's relationship to the railing and fires
  // contextual cues / animations based on what the PLAYER does, not what
  // button they press. Each flag is "have we already fired this voice cue?"
  // — once-per-rung so the user isn't nagged.
  const playerState = {
    arrivedAtEdge: false,
    timeAtEdge: 0,
    cuedAtEdge: false,
    cuedDeepLook: false,
    cuedSteppedBack: false,
    pressingAgainstRail: 0,
    autoLeanFired: false,
    timeSinceLastFastApproach: 0,
    lastZ: null,
  };
  // Falling coins (one per "Drop a coin" press) — they tumble far below
  const coins = [];
  let coinDropAnim = null;   // pending hand-extend beat before the coin exists
  function spawnCoin(x, y, z) {
    const coin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.025, 16),
      new THREE.MeshStandardMaterial({ color: 0xddc060, metalness: 0.9, roughness: 0.25 })
    );
    coin.position.set(x + (Math.random() - 0.5) * 0.05, y, z);
    coin.userData = { vy: -1.5, vx: (Math.random() - 0.5) * 0.6, vz: -1 - Math.random() * 1.5,
                      spinX: (Math.random() - 0.5) * 6, spinZ: (Math.random() - 0.5) * 4,
                      landed: false };
    scene.add(coin);
    coins.push(coin);
  }
  function dropCoin(controls) {
    // The hand extends past the rail and opens BEFORE the coin exists — the
    // coin falls from the fingertips, not from a point under the camera.
    // Release point: ~0.4 m ahead of the face, 0.3 m below the eye line.
    const hx = controls.position.x - Math.sin(controls.yaw) * 0.4;
    const hz = controls.position.z - Math.cos(controls.yaw) * 0.4;
    const hy = controls.position.y - 0.3;
    if (active && active.hands && active.hands.setReachTarget && !coinDropAnim) {
      coinDropAnim = { t: 0, pos: new THREE.Vector3(hx, hy, hz) };
      return;
    }
    spawnCoin(hx, hy, hz);
  }

  // Wire the heights command bar buttons. We re-query each tick of the bar
  // because the bar is rendered before this fires; a setTimeout(0) lets the
  // host's innerHTML settle first.
  function wireHeightsCommands() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="heights"]');
    if (!bar) return;
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = storedActiveControls;
        if (!c) return;
        switch (btn.dataset.cmd) {
          case "edge":
            // Smoothly walk the user TO the edge. Animated over ~2.5 seconds
            // so the user feels the approach instead of teleporting — that
            // gradual closing of the distance is the actual exposure cue.
            walkAnimTo = (c.opts.bounds.minZ ?? -0.2) + 0.05;
            walkAnimT  = 1.0;
            walkAnimFrom = c.position.z;
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.h.walk", "Walking to the edge. Notice your feet."));
            break;
          case "back":
            // Smoothly walk back to the safe zone behind the door.
            walkAnimTo = (c.opts.bounds.maxZ ?? 4) - 0.2;
            walkAnimT  = 1.0;
            walkAnimFrom = c.position.z;
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.h.back", "Stepping back. Reset your breath."));
            break;
          case "lean":
            hCoach.note("lean"); setTimeout(() => hSignal("pull"), 900);
            // Lean OVER the railing: the camera tips down + slides forward
            // past the edge for a held moment, then returns. This is the
            // visceral "I want to peek down / I could fall" sensation —
            // the visual brain reads the body weight pitching forward.
            leanT = 1.0;
            leanFromPitch = c.pitch;
            leanFromZ = c.position.z;
            if (window.PhobiaVoice) {
              window.PhobiaVoice.speak(window.t("sc.h.lean", "Leaning over. Hold the rail. Let yourself feel it. You are safe."));
            }
            break;
          case "lookdown":
            // Smoothly tilt the camera straight down for a few seconds, then return
            autoLookT = 1.0;
            autoLookFrom = c.pitch;
            autoLookTarget = -1.45;       // 83° below horizon
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.h.down", "Looking down. The drop is real. So is the railing."));
            break;
          case "shake":
            shakeT = 1.0;
            hCoach.note("shake"); setTimeout(() => hSignal("rattle"), 700);
            // Steel clatter at the rail position — irregular 40–90 ms gaps so
            // the rattle doesn't loop like a sample.
            if (window.PhobiaAudio && window.PhobiaAudio.metalRattle) {
              let rd = 0;
              for (let i = 0; i < 6; i++) {
                rd += 40 + Math.random() * 50;
                setTimeout(() => window.PhobiaAudio.metalRattle(0.9,
                  { x: c.position.x, y: cameraY - 0.5, z: -0.4 }), rd);
              }
            }
            // A gripped rail transmits the wobble into the hands/head
            if (_gripSteady > 0.25 && c.kickShake) c.kickShake(0.02);
            break;
          case "coin":
            setTimeout(() => hSignal("coin"), Math.min(3500, 900 + Math.sqrt(2 * DROP / 9.8) * 1000));
            dropCoin(c);
            if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.h.coin", "Watch it fall. The drop is real. So is the railing under your hand."));
            break;
        }
      };
    });
  }
  setTimeout(wireHeightsCommands, 0);

  // Vertigo heartbeat: now provided by the GLOBAL body-feel rig in mount(),
  // driven by the unified fear value (edge proximity + look-down already feed
  // it via setInput). The scene-local heartbeat was removed so the two don't
  // double up.
  let lastHowlAt = -10;

  // ---- The coach: the alarm, this trial's card, alarm-or-not prompts ----
  // Same learning loop as the creature realms (makeCreatureCoach). "Distance"
  // is how far you stand from the rail; the alarm rises as you walk up to the
  // edge and look down, and falls while you stay there.
  const H_COACH = [
    { sizeMul: 0.46, tau: 11, hFloor: 0.30 },
    { sizeMul: 0.56, tau: 12, hFloor: 0.32 },
    { sizeMul: 0.70, tau: 14, hFloor: 0.34 },
    { sizeMul: 0.82, tau: 16, hFloor: 0.36 },
    { sizeMul: 0.92, tau: 18, hFloor: 0.38 },
  ][rung];
  const hZone = 1.1;   // within ~1 m of the rail
  const hSkill = [
    { id: "near",    icon: "→",  text: window.t("dc.h.gNear", "Step up to the edge") },
    { id: "lookDown",icon: "⤓",  text: window.t("dc.h.gLook", "Look straight down for 5 seconds") },
    { id: "glass",   icon: "🪟", text: window.t("dc.h.gGlass", "Stand on the glass for 5 seconds") },
    { id: "gustHeld",icon: "💨", text: window.t("dc.h.gGust", "Stay at the edge through a gust") },
    { id: "glassLook", icon: "⤓", text: window.t("dc.h.gGlassLook", "On the glass, look straight down for 8 seconds") },
  ][rung];
  const hCoach = makeCreatureCoach({
    kit: creatureKit("heights"),
    stage: document.getElementById("stage"),
    levelIdx: rung, intensity: rung >= 4 ? "apex" : rung >= 2 ? "alert" : "calm",
    dogName: window.t("coach.h.name", "the edge"), title: window.t(`level.heights.${rung}.title`, level.title),
    inZoneDist: hZone, nearD: 0.1, farSpan: 2.6,
    sizeMul: H_COACH.sizeMul, tau: H_COACH.tau, hFloor: H_COACH.hFloor,
    minHold: level.minHold || 12,
    coarse: IS_COARSE_POINTER,
    expect: (() => { const e = window.__pendingExpect; return (e && e.phobia === "heights" && e.level === levelIdx) ? e : null; })(),
    goals: [
      hSkill,
      { id: "read", icon: "👁", need: 2, text: window.t("dc.h.gRead", "Tell your alarm from a danger") },
      { id: "settle", icon: "〰", required: true, text: window.t("dc.gSettle", "Stay until your alarm settles") },
    ],
  });
  hCoach.setFoot(window.tf("coach.h.drop", "{m} m drop", { m: DROP < 2 ? DROP.toFixed(1) : Math.round(DROP) }));
  window.__coach = hCoach;
  let hLastDist = 9;
  if (window.PhobiaFear && window.PhobiaFear.setDirect) {
    window.PhobiaFear.setDirect(() => hCoach.target(), (st) => hCoach.pulse(st, "event", hLastDist));
  }
  window.__holdPolicy = hCoach.holdPolicy;
  const hState = { lookT: 0, glassT: 0, glassLookT: 0, gustEdgeT: 0, lastLookPulse: -99, wasLooking: false,
                   legsT: 0, movedAtEdge: 0, prevX: null, prevZ: null, clock: 0, lastShakeN: 0 };
  function hSignal(id) {
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return false;
    return hCoach.signal(id, { dist: hLastDist });
  }

  return {
    controls: {
      mode: "walkable",
      // Spawn the user near the BACK CENTRE of the platform — clear of the
      // off-side roof access penthouse so the third-person camera doesn't
      // end up inside any structure. About 2 m back from the railing on
      // small balconies, 5 m back on full skyscraper rooftops.
      initialPos: [0, cameraY, Math.max(1.4, platDepth - 2.5)],
      initialYaw: 0,
      // Initial pitch: looking ahead toward the cityscape, not straight down.
      // The user has to actively peer over the edge to trigger vertigo.
      initialPitch: -0.05,
      bounds: { minX: -halfLen + 1, maxX: halfLen - 1, minZ: -0.2, maxZ: Math.max(2.0, platDepth - 1.0) },
      speed: 1.4,
      lookSpeed: 0.0035,
      // Default to third-person so the user immediately SEES their character
      // First-person by default — for acrophobia, BEING on the ledge looking
      // straight down at the drop is the whole point; watching a 3rd-person
      // doll kills it. The 3rd-person toggle is still there for anyone who
      // wants it (and any saved preference still wins).
      preferredCameraMode: "fp",
      // Over-the-shoulder framing (used only if the user toggles to 3rd person).
      tpShoulder: 0.55, tpDistance: 4.2, tpHeight: 0.5,
    },
    // (No NPC — the user's own character is the only character in the scene.)
    // Collidable objects the TP camera should not clip through (the penthouse,
    // any vents, etc. — anything the player might walk past).
    collisionObjects,
    hands: { skinColor: 0xd4a07a, sleeveColor: 0x2d3a52 },
    surface: "hard",   // concrete platform / rooftop
    groundY: platTopY, // body feet pinned to the platform surface
    // Wind exposure scales with rung height. The Body's scarf and hair-flutter
    // visibly react so the user sees a tangible "I'm somewhere with real wind"
    // signal even before they look around. Heights amplifies it dynamically
    // when the user steps close to the edge / looks down.
    windExposure: 0.20 + h * 0.50,
    interact(controls, hands) {
      if (!controls) return null;
      const lookingDown = controls.pitch < -0.3;
      const z = controls.position.z;
      const minZ = (controls.opts.bounds && controls.opts.bounds.minZ) || -0.2;
      const atEdge = z < minZ + 0.4;
      if (atEdge && lookingDown) {
        // The most informative state — at the rail, peering over. Tell the
        // user what they can DO with this view (drop a pebble) and what
        // input drives it (clicking the air below).
        return { gesture: "grab", hint: IS_COARSE_POINTER ? window.t("sc.h.hintDropT", "tap below to drop a pebble · tap the railing to shake it") : window.t("sc.h.hintDrop", "click below to drop a pebble · click the railing to shake it") };
      }
      if (atEdge) {
        return { gesture: "grab", hint: IS_COARSE_POINTER ? window.t("sc.h.hintEdgeT", "you're at the edge · tap the railing to shake · push the joystick forward to lean over") : window.t("sc.h.hintEdge", "you're at the edge · click the railing to shake · push forward to lean over") };
      }
      return { gesture: "rest", hint: "" };
    },
    onClick(controls, hands, scene) {
      // World-aware click. Three behaviours emerge from where the user is
      // pointing:
      //   1. Pointing at / near the railing → shake the railing
      //   2. Pointing down past the edge (at the ground far below) → drop a
      //      pebble at that spot. The pebble tumbles + makes a tiny click
      //      when it lands. Replaces the explicit "Drop a coin" button.
      //   3. Otherwise → micro-vibration of the rail (light grip pulse)
      // We use a raycaster from the camera through the screen centre,
      // matching where the FP crosshair would be, so the click feels
      // like it's reacting to where you LOOK rather than where you click.
      if (!controls) return;
      // Build a ray from the camera through the centre of the view (where
      // the user is looking). This makes "click below to drop a pebble"
      // intuitive — they look down + click and the pebble falls from where
      // their hand is.
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(0, 0), camera);
      // Did we hit the railing? (any segment / post)
      const railHits = ray.intersectObjects([...railSegments, ...railPosts], false);
      if (railHits.length > 0) {
        // SHAKE — the user is touching the rail; their grip rocks it.
        shakeT = 1.0;
        hCoach.note("shake"); setTimeout(() => hSignal("rattle"), 700);
        if (window.PhobiaAudio && window.PhobiaAudio.metalRattle) {
          let rd = 0;
          for (let i = 0; i < 4; i++) {
            rd += 40 + Math.random() * 50;
            setTimeout(() => window.PhobiaAudio.metalRattle(0.75,
              { x: controls.position.x, y: cameraY - 0.5, z: -0.4 }), rd);
          }
        }
        // A gripped rail transmits the wobble into the hands/head
        if (_gripSteady > 0.25 && controls.kickShake) controls.kickShake(0.02);
        if (window.PhobiaFX && window.PhobiaFX.contextPrompt) {
          window.PhobiaFX.contextPrompt(window.t("sc.h.rail", "The railing is solid. It moves a little — it's strong."), 3500);
        }
        return;
      }
      // Did we look toward the ground (negative pitch)? Then drop a pebble
      // from the user's hand into the world. The pebble lands far below
      // and the user hears a tiny ping when it does.
      if (controls.pitch < -0.20 && controls.position.z < 1.0) {
        dropCoin(controls);
        setTimeout(() => hSignal("coin"), Math.min(3500, 900 + Math.sqrt(2 * DROP / 9.8) * 1000));
        return;
      }
      // Otherwise: a small grip-pulse on the rail (subtle, single-segment
      // wobble) so the click still does something visible.
      shakeT = Math.max(shakeT, 0.4);
    },
    update(t, controls, dt) {
      // Capture for command-bar handlers
      if (controls) storedActiveControls = controls;

      // Auto "Look down" animation — smoothly drive pitch to the target,
      // hold for a moment, then return. Implemented as a 0..1 timer.
      // The user's own look input outranks the scripted tilt — dragging
      // cancels the auto-look instead of fighting it frame by frame.
      if (autoLookT > 0 && controls && controls.dragging) autoLookT = 0;
      if (autoLookT > 0 && controls) {
        autoLookT -= (dt || 0.016) * 0.25;       // ~4-second total run
        const k = 1 - autoLookT;                 // 0..1
        // Ease in to look down (first 40 %), hold (40-70 %), ease back out (70-100 %)
        let pitch;
        if (k < 0.4)        pitch = autoLookFrom + (autoLookTarget - autoLookFrom) * (k / 0.4);
        else if (k < 0.7)   pitch = autoLookTarget;
        else                pitch = autoLookTarget + (autoLookFrom - autoLookTarget) * ((k - 0.7) / 0.3);
        controls.pitch = pitch;
      }

      // Auto "Walk to edge / back" animation — interpolate position.z from
      // the captured start to the target over ~2.5 seconds, easing in/out.
      // Feeding moving=true into FPControls drives the body's leg cycle so
      // the user visibly walks (in third-person) instead of sliding.
      // Manual movement input cancels the auto-walk immediately — otherwise
      // the animation keeps overwriting position.z and the player feels
      // dragged along rails they can't get off.
      if (walkAnimT > 0 && controls && controls.hasMoveInput && controls.hasMoveInput()) walkAnimT = 0;
      if (walkAnimT > 0 && controls) {
        walkAnimT -= (dt || 0.016) * 0.40;       // ~2.5-second total
        const k = Math.max(0, Math.min(1, 1 - walkAnimT));
        // Smoothstep ease: k*k*(3-2k)
        const ease = k * k * (3 - 2 * k);
        controls.position.z = walkAnimFrom + (walkAnimTo - walkAnimFrom) * ease;
        // Drive the walk cycle so the legs actually move
        if (k < 1) {
          controls._walkAmt = Math.min(1, (controls._walkAmt || 0) + 0.10);
          controls._walkPhase = (controls._walkPhase || 0) + (dt || 0.016) * Math.PI * 4;
        }
      }

      // "Lean over" animation — over ~3 s the camera pitches steeply down
      // and the position glides ~0.6 m forward past the bound, mimicking the
      // body weight pitching over the railing. Then it eases back. The vertigo
      // intensity (computed below) will spike during this animation, ramping
      // the heartbeat / wind howl, since pitch and edge proximity both peak.
      if (leanT > 0 && controls) {
        // Retreat is sacred: pulling back (S/↓/stick-down) mid-lean skips
        // straight to the lean-back phase instead of pinning the player over
        // the railing for the full three seconds.
        if (controls.isMovingBackward && controls.isMovingBackward() && (1 - leanT) < 0.65) {
          const kNow = Math.max(0, 1 - leanT);
          // Mirror progress into the return phase so pitch/position continue
          // from where they are (no snap to full lean before coming back).
          const u = kNow < 0.35 ? kNow / 0.35 : 1;        // how far out we got
          leanT = 1 - (0.65 + 0.35 * (1 - u));
        }
        leanT -= (dt || 0.016) * 0.33;            // ~3 s total
        const k = Math.max(0, Math.min(1, 1 - leanT));
        let p, z;
        if (k < 0.35) {
          // Lean OUT: pitch drops fast, body slides forward past the edge
          const u = k / 0.35;
          p = leanFromPitch + (-1.30 - leanFromPitch) * u;
          z = leanFromZ + (-0.50 - leanFromZ) * u;
        } else if (k < 0.65) {
          // Hold: peeked over, can see straight down
          p = -1.30; z = -0.50;
        } else {
          // Lean BACK: pitch and position return
          const u = (k - 0.65) / 0.35;
          p = -1.30 + (leanFromPitch - (-1.30)) * u;
          z = -0.50 + (leanFromZ - (-0.50)) * u;
        }
        controls.pitch = p;
        // Bypass the bounds z-clamp so the slide forward can actually land past
        // minZ (FPControls honours controls._leanBypass). The rail is noCollide
        // so its static collider no longer halts the approach either.
        controls._leanBypass = true;
        controls.position.z = z;
      } else if (controls && controls._leanBypass) {
        controls._leanBypass = false;   // lean finished — resume normal bounds
      }

      // Lean-forward: when looking very steeply down, the camera nudges
      // slightly toward the railing — the body language of peering over.
      // A transient CAMERA offset, not a write into controls.position: the
      // old version integrated a per-frame drift into the player position
      // (frame-rate dependent, and aimed the wrong way — it crept the player
      // backwards, away from the rail, the longer they dared to look down).
      if (controls) {
        const leaning = Math.max(0, -controls.pitch - 0.7) * 0.6;  // 0..~0.5
        camera.position.z -= leaning * 0.16;   // toward the drop (railing is at -z)
      }

      // ---- Glass skywalk underfoot ----
      // Crossing from concrete onto the pane has to register in the body:
      // footfalls brighten to glass taps, fear ticks up (fed into the
      // proximity input below), and the first step over the void lands a
      // small jolt plus a faint underfoot click.
      if (hasGlass && controls) {
        const onGlass = controls.position.z < (-0.5 + glassDepth);
        controls.opts.surface = onGlass ? "glass" : "hard";
        if (onGlass && !_wasOnGlass) {
          if (controls.kickShake) controls.kickShake(0.02);
          if (window.PhobiaAudio && window.PhobiaAudio.indicatorClick) {
            try { window.PhobiaAudio.indicatorClick({ x: controls.position.x, y: platTopY, z: controls.position.z }); } catch {}
          }
        }
        _wasOnGlass = onGlass;
      }

      // ---- Wind sway: chaotic gusts, not a clean sine ----
      // Real edge-of-a-tall-building sway is unpredictable — a low constant
      // jitter with sudden gusts that shove you, then ease off. A predictable
      // sine lets the body "learn" the rhythm and the dread fades; layered
      // incommensurate noise + Poisson-timed gusts keep it unsettling. Scaled
      // by the reduce-motion accessibility setting (cached on the controller).
      const mScale = controls && controls._reduceMotion ? 0.3 : 1;
      const swayBoost = (h > 0.85 ? 2.2 : 1.0) * mScale;
      _gustT += dt || 0.016;
      if (_gustT > _nextGust) {
        _gustT = 0;
        _nextGust = (1.4 + Math.random() * 3.4) / (0.5 + h);   // gusts come faster up high
        _gustDur  = 0.5 + Math.random() * 1.3;
        _gustPeak = 0.45 + Math.random() * 0.9;
        _gustDir  = Math.random() < 0.5 ? -1 : 1;
        // A strong gust near the edge is a spike the alarm learns to shrug off.
        if (_gustPeak > 0.85 && hLastDist < hZone + 0.8) {
          hCoach.pulse(0.18 + 0.12 * (_gustPeak - 0.85), "gust", hLastDist);
          hSignal(rung >= 3 && Math.random() < 0.5 ? "sway" : "gust");
          if (rung === 3 && hCoach.engaged) hState.gustEdgeT = 4;   // hold the edge for 4 s after it
        }
        // A hard gust up high lands a sharp involuntary head-jolt on top of
        // the smooth shove — the flinch a real edge gust forces out of you.
        if (_gustPeak > 0.9 && h > 0.5 && controls && controls.kickShake
            && !controls._reduceMotion) {
          controls.kickShake(0.02 + _gustPeak * 0.025);
        }
      }
      const gust = _gustT < _gustDur ? Math.sin((_gustT / _gustDur) * Math.PI) * _gustPeak : 0;
      // Incommensurate sines → no perceptible period (cheap value-noise).
      const nX = Math.sin(t * 1.7) + 0.6 * Math.sin(t * 3.31 + 1.3) + 0.4 * Math.sin(t * 5.13 + 2.7);
      const nY = Math.sin(t * 1.27 + 2.1) + 0.5 * Math.sin(t * 2.91 + 0.7);
      // Two hands on the rail steady the body — the sway can't shove a braced
      // stance as far as a free-standing one.
      const amp = (0.35 + h) * swayBoost * (1 - 0.45 * _gripSteady);
      camera.position.x += nX * 0.018 * amp + _gustDir * gust * 0.05 * amp;
      camera.position.y += nY * 0.014 * amp;
      camera.rotation.z += (nX * 0.0035 + _gustDir * gust * 0.012) * h * mScale;
      camera.rotation.x += nY * 0.0016 * gust * h * mScale;   // a gust nudges your gaze
      // Store gust for the wind-particle drift below.
      active._windGust = gust; active._windDir = _gustDir;

      // ---- Wind particles drift ---- motes stream past in the gust direction,
      // faster/denser up high and during gusts.
      if (windParticles) {
        const pos = windParticles.geometry.attributes.position;
        const vel = windParticles.userData.vel;
        const baseWind = 0.5 + h * 1.5;
        const gNow = gust;
        const dirN = _gustDir;
        const dtN = dt || 0.016;
        for (let i = 0; i < windParticles.userData.count; i++) {
          pos.array[i * 3]     += dirN * (baseWind + gNow * 6) * vel[i] * dtN;
          pos.array[i * 3 + 1] += Math.sin(t * 2 + i) * 0.008;
          const rx = pos.array[i * 3] - camera.position.x;
          if (rx > 12)       pos.array[i * 3] = camera.position.x - 12;
          else if (rx < -12) pos.array[i * 3] = camera.position.x + 12;
          const ry = pos.array[i * 3 + 1] - cameraY;
          if (ry > 7)       pos.array[i * 3 + 1] = cameraY - 6;
          else if (ry < -7) pos.array[i * 3 + 1] = cameraY + 6;
        }
        pos.needsUpdate = true;
        windParticles.material.opacity = 0.22 + Math.min(0.45, h * 0.3 + gNow * 0.3);
      }

      // ---- Glass skywalk underfoot ----
      // Stepping from concrete onto the pane over the void must FEEL like a
      // material change: footsteps go bright and glassy, fear ticks up (fed
      // into the proximity input below), and the first-ever crossing lands a
      // small flinch + a faint creak from the panel.
      if (hasGlass && controls) {
        const onGlass = controls.position.z < (-0.5 + glassDepth);
        if (onGlass !== _onGlass) {
          _onGlass = onGlass;
          controls.opts.surface = onGlass ? "glass" : "hard";
          if (onGlass && !_glassCrossed) {
            _glassCrossed = true;
            hCoach.pulse(0.22, "glass", hLastDist);
            if (controls.kickShake) controls.kickShake(0.02);
            if (window.PhobiaAudio && window.PhobiaAudio.indicatorClick) {
              try { window.PhobiaAudio.indicatorClick({ x: controls.position.x, y: platTopY, z: controls.position.z }); } catch {}
            }
          }
        }
      }

      // ---- Edge-proximity vertigo intensity ----
      // Combines two factors: (a) how close the user is to the railing, and
      // (b) how steeply they're peering down. Both rise from 0 to 1 as the
      // user approaches the cliff edge / tips their head down. We use this
      // single number to drive the heartbeat audio, the wind howl, the
      // scarf flutter, and a subtle stomach-drop FOV punch.
      let vertigo = 0;
      if (controls) {
        // edgeProx: 1 at the railing (low z), 0 at the back of the platform.
        // (This was previously inverted — vertigo/fear/wind peaked at the BACK
        // and fell to nothing at the edge. Now they correctly intensify as the
        // user approaches the drop.)
        const edgeProx = Math.max(0, Math.min(1, 1 - (controls.position.z + 0.2) / 1.6));
        const lookProx = Math.max(0, Math.min(1, (-controls.pitch - 0.10) / 1.2));
        vertigo = (edgeProx * 0.5 + lookProx * 0.7) * (0.4 + h);
        vertigo = Math.max(0, Math.min(1, vertigo));
        // Smooth like a body, not a meter: real vertigo washes in over a
        // beat and drains slower than it builds. Raw value could step from
        // 0 to 1 in one frame (walk into railing while snapping gaze down),
        // which popped the FOV, howl cadence and scarf all at once.
        const vk = vertigo > _vertigoSm ? 3.5 : 1.6;
        _vertigoSm += (vertigo - _vertigoSm) * Math.min(1, (dt || 0.016) * vk);
        vertigo = _vertigoSm;
        // Feed the unified Fear state. Proximity drives the bulk; gaze (pitch
        // looking down) adds the second axis; duration is built up by Fear
        // itself when the player stays in-zone. The Fear value then drives
        // ALL effects — visual, audio, narration — through a single channel.
        // The alarm is the coach's (see hCoach): distance to the rail, how
        // steeply you look down, and the glass underfoot. The old weighted
        // model's "duration" input made the fear climb the longer you stayed.
        {
          const dtN = dt || 0.016;
          hState.clock += dtN;
          // Standing on glass counts as standing right at the edge.
          const edgeDist = Math.max(0, controls.position.z + 0.4);
          hLastDist = _wasOnGlass ? Math.min(edgeDist, 0.15) : edgeDist;
          const lookK = lookProx;
          hCoach.update(dtN, {
            dist: hLastDist, gaze: Math.min(1, lookK * 1.2), dogToward: 0,
            px: controls.position.x, pz: controls.position.z, dogX: controls.position.x, dogZ: -0.45,
            onScreen: true, dogGazing: false, trust: null,
            anchorX: (active && active.renderer ? active.renderer.domElement.clientWidth / 2 : null), anchorY: 0,
            stageW: (active && active.renderer ? active.renderer.domElement.clientWidth : 0), stageH: 0,
          });
          const eng = hCoach.engaged;
          // Looking straight down is its own habituating spike.
          const lookingHard = controls.pitch < -0.85;
          if (lookingHard && !hState.wasLooking && eng && hState.clock - hState.lastLookPulse > 6) {
            hState.lastLookPulse = hState.clock;
            hCoach.pulse(0.16, "look", hLastDist);
            if (Math.random() < 0.6) hSignal(Math.random() < 0.5 ? "pull" : "swim");
          }
          hState.wasLooking = lookingHard;
          if (vertigo > 0.62 && eng && Math.random() < dtN * 0.12 && hSignal("swim")) hCoach.note("swim");
          // Body alarms, once the alarm is actually up.
          if (eng && hCoach.alarm > 34) {
            hState.legsT += dtN;
            if (hState.legsT > 4 && Math.random() < dtN * 0.15 && hSignal("legs")) hState.legsT = -20;
          }
          // Movement while near the edge (for "I'll freeze").
          if (hState.prevX != null && eng) hState.movedAtEdge += Math.hypot(controls.position.x - hState.prevX, controls.position.z - hState.prevZ);
          hState.prevX = controls.position.x; hState.prevZ = controls.position.z;
          if (hState.movedAtEdge > 0.4 && !hState._movedNoted) { hState._movedNoted = true; }
          // Rung goals.
          if (rung === 0 && eng) hCoach.goalDone("near");
          if (rung === 1) { hState.lookT = (lookingHard && eng) ? hState.lookT + dtN : Math.max(0, hState.lookT - dtN); if (hState.lookT > 5) hCoach.goalDone("lookDown"); }
          if (rung === 2) { hState.glassT = _wasOnGlass ? hState.glassT + dtN : hState.glassT; if (hState.glassT > 5) hCoach.goalDone("glass"); }
          if (rung === 3 && hState.gustEdgeT > 0) { if (eng) { hState.gustEdgeT -= dtN; if (hState.gustEdgeT <= 0) hCoach.goalDone("gustHeld"); } else hState.gustEdgeT = 0; }
          if (rung === 4) { hState.glassLookT = (_wasOnGlass && controls.pitch < -0.7) ? hState.glassLookT + dtN : hState.glassLookT; if (hState.glassLookT > 8) hCoach.goalDone("glassLook"); }
          // Diegetic completion beat: the wind drops.
          if (window.__rungHoldComplete && !hState.beat) {
            hState.beat = true;
            if (hCoach.everSettled) hCoach.goalDone("settle");
            _nextGust = 999;
          }
        }
      }

      // ---- Character-driven events ----
      // Detect what the PLAYER is doing — at the edge, looking down hard,
      // walking forward INTO the railing — and fire voice cues / animations
      // automatically. No button pressed; the scene reacts to behaviour.
      if (controls) {
        const z = controls.position.z;
        const dtN = dt || 0.016;
        const minZ = (controls.opts.bounds && controls.opts.bounds.minZ) || -0.2;
        const atEdge = z < minZ + 0.4;        // within 0.4 m of the railing
        const goingIn = controls.isMovingForward
          ? controls.isMovingForward()
          : (controls.keys && (controls.keys.KeyW || controls.keys.ArrowUp));
        const lookingDownHard = controls.pitch < -0.85;

        // 1. First arrival at the edge
        if (atEdge && !playerState.arrivedAtEdge) {
          playerState.arrivedAtEdge = true;
          // (the coach card speaks for this moment now)
        }

        // 2. Track time spent at the edge — a deep settling cue after 6s
        if (atEdge) {
          playerState.timeAtEdge += dtN;
          if (playerState.timeAtEdge > 6 && !playerState.cuedAtEdge) {
            playerState.cuedAtEdge = true;
          // (the coach card speaks for this moment now)
          }
        }

        // 3. Looking sharply down for 1.5+ s → softening cue
        if (lookingDownHard) {
          playerState._timeLookingDown = (playerState._timeLookingDown || 0) + dtN;
          if (playerState._timeLookingDown > 1.5 && !playerState.cuedDeepLook) {
            playerState.cuedDeepLook = true;
          // (the coach card speaks for this moment now)
          }
        } else {
          playerState._timeLookingDown = 0;
        }

        // 4. Walking INTO the railing for 0.8+ s → auto-trigger lean. The
        // player physically presses W into the bound, the body weight pitches
        // forward over the rail. This is the most visceral exposure cue —
        // their own forward momentum becomes the thing that puts them past
        // the edge.
        if (atEdge && goingIn && z <= minZ + 0.05) {
          playerState.pressingAgainstRail += dtN;
          if (playerState.pressingAgainstRail > 0.8 && !playerState.autoLeanFired
              && leanT === 0) {
            playerState.autoLeanFired = true;
            leanT = 1.0;
            leanFromPitch = controls.pitch;
            leanFromZ = controls.position.z;
            hCoach.note("lean"); hSignal("pull");
          // (the coach card speaks for this moment now)
            if (window.PhobiaVoice) {
              window.PhobiaVoice.speak(window.t("sc.h.lean2", "Leaning over. Hold the rail. You are safe."));
            }
          // (the coach card speaks for this moment now)
            // Reset so the player can lean again later (after walking back)
            setTimeout(() => { playerState.autoLeanFired = false; }, 8000);
          }
        } else {
          playerState.pressingAgainstRail = 0;
        }

        // 5. Walked back from the edge → reset prompt
        if (!atEdge && playerState.timeAtEdge > 2 && !playerState.cuedSteppedBack) {
          playerState.cuedSteppedBack = true;
          // (the coach card speaks for this moment now)
          // Reset edge timers so a future re-approach feels fresh
          setTimeout(() => {
            playerState.timeAtEdge = 0;
            playerState.cuedAtEdge = false;
            playerState.cuedSteppedBack = false;
            playerState.cuedDeepLook = false;
          }, 4000);
        }
      }

      // Heartbeat audio now comes from the global body-feel rig (mount()),
      // fed by the same vertigo → fear inputs below.

      // Wind howl gusts: occasional bursts on top of the continuous wind, with
      // frequency scaling on vertigo. At full vertigo we get a howl every
      // ~3 s; at rest none at all. Real cliff wind isn't constant — it comes
      // and goes — so this is the cue that turns "wind ambience" into "wind".
      if (window.PhobiaAudio && window.PhobiaAudio.windHowl
          && t - lastHowlAt > (10.0 + Math.random() * 12.0) / Math.max(0.05, vertigo + 0.1 * h)) {
        try { window.PhobiaAudio.windHowl(0.35 + h * 0.5 + vertigo * 0.3); } catch {}
        lastHowlAt = t;
      }

      // ---- Vertigo FOV ----
      // The view widens CONTINUOUSLY as you near the edge AND look down — the
      // periphery stretches and the ground seems to pull away, a real
      // peripheral-vision vertigo cue rather than a one-shot punch. A brief
      // extra punch still fires the instant you tip past a hard look-down, for
      // the stomach-drop. Smoothed so it breathes with you instead of snapping.
      if (controls) {
        const baseFov = 62 + h * 8;
        const isDown = controls.pitch < -0.85;
        if (isDown && !active._lastWasLookingDown) active._fovPunchT = 0.5;
        active._lastWasLookingDown = isDown;
        let punch = 0;
        if (active._fovPunchT > 0) {
          const k = active._fovPunchT / 0.5;
          punch = Math.sin(k * Math.PI) * 5;
          active._fovPunchT -= dt || 0.016;
        }
        const fovTarget = baseFov + vertigo * 9 + punch;
        active._fovSm = (active._fovSm == null)
          ? baseFov
          : active._fovSm + (fovTarget - active._fovSm) * Math.min(1, (dt || 0.016) * 5);
        camera.fov = active._fovSm;
        camera.updateProjectionMatrix();
      }

      // Sync the body's wind exposure with the vertigo intensity so the scarf
      // flaps harder + hair flutters more when the user is at the edge.
      if (active.body && active.body.setWindExposure) {
        const exp = (0.20 + h * 0.50) + vertigo * 0.55;
        active.body.setWindExposure(exp);
      }

      // ---- Body posture from player state ----
      // The character physically reacts to where they are:
      //   - At the edge: both hands reach forward to grip the railing
      //   - Looking down hard: full forward lean over the rail
      //   - Walking in strong wind (high rung): slight arm spread for balance
      // The smoother in Body.update lerps between targets so the motion
      // is fluid, not snappy.
      if (active.body && active.body.setPosture && controls) {
        const z = controls.position.z;
        const minZ = (controls.opts.bounds && controls.opts.bounds.minZ) || -0.2;
        // Edge proximity 0..1 (0 = back of platform, 1 = touching railing)
        const edgeProx = Math.max(0, Math.min(1, 1 - (z - minZ) / 1.5));
        // Look-down proximity (0 = horizon, 1 = looking straight down)
        const lookDown = Math.max(0, Math.min(1, (-controls.pitch - 0.10) / 1.3));
        // Reach for the railing once you're within ~1.5 m of it
        const reach = edgeProx > 0.4 ? Math.min(1, (edgeProx - 0.4) * 2.5) : 0;
        // Lean forward steeply when peering over the edge or auto-lean fired
        const lean = (leanT > 0)
          ? Math.min(1, 1 - leanT)
          : (edgeProx * 0.5 + lookDown * 0.7) * 0.85;
        // Arm spread for high-wind balance (only at scary heights, h > 0.6)
        const armSpread = h > 0.6 ? Math.min(0.4, vertigo * 0.5) : 0;
        active.body.setPosture({
          reach,
          reachHeight: 0.9,        // chest-height grip (railing is at chest)
          lean: Math.max(0, Math.min(1, lean)),
          armSpread,
          crouch: 0,
        });
        // FP hands physically wrap the REAL top rail when you're at it and
        // facing the drop — knuckles on the metal instead of a canned grab
        // pose floating in the air. The rail top sits at cameraY-0.5, z=-0.4.
        if (active.hands && active.hands.setReachTarget) {
          if (coinDropAnim) {
            // Hand is busy with the coin-drop beat (target set below) — the
            // grip must not overwrite it, and a rail off both hands doesn't
            // steady anything.
            _gripSteady = 0;
          } else if (reach > 0.25 && Math.cos(controls.yaw) > 0.2 && z > -0.55) {
            let gripY = cameraY - 0.5;
            if (shakeT > 0) {
              // Knuckles ride the wobbling segment while the metal visibly
              // moves — pinning them to the static rail height broke the grip.
              let best = null, bestD = Infinity;
              for (const seg of railSegments) {
                const d = Math.abs(seg.userData.baseX - controls.position.x);
                if (d < bestD) { bestD = d; best = seg; }
              }
              if (best) gripY = best.position.y;
            }
            _railGrip.set(controls.position.x, gripY, -0.4);
            active.hands.setReachTarget(_railGrip, {
              hand: "both", grip: "wrap", normal: _UP, spread: 0.24, maxReach: 0.74,
            });
            _gripSteady = reach;
          } else {
            active.hands.clearReachTarget();
            _gripSteady = 0;
          }
        }
      }

      // Frame-rate normaliser: all the per-frame ambient motion below was
      // tuned at 60 fps. Multiplying by fpsAdj (=1.0 at 60 Hz, 0.5 at 120 Hz)
      // makes drift/spin speeds identical on every display instead of running
      // ~2× too fast on high-refresh phones.
      const fpsAdj = (dt || 0.016) * 60;
      skyMat.uniforms.uTime.value = t;
      // Birds drift across the sky in formation. Each flock has its own
      // direction and speed; when they leave the visible range they
      // re-enter from the opposite side at a fresh height.
      for (const flock of birds) {
        flock.position.x += flock.userData.driftSpeed * flock.userData.dir * 0.04 * fpsAdj;
        // Subtle flock bob — leader sets the height, followers inherit
        flock.position.y += Math.sin(t * 0.7 + flock.position.x * 0.005) * 0.01 * fpsAdj;
        if (flock.userData.dir > 0 && flock.position.x > 300) {
          flock.position.x = -300;
          flock.position.y = cameraY - 5 + Math.random() * 50;
        }
        if (flock.userData.dir < 0 && flock.position.x < -300) {
          flock.position.x = 300;
          flock.position.y = cameraY - 5 + Math.random() * 50;
        }
      }
      // Beacon flicker on the antenna mast — rapid red blink at 1.4 Hz
      for (const obj of rooftopProps) {
        if (obj && obj.beacon) {
          obj.beacon.material.opacity = 0.4 + (Math.sin(t * Math.PI * 2.8) > 0.5 ? 0.6 : 0);
          obj.beacon.material.transparent = true;
        }
      }
      // Goal zone — gentle pulse when user is far, fades when they reach it.
      // Tells the user WHERE to walk to start earning hold credit.
      if (goalZone && controls) {
        const distZ = controls.position.z - 0.30;          // distance to goal stripe
        const reached = distZ < 0.6 && distZ > -0.6;
        const targetOp = reached ? 0.0 : (0.30 + Math.sin(t * 2.4) * 0.10);
        goalZone.material.opacity += (targetOp - goalZone.material.opacity) * 0.06;
      }
      // Cars drive past — tiny pinpricks at our height
      for (const car of cars) {
        car.position.x += car.userData.heading * car.userData.speed * 0.06 * fpsAdj;
        if (car.userData.heading > 0 && car.position.x > 400) car.position.x = -400;
        if (car.userData.heading < 0 && car.position.x < -400) car.position.x =  400;
      }
      // People drift slowly, meandering a little each frame rather than
      // marching in a dead-straight line forever — reads as a living street.
      for (const p of people) {
        p.userData.dir += (Math.random() - 0.5) * 0.06 * fpsAdj;
        p.position.x += Math.cos(p.userData.dir) * p.userData.speed * 0.06 * fpsAdj;
        p.position.z += Math.sin(p.userData.dir) * p.userData.speed * 0.06 * fpsAdj;
        if (Math.abs(p.position.x) > 300 || Math.abs(p.position.z) > 300) {
          p.userData.dir += Math.PI;
        }
      }
      // Helicopter — drifts across the sky, rotors spin, slight body bob
      if (helicopter) {
        helicopter.position.x += helicopter.userData.heading * helicopter.userData.driftSpeed * 0.045 * fpsAdj;
        helicopter.userData.bobPhase += 0.01 * fpsAdj;
        helicopter.position.y += Math.sin(helicopter.userData.bobPhase * 1.3) * 0.05 * 0.8;
        // Slight yaw wobble — like a real chopper subtly correcting course
        helicopter.rotation.y = (helicopter.userData.heading > 0 ? 0 : Math.PI)
          + Math.sin(helicopter.userData.bobPhase * 0.7) * 0.05;
        // Rotor spin
        if (helicopter.userData.mainRotor) {
          helicopter.userData.mainRotor.rotation.y += 0.55 * fpsAdj;
        }
        if (helicopter.userData.tailRotor) {
          helicopter.userData.tailRotor.rotation.x += 1.2 * fpsAdj;
        }
        // Nav-light blink ~2 Hz alternating red/green
        const blink = Math.sin(t * Math.PI * 2.4) > 0.4;
        if (helicopter.userData.navRed) {
          helicopter.userData.navRed.material.opacity = blink ? 1.0 : 0.25;
          helicopter.userData.navRed.material.transparent = true;
        }
        if (helicopter.userData.navGreen) {
          helicopter.userData.navGreen.material.opacity = blink ? 0.25 : 1.0;
          helicopter.userData.navGreen.material.transparent = true;
        }
        // Wrap when it leaves the visible range — re-enter from the opposite
        // side at a slightly different height for variety.
        if (helicopter.userData.heading > 0 && helicopter.position.x > 400) {
          helicopter.position.x = -400;
          helicopter.position.y = cameraY - 8 + Math.random() * 30;
          helicopter.position.z = -180 - Math.random() * 120;
        }
        if (helicopter.userData.heading < 0 && helicopter.position.x < -400) {
          helicopter.position.x = 400;
          helicopter.position.y = cameraY - 8 + Math.random() * 30;
          helicopter.position.z = -180 - Math.random() * 120;
        }
      }
      // Neighbour figures on adjacent rooftops — small idle sways, the
      // occasional "look around" head turn. Distance is too far for fine
      // detail, so we just shift the body subtly.
      for (const fig of neighbours) {
        const ph = fig.userData.basePhase + t;
        if (fig.userData.kind === "stretch") {
          // Stretch upward periodically (every ~12s)
          const k = (Math.sin(t * 0.15 + fig.userData.basePhase) + 1) * 0.5;
          fig.scale.y = 1.0 + k * 0.06;
        } else if (fig.userData.kind === "lean") {
          // Lean sway — tilts side to side as if leaning on a railing
          fig.rotation.z = Math.sin(ph * 0.3) * 0.03;
        } else if (fig.userData.kind === "sweep") {
          // Walking sweep — the figure paces a few metres back and forth
          fig.position.x += Math.sin(ph * 0.5) * 0.012;
        } else {
          // "look" — slow yaw rotation as if scanning the horizon
          fig.rotation.y = Math.sin(ph * 0.18) * 0.4;
        }
      }
      if (wind) {
        const pos = wind.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          pos.array[i * 3] += (0.6 + h * 0.6) * fpsAdj;
          pos.array[i * 3 + 1] -= 0.3 * fpsAdj;
          // Scatter the wrap so motes don't re-enter as a synchronized line
          if (pos.array[i * 3] > 60) {
            pos.array[i * 3] = -60 - Math.random() * 12;
            pos.array[i * 3 + 1] = cameraY - 28 + Math.random() * 56;
          }
          if (pos.array[i * 3 + 1] < cameraY - 30) pos.array[i * 3 + 1] = cameraY + 30;
        }
        pos.needsUpdate = true;
      }
      // Wind-blown papers — drift right with the prevailing wind, slowly
      // tumble end-over-end, gentle vertical bob. Wrap around when off-screen.
      const dtP = dt || 0.016;
      for (const paper of papers) {
        const ud = paper.userData;
        ud.bobPhase += dtP * 1.2;
        paper.position.x += ud.driftX * dtP * (1 + h * 0.5);
        paper.position.y += ud.driftY * dtP + Math.sin(ud.bobPhase) * 0.04 * dtP * 8;
        paper.rotation.x += ud.spinX * dtP;
        paper.rotation.y += ud.spinY * dtP;
        paper.rotation.z += ud.spinZ * dtP;
        // Wrap horizontally when blown off-screen
        if (paper.position.x > 60) {
          paper.position.x = -60;
          paper.position.y = cameraY - 6 + Math.random() * 14;
          paper.position.z = -2 - Math.random() * 30;
        }
        // Settle vertically in a band around camera height
        if (paper.position.y < cameraY - 12) ud.driftY = Math.abs(ud.driftY);
        if (paper.position.y > cameraY + 12) ud.driftY = -Math.abs(ud.driftY);
      }
      if (debris && debrisData) {
        const pos = debris.geometry.attributes.position;
        for (let i = 0; i < debrisData.length; i++) {
          pos.array[i * 3 + 1] += debrisData[i].vy * 0.06 * fpsAdj;
          if (pos.array[i * 3 + 1] < -10) {
            pos.array[i * 3]     = (Math.random() - 0.5) * 12;
            pos.array[i * 3 + 1] = cameraY + 10 + Math.random() * 30;
            pos.array[i * 3 + 2] = -2 - Math.random() * 12;
            debrisData[i].vy = -2 - Math.random() * 4;
          }
        }
        pos.needsUpdate = true;
      }
      // Coin-drop hand beat: the right hand holds the release point for
      // ~0.35 s, then the coin is spawned AT the hand and falls from it.
      if (coinDropAnim && controls) {
        coinDropAnim.t += dt || 0.016;
        if (active.hands && active.hands.setReachTarget) {
          active.hands.setReachTarget(coinDropAnim.pos, {
            hand: "right", grip: "wrap", curl: 0.5, maxReach: 0.7,
          });
        }
        if (coinDropAnim.t >= 0.35) {
          spawnCoin(coinDropAnim.pos.x, coinDropAnim.pos.y, coinDropAnim.pos.z);
          if (active.hands && active.hands.clearReachTarget) active.hands.clearReachTarget();
          coinDropAnim = null;
        }
      }
      // Falling coins — gravity + spin until they hit the ground (groundY)
      const dtCoin = dt || 0.016;
      for (let i = coins.length - 1; i >= 0; i--) {
        const coin = coins[i];
        if (coin.userData.landed) continue;
        coin.userData.vy -= 9.8 * dtCoin;       // gravity
        coin.position.x += coin.userData.vx * dtCoin;
        coin.position.y += coin.userData.vy * dtCoin;
        coin.position.z += coin.userData.vz * dtCoin;
        coin.rotation.x += coin.userData.spinX * dtCoin;
        coin.rotation.z += coin.userData.spinZ * dtCoin;
        if (coin.position.y <= groundY + 0.05) {
          coin.position.y = groundY + 0.05;
          coin.userData.landed = true;
          coin.userData.vy = 0;
          // Tiny ping on landing — delayed by the real speed of sound over
          // the drop height, spatialised at the landing spot so distance
          // attenuation makes a rooftop drop faint and a balcony drop crisp.
          // Beyond ~60 m the ping wouldn't reach the ear at all: skip it.
          if (window.PhobiaAudio && window.PhobiaAudio.indicatorClick && cameraY <= 60) {
            const delayMs = Math.max(80, (cameraY / 343) * 1000);
            const landPos = { x: coin.position.x, y: groundY, z: coin.position.z };
            setTimeout(() => window.PhobiaAudio.indicatorClick(landPos), delayMs);
          }
          // Remove old coins after a few seconds to avoid clutter
          setTimeout(() => {
            const idx = coins.indexOf(coin);
            if (idx >= 0) coins.splice(idx, 1);
            scene.remove(coin);
            coin.geometry.dispose();
            coin.material.dispose();
          }, 3000);
        }
      }
      // Fence-shake animation — segments near the user wobble for 1 s after click
      if (shakeT > 0) {
        const dt2 = dt || 0.016;
        shakeT = Math.max(0, shakeT - dt2 * 1.6);
        const userX = controls ? controls.position.x : 0;
        for (const seg of railSegments) {
          const distFromUser = Math.abs(seg.userData.baseX - userX);
          // Closer segments shake harder
          const localAmt = Math.max(0, 1 - distFromUser / 4) * shakeT;
          const phase = t * 22 + seg.userData.baseX;
          seg.position.y = seg.userData.baseY + Math.sin(phase) * 0.025 * localAmt;
          seg.position.z = seg.userData.baseZ + Math.cos(phase * 0.7) * 0.012 * localAmt;
          seg.rotation.x = Math.sin(phase * 1.1) * 0.035 * localAmt;
        }
        for (const post of railPosts) {
          const distFromUser = Math.abs(post.userData.baseX - userX);
          const localAmt = Math.max(0, 1 - distFromUser / 4) * shakeT;
          post.position.x = post.userData.baseX + Math.sin(t * 24) * 0.015 * localAmt;
        }
      } else {
        // Settle back to base if not shaking
        for (const seg of railSegments) {
          seg.position.y += (seg.userData.baseY - seg.position.y) * 0.2;
          seg.position.z += (seg.userData.baseZ - seg.position.z) * 0.2;
          seg.rotation.x += (0 - seg.rotation.x) * 0.2;
        }
        for (const post of railPosts) {
          post.position.x += (post.userData.baseX - post.position.x) * 0.2;
        }
      }
    },
    dispose() {
      // (Heartbeat teardown now lives in the global body-feel rig.)
      try {
        const ev = hCoach.evidence();
        ev.notes.moved = +hState.movedAtEdge.toFixed(1);
        window.__lastTrialEvidence = Object.assign(ev, { phobia: "heights", level: levelIdx, ts: Date.now() });
      } catch {}
      try { hCoach.dispose(); } catch {}
      try { if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(null); } catch {}
      try { if (window.__holdPolicy === hCoach.holdPolicy) window.__holdPolicy = null; } catch {}
      try { if (window.__coach === hCoach) window.__coach = null; } catch {}
      try { const bar = document.querySelector('.scene-cmd-bar[data-scene="heights"]'); if (bar) bar.dataset.wired = ""; } catch {}
    },
  };
}

export { setupHeights };
