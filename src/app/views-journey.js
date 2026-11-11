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
      extra.goals = ev.goals.slice(0, 3).map((g) => {
        const o = { id: g.id, done: !!g.done, text: String(g.text || "").slice(0, 90) };
        if (Number.isFinite(g.need) && g.need > 1) { o.need = g.need | 0; o.n = Math.max(0, Math.min(o.need, g.n | 0)); }
        return o;
      });
    }
  }
  window.__lastTrialEvidence = null;
  clearTrialSnap();
  markCompleted(phobia, level, suds, predicted, peak, outcome, extra);
  goReplace("complete", { phobia, level, suds, predicted, peak });
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

// Home: the one hub, for a first visit and every return.
//
// Before, a first visit read a paragraph, picked a fear, met the notice and
// then a "gate" page; a return opened "Welcome back" → Camp (a valley map
// with ranks, a quest card, stats and a realm list) → the realm (a page of
// twelve sections) → the gate → the trial. Now there is this page, and a
// trial: the fear you want, one tap. Returning, the next step of your story
// sits on top, one tap. Everything else — the story book, progress, the real
// steps, the traveler, settings — is in ☰, never in the way.
const FEAR_ICON = { dogs: "🐕", spiders: "🕷", snakes: "🐍", heights: "🏔", dark: "🌙", enclosed: "🚪" };
function homePips(n, m) {
  return `<span class="hp-pips" aria-hidden="true">${Array.from({ length: m }, (_, i) => `<i class="${i < n ? "on" : ""}"></i>`).join("")}</span>`;
}
function viewArrival() {
  const ch = window.Character && window.Character.loadCharacter();
  const named = ch && ch.name ? escapeHtml(ch.name) : null;
  const S = window.Story;
  // A traveler the one-tap start made, who reloaded before a single trial
  // was logged, is still a first-time visitor. A traveler with a history is
  // returning, named or not.
  const hasLog = !!(state.log || []).length;
  const fresh = !ch || (!hasLog && (ch.autoMade || !named));
  let lit = [], tgt = null;
  if (!fresh) {
    try { lit = VALLEY_KEYS.filter((k) => PHOBIAS[k] && realmStatus(k).tamed); tgt = continueTarget(); } catch {}
  }
  const fa = window.I18n && window.I18n.currentLanguage() === "fa";
  const top = `
  <div class="home-bg" aria-hidden="true">${valleyHeroSVG({ lit, next: tgt ? tgt.key : null })}</div>
  <div class="home-top">
    <span class="home-mark">${brandLamp()}<span>${t("brand.name", "Lanternwalk")}</span></span>
    <span class="home-top-r">
      <button class="home-chip" data-action="toggle-lang" lang="${fa ? "en" : "fa"}" aria-label="${fa ? "Switch to English" : "تغییر زبان به فارسی"}">${fa ? "English" : "فارسی"}</button>
      <button class="tb-icon home-menu" data-action="open-menu" aria-label="${t("a11y.openMenu", "Open menu")}">${menuGlyph()}</button>
    </span>
  </div>`;
  const open = VALLEY_KEYS.filter((k) => PHOBIAS[k] && realmOpen(k));
  const tiles = open.map((k, ti) => {
    let n = 0, m = 5;
    try { const rs = realmStatus(k); n = rs.trials; m = rs.totalTrials; } catch {}
    const cur = !!(tgt && !tgt.allWalked && tgt.key === k);
    const done = n >= m;
    return `
      <button class="fear-tile${cur ? " cur" : ""}${done ? " done" : ""}" style="--k:${ti}" data-action="quick-start" data-phobia="${k}"
              aria-label="${escapeHtml(phLabel(k) + " — " + realmOf(k).realmName + (fresh ? "" : " · " + tf("home.tileAria", "{n} of {m} trials", { n, m })))}">
        <span class="ft-icon" aria-hidden="true">${FEAR_ICON[k] || "🏮"}</span>
        <span class="ft-text">
          <span class="ft-name">${escapeHtml(phLabel(k))}</span>
          <span class="ft-realm">${escapeHtml(realmOf(k).realmName)}</span>
        </span>
        ${!fresh && n > 0 ? homePips(n, m) : ""}
      </button>`;
  }).join("");
  if (fresh || !tgt) {
    return `${top}
  <div class="home-main">
    <header class="home-hero">
      <h1 class="home-title">${t("arrive.title2", "Every fear is a path<br>you stopped walking.")}</h1>
      <p class="home-sub">${t("home.story", "The valley’s paths fell dark when people stopped walking them. Choose a path and help Mira, the lantern-keeper, light it again.")}</p>
    </header>
    <section class="home-sheet" aria-labelledby="homeQ">
      <h2 class="home-q" id="homeQ">${t("arrive.pickQ", "Which fear do you want to face?")}</h2>
      <div class="fear-tiles">${tiles}</div>
      <p class="home-note">${t("home.promise", "You start where it's small and far away. You choose every step — and you can stop any time.")}</p>
      <button class="home-link" data-action="open-quiz">${t("arrive.quiz2", "Not sure which fear? Take the 1-minute check")}</button>
    </section>
  </div>`;
  }
  // Returning: the next step of the story, one tap; the six fears below it.
  const realm = realmOf(tgt.key);
  const chap = S && S.chapterOfRealm(tgt.key);
  const note = S ? S.morningNoteHTML() : "";
  const recap = S && !note ? S.recapLine() : "";
  let rs = { trials: 0, totalTrials: 5 };
  try { rs = realmStatus(tgt.key); } catch {}
  // The realm the traveler was walking is finished, so "Continue" now opens
  // a fear they never picked: say so instead of switching silently.
  let litBefore = null;
  try { const ck = currentRealmKey(); if (ck && ck !== tgt.key && !tgt.allWalked) litBefore = ck; } catch {}
  const cont = tgt.allWalked ? `
      <section class="home-next all" aria-label="${t("home.nextAria", "Your next step")}">
        <span class="hn-kicker">🕊 ${t("home.allK", "Every lantern is lit")}</span>
        <p class="hn-body">${t("arrive.allWalked", "Every lantern is lit. Come back for a booster walk — or take a real step out there.")}</p>
        <button class="home-btn-primary" data-action="story-continue">${t("home.allGo", "Walk one again")}</button>
      </section>` : `
      <section class="home-next" aria-label="${t("home.nextAria", "Your next step")}">
        ${litBefore ? `<span class="hn-lit">🏮 ${tf("home.litNext", "{realm}: lantern lit. The next one — or choose another below.", { realm: escapeHtml(realmOf(litBefore).realmName) })}</span>` : ""}
        <span class="hn-kicker">${FEAR_ICON[tgt.key] || "🏮"} ${escapeHtml(chap ? S.chapterLabel(chap) : realm.realmName)}</span>
        <strong class="hn-title">${escapeHtml(lvTitle(tgt.key, tgt.level))}</strong>
        <span class="hn-meta">${escapeHtml(realm.realmName)} · ${tf("home.trialOf", "trial {n} of {m}", { n: tgt.level + 1, m: rs.totalTrials })} ${homePips(rs.trials, rs.totalTrials)}</span>
        <button class="home-btn-primary" data-action="story-continue">${t("home.continue", "Continue")} <span aria-hidden="true">${isRtl() ? "←" : "→"}</span></button>
        <button class="home-link hn-all" data-action="select-phobia" data-phobia="${tgt.key}">${t("home.allTrials", "All trials and real-world steps")}</button>
      </section>`;
  // This journey lives only in this browser's storage — one cleanup deletes
  // months of it. Gentle, dismissable, and only once there's something to lose.
  const num = (k) => parseInt(prefGet(k) || "0", 10) || 0;
  const needBackup = (state.log || []).length >= 5 && Date.now() - num("fobia.lastExportAt") > 14 * 864e5 && Date.now() - num("fobia.backupSnooze") > 7 * 864e5;
  const backup = needBackup ? `
      <div class="backup-nudge home-backup">
        <span>💾 ${t("camp.backup", "Your whole journey lives only on this device. One browser cleanup could erase it — take a copy?")}</span>
        <span class="backup-nudge-btns">
          <button class="btn-ghost" data-action="backup-now">${t("camp.backupNow", "Download backup")}</button>
          <button class="backup-later" data-action="backup-later">${t("camp.backupLater", "later")}</button>
        </span>
      </div>` : "";
  return `${top}
  <div class="home-main">
    <header class="home-hero">
      <h1 class="home-title">${tf("arrive.back", "Welcome back,<br>{name}", { name: named || escapeHtml(travelerDisplayName(ch)) })}</h1>
      ${recap ? `<p class="home-sub">${escapeHtml(recap)}</p>` : ""}
    </header>
    <div class="home-sheet">
      ${note}
      ${cont}
      <h2 class="home-q">${t("home.fearsQ2", "Or choose any fear")}</h2>
      <div class="fear-tiles">${tiles}</div>
      ${backup}
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
    <button class="mob-icon-btn" data-action="traveler-dice" aria-label="${t("tw.random", "Randomize appearance")}">🎲</button>
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
    ${row(t("tw.outfit", "Outfit"), chips("topStyle", C.TOP_STYLES, c.topStyle || "tee"))}
    ${row(t("tw.eyes", "Eyes"),   swatches("eyeColor",  C.EYE_COLORS,  c.eyeColor))}
    ${row(t("tw.glasses", "Glasses"), chips("glasses", C.GLASSES, c.glasses))}
    ${row(t("tw.hat", "Headwear"), chips("headwear", C.HEADWEAR, c.headwear || "none"))}
    ${row(t("tw.beard", "Facial hair"), chips("facialHair", C.FACIAL_HAIR, c.facialHair || "none")).replace('class="mob-row"', `class="mob-row tw-beard-row"${c.bodyType === "woman" || c.bodyType === "girl" ? " hidden" : ""}`)}
    <p style="margin:4px 0 0;font-size:12px;opacity:.6;text-align:center">${t("tw.hint", "Drag the room to turn them around")}</p>
    <div class="mob-thumb tw-cta">
      <button class="mob-btn mob-btn-primary" data-action="traveler-save">${t("tw.save", "Walk in →")}</button>
    </div>
  </div>`;
}

// (The threshold page, the camp map and its quest card were folded into
// Home — viewArrival above — when the main path became Home → Trial → Debrief.)


// ---------- Progress report (clinician-readable export) ----------
// Turns the session log into something a user can print (browser print →
// PDF) or hand a therapist as JSON. Presentation only: every number comes
// from state that already exists. Language here is deliberately CLINICAL,
// not game-flavoured — it's written for the professional reading it.
// The report reads in the player's language — a Persian clinician gets a
// Persian report — and a Persian player can switch it to English for a
// clinician who reads English (reportEnglish, flipped by data-action
// "report-lang"). The English text is the source; Persian lives in rep.*.
let reportEnglish = false;
// The conditions a session ran in, stored as "hour/weather" ids; the stored
// English label is kept for old entries that have no ids.
const REP_HOURS = { dawn: "early morning", morning: "mid-morning", noon: "midday", afternoon: "afternoon", golden: "late afternoon", dusk: "dusk" };
const REP_WEATHER = { clear: "clear", hazy: "hazy", overcast: "overcast", rain: "rainy" };
function viewReport() {
  const ch = window.Character && window.Character.loadCharacter();
  const cs = activeCharSlice();
  const log = state.log || [];
  // English when the UI is English, or when a Persian player asked for it.
  const en = !isRtl() || reportEnglish;
  const R = (key, fb) => en ? fb : t(key, fb);
  const RF = (key, fb, vars) => en ? fb.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : tf(key, fb, vars);
  const plural = (n, one, many) => n === 1 ? one : many;
  const keys = Object.keys(PHOBIAS).filter(k =>
    (state.progress[k]?.highestCompleted ?? -1) >= 0 ||
    log.some(l => l.phobia === k) ||
    getWorldsteps(k).length > 0 ||
    // A realm where only behavioural experiments ran still belongs in the
    // report — the expectancy-violation record is clinical data on its own.
    (window.PhobiaExperiments && PhobiaExperiments.evidenceOf(k).length > 0)
  );
  // Persian dates in the Iranian calendar ("۱۵ آبان ۱۴۰۵"); English ones
  // spelled out ("6 Nov 2026") so day and month can't be swapped.
  const fmtD = ts => {
    if (!ts) return "—";
    try { return new Date(ts).toLocaleDateString(en ? "en-GB" : "fa-IR", { year: "numeric", month: "short", day: "numeric" }); }
    catch { return new Date(ts).toLocaleDateString(); }
  };
  const ctxText = (l) => {
    if (l.ctx && typeof l.ctx === "string") {
      const [h, w] = l.ctx.split("/");
      if (REP_HOURS[h]) {
        const hour = R(`rep.h.${h}`, REP_HOURS[h]);
        if (!w || w === "clear" || !REP_WEATHER[w]) return hour;
        return en ? `${REP_WEATHER[w]} ${hour}` : `${hour}، ${t(`rep.w.${w}`, REP_WEATHER[w])}`;
      }
    }
    return l.ctxLabel || "—";
  };
  const outOf = (n, m) => en ? `${n} / ${m}` : tf("rep.outOf", "{n} of {m}", { n, m });
  const signed = (d) => `<bdi dir="ltr">${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d)}</bdi>`;
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
      ? " · " + RF("rep.ctxLine", "practised across {n} distinct conditions (time of day / weather)", { n: ctxSet.size })
      : "";
    const lvName = (i) => en ? (p.levels[i]?.title || "") : lvTitle(k, i);
    const rows = sessions.map(l => `
      <tr>
        <td>${fmtD(l.ts)}</td>
        <td>${l.level + 1}. ${escapeHtml(lvName(l.level))}</td>
        <td>${escapeHtml(ctxText(l))}</td>
        <td>${l.predicted ?? "—"}</td>
        <td>${l.peak ?? "—"}</td>
        <td>${l.suds ?? "—"}</td>
        <td>${l.finished === false ? R("rep.leftEarly", "left early (allowed)") : R("rep.completed", "completed hold")}</td>
      </tr>`).join("");
    const ws = getWorldsteps(k);
    const steps = en ? bridgeRaw(k) : bridgeOf(k);
    const wsRows = ws.slice().sort((a, b) => a.step - b.step).map(w => `
      <li>${escapeHtml(steps[w.step]?.t || RF("rep.step", "Step {n}", { n: w.step + 1 }))} — ${fmtD(w.ts)}${w.suds != null ? RF("rep.wsPeak", ", peak anxiety {n}", { n: outOf(w.suds, 10) }) : ""}</li>`).join("");
    const title = en ? p.label : phLabel(k);
    const clin = en ? p.name : [phName(k), p.name].filter(Boolean).join(" · ");
    return `
      <section class="report-fear">
        <h3>${escapeHtml(title)}${clin ? ` <span class="report-clinical">(${en ? escapeHtml(clin) : `${escapeHtml(phName(k))}${p.name ? ` · <bdi lang="en">${escapeHtml(p.name)}</bdi>` : ""}`})</span>` : ""}</h3>
        <p class="report-line">${RF("rep.hier", "Exposure hierarchy: {done} of {total} levels completed", { done, total: p.levels.length })} · ${en ? `${sessions.length} ${plural(sessions.length, "session", "sessions")}` : tf("rep.sessions", "{n} sessions", { n: sessions.length })}${ctxLine}</p>
        ${sessions.length ? `
          <div class="report-chart">${drawSudsChart(sessions, 520, 110, en)}</div>
          <table class="report-table">
            <thead><tr><th>${R("rep.thDate", "Date")}</th><th>${R("rep.thLevel", "Exposure level")}</th><th>${R("rep.thCond", "Conditions")}</th><th>${R("rep.thPred", "Predicted peak (0–10)")}</th><th>${R("rep.thPeak", "Actual peak (0–10)")}</th><th>${R("rep.thEnd", "End of trial (0–10)")}</th><th>${R("rep.thOutcome", "Outcome")}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>` : ""}
        ${ws.length ? `<p class="report-line"><strong>${R("rep.wsH", "Real-world (in-vivo) steps, self-reported:")}</strong></p><ul class="report-ws">${wsRows}</ul>` : ""}
        ${(() => {
          // Behavioural experiments — stated expectancy vs observed outcome.
          // For a clinician this is the expectancy-violation record: which
          // predictions the client tested in-scene and what they observed.
          const ev = window.PhobiaExperiments ? PhobiaExperiments.evidenceOf(k) : [];
          if (!ev.length) return "";
          const rows3 = ev.map((l) => {
            const txt = en || !PhobiaExperiments.lineText ? l : PhobiaExperiments.lineText(k, l);
            return `
            <tr>
              <td>${fmtD(l.ts)}</td>
              <td>${l.rung + 1}</td>
              <td>${escapeHtml(txt.predicted || "")}</td>
              <td>${escapeHtml(txt.note || "")}</td>
            </tr>`;
          }).join("");
          return `
            <p class="report-line"><strong>${R("rep.expH", "Behavioural experiments")}</strong> ${R("rep.expSub", "(in-scene, prediction stated before each test):")}</p>
            <table class="report-table">
              <thead><tr><th>${R("rep.thDate", "Date")}</th><th>${R("rep.thLv", "Level")}</th><th>${R("rep.thExpect", "Stated expectation")}</th><th>${R("rep.thObserved", "Observed outcome")}</th></tr></thead>
              <tbody>${rows3}</tbody>
            </table>`;
        })()}
        ${(() => {
          const checks = getChecks(k);
          if (!checks.length) return "";
          const stageLabel = {
            baseline: R("rep.stBase", "baseline"), mid: R("rep.stMid", "mid-hierarchy"),
            post: R("rep.stPost", "post-hierarchy"), manual: R("rep.stSelf", "self-initiated"),
          };
          // The five scores follow the item list in the heading above: left
          // to right in English, right to left in Persian (a forced LTR run
          // put the first item's score under the last item's name).
          const scoreDir = !en && isRtl() ? "rtl" : "ltr";
          const rows2 = checks.map(c => `
            <tr>
              <td>${fmtD(c.ts)}</td>
              <td>${stageLabel[c.at] || escapeHtml(String(c.at))}</td>
              <td><bdi dir="${scoreDir}">${c.scores.join(" · ")}</bdi></td>
              <td><strong>${outOf(c.total, 20)}</strong></td>
            </tr>`).join("");
          const delta = checks.length > 1 ? checks[checks.length - 1].total - checks[0].total : null;
          return `
            <p class="report-line"><strong>${R("rep.fcH", "Fear-severity self-checks")}</strong> ${R("rep.fcSub", "(5 items × 0–4: avoidance, peak intensity, physiological reaction, interference, danger belief — rated about real life)")}${delta != null ? ` · ${R("rep.fcDelta", "change since baseline:")} ${signed(delta)}` : ""}</p>
            <table class="report-table">
              <thead><tr><th>${R("rep.thDate", "Date")}</th><th>${R("rep.thStage", "Stage")}</th><th>${R("rep.thItems", "Item scores")}</th><th>${R("rep.thTotal", "Total")}</th></tr></thead>
              <tbody>${rows2}</tbody>
            </table>`;
        })()}
      </section>`;
  }).join("");
  const nWs = worldstepCount();
  const summary = en
    ? `${log.length} logged ${plural(log.length, "session", "sessions")}${first ? ` · ${fmtD(first.ts)} – ${fmtD(last.ts)}` : ""} · ${nWs} real-world ${plural(nWs, "step", "steps")}`
    : `${tf("rep.logged", "{n} logged sessions", { n: log.length })}${first ? ` · ${fmtD(first.ts)} تا ${fmtD(last.ts)}` : ""} · ${tf("rep.wsCount", "{n} real-world steps", { n: nWs })}`;
  // The English version inside a Persian UI is marked lang=en/dir=ltr: it
  // lays out left to right and keeps its Latin digits (faDigitsIn skips it).
  const enInFa = en && isRtl();
  return `
    <div class="panel report-view"${enInFa ? ' lang="en" dir="ltr"' : ""}>
      <div class="report-actions">
        <button class="btn-primary" id="reportPrint">${R("rep.print", "🖨 Print / save as PDF")}</button>
        <button class="btn-ghost" id="reportJson">${R("rep.json", "⤓ Download data (JSON)")}</button>
        ${isRtl() ? `<button class="btn-ghost" data-action="report-lang" lang="${enInFa ? "fa" : "en"}">${enInFa ? "نسخهٔ فارسی" : "English version"}</button>` : ""}
        <button class="btn-ghost" data-action="open-select">${R("rep.back", "Back to the valley")}</button>
      </div>
      <h2>${R("rep.title", "Exposure practice report")}</h2>
      <p class="report-line">
        ${ch && ch.name ? `${R("rep.name", "Traveler:")} <strong><bdi>${escapeHtml(ch.name)}</bdi></strong> · ` : ""}
        ${summary}
      </p>
      <p class="report-note">${R("rep.note", "Generated by Lanternwalk, a self-guided graded-exposure practice game. Anxiety ratings are self-reported SUDS (0 calm – 10 panic); \"predicted\" is rated before each exposure, \"reported\" after — the gap reflects expectancy violation. \"Conditions\" records the simulated time of day and weather, which the app varies between repetitions to support generalisation. This is a personal practice record, not a clinical assessment.")}</p>
      ${sections || `<p>${R("rep.none", "No practice recorded yet.")}</p>`}
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
      <a class="crisis-link" href="https://findahelpline.com" target="_blank" rel="noopener">findahelpline.com</a>${isRtl() ? " · اورژانس اجتماعی <b>۱۲۳</b> · صدای مشاور بهزیستی <b>۱۴۸۰</b>" : ""}</p>

      <h3>${t("about.privacyH", "Privacy")}</h3>
      <p>${t("about.privacy", "Everything stays in your browser: characters, sessions, check-ins — all of it lives in this device's local storage. No account, no analytics, no server. Your data leaves only when you export it yourself (Settings → Export).")}
      <a href="${PRIVACY_URL}" target="_blank" rel="noopener">${t("about.privacyLink", "The full privacy policy")}</a></p>

      <h3>${t("about.contactH", "Contact and support")}</h3>
      <p>${tf("about.contact", "A bug, a question, a moment it helped? Write to {mail} — or use “Send feedback” below, which can add the technical details for you.", { mail: `<a href="mailto:${SUPPORT_EMAIL}" dir="ltr" lang="en">${SUPPORT_EMAIL}</a>` })}</p>

      <h3>${t("about.creditsH", "Credits")}</h3>
      <p class="about-credits">${t("about.credits", "Built for fun with")} <a href="https://threejs.org" target="_blank" rel="noopener">three.js</a> · ${t("about.creditsPhysics", "physics by")} <a href="https://rapier.rs" target="_blank" rel="noopener">Rapier</a> · ${t("about.creditsModels", "creature models by")} <bdi class="no-fa-digits"><a href="https://quaternius.com" target="_blank" rel="noopener">Quaternius</a> (CC0)</bdi> · ${t("about.creditsAmbient", "ambient recordings from")} <a href="https://mixkit.co" target="_blank" rel="noopener">Mixkit</a> · ${t("about.creditsHdri", "sky lighting from")} <bdi class="no-fa-digits"><a href="https://polyhaven.com/a/meadow" target="_blank" rel="noopener">Poly Haven</a> (CC0)</bdi> · ${t("about.creditsFont", "Persian type:")} <bdi><a href="https://github.com/rastikerdar/vazirmatn" target="_blank" rel="noopener">Vazirmatn</a> (SIL OFL)</bdi> · ${t("about.creditsMade", "made with care by Amir.")}</p>
      <p class="small">${t("about.own", "The story, its characters, the scenes, the writing and the code are the makers' own work; the models, recordings, sky and font above are used under their free licences.")}</p>
      <p class="small about-version">${tf("about.version", "Version {v} · {d}", { v: `<bdi class="no-fa-digits" dir="ltr">${APP_VERSION}</bdi>`, d: (() => {
        try { return new Date(APP_BUILD + "T12:00:00").toLocaleDateString(isRtl() ? "fa-IR" : "en-GB", { year: "numeric", month: "long", day: "numeric" }); } catch { return APP_BUILD; }
      })() })}</p>

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
        // Inline size too: story.js's .cast-face {width:100%} beats the
        // attributes, and the header badge has no box of its own — the
        // portrait grew to its natural 128px and pushed every page down.
        el.innerHTML = `<img class="cast-face baked me" src="${url}" width="${size}" height="${size}" style="width:${size}px;height:${size}px" alt="">`;
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
      // The beard row follows the body: shown for a man or a boy, folded away
      // (and cleared) for a woman or a girl.
      if (key === "bodyType") {
        const fem = val === "woman" || val === "girl";
        const br = root.querySelector(".tw-beard-row");
        if (br) br.hidden = fem;
        if (fem && _travelerDraft.facialHair && _travelerDraft.facialHair !== "none") {
          _travelerDraft = Object.assign({}, _travelerDraft, { facialHair: "none" });
          if (br) br.querySelectorAll("[data-tw]").forEach(b => b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === "none")));
        }
      }
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
