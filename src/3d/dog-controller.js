// DogController — the dog's behaviour layer (walk, gallop, sit, bark, startle,
// follow, fetch) — and the temperaments a visit draws from.

import * as THREE from "three";
import { DogLegRig } from "./dog-rig.js";

// Drives the rigged GLTF dog: a small state machine maps to animation clips,
// plus grounded locomotion, gaze, and a procedural "alive" bone layer
// (tail/ears/sit/coil/aggression). Scene hooks: petAmount, headPitch,
// tailWag, mood, aggression, coil, playerPos.
//
// Clip map:  idle→Idle · walking→Walk · galloping→Gallop · bark→Attack(one-shot)
//            · eat→Eating(one-shot) · sit/lay→Idle + procedural haunch drop
//            (the pack ships no true Sit/Lie clips).
class DogController {
  constructor(dog, scene, camera) {
    this.dog = dog; this.scene = scene; this.camera = camera;
    this.parts = dog.userData.parts;
    this.state = "idle"; this.prevState = "idle";
    this.followTarget = null;
    this.followPlayer = false;
    this.minDistance = 0.9;     // pet-range tuning (trust shrinks it)
    // How far the dog hangs back when following — decoupled from minDistance
    // so per-rung follow distances (loose 2.5 m vs close 1.2 m) don't fight
    // the petting range. 1.5 = the old effective 0.9 + 0.6.
    this.followRadius = 1.5;
    this.baseY = dog.position.y;
    // ---- Locomotion (grounded: clip playback is matched to ground speed so
    // the paws plant instead of sliding). Scene sets these from the dog size.
    this.walkSpeed = 1.0;       // m/s — overwritten by the scene from dog height
    this.gallopSpeed = 1.8;     // m/s while galloping — calibrated from the model
    this.strideSpeed = 0.95;    // ground speed the Walk clip implies at timeScale 1
    this.radius = 0.35;         // collision radius (overwritten from dog size)
    this.obstacles = null;      // [{x,z,r}] static props the dog walks around
    this.bounds = null;         // {minX,maxX,minZ,maxZ} room limits
    // Player body the dog must not walk through. Scene writes playerPos each
    // frame; radius MUST match FPControls.bodyRadius (0.30) so the two bodies
    // agree — a mismatch left a ~4 cm interpenetration window.
    this.playerPos = null;
    this.playerRadius = 0.30;
    // XZ box colliders {minX,maxX,minZ,maxZ} shared with the player (furniture
    // auto-collected at mount). Circles alone let the dog walk through tables.
    this.boxObstacles = null;
    // External hooks the scene writes — kept for interface compatibility.
    this.petAmount = 0; this._petAmountSm = 0;
    this.tailWag = 0;           // scene increments this; folded into clip speed
    this.headYaw = 0;           // legacy (bird gaze) — harmless, no bone math
    this.headPitch = 0;         // scene sets >0.35 to request a head-low pose
    this.barkCooldown = 0;
    this.eatPhase = 0;
    this.targetYaw = dog.rotation.y;
    // Animation bookkeeping
    this._action = null;        // current looping/one-shot action
    this._sitTimer = 0;
    this._headLowSm = 0;
    // Gait-phase footfalls: the scene sets onFootfall(strength) and each paw
    // strike in the Walk/Gallop cycle fires it — rate AND strength encode the
    // dog's actual ground speed (a charge is an accelerating click-train).
    // Phases retimed for a clearer diagonal walk cadence (RF, LH, LF, RH).
    this.onFootfall = null;
    this.footfallPhases = [0.04, 0.29, 0.54, 0.79];
    this._ffPrevPhase = 0;
    this.groundSpeed = 0;
    // Stuck detector: when the collision resolver keeps cancelling the step
    // (target wedged inside a prop/wall) the dog would treadmill the Walk clip
    // in place forever. This accumulates "no real progress" time so update()
    // can abandon an unreachable target and settle instead of marching on the
    // spot. Reset whenever a fresh target is issued.
    this._stuckT = 0;
    // After the stuck-detector gives up on an unreachable follow target, hold
    // off the follow urge for a beat — otherwise it re-issues walkTo the very
    // next frame (resetting _stuckT) and the dog treadmills in place forever.
    this._followSuppressT = 0;
    // Scene systems (drink, fetch, bark yield) set this to own locomotion so
    // follow/wander don't yank the dog mid-action.
    this._moveLockT = 0;
    // ---- Procedural "alive" layer (added on top of the clip pose each frame):
    // tail wag, resting breath, walk body-bob, ear sway. Bone refs bind lazily
    // once the model has streamed in.
    this._rig = null;
    this._wagPhase = 0;
    this._wagImpulse = 0;        // decaying; scene bumps via this.tailWag
    this._breathPhase = 0;
    this._walkAmtSm = 0;
    this.happy = 0;             // scene sets 0..1 (trust) → resting wag baseline
    // ---- Aggression layer (barking rung): scene sets `aggression` 0..1 from
    // the lunge state; _bodyLife turns it into pinned ears, a lowered+thrust
    // neck, raised hackles and body tension. `rear()` adds a one-shot upward
    // head/forequarter thrust on the snap so the face comes UP at the camera.
    this.aggression = 0; this._aggSm = 0;
    this._rearImpulse = 0; this._rearSm = 0;
    // ---- Gaze layer: clamped post-mixer head/neck look-at. The scene calls
    // lookAt3(worldPos, weight) each frame with its highest-priority target
    // (player, ball, bird, stare-down); the head tracks fast while the body
    // turns slowly underneath — the "head first, body follows" rhythm that
    // makes an animal read as attentive rather than turret-mounted.
    this.gazeTarget = null;       // THREE.Vector3-like, world space
    this.gazeWeight = 0;          // 0..1 requested
    this._gazeWSm = 0;
    this._gazeYawSm = 0;
    this._gazePitchSm = 0;
    // ---- Emotional body language: "relaxed" | "alert" | "aggressive".
    // Drives the tail carriage/wag pattern + ear pose matrix in _bodyLife.
    this.mood = "relaxed";
    // ---- Tail tuck (fear/appeasement): scene sets 0..1. Overrides the mood
    // carriage — a yielding or startled dog drops the tail between the hocks
    // and the wag collapses to a fast, tight appeasement tick.
    this.tuck = 0; this._tuckSm = 0;
    // ---- Panting: scene sets 0..1 from calm/exertion. No jaw bone ships on
    // these rigs, so the pant reads through the body (chest flutter + nose
    // bob) at the same level that drives the pant audio.
    this.pant = 0; this._pantSm = 0; this._pantPhase = 0;
    // ---- Growl pulse: the warning growl coils the body around the sound
    // (head drops, wag freezes, quiver doubles) for its duration.
    this._growlT = 0; this._growlSm = 0;
    // ---- Greeting beat: the invited dog ARRIVES (call/follow catch-up) —
    // happy clip + tail burst instead of a pathfinding stop.
    this._greetT = 0; this._lastGreetAt = -99;
    // ---- Temperament style (scene sets from the day's temperament): energy
    // scales the resting wag baseline, restless the idle fidget cadence.
    this.energy = 1; this.restless = 1;
    // ---- Excitement (gentle-approach ramp): the scene raises 0..1 as the
    // player closes in calmly. Ears perk and the resting wag builds — the
    // dog visibly watches you come, instead of only reacting on arrival.
    this.excitement = 0; this._excSm = 0;
    // ---- One-shot rising punctuation: shake-off after a lie, bow-stretch
    // after a long rest. stand() arms them; _bodyLife plays them out.
    this._shakePulse = 0; this._stretchPulse = 0; this._restT = 0;
    // ---- Head-cock one-shot: the "hm?" tilt that answers a voice.
    this._cockT = 0; this._cockDur = 0.9; this._cockDir = 1;
    // ---- Independent ear flicks (one side at a time, on its own clock).
    this._earFlickT = 4 + Math.random() * 6; this._earFlickA = 0; this._earFlickSide = 1;
    // ---- Multi-bark burst: one visual head-toss per audible bark.
    this._burstN = 0; this._burstGap = 0.18; this._burstT = 0;
    // ---- Procedural bark (head-toss) — reserves the Attack clip for the
    // actual lunge snap; alert-rung spontaneous barks use this instead.
    this._barkPulse = 0;
    // ---- Coil (pre-charge telegraph): scene sets 0..1; body loads onto the
    // haunches, head drops level, stillness before the spring.
    this.coil = 0; this._coilSm = 0;
    // ---- Procedural sit/lie (the GLTFs ship no Sit/Lie clips): pose offsets
    // layered over Idle — haunch drop + hind-leg fold, deeper for lie.
    this._sitAmt = 0; this._layAmt = 0;
    // Gallop stride: ground metres one Gallop cycle covers at timeScale 1.
    // Set from dog height by the scene alongside walkSpeed/strideSpeed.
    this.gallopStride = 2.4;
    // Scalar locomotion velocity. The dog accelerates into a gait and brakes
    // for a turn rather than changing from idle to full speed in one frame.
    this._moveSpeed = 0;
    // ---- Meet an offered hand ----
    // A friendly dog closes the last step ITSELF. Measured on a real pet, the
    // player's arm ends up ~20 cm short: they can only get so close before the
    // dog's own footprint stops them, the crouch is already at full squat, and
    // the hand hangs in the air beside the animal. Waiting to be touched is the
    // one thing a dog that wants attention never does — so the scene raises
    // handInvite and the dog walks in far enough to be reached.
    this.handInvite = 0;
    this.handMeetDist = 0.48;
    this._handMeetCool = 0;
    // ---- Sit-for-pet / nuzzle reciprocity ----
    // Scene can request a sit while being petted (sitForPet); the dog leans
    // INTO the hand and closes a few centimetres on its own (nuzzle).
    this.sitForPet = 0;
    this._sitForPetT = 0;
    this._nudgeT = 0;
    // ---- Playful orbit: high-trust circle around the player ----
    this._orbitT = 0;
    this._orbitCD = 12 + Math.random() * 8;
    // Idle "alive" extras: occasional weight-shift + independent ear flicks
    // so a standing dog isn't a statue between clips. (No blink: the models
    // ship a single skinned mesh with no eye nodes to close.)
    this._idleShiftT = 2 + Math.random() * 4; this._idleShift = 0; this._idleShiftDir = 1;
    // Start the resting clip as soon as the model is available.
    if (dog.userData.ready) {
      this._play("Idle", 0);
    } else {
      dog.userData.onReady = () => this._play(this._clipForState(this.state), 0.2);
    }
  }

  _has(name) { return this.parts.actions && this.parts.actions[name]; }
  _clipForState(s) {
    switch (s) {
      case "walking":   return "Walk";
      case "galloping": return this._has("Gallop") ? "Gallop" : "Walk";
      case "bark":      return "Attack";
      case "eat":       return "Eating";
      // Sit/lie are PROCEDURAL poses (haunch drop in _bodyLife) layered over
      // plain Idle — the old Idle_2_HeadLow "sit" was just a standing dog
      // with its head down, so commands never visibly worked.
      case "sit":
      case "lay":       return "Idle";
      case "happy":     return this._has("Idle_2") ? "Idle_2" : "Idle";
      default:          return "Idle";
    }
  }
  // Cross-fade to a looping action.
  _play(name, fade = 0.3, timeScale = 1) {
    const acts = this.parts.actions;
    if (!acts) return;
    const next = acts[name] || acts["Idle"];
    if (!next) return;
    // Already the running loop → nothing to do. sit/lay/stand all route
    // Idle → Idle through setState, and restarting it jumped the clip to
    // frame 0 and faded it up from zero weight: for a frame the bind pose
    // showed through (measured 5 % clip weight on the first frame).
    if (next === this._action && next.isRunning() && next.loop === THREE.LoopRepeat
        && next.getEffectiveWeight() > 0.5) return;
    if (this._action && this._action !== next) this._action.fadeOut(fade);
    next.reset();
    // A weight left behind by setEffectiveWeight (the shuffle underlay) would
    // otherwise survive reset() and cap the new loop near zero.
    next.setEffectiveWeight(1);
    next.enabled = true;
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    next.timeScale = timeScale;
    next.fadeIn(fade).play();
    this._action = next;
    // The new action starts at time 0 — resync the footfall phase tracker or
    // the first walking frame reads a huge phase wrap and fires a burst of
    // spurious paw strikes.
    this._ffPrevPhase = 0;
  }
  // Play a clip once (bark / eat); the state machine returns to a loop after.
  _playOnce(name) {
    const acts = this.parts.actions;
    if (!acts || !acts[name]) return;
    const a = acts[name];
    if (this._action && this._action !== a) this._action.fadeOut(0.12);
    a.reset();
    a.enabled = true;
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.timeScale = 1;
    a.fadeIn(0.12).play();
    this._action = a;
  }
  // Play a clip once, then cross-fade into a LOOPING clip near its end. A
  // bare _playOnce clamps on the last frame (the rig visibly freezes for a
  // beat); launches and flinches need to hand back to a gait or idle.
  _playOnceThen(name, nextName) {
    const acts = this.parts.actions;
    if (!acts || !acts[name]) { if (nextName) this._play(nextName, 0.2); return; }
    this._playOnce(name);
    const a = acts[name];
    this._onceThen = {
      action: a,
      next: nextName || "Idle",
      dur: (a.getClip && a.getClip()) ? a.getClip().duration : 1,
    };
  }
  // Startle flinch: the dog you rush at recoils — the pack's Idle_HitReact
  // clips (otherwise unused) are exactly that head/body duck, then back to
  // neutral. Only meaningful from a standing/sitting pose.
  flinch() {
    if (this.state !== "idle" && this.state !== "sit") return false;
    const pick = Math.random() < 0.5 ? "Idle_HitReact1" : "Idle_HitReact2";
    if (!this._has(pick)) return false;
    this._playOnceThen(pick, this._clipForState(this.state));
    return true;
  }
  // Fetch launch: a real dog breaks into a chase with a bounding leap, not a
  // standing start. Gallop_Jump once, then the Gallop loop owns the run.
  jumpLaunch() {
    if (!this._has("Gallop_Jump")) return false;
    this._playOnceThen("Gallop_Jump", "Gallop");
    return true;
  }
  // Head-cock: the one-ear-up tilt a dog answers a voice with. Purely
  // procedural (no clip), so it plays over any resting pose; refuses while
  // moving — a trotting dog turns its whole body, it doesn't tilt.
  headCock(dur = 0.9) {
    if (this.state === "walking" || this.state === "galloping"
        || this.state === "bark" || this.state === "eat") return false;
    if (this._cockT > 0.05) return true;         // already mid-tilt
    this._cockT = 1;
    this._cockDur = dur;
    this._cockDir = Math.random() < 0.5 ? -1 : 1;
    return true;
  }
  // Play-bow: the universal "throw it!" invitation. The bow-stretch pulse is
  // already this exact shape (chest dips front-down, head up — signs measured
  // on this rig), so the invite reuses it and adds the tail: a bow with a
  // still tail is a stretch, a bow with the tail GOING is a request to play.
  playBow() {
    if (this.state === "walking" || this.state === "galloping"
        || this.state === "bark" || this.state === "eat" || this.state === "lay") return false;
    this._stretchPulse = Math.max(this._stretchPulse, 1);
    this.tailWag += 5;
    return true;
  }

  setState(s) {
    if (this.state === s) return;
    this.prevState = this.state;
    this.state = s;
    if (s === "sit") this._sitTimer = 0;
    if (s !== "bark" && s !== "eat") this._play(this._clipForState(s));
  }
  // Resolve a requested destination out of static obstacles, the player body,
  // and room bounds so the dog is never sent to a point it physically can't
  // stand on (the old wander/fetch/lunge callers could pick a spot inside a
  // prop, which the per-frame resolver then cancelled — the dog walked in
  // place forever).
  // opts.follow — mark this as a live follow leg (retargeted each frame).
  // opts.force  — retarget even if the new goal is close to the current one.
  walkTo(x, z, opts) {
    const r = this._resolve(x, z);
    const follow = !!(opts && opts.follow);
    const force = !!(opts && opts.force);
    // Idempotent: if already walking to nearly the same point, just update
    // the follow flag. Re-issuing used to reset _stuckT and fight other
    // systems (yield/wander/drink) into a start/stop flicker.
    if (!force && this.followTarget && (this.state === "walking" || this.state === "galloping")) {
      const dd = Math.hypot(r.x - this.followTarget.x, r.z - this.followTarget.z);
      if (dd < 0.20) {
        this.followTarget.x = r.x;
        this.followTarget.z = r.z;
        if (follow) this._followWalk = true;
        return;
      }
    }
    this._stuckT = 0;
    this._followWalk = follow;
    this.followTarget = { x: r.x, z: r.z };
    if (this.state !== "walking") this.setState("walking");
  }
  stopMove() {
    this.followTarget = null;
    this._followWalk = false;
    this._stuckT = 0;
    if (this.state === "walking" || this.state === "galloping") this.setState("idle");
  }
  bark() {
    // Hold the bark for the full Attack clip so the lunge plays out and
    // resolves back toward neutral, instead of snapping mid-rear.
    const a = this._has("Attack");
    const dur = (a && a.getClip && a.getClip()) ? a.getClip().duration : 1.2;
    this.barkCooldown = dur;
    this.prevState = (this.state === "walking" || this.state === "eat" || this.state === "bark") ? "idle" : this.state;
    this.state = "bark";
    this._playOnce("Attack");
  }
  sit() { this.stopMove(); this.setState("sit"); }
  stand() {
    // Rising punctuation: dogs almost always shake after getting up from a
    // lie, and bow-stretch after a long rest — without it the rise reads as
    // tween playback. Armed here, played out in _bodyLife.
    if (this._layAmt > 0.5 && Math.random() < 0.6) this._shakePulse = 1;
    else if ((this._restT || 0) > 30) this._stretchPulse = 1;
    this._restT = 0;
    this.setState("idle");
  }
  lay() { this.stopMove(); this.setState("lay"); }
  rear(a = 1.0) { this._rearImpulse = Math.max(this._rearImpulse, a); }
  eat() { this.eatPhase = 1.0; this.prevState = "sit"; this.state = "eat"; this._playOnce("Eating"); }
  setFollow(on) { this.followPlayer = on; }
  // Gaze request for THIS frame (highest-priority caller wins by calling
  // last in the scene's update). pos is world-space.
  lookAt3(pos, weight = 1) { this.gazeTarget = pos; this.gazeWeight = Math.max(0, Math.min(1, weight)); }
  setMood(m) { this.mood = m; }
  // Procedural warning bark: quick head toss + chest pulse synced to the
  // bark audio. Cheap, repeatable, and it keeps the Attack clip special —
  // the full rear-up now only ever means a real snap.
  barkSmall() { this._barkPulse = 1.0; }
  // Multi-bark burst: one head-toss per audible bark. dogVocal plays `count`
  // barks at `gap` seconds — barkSmall() alone fired ONCE per burst, so the
  // second and third audible barks played over a settling head.
  barkBurst(count = 1, gap = 0.18) {
    this.barkSmall();
    this._burstN = Math.max(0, count - 1);
    this._burstGap = gap;
    this._burstT = gap;
  }
  // Growl visual: for the growl's duration the body coils around the sound —
  // extra head drop, frozen wag, doubled quiver, ears pinned harder.
  growlPulse(dur = 0.9) { this._growlT = Math.max(this._growlT || 0, dur); }
  // Arrival greeting: the dog you invited arrives — happy clip beat + tail
  // burst so the moment reads as a greeting, not a waypoint reached.
  greet(dur = 2.5) {
    this._greetT = Math.max(this._greetT || 0, dur);
    this.tailWag += 6;
    if (this.state === "idle") this.setState("happy");
    // Soft recorded "woof" on greet when available — friendlier than a bark.
    this._greetWoof = true;
  }
  // Full-speed charge toward (x,z) using the Gallop clip. Same grounded
  // locomotion as walkTo — timeScale follows actual ground speed so the
  // bounds plant instead of sliding.
  gallopTo(x, z, opts) {
    const r = this._resolve(x, z);
    this._stuckT = 0;
    // A follower that breaks into a run keeps tracking the player live; it
    // used to chase the spot they had been standing on, brake there, idle a
    // frame and relaunch from standstill.
    this._followWalk = !!(opts && opts.follow);
    this.followTarget = { x: r.x, z: r.z };
    if (this.state !== "galloping") this.setState("galloping");
  }

  // Ease toward a heading. maxStep (radians, optional) caps the per-frame
  // turn so a target BEHIND the dog produces a visible body arc instead of a
  // whip-spin — the proportional ease alone covered 170° in ~0.3 s.
  _easeYaw(cur, target, k, maxStep) {
    let dy = target - cur;
    while (dy >  Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    let step = dy * Math.min(1, k);
    if (maxStep != null) step = Math.max(-maxStep, Math.min(maxStep, step));
    return cur + step;
  }
  // Cruise speed per gait for THIS dog, from the strides measured off its
  // clips — recomputed every frame (a handful of multiplies), so a scene that
  // rewrites walkSpeed each tick can never lift it past what the legs can
  // ground (the barking rung used to restore the pre-cap value every frame).
  //   walk   ≤ the Walk clip at 2× (its grounding ceiling)
  //   trot   ≈ Froude 0.6 on the hip height — a relaxed indoor trot — kept
  //            inside what the synthesised Trot can ground (2.8×)
  //   gallop ≥ 1.3× the trot, ≤ the Gallop clip at 2×
  _paces() {
    const p = this.parts;
    // walkCap is the Walk clip's grounding ceiling and the walk→trot switch
    // point; the walk's own cruise sits under it so a walk stays a walk.
    const walkCap = (p.strideSpeed || this.strideSpeed) * 2.3;
    const walk = Math.min(this.walkSpeed, walkCap * 0.85);
    const hipH = (p.legCal && p.legCal.hip0) ? p.legCal.hip0.y : (p.height || 0.6) * 0.54;
    const trot = this._has("Trot")
      ? Math.max(walkCap * 1.1, Math.min(Math.sqrt(0.6 * 9.81 * hipH), (p.trotImplied || walkCap * 0.55) * 3.2))
      : walk;
    const gclip = this._has("Gallop") && p.actions.Gallop.getClip();
    const gImplied = (p.gallopStride || this.gallopStride) / Math.max(0.2, gclip ? gclip.duration : 0.567);
    const gallop = Math.min(Math.max(this.gallopSpeed, trot * 1.3), gImplied * 2.0);
    return { walk, trot, gallop, gImplied, walkCap };
  }
  // Rotate `bone` by `angle` about an axis given in the DOG's own frame
  // (x = the dog's left, y = up, z = forward), through the bone's pivot.
  //
  // Quaternius bones each carry their own roll, so an Euler channel means
  // something different on every bone: the Head's local y runs down the
  // snout (turning a head through .y ROLLED it), the tail bones' y runs
  // along the tail (wagging through .y twisted the tail in place — measured
  // 2 cm of tip travel against 10 cm through the true swing axis), and the
  // Torso's x is mirrored against the Back's. Anything that has to MEAN a
  // turn, a tilt or a swing to the person watching goes through here.
  _rotDog(bone, ax, ay, az, angle) {
    if (!bone || !angle) return;
    const q = this._rdQ || (this._rdQ = new THREE.Quaternion());
    const qd = this._rdQd || (this._rdQd = new THREE.Quaternion());
    const v = this._rdV || (this._rdV = new THREE.Vector3());
    bone.getWorldQuaternion(q);
    this.dog.getWorldQuaternion(qd);
    q.premultiply(qd.invert()).invert();          // dog frame → bone local
    v.set(ax, ay, az).applyQuaternion(q).normalize();
    qd.setFromAxisAngle(v, angle);
    bone.quaternion.multiply(qd);
  }
  // Ground speed a locomotion clip covers at timeScale 1.
  _impliedSpeed(action, paces) {
    const name = action.getClip().name;
    const p = this.parts;
    if (name === "Gallop") return (paces || this._paces()).gImplied;
    if (name === "Trot") return p.trotImplied || (p.strideSpeed || this.strideSpeed) * 1.1;
    return p.strideSpeed || this.strideSpeed;
  }
  // Which locomotion clip the current SPEED calls for, with hysteresis:
  // Walk ↔ Trot around the walk clip's grounding ceiling, down from Gallop on
  // the gallop's own stride (a galloping dog passes through walk and trot
  // speeds on every launch and landing — pinning the Gallop clip there left
  // churning paws). Walk ↔ Trot keeps the cycle phase: the trot IS the walk
  // with its forelegs delayed, so the hind legs carry straight through.
  _selectGait(galloping, paces) {
    if (this._onceThen) return;
    const acts = this.parts.actions;
    if (!acts) return;
    const cur = this._action;
    const name = cur && cur.getClip ? cur.getClip().name : "";
    const v = this._moveSpeed;
    let want;
    if (galloping && acts.Gallop
        && (name === "Gallop" ? v > paces.gImplied * 0.42 : v > paces.gImplied * 0.60)) want = "Gallop";
    else if (acts.Trot && (name === "Trot" ? v > paces.walkCap * 0.78 : v > paces.walkCap * 0.95)) want = "Trot";
    else want = acts.Walk ? "Walk" : name;
    if (!want || want === name || !acts[want]) return;
    const keepPhase = cur && (want === "Walk" || want === "Trot") && (name === "Walk" || name === "Trot");
    const frac = keepPhase ? (cur.time / cur.getClip().duration) : 0;
    this._play(want, keepPhase ? 0.25 : 0.18, cur ? cur.timeScale : 1);
    if (keepPhase) this._action.time = frac * this._action.getClip().duration;
  }
  // The leg rig pass (see DogLegRig) — after the clip and every procedural
  // body layer have posed the skeleton.
  _legPass(t, d) {
    const rig = this._legRig;
    if (!rig) return;
    const moving = this.state === "walking" || this.state === "galloping";
    rig.update({
      d,
      floorY: this.baseY,
      clip: this._action && this._action.getClip ? this._action.getClip().name : null,
      sit: this._sitAmt * (1 - this._layAmt),
      lie: this._layAmt,
      moving: moving && this.groundSpeed > 0.05,
      // Idle steps: standing (or sat) dogs re-plant as they turn; never while
      // a one-shot clip (flinch, launch) or the bark lunge owns the body.
      allowStep: !moving && !this._onceThen && this.state !== "bark",
      onPlant: (s) => {
        if (!this.onFootfall) return;
        const k = s >= 1
          ? Math.max(0.2, Math.min(1, this.groundSpeed / (Math.max(0.3, this.walkSpeed) * 2.6)))
          : 0.18;
        this.onFootfall(k);
      },
    });
  }

  // Push a desired (x,z) out of static obstacles + the player body, then clamp
  // to room bounds. Dog navigation uses curated CIRCLE obstacles (predictable);
  // optional boxObstacles are a secondary layer. Multi-pass for overlaps.
  // opts.ignorePlayer — resolve against furniture/bounds only (ball nudges).
  _resolve(x, z, opts) {
    const obs = this.obstacles;
    const boxes = this.boxObstacles;
    const ignorePlayer = !!(opts && opts.ignorePlayer);
    const pr = ignorePlayer ? 0 : (this.playerRadius || 0);
    const pp = ignorePlayer ? null : this.playerPos;
    const r = this.radius;
    for (let pass = 0; pass < 3; pass++) {
      if (obs) {
        for (const o of obs) {
          const dx = x - o.x, dz = z - o.z;
          const d = Math.hypot(dx, dz);
          const min = o.r + r;
          if (d < min && d > 1e-4) { x = o.x + (dx / d) * min; z = o.z + (dz / d) * min; }
          else if (d <= 1e-4) {
            x = o.x - Math.sin(this.dog.rotation.y) * min;
            z = o.z - Math.cos(this.dog.rotation.y) * min;
          }
        }
      }
      if (boxes) {
        for (const c of boxes) {
          const nx = Math.max(c.minX, Math.min(c.maxX, x));
          const nz = Math.max(c.minZ, Math.min(c.maxZ, z));
          const dx = x - nx, dz = z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            x = nx + (dx / d) * r;
            z = nz + (dz / d) * r;
          } else {
            const exL = x - (c.minX - r);
            const exR = (c.maxX + r) - x;
            const ezB = z - (c.minZ - r);
            const ezF = (c.maxZ + r) - z;
            const m = Math.min(exL, exR, ezB, ezF);
            if (m === exL) x = c.minX - r;
            else if (m === exR) x = c.maxX + r;
            else if (m === ezB) z = c.minZ - r;
            else z = c.maxZ + r;
          }
        }
      }
      if (pp && pr > 0) {
        const dx = x - pp.x, dz = z - pp.z;
        const d = Math.hypot(dx, dz);
        const min = pr + r;
        if (d < min && d > 1e-4) { x = pp.x + (dx / d) * min; z = pp.z + (dz / d) * min; }
        else if (d <= 1e-4) {
          x = pp.x - Math.sin(this.dog.rotation.y) * min;
          z = pp.z - Math.cos(this.dog.rotation.y) * min;
        }
      }
    }
    const b = this.bounds;
    if (b) {
      x = Math.max(b.minX + r, Math.min(b.maxX - r, x));
      z = Math.max(b.minZ + r, Math.min(b.maxZ - r, z));
    }
    return { x, z };
  }

  update(t, dt) {
    const p = this.parts;
    if (!p.mixer) return;        // model still streaming in
    // Zero-dt frames (rAF bursts after a tab switch, double-fired ticks)
    // must be skipped entirely: the mixer may not re-write the clip pose for
    // them, but the additive _bodyLife layer would still stack its deltas —
    // the sitting dog's chest visibly ratcheted by one sit-lift per burst
    // frame. A frame that advances no time has nothing to update anyway.
    if (dt != null && dt < 0.0015) return;
    const d = dt || 0.016;
    this._turnRate = 0;   // re-measured below when the idle watch-turn rotates
    // One-shot calibration once the model has been measured: the real body
    // radius replaces the scene's height-derived guess so player↔dog contact
    // distances match the visible coat.
    if (p.bodyRadius && !this._radiusCalibrated) {
      this._radiusCalibrated = true;
      this.radius = p.bodyRadius;
      // Cap the commanded walk speed at what the Walk clip can actually ground.
      // `strideSpeed` is now MEASURED off the clip, so this is a real ceiling
      // rather than a guess: 2.0 puts the cycle at twice its authored rate,
      // which reads as a trot, and anything past it is the dog outrunning its
      // own legs. Wanting to move faster than this is what Gallop is for.
      if (p.strideSpeed) this.walkSpeed = Math.min(this.walkSpeed, p.strideSpeed * 2.3);
      // Gallop speed from the measured Gallop stride (ts ≤ 2 keeps it grounded).
      if (p.gallopStride) {
        const gclip = this._has("Gallop") && p.actions["Gallop"].getClip();
        const gImplied = p.gallopStride / Math.max(0.2, gclip ? gclip.duration : 0.567);
        this.gallopSpeed = Math.min(this.gallopSpeed, gImplied * 2.0);
      }
    }
    if (this._followSuppressT > 0) this._followSuppressT = Math.max(0, this._followSuppressT - d);
    if (this._moveLockT > 0) this._moveLockT = Math.max(0, this._moveLockT - d);

    // Smooth the pet amount the scene pokes in (drives a small clip-speed
    // perk-up so a petted dog visibly livens).
    this._petAmountSm += (this.petAmount - this._petAmountSm) * Math.min(1, d * 5);

    // ---- Decide whether to follow the player (follow rungs only) ----
    // Sitting/lying dogs stay put: a commanded sit must not be silently
    // overridden by the follow urge, or commands read as broken.
    // Movement lock (drink/fetch/scene yield) also suppresses follow.
    // Falling FAR behind mid-walk: a dog that is already moving and still
    // losing ground breaks into a run. Only when it is well behind, though —
    // the trot (see _paces) keeps pace with someone strolling, and a dog that
    // galloped every time it trailed by a couple of metres read as zoomies
    // in a living room.
    if (this.followPlayer && this.state === "walking" && this.playerPos
        && !(this._moveLockT > 0) && this.mood !== "aggressive") {
      const pp = this.playerPos;
      const gap = Math.hypot(pp.x - this.dog.position.x, pp.z - this.dog.position.z);
      if (gap > this.followRadius + 4.0) {
        const k = (gap - this.followRadius) / gap;
        this.gallopTo(this.dog.position.x + (pp.x - this.dog.position.x) * k,
                      this.dog.position.z + (pp.z - this.dog.position.z) * k, { follow: this._followWalk });
      }
    }
    if (this.followPlayer && this.state !== "walking" && this.state !== "galloping"
        && this.state !== "eat" && this.state !== "bark"
        && this.state !== "sit" && this.state !== "lay"
        && !(this._followSuppressT > 0)
        && !(this._moveLockT > 0)) {
      const pp = this.playerPos || this.camera.position;
      const dx = pp.x - this.dog.position.x;
      const dz = pp.z - this.dog.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.followRadius + 0.55) {
        const k = (dist - this.followRadius) / dist;
        const tx = this.dog.position.x + dx * k, tz = this.dog.position.z + dz * k;
        // Moderate gaps are closed at a trot (walkTo picks the pace from the
        // distance); only a dog left far behind breaks into a run.
        if (dist > this.followRadius + 4.0 && this.mood !== "aggressive") {
          this.gallopTo(tx, tz, { follow: true });
        } else {
          this.walkTo(tx, tz, { follow: true });
        }
      }
    }
    // ---- Come and meet an offered hand ----
    // Same guards as follow: a commanded sit stays sat, a barking or locked
    // dog is busy, and the cooldown stops this re-issuing a walk every frame.
    // Approach is SLOWER than a normal walk — the last half-metre is a soft
    // close, not a trot into your knees.
    if (this.handInvite > 0 && this.playerPos
        && this.state !== "walking" && this.state !== "galloping"
        && this.state !== "bark" && this.state !== "eat"
        && this.state !== "sit" && this.state !== "lay"
        && this.mood !== "aggressive"
        && !(this._moveLockT > 0) && t > this._handMeetCool) {
      const pp = this.playerPos;
      const dx = pp.x - this.dog.position.x;
      const dz = pp.z - this.dog.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      if (dist > this.handMeetDist + 0.12) {
        const k = (dist - this.handMeetDist) / dist;
        this.walkTo(this.dog.position.x + dx * k, this.dog.position.z + dz * k, {});
        this._handMeetCool = t + 1.0;
        this._softApproach = true;   // throttle walk speed while closing
      }
    }
    // ---- Sit for pet (reciprocal body language) ----
    // A dog that wants more contact often sits so the hand can reach its
    // chest/neck. Builds over ~0.9 s of sustained petting, then holds sit.
    if (this.sitForPet > 0.5 && this.mood !== "aggressive"
        && (this.state === "idle" || this.state === "happy")
        && this._petAmountSm > 0.25) {
      this._sitForPetT = (this._sitForPetT || 0) + d;
      if (this._sitForPetT > 0.9) {
        this.sit();
        this._sitForPetT = 0;
        this.tailWag += 4;
      }
    } else if (this.sitForPet < 0.2) {
      this._sitForPetT = 0;
    }
    // While walking a FOLLOW leg, keep the target pinned to the player's live
    // position. Refresh quietly — do not reset stuck on retarget alone.
    if (this.followPlayer && this._followWalk
        && (this.state === "walking" || this.state === "galloping") && this.followTarget
        && !(this._moveLockT > 0)) {
      const pp = this.playerPos || this.camera.position;
      const dx = pp.x - this.dog.position.x;
      const dz = pp.z - this.dog.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > this.followRadius) {
        const k = (dist - this.followRadius) / dist;
        const r = this._resolve(this.dog.position.x + dx * k, this.dog.position.z + dz * k);
        this.followTarget.x = r.x; this.followTarget.z = r.z;
        // Gait shifting for a follower: trot to keep up (the walking state's
        // pace scales with the gap), run only when left well behind, and
        // drop back once caught up. Hysteresis kills flip-flopping.
        if (dist > this.followRadius + 4.0 && this.state !== "galloping" && this.mood !== "aggressive") {
          this.setState("galloping");
        } else if (dist < this.followRadius + 2.0 && this.state === "galloping") {
          this.setState("walking");
        }
      } else {
        // Close enough — stop instead of orbiting the follow ring. Arriving
        // at the person who invited it is a greeting, not a waypoint: burst
        // the tail + happy clip (cooldown keeps a trailing follower from
        // grinning at every catch-up).
        //
        // Brake into it rather than stopping dead: the follower is usually
        // trotting when the player turns and walks up to it, and a stop from
        // there in one frame read as the dog hitting a wall (measured: a
        // 0.6 m/s → 0 step on every follow arrival). Re-aim the goal at the
        // point the dog can stop on and let the normal arrival finish it.
        const wasFollow = this._followWalk;
        const v = this._moveSpeed;
        const stopD = v * v / (2 * (this.state === "galloping" ? 3.4 : 2.2));
        if (stopD > 0.02) {
          const r = this._resolve(this.dog.position.x + Math.sin(this.dog.rotation.y) * stopD,
                                  this.dog.position.z + Math.cos(this.dog.rotation.y) * stopD);
          this.followTarget.x = r.x; this.followTarget.z = r.z;
          this._followWalk = false;
        } else {
          this.stopMove();
        }
        if (wasFollow && t - this._lastGreetAt > 20) {
          this._lastGreetAt = t;
          this.greet(2.0);
        }
      }
    }

    // ---- Locomotion (direct pursuit) ----
    // Travel along the body's heading while it turns onto the target (arcs,
    // never sideways slides), at a pace chosen from the distance left, and
    // BRAKE into the stop.
    const moving = (this.state === "walking" || this.state === "galloping") && this.followTarget;
    if (moving) {
      const galloping = this.state === "galloping";
      const dx = this.followTarget.x - this.dog.position.x;
      const dz = this.followTarget.z - this.dog.position.z;
      const dist = Math.hypot(dx, dz);
      // Arrival is a braking problem, not a snapping one. The old 5 / 10 cm
      // arrive radius closed the remainder in a single frame — measured as a
      // 3–5.5 m/s spike on every stop — after a long exponential crawl at a
      // few centimetres a second with the legs still cycling. The dog now
      // brakes at a steady deceleration and only the last centimetre is
      // closed directly.
      const arriveR = 0.012;
      if (dist > arriveR) {
        this.targetYaw = Math.atan2(dx, dz);
        const prevYaw = this.dog.rotation.y;
        const _hx = Math.sin(prevYaw), _hz = Math.cos(prevYaw);
        const _align0 = Math.max(0, (_hx * dx + _hz * dz) / dist);
        // Turn rate rises with speed. At a crawl the body swings round over
        // stepping paws (the leg rig steps them); at pace it carves. A single
        // rate either whip-spun a slow dog (measured up to 12 rad/s) or left
        // a fast one unable to follow its own path. Misalignment adds a
        // little on top so a goal behind the dog is an arc, not a stall.
        const v0 = this._moveSpeed;
        const maxRate = galloping ? 3.4 : Math.min(3.2, 1.3 + v0 * 1.8) + 1.1 * (1 - _align0);
        this.dog.rotation.y = this._easeYaw(prevYaw, this.targetYaw, d * (galloping ? 8 : 5), maxRate * d);
        // Bank into it. A quadruped leans its body toward the inside of a turn;
        // a level body swinging round its own axis is the giveaway of a model
        // on a turntable. Applied to the MODEL so it rolls in the dog's own
        // frame, and eased so it settles out of the turn rather than snapping.
        {
          let dy = this.dog.rotation.y - prevYaw;
          while (dy > Math.PI) dy -= Math.PI * 2;
          while (dy < -Math.PI) dy += Math.PI * 2;
          const yawRate = d > 1e-5 ? dy / d : 0;
          const want = Math.max(-0.20, Math.min(0.20, -yawRate * 0.075));
          this._bank = (this._bank || 0) + (want - (this._bank || 0)) * Math.min(1, d * 5);
          if (this.parts.model) this.parts.model.rotation.z = this._bank;
        }
        const paces = this._paces();
        // Pace: short errands are walked and long ones trotted — a follower
        // trots whenever it trails by more than a body length or so. Braking
        // below then takes any gait down through the walk band into the stop,
        // so the gait change happens where a real dog makes it: on the way in.
        let cruise;
        if (galloping) {
          cruise = paces.gallop;
        } else {
          const far = this._followWalk ? dist + 0.6 : dist;
          const k = this._pace === "walk" ? 0 : Math.max(0, Math.min(1, (far - 1.2) / 1.6));
          cruise = paces.walk + (paces.trot - paces.walk) * k * k * (3 - 2 * k);
        }
        // Soft hand-meet: ease into reach instead of trotting into the
        // player's knees. This used to be a flat 0.55× for the WHOLE walk —
        // a dog called from across the room crawled the entire way at
        // ~0.5 m/s (measured) and read as reluctant. The throttle is the
        // LANDING, not the trip: full pace beyond ~2.4 m, blending down to
        // 0.55× only inside arm's reach.
        const softMul = (!galloping && this._softApproach)
          ? 0.55 + 0.45 * Math.max(0, Math.min(1, (dist - 1.1) / 1.3))
          : 1;
        const targetUx = dx / dist, targetUz = dz / dist;
        // Travel along the body's current heading while it turns toward the
        // target. Moving directly down the target vector made the paws slide
        // sideways whenever a new goal was behind the dog.
        const headingUx = Math.sin(this.dog.rotation.y);
        const headingUz = Math.cos(this.dog.rotation.y);
        const alignment = Math.max(0, headingUx * targetUx + headingUz * targetUz);
        // Constant-deceleration arrival: the fastest speed from which this
        // gait can still stop on the mark.
        const brake = galloping ? 3.4 : 2.2;
        const vStop = Math.sqrt(2 * brake * Math.max(0, dist - arriveR * 0.5));
        // Speed floor 0.38: misaligned = a moving arc, never a turntable.
        const desiredSpeed = Math.min(cruise * softMul * (0.38 + 0.62 * alignment), vStop);
        const speedRate = desiredSpeed > this._moveSpeed
          ? (galloping ? 5.5 : 3.2)
          : (galloping ? 9.0 : 6.0);
        const speedDelta = Math.max(
          -speedRate * d,
          Math.min(speedRate * d, desiredSpeed - this._moveSpeed)
        );
        this._moveSpeed = Math.max(0, this._moveSpeed + speedDelta);
        const step = Math.min(dist, this._moveSpeed * d);
        // The final few centimetres are taken straight at the mark: planted
        // paws hide a sidestep that small, where circling round to line up
        // for it would not be hidden.
        const direct = dist < 0.06;
        const ux = direct ? targetUx : headingUx, uz = direct ? targetUz : headingUz;
        let nx = this.dog.position.x + ux * step;
        let nz = this.dog.position.z + uz * step;
        // Slide: if the full step is blocked, try axis-separated slides so the
        // dog follows walls/furniture instead of freezing and treadmilling.
        let r = this._resolve(nx, nz);
        let moved = Math.hypot(r.x - this.dog.position.x, r.z - this.dog.position.z);
        if (moved < step * 0.35) {
          const rx = this._resolve(this.dog.position.x + ux * step, this.dog.position.z);
          const rz = this._resolve(this.dog.position.x, this.dog.position.z + uz * step);
          const mx = Math.hypot(rx.x - this.dog.position.x, rx.z - this.dog.position.z);
          const mz = Math.hypot(rz.x - this.dog.position.x, rz.z - this.dog.position.z);
          if (mx >= mz && mx > moved) { r = rx; moved = mx; }
          else if (mz > moved) { r = rz; moved = mz; }
        }
        this.dog.position.x = r.x;
        this.dog.position.z = r.z;
        // Stuck: no real progress → abandon target and idle. (Braking makes the
        // final approach slow on purpose, so "no progress" is judged against
        // what the dog was trying to do, not an absolute distance.)
        {
          const stuckLimit = galloping ? 0.45 : 0.55;
          if (moved < Math.min(0.002, step * 0.25)) this._stuckT += d; else this._stuckT = 0;
          if (this._stuckT > stuckLimit) {
            this.stopMove();
            this._followSuppressT = 1.4;
          }
        }
        // Gait follows SPEED, not just state (see _selectGait).
        this._selectGait(galloping, paces);
        // Ground the feet to actual speed. Blocked → timeScale 0 (no treadmill).
        // Skipped while a one-shot (launch/flinch) owns the action — its
        // playback rate is authored, not ground-driven. `implied` comes from
        // the clip that is PLAYING (post-shift), not the state's nominal gait.
        if (this._action && !this._onceThen) {
          const actualSpeed = moved / Math.max(0.0001, d);
          const implied = this._impliedSpeed(this._action, paces);
          const rawTs = actualSpeed / Math.max(0.05, implied);
          const ts = actualSpeed < 0.03 ? 0 : Math.max(0.35, Math.min(3.4, rawTs));
          this._action.timeScale += (ts - this._action.timeScale) * Math.min(1, d * 16);
        }
        this.groundSpeed = moved / Math.max(0.0001, d);
        // Paw strikes. The leg rig reports REAL touchdowns (see _legPass); the
        // fixed clip-phase table is only the fallback for a dog without one.
        if (!this._legRig && this._action && this.onFootfall && this.groundSpeed > 0.08) {
          const gclip = this._action.getClip ? this._action.getClip() : null;
          const clipDur = (gclip && gclip.duration) || 1;
          const ph = (this._action.time / clipDur) % 1;
          const prev = this._ffPrevPhase;
          for (const fp of this.footfallPhases) {
            const crossed = prev <= ph ? (fp > prev && fp <= ph) : (fp > prev || fp <= ph);
            if (crossed) {
              const s = Math.max(0.2, Math.min(1, this.groundSpeed / (this.walkSpeed * 2.6)));
              try { this.onFootfall(s); } catch {}
            }
          }
          this._ffPrevPhase = ph;
        }
      } else {
        // The last centimetre: close it and idle.
        this.dog.position.x = this.followTarget.x;
        this.dog.position.z = this.followTarget.z;
        this._moveSpeed = 0;
        this._softApproach = false;
        this.stopMove();
      }
    } else {
      // Not travelling (idle, sat, lying, barking, eating, greeting): the
      // speed bleeds off here, so the next leg starts from rest instead of
      // inheriting whatever pace the dog had when something interrupted it.
      //
      // A standing dog whose stride was cut short by stopMove() (the scene
      // does this for "it noticed you", yields, commands) COASTS out of it
      // over a couple of tenths of a second rather than halting in a single
      // frame — measured 0.6 m/s → 0 on every such interrupt. The planted
      // paws take the few centimetres as settling steps.
      if (this._moveSpeed > 0.02 && (this.state === "idle" || this.state === "happy")) {
        const c = Math.min(this._moveSpeed * d, 0.05);
        const r = this._resolve(this.dog.position.x + Math.sin(this.dog.rotation.y) * c,
                                this.dog.position.z + Math.cos(this.dog.rotation.y) * c);
        this.dog.position.x = r.x;
        this.dog.position.z = r.z;
        this._moveSpeed = Math.max(0, this._moveSpeed - d * 3.2);
      } else {
        this._moveSpeed = Math.max(0, this._moveSpeed - d * 6);
      }
      this.groundSpeed *= Math.max(0, 1 - d * 8);
    }
    if (!moving && this.state === "idle") {
      this._softApproach = false;
      // Gently turn the whole body to watch the player when they're near and
      // we're not mid-sniff (headPitch high). Reads as a dog tracking you.
      // Standing only: a sitting or lying dog follows you with its head (the
      // gaze layer) — it used to swivel on its haunches like a desk chair.
      // With the leg rig the turn is carried by real steps, so it runs at the
      // pace paws can keep up with (~75°/s) rather than a turntable's 150°/s.
      if (this.headPitch < 0.3) {
        const pp = this.playerPos || this.camera.position;
        const dx = pp.x - this.dog.position.x;
        const dz = pp.z - this.dog.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.001 && dist < 5.0) {
          const wantYaw = Math.atan2(dx, dz);
          let off = wantYaw - this.dog.rotation.y;
          while (off > Math.PI) off -= Math.PI * 2;
          while (off < -Math.PI) off += Math.PI * 2;
          if (Math.abs(off) > 0.55) this._watchTurn = true;
          else if (Math.abs(off) < 0.10) this._watchTurn = false;
          if (this._watchTurn) {
            const beforeYaw = this.dog.rotation.y;
            const rate = this._legRig ? 1.3 : 2.6;
            this.dog.rotation.y = this._easeYaw(this.dog.rotation.y, wantYaw, d * 2.4, rate * d);
            this._turnRate = Math.abs(this.dog.rotation.y - beforeYaw) / Math.max(0.001, d);
          }
        }
      }
    }

    // Level out of the turn whenever the dog isn't driving one — a bank that
    // survives the corner leaves the animal standing tilted.
    if (!moving && this.parts.model) {
      this._bank = (this._bank || 0) * Math.max(0, 1 - d * 5);
      this.parts.model.rotation.z = this._bank;
    }

    // ---- Head-low "settle/sniff" pose (scene raises headPitch for sniff &
    // drink). Blend to the head-low clip only while idle; decay headPitch so a
    // single-frame poke doesn't stick the head down forever.
    const wantLow = this.headPitch > 0.35 ? 1 : 0;
    this._headLowSm += (wantLow - this._headLowSm) * Math.min(1, d * 6);
    // (Skipped while a one-shot owns the action — the head-low swap used to
    // stomp a just-started flinch in the same frame it began.)
    if (this.state === "idle" && this._has("Idle_2_HeadLow") && !this._onceThen) {
      const low = this.parts.actions["Idle_2_HeadLow"];
      if (this._headLowSm > 0.5 && this._action !== low) this._play("Idle_2_HeadLow", 0.25);
      else if (this._headLowSm <= 0.5 && this._action === low) this._play("Idle", 0.25);
    }
    // Time-based decay (half-life ~0.45 s). The old per-frame ×0.86 emptied
    // the pose in ~80 ms at 60 fps, so sniff/drink head-lows unstuck almost
    // instantly — and the decay rate changed with the frame rate.
    this.headPitch *= Math.pow(0.5, d / 0.45);

    // ---- Clip speed perk-up when petted (idle only; walking timeScale is
    // driven by ground speed above so the feet stay planted) ----
    if (this._action && this.state === "idle") {
      const tgt = 1.0 + this._petAmountSm * 0.3;
      this._action.timeScale += (tgt - this._action.timeScale) * 0.1;
    }

    // ---- Bark → return to the previous looping state when the cool-down ends.
    if (this.state === "bark") {
      this.barkCooldown -= d;
      if (this.barkCooldown <= 0) this.setState(this.prevState === "sit" ? "sit" : "idle");
    }
    // ---- Eat → munch for a beat, then settle.
    if (this.state === "eat") {
      this.eatPhase -= d * 0.5;
      if (this.eatPhase <= 0) this.setState("sit");
    }
    // Track time spent sitting (scene's auto-lay-down uses this).
    if (this.state === "sit") this._sitTimer += d;
    // Total rest time (sit OR lie) — stand() reads it for the bow-stretch.
    if (this.state === "sit" || this.state === "lay") this._restT = (this._restT || 0) + d;
    // ---- Greeting beat countdown ----
    if (this._greetT > 0) {
      this._greetT = Math.max(0, this._greetT - d);
      this.tailWag += d * 6;
      if (this._greetWoof) {
        this._greetWoof = false;
        try {
          if (window.PhobiaAudio?.dogVocal) {
            window.PhobiaAudio.dogVocal("woof", 0.45, {
              x: this.dog.position.x,
              y: this.dog.position.y + (this.parts.height || 0.5) * 0.6,
              z: this.dog.position.z,
            }, { count: 1, reverb: 0.15 });
          }
        } catch {}
      }
      if (this._greetT <= 0 && this.state === "happy") this.setState("idle");
    }
    // ---- Bark burst: re-arm the head-toss for each remaining audible bark.
    if (this._burstN > 0) {
      this._burstT -= d;
      if (this._burstT <= 0) { this._burstN--; this._burstT = this._burstGap; this.barkSmall(); }
    }

    // ---- Turn-in-place step shuffle (fallback) ----
    // A dog pivoting on the spot takes little steps — rotating the group over
    // planted paws read as ice-skating. With the leg rig the paws stay planted
    // and step for real (DogLegRig idle steps), so this only runs without it:
    // blend the Walk clip in UNDER Idle at low weight while the body turns.
    {
      const want = (!this._legRig && this.state === "idle" && (this._turnRate || 0) > 0.35)
        ? Math.min(0.85, this._turnRate / 2.0) : 0;
      this._shufW = (this._shufW || 0) + (want - (this._shufW || 0)) * Math.min(1, d * 6);
      const walkAct = this._has("Walk") ? this.parts.actions["Walk"] : null;
      if (walkAct && this._action && this._action !== walkAct) {
        if (this._shufW > 0.03) {
          if (!this._shufOn) {
            this._shufOn = true;
            walkAct.reset();
            walkAct.setLoop(THREE.LoopRepeat, Infinity);
            walkAct.timeScale = 0.75;
            walkAct.play();
          }
          walkAct.setEffectiveWeight(this._shufW);
        } else if (this._shufOn) {
          this._shufOn = false;
          walkAct.stop();
        }
      } else if (this._shufOn) {
        this._shufOn = false;   // Walk became the main action — it owns itself now
      }
    }
    // One-shot → loop handoff: near the end of a launch/flinch clip, fade
    // into the follow-up loop so the rig never sits on a clamped last frame.
    // An INTERRUPTED one-shot (something else already faded a new action in —
    // e.g. the startle scramble's walkTo) only clears the bookkeeping: playing
    // ot.next here would stomp the interrupter and strand the dog gliding on
    // a non-locomotion clip.
    if (this._onceThen) {
      const ot = this._onceThen;
      if (!this._action || this._action !== ot.action) {
        this._onceThen = null;
      } else if (ot.action.time >= ot.dur - 0.22) {
        this._onceThen = null;
        this._play(ot.next, 0.25);
      }
    }
    // Leg rig: built the first frame the model and its calibration exist.
    // restore() hands the mixer back last frame's clean clip pose for every
    // bone the rig edits (see DogLegRig), capture() records the new one.
    if (!this._legRig && p.legCal && p.model && this._legRigFailed !== true) {
      const rig = new DogLegRig(this.dog, p.model, p.legCal, p.height);
      if (rig.ok) this._legRig = rig; else this._legRigFailed = true;
    }
    if (this._legRig) this._legRig.restore();
    p.mixer.update(d);
    if (this._legRig) this._legRig.capture();
    this._bodyLife(t, d);
    this._legPass(t, d);
    // Fur shells: full within ~2.7 m, thinned out by 4.5 m, not drawn past it
    // (at that range a strand is under a pixel and would only shimmer).
    if (p.furShells && p.furShells.length && p.furFade) {
      const cam = this.camera;
      const dd = Math.hypot(cam.position.x - this.dog.position.x,
        cam.position.y - this.dog.position.y, cam.position.z - this.dog.position.z);
      const f = Math.max(0, Math.min(1, (4.5 - dd) / 1.8));
      p.furFade.value = f;
      const vis = f > 0.02;
      if (vis !== this._furVis) {
        this._furVis = vis;
        for (const sh of p.furShells) sh.visible = vis;
      }
    }
  }

  // Procedural life layered ON TOP of the current clip pose (the mixer has just
  // written each bone, so we read it and ADD a small delta — no compounding).
  // Gives a resting dog breath + tail wag, a walking dog a body bob, and ears
  // that sway with motion. This is what turns the clip-puppet into a creature.
  _bodyLife(t, d) {
    const model = this.parts.model;
    if (!model) return;
    if (!this._rig) {
      // Quaternius dogs use dotted side suffixes (Ear1.L); older lookups used
      // Ear1L. Accept both so ear language + sit/lie leg folds actually bind.
      const find = (n) => { let r = null; model.traverse(o => { if (!r && o.isBone && o.name === n) r = o; }); return r; };
      const findAny = (...names) => { for (const n of names) { const r = find(n); if (r) return r; } return null; };
      const side = (base, s) => findAny(base + "." + s, base + s);
      this._rig = {
        tail:  [find("Tail1"), find("Tail2"), find("Tail3")].filter(Boolean),
        chest: [find("Torso"), find("Torso2"), find("Torso3"), find("Back")].filter(Boolean),
        neck:  findAny("Neck", "Neck2", "Neck1"),
        // Full neck chain for the gaze layer — yaw/pitch distribute along it
        // so the head turn reads as flesh, not a swivel joint.
        neckChain: [find("Neck1"), find("Neck2"), find("Neck3")].filter(Boolean),
        head:  findAny("Head", "Head1", "Neck2"),
        earsL: [side("Ear1", "L"), side("Ear2", "L")].filter(Boolean),
        earsR: [side("Ear1", "R"), side("Ear2", "R")].filter(Boolean),
        // Pelvis + hind/fore legs for the procedural sit/lie poses.
        pelvis: find("Back"),
        hindUpper: [side("BackUpperLeg", "L"), side("BackUpperLeg", "R")].filter(Boolean),
        hindLower: [side("BackLowerLeg", "L"), side("BackLowerLeg", "R")].filter(Boolean),
        foreUpper: [side("FrontUpperLeg", "L"), side("FrontUpperLeg", "R")].filter(Boolean),
        foreLower: [side("FrontLowerLeg", "L"), side("FrontLowerLeg", "R")].filter(Boolean),
      };
    }
    const rig = this._rig;
    // ---- Additive-layer safety net ----
    // three.js PropertyMixer SKIPS re-writing a bone when the clip track's
    // value is unchanged since last frame (flat keyframe spans) — so "read
    // the mixer pose, ADD a delta" silently COMPOUNDS on those frames: the
    // sitting dog's chest ratcheted up by one sit-lift per skipped frame and
    // sawtooth-reset at the next keyframe (~6 Hz head shake, the single
    // biggest vibration source). Track each rig bone: if its rotation still
    // equals what WE left there last frame, the mixer skipped it → restore
    // the clean pre-delta base before this frame's layers run.
    if (!this._lifeBones) {
      const set = new Set();
      [...rig.tail, ...rig.chest, rig.neck, ...rig.neckChain, rig.head,
       ...rig.earsL, ...rig.earsR, rig.pelvis,
       ...rig.hindUpper, ...rig.hindLower, ...rig.foreUpper, ...rig.foreLower]
        .forEach(b => { if (b) set.add(b); });
      this._lifeBones = [...set].map(b => ({ b, base: { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z }, fin: { x: NaN, y: NaN, z: NaN } }));
    }
    for (const r of this._lifeBones) {
      const rot = r.b.rotation;
      if (rot.x === r.fin.x && rot.y === r.fin.y && rot.z === r.fin.z) {
        rot.set(r.base.x, r.base.y, r.base.z);      // mixer skipped → clean base
      } else {
        r.base.x = rot.x; r.base.y = rot.y; r.base.z = rot.z;   // fresh clip pose
      }
    }
    const resting = this.state === "idle" || this.state === "sit" || this.state === "lay";
    // Vertical pose offset accumulator (sit drop, coil crouch, aggression
    // lift). Applied through the body-bob section's ABSOLUTE y write — pose
    // code must never += dog.position.y directly, or it fights the ease-back
    // and the offset amplifies by ~1/(d·6) at equilibrium. One frame of lag
    // between accumulation and application is invisible (offsets ease in).
    const poseYPrev = this._poseYOff || 0;
    this._poseYOff = 0;

    // ---- Gaze layer (clamped head/neck look-at) ----
    // Convert the world-space target into the dog's local frame, split the
    // clamped yaw/pitch across the neck chain + head, and ease everything so
    // attention shifts read as intent, not teleporting eyes. Runs before the
    // wag/pose layers so they stack on the oriented head.
    {
      const wantW = this.gazeTarget ? this.gazeWeight : 0;
      this._gazeWSm += (wantW - this._gazeWSm) * Math.min(1, d * 4);
      if (this._gazeWSm > 0.005 && rig.head) {
        let desYaw = 0, desPitch = 0;
        if (this.gazeTarget) {
          const hp = rig.head.getWorldPosition(this._gazeHeadPos || (this._gazeHeadPos = new THREE.Vector3()));
          const wx = this.gazeTarget.x - hp.x;
          const wy = (this.gazeTarget.y != null ? this.gazeTarget.y : hp.y) - hp.y;
          const wz = this.gazeTarget.z - hp.z;
          // world → dog-local (undo the body yaw)
          const cy = Math.cos(-this.dog.rotation.y), sy = Math.sin(-this.dog.rotation.y);
          const lx = wx * cy + wz * sy;
          const lz = -wx * sy + wz * cy;
          desYaw = Math.max(-1.2, Math.min(1.2, Math.atan2(lx, lz)));
          desPitch = Math.max(-0.5, Math.min(0.6, Math.atan2(wy, Math.hypot(wx, wz))));
          // Beyond the neck's range the dog would have to turn its body —
          // fade the gaze out instead of pinning the head at the clamp.
          const over = Math.abs(Math.atan2(lx, lz)) - 1.2;
          if (over > 0) this._gazeWSm *= Math.max(0, 1 - over * 1.5);
        }
        this._gazeYawSm += (desYaw - this._gazeYawSm) * Math.min(1, d * 5.5);
        this._gazePitchSm += (desPitch - this._gazePitchSm) * Math.min(1, d * 5.5);
        const w = this._gazeWSm;
        const chain = rig.neckChain.length ? rig.neckChain : (rig.neck ? [rig.neck] : []);
        // Neck leads, head trails — a slight lag reads as intent rather than
        // a swivel head tracking the player like a turret.
        const perNeck = chain.length ? 0.68 / chain.length : 0;
        // Turn about the dog's UP axis and nod about its lateral axis, in
        // each bone's own frame (_rotDog). The old .y channel was a turn on
        // the neck but a pure ROLL on the head (its y runs down the snout),
        // so a 0.6 rad look turned the snout 24° and rolled it 25°.
        for (const nb of chain) {
          this._rotDog(nb, 0, 1, 0, this._gazeYawSm * perNeck * w);
          this._rotDog(nb, 1, 0, 0, -this._gazePitchSm * perNeck * 0.55 * w);
        }
        this._rotDog(rig.head, 0, 1, 0, this._gazeYawSm * 0.32 * w);
        this._rotDog(rig.head, 1, 0, 0, -this._gazePitchSm * 0.48 * w);
      }
      // One-frame request: the scene must keep calling lookAt3 to hold gaze.
      this.gazeTarget = null; this.gazeWeight = 0;
    }

    // ---- Tail language ----
    // Carriage + wag pattern come from the emotional mood, not just "how
    // happy": relaxed = loose mid-height wag; alert = tail HIGH and stiff
    // with a short fast tick; aggressive (offensive threat) = tail HIGH and
    // stiff with a fast tight tick, weight forward. A LOW fast wag is the
    // FEARFUL-appeasing flag — commonly misread as friendly, which is the
    // classic dog-bite antecedent — and lives in the tuck channel below.
    // Real body language IS the therapy content, so these must be readable
    // at a glance.
    this._wagImpulse = Math.min(2.5, this._wagImpulse + (this.tailWag || 0));
    this.tailWag = 0;
    this._wagImpulse *= Math.pow(0.35, d);
    this._growlSm += ((this._growlT > 0 ? 1 : 0) - this._growlSm) * Math.min(1, d * 10);
    if (this._growlT > 0) this._growlT = Math.max(0, this._growlT - d);
    let wagAmp, wagFreq, tailLift;
    this._excSm += ((this.excitement || 0) - this._excSm) * Math.min(1, d * 3);
    if (this.mood === "aggressive") {
      wagAmp = 0.15; wagFreq = 13; tailLift = 0.35;              // high + stiff, fast tick
    } else if (this.mood === "alert") {
      wagAmp = 0.10; wagFreq = 8; tailLift = 0.38;               // high + stiff
    } else if (this.mood === "excited") {
      // High tail with a big, fast, loose sweep — the body-language opposite
      // of alert's stiff high tick. This is the tell that separates an
      // excited bark from an angry one, so it has to read from across a room.
      wagAmp = Math.min(1, 0.55 + this._excSm * 0.35 + this._wagImpulse * 0.4);
      wagFreq = 9 + this._excSm * 4; tailLift = 0.22;
    } else {
      // Excitement lifts the resting wag — the approach is the reward.
      const calmWag = (resting ? (0.10 + this.happy * 0.25) * (0.7 + 0.3 * this.energy) : 0.04)
        + this._excSm * 0.20;
      wagAmp = Math.min(1, calmWag + this._petAmountSm * 0.8 + this._wagImpulse * 0.5);
      wagFreq = 5 + wagAmp * 11; tailLift = 0;
    }
    // Tucked tail (fear/appeasement) overrides the mood carriage: deep drop
    // on Tail1, wag collapsed to a fast tight tick, ears eased back, body a
    // touch lower. Eases in fast, releases slowly — fear doesn't snap off.
    this._tuckSm += ((this.tuck || 0) - this._tuckSm) * Math.min(1, d * ((this.tuck || 0) > this._tuckSm ? 6 : 1.1));
    if (this._tuckSm > 0.01) {
      const tk = this._tuckSm;
      tailLift = tailLift * (1 - tk) - 0.55 * tk;
      wagAmp *= 1 - tk * 0.9;
      wagFreq = Math.max(wagFreq, 12);
      for (const e of rig.earsL) e.rotation.x += 0.25 * tk;
      for (const e of rig.earsR) e.rotation.x += 0.25 * tk;
      this._poseYOff -= 0.03 * tk * (this.parts.height || 0.6);
    }
    // Growl freeze: the wag dies while the body coils around the sound.
    wagAmp *= 1 - this._growlSm * 0.9;
    // A lying dog's tail rests on the floor behind it instead of standing
    // up off its back as it does on its feet.
    if (this._layAmt > 0.01) tailLift -= 0.55 * this._layAmt;
    this._wagPhase += d * wagFreq;
    for (let i = 0; i < rig.tail.length; i++) {
      // Whip: amplitude grows toward the tip, with a slight phase lag per joint.
      // Swing about the dog's UP axis — the tail bones' own y runs along the
      // tail, so the old .y wag twisted it in place and every wag, greeting
      // burst and appeasement tick was invisible.
      this._rotDog(rig.tail[i], 0, 1, 0, Math.sin(this._wagPhase - i * 0.5) * wagAmp * (0.14 + i * 0.07));
      if (tailLift) rig.tail[i].rotation.x += tailLift * (i === 0 ? 1 : 0.35);
    }

    // ---- Breathing ---- (chest rises/falls; subtle, faster when keyed up.
    // Slightly fuller at rest so a standing dog reads as alive in close-up.)
    const breatheK = resting ? 1 : 0.45;
    this._breathPhase += d * (this.state === "bark" ? 4.2 : (resting ? 1.45 : 1.7));
    const br = Math.sin(this._breathPhase);
    const breathAmp = 0.016 * breatheK * (0.85 + 0.15 * (this.parts.height || 0.7));
    for (let i = 0; i < rig.chest.length; i++) {
      rig.chest[i].rotation.x += br * breathAmp * (1 - i * 0.18);
      // Soft lateral rib swell — absolute scale each frame (clips don't drive
      // it). Ribcage only (Torso2), cancelled again on its child: the chest
      // bones are NESTED, so swelling all four compounded down the spine and
      // the head breathed ±5 % wide, face shifting 2–3 cm a breath.
      if (rig.chest[i].scale) {
        const nm = rig.chest[i].name;
        const s = resting && nm === "Torso2" ? (1 + br * 0.012 * breatheK) : 1;
        const sy = resting && nm === "Torso2" ? (1 + br * 0.006 * breatheK) : 1;
        if (nm === "Torso3") {
          const pr = resting ? (1 + br * 0.012 * breatheK) : 1;
          const pry = resting ? (1 + br * 0.006 * breatheK) : 1;
          rig.chest[i].scale.set(1 / pr, 1 / pry, 1 / pr);
        } else {
          rig.chest[i].scale.set(s, sy, s);
        }
      }
    }
    if (rig.neck) rig.neck.rotation.x -= br * 0.008 * breatheK;   // keep head level
    // Soft idle weight rock — a standing dog never freezes perfectly still.
    if (resting && this._walkAmtSm < 0.05) {
      const rock = Math.sin(t * 0.55) * 0.012;
      this._rotDog(rig.pelvis, 0, 0, 1, rock);
      this._rotDog(rig.chest[0], 0, 0, 1, -rock * 0.6);
    }

    // ---- Panting ---- (these rigs ship no jaw bone, so the pant that the
    // audio timer plays reads through the body instead: a fast shallow chest
    // flutter + a soft nose-bob at the pant rate, harder with exertion)
    this._pantSm += ((this.pant || 0) - this._pantSm) * Math.min(1, d * 2.5);
    if (this._pantSm > 0.02) {
      this._pantPhase += d * (16 + this._pantSm * 10);            // ~2.5-4 Hz
      const pk = Math.sin(this._pantPhase) * this._pantSm;
      if (rig.chest[0]) rig.chest[0].rotation.x += pk * 0.010;
      if (rig.neck) rig.neck.rotation.x += pk * 0.012;
      if (rig.head) rig.head.rotation.x += pk * 0.022;
    }

    // ---- Walking scent-scan ----
    // headPitch requests (sniff trips) lower the head DURING the walk leg
    // too — the Idle_2_HeadLow clip swap only covers idle, so the trot to a
    // scent used to stay head-high while the sniff audio already played.
    if (this._headLowSm > 0.02 && this.state === "walking") {
      const hl = this._headLowSm;
      const chain = rig.neckChain.length ? rig.neckChain : (rig.neck ? [rig.neck] : []);
      const per = chain.length ? 0.35 / chain.length : 0;
      for (const nb of chain) nb.rotation.x -= per * hl;
      if (rig.head) rig.head.rotation.x -= 0.40 * hl;
    }

    // ---- Body height ----
    // The leg rig grounds every paw (DogLegRig), so the body is free to rise
    // and fall with the gait and the pose layers: y = floor + pose offset +
    // gait bob, and the legs bend to absorb it. This replaces a latch that
    // probed skinned vertices for the floor — and probed only the first
    // skinned mesh, the COAT, never the separate paw mesh, so it lowered the
    // whole dog until the coat touched down and the paws stood 6–15 cm under
    // the boards in every pose (plus an every-third-frame vertex scan while
    // calibrating, which showed up as a period-3 hitch in the frame times).
    //
    // ---- Gait bob + shoulder roll ----
    // Phase-locked to the playing cycle. The old bob ran at a fixed 2.2 Hz of
    // clip time — 2.35 bobs per walk cycle, 1.25 per gallop — so it drifted
    // through the footfalls and the body rose where it should sink. Now: two
    // beats a cycle for walk and trot, peaking where the clip's own Body track
    // peaks (phase 0.22 / 0.72, measured), zero-mean so a moving dog rides at
    // the same height as a standing one. The gallop's single big bound is
    // authored in its clip (5.4 cm) and needs nothing added.
    const speedNorm = Math.min(1, (this.groundSpeed || 0) / Math.max(0.15, this.walkSpeed * 0.55));
    const locoAmt = (this.state === "walking" || this.state === "galloping")
      ? speedNorm * (this.state === "galloping" ? 1.8 : 1)
      : 0;
    this._walkAmtSm += (locoAmt - this._walkAmtSm) * Math.min(1, d * 8);
    let bobP = 0;
    const gaitClip = this._action && this._action.getClip ? this._action.getClip() : null;
    const gaitName = gaitClip ? gaitClip.name : "";
    if (this._walkAmtSm > 0.01 && (gaitName === "Walk" || gaitName === "Trot" || gaitName === "Gallop")) {
      const ph = ((this._action.time / gaitClip.duration) % 1 + 1) % 1;
      bobP = ph * Math.PI * 4;
      const amp = gaitName === "Trot" ? 0.024 : gaitName === "Walk" ? 0.008 : 0;
      const bob = 0.5 * amp * (this.parts.height || 0.6)
        * Math.cos(Math.PI * 4 * (ph - 0.22)) * Math.min(1, this._walkAmtSm);
      this.dog.position.y = this.baseY + poseYPrev + bob;
      // Shoulder roll leads the pelvis — the withers rock before the hips
      // settle — one roll per cycle.
      if (rig.chest[0]) rig.chest[0].rotation.z += Math.sin(bobP * 0.5 + 0.35) * 0.065 * Math.min(1, this._walkAmtSm);
      if (rig.pelvis) rig.pelvis.rotation.z -= Math.sin(bobP * 0.5) * 0.035 * Math.min(1, this._walkAmtSm);
    } else {
      this.dog.position.y += (this.baseY + poseYPrev - this.dog.position.y) * Math.min(1, d * 6);
    }

    // ---- Ears ---- (gentle sway + a bounce while trotting; perked hard
    // forward when alert — the "ears up, watching" of the rung description.
    // Excitement perks them a notch even on a relaxed dog.)
    const earPerk = (this.mood === "alert" || this.mood === "excited" ? 0.18 : 0) + this._excSm * 0.12;
    const earOsc = Math.sin(this._wagPhase * 0.5) * 0.028
      + (this._walkAmtSm > 0.01 ? Math.sin(bobP) * 0.075 * this._walkAmtSm : 0)
      + (resting ? Math.sin(t * 1.1) * 0.020 : 0);
    // Perk is FORWARD: +x on these ear bones swings the tip BACK (measured),
    // so the old +earPerk laid an alert dog's ears back — in a scene that
    // teaches reading a dog, that taught the opposite of the truth.
    for (let i = 0; i < rig.earsL.length; i++) rig.earsL[i].rotation.x += earOsc * (0.5 + i * 0.3) - earPerk;
    for (let i = 0; i < rig.earsR.length; i++) rig.earsR[i].rotation.x += earOsc * (0.55 + i * 0.28) - earPerk;
    // Asymmetric orienting: the leading ear rotates toward the gaze target —
    // permanently mirrored ears are a persistent puppet tell in close-up.
    const earGy = this._gazeYawSm * this._gazeWSm;
    if (Math.abs(earGy) > 0.02) {
      for (const e of rig.earsL) e.rotation.z += Math.max(0, Math.min(1, earGy)) * 0.12;
      for (const e of rig.earsR) e.rotation.z -= Math.max(0, Math.min(1, -earGy)) * 0.12;
    }
    // Independent flick: one ear at a time, on its own 3-8 s clock at rest
    // (was 4-10 — slightly more frequent so the face stays alive).
    if (resting) {
      this._earFlickT -= d;
      if (this._earFlickT <= 0) {
        this._earFlickT = 3 + Math.random() * 5;
        this._earFlickSide = Math.random() < 0.5 ? -1 : 1;
        this._earFlickA = 1;
      }
    }
    if (this._earFlickA > 0) {
      const fa = Math.sin(this._earFlickA * Math.PI) * 0.34;      // slightly stronger flick
      this._earFlickA = Math.max(0, this._earFlickA - d * 4);
      for (const e of (this._earFlickSide < 0 ? rig.earsL : rig.earsR)) e.rotation.x += fa;
    }

    // ---- Procedural bark (head toss) ----
    // Sharp rise, quick settle: the head snaps up-and-back with the chest
    // pulsing once — synced by the scene to the bark audio. ~0.45 s total.
    if (this._barkPulse > 0.001) {
      const bp = this._barkPulse;
      this._barkPulse = Math.max(0, bp - d * 2.4);
      const toss = Math.sin(Math.min(1, (1 - bp)) * Math.PI) ; // 0→1→0 over the pulse
      if (rig.head) rig.head.rotation.x += toss * 0.38;
      if (rig.neck) rig.neck.rotation.x += toss * 0.18;
      if (rig.chest[0]) rig.chest[0].rotation.x += toss * 0.05;
      // Ears flick with the toss
      for (const e of rig.earsL) e.rotation.x += toss * 0.2;
      for (const e of rig.earsR) e.rotation.x += toss * 0.2;
    }

    // ---- Shake-off (one-shot) ----
    // Whole-body roll wave, head leading, ears flapping — dogs shake to
    // reset after rising from a lie or when tension breaks. ~0.8 s at ~9 Hz.
    if (this._shakePulse > 0.001) {
      const sp = this._shakePulse;
      this._shakePulse = Math.max(0, sp - d / 0.8);
      const osc = Math.sin(t * 56) * 0.18 * sp;
      for (let i = 0; i < rig.chest.length; i++) this._rotDog(rig.chest[i], 0, 0, 1, osc * (0.45 + i * 0.25));
      this._rotDog(rig.neck, 0, 0, 1, osc * 1.1);
      this._rotDog(rig.head, 0, 0, 1, osc * 1.5);
      for (const e of rig.earsL) e.rotation.x += Math.sin(t * 56 + 1.4) * 0.30 * sp;
      for (const e of rig.earsR) e.rotation.x += Math.sin(t * 56 + 2.8) * 0.30 * sp;
    }
    // ---- Head-cock (one-shot) ----
    // The listening tilt: head rolls to one side, chin lifts a touch, the
    // high-side ear pricks while the other flops. Asymmetry is the whole
    // point — a symmetric ear move reads as wind, not attention.
    if (this._cockT > 0.001) {
      const env = Math.sin((1 - this._cockT) * Math.PI);
      this._cockT = Math.max(0, this._cockT - d / (this._cockDur || 0.9));
      const dir = this._cockDir;
      if (rig.head) {
        this._rotDog(rig.head, 0, 0, 1, 0.40 * env * dir);   // tilt, about the snout
        rig.head.rotation.x += 0.06 * env;              // chin up: "I'm listening"
      }
      this._rotDog(rig.neck, 0, 0, 1, 0.13 * env * dir);
      for (const e of rig.earsL) e.rotation.x += (dir > 0 ? 0.20 : -0.09) * env;
      for (const e of rig.earsR) e.rotation.x += (dir > 0 ? -0.09 : 0.20) * env;
    }
    // ---- Bow-stretch (one-shot) ----
    // After a long rest: chest dips front-down (play-bow shape — the +x
    // front-down signs measured on this rig, see the sit block) with the
    // head up, over ~1.2 s.
    if (this._stretchPulse > 0.001) {
      const env = Math.sin((1 - this._stretchPulse) * Math.PI);
      this._stretchPulse = Math.max(0, this._stretchPulse - d / 1.2);
      if (rig.chest[0]) rig.chest[0].rotation.x += 0.28 * env;
      if (rig.chest[1]) rig.chest[1].rotation.x += 0.22 * env;
      if (rig.neck) rig.neck.rotation.x += 0.12 * env;
      if (rig.head) rig.head.rotation.x += 0.30 * env;
      this._poseYOff -= 0.05 * env * (this.parts.height || 0.6);
    }

    // ---- Coil (pre-charge telegraph) ----
    // The load-up before the spring: haunches sink, chest drops toward the
    // floor, head levels dead-straight at the target, total stillness. This
    // is the player's WINDOW — back away during the coil and the charge
    // aborts. It must read unmistakably.
    this._coilSm += ((this.coil || 0) - this._coilSm) * Math.min(1, d * 8);
    if (this._coilSm > 0.01) {
      const c = this._coilSm;
      this._poseYOff -= 0.10 * c * (this.parts.height || 0.8);
      for (const b of rig.hindUpper) b.rotation.x += 0.5 * c;
      for (const b of rig.hindLower) b.rotation.x -= 0.55 * c;
      if (rig.pelvis) rig.pelvis.rotation.x += 0.18 * c;
      if (rig.head) rig.head.rotation.x += 0.30 * c;   // level the stare
      // Stillness: damp the breath/idle by biasing the phases (visual quiet)
      this._breathPhase += d * 2.5;                    // fast shallow breath
    }

    // ---- Procedural sit / lie ----
    // No Sit/Lie clips ship with the models, so the pose is sculpted: pelvis
    // drops onto folded hind legs (sit), then the forelegs fold and the chest
    // comes down too (lie). Offsets ease in over ~0.4 s so the dog settles
    // rather than snapping.
    const sitWant = this.state === "sit" ? 1 : 0;
    const layWant = this.state === "lay" ? 1 : 0;
    this._sitAmt += (Math.max(sitWant, layWant) - this._sitAmt) * Math.min(1, d * 3);
    this._layAmt += (layWant - this._layAmt) * Math.min(1, d * 2.4);
    // With the leg rig, sit and lie are whole-body poses with placed paws
    // (DogLegRig._applyBodyPose / _poseTarget, driven from _sitAmt/_layAmt).
    // The FK folds below are the fallback for a dog without one: they bend
    // the legs but can't move the paws, which is why they never read.
    if (!this._legRig && this._sitAmt > 0.01) {
      const s = this._sitAmt, l = this._layAmt;
      const H = this.parts.height || 0.8;
      // Haunch drop: rear sinks, hind legs fold under the body. Kept shallow —
      // the self-calibrating ground clamp owns the exact floor contact; this
      // only shapes the transient so the settle starts moving immediately.
      this._poseYOff -= (0.16 * s + 0.05 * l) * H;
      for (const b of rig.hindUpper) b.rotation.x += 0.95 * s + 0.35 * l;
      for (const b of rig.hindLower) b.rotation.x -= (1.25 * s + 0.30 * l);
      // Spine signs MEASURED on the live rig (probe: rotate, read world y):
      // pelvis/chest +x pitches the FRONT DOWN on these Quaternius dogs — the
      // old +pelvis/−chest combination produced a play-bow (head at floor,
      // rear in the air) whenever a sit was commanded.
      // Pivot depth RE-MEASURED after the ground-latch poseYOff fix: −0.31
      // levels the front paws with the rump bottom (probe: spread 8.4 cm at
      // −0.12, ~0 at −0.31), so the clamp plants BOTH ends on the boards —
      // the old small pivot left the rump hovering once the paws grounded.
      // (The pivot mostly LIFTS the front rather than sinking the rear, which
      // is why the pre-clamp code kept it small — grounding is the clamp's
      // job now, the pivot's job is closing the front↔rear spread.)
      if (rig.pelvis) rig.pelvis.rotation.x -= 0.31 * s * (1 - l);
      if (rig.chest[1]) rig.chest[1].rotation.x += 0.34 * s * (1 - l);
      if (rig.chest[0]) rig.chest[0].rotation.x += 0.20 * s * (1 - l);
      if (rig.neck) rig.neck.rotation.x += 0.22 * s * (1 - l);
      // …and folds down flat in a lie, forelegs tucking, chest to the floor.
      for (const b of rig.foreUpper) b.rotation.x -= 0.85 * l;
      for (const b of rig.foreLower) b.rotation.x += 1.15 * l;
      if (rig.chest[0]) rig.chest[0].rotation.x -= 0.22 * l;
      if (rig.neck) rig.neck.rotation.x += 0.10 * l;
    }

    // ---- Aggression posture (barking rung) ----
    // Smooth the scene-driven aggression + the one-shot rear, then sculpt a
    // threatening stance ON TOP of the clip: head/neck lowered and thrust
    // forward (stalk), hackles up, ears pinned back, a tense low-frequency
    // quiver — and on the snap, a sharp upward head/forequarter REAR so the
    // face comes up at the camera. Signs were tuned against the live model.
    this._aggSm += ((this.aggression || 0) - this._aggSm) * Math.min(1, d * 6);
    this._rearImpulse = Math.max(0, this._rearImpulse - d * 2.2);   // ~0.45s pulse
    this._rearSm += (this._rearImpulse - this._rearSm) * Math.min(1, d * 14);
    const agg = this._aggSm, rear = this._rearSm;
    if (agg > 0.01 || rear > 0.01 || this._growlSm > 0.01) {
      // Growl doubles the taut-muscle tremble and drops the head further —
      // the body visibly coils around the sound for its duration.
      const quiver = Math.sin(t * 34) * 0.012 * Math.max(agg, this._growlSm * 0.5) * (1 + this._growlSm);
      if (rig.head) {
        rig.head.rotation.x += -0.5 * agg * 0.45 - 0.15 * this._growlSm + rear * 0.7 + quiver; // low+forward, then UP on rear
      }
      if (rig.neck) {
        rig.neck.rotation.x += -0.28 * agg + rear * 0.5;               // extend/lower neck, raise on rear
      }
      // Hackles: arch the withers/back upward, and stand a touch taller + lean in.
      for (let i = 0; i < rig.chest.length; i++) {
        rig.chest[i].rotation.x += 0.05 * agg + quiver * 0.4;
      }
      this._poseYOff += (0.03 * agg + 0.05 * rear);
      // Ears pinned back/down (folds them against the head) — the universal
      // "back off" signal; the growl pins them a notch harder.
      const earPin = agg * 0.6 + this._growlSm * 0.2;
      for (let i = 0; i < rig.earsL.length; i++) rig.earsL[i].rotation.x += (0.5 + i * 0.3) * earPin;
      for (let i = 0; i < rig.earsR.length; i++) rig.earsR[i].rotation.x += (0.5 + i * 0.3) * earPin;
    }

    // ---- Lean-into-pet ----
    // When the player is actively petting, the dog leans its chest/neck INTO
    // the hand and softens the ears — the reciprocal half of contact. Without
    // this the hand lands on a statue and the bond reads one-way.
    if (this._petAmountSm > 0.02 && this.playerPos && resting) {
      const lean = Math.min(1, this._petAmountSm);
      const pp = this.playerPos;
      const dx = pp.x - this.dog.position.x;
      const dz = pp.z - this.dog.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      // Soft body yaw toward the hand (don't fight a commanded sit turn).
      const wantYaw = Math.atan2(dx, dz);
      // Capped, and standing only: uncapped this started at ~10 rad/s when
      // the hand came from behind — the dog spun under the palm.
      if (this.state === "idle" || this.state === "happy") {
        this.dog.rotation.y = this._easeYaw(this.dog.rotation.y, wantYaw, d * 3.2 * lean, 1.0 * d);
      }
      if (rig.chest[0]) rig.chest[0].rotation.x += 0.12 * lean;   // press into the hand
      if (rig.neck) rig.neck.rotation.x += 0.08 * lean;
      if (rig.head) {
        rig.head.rotation.x += 0.10 * lean;
        // Soft eyes: slight head tilt toward the petting side
        this._rotDog(rig.head, 0, 0, 1, 0.06 * lean * Math.sin(this._wagPhase * 0.4));
      }
      // Ears relax outward (opposite of pinned aggression)
      for (const e of rig.earsL) e.rotation.x += 0.08 * lean;
      for (const e of rig.earsR) e.rotation.x += 0.08 * lean;
      this._poseYOff += 0.01 * lean;   // tiny lift into the stroke
      // ---- Nuzzle step ----
      // Every ~1.4 s of active petting the dog closes a few centimetres into
      // the hand — the push-into-you that makes contact feel mutual. Caps at
      // handMeetDist so it never bowls the player over.
      this._nudgeT = (this._nudgeT || 0) + d * lean;
      if (this._nudgeT > 1.4 && dist > this.handMeetDist + 0.04 && lean > 0.35) {
        this._nudgeT = 0;
        const step = Math.min(0.10, dist - this.handMeetDist);
        const nx = this.dog.position.x + (dx / dist) * step;
        const nz = this.dog.position.z + (dz / dist) * step;
        const r = this._resolve(nx, nz);
        this.dog.position.x = r.x;
        this.dog.position.z = r.z;
        this.tailWag += 2.5;
      }
      // Stronger chest press pulse synced to the wag — reads as breathing
      // into the stroke rather than a static lean angle.
      if (rig.chest[0] && lean > 0.2) {
        rig.chest[0].rotation.x += Math.sin(this._wagPhase * 1.6) * 0.035 * lean;
      }
      // Happy sit wiggle: a sitting dog being petted shifts its haunches —
      // the "can't sit still from joy" tell.
      if (this.state === "sit" && lean > 0.3 && rig.pelvis) {
        rig.pelvis.rotation.z += Math.sin(this._wagPhase * 1.3) * 0.045 * lean;
        if (rig.chest[0]) rig.chest[0].rotation.z += Math.sin(this._wagPhase * 1.3 + 0.4) * 0.03 * lean;
      }
      // Pant from the pleasure of contact (no jaw bone — chest flutter).
      this.pant = Math.max(this.pant || 0, lean * 0.55);
      this._petHeldT = (this._petHeldT || 0) + d;
    } else {
      this._nudgeT = 0;
      // Let contact-driven pant decay when the hand lifts.
      if (this.pant > 0) this.pant = Math.max(0, this.pant - d * 0.55);
      // Shake-off after a real petting session ends — dogs reset their coat
      // when the hand lifts. Needs ~1.2 s of prior contact so a tap doesn't
      // trigger a full-body roll.
      if ((this._petHeldT || 0) > 1.2 && this._petAmountSm < 0.05
          && resting && this.mood !== "aggressive") {
        if (Math.random() < 0.55) this._shakePulse = Math.max(this._shakePulse, 0.85);
        this.tailWag += 3;
      }
      this._petHeldT = 0;
    }

    // ---- Idle micro-motion ---- (only when genuinely at rest + not aggressive)
    if (resting && agg < 0.05) {
      this._idleShiftT -= d;
      if (this._idleShiftT <= 0) { this._idleShiftT = (3 + Math.random() * 5) / (this.restless || 1); this._idleShiftDir *= -1; }
      // ease a tiny weight shift side-to-side; reads as a living, breathing stance
      const target = this._idleShiftDir * 0.012;
      this._idleShift += (target - this._idleShift) * Math.min(1, d * 1.5);
      this._rotDog(rig.chest[0], 0, 0, 1, this._idleShift);
      this._rotDog(rig.head, 0, 0, 1, this._idleShift * 0.6);
    }

    // ---- Additive-layer safety net (bookend) ----
    // Record what we left each bone at, so next frame can tell "mixer skipped
    // this bone" (rotation still equals fin) from "mixer wrote a fresh pose".
    for (const r of this._lifeBones) {
      r.fin.x = r.b.rotation.x; r.fin.y = r.b.rotation.y; r.fin.z = r.b.rotation.z;
    }
  }
}

// A dog is not the same dog every day. Temperament modulates the CHARACTER of
// the encounter — how soon it takes an interest, how much it putters, how it
// paces its barking — without moving the difficulty out of the rung's band.
//
// Everything here is a multiplier bounded to roughly ±20%, and the fields that
// ARE the difficulty are deliberately absent: personalSpace (rung 5's safety
// line), followRadius and barkDist (proximity), inZoneDist (how much hold
// credit you earn), and `follow` itself (a rung's identity). Vary those and
// rung 3 stops being rung 3.
const DOG_TEMPERAMENTS = [
  { id: "sleepy",  label: "sleepy",     interest: 0.82, restless: 0.72, barkMul: 1.22, approachMul: 1.14, settleMul: 0.84 },
  { id: "curious", label: "curious",    interest: 1.18, restless: 1.02, barkMul: 1.00, approachMul: 0.88, settleMul: 1.00 },
  { id: "busy",    label: "distracted", interest: 0.90, restless: 1.24, barkMul: 1.10, approachMul: 1.06, settleMul: 0.92 },
  { id: "keen",    label: "bright-eyed",interest: 1.10, restless: 0.92, barkMul: 0.86, approachMul: 0.92, settleMul: 1.08 },
];

export { DogController, DOG_TEMPERAMENTS };
