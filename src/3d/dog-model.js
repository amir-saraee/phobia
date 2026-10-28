// buildDog(): the rigged GLTF dog with its photo coat, collar and fur shells.

import * as THREE from "three";
// SkeletonUtils.clone() correctly deep-clones a rigged/skinned mesh (bones +
// skin bindings). A plain Object3D.clone() shares the skeleton and breaks
// animation, so any model we instance from the GLTF cache must use this.
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { loadGLTF, compileBeforeAdd, DOG_MODELS, DOG_COAT_MAPS, loadDogCoatTextures } from "./assets.js";
import { sceneQuality, IS_MOBILE } from "./renderer.js";
import { makeFurMaps, ensureBoxUV, geometryBox, applySidePhotoUVs, smoothCreaseNormals, applyCoatTint } from "./creature-kit.js";
import { DogLegRig, correctDogGaitClip, synthDogTrot } from "./dog-rig.js";

// A pet dog wears a collar — and the collar is half the dog's SOUND (the tag
// jingle that announces every trot and shake-off). Self-calibrating: measures
// the neck's radial spread from the verts skinned to Neck1/Neck2 in bind pose,
// sizes a leather ring + brass tag from it, and parents them to the neck bone
// so they ride every animation. Bone-local units are raw GLTF units (the
// model's scale applies above the bone), so measured fractions transfer
// between breeds untouched.
function attachDogCollar(model, parts, rawH) {
  let gm = null;
  model.traverse((o) => { if (!gm && o.isSkinnedMesh) gm = o; });
  if (!gm || !gm.skeleton || !(rawH > 0)) return;
  const bones = gm.skeleton.bones;
  const neck = bones.find((b) => b.name === "Neck1");
  if (!neck) return;
  // Fractions of the model's RAW bind height, tuned live against the shiba
  // (ring 0.46 on rawH ≈ 3.09) and verified in sit + stand. A vertex probe
  // sounded smarter but under-measures at build time: getVertexPosition
  // before the first render reads unset bone matrices (~2.3× too small),
  // so the "measured" collar drowned inside the ruff.
  const ringR = rawH * 0.149;
  const tubeR = rawH * 0.018;
  const grp = new THREE.Group();
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(ringR, tubeR, 8, 22),
    new THREE.MeshStandardMaterial({ color: 0x8f3f2c, roughness: 0.74, metalness: 0.04 })
  );
  collar.rotation.x = Math.PI / 2;        // hole along the bone's Y (neck axis)
  collar.position.y = rawH * 0.110;       // low on the neck, above the shoulders
  collar.castShadow = true;
  // The collar hangs off Neck1, i.e. INSIDE the model — so the coat pass's
  // model.traverse() would reach it. Leather and brass are not fur: without
  // this flag the late coat upgrade forces the colour to white and stretches
  // the whole breed photograph around the ring and the tag.
  collar.userData.noCoat = true;
  grp.add(collar);
  const tag = new THREE.Mesh(
    new THREE.CylinderGeometry(tubeR * 2.3, tubeR * 2.3, tubeR * 0.8, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.85, roughness: 0.35 })
  );
  tag.rotation.x = Math.PI / 2;           // flat against the chest
  tag.position.set(0, collar.position.y - tubeR * 1.8, ringR * 1.0);
  tag.castShadow = true;
  tag.userData.noCoat = true;
  grp.add(tag);
  neck.add(grp);
  parts.collar = grp;
  // Fit to the measured neck once the dog is posed (a few frames in — the
  // build-time probe reads unposed bones, see above). Neck1 doesn't run down
  // the middle of every breed's neck: on the husky the ring, centred on the
  // bone, hung a hand's width below the chin. Re-centre on the neck's cross
  // section and size the ring to it (the shiba's tuned ring sits at 1.1× the
  // section's median radius, so that's the target).
  let frames = 0;
  collar.onBeforeRender = () => {
    if (++frames < 4) return;
    collar.onBeforeRender = () => {};
    try {
      const ni = bones.indexOf(neck);
      const pos = gm.geometry.attributes.position, si = gm.geometry.attributes.skinIndex, sw = gm.geometry.attributes.skinWeight;
      if (ni < 0 || !pos || !si || !sw) return;
      gm.skeleton.update();
      neck.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(neck.matrixWorld).invert();
      const v = new THREE.Vector3(), pts = [];
      const y0 = collar.position.y, band = ringR * 0.35;
      for (let i = 0; i < pos.count; i++) {
        let w = 0; for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === ni) w += sw.getComponent(i, j);
        if (w < 0.25) continue;
        gm.getVertexPosition(i, v); v.applyMatrix4(gm.matrixWorld).applyMatrix4(inv);
        if (Math.abs(v.y - y0) < band) pts.push([v.x, v.z]);
      }
      if (pts.length < 12) return;
      let cx = 0, cz = 0; pts.forEach((q) => { cx += q[0]; cz += q[1]; }); cx /= pts.length; cz /= pts.length;
      const rs = pts.map((q) => Math.hypot(q[0] - cx, q[1] - cz)).sort((a, b) => a - b);
      const want = rs[Math.floor(rs.length / 2)] * 1.1;
      const f = Math.max(0.6, Math.min(1.4, want / ringR));
      grp.position.x = cx; grp.position.z = cz;
      collar.scale.set(f, f, 1);
      // The tag hangs at the throat: the side of the ring facing the floor
      // (+Z in Neck1's frame is the nape on these rigs — it sat on the back
      // of every dog's neck).
      const down = new THREE.Vector3(0, -1, 0).transformDirection(inv);
      const a = Math.hypot(down.x, down.z) > 0.2 ? Math.atan2(down.x, down.z) : Math.PI;
      tag.rotation.order = "YXZ";
      tag.rotation.set(Math.PI / 2, a, 0);
      tag.position.set(Math.sin(a) * ringR * f, y0 - tubeR * 1.8, Math.cos(a) * ringR * f);
    } catch {}
  };
}

function buildDog(opts = {}) {
  const breed = opts.breed || "shiba";
  const targetHeight = opts.targetHeight || 0.7;   // world height, feet→ears
  const dog = new THREE.Group();
  const parts = {};
  dog.userData.parts = parts;
  dog.userData.ready = false;

  // Mouth anchor for carried fetch items. A plain Group child (NOT a skeleton
  // bone) so the fetch code — which works in dog-local space — keeps holding.
  // Repositioned to the muzzle once we've measured the model.
  const mouth = new THREE.Group();
  dog.add(mouth);
  parts.jaw = mouth;        // legacy name the fetch state machine expects
  parts.mouth = mouth;

  const url = DOG_MODELS[breed] || DOG_MODELS.shiba;
  loadGLTF(url).then((gltf) => {
    if (dog.userData.disposed) return;       // scene unmounted before load done
    const model = cloneSkinned(gltf.scene);
    // Own every geometry + material so unmount's disposeObject() frees only this
    // instance, never the shared cached originals. These models carry no
    // textures, so a material.clone() is fully self-contained.
    model.traverse((o) => {
      if (o.isMesh) {
        o.geometry = o.geometry.clone();
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;     // skinned bounds are unreliable once posed
        // Soften the faceting: these models ship per-face normals, so every
        // triangle reads as a hard plate — a paper dog in a soft-lit room.
        // Average normals across position-duplicate vertices, but only within
        // ~60° (crease limit), so the body curves like a coat while ear rims,
        // snout and paw edges stay crisp. Positions/UVs/skin attrs untouched —
        // safe for the skinned mesh — and the fur normal map layers on top.
        smoothCreaseNormals(o.geometry, Math.cos(Math.PI / 3));
      }
    });
    // Coat tint only for legacy procedural maps. Photo-projected coats already
    // carry the real breed colours — tinting them washes the photograph into
    // a single HSL smear.
    const coatIsPhoto = !!(DOG_COAT_MAPS[breed] && DOG_COAT_MAPS[breed].photo);
    if (!coatIsPhoto) applyCoatTint(model, opts.coat);

    // UVs: photo coats need side-projection registered to the dog silhouette;
    // legacy coats keep box UVs for tiling strand maps.
    //
    // The box MUST come from the authored geometry, not Box3.setFromObject():
    // on a SkinnedMesh that helper calls SkinnedMesh.computeBoundingBox(),
    // which skins every vertex through bone matrices that have not been posed
    // yet at build time. It came back ~2× too tall and half a body below the
    // floor, so the side projection squeezed the whole dog into the top 40 %
    // of the photo — i.e. the empty backdrop above the animal. Every breed
    // rendered as one flat sheet of backdrop tan. (Same build-probe trap the
    // collar sizing hit; see attachDogCollar.)
    const rawBox = geometryBox(model);
    const rawSize = Math.max(0.001, rawBox.max.y - rawBox.min.y);
    model.traverse((o) => {
      if (o.isMesh && o.geometry) {
        if (coatIsPhoto) applySidePhotoUVs(o.geometry, rawBox);
        else ensureBoxUV(o.geometry, rawSize);
      }
    });

    // Apply breed PBR coat maps (external textures) with procedural fur as
    // fallback / micro-detail layer. Eyes/nose get a wet dark specular;
    // coat stays matte dielectric. `mode`: "base" darkens + sets mats once;
    // "upgrade" only swaps map slots so a late-arriving PNG never re-darkens.
    const applyCoatMaterials = (coatMaps, mode = "base") => {
      const lowQ = (typeof sceneQuality === "function" && sceneQuality() === "low");
      const fur = (() => { try { return makeFurMaps(); } catch { return null; } })();
      const photo = !!(coatMaps && coatMaps.photo) || coatIsPhoto;
      const wrap = photo ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
      const rep = photo ? 1.0 : 3.0;
      model.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        if (o.userData && o.userData.noCoat) return;   // collar, tag — not fur
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => {
          if (!m || !m.color) return;
          const lum = 0.299 * m.color.r + 0.587 * m.color.g + 0.114 * m.color.b;
          // Eyes / nose / pads — dark wet specular, no fur tiling.
          if (lum < 0.06) {
            if (mode === "base") {
              m.metalness = 0.15;
              m.roughness = 0.22;
              m.envMapIntensity = 0.85;
              if (m.clearcoat != null) { m.clearcoat = 0.55; m.clearcoatRoughness = 0.18; }
              m.needsUpdate = true;
            }
            return;
          }
          if (mode === "base") {
            m.metalness = 0;
            m.roughness = photo ? 0.82 : 0.88;
            m.envMapIntensity = photo ? 0.55 : 0.42;
            if (!photo) {
              const darken = lum > 0.78 ? 0.66 : lum > 0.6 ? 0.76 : lum > 0.4 ? 0.86 : 0.95;
              m.color.multiplyScalar(darken);
            }
          }
          if (lum > 0.92) { m.needsUpdate = true; return; } // teeth / eye-whites
          if (coatMaps && coatMaps.albedo && !lowQ) {
            m.map = coatMaps.albedo.clone();
            m.map.wrapS = m.map.wrapT = wrap;
            m.map.repeat.set(rep, rep);
            m.map.needsUpdate = true;
            // Photo albedo carries the colour — multiply by near-white so the
            // map is the look. Legacy maps still need a tint-through multiply.
            if (!m.userData._coatAlbedoBoost) {
              if (photo) {
                m.color.setRGB(1, 1, 1);
              } else {
                m.color.multiplyScalar(0.55);
                m.color.lerp(new THREE.Color(0xffffff), 0.35);
              }
              m.userData._coatAlbedoBoost = true;
            }
          }
          const nrmSrc = (coatMaps && coatMaps.normal && !lowQ) ? coatMaps.normal : (fur && fur.normal);
          const rghSrc = (coatMaps && coatMaps.roughness && !lowQ) ? coatMaps.roughness : (fur && fur.roughness);
          if (nrmSrc) {
            m.normalMap = nrmSrc.clone();
            m.normalMap.wrapS = m.normalMap.wrapT = wrap;
            m.normalMap.repeat.set(rep, rep);
            m.normalMap.needsUpdate = true;
            if (m.normalScale) m.normalScale.set(photo ? 1.15 : 0.95, photo ? 1.15 : 0.95);
          }
          if (rghSrc) {
            m.roughnessMap = rghSrc.clone();
            m.roughnessMap.wrapS = m.roughnessMap.wrapT = wrap;
            m.roughnessMap.repeat.set(rep, rep);
            m.roughnessMap.needsUpdate = true;
          }
          m.needsUpdate = true;
        });
      });
    };
    // Procedural maps immediately so the dog never flashes plastic while the
    // breed PNGs stream in; then upgrade map slots when ready (no re-darken).
    try { applyCoatMaterials(null, "base"); } catch (e) { console.warn("[dogs] fur maps:", e); }
    // The low tier never applies the photo coat (see applyCoatMaterials) nor
    // grows fur shells, so it doesn't download and decode the three maps.
    const coatLanded = (sceneQuality() === "low" ? Promise.resolve(null) : loadDogCoatTextures(breed)).then((maps) => {
      if (dog.userData.disposed || !maps) return;
      try { applyCoatMaterials(maps, "upgrade"); } catch (e) { console.warn("[dogs] coat maps:", e); }
      // Fur shells take their maps from the upgraded coat, so they're built
      // only once it has landed (see addDogFurShells).
      try { addDogFurShells(model, parts); } catch (e) { console.warn("[dogs] fur shells:", e); }
    });

    // Animation: a named action map over the 12 clips the pack ships. Created
    // BEFORE measuring so the rig can be posed for measurement.
    const mixer = new THREE.AnimationMixer(model);
    parts.mixer = mixer;
    parts.actions = {};
    gltf.animations.forEach((clip) => { parts.actions[clip.name] = mixer.clipAction(clip); });
    // Gait clips with their paw tracks made physically consistent
    // (correctDogGaitClip), plus the trot the pack doesn't ship (synthDogTrot,
    // built from the corrected walk). Once per loaded model, shared by every
    // instance like the shipped clips.
    parts.gaitArmSpeed = {};
    try {
      if (!gltf._dogGait) {
        const g = {};
        for (const name of ["Walk", "Gallop"]) {
          const src = gltf.animations.find((c) => c.name === name);
          if (src) g[name] = correctDogGaitClip(src);
        }
        if (g.Walk) {
          // Stride gain kept small for the same reason as above: the fore
          // legs have almost no reach to give. The trot's speed comes from
          // cadence, as it does in a small dog.
          g.Trot = {
            clip: synthDogTrot(g.Walk.clip, { strideGain: 1.1 }),
            speed: g.Walk.speed != null ? g.Walk.speed * 1.1 : null,
          };
        }
        gltf._dogGait = g;
      }
      for (const name in gltf._dogGait) {
        const e = gltf._dogGait[name];
        parts.actions[name] = mixer.clipAction(e.clip);
        parts.gaitArmSpeed[name] = e.speed;
      }
    } catch (e) { console.warn("[dogs] gait clip preparation failed:", e); }

    // Measure the ANIMATED standing pose, not the bind-pose bbox: on the
    // Quaternius rigs the armature's rest/Idle stance stands ~2.5× taller
    // than the authored geometry box, so scaling by Box3.setFromObject made
    // every dog render ~2.5× its configured height (the "small" shiba was
    // pony-sized) and left bone anchors (pet point, gaze origin) floating
    // half a metre above where the scene math believed the coat was.
    // Pose the skeleton with Idle frame 0, then take skinned-vertex bounds.
    if (parts.actions.Idle) { parts.actions.Idle.play(); mixer.update(0); }
    model.updateWorldMatrix(true, true);   // no parent yet → world == model-local
    const box = new THREE.Box3();
    const _sv = new THREE.Vector3();
    model.traverse((o) => {
      if (o.isSkinnedMesh && o.getVertexPosition) {
        const pa = o.geometry.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          o.getVertexPosition(i, _sv);   // skinning applied, mesh-local
          o.localToWorld(_sv);
          box.expandByPoint(_sv);
        }
      }
    });
    if (box.isEmpty()) box.setFromObject(model);   // non-skinned fallback
    const rawH = Math.max(0.001, box.max.y - box.min.y);
    const S = targetHeight / rawH;
    if (parts.actions.Idle) parts.actions.Idle.stop();
    // The model's native forward is already +Z (snout at +Z), which matches the
    // Group's forward convention — no rotation needed.
    model.scale.setScalar(S);
    // Feet on the Group origin exactly — the posed bounds include the paws,
    // so no fudge calibration is needed any more.
    model.position.y = -box.min.y * S;
    parts.height = targetHeight;
    parts.modelScale = S;
    // Leg rig rest references, taken at the final scale on Idle frame 0 (see
    // DogLegRig). Bone transforms only — no skinned-vertex probing, so the
    // build-time stale-boneMatrices trap doesn't apply.
    if (parts.actions.Idle) { parts.actions.Idle.reset().play(); mixer.update(0); }
    try { parts.legCal = DogLegRig.calibrate(model); } catch (e) { parts.legCal = null; console.warn("[dogs] leg calibration:", e); }
    if (parts.actions.Idle) parts.actions.Idle.stop();
    // Grounded-locomotion constants — MEASURED off the clips, not guessed from
    // the model's height. The old "1.9 × height" heuristic came out 1.83× too
    // high for this rig, so the controller played Walk far too slowly for the
    // ground it was covering and the planted paws slid at up to 1.5 m/s. Run
    // each gait once and watch how far a paw actually travels along the dog's
    // own forward axis in one cycle: that excursion IS the stride.
    parts.footBones = ["FFL", "FFR", "FFBL", "FFBR"]
      .map((n) => model.getObjectByName(n)).filter(Boolean);
    const measureStride = (name) => {
      const act = parts.actions[name];
      if (!act || !parts.footBones.length) return null;
      const clip = act.getClip();
      for (const k in parts.actions) parts.actions[k].stop();
      act.reset(); act.setEffectiveWeight(1); act.timeScale = 1; act.play();
      const N = 48, dt = clip.duration / N;
      const lo = parts.footBones.map(() => Infinity);
      const hi = parts.footBones.map(() => -Infinity);
      const _p = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        mixer.update(i === 0 ? 0 : dt);
        model.updateWorldMatrix(true, true);
        parts.footBones.forEach((b, j) => {
          b.getWorldPosition(_p);
          model.worldToLocal(_p);
          if (_p.z < lo[j]) lo[j] = _p.z;
          if (_p.z > hi[j]) hi[j] = _p.z;
        });
      }
      act.stop(); act.reset();
      // Mean across all four paws, in model-local units → world via the scale.
      let sum = 0;
      for (let j = 0; j < lo.length; j++) sum += (hi[j] - lo[j]);
      const stride = (sum / lo.length) * S;
      return stride > 0.02 ? stride : null;
    };
    const bindBox = new THREE.Box3().setFromObject(model);   // scaled bind pose
    const bindH = Math.max(0.001, (bindBox.max.y - bindBox.min.y));
    // The measured excursion is the STANCE SWEEP, not the stride: relative to
    // the body a paw only travels while planted, and that sweep is
    // stride × duty-factor (fraction of the cycle spent on the ground —
    // ≈0.6 at a walk, ≈0.35 at a gallop). Using the raw excursion as the
    // stride under-measured it 1.7–3×; the ×2.0 speed ceilings in the
    // controller inherited the error and the dog crawled across rooms with
    // its "gallop" capped near walking pace.
    const walkClip = parts.actions.Walk && parts.actions.Walk.getClip();
    const walkSweep = measureStride("Walk");
    const walkStride = walkSweep ? walkSweep / 0.6 : null;
    parts.walkStride = walkStride;
    parts.strideSpeed = walkStride && walkClip
      ? walkStride / walkClip.duration
      : 1.9 * bindH;
    const gallopSweep = measureStride("Gallop");
    parts.gallopStride = gallopSweep ? gallopSweep / 0.35 : 2.4 * bindH;
    // Where the gait clips were corrected (correctDogGaitClip) their ground
    // speed is known exactly — every paw sweeps at it — and replaces the
    // excursion-based estimate above. Armature units → metres via S.
    const gs = parts.gaitArmSpeed || {};
    if (gs.Walk) parts.strideSpeed = gs.Walk * S;
    if (gs.Gallop && parts.actions.Gallop) parts.gallopStride = gs.Gallop * S * parts.actions.Gallop.getClip().duration;
    if (parts.actions.Trot) parts.trotImplied = gs.Trot ? gs.Trot * S : parts.strideSpeed * 1.1;
    try {
      DogLegRig.calibrateClips(model, mixer, parts.actions, parts.legCal,
        ["Idle", "Idle_2", "Idle_2_HeadLow", "Walk", "Trot", "Gallop", "Eating", "Attack"]);
    } catch (e) { console.warn("[dogs] clip contact calibration:", e); }
    if (parts.actions.Idle) { parts.actions.Idle.reset(); }
    // Collision circle from the measured body (half the nose→tail length,
    // slightly tight since the tail overhangs) — the old height-derived guess
    // was tuned against the over-scaled render and left a ring of "touching
    // air" around the real coat.
    parts.bodyRadius = Math.max(0.16, (box.max.z - box.min.z) * S * 0.45);
    // Muzzle anchor: forward (+Z) at ~mouth height. The snout sits at the +Z
    // extent of the bounds.
    parts.mouth.position.set(0, parts.height * 0.66, box.max.z * S + 0.04);

    // Collar + tag: sized from the raw bind height, rides the neck bone.
    try { attachDogCollar(model, parts, rawH); } catch {}

    parts.model = model;

    // Into the room once its programs are linked (compileBeforeAdd) — with the
    // coat upgrade and fur shells in place when the maps are already here
    // (they're prefetched), so the dog appears in the variant it keeps; a coat
    // still downloading gets 1.5 s before the dog goes in without it.
    Promise.race([coatLanded.catch(() => {}), new Promise((res) => setTimeout(res, 1500))])
      .then(() => compileBeforeAdd(dog, model))
      .then(() => {
        if (dog.userData.disposed) return;
        try {
          dog.add(model);
          dog.userData.ready = true;
          if (typeof dog.userData.onReady === "function") dog.userData.onReady();
        } catch (e) { console.warn("[dogs] ready:", e); }
      });
  }).catch((err) => {
    console.warn("[dogs] model load failed:", url, err);
    // Fallback so the room is never silently empty on a load failure. No
    // mixer/clips, so DogController.update() bails (it guards on parts.mixer) —
    // the dog won't walk, but the scene's bark audio + fear cues still fire and
    // the user has a dog-shaped thing to face instead of an empty room.
    try {
      const ph = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.85 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.72), mat);
      body.position.y = 0.42; body.castShadow = true; ph.add(body);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.28), mat);
      head.position.set(0, 0.58, 0.46); head.castShadow = true; ph.add(head);  // +Z = forward (snout)
      ph.scale.setScalar(targetHeight / 0.75);
      dog.add(ph);
      parts.height = targetHeight;
      dog.userData.ready = true;
      dog.userData.loadFailed = true;
      if (typeof dog.userData.onReady === "function") dog.userData.onReady();
    } catch (e) { console.warn("[dogs] fallback failed:", e); }
  });

  return dog;
}

// ---------- Fur shells ----------
// The coat is a photograph projected onto a low-poly body, so up close the
// dog was a painted statue: a hard, perfectly smooth outline where a real dog
// has a halo of hair catching the light. Shell texturing is the classic cure:
// N copies of the coat mesh, each pushed a little further out along its
// normals, each keeping only the strands that reach that high (a per-strand
// random length, hashed from the bind-pose position so it is glued to the
// skin under animation). Stacked, they read as fur — mostly at the
// silhouette, where the eye grazes through all the layers at once.
//
// The shells share the coat's geometry, skeleton and maps (so they cost one
// skinned draw each, no extra bone work), cast no shadow, stay out of SSAO,
// and are hidden beyond a few metres where strands would only shimmer.
// High tier 6 shells, medium 3 (none on phones), low none.
function addDogFurShells(model, parts) {
  const q = (typeof sceneQuality === "function") ? sceneQuality() : "high";
  if (q === "low" || !model || parts.furShells) return;
  // Phones on medium: none either. Each shell is a full extra skinned draw of
  // the coat at the dog's screen size — on a phone GPU three of them cost
  // more than the rest of the dog, for a halo a 6-inch screen barely shows.
  if (q === "medium" && IS_MOBILE) return;
  const N = q === "high" ? 6 : 3;
  const S = parts.modelScale || 1;
  const H = parts.height || 0.6;
  const sz = Math.sqrt(H / 0.56);
  const furLen = 0.011 * sz;              // metres of fur at the outermost shell
  const cell = 0.0021 * sz;               // strand spacing, metres
  const targets = [];
  model.traverse((o) => {
    if (o.isSkinnedMesh && !o.userData.furShell && o.geometry
        && o.geometry.attributes.position.count > 1000) targets.push(o);
  });
  const shells = [];
  const fade = { value: 1 };
  for (const src of targets) {
    const baseMat = Array.isArray(src.material) ? src.material[0] : src.material;
    if (!baseMat || !baseMat.isMeshStandardMaterial) continue;
    for (let i = 1; i <= N; i++) {
      const h = i / N;
      const mat = baseMat.clone();
      const u = {
        uFurH: { value: h },
        uFurLen: { value: furLen / S },
        uFurCell: { value: S / cell },
        uFurFade: fade,
      };
      mat.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, u);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>
uniform float uFurH; uniform float uFurLen; varying vec3 vFurP;`)
          .replace("#include <skinning_vertex>", `#include <skinning_vertex>
transformed += normalize(objectNormal) * (uFurH * uFurLen);
vFurP = position;`);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", `#include <common>
uniform float uFurH; uniform float uFurCell; uniform float uFurFade; varying vec3 vFurP;
float furHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
          .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
{
  vec3 fp = vFurP * uFurCell;
  vec3 f = fract(fp) - 0.5;
  float len = furHash(floor(fp));
  // Strands fade out from the outermost shell inward as the dog recedes.
  if (len * uFurFade < uFurH) discard;
  float rad = 0.5 * (1.0 - uFurH * 0.8);
  if (dot(f, f) > rad * rad) discard;
}`)
          .replace("#include <map_fragment>", `#include <map_fragment>
diffuseColor.rgb *= mix(0.84, 1.05, uFurH);`);
      };
      mat.customProgramCacheKey = () => "dogFurShell";
      const shell = new THREE.SkinnedMesh(src.geometry, mat);
      shell.bind(src.skeleton, src.bindMatrix);
      shell.position.copy(src.position);
      shell.quaternion.copy(src.quaternion);
      shell.scale.copy(src.scale);
      shell.castShadow = false;
      shell.receiveShadow = true;
      shell.frustumCulled = false;
      shell.renderOrder = i;
      shell.userData.furShell = true;
      shell.userData.noPick = true;      // clicks land on the coat itself
      // …and never reach the shell at all: three's raycaster ignores both
      // `visible` and noPick, and skins every triangle on the CPU to test a
      // SkinnedMesh — a tap at the dog cost ~5 ms per raycast with 6 shells.
      shell.raycast = () => {};
      shell.userData.noCoat = true;
      shell.userData.ssaoSkip = true;
      src.parent.add(shell);
      shells.push(shell);
    }
  }
  parts.furShells = shells;
  parts.furFade = fade;
}

export { buildDog };
