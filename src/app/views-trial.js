// Trial views: coming-soon, the realm ladder, progress / profiles / insights,
// predict → exposure → rate → breathe → complete.
// Classic script: index.html runs src/app/*.js in order, and they share one
// global scope — a top-level name here is visible to every later file.

"use strict";

// A realm's page: the fear's five rungs drawn as a trial path beneath the
// realm's shadow guardian, which visibly shrinks as trials are faced. The
// deep psychoeducation is kept, tucked behind "The Guide's notes"; the
// per-trial psychology drips out as one whisper per reached trial instead.
// A realm outside the launch scope (LAUNCH_OPEN). Honest about why it's
// closed, and points at the realm that IS ready rather than a dead end.
function viewRealmSoon(phobiaKey) {
  const p = PHOBIAS[phobiaKey];
  const realm = realmOf(phobiaKey);
  return `
    <div class="panel soon-panel">
      <span class="badge">${t("soon.badge", "Coming soon")} · ${escapeHtml(t(`phobia.${phobiaKey}.label`, p.label))}</span>
      <h2 style="margin-top:10px">${escapeHtml(realm.realmName)}</h2>
      <p class="realm-epithet">${escapeHtml(realm.epithet)}</p>
      <p>${t("soon.p1b", "This realm is closed while it's rebuilt to the standard of the open ones: a scene that reads how you move, an alarm that rises and then falls while you stay, and trials that end when you've learned something — not when a timer runs out.")}</p>
      <p>${t("soon.p2c", "It opens here when it's ready. Until then, the six open realms hold the whole method — and what you learn there about staying with an alarm works on every fear.")}</p>
      <div class="actions">
        <button class="btn-primary" data-action="go-dogs">${t("soon.toDogs", "To the Meadow Yard →")}</button>
        <button class="btn-ghost" data-action="open-quiz">${t("soon.mirror", "🪞 Take the 60-second self-check")}</button>
      </div>
    </div>`;
}

// The Guide's notes (src/phobia-info.js) through info.<key>.<field>[.<i>].
function infoOf(key) {
  const src = window.PhobiaInfo && window.PhobiaInfo[key];
  if (!src) return null;
  const out = {};
  for (const [f, v] of Object.entries(src)) {
    out[f] = Array.isArray(v) ? v.map((s, i) => t(`info.${key}.${f}.${i}`, s)) : t(`info.${key}.${f}`, v);
  }
  return out;
}

function viewLadder(phobiaKey) {
  const p = PHOBIAS[phobiaKey];
  const realm = realmOf(phobiaKey);
  const prog = getProgress(phobiaKey);
  const previous = state.log.filter(l => l.phobia === phobiaKey);
  const info = infoOf(phobiaKey);
  const ch = window.Character && window.Character.loadCharacter();
  const total = p.levels.length;
  const done = Math.min(total, prog.highestCompleted + 1);
  const cleared = done >= total;
  const realmIdx = journeyKeys().indexOf(phobiaKey);

  // ---- Your ground ----
  // This used to be a shadow with a strength meter you drained. That framing
  // fought the therapy: exposure works by DISCONFIRMING the threat, and a bar
  // labelled "the Hound Shadow · strength 5/5" teaches the opposite — that it
  // really is a monster, and that you got better by beating it. Gains
  // attributed to a ritual don't generalise. The meter was also simply untrue:
  // the dog never weakened, you just stood closer.
  //
  // So measure the only thing that actually changes — the traveller. Every
  // number here is one they produced, from state.log: how far up the ladder
  // they've gone, how long they stayed, what they rated it, and what they
  // PREDICTED they'd rate it. That last pair is the whole mechanism made
  // visible ("you expected 8, it was 4"), and it was already being collected.
  const held = previous.map(l => l.heldSec).filter(n => typeof n === "number" && n > 0);
  const rated = previous.filter(l => typeof l.suds === "number");
  const longest = held.length ? Math.max(...held) : null;
  const firstFear = rated.length ? rated[0].suds : null;
  const lastFear = rated.length ? rated[rated.length - 1].suds : null;
  const guessPairs = previous.filter(l => typeof l.predicted === "number" && typeof l.suds === "number");
  const overGuess = guessPairs.length
    ? guessPairs.reduce((s, l) => s + (l.predicted - feltFor(l)), 0) / guessPairs.length
    : null;
  const realSteps = getWorldsteps(phobiaKey).length;
  const rstat = realmStatus(phobiaKey);
  const groundStat = (label, value) =>
    `<div class="ground-stat"><span class="gs-v">${value}</span><span class="gs-l">${label}</span></div>`;
  const rStars = realmStars(phobiaKey);
  const groundStats = [
    groundStat(t("ground.trials", "trials faced"), `${done}<i>/${total}</i>`),
    groundStat(t("ground.stars", "stars"), `<span class="gs-star">★</span>${rStars.stars}<i>/${rStars.total}</i>`),
    longest != null ? groundStat(t("ground.longest", "longest stay"), `${Math.round(longest)}<i>s</i>`) : "",
    // Only worth showing once there are two readings to compare.
    (firstFear != null && lastFear != null && rated.length > 1)
      ? groundStat(t("ground.fear", "fear, first → last"), `${firstFear}<i>→</i>${lastFear}`) : "",
    // Always shown, even at zero: the real steps are the half of the ladder
    // that transfers, and a stat that only appears once you've earned it is a
    // stat nobody discovers.
    groundStat(t("ground.real", "real steps"), `${realSteps}<i>/${rstat.totalSteps}</i>`),
  ].filter(Boolean).join("");
  const guardian = `
    <div class="ground-box">
      <span class="ground-title">${rstat.tamed
        ? t("ground.tamed", "This realm is behind you")
        : rstat.walked
          ? t("ground.walked", "The valley is walked — the Real Path is what's left")
          : t("ground.head", "Your ground here")}</span>
      <div class="ground-meter"><div class="ground-meter-fill" style="width:${((done / total) * 100).toFixed(0)}%"></div></div>
      <div class="ground-stats">${groundStats}</div>
      ${overGuess != null && overGuess >= 1
        ? `<span class="ground-note">${tf("ground.overguess", "You expect it worse than it is — by {n} points on average.", { n: overGuess.toFixed(1) })}</span>`
        : ""}
    </div>`;

  // The Guide's notes — the full clinical background, kept intact but tucked
  // behind a flap so the page leads with the game, not the syllabus.
  const infoBlock = info ? `
    <details class="phobia-info">
      <summary>${t("guide.notes", "🧭 The Guide's notes — what this fear is, and why facing it works")}</summary>
      <div class="info-body">
        <p class="info-summary">${info.summary}</p>
        <div class="info-grid">
          <div class="info-card">
            <h4>${t("guide.shows", "How it shows up")}</h4>
            <p class="info-sub">${t("guide.body", "In the body")}</p>
            <ul>${info.physical.map(s => `<li>${s}</li>`).join("")}</ul>
            <p class="info-sub">${t("guide.thoughts", "In your thoughts")}</p>
            <ul>${info.cognitive.map(s => `<li>${s}</li>`).join("")}</ul>
          </div>
          ${Array.isArray(info.behaviour) && info.behaviour.length ? `
          <div class="info-card">
            <h4>${t("guide.keeps", "What keeps it going")}</h4>
            <ul>${info.behaviour.map(s => `<li>${s}</li>`).join("")}</ul>
            <p class="info-sub">${t("guide.keepsNote", "Each of these brings relief — and each one quietly tells your brain the danger was real. They're what the trials slowly replace.")}</p>
          </div>` : ""}
          <div class="info-card">
            <h4>${t("guide.why", "Why facing it works")}</h4>
            <p>${info.science}</p>
            <p class="info-prevalence">${info.prevalence}</p>
          </div>
          <div class="info-card">
            <h4>${t("guide.tips", "Tips for the trials")}</h4>
            <ul>${info.tips.map(tip => `<li>${tip}</li>`).join("")}</ul>
          </div>
        </div>
        <div class="info-warning">
          <strong>${t("guide.stepBack", "When to step back:")}</strong> ${info.warning}
        </div>
      </div>
    </details>
  ` : "";

  // Every trial is ALWAYS playable — done / current / future are indicators
  // of your progress, not gates. Your adventure, your pace.
  const items = p.levels.map((lv, i) => {
    const doneT = i <= prog.highestCompleted;
    const current = i === prog.highestCompleted + 1;
    const future = !doneT && !current;
    const lastSuds = previous.filter(l => l.level === i).slice(-1)[0]?.suds;
    const minHold = lv.minHold || (6 + i * 4);
    const flames = Array.from({ length: 5 }, (_, k2) => `<i class="tf ${k2 <= i ? "on" : ""}"></i>`).join("");
    const whisper = (doneT || current)
      ? `<p class="trial-whisper">🕯 ${escapeHtml((realm.whispers && realm.whispers[i]) || "")}</p>`
      : `<p class="trial-whisper misty">${t("trial.misty", "🕯 The whisper for this trial is still in the mist…")}</p>`;
    const stats = [tf("trial.hold", "hold ~{n}s", { n: minHold })];
    if (lastSuds != null) stats.unshift(tf("trial.lastFear", "last fear {n}/10", { n: lastSuds }));
    // Best stars so far; a played trial with a star still open says which.
    const bs = bestStars(phobiaKey, i);
    const openGoal = (bs >= 0 && bs < 3) ? (bestStarGoals(phobiaKey, i) || []).find((g) => !g.done) : null;
    const btn = (doneT && bs >= 0 && bs < 3) ? t("trial.replayStars", "Replay for ★★★")
      : doneT ? t("trial.again", "Face it again") : current ? t("trial.face", "Face this trial") : t("trial.skip", "Skip ahead");
    return `
      <li class="trial ${doneT ? "done" : ""} ${current ? "current" : ""} ${future ? "future" : ""}">
        <div class="trial-marker">${doneT ? "🔥" : `<span>${i + 1}</span>`}</div>
        <div class="trial-card">
          <div class="trial-head">
            <strong>${escapeHtml(lvTitle(phobiaKey, i))}</strong>
            ${bs >= 0 ? starsHTML(bs, 3, "trial-stars") : `<span class="trial-flames" title="${tf("trial.intensity", "intensity {n} of 5", { n: i + 1 })}">${flames}</span>`}
          </div>
          <p class="trial-desc">${escapeHtml(lvDesc(phobiaKey, i))}</p>
          ${openGoal ? `<p class="trial-open">${tf("trial.openStar", "☆ Still open: {g}", { g: escapeHtml(openGoal.text) })}</p>` : ""}
          ${whisper}
          <div class="trial-foot">
            <span class="trial-stats">${stats.join(" · ")}</span>
            <button class="${current ? "btn-primary" : "btn-ghost"}" data-action="start-level" data-phobia="${phobiaKey}" data-level="${i}">${btn}</button>
          </div>
        </div>
      </li>`;
  }).join(`<li class="trial-link" aria-hidden="true"></li>`);

  // Quick-switch tabs across the traveler's own fears.
  const allMine = ch ? [ch.primaryPhobia, ...(ch.additionalPhobias || [])].filter((k) => k && PHOBIAS[k] && realmOpen(k)) : [];
  const tabs = allMine.length > 1 ? `
    <div class="phobia-tabs">
      ${allMine.map(k => `
        <button class="phobia-tab ${k === phobiaKey ? "active" : ""}"
                data-action="select-phobia" data-phobia="${k}">
          ${PHOBIAS[k] ? escapeHtml(realmOf(k).realmName) : k}
        </button>
      `).join("")}
    </div>` : "";

  const sessionsOnThisPhobia = previous.length;
  const progressLink = sessionsOnThisPhobia > 0
    ? `<a href="#${serializeRoute("phobia-progress", { phobia: phobiaKey })}" class="ladder-progress-link">${tf("progress.link", `📜 {n} session${sessionsOnThisPhobia === 1 ? "" : "s"} in this realm · view your record`, { n: sessionsOnThisPhobia })}</a>`
    : "";

  // The oath (goal) block — progress toward the traveler's pledge here.
  const goal = getGoal(phobiaKey);
  const wkSessions = thisWeekSessions(phobiaKey);
  const goalBlock = `
    <div class="goal-block">
      ${goal ? `
        <div class="goal-row">
          <div class="goal-meter">
            <div class="goal-meter-label">
              <span>${t("oath.reach", "Oath: reach trial")}</span>
              <strong>${goal.targetRung + 1} of ${total}</strong>
            </div>
            <div class="goal-meter-track">
              <div class="goal-meter-fill" style="width:${Math.min(100, ((prog.highestCompleted + 1) / (goal.targetRung + 1)) * 100)}%"></div>
            </div>
          </div>
          <div class="goal-meter">
            <div class="goal-meter-label">
              <span>${t("oath.week", "This week")}</span>
              <strong>${wkSessions} of ${goal.perWeek} session${goal.perWeek === 1 ? "" : "s"}</strong>
            </div>
            <div class="goal-meter-track">
              <div class="goal-meter-fill" style="width:${Math.min(100, (wkSessions / goal.perWeek) * 100)}%"></div>
            </div>
          </div>
          <button class="btn-ghost" data-action="edit-goal" data-phobia="${phobiaKey}" style="font-size:11px;padding:5px 10px;">${t("oath.edit", "Edit oath")}</button>
        </div>
      ` : `
        <button class="btn-ghost" data-action="edit-goal" data-phobia="${phobiaKey}">${t("oath.set", "🎯 Swear an oath for this realm")}</button>
      `}
    </div>
  `;

  // One obvious primary action above the fold: continue (or start) the trials.
  const nextIdx = Math.min(total - 1, prog.highestCompleted + 1);
  const ctaLabel = prog.highestCompleted < 0
    ? tf("ladder.begin", "Begin — trial 1: {t}", { t: lvTitle(phobiaKey, 0) })
    : cleared
      ? tf("ladder.again", "Walk it again — trial {n}: {t}", { n: total, t: lvTitle(phobiaKey, total - 1) })
      : tf("ladder.continue", "Continue — trial {n}: {t}", { n: nextIdx + 1, t: lvTitle(phobiaKey, nextIdx) });
  const heroCta = `
    <div class="ladder-cta">
      <button class="btn-primary" data-action="start-level" data-phobia="${phobiaKey}" data-level="${nextIdx}">
        ${escapeHtml(ctaLabel)} <span class="arr">→</span>
      </button>
      <span class="ladder-cta-sub">${tf("ladder.sub", "{n} trials · any order, your pace · Esc grounds you at any moment", { n: total })}</span>
    </div>`;

  const bridgeBlock = bridgeBlockFor(phobiaKey, prog);

  // Who actually lives here. Only the dog realm has named individuals with a
  // remembered relationship — the spider and the snake are creatures, not
  // companions — so this renders for dogs alone rather than being faked for
  // every realm. It is the realm's real arc, stated: the animal you were
  // afraid of is one that increasingly knows you.
  let companionBlock = "";
  if (phobiaKey === "dogs") {
    const rows = dogCompanions().map((c) => {
      const pct = Math.round(c.trust * 100);
      // Three states, not two: a traveller can have earned trust before this
      // build started recording encounters, and telling them "you haven't been
      // in the room together" directly under "knows your face" reads as a bug.
      const when = c.seen && c.seen.temper
        ? tf("dog.lastSeen", "last time it seemed {t}", { t: escapeHtml(temperText(c.seen.temper)) })
        : c.met
          ? t("dog.metBefore", "you've met before")
          : t("dog.notYet", "you haven't been in the room together");
      return `
        <li class="dog-row ${c.band.tone}">
          <div class="dog-id">
            <strong>${escapeHtml(c.name)}</strong>
            <span class="dog-species">${t("dog." + c.species, c.species)} · ${t("dog.rungs." + c.breed, c.rungs)}</span>
          </div>
          <div class="dog-bond">
            <span class="dog-band">${c.band.label}</span>
            <span class="dog-track"><i style="width:${pct}%"></i></span>
            <span class="dog-when">${when}</span>
          </div>
        </li>`;
    }).join("");
    companionBlock = `
      <section class="companion-block">
        <div class="bridge-head">
          <h3>${t("dog.head", "🐾 Who's in the yard")}</h3>
          <span class="bridge-sub">${t("dog.sub", "Two dogs live in this realm, and they remember you between visits. Time near them — not just time in here — is what moves this.")}</span>
        </div>
        <ul class="dog-list">${rows}</ul>
      </section>`;
  }

  // ---- The way out: the treatment path, made visible ----
  // Every piece of the method already lived somewhere on this page (the
  // Mirror, the trials, the Real Path) but nothing said they were ONE path,
  // in an order, with a start and a keep-it-up. Five steps, each a button
  // that goes to its part, the current one lit.
  let pathStrip = "";
  let fieldGuideBlock = "";
  if (hasCreatureKit(phobiaKey)) {
    const checksN = getChecks(phobiaKey).length;
    const stepsP = [
      { n: 1, title: t("tp.s1", "Understand it"), done: primerSeen(phobiaKey),
        sub: primerSeen(phobiaKey) ? t("tp.s1done", "the trap & the way out") : t("tp.s1sub", "one-minute primer"),
        act: `data-action="open-primer" data-phobia="${phobiaKey}"` },
      { n: 2, title: t("tp.s2", "Measure it"), done: checksN > 0,
        sub: checksN > 0 ? tf("tp.s2done", "{n} mirror{s}", { n: checksN, s: checksN === 1 ? "" : "s" }) : t("tp.s2sub", "60-second mirror"),
        act: `data-action="fear-check" data-phobia="${phobiaKey}" data-at="${checksN ? "manual" : "baseline"}"` },
      { n: 3, title: t("tp.s3", "Face it here"), done: done >= total,
        sub: tf("tp.s3sub", "{a} of {b} trials", { a: done, b: total }),
        act: `data-action="start-level" data-phobia="${phobiaKey}" data-level="${Math.min(total - 1, prog.highestCompleted + 1)}"` },
      { n: 4, title: t("tp.s4", "Take it outside"), done: realSteps >= rstat.totalSteps && rstat.totalSteps > 0,
        sub: tf("tp.s4sub", "{a} of {b} real steps", { a: realSteps, b: rstat.totalSteps }),
        act: `data-action="scroll-to" data-target=".bridge-block"` },
      { n: 5, title: t("tp.s5", "Keep it"), done: false,
        sub: (rstat.tamed || done >= total) ? t("tp.s5open", "your keep-it plan") : t("tp.s5sub", "once you're through"),
        act: `data-action="open-keep" data-phobia="${phobiaKey}"` },
    ];
    const nowIdx = stepsP.findIndex((x) => !x.done);
    pathStrip = `
      <section class="treat-path" aria-label="${escapeHtml(t("tp.aria", "Your way out of this fear"))}">
        <div class="bridge-head">
          <h3>${t("tp.head", "🧭 Your way out")}</h3>
          <span class="bridge-sub">${t("tp.sub", "The same path a therapist would walk with you — in order, at your pace.")}</span>
        </div>
        <ol class="tp-steps">
          ${stepsP.map((x, i) => `
            <li class="tp-step ${x.done ? "done" : i === nowIdx ? "now" : "later"}">
              <button type="button" ${x.act}>
                <span class="tp-n">${x.done ? "✓" : x.n}</span>
                <span class="tp-t">${x.title}</span>
                <span class="tp-s">${x.sub}</span>
              </button>
            </li>`).join("")}
        </ol>
      </section>`;
    // The field guide: the body language this traveller has met and named.
    const KIT = CREATURE_KITS[phobiaKey];
    const order = Object.keys(KIT.signals);
    const fg = phobiaKey === "dogs" ? dogFieldGuide() : kitFieldGuide(phobiaKey);
    const seenIds = order.filter((id) => fg[id] && fg[id].seen > 0);
    const cards = order.map((id) => {
      const S = KIT.signals[id], e = fg[id];
      if (!e || !e.seen) return `<li class="fg-card unseen"><span class="fg-ic">?</span><b>${t("fg.unseen", "Not met yet")}</b></li>`;
      const cl = KIT.classes[S.cls];
      return `<li class="fg-card seen cls-${cl.tone || S.cls}" title="${escapeHtml(kitSignalText(phobiaKey, id, "means"))}">
          <span class="fg-ic">${S.icon}</span><b>${escapeHtml(kitSignalText(phobiaKey, id, "name"))}</b>
          <i>${cl.dot} ${escapeHtml(kitClassLabel(phobiaKey, S.cls))}</i>
          <p>${escapeHtml(kitSignalText(phobiaKey, id, "means"))}</p>
        </li>`;
    }).join("");
    const fgHead = phobiaKey === "dogs" ? t("fg.head", "👁 Reading dogs — your field guide")
      : isPlaceKit(phobiaKey) ? t("fg.head3", "👁 Alarm or not? — your field guide")
      : tf("fg.head2", "👁 Reading {nouns} — your field guide", { nouns: kitNoun(phobiaKey, true) });
    const fgSub = seenIds.length
      ? (phobiaKey === "dogs"
        ? tf("fg.sub", "{n} of {m} signals read. Fear hears every dog signal as danger; most of them are saying relaxed, curious, or \"give me a moment\".", { n: seenIds.length, m: order.length })
        : tf(`fg.sub.${phobiaKey}`, ({
            spiders: "{n} of {m} signals read. Fear sees every spider movement as coming for you; most of it is resting, or going somewhere else.",
            snakes: "{n} of {m} signals read. Fear reads every flick and every movement as a strike coming; most of it is at ease, or curious.",
            heights: "{n} of {m} moments named. Fear hears every sensation up high as \"you're about to fall\"; they're your body's alarm, and a high place being high.",
            dark: "{n} of {m} moments named. Fear fills the dark with someone; it's the house, and your mind filling in the gaps.",
            enclosed: "{n} of {m} moments named. Fear hears every sensation in a small space as \"trapped\"; they're your body's alarm, and a room being a room.",
          })[phobiaKey] || "{n} of {m} signals read.", { n: seenIds.length, m: order.length }))
      : (phobiaKey === "dogs"
        ? t("fg.subEmpty", "In the trials, the dogs show real body language — and you'll be asked what it means. Everything you read lands here.")
        : isPlaceKit(phobiaKey)
        ? t("fg.subEmpty3", "In the trials, things happen — in the place and in your body — and you'll be asked what each one is. Everything you name lands here.")
        : tf("fg.subEmpty2", "In the trials, the {noun} shows real body language — and you'll be asked what it means. Everything you read lands here.", { noun: kitNoun(phobiaKey) }));
    fieldGuideBlock = `
      <section class="fieldguide-block">
        <div class="bridge-head">
          <h3>${fgHead}</h3>
          <span class="bridge-sub">${fgSub}</span>
        </div>
        <ul class="fg-grid">${cards}</ul>
      </section>`;
  }

  // The Mirror: baseline invite on first visit, then a quiet chip with the
  // latest score + delta and a re-check link. Rated about real life — this
  // is the realm's outcome measure, not another game stat.
  const checks = getChecks(phobiaKey);
  const lastC = latestCheck(phobiaKey);
  const baseC = checks[0] || null;
  let mirrorBlock = "";
  if (!checks.length) {
    mirrorBlock = `
      <div class="mirror-invite">
        <span class="bridge-invite-kicker">${(getProgress(phobiaKey).highestCompleted ?? -1) < 0
          ? t("mirror.before", "🪞 Before your first trial")
          : t("mirror.measure", "🪞 Measure it — about real life")}</span>
        <strong>${t("mirror.title", "Hold up the Mirror — 60 seconds")}</strong>
        <p>${t("mirror.p", "Five quick questions about how this fear is in <em>real life</em> right now. Do it once now, and later mirrors will show you — in numbers — how much quieter it gets.")}</p>
        <button class="btn-primary" data-action="fear-check" data-phobia="${phobiaKey}" data-at="baseline">${t("mirror.btn", "Look in the mirror")}</button>
      </div>`;
  } else {
    const band = fearCheckBand(lastC.total);
    const delta = baseC && lastC !== baseC ? lastC.total - baseC.total : null;
    mirrorBlock = `
      <div class="mirror-chip">
        <span>${tf("mirror.chip", "🪞 The fear out there: {n}/20 — {band}", { n: `<strong>${lastC.total}</strong>`, band: band.label })}${delta != null ? (delta < 0 ? ` · ${tf("mirror.down", "▼{n} since your first mirror", { n: Math.abs(delta) })}` : delta > 0 ? ` · ${tf("mirror.up", "▲{n} since your first mirror", { n: delta })}` : "") : ""}</span>
        <button class="btn-ghost mirror-recheck" data-action="fear-check" data-phobia="${phobiaKey}" data-at="manual">${t("mirror.recheck", "Re-check")}</button>
      </div>`;
  }

  return `
    <div class="realm-view">
      <header class="realm-hero">
        <div class="realm-hero-art" aria-hidden="true">${phobiaThumbnail(phobiaKey)}</div>
        <div class="realm-hero-grad" aria-hidden="true"></div>
        <div class="realm-3d" id="realmHero3d" title="${t("realm.drag", "Drag to look around")}"></div>
        <div class="realm-hero-text">
          <span class="realm-kicker">${realmIdx >= 0 ? `${t("realmWord", "Realm")} ${ROMAN[realmIdx] || realmIdx + 1} · ` : ""}${escapeHtml(phName(phobiaKey))} — ${escapeHtml(phLabel(phobiaKey))}</span>
          <h2>${escapeHtml(realm.realmName)}</h2>
          <p class="realm-epithet">${escapeHtml(realm.epithet)}</p>
        </div>
      </header>
      ${guardian}
      ${(() => {
        // This realm's chapter of the story. A page waiting here — before the
        // first trial, the resident's own account of how their fear began —
        // is offered in full; otherwise one line says how far the chapter is.
        const S = window.Story, chap = S && S.chapterOfRealm(phobiaKey);
        if (!chap) return "";
        const ids = chap.beats.map((b) => b.id);
        const waiting = ids.find((id) => S.isUnlocked(id) && !S.isSeen(id));
        if (waiting) return S.cardHTML(waiting, { kicker: `📖 ${escapeHtml(S.chapterLabel(chap))}` });
        const read = ids.filter((id) => S.isSeen(id)).length;
        return `<p class="realm-story-line">📖 ${escapeHtml(S.chapterLabel(chap))} · ${tf("rs.read", "{a} of {b} pages read", { a: read, b: ids.length })} · <button type="button" class="linklike" data-action="open-story">${t("rs.open", "open the story")}</button></p>`;
      })()}
      ${pathStrip}
      ${ch ? `<div class="realm-bubble"><span class="realm-bubble-avatar" aria-hidden="true">${window.Character.avatarSVG(ch, 40)}</span><span>${tf("camp.sayLine", "“{line}”", { line: escapeHtml(cleared ? realm.clearedLine : realm.line) })}</span></div>` : ""}
      ${tabs}
      ${mirrorBlock}
      ${heroCta}
      <section class="path-block">
        <div class="bridge-head">
          <h3>${t("valley.head", "🏕 The Valley")}</h3>
          <span class="bridge-sub">${t("valley.sub", "Five trials in here, at your pace. This is the rehearsal — safe, repeatable, and yours to stop at any moment.")}</span>
        </div>
        <ol class="trial-path">${items}</ol>
      </section>
      ${bridgeBlock}
      ${(() => {
        // The evidence log: every experiment run in this realm, newest first.
        // This is the realm's collected proof — the thing the numbers panel
        // summarises, itemised.
        const ev = window.PhobiaExperiments ? PhobiaExperiments.evidenceOf(phobiaKey) : [];
        if (!ev.length) return "";
        const rows = ev.slice(-6).reverse().map((l) => {
          const txt = PhobiaExperiments.lineText(phobiaKey, l);
          return `
          <div class="evidence-line">
            <span class="ev-note">${escapeHtml(txt.note)}</span>
            <span class="ev-vs">${tf("exp.vs2", "You expected: “{p}”", { p: escapeHtml(txt.predicted) })} · ${new Date(l.ts).toLocaleDateString()}</span>
          </div>`;
        }).join("");
        return `
          <section class="evidence-block">
            <h3>${tf("exp.ladderH", "🧾 Evidence collected here — {n} test{s}", { n: ev.length, s: ev.length === 1 ? "" : "s" })}</h3>
            ${rows}
          </section>`;
      })()}
      ${companionBlock}
      ${fieldGuideBlock}
      ${goalBlock}
      ${progressLink}
      ${infoBlock}
    </div>
  `;
}

// "The Real Path" — the realm's real-world bridge quests. Each finished
// in-game trial unlocks the matching real step; steps are invitations, never
// gates (nothing in the game requires them). Completion self-reports on the
// same SUDS scale via a small modal and pays more courage than game trials.
function bridgeBlockFor(phobiaKey, prog) {
  const steps = bridgeOf(phobiaKey);
  const rows = steps.map((s, i) => {
    const unlocked = i <= prog.highestCompleted;
    const done = worldstepDone(phobiaKey, i);
    const rec = done ? getWorldsteps(phobiaKey).find(w => w.step === i) : null;
    return `
      <li class="bridge-step ${done ? "done" : unlocked ? "open" : "locked"}">
        <span class="bridge-mark">${done ? "🌍" : unlocked ? "☐" : "🔒"}</span>
        <div class="bridge-text">
          <strong>${escapeHtml(s.t)}</strong>
          ${unlocked && !done ? `<p>${escapeHtml(s.how)}</p>` : ""}
          ${done ? `<p class="bridge-done-note">${t("bridge.faced", "Faced")}${rec && rec.suds != null ? ` · ${tf("bridge.fear", "fear {n}/10", { n: rec.suds })}` : ""}${rec ? ` · ${new Date(rec.ts).toLocaleDateString()}` : ""}</p>` : ""}
          ${!unlocked ? `<p class="bridge-locked-note">${tf("bridge.locked", "Face trial {n} in the valley to unlock this step.", { n: i + 1 })}</p>` : ""}
        </div>
        ${unlocked && !done ? `<button class="btn-ghost bridge-btn" data-action="do-worldstep" data-phobia="${phobiaKey}" data-step="${i}">${t("bridge.didThis", "I did this")}</button>` : ""}
      </li>`;
  }).join("");
  return `
    <section class="bridge-block">
      <div class="bridge-head">
        <h3>${t("bridge.head", "🌍 The Real Path")}</h3>
        <span class="bridge-sub">${t("bridge.sub", "The valley is practice. These small steps out there are the point — always optional, always your pace, worth extra courage.")}</span>
      </div>
      <ol class="bridge-list">${rows}</ol>
    </section>`;
}

// Tiny SVG line+dot chart for SUDS history. Returns an inline-SVG string.
function drawSudsChart(sessions, w = 320, h = 100) {
  if (!sessions || sessions.length === 0) {
    return `<svg viewBox="0 0 ${w} ${h}" class="insight-chart"><text x="${w/2}" y="${h/2}" text-anchor="middle" fill="#94a3b8" font-size="12">${t("chart.none", "No sessions yet")}</text></svg>`;
  }
  const padX = 10, padY = 12;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  // X-axis: session index. Y-axis: SUDS 0..10 (top is calm, bottom is panic — invert so high = up)
  const points = sessions.map((s, i) => {
    const x = padX + (sessions.length === 1 ? innerW / 2 : (i / (sessions.length - 1)) * innerW);
    const y = padY + (1 - (s.suds / 10)) * innerH;
    return [x, y, s];
  });
  // Predicted dots (lighter)
  const predictedDots = sessions.map((s, i) => {
    if (s.predicted == null) return "";
    const x = padX + (sessions.length === 1 ? innerW / 2 : (i / (sessions.length - 1)) * innerW);
    const y = padY + (1 - (s.predicted / 10)) * innerH;
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.5" fill="#94a3b8" opacity="0.6"/>`;
  }).join("");
  // Connect actual SUDS with a smooth line
  const linePts = points.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const dots = points.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5" fill="#7cd1c5"/>`).join("");
  // Reference grid lines at 3 and 7 (low/high SUDS thresholds)
  const grid = [3, 7].map(v => {
    const y = padY + (1 - v / 10) * innerH;
    return `<line x1="${padX}" y1="${y}" x2="${w - padX}" y2="${y}" stroke="#25324f" stroke-width="1" stroke-dasharray="2,3"/>`;
  }).join("");
  return `
    <svg viewBox="0 0 ${w} ${h}" class="insight-chart" preserveAspectRatio="none" width="100%" height="${h}">
      ${grid}
      <polyline points="${linePts}" fill="none" stroke="#7cd1c5" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${predictedDots}
      ${dots}
      <text x="${padX}" y="${padY - 2}" fill="#64748b" font-size="9">${t("scale.panic", "10 panic")}</text>
      <text x="${padX}" y="${h - 2}" fill="#64748b" font-size="9">${t("scale.calm", "0 calm")}</text>
    </svg>
  `;
}

function viewPhobiaProgress(phobiaKey) {
  const p = PHOBIAS[phobiaKey];
  if (!p) return `<div class="panel"><h2>${t("nf.h", "Not found")}</h2><p>${t("nf.p", "That phobia doesn't exist on this device.")}</p></div>`;
  const sessions = state.log.filter(l => l.phobia === phobiaKey);
  const prog = state.progress[phobiaKey];
  const highest = prog ? prog.highestCompleted + 1 : 0;
  const total = p.levels.length;

  // Per-rung stats — average SUDS + attempts per rung
  const rungStats = p.levels.map((lv, i) => {
    const ss = sessions.filter(s => s.level === i);
    return {
      title: lvTitle(phobiaKey, i),
      attempts: ss.length,
      avg: ss.length ? (ss.reduce((s, l) => s + l.suds, 0) / ss.length) : null,
      best: ss.length ? Math.min(...ss.map(s => s.suds)) : null,
    };
  });

  // How many distinct sets of conditions this fear has been met in. Facing the
  // same thing in ONE unchanging room is the weakest form of practice; this is
  // the number that says the calm is likely to travel.
  const condCount = new Set(sessions.map(l => l.ctx).filter(Boolean)).size;

  // Journal notes timeline (most recent first)
  const notes = sessions.filter(s => s.note).slice().reverse();

  return `
    <div class="panel">
      <a href="#${serializeRoute("ladder", { phobia: phobiaKey })}" class="back-link">${tf("pp.back", "← Back to {fear} ladder", { fear: escapeHtml(phLabel(phobiaKey)) })}</a>
      <h2>${escapeHtml(phLabel(phobiaKey))} <span class="small" style="color:var(--accent)">— ${escapeHtml(phName(phobiaKey))}</span></h2>
      <p>${tf(sessions.length === 1 ? "pp.sum1" : "pp.sum", `{a}/{b} rungs · {n} session${sessions.length === 1 ? "" : "s"}`, { a: highest, b: total, n: sessions.length })}</p>

      <div class="stats-row">
        <div class="stat"><div class="stat-num">${highest}</div><div class="stat-lbl">${t("pp.highest", "highest rung")}</div></div>
        <div class="stat"><div class="stat-num">${sessions.length}</div><div class="stat-lbl">${t("pp.sessions", "sessions")}</div></div>
        <div class="stat"><div class="stat-num">${sessions.length ? (sessions.reduce((s, l) => s + l.suds, 0) / sessions.length).toFixed(1) : "—"}</div><div class="stat-lbl">${t("pp.avg", "avg SUDS")}</div></div>
        <div class="stat" title="${t("prog.condTip", "Each visit puts you in a different time of day and weather. Facing the same thing in changing conditions is what makes the calm carry into real life.")}"><div class="stat-num">${condCount || "—"}</div><div class="stat-lbl">${t("prog.conditions", "conditions faced")}</div></div>
      </div>

      <div class="insight-card">
        <h3>${t("pp.chart", "SUDS over time")}</h3>
        ${drawSudsChart(sessions, 600, 120)}
        <div class="insight-legend">
          <span><span class="dotmark" style="background:var(--accent)"></span>${t("pp.actual", "actual")}</span>
          <span><span class="dotmark" style="background:#94a3b8;opacity:.6"></span>${t("pp.predicted", "predicted")}</span>
        </div>
      </div>

      <h3 style="margin-top:18px">${t("pp.perRung", "Per rung")}</h3>
      <div class="rung-stats">
        ${rungStats.map((r, i) => `
          <div class="rung-stat ${r.attempts ? "" : "untouched"}">
            <div class="rung-stat-num">${i + 1}</div>
            <div class="rung-stat-text">
              <strong>${escapeHtml(r.title)}</strong>
              <span class="small">${r.attempts ? tf(r.attempts === 1 ? "pp.attempts1" : "pp.attempts", `{n} attempt${r.attempts === 1 ? "" : "s"} · avg {a} · best {b}`, { n: r.attempts, a: r.avg.toFixed(1), b: r.best }) : t("pp.notYet", "Not yet attempted")}</span>
            </div>
          </div>
        `).join("")}
      </div>

      ${notes.length ? `
        <h3 style="margin-top:18px">${t("pp.journal", "Journal")}</h3>
        <div class="journal-list">
          ${notes.map(n => `
            <div class="journal-entry">
              <div class="journal-meta">
                <span class="journal-rung">${tf("pp.rung", "Rung {n}", { n: n.level + 1 })}</span>
                <span class="small">${new Date(n.ts).toLocaleString()}</span>
                <span class="small">${tf("pp.suds", "SUDS {n}/10", { n: n.suds })}</span>
              </div>
              <p>${escapeHtml(n.note)}</p>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function viewProfiles() {
  if (!window.Character) return `<div class="panel"><p>${t("loading", "Loading…")}</p></div>`;
  const all = window.Character.loadCharacters();
  const activeId = window.Character.activeCharacterId();
  const cards = all.map((c, i) => {
    const isActive = c.id === activeId;
    const sessions = (state.byCharacter && state.byCharacter[c.id] && state.byCharacter[c.id].log) || [];
    const phobiaCount = c.primaryPhobia ? 1 + (c.additionalPhobias || []).length : 0;
    return `
      <div class="profile-card ${isActive ? "active" : ""}" data-action="select-character" data-id="${c.id}" style="--i:${i}">
        <div class="profile-avatar">${window.Character.avatarSVG(c, 70)}</div>
        <div class="profile-text">
          <strong>${escapeHtml(c.name || t("pr.unnamed", "Unnamed"))}</strong>
          <span class="small">${tf("pr.counts", `{f} fear${phobiaCount === 1 ? "" : "s"} · {s} session${sessions.length === 1 ? "" : "s"}`, { f: phobiaCount, s: sessions.length })}</span>
          ${isActive ? `<span class="profile-badge">${t("pr.active", "active")}</span>` : ""}
        </div>
        <div class="profile-actions">
          <button class="btn-ghost" data-action="edit-character-id" data-id="${c.id}" data-stop="1">${t("set.edit", "Edit")}</button>
          ${all.length > 1 ? `<button class="btn-warn" data-action="delete-character" data-id="${c.id}" data-stop="1">${t("pr.delete", "Delete")}</button>` : ""}
        </div>
      </div>
    `;
  }).join("");
  // "Your journey" — a quick, rewarding summary of the ACTIVE character's
  // progress (state.log / state.progress track the active character).
  const streak = computeStreak();
  const totalSessions = state.log.length;
  const rungsClimbed = Object.values(state.progress).reduce((s, p) => s + Math.max(0, (p.highestCompleted ?? -1) + 1), 0);
  // Two different achievements, and calling both "ladders done" hid the one
  // that matters. Walking the five trials is the rehearsal; a realm is only
  // behind you once the real steps are walked too (see realmStatus). The
  // profile said "1 ladder done" while the map still showed the realm unfinished.
  const statuses = Object.keys(PHOBIAS).map((k) => realmStatus(k));
  const valleysWalked = statuses.filter((s) => s.walked).length;
  const realmsDone = statuses.filter((s) => s.tamed).length;
  const stepsTaken = worldstepCount();
  const statStrip = `
    <div class="stat-strip">
      <div class="stat-tile" style="--i:0"><span class="stat-num">${streak}</span><span class="stat-lbl">${t("profile.streak", "🔥 day streak")}</span></div>
      <div class="stat-tile" style="--i:1"><span class="stat-num">${totalSessions}</span><span class="stat-lbl">${t("profile.sessions", `session${totalSessions === 1 ? "" : "s"}`)}</span></div>
      <div class="stat-tile" style="--i:2"><span class="stat-num">${rungsClimbed}</span><span class="stat-lbl">${t("profile.rungs", "rungs climbed")}</span></div>
      <div class="stat-tile" style="--i:3"><span class="stat-num">${stepsTaken}</span><span class="stat-lbl">${t("profile.realSteps", `🌍 real step${stepsTaken === 1 ? "" : "s"}`)}</span></div>
      <div class="stat-tile" style="--i:4"><span class="stat-num">${valleysWalked}</span><span class="stat-lbl">${t("profile.valleys", `valley${valleysWalked === 1 ? "" : "s"} walked`)}</span></div>
      <div class="stat-tile" style="--i:5"><span class="stat-num">${realmsDone}</span><span class="stat-lbl">${t("profile.realms", `realm${realmsDone === 1 ? "" : "s"} behind you`)}</span></div>
    </div>`;
  // Trophy case — the active character's earned milestones (the full data
  // model already exists; Insights shows it too, but the profile is the natural
  // home for "what I've achieved").
  const unlocked = unlockedMilestones();
  const milestonesSection = `
    <h3 style="margin-top:26px">${t("ms.h", "Milestones")}</h3>
    <p class="small">${tf("ms.earnedP", "{a} of {b} earned — they unlock as you make progress.", { a: unlocked.length, b: MILESTONES.length })}</p>
    <div class="milestones-grid">
      ${MILESTONES.map(m => {
        const got = unlocked.includes(m.id);
        return `<div class="milestone ${got ? "earned" : "locked"}" style="--i:${MILESTONES.indexOf(m)}">
          <div class="milestone-icon">${got ? m.icon : "🔒"}</div>
          <div class="milestone-text"><strong>${m.title}</strong><span class="small">${m.desc}</span></div>
        </div>`;
      }).join("")}
    </div>`;
  return `
    <div class="panel">
      <h2>${t("pr.h", "Your characters")}</h2>
      <p>${t("pr.p", "Each character keeps its own ladder progress, SUDS log, and phobia list. Switch between them any time.")}</p>
      ${statStrip}
      <div class="profiles-grid">${cards}</div>
      <div class="actions">
        <button class="btn-primary" data-action="new-character">${t("pr.new", "+ New character")}</button>
      </div>
      ${milestonesSection}
    </div>
  `;
}

function viewInsights() {
  const character = window.Character && window.Character.loadCharacter();
  const myPhobias = character
    ? [character.primaryPhobia, ...(character.additionalPhobias || [])].filter(Boolean)
    : Object.keys(state.progress);
  // Always include any phobias in the log even if not in profile
  for (const k of Object.keys(state.progress)) if (!myPhobias.includes(k)) myPhobias.push(k);

  const totalSessions = state.log.length;
  const completedRungs = Object.values(state.progress).reduce((sum, p) => sum + (p.highestCompleted + 1), 0);
  // Average prediction-vs-actual gap (only sessions that recorded a prediction)
  const predicted = state.log.filter(l => l.predicted != null);
  const avgGap = predicted.length
    ? predicted.reduce((s, l) => s + (l.predicted - feltFor(l)), 0) / predicted.length
    : null;

  if (myPhobias.length === 0) {
    return `<div class="panel">
      <h2>${t("nav.progress", "Your progress")}</h2>
      <p>${t("ins.empty", "Once you've completed a rung, this is where the data lives. SUDS scores, prediction-vs-actual gaps, and your highest rung per phobia.")}</p>
    </div>`;
  }

  const cards = myPhobias.map(key => {
    const p = PHOBIAS[key];
    if (!p) return "";
    const sessions = state.log.filter(l => l.phobia === key);
    const prog = state.progress[key];
    const highest = prog ? prog.highestCompleted + 1 : 0;
    const total = p.levels.length;
    const avg = sessions.length
      ? (sessions.reduce((s, l) => s + l.suds, 0) / sessions.length).toFixed(1)
      : "—";
    return `
      <div class="insight-card">
        <div class="insight-head">
          <div class="insight-icon">${p.icon}</div>
          <div>
            <h3>${escapeHtml(phLabel(key))}</h3>
            <div class="small">${tf(sessions.length === 1 ? "ins.sum1" : "ins.sum", `{a}/{b} rungs · {n} session${sessions.length === 1 ? "" : "s"} · avg SUDS {avg}`, { a: highest, b: total, n: sessions.length, avg })}</div>
          </div>
        </div>
        ${drawSudsChart(sessions, 320, 90)}
        <div class="insight-legend">
          <span><span class="dotmark" style="background:#7cd1c5"></span>${t("pp.actual", "actual")}</span>
          <span><span class="dotmark" style="background:#94a3b8;opacity:.6"></span>${t("pp.predicted", "predicted")}</span>
        </div>
        <div class="actions" style="margin-top:8px">
          <button class="btn-ghost" data-action="select-phobia" data-phobia="${key}">${t("ins.open", "Open ladder")}</button>
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="panel">
      <h2>${t("nav.progress", "Your progress")}</h2>
      <p>${t("ins.p", "Each chart plots how anxious you actually felt on each rung you climbed. Lighter dots are your <em>predictions</em> — the gap between predicted and actual is where the brain learns.")}</p>
      <div class="stats-row">
        <div class="stat"><div class="stat-num">${totalSessions}</div><div class="stat-lbl">${t("ins.total", "total sessions")}</div></div>
        <div class="stat"><div class="stat-num">${completedRungs}</div><div class="stat-lbl">${t("profile.rungs", "rungs climbed")}</div></div>
        <div class="stat"><div class="stat-num">${avgGap == null ? "—" : (avgGap >= 0 ? "+" : "") + avgGap.toFixed(1)}</div><div class="stat-lbl">${t("ins.over", "avg over-prediction")}</div></div>
      </div>
      ${(avgGap != null && predicted.length >= 2) ? `<p class="hint" style="margin-top:-4px;margin-bottom:16px">${
        avgGap >= 0.8 ? tf("ins.lower", `On average, your fear came in about <strong>{n} point${avgGap >= 1.5 ? "s" : ""} lower</strong> than you predicted. Your brain keeps over-estimating the danger — and each rung is teaching it otherwise.`, { n: avgGap.toFixed(1) })
        : avgGap <= -0.8 ? t("ins.worse", "Lately it's felt a little worse than you expected. That's honest data — slow down and repeat rungs until the numbers settle.")
        : t("ins.close", "Your predictions are landing close to what you actually feel — you're getting accurate at reading your own body.")
      }</p>` : ""}
      <div class="insights-grid">${cards}</div>

      ${(() => {
        const unlocked = unlockedMilestones();
        return `
          <h3 style="margin-top:24px">${t("ms.h", "Milestones")}</h3>
          <p class="small">${tf("ms.autoP", "Auto-unlocked as you make progress. {a} of {b} earned.", { a: unlocked.length, b: MILESTONES.length })}</p>
          <div class="milestones-grid">
            ${MILESTONES.map(m => {
              const got = unlocked.includes(m.id);
              return `<div class="milestone ${got ? "earned" : "locked"}">
                <div class="milestone-icon">${got ? m.icon : "🔒"}</div>
                <div class="milestone-text">
                  <strong>${m.title}</strong>
                  <span class="small">${m.desc}</span>
                </div>
              </div>`;
            }).join("")}
          </div>
        `;
      })()}

      <div class="actions" style="margin-top:18px">
        <button class="btn-primary" id="shareCardBtn">${t("ins.share", "Share progress card")}</button>
        <button class="btn-ghost" data-action="open-report">${t("ins.report", "📄 Full report for a therapist")}</button>
      </div>
    </div>
  `;
}

function viewPredict(phobiaKey, levelIdx) {
  const p = PHOBIAS[phobiaKey];
  const lv = p.levels[levelIdx];
  // A neutral rung-based starting point. Deliberately NOT seeded from the last
  // actual SUDS — that made a repeat prediction just echo what happened, which
  // hollows out the predict-vs-actual signal the whole mechanic depends on.
  const suggested = Math.min(8, 4 + levelIdx);
  // The gate: the story's beat (one card), what's behind the door, one
  // number, one big button. It used to open with two paragraphs on how fear
  // makes predictions, a practice box, seven chips with their own
  // explanation, and a scale with its own — the longest read in the game,
  // standing between a visitor and the thing they came to face.
  const focus = window.Story && !window.__demoMode ? window.Story.focusFor(phobiaKey, levelIdx) : null;
  const kit = hasCreatureKit(phobiaKey);
  return `
    <div class="panel gate-panel">
      ${window.Story ? window.Story.gateHTML(phobiaKey, levelIdx) : ""}
      <div class="gate-trial">
        <span class="badge">${tf("predict.badge", "Trial {n} of {m} — {realm}", { n: levelIdx + 1, m: p.levels.length, realm: escapeHtml(realmOf(phobiaKey).realmName) })}</span>
        <h2>${escapeHtml(lvTitle(phobiaKey, levelIdx))}</h2>
        ${lv.desc ? `<p class="gate-desc">${escapeHtml(lvDesc(phobiaKey, levelIdx))}</p>` : ""}
        ${focus && focus.text ? `<p class="gate-focus">${tf("gate.focus", "🎯 Today's practice: {t}", { t: escapeHtml(focus.text) })}</p>` : ""}
      </div>

      <div class="suds gate-suds">
        <label id="lbl-predictedSuds">${t("predict.label2", "How scared do you expect to feel in there?")}</label>
        ${sudsScale("predictedSuds", suggested, { picked: true, valueId: "predictedValue" })}
      </div>
${kit ? `
      <div class="expect-block gate-expect">
        <div class="expect-q">${expectQ(phobiaKey)} <span class="gate-opt">${t("gate.optional", "optional")}</span></div>
        <div class="expect-chips" role="radiogroup" aria-label="${escapeHtml(expectQ(phobiaKey))}">
          ${CREATURE_KITS[phobiaKey].fears.map((f) => `<button type="button" class="expect-chip" role="radio" aria-checked="false" data-action="pick-fear" data-fear="${f.id}">${escapeHtml(kitFearText(phobiaKey, f.id))}</button>`).join("")}
          <button type="button" class="expect-chip expect-none" role="radio" aria-checked="false" data-action="pick-fear" data-fear="none">${t("expect.none", "Nothing specific — just the feeling")}</button>
        </div>
        <div class="suds expect-belief" id="expectBeliefBox" hidden>
          <label for="expectBelief">${t("expect.belief", "How sure are you that it'll happen?")}</label>
          <div class="scale-row">
            <span class="small">${t("expect.lo", "0% no way")}</span>
            <input type="range" id="expectBelief" min="0" max="100" step="5" value="50"/>
            <span class="small">${t("expect.hi", "100% certain")}</span>
            <div class="value" id="expectBeliefValue">—</div>
          </div>
        </div>
      </div>` : ""}

      <div class="actions gate-actions">
        <button class="btn-primary btn-xl gate-enter" data-action="confirm-predict" data-phobia="${phobiaKey}" data-level="${levelIdx}">${t("predict.enter2", "Enter the trial →")}</button>
        <button class="btn-ghost" data-action="back-ladder" data-phobia="${phobiaKey}">${t("complete.back", "Back to the realm")}</button>
      </div>
      <p class="gate-note">${t("gate.note", "Afterwards you'll say how it really was. The gap between the guess and the real thing is where fear unlearns.")}</p>
    </div>
  `;
}

function viewExposure(phobiaKey, levelIdx) {
  const p = PHOBIAS[phobiaKey];
  const lv = p.levels[levelIdx];
  // Recommended hold time scales with the rung — harder rungs ask you to sit
  // with the feeling longer, the way real exposure does.
  const minHold = lv.minHold || (6 + levelIdx * 4); // default 6, 10, 14, 18, 22 s; a rung may set its own
  const intensity = lv.intensity || "";
  // Per-phobia command bar (the "game" buttons under the stage)
  let cmdBar = "";
  if (phobiaKey === "dogs" && intensity !== "barking") {
    // Dogs is character-driven: walk near the dog, the dog notices and reacts;
    // click the dog to pet, click the floor to throw a ball, alt-click for a
    // treat. The button bar is collapsed by default but available via the
    // "Tips" toggle for accessibility / touch users who prefer it.
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="dogs">
        <button class="cmd-btn" data-cmd="sit" title="${tf("cmd.key", "Keyboard: {k}", { k: "E" })}"><span class="cmd-icon">🐾</span><span>${t("cmd.settle", "Settle (E)")}</span></button>
        <button class="cmd-btn" data-cmd="ball" title="${tf("cmd.key", "Keyboard: {k}", { k: "B" })}"><span class="cmd-icon">⚪</span><span>${t("cmd.ball", "Throw ball (B)")}</span></button>
        <button class="cmd-btn" data-cmd="treat" title="${tf("cmd.key", "Keyboard: {k}", { k: "T" })}"><span class="cmd-icon">🦴</span><span>${t("cmd.treat", "Give treat (T)")}</span></button>
        <button class="cmd-btn" data-cmd="call" title="${tf("cmd.key", "Keyboard: {k}", { k: "C" })}"><span class="cmd-icon">👋</span><span>${t("cmd.call", "Call (C)")}</span></button>
      </div>
    `;
  } else if (phobiaKey === "dogs" && intensity === "barking") {
    // Rung 5 has nothing to command: the dog is the stimulus and your feet
    // are the only lever. (It used to show two permanently disabled buttons,
    // "Soften gaze" and "Step back", which on touch auto-opened as the whole
    // interface — and taught retreat as the skill.)
    cmdBar = "";
  } else if (phobiaKey === "heights") {
    // Heights is walk-driven, and its hotbar holds the four verbs the
    // trial's skill stars use — walk to the edge, look down, lean over, drop
    // a coin — so it opens like every other realm's. Stepping back is your
    // own feet (it was a button that made retreat look like the skill), and
    // the railing shakes when you click it in the world.
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="heights">
        <button class="cmd-btn" data-cmd="edge"><span class="cmd-icon">↘</span><span>${t("cmd.h.edge", "Walk to edge")}</span></button>
        <button class="cmd-btn" data-cmd="lookdown"><span class="cmd-icon">⤓</span><span>${t("cmd.h.look", "Look down")}</span></button>
        <button class="cmd-btn" data-cmd="lean" title="${t("cmd.h.leanTip", "Lean over the railing")}"><span class="cmd-icon">⤴</span><span>${t("cmd.h.lean", "Lean over")}</span></button>
        <button class="cmd-btn" data-cmd="coin"><span class="cmd-icon">🪙</span><span>${t("cmd.h.coin", "Drop a coin")}</span></button>
      </div>
    `;
  } else if (phobiaKey === "water") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="water">
        <button class="cmd-btn" data-cmd="splash"><span class="cmd-icon">💦</span><span>Splash</span></button>
        <button class="cmd-btn" data-cmd="lookdown"><span class="cmd-icon">⤓</span><span>Look down</span></button>
      </div>
    `;
  } else if (phobiaKey === "spiders") {
    // Tools that put the user in a calm, empowered position rather than a
    // panic-fight one. "Glass jar" is the real-life humane catch technique
    // — the spider goes under the jar, you slide a card under, and you can
    // release it outside. Click on the spider to drop the jar.
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="spiders">
        <button class="cmd-btn" data-cmd="closer" title="${t("cmd.sp.closerTip", "Walk a little closer")}"><span class="cmd-icon">→</span><span>${t("cmd.sp.closer", "Step closer")}</span></button>
        <button class="cmd-btn" data-cmd="back" title="${t("cmd.sp.backTip", "Step back if you need to")}"><span class="cmd-icon">←</span><span>${t("cmd.sp.back", "Step back")}</span></button>
        <button class="cmd-btn" data-cmd="focus" title="${t("cmd.sp.lookTip", "Tap to face it · hold to look closer (Z)")}"><span class="cmd-icon">🔍</span><span>${t("cmd.sp.look", "Look closer (hold)")}</span></button>
        <button class="cmd-btn" data-cmd="jar" title="${t("cmd.sp.jarTip", "Click the spider to lower the glass")}"><span class="cmd-icon">🫙</span><span>${t("cmd.sp.jar", "Glass")}</span></button>
      </div>
    `;
  } else if (phobiaKey === "flying") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="flying">
        <button class="cmd-btn" data-cmd="window"><span class="cmd-icon">🪟</span><span>Look out</span></button>
        <button class="cmd-btn" data-cmd="grip"><span class="cmd-icon">🤲</span><span>Grip armrests</span></button>
        <button class="cmd-btn" data-cmd="tray"><span class="cmd-icon">📋</span><span>Tray down/up</span></button>
        <button class="cmd-btn" data-cmd="breath"><span class="cmd-icon">🫁</span><span>Steady breath</span></button>
      </div>
    `;
  } else if (phobiaKey === "speaking") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="speaking">
        <button class="cmd-btn" data-cmd="speak" data-press="true" title="Hold while you speak — Space"><span class="cmd-icon">🎤</span><span>Hold to speak (Space)</span></button>
        <button class="cmd-btn" data-cmd="pause" title="Take a beat"><span class="cmd-icon">⏸</span><span>Pause &amp; breathe</span></button>
        <button class="cmd-btn" data-cmd="sip" title="Click the glass on the podium to sip"><span class="cmd-icon">💧</span><span>Sip water</span></button>
        <button class="cmd-btn" data-cmd="notes" title="Glance at your notes"><span class="cmd-icon">📄</span><span>Glance at notes</span></button>
      </div>
    `;
  } else if (phobiaKey === "enclosed") {
    // One door, always working. The lift rides; the scanner slides you in.
    const eBtns = levelIdx === 4
      ? `<button class="cmd-btn" data-cmd="slide" title="${tf("cmd.key", "Keyboard: {k}", { k: "E" })}"><span class="cmd-icon">↕</span><span class="cmd-label">${t("cmd.e.slideIn", "Slide in")}</span></button>`
      : levelIdx === 2
        ? `<button class="cmd-btn" data-cmd="ride" title="${tf("cmd.key", "Keyboard: {k}", { k: "E" })}"><span class="cmd-icon">↕</span><span>${t("cmd.e.ride", "Ride two floors")}</span></button>
           <button class="cmd-btn" data-cmd="open"><span class="cmd-icon">◀▶</span><span>${t("cmd.e.openDoors", "Open the doors")}</span></button>
           <button class="cmd-btn" data-cmd="touch"><span class="cmd-icon">✋</span><span>${t("cmd.e.touch", "Touch the wall")}</span></button>`
        : `<button class="cmd-btn" data-cmd="door" title="${tf("cmd.key", "Keyboard: {k}", { k: "E" })}"><span class="cmd-icon">🚪</span><span class="cmd-label">${t("cmd.e.close", "Close the door")}</span></button>
           <button class="cmd-btn" data-cmd="light"><span class="cmd-icon">💡</span><span>${t("cmd.e.light", "Light switch")}</span></button>
           <button class="cmd-btn" data-cmd="touch"><span class="cmd-icon">✋</span><span>${t("cmd.e.touch", "Touch the wall")}</span></button>`;
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="enclosed">
        ${eBtns}
      </div>
    `;
  } else if (phobiaKey === "needles") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="needles">
        <button class="cmd-btn" data-cmd="look-away"><span class="cmd-icon">👀</span><span>Look away</span></button>
        <button class="cmd-btn" data-cmd="look-back"><span class="cmd-icon">👁</span><span>Look back</span></button>
        <button class="cmd-btn" data-cmd="bandage"><span class="cmd-icon">🩹</span><span>Press bandage</span></button>
      </div>
    `;
  } else if (phobiaKey === "snakes") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="snakes">
        <button class="cmd-btn" data-cmd="still" data-press="true" title="${t("cmd.sn.stillTip", "Hold to stay calm — snake retreats")}"><span class="cmd-icon">🧘</span><span>${t("cmd.sn.still", "Hold still")}</span></button>
        <button class="cmd-btn" data-cmd="extend" data-press="true" title="${t("cmd.sn.extendTip", "Press and hold to slowly extend your hand")}"><span class="cmd-icon">✋</span><span>${t("cmd.sn.extend", "Extend hand")}</span></button>
        <button class="cmd-btn" data-cmd="back-step"><span class="cmd-icon">↩</span><span>${t("cmd.sn.back", "Step back")}</span></button>
        <button class="cmd-btn" data-cmd="leaf"><span class="cmd-icon">🍃</span><span>${t("cmd.sn.leaf", "Drop a leaf")}</span></button>
      </div>
    `;
  } else if (phobiaKey === "driving") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="driving">
        <button class="cmd-btn" data-cmd="mirror"><span class="cmd-icon">🪞</span><span>Check mirror</span></button>
        <button class="cmd-btn" data-cmd="indicator"><span class="cmd-icon">↜</span><span>Indicator</span></button>
        <button class="cmd-btn" data-cmd="brake"><span class="cmd-icon">⏸</span><span>Light brake</span></button>
      </div>
    `;
  } else if (phobiaKey === "storms") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="storms">
        <button class="cmd-btn" data-cmd="count"><span class="cmd-icon">🔢</span><span>Count seconds</span></button>
        <button class="cmd-btn" data-cmd="step-in"><span class="cmd-icon">🏠</span><span>Step inside</span></button>
        <button class="cmd-btn" data-cmd="candle"><span class="cmd-icon">🕯</span><span>Light a candle</span></button>
      </div>
    `;
  } else if (phobiaKey === "dark") {
    cmdBar = `
      <div class="scene-cmd-bar collapsed" data-scene="dark">
        <button class="cmd-btn" data-cmd="flashlight" data-press="true" title="${tf("cmd.key", "Keyboard: {k}", { k: "F" })}"><span class="cmd-icon">🔦</span><span>${t("cmd.d.torch", "Hold flashlight")}</span></button>
        <button class="cmd-btn" data-cmd="name"><span class="cmd-icon">🔍</span><span>${t("cmd.d.name", "Name what you see")}</span></button>
        <button class="cmd-btn" data-cmd="match"><span class="cmd-icon">🔥</span><span>${t("cmd.d.match", "Light a match")}</span></button>
      </div>
    `;
  }
  // Touch-first devices: the command bar IS the interface — there is no
  // keyboard, no hover, no right-click. Start it OPEN (hiding every action
  // behind "Show controls" made scenes feel dead on phones) and strip the
  // key-letter suffixes, which read as noise when no keyboard exists.
  if (cmdBar && isCoarsePointer()) {
    cmdBar = cmdBar.replace(/ \((?:E|B|T|C|S|Space)\)<\/span>/g, "</span>");
  } else if (cmdBar) {
    // Desktop: the key letter becomes a small keycap instead of "(E)".
    cmdBar = cmdBar.replace(/ \((E|B|T|C|S|Space)\)<\/span>/g, ' <kbd class="cmd-key">$1</kbd></span>');
  }
  // A compact bar (≤4 actions) is the scene's hotbar: open from the start on
  // every device and never toggled, so the verbs are there to find without a
  // "Show controls" button flipping a panel in and out.
  if (cmdBar && (cmdBar.match(/cmd-btn/g) || []).length <= 4) {
    cmdBar = cmdBar.replace('class="scene-cmd-bar collapsed"', 'class="scene-cmd-bar"');
  }
  return `
    <div class="panel exposure-panel">
      <div class="exposure-header">
        <div class="badge">${tf("exp.stepBadge", "Step {n} of {m}", { n: levelIdx + 1, m: p.levels.length })} · ${escapeHtml(t(`phobia.${phobiaKey}.label`, p.label))}</div>
        <h2>${escapeHtml(lvTitle(phobiaKey, levelIdx))}</h2>
        <p>${escapeHtml(lvDesc(phobiaKey, levelIdx))}</p>
        ${(() => {
          // Today's practice stays in view above the stage for the whole
          // trial (the one-off prompt in the scene can be overtaken by the
          // scene's own lines). Not on replays, not in the demo.
          const f = window.Story && !window.__demoMode && (getProgress(phobiaKey).highestCompleted ?? -1) < levelIdx
            ? window.Story.focusFor(phobiaKey, levelIdx) : null;
          return f ? `<p class="exp-focus">🎯 ${escapeHtml(f.text)}</p>` : "";
        })()}
      </div>
      <div class="stage-wrap">
        <div class="stage ${p.sceneClass}" id="stage" data-min-hold="${minHold}" data-level="${levelIdx}"><div class="loading">${t("stage.loading", "Setting the scene…")}</div></div>
        ${cmdBar}
      </div>
      <div class="step-controls">
        <button class="btn-warn" data-action="do-breathe" data-phobia="${phobiaKey}" data-level="${levelIdx}">${t("stage.breathe", "Pause &amp; breathe")}</button>
        <button class="btn-primary holding" id="continueBtn" data-action="to-rate" data-phobia="${phobiaKey}" data-level="${levelIdx}">${t("hold.stepOut", "Step out early")}</button>
        <div class="hold-bar"><div id="holdBarFill"></div></div>
        <span class="hold-label" id="holdLabel">0 / ${minHold}s</span>
        <span class="timer" id="timer">00:00</span>
      </div>
    </div>
  `;
}

// A 0–10 reading as eleven tappable numbers — one tap, no dragging a thumb
// to a spot. The range input stays (hidden) as the value's home, so every
// reader of #suds / #sudsPeak / #predictedSuds and the document-level input
// listener work unchanged; a chip just sets it and fires "input".
function sudsColor(v) {
  const a = Math.max(0, Math.min(1, v / 10));
  const lerp = (x, y, k) => Math.round(x + (y - x) * k);
  const [r, g, b] = a < 0.5
    ? [lerp(124, 245, a / 0.5), lerp(209, 176, a / 0.5), lerp(197, 75, a / 0.5)]
    : [lerp(245, 239, (a - 0.5) / 0.5), lerp(176, 107, (a - 0.5) / 0.5), lerp(75, 91, (a - 0.5) / 0.5)];
  return `rgb(${r},${g},${b})`;
}
function sudsScale(id, value, { picked = false, aria = "", valueId = "" } = {}) {
  return `
    <input type="range" id="${id}" class="suds-range" min="0" max="10" value="${value}" tabindex="-1" aria-hidden="true"/>
    <div class="suds-chips" role="radiogroup" data-for="${id}" ${aria ? `aria-label="${escapeHtml(aria)}"` : `aria-labelledby="lbl-${id}"`}>
      ${Array.from({ length: 11 }, (_, v) => {
        const on = picked && v === +value;
        return `<button type="button" class="sc${on ? " on" : ""}" role="radio" aria-checked="${on}" data-v="${v}" style="--c:${sudsColor(v)}">${v}</button>`;
      }).join("")}
    </div>
    <div class="suds-ends"><span>${t("scale.calm", "0 calm")}</span><span>${t("scale.panic", "10 panic")}</span></div>
    ${valueId ? `<span id="${valueId}" hidden>${picked ? value : "—"}</span>` : ""}`;
}
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest && e.target.closest(".suds-chips .sc");
  if (!b) return;
  const inp = document.getElementById(b.parentElement.dataset.for);
  if (!inp) return;
  inp.value = b.dataset.v;
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  inp.dispatchEvent(new Event("change", { bubbles: true }));
  try { if (window.PhobiaFX && window.PhobiaFX.haptic) window.PhobiaFX.haptic(8); } catch {}
});
function syncSudsChips(inp) {
  const row = inp && inp.id && document.querySelector(`.suds-chips[data-for="${inp.id}"]`);
  if (!row) return;
  row.querySelectorAll(".sc").forEach((x) => {
    const on = x.dataset.v === String(inp.value);
    x.classList.toggle("on", on);
    x.setAttribute("aria-checked", on ? "true" : "false");
  });
}

function viewRate(phobiaKey, levelIdx) {
  const earlyNote = (lastRungOutcome && lastRungOutcome.finished === false)
    ? `<p class="small" style="opacity:.75">${t("rate.early", "You stepped out before the hold finished — that is always allowed. Rate how it felt anyway.")}</p>`
    : "";
  return `
    <div class="panel">
      <h2>${t("rate.h2", "The trial is behind you. How loud was it?")}</h2>
      ${earlyNote}
      <p>${t("rate.p", "Two readings on the <strong>SUDS</strong> scale — Subjective Units of Distress. Be honest; the journal is only for you.")}</p>
      <div class="suds">
        <label id="lbl-sudsPeak">${t("rate.peakLabel", "At its worst, in there")}</label>
        ${sudsScale("sudsPeak", 5, { aria: t("rate.peakAria", "Anxiety level at its worst during the trial, 0 calm to 10 panic"), valueId: "sudsPeakValue" })}
        <div class="hint" id="sudsPeakHint">${t("rate.peakHint", "The highest it got while you were in the scene — this is the number your prediction was about.")}</div>
      </div>
      <div class="suds">
        <label id="lbl-suds">${t("rate.nowLabel", "Right now")}</label>
        ${sudsScale("suds", 5, { aria: t("rate.nowAria", "Anxiety level right now, 0 calm to 10 panic"), valueId: "sudsValue" })}
        <div class="hint" id="sudsHint">${t("rate.hintTap", "Tap a number for how it actually felt — there's no right answer.")}</div>
        <div class="hint">${t("rate.bands", "Low (0–3): you're ready to climb. &nbsp; Mid (4–6): a breath break helps. &nbsp; High (7–10): stay here, breathe, repeat.")}</div>
      </div>
      <div class="actions">
        <button class="btn-warn" data-action="do-breathe" data-phobia="${phobiaKey}" data-level="${levelIdx}">${t("rate.breathe", "Take a breath first")}</button>
        <button class="btn-primary" id="rateSubmit" data-action="submit-rate" data-phobia="${phobiaKey}" data-level="${levelIdx}" disabled>${t("rate.save", "Save &amp; continue")}</button>
      </div>
    </div>
  `;
}

function viewBreathe(phobiaKey, levelIdx) {
  return `
    <div class="panel">
      <h2>${t("breathe.h2", "The campfire breath")}</h2>
      <p>${t("breathe.p", "A traveler's tool: follow the circle. In for 4, out for 6 — the long exhale presses your body's brake pedal. Stay as long as you like; the fire isn't going anywhere.")}</p>
      <div class="breath-wrap">
        <div class="breath-circle" id="breathCircle">${t("breath.go", "Breathe")}</div>
      </div>
      <div class="actions" style="justify-content: center;">
        <button class="btn-primary" data-action="after-breathe" data-phobia="${phobiaKey}" data-level="${levelIdx}">${t("breathe.btn", "I'm calmer — continue")}</button>
      </div>
    </div>
  `;
}

function viewComplete(phobiaKey, levelIdx, suds, predicted, peak) {
  const p = PHOBIAS[phobiaKey];
  const isLast = levelIdx === p.levels.length - 1;
  const next = levelIdx + 1;
  // Early exit is acknowledged as a valid choice — not celebrated as a
  // completed rung (the log entry this view reads was just pushed).
  const last = state.log[state.log.length - 1];
  const early = last && last.phobia === phobiaKey && last.level === levelIdx && last.finished === false;
  const advice = early ? t("advice.early", "Ending early is a valid choice, not a failure. When you're ready, try this rung again and stay a little longer.")
               : suds <= 3 ? t("advice.low", "You're handling this well. The next rung will be a small bump.")
               : suds <= 6 ? t("advice.mid", "Solid. Consider repeating this rung once more before climbing.")
               : t("advice.high", "Stay on this rung for a few more passes. You don't need to feel calm to climb — but each repeat is new evidence, and the alarm gets quieter with it.");

  // Prediction comparison block.
  // Scored against the PEAK, not the end-of-trial reading — the prediction
  // asked how loud it would get while you were in there, so that is the only
  // number that can answer it honestly. See handleRateSubmit for why the old
  // predicted-vs-now comparison was systematically flattering.
  let predictionBlock = "";
  const peakForPrediction = (peak == null || Number.isNaN(+peak)) ? suds : +peak;
  if (predicted != null && !Number.isNaN(predicted)) {
    const diff = predicted - peakForPrediction;
    let lesson, tone;
    if (diff >= 2) {
      tone = "good";
      // When the user braced for catastrophe (high prediction) and it landed
      // low, name that explicitly — it's the single most therapeutic realisation.
      lesson = (predicted >= 7 && peakForPrediction <= 4)
        ? tf("lesson.braced", "You expected this to be a <strong>{p}/10</strong> — near the top — and at its worst it was a <strong>{w}/10</strong>. You braced for something that didn't come. That gap, felt directly, is your brain updating what's actually dangerous.", { p: predicted, w: peakForPrediction })
        : tf(diff === 1 ? "lesson.quieter1" : "lesson.quieter", `At its worst it was <strong>{d} point${diff === 1 ? "" : "s"} quieter</strong> than you predicted. The brain learns by noticing this gap — please notice it.`, { d: diff });
    } else if (diff <= -2) {
      tone = "warn";
      lesson = t("lesson.higher", "Your fear was a touch higher than you predicted. That's data too — sit with what surprised you, then plan a repeat.");
    } else {
      tone = "neutral";
      lesson = t("lesson.close", "Your prediction was close to what you felt. That's a sign you're getting accurate at reading your own body.");
    }
    predictionBlock = `
      <div class="prediction-card prediction-${tone}">
        <div class="prediction-meters">
          <div class="meter-row">
            <span class="meter-label">${t("meter.predicted", "Predicted")}</span>
            <div class="meter-track"><div class="meter-fill" style="width:${predicted * 10}%; background:#94a3b8"></div></div>
            <span class="meter-value">${predicted}/10</span>
          </div>
          <div class="meter-row">
            <span class="meter-label">${t("meter.worst", "At its worst")}</span>
            <div class="meter-track"><div class="meter-fill" style="width:${peakForPrediction * 10}%"></div></div>
            <span class="meter-value">${peakForPrediction}/10</span>
          </div>
        </div>
        <p class="prediction-lesson">${lesson}</p>
      </div>
    `;
  }

  // ---- The reality check (dogs): the feared outcome vs what the dog did ----
  // The single most useful comparison in the whole flow: not "how anxious
  // did you feel" but "did the thing your fear predicted actually happen?",
  // answered from what the scene observed — then the belief, re-rated.
  let realityBlock = "", waveBlock = "";
  const lastEntry = (last && last.phobia === phobiaKey && last.level === levelIdx) ? last : null;
  const ev = lastEntry && lastEntry.ev;
  if (ev && lastEntry.expect && lastEntry.expect.fear) {
    const X = lastEntry.expect;
    const KIT = CREATURE_KITS[phobiaKey] || CREATURE_KITS.dogs;
    const r = KIT.reality(X.fear, ev, ev.dog, early);
    const coped = { dogs: ["bark", "stare", "run"], spiders: ["run", "jump", "lose"], snakes: ["come", "strike", "rear"],
      heights: ["pull", "dizzy"], dark: ["sound", "shape"], enclosed: [] }[phobiaKey] || [];
    const verdict = r.happened
      ? (coped.includes(X.fear)
          ? (phobiaKey === "dogs" ? t("rc.vCoped", "It happened — and nothing your fear attached to it did. Loud, close, looked at: and you were fine.")
            : t(`rc.vCoped.${phobiaKey}`, ({
              spiders: "It happened — and nothing your fear attached to it did. Fast, close, sudden: and you were fine.",
              snakes: "It happened — and nothing your fear attached to it did. Close, big, a warning: and you were fine.",
              heights: "It happened — and nothing your fear attached to it did. You felt it, and you stayed standing where you chose.",
              dark: "It happened — and every time it was the room, not someone in it.",
            })[phobiaKey] || "It happened — and nothing your fear attached to it did."))
          : t("rc.vHappened", "That one happened. It's worth trying this trial again — each repeat is new evidence."))
      : t("rc.vNo", "Your fear's prediction didn't come true.");
    realityBlock = `
      <div class="reality-card ${r.happened ? "rc-happened" : "rc-no"}">
        <span class="bridge-invite-kicker">${t("rc.kicker", "🧪 Reality check")}</span>
        <div class="rc-row"><span class="rc-lab">${t("rc.predicted", "Your alarm predicted")}</span>
          <span><strong>${tf("camp.sayLine", "“{line}”", { line: escapeHtml(kitFearText(phobiaKey, X.fear)) })}</strong>${X.belief != null ? ` <span class="rc-bel">${tf("rc.sure", "{n}% sure", { n: X.belief })}</span>` : ""}</span></div>
        <div class="rc-row"><span class="rc-lab">${t("rc.happened", "What happened")}</span><span>${r.line}</span></div>
        <p class="rc-verdict">${verdict}</p>
        <div class="suds rc-after">
          <label for="beliefAfter">${phobiaKey === "dogs"
            ? tf("rc.again", "Now: if you walked into that room again, how sure would you be that “{f}”?", { f: escapeHtml(kitFearText(phobiaKey, X.fear)) })
            : tf("rc.again2", "Now: if you faced that again, how sure would you be that “{f}”?", { f: escapeHtml(kitFearText(phobiaKey, X.fear)) })}</label>
          <div class="scale-row">
            <span class="small">0%</span>
            <input type="range" id="beliefAfter" min="0" max="100" step="5" value="${X.beliefAfter != null ? X.beliefAfter : (X.belief != null ? X.belief : 50)}"/>
            <span class="small">100%</span>
            <div class="value" id="beliefAfterValue">${X.beliefAfter != null ? X.beliefAfter + "%" : "—"}</div>
          </div>
          <div class="hint" id="beliefDelta">${X.beliefAfter != null ? beliefDeltaText(X.belief, X.beliefAfter)
            : X.belief != null ? tf("rc.was", "Before the trial you said {n}%. Move the slider to answer honestly.", { n: X.belief })
            : t("rc.wasNone", "Move the slider to answer honestly. (Rate it before the next trial too — the change between the two is the lesson.)")}</div>
        </div>
      </div>`;
  }
  // The alarm, drawn: the same wave the player watched live, whole.
  if (ev && Array.isArray(ev.wave) && ev.wave.length > 4) {
    const W = 560, H = 104, P = 6;
    const n = ev.wave.length, dur = Math.max(1, ev.dur || n);
    const x = (i) => P + (i / (n - 1)) * (W - P * 2);
    const y = (v) => H - P - (Math.max(0, Math.min(100, v)) / 100) * (H - P * 2 - 10);
    const pts = ev.wave.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    const area = `M${x(0).toFixed(1)},${H - P} L${pts.split(" ").join(" L")} L${x(n - 1).toFixed(1)},${H - P} Z`;
    const pk = Math.max(...ev.wave), pi = ev.wave.indexOf(pk);
    const mk = (ev.marks || []).map((m) => {
      const mx = P + Math.min(1, m.t / dur) * (W - P * 2);
      const g = (m.kind === "bark" || m.kind === "spike") ? "•" : m.kind === "escape" ? "↩" : (m.kind === "run" || m.kind === "lunge") ? "»" : m.kind === "settle" ? "✓" : "";
      const c = m.kind === "escape" ? "#ef6b5b" : m.kind === "settle" ? "#34d399" : "#cbd5e1";
      return g ? `<text x="${mx.toFixed(1)}" y="11" text-anchor="middle" font-size="10" fill="${c}">${g}</text>` : "";
    }).join("");
    const settleNote = ev.settledAt != null
      ? tf("wave.settled", "It peaked at <b>{p}</b> and settled by about <b>{s}s</b> — while you stayed.", { p: ev.peak, s: ev.settledAt })
      : tf("wave.notSettled", "It peaked at <b>{p}</b> and ended at <b>{e}</b>. It hadn't fully settled yet — a longer stay next time lets it.", { p: ev.peak, e: ev.end });
    const extras = [];
    const habN = phobiaKey === "dogs" ? ev.barks : ((CREATURE_KITS[phobiaKey] || {}).habKinds || []).reduce((a, k) => a + ((ev.kinds || {})[k] || 0), 0);
    if (habN >= 3) extras.push(phobiaKey === "dogs" ? t("wave.barks", "Each • is a bark — watch the spikes shrink as they repeat.")
      : t(`wave.hab.${phobiaKey}`, ({
          spiders: "Each • is a sudden dash your way — watch the spikes shrink as they repeat.",
          snakes: "Each • is a rear-up or a hiss — watch the spikes shrink as they repeat.",
          heights: "Each • is a gust or a look straight down — watch the spikes shrink as they repeat.",
          dark: "Each • is a sound in the dark — watch the spikes shrink as they repeat.",
          enclosed: "Each • is a knock, a hum or the door clicking shut — watch the spikes shrink as they repeat.",
        })[phobiaKey] || "Each • is a spike — watch them shrink as they repeat."));
    if (ev.escapes > 0) extras.push(tf("wave.escapes", "↩ marks where you backed off ({n}×): the alarm dropped fast, and came straight back when you returned. That's avoidance, drawn.", { n: ev.escapes }));
    if (ev.reads > 0) extras.push(phobiaKey === "dogs" ? tf("wave.reads", "You read the dog {r} of {n} times right.", { r: ev.readsRight, n: ev.reads })
      : isPlaceKit(phobiaKey) ? tf("wave.reads3", "You named {r} of {n} moments right.", { r: ev.readsRight, n: ev.reads })
      : tf("wave.reads2", "You read the {noun} {r} of {n} times right.", { noun: kitNoun(phobiaKey), r: ev.readsRight, n: ev.reads }));
    waveBlock = `
      <div class="wave-card">
        <span class="bridge-invite-kicker">${t("wave.kicker", "〰 Your alarm, this trial")}</span>
        <svg viewBox="0 0 ${W} ${H}" class="wave-svg" role="img" aria-label="${escapeHtml(tf("wave.aria", "Alarm over the trial: peak {p}, end {e}", { p: ev.peak, e: ev.end }))}">
          <defs><linearGradient id="wvg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ef6b5b" stop-opacity=".35"/><stop offset=".55" stop-color="#f5b04b" stop-opacity=".2"/><stop offset="1" stop-color="#7cd1c5" stop-opacity=".08"/></linearGradient></defs>
          <path d="${area}" fill="url(#wvg)"/>
          <polyline points="${pts}" fill="none" stroke="#f5b04b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
          <circle cx="${x(pi).toFixed(1)}" cy="${y(pk).toFixed(1)}" r="3.2" fill="#ef6b5b"/>
          <circle cx="${x(n - 1).toFixed(1)}" cy="${y(ev.wave[n - 1]).toFixed(1)}" r="3.2" fill="#7cd1c5"/>
          ${mk}
        </svg>
        <p class="wave-note">${settleNote}</p>
        ${extras.length ? `<p class="wave-extra small">${extras.join(" ")}</p>` : ""}
      </div>`;
  }

  // Within-rung habituation: the body spiked and then came down WHILE the user
  // stayed. This is the felt heart of exposure — surface it explicitly. Never
  // shown on an early exit: "that fall, without escaping" would be factually
  // wrong for someone who left mid-hold, and it would undercut the honest
  // early-exit framing above.
  let habituationBlock = "";
  const peakN = (peak == null || Number.isNaN(+peak)) ? null : +peak;
  if (!early && peakN != null && peakN >= 2 && peakN > suds) {
    habituationBlock = `
      <div class="prediction-card prediction-good">
        <div class="prediction-meters">
          <div class="meter-row">
            <span class="meter-label">${t("meter.peak", "At its peak")}</span>
            <div class="meter-track"><div class="meter-fill" style="width:${peakN * 10}%; background:#e3a06b"></div></div>
            <span class="meter-value">${peakN}/10</span>
          </div>
          <div class="meter-row">
            <span class="meter-label">${t("meter.end", "By the end")}</span>
            <div class="meter-track"><div class="meter-fill" style="width:${suds * 10}%"></div></div>
            <span class="meter-value">${suds}/10</span>
          </div>
        </div>
        <p class="prediction-lesson">${tf("lesson.within", "Your anxiety rose to about <strong>{p}/10</strong> — and while you stayed, it came down to <strong>{s}/10</strong>. That fall, <em>without escaping</em>, is your nervous system learning it is safe. This is habituation, and it's exactly how fear unwinds.", { p: peakN, s: suds })}</p>
      </div>
    `;
  }

  // Between-session habituation: the proof exposure works. If the user has done
  // THIS rung before and rated it lower now, show it at the moment of impact —
  // "last time X, this time Y". Only surfaced on a real drop (>=2), never on an
  // increase (that would discourage), and never on an early exit.
  let acrossBlock = "";
  if (!early) {
    const sameRung = state.log.filter(l => l.phobia === phobiaKey && l.level === levelIdx);
    const prev = sameRung.length >= 2 ? sameRung[sameRung.length - 2] : null;
    if (prev && typeof prev.suds === "number" && (prev.suds - suds) >= 2) {
      acrossBlock = `
      <div class="prediction-card prediction-good">
        <div class="prediction-meters">
          <div class="meter-row">
            <span class="meter-label">${t("meter.last", "Last time")}</span>
            <div class="meter-track"><div class="meter-fill" style="width:${prev.suds * 10}%; background:#94a3b8"></div></div>
            <span class="meter-value">${prev.suds}/10</span>
          </div>
          <div class="meter-row">
            <span class="meter-label">${t("meter.this", "This time")}</span>
            <div class="meter-track"><div class="meter-fill" style="width:${suds * 10}%"></div></div>
            <span class="meter-value">${suds}/10</span>
          </div>
        </div>
        <p class="prediction-lesson">${tf("lesson.across", "Last time this rung was a <strong>{a}/10</strong>. Today it's a <strong>{b}/10</strong>. Same situation, less fear — that's your nervous system learning it's safe, across sessions. This is the whole point.", { a: prev.suds, b: suds })}</p>
      </div>`;
    }
  }

  // Concrete reward at the peak-motivation moment — courage earned, streak,
  // any milestone. Gated to THIS session (key + fresh ts) so a hash re-nav
  // doesn't replay a stale "+15". Calm strip, not confetti. (day-N only >=2 to
  // avoid streak-pressure on day 1.)
  let rewardStrip = "";
  let shadowStrip = "";
  let celebration = "";
  let bridgeInvite = "";
  let mirrorPrompt = "";
  if (lastAward && lastAward.key === `${phobiaKey}.${levelIdx}` && last && Math.abs((last.ts || 0) - lastAward.ts) < 5000) {
    const bits = [tf("reward.courage", "+{n} courage", { n: lastAward.points })];
    if (lastAward.daily) bits.push(t("reward.ember", "🔥 daily ember +15"));
    if (lastAward.streakAfter >= 2) bits.push(tf("reward.day", "day {n} of practice", { n: lastAward.streakAfter }));
    rewardStrip = `<div class="reward-strip">${bits.join(" · ")}${lastAward.milestones.length ? `<div class="reward-milestone">${escapeHtml(tf("reward.milestone", "🏅 Milestone unlocked: {list}", { list: lastAward.milestones.join(t("list.sep", ", ")) }))}</div>` : ""}</div>`;
    // Progress feedback at the peak moment. This used to show a blob with
    // eyes shrinking beside "the Hound Shadow weakened — strength 3/5", which
    // is the boss framing at the loudest point in the whole flow. The traveller
    // moved; the dog did not. Report the move.
    if (!early && lastAward.advanced) {
      const rs = realmStatus(phobiaKey);
      shadowStrip = `
        <div class="ground-gain" aria-label="${tf("gain.aria", "Trials faced: {a} of {b}", { a: rs.trials, b: rs.totalTrials })}">
          <span class="gg-line">
            🏮 ${tf("gain.flames", "{realm}'s lantern: {n} of {m} flames lit", { realm: escapeHtml(realmOf(phobiaKey).realmName), n: `<strong>${rs.trials}</strong>`, m: rs.totalTrials })}
          </span>
          <span class="gg-meter"><i style="width:${((rs.trials / rs.totalTrials) * 100).toFixed(0)}%"></i></span>
          ${rs.walked
            ? `<span class="gg-note">${rs.tamed
                ? t("gain.tamed", "🕊 Every trial and every real step — this realm is behind you.")
                : tf("gain.stepsLeft", "The valley is walked. {n} of {s} real steps taken — those are the ones that follow you home.", { n: rs.steps, s: rs.totalSteps })}</span>`
            : ""}
        </div>`;
    }
    // The bridge invitation: this finish just unlocked the matching
    // real-world step. Shown at the motivation peak, framed as an
    // invitation — the game never requires it.
    if (!early && lastAward.advanced && !worldstepDone(phobiaKey, levelIdx)) {
      const bs = bridgeOf(phobiaKey)[levelIdx];
      if (bs) {
        bridgeInvite = `
          <div class="bridge-invite">
            <span class="bridge-invite-kicker">${t("bridge.inviteKicker", "🌍 Real step unlocked")}</span>
            <strong>${escapeHtml(bs.t)}</strong>
            <p>${escapeHtml(bs.how)} ${tf("bridge.inviteTail", "The valley was practice — this is the point. Whenever you're ready; it pays {n} courage.", { n: 30 + 10 * levelIdx })}</p>
            <button class="btn-ghost" data-action="back-ladder" data-phobia="${phobiaKey}">${t("bridge.see", "See the Real Path")}</button>
          </div>`;
      }
    }
    // Mirror re-check after trials 3 and 5 — the stages worth measuring.
    // Only offered if a baseline exists; measurement should never nag.
    if (!early && fearCheckDue(phobiaKey, levelIdx)) {
      const stage = levelIdx === 2 ? "mid" : "post";
      mirrorPrompt = `
        <div class="mirror-invite compact">
          <span class="bridge-invite-kicker">${t("mirror.promptKicker", "🪞 A good moment to look")}</span>
          <p>${stage === "mid" ? t("mirror.promptMid", "You're halfway up this realm. Sixty seconds with the Mirror will show what's changed <em>out there</em> since you started.") : t("mirror.promptPost", "You're at the top of this realm. Sixty seconds with the Mirror will show what's changed <em>out there</em> since you started.")}</p>
          <button class="btn-ghost" data-action="fear-check" data-phobia="${phobiaKey}" data-at="${stage}">${t("mirror.hold", "Hold up the Mirror")}</button>
        </div>`;
    }
    // A calm ember rise (not confetti): fire-coloured motes float up once.
    if (!early) {
      let motes = "";
      for (let i = 0; i < 16; i++) {
        motes += `<i style="--x:${(Math.random() * 100).toFixed(1)}%;--d:${(Math.random() * 1.4).toFixed(2)}s;--s:${(0.5 + Math.random() * 0.8).toFixed(2)}"></i>`;
      }
      celebration = `<div class="ember-burst" aria-hidden="true">${motes}</div>`;
    }
  }

  // Spark of Wisdom — the psychoeducation card earned by THIS finish, dealt
  // face-down and flipped by tap (or on a short timer). Same freshness gate
  // as the reward strip so a hash re-nav doesn't replay the reveal.
  let sparkBlock = "";
  if (lastAward && lastAward.spark && lastAward.key === `${phobiaKey}.${levelIdx}` && last && Math.abs((last.ts || 0) - lastAward.ts) < 5000) {
    const card = INSIGHT_CARDS.find(c => c.id === lastAward.spark);
    if (card) {
      const ownedN = getSparks().length;
      sparkBlock = `
        <div class="spark-reveal">
          <div class="spark-card" id="sparkCard" role="button" tabindex="0" aria-label="${escapeHtml(tf("spark.revealAria", "Reveal your Spark of Wisdom: {t}", { t: t(`card.${card.id}.title`, card.title) }))}">
            <div class="spark-face spark-back"><span>✦</span><em>${t("spark.earned", "You earned a Spark of Wisdom")}</em><span class="spark-tap">${t("spark.tap", "tap to turn it over")}</span></div>
            <div class="spark-face spark-front"><span class="spark-icon">${card.icon}</span><strong>${escapeHtml(t(`card.${card.id}.title`, card.title))}</strong><p>${escapeHtml(t(`card.${card.id}.text`, card.text))}</p></div>
          </div>
          <p class="spark-count small">${tf("spark.count", "Spark {a} of {b} · kept in your {link}", { a: ownedN, b: INSIGHT_CARDS.length, link: `<a href="#/journal">${t("spark.book", "Book of Sparks")}</a>` })}</p>
        </div>`;
    }
  }

  // ---- The level-complete card ----
  // What a game says at the end of a level, up top and above the fold: the
  // stars, the few numbers that were yours, what it paid, and the next step.
  // The long-form lessons stay — folded underneath, for whoever wants them.
  const fresh = !!(lastAward && lastAward.key === `${phobiaKey}.${levelIdx}` && last && Math.abs((last.ts || 0) - lastAward.ts) < 5000);
  const hasStars = !!(lastEntry && typeof lastEntry.stars === "number");
  const nStars = hasStars ? lastEntry.stars : 0;
  let starHero = "";
  if (hasStars) {
    const gl = Array.isArray(lastEntry.goals) ? lastEntry.goals : [];
    const newBest = fresh && lastAward.prevBest > 0 && nStars > lastAward.prevBest;
    const head = nStars >= 3 ? t("vc.s3", "All three stars")
      : nStars === 2 ? t("vc.s2", "Two stars")
      : nStars === 1 ? t("vc.s1", "One star")
      : t("vc.s0", "No stars this time — showing up still counts");
    starHero = `
      <div class="vc-stars-wrap${nStars >= 3 ? " all" : ""}">
        <div class="vc-stars" role="img" aria-label="${escapeHtml(tf("stars.aria", "{n} of {m} stars", { n: nStars, m: 3 }))}">
          ${[0, 1, 2].map((i) => `<i class="${i < nStars ? "on" : ""}" style="--i:${i}">★</i>`).join("")}
        </div>
        <div class="vc-stars-head">${head}${newBest ? ` <span class="vc-best">${t("vc.newBest", "new best")}</span>` : ""}</div>
        ${gl.length ? `<ul class="vc-goals">${gl.map((g) => `<li class="${g.done ? "done" : ""}"><b aria-hidden="true">${g.done ? "★" : "☆"}</b><span>${escapeHtml(g.text)}</span></li>`).join("")}</ul>` : ""}
      </div>`;
  }
  const stat = (icon, v, l) => `<div class="vc-stat"><span class="vc-sv">${icon} ${v}</span><span class="vc-sl">${l}</span></div>`;
  const statBits = [];
  if (last && last.heldSec) statBits.push(stat("⏱", `${last.heldSec}s`, t("vc.stayed", "you stayed")));
  if (ev && ev.settledAt != null) statBits.push(stat("〰", `${ev.settledAt}s`, t("vc.settled", "alarm settled by")));
  else if (ev && ev.peak) statBits.push(stat("〰", `${ev.peak}`, t("vc.peak", "alarm peak")));
  if (predicted != null && !Number.isNaN(+predicted)) statBits.push(stat("🔮", `${predicted}<i>→</i>${peakForPrediction}`, t("vc.guess", "guessed → felt")));
  if (ev && ev.reads > 0) statBits.push(stat("👁", `${ev.readsRight}/${ev.reads}`, t("vc.reads", "read right")));
  const statsRow = statBits.length ? `<div class="vc-statrow">${statBits.join("")}</div>` : "";
  // Courage, counted up, and the rank bar filling toward the next title.
  let rankRow = "";
  if (fresh) {
    const before = lastAward.courageBefore || 0, after = lastAward.courageAfter || getCourage();
    const rA = courageRank(after), rB = courageRank(before);
    const span = (r, c) => r.next ? Math.max(0, Math.min(100, ((c - RANKS[r.idx].min) / (r.next.min - RANKS[r.idx].min)) * 100)) : 100;
    const from = rB.idx === rA.idx ? span(rA, before) : 0;
    const chips = [`<span class="vc-chip">${tf("reward.courage", "+{n} courage", { n: lastAward.points })}</span>`];
    if (lastAward.starBonus) chips.push(`<span class="vc-chip gold">${tf("vc.starBonus", "+{n} for new stars", { n: lastAward.starBonus })}</span>`);
    if (lastAward.daily) chips.push(`<span class="vc-chip ember">${t("reward.ember", "🔥 daily ember +15")}</span>`);
    if (lastAward.streakAfter >= 2) chips.push(`<span class="vc-chip">${tf("reward.day", "day {n} of practice", { n: lastAward.streakAfter })}</span>`);
    rankRow = `
      <div class="vc-chips">${chips.join("")}</div>
      ${lastAward.milestones.length ? `<div class="reward-milestone vc-ms">${escapeHtml(tf("reward.milestone", "🏅 Milestone unlocked: {list}", { list: lastAward.milestones.join(t("list.sep", ", ")) }))}</div>` : ""}
      ${(lastAward.badges || []).length ? `<div class="reward-milestone vc-ms vc-badges">${escapeHtml(lastAward.badges.join(" · "))}</div>` : ""}
      <div class="vc-rank" data-to="${span(rA, after).toFixed(1)}" data-c0="${before}" data-c1="${after}">
        <span class="vc-rank-title">${rA.icon} ${escapeHtml(rA.title)}${rA.idx > rB.idx ? ` <span class="vc-best">${t("vc.rankUp", "rank up!")}</span>` : ""}</span>
        <div class="rank-bar"><div class="rank-fill" style="width:${from.toFixed(1)}%"></div></div>
        <span class="vc-rank-n">⚡ <b class="vc-courage">${before}</b>${rA.next ? ` / ${rA.next.min} ${tf("vc.toRank", "to {title}", { title: escapeHtml(rA.next.title) })}` : ""}</span>
      </div>`;
  }
  // The next step, where the thumb already is. A star still open makes a
  // replay the obvious second button — coming back is how this works.
  const replayBtn = `<button class="btn-ghost vc-replay" data-action="start-level" data-phobia="${phobiaKey}" data-level="${levelIdx}">${early
    ? t("vc.tryAgain", "↻ Try it again")
    : t("vc.replay", "↻ Replay for ★★★")}</button>`;
  const nextBtn = !isLast
    ? `<button class="btn-primary" data-action="next-level" data-phobia="${phobiaKey}" data-level="${next}">${tf("complete.next", "Next trial: {t}", { t: escapeHtml(lvTitle(phobiaKey, next)) })}</button>`
    : `<button class="btn-primary" data-action="back-ladder" data-phobia="${phobiaKey}">${realmStatus(phobiaKey).tamed
        ? t("complete.tamed", "🕊 The realm is behind you — see it")
        : t("complete.walked", "🌍 The valley is walked — see the Real Path")}</button>`;
  // A trial that ran near the top of the scale is not the moment to point at
  // a harder one: lead with staying here (or a step down), and check in.
  const peakNum = (peak == null || Number.isNaN(+peak)) ? null : +peak;
  const heavy = suds >= 8 || (peakNum != null && peakNum >= 8) || (early && peakNum != null && peakNum >= 7);
  const easierBtn = levelIdx > 0
    ? `<button class="btn-ghost" data-action="start-level" data-phobia="${phobiaKey}" data-level="${levelIdx - 1}">${tf("vc.easier", "↓ A step easier: {t}", { t: escapeHtml(lvTitle(phobiaKey, levelIdx - 1)) })}</button>`
    : "";
  const heroCta = heavy
    ? `<div class="actions vc-cta">${replayBtn.replace("btn-ghost vc-replay", "btn-primary vc-replay")}${easierBtn}${nextBtn.replace('class="btn-primary"', 'class="btn-ghost"')}</div>`
    : `<div class="actions vc-cta">${nextBtn}${(early || (hasStars && nStars < 3)) ? replayBtn : ""}</div>`;
  const checkInBlock = heavy ? `
    <div class="mirror-invite vc-checkin" role="note">
      <span class="bridge-invite-kicker">${t("ci.kicker", "🫶 A check-in")}</span>
      <strong>${t("ci.title", "That one ran high. How are you right now?")}</strong>
      <p>${t("ci.p", "Nothing needs to happen next. Slow your breathing for a minute, stay at this trial for a few more passes, or take a step down. Any of those is progress. If the fear is still very strong now that you're out, please reach someone who can help.")}</p>
      <div class="actions" style="margin-top:8px">
        <button class="btn-ghost" data-action="do-breathe" data-after="ladder" data-phobia="${phobiaKey}" data-level="${levelIdx}">${t("ci.breathe", "🌬 Breathe for a minute")}</button>
        <a class="btn-ghost" href="https://findahelpline.com" target="_blank" rel="noopener">${t("ci.help", "☎️ Talk to someone — findahelpline.com")}</a>
      </div>
    </div>` : "";
  // A dog joins the campfire the first time its last trial is faced.
  let companionBlock = "";
  if (fresh && !early && lastAward.advanced && phobiaKey === "dogs") {
    const joined = dogCompanions().find((c) => CAMP_COMPANION_AT[c.breed] === levelIdx);
    if (joined) {
      const nm = escapeHtml(joined.name);
      companionBlock = `
        <div class="companion-card">
          <span class="cc-icon" aria-hidden="true">🐕</span>
          <div class="cc-body">
            <span class="bridge-invite-kicker">${t("cc.kicker", "🔥 A new friend at camp")}</span>
            <strong>${tf("cc.title", "{name} joined your campfire", { name: nm })}</strong>
            <p>${tf("cc.p", "You walked up to {name} and stayed. From now on, {name} rests by your fire at camp.", { name: nm })}</p>
            <button class="btn-ghost" data-action="go-camp">${t("cc.see", "See your camp")}</button>
          </div>
        </div>`;
    }
  }

  return `
    <div class="panel victory-panel">
      <div class="vc-hero">
        <span class="badge">${early ? tf("complete.early", "Trial {n} · stepped back", { n: levelIdx + 1 }) : tf("complete.faced", "Trial {n} faced", { n: levelIdx + 1 })} · ${escapeHtml(realmOf(phobiaKey).realmName)}</span>
        <h2 style="margin-top: 10px;">${early ? t("complete.h2early", "You stepped back — showing up still counts.") : t("complete.h2", "Trial faced. That's ground you hold now.")}</h2>
        ${celebration}
        ${starHero}
        ${statsRow}
        ${rankRow || rewardStrip}
        ${heroCta}
      </div>
      ${checkInBlock}
      ${(() => {
        // The page this trial turned — right under the next step, since the
        // next step plays it anyway if it's still unread.
        const S = window.Story;
        if (!S || early) return "";
        const id = S.pendingAfter(phobiaKey, levelIdx);
        const out = id ? [S.cardHTML(id)] : [];
        if (S.isUnlocked("epilogue") && !S.isSeen("epilogue")) out.push(S.cardHTML("epilogue", { kicker: t("st.cardEpi", "🌅 Every lantern is lit — the last page of the story") }));
        return out.join("");
      })()}
      ${companionBlock}
      ${shadowStrip}
      ${realityBlock}
      ${sparkBlock}
      ${waveBlock}
      ${(() => {
        // After the FIRST dog: the two things that used to stand in front of
        // it — the primer and the Mirror baseline — offered now, when the
        // player has an alarm of their own to refer to. Both optional.
        if (early || !hasCreatureKit(phobiaKey) || levelIdx !== 0) return "";
        const needPrimer = !primerSeen(phobiaKey), needMirror = !getChecks(phobiaKey).length;
        // A traveler made for them by the title screen's one-tap start gets
        // the creator offered here — after the first trial, not before it.
        const needLook = (() => { try { return localStorage.getItem("fobia.travelerMade") !== "1"; } catch { return false; } })();
        if (!needPrimer && !needMirror && !needLook) return "";
        return `
          <div class="mirror-invite first-next">
            <span class="bridge-invite-kicker">${t("first.kicker", "🧭 Two minutes, whenever you like")}</span>
            <strong>${t("first.title", "Why staying works — and where you're starting from")}</strong>
            <p>${t("first.p", "You just watched an alarm climb and then fall without leaving. The primer shows why that matters and what escaping does instead. The Mirror takes five questions about the fear in <em>real life</em>, so later you can see it get quieter in numbers.")}</p>
            <div class="actions" style="margin-top:8px">
              ${needPrimer ? `<button class="btn-ghost" data-action="open-primer" data-phobia="${phobiaKey}">${t("first.primer", "🧭 The one-minute primer")}</button>` : ""}
              ${needMirror ? `<button class="btn-ghost" data-action="fear-check" data-phobia="${phobiaKey}" data-at="baseline">${t("first.mirror", "🪞 Hold up the Mirror")}</button>` : ""}
              ${needLook ? `<button class="btn-ghost" data-action="edit-character">${t("first.look", "🎨 Make the traveler yours")}</button>` : ""}
            </div>
          </div>`;
      })()}
      ${bridgeInvite}
      ${mirrorPrompt}
      <details class="vc-more">
        <summary>${t("vc.more", "More about this trial — what you felt, and a note to yourself")}</summary>
      ${(() => {
        // Experiments run this session — the prediction vs what happened, at
        // the moment the comparison lands hardest.
        const ses = window.PhobiaExperiments && PhobiaExperiments.lastSessionFor(phobiaKey, levelIdx);
        if (!ses || !ses.results.length) return "";
        return `
          <div class="evidence-block">
            <h3>${t("exp.sessionH", "🧪 What you tested")}</h3>
            ${ses.results.map((r) => `
              <div class="evidence-line">
                <strong>${escapeHtml(r.title)}</strong>
                <span class="ev-note">${escapeHtml(r.note)}</span>
                <span class="ev-vs">${tf("exp.vs2", "You expected: “{p}”", { p: escapeHtml(r.predicted) })}</span>
              </div>`).join("")}
          </div>`;
      })()}
      <p>${early
        ? tf("complete.stood", "You stood with {t} and rated your fear at {n}.", { t: `<strong>${escapeHtml(lvTitle(phobiaKey, levelIdx))}</strong>`, n: `<strong>${suds}/10</strong>` })
        : tf("complete.facedLine", "You faced {t} and rated your fear at {n}.", { t: `<strong>${escapeHtml(lvTitle(phobiaKey, levelIdx))}</strong>`, n: `<strong>${suds}/10</strong>` })}</p>
      ${habituationBlock}
      ${acrossBlock}
      ${predictionBlock}
      <p>${advice}</p>

      <div class="journal-row">
        <label for="journalNote">${t("journal.q", "Anything to remember?")} <span class="small">${t("journal.qSub", "(optional — what helped, what surprised you)")}</span></label>
        <textarea id="journalNote" rows="2" maxlength="500" placeholder="${phobiaKey === "dogs"
          ? escapeHtml(t("journal.phDogs", "It barked and I didn't step back. My alarm went 7 → 4 in about half a minute."))
          : escapeHtml(t("journal.ph", "What helped? What surprised you? e.g. my SUDS dropped from 7 to 4 after about 30 seconds."))}"></textarea>
        <button class="btn-ghost" id="saveJournal" style="font-size:12px; padding:6px 12px;">${t("journal.save", "Save note")}</button>
        <span class="small" id="journalSaved" style="opacity:0; transition:opacity .25s; color:var(--ok)">${t("journal.saved", "saved")}</span>
      </div>
      </details>

      <div class="actions">
        ${!isLast
          ? `<button class="btn-primary" data-action="next-level" data-phobia="${phobiaKey}" data-level="${next}">${tf("complete.next", "Next trial: {t}", { t: escapeHtml(lvTitle(phobiaKey, next)) })}</button>`
          : `<button class="btn-primary" data-action="back-ladder" data-phobia="${phobiaKey}">${realmStatus(phobiaKey).tamed
              ? t("complete.tamed", "🕊 The realm is behind you — see it")
              : t("complete.walked", "🌍 The valley is walked — see the Real Path")}</button>`}
        <button class="btn-ghost" data-action="back-ladder" data-phobia="${phobiaKey}">${t("complete.back", "Back to the realm")}</button>
      </div>
      <p class="fb-after"><button type="button" class="linklike" data-action="open-feedback" data-context="${escapeHtml(`${phobiaKey} trial ${levelIdx + 1}${early ? " (stepped out)" : ""}`)}">${t("fb.after", "Got a minute? Tell us how this trial went →")}</button></p>
    </div>
  `;
}
