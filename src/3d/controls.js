// Player input: the touch joystick and FPControls — first / third-person
// camera, walking, look, pointer lock.

import * as THREE from "three";
import { IS_COARSE_POINTER } from "./renderer.js";
import { _hsat } from "./human-base.js";

// ---------- Touch joystick for mobile movement ----------
// Feeds FPControls an ANALOG move axis (magnitude-scaled), and tracks only its
// own pointer id so a second finger can drag to LOOK at the same time — the
// graded creep-forward the whole approach design depends on, with simultaneous
// steering. (Was binary 8-way via boolean keys, full-speed-or-frozen, and it
// hijacked any finger's move.)
class TouchJoystick {
  constructor(container, controls) {
    this.controls = controls;
    this.dom = document.createElement("div");
    this.dom.className = "joystick";
    this.dom.innerHTML = '<div class="joystick-thumb"></div>';
    container.appendChild(this.dom);
    this.thumb = this.dom.querySelector(".joystick-thumb");
    this.active = false;
    this.pid = -1;
    this.center = { x: 0, y: 0 };
    this.maxRadius = 44;
    this._down = this._down.bind(this);
    this._move = this._move.bind(this);
    this._up = this._up.bind(this);
    this.dom.addEventListener("pointerdown", this._down, { passive: false });
    window.addEventListener("pointermove", this._move, { passive: false });
    window.addEventListener("pointerup",   this._up);
    window.addEventListener("pointercancel", this._up);
  }
  _down(e) {
    e.preventDefault(); e.stopPropagation();
    this.active = true;
    this.pid = e.pointerId;
    const r = this.dom.getBoundingClientRect();
    this.center.x = r.left + r.width / 2;
    this.center.y = r.top + r.height / 2;
    try { this.dom.setPointerCapture(e.pointerId); } catch {}
    this._move(e);
  }
  _move(e) {
    if (!this.active || e.pointerId !== this.pid) return;   // ignore other fingers
    e.stopPropagation();
    let dx = e.clientX - this.center.x;
    let dy = e.clientY - this.center.y;
    const m = Math.hypot(dx, dy);
    if (m > this.maxRadius) {
      dx = dx / m * this.maxRadius;
      dy = dy / m * this.maxRadius;
    }
    this.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    // Analog: x = right(+), y = down(+). FPControls applies the dead zone and
    // scales walk speed by magnitude.
    this.controls.setMoveAxis(dx / this.maxRadius, dy / this.maxRadius);
  }
  _up(e) {
    if (!this.active || e.pointerId !== this.pid) return;
    this.active = false;
    this.pid = -1;
    this.thumb.style.transform = "";
    this.controls.setMoveAxis(0, 0);
  }
  dispose() {
    this.dom.removeEventListener("pointerdown", this._down);
    window.removeEventListener("pointermove", this._move);
    window.removeEventListener("pointerup",   this._up);
    window.removeEventListener("pointercancel", this._up);
    if (this.dom.parentNode) this.dom.parentNode.removeChild(this.dom);
  }
}

// ---------- First-person controls ----------
// Drag/touch to look. WASD or arrow keys to move (when mode === "walkable").
// Each scene supplies an initial camera position, look direction, and movement
// bounds — controls own the camera position and rotation thereafter.
class FPControls {
  constructor(camera, dom, opts = {}) {
    this.camera = camera;
    this.dom = dom;
    this.opts = Object.assign({
      mode: "lookOnly",     // "lookOnly" | "walkable"
      initialPos: [0, 0, 0],
      initialYaw: 0,
      initialPitch: 0,
      bounds: null,         // { minX, maxX, minZ, maxZ } in walkable mode
      speed: 2.5,           // units per second
      lookSpeed: 0.0045,    // radians per pixel
      // Smoothed look ON by default (10 Hz cutoff ≈ 1.5 frames of lag —
      // imperceptible latency that kills raw-delta stair-stepping). Scenes
      // may still pass their own value, or 0 to opt out.
      lookSmoothing: 10,
      pitchMin: -Math.PI / 2 + 0.15,
      pitchMax:  Math.PI / 2 - 0.15,
      yawMin: -Infinity,
      yawMax:  Infinity,
    }, opts);

    this.position = new THREE.Vector3().fromArray(this.opts.initialPos);
    this.yaw = this.opts.initialYaw;
    this.pitch = this.opts.initialPitch;
    this.keys = Object.create(null);
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
    this.enabled = true;

    // Camera mode — "fp" (first-person, default) puts the camera at the
    // player's eye level. "tp" (third-person) pulls it back so the user can
    // see their own character. The body follows controls.position regardless.
    // Persisted in localStorage so the user keeps their preference.
    let savedMode = "fp";
    try { savedMode = localStorage.getItem("fobia.cameraMode") || "fp"; } catch {}
    this.cameraMode = savedMode === "tp" ? "tp" : "fp";
    this.tpDistance = 4.5;     // metres behind the head — wider framing so
                                // the whole character + immediate environment
                                // both fit in view (was 3.4)
    this.tpHeight = 0.55;      // metres above head — gentler down-tilt (was 0.95)
                                // so we look AT the character, not down on top of them
    this.tpSubject = null;     // {x, z} a scene wants kept in the TP shot (two-shot framing)
    this.tpShoulder = 0.10;    // tiny over-the-shoulder bias — was 0.45 which
                                // pushed the character too far left in frame
    // Solid obstacles the player can't walk through (props, the dog). Each is
    // {x, z, r}; scenes set them via setObstacles(). The player has its own
    // body radius so it stops a little short rather than overlapping.
    this.obstacles = null;
    this.bodyRadius = 0.30;
    this.tpBlend = this.cameraMode === "tp" ? 1 : 0;
    // Smoothed camera position for damped follow — populated lazily on the
    // first TP-mode update so the initial position snaps without lag.
    this._tpSmoothPos = null;
    this._tpSmoothLook = null;

    // ---- Pointer Lock (opt-in, desktop only; see enablePointerLock) ----
    // _plArmed gates the actual capture: enablePointerLock() only wires the
    // listeners, but a plain canvas click NEVER grabs the cursor unless the
    // user explicitly opted in (the "Mouse look" button → requestLockNow()).
    // This is what fixes the "I moved the mouse and got trapped in the game"
    // complaint — look works via drag by default, capture is a deliberate act.
    this._plOn = false;
    this._plArmed = false;
    this._plLocked = false;
    this._lockChangeAt = 0;
    // ---- Smoothed look (opt-in via opts.lookSmoothing = Hz cutoff) ----
    this._yawT = null;
    this._pitchT = null;
    // ---- Fear-modulated gait (opt-in via opts.fearGait) ----
    this._fearGaitOn = !!this.opts.fearGait;
    this._getFear = typeof this.opts.fearGait === "function"
      ? this.opts.fearGait
      : () => (window.PhobiaFear ? window.PhobiaFear.get() : 0);
    this._fearRampSm = 0;
    this._hesT = null;        // countdown to the next hesitation catch
    this._hesHold = 0;        // active catch remaining
    this._trmT = 0;           // tremble phase
    this._speedNorm = 1;      // normalized velocity, smoothed (bob/step gain)

    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp   = this._onUp.bind(this);
    this._onKey  = this._onKey.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onPlChange = this._onPlChange.bind(this);
    this._onPlError = this._onPlError.bind(this);
    // Clear all held keys when the window loses focus / is hidden — otherwise a
    // keyup lands on another window while W is down and the avatar keeps walking
    // forward (into the phobia trigger) on its own until you tap the key again.
    this._onBlur = () => { this.keys = Object.create(null); this._moveAxis = null; };

    dom.style.touchAction = "none";
    dom.style.cursor = "grab";
    dom.addEventListener("pointerdown", this._onDown);
    window.addEventListener("pointermove", this._onMove);
    window.addEventListener("pointerup", this._onUp);
    window.addEventListener("pointercancel", this._onUp);
    window.addEventListener("keydown", this._onKey);
    window.addEventListener("keyup",   this._onKeyUp);
    window.addEventListener("blur", this._onBlur);
    document.addEventListener("visibilitychange", this._onBlur);
  }

  // Opt into Pointer Lock: click the canvas to capture the mouse (true FPS
  // look), Esc releases it (browser-level; the page never sees that Esc —
  // grounding stays on the SECOND Esc). Denied/cooldown requests silently
  // fall back to drag-look.
  enablePointerLock() {
    if (this._plOn || IS_COARSE_POINTER || !this.dom.requestPointerLock) return;
    this._plOn = true;
    document.addEventListener("pointerlockchange", this._onPlChange);
    document.addEventListener("pointerlockerror", this._onPlError);
  }
  // Is pointer lock even usable in this scene/device? Drives the opt-in button.
  canLock() { return this._plOn && !IS_COARSE_POINTER; }
  // Explicit user opt-in: arm capture AND request the lock right now. Called by
  // the "Mouse look" button, never by a bare canvas click.
  requestLockNow() {
    if (!this._plOn || this._plLocked || IS_COARSE_POINTER) return;
    this._plArmed = true;
    // If the request is REJECTED (e.g. Chrome's ~1.25 s post-Esc cooldown),
    // disarm — otherwise _plArmed stays true and the next plain canvas click
    // silently captures the cursor, reviving the "a click trapped my mouse" bug.
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => { this._plArmed = false; });
    } catch { this._plArmed = false; }
  }
  _onPlChange() {
    const locked = document.pointerLockElement === this.dom;
    this._plLocked = locked;
    this._lockChangeAt = performance.now();
    if (locked) {
      this.dragging = false;
      this.dom.style.cursor = "none";
    } else {
      // Disarm on release (browser Esc, or programmatic) so the next canvas
      // click resumes plain drag-look instead of silently re-capturing the
      // cursor — the user re-enters mouse-look only via the explicit button.
      this._plArmed = false;
      this.dom.style.cursor = "grab";
    }
    try { this.dom.dispatchEvent(new CustomEvent("fp-pointerlock", { detail: { locked } })); } catch {}
  }
  _onPlError() { this._plLocked = false; this._plArmed = false; }
  isPointerLocked() { return !!this._plLocked; }
  // True briefly after a lock/unlock transition — click handlers use this to
  // swallow the click that acquired the lock.
  wasJustLocked() { return this._plLocked && (performance.now() - this._lockChangeAt) < 450; }
  // Route a look target through the clamps. With lookSmoothing the update
  // loop eases toward the target; without it, write yaw/pitch directly —
  // otherwise a scene enabling pointerLock alone would capture the cursor
  // and then never consume the targets (frozen camera).
  _lookTo(y, p) {
    if (p < this.opts.pitchMin) p = this.opts.pitchMin;
    if (p > this.opts.pitchMax) p = this.opts.pitchMax;
    if (y < this.opts.yawMin) y = this.opts.yawMin;
    if (y > this.opts.yawMax) y = this.opts.yawMax;
    this._yawT = y;
    this._pitchT = p;
    if (!(this.opts.lookSmoothing > 0)) {
      this.yaw = y;
      this.pitch = p;
    }
  }
  // Gyroscope look — relative orientation deltas, routed through the same
  // clamps and smoothing as drag so both inputs compose instead of fighting.
  gyroLook(dYaw, dPitch) {
    if (!this.enabled) return;
    this._lookTo(
      (this._yawT ?? this.yaw) + dYaw,
      (this._pitchT ?? this.pitch) + dPitch
    );
  }

  _onDown(e) {
    if (!this.enabled) return;
    // Pointer-lock opt-in: a mouse click captures the pointer. A denied or
    // cooldown-blocked request rejects — swallow it and fall through to the
    // regular drag setup so look never dies.
    if (this._plOn && this._plArmed && !this._plLocked && e.pointerType === "mouse") {
      try {
        const p = this.dom.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
      } catch {}
    }
    this.dragging = true;
    this._lookPid = e.pointerId;          // isolate look to this finger
    this.lastX = e.clientX; this.lastY = e.clientY;
    if (!this._plLocked) this.dom.style.cursor = "grabbing";
    try { this.dom.setPointerCapture(e.pointerId); } catch {}
  }
  _onMove(e) {
    // Pointer-locked look: relative movement deltas, clamped to swallow the
    // browser's lock-entry spikes, always routed through the smoothed path.
    if (this._plLocked) {
      if (!this.enabled) return;
      const mx = Math.max(-60, Math.min(60, e.movementX || 0));
      const my = Math.max(-60, Math.min(60, e.movementY || 0));
      this._lookTo(
        (this._yawT ?? this.yaw) - mx * this.opts.lookSpeed,
        (this._pitchT ?? this.pitch) - my * this.opts.lookSpeed
      );
      return;
    }
    // Ignore other pointers (e.g. the joystick finger) so look + move don't
    // fight on touch.
    if (!this.dragging || (this._lookPid != null && e.pointerId !== this._lookPid)) return;
    const dx = e.clientX - this.lastX;
    const dy = e.clientY - this.lastY;
    this.lastX = e.clientX; this.lastY = e.clientY;
    if (this.opts.lookSmoothing > 0) {
      // Smoothed drag-look: write targets; update() filters toward them.
      this._lookTo(
        (this._yawT ?? this.yaw) - dx * this.opts.lookSpeed,
        (this._pitchT ?? this.pitch) - dy * this.opts.lookSpeed
      );
      return;
    }
    this.yaw -= dx * this.opts.lookSpeed;
    this.pitch -= dy * this.opts.lookSpeed;
    if (this.pitch < this.opts.pitchMin) this.pitch = this.opts.pitchMin;
    if (this.pitch > this.opts.pitchMax) this.pitch = this.opts.pitchMax;
    if (this.yaw   < this.opts.yawMin) this.yaw = this.opts.yawMin;
    if (this.yaw   > this.opts.yawMax) this.yaw = this.opts.yawMax;
  }
  _onUp(e) {
    if (e && this._lookPid != null && e.pointerId !== this._lookPid) return;
    this.dragging = false; this._lookPid = null;
    if (!this._plLocked) this.dom.style.cursor = "grab";
  }
  _onKey(e) {
    // Only capture our movement keys so we don't break form input elsewhere.
    // Shift is tracked (creep modifier) but never preventDefault-ed.
    if (["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","ShiftLeft","ShiftRight"].includes(e.code)) {
      this.keys[e.code] = true;
      // Don't scroll the page when arrow keys are used in the stage
      if (e.code.startsWith("Arrow")) e.preventDefault();
    }
    // Looking without a mouse: Q / R turn, Page Up / Page Down tilt. Turning
    // and looking down used to need a mouse or a finger, which put the
    // heights "look straight down" star out of reach from a keyboard.
    if (["KeyQ", "KeyR", "PageUp", "PageDown"].includes(e.code)) {
      const tag = e.target && e.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      this.keys[e.code] = true;
      e.preventDefault();
    }
  }
  _onKeyUp(e) { this.keys[e.code] = false; }

  // Analog movement axis from a virtual joystick (or gamepad). x = right(+),
  // y = down(+) in screen space; magnitude 0..1 scales the walk speed so a slow
  // creep is possible. Pass (0,0) or null to release.
  setMoveAxis(x, y) {
    if (x == null || (x === 0 && y === 0)) { this._moveAxis = null; return; }
    this._moveAxis = { x, y };
  }

  // True when the user is pushing forward — via W/↑ OR the analog joystick.
  // Scenes (e.g. heights' lean-over-the-rail cue) must use this rather than
  // reading this.keys directly, since the joystick now feeds an analog axis,
  // not the key flags.
  isMovingForward() {
    if (this.keys && (this.keys.KeyW || this.keys.ArrowUp)) return true;
    // Same 0.08 dead zone as actual movement: an analog creep forward IS
    // moving forward — a frightened user inching toward the rail must still
    // trigger the scenes' approach cues.
    return !!(this._moveAxis && this._moveAxis.y < -0.08);
  }

  // True when the user is pushing in ANY direction (keys or joystick past the
  // dead zone). Scenes use this to yield scripted auto-walks to manual input —
  // the player's own hands always outrank an animation.
  hasMoveInput() {
    if (this.keys && (this.keys.KeyW || this.keys.ArrowUp ||
                      this.keys.KeyS || this.keys.ArrowDown ||
                      this.keys.KeyA || this.keys.ArrowLeft ||
                      this.keys.KeyD || this.keys.ArrowRight)) return true;
    return !!(this._moveAxis && Math.hypot(this._moveAxis.x, this._moveAxis.y) > 0.08);
  }

  isMovingBackward() {
    if (this.keys && (this.keys.KeyS || this.keys.ArrowDown)) return true;
    return !!(this._moveAxis && this._moveAxis.y > 0.25);
  }

  update(dt) {
    if (!this.enabled) return;
    if (this.keys && (this.keys.KeyQ || this.keys.KeyR || this.keys.PageUp || this.keys.PageDown)) {
      const turn = (this.keys.KeyQ ? 1 : 0) - (this.keys.KeyR ? 1 : 0);
      const tilt = (this.keys.PageUp ? 1 : 0) - (this.keys.PageDown ? 1 : 0);
      this._lookTo((this._yawT ?? this.yaw) + turn * 1.8 * dt, (this._pitchT ?? this.pitch) + tilt * 1.2 * dt);
    }
    // Smoothed look: filter yaw/pitch toward the input targets. At the
    // 10 Hz cutoff the lag is ~1.5 frames — imperceptible latency that kills
    // the per-pixel stair-stepping of raw mouse deltas.
    if (this.opts.lookSmoothing > 0 && this._yawT != null) {
      const a = 1 - Math.exp(-2 * Math.PI * this.opts.lookSmoothing * dt);
      this.yaw += (this._yawT - this.yaw) * a;
      this.pitch += (this._pitchT - this.pitch) * a;
    }
    // Apply rotation
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    // Roll: lean into turns + a faint footfall sway, computed at the end of
    // the previous frame's update (one frame of latency is invisible at 60 Hz;
    // the TP branch overwrites rotation entirely via lookAt, so this only
    // ever shows in first person).
    this.camera.rotation.z = this._camRoll || 0;

    // Remember where we were so we can advance the walk cycle by actual
    // distance travelled (grounded stride, no foot-skating) and detect motion
    // even when collision blocks a key press.
    const _prevX = this.position.x, _prevZ = this.position.z;

    // Walking. In "walkable" mode the user moves freely within `bounds`. In
    // "lookOnly" mode WASD/arrows still allow a small lean (±0.6 m around
    // the starting position) so users on a keyboard can shift weight without
    // the scene allowing full traversal.
    let movingNow = false;
    // Input direction in world space (unit length) — assembled from key flags.
    let ix = 0, iz = 0;
    let moveMag = 1;     // analog push magnitude (1 for keyboard / full stick)
    const movable = this.opts.mode === "walkable" || this.opts.mode === "lookOnly";
    const wantsKey = this.keys.KeyW || this.keys.ArrowUp ||
                     this.keys.KeyS || this.keys.ArrowDown ||
                     this.keys.KeyA || this.keys.ArrowLeft ||
                     this.keys.KeyD || this.keys.ArrowRight;
    if (wantsKey && movable) {
      const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
      if (this.keys.KeyW || this.keys.ArrowUp)    { ix += -sinY; iz += -cosY; }
      if (this.keys.KeyS || this.keys.ArrowDown)  { ix +=  sinY; iz +=  cosY; }
      if (this.keys.KeyD || this.keys.ArrowRight) { ix +=  cosY; iz += -sinY; }
      if (this.keys.KeyA || this.keys.ArrowLeft)  { ix += -cosY; iz +=  sinY; }
      const len = Math.hypot(ix, iz);
      if (len > 0) { ix /= len; iz /= len; }
      // Keyboard creep — the desktop twin of the analog joystick's
      // magnitude-scaled inch-forward (graded self-dosed approach).
      moveMag = (this.keys.ShiftLeft || this.keys.ShiftRight) ? 0.45 : 1;
    }
    // Analog joystick axis (mobile). Takes precedence when pushed past the dead
    // zone and scales speed by how FAR the stick is pushed — so a frightened
    // user can creep forward a few centimetres instead of only full-speed-or-
    // frozen. _moveAxis is {x: right+, y: down+} in screen space.
    const ma = this._moveAxis;
    if (ma && movable) {
      const mag = Math.min(1, Math.hypot(ma.x, ma.y));
      if (mag > 0.08) {
        const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
        const fwd = -ma.y / mag, side = ma.x / mag;   // unit local (fwd+, right+)
        ix = -fwd * sinY + side * cosY;
        iz = -fwd * cosY - side * sinY;
        moveMag = mag;
      }
    }
    // ---- Acceleration: a body with mass, not a hovering camera ----
    // Real walking: ~0.35 s to reach pace, ~0.22 s to stop, and a REVERSE
    // takes longer still (you plant and push the other way). Instant
    // start/stop and instant 180s were the biggest "video-game glide" tells.
    // Strafe is also a touch slower than forward — humans don't side-step
    // at full walk speed.
    const isLean = this.opts.mode === "lookOnly";
    let maxSpeed = (isLean
      ? 0.85
      : Math.min(this.opts.speed, this._walkCap == null ? Infinity : this._walkCap)) * moveMag;
    // ---- Fear-modulated gait (opt-in) ----
    // Fear slows the APPROACH, never the retreat: walking toward the fear at
    // fear ≥ 80 runs at 0.55×; backing away or strafing is always full speed
    // (flight must always be available). At high fear, brief hesitation
    // catches interrupt the forward walk — the legs are the most honest
    // fear channel the body has.
    if (this._fearGaitOn && movable) {
      const sY0 = Math.sin(this.yaw), cY0 = Math.cos(this.yaw);
      const fwdInput = -(ix * sY0 + iz * cY0);   // W → 1, S → −1, strafe → 0
      const fear = this._getFear();
      const fearRamp = Math.max(0, Math.min(1, (fear - 30) / 50));
      this._fearRampSm += (fearRamp - this._fearRampSm) * Math.min(1, dt * 3);
      const fwdShare = Math.max(0, Math.min(1, (fwdInput - 0.15) / 0.5));
      let fearMul = 1 - 0.45 * fearRamp * fwdShare;
      if (fear > 70 && fwdInput > 0.25) {
        if (this._hesT == null) this._hesT = 1.2 + Math.random() * 1.6;
        this._hesT -= dt;
        if (this._hesT <= 0) {
          this._hesHold = 0.28 + Math.random() * 0.12;
          this._hesT = 1.8 + Math.random() * 1.4;
        }
      } else {
        this._hesT = null;
      }
      if (this._hesHold > 0) {
        this._hesHold -= dt;
        // The catch only ever grips the APPROACH. If the user reverses into
        // a retreat mid-hold (the classic panic move during a lunge), speed
        // must return instantly — flight is always available, full stop.
        if (fwdInput > 0.1) fearMul *= 0.15;
      }
      maxSpeed *= fearMul;
    }
    if (!this._vel) this._vel = { x: 0, z: 0 };
    const hasInput = ix !== 0 || iz !== 0;
    // Strafe penalty: committed sideways travel is ~72% of forward pace.
    if (hasInput) {
      const sY = Math.sin(this.yaw), cY = Math.cos(this.yaw);
      const fwdShare = Math.abs(-(ix * sY + iz * cY));
      const sideShare = Math.abs(ix * cY - iz * sY);
      const total = fwdShare + sideShare || 1;
      maxSpeed *= 0.72 + 0.28 * (fwdShare / total);
      // Turning while moving: a hard mouse-look mid-stride costs a little
      // pace — you don't hold full walk speed through a 90° spin.
      const yawRate = dt > 0 ? Math.abs(this.yaw - (this._prevYawMove ?? this.yaw)) / dt : 0;
      this._prevYawMove = this.yaw;
      if (yawRate > 1.2) maxSpeed *= Math.max(0.72, 1 - (yawRate - 1.2) * 0.08);
    }
    // Direction agreement + first-step impulse.
    // From standstill, a brief "push into the step" spikes accel so the first
    // stride commits; reversing brakes hard first; continuing is smoother.
    let velRate;
    const vLen0 = Math.hypot(this._vel.x, this._vel.z);
    if (!hasInput) {
      // Two-phase stop: hard initial brake, then soft settle (no ice-slide).
      velRate = vLen0 > 0.55 ? 18 : 12;
    } else {
      let dot = 1;
      if (vLen0 > 0.08) {
        dot = (this._vel.x * ix + this._vel.z * iz) / vLen0;
      }
      if (dot < -0.1) velRate = 3.6;                  // reverse: plant & push
      else if (dot < 0.4) velRate = 5.5;              // sharp cut
      else if (vLen0 < 0.12) velRate = 11.0;          // first-step impulse
      else velRate = 7.2;                             // cruise
    }
    // Exponential response is frame-rate independent.
    const velAlpha = 1 - Math.exp(-velRate * dt);
    this._vel.x += (ix * maxSpeed - this._vel.x) * velAlpha;
    this._vel.z += (iz * maxSpeed - this._vel.z) * velAlpha;
    if (!hasInput && Math.hypot(this._vel.x, this._vel.z) < 0.012) {
      this._vel.x = 0; this._vel.z = 0;
    }
    // Normalized velocity (0..1 of full pace), smoothed — scales bob/sway
    // amplitude and footstep gain so a slow creep is quiet and low-bob
    // instead of a full-volume stomp at 0.1 m/s.
    {
      // Normalize against the speed actually reachable, not the one the scene
      // asked for — otherwise the walk-capped scenes never read as "full pace"
      // and their footsteps, bob and lean all sit permanently at 80%.
      const denomV = (isLean
        ? 0.85
        : Math.min(this.opts.speed, this._walkCap == null ? Infinity : this._walkCap)) || 1;
      const rawSN = Math.min(1, Math.hypot(this._vel.x, this._vel.z) / denomV);
      this._speedNorm += (rawSN - this._speedNorm) * Math.min(1, dt * 6);
    }
    if (this._vel.x !== 0 || this._vel.z !== 0) {
      movingNow = hasInput;
      this.position.x += this._vel.x * dt;
      this.position.z += this._vel.z * dt;
      if (isLean) {
        // Keep within ±0.6 m of the original spawn so the user doesn't
        // wander out of the scripted scene's intended viewpoint.
        if (this._origin == null) this._origin = new THREE.Vector3().fromArray(this.opts.initialPos);
        const dx = this.position.x - this._origin.x;
        const dz = this.position.z - this._origin.z;
        const r = Math.hypot(dx, dz);
        const RMAX = 0.6;
        if (r > RMAX) {
          this.position.x = this._origin.x + dx / r * RMAX;
          this.position.z = this._origin.z + dz / r * RMAX;
        }
      } else {
        const b = this.opts.bounds;
        if (b) {
          this.position.x = Math.max(b.minX, Math.min(b.maxX, this.position.x));
          this.position.z = Math.max(b.minZ, Math.min(b.maxZ, this.position.z));
        }
      }
    }

    // ---- Collision vs static scene solids (auto-collected at mount) ----
    // Every piece of furniture / prop becomes an XZ box; resolution pushes
    // the player capsule out along the SHALLOWEST axis, which makes walls
    // and furniture naturally slide you along their faces instead of
    // stopping you dead or letting you wade through the geometry.
    if (this._staticColliders && this._staticColliders.length) {
      const r = this.bodyRadius;
      for (const c of this._staticColliders) {
        const nx = Math.max(c.minX, Math.min(c.maxX, this.position.x));
        const nz = Math.max(c.minZ, Math.min(c.maxZ, this.position.z));
        const dx = this.position.x - nx, dz = this.position.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          // Outside the box face: push out along the contact normal.
          const d = Math.sqrt(d2);
          this.position.x = nx + (dx / d) * r;
          this.position.z = nz + (dz / d) * r;
        } else {
          // Centre is inside the box: exit through the nearest face.
          const exL = this.position.x - (c.minX - r);
          const exR = (c.maxX + r) - this.position.x;
          const ezB = this.position.z - (c.minZ - r);
          const ezF = (c.maxZ + r) - this.position.z;
          const m = Math.min(exL, exR, ezB, ezF);
          if (m === exL) this.position.x = c.minX - r;
          else if (m === exR) this.position.x = c.maxX + r;
          else if (m === ezB) this.position.z = c.minZ - r;
          else this.position.z = c.maxZ + r;
        }
      }
    }
    // ---- Collision: push the player out of solid obstacles (props, the dog)
    // so you can't walk through them. Resolved every frame (also handles a
    // moving obstacle bumping a stationary player). Then re-clamp to bounds.
    if (this.obstacles && this.obstacles.length) {
      for (const o of this.obstacles) {
        const dx = this.position.x - o.x, dz = this.position.z - o.z;
        const d = Math.hypot(dx, dz);
        const min = o.r + this.bodyRadius;
        if (d < min && d > 1e-4) {
          this.position.x = o.x + (dx / d) * min;
          this.position.z = o.z + (dz / d) * min;
        } else if (d <= 1e-4) {
          // Exact overlap has no contact normal. Dynamic actors can provide
          // their facing as an escape direction; other obstacles fall back to
          // the player's facing, so neither body remains clipped in the other.
          const fx = Number.isFinite(o.pushX) ? o.pushX : -Math.sin(this.yaw);
          const fz = Number.isFinite(o.pushZ) ? o.pushZ : -Math.cos(this.yaw);
          const fl = Math.hypot(fx, fz) || 1;
          this.position.x = o.x + (fx / fl) * min;
          this.position.z = o.z + (fz / fl) * min;
        }
      }
    }
    if (this._staticColliders || this.obstacles) {
      const b = this.opts.bounds;
      if (b && !isLean) {
        this.position.x = Math.max(b.minX, Math.min(b.maxX, this.position.x));
        // _leanBypass lets a scripted "lean over the edge" slide the body past
        // bounds.minZ (heights). Without it the bounds re-clamp cancelled the
        // forward motion every frame, so the peer-over never happened.
        if (!this._leanBypass) this.position.z = Math.max(b.minZ, Math.min(b.maxZ, this.position.z));
      }
    }

    // Walk cycle advances by DISTANCE moved (not time), so the legs swing in
    // lockstep with the ground and the feet don't slide. ~0.62 m per half-step.
    const _mdx = this.position.x - _prevX, _mdz = this.position.z - _prevZ;
    const _movedDist = Math.hypot(_mdx, _mdz);
    movingNow = movingNow && _movedDist > 1e-4;
    if (this._walkAmt == null) this._walkAmt = 0;
    if (this._walkPhase == null) this._walkPhase = 0;
    this._walkAmt += ((movingNow ? 1 : 0) - this._walkAmt) * Math.min(1, dt * (movingNow ? 5.5 : 4.0));
    // Travel direction in BODY-LOCAL space: fwd ∈ [-1,1] (+ = the way you
    // face), side ∈ [-1,1] (+ = your right). The gait engine reads this to
    // step backward when you back up and scissor sideways when you strafe —
    // reusing one forward cycle for every direction is how moonwalks happen.
    if (this._moveFwd == null) { this._moveFwd = 1; this._moveSide = 0; }
    if (movingNow && _movedDist > 1e-4) {
      // Fear shortens the stride by a further 25% at fear ≥ 80: visibly
      // quicker, smaller steps at the same ground speed.
      // Step length and cadence BOTH grow with speed, as roughly √v — the
      // oldest relationship in gait analysis. A step length that ignores pace
      // makes a brisk walk read as a scurry (this was 141 steps/min, a march)
      // and a creep as slow motion. `_strideBase` is the step at 1 m/s and
      // belongs to the LEGS, not to a constant: a short character taking the
      // same strides as a tall one over-reaches on every step. setStrideBase()
      // feeds the real leg length in once the body exists.
      // √v stride growth holds up to the old comfort speed; above it the
      // stride flattens hard (0.12·Δv) and the remaining pace comes out of
      // cadence. Without this, raising the walk cap re-created the trudge the
      // cap existed to prevent: reach at heel strike grows with stride, and
      // the hips must drop to meet it — long strides ARE the 8 cm heave.
      const _v = Math.max(0.12, Math.hypot(this._vel.x, this._vel.z));
      const _vc = (this._walkCap || 1.3) * 0.8;
      const paceK = Math.sqrt(Math.min(_v, _vc)) + 0.12 * Math.max(0, _v - _vc);
      const sb = this._strideBase || 0.56;
      // Nobody strides out sideways or backwards the way they do forwards —
      // both are shorter, quicker steps. Keeping one step length for every
      // direction is also what forced the pelvis into a squat on a side-step:
      // a foot planted 36 cm out to the side has to come from somewhere, and
      // with an honest leg it comes out of hip height.
      const af = Math.abs(this._moveFwd || 0), as = Math.abs(this._moveSide || 0);
      const backShare = Math.max(0, -(this._moveFwd || 0));
      const sideDom = _hsat((as - af) / 0.25) * as;
      const dirK = (1 - 0.22 * backShare) * (1 - 0.38 * sideDom);
      const stride = (this._fearGaitOn ? sb * (1 - 0.25 * this._fearRampSm) : sb) * paceK * dirK;
      this._strideLen = stride;
      this._walkPhase += (_movedDist / stride) * Math.PI;   // distance-driven stride
      const inv = 1 / _movedDist;
      const wx = _mdx * inv, wz = _mdz * inv;
      const sY = Math.sin(this.yaw), cY = Math.cos(this.yaw);
      const fwd = -(wx * sY + wz * cY);          // camera forward = (-sinY, -cosY)
      const side = wx * cY - wz * sY;            // camera right   = ( cosY, -sinY)
      this._moveFwd  += (fwd  - this._moveFwd ) * Math.min(1, dt * 12);
      this._moveSide += (side - this._moveSide) * Math.min(1, dt * 12);
    }
    // Turn-in-place shuffle: spinning on the spot is foot WORK — feed a small
    // alternating step so the body doesn't pirouette on frozen legs.
    // Threshold lowered so a normal look-turn still gets footwork.
    const yawDeltaAbs = Math.abs(this.yaw - (this._prevYawShuf ?? this.yaw));
    this._prevYawShuf = this.yaw;
    const yawRate = dt > 0 ? yawDeltaAbs / dt : 0;
    const turningInPlace = !movingNow && yawRate > 0.55;
    if (this._shuffleAmt == null) this._shuffleAmt = 0;
    this._shuffleAmt += ((turningInPlace ? 1 : 0) - this._shuffleAmt) * Math.min(1, dt * 7);
    if (this._shuffleAmt > 0.02 && !movingNow) {
      this._walkPhase += yawDeltaAbs * (1.8 + Math.min(1.2, yawRate * 0.35));
    } else if (!movingNow && this._walkAmt > 0.03) {
      // Settle step: ease the stride to the nearest feet-together pose
      // instead of freezing mid-swing when the player stops.
      const rest = Math.round(this._walkPhase / Math.PI) * Math.PI;
      this._walkPhase += (rest - this._walkPhase) * Math.min(1, dt * 7);
    }
    this.moving = movingNow;

    // ---- Camera placement ----
    // Open-world third-person camera with damped follow + over-the-shoulder
    // offset. Behaviour mirrors modern 3rd-person games:
    //   - Camera sits behind the character at a fixed distance, slightly
    //     above the head, biased to one side (over-the-shoulder framing).
    //   - Looking up tilts the camera up around the character.
    //   - Looking down lowers the camera + pulls it back further so the
    //     ground-and-character composition stays in frame.
    //   - Position is SMOOTHED with damping so quick yaw changes don't whip
    //     the camera around — it lags slightly, like a real cameraman tracking.
    //   - Walk-bob is faded out in TP (camera bob is jarring when following
    //     a separate character).
    const targetBlend = this.cameraMode === "tp" ? 1 : 0;
    this.tpBlend += (targetBlend - this.tpBlend) * Math.min(1, dt * 4.0);
    // ---- First-person body-feel ----
    // The camera IS the user's head: it should dip into each footfall, ride
    // their breath, and lean into turns. Everything here scales down with
    // the reduce-motion accessibility setting (re-read once a second, not
    // every frame).
    if (this._rmAt == null || (this._rmAt -= dt) <= 0) {
      this._rmAt = 1;
      // Honour BOTH the in-app toggle AND the OS-level "reduce motion" setting,
      // so a user who never opened our accessibility panel still gets the
      // gentler camera (the vestibular-safety case).
      try {
        const appFlag = localStorage.getItem("fobia.reducedMotion") === "1";
        const osFlag = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
        this._reduceMotion = appFlag || osFlag;
      } catch { this._reduceMotion = false; }
    }
    const mScale = this._reduceMotion ? 0.3 : 1;
    const fpBobScale = (1 - this.tpBlend) * mScale;   // fades to 0 in TP
    // ---- Vertical bob ----
    // First person is the DEFAULT view, so this — not the legs — is what most
    // players actually experience as "walking". It used to be a hand-drawn
    // |sin(ph)|^6 spike: a 2.8 cm drop delivered inside ~13% of a step and
    // gone again, which lands as a jolt at every footfall. Real heads do not
    // do that. They ride the pelvis, damped by the spine, on a smooth curve.
    //
    // We already compute that curve honestly for the character's own head, so
    // ride it. FP and TP then cannot disagree, and every gait fix (pace, step
    // length, trunk compliance) reaches first person for free.
    const ph = this._walkPhase || 0;
    const sideBias = 1 + 0.05 * Math.sin(ph);
    const snBob = 0.25 + 0.75 * this._speedNorm;
    let bobYRaw;
    const headBob = this._bobSource ? this._bobSource() : null;
    if (headBob != null) {
      bobYRaw = headBob * 0.85 * fpBobScale * sideBias;
    } else {
      // Fallback when no body is mounted: a smooth two-per-stride sine, lowest
      // at footfall — the same shape, just without the real thing to copy.
      bobYRaw = -Math.cos(2 * ph) * 0.011 * this._walkAmt * fpBobScale * snBob * sideBias;
    }
    // Two-pole smoothing — the neck. One pole still passed the corner where the
    // pelvis hands over from one stance leg to the other, and at double support
    // the two legs alternate as the constraining one, which chatters. A second
    // pole rounds both off while leaving the ~1.8 Hz fundamental intact.
    const bobA = Math.min(1, dt * 30);
    this._bobYSm = (this._bobYSm || 0) + (bobYRaw - (this._bobYSm || 0)) * bobA;
    this._bobYSm2 = (this._bobYSm2 || 0) + (this._bobYSm - (this._bobYSm2 || 0)) * bobA;
    const bobY = this._bobYSm2;
    // A trace of neck compliance: the chin dips very slightly as weight lands.
    // Small and smooth — the old spike-driven version read as a flinch.
    const bobPitchRaw = -Math.max(0, -Math.cos(2 * ph)) * 0.004
      * this._walkAmt * fpBobScale * snBob;
    this._bobPitch = (this._bobPitch || 0)
      + (bobPitchRaw - (this._bobPitch || 0)) * Math.min(1, dt * 22);
    // Breathing — always present, faster and deeper as fear rises.
    const fearK = (window.PhobiaFear ? window.PhobiaFear.get() : 0) / 100;
    this._breathT = (this._breathT || 0) + dt * (1.5 + fearK * 2.4);
    const breathY = Math.sin(this._breathT) * (0.0038 + fearK * 0.005)
      * (1 - this._walkAmt * 0.65) * fpBobScale;
    // Lateral sway on camera-local right: weight rolls out over whichever foot
    // is planted, so it peaks at mid-stance (ph ≈ π/2 + 0.31·2π) and completes
    // one cycle per STRIDE. `ph * 0.5` gave it a four-step period — a slow drift
    // that never lined up with a footfall.
    const swayAmt = Math.sin(ph - 1.95) * 0.018 * this._walkAmt * fpBobScale
      * (0.35 + 0.65 * this._speedNorm);
    const rSinY = Math.sin(this.yaw), rCosY = Math.cos(this.yaw);
    // Crouch eye-drop: a scene (e.g. greeting a low dog) can ask the head to
    // dip so the player bends toward what they're reaching for. Only the FP eye
    // lowers — this.position.y (TP framing / collision origin) is untouched —
    // and it fades out in TP where the body's own crouch pose reads instead.
    this._eyeDrop = (this._eyeDrop || 0)
      + (((this._eyeDropTarget || 0)) - (this._eyeDrop || 0)) * Math.min(1, dt * 6);
    const fpX = this.position.x + rCosY * swayAmt;
    const fpY = this.position.y + bobY + breathY - this._eyeDrop * (1 - this.tpBlend);
    const fpZ = this.position.z - rSinY * swayAmt;
    // Roll target for next frame: yaw-velocity lean + strafe lean + footfall.
    const yawVel = dt > 0 ? (this.yaw - (this._prevYawRoll ?? this.yaw)) / dt : 0;
    this._prevYawRoll = this.yaw;
    const strafe = ((this.keys.KeyD || this.keys.ArrowRight) ? 1 : 0)
                 - ((this.keys.KeyA || this.keys.ArrowLeft) ? 1 : 0);
    const rollTarget = Math.max(-0.07, Math.min(0.07,
      -yawVel * 0.018
      - strafe * 0.028 * this._walkAmt
      + Math.sin((this._walkPhase || 0) - 1.95) * 0.010 * this._walkAmt
    )) * fpBobScale;
    this._camRoll = (this._camRoll || 0) + (rollTarget - this._camRoll) * Math.min(1, dt * 8);

    // TP target — orbit behind the player. Yaw drives orbit angle; pitch
    // tilts the camera up/down around the character.
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const sinP = Math.sin(this.pitch), cosP = Math.cos(this.pitch);
    // Distance increases when looking up/down so the framing doesn't crunch
    // against the character. Also pulls in slightly while walking so the
    // body fills more of the frame (action framing vs idle portrait).
    const pitchAbs = Math.abs(this.pitch);
    const walkPull = 1 - 0.08 * (this._walkAmt || 0) * (this._speedNorm || 0);
    const distScale = (1.0 + pitchAbs * 0.22) * walkPull;
    const tpDist = this.tpDistance * distScale;
    // Vertical orbit — when pitch < 0 (looking down) the camera rises so it
    // looks DOWN at the character; pitch > 0 (looking up) the camera drops.
    // A touch lower while walking so we see more of the gait.
    const tpHeight = this.tpHeight - sinP * 1.4 - 0.08 * (this._walkAmt || 0);
    // Over-the-shoulder lateral offset (player-local right).
    //
    // Two-shot framing (opt-in: a scene sets `tpSubject` = {x, z} each frame).
    // A creature standing in front of the traveler sits exactly behind their
    // body from a camera straight behind them — in the dog room the dog
    // vanished behind the avatar's legs at the one moment the whole trial is
    // about. When the subject is close and near the centre line, the boom
    // swings out sideways just far enough that the sight line to it clears
    // the avatar (solved from similar triangles), and eases back when the
    // way is clear.
    let subjS = 0;
    const sj = this.tpSubject;
    if (sj && this.tpBlend > 0.05) {
      const ox = sj.x - this.position.x, oz = sj.z - this.position.z;
      const lz = -(ox * sinY + oz * cosY);            // metres ahead of the traveler
      const lx = ox * cosY - oz * sinY;               // metres to their right
      // (From right at the feet, too: a dog sniffing your shoes sat exactly
      // behind your legs, and the swing only started 25 cm out.)
      if (lz > -0.05 && lz < 4.2) {
        const D = this.tpDistance, clear = 0.5, lzc = Math.max(0.35, lz);
        const side = lx < -0.15 ? -1 : 1;             // swing to the side the subject leans
        const need = (clear * (D + lzc) - Math.abs(lx) * D) / lzc - this.tpShoulder * side;
        subjS = side * Math.max(0, Math.min(1.3, need));
      }
    }
    // ...and tilt the aim down toward a close subject, so a dog at your feet
    // sits in the frame instead of under its bottom edge.
    // (Also when it's beside you: aim between you and it, so a dog at your
    // hip isn't framed half out of the picture.)
    let subjW = 0, subjH = 0;
    if (sj && this.tpBlend > 0.05) {
      const ox = sj.x - this.position.x, oz = sj.z - this.position.z;
      const lz = -(ox * sinY + oz * cosY);
      const lx = ox * cosY - oz * sinY;
      const dd = Math.hypot(lx, lz);
      if (lz > -0.6 && dd < 3.8 && Math.abs(lx) < 2.6) subjW = 0.4 * (1 - 0.5 * dd / 3.8);
      // A subject within arm's reach: the boom also rises a little, so the
      // shot looks down over the shoulder at it rather than into your back.
      if (lz > -0.4 && dd < 1.8) subjH = 0.5 * (1 - dd / 1.8);
    }
    this._tpSubjH = (this._tpSubjH || 0) + (subjH - (this._tpSubjH || 0)) * Math.min(1, dt * 1.8);
    this._tpSubjW = (this._tpSubjW || 0) + (subjW - (this._tpSubjW || 0)) * Math.min(1, dt * 2.2);
    this._tpSubjS = (this._tpSubjS || 0) + (subjS - (this._tpSubjS || 0)) * Math.min(1, dt * 1.6);
    const shoulder = this.tpShoulder + this._tpSubjS;
    const sideX = cosY * shoulder;
    const sideZ = -sinY * shoulder;
    // Camera sits behind player along their facing direction (player faces
    // -z when yaw=0 → camera at +z behind).
    this._bodyDrop = (this._bodyDrop || 0)
      + ((this._bodyDropTarget || 0) - (this._bodyDrop || 0)) * Math.min(1, dt * 3);
    const tpX = this.position.x + sinY * tpDist + sideX;
    const tpY = this.position.y + tpHeight - this._bodyDrop * 0.55 + (this._tpSubjH || 0);
    const tpZ = this.position.z + cosY * tpDist + sideZ;

    // ---- TP camera collision ----
    // Raycast from the player TOWARD the target camera position. If anything
    // is in the way (wall, penthouse, building edge), pull the camera in to
    // just before the hit point so we never see through walls or have the
    // camera land inside geometry. Standard third-person game technique.
    let safeTpX = tpX, safeTpY = tpY, safeTpZ = tpZ;
    // (Guard used to require window.THREE — which is never assigned; THREE is
    // module-scoped here. That single dead check silently disabled ALL camera
    // collision, letting the TP camera orbit straight through walls.)
    if (this._collisionScene && this._collisionScene.length > 0
        && this.tpBlend > 0.05) {
      try {
        if (!this._tpRay) this._tpRay = new THREE.Raycaster();
        const ro = this._tpRay.ray.origin;
        const rd = this._tpRay.ray.direction;
        // Origin: a point slightly above the player's hips
        ro.set(this.position.x, this.position.y - 0.4, this.position.z);
        // Direction: from player to target camera
        const dx = tpX - ro.x, dy = tpY - ro.y, dz = tpZ - ro.z;
        const targetDist = Math.hypot(dx, dy, dz);
        if (targetDist > 0.05) {
          rd.set(dx / targetDist, dy / targetDist, dz / targetDist);
          this._tpRay.far = targetDist;
          const hits = this._tpHits || (this._tpHits = []);
          hits.length = 0;
          this._tpRay.intersectObjects(this._collisionScene, true, hits);
          if (hits.length > 0) {
            let closest = targetDist;
            for (const h of hits) {
              if (h.distance < closest) closest = h.distance;
            }
            // Floor is 0.25, not 0.6: with your back to a wall the wall can
            // be nearer than 0.6 m, and a larger floor pushed the camera
            // INSIDE it. Close-ups near walls beat clipping through them.
            const safeDist = Math.max(0.25, closest - 0.20);
            safeTpX = ro.x + rd.x * safeDist;
            safeTpY = ro.y + rd.y * safeDist;
            safeTpZ = ro.z + rd.z * safeDist;
            // When the wall behind cuts the boom short, RISE rather than jam.
            //
            // These rooms are small and the traveler starts near the back of
            // one: at z≈4 with the front wall at z≈5.2 there is barely a metre
            // behind them, so a 3.9 m boom is asking to sit almost three
            // metres inside the plaster. The clamp above then pins the camera
            // a hand's width from the back of their head for the entire trial,
            // showing a skull filling the frame and none of the room — which
            // is exactly what a "buggy third-person camera" feels like from
            // the player's seat, even though the collision code is doing its
            // job correctly.
            //
            // Climbing is the standard answer: give up the distance you cannot
            // have and buy height instead, so the shot looks down over the
            // traveler's shoulder at the floor ahead. The look target below
            // is unchanged, so a higher camera simply tilts down onto them.
            const shortfall = 1 - safeDist / Math.max(0.001, targetDist);
            if (shortfall > 0.12) {
              this._tpLift = (this._tpLift || 0)
                + ((shortfall * tpDist * 0.62) - (this._tpLift || 0)) * 0.12;
              safeTpY += this._tpLift;
            } else if (this._tpLift) {
              // Ease back down when the space opens up, so stepping away from
              // a wall does not snap the camera.
              this._tpLift += (0 - this._tpLift) * 0.12;
              safeTpY += this._tpLift;
            }
          } else if (this._tpLift) {
            this._tpLift += (0 - this._tpLift) * 0.12;
            safeTpY += this._tpLift;
          }
        }
      } catch {}
    }

    // ---- Room containment (opt-in: opts.tpContain) ----
    // Rooms built with the dollhouse trick — a front wall you can see through
    // from outside, so the opening shot can look in — have nothing to stop
    // the boom once play starts. A traveler lingering by the door kept the
    // camera parked outside the room for as long as they stood there, framing
    // a black void where the floor ended. After a short grace (or the first
    // step) the camera is held inside the room's box, and whatever boom
    // length that costs is bought back as height, like the wall climb above.
    const tc = this.opts.tpContain;
    if (tc && this.tpBlend > 0.05) {
      this._tpContainT = (this._tpContainT || 0) + dt;
      if (!this._tpContainOn && (this._tpContainT > (tc.after || 0) || (this._walkAmt || 0) > 0.25)) {
        this._tpContainOn = true;
      }
      const w = this._tpContainW = Math.min(1, (this._tpContainW || 0) + (this._tpContainOn ? dt * 1.2 : 0));
      if (w > 0) {
        const cx = Math.max(tc.minX, Math.min(tc.maxX, safeTpX));
        const cz = Math.max(tc.minZ, Math.min(tc.maxZ, safeTpZ));
        const lost = Math.hypot(safeTpX - cx, safeTpZ - cz);
        safeTpX += (cx - safeTpX) * w;
        safeTpZ += (cz - safeTpZ) * w;
        let cy = safeTpY + lost * 0.55 * w;
        if (tc.maxY != null) cy = Math.min(tc.maxY, cy);
        safeTpY = cy;
        this._tpContainLost = lost * w;
      }
    }
    // Smoothed, so the look target (below) eases rather than jumps.
    this._tpContainLostSm = (this._tpContainLostSm || 0)
      + ((this._tpContainLost || 0) - (this._tpContainLostSm || 0)) * Math.min(1, dt * 3);
    this._tpContainLost = 0;

    // Damped follow — lag the actual camera position behind the target so
    // quick yaw turns feel like a real handheld follow shot. Horizontal
    // tracking is stiffer than vertical (a cameraman keeps pace on XZ, then
    // eases height). Stiffer still while walking so the avatar doesn't skate.
    if (!this._tpSmoothPos || this.tpBlend < 0.05) {
      // (In place: in first person this branch runs every frame.)
      if (!this._tpSmoothPos) this._tpSmoothPos = new THREE.Vector3();
      this._tpSmoothPos.set(safeTpX, safeTpY, safeTpZ);
    } else {
      const dx = safeTpX - this._tpSmoothPos.x;
      const dy = safeTpY - this._tpSmoothPos.y;
      const dz = safeTpZ - this._tpSmoothPos.z;
      const distGap = Math.hypot(dx, dy, dz);
      const walkK = (this._walkAmt || 0) * (0.6 + 0.4 * (this._speedNorm || 0));
      const horizStiff = distGap > 1.0 ? 16 : (8.5 + 6.5 * walkK);
      const vertStiff  = distGap > 1.0 ? 12 : (5.5 + 3.5 * walkK);
      this._tpSmoothPos.x += dx * Math.min(1, dt * horizStiff);
      this._tpSmoothPos.z += dz * Math.min(1, dt * horizStiff);
      this._tpSmoothPos.y += dy * Math.min(1, dt * vertStiff);
    }
    // Hard wall clamp on the SMOOTHED position. The pull-in above only
    // sanitises the TARGET — the damped follower itself sweeps an arc during
    // a fast mouse orbit, and that arc can pass straight through a wall even
    // when both endpoints are clear. Re-cast player→camera every frame and
    // clamp with no smoothing: the camera never spends a single frame behind
    // geometry.
    if (this._collisionScene && this._collisionScene.length > 0 && this.tpBlend > 0.05 && this._tpSmoothPos) {
      try {
        if (!this._tpRay) this._tpRay = new THREE.Raycaster();
        const ro = this._tpRay.ray.origin, rd = this._tpRay.ray.direction;
        ro.set(this.position.x, this.position.y - 0.4, this.position.z);
        const dx = this._tpSmoothPos.x - ro.x;
        const dy = this._tpSmoothPos.y - ro.y;
        const dz = this._tpSmoothPos.z - ro.z;
        const dCam = Math.hypot(dx, dy, dz);
        if (dCam > 0.05) {
          rd.set(dx / dCam, dy / dCam, dz / dCam);
          this._tpRay.far = dCam;
          const hits = this._tpHits || (this._tpHits = []);
          hits.length = 0;
          this._tpRay.intersectObjects(this._collisionScene, true, hits);
          if (hits.length > 0) {
            let closest = dCam;
            for (const h of hits) {
              if (h.distance < closest) closest = h.distance;
            }
            const lim = Math.max(0.25, closest - 0.20);
            if (lim < dCam) {
              this._tpSmoothPos.x = ro.x + rd.x * lim;
              this._tpSmoothPos.y = ro.y + rd.y * lim;
              this._tpSmoothPos.z = ro.z + rd.z * lim;
            }
          }
        }
      } catch {}
    }

    // Blend FP and TP positions
    const cx = fpX + (this._tpSmoothPos.x - fpX) * this.tpBlend;
    const cy = fpY + (this._tpSmoothPos.y - fpY) * this.tpBlend;
    const cz = fpZ + (this._tpSmoothPos.z - fpZ) * this.tpBlend;
    this.camera.position.set(cx, cy, cz);

    // FP head-pitch bob: dip into heel strike. Applied on top of look pitch
    // only in first person (TP uses lookAt).
    if (this.tpBlend < 0.5 && (this._bobPitch || 0) !== 0) {
      this.camera.rotation.x += this._bobPitch * (1 - this.tpBlend);
    }

    if (this.tpBlend > 0.001) {
      // Look at a target at roughly the character's chest height. With the
      // normalized eye line (eye = feet + 1.62, chest ≈ feet + 1.12) the
      // chest sits ~0.5 m below the eye — the old 0.75 offset was tuned for
      // the legacy taller eye heights and aimed at the hips. The look-target
      // also pitches with the user's pitch so they can aim past the character.
      const lookYBase = this.position.y - 0.48 - (this._bodyDrop || 0) * 0.8;     // approx chest height
      // Velocity lead: frame where the character is GOING. Stronger at pace,
      // eased in so a first step doesn't yank the look target.
      const lvx = (this._vel ? this._vel.x : 0), lvz = (this._vel ? this._vel.z : 0);
      const spd = Math.hypot(lvx, lvz);
      const lead = Math.min(0.85, spd * 0.55) * (0.35 + 0.65 * (this._walkAmt || 0));
      const lspd = spd || 1;
      // A boom the room has shortened (tpContain) looks PAST the traveler
      // into the room rather than down at the crown of their head: the aim
      // moves ahead of them and up by however much distance was lost.
      const cl = Math.min(2.8, this._tpContainLostSm || 0);
      let lookX = this.position.x + sinY * 0.20 + (lvx / lspd) * lead - sinY * cl * 0.55;
      let lookY = lookYBase + sinP * tpDist * 0.55 + 0.06 * (this._walkAmt || 0) + cl * 0.12;
      let lookZ = this.position.z + cosY * 0.20 + (lvz / lspd) * lead - cosY * cl * 0.55;
      const sw = this._tpSubjW || 0;
      if (sw > 0.005 && this.tpSubject) {
        lookX += (this.tpSubject.x - lookX) * sw;
        lookY += ((this.position.y - 1.15) - lookY) * sw;   // ≈ 0.45 m off the floor
        lookZ += (this.tpSubject.z - lookZ) * sw;
      }
      // Damp the look-target — a touch laggier than position so framing
      // breathes instead of locking to the spine.
      if (!this._tpSmoothLook) {
        this._tpSmoothLook = new THREE.Vector3(lookX, lookY, lookZ);
      } else {
        const k = Math.min(1, dt * (5.5 + 3.0 * (this._walkAmt || 0)));
        this._tpSmoothLook.x += (lookX - this._tpSmoothLook.x) * k;
        this._tpSmoothLook.y += (lookY - this._tpSmoothLook.y) * k;
        this._tpSmoothLook.z += (lookZ - this._tpSmoothLook.z) * k;
      }
      this.camera.lookAt(this._tpSmoothLook);
      this.camera.rotation.order = "YXZ";
    } else {
      // Reset smoothing when fully in FP so re-entering TP starts fresh
      this._tpSmoothPos = null;
      this._tpSmoothLook = null;
    }
    // Event-driven startle (camera flinch + gaze flick), applied last so the
    // per-frame rotation write above doesn't clobber it. FP only.
    this._applyStartle(dt);
  }
  // Expose walk state so the Body's gait engine can mirror the real motion:
  // phase/amount drive the stride, fwd/side give the travel direction in
  // body-local space (backpedal, strafe, diagonals), shuffle reports
  // turn-in-place stepping.
  // Called 3–4 times a frame (engine, body, hands), and every caller reads
  // the fields on the spot — so one object, refilled, not a literal per call.
  getWalkState() {
    const w = this._wsOut || (this._wsOut = {});
    w.phase = this._walkPhase || 0;
    // Shuffle weight raised: a look-turn is real alternating footwork.
    w.amount = Math.max(this._walkAmt || 0, (this._shuffleAmt || 0) * 0.72);
    w.fwd = this._moveFwd == null ? 1 : this._moveFwd;
    w.side = this._moveSide || 0;
    w.shuffle = this._shuffleAmt || 0;
    w.speedNorm = this._speedNorm == null ? 1 : this._speedNorm;
    w.stride = this._strideLen == null ? 0.62 : this._strideLen;
    return w;
  }
  // Scene-driven crouch eye-drop in metres (0..0.7). The FP camera dips toward
  // what the player is reaching for (e.g. a low dog) without moving the logical
  // eye used by TP framing and collision.
  setEyeDrop(m) { this._eyeDropTarget = Math.max(0, Math.min(0.7, m || 0)); }
  // How far the visible body's head has sunk below standing (a crouch, a
  // kneel). The third-person boom follows it down so a kneeling traveler
  // stays in the shot instead of dropping out under a camera still framed
  // for someone standing.
  setBodyDrop(m) { this._bodyDropTarget = Math.max(0, Math.min(0.9, m || 0)); }

  // Where the FP camera gets its vertical bob: a function returning the
  // character's head deviation from its own running mean, in metres. Without
  // one the camera falls back to a synthetic curve.
  setBobSource(fn) { this._bobSource = typeof fn === "function" ? fn : null; }

  // Metres of ground covered per step at 1 m/s. The body sizes its leg swing to
  // whatever this says, so the two can never disagree.
  setStrideBase(m) {
    if (!(m > 0.05)) return;
    this._strideBase = m;
    // …and legs of a given length have a speed they can walk at CALMLY. Step
    // length grows with √v, the reach at heel strike grows with it, and the
    // hips have to drop to meet it — so pace buys vertical heave at a brutal
    // rate. At Froude 0.19 this rig heaved 8 cm a step and read as trudging.
    //
    // 0.14 fixed the trudge and created a different failure: ~1.05 m/s on a
    // 0.78 m leg as the game's TOP speed. Every room crossing felt like
    // wading — the single loudest "movement feels bad" complaint. 0.22 puts
    // the cap at ~1.32 m/s (a purposeful walk); the stride-growth flattening
    // in the phase engine keeps heel-strike reach — and with it the heave —
    // near the unhurried-walk arc, so the extra pace comes out of CADENCE
    // rather than vault height. Scenes can still ask for anything SLOWER
    // (wading, a fear creep) — this only stops them outrunning the legs.
    this._walkCap = Math.sqrt(0.22 * 9.81 * (m / 0.72));
  }

  // ---- Event-driven camera startle (FP only) ----
  // kickShake(a): a sharp, fast-decaying jitter on the camera angles — the head
  // flinch when something lunges. snapLookAt(x,y,z,k): a brief, decaying
  // involuntary look toward a world point (the snarling head), then control
  // returns to the user. Both are additive deltas applied at the END of update
  // so the per-frame yaw/pitch write doesn't clobber them, and both fade to zero
  // in third-person (tpBlend) so other scenes / TP are unaffected. Purely
  // additive — any scene that never calls them pays nothing.
  kickShake(a = 0.05) {
    if (this._reduceMotion == null) {
      try { this._reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); }
      catch { this._reduceMotion = false; }
    }
    this._shakeAmt = Math.max(this._shakeAmt || 0, a);
  }
  snapLookAt(x, y, z, k = 0.5) { this._snapLook = { x, y, z, k }; this._snapLookT = 0.6; }
  _applyStartle(dt) {
    const fpw = 1 - (this.tpBlend || 0);
    if (fpw <= 0.5) { this._shakeAmt = 0; this._snapLookT = 0; return; }
    // Decaying look-bias toward a target (e.g. the lunging dog's head)
    if (this._snapLookT > 0 && this._snapLook) {
      const lb = this._snapLook;
      const dx = lb.x - this.camera.position.x, dz = lb.z - this.camera.position.z;
      const dh = Math.hypot(dx, dz) || 0.0001;
      // Camera forward is (−sin yaw, −cos yaw): facing (dx,dz) needs
      // yaw = atan2(−dx, −dz). The old atan2(dx, −dz) sign-flipped the x
      // component, so the involuntary flick aimed at the MIRROR side of
      // whatever lunged whenever it was off-centre.
      const wantYaw = Math.atan2(-dx, -dz);
      const wantPitch = Math.atan2(lb.y - this.position.y, dh);  // +up, −down (matches scene pitch)
      let dyaw = wantYaw - this.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      const g = (this._snapLookT / 0.6) * lb.k * fpw;
      this.camera.rotation.y += dyaw * g;
      this.camera.rotation.x += (wantPitch - this.pitch) * g;
      this._snapLookT -= dt;
    }
    // Fast-decaying jitter
    if ((this._shakeAmt || 0) > 0.0008) {
      const s = this._shakeAmt * (this._reduceMotion ? 0.3 : 1) * fpw;
      this.camera.rotation.x += (Math.random() - 0.5) * s;
      this.camera.rotation.y += (Math.random() - 0.5) * s;
      this.camera.rotation.z += (Math.random() - 0.5) * s * 0.6;
      this._shakeAmt *= Math.pow(0.0025, dt);    // ≈ to 0 over ~0.3 s
    } else {
      this._shakeAmt = 0;
    }
    // ---- Fear tremble (opt-in fearGait; FP only) ----
    // A fine two-octave sine wobble, dominant ~2 Hz, fading in from fear 40
    // to full at 80. Max 0.006 rad — felt more than seen.
    if (this._fearGaitOn) {
      const f = this._getFear();
      const tk = Math.max(0, Math.min(1, (f - 40) / 40));
      if (tk > 0.01) {
        this._trmT += dt;
        const amp = 0.006 * tk * (this._reduceMotion ? 0.3 : 1) * fpw;
        const nx = (Math.sin(this._trmT * 12.6) + 0.5 * Math.sin(this._trmT * 7.3 + 1.9)) / 1.5;
        const nz = (Math.sin(this._trmT * 11.1 + 0.8) + 0.5 * Math.sin(this._trmT * 6.2 + 2.6)) / 1.5;
        this.camera.rotation.x += nx * amp;
        this.camera.rotation.z += nz * amp * 0.6;
      }
    }
  }

  // Static XZ box colliders {minX,maxX,minZ,maxZ} auto-collected from the
  // scene's solid meshes at mount. Separate from the dynamic circle
  // obstacles (creatures) which scenes refresh per frame.
  setStaticColliders(list) {
    this._staticColliders = Array.isArray(list) && list.length ? list : null;
  }

  // Toggle / set camera mode. Persists in localStorage so a user who likes
  // third-person view keeps it across sessions.
  // Optional `instant` flag bypasses the FP↔TP crossfade — used when a scene
  // forces the camera mode at mount so the cinematic intro starts at the
  // right blend value (otherwise the first few frames reset _tpSmoothPos
  // and the cinematic dolly-in is lost).
  setCameraMode(mode, instant = false, remember = false) {
    if (mode !== "fp" && mode !== "tp") mode = "fp";
    this.cameraMode = mode;
    if (instant) {
      this.tpBlend = mode === "tp" ? 1 : 0;
    }
    // Only a choice the player made is their preference. A scene that locks
    // or prefers a view (the MRI is first-person) used to overwrite it, so
    // the next dog visit opened in the wrong view.
    if (remember) { try { localStorage.setItem("fobia.cameraMode", mode); } catch {} }
    // Keep the avatar coherent with the camera on EVERY mode change: the
    // renderer registers this to sync the body's head visibility and the FP
    // hands. Syncing only in the toggle-button handler left any direct
    // setCameraMode caller with a headless body plus floating hands.
    try { if (this.onCameraModeChange) this.onCameraModeChange(this.cameraMode); } catch {}
  }
  // Set the list of meshes the TP camera should collide against. Scenes
  // populate this with their walls / building structures / large props so
  // the camera doesn't clip through them. Pass an array of THREE.Object3D.
  setCollisionScene(objects) {
    this._collisionScene = Array.isArray(objects) ? objects : null;
  }
  // Solid circle obstacles {x,z,r} the player can't walk through (props + the
  // dog). Scenes refresh this each frame so moving obstacles work too.
  setObstacles(list) {
    this.obstacles = Array.isArray(list) ? list : null;
  }
  toggleCameraMode() {
    this.setCameraMode(this.cameraMode === "tp" ? "fp" : "tp", false, true);
    return this.cameraMode;
  }

  dispose() {
    this.enabled = false;
    if (this._plLocked) { try { document.exitPointerLock(); } catch {} }
    if (this._plOn) {
      document.removeEventListener("pointerlockchange", this._onPlChange);
      document.removeEventListener("pointerlockerror", this._onPlError);
    }
    this.dom.removeEventListener("pointerdown", this._onDown);
    window.removeEventListener("pointermove", this._onMove);
    window.removeEventListener("pointerup", this._onUp);
    window.removeEventListener("pointercancel", this._onUp);
    window.removeEventListener("keydown", this._onKey);
    window.removeEventListener("keyup",   this._onKeyUp);
    window.removeEventListener("blur", this._onBlur);
    document.removeEventListener("visibilitychange", this._onBlur);
    this.dom.style.cursor = "";
  }
}

export { TouchJoystick, FPControls };
