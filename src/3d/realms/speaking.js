// Public speaking — a legacy realm, behind LAUNCH_OPEN (?all=1 to play).

import * as THREE from "three";
import { IS_COARSE_POINTER } from "../renderer.js";
import { sceneContext } from "../scene-context.js";
import { _hexMix } from "../creature-kit.js";

// ---------- Public speaking ----------
function setupSpeaking(scene, camera, level, levelIdx, ctx) {
  const crowd = level.crowd; // 0..1
  // The one scene where variation has to be handled with tongs: audience SIZE
  // is the rung's difficulty, and `crowd` drives row count, seats per row and
  // the fill probability. None of those move. What varies is who the people
  // are, where the friendly face sits, and the temperature of the room.
  const V = ctx || sceneContext("speaking", levelIdx || 0, false);

  // Slightly lifted backdrop + fog so the audience actually reads against the
  // dark room instead of getting swallowed. Real auditoriums still have ambient
  // glow from emergency aisle lights, exit signs, and screen bleed.
  scene.background = new THREE.Color(0x141826);
  scene.fog = new THREE.Fog(0x141826, 14, 90);

  // Spotlight on the speaker (us)
  const spot = new THREE.SpotLight(_hexMix(0xfff0d0, V.rng() < 0.5 ? 0xffe6b8 : 0xf4f2ff, V.range(0.15, 0.5)),
    crowd > 0 ? 6 : 1.8, 30, Math.PI / 6, 0.3);
  spot.position.set(0, 6, 4);
  spot.target.position.set(0, 0, -2);
  spot.castShadow = true;
  scene.add(spot); scene.add(spot.target);

  // ---- House lighting ----
  // Audience needs to be visible as people, not as a void. A warm overhead
  // hemisphere + a soft top-down fill aimed at the seats lifts the faces out
  // of black without breaking the "spotlight on me" feeling.
  scene.add(new THREE.AmbientLight(0x4a5070, 1.1));
  scene.add(new THREE.HemisphereLight(0x8090b0, 0x2a2230, 0.65));
  const houseFill = new THREE.DirectionalLight(0xb8c4dc, 0.85);
  houseFill.position.set(0, 12, -8);
  houseFill.target.position.set(0, -1, -12);
  scene.add(houseFill); scene.add(houseFill.target);

  // Stage floor (wooden platform)
  const stage = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.2, 4),
    new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.85 })
  );
  stage.position.set(0, -1.1, 0);
  stage.castShadow = true;
  stage.receiveShadow = true;
  scene.add(stage);

  // Podium / lectern
  const podium = new THREE.Group();
  const podBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.0, 0.5),
    new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.7 })
  );
  podBox.position.y = -0.5;
  podium.add(podBox);
  const podTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.05, 0.65),
    new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.6 })
  );
  podTop.position.y = 0.025;
  podium.add(podTop);
  // y=-0.015 stands the lectern ON the stage (podBox bottom −1.015 meets the
  // stage top at −1.0) with podTop's surface at y=0.035 — exactly under the
  // mic/glass/notes bases below. It was sunk to −0.4, a knee-high stump with
  // all three props floating 0.4 m above it in the dead centre of the view.
  podium.position.set(0, -0.015, -0.6);
  scene.add(podium);

  // Microphone on podium
  const mic = new THREE.Group();
  const micStand = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8),
    new THREE.MeshStandardMaterial({ color: 0x202020, metalness: 0.5 })
  );
  micStand.position.y = 0.15;
  mic.add(micStand);
  const micHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.04, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4 })
  );
  micHead.position.y = 0.32;
  mic.add(micHead);
  mic.position.set(0, -0.05, -0.8);
  scene.add(mic);

  // ----- Glass of water on the podium (real sip gesture) -----
  // The glass is to the right of the mic. Clicking it raises it briefly toward
  // the camera (the "sip"), plays a soft sip sound, and gives the user a small
  // confidence buff. The water level drops slightly with each sip.
  const glass = new THREE.Group();
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xeaf2f8, transparent: true, opacity: 0.30,
    roughness: 0.05, metalness: 0.0,
    transmission: 0.85, ior: 1.4, thickness: 0.02,
  });
  const glassBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.038, 0.12, 24, 1, true),
    glassMat
  );
  glassBody.position.y = 0.06;
  glass.add(glassBody);
  const glassBase = new THREE.Mesh(
    new THREE.CircleGeometry(0.038, 24),
    glassMat
  );
  glassBase.rotation.x = -Math.PI / 2;
  glassBase.position.y = 0.001;
  glass.add(glassBase);
  // Water inside (level drops with sips)
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.040, 0.034, 0.08, 18),
    new THREE.MeshStandardMaterial({
      color: 0xa8d6e8, transparent: true, opacity: 0.7,
      roughness: 0.15, metalness: 0.4,
    })
  );
  water.position.y = 0.045;
  glass.add(water);
  // Resting position on the podium top
  glass.position.set(0.36, 0.04, -0.55);
  scene.add(glass);
  const glassBaseY = glass.position.y;
  let sipPhase = 0;       // 0 = on podium, 1 = at lips, fades back down
  let sipsTaken = 0;
  let waterLevel = 1.0;   // 0..1 — visual water remaining
  let confidence = 0.0;   // 0..1 — grows with sustained speaking + sips (declared here so takeSip() has no TDZ)
  function takeSip() {
    if (sipPhase > 0.05) return;       // already sipping
    sipPhase = 1.0;
    sipsTaken++;
    // The right hand actually picks the glass up (see interact()) — pulse
    // the action so the reach reads as a deliberate grab, not a drift.
    if (skHands && skHands.fireAction) skHands.fireAction();
    waterLevel = Math.max(0.10, waterLevel - 0.18);
    if (window.PhobiaAudio && window.PhobiaAudio.indicatorClick) {
      try { window.PhobiaAudio.indicatorClick(); } catch {}
    }
    if (window.PhobiaVoice && sipsTaken === 1) {
      window.PhobiaVoice.speak("A sip. The room can wait.");
    }
    confidence = Math.min(1, confidence + 0.10);
  }

  // ----- Speech notes (paper on the lectern top) -----
  // A printed page with a REAL speech printed on it — readable lines the
  // user can actually deliver. The current line highlights as the user holds
  // the speak button, and advances over time so they can see their progress.
  // The script is a short, gentle "introduce yourself" speech appropriate to
  // the rung's audience size.
  const speechLines = [
    "Good evening, everyone.",
    "Thank you for being here today.",
    "I'd like to share a small idea with you.",
    "It's something I've been thinking about for a while.",
    "Sometimes the things that scare us the most",
    "are the things that change us the most.",
    "A pause is not weakness — it's pace.",
    "I'm grateful you stayed to listen.",
    "Thank you.",
  ];
  let currentLine = 0;          // index into speechLines
  let lineProgress = 0;         // 0..1 within the current line
  function drawNoteCanvas() {
    const c = noteCanvas;
    const ctx = nctx;
    ctx.fillStyle = "#fbf8f0";
    ctx.fillRect(0, 0, 256, 360);
    // Header bar
    ctx.fillStyle = "#3a4a6a";
    ctx.fillRect(20, 24, 216, 4);
    ctx.fillStyle = "#3a4a6a";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText("My speech", 30, 18);
    // Render the speech lines
    ctx.font = "14px sans-serif";
    for (let i = 0; i < speechLines.length; i++) {
      const y = 56 + i * 26;
      // Highlight bar for the current line
      if (i === currentLine) {
        ctx.fillStyle = "rgba(255, 220, 100, 0.55)";
        ctx.fillRect(20, y - 14, 216, 22);
        // Progress bar within the highlight
        ctx.fillStyle = "rgba(124, 45, 18, 0.85)";
        ctx.fillRect(20, y + 8, 216 * lineProgress, 2);
      }
      // The text itself
      ctx.fillStyle = i < currentLine ? "#9a9a8a" : (i === currentLine ? "#1a1a1a" : "#3a3a3a");
      ctx.fillText(speechLines[i], 28, y);
    }
    noteTex.needsUpdate = true;
  }
  const noteCanvas = document.createElement("canvas");
  noteCanvas.width = 256; noteCanvas.height = 360;
  const nctx = noteCanvas.getContext("2d");
  const noteTex = new THREE.CanvasTexture(noteCanvas);
  noteTex.colorSpace = THREE.SRGBColorSpace;
  drawNoteCanvas();
  const notes = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36, 0.50),
    new THREE.MeshStandardMaterial({ map: noteTex, roughness: 0.9 })
  );
  notes.rotation.x = -Math.PI / 2 + 0.08;     // slight forward tilt
  notes.position.set(-0.18, 0.035, -0.55);
  scene.add(notes);

  // Audience — silhouettes seated in rows. Count scales with crowd.
  // Friendly face — a single audience member front and centre, slightly more
  // detailed and a touch closer. Nods while the user holds the "speak" button.
  // Only present once there's actually an audience (crowd > 0). The "Empty
  // room" rung (crowd 0) is "practising alone", so it must stay empty — this
  // figure used to appear there unconditionally. Hoisted to outer `let` because
  // the update loop nods friendlyHead (it null-checks first).
  let friendly = null;
  let friendlyHead = null;
  if (crowd > 0) {
    friendly = new THREE.Group();
    friendlyHead = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xd4a07a, roughness: 0.9 })
    );
    friendlyHead.position.y = 0.7;
    friendly.add(friendlyHead);
    const friendlyTorso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.6, 12),
      new THREE.MeshStandardMaterial({ color: 0x5c8782, roughness: 0.9 })   // muted, so it doesn't pop as "the fake one"
    );
    friendlyTorso.position.y = 0.3;
    friendly.add(friendlyTorso);
    // Tiny smile + eyes for warmth (lit standard material so they read as eyes,
    // not flat black stickers — and 0x111 was a typo for a near-black colour).
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 12, Math.PI), new THREE.MeshBasicMaterial({ color: 0x2a1810 }));
    smile.position.set(0, 0.65, 0.21);
    smile.rotation.z = Math.PI;
    friendlyHead.add(smile);
    for (const sx of [-0.07, 0.07]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0x141014, roughness: 0.4 }));
      eye.position.set(sx, 0.05, 0.21);
      friendlyHead.add(eye);
    }
    friendly.position.set(V.range(-1.5, 1.5), -1, -2.2 + V.range(-0.25, 0.25));
    friendly.castShadow = true;
    scene.add(friendly);
  }

  // Detailed audience members — proper humanoid figures with neck + head +
  // torso + shoulders + arms. Each person gets a randomised skin tone, hair
  // colour, and clothing colour so the rows read as real distinct people
  // instead of identical silhouettes.
  const audience = new THREE.Group();
  const audienceMembers = [];     // [{ root, head, hair, mood }]
  const numRows = Math.ceil(2 + crowd * 9);
  // Hard cap on audience members — each is ~9 un-instanced meshes, so the old
  // 16×33≈528-seat fill was ~4.7k draw calls and tanked the frame rate on
  // exactly the hardest (packed-auditorium) rungs. Fewer, believably-spaced
  // members read just as "full" without the cliff. Tighter on touch GPUs.
  const MAX_AUDIENCE = IS_COARSE_POINTER ? 90 : 170;
  const rowSpacing = 1.4;
  const seatSpacing = 0.85;
  const baseY = -1;
  // Skin / hair / shirt palette — varied so the crowd feels diverse
  const skinTones = [0xe8b794, 0xd4a07a, 0xb88863, 0x8a6442, 0x6a4a30, 0x5a3a22];
  const hairTones = [0x1a1410, 0x3a2418, 0x5a3a22, 0x8b6238, 0xa97442, 0xd4a86b, 0x9aa6b2];
  const shirtTones = [0x2c4a6e, 0x4a3a55, 0x6a3a3a, 0x3a5a3a, 0x4a4a55, 0x6a5a3a, 0x4a2c2a, 0x2c5a6e];

  function buildAudienceMember() {
    const person = new THREE.Group();
    // Seeded, not Math.random: a refresh mid-rung should put the same people
    // back in the same seats, while tomorrow's audience is a different crowd.
    const skinHex = skinTones[Math.floor(V.rng() * skinTones.length)];
    const hairHex = hairTones[Math.floor(V.rng() * hairTones.length)];
    const shirtHex = shirtTones[Math.floor(V.rng() * shirtTones.length)];
    // Small emissive lift so faces don't disappear into the auditorium dark.
    // Real audiences are slightly self-lit by phone screens / aisle lights /
    // crowd-glow; this gets the same effect without an extra light per face.
    // Kept low so members read as people, not glowing markers.
    const skinM = new THREE.MeshStandardMaterial({
      color: skinHex, roughness: 0.85,
      emissive: new THREE.Color(skinHex).multiplyScalar(0.08),
    });
    const hairM = new THREE.MeshStandardMaterial({
      color: hairHex, roughness: 1.0,
      emissive: new THREE.Color(hairHex).multiplyScalar(0.05),
    });
    const shirtM = new THREE.MeshStandardMaterial({
      color: shirtHex, roughness: 0.95,
      emissive: new THREE.Color(shirtHex).multiplyScalar(0.05),
    });
    // Torso
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.40, 6, 10), shirtM);
    torso.position.y = 0.35;
    torso.castShadow = true;
    person.add(torso);
    // Shoulders (round caps)
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.10, 10, 8), shirtM);
      shoulder.position.set(sx * 0.18, 0.55, 0);
      person.add(shoulder);
    }
    // Neck
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.10, 10), skinM);
    neck.position.y = 0.66;
    person.add(neck);
    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skinM);
    head.scale.set(0.95, 1.05, 0.95);
    head.position.y = 0.82;
    head.castShadow = true;
    person.add(head);
    // Hair cap (short style for everyone — keeps poly count low)
    const hair = new THREE.Mesh(
      new THREE.SphereGeometry(0.135, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
      hairM
    );
    hair.scale.copy(head.scale);
    hair.position.copy(head.position);
    person.add(hair);
    // Tiny eyes (so the figure reads as facing forward)
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.013, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0x141014 })
      );
      eye.position.set(sx * 0.04, 0.83, 0.115);
      person.add(eye);
    }
    // A phone some members raise — the dreaded "they're on their phones / not
    // even watching" cue. Emissive so it glows like a screen; hidden until raised.
    const phone = new THREE.Mesh(
      new THREE.PlaneGeometry(0.05, 0.09),
      new THREE.MeshBasicMaterial({ color: 0xaadcff })
    );
    phone.position.set(0.1, 0.56, 0.17);
    phone.visible = false;
    person.add(phone);
    return { root: person, head, hair, phone, mood: 0,
             nextPhone: 3 + Math.random() * 13, nextWhisper: 5 + Math.random() * 16, whisperT: 0 };
  }

  // crowd 0 = "Empty room / practising alone" → spawn no audience at all.
  // Every grid seat gets a CHAIR (instanced — three draw calls for the whole
  // hall), occupied or not: empty chairs sell a real auditorium. Rows rake
  // upward like one, members sit ON the seat pans, and the torso overlapping
  // the pan reads as hips/thighs (the figures used to be legless torsos
  // standing directly on a flat void).
  const ROW_RAKE = 0.07;
  if (crowd > 0) {
    const colCount = 2 + Math.floor(crowd * 9);
    const seatTotal = numRows * (colCount * 2 + 1);
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x323848, roughness: 0.9 });
    const chairSeat = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.05, 0.45), chairMat, seatTotal);
    const chairBack = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.5, 0.04), chairMat, seatTotal);
    const chairLegs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.04, 0.42, 0.40), chairMat, seatTotal * 2);
    const _cm = new THREE.Matrix4();
    let seatIdx = 0, legIdx = 0;
    for (let row = 0; row < numRows; row++) {
      for (let col = -colCount; col <= colCount; col++) {
        const sx = col * seatSpacing;
        const sy = baseY + row * ROW_RAKE;
        const sz = -3 - row * rowSpacing;
        chairSeat.setMatrixAt(seatIdx, _cm.makeTranslation(sx, sy + 0.425, sz));
        chairBack.setMatrixAt(seatIdx, _cm.makeTranslation(sx, sy + 0.70, sz - 0.225));
        seatIdx++;
        for (const lx of [-0.23, 0.23]) {
          chairLegs.setMatrixAt(legIdx++, _cm.makeTranslation(sx + lx, sy + 0.21, sz));
        }
        // Fill the seat with a person (same odds + cap as before)
        if (audienceMembers.length >= MAX_AUDIENCE) continue;
        if (Math.random() > Math.min(0.9, 0.3 + crowd * 0.75)) continue;
        const m = buildAudienceMember();
        m.root.position.set(sx, sy + 0.42, sz);
        audience.add(m.root);
        audienceMembers.push(m);
      }
    }
    chairSeat.instanceMatrix.needsUpdate = true;
    chairBack.instanceMatrix.needsUpdate = true;
    chairLegs.instanceMatrix.needsUpdate = true;
    audience.add(chairSeat, chairBack, chairLegs);
  }
  scene.add(audience);

  // Back wall + curtains
  const curtain = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 12),
    new THREE.MeshStandardMaterial({ color: 0x4a1a28, roughness: 1.0 })
  );
  curtain.position.set(0, 4, 4);
  curtain.rotation.y = Math.PI;
  scene.add(curtain);

  camera.fov = 60;
  camera.updateProjectionMatrix();

  let speakingPressed = false;     // hold-to-speak state
  let pauseSilence = 0;            // 0..1 — temporary "pause" silence
  // (confidence is declared earlier, near the water glass, to avoid a TDZ in takeSip)
  let speakingControls = null;
  let applauseT = 0;               // >0 — the room is applauding; everyone looks up
  let nextCrowdFx = 5 + Math.random() * 8;   // next positioned cough/shuffle
  let murmurVoice = null;          // the user's own muffled speech (lazy — needs an unlocked ctx)
  let skHands = null;              // Hands rig captured from interact() for the sip carry
  const _lectPt = new THREE.Vector3();
  function wireSpeakingCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="speaking"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    const speakBtn = bar.querySelector('[data-cmd="speak"]');
    if (speakBtn) {
      const press = () => {
        speakingPressed = true;
        speakBtn.classList.add("pressed");
        if (window.PhobiaVoice && Math.random() < 0.15) {
          window.PhobiaVoice.speak("Speak slowly. Pause when you need to.");
        }
      };
      const release = () => {
        speakingPressed = false;
        speakBtn.classList.remove("pressed");
      };
      speakBtn.addEventListener("pointerdown", (e) => { e.stopPropagation(); press(); });
      speakBtn.addEventListener("pointerup",   (e) => { e.stopPropagation(); release(); });
      speakBtn.addEventListener("pointerleave", release);
      speakBtn.addEventListener("pointercancel", release);
    }
    const pauseBtn = bar.querySelector('[data-cmd="pause"]');
    if (pauseBtn) {
      pauseBtn.onclick = (e) => {
        e.stopPropagation();
        pauseSilence = 1.0;
        if (window.PhobiaVoice) window.PhobiaVoice.speak("Pause. Their attention waits for you. Breathe.");
      };
    }
    const sipBtn = bar.querySelector('[data-cmd="sip"]');
    if (sipBtn) {
      sipBtn.onclick = (e) => { e.stopPropagation(); takeSip(); };
    }
    const notesBtn = bar.querySelector('[data-cmd="notes"]');
    if (notesBtn) {
      notesBtn.onclick = (e) => {
        e.stopPropagation();
        // Tilt camera down toward notes briefly
        if (speakingControls) {
          const fromP = speakingControls.pitch, toP = -0.25;
          let k = 0;
          const id = setInterval(() => {
            k += 0.06;
            if (k >= 1) { speakingControls.pitch = toP; clearInterval(id); return; }
            speakingControls.pitch = fromP + (toP - fromP) * k;
          }, 16);
        }
        if (window.PhobiaVoice) window.PhobiaVoice.speak("Your bullet points. The next line is right there.");
        confidence = Math.min(1, confidence + 0.05);
      };
    }
  }
  // Spacebar = hold to speak (so the user keeps their mouse free)
  function onSpeakKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.code !== "Space") return;
    e.preventDefault();
    if (e.type === "keydown") speakingPressed = true;
    else speakingPressed = false;
  }
  window.addEventListener("keydown", onSpeakKey);
  window.addEventListener("keyup", onSpeakKey);

  // Click-on-glass raycaster — sipping by clicking the actual prop is the
  // "real human action" version of the Sip Water button.
  const skRaycaster = new THREE.Raycaster();
  const skMouse = new THREE.Vector2();
  let skCanvas = null;
  let skDownX = 0, skDownY = 0, skDownT = 0, skPid = -1;
  function bindGlassClick() {
    skCanvas = document.querySelector("#stage canvas");
    if (!skCanvas) return;
    skCanvas.addEventListener("pointerdown", (e) => {
      skDownX = e.clientX; skDownY = e.clientY;
      skDownT = performance.now(); skPid = e.pointerId;
    });
    skCanvas.addEventListener("pointerup", (e) => {
      if (e.pointerId !== skPid) return;
      const dx = e.clientX - skDownX, dy = e.clientY - skDownY;
      if (Math.hypot(dx, dy) > 6 || performance.now() - skDownT > 350) return;
      const rect = skCanvas.getBoundingClientRect();
      skMouse.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      skMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      skRaycaster.setFromCamera(skMouse, camera);
      const hits = skRaycaster.intersectObject(glass, true);
      if (hits.length > 0) takeSip();
    });
  }
  setTimeout(bindGlassClick, 60);
  setTimeout(wireSpeakingCmds, 0);

  // Confidence HUD — small badge at the top-left of the stage
  let confHud = null;
  setTimeout(() => {
    const stageEl = document.getElementById("stage");
    if (!stageEl) return;
    let hud = stageEl.querySelector(".trust-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "trust-hud";
      hud.innerHTML = `
        <div class="trust-row">
          <div class="trust-name">Confidence</div>
          <div class="trust-pct">0%</div>
        </div>
        <div class="trust-bar"><div class="trust-bar-fill"></div></div>
        <div class="trust-hint">Hold to speak (Space) · sip · glance at notes</div>
      `;
      stageEl.appendChild(hud);
    }
    confHud = hud;
  }, 80);

  return {
    controls: {
      mode: "lookOnly",
      initialPos: [0, 0.4, 0],
      // Three.js camera default-forward is -z. The audience is built at
      // negative z (z = -3 to z = -25), so yaw = 0 already faces them. Previous
      // code set initialYaw = π which flipped the camera 180° AWAY from the
      // crowd, leaving the user staring at the dark back wall.
      initialYaw: 0,
      initialPitch: -0.05,
      lookSpeed: 0.0035,
      pitchMin: -0.3, pitchMax: 0.3,
      cameraModeLocked: "fp",        // standing at the lectern — FP only
    },
    hands: { sleeveColor: 0x2a2a30 },
    bloom: { strength: 0.6, threshold: 0.85 },
    interact(controls) {
      // Looking down at the podium → grip it
      if (controls.pitch < -0.15) return { gesture: "grab", hint: "click the glass to sip · grip the lectern" };
      return {
        gesture: "rest",
        hint: speakingPressed
          ? "speaking · keep going at your own pace"
          : "hold Space to speak · click the glass to sip · click notes for your bullets",
      };
    },
    onClick() {},
    update(t, controls, dt) {
      if (controls) speakingControls = controls;
      const d = dt || 0.016;
      // Subtle audience murmur — tiny head movements (smaller when "speaking")
      // Each member has their own head we can rotate independently of the
      // body, so the murmur reads as people looking around / nodding rather
      // than the whole body twisting.
      const settle = (speakingPressed || pauseSilence > 0.5) ? 0.2 : 1.0;
      audienceMembers.forEach((m, i) => {
        let headY = Math.sin(t * 0.5 + i * 0.7) * 0.10 * settle;
        let headX = 0;
        // High-confidence speakers earn nods from a chunk of the crowd; when you
        // falter (low confidence) some glance down/away — disengaged, which is
        // exactly what glossophobia reads as ("I'm losing them").
        if (i % 4 === 0 && confidence > 0.3) headX = Math.sin(t * 0.9 + i) * 0.10 * (confidence - 0.2);
        else if (confidence < 0.25 && i % 3 === 1) headX = 0.16;
        // Phone glances — a member raises a phone and looks down at the screen.
        m.nextPhone -= d;
        if (m.nextPhone <= 0) {
          m.phone.visible = !m.phone.visible;
          m.nextPhone = m.phone.visible ? (2.5 + Math.random() * 4) : (7 + Math.random() * 16);
        }
        if (m.phone.visible) headX = 0.34;            // head down at the screen
        // Whisper to a neighbour — head turns to the side for a beat.
        m.nextWhisper -= d;
        if (m.nextWhisper <= 0) { m.whisperT = 1.0; m.nextWhisper = 9 + Math.random() * 18; }
        if (m.whisperT > 0) { m.whisperT -= d; headY = (i % 2 ? 0.5 : -0.5); }
        m.head.rotation.y = headY; m.head.rotation.x = headX;
        m.hair.rotation.y = headY; m.hair.rotation.x = headX;
        // Body life: a slow breathing rise and a faint individual sway —
        // without these the bodies are mannequins under moving heads.
        m.root.scale.y = 1 + Math.sin(t * 0.8 + i * 1.31) * 0.008;
        m.root.rotation.z = Math.sin(t * 0.23 + i * 2.17) * 0.012;
      });
      // Friendly face — nods when the user is actively speaking
      if (friendlyHead) {
        const nodAmt = speakingPressed ? 0.12 : 0.02;
        friendlyHead.rotation.x = Math.sin(t * (speakingPressed ? 2.5 : 0.6)) * nodAmt;
      }
      // Camera nervous sway, dampened when speaking, paused, or confident.
      const confDamp = 1 - confidence * 0.4;
      const sway = (speakingPressed ? 0.4 : 1.0) * (1 - pauseSilence * 0.6) * confDamp;
      camera.position.y += Math.sin(t * 1.6) * 0.012 * (0.4 + crowd) * sway;
      camera.rotation.z += Math.sin(t * 0.7) * 0.004 * crowd * sway;
      if (pauseSilence > 0) pauseSilence = Math.max(0, pauseSilence - d * 0.25);
      // ---- Speech progression ----
      // While the user holds the speak button, the current line on the page
      // fills its progress bar at a rate tied to its character count (rough
      // proxy for reading time, ~14 chars per second). When the bar fills,
      // we advance to the next line. When the script ends, voice + applause
      // cue trigger and the line resets so the user can speak again.
      if (speakingPressed && currentLine < speechLines.length) {
        const charsPerSec = 14;
        const lineDuration = Math.max(1.2, speechLines[currentLine].length / charsPerSec);
        lineProgress += d / lineDuration;
        if (lineProgress >= 1) {
          lineProgress = 0;
          currentLine++;
          if (currentLine >= speechLines.length) {
            // Speech finished — earn full confidence + a celebratory cue
            confidence = Math.min(1, confidence + 0.30);
            if (window.PhobiaVoice) {
              window.PhobiaVoice.speak("You finished it. Notice how the room is still here.");
            }
          }
        }
        drawNoteCanvas();
      }
      // Confidence grows slowly while speaking, decays slowly when not
      if (speakingPressed) {
        confidence = Math.min(1, confidence + d * 0.02);
      } else {
        confidence = Math.max(0, confidence - d * 0.005);
      }
      // ---- Fear inputs ----
      // This scene never fed PhobiaFear, so the meter, heartbeat, vignette
      // and fear-weighted hold credit were all dead during the one scene
      // that is pure performance anxiety. Standing before the crowd is the
      // baseline; actively speaking while they watch is the engagement;
      // confidence earned by getting through lines softens both — which IS
      // the habituation curve the rung is teaching.
      if (window.PhobiaFear) {
        window.PhobiaFear.setInput("proximity", (0.35 + crowd * 0.45) * (1 - confidence * 0.45));
        window.PhobiaFear.setInput("gaze", speakingPressed ? (0.85 - confidence * 0.45) : 0.12);
      }

      // ---- Sip animation ----
      // sipPhase 1.0 → 0 over ~1.6s. The glass lifts toward the camera, tips
      // slightly, then returns. Camera also tilts up subtly so it reads as
      // "I'm raising the glass to my lips" rather than "the glass is moving."
      if (sipPhase > 0) {
        sipPhase = Math.max(0, sipPhase - d * 0.65);
        // Tracking arc: glass rises from podium toward where the lips would be
        // (close to camera, slightly forward of mouth)
        const k = 1 - sipPhase;       // 0..1 over the sip
        // Bell curve so it goes up, holds at lips, comes back down
        const arc = Math.sin(k * Math.PI);
        glass.position.y = glassBaseY + arc * 0.35;
        // Move slightly toward the camera as it lifts
        glass.position.z = -0.55 + arc * 0.20;
        // Tip the glass when at the lips
        glass.rotation.x = arc * 0.6;
        if (controls && k > 0.3 && k < 0.7) {
          // Camera tips up a touch during the sip
          controls.pitch = Math.min(0.3, controls.pitch + d * 0.15);
        }
      } else if (Math.abs(glass.position.y - glassBaseY) > 0.001) {
        // Snap back any residual offset
        glass.position.y = glassBaseY;
        glass.position.z = -0.55;
        glass.rotation.x = 0;
      }
      // Water level tween
      water.scale.y = 0.1 + waterLevel * 0.9;
      water.position.y = 0.005 + (water.scale.y * 0.08) / 2;

      // Confidence HUD update
      if (confHud) {
        const pct = Math.round(confidence * 100);
        confHud.querySelector(".trust-bar-fill").style.width = pct + "%";
        confHud.querySelector(".trust-pct").textContent = pct + "%";
      }
    },
    dispose() {
      try {
        window.removeEventListener("keydown", onSpeakKey);
        window.removeEventListener("keyup", onSpeakKey);
      } catch {}
      const stageEl = document.getElementById("stage");
      if (stageEl) {
        const hud = stageEl.querySelector(".trust-hud");
        if (hud) hud.remove();
      }
    },
  };
}

export { setupSpeaking };
