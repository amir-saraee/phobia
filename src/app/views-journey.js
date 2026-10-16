// Journey views: primers, keep-plans, arrival / traveler / landing, the realm
// picker and journey map, report, about, the 3D room and camp stages, ranks,
// journal.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// Per-realm primer content. `ns` is the translation namespace — the dog
// realm keeps its original "primer.*" keys (and their Persian), the others
// get their own. Loops are [icon, key suffix, English]; everything else is
// the same key under ns.
const PRIMERS = {
  dogs: {
    ns: "primer",
    aria: "How a fear of dogs works",
    kicker: "🧭 One minute before the yard",
    title: "How a fear of dogs works — and how it unwinds",
    lede: "A phobia is an alarm that learned the wrong lesson. It isn't weakness, and it isn't permanent: alarms can learn again.",
    trap: [["🐕", "t1", "A dog appears"], ["💭", "t2", "“It's going to bite me.”"], ["💓", "t3", "The alarm fires: heart, breath, legs"],
      ["🏃", "t4", "You cross the street"], ["😮‍💨", "t5", "Relief — the alarm switches off"],
      ["🔁", "t6", "Your brain files it as “escaped just in time”. The next dog sets it off sooner."]],
    out: [["🐕", "o1", "A dog appears"], ["🧪", "o2", "“It'll bite me?” — a guess, and you test it"], ["💓", "o3", "The alarm fires — and you stay"],
      ["📉", "o4", "It peaks, then falls on its own"], ["👁", "o5", "You watch what the dog actually does"],
      ["🌱", "o6", "New memory: “dogs are mostly fine.” The next dog hits softer."]],
    simH: "Try it: three dogs in a row. What do you do when the alarm spikes?",
    unit: ["dog 1", "dog 2", "dog 3"],
    leaveNote: "Relief every time — and every next dog hits <b>harder</b>. Escape works for a minute and costs you the next encounter.",
    stayNote: "Up, then down on its own — and every next dog hits <b>softer</b>. Same alarm, learning. That's exposure.",
    whereH: "Where it comes from",
    where: "A scary moment with a dog, watching someone else's fear, or being told dogs are dangerous — any of these can start it. Many people don't remember how it began. It unlearns the same way either way.",
    practH: "What you'll practise here",
    pract: "👁 Reading dogs — relaxed, alert, or asking for space.<br>〰 Letting the alarm rise and fall without leaving.<br>🧪 Testing what your fear predicts against what the dog does.",
    foot: "This is practice for curiosity and courage, not therapy — but it's the same method therapists use. If a dog has really hurt you, do this alongside a professional.",
  },
  spiders: {
    ns: "primer.sp",
    aria: "How a fear of spiders works",
    kicker: "🧭 One minute before the cellar",
    title: "How a fear of spiders works — and how it unwinds",
    lede: "A phobia is an alarm that learned the wrong lesson. Spider fear is one of the most common there is — and one of the most treatable.",
    trap: [["🕷", "t1", "A spider appears"], ["💭", "t2", "“It's coming for me. It'll get on me.”"], ["💓", "t3", "The alarm fires: skin crawls, heart jumps"],
      ["🏃", "t4", "You leave the room — or someone else deals with it"], ["😮‍💨", "t5", "Relief — the alarm switches off"],
      ["🔁", "t6", "Your brain files it as “got away just in time”. The next spider sets it off sooner — even a picture of one."]],
    out: [["🕷", "o1", "A spider appears"], ["🧪", "o2", "“It'll run at me?” — a guess, and you test it"], ["💓", "o3", "The alarm fires — and you stay"],
      ["📉", "o4", "It peaks, then falls on its own"], ["👁", "o5", "You watch where it actually goes (mostly: away, or nowhere)"],
      ["🌱", "o6", "New memory: “spiders keep to themselves.” The next one hits softer."]],
    simH: "Try it: three spiders in a row. What do you do when the alarm spikes?",
    unit: ["spider 1", "spider 2", "spider 3"],
    leaveNote: "Relief every time — and every next spider hits <b>harder</b>. Leaving works for a minute and costs you the next encounter.",
    stayNote: "Up, then down on its own — and every next spider hits <b>softer</b>. Same alarm, learning. That's exposure.",
    whereH: "Where it comes from",
    where: "Often it's learned by watching — a parent who screamed at spiders teaches it without a word. Sometimes it's a single startle. The quick, unpredictable movement does the rest. It unlearns the same way however it began.",
    practH: "What you'll practise here",
    pract: "👁 Reading spiders — resting, on its way somewhere, or startled.<br>〰 Letting the alarm rise and fall without leaving.<br>🧪 Testing what your fear predicts against where the spider actually goes.",
    foot: "This is practice for curiosity and courage, not therapy — but it's the same method therapists use, and for spider fear it works unusually well.",
  },
  snakes: {
    ns: "primer.sn",
    aria: "How a fear of snakes works",
    kicker: "🧭 One minute before the clearing",
    title: "How a fear of snakes works — and how it unwinds",
    lede: "Humans come primed to notice snakes fast — that part is ancient and useful. A phobia is when the alarm won't stand down, even for a harmless one far away.",
    trap: [["🐍", "t1", "A snake — or a rope, or a hose — appears"], ["💭", "t2", "“It'll strike. It'll come after me.”"], ["💓", "t3", "The alarm fires: freeze, then run"],
      ["🏃", "t4", "You avoid the path, the park, the whole trip"], ["😮‍💨", "t5", "Relief — the alarm switches off"],
      ["🔁", "t6", "Your brain files it as “that was close”. Every long thin shape starts setting it off."]],
    out: [["🐍", "o1", "A snake appears"], ["🧪", "o2", "“It'll strike at me?” — a guess, and you test it"], ["💓", "o3", "The alarm fires — and you stay, at a distance you choose"],
      ["📉", "o4", "It peaks, then falls on its own"], ["👁", "o5", "You watch what the snake actually does (mostly: basks, or leaves)"],
      ["🌱", "o6", "New memory: “snakes want to be left alone.” The next one hits softer."]],
    simH: "Try it: three snakes in a row. What do you do when the alarm spikes?",
    unit: ["snake 1", "snake 2", "snake 3"],
    leaveNote: "Relief every time — and every next snake hits <b>harder</b>. Avoiding works for a minute and costs you the next encounter.",
    stayNote: "Up, then down on its own — and every next snake hits <b>softer</b>. Same alarm, learning. That's exposure.",
    whereH: "Where it comes from",
    where: "We're born ready to spot snakes quickly — but not to panic at them. The panic is learned: a scare on a path, a warning repeated as a child, a film. It unlearns the same way however it began.",
    practH: "What you'll practise here",
    pract: "👁 Reading snakes — at ease, curious, or asking for room.<br>〰 Letting the alarm rise and fall without leaving.<br>🧪 Testing what your fear predicts against what the snake actually does.",
    foot: "This is practice for curiosity and courage, not therapy. In real life, respect wild snakes from a distance — watching, not handling, is the skill.",
  },
  heights: {
    ns: "primer.h",
    aria: "How a fear of heights works",
    kicker: "🧭 One minute before the summit",
    title: "How a fear of heights works — and how it unwinds",
    lede: "Some wariness of edges is built in and sensible. A phobia is when the alarm fires on every balcony, ladder and glass lift — and treats its own sensations as proof you're about to fall.",
    trap: [["🏔", "t1", "You're somewhere high"], ["💭", "t2", "“I'm going to fall. My legs won't hold.”"], ["💓", "t3", "The alarm fires: jelly legs, a pull, the view swims"],
      ["🏃", "t4", "You back away, grip the rail, look anywhere but down"], ["😮‍💨", "t5", "Relief — the alarm switches off"],
      ["🔁", "t6", "Your brain files it as “that was close”. The next height sets it off sooner — even a step-stool."]],
    out: [["🏔", "o1", "You're somewhere high"], ["🧪", "o2", "“I'll fall?” — a guess, and you test it"], ["💓", "o3", "The alarm fires — and you stay, rail or no rail"],
      ["📉", "o4", "It peaks, then falls on its own"], ["👁", "o5", "You notice: the legs held, the pull passed, the rail held"],
      ["🌱", "o6", "New memory: “high isn't the same as falling.” The next height hits softer."]],
    simH: "Try it: three high places in a row. What do you do when the alarm spikes?",
    unit: ["height 1", "height 2", "height 3"],
    leaveNote: "Relief every time — and every next height hits <b>harder</b>. Backing off works for a minute and costs you the next one.",
    stayNote: "Up, then down on its own — and every next height hits <b>softer</b>. Same alarm, learning. That's exposure.",
    whereH: "Where it comes from",
    where: "A fall or a scare, a parent who was afraid of edges, or no clear start at all — people who lean on their eyes more than their inner ear for balance feel heights more. It unlearns the same way however it began.",
    practH: "What you'll practise here",
    pract: "💓 Telling your body's alarm from a real danger.<br>〰 Letting the alarm rise and fall without stepping back.<br>🧪 Testing what your fear predicts against what actually happens.",
    foot: "This is practice for curiosity and courage, not therapy — but it's the same method therapists use, and for heights it's among the most studied. Real-world edges: stay behind real railings.",
  },
  dark: {
    ns: "primer.d",
    aria: "How a fear of the dark works",
    kicker: "🧭 One minute before the lights go out",
    title: "How a fear of the dark works — and how it unwinds",
    lede: "The dark itself can't hurt you — it's what the mind puts in it. Fear of the dark is an alarm about the unknown, and it's common at every age.",
    trap: [["🌙", "t1", "The lights go off"], ["💭", "t2", "“Something's in here. What was that noise?”"], ["💓", "t3", "The alarm fires: every creak is someone"],
      ["💡", "t4", "You switch the light on, check the corners, keep a lamp lit"], ["😮‍💨", "t5", "Relief — the alarm switches off"],
      ["🔁", "t6", "Your brain files it as “good thing I could see”. Darkness gets scarier, not easier."]],
    out: [["🌙", "o1", "The lights go off"], ["🧪", "o2", "“Something's here?” — a guess, and you test it"], ["💓", "o3", "The alarm fires — and you stay, light off"],
      ["📉", "o4", "It peaks, then falls on its own"], ["👁", "o5", "You name what you hear and see: the house, and your own mind"],
      ["🌱", "o6", "New memory: “the dark is just a room without light.” The next night hits softer."]],
    simH: "Try it: three nights in a row. What do you do when the alarm spikes?",
    unit: ["night 1", "night 2", "night 3"],
    leaveNote: "Relief every time — and every next night hits <b>harder</b>. The light works for a minute and costs you the next one.",
    stayNote: "Up, then down on its own — and every next night hits <b>softer</b>. Same alarm, learning. That's exposure.",
    whereH: "Where it comes from",
    where: "Nearly every child is afraid of the dark for a while — it's a normal stage. For some it sticks, often kept alive by never letting a room go fully dark. It unlearns the same way however it began.",
    practH: "What you'll practise here",
    pract: "🏠 Naming what's really there: the house, or your mind filling the gaps.<br>〰 Letting the alarm rise and fall with the light off.<br>🧪 Testing what your fear predicts against what actually happens.",
    foot: "This is practice for curiosity and courage, not therapy — but it's the same method therapists use. If the dark brings back something that really happened, do this alongside a professional.",
  },
  enclosed: {
    ns: "primer.e",
    aria: "How a fear of tight spaces works",
    kicker: "🧭 One minute before the passage",
    title: "How a fear of tight spaces works — and how it unwinds",
    lede: "Claustrophobia is an alarm about being trapped or running out of air. Its sensations are real — tight breath, heat, the urge to get out — and they are not a sign that anything is wrong.",
    trap: [["🚪", "t1", "A small space — a lift, a cupboard, a scanner"], ["💭", "t2", "“I can't breathe. I'm trapped.”"], ["💓", "t3", "The alarm fires: tight chest, hot face, the walls feel close"],
      ["🏃", "t4", "You get out, take the stairs, keep the door open"], ["😮‍💨", "t5", "Relief — the alarm switches off"],
      ["🔁", "t6", "Your brain files it as “got out just in time”. The next small space sets it off sooner."]],
    out: [["🚪", "o1", "A small space"], ["🧪", "o2", "“No air?” — a guess, and you test it"], ["💓", "o3", "The alarm fires — and you stay, door closed"],
      ["📉", "o4", "It peaks, then falls on its own"], ["👁", "o5", "You notice: you're breathing, the walls are still, the door opens"],
      ["🌱", "o6", "New memory: “small isn't the same as trapped.” The next space hits softer."]],
    simH: "Try it: three small spaces in a row. What do you do when the alarm spikes?",
    unit: ["space 1", "space 2", "space 3"],
    leaveNote: "Relief every time — and every next space hits <b>harder</b>. Getting out works for a minute and costs you the next one.",
    stayNote: "Up, then down on its own — and every next space hits <b>softer</b>. Same alarm, learning. That's exposure.",
    whereH: "Where it comes from",
    where: "Being stuck somewhere as a child, a panic attack in a lift, or no clear start at all. People who keep a lot of personal space around them feel it more. It unlearns the same way however it began.",
    practH: "What you'll practise here",
    pract: "💓 Telling your body's alarm from a real problem.<br>〰 Letting the alarm rise and fall with the door closed.<br>🧪 Testing what your fear predicts against what actually happens.",
    foot: "This is practice for curiosity and courage, not therapy — but it's the same method therapists use. If you have a scan coming up, tell the staff; they can help.",
  },
};
function openDogPrimer(opts = {}) { return openPrimer("dogs", opts); }
function openPrimer(key, opts = {}) {
  const P = PRIMERS[key] || PRIMERS.dogs;
  const k = (suffix, en) => t(`${P.ns}.${suffix}`, en);
  const overlay = document.createElement("div");
  overlay.className = "goal-modal-overlay";
  const loop = (items, cls) => `<ol class="pr-loop ${cls}">${items.map((x) => `<li><span class="pr-ic">${x[0]}</span><span>${k(x[1], x[2])}</span></li>`).join("")}</ol>`;
  overlay.innerHTML = `
    <div class="goal-modal primer-modal" role="dialog" aria-label="${escapeHtml(k("aria", P.aria))}">
      <span class="bridge-invite-kicker">${k("kicker", P.kicker)}</span>
      <h3 style="margin:6px 0 4px">${k("title", P.title)}</h3>
      <p class="small pr-lede">${k("lede", P.lede)}</p>
      <div class="pr-cols">
        <div class="pr-col pr-trap">
          <h4>${t("primer.trapH", "The trap")}</h4>
          ${loop(P.trap, "trap")}
        </div>
        <div class="pr-col pr-out">
          <h4>${t("primer.outH", "The way out")}</h4>
          ${loop(P.out, "out")}
        </div>
      </div>
      <div class="pr-sim">
        <div class="pr-sim-head">${k("simH", P.simH)}</div>
        <svg viewBox="0 0 320 96" class="pr-svg" aria-hidden="true">
          <line x1="6" y1="88" x2="314" y2="88" stroke="rgba(255,255,255,.12)"/>
          <text x="58" y="94" font-size="8" fill="#94a3b8" text-anchor="middle">${k("dog1", P.unit[0])}</text>
          <text x="160" y="94" font-size="8" fill="#94a3b8" text-anchor="middle">${k("dog2", P.unit[1])}</text>
          <text x="262" y="94" font-size="8" fill="#94a3b8" text-anchor="middle">${k("dog3", P.unit[2])}</text>
          <path class="pr-curve" d="" fill="none" stroke="#f5b04b" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
        </svg>
        <div class="pr-sim-btns">
          <button type="button" class="btn-ghost pr-leave">${t("primer.leave", "↩ Leave when it spikes")}</button>
          <button type="button" class="btn-ghost pr-stay">${t("primer.stay", "🧍 Stay until it falls")}</button>
        </div>
        <p class="pr-sim-note small">${t("primer.simHint", "Pick one and watch the alarm.")}</p>
      </div>
      <div class="pr-grid">
        <div><b>${k("whereH", P.whereH)}</b><span>${k("where", P.where)}</span></div>
        <div><b>${k("practH", P.practH)}</b><span>${k("pract", P.pract)}</span></div>
      </div>
      <p class="small pr-foot">${k("foot", P.foot)}</p>
      <div class="actions" style="margin-top:12px">
        <button class="btn-ghost" id="prClose">${opts.then ? t("primer.later", "Skip for now") : t("primer.close", "Close")}</button>
        ${opts.then ? `<button class="btn-primary" id="prGo">${t("primer.go", "Got it — to the first trial")}</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(overlay);
  markPrimerSeen(key);
  // The sim: three encounters. Leave = relief now, a higher spike next time.
  // Stay = rise, peak, fall — and each next wave starts lower.
  const path = overlay.querySelector(".pr-curve"), note = overlay.querySelector(".pr-sim-note");
  const X = (i) => 6 + i * (308 / 90);
  const Y = (v) => 86 - v * 0.74;
  const build = (mode) => {
    const pts = [];
    const peaks = mode === "leave" ? [78, 90, 98] : [78, 56, 36];
    for (let e = 0; e < 3; e++) {
      const x0 = e * 30;
      for (let kk = 0; kk <= 30; kk++) {
        let v;
        if (mode === "leave") v = kk < 6 ? peaks[e] * (kk / 6) : kk < 8 ? peaks[e] * (1 - (kk - 6) / 2) : 0;
        else v = kk < 6 ? peaks[e] * (kk / 6) : peaks[e] * Math.exp(-(kk - 6) / 8) + 4;
        pts.push(`${X(x0 + kk).toFixed(1)},${Y(Math.max(0, v)).toFixed(1)}`);
      }
    }
    return "M" + pts.join(" L");
  };
  const run = (mode) => {
    path.setAttribute("d", build(mode));
    path.setAttribute("stroke", mode === "leave" ? "#ef6b5b" : "#7cd1c5");
    const L = path.getTotalLength ? path.getTotalLength() : 600;
    path.style.transition = "none";
    path.style.strokeDasharray = L; path.style.strokeDashoffset = L;
    void path.getBoundingClientRect();
    path.style.transition = "stroke-dashoffset 2.6s ease-in-out";
    path.style.strokeDashoffset = "0";
    note.innerHTML = mode === "leave" ? k("leaveNote", P.leaveNote) : k("stayNote", P.stayNote);
  };
  overlay.querySelector(".pr-leave").onclick = () => run("leave");
  overlay.querySelector(".pr-stay").onclick = () => run("stay");
  const close = () => overlay.remove();
  overlay.querySelector("#prClose").onclick = () => { close(); if (opts.then && opts.skipGoes) opts.then(); };
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  const go2 = overlay.querySelector("#prGo");
  if (go2) go2.onclick = () => { close(); opts.then(); };
}
// Keeping the yard open: what to do once the realm is behind you. Relapse
// prevention was missing entirely — "this realm is behind you" read as cured.
const KEEP_PLANS = {
  dogs: { ns: "keep", kicker: "🌿 Keep the yard open",
    l1: "<b>Meet a dog every week.</b> Any dog, any size, any distance. New dogs and new places teach the lesson more widely than the same one twice.",
    l2: "<b>Drop the last safety habits.</b> Keeping a dog in sight at all times, holding someone's arm, checking the street first — try each thing once without it." },
  spiders: { ns: "keep.sp", kicker: "🌿 Keep the cellar open",
    l1: "<b>Look for a spider every week, on purpose.</b> A web in a window corner, one on the garden wall, a photo you'd have scrolled past. Different spiders in different places teach the lesson more widely.",
    l2: "<b>Drop the last safety habits.</b> Checking the bed, shaking out shoes, leaving the room until someone else deals with it — try each thing once without it." },
  heights: { ns: "keep.h", kicker: "🌿 Keep the view open",
    l1: "<b>Go up somewhere every week.</b> A top-floor window, a footbridge, a multi-storey car park, a hill. Different heights in different places teach the lesson more widely.",
    l2: "<b>Drop the last safety habits.</b> Gripping the rail, not looking down, staying away from windows — try each thing once without it." },
  dark: { ns: "keep.d", kicker: "🌿 Keep the lights off",
    l1: "<b>Let a room go dark on purpose, often.</b> Switch off the hall light, walk through the house before turning a lamp on, sit outside after sunset.",
    l2: "<b>Drop the last safety habits.</b> The night-light, the phone torch, checking the wardrobe — try each thing once without it." },
  enclosed: { ns: "keep.e", kicker: "🌿 Keep the doors closed",
    l1: "<b>Choose small spaces on purpose.</b> Take the lift, sit in the middle of the row, close the bathroom door. New spaces teach the lesson more widely.",
    l2: "<b>Drop the last safety habits.</b> Standing by the door, checking the exits, keeping a door ajar — try each thing once without it." },
  snakes: { ns: "keep.sn", kicker: "🌿 Keep the path open",
    l1: "<b>Meet snakes on purpose, now and then.</b> A reptile house, a nature film with the sound on, a walk on a trail you used to avoid. New places teach the lesson more widely.",
    l2: "<b>Drop the last safety habits.</b> Scanning every step, refusing long grass, turning down trips — try each thing once without it. (Real-world respect stays: watch wild snakes, don't handle them.)" },
};
function openKeepPlan(key = "dogs") {
  const K = KEEP_PLANS[key] || KEEP_PLANS.dogs;
  const k = (suffix, en) => t(`${K.ns}.${suffix}`, en);
  const overlay = document.createElement("div");
  overlay.className = "goal-modal-overlay";
  overlay.innerHTML = `
    <div class="goal-modal primer-modal" role="dialog" aria-label="${escapeHtml(t("keep.aria", "Keeping it"))}">
      <span class="bridge-invite-kicker">${k("kicker", K.kicker)}</span>
      <h3 style="margin:6px 0 8px">${t("keep.title", "Fear fades with use — so keep using it")}</h3>
      <ul class="keep-list">
        <li>${k("l1", K.l1)}</li>
        <li>${k("l2", K.l2)}</li>
        <li>${key === "dogs"
          ? t("keep.l3", "<b>A bad day is a lapse, not a relapse.</b> A loud dog or a rough week can bring the alarm back for a while. That's normal. Go back one rung, and climb again — it comes back faster the second time.")
          : t("keep.l3any", "<b>A bad day is a lapse, not a relapse.</b> A startling encounter or a rough week can bring the alarm back for a while. That's normal. Go back one rung, and climb again — it comes back faster the second time.")}</li>
        <li>${t("keep.l4", "<b>Re-check the Mirror in a month.</b> The number out there is the one that matters.")}</li>
      </ul>
      <div class="actions" style="margin-top:12px"><button class="btn-primary" id="kpClose">${t("keep.ok", "Keep it")}</button></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector("#kpClose").onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}
function handleRateSubmit(d, params) {
  const phobia = d.phobia;
  const level = parseInt(d.level, 10);
  // Read directly from the slider for robustness; fall back to the displayed value, then 0.
  const slider = document.getElementById("suds");
  const text = document.getElementById("sudsValue");
  let suds = NaN;
  if (slider) suds = parseInt(slider.value, 10);
  if (Number.isNaN(suds) && text) suds = parseInt(text.textContent, 10);
  if (Number.isNaN(suds)) suds = 0;
  // Pull and clear the prediction made before this rung
  const predicted = (pendingPrediction && pendingPrediction.phobia === phobia && pendingPrediction.level === level)
    ? pendingPrediction.predicted : null;
  pendingPrediction = null;
  // Within-rung PEAK distress (0–10). Self-report wins; the scene's modelled
  // fear is the fallback for a rating screen that somehow lacks the slider.
  //
  // This number matters more than it looks. The prediction screen asks how
  // anxious you expect to feel DURING the trial, so the peak is the only
  // quantity that can honestly answer it. Scoring the prediction against the
  // post-trial "right now" reading instead — which is what used to happen —
  // compares an expectation of the worst moment against a measurement taken
  // after the worst moment has passed. Anxiety falls once an exposure ends,
  // so that comparison came out "you over-predicted!" almost every time,
  // regardless of what the user actually experienced. Expectancy violation
  // only teaches the brain anything when the mismatch is real; manufacturing
  // it produces a number the user knows is wrong, which costs the app the
  // credibility the whole method runs on. It also flatly contradicted the
  // habituation card directly beneath it, which was already reporting the
  // true peak.
  const peakSlider = document.getElementById("sudsPeak");
  let peak = peakSlider ? parseInt(peakSlider.value, 10) : NaN;
  if (Number.isNaN(peak)) peak = Math.round(Math.min(100, Math.max(0, lastRungPeakFear)) / 10);
  // A peak below the end-of-trial reading is self-contradictory; trust the
  // higher of the two rather than showing the user an impossible record.
  peak = Math.max(peak, suds);
  lastRungPeakFear = 0;
  // Attach the hold outcome (finished vs early exit) written by the hold timer.
  const outcome = lastRungOutcome;
  lastRungOutcome = null;
  // The feared outcome named at the gate, and what the scene saw happen —
  // both kept on the log entry so the reality check (and the report) can
  // compare them, and so the belief re-rate has somewhere to live.
  const extra = {};
  const exp = (pendingExpect && pendingExpect.phobia === phobia && pendingExpect.level === level) ? pendingExpect : null;
  pendingExpect = null; window.__pendingExpect = null;
  if (exp) extra.expect = { fear: exp.fear, belief: exp.belief, beliefAfter: null };
  const ev = window.__lastTrialEvidence;
  if (ev && ev.phobia === phobia && ev.level === level && Date.now() - (ev.ts || 0) < 45 * 60 * 1000) {
    extra.ev = {
      dog: ev.dog, barks: ev.barks, ranAtYou: ev.ranAtYou, cameClose: ev.cameClose, jumped: ev.jumped, bit: ev.bit,
      minDist: ev.minDist, stareSec: ev.stareSec, escapes: ev.escapes, reads: ev.reads, readsRight: ev.readsRight,
      signals: (ev.signals || []).slice(0, 16), peak: ev.peak, end: ev.end, settledAt: ev.settledAt,
      kinds: ev.kinds || {}, notes: ev.notes || {},
      engagedSec: ev.engagedSec, dur: Math.round((ev.wave || []).length * 0.5),
      wave: downsampleWave(ev.wave, 60), marks: (ev.marks || []).filter((m) => m.kind !== "read").slice(-40),
    };
    if (Array.isArray(ev.goals) && ev.goals.length) {
      extra.stars = Math.max(0, Math.min(3, ev.stars | 0));
      extra.goals = ev.goals.slice(0, 3).map((g) => ({ id: g.id, done: !!g.done, text: String(g.text || "").slice(0, 90) }));
    }
  }
  window.__lastTrialEvidence = null;
  markCompleted(phobia, level, suds, predicted, peak, outcome, extra);
  go("complete", { phobia, level, suds, predicted, peak });
}

// ---------- Views ----------
// The title screen is a scroll-told story. Each "beat" is a near-full-screen
// frame that lights up as it enters the viewport; the shadow creature grows
// while the story explains how avoidance feeds fear, then shrinks when the
// story reaches "face it". The psychology arrives as story, not syllabus.
function starfieldHTML(n) {
  let out = "";
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 100).toFixed(2);
    const y = (Math.random() * 100).toFixed(2);
    const s = (Math.random() * 1.6 + 0.8).toFixed(2);
    const d = (Math.random() * 6).toFixed(2);
    const o = (Math.random() * 0.5 + 0.3).toFixed(2);
    out += `<i class="star" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;--tw:${d}s;--o:${o}"></i>`;
  }
  return out;
}

// The arrival screen: the room, immediately.
//
// What this replaces was a six-beat vertical story — kicker, headline, body
// copy, chapter dots — over a decorative 3D backdrop, with the actual game
// four taps and a realm-picker away. On a phone that is a lot of reading
// before anything is playable, and the thing being described (a room with a
// dog in it) was sitting right there behind the text the whole time.
//
// So: no prose, no chapters, no realm grid. The Meadow Yard fills the screen,
// one line names it, one button walks in. The honesty copy the app owes the
// player has not gone anywhere — it is the consent gate that follows, where
// it is read rather than scrolled past.
// The title screen's backdrop: the valley at night, drawn in SVG. It used to
// be the creator's 3D room — empty, no dog in it, and a WebGL context booted
// on every first visit just to show a window. This is the place the story is
// about: six dark lanterns up one winding path, one per fear. A lantern burns
// once its realm is walked, and the next one flickers, waiting.
//
// The composition is held to the middle ~460 units so a portrait phone
// (which slices the 1600-wide view down to that) still sees all six.
const VALLEY_KEYS = ["dogs", "spiders", "snakes", "heights", "dark", "enclosed"];
function valleyHeroSVG({ lit = [], next = null } = {}) {
  let seed = 7;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const stars = Array.from({ length: 90 }, () => {
    const x = (R() * 1600).toFixed(0), y = (R() * 360).toFixed(0);
    const r = (R() * 1.6 + 0.5).toFixed(1), o = (R() * 0.55 + 0.25).toFixed(2);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${o}"${R() < 0.3 ? ` class="vh-tw" style="--d:${(2 + R() * 4).toFixed(1)}s"` : ""}/>`;
  }).join("");
  // Nearest first: the dog lantern is where the path begins.
  const spots = [[905, 650, 1], [700, 592, .8], [880, 540, .64], [742, 500, .5], [852, 466, .4], [784, 441, .32]];
  const lanterns = spots.map(([x, y, s], i) => {
    const key = VALLEY_KEYS[i];
    const on = lit.includes(key);
    const waiting = !on && key === next;
    return `<g class="vh-lantern${on ? " on" : ""}${waiting ? " waiting" : ""}" data-k="${key}" transform="translate(${x} ${y}) scale(${s})">
      <circle class="vh-glow" cx="16" cy="-112" r="74" fill="url(#vhGlow)"/>
      <path d="M0 0 V-150 M-4 -150 H22 M18 -150 V-140" stroke="#151826" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path class="vh-glass" d="M6 -138 h20 l4 7 v26 l-4 6 h-20 l-4 -6 v-26z" stroke="#262a3b" stroke-width="2.5"/>
      <path class="vh-flame" d="M16 -128 q8 9 0 18 q-8 -9 0 -18z"/>
      <ellipse cx="0" cy="2" rx="16" ry="4" fill="#05070f" opacity=".5"/>
    </g>`;
  }).join("");
  const dawn = Math.min(1, lit.length / 6);
  // Pines on the wide screen's flanks — outside the phone's slice, where a
  // desktop otherwise sees empty hills.
  const pine = (x, y, h) => `<path d="M${x} ${y - h} L${x + h * 0.32} ${y} H${x - h * 0.32}z"/>`;
  const pines = `<g fill="#0a1028">${[[120, 520, 90], [190, 512, 120], [260, 506, 80], [380, 492, 100], [450, 486, 70],
    [1150, 470, 80], [1230, 478, 120], [1310, 486, 90], [1420, 492, 110], [1500, 488, 76]].map(([x, y, h]) => pine(x, y, h)).join("")}</g>`;
  const flies = Array.from({ length: 9 }, (_, i) =>
    `<circle class="vh-fly" cx="${560 + R() * 480}" cy="${470 + R() * 260}" r="${(1.6 + R() * 1.8).toFixed(1)}" style="--d:${(5 + R() * 6).toFixed(1)}s;--k:${i}"/>`).join("");
  return `<svg class="valley-hero" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="vhSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#050816"/><stop offset=".55" stop-color="#141c44"/><stop offset="1" stop-color="#2a2550"/>
      </linearGradient>
      <radialGradient id="vhGlow"><stop offset="0" stop-color="#ffd98f" stop-opacity=".9"/><stop offset=".4" stop-color="#ffb24d" stop-opacity=".32"/><stop offset="1" stop-color="#ffb24d" stop-opacity="0"/></radialGradient>
      <radialGradient id="vhDawn" cx=".5" cy="1" r=".75"><stop offset="0" stop-color="#ffb070" stop-opacity="${(0.10 + dawn * 0.35).toFixed(2)}"/><stop offset="1" stop-color="#ffb070" stop-opacity="0"/></radialGradient>
      <linearGradient id="vhPath" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e9dcc0" stop-opacity=".16"/><stop offset="1" stop-color="#e9dcc0" stop-opacity=".04"/></linearGradient>
    </defs>
    <rect width="1600" height="1000" fill="url(#vhSky)"/>
    ${stars}
    <g class="vh-moon-w"><circle cx="1250" cy="168" r="34" fill="#efe6cf" opacity=".9"/><circle cx="1264" cy="160" r="31" fill="#0b1029"/></g>
    <g class="vh-moon-n"><circle cx="935" cy="300" r="26" fill="#efe6cf" opacity=".9"/><circle cx="946" cy="294" r="24" fill="#0f163a"/></g>
    <ellipse cx="800" cy="430" rx="900" ry="210" fill="url(#vhDawn)"/>
    <path d="M0 430 L120 392 L240 420 L380 360 L520 410 L640 372 L760 404 L860 366 L980 400 L1100 352 L1240 404 L1380 370 L1600 410 V1000 H0z" fill="#121935"/>
    <path d="M0 520 C200 470, 380 500, 560 470 S900 440, 1100 466 S1450 500, 1600 476 V1000 H0z" fill="#0d1330"/>
    ${pines}
    <path d="M0 700 C260 640, 520 690, 760 640 S1240 620, 1600 660 V1000 H0z" fill="#0a0f24"/>
    <path d="M676 1000 C740 860, 640 760, 758 660 S826 520, 806 436 L816 436 C840 520, 860 600, 836 680 S900 860, 940 1000z" fill="url(#vhPath)"/>
    ${lanterns}
    ${flies}
  </svg>`;
}

function viewArrival() {
  const ch = window.Character && window.Character.loadCharacter();
  const named = ch && ch.name ? escapeHtml(ch.name) : null;
  const S = window.Story;
  let lit = [], next = null;
  if (ch) {
    try {
      lit = VALLEY_KEYS.filter((k) => PHOBIAS[k] && realmStatus(k).tamed);
      next = continueTarget().key;
    } catch {}
  }
  const top = `
  <div class="mob-stage mob-valley" aria-hidden="true">${valleyHeroSVG({ lit, next })}</div>
  <div class="mob-top">
    <span class="mob-spacer"></span>
    <button class="mob-icon-btn" data-action="open-settings" aria-label="${t("a11y.settings", "Settings")}">⚙</button>
  </div>`;
  const wordmark = `
    <h1 class="lw-mark">${brandLamp()}<span>${t("brand.name", "Lanternwalk")}</span></h1>`;
  // First visit: the name, the line — and the choice they came for. Each
  // lantern is a fear; one tap (and the one-time notice) puts them in that
  // fear's first trial. It used to be "Begin the walk" → a four-page
  // prologue → a character creator with the fear buried in its first row
  // (dogs pre-selected) → a four-page chapter → a long form: twelve taps and
  // ~700 words before the thing they chose. The prologue and the creator are
  // still there — after the first trial, when they mean something.
  if (!named) {
    const open = VALLEY_KEYS.filter((k) => PHOBIAS[k] && realmOpen(k));
    const icon = { dogs: "🐕", spiders: "🕷", snakes: "🐍", heights: "🏔", dark: "🌙", enclosed: "🚪" };
    const tiles = open.map((k) => `
      <button class="fear-tile" data-action="quick-start" data-phobia="${k}">
        <span class="ft-icon" aria-hidden="true">${icon[k] || "🏮"}</span>
        <span class="ft-name">${escapeHtml(t(`phobia.${k}.label`, PHOBIAS[k].label))}</span>
        <span class="ft-realm">${escapeHtml(realmOf(k).realmName)}</span>
      </button>`).join("");
    return `${top}
  <div class="mob-hero arrive-hero">
    ${wordmark}
    <p class="lw-tagline">${t("arrive.title2", "Every fear is a path<br>you stopped walking.")}</p>
    <p class="lw-sub">${t("brand.sub", "Light it again — one small step at a time.")}</p>
  </div>
  <div class="mob-sheet arrive-sheet arrive-pick">
    <p class="arrive-story">${t("arrive.copy4", "Six lanterns went dark in this valley, one for each fear. Mira, the lantern-keeper, will walk beside you — you choose every step, and you can turn back any time.")}</p>
    <h2 class="arrive-q">${t("arrive.pickQ", "Which fear do you want to face?")}</h2>
    <div class="fear-tiles">${tiles}</div>
    <p class="arrive-promise">${t("arrive.promise", "You'll start where it's small — far away, and only as close as you choose.")}</p>
    <button class="arrive-link" data-action="open-quiz">${t("arrive.quiz2", "Not sure which fear? Take the 1-minute check")}</button>
  </div>`;
  }
  // Returning: where the story is, what happened last time, and the one
  // button that picks it up. It used to say "Continue" and always open the
  // dog realm, whatever fear the traveler had chosen.
  const tgt = continueTarget();
  const realm = realmOf(tgt.key);
  const chap = S && S.chapterOfRealm(tgt.key);
  const recap = S ? S.recapLine() : "";
  const note = S ? S.morningNoteHTML() : "";
  const nextLine = tgt.allWalked
    ? t("arrive.allWalked", "Every lantern is lit. Come back for a booster walk — or take a real step out there.")
    : tf("arrive.next", "Next: {realm} · trial {n} — {title}", { realm: escapeHtml(realm.realmName), n: tgt.level + 1, title: escapeHtml(lvTitle(tgt.key, tgt.level)) });
  return `${top}
  <div class="mob-hero mob-hero-high arrive-hero">
    <p class="lw-mark-sm">${brandLamp()}<span>${t("brand.name", "Lanternwalk")}</span></p>
    <p class="mob-hero-kicker">${escapeHtml(chap ? S.chapterLabel(chap) : realm.realmName)}</p>
    <h1 class="mob-hero-title">${tf("arrive.back", "Welcome back,<br>{name}", { name: named })}</h1>
  </div>
  <div class="mob-sheet arrive-sheet">
    ${note}
    ${recap && !note ? `<p class="arrive-recap"><span>${t("arrive.prev", "Previously")}</span> ${escapeHtml(recap)}</p>` : ""}
    <p class="arrive-next">${nextLine}</p>
    <div class="mob-thumb">
      <button class="mob-btn mob-btn-primary" data-action="story-continue">${t("arrive.ctaStory", "Continue the story")}</button>
    </div>
    <div class="mob-thumb">
      <button class="mob-btn mob-btn-ghost" data-action="go-camp">${t("arrive.camp", "🏕 Camp")}</button>
      <button class="mob-btn mob-btn-ghost" data-action="open-story">${t("arrive.story", "📖 The story")}</button>
    </div>
  </div>`;
}

// The traveler creator, standing in the room they're about to walk into.
//
// The old creator was a page of 2D SVG swatches: you assembled a flat cartoon,
// saved it, and then met a 3D figure in the trial that shared its colours and
// nothing else. Two different people. Here the thing on screen IS the rig the
// scene builds — same buildAvatarFigure, same room, same light — so what you
// dress is what walks in, and you can already see how they read at the
// distance the first trial puts you at.
//
// Draft state lives on window so the chip handlers and the 3D rebuild agree
// without threading it through the router.
let _travelerDraft = null;

function viewTraveler() {
  const C = window.Character;
  if (!C) return `<div class="panel"><p>${t("tw.unavailable", "Character kit unavailable.")}</p></div>`;
  const c = _travelerDraft || (C.loadCharacter() || C.defaultCharacter());
  _travelerDraft = c;

  const swatches = (rowKey, list, sel) => list.map(o => `
    <button class="mob-swatch" style="background:${o.hex}"
            data-tw="${rowKey}" data-val="${o.id}"
            aria-pressed="${o.id === sel}" aria-label="${escapeHtml(C.optLabel(rowKey, o))}"></button>`).join("");
  const chips = (rowKey, list, sel) => list.map(o => `
    <button class="mob-chip" data-tw="${rowKey}" data-val="${o.id}"
            aria-pressed="${o.id === sel}">${escapeHtml(C.optLabel(rowKey, o))}</button>`).join("");
  const row = (label, inner) => `
    <div class="mob-row">
      <div class="mob-row-label">${label}</div>
      <div class="mob-chips">${inner}</div>
    </div>`;

  // Which fear brings them comes first — it's the choice that decides where
  // "Walk in" goes. The look below it can be left as it is.
  // Only realms that are open; the choice can be changed any time from camp.
  const fearRow = (() => {
    const open = FEATURED.filter((k) => PHOBIAS[k] && realmOpen(k));
    if (open.length < 2) return "";
    const cur = open.includes(c.primaryPhobia) ? c.primaryPhobia : open[0];
    const icon = { dogs: "🐕", spiders: "🕷", snakes: "🐍", heights: "🏔", dark: "🌙", enclosed: "🚪" };
    return row(t("tw.fear", "What brings you here?"), open.map((k) => `
      <button class="mob-chip" data-tw="primaryPhobia" data-val="${k}" aria-pressed="${k === cur}">${icon[k] || ""} ${escapeHtml(t(`phobia.${k}.label`, PHOBIAS[k].label))}</button>`).join(""));
  })();
  return `
  <div class="mob-stage" id="travelerStage" aria-hidden="true"></div>
  <div class="mob-top">
    <button class="mob-icon-btn" data-action="arrival-back" aria-label="${t("a11y.back", "Back")}">‹</button>
    <span class="mob-top-title">${t("tw.title", "Your traveler")}</span>
    <span class="mob-spacer"></span>
    <button class="mob-icon-btn" data-action="traveler-dice" aria-label="${t("tw.random", "Randomise")}">🎲</button>
  </div>
  <div class="mob-sheet mob-sheet-compact">
    <div class="mob-sheet-grab"></div>
    ${fearRow}
    <div class="mob-row">
      <div class="mob-row-label">${t("tw.name", "Name")}</div>
      <input id="twName" class="mob-btn" style="width:100%;text-align:left;font-weight:600"
             type="text" inputmode="text" autocomplete="off" maxlength="24"
             placeholder="${t("tw.namePh", "Name your traveler")}"
             value="${escapeHtml(c.name || "")}" />
    </div>
    ${row(t("tw.body", "Body"),   chips("bodyType",  C.BODY_TYPES,  c.bodyType))}
    ${row(t("tw.skin", "Skin"),   swatches("skinTone", C.SKIN_TONES,  c.skinTone))}
    ${row(t("tw.hair", "Hair"),   chips("hairStyle", C.HAIR_STYLES, c.hairStyle))}
    ${row(t("tw.hairC", "Hair colour"), swatches("hairColor", C.HAIR_COLORS, c.hairColor))}
    ${row(t("tw.top", "Top"),     swatches("topColor",  C.TOP_COLORS,  c.topColor))}
    ${row(t("tw.eyes", "Eyes"),   swatches("eyeColor",  C.EYE_COLORS,  c.eyeColor))}
    ${row(t("tw.glasses", "Glasses"), chips("glasses", C.GLASSES, c.glasses))}
    <p style="margin:4px 0 0;font-size:12px;opacity:.6;text-align:center">${t("tw.hint", "Drag the room to turn them around")}</p>
    <div class="mob-thumb tw-cta">
      <button class="mob-btn mob-btn-primary" data-action="traveler-save">${t("tw.save", "Walk in →")}</button>
    </div>
  </div>`;
}

function viewThreshold() {
  const ch = window.Character && window.Character.loadCharacter();
  if (!ch) {
    // Deep-link with no traveler — send them to create one.
    setTimeout(() => go("character", { editing: false }), 0);
    return `<div class="landing"><div class="landing-hud"><p class="landing-copy">${t("story.needTraveler", "First, become someone.")}</p></div></div>`;
  }
  const realm = realmOf(ch.primaryPhobia);
  const fear = PHOBIAS[ch.primaryPhobia];
  // The name is optional in the creator (and "🎲 Surprise me" doesn't fill it
  // in), so plenty of travellers arrive here unnamed. Substituting the generic
  // fallback made the headline read "traveler, you named your fear." — an
  // address to nobody, lowercase, at the most personal beat in the game. When
  // there's no name, use a headline that doesn't need one.
  const rawName = ((ch.name || "") + "").trim();
  const name = escapeHtml(rawName);
  const whisper = (realm.whispers && realm.whispers[0]) || "";
  return `
  <div class="landing" id="thresholdRoot">
    <div class="landing-stage" id="landing3d" aria-hidden="true"></div>
    <div class="landing-hud">
      <p class="landing-kicker">${t("story.thresholdKicker", "the path opens")}</p>
      <h1 class="landing-title">${rawName
        ? tf("story.thresholdTitle", "{name}, you named your fear.", { name })
        : t("story.thresholdTitleAnon", "You named your fear.")}</h1>
      <p class="landing-copy">${tf("story.thresholdCopy", "The way to <em>{realm}</em> is waiting — {epithet}. {whisper}", {
        realm: escapeHtml(realm.realmName),
        epithet: escapeHtml(realm.epithet || ""),
        whisper: escapeHtml(whisper),
      })}</p>
      <div class="landing-actions">
        <button class="btn-primary btn-xl" data-action="enter-path">${tf("story.enterPath", "Step into {realm}", { realm: escapeHtml(realm.realmName) })}</button>
        <button class="btn-ghost" data-action="open-select">${t("story.seeValley", "See the whole valley")}</button>
      </div>
      ${fear ? `<p class="landing-hint">${escapeHtml(phLabel(ch.primaryPhobia))} · ${escapeHtml(phName(ch.primaryPhobia))}</p>` : ""}
    </div>
  </div>`;
}

function mountThresholdHUD() {
  // Audio unlock on first gesture; the 3D mount starts the night bed.
  const root = document.getElementById("thresholdRoot");
  if (!root) return;
  const unlock = () => { try { PhobiaAudio.unlock(); } catch {} };
  root.addEventListener("pointerdown", unlock, { once: true });
}

// The journey map: a night valley the traveler scrolls down through — the
// campfire at the top, realms along a winding dotted path, a dawn glow at the
// far end. This IS the fear menu, drawn as a place instead of a grid; each
// realm's shadow blob shrinks as its trials are faced. Route stays "#/fears".
function viewSelect() {
  const ch = window.Character && window.Character.loadCharacter();
  const keys = journeyKeys();
  const curKey = currentRealmKey();
  const totalTrials = keys.reduce((s, k) => s + PHOBIAS[k].levels.length, 0);
  const facedTrials = keys.reduce((s, k) => s + Math.min(PHOBIAS[k].levels.length, (getProgress(k).highestCompleted ?? -1) + 1), 0);
  const sparks = ch ? getSparks().length : 0;
  // Gamification surface: rank + next-goal bar, streak flame, and the daily
  // quest ("Today's step") — one obvious, low-friction action per day.
  const courage = getCourage();
  const rank = courageRank(courage);
  const rankPct = rank.next ? Math.min(100, Math.round(((courage - rank.min) / (rank.next.min - rank.min)) * 100)) : 100;
  const streak = computeStreak();
  const doneToday = state.log.some(l => l.finished !== false && isSameLocalDay(l.ts));
  // Backup nudge: this journey lives only in localStorage — one browser
  // cleanup deletes months of work. Gentle, dismissable, and only once the
  // traveler has something worth losing.
  const _lastExport = parseInt((() => { try { return localStorage.getItem("fobia.lastExportAt") || "0"; } catch { return "0"; } })(), 10);
  const _backupSnooze = parseInt((() => { try { return localStorage.getItem("fobia.backupSnooze") || "0"; } catch { return "0"; } })(), 10);
  const needBackup = state.log.length >= 5 &&
    (Date.now() - _lastExport > 14 * 864e5) &&
    (Date.now() - _backupSnooze > 7 * 864e5);

  // Campfire line: the character speaks about where they are on the journey.
  const curRealm = realmOf(curKey);
  const curProg = (getProgress(curKey).highestCompleted ?? -1) + 1;
  const campLine = !ch ? t("camp.empty", "A campfire, waiting for a traveler.")
    : facedTrials === 0 ? tf("camp.sayLine", "“{line}”", { line: curRealm.line })
    : curProg >= PHOBIAS[curKey].levels.length ? tf("camp.sayLine", "“{line}”", { line: curRealm.clearedLine })
    : tf("camp.trialWaiting", "“Trial {n} of {realm} is waiting for me.”", { n: curProg + 1, realm: curRealm.realmName });

  const nodes = keys.map((k, i) => {
    const p = PHOBIAS[k];
    const realm = realmOf(k);
    const prog = getProgress(k);
    const done = Math.min(p.levels.length, prog.highestCompleted + 1);
    const total = p.levels.length;
    const cleared = done >= total;
    const isCurrent = k === curKey;
    const remaining = 1 - done / total;   // drives the card's mist, not a monster
    const pips = Array.from({ length: total }, (_, j) =>
      `<i class="pip ${j < done ? "lit" : ""}" title="${j < done ? tf("node.pipDone", "Trial {n} — faced", { n: j + 1 }) : tf("node.pip", "Trial {n}", { n: j + 1 })}"></i>`).join("");
    // The card used to report the guardian's health ("the Hound Shadow is
    // weakening"). Nothing in the realm weakens — the traveller advances. Say
    // that instead, in their own terms, so the map and the ladder agree.
    // A realm only reads as finished once the real steps are walked too;
    // clearing five rehearsals and never meeting a dog is not the same thing.
    const rs = realmStatus(k);
    const stateLine = rs.tamed ? realm.clearedLine
      : rs.walked ? tf("node.walkedOnly", "All {total} trials faced. {n} of {s} real steps taken.", { total, n: rs.steps, s: rs.totalSteps })
      : done > 0 ? tf("node.faced", `You've faced {n} of {total} here.`, { n: done, total })
      : t("node.untouched", "You haven't set foot here yet.");
    return `
      <li class="realm-node ${i % 2 ? "side-r" : "side-l"} ${cleared ? "cleared" : ""} ${isCurrent ? "current" : ""}"
          data-action="select-phobia" data-phobia="${k}" tabindex="0" role="button"
          aria-label="${escapeHtml(tf("node.aria", "{realm} — {name}, {n} of {total} trials faced", { realm: realm.realmName, name: phName(k), n: done, total }))}">
        <div class="realm-thumb" aria-hidden="true">${phobiaThumbnail(k)}
          ${rs.tamed ? `<span class="realm-tamed">${t("node.tamed", "🕊 tamed")}</span>` : `<span class="realm-shadow" style="--rem:${remaining.toFixed(2)}"></span>`}
          ${isCurrent && ch ? `<span class="you-marker" title="${t("node.youHere", "You are here")}">${window.Character.avatarSVG(ch, 40)}<span>${t("node.you", "you")}</span></span>` : ""}
        </div>
        <div class="realm-body">
          <span class="realm-kicker">${t("realmWord", "Realm")} ${ROMAN[i] || i + 1} · ${escapeHtml(phName(k))}</span>
          <h3 class="realm-name">${escapeHtml(realm.realmName)}</h3>
          <p class="realm-epithet">${escapeHtml(realm.epithet)}</p>
          <div class="realm-pips">${pips}${(() => { const rsS = realmStars(k); return rsS.stars > 0 ? `<span class="realm-stars" title="${escapeHtml(tf("stars.aria", "{n} of {m} stars", { n: rsS.stars, m: rsS.total }))}">★ ${rsS.stars}<i>/${rsS.total}</i></span>` : ""; })()}</div>
          <p class="realm-state">${escapeHtml(stateLine)}</p>
          <span class="realm-cta">${done === 0 ? t("node.enter", "Enter the realm") : cleared ? t("node.again", "Walk it again") : t("node.continue", "Continue")} <span class="arr">→</span></span>
        </div>
      </li>`;
  }).join(`<li class="path-seg" aria-hidden="true"><i></i><i></i><i></i></li>`);

  // The valley literally brightens as shadows are tamed: a dawn glow scales
  // with the tamed-realm count — progress you can SEE in the world itself.
  const tamedCount = keys.filter(k => (getProgress(k).highestCompleted ?? -1) + 1 >= PHOBIAS[k].levels.length).length;
  return `
  <div class="jworld" id="journeyRoot">
    <div class="jw-dawnglow" aria-hidden="true" style="opacity:${(tamedCount / Math.max(1, keys.length)).toFixed(2)}"></div>
    <div class="jw-stars" aria-hidden="true">${starfieldHTML(60)}</div>
    <section class="camp">
      <div class="camp-scene" aria-hidden="true">
        <div class="camp-3d" id="camp3d"></div>
        <div class="camp-2d">
          ${ch ? `<div class="camp-char">${window.Character.avatarSVG(ch, 104)}</div>` : ""}
          <div class="campfire"><i class="flame f1"></i><i class="flame f2"></i><i class="flame f3"></i><span class="logs"></span><span class="fire-glow"></span></div>
        </div>
      </div>
      <div class="camp-bubble">${campLine}</div>
      <div class="rank-row" title="${t("rank.tip", "Courage builds your traveler rank — every trial adds to it")}">
        <span class="rank-chip">${rank.icon} ${rank.title}</span>
        <div class="rank-bar" aria-hidden="true"><div class="rank-fill" style="width:${rankPct}%"></div></div>
        <span class="rank-next">${rank.next ? tf("rank.to", "{a}/{b} ⚡ to {title}", { a: courage, b: rank.next.min, title: rank.next.title }) : t("rank.max", "highest rank reached")}</span>
      </div>
      <div class="camp-stats">
        <span class="camp-stat" title="${t("hud.courage", "Courage — earned every time you face a trial")}">${tf("camp.courage", "⚡ {n} courage", { n: courage })}</span>
        <span class="camp-stat" title="${t("camp.trialsTip", "Trials faced across the valley")}">${tf("camp.trials", "🛡 {a}/{b} trials", { a: facedTrials, b: totalTrials })}</span>
        ${(() => { const st = keys.reduce((a, k) => { const r = realmStars(k); return { s: a.s + r.stars, m: a.m + r.total }; }, { s: 0, m: 0 });
          return st.s > 0 ? `<span class="camp-stat stars-stat" title="${t("camp.starsTip", "Trial stars — three in every trial, for its skill, reading the moment, and staying")}">${tf("camp.stars", "★ {a}/{b} stars", { a: st.s, b: st.m })}</span>` : ""; })()}
        <button class="camp-stat as-btn" data-action="open-journal" title="${t("camp.sparksTip", "Book of Sparks — the wisdom you've collected")}">${tf("camp.sparks", "✦ {a}/{b} sparks", { a: sparks, b: INSIGHT_CARDS.length })}</button>
        ${streak >= 2 ? `<span class="camp-stat streak" title="${t("camp.streakTip", "Days in a row you've practiced")}">${tf("camp.streak", "🔥 {n}-day flame", { n: streak })}</span>` : ""}
        ${worldstepCount() > 0 ? `<span class="camp-stat worldsteps" title="${t("camp.realTip", "Real-world steps faced outside the game — the ones that count double")}">${tf("camp.realsteps", `🌍 {n} real step${worldstepCount() === 1 ? "" : "s"}`, { n: worldstepCount() })}</span>` : ""}
      </div>
      ${ch ? storyCampCard() : ""}
      ${needBackup ? `
      <div class="backup-nudge">
        <span>💾 ${t("camp.backup", "Your whole journey lives only on this device. One browser cleanup could erase it — take a copy?")}</span>
        <span class="backup-nudge-btns">
          <button class="btn-ghost" data-action="backup-now">${t("camp.backupNow", "Download backup")}</button>
          <button class="backup-later" data-action="backup-later">${t("camp.backupLater", "later")}</button>
        </span>
      </div>` : ""}
      ${nudgeBlock()}
      <p class="camp-hint">${keys.length === 1
        ? tf("camp.hintOne", "the path descends to {realm} ▾", { realm: realmOf(keys[0]).realmName })
        : t("camp.hint", "the path descends through the valley — choose a realm ▾")}</p>
    </section>
    <ol class="realm-list">${nodes}</ol>
    ${(() => {
      const soon = FEATURED.filter((k) => PHOBIAS[k] && !keys.includes(k));
      if (!soon.length) return "";
      return `
      <section class="jw-soon" aria-labelledby="jwSoonH">
        <h3 id="jwSoonH">${t("soon.mapH", "Further down the valley")}</h3>
        <p>${t("soon.mapP2", "More realms are being built to the same standard. Each opens here when it's ready.")}</p>
        <ul class="jw-soon-row">
          ${soon.map((k) => `<li class="jw-soon-chip"><strong>${escapeHtml(realmOf(k).realmName)}</strong><span>${escapeHtml(t(`phobia.${k}.label`, PHOBIAS[k].label))}</span><em>${t("soon.chip", "coming soon")}</em></li>`).join("")}
        </ul>
      </section>`;
    })()}
    ${(allRealmsUnlocked() || tamedCount > 0 || state.log.length) ? `<section class="jw-dawn">
      <h3>${t("dawn.h", "Beyond the valley")}</h3>
      ${tamedCount > 0 ? `<p class="jw-dawn-count">${tf("dawn.tamed", "🕊 {a} of {b} shadows tamed — the dawn is closer.", { a: tamedCount, b: keys.length })}</p>` : ""}
      ${(() => {
        // The six non-featured fears were reachable only by deep link — code
        // that works, hidden like it doesn't. They're bonus paths now: named,
        // discoverable, honestly framed as less-traveled (lighter scenes, no
        // experiment decks). journeyKeys() already promotes any of them the
        // traveler actually works on.
        const faint = allRealmsUnlocked() ? ["water", "flying", "needles", "speaking", "driving", "storms"]
          .filter((k) => PHOBIAS[k] && !keys.includes(k)) : [];
        if (!faint.length) return "";
        return `
          <p class="jw-faint-head">${t("dawn.faintP", "Six fainter paths also cross these hills — less traveled, still real:")}</p>
          <div class="jw-faint-row">
            ${faint.map((k) => `<button class="jw-faint" data-action="select-phobia" data-phobia="${k}">${escapeHtml(t(`phobia.${k}.label`, PHOBIAS[k].label))}</button>`).join("")}
          </div>`;
      })()}
      ${allRealmsUnlocked() ? `<p>${t("dawn.p", "Fears the map doesn't know yet — forge your own path for them.")}</p>` : ""}
      <div class="actions" style="justify-content:center">
        ${allRealmsUnlocked() ? `<button class="btn-ghost" data-action="open-custom">${t("dawn.forge", "🛠 Forge a custom fear")}</button>` : ""}
        ${state.log.length ? `<button class="btn-ghost" data-action="open-insights">${t("dawn.story", "📜 Your story so far")}</button>` : ""}
      </div>
    </section>` : ""}
  </div>`;
}

// The camp's one obvious next action: where the story is (six lanterns, the
// current chapter), the trial that turns its next page, and today's ember.
// It replaces "Today's step", which pointed at the same trial without saying
// why it mattered.
function storyCampCard() {
  const S = window.Story;
  const tgt = continueTarget();
  const doneToday = state.log.some(l => l.finished !== false && isSameLocalDay(l.ts));
  const chap = S && S.chapterOfRealm(tgt.key);
  const waiting = S && S.nextUnread(tgt.key);
  const realm = realmOf(tgt.key);
  const body = tgt.allWalked
    ? t("camp.storyAll", "All six lanterns are lit. Booster walks and real steps keep them that way.")
    : waiting
      ? tf("camp.pageWaiting", "📖 A new page is waiting: “{t}”.", { t: escapeHtml(S.titleOf(waiting)) })
      : (doneToday ? t("quest.doneP", "You showed up today — the flame is lit. Another step is always welcome.")
        : t("camp.storyP", "Every finished trial turns a page of the story. You can step out of any trial at any moment."));
  return `
      <div class="quest-card story-quest ${doneToday ? "done" : ""}">
        <div class="quest-head">
          <span class="quest-flag">${chap ? escapeHtml(S.chapterLabel(chap)) : t("quest.flag", "🪧 Today's step")}</span>
          ${doneToday ? `<span class="quest-chip done-chip">${t("quest.earned", "🔥 ember earned")}</span>` : `<span class="quest-chip">${t("quest.bonus", "+15 ember for the first trial today")}</span>`}
        </div>
        ${S ? S.lanternsHTML({ current: tgt.key }) : ""}
        <div class="quest-body">
          ${tgt.allWalked ? "" : `<strong>${tf("camp.storyNext", "{realm} · trial {n}: {title}", { realm: escapeHtml(realm.realmName), n: tgt.level + 1, title: escapeHtml(lvTitle(tgt.key, tgt.level)) })}</strong>`}
          <p>${body}</p>
        </div>
        <div class="actions quest-actions">
          ${waiting && !tgt.allWalked && !(S.pendingBefore(tgt.key, tgt.level) === waiting)
            ? `<button class="btn-ghost" data-action="story-play" data-beat="${escapeHtml(waiting)}">${t("st.read", "Read the page")}</button>` : ""}
          <button class="${doneToday && !waiting ? "btn-ghost" : "btn-primary"}" data-action="story-continue">${tgt.allWalked ? t("camp.storyCtaAll", "Choose a booster walk ↓") : doneToday ? t("camp.storyCtaDone", "Take another step") : t("camp.storyCta", "Continue the story")}</button>
        </div>
      </div>`;
}

function mountJourney() {
  const rootEl = document.getElementById("journeyRoot");
  if (!rootEl) return;
  const nodes = rootEl.querySelectorAll(".realm-node, .jw-dawn");
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if ("IntersectionObserver" in window && !reduce) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("lit"); io.unobserve(e.target); } });
    }, { threshold: 0.18 });
    nodes.forEach(n => io.observe(n));
  } else {
    nodes.forEach(n => n.classList.add("lit"));
  }
  // Gentle star parallax while the valley scrolls. Self-removing: the listener
  // detaches itself the first time it fires after this view is torn down.
  const stars = rootEl.querySelector(".jw-stars");
  if (stars && !reduce) {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        if (!stars.isConnected) { window.removeEventListener("scroll", onScroll); return; }
        stars.style.transform = `translateY(${window.scrollY * 0.35}px)`;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
  }
  // The game remembers where you are: bring the current realm into view once
  // the traveler has actually started walking (fresh travelers see the camp).
  const cur = rootEl.querySelector(".realm-node.current");
  if (cur && state.log && state.log.length) {
    requestAnimationFrame(() => {
      try { cur.scrollIntoView({ block: "center", behavior: "instant" }); }
      catch { cur.scrollIntoView(); }
    });
  }
  // The traveler keeps talking at the fire: rotate through a small pool of
  // lines (guardian voice, rank pride, tamed-count hope) so the camp feels
  // inhabited rather than rendered. Interval self-clears with the view.
  const bubble = rootEl.querySelector(".camp-bubble");
  const chB = window.Character && window.Character.loadCharacter();
  if (bubble && chB && !reduce) {
    const curKey = currentRealmKey();
    const realm = realmOf(curKey);
    const tamed = journeyKeys().filter(k => (getProgress(k).highestCompleted ?? -1) + 1 >= PHOBIAS[k].levels.length).length;
    const rank = courageRank(getCourage());
    const pool = [
      bubble.textContent,
      tf("camp.sayLine", "“{line}”", { line: realm.line }),
      t("camp.say1", "“Small steps. That's the whole secret.”"),
      t("camp.say2", "“The fire helps. So does coming back tomorrow.”"),
    ];
    if (tamed > 0) pool.push(tf(tamed === 1 ? "camp.sayTamed1" : "camp.sayTamed", `“{n} shadow${tamed === 1 ? "" : "s"} tamed. The dawn is closer.”`, { n: tamed }));
    if (rank.idx > 0) pool.push(tf("camp.sayRank", "“They call me {rank} now.”", { rank: rank.title }));
    const pals = campCompanions();
    if (pals.length) pool.push(tf(pals.length > 1 ? "camp.sayPals" : "camp.sayPal", pals.length > 1
      ? "“{a} and {b} by my fire. I used to cross the street.”"
      : "“{a} dozes by my fire now. I used to cross the street.”", { a: pals[0].name, b: pals[1] ? pals[1].name : "" }));
    const lines = [...new Set(pool)];
    let li = 0;
    const iv = setInterval(() => {
      if (!bubble.isConnected) { clearInterval(iv); return; }
      li = (li + 1) % lines.length;
      bubble.classList.add("swap");
      setTimeout(() => {
        if (!bubble.isConnected) return;
        bubble.textContent = lines[li];
        bubble.classList.remove("swap");
      }, 350);
    }, 8000);
  }
  // Pointer tilt on the realm art (fine pointers only): a light 3D lean that
  // follows the cursor — the map itself answers your hand.
  const finePointer = window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (finePointer && !reduce) {
    rootEl.querySelectorAll(".realm-node").forEach(node => {
      const art = node.querySelector(".realm-thumb");
      if (!art) return;
      node.addEventListener("pointermove", (e) => {
        const r = node.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        art.style.transform = `perspective(600px) rotateY(${(px * 7).toFixed(2)}deg) rotateX(${(-py * 5).toFixed(2)}deg) scale(1.03)`;
      });
      node.addEventListener("pointerleave", () => { art.style.transform = ""; });
    });
  }
}

// ---------- Progress report (clinician-readable export) ----------
// Turns the session log into something a user can print (browser print →
// PDF) or hand a therapist as JSON. Presentation only: every number comes
// from state that already exists. Language here is deliberately CLINICAL,
// not game-flavoured — it's written for the professional reading it.
function viewReport() {
  const ch = window.Character && window.Character.loadCharacter();
  const cs = activeCharSlice();
  const log = state.log || [];
  const keys = Object.keys(PHOBIAS).filter(k =>
    (state.progress[k]?.highestCompleted ?? -1) >= 0 ||
    log.some(l => l.phobia === k) ||
    getWorldsteps(k).length > 0 ||
    // A realm where only behavioural experiments ran still belongs in the
    // report — the expectancy-violation record is clinical data on its own.
    (window.PhobiaExperiments && PhobiaExperiments.evidenceOf(k).length > 0)
  );
  const fmtD = ts => ts ? new Date(ts).toLocaleDateString() : "—";
  const first = log[0], last = log[log.length - 1];
  const sections = keys.map(k => {
    const p = PHOBIAS[k];
    const sessions = log.filter(l => l.phobia === k);
    const done = Math.min(p.levels.length, (state.progress[k]?.highestCompleted ?? -1) + 1);
    // Context variety. Practice repeated in identical surroundings generalises
    // poorly; the count of DISTINCT conditions a level was met in is the part a
    // clinician would actually want next to the SUDS numbers.
    const ctxSet = new Set(sessions.map(l => l.ctx).filter(Boolean));
    const ctxLine = ctxSet.size > 1
      ? ` · practised across ${ctxSet.size} distinct conditions (time of day / weather)`
      : "";
    const rows = sessions.map(l => `
      <tr>
        <td>${fmtD(l.ts)}</td>
        <td>${l.level + 1}. ${escapeHtml(p.levels[l.level]?.title || "")}</td>
        <td>${l.ctxLabel ? escapeHtml(l.ctxLabel) : "—"}</td>
        <td>${l.predicted ?? "—"}</td>
        <td>${l.peak ?? "—"}</td>
        <td>${l.suds ?? "—"}</td>
        <td>${l.finished === false ? "left early (allowed)" : "completed hold"}</td>
      </tr>`).join("");
    const ws = getWorldsteps(k);
    const wsRows = ws.slice().sort((a, b) => a.step - b.step).map(w => `
      <li>${escapeHtml(bridgeRaw(k)[w.step]?.t || `Step ${w.step + 1}`)} — ${fmtD(w.ts)}${w.suds != null ? `, peak anxiety ${w.suds}/10` : ""}</li>`).join("");
    return `
      <section class="report-fear">
        <h3>${escapeHtml(p.label)} <span class="report-clinical">(${escapeHtml(p.name)})</span></h3>
        <p class="report-line">Exposure hierarchy: ${done} of ${p.levels.length} levels completed · ${sessions.length} session${sessions.length === 1 ? "" : "s"}${ctxLine}</p>
        ${sessions.length ? `
          <div class="report-chart">${drawSudsChart(sessions, 520, 110)}</div>
          <table class="report-table">
            <thead><tr><th>Date</th><th>Exposure level</th><th>Conditions</th><th>Predicted peak (0–10)</th><th>Actual peak (0–10)</th><th>End of trial (0–10)</th><th>Outcome</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : ""}
        ${ws.length ? `<p class="report-line"><strong>Real-world (in-vivo) steps, self-reported:</strong></p><ul class="report-ws">${wsRows}</ul>` : ""}
        ${(() => {
          // Behavioural experiments — stated expectancy vs observed outcome.
          // For a clinician this is the expectancy-violation record: which
          // predictions the client tested in-scene and what they observed.
          const ev = window.PhobiaExperiments ? PhobiaExperiments.evidenceOf(k) : [];
          if (!ev.length) return "";
          const rows3 = ev.map((l) => `
            <tr>
              <td>${fmtD(l.ts)}</td>
              <td>${l.rung + 1}</td>
              <td>${escapeHtml(l.predicted)}</td>
              <td>${escapeHtml(l.note)}</td>
            </tr>`).join("");
          return `
            <p class="report-line"><strong>Behavioural experiments</strong> (in-scene, prediction stated before each test):</p>
            <table class="report-table">
              <thead><tr><th>Date</th><th>Level</th><th>Stated expectation</th><th>Observed outcome</th></tr></thead>
              <tbody>${rows3}</tbody>
            </table>`;
        })()}
        ${(() => {
          const checks = getChecks(k);
          if (!checks.length) return "";
          const stageLabel = { baseline: "baseline", mid: "mid-hierarchy", post: "post-hierarchy", manual: "self-initiated" };
          const rows2 = checks.map(c => `
            <tr>
              <td>${fmtD(c.ts)}</td>
              <td>${stageLabel[c.at] || c.at}</td>
              <td>${c.scores.join(" · ")}</td>
              <td><strong>${c.total}</strong> / 20</td>
            </tr>`).join("");
          const delta = checks.length > 1 ? checks[checks.length - 1].total - checks[0].total : null;
          return `
            <p class="report-line"><strong>Fear-severity self-checks</strong> (5 items × 0–4: avoidance, peak intensity, physiological reaction, interference, danger belief — rated about real life)${delta != null ? ` · change since baseline: ${delta > 0 ? "+" : ""}${delta}` : ""}</p>
            <table class="report-table">
              <thead><tr><th>Date</th><th>Stage</th><th>Item scores</th><th>Total</th></tr></thead>
              <tbody>${rows2}</tbody>
            </table>`;
        })()}
      </section>`;
  }).join("");
  return `
    <div class="panel report-view">
      <div class="report-actions">
        <button class="btn-primary" id="reportPrint">🖨 Print / save as PDF</button>
        <button class="btn-ghost" id="reportJson">⤓ Download data (JSON)</button>
        <button class="btn-ghost" data-action="open-select">Back to the valley</button>
      </div>
      <h2>Exposure practice report</h2>
      <p class="report-line">
        ${ch && ch.name ? `Traveler: <strong>${escapeHtml(ch.name)}</strong> · ` : ""}
        ${log.length} logged session${log.length === 1 ? "" : "s"}${first ? ` · ${fmtD(first.ts)} – ${fmtD(last.ts)}` : ""}
        · ${worldstepCount()} real-world step${worldstepCount() === 1 ? "" : "s"}
      </p>
      <p class="report-note">Generated by Lanternwalk, a self-guided graded-exposure practice game. Anxiety ratings are self-reported SUDS (0 calm – 10 panic); "predicted" is rated before each exposure, "reported" after — the gap reflects expectancy violation. "Conditions" records the simulated time of day and weather, which the app varies between repetitions to support generalisation. This is a personal practice record, not a clinical assessment.</p>
      ${sections || `<p>No practice recorded yet.</p>`}
    </div>`;
}

// About page — the trust surface: what Mira is, the science model in plain
// words, the honest limits, privacy, and credits. This is the page a curious
// visitor (or journalist, or clinician) should be able to link to.
function viewAbout() {
  return `
    <div class="panel about-view">
      <span class="badge">${t("about.badge", "About")}</span>
      <h2 style="margin-top:10px">${t("about.title", "Lanternwalk — a tiny game about big fears")}</h2>
      <p>${t("about.intro4", "Lanternwalk is a free practice game about how fear works. You make a traveler and face a fear — dogs, spiders, snakes, heights, the dark or tight spaces — in small, safe, always-optional steps: first in 3D scenes, then through tiny real-world quests.")}</p>

      <h3>${t("about.scienceH", "The science it leans on")}</h3>
      <p>${t("about.science1", "The whole game is built around graded exposure — the best-studied approach for specific fears. Anxiety rises, peaks, and falls on its own when you stay; avoidance is what keeps a fear alive. Each 'trial' asks you to predict how bad it will be, stay a little, and then compare — that prediction gap is where the brain updates.")}</p>
      <p>${t("about.science2", "Progress is measured, not just played: short fear check-ins (avoidance, intensity, body reaction, interference, belief) tracked over time, and a printable report you could hand to a clinician.")}</p>

      <h3>${t("about.limitsH", "What Lanternwalk is not")}</h3>
      <p>${t("about.limits", "Not therapy, not diagnosis, not a medical device. It was made for curiosity and education. If a fear is seriously limiting your life, a trained clinician can run real exposure work with you safely — bring the report; it makes a good first conversation.")}
      <a href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a></p>

      <h3>${t("about.privacyH", "Privacy")}</h3>
      <p>${t("about.privacy", "Everything stays in your browser: characters, sessions, check-ins — all of it lives in this device's local storage. No account, no analytics, no server. Your data leaves only when you export it yourself (Settings → Export).")}</p>

      <h3>${t("about.creditsH", "Credits")}</h3>
      <p class="about-credits">${t("about.credits", "Built for fun with")} <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> · ${t("about.creditsPhysics", "physics by")} <a href="https://rapier.rs" target="_blank" rel="noopener">Rapier</a> · ${t("about.creditsModels", "creature models by")} <a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a> (CC0) · ${t("about.creditsAmbient", "ambient recordings from")} <a href="https://mixkit.co" target="_blank" rel="noopener">Mixkit</a> · ${t("about.creditsHdri", "sky lighting from")} <a href="https://polyhaven.com/a/meadow" target="_blank" rel="noopener">Poly Haven</a> (CC0) · ${t("about.creditsMade", "made with care by Amir.")}</p>

      <div class="actions" style="margin-top:14px">
        <button class="btn-ghost" data-action="show-consent">${t("about.reread", "Re-read the welcome notice")}</button>
        <button class="btn-ghost" data-action="open-feedback" data-context="about">${t("fb.menu", "💬 Send feedback")}</button>
        <button class="btn-primary" data-action="open-select">${t("about.back", "🗺 To the valley")}</button>
      </div>
    </div>`;
}

// ---------- Shell 3D wiring ----------
// Mount the live Three vignettes into the shell views. Every mount is a
// progressive enhancement: on success the container gets .has3d (hiding the
// 2D stand-in); on any failure the 2D art simply stays. The module script
// loads async, so we wait for scene3d-ready when it hasn't arrived yet.
function charHexes(ch) {
  const C = window.Character;
  if (!ch || !C || !C.skinHex) return null;
  return Object.assign({}, ch, {
    skinHex: C.skinHex(ch), hairHex: C.hairHex(ch),
    shirtHex: C.topHex(ch), eyeHex: C.eyeHex(ch),
  });
}
// Faces: the traveler's own (header badge, menu) and the story's cast, drawn
// by the 3D figure builder rather than the flat avatar — so the person in the
// corner of the screen is the person walking into the room. Starts flat,
// swaps when the bake lands; a device without WebGL keeps the flat one.
function upgradeFaces(root) {
  if (!root) return;
  try { if (window.Story && window.Story.upgradeFaces) window.Story.upgradeFaces(root); } catch {}
  const ch = window.Character && window.Character.loadCharacter();
  const els = [...root.querySelectorAll(".char-badge-avatar, .menu-avatar")];
  if (!ch || !els.length) return;
  const run = () => {
    if (!window.ShellScenes || !window.ShellScenes.portrait) return;
    window.ShellScenes.portrait(charHexes(ch), 128).then((url) => {
      if (!url) return;
      els.forEach((el) => {
        if (!el.isConnected) return;
        const svg = el.querySelector("svg");
        const size = (svg && +svg.getAttribute("width")) || el.clientWidth || 28;
        el.innerHTML = `<img class="cast-face baked me" src="${url}" width="${size}" height="${size}" alt="">`;
      });
    }).catch(() => {});
  };
  if (window.ShellScenes && window.ShellScenes.ready) run();
  else window.addEventListener("scene3d-ready", run, { once: true });
}

// The shell's 3D (title room, camp, realm heroes) mounts a frame after the
// page paints, the way a trial does (see render()): built inside the route's
// first render, the heaviest thing on the screen held the whole page blank
// until it was done — on a first visit, the title screen. A newer route
// render supersedes a mount still waiting for its frame.
let _shell3DGen = 0;
function startShell3DSoon(start) {
  const gen = ++_shell3DGen;
  const go = () => requestAnimationFrame(() => setTimeout(() => { if (gen === _shell3DGen) start(); }, 0));
  if (window.ShellScenes && window.ShellScenes.ready) go();
  else window.addEventListener("scene3d-ready", go, { once: true });
}

// ---------- Room stage (arrival + traveler creator) ----------
// Both immersive views stand in the same room; only the framing differs, so
// they share one mount. Held in a module-level handle so the chip handlers can
// swap the figure without tearing the whole scene down and paying for the
// textures again on every tap.
let _roomStage = null;
function mountRoomStage(view) {
  const id = view === "traveler" ? "travelerStage" : "arrivalStage";
  const start = () => {
    try {
      const el = document.getElementById(id);
      if (!el || !window.ShellScenes || !window.ShellScenes.mountRoom) return;
      const ch = view === "traveler"
        ? (_travelerDraft || (window.Character && window.Character.loadCharacter()) || (window.Character && window.Character.defaultCharacter()))
        : (window.Character && window.Character.loadCharacter());
      _roomStage = window.ShellScenes.mountRoom(el, charHexes(ch), {
        portrait: view === "traveler",
        fov: view === "traveler" ? 50 : 46,
      });
    } catch (e) { console.warn("[room stage]", e); }
  };
  // Same readiness handshake mountShell3D uses — the module that defines
  // ShellScenes evaluates after this classic script, so a first paint can beat
  // it and must wait for the event rather than silently rendering no stage.
  startShell3DSoon(start);
}

// Live-rebuild the 3D traveler from the current draft.
function refreshTravelerFigure() {
  if (!_roomStage || !_roomStage.setCharacter) return;
  try { _roomStage.setCharacter(charHexes(_travelerDraft)); } catch {}
}

function attachTravelerHandlers() {
  const root = document.getElementById("view");
  if (!root || !window.Character) return;
  const C = window.Character;

  // Option taps: update the draft, move the pressed state, rebuild the figure.
  root.querySelectorAll("[data-tw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-tw");
      const val = btn.getAttribute("data-val");
      if (!key) return;
      _travelerDraft = Object.assign({}, _travelerDraft, { [key]: val });
      // Only clear siblings in the SAME row — querying the whole view would
      // unpress every other row's selection too.
      const row = btn.closest(".mob-chips");
      if (row) row.querySelectorAll("[data-tw]").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      refreshTravelerFigure();
      try { if (window.PhobiaAudio && window.PhobiaAudio.tick) window.PhobiaAudio.tick(); } catch {}
    });
  });

  const nameEl = document.getElementById("twName");
  if (nameEl) {
    nameEl.addEventListener("input", () => {
      _travelerDraft = Object.assign({}, _travelerDraft, { name: nameEl.value });
    });
    // A soft keyboard covering the sheet is the single most common mobile form
    // failure; scroll the field back into view when focus lands on it.
    nameEl.addEventListener("focus", () => {
      setTimeout(() => { try { nameEl.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {} }, 260);
    });
  }
}

function mountShell3D(view, params) {
  const start = () => {
    try {
      if (view === "select") {
        const el = document.getElementById("camp3d");
        const ch = window.Character && window.Character.loadCharacter();
        if (el && window.ShellScenes && window.ShellScenes.mountCamp(el, charHexes(ch), campCompanions().map((c) => c.breed))) {
          el.closest(".camp-scene")?.classList.add("has3d");
        }
      } else if (view === "ladder") {
        const el = document.getElementById("realmHero3d");
        if (el && window.ShellScenes && window.ShellScenes.mountRealm(el, params && params.phobia)) {
          el.closest(".realm-hero")?.classList.add("has3d");
        }
      } else if (view === "welcome" || view === "threshold") {
        const el = document.getElementById("landing3d");
        const ch = window.Character && window.Character.loadCharacter();
        if (el && window.ShellScenes && window.ShellScenes.mountLanding) {
          const focus = (view === "threshold" && ch && ch.primaryPhobia) ? ch.primaryPhobia : null;
          window.ShellScenes.mountLanding(el, {
            charHexes: charHexes(ch) || charHexes({
              skinTone: "fair", hairColor: "brown", hairStyle: "long",
              topColor: "teal", eyeColor: "hazel", bodyType: "woman",
            }),
            focusPhobia: focus,
            mode: view,
          });
        }
      }
    } catch { /* 2D fallback stays */ }
  };
  startShell3DSoon(start);
}

// ---------- Traveler ranks (courage levels) ----------
// A visible progression ladder over the courage score: always show the next
// goal (a core gamification loop the app previously lacked — points existed
// but led nowhere). Thresholds are gentle; rank-ups fire an achievement toast.
const RANKS = [
  { min: 0,   title: "Novice Traveler", icon: "🌱" },
  { min: 60,  title: "Wanderer",        icon: "🥾" },
  { min: 150, title: "Pathfinder",      icon: "🧭" },
  { min: 300, title: "Shadow-Tamer",    icon: "🕯️" },
  { min: 500, title: "Valley Keeper",   icon: "🏔️" },
  { min: 800, title: "Dawnbringer",     icon: "🌅" },
];
function courageRank(c) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (c >= RANKS[i].min) idx = i;
  const next = RANKS[idx + 1]
    ? Object.assign({}, RANKS[idx + 1], { title: t(`ranks.${idx + 1}`, RANKS[idx + 1].title) })
    : null;
  return Object.assign({ idx, next }, RANKS[idx], { title: t(`ranks.${idx}`, RANKS[idx].title) });
}
function isSameLocalDay(ts) {
  if (!ts) return false;
  const a = new Date(ts), b = new Date();
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// The Book of Sparks — every psychology card earned so far, plus face-down
// slots for the ones still out there. Psychoeducation as a collection screen:
// learning reads as loot, not homework.
// The Sparks, as the Story Book's third tab.
function sparksGridHTML() {
  const owned = getSparks();
  const cards = INSIGHT_CARDS.map((c, i) => {
    const has = owned.includes(c.id);
    return `
      <div class="spark-slot ${has ? "owned" : "readable"}" style="--i:${i}"${has ? "" : ` title="${t("journal.readableTip", "Read ahead — it becomes yours when you live it in a trial")}"`}>
        <span class="spark-icon">${c.icon}</span>
        <strong>${escapeHtml(t(`card.${c.id}.title`, c.title))}</strong>
        <p>${escapeHtml(t(`card.${c.id}.text`, c.text))}</p>
        ${has ? "" : `<span class="spark-unlived">${t("journal.unlived", "📖 read ahead — not yet lived")}</span>`}
      </div>`;
  }).join("");
  return `
    <p>${t("journal.p2", "The psychology of fear, one spark at a time — read it all now, or collect each piece by living it in a trial.")} ${owned.length ? tf("journal.have", "You hold <strong>{a} of {b}</strong>.", { a: owned.length, b: INSIGHT_CARDS.length }) : ""}</p>
    <div class="spark-grid">${cards}</div>`;
}
function viewJournal() {
  const owned = getSparks();
  // Unearned sparks used to be "?" boxes — the app's best CBT writing,
  // hidden from exactly the visitor who came to read. They're readable now,
  // marked as not-yet-lived; a trial still turns a page ahead into a page
  // that's yours, which is the collecting delight the book keeps.
  const cards = INSIGHT_CARDS.map((c, i) => {
    const has = owned.includes(c.id);
    return has ? `
      <div class="spark-slot owned" style="--i:${i}">
        <span class="spark-icon">${c.icon}</span>
        <strong>${escapeHtml(t(`card.${c.id}.title`, c.title))}</strong>
        <p>${escapeHtml(t(`card.${c.id}.text`, c.text))}</p>
      </div>` : `
      <div class="spark-slot readable" style="--i:${i}" title="${t("journal.readableTip", "Read ahead — it becomes yours when you live it in a trial")}">
        <span class="spark-icon">${c.icon}</span>
        <strong>${escapeHtml(t(`card.${c.id}.title`, c.title))}</strong>
        <p>${escapeHtml(t(`card.${c.id}.text`, c.text))}</p>
        <span class="spark-unlived">${t("journal.unlived", "📖 read ahead — not yet lived")}</span>
      </div>`;
  }).join("");
  return `
    <div class="panel journal-panel">
      <span class="badge">${t("spark.book", "Book of Sparks")}</span>
      <h2 style="margin-top:10px">${t("journal.h2", "The wisdom of the valley")}</h2>
      <p>${t("journal.p2", "The psychology of fear, one spark at a time — read it all now, or collect each piece by living it in a trial.")} ${owned.length ? tf("journal.have", "You hold <strong>{a} of {b}</strong>.", { a: owned.length, b: INSIGHT_CARDS.length }) : ""}</p>
      <div class="spark-grid">${cards}</div>
      <div class="actions"><button class="btn-primary" data-action="open-select">${t("journal.backValley", "🗺 Back to the valley")}</button></div>
    </div>`;
}
