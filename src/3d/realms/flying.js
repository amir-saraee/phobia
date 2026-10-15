// Flying (an airplane cabin) — a legacy realm, behind LAUNCH_OPEN (?all=1 to
// play).

import * as THREE from "three";
import { _UP } from "../hands.js";
import { sceneContext } from "../scene-context.js";
import { _hexMix } from "../creature-kit.js";

// ---------- Flying (airplane cabin) ----------
// Airline cabins are not one cabin. Four liveries, drawn per visit — the seat
// you are strapped into is a different aircraft each time you fly.
const CABIN_LIVERIES = [
  { seat: 0x4a4055, carpet: 0x4a3a4a, panel: 0xd5d1c8 },
  { seat: 0x2f4a5c, carpet: 0x2c3a44, panel: 0xdcdad2 },
  { seat: 0x5c3038, carpet: 0x46323a, panel: 0xd8d2c6 },
  { seat: 0x3d4a42, carpet: 0x36403a, panel: 0xd2d4cc },
];

function setupFlying(scene, camera, level, levelIdx, ctx) {
  const stage = level.stage; // 0..1, ramp by rung
  const V = ctx || sceneContext("flying", levelIdx || 0, false);
  const livery = V.pick(CABIN_LIVERIES);
  // The window is the cabin's only outside, so the hour reaches in through it.
  const sunElev = 6 + V.hour.elev * 10;

  scene.background = new THREE.Color(0x88a8c8);
  // Strong key light from outside the window
  const sun = new THREE.DirectionalLight(_hexMix(0xfff5d0, V.hour.key, 0.55), 2.0 * V.range(0.85, 1.12));
  sun.position.set(-8, sunElev, -3);
  sun.castShadow = true;
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0x2a3a4a, 0.6));
  // Soft cabin fill so interior surfaces facing AWAY from the window/key light
  // (notably the seat back right in front of you) read as dim grey instead of a
  // black void. The single overhead point barely grazes those faces.
  scene.add(new THREE.HemisphereLight(0xdce4f0, 0x3a3340, 0.5));
  // Cabin overhead lights — bright while boarding at the gate, dimmed once the
  // doors close for taxi/takeoff (the level descriptions literally say "cabin
  // lights dim"). Gives the mid rungs a distinct, felt change.
  const cabinLight = new THREE.PointLight(0xffe9b0, stage < 0.45 ? 0.85 : 0.40, 8);
  cabinLight.position.set(0, 1.6, 0);
  scene.add(cabinLight);

  // Cabin interior — a curved tube with seats and a window cutout
  const cabinMat = new THREE.MeshStandardMaterial({ color: livery.panel, roughness: 0.85 });
  // Floor (carpet)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 30),
    new THREE.MeshStandardMaterial({ color: livery.carpet, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.2;
  floor.receiveShadow = true;
  scene.add(floor);
  // Curved ceiling
  const ceiling = new THREE.Mesh(
    new THREE.CylinderGeometry(2.2, 2.2, 30, 32, 1, true, -Math.PI / 2.2, Math.PI * 1.1),
    cabinMat
  );
  ceiling.rotation.z = Math.PI / 2;
  ceiling.position.set(0, 0.8, -10);
  ceiling.material.side = THREE.DoubleSide;
  scene.add(ceiling);
  // Window oval on the left
  const windowFrame = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.5, 24),
    new THREE.MeshStandardMaterial({ color: 0xb0b0b8, side: THREE.DoubleSide })
  );
  windowFrame.position.set(-1.95, 0.3, -4);
  windowFrame.rotation.y = Math.PI / 2;
  scene.add(windowFrame);
  // Window glass — shows sky shader
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { stage: { value: stage } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float stage; varying vec2 vUv;
      void main(){
        float h = vUv.y;
        vec3 top = mix(vec3(0.4, 0.6, 0.85), vec3(0.15, 0.3, 0.55), stage);
        vec3 bot = mix(vec3(0.85, 0.9, 0.95), vec3(0.5, 0.65, 0.85), stage);
        vec3 col = mix(bot, top, h);
        // distant clouds
        float cloud = smoothstep(0.4, 0.6, sin(vUv.x * 8.0 + 0.5) * cos(vUv.y * 6.0 + 1.0));
        col = mix(col, vec3(1.0), cloud * 0.45);
        // Tarmac/apron through the window while on the ground (gate, boarding,
        // doors-closed). On takeoff the horizon drops away and by cruise the
        // window is pure sky — so the window itself shows which rung you're on.
        float climb = smoothstep(0.5, 0.9, stage);
        float horizon = mix(0.46, -0.3, climb);            // ground line sinks during takeoff
        float g = smoothstep(horizon + 0.05, horizon - 0.05, h);
        vec3 ground = vec3(0.34, 0.35, 0.37);              // grey apron / runway
        col = mix(col, ground, g * (1.0 - climb));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  // The sky lives on a BIG backdrop plane well outside the fuselage, so the
  // wing/engine hang IN FRONT of it and are actually seen through the porthole
  // (the sky used to be an opaque disc ON the aperture, depth-occluding the
  // entire wing assembly built beyond it).
  const skyPlane = new THREE.Mesh(new THREE.PlaneGeometry(24, 14), skyMat);
  skyPlane.position.set(-7, 0.3, -4);
  skyPlane.rotation.y = Math.PI / 2;
  scene.add(skyPlane);
  // The porthole itself is now just a barely-there acrylic sheen.
  const windowGlass = new THREE.Mesh(
    new THREE.CircleGeometry(0.42, 24),
    new THREE.MeshStandardMaterial({
      color: 0xdce8f4, transparent: true, opacity: 0.08,
      roughness: 0.08, metalness: 0.1, depthWrite: false,
    })
  );
  windowGlass.position.copy(windowFrame.position);
  windowGlass.position.x += 0.01;
  windowGlass.rotation.y = Math.PI / 2;
  scene.add(windowGlass);
  // Fuselage panel around the porthole — closes the cabin side so the outside
  // is only visible through the window (and hides the wing root at the wall).
  const fuselage = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 7, 24),
    new THREE.MeshStandardMaterial({ color: livery.panel, roughness: 0.85, side: THREE.DoubleSide })
  );
  fuselage.position.set(-1.96, 0.3, -4);
  fuselage.rotation.y = Math.PI / 2;
  scene.add(fuselage);

  // Wing visible through the window — a real flat wing whose root reaches back
  // toward the fuselage and whose tip extends out past the engine, so it reads
  // as "the wing of the plane I'm on" rather than a floating strut.
  const wingMetal = new THREE.MeshStandardMaterial({ color: 0xc8c8d0, metalness: 0.55, roughness: 0.35 });
  const wing = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.07, 0.6), wingMetal);
  wing.position.set(-3.25, -0.02, -4.3);  // root ≈ x-2.1 (just outside the fuselage) → tip ≈ x-4.4 (past engine)
  wing.rotation.z = -0.04;                // slight dihedral
  wing.rotation.y = 0.10;                 // slight sweep
  scene.add(wing);
  // Engine nacelle hung under the wing
  const engine = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.32, 1.1, 20),
    new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.55, roughness: 0.35 })
  );
  engine.rotation.z = Math.PI / 2;        // axis along X; the camera-facing cap is the +X end
  engine.position.set(-4.0, -0.22, -4.2);
  scene.add(engine);
  // Dark intake ring on the front (camera-facing) face + a metal spinner, so
  // the engine reads as a jet intake instead of a flat-capped can.
  const intake = new THREE.Mesh(
    new THREE.CircleGeometry(0.29, 22),
    new THREE.MeshStandardMaterial({ color: 0x14171c, roughness: 0.7, side: THREE.DoubleSide })
  );
  intake.position.set(-3.43, -0.22, -4.2);
  intake.rotation.y = Math.PI / 2;
  scene.add(intake);
  const spinner = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.18, 12),
    new THREE.MeshStandardMaterial({ color: 0xd2d2da, metalness: 0.5, roughness: 0.4 })
  );
  spinner.rotation.z = -Math.PI / 2;      // tip toward +X (the camera)
  spinner.position.set(-3.36, -0.22, -4.2);
  scene.add(spinner);

  // Seat in front of you (the back of someone else's seat)
  const seatMat = new THREE.MeshStandardMaterial({ color: livery.seat, roughness: 0.85 });
  const seatBack = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.15), seatMat);
  seatBack.position.set(0, 0.2, -1.2);
  seatBack.castShadow = true;
  scene.add(seatBack);
  // Tray table — hinged at the back so it folds down/up.
  // Pivot is at the front of the seat in front (z = -1.2). The tray
  // itself is offset forward of the pivot so it swings into the user's lap.
  const trayPivot = new THREE.Group();
  trayPivot.position.set(0, -0.30, -1.18);
  scene.add(trayPivot);
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.4), seatMat);
  tray.position.set(0, 0, 0.20);     // forward of the hinge
  trayPivot.add(tray);
  // Start "up" (folded against the seatback): rotate to vertical
  trayPivot.rotation.x = -Math.PI / 2;
  let trayTargetAngle = -Math.PI / 2;  // -π/2 = up, 0 = down (lap)
  // Your own seat (sides visible)
  for (const sx of [-0.55, 0.55]) {
    const armrest = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.6), seatMat);
    armrest.position.set(sx, -0.4, 0.2);
    scene.add(armrest);
  }
  // Your own lap — the single most tactile anchor of sitting in a plane seat.
  // Two trousered thighs run forward below the tray line with the lap belt
  // cinched across them into a metal buckle. World-anchored (not camera-
  // childed) so it stays put like a body while you look around.
  const trouserMat = new THREE.MeshStandardMaterial({ color: 0x3a3f4e, roughness: 0.9 });
  for (const sx of [-0.14, 0.14]) {
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.34, 8, 12), trouserMat);
    thigh.position.set(sx, -0.50, -0.26);
    thigh.rotation.x = Math.PI / 2 - 0.14;   // knee drops slightly toward the floor
    thigh.castShadow = true;
    scene.add(thigh);
  }
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.7 });
  for (const sx of [-1, 1]) {
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.022, 0.08), beltMat);
    strap.position.set(sx * 0.21, -0.46, -0.28);
    strap.rotation.z = sx * 0.28;     // angled down toward the seat sides
    strap.rotation.x = -0.28;         // lying across the top of the thighs
    scene.add(strap);
  }
  const buckle = new THREE.Mesh(
    new THREE.BoxGeometry(0.10, 0.035, 0.065),
    new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 0.8, roughness: 0.3 })
  );
  buckle.position.set(0, -0.465, -0.28);
  buckle.rotation.x = -0.28;
  scene.add(buckle);

  // Seatbelt sign on the ceiling PSU, tilted down at the seat (lights up at
  // higher stages). It used to hang on the seat-back at eye level, where no
  // aircraft has ever mounted one.
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x222222, emissive: stage > 0.6 ? 0xff8a00 : 0x111111,
      emissiveIntensity: stage > 0.6 ? 1 : 0,
    })
  );
  sign.position.set(0, 1.15, -1.35);
  sign.rotation.x = 0.65;
  scene.add(sign);
  const signPanel = new THREE.Mesh(
    new THREE.BoxGeometry(0.38, 0.18, 0.03),
    new THREE.MeshStandardMaterial({ color: 0xb9bcc4, roughness: 0.6 })
  );
  signPanel.position.set(0, 1.162, -1.368);
  signPanel.rotation.x = 0.65;
  scene.add(signPanel);

  camera.fov = 60;
  camera.updateProjectionMatrix();

  let flyingControls = null;
  // Breathing state. Held while the user presses-and-holds the breath
  // button (or holds Space). The mechanic is a real 4-in / 6-out rhythm:
  // while held, the breath cycle runs and `calmTurbulence` rises during the
  // exhale phase. Sustained over multiple cycles builds a persistent calm
  // bonus so the user feels their breathing actually changing the cabin.
  let breathHeld = false;
  let breathT = 0;             // current cycle time, 0..10 (4 in + 6 out)
  let calmCycles = 0;          // completed cycles since scene mount
  let calmTurbulence = 0;      // 0..1 instantaneous damping
  let calmFloor = 0;           // 0..0.6 persistent damping that grows with cycles
  // Armrest grip. Press-and-hold like breath: while held the FP hands wrap
  // the REAL armrest tops and the squeeze feeds a small calm bonus — so the
  // "Squeeze for ten seconds" instruction physically does what it promises.
  let gripHeld = false;
  let gripT = 0;               // seconds into the current squeeze
  // Air-pocket "stomach drop" + banking lurch state (damped springs).
  let dropPos = 0, dropVel = 0, nextPocket = 5 + Math.random() * 7;
  let bankAmt = 0, bankVel = 0, nextBank = 8 + Math.random() * 10;
  // Reach scratch points (armrest tops / tray surface) — no per-frame allocs
  const _armGripPt = new THREE.Vector3();
  const _trayRestPt = new THREE.Vector3();
  function wireFlyingCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="flying"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    // Button-by-button so the breath one can be press-and-hold
    const btnBreath = bar.querySelector('[data-cmd="breath"]');
    if (btnBreath) {
      const press = (e) => {
        e.stopPropagation();
        breathHeld = true;
        btnBreath.classList.add("pressed");
        if (window.PhobiaVoice) window.PhobiaVoice.speak("Four in. Six out. Stay with the breath.");
      };
      const release = () => {
        breathHeld = false;
        btnBreath.classList.remove("pressed");
      };
      btnBreath.addEventListener("pointerdown", press);
      btnBreath.addEventListener("pointerup", release);
      btnBreath.addEventListener("pointerleave", release);
      btnBreath.addEventListener("pointercancel", release);
    }
    // Grip is press-and-hold too — squeezing is a sustained act, not a click
    const btnGrip = bar.querySelector('[data-cmd="grip"]');
    if (btnGrip) {
      const gpress = (e) => {
        e.stopPropagation();
        gripHeld = true;
        gripT = 0;
        btnGrip.classList.add("pressed");
        if (window.PhobiaVoice) window.PhobiaVoice.speak("Squeeze for ten seconds. Release. Squeeze. Release.");
      };
      const grelease = () => {
        gripHeld = false;
        btnGrip.classList.remove("pressed");
      };
      btnGrip.addEventListener("pointerdown", gpress);
      btnGrip.addEventListener("pointerup", grelease);
      btnGrip.addEventListener("pointerleave", grelease);
      btnGrip.addEventListener("pointercancel", grelease);
    }
    // The other buttons stay one-shot
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      if (btn.dataset.cmd === "breath" || btn.dataset.cmd === "grip") return;
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = flyingControls; if (!c) return;
        if (btn.dataset.cmd === "window") {
          const fromY = c.yaw, toY = -1.2;
          const fromP = c.pitch, toP = -0.1;
          let k = 0;
          const id = setInterval(() => {
            k += 0.05;
            if (k >= 1) { c.yaw = toY; c.pitch = toP; clearInterval(id); return; }
            c.yaw   = fromY + (toY - fromY) * k;
            c.pitch = fromP + (toP - fromP) * k;
          }, 16);
          if (window.PhobiaVoice) window.PhobiaVoice.speak("Look at the sky. The plane is held by air, like a fish in water.");
        } else if (btn.dataset.cmd === "tray") {
          trayTargetAngle = (trayTargetAngle <= -Math.PI / 4) ? 0 : -Math.PI / 2;
          if (window.PhobiaVoice) {
            window.PhobiaVoice.speak(trayTargetAngle === 0 ? "Tray down. Something to rest your hands on." : "Tray stowed.");
          }
        }
      };
    });
  }
  // Spacebar as a keyboard alt for the breath hold (works without taking the focus)
  function onFlyKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code !== "Space") return;
    e.preventDefault();
    if (e.type === "keydown" && !breathHeld) {
      breathHeld = true;
      if (window.PhobiaVoice && Math.random() < 0.05) {
        window.PhobiaVoice.speak("Four in. Six out.");
      }
    } else if (e.type === "keyup") {
      breathHeld = false;
    }
  }
  window.addEventListener("keydown", onFlyKey);
  window.addEventListener("keyup", onFlyKey);
  setTimeout(wireFlyingCmds, 0);

  // ---- Breath HUD (rim ring at the bottom of the stage) ----
  // Shows the inhale/exhale phase as a soft expanding ring + a count of
  // completed cycles so the user can see their breath taking visible effect.
  let breathHud = null;
  setTimeout(() => {
    const stage = document.getElementById("stage");
    if (!stage) return;
    let hud = stage.querySelector(".breath-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "breath-hud";
      hud.innerHTML = `
        <div class="breath-ring"><div class="breath-fill"></div></div>
        <div class="breath-label">Press &amp; hold the breath button (or Space) — 4 in · 6 out</div>
      `;
      stage.appendChild(hud);
    }
    breathHud = hud;
  }, 80);

  return {
    controls: {
      mode: "lookOnly",
      initialPos: [0, 0, 0],
      initialYaw: -0.4, // look slightly toward window
      initialPitch: 0,
      lookSpeed: 0.0035,
      pitchMin: -0.6, pitchMax: 0.4,
      cameraModeLocked: "fp",        // sitting in airplane seat — FP only
    },
    hands: { sleeveColor: 0x2c4a6e },
    bloom: { strength: 0.45, threshold: 0.85 },
    interact(controls, hands) {
      // Real contact for the named affordances: gripping wraps the hands on
      // the ACTUAL armrest tops (world ±0.55, top −0.2), and a lowered tray
      // offers the promised palm rest — no more clenching mid-air.
      if (hands && hands.setReachTarget) {
        const wantGrip = gripHeld || (!breathHeld && controls.pitch < -0.2);
        const trayDown = trayTargetAngle === 0 && Math.abs(trayPivot.rotation.x) < 0.1;
        if (wantGrip) {
          _armGripPt.set(0, -0.22, 0.15);
          hands.setReachTarget(_armGripPt, { hand: "both", grip: "wrap", normal: _UP, spread: 0.55, maxReach: 0.72 });
        } else if (trayDown) {
          _trayRestPt.set(0, -0.27, -0.95);
          hands.setReachTarget(_trayRestPt, { hand: "both", grip: "flat", normal: _UP, spread: 0.14, maxReach: 0.95 });
        } else {
          hands.clearReachTarget();
        }
      }
      if (breathHeld) {
        return { gesture: "rest", hint: "breathing · 4 in · 6 out · let the cabin settle" };
      }
      if (gripHeld) {
        return { gesture: "grab", hint: gripT < 10
          ? `squeezing the armrests · ${Math.max(0, 10 - gripT).toFixed(0)}s · then release`
          : "release · shake the hands out · squeeze again when ready" };
      }
      if (controls.pitch < -0.2) return { gesture: "grab", hint: "grip the armrests · or hold Space to breathe" };
      return { gesture: "rest", hint: "press & hold the breath button to settle the cabin" };
    },
    onClick() {},
    update(t, controls, dt) {
      if (controls) flyingControls = controls;
      const d = dt || 0.016;
      // ---- Breath cycle (4 in, 6 out = 10 s total) ----
      // Advances only while held. Each completed cycle bumps calmFloor (max
      // 0.55) so sustained breathing carries persistent damping into bumps.
      if (breathHeld) {
        breathT += d;
        if (breathT >= 10) {
          breathT = 0;
          calmCycles += 1;
          calmFloor = Math.min(0.55, calmFloor + 0.10);
          if (window.PhobiaAudio && window.PhobiaAudio.indicatorClick) {
            try { window.PhobiaAudio.indicatorClick(); } catch {}
          }
        }
        // During the exhale (4..10 s), instantaneous damping is at its peak.
        // During the inhale (0..4 s), damping is rising from prev value.
        const exhalePhase = breathT >= 4 ? (breathT - 4) / 6 : 0;
        const inhalePhase = breathT < 4 ? breathT / 4 : 1;
        calmTurbulence = Math.max(calmTurbulence, 0.4 + inhalePhase * 0.3 + exhalePhase * 0.3);
      } else {
        // Slowly decay back toward calmFloor (so the persistent gain remains
        // even after the user releases the button).
        calmTurbulence = Math.max(calmFloor, calmTurbulence - d * 0.4);
        breathT = Math.max(0, breathT - d * 1.2);   // wind back to ready
      }
      // ---- Armrest squeeze: proprioceptive grounding ----
      // A held squeeze earns a modest, capped damping of its own (weaker than
      // the breath cycle — squeezing is a bridge, breathing is the skill).
      if (gripHeld) {
        gripT += d;
        calmTurbulence = Math.max(calmTurbulence, Math.min(0.42, 0.22 + gripT * 0.02));
      } else {
        gripT = Math.max(0, gripT - d * 3);
      }
      // ---- Update breath HUD ----
      if (breathHud) {
        const ring = breathHud.querySelector(".breath-fill");
        const label = breathHud.querySelector(".breath-label");
        if (ring) {
          // The ring scales 0.4 → 1.0 during inhale (0..4s), 1.0 → 0.4 during exhale (4..10s)
          let scale = 0.4;
          if (breathT < 4)         scale = 0.4 + (breathT / 4) * 0.6;
          else if (breathT < 10)   scale = 1.0 - ((breathT - 4) / 6) * 0.6;
          ring.style.transform = `scale(${scale.toFixed(3)})`;
          ring.style.opacity = breathHeld ? "0.85" : "0.45";
        }
        if (label) {
          label.textContent = breathHeld
            ? (breathT < 4
                ? `Breathe in — ${(4 - breathT).toFixed(1)}s · cycles: ${calmCycles}`
                : `Breathe out — ${(10 - breathT).toFixed(1)}s · cycles: ${calmCycles}`)
            : (calmCycles > 0
                ? `Hold the breath button to continue · ${calmCycles} cycle${calmCycles === 1 ? "" : "s"} · cabin holding calm`
                : "Press & hold the breath button (or Space) — 4 in · 6 out");
        }
      }
      // Animate tray to target angle
      trayPivot.rotation.x += (trayTargetAngle - trayPivot.rotation.x) * 0.15;
      const dampening = 1 - calmTurbulence * 0.85;
      // Continuous turbulence. At the gate (stage ~0.1) the plane is parked, so
      // there is NO motion; movement begins with taxi/takeoff and peaks in cruise
      // turbulence — so the gate rung reads as genuinely still vs. the rest.
      const moveStage = Math.max(0, stage - 0.2);
      const tShake = moveStage * 0.075 * dampening;
      camera.position.y += Math.sin(t * 9.0) * tShake;
      camera.position.x += Math.cos(t * 7.0) * tShake * 0.5;
      camera.rotation.z += Math.sin(t * 5.0) * moveStage * 0.006 * dampening;
      // ---- Air pockets: the stomach-drop (the apex flying fear) ----
      // On a timer (more often + bigger at cruise), the floor falls out — a
      // sharp downward kick that springs back, so it lurches then settles like
      // a real air pocket. Breathing (calm) softens both the drop and the fear.
      nextPocket -= d;
      if (nextPocket <= 0 && moveStage > 0.3) {
        nextPocket = (4 + Math.random() * 6) / (0.5 + stage);
        dropVel -= (1.4 + stage * 1.8) * dampening;      // kick downward
        if (window.PhobiaFear) window.PhobiaFear.pulseEvent(0.45 + stage * 0.3);
      }
      dropVel += (-dropPos * 38 - dropVel * 6) * d;        // critically-ish damped spring → 0
      dropPos += dropVel * d;
      camera.position.y += dropPos;
      // ---- Occasional banking lurch (a turn that tips you) ----
      nextBank -= d;
      if (nextBank <= 0 && moveStage > 0.3) {
        nextBank = 9 + Math.random() * 12;
        bankVel += (Math.random() < 0.5 ? -1 : 1) * (0.5 + stage * 0.5) * dampening;
      }
      bankVel += (-bankAmt * 22 - bankVel * 5) * d;
      bankAmt += bankVel * d;
      camera.rotation.z += bankAmt * 0.12;
      // Continuous fear from the motion, calmed by breathing.
      if (window.PhobiaFear) {
        window.PhobiaFear.setInput("proximity", Math.min(1, moveStage * 0.6 * dampening + Math.abs(dropPos) * 0.9));
      }
    },
    dispose() {
      try {
        window.removeEventListener("keydown", onFlyKey);
        window.removeEventListener("keyup", onFlyKey);
      } catch {}
      const stage = document.getElementById("stage");
      if (stage) {
        const hud = stage.querySelector(".breath-hud");
        if (hud) hud.remove();
      }
    },
  };
}

export { setupFlying };
