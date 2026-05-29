/* skinned-humanoid — a real Three.js SkinnedMesh humanoid with a proper bone
 * hierarchy and AnimationMixer-driven idle. Replaces the keyframe-sine-wave
 * approach used elsewhere in the app for the character creator preview, so
 * users see their character rendered with skeletal deformation (knees and
 * elbows actually bend at the joint, instead of two rigid capsules pivoting).
 *
 * Geometry: one merged BufferGeometry built from cylinder + sphere segments
 * positioned in bind pose. Each segment writes skinIndex / skinWeight into
 * the shared vertex stream.
 *
 * Skinning model: mostly rigid — each vertex is bound to one bone with
 * weight=1.0. Joints (elbow, knee, shoulder) use 2-bone blends across a
 * narrow band so the joint deforms smoothly instead of clipping.
 *
 * Bones (parent → child):
 *   root → spine → chest → neck → head
 *                       → leftShoulder → leftElbow → leftWrist
 *                       → rightShoulder → rightElbow → rightWrist
 *        → leftHip → leftKnee → leftAnkle
 *        → rightHip → rightKnee → rightAnkle
 *
 * Exposes window.PhobiaSkinned.buildFigure(c) → THREE.Group containing the
 * SkinnedMesh. The returned group has userData.update(t) for idle motion.
 */
(function () {
  "use strict";

  function buildFigure(c = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const PR = window.PhobiaRealism;

    // ---- Colour resolution ----
    const skinHex   = c.skinHex   || "#e8b794";
    const hairHex   = c.hairHex   || "#4a2c18";
    const shirtHex  = c.shirtHex  || "#2c9d96";
    const pantsHex  = c.pantsHex  || "#2c3a52";
    const eyeHex    = c.eyeHex    || "#3a2410";

    // ---- Bind-pose joint positions (world space, feet at y=0) ----
    // Adult-ish proportions, gender-neutral. All values in metres.
    const J = {
      root:        [ 0.00, 0.95, 0.00 ],
      spine:       [ 0.00, 1.05, 0.00 ],
      chest:       [ 0.00, 1.20, 0.00 ],
      neck:        [ 0.00, 1.42, 0.00 ],
      head:        [ 0.00, 1.55, 0.00 ],
      L_shoulder:  [ 0.21, 1.36, 0.00 ],
      L_elbow:     [ 0.30, 1.10, 0.00 ],
      L_wrist:     [ 0.36, 0.84, 0.00 ],
      R_shoulder:  [-0.21, 1.36, 0.00 ],
      R_elbow:     [-0.30, 1.10, 0.00 ],
      R_wrist:     [-0.36, 0.84, 0.00 ],
      L_hip:       [ 0.10, 0.92, 0.00 ],
      L_knee:      [ 0.10, 0.50, 0.00 ],
      L_ankle:     [ 0.10, 0.05, 0.00 ],
      R_hip:       [-0.10, 0.92, 0.00 ],
      R_knee:      [-0.10, 0.50, 0.00 ],
      R_ankle:     [-0.10, 0.05, 0.00 ],
    };

    // ---- Build bones (Three.Bone) in a parent-child hierarchy ----
    // We MUST use bone.position relative to parent for SkinnedMesh skinning
    // matrices to be correct. Convert world positions to local positions
    // by subtracting the parent's world position.
    const bones = {};
    const boneList = [];
    function addBone(name, parentName) {
      const b = new THREE.Bone();
      b.name = name;
      const w = J[name];
      const p = parentName ? J[parentName] : [0, 0, 0];
      b.position.set(w[0] - p[0], w[1] - p[1], w[2] - p[2]);
      bones[name] = b;
      boneList.push(b);
      if (parentName) bones[parentName].add(b);
      return b;
    }
    addBone("root", null);
    addBone("spine", "root");
    addBone("chest", "spine");
    addBone("neck", "chest");
    addBone("head", "neck");
    addBone("L_shoulder", "chest");
    addBone("L_elbow", "L_shoulder");
    addBone("L_wrist", "L_elbow");
    addBone("R_shoulder", "chest");
    addBone("R_elbow", "R_shoulder");
    addBone("R_wrist", "R_elbow");
    addBone("L_hip", "root");
    addBone("L_knee", "L_hip");
    addBone("L_ankle", "L_knee");
    addBone("R_hip", "root");
    addBone("R_knee", "R_hip");
    addBone("R_ankle", "R_knee");

    const boneIndex = (n) => boneList.indexOf(bones[n]);

    // ---- Geometry builder ----
    // Each "segment" is a cylinder built between two world-space joints.
    // We assign skinIndex/skinWeight per vertex so the geometry follows
    // the bones. For rigid binding, every vertex of a segment has weight
    // 1.0 to a single bone (the segment's "owning" bone).
    //
    // For the body parts that span across a joint (e.g. the upper-arm
    // capsule lives between L_shoulder and L_elbow), we bind to the
    // PARENT bone (L_shoulder) so the rotation pivot is correct.

    const segments = [];
    function addCylinderBetween(a, b, rA, rB, ownerBone, materialKey, joints = []) {
      const A = new THREE.Vector3(...J[a]);
      const B = new THREE.Vector3(...J[b]);
      const len = A.distanceTo(B);
      const geo = new THREE.CylinderGeometry(rB, rA, len, 14, 1, false);
      // Cylinder is built along +y centred at origin. Translate so its
      // bottom is at y=0, then orient toward (B - A), then translate to A.
      geo.translate(0, len / 2, 0);
      const dir = new THREE.Vector3().subVectors(B, A).normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      geo.applyQuaternion(q);
      geo.translate(A.x, A.y, A.z);
      // Skin attributes — single-bone bind by default; joints[] specifies
      // soft-blended rings for smooth joint deformation.
      attachSkinAttrs(geo, ownerBone, joints);
      segments.push({ geo, materialKey });
    }
    function addSphereAt(a, r, ownerBone, materialKey, scale = [1, 1, 1]) {
      const A = new THREE.Vector3(...J[a]);
      const geo = new THREE.SphereGeometry(r, 18, 14);
      geo.scale(scale[0], scale[1], scale[2]);
      geo.translate(A.x, A.y, A.z);
      attachSkinAttrs(geo, ownerBone, []);
      segments.push({ geo, materialKey });
    }
    function attachSkinAttrs(geo, ownerBone /*, _joints (deprecated) */) {
      // Rigid skinning: every vertex of this segment is fully bound to the
      // owner bone. This is the simplest correct binding — joints will be
      // visibly hard at the elbow / knee, but the rig works and we can
      // layer soft skinning in a follow-up by inspecting vertex distance
      // along the bone axis (not absolute y, which broke for limbs at
      // non-vertical angles).
      const pos = geo.attributes.position;
      const count = pos.count;
      const idx = new Uint16Array(count * 4);
      const wt  = new Float32Array(count * 4);
      const ownerIdx = boneIndex(ownerBone);
      for (let i = 0; i < count; i++) {
        idx[i * 4 + 0] = ownerIdx;
        wt[i * 4 + 0] = 1.0;
      }
      geo.setAttribute("skinIndex", new THREE.BufferAttribute(idx, 4));
      geo.setAttribute("skinWeight", new THREE.BufferAttribute(wt, 4));
    }

    // ---- Body geometry (per bone) ----
    // Pelvis (root)
    addSphereAt("root",  0.16, "root", "pants", [1.4, 0.7, 0.95]);
    // Spine + chest barrel
    addCylinderBetween("spine", "chest", 0.18, 0.21, "spine", "shirt");
    addSphereAt("chest", 0.20, "chest", "shirt", [1.3, 1.05, 0.85]);
    // Neck + head
    addCylinderBetween("neck", "head", 0.075, 0.085, "neck", "skin");
    addSphereAt("head", 0.18, "head", "skin", [1.0, 1.10, 0.95]);
    // Hair cap (parented to head bone) — half-sphere
    {
      const A = new THREE.Vector3(...J.head);
      const hairGeo = new THREE.SphereGeometry(0.184, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
      hairGeo.scale(1.0, 1.10, 0.95);
      hairGeo.translate(A.x, A.y, A.z);
      attachSkinAttrs(hairGeo, "head", []);
      segments.push({ geo: hairGeo, materialKey: "hair" });
    }
    // Eyes — bound to head bone too
    for (const sx of [-1, 1]) {
      const eyeGeo = new THREE.SphereGeometry(0.022, 12, 10);
      const A = new THREE.Vector3(...J.head);
      eyeGeo.translate(A.x + sx * 0.045, A.y + 0.02, A.z + 0.13);
      attachSkinAttrs(eyeGeo, "head", []);
      segments.push({ geo: eyeGeo, materialKey: "eye" });
    }
    // Arms — upper arm (shoulder→elbow) + forearm (elbow→wrist) + hand
    // Soft elbow blend: vertices on the upper-arm cylinder closer than
    // 4 cm to the elbow joint blend toward the elbow bone, giving a
    // smooth bend instead of a sharp pivot.
    addCylinderBetween("L_shoulder", "L_elbow", 0.080, 0.070, "L_shoulder", "shirt", [
      { jointName: "L_elbow", otherBone: "L_elbow", blendStart: -0.03, blendEnd: 0.0 },
    ]);
    addCylinderBetween("L_elbow", "L_wrist", 0.060, 0.052, "L_elbow", "skin");
    addSphereAt("L_wrist", 0.045, "L_wrist", "skin", [0.85, 1.0, 0.6]);
    addCylinderBetween("R_shoulder", "R_elbow", 0.080, 0.070, "R_shoulder", "shirt", [
      { jointName: "R_elbow", otherBone: "R_elbow", blendStart: -0.03, blendEnd: 0.0 },
    ]);
    addCylinderBetween("R_elbow", "R_wrist", 0.060, 0.052, "R_elbow", "skin");
    addSphereAt("R_wrist", 0.045, "R_wrist", "skin", [0.85, 1.0, 0.6]);
    // Legs — thigh (hip→knee) + shin (knee→ankle) + foot
    addCylinderBetween("L_hip", "L_knee", 0.105, 0.085, "L_hip", "pants", [
      { jointName: "L_knee", otherBone: "L_knee", blendStart: -0.04, blendEnd: 0.0 },
    ]);
    addCylinderBetween("L_knee", "L_ankle", 0.080, 0.060, "L_knee", "pants");
    addCylinderBetween("R_hip", "R_knee", 0.105, 0.085, "R_hip", "pants", [
      { jointName: "R_knee", otherBone: "R_knee", blendStart: -0.04, blendEnd: 0.0 },
    ]);
    addCylinderBetween("R_knee", "R_ankle", 0.080, 0.060, "R_knee", "pants");
    // Feet — boxes parented to ankle bones, slightly forward of the heel
    for (const side of ["L", "R"]) {
      const A = new THREE.Vector3(...J[side + "_ankle"]);
      const footGeo = new THREE.BoxGeometry(0.10, 0.07, 0.22);
      footGeo.translate(A.x, A.y - 0.005, A.z + 0.06);
      attachSkinAttrs(footGeo, side + "_ankle", []);
      segments.push({ geo: footGeo, materialKey: "shoe" });
    }

    // ---- Per-segment SkinnedMeshes sharing one Skeleton ----
    // We tried merging segments per material with a hand-rolled buffer
    // merger, but the result rendered incorrectly — likely a subtle bug
    // in how skin attributes interleave through the merge. The robust
    // alternative used by Three.js examples: each segment is its own
    // SkinnedMesh, all sharing the same Skeleton via bind(skeleton).
    // This costs more draw calls (~20 vs ~6) but is dramatically simpler
    // and known to work. Materials are cached per-key so each segment
    // doesn't pay the texture-build cost more than once.
    const matCache = {};
    function getMaterial(key) {
      if (matCache[key]) return matCache[key];
      matCache[key] = mkMat(key);
      return matCache[key];
    }

    // ---- Materials (PBR via realism module if available) ----
    function mkMat(key) {
      switch (key) {
        case "skin":  return PR ? PR.skinMaterial(skinHex)
                                : new THREE.MeshStandardMaterial({ color: skinHex, roughness: 0.78, skinning: true });
        case "hair":  return PR ? PR.hairMaterial(hairHex)
                                : new THREE.MeshStandardMaterial({ color: hairHex, roughness: 1.0 });
        case "shirt": return PR ? PR.fabricMaterial(shirtHex, "cotton")
                                : new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.85 });
        case "pants": return PR ? PR.fabricMaterial(pantsHex, "denim")
                                : new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.95 });
        case "shoe":  return new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.50, metalness: 0.08 });
        case "eye":   return new THREE.MeshStandardMaterial({ color: eyeHex, roughness: 0.18, metalness: 0.12 });
        default:      return new THREE.MeshStandardMaterial({ color: 0xff00ff });
      }
    }

    // ---- Build the SkinnedMesh(es) and Skeleton ----
    // Parenting model: the bone root is added to the GROUP exactly once.
    // Every SkinnedMesh shares the same Skeleton (same Bone instances) so
    // the meshes deform in lock-step. Each SkinnedMesh is also added to
    // the group as a sibling of the bone root — this is the canonical
    // Three.js setup. Calling sm.add(bones.root) per mesh would re-parent
    // the root on every iteration and corrupt the hierarchy.
    //
    // CRITICAL: the Skeleton constructor calls calculateInverses() which
    // reads bone.matrixWorld on every bone. We must make sure the bones'
    // world matrices reflect the hierarchy BEFORE constructing the
    // Skeleton, otherwise the bind-pose inverse is identity and the
    // skinning shader collapses every vertex onto its bone's local origin.
    const group = new THREE.Group();
    group.add(bones.root);
    group.updateMatrixWorld(true);          // populate bone.matrixWorld
    const skeleton = new THREE.Skeleton(boneList);

    const skinnedMeshes = [];
    for (const seg of segments) {
      const mat = getMaterial(seg.materialKey);
      const sm = new THREE.SkinnedMesh(seg.geo, mat);
      sm.castShadow = true;
      sm.receiveShadow = true;
      // Disable frustum culling — bounding sphere doesn't track skinning.
      sm.frustumCulled = false;
      sm.bind(skeleton);
      group.add(sm);
      skinnedMeshes.push(sm);
    }

    // ---- Idle / walk animation ----
    // Hand-driven bone rotations on each frame. Caller can swap to
    // walking by setting group.userData.walkAmt > 0.
    group.userData.walkAmt = 0;
    group.userData.walkPhase = 0;
    group.userData.animate = function (t, dt) {
      const walkAmt = group.userData.walkAmt;
      const idleAmt = 1 - walkAmt;
      group.userData.walkPhase += (dt || 0.016) * Math.PI * 4 * walkAmt;     // 2 Hz cadence
      const phase = group.userData.walkPhase;

      // Spine breathing — chest scales gently. We rotate spine around z
      // for a tiny sway when idle, and yaw counter-rotation when walking.
      if (bones.spine) {
        bones.spine.rotation.z = Math.sin(t * 1.4) * 0.012 * idleAmt;
        bones.spine.rotation.y = -Math.sin(phase) * 0.10 * walkAmt;
      }
      if (bones.chest) {
        bones.chest.rotation.y = Math.sin(phase) * 0.085 * walkAmt;
        bones.chest.rotation.z = Math.sin(phase + Math.PI / 2) * 0.05 * walkAmt;
      }
      if (bones.neck) {
        bones.neck.rotation.y = Math.sin(t * 0.6) * 0.06 * idleAmt;
        bones.neck.rotation.x = Math.sin(t * 0.7) * 0.025 * idleAmt;
      }

      // Walk cycle: legs alternate forward (rotation.x), arms swing
      // opposite. Knees bend on the back-swing leg.
      if (walkAmt > 0.01) {
        const legSwing = Math.sin(phase) * 0.55 * walkAmt;
        const knL = Math.max(0, -Math.sin(phase)) * 0.65 * walkAmt;
        const knR = Math.max(0,  Math.sin(phase)) * 0.65 * walkAmt;
        if (bones.L_hip)  bones.L_hip.rotation.x  = -legSwing;
        if (bones.R_hip)  bones.R_hip.rotation.x  =  legSwing;
        if (bones.L_knee) bones.L_knee.rotation.x =  knL;
        if (bones.R_knee) bones.R_knee.rotation.x =  knR;
        // Arms swing OPPOSITE legs
        const armSwing = Math.sin(phase) * 0.50 * walkAmt;
        if (bones.L_shoulder) bones.L_shoulder.rotation.x =  armSwing;
        if (bones.R_shoulder) bones.R_shoulder.rotation.x = -armSwing;
        if (bones.L_elbow) bones.L_elbow.rotation.x = 0.18 + Math.max(0, Math.sin(phase)) * 0.30 * walkAmt;
        if (bones.R_elbow) bones.R_elbow.rotation.x = 0.18 + Math.max(0,-Math.sin(phase)) * 0.30 * walkAmt;
      } else {
        // Idle stance — arms hang relaxed with tiny breath sway
        const idleSway = Math.sin(t * 1.6) * 0.012;
        if (bones.L_shoulder) bones.L_shoulder.rotation.x = idleSway;
        if (bones.R_shoulder) bones.R_shoulder.rotation.x = -idleSway;
        if (bones.L_elbow) bones.L_elbow.rotation.x = 0.10;
        if (bones.R_elbow) bones.R_elbow.rotation.x = 0.10;
        if (bones.L_hip)  bones.L_hip.rotation.x  = 0;
        if (bones.R_hip)  bones.R_hip.rotation.x  = 0;
        if (bones.L_knee) bones.L_knee.rotation.x = 0;
        if (bones.R_knee) bones.R_knee.rotation.x = 0;
      }
    };
    group.userData.bones = bones;
    group.userData.skeleton = skeleton;
    group.userData.skinnedMeshes = skinnedMeshes;
    return group;
  }

  // ---- Tiny BufferGeometryUtils.mergeBufferGeometries shim ----
  // We need a merger that preserves skinIndex / skinWeight attributes.
  // Three.js's official BufferGeometryUtils does this, but we'd have to
  // import another addon. The function below is a minimal merge that
  // copies position, normal, uv, skinIndex, skinWeight.
  function mergeBufferGeometries(geometries) {
    const THREE = window.THREE;
    if (!geometries.length) return null;
    const merged = new THREE.BufferGeometry();
    const attrNames = ["position", "normal", "uv", "skinIndex", "skinWeight"];
    const arrays = {};
    const itemSizes = {};
    let totalCount = 0;
    for (const g of geometries) totalCount += g.attributes.position.count;

    for (const name of attrNames) {
      const proto = geometries[0].attributes[name];
      if (!proto) continue;
      itemSizes[name] = proto.itemSize;
      const ArrayType = proto.array.constructor;
      arrays[name] = new ArrayType(totalCount * proto.itemSize);
    }

    let cursor = 0;
    for (const g of geometries) {
      const count = g.attributes.position.count;
      for (const name of attrNames) {
        const src = g.attributes[name];
        const dst = arrays[name];
        if (!src || !dst) continue;
        const sz = itemSizes[name];
        for (let i = 0; i < count; i++) {
          for (let k = 0; k < sz; k++) {
            dst[(cursor + i) * sz + k] = src.array[i * sz + k];
          }
        }
      }
      cursor += count;
    }
    for (const name of attrNames) {
      if (!arrays[name]) continue;
      merged.setAttribute(name, new THREE.BufferAttribute(arrays[name], itemSizes[name]));
    }
    merged.computeBoundingSphere();
    return merged;
  }

  function publish() {
    window.PhobiaSkinned = { buildFigure };
  }
  publish();
})();
