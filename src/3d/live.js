// The live trial: what mount() built, or null between trials. Read it
// anywhere; only the engine sets it, through setActive().

let active = null;
function setActive(v) { active = v; }

export { active, setActive };
