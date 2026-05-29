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
      "If the dog approaches, let it sniff a closed fist before opening your hand."
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

};

window.PhobiaInfo = PhobiaInfo;
