// PhobiaPhysics (Rapier rigid bodies, fetched only by scenes that use them)
// and PhobiaGrab (take / throw a physical prop).

import * as THREE from "three";

// ---------- PhobiaPhysics — a real physical layer (Rapier, lazy) ----------
// The single biggest realism gap left was that the world never answered the
// player's hands: outside scripted moments, nothing could be picked up,
// thrown, or knocked. This module owns a Rapier world per scene mount.
//
// Loading: rapier3d-compat used to be one self-contained 2 MB ESM with the
// WASM inlined as base64; scripts/split-rapier.cjs now ships it as a 126 KB
// script plus rapier.wasm (1.4 MB, ~520 KB gzipped against ~755 KB for the
// whole inlined bundle), so the phone neither parses a 2 MB JS string nor
// base64-decodes it, and the browser compiles the module off the main thread.
// A direct import() of the script failed under the service worker while a
// plain fetch() succeeds, so it is fetched and imported through a blob URL —
// which is why the wasm address is handed over as an absolute URL in
// globalThis.__rapierWasmUrl (a relative one would resolve against blob:). Loaded lazily on the first scene that asks; the
// landing pays nothing.
//
// Lifecycle: begin() (re)creates the world; end() frees it — Rapier is WASM,
// a dropped world without free() is a genuine memory leak, so unmount()
// calls end() unconditionally.
const PhobiaPhysics = (() => {
  const CDN = "assets/vendor/rapier/rapier.es.js"; // self-hosted (rapier3d-compat 0.12.0, wasm split out)
  const WASM = "assets/vendor/rapier/rapier.wasm";
  let R = null, loadP = null;
  let world = null, props = [], groundY = 0;
  let pendingBoxes = null;
  let onImpact = null;

  function load() {
    if (loadP) return loadP;
    try { globalThis.__rapierWasmUrl = new URL(WASM, location.href).href; } catch {}
    loadP = fetch(CDN)
      .then((r) => { if (!r.ok) throw new Error("rapier " + r.status); return r.text(); })
      .then((txt) => {
        const u = URL.createObjectURL(new Blob([txt], { type: "text/javascript" }));
        return import(u).finally(() => URL.revokeObjectURL(u));
      })
      .then(async (m) => { const mod = m.default ?? m; await mod.init(); R = mod; return mod; })
      .catch((e) => { console.warn("[physics] unavailable:", e); return null; });
    return loadP;
  }

  // Each begin() takes a ticket; end() (scene unmount) invalidates it. If the
  // scene left while Rapier was still loading, the world it asked for is
  // never built — it used to be, and then stepped every frame of the NEXT
  // scene, since that scene's unmount had nothing to free.
  let gen = 0;
  async function begin(opts = {}) {
    const ticket = ++gen;
    const mod = await load();
    if (!mod || ticket !== gen) return null;
    end();
    groundY = opts.groundY ?? 0;
    world = new R.World({ x: 0, y: -9.81, z: 0 });
    // Ground plane + generous room border so nothing ever escapes to -∞.
    addStaticBox(0, groundY - 0.5, 0, 60, 0.5, 60);
    if (pendingBoxes) { addStaticBoxes(pendingBoxes); pendingBoxes = null; }
    return world;
  }
  function end() {
    gen++;
    if (world) { try { world.free(); } catch {} }
    world = null; props = []; onImpact = null; pendingBoxes = null;
  }

  function addStaticBox(cx, cy, cz, hx, hy, hz) {
    if (!world) return;
    const rb = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
    world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(0.8), rb);
  }
  // XZ boxes from the movement system's auto-collider sweep (no Y info) —
  // extruded from the floor. Used as a fallback; prefer addStaticFromScene.
  function addStaticBoxes(boxes) {
    if (!world) { pendingBoxes = boxes; return; }
    for (const b of boxes) {
      addStaticBox((b.minX + b.maxX) / 2, groundY + 0.55, (b.minZ + b.maxZ) / 2,
        Math.max(0.03, (b.maxX - b.minX) / 2), 0.55, Math.max(0.03, (b.maxZ - b.minZ) / 2));
    }
  }
  // Physics needs REAL heights (a prop must rest ON a tabletop, not on an
  // extruded column above it), so this walks the scene with the same filter
  // rules as the movement sweep but keeps Y extents.
  const _pb = new THREE.Box3();
  function addStaticFromScene(scene, camera) {
    if (!world || !scene) return 0;
    let n = 0;
    scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const gtype = o.geometry.type;
      if (gtype === "PlaneGeometry" || gtype === "CircleGeometry") return;
      for (let p = o; p; p = p.parent) {
        if (p === camera) return;
        if (p.userData && (p.userData.parts || p.userData.noCollide || p.userData._phys)) return;
      }
      _pb.setFromObject(o);
      if (!isFinite(_pb.min.x) || !isFinite(_pb.max.x)) return;
      const sx = _pb.max.x - _pb.min.x, sy = _pb.max.y - _pb.min.y, sz = _pb.max.z - _pb.min.z;
      if (sx > 7 || sz > 7) return;                    // environment shells
      if (sx < 0.05 && sz < 0.05) return;              // wires / stems
      if (_pb.min.y > groundY + 2.2) return;           // ceiling fixtures
      addStaticBox((_pb.min.x + _pb.max.x) / 2, (_pb.min.y + _pb.max.y) / 2, (_pb.min.z + _pb.max.z) / 2,
        Math.max(0.02, sx / 2), Math.max(0.02, sy / 2), Math.max(0.02, sz / 2));
      n++;
    });
    return n;
  }

  function addProp(mesh, opts = {}) {
    if (!world || !mesh) return null;
    mesh.updateWorldMatrix(true, false);
    const p = mesh.getWorldPosition(new THREE.Vector3());
    const q = mesh.getWorldQuaternion(new THREE.Quaternion());
    const rb = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(p.x, p.y, p.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setLinearDamping(0.2).setAngularDamping(0.5));
    const col = opts.shape === "ball"
      ? R.ColliderDesc.ball(opts.r ?? 0.05)
      : R.ColliderDesc.cuboid(opts.half?.x ?? 0.05, opts.half?.y ?? 0.05, opts.half?.z ?? 0.05);
    col.setRestitution(opts.restitution ?? 0.3).setFriction(0.75).setDensity(opts.density ?? 500);
    world.createCollider(col, rb);
    const rec = { mesh, rb, held: false, lastSpeed: 0, name: opts.name || "prop", material: opts.material, gripRadius: opts.r ?? opts.half?.z ?? 0.05 };
    mesh.userData.grabbable = opts.grab !== false;
    mesh.userData._phys = rec;
    // Invisible to the SCENES' own pickers (dogs' floor-throw must not fire
    // through a mug), but PhobiaGrab checks _phys before noPick, so the grab
    // system still sees it.
    mesh.userData.noPick = true;
    props.push(rec);
    return rec;
  }

  function setHeld(rec, held) {
    if (!world || !rec) return;
    rec.held = held;
    rec.rb.setBodyType(held ? R.RigidBodyType.KinematicPositionBased : R.RigidBodyType.Dynamic, true);
    if (!held) rec.rb.wakeUp();
  }
  const _hq = { x: 0, y: 0, z: 0, w: 1 };
  function moveHeld(rec, pos, quat) {
    if (!world || !rec || !rec.held) return;
    rec.rb.setNextKinematicTranslation({ x: pos.x, y: pos.y, z: pos.z });
    if (quat) { _hq.x = quat.x; _hq.y = quat.y; _hq.z = quat.z; _hq.w = quat.w; rec.rb.setNextKinematicRotation(_hq); }
    rec.mesh.position.copy(pos);
    if (quat) rec.mesh.quaternion.copy(quat);
  }
  function launch(rec, vx, vy, vz) {
    if (!world || !rec) return;
    setHeld(rec, false);
    rec.rb.setLinvel({ x: vx, y: vy, z: vz }, true);
    rec.rb.setAngvel({ x: (Math.random() - 0.5) * 4, y: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 4 }, true);
    rec.lastSpeed = Math.hypot(vx, vy, vz);
  }

  function step(dt) {
    if (!world) return;
    // Nothing held and every prop asleep (Rapier sleeps a body that has come
    // to rest): the world has nothing to integrate, so don't step it. That
    // is nearly all of a scene. A throw wakes its body (launch), a grab turns
    // it kinematic (held), and sleeping bodies are woken by any contact.
    let awake = false;
    for (let i = 0; i < props.length; i++) {
      const rec = props[i];
      if (rec.held || !rec.rb.isSleeping()) { awake = true; break; }
    }
    if (!awake) return;
    world.timestep = Math.min(0.033, Math.max(0.004, dt || 0.016));
    world.step();
    for (const rec of props) {
      if (rec.held) continue;
      const tr = rec.rb.translation(), rot = rec.rb.rotation();
      rec.mesh.position.set(tr.x, tr.y, tr.z);
      rec.mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w);
      const v = rec.rb.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      // Impact = sharp deceleration. The heuristic beats wiring Rapier's
      // event queue for the handful of props a scene carries.
      if (rec.lastSpeed - sp > 1.0 && rec.lastSpeed > 1.3) {
        const strength = Math.min(1, (rec.lastSpeed - sp) / 5);
        try {
          window.PhobiaAudio?.propImpact(rec.material, strength, tr);
        } catch {}
        if (onImpact) { try { onImpact(rec, strength, tr); } catch {} }
      }
      rec.lastSpeed = sp;
    }
  }

  return {
    begin, end, step, addProp, addStaticBoxes, addStaticFromScene, addStaticBox,
    setHeld, moveHeld, launch,
    setOnImpact(fn) { onImpact = fn; },
    active() { return !!world; },
    props() { return props; },
  };
})();
window.PhobiaPhysics = PhobiaPhysics;

// ---------- PhobiaGrab — pick up, hold, throw ----------
// Click a grabbable prop to take it (the reach arm meets it); click again to
// throw it where you're looking. Runs BEFORE the scene's own click handler,
// so scripted interactions (pet the dog, throw the fetch ball) are untouched
// unless the click actually lands on a physical prop.
const PhobiaGrab = (() => {
  let held = null;
  let pickup = null;
  let releaseT = null;
  let liftT = 0;
  let ownsReach = null;
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _target = new THREE.Vector3();
  const _palm = new THREE.Vector3();
  const _start = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0), _down = new THREE.Vector3(0, -1, 0);
  const _dir = new THREE.Vector3();

  // When this module last took a click (grab or throw). Scenes with their
  // own canvas click handlers check it so one tap doesn't do two things —
  // the dog room used to also throw a fetch ball at whatever was behind the
  // prop you had just picked up.
  let lastConsumedAt = -1e9;
  function click(e, camera, scene, renderer, hands, controls, body) {
    if (!PhobiaPhysics.active() || !hands) return false;
    if (held) {
      if (releaseT == null) {
        releaseT = 0;
        body?.playThrow({ release: 0.5 });
        hands.playToss(0.5);
      }
      lastConsumedAt = performance.now();
      return true;
    }
    if (pickup) {
      lastConsumedAt = performance.now();
      return true;
    }
    const locked = controls && controls.isPointerLocked && controls.isPointerLocked();
    if (locked || !e) { _ndc.set(0, 0); }
    else {
      const rect = renderer.domElement.getBoundingClientRect();
      _ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1,
               -((e.clientY - rect.top) / rect.height) * 2 + 1);
    }
    _ray.setFromCamera(_ndc, camera);
    const hits = _ray.intersectObjects(scene.children, true);
    for (const h of hits) {
      if (!h.object.isMesh) continue;
      let rec = null;
      let ignored = false;
      for (let p = h.object; p; p = p.parent) {
        if (!p.visible) { ignored = true; break; }
        if (p.userData.grabbable && p.userData._phys) { rec = p.userData._phys; break; }
        if (p.userData.noPick) { ignored = true; break; }
      }
      if (ignored) continue;
      if (!rec) {
        const material = Array.isArray(h.object.material)
          ? h.object.material[h.face?.materialIndex || 0] : h.object.material;
        if (material?.transparent && material.opacity < 0.95) continue;
        break;
      }
      const pos = controls?.position || camera.position;
      if (Math.hypot(h.point.x - pos.x, h.point.z - pos.z) > 1.05) break;
      pickup = { rec, point: rec.mesh.worldToLocal(h.point.clone()), time: 0 };
      lastConsumedAt = performance.now();
      return true;
    }
    return false;
  }

  // Set the reach before either view evaluates its pose. Retain ownership of
  // only this target so a finished grab never clears a new scene interaction.
  function pose(camera, hands, controls) {
    if (!hands) return;
    if (ownsReach && hands._reach === ownsReach) hands.clearReachTarget();
    ownsReach = null;
    if (!pickup && (!held || releaseT != null)) return;
    if (pickup) {
      pickup.rec.mesh.localToWorld(_target.copy(pickup.point));
      if (controls?.cameraMode === "fp") {
        controls.setEyeDrop(Math.min(0.42, Math.max(0, controls.position.y - _target.y - 0.38)));
      }
    } else if (controls) {
      const { position, yaw } = controls;
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      _target.set(position.x - sin * 0.37 + cos * 0.23,
                  position.y - 0.52,
                  position.z - cos * 0.37 - sin * 0.23);
    } else {
      camera.localToWorld(_target.set(0.23, -0.52, -0.37));
    }
    hands.setReachTarget(_target, { grip: "wrap", curl: held ? 1.12 : 0.45,
      normal: held ? _down : _up, palm: true, contact: false, maxReach: 0.79 });
    ownsReach = hands._reach;
  }

  function update(camera, hands, controls, body, dt) {
    if (!pickup && !held) return;
    const rig = controls?.cameraMode === "tp" && body ? body : hands;
    if (!rig) return;
    if (pickup) {
      pickup.time += dt;
      pickup.rec.mesh.localToWorld(_target.copy(pickup.point));
      if (rig.palmPoint(_palm).distanceTo(_target) < 0.115 && hands._reachStrength > 0.55) {
        held = pickup.rec;
        pickup = null;
        liftT = 0;
        held.mesh.getWorldPosition(_start);
        PhobiaPhysics.setHeld(held, true);
        try { window.PhobiaAudio?.ui?.("tick"); } catch {}
      } else if (pickup.time > 1.25) {
        pickup = null;
      }
    }
    if (!held) return;
    liftT = Math.min(1, liftT + dt / 0.20);
    rig.palmPoint(_palm, held.gripRadius).lerp(_start, (1 - liftT) ** 2);
    PhobiaPhysics.moveHeld(held, _palm, null);
    if (releaseT != null) {
      releaseT += dt;
      if (releaseT >= 0.5) {
        // Use the posed hand's position even if release lands between steps.
        held.rb.setTranslation(_palm, true);
        throwHeld(camera);
        releaseT = null;
      }
    }
  }

  function throwHeld(camera) {
    if (!held) return;
    const rec = held; held = null;
    _dir.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const sp = 5.4;
    PhobiaPhysics.launch(rec, _dir.x * sp, _dir.y * sp + 1.4, _dir.z * sp);
    try { window.PhobiaExperiments && PhobiaExperiments.signal("prop.thrown"); } catch {}
  }
  function reset() {
    if (held) { try { PhobiaPhysics.setHeld(held, false); } catch {} }
    held = pickup = ownsReach = releaseT = null;
    lastConsumedAt = -1e9;
  }
  return {
    click, pose, update, reset,
    holding() { return !!held; },
    consumedRecently(ms = 150) { return performance.now() - lastConsumedAt < ms; },
  };
})();
window.PhobiaGrab = PhobiaGrab;

export { PhobiaPhysics, PhobiaGrab };
