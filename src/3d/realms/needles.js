// Needles (a clinic) — a legacy realm, behind LAUNCH_OPEN (?all=1 to play).

import * as THREE from "three";
import { Reflector } from "three/addons/objects/Reflector.js";
import { IS_LOW_POWER } from "../renderer.js";
import { angleGap } from "../human-rig.js";
import { sceneContext } from "../scene-context.js";
import { _hexMix } from "../creature-kit.js";

// ---------- Needles (medical) ----------
function setupNeedles(scene, camera, level, levelIdx, ctx) {
  const proximity = level.proximity;
  let injectionPatch = null;    // the swab/skin site mesh — dimples on contact
  // Not every clinic is the same clinic. The lighting stays clinical — that is
  // the point of the room — but its temperature and the wall colour move, so
  // the fourth appointment isn't visibly the first one again.
  const V = ctx || sceneContext("needles", levelIdx || 0, false);
  const clinicWarm = V.range(0, 1);
  const clinicTint = (hex) => _hexMix(hex, _hexMix(0xe8f0ff, 0xfff4e2, clinicWarm), 0.30);

  scene.background = new THREE.Color(clinicTint(0xd2dae4));
  // Clinical lighting — bright and cool, but tuned for the ACES tone-mapping so
  // the white room doesn't clip to a featureless void (it did at intensity 4).
  const ceiling = new THREE.RectAreaLight(_hexMix(0xf2f7ff, 0xfff2df, clinicWarm), 1.3 * V.range(0.92, 1.08), 3.2, 3.2);
  ceiling.position.set(0, 3, -1);
  ceiling.lookAt(0, 0, -1);
  scene.add(ceiling);
  scene.add(new THREE.HemisphereLight(clinicTint(0xeef4ff), 0x97a2af, 0.45));
  scene.add(new THREE.AmbientLight(clinicTint(0xeef4ff), 0.16));

  // Floor (linoleum)
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0xaab0bb, roughness: 0.6 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1;
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc2cad4, roughness: 0.97 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), wallMat);
  back.position.set(0, 2, -8);
  scene.add(back);

  // Wall mirror — clinical bathroom-style mirror to the right. Angled at the
  // nurse + instrument tray rather than square at the user: the user has no
  // rendered body, so a face-on mirror reflected an uncanny empty room. Aimed
  // at the procedure it doubles the exposure content instead.
  if (!IS_LOW_POWER) {
    const mirror = new Reflector(
      new THREE.PlaneGeometry(1.4, 1.6),
      { textureWidth: 512, textureHeight: 512, color: 0x9ab0c0 }
    );
    mirror.position.set(3.5, 0.3, -3);
    // Normal points from the wall toward the tray/nurse spot (x 0.5, z tracks
    // the rung's tray distance — same formula as trayZ below).
    const mirrorAim = Math.atan2(0.5 - 3.5, (-3.5 + proximity * 2.5) + 3);
    mirror.rotation.y = mirrorAim;
    scene.add(mirror);
    // Frame around the mirror (thin axis stays along the mirror normal)
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 1.7, 1.5),
      new THREE.MeshStandardMaterial({ color: 0xb8c0c8, metalness: 0.4, roughness: 0.4 })
    );
    frame.position.set(3.5 - Math.sin(mirrorAim) * 0.04, 0.3, -3 - Math.cos(mirrorAim) * 0.04);
    frame.rotation.y = mirrorAim + Math.PI / 2;
    scene.add(frame);
  }
  const left = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), wallMat);
  left.rotation.y = Math.PI / 2; left.position.set(-8, 2, -1);
  scene.add(left);
  const right = new THREE.Mesh(new THREE.PlaneGeometry(20, 8), wallMat);
  right.rotation.y = -Math.PI / 2; right.position.set(8, 2, -1);
  scene.add(right);

  // ---- Human touches ----
  // Real clinics aren't featureless: a calm-breathing poster, a plant in the
  // corner, daylight through blinds. Warmth lowers the baseline dread so the
  // syringe itself stays the single source of fear — exposure works on the
  // trigger, not on a creepy room.
  {
    // Poster: drawn on a small canvas (soft lungs-ish circles + "BREATHE")
    const pc = document.createElement("canvas");
    pc.width = 256; pc.height = 340;
    const pg = pc.getContext("2d");
    pg.fillStyle = "#f2f6f9"; pg.fillRect(0, 0, 256, 340);
    pg.fillStyle = "#dceaf2";
    pg.beginPath(); pg.arc(128, 120, 70, 0, Math.PI * 2); pg.fill();
    pg.fillStyle = "#9fc4dd";
    pg.beginPath(); pg.arc(128, 120, 46, 0, Math.PI * 2); pg.fill();
    pg.fillStyle = "#5d87a8";
    pg.beginPath(); pg.arc(128, 120, 22, 0, Math.PI * 2); pg.fill();
    pg.fillStyle = "#3c5366";
    pg.font = "600 34px sans-serif"; pg.textAlign = "center";
    pg.fillText("BREATHE", 128, 250);
    pg.font = "400 17px sans-serif"; pg.fillStyle = "#7e93a4";
    pg.fillText("in for 4 — out for 6", 128, 282);
    const posterTex = new THREE.CanvasTexture(pc);
    const poster = new THREE.Mesh(
      new THREE.PlaneGeometry(0.85, 1.12),
      new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.9 })
    );
    poster.position.set(-1.8, 0.75, -7.96);
    scene.add(poster);

    // Potted plant in the back-left corner
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.12, 0.26, 12),
      new THREE.MeshStandardMaterial({ color: 0xb06a4a, roughness: 0.9 })
    );
    pot.position.set(-2.9, -0.87, -7.2);
    pot.castShadow = true;
    scene.add(pot);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4a7a4e, roughness: 0.85, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.42), leafMat);
      const ang = (i / 6) * Math.PI * 2;
      leaf.position.set(-2.9 + Math.sin(ang) * 0.07, -0.52, -7.2 + Math.cos(ang) * 0.07);
      leaf.rotation.y = ang;
      leaf.rotation.x = -0.35;
      scene.add(leaf);
    }

    // Window with horizontal blinds on the left wall — bright daylight slab
    // behind dark slats (the light is faked; the brightness cue is enough).
    const winGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.7, 1.3),
      new THREE.MeshBasicMaterial({ color: 0xeaf4fb })
    );
    winGlow.rotation.y = Math.PI / 2;
    winGlow.position.set(-7.96, 0.9, -2.4);
    scene.add(winGlow);
    const slatMat = new THREE.MeshStandardMaterial({ color: 0xc7d3dc, roughness: 0.8 });
    for (let i = 0; i < 9; i++) {
      const slat = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.055, 1.66), slatMat);
      slat.position.set(-7.93, 1.48 - i * 0.145, -2.4);
      slat.rotation.z = 0.5;
      scene.add(slat);
    }
  }

  // Medical tray (reflective)
  const tray = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 0.04, 0.5),
    new THREE.MeshStandardMaterial({ color: 0xc8cdd4, metalness: 0.7, roughness: 0.2 })
  );
  // Tray distance follows proximity (closer at higher rung)
  const trayZ = -3.5 + proximity * 2.5;
  tray.position.set(0.5, -0.4, trayZ);
  tray.castShadow = true;
  scene.add(tray);

  // Rolling instrument cart UNDER the tray, so the tray + syringe rest on a
  // surface instead of floating ~0.6 m above the floor. Stainless top + lower
  // shelf on four thin legs down to the floor (y=-1). Tracks trayZ.
  const cartMat = new THREE.MeshStandardMaterial({ color: 0xb9c0c8, metalness: 0.5, roughness: 0.45 });
  const cartTop = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.04, 0.52), cartMat);
  cartTop.position.set(0.5, -0.44, trayZ);
  cartTop.castShadow = true; cartTop.receiveShadow = true;
  scene.add(cartTop);
  const cartShelf = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.03, 0.48), cartMat);
  cartShelf.position.set(0.5, -0.80, trayZ);
  scene.add(cartShelf);
  for (const lx of [-1, 1]) for (const lz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 8), cartMat);
    leg.position.set(0.5 + lx * 0.33, -0.72, trayZ + lz * 0.22);
    leg.castShadow = true;
    scene.add(leg);
  }
  // Small clinical extras ON the tray so it reads as a real prep tray, not an
  // empty slab: a foil alcohol-swab packet and a cotton ball. (Tray top ≈ -0.38.)
  const swab = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.006, 0.05),
    new THREE.MeshStandardMaterial({ color: 0xdfe6ee, metalness: 0.6, roughness: 0.35 })
  );
  swab.position.set(0.68, -0.373, trayZ - 0.12);
  swab.rotation.y = 0.5;
  scene.add(swab);
  const cotton = new THREE.Mesh(
    new THREE.SphereGeometry(0.018, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xfbfbf7, roughness: 1.0 })
  );
  cotton.scale.set(1, 0.8, 1);
  cotton.position.set(0.36, -0.366, trayZ + 0.1);
  scene.add(cotton);

  // Syringe — a barrel + plunger + needle
  const syringe = new THREE.Group();
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.18, 16),
    new THREE.MeshStandardMaterial({ color: 0xeaeef2, transparent: true, opacity: 0.85, roughness: 0.2 })
  );
  barrel.rotation.z = Math.PI / 2;
  syringe.add(barrel);
  const plunger = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.05, 16),
    new THREE.MeshStandardMaterial({ color: 0xdcdfe4, roughness: 0.5 })
  );
  plunger.rotation.z = Math.PI / 2;
  plunger.position.x = -0.10;
  syringe.add(plunger);
  const flange = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.012, 16),
    new THREE.MeshStandardMaterial({ color: 0xdcdfe4, roughness: 0.5 })
  );
  flange.rotation.z = Math.PI / 2;
  flange.position.x = -0.135;
  syringe.add(flange);
  // Needle
  const needle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.003, 0.001, 0.06, 8),
    new THREE.MeshStandardMaterial({ color: 0xb8b8c0, metalness: 0.9, roughness: 0.1 })
  );
  needle.rotation.z = Math.PI / 2;
  needle.position.x = 0.12;
  syringe.add(needle);
  // Liquid (level varies with proximity)
  const liquid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, 0.10, 16),
    new THREE.MeshStandardMaterial({ color: 0xc6e8d8, transparent: true, opacity: 0.85 })
  );
  liquid.rotation.z = Math.PI / 2;
  liquid.position.x = -0.04;
  syringe.add(liquid);

  // Position the syringe based on proximity
  const syringeZ = -3.0 + proximity * 2.6;
  syringe.position.set(0.4, -0.35, syringeZ);
  // At the highest rung, the syringe rotates to point toward the camera/arm
  if (proximity > 0.7) {
    syringe.rotation.y = -0.6 + (proximity - 0.7) * 1.2;
  }
  scene.add(syringe);

  // ----- Visible nurse character holding the syringe -----
  // Procedural humanoid in pale-blue scrubs standing near the tray. The
  // syringe's z-position drives the nurse's z-position so they appear to
  // step closer with the rung. At low rungs the nurse is across the room;
  // at the highest rung they're right in front of the user with the
  // syringe held in their hand.
  const nurseGroup = new THREE.Group();
  const scrubColor = 0x4a8fb8;     // pale clinical blue
  const scrubTrim  = 0x365a7c;
  const nurseSkin  = 0xe6c5a8;     // lighter palette so the nurse reads as a clinician under fluorescents
  const nurseHair  = 0x3a2418;
  const scrubMat = new THREE.MeshStandardMaterial({ color: scrubColor, roughness: 0.95 });
  const trimMat  = new THREE.MeshStandardMaterial({ color: scrubTrim,  roughness: 0.95 });
  const nurseSkinMat = new THREE.MeshStandardMaterial({ color: nurseSkin, roughness: 0.85 });
  const nurseHairMat = new THREE.MeshStandardMaterial({ color: nurseHair, roughness: 1.0 });
  // Torso (scrubs top)
  const nurseTorso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.20, 0.55, 8, 14), scrubMat
  );
  nurseTorso.position.y = 0.55;
  nurseTorso.castShadow = true;
  nurseGroup.add(nurseTorso);
  // V-neckline trim (a small dark patch at the throat)
  const neckline = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.04, 0.04), trimMat
  );
  neckline.position.set(0, 0.86, 0.16);
  nurseGroup.add(neckline);
  // Neck
  const nurseNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.075, 0.10, 12), nurseSkinMat
  );
  nurseNeck.position.y = 0.92;
  nurseGroup.add(nurseNeck);
  // Head
  const nurseHead = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 16, 12), nurseSkinMat
  );
  nurseHead.scale.set(0.95, 1.05, 0.95);
  nurseHead.position.y = 1.10;
  nurseHead.castShadow = true;
  nurseGroup.add(nurseHead);
  // Hair (pulled-back bun-ish — close-fit cap)
  const nurseHairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55),
    nurseHairMat
  );
  nurseHairCap.scale.copy(nurseHead.scale);
  nurseHairCap.position.copy(nurseHead.position);
  nurseGroup.add(nurseHairCap);
  // Bun on the back of the head
  const bun = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 10), nurseHairMat
  );
  bun.position.set(0, 1.06, -0.10);
  nurseGroup.add(bun);
  // Eyes (dark dots)
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.014, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x141014 })
    );
    eye.position.set(sx * 0.04, 1.12, 0.115);
    nurseGroup.add(eye);
  }
  // Soft smile
  const nurseSmile = new THREE.Mesh(
    new THREE.TorusGeometry(0.025, 0.004, 6, 12, Math.PI),
    new THREE.MeshBasicMaterial({ color: 0x8a4a4a })
  );
  nurseSmile.rotation.z = Math.PI;
  nurseSmile.position.set(0, 1.06, 0.12);
  nurseGroup.add(nurseSmile);
  // Shoulders (rounded caps)
  for (const sx of [-1, 1]) {
    const shoulder = new THREE.Mesh(
      new THREE.SphereGeometry(0.10, 12, 10), scrubMat
    );
    shoulder.position.set(sx * 0.22, 0.86, 0);
    nurseGroup.add(shoulder);
  }
  // Right arm reaching toward the syringe — articulated upper + forearm
  // The hand will visibly grip the syringe so the user sees a person
  // performing the procedure, not a floating instrument.
  const nurseRightArmRoot = new THREE.Group();
  nurseRightArmRoot.position.set(-0.22, 0.85, 0);   // right shoulder (mirrored: nurse faces user)
  nurseRightArmRoot.rotation.z = 0.3;
  nurseRightArmRoot.rotation.x = -0.4;              // arm angled forward
  nurseGroup.add(nurseRightArmRoot);
  const upperArm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.07, 0.28, 8, 12), scrubMat
  );
  upperArm.position.set(0, -0.14, 0);
  upperArm.castShadow = true;
  nurseRightArmRoot.add(upperArm);
  // Cuff (slightly darker band)
  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.075, 0.025, 12), trimMat
  );
  cuff.position.set(0, -0.30, 0);
  nurseRightArmRoot.add(cuff);
  // Forearm
  const forearmGroup = new THREE.Group();
  forearmGroup.position.set(0, -0.31, 0);
  forearmGroup.rotation.x = 0.5;                     // forearm bent forward
  nurseRightArmRoot.add(forearmGroup);
  const nurseForearm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.055, 0.24, 8, 12), nurseSkinMat
  );
  nurseForearm.position.set(0, -0.12, 0);
  forearmGroup.add(nurseForearm);
  // Hand (palm) — this is where the syringe attaches
  const nurseHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 10), nurseSkinMat
  );
  nurseHand.scale.set(0.85, 0.55, 1.1);
  nurseHand.position.set(0, -0.27, 0);
  forearmGroup.add(nurseHand);
  // Left arm — relaxed at the side
  const nurseLeftArm = new THREE.Group();
  nurseLeftArm.position.set(0.22, 0.85, 0);
  nurseLeftArm.rotation.z = -0.1;
  nurseGroup.add(nurseLeftArm);
  const leftUpper = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.07, 0.30, 8, 12), scrubMat
  );
  leftUpper.position.set(0, -0.16, 0);
  nurseLeftArm.add(leftUpper);
  const leftForearm = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.055, 0.26, 8, 12), nurseSkinMat
  );
  leftForearm.position.set(0, -0.46, 0);
  nurseLeftArm.add(leftForearm);
  const leftHand = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 12, 10), nurseSkinMat
  );
  leftHand.scale.set(0.85, 0.55, 1.1);
  leftHand.position.set(0, -0.62, 0);
  nurseLeftArm.add(leftHand);
  // Trousers + shoes. Each leg hangs from a hip Group (same trick as
  // nurseRightArmRoot) so the approach can swing them in a real gait instead
  // of sliding the whole figure across the linoleum like a statue on casters.
  const nurseLegs = [];
  for (const sx of [-1, 1]) {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.10, 0.35, 0);
    nurseGroup.add(hip);
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.085, 0.55, 8, 12), trimMat
    );
    leg.position.set(0, -0.30, 0);
    leg.castShadow = true;
    hip.add(leg);
    const shoe = new THREE.Mesh(
      new THREE.BoxGeometry(0.10, 0.06, 0.20),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 })
    );
    shoe.position.set(0, -0.65, 0.05);
    shoe.castShadow = true;
    hip.add(shoe);
    nurseLegs.push(hip);
  }
  // Position the nurse so they're holding the syringe — a step behind it
  // so it appears in their right hand. The nurse stands at the same Z as
  // the syringe, offset slightly to the right and BEHIND it so the syringe
  // sits in the nurse's hand pointing toward the camera.
  // y=-0.67 puts the modelled feet (lowest point ≈ local -0.33) on the floor
  // (y=-1). It used to be -1.0, which buried the shoes 0.33 m under the floor.
  nurseGroup.position.set(0.85, -0.67, syringeZ + 0.4);
  // Face the user
  nurseGroup.rotation.y = -0.4;
  scene.add(nurseGroup);

  // Re-parent the syringe to the nurse's hand so they move together. We
  // want the syringe to track the nurse's right hand exactly so it never
  // drifts off the palm. Inside the local hand frame we position the
  // syringe so the needle points away from the nurse and toward the camera.
  // From rung 2 on, the nurse has PICKED UP the syringe — re-parent it to her
  // hand so it tracks the palm exactly. On rung 1 ("syringe on a tray, across
  // the room, sealed") it instead stays resting on the tray and the nurse's
  // hands are empty — which is what that level actually describes. Previously
  // it was always welded to her hand, so the tray was empty at every rung.
  if (proximity >= 0.35) {
    scene.remove(syringe);
    forearmGroup.add(syringe);
    // Clear the previous absolute syringe position; place inside the hand
    syringe.position.set(0, -0.30, 0);
    syringe.rotation.set(0, -1.0, 0);    // angle the needle toward the user
  } else {
    // Rest it on the tray top (tray at y=-0.4, ~0.04 thick → top ≈ -0.38).
    syringe.position.set(0.5, -0.353, trayZ);
    syringe.rotation.set(0, 0.5, 0);     // lying at a slight angle on the tray
  }

  // The user's arm + hand. Visible from the second rung on so they can
  // see themselves making a fist as the syringe approaches.
  let armGroup = null;
  let fingerJoints = [];   // [{proximal, distal}] — each finger's two joints
  let thumbJoint = null;
  const armSkin = (window.Character && window.Character.loadCharacter())
              ? window.Character.hexToInt(window.Character.skinHex(window.Character.loadCharacter()))
              : 0xe8b794;
  if (proximity > 0.35) {
    armGroup = new THREE.Group();
    armGroup.position.set(0.18, -0.55, -0.55);
    armGroup.rotation.z = -0.3;
    armGroup.rotation.x = Math.PI / 2.4;
    scene.add(armGroup);

    const armSkinMat = new THREE.MeshStandardMaterial({ color: armSkin, roughness: 0.78 });
    const forearm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.062, 0.052, 0.42, 18),
      armSkinMat
    );
    forearm.castShadow = true;
    armGroup.add(forearm);

    // Antiseptic swab patch + faint vein
    const patch = new THREE.Mesh(
      new THREE.CircleGeometry(0.05, 18),
      new THREE.MeshStandardMaterial({ color: 0xfff8d8, transparent: true, opacity: 0.85 })
    );
    patch.rotation.x = -Math.PI / 2;
    patch.position.set(0, 0.04, 0.05);
    armGroup.add(patch);
    injectionPatch = patch;   // animated (dimple + mark) during the injection
    const vein = new THREE.Mesh(
      new THREE.PlaneGeometry(0.008, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x3a5070, transparent: true, opacity: 0.45 })
    );
    vein.rotation.x = -Math.PI / 2;
    vein.position.set(0.004, 0.041, 0.05);
    armGroup.add(vein);

    // Wrist + palm
    const wrist = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 12), armSkinMat);
    wrist.position.y = -0.21;
    wrist.scale.set(1, 0.8, 1);
    armGroup.add(wrist);
    const handBase = new THREE.Group();
    handBase.position.set(0, -0.28, 0);
    armGroup.add(handBase);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 14), armSkinMat);
    palm.scale.set(1.0, 0.55, 0.85);
    handBase.add(palm);

    // Four fingers — proximal + distal joints, so they curl into a real fist
    const fingerOffsets = [-0.045, -0.015, 0.015, 0.045];
    for (const fx of fingerOffsets) {
      const proximal = new THREE.Group();
      proximal.position.set(fx, -0.005, 0.072);
      handBase.add(proximal);
      const seg1 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.012, 0.011, 0.045, 10),
        armSkinMat
      );
      seg1.position.y = -0.022;
      proximal.add(seg1);
      const distal = new THREE.Group();
      distal.position.set(0, -0.045, 0);
      proximal.add(distal);
      const seg2 = new THREE.Mesh(
        new THREE.CylinderGeometry(0.011, 0.009, 0.038, 10),
        armSkinMat
      );
      seg2.position.y = -0.019;
      distal.add(seg2);
      fingerJoints.push({ proximal, distal });
    }
    // Thumb runs sideways off the palm
    thumbJoint = new THREE.Group();
    thumbJoint.position.set(-0.062, 0.005, 0.04);
    thumbJoint.rotation.z = -0.6;
    handBase.add(thumbJoint);
    const thumbSeg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.014, 0.05, 6, 10),
      armSkinMat
    );
    thumbSeg.position.y = -0.03;
    thumbJoint.add(thumbSeg);

    // The arm doesn't float: a padded rest under the forearm (the blood-draw
    // chair's arm board) on a post to the floor, and a rolled gown-sleeve
    // cuff capping the bare proximal end of the cylinder.
    armGroup.updateMatrixWorld(true);
    const _restMid = armGroup.localToWorld(new THREE.Vector3(0, -0.02, 0));
    const _restA = armGroup.localToWorld(new THREE.Vector3(0, 0.18, 0));
    const _restB = armGroup.localToWorld(new THREE.Vector3(0, -0.20, 0));
    const restYaw = Math.atan2(-(_restB.z - _restA.z), _restB.x - _restA.x);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x39496b, roughness: 0.9 });
    const armRest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.2), padMat);
    armRest.position.set(_restMid.x, _restMid.y - 0.095, _restMid.z);
    armRest.rotation.y = restYaw;
    armRest.castShadow = true;
    scene.add(armRest);
    const postH = (armRest.position.y - 0.03) + 1;   // down to the floor at y=-1
    const restPost = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, postH, 10), cartMat);
    restPost.position.set(_restMid.x, -1 + postH / 2, _restMid.z);
    restPost.castShadow = true;
    scene.add(restPost);
    const cuffRoll = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.07, 16),
      new THREE.MeshStandardMaterial({ color: 0x9a9aa6, roughness: 0.95 })
    );
    cuffRoll.position.y = 0.185;
    armGroup.add(cuffRoll);
  }

  camera.fov = 55;
  camera.updateProjectionMatrix();

  let needlesControls = null;

  // ----- Press-and-hold to clench fist (real human action) -----
  // The nurse's instruction: "Make a fist." Pressing the screen clenches the
  // hand. While held, the needle advances at a steady, predictable rate. If
  // you let go, it stops. The user holds *all* the agency — same as in real
  // life, where you can ask the nurse to pause at any moment.
  let fistAmt = 0;            // 0=open, 1=tight fist (smoothed visually)
  let fistTarget = 0;
  let fistHeld = false;
  let needleAdvance = 0;      // 0..1 — how far the needle has progressed
  // ---- Injection phase machine (the real fear curve) ----
  // approach: needle nears the arm while you hold the fist; RELEASE backs it
  //           off (your control). in: the needle has bitten — a sharp one-shot
  //           fear spike + skin dimple, then it seats fully. withdraw: it eases
  //           out, skin un-dimples, a small mark is left. done: resets for a
  //           clean second rep once you release. This replaces the old logic
  //           where the needle floated near the arm and, after one go, the
  //           advance never reset (it dead-ended retracted).
  let injectPhase = "approach"; // approach | in | withdraw | done
  let injectHoldT = 0;
  let withdrawAmt = 0;
  let deliver = 0;              // 0..1 — plunger travel; the medicine visibly leaves the barrel
  // Needle-tip → patch contact geometry. The bite is gated on the REAL tip
  // touching the swab patch; a corrective servo on the nurse's position walks
  // the tip the last centimetres so contact is physical, not a timer.
  const _ndlTip = new THREE.Vector3(0.5, -0.35, -3.5 + proximity * 2.5);
  const _ndlPatch = new THREE.Vector3();
  const _ndlErr = new THREE.Vector3();
  const _nurseFix = new THREE.Vector3();
  let tipDist = 1;
  // Gait state for the approach walk
  let prevAdv = 0, walkPhase = 0, gaitAmt = 0;
  // Shared threat point for the avatar's gaze fixation (one object, mutated)
  const _threatPt = { x: 0, y: 0, z: 0 };
  // (injectionPatch is declared near the top of setupNeedles — the arm-view
  // rungs assign it during scene BUILD, well before this block runs. With the
  // declaration here, those rungs died on a TDZ ReferenceError and silently
  // fell back to the SVG scene.)
  // The NURSE moves toward the user (not the syringe alone). This is the
  // realistic motion: the clinician approaches with the syringe in hand.
  // Capture the nurse's resting position; approach target is right beside
  // the user's arm.
  const nurseBaseX = nurseGroup.position.x;
  const nurseBaseY = nurseGroup.position.y;
  const nurseBaseZ = nurseGroup.position.z;
  const nurseApproachX = 0.55;     // stands slightly right of user
  const nurseApproachY = -0.67;    // same standing height (no vertical drift during approach)
  const nurseApproachZ = -0.50;    // close to the user's arm
  // Gripping is only enabled at proximity ≥ 0.35 (when the hand is visible)
  const _needleRay = new THREE.Raycaster();
  const _needleMouse = new THREE.Vector2();
  function bindNeedleHold() {
    const canvasDom = document.querySelector("#stage canvas");
    if (!canvasDom) return;
    canvasDom.addEventListener("pointerdown", (e) => {
      if (proximity <= 0.35) return;  // arm builds at >0.35; match it so the "nurse uncaps" rung stays passive (no fist/injection without a visible arm)
      // Only clench when the press lands on the visible arm/hand. A bare canvas
      // press is ALSO drag-look, so without this, dragging to survey the room
      // clenched the fist and drove the needle in — the opposite of "you hold
      // all the agency". Space / F remain the no-aim keyboard alternative.
      if (armGroup) {
        const rect = canvasDom.getBoundingClientRect();
        _needleMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        _needleMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        _needleRay.setFromCamera(_needleMouse, camera);
        if (!_needleRay.intersectObject(armGroup, true).length) return;
      }
      fistHeld = true;
      fistTarget = 1.0;
    });
    function release() {
      fistHeld = false;
      fistTarget = 0;
    }
    canvasDom.addEventListener("pointerup", release);
    canvasDom.addEventListener("pointercancel", release);
    canvasDom.addEventListener("pointerleave", release);
    // Spacebar / 'F' as keyboard alternative. Named (not anonymous) so
    // dispose() can remove them — otherwise the leaked keydown handler keeps
    // calling preventDefault() on Space app-wide and swallows the spacebar in
    // OTHER scenes (e.g. the public-speaking hold-to-speak).
    needleKeyDown = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (proximity <= 0.35) return;  // arm builds at >0.35; match it so the "nurse uncaps" rung stays passive (no fist/injection without a visible arm)
      if (e.code === "Space" || e.key.toLowerCase() === "f") {
        e.preventDefault();
        fistHeld = true; fistTarget = 1.0;
      }
    };
    needleKeyUp = (e) => {
      if (e.code === "Space" || e.key.toLowerCase() === "f") release();
    };
    window.addEventListener("keydown", needleKeyDown);
    window.addEventListener("keyup", needleKeyUp);
  }
  let needleKeyDown = null, needleKeyUp = null;
  setTimeout(bindNeedleHold, 60);

  // Tiny on-stage HUD: shows whether the fist is held and a "calm" pulse so
  // the user can pace their breath. We piggy-back on the trust-hud styling.
  let needleHud = null;
  function refreshNeedleHud() {
    if (!needleHud) return;
    const pct = Math.round(fistAmt * 100);
    needleHud.querySelector(".trust-bar-fill").style.width = pct + "%";
    needleHud.querySelector(".trust-pct").textContent = fistHeld ? "holding" : "release";
  }
  setTimeout(() => {
    if (proximity < 0.35) return;
    const stage = document.getElementById("stage");
    if (!stage) return;
    let hud = stage.querySelector(".trust-hud");
    if (!hud) {
      hud = document.createElement("div");
      hud.className = "trust-hud";
      hud.innerHTML = `
        <div class="trust-row">
          <div class="trust-name">Make a fist</div>
          <div class="trust-pct">release</div>
        </div>
        <div class="trust-bar"><div class="trust-bar-fill"></div></div>
        <div class="trust-hint">Press and hold · breathe out · release any time</div>
      `;
      stage.appendChild(hud);
    }
    needleHud = hud;
  }, 80);

  function wireNeedlesCmds() {
    const bar = document.querySelector('.scene-cmd-bar[data-scene="needles"]');
    if (!bar || bar.dataset.wired === "1") return;
    bar.dataset.wired = "1";
    bar.querySelectorAll("[data-cmd]").forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const c = needlesControls; if (!c) return;
        if (btn.dataset.cmd === "look-away") {
          // Tween yaw to the window/blinds on the LEFT wall. It used to aim
          // right (yaw −1.0), which is almost exactly the bearing the nurse
          // approaches from — "look away" pointed the eyes AT the syringe.
          const fromY = c.yaw, toY = 1.1, fromP = c.pitch, toP = 0.0;
          let k = 0;
          const id = setInterval(() => {
            k += 0.05;
            if (k >= 1) { c.yaw = toY; c.pitch = toP; clearInterval(id); return; }
            c.yaw   = fromY + (toY - fromY) * k;
            c.pitch = fromP + (toP - fromP) * k;
          }, 16);
          if (window.PhobiaVoice) window.PhobiaVoice.speak("Looking away. Studies show this reduces reported pain.");
        } else if (btn.dataset.cmd === "look-back") {
          const fromY = c.yaw, toY = 0, fromP = c.pitch, toP = -0.2;
          let k = 0;
          const id = setInterval(() => {
            k += 0.05;
            if (k >= 1) { c.yaw = toY; c.pitch = toP; clearInterval(id); return; }
            c.yaw   = fromY + (toY - fromY) * k;
            c.pitch = fromP + (toP - fromP) * k;
          }, 16);
        } else if (btn.dataset.cmd === "bandage") {
          if (window.PhobiaVoice) window.PhobiaVoice.speak("Press for thirty seconds. Notice the warmth. The needle is gone.");
        }
      };
    });
  }
  setTimeout(wireNeedlesCmds, 0);

  return {
    controls: {
      mode: "lookOnly",
      initialPos: [0, 0, 0],
      initialYaw: 0,
      initialPitch: -0.2,
      lookSpeed: 0.003,
      cameraModeLocked: "fp",          // looking at your own arm — FP only
    },
    // The camera hand pair only exists on the LOW rungs, where the
    // world-anchored injection arm hasn't been built yet. From proximity>0.35
    // the scene owns its own arm+fist — a second floating pair made THREE
    // player hands on screen (setupSnakes omits `hands` for the same reason).
    hands: proximity > 0.35 ? undefined : { sleeveColor: 0x9a9aa6 }, // light hospital-gown grey
    bloom: { strength: 0.25, threshold: 0.95 },
    surface: "hard",   // clinic linoleum
    interact() {
      if (proximity <= 0.35) return { gesture: "rest" };
      // "rest", never "grab": the fist is made by the world-anchored arm —
      // a phantom bar-clench from the camera pair belongs to nobody.
      return {
        gesture: "rest",
        hint: fistHeld
          ? "holding the fist · slow exhale · release whenever you need"
          : "press and hold to make a fist · let the needle approach at your pace",
      };
    },
    onClick() {},
    update(t, controls, dt) {
      if (controls) needlesControls = controls;
      const d = dt || 0.016;
      // Smooth the fist toward its target — quick clench, slow release
      const k = fistTarget > fistAmt ? 8.0 : 4.0;
      fistAmt += (fistTarget - fistAmt) * Math.min(1, d * k);
      // Drive each finger joint. Real fingers curl ~90° at the proximal
      // and ~60° at the distal — so a "tight fist" rotates them by those
      // angles (Math.PI/2 and Math.PI/3).
      for (const f of fingerJoints) {
        f.proximal.rotation.x = fistAmt * (Math.PI / 2);
        f.distal.rotation.x   = fistAmt * (Math.PI / 3);
      }
      if (thumbJoint) {
        thumbJoint.rotation.z = -0.6 + fistAmt * 0.7;     // thumb folds in
        thumbJoint.rotation.x = fistAmt * 0.4;
      }
      // ---- Fear inputs ----
      // Event pulses (the prick) existed but nothing fed the continuous
      // channel, so the meter/vignette/credit sat dead between injections.
      // Rung proximity is the baseline; the needle bearing down pushes it;
      // looking away is real avoidance and genuinely dampens the gaze input.
      if (window.PhobiaFear) {
        const phaseK = injectPhase === "approach" ? 0.8
          : (injectPhase === "in" ? 1.0 : 0.45);
        window.PhobiaFear.setInput("proximity", (0.2 + proximity * 0.6) * phaseK);
        // Gaze from REAL facing (snakes convention: camera-minus-target,
        // yaw==bearing when looking at it). The old lookAwayT was declared
        // but never written, so turning the head gave zero relief and the
        // "this reduces reported pain" line was false in-model.
        const cpx = controls && controls.position ? controls.position.x : 0;
        const cpz = controls && controls.position ? controls.position.z : 0;
        const dirToN = Math.atan2(cpx - _ndlTip.x, cpz - _ndlTip.z);
        const yawN = controls ? controls.yaw : 0;
        const yawDeltaN = angleGap(yawN, dirToN);
        const gazeAlignN = Math.max(0, 1 - yawDeltaN / 1.0);
        window.PhobiaFear.setInput("gaze", gazeAlignN * (0.3 + proximity * 0.4));
      }
      // ---- Injection phase machine: approach → PRICK → hold → withdraw → reset
      const CONTACT = 0.86;          // earliest needleAdvance at which the tip may bite
      if (injectPhase === "approach") {
        // Hold the fist → the needle approaches; RELEASE → it eases back off.
        // The agency is real: you can always push it away before the bite.
        if (fistHeld) needleAdvance = Math.min(1, needleAdvance + d * 0.12);
        else          needleAdvance = Math.max(0, needleAdvance - d * 0.16);
        // The prick fires only when the measured tip actually MEETS the swab
        // patch (the servo below walks it home over the last stretch) — the
        // bare 0.86 timer could bite with the needle hovering well off the arm.
        if (needleAdvance >= CONTACT && (!injectionPatch || tipDist < 0.02)) {
          injectPhase = "in";
          injectHoldT = 0;
          // THE moment the scene was missing — the prick actually happens:
          // one sharp fear spike, then immediate reassurance.
          if (window.PhobiaFear) window.PhobiaFear.pulseEvent(0.85);
          if (window.PhobiaVoice) window.PhobiaVoice.speak("That's the needle in. The sharp part is already over. Slow breath out.");
        }
      } else if (injectPhase === "in") {
        // Seat the needle the last sliver, then hold "in the arm" for a beat
        // while the plunger drives the dose home.
        needleAdvance = Math.min(1, needleAdvance + d * 0.20);
        injectHoldT += d;
        deliver = Math.min(1, injectHoldT / 1.1);
        if (injectHoldT > 1.1) injectPhase = "withdraw";
      } else if (injectPhase === "withdraw") {
        withdrawAmt = Math.min(1, withdrawAmt + d * 1.5);
        if (withdrawAmt >= 1) {
          injectPhase = "done";
          if (injectionPatch) injectionPatch.material.color.setHex(0xe7a999);  // small mark left
          if (window.PhobiaVoice) window.PhobiaVoice.speak("Done — it's out. You stayed with it. That is exactly how the fear unlearns.");
        }
      } else if (injectPhase === "done") {
        // Reset for a clean second rep once the user releases the fist. (The
        // old code never reset — after one go the needle was stuck retracted.)
        if (!fistHeld) {
          needleAdvance = 0; withdrawAmt = 0; injectHoldT = 0; deliver = 0;
          injectPhase = "approach";
          if (injectionPatch) injectionPatch.material.color.setHex(0xfff8d8);
        }
      }
      const withdraw = withdrawAmt;
      // Position the NURSE (with syringe in hand) from base → approach, then
      // retreat. The syringe is parented to the nurse's forearm so it follows.
      const adv = needleAdvance * (1 - withdraw);
      nurseGroup.position.x = nurseBaseX + (nurseApproachX - nurseBaseX) * adv;
      nurseGroup.position.y = nurseBaseY + (nurseApproachY - nurseBaseY) * adv;
      nurseGroup.position.z = nurseBaseZ + (nurseApproachZ - nurseBaseZ) * adv;
      // ---- Approach gait ----
      // While the lerp is actually MOVING her, bob the body and swing the
      // legs in antiphase from the hips (free arm counter-swings a touch);
      // the stepping settles out as she arrives so the hand stays steady.
      const dAdv = adv - prevAdv; prevAdv = adv;
      const moving = Math.abs(dAdv) > 0.0004;
      if (moving) walkPhase += Math.min(0.05, Math.abs(dAdv)) * 35;
      gaitAmt += ((moving ? 1 : 0) - gaitAmt) * Math.min(1, d * 8);
      const settleK = Math.max(0, 1 - Math.max(0, adv - 0.7) / 0.25);
      const gait = gaitAmt * settleK;
      nurseGroup.position.y += Math.abs(Math.sin(walkPhase)) * 0.02 * gait;
      nurseLegs[0].rotation.x =  Math.sin(walkPhase) * 0.25 * gait;
      nurseLegs[1].rotation.x = -Math.sin(walkPhase) * 0.25 * gait;
      nurseLeftArm.rotation.x = Math.sin(walkPhase) * 0.12 * gait;
      // Nurse turns to face the user as they approach
      nurseGroup.rotation.y = -0.4 + adv * -0.4;
      // ---- Tip-onto-patch servo ----
      // Apply the persistent corrective, then measure the REAL needle tip
      // against the patch and grow the corrective toward closing the gap as
      // adv→1. It relaxes away as she retreats, so she returns to base clean.
      nurseGroup.position.add(_nurseFix);
      if (injectionPatch) {
        nurseGroup.updateMatrixWorld(true);
        _ndlTip.set(0.15, 0, 0);
        syringe.localToWorld(_ndlTip);
        injectionPatch.getWorldPosition(_ndlPatch);
        _ndlErr.subVectors(_ndlPatch, _ndlTip);
        tipDist = _ndlErr.length();
        const want = adv * adv;
        _nurseFix.addScaledVector(_ndlErr, Math.min(1, d * 6) * want);
        _nurseFix.multiplyScalar(Math.max(0, 1 - d * 2 * (1 - want)));
        if (_nurseFix.lengthSq() > 0.36) _nurseFix.setLength(0.6);
      }
      // The avatar's gaze fixates the tip while it bears down; calm → null.
      if (injectionPatch && (injectPhase === "in" || (injectPhase === "approach" && needleAdvance > 0.2))) {
        _threatPt.x = _ndlTip.x; _threatPt.y = _ndlTip.y; _threatPt.z = _ndlTip.z;
        window.PhobiaThreat = _threatPt;
      } else {
        window.PhobiaThreat = null;
      }
      // Skin dimples inward as the needle presses (a touch before the bite),
      // easing back as it withdraws — the recognisable "skin tenting" cue.
      if (injectionPatch) {
        const press = Math.max(0, (needleAdvance - 0.65) / 0.35) * (1 - withdraw);
        injectionPatch.position.y = 0.04 - press * 0.018;
      }
      // Plunger drives home during the "in" beat and the liquid column drains
      // ahead of it — its needle-end face stays fixed at the barrel exit — so
      // the medicine is visibly delivered (the old travel was ~1 mm and the
      // liquid never moved).
      plunger.position.x = -0.10 + deliver * 0.055;
      const liqLv = 1 - deliver * 0.7;
      liquid.scale.y = liqLv;
      liquid.position.x = 0.01 - 0.05 * liqLv;
      refreshNeedleHud();
      // Subtle breathing camera at higher rungs (slows when holding the fist)
      const breath = fistHeld ? 0.6 : 1.0;
      camera.position.y += Math.sin(t * 1.4) * 0.01 * (0.5 + proximity) * breath;
    },
    dispose() {
      window.PhobiaThreat = null;
      if (needleKeyDown) window.removeEventListener("keydown", needleKeyDown);
      if (needleKeyUp)   window.removeEventListener("keyup", needleKeyUp);
      const stage = document.getElementById("stage");
      if (stage) {
        const hud = stage.querySelector(".trust-hud");
        if (hud) hud.remove();
      }
    },
  };
}

export { setupNeedles };
