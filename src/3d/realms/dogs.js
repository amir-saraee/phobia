// The Meadow Yard — dogs (cynophobia).

import * as THREE from "three";
import { getDogTexLoader } from "../assets.js";
import { IS_COARSE_POINTER, IS_LOW_POWER, sceneQuality, texAniso, loadMeadowHDR } from "../renderer.js";
import { _hsat } from "../human-base.js";
import { angleGap, makeContactShadow, makeSoftSunbeam } from "../human-rig.js";
import { sceneContext } from "../scene-context.js";
import { PhobiaPhysics, PhobiaGrab } from "../physics.js";
import { makePlankMaps, makePlasterMaps, makeRugMaps, makeLeafTexture } from "../textures.js";
import { DOG_COATS, coatFor, _hexMix } from "../creature-kit.js";
import { buildDog } from "../dog-model.js";
import { DogController, _coachSize, DOG_TEMPERAMENTS } from "../dog-controller.js";
import { makeDogCoach } from "../coach.js";
import { active } from "../live.js";

function setupDogs(scene, camera, level, levelIdx, ctx) {
  const size = level.size;
  const intensity = level.intensity; // calm | alert | barking
  const baseB = level.behavior || {};   // per-rung behavior params (see level defs)

  // Per-rung MOOD: the same room, but the day drifts subtly darker and colder
  // toward rung 5 — sun angle drops, sky cools, fills drain — so the five
  // rungs stop being visually identical and the ladder's escalation is felt
  // in the light before the dog does anything. keyPos values are chosen so
  // the key always shoots THROUGH the window opening (x -3.2..-1.2,
  // y -0.1..1.4 on the z=-5.6 wall) at target (0.5,-1,-1).
  const MOODS = [
    // r0 calm — soft morning
    { keyC: 0xffeccf, keyI: 3.4, keyPos: [-5.5, 3.0, -9.0], hemiSky: 0xeaf2fb, hemiGnd: 0xb9a184, hemiI: 0.80, glowC: 0xffe8c8, glowI: 1.10, bg: 0x171310, skyTop: "#a8d4ff", skyHz: "#fdeecf", beamO: 0.045 },
    // r1 calm — late morning
    { keyC: 0xffe9c4, keyI: 3.4, keyPos: [-5.5, 2.8, -9.0], hemiSky: 0xe6eef8, hemiGnd: 0xb2997c, hemiI: 0.75, glowC: 0xffe4c0, glowI: 1.05, bg: 0x161210, skyTop: "#9fccff", skyHz: "#fbeacc", beamO: 0.050 },
    // r2 alert — thin overcast, flatter
    { keyC: 0xf2ece0, keyI: 2.9, keyPos: [-5.5, 2.8, -9.0], hemiSky: 0xdde6ee, hemiGnd: 0xa8988a, hemiI: 0.70, glowC: 0xf4e8d4, glowI: 0.90, bg: 0x14120f, skyTop: "#b9c9d8", skyHz: "#e8e2d2", beamO: 0.030 },
    // r3 alert — sun dropping, warmer key but dimmer room
    { keyC: 0xffd9a8, keyI: 3.2, keyPos: [-5.5, 2.4, -9.0], hemiSky: 0xd6dde8, hemiGnd: 0x9c8c7c, hemiI: 0.60, glowC: 0xffdcb0, glowI: 0.85, bg: 0x121010, skyTop: "#94b3d6", skyHz: "#f2d9b0", beamO: 0.055 },
    // r4 barking — low cold raking light, long shadows
    { keyC: 0xe9d4b6, keyI: 3.5, keyPos: [-6.0, 2.0, -9.5], hemiSky: 0xcfd8e4, hemiGnd: 0x8d7f70, hemiI: 0.48, glowC: 0xe8d2b8, glowI: 0.70, bg: 0x0f0e0d, skyTop: "#8fa5bd", skyHz: "#d8c9a8", beamO: 0.070 },
  ];
  const baseMood = MOODS[Math.max(0, Math.min(4, levelIdx || 0))];
  // ---- this visit's context ----
  // The rung's MOOD carries the LADDER's escalation (rung 5 is colder and
  // harder than rung 1). The visit's context carries the DAY. Blending both
  // means the fifth attempt at rung 3 is recognisably the same step of the
  // ladder in a different room — which is the point: exposure that always
  // happens in identical conditions only teaches you about those conditions.
  const V = ctx || sceneContext("dogs", levelIdx, false);
  // Today's temperament. Applied as a derived `B` so every downstream consumer
  // picks it up without each one needing to know about it.
  const temper = V.pick(DOG_TEMPERAMENTS);
  const B = (() => {
    const b = Object.assign({}, baseB);
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    if (b.autoApproachTrust != null) b.autoApproachTrust = clamp(b.autoApproachTrust * temper.approachMul, 0.30, 0.95);
    if (b.followDelay != null) b.followDelay = clamp(b.followDelay / temper.interest, 2, 14);
    if (b.firstBarkAt != null) b.firstBarkAt = clamp(b.firstBarkAt * temper.barkMul, 6, 30);
    if (Array.isArray(b.barkEvery)) b.barkEvery = b.barkEvery.map(x => x * temper.barkMul);
    if (b.standAt != null) b.standAt = clamp(b.standAt / temper.interest, 8, 32);
    if (b.settleAfter != null) b.settleAfter = clamp(b.settleAfter / temper.settleMul, 20, 70);
    // Puttering room, capped so a restless dog can never wander past rung 5's
    // safety line or out of the room.
    if (b.homeRadius != null) b.homeRadius = clamp(b.homeRadius * temper.restless, 0.4, 3.2);
    return b;
  })();
  // Compress the brightness swing. Colour, sun angle and beam strength carry
  // almost all of the perceptual difference between hours; raw intensity mostly
  // just decides whether you can SEE the dog, and a room you can't work in is a
  // worse exposure regardless of how atmospheric it looks.
  const kMul = 0.80 + 0.40 * _hsat((V.keyI - 0.30) / 0.82);
  const hMul = 0.88 + 0.32 * _hsat((V.hemiI - 0.56) / 0.64);
  const mood = Object.assign({}, baseMood, {
    keyC: _hexMix(baseMood.keyC, V.hour.key, 0.65),
    keyI: baseMood.keyI * kMul,
    hemiSky: _hexMix(baseMood.hemiSky, V.hour.sky, 0.60),
    hemiGnd: _hexMix(baseMood.hemiGnd, V.hour.gnd, 0.60),
    hemiI: baseMood.hemiI * hMul,
    glowC: _hexMix(baseMood.glowC, V.hour.key, 0.55),
    glowI: baseMood.glowI * (0.72 + 0.42 * _hsat((V.keyI - 0.30) / 0.82)),
    beamO: baseMood.beamO * (0.35 + 0.75 * V.beam),
    skyTop: V.hour.top,
    skyHz: V.hour.hz,
    // Sun height. Clamped to the band that still shoots THROUGH the window
    // opening (WIN.cx ± 1.0, y −0.1…1.4 on the z=−5.6 wall) — outside it the
    // beam misses the glass entirely and the room goes flat.
    keyPos: [baseMood.keyPos[0], 1.95 + V.hour.elev * 1.45, baseMood.keyPos[2]],
  });
  // Room dressing. Which wall the bed and the treat table live against swaps
  // between visits, and everything shifts along its wall.
  const dressSide = V.rng() < 0.5 ? 1 : -1;
  const dx = (x) => x * dressSide;
  const dz = (z) => z + V.range(-0.55, 0.55);
  // Furniture that stands TOGETHER shifts together: one depth jitter per wall
  // group. Jittering each piece on its own drove a table leg through the
  // plant pot on ~40 % of visits, poked the plant's leaves up through the
  // tabletop, and dropped the water bowl inside the dog bed one visit in six.
  const jBedSide = V.range(-0.55, 0.55);     // dog bed + water bowl
  const jTableSide = V.range(-0.55, 0.55);   // treat table + houseplant

  // No fog: this is a real enclosed room now, not a haze-faked one. The
  // background is only visible outside the shell during the third-person
  // intro dolly, where a near-black surround reads as cinematic.
  scene.background = new THREE.Color(mood.bg);

  // Sun through the window — the key light sits OUTSIDE the window plane so
  // the wall segments gate it: daylight physically enters through the opening
  // and the mullions print their cross pattern in the beam patch.
  const key = new THREE.DirectionalLight(mood.keyC, mood.keyI);
  key.position.set(...mood.keyPos);
  key.target.position.set(0.5, -1, -1);
  key.castShadow = !IS_LOW_POWER;
  if (key.castShadow) {
    const mapRes = sceneQuality() === "high" ? 2048 : 1024;
    key.shadow.mapSize.set(mapRes, mapRes);
    key.shadow.camera.left = -8;  key.shadow.camera.right = 8;
    key.shadow.camera.top = 8;    key.shadow.camera.bottom = -8;
    key.shadow.camera.near = 0.5; key.shadow.camera.far = 26;
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.02;
  }
  scene.add(key); scene.add(key.target);
  // Natural sky/ground fill — replaces flat ambient with a gradient that lifts
  // shadows realistically. Deliberately low so the key can model form; the
  // PMREM environment and the windowGlow bounce carry the rest.
  const hemi = new THREE.HemisphereLight(mood.hemiSky, mood.hemiGnd, mood.hemiI);
  scene.add(hemi);
  // Outdoor HDRI for PBR reflections on floor/fur/glass — softer and more
  // natural than the default RoomEnvironment studio box. The decoded equirect
  // is cached module-side (loadMeadowHDR) so re-entering the room doesn't
  // re-download 1.4 MB; the PMREM itself is per-renderer, so it's rebuilt each
  // mount and released in dispose() below. Without that release every visit
  // leaks a 768×1024 float cube-UV target.
  let dogEnvTex = null;
  if (typeof sceneQuality === "function" && sceneQuality() !== "low") {
    try {
      const r = scene.userData && scene.userData.renderer;
      if (r) {
        loadMeadowHDR().then((hdr) => {
          // The scene may have unmounted while the HDR was in flight — its
          // renderer's GL context is force-lost by then, and PMREM on a dead
          // context throws deep inside three's shader compile.
          if (!hdr || scene.userData.disposed) return;
          try {
            const gl = r.getContext();
            if (!gl || gl.isContextLost()) return;
            const gen = new THREE.PMREMGenerator(r);
            dogEnvTex = gen.fromEquirectangular(hdr).texture;
            scene.environment = dogEnvTex;
            gen.dispose();
            hdr.dispose();   // this mount's copy; the PMREM holds what it needs
          } catch (e) { console.warn("[dogs] HDRI:", e); }
        });
      }
    } catch {}
  }
  // Dedicated rim light that TRACKS behind the dog (opposite the camera) so its
  // silhouette catches a bright fur edge and pops off the background — the
  // single cheapest "this is a real furry animal, not a flat prop" cue. The
  // update loop repositions it each frame; intensity rises as you get close.
  const dogRim = new THREE.PointLight(0xfff1e0, 0.0, 9, 2);
  // Not on the low tier: forward shading pays for every point light on every
  // lit pixel, and this one started at intensity 0 — which is exactly what
  // the low tier's capAccents leaves alone (it reads 0 as a scripted flash),
  // so it escaped the two-light budget and ran all session. Its position and
  // intensity are still written each frame; detached, that costs nothing.
  if (!IS_LOW_POWER) scene.add(dogRim);
  // ---- Fear grade ----
  // Captured "safe" baselines; the update loop lerps the room toward a
  // colder, harder, lower-fill state as fear/aggression climbs (and back as
  // it falls). The heavy pixel-level grading lives in the FearGradeShader
  // pass; the light rig just has to darken the ROOM. lightBase is captured
  // AFTER the mood is applied (and after windowGlow exists, below).
  const _coolKey = new THREE.Color(0xbcd0e8);   // cold daylight-gone tone
  const _coolBg  = new THREE.Color(0x0b0d12);
  let _fearGrade = 0;
  let _shadowTuned = false;

  // Room footprint. Declared before the floor so the floor, the shell, the
  // baseboards and both bounds sets are all one source of truth — see the
  // "Room shell" note below for why the width is what it is.
  const ROOM = { x0: -3.3, x1: 3.3, z0: -5.6, z1: 5.2, ceilY: 1.75 };
  // Window opening on the z0 wall. The wall segments frame it and the glass,
  // sill, sunbeam, curtains and perching bird all derive from it. Centre sits
  // left of middle so the sun rakes ACROSS the room toward the dog rather than
  // straight down the approach lane, and far enough off the left wall (0.75 m
  // of plaster) that the opening reads as a window in a wall, not a hole at
  // the corner.
  const WIN = { cx: -1.55, cy: 0.65, halfW: 1.0, halfH: 0.75 };
  const ROOM_W = ROOM.x1 - ROOM.x0;           // 6.6 m interior
  const ROOM_D = ROOM.z1 - ROOM.z0;           // 10.8 m interior

  // Fit the sun's shadow camera to the room. It was a fixed 16 × 16 m square
  // with a 25.5 m depth range; the room — every receiver, and the walls and
  // ceiling that gate the sun — projects to far less than that along this
  // light, so most of the 2048² map was spent on empty ground outside the
  // shell. Box = interior + wall thickness + the sill/bird outside the glass.
  // Everything outside a directional shadow frustum renders LIT, so the box
  // must hold every receiver; that's why it is the whole room, not the beam.
  if (key.castShadow) {
    const sc = key.shadow.camera;
    key.updateMatrixWorld(); key.target.updateMatrixWorld();
    sc.position.setFromMatrixPosition(key.matrixWorld);
    sc.lookAt(new THREE.Vector3().setFromMatrixPosition(key.target.matrixWorld));
    sc.updateMatrixWorld();
    const pad = 0.35, v = new THREE.Vector3();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zNear = Infinity, zFar = -Infinity;
    for (const x of [ROOM.x0 - pad, ROOM.x1 + pad])
      for (const y of [-1.05, ROOM.ceilY + 0.15])
        for (const z of [ROOM.z0 - pad, ROOM.z1 + pad]) {
          v.set(x, y, z).applyMatrix4(sc.matrixWorldInverse);
          x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
          y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
          zNear = Math.min(zNear, -v.z); zFar = Math.max(zFar, -v.z);
        }
    sc.left = x0; sc.right = x1; sc.bottom = y0; sc.top = y1;
    sc.near = Math.max(0.05, zNear - 0.5); sc.far = zFar + 0.5;
    sc.updateProjectionMatrix();
    key.userData.shadowFit = [x1 - x0, y1 - y0, sc.far - sc.near];   // for QA
  }

  // Floor — oak planks with baked normal/roughness maps, sized to the room
  // shell so nothing pokes outside it. The repeat is set from the room's real
  // size at a fixed 1.4 m × 1.4 m tile, so boards keep their true width when
  // the room is resized instead of being stretched or squashed by it.
  const plankMaps = makePlankMaps();
  const plankRep = [ROOM_W / 1.40, ROOM_D / 1.37];
  plankMaps.albedo.repeat.set(...plankRep);
  if (plankMaps.normal) plankMaps.normal.repeat.set(...plankRep);
  if (plankMaps.roughness) plankMaps.roughness.repeat.set(...plankRep);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W + 0.2, ROOM_D + 0.2),
    new THREE.MeshStandardMaterial({
      map: plankMaps.albedo, normalMap: plankMaps.normal,
      roughnessMap: plankMaps.roughness,
      color: 0xffffff, envMapIntensity: 0.6,
    })
  );
  if (floor.material.normalMap) floor.material.normalScale.set(0.8, 0.8);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);
  // The hallway you came in from. The front wall is a one-sided dollhouse
  // plane, so the third-person camera often sits just outside it — and below
  // the floor's edge there was nothing: a black wedge in the corner of the
  // frame. A strip of darker boards beyond the wall reads as the hall. Plain
  // colour (no maps), not a shadow receiver: it's only ever seen at the edge.
  const hallFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_W + 8, 7),
    new THREE.MeshStandardMaterial({ color: 0x9a7a56, roughness: 0.85 })
  );
  hallFloor.rotation.x = -Math.PI / 2;
  hallFloor.position.set(0, -1.002, ROOM.z1 + 3.5);
  hallFloor.userData.noCollide = true;
  scene.add(hallFloor);

  // Soft area rug between the user and the dog — border is baked into the
  // texture now (the old translucent "outline" overlay darkened the whole rug).
  const rugMaps = makeRugMaps();
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 3.4),
    new THREE.MeshStandardMaterial({
      map: rugMaps.albedo, normalMap: rugMaps.normal,
      color: 0xffffff, roughness: 0.95,
    })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.rotation.z = V.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
  rug.material.color.setHSL(V.range(0, 1), V.range(0.10, 0.34), V.range(0.42, 0.68));
  rug.position.set(V.range(-0.35, 0.35), -0.99, dz(-2.2));
  rug.receiveShadow = true;
  scene.add(rug);

  // ---------- Room shell ----------
  // A real room sized to the play space: interior 6.6 × 10.8 m, ceiling
  // 2.75 m. Every piece is noCollide (player bounds already confine movement;
  // the auto-collider sweep must never grab a wall segment or it would plant
  // invisible walls inside the room). Wall/ceiling castShadow flags are what
  // GATE the key light: daylight only enters through the window opening.
  //
  // WIDTH is domestic on purpose. It used to be 9.2 m, which is a village hall:
  // the ladder only ever uses the z axis (you spawn at z≈4 and the dog sits at
  // z≈−1.5…−4.2), so every one of those extra metres was bare floor sitting in
  // the middle of the frame with the furniture pressed flat against distant
  // walls. An empty floor plane IS the "this is a test chamber" cue — real
  // rooms put their walls within a few steps of you and their objects around
  // you rather than around the edges. 6.6 m is a generous but ordinary living
  // room, and it costs the exposure design nothing because the approach still
  // happens along the full 10.8 m of depth.
  const plasterMaps = makePlasterMaps();
  plasterMaps.albedo.repeat.set(4.2, 1.25);
  if (plasterMaps.normal) plasterMaps.normal.repeat.set(4.2, 1.25);
  const plasterMat = new THREE.MeshStandardMaterial({
    map: plasterMaps.albedo, normalMap: plasterMaps.normal,
    color: 0xffffff, roughness: 0.92, envMapIntensity: 0.35,
  });
  const wallH = ROOM.ceilY - (-1);            // 2.75 m
  const shellPieces = [];
  const addShell = (mesh, cast) => {
    mesh.castShadow = !!cast;
    mesh.receiveShadow = true;
    mesh.userData.noCollide = true;
    scene.add(mesh);
    shellPieces.push(mesh);
    return mesh;
  };
  // WINDOW WALL (z=-5.6): four segments framing the opening
  // (opening x ∈ [cx±1.0], y ∈ [-0.1, 1.4] — sill 0.9 m above the floor).
  // Every segment is DERIVED from ROOM and WIN: these four numbers used to be
  // written out by hand, which is exactly how a wall ends up not reaching the
  // corner when the room is resized.
  const backWallGroup = new THREE.Group();
  const wallSeg = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), plasterMat);
    m.position.set(x, y, ROOM.z0);
    m.castShadow = true; m.receiveShadow = true;
    m.userData.noCollide = true;
    backWallGroup.add(m);
  };
  const openL = WIN.cx - WIN.halfW, openR = WIN.cx + WIN.halfW;
  wallSeg(openL - ROOM.x0, wallH, (ROOM.x0 + openL) / 2, -1 + wallH / 2);   // left of window
  wallSeg(ROOM.x1 - openR, wallH, (openR + ROOM.x1) / 2, -1 + wallH / 2);   // right of window
  wallSeg(WIN.halfW * 2, 0.90, WIN.cx, -0.55);                              // below sill
  wallSeg(WIN.halfW * 2, 0.35, WIN.cx,  1.575);                             // above lintel
  backWallGroup.userData.noCollide = true;
  scene.add(backWallGroup);
  // SIDE WALLS — the left one casts shadow (the key sits at negative x and
  // must not spill around the corner); the right one just receives.
  const leftWall = addShell(new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, ROOM_D + 0.2), plasterMat), true);
  leftWall.position.set(ROOM.x0, -1 + wallH / 2, (ROOM.z0 + ROOM.z1) / 2);
  const rightWall = addShell(new THREE.Mesh(new THREE.BoxGeometry(0.12, wallH, ROOM_D + 0.2), plasterMat), false);
  rightWall.position.set(ROOM.x1, -1 + wallH / 2, (ROOM.z0 + ROOM.z1) / 2);
  // CEILING — must cast, or the key (above ceiling height) lights the floor
  // through the roof. Lighter plaster tint.
  const ceilMat = plasterMat.clone();
  ceilMat.color.setHex(0xd9d2c6);
  const ceiling = addShell(new THREE.Mesh(new THREE.BoxGeometry(ROOM_W + 0.2, 0.10, ROOM_D + 0.2), ceilMat), true);
  ceiling.position.set(0, ROOM.ceilY, (ROOM.z0 + ROOM.z1) / 2);
  // FRONT WALL (z=+5.2) — single-sided plane facing INTO the room. The
  // third-person camera (which starts outside during the intro dolly) sees
  // straight through its back face: the dollhouse trick that preserves the
  // establishing shot. NEVER add this to collisionObjects — the TP camera
  // raycast respects FrontSide and would yank the camera inside the room.
  const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, wallH), plasterMat);
  frontWall.rotation.y = Math.PI;
  frontWall.position.set(0, -1 + wallH / 2, ROOM.z1);
  frontWall.receiveShadow = true;
  frontWall.userData.noCollide = true;
  scene.add(frontWall);
  // DOOR on the front wall — matches the "you've entered the room" intro.
  // Every piece is an inward-facing single-sided PLANE (same dollhouse trick
  // as the front wall): correct from inside, invisible to the third-person
  // intro camera outside — a box door here blocked the establishing shot.
  const doorX = 1.6;
  const jambMat = new THREE.MeshStandardMaterial({ color: 0x6b5138, roughness: 0.7 });
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x7d6248, roughness: 0.65 });
  const doorPlane = (w, h, x, y, z, mat) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    p.rotation.y = Math.PI;                 // face into the room
    p.position.set(x, y, z);
    p.userData.noCollide = true;
    scene.add(p);
    return p;
  };
  for (const dx of [-0.55, 0.55]) {
    doorPlane(0.08, 2.05, doorX + dx, -1 + 2.05 / 2, ROOM.z1 - 0.03, jambMat);
  }
  doorPlane(1.10, 0.08, doorX, 1.09, ROOM.z1 - 0.03, jambMat);          // lintel
  doorPlane(0.94, 2.0, doorX, -1 + 1.0, ROOM.z1 - 0.05, doorMat);       // panel
  const handle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.015, 0.12, 10),
    new THREE.MeshStandardMaterial({ color: 0xbfb8a8, metalness: 0.85, roughness: 0.3 })
  );
  handle.rotation.z = Math.PI / 2;
  handle.position.set(doorX - 0.36, -0.02, ROOM.z1 - 0.09);
  handle.userData.noCollide = true;
  scene.add(handle);
  // BASEBOARDS hugging each wall base (front one split around the door)
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xcfc0a8, roughness: 0.8 });
  const baseboard = (w, d, x, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, d), baseMat);
    b.position.set(x, -0.955, z);
    b.userData.noCollide = true;
    scene.add(b);
  };
  baseboard(ROOM_W, 0.02, 0, ROOM.z0 + 0.08);
  baseboard(0.02, ROOM_D, ROOM.x0 + 0.08, (ROOM.z0 + ROOM.z1) / 2);
  baseboard(0.02, ROOM_D, ROOM.x1 - 0.08, (ROOM.z0 + ROOM.z1) / 2);
  // Front baseboards are inward-facing planes (dollhouse trick again) so the
  // third-person intro camera outside doesn't see floating white bars.
  const fbLeftW = (doorX - 0.55) - ROOM.x0;
  const fbLeft = new THREE.Mesh(new THREE.PlaneGeometry(fbLeftW, 0.09), baseMat);
  fbLeft.rotation.y = Math.PI;
  fbLeft.position.set(doorX - 0.55 - fbLeftW / 2, -0.955, ROOM.z1 - 0.02);
  fbLeft.userData.noCollide = true;
  scene.add(fbLeft);
  const fbRightW = ROOM.x1 - (doorX + 0.55);
  const fbRight = new THREE.Mesh(new THREE.PlaneGeometry(fbRightW, 0.09), baseMat);
  fbRight.rotation.y = Math.PI;
  fbRight.position.set(doorX + 0.55 + fbRightW / 2, -0.955, ROOM.z1 - 0.02);
  fbRight.userData.noCollide = true;
  scene.add(fbRight);

  // ---------- Wall décor (a lived-in room, not a test chamber) ----------
  // Two framed prints + curtains flanking the window. All noCollide, none
  // cast shadow (the wall/ceiling flags GATE the key light — décor must not
  // join that game). Prints are painted procedurally so no assets ship.
  {
    const makePrintTex = (variant) => {
      const c = document.createElement("canvas");
      c.width = 128; c.height = 160;
      const g = c.getContext("2d");
      if (variant === 0) {
        // Soft dune bands — echoes the room's warm plaster palette.
        g.fillStyle = "#e8ddca"; g.fillRect(0, 0, 128, 160);
        g.fillStyle = "#c9b393"; g.beginPath();
        g.moveTo(0, 95); g.quadraticCurveTo(45, 70, 128, 100); g.lineTo(128, 160); g.lineTo(0, 160); g.fill();
        g.fillStyle = "#a98d6d"; g.beginPath();
        g.moveTo(0, 125); g.quadraticCurveTo(70, 105, 128, 130); g.lineTo(128, 160); g.lineTo(0, 160); g.fill();
        g.fillStyle = "#e4c9a2"; g.beginPath(); g.arc(92, 42, 17, 0, Math.PI * 2); g.fill();
      } else {
        // A leaning sprig in a jar — quiet, domestic.
        g.fillStyle = "#dfe4da"; g.fillRect(0, 0, 128, 160);
        g.strokeStyle = "#6f7f66"; g.lineWidth = 3; g.beginPath();
        g.moveTo(64, 135); g.quadraticCurveTo(58, 85, 74, 48); g.stroke();
        g.fillStyle = "#87997c";
        for (const [px, py, r] of [[76, 50, 8], [64, 68, 7], [78, 84, 7], [62, 100, 6]]) {
          g.beginPath(); g.ellipse(px, py, r, r * 1.7, 0.6, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = "#b9c4bb"; g.fillRect(50, 128, 28, 20);
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      return tex;
    };
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.6 });
    const hangPrint = (variant, w, h, x, y, z, rotY) => {
      const grp = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, h + 0.06, 0.035), frameMat);
      const art = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshStandardMaterial({ map: makePrintTex(variant), roughness: 0.9 })
      );
      art.position.z = 0.022;
      grp.add(frame); grp.add(art);
      grp.position.set(x, y, z);
      grp.rotation.y = rotY;
      grp.traverse((o) => { o.userData.noCollide = true; o.receiveShadow = true; });
      scene.add(grp);
    };
    // Right wall (faces −x into the room) and window wall right segment.
    hangPrint(0, 0.52, 0.65, ROOM.x1 - 0.09, 0.42, -1.6, -Math.PI / 2);
    hangPrint(1, 0.42, 0.55, (WIN.cx + WIN.halfW + ROOM.x1) / 2, 0.5, ROOM.z0 + 0.09, 0);
    // Curtains: a rod + two softly-waved panels flanking the window opening.
    // Vertex-waved planes — cloth enough at this art level, zero runtime cost.
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, WIN.halfW * 2 + 0.75, 8),
      new THREE.MeshStandardMaterial({ color: 0x6b5a42, metalness: 0.4, roughness: 0.5 })
    );
    rod.rotation.z = Math.PI / 2;
    rod.position.set(WIN.cx, 1.52, ROOM.z0 + 0.10);
    rod.userData.noCollide = true;
    scene.add(rod);
    const curtainMat = new THREE.MeshStandardMaterial({
      color: 0xd8cdb9, roughness: 0.95, side: THREE.DoubleSide,
    });
    for (const cxp of [WIN.cx - WIN.halfW - 0.18, WIN.cx + WIN.halfW + 0.18]) {
      const geo = new THREE.PlaneGeometry(0.42, 2.25, 8, 1);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        // Gentle folds: z ripples across width, deeper toward the hem.
        const u = pos.getX(i) / 0.42;
        const vHem = 0.5 - pos.getY(i) / 2.25;
        pos.setZ(i, Math.sin(u * Math.PI * 4) * 0.035 * (0.55 + vHem * 0.45));
      }
      geo.computeVertexNormals();
      const panel = new THREE.Mesh(geo, curtainMat);
      panel.position.set(cxp, 1.52 - 2.25 / 2, ROOM.z0 + 0.10);
      panel.userData.noCollide = true;
      panel.receiveShadow = true;
      scene.add(panel);
    }
  }

  // ---------- Window on the near wall (bright daylight) ----------
  // Relocated from a wall 16 m away (lost in fog) to the room shell itself:
  // now a real window 5-6 m from the player with a parallax backdrop behind
  // the glass, so "outside" exists.
  const cx = WIN.cx, cy = WIN.cy, wz = ROOM.z0 + 0.03;   // window centre on the shell
  // Backdrop: real meadow photograph behind the glass (parallax at z=-8.2).
  // Falls back to a painted sky/lawn if the ref fails to load.
  const bdC = document.createElement("canvas");
  bdC.width = bdC.height = 512;
  const bd = bdC.getContext("2d");
  const bdSky = bd.createLinearGradient(0, 0, 0, 512 * 0.62);
  bdSky.addColorStop(0, mood.skyTop);
  bdSky.addColorStop(1, mood.skyHz);
  bd.fillStyle = bdSky;
  bd.fillRect(0, 0, 512, 512 * 0.62);
  bd.fillStyle = "rgba(64,78,56,0.85)";
  for (let i = 0; i < 7; i++) {
    const tx = i * 85 + (Math.random() - 0.5) * 40;
    const tr = 55 + Math.random() * 45;
    const ty = 512 * (0.54 + Math.random() * 0.06);
    bd.beginPath(); bd.arc(tx, ty, tr, Math.PI, 0); bd.fill();
  }
  bd.fillStyle = "#6e5a42";
  bd.fillRect(0, 512 * 0.64, 512, 4);
  for (let x = 0; x < 512; x += 14) bd.fillRect(x, 512 * 0.64, 6, 512 * 0.10);
  const bdLawn = bd.createLinearGradient(0, 512 * 0.72, 0, 512);
  bdLawn.addColorStop(0, "#7a8f56");
  bdLawn.addColorStop(1, "#5c7042");
  bd.fillStyle = bdLawn;
  bd.fillRect(0, 512 * 0.74, 512, 512 * 0.26);
  const bdTex = new THREE.CanvasTexture(bdC);
  bdTex.colorSpace = THREE.SRGBColorSpace;
  const backdropMat = new THREE.MeshStandardMaterial({
    map: bdTex, emissiveMap: bdTex, emissive: 0xffffff, emissiveIntensity: 1.6,
    roughness: 1.0, fog: false,
  });
  // Swap in the photographed meadow when available — the window is the
  // player's only view of "outside", so a painted cartoon kills the room.
  try {
    const loader = getDogTexLoader();
    if (loader) {
      loader.load("assets/models/textures/meadow_window.jpg", (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = texAniso();
        tex.needsUpdate = true;
        backdropMat.map = tex;
        backdropMat.emissiveMap = tex;
        backdropMat.emissiveIntensity = 1.35;
        backdropMat.userData.baseEmissive = 1.35;   // the fear grade scales THIS
        backdropMat.needsUpdate = true;
        if (bdTex) bdTex.dispose();
      }, undefined, () => {});
    }
  } catch {}
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(7, 5), backdropMat);
  backdrop.position.set(cx, 0.4, -8.2);
  backdrop.userData.noCollide = true;
  backdrop.userData.noPick = true;
  scene.add(backdrop);
  // Glass: a whisper of PMREM sheen, no transmission needed.
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.0, 1.5),
    new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.06, metalness: 0,
      transparent: true, opacity: 0.08, envMapIntensity: 1.4,
    })
  );
  glass.position.set(cx, cy, wz + 0.02);
  glass.userData.noCollide = true;
  glass.userData.noPick = true;
  scene.add(glass);
  // Thin wood frame + mullions. These CAST shadow on medium/high — with the
  // key aimed through the opening they print the classic window cross in the
  // floor beam patch.
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x4a3528, roughness: 0.65 });
  const fz = wz + 0.06;
  const halfW = WIN.halfW, halfH = WIN.halfH, bar = 0.09;
  const frameBars = [
    [2.2, bar, cx, cy + halfH],           // top
    [2.2, bar, cx, cy - halfH],           // bottom
    [bar, 1.5, cx - halfW, cy],           // left
    [bar, 1.5, cx + halfW, cy],           // right
    [0.06, 1.5, cx, cy],                  // vertical mullion
    [2.0, 0.06, cx, cy],                  // horizontal mullion
  ];
  for (const [w, h, x, y] of frameBars) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), frameMat);
    b.position.set(x, y, fz);
    b.castShadow = sceneQuality() !== "low";
    b.userData.noCollide = true;
    scene.add(b);
  }
  // Window sill — also the bird's perch.
  const sill = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.06, 0.20), frameMat);
  sill.position.set(cx, -0.12, wz - 0.05);
  sill.userData.noCollide = true;
  scene.add(sill);
  // Bounce light faking the sun patch reflecting into the room — positioned
  // at the beam's floor patch (computed with the sunbeam below).
  const windowGlow = new THREE.PointLight(mood.glowC, mood.glowI, 12, 2);
  scene.add(windowGlow);
  // Fear-grade baselines — captured now that the whole mood-lit rig exists.
  const lightBase = {
    keyI: key.intensity, keyC: key.color.getHex(),
    hemiI: hemi.intensity, glowI: windowGlow.intensity,
  };

  // ---------- Bird outside the window ----------
  // A small silhouette that perches on the windowsill, looks around, then
  // flies off — comes back every 30-60 seconds. The dog notices and tracks
  // it briefly when it appears, breaking the otherwise self-centred world.
  // Reads as "the world is alive even when you're not the centre of it",
  // which is the single biggest "real game" cue.
  const bird = new THREE.Group();
  const birdMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.95 });
  const birdBody = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), birdMat);
  birdBody.scale.set(1.2, 0.9, 0.9);
  bird.add(birdBody);
  const birdHead = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), birdMat);
  birdHead.position.set(0.075, 0.04, 0);
  bird.add(birdHead);
  // Tiny beak
  const beak = new THREE.Mesh(
    new THREE.ConeGeometry(0.012, 0.035, 6),
    new THREE.MeshStandardMaterial({ color: 0xffae3a, roughness: 0.7 })
  );
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(0.118, 0.04, 0);
  bird.add(beak);
  bird.position.set(cx - 0.55, -0.04, ROOM.z0 - 0.18);   // perched on the windowsill
  bird.scale.setScalar(0.8);
  bird.visible = false;
  bird.userData = {
    state: "absent",         // "absent" | "perching" | "flying"
    nextAppearAt: 6,         // seconds — first appearance after 6s
    perchUntil: 0,
    flyT: 0,
    flyFromX: 0, flyFromY: 0,
    flyToX: 0, flyToY: 0,
    headTurnT: 0,
  };
  scene.add(bird);

  // ---------- Sunlight beam through the window ----------
  // The beam geometry is DERIVED from the actual key light direction, so the
  // shadow patch, the beam, and the window finally agree. Rung 4's low sun
  // automatically produces the long raking beam.
  const beamW = new THREE.Vector3(cx, cy, wz + 0.1);        // beam origin = window centre
  const kdir = new THREE.Vector3(0.5, -1, -1)
    .sub(new THREE.Vector3(...mood.keyPos)).normalize();    // key → target direction
  const beamLen = (beamW.y - (-1)) / Math.max(0.05, -kdir.y); // distance to floor along kdir
  const beamP = beamW.clone().addScaledVector(kdir, beamLen); // floor patch centre
  // Soft volumetric fake (makeSoftSunbeam): the old flat-shaded open cone
  // drew a hard line across the room, the most "rendered" thing in view.
  const sunbeam = makeSoftSunbeam(beamW, kdir, beamLen, { opacity: mood.beamO, wallZ: wz });
  scene.add(sunbeam);
  // The bounce light sits above the beam's floor patch — daylight visibly
  // pools where the beam actually lands.
  windowGlow.position.copy(beamP).add(new THREE.Vector3(0, 0.8, 0));

  // Dust motes — ONE THREE.Points instead of 24 sphere meshes (24 draw calls
  // → 1). Spawned inside the beam volume; each mote drifts + sways and
  // respawns near the window when it settles below the floor.
  const dustCount = sceneQuality() === "high" ? 110 : sceneQuality() === "medium" ? 60 : 30;
  const dustData = [];
  const dustPos = new Float32Array(dustCount * 3);
  const spawnMote = (i, randomAlong) => {
    const s = (randomAlong ? Math.random() : Math.random() * 0.25) * beamLen;
    const p = beamW.clone().addScaledVector(kdir, s);
    dustPos[i * 3]     = p.x + (Math.random() - 0.5) * 0.8;
    dustPos[i * 3 + 1] = p.y + (Math.random() - 0.5) * 0.3;
    dustPos[i * 3 + 2] = p.z + (Math.random() - 0.5) * 0.8;
  };
  for (let i = 0; i < dustCount; i++) {
    spawnMote(i, true);
    dustData.push({
      vx: (Math.random() - 0.5) * 0.05,
      vy: -0.04 - Math.random() * 0.06,
      vz: (Math.random() - 0.5) * 0.04,
      phaseX: Math.random() * Math.PI * 2,
      phaseY: Math.random() * Math.PI * 2,
    });
  }
  const dustGeo = new THREE.BufferGeometry();
  const dustAttr = new THREE.BufferAttribute(dustPos, 3);
  dustAttr.setUsage(THREE.DynamicDrawUsage);
  dustGeo.setAttribute("position", dustAttr);
  // Soft disc sprite so points read as motes, not squares
  const discC = document.createElement("canvas");
  discC.width = discC.height = 32;
  const discCtx = discC.getContext("2d");
  const discGrad = discCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  discGrad.addColorStop(0, "rgba(255,248,224,1)");
  discGrad.addColorStop(1, "rgba(255,248,224,0)");
  discCtx.fillStyle = discGrad;
  discCtx.fillRect(0, 0, 32, 32);
  // Motes are glints, not flakes: at 2.2 cm a mote a metre away was a
  // 30-pixel disc and the beam read as falling snow.
  const dustPoints = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.009, map: new THREE.CanvasTexture(discC),
    transparent: true, opacity: 0.42,
    blending: THREE.AdditiveBlending, depthWrite: false,
    sizeAttenuation: true,
  }));
  dustPoints.userData.noCollide = true;
  dustPoints.userData.noPick = true;
  scene.add(dustPoints);

  // ----- Friendly room props -----
  // Dog bed — bolster ring + inner cushion, with the plaster normal map
  // repurposed as a cheap fabric weave.
  const fabricNormal = plasterMaps.normal ? plasterMaps.normal.clone() : null;
  if (fabricNormal) { fabricNormal.needsUpdate = true; fabricNormal.repeat.set(3, 3); }
  const dogBed = new THREE.Group();
  const bedBase = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.15, 10, 24),
    new THREE.MeshStandardMaterial({ color: 0x5d6f8a, roughness: 0.95, normalMap: fabricNormal })
  );
  bedBase.rotation.x = -Math.PI / 2;
  bedBase.scale.set(1, 1, 0.72);
  // Sunk 2.5 cm below tangent contact: a fabric bolster SQUASHES against the
  // boards — the mathematical single-line touch read as hovering.
  bedBase.position.y = -0.915;
  bedBase.castShadow = true;
  dogBed.add(bedBase);
  const bedCushion = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.49, 0.10, 20),
    new THREE.MeshStandardMaterial({ color: 0x9bb0c7, roughness: 0.95, normalMap: fabricNormal })
  );
  bedCushion.position.y = -0.945;   // follows the bolster's squash
  dogBed.add(bedCushion);
  dogBed.position.set(dx(2.45), 0, -2.5 + jBedSide);
  scene.add(dogBed);

  // Water bowl — stainless steel (lathe profile with a real lip) + dielectric
  // water reflecting the PMREM environment. The old cylinder read as blue
  // plastic-chrome.
  const bowlPts = [
    [0, 0], [0.13, 0], [0.165, 0.015], [0.185, 0.06],
    [0.19, 0.105], [0.165, 0.115], [0.15, 0.06], [0.135, 0.02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(bowlPts, 24),
    new THREE.MeshStandardMaterial({ color: 0xcfd4d8, metalness: 0.9, roughness: 0.25, envMapIntensity: 1.2 })
  );
  const bowlX = dx(2.0), bowlZ = -1.3 + jBedSide;
  // Base EXACTLY on the boards (floor top = −1.0) — the old −0.99 left a
  // 1 cm float that read clearly at dog-height camera angles.
  bowl.position.set(bowlX, -1.0, bowlZ);
  bowl.castShadow = true;
  scene.add(bowl);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.145, 18),
    new THREE.MeshStandardMaterial({ color: 0x5d8dab, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.88, envMapIntensity: 1.6 })
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(bowlX, -0.91, bowlZ);   // follows the bowl's 1 cm drop
  scene.add(water);

  // Treat jar on a side table — visible "where the treats come from"
  const tableTop = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.06, 0.7),
    new THREE.MeshStandardMaterial({ color: 0x8a6442, roughness: 0.7 })
  );
  const tblX = dx(-2.6), tblZ = -2.5 + jTableSide;
  tableTop.position.set(tblX, -0.20, tblZ);
  tableTop.castShadow = true; tableTop.receiveShadow = true;
  scene.add(tableTop);

  // ---- Physical props (the room answers your hands) ----
  // Three graspable objects on the side table: click to take, click to throw.
  // Real rigid bodies — they tumble off the table, clatter on the boards and
  // come to rest wherever physics says. The dog clocks a landing object with
  // the head-cock. The fetch ball stays its own scripted system.
  const physProps = [];
  {
    const mkMug = () => {
      const g = new THREE.Group();
      const cup = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.038, 0.095, 14),
        new THREE.MeshStandardMaterial({ color: 0xb5533c, roughness: 0.5 }));
      cup.castShadow = true;
      g.add(cup);
      const handle = new THREE.Mesh(
        new THREE.TorusGeometry(0.026, 0.007, 8, 14, Math.PI),
        cup.material);
      handle.position.set(0.045, 0, 0);
      handle.rotation.z = -Math.PI / 2;
      g.add(handle);
      return g;
    };
    const mkBlock = () => {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(0.085, 0.085, 0.085),
        new THREE.MeshStandardMaterial({ color: 0x5b7fa6, roughness: 0.75 }));
      m.castShadow = true;
      return m;
    };
    const mkBall = () => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x7aa65b, roughness: 0.85 }));
      m.castShadow = true;
      return m;
    };
    const specs = [
      { build: mkMug,   x: tblX - 0.28, z: tblZ + 0.16, half: { x: 0.05, y: 0.05, z: 0.045 }, name: "mug" },
      { build: mkBlock, x: tblX + 0.05, z: tblZ + 0.20, half: { x: 0.043, y: 0.043, z: 0.043 }, name: "block" },
      { build: mkBall,  x: tblX + 0.30, z: tblZ + 0.12, shape: "ball", r: 0.048, name: "softball" },
    ];
    for (const s of specs) {
      const m = s.build();
      m.position.set(s.x, -0.17 + (s.half ? s.half.y : s.r), s.z);
      m.userData.noCollide = true;   // movement system ignores them; physics owns them
      // Invisible to the room's own pickers from the start, as addProp makes
      // them once physics is up — a tap on a mug before then is not a fetch
      // throw at the table.
      m.userData.noPick = true;
      scene.add(m);
      physProps.push({ mesh: m, spec: s });
    }
  }
  // Rapier is a 2 MB module with its WASM inlined: downloading, parsing and
  // compiling it at every mount — on every tier, phones included — paid for
  // three props most visits never touch. It starts when the traveler first
  // walks within reach range of the side table instead (see the update
  // loop), early enough to be ready before a prop can be reached (1.9 m),
  // and on the first visit that does it the module stays loaded for the rest.
  const physTable = { x: tblX, z: tblZ };
  let physBegun = false;
  function beginPhysics() {
    if (physBegun || !window.PhobiaPhysics) return;
    physBegun = true;
    PhobiaPhysics.begin({ groundY: -1.0 }).then((w) => {
      if (!w || dog.userData.disposed) return;
      const n = PhobiaPhysics.addStaticFromScene(scene, camera);
      physProps.forEach(({ mesh, spec }) =>
        PhobiaPhysics.addProp(mesh, { shape: spec.shape, r: spec.r, half: spec.half, name: spec.name }));
      // The dog reads the room: a real clatter earns the head-cock "hm?" and
      // a glance — the same attention any real dog gives a dropped mug.
      PhobiaPhysics.setOnImpact((rec, strength, pos) => {
        if (dog.userData.disposed || !dogCtrl) return;
        if (strength > 0.25) {
          try { dogCtrl.headCock(0.5 + strength * 0.4); } catch {}
          try { window.PhobiaExperiments && PhobiaExperiments.signal("prop.landed"); } catch {}
        }
      });
      console.info(`[dogs] physics: ${n} static bodies, ${physProps.length} props`);
    });
  }
  for (const [tx, tz] of [[tblX - 0.35, tblZ - 0.35], [tblX + 0.35, tblZ - 0.35],
                          [tblX - 0.35, tblZ + 0.35], [tblX + 0.35, tblZ + 0.35]]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.77, 8),
      new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 0.8 })
    );
    // Floor (−1.0) to the underside of the top (−0.23): centred at −0.615.
    // At −0.59 the legs stopped 2.5 cm short of the boards.
    leg.position.set(tx, -0.615, tz);
    scene.add(leg);
  }
  // Glass jar with biscuits inside. Real glass values: near-clear, dielectric,
  // PMREM sheen — the old milky 0.55-opacity half-metal cylinder read as a
  // glowing cyan slab whenever the player walked up to the side table.
  const jar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.13, 0.13, 0.30, 16),
    new THREE.MeshStandardMaterial({
      color: 0xf2f8fa, roughness: 0.06, metalness: 0,
      transparent: true, opacity: 0.18, envMapIntensity: 1.3, depthWrite: false,
    })
  );
  jar.position.set(tblX, -0.02, tblZ);
  scene.add(jar);
  // Biscuits inside (a few small bone shapes, just spheres for simplicity).
  // Positioned relative to the JAR (tblX/tblZ) — they were hardcoded to an
  // old fixed table spot, so whenever the scene context moved the table the
  // biscuits stayed behind, levitating a metre up in the middle of the room.
  for (let i = 0; i < 4; i++) {
    const biscuit = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xc59060, roughness: 0.7 })
    );
    biscuit.position.set(
      tblX + (Math.random() - 0.5) * 0.12,
      -0.10 + i * 0.025,
      tblZ + (Math.random() - 0.5) * 0.12
    );
    scene.add(biscuit);
  }
  // Jar lid
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16),
    new THREE.MeshStandardMaterial({ color: 0xc92e2e, roughness: 0.5 })
  );
  lid.position.set(tblX, 0.15, tblZ);
  scene.add(lid);

  // Houseplant — clay lathe pot + a fan of alpha-tested leaf cards at the
  // golden angle. Replaces the sphere-blob shrub that read as a green cloud.
  const potPts = [
    [0, 0], [0.22, 0], [0.26, 0.12], [0.30, 0.38], [0.24, 0.40], [0.20, 0.12],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry(potPts, 18),
    new THREE.MeshStandardMaterial({ color: 0x9c5a3a, roughness: 0.8 })
  );
  // In front of the table, clear of it: the pot's 0.30 m rim used to sit
  // over the table's front-left leg even before any jitter.
  const potX = dx(-2.85), potZ = -1.55 + jTableSide;
  pot.position.set(potX, -1.0, potZ);
  pot.castShadow = true;
  scene.add(pot);
  const leafGeom = new THREE.PlaneGeometry(0.16, 0.42);
  leafGeom.translate(0, 0.21, 0);              // pivot at the leaf base
  const leafMat = new THREE.MeshStandardMaterial({
    map: makeLeafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9,
  });
  for (let i = 0; i < 14; i++) {
    const leaf = new THREE.Mesh(leafGeom, leafMat);
    const yaw = i * 2.399;                     // golden angle fan
    leaf.position.set(potX + Math.cos(yaw) * 0.07, -0.58, potZ + Math.sin(yaw) * 0.07);
    leaf.rotation.y = yaw;
    leaf.rotation.x = -(0.45 + Math.random() * 0.5);
    leaf.scale.setScalar(0.8 + Math.random() * 0.5);
    leaf.castShadow = sceneQuality() !== "low";
    leaf.userData.noCollide = true;
    scene.add(leaf);
  }

  // Build the real (rigged GLTF) dog. Breed + height come from the level so
  // the ladder reads as a clear small→large progression: a small Shiba Inu on
  // the early, calm rungs and a larger Husky as it gets closer and more
  // agitated. `distance` is the dog's z-offset in the room — smaller `size`
  // rungs put it farther away (a calm, distant dog feels safer); larger rungs
  // bring it close for a direct, head-on encounter. The user spawns at z≈4.
  const breed = level.breed || (size <= 0.5 ? "shiba" : "husky");
  // World height (feet→ears): genuinely small early, genuinely big late, so the
  // jump in size between rungs is unmistakable.
  const dogHeight = level.dogHeight || (0.5 + size * 0.7);   // ~0.55 → ~1.2 m
  // Personal-space line for the barking rung — the dog never closes past this.
  const PERSONAL_SPACE = B.personalSpace || Math.max(2.8, dogHeight * 2.4);
  // Spawn distance. Barking opens with the dog visibly across the room so the
  // user chooses how close to stand; calmer rungs scale with size.
  const distance = intensity === "barking"
    ? Math.max(4.2, PERSONAL_SPACE + 1.4)
    : 1.5 + (1 - size) * 2.5;               // 1.5 (head-on) → 3.4 (far)
  // Coat is this traveller's dog, kept across visits. Where it happens to be
  // standing when you walk in is the part that varies.
  const coat = coatFor("dog." + breed, DOG_COATS[breed] || DOG_COATS.shiba);
  const dog = buildDog({ breed, targetHeight: dogHeight, coat });
  // The model drops its own feet onto the Group origin, so we just stand the
  // Group on the floor (the floor plane sits at y = -1).
  // Same dog, different day: it is somewhere else in the room each visit, and
  // sometimes a little nearer or further within the rung's band. The RADIAL
  // distance still belongs to the rung — that is the difficulty — so only the
  // lateral placement and a small depth jitter move.
  const dogStartX = (intensity === "barking") ? V.range(-0.6, 0.6) : V.range(-1.9, 1.9);
  const dogStartZ = -distance + V.range(-0.35, 0.35);
  dog.position.set(dogStartX, -1, dogStartZ);
  // Home zone: rungs with homeRadius wander around their SPAWN spot, keeping
  // the rung's distance premise true for the whole hold.
  const homeAnchor = { x: dogStartX, z: dogStartZ };
  // Facing: forward is +Z. The barking rung faces the player head-on (it's
  // worked up). Calmer rungs start the dog turned away — busy with its own
  // thing — so the user has to approach and let the dog notice them; the
  // DogController then turns the dog to watch the player within ~5 m.
  const facePlayer = Math.atan2(camera.position.x - dogStartX, camera.position.z - dogStartZ);
  dog.rotation.y = (intensity === "barking")
    ? facePlayer
    : facePlayer + Math.PI + (Math.random() - 0.5) * 1.2;
  scene.add(dog);

  // ---- Scene acoustics ----
  // Shared room reverb (skipped on low tier — the ConvolverNode isn't free),
  // recorded-sample preload (falls back to synthesis per-kind), and the dog's
  // fundamental pitch: a small shiba barks high, the husky barks deep.
  const liveAudio = [];               // every handle with .stop() registers here
  if (window.PhobiaAudio && window.PhobiaAudio.roomReverb && sceneQuality() !== "low") {
    liveAudio.push(window.PhobiaAudio.roomReverb({ level: 0.18 }));
  }
  if (window.PhobiaAudio && window.PhobiaAudio.preloadDogSamples) {
    try { window.PhobiaAudio.preloadDogSamples(); } catch {}
  }
  const dogF0 = 460 - dogHeight * 160;   // 383 Hz shiba → 271 Hz husky

  // ---------- Goal indicator: petting circle around the dog ----------
  // A soft glowing ring on the floor under the dog. The ring tells the user
  // "step into here to earn credit". Fades out once the user is within
  // petting range. Skipped on the barking-intensity rung where the goal is
  // to hold ground from a distance (not approach).
  let dogGoalRing = null;
  let goalRingReachedT = 0;      // seconds the player has spent inside it
  if (intensity !== "barking") {
    // A soft band of light on the boards, not a decal. The old ring was a
    // flat teal annulus with hard edges, 3.2 m across and pulsing at up to a
    // third opacity — the most game-like object in the room, painted around
    // the animal the player is meant to be watching. Now a radial gradient
    // that rises and falls across the band (no edges anywhere), at a fraction
    // of the strength, and retired for good once the player has stood in it:
    // by then it has said what it had to say.
    const ringC = document.createElement("canvas");
    ringC.width = ringC.height = 256;
    const rg = ringC.getContext("2d");
    const grad = rg.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0.00, "rgba(255,255,255,0)");
    grad.addColorStop(0.58, "rgba(255,255,255,0)");
    grad.addColorStop(0.72, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.80, "rgba(255,255,255,1)");
    grad.addColorStop(0.89, "rgba(255,255,255,0.4)");
    grad.addColorStop(1.00, "rgba(255,255,255,0)");
    rg.fillStyle = grad;
    rg.fillRect(0, 0, 256, 256);
    dogGoalRing = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({
        color: 0xb4ece0,
        map: new THREE.CanvasTexture(ringC),
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
        fog: false,
      })
    );
    dogGoalRing.userData.noCollide = true;
    dogGoalRing.userData.noPick = true;
    dogGoalRing.userData.ssaoSkip = true;
    dogGoalRing.rotation.x = -Math.PI / 2;
    // Floor is at y = -1
    dogGoalRing.position.set(dog.position.x, -0.985, dog.position.z);
    scene.add(dogGoalRing);
  }

  // Floating dog name above the head — pulled from the user's character
  // (or "Buddy" by default). Helps the dog feel like an individual, not a
  // generic "dog object". Made out of a CanvasTexture sprite so it always
  // faces the camera.
  // Per-breed identity: the calm Shiba and the agitated Husky are fictionally
  // DIFFERENT animals — sharing a name (and trust, see below) let bonding with
  // the puppy mute the climax dog.
  const dogName = (() => {
    try {
      return breed === "husky"
        ? (localStorage.getItem("fobia.dogName.husky") || "Koda")
        : (localStorage.getItem("fobia.dogName") || "Buddy");
    } catch { return breed === "husky" ? "Koda" : "Buddy"; }
  })();
  // Leave a trace of this encounter for the pages outside the scene. The
  // temperament is drawn per visit and was only ever legible for the seconds
  // it was on screen; written down, it lets the realm page say who the
  // traveller actually met last time instead of describing a species.
  try {
    localStorage.setItem(`fobia.dogs.lastSeen.${breed}`, JSON.stringify({
      temper: temper.label, rung: levelIdx, ts: Date.now(),
    }));
  } catch {}
  function makeNameSprite(text) {
    const c = document.createElement("canvas");
    c.width = 512; c.height = 128;
    const ctx = c.getContext("2d");
    ctx.font = "bold 56px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    // Soft pill background
    const w = ctx.measureText(text).width + 48;
    const x = 256 - w / 2;
    const r = 40;
    ctx.fillStyle = "rgba(20, 16, 14, 0.55)";
    ctx.beginPath();
    ctx.moveTo(x + r, 32);
    ctx.lineTo(x + w - r, 32); ctx.quadraticCurveTo(x + w, 32, x + w, 32 + r);
    ctx.lineTo(x + w, 96 - r); ctx.quadraticCurveTo(x + w, 96, x + w - r, 96);
    ctx.lineTo(x + r, 96); ctx.quadraticCurveTo(x, 96, x, 96 - r);
    ctx.lineTo(x, 32 + r); ctx.quadraticCurveTo(x, 32, x + r, 32);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillText(text, 256, 64);
    return new THREE.CanvasTexture(c);
  }
  // (The floating 3D name pill above the dog was removed: it read as a
  // free-to-play game label — depthTest:false made it hover over the body — and
  // the dog's name already lives in the trust HUD. Letting the animal be an
  // animal, not a tagged game object, is what the exposure needs. makeNameSprite
  // is retained above in case a future caption needs it.)

  // Heart particles — visible "the dog likes that" feedback when petting,
  // treating, or fetching. Implemented as a sprite pool. Spawned by `popHeart`.
  const heartTex = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ff6b86";
    ctx.beginPath();
    // Heart shape via two arcs + triangle
    ctx.moveTo(32, 22);
    ctx.bezierCurveTo(32, 14, 14, 14, 14, 30);
    ctx.bezierCurveTo(14, 42, 32, 52, 32, 56);
    ctx.bezierCurveTo(32, 52, 50, 42, 50, 30);
    ctx.bezierCurveTo(50, 14, 32, 14, 32, 22);
    ctx.fill();
    return new THREE.CanvasTexture(c);
  })();
  const hearts = [];
  function popHeart() {
    const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthTest: false }));
    h.scale.set(0.20, 0.20, 1);
    // World-position over the dog's head
    const wp = new THREE.Vector3();
    dog.getWorldPosition(wp);
    h.position.set(wp.x + (Math.random() - 0.5) * 0.4, wp.y + dogHeight + 0.3, wp.z);
    h.userData = { life: 1.0, vx: (Math.random() - 0.5) * 0.6, vy: 0.5 + Math.random() * 0.4 };
    scene.add(h);
    hearts.push(h);
  }

  // ----- Mutable state for the dog scene -----
  // Declared early so async click / key handlers below can safely close over
  // them even though they're updated by the update loop later.
  let petPulse = 0;
  // Stare pressure → look-away (see the gaze-priority block in update()).
  let _stareSm = 0;             // 0..1 smoothed "you are staring at me"
  let _lookAwayUntil = 0;       // scene time the current aversion ends
  let _lookAwaySide = 1;        // which way the head turned, −1 | 1
  let _lookAwayToldOnce = false;
  // A click just outside arm's reach is an invitation, not a magical pet.
  // Keeping it as a short-lived request lets the dog close the gap first, then
  // starts the hand/contact feedback only when the two bodies can actually
  // meet. Distances are SURFACE gaps (center-to-center minus both body radii)
  // so a large husky and a small shiba feel the same arm's reach.
  const PET_CONTACT_SURFACE = 0.55;   // ~arm reach past body surfaces
  const PET_INVITE_SURFACE = 1.35;
  function bodySurfaceDist(ax, az, bx, bz, ar, br) {
    return Math.max(0, Math.hypot(ax - bx, az - bz) - (ar || 0) - (br || 0));
  }
  function playerDogSurfaceDist(pp) {
    if (!pp) return Infinity;
    const pr = (dogsControls && dogsControls.bodyRadius) || dogCtrl.playerRadius || 0.30;
    return bodySurfaceDist(pp.x, pp.z, dog.position.x, dog.position.z, pr, dogCtrl.radius || 0.35);
  }
  // Whole-body flinch on the avatar, scaled by how close the bark landed:
  // a bark at arm's length jolts the shoulders; across the room it barely
  // registers. (The FP camera has its own kickShake — this reaches the
  // third-person body, which used to stand statuesque through every bark.)
  function bodyJolt(base) {
    try {
      const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
      const dd = Math.hypot(dog.position.x - pp.x, dog.position.z - pp.z);
      const prox = Math.max(0.2, Math.min(1, 1.25 - dd / 6));
      const amp = base * prox;
      if (window.PhobiaFX && window.PhobiaFX.bodyStartle) window.PhobiaFX.bodyStartle(amp);
      // The involuntary inhale rides the big flinches only — a gasp per
      // across-the-room bark would train the player to stop believing it.
      if (amp > 0.34 && window.PhobiaAudio && window.PhobiaAudio.breathCatch) {
        window.PhobiaAudio.breathCatch(amp);
      }
    } catch {}
  }
  let petRequestT = 0;
  // Spontaneous barks are scheduled by the per-rung escalation arc (below);
  // Infinity = not yet armed. (The barking rung owns its own warning cadence.)
  let nextSpontaneousBark = Infinity;
  let dogsControls = null;
  // Per-rung escalation arc state (rung 3 lying→stand→bark, rung 4 settle)
  const esc = { t0: 0, stood: false, settled: false };
  let startPoseApplied = false;
  let barkAt = 0, barkDistSnap = 0;      // "bark weathered" achievement
  let arousalFloor = 0;                  // post-warning fear floor (credit honesty)
  let completionBeatDone = false;        // diegetic completion beat one-shot
  let _completedCalm = false;            // warms the light after the hold
  // Scratch vectors for driving the FP hand onto the real dog (no per-frame GC).
  const _petPt = new THREE.Vector3();
  const _petN  = new THREE.Vector3();
  const _petProbe = new THREE.Vector3();   // scratch for the reachability scan
  // Shared threat focus (the avatar's gaze fixates an active threat): ONE
  // reused object written per frame — never re-allocated.
  const threatPos = { x: 0, y: 0, z: 0 };
  const _threatV = new THREE.Vector3();
  // Ambient breathing/panting so the dog reads as alive between cues, plus an
  // "exertion" level that rises with barking/warning and speeds the breath.
  let dogPantTimer = 1.2;
  let _prevShakePulse = 0;   // shake-off jingle edge detector
  let dogExertion = 0;
  // Player kinematics toward the dog (charge-startle + bump response): the
  // dog previously could not tell a sprint from a creep. Velocity is the
  // player's own, projected on the player→dog line — closure caused by the
  // DOG moving (fetch return, call) must never read as a charge.
  const _prevPP = { x: 0, z: 0, t: -1 };
  let _apprSm = 0, _pvxSm = 0, _pvzSm = 0, _pSpdSm = 0;
  let startleT = 0, startleCDUntil = 0, startlePrompted = false;
  let _bumpCDUntil = 0;
  let _excSm = 0;                     // gentle-approach excitement ramp (0..1)
  // Deferred startle scramble: the duck-flinch plays FIRST (a stationary
  // clip), THEN the recoil step — walkTo flips state to walking, and
  // flinch() refuses from walking, so firing both same-frame killed the duck.
  let startleHop = null;              // { x, z, at }
  // Scene clock mirror + the deferred come-here walk (call → head-cock →
  // walk); commandDog runs outside update() and has no `t` of its own.
  let sceneNow = 0;
  let callWalkAt = 0;
  // One play-bow per windup — edge-triggered so holding the ball doesn't
  // re-bow every frame.
  let bowedThisWindup = false;
  // Arrival-greeting + banana-walk bookkeeping (call/auto-approach), and the
  // ball delivery show-off beat.
  let callGreetPending = false, callGreetDeadline = 0;
  let arcApproachTgt = null;      // { x, z, until } — second leg of a curved approach
  let ballShowUntil = 0;
  let _settleSniffed = false;     // calming-signal ground-sniff, once per settle
  let storedActiveControls = null;
  // Auto-approach scheduling — initialised on first update tick once `t` is
  // known, then reset to a future time after each approach attempt.
  let autoApproachEnabled = false;
  let nextAutoApproach = 0;
  let wanderSuppressUntil = 0;   // after auto-approach, don't yank the dog home yet
  // Character-driven event flags — fire context prompts as the player
  // crosses proximity thresholds toward the dog. Once-per-rung so the user
  // isn't nagged after they've already seen the cue.
  const dogPlayerState = {
    dogNoticedYou: false,
    closeApproach: false,
    sniffGreeted: false,   // closed-fist sniff beat before first pet
    petted: false,
    walkedAway: false,
  };
  // First-contact sniff greeting: when the player first enters pet range the
  // dog investigates the offered hand (therapy tip: closed fist, let it sniff)
  // before full petting. Timer drives head-low + audio; ends on its own or
  // when the user pets.
  let sniffGreetT = 0;
  // Autonomous wandering — dog moves to a random spot in the room every
  // 12-25 s when calm and trust is at least 0.2. Different from auto-approach
  // (which targets the player) — wandering targets random nearby positions
  // so the dog reads as "having its own agenda" rather than always orbiting
  // the user.
  let nextWander = 0;
  // Sniffing — dog briefly lowers its head + walks slowly while sniffing.
  // Independent of wander; can chain after a wander or trigger spontaneously.
  let sniffActive = false;
  let sniffEndsAt = 0;

  // ----- Fetchable item -----
  // A single live "item" the dog can fetch. It can be a TREAT (small biscuit)
  // or a BALL (rubber ball with bounce). Both follow the same pickup/drop
  // logic — only their geometry / physics differ. The ball has gravity +
  // bounce so the eye reads it as a real thrown ball, not a teleported orb.
  let item = null;        // { mesh, kind: "treat"|"ball", state, vel: Vector3 }
  let fetchPhase = "idle";
  let fetchToItemT = 0;   // time without PROGRESS toward a thrown item (stall guard)
  let fetchBestDist = Infinity;   // closest the dog has got to it this chase
  let returnT = 0;                       // time spent on the return leg
  const returnTgt = { x: 0, z: 0 };      // where the return walk was last aimed
  const _rollAxis = new THREE.Vector3();   // scratch — ball roll axis per frame

  function clearItem() {
    if (!item) return;
    if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
    item.mesh.geometry.dispose();
    item.mesh.material.dispose();
    item = null;
  }
  // Walk to a point `standOff` metres (surface gap) from the player along the
  // dog→player vector. The old fixed (x, z+0.6) offset only worked when the
  // player stood south of the dog — from any other angle the dog walked past
  // / through them. Convert surface standOff → center distance so call/return
  // / fetch drop all agree on the same stop distance.
  function playerStandOffCenter(standOff = 0.55) {
    const pr = dogCtrl.playerRadius || 0.30;
    return standOff + pr + (dogCtrl.radius || 0.35);
  }
  function walkToPlayer(standOff = 0.55, opts) {
    const pp = (storedActiveControls && storedActiveControls.position)
      || (dogsControls && dogsControls.position) || camera.position;
    const dx = pp.x - dog.position.x, dz = pp.z - dog.position.z;
    const dist = Math.hypot(dx, dz) || 1;
    const centerOff = playerStandOffCenter(standOff);
    const k = Math.max(0, (dist - centerOff) / dist);
    dogCtrl._moveLockT = Math.max(dogCtrl._moveLockT || 0, 6);
    const tx = dog.position.x + dx * k, tz = dog.position.z + dz * k;
    arcApproachTgt = null;   // a direct leg cancels any pending curve
    // A called dog comes at a happy TROT on a curve — the controller trots
    // any leg longer than a couple of metres and walks the last one — and
    // only a genuinely long call (8 m+, i.e. not in this room) is run. This galloped every call
    // past 2.2 m because the pack had no trot: a sprint straight at a
    // frightened player on the calmest rungs, skipping the banana curve
    // below that exists precisely because a head-on approach is
    // confrontational in dog language.
    if (dist - centerOff > 8.0 && dogCtrl.mood !== "aggressive") {
      dogCtrl.gallopTo(tx, tz);
    } else if (opts && opts.arc && dist - centerOff > 1.6) {
      // Banana walk: dogs greet on a CURVE — a straight head-on approach is
      // confrontational in dog language. Swing out ~35-45° for the first
      // leg; the update loop converges the second leg on arrival.
      const swing = (Math.random() < 0.5 ? 1 : -1) * (0.61 + Math.random() * 0.17);
      const legAng = Math.atan2(dx, dz) + swing;
      const legLen = (dist - centerOff) * 0.55;
      const way = dogCtrl._resolve(dog.position.x + Math.sin(legAng) * legLen,
                                   dog.position.z + Math.cos(legAng) * legLen);
      dogCtrl.walkTo(way.x, way.z, { force: true });
      arcApproachTgt = { x: tx, z: tz, until: 0 };
    } else {
      dogCtrl.walkTo(tx, tz, { force: true });
    }
  }
  function completePet() {
    petRequestT = 0;
    petPulse = 1.0;
    dogCtrl.tailWag += 8;
    // A successful pet is a greeting beat: brief head-cock + lean impulse so
    // the dog visibly answers the touch, not just absorbs it.
    if (dogCtrl.mood !== "aggressive") {
      dogCtrl.headCock(0.55);
      dogCtrl._nudgeT = Math.max(dogCtrl._nudgeT || 0, 1.2); // invite a nuzzle soon
    }
    // The pet's answer (relief pulse, pant/woof) is gated at 1.2 s so
    // click-spam still pets the dog (pulse + wag + hearts) without stacking
    // sounds; bumpTrust owns the trust cooldown and taper for touch.
    const nowSec = performance.now() / 1000;
    if (nowSec - lastPetGrantT > 1.2) {
      lastPetGrantT = nowSec;
      bumpTrust("pet");
      // Soft face pulse on the avatar — the warm look of contact landing.
      try { window.dispatchEvent(new CustomEvent("mira-relief")); } catch {}
      // Close the sensory loop: contented pant + a soft woof when available
      // so the bond feels reciprocal, not like the avatar touched a prop.
      const dogPos = { x: dog.position.x, y: dog.position.y + dogHeight * 0.35, z: dog.position.z };
      if (dogCtrl.mood !== "aggressive" && window.PhobiaAudio) {
        try {
          if (window.PhobiaAudio.dogVocal) {
            window.PhobiaAudio.dogVocal("pant", 0.35, dogPos);
            if (Math.random() < 0.45) window.PhobiaAudio.dogVocal("woof", 0.32, dogPos, { count: 1 });
          } else if (window.PhobiaAudio.dogPant) {
            window.PhobiaAudio.dogPant(0.32, dogPos);
          }
        } catch {}
      }
      if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic([20]);
    } else {
      popHeart();
    }
  }
  // Sizes of the real things: a fetch ball the hand can close round (14 cm)
  // and a treat that fits between two fingers. The old 20 cm ball filled a
  // third of the first-person view on the windup and dwarfed the hand; the
  // 12 cm "treat" was the size of an orange.
  const FETCH_BALL_R = 0.07, TREAT_R = 0.028;
  const BALL_REST_Y = -1 + FETCH_BALL_R, TREAT_REST_Y = -1 + TREAT_R * 0.62;
  function buildBall() {
    // Classic fetch ball: red with a white equator band. A solid-colour
    // sphere hides its own rotation completely — the flight spin, bounces
    // and roll-out only read as motion when there's a stripe to track.
    const cv = document.createElement("canvas");
    cv.width = 8; cv.height = 64;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#d84545"; cx.fillRect(0, 0, 8, 64);
    cx.fillStyle = "#f2ece2"; cx.fillRect(0, 26, 8, 12);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(FETCH_BALL_R, 18, 14),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.05 })
    );
    ball.castShadow = true;
    return ball;
  }
  function buildTreatMesh() {
    // A biscuit, not a 12 cm orb: flattened so it lies like one.
    const t = new THREE.Mesh(
      new THREE.SphereGeometry(TREAT_R, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc59060, roughness: 0.7 })
    );
    t.scale.set(1.5, 0.62, 1.0);
    t.userData.baseScale = t.scale.clone();
    t.castShadow = true;
    return t;
  }
  // Throw an item from the player toward (tx, tz). The throw has two phases:
  //   1. "windup" — the item is parented to the camera so it appears in the
  //      user's hand. The hand visibly arcs upward + back over ~0.4 s as the
  //      user "winds up" for the throw. This is the anticipation that turns
  //      a teleporting orb into a felt physical action.
  //   2. "flying" — the item is re-parented to the scene and follows a
  //      gravity-driven arc until it lands. Existing fetch state machine
  //      then takes over.
  function throwItem(kind, tx, tz) {
    clearItem();
    // Throw targets must be places the dog can physically reach. A raycast can
    // land on the bed, side table, or just beyond the room boundary; letting
    // the ball settle there made the fetch controller pace against a prop
    // before its emergency stall guard teleported the item. Project the target
    // through the same navigation resolver used by the dog before the throw.
    const target = dogCtrl && dogCtrl._resolve ? dogCtrl._resolve(tx, tz) : { x: tx, z: tz };
    const mesh = kind === "ball" ? buildBall() : buildTreatMesh();
    // Never a raycast answer: during the windup it sits 0.3 m in front of
    // the camera, where it swallowed any quick second click and turned it
    // into a throw-at-your-own-feet.
    mesh.userData.noPick = true;
    // Windup parent depends on the camera mode. FP: ride the camera so the
    // item sits in "your" hand. TP: the camera is metres BEHIND the avatar —
    // camera-parenting there made the windup completely invisible (the ball
    // popped into existence mid-flight). Instead, put it in the avatar's
    // actual right hand (end of the forearm) so the throw reads on-body.
    const tpHold = !!(dogsControls && dogsControls.cameraMode === "tp"
      && active && active.body && active.body.arms);
    if (tpHold) {
      const arm = active.body.arms.find(a => a.side > 0);
      mesh.position.set(0, -0.30, -0.04);   // just past the forearm tip
      arm.elbow.add(mesh);
      // A real underhand toss: the arm swings back, then through, and lets go
      // on the way up. Timed so the release lands on the windup's end.
      if (active.body.playThrow) active.body.playThrow({ side: 1, release: kind === "ball" ? 0.62 : 0.55, soft: kind !== "ball" });
    } else if (active && active.hands && active.hands.playToss && active.hands.cameraMode !== "tp") {
      // First person: the item rests in your right palm and the hand swings
      // it — it used to float in front of the camera beside two empty hands.
      const hh = active.hands;
      mesh.position.copy(hh.tossHoldOffset(kind === "ball" ? FETCH_BALL_R : TREAT_R));
      hh.right.add(mesh);
      hh.playToss(0.5);
    } else {
      // The local position is in front-right of the camera, at hand height.
      mesh.position.set(0.18, -0.16, -0.32);
      camera.add(mesh);
      if (!scene.children.includes(camera)) scene.add(camera);
    }
    const inHand = !tpHold && mesh.parent && active && active.hands && mesh.parent === active.hands.right;
    item = {
      mesh, kind, tpHold, inHand,
      state: "windup",
      windupT: 0,
      // TP: matches Body.playThrow's release. FP: long enough for the hand to
      // come up and close round the item before it leaves.
      windupDuration: tpHold ? (kind === "ball" ? 0.62 : 0.55) : 0.5,
      // Capture target so we can compute the throw velocity at release time
      target: { x: target.x, z: target.z },
      vel: new THREE.Vector3(0, 0, 0),
      bounces: 0,
    };
  }
  // Called from update each frame while item is in windup. Animates the
  // mesh's local position in an upward-back arc; on completion, re-parents
  // the mesh to the scene at the current world position and applies the
  // throw velocity computed from the captured target.
  function tickWindup(d) {
    if (!item || item.state !== "windup") return;
    item.windupT += d;
    const k = Math.min(1, item.windupT / item.windupDuration);
    // Anticipation arc: mesh moves UP (y) and slightly BACK (z) then forward
    // as the throw releases. We use a curve that goes back-up-forward.
    // 0..0.7: hand winds back/up; 0.7..1: hand snaps forward (throw).
    if (item.tpHold || item.inHand) {
      // Held in a hand — the swing is Body.playThrow's (third person) or
      // Hands.playToss's (first person); the item just rides the palm.
    } else {
      // Held out at arm's length, not under your nose: at 0.3 m a 20 cm ball
      // filled a third of the view and swallowed the hand holding it.
      let lx = 0.19, ly = -0.13, lz = -0.52;
      if (k < 0.7) {
        const u = k / 0.7;       // 0..1 windup
        ly = -0.13 + u * 0.10;   // rises
        lz = -0.52 + u * 0.08;   // pulls back slightly (z increases = closer to camera)
      } else {
        const u = (k - 0.7) / 0.3;   // 0..1 release
        ly = -0.03 - u * 0.10;       // snaps down + forward
        lz = -0.44 - u * 0.14;       // and forward into release
      }
      item.mesh.position.set(lx, ly, lz);
    }
    if (k >= 1) releaseItem();
  }
  function releaseItem() {
    if (!item || item.state !== "windup") return;
    // World position of the mesh at release moment
    const worldStart = new THREE.Vector3();
    item.mesh.getWorldPosition(worldStart);
    // Re-parent to scene (parent is the camera in FP, the avatar arm in TP)
    if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
    item.mesh.position.copy(worldStart);
    item.mesh.rotation.set(0, 0, 0);
    item.mesh.scale.setScalar(1);
    if (item.mesh.userData.baseScale) item.mesh.scale.copy(item.mesh.userData.baseScale);
    scene.add(item.mesh);
    // Compute throw velocity from current world pos to target
    const tx = item.target.x, tz = item.target.z;
    const dx = tx - worldStart.x, dz = tz - worldStart.z;
    const dist = Math.hypot(dx, dz);
    let T = Math.max(0.5, dist * 0.25);
    const g = 9.8;
    // Solve the ballistic arc so the item reaches FLOOR level exactly at the
    // clicked point at time T. The old fixed lob (g·T/2 + 1.4) was still
    // 1.4·T metres above the hand when it crossed the target, so every throw
    // sailed a couple of metres past where the user aimed.
    const restY = item.kind === "ball" ? BALL_REST_Y : TREAT_REST_Y;
    // …and keep that arc under the ceiling. A flight time of dist/4 puts the
    // apex ≈ 0.077·dist² above the hand: the natural 7.5 m throw from the
    // doorway peaked around 4 m, so three quarters of its flight was hidden
    // inside the roof while the dog stared up at the plaster. The longest
    // flight that still tops out 25 cm under the ceiling is the time to
    // climb to that height plus the time to fall from it; a longer throw
    // simply goes flatter and faster.
    {
      const capY = ROOM.ceilY - 0.25;
      const climb = Math.max(0.05, capY - worldStart.y);
      const tCap = Math.sqrt(2 * climb / g) + Math.sqrt(2 * Math.max(0.05, capY - restY) / g);
      if (T > tCap) T = tCap;
    }
    const vy = (restY - worldStart.y) / T + (g * T / 2);
    const vx = dx / T, vz = dz / T;
    item.vel.set(vx, vy, vz);
    item.state = "flying";
  }

  // ---- A treat from your hand ----
  // With the dog already near, a treat isn't thrown: you hold it out, low and
  // still, and the dog comes in and takes it from your fingers. For someone
  // afraid of dogs that is a very big step — a mouth at your hand, by your
  // choice — and the dog's soft take is the evidence. If it doesn't come for
  // it within ten seconds the treat is set down at your feet instead.
  const _offerPt = new THREE.Vector3();
  function canOfferTreat() {
    // Not on the first rung: a far, busy dog gets its treat tossed — the
    // hand is the next step up the ladder.
    if (levelIdx < 1 || item || intensity === "barking" || !dog.userData.ready) return false;
    if (fetchPhase !== "idle" || dogCtrl.mood === "aggressive") return false;
    return lastPlayerDist < (B.inZoneDist ?? 3.0);
  }
  function offerTreat() {
    clearItem();
    const mesh = buildTreatMesh();
    mesh.userData.noPick = true;
    const tpHold = !!(dogsControls && dogsControls.cameraMode === "tp" && active && active.body && active.body.arms);
    const hh = active && active.hands;
    if (tpHold) {
      const arm = active.body.arms.find(a => a.side > 0);
      mesh.position.set(0, -0.30, -0.04);
      arm.elbow.add(mesh);
    } else if (hh && hh.right && hh.tossHoldOffset && hh.cameraMode !== "tp") {
      mesh.position.copy(hh.tossHoldOffset(TREAT_R));
      hh.right.add(mesh);
    } else {
      mesh.position.set(0.16, -0.24, -0.46);
      camera.add(mesh);
      if (!scene.children.includes(camera)) scene.add(camera);
    }
    item = { mesh, kind: "treat", tpHold, inHand: true, state: "offer", offerT: 0, rewalkAt: 1.2, vel: new THREE.Vector3(), bounces: 0 };
    // Up to your hand, not past it: a closer stand-off than a call.
    walkToPlayer(0.15);
    dogCtrl._moveLockT = Math.max(dogCtrl._moveLockT || 0, 8);
  }
  function takeFromHand() {
    clearItem();
    fetchPhase = "idle";
    dogCtrl._moveLockT = 0;
    dogCtrl.stopMove();
    dogCtrl.eat();
    dogCtrl.tailWag += 4;
    if (window.PhobiaAudio?.dogMouthGrab) {
      try { window.PhobiaAudio.dogMouthGrab({ x: dog.position.x, y: dog.position.y + dogHeight * 0.55, z: dog.position.z }); } catch {}
    }
    if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic([10, 40, 10]);
    bumpTrust("treat", window.t("sc.d.handFed", "Gently, from your hand. That builds the bond."));
    lifeNextAt = Math.max(lifeNextAt, sceneNow + 5);
    treatEaten(true);
  }
  // Not taken: lay it down at your feet (the ordinary landed-treat path).
  function setTreatDown() {
    const world = new THREE.Vector3();
    item.mesh.getWorldPosition(world);
    if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
    item.mesh.position.copy(world);
    item.mesh.rotation.set(0, 0, 0);
    item.mesh.scale.setScalar(1);
    if (item.mesh.userData.baseScale) item.mesh.scale.copy(item.mesh.userData.baseScale);
    scene.add(item.mesh);
    item.vel.set(0, 0, 0);
    item.state = "flying"; item.inHand = false;
    fetchPhase = "flying";
  }
  function tickOffer(d, controls) {
    item.offerT += d;
    item.mesh.getWorldPosition(_offerPt);
    const pp = controls ? controls.position : camera.position;
    const dHand = Math.hypot(dog.position.x - _offerPt.x, dog.position.z - _offerPt.z);
    const dPl = Math.hypot(dog.position.x - pp.x, dog.position.z - pp.z);
    if (dHand < (dogCtrl.radius || 0.35) + 0.34 || (dogCtrl.state === "idle" && dPl < playerStandOffCenter(0.3))) takeFromHand();
    else if (item.offerT > 10) setTreatDown();
    else if (dogCtrl.state === "idle" && item.offerT > item.rewalkAt) { item.rewalkAt = item.offerT + 1.5; walkToPlayer(0.15); }
  }

  const dogCtrl = new DogController(dog, scene, camera);
  dog.userData.ctrl = dogCtrl;   // observability for the scene-verification hooks

  // ---------- Contact shadow under the dog ----------
  // The key light only reaches the floor through the window, so across most
  // of the room the dog cast no shadow at all and read as hovering over the
  // boards — the player's own figure already had a contact patch, the animal
  // they are meant to be looking at did not. A soft ellipse under the body,
  // shaped by the pose (a sitting dog's weight is on its haunches, a lying
  // one presses its whole length into the floor), kept level in the room
  // rather than parented to the rolling, bobbing model.
  const dogShadow = new THREE.Group();
  const dogShadowDisc = makeContactShadow(1, IS_LOW_POWER ? 0.5 : 0.36);
  dogShadowDisc.position.set(0, 0, 0);
  dogShadow.add(dogShadowDisc);
  dogShadow.userData.noCollide = true;
  dogShadow.userData.noPick = true;
  dogShadow.userData.ssaoSkip = true;
  scene.add(dogShadow);
  const updateDogShadow = () => {
    const sit = (dogCtrl._sitAmt || 0) * (1 - (dogCtrl._layAmt || 0));
    const lie = dogCtrl._layAmt || 0;
    const H = dogHeight;
    // Half-extents: along the body, and across it.
    const halfLen = H * (0.50 - 0.16 * sit + 0.10 * lie);
    const halfWid = H * (0.20 + 0.03 * sit + 0.07 * lie);
    // A sitting dog's footprint slides back under its haunches.
    const back = H * 0.12 * sit;
    const yaw = dog.rotation.y;
    dogShadow.position.set(dog.position.x - Math.sin(yaw) * back, -1 + 0.004, dog.position.z - Math.cos(yaw) * back);
    dogShadow.rotation.y = yaw;
    dogShadowDisc.scale.set(halfWid, halfLen, 1);
    dogShadowDisc.material.opacity = (IS_LOW_POWER ? 0.5 : 0.36) * (1 + 0.35 * lie + 0.15 * sit);
    dogShadow.visible = !!dog.userData.ready;
  };
  // ---- Solid props the dog walks around (curated circle colliders) ----
  // Dense auto-collected furniture boxes made a maze the dog got stuck in.
  // Circles are predictable for AI navigation; the PLAYER still uses mount
  // boxes for sliding against real mesh AABBs. Bowl stays traversable.
  // Read from the props' OWN positions. These circles used to be written out by
  // hand, which quietly broke on every visit that mirrored the room: dressSide
  // flips the bed and the table to the opposite wall via dx(), and dz() jitters
  // their depth, so half the time the dog was steering around bare floor and
  // walking straight through the furniture that was actually there.
  const dogObstacles = [
    { x: potX,          z: potZ,          r: 0.42 },   // houseplant + pot
    { x: tblX,          z: tblZ,          r: 0.55 },   // treat side table
    { x: dogBed.position.x, z: dogBed.position.z, r: 0.72 },   // dog bed
  ];
  // The player's obstacle list (these + the dog's own circle), refilled per frame.
  const _obsList = [];
  const _obsDog = { x: 0, z: 0, r: 0.5, pushX: 0, pushZ: 1 };
  // Grounded locomotion + collision, scaled to the dog's size. strideSpeed is
  // the ground speed the Walk clip implies at timeScale 1 — the controller
  // matches the clip to actual speed so the paws plant (no skating).
  // strideSpeed = the Walk clip's natural ground speed at timeScale 1 (measured
  // ≈1.9 m/s per unit height); walkSpeed = a believable walk pace. The
  // controller plays the clip at walkSpeed/strideSpeed so the paws stay planted.
  dogCtrl.walkSpeed   = 0.85 + dogHeight * 0.55;
  dogCtrl.strideSpeed = 1.9 * dogHeight;
  // Gallop: ground metres one Gallop cycle covers at timeScale 1 (measured
  // ≈2.4 m per unit height for the Quaternius quadrupeds). The controller
  // divides by the clip duration to get the implied speed, then time-scales
  // to actual ground speed so the bounds plant.
  dogCtrl.gallopStride = 2.4 * dogHeight;
  dogCtrl.radius      = 0.26 + dogHeight * 0.22;
  dogCtrl.obstacles   = dogObstacles;
  dogCtrl.boxObstacles = null;   // dog AI uses circles only — see onStaticColliders
  // Keep the dog a body-radius clear of the plaster so it never clips a wall.
  dogCtrl.bounds      = { minX: ROOM.x0 + 0.55, maxX: ROOM.x1 - 0.55, minZ: -5.0, maxZ: 3.5 };
  // Match FPControls.bodyRadius so dog↔player separation agrees with the
  // player's own collider (otherwise one body can still clip the other).
  dogCtrl.playerRadius = 0.30;
  // Emotional body language baseline per rung: tail carriage, ear pose and
  // wag pattern all key off this (see DogController._bodyLife).
  dogCtrl.setMood(intensity === "barking" ? "excited"
                : intensity === "alert"   ? "alert" : "relaxed");
  // Temperament shows in the BODY, not just the timers: a sleepy dog walks a
  // touch slower and wags lazier; a bright-eyed one swings more and fidgets
  // on a shorter clock. Bounded like every other temperament multiplier.
  dogCtrl.walkSpeed *= 0.9 + temper.interest * 0.1 - (temper.id === "sleepy" ? 0.12 : 0);
  dogCtrl.energy = temper.interest;
  dogCtrl.restless = temper.restless;
  // Per-rung follow distance (trust shrinks it in setTrust below).
  dogCtrl.followRadius = B.followRadius ?? 1.5;
  // Paw strikes on the wood floor, from the controller's gait phases.
  // Bigger dog = heavier strikes.
  const footGain = 0.55 + dogHeight * 0.5;
  dogCtrl.onFootfall = (s) => {
    const A = window.PhobiaAudio;
    if (!A || !A.dogFootfall) return;
    try {
      A.dogFootfall(Math.min(1, (0.3 + 0.7 * s) * footGain),
        { x: dog.position.x, y: dog.position.y + 0.05, z: dog.position.z });
      // Tag-against-buckle tick on the stronger strides: the collar announces
      // a moving dog the way claws announce it on wood. Skipped at a shuffle
      // (s low) and randomly ~half the time so it never turns metronomic.
      if (dog.userData.parts.collar && s > 0.45 && Math.random() < 0.55 && A.collarJingle) {
        A.collarJingle(0.14 + 0.28 * s,
          { x: dog.position.x, y: dog.position.y + dogHeight * 0.6, z: dog.position.z });
      }
    } catch {}
  };
  // ---------------------------------------------------------------------------
  // CONTROLLED BARKING (rung 5): watching → warning → settling.
  // The dog stays in its home zone, never closes past PERSONAL_SPACE, and
  // escalates bark/posture from proximity + hard stare. Softening gaze or
  // stepping back visibly de-escalates — the coping loop exposure teaches.
  // No charge, rear, snap, camera jolt, or attack clip on this rung.
  const baseWalkSpeed = dogCtrl.walkSpeed;
  // The live Head bone of the loaded dog, cached once the model streams in.
  // Anything that has to stay attached to the muzzle — the fetched ball above
  // all — parents to this rather than to the static mouth anchor, so it
  // inherits the head's rotation as well as its position.
  function dogHeadBone() {
    const parts = dog.userData.parts;
    if (!parts || !parts.model) return null;
    if (parts._headBone === undefined) {
      parts._headBone = null;
      parts.model.traverse((o) => {
        if (!parts._headBone && o.isBone && o.name === "Head") parts._headBone = o;
      });
    }
    return parts._headBone;
  }

  const barkAnchor = { x: dog.position.x, z: dog.position.z };
  let barkState = "watching";    // watching | warning | settling
  let barkStateT = 0;            // seconds in the current sub-state
  let nextBarkAt = 2.8;          // scene-time of next bark burst
  let paceTargetT = 0;           // re-pick a pacing spot occasionally
  let warningBarkCount = 0;      // barks weathered this session (habituation)
  let pinnedTipShown = false;    // the body-language coaching line, once
  let softGazePraised = false;
  let retreatPraised = false;
  let lastGazeAlign = 0;         // written each frame from fear/gaze block
  // Rung 5 (the excited dog): energy, runs, warning cooldown, arrivals.
  let kExcite = 1, kRuns = 0, kLastRunAt = -99, kWarnCD = 0, kStareT = 0;
  if (intensity === "barking") nextBarkAt = 4.5;   // a beat to take the room in first
  let kClosing = 0, kGreetFor = 1.6, kArrive = null, kLay = false;
  let kSettleTold = false, warnResolvedTold = false, kBarkWatch = null, kPressT = 0;
  const kPrev = { x: 0, z: 0, t: 0 };
  // The "barking" intensity keeps the dog at distance — it doesn't follow.
  // For calm/alert rungs we DELAY the follow-the-player behaviour by ~6 s.
  // In those first seconds the dog is happily doing its own thing (sniffing,
  // looking around) — the user has to actually walk into the room and let
  // the dog notice them. After that grace window the dog begins its normal
  // approach behaviour.
  // Track dog scene's setTimeouts so we can clear them in dispose. Without
  // this, if the user leaves the scene in the first 6 s the timer fires
  // against a disposed dogCtrl (silent error, but a real leak).
  const dogTimers = [];
  let playInvited = false;
  if (intensity === "barking") {
    // Barking rung starts already "noticed" — the dog is facing you and
    // barking, so avoidance coaching and distance tips should fire.
    dogPlayerState.dogNoticedYou = true;
  }
  // Follow is a PER-RUNG behavior now, not a blanket 6-second timer. The old
  // setFollow(true)-for-everyone erased each rung's distance premise: "small
  // dog, far away" was glued to your knees within seconds. Rung 1 and 3 never
  // follow; rung 2 trails loosely (2.5 m); rung 4 closely (1.2 m).
  if (B.follow) {
    dogTimers.push(setTimeout(() => {
      try { dogCtrl.setFollow(true); } catch {}
    }, (B.followDelay ?? 6) * 1000));
  }
  if (intensity !== "barking" && B.startPose !== "lay") {
    // Kick off an immediate sniff so the dog reads as "busy with its own
    // thing" the moment the scene loads — at its bed if the bed is near its
    // spawn, otherwise at a spot a stride or two from where it stands.
    //
    // This used to walk to a hard-coded (2.0, −2.5): the bed's position in
    // the old, wider room, never mirrored or jittered with it. So on half of
    // all visits the dog crossed the room to sniff bare floor, it always
    // ended up on the +x side whatever spawn the visit had rolled, and the
    // spot was then written into homeAnchor — which moved rung 1's "small dog,
    // far away" about a metre closer than the rung is designed to put it.
    // The home stays the rung's spawn now.
    dogTimers.push(setTimeout(() => {
      try {
        const bx = dogBed.position.x, bz = dogBed.position.z;
        let tx, tz;
        if (Math.hypot(bx - homeAnchor.x, bz - homeAnchor.z) < 2.0) {
          const a = Math.random() * Math.PI * 2;
          tx = bx + Math.cos(a) * 0.9; tz = bz + Math.sin(a) * 0.9;
        } else {
          const a = Math.random() * Math.PI * 2, r = 0.5 + Math.random() * 0.4;
          tx = homeAnchor.x + Math.cos(a) * r; tz = homeAnchor.z + Math.sin(a) * r;
        }
        const settled = dogCtrl._resolve(tx, tz);
        dogCtrl.walkTo(settled.x, settled.z, { force: true });
        dogCtrl._initialSniff = true;
      } catch {}
    }, 400));
  }

  // Camera at human eye level. The eye sits at groundY+1.62 (the mount
  // contract overrides initialPos.y) — aim the initial pitch from there to
  // roughly the dog's back height so the dog is framed, not the floor.
  camera.fov = 52;
  camera.updateProjectionMatrix();
  const dogPitch = Math.atan2(-(1.62 - dogHeight * 0.8), distance);
  const minZ = -distance + 1.0;

  // ----- Trust meter (HUD) -----
  // Trust is PER-DOG-IDENTITY: bonding with Buddy the shiba must not carry
  // over to Koda the husky (the old shared float let a well-petted account
  // arrive at the climax rung with the dog pre-tamed — the fear ramp
  // inverted with playtime). Legacy global values migrate once: full trust
  // to the shiba you actually bonded with, capped at 0.3 for the husky.
  const charId = (window.Character?.loadCharacter()?.id) || "default";
  const legacyKey = "fobia.dogs.trust." + charId;
  const trustKey = legacyKey + "." + breed;
  try {
    if (localStorage.getItem(trustKey) == null && localStorage.getItem(legacyKey) != null) {
      const legacy = Math.max(0, Math.min(1, parseFloat(localStorage.getItem(legacyKey) || "0")));
      localStorage.setItem(legacyKey + ".shiba", String(legacy));
      localStorage.setItem(legacyKey + ".husky", String(Math.min(legacy, 0.3)));
      localStorage.removeItem(legacyKey);
    }
  } catch {}
  let trust = (() => {
    try { return Math.max(0, Math.min(1, parseFloat(localStorage.getItem(trustKey) || "0"))); }
    catch { return 0; }
  })();
  function setTrust(v) {
    trust = Math.max(0, Math.min(1, v));
    try { localStorage.setItem(trustKey, String(trust)); } catch {}
    refreshTrustHud();
    // Trust buys PROXIMITY PERMISSION, not a muted dog: the pet range and
    // the follow distance shrink; the stimuli stay honest.
    dogCtrl.minDistance = 0.9 - trust * 0.4;
    if (B.follow) {
      dogCtrl.followRadius = Math.max(dogCtrl.minDistance + 0.4, (B.followRadius ?? 1.5) - trust * 0.8);
    }
  }
  // Diminishing returns + a per-session cap keep trust a relationship, not a
  // farmable stat: each repeat of the same affordance earns less this
  // session, and no session moves the bond more than SESSION_TRUST_CAP.
  //
  // Touch has its own, stricter curve. A treat or a fetch costs a real
  // round trip of several seconds, so those keep a small floor; a click costs
  // nothing. With the old flat 0.005 floor for every kind, plus a passive drip
  // that rolled 2.5×/s while the pet pulse was up (and every click topped the
  // pulse back up), clicking the dog every 0.4 s reached the whole session cap
  // in 7.5 s (measured, rung 4 husky from 0). Touch now tapers to nothing,
  // stops at a sub-cap well under the session cap, and waits out a cooldown
  // that lengthens with each grant — so treats, fetch and time together still
  // matter more than a fast mouse.
  const SESSION_TRUST_CAP = 0.25;
  const TRUST_KINDS = {
    //            first grant  ×per repeat  floor   sub-cap    cooldown s (+ per grant, ≤6)
    pet:     { base: 0.05,  decay: 0.72, floor: 0,     cap: 0.10,     cool: 1.5, grow: 0.6 },
    passive: { base: 0.006, decay: 0.8,  floor: 0,     cap: 0.03,     cool: 2.5, grow: 0 },
    treat:   { base: 0.10,  decay: 0.65, floor: 0.005, cap: Infinity, cool: 0,   grow: 0 },
    fetch:   { base: 0.07,  decay: 0.8,  floor: 0.005, cap: Infinity, cool: 0,   grow: 0 },
  };
  const trustLedger = {};           // kind → { n, gained, lastT }
  let sessionTrustGain = 0, lastPetGrantT = -99, passiveContactT = 0;
  function bumpTrust(kind, reason) {
    const K = TRUST_KINDS[kind] || TRUST_KINDS.passive;
    const L = trustLedger[kind] || (trustLedger[kind] = { n: 0, gained: 0, lastT: -99 });
    const nowSec = performance.now() / 1000;
    const cool = Math.min(6, K.cool + K.grow * L.n);
    if (nowSec - L.lastT >= cool) {
      let delta = Math.max(K.floor, K.base * Math.pow(K.decay, L.n));
      delta = Math.min(delta, Math.max(0, K.cap - L.gained), Math.max(0, SESSION_TRUST_CAP - sessionTrustGain));
      L.n++; L.lastT = nowSec;
      if (delta > 1e-4) { L.gained += delta; sessionTrustGain += delta; setTrust(trust + delta); }
    }
    popHeart();                       // affection feedback even when capped
    // (The reason — "Good fetch." — used to follow as a caption on every
    // throw and treat. The heart says it; the caption was an echo.)
  }

  // ---- The coach: the alarm, this trial's card, reading the dog ----
  // Replaces the old trust card (a name, a % bar that sat at 0 for a whole
  // first session, "seems sleepy today") and the fear-weighted hold credit.
  // See makeDogCoach. The dog's name and your bond live in the card's footer;
  // the alarm and what this trial asks lead it.
  const COACH_RUNGS = [
    // sizeMul: how hard this dog hits at arm's length · tau: seconds for the
    // alarm to lose ~63 % of its excess while you stay · hFloor: how quiet a
    // fully habituated alarm gets on this rung.
    { sizeMul: 0.52, tau: 11, hFloor: 0.30 },
    { sizeMul: 0.60, tau: 12, hFloor: 0.32 },
    { sizeMul: 0.72, tau: 14, hFloor: 0.34 },
    { sizeMul: 0.82, tau: 16, hFloor: 0.36 },
    { sizeMul: 0.92, tau: 18, hFloor: 0.38 },
  ];
  const coachRung = COACH_RUNGS[Math.max(0, Math.min(4, levelIdx || 0))];
  const zoneM = B.inZoneDist ?? 3.0;
  const zoneTxt = zoneM.toFixed(1).replace(/\.0$/, "");
  // The skill star is something to DO with this rung's dog, using the
  // hotbar's verbs — each one a step toward it, never away: share a treat
  // from where you stand, then from your hand; call the bigger dog over and
  // stay while it comes; throw the ball and stay while it runs back at you.
  // (Rung 5 has no hotbar — your feet are the lever there.)
  const skillGoal = [
    { id: "treatNear", icon: "🦴", verb: "treat", text: window.tf("dc.gTreatNear", "Toss {dog} a treat — stay within {m} m while it's eaten", { m: zoneTxt, dog: dogName }) },
    { id: "handFed",   icon: "🦴", verb: "treat", text: window.tf("dc.gHandFed", "Let {dog} take a treat from your hand", { dog: dogName }) },
    { id: "callStay",  icon: "👋", verb: "call",  text: window.tf("dc.gCallStay", "Call {dog} over — stay put while {dog} comes", { dog: dogName }) },
    { id: "fetchStay", icon: "⚪", verb: "ball",  text: window.tf("dc.gFetchStay", "Throw the ball — stay put while {dog} runs it back", { dog: dogName }) },
    { id: "runHeld",   icon: "»", text: window.tf("dc.gRun", "Hold your ground when {dog} bounds over", { dog: dogName }) },
  ][Math.max(0, Math.min(4, levelIdx || 0))];
  // Where you stood when you called, and when the ball came back: "stay put"
  // means you were still there when the dog arrived.
  const callFrom = { x: 0, z: 0, d: 0 }, fetchFrom = { x: 0, z: 0 };
  function armCallStay() {
    const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
    callFrom.x = pp.x; callFrom.z = pp.z; callFrom.d = lastPlayerDist;
  }
  // A treat eaten — thrown or from your hand — is the rung-1 and rung-2 star.
  function treatEaten(fromHand) {
    if (levelIdx === 0 && lastPlayerDist < zoneM + 0.4) coach.goalDone("treatNear");
    if (levelIdx === 1 && fromHand) coach.goalDone("handFed");
    if (fromHand) coach.note("handFed");
    try { window.PhobiaExperiments && window.PhobiaExperiments.signal(fromHand ? "dog.handFed" : "dog.ate"); } catch {}
  }
  let lastPlayerDist = 99;
  const coachPrev = { dx: 0, dz: 0, px: 0, pz: 0, t: 0 };
  const coachSubj = { x: 0, z: 0 };
  const _coachV = new THREE.Vector3();
  let coachToward = 0, coachPlayerSpeed = 0, coachOnScreen = false;
  let petIntentT = 0;          // seconds of "the player chose contact" left
  let lifeNextAt = 0;          // idle-life director clock (scene time)
  let lastCmdAt = -99;         // scene time of the player's last command
  // Body language the player can read. Anything the player just ASKED for
  // (a commanded sit) isn't a signal to decode, so commands mute it briefly.
  function coachSignal(id) {
    if (sceneNow - lastCmdAt < 1.5) return false;
    if (document.querySelector(".tour-overlay:not(.dismiss), .countdown")) return false;
    return coach.signal(id, { onScreen: coachOnScreen, dist: lastPlayerDist });
  }
  const coach = makeDogCoach({
    stage: document.getElementById("stage"),
    levelIdx, intensity, dogName, inZoneDist: zoneM,
    sizeMul: coachRung.sizeMul, tau: coachRung.tau, hFloor: coachRung.hFloor,
    minHold: level.minHold || 12,
    coarse: IS_COARSE_POINTER,
    expect: (() => { const e = window.__pendingExpect; return (e && e.phobia === "dogs" && e.level === levelIdx) ? e : null; })(),
    goals: [
      skillGoal,
      { id: "read", icon: "👁", need: levelIdx < 2 ? 2 : 3,
        text: window.tf("dc.gRead", "Read {dog}'s body language", { dog: dogName }) },
      { id: "settle", icon: "〰", required: true,
        text: window.t("dc.gSettle", "Stay until your alarm settles") },
    ],
  });
  window.__dogCoach = coach;   // verification handle (scene-scoped, cleared on dispose)
  window.__coach = coach;
  // The alarm is the coach's now: PhobiaFear keeps the smoothing, peak,
  // grounding and listeners (vignette, grade, haptics); stray pulses from
  // anywhere in the scene land on the coach so they habituate too.
  if (window.PhobiaFear && window.PhobiaFear.setDirect) {
    window.PhobiaFear.setDirect(() => coach.target(), (s) => coach.pulse(s, "event", lastPlayerDist));
  }
  window.__holdPolicy = coach.holdPolicy;
  function refreshTrustHud() { try { coach.setTrust(trust); } catch {} }
  refreshTrustHud();
  // The hold-completion fanfare waits for a safe beat: never mid-burst on
  // the barking rung.
  window.__holdCelebrationGate = () =>
    intensity !== "barking" || barkState === "watching" || barkState === "settling";

  // ----- Click-on-floor / click-on-dog mouse interaction -----
  // The whole point: prefer the world over buttons. The renderer hands clicks
  // to `onClick` (already wired via setupPhobiaScene), but it has no concept
  // of "click on the floor at world position X". So we ALSO add our own
  // raycaster on the renderer's canvas to read where the click landed.
  const raycaster = new THREE.Raycaster();
  const mouseVec = new THREE.Vector2();
  function pickWorld(clientX, clientY, dom) {
    // Under pointer lock the OS cursor is captured — clicks aim at the
    // screen-centre crosshair, not the frozen client coordinates.
    const locked = !!(dogsControls && dogsControls.isPointerLocked && dogsControls.isPointerLocked());
    if (locked) {
      mouseVec.set(0, 0);
    } else {
      const rect = dom.getBoundingClientRect();
      mouseVec.x = ((clientX - rect.left) / rect.width)  * 2 - 1;
      mouseVec.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }
    raycaster.setFromCamera(mouseVec, camera);
    // Points raycast with the default 1 m threshold means the dust motes in
    // the sunbeam swallow clicks across half the room; sprites (hearts) and
    // the transparent effect meshes (beam, glass, backdrop, goal ring) also
    // sit between the player and the floor. Only solid, pickable meshes may
    // answer a click — otherwise pets misfire and throws land at phantom
    // mid-air points.
    raycaster.params.Points = { threshold: 0.001 };
    const hits = raycaster.intersectObject(scene, true);
    // noPick is honoured up the parent chain so one flag on a root (the TP
    // avatar's body group, the held item) covers all its meshes.
    const pickable = (o) => {
      for (let p = o; p; p = p.parent) if (p.userData && p.userData.noPick) return false;
      return true;
    };
    return hits.find(h => h.object.isMesh && !h.object.isSprite && pickable(h.object)) || null;
  }
  // Track if the user dragged (to look around) — only treat as a click if
  // the down/up happened within 6 px and within 250 ms.
  let downX = 0, downY = 0, downT = 0, downPointerId = -1;
  let canvasDom = null;
  function bindCanvasClicks() {
    if (canvasDom) return;
    canvasDom = document.querySelector("#stage canvas");
    if (!canvasDom) return;
    canvasDom.addEventListener("pointerdown", (e) => {
      downX = e.clientX; downY = e.clientY; downT = performance.now();
      downPointerId = e.pointerId;
    });
    canvasDom.addEventListener("pointerup", (e) => {
      if (e.pointerId !== downPointerId) return;
      // Swallow the click that acquired pointer lock.
      if (dogsControls && dogsControls.wasJustLocked && dogsControls.wasJustLocked()) return;
      // A tap that picked up or threw a physics prop (mount's grab handler
      // runs first on the same event) is not also a pet / call / fetch.
      if (window.PhobiaGrab && (PhobiaGrab.holding() || (PhobiaGrab.consumedRecently && PhobiaGrab.consumedRecently()))) return;
      const dx = e.clientX - downX, dy = e.clientY - downY;
      const dt2 = performance.now() - downT;
      // Touch gets the same forgiveness mount() gives taps everywhere else:
      // a fingertip wobbles 8–15 px and a nervous, deliberate tap is slow,
      // and this listener's mouse-sized 6 px / 350 ms quietly turned the
      // pet-the-dog tap — on the phone build, the whole point — into a look.
      const touch = e.pointerType === "touch" || IS_COARSE_POINTER;
      if (Math.hypot(dx, dy) > (touch ? 16 : 6) || dt2 > (touch ? 600 : 350)) return;   // drag, not click
      // Under lock the client coordinates are frozen — aim at canvas centre
      // so the silhouette-forgiveness math agrees with the crosshair ray.
      const locked = !!(dogsControls && dogsControls.isPointerLocked && dogsControls.isPointerLocked());
      const rect = canvasDom.getBoundingClientRect();
      const px = locked ? rect.left + rect.width / 2 : e.clientX;
      const py = locked ? rect.top + rect.height / 2 : e.clientY;
      const hit = pickWorld(px, py, canvasDom);
      // Always hand off (even on a null hit) so a near-miss next to the dog's
      // silhouette can still count as a pet rather than being silently dropped.
      handleWorldClick(hit, e.shiftKey || e.metaKey, px, py, canvasDom);
    });
  }
  // Registered like every other scene timer: leaving within the 60 ms let this
  // fire after dispose and bind the dog's click handlers to the NEXT scene's
  // canvas (the query is just "#stage canvas").
  dogTimers.push(setTimeout(() => { if (!dog.userData.disposed) bindCanvasClicks(); }, 60));

  // Screen-space distance from a click to the dog's on-screen silhouette, plus
  // the dog's apparent pixel radius. Lets a near-miss count as a pet — the dog
  // is small, far, and moving, so demanding a pixel-perfect raycast hit is a
  // cruel bar at the exact moment the user is being brave.
  function clickVsDog(clientX, clientY, dom) {
    if (!dog.userData.ready) return null;
    const rect = dom.getBoundingClientRect();
    const dogH = (dog.userData.parts && dog.userData.parts.height) || 0.6;
    const c = new THREE.Vector3(dog.position.x, dog.position.y + dogH * 0.55, dog.position.z).project(camera);
    const top = new THREE.Vector3(dog.position.x, dog.position.y + dogH * 1.05, dog.position.z).project(camera);
    if (c.z > 1) return { behind: true };          // dog is behind the camera
    const sx = rect.left + (c.x * 0.5 + 0.5) * rect.width;
    const sy = rect.top + (-c.y * 0.5 + 0.5) * rect.height;
    const ty = rect.top + (-top.y * 0.5 + 0.5) * rect.height;
    // Forgiveness scales with the dog's on-screen size plus a small fixed
    // slop for cursor error. A hard 26 px floor used to swallow clicks a
    // metre beside a distant dog — turning "throw the ball near the dog"
    // into an unwanted "come here" call.
    const apparentR = Math.abs(sy - ty) * 1.05 + 10;
    return { behind: false, dist: Math.hypot(clientX - sx, clientY - sy), r: apparentR };
  }

  function handleWorldClick(hit, alt, clientX, clientY, dom) {
    // Rung 5: nothing to throw or call — but once Koda has tired out and
    // settled, you may pet him (only ever by choice).
    if (intensity === "barking" && barkState !== "settling") return;
    // Did we click on the dog (or any of its parts)?
    let p = hit && hit.object;
    let hitDog = false;
    while (p) {
      if (p === dog) { hitDog = true; break; }
      p = p.parent;
    }
    // Forgiveness: if the exact raycast missed, accept a click that landed
    // within the dog's on-screen silhouette anyway.
    if (!hitDog && dom != null && clientX != null) {
      const cd = clickVsDog(clientX, clientY, dom);
      if (cd && !cd.behind && cd.dist <= cd.r) hitDog = true;
    }
    // Settled Koda: a click can pet or invite him in — nothing else. Floor
    // throws and far calls would send the big dog galloping at you again.
    if (intensity === "barking") {
      if (!hitDog) return;
      const pp0 = (storedActiveControls && storedActiveControls.position) || camera.position;
      if (playerDogSurfaceDist(pp0) > PET_INVITE_SURFACE) return;
    }
    if (hitDog) {
      // Grip feedback only for clicks that DO something — a pulse on a dead
      // click promised an action that never happened.
      if (window.PhobiaFX && window.PhobiaFX.firePulse) window.PhobiaFX.firePulse();
      // A click on the dog is the player choosing contact — the only thing
      // that lets the avatar crouch and reach (see the posture block).
      petIntentT = 6;
      // Petting is physical: an invite just outside arm's reach asks the dog
      // to close the gap, while a real pet starts only after its body is in
      // contact range. This keeps the user, hand animation and trust reward
      // in one coherent spatial relationship.
      // Measure from the PLAYER, not the camera — in third-person the camera
      // orbits ~4 m behind the avatar, which inflated dogDist so the pet branch
      // never fired (the dog got "Come here"-called instead of petted).
      const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
      const surf = playerDogSurfaceDist(pp);
      const dx = pp.x - dog.position.x, dz = pp.z - dog.position.z;
      const dogDist = Math.hypot(dx, dz) || 1;
      if (surf <= PET_CONTACT_SURFACE) {
        completePet();
      } else if (surf <= PET_INVITE_SURFACE) {
        petRequestT = 4.5;
        arcApproachTgt = null;   // the pet invite reroutes any pending curve
        if (dogCtrl.mood !== "aggressive") {
          const pr = dogCtrl.playerRadius || 0.30;
          const stopAt = PET_CONTACT_SURFACE * 0.85 + pr + (dogCtrl.radius || 0.35);
          const k = Math.max(0, (dogDist - stopAt) / dogDist);
          dogCtrl.walkTo(dog.position.x + dx * k, dog.position.z + dz * k);
        }
        if (window.PhobiaFX && window.PhobiaFX.contextPrompt) {
          window.PhobiaFX.contextPrompt(window.tf("sc.d.stepping", "{dog} is stepping close. Keep your hand low.", { dog: dogName }), 2200);
        }
      } else {
        // Call the dog over — and CONFIRM it visibly, since the voice may be
        // muted and a far click otherwise feels like it did nothing. It is a
        // call like C is: the "Call him over" experiment hears it too.
        lastCmdAt = sceneNow;
        try { window.PhobiaExperiments && window.PhobiaExperiments.signal("dog.call"); } catch {}
        armCallStay();
        walkToPlayer(0.55, { arc: true });
        callGreetPending = true; callGreetDeadline = 0;
        if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.d.come", "Come here."), { speaker: "you" });
        if (window.PhobiaFX && window.PhobiaFX.contextPrompt) {
          window.PhobiaFX.contextPrompt(window.tf("sc.d.comingYou", "{dog} is coming to you…", { dog: dogName }), 2500);
        }
      }
      return;
    }
    // Otherwise: throw an item — but ONLY on a clear hit on the floor/world, so
    // a near-miss beside the dog never becomes the emotional opposite (a fetch)
    // at the bravest moment. A click into empty space does nothing.
    if (!hit || !hit.point) return;
    if (window.PhobiaFX && window.PhobiaFX.firePulse) window.PhobiaFX.firePulse();
    const tx = hit.point.x, tz = hit.point.z;
    const kind = alt ? "treat" : "ball";
    throwItem(kind, tx, tz);
    fetchPhase = "flying";
    // Literal speak() calls so the voice pre-render extractor sees these
    // lines — a ternary argument fell back to browser TTS mid-scene.
    if (window.PhobiaVoice) {
      if (kind === "treat") window.PhobiaVoice.speak(window.t("sc.d.treat", "Treat."), { speaker: "you" });
      else window.PhobiaVoice.speak(window.t("sc.d.fetch", "Go fetch."), { speaker: "you" });
    }
  }

  // Wire up command bar buttons as a fallback. Most users will prefer to
  // click directly in the scene, but the buttons remain so touch users
  // and screen-reader users have a known affordance too.
  function wireCommandBar() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="dogs"]');
    if (!bar) return;
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      // The barking rung disables bonding commands (pet/throw/call) —
      // show that honestly and leave distance as the primary lever.
      // A collapsed tips bar still teaches the coping loop.
      if (intensity === "barking") {
        btn.disabled = true;
        btn.title = window.t("sc.d.notNow", "Not now — the dog is barking. Soften your gaze and step back for space.");
        return;
      }
      btn.disabled = false;
      btn.onclick = (e) => {
        e.stopPropagation();
        const cmd = btn.dataset.cmd;
        commandDog(cmd);
      };
    });
  }
  // Same for the command bar: a dogs → dogs rung switch inside one task
  // would otherwise wire the new rung's buttons to this disposed scene.
  dogTimers.push(setTimeout(() => { if (!dog.userData.disposed) wireCommandBar(); }, 0));

  // ----- Keyboard shortcuts -----
  // Single-letter keys for the four commands (ignored when typing in inputs).
  // Lets desktop users use the mouse for the world + keyboard for commands.
  function onKey(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    // Browser shortcuts are not dog commands: Cmd/Ctrl+C (copy) was calling
    // the dog over, Ctrl+T/B/E likewise.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // Ignore auto-repeat: holding a key (especially to RETREAT) must never
    // machine-gun a command + its voice line ("Easy, Buddy. Easy, Buddy…").
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    // 's' is reserved by FPControls for walk-BACKWARD. Stepping back is the
    // single most important instinct for a frightened person, so 'settle'
    // lives on 'e' — it can never fight a retreat.
    if (k === "e") commandDog("sit");
    else if (k === "t") commandDog("treat");
    else if (k === "b") commandDog("ball");
    else if (k === "c") commandDog("call");
    else if (k === "l") commandDog("lay");
  }
  window.addEventListener("keydown", onKey);

  function commandDog(cmd) {
    if (intensity === "barking" && cmd !== "stand") return;
    lastCmdAt = sceneNow;
    // Experiments listen for command use ("call him over" arms on this).
    try { window.PhobiaExperiments && window.PhobiaExperiments.signal("dog." + cmd); } catch {}
    switch (cmd) {
      case "sit":
        dogCtrl.sit();
        if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.d.settle", "Easy now. Settle."), { speaker: "you" });
        break;
      case "stand":
        dogCtrl.stand();
        break;
      case "lay":
        // Highest "settled" pose. Speakable cue varies on trust.
        dogCtrl.lay();
        if (window.PhobiaVoice) {
          window.PhobiaVoice.speak(trust > 0.7
            ? `Settle, ${dogName}. Good dog.`
            : `Lay down, ${dogName}.`, { speaker: "you" });
        }
        break;
      case "treat":
      case "ball": {
        // A treat with the dog already near isn't thrown: you hold it out,
        // low, and the dog comes in and takes it from your hand.
        if (cmd === "treat" && canOfferTreat()) {
          offerTreat();
          if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.d.treat", "Treat."), { speaker: "you" });
          break;
        }
        // Tossed straight ahead a comfortable distance
        const yaw = (storedActiveControls && storedActiveControls.yaw) || 0;
        const ahead = 2.5 + (cmd === "ball" ? 0.5 : 0);
        const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
        const tx = pp.x - Math.sin(yaw) * ahead;
        const tz = pp.z - Math.cos(yaw) * ahead;
        throwItem(cmd === "treat" ? "treat" : "ball", tx, tz);
        fetchPhase = "flying";
        if (window.PhobiaVoice) {
          if (cmd === "treat") window.PhobiaVoice.speak(window.t("sc.d.treat", "Treat."), { speaker: "you" });
          else window.PhobiaVoice.speak(window.t("sc.d.fetch", "Go fetch."), { speaker: "you" });
        }
        break;
      }
      case "call": {
        // Calls the dog to you by name. A resting dog ANSWERS first — the
        // head-cock "hm?" tilt — and only then commits to the trot; a dog
        // already on its feet just comes. The walk itself approaches along
        // the dog→player vector so it stops in front of you from any angle.
        armCallStay();
        // The lying dog of the alert rung gets up because you called it — the
        // rise is the moment, so it lands now rather than mid-walk later.
        if (B.startPose === "lay" && startPoseApplied && !esc.stood) {
          esc.stood = true; esc.stoodAt = sceneNow;
          dogCtrl.aggression = 0.25;
          coach.pulse(0.30, "stand", lastPlayerDist);
        }
        if (dogCtrl.headCock(0.85)) {
          callWalkAt = sceneNow + 0.7;
        } else {
          walkToPlayer(0.65, { arc: true });
          callGreetPending = true; callGreetDeadline = 0;
        }
        if (window.PhobiaVoice) window.PhobiaVoice.speak(window.t("sc.d.come", "Come here."), { speaker: "you" });
        break;
      }
      case "bark":
        if (window.PhobiaAudio && window.PhobiaAudio.dogVocal) {
          window.PhobiaAudio.dogVocal("bark", 0.85,
            { x: dog.position.x, y: dog.position.y + 0.7, z: dog.position.z },
            { f0: dogF0, count: 1, reverb: 0.22 });
        } else if (window.PhobiaAudio) {
          window.PhobiaAudio.bark(0.85);
        }
        // Same frame as the audio — the fixed 250 ms delay made the toss
        // visibly lag the sound.
        dogCtrl.barkSmall();
        break;
    }
  }

  // Initialize trust-driven tuning (state already declared at top of fn)
  dogCtrl.minDistance = 0.9 - trust * 0.4;

  return {
    controls: {
      mode: "walkable",
      // Spawn the user at the ROOM ENTRANCE, well back from the dog. The
      // first thing they see (in third-person) is their character standing
      // by the doorway with the dog already busy doing its own thing across
      // the room. They CHOOSE to approach. This is the single biggest
      // realism upgrade for the dog scene: a fear sim should let the user
      // close the distance themselves, not start them already-petting-it.
      // y is overridden by the groundY+1.62 mount contract; kept correct
      // here to avoid the stale-eye-constant confusion recurring.
      initialPos: [0, 0.62, 4.0],
      // A portrait phone sees ~30° across, and the dog starts up to 1.9 m
      // to one side — so phone players opened on an empty corner and had
      // to hunt for the animal the whole trial is about. Turn toward it
      // there; a landscape screen keeps the straight-in opening shot.
      initialYaw: (typeof innerWidth === "number" && innerWidth < innerHeight)
        ? Math.atan2(0 - dogStartX, 4.0 - dogStartZ) : 0,
      initialPitch: dogPitch * 0.5,    // gentler tilt — looking ahead, not down
      // The barking rung opens the back corridor: retreat must be a real,
      // physical option so the user can always increase distance.
      bounds: { minX: ROOM.x0 + 0.4, maxX: ROOM.x1 - 0.4, minZ: minZ, maxZ: intensity === "barking" ? 4.9 : 4.5 },
      speed: 1.45,
      lookSpeed: 0.0035,
      // Embodiment upgrades (all opt-in, desktop pointer lock is mouse-only):
      // click-to-capture FPS look, 10 Hz look smoothing, and fear-modulated
      // gait — approach slows/hesitates/trembles at high fear, retreat never.
      pointerLock: true,
      lookSmoothing: 10,
      fearGait: true,
      // Calm/alert rungs open over the shoulder so the customised character is
      // visibly the protagonist. Barking stays first-person for direct,
      // uncluttered distance work.
      preferredCameraMode: intensity === "barking" ? "fp" : "tp",
      // Bias the camera over the shoulder so the avatar does not mask the dog.
      tpShoulder: 0.62,
      tpDistance: 3.9,
      tpHeight: 0.42,
      // The opening shot looks in through the see-through front wall; after
      // it, the camera stays inside the room (see FPControls tpContain).
      tpContain: {
        minX: ROOM.x0 + 0.3, maxX: ROOM.x1 - 0.3,
        minZ: ROOM.z0 + 0.3, maxZ: ROOM.z1 - 0.3,
        maxY: ROOM.ceilY - 0.25, after: 2.5,
      },
    },
    // Walls/ceiling the third-person camera shouldn't clip through. The
    // FRONT wall is deliberately absent: it's single-sided so the TP intro
    // dolly can see into the room from outside.
    collisionObjects: [backWallGroup, leftWall, rightWall, ceiling],
    // Player keeps mount-time furniture boxes. Dog AI deliberately does NOT
    // use them — dense mesh AABBs made an unnavigable maze. Circles above
    // are the dog's navigation map.
    onStaticColliders(boxes) {
      /* player-only; dogCtrl.boxObstacles stays null */
    },
    // (No NPC — the user's own character is the only character in the scene.)
    // Gentle bloom + a high threshold so only the window/sunbeam glow, not the
    // whole sunlit wall.
    bloom: { strength: 0.22, threshold: 0.96 },
    // In-render fear grade (desat/vignette/crush ShaderPass) + a tight far
    // plane for better depth precision in an 11 m room.
    fearGradePass: true,
    cameraFar: 60,
    hands: { skinColor: 0xd4a07a, sleeveColor: 0x3a3d4f },
    surface: "wood",
    groundY: -1,       // room floor — feet + eye line anchored to it
    interact(controls, hands, t) {
      if (!controls) return null;
      const surf = playerDogSurfaceDist(controls.position);
      const dist = Math.hypot(controls.position.x - dog.position.x, controls.position.z - dog.position.z);
      if (intensity === "barking" && barkState !== "settling") {
        // The excited dog: nothing to do with your hands. The coach card
        // carries what this rung asks; the hint stays quiet.
        if (hands) hands.clearReachTarget();
        return { gesture: "rest", hint: "" };
      }
      // A treat held out: the open palm, low, toward the dog — still.
      if (item && item.state === "offer") {
        if (hands && hands.setReachTarget) {
          const ox = dog.position.x - controls.position.x, oz = dog.position.z - controls.position.z;
          const ol = Math.hypot(ox, oz) || 1;
          const dogH = (dog.userData.parts && dog.userData.parts.height) || 0.6;
          // Low, at the dog's muzzle — measured from YOUR eye (controls.y),
          // never the camera: in third person that floats above your head.
          _petPt.set(controls.position.x + ox / ol * 0.42,
            Math.max(controls.position.y - 1.05, dog.position.y + dogH * 0.62),
            controls.position.z + oz / ol * 0.42);
          _petN.set(0, 1, 0);
          hands.setReachTarget(_petPt, { hand: "right", grip: "flat", normal: _petN, maxReach: 0.8 });
        }
        return { gesture: "touch", hint: window.tf("dc.hintOffer", "Hold it out and stay still — let {dog} come and take it", { dog: dogName }) };
      }
      // Mid-windup the throw rides IN the hand — wrap the fingers around the
      // item instead of leaving them open beside a floating ball. Both the
      // FP hands and the TP body read this gesture (curl + grip pose).
      if (item && item.state === "windup") {
        // FP: the right hand is already on the item (tickWindup's reach);
        // "grab" would also raise the left hand onto an imaginary bar.
        return { gesture: (dogsControls && dogsControls.cameraMode === "tp") ? "grab" : "rest", hint: "" };
      }
      // Within reach, drive the ACTUAL right hand onto a live bone on the dog
      // (Back / Torso / Head) so petting tracks the posed body — not a fixed
      // height guess that drifts off the coat when the dog sits, coils, or
      // leans into the stroke.
      const wantsContact = petIntentT > 0 || petPulse > 0.05 || petRequestT > 0;
      if (hands && surf <= PET_CONTACT_SURFACE && dog.userData.ready && wantsContact) {
        const parts = dog.userData.parts;
        const dogH = (parts && parts.height) || 0.6;
        const dx = controls.position.x - dog.position.x;
        const dz = controls.position.z - dog.position.z;
        const inv = 1 / (dist || 1);
        const tpx = dx * inv, tpz = dz * inv;          // unit vector dog → player
        // Candidate contact bones, withers first and then forward along the
        // spine to the neck and head. Collected once; CHOSEN every frame.
        if (parts._petBones === undefined && parts.model) {
          const prefer = ["Back", "Torso3", "Torso2", "Torso", "Neck1", "Neck2", "Head"];
          const found = {};
          parts.model.traverse(o => { if (o.isBone && prefer.includes(o.name)) found[o.name] = o; });
          parts._petBones = prefer.map(n => found[n]).filter(Boolean);
          parts._petBone = parts._petBones[0] || null;
        }
        // Which part of this dog can the arm actually get to? A lying dog puts
        // its back about 10 cm off the floor — measured, the player's shoulder
        // ends up 0.72 m from it against a 0.52 m arm, so the hand hangs in the
        // air beside the animal no matter how deep the crouch goes. A person
        // petting a dog lying down reaches its neck and head instead, which sit
        // 20 cm higher. So the target is picked by reachability each frame,
        // with a standing preference for the withers.
        const bone = (() => {
          const list = parts._petBones;
          if (!list || !list.length) return parts._petBone;
          const shY = controls.position.y - 0.34;         // eye → shoulder
          const ARM = 0.52;
          let best = list[0], bestCost = Infinity;
          for (let i = 0; i < list.length; i++) {
            list[i].getWorldPosition(_petProbe);
            const need = Math.hypot(
              Math.hypot(_petProbe.x - controls.position.x, _petProbe.z - controls.position.z),
              shY - _petProbe.y);
            // Shortfall dominates; the small index term keeps the withers the
            // default whenever two candidates are equally reachable.
            const cost = Math.max(0, need - ARM) + i * 0.012;
            if (cost < bestCost) { bestCost = cost; best = list[i]; }
          }
          parts._petBone = best;
          return best;
        })();
        if (bone) {
          bone.getWorldPosition(_petPt);
          // Stroke along the spine while actively petting: nudge toward the
          // player (neck) then back over the withers.
          const stroke = petPulse > 0.05 ? Math.sin((t || 0) * 3) * dogH * 0.10 * petPulse : 0;
          // Toward the NEAR flank, not the spine's centre line: the contact
          // bone sits mid-body, and reaching across a whole dog is a metre of
          // arm nobody has.
          const flank = Math.max(dogH * 0.08, ((parts && parts.span) || dogH) * 0.34);
          _petPt.x += tpx * (flank - stroke);
          _petPt.y += dogH * 0.04;   // land on the coat, not inside the mesh
          _petPt.z += tpz * (flank - stroke);
        } else {
          const stroke = petPulse > 0.05 ? Math.sin((t || 0) * 3) * dogH * 0.12 * petPulse : 0;
          const nearNudge = dogH * 0.42 - stroke;
          _petPt.set(
            dog.position.x + tpx * nearNudge,
            dog.position.y + dogH * (0.74 - petPulse * 0.05),
            dog.position.z + tpz * nearNudge
          );
        }
        _petN.set(tpx * 0.4, 1, tpz * 0.4).normalize();
        // During the first-contact sniff, aim the hand as a closed fist at
        // muzzle height so the dog can investigate before a full pet.
        if (sniffGreetT > 0 && !dogPlayerState.petted) {
          const muzzleY = dog.position.y + dogH * 0.62;
          _petPt.y = muzzleY;
          _petPt.x = dog.position.x + tpx * dogH * 0.55;
          _petPt.z = dog.position.z + tpz * dogH * 0.55;
          hands.setReachTarget(_petPt, { hand: "right", grip: "wrap", curl: 1.1, normal: _petN, maxReach: 0.92 });
        } else {
          hands.setReachTarget(_petPt, { hand: "right", grip: "flat", normal: _petN, maxReach: 0.92 });
        }
      } else if (hands) {
        hands.clearReachTarget();
      }
      // Character-driven hints: change as the player closes the distance.
      // No "click button" instructions — the player figures out the world
      // interactions by being close enough that a click on the dog or floor
      // makes sense.
      // (No `target` here: this scene has its own goal ring around the dog —
      // a second mount-level reach ring on top read as visual noise.)
      // Contact is always an offer, never an instruction: the hint names the
      // option and that it is optional. Touch devices say tap.
      const clickW = IS_COARSE_POINTER ? window.t("dc.tap", "tap") : window.t("dc.click", "click");
      if (sniffGreetT > 0 && !dogPlayerState.petted) {
        return { gesture: wantsContact ? "touch" : "rest",
          hint: window.tf("dc.hintSniff", "{dog} is sniffing hello — that's how dogs meet. Stay still, or {click} it to offer your hand.", { dog: dogName, click: clickW }) };
      }
      if (surf < PET_CONTACT_SURFACE) {
        return { gesture: wantsContact ? "pet" : "rest",
          hint: window.tf("dc.hintPet", "{dog} is right beside you · {click} to pet — only if you want to", { dog: dogName, click: clickW }) };
      }
      if (surf < PET_INVITE_SURFACE) {
        return { gesture: "rest",
          hint: window.tf("dc.hintInvite", "{click} {dog} to invite it closer — or just stay", { dog: dogName, click: clickW }) };
      }
      return { gesture: "rest", hint: "" };
    },
    // The renderer calls onClick(controls) for the *generic* click handler,
    // but our richer pickWorld() is bound directly to the canvas above. Keep
    // this as a no-op so we don't double-fire pet feedback.
    onClick(controls) {},
    update(t, controls, dt) {
      if (controls) { dogsControls = controls; storedActiveControls = controls; }
      const d = dt || 0.016;
      sceneNow = t;
      // Deferred come-here: the head-cock answers the call first ("hm?"),
      // THEN the dog commits to the walk — voice → tilt → trot, in that order.
      if (callWalkAt && t >= callWalkAt) {
        callWalkAt = 0;
        walkToPlayer(0.65, { arc: true });
        callGreetPending = true; callGreetDeadline = 0;
      }
      petPulse = Math.max(0, petPulse - d);
      // Drive the dog's lean-into-pet from the petPulse so the dog actually
      // reacts to contact instead of just absorbing clicks silently.
      dogCtrl.petAmount = petPulse;
      dogCtrl.happy = trust;            // resting tail-wag baseline scales with trust
      // The dog reacts to the PLAYER'S body, not the camera — in third person
      // the camera floats metres behind the avatar, and follow/watch angles
      // computed against it were visibly wrong (dog staring past you).
      dogCtrl.playerPos = controls ? controls.position : null;
      // Sit-for-pet: sustained contact + some trust → dog sits so the hand
      // can reach chest/neck. Classic reciprocal bonding body language.
      dogCtrl.sitForPet = (intensity !== "barking"
        && dogCtrl.mood !== "aggressive"
        && petPulse > 0.15
        && trust > 0.12) ? 1 : 0;
      // ---- Offered hand → the dog closes the last step ----
      // The player standing quietly inside the invite band IS the offer. It is
      // also the only intent signal available: the reach target itself is only
      // set once they are already in contact range, so keying off that would be
      // circular. Barking rungs and an aggressive mood never invite.
      {
        const pp = controls && controls.position;
        const invSurf = pp ? playerDogSurfaceDist(pp) : 99;
        const still = !controls || !controls.isMovingForward || !controls.isMovingForward();
        dogCtrl.handInvite = (intensity !== "barking"
          && dogCtrl.mood !== "aggressive"
          && dog.userData.ready
          && invSurf < PET_INVITE_SURFACE
          && invSurf > PET_CONTACT_SURFACE * 0.55
          && still) ? 1 : 0;
      }

      // ---- Player kinematics: HOW you move toward the dog matters ----
      // The dog reads your body's velocity, not just your position. Velocity
      // is the player's OWN, projected on the player→dog line — closure caused
      // by the DOG moving (a fetch return, a call) must never read as a
      // charge. Two responses grow from the same signal:
      //   • A fast, direct close STARTLES the dog: it recoils a step, ducks
      //     (flinch clip), tail tucks, and a small dog whines while a big
      //     alert dog answers with a warning bark instead.
      //   • A slow, calm close is an INVITATION: the dog visibly perks up as
      //     it watches you come (ears, building wag) — the quiet reward for
      //     approaching the way a nervous animal needs you to.
      if (controls && dog.userData.ready) {
        const pp = controls.position;
        const pdx = dog.position.x - pp.x, pdz = dog.position.z - pp.z;
        const pDist = Math.hypot(pdx, pdz) || 1;
        if (_prevPP.t >= 0) {
          // SIM time, not wall time: position integrates against the render
          // loop's clamped dt, so dividing by wall-clock gaps under-reads
          // velocity whenever a frame runs long (every threshold here would
          // silently deflate on a 20 fps phone and the startle could never
          // fire). `d` is the same clamped dt the movement itself used.
          const idt = Math.max(0.008, Math.min(d, t - _prevPP.t));
          _pvxSm += ((pp.x - _prevPP.x) / idt - _pvxSm) * Math.min(1, d * 8);
          _pvzSm += ((pp.z - _prevPP.z) / idt - _pvzSm) * Math.min(1, d * 8);
          // Closure: + when the player moves toward the dog.
          _apprSm += ((_pvxSm * pdx + _pvzSm * pdz) / pDist - _apprSm) * Math.min(1, d * 5);
          _pSpdSm += (Math.hypot(_pvxSm, _pvzSm) - _pSpdSm) * Math.min(1, d * 5);
          // Inspection surface for the preview harness (read-only, cheap).
          dogCtrl._dbg = { appr: _apprSm, spd: _pSpdSm, dist: pDist, exc: _excSm };
          const busy = dogCtrl.state === "walking" || dogCtrl.state === "galloping"
            || dogCtrl.state === "bark" || dogCtrl.state === "eat";
          const friendly = intensity !== "barking" && dogCtrl.mood !== "aggressive"
            && dogCtrl.state !== "bark" && dogCtrl.state !== "eat"
            && fetchPhase === "idle";
          const alertRung = intensity === "alert";
          // Startle: brisk beeline within the dog's awareness bubble. Calm
          // rungs flinch small; alert rungs answer bigger — but a lying dog
          // (rung-3 start) never scrambles up for this.
          // Thresholds are FRACTIONS of what this player can actually do:
          // top pace is the scene speed capped by the body's walk limit
          // (~1.3 m/s), so the old absolute 1.75 m/s on alert rungs could
          // never be reached and the calm 1.30 needed a flat-out beeline.
          // A brisk, direct walk (70 % / 85 % of top pace) is the trigger.
          const topPace = Math.min((controls.opts && controls.opts.speed) || 1.45, controls._walkCap || 1.45);
          const startleThresh = topPace * (alertRung ? 0.85 : 0.70);
          if (friendly && t > startleCDUntil && pDist < 3.4 && _apprSm > startleThresh) {
            startleCDUntil = t + 9;
            startleT = 1;
            const lying = dogCtrl.state === "lay";
            // Duck FIRST, scramble SECOND. flinch() only plays from a
            // standing/sitting pose, so it must run before the recoil walk
            // flips the state — then the step away lands mid-duck (0.45 s),
            // cutting the clip at its sharpest point: duck → scramble.
            const ducked = (!alertRung && !lying) ? dogCtrl.flinch() : false;
            if (!lying && !busy) {
              // Recoil: one quick step AWAY along the dog→player line.
              const hop = dogCtrl._resolve(
                dog.position.x - (pdx / pDist) * 0.55,
                dog.position.z - (pdz / pDist) * 0.55
              );
              if (ducked) {
                startleHop = { x: hop.x, z: hop.z, at: t + 0.45 };
              } else {
                dogCtrl.walkTo(hop.x, hop.z, { force: true });
              }
              dogCtrl._moveLockT = Math.max(dogCtrl._moveLockT || 0, 1.2);
            }
            if (alertRung) {
              dogCtrl.barkSmall();
              dogCtrl.aggression = Math.max(dogCtrl.aggression || 0, 0.42);
              if (window.PhobiaAudio?.dogVocal) {
                // dogPos/barkOpts (built later in update) aren't in scope here.
                const sYaw = dog.rotation.y;
                window.PhobiaAudio.dogVocal("bark", 0.55, {
                  x: dog.position.x, y: dog.position.y + 0.7, z: dog.position.z,
                }, {
                  f0: dogF0, count: 1, gap: 0.18, air: true, reverb: 0.22,
                  forward: { x: Math.sin(sYaw), y: 0, z: Math.cos(sYaw) },
                  coneInnerAngle: 80, coneOuterAngle: 220, coneOuterGain: 0.30,
                });
              }
            } else if (window.PhobiaAudio?.dogWhine) {
              try {
                window.PhobiaAudio.dogWhine(0.5, {
                  x: dog.position.x, y: dog.position.y + dogHeight * 0.5, z: dog.position.z,
                });
              } catch {}
            }
            coach.pulse(alertRung ? 0.32 : 0.22, "startle", pDist);
            const startleRead = coachSignal("startled");
            if (alertRung) bodyJolt(0.5);   // its answering bark hits YOUR body too
            // The startle costs the approach its welcome: the dog needs a
            // beat before it wants to close or wander again.
            nextAutoApproach = Math.max(nextAutoApproach, t + 7);
            nextWander = Math.max(nextWander, t + 5);
            wanderSuppressUntil = Math.max(wanderSuppressUntil, t + 5);
            if (!startlePrompted && !startleRead && window.PhobiaFX?.contextPrompt) {
              startlePrompted = true;
              window.PhobiaFX.contextPrompt(
                alertRung
                  ? window.tf("sc.d.fastAlert", "{dog} answered a fast approach. Slow down — let it watch you come.", { dog: dogName })
                  : window.tf("sc.d.fast", "Quick moves startle dogs. Slow, easy steps — watch {dog} stay calm.", { dog: dogName }),
                4600
              );
            }
          }
          // The deferred scramble: fires mid-duck, cancelling the flinch
          // one-shot into the recoil step (the controller acts on walkTo
          // directly; _moveLockT only pauses the scene's own scheduling).
          if (startleHop && t >= startleHop.at) {
            dogCtrl.walkTo(startleHop.x, startleHop.z, { force: true });
            startleHop = null;
          }
          // Tail tuck while the startle plays out (decays over ~2.2 s). The
          // `|| dogCtrl.tuck` term writes the final exact zero — otherwise the
          // channel parks at the last sub-1% sample forever.
          if (startleT > 0 || dogCtrl.tuck) {
            startleT = Math.max(0, startleT - d / 2.2);
            dogCtrl.tuck = (alertRung ? 0.30 : 0.75) * startleT;
          }
          // Bump: brushing the dog's body at speed makes it give way.
          if (friendly && t > _bumpCDUntil && _pSpdSm > 0.55
              && playerDogSurfaceDist(pp) < 0.06) {
            _bumpCDUntil = t + 5;
            if (!busy && dogCtrl.state !== "lay") {
              // Sidestep off the collision line rather than back into the player.
              const sx = dog.position.x + (pdz / pDist) * 0.45;
              const sz = dog.position.z - (pdx / pDist) * 0.45;
              const step = dogCtrl._resolve(sx, sz);
              dogCtrl.walkTo(step.x, step.z, { force: true });
              dogCtrl._moveLockT = Math.max(dogCtrl._moveLockT || 0, 1.0);
              dogCtrl.flinch();
            }
          }
          // Gentle-approach excitement ramp: near, slow (or quietly waiting),
          // and not mid-startle — the dog perks as you close in.
          const gentle = friendly && startleT <= 0
            && pDist < 3.0 && _apprSm < 0.9 && _pSpdSm < 0.9;
          _excSm += ((gentle ? Math.max(0.15, 1 - pDist / 3.2) : 0) - _excSm) * Math.min(1, d * 2.5);
          dogCtrl.excitement = _excSm;
          if (_excSm > 0.05) dogCtrl.tailWag += _excSm * d * 5;
          dogCtrl.happy = Math.min(1, trust + _excSm * 0.45);
        } else {
          dogCtrl.excitement = 0;
          dogCtrl.happy = trust;
        }
        _prevPP.x = pp.x; _prevPP.z = pp.z; _prevPP.t = t;
      }
      dogCtrl.update(t, d);

      // Complete an invited pet only after the dog has actually reached the
      // avatar. If either participant moves away, the request expires instead
      // of producing a delayed, disembodied reward.
      if (petRequestT > 0) {
        petRequestT = Math.max(0, petRequestT - d);
        const pp = controls && controls.position;
        const inviteSurf = playerDogSurfaceDist(pp);
        if (inviteSurf <= PET_CONTACT_SURFACE && dogCtrl.mood !== "aggressive") {
          completePet();
        } else if (inviteSurf > PET_INVITE_SURFACE + 0.8) {
          petRequestT = 0;
        }
      }

      // ---- Banana-walk second leg ----
      // The swing-out leg landed; converge on the real stand-off point. A
      // deadline (or the fetch machine taking over) drops a stale curve.
      if (arcApproachTgt) {
        if (!arcApproachTgt.until) arcApproachTgt.until = t + 7;
        // Turn onto the second leg while still MOVING, as the swing-out
        // point comes up — waiting for the dog to stop dead at the corner
        // made every greeting a stop-and-go (with braking arrivals, a
        // visible halt mid-approach).
        const ft = dogCtrl.followTarget;
        const nearCorner = ft && (dogCtrl.state === "walking" || dogCtrl.state === "galloping")
          && Math.hypot(dog.position.x - ft.x, dog.position.z - ft.z) < 0.45;
        if (t > arcApproachTgt.until || fetchPhase !== "idle") {
          arcApproachTgt = null;
        } else if (dogCtrl.state === "idle" || nearCorner) {
          dogCtrl._moveLockT = Math.max(dogCtrl._moveLockT, 5);
          dogCtrl.walkTo(arcApproachTgt.x, arcApproachTgt.z, { force: true });
          arcApproachTgt = null;
        }
      }
      // ---- The invited dog ARRIVES ----
      // A visible greeting beat (happy clip + tail burst) instead of a
      // pathfinding stop. Follow catch-ups greet from inside the controller.
      if (callGreetPending && controls) {
        if (!callGreetDeadline) callGreetDeadline = t + 9;
        if (t > callGreetDeadline) {
          callGreetPending = false; callGreetDeadline = 0;
        } else if (!arcApproachTgt && dogCtrl.state === "idle"
            && playerDogSurfaceDist(controls.position) < PET_INVITE_SURFACE) {
          callGreetPending = false; callGreetDeadline = 0;
          dogCtrl.greet(2.5);
          coachSignal("greet");
          // Called from a real distance, and you were still where you called
          // from when it got here: that's the rung-3 star.
          if (levelIdx === 2 && callFrom.d > 1.6
              && Math.hypot(controls.position.x - callFrom.x, controls.position.z - callFrom.z) < 0.9) coach.goalDone("callStay");
        }
      }

      // ---- Carried item rides the real mouth ----
      // (The carried ball is parented to the head BONE at pickup — see
      // dogHeadBone() and the fetch pickup below — so it needs no per-frame
      // correction here at all. This used to lerp the mouth ANCHOR toward the
      // head every frame, which only ever moved the ball's position and never
      // its orientation: the anchor is a child of the dog group, so a ball
      // hanging off it stayed square to the body while the muzzle turned and
      // tilted underneath, and trailed a frame or two behind every head-toss.
      // Parenting to the bone gives position and rotation exactly, with no
      // catch-up, which is what "held in the mouth" actually means.)

      // ---- Attention (gaze) priorities ----
      // The head tracks what a real dog would watch, fast, while the body
      // turns slowly underneath. Priority: thrown ball > first-contact sniff
      // (hand) > perched bird (brief glances) > the player when close. The
      // lunge machine overrides all of these with a hard stare (it calls
      // lookAt3 later in this frame).
      {
        const cpos = (controls && controls.position) || camera.position;
        const pdx = cpos.x - dog.position.x, pdz = cpos.z - dog.position.z;
        const pdist = Math.hypot(pdx, pdz);

        // ---- Stare pressure and the look-away (calm + alert rungs) ----
        // A held, head-on stare is a threat in dog language, and the single
        // most reliable thing a dog does about it is break eye contact:
        // it turns its head aside, holds the aversion a moment, then checks
        // back. The barking rung already reads the player's gaze — there it
        // feeds aggression — but rungs 1-4 had no answer to being stared at
        // at all, so the dog met an unbroken stare with an unbroken stare of
        // its own. That is the one thing a relaxed dog reliably does NOT do,
        // and it is the tell: nothing the animal does depends on where you
        // are actually looking.
        //
        // It also happens to be the most useful thing this scene can teach.
        // Frightened people stare at dogs — you watch the thing you are
        // afraid of — and the stare is read by the animal as pressure, which
        // makes the dog tense, which confirms the fear. Letting the look-away
        // happen on screen makes that loop visible and breakable.
        if (intensity !== "barking" && dog.userData.ready) {
          const dirToDog = Math.atan2(pdx, pdz);
          const yawDelta = controls
            ? angleGap(controls.yaw, dirToDog)
            : Math.PI;
          // Head-on within ~43°, and near enough that the stare carries.
          // These two curves multiply into `load`, and `_stareSm` can only
          // ever asymptote TO load — so if either curve tops out below the
          // trigger threshold at the distance the rung actually parks you at,
          // the look-away can never fire at all. Rung 2's goal ring sits at
          // 2.6 m, so full range pressure has to be reached by ~3 m, not the
          // 2.0 m a narrower falloff implied.
          const aligned = Math.max(0, 1 - yawDelta / 0.75);
          const inRange = Math.max(0, Math.min(1, (4.5 - pdist) / 1.5));
          // Petting and fetch are consented contact — a dog being fussed is
          // not under threat, however hard you are looking at it.
          const exempt = petPulse > 0.1 || sniffGreetT > 0 || fetchPhase !== "idle";
          const load = exempt ? 0 : aligned * inRange;
          // Builds over a couple of seconds, drains about twice as fast: the
          // dog forgives a stare quicker than it accrues one.
          _stareSm += (load - _stareSm) * Math.min(1, d * (load > _stareSm ? 0.75 : 1.6));
          if (_stareSm > 0.55 && t > _lookAwayUntil + 2.2) {
            // Avert to whichever side the dog is already facing — a real
            // look-away is a small turn of the head, not a full spin.
            _lookAwayUntil = t + 1.4 + Math.random() * 1.1;
            _lookAwaySide = Math.random() < 0.5 ? -1 : 1;
            // Bleed the accumulated pressure so a sustained stare produces a
            // repeating check-away-check rhythm rather than a metronome.
            _stareSm *= 0.45;
            // The dog's discomfort is worth one quiet line, once per rung —
            // unless the player is already being asked to read it.
            const lookRead = coachSignal("lookAway");
            if (!lookRead && !_lookAwayToldOnce && window.PhobiaVoice) {
              _lookAwayToldOnce = true;
              try {
                // window.t, not t — inside update(t, dt) the parameter `t` is
                // the scene clock and shadows the global translate function.
                // Keep WATCHING (that's the exposure) — just with soft eyes
                // (that's dog manners). The old line read as "look away".
                window.PhobiaVoice.speak(window.t("dogs.lookaway2",
                  "It turned its head away — a dog's polite \"no trouble here\". Keep watching it, just with softer eyes."));
              } catch {}
            }
          }
          // Observability for scene-verification hooks, matching the barking
          // rung's dog.userData.barkDebug.
          dog.userData.stareDebug = {
            t: +t.toFixed(2), dist: +pdist.toFixed(2),
            yawDelta: +yawDelta.toFixed(2), aligned: +aligned.toFixed(2),
            inRange: +inRange.toFixed(2), load: +load.toFixed(2),
            stare: +_stareSm.toFixed(3), exempt: !!exempt,
            averting: t < _lookAwayUntil,
          };
        }

        const averting = t < _lookAwayUntil;
        // The ball draws the eye while it flies and while it lies waiting —
        // not once it is IN the mouth: it is parented to the head bone then,
        // so its .position is bone-local and the head swung toward a
        // meaningless point for the whole carry.
        if (item && item.mesh && item.mesh.parent === scene
            && (item.state === "flying" || fetchPhase === "toItem")) {
          dogCtrl.lookAt3(item.mesh.position, 1);
        } else if (sniffGreetT > 0 && !dogPlayerState.petted) {
          // Investigate the offered fist (therapy tip) before full petting.
          const handY = cpos.y - 0.55;
          dogCtrl.lookAt3({ x: cpos.x, y: handY, z: cpos.z }, 0.95);
        } else if (dogCtrl._birdGaze && dogCtrl._birdGaze > 0 && bird.visible) {
          dogCtrl.lookAt3(bird.position, Math.min(1, dogCtrl._birdGaze));
        } else if (averting) {
          // Hold the gaze off to one side of the player, at their height, so
          // the head turns rather than drops — a dropped head reads as cowed,
          // and appeasement here is politeness, not fear.
          const perpX = -pdz / (pdist || 1), perpZ = pdx / (pdist || 1);
          const off = 2.0 * _lookAwaySide;
          dogCtrl.lookAt3({
            x: cpos.x + perpX * off,
            y: cpos.y - 0.20,
            z: cpos.z + perpZ * off,
          }, 0.65);
        } else if (pdist < 5.5 && intensity !== "barking") {
          // Look at the PLAYER'S FACE (eye height), not their feet — a dog
          // that stares at ankles reads as broken, not attentive.
          const faceY = cpos.y - 0.08;
          const gazeW = petPulse > 0.1 ? 0.95
            : (pdist < 2.2 ? 0.75 : 0.45);
          dogCtrl.lookAt3({ x: cpos.x, y: faceY, z: cpos.z }, gazeW);
        }
      }

      // ---- Mutual gaze: character watches the dog's head when near ----
      // Without this the avatar stares into space while the dog watches them —
      // the bond only goes one way. Prefer the live Head bone; fall back to a
      // height estimate. setGazeTarget owns the calm-watch channel (threat
      // still wins when PhobiaThreat is live).
      if (active && active.body && active.body.setWatchTarget && controls
          && intensity !== "barking") {
        const pDist = Math.hypot(
          controls.position.x - dog.position.x,
          controls.position.z - dog.position.z);
        if (pDist < 4.5 && dog.userData.ready) {
          const parts = dog.userData.parts;
          if (parts && parts.model) {
            if (parts._gazeHead === undefined) {
              parts._gazeHead = null;
              parts.model.traverse(o => {
                if (!parts._gazeHead && o.isBone && o.name === "Head") parts._gazeHead = o;
              });
            }
            if (parts._gazeHead) {
              parts._gazeHead.getWorldPosition(_petPt);
            } else {
              const dogH = (parts && parts.height) || 0.6;
              _petPt.set(dog.position.x, dog.position.y + dogH * 0.85, dog.position.z);
            }
          } else {
            _petPt.set(dog.position.x, dog.position.y + 0.55, dog.position.z);
          }
          active.body.setWatchTarget(_petPt);
        } else {
          active.body.setWatchTarget(null);
        }
      }

      // The mount()-level VSM pass force-sets radius 4 / blurSamples 16 on
      // every shadow light AFTER setup() returns, which blurs the window
      // mullion pattern to mush. Re-tighten once, on the first frame.
      //
      // 2.5 was still too wide for a room lit through a window: it dissolved
      // the standing figure's shadow into a featureless puddle, and a shadow
      // with no silhouette in it stops being read as a shadow at all — it
      // reads as a decal under the model, which is the exact video-game tell
      // the soft shadows were bought to avoid. Direct sun through glass is a
      // small, hard-ish source; 1.4 keeps a legible body and a crisp mullion
      // cross while the penumbra stays soft enough not to look stencilled.
      if (!_shadowTuned) {
        _shadowTuned = true;
        if (sceneQuality() === "high" && key.castShadow) {
          key.shadow.radius = 1.4;
          key.shadow.blurSamples = 12;
        }
        // Tiny static props don't cast. Half the room's shadow casters were
        // under ~6 cm across (cups, tags, jar biscuits, finger capsules on
        // the avatar's hands…): each is a draw in the shadow pass every
        // frame, and at this map resolution and blur none of them leaves a
        // shadow you could point to. Skinned meshes (the dog, the traveler's
        // body) and anything tagged keepShadow are left alone.
        const _bs = new THREE.Sphere();
        scene.updateMatrixWorld(true);
        scene.traverse((o) => {
          if (!o.isMesh || !o.castShadow || o.isSkinnedMesh || (o.userData && o.userData.keepShadow)) return;
          const g = o.geometry;
          if (!g) return;
          if (!g.boundingSphere) g.computeBoundingSphere();
          _bs.copy(g.boundingSphere).applyMatrix4(o.matrixWorld);
          if (_bs.radius < 0.03) o.castShadow = false;
        });
      }

      // ---- Fear grade ----
      // As fear (proximity/gaze) or the dog's aggression climbs, lerp the room
      // toward a colder, harder key with the fills pulled down, so shadows
      // deepen and the daylight drains — the space itself turns menacing
      // during the charge, and warms back as the dog settles. Pixel-level
      // grading (desat/vignette/crush) lives in the FearGradeShader pass.
      {
        const fear01 = (window.PhobiaFear && window.PhobiaFear.get)
          ? Math.max(0, Math.min(1, window.PhobiaFear.get() / 100)) : 0;
        // After the hold completes, the room physically warms back — the
        // light itself says "it's over" before any UI does.
        const target = Math.max(fear01, (dogCtrl.aggression || 0) * 0.7) * (_completedCalm ? 0.35 : 1);
        _fearGrade += (target - _fearGrade) * Math.min(1, d * 2.5);
        const g = _fearGrade;
        key.intensity = lightBase.keyI * (1 + g * 0.25);
        key.color.setHex(lightBase.keyC).lerp(_coolKey, g * 0.65);
        hemi.intensity = lightBase.hemiI * (1 - g * 0.55);
        windowGlow.intensity = lightBase.glowI * (1 - g * 0.6);
        // Daylight drains with fear — from whatever the backdrop's own level
        // is. This wrote a flat 1.8 every frame, so the photograph's tuned
        // 1.35 never survived its first frame and the view blew out.
        backdropMat.emissiveIntensity = (backdropMat.userData.baseEmissive || 1.6) * (1 - g * 0.35);
        scene.background.setHex(mood.bg).lerp(_coolBg, g * 0.5);
      }

      // ---- Dog rim light: track behind the dog (away from the camera) so its
      // silhouette edge glows — separates the dog from the background and reads
      // as a furry coat catching light. Brighter up close + during the charge.
      {
        const cpos = (controls && controls.position) || camera.position;
        const rdx = dog.position.x - cpos.x, rdz = dog.position.z - cpos.z;
        const rdist = Math.hypot(rdx, rdz) || 1;
        const dogH = (dog.userData.parts && dog.userData.parts.height) || 0.8;
        dogRim.position.set(
          dog.position.x + (rdx / rdist) * 1.3,
          dog.position.y + dogH * 0.95,
          dog.position.z + (rdz / rdist) * 1.3,
        );
        const close = Math.max(0, Math.min(1, (5 - rdist) / 4));
        dogRim.intensity = 0.45 + close * 1.2 + _fearGrade * 0.7;
      }

      // ---- Collar jingle on the shake-off ----
      // The whole-body shake rattles the tag hard — the burst fires once on
      // the pulse's rising edge (the shake itself oscillates at ~9 Hz for
      // 0.8 s; re-triggering per oscillation would be a sleigh).
      {
        const sp = dogCtrl._shakePulse || 0;
        if (sp > 0.85 && _prevShakePulse <= 0.85
            && dog.userData.parts.collar && window.PhobiaAudio?.collarJingle) {
          try {
            window.PhobiaAudio.collarJingle(0.55,
              { x: dog.position.x, y: dog.position.y + dogHeight * 0.62, z: dog.position.z },
              { count: 7 });
          } catch {}
        }
        _prevShakePulse = sp;
      }

      // ---- Ambient panting / breathing ----
      // A real dog breathes audibly at rest and pants harder after exertion —
      // and inside arm's reach it is a CONTINUOUS presence: the breath gaps
      // close toward a real pant cycle (~2 breaths/s), the sound sits at
      // muzzle height instead of the floor, and now and then the dog audibly
      // sniffs YOU. This proximity layer is most of what "it's right here"
      // feels like with your eyes on the meter instead of the dog.
      dogExertion = Math.max(0, dogExertion - d * 0.12);
      dogPantTimer -= d;
      if (dogPantTimer <= 0) {
        const calm = dogCtrl.state === "idle" || dogCtrl.state === "sit" || dogCtrl.state === "lay";
        const ppB = (controls && controls.position) || camera.position;
        const nearD = Math.hypot(dog.position.x - ppB.x, dog.position.z - ppB.z);
        const near = Math.max(0, Math.min(1, (2.2 - nearD) / 1.7));   // 1 at ≤0.5 m → 0 past 2.2 m
        if ((calm || dogExertion > 0.2) && window.PhobiaAudio?.dogPant) {
          try {
            const muzzle = { x: dog.position.x, y: dog.position.y + dogHeight * 0.62, z: dog.position.z };
            if (near > 0.55 && calm && Math.random() < 0.16 && window.PhobiaAudio.dogSniff) {
              window.PhobiaAudio.dogSniff(0.4 + near * 0.3, muzzle);   // smelling you
            } else if (window.PhobiaAudio.dogVocal) {
              window.PhobiaAudio.dogVocal("pant", 0.3 + dogExertion * 0.55 + near * 0.12, muzzle);
            } else {
              window.PhobiaAudio.dogPant(0.3 + dogExertion * 0.55 + near * 0.12, muzzle);
            }
          } catch {}
        }
        const baseGap = calm ? 1.1 + Math.random() * 0.9 : 0.5 + Math.random() * 0.4;
        // ×(1−0.62·near): gaps shrink to ~0.42–0.76 s at contact range — a
        // relaxed pant rhythm, still clear of the ~0.3 s one-shot length.
        dogPantTimer = (baseGap * (1 - near * 0.62)) / (1 + dogExertion * 1.5);
      }

      // Keep the player from walking through the dog + key props. Furniture
      // boxes from mount handle mesh AABBs; these circles cover the same
      // props the dog navigates so player/dog agree on bed/table footprints.
      // (One list and one dog circle, refilled in place: this rebuilt a
      // fresh array and object every frame.)
      if (controls && controls.setObstacles) {
        _obsList.length = 0;
        for (let i = 0; i < dogObstacles.length; i++) _obsList.push(dogObstacles[i]);
        _obsDog.x = dog.position.x;
        _obsDog.z = dog.position.z;
        _obsDog.r = dogCtrl.radius + 0.12;
        _obsDog.pushX = Math.sin(dog.rotation.y);
        _obsDog.pushZ = Math.cos(dog.rotation.y);
        _obsList.push(_obsDog);
        controls.setObstacles(_obsList);
      }
      // Physics on approach to the side table (see beginPhysics).
      if (!physBegun && controls && controls.position
          && Math.hypot(controls.position.x - physTable.x, controls.position.z - physTable.z) < 3.2) {
        beginPhysics();
      }

      // ---- Feed the coach (the alarm, the trial card, the evidence) ----
      // The alarm used to be proximity·55 + gaze·25 + duration·20, and the
      // duration term only ever grew while you stayed: a player standing
      // quietly beside a sitting dog watched their "fear" climb for the whole
      // hold. The coach models it the way exposure actually goes — see
      // makeDogCoach — and PhobiaFear just smooths what it says.
      if (controls && window.PhobiaFear) {
        const dx = controls.position.x - dog.position.x;
        const dz = controls.position.z - dog.position.z;
        const playerDist = Math.hypot(dx, dz);
        lastPlayerDist = playerDist;
        // Facing the dog: camera forward is (−sin yaw, −cos yaw) and
        // dirToDog = atan2(cam−dog), so yaw === dirToDog when looking straight
        // at it.
        const dirToDog = Math.atan2(dx, dz);
        const yawDelta = angleGap(controls.yaw, dirToDog);
        const gazeAlign = Math.max(0, 1 - yawDelta / 1.0);
        // How fast the DOG closes on you — its own motion only. Walking up to
        // it yourself is new ground (the coach handles that), not being
        // approached.
        let dogToward = 0;
        if (coachPrev.t) {
          const idt = 1 / Math.max(0.001, d);
          const vx = (dog.position.x - coachPrev.dx) * idt, vz = (dog.position.z - coachPrev.dz) * idt;
          dogToward = (vx * dx + vz * dz) / (playerDist || 1);
          if (!isFinite(dogToward) || Math.abs(dogToward) > 12) dogToward = 0;
          const pv = Math.hypot(controls.position.x - coachPrev.px, controls.position.z - coachPrev.pz) * idt;
          coachPlayerSpeed += ((isFinite(pv) && pv < 12 ? pv : 0) - coachPlayerSpeed) * Math.min(1, d * 6);
        }
        coachToward += (dogToward - coachToward) * Math.min(1, d * 6);
        coachPrev.dx = dog.position.x; coachPrev.dz = dog.position.z;
        coachPrev.px = controls.position.x; coachPrev.pz = controls.position.z; coachPrev.t = t;
        // On screen? A body-language prompt must point at something visible.
        // (Refresh the camera's matrices first: mid-frame they can still hold
        // an earlier pass's pose, which put a dog at your feet "off screen".)
        camera.updateMatrixWorld();
        _coachV.set(dog.position.x, dog.position.y + dogHeight * 0.5, dog.position.z).project(camera);
        coachOnScreen = _coachV.z < 1 && Math.abs(_coachV.x) < 0.92 && Math.abs(_coachV.y) < 0.92;
        // Where the dog's head is on screen, so a question about it can sit
        // just above it instead of on top of it.
        _coachV.set(dog.position.x, dog.position.y + dogHeight * 1.08, dog.position.z).project(camera);
        // The renderer already knows its CSS size; reading the canvas's
        // clientWidth here forced a layout every frame (styles were written
        // earlier in the same frame).
        if (active.renderer) active.renderer.getSize(_coachSize); else _coachSize.set(0, 0);
        const sw = _coachSize.x, sh = _coachSize.y;
        const headX = _coachV.z < 1 ? (_coachV.x + 1) / 2 * sw : null;
        const headY = _coachV.z < 1 ? (1 - _coachV.y) / 2 * sh : null;
        // Looking at you? (the snout is +Z at yaw 0)
        const dogGazing = dogCtrl.state !== "lay"
          && (Math.sin(dog.rotation.y) * dx + Math.cos(dog.rotation.y) * dz) / (playerDist || 1) > 0.8;
        // Keep the dog in the third-person shot (the boom swings out when the
        // avatar would hide it).
        coachSubj.x = dog.position.x; coachSubj.z = dog.position.z;
        controls.tpSubject = coachSubj;
        coach.update(d, {
          dist: playerDist, gaze: gazeAlign, dogToward: coachToward,
          px: controls.position.x, pz: controls.position.z, dogX: dog.position.x, dogZ: dog.position.z,
          onScreen: coachOnScreen, dogGazing, trust: intensity === "barking" ? null : trust,
          anchorX: headX, anchorY: headY, stageW: sw, stageH: sh,
        });
        // (The rung skill stars land where their verb completes: treatEaten,
        // the call's arrival, the ball's drop.)
        arousalFloor = Math.max(0, arousalFloor - d / 12);
        // Avoidance: stepping back AFTER engaging. The barking rung marks the
        // dog as having noticed you from the first frame and spawns you past
        // 5.5 m, so without the "came close once" condition a player who had
        // not taken a step was logged as retreating from the moment they
        // arrived (and told "you stepped back" 14 s in).
        if (playerDist < zoneM + 1.0) dogPlayerState.engagedOnce = true;
        const isAway = playerDist > 5.5;
        window.PhobiaFear.bumpAvoidance(d, isAway && dogPlayerState.dogNoticedYou && !!dogPlayerState.engagedOnce);
        // (The polled narrator is retired here: its generic lines — "the dog
        // is calm", "your body is learning this is safe" — talked over the
        // coach, and were often simply wrong about what was on screen. The
        // coach's beats are tied to what the alarm and the dog actually do.)

        // ---- Body posture: only when YOU choose contact ----
        // The avatar used to crouch, lean and reach for the dog on its own the
        // moment you got close — then the guide announced "your hand is on it"
        // to a player who had never chosen to touch anything. For someone
        // afraid of dogs, contact is the biggest decision in the room; it has
        // to be theirs. So the body stays neutral until a click on the dog
        // (pet or invite) opens a short window of intent.
        petIntentT = Math.max(0, petIntentT - d);
        // Holding a treat out is reaching for the dog by choice, too.
        const wantsContact = petIntentT > 0 || petPulse > 0.05 || petRequestT > 0 || !!(item && item.state === "offer");
        if (active.body && active.body.setPosture && ((intensity === "barking" && barkState !== "settling") || !wantsContact)) {
          active.body.setPosture({ crouch: 0, reach: 0, lean: 0 });
          if (controls.setEyeDrop) controls.setEyeDrop(0);
        } else if (active.body && active.body.setPosture) {
          // Crouch grows from 0 at 2.5m to 0.55 at 0.6m — deeper than before
          // so the character actually gets down to dog height.
          const crouch = Math.max(0, Math.min(0.55, (2.5 - playerDist) / 1.9));
          // Extra squat while actively petting or when the dog has sat for you.
          const petCrouch = petPulse * 0.25 + (dogCtrl.state === "sit" ? 0.12 : 0);
          const reach = playerDist < 1.6
            ? 0.45 + petPulse * 0.55
            : (playerDist < 2.5 ? 0.25 : 0);
          const lean = playerDist < 1.6 ? 0.35 + petPulse * 0.20 : 0;
          active.body.setPosture({
            crouch: Math.min(0.72, crouch + petCrouch),
            reach,
            reachHeight: dogCtrl.state === "sit" ? 0.38 : 0.22,  // higher for a sitting dog
            lean,
            armSpread: 0,
          });
          // Bend the FP head down toward a low dog so the hand can actually
          // reach its back — you crouch to greet a small dog.
          if (controls.setEyeDrop) {
            const parts = dog.userData.parts;
            const dogH = (parts && parts.height) || 0.6;
            const sitBoost = dogCtrl.state === "sit" ? 0.12 : 0;
            const contactY = dog.position.y + dogH * (0.72 + sitBoost);
            const closeness = Math.max(0, Math.min(1, (2.2 - playerDist) / 1.0));
            const drop = playerDist < 2.2
              ? Math.max(0, controls.position.y - (contactY + 0.55)) * closeness
              : 0;
            controls.setEyeDrop(Math.min(0.62, drop));
          }
        } else if (controls.setEyeDrop) {
          controls.setEyeDrop(0);
        }
      }

      // ---- Character-driven proximity events ----
      // As the player closes the distance to the dog, contextual prompts
      // fade in to mark the natural milestones: dog notices you, you're
      // close enough to pet, etc. These are once-per-rung so the cue isn't
      // repeated to nag.
      if (controls && intensity !== "barking") {
        const dx = controls.position.x - dog.position.x;
        const dz = controls.position.z - dog.position.z;
        const playerDist = Math.hypot(dx, dz);
        // 1. Dog notices you (within 4 m for the first time). Make the dog
        // turn its head, tail flick — the DogController already does the
        // tracking; we just give the user a cue that the dog SEES them.
        if (playerDist < 4.0 && !dogPlayerState.dogNoticedYou) {
          dogPlayerState.dogNoticedYou = true;
          // A dog already on its way to you — called, invited, or crossing
          // the room of its own accord — has plainly noticed you. This beat
          // used to stop it dead mid-approach and announce that it "went back
          // to its own thing", which is exactly how calling it from the
          // doorway failed the first time, every time.
          const approaching = !!(callGreetPending || callWalkAt || arcApproachTgt || dogCtrl._companionPending);
          if (!approaching && window.PhobiaFX && window.PhobiaFX.contextPrompt) {
            window.PhobiaFX.contextPrompt(
              window.tf("dc.noticed", "{dog} has noticed you. It looks — that's all a look is. Watch what it does next.", { dog: dogName }),
              4000
            );
          }
          // Noticing you is the first thing worth reading: a dog that stops
          // and looks is ALERT, and alert is not attack.
          if (!approaching) coachSignal("alertWatch");
          lifeNextAt = Math.max(lifeNextAt, t + 4);   // let the look land before it moves on
          // Subtle tail flick to acknowledge — drives the visible reaction
          dogCtrl.tailWag += 4;
          dogCtrl.headCock(0.8);
          // Ear flick toward the player — the "I heard you" micro-signal.
          dogCtrl._earFlickSide = Math.sign(
            (controls.position.x - dog.position.x) * Math.cos(dog.rotation.y)
            - (controls.position.z - dog.position.z) * Math.sin(dog.rotation.y)
          ) || 1;
          dogCtrl._earFlickA = 1;
          // The dog quietly stops what it was doing (sniff, wander) and
          // turns to face the player — EXCEPT on the lying-start rung, where
          // the escalation arc owns posture (this would pop it to standing).
          if (B.startPose !== "lay" && !approaching) {
            dogCtrl.stopMove();
            // Noticing the player outranks the load-in sniff trip.
            dogCtrl._initialSniff = false;
          }
          // (No "First approach" toast here any more: it landed on the same
          // frame as the noticed prompt and the read-the-dog question — three
          // boxes saying one thing.)
        }
        // 2. Close approach — surface reach for sniff-first greeting. Matches
        // the cynophobia tip: let the dog investigate your hand first.
        if (playerDogSurfaceDist(controls.position) < PET_INVITE_SURFACE && !dogPlayerState.closeApproach) {
          dogPlayerState.closeApproach = true;
          if (!dogPlayerState.sniffGreeted && intensity !== "barking") {
            dogPlayerState.sniffGreeted = true;
            sniffGreetT = 2.8;
            // Soft approach to sniff range if still a step away — but never
            // break a commanded sit/lie (commands must stay reliable).
            const surf = playerDogSurfaceDist(controls.position);
            if (surf > PET_CONTACT_SURFACE && dogCtrl.mood !== "aggressive"
                && dogCtrl.state !== "sit" && dogCtrl.state !== "lay") {
              const pr = dogCtrl.playerRadius || 0.30;
              const stopAt = PET_CONTACT_SURFACE * 0.9 + pr + (dogCtrl.radius || 0.35);
              const k = Math.max(0, (playerDist - stopAt) / (playerDist || 1));
              dogCtrl.walkTo(dog.position.x + dx * k, dog.position.z + dz * k);
            }
            // One line, one channel (the caption used to repeat it in
            // different words), and it offers rather than instructs.
            if (window.PhobiaFX && window.PhobiaFX.contextPrompt) {
              window.PhobiaFX.contextPrompt(
                window.tf("dc.sniffHello", "{dog} came to sniff hello. Stay still — it's reading you with its nose.", { dog: dogName }),
                4500
              );
            }
          }
        }
        // Drive the sniff-greeting: head-low + soft sniffs (gaze is owned by
        // the attention block above so it isn't overwritten by player-face).
        if (sniffGreetT > 0 && !dogPlayerState.petted) {
          sniffGreetT = Math.max(0, sniffGreetT - d);
          dogCtrl.headPitch = 0.45 + Math.sin(t * 6) * 0.06;
          if (!dogCtrl._lastSniffAt || t - dogCtrl._lastSniffAt > 0.7) {
            if (window.PhobiaAudio && window.PhobiaAudio.dogSniff) {
              try {
                window.PhobiaAudio.dogSniff(0.5, {
                  x: dog.position.x,
                  y: dog.position.y + dogHeight * 0.55,
                  z: dog.position.z,
                });
              } catch {}
            }
            dogCtrl._lastSniffAt = t;
          }
          if (sniffGreetT <= 0 && window.PhobiaFX && window.PhobiaFX.contextPrompt) {
            window.PhobiaFX.contextPrompt(
              window.t("dc.sniffDone", "That was a dog saying hello. Nothing else was coming."),
              3500
            );
          }
        }
        // 3. After petting (any pet pulse fired)
        if (petPulse > 0.5 && !dogPlayerState.petted) {
          dogPlayerState.petted = true;
          sniffGreetT = 0;   // pet ends the greeting early — contact made
          // The narrator's contact beat already says "feel the warmth" as a
          // caption; the prompt that said it again is gone. The toast stays —
          // it is the milestone, not the instruction.
          if (window.PhobiaFX && window.PhobiaFX.achievement) {
            window.PhobiaFX.achievement(
              "dogs.firstPet",
              "🤝",
              window.t("ach.firstPet", "First pet"),
              window.tf("ach.firstPetP", "You touched {dog}. Real progress.", { dog: dogName })
            );
          }
        }
        // 4. Walking away after engagement — the coach names what that does
        // to the alarm (relief now, the same fear next time); a second line
        // here only talked over it.
        if (dogPlayerState.dogNoticedYou && playerDist > 5.0
            && !dogPlayerState.walkedAway) {
          dogPlayerState.walkedAway = true;
        }
      }
      // Trust-driven tail wag at rest
      if (dogCtrl.state === "idle" || dogCtrl.state === "sit" || dogCtrl.state === "lay") {
        dogCtrl.tailWag += d * trust * 4;
      }
      // ---- Playful orbit (high trust) ----
      // A bonded dog sometimes circles the player at a soft trot — the
      // "happy dance" that makes the relationship feel two-sided. Cooldown-
      // gated, only on calm/alert rungs, never while fetching or barking.
      if (controls && intensity !== "barking" && trust > 0.45
          && dogCtrl.mood !== "aggressive" && fetchPhase === "idle"
          && dogCtrl.state === "idle" && petPulse < 0.1
          && !(dogCtrl._moveLockT > 0)) {
        dogCtrl._orbitCD = (dogCtrl._orbitCD || 18) - d;
        const pDist = playerDogSurfaceDist(controls.position);
        if (dogCtrl._orbitCD <= 0 && pDist < 2.4 && pDist > 0.4) {
          dogCtrl._orbitCD = 16 + Math.random() * 14;
          const ang = Math.atan2(
            dog.position.x - controls.position.x,
            dog.position.z - controls.position.z
          ) + (Math.random() < 0.5 ? 1 : -1) * (1.1 + Math.random() * 0.5);
          const rad = 1.1 + Math.random() * 0.5;
          const ox = controls.position.x + Math.sin(ang) * rad;
          const oz = controls.position.z + Math.cos(ang) * rad;
          const hop = dogCtrl._resolve(ox, oz);
          dogCtrl.walkTo(hop.x, hop.z, { force: true });
          dogCtrl.tailWag += 6;
          if (dogCtrl.playBow()) coachSignal("playBow");
        }
      }
      // Goal ring under the dog — pulses while user is far, fades when they
      // step into petting range. Tracks the dog as it wanders so it always
      // points the user at where to stand.
      if (dogGoalRing && controls) {
        dogGoalRing.position.x = dog.position.x;
        dogGoalRing.position.z = dog.position.z;
        const dx = controls.position.x - dog.position.x;
        const dz = controls.position.z - dog.position.z;
        const playerDist = Math.hypot(dx, dz);
        const inRange = playerDist < 1.6;
        if (inRange) goalRingReachedT += d;
        const retired = goalRingReachedT > 2.0;
        const targetOp = (inRange || retired) ? 0 : (0.11 + Math.sin(t * 1.6) * 0.04);
        dogGoalRing.material.opacity += (targetOp - dogGoalRing.material.opacity) * Math.min(1, d * 3);
        dogGoalRing.visible = dogGoalRing.material.opacity > 0.004;
      }

      // ---- Bird outside the window ----
      // The bird perches and flies in cycles. The dog notices when it's
      // perching by glancing at the window. This adds a third "agent" to
      // the scene — the world has its own life beyond the player+dog dyad.
      if (bird.userData.state === "absent" && t > bird.userData.nextAppearAt) {
        bird.userData.state = "flying";
        bird.userData.flyT = 0;
        bird.userData.flyFromX = ROOM.x0 - 2.2 - Math.random() * 1.5;
        bird.userData.flyFromY = 1.0 + Math.random() * 0.6;
        bird.userData.flyToX = cx - 0.55;    // landing on the windowsill
        bird.userData.flyToY = -0.04;
        bird.visible = true;
      }
      if (bird.userData.state === "flying") {
        bird.userData.flyT += d * 0.45;     // ~2.2-second flight
        const k = Math.min(1, bird.userData.flyT);
        const ease = k * k * (3 - 2 * k);
        bird.position.x = bird.userData.flyFromX + (bird.userData.flyToX - bird.userData.flyFromX) * ease;
        bird.position.y = bird.userData.flyFromY + (bird.userData.flyToY - bird.userData.flyFromY) * ease;
        // Flight path stays BEHIND the glass (between glass and backdrop) so
        // the bird is seen through the window with real parallax.
        bird.position.z = ROOM.z0 - 0.5;
        // Wing flap (subtle x-rotation oscillation)
        bird.rotation.x = Math.sin(t * 28) * 0.10 * (1 - k);
        if (k >= 1) {
          bird.userData.state = "perching";
          bird.position.z = ROOM.z0 - 0.18;   // hop onto the sill itself
          bird.userData.perchUntil = t + 4 + Math.random() * 6;
          bird.userData.headTurnT = t;
          bird.rotation.x = 0;
        }
      } else if (bird.userData.state === "perching") {
        // Idle head turn — looks left, then right, every 1.5s
        const turnPhase = (t - bird.userData.headTurnT) * 0.9;
        birdHead.rotation.y = Math.sin(turnPhase) * 0.6;
        // Tiny body bob — like real perched birds
        bird.position.y = -0.04 + Math.sin(t * 4) * 0.005;
        if (t > bird.userData.perchUntil) {
          // Fly away — pick a random exit
          bird.userData.state = "flying";
          bird.userData.flyT = 0;
          // Take off from where it is actually perched. These were literals
          // from the old room (perch x −2.75, glass z −6.1): the perch moved
          // with the window, so the bird teleported ~0.65 m sideways and
          // jumped in depth on every takeoff.
          bird.userData.flyFromX = bird.position.x;
          bird.userData.flyFromY = bird.position.y;
          bird.userData.flyToX = ROOM.x0 - 3.2 - Math.random() * 2;
          bird.userData.flyToY = 1.2 + Math.random() * 0.8;
          bird.userData.exit = true;
          bird.position.z = ROOM.z0 - 0.5;   // back behind the glass for the exit
        }
      }
      if (bird.userData.state === "flying" && bird.userData.exit && bird.userData.flyT >= 1) {
        bird.visible = false;
        bird.userData.state = "absent";
        bird.userData.exit = false;
        bird.userData.nextAppearAt = t + 25 + Math.random() * 35;
      }
      // Dog notices the bird when it's perching — head pitches up briefly
      if (bird.userData.state === "perching" && Math.random() < d * 0.3
          && (dogCtrl.state === "idle" || dogCtrl.state === "sit")) {
        if (!(dogCtrl._birdGaze > 0)) coachSignal("soundGlance");
        dogCtrl._birdGaze = 1.0;
      }
      if (dogCtrl._birdGaze && dogCtrl._birdGaze > 0) {
        // Decay the glance timer; the gaze-priority block above steers the
        // actual head/neck look-at to the bird while this is positive. (The
        // old version eased legacy headYaw/headPitch fields that no bone
        // math ever consumed — the dog never visibly noticed the bird.)
        dogCtrl._birdGaze -= d;
      }

      updateDogShadow();

      // ---- Dust motes drifting through the sunbeam ----
      // Each mote drifts down + sideways with a subtle sinusoidal sway,
      // re-spawning near the window when it settles below the floor. One
      // Points draw call; positions written straight into the buffer.
      // (Sway is per SECOND now — it was a fixed amount per frame, so the
      // motes drifted twice as far on a 120 Hz display.)
      const swayK = d * 60;
      for (let i = 0; i < dustData.length; i++) {
        const data = dustData[i];
        dustPos[i * 3]     += data.vx * d + Math.sin(t + data.phaseX) * 0.0012 * swayK;
        dustPos[i * 3 + 1] += data.vy * d;
        dustPos[i * 3 + 2] += data.vz * d + Math.cos(t + data.phaseY) * 0.0008 * swayK;
        if (dustPos[i * 3 + 1] < -0.95) spawnMote(i, false);
      }
      dustAttr.needsUpdate = true;
      sunbeam.userData.uTime.value = t;

      // ---- Dog autonomously drinks from the water bowl ----
      // Every 60-120 s the dog wanders to the bowl, lowers its head, and
      // "drinks" (jaw bobs). Then returns to its previous spot. The
      // user sees the dog living its own life — not just orbiting them.
      if (!dogCtrl._nextDrinkAt) dogCtrl._nextDrinkAt = t + 30 + Math.random() * 30;
      // A dog that OWES a follow (follow rung, player beyond the follow ring)
      // must not wander off on a 14-second drink errand instead — the lock
      // made it ignore a walking player completely, which read as broken AI.
      const followOwed = dogCtrl.followPlayer && controls
        && Math.hypot(controls.position.x - dog.position.x, controls.position.z - dog.position.z)
           > dogCtrl.followRadius + 0.6;
      if (t > dogCtrl._nextDrinkAt && dogCtrl.state === "idle"
          && intensity !== "barking" && fetchPhase === "idle"
          && !dogCtrl._drinkingState
          && !followOwed
          && !(dogCtrl._moveLockT > 0)) {
        dogCtrl._drinkingState = "approach";
        dogCtrl._drinkPrevState = dogCtrl.state;
        dogCtrl._drinkApproachUntil = t + 12;             // abort if it never arrives
        dogCtrl._drinkFollowSaved = dogCtrl.followPlayer;  // don't let follow drag it off
        dogCtrl.followPlayer = false;
        dogCtrl._moveLockT = 14;
        // The BOWL'S OWN position. These five references used to be the
        // literal (2.0, −1.3) the bowl was first authored at, but the bowl is
        // placed through dx()/dz(): dressSide mirrors it to the opposite wall
        // on half of all visits and the depth is jittered up to ±0.55 m every
        // time. So on half the visits the dog crossed the room to bare floor,
        // lowered its head and drank from nothing while the lapping audio
        // played out of an empty corner — and even on the correct side the
        // 0.4 m arrival test could never be met, so the errand aborted and
        // re-scheduled for the rest of the session.
        //
        // And the dog stands at the bowl, not ON it: walking its centre to the
        // bowl's centre planted the front paws in the water and put the mouth
        // half a body length past the rim. The spot is a muzzle's reach back
        // from the bowl, on whichever side the dog is coming from.
        {
          const parts = dog.userData.parts;
          const reach = ((parts && parts.mouth) ? parts.mouth.position.z : dogHeight * 0.6) * 0.85;
          const ux = dog.position.x - bowlX, uz = dog.position.z - bowlZ;
          const ul = Math.hypot(ux, uz) || 1;
          const spot = dogCtrl._resolve(bowlX + (ux / ul) * reach, bowlZ + (uz / ul) * reach, { ignorePlayer: true });
          dogCtrl._drinkSpot = { x: spot.x, z: spot.z };
          dogCtrl.walkTo(spot.x, spot.z, { force: true });
        }
      }
      const drinkSpot = dogCtrl._drinkSpot || { x: bowlX, z: bowlZ };
      // Abort the drink cleanly if the approach was interrupted (a pet/call
      // re-routed the dog, or it stalled) — otherwise _drinkingState sticks on
      // "approach" forever and the dog never drinks again for the session.
      if (dogCtrl._drinkingState === "approach"
          && ((dogCtrl.state === "idle" && Math.hypot(dog.position.x - drinkSpot.x, dog.position.z - drinkSpot.z) >= 0.3)
              || t > (dogCtrl._drinkApproachUntil || 0))) {
        dogCtrl._drinkingState = null;
        dogCtrl._nextDrinkAt = t + 30 + Math.random() * 30;
        // Release only the drink's OWN lock. The usual reason an approach
        // aborts is that something else took the dog (a throw, a call) and set
        // its own lock — zeroing it here let follow/wander yank the dog out of
        // the very fetch that interrupted the drink.
        if (fetchPhase === "idle" && !callGreetPending && !callWalkAt && !arcApproachTgt) dogCtrl._moveLockT = 0;
        if (dogCtrl._drinkFollowSaved != null) { dogCtrl.followPlayer = dogCtrl._drinkFollowSaved; dogCtrl._drinkFollowSaved = null; }
      }
      if (dogCtrl._drinkingState === "approach"
          && Math.hypot(dog.position.x - drinkSpot.x, dog.position.z - drinkSpot.z) < 0.3
          && dogCtrl.state === "idle") {
        dogCtrl._drinkingState = "drinking";
        dogCtrl._drinkUntil = t + 3.0;
        coachSignal("drink");
        // Real lapping — wet tongue flicks at ~3 Hz (the old version played
        // sniffs, i.e. the wrong bodily function).
        if (window.PhobiaAudio && window.PhobiaAudio.dogLapping) {
          try {
            dogCtrl._lapHandle = window.PhobiaAudio.dogLapping({ x: bowlX, y: -0.8, z: bowlZ }, 3.0);
            liveAudio.push(dogCtrl._lapHandle);
          } catch {}
        } else if (window.PhobiaAudio && window.PhobiaAudio.dogSniff) {
          for (let i = 0; i < 3; i++) {
            dogTimers.push(setTimeout(() => {
              try { window.PhobiaAudio.dogSniff(0.35, { x: bowlX, y: -0.8, z: bowlZ }); } catch {}
            }, i * 700));
          }
        }
      }
      if (dogCtrl._drinkingState === "drinking") {
        // Force head down + small jaw bob
        dogCtrl.headPitch = 0.7 + Math.sin(t * 8) * 0.05;
        // Square up to the bowl (slowly — the paws step round with it).
        dog.rotation.y = dogCtrl._easeYaw(dog.rotation.y,
          Math.atan2(bowlX - dog.position.x, bowlZ - dog.position.z), d * 3, 1.2 * d);
        if (t > dogCtrl._drinkUntil) {
          dogCtrl._drinkingState = null;
          dogCtrl._nextDrinkAt = t + 60 + Math.random() * 60;
          if (fetchPhase === "idle" && !callGreetPending && !callWalkAt && !arcApproachTgt) dogCtrl._moveLockT = 0;
          if (dogCtrl._drinkFollowSaved != null) { dogCtrl.followPlayer = dogCtrl._drinkFollowSaved; dogCtrl._drinkFollowSaved = null; }
          if (dogCtrl._lapHandle) {
            try { dogCtrl._lapHandle.stop(); } catch {}
            dogCtrl._lapHandle = null;
          }
        }
      }
      // Auto-lay-down after the dog has been sitting for >8 seconds AND the
      // user has built enough trust (>0.7). Real dogs sit when commanded,
      // get bored, then lay down. Once auto-laid, stays laid until the user
      // calls them or commands stand.
      // The companion sit is exempt: it is the beat where the dog has just
      // chosen to come and settle facing you, and folding it into a lie-down
      // eight seconds later throws that away.
      const companionHold = t < (dogCtrl._companionUntil || 0);
      if (dogCtrl.state === "sit" && trust > 0.7
          && (dogCtrl._sitTimer || 0) > 8 && !companionHold) {
        dogCtrl.lay();
      }
      // At ordinary trust the sit ends on its own instead: a dog that parks
      // in a sit forever (every fetch drop ends in one) reads frozen. After
      // ~18 s it gets up and rejoins its own life — wander/drink take over.
      // The completion beat's deliberate settle is exempt.
      if (dogCtrl.state === "sit" && trust <= 0.7 && (dogCtrl._sitTimer || 0) > 18
          && intensity !== "barking" && fetchPhase === "idle" && !_completedCalm
          && !companionHold) {
        dogCtrl.stand();
      }
      // ---- Auto-approach at high trust ----
      // Once the user has built up real trust (>0.5), the dog occasionally
      // walks closer on its own — the way a friendly dog wanders over to
      // someone they like. Only triggers when the dog is idle and not
      // already engaged in a fetch / walk. This is the strongest "the dog
      // chose me" signal short of full GLTF skinned animation.
      if (!autoApproachEnabled) {
        autoApproachEnabled = true;
        nextAutoApproach = t + 12 + Math.random() * 8;   // first chance ~15-20s in
      }
      // (Not mid-drink, not while another system holds the dog, and not while
      // it owes a follow — each of those used to be walked off by this.)
      if (trust > (B.autoApproachTrust ?? Infinity) && intensity !== "barking"
          && dogCtrl.state === "idle"
          && fetchPhase === "idle"
          && !dogCtrl._drinkingState && !(dogCtrl._moveLockT > 0) && !followOwed
          && t > nextAutoApproach) {
        const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
        const cx = pp.x, cz = pp.z;
        const dx = cx - dog.position.x, dz = cz - dog.position.z;
        const dist = Math.hypot(dx, dz);
        // Only approach if the dog is actually meaningfully far away
        if (dist > 1.6) {
          // Comfortable conversation distance, scaled by trust — but never
          // inside the body shells (old 0.6 m at trust=1 shoved into the player).
          const targetDist = Math.max(playerStandOffCenter(0.45), 1.4 - trust * 0.5);
          const k = Math.max(0, (dist - targetDist) / dist);
          dogCtrl._moveLockT = 8;
          dogCtrl.walkTo(dog.position.x + dx * k, dog.position.z + dz * k, { force: true });
          wanderSuppressUntil = t + 10;   // don't home-zone yank mid-greeting
          // Remember WHY it crossed the room, so the arrival can mean
          // something (see the companion beat below).
          dogCtrl._companionPending = true;
          dogCtrl._companionDeadline = t + 12;
          // (No "The dog is coming over to you." caption: you can see it.)
        }
        nextAutoApproach = t + 18 + Math.random() * 14;   // ~18-32s between attempts
      }

      // ---- The companion beat ----
      // The approach above walked the dog over to you and then left it
      // standing there, which is the least interesting thing an animal that
      // just chose to cross a room could do. The arrival is the moment: it
      // comes over, settles down facing you, and looks up. That — not fur, not
      // polygons — is what reads as "this one is here for me", and it is what
      // the whole realm has been climbing toward.
      //
      // It only fires off the back of a trust-driven approach, never from a
      // call or a fetch, so it stays something the dog decided rather than
      // something you commanded.
      // The promise only holds for the approach that set it. A call, a throw,
      // an approach that ended short of you, or one that simply ran long
      // retires it — otherwise a later, commanded arrival was announced as
      // "it came to you on its own".
      if (dogCtrl._companionPending && (fetchPhase !== "idle" || callGreetPending || callWalkAt
          || t > (dogCtrl._companionDeadline || 0))) {
        dogCtrl._companionPending = false;
      }
      if (dogCtrl._companionPending && dogCtrl.state === "idle"
          && fetchPhase === "idle" && intensity !== "barking") {
        const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
        const cd = Math.hypot(pp.x - dog.position.x, pp.z - dog.position.z);
        if (cd < 2.4) {
          dogCtrl._companionPending = false;
          dogCtrl.sit();
          // Hold the sit well past the ordinary boredom timers. A dog that
          // crosses a room to be near you and then stands up eight seconds
          // later undoes the thing it just said.
          dogCtrl._companionUntil = t + 26;
          // Soft, not fixed: the gaze system keeps its eyes on you at this
          // range, and the look-away still runs, so it stays a companion
          // watching you rather than a prop pointed at you.
          //
          // Deliberately NOT bumpTrust(): the player did not do anything here,
          // the dog did, and paying out trust for standing still would turn
          // waiting into a farming strategy. The moment is its own reward —
          // the heart and the line mark it, the number stays earned.
          try { popHeart(); } catch {}
          if (window.PhobiaVoice) {
            window.PhobiaVoice.speak(window.t("dogs.companion",
              "It came to you on its own, and sat down."));
          }
        } else if (!(dogCtrl._moveLockT > 0) && !dogCtrl.followTarget) {
          // Stopped short of you with nowhere left to go: the approach is over.
          dogCtrl._companionPending = false;
        }
      }

      // The load-in walk was FLAGGED as a sniff trip but the flag was never
      // consumed — the dog marched to the bed area and just stood there,
      // breaking the "busy with its own thing" premise. On arrival, sniff.
      if (dogCtrl._initialSniff && dogCtrl.state === "idle" && !sniffActive) {
        dogCtrl._initialSniff = false;
        sniffActive = true;
        sniffEndsAt = t + 3.5 + Math.random() * 1.5;
        coachSignal("sniff");
      }

      // ---- Autonomous wandering & sniffing ----
      // The dog has an "internal life" — it occasionally walks to a random
      // spot in the room as if interested in something. Sometimes that walk
      // turns into a sniff (head lowers, walk slows). This is the cumulative
      // signal that the dog is a creature, not a button-driven puppet.
      // No trust gate any more: this is the dog's own life, not a reward.
      // Gated behind trust > 0.2, a first-session dog (session cap 0.25)
      // sniffed once and then stood staring for the whole trial — and the
      // body language there is to read came from exactly these moments.
      if (nextWander === 0) nextWander = t + 8 + Math.random() * 6;
      if (intensity !== "barking"
          && !(B.startPose === "lay" && !esc.stood)
          && dogCtrl.state === "idle"
          && fetchPhase === "idle"
          && t > nextWander
          && t > wanderSuppressUntil
          && !followOwed
          && !(dogCtrl._moveLockT > 0)
          && !dogCtrl._drinkingState) {
        // Home-zone rungs putter near their spawn spot — "busy with its own
        // thing" stays true for the whole hold instead of the dog roaming
        // toward the player. Free rungs pick anywhere across the room.
        // Always resolve through colliders so wander never aims inside the bed.
        let rawX, rawZ;
        if (B.homeRadius) {
          const wa = Math.random() * Math.PI * 2, wr = Math.random() * B.homeRadius;
          rawX = homeAnchor.x + Math.cos(wa) * wr;
          rawZ = homeAnchor.z + Math.sin(wa) * wr;
        } else if (B.follow && controls) {
          // A dog that follows you putters AROUND you — a sniff a couple of
          // metres off, not a trek to the far wall and a gallop back (which
          // read as the big dog repeatedly charging you).
          const wa = Math.random() * Math.PI * 2;
          const wr = (B.followRadius ?? 1.5) + 0.4 + Math.random() * 1.0;
          rawX = controls.position.x + Math.cos(wa) * wr;
          rawZ = controls.position.z + Math.sin(wa) * wr;
        } else {
          rawX = (Math.random() - 0.5) * 4.0;
          rawZ = -2 - Math.random() * 4;
        }
        const settled = dogCtrl._resolve(rawX, rawZ);
        // Most trips are about a smell.
        if (Math.random() < 0.55) {
          sniffActive = true;
          sniffEndsAt = t + 3.0 + Math.random() * 2.0;
          coachSignal("sniff");
        }
        dogCtrl._moveLockT = 4;
        dogCtrl.walkTo(settled.x, settled.z, { force: true });
        nextWander = t + (12 + Math.random() * 13) / Math.max(0.6, temper.restless || 1);
      }
      // ---- Idle life: the small things dogs do ----
      // Between trips the dog used to stand and look at you until something
      // scripted happened. Real dogs sit, flop down, get up and shake off,
      // tilt their heads at a sound, stretch into a bow. Each of these is a
      // piece of body language worth reading, and together they are what
      // "busy with its own thing" looks like. Never mid-errand, never while
      // a system owns the dog, and never over the rung's own arc (the lying
      // husky on rung 3, the completion settle, the companion sit).
      {
        const readOpen = !!(coach.goalOpen && coach.goalOpen("read"));
        const busy = fetchPhase !== "idle" || callGreetPending || callWalkAt || arcApproachTgt
          || dogCtrl._companionPending || dogCtrl._drinkingState || sniffActive
          || (dogCtrl._moveLockT > 0) || petPulse > 0.05 || petRequestT > 0
          || t < (dogCtrl._companionUntil || 0) || (_completedCalm && !readOpen)
          || (B.startPose === "lay" && !esc.stood);
        if (!lifeNextAt) lifeNextAt = t + 9 + Math.random() * 5;
        // The loud rung has a life too once it has settled: lying still for
        // minutes left its read star with nothing to read (0/3, unearnable).
        const lifeOk = intensity !== "barking" || (barkState === "settling" && readOpen);
        if (lifeOk && dog.userData.ready && !busy && t > lifeNextAt
            && (dogCtrl.state === "idle" || dogCtrl.state === "sit" || dogCtrl.state === "lay")) {
          lifeNextAt = t + (7 + Math.random() * 8) / Math.max(0.6, temper.restless || 1);
          const r = Math.random();
          const near = lastPlayerDist < 4.5;
          const following = !!(dogCtrl.followPlayer && B.follow);
          if (dogCtrl.state === "lay") {
            if ((dogCtrl._restT || 0) > 14 || r < 0.4) {
              dogCtrl.stand();
              if (dogCtrl._shakePulse > 0) coachSignal("shake");
            }
          } else if (dogCtrl.state === "sit") {
            if (!following && r < 0.35) { dogCtrl.lay(); coachSignal("lie"); }
            else if ((dogCtrl._sitTimer || 0) > 6) dogCtrl.stand();
          } else if (r < 0.30) {
            dogCtrl.sit(); coachSignal("sit");
          } else if (r < 0.52 && lastPlayerDist < 7) {
            if (dogCtrl.headCock(0.9)) coachSignal("headTilt");
          } else if (r < 0.66 && near && dogCtrl.mood !== "aggressive" && startleT <= 0) {
            if (dogCtrl.playBow()) coachSignal("playBow");
          } else if (r < 0.76 && !following) {
            dogCtrl.lay(); coachSignal("lie");
          }
          // else: nothing. Dogs also just stand about.
        }
      }

      // Drive sniff: while active, force the head pitch DOWN as if sniffing
      // the floor. The DogController normally tracks the player; we override
      // by setting headPitch directly each frame. Audio sniffs fire at
      // ~0.7 s intervals while sniffing — the rapid breathy puffs are the
      // strongest "this is a real dog with a real nose" cue.
      if (sniffActive) {
        if (t > sniffEndsAt) {
          sniffActive = false;
        } else {
          // Gentle head bob like a real dog scanning a scent trail
          dogCtrl.headPitch = 0.55 + Math.sin(t * 5) * 0.08;
          // Sniff audio every ~0.8 s
          if (!dogCtrl._lastSniffAt || t - dogCtrl._lastSniffAt > 0.8) {
            if (window.PhobiaAudio && window.PhobiaAudio.dogSniff) {
              try {
                window.PhobiaAudio.dogSniff(0.55, {
                  x: dog.position.x,
                  y: dog.position.y + 0.4,
                  z: dog.position.z,
                });
              } catch {}
            }
            dogCtrl._lastSniffAt = t;
          }
        }
      }

      // ---- Heart particles ----
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i];
        h.userData.life -= d;
        h.position.x += h.userData.vx * d;
        h.position.y += h.userData.vy * d;
        h.material.opacity = Math.max(0, h.userData.life);
        if (h.userData.life <= 0) {
          scene.remove(h); h.material.dispose();
          hearts.splice(i, 1);
        }
      }

      // ---- Item physics + fetch state machine ----
      // A treat held out: the dog comes in and takes it.
      if (item && item.state === "offer") tickOffer(d, controls);
      // Windup phase: animate the item in the user's hand toward release
      if (item && item.state === "windup") {
        tickWindup(d);
        // The BALL in your hand is dog language: a trusting dog that spots
        // the windup answers with a play-bow — chest down, rump up, tail
        // going — the species-universal "throw it!". Once per windup, only
        // from a settled pose, and only when the bond has started (a wary
        // rung-3 dog watches; it doesn't beg).
        if (!bowedThisWindup && item.kind === "ball" && trust > 0.3
            && intensity !== "barking" && dogCtrl.mood !== "aggressive") {
          bowedThisWindup = true;
          if (dogCtrl.playBow()) {
            // Bump the scene-side smoother (the kinematics block re-writes
            // dogCtrl.excitement from it every frame).
            _excSm = Math.max(_excSm, 0.6);
            if (window.PhobiaAudio?.dogVocal) {
              try {
                window.PhobiaAudio.dogVocal("pant", 0.5, {
                  x: dog.position.x, y: dog.position.y + dogHeight * 0.6, z: dog.position.z,
                });
              } catch {}
            }
          }
        }
      } else {
        bowedThisWindup = false;
      }
      if (item && fetchPhase === "flying" && item.state === "flying") {
        const m = item.mesh;
        item.vel.y -= 9.8 * d;
        m.position.x += item.vel.x * d;
        m.position.y += item.vel.y * d;
        m.position.z += item.vel.z * d;
        // Rest height = floor top (-1) + item radius
        const floorY = item.kind === "ball" ? BALL_REST_Y : TREAT_REST_Y;
        const onGround = m.position.y <= floorY + 0.002;
        // Walls contain the throw — a hard lob at the skirting board comes
        // back off it instead of vanishing into the wall.
        const R = 0.10;
        if (m.position.x < ROOM.x0 + R) { m.position.x = ROOM.x0 + R; item.vel.x = Math.abs(item.vel.x) * 0.45; }
        if (m.position.x > ROOM.x1 - R) { m.position.x = ROOM.x1 - R; item.vel.x = -Math.abs(item.vel.x) * 0.45; }
        if (m.position.z < ROOM.z0 + R) { m.position.z = ROOM.z0 + R; item.vel.z = Math.abs(item.vel.z) * 0.45; }
        if (m.position.z > ROOM.z1 - R) { m.position.z = ROOM.z1 - R; item.vel.z = -Math.abs(item.vel.z) * 0.45; }
        // Roll about the axis perpendicular to travel — airborne it's a lazy
        // tumble, on the floor it's true rolling (angle = distance / radius),
        // which the stripe makes legible.
        const spd = Math.hypot(item.vel.x, item.vel.z);
        if (spd > 0.02) {
          _rollAxis.set(item.vel.z, 0, -item.vel.x).normalize();
          m.rotateOnWorldAxis(_rollAxis, (spd * d / FETCH_BALL_R) * (onGround ? 1 : 0.45));
        }
        if (m.position.y <= floorY) {
          m.position.y = floorY;
          if (item.kind === "ball" && item.bounces < 2 && Math.abs(item.vel.y) > 1.5) {
            // Ball bounces twice with energy loss — each impact audible
            if (window.PhobiaAudio?.ballBounce) {
              try { window.PhobiaAudio.ballBounce(Math.min(1, Math.abs(item.vel.y) / 6), { x: m.position.x, y: m.position.y, z: m.position.z }); } catch {}
            }
            item.vel.y = -item.vel.y * 0.55;
            item.vel.x *= 0.7; item.vel.z *= 0.7;
            item.bounces++;
          } else if (item.kind === "ball" && spd > 0.18) {
            // Roll-out: after the last bounce the ball rolls to a stop under
            // friction instead of freezing mid-motion.
            item.vel.y = 0;
            const f = Math.max(0, 1 - d * 2.2);
            item.vel.x *= f; item.vel.z *= f;
          } else {
            // Settled — a soft final tick for the ball, then the fetch leg
            if (item.kind === "ball" && window.PhobiaAudio?.ballBounce) {
              try { window.PhobiaAudio.ballBounce(0.15, { x: m.position.x, y: m.position.y, z: m.position.z }); } catch {}
            }
            item.vel.set(0, 0, 0);
            fetchPhase = "toItem";
            fetchToItemT = 0;
            fetchBestDist = Infinity;
            dogCtrl._moveLockT = 20;
            // The chase is the joy of fetch — sprint to the ball when it's a
            // real run, trot when it landed nearby. A long throw gets the
            // bounding launch leap first (Gallop_Jump), not a standing start.
            // The dog breaks OUT of its play-bow here: cut the bow overlay so
            // the chest-dip doesn't ride the gallop.
            dogCtrl._stretchPulse = 0;
            const chaseDist = Math.hypot(m.position.x - dog.position.x, m.position.z - dog.position.z);
            if (chaseDist > 2.2) {
              dogCtrl.gallopTo(m.position.x, m.position.z);
              if (chaseDist > 2.6 && item.kind === "ball") dogCtrl.jumpLaunch();
            } else dogCtrl.walkTo(m.position.x, m.position.z, { force: true });
          }
        }
      }
      if (fetchPhase === "toItem" && item && item.mesh.parent === scene) {
        // Stall guard: if the ball settled on/near a prop the dog can't reach,
        // nudge it along the floor toward the dog instead of teleporting —
        // keeps fetch believable while still unblocking soft-locks.
        // Measured as time WITHOUT PROGRESS: it used to be time since the
        // throw, so every ordinary chase past ~4 m (the gallop needs longer
        // than 2.4 s) saw the ball hop half a metre toward the dog on its own.
        fetchToItemT += d;
        const itemDx = dog.position.x - item.mesh.position.x;
        const itemDz = dog.position.z - item.mesh.position.z;
        const itemDist = Math.hypot(itemDx, itemDz);
        if (itemDist < fetchBestDist - 0.05) { fetchBestDist = itemDist; fetchToItemT = 0; }
        if ((fetchToItemT > 2.4 || (dogCtrl.state === "idle" && fetchToItemT > 1.0))
            && itemDist >= 0.5) {
          const nudge = Math.min(0.55, itemDist * 0.35);
          const nx = item.mesh.position.x + (itemDx / (itemDist || 1)) * nudge;
          const nz = item.mesh.position.z + (itemDz / (itemDist || 1)) * nudge;
          // Furniture/bounds only — including the player capsule made the ball
          // jump around the avatar when the dog was blocked nearby.
          const resolved = dogCtrl._resolve(nx, nz, { ignorePlayer: true });
          item.mesh.position.x = resolved.x;
          item.mesh.position.z = resolved.z;
          dogCtrl.walkTo(resolved.x, resolved.z, { force: true });
          fetchToItemT = 0.4;   // allow another nudge cycle if still blocked
          fetchBestDist = Infinity;
        }
        const dx = dog.position.x - item.mesh.position.x;
        const dz = dog.position.z - item.mesh.position.z;
        if (item.kind === "treat" && Math.hypot(dx, dz) < 0.5) {
          // A treat is eaten where it lands. It used to be picked up, carried
          // back and eaten at your feet — "share a treat" was secretly a
          // fetch game that ended with a big dog trotting straight at you.
          scene.remove(item.mesh);
          item.mesh.geometry.dispose(); item.mesh.material.dispose();
          item = null; fetchPhase = "idle";
          dogCtrl._moveLockT = 0;
          dogCtrl.stopMove();
          dogCtrl.eat();
          if (window.PhobiaAudio?.dogMouthGrab) {
            try { window.PhobiaAudio.dogMouthGrab({ x: dog.position.x, y: dog.position.y + dogHeight * 0.5, z: dog.position.z }); } catch {}
          }
          bumpTrust("treat", window.t("sc.d.bond", "Good. That builds the bond."));
          lifeNextAt = Math.max(lifeNextAt, t + 5);
          treatEaten(false);
        } else if (Math.hypot(dx, dz) < 0.5) {
          // Pick up — re-parent to the HEAD BONE, with an audible chomp.
          scene.remove(item.mesh);
          const carrier = dogHeadBone() || dog.userData.parts.jaw;
          carrier.add(item.mesh);
          if (window.PhobiaAudio?.dogMouthGrab) {
            try { window.PhobiaAudio.dogMouthGrab({ x: dog.position.x, y: dog.position.y + dogHeight * 0.8, z: dog.position.z }); } catch {}
          }
          // Seat it at the muzzle, expressed in the carrier's own space, and
          // undo whatever scale the carrier has accumulated so the ball keeps
          // its real-world size instead of inheriting the rig's.
          carrier.updateWorldMatrix(true, false);
          const seat = new THREE.Vector3();
          dog.userData.parts.mouth.getWorldPosition(seat);
          carrier.worldToLocal(seat);
          item.mesh.position.copy(seat);
          item.mesh.rotation.set(0, 0, 0);   // settle level in the mouth — no frozen mid-tumble pose
          const cs = new THREE.Vector3();
          carrier.getWorldScale(cs);
          item.mesh.scale.setScalar(1 / Math.max(1e-4, cs.x));
          if (item.mesh.userData.baseScale) item.mesh.scale.multiply(item.mesh.userData.baseScale);
          fetchPhase = "carrying";
          dogCtrl._moveLockT = 20;
          dogTimers.push(setTimeout(() => {
            if (fetchPhase !== "carrying" || dog.userData.disposed) return;
            const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
            returnTgt.x = pp.x; returnTgt.z = pp.z;
            returnT = 0;
            fetchFrom.x = pp.x; fetchFrom.z = pp.z;
            walkToPlayer(0.55);
            dogCtrl._moveLockT = 20;
            fetchPhase = "returning";
            // A large animal running straight at you is fear-relevant even
            // when it's a game.
            coach.pulse(0.2, "run", lastPlayerDist);
          }, 250));
        }
      }
      if (fetchPhase === "returning" && item) {
        const pp = (storedActiveControls && storedActiveControls.position) || camera.position;
        const dx = dog.position.x - pp.x;
        const dz = dog.position.z - pp.z;
        const distToPlayer = Math.hypot(dx, dz);
        returnT += d;
        // Deliver threshold MUST match walkToPlayer's center stand-off —
        // the old raw 1.4 m check was inside the ~1.7 m stop distance, so
        // the dog arrived, idled, re-issued walk forever, then gave up at 8 s.
        const deliverDist = playerStandOffCenter(0.55) + 0.20;
        const giveUp = returnT > 8;
        // ---- The show-off beat ----
        // A dog that ran down a ball doesn't hand it over like a vending
        // machine: it arrives, plants, and parades the prize for a beat —
        // head up at you, tail going — THEN drops it. The pause is also the
        // moment the "good dog!" lands, which is the whole point of fetch.
        if (item.kind === "ball" && !giveUp && distToPlayer < deliverDist && !ballShowUntil) {
          ballShowUntil = t + 1.15;
          dogCtrl.stopMove();
          dogCtrl.greet(1.1);
          dogCtrl.tailWag += 5;
        }
        if (ballShowUntil && t < ballShowUntil && distToPlayer < deliverDist + 0.6) {
          // Hold the pose, prize on display, eyes on you.
          dogCtrl.lookAt3({ x: pp.x, y: pp.y, z: pp.z }, 1);
        } else if (distToPlayer < deliverDist || giveUp) {
          ballShowUntil = 0;
          // Release from whichever node is actually holding it — the head bone
          // when one was found at pickup, the legacy anchor otherwise.
          const world = new THREE.Vector3();
          item.mesh.getWorldPosition(world);
          if (item.mesh.parent) item.mesh.parent.remove(item.mesh);
          scene.add(item.mesh);
          item.mesh.scale.setScalar(1);
          if (item.mesh.userData.baseScale) item.mesh.scale.copy(item.mesh.userData.baseScale);
          // Dropped from the mouth, a little ahead along the dog's own facing
          // (the old fixed world +z offset put it under the dog about half
          // the time).
          item.mesh.position.set(world.x + Math.sin(dog.rotation.y) * 0.08,
            item.kind === "ball" ? BALL_REST_Y : TREAT_REST_Y, world.z + Math.cos(dog.rotation.y) * 0.08);
          fetchPhase = "dropped";
          dogCtrl._moveLockT = 0;
          dogCtrl.sit();
          // These timers act on THIS item only. They used to check just
          // `if (item)`, so a second throw inside the window had its fresh
          // ball — still in the hand, or already in the air — deleted, and the
          // dog "ate" it.
          const droppedItem = item;
          // If it was a treat, the dog "eats" it (mesh disappears)
          if (item.kind === "treat") {
            dogTimers.push(setTimeout(() => {
              if (item && item === droppedItem && fetchPhase === "dropped") {
                scene.remove(item.mesh);
                item.mesh.geometry.dispose(); item.mesh.material.dispose();
                item = null; fetchPhase = "idle";
                dogCtrl.eat();
              }
            }, 600));
            // The bond reward is for completing the exchange — a give-up
            // drop still eats the treat but earns nothing.
            if (!giveUp) bumpTrust("treat", window.t("sc.d.bond", "Good. That builds the bond."));
          } else {
            // Ball stays; user can throw again
            if (!giveUp) bumpTrust("fetch", window.t("sc.d.goodFetch", "Good fetch."));
            // It ran the ball straight back at you, and you were still there.
            if (!giveUp && levelIdx === 3 && Math.hypot(pp.x - fetchFrom.x, pp.z - fetchFrom.z) < 1.0) coach.goalDone("fetchStay");
            dogTimers.push(setTimeout(() => {
              if (item && item === droppedItem && fetchPhase === "dropped") {
                scene.remove(item.mesh);
                item.mesh.geometry.dispose(); item.mesh.material.dispose();
                item = null; fetchPhase = "idle";
              }
            }, 4000));
          }
        } else if (Math.hypot(pp.x - returnTgt.x, pp.z - returnTgt.z) > 0.6
            || (dogCtrl.state === "idle" && distToPlayer > deliverDist)) {
          // The return leg tracks the player LIVE: re-aim whenever they've
          // moved off the captured target (or the dog arrived at a stale spot
          // and idled). The old one-shot target left the dog frozen mid-room
          // holding the ball whenever the player kept walking.
          ballShowUntil = 0;   // player moved mid-show-off: skip the parade
          returnTgt.x = pp.x; returnTgt.z = pp.z;
          walkToPlayer(0.55);
        }
      }

      // ---- Pet pulse → trust gain (passive over time when very close) ----
      // Accrues from time with the hand on the dog (one grant per 2.5 s of
      // contact) rather than a per-frame dice roll: the roll fired 2.5×/s
      // for as long as clicks kept the pulse up. bumpTrust's passive curve
      // tapers and sub-caps it on top.
      if (petPulse > 0.5) {
        passiveContactT += d;
        if (passiveContactT >= 2.5) { passiveContactT = 0; bumpTrust("passive"); }
      }

      // ---- Bark scheduling (mood-aware) ----
      // Trust may soften AMBIENT menace slightly but NEVER the climax
      // stimulus. The old trustQuiet (up to −70% volume + charge gaps
      // stretched ÷0.3) meant the most diligent user got the weakest climax —
      // the fear ramp inverted with playtime. Kept only for calm/alert
      // ambience, capped, with a separate hard-capped patience stretch.
      const trustQuiet  = 1 - Math.min(0.25, trust * 0.25);   // ≥0.75, ambient only
      // Bark from the dog's actual world position (HRTF panning) with a
      // directional cone matching the dog's facing direction — so a bark
      // from a dog turned away from you sounds muffled, and a bark with
      // the dog locked on you is sharp and clear.
      const dogYaw = dog.rotation.y;
      const dogPos = { x: dog.position.x, y: dog.position.y + 0.7, z: dog.position.z };
      // Forward at yaw=0 is +z (snout); rotation by yaw θ → (sin θ, 0, cos θ)
      const dogForward = { x: Math.sin(dogYaw), y: 0, z: Math.cos(dogYaw) };
      const barkOpts = { forward: dogForward, coneInnerAngle: 80, coneOuterAngle: 220, coneOuterGain: 0.30 };
      // ---- Diegetic completion beat ----
      // When the hold completes, the WORLD acknowledges it before the UI
      // does: the calm dog settles into a sit beside you; the barking dog
      // softens, returns to its corner, and stops warning. This is the
      // disconfirming evidence, staged.
      if (window.__rungHoldComplete && !completionBeatDone) {
        // Only tick "settles" when it did — the hold can also end on the
        // long-stay fallback, and the card mustn't claim otherwise.
        if (coach.everSettled) coach.goalDone("settle");
        if (intensity !== "barking") {
          completionBeatDone = true; _completedCalm = true;
          // Never sit a dog mid-chase or mid-carry (it used to check only
          // "not walking", so a galloping fetch dog was sat in mid-stride).
          dogTimers.push(setTimeout(() => {
            try {
              if (dogCtrl.state !== "walking" && dogCtrl.state !== "galloping" && fetchPhase === "idle") dogCtrl.sit();
            } catch {}
          }, 500));
        } else if (barkState !== "bounding" && barkState !== "warning") {
          // Rung 5: he has run out of steam. The machine walks him to his
          // settle spot (near you, if you stayed near) next frame.
          completionBeatDone = true; _completedCalm = true;
          kExcite = 0;
          if (barkState !== "settling") { barkState = "watching"; barkStateT = 0; }
        }
        // Play time. The hold is done and the dog has settled — the part
        // most players never found (the ball and the treat live in a
        // collapsed bar). Offered once, never required: playing with the dog
        // you were afraid of is the natural next rep, and it builds the bond.
        // (Not on the loud rung: it takes no commands but "stand", so the
        // offer named keys that did nothing.)
        if (completionBeatDone && !playInvited && intensity !== "barking") {
          playInvited = true;
          dogTimers.push(setTimeout(() => {
            try {
              coach.teach("play", IS_COARSE_POINTER
                ? window.tf("dc.tPlayM", "<b>Want to play?</b> Tap ⚪ to toss {dog} the ball, or 🦴 for a treat — play builds your bond ♥. Continue whenever you like.", { dog: dogName })
                : window.tf("dc.tPlay", "<b>Want to play?</b> Press <b>B</b> to toss {dog} the ball, or <b>T</b> for a treat — play builds your bond ♥. Continue whenever you like.", { dog: dogName }), 9000);
              const bar = document.querySelector("#stage .scene-cmd-bar, .scene-cmd-bar");
              const tg = document.querySelector(".cmd-toggle");
              if (bar && bar.classList.contains("collapsed") && tg) tg.click();
            } catch {}
          }, 3200));
        }
      }

      // ---- Rung 5: the big, loud, EXCITED dog ----
      // This rung used to be a dog in genuine warning display — pinned ears,
      // growls — whose "coping loop" settled only when you stepped back or
      // looked away, with praise for it. That is escape → relief → reward,
      // the exact loop that keeps a phobia alive, taught as the final lesson;
      // and it confirmed the belief exposure exists to test: bark = attack.
      //
      // What people afraid of dogs actually meet, and dread, is a big dog
      // that is LOUD and bouncy and runs at them — and is friendly. So that
      // is the top rung now. Koda barks in excited bursts, bounds over and
      // always stops short, play-bows, trots off, and slowly runs out of
      // steam; he tires fastest when you are boring (still), slower when you
      // move a lot. Nothing you do "manages" him — the prediction simply
      // fails. A real warning (stiffen, stare, growl) appears only if you
      // rush him or stare him down up close, and it is taught as reading a
      // dog correctly: pause, soften, give him a moment — never "leave".
      if (intensity === "barking" && dog.userData.ready) {
        barkStateT += d;
        const ppl = (controls && controls.position) || camera.position;
        const dxp = ppl.x - dog.position.x;
        const dzp = ppl.z - dog.position.z;
        const distP = Math.hypot(dxp, dzp) || 0.0001;
        const dirToDog = Math.atan2(dxp, dzp);
        const gazeAlign = controls ? Math.max(0, 1 - angleGap(controls.yaw, dirToDog) / 1.0) : 0;
        lastGazeAlign = gazeAlign;
        // Player velocity toward the dog (+ = closing in), smoothed.
        if (kPrev.t) {
          const idt = 1 / Math.max(0.001, d);
          const vx = (ppl.x - kPrev.x) * idt, vz = (ppl.z - kPrev.z) * idt;
          const closing = -(vx * dxp + vz * dzp) / distP;
          kClosing += ((isFinite(closing) && Math.abs(closing) < 12 ? closing : 0) - kClosing) * Math.min(1, d * 6);
        }
        kPrev.x = ppl.x; kPrev.z = ppl.z; kPrev.t = t;
        const pos = { x: dog.position.x, y: dog.position.y + 0.7, z: dog.position.z };
        const bark = (n, vol) => {
          dogCtrl.barkBurst(n, 0.2);
          if (window.PhobiaAudio?.dogVocal) {
            window.PhobiaAudio.dogVocal(Math.random() < 0.3 ? "woof" : "bark", vol, pos, Object.assign({
              f0: dogF0 * 1.08, count: n, gap: 0.2, air: true, reverb: 0.22,
            }, barkOpts));
          } else if (window.PhobiaAudio) {
            window.PhobiaAudio.bark(vol, pos, barkOpts);
          }
          coach.pulse(0.34, "bark", distP);
          bodyJolt(0.3);
          dogExertion = Math.min(1, dogExertion + 0.2);
          warningBarkCount++;
          if (!kBarkWatch) kBarkWatch = { t, dist: distP };
        };
        // "Stayed through a bark": still there four seconds later.
        if (kBarkWatch && t - kBarkWatch.t > 4) {
          if (distP < kBarkWatch.dist + 0.8 && kBarkWatch.dist < zoneM + 0.5) {
            try { window.PhobiaExperiments && window.PhobiaExperiments.signal("dog.barkEndured"); } catch {}
          }
          kBarkWatch = null;
        }

        // Excitement drains on its own, fastest when you are still ("be a
        // tree" is real advice for excited dogs), slowest when you bustle.
        if (!completionBeatDone && barkState !== "warning") {
          const still = coachPlayerSpeed < 0.25;
          const brisk = coachPlayerSpeed > 0.9;
          kExcite = Math.max(0, kExcite - d * 0.0115 * (still && distP < 6.5 ? 2.0 : 1) * (brisk ? 0.45 : 1));
        }
        if (completionBeatDone) kExcite = 0;
        dogCtrl.excitement = barkState === "settling" ? 0.15 : 0.35 + kExcite * 0.65;
        dogCtrl.aggression = barkState === "warning" ? 0.55 : 0.04;
        dogCtrl.coil = barkState === "warning" ? 0.22 : 0;
        dogCtrl.walkSpeed = baseWalkSpeed * (barkState === "settling" ? 1 : 1.15);
        dogCtrl.lookAt3({ x: ppl.x, y: ppl.y, z: ppl.z },
          barkState === "settling" ? 0.4 : barkState === "retreating" ? 0.3 : 0.85);

        // A real warning — only when provoked: rushing him up close, or a
        // long hard stare at arm's length. Never on a cooldown the player
        // can't see, never twice in quick succession.
        // The player must be the one pressing in (closing on him within the
        // last few seconds): a still player where a run-over left him at
        // arm's length did exactly what the rung asks, and gets no growl.
        kPressT = kClosing > 0.3 ? 4 : Math.max(0, kPressT - d);
        if (barkState !== "warning" && barkState !== "settling" && barkState !== "bounding" && barkState !== "greeting" && !completionBeatDone) {
          const pressing = kPressT > 0 && t - kLastRunAt > 5;
          kStareT = (pressing && gazeAlign > 0.85 && distP < 1.9) ? kStareT + d : Math.max(0, kStareT - d * 2);
          const rushed = kClosing > 1.05 && distP < 2.6;
          if ((rushed || kStareT > 2.6) && t > kWarnCD) {
            barkState = "warning"; barkStateT = 0;
            kWarnCD = t + 20; kStareT = 0;
            dogCtrl.stopMove();
            dogCtrl.setMood("alert");
            dogCtrl.growlPulse(1.4);
            if (window.PhobiaAudio?.dogVocal) {
              window.PhobiaAudio.dogVocal("growl", 0.5, pos, { dur: 1.1, reverb: 0.18 });
            } else if (window.PhobiaAudio?.growl) {
              window.PhobiaAudio.growl(0.5, pos, 1.1);
            }
            coach.pulse(0.3, "growl", distP);
            const read = coachSignal("warning");
            if (!read && window.PhobiaFX?.contextPrompt) {
              window.PhobiaFX.contextPrompt(window.tf("dc.warnPrompt",
                "{dog} stiffened and growled — a warning. Pause and soften your eyes. Growls are how dogs avoid biting.", { dog: dogName }), 5000);
            }
          }
        }

        if (barkState === "warning") {
          // Resolves when you give it a beat: stop, ease back a step, or
          // soften your eyes — or after a few seconds regardless. Dogs don't
          // hold grudges; they reset.
          const eased = coachPlayerSpeed < 0.2 || kClosing < -0.3 || gazeAlign < 0.6;
          if ((barkStateT > 1.4 && eased) || barkStateT > 4.2) {
            barkState = "watching"; barkStateT = 0;
            dogCtrl.setMood("excited");
            dogCtrl._shakePulse = 1;           // the shake-off: tension over
            kExcite = Math.max(0.2, kExcite - 0.1);
            nextBarkAt = t + 3 + Math.random() * 2;
            if (!warnResolvedTold && window.PhobiaFX?.contextPrompt) {
              warnResolvedTold = true;
              window.PhobiaFX.contextPrompt(window.tf("dc.warnDone",
                "He shook it off — over. You read a warning and gave it a moment. That's all a warning ever asks.", { dog: dogName }), 4800);
            }
          }
        } else if (barkState === "watching") {
          // Too close for a bouncy dog? Bounce out to play distance.
          if (distP < 1.35 && dogCtrl.state !== "walking" && dogCtrl.state !== "galloping") {
            const away = Math.atan2(-dxp, -dzp);
            const r = dogCtrl._resolve(ppl.x + Math.sin(away) * 1.9, ppl.z + Math.cos(away) * 1.9);
            dogCtrl.walkTo(r.x, r.z, { force: true });
          }
          if (kExcite < 0.2 || completionBeatDone) {
            barkState = "settling"; barkStateT = 0;
            dogCtrl.setMood("relaxed");
            // Settle NEAR you if you stayed near — the payoff of the rung.
            let sx = barkAnchor.x, sz = barkAnchor.z;
            if (distP < 5.5) {
              const k = Math.max(0, (distP - 2.0) / distP);
              sx = dog.position.x + dxp * k; sz = dog.position.z + dzp * k;
            }
            const sp = dogCtrl._resolve(sx, sz);
            dogCtrl.walkTo(sp.x, sp.z, { force: true });
            dogCtrl._moveLockT = 4;
            dogCtrl.tailWag += 4;
          } else if (t > nextBarkAt) {
            // The first run waits until you've come into the room (or a good
            // while has passed): a charge in the first second, under the
            // countdown, is an ambush, not an exposure.
            const inRoom = (distP < 6.5 && t > 7) || t > 22;
            const canBound = inRoom && distP > 2.0 && distP < 9 && kRuns < 4 && t - kLastRunAt > 8 && kExcite > 0.3;
            if (canBound && (kRuns === 0 || Math.random() < 0.55)) {
              // Bound over — and stop short. From across the room the stop
              // point is on the line from you to him, 1.7–2.1 m out, with a
              // little swing. If you're already standing close, he bounds
              // PAST you instead, to a spot at play distance off your side —
              // so the bravest players still get the moment the rung is for.
              const stopD = 1.7 + Math.random() * 0.4;
              const px = -dzp / distP, pz = dxp / distP;
              let bt;
              if (distP > 2.7) {
                const k = Math.max(0, (distP - stopD) / distP);
                const side = (Math.random() < 0.5 ? -1 : 1) * 0.35;
                bt = dogCtrl._resolve(dog.position.x + dxp * k + px * side, dog.position.z + dzp * k + pz * side);
              } else {
                const a = dogCtrl._resolve(ppl.x + px * stopD, ppl.z + pz * stopD);
                const b = dogCtrl._resolve(ppl.x - px * stopD, ppl.z - pz * stopD);
                const da = Math.hypot(a.x - dog.position.x, a.z - dog.position.z);
                const db = Math.hypot(b.x - dog.position.x, b.z - dog.position.z);
                bt = (Math.hypot(a.x - ppl.x, a.z - ppl.z) >= 1.5 && (da >= db || Math.hypot(b.x - ppl.x, b.z - ppl.z) < 1.5)) ? a : b;
              }
              if (Math.hypot(bt.x - ppl.x, bt.z - ppl.z) >= 1.5 && Math.hypot(bt.x - dog.position.x, bt.z - dog.position.z) > 1.4) {
                barkState = "bounding"; barkStateT = 0;
                kRuns++; kLastRunAt = t;
                dogCtrl._moveLockT = 0;
                dogCtrl.gallopTo(bt.x, bt.z);
                if (Math.random() < 0.5) dogCtrl.jumpLaunch();
                bark(1 + Math.floor(Math.random() * 2), 0.55 + 0.3 * kExcite);
                coach.pulse(0.3, "run", distP);
                coach.note("run");
                coachSignal("runOver");
              } else {
                bark(1 + Math.floor(kExcite * 2.5), 0.45 + 0.4 * kExcite);
              }
            } else {
              bark(1 + Math.floor(kExcite * 2.5 + Math.random()), 0.45 + 0.4 * kExcite);
              dogCtrl.rear(0.25 * kExcite);
              dogCtrl.tailWag += 6;
              if (!coachSignal("excitedBark") && Math.random() < 0.35) {
                dogTimers.push(setTimeout(() => { try { if (!dog.userData.disposed && dogCtrl.playBow()) coachSignal("playBow"); } catch {} }, 700));
              }
              // Little zoomie: a quick swing to another spot in his patch.
              if (Math.random() < 0.35 * kExcite && dogCtrl.state !== "walking") {
                const a = Math.random() * Math.PI * 2, rr = 0.6 + Math.random() * (B.homeRadius || 1.1);
                const z = dogCtrl._resolve(barkAnchor.x + Math.cos(a) * rr, barkAnchor.z + Math.sin(a) * rr);
                if (Math.hypot(z.x - ppl.x, z.z - ppl.z) > 1.7) dogCtrl.gallopTo(z.x, z.z);
              }
            }
            nextBarkAt = t + (2.4 + Math.random() * 2.6) / (0.45 + kExcite);
          }
        } else if (barkState === "bounding") {
          const moving = dogCtrl.state === "walking" || dogCtrl.state === "galloping";
          if ((!moving && barkStateT > 0.4) || barkStateT > 4.5 || distP < 1.45) {
            if (moving) dogCtrl.stopMove();
            barkState = "greeting"; barkStateT = 0;
            kArrive = { t, dist: distP };
            bark(2, 0.5 + 0.3 * kExcite);
            dogCtrl.tailWag += 8;
            dogTimers.push(setTimeout(() => { try { if (!dog.userData.disposed) dogCtrl.playBow(); } catch {} }, 450));
            kGreetFor = 1.4 + Math.random() * 1.0;
          }
        } else if (barkState === "greeting") {
          if (barkStateT > kGreetFor) {
            if (kExcite < 0.28 || completionBeatDone) {
              barkState = "watching"; barkStateT = 0;   // → settles next frame
            } else {
              // Trot back to his patch on a loose arc — zoomies, not a retreat.
              barkState = "retreating"; barkStateT = 0;
              const a = Math.random() * Math.PI * 2, rr = Math.random() * (B.homeRadius || 1.1);
              const home = dogCtrl._resolve(barkAnchor.x + Math.cos(a) * rr, barkAnchor.z + Math.sin(a) * rr);
              if (Math.hypot(home.x - dog.position.x, home.z - dog.position.z) > 2.4) dogCtrl.gallopTo(home.x, home.z);
              else dogCtrl.walkTo(home.x, home.z, { force: true });
            }
          }
        } else if (barkState === "retreating") {
          const moving = dogCtrl.state === "walking" || dogCtrl.state === "galloping";
          if ((!moving && barkStateT > 0.4) || barkStateT > 5) {
            barkState = "watching"; barkStateT = 0;
            nextBarkAt = Math.max(nextBarkAt, t + 1.5);
          }
        } else if (barkState === "settling") {
          // Tired out: sit, then flop down. Petting is allowed now — only if
          // the player wants it.
          const moving = dogCtrl.state === "walking" || dogCtrl.state === "galloping";
          if (!moving && dogCtrl.state === "idle" && barkStateT > 0.5) { dogCtrl.sit(); coachSignal("sit"); }
          if (dogCtrl.state === "sit" && barkStateT > 7 && !kLay) { kLay = true; dogCtrl.lay(); coachSignal("lie"); }
          if (!kSettleTold && barkStateT > 1.5 && window.PhobiaFX?.contextPrompt) {
            kSettleTold = true;
            window.PhobiaFX.contextPrompt(window.tf("dc.kodaTired",
              "{dog} has run out of steam. All that noise — and this is where it ends: a tired, friendly dog.", { dog: dogName }), 5200);
          }
        }
        // Held your ground through a run-over (the rung's skill goal).
        if (kArrive && t - kArrive.t > 3) {
          if (distP < kArrive.dist + 1.0) coach.goalDone("runHeld");
          kArrive = null;
        }
        // Live threat handoff (avatar eye-lock, startle beats): the charge
        // and a real warning are the only threatening moments now.
        {
          const threatening = !completionBeatDone && (barkState === "bounding" || barkState === "warning");
          if (threatening) {
            const hb = dogHeadBone();
            if (hb) {
              hb.getWorldPosition(_threatV);
              threatPos.x = _threatV.x; threatPos.y = _threatV.y; threatPos.z = _threatV.z;
            } else {
              threatPos.x = dog.position.x; threatPos.y = dog.position.y + dogHeight * 0.8; threatPos.z = dog.position.z;
            }
            window.PhobiaThreat = threatPos;
          } else if (window.PhobiaThreat === threatPos) {
            window.PhobiaThreat = null;
          }
        }
        // Observability for scene-verification hooks.
        dog.userData.barkState = barkState;
        dog.userData.lungeState = barkState; // legacy alias for older hooks
        dog.userData.barkDebug = {
          t: +t.toFixed(2), barkStateT: +barkStateT.toFixed(2), nextBarkAt: +nextBarkAt.toFixed(2),
          distP: +distP.toFixed(2), excite: +kExcite.toFixed(2), runs: kRuns, closing: +kClosing.toFixed(2),
          barks: warningBarkCount,
        };
      }
      // ---- Within-rung escalation arc + data-driven spontaneous barks ----
      // Rung 3: starts lying → stands at ~20 s (or when you close to 3 m) →
      // first bark ~16 s (or at 2.2 m) → barks every 14-24 s. Rung 4: first
      // bark at 12 s, every 8-14 s, easing off ×1.6 after the 35 s settle
      // beat. Barks are procedural head-tosses (barkSmall) — the Attack clip
      // is unused on the controlled barking rung.
      if (intensity !== "barking") {
        if (!esc.t0) esc.t0 = t;
        const elapsed = t - esc.t0;
        const pd = controls
          ? Math.hypot(controls.position.x - dog.position.x, controls.position.z - dog.position.z) : 99;
        // Rung-3 start pose: applied once the model is ready.
        if (B.startPose === "lay" && !startPoseApplied && dog.userData.ready) {
          startPoseApplied = true;
          dogCtrl.lay();
        }
        // Tension from a startle (0.42) used to stick for the whole session —
        // pinned ears and a cold room long after the moment had passed. It
        // eases off over ~15 s now; the rung floors below still apply.
        if (!completionBeatDone) dogCtrl.aggression = Math.max(0, (dogCtrl.aggression || 0) - d * 0.03);
        // Rung-3 rise: the lying dog gets up — time- or approach-triggered.
        if (B.startPose === "lay" && startPoseApplied && !esc.stood
            && (elapsed > (B.standAt ?? 20) || pd < (B.standDist ?? 3.0))) {
          esc.stood = true;
          esc.stoodAt = t;
          dogCtrl.stand();
          dogCtrl.aggression = 0.25;
          coach.pulse(0.30, "stand", pd);
          const stoodRead = coachSignal("alertWatch");
          if (!stoodRead && window.PhobiaFX?.contextPrompt) {
            window.PhobiaFX.contextPrompt(window.tf("dc.stood", "{dog} is up — ears up, watching you. Alert isn't attack. Stay, and see what it does.", { dog: dogName }), 4200);
          }
        }
        // Rung-4 pressure baseline + settle beat (within-hold habituation).
        if (B.settleAfter) {
          if (!esc.settled) dogCtrl.aggression = Math.max(dogCtrl.aggression, 0.35);
          if (!esc.settled && elapsed > B.settleAfter && pd < 3.0) {
            esc.settled = true;
            dogCtrl.aggression = 0.15;
            dogCtrl.tailWag += 3;
            if (window.PhobiaFX?.contextPrompt) window.PhobiaFX.contextPrompt(window.tf("sc.d.easing", "{dog} is easing off. You stayed — it settled.", { dog: dogName }), 4000);
          }
        }
        // Spontaneous barks: gated on the arc, parameterized per rung. The
        // stood dog gets a few seconds on its feet before its first bark (it
        // used to bark the same frame it stood), and a settled trial is a
        // quiet one — barks after the completion beat undid the lesson.
        const barkReady = Array.isArray(B.barkEvery) && (!B.startPose || (esc.stood && t - (esc.stoodAt || 0) > 4))
          && !completionBeatDone;
        if (barkReady && nextSpontaneousBark === Infinity
            && (elapsed > (B.firstBarkAt ?? 10) || (B.barkDist && pd < B.barkDist))) {
          nextSpontaneousBark = t;
        }
        if (barkReady && t > nextSpontaneousBark) {
          dogCtrl.barkSmall();
          if (window.PhobiaAudio && window.PhobiaAudio.dogVocal) {
            window.PhobiaAudio.dogVocal("bark", 0.7 * trustQuiet, dogPos, Object.assign({
              f0: dogF0, count: 1 + Math.floor(Math.random() * 3), gap: 0.18, air: true, reverb: 0.25,
            }, barkOpts));
          } else if (window.PhobiaAudio) {
            window.PhobiaAudio.bark(0.7 * trustQuiet, dogPos, barkOpts);
          }
          coach.pulse(0.38, "bark", pd);
          coachSignal("alertBark");
          bodyJolt(0.5);
          barkAt = t; barkDistSnap = pd;
          const stretch = (1 + Math.min(0.6, trust * 0.6)) * (esc.settled ? 1.6 : 1);
          nextSpontaneousBark = t + (B.barkEvery[0] + Math.random() * (B.barkEvery[1] - B.barkEvery[0])) * stretch;
        }
        // "Bark weathered": it barked, you were close, and you stayed.
        if (barkAt && t - barkAt > 4) {
          const held = pd < barkDistSnap + 0.8 && pd < 3.5;
          if (held) {
            if (barkDistSnap < zoneM + 0.5) coach.goalDone("barkHeld");
            try { window.PhobiaExperiments && window.PhobiaExperiments.signal("dog.barkEndured"); } catch {}
            if (window.PhobiaFX?.achievement) {
              window.PhobiaFX.achievement("dogs.barkHeld", "🐕", window.t("ach.barkHeld", "Bark weathered"), window.t("ach.barkHeldP", "It barked. You stayed."));
            }
          }
          barkAt = 0;
        }
      }
    },
    dispose() {
      // Clean up listeners + HUD when the scene unmounts
      try { window.removeEventListener("keydown", onKey); } catch {}
      try { if (window.PhobiaThreat === threatPos) window.PhobiaThreat = null; } catch {}
      // The trial's evidence outlives the scene: the rate and complete
      // screens compare it with the player's own prediction.
      try { window.__lastTrialEvidence = Object.assign(coach.evidence(), { phobia: "dogs", level: levelIdx, ts: Date.now() }); } catch {}
      try { coach.dispose(); } catch {}
      try { if (dogsControls && dogsControls.tpSubject === coachSubj) dogsControls.tpSubject = null; } catch {}
      try { if (window.PhobiaFear && window.PhobiaFear.setDirect) window.PhobiaFear.setDirect(null); } catch {}
      try { if (window.__holdPolicy === coach.holdPolicy) window.__holdPolicy = null; } catch {}
      try { if (window.__dogCoach === coach) window.__dogCoach = null; } catch {}
      try { if (window.__coach === coach) window.__coach = null; } catch {}
      const stage = document.getElementById("stage");
      if (stage) {
        const hud = stage.querySelector(".trust-hud");
        if (hud) hud.remove();
      }
      // Cancel any pending setTimeouts so they don't fire against the disposed dog
      try { dogTimers.forEach(id => clearTimeout(id)); } catch {}
      // Flag the dog so a still-in-flight model load doesn't attach to a torn-
      // down scene, and stop the mixer so no animation callbacks linger.
      try { dog.userData.disposed = true; } catch {}
      try { if (dog.userData.parts && dog.userData.parts.mixer) dog.userData.parts.mixer.stopAllAction(); } catch {}
      // Release the hold-celebration gate so the next scene's fanfare isn't
      // hostage to this scene's bark state.
      try { window.__holdCelebrationGate = null; window.__rungHoldComplete = false; } catch {}
      // Stop looped/long audio (room reverb send, lapping). One-shot vocals
      // ≤1.5 s may run out per the scene audio contract.
      try { liveAudio.forEach(h => h && h.stop && h.stop()); } catch {}
      // The meadow PMREM is a render target this scene owns — disposeObject()
      // only walks materials, so scene.environment would leak per visit.
      try { if (dogEnvTex) { dogEnvTex.dispose(); dogEnvTex = null; } } catch {}
      try { scene.environment = null; } catch {}
      clearItem();
    },
  };
}

export { setupDogs };
