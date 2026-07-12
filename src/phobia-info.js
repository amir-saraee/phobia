"use strict";

// ---------- Phobia clinical info ----------
// Plain-language psychoeducation for each phobia. Rooted in CBT / exposure
// therapy — the same framing a clinician would use, kept short and warm.
//
// Each entry has:
//   summary     — 2–3 sentence explanation of the phobia
//   prevalence  — short stat about how common it is
//   physical    — body sensations the user might recognise
//   cognitive   — typical thought patterns ("what if…")
//   behaviour   — the avoidance loop the phobia drives
//   science     — why graduated exposure helps (habituation, inhibitory learning)
//   tips        — phobia-specific coping micro-skills
//   warning     — when to step back and consider a professional

const PhobiaInfo = {
  heights: {
    summary: "Acrophobia is an intense fear of high places. The pull-toward-the-edge sensation and a body that braces for falling are part of an over-cautious reflex — not a sign of weakness or imminent danger.",
    prevalence: "Roughly 1 in 20 adults have height-related phobia symptoms strong enough to disrupt daily life.",
    physical: ["Vertigo / spinning", "Quickened heart rate", "Sweaty palms", "Wobbly legs", "Tightness in stomach"],
    cognitive: ["\"I'll lose control and jump.\"", "\"The railing will give way.\"", "\"I can't breathe up here.\""],
    behaviour: ["Avoiding balconies, lifts with glass walls, hikes with drop-offs", "Refusing certain jobs or trips"],
    science: "Heights phobia recruits an overactive vestibular-fear response. Staying with the height — without escape — lets your nervous system learn the railing holds, the ground stays put, and the panic curve naturally falls (habituation).",
    tips: [
      "Plant your feet. Notice five points of contact between your body and something solid.",
      "Look at the horizon, not the drop. The brain calms with a stable visual anchor.",
      "Grip the railing with conscious pressure — proprioception tells your body \"I am held.\"",
      "Slow your exhale to twice the length of your inhale. This vagal-tone trick lowers heart rate."
    ],
    warning: "Severe panic attacks, blackout sensations, or avoiding everyday stairs/lifts are signs to work with a clinical psychologist, not an app."
  },

  water: {
    summary: "Aquaphobia is fear of bodies of water — particularly anything you can't see the bottom of. It often traces to a single early-life event but lives now in the body's automatic alarm system.",
    prevalence: "Around 2–3% of adults experience aquaphobia at clinical intensity.",
    physical: ["Feeling like you can't catch breath", "Jaw clenching", "Tingling limbs", "Sense of dread before stepping in"],
    cognitive: ["\"Something is below me.\"", "\"I'll be pulled under.\"", "\"My body will freeze.\""],
    behaviour: ["Avoiding pools, lakes, ferries; refusing baths above ankle depth"],
    science: "Each successful encounter — staying with the water without drowning — files away a new prediction in your brain: \"this is survivable.\" Inhibitory learning means the old fear isn't erased; it's overlaid by a stronger \"safe\" memory.",
    tips: [
      "Stand still and feel how you don't sink. Your body floats; gravity does the work.",
      "Splash water on your hands. Cold + skin contact engages the parasympathetic nervous system.",
      "If your chest tightens, hum on the exhale. Vibration in the throat lengthens the breath.",
      "Name the temperature, the colour, the sound. Naming pulls you out of catastrophic loops."
    ],
    warning: "If you can't bathe or shower, or if water-related dreams disrupt sleep, please reach out to a trauma-aware therapist."
  },

  dogs: {
    summary: "Cynophobia is the fear of dogs. It often follows a childhood incident or witnessing one — the brain locks onto the memory and treats every dog as that dog.",
    prevalence: "About 7–9% of adults report dog phobia symptoms.",
    physical: ["Tensed shoulders", "Quick shallow breathing", "Sweaty palms", "Frozen feet"],
    cognitive: ["\"It's about to bite.\"", "\"I'll panic if it barks.\"", "\"The owner can't control it.\""],
    behaviour: ["Crossing the street to avoid a dog", "Declining visits to friends with pets"],
    science: "Most dog encounters are uneventful. Each non-event — staying near a dog without being harmed — chips away at the over-trained fear circuit. Looking at the dog (not away) accelerates the relearning.",
    tips: [
      "Read the dog's body language: relaxed mouth, soft eyes, tail in neutral all mean \"chill.\"",
      "Don't make sudden moves; slow down rather than freeze.",
      "Speak to it softly. Your calm voice settles the dog and your own breath.",
      "If the dog approaches, let it sniff a closed fist before opening your hand.",
      "If a dog is barking, soften your gaze and step back slowly — you control the distance."
    ],
    warning: "If a real dog attack is in your past, work with a trauma therapist alongside any exposure practice."
  },

  spiders: {
    summary: "Arachnophobia is one of the most common specific phobias. The brain is biased to over-detect spider-shaped patterns — useful 200,000 years ago, less useful in your living room today.",
    prevalence: "Roughly 3–5% of adults have arachnophobia at clinical intensity; many more have a strong dislike.",
    physical: ["Goosebumps", "A crawling sensation on skin", "Recoil reflex", "Quick scan-the-room behaviour"],
    cognitive: ["\"It will run at me.\"", "\"There must be more I can't see.\"", "\"It's poisonous.\""],
    behaviour: ["Refusing to enter cellars/garages", "Asking someone else to clear webs", "Constant ceiling-scanning at home"],
    science: "Looking at a still spider is the medicine. Avoidance keeps the brain certain it's dangerous. Sustained looking — five seconds, then ten, then thirty — without the feared event happening teaches the system: \"the spider sat there. Nothing happened.\"",
    tips: [
      "Watch the legs in motion — most spiders move in pulses, not lunges.",
      "Stand a fixed distance. You're not getting closer; you're just observing.",
      "Trace its outline with your eyes. Active looking blocks rumination.",
      "Tell yourself \"this is a small animal that wants to get away from me.\""
    ],
    warning: "If your fear extends to a panic that you might be infested, or you can't enter rooms in your own home, please see a CBT therapist."
  },

  enclosed: {
    summary: "Claustrophobia is fear of being trapped or unable to escape. It blooms in tight spaces, lifts, MRI scanners, and crowded transport.",
    prevalence: "About 5–7% of adults; women slightly more often than men.",
    physical: ["Air-hunger feeling", "Heat in the chest", "Heart pounding", "Tunnel vision"],
    cognitive: ["\"I won't be able to breathe.\"", "\"The doors won't open.\"", "\"I'll lose my mind in here.\""],
    behaviour: ["Taking stairs over lifts", "Sitting at the end of rows", "Refusing scans/tunnels"],
    science: "The body interprets enclosure as a threat. Staying inside — long enough to notice you can still breathe and the walls don't move — rewrites the prediction. The first 30–60 seconds are the hardest; the curve falls after that.",
    tips: [
      "Touch the walls deliberately. Solid + still + my-touch = safe.",
      "Count slow breaths to twenty. Doesn't matter if some are short — the count is the anchor.",
      "Look at one fixed point. Eyes that dart fuel the panic loop.",
      "Remind yourself: \"the air in here is the same as the air outside.\""
    ],
    warning: "If you cannot tolerate medical procedures or daily transport, ask your GP for a referral — exposure plus a short course of CBT often resolves it."
  },

  flying: {
    summary: "Aviophobia is the fear of flying. The combination of altitude, no escape, and unusual body sensations triggers a cocktail of anxieties — often layered with claustrophobia.",
    prevalence: "About 1 in 6 adults report some flight anxiety; 2–3% won't fly at all.",
    physical: ["Pre-flight insomnia", "Death-grip on the armrest", "Stomach churning at every bump", "Hyper-tuned to engine sounds"],
    cognitive: ["\"What if there's turbulence I can't handle?\"", "\"What if the engine fails?\"", "\"I won't survive a panic attack at 35,000 ft.\""],
    behaviour: ["Avoiding holidays that need flights", "Drinking heavily pre-flight", "Booking aisle seats compulsively"],
    science: "Commercial aviation is statistically the safest mode of travel. Repeated exposure — each calm flight — slowly teaches the brain what your statistics already know. The seat belt sign chiming has to stop being the gunshot in your nervous system.",
    tips: [
      "Turbulence is air, not falling. Compare it to a car on a bumpy road — uncomfortable, not dangerous.",
      "Watch the cabin crew. Their calm is real data: if it were serious they'd be moving fast.",
      "Slow paced breathing — 4 in, 6 out — through the whole takeoff.",
      "Reframe: \"This is my body practising for a safe future flight.\""
    ],
    warning: "If you've had a panic attack mid-flight, consider Fear of Flying programmes (often run by airlines) before working alone with this app."
  },

  needles: {
    summary: "Trypanophobia is the fear of injections, blood draws, or any sharp medical instrument. Around 10% of cases involve a unique fainting reflex (vasovagal syncope) — your blood pressure drops as a primitive response.",
    prevalence: "Roughly 1 in 10 adults; among the most common reasons people skip vaccines and check-ups.",
    physical: ["Lightheadedness", "Tunnel vision", "Cold sweat", "(Sometimes) actual fainting"],
    cognitive: ["\"It's going to hurt for ever.\"", "\"I'll faint and embarrass myself.\"", "\"What if it goes wrong?\""],
    behaviour: ["Avoiding blood tests, vaccines, dentist visits"],
    science: "Needle pain lasts under a second. Anticipatory anxiety lasts hours and is the larger problem. \"Applied tension\" — squeezing your muscles to keep blood pressure up — prevents the faint at the moment of contact and is taught in clinics.",
    tips: [
      "Look away during the insert; look back after. Clinically validated to reduce reported pain.",
      "Practise applied tension: tighten arms/legs/torso for 15 seconds, release for 30. Repeat 5 times.",
      "Tell the nurse you're nervous. Most have done thousands; they slow down for you.",
      "Reward yourself afterwards — pairing positive recovery weakens the fear circuit."
    ],
    warning: "If avoidance has caused you to skip essential medical care, ask your clinic about a needle-phobia protocol — many run them quietly."
  },

  snakes: {
    summary: "Ophidiophobia is the fear of snakes. Like spiders, it's partly evolved — humans are wired to spot serpentine shapes faster than most other patterns.",
    prevalence: "About 3% of adults at clinical intensity, though one-third of adults have some unease.",
    physical: ["Sharp gasp", "Frozen body or sudden flight reflex", "Skin crawl"],
    cognitive: ["\"It can strike from anywhere.\"", "\"It's poisonous.\"", "\"There must be more.\""],
    behaviour: ["Avoiding grass, hikes, garden work; refusing reptile zones at zoos"],
    science: "Snakes left to themselves don't pursue people. Watching a snake — at distance, then closer over weeks — without being attacked builds the new prediction: \"it doesn't come for me.\" The freeze response loosens in proportion to time spent looking.",
    tips: [
      "Most snakes are non-venomous and want to escape, not attack. Knowing this helps the body believe it.",
      "Trace the snake's outline with your eyes — active observation calms the threat-detector.",
      "Anchor your feet. Weight in the heels means \"I'm here, I'm not running.\"",
      "Talk yourself through it: \"It's coiled. It's still. It's busy being a snake.\""
    ],
    warning: "If you live in a region with venomous species, learn the local first-aid; healthy caution is different from phobia."
  },

  speaking: {
    summary: "Glossophobia — fear of public speaking — is the most commonly reported social fear. The body treats a row of eyes as a primal threat (judgement = ancestral exclusion).",
    prevalence: "About 75% of adults report some speaking fear; 10–15% have it strongly enough to avoid presentations entirely.",
    physical: ["Dry mouth", "Shaky voice", "Heart in throat", "Hot face / sweat", "Blank-mind moments"],
    cognitive: ["\"They're going to judge me.\"", "\"I'll forget everything.\"", "\"I'll be exposed as a fraud.\""],
    behaviour: ["Saying no to talks, weddings, work meetings; calling in sick; over-preparing then under-delivering"],
    science: "Audiences are usually rooting for you, not against you. Every successful speaking exposure — even a shaky one — provides evidence that the worst-case prediction is wrong. The voice settles in proportion to how often it's used in front of others.",
    tips: [
      "Make eye contact with three friendly faces in different parts of the room.",
      "Pause. Your pause feels longer to you than to them. Use silence for breath.",
      "Speak 10% slower than feels natural. The brain interprets slow voice as confident voice — and yours catches up.",
      "Have a one-line opener you've memorised cold. Once you've started, autopilot kicks in."
    ],
    warning: "If speaking anxiety has cost you jobs or relationships, a CBT therapist plus this kind of practice resolves it for most people."
  },

  driving: {
    summary: "Vehophobia (sometimes called amaxophobia) is fear of driving. It often follows an accident, near-miss, or panic attack at the wheel — the brain pairs the vehicle with the panic and the body refuses to be there again.",
    prevalence: "Estimates put it at 5–15% of adults; many people avoid only specific contexts like motorways, bridges, or driving in rain.",
    physical: ["Tight grip on the steering wheel", "Tunnel vision", "Heart pounding at junctions", "Sudden derealisation"],
    cognitive: ["\"I'll lose control of the car.\"", "\"What if a panic attack hits at speed?\"", "\"That driver behind is too close.\""],
    behaviour: ["Avoiding motorways, refusing to drive at night, taking 30-minute detours to dodge bridges"],
    science: "Each calm minute behind the wheel is data. The brain wants every drive to be evidence that the steering wheel does not equal panic. Practising on quiet streets first, then graduating, lets the new \"safe\" memory build before being tested at speed.",
    tips: [
      "Drop your shoulders. The grip can be light. Your hands know what to do.",
      "Look further ahead than you think — three cars ahead, not at the bumper in front.",
      "Slow your exhale to twice your inhale, especially at junctions.",
      "Plan a stopping point if you need it. Knowing you can pull over reduces the urge to."
    ],
    warning: "If driving fear follows a serious accident, a trauma-aware therapist (EMDR or trauma-focused CBT) is more appropriate than self-led practice."
  },

  storms: {
    summary: "Astraphobia is fear of thunder and lightning. The flash, the wait, the boom — and the inability to control any of it — pull on a primitive part of the brain that hasn't updated to modern houses with lightning rods.",
    prevalence: "Roughly 2–3% of adults at clinical intensity; far more children carry milder versions into adulthood.",
    physical: ["Startle response on every flash", "Heart racing during the wait between flash and thunder", "Hiding indoors / wanting a bathtub / closet"],
    cognitive: ["\"What if it strikes the house?\"", "\"What if the power goes out?\"", "\"I can't control any of this.\""],
    behaviour: ["Tracking weather apps obsessively, refusing to leave home if storms are forecast, taking sedatives during storms"],
    science: "Houses are very effective Faraday cages. Lightning seeks the easiest path to ground — usually a tree or a rod, not a person inside a building. Counting the seconds between flash and thunder gives you a real distance measure (every 3 seconds ≈ 1 km away) — a piece of evidence-based control to replace catastrophising.",
    tips: [
      "Count between flash and rumble. Each count is a kilometre of safety.",
      "Stand back from windows. Then notice that you can; the storm is not in your room.",
      "Have a comfort task ready: tea, a familiar book. Action is often more grounding than stillness.",
      "Remind yourself: each strike lasts under a second. The fear lasts longer than the event."
    ],
    warning: "If storms cause panic attacks or stop you sleeping, CBT for specific phobia is the best-evidenced treatment."
  },

  dark: {
    summary: "Nyctophobia is fear of the dark. It's natural in childhood and often persists or returns in adulthood — the brain fills missing visual data with worst-case guesses.",
    prevalence: "About 11% of adults report meaningful dark-fear; most have learned ways to manage it (nightlights, white-noise machines).",
    physical: ["Heightened startle response", "Hyper-aware listening", "Tense neck and shoulders"],
    cognitive: ["\"Something is in here that I can't see.\"", "\"What was that sound?\"", "\"I won't be able to react in time.\""],
    behaviour: ["Sleeping with lights on, avoiding cellars/garages at night, checking under the bed/closet"],
    science: "The dark itself is neutral. The fear comes from the brain rapidly generating threats to fill the visual gap. Sustained exposure — staying in a dim room and noticing the threats don't materialise — quiets that generator. Within 60–90 seconds, your eyes adjust enough to see real shapes, which weakens the imagined ones.",
    tips: [
      "Stand still and let your eyes adjust. Forty seconds is usually enough to see most outlines.",
      "Name what you see. Naming activates the language centre and quiets the threat centre.",
      "Move slowly and deliberately. Confident movement signals to your body that the room is safe.",
      "Acknowledge the imagined fear, then check: is anything actually different from how this room looks in daylight?"
    ],
    warning: "If your dark-fear is rooted in a specific traumatic event (break-in, assault), please work with a trauma therapist alongside any practice."
  },
};

window.PhobiaInfo = PhobiaInfo;
