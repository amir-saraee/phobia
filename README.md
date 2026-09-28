# Mira — The Courage Journey 🏕

**A tiny game about big fears.** Free, in your browser, English + فارسی.

**Play it:** https://phobia-kappa.vercel.app/

## What's in it now

Three realms, five 3D trials each, with animals that read how you move:

| Realm | Fear | The ladder |
|---|---|---|
| 🐕 The Meadow Yard | Dogs (cynophobia) | a small dog busy across the room → a big, loud, excited one that bounds over |
| 🕷 The Old Cellar | Spiders (arachnophobia) | a house spider far off → a huntsman on the wall at eye level (real sizes, 8–26 cm; hold **Z** to look closer) |
| 🐍 The Sunlit Clearing | Snakes (ophidiophobia) | a grass snake basking far off → close, coiled and alert on the path |

Your custom character walks every scene. Heights, the dark and tight spaces are on the map as *coming soon*: their scenes exist, but each reopens only once it has the same learning loop and art as the open realms (`LAUNCH_OPEN` in `index.html`). Add `?all=1` to the URL to play them for QA.

## Built on real psychology

Mira is a game shell around genuine CBT graded-exposure mechanics:

- **An alarm that falls while you stay** — the live wave rises as you close in and comes down on its own if you don't leave; a trial ends when it has settled, not on a timer
- **Predict → face → compare** — name what your fear expects the animal to do ("it'll run at me", "it'll strike"), then check it against what the scene saw happen (expectancy violation)
- **Reading the animal** — a dog relaxed / alert / asking for space; a spider resting / going somewhere / startled; a snake at ease / curious / defensive — from real body language, collected in a field guide per realm
- **🌍 The Real Path** — every in-game trial unlocks a matching tiny *real-world* step (worth more than any game trial)
- **🪞 The Mirror** — a 5-item fear-severity self-check (rated about real life) that shows your baseline → now change in numbers
- **📄 Progress report** — a printable, clinician-readable record you can hand a therapist

> **A practice game, not therapy.** Real exposure work for phobias belongs with a trained clinician. Use Mira for curiosity, education, or as a conversation starter — not treatment.

## Tech

Single-file vanilla JS + Three.js (no build step), Rapier physics, procedural + recorded audio, rigged CC0 creature models (Quaternius), installable PWA, offline-capable, English/Persian with full RTL. Three.js and Rapier are self-hosted under `assets/vendor/` — no runtime CDN.

## Run locally

```bash
npx serve .
```

Then open http://localhost:3000.

## Before you push

```bash
cd scripts && npm install      # once
npm run smoke                  # ~100 s: first run + dog trials + a spider and a snake trial, headless
```

The same smoke test runs as a git `pre-push` hook (`git config core.hooksPath .githooks`, already set in this clone). Skip it once with `SKIP_SMOKE=1 git push`. `SMOKE_SHOTS=1` keeps screenshots in `.smoke-shots/`.

After re-baking dog coats, run `npm run compress-textures` — the game loads the JPEG copies.

## Feedback

Players can write feedback from the menu, Settings, About, and after every trial. Nothing is sent automatically. Set `FEEDBACK_URL` in `index.html` to a form link (Google Form, Tally…) to add an "Open the form" button; until then it's copy-only.
