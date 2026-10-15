// Every 3D realm, keyed like PHOBIAS in the app shell. Each realm's scene code
// is its own module, fetched the first time the realm is entered — a visit
// only pays for the realms it actually plays.

export const REALMS = {
  heights:  () => import("./heights.js").then((m) => m.setupHeights),
  water:    () => import("./water.js").then((m) => m.setupWater),
  dogs:     () => import("./dogs.js").then((m) => m.setupDogs),
  spiders:  () => import("./spiders.js").then((m) => m.setupSpiders),
  enclosed: () => import("./enclosed.js").then((m) => m.setupEnclosed),
  flying:   () => import("./flying.js").then((m) => m.setupFlying),
  needles:  () => import("./needles.js").then((m) => m.setupNeedles),
  snakes:   () => import("./snakes.js").then((m) => m.setupSnakes),
  speaking: () => import("./speaking.js").then((m) => m.setupSpeaking),
  driving:  () => import("./driving.js").then((m) => m.setupDriving),
  storms:   () => import("./storms.js").then((m) => m.setupStorms),
  dark:     () => import("./dark.js").then((m) => m.setupDark),
};
