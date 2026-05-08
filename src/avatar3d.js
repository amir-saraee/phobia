/* avatar3d — extended character options + a parametric humanoid builder
 * that uses PhobiaRealism PBR materials. The existing in-page buildAvatarFigure
 * stays as a fallback; this module exposes a richer alternative that responds
 * to bodyType, height, age, eyeShape, jawShape, and noseShape so two
 * characters with the same colours can still feel like different people.
 *
 * Exposes window.PhobiaAvatar3D. Two consumers:
 *  1. The character-creator preview (AvatarPreview) — calls .buildFigure(c).
 *  2. The in-scene Body class — calls .applyMaterials(body) after build.
 */
(function () {
  "use strict";

  // ---- Extended attribute palettes ----
  const BODY_TYPES = [
    { id: "slim",      label: "Slim",      widthMul: 0.85, heightMul: 1.02 },
    { id: "average",   label: "Average",   widthMul: 1.00, heightMul: 1.00 },
    { id: "athletic",  label: "Athletic",  widthMul: 1.10, heightMul: 1.00 },
    { id: "round",     label: "Rounded",   widthMul: 1.25, heightMul: 0.96 },
    { id: "tall",      label: "Tall",      widthMul: 0.95, heightMul: 1.08 },
  ];
  const AGE_GROUPS = [
    { id: "young",  label: "Young",  wrinkles: 0.0, hairThickness: 1.0 },
    { id: "adult",  label: "Adult",  wrinkles: 0.2, hairThickness: 1.0 },
    { id: "mature", label: "Mature", wrinkles: 0.5, hairThickness: 0.85 },
    { id: "elder",  label: "Elder",  wrinkles: 0.85,hairThickness: 0.70 },
  ];
  const EYE_SHAPES = [
    { id: "round",   label: "Round",   xScale: 1.0,  yScale: 1.0  },
    { id: "almond",  label: "Almond",  xScale: 1.20, yScale: 0.85 },
    { id: "narrow",  label: "Narrow",  xScale: 1.10, yScale: 0.70 },
    { id: "wide",    label: "Wide",    xScale: 1.30, yScale: 1.05 },
  ];
  const JAW_SHAPES = [
    { id: "soft",    label: "Soft",    width: 0.92, drop: 0.95 },
    { id: "balanced",label: "Balanced",width: 1.00, drop: 1.00 },
    { id: "square",  label: "Square",  width: 1.10, drop: 1.05 },
    { id: "pointed", label: "Pointed", width: 0.85, drop: 1.10 },
  ];
  const NOSE_SHAPES = [
    { id: "small",    label: "Small",   scale: 0.80 },
    { id: "balanced", label: "Balanced",scale: 1.00 },
    { id: "long",     label: "Long",    scale: 1.20, lengthMul: 1.20 },
    { id: "broad",    label: "Broad",   scale: 1.10, widthMul: 1.30 },
  ];

  function findById(arr, id, fallback = 1) {
    return arr.find(x => x.id === id) || arr[fallback];
  }

  // ---- Build a figure with the new parametric attributes ----
  // Falls back to the legacy buildAvatarFigure if THREE/realism aren't ready.
  function buildFigure(c = {}) {
    const THREE = window.THREE;
    const PR    = window.PhobiaRealism;
    if (!THREE) return null;

    const skin   = c.skinHex   || "#e8b794";
    const hair   = c.hairHex   || "#4a2c18";
    const shirt  = c.shirtHex  || "#2c9d96";
    const pants  = c.pantsHex  || "#2c3a52";
    const eye    = c.eyeHex    || "#3a2410";

    const body = findById(BODY_TYPES, c.bodyType, 1);
    const age  = findById(AGE_GROUPS, c.ageGroup, 1);
    const eyeShape = findById(EYE_SHAPES, c.eyeShape, 0);
    const jaw  = findById(JAW_SHAPES, c.jawShape, 1);
    const nose = findById(NOSE_SHAPES, c.noseShape, 1);
    const heightMul = body.heightMul * (c.heightMul || 1);
    const widthMul  = body.widthMul  * (c.widthMul  || 1);

    const skinM  = PR ? PR.skinMaterial(skin)             : new THREE.MeshStandardMaterial({ color: skin, roughness: 0.78 });
    const hairM  = PR ? PR.hairMaterial(hair)             : new THREE.MeshStandardMaterial({ color: hair, roughness: 1.0 });
    const shirtM = PR ? PR.fabricMaterial(shirt, "cotton"): new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.85 });
    const pantsM = PR ? PR.fabricMaterial(pants, "denim") : new THREE.MeshStandardMaterial({ color: pants, roughness: 0.95 });
    const skinShM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(skin).multiplyScalar(0.82).getHex(), roughness: 0.85,
    });
    const lipsM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(skin).lerp(new THREE.Color(0xb8525a), 0.45).getHex(), roughness: 0.55,
    });
    const eyeWhiteM = new THREE.MeshStandardMaterial({ color: 0xfff4ea, roughness: 0.30 });
    const irisM = new THREE.MeshStandardMaterial({ color: eye, roughness: 0.25, metalness: 0.18 });
    const shoeM = new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.5 });
    const beltM = new THREE.MeshStandardMaterial({ color: 0x2a1f18, roughness: 0.55, metalness: 0.2 });

    const group = new THREE.Group();

    // ===== HEAD =====
    const head = new THREE.Group();
    head.position.y = 1.55 * heightMul;
    group.add(head);

    // Cranium — egg-shaped
    const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.20, 32, 24), skinM);
    cranium.scale.set(1.0, 1.05, 0.95);
    cranium.position.y = 0.05;
    cranium.castShadow = true;
    head.add(cranium);

    // Jaw — width / drop driven by jaw shape
    const jawMesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 24, 18), skinM);
    jawMesh.scale.set(0.85 * jaw.width, 0.55 * jaw.drop, 0.85);
    jawMesh.position.set(0, -0.10, 0.005);
    head.add(jawMesh);

    // Chin (forward bulge)
    const chin = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10), skinM);
    chin.scale.set(0.75 * jaw.width, 0.55 * jaw.drop, 0.7);
    chin.position.set(0, -0.16 * jaw.drop, 0.07);
    head.add(chin);

    // Ears
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), skinM);
      ear.scale.set(0.45, 1.2, 0.7);
      ear.position.set(sx * 0.20, 0.0, -0.005);
      head.add(ear);
    }

    // Nose — size + length + width per nose shape
    const noseScale = nose.scale || 1;
    const noseLength = nose.lengthMul || 1;
    const noseWidth = nose.widthMul || 1;
    const noseBridge = new THREE.Mesh(new THREE.SphereGeometry(0.025 * noseScale, 10, 8), skinM);
    noseBridge.scale.set(1.0 * noseWidth, 1.6 * noseLength, 1.6);
    noseBridge.position.set(0, 0.005, 0.18);
    head.add(noseBridge);
    const noseTip = new THREE.Mesh(new THREE.SphereGeometry(0.032 * noseScale, 12, 10), skinM);
    noseTip.scale.set(1.0 * noseWidth, 0.85, 1.4);
    noseTip.position.set(0, -0.045 * noseLength, 0.21);
    head.add(noseTip);
    for (const sx of [-1, 1]) {
      const nostril = new THREE.Mesh(
        new THREE.SphereGeometry(0.011 * noseScale, 8, 6), skinShM
      );
      nostril.position.set(sx * 0.018 * noseWidth, -0.062 * noseLength, 0.235);
      head.add(nostril);
    }

    // Eyes — eye shape drives width/height
    const eyeRefs = [];
    for (const sx of [-1, 1]) {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(sx * 0.075, 0.025, 0.16);
      head.add(eyeGroup);

      const white = new THREE.Mesh(new THREE.SphereGeometry(0.040, 16, 14), eyeWhiteM);
      white.scale.set(eyeShape.xScale, eyeShape.yScale, 0.55);
      white.position.set(0, 0, 0.005);
      eyeGroup.add(white);

      const iris = new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 12), irisM);
      iris.position.set(0, 0, 0.022);
      iris.scale.set(eyeShape.xScale, eyeShape.yScale, 0.4);
      eyeGroup.add(iris);

      const pupil = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0x080404 })
      );
      pupil.position.set(0, 0, 0.034);
      eyeGroup.add(pupil);

      const hl = new THREE.Mesh(
        new THREE.SphereGeometry(0.0075, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      hl.position.set(sx * 0.008, 0.01, 0.040);
      eyeGroup.add(hl);

      const lid = new THREE.Mesh(
        new THREE.SphereGeometry(0.042, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        skinM
      );
      lid.scale.set(eyeShape.xScale, 0.05, 0.55);
      lid.position.set(0, 0.005, 0.005);
      eyeGroup.add(lid);

      eyeRefs.push({ group: eyeGroup, lid });
    }

    // Eyebrows — match hair colour. Slightly lower for elder (downturn).
    const browM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(hair).multiplyScalar(0.78).getHex(), roughness: 1.0,
    });
    for (const sx of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.012, 0.022), browM);
      brow.position.set(sx * 0.075, 0.075 - age.wrinkles * 0.005, 0.18);
      brow.rotation.z = -sx * (0.08 + age.wrinkles * 0.02);
      head.add(brow);
    }

    // Mouth (lips)
    const upperLip = new THREE.Mesh(
      new THREE.TorusGeometry(0.038, 0.008, 8, 14, Math.PI),
      lipsM
    );
    upperLip.rotation.z = -Math.PI / 2;
    upperLip.rotation.x = -0.2;
    upperLip.position.set(0, -0.075, 0.205);
    head.add(upperLip);
    const lowerLip = new THREE.Mesh(
      new THREE.TorusGeometry(0.038, 0.011, 8, 14, Math.PI),
      lipsM
    );
    lowerLip.rotation.z = Math.PI / 2;
    lowerLip.rotation.x = 0.2;
    lowerLip.position.set(0, -0.105, 0.205);
    head.add(lowerLip);
    const mouthShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.06, 0.005),
      new THREE.MeshBasicMaterial({ color: 0x4a1a1a, transparent: true, opacity: 0.45 })
    );
    mouthShadow.position.set(0, -0.090, 0.215);
    head.add(mouthShadow);

    // Cheek warmth
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 10, 8),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(skin).lerp(new THREE.Color(0xe07a72), 0.25).getHex(),
          roughness: 0.9, transparent: true, opacity: 0.55,
        })
      );
      cheek.scale.set(1.0, 0.6, 0.3);
      cheek.position.set(sx * 0.13, -0.05, 0.165);
      head.add(cheek);
    }

    // Age wrinkles — small darker streaks under eyes / on forehead
    if (age.wrinkles > 0.05) {
      const wrinkleM = new THREE.MeshBasicMaterial({
        color: 0x6a4030, transparent: true, opacity: 0.35 * age.wrinkles, depthWrite: false,
      });
      // Crow's-feet (4 lines, two each side)
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 2; i++) {
          const line = new THREE.Mesh(
            new THREE.PlaneGeometry(0.022, 0.002),
            wrinkleM
          );
          line.position.set(sx * 0.13, 0.025 - i * 0.012, 0.176);
          line.rotation.z = sx * (0.5 - i * 0.1);
          head.add(line);
        }
      }
      // Forehead lines (2 horizontal)
      for (let i = 0; i < 2; i++) {
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(0.16, 0.003),
          wrinkleM
        );
        line.position.set(0, 0.105 + i * 0.02, 0.170);
        head.add(line);
      }
    }

    // ===== HAIR =====
    const hairStyle = c.hairStyle || "short";
    const hairThickness = age.hairThickness;
    const hairOpacity = 0.85 + 0.15 * hairThickness;
    const hairOpts = { transparent: hairThickness < 0.95, opacity: hairOpacity };
    const dynamicHairMat = hairThickness < 0.95
      ? new THREE.MeshStandardMaterial({ ...hairM, color: 0xffffff, transparent: true, opacity: hairOpacity })
      : hairM;
    if (hairStyle === "short") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.205, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairM
      );
      cap.scale.copy(cranium.scale);
      cap.position.copy(cranium.position);
      head.add(cap);
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(0.10, 14, 10), hairM);
      fringe.scale.set(1.4, 0.4, 0.5);
      fringe.position.set(0, 0.10, 0.16);
      head.add(fringe);
    } else if (hairStyle === "buzz") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.202, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.45),
        new THREE.MeshStandardMaterial({ color: hair, roughness: 1.0, transparent: true, opacity: 0.85 })
      );
      cap.scale.copy(cranium.scale);
      cap.position.copy(cranium.position);
      head.add(cap);
    } else if (hairStyle === "long") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.21, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairM
      );
      cap.scale.copy(cranium.scale);
      cap.position.copy(cranium.position);
      head.add(cap);
      for (const sx of [-1, 1]) {
        const fall = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 0.55, 12), hairM);
        fall.position.set(sx * 0.16, -0.18, -0.05);
        fall.rotation.z = sx * 0.05;
        head.add(fall);
      }
      const back = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.10, 0.45, 16), hairM);
      back.position.set(0, -0.10, -0.13);
      back.rotation.x = -0.2;
      head.add(back);
    } else if (hairStyle === "pony") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.205, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairM
      );
      cap.scale.copy(cranium.scale);
      cap.position.copy(cranium.position);
      head.add(cap);
      const tieGroup = new THREE.Group();
      tieGroup.position.set(0, 0.02, -0.18);
      head.add(tieGroup);
      const tie = new THREE.Mesh(
        new THREE.TorusGeometry(0.045, 0.012, 8, 14),
        new THREE.MeshStandardMaterial({ color: 0xc92e2e, roughness: 0.8 })
      );
      tie.rotation.x = Math.PI / 2;
      tieGroup.add(tie);
      const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.025, 0.40, 14), hairM);
      tail.position.set(0, -0.18, -0.04);
      tail.rotation.x = -0.18;
      tieGroup.add(tail);
    } else if (hairStyle === "curly") {
      const r = 0.075;
      const positions = [
        [-0.13,  0.10,  0.10], [ 0.13,  0.10,  0.10],
        [-0.18,  0.05,  0.0 ], [ 0.18,  0.05,  0.0 ],
        [ 0.0,   0.16,  0.05], [-0.10,  0.18, -0.05], [ 0.10,  0.18, -0.05],
        [-0.16,  0.05, -0.10], [ 0.16,  0.05, -0.10],
        [ 0.0,   0.10, -0.13],
      ];
      for (const [x, y, z] of positions) {
        const curl = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), hairM);
        curl.position.set(x, y, z);
        curl.scale.setScalar(0.85 + Math.random() * 0.3);
        head.add(curl);
      }
    }
    // bald → no hair

    // GLASSES
    if (c.glasses && c.glasses !== "none") {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1414, metalness: 0.5, roughness: 0.35 });
      if (c.glasses === "round") {
        for (const sx of [-1, 1]) {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.008, 8, 18), frameMat);
          ring.position.set(sx * 0.075, 0.025, 0.20);
          ring.rotation.y = Math.PI / 2;
          head.add(ring);
        }
      } else {
        for (const sx of [-1, 1]) {
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.055, 0.007, 4, 12), frameMat
          );
          ring.position.set(sx * 0.075, 0.025, 0.20);
          ring.rotation.y = Math.PI / 2;
          ring.rotation.z = Math.PI / 4;
          ring.scale.set(1.0, 1.0, 0.9);
          head.add(ring);
        }
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.008, 0.008), frameMat);
      bridge.position.set(0, 0.025, 0.20);
      head.add(bridge);
      for (const sx of [-1, 1]) {
        const temple = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.006, 0.006), frameMat);
        temple.position.set(sx * 0.16, 0.025, 0.10);
        temple.rotation.y = sx * 0.55;
        head.add(temple);
      }
    }

    // FACIAL HAIR
    if (c.facialHair && c.facialHair !== "none") {
      const fhM = new THREE.MeshStandardMaterial({
        color: new THREE.Color(hair).multiplyScalar(0.78).getHex(), roughness: 1.0,
      });
      if (c.facialHair === "moustache") {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.018, 0.025), fhM);
        m.position.set(0, -0.057, 0.215);
        m.rotation.x = -0.15;
        head.add(m);
      } else if (c.facialHair === "stubble") {
        const cover = new THREE.Mesh(
          new THREE.SphereGeometry(0.205, 24, 18, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.32),
          new THREE.MeshStandardMaterial({ color: new THREE.Color(hair).multiplyScalar(0.78).getHex(), roughness: 1.0, transparent: true, opacity: 0.45 })
        );
        cover.scale.copy(cranium.scale);
        cover.position.copy(cranium.position);
        head.add(cover);
      } else if (c.facialHair === "beard") {
        const beardCap = new THREE.Mesh(
          new THREE.SphereGeometry(0.207, 24, 18, 0, Math.PI * 2, Math.PI * 0.50, Math.PI * 0.45),
          fhM
        );
        beardCap.scale.set(cranium.scale.x * 1.0, cranium.scale.y * 1.05, cranium.scale.z * 1.05);
        beardCap.position.copy(cranium.position);
        head.add(beardCap);
        const ms = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.014, 0.022), fhM);
        ms.position.set(0, -0.057, 0.215);
        ms.rotation.x = -0.12;
        head.add(ms);
      }
    }

    // ===== NECK =====
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.095, 0.18, 18), skinM);
    neck.position.y = 1.32 * heightMul;
    group.add(neck);

    // ===== TORSO =====
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.20, 28, 20), shirtM);
    chest.scale.set(1.30 * widthMul, 1.05 * heightMul, 0.70 * widthMul);
    chest.position.y = 1.10 * heightMul;
    chest.castShadow = true;
    group.add(chest);
    const seamM = new THREE.MeshStandardMaterial({
      color: new THREE.Color(shirt).multiplyScalar(0.78).getHex(), roughness: 0.85,
    });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.45, 0.005), seamM);
    seam.position.set(0, 0.95 * heightMul, 0.142 * widthMul);
    group.add(seam);

    const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.20, 0.30, 18), shirtM);
    waist.scale.set(1.18 * widthMul, 1, 0.78 * widthMul);
    waist.position.y = 0.78 * heightMul;
    waist.castShadow = true;
    group.add(waist);

    // Belt
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.20, 0.05, 20), beltM);
    belt.scale.set(1.18 * widthMul, 1, 0.78 * widthMul);
    belt.position.y = 0.62 * heightMul;
    group.add(belt);
    const buckle = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.045, 0.012),
      new THREE.MeshStandardMaterial({ color: 0xc4a64a, metalness: 0.85, roughness: 0.25 })
    );
    buckle.position.set(0, 0.62 * heightMul, 0.165 * widthMul);
    group.add(buckle);

    // ===== SHOULDERS =====
    for (const sx of [-1, 1]) {
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.10, 16, 12), shirtM);
      sh.position.set(sx * 0.22 * widthMul, 1.22 * heightMul, 0);
      sh.castShadow = true;
      group.add(sh);
    }

    // ===== ARMS =====
    const armRefs = [];
    const upperArmLen = 0.30;
    const forearmLen = 0.28;
    for (const sx of [-1, 1]) {
      const armRoot = new THREE.Group();
      armRoot.position.set(sx * 0.22 * widthMul, 1.18 * heightMul, 0);
      armRoot.rotation.z = sx * 0.06;
      armRoot.rotation.x = 0.04;
      group.add(armRoot);

      const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, upperArmLen, 8, 14), shirtM);
      upper.position.set(0, -upperArmLen / 2, 0);
      upper.castShadow = true;
      armRoot.add(upper);

      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.025, 14), seamM);
      cuff.position.set(0, -upperArmLen - 0.005, 0);
      armRoot.add(cuff);

      const elbow = new THREE.Group();
      elbow.position.set(0, -upperArmLen - 0.02, 0);
      armRoot.add(elbow);

      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, forearmLen, 8, 14), skinM);
      fore.position.set(0, -forearmLen / 2, 0);
      fore.castShadow = true;
      elbow.add(fore);

      const hand = new THREE.Group();
      hand.position.set(0, -forearmLen - 0.04, 0);
      elbow.add(hand);
      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.065, 14, 12), skinM);
      palm.scale.set(0.8, 1.1, 0.5);
      hand.add(palm);
      const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.04, 6, 8), skinM);
      thumb.position.set(sx * 0.04, 0.02, 0.015);
      thumb.rotation.z = -sx * 0.4;
      hand.add(thumb);
      const fingers = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.07, 0.025), skinM);
      fingers.position.set(0, -0.06, 0);
      hand.add(fingers);

      armRefs.push({ root: armRoot, elbow, hand, side: sx });
    }

    // ===== LEGS =====
    const legRefs = [];
    const thighLen = 0.36;
    const shinLen = 0.32;
    const hipY = 0.79 * heightMul;
    for (const sx of [-1, 1]) {
      const legRoot = new THREE.Group();
      legRoot.position.set(sx * 0.10 * widthMul, hipY, 0);
      group.add(legRoot);

      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095 * widthMul, thighLen, 8, 14), pantsM);
      thigh.position.set(0, -thighLen / 2, 0);
      thigh.castShadow = true;
      legRoot.add(thigh);

      const knee = new THREE.Group();
      knee.position.set(0, -thighLen - 0.02, 0);
      legRoot.add(knee);

      const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 * widthMul, shinLen, 8, 14), pantsM);
      shin.position.set(0, -shinLen / 2, 0);
      shin.castShadow = true;
      knee.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.22), shoeM);
      foot.position.set(0, -shinLen - 0.05, 0.04);
      foot.castShadow = true;
      knee.add(foot);
      const sole = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.018, 0.225),
        new THREE.MeshStandardMaterial({ color: 0x0c0c10, roughness: 0.85 })
      );
      sole.position.set(0, -shinLen - 0.085, 0.04);
      knee.add(sole);

      legRefs.push({ root: legRoot, knee, side: sx });
    }

    // Floor shadow
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.45, 28),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.30 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -0.001;
    group.add(shadow);

    // Idle animate
    group.userData.animate = function (t) {
      chest.scale.y = (1.05 * heightMul) + Math.sin(t * 1.6) * 0.012;
      waist.scale.y = 1.0 + Math.sin(t * 1.6 + 0.4) * 0.006;
      head.rotation.y = Math.sin(t * 0.6) * 0.06;
      head.rotation.z = Math.sin(t * 0.45) * 0.015;
      const blinkPeriod = 3.5;
      const blinkPhase = (t % blinkPeriod) / blinkPeriod;
      let lidY = 0.05;
      if (blinkPhase < 0.04) {
        const k = blinkPhase / 0.04;
        lidY = 0.05 + Math.sin(k * Math.PI) * 0.95;
      }
      eyeRefs.forEach(e => { e.lid.scale.y = lidY * eyeShape.yScale; });
      armRefs.forEach(a => {
        a.root.rotation.x = 0.04 + Math.sin(t * 1.6 + a.side * 0.3) * 0.01;
        a.elbow.rotation.x = 0.06 + Math.sin(t * 1.6 + a.side) * 0.012;
      });
    };
    return group;
  }

  function publish() {
    window.PhobiaAvatar3D = {
      buildFigure,
      BODY_TYPES, AGE_GROUPS, EYE_SHAPES, JAW_SHAPES, NOSE_SHAPES,
    };
  }
  publish();
})();
