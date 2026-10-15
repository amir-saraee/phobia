// Storms — a legacy realm, behind LAUNCH_OPEN (?all=1 to play).

import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { IS_LOW_POWER } from "../renderer.js";

// ---------- Storms (porch / window looking out) ----------
function setupStorms(scene, camera, level) {
  const intensity = level.intensity != null ? level.intensity : 0.5;

  // Cool, slightly blue-tinted night sky. Important: keep it on the dark side
  // so the lightning flash reads as a flash, not as an explosion.
  const skyBase = new THREE.Color(0x0e1220);
  scene.background = skyBase.clone();
  scene.fog = new THREE.Fog(0x0e1220, 14 - intensity * 5, 90 - intensity * 30);   // storm closes in at high intensity

  scene.add(new THREE.AmbientLight(0x3a4050, 0.30));
  // Distant ambient flash — pulses softly during a strike. Kept moderate so
  // it doesn't wash the whole scene to white. The visible bolt geometry
  // (added below) carries most of the sense of "lightning".
  const lightning = new THREE.DirectionalLight(0xc8d4f0, 0);
  lightning.position.set(8, 20, -15);
  scene.add(lightning);

  // ---- Branching bolt geometry ----
  // A real zigzag line drawn from the clouds to a ground point. We rebuild
  // its points each strike with a fresh random branch pattern, then fade it
  // out over ~180ms. This is what carries "lightning" visually.
  const boltMat = new THREE.LineBasicMaterial({
    color: 0xeef2ff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const boltGeo = new THREE.BufferGeometry();
  // Pre-allocate a generous buffer (will be re-filled per strike)
  const BOLT_MAX = 256;
  const boltPos = new Float32Array(BOLT_MAX * 3);
  boltGeo.setAttribute("position", new THREE.BufferAttribute(boltPos, 3));
  boltGeo.setDrawRange(0, 0);
  const bolt = new THREE.LineSegments(boltGeo, boltMat);
  bolt.frustumCulled = false;
  scene.add(bolt);
  // A subtle point light at the bolt's endpoint for ground glow
  const boltPoint = new THREE.PointLight(0xb4c8ff, 0, 25, 1.6);
  boltPoint.position.set(0, 5, -30);
  scene.add(boltPoint);

  function generateBolt() {
    // Pick a random distant strike location on the horizon
    const tx = (Math.random() - 0.5) * 60;
    // Closer strikes at higher intensity (a distant grumble vs. directly
    // overhead). `near` = how close the nearest possible strike can land.
    const near = 12 + (1 - intensity) * 18;
    const tz = -near - Math.random() * 25;
    // Top of the bolt: high up, slightly offset from the strike
    const sx = tx + (Math.random() - 0.5) * 6;
    const sy = 18 + Math.random() * 4;
    const sz = tz + (Math.random() - 0.5) * 6;
    // Build a jagged main path from top → ground (12 segments)
    const pts = [];
    const main = [];
    const segs = 12;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      // Lerp top → ground with random sideways jitter
      const x = sx + (tx - sx) * u + (Math.random() - 0.5) * 1.4;
      const y = sy + (-1 - sy) * u;
      const z = sz + (tz - sz) * u + (Math.random() - 0.5) * 1.4;
      main.push([x, y, z]);
    }
    // Convert main path to line-segments (pairs of points)
    for (let i = 0; i < main.length - 1; i++) {
      pts.push(main[i], main[i + 1]);
    }
    // Two short branches splitting off the main bolt
    for (let b = 0; b < 2; b++) {
      const startIdx = 2 + Math.floor(Math.random() * (main.length - 5));
      const start = main[startIdx];
      let cx = start[0], cy = start[1], cz = start[2];
      const branchLen = 3 + Math.floor(Math.random() * 3);
      const bxDir = (Math.random() - 0.5) * 1.2;
      const bzDir = (Math.random() - 0.5) * 1.2;
      for (let k = 0; k < branchLen; k++) {
        const nx = cx + bxDir + (Math.random() - 0.5) * 0.8;
        const ny = cy - 1 - Math.random() * 0.8;
        const nz = cz + bzDir + (Math.random() - 0.5) * 0.8;
        pts.push([cx, cy, cz], [nx, ny, nz]);
        cx = nx; cy = ny; cz = nz;
      }
    }
    // Write to buffer
    const count = Math.min(pts.length, BOLT_MAX);
    for (let i = 0; i < count; i++) {
      boltPos[i * 3]     = pts[i][0];
      boltPos[i * 3 + 1] = pts[i][1];
      boltPos[i * 3 + 2] = pts[i][2];
    }
    boltGeo.setDrawRange(0, count);
    boltGeo.attributes.position.needsUpdate = true;
    // Position the ground-glow point light at the bolt's endpoint
    const last = main[main.length - 1];
    boltPoint.position.set(last[0], 0, last[2]);
  }

  // Wet pavement — low roughness + high envMapIntensity so the ground catches
  // reflections of the sky / lightning bolts. Combined with the puddle
  // Reflector this gives the floor a real "rain-soaked" sheen.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({
      color: 0x1a1d24,
      roughness: 0.30,
      metalness: 0.55,
      envMapIntensity: 1.6,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  scene.add(ground);

  // A puddle in front of the user — a real Reflector that mirrors the scene
  // (so the user sees themselves looking down). Disabled on low-power devices.
  let puddle = null;
  if (!IS_LOW_POWER) {
    puddle = new Reflector(
      new THREE.CircleGeometry(2.5, 64),
      {
        textureWidth:  512,
        textureHeight: 512,
        color: 0x445060,
      }
    );
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.set(0, -0.99, -2.0);     // just in front, sitting on the ground
    scene.add(puddle);
  }

  // Trees (silhouettes)
  for (let i = 0; i < 16; i++) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 2, 6),
      new THREE.MeshStandardMaterial({ color: 0x141a18 }));
    const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x1a2418 }));
    trunk.position.set((Math.random() - 0.5) * 80, 0, -8 - Math.random() * 50);
    leaves.position.set(trunk.position.x, 1.6, trunk.position.z);
    scene.add(trunk); scene.add(leaves);
  }

  // Porch roof (we're under shelter)
  const porch = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.2, 4),
    new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.85 })
  );
  porch.position.set(0, 1.4, 1);
  scene.add(porch);
  // Posts
  for (const sx of [-3.5, 3.5]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 2.6, 0.18),
      new THREE.MeshStandardMaterial({ color: 0x32343a })
    );
    post.position.set(sx, 0.1, -1);
    scene.add(post);
  }
  // House behind us
  const house = new THREE.Mesh(
    new THREE.BoxGeometry(40, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0x222730 })
  );
  house.position.set(0, 3, 5);
  scene.add(house);

  // Rain particles
  const N = Math.round(320 + intensity * 620);   // light drizzle → heavy downpour
  const rainPos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    rainPos[i*3]   = (Math.random() - 0.5) * 40;
    rainPos[i*3+1] = Math.random() * 20;
    rainPos[i*3+2] = -Math.random() * 40;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({
    color: 0x7a8aa0, size: 0.045 + intensity * 0.025, transparent: true,
    opacity: 0.38 + intensity * 0.34,    // faint drizzle at low intensity, dense at high
  }));
  scene.add(rain);

  // Strike-flash state. `flash` drives the broad sky glow; `boltLife` drives
  // the visible bolt geometry's opacity (separate envelope so the bolt fades
  // faster than the sky glow, which matches what real lightning looks like).
  let nextStrike = 2 + (1 - intensity) * 6;
  let flash = 0;
  let boltLife = 0;
  let restrikePending = false;
  // Photosensitivity safety: users of an anxiety tool self-select for elevated
  // odds of comorbid photosensitive epilepsy, and rapid full-field white flashes
  // (WCAG 2.3.1 three-flash) are the classic trigger. When reduce-motion is set
  // (app flag OR OS), soften the flashes and drop the 70 ms restrike double-flash.
  const seizureSafe = (() => {
    try {
      const app = localStorage.getItem("fobia.reducedMotion") === "1";
      const os = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      return app || os;
    } catch { return false; }
  })();
  let shakeAmt = 0;            // concussion from a close strike's thunder
  let camFlashTint = 0;
  let lastFlashT = -10;

  // ----- Side table with an unlit candle + a matchbook -----
  // Both visible from the start. Real human action: click the matchbook,
  // a flame appears, click the candle within ~5 s and it lights.
  const tableGroup = new THREE.Group();
  tableGroup.position.set(2.0, -0.50, -0.4);
  scene.add(tableGroup);
  const tableTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.04, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.7 })
  );
  tableGroup.add(tableTop);
  for (const [tx, tz] of [[-0.30, -0.20], [0.30, -0.20], [-0.30, 0.20], [0.30, 0.20]]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.50, 8),
      new THREE.MeshStandardMaterial({ color: 0x4a3018, roughness: 0.85 })
    );
    leg.position.set(tx, -0.27, tz);
    tableGroup.add(leg);
  }

  // Unlit candle (visible on the table from the start)
  const candle = new THREE.Group();
  const candleStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.05, 0.20, 14),
    new THREE.MeshStandardMaterial({ color: 0xe8dfc6, roughness: 0.85 })
  );
  candleStick.position.y = 0.10;
  candle.add(candleStick);
  // Wick (small dark cylinder on top)
  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.004, 0.003, 0.022, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.95 })
  );
  wick.position.y = 0.215;
  candle.add(wick);
  // Flame (hidden until lit)
  const candleFlame = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 14, 10),
    new THREE.MeshBasicMaterial({
      color: 0xffe0a0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  candleFlame.scale.set(1, 1.6, 1);
  candleFlame.position.y = 0.245;
  candle.add(candleFlame);
  candle.position.set(-0.15, 0.025, 0);
  tableGroup.add(candle);
  // Warm point light (intensity 0 until lit)
  const candleLight = new THREE.PointLight(0xffb060, 0, 4);
  candleLight.position.set(2.0 - 0.15, -0.50 + 0.27, -0.4);
  scene.add(candleLight);

  // Matchbook on the table — a small box with a striker stripe
  const matchbook = new THREE.Group();
  const mbBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.04, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x7c3a2a, roughness: 0.85 })
  );
  matchbook.add(mbBody);
  // Striker stripe (slightly darker / coarser)
  const mbStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.005, 0.018),
    new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 1.0 })
  );
  mbStripe.position.set(0, 0.022, 0.018);
  matchbook.add(mbStripe);
  matchbook.position.set(0.15, 0.045, 0.05);
  tableGroup.add(matchbook);

  // Match-state: when the user clicks the matchbook a small flame appears
  // in their hand for ~5 seconds. Clicking the candle while the match is
  // lit transfers the flame.
  let candleLit = false;
  let matchLit = 0;     // 0..1, decays after lighting

  // Visible "match in hand" mesh attached to camera
  const handMatch = new THREE.Group();
  const handMatchStick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.0045, 0.10, 8),
    new THREE.MeshStandardMaterial({ color: 0xb8987a, roughness: 0.95 })
  );
  handMatchStick.rotation.z = -0.4;
  handMatch.add(handMatchStick);
  const handMatchFlameMat = new THREE.MeshBasicMaterial({
    color: 0xffe0a0, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const handMatchFlame = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), handMatchFlameMat);
  handMatchFlame.scale.set(0.8, 1.6, 0.8);
  handMatchFlame.position.set(0.045, 0.055, 0);
  handMatch.add(handMatchFlame);
  handMatch.position.set(0.18, -0.16, -0.30);
  handMatch.visible = false;
  camera.add(handMatch);
  if (!scene.children.includes(camera)) scene.add(camera);

  function strikeMatch() {
    if (matchLit > 0) return;
    matchLit = 1.0;
    handMatch.visible = true;
    handMatchFlameMat.opacity = 1;
    if (window.PhobiaAudio && window.PhobiaAudio.indicatorClick) {
      try { window.PhobiaAudio.indicatorClick(); } catch {}
    }
    if (window.PhobiaVoice) window.PhobiaVoice.speak("A small flame. Bring it to the candle.");
  }
  function lightCandleNow() {
    if (candleLit || matchLit <= 0.05) return;
    candleLit = true;
    matchLit = 0;
    handMatchFlameMat.opacity = 0;
    handMatch.visible = false;
    candleFlame.material.opacity = 1;
    candleLight.intensity = 1.4;
    if (window.PhobiaVoice) window.PhobiaVoice.speak("A small light. Notice how warm it is. Storms are loud, but this is your room.");
  }

  // ----- Click-on-prop raycaster (matchbook + candle) -----
  const stRaycaster = new THREE.Raycaster();
  const stMouse = new THREE.Vector2();
  let stCanvas = null;
  let stDownX = 0, stDownY = 0, stDownT = 0, stPid = -1;
  function bindStormsClicks() {
    stCanvas = document.querySelector("#stage canvas");
    if (!stCanvas) return;
    stCanvas.addEventListener("pointerdown", (e) => {
      stDownX = e.clientX; stDownY = e.clientY;
      stDownT = performance.now(); stPid = e.pointerId;
    });
    stCanvas.addEventListener("pointerup", (e) => {
      if (e.pointerId !== stPid) return;
      const dx = e.clientX - stDownX, dy = e.clientY - stDownY;
      if (Math.hypot(dx, dy) > 6 || performance.now() - stDownT > 350) return;
      const rect = stCanvas.getBoundingClientRect();
      stMouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      stMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      stRaycaster.setFromCamera(stMouse, camera);
      // Try matchbook first
      const mbHits = stRaycaster.intersectObject(matchbook, true);
      if (mbHits.length > 0) { strikeMatch(); return; }
      // Then candle
      const cHits = stRaycaster.intersectObject(candle, true);
      if (cHits.length > 0) {
        if (matchLit > 0.05) lightCandleNow();
        else if (window.PhobiaVoice) window.PhobiaVoice.speak("Click the matchbook first to strike a match.");
      }
    });
  }
  setTimeout(bindStormsClicks, 60);

  camera.fov = 65;
  camera.updateProjectionMatrix();

  let stormsControls = null;
  // Set on unmount so the deferred thunder/re-strike callbacks scheduled inside
  // update() don't fire against a torn-down scene (e.g. thunder booming seconds
  // after the user has already left the storm).
  let disposed = false;
  function wireStormsCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="storms"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        if (btn.dataset.cmd === "count") {
          // Tell the user how far the most recent strike was
          // (using the time since last flash)
          if (window.PhobiaVoice) {
            const now = performance.now() / 1000;
            const elapsed = now - lastFlashT;
            const km = (elapsed / 3).toFixed(1);
            if (lastFlashT > 0) {
              // Surface the ACTUAL measured distance on screen (the reframe was
              // computing km then throwing it away). The spoken line stays a
              // recorded clip — a spoken number would fall back to robotic TTS.
              if (window.PhobiaFX && window.PhobiaFX.contextPrompt) {
                try { window.PhobiaFX.contextPrompt("That strike was about " + km + " km away.", 3600); } catch {}
              }
              window.PhobiaVoice.speak("That flash was kilometres away. The storm has a measure.");
            }
            else window.PhobiaVoice.speak("Watch for the next flash. Then count seconds. Each three is a kilometre.");
          }
        } else if (btn.dataset.cmd === "step-in") {
          const c = stormsControls; if (c) {
            const fromZ = c.position.z;
            let k = 0;
            const id = setInterval(() => {
              k += 0.05;
              if (k >= 1) { c.position.z = 0.6; clearInterval(id); return; }
              c.position.z = fromZ + (0.6 - fromZ) * k;
            }, 16);
          }
          if (window.PhobiaVoice) window.PhobiaVoice.speak("Stepped under the porch. The roof is solid.");
        } else if (btn.dataset.cmd === "candle") {
          // The button now does the chained gesture for users who can't
          // raycast (touch + screen-reader): strike → light in one click.
          if (!candleLit) {
            strikeMatch();
            setTimeout(lightCandleNow, 600);
          }
        }
      };
    });
  }
  setTimeout(wireStormsCmds, 0);

  return {
    controls: {
      mode: "lookOnly",
      initialPos: [0, 0, 0],
      initialYaw: 0,
      initialPitch: -0.05,
      lookSpeed: 0.0035,
      cameraModeLocked: "fp",          // looking out from inside the porch
    },
    hands: { sleeveColor: 0x36404a },
    // Mild bloom — enough to give the bolt a slight halo without smearing
    // the whole sky into a white-out on each strike.
    bloom: { strength: 0.35, threshold: 0.78 },
    ssao: false,    // sky/rain dominate; AO would noise up the rain particles
    update(t, controls, dt) {
      if (controls) stormsControls = controls;
      const d = dt || 0.016;
      // Animate rain — falls fast AND is blown sideways by the storm wind
      // (stronger at higher intensity) so it slants like wind-driven rain
      // instead of dropping straight down. Drops re-randomise x on respawn.
      const pos = rain.geometry.attributes.position;
      const windStep = (2 + intensity * 8) * d;
      for (let i = 0; i < N; i++) {
        pos.array[i*3+1] -= 22 * d;
        pos.array[i*3]   += windStep;
        if (pos.array[i*3+1] < -1) {
          pos.array[i*3+1] = 18;
          pos.array[i*3]   = (Math.random() - 0.5) * 40;
        }
      }
      pos.needsUpdate = true;

      // Candle flicker (intensity + flame scale) — only once it's been lit
      if (candleLit) {
        const flicker = 1 + Math.sin(t * 14) * 0.15 + (Math.random() - 0.5) * 0.1;
        candleLight.intensity = 1.4 * flicker;
        candleFlame.scale.set(1, 1.6 * flicker, 1);
      }
      // Match-in-hand decay (5 second life). The flame opacity tracks matchLit.
      if (matchLit > 0) {
        matchLit = Math.max(0, matchLit - d * 0.20);
        const mFlicker = 1 + Math.sin(t * 22) * 0.15 + (Math.random() - 0.5) * 0.1;
        handMatchFlameMat.opacity = matchLit;
        handMatchFlame.scale.set(0.8 * mFlicker, 1.6 * mFlicker, 0.8 * mFlicker);
        if (matchLit <= 0) {
          handMatch.visible = false;
        }
      }
      // Being IN the storm is the stimulus — the dread between strikes is
      // the phobia. Without a continuous baseline the fear meter sat at 0
      // except for a blip at each flash, so vignette/heartbeat/credit were
      // effectively dead. Strike spikes (pulseEvent below) ride on top.
      if (window.PhobiaFear) {
        window.PhobiaFear.setInput("proximity", 0.25 + intensity * 0.55);
      }
      // Lightning: strike every (3 + (1-intensity)*8) sec on average. Each
      // strike is a real branching bolt + a soft sky glow + a delayed thunder.
      if (t > nextStrike) {
        generateBolt();
        // Is this one CLOSE? Close strikes flash harder, boom almost at once,
        // and hit with a physical concussion (camera shake + a fear spike).
        const isClose = Math.random() < (0.22 + intensity * 0.5);
        flash = (isClose ? 0.8 : 0.45) + intensity * 0.3;
        if (seizureSafe) flash = Math.min(0.3, flash);   // soft, non-triggering glow
        boltLife = isClose ? 1.3 : 1.0;   // bolt geometry is bright at strike, fades fast
        lastFlashT = t;
        nextStrike = t + 3 + (1 - intensity) * 8 + Math.random() * 2;
        // Capture where this bolt actually struck so the thunder rolls in
        // from that direction. boltPoint already moved to the endpoint inside
        // generateBolt().
        const strikePos = {
          x: boltPoint.position.x,
          y: boltPoint.position.y + 4,
          z: boltPoint.position.z,
        };
        // Real lightning often re-strikes within 60-120 ms — schedule a small
        // secondary flicker on the same bolt path for that classic look.
        if (!seizureSafe && Math.random() < 0.6) {   // skip the 70ms restrike double-flash entirely
          restrikePending = true;
          setTimeout(() => {
            if (disposed || !restrikePending) return;
            restrikePending = false;
            boltLife = Math.max(boltLife, 0.7);
            flash = Math.max(flash, 0.55);
          }, 70 + Math.random() * 60);
        }
        // Thunder follows after a delay (sound is slower than light) and is
        // panned from the bolt's actual position — so a strike to the left
        // rumbles from your left.
        // Sound lags light. A CLOSE strike's boom is almost immediate and hits
        // like a physical wave — the concussion (shake + fear spike) fires WITH
        // the thunder, not the flash, so a near strike startles the way a real
        // one does. Distant strikes keep their long, gentle delay.
        const thunderDelay = isClose ? (160 + Math.random() * 220) : ((1 - intensity) * 4000 + 600);
        setTimeout(() => {
          if (disposed) return;
          if (window.PhobiaAudio && window.PhobiaAudio.thunder) {
            window.PhobiaAudio.thunder((isClose ? 0.95 : 0.4) + intensity * 0.25, true, strikePos);
          }
          if (isClose) {
            shakeAmt = Math.max(shakeAmt, 1.0);            // the concussion you feel
            if (!seizureSafe) flash = Math.max(flash, 0.65);  // boom re-light — the fear pulse below is preserved either way
            if (window.PhobiaFear) window.PhobiaFear.pulseEvent(0.7 + intensity * 0.2);
          }
        }, thunderDelay);
      }
      // Bolt opacity decays much faster than the sky glow — ~120 ms half-life.
      boltLife = Math.max(0, boltLife - d * 8.0);
      bolt.material.opacity = boltLife;
      boltPoint.intensity = boltLife * 1.5;
      // Sky glow decay — slower, like the air itself is briefly lit
      flash = Math.max(0, flash - d * 4.5);
      // Soft ambient flash. Capped well below pure white so it never washes
      // the scene out into "atomic explosion" territory.
      // Hard ceiling so no single frame approaches full white even without the
      // flag set (belt-and-suspenders safety floor); much tighter when seizureSafe.
      lightning.intensity = Math.min(seizureSafe ? 0.6 : 2.3, flash * (1.4 + intensity * 0.9));
      // Concussion shake from a close strike's thunder — sharp, decays fast.
      // Applied after the controls write the camera each frame, so it reads as
      // a jolt and resets cleanly (no drift).
      shakeAmt = Math.max(0, shakeAmt - d * 2.4);
      if (shakeAmt > 0.001) {
        const s = shakeAmt * shakeAmt;
        camera.position.x += (Math.random() - 0.5) * 0.13 * s;
        camera.position.y += (Math.random() - 0.5) * 0.11 * s;
        camera.rotation.z += (Math.random() - 0.5) * 0.022 * s;
      }
      // Camera tint is subtle and biased blue; capped at ~0.18.
      camFlashTint += (flash * 0.20 - camFlashTint) * 0.25;
      const r = 0.055 + camFlashTint * 0.6;
      const g = 0.071 + camFlashTint * 0.7;
      const b = 0.125 + camFlashTint * 1.0;
      scene.background.setRGB(r, g, b);
    },
    dispose() {
      // Stop any in-flight thunder / re-strike timers from firing after we
      // leave (their callbacks bail out on this flag).
      disposed = true;
    },
  };
}

export { setupStorms };
