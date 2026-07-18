# Mira — The Courage Journey 🏕

**A tiny game about big fears.** Free, in your browser, English + فارسی.

**Play it:** https://phobia-kappa.vercel.app/

Walk the **Valley of Fears** — a night valley where six famous phobias live as realms:

| Realm | Fear |
|---|---|
| 🐕 The Meadow Yard | Dogs (cynophobia) |
| 🕷 The Old Cellar | Spiders (arachnophobia) |
| 🐍 The Sunlit Clearing | Snakes (ophidiophobia) |
| 🏔 The Summit | Heights (acrophobia) |
| 🌙 The House at Night | The dark (nyctophobia) |
| 🚪 The Narrow Passage | Tight spaces (claustrophobia) |

Each realm holds five **3D trials**, from "barely a whisper" to "the real thing". Your custom character walks every scene — first-person or third-person — while a shadow guardian shrinks with every trial you face.

## Built on real psychology

Mira is a game shell around genuine CBT graded-exposure mechanics:

- **Predict → face → compare** — expectancy violation, the engine of modern exposure work
- **SUDS ratings & hold timers** — stay until the wave falls on its own
- **🌍 The Real Path** — every in-game trial unlocks a matching tiny *real-world* step (worth more than any game trial)
- **🪞 The Mirror** — a 5-item fear-severity self-check (rated about real life) that shows your baseline → now change in numbers
- **✦ Sparks of Wisdom** — the psychology of fear as collectible cards, earned one trial at a time
- **📄 Progress report** — a printable, clinician-readable record you can hand a therapist

> **A practice game, not therapy.** Real exposure work for phobias belongs with a trained clinician. Use Mira for curiosity, education, or as a conversation starter — not treatment.

## Tech

Single-file vanilla JS + Three.js (no build step), procedural audio via Web Audio, rigged CC0 creature models (Quaternius), installable PWA, offline-capable, English/Persian with full RTL.

## Run locally

```bash
npx serve .
```

Then open http://localhost:3000.
