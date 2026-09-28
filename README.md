# Mira — The Courage Journey 🏕

**A tiny game about big fears.** Free, in your browser, English + فارسی.

**Play it:** https://phobia-kappa.vercel.app/

## What's in it now

The launch realm is **🐕 The Meadow Yard — a fear of dogs (cynophobia)**: five 3D trials, from a small dog busy across the room to a big, loud, excited one, with a dog that reads how you move. Your custom character walks every scene, first-person or third-person.

More realms — spiders, snakes, heights, the dark, tight spaces — are on the map as *coming soon*. Their scenes exist, but each reopens only once it has the same learning loop and art as the dog realm (see `LAUNCH_OPEN` in `index.html`). To play them anyway for QA, add `?all=1` to the URL.

## Built on real psychology

Mira is a game shell around genuine CBT graded-exposure mechanics:

- **An alarm that falls while you stay** — the live wave rises as you close in and comes down on its own if you don't leave; a trial ends when it has settled, not on a timer
- **Predict → face → compare** — name what your fear expects the dog to do, then check it against what happened (expectancy violation)
- **Reading the dog** — relaxed, alert, or asking for space, from real canine body language
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
npm run smoke                  # ~50 s: plays the first run + trial 1 in headless Chrome
```

The same smoke test runs as a git `pre-push` hook (`git config core.hooksPath .githooks`, already set in this clone). Skip it once with `SKIP_SMOKE=1 git push`. `SMOKE_SHOTS=1` keeps screenshots in `.smoke-shots/`.

After re-baking dog coats, run `npm run compress-textures` — the game loads the JPEG copies.

## Feedback

Players can write feedback from the menu, Settings, About, and after every trial. Nothing is sent automatically. Set `FEEDBACK_URL` in `index.html` to a form link (Google Form, Tally…) to add an "Open the form" button; until then it's copy-only.
