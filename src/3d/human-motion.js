// Library human animation retargeted onto our rig: HumanMotionSampler,
// loadHumanMotion(), applyRetarget().

import * as THREE from "three";
import { loadGLTF } from "./assets.js";

// ---------- 3D avatar preview ----------
// The creator preview, the valley-camp vignette and the title screen all show
// the SAME rig the exposure scenes use (buildHumanRig). Before this they had
// their own, separately-drifting figure — you designed one person and then
// played as a cruder one.
// mode "walk": the creator's turntable demo — walks in place so the user can
// judge the gait they'll see in the scenes. mode "idle": a person standing
// still. The shell scenes used to run the walk demo too, which put an
// endlessly treadmilling figure alone at the night campfire — motion with no
// destination is deeply wrong on a person, and it was half of why the
// traveler read as an apparition rather than a companion.
// =============================================================================
// ---------- Retargeted human motion (CC0 Universal Animation Library) --------
// =============================================================================
// The traveler's walk and idle were hand-authored trigonometry: a sine for the
// hip, a phase-shifted sine for the knee, arms swung as a mirror of the legs.
// That produces motion that is *correct* and still reads as a puppet, because
// real human movement is full of things nobody writes by hand — the pelvis
// dropping onto the stance leg, the ribcage counter-rotating against the hips,
// arms that trail the shoulder rather than tracking it.
//
// So the motion now comes from a real animation library (Quaternius' Universal
// Animation Library, CC0 — see assets/anim/LICENSE-CC0.txt) and is RETARGETED
// onto this rig every frame. The library's own mesh is discarded: it is an
// untextured grey mannequin with no face, hair or clothes, and swapping the
// sculpted body for it would have deleted the entire character creator. What
// is worth having from it is the movement, not the model.
//
// Retargeting is done by DIRECTION, not by copying rotations. Copying local
// quaternions between skeletons only works when their rest poses agree, and
// these two disagree completely: the library is a Blender Rigify rig whose
// bones carry their own rest orientations, while this rig is built with every
// bone unrotated and hanging along its child's offset. Transferring rotations
// directly gives inverted elbows and a corkscrewed spine.
//
// Aiming is immune to all of that. For each joint we ask the library only
// "which way in the world does this bone point right now", express that in the
// target bone's parent space, and rotate the target's own rest direction onto
// it. Bone lengths, rest orientations and axis conventions cancel out. The one
// thing it cannot carry is twist about the bone's own axis — acceptable here,
// since this rig has no twist bones and its limbs are near-radially symmetric.
const HUMAN_ANIM_URL = "assets/anim/human-anim.gltf";

// target bone → the library bone that drives it, and the library bone whose
// position defines the direction it points. Parents MUST come before children:
// each target's parent world matrix has to be final before its child is aimed.
const RETARGET_CHAIN = [
  { t: "pelvis",     s: "DEF-hips",        c: "DEF-spine.001", child: "spine" },
  { t: "spine",      s: "DEF-spine.001",   c: "DEF-spine.003", child: "chest" },
  { t: "chest",      s: "DEF-spine.003",   c: "DEF-neck",      child: "neck" },
  { t: "neck",       s: "DEF-neck",        c: "DEF-head",      child: "head" },
  { t: "L_shoulder", s: "DEF-upper_arm.L", c: "DEF-forearm.L", child: "L_elbow" },
  { t: "L_elbow",    s: "DEF-forearm.L",   c: "DEF-hand.L",    child: "L_wrist" },
  { t: "R_shoulder", s: "DEF-upper_arm.R", c: "DEF-forearm.R", child: "R_elbow" },
  { t: "R_elbow",    s: "DEF-forearm.R",   c: "DEF-hand.R",    child: "R_wrist" },
  { t: "L_hip",      s: "DEF-thigh.L",     c: "DEF-shin.L",    child: "L_knee" },
  { t: "L_knee",     s: "DEF-shin.L",      c: "DEF-foot.L",    child: "L_ankle" },
  { t: "R_hip",      s: "DEF-thigh.R",     c: "DEF-shin.R",    child: "R_knee" },
  { t: "R_knee",     s: "DEF-shin.R",      c: "DEF-foot.R",    child: "R_ankle" },
];
// Wrists and ankles have no child bone on this rig (hands and shoes are welded
// geometry), so they are aimed from the library's hand→middle-finger and
// foot→toe vectors against the target's own hand/foot geometry offset.
//
// The ankle's rest is NOT the shoe's own horizontal +Z. The library's foot
// bone runs ankle → ball of the foot, which sits 31° below horizontal when
// that foot stands flat (bind pose and Idle_Loop agree: (0, −0.51, 0.86)).
// Aiming +Z along it pitched every clip-driven shoe 31° toe-down on top of
// whatever the clip was doing — the traveler figure stood en pointe and
// swung its feet like a ballet dancer's. The wrist has no such offset: the
// library's rest wrist is straight (1.5°), so hanging (−Y) is right there.
const RETARGET_TIPS = [
  { t: "L_wrist", s: "DEF-hand.L", c: "DEF-f_middle.01.L", rest: [0, -1, 0] },
  { t: "R_wrist", s: "DEF-hand.R", c: "DEF-f_middle.01.R", rest: [0, -1, 0] },
  { t: "L_ankle", s: "DEF-foot.L", c: "DEF-toe.L",         rest: [0, -0.511, 0.86] },
  { t: "R_ankle", s: "DEF-foot.R", c: "DEF-toe.R",         rest: [0, -0.511, 0.86] },
];

// Clip names this app actually uses, mapped to intent. The library ships 46;
// the rest are combat, swimming and spellcasting.
const HUMAN_CLIPS = {
  idle:    "Idle_Loop",
  walk:    "Walk_Loop",
  wary:    "Walk_Formal_Loop",   // stiffer, shorter stride — the approach walk
  jog:     "Jog_Fwd_Loop",
  crouch:  "Crouch_Idle_Loop",
  sit:     "Sitting_Idle_Loop",
  sitIn:   "Sitting_Enter",
  sitOut:  "Sitting_Exit",
  flinch:  "Hit_Chest",
  reach:   "Interact",
};

let _humanMotion = null;        // resolved sampler, or false once known-bad
let _humanMotionPromise = null;

// One hidden skeleton shared by every figure on screen. Consumers each call
// poseAt() with their own clip and phase and read the result immediately, so a
// single sampler serves any number of travelers without them sharing a pose.
class HumanMotionSampler {
  constructor(gltf) {
    this.root = gltf.scene;
    this.root.visible = false;      // never added to a scene; sampled only
    this.mixer = new THREE.AnimationMixer(this.root);
    this.clips = {};
    (gltf.animations || []).forEach((c) => { this.clips[c.name] = c; });
    // Index bones under a NORMALISED name. three.js's GLTFLoader runs every
    // node name through PropertyBinding.sanitizeNodeName, which replaces dots
    // (and other characters reserved by the animation-binding syntax) with
    // underscores — so the Rigify names this library ships, "DEF-spine.001",
    // "DEF-upper_arm.L", arrive as "DEF-spine_001", "DEF-upper_arm_L". Looking
    // them up by their on-disk names silently found nothing for every bone
    // that has a dot, which is all of them except DEF-neck and DEF-head, and
    // a retarget that resolves two bones out of twelve does nothing visible.
    this.nodes = {};
    this.root.traverse((o) => {
      if (!o.name) return;
      this.nodes[HumanMotionSampler.norm(o.name)] = o;
    });
    this._action = null;
    this._clipName = null;
  }
  // GLTFLoader DELETES these characters rather than substituting for them, so
  // "DEF-spine.001" arrives as "DEF-spine001" and "DEF-upper_arm.L" as
  // "DEF-upper_armL". Normalising both sides the same way is what lets the
  // mapping table above stay written in the library's own on-disk names.
  static norm(n) { return String(n).replace(/[.:]/g, ""); }
  node(name) { return this.nodes[HumanMotionSampler.norm(name)]; }
  has(name) { return !!this.clips[name]; }
  // Drive the hidden skeleton to an absolute time in a clip and refresh its
  // world matrices so the aiming step can read bone positions.
  poseAt(clipName, time) {
    const clip = this.clips[clipName];
    if (!clip) return false;
    if (this._clipName !== clipName) {
      if (this._action) { this._action.stop(); this.mixer.uncacheAction(this._action.getClip()); }
      this._action = this.mixer.clipAction(clip);
      this._action.play();
      this._clipName = clipName;
    }
    // setTime rewinds and re-evaluates from zero, which is what makes this
    // sampler stateless: the same (clip, time) always yields the same pose no
    // matter who asked for what a moment earlier.
    this.mixer.setTime(time % clip.duration);
    this.root.updateMatrixWorld(true);
    return true;
  }
}

function loadHumanMotion() {
  if (_humanMotion !== null) return Promise.resolve(_humanMotion);
  if (_humanMotionPromise) return _humanMotionPromise;
  _humanMotionPromise = loadGLTF(HUMAN_ANIM_URL)
    .then((gltf) => {
      _humanMotion = new HumanMotionSampler(gltf);
      // Observability hook, same idea as window.__active / dog.userData.*:
      // whether the library resolved, and which of the clips this app asks
      // for actually exist in it, is otherwise invisible from the console.
      try {
        window.__humanMotion = {
          ok: true,
          clips: Object.keys(_humanMotion.clips).length,
          missing: Object.values(HUMAN_CLIPS).filter((n) => !_humanMotion.has(n)),
          unresolved: RETARGET_CHAIN.concat(RETARGET_TIPS)
            .filter((e) => !_humanMotion.node(e.s) || !_humanMotion.node(e.c))
            .map((e) => e.t),
        };
      } catch {}
      return _humanMotion;
    })
    .catch((e) => {
      console.warn("[human motion] unavailable, falling back to procedural:", e);
      _humanMotion = false;      // remembered, so we don't retry every figure
      return false;
    });
  return _humanMotionPromise;
}

// Scratch objects — this runs per bone per frame, so it must not allocate.
const _rtA = new THREE.Vector3(), _rtB = new THREE.Vector3();
const _rtDir = new THREE.Vector3(), _rtRest = new THREE.Vector3();
const _rtMat = new THREE.Matrix4();
const _rtRootQ = new THREE.Quaternion();
// The library clip's frame → this rig's own frame. The sampler's skeleton is
// never placed in the scene, so its bone directions are in the LIBRARY's
// frame; they used to be applied as if they were world directions, which is
// only right for a rig standing at one particular heading. Turn the traveler
// round and the "same" arm pose swung through the torso — measured: at the
// opposite heading the left upper arm pointed across the body. So the
// directions are carried through the rig root's live orientation, and the
// pose follows the body wherever it faces.
//
// Both skeletons face +Z, but the library's ".L" limbs hang on +x and this
// rig's "L" limbs on −x, so the correspondence is a LEFT–RIGHT MIRROR:
// x → −x, fore-aft kept. (It was a half-turn for a while — right for the
// sides, wrong fore-aft: every elbow bent BACKWARDS, measured forearm-vs-
// upper-arm bend z = −0.6 in rig space where the library's own is +0.55,
// and a figure whose legs follow the clip stepped backwards.)

// Which joints the clip is allowed to drive when the body is walking on real
// ground. The legs are deliberately NOT in here.
//
// A walk clip knows where a leg should be relative to a hip; it has no idea
// where this scene's floor is, how long this traveler's shins are, or that the
// player just stopped between two boards. The in-scene Body solves all of that
// with ground probes and two-bone IK, and overwriting its answer with the
// clip's makes feet slide and sink — which reads as far more broken than a
// stiff walk ever did. The pelvis is excluded for the same reason: the legs
// hang off it, so rotating it from the clip drags the planted feet with it.
//
// What IS safe to take is everything with no ground contract — the spine and
// chest counter-rotating against the hips, and the arms. That happens to be
// most of what makes a walk read as human: the torso twist and the arm swing
// trailing the shoulder are exactly the parts nobody writes convincingly by
// hand, and exactly the parts the procedural version got wrong.
// The SPINE CHAIN IS DELIBERATELY ABSENT from every mask below.
//
// Aiming works by rotating a bone's rest direction onto the direction the
// library's matching bone points. That is well-conditioned for a limb, whose
// direction swings through a wide arc. It is degenerate for a spine: pelvis,
// spine and chest all point nearly straight up in both skeletons, so the two
// vectors are almost parallel, and setFromUnitVectors on near-parallel vectors
// picks an essentially arbitrary perpendicular axis — the rotation jitters
// frame to frame from numerical noise. Worse, the one thing a spine most needs
// from a walk clip is TWIST about its own axis, and twist is exactly what an
// aim cannot express: rotating a vector onto another vector says nothing about
// roll around it.
//
// So the spine keeps its hand-authored motion, which is stable and correct if
// modest, and the retarget takes only the joints it can actually solve. Torso
// counter-rotation is the one thing this approach cannot deliver; carrying it
// would need real rotation transfer with per-bone rest-offset correction.
const RETARGET_LIMBS = new Set([
  "L_shoulder", "L_elbow", "L_wrist",
  "R_shoulder", "R_elbow", "R_wrist",
  "L_hip", "L_knee", "L_ankle",
  "R_hip", "R_knee", "R_ankle",
]);
// In-scene walking: arms only. Legs belong to the ground solver (above).
const RETARGET_UPPER = new Set([
  "L_shoulder", "L_elbow", "L_wrist",
  "R_shoulder", "R_elbow", "R_wrist",
]);
// While reaching to pet, the arms are hand-authored IK — nothing is left for
// the clip to drive, so the retarget stands down entirely.
const RETARGET_TORSO_ONLY = new Set();

// Apply the sampler's current pose to a rig built by buildHumanRig().
// `weight` blends toward the retargeted pose (0 = leave the rig alone), so
// callers can cross-fade in and out of procedural handling. `only` restricts
// it to a subset of target bones; omit it to drive the whole skeleton.
function applyRetarget(rig, motion, weight = 1, only = null) {
  if (!rig || !motion || weight <= 0) return false;
  const B = rig.B || {};
  if (rig.group) rig.group.getWorldQuaternion(_rtRootQ);
  else _rtRootQ.identity();
  const aim = (entry, restOverride) => {
    if (only && !only.has(entry.t)) return;
    const sb = motion.node(entry.s), cb = motion.node(entry.c);
    const tb = B[entry.t];
    if (!sb || !cb || !tb || !tb.parent) return;
    sb.getWorldPosition(_rtA);
    cb.getWorldPosition(_rtB);
    _rtDir.subVectors(_rtB, _rtA);
    if (_rtDir.lengthSq() < 1e-12) return;
    _rtDir.normalize();
    _rtDir.x = -_rtDir.x;              // library frame → rig frame (mirror, above)
    _rtDir.applyQuaternion(_rtRootQ);
    // World direction → the target bone's PARENT space. The parent's world
    // matrix is already final because the chain is ordered parents-first.
    tb.parent.updateMatrixWorld(false);
    _rtMat.copy(tb.parent.matrixWorld).invert();
    _rtDir.transformDirection(_rtMat).normalize();
    // The rest direction is the child's own offset — constant, because only
    // quaternions are ever written on this rig. That is what makes the two
    // skeletons' differing bone lengths and axis conventions cancel out.
    if (restOverride) {
      _rtRest.set(restOverride[0], restOverride[1], restOverride[2]).normalize();
    } else {
      const childBone = B[entry.child];
      if (!childBone) return;
      _rtRest.copy(childBone.position);
      if (_rtRest.lengthSq() < 1e-12) return;
      _rtRest.normalize();
    }
    if (weight >= 1) {
      tb.quaternion.setFromUnitVectors(_rtRest, _rtDir);
    } else {
      const q = tb.quaternion.clone().setFromUnitVectors(_rtRest, _rtDir);
      tb.quaternion.slerp(q, weight);
    }
    tb.updateMatrixWorld(false);
  };
  for (const e of RETARGET_CHAIN) aim(e, null);
  for (const e of RETARGET_TIPS) aim(e, e.rest);
  return true;
}

export { HUMAN_CLIPS, _humanMotion, loadHumanMotion, RETARGET_LIMBS, RETARGET_UPPER, RETARGET_TORSO_ONLY, applyRetarget };
