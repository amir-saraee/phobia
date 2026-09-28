# Mira — The Courage Journey 🏕

**A tiny game about big fears.** Free, in your browser, English + فارسی.

**Play it:** https://phobia-kappa.vercel.app/

## What's in it now

Six realms, five 3D trials each. Three have animals that read how you move; three are places that don't move at all — which is the point:

| Realm | Fear | The ladder |
|---|---|---|
| 🐕 The Meadow Yard | Dogs (cynophobia) | a small dog busy across the room → a big, loud, excited one that bounds over |
| 🕷 The Old Cellar | Spiders (arachnophobia) | a house spider far off → a huntsman on the wall at eye level (real sizes, 8–26 cm; hold **Z** to look closer) |
| 🐍 The Sunlit Clearing | Snakes (ophidiophobia) | a grass snake basking far off → close, coiled and alert on the path |
| 🏙 The Summit | Heights (acrophobia) | a knee-high ledge over a square → a glass skywalk 165 m up at dusk |
| 🌙 The House at Night | The dark (nyctophobia) | your bedroom with the lamp on → total dark, only the house's sounds (hold **F** for a flashlight — the coach counts what it does) |
| 🚪 The Narrow Passage | Tight spaces (claustrophobia) | a small room, door closed behind you → a phone booth → a lift → a storage closet → lying in an MRI scanner |

Every trial has **three stars** — its skill (let the dog come to you, stand on the glass…), reading the moment, and staying until the alarm settles — earned live in the scene and kept as your best on the map, so there's always a reason to go back (repetition is the part of exposure that does the work). Stars only ever reward approach and attention, never speed or a low rating. Face all of a dog's trials and it comes to rest by your campfire.

Your custom character walks every scene. In the place realms the coach reads your body and the room instead of an animal: name a tight breath, a creak or a gust as *body*, *place* or *danger*. Nothing in them ever moves toward you — the walls stay put and the door always opens (opening it counts as relief, not learning). The older prototype realms (water, flying…) are still behind `LAUNCH_OPEN` in `index.html`; add `?all=1` to the URL to play them for QA.

## Built on real psychology

Mira is a game shell around genuine CBT graded-exposure mechanics:

- **An alarm that falls while you stay** — the live wave rises as you close in and comes down on its own if you don't leave; a trial ends when it has settled, not on a timer
- **Predict → face → compare** — name what your fear expects ("it'll run at me", "I'll run out of air", "something is in the room"), then check it against what the scene saw happen (expectancy violation)
- **Reading the moment** — a dog relaxed / alert / asking for space; a spider resting / going somewhere / startled; a snake at ease / curious / defensive; and in the place realms, telling a body alarm from the building's ordinary noise from a real danger — collected in a field guide per realm
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
npm run smoke                  # ~3 min: first run + dog trials + a spider, snake, heights, dark and tight-space trial, headless
```

The same smoke test runs as a git `pre-push` hook (`git config core.hooksPath .githooks`, already set in this clone). Skip it once with `SKIP_SMOKE=1 git push`. `SMOKE_SHOTS=1` keeps screenshots in `.smoke-shots/`.

After re-baking dog coats, run `npm run compress-textures` — the game loads the JPEG copies.

## Feedback

Players can write feedback from the menu, Settings, About, and after every trial. Nothing is sent automatically. Set `FEEDBACK_URL` in `index.html` to a form link (Google Form, Tally…) to add an "Open the form" button; until then it's copy-only.
