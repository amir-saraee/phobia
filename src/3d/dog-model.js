// buildDog(): rigged Quaternius dogs with breed-specific sculpting and coats.

import * as THREE from "three";
// SkeletonUtils.clone() correctly deep-clones a rigged/skinned mesh (bones +
// skin bindings). A plain Object3D.clone() shares the skeleton and breaks
// animation, so any model we instance from the GLTF cache must use this.
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { deinterleaveGeometry, mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { loadGLTF, compileBeforeAdd, DOG_MODELS } from "./assets.js";
import { disposeObject, sceneQuality, IS_MOBILE } from "./renderer.js";
import { DOG_COATS, smoothCreaseNormals } from "./creature-kit.js";
import { DogLegRig, correctDogGaitClip, synthDogTrot } from "./dog-rig.js";

// Fit the leather collar to a posed neck cross-section. The tag rides the
// neck bone through each clip, alongside the controller's jingle cues.
function attachDogCollar(model, parts, rawH) {
  let gm = null;
  model.traverse((o) => { if (!gm && o.userData.dogCoat) gm = o; });
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
  const tubeR = rawH * 0.012;
  const grp = new THREE.Group();
  const collar = new THREE.Mesh(
    new THREE.TorusGeometry(ringR, tubeR, 8, 22),
    new THREE.MeshStandardMaterial({ color: 0x8f3f2c, roughness: 0.74, metalness: 0.04 })
  );
  collar.rotation.x = Math.PI / 2;        // hole along the bone's Y (neck axis)
  collar.position.y = rawH * 0.110;       // low on the neck, above the shoulders
  collar.castShadow = true;
  grp.add(collar);
  const tag = new THREE.Mesh(
    new THREE.CylinderGeometry(tubeR * 2.3, tubeR * 2.3, tubeR * 0.8, 10),
    new THREE.MeshStandardMaterial({ color: 0xd8b24a, metalness: 0.85, roughness: 0.35 })
  );
  tag.rotation.x = Math.PI / 2;           // flat against the chest
  tag.position.set(0, collar.position.y - tubeR * 1.8, ringR * 1.0);
  tag.castShadow = true;
  grp.add(tag);
  neck.add(grp);
  parts.collar = grp;
  // Sample once after the posed bone matrices are ready. Recenter the ring
  // because the neck bone can sit off-center inside the ruff.
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
      const want = rs[Math.floor(rs.length / 2)] + tubeR * 0.35;
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

// Sculpt in the shared bind space of the two bundled breeds. The same
// displacement applies across material seams and to the eye and nose meshes,
// so they remain seated in the head as the original skeleton animates.
function sculptDogGeometry(mesh, breed) {
  const geometry = mesh.geometry;
  const { position: source, skinIndex, skinWeight } = geometry.attributes;
  const tailBones = mesh.skeleton.bones.map(bone => /^Tail[2-6]$/.test(bone.name));
  const positions = new Float32Array(source.count * 3);
  const husky = breed === "husky";
  const blend = THREE.MathUtils.smoothstep;
  for (let i = 0; i < source.count; i++) {
    const x = source.getX(i);
    const y = source.getY(i);
    const z = source.getZ(i);

    // Draw the bridge into a tapered muzzle and round the cheek behind it.
    // The husky has a longer muzzle and a less abrupt forehead transition.
    const head = blend(y, 2.05, 2.45) * blend(z, 1.28, 1.72);
    const muzzle = head * blend(z, husky ? 1.96 : 2.08, husky ? 2.40 : 2.48);
    const cheek = head * (1 - blend(z, 1.60, 2.06)) * (1 - blend(y, 2.69, 2.92));
    const bridge = head * blend(z, 1.65, 2.06) * blend(y, 2.56, 2.77);
    const eyeSocket = blend(Math.abs(x), 0.10, 0.20)
      * (1 - blend(Math.abs(y - 2.69), 0.03, 0.15))
      * (1 - blend(Math.abs(z - (husky ? 1.96 : 2.09)), 0.07, 0.22));
    const ear = head * blend(y, 2.81, 3.16);

    // Give the rib cage more depth behind the shoulders and taper the
    // abdomen before it meets the hind legs. Keep the paw contact surfaces.
    const trunk = blend(y, 0.80, 1.36) * (1 - blend(y, 1.92, 2.38));
    const ribs = trunk * blend(z, -0.42, 0.35) * (1 - blend(z, 0.88, 1.45));
    const waist = trunk * blend(z, -1.27, -0.83) * (1 - blend(z, -0.62, 0.12));
    const underside = 1 - blend(y, 1.24, 1.84);

    let tail = 0;
    for (let k = 0; k < 4; k++) {
      if (tailBones[skinIndex.getComponent(i, k)]) tail += skinWeight.getComponent(i, k);
    }
    // Keep the eye line and paw contacts fixed while changing the silhouette.
    // A shiba's ruff and cheek are fuller, and the husky has a flatter stop.
    positions[3 * i] = x * (1 - (husky ? 0.20 : 0.14) * muzzle
      + (husky ? 0.14 : 0.30) * cheek * (1 - eyeSocket) + 0.06 * ear
      + 0.15 * ribs - 0.18 * waist + tail * (husky ? 0.48 : 0.30));
    positions[3 * i + 1] = y - 0.09 * muzzle - (husky ? 0.09 : 0.035) * bridge * (1 - eyeSocket)
      + (husky ? -0.025 : 0.105) * ear + underside * (0.20 * waist - 0.16 * ribs);
    positions[3 * i + 2] = z + (husky ? 0.24 : 0.06) * muzzle - 0.08 * ear;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.boundingBox = null;
  geometry.boundingSphere = null;
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  smoothCreaseNormals(geometry, Math.cos(Math.PI / 3));
}

// One curved subdivision pass adds silhouette detail while retaining the
// authored UV seams and animation weights. Project edge midpoints onto the
// endpoint tangent planes (a quadratic normal patch), with a bounded bulge.
// Unlike smoothing the original vertices, this preserves paws, ear tips and
// the locations where separate eye/nose meshes meet the face.
function refineDogSurface(geometry) {
  const attrs = geometry.attributes;
  const pos = attrs.position, normal = attrs.normal;
  if (!pos || !normal || !attrs.skinWeight || geometry.morphAttributes.position) return;
  // Decode normalized integer attributes before interpolating; storing a
  // fractional bone weight back into a Uint8Array would truncate it to zero.
  const data = Object.fromEntries(Object.entries(attrs).map(([name, a]) =>
    [name, Array.from({ length: a.count * a.itemSize }, (_, i) =>
      a.getComponent(Math.floor(i / a.itemSize), i % a.itemSize))]));
  const indices = geometry.index ? Array.from(geometry.index.array)
    : Array.from({ length: pos.count }, (_, i) => i);
  const edges = new Map(), triangles = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  const na = new THREE.Vector3(), nb = new THREE.Vector3();
  const delta = new THREE.Vector3(), bend = new THREE.Vector3();
  const midpoint = (i, j) => {
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    if (edges.has(key)) return edges.get(key);
    const out = data.position.length / 3;
    for (const [name, attr] of Object.entries(attrs)) {
      for (let k = 0; k < attr.itemSize; k++) {
        data[name].push((attr.getComponent(i, k) + attr.getComponent(j, k)) * 0.5);
      }
    }
    // Bone indices are categorical: merge influences, keep the strongest
    // four, then normalize. Averaging indices would bind to unrelated bones.
    const weights = new Map();
    for (const v of [i, j]) for (let k = 0; k < 4; k++) {
      const bone = attrs.skinIndex.getComponent(v, k);
      weights.set(bone, (weights.get(bone) || 0) + attrs.skinWeight.getComponent(v, k) * 0.5);
    }
    const top = [...weights].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const total = top.reduce((sum, entry) => sum + entry[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      data.skinIndex[out * 4 + k] = top[k]?.[0] || 0;
      data.skinWeight[out * 4 + k] = (top[k]?.[1] || 0) / total;
    }
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, j);
    na.fromBufferAttribute(normal, i); nb.fromBufferAttribute(normal, j);
    delta.subVectors(b, a);
    bend.copy(na).multiplyScalar(-delta.dot(na))
      .addScaledVector(nb, delta.dot(nb)).multiplyScalar(0.125);
    bend.clampLength(0, delta.length() * 0.10);
    // Keep the sole flat, including along edges leading up from the toes.
    bend.multiplyScalar(THREE.MathUtils.smoothstep(Math.min(a.y, b.y), 0.08, 0.30));
    a.add(b).multiplyScalar(0.5).add(bend);
    a.toArray(data.position, out * 3);
    edges.set(key, out);
    return out;
  };
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = indices.slice(t, t + 3);
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    triangles.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  for (const [name, attr] of Object.entries(attrs)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(
      new (attr.normalized ? Float32Array : attr.array.constructor)(data[name]), attr.itemSize, false));
  }
  geometry.setIndex(triangles);
  for (const group of geometry.groups) { group.start *= 4; group.count *= 4; }
  geometry.computeVertexNormals();
  smoothCreaseNormals(geometry, Math.cos(Math.PI / 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

// Relax the coarse triangles in bind space before splitting them. A second,
// negative pass recovers volume lost by the first. Keep the sole and facial
// attachments fixed so animation contacts, eyes and nose stay registered.
function roundDogCoat(geometry) {
  geometry.deleteAttribute("normal");
  const rounded = mergeVertices(geometry, 1e-5);
  const pos = rounded.getAttribute("position");
  const index = rounded.index.array;
  const neighbours = Array.from({ length: pos.count }, () => new Set());
  for (let i = 0; i < index.length; i += 3) {
    const a = index[i], b = index[i + 1], c = index[i + 2];
    neighbours[a].add(b).add(c);
    neighbours[b].add(c).add(a);
    neighbours[c].add(a).add(b);
  }
  const step = THREE.MathUtils.smoothstep;
  const mask = Array.from({ length: pos.count }, (_, i) => {
    const y = pos.getY(i), z = pos.getZ(i);
    const paw = step(y, 0.006, 0.10);
    const face = step(z, 1.48, 1.75) * step(y, 2.15, 2.42);
    const ear = step(y, 2.80, 3.08) * step(z, 1.0, 1.6);
    return paw * (1 - Math.max(face, ear));
  });
  const current = pos.array;
  const previous = new Float32Array(current.length);
  for (const amount of [0.53, -0.54, 0.31]) {
    previous.set(current);
    for (let i = 0; i < pos.count; i++) {
      const adjacent = neighbours[i];
      if (!adjacent.size || mask[i] === 0) continue;
      const gain = amount * mask[i] / adjacent.size;
      for (const j of adjacent) {
        for (let axis = 0; axis < 3; axis++) {
          current[i * 3 + axis] += gain * (previous[j * 3 + axis] - previous[i * 3 + axis]);
        }
      }
    }
  }
  rounded.computeVertexNormals();
  smoothCreaseNormals(rounded, 0.43);
  geometry.dispose();
  return rounded;
}

function isCoatMaterial(material, breed) {
  return (breed === "husky" ? ["Material", "Material.001"] : ["Main", "Main_Light"]).includes(material.name);
}

// The source splits the light and dark coat into separate glTF primitives.
// They share a bind transform and skeleton. Combining them before refinement
// lets the rounded edge use normals from both sides of the old material seam.
function mergeDogCoat(model, breed) {
  const meshes = [];
  model.traverse(o => { if (o.isSkinnedMesh && isCoatMaterial(o.material, breed)) meshes.push(o); });
  const [first, ...rest] = meshes;
  if (!rest.length || rest.some(o => o.parent !== first.parent || o.skeleton.bones.length !== first.skeleton.bones.length
      || o.skeleton.bones.some((bone, i) => bone !== first.skeleton.bones[i]
        || !o.skeleton.boneInverses[i].equals(first.skeleton.boneInverses[i]))
      || !o.matrix.equals(first.matrix) || !o.bindMatrix.equals(first.bindMatrix))) return;
  for (const mesh of meshes) deinterleaveGeometry(mesh.geometry);
  const geometry = mergeGeometries(meshes.map(o => o.geometry));
  if (!geometry) return;
  for (const mesh of meshes) mesh.geometry.dispose();
  first.geometry = geometry;
  for (const mesh of rest) {
    mesh.material.dispose();
    if (mesh.skeleton !== first.skeleton) mesh.skeleton.dispose();
    mesh.removeFromParent();
  }
}

// Paint in bind space so marks wrap around the muzzle, chest and limbs.
// Tail and ear weights isolate those parts even when they overlap the torso.
function applyDogSurface(mesh, breed, coat, quality) {
  const material = mesh.material;
  const husky = breed === "husky";
  material.metalness = 0;
  if (!isCoatMaterial(material, breed)) {
    const eye = material.name.startsWith("Eyes_") || ["Material.002", "Material.003"].includes(material.name);
    material.roughness = eye ? 0.21 : 0.36;
    material.envMapIntensity = eye ? 0.85 : 0.55;
    if (material.name === "Eyes_White") material.color.setHex(0xa09788);
    if (material.name === "Material.003") material.color.setHex(0x879fa9);
    return;
  }

  const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
  const boneNames = mesh.skeleton.bones.map(bone => bone.name);
  const base = new THREE.Color(coat.color);
  const edge = new THREE.Color(husky ? 0x999087 : 0xd5a16a);
  const cream = new THREE.Color(husky ? 0xe3ded4 : 0xf0d9b2);
  const earLining = new THREE.Color(husky ? 0x8e7270 : 0xaf765e);
  const color = new THREE.Color();
  const colors = new Float32Array(position.count * 3);
  const step = THREE.MathUtils.smoothstep;

  for (let i = 0; i < position.count; i++) {
    const x = Math.abs(position.getX(i));
    const y = position.getY(i);
    const z = position.getZ(i);
    let tail = 0, ear = 0;
    for (let k = 0; k < 4; k++) {
      const bone = boneNames[skinIndex.getComponent(i, k)];
      const weight = skinWeight.getComponent(i, k);
      if (bone?.startsWith("Tail")) tail += weight;
      if (bone?.startsWith("Ear")) ear += weight;
    }
    const face = step(z, 1.38, 1.86) * step(y, 2.08, 2.42);
    const muzzle = face * step(z, husky ? 1.93 : 2.03, 2.28) * (1 - step(y, 2.62, 2.75));
    const blaze = face * step(y, 2.59, 2.70) * (1 - step(y, 2.86, 2.98))
      * (1 - step(x, 0.045, 0.13));
    const brow = face * step(y, 2.76, 2.84) * (1 - step(y, 2.87, 2.99))
      * step(x, 0.12, 0.20) * (1 - step(x, 0.26, 0.36));
    const cheek = face * (1 - step(y, 2.43 + x * 0.27, 2.61 + x * 0.27));
    const temple = face * step(x, 0.15, 0.26) * step(y, 2.56, 2.74);
    const chin = face * (1 - step(y, 2.29, 2.45));
    const bib = step(z, 0.77, 1.56) * (1 - step(x, 0.20, 0.46)) * step(y, 0.80, 1.68);
    const socks = 1 - step(y, husky ? 0.52 : 0.28, husky ? 1.06 : 0.74);
    const belly = (1 - step(y, 0.95, 1.43)) * (1 - step(x, 0.24, 0.45));
    const light = Math.max(muzzle, cheek * 0.97, bib, socks, belly * 0.88,
      husky ? Math.max(blaze, brow * 0.83) : blaze * 0.10);
    const saddle = step(y, 1.25, 1.93);
    color.copy(base).lerp(edge, (1 - saddle) * (husky ? 0.34 : 0.29));
    color.multiplyScalar(1 - (husky ? 0.42 * temple : 0.14 * saddle) - 0.12 * chin);
    const maskEdge = husky ? light * (1 - 0.48 * temple) : light;
    color.lerp(cream, maskEdge * (1 - ear) * (1 - tail));
    color.lerp(earLining, ear * face * step(y, 2.83, 3.04) * 0.48);
    color.lerp(cream, tail * (husky ? 0.26 : 0.42) * step(y, 1.88, 2.68));
    color.toArray(colors, i * 3);
  }
  mesh.geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  mesh.userData.dogCoat = true;
  material.color.setRGB(1, 1, 1);
  material.vertexColors = true;
  material.roughness = 0.88;
  material.envMapIntensity = 0.48;
  if (quality === "low") return;

  // Fine fur follows the bind pose. Attenuate it below pixel scale so it
  // stays stable as the dog moves away from the camera.
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCoatPoint;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvCoatPoint = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vCoatPoint;
float coatHash(vec3 p) { return fract(sin(dot(p, vec3(17.1, 53.7, 91.3))) * 43758.5453); }
float coatNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  vec4 a = vec4(coatHash(i), coatHash(i + vec3(1,0,0)), coatHash(i + vec3(0,1,0)), coatHash(i + vec3(1,1,0)));
  vec4 b = vec4(coatHash(i + vec3(0,0,1)), coatHash(i + vec3(1,0,1)), coatHash(i + vec3(0,1,1)), coatHash(i + vec3(1,1,1)));
  vec4 c = mix(a, b, f.z);
  return mix(mix(c.x,c.y,f.x), mix(c.z,c.w,f.x), f.y);
}`)
      .replace("#include <color_fragment>", `#include <color_fragment>
vec3 coatUV = vec3(vCoatPoint.x * 105.0, vCoatPoint.y * 85.0,
  (vCoatPoint.z - vCoatPoint.y * 0.42) * 28.0);
float fine = (coatNoise(coatUV) - 0.5) * (1.0 - smoothstep(0.35, 1.35, length(fwidth(coatUV))));
float tufts = coatNoise(coatUV * vec3(0.12, 0.085, 0.21)) - 0.5;
float guardHair = smoothstep(0.58, 0.86, coatNoise(coatUV * vec3(0.54, 0.58, 0.19)));
float muzzle = smoothstep(1.82, 2.18, vCoatPoint.z);
float whiskerPad = muzzle * exp(-pow((vCoatPoint.y - 2.52) / 0.094, 2.0))
  * smoothstep(0.045, 0.12, abs(vCoatPoint.x));
float pores = smoothstep(0.72, 0.9, coatNoise(coatUV * vec3(1.6, 1.3, 4.5)));
float alongLip = smoothstep(1.82, 2.04, vCoatPoint.z) * (1.0 - smoothstep(2.40, 2.54, vCoatPoint.z));
float lipY = 2.34 + 0.13 * (vCoatPoint.z - 2.1);
float crease = alongLip * exp(-pow((vCoatPoint.y - lipY) / 0.018, 2.0));
diffuseColor.rgb *= 1.0 + fine * 0.27 + tufts * 0.27 - guardHair * 0.13
  - pores * whiskerPad * 0.31 - crease * 0.57;`);
  };
  material.customProgramCacheKey = () => "dogCoat";
}

function buildDog(opts = {}) {
  const breed = opts.breed === "husky" ? "husky" : "shiba";
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

  const url = DOG_MODELS[breed];
  let savedCoat;
  try { savedCoat = localStorage.getItem("fobia.coat.dog." + breed); } catch {}
  const palette = DOG_COATS[breed];
  const coat = palette.find(option => option.id === (opts.coat?.id ?? savedCoat)) ?? palette[0];
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
      }
    });
    const quality = opts.quality || sceneQuality();
    model.updateMatrixWorld(true);
    mergeDogCoat(model, breed);
    model.traverse((o) => {
      if (!o.isMesh) return;
      sculptDogGeometry(o, breed);
      if (isCoatMaterial(o.material, breed)) o.geometry = roundDogCoat(o.geometry);
      if (quality !== "low") refineDogSurface(o.geometry);
      applyDogSurface(o, breed, coat, quality);
    });

    // Animation: a named action map over the 12 clips the pack ships. Created
    // BEFORE measuring so the rig can be posed for measurement.
    const mixer = new THREE.AnimationMixer(model);
    parts.mixer = mixer;
    parts.actions = {};
    gltf.animations.forEach((clip) => { parts.actions[clip.name] = mixer.clipAction(clip); });
    let previewAction = null;
    parts.play = (name, fade, { timeScale = 1 } = {}) => {
      const next = parts.actions[name];
      if (!next || next === previewAction) return;
      next.reset().setEffectiveTimeScale(timeScale).play();
      if (previewAction) previewAction.crossFadeTo(next, fade, false);
      previewAction = next;
    };
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

    const head = model.getObjectByName("Head");
    if (head) {
      parts.muzzle = new THREE.Object3D();
      parts.muzzle.position.copy(head.worldToLocal(parts.mouth.position.clone()));
      head.add(parts.muzzle);
    }

    // Collar + tag: sized from the raw bind height, rides the neck bone.
    try { attachDogCollar(model, parts, rawH); } catch {}

    parts.model = model;

    addDogFurShells(model, parts, quality, breed);
    return compileBeforeAdd(dog, model)
      .then(() => {
        if (dog.userData.disposed) {
          disposeObject(model);
          return;
        }
        try {
          dog.add(model);
          dog.userData.ready = true;
          if (typeof dog.userData.onReady === "function") dog.userData.onReady();
        } catch (e) { console.warn("[dogs] ready:", e); }
      });
  }).catch((err) => {
    if (dog.userData.disposed) return;
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

// Shells share the coat's geometry and skeleton. Strands are hashed in
// bind space and grow before skinning so they follow the animated surface.
function addDogFurShells(model, parts, q, breed) {
  if (q === "low" || (q === "medium" && IS_MOBILE)) return;
  const N = q === "high" ? 4 : 2;
  const S = parts.modelScale || 1;
  const H = parts.height || 0.6;
  const sz = Math.sqrt(H / 0.56);
  const furLen = (breed === "husky" ? 0.014 : 0.009) * sz;              // metres of fur at the outermost shell
  const cell = 0.0021 * sz;               // strand spacing, metres
  const targets = [];
  model.traverse((o) => {
    if (o.userData.dogCoat) targets.push(o);
  });
  const shells = [];
  const fade = { value: 1 };
  for (const src of targets) {
    const baseMat = src.material;
    for (let i = 1; i <= N; i++) {
      const h = i / (N + 1);
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
          .replace("#include <begin_vertex>", `#include <begin_vertex>
// Short hair at the feet and muzzle, fuller coat around the ruff.
float bodyFur = smoothstep(0.3, 1.0, position.y);
float face = smoothstep(1.48, 1.88, position.z) * smoothstep(2.2, 2.5, position.y);
float muzzleFur = 1.0 - 0.91 * face;
float ruff = smoothstep(0.75, 1.4, position.z) * (1.0 - smoothstep(2.2, 2.75, position.y));
muzzleFur *= 1.0 - 0.72 * smoothstep(2.76, 3.06, position.y) * smoothstep(0.9, 1.7, position.z);
vec3 growth = normalize(normal + vec3(0.0, -0.18, -0.34));
transformed += growth * (uFurH * uFurLen * mix(0.12, 0.76 + 0.50 * ruff, bodyFur) * muzzleFur);
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
diffuseColor.rgb *= mix(0.93, 1.05, uFurH);`);
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
      shell.userData.ssaoSkip = true;
      src.parent.add(shell);
      shells.push(shell);
    }
  }
  parts.furShells = shells;
  parts.furFade = fade;
}

export { buildDog };
