// PhobiaPhysics (Rapier rigid bodies, fetched only by scenes that use them)
// and PhobiaGrab (take / throw a physical prop).

import * as THREE from "three";

// ---------- PhobiaPhysics — a real physical layer (Rapier, lazy) ----------
// The single biggest realism gap left was that the world never answered the
// player's hands: outside scripted moments, nothing could be picked up,
// thrown, or knocked. This module owns a Rapier world per scene mount.
//
// Loading: rapier3d-compat is one self-contained 2 MB ESM with the WASM
// inlined (self-hosted under assets/vendor/rapier) — but a direct import()
// failed under the service worker while a plain fetch() succeeds, so it is fetched and imported
// through a blob URL. Loaded lazily on the first scene that asks; the
// landing pays nothing.
//
// Lifecycle: begin() (re)creates the world; end() frees it — Rapier is WASM,
// a dropped world without free() is a genuine memory leak, so unmount()
// calls end() unconditionally.
const PhobiaPhysics = (() => {
  const CDN = "assets/vendor/rapier/rapier.es.js"; // self-hosted (rapier3d-compat 0.12.0)
  let R = null, loadP = null;
  let world = null, props = [], groundY = 0;
  let pendingBoxes = null;
  let onImpact = null;

  function load() {
    if (loadP) return loadP;
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

  async function begin(opts = {}) {
    const mod = await load();
    if (!mod) return null;
    end();
    groundY = opts.groundY ?? 0;
    world = new R.World({ x: 0, y: -9.81, z: 0 });
    // Ground plane + generous room border so nothing ever escapes to -∞.
    addStaticBox(0, groundY - 0.5, 0, 60, 0.5, 60);
    if (pendingBoxes) { addStaticBoxes(pendingBoxes); pendingBoxes = null; }
    return world;
  }
  function end() {
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
    const rec = { mesh, rb, held: false, lastSpeed: 0, name: opts.name || "prop" };
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
          if (window.PhobiaAudio && PhobiaAudio.ballBounce) {
            PhobiaAudio.ballBounce(0.25 + strength * 0.5, { x: tr.x, y: tr.y, z: tr.z });
          }
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
  const _ray = new THREE.Raycaster();
  const _ndc = new THREE.Vector2();
  const _hold = new THREE.Vector3();
  const _dir = new THREE.Vector3();

  // When this module last took a click (grab or throw). Scenes with their
  // own canvas click handlers check it so one tap doesn't do two things —
  // the dog room used to also throw a fetch ball at whatever was behind the
  // prop you had just picked up.
  let lastConsumedAt = -1e9;
  function click(e, camera, scene, renderer, hands, controls) {
    if (!PhobiaPhysics.active()) return false;
    if (held) { throwHeld(camera); lastConsumedAt = performance.now(); return true; }
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
      let rec = null;
      for (let p = h.object; p; p = p.parent) {
        if (p.userData && p.userData._phys && p.userData.grabbable) { rec = p.userData._phys; break; }
        if (p.userData && p.userData.noPick) break;
      }
      if (!rec) continue;
      // Reach is measured from the PLAYER, not the camera: in third person
      // the camera hangs metres behind the body, and camera-relative reach
      // made every prop untouchable exactly there.
      const px = controls && controls.position ? controls.position.x : camera.position.x;
      const pz = controls && controls.position ? controls.position.z : camera.position.z;
      const pd = Math.hypot(h.point.x - px, h.point.z - pz);
      if (pd > 1.9) return false;   // visible but out of reach — the scene may still want the click
      held = rec;
      _ctl = controls || null;
      try { window.PhobiaAudio && PhobiaAudio.ui && PhobiaAudio.ui("tick"); } catch {}
      PhobiaPhysics.setHeld(rec, true);
      lastConsumedAt = performance.now();
      return true;
    }
    return false;
  }

  // Per-frame: carry the held prop at the BODY's hold point — chest height,
  // half a metre ahead of the way the player faces. Camera-relative holding
  // parked the object beside the orbit camera in third person. The throw
  // still aims with the camera (throw where you look). MUST run before
  // PhobiaPhysics.step().
  let _ctl = null;
  function update(camera, hands) {
    if (!held) return;
    if (_ctl && _ctl.position) {
      const yaw = _ctl.yaw || 0;
      _hold.set(
        _ctl.position.x - Math.sin(yaw) * 0.48,
        _ctl.position.y - 0.28,
        _ctl.position.z - Math.cos(yaw) * 0.48
      );
    } else {
      camera.getWorldPosition(_hold);
      _dir.set(0.16, -0.18, -0.52).applyQuaternion(camera.quaternion);
      _hold.add(_dir);
    }
    PhobiaPhysics.moveHeld(held, _hold, null);
    if (hands && hands.setReachTarget) {
      hands.setReachTarget(_hold, { hand: "right", grip: "wrap", curl: 1.0, maxReach: 1.1 });
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
    held = null;
  }
  return {
    click, update, reset,
    holding() { return !!held; },
    consumedRecently(ms = 150) { return performance.now() - lastConsumedAt < ms; },
  };
})();
window.PhobiaGrab = PhobiaGrab;

export { PhobiaPhysics, PhobiaGrab };
