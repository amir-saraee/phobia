// The realms: PHOBIAS and their trial ladders, LAUNCH_OPEN, REALMS, and each
// realm's body-language signals, feared outcomes and reality checks
// (CREATURE_KITS).
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// ---------- Data: phobias and exposure ladders ----------
const PHOBIAS = {
  heights: {
    name: "Acrophobia",
    label: "Heights",
    icon: heightsIcon(),
    blurb: "Fear of high places — looking down, edges, balconies.",
    levels: [
      { title: "A low ledge",          desc: "A knee-high terrace over a city square. Step up and look down.", height: 0.05, minHold: 12 },
      { title: "A first-floor balcony",desc: "About 3 metres up. A railing in front of you.", height: 0.20, minHold: 15 },
      { title: "Tenth-floor terrace",  desc: "30 metres up. The street is below — and some of the floor is glass.", height: 0.45, minHold: 18 },
      { title: "Rooftop edge",         desc: "Top of a tall building, 90 metres up. The wind is real.", height: 0.75, minHold: 22 },
      { title: "The glass skywalk",    desc: "Out past the edge of the tallest tower, on glass, at dusk. 165 metres.", height: 1.00, minHold: 26 }
    ],
    sceneClass: "scene-heights",
    render: renderHeights
  },
  water: {
    name: "Aquaphobia",
    label: "Water",
    icon: waterIcon(),
    blurb: "Fear of water — depth, submersion, open water.",
    levels: [
      { title: "Toes in the puddle",  desc: "Shallow water on tiles. Just your feet.", level: 0.10 },
      { title: "Knee-deep wading",    desc: "Calm shallows. You can see the bottom.", level: 0.30 },
      { title: "Waist-deep water",    desc: "Light current. Hands brush the surface.", level: 0.55 },
      { title: "Chest-deep, no floor",desc: "Treading water. The bottom is gone.", level: 0.80 },
      { title: "Open water, deep",    desc: "Surrounded by blue. Nothing visible below.", level: 1.00 }
    ],
    sceneClass: "scene-water",
    render: renderWater
  },
  dogs: {
    name: "Cynophobia",
    label: "Dogs",
    icon: dogIcon(),
    blurb: "Fear of dogs — barking, sudden movement, proximity.",
    // A clear, standard small→large ramp: a small Shiba Inu, far and calm, that
    // grows closer and then becomes a large Husky — alert, and finally barking
    // head-on. `breed` picks the model, `dogHeight` its real-world size (metres,
    // feet→ears), `size` drives distance + fear intensity, `intensity` the mood.
    // `behavior` makes each rung a DISTINCT encounter (the five used to blur
    // into three: everything followed the player after 6 s):
    //   follow/followRadius/followDelay — whether + how closely the dog trails you
    //   homeRadius   — the dog putters inside this zone instead of roaming
    //   autoApproachTrust — trust needed before the dog invites itself over
    //   startPose/standAt/standDist — rung-3 arc: lying → stands up
    //   firstBarkAt/barkDist/barkEvery — spontaneous-bark schedule
    //   settleAfter  — rung-4 within-hold habituation beat
    //   inZoneDist   — engagement radius that feeds the fear 'duration' credit
    //   personalSpace / homeRadius — rung-5 stays behind a safety line (no charge)
    levels: [
      { title: "Small dog, far away", desc: "A small dog across the room, busy with its own thing.", breed: "shiba", dogHeight: 0.48, size: 0.20, intensity: "calm", minHold: 12,
        behavior: { follow: false, homeRadius: 1.3, autoApproachTrust: 0.65, inZoneDist: 2.6 } },
      { title: "Small dog, near",     desc: "The same small dog. This time it wanders over to see you.", breed: "shiba", dogHeight: 0.56, size: 0.40, intensity: "calm", minHold: 15,
        behavior: { follow: true, followRadius: 2.5, followDelay: 8, autoApproachTrust: 0.5, inZoneDist: 2.6 } },
      { title: "Bigger dog, alert",   desc: "A bigger dog, lying down. When it gets up, it's ears up and watching.", breed: "husky", dogHeight: 0.82, size: 0.62, intensity: "alert", minHold: 18,
        behavior: { follow: false, homeRadius: 0.7, startPose: "lay", standAt: 20, standDist: 3.0, firstBarkAt: 16, barkDist: 2.2, barkEvery: [14, 24], inZoneDist: 3.0 } },
      { title: "Large dog, close",    desc: "A large dog that follows you closely — and barks now and then.", breed: "husky", dogHeight: 1.00, size: 0.82, intensity: "alert", minHold: 22,
        behavior: { follow: true, followRadius: 1.2, followDelay: 3, firstBarkAt: 12, barkEvery: [8, 14], settleAfter: 35, inZoneDist: 3.0 } },
      // personalSpace is the line the dog refuses to let you cross — it backs
      // away rather than charge. At 3.0 m that line sat further out than the
      // 4.2 m spawn minus the room, so the climax rung was a dog you could
      // never reach: walk at it and it retreated, permanently. And inZoneDist
      // 4.5 was wider than the spawn distance, so the whole hold could be
      // earned standing still on the spawn point. The rung asked for nothing.
      // 1.5 m keeps the promise (it never charges, you still control the
      // distance) while making the approach an actual approach.
      { title: "Large dog, barking",  desc: "A big, loud, excited dog. It barks, it bounds — and you choose the distance.", breed: "husky", dogHeight: 1.18, size: 1.00, intensity: "barking", minHold: 26,
        behavior: { homeRadius: 1.1, personalSpace: 1.5, inZoneDist: 4.0 } }
    ],
    sceneClass: "scene-approach",
    render: renderDog
  },
  spiders: {
    name: "Arachnophobia",
    label: "Spiders",
    icon: spiderIcon(),
    blurb: "Fear of spiders — the legs, the sudden movement.",
    // `intensity` (calm/alert/apex) mirrors the dog taxonomy and drives credit
    // thresholds + the narrator threat gate. `behavior` makes each rung a
    // distinct encounter (skitter cadence, whether it approaches/pounces,
    // the on-wall apex) instead of differing by `size` alone.
    levels: [
      { title: "A tiny dot, far",     desc: "A dim cellar. Something small in the far corner.", size: 0.15, intensity: "calm", minHold: 12,
        behavior: { skitter: false, approach: false, pounce: false, homeRadius: 0.25, inZoneDist: 2.4, fearMul: 0.35, firstSkitterAt: Infinity, still: true } },
      { title: "Small spider, near",  desc: "A small spider on the concrete. It shifts, then stills.", size: 0.35, intensity: "calm", minHold: 15,
        behavior: { skitter: true, approach: false, pounce: false, homeRadius: 0.35, inZoneDist: 1.7, fearMul: 0.55, firstSkitterAt: 6, skitterEvery: [3.0, 5.5], skitterSpeed: 0.34, jagAmt: 0.6, approachBias: 0.0, guardDist: 0.35 } },
      { title: "Medium spider, darts",desc: "Closer now — and it darts when it moves.", size: 0.55, intensity: "alert", minHold: 18,
        behavior: { skitter: true, approach: true, pounce: false, homeRadius: 0.7, inZoneDist: 1.5, fearMul: 0.72, firstSkitterAt: 5, skitterEvery: [2.5, 4.5], skitterSpeed: 0.5, jagAmt: 1.0, approachBias: 0.5, guardDist: 0.4, escalate: true, settleAfter: 40 } },
      { title: "Large spider, close", desc: "A big one, near your feet. You can see the legs work. Now and then it crouches and hops — a short jump, never onto you; step back and it settles.", size: 0.80, intensity: "alert", minHold: 22,
        behavior: { skitter: true, approach: true, pounce: true, homeRadius: 0.9, inZoneDist: 1.3, fearMul: 0.88, firstSkitterAt: 4, skitterEvery: [1.8, 3.5], skitterSpeed: 0.62, jagAmt: 1.2, approachBias: 0.8, guardDist: 0.34, firstPounceAt: 12, pounceEvery: [10, 16], coilDur: [0.7, 1.1], escalate: true, settleAfter: 50 } },
      { title: "On the wall by you",  desc: "On the wall, right at eye level. Legs twitching. It may crouch and jump down — it lands short of you, and stepping back calms it.", size: 1.00, intensity: "apex", minHold: 26,
        behavior: { skitter: true, approach: false, pounce: true, onWall: true, wallZ: -2.6, wallEyeY: 0.5, homeRadius: 0.2, inZoneDist: 1.4, fearMul: 1.0, firstSkitterAt: 2, skitterEvery: [1.4, 2.8], skitterSpeed: 0.42, jagAmt: 0.5, twitch: true, guardDist: 0.5, firstPounceAt: 9, pounceEvery: [8, 13], coilDur: [0.6, 0.9], escalate: true } }
    ],
    sceneClass: "scene-approach",
    render: renderSpider
  },
  enclosed: {
    name: "Claustrophobia",
    label: "Enclosed Spaces",
    icon: roomIcon(),
    blurb: "Fear of confined spaces — small rooms, tight passages.",
    levels: [
      { title: "A small room",          desc: "Close the door behind you. Plenty of air.",   size: 1.00, minHold: 12 },
      { title: "An office phone booth", desc: "A glass door, walls within reach.",           size: 0.75, minHold: 15 },
      { title: "A small lift",          desc: "The doors close. Two floors, then out.",      size: 0.50, minHold: 18 },
      { title: "A storage closet",      desc: "Shelves at your shoulders. The light is yours.", size: 0.30, minHold: 22 },
      { title: "An MRI scanner",        desc: "Lying still in the bore. Loud, and safe.",    size: 0.15, minHold: 26 }
    ],
    sceneClass: "scene-enclosed",
    render: renderEnclosed
  },
  flying: {
    name: "Aviophobia",
    label: "Flying",
    icon: planeIcon(),
    blurb: "Fear of flying — turbulence, altitude, being trapped in a plane.",
    levels: [
      { title: "Airport gate",        desc: "Watching planes through the window.",   stage: 0.10 },
      { title: "Boarding the cabin",  desc: "Walking down the aisle to your seat.",  stage: 0.30 },
      { title: "Seated, doors closed",desc: "Engines on. Cabin lights dim.",         stage: 0.55 },
      { title: "Takeoff",             desc: "Acceleration pushes you back.",         stage: 0.80 },
      { title: "Mid-flight turbulence", desc: "Cabin shakes. The seat-belt sign chimes.", stage: 1.00 }
    ],
    sceneClass: "scene-flying",
    render: renderFlying
  },
  needles: {
    name: "Trypanophobia",
    label: "Needles",
    icon: syringeIcon(),
    blurb: "Fear of needles — injections, blood draws, medical procedures.",
    levels: [
      { title: "Syringe on a tray",   desc: "Across the room. Sealed in a wrapper.", proximity: 0.15 },
      { title: "Nurse picks it up",   desc: "Removing the cap. Standard procedure.", proximity: 0.35 },
      { title: "Drawing the dose",    desc: "Filling the barrel. You can look away.", proximity: 0.55 },
      { title: "Approaching your arm",desc: "Antiseptic on the skin. A small pinch is coming.", proximity: 0.80 },
      { title: "The injection",       desc: "Brief sting. You can breathe through it.", proximity: 1.00 }
    ],
    sceneClass: "scene-needles",
    render: renderNeedles
  },
  snakes: {
    name: "Ophidiophobia",
    label: "Snakes",
    icon: snakeIcon(),
    blurb: "Fear of snakes — sudden movement, the way they slide.",
    // One coherent warm clearing for all rungs; the snake gets closer + bolder.
    // `intensity` (calm/alert/apex) drives credit thresholds + the narrator threat
    // gate; `behavior` re-parameterizes the (preserved) snakeCtl brain per rung so
    // rungs differ by behavior, not raw size. The therapeutic core is kept: calm/
    // stillness makes the snake LEAVE; rushing the apex snake makes it strike short.
    levels: [
      { title: "A snake, basking far off", desc: "On a warm rock across the clearing. Coiled, still, sunning itself.", size: 0.20, intensity: "calm", minHold: 12,
        behavior: { still: true, wander: false, cross: false, rear: false, strike: false, homeRadius: 0.6, baskDur: [5.0, 9.0], watchDist: 2.4, retreatStill: 0.35, inZoneDist: 5.0, fearMul: 0.42, tongueEvery: [4.0, 7.0] } },
      { title: "It shifts in its patch",   desc: "A little closer. Now and then it slides a short way, then settles again.", size: 0.40, intensity: "calm", minHold: 15,
        behavior: { still: false, wander: true, cross: false, rear: false, strike: false, homeRadius: 1.4, baskDur: [3.5, 7.0], wanderSpeed: 0.40, watchDist: 2.8, retreatStill: 0.30, inZoneDist: 4.2, fearMul: 0.58, tongueEvery: [3.0, 5.5] } },
      { title: "It crosses the path ahead",desc: "It slides across the trail in front of you, tongue flicking, then reads the air.", size: 0.60, intensity: "alert", minHold: 18,
        behavior: { still: false, wander: true, cross: true, crossChance: 0.55, rear: false, strike: false, homeRadius: 2.2, baskDur: [2.5, 5.5], wanderSpeed: 0.52, watchDist: 3.0, retreatStill: 0.30, inZoneDist: 3.6, fearMul: 0.72, warnHissDist: 1.7, warnHissEvery: 9, tongueEvery: [2.0, 4.0] } },
      { title: "It rears and watches you", desc: "A few metres away. When you come close it lifts its head, holds your eye, and hisses low.", size: 0.85, intensity: "alert", minHold: 22,
        behavior: { still: false, wander: true, cross: true, crossChance: 0.40, rear: true, strike: false, homeRadius: 1.6, baskDur: [2.5, 5.0], wanderSpeed: 0.48, watchDist: 3.4, rearDist: 2.6, retreatStill: 0.28, inZoneDist: 3.2, fearMul: 0.86, warnHissDist: 2.0, warnHissEvery: 8, tongueEvery: [1.6, 3.2] } },
      { title: "Close, coiled, alert",     desc: "Right there on the path. Rush it and it coils to strike; stay slow and it settles.", size: 1.00, intensity: "apex", minHold: 26,
        behavior: { still: false, wander: true, cross: true, crossChance: 0.30, rear: true, strike: true, homeRadius: 1.2, baskDur: [2.0, 4.0], wanderSpeed: 0.42, watchDist: 3.6, rearDist: 3.0, retreatStill: 0.26, inZoneDist: 3.0, fearMul: 1.0, warnHissDist: 2.2, warnHissEvery: 6, strikeDist: 1.45, strikeApproach: 0.55, strikeCooldown: 12, tongueEvery: [1.2, 2.6] } }
    ],
    sceneClass: "scene-approach",
    render: renderSnake
  },
  speaking: {
    name: "Glossophobia",
    label: "Public speaking",
    icon: micIcon(),
    blurb: "Fear of speaking in front of others — eyes on you, blanking out.",
    levels: [
      { title: "Empty room",          desc: "Practicing alone. Your voice in the space.", crowd: 0.0 },
      { title: "Small group of friends", desc: "Five faces. Encouraging.",            crowd: 0.20 },
      { title: "Class of twenty",     desc: "Familiar faces. A slide deck behind you.", crowd: 0.45 },
      { title: "Conference room",     desc: "Strangers. Silent attention.",           crowd: 0.75 },
      { title: "Packed auditorium",   desc: "Hundreds of eyes. Spotlight on you.",    crowd: 1.00 }
    ],
    sceneClass: "scene-speaking",
    render: renderSpeaking
  },
  driving: {
    name: "Vehophobia",
    label: "Driving",
    icon: carIcon(),
    blurb: "Fear of driving — losing control, the speed, the other cars.",
    levels: [
      { title: "Parked, engine on",  desc: "Sat behind the wheel. Foot on the brake.", traffic: 0.0,  speed: 0.0 },
      { title: "Quiet residential",  desc: "Empty side street. 30 km/h.",              traffic: 0.20, speed: 0.30 },
      { title: "City avenue",        desc: "Cars in front and behind. Traffic lights.",traffic: 0.55, speed: 0.55 },
      { title: "Highway lane",       desc: "Sustained speed. Lorries to your left.",   traffic: 0.75, speed: 0.85 },
      { title: "Motorway in rain",   desc: "Spray on the windshield. Reduced visibility.", traffic: 0.85, speed: 1.00 }
    ],
    sceneClass: "scene-driving",
    render: renderDriving
  },
  storms: {
    name: "Astraphobia",
    label: "Thunderstorms",
    icon: stormIcon(),
    blurb: "Fear of thunder and lightning — the bright flash, the boom that follows.",
    levels: [
      { title: "Distant rumble",     desc: "A grumble far away. Soft rain.",          intensity: 0.15 },
      { title: "Approaching front",  desc: "Wind picks up. Flashes visible.",         intensity: 0.35 },
      { title: "Storm overhead",     desc: "Flash and thunder seconds apart.",        intensity: 0.65 },
      { title: "Strikes nearby",     desc: "Loud, sudden. The room briefly lights up.", intensity: 0.85 },
      { title: "Directly overhead",  desc: "Flash and crack at the same moment.",     intensity: 1.00 }
    ],
    sceneClass: "scene-storms",
    render: renderStorms
  },
  dark: {
    name: "Nyctophobia",
    label: "The dark",
    icon: moonIcon(),
    blurb: "Fear of the dark — what might be in the room you can't see.",
    levels: [
      { title: "A dim room",           desc: "Your bedroom at night. The bedside lamp is on.",             dimness: 0.20, minHold: 12 },
      { title: "Curtains drawn",       desc: "Only a night-light by the wall. Long shadows.",             dimness: 0.45, minHold: 15 },
      { title: "Lights off",           desc: "Moonlight through the window, and your eyes adjusting.",    dimness: 0.70, minHold: 18 },
      { title: "The landing at night", desc: "The dark hallway outside your room. A streetlight far off.", dimness: 0.88, minHold: 22 },
      { title: "Total dark",           desc: "Nothing to see. Only the house's sounds.",                  dimness: 1.00, minHold: 26 }
    ],
    sceneClass: "scene-dark",
    render: renderDark
  }
};

// ---------- The Journey: game-world data ----------
// The whole app is framed as ONE game: your character travels the Valley of
// Fears, where the six most famous phobias live as "realms" along a winding
// path. A realm's ladder is its five "trials"; each finished trial shrinks
// that realm's shadow guardian and earns a collectible Spark of Wisdom — the
// psychoeducation, dripped one card at a time instead of dumped as a wall of
// text. Non-featured phobias keep working via deep links / old progress, but
// the journey map and pickers only surface these six (+ user-forged ladders).
const FEATURED = ["dogs", "spiders", "snakes", "heights", "dark", "enclosed"];

// Launch scope. A realm opens once it has the full learning loop (an alarm
// that falls while you stay, reading the moment, trials that end on learning,
// not a timer) and the art pass to match: dogs, then spiders and snakes, then
// heights, the dark and tight spaces. The legacy realms (water, flying…) still
// run a bare hold timer, so a deep link to one shows "coming soon".
// QA / dev: `?all=1` in the URL, or localStorage fobia.allRealms = "1".
const LAUNCH_OPEN = ["dogs", "spiders", "snakes", "heights", "dark", "enclosed"];
function allRealmsUnlocked() {
  try { return /[?&]all=1\b/.test(location.search) || localStorage.getItem("fobia.allRealms") === "1"; } catch { return false; }
}
function realmOpen(k) {
  if (LAUNCH_OPEN.includes(k) || allRealmsUnlocked()) return true;
  if (PHOBIAS[k] && PHOBIAS[k].isCustom) return true;   // the traveler's own forged ladder
  // A traveler who already walked a realm keeps it — nothing they own vanishes.
  try { const pr = state.progress && state.progress[k]; if (pr && (pr.highestCompleted ?? -1) >= 0) return true; } catch {}
  return false;
}

// Per-realm flavour. `whispers` is the per-trial psychology drip: one short
// principle per rung, phrased for THIS fear, revealed as the traveler reaches
// that trial (future trials stay misty — curiosity is part of the pull).
const REALMS = {
  dogs: {
    realmName: "The Meadow Yard",
    epithet: "where the barking lives",
    line: "Every yard I crossed the street to avoid made the barking louder in my head.",
    clearedLine: "The yard is just a yard now. The dog is just a dog.",
    whispers: [
      "Close enough to watch properly, then let the alarm rise and fall. Your body is collecting evidence.",
      "When it comes over, let it. Standing still while a dog sniffs you is the whole rep.",
      "Ears up doesn't mean danger. Let your body learn to tell 'alert' from 'attack'.",
      "Close is loud. Stay until loud gets boring — boredom is the sound of learning.",
      "Big, loud, and running at you — and it stops. Watch where it stops, and let it run out of steam."
    ]
  },
  spiders: {
    realmName: "The Old Cellar",
    epithet: "where small things skitter",
    line: "It's not the size. It's the legs. But I'm done checking every corner of every room.",
    clearedLine: "The cellar is quiet. It was always mostly quiet.",
    whispers: [
      "A dot in the corner. Your alarm fires anyway — alarms are cheap, danger is rare.",
      "It moved, then stilled. Notice your prediction ('it will run at me') failing.",
      "Darting looks like intent. It isn't — it's how small things stay alive.",
      "Near your feet and… nothing happens. Let 'nothing happens' sink all the way in.",
      "Eye level, on the wall. You've seen the whole truth of it now — and stayed."
    ]
  },
  snakes: {
    realmName: "The Sunlit Clearing",
    epithet: "where the grass moves",
    line: "A rope on a path once stopped my heart. I want my heart back.",
    clearedLine: "The grass moves. Sometimes it's just the wind. You can tell now.",
    whispers: [
      "It's basking, not hunting. Most of a snake's day is spent doing nothing at all.",
      "It slides, it settles. Stillness — yours — is a language it understands.",
      "It crossed your path and kept going. You were never the destination.",
      "It rose to look. Being seen and standing slow-and-still is your power here.",
      "Rush it and it warns; move gently and it settles. Calm is a skill you now own."
    ]
  },
  heights: {
    realmName: "The Summit",
    epithet: "where the ground looks up at you",
    line: "It's not the falling. It's the pull of the edge. I want to stand there and just… look.",
    clearedLine: "The drop is still deep. Your legs just no longer vote against you.",
    whispers: [
      "One step of height, same legs. The wobble is a guess your body makes, not a fact.",
      "Hold the rail if you need it — then loosen one finger. That's how trust starts.",
      "Looking down is allowed. The swoop in your stomach rises, peaks, and passes.",
      "Wind is information, not threat. The building held everyone before you.",
      "The edge, respected — not feared. That difference is the whole climb."
    ]
  },
  dark: {
    realmName: "The House at Night",
    epithet: "where shapes grow eyes",
    line: "I know there's nothing there. I just want my body to know it too.",
    clearedLine: "The dark is just the room with the lights off. It always was.",
    whispers: [
      "Dim is a good teacher. Your eyes adjust faster than your fear predicts.",
      "Long shadows are geometry, not creatures. Watch one until it's boring.",
      "In low light the mind fills gaps with monsters. Notice it doing it — that's the trick.",
      "Your own breath is the loudest thing here. That's how safe this room is.",
      "Total dark, and you're still you. Nothing was added when the light left."
    ]
  },
  enclosed: {
    realmName: "The Narrow Passage",
    epithet: "where the walls stay put",
    line: "Elevators, tunnels, tight rooms — my chest decides before I do. I'm taking the decision back.",
    clearedLine: "Small rooms are just rooms. Your breath fits in all of them.",
    whispers: [
      "A roomy space to start. Map the exits once, then stop checking — that's the rep.",
      "Walls in reach ≠ walls closing in. Touch one. It's just standing there.",
      "Doors close. Air keeps arriving. The chest-squeeze is a false fuel gauge.",
      "Shoulder-width walls, full-size breaths. Prove it slowly, on purpose.",
      "Stillness in the narrowest place. You didn't need the room — you needed the calm."
    ]
  }
};
// Fallback realm flavour for custom / legacy phobias so every ladder still
// renders as a realm even if it isn't one of the six featured fears.
// Trial names/descriptions through the content layer (level.<key>.<i>.title /
// .desc in the fa pack). English falls straight through to the data.
function lvTitle(key, i) { const lv = PHOBIAS[key] && PHOBIAS[key].levels[i]; return lv ? t(`level.${key}.${i}.title`, lv.title) : ""; }
function lvDesc(key, i)  { const lv = PHOBIAS[key] && PHOBIAS[key].levels[i]; return lv && lv.desc ? t(`level.${key}.${i}.desc`, lv.desc) : ""; }
// Fear names through the same layer: "Dogs" (phobia.<key>.label) and the
// clinical "Cynophobia" (phobia.<key>.name).
function phLabel(key) { const p = PHOBIAS[key]; return p ? t(`phobia.${key}.label`, p.label) : key; }
function phName(key)  { const p = PHOBIAS[key]; return p ? t(`phobia.${key}.name`, p.name || "") : ""; }

function realmOf(key) {
  const p = PHOBIAS[key];
  const base = REALMS[key] || {
    realmName: p ? `The Realm of ${p.label}` : "An Unmapped Realm",
    epithet: "a fear you carry",
    line: "I named this fear myself. That's already half the map.",
    clearedLine: "You walked the whole path you drew.",
    whispers: [
      "Starting small isn't cheating — it's how the nervous system actually learns.",
      "Stay until the alarm gets bored. Boredom is progress wearing a disguise.",
      "Notice what you predicted, and what actually happened. Mind the gap.",
      "The urge to leave will crest and pass. Watch it like weather.",
      "The last step is just the first step, repeated by someone braver — you."
    ]
  };
  // Content-layer localization: structured keys ("realm.dogs.name") resolve
  // through t(); English mode returns `base` untouched since the en pack
  // omits content keys and t() falls back to the string passed here.
  if (window.I18n && window.I18n.currentLanguage() !== "en") {
    return Object.assign({}, base, {
      realmName:    t(`realm.${key}.name`,     base.realmName),
      epithet:      t(`realm.${key}.epithet`,  base.epithet),
      line:         t(`realm.${key}.line`,     base.line),
      clearedLine:  t(`realm.${key}.cleared`,  base.clearedLine),
      whispers:     (base.whispers || []).map((w, i) => t(`realm.${key}.whisper.${i}`, w)),
    });
  }
  return base;
}
// ---------- Reading the dog: the body-language catalogue ----------
// Shared by the dog scene's coach (module scope, which reads these globals)
// and the realm page's field guide. Every entry is something the scene
// really animates; `look` is what a prompt describes (so the player learns
// WHAT to look at), `means` is the reading shown after they answer.
const DOG_READ_CLASSES = {
  calm:  { dot: "🟢", key: "1", label: "Relaxed" },
  alert: { dot: "🟡", key: "2", label: "Alert / excited" },
  space: { dot: "🔴", key: "3", label: "Uneasy — give space" },
};
// Every entry is something the scene really animates. `look` is what the
// prompt describes (so the player learns WHAT to look at); `means` is the
// reading, shown after they answer.
const DOG_SIGNALS = {
  sniff:       { cls: "calm",  icon: "👃", name: "Nose to the floor",   look: "nose down, tail loose, busy with the floor",
                 means: "Sniffing is a dog reading its news. Relaxed — and not about you." },
  drink:       { cls: "calm",  icon: "💧", name: "Drinking",            look: "head in the bowl, lapping",
                 means: "A dog that drinks with you in the room is at ease. Nobody stops for water mid-attack." },
  sit:         { cls: "calm",  icon: "🐕", name: "Settles into a sit",  look: "weight back on its haunches, still",
                 means: "Sitting is a calm, low-energy pose. A dog about to charge doesn't sit down first." },
  lie:         { cls: "calm",  icon: "💤", name: "Lies down",           look: "belly on the floor, chin low",
                 means: "Lying down is about as relaxed as a dog gets." },
  headTilt:    { cls: "calm",  icon: "❔", name: "Head tilt",           look: "head cocked to one side, ears forward",
                 means: "Curiosity — it's trying to place a sound or a word." },
  playBow:     { cls: "calm",  icon: "🙇", name: "Play bow",            look: "chest down, rump up, tail going",
                 means: "A play bow means \"this is a game\". It's the opposite of a threat." },
  shake:       { cls: "calm",  icon: "💦", name: "Shake-off",           look: "a full-body shake, like after a bath",
                 means: "Dogs shake off to reset after a moment of excitement or tension. Something just ended." },
  lookAway:    { cls: "calm",  icon: "↪️", name: "Looks away",          look: "it turns its head away from your stare",
                 means: "A calming signal: \"no trouble here\". To a dog a long stare is rude — softening your eyes answers it." },
  greet:       { cls: "calm",  icon: "👋", name: "Wiggly hello",        look: "loose, wiggly body, tail sweeping",
                 means: "A friendly greeting. Loose and wiggly is exactly the body language you want to see." },
  alertWatch:  { cls: "alert", icon: "👀", name: "Ears up, watching",   look: "standing still, ears up, eyes on you",
                 means: "Alert means paying attention — not planning an attack. Most dogs look, decide, and relax." },
  soundGlance: { cls: "alert", icon: "🪟", name: "Heard something",     look: "head snaps round to the window",
                 means: "Something outside caught its ear. Alert — and not about you at all." },
  alertBark:   { cls: "alert", icon: "🔊", name: "A bark or two",       look: "a bark, then back to watching",
                 means: "A bark is a dog's voice: \"hey — something's up\". Loud is not the same as dangerous." },
  excitedBark: { cls: "alert", icon: "🎉", name: "Excited barking",     look: "tail high and wagging hard, bouncing, barking",
                 means: "Excited, not angry — the loose body and the wagging tail give it away. Big noise, friendly engine." },
  runOver:     { cls: "alert", icon: "💨", name: "Bounds over",         look: "running at you, tail up, loose and bouncy",
                 means: "A bouncy run with a wagging tail is an excited greeting. Watch where it stops: it always stops." },
  startled:    { cls: "space", icon: "😟", name: "Startled",            look: "a flinch, tail tucked, ears back",
                 means: "This dog got a fright — from you. Slow down and give it room. A scared dog needs space, not a stare." },
  warning:     { cls: "space", icon: "✋", name: "A warning",           look: "body stiff, hard stare, a low growl",
                 means: "A warning — dogs growl so they DON'T have to bite. Pause, soften your eyes, give it a step. That's reading it right, not running away." },
};
const DOG_SIGNAL_ORDER = Object.keys(DOG_SIGNALS);
function dogSignalText(id, field) {
  const s = DOG_SIGNALS[id];
  return s ? t(`dogsig.${id}.${field}`, s[field]) : "";
}
function dogClassLabel(cls) {
  const c = DOG_READ_CLASSES[cls];
  return c ? t(`dogcls.${cls}`, c.label) : cls;
}
// The field guide — which signals this traveler has met and named. Lives in
// the character's slice so it follows the traveler, not the device.
function dogFieldGuide() {
  try { const cs = activeCharSlice(); return cs.dogReads || (cs.dogReads = {}); } catch { return {}; }
}
function recordDogRead(id, right) {
  try {
    const g = dogFieldGuide();
    const e = g[id] || (g[id] = { seen: 0, right: 0, first: Date.now() });
    e.seen++; if (right) e.right++;
    saveState();
    return e.seen === 1;
  } catch { return false; }
}

// ---------- What the alarm predicts (the feared OUTCOME, not the feeling) ----
// The predict screen used to ask only "how anxious will you feel?" — useful,
// but it never names the catastrophe the phobia is actually built on. Naming
// it ("it'll run at me"), rating how sure you are, then checking it against
// what the dog really did — and re-rating — is the core of modern exposure
// work (expectancy violation). `check(ev)` reads the scene's evidence.
const DOG_FEARS = [
  { id: "run",   text: "It'll run at me" },
  { id: "jump",  text: "It'll jump up on me" },
  { id: "bite",  text: "It'll bite or snap at me" },
  { id: "bark",  text: "It'll bark at me" },
  { id: "stare", text: "It'll stare me down" },
  { id: "panic", text: "I'll panic and have to leave" },
];
function dogFearText(id) {
  const f = DOG_FEARS.find((x) => x.id === id);
  return f ? t(`dogfear.${id}`, f.text) : "";
}
let pendingExpect = null;   // { phobia, level, fear, belief, ts } — set at the gate
// What actually happened, in plain words, for one feared outcome. Returns
// { happened, line }. `name` is the dog's name.
function dogRealityFor(fear, ev, name, early) {
  const n = escapeHtml(name || "the dog");
  const md = ev && ev.minDist != null ? ev.minDist : null;
  switch (fear) {
    case "run":
      return ev.ranAtYou > 0
        ? { happened: true, line: tf("rc.runYes", "{dog} did run over — {k} time(s). It stopped short every time{md}. Then it did dog things.", { dog: n, k: ev.ranAtYou, md: md != null ? tf("rc.closest", " (closest: {m} m)", { m: md }) : "" }) }
        : { happened: false, line: tf("rc.runNo", "{dog} never ran at you.{md}", { dog: n, md: md != null ? " " + tf("rc.closestS", "The closest it came was {m} m.", { m: md }) : "" }) };
    case "jump":
      return ev.jumped > 0
        ? { happened: true, line: tf("rc.jumpYes", "{dog} jumped up — and got down again.", { dog: n }) }
        : { happened: false, line: tf("rc.jumpNo", "{dog} never jumped up. Not once.", { dog: n }) };
    case "bite":
      return { happened: false, line: tf("rc.biteNo", "No bite, no snap, no teeth. {extra}", { extra: md != null ? tf("rc.closestS", "The closest it came was {m} m.", { m: md }) : "" }) };
    case "bark":
      return ev.barks > 0
        ? { happened: true, line: tf("rc.barkYes", "It barked — {k} time(s). Loud, and only loud: after every bark you were still standing, and nothing followed it.", { k: ev.barks }) }
        : { happened: false, line: t("rc.barkNo", "It didn't bark at all.") };
    case "stare":
      return ev.stareSec > 6
        ? { happened: true, line: tf("rc.stareYes", "It looked at you for about {s}s in all — and every time, it looked away again or went back to its business. Watching is how dogs keep track, not a plan.", { s: ev.stareSec }) }
        : { happened: false, line: t("rc.stareNo", "It barely looked at you. You were not that interesting — which is most encounters with dogs.") };
    case "panic":
      return early
        ? { happened: true, line: tf("rc.panicYes", "You stepped out — always allowed. Your alarm had reached {p}; next time, see if you can stay one breath past the top.", { p: ev.peak }) }
        : { happened: false, line: tf("rc.panicNo", "Your alarm peaked at {p} and came down to {e} — and you were still in the room when it did.", { p: ev.peak, e: ev.end }) };
    default:
      return { happened: false, line: "" };
  }
}

// ---------- Spiders: reading the spider, what the alarm predicts ----------
// Same shape as the dog catalogue: every signal is something the cellar
// scene really animates; `look` is the prompt, `means` the reading. The
// appraisal that matters for spider fear is where it's GOING and why:
// most spider movement is relocating or fleeing, not approaching.
const SPIDER_READ_CLASSES = {
  calm:  { dot: "🟢", key: "1", label: "Resting — busy with itself" },
  move:  { dot: "🟡", key: "2", label: "Going somewhere", tone: "alert" },
  space: { dot: "🔴", key: "3", label: "Startled — give it room" },
};
const SPIDER_SIGNALS = {
  still:    { cls: "calm",  icon: "🕷", name: "Perfectly still",      look: "legs folded in, not a twitch",
              means: "Spiders spend most of their lives exactly like this — waiting, not plotting. Still means still." },
  feel:     { cls: "calm",  icon: "〰", name: "Tapping the air",       look: "front legs lifting and tapping, body still",
              means: "Spiders feel their way through the world. The tapping is it reading vibrations — curiosity, not a target lock." },
  flick:    { cls: "calm",  icon: "🦵", name: "Flicks a leg",          look: "one leg lifts, shakes, settles",
              means: "Shaking off dust or a thread. A spider tidying itself is busy with itself — you aren't in its plans." },
  wander:   { cls: "move",  icon: "🧭", name: "Wanders a few steps",   look: "a slow walk, a stop, a few more steps",
              means: "Exploring the floor. It can barely see you — 'toward you' is just where the floor happens to go." },
  dart:     { cls: "move",  icon: "💨", name: "A sudden dash",         look: "a fast burst across open floor, then a dead stop",
              means: "Open floor is dangerous for small things, so they cross it fast. A dash is it getting to cover — not a charge." },
  turnAway: { cls: "move",  icon: "↪️", name: "Turns off",             look: "it changes course, away from you",
              means: "Given the choice, a spider moves away from big warm things. You are a big warm thing." },
  stilt:    { cls: "space", icon: "⬆️", name: "Rises up on its legs",  look: "body lifted high, legs straight, very still",
              means: "A startled spider rises to run. It's getting ready to leave — give it a moment and it will." },
  crouch:   { cls: "space", icon: "⤵️", name: "Crouches low",          look: "body pressed down, legs bunched under it",
              means: "A crouch means you came fast and it's startled. If it jumps, it jumps to get away — and it stops short." },
};
const SPIDER_FEARS = [
  { id: "run",   text: "It'll run at me" },
  { id: "jump",  text: "It'll jump at me" },
  { id: "crawl", text: "It'll crawl on me" },
  { id: "bite",  text: "It'll bite me" },
  { id: "lose",  text: "It'll dart off and I won't know where it is" },
  { id: "panic", text: "I'll panic and have to leave" },
];
function spiderRealityFor(fear, ev, name, early) {
  const md = ev && ev.minDist != null ? ev.minDist : null;
  const closest = md != null ? " " + tf("rc.closestS", "The closest it came was {m} m.", { m: md }) : "";
  const darts = (ev.kinds && ev.kinds.dart) || 0;
  switch (fear) {
    case "run":
      return ev.ranAtYou > 0
        ? { happened: true, line: tf("rc.sp.runYes", "It came your way {k} time(s) — and stopped, or turned off, every time.{c}", { k: ev.ranAtYou, c: closest }) }
        : { happened: false, line: tf("rc.sp.runNo", "It never ran at you. When it moved, it moved somewhere else.{c}", { c: closest }) };
    case "jump":
      return ev.jumped > 0
        ? { happened: true, line: tf("rc.sp.jumpYes", "It jumped {k} time(s) — and landed short of you every time. A startled jump is an escape that points the wrong way, not an attack.", { k: ev.jumped }) }
        : { happened: false, line: t("rc.sp.jumpNo", "It never jumped. Not once.") };
    case "crawl":
      return { happened: false, line: tf("rc.sp.crawlNo", "It never touched you.{c} Spiders avoid big warm bodies — climbing onto one is the last thing it wants.", { c: closest }) };
    case "bite":
      return { happened: false, line: tf("rc.sp.biteNo", "No bite.{c} House spiders almost never bite people, and when cornered their first choice is always to run.", { c: closest }) };
    case "lose":
      return darts > 0
        ? { happened: true, line: tf("rc.sp.loseYes", "It dashed {k} time(s) — and every time it stopped again a few steps on, in plain view. Fast is not the same as gone.", { k: darts }) }
        : { happened: false, line: t("rc.sp.loseNo", "It never vanished. It stayed where you could see it the whole time.") };
    case "panic":
      return early
        ? { happened: true, line: tf("rc.panicYes", "You stepped out — always allowed. Your alarm had reached {p}; next time, see if you can stay one breath past the top.", { p: ev.peak }) }
        : { happened: false, line: tf("rc.sp.panicNo", "Your alarm peaked at {p} and came down to {e} — and you were still in the cellar when it did.", { p: ev.peak, e: ev.end }) };
    default:
      return { happened: false, line: "" };
  }
}

// ---------- Snakes ----------
// The appraisal for snake fear: at ease vs curious vs defensive. Tongue
// flicks read as menace to a frightened eye; they are smell.
const SNAKE_READ_CLASSES = {
  calm:    { dot: "🟢", key: "1", label: "At ease" },
  curious: { dot: "🟡", key: "2", label: "Curious — tasting the air", tone: "alert" },
  space:   { dot: "🔴", key: "3", label: "Defensive — give it room" },
};
const SNAKE_SIGNALS = {
  bask:     { cls: "calm",    icon: "☀️", name: "Basking",               look: "loosely coiled in the sun, barely moving",
              means: "Warming up. A snake in the sun is charging its batteries, not waiting for you." },
  glide:    { cls: "calm",    icon: "〰", name: "Glides along",           look: "stretched out, a slow side-to-side slide",
              means: "Stretched out and gliding is a relaxed snake going about its day. You're terrain, not a target." },
  leave:    { cls: "calm",    icon: "↪️", name: "Slides away",            look: "it turns and glides off, away from you",
              means: "Given a choice, a snake chooses away. Most real encounters end exactly like this." },
  flick:    { cls: "curious", icon: "👅", name: "Tongue flicking",        look: "the tongue flicks out, in, out",
              means: "The tongue is its nose — it collects smells from the air. Curiosity, not a threat." },
  sniff:    { cls: "curious", icon: "👃", name: "Fast flicks, facing you", look: "quick tongue flicks, head turned your way",
              means: "It's smelling YOU. Interested and unsure. Staying still lets it decide you're not a problem." },
  lookUp:   { cls: "curious", icon: "👀", name: "Lifts its head",         look: "the front of the body raised a little, head steady",
              means: "Having a look around — snakes lift their heads to see further. Not a strike posture." },
  rear:     { cls: "space",   icon: "⬆️", name: "Rears up",               look: "neck raised high, head facing you",
              means: "A defensive display: it's trying to look big so you'll leave it alone. Pause and give it room — that's reading it right, not running away." },
  sCoil:    { cls: "space",   icon: "🌀", name: "Pulls into an S",        look: "neck drawn back into an S, head level and still",
              means: "An S is a warning: \"too close\". A step back and it relaxes. A strike from here is a warning shot that stops short." },
};
const SNAKE_FEARS = [
  { id: "come",   text: "It'll come at me" },
  { id: "strike", text: "It'll strike at me" },
  { id: "bite",   text: "It'll bite me" },
  { id: "chase",  text: "It'll chase me if I move" },
  { id: "rear",   text: "It'll rear up at me" },
  { id: "panic",  text: "I'll panic and have to leave" },
];
function snakeRealityFor(fear, ev, name, early) {
  const md = ev && ev.minDist != null ? ev.minDist : null;
  const closest = md != null ? " " + tf("rc.closestS", "The closest it came was {m} m.", { m: md }) : "";
  const K = ev.kinds || {}, N = ev.notes || {};
  const strikes = N.strike || 0, rears = (N.rear || 0), leaves = N.leave || 0;
  switch (fear) {
    case "come":
      return ev.ranAtYou > 0
        ? { happened: true, line: tf("rc.sn.comeYes", "It moved your way {k} time(s) — crossing, not hunting — and turned off again.{c}", { k: ev.ranAtYou, c: closest }) }
        : { happened: false, line: tf("rc.sn.comeNo", "It never came at you.{c}{l}", { c: closest, l: leaves ? " " + t("rc.sn.left", "When it moved, it moved away.") : "" }) };
    case "strike":
      return strikes > 0
        ? { happened: true, line: tf("rc.sn.strikeYes", "It struck {k} time(s) — at the air, stopping well short of you, and then pulled back. A strike like that is a warning shot: \"that's close enough\".", { k: strikes }) }
        : { happened: false, line: tf("rc.sn.strikeNo", "It never struck.{c}", { c: closest }) };
    case "bite":
      return { happened: false, line: tf("rc.sn.biteNo", "No bite.{c} Snakes bite people almost only when they're stepped on or grabbed.", { c: closest }) };
    case "chase":
      return { happened: false, line: ev.escapes > 0
        ? tf("rc.sn.chaseEsc", "You stepped back {k} time(s). It never followed — not once.", { k: ev.escapes })
        : t("rc.sn.chaseNo", "It never followed you. Snakes don't chase people — they can't see much point in us.") };
    case "rear":
      return rears > 0
        ? { happened: true, line: tf("rc.sn.rearYes", "It reared {k} time(s) — and you were still standing after every one. Looking big is how it asks for room.", { k: rears }) }
        : { happened: false, line: t("rc.sn.rearNo", "It never reared up at you.") };
    case "panic":
      return early
        ? { happened: true, line: tf("rc.panicYes", "You stepped out — always allowed. Your alarm had reached {p}; next time, see if you can stay one breath past the top.", { p: ev.peak }) }
        : { happened: false, line: tf("rc.sn.panicNo", "Your alarm peaked at {p} and came down to {e} — and you were still in the clearing when it did.", { p: ev.peak, e: ev.end }) };
    default:
      return { happened: false, line: "" };
  }
}

// ---------- Place realms: heights, the dark, tight spaces ----------
// No animal to read here, so the prompts are about what you notice: a
// sensation in your own body, the place doing what places do, or (the answer
// fear always gives) real danger. Learning to tell a loud alarm from a real
// problem IS the skill — interoceptive exposure and threat appraisal.
const HEIGHTS_READ_CLASSES = {
  body:   { dot: "💓", key: "1", label: "My body's alarm", tone: "calm" },
  place:  { dot: "🏗", key: "2", label: "Just how high places are", tone: "alert" },
  danger: { dot: "⚠️", key: "3", label: "Actually unsafe", tone: "space" },
};
const HEIGHTS_SIGNALS = {
  legs:   { cls: "body",  icon: "🦵", name: "Jelly legs",            look: "your knees feel soft, like they might not hold",
            means: "Adrenaline sends blood to the big muscles and makes them tremble. Your legs are fine — they're just ready to run. You're standing on them right now." },
  pull:   { cls: "body",  icon: "🌀", name: "The pull",              look: "a tug, as if the drop were drawing you toward it",
            means: "Most people feel it at an edge — the 'high place phenomenon'. It's your balance system double-checking, not a wish or a warning. It passes." },
  swim:   { cls: "body",  icon: "〰", name: "The view swims",        look: "the horizon seems to tilt and swim",
            means: "Up high your eyes lose close reference points, so balance leans on your inner ear — and the scene seems to move. It's a known height effect, not you falling." },
  sway:   { cls: "place", icon: "🌉", name: "It flexes",             look: "the walkway moves a tiny bit under your feet",
            means: "Towers and bridges are built to flex. A structure that gives a little under load is doing exactly what it was designed to do." },
  gust:   { cls: "place", icon: "💨", name: "A gust",                look: "a gust of wind pushes at your jacket",
            means: "Wind is stronger up high, and it feels like more than it is. A gust that tugs your sleeve can't move a standing adult off their feet." },
  rattle: { cls: "place", icon: "🔩", name: "The railing rattles",   look: "the railing rattles when you shake it",
            means: "Railings are loose-fitted and rated to hold a crowd leaning on them. Rattle is noise, not weakness." },
  coin:   { cls: "place", icon: "🪙", name: "A long fall",           look: "the coin takes a long time to land",
            means: "That's just how far down it is — the drop is real, and so is the rail between you and it. Height isn't danger; falling is, and nothing here is making you fall." },
};
const HEIGHTS_FEARS = [
  { id: "fall",   text: "I'll fall" },
  { id: "rail",   text: "The railing will give way" },
  { id: "pull",   text: "I'll feel pulled over the edge" },
  { id: "dizzy",  text: "I'll get so dizzy I lose my balance" },
  { id: "freeze", text: "I'll freeze and won't be able to move" },
  { id: "panic",  text: "I'll panic and have to leave" },
];
function heightsRealityFor(fear, ev, name, early) {
  const N = ev.notes || {};
  const edgeS = ev.engagedSec || 0;
  switch (fear) {
    case "fall":
      return { happened: false, line: tf("rc.h.fall", "You were at the edge for about {s}s. Your feet stayed exactly where you put them.", { s: edgeS }) };
    case "rail":
      return N.shake
        ? { happened: false, line: tf("rc.h.railShook", "You shook it {k} time(s). It rattled, and it held every time — railings are rated for a crowd leaning on them.", { k: N.shake }) }
        : { happened: false, line: t("rc.h.railHeld", "It held. You didn't test it this time — next time, give it a shake and watch it hold.") };
    case "pull":
      return N.lean
        ? { happened: true, line: t("rc.h.pullYes", "You felt the edge, and you leaned — and your body kept you exactly where you chose to be. The pull is a sensation, not an instruction.") }
        : { happened: false, line: t("rc.h.pullNo", "Nothing pulled you anywhere. You stood where you chose to stand.") };
    case "dizzy":
      return (N.swim || 0) > 0
        ? { happened: true, line: t("rc.h.dizzyYes", "The view swam — and you stayed standing through it. Dizzy and unbalanced turned out to be two different things.") }
        : { happened: false, line: t("rc.h.dizzyNo", "You stayed steady on your feet the whole time.") };
    case "freeze":
      return (N.moved || 0) > 0.4
        ? { happened: false, line: tf("rc.h.freezeNo", "You moved about {m} m while you were near the edge. Your legs worked the whole time.", { m: (+N.moved).toFixed(1) }) }
        : { happened: false, line: t("rc.h.freezeStill", "You stood still — by choice. When you wanted to move, you could.") };
    case "panic":
      return early
        ? { happened: true, line: tf("rc.panicYes", "You stepped out — always allowed. Your alarm had reached {p}; next time, see if you can stay one breath past the top.", { p: ev.peak }) }
        : { happened: false, line: tf("rc.h.panicNo", "Your alarm peaked at {p} and came down to {e} — and you were still up there when it did.", { p: ev.peak, e: ev.end }) };
    default: return { happened: false, line: "" };
  }
}

const DARK_READ_CLASSES = {
  house:  { dot: "🏠", key: "1", label: "The house being a house", tone: "calm" },
  mind:   { dot: "🌫", key: "2", label: "My mind filling in the dark", tone: "alert" },
  threat: { dot: "👤", key: "3", label: "Something is there", tone: "space" },
};
const DARK_SIGNALS = {
  creak:   { cls: "house", icon: "🪵", name: "A creak",              look: "a creak from somewhere in the floor",
             means: "Wood shrinks as a house cools at night. Every house creaks after dark — it's the building, settling." },
  tap:     { cls: "house", icon: "🌿", name: "Tapping at the window", look: "tap… tap… on the window glass",
             means: "A branch moving in the wind, touching the glass. In daylight you'd never notice it." },
  hum:     { cls: "house", icon: "🔌", name: "A hum, then a click",   look: "a low hum from downstairs, then a click, then quiet",
             means: "The fridge compressor switching off. Houses have a whole night-time soundtrack you only hear when it's quiet." },
  curtain: { cls: "house", icon: "🪟", name: "The curtain stirs",     look: "the curtain moves, just slightly",
             means: "A draft through the window frame. Air moves in a room even when nothing else does." },
  figure:  { cls: "mind",  icon: "🧥", name: "A tall shape",          look: "a tall, dark shape standing against the wall",
             means: "In the dark your brain fills gaps with the shapes it's primed to fear. With a little light: a coat on a hook." },
  eyes:    { cls: "mind",  icon: "✨", name: "Two points of light",   look: "two small points of light low in the corner",
             means: "The standby light on a charger, doubled in the mirror. Eyes are one of the first things a frightened brain looks for." },
  shadow:  { cls: "mind",  icon: "🌑", name: "Something moved",       look: "at the edge of your vision, something seemed to move",
             means: "Your side vision is built to catch motion and is poor at detail — in low light it 'sees' movement that isn't there. Look straight at it: nothing." },
};
const DARK_FEARS = [
  { id: "someone", text: "Something is in the room with me" },
  { id: "sound",   text: "I'll hear something I can't explain" },
  { id: "shape",   text: "I'll see something I can't explain" },
  { id: "touch",   text: "Something will touch me" },
  { id: "lost",    text: "I won't be able to find my way out" },
  { id: "panic",   text: "I'll panic and have to leave" },
];
function darkRealityFor(fear, ev, name, early) {
  const K = ev.kinds || {}, N = ev.notes || {};
  const sounds = (N.creak || 0) + (N.tap || 0) + (N.hum || 0);
  const shapes = (N.figure || 0) + (N.eyes || 0) + (N.shadow || 0) + (N.curtain || 0);
  switch (fear) {
    case "someone":
      return { happened: false, line: N.hall
        ? t("rc.d.someoneHall", "The landing held three doors, a radiator, a coat on a hook — and you. Nothing else, at any point.")
        : t("rc.d.someone", "The room held a bed, a wardrobe, a chair, a coat on a hook — and you. Nothing else, at any point.") };
    case "sound":
      return sounds
        ? { happened: true, line: tf("rc.d.soundYes", "You heard {k} sound(s) in the dark — and every one had an ordinary cause: the floor, the branch, the fridge.", { k: sounds }) }
        : { happened: false, line: t("rc.d.soundNo", "The house stayed quiet the whole time.") };
    case "shape":
      return shapes
        ? { happened: true, line: tf("rc.d.shapeYes", "You saw {k} thing(s) your mind didn't like — and each was the room: a coat, a charger light, a curtain, a trick of side vision.", { k: shapes }) }
        : { happened: false, line: t("rc.d.shapeNo", "Nothing in the dark turned into anything.") };
    case "touch":
      return { happened: false, line: t("rc.d.touch", "Nothing touched you. The only thing that moved in that room was you.") };
    case "lost":
      return (N.moved || 0) > 1
        ? { happened: false, line: tf("rc.d.lostNo", "You walked about {m} m in the dark, and the door was right where you left it the whole time.", { m: (+N.moved).toFixed(0) }) }
        : { happened: false, line: t("rc.d.lostStill", "The door stayed exactly where it was — a few steps behind you the whole time.") };
    case "panic":
      return early
        ? { happened: true, line: tf("rc.panicYes", "You stepped out — always allowed. Your alarm had reached {p}; next time, see if you can stay one breath past the top.", { p: ev.peak }) }
        : { happened: false, line: tf("rc.d.panicNo", "Your alarm peaked at {p} and came down to {e} — and you were still in the dark when it did.", { p: ev.peak, e: ev.end }) };
    default: return { happened: false, line: "" };
  }
}

const ENCLOSED_READ_CLASSES = {
  body:   { dot: "💓", key: "1", label: "My body's alarm", tone: "calm" },
  place:  { dot: "🔧", key: "2", label: "The space doing its thing", tone: "alert" },
  danger: { dot: "⚠️", key: "3", label: "Something's actually wrong", tone: "space" },
};
const ENCLOSED_SIGNALS = {
  breath: { cls: "body",  icon: "🫁", name: "Tight breath",         look: "each breath feels like it isn't quite enough",
            means: "Anxiety makes breathing feel shallow even when there's plenty of air. The air in here is fine — a small room holds hours of it." },
  heat:   { cls: "body",  icon: "🔥", name: "Hot face",             look: "your face and neck feel hot",
            means: "Adrenaline flushes blood to the skin. You're not overheating — the room hasn't changed temperature." },
  closer: { cls: "body",  icon: "↔️", name: "The walls feel closer", look: "the walls seem closer than they were",
            means: "Fear narrows your attention, and the space looks smaller. Measure it: same size as when you walked in." },
  exit:   { cls: "body",  icon: "🚪", name: "The urge to get out",  look: "a strong pull to get out, right now",
            means: "The urge peaks and passes like any wave. You can get out any time — and you don't have to, to be safe." },
  hum:    { cls: "place", icon: "〰", name: "A hum",                look: "a steady hum and a faint vibration",
            means: "Fans, motors and lights hum. It's the building's machinery working, and it means air is moving." },
  knock:  { cls: "place", icon: "🥁", name: "Loud knocking",        look: "a loud, rhythmic knocking starts up",
            means: "That's the scanner's coils switching — loud, harmless, and the sign it's working. Every MRI sounds like this." },
  vent:   { cls: "place", icon: "🌬", name: "A breath of air",      look: "cool air brushes your face",
            means: "The ventilation. Fresh air, moving through the space the whole time." },
  latch:  { cls: "place", icon: "🔒", name: "The latch clicks",     look: "the door clicks shut behind you",
            means: "A latch, not a lock. It opens from the inside with one push, the same as it did a minute ago." },
};
const ENCLOSED_FEARS = [
  { id: "air",     text: "I'll run out of air" },
  { id: "walls",   text: "The walls will close in on me" },
  { id: "trapped", text: "I'll be trapped and can't get out" },
  { id: "faint",   text: "I'll faint" },
  { id: "control", text: "I'll lose control" },
  { id: "panic",   text: "I'll panic and have to leave" },
];
function enclosedRealityFor(fear, ev, name, early) {
  const N = ev.notes || {};
  const mins = Math.max(1, Math.round((ev.engagedSec || 0) / 6) / 10);
  switch (fear) {
    case "air":
      return { happened: false, line: tf("rc.e.air", "You breathed the whole time — about {s}s in there, in a space that holds hours of air. The air never ran low; the feeling did.", { s: ev.engagedSec || 0 }) };
    case "walls":
      return { happened: false, line: N.mri
        ? t("rc.e.wallsMri", "The bore never moved. If it seemed closer, that was fear narrowing your view — it kept its size every second.")
        : t("rc.e.walls", "The walls never moved. If they seemed to, that was fear narrowing your view — the room kept its size every second.") };
    case "trapped":
      if (N.mri) return (N.out || 0) > 0
        ? { happened: false, line: tf("rc.e.trappedMriOut", "You asked to come out {k} time(s) — the table slid out every time.", { k: N.out }) }
        : { happened: false, line: t("rc.e.trappedMriNo", "You stayed in. One squeeze of the ball would have brought you out, any second.") };
      if (N.lift && (N.floors || 0) > 0) return { happened: false, line: tf("rc.e.trappedLift", "The doors stayed shut between floors, then opened — {f} floor(s), every one.", { f: N.floors }) };
      return (N.door || 0) > 0
        ? { happened: false, line: tf("rc.e.trappedOpened", "You opened the door {k} time(s) — it opened every time, first push.", { k: N.door }) }
        : { happened: false, line: t("rc.e.trappedNo", "The door stayed shut because you left it shut. It would have opened with one push at any moment.") };
    case "faint":
      return { happened: false, line: t("rc.e.faint", "You stayed upright and awake. Anxiety pushes blood pressure up, not down — fainting from panic is rare.") };
    case "control":
      return { happened: false, line: t("rc.e.control", "You felt the alarm — and you still chose what to do, second by second. That's what control looks like.") };
    case "panic":
      return early
        ? { happened: true, line: tf("rc.panicYes", "You stepped out — always allowed. Your alarm had reached {p}; next time, see if you can stay one breath past the top.", { p: ev.peak }) }
        : { happened: false, line: tf("rc.e.panicNo", "Your alarm peaked at {p} and came down to {e} — and you were still inside when it did.", { p: ev.peak, e: ev.end }) };
    default: return { happened: false, line: "" };
  }
}

// ---------- Creature kits ----------
// One object per creature realm that the coach, the predict page, the field
// guide and the reality check all read. Dogs keep their original keys
// (dogsig.*, dogcls.*, dogfear.*, cs.dogReads) so nothing already earned or
// translated moves.
const CREATURE_KITS = {
  dogs:    { signals: DOG_SIGNALS, classes: DOG_READ_CLASSES, fears: DOG_FEARS, reality: dogRealityFor,
             sig: "dogsig", cls: "dogcls", fear: "dogfear", guide: "dogReads",
             noun: "dog", nounPl: "dogs", habKinds: ["bark"], lungeKinds: [] },
  spiders: { signals: SPIDER_SIGNALS, classes: SPIDER_READ_CLASSES, fears: SPIDER_FEARS, reality: spiderRealityFor,
             sig: "spsig", cls: "spcls", fear: "spfear", guide: "spiderReads",
             noun: "spider", nounPl: "spiders", habKinds: ["dart"], lungeKinds: ["pounce"] },
  snakes:  { signals: SNAKE_SIGNALS, classes: SNAKE_READ_CLASSES, fears: SNAKE_FEARS, reality: snakeRealityFor,
             sig: "snsig", cls: "sncls", fear: "snfear", guide: "snakeReads",
             noun: "snake", nounPl: "snakes", habKinds: ["rear", "hiss"], lungeKinds: ["strike"] },
  // Place realms: `place` switches the shell's wording from "the animal".
  heights: { signals: HEIGHTS_SIGNALS, classes: HEIGHTS_READ_CLASSES, fears: HEIGHTS_FEARS, reality: heightsRealityFor,
             sig: "hsig", cls: "hcls", fear: "hfear", guide: "heightsReads", place: true,
             noun: "height", nounPl: "heights", habKinds: ["gust", "look"], lungeKinds: [] },
  dark:    { signals: DARK_SIGNALS, classes: DARK_READ_CLASSES, fears: DARK_FEARS, reality: darkRealityFor,
             sig: "dsig", cls: "dcls", fear: "dfear", guide: "darkReads", place: true,
             noun: "dark", nounPl: "the dark", habKinds: ["sound"], lungeKinds: [] },
  enclosed:{ signals: ENCLOSED_SIGNALS, classes: ENCLOSED_READ_CLASSES, fears: ENCLOSED_FEARS, reality: enclosedRealityFor,
             sig: "esig", cls: "ecls", fear: "efear", guide: "enclosedReads", place: true,
             noun: "space", nounPl: "tight spaces", habKinds: ["noise"], lungeKinds: [] },
};
function hasCreatureKit(key) { return !!CREATURE_KITS[key]; }
function kitNoun(key, plural) {
  const K = CREATURE_KITS[key];
  if (!K) return "";
  return plural ? t(`noun.${key}.pl`, K.nounPl) : t(`noun.${key}`, K.noun);
}
function isPlaceKit(key) { return !!(CREATURE_KITS[key] && CREATURE_KITS[key].place); }
function expectQ(key) {
  if (isPlaceKit(key)) return t("expect.q3", "What is your alarm predicting will happen?");
  return key === "dogs" ? t("expect.q", "What is your alarm predicting the dog will do?")
    : tf("expect.q2", "What is your alarm predicting the {noun} will do?", { noun: kitNoun(key) });
}
function kitSignalText(key, id, field) {
  const K = CREATURE_KITS[key], s = K && K.signals[id];
  return s ? t(`${K.sig}.${id}.${field}`, s[field]) : "";
}
function kitClassLabel(key, cls) {
  const K = CREATURE_KITS[key], c = K && K.classes[cls];
  return c ? t(`${K.cls}.${cls}`, c.label) : cls;
}
function kitFearText(key, id) {
  const K = CREATURE_KITS[key], f = K && K.fears.find((x) => x.id === id);
  return f ? t(`${K.fear}.${id}`, f.text) : "";
}
function kitFieldGuide(key) {
  const K = CREATURE_KITS[key];
  try { const cs = activeCharSlice(); return cs[K.guide] || (cs[K.guide] = {}); } catch { return {}; }
}
function kitRecordRead(key, id, right) {
  try {
    const g = kitFieldGuide(key);
    const e = g[id] || (g[id] = { seen: 0, right: 0, first: Date.now() });
    e.seen++; if (right) e.right++;
    saveState();
    return e.seen === 1;
  } catch { return false; }
}
// The coach's view of a kit (the coach lives in the module scope and only
// ever sees this object).
function creatureKit(key) {
  const K = CREATURE_KITS[key] || CREATURE_KITS.dogs;
  const k = CREATURE_KITS[key] ? key : "dogs";
  const T = {
    dogs: {
      firstRead: () => t("dc.tFirstRead", "Reading the dog is half the cure. Fear treats every dog signal as <b>danger</b>; real dogs are mostly saying <b>relaxed</b> or <b>curious</b>."),
      escape: () => t("dc.tEscape", "Backing off made the alarm drop — fast. That relief is how avoidance keeps a fear alive: the brain files it as <b>\"escaped just in time\"</b>. It never gets to learn the dog was fine. Step back in when you're ready — the alarm will be where you left it."),
      hab: () => t("dc.tBarkHab", "Look at the spikes: each bark hits a little softer than the one before. Same bark — your alarm is learning it's just noise."),
    },
    spiders: {
      firstRead: () => t("dc.sp.tFirstRead", "Reading the spider is half the cure. Fear treats every twitch as <b>coming for you</b>; real spiders are mostly <b>resting</b> or <b>going somewhere else</b>."),
      escape: () => t("dc.sp.tEscape", "Backing off made the alarm drop — fast. That relief is how avoidance keeps a fear alive: the brain files it as <b>\"got away just in time\"</b>. It never gets to learn the spider was busy with its own life. Step back in when you're ready — the alarm will be where you left it."),
      settled: () => t("dc.sp.tSettled", "<b>Settled.</b> Same spider, same distance — a quieter alarm. You didn't fight it or flee it. You stayed, and your body did the rest."),
      hab: () => t("dc.sp.tHab", "Look at the spikes: each sudden dash hits a little softer than the one before. Same spider, same dash — your alarm is learning that fast doesn't mean toward you."),
    },
    snakes: {
      firstRead: () => t("dc.sn.tFirstRead", "Reading the snake is half the cure. Fear reads every flick and every movement as <b>a strike coming</b>; real snakes are mostly <b>at ease</b> or <b>curious</b>."),
      escape: () => t("dc.sn.tEscape", "Backing off made the alarm drop — fast. That relief is how avoidance keeps a fear alive: the brain files it as <b>\"that was close\"</b>. It never gets to learn the snake wanted nothing from you. Step back in when you're ready — the alarm will be where you left it."),
      settled: () => t("dc.sn.tSettled", "<b>Settled.</b> Same snake, same distance — a quieter alarm. You didn't fight it or flee it. You stayed, and your body did the rest."),
      hab: () => t("dc.sn.tHab", "Look at the spikes: each rear-up and each hiss hits a little softer. Same display — your alarm is learning it's a request for room, not an attack."),
    },
    heights: {
      firstRead: () => t("dc.h.tFirstRead", "Telling a sensation from a danger is half the cure. Fear files jelly legs, a gust and a long drop all as <b>you're about to fall</b>. They're a body alarm and a high place — that's all."),
      escape: () => t("dc.h.tEscape", "Stepping back made the alarm drop — fast. That relief is how avoidance keeps a fear alive: the brain files it as <b>\"got away from the edge just in time\"</b>. It never gets to learn the edge was safe. Step back in when you're ready — the alarm will be where you left it."),
      settled: () => t("dc.h.tSettled", "<b>Settled.</b> Same edge, same drop — a quieter alarm. You didn't fight it or flee it. You stayed, and your body did the rest."),
      hab: () => t("dc.h.tHab", "Look at the spikes: each gust and each look down hits a little softer than the one before. Same height — your alarm is learning it's just high, not dangerous."),
      rise: () => t("dc.h.tRise", "That rise is your alarm doing its job: <b>loud, not necessarily right</b>. Legs, stomach, the tingle — it's all the alarm. Stay, and watch the line."),
    },
    dark: {
      firstRead: () => t("dc.d.tFirstRead", "Naming what's really there is half the cure. Fear fills the dark with <b>someone</b>; in the dark there's the house, and your mind filling in the gaps."),
      escape: () => t("dc.d.tEscape", "Light made the alarm drop — fast. That relief is how avoidance keeps a fear alive: the brain files it as <b>\"good thing I could see\"</b>. It never learns the dark was just a room. Switch it off again when you're ready — the alarm will be where you left it."),
      settled: () => t("dc.d.tSettled", "<b>Settled.</b> Same room, same dark — a quieter alarm. You didn't fight it or light it. You stayed, and your body did the rest."),
      hab: () => t("dc.d.tHab", "Look at the spikes: each noise in the dark hits a little softer than the one before. Same house — your alarm is learning its night-time sounds."),
      newGround: () => t("dc.d.tNewGround", "Darker, or deeper in, means a fresh wave — smaller than the first. Up, then down again. That's how a ladder is climbed."),
    },
    enclosed: {
      firstRead: () => t("dc.e.tFirstRead", "Telling a sensation from a danger is half the cure. Fear files a tight breath, a hum and a closed door all as <b>trapped</b>. They're a body alarm and a room — that's all."),
      escape: () => t("dc.e.tEscape", "Opening up made the alarm drop — fast. That relief is how avoidance keeps a fear alive: the brain files it as <b>\"got out just in time\"</b>. It never gets to learn the space was safe. Close it again when you're ready — the alarm will be where you left it."),
      settled: () => t("dc.e.tSettled", "<b>Settled.</b> Same space, same walls — a quieter alarm. You didn't fight it or flee it. You stayed, and your body did the rest."),
      hab: () => t("dc.e.tHab", "Look at the spikes: each knock and hum hits a little softer than the one before. Same space — your alarm is learning it's just noise."),
      newGround: () => t("dc.e.tNewGround", "Tighter means a fresh wave — smaller than the first. Up, then down again. That's how a ladder is climbed."),
    },
  }[k];
  return {
    key: k, place: !!K.place, signals: K.signals, classes: K.classes, habKinds: K.habKinds, lungeKinds: K.lungeKinds,
    // Place realms ask about a moment, not an animal's feelings.
    readQ: K.place ? "{look}. What is it?" : null, readQKey: K.place ? "dc.readQPlace" : null,
    holdText: ({
      heights: { begin: () => t("dc.h.hBegin", "Walk up to the railing to begin — at your pace"), back: () => t("dc.h.hBack", "Paused — come back to the railing to carry on") },
      dark: { begin: () => t("dc.d.hBegin", "Walk into the dark to begin — at your pace"), back: () => t("dc.d.hBack", "Paused — step back into the dark to carry on") },
      enclosed: { begin: () => t("dc.e.hBegin", "Step inside and close the door to begin — at your pace"), back: () => t("dc.e.hBack", "Paused — close the door again to carry on") },
    })[k] || null,
    signalText: (id, field) => kitSignalText(k, id, field),
    classLabel: (cls) => kitClassLabel(k, cls),
    fearText: (id) => kitFearText(k, id),
    recordRead: (id, right) => k === "dogs" ? recordDogRead(id, right) : kitRecordRead(k, id, right),
    texts: T,
  };
}
