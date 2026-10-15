// Water — a legacy realm, behind LAUNCH_OPEN (?all=1 to play).

import * as THREE from "three";
import { active } from "../engine.js";

// ---------- Water ----------
function setupWater(scene, camera, level) {
  const fill = level.level; // 0..1

  // Sky dome (gradient)
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top:    { value: new THREE.Color(0x4a8fbf) },
      bottom: { value: new THREE.Color(0xd0e8f5) },
    },
    vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vPos;
      void main(){ float t=clamp(normalize(vPos).y, 0.0, 1.0); gl_FragColor=vec4(mix(bottom, top, t),1.0);} `,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat));
  scene.background = new THREE.Color(0x9bc6e0);

  // Lighting — lifted so the water reads as luminous open water, not a flat
  // dark void (the surface is most of the scene).
  const sun = new THREE.DirectionalLight(0xfff5e0, 2.5);
  sun.position.set(80, 120, 60);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xb8dcf2, 0x2a5070, 0.85));

  // Distant horizon strip — suggests an island for shallow levels
  if (fill < 0.7) {
    const island = new THREE.Mesh(
      new THREE.BoxGeometry(400, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 1.0 })
    );
    island.position.set(0, -1, -300);
    scene.add(island);
  }

  // Custom water shader — Gerstner-ish waves with sky reflection + sun spec
  const waterGeo = new THREE.PlaneGeometry(1600, 1600, 220, 220);
  const waterMat = new THREE.ShaderMaterial({
    uniforms: {
      time:        { value: 0 },
      sunDir:      { value: sun.position.clone().normalize() },
      deepColor:   { value: new THREE.Color(0x0c577f) },
      shallowColor:{ value: new THREE.Color(0x5fb4dc) },
      skyTop:      { value: new THREE.Color(0x4a8fbf) },
      skyBot:      { value: new THREE.Color(0xd0e8f5) },
      waveAmp:     { value: 0.25 + fill * 0.5 },
    },
    vertexShader: `
      uniform float time;
      uniform float waveAmp;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      vec3 wave(vec2 p){
        float h = sin(p.x*0.10 + time*1.0) * 0.30
                + sin(p.y*0.13 + time*0.85) * 0.40
                + sin((p.x+p.y)*0.07 + time*0.6) * 0.50
                + sin(p.x*0.32 + time*1.7) * 0.10;
        return vec3(p.x, h*waveAmp, p.y);
      }
      void main(){
        vec2 p = position.xy;
        vec3 ps = wave(p);
        vec3 dx = wave(p + vec2(0.5,0.0)) - ps;
        vec3 dz = wave(p + vec2(0.0,0.5)) - ps;
        vNormal = normalize(cross(dz, dx));
        vec4 wp = modelMatrix * vec4(ps, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDir;
      uniform vec3 deepColor;
      uniform vec3 shallowColor;
      uniform vec3 skyTop;
      uniform vec3 skyBot;
      uniform float opacity;
      varying vec3 vNormal;
      varying vec3 vWorldPos;
      void main(){
        vec3 V = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - max(dot(V, vNormal), 0.0), 3.0);
        vec3 R = reflect(-sunDir, vNormal);
        float spec = pow(max(dot(R, V), 0.0), 64.0);
        vec3 base = mix(deepColor, shallowColor, fres * 0.6);
        vec3 sky = mix(skyBot, skyTop, max(vNormal.y, 0.0));
        vec3 col = mix(base, sky, fres * 0.65);
        col += vec3(1.0, 0.95, 0.8) * spec * 1.6;
        // Water gets more transparent at glancing angles (so we see the bottom)
        // and more opaque looking straight down (so deep rungs feel deep).
        float a = mix(opacity, 1.0, fres);
        gl_FragColor = vec4(col, a);
      }
    `,
    transparent: true,
  });
  // Per-rung opacity: shallow water is clear-ish (you can see toes), deep
  // water gets opaque so the bottom hides in the murk.
  waterMat.uniforms.opacity = { value: fill < 0.4 ? 0.55 : fill < 0.7 ? 0.78 : 0.92 };
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  // Camera at eye level (y=0). For "toes in puddle" the water sits far below;
  // for "open water deep" the water surface rises to the chin.
  // Cap the surface just below the shore eye line so the deep rung (fill=1.0,
  // which mapped to +0.8, i.e. 0.8 m ABOVE the eye) no longer spawns you fully
  // submerged on dry shore. You descend below it by WADING (camera.y = -depth).
  const waterY = Math.min(-0.05, -3.4 + fill * 4.2);
  water.position.y = waterY;
  scene.add(water);

  // Sandy bottom + scattered pebbles — visible through clear water at the
  // shallow rungs ("toes in the puddle, you can see the bottom"). At deeper
  // rungs the water is opaque enough to hide it, and underwater fog hides
  // it at chest-deep+ rungs.
  const bottomDepth = waterY - 1.4;
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 60),
    new THREE.MeshStandardMaterial({ color: 0xd5b67a, roughness: 1.0 })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = bottomDepth;
  scene.add(sand);
  // Pebbles scattered on the sand
  for (let i = 0; i < 24; i++) {
    const stone = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 + Math.random() * 0.08, 8, 6),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.20, 0.40 + Math.random() * 0.15),
        roughness: 0.95,
      })
    );
    stone.position.set(
      (Math.random() - 0.5) * 20,
      bottomDepth + 0.04,
      -2 - Math.random() * 14
    );
    stone.scale.y = 0.4;
    scene.add(stone);
  }
  // Seaweed at deeper levels — green strands that sway with the waves
  let seaweed = [];
  if (fill > 0.45) {
    const seaweedCount = 8 + Math.floor(fill * 12);
    for (let i = 0; i < seaweedCount; i++) {
      const strandH = 0.6 + Math.random() * 0.4;
      const w = new THREE.Mesh(
        new THREE.PlaneGeometry(0.10, strandH),
        new THREE.MeshStandardMaterial({
          color: 0x3a7a4a, roughness: 1.0, side: THREE.DoubleSide,
          transparent: true, opacity: 0.85,
        })
      );
      // Pivot at the BASE: the sway rotation below tilts the tip while the
      // root stays planted (a centre pivot swung the whole strip and lifted
      // the root off the sand every half-cycle).
      w.geometry.translate(0, strandH / 2, 0);
      w.position.set(
        (Math.random() - 0.5) * 18,
        bottomDepth - 0.05,
        -2 - Math.random() * 12
      );
      w.rotation.y = Math.random() * Math.PI;
      w.userData = { phase: Math.random() * Math.PI * 2 };
      scene.add(w);
      seaweed.push(w);
    }
  }

  // Murky underwater fog is now applied DYNAMICALLY (only once the camera is
  // actually below the surface) — see the submersion block in the update loop.
  // Deep rungs still build the god-ray beams. The scene always SPAWNS clear so
  // standing on the shore isn't drowned in blue fog.
  const underwater = fill > 0.82;         // deep rung → build god rays
  const clearFog = new THREE.Fog(0xc6dde9, 80 + (1 - fill) * 200, 800);
  const murkyFog = new THREE.FogExp2(0x09435f, 0.06 + Math.max(0, fill - 0.85) * 0.4);
  const skyBg = scene.background;
  scene.fog = clearFog;

  // Light beams underwater (god rays effect via tilted planes)
  let beams = [];
  if (underwater) {
    const beamMat = new THREE.MeshBasicMaterial({
      color: 0xbfe3ff, transparent: true, opacity: 0.06,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 8; i++) {
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 30), beamMat.clone());
      beam.position.set((Math.random() - 0.5) * 30, -5, -8 - Math.random() * 25);
      beam.rotation.z = (Math.random() - 0.5) * 0.4;
      beam.rotation.x = 0.2;
      scene.add(beam);
      beams.push(beam);
    }
  }

  // Bubbles
  const bubbleCount = underwater ? 200 : (fill > 0.5 ? 80 : 0);
  let bubbles = null;
  if (bubbleCount > 0) {
    const positions = new Float32Array(bubbleCount * 3);
    for (let i = 0; i < bubbleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = -5 - Math.random() * 15;
      positions[i * 3 + 2] = -Math.random() * 40 - 1;
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    bubbles = new THREE.Points(
      bg,
      new THREE.PointsMaterial({
        color: 0xffffff, size: 0.16, transparent: true, opacity: 0.7,
        depthWrite: false,
      })
    );
    scene.add(bubbles);
  }

  // Camera
  camera.fov = 62;
  camera.updateProjectionMatrix();

  // Fish that swim past — click them to make them dart away
  const fish = [];
  if (fill > 0.2) {
    const fishCount = Math.min(10, Math.floor(2 + fill * 10));
    const fishMat = new THREE.MeshStandardMaterial({ color: 0x5a7a8a, roughness: 0.55, metalness: 0.05 });   // matte, not shiny-plastic
    for (let i = 0; i < fishCount; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), fishMat);
      f.scale.set(1.6, 0.35, 0.5);   // long axis along X = the swim direction (was sideways)
      f.position.set(
        (Math.random() - 0.5) * 25,
        (waterY != null ? waterY : -1) - 0.2 - Math.random() * 1.2,
        -4 - Math.random() * 14
      );
      f.userData = { vx: 0.5 + Math.random() * 1.2, dir: Math.random() < 0.5 ? -1 : 1, scared: 0, turnT: 0 };
      scene.add(f);
      fish.push(f);
    }
  }

  // Splash ripple sources triggered by clicking the water surface
  const splashes = []; // { mesh, t0 } — t0 stamped in scene-time (see waterT)
  let waterT = 0;      // latest scene-time from update(); lets onClick (no `t` in scope) stamp splashes in the same clock
  // The body displaces water: a persistent bow-wave ring rides with the player
  // while they're in it, and each ~0.4 s of wading pushes out a fresh ring +
  // per-step splash (see update()). Without these the body ghosted through the
  // plane — 2.2 m deep and the surface never once reacted.
  let wadeRing = null;
  let wadeStepT = 0;
  // Surfacing leaves water on the lens for a couple of seconds (droplet decay)
  let prevSubmersion = 0, dripT = 0;
  let waterControls = null;
  function wireWaterCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="water"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = waterControls;
        if (!c) return;
        if (btn.dataset.cmd === "splash") {
          // Trigger via onClick — already wired below
          if (resultObj.onClick) resultObj.onClick(c);
        } else if (btn.dataset.cmd === "lookdown") {
          const from = c.pitch, to = -0.55;
          let k = 0;
          const id = setInterval(() => {
            k += 0.06;
            if (k >= 1) { c.pitch = to; clearInterval(id); return; }
            c.pitch = from + (to - from) * k;
          }, 16);
        }
      };
    });
  }
  // We need a reference to the returned config inside wireWaterCmds, set below
  let resultObj = null;
  const splashGeo = new THREE.RingGeometry(0.05, 0.08, 32);
  const splashMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
  });

  // ----- Wading mechanic -----
  // The user spawns at the shore (positive z) and can walk forward into the
  // water (negative z). As they move forward the camera y *descends* along
  // an underwater slope — so the water visibly rises up their face. When
  // their eye line crosses the water surface, the underwater fog kicks in.
  // shoreZ → maxZ (positive), deepZ → minZ (negative).
  const shoreZ = 1.5;
  const deepZ = -2.5;
  // Maximum depth the camera descends to at deepZ for this rung. The user
  // can always step BACK to the shore — full agency.
  const maxDepth = fill * 2.2;       // 0.22 m at fill=0.10, 2.2 m at fill=1.0
  // ---- Submersion (the drowning beat) ----
  // When you wade deep enough that your HEAD goes under, the screen floods
  // blue-murky and a breath meter drains — surface (walk back) to breathe. This
  // is the half of aquaphobia the scene was missing: it never actually put you
  // under. Only reachable on the deep rungs (maxDepth must exceed head height).
  const HEAD_DEPTH = 1.5;            // depth at which the eye-line goes under
  let submersion = 0, breath = 1, breathWarned = false, breathReliefShown = false, uwOverlay = null, breathHud2 = null;
  let _prevSub = 0, _dripT = 0;      // residual lens-water timer after surfacing
  function buildSubmersionUI() {
    const stage = document.getElementById("stage");
    if (!stage) return;
    uwOverlay = document.createElement("div");
    uwOverlay.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .2s;" +
      "background:radial-gradient(ellipse at center, rgba(12,90,120,.32) 0%, rgba(5,46,70,.78) 70%, rgba(2,24,42,.93) 100%);" +
      "backdrop-filter:blur(1.6px);-webkit-backdrop-filter:blur(1.6px);";
    stage.appendChild(uwOverlay);
    breathHud2 = document.createElement("div");
    // Distinct class + nudged down: the wade-depth HUD builder grabs the first
    // bare ".trust-hud" it finds — without the marker class it adopted THIS
    // element (both spawn on the same 80 ms timer), so the depth readout wrote
    // into the breath HUD and stayed invisible at the surface (opacity 0).
    breathHud2.className = "trust-hud breath-hud";
    breathHud2.style.top = "128px";
    breathHud2.style.opacity = "0";
    breathHud2.innerHTML = '<div class="trust-row"><span class="trust-name">Breath</span>' +
      '<span class="trust-pct"></span></div><div class="trust-bar"><div class="trust-bar-fill" style="background:#5fd0e8"></div></div>';
    stage.appendChild(breathHud2);
  }
  setTimeout(buildSubmersionUI, 80);
  let lastWaterEntryZ = null;        // track when we cross from dry to wet for splash
  let wadeDepthHud = null;
  function depthLabel(d) {
    if (d <= 0.05) return "On shore";
    if (d <= 0.45) return "Toes / ankles";
    if (d <= 0.85) return "Knee-deep";
    if (d <= 1.30) return "Waist-deep";
    if (d <= 1.75) return "Chest-deep";
    return "Underwater";
  }
  setTimeout(() => {
    const stage = document.getElementById("stage");
    if (!stage) return;
    let hud = stage.querySelector(".trust-hud:not(.breath-hud)");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "trust-hud";
      hud.innerHTML = `
        <div class="trust-row">
          <div class="trust-name">On shore</div>
          <div class="trust-pct">0.0 m</div>
        </div>
        <div class="trust-bar"><div class="trust-bar-fill"></div></div>
        <div class="trust-hint">Walk forward to wade · pick up a pebble · click water to skip</div>
      `;
      stage.appendChild(hud);
    }
    wadeDepthHud = hud;
  }, 80);

  // ----- Pebbles on the sand (pick up + throw) -----
  // Real human action: grab a stone, throw it into the water, watch the
  // splash + ripple. Even on the lowest rungs ("toes in puddle") the user
  // can do this, which gives them an empowering reason to step closer.
  const pebbles = [];
  let heldPebble = null;
  let pebbleActionAt = -1;   // timestamp of the last pebble pickup/throw (suppresses the generic tap-splash)
  let heldPebbleMesh = null;     // visible mesh in user's hand (anchored to the FP right hand)
  // Pickup is a short embodied sequence, not a teleport: the eye dips
  // (setEyeDrop), the right hand reaches to the stone on the sand
  // (setReachTarget), THEN the stone comes up in the fingers. Phase 0 = idle,
  // 1 = dipping/reaching, 2 = stone in hand, rising.
  let pickupPhase = 0, pickupT = 0;
  const pickupPt = new THREE.Vector3();
  function buildPebble(rxBase, ryBase, rzBase) {
    const geo = new THREE.SphereGeometry(0.06 + Math.random() * 0.05, 10, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(0.07 + Math.random() * 0.05, 0.18, 0.30 + Math.random() * 0.18),
      roughness: 0.95, metalness: 0.0,
    });
    const p = new THREE.Mesh(geo, mat);
    p.scale.set(1, 0.55, 1.1);
    p.position.set(rxBase, ryBase, rzBase);
    p.rotation.set(Math.random(), Math.random(), Math.random());
    p.castShadow = true;
    p.userData.pickable = true;
    return p;
  }
  // Scatter 6 pebbles on the dry shore in front of the user (z > shoreZ).
  // Sandy floor is at y = -1, pebble half-height ≈ 0.04 (after y-scale 0.55).
  for (let i = 0; i < 6; i++) {
    const px = (Math.random() - 0.5) * 5.5;
    const pz = shoreZ + 0.3 + Math.random() * 1.6;   // dry sand
    const pebble = buildPebble(px, -0.96, pz);
    scene.add(pebble);
    pebbles.push(pebble);
  }
  // Beach / near-shore ground (y = -1) that the pickup pebbles above rest on
  // and the user stands on at the shallow rungs. Without it the pebbles floated
  // in mid-air over the deep sand bottom (metres further down). At deep rungs it
  // sits below the risen waterline, hidden by opacity + underwater fog.
  const beach = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 8),
    new THREE.MeshStandardMaterial({ color: 0xcdb185, roughness: 1.0 })
  );
  beach.rotation.x = -Math.PI / 2;
  beach.position.set(0, -1, shoreZ + 1.8);
  beach.receiveShadow = true;
  scene.add(beach);

  // Build the visible held-pebble mesh once, reused per pickup.
  function showHeldPebble(sourcePebble) {
    if (heldPebbleMesh) {
      if (heldPebbleMesh.parent) heldPebbleMesh.parent.remove(heldPebbleMesh);
      heldPebbleMesh = null;
    }
    // Clone the source pebble's material color so the held one matches
    const heldGeo = new THREE.SphereGeometry(0.07, 12, 10);
    const heldMat = new THREE.MeshStandardMaterial({
      color: sourcePebble.material.color.getHex(),
      roughness: 0.95,
    });
    heldPebbleMesh = new THREE.Mesh(heldGeo, heldMat);
    heldPebbleMesh.scale.set(1, 0.55, 1.1);
    // Anchor to the FP right hand so the fingers visually hold it — it rides
    // every reach/gesture the hand makes (and hides with the hands in TP).
    // Falls back to the old camera offset if the hands rig isn't up.
    if (active && active.hands && active.hands.right) {
      heldPebbleMesh.position.set(0, -0.055, -0.10);
      active.hands.right.add(heldPebbleMesh);
    } else {
      heldPebbleMesh.position.set(0.16, -0.20, -0.32);
      camera.add(heldPebbleMesh);
      if (!scene.children.includes(camera)) scene.add(camera);
    }
  }
  function hideHeldPebble() {
    if (heldPebbleMesh) {
      if (heldPebbleMesh.parent) heldPebbleMesh.parent.remove(heldPebbleMesh);
      heldPebbleMesh.geometry.dispose();
      heldPebbleMesh.material.dispose();
      heldPebbleMesh = null;
    }
  }

  // Active flying pebble (the one the user just threw)
  let flyingPebble = null;     // { mesh, vel: Vector3 }

  // Raycaster for picking up pebbles
  const wRaycaster = new THREE.Raycaster();
  const wMouse = new THREE.Vector2();
  let wCanvas = null;
  let wDownX = 0, wDownY = 0, wDownT = 0, wPid = -1;
  function bindWaterClicks() {
    wCanvas = document.querySelector("#stage canvas");
    if (!wCanvas) return;
    wCanvas.addEventListener("pointerdown", (e) => {
      wDownX = e.clientX; wDownY = e.clientY;
      wDownT = performance.now(); wPid = e.pointerId;
    });
    wCanvas.addEventListener("pointerup", (e) => {
      if (e.pointerId !== wPid) return;
      const dx = e.clientX - wDownX, dy = e.clientY - wDownY;
      if (Math.hypot(dx, dy) > 6 || performance.now() - wDownT > 350) return;
      const rect = wCanvas.getBoundingClientRect();
      wMouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      wMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      wRaycaster.setFromCamera(wMouse, camera);
      // First check: did we click an unheld pebble?
      const pebbleHits = wRaycaster.intersectObjects(pebbles, false);
      if (pebbleHits.length > 0 && !heldPebble) {
        const target = pebbleHits[0].object;
        // Reach-down beat (run by update()): the body dips and the FP hand
        // extends to the stone on the sand — the stone only appears in the
        // hand once the fingers get there, instead of teleporting a metre up
        // to a floating camera offset. heldPebble is claimed up front so a
        // second tap can't double-grab mid-reach.
        heldPebble = target;
        pebbleActionAt = performance.now();
        // Start the crouch-and-reach sequence (runs in update()) — the stone
        // stays on the sand until the hand actually gets there.
        pickupPhase = 1; pickupT = 0;
        pickupPt.copy(target.position);
        if (window.PhobiaFX && window.PhobiaFX.firePulse) window.PhobiaFX.firePulse();
        if (window.PhobiaVoice && Math.random() < 0.4) {
          window.PhobiaVoice.speak("A small stone in your hand. Notice the weight.");
        }
        return;
      }
      // Second check: if holding a pebble + clicked anywhere on the water
      // surface, throw it. Default click already spawns a splash ring; the
      // pebble adds a real arcing throw with a heavier splash on landing.
      // (heldPebbleMesh exists only once the pickup reach has closed the
      // fingers around the stone — no throwing mid-crouch.)
      if (heldPebble && heldPebbleMesh) {
        pebbleActionAt = performance.now();
        // Compute target world position from the click ray hitting y=waterY
        const ray = wRaycaster.ray;
        if (ray.direction.y < -0.05) {
          const t2 = (waterY - ray.origin.y) / ray.direction.y;
          const tx = ray.origin.x + ray.direction.x * t2;
          const tz = ray.origin.z + ray.direction.z * t2;
          // Spawn a flying pebble at hand position
          const flyMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.07, 12, 10),
            heldPebbleMesh.material.clone()
          );
          flyMesh.scale.set(1, 0.55, 1.1);
          const startW = new THREE.Vector3();
          heldPebbleMesh.getWorldPosition(startW);
          flyMesh.position.copy(startW);
          scene.add(flyMesh);
          // Throw velocity — gravity-driven arc to (tx, waterY, tz)
          const ddx = tx - startW.x, ddz = tz - startW.z;
          const dist = Math.hypot(ddx, ddz);
          const T = Math.max(0.5, dist * 0.20);
          const g = 9.8;
          const vy = (g * T / 2) + 1.6;
          flyingPebble = {
            mesh: flyMesh,
            vel: new THREE.Vector3(ddx / T, vy, ddz / T),
            target: { x: tx, z: tz },
          };
          // Remove the source pebble + clear held state
          scene.remove(heldPebble);
          heldPebble.geometry.dispose();
          heldPebble.material.dispose();
          const idx = pebbles.indexOf(heldPebble);
          if (idx >= 0) pebbles.splice(idx, 1);
          heldPebble = null;
          hideHeldPebble();
          if (window.PhobiaFX && window.PhobiaFX.firePulse) window.PhobiaFX.firePulse();
        }
      }
    });
  }
  setTimeout(bindWaterClicks, 60);

  resultObj = {
    controls: {
      mode: "walkable",
      // Spawn back from the shoreline so the user has to walk forward to
      // wade in — the approach itself is the exposure for water phobia.
      initialPos: [0, 0, shoreZ + 1.8],
      initialYaw: 0,
      initialPitch: -0.10,            // looking forward toward the water
      bounds: { minX: -3, maxX: 3, minZ: deepZ, maxZ: shoreZ + 2.2 },
      speed: 0.9,                     // wading is slower than walking
      lookSpeed: 0.004,
      // First-person by default so the water rises up YOUR view as you wade in,
      // instead of watching a doll wade. 3rd-person toggle still available.
      preferredCameraMode: "fp",
      // Over-the-shoulder framing (used only if the user toggles to 3rd person).
      tpShoulder: 0.6, tpDistance: 3.9, tpHeight: 0.45,
    },
    hands: { skinColor: 0xd4a07a, sleeveColor: 0x4a5d8a },
    bloom: { strength: 0.3, threshold: 0.95 },
    ssao: false,                   // water surface + sky look worse with AO
    // Spawn is on dry sand — update() flips this to "splash" only once the
    // water is genuinely around the ankles (a static "splash" made the user
    // audibly wade while still on the beach).
    surface: "soft",
    interact(controls) {
      const z = controls ? controls.position.z : shoreZ;
      const k = Math.max(0, Math.min(1, (shoreZ - z) / (shoreZ - deepZ)));
      const depth = k * maxDepth;
      // Same visible-waterline coupling as update(): the hint must agree with
      // where the surface actually laps the body, not just the wade slope.
      const visDepth = Math.max(0, waterY - ((controls ? controls.position.y : 0) - 1.0));
      const effDepth = Math.max(depth, visDepth);
      if (effDepth > 0.05) {
        return { gesture: "paddle", hint: `${depthLabel(effDepth)} · click to splash · walk back any time` };
      }
      return { gesture: "rest", hint: "walk forward to wade in · click to splash" };
    },
    onClick() {
      // Suppress the generic tap-splash when this same tap was consumed by a
      // pebble pickup/throw (the water canvas handler fires on the same event),
      // otherwise lifting a stone off the dry beach also splashed the water.
      if (performance.now() - pebbleActionAt < 250) return;
      // Spawn a ripple in front of the camera at water level
      const ahead = 1.5;
      const yaw = (active && active.controls) ? active.controls.yaw : 0;
      const cx = (active && active.controls) ? active.controls.position.x : 0;
      const cz = (active && active.controls) ? active.controls.position.z : 0;
      const x = cx - Math.sin(yaw) * ahead + (Math.random() - 0.5) * 0.6;
      const z = cz - Math.cos(yaw) * ahead + (Math.random() - 0.5) * 0.6;
      const ring = new THREE.Mesh(splashGeo, splashMat.clone());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, waterY + 0.01, z);
      scene.add(ring);
      splashes.push({ mesh: ring, t0: waterT });
      if (window.PhobiaAudio && window.PhobiaAudio.splash) {
        try { window.PhobiaAudio.splash(0.9, { x, y: waterY + 0.05, z }); } catch {}
      }
      for (const f of fish) {
        const dx = f.position.x - x;
        const dz = f.position.z - z;
        if (Math.hypot(dx, dz) < 4) f.userData.scared = 1.0;
      }
    },
    update(t, controls, dt) {
      if (controls) { waterControls = controls; wireWaterCmds(); }
      waterMat.uniforms.time.value = t;
      waterT = t;   // so onClick (no `t` in scope) can stamp splash rings in scene-time
      // ---- Wading depth ----
      // Camera y descends linearly with z from shore to deepest point.
      // We override controls.position.y so the body / hands also follow.
      const z = controls ? controls.position.z : shoreZ;
      const k = Math.max(0, Math.min(1, (shoreZ - z) / (shoreZ - deepZ)));
      const depth = k * maxDepth;
      if (controls) controls.position.y = -depth;
      const dW = dt || 0.016;
      // Depth the EYE actually sees. The water plane sits at waterY while the
      // feet stand 1 m below the eye (beach at y=-1, spawn eye at 0) — on the
      // deep rungs the surface visibly laps the chest at the shoreline while
      // the slope-derived depth still reads 0. Label, entry splash, footstep
      // surface, fear and posture all follow whichever of the two is wetter,
      // so the HUD never says "On shore" with water at your chin.
      const visDepth = Math.max(0, waterY - ((controls ? controls.position.y : 0) - 1.0));
      const effDepth = Math.max(depth, visDepth);
      // Footsteps match the ground: splashy only once you're actually in the
      // water — the dry sand at spawn crunches soft instead of wading audibly.
      if (controls) controls.opts.surface = effDepth > 0.05 ? "splash" : "soft";
      // First time the user actually steps into the water → splash + voice cue
      if (lastWaterEntryZ === null && controls && effDepth > 0.05) {
        lastWaterEntryZ = z;
        if (window.PhobiaAudio && window.PhobiaAudio.splash) {
          try { window.PhobiaAudio.splash(0.5, { x: controls.position.x, y: waterY, z }); } catch {}
        }
        if (window.PhobiaVoice) window.PhobiaVoice.speak("First step. The water meets your skin. Notice that you can step back any time.");
      } else if (lastWaterEntryZ !== null && effDepth <= 0.02) {
        lastWaterEntryZ = null;
      }

      // ---- The body displaces water ----
      // A pulsing bow-wave ring rides at the waterline around the body, and
      // while there's movement input a fresh expanding ring + a small step
      // splash fire every ~0.4 s. The surface finally reacts to being waded
      // through instead of letting the body pass like a ghost.
      if (controls && effDepth > 0.08) {
        if (!wadeRing) {
          wadeRing = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.34, 32), splashMat.clone());
          wadeRing.rotation.x = -Math.PI / 2;
          scene.add(wadeRing);
        }
        wadeRing.visible = true;
        wadeRing.position.set(controls.position.x, waterY + 0.015, controls.position.z);
        wadeRing.scale.setScalar(1 + Math.sin(t * 2) * 0.12 + Math.min(0.8, effDepth * 0.3));
        wadeRing.material.opacity = 0.22 + Math.sin(t * 2) * 0.06;
        wadeStepT -= dW;
        if (wadeStepT <= 0 && controls.hasMoveInput && controls.hasMoveInput()) {
          wadeStepT = 0.4;
          const ring = new THREE.Mesh(splashGeo, splashMat.clone());
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(controls.position.x, waterY + 0.01, controls.position.z);
          scene.add(ring);
          splashes.push({ mesh: ring, t0: t });
          if (window.PhobiaAudio && window.PhobiaAudio.splash) {
            try { window.PhobiaAudio.splash(0.15 + effDepth * 0.2, { x: controls.position.x, y: waterY, z: controls.position.z }); } catch {}
          }
        }
      } else if (wadeRing) {
        wadeRing.visible = false;
      }

      // ---- Pebble pickup: crouch + reach, then lift ----
      // Timeline: eye dips + right hand drives to the stone (0.30 s), fingers
      // close (stone leaves the sand and appears in the hand, 0.22 s), body
      // rises (0.25 s). setEyeDrop / setReachTarget do the embodied work.
      if (pickupPhase > 0 && controls) {
        pickupT += dW;
        const DIP = 0.30, HOLD = 0.22, RISE = 0.25;
        if (controls.setEyeDrop) {
          const dropK = pickupT < DIP ? (pickupT / DIP)
                      : pickupT < DIP + HOLD ? 1
                      : Math.max(0, 1 - (pickupT - DIP - HOLD) / RISE);
          controls.setEyeDrop(dropK * 0.45);
        }
        if (active && active.hands && active.hands.setReachTarget && pickupT < DIP + HOLD) {
          active.hands.setReachTarget(pickupPt, { hand: "right", grip: "wrap", curl: 1.2, maxReach: 0.9 });
        }
        if (pickupPhase === 1 && pickupT >= DIP + HOLD * 0.5) {
          pickupPhase = 2;
          if (heldPebble) { heldPebble.visible = false; showHeldPebble(heldPebble); }
        }
        if (pickupT >= DIP + HOLD && active && active.hands && active.hands.clearReachTarget) {
          active.hands.clearReachTarget();
        }
        if (pickupT >= DIP + HOLD + RISE) {
          pickupPhase = 0;
          if (controls.setEyeDrop) controls.setEyeDrop(0);
        }
      }

      // ---- Feed fear state from water depth + walking forward ----
      // Without this, the in-zone hold timer would count wall-clock for the
      // water scene since fear stays at zero. Depth maps directly to fear:
      // ankle-deep = mild, waist+ = high.
      if (controls && window.PhobiaFear) {
        const fearProx = Math.max(0, Math.min(1, effDepth / 1.6));   // 0..1.6 m
        window.PhobiaFear.setInput("proximity", fearProx * 0.85);
        // Gaze toward the water (slightly down) adds to fear input
        const lookDownAmt = Math.max(0, Math.min(1, -controls.pitch / 0.6));
        window.PhobiaFear.setInput("gaze", lookDownAmt * 0.5 * fearProx);
        const isAway = effDepth < 0.05;
        window.PhobiaFear.bumpAvoidance(dt || 0.016, isAway);
      }

      // ---- Submersion + breath (the drowning beat) ----
      submersion = Math.max(0, Math.min(1, (depth - HEAD_DEPTH) / 0.5));
      // Surfacing leaves water on the lens: when the head comes up, droplets
      // and blur linger for ~2 s and drain away, instead of the overlay
      // snapping bone-dry in one 0.2 s transition.
      if (prevSubmersion >= 0.05 && submersion < 0.05) dripT = 2.0;
      prevSubmersion = submersion;
      if (uwOverlay) {
        if (submersion >= 0.05) {
          uwOverlay.style.opacity = String(submersion * 0.95);
          uwOverlay.style.backdropFilter = uwOverlay.style.webkitBackdropFilter = "blur(1.6px)";
        } else if (dripT > 0) {
          dripT = Math.max(0, dripT - dW);
          uwOverlay.style.opacity = String(dripT * 0.15);
          const bl = "blur(" + (dripT * 1.2).toFixed(2) + "px)";
          uwOverlay.style.backdropFilter = uwOverlay.style.webkitBackdropFilter = bl;
        } else {
          uwOverlay.style.opacity = "0";
        }
      }
      // Murky underwater fog only while the head is actually under — the shore
      // stays clear (the old static murky fog drowned the whole scene at spawn).
      const wantMurky = submersion > 0.05;
      if (wantMurky && scene.fog !== murkyFog) { scene.fog = murkyFog; scene.background = new THREE.Color(0x09435f); }
      else if (!wantMurky && scene.fog !== clearFog) { scene.fog = clearFog; scene.background = skyBg; }
      if (submersion > 0.05) {
        breath = Math.max(0, breath - dW * 0.10);                 // ~10 s of air
        if (window.PhobiaFear) window.PhobiaFear.setInput("proximity", Math.min(1, 0.85 + (1 - breath) * 0.15));
        if (breath < 0.35 && !breathWarned) {
          breathWarned = true;
          if (window.PhobiaVoice) window.PhobiaVoice.speak("You're under. Your chest tightens for air. Rise back up — the surface is right there.", { urgent: true, audible: true });
        }
        // Out of air: gently draw the player back toward shallower water so the
        // state resolves ("time to come up") instead of parking at a stuck 0%.
        if (breath <= 0.001) {
          if (controls) controls.position.z += dW * 1.1;          // drift toward shore
          if (!breathReliefShown) {
            breathReliefShown = true;
            if (window.PhobiaVoice) window.PhobiaVoice.speak("Let yourself rise. Head above water. You can breathe.", { urgent: true, audible: true });
          }
        }
        camera.position.y += Math.sin(t * 0.8) * 0.04;            // buoyant lift
      } else {
        if (breath < 1) breath = Math.min(1, breath + dW * 0.5);  // recover fast at the surface
        breathWarned = false;
        breathReliefShown = false;
      }
      if (breathHud2) {
        breathHud2.style.opacity = submersion > 0.05 ? "1" : "0";
        const bp = Math.round(breath * 100);
        breathHud2.querySelector(".trust-pct").textContent = bp + "%";
        const bf = breathHud2.querySelector(".trust-bar-fill");
        bf.style.width = bp + "%";
        bf.style.background = breath < 0.3 ? "#e85a5a" : "#5fd0e8";
      }

      // ---- Body posture by water depth ----
      // Real wading body language:
      //   ankle-deep: arms slightly out for balance, normal stance
      //   knee-deep: arms wider, slight forward lean
      //   waist-deep: arms held high (out of water), squat begins
      //   chest-deep: full crouch (water hides legs anyway)
      //   over-head: swimming pose — full forward, arms paddling (not modelled here)
      // Slow the walk cycle in deep water to read as "fighting current".
      if (active && active.body && active.body.setPosture && controls) {
        const armSpread = Math.min(1.0, effDepth * 0.5);            // 0..1
        const lean = Math.min(0.45, effDepth * 0.18);                // mild forward lean
        const crouch = effDepth > 0.6 ? Math.min(0.4, (effDepth - 0.6) * 0.35) : 0;
        const reach = 0;                                            // no railing to grab
        active.body.setPosture({ armSpread, lean, crouch, reach });
      }
      // Update HUD — visible-waterline depth, so the label agrees with the eye
      if (wadeDepthHud) {
        wadeDepthHud.querySelector(".trust-name").textContent = depthLabel(effDepth);
        wadeDepthHud.querySelector(".trust-pct").textContent = effDepth.toFixed(2) + " m";
        wadeDepthHud.querySelector(".trust-bar-fill").style.width =
          Math.round((effDepth / 2.0) * 100) + "%";
      }
      // Gentle bob — stronger at deep levels (additive on top of user look).
      // Apply AFTER setting controls.position.y so bob is a small add-on.
      camera.position.y += Math.sin(t * 0.9) * 0.05 * fill;
      camera.position.x += Math.sin(t * 0.6) * 0.04 * fill;
      camera.rotation.z += Math.sin(t * 0.7) * 0.008 * fill;
      // Animate fish — swim back and forth, dart when scared
      const dtFish = dt || 0.016;
      // 60 fps-tuned per-frame amounts (fish wiggle, bubble rise/sway below)
      // scale by dt so a 120 Hz display doesn't run the water twice as fast.
      const fpsAdj = dtFish * 60;
      for (const f of fish) {
        const speedMult = 1 + f.userData.scared * 4;
        if (f.position.x > 14 && f.userData.dir !== -1) { f.userData.dir = -1; f.userData.turnT = 0.4; }
        if (f.position.x < -14 && f.userData.dir !== 1) { f.userData.dir = 1; f.userData.turnT = 0.4; }
        // Ease the flip over ~0.4 s: the body sweeps edge-on through the turn
        // (and forward speed dips with it) instead of popping 180° in a frame.
        const faceSx = f.userData.dir > 0 ? 1.6 : -1.6;
        if (f.userData.turnT > 0) {
          f.userData.turnT = Math.max(0, f.userData.turnT - dtFish);
          f.scale.x = faceSx * (1 - (f.userData.turnT / 0.4) * 2);
        } else {
          f.scale.x = faceSx;   // mirror along the (now long) X axis to face the swim direction
        }
        const swimEase = Math.min(1, Math.abs(f.scale.x) / 1.6 + 0.1);
        f.position.x += f.userData.vx * f.userData.dir * speedMult * swimEase * dtFish;
        // Wiggle a touch
        f.position.y += Math.sin(t * 4 + f.position.x * 0.3) * 0.002 * fpsAdj;
        // Decay scared state
        f.userData.scared = Math.max(0, f.userData.scared - dtFish * 1.5);
      }
      // Animate splash rings — expand and fade
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i];
        const age = t - s.t0;
        if (age > 2.0) {
          scene.remove(s.mesh);
          s.mesh.material.dispose();
          if (s.mesh.geometry !== splashGeo) s.mesh.geometry.dispose();  // thrown-pebble rings own their geometry
          splashes.splice(i, 1);
        } else {
          const k = age / 2.0;
          s.mesh.scale.setScalar(1 + k * 12);
          s.mesh.material.opacity = 0.6 * (1 - k);
        }
      }

      if (bubbles) {
        const pos = bubbles.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          pos.array[i * 3 + 1] += 0.04 * fpsAdj;
          pos.array[i * 3] += Math.sin(t + i) * 0.005 * fpsAdj;
          if (pos.array[i * 3 + 1] > waterY + 0.5) {
            pos.array[i * 3 + 1] = waterY - 12;
          }
        }
        pos.needsUpdate = true;
      }
      for (let i = 0; i < beams.length; i++) {
        beams[i].material.opacity = 0.04 + Math.sin(t * 0.7 + i) * 0.025;
      }
      // Seaweed sway — bottom anchored, top tilts with the wave
      for (const w of seaweed) {
        w.rotation.z = Math.sin(t * 0.8 + w.userData.phase) * 0.15;
      }
      // ---- Flying pebble physics ----
      // Gravity-driven arc; on contact with water surface, spawn a bigger
      // splash ring + spatial splash sound + scare nearby fish, then sink
      // and remove after 1 s.
      if (flyingPebble) {
        const fp = flyingPebble;
        fp.vel.y -= 9.8 * dtFish;
        fp.mesh.position.x += fp.vel.x * dtFish;
        fp.mesh.position.y += fp.vel.y * dtFish;
        fp.mesh.position.z += fp.vel.z * dtFish;
        fp.mesh.rotation.x += dtFish * 8;
        fp.mesh.rotation.z += dtFish * 6;
        if (fp.mesh.position.y <= waterY + 0.02) {
          // Splash — spawn a larger ring than a normal click, plus a smaller
          // secondary ring for that "kerplunk" double-ripple look.
          const sx = fp.mesh.position.x, sz = fp.mesh.position.z;
          for (const radius of [0.10, 0.06]) {
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(radius, radius * 1.4, 32),
              splashMat.clone()
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(sx, waterY + 0.012, sz);
            scene.add(ring);
            splashes.push({ mesh: ring, t0: t });
          }
          if (window.PhobiaAudio && window.PhobiaAudio.splash) {
            try { window.PhobiaAudio.splash(1.3, { x: sx, y: waterY + 0.05, z: sz }); } catch {}
          }
          // Scare nearby fish with a wider radius than a normal click
          for (const f of fish) {
            const dxf = f.position.x - sx;
            const dzf = f.position.z - sz;
            if (Math.hypot(dxf, dzf) < 6) f.userData.scared = 1.0;
          }
          // Pebble sinks below the surface, then remove
          fp.mesh.position.y = waterY - 0.05;
          setTimeout(() => {
            if (!flyingPebble || flyingPebble.mesh !== fp.mesh) return;
            scene.remove(fp.mesh);
            fp.mesh.geometry.dispose(); fp.mesh.material.dispose();
            flyingPebble = null;
          }, 1000);
          flyingPebble.landed = true;
          flyingPebble = null;
        }
      }
    },
    dispose() {
      const stage = document.getElementById("stage");
      if (stage) {
        stage.querySelectorAll(".trust-hud").forEach(h => h.remove());
      }
      if (uwOverlay && uwOverlay.parentNode) uwOverlay.parentNode.removeChild(uwOverlay);
      if (wadeRing) {
        scene.remove(wadeRing);
        wadeRing.geometry.dispose();
        wadeRing.material.dispose();
        wadeRing = null;
      }
      // Clean up held pebble + flying pebble + scattered pebbles on unmount
      if (heldPebbleMesh) {
        if (heldPebbleMesh.parent) heldPebbleMesh.parent.remove(heldPebbleMesh);
        heldPebbleMesh.geometry.dispose();
        heldPebbleMesh.material.dispose();
        heldPebbleMesh = null;
      }
    },
  };
  return resultObj;
}

export { setupWater };
