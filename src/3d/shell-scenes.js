// ShellScenes — the 3D vignettes behind the menus (landing, camp, realm
// heroes, the traveler's room).

import * as THREE from "three";
import { compileAhead, DOG_MODELS, DOG_COAT_MAPS, loadDogCoatTextures, CREATURE_MODELS, buildCreature } from "./assets.js";
import { disposeObject, resolveQuality, syncFxLite, getRoomEnvMap, IS_MOBILE } from "./renderer.js";
import { makeSoftSunbeam } from "./human-rig.js";
import { BODY_TYPES_3D } from "./human-base.js";
import { makeConcreteMaps, makeEarthMaps, makeGrassMaps, makePlankMaps, makePlasterMaps, makeRugMaps } from "./textures.js";
import { applySidePhotoUVs } from "./creature-kit.js";
import { buildDog } from "./dog-model.js";
import { buildAvatarFigure } from "./avatar.js";

// ---------- Shell 3D vignettes (camp + realm heroes) ----------
// Small always-running Three dioramas for the GAME SHELL (valley map camp,
// realm hero banners) — separate from the exposure engine but reusing its
// procedural PBR texture bakery (makeEarthMaps / makeGrassMaps / …) and the
// avatar/creature builders, so the shell reads as the SAME world as the
// scenes: textured ground, real shadows, props, drifting fireflies. Each
// mount returns a ctx (truthy) on success or null on failure so the classic
// script keeps the 2D fallback when WebGL is unavailable. Every ctx
// self-disposes when its container leaves the DOM, and unmountAll() runs on
// every route render. DPR is capped; reduced-motion renders one still frame.
const ShellScenes = (() => {
  const registry = new Set();
  // DEBUG hook (same spirit as window.__avatarFigure): lets tooling drive
  // ctx.onTick + render manually when the tab is background-throttled and
  // rAF never fires. Inert in normal use.
  window.__shellCtxs = registry;
  let landingCtl = null;
  const reduceMotion = () =>
    document.documentElement.classList.contains("reduce-motion")
    || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function makeCtx(container, opts = {}) {
    // These are backdrops (the title room, the camp, a realm's hero), so on a
    // weak device they get the low tier's budget: no MSAA, DPR 1, no shadow
    // maps, 30 fps. The tier is read fresh — sceneQuality() only refreshes
    // when a trial mounts, so a changed Graphics setting used to miss them.
    const tier = resolveQuality();
    const lowTier = tier === "low";
    syncFxLite(tier);
    let renderer;
    try {
      // MSAA on desktops above low only: on a phone's medium tier it was 4×
      // colour + depth at DPR 1.5 for a backdrop behind the menus.
      renderer = new THREE.WebGLRenderer({ antialias: !lowTier && !(tier === "medium" && IS_MOBILE), alpha: true, powerPreference: lowTier ? "low-power" : "default" });
      renderer.debug.checkShaderErrors = /[?&]debug=1/.test(location.search);   // compile-log readback is slow
    } catch { return null; }
    const w = container.clientWidth || 320, h = container.clientHeight || 220;
    renderer.setPixelRatio(lowTier ? 1 : Math.min(window.devicePixelRatio || 1, tier === "medium" ? 1.5 : 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = opts.exposure || 1.0;
    // Real shadows are what ground the figure/creature in these vignettes —
    // the scenes are tiny (a handful of meshes), so soft maps are cheap.
    // Nothing in them moves faster than an idle sway, so the maps refresh
    // every other drawn frame (see tick) rather than on every render.
    renderer.shadowMap.enabled = !lowTier;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    if (opts.fog) scene.fog = new THREE.FogExp2(opts.fog, opts.fogDensity || 0.09);
    const camera = new THREE.PerspectiveCamera(opts.fov || 34, w / h, 0.05, 80);
    // `retired`: objects swapped out of the scene (a re-dressed figure), freed
    // after the next draw — see tick.
    const ctx = { container, renderer, scene, camera, raf: 0, disposed: false, onTick: null, elapsed: 0, retired: [] };
    const ro = ("ResizeObserver" in window) ? new ResizeObserver(() => {
      const nw = container.clientWidth, nh = container.clientHeight;
      if (nw && nh && !ctx.disposed) {
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      }
    }) : null;
    if (ro) ro.observe(container);
    ctx.ro = ro;
    // Nothing to draw while the vignette is scrolled away (the camp sits
    // above a long map) or the tab is hidden.
    ctx.visible = true;
    const io = ("IntersectionObserver" in window) ? new IntersectionObserver((es) => {
      ctx.visible = es.some((e) => e.isIntersecting);
    }) : null;
    if (io) io.observe(container);
    ctx.io = io;
    // Backdrops, not play: 30 fps below the high tier, and never past 60 —
    // a 120 Hz phone otherwise drew the title room 120 times a second.
    const minGap = tier === "high" ? 1000 / 61 : 1000 / 31;
    let last = performance.now();
    let frame = 0;
    function tick() {
      if (ctx.disposed) return;
      if (!container.isConnected) { disposeCtx(ctx); return; }
      ctx.raf = requestAnimationFrame(tick);
      const now = performance.now();
      if (!ctx.visible || document.hidden || now - last < minGap) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      ctx.elapsed += dt;
      if (ctx.onTick) { try { ctx.onTick(dt, ctx.elapsed); } catch {} }
      if ((++frame & 1) === 0) renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
      // Disposed only once the replacement has drawn: its materials then hold
      // the shader programs the old ones used. Disposing first let three free
      // them (a program goes with its last material) and compile them all
      // again — a hitch on every tap in the traveler creator.
      if (ctx.retired.length) for (const o of ctx.retired.splice(0)) { try { disposeObject(o); } catch {} }
    }
    // Programs are linked before the first frame (compileAsync, as in a
    // trial's mount): the first render used to compile them synchronously —
    // inside boot for the title room, the page frozen ~4 s under software GL
    // before anything could be tapped. The canvas stays clear meanwhile.
    ctx.start = () => {
      const go = () => {
        if (ctx.disposed) return;
        if (reduceMotion()) {
          // One still frame — the vignette becomes a picture, not a motion source.
          if (ctx.onTick) { try { ctx.onTick(1 / 60, 0.5); } catch {} }
          renderer.shadowMap.needsUpdate = true;
          renderer.render(scene, camera);
          return;
        }
        last = performance.now();
        tick();
      };
      // Low tier: the trial's two-accent-light budget (capAccents) for the
      // backdrops too. The title camp carried nine point lights — fire, moon
      // glow, six realm markers, the figure's fill — and forward shading paid
      // for all nine on every lit pixel. The two strongest stay (in practice
      // the fire and the figure's fill); the rest go dark, their warmth folded
      // into the ambient a little.
      if (lowTier) {
        try {
          const pts = [];
          let amb = null;
          scene.traverse((o) => {
            if (o.isPointLight && o.visible && o.intensity > 0) pts.push(o);
            else if ((o.isAmbientLight || o.isHemisphereLight) && !amb) amb = o;
          });
          pts.sort((a, b) => b.intensity - a.intensity);
          let folded = 0;
          for (let i = 2; i < pts.length; i++) { pts[i].visible = false; folded += pts[i].intensity; }
          if (amb && folded) amb.intensity += Math.min(0.25, folded * 0.05);
        } catch {}
      }
      let ready = null;
      try { ready = compileAhead(renderer, scene, camera); } catch {}
      if (ready) ready.then(go, go); else go();
    };
    registry.add(ctx);
    return ctx;
  }

  function disposeCtx(ctx) {
    if (!ctx || ctx.disposed) return;
    ctx.disposed = true;
    cancelAnimationFrame(ctx.raf);
    if (ctx.ro) { try { ctx.ro.disconnect(); } catch {} }
    if (ctx.io) { try { ctx.io.disconnect(); } catch {} }
    if (ctx.cleanupExtra) { try { ctx.cleanupExtra(); } catch {} }
    for (const o of ctx.retired.splice(0)) { try { disposeObject(o); } catch {} }
    try { disposeObject(ctx.scene); } catch {}
    // Release the GL context now, not at the next GC: going map → realm →
    // map makes a fresh context each time, and browsers cap live contexts.
    try { ctx.renderer.forceContextLoss(); } catch {}
    try { ctx.renderer.dispose(); } catch {}
    const el = ctx.renderer.domElement;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    registry.delete(ctx);
  }

  // Drag-to-spin + slow auto turntable — the "you can touch this" affordance
  // that makes a vignette read as 3D rather than a looping video.
  function addDragSpin(ctx, target, speed = 0.25) {
    let dragging = false, lastX = 0, pid = null;
    const el = ctx.renderer.domElement;
    el.style.cursor = "grab";
    el.style.touchAction = "pan-y";
    const onDown = (e) => { dragging = true; lastX = e.clientX; pid = e.pointerId; el.style.cursor = "grabbing"; try { el.setPointerCapture(pid); } catch {} };
    const onMove = (e) => { if (!dragging) return; target.rotation.y += (e.clientX - lastX) * 0.012; lastX = e.clientX; };
    const onUp = () => { if (!dragging) return; dragging = false; el.style.cursor = "grab"; try { el.releasePointerCapture(pid); } catch {} };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    ctx.cleanupExtra = () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
    return () => dragging;   // isDragging query for the tick
  }

  // Textured ground patch (uses the scene bakery so the shell matches the
  // scenes' material language). kind: "earth" | "grass" | "planks" | "concrete"
  function groundPatch(scene, kind, radius = 2.6, repeat = 3) {
    let maps;
    try {
      maps = kind === "grass" ? makeGrassMaps()
           : kind === "planks" ? makePlankMaps()
           : kind === "concrete" ? makeConcreteMaps()
           : makeEarthMaps();
    } catch { maps = null; }
    const mat = maps ? new THREE.MeshStandardMaterial({
      map: maps.albedo, normalMap: maps.normal, roughnessMap: maps.roughness,
      color: 0xffffff, envMapIntensity: 0.4,
    }) : new THREE.MeshStandardMaterial({ color: 0x1c2438, roughness: 1 });
    if (maps) {
      [maps.albedo, maps.normal, maps.roughness].forEach(t => { if (t) { t.repeat.set(repeat, repeat); } });
      if (mat.normalMap) mat.normalScale.set(0.9, 0.9);
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), mat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    return ground;
  }

  // Small green tufts — cheap cones that sway; sells "living ground".
  function grassTufts(scene, count, rMin, rMax, hue = 0x4a6626) {
    const tufts = [];
    const m1 = new THREE.MeshStandardMaterial({ color: hue, roughness: 1 });
    const m2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(hue).multiplyScalar(1.25), roughness: 1 });
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const t = new THREE.Group();
      const blades = 2 + Math.floor(Math.random() * 2);
      for (let b = 0; b < blades; b++) {
        const hgt = 0.08 + Math.random() * 0.1;
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.012, hgt, 4), Math.random() < 0.5 ? m1 : m2);
        blade.position.set((Math.random() - 0.5) * 0.06, hgt / 2, (Math.random() - 0.5) * 0.06);
        blade.rotation.z = (Math.random() - 0.5) * 0.5;
        blade.castShadow = true;
        t.add(blade);
      }
      t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      t.userData.phase = Math.random() * Math.PI * 2;
      scene.add(t);
      tufts.push(t);
    }
    return {
      update(t) {
        for (const g of tufts) g.rotation.z = Math.sin(t * 1.6 + g.userData.phase) * 0.06;
      },
    };
  }

  function pineTree(h = 2.2) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(h * 0.028, h * 0.045, h * 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.96 })
    );
    trunk.position.y = h * 0.21;
    trunk.castShadow = true;
    g.add(trunk);
    const dark = new THREE.MeshStandardMaterial({ color: 0x163024, roughness: 0.92 });
    const lit = new THREE.MeshStandardMaterial({ color: 0x1f4630, roughness: 0.88 });
    for (let i = 0; i < 3; i++) {
      const hh = h * (0.58 - i * 0.13);
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(h * (0.30 - i * 0.055), hh, 7),
        i === 2 ? lit : dark
      );
      cone.position.y = h * 0.40 + i * h * 0.20;
      cone.castShadow = true;
      g.add(cone);
    }
    return g;
  }

  // Fireflies: a handful of warm motes drifting slow figure-eights.
  function fireflies(scene, count = 12, radius = 2.2) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seeds = [];
    for (let i = 0; i < count; i++) {
      seeds.push({ a: Math.random() * Math.PI * 2, r: radius * (0.5 + Math.random() * 0.5), y: 0.3 + Math.random() * 0.9, s: 0.3 + Math.random() * 0.5, p: Math.random() * Math.PI * 2 });
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xd8e878, size: 0.035, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    scene.add(pts);
    return {
      update(t) {
        const p = geo.attributes.position;
        for (let i = 0; i < count; i++) {
          const s = seeds[i];
          const a = s.a + t * 0.12 * s.s;
          p.setXYZ(i,
            Math.cos(a) * s.r + Math.sin(t * 0.7 + s.p) * 0.2,
            s.y + Math.sin(t * 0.9 + s.p) * 0.12,
            Math.sin(a) * s.r + Math.cos(t * 0.6 + s.p) * 0.2);
        }
        p.needsUpdate = true;
        pts.material.opacity = 0.6 + Math.sin(t * 2.1) * 0.25;
      },
    };
  }

  // Shared flame builder: three additive cones + flicker + a point light.
  function buildFire(parent, opts = {}) {
    const s = opts.scale || 1;
    const fire = new THREE.Group();
    const mk = (r, hgt, color, op) => {
      const m = new THREE.Mesh(
        new THREE.ConeGeometry(r * s, hgt * s, 10, 1, true),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      m.position.y = (hgt * s) / 2;
      fire.add(m);
      return m;
    };
    const outer = mk(0.16, 0.52, 0xff6b2d, 0.55);
    const mid   = mk(0.11, 0.42, 0xff9a3d, 0.75);
    const inner = mk(0.06, 0.30, 0xffd86b, 0.95);
    // Logs
    const logM = new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * s, 0.045 * s, 0.5 * s, 8), logM);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 3) * Math.PI;
      log.position.y = 0.045 * s;
      log.castShadow = true;
      fire.add(log);
    }
    const light = new THREE.PointLight(0xff9a4d, 1.8, 9 * s, 1.8);
    light.position.y = 0.35 * s;
    fire.add(light);
    // Embers — a Points cloud rising in a slim column and wrapping.
    const N = 42;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.24 * s;
      pos[i * 3 + 1] = Math.random() * 1.1 * s;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.24 * s;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const embers = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0xffc06b, size: 0.028 * s, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    fire.add(embers);
    parent.add(fire);
    if (opts.position) fire.position.copy(opts.position);
    return {
      group: fire,
      update(dt, t) {
        const n1 = Math.sin(t * 9.1) * 0.5 + Math.sin(t * 23.7) * 0.3 + Math.sin(t * 41.3) * 0.2;
        inner.scale.set(1 + n1 * 0.10, 1 + n1 * 0.22, 1 + n1 * 0.10);
        mid.scale.set(1 + n1 * 0.08, 1 + n1 * 0.16, 1 + n1 * 0.08);
        outer.scale.set(1 + n1 * 0.05, 1 + n1 * 0.10, 1 + n1 * 0.05);
        inner.rotation.y += dt * 1.7; mid.rotation.y -= dt * 1.2; outer.rotation.y += dt * 0.8;
        light.intensity = 1.8 + n1 * 0.55;
        const p = geo.attributes.position;
        for (let i = 0; i < N; i++) {
          let y = p.getY(i) + dt * (0.35 + seed[i] * 0.5) * s;
          if (y > 1.15 * s) y = 0.05;
          p.setY(i, y);
          p.setX(i, p.getX(i) + Math.sin(t * 2 + seed[i] * 20) * dt * 0.03);
        }
        p.needsUpdate = true;
      },
    };
  }

  // ---- The camp: a real campsite — your 3D traveler by a living fire ----
  function mountCamp(container, charHexes, companions = []) {
    const ctx = makeCtx(container, { fov: 30, fog: 0x0c1224, fogDensity: 0.04 });
    if (!ctx) return null;
    const { scene, camera } = ctx;
    // Night lighting: a cool moon key that CASTS SHADOWS (what grounds the
    // whole diorama) + faint ambient; the fire light warms the near side.
    const moon = new THREE.DirectionalLight(0xa8bce0, 0.5);
    moon.position.set(-3, 6, -2);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -4; moon.shadow.camera.right = 4;
    moon.shadow.camera.top = 4;   moon.shadow.camera.bottom = -4;
    moon.shadow.camera.near = 1;  moon.shadow.camera.far = 14;
    moon.shadow.bias = -0.0004;
    scene.add(moon);
    scene.add(new THREE.AmbientLight(0x2a3450, 0.7));
    const env = (typeof getRoomEnvMap === "function") ? getRoomEnvMap(ctx.renderer) : null;
    if (env) scene.environment = env;
    // Ground: packed earth around the fire, fading into the CSS valley.
    groundPatch(scene, "earth", 6, 7);
    // Grass ring + a few low stones around the fire ring
    const tufts = grassTufts(scene, 26, 1.4, 4.6);
    const stoneM = new THREE.MeshStandardMaterial({ color: 0x2a3148, roughness: 0.95 });
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + Math.random() * 0.03, 0), stoneM);
      st.position.set(Math.cos(a) * 0.42, 0.045, Math.sin(a) * 0.42);
      st.rotation.set(Math.random(), Math.random(), Math.random());
      st.castShadow = true;
      scene.add(st);
    }
    // A-frame tent at the edge of the firelight — "someone lives here".
    const tent = new THREE.Group();
    const tentM = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.9, side: THREE.DoubleSide });
    const tentDarkM = new THREE.MeshStandardMaterial({ color: 0x4c3a26, roughness: 0.95, side: THREE.DoubleSide });
    const panelL = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15), tentM);
    panelL.position.set(0, 0.5, -0.42); panelL.rotation.x = -0.63;
    const panelR = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15), tentM);
    panelR.position.set(0, 0.5, 0.42); panelR.rotation.x = 0.63;
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.62, 3), tentDarkM);
    back.rotation.y = Math.PI / 2; back.rotation.z = Math.PI / 6;
    back.position.set(-0.74, 0.35, 0);
    [panelL, panelR, back].forEach(p => { p.castShadow = true; tent.add(p); });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6),
      new THREE.MeshStandardMaterial({ color: 0x3a2c1c, roughness: 0.9 }));
    pole.position.set(0.72, 0.5, 0); pole.rotation.z = 0.06;
    tent.add(pole);
    tent.position.set(-1.9, 0, -1.5);
    tent.rotation.y = 0.7;
    scene.add(tent);
    // A log seat by the fire
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.9, 10),
      new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.95 }));
    seat.rotation.z = Math.PI / 2; seat.rotation.y = -0.4;
    seat.position.set(0.95, 0.09, 0.75);
    seat.castShadow = true; seat.receiveShadow = true;
    scene.add(seat);
    // Distant tree line — layered pines ringing the clearing.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.15 + (Math.random() - 0.5) * 0.3;
      const r = 4.6 + Math.random() * 1.0;
      const tree = pineTree(1.7 + Math.random() * 1.2);
      tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      tree.rotation.y = Math.random() * Math.PI;
      scene.add(tree);
    }
    const fire = buildFire(scene, { scale: 1 });
    const flies = fireflies(scene, 12, 2.6);
    // The traveler — the same procedural figure used in-scene, idling by the fire.
    let figure = null;
    if (charHexes) {
      try {
        figure = buildAvatarFigure(charHexes, "idle");
        figure.position.set(-0.85, 0, 0.25);
        figure.rotation.y = 0.9;   // half-turned toward the fire, half toward you
        // The rig flags its own casters (body, skull, hair, neck, palms) —
        // the same set a trial uses. Flagging every mesh added ~40 shadow
        // draws a frame for eyes, lashes, ear pieces and finger capsules.
        scene.add(figure);
      } catch { figure = null; }
    }
    // Companions: the dogs you've befriended, resting by the fire. Head low
    // and easy, now and then lifting to look about — never towards you fast.
    const pals = [];
    const PAL_SPOTS = {
      shiba: { pos: [0.74, 0, 0.3], face: [-0.4, 1.6], size: 0.6 },
      husky: { pos: [0.5, 0, -0.95], face: [-0.6, 2.2], size: 0.86 },
    };
    (companions || []).forEach((breed, i) => {
      const spot = PAL_SPOTS[breed];
      if (!spot || !DOG_MODELS[breed]) return;
      try {
        const dog = buildCreature(DOG_MODELS[breed], { targetSize: spot.size, axis: "max" });
        dog.position.set(spot.pos[0], spot.pos[1], spot.pos[2]);
        dog.rotation.y = Math.atan2(spot.face[0] - spot.pos[0], spot.face[1] - spot.pos[2]);
        scene.add(dog);
        const pal = { dog, next: 5 + i * 3.5 + Math.random() * 3, low: true };
        dog.userData.onReady = () => {
          try { applyVignetteCoat(dog, breed); } catch {}
          dog.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
          const parts = dog.userData.parts;
          if (parts && parts.play) parts.play("Idle_2_HeadLow", 0.2);
          if (parts && parts.mixer) parts.mixer.update(0.05 + i * 0.7);
          try { ctx.renderer.render(scene, camera); } catch {}
        };
        pals.push(pal);
      } catch {}
    });
    camera.position.set(0.15, 1.15, 3.5);
    camera.lookAt(-0.15, 0.75, 0);
    const campAudio = [];
    const startCampAudio = () => {
      if (campAudio.length) return;
      try {
        if (window.PhobiaAudio && window.PhobiaAudio.unlock) window.PhobiaAudio.unlock();
        if (window.PhobiaAudio && window.PhobiaAudio.startFireCrackle) {
          campAudio.push(window.PhobiaAudio.startFireCrackle({ gain: 0.042, pos: { x: 0, y: 0.3, z: 0 } }));
        }
        if (window.PhobiaAudio && window.PhobiaAudio.startAmbienceBed) {
          campAudio.push(window.PhobiaAudio.startAmbienceBed("wind", { gain: 0.018 }));
        }
      } catch {}
    };
    startCampAudio();
    container.addEventListener("pointerdown", startCampAudio, { once: true });
    ctx.cleanupExtra = () => {
      campAudio.forEach((h) => { try { h && h.stop && h.stop(); } catch {} });
    };
    ctx.onTick = (dt, t) => {
      fire.update(dt, t);
      flies.update(t);
      tufts.update(t);
      if (figure && figure.userData && figure.userData.animate) figure.userData.animate(t);
      for (const pal of pals) {
        const parts = pal.dog.userData.parts;
        if (!parts || !parts.mixer) continue;
        parts.mixer.update(dt);
        if (t > pal.next) {
          pal.low = !pal.low;
          parts.play(pal.low ? "Idle_2_HeadLow" : "^Idle$", 0.8);
          pal.next = t + (pal.low ? 9 + Math.random() * 8 : 3 + Math.random() * 3);
        }
      }
      camera.position.x = 0.15 + Math.sin(t * 0.14) * 0.12;
      camera.position.y = 1.15 + Math.sin(t * 0.1) * 0.03;
      camera.lookAt(-0.15, 0.75, 0);
    };
    ctx.start();
    return ctx;
  }

  // ---- The room itself, as the app's first frame ----
  // The old opening was six screens of prose over a decorative backdrop, and
  // the player did not stand anywhere until several taps later. On a phone
  // that is a long way to scroll before anything is a game. This builds the
  // actual Meadow Yard — the room trial 1 happens in — so the first thing on
  // screen is the space, and everything after it happens *inside* that space
  // rather than in a menu stacked on top of it.
  //
  // It is a lighter build than setupDogs (no dog, no physics, no fear engine,
  // no collision) because it is scenery here, not a trial. It deliberately
  // reuses the same procedural texture makers, so the room you meet on the
  // title screen is recognisably the room you walk into.
  function mountRoom(container, charHexes, opts = {}) {
    const ctx = makeCtx(container, { fov: opts.fov || 46, exposure: 1.28 });
    if (!ctx) return null;
    const { scene, camera } = ctx;
    scene.background = new THREE.Color(0x141118);

    // Daylight through the window, low and warm.
    const key = new THREE.DirectionalLight(0xffe9c8, 3.0);
    key.position.set(-4.4, 3.0, -8.0);
    key.target.position.set(0.5, -1, -1);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5; key.shadow.camera.right = 5;
    key.shadow.camera.top = 5;   key.shadow.camera.bottom = -5;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 22;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    scene.add(key, key.target);
    // Portrait pulls the hemisphere fill down hard. Its GROUND colour lights
    // downward-facing normals, which on a standing figure means the underside
    // of the jaw, the shirt hem and — most visibly — the little end cap that
    // closes the trunk between the thighs: lit warm from below it reads as a
    // pale wedge of skin showing through the trousers. The three explicit
    // lights below already model the room for the creator, so the hemisphere
    // only needs to keep the shadows from going black.
    scene.add(opts.portrait
      ? new THREE.HemisphereLight(0xdfe9f6, 0x4a4038, 0.30)
      : new THREE.HemisphereLight(0xeaf2fb, 0xb9a184, 0.72));
    const env = (typeof getRoomEnvMap === "function") ? getRoomEnvMap(ctx.renderer) : null;
    if (env) scene.environment = env;

    // Same footprint as the real room so the proportions match what the
    // player walks into a moment later.
    const R = { x0: -3.3, x1: 3.3, z0: -5.6, z1: 5.2, ceilY: 1.75 };
    const W = R.x1 - R.x0, D = R.z1 - R.z0, wallH = R.ceilY + 1;

    const plank = makePlankMaps();
    const rep = [W / 1.40, D / 1.37];
    plank.albedo.repeat.set(...rep);
    if (plank.normal) plank.normal.repeat.set(...rep);
    if (plank.roughness) plank.roughness.repeat.set(...rep);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 0.2, D + 0.2),
      new THREE.MeshStandardMaterial({
        map: plank.albedo, normalMap: plank.normal, roughnessMap: plank.roughness,
        color: 0xffffff, envMapIntensity: 0.6,
      })
    );
    if (floor.material.normalMap) floor.material.normalScale.set(0.8, 0.8);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1;
    floor.receiveShadow = true;
    scene.add(floor);

    const plaster = makePlasterMaps();
    plaster.albedo.repeat.set(4.2, 1.25);
    if (plaster.normal) plaster.normal.repeat.set(4.2, 1.25);
    const wallMat = new THREE.MeshStandardMaterial({
      map: plaster.albedo, normalMap: plaster.normal,
      color: 0xffffff, roughness: 0.92, envMapIntensity: 0.35,
    });
    const WIN = { cx: -1.55, cy: 0.65, halfW: 1.0 };
    const addWall = (geo, x, y, z, cast) => {
      const m = new THREE.Mesh(geo, wallMat);
      m.position.set(x, y, z);
      m.castShadow = !!cast; m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    // Window wall, segmented around the opening so daylight enters through it.
    const openL = WIN.cx - WIN.halfW, openR = WIN.cx + WIN.halfW;
    addWall(new THREE.BoxGeometry(openL - R.x0, wallH, 0.12), (R.x0 + openL) / 2, -1 + wallH / 2, R.z0, true);
    addWall(new THREE.BoxGeometry(R.x1 - openR, wallH, 0.12), (openR + R.x1) / 2, -1 + wallH / 2, R.z0, true);
    addWall(new THREE.BoxGeometry(WIN.halfW * 2, 0.90, 0.12), WIN.cx, -0.55, R.z0, true);
    addWall(new THREE.BoxGeometry(WIN.halfW * 2, 0.35, 0.12), WIN.cx, 1.575, R.z0, true);
    addWall(new THREE.BoxGeometry(0.12, wallH, D + 0.2), R.x0, -1 + wallH / 2, (R.z0 + R.z1) / 2, true);
    addWall(new THREE.BoxGeometry(0.12, wallH, D + 0.2), R.x1, -1 + wallH / 2, (R.z0 + R.z1) / 2, false);
    const ceilMat = wallMat.clone(); ceilMat.color.setHex(0xd9d2c6);
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.10, D + 0.2), ceilMat);
    ceil.position.set(0, R.ceilY, (R.z0 + R.z1) / 2);
    ceil.castShadow = true; ceil.receiveShadow = true;
    scene.add(ceil);
    // Skirting — cheap, and its absence is one of the loudest "untextured box"
    // cues there is.
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xcfc0a8, roughness: 0.8 });
    const skirt = (w, d, x, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), baseMat);
      b.position.set(x, -0.955, z);
      scene.add(b);
    };
    skirt(W, 0.02, 0, R.z0 + 0.08);
    skirt(0.02, D, R.x0 + 0.08, (R.z0 + R.z1) / 2);
    skirt(0.02, D, R.x1 - 0.08, (R.z0 + R.z1) / 2);

    // Glass + frame + the beam it throws.
    const glass = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 1.5),
      // Bright, but not a lightbox: at emissiveIntensity 0.85 ACES clipped the
      // pane to flat white and the window stopped reading as glass.
      new THREE.MeshStandardMaterial({ color: 0xc4dcf5, roughness: 0.06, metalness: 0,
        emissive: 0x9dc4ea, emissiveIntensity: 0.42, transparent: true, opacity: 0.95 })
    );
    glass.position.set(WIN.cx, WIN.cy, R.z0 + 0.05);
    scene.add(glass);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.65 });
    for (const [w, h, x, y] of [
      [2.2, 0.09, WIN.cx, WIN.cy + 0.75], [2.2, 0.09, WIN.cx, WIN.cy - 0.75],
      [0.09, 1.5, WIN.cx - 1.0, WIN.cy],  [0.09, 1.5, WIN.cx + 1.0, WIN.cy],
      [0.06, 1.5, WIN.cx, WIN.cy],        [2.0, 0.06, WIN.cx, WIN.cy],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
      b.position.set(x, y, R.z0 + 0.09);
      b.castShadow = true;
      scene.add(b);
    }
    const beamDir = new THREE.Vector3(0.5, -1, -1).sub(new THREE.Vector3(-4.4, 3.0, -8.0)).normalize();
    const beamOrigin = new THREE.Vector3(WIN.cx, WIN.cy, R.z0 + 0.15);
    const beamLen = (beamOrigin.y + 1) / Math.max(0.05, -beamDir.y);
    // The dog room's soft beam, not a flat additive cone: that one drew its
    // outline as two hard diagonal lines across the arrival room.
    const beam = makeSoftSunbeam(beamOrigin, beamDir, beamLen, { opacity: 0.05, wallZ: R.z0 });
    scene.add(beam);

    // Enough dressing that it reads as somewhere someone lives.
    const rugMaps = makeRugMaps();
    const rug = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, 3.2),
      new THREE.MeshStandardMaterial({ map: rugMaps.albedo, normalMap: rugMaps.normal,
        color: 0xffffff, roughness: 0.95 })
    );
    rug.rotation.x = -Math.PI / 2;
    rug.material.color.setHSL(0.94, 0.22, 0.5);
    rug.position.set(0, -0.99, -2.0);
    rug.receiveShadow = true;
    scene.add(rug);
    const bed = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.15, 10, 24),
      new THREE.MeshStandardMaterial({ color: 0x5d6f8a, roughness: 0.95 })
    );
    bed.rotation.x = -Math.PI / 2; bed.scale.set(1, 1, 0.72);
    bed.position.set(2.45, -0.915, -2.5);
    bed.castShadow = true;
    scene.add(bed);
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.06, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x8a6442, roughness: 0.7 })
    );
    table.position.set(-2.6, -0.20, -2.5);
    table.castShadow = true; table.receiveShadow = true;
    scene.add(table);
    for (const lx of [-0.38, 0.38]) for (const lz of [-0.28, 0.28]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 8), table.material);
      leg.position.set(-2.6 + lx, -0.59, -2.5 + lz);
      leg.castShadow = true;
      scene.add(leg);
    }

    // The traveler, standing in the room. This is the SAME builder the trial
    // uses, so the figure being dressed here is literally the figure that
    // walks in — the creator is a preview of nothing, it is the thing itself.
    // Portrait fill. The room's only key is the window BEHIND the traveler, so
    // a figure standing in the middle of it is lit entirely from the back and
    // renders as a silhouette — you cannot pick a skin tone off a shape you
    // cannot see. This is the soft frontal bounce a real room gets off its
    // opposite wall, aimed at where the figure stands, and only added for the
    // creator: the wide shot wants the backlight it already has.
    if (opts.portrait) {
      const fill = new THREE.DirectionalLight(0xfff2e2, 1.55);
      fill.position.set(1.1, 1.4, 3.6);
      fill.target.position.set(0, -0.35, 0.35);
      scene.add(fill, fill.target);
      // A touch of cool from the other side keeps the shadow edge from going
      // dead flat, the way a window's own skylight would wrap round.
      const wrap = new THREE.DirectionalLight(0xcfe0f5, 0.45);
      wrap.position.set(-2.2, 0.9, 1.8);
      wrap.target.position.set(0, -0.35, 0.35);
      scene.add(wrap, wrap.target);
      // Rim from behind. At the size a phone renders a whole standing figure
      // — a couple of hundred pixels tall — nobody is reading the face; what
      // separates a person from the wall behind them is a lit edge along the
      // shoulders and hair. It is the cheapest naturalism there is, and its
      // absence is why the traveler was reading as a flat cutout pasted on
      // the plaster.
      const rim = new THREE.DirectionalLight(0xfff4e4, 1.1);
      rim.position.set(-1.4, 2.2, -2.6);
      rim.target.position.set(0, -0.2, 0.35);
      scene.add(rim, rim.target);
    }

    let figure = null;
    const placeFigure = (hexes) => {
      if (figure) { scene.remove(figure); ctx.retired.push(figure); figure = null; }
      if (!hexes) return;
      try {
        // ?gait=walk previews the traveler walking instead of standing — the
        // creator is the only place the full figure is on screen at a size
        // where a gait is legible, so it doubles as the check for it.
        const gait = (new URLSearchParams(location.search).get("gait") === "walk") ? "walk" : "idle";
        figure = buildAvatarFigure(hexes, gait);
        figure.position.set(0, -1, 0.35);
        // The rig is built facing +Z and the camera sits at +Z, so facing the
        // player is rotation 0 — a PI turn here showed the traveler's back.
        figure.rotation.y = 0;
        // (Shadow casters: the rig's own set — see the camp.)
        scene.add(figure);
      } catch { figure = null; }
    };
    placeFigure(charHexes);

    // Camera. `portrait` frames the traveler head-to-toe for the creator;
    // otherwise it sits at standing eye height looking into the room.
    const portrait = !!opts.portrait;
    // Framing for a TALL screen, which is a different problem from framing for
    // a wide one. A phone viewport is about 0.46 aspect, so a 52° vertical FOV
    // is only ~25° horizontally — pointing that down the 10.8 m length of the
    // room yields a telephoto slice of far wall and reads as a flat backdrop.
    //
    // The fix is proximity, not a wider lens: stand a few metres off the
    // window wall so the floor and ceiling run out to the top and bottom edges
    // of the frame. That is what being inside a room actually looks like, and
    // it fills a portrait frame without the fisheye a 100° FOV would need.
    // Portrait framing has to solve for the sheet: it covers the bottom ~54%,
    // so the traveler must sit head-to-foot inside the top ~45% of the canvas,
    // not centred in it. That means backing off far enough for the whole
    // figure to subtend ~40% of the frame (≈4.5 m at 50°) and aiming well
    // BELOW them, since the frame's centre lands where the camera looks and
    // the figure has to end up above that centre. The lower half of the shot
    // is floor nobody sees — the sheet is sitting on it.
    const camBase = portrait
      ? { x: 0, y: 0.05, z: 4.9, lx: 0, ly: -1.15, lz: 0.35 }
      : { x: 1.5, y: 0.22, z: 1.0, lx: -1.2, ly: -0.34, lz: -5.5 };
    camera.position.set(camBase.x, camBase.y, camBase.z);
    camera.lookAt(camBase.lx, camBase.ly, camBase.lz);

    // One drag axis: turn the traveler (portrait) or pan the room (wide). A
    // single axis is deliberate — two-axis orbit on a phone means every
    // vertical scroll fights the camera.
    let spin = 0, dragging = false, lastX = 0, vel = 0;
    const onDown = (e) => { dragging = true; lastX = e.clientX; vel = 0; };
    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX; lastX = e.clientX;
      vel = dx * 0.006;
      spin += vel;
    };
    const onUp = () => { dragging = false; };
    container.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    ctx.cleanupExtra = () => {
      container.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };

    ctx.onTick = (dt, t) => {
      beam.userData.uTime.value = t;
      if (!dragging) {
        vel *= 0.92;
        spin += vel;
        if (portrait) spin += dt * 0.10;     // a slow turntable when untouched
      }
      if (figure) {
        figure.rotation.y = spin;
        if (figure.userData.animate) figure.userData.animate(t);
      }
      if (!portrait) {
        camera.position.x = camBase.x + Math.sin(t * 0.11) * 0.28 + spin * 0.9;
        camera.position.y = camBase.y + Math.sin(t * 0.08) * 0.05;
        camera.lookAt(camBase.lx, camBase.ly, camBase.lz);
      }
    };
    ctx.start();
    ctx.setCharacter = placeFigure;
    return ctx;
  }

  // ---- Realm heroes: the fear itself, alive on its page ----
  function mountRealm(container, key) {
    const builders = { dogs: realmDog, spiders: realmSpider, snakes: realmSnake, heights: realmHeights, dark: realmDark, enclosed: realmEnclosed };
    const build = builders[key];
    if (!build) return null;
    const ctx = makeCtx(container, { fov: 32 });
    if (!ctx) return null;
    try { build(ctx); } catch { disposeCtx(ctx); return null; }
    ctx.start();
    return ctx;
  }

  // Shared stage for the creature turntables: key light with real shadows,
  // textured ground so the creature stands SOMEWHERE, not on a void disc.
  function creatureStage(ctx, opts = {}) {
    const { scene, camera } = ctx;
    const key = new THREE.DirectionalLight(opts.tint || 0xfff0d8, 1.4);
    key.position.set(2.5, 3.5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -2.2; key.shadow.camera.right = 2.2;
    key.shadow.camera.top = 2.6;   key.shadow.camera.bottom = -1;
    key.shadow.camera.near = 0.5;  key.shadow.camera.far = 12;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.5);
    fill.position.set(-2.5, 1.5, 2);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xfff5e0, 0.55);
    rim.position.set(0, 2.5, -3);
    scene.add(rim);
    scene.add(new THREE.AmbientLight(0x39415c, 0.75));
    const env = (typeof getRoomEnvMap === "function") ? getRoomEnvMap(ctx.renderer) : null;
    if (env) scene.environment = env;
    groundPatch(scene, opts.ground || "earth", 1.6, 2);
    camera.position.set(0, 0.85, 3.1);
    camera.lookAt(0, 0.5, 0);
  }

  // The realm hero loads the raw GLTF through buildCreature, so it never went
  // through buildDog — which is where the photo-projected coat is applied. The
  // result was a flat brown shiba on the ladder page above a photo-coated one
  // in the scene: the storefront and the game looked like different products.
  // Same side projection, same maps, minus the scene-only fur/tint layers.
  function applyVignetteCoat(root, breed) {
    const urls = DOG_COAT_MAPS[breed];
    if (!urls || !urls.photo) return;
    // The projection box must be in the MODEL's own space — the same space the
    // scene dog measures in (geometryBox on the fresh, unparented clone).
    // geometryBox(root) here came back in world space: scaled to the
    // turntable's targetSize and rotated by wherever the spin happened to be,
    // so the photo landed half off the dog — the grey "sweater" round the
    // banner dog's middle and the white socks.
    const model = (root.userData.parts && root.userData.parts.model) || root;
    model.updateWorldMatrix(true, true);
    const inv = model.matrixWorld.clone().invert();
    const box = new THREE.Box3(), b = new THREE.Box3(), rel = new THREE.Matrix4();
    model.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      if (!o.geometry.boundingBox) return;
      rel.multiplyMatrices(inv, o.matrixWorld);
      box.union(b.copy(o.geometry.boundingBox).applyMatrix4(rel));
    });
    root.traverse((o) => {
      if (o.isMesh && o.geometry) applySidePhotoUVs(o.geometry, box);
    });
    loadDogCoatTextures(breed).then((maps) => {
      if (!maps || !root.parent) return;
      root.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m || !m.color) return;
          const lum = 0.299 * m.color.r + 0.587 * m.color.g + 0.114 * m.color.b;
          if (lum < 0.06 || lum > 0.92) return;     // eyes / nose / teeth
          if (maps.albedo) { m.map = maps.albedo; m.color.setRGB(1, 1, 1); }
          if (maps.normal) m.normalMap = maps.normal;
          if (maps.roughness) m.roughnessMap = maps.roughness;
          m.vertexColors = false;
          m.roughness = 0.82;
          m.needsUpdate = true;
        });
      });
      try { ctxRenderOnce(root); } catch {}
    });
  }
  // The vignette renders on demand, so a late-arriving texture needs one more
  // frame or the coat only appears after the user drags the turntable.
  function ctxRenderOnce(node) {
    let p = node;
    while (p && !p.userData._vignetteCtx) p = p.parent;
    const c = p && p.userData._vignetteCtx;
    if (c) c.renderer.render(c.scene, c.camera);
  }

  function creatureTurntable(ctx, url, opts) {
    creatureStage(ctx, opts);
    const holder = new THREE.Group();
    holder.userData._vignetteCtx = ctx;
    ctx.scene.add(holder);
    if (opts.dress) { try { opts.dress(holder, ctx); } catch {} }
    const creature = buildCreature(url, { targetSize: opts.targetSize, axis: opts.axis || "max" });
    holder.add(creature);
    creature.userData.onReady = () => {
      if (opts.coatBreed) { try { applyVignetteCoat(creature, opts.coatBreed); } catch {} }
      const parts = creature.userData.parts;
      if (parts && parts.play) parts.play(opts.clip || "idle", 0.2, { timeScale: opts.timeScale || 1 });
      // Frame by measured height so shiba / spider / snake all fill the stage.
      const h = (parts && parts.height) || 0.8;
      ctx.camera.position.set(0, Math.max(0.55, h * 0.85), Math.max(2.4, h * 3.1));
      ctx.camera.lookAt(0, h * 0.45, 0);
      // The model streams in AFTER the first frame — render one explicitly so
      // reduced-motion (single-still-frame mode) shows the creature, not an
      // empty stage.
      if (parts && parts.mixer) parts.mixer.update(0.05);
      try { ctx.renderer.render(ctx.scene, ctx.camera); } catch {}
    };
    const isDragging = addDragSpin(ctx, holder);
    ctx.onTick = (dt) => {
      const parts = creature.userData.parts;
      if (parts && parts.mixer) parts.mixer.update(dt);
      if (!isDragging()) holder.rotation.y += dt * (opts.spin ?? 0.35);
    };
  }

  // Per-realm set dressing: a couple of props that say "this is a place".
  function realmDog(ctx) {
    creatureTurntable(ctx, DOG_MODELS.shiba, {
      targetSize: 1.05, clip: "idle", spin: 0.3, ground: "planks", coatBreed: "shiba",
      dress(holder, c) {
        try {
          const rugMaps = makeRugMaps();
          const rug = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.05),
            new THREE.MeshStandardMaterial({ map: rugMaps.albedo, normalMap: rugMaps.normal, color: 0xffffff, roughness: 0.95 }));
          rug.rotation.x = -Math.PI / 2; rug.rotation.z = 0.15;
          rug.position.y = 0.006;
          rug.receiveShadow = true;
          holder.add(rug);
        } catch {}
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.07, 18, 14),
          new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.45 }));
        ball.position.set(0.6, 0.07, 0.35);
        ball.castShadow = true;
        holder.add(ball);
      },
    });
  }
  function realmSpider(ctx) {
    creatureTurntable(ctx, CREATURE_MODELS.spider, {
      targetSize: 1.15, clip: "idle", timeScale: 0.8, ground: "concrete", tint: 0xd8e0f0,
      dress(holder) {
        try {
          const plank = makePlankMaps();
          const crate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42),
            new THREE.MeshStandardMaterial({ map: plank.albedo, color: 0xb8a888, roughness: 0.9 }));
          crate.position.set(-0.72, 0.21, -0.35);
          crate.rotation.y = 0.4;
          crate.castShadow = true; crate.receiveShadow = true;
          holder.add(crate);
        } catch {}
        // A few silk strands from the crate corner — barely-there web hints.
        const silkM = new THREE.LineBasicMaterial({ color: 0xdde6f2, transparent: true, opacity: 0.28 });
        for (let i = 0; i < 3; i++) {
          const g = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(-0.72, 0.42, -0.35),
            new THREE.Vector3(-0.72 + 0.5 + i * 0.18, 0.02, -0.35 + 0.4 - i * 0.25),
          ]);
          holder.add(new THREE.Line(g, silkM));
        }
      },
    });
  }
  function realmSnake(ctx) {
    creatureTurntable(ctx, CREATURE_MODELS.snake, {
      targetSize: 1.15, clip: "idle", timeScale: 0.9, ground: "grass", tint: 0xffe6b8,
      dress(holder, c) {
        const stoneM = new THREE.MeshStandardMaterial({ color: 0x6a625a, roughness: 0.85 });
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stoneM);
        rock.position.set(-0.65, 0.1, -0.3); rock.scale.y = 0.55;
        rock.castShadow = true; rock.receiveShadow = true;
        holder.add(rock);
        const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), stoneM);
        rock2.position.set(0.6, 0.05, 0.4); rock2.scale.y = 0.6;
        rock2.castShadow = true;
        holder.add(rock2);
        try { c._tufts = grassTufts(c.scene, 10, 0.9, 1.5); } catch {}
      },
    });
    // sway the tufts alongside the turntable tick
    const baseTick = ctx.onTick;
    ctx.onTick = (dt, t) => { if (baseTick) baseTick(dt, t); if (ctx._tufts) ctx._tufts.update(t); };
  }

  // The Summit: a rooftop ledge with railing, a low moon, drifting clouds.
  function realmHeights(ctx) {
    const { scene, camera } = ctx;
    scene.fog = new THREE.FogExp2(0x1a2547, 0.055);
    scene.add(new THREE.AmbientLight(0x35406a, 1.0));
    const moonL = new THREE.DirectionalLight(0xcdd8f5, 0.9);
    moonL.position.set(-4, 5, -3);
    moonL.castShadow = true;
    moonL.shadow.mapSize.set(512, 512);
    moonL.shadow.camera.left = -3; moonL.shadow.camera.right = 3;
    moonL.shadow.camera.top = 3;   moonL.shadow.camera.bottom = -3;
    scene.add(moonL);
    let ledgeMat;
    try {
      const conc = makeConcreteMaps();
      [conc.albedo, conc.normal, conc.roughness].forEach(t => { if (t) t.repeat.set(2.4, 1.2); });
      ledgeMat = new THREE.MeshStandardMaterial({ map: conc.albedo, normalMap: conc.normal, roughnessMap: conc.roughness, color: 0xd0d4de });
    } catch {
      ledgeMat = new THREE.MeshStandardMaterial({ color: 0x232b44, roughness: 0.9 });
    }
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.35, 1.6), ledgeMat);
    ledge.position.set(0, -0.18, 0.2);
    ledge.receiveShadow = true;
    scene.add(ledge);
    const railM = new THREE.MeshStandardMaterial({ color: 0x8f9bb5, roughness: 0.4, metalness: 0.6 });
    for (let i = -2; i <= 2; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.55, 8), railM);
      post.position.set(i * 0.7, 0.27, -0.45);
      post.castShadow = true;
      scene.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 3.1, 8), railM);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.55, -0.45);
    bar.castShadow = true;
    scene.add(bar);
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xfdf6de })
    );
    moon.position.set(-2.4, 2.1, -7);
    scene.add(moon);
    // City lights far below the ledge — tiny emissive dots on a dark slab.
    const cityM = new THREE.MeshBasicMaterial({ color: 0xffe089 });
    for (let i = 0; i < 26; i++) {
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.045), cityM);
      dot.position.set((Math.random() - 0.5) * 9, -2.6 - Math.random() * 1.6, -2.5 - Math.random() * 5);
      scene.add(dot);
    }
    const clouds = [];
    const cloudM = new THREE.MeshBasicMaterial({ color: 0x8a97bd, transparent: true, opacity: 0.16, depthWrite: false });
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(2.4 + i, 0.5), cloudM);
      c.position.set((Math.random() - 0.5) * 6, -1.2 - i * 0.5, -3 - i * 1.2);
      scene.add(c);
      clouds.push(c);
    }
    camera.position.set(0, 0.95, 2.9);
    camera.lookAt(0, 0.25, -1.2);
    ctx.onTick = (dt, t) => {
      clouds.forEach((c, i) => {
        c.position.x += dt * (0.08 + i * 0.03);
        if (c.position.x > 5) c.position.x = -5;
      });
      camera.position.y = 0.95 + Math.sin(t * 0.4) * 0.02;   // faint vertigo breath
      camera.lookAt(0, 0.25, -1.2);
    };
  }

  // The House at Night: a lone lantern holding a small circle of warm light.
  function realmDark(ctx) {
    const { scene, camera } = ctx;
    scene.fog = new THREE.FogExp2(0x05070f, 0.16);
    scene.add(new THREE.AmbientLight(0x131a30, 0.7));
    // Faint blue moon shafts through the room + shadow-casting for the post.
    const moonL = new THREE.DirectionalLight(0x8898c8, 0.35);
    moonL.position.set(3, 4, 2);
    moonL.castShadow = true;
    moonL.shadow.mapSize.set(512, 512);
    scene.add(moonL);
    let floorMat;
    try {
      const conc = makeConcreteMaps();
      [conc.albedo, conc.normal, conc.roughness].forEach(t => { if (t) t.repeat.set(5, 5); });
      floorMat = new THREE.MeshStandardMaterial({ map: conc.albedo, normalMap: conc.normal, roughnessMap: conc.roughness, color: 0x5a6070 });
    } catch {
      floorMat = new THREE.MeshStandardMaterial({ color: 0x0c1020, roughness: 1 });
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    // Lantern: post, cap, glowing core
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.0, 10),
      new THREE.MeshStandardMaterial({ color: 0x1c2338, roughness: 0.7 }));
    post.position.y = 0.5;
    post.castShadow = true;
    scene.add(post);
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    core.position.y = 1.06;
    scene.add(core);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.12, 10),
      new THREE.MeshStandardMaterial({ color: 0x1c2338, roughness: 0.7 }));
    cap.position.y = 1.2;
    cap.castShadow = true;
    scene.add(cap);
    const glow = new THREE.PointLight(0xffc27a, 2.2, 6, 2.0);
    glow.position.y = 1.06;
    scene.add(glow);
    // Door silhouette at the edge of the light
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.6, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x0a0e1c, roughness: 1 }));
    door.position.set(-1.5, 0.8, -1.8);
    door.rotation.y = 0.5;
    door.castShadow = true;
    scene.add(door);
    camera.position.set(0.4, 1.0, 2.7);
    camera.lookAt(-0.1, 0.8, -0.4);
    ctx.onTick = (dt, t) => {
      const n = Math.sin(t * 7.3) * 0.4 + Math.sin(t * 17.1) * 0.25;
      glow.intensity = 2.2 + n * 0.35;
      core.scale.setScalar(1 + n * 0.05);
      camera.position.x = 0.4 + Math.sin(t * 0.11) * 0.1;
      camera.lookAt(-0.1, 0.8, -0.4);
    };
  }

  // The Narrow Passage: receding door frames swallowed by fog; the camera
  // breathes gently forward and back — closeness you can feel, not read.
  function realmEnclosed(ctx) {
    const { scene, camera } = ctx;
    scene.fog = new THREE.FogExp2(0x0a0e1c, 0.22);
    scene.add(new THREE.AmbientLight(0x39415c, 1.1));
    const warm = new THREE.PointLight(0xd8c8a8, 1.1, 8, 1.6);
    warm.position.set(0, 1.4, 2.2);
    scene.add(warm);
    let frameM;
    try {
      const plaster = makePlasterMaps();
      frameM = new THREE.MeshStandardMaterial({ map: plaster.albedo, normalMap: plaster.normal, color: 0x9aa2b8, roughness: 0.9 });
    } catch {
      frameM = new THREE.MeshStandardMaterial({ color: 0x232b44, roughness: 0.85 });
    }
    for (let i = 0; i < 6; i++) {
      const s = 1.0 - i * 0.09;
      const z = -i * 1.15;
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.7 * s, 0.14, 0.22), frameM);
      top.position.set(0, 1.9 * s, z);
      top.castShadow = true;
      scene.add(top);
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.9 * s, 0.22), frameM);
      left.position.set(-0.85 * s, 0.95 * s, z);
      left.castShadow = true;
      scene.add(left);
      const right = left.clone();
      right.position.x = 0.85 * s;
      scene.add(right);
    }
    let floorMat2;
    try {
      const conc = makeConcreteMaps();
      [conc.albedo, conc.normal, conc.roughness].forEach(t => { if (t) t.repeat.set(2, 10); });
      floorMat2 = new THREE.MeshStandardMaterial({ map: conc.albedo, normalMap: conc.normal, roughnessMap: conc.roughness, color: 0x707890 });
    } catch {
      floorMat2 = new THREE.MeshStandardMaterial({ color: 0x101527, roughness: 1 });
    }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(3, 16), floorMat2);
    floor.rotation.x = -Math.PI / 2;
    floor.position.z = -5;
    floor.receiveShadow = true;
    scene.add(floor);
    camera.position.set(0, 1.0, 2.6);
    camera.lookAt(0, 0.9, -3);
    ctx.onTick = (dt, t) => {
      camera.position.z = 2.6 - (Math.sin(t * 0.22) * 0.5 + 0.5) * 1.1;
      camera.lookAt(0, 0.9, -3);
    };
  }

  // ---- Full-viewport night valley: title screen + post-create threshold ----
  const LANDING_BEATS = [
    { pos: [5.6, 2.55, 8.8], look: [0.15, 0.9, 0.15] },
    { pos: [2.4, 1.45, 4.8], look: [1.55, 0.42, 0.85] },
    { pos: [0.55, 1.65, 3.5], look: [0.05, 0.85, 0.05] },
    { pos: [1.15, 1.48, 3.7], look: [-0.7, 0.95, 0.2] },
    { pos: [3.8, 3.15, 6.4], look: [1.6, 1.35, -10] },
    // Final beat: on the traveler — the camera stays at its proven clear spot
    // (0.45/3.05 clipped into the near pine); only the look-at moves to the
    // figure's place in the firelight.
    { pos: [0.2, 1.22, 3.15], look: [-0.62, 0.98, 0.85] },
  ];
  const REALM_MARKERS = {
    dogs:     { p: [7.2, 0, -8.4],  c: 0xc4a574 },
    spiders:  { p: [-7.4, 0, -6.2], c: 0x6b7a4a },
    snakes:   { p: [8.6, 0, -1.8],  c: 0x4a8a62 },
    heights:  { p: [-5.2, 0, -11],  c: 0x8aa4c8 },
    dark:     { p: [2.4, 0, -12.4], c: 0x3a4a78 },
    enclosed: { p: [-8.8, 0, -0.6], c: 0x7a5a48 },
  };

  function mountLanding(container, opts = {}) {
    const ctx = makeCtx(container, { fov: 38, fog: 0x0a1220, fogDensity: 0.028, exposure: 0.95 });
    if (!ctx) return null;
    const { scene, camera, renderer } = ctx;
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x0a1220, 0.032);
    // Size to the real viewport — makeCtx may have sampled a 0×0 first layout.
    const nw = container.clientWidth || window.innerWidth || 800;
    const nh = container.clientHeight || window.innerHeight || 600;
    renderer.setSize(nw, nh);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();

    const moon = new THREE.DirectionalLight(0xb8c8e8, 0.55);
    moon.position.set(-6, 10, -4);
    moon.castShadow = true;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -10; moon.shadow.camera.right = 10;
    moon.shadow.camera.top = 10;   moon.shadow.camera.bottom = -6;
    moon.shadow.camera.near = 2;   moon.shadow.camera.far = 28;
    moon.shadow.bias = -0.00035;
    scene.add(moon);
    scene.add(new THREE.AmbientLight(0x243048, 0.62));
    const env = (typeof getRoomEnvMap === "function") ? getRoomEnvMap(renderer) : null;
    if (env) scene.environment = env;

    groundPatch(scene, "grass", 18, 10);
    const tufts = grassTufts(scene, 42, 1.6, 9.5, 0x3d5a28);

    // Packed-earth ring around the fire.
    try {
      const earth = makeEarthMaps();
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.55, 1.55, 40),
        new THREE.MeshStandardMaterial({
          map: earth.albedo, normalMap: earth.normal, roughnessMap: earth.roughness,
          color: 0xffffff, roughness: 1, envMapIntensity: 0.3,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.008;
      ring.receiveShadow = true;
      scene.add(ring);
    } catch {}

    const fire = buildFire(scene, { scale: 1.05 });
    const flies = fireflies(scene, 16, 3.4);

    // Moon disc
    const moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0xf4edd0 })
    );
    moonMesh.position.set(-9, 8.2, -14);
    scene.add(moonMesh);
    const moonGlow = new THREE.PointLight(0xdde6ff, 0.55, 40, 2);
    moonGlow.position.copy(moonMesh.position);
    scene.add(moonGlow);

    // Star field
    {
      const n = 160;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 16 + Math.random() * 18;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = 4 + Math.random() * 10;
        pos[i * 3 + 2] = Math.sin(a) * r - 4;
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
        color: 0xdfe9ff, size: 0.06, transparent: true, opacity: 0.85, depthWrite: false,
      })));
    }

    // Tree ring
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const r = 9.5 + (i % 3) * 1.1 + Math.random() * 0.6;
      const tree = pineTree(2.1 + Math.random() * 1.6);
      tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      tree.rotation.y = Math.random() * Math.PI;
      scene.add(tree);
    }

    // Tent + log (same language as the camp vignette)
    const tent = new THREE.Group();
    const tentM = new THREE.MeshStandardMaterial({ color: 0x7a5b3a, roughness: 0.9, side: THREE.DoubleSide });
    const tentDarkM = new THREE.MeshStandardMaterial({ color: 0x4c3a26, roughness: 0.95, side: THREE.DoubleSide });
    const panelL = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15), tentM);
    panelL.position.set(0, 0.5, -0.42); panelL.rotation.x = -0.63;
    const panelR = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.15), tentM);
    panelR.position.set(0, 0.5, 0.42); panelR.rotation.x = 0.63;
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.62, 3), tentDarkM);
    back.rotation.y = Math.PI / 2; back.rotation.z = Math.PI / 6;
    back.position.set(-0.74, 0.35, 0);
    [panelL, panelR, back].forEach((p) => { p.castShadow = true; tent.add(p); });
    tent.position.set(-2.15, 0, -1.7);
    tent.rotation.y = 0.7;
    scene.add(tent);
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.95, 10),
      new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.95 }));
    seat.rotation.z = Math.PI / 2; seat.rotation.y = -0.4;
    seat.position.set(0.95, 0.09, 0.78);
    seat.castShadow = true;
    scene.add(seat);

    // Distant realm glows
    const markerLights = {};
    Object.keys(REALM_MARKERS).forEach((key) => {
      const m = REALM_MARKERS[key];
      const g = new THREE.Group();
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 12, 10),
        new THREE.MeshBasicMaterial({ color: m.c, transparent: true, opacity: 0.7 })
      );
      glow.position.y = 1.15;
      g.add(glow);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.04, 1.1, 6),
        new THREE.MeshStandardMaterial({ color: 0x2a2430, roughness: 0.9 })
      );
      pole.position.y = 0.55;
      g.add(pole);
      const light = new THREE.PointLight(m.c, 0.55, 6, 2);
      light.position.y = 1.2;
      g.add(light);
      g.position.set(m.p[0], 0, m.p[2]);
      scene.add(g);
      markerLights[key] = { group: g, glow, light };
    });

    // Traveler — IN the firelight, standing at ease, angled three-quarters
    // toward the viewer. The old placement (-0.9, 0.28, turned away, outside
    // the fire's radius, running the walk-demo treadmill) staged a dark
    // humanoid pacing at the edge of the frame — the grammar of a horror
    // shot, on the character who is supposed to be YOU. A warm fill makes
    // sure the face reads even before the fire flicker catches it.
    let figure = null;
    if (opts.charHexes) {
      try {
        figure = buildAvatarFigure(opts.charHexes, "idle");
        figure.position.set(-0.62, 0, 0.85);
        figure.rotation.y = 0.5;
        // (Shadow casters: the rig's own set — see the camp.)
        scene.add(figure);
        const figFill = new THREE.PointLight(0xffc890, 1.05, 6, 2);
        figFill.position.set(0.55, 1.55, 2.1);
        scene.add(figFill);
      } catch { figure = null; }
    }

    // Photo-coated dog in the yard — the fear lives in the world from beat one.
    let dog = null;
    try {
      if (typeof buildDog === "function") {
        dog = buildDog({ breed: "shiba", targetHeight: 0.52, coat: 0xc4a574 });
        dog.position.set(1.65, 0, 0.95);
        dog.rotation.y = -0.9;
        dog.userData.onReady = () => {
          const acts = dog.userData.parts && dog.userData.parts.actions;
          if (acts && acts.Idle) { try { acts.Idle.reset(); acts.Idle.play(); } catch {} }
        };
        scene.add(dog);
      }
    } catch { dog = null; }

    // Fear-shadow blob that grows on the "avoidance" beat. UNLIT on purpose:
    // a StandardMaterial here caught the moon and fire like any other surface
    // and the metaphor's centrepiece rendered as a grey boulder floating by
    // the camp. A shadow is an absence — flat near-black, no depth write, so
    // it reads as a void drifting in front of the night rather than a prop.
    const shadow = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({
        color: 0x04060e, transparent: true, opacity: 0.78, depthWrite: false,
      })
    );
    shadow.position.set(0.2, 0.45, -1.1);
    shadow.scale.setScalar(0.55);
    scene.add(shadow);

    const look = new THREE.Vector3();
    const camPos = new THREE.Vector3();
    const beats = LANDING_BEATS.map((b) => ({ pos: b.pos.slice(), look: b.look.slice() }));
    let beat = opts.mode === "threshold" ? 4 : 0;
    let beatT = beat;
    let yawOff = 0, pitchOff = 0;
    let dragging = false, lastX = 0, lastY = 0, pid = null;
    const el = renderer.domElement;
    el.style.cursor = "grab";
    el.style.touchAction = "none";
    const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; pid = e.pointerId; el.style.cursor = "grabbing"; try { el.setPointerCapture(pid); } catch {} };
    const onMove = (e) => {
      if (!dragging) return;
      yawOff += (e.clientX - lastX) * 0.004;
      pitchOff = Math.max(-0.35, Math.min(0.35, pitchOff + (e.clientY - lastY) * 0.003));
      lastX = e.clientX; lastY = e.clientY;
    };
    const onUp = () => { if (!dragging) return; dragging = false; el.style.cursor = "grab"; try { el.releasePointerCapture(pid); } catch {} };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    const focus = opts.focusPhobia && REALM_MARKERS[opts.focusPhobia];
    if (opts.mode === "threshold" && focus) {
      beats[4] = {
        pos: [focus.p[0] * 0.35 + 1.2, 2.4, focus.p[2] * 0.35 + 4.5],
        look: [focus.p[0], 1.1, focus.p[2]],
      };
      beat = 4; beatT = 3.2;
    }

    landingCtl = {
      setBeat(i) { beat = Math.max(0, Math.min(beats.length - 1, i | 0)); },
    };

    // Night valley audio — first gesture unlocks if autoplay is blocked.
    const startAudio = () => {
      if (window._landingAudio) return;
      try {
        if (window.PhobiaAudio && window.PhobiaAudio.unlock) window.PhobiaAudio.unlock();
        if (window.PhobiaAudio && window.PhobiaAudio.startNightValley) {
          window._landingAudio = window.PhobiaAudio.startNightValley({
            firePos: { x: 0, y: 0.3, z: 0 },
          });
        }
      } catch {}
    };
    startAudio();
    container.addEventListener("pointerdown", startAudio, { once: true });

    const prevCleanup = ctx.cleanupExtra;
    ctx.cleanupExtra = () => {
      if (typeof prevCleanup === "function") try { prevCleanup(); } catch {}
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (landingCtl) landingCtl = null;
      if (window._landingAudio) {
        try { window._landingAudio.stop(); } catch {}
        window._landingAudio = null;
      }
    };

    ctx.onTick = (dt, t) => {
      fire.update(dt, t);
      flies.update(t);
      tufts.update(t);
      if (figure && figure.userData && figure.userData.animate) figure.userData.animate(t);
      if (dog && dog.userData && dog.userData.parts && dog.userData.parts.mixer) {
        try { dog.userData.parts.mixer.update(dt); } catch {}
      }
      const want = beat === 2 ? 1.85 : (beat < 2 ? 0.55 : 0.42);
      shadow.scale.setScalar(shadow.scale.x + (want - shadow.scale.x) * Math.min(1, dt * 1.6));
      shadow.rotation.y += dt * 0.25;
      shadow.position.y = 0.45 + Math.sin(t * 0.8) * 0.04;
      Object.keys(markerLights).forEach((key) => {
        const mk = markerLights[key];
        const hot = opts.focusPhobia === key || (beat === 4 && !opts.focusPhobia);
        const I = hot ? 1.15 : 0.45;
        mk.light.intensity += (I - mk.light.intensity) * Math.min(1, dt * 2);
        mk.glow.scale.setScalar(1 + Math.sin(t * 1.4) * 0.06 * (hot ? 1.4 : 0.6));
      });
      beatT += (beat - beatT) * Math.min(1, dt * 1.15);
      const i0 = Math.max(0, Math.min(beats.length - 2, Math.floor(beatT)));
      const frac = Math.max(0, Math.min(1, beatT - i0));
      const a = beats[i0], b = beats[i0 + 1] || a;
      const s = frac * frac * (3 - 2 * frac);
      camPos.set(
        a.pos[0] + (b.pos[0] - a.pos[0]) * s,
        a.pos[1] + (b.pos[1] - a.pos[1]) * s,
        a.pos[2] + (b.pos[2] - a.pos[2]) * s
      );
      look.set(
        a.look[0] + (b.look[0] - a.look[0]) * s,
        a.look[1] + (b.look[1] - a.look[1]) * s,
        a.look[2] + (b.look[2] - a.look[2]) * s
      );
      // Orbit offset from drag
      const ox = camPos.x - look.x, oz = camPos.z - look.z;
      const dist = Math.hypot(ox, oz);
      const ang = Math.atan2(ox, oz) + yawOff;
      camera.position.set(
        look.x + Math.sin(ang) * dist,
        camPos.y + pitchOff * 1.4,
        look.z + Math.cos(ang) * dist
      );
      camera.lookAt(look);
    };
    ctx.start();
    return ctx;
  }

  function setLandingBeat(i) {
    if (landingCtl && landingCtl.setBeat) landingCtl.setBeat(i);
  }

  function unmountAll() { [...registry].forEach(disposeCtx); landingCtl = null; }

  // ---- Portraits: the story's cast drawn by the game's own figure builder ----
  // Story pages showed Mira and the residents as the flat header avatar — a
  // different art style from the people you then meet in 3D. A head-and-
  // shoulders render of the SAME figure the scenes use, baked once per look
  // on one small offscreen renderer (released after a quiet spell) and kept
  // as an image, so a page turn never touches WebGL.
  const _portraits = new Map();
  let _pr = null, _prQueue = Promise.resolve(), _prIdle = 0;
  function portrait(hexes, size = 160) {
    if (!hexes) return Promise.resolve(null);
    const key = JSON.stringify([hexes.bodyType, hexes.skinHex, hexes.hairHex, hexes.shirtHex, hexes.eyeHex,
      hexes.hairStyle, hexes.glasses, hexes.facialHair, hexes.headwear, hexes.topStyle, size]);
    if (_portraits.has(key)) return _portraits.get(key);
    const job = (_prQueue = _prQueue.then(() => bakePortrait(hexes, size)).catch(() => null));
    _portraits.set(key, job);
    return job;
  }
  async function bakePortrait(hexes, size) {
    if (!_pr) {
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: "low-power" });
      } catch { return null; }
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      const scene = new THREE.Scene();
      const env = getRoomEnvMap(renderer);
      if (env) scene.environment = env;
      scene.add(new THREE.HemisphereLight(0xe4ecf8, 0x4a4038, 0.55));
      // Warm lantern key from the front-left, cool fill, a rim to lift the
      // hair off the dark card behind it.
      const key = new THREE.DirectionalLight(0xffe2b8, 2.3); key.position.set(-1.2, 1.6, 2.4);
      const fill = new THREE.DirectionalLight(0xcfe0f5, 0.7); fill.position.set(1.8, 0.6, 1.6);
      const rim = new THREE.DirectionalLight(0xfff1dc, 1.5); rim.position.set(0.6, 2.2, -2.4);
      scene.add(key, fill, rim);
      _pr = { renderer, scene, camera: new THREE.PerspectiveCamera(22, 1, 0.05, 20) };
    }
    clearTimeout(_prIdle);
    _prIdle = setTimeout(() => {
      if (!_pr) return;
      try { _pr.renderer.dispose(); _pr.renderer.forceContextLoss(); } catch {}
      _pr = null;
    }, 6000);
    const { renderer, scene, camera } = _pr;
    renderer.setSize(size, size, false);
    let fig = null;
    try {
      fig = buildAvatarFigure(hexes, "idle");
      scene.add(fig);
      try { if (fig.userData.animate) fig.userData.animate(0.4); } catch {}
      fig.updateMatrixWorld(true);
      // Frame on the head: the rig's head height for this body type.
      const bt = BODY_TYPES_3D[hexes.bodyType] || BODY_TYPES_3D.man;
      const hy = 1.55 * bt.h;
      camera.position.set(0.1, hy + 0.03, 0.98);
      camera.lookAt(0, hy - 0.04, 0);
      camera.updateProjectionMatrix();
      // Link the programs off the main thread where the GPU allows, so the
      // first face doesn't freeze the page turn it appears on.
      try { await compileAhead(renderer, scene, camera); } catch {}
      if (!_pr || _pr.renderer !== renderer) return null;
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL("image/png");
    } catch { return null; }
    finally {
      if (fig) { scene.remove(fig); try { disposeObject(fig); } catch {} }
    }
  }

  return { mountCamp, mountRealm, mountLanding, mountRoom, setLandingBeat, unmountAll, portrait, ready: true };
})();
window.ShellScenes = ShellScenes;
