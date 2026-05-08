/* Lifted creature builds for the phobia simulator — spiders, snakes, and a
 * crowd of varied audience members. All built procedurally on top of the
 * shared PhobiaRealism PBR materials so they pick up normal-mapped detail
 * (chitin bristles, snake scales, fabric weave) without any imported assets.
 *
 * Exposes window.PhobiaCreatures. Each builder returns a THREE.Group plus
 * helper handles (head, joints, animate(t)) so the calling scene can drive
 * idle motion with one function call per frame.
 *
 * Counts per build are deliberately modest (one spider ≈ 1.5k tris, snake
 * ≈ 3k tris, audience member ≈ 600 tris) so a full crowd scene still ships
 * comfortably under 200k tris on mid-range mobile.
 */
(function () {
  "use strict";

  // ----- Spider -----
  // 8 articulated legs (3 segments each), proper segmented body (cephalothorax
  // + abdomen) with chitin PBR material, 8 eye cluster, pedipalps + fangs,
  // and an idle animate(t) that breathes the abdomen and twitches legs.
  function buildBetterSpider(opts = {}) {
    const THREE = window.THREE;
    const PR    = window.PhobiaRealism;
    if (!THREE) return null;

    const o = Object.assign({
      bodyHex: "#0a0a0a",
      markingHex: "#5a0a0a",
      eyeHex: 0x161618,
      eyeShineHex: 0xff5050,
      hairy: true,
      legSegments: 3,
    }, opts);

    const group = new THREE.Group();
    const chitin = PR
      ? PR.chitinMaterial(o.bodyHex)
      : new THREE.MeshStandardMaterial({ color: o.bodyHex, roughness: 0.45, metalness: 0.05 });

    // ---- Abdomen — large rounded oval, slightly raised over the body
    const abdomen = new THREE.Mesh(new THREE.SphereGeometry(0.5, 28, 22), chitin);
    abdomen.scale.set(0.95, 0.85, 1.30);
    abdomen.position.set(0, 0.10, -0.30);
    abdomen.castShadow = true;
    group.add(abdomen);

    // Hourglass / pattern marking — translucent overlay
    const markMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(o.markingHex),
      transparent: true, opacity: 0.55,
      roughness: 0.6, metalness: 0.05,
    });
    const mark = new THREE.Mesh(
      new THREE.SphereGeometry(0.51, 28, 22, 0, Math.PI * 2, 0, Math.PI / 2),
      markMat
    );
    mark.scale.copy(abdomen.scale);
    mark.position.copy(abdomen.position);
    group.add(mark);

    // ---- Cephalothorax (front body) — slightly smaller than abdomen
    const ceph = new THREE.Mesh(new THREE.SphereGeometry(0.32, 24, 18), chitin);
    ceph.scale.set(0.95, 0.75, 1.10);
    ceph.position.set(0, 0.05, 0.32);
    ceph.castShadow = true;
    group.add(ceph);

    // ---- Eye cluster — 8 eyes in two rows. Glossy dark eyes with a tiny
    // emissive highlight so they catch a glint under scene lights without
    // looking like horror movie laser beams.
    const eyeMat = new THREE.MeshStandardMaterial({
      color: o.eyeHex, roughness: 0.18, metalness: 0.6,
      emissive: o.eyeShineHex, emissiveIntensity: 0.10,
    });
    const eyePositions = [
      [-0.12, 0.20, 0.55], [0.12, 0.20, 0.55],     // big primary pair
      [-0.05, 0.22, 0.54], [0.05, 0.22, 0.54],     // smaller mid pair
      [-0.18, 0.13, 0.49], [0.18, 0.13, 0.49],     // outer secondary pair
      [-0.10, 0.10, 0.55], [0.10, 0.10, 0.55],     // lower secondary pair
    ];
    const eyes = [];
    for (const [x, y, z] of eyePositions) {
      const isPrimary = Math.hypot(x, y - 0.20) < 0.10;
      const r = isPrimary ? 0.045 : 0.030;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), eyeMat);
      eye.position.set(x, y, z);
      eye.scale.z = 0.7;
      group.add(eye);
      eyes.push(eye);
      // Catch-light dot — tiny white speck on every eye
      const cl = new THREE.Mesh(
        new THREE.SphereGeometry(r * 0.30, 6, 5),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      cl.position.set(x + 0.005, y + 0.010, z + r * 0.55);
      group.add(cl);
    }

    // ---- Fangs (chelicerae) — two cones angled down + slightly forward
    const fangMat = new THREE.MeshStandardMaterial({
      color: 0x12090a, roughness: 0.35, metalness: 0.20,
    });
    for (const sx of [-1, 1]) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.10, 8), fangMat);
      fang.position.set(sx * 0.07, -0.06, 0.62);
      fang.rotation.x = Math.PI;
      fang.rotation.z = sx * 0.15;
      group.add(fang);
    }

    // ---- Pedipalps — short pair of front feelers
    for (const sx of [-1, 1]) {
      const palp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.018, 0.27, 8), chitin
      );
      palp.position.set(sx * 0.13, -0.02, 0.66);
      palp.rotation.z = sx * 0.6;
      palp.rotation.x = -0.35;
      group.add(palp);
    }

    // ---- 8 Articulated legs (3 segments each: coxa→femur→tibia→tarsus).
    // Each leg root is a Group rotated to its base angle. The leg unfolds
    // outward at the body, bends down at the "knee" mid-segment, and the
    // tarsus rests at the floor. animate(t) drives a slight twitch through
    // each leg in a wave so the spider always looks subtly alive.
    const legs = [];
    const legBaseY = 0.05;
    const legLayout = [
      // [base x offset along body length, side, base angle out from body]
      { z: -0.20, baseSpread: 0.25, midSpread: 0.95, downBend: -0.45 },
      { z: -0.05, baseSpread: 0.30, midSpread: 1.20, downBend: -0.55 },
      { z:  0.10, baseSpread: 0.30, midSpread: 1.20, downBend: -0.55 },
      { z:  0.25, baseSpread: 0.25, midSpread: 0.95, downBend: -0.45 },
    ];
    for (const side of [-1, 1]) {
      for (let li = 0; li < 4; li++) {
        const cfg = legLayout[li];

        // Hinge at the body — the whole leg rotates around this for twitches
        const hinge = new THREE.Group();
        hinge.position.set(side * 0.20, legBaseY, cfg.z);
        group.add(hinge);

        // Femur — angles up and outward from the body (gives the iconic
        // spider "tent over the abdomen" silhouette)
        const femurLen = 0.55;
        const femur = new THREE.Mesh(
          new THREE.CylinderGeometry(0.040, 0.030, femurLen, 8), chitin
        );
        femur.castShadow = true;
        femur.position.set(side * 0.18, 0.12, 0);
        femur.rotation.z = side * (Math.PI / 2 - 0.35);    // ~20° up from horizontal
        hinge.add(femur);

        // Knee group — at the outer end of the femur. Knee bends the tibia
        // back down toward the floor.
        const kneeX = side * cfg.midSpread * 0.55;
        const kneeY = 0.30;
        const knee = new THREE.Group();
        knee.position.set(kneeX, kneeY, 0);
        hinge.add(knee);

        // Tibia — angles steeply down toward the floor
        const tibiaLen = 0.65;
        const tibia = new THREE.Mesh(
          new THREE.CylinderGeometry(0.028, 0.018, tibiaLen, 8), chitin
        );
        tibia.castShadow = true;
        tibia.position.set(side * 0.22, -tibiaLen * 0.45, 0);
        tibia.rotation.z = side * (-Math.PI / 2 + 0.2);    // tilts outward + down
        knee.add(tibia);

        // Tarsus — small foot tip resting on the floor
        const tarsus = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.005, 0.28, 8), chitin
        );
        tarsus.position.set(side * 0.42, -tibiaLen * 0.85, 0);
        tarsus.rotation.z = side * (-Math.PI / 2 + 0.05);
        knee.add(tarsus);

        legs.push({ hinge, knee, side, idx: li, baseRotZ: hinge.rotation.z });
      }
    }

    // Optional: hair wisps on the cephalothorax — small streaks that catch
    // light (real spiders do have visible hair). Cheap and creepy.
    if (o.hairy) {
      for (let i = 0; i < 16; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 0.20 + Math.random() * 0.10;
        const hair = new THREE.Mesh(
          new THREE.CylinderGeometry(0.005, 0.001, 0.10, 4), chitin
        );
        hair.position.set(Math.cos(ang) * r, 0.09, 0.32 + Math.sin(ang) * r);
        hair.rotation.z = (Math.random() - 0.5) * 0.6;
        hair.rotation.x = (Math.random() - 0.5) * 0.6;
        group.add(hair);
      }
    }

    // Idle animate — breathing abdomen, leg twitches in a wave, occasional
    // eye-shine pulse so the spider always reads as a live thing not a model.
    group.userData.animate = function (t) {
      const breathe = 1 + Math.sin(t * 1.4) * 0.025;
      abdomen.scale.set(0.95 * breathe, 0.85 * breathe, 1.30);
      mark.scale.copy(abdomen.scale);
      // Leg twitch — sine wave traveling along the body in z. Each leg
      // gets a tiny rotation around its hinge.
      legs.forEach(l => {
        const phase = t * 1.2 + l.idx * 0.5 + (l.side > 0 ? 0.7 : 0);
        l.hinge.rotation.x = Math.sin(phase) * 0.05;
        l.hinge.rotation.y = Math.sin(phase * 0.7) * 0.04 * l.side;
        l.knee.rotation.x = Math.sin(phase + 1.0) * 0.07;
      });
      eyes.forEach((e, i) => {
        e.material.emissiveIntensity = 0.08 + Math.sin(t * 2.0 + i) * 0.02;
      });
    };
    group.userData.legs = legs;
    group.userData.abdomen = abdomen;

    return group;
  }

  // ----- Snake -----
  // A muscular snake built from a TubeGeometry along a CatmullRom curve.
  // Scaled PBR scale material gives the body real reptile texture. Head is
  // a flattened sphere with eyes, fangs, tongue. animate(t) drives the
  // body undulation by re-sampling the curve each frame.
  function buildBetterSnake(opts = {}) {
    const THREE = window.THREE;
    const PR    = window.PhobiaRealism;
    if (!THREE) return null;

    const o = Object.assign({
      bodyHex: "#4a6028",       // forest-green default
      lengthM: 1.8,             // total snake length in metres
      thickness: 0.07,          // body radius
      segments: 28,
      tongueOut: false,
    }, opts);

    const group = new THREE.Group();
    const bodyMat = PR
      ? PR.scaleMaterial(o.bodyHex)
      : new THREE.MeshStandardMaterial({ color: o.bodyHex, roughness: 0.55, metalness: 0.10 });

    // Build a base spline. The animate function will re-sample each frame
    // with a sinusoidal offset to drive S-curve undulation.
    const SEG = o.segments;
    const basePoints = [];
    for (let i = 0; i < SEG; i++) {
      const t = i / (SEG - 1);
      basePoints.push(new THREE.Vector3(0, 0, t * o.lengthM - o.lengthM / 2));
    }
    const animPoints = basePoints.map(p => p.clone());
    const curve = new THREE.CatmullRomCurve3(animPoints, false, "catmullrom", 0.5);
    let bodyGeo = new THREE.TubeGeometry(curve, SEG * 2, o.thickness, 12, false);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    // ---- Head — flattened sphere positioned at the head end of the spline
    const headGroup = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(o.thickness * 1.4, 16, 12), bodyMat);
    head.scale.set(1.1, 0.7, 1.6);
    headGroup.add(head);
    // Underbelly (lighter) — a smaller sphere in front
    const underMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(o.bodyHex).lerp(new THREE.Color(0xeac060), 0.35),
      roughness: 0.7, metalness: 0.05,
    });
    const under = new THREE.Mesh(new THREE.SphereGeometry(o.thickness * 1.2, 12, 10), underMat);
    under.scale.set(0.9, 0.4, 1.5);
    under.position.set(0, -o.thickness * 0.5, o.thickness * 0.2);
    headGroup.add(under);
    // Eyes
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0xddc028, emissive: 0x885000, emissiveIntensity: 0.3,
      roughness: 0.25, metalness: 0.5,
    });
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(o.thickness * 0.22, 12, 10), eyeMat);
      eye.position.set(sx * o.thickness * 0.7, o.thickness * 0.35, o.thickness * 0.4);
      headGroup.add(eye);
      // Vertical slit pupil — a thin black box rotated to align with the iris
      const pupil = new THREE.Mesh(
        new THREE.BoxGeometry(o.thickness * 0.04, o.thickness * 0.20, o.thickness * 0.04),
        new THREE.MeshBasicMaterial({ color: 0x070705 })
      );
      pupil.position.copy(eye.position);
      pupil.position.z += o.thickness * 0.18;
      headGroup.add(pupil);
    }
    // Nostrils
    for (const sx of [-1, 1]) {
      const n = new THREE.Mesh(
        new THREE.SphereGeometry(o.thickness * 0.05, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x1a1a14, roughness: 0.9 })
      );
      n.position.set(sx * o.thickness * 0.25, o.thickness * 0.15, o.thickness * 1.05);
      headGroup.add(n);
    }
    // Tongue (forked, retractable)
    const tongueMat = new THREE.MeshStandardMaterial({ color: 0xe04060, roughness: 0.5 });
    const tongueGroup = new THREE.Group();
    tongueGroup.position.set(0, -o.thickness * 0.05, o.thickness * 1.4);
    headGroup.add(tongueGroup);
    const tongueBase = new THREE.Mesh(
      new THREE.CylinderGeometry(o.thickness * 0.08, o.thickness * 0.04, o.thickness * 1.2, 6),
      tongueMat
    );
    tongueBase.rotation.x = Math.PI / 2;
    tongueBase.position.z = o.thickness * 0.6;
    tongueGroup.add(tongueBase);
    for (const sx of [-1, 1]) {
      const fork = new THREE.Mesh(
        new THREE.CylinderGeometry(o.thickness * 0.04, o.thickness * 0.01, o.thickness * 0.6, 6),
        tongueMat
      );
      fork.rotation.x = Math.PI / 2;
      fork.rotation.z = sx * 0.4;
      fork.position.set(sx * o.thickness * 0.15, 0, o.thickness * 1.40);
      tongueGroup.add(fork);
    }
    tongueGroup.scale.setScalar(o.tongueOut ? 1 : 0.001);
    group.add(headGroup);

    // animate — re-sample curve points to drive S-curve undulation, also
    // update the head transform to follow the head end of the curve, and
    // tongue flick.
    let lastTongueAt = 0;
    let tongueT = 0;
    group.userData.animate = function (t) {
      // Update spline control points
      for (let i = 0; i < SEG; i++) {
        const u = i / (SEG - 1);
        const wave = Math.sin(t * 2.0 + u * 6.0) * 0.16 * u;     // grows toward head
        animPoints[i].x = wave;
        animPoints[i].y = Math.sin(t * 1.4 + u * 8.0) * 0.02;
      }
      // Rebuild tube geometry once per frame. CatmullRom rebuild is cheap
      // for ~28 segments; this is the simplest way to get smooth undulation.
      const newGeo = new THREE.TubeGeometry(curve, SEG * 2, o.thickness, 12, false);
      body.geometry.dispose();
      body.geometry = newGeo;

      // Position head at the end-of-curve sample
      const headPos = curve.getPoint(1.0);
      const tangent = curve.getTangent(1.0);
      headGroup.position.copy(headPos);
      headGroup.lookAt(headPos.x + tangent.x, headPos.y + tangent.y, headPos.z + tangent.z);

      // Tongue flicks every ~3-5 seconds
      if (t - lastTongueAt > 3 + Math.random() * 2) {
        lastTongueAt = t;
        tongueT = 1.0;
      }
      tongueT = Math.max(0, tongueT - 0.05);
      const ext = Math.sin(tongueT * Math.PI);
      tongueGroup.scale.setScalar(0.001 + ext * 1.0);
    };
    group.userData.head = headGroup;
    group.userData.body = body;
    group.userData.tongue = tongueGroup;
    return group;
  }

  // ----- Audience member —
  // A more varied humanoid for the public-speaking scene. Uses fabric +
  // skin PBR maps when available, plus body-type variance so the crowd
  // reads as distinct people rather than identical mannequins.
  function buildAudienceMember(opts = {}) {
    const THREE = window.THREE;
    const PR    = window.PhobiaRealism;
    if (!THREE) return null;

    // Per-person palette
    const skinTones = ["#e8b794", "#d4a07a", "#b88863", "#8a6442", "#6a4a30", "#5a3a22", "#f5d8c2"];
    const hairTones = ["#1a1410", "#3a2418", "#5a3a22", "#8b6238", "#a97442", "#d4a86b", "#9aa6b2", "#7a3018"];
    const shirtTones = ["#2c4a6e", "#4a3a55", "#6a3a3a", "#3a5a3a", "#4a4a55", "#6a5a3a", "#4a2c2a", "#2c5a6e", "#754f30", "#9c5a45"];
    const pick = arr => arr[Math.floor(Math.random() * arr.length)];

    const skinHex = opts.skinHex || pick(skinTones);
    const hairHex = opts.hairHex || pick(hairTones);
    const shirtHex = opts.shirtHex || pick(shirtTones);

    // Body proportions vary slightly so adjacent people differ in size
    const heightScale = 0.95 + Math.random() * 0.20;
    const widthScale  = 0.90 + Math.random() * 0.30;

    const skinMat  = PR ? PR.skinMaterial(skinHex)
                        : new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.85 });
    const hairMat  = PR ? PR.hairMaterial(hairHex)
                        : new THREE.MeshStandardMaterial({ color: hairHex, roughness: 1.0 });
    const shirtMat = PR ? PR.fabricMaterial(shirtHex, "cotton")
                        : new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.9 });

    const person = new THREE.Group();

    // Torso — taller variant for variety
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18 * widthScale, 0.42 * heightScale, 8, 14), shirtMat
    );
    torso.position.y = 0.36 * heightScale;
    torso.castShadow = true;
    person.add(torso);

    // Shoulders — round caps
    for (const sx of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.10 * widthScale, 12, 10), shirtMat);
      shoulder.position.set(sx * 0.18 * widthScale, 0.55 * heightScale, 0);
      shoulder.castShadow = true;
      person.add(shoulder);
    }

    // Arms — short stub capsules. Drape position varies slightly per person.
    const armPose = Math.random() < 0.7 ? "down" : "crossed";
    for (const sx of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(sx * 0.20 * widthScale, 0.50 * heightScale, 0);
      person.add(arm);
      const upper = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.06, 0.20, 6, 10), shirtMat
      );
      upper.position.y = -0.10;
      upper.castShadow = true;
      arm.add(upper);
      const fore = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.05, 0.16, 6, 10), skinMat
      );
      fore.position.y = -0.30;
      arm.add(fore);
      if (armPose === "crossed") {
        // Arms crossed in lap — bend forearms inward
        arm.rotation.z = -sx * 0.3;
        arm.rotation.x = -0.4;
      }
    }

    // Neck
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.06, 0.10, 10), skinMat
    );
    neck.position.y = 0.66 * heightScale;
    person.add(neck);

    // Head — slightly egg-shaped, larger than original
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.135, 18, 14), skinMat);
    head.scale.set(0.95, 1.05, 0.95);
    head.position.y = 0.83 * heightScale;
    head.castShadow = true;
    person.add(head);

    // Hair — pick a style randomly
    const hairStyles = ["short", "buzz", "long", "curly"];
    const hs = pick(hairStyles);
    if (hs === "short") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.142, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55),
        hairMat
      );
      cap.scale.copy(head.scale);
      cap.position.copy(head.position);
      person.add(cap);
    } else if (hs === "buzz") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.140, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.45),
        hairMat
      );
      cap.scale.copy(head.scale);
      cap.position.copy(head.position);
      person.add(cap);
    } else if (hs === "long") {
      const cap = new THREE.Mesh(
        new THREE.SphereGeometry(0.144, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.6),
        hairMat
      );
      cap.scale.copy(head.scale);
      cap.position.copy(head.position);
      person.add(cap);
      const back = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.06, 0.30, 14), hairMat
      );
      back.position.set(0, head.position.y - 0.18, -0.06);
      back.rotation.x = -0.2;
      person.add(back);
    } else if (hs === "curly") {
      // Multiple small curl spheres
      const positions = [
        [-0.10, 0.10, 0.05], [0.10, 0.10, 0.05],
        [-0.13, 0.05, -0.02], [0.13, 0.05, -0.02],
        [0, 0.13, 0.04], [0, 0.10, -0.10],
      ];
      for (const [x, y, z] of positions) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), hairMat);
        c.position.set(x, head.position.y + y, z);
        c.scale.setScalar(0.85 + Math.random() * 0.3);
        person.add(c);
      }
    }

    // Tiny eyes — so we can see the face turn / pay attention
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(
        new THREE.SphereGeometry(0.014, 10, 8),
        new THREE.MeshStandardMaterial({ color: 0x141014, roughness: 0.4 })
      );
      eye.position.set(sx * 0.04, head.position.y + 0.01, 0.118);
      person.add(eye);
    }
    // Mouth — tiny dark slit
    const mouth = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.005, 0.005),
      new THREE.MeshStandardMaterial({ color: 0x4a1a1a, roughness: 0.8 })
    );
    mouth.position.set(0, head.position.y - 0.05, 0.13);
    person.add(mouth);

    // Optional glasses (1 in 5 chance)
    if (Math.random() < 0.20) {
      const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1414, metalness: 0.5, roughness: 0.35 });
      for (const sx of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.040, 0.005, 6, 12), frameMat);
        ring.position.set(sx * 0.05, head.position.y + 0.01, 0.115);
        ring.rotation.y = Math.PI / 2;
        person.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.005, 0.005), frameMat);
      bridge.position.set(0, head.position.y + 0.01, 0.115);
      person.add(bridge);
    }

    // Idle — slight head sway + breathing
    const swayPhase = Math.random() * Math.PI * 2;
    person.userData.animate = function (t) {
      head.rotation.y = Math.sin(t * 0.5 + swayPhase) * 0.10;
      head.rotation.x = Math.sin(t * 0.7 + swayPhase * 0.5) * 0.04;
      torso.scale.y = 1 + Math.sin(t * 1.2 + swayPhase) * 0.012;
    };
    person.userData.head = head;
    return person;
  }

  // ----- Dog upgrade material — drop-in fur material the dog scene can use
  function dogFurMaterial(baseHex = "#a97442") {
    const PR = window.PhobiaRealism;
    return PR ? PR.furMaterial(baseHex) : null;
  }

  // ----- Trees (lightweight low-poly tree for outdoor scenes) -----
  function buildLowPolyTree(opts = {}) {
    const THREE = window.THREE;
    const PR    = window.PhobiaRealism;
    if (!THREE) return null;
    const o = Object.assign({
      trunkHex: "#3a2818", leafHex: "#3e6a2c",
      height: 4 + Math.random() * 2,
    }, opts);
    const tree = new THREE.Group();
    const trunkMat = PR ? PR.barkMaterial(o.trunkHex)
                        : new THREE.MeshStandardMaterial({ color: o.trunkHex, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({
      color: o.leafHex, roughness: 0.95, metalness: 0.0,
      flatShading: true,
    });
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.20, o.height * 0.55, 8), trunkMat
    );
    trunk.position.y = o.height * 0.275;
    trunk.castShadow = true;
    tree.add(trunk);
    // 3 stacked leaf cones — gives a stylised "fluffy" tree
    for (let i = 0; i < 3; i++) {
      const r = 1.1 - i * 0.18;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(r, 1.2, 8), leafMat
      );
      cone.position.y = o.height * 0.55 + i * 0.7;
      cone.castShadow = true;
      cone.rotation.y = Math.random() * Math.PI;
      tree.add(cone);
    }
    return tree;
  }

  function publish() {
    window.PhobiaCreatures = {
      buildBetterSpider,
      buildBetterSnake,
      buildAudienceMember,
      dogFurMaterial,
      buildLowPolyTree,
    };
  }
  publish();
})();
