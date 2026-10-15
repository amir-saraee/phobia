// Driving — a legacy realm, behind LAUNCH_OPEN (?all=1 to play).

import * as THREE from "three";

// ---------- Driving (car interior + road) ----------
function setupDriving(scene, camera, level) {
  const speed   = level.speed   != null ? level.speed   : 0.5;
  const traffic = level.traffic != null ? level.traffic : 0.3;
  const isRain  = (level.title || "").toLowerCase().includes("rain");

  scene.background = new THREE.Color(isRain ? 0x35404a : 0x6a7e8c);
  scene.fog = new THREE.Fog(scene.background, 25, 220);

  const sun = new THREE.DirectionalLight(0xfff5e0, isRain ? 0.6 : 1.4);
  sun.position.set(20, 30, 10);
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x88a0c0, 0x404048, 0.55));

  // Road — long plane stretching forward
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 600),
    new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.85 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, -1, -200);
  scene.add(road);
  // Lane dashes. polygonOffset pulls them toward the camera in the depth
  // buffer so they don't z-fight with the road plane way down the 400 m strip
  // (a 1 cm height gap isn't enough at that distance).
  const dashes = [];
  for (let z = 0; z > -400; z -= 8) {
    const dash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe89a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    );
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, -0.985, z);
    scene.add(dash);
    dashes.push(dash);
  }
  // Roadside reflector posts that whip past — the strongest ego-motion cue
  // (the lane dashes alone read as "stationary road"; objects streaking past
  // your periphery are what make speed felt). Streamed in the update loop.
  const posts = [];
  for (let z = 0; z > -400; z -= 16) {
    for (const sx of [-5.6, 5.6]) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.0, 6),
        new THREE.MeshStandardMaterial({ color: 0xb8c0c8, emissive: 0xff6644, emissiveIntensity: 0.25, roughness: 0.6 })
      );
      post.position.set(sx, -0.5, z);
      scene.add(post);
      posts.push(post);
    }
  }
  // Roadside grass
  for (const sx of [-1, 1]) {
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 600),
      new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.95 })
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(sx * 25, -1.004, -200);   // just below the road so the edges don't co-plane-fight
    scene.add(grass);
  }

  // Car interior — dashboard, steering wheel, mirror
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.8 });
  const dashboard = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 0.6), dashMat);
  dashboard.position.set(0, -0.55, -0.45);
  scene.add(dashboard);

  // ----- Real instrument cluster -----
  // Two analogue dials (speedometer + fuel/RPM) painted on a CanvasTexture
  // so we can re-render the needle positions live every frame. Tachometer
  // shows engine RPM (driven by the accelerator pedal); speedometer shows
  // current speed in km/h. Indicator lamps below light up on signal /
  // brake / hazard.
  const clusterPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.96, 0.22, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x0a0c10, roughness: 0.7 })
  );
  clusterPanel.position.set(0, -0.42, -0.4);
  scene.add(clusterPanel);
  // Two dial canvases — speedo (left), tach (right)
  function makeDialCanvas() {
    const c = document.createElement("canvas");
    c.width = c.height = 192;
    return c;
  }
  function paintDial(c, opts) {
    const ctx = c.getContext("2d");
    const cx = 96, cy = 96, R = 78;
    ctx.fillStyle = "#0a0c10";
    ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill();
    // Outer rim
    ctx.strokeStyle = "#3a3a40"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI * 2); ctx.stroke();
    // Tick marks (major every 10°, minor every 2°) over a 270° arc
    // Arc from -225° to +45° (sweeping clockwise from bottom-left)
    const startA = Math.PI * 1.25;     // -225° = 135° + 90° ... actually 5π/4
    const sweep = Math.PI * 1.5;       // 270°
    for (let i = 0; i <= opts.maxTicks; i++) {
      const a = startA + (i / opts.maxTicks) * sweep;
      const isMajor = i % opts.majorEvery === 0;
      const tickLen = isMajor ? 12 : 6;
      ctx.strokeStyle = isMajor ? "#e8eef6" : "#7a8090";
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - tickLen), cy + Math.sin(a) * (R - tickLen));
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.stroke();
      // Label on major ticks
      if (isMajor) {
        ctx.fillStyle = "#e8eef6";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        const lblR = R - 26;
        const labelVal = Math.round(i * opts.maxValue / opts.maxTicks);
        ctx.fillText(String(labelVal), cx + Math.cos(a) * lblR, cy + Math.sin(a) * lblR);
      }
    }
    // Centre + label
    ctx.fillStyle = "#7cd1c5";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(opts.label, cx, cy + 30);
    // Needle
    const needleA = startA + Math.max(0, Math.min(1, opts.value)) * sweep;
    ctx.strokeStyle = opts.needleColor || "#ff8a3a";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(needleA) * (R - 18), cy + Math.sin(needleA) * (R - 18));
    ctx.stroke();
    // Centre cap
    ctx.fillStyle = "#3a3a40";
    ctx.beginPath(); ctx.arc(cx, cy, 6, 0, Math.PI * 2); ctx.fill();
  }
  const speedoCanvas = makeDialCanvas();
  const tachCanvas   = makeDialCanvas();
  const speedoTex = new THREE.CanvasTexture(speedoCanvas);
  speedoTex.colorSpace = THREE.SRGBColorSpace;
  const tachTex = new THREE.CanvasTexture(tachCanvas);
  tachTex.colorSpace = THREE.SRGBColorSpace;
  // Initial paint
  paintDial(speedoCanvas, { value: 0, maxValue: 200, maxTicks: 10, majorEvery: 1, label: "km/h" });
  paintDial(tachCanvas,   { value: 0, maxValue: 8,   maxTicks: 8,  majorEvery: 1, label: "RPM × 1k", needleColor: "#ff5544" });
  speedoTex.needsUpdate = true;
  tachTex.needsUpdate = true;
  const speedoMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshStandardMaterial({
      map: speedoTex, transparent: true,
      emissive: 0xffffff, emissiveMap: speedoTex, emissiveIntensity: 0.6,
    })
  );
  speedoMesh.position.set(-0.20, -0.42, -0.37);
  scene.add(speedoMesh);
  const tachMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshStandardMaterial({
      map: tachTex, transparent: true,
      emissive: 0xffffff, emissiveMap: tachTex, emissiveIntensity: 0.6,
    })
  );
  tachMesh.position.set(0.20, -0.42, -0.37);
  scene.add(tachMesh);

  // Indicator lamps — three small emissive squares between the dials.
  // Left = left turn signal, Center = brake, Right = right turn signal.
  const lampMatLeft  = new THREE.MeshStandardMaterial({ color: 0x202024, emissive: 0x000000 });
  const lampMatBrake = new THREE.MeshStandardMaterial({ color: 0x202024, emissive: 0x000000 });
  const lampMatRight = new THREE.MeshStandardMaterial({ color: 0x202024, emissive: 0x000000 });
  const lampLeft = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.025), lampMatLeft);
  lampLeft.position.set(-0.05, -0.50, -0.37);
  scene.add(lampLeft);
  const lampBrake = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.025), lampMatBrake);
  lampBrake.position.set(0, -0.50, -0.37);
  scene.add(lampBrake);
  const lampRight = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.025), lampMatRight);
  lampRight.position.set(0.05, -0.50, -0.37);
  scene.add(lampRight);
  // Track when the indicator was last triggered so we can blink it
  let indicatorTimer = 0;      // seconds of blink remaining (counts down in update)
  let indicatorSide = 0;       // -1 left, +1 right, 0 off
  // Throttle for dial canvas repaints — 10 Hz instead of 60 Hz for perf
  let dashT = 0;
  // Steering wheel — wrapped in a group so we can rotate it as one unit when
  // the user drags it. The whole wheel tilts at Pi/2.4 to match a real driving
  // posture; the inner Group rotation about its z-axis is the "steering".
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181a, metalness: 0.4, roughness: 0.4 });
  const wheelTilt = new THREE.Group();
  wheelTilt.position.set(0, -0.35, -0.55);
  wheelTilt.rotation.x = Math.PI / 2.4;
  scene.add(wheelTilt);
  // The actual rotating bit
  const wheelGroup = new THREE.Group();
  wheelTilt.add(wheelGroup);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 10, 28), wheelMat);
  wheelGroup.add(wheel);
  for (let a = 0; a < 3; a++) {
    const angle = a * Math.PI * 2 / 3;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.018, 0.02), wheelMat);
    spoke.rotation.z = angle;
    wheelGroup.add(spoke);
  }
  // Centre boss (hub) — a small dark disk in the middle so the wheel reads
  // as a real steering wheel instead of an empty torus.
  const boss = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 0.018, 18),
    new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.5, metalness: 0.6 })
  );
  boss.rotation.x = Math.PI / 2;
  wheelGroup.add(boss);
  // Roof + A-pillars (block out top of view)
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.12, 1.5),
    new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.9 })
  );
  roof.position.set(0, 0.55, -0.4);
  scene.add(roof);

  // Other cars — proper procedural vehicles (lower body + cabin + glass + four
  // wheels + head/tail lights) instead of plain boxes, so the traffic reads as
  // real cars on the road. Local origin is at the wheel-contact (ground) plane,
  // so each is just dropped onto the road at y = -1. A few become lorries on
  // the higher-traffic rungs ("lorries to your left").
  function buildTrafficCar(isLorry) {
    const g = new THREE.Group();
    const paint = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.45, isLorry ? 0.52 : 0.42),
      roughness: 0.45, metalness: 0.45,
    });
    const glass = new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: 0.12, metalness: 0.6 });
    const tyre  = new THREE.MeshStandardMaterial({ color: 0x141519, roughness: 0.9 });
    const wide = isLorry ? 2.1 : 1.75;
    const len  = isLorry ? 7.0 : 4.3;
    const wheelR = isLorry ? 0.5 : 0.34;
    // Wheels (origin y=0 = ground; wheel bottoms touch the road)
    const wheelGeo = new THREE.CylinderGeometry(wheelR, wheelR, isLorry ? 0.3 : 0.24, 16);
    const wx = wide / 2 - 0.04, wz = len / 2 - (isLorry ? 1.3 : 1.05);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const w = new THREE.Mesh(wheelGeo, tyre);
      w.rotation.z = Math.PI / 2;
      w.position.set(sx * wx, wheelR, sz * wz);
      g.add(w);
    }
    // Lower body
    const lowH = isLorry ? 1.1 : 0.64;
    const lowY = wheelR + lowH / 2 + 0.02;
    const lower = new THREE.Mesh(new THREE.BoxGeometry(wide, lowH, len), paint);
    lower.position.y = lowY; lower.castShadow = true; g.add(lower);
    if (isLorry) {
      // Cab at the front (-z) + tall cargo box behind it
      const cab = new THREE.Mesh(new THREE.BoxGeometry(wide, 1.25, 1.9), paint);
      cab.position.set(0, lowY + lowH / 2 + 0.6, -len / 2 + 1.1); cab.castShadow = true; g.add(cab);
      const cabWin = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.98, 0.6, 0.12), glass);
      cabWin.position.set(0, lowY + lowH / 2 + 0.8, -len / 2 + 0.18); g.add(cabWin);
      const cargo = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.98, 1.9, len - 2.6), paint);
      cargo.position.set(0, lowY + lowH / 2 + 0.95, 0.7); cargo.castShadow = true; g.add(cargo);
    } else {
      // Cabin / greenhouse with a glass band
      const cabH = 0.6;
      const cabY = lowY + lowH / 2 + cabH / 2 - 0.02;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.9, cabH, len * 0.5), paint);
      cab.position.set(0, cabY, -0.15); cab.castShadow = true; g.add(cab);
      const win = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.92, cabH * 0.72, len * 0.5 * 0.94), glass);
      win.position.set(0, cabY + 0.02, -0.15); g.add(win);
    }
    // Tail lights (rear = +z, the side you see while following). Each gets its
    // OWN material and is referenced on userData so the turn-signal blink can
    // animate a tail lamp — NOT the shared wheel material it used to clobber
    // (which was turning every car's four wheels red/amber every frame).
    const tailMats = [];
    for (const sx of [-1, 1]) {
      const tlMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.06), tlMat);
      tl.position.set(sx * (wide / 2 - 0.32), lowY + 0.05, len / 2 - 0.02);
      g.add(tl);
      tailMats.push(tlMat);
    }
    g.userData.tailMats = tailMats;
    // Head lights (front = -z)
    for (const sx of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
      hl.position.set(sx * (wide / 2 - 0.32), lowY, -len / 2 + 0.02);
      g.add(hl);
    }
    return g;
  }

  const otherCars = [];
  if (traffic > 0.05) {
    const carCount = 3 + Math.floor(traffic * 14);
    for (let i = 0; i < carCount; i++) {
      const lane = (i % 3) - 1;        // -1, 0, 1
      // Lorries appear on busier rungs, biased to the left lane.
      const isLorry = traffic > 0.6 && (lane === -1 ? i % 2 === 0 : i % 4 === 0);
      const car = buildTrafficCar(isLorry);
      car.position.set(lane * 3.2, -1, -8 - Math.random() * 200);
      car.userData.relSpeed = 1 + Math.random() * 4;
      car.userData.lane = lane;
      scene.add(car);
      otherCars.push(car);
    }
  }

  // Rain particles (only at the rainiest rung)
  let rain = null;
  if (isRain) {
    const N = 600;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      positions[i*3]   = (Math.random() - 0.5) * 30;
      positions[i*3+1] = Math.random() * 18;
      positions[i*3+2] = -Math.random() * 60 + 5;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    rain = new THREE.Points(rg, new THREE.PointsMaterial({
      color: 0xb0c0d0, size: 0.06, transparent: true, opacity: 0.65,
    }));
    scene.add(rain);
  }

  // Side mirror that reflects "behind" — implemented as a small mirror box with
  // a fake darker render, just for psychological completeness
  const mirror = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.10, 0.04),
    new THREE.MeshStandardMaterial({ color: 0x4a5060, metalness: 0.9, roughness: 0.15 })
  );
  mirror.position.set(0.85, 0.1, -0.3);
  scene.add(mirror);

  // ----- Visible foot pedals -----
  // Two pedals on the floor between the user's legs: brake (left) + accel
  // (right). Press-and-hold each to actually drive the car. Pedals are
  // grouped so we can rotate them as if they're being depressed.
  const pedalMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.4, metalness: 0.5 });
  const pedalPlateMat = new THREE.MeshStandardMaterial({ color: 0xc4c8d0, metalness: 0.5, roughness: 0.4 });
  const brakePedal = new THREE.Group();
  brakePedal.position.set(-0.18, -0.85, -0.55);
  scene.add(brakePedal);
  const brakeArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.20, 0.04), pedalMat);
  brakeArm.position.set(0, 0.10, 0);
  brakePedal.add(brakeArm);
  const brakePlate = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.025, 0.13), pedalPlateMat);
  brakePlate.position.set(0, 0.20, 0.04);
  brakePedal.add(brakePlate);
  // "B" letter on the brake plate (etched in dark)
  const brakeLetter = new THREE.Mesh(
    new THREE.PlaneGeometry(0.04, 0.06),
    new THREE.MeshBasicMaterial({ color: 0x141414, transparent: true, opacity: 0.7 })
  );
  brakeLetter.rotation.x = -Math.PI / 2;
  brakeLetter.position.set(0, 0.215, 0.04);
  brakePedal.add(brakeLetter);
  const accelPedal = new THREE.Group();
  accelPedal.position.set(0.05, -0.85, -0.50);
  scene.add(accelPedal);
  const accelArm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), pedalMat);
  accelArm.position.set(0, 0.09, 0);
  accelPedal.add(accelArm);
  const accelPlate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.018, 0.16), pedalPlateMat);
  accelPlate.position.set(0, 0.18, 0.06);
  accelPedal.add(accelPlate);

  // Pedal press state — driven by the brake button OR by clicking the pedal
  // directly. Each goes 0..1, smoothed in update.
  let brakePressed = 0;        // smoothed visual
  let brakePressTarget = 0;
  let accelPressed = 0;
  let accelPressTarget = 0;

  camera.fov = 60;
  camera.updateProjectionMatrix();

  let drivingControls = null;
  let drivingDisposed = false; // set on unmount; guards deferred indicator-audio timeouts
  let brakeFactor = 1.0;       // multiplier for car relative-speed (1 = normal, 0.5 = braking)
  function wireDrivingCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="driving"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = drivingControls; if (!c) return;
        switch (btn.dataset.cmd) {
          case "mirror": {
            // Quick yaw to the right (rear-view mirror direction) and back
            const fromY = c.yaw;
            let k = 0;
            const id = setInterval(() => {
              k += 0.1;
              if (k >= 1) { c.yaw = fromY; clearInterval(id); return; }
              c.yaw = fromY + Math.sin(k * Math.PI) * 0.5;
            }, 16);
            if (window.PhobiaVoice) window.PhobiaVoice.speak("Mirror clear. The cars behind are predictable.");
            break;
          }
          case "indicator":
            if (window.PhobiaAudio && window.PhobiaAudio.indicatorClick) {
              for (let i = 0; i < 4; i++) setTimeout(() => { if (!drivingDisposed && window.PhobiaAudio) window.PhobiaAudio.indicatorClick(); }, i * 600);
            }
            // Signal the way the wheel is turned; with the wheel centred,
            // alternate sides each press so the LEFT lamp is actually reachable
            // (it was dead code — the button hard-coded right every time).
            indicatorSide = steerInput < -0.15 ? -1 : (steerInput > 0.15 ? 1 : (indicatorSide === -1 ? 1 : -1));
            indicatorTimer = 3.0;
            if (window.PhobiaVoice) window.PhobiaVoice.speak("Indicator on. You are signalling. Good.");
            break;
          case "brake":
            // Visible foot pressing the brake pedal for a held beat
            brakePressTarget = 1.0;
            brakeFactor = 0.4;
            setTimeout(() => { brakeFactor = 1.0; brakePressTarget = 0; }, 2500);
            if (window.PhobiaVoice) window.PhobiaVoice.speak("Light pressure. The car responds.");
            break;
        }
      };
    });
  }
  setTimeout(wireDrivingCmds, 0);

  // ----- Click the pedals directly (real foot-on-pedal action) -----
  // Hold the brake or accelerator pedal with the mouse to depress it. The
  // pedal visibly tilts under your foot, and brakeFactor / speed respond.
  const pedalRaycaster = new THREE.Raycaster();
  const pedalMouse = new THREE.Vector2();
  let pedalCanvas = null;
  let activePedal = null;     // "brake" or "accel" while held
  function bindPedalClicks() {
    pedalCanvas = document.querySelector("#stage canvas");
    if (!pedalCanvas) return;
    pedalCanvas.addEventListener("pointerdown", (e) => {
      const rect = pedalCanvas.getBoundingClientRect();
      pedalMouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      pedalMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      pedalRaycaster.setFromCamera(pedalMouse, camera);
      const bHits = pedalRaycaster.intersectObject(brakePedal, true);
      if (bHits.length > 0) {
        activePedal = "brake";
        brakePressTarget = 1.0;
        if (drivingControls) drivingControls.dragging = false;
        return;
      }
      const aHits = pedalRaycaster.intersectObject(accelPedal, true);
      if (aHits.length > 0) {
        activePedal = "accel";
        accelPressTarget = 1.0;
        if (drivingControls) drivingControls.dragging = false;
      }
    });
    function release() {
      if (activePedal === "brake") brakePressTarget = 0;
      if (activePedal === "accel") accelPressTarget = 0;
      activePedal = null;
    }
    pedalCanvas.addEventListener("pointerup", release);
    pedalCanvas.addEventListener("pointercancel", release);
    pedalCanvas.addEventListener("pointerleave", release);
  }
  setTimeout(bindPedalClicks, 60);

  // ----- Steering wheel: drag-to-steer (real human action) -----
  // The user can mouse-drag the wheel left/right to actually rotate it,
  // which subtly drifts the lane and tilts the camera — the *felt sense* of
  // steering. Spring back to centre when released. Keyboard A/D as a fallback
  // for users without a mouse (also matches the existing FPControls keys).
  let steerAngle = 0;        // current displayed wheel rotation (radians)
  let steerInput = 0;        // -1 (full left) .. +1 (full right) intent
  let steerSpring = true;    // when true, the wheel relaxes back to centre
  let dragging = false;
  let lastClientX = 0;
  let canvasDom = null;
  function bindWheelDrag() {
    canvasDom = document.querySelector("#stage canvas");
    if (!canvasDom) return;
    const raycaster = new THREE.Raycaster();
    const mouseV = new THREE.Vector2();
    canvasDom.addEventListener("pointerdown", (e) => {
      const rect = canvasDom.getBoundingClientRect();
      mouseV.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      mouseV.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouseV, camera);
      const hits = raycaster.intersectObject(wheelGroup, true);
      if (hits.length === 0) return;
      // Hit the wheel — start dragging instead of look-around. Cancel any
      // FPControls drag that just started so the camera doesn't rotate too.
      if (drivingControls) drivingControls.dragging = false;
      dragging = true;
      steerSpring = false;
      lastClientX = e.clientX;
      try { canvasDom.setPointerCapture(e.pointerId); } catch {}
    });
    canvasDom.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      // Belt-and-braces: while we're steering, keep FPControls suppressed.
      if (drivingControls) drivingControls.dragging = false;
      const dx = e.clientX - lastClientX;
      lastClientX = e.clientX;
      // Map ~200 px of horizontal drag to a full lock-to-lock turn (±π/2)
      steerAngle = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, steerAngle - dx * 0.012));
      steerInput = steerAngle / (Math.PI / 2);
    });
    function release() {
      if (!dragging) return;
      dragging = false;
      steerSpring = true;
    }
    canvasDom.addEventListener("pointerup", release);
    canvasDom.addEventListener("pointercancel", release);
    canvasDom.addEventListener("pointerleave", release);
  }
  setTimeout(bindWheelDrag, 60);

  return {
    controls: {
      mode: "lookOnly",
      initialPos: [0, 0, 0],
      initialYaw: 0,
      initialPitch: 0,
      pitchMin: -0.4, pitchMax: 0.3,
      yawMin: -1.0, yawMax: 1.0,
      lookSpeed: 0.0035,
      cameraModeLocked: "fp",          // driver's seat — FP only
    },
    hands: { sleeveColor: 0x2c2a2a },
    bloom: { strength: 0.25, threshold: 0.92 },
    interact(controls) {
      // Hint that the wheel is grabbable when looking at it
      if (controls && controls.pitch < -0.2) {
        return { gesture: "grab", hint: "drag the wheel to steer · brake / mirror buttons available" };
      }
      return { gesture: "rest" };
    },
    update(t, controls, dt) {
      if (controls) drivingControls = controls;
      const d = dt || 0.016;
      // Spring the steering wheel back to centre when not dragged. The driver
      // is "holding" it loosely — like a real wheel returning after a turn.
      if (steerSpring) {
        steerAngle += (0 - steerAngle) * Math.min(1, d * 6);
        steerInput = steerAngle / (Math.PI / 2);
      }
      wheelGroup.rotation.z = steerAngle
                            + Math.sin(t * (1.5 + speed * 2)) * 0.025 * speed;
      // ---- Pedals: smooth toward target, drive brakeFactor + lane speed ----
      // Brake pedal tilts forward (negative x rotation) up to ~22° when fully
      // depressed. Held brake clamps brakeFactor down to 0.35.
      brakePressed += (brakePressTarget - brakePressed) * Math.min(1, d * 8);
      accelPressed += (accelPressTarget - accelPressed) * Math.min(1, d * 8);
      brakePedal.rotation.x = -brakePressed * 0.38;
      accelPedal.rotation.x = -accelPressed * 0.38;
      // While the brake pedal is actively held, override brakeFactor — but
      // never higher than the timed-button brakeFactor (so a quick "brake"
      // button press still works).
      if (activePedal === "brake" || brakePressed > 0.35) {
        brakeFactor = Math.min(brakeFactor, 0.35);
      } else {
        // Pedal released and no timed-button brake active: ease the sim back to
        // full speed. Without this the foot-pedal left brakeFactor clamped at
        // 0.35 forever, freezing the whole drive at ~35% (road, speedo, tach).
        brakeFactor += (1 - brakeFactor) * Math.min(1, d * 4);
      }
      // While the accelerator is actively held, push speed slightly above its
      // baseline. We modulate by `accelBoost` below.
      const accelBoost = 1 + accelPressed * 0.5;
      // Steering shifts the lane subtly. Visible as the road / cars sliding
      // sideways relative to the cabin (we move the cars rather than the
      // camera so the cabin geometry stays put).
      const lateralDrift = steerInput * 0.6;
      // Move other cars toward us based on relative speed (slowed when braking)
      for (const car of otherCars) {
        car.position.z += (3 + car.userData.relSpeed) * d * (0.5 + speed * accelBoost) * brakeFactor;
        // Slight lateral shift to simulate steering (lane delta scaled by speed)
        car.position.x += lateralDrift * d * 1.4 * (0.4 + speed);
        if (car.position.z > 8) {
          car.position.z = -120 - Math.random() * 100;
          car.position.x = car.userData.lane * 3.2;
          car.userData.signal = 0;
          car.userData.targetLane = null;
        }
        if (car.userData.signal == null) car.userData.signal = 0;
        if (car.userData.signal === 0 && Math.random() < 0.0008) {
          car.userData.signal = 1.5;
          // Signal first, THEN move over — the blink used to be decoration;
          // now it predicts a real lane change, which is what a mirror-checking
          // driver's brain expects traffic to do.
          const want = car.userData.lane + (Math.random() < 0.5 ? -1 : 1);
          car.userData.targetLane = Math.max(-1, Math.min(1, want));
        }
        // Carry out the signalled lane change as a smooth ~1.5 s drift.
        if (car.userData.targetLane != null && car.userData.targetLane !== car.userData.lane) {
          const targetX = car.userData.targetLane * 3.2;
          car.position.x += (targetX - car.position.x) * Math.min(1, d * 1.2);
          if (Math.abs(targetX - car.position.x) < 0.06) car.userData.lane = car.userData.targetLane;
        }
        // Blink one tail lamp amber while signalling; otherwise hold tail-light
        // red. (Previously this recoloured car.children[1] — a wheel whose
        // material is shared across all four wheels — so every car ran red.)
        const sigMat = car.userData.tailMats && car.userData.tailMats[0];
        if (car.userData.signal > 0) {
          car.userData.signal -= d;
          const blink = Math.sin(t * 8) > 0 ? 0xffb030 : 0x551a00;
          if (sigMat) sigMat.color.setHex(blink);
        } else if (sigMat) {
          sigMat.color.setHex(0xff3322);
        }
      }
      // ---- Road streaming toward you = the felt sense of speed ----
      // The lane dashes + roadside posts whip past at our ego-speed (faster on
      // higher rungs + while accelerating, slower while braking). This is the
      // cue the scene was missing — speed was only inferable from oncoming cars.
      // Scale the whole road speed by the rung's `speed` so a parked rung
      // (speed:0) is actually stationary — the old +10 floor streamed the road
      // and posts past a "Parked, engine on" car. Idle RPM stays via the tach.
      const egoSpeed = (speed * 36) * accelBoost * brakeFactor;
      for (const m of dashes) { m.position.z += egoSpeed * d; if (m.position.z > 10) m.position.z -= 400; }
      for (const m of posts)  { m.position.z += egoSpeed * d; if (m.position.z > 10) m.position.z -= 400; }
      // Fear from speed + how close the nearest car is (so the hold-timer reads
      // real distress instead of wall-clock).
      if (window.PhobiaFear) {
        const spd = Math.min(1, egoSpeed / 36);
        let nearCar = 0;
        for (const car of otherCars) {
          const cd = Math.hypot(car.position.x, car.position.z);
          if (cd < 4) nearCar = Math.max(nearCar, 1 - cd / 4);
        }
        window.PhobiaFear.setInput("proximity", Math.min(1, spd * 0.6 + nearCar * 0.55));
      }
      // Rain falls
      if (rain) {
        const pos = rain.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          pos.array[i*3+1] -= 28 * d;
          pos.array[i*3+2] += 6 * d;
          if (pos.array[i*3+1] < -1.5 || pos.array[i*3+2] > 6) {
            pos.array[i*3]   = (Math.random() - 0.5) * 30;
            pos.array[i*3+1] = 14 + Math.random() * 6;
            pos.array[i*3+2] = -50 - Math.random() * 30;
          }
        }
        pos.needsUpdate = true;
      }
      // Tiny camera roll when steering — mimics the inertial feel of leaning
      // into a turn without actually moving the camera much
      if (controls) {
        camera.rotation.z += (-steerInput * 0.04 - camera.rotation.z) * 0.1;
      }
      // ---- Live dashboard updates ----
      // The dial canvases are repainted every few frames so the needle
      // tracks the actual driving state in real time without burning the
      // GPU. Speed = base speed × accelBoost (1..1.5 from accelerator pedal),
      // tach roughly proportional to speed but with engine resonance.
      const repaintEvery = 0.10;        // 10 Hz canvas repaint
      dashT += d;
      if (dashT > repaintEvery) {
        dashT = 0;
        const speedKmh = (speed * 130) * accelBoost * brakeFactor;   // 0 when parked (was a fixed 40 floor)
        const tachVal  = (1.5 + speed * 4) * accelBoost * (brakeFactor < 0.5 ? 0.5 : 1.0);
        paintDial(speedoCanvas, {
          value: Math.min(1, speedKmh / 200),
          maxValue: 200, maxTicks: 10, majorEvery: 1, label: "km/h",
        });
        paintDial(tachCanvas, {
          value: Math.min(1, tachVal / 8),
          maxValue: 8, maxTicks: 8, majorEvery: 1, label: "RPM × 1k",
          needleColor: "#ff5544",
        });
        speedoTex.needsUpdate = true;
        tachTex.needsUpdate = true;
      }
      // Indicator lamp blink — ~2 Hz amber while active. Counts down in the
      // scene's own time (`d`), not wall-clock, so it actually stops after 3 s.
      if (indicatorTimer > 0) {
        indicatorTimer -= d;
        const on = Math.sin(t * Math.PI * 4) > 0;
        const target = on ? 0xff8a30 : 0x000000;
        if (indicatorSide === 1)  lampMatRight.emissive.setHex(target);
        if (indicatorSide === -1) lampMatLeft.emissive.setHex(target);
        const intensity = on ? 1 : 0;
        if (indicatorSide === 1)  lampMatRight.emissiveIntensity = intensity;
        if (indicatorSide === -1) lampMatLeft.emissiveIntensity = intensity;
      } else {
        lampMatLeft.emissive.setHex(0x000000);
        lampMatRight.emissive.setHex(0x000000);
      }
      // Brake lamp — solid red while either brake is held
      const brakeOn = brakePressed > 0.30 || brakeFactor < 0.5;
      lampMatBrake.emissive.setHex(brakeOn ? 0xff3030 : 0x000000);
      lampMatBrake.emissiveIntensity = brakeOn ? 1 : 0;
    },
    dispose() {
      // Stops the deferred indicator-click audio timeouts from sounding after
      // the user has already driven off / left the scene.
      drivingDisposed = true;
    },
  };
}

export { setupDriving };
