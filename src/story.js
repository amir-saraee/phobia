"use strict";

// ---------- The Story: "The Lanterns of the Valley" ----------
// The spine the rest of the game hangs on. Before this, Mira was a name on a
// title bar, the valley had six realms and no reason to walk them in any
// order, and the psychology lived in modals a player had to go looking for.
//
// Now:
//   - Mira is a person: the valley's lantern-keeper, who walks beside you.
//   - Each realm is a chapter with a resident whose fear began a DIFFERENT
//     way — one frightening moment, watching someone, stories, a misread
//     body, a fear that was never tested, a panic that spread — so the
//     causes of phobias arrive as people, not a syllabus.
//   - Every finished trial turns a page. Each page carries ONE idea about how
//     fears unwind (the ladder, the wave, testing the prediction, shields,
//     attention, naming, spacing, sensations…) — 38 distinct lessons across
//     the valley, no repeats — and ends on what's next, so there is always a
//     page waiting.
//   - The trial before a page shows its idea as "today's practice", so the
//     lesson is something you DO in the scene, then read about.
//
// Content is bilingual inline ({en, fa}) because a page is a unit a writer
// edits as a whole; UI chrome goes through t() with the Persian registered
// below. Everything here is DOM + SVG — no WebGL — so it costs a low-end
// phone nothing.
//
// Depends on the classic app script (state, PHOBIAS, getProgress, go…),
// which has always run by the time a deferred script does; every use is
// inside a function and guarded, so a missing helper degrades, not throws.

(function () {
  const lang = () => (window.I18n && window.I18n.currentLanguage && window.I18n.currentLanguage()) || "en";
  const L = (o) => (o == null ? "" : typeof o === "string" ? o : (o[lang()] != null ? o[lang()] : o.en));
  const T = (k, en) => (typeof window.t === "function" ? window.t(k, en) : en);
  const TF = (k, en, v) => (typeof window.tf === "function" ? window.tf(k, en, v) : en);
  const esc = (s) => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  // ---------------------------------------------------------------------------
  // The cast. Portraits are drawn by the same avatar renderer as the player's
  // traveler (window.Character.avatarSVG), so everyone shares one art style.
  // ---------------------------------------------------------------------------
  const CAST = {
    narrator: { name: { en: "The valley", fa: "دره" } },
    mira:   { name: { en: "Mira", fa: "میرا" },   role: { en: "keeper of the lanterns", fa: "فانوس‌بانِ دره" },
      look: { bodyType: "woman", skinTone: "olive", hairColor: "grey", hairStyle: "pony", topColor: "amber", topStyle: "jacket", eyeColor: "green", glasses: "round", facialHair: "none", headwear: "none" } },
    aram:   { name: { en: "Aram", fa: "آرام" },   role: { en: "the gardener", fa: "باغبان" },
      look: { bodyType: "man", skinTone: "tan", hairColor: "black", hairStyle: "short", topColor: "forest", topStyle: "jacket", eyeColor: "brown", glasses: "none", facialHair: "stubble", headwear: "cap" } },
    leyla:  { name: { en: "Leyla", fa: "لیلا" },  role: { en: "lives above the cellar", fa: "ساکنِ بالای زیرزمین" },
      look: { bodyType: "woman", skinTone: "porcelain", hairColor: "auburn", hairStyle: "curly", topColor: "plum", topStyle: "tee", eyeColor: "blue", glasses: "none", facialHair: "none", headwear: "none" } },
    bahman: { name: { en: "Bahman", fa: "بهمن" }, role: { en: "the shepherd", fa: "چوپان" },
      look: { bodyType: "man", skinTone: "brown", hairColor: "grey", hairStyle: "short", topColor: "navy", topStyle: "jacket", eyeColor: "brown", glasses: "none", facialHair: "moustache", headwear: "beanie" } },
    sahar:  { name: { en: "Sahar", fa: "سحر" },   role: { en: "kept the tower deck", fa: "نگهبانِ سکوی برج" },
      look: { bodyType: "woman", skinTone: "fair", hairColor: "black", hairStyle: "long", topColor: "teal", topStyle: "jacket", eyeColor: "hazel", glasses: "none", facialHair: "none", headwear: "none" } },
    nima:   { name: { en: "Nima", fa: "نیما" },   role: { en: "ten years old", fa: "ده‌ساله" },
      look: { bodyType: "boy", skinTone: "olive", hairColor: "brown", hairStyle: "curly", topColor: "amber", topStyle: "hoodie", eyeColor: "hazel", glasses: "none", facialHair: "none", headwear: "none" } },
    shirin: { name: { en: "Shirin", fa: "شیرین" }, role: { en: "works on the ninth floor", fa: "کارمندِ طبقهٔ نهم" },
      look: { bodyType: "woman", skinTone: "deep", hairColor: "black", hairStyle: "pony", topColor: "char", topStyle: "jacket", eyeColor: "brown", glasses: "square", facialHair: "none", headwear: "none" } },
  };

  // ---------------------------------------------------------------------------
  // The curriculum. kind "why" = why fears start and stay; "way" = how they
  // unwind. One lesson per page, none repeated across the valley. Phrasing is
  // plain-language, with the clinical term in brackets so it can be searched.
  // ---------------------------------------------------------------------------
  const LESSONS = {
    "c.avoid": { kind: "why", icon: "🍂",
      title: { en: "Why fears grow: avoidance", fa: "چرا ترس بزرگ می‌شود: اجتناب" },
      body: { en: "Avoiding what you fear brings instant relief — and the relief teaches your brain the danger was real. That's why fear grows in exactly the places we stop going.",
              fa: "دوری کردن از چیزی که می‌ترساندت آسودگیِ فوری می‌آورد — و همین آسودگی به مغز یاد می‌دهد که خطر واقعی بوده. برای همین ترس درست در جاهایی بزرگ می‌شود که دیگر به آن‌ها نمی‌رویم." } },
    "c.conditioning": { kind: "why", icon: "⚡",
      title: { en: "Why fears start: one frightening moment", fa: "چرا ترس شروع می‌شود: یک لحظهٔ ترسناک" },
      body: { en: "A single scary event can teach the alarm a lasting rule (conditioning). The alarm then stretches it to every dog — big or small, near or far (generalisation).",
              fa: "یک اتفاقِ ترسناک می‌تواند قانونی ماندگار به زنگِ خطر یاد بدهد (شرطی‌شدن). بعد زنگِ خطر آن را به همهٔ سگ‌ها تعمیم می‌دهد — بزرگ یا کوچک، دور یا نزدیک." } },
    "c.watching": { kind: "why", icon: "👀",
      title: { en: "Why fears start: learning by watching", fa: "چرا ترس شروع می‌شود: یادگیری با تماشا" },
      body: { en: "Many fears are learned second-hand, from a parent's or friend's reaction (observational learning). Scanning for the feared thing then keeps the alarm on edge (attention bias).",
              fa: "خیلی از ترس‌ها دست‌دوم یاد گرفته می‌شوند، از واکنشِ پدر و مادر یا دوستان (یادگیریِ مشاهده‌ای). بعد گشتن دنبالِ چیزِ ترسناک زنگِ خطر را همیشه آماده نگه می‌دارد (سوگیریِ توجه)." } },
    "c.disgust": { kind: "why", icon: "🤢",
      title: { en: "Why it lingers: disgust", fa: "چرا می‌ماند: چندش" },
      body: { en: "Spider fear often mixes fear with disgust. Disgust can take longer to fade with practice than fear does — but it does fade. Patience, not force.",
              fa: "ترس از عنکبوت اغلب با چندش قاطی است. چندش با تمرین ممکن است دیرتر از ترس فروکش کند — اما فروکش می‌کند. صبر، نه زور." } },
    "c.startle": { kind: "why", icon: "💥",
      title: { en: "Why it feels like proof: the startle", fa: "چرا شبیهِ مدرک است: از جا پریدن" },
      body: { en: "A jump at sudden movement is a reflex, not a judgement. It fires before thought and shrinks with repetition. Don't take the jolt as evidence of danger.",
              fa: "پریدن از حرکتِ ناگهانی یک بازتاب است، نه یک قضاوت. پیش از فکر شلیک می‌شود و با تکرار کم می‌شود. این تکان را مدرکِ خطر حساب نکن." } },
    "c.words": { kind: "why", icon: "📜",
      title: { en: "Why fears start: stories, and a brain that's ready", fa: "چرا ترس شروع می‌شود: قصه‌ها، و مغزی آماده" },
      body: { en: "Warnings and stories can install a fear (informational learning). Some fears — snakes, spiders, heights — are learned unusually easily because our ancestors survived by learning them (preparedness).",
              fa: "هشدارها و قصه‌ها می‌توانند ترسی را بکارند (یادگیریِ اطلاعاتی). بعضی ترس‌ها — مار، عنکبوت، ارتفاع — به‌طرزِ عجیبی آسان یاد گرفته می‌شوند، چون نیاکانمان با یاد گرفتنشان زنده ماندند (آمادگیِ زیستی)." } },
    "c.body": { kind: "why", icon: "🌀",
      title: { en: "Why fears start: misreading the body", fa: "چرا ترس شروع می‌شود: بدخوانیِ بدن" },
      body: { en: "Some fears appear without any bad experience. A normal sensation — dizziness, wobbly legs, the pull of an edge — gets read as proof of danger (catastrophic misinterpretation), which makes the sensation stronger.",
              fa: "بعضی ترس‌ها بدونِ هیچ تجربهٔ بدی پیدا می‌شوند. یک احساسِ عادی — سرگیجه، لرزشِ پا، کششِ لبه — مدرکِ خطر خوانده می‌شود (تعبیرِ فاجعه‌آمیز)، و همین احساس را قوی‌تر می‌کند." } },
    "c.void": { kind: "why", icon: "🌫️",
      title: { en: "Why it feels so strong: the call of the edge", fa: "چرا این‌قدر قوی است: کششِ لبه" },
      body: { en: "Many people feel a sudden urge to jump near an edge, with no wish to. It's thought to be the brain misreading its own safety reflex — a common glitch, not a warning about you.",
              fa: "خیلی‌ها کنارِ لبه میلی ناگهانی به پریدن حس می‌کنند، بی‌آن‌که چنین خواسته‌ای داشته باشند. گمان می‌رود مغز بازتابِ ایمنیِ خودش را بد می‌خواند — خطایی رایج، نه هشداری دربارهٔ تو." } },
    "c.stage": { kind: "why", icon: "🧸",
      title: { en: "Why fears stay: a fear that never got tested", fa: "چرا ترس می‌ماند: ترسی که هیچ‌وقت آزموده نشد" },
      body: { en: "Many fears — the dark, animals, strangers — are a normal part of growing up and fade with experience. A safety habit like a light that's always on can stop that fading from ever happening.",
              fa: "خیلی از ترس‌ها — تاریکی، حیوانات، غریبه‌ها — بخشی عادی از بزرگ شدن‌اند و با تجربه کم‌رنگ می‌شوند. عادتی ایمنی مثلِ چراغی همیشه روشن می‌تواند جلوی این کم‌رنگ شدن را بگیرد." } },
    "c.uncertain": { kind: "why", icon: "❔",
      title: { en: "Why the dark feels full: the brain fills gaps", fa: "چرا تاریکی پر به نظر می‌رسد: مغز جاهای خالی را پر می‌کند" },
      body: { en: "When information is missing, the brain predicts — and an anxious brain predicts threat. Much of fear of the dark is fear of not knowing (intolerance of uncertainty).",
              fa: "وقتی اطلاعات کم است، مغز پیش‌بینی می‌کند — و مغزِ مضطرب تهدید پیش‌بینی می‌کند. بخشِ زیادی از ترس از تاریکی، ترس از ندانستن است (تحمل‌نکردنِ عدمِ قطعیت)." } },
    "c.panic": { kind: "why", icon: "🧬",
      title: { en: "Why fears start: a panic that spread, and a sensitive alarm", fa: "چرا ترس شروع می‌شود: وحشتی که پخش شد، و زنگِ خطری حساس" },
      body: { en: "A single panic in a confined space can attach fear to every confined space, and to the body's own sensations. Genes and temperament make some alarms more sensitive (roughly a third of the risk) — but learning shapes the rest, and learning can change.",
              fa: "یک حملهٔ وحشت در فضایی بسته می‌تواند ترس را به همهٔ فضاهای بسته و به احساس‌های خودِ بدن بچسباند. ژن‌ها و خلق‌وخو بعضی زنگ‌های خطر را حساس‌تر می‌کنند (تقریباً یک‌سومِ خطر) — اما بقیه‌اش را یادگیری می‌سازد، و یادگیری تغییرپذیر است." } },
    "c.loop": { kind: "why", icon: "🔁",
      title: { en: "Why panic spirals — and stops", fa: "چرا وحشت می‌پیچد — و می‌ایستد" },
      body: { en: "Sensation → frightening thought → more alarm → stronger sensation. Panic peaks and passes, usually within minutes. Staying lets you watch the loop run down by itself.",
              fa: "احساس ← فکرِ ترسناک ← زنگِ خطرِ بیشتر ← احساسِ قوی‌تر. وحشت به اوج می‌رسد و می‌گذرد، معمولاً ظرفِ چند دقیقه. ماندن به تو اجازه می‌دهد ببینی چرخه خودش آرام می‌گیرد." } },

    "t.ladder": { kind: "way", icon: "🪜",
      title: { en: "How fears unwind: a ladder of steps", fa: "ترس چطور فروکش می‌کند: نردبانِ قدم‌ها" },
      body: { en: "Graded exposure lists situations from easiest to hardest and climbs them one at a time. Rating your fear 0–10 turns a feeling into something you can track.",
              fa: "مواجههٔ تدریجی موقعیت‌ها را از آسان به سخت می‌چیند و یکی‌یکی بالا می‌رود. نمره دادن به ترس از ۰ تا ۱۰ یک احساس را به چیزی تبدیل می‌کند که می‌شود دنبالش کرد." } },
    "t.wave": { kind: "way", icon: "🌊",
      title: { en: "How fears unwind: stay until it falls", fa: "ترس چطور فروکش می‌کند: بمان تا پایین بیاید" },
      body: { en: "Anxiety is a wave, not a cliff: if you stay, it peaks and falls by itself. Leaving at the peak teaches the brain that escaping is what kept you safe.",
              fa: "اضطراب موج است، نه پرتگاه: اگر بمانی، به اوج می‌رسد و خودش فرو می‌نشیند. رفتن در اوج به مغز یاد می‌دهد که فرار بود که نجاتت داد." } },
    "t.predict": { kind: "way", icon: "🧪",
      title: { en: "How fears unwind: test the prediction", fa: "ترس چطور فروکش می‌کند: پیش‌بینی را بیازما" },
      body: { en: "Exposure works best when it surprises the fear. Name what you expect, then watch what really happens. The mismatch is the lesson — therapists call it inhibitory learning.",
              fa: "مواجهه وقتی بهتر جواب می‌دهد که ترس را غافلگیر کند. بگو انتظار چه چیزی را داری، بعد ببین واقعاً چه می‌شود. همین ناهمخوانی درس است — درمانگرها به آن یادگیریِ بازدارنده می‌گویند." } },
    "t.safety": { kind: "way", icon: "🛡️",
      title: { en: "How fears unwind: lower the shields", fa: "ترس چطور فروکش می‌کند: سپرها را پایین بیاور" },
      body: { en: "Safety behaviours — checking, gripping, keeping an exit in sight, bringing someone along — take the credit for your safety and keep the fear alive. Drop them gradually.",
              fa: "رفتارهای ایمنی — وارسی کردن، چنگ زدن، چشم به راهِ خروج، همراه بردنِ کسی — اعتبارِ سالم ماندنت را از تو می‌گیرند و ترس را زنده نگه می‌دارند. کم‌کم کنارشان بگذار." } },
    "t.travel": { kind: "way", icon: "🧭",
      title: { en: "Keeping it: make it travel", fa: "نگه‌داشتنش: درس را به سفر ببر" },
      body: { en: "Fear learned in one place unlearns best across many: different dogs, different streets, different times of day. Varied practice in real life is what makes the change last.",
              fa: "ترسی که در یک جا یاد گرفته شده، در جاهای بسیار بهتر از یاد می‌رود: سگ‌های مختلف، خیابان‌های مختلف، ساعت‌های مختلفِ روز. تمرینِ گوناگون در زندگیِ واقعی است که تغییر را ماندگار می‌کند." } },
    "t.attend": { kind: "way", icon: "👁️",
      title: { en: "How fears unwind: look, don't look away", fa: "ترس چطور فروکش می‌کند: نگاه کن، رو برنگردان" },
      body: { en: "Learning happens when your attention stays on the feared thing. Curiosity — noticing details — keeps you present, so the lesson actually lands.",
              fa: "یادگیری وقتی اتفاق می‌افتد که توجهت روی چیزِ ترسناک بماند. کنجکاوی — دیدنِ جزئیات — تو را حاضر نگه می‌دارد تا درس واقعاً بنشیند." } },
    "t.bearable": { kind: "way", icon: "🫀",
      title: { en: "How fears unwind: uncomfortable isn't dangerous", fa: "ترس چطور فروکش می‌کند: ناخوشایند، خطرناک نیست" },
      body: { en: "Fear feels awful, but the feeling itself can't hurt you. Each time you stay through it, you learn you can bear it — and that confidence matters as much as learning the thing itself is safe.",
              fa: "ترس حسِ بدی دارد، اما خودِ این احساس نمی‌تواند به تو آسیب بزند. هر بار که در آن می‌مانی، یاد می‌گیری می‌توانی تحملش کنی — و این اطمینان به اندازهٔ یاد گرفتنِ بی‌خطریِ خودِ آن چیز مهم است." } },
    "t.model": { kind: "way", icon: "🤝",
      title: { en: "Keeping it: pass on calm", fa: "نگه‌داشتنش: آرامش را منتقل کن" },
      body: { en: "Fears spread by example, and so does calm. Watching someone approach calmly (modelling) helps others unlearn fear — and doing it for someone else strengthens your own.",
              fa: "ترس‌ها با الگو پخش می‌شوند، آرامش هم. دیدنِ کسی که آرام نزدیک می‌شود (الگوبرداری) به دیگران کمک می‌کند ترسشان را فراموش کنند — و این کار برای کسی دیگر، تغییرِ خودت را هم محکم‌تر می‌کند." } },
    "t.facts": { kind: "way", icon: "📚",
      title: { en: "How fears unwind: swap stories for facts", fa: "ترس چطور فروکش می‌کند: قصه را با واقعیت عوض کن" },
      body: { en: "Learning how the feared thing really behaves corrects the brain's threat map. Information rarely cures a phobia by itself — it works best paired with experience.",
              fa: "یاد گرفتنِ این‌که آن چیزِ ترسناک واقعاً چطور رفتار می‌کند، نقشهٔ تهدیدِ مغز را اصلاح می‌کند. اطلاعات به‌تنهایی کمتر فوبیایی را درمان می‌کند — کنارِ تجربه بهترین اثر را دارد." } },
    "t.breath": { kind: "way", icon: "🌬️",
      title: { en: "How fears unwind: breathe to stay, not to escape", fa: "ترس چطور فروکش می‌کند: نفس برای ماندن، نه فرار" },
      body: { en: "A slow exhale (in for 4, out for 6) eases the body's alarm. Use it to help you stay with the fear; if it becomes a ritual you can't do without, it has turned into a safety behaviour.",
              fa: "بازدمِ آهسته (چهار شماره دم، شش شماره بازدم) زنگِ خطرِ بدن را آرام‌تر می‌کند. از آن برای ماندن کنارِ ترس استفاده کن؛ اگر به آیینی تبدیل شود که بدونش نمی‌توانی، خودش رفتارِ ایمنی شده." } },
    "t.read": { kind: "way", icon: "🔎",
      title: { en: "How fears unwind: learn the signals", fa: "ترس چطور فروکش می‌کند: نشانه‌ها را یاد بگیر" },
      body: { en: "Fear lumps everything into 'danger'. Learning the real signals — relaxed, curious, warning — lets your alarm tell situations apart (discrimination learning).",
              fa: "ترس همه‌چیز را یک‌کاسه «خطر» می‌کند. یاد گرفتنِ نشانه‌های واقعی — آرام، کنجکاو، هشدار — به زنگِ خطرت کمک می‌کند موقعیت‌ها را از هم تشخیص دهد (یادگیریِ تمایز)." } },
    "t.respect": { kind: "way", icon: "⚖️",
      title: { en: "How fears unwind: caution, not phobia", fa: "ترس چطور فروکش می‌کند: احتیاط، نه فوبیا" },
      body: { en: "Healthy caution keeps you safe; a phobia is fear far out of proportion to the real danger that lasts and limits your life. Treatment aims for sensible caution, not zero fear.",
              fa: "احتیاطِ سالم تو را ایمن نگه می‌دارد؛ فوبیا ترسی است بسیار بیشتر از خطرِ واقعی که می‌ماند و زندگی را محدود می‌کند. هدفِ درمان احتیاطِ معقول است، نه صفر شدنِ ترس." } },
    "t.story": { kind: "way", icon: "🗣️",
      title: { en: "Keeping it: tell a new story, and come back", fa: "نگه‌داشتنش: قصه‌ای تازه بگو، و برگرد" },
      body: { en: "How we talk about a fear shapes how we — and the people listening — feel it. Revisiting the situation now and then (booster practice) keeps the new, safe memory in the lead.",
              fa: "طرزِ حرف زدنمان دربارهٔ یک ترس شکل می‌دهد که خودمان — و شنونده‌ها — چطور حسش کنیم. سر زدنِ گاه‌به‌گاه به آن موقعیت (تمرینِ یادآوری) خاطرهٔ تازه و امن را جلو نگه می‌دارد." } },
    "t.fade": { kind: "way", icon: "✋",
      title: { en: "How fears unwind: loosen one finger at a time", fa: "ترس چطور فروکش می‌کند: یک انگشت در هر بار" },
      body: { en: "Shields don't have to go all at once. Fading them gradually is still an experiment — each small release teaches that you, not the shield, were keeping you safe.",
              fa: "لازم نیست سپرها یک‌باره کنار بروند. کم کردنِ تدریجی‌شان هم آزمایش است — هر رها کردنِ کوچک یاد می‌دهد که خودِ تو، نه سپر، سالم نگهت داشته بود." } },
    "t.thoughts": { kind: "way", icon: "💭",
      title: { en: "How fears unwind: weigh the thought", fa: "ترس چطور فروکش می‌کند: فکر را بسنج" },
      body: { en: "Fear overestimates danger and underestimates coping. Asking 'How likely is it, really? What's the evidence? How would I cope?' (cognitive restructuring) works well alongside exposure.",
              fa: "ترس خطر را بزرگ و توانِ کنار آمدن را کوچک می‌بیند. پرسیدنِ «واقعاً چقدر محتمل است؟ مدرکش چیست؟ اگر پیش بیاید چطور کنار می‌آیم؟» (بازسازیِ شناختی) کنارِ مواجهه خوب جواب می‌دهد." } },
    "t.interoceptive": { kind: "way", icon: "💫",
      title: { en: "How fears unwind: practise the sensation", fa: "ترس چطور فروکش می‌کند: خودِ احساس را تمرین کن" },
      body: { en: "Bringing on feared body sensations safely and on purpose — dizziness, a racing heart, breathlessness (interoceptive exposure) — teaches that sensations are just sensations.",
              fa: "ایجادِ امن و عمدیِ احساس‌های بدنیِ ترسناک — سرگیجه، تپشِ قلب، تنگیِ نفس (مواجههٔ درون‌حسی) — یاد می‌دهد که احساس‌ها فقط احساس‌اند." } },
    "t.accept": { kind: "way", icon: "🍃",
      title: { en: "Keeping it: let it swoop", fa: "نگه‌داشتنش: بگذار باشد" },
      body: { en: "Success isn't zero fear — it's fear that no longer decides what you do. Letting sensations be there without fighting them (acceptance) helps them pass sooner.",
              fa: "موفقیت صفر شدنِ ترس نیست — ترسی است که دیگر تعیین نمی‌کند چه کنی. گذاشتنِ احساس‌ها بدونِ جنگیدن با آن‌ها (پذیرش) کمک می‌کند زودتر بگذرند." } },
    "t.name": { kind: "way", icon: "🏷️",
      title: { en: "How fears unwind: name it to tame it", fa: "ترس چطور فروکش می‌کند: اسمش را بگذار تا رامش کنی" },
      body: { en: "Putting the feeling into words during exposure (affect labelling) lowers the body's alarm response. 'I'm scared, and that's a coat' is enough.",
              fa: "به زبان آوردنِ احساس در حینِ مواجهه (نام‌گذاریِ هیجان) واکنشِ زنگِ خطرِ بدن را کم می‌کند. «می‌ترسم، و آن یک کت است» کافی است." } },
    "t.spacing": { kind: "way", icon: "🌙",
      title: { en: "How fears unwind: practise across days", fa: "ترس چطور فروکش می‌کند: در چند روز تمرین کن" },
      body: { en: "Practice spread over several days protects against fear coming back better than cramming. Sleep helps lock in what you learned — a good reason to come back tomorrow.",
              fa: "تمرینی که در چند روز پخش شده، بهتر از تمرینِ فشرده جلوی برگشتنِ ترس را می‌گیرد. خواب به تثبیتِ آن‌چه یاد گرفته‌ای کمک می‌کند — دلیلی خوب برای این‌که فردا برگردی." } },
    "t.subtle": { kind: "way", icon: "🐾",
      title: { en: "How fears unwind: catch the hidden escapes", fa: "ترس چطور فروکش می‌کند: فرارهای پنهان را بگیر" },
      body: { en: "Escapes hide in small habits: hurrying, holding your breath, humming loudly, not looking. Doing the same thing slowly and fully present gives the brain the whole lesson.",
              fa: "فرارها در عادت‌های کوچک پنهان‌اند: عجله، حبسِ نفس، بلند زمزمه کردن، نگاه نکردن. انجامِ همان کار با آرامش و حضورِ کامل، تمامِ درس را به مغز می‌دهد." } },
    "t.lapse": { kind: "way", icon: "🌀",
      title: { en: "Keeping it: a lapse is not a relapse", fa: "نگه‌داشتنش: لغزش، بازگشت نیست" },
      body: { en: "Fear can return after a break, a stressful week, or in a new place. It isn't starting over — a few practice sessions usually bring it back down faster than the first time.",
              fa: "ترس ممکن است پس از وقفه، هفته‌ای پرتنش یا در جایی تازه برگردد. این یعنی از اول شروع کردن نیست — چند جلسه تمرین معمولاً آن را سریع‌تر از بارِ اول پایین می‌آورد." } },
    "t.air": { kind: "way", icon: "💨",
      title: { en: "How fears unwind: the alarm is not the air", fa: "ترس چطور فروکش می‌کند: زنگِ خطر، هوا نیست" },
      body: { en: "The feeling of not getting enough air comes from the alarm, not the room. Fighting your breath makes it worse; letting it be lets it settle.",
              fa: "حسِ کم بودنِ هوا از زنگِ خطر می‌آید، نه از اتاق. جنگیدن با نفس بدترش می‌کند؛ رها کردنش می‌گذارد آرام شود." } },
    "t.longer": { kind: "way", icon: "⏳",
      title: { en: "How fears unwind: long enough to learn", fa: "ترس چطور فروکش می‌کند: به اندازهٔ یادگیری بمان" },
      body: { en: "Exposure works when it lasts long enough for the feared outcome to fail to happen. For specific phobias, even one long, guided session (often 2–3 hours with a therapist) helps many people.",
              fa: "مواجهه وقتی جواب می‌دهد که آن‌قدر طول بکشد که پیامدِ ترسناک اتفاق نیفتد. برای فوبیاهای خاص، حتی یک جلسهٔ طولانیِ همراه با راهنما (اغلب ۲ تا ۳ ساعت با درمانگر) به خیلی‌ها کمک می‌کند." } },
    "t.control": { kind: "way", icon: "🚪",
      title: { en: "How fears unwind: choose to stay", fa: "ترس چطور فروکش می‌کند: انتخاب کن که بمانی" },
      body: { en: "Knowing you can leave makes staying easier — that's healthy. Guarding the exit (standing by the door, watching the buttons, wedging it open) keeps the belief that you're trapped.",
              fa: "دانستنِ این‌که می‌توانی بروی ماندن را آسان‌تر می‌کند — این سالم است. نگهبانیِ خروجی (ایستادن کنارِ در، چشم دوختن به دکمه‌ها، باز نگه‌داشتنِ در) باورِ گیر افتادن را زنده نگه می‌دارد." } },
    "t.help": { kind: "way", icon: "🤲",
      title: { en: "Keeping it: when to get help", fa: "نگه‌داشتنش: کِی کمک بگیریم" },
      body: { en: "If a fear limits your work, health or relationships, or comes with panic you can't manage, a CBT therapist can help — often in only a few sessions. Specific phobias are among the most treatable problems there are.",
              fa: "اگر ترسی کار، سلامت یا رابطه‌هایت را محدود می‌کند، یا با حمله‌های وحشتی همراه است که از پسشان برنمی‌آیی، یک درمانگرِ شناختی‌رفتاری می‌تواند کمک کند — اغلب فقط در چند جلسه. فوبیاهای خاص از درمان‌پذیرترین مشکلات‌اند." } },
    "t.journey": { kind: "way", icon: "🌅",
      title: { en: "The whole method, in one line", fa: "تمامِ روش، در یک خط" },
      body: { en: "Approach what you fear, in steps you choose, long enough to learn something new — then keep doing it in real life. That's exposure therapy, and it helps most people who try it.",
              fa: "به چیزی که از آن می‌ترسی نزدیک شو، با قدم‌هایی که خودت انتخاب می‌کنی، آن‌قدر که چیزی تازه یاد بگیری — بعد در زندگیِ واقعی ادامه بده. این مواجهه‌درمانی است، و به بیشترِ کسانی که امتحانش می‌کنند کمک می‌کند." } },
  };

  // ---------------------------------------------------------------------------
  // The chapters. A realm chapter has an opening page (before its first
  // trial), four pages turned by trials 1–4, and a closing page turned by the
  // last trial — when its lantern lights. `focus` is the practice line the
  // trial BEFORE a page shows ("today's practice"): you do it, then you read
  // why it worked. `recap` is the one-line "previously" for the title screen.
  // ---------------------------------------------------------------------------
  const P = (who, en, fa) => ({ who, text: { en, fa } });

  const CHAPTERS = [
    {
      id: "prologue", kind: "prologue",
      title: { en: "Prologue", fa: "پیش‌درآمد" },
      beats: [{
        id: "prologue", lesson: "c.avoid",
        title: { en: "Where the lanterns went", fa: "فانوس‌ها کجا رفتند" },
        recap: { en: "Mira told you how the valley's lanterns went dark.", fa: "میرا برایت گفت فانوس‌های دره چطور خاموش شدند." },
        next: { en: "Next: become a traveler.", fa: "بعدی: مسافر شو." },
        panels: [
          P("narrator", "Once, a lantern burned at every crossing in this valley, and people walked wherever they pleased.",
            "روزگاری سرِ هر دوراهیِ این دره فانوسی روشن بود و مردم هر جا که دلشان می‌خواست می‌رفتند."),
          P("narrator", "Then each of them met something that frightened them — a dog, a spider, a high place, a closed door — and quietly stopped going that way. It felt like relief. But a path nobody walks grows dark, and in the dark a small fear looks enormous.",
            "تا این‌که هر کدام به چیزی برخوردند که ترساندشان — سگی، عنکبوتی، جایی بلند، دری بسته — و بی‌سروصدا دیگر از آن راه نرفتند. حسِ آسودگی داشت. اما راهی که کسی از آن نرود تاریک می‌شود، و در تاریکی ترسی کوچک بزرگ به نظر می‌رسد."),
          P("mira", "I'm Mira. I keep the lanterns. I can't walk a path for you — fear only unlearns in the person who feels it. But I'll walk beside you, one small step at a time, and you can turn back whenever you need to. Choose the path that frightens you. We'll start where it's small.",
            "من میرا هستم؛ فانوس‌بانِ این دره. نمی‌توانم به‌جای تو راهی را بروم — ترس فقط در کسی که آن را حس می‌کند از نو یاد گرفته می‌شود. اما کنارت راه می‌آیم، قدم‌به‌قدم، و هر وقت لازم بود می‌توانی برگردی. راهی را انتخاب کن که می‌ترساندت. از جایی شروع می‌کنیم که کوچک است."),
        ],
      }],
    },

    {
      id: "dogs", realm: "dogs", resident: "aram", n: 1,
      title: { en: "Aram at the fence", fa: "آرام پشتِ نرده" },
      beats: [
        { id: "dogs.open", lesson: "c.conditioning",
          title: { en: "The gardener at the fence", fa: "باغبانِ پشتِ نرده" },
          recap: { en: "You met Aram, who has crossed the street for forty years.", fa: "با آرام آشنا شدی که چهل سال است خیابان را دور می‌زند." },
          next: { en: "Trial 1: a small dog, far across the room. Aram will watch from the fence.", fa: "آزمون ۱: سگی کوچک، آن سرِ اتاق. آرام از پشتِ نرده نگاه می‌کند." },
          panels: [
            P("narrator", "The Meadow Yard's lantern went out years ago. Aram the gardener still tends its hedges — from the far side of the fence.",
              "فانوسِ حیاطِ چمن‌زار سال‌هاست خاموش است. آرامِ باغبان هنوز به پرچین‌هایش می‌رسد — از آن‌طرفِ نرده."),
            P("aram", "I was seven. The neighbour's dog knocked me down and bit my hand. One afternoon — and ever since, every dog has been that dog. I've crossed the street for forty years.",
              "هفت سالم بود. سگِ همسایه زمینم زد و دستم را گاز گرفت. فقط یک بعدازظهر — و از آن روز هر سگی همان سگ است. چهل سال است که خیابان را دور می‌زنم."),
            P("mira", "That's how many fears begin: one frightening moment teaches the alarm a rule. Then every crossed street felt like proof the rule was right — so it was never tested.",
              "خیلی از ترس‌ها همین‌طور شروع می‌شوند: یک لحظهٔ ترسناک به زنگِ خطر قانونی یاد می‌دهد. بعد هر بار که خیابان را دور زد، انگار ثابت شد آن قانون درست است — پس هیچ‌وقت آزموده نشد."),
          ] },
        { id: "dogs.a0", lesson: "t.ladder",
          title: { en: "The first rung", fa: "پلهٔ اول" },
          focus: { en: "Rate your fear honestly, before and after — that number is your map.", fa: "قبل و بعد، صادقانه به ترست نمره بده — این عدد نقشهٔ توست." },
          recap: { en: "You walked into the yard. Aram watched from the fence.", fa: "به حیاط رفتی و آرام از پشتِ نرده تماشا کرد." },
          next: { en: "Next: the same small dog — this time it wanders over to you.", fa: "بعدی: همان سگِ کوچک — این بار خودش به طرفت می‌آید." },
          panels: [
            P("aram", "You went in. It was small and far away — but you went in.", "رفتی داخل. کوچک بود و دور — اما رفتی داخل."),
            P("mira", "That's the first rung of a ladder. Start with a step that's hard but doable, then climb. Too big a step and the alarm only learns panic; too small and it learns nothing. Your 0–10 fear rating tells us which rung is right.",
              "این پلهٔ اولِ یک نردبان است. با قدمی شروع کن که سخت است اما شدنی، بعد بالا برو. قدمِ خیلی بزرگ فقط وحشت یاد می‌دهد؛ قدمِ خیلی کوچک هیچ. نمرهٔ ترسِ تو از ۰ تا ۱۰ نشان می‌دهد کدام پله درست است."),
          ] },
        { id: "dogs.a1", lesson: "t.wave",
          title: { en: "It came to you", fa: "به طرفت آمد" },
          focus: { en: "When the alarm peaks, stay where you are and watch it fall.", fa: "وقتی زنگِ خطر به اوج رسید، سرِ جایت بمان و پایین آمدنش را تماشا کن." },
          recap: { en: "The small dog came right up to you, and your alarm fell while you stayed.", fa: "سگِ کوچک درست کنارت آمد و وقتی ماندی زنگِ خطرت پایین آمد." },
          next: { en: "Next: a bigger dog. Ears up, watching you.", fa: "بعدی: سگی بزرگ‌تر. گوش‌ها تیز، نگاهش به توست." },
          panels: [
            P("aram", "It came right up to you. My heart was pounding just watching.", "درست آمد کنارت. من فقط تماشا می‌کردم و قلبم داشت از جا کنده می‌شد."),
            P("mira", "And your alarm? It rose, peaked, and came down on its own — while you stayed. Avoidance never lets you see that part. Leave at the peak and the brain files 'escape saved me'. Stay, and it files 'I was fine'.",
              "و زنگِ خطرت؟ بالا رفت، به اوج رسید و خودش پایین آمد — در حالی که ماندی. اجتناب هیچ‌وقت نمی‌گذارد این بخش را ببینی. اگر در اوج بروی، مغز ثبت می‌کند «فرار نجاتم داد». اگر بمانی، ثبت می‌کند «حالم خوب بود»."),
          ] },
        { id: "dogs.a2", lesson: "t.predict",
          title: { en: "Ears up", fa: "گوش‌های تیز" },
          focus: { en: "Name what your fear expects — then watch what the dog actually does.", fa: "بگو ترست انتظارِ چه دارد — بعد ببین سگ واقعاً چه می‌کند." },
          recap: { en: "A bigger dog watched you with its ears up — and your fear's prediction was put to the test.", fa: "سگی بزرگ‌تر با گوش‌های تیز نگاهت کرد — و پیش‌بینیِ ترست آزموده شد." },
          next: { en: "Next: a large dog that follows you closely — and barks now and then.", fa: "بعدی: سگی بزرگ که از نزدیک دنبالت می‌آید — و گاهی پارس می‌کند." },
          panels: [
            P("aram", "Ears up. I always took that to mean 'about to attack'.", "گوش‌هایش تیز بود. من همیشه فکر می‌کردم یعنی «الان حمله می‌کند»."),
            P("mira", "Your fear made a prediction, and you tested it. The gap between what the alarm expected and what actually happened is where new learning lives. The old memory isn't erased — a newer, safer one grows beside it and starts to win.",
              "ترست پیش‌بینی‌ای کرد و تو آزمودی‌اش. فاصلهٔ بین چیزی که زنگِ خطر انتظارش را داشت و چیزی که واقعاً پیش آمد، همان‌جایی است که یادگیریِ تازه زندگی می‌کند. خاطرهٔ قدیمی پاک نمی‌شود — خاطره‌ای تازه و امن‌تر کنارش رشد می‌کند و کم‌کم برنده می‌شود."),
          ] },
        { id: "dogs.a3", lesson: "t.safety",
          title: { en: "Small shields", fa: "سپرهای کوچک" },
          focus: { en: "Lower one shield: hands loose, and don't keep the way out in view.", fa: "یک سپر را کنار بگذار: دست‌ها رها، و چشمت دنبالِ راهِ خروج نباشد." },
          recap: { en: "A large dog followed you closely, and Aram told you about his shields.", fa: "سگی بزرگ از نزدیک دنبالت آمد و آرام از سپرهایش برایت گفت." },
          next: { en: "The last trial: a big, loud, excited dog. Aram says he'll come to the gate.", fa: "آزمونِ آخر: سگی بزرگ، پرسروصدا و هیجان‌زده. آرام می‌گوید تا دمِ در می‌آید." },
          panels: [
            P("aram", "I always kept a dog in sight. Never turned my back. Held my wife's arm the whole way past.",
              "همیشه سگ را جلوی چشمم نگه می‌داشتم. هیچ‌وقت پشتم را به‌ش نمی‌کردم. تمامِ راه بازوی همسرم را می‌گرفتم."),
            P("mira", "Those are safety behaviours — small shields. They feel helpful, but they steal the credit: 'I was only safe because I kept watching.' Lower them one at a time, and the lesson lands on you.",
              "این‌ها رفتارهای ایمنی‌اند — سپرهایی کوچک. به نظر کمک می‌کنند، اما اعتبار را می‌دزدند: «فقط چون مراقب بودم سالم ماندم.» یکی‌یکی کنارشان بگذار تا درس به خودِ تو برسد."),
          ] },
        { id: "dogs.close", lesson: "t.travel", closes: true,
          title: { en: "Inside the gate", fa: "این‌سوی در" },
          focus: { en: "The hardest rung: choose your distance, then stay until it settles.", fa: "سخت‌ترین پله: فاصله‌ات را خودت انتخاب کن، بعد بمان تا آرام شود." },
          recap: { en: "The Meadow Yard's lantern is lit. Aram stood inside the gate.", fa: "فانوسِ حیاطِ چمن‌زار روشن است. آرام این‌سوی در ایستاد." },
          next: { en: "Another lantern waits further down the valley.", fa: "فانوسِ دیگری پایین‌ترِ دره منتظر است." },
          panels: [
            P("narrator", "The Meadow Yard's lantern catches. Aram is standing at the open gate — on the inside.",
              "فانوسِ حیاطِ چمن‌زار شعله می‌گیرد. آرام کنارِ درِ باز ایستاده — این‌سوی در."),
            P("aram", "Tomorrow I'm walking to the bakery the short way. Past the house with the dog.",
              "فردا از راهِ کوتاه می‌روم نانوایی. از جلوی همان خانه‌ای که سگ دارد."),
            P("mira", "That's the real lantern. A game can rehearse it; only real streets and real dogs make it stick. Different dogs, different places — that's what lets the lesson travel.",
              "فانوسِ واقعی همین است. بازی می‌تواند تمرینش کند؛ اما فقط خیابان‌های واقعی و سگ‌های واقعی آن را ماندگار می‌کنند. سگ‌های مختلف، جاهای مختلف — این است که درس را به همه‌جا می‌برد."),
          ] },
      ],
    },

    {
      id: "spiders", realm: "spiders", resident: "leyla", n: 2,
      title: { en: "Leyla's cellar", fa: "زیرزمینِ لیلا" },
      beats: [
        { id: "spiders.open", lesson: "c.watching",
          title: { en: "Upstairs from the cellar", fa: "طبقهٔ بالای زیرزمین" },
          recap: { en: "You met Leyla, who learned her fear from her mother's face.", fa: "با لیلا آشنا شدی که ترسش را از صورتِ مادرش یاد گرفت." },
          next: { en: "Trial 1: a tiny dot in the far corner of the cellar.", fa: "آزمون ۱: نقطه‌ای ریز در گوشهٔ دورِ زیرزمین." },
          panels: [
            P("narrator", "Under the old house is a cellar nobody goes into. Leyla lives upstairs. She has never been bitten by a spider in her life.",
              "زیرِ خانهٔ قدیمی زیرزمینی است که هیچ‌کس پایش را آن‌جا نمی‌گذارد. لیلا طبقهٔ بالا زندگی می‌کند. در تمامِ عمرش حتی یک بار هم عنکبوتی نیشش نزده."),
            P("leyla", "My mother screamed whenever she saw one. I learned the fear from her face before I knew what a spider was. Now I check every corner of every room.",
              "مادرم هر بار عنکبوت می‌دید جیغ می‌کشید. من ترس را از صورتِ او یاد گرفتم، پیش از آن‌که بدانم عنکبوت چیست. حالا گوشه‌گوشهٔ هر اتاقی را وارسی می‌کنم."),
            P("mira", "Fear is contagious. Watching someone you trust be terrified can teach the alarm as well as being hurt can. And all that checking keeps it primed — the more you scan for spiders, the more you find.",
              "ترس واگیر دارد. دیدنِ وحشتِ کسی که به او اعتماد داری می‌تواند به اندازهٔ آسیب دیدن به زنگِ خطر درس بدهد. و آن همه وارسی آن را آماده نگه می‌دارد — هرچه بیشتر دنبالِ عنکبوت بگردی، بیشتر پیدا می‌کنی."),
          ] },
        { id: "spiders.a0", lesson: "c.disgust",
          title: { en: "The ugh", fa: "آن «اَه»" },
          focus: { en: "Notice the 'ugh' and the fear separately — both are allowed.", fa: "«اَه» و ترس را جدا از هم ببین — هر دو مجازند." },
          recap: { en: "A dot in a far corner — and Leyla's skin crawled anyway.", fa: "نقطه‌ای در گوشهٔ دور — و باز هم مو به تنِ لیلا سیخ شد." },
          next: { en: "Next: a small spider on the floor, nearer. It shifts, then stills.", fa: "بعدی: عنکبوتی کوچک روی زمین، نزدیک‌تر. تکان می‌خورد، بعد آرام می‌گیرد." },
          panels: [
            P("leyla", "A dot in the corner — and my skin crawled anyway.", "یک نقطه در گوشه — و باز هم مو به تنم سیخ شد."),
            P("mira", "Spiders set off two alarms: fear, and disgust — that 'ugh'. Disgust is a feeling, not a warning. It fades too, only more slowly than fear, so give it more repeats and don't judge yourself by it.",
              "عنکبوت‌ها دو زنگ را با هم به صدا درمی‌آورند: ترس، و چندش — همان «اَه». چندش یک احساس است، نه یک هشدار. آن هم فروکش می‌کند، فقط آرام‌تر از ترس؛ پس تکرارِ بیشتری لازم دارد. خودت را با آن قضاوت نکن."),
          ] },
        { id: "spiders.a1", lesson: "t.attend",
          title: { en: "Don't look away", fa: "نگاهت را برنگردان" },
          focus: { en: "Keep your eyes on it. Count its legs if you can.", fa: "نگاهت را رویش نگه دار. اگر می‌توانی پاهایش را بشمار." },
          recap: { en: "You kept your eyes on a small spider while it shifted and stilled.", fa: "وقتی عنکبوتی کوچک تکان خورد و آرام گرفت، نگاهت را رویش نگه داشتی." },
          next: { en: "Next: closer — and it darts when it moves.", fa: "بعدی: نزدیک‌تر — و وقتی حرکت می‌کند، می‌جهد." },
          panels: [
            P("leyla", "I wanted to look away the whole time.", "تمامِ مدت می‌خواستم رویم را برگردانم."),
            P("mira", "Keep your eyes on it — gently. Looking away, scrolling your phone, counting tiles: that's distraction, and it lets the alarm sit the lesson out. Curiosity works better. How many legs move at once? Where is it going?",
              "نگاهت را رویش نگه دار — آرام. رو برگرداندن، ور رفتن با گوشی، شمردنِ کاشی‌ها: این‌ها حواس‌پرتی‌اند، و حواس‌پرتی می‌گذارد زنگِ خطر از درس فرار کند. کنجکاوی بهتر جواب می‌دهد. چند پایش با هم حرکت می‌کنند؟ به کجا می‌رود؟"),
          ] },
        { id: "spiders.a2", lesson: "c.startle",
          title: { en: "The jump", fa: "از جا پریدن" },
          focus: { en: "If you jump, that's a reflex. Then look: where did it go?", fa: "اگر از جا پریدی، بازتاب است. بعد نگاه کن: کجا رفت؟" },
          recap: { en: "A spider darted, you jumped — and nothing else happened.", fa: "عنکبوتی جهید، از جا پریدی — و هیچ اتفاقِ دیگری نیفتاد." },
          next: { en: "Next: a large one, near your feet.", fa: "بعدی: یکی بزرگ، نزدیکِ پاهایت." },
          panels: [
            P("leyla", "When it darted, I jumped. Doesn't that prove I'm in danger?", "وقتی جهید، از جا پریدم. یعنی این ثابت نمی‌کند که در خطرم؟"),
            P("mira", "That jolt is the startle reflex. It fires before you can think — in everyone, at any sudden movement — and it shrinks with repetition. It's your body's reflex, not its verdict. Notice where the spider went: away, mostly.",
              "آن تکان، بازتابِ از جا پریدن است. پیش از آن‌که بتوانی فکر کنی شلیک می‌شود — در هر کسی، با هر حرکتِ ناگهانی — و با تکرار کوچک می‌شود. واکنشِ بدن است، نه حکمِ آن. دقت کن عنکبوت کجا رفت: بیشترِ وقت‌ها، دور."),
          ] },
        { id: "spiders.a3", lesson: "t.bearable",
          title: { en: "Bearable", fa: "تحمل‌پذیر" },
          focus: { en: "When it feels like too much, stay ten more seconds. Then ten more.", fa: "وقتی حس کردی زیادی است، ده ثانیهٔ دیگر بمان. بعد ده ثانیهٔ دیگر." },
          recap: { en: "A large spider stayed near your feet, and you stayed too.", fa: "عنکبوتی بزرگ کنارِ پاهایت ماند، و تو هم ماندی." },
          next: { en: "The last trial: one on the wall, right at eye level.", fa: "آزمونِ آخر: یکی روی دیوار، درست هم‌سطحِ چشمت." },
          panels: [
            P("leyla", "I always thought if one came this close, I'd fall apart completely.", "همیشه فکر می‌کردم اگر یکی این‌قدر نزدیک بیاید، کاملاً از هم می‌پاشم."),
            P("mira", "And you didn't. Fear predicts two things: that the spider is dangerous, and that the feeling will be unbearable. Today you tested the second one. Uncomfortable isn't dangerous — and learning you can bear it matters as much as learning the spider is harmless.",
              "و نپاشیدی. ترس دو چیز را پیش‌بینی می‌کند: این‌که عنکبوت خطرناک است، و این‌که این احساس تحمل‌ناپذیر است. امروز دومی را آزمودی. ناخوشایند یعنی خطرناک نیست — و یاد گرفتنِ این‌که می‌توانی تحملش کنی به اندازهٔ یاد گرفتنِ بی‌خطر بودنِ عنکبوت مهم است."),
          ] },
        { id: "spiders.close", lesson: "t.model", closes: true,
          title: { en: "Down the stairs", fa: "پایینِ پله‌ها" },
          focus: { en: "Imagine someone younger watching you. Show them what calm looks like.", fa: "تصور کن کسی کوچک‌تر تماشایت می‌کند. نشانش بده آرامش چه شکلی است." },
          recap: { en: "The cellar's lantern is lit, and Leyla went down the first step.", fa: "فانوسِ زیرزمین روشن است و لیلا پلهٔ اول را پایین رفت." },
          next: { en: "Another lantern waits further down the valley.", fa: "فانوسِ دیگری پایین‌ترِ دره منتظر است." },
          panels: [
            P("narrator", "The cellar lantern flickers, then holds. Leyla is standing at the top of the cellar stairs — and then on the first step.",
              "فانوسِ زیرزمین سوسو می‌زند، بعد می‌ماند. لیلا بالای پله‌های زیرزمین ایستاده — و بعد روی پلهٔ اول."),
            P("leyla", "When my niece visits, I'm going to carry a spider outside under a glass. Slowly. While she watches.",
              "وقتی خواهرزاده‌ام بیاید، یک عنکبوت را زیرِ لیوان بیرون می‌برم. آهسته. جلوی چشم‌های او."),
            P("mira", "Then the fear stops travelling down the family. Children learn fear by watching — and they learn calm the same way. Courage is contagious too.",
              "آن‌وقت ترس دیگر در خانواده دست‌به‌دست نمی‌شود. بچه‌ها ترس را با تماشا یاد می‌گیرند — و آرامش را هم همین‌طور. شجاعت هم واگیر دارد."),
          ] },
      ],
    },

    {
      id: "snakes", realm: "snakes", resident: "bahman", n: 3,
      title: { en: "Bahman's long way round", fa: "راهِ دورِ بهمن" },
      beats: [
        { id: "snakes.open", lesson: "c.words",
          title: { en: "The long way round", fa: "راهِ دور" },
          recap: { en: "You met Bahman, who learned his fear from his grandmother's stories.", fa: "با بهمن آشنا شدی که ترسش را از قصه‌های مادربزرگش یاد گرفت." },
          next: { en: "Trial 1: a snake basking on a rock, far across the clearing.", fa: "آزمون ۱: ماری که آن سرِ علفزار روی سنگی آفتاب می‌گیرد." },
          panels: [
            P("narrator", "The clearing is warm and green, and Bahman the shepherd won't cross it. Every day he takes his flock the long way round.",
              "علفزار گرم و سبز است، و بهمنِ چوپان از آن رد نمی‌شود. هر روز گله‌اش را از راهِ دور می‌برد."),
            P("bahman", "I've never met a snake up close. But I grew up on my grandmother's stories — snakes that chase you, snakes that wait in your boots. The words were enough.",
              "هیچ‌وقت از نزدیک ماری ندیده‌ام. اما با قصه‌های مادربزرگم بزرگ شدم — مارهایی که دنبالت می‌کنند، مارهایی که توی چکمه‌ات کمین می‌کنند. همان حرف‌ها کافی بود."),
            P("mira", "Fear can be handed down in words. And snakes are special: people learn to fear them far more easily than flowers or mushrooms — the brain arrives ready. Ready to learn a fear isn't the same as doomed to keep it, though.",
              "ترس را می‌شود با کلمه هم منتقل کرد. و مارها خاص‌اند: آدم‌ها ترس از مار را خیلی راحت‌تر از ترس از گل یا قارچ یاد می‌گیرند — مغز آماده به دنیا می‌آید. اما آماده بودن برای یاد گرفتنِ یک ترس یعنی محکوم بودن به نگه‌داشتنش نیست."),
          ] },
        { id: "snakes.a0", lesson: "t.facts",
          title: { en: "Sunbathing", fa: "آفتاب‌گرفتن" },
          focus: { en: "Watch what it does for a whole minute. Mostly: nothing.", fa: "یک دقیقهٔ کامل ببین چه می‌کند. بیشترش: هیچ." },
          recap: { en: "You watched a snake doing nothing at all on a warm rock.", fa: "ماری را تماشا کردی که روی سنگی گرم هیچ کاری نمی‌کرد." },
          next: { en: "Next: a little closer. Now and then it slides a short way, then settles.", fa: "بعدی: کمی نزدیک‌تر. گاهی کمی می‌خزد، بعد آرام می‌گیرد." },
          panels: [
            P("bahman", "It just lay there in the sun. All of it. Doing nothing.", "فقط زیرِ آفتاب دراز کشیده بود. همین. هیچ کاری نمی‌کرد."),
            P("mira", "Most of a snake's day is exactly that. Part of facing a fear is swapping stories for facts: most snakes are harmless, they avoid people, and bites mostly happen when someone grabs or steps on one. Facts alone won't cure a fear — but they tell your practice what to look for.",
              "بیشترِ روزِ یک مار همین است. بخشی از رو‌به‌رو شدن با ترس، عوض کردنِ قصه‌ها با واقعیت‌هاست: بیشترِ مارها بی‌خطرند، از آدم‌ها دوری می‌کنند، و نیش زدن بیشتر وقتی پیش می‌آید که کسی بخواهد بگیردشان یا پا رویشان بگذارد. واقعیت‌ها به‌تنهایی ترس را درمان نمی‌کنند — اما به تمرینت می‌گویند دنبالِ چه بگردد."),
          ] },
        { id: "snakes.a1", lesson: "t.breath",
          title: { en: "Breathe to stay", fa: "نفس بکش تا بمانی" },
          focus: { en: "If it moves, breathe out slowly — and stay where you are.", fa: "اگر حرکت کرد، آهسته بازدم کن — و سرِ جایت بمان." },
          recap: { en: "The snake moved and settled — and you used your breath to stay.", fa: "مار تکان خورد و آرام گرفت — و تو با نفست ماندی." },
          next: { en: "Next: it crosses the path in front of you, tasting the air.", fa: "بعدی: جلوی پایت از مسیر رد می‌شود و هوا را می‌چشد." },
          panels: [
            P("bahman", "It moved, and I nearly ran.", "تکان خورد و نزدیک بود فرار کنم."),
            P("mira", "But you didn't, and it settled. A slow out-breath, longer than the in-breath, helps you stay. Use it to stay — not to make the fear vanish. Breathing so you can remain is a tool; breathing as an escape hatch becomes one more shield.",
              "اما نکردی، و آرام گرفت. بازدمی آهسته، بلندتر از دم، کمکت می‌کند بمانی. از آن برای ماندن استفاده کن — نه برای این‌که ترس ناپدید شود. نفس کشیدن برای ماندن ابزار است؛ نفس کشیدن مثلِ راهِ فرار، خودش سپری دیگر می‌شود."),
          ] },
        { id: "snakes.a2", lesson: "t.read",
          title: { en: "Reading the air", fa: "خواندنِ هوا" },
          focus: { en: "Read it: calm, curious, or asking for room?", fa: "بخوانش: آرام، کنجکاو، یا جا می‌خواهد؟" },
          recap: { en: "A snake crossed your path and kept going. You were never its destination.", fa: "ماری از مسیرت گذشت و رفت. تو هیچ‌وقت مقصدش نبودی." },
          next: { en: "Next: it lifts its head and watches you.", fa: "بعدی: سرش را بالا می‌آورد و نگاهت می‌کند." },
          panels: [
            P("bahman", "It crossed right in front of you and kept going.", "درست از جلویت رد شد و رفت."),
            P("mira", "You were never its destination. Its tongue was reading the air — that's how snakes look around. Learning an animal's signals turns one big blur of 'danger' into calm, curious, or 'give me room'. Reading takes the place of dread.",
              "تو هیچ‌وقت مقصدش نبودی. زبانش داشت هوا را می‌خواند — مارها این‌طور اطرافشان را نگاه می‌کنند. یاد گرفتنِ نشانه‌های یک جانور، یک «خطرِ» بزرگ و مبهم را به آرام، کنجکاو یا «جا بده» تبدیل می‌کند. خواندن جای وحشت را می‌گیرد."),
          ] },
        { id: "snakes.a3", lesson: "t.respect",
          title: { en: "Respect is not fear", fa: "احترام، ترس نیست" },
          focus: { en: "Give it room when it warns. Respect is part of the skill.", fa: "وقتی هشدار داد، جا بده. احترام بخشی از مهارت است." },
          recap: { en: "A snake rose and hissed a warning — and you learned the difference between respect and fear.", fa: "ماری بلند شد و هشدار داد — و فرقِ احترام و ترس را یاد گرفتی." },
          next: { en: "The last trial: close, coiled and alert on the path.", fa: "آزمونِ آخر: نزدیک، چنبره‌زده و هوشیار، روی مسیر." },
          panels: [
            P("bahman", "It rose up and hissed. That's the thing from the stories.", "بلند شد و فیس کرد. این همان چیزِ توی قصه‌هاست."),
            P("mira", "It warned you before anything else — snakes would much rather you went away. Keeping a sensible distance from a wild snake is wisdom. A phobia is when a picture or a garden hose sends you running. The goal is the first, not fearlessness.",
              "پیش از هر کاری هشدار داد — مارها خیلی ترجیح می‌دهند تو بروی. فاصلهٔ معقول گرفتن از یک مارِ وحشی خردمندی است. فوبیا وقتی است که یک عکس یا یک شیلنگِ باغچه تو را فراری بدهد. هدف اولی است، نه بی‌ترسی."),
          ] },
        { id: "snakes.close", lesson: "t.story", closes: true,
          title: { en: "A new story", fa: "قصه‌ای تازه" },
          focus: { en: "Move slowly. Stay calm, and watch it settle.", fa: "آهسته حرکت کن. آرام بمان و آرام گرفتنش را ببین." },
          recap: { en: "The clearing's lantern is lit, and Bahman's flock grazes in the middle of it.", fa: "فانوسِ علفزار روشن است و گلهٔ بهمن وسطِ آن می‌چرد." },
          next: { en: "Another lantern waits further down the valley.", fa: "فانوسِ دیگری پایین‌ترِ دره منتظر است." },
          panels: [
            P("narrator", "The clearing's lantern takes flame in the noon light. Bahman's flock grazes in the middle of the clearing — and Bahman is with them.",
              "فانوسِ علفزار در نورِ ظهر شعله می‌گیرد. گلهٔ بهمن وسطِ علفزار می‌چرد — و بهمن هم کنارشان است."),
            P("bahman", "I'm going to tell my grandchildren a different story. The one about the snake that only wanted to sunbathe.",
              "برای نوه‌هایم قصهٔ دیگری تعریف می‌کنم. قصهٔ ماری که فقط می‌خواست آفتاب بگیرد."),
            P("mira", "Stories built the fear; a new story helps keep it small. Tell it — and walk the clearing now and then, so the new memory stays the stronger one.",
              "قصه‌ها ترس را ساختند؛ قصه‌ای تازه کمک می‌کند کوچک بماند. تعریفش کن — و گاهی از علفزار بگذر، تا خاطرهٔ تازه قوی‌تر بماند."),
          ] },
      ],
    },

    {
      id: "heights", realm: "heights", resident: "sahar", n: 4,
      title: { en: "Sahar's tower", fa: "برجِ سحر" },
      beats: [
        { id: "heights.open", lesson: "c.body",
          title: { en: "The second floor", fa: "طبقهٔ دوم" },
          recap: { en: "You met Sahar, whose fear began without anything happening at all.", fa: "با سحر آشنا شدی که ترسش بی‌آن‌که هیچ اتفاقی بیفتد شروع شد." },
          next: { en: "Trial 1: a knee-high ledge over a city square.", fa: "آزمون ۱: لبه‌ای به بلندیِ زانو، رو به میدانی در شهر." },
          panels: [
            P("narrator", "At the top of the valley stands the old tower. Sahar used to sweep its viewing deck. Then one day she couldn't climb past the second floor.",
              "بالای دره برجِ قدیمی ایستاده. سحر سکوی تماشایش را جارو می‌کرد. تا این‌که یک روز دیگر نتوانست از طبقهٔ دوم بالاتر برود."),
            P("sahar", "I never fell. Nothing happened. I looked down once, my legs turned to jelly, the floor seemed to tilt — and I was sure I was about to fall.",
              "هیچ‌وقت نیفتادم. هیچ اتفاقی نیفتاد. فقط یک بار پایین را نگاه کردم، پاهایم مثلِ ژله شد، کف انگار کج شد — و مطمئن بودم الان می‌افتم."),
            P("mira", "Not every fear starts with a bad event. Some wariness of edges is built in, and people who lean on their eyes for balance feel heights more. Then the mind reads those sensations as danger — 'dizzy means falling' — and that misreading keeps the fear going.",
              "همهٔ ترس‌ها با اتفاقی بد شروع نمی‌شوند. کمی احتیاط در لبه‌ها ذاتی است، و کسانی که برای تعادل بیشتر به چشمشان تکیه می‌کنند ارتفاع را شدیدتر حس می‌کنند. بعد ذهن این احساس‌ها را خطر می‌خواند — «سرگیجه یعنی افتادن» — و همین بدخوانی ترس را زنده نگه می‌دارد."),
          ] },
        { id: "heights.a0", lesson: "c.void",
          title: { en: "The call of the edge", fa: "کششِ لبه" },
          focus: { en: "If a strange thought flashes by, let it pass. It's a glitch, not a wish.", fa: "اگر فکری عجیب مثلِ برق گذشت، بگذار برود. خطاست، نه خواسته." },
          recap: { en: "Even a knee-high ledge made Sahar's stomach drop — and Mira explained the call of the edge.", fa: "حتی لبه‌ای به بلندیِ زانو دلِ سحر را لرزاند — و میرا «کششِ لبه» را برایت توضیح داد." },
          next: { en: "Next: a first-floor balcony, a railing in front of you.", fa: "بعدی: بالکنِ طبقهٔ اول، با نرده‌ای جلویت." },
          panels: [
            P("sahar", "Knee-high. And still my stomach dropped. Sometimes a thought even flashes by — 'what if I jumped?' — and that scares me most of all.",
              "به بلندیِ زانو. و باز هم دلم هری ریخت. گاهی حتی فکری مثلِ برق می‌گذرد: «اگر بپرم چه؟» — و این از همه بیشتر می‌ترساندم."),
            P("mira", "That flash has a name — the 'high place phenomenon' — and plenty of people with no wish to jump feel it. It seems to be the brain double-checking its own safety reflex, not a hidden wish. Knowing that takes away half its power.",
              "آن برق اسم دارد — «پدیدهٔ جای بلند» — و خیلی از آدم‌هایی که هیچ میلی به پریدن ندارند تجربه‌اش می‌کنند. به نظر می‌رسد مغز دارد بازتابِ ایمنیِ خودش را دوباره چک می‌کند، نه آرزویی پنهان. دانستنش نیمی از قدرتش را می‌گیرد."),
          ] },
        { id: "heights.a1", lesson: "t.fade",
          title: { en: "One finger", fa: "یک انگشت" },
          focus: { en: "Hold the rail if you need it — then loosen one finger.", fa: "اگر لازم است نرده را بگیر — بعد یک انگشت را شل کن." },
          recap: { en: "On the balcony, Sahar gripped the rail — then loosened one finger.", fa: "روی بالکن، سحر نرده را چسبید — بعد یک انگشت را شل کرد." },
          next: { en: "Next: a tenth-floor terrace — and part of the floor is glass.", fa: "بعدی: تراسِ طبقهٔ دهم — و بخشی از کف شیشه‌ای است." },
          panels: [
            P("sahar", "I gripped the rail so hard my hands hurt.", "نرده را آن‌قدر محکم گرفتم که دست‌هایم درد گرفت."),
            P("mira", "Hold it if you need to — then loosen one finger. Then another. Dropping a shield slowly is still dropping it. Each loosened finger is a tiny experiment: did I fall?",
              "اگر لازم است بگیرش — بعد یک انگشت را شل کن. بعد یکی دیگر. سپری را آهسته کنار گذاشتن، باز هم کنار گذاشتن است. هر انگشتِ شل‌شده آزمایشی کوچک است: افتادم؟"),
          ] },
        { id: "heights.a2", lesson: "t.thoughts",
          title: { en: "Weighing the thought", fa: "سنجیدنِ فکر" },
          focus: { en: "Catch one scary thought and ask it: how likely, really?", fa: "یک فکرِ ترسناک را بگیر و از آن بپرس: واقعاً چقدر محتمل است؟" },
          recap: { en: "On the glass terrace, you weighed a frightened thought against the evidence.", fa: "روی تراسِ شیشه‌ای، فکری ترسیده را با شواهد سنجیدی." },
          next: { en: "Next: a rooftop edge, ninety metres up, in real wind.", fa: "بعدی: لبهٔ پشت‌بام، نود متر بالاتر، در بادی واقعی." },
          panels: [
            P("sahar", "My thoughts were louder than the wind: 'The glass will crack. I'll lose control.'", "فکرهایم از باد بلندتر بودند: «شیشه می‌شکند. کنترلم را از دست می‌دهم.»"),
            P("mira", "Fear's thoughts are guesses, not news. Weigh them: how often does safety glass give way? What did your body actually do? Fear overestimates how likely the worst is, and underestimates how well you'd cope. The realistic version isn't wishful — it's accurate.",
              "فکرهای ترس حدس‌اند، نه خبر. بسنجشان: شیشهٔ ایمنی چند وقت یک بار می‌شکند؟ بدنت واقعاً چه کرد؟ ترس احتمالِ بدترین اتفاق را بیش از اندازه و توانِ کنار آمدنِ تو را کم‌تر از اندازه می‌بیند. نسخهٔ واقع‌بینانه خیال‌بافی نیست — دقیق است."),
          ] },
        { id: "heights.a3", lesson: "t.interoceptive",
          title: { en: "Dizzy on purpose", fa: "سرگیجه از روی عمد" },
          focus: { en: "Let the dizziness be there. Notice it rise, and pass.", fa: "بگذار سرگیجه باشد. بالا آمدن و گذشتنش را ببین." },
          recap: { en: "On the windy rooftop, Mira suggested practising the dizziness itself.", fa: "روی پشت‌بامِ بادگیر، میرا پیشنهاد کرد خودِ سرگیجه را تمرین کنی." },
          next: { en: "The last trial: the glass skywalk, 165 metres up, at dusk.", fa: "آزمونِ آخر: پلِ شیشه‌ای، ۱۶۵ متر بالاتر، در غروب." },
          panels: [
            P("sahar", "The wind pushed, and my body screamed 'get back'.", "باد هُل می‌داد و بدنم فریاد می‌زد «برگرد عقب»."),
            P("mira", "Sometimes the best practice is the sensation itself. Spin until you're dizzy, tip your head back to look up at a tall building — on purpose, somewhere safe. When dizziness stops meaning danger, heights lose their best weapon.",
              "گاهی بهترین تمرین خودِ احساس است. آن‌قدر دور خودت بچرخ که سرت گیج برود، سرت را عقب بده و به ساختمانی بلند نگاه کن — از روی عمد، جایی امن. وقتی سرگیجه دیگر معنیِ خطر ندهد، ارتفاع بهترین سلاحش را از دست می‌دهد."),
          ] },
        { id: "heights.close", lesson: "t.accept", closes: true,
          title: { en: "Let it swoop", fa: "بگذار دلت هری بریزد" },
          focus: { en: "Let your stomach swoop. Don't argue with it — just look.", fa: "بگذار دلت هری بریزد. با آن بحث نکن — فقط نگاه کن." },
          recap: { en: "The summit lantern is lit. Sahar is back on the viewing deck.", fa: "فانوسِ قله روشن است. سحر دوباره روی سکوی تماشاست." },
          next: { en: "Another lantern waits further down the valley.", fa: "فانوسِ دیگری پایین‌ترِ دره منتظر است." },
          panels: [
            P("narrator", "The summit lantern burns against the evening sky. Sahar is on the viewing deck with her broom, looking out over the city.",
              "فانوسِ قله در آسمانِ غروب می‌سوزد. سحر با جارویش روی سکوی تماشاست و به شهر نگاه می‌کند."),
            P("sahar", "It still swoops in my stomach. I've stopped arguing with it. I just look.", "هنوز دلم هری می‌ریزد. دیگر با آن بحث نمی‌کنم. فقط نگاه می‌کنم."),
            P("mira", "That's the goal — not a fear that's gone, but a fear that no longer decides for you. Keep going up now and then: footbridges, top floors, a hill at sunset.",
              "هدف همین است — نه ترسی که رفته، بلکه ترسی که دیگر به‌جای تو تصمیم نمی‌گیرد. گاه‌به‌گاه بالا برو: پل‌های عابر، طبقه‌های آخر، تپه‌ای در غروب."),
          ] },
      ],
    },

    {
      id: "dark", realm: "dark", resident: "nima", n: 5,
      title: { en: "Nima's lamp", fa: "چراغِ نیما" },
      beats: [
        { id: "dark.open", lesson: "c.stage",
          title: { en: "The lamp that never goes out", fa: "چراغی که هیچ‌وقت خاموش نمی‌شود" },
          recap: { en: "You met Nima, whose lamp has burned every night for years.", fa: "با نیما آشنا شدی که سال‌هاست هر شب چراغش روشن است." },
          next: { en: "Trial 1: your bedroom at night, the lamp still on.", fa: "آزمون ۱: اتاق‌خوابت در شب، با چراغی هنوز روشن." },
          panels: [
            P("narrator", "In the house at the bend of the road, a lamp has burned in Nima's room every night for years. Nima is ten.",
              "در خانهٔ سرِ پیچِ جاده، سال‌هاست هر شب چراغی در اتاقِ نیما روشن است. نیما ده سال دارد."),
            P("nima", "When the light's off, the wardrobe has eyes and the stairs creak like someone's on them. So the lamp stays on. Always.",
              "وقتی چراغ خاموش است، کمد چشم پیدا می‌کند و پله‌ها جوری غژغژ می‌کنند انگار کسی رویشان است. پس چراغ روشن می‌ماند. همیشه."),
            P("mira", "Nearly every child goes through a fear of the dark — it's a normal stage, and it usually fades as nights pass without anything happening. Nima's never got the chance: with the lamp always on, the dark was never tested.",
              "تقریباً همهٔ بچه‌ها دوره‌ای از تاریکی می‌ترسند — مرحله‌ای عادی است و معمولاً با گذشتنِ شب‌هایی که هیچ اتفاقی نمی‌افتد کم‌رنگ می‌شود. نیما هیچ‌وقت این فرصت را نداشت: با چراغی که همیشه روشن بود، تاریکی هیچ‌وقت آزموده نشد."),
          ] },
        { id: "dark.a0", lesson: "c.uncertain",
          title: { en: "Filling the gaps", fa: "پر کردنِ جاهای خالی" },
          focus: { en: "Notice the guesses your mind makes about the shadows.", fa: "حدس‌هایی را که ذهنت دربارهٔ سایه‌ها می‌زند ببین." },
          recap: { en: "In the lamp-lit room, Mira showed you how the brain fills dark gaps with guesses.", fa: "در اتاقِ چراغ‌روشن، میرا نشانت داد مغز چطور جاهای خالیِ تاریک را با حدس پر می‌کند." },
          next: { en: "Next: curtains drawn. Only a night-light, and long shadows.", fa: "بعدی: پرده‌ها کشیده. فقط یک چراغ‌خواب، و سایه‌هایی بلند." },
          panels: [
            P("nima", "That's just my room with the lamp on. That's easy.", "این که فقط اتاقِ خودم است با چراغِ روشن. آسان است."),
            P("mira", "Easy is allowed — the first rung should feel almost too small. Now look at the shadows. When the brain is missing information, it guesses, and an anxious brain guesses 'someone'. Fear of the dark is mostly fear of not knowing.",
              "آسان مجاز است — پلهٔ اول باید تقریباً زیادی کوچک به نظر برسد. حالا به سایه‌ها نگاه کن. وقتی مغز اطلاعات کم دارد، حدس می‌زند، و مغزِ مضطرب حدس می‌زند «کسی آن‌جاست». ترس از تاریکی بیشتر ترس از ندانستن است."),
          ] },
        { id: "dark.a1", lesson: "t.name",
          title: { en: "Name it", fa: "اسمش را بگذار" },
          focus: { en: "Say what you see and what you feel — out loud if you can.", fa: "آن‌چه می‌بینی و حس می‌کنی را بگو — اگر می‌توانی، بلند." },
          recap: { en: "A shadow became a coat on a door once you named it.", fa: "سایه‌ای، وقتی اسمش را گذاشتی، کتی روی در شد." },
          next: { en: "Next: lights off. Moonlight, and your eyes adjusting.", fa: "بعدی: چراغ‌ها خاموش. نورِ ماه، و چشم‌هایت که عادت می‌کنند." },
          panels: [
            P("nima", "A shadow on the wall looked like a man in a hat.", "سایه‌ای روی دیوار شبیهِ مردی با کلاه بود."),
            P("mira", "And when you kept looking, it was the coat on the door. Saying out loud what you see — 'that's the coat, that's the chair' — and what you feel — 'I'm scared' — turns a shapeless dread into something you can check. It sounds too simple to work. Studies say it works.",
              "و وقتی به نگاه کردن ادامه دادی، کتِ آویزان روی در بود. بلند گفتنِ آن‌چه می‌بینی — «این کت است، این صندلی است» — و آن‌چه حس می‌کنی — «می‌ترسم» — وحشتی بی‌شکل را به چیزی تبدیل می‌کند که می‌شود وارسی‌اش کرد. ساده‌تر از آن به نظر می‌رسد که جواب بدهد. پژوهش‌ها می‌گویند جواب می‌دهد."),
          ] },
        { id: "dark.a2", lesson: "t.spacing",
          title: { en: "Sleep on it", fa: "یک شب رویش بخواب" },
          focus: { en: "Let your eyes adjust. Then come back tomorrow night.", fa: "بگذار چشم‌هایت عادت کنند. بعد فردا شب برگرد." },
          recap: { en: "With the lights off, your eyes adjusted — and Mira asked you to come back tomorrow.", fa: "با چراغ‌های خاموش چشم‌هایت عادت کردند — و میرا خواست فردا برگردی." },
          next: { en: "Next: the dark landing outside your room.", fa: "بعدی: راه‌پلهٔ تاریکِ بیرونِ اتاقت." },
          panels: [
            P("nima", "My eyes got used to it. I could see more than I thought.", "چشم‌هایم عادت کردند. بیشتر از آن‌چه فکر می‌کردم می‌دیدم."),
            P("mira", "Your eyes adjust faster than fear predicts, and so does the alarm. Here's a secret: doing this again tomorrow night helps more than doing it five times tonight. Sleep helps the new learning settle in.",
              "چشم‌هایت سریع‌تر از پیش‌بینیِ ترس عادت می‌کنند، و زنگِ خطر هم. یک راز: تکرارِ این کار فردا شب بیشتر از پنج بار تکرارش امشب کمک می‌کند. خواب کمک می‌کند یادگیریِ تازه جا بیفتد."),
          ] },
        { id: "dark.a3", lesson: "t.subtle",
          title: { en: "Walk, don't run", fa: "راه برو، ندو" },
          focus: { en: "Walk slowly. No hurrying, no holding your breath.", fa: "آهسته راه برو. بی‌عجله، بی‌حبسِ نفس." },
          recap: { en: "On the dark landing, Nima walked instead of running.", fa: "در راه‌پلهٔ تاریک، نیما به‌جای دویدن راه رفت." },
          next: { en: "The last trial: total dark. Only the sounds of the house.", fa: "آزمونِ آخر: تاریکیِ مطلق. فقط صداهای خانه." },
          panels: [
            P("nima", "I always run down the landing. Tonight I walked.", "همیشه از راه‌پله می‌دوم. امشب راه رفتم."),
            P("mira", "Walking instead of running is a big deal. Running is a quiet escape — the body learns 'I made it just in time'. Walking teaches 'there was never anything to escape'.",
              "راه رفتن به‌جای دویدن کارِ بزرگی است. دویدن فراری بی‌صداست — بدن یاد می‌گیرد «درست به موقع رسیدم». راه رفتن یاد می‌دهد «هیچ‌وقت چیزی برای فرار نبود»."),
          ] },
        { id: "dark.close", lesson: "t.lapse", closes: true,
          title: { en: "Lamp off", fa: "چراغ خاموش" },
          focus: { en: "Total dark: name each sound — the house, or your mind.", fa: "تاریکیِ مطلق: هر صدا را نام ببر — خانه، یا ذهنت." },
          recap: { en: "The house lantern is lit, and Nima's lamp is off.", fa: "فانوسِ خانه روشن است و چراغِ اتاقِ نیما خاموش." },
          next: { en: "Another lantern waits further down the valley.", fa: "فانوسِ دیگری پایین‌ترِ دره منتظر است." },
          panels: [
            P("narrator", "The house lantern glows at the bend of the road. In Nima's room, the lamp is off.",
              "فانوسِ خانه سرِ پیچِ جاده می‌درخشد. در اتاقِ نیما، چراغ خاموش است."),
            P("nima", "The creak is the stairs cooling down. Dad says houses stretch at night, like cats.",
              "آن غژغژ صدای پله‌هاست که خنک می‌شوند. بابا می‌گوید خانه‌ها شب‌ها مثلِ گربه کش‌وقوس می‌آیند."),
            P("mira", "Some nights the fear will wobble back — when Nima is tired, ill, or somewhere new. That's normal, and it isn't starting over: a lapse, not a relapse. A few nights with the hall light off bring it down faster than the first time.",
              "بعضی شب‌ها ترس کمی برمی‌گردد — وقتی نیما خسته است، بیمار است یا جایی تازه. این عادی است و یعنی از اول شروع کردن نیست: لغزش است، نه بازگشت. چند شب با چراغِ خاموشِ راهرو آن را سریع‌تر از بارِ اول پایین می‌آورد."),
          ] },
      ],
    },

    {
      id: "enclosed", realm: "enclosed", resident: "shirin", n: 6,
      title: { en: "Shirin's stairs", fa: "پله‌های شیرین" },
      beats: [
        { id: "enclosed.open", lesson: "c.panic",
          title: { en: "Nine floors of stairs", fa: "نُه طبقه پله" },
          recap: { en: "You met Shirin, whose fear spread from one stuck lift to every small space.", fa: "با شیرین آشنا شدی که ترسش از یک آسانسورِ گیرکرده به همهٔ جاهای کوچک پخش شد." },
          next: { en: "Trial 1: a small room. You close the door behind you.", fa: "آزمون ۱: اتاقی کوچک. در را پشتِ سرت می‌بندی." },
          panels: [
            P("narrator", "Shirin works on the ninth floor and takes the stairs. Every day, twice a day, summer too.",
              "شیرین در طبقهٔ نهم کار می‌کند و از پله‌ها بالا می‌رود. هر روز، روزی دو بار، حتی تابستان."),
            P("shirin", "The lift stopped between floors once. Twenty minutes. My chest locked and I was sure I'd suffocate. I didn't — but since then it's lifts, tunnels, the back seat of a car. And next month, an MRI.",
              "یک بار آسانسور بینِ دو طبقه ایستاد. بیست دقیقه. سینه‌ام قفل شد و مطمئن بودم خفه می‌شوم. نشدم — اما از آن روز آسانسور، تونل، صندلیِ عقبِ ماشین. و ماهِ بعد، ام‌آرآی."),
            P("mira", "One panic in one small space, and the alarm spread to every small space — and to its own signals: now a tight chest feels like proof. Some people are also born with a more sensitive alarm. Genes and temperament load the dice; what we learn decides the game.",
              "یک وحشت در یک جای کوچک، و زنگِ خطر به همهٔ جاهای کوچک پخش شد — و به نشانه‌های خودِ بدن: حالا سینهٔ تنگ مثلِ مدرک است. بعضی‌ها هم با زنگِ خطری حساس‌تر به دنیا می‌آیند. ژن‌ها و خلق‌وخو تاس را سنگین می‌کنند؛ آن‌چه یاد می‌گیریم بازی را تعیین می‌کند."),
          ] },
        { id: "enclosed.a0", lesson: "c.loop",
          title: { en: "The loop", fa: "چرخه" },
          focus: { en: "When your chest tightens, don't reach for the door. Watch the loop wind down.", fa: "وقتی سینه‌ات تنگ شد، دست به طرفِ در نبر. آرام گرفتنِ چرخه را ببین." },
          recap: { en: "In a small room with the door closed, the panic loop wound down by itself.", fa: "در اتاقی کوچک با درِ بسته، چرخهٔ وحشت خودش آرام گرفت." },
          next: { en: "Next: an office phone booth with a glass door.", fa: "بعدی: یک باجهٔ تلفنِ اداری با درِ شیشه‌ای." },
          panels: [
            P("shirin", "Closing the door was the hardest part.", "بستنِ در سخت‌ترین بخش بود."),
            P("mira", "Panic runs in a loop: a sensation — a tight chest — sparks a thought — 'I can't breathe' — which turns up the alarm, which tightens the chest. Today you broke the 'get out' link, and the loop wound down on its own.",
              "وحشت در یک چرخه می‌چرخد: یک احساس — سینهٔ تنگ — فکری را روشن می‌کند — «نمی‌توانم نفس بکشم» — که زنگِ خطر را بلندتر می‌کند، که سینه را تنگ‌تر می‌کند. امروز حلقهٔ «برو بیرون» را شکستی، و چرخه خودش آرام گرفت."),
          ] },
        { id: "enclosed.a1", lesson: "t.air",
          title: { en: "Enough air", fa: "هوای کافی" },
          focus: { en: "Let your breath do what it does. Don't fight it.", fa: "بگذار نفست کارِ خودش را بکند. با آن نجنگ." },
          recap: { en: "In the phone booth, you learned the breathless feeling comes from the alarm, not the room.", fa: "در باجهٔ تلفن یاد گرفتی حسِ کم‌آوردنِ نفس از زنگِ خطر است، نه از اتاق." },
          next: { en: "Next: a small lift. The doors close — two floors, then out.", fa: "بعدی: آسانسوری کوچک. درها بسته می‌شوند — دو طبقه، بعد بیرون." },
          panels: [
            P("shirin", "I kept thinking the air would run out.", "مدام فکر می‌کردم هوا تمام می‌شود."),
            P("mira", "A small room holds far more air than it feels like, and doors aren't airtight — air keeps arriving. The breathless feeling is the alarm, not the oxygen. You don't have to breathe 'correctly'. Breathe however your body breathes — it knows how.",
              "یک اتاقِ کوچک خیلی بیشتر از آن‌چه به نظر می‌رسد هوا دارد، و درها هوابند نیستند — هوا مدام می‌رسد. حسِ کم‌آوردنِ نفس از زنگِ خطر است، نه از اکسیژن. لازم نیست «درست» نفس بکشی. همان‌طور نفس بکش که بدنت نفس می‌کشد — بلد است."),
          ] },
        { id: "enclosed.a2", lesson: "t.longer",
          title: { en: "Long enough", fa: "به اندازهٔ کافی" },
          focus: { en: "Stay until the doors open by themselves.", fa: "بمان تا درها خودشان باز شوند." },
          recap: { en: "You rode the lift until its doors opened by themselves.", fa: "در آسانسور ماندی تا درهایش خودشان باز شدند." },
          next: { en: "Next: a storage closet. Shelves at your shoulders.", fa: "بعدی: انباری. قفسه‌ها هم‌سطحِ شانه‌هایت." },
          panels: [
            P("shirin", "I stayed until the doors opened on their own. I didn't press anything.", "ماندم تا درها خودشان باز شدند. هیچ دکمه‌ای نزدم."),
            P("mira", "That's the key: staying long enough for the fear's prediction to fail. For many specific phobias, a single long, well-planned session with a therapist — often a few hours — makes a lasting difference. It isn't about toughness. It's about time to learn.",
              "کلید همین است: آن‌قدر ماندن که پیش‌بینیِ ترس شکست بخورد. برای خیلی از فوبیاهای خاص، یک جلسهٔ طولانی و خوب‌برنامه‌ریزی‌شده با درمانگر — اغلب چند ساعت — تفاوتی ماندگار ایجاد می‌کند. موضوع سرسختی نیست. موضوع وقت برای یاد گرفتن است."),
          ] },
        { id: "enclosed.a3", lesson: "t.control",
          title: { en: "Choice, not escape", fa: "انتخاب، نه فرار" },
          focus: { en: "Close the door all the way — it's yours to open, any time.", fa: "در را کامل ببند — باز کردنش هر وقت بخواهی دستِ خودت است." },
          recap: { en: "In the closet, Shirin let the door close instead of guarding it.", fa: "در انباری، شیرین گذاشت در بسته شود به‌جای این‌که از آن نگهبانی کند." },
          next: { en: "The last trial: lying still in an MRI scanner.", fa: "آزمونِ آخر: بی‌حرکت دراز کشیدن در دستگاهِ ام‌آرآی." },
          panels: [
            P("shirin", "I wanted to wedge the door open. Keep a foot in it.", "می‌خواستم در را با چیزی باز نگه دارم. یک پایم را لای در بگذارم."),
            P("mira", "The door is always yours to open — that never changes. But a door you keep a foot in is an exit you're guarding, and guarding it keeps 'trapped' alive. Choose to stay, and let the space be just a space.",
              "باز کردنِ در همیشه دستِ خودت است — این هیچ‌وقت عوض نمی‌شود. اما دری که پایت را لایش گذاشته‌ای، خروجی است که نگهبانی‌اش می‌کنی، و همین نگهبانی «گیر افتادن» را زنده نگه می‌دارد. انتخاب کن بمانی، و بگذار آن فضا فقط یک فضا باشد."),
          ] },
        { id: "enclosed.close", lesson: "t.help", closes: true,
          title: { en: "The ground floor", fa: "طبقهٔ همکف" },
          focus: { en: "Lie still. Let the noise be noise.", fa: "بی‌حرکت دراز بکش. بگذار صدا فقط صدا باشد." },
          recap: { en: "The passage lantern is lit, and Shirin stepped into the lift.", fa: "فانوسِ گذرگاه روشن است و شیرین قدم به آسانسور گذاشت." },
          next: { en: "Another lantern waits further down the valley.", fa: "فانوسِ دیگری پایین‌ترِ دره منتظر است." },
          panels: [
            P("narrator", "The passage lantern lights the tunnel end to end. On the ground floor, the lift doors open, and Shirin steps in.",
              "فانوسِ گذرگاه تونل را از این سر تا آن سر روشن می‌کند. در طبقهٔ همکف، درهای آسانسور باز می‌شوند و شیرین قدم به داخل می‌گذارد."),
            P("shirin", "My scan is on Tuesday. I told the radiographer I get nervous — they said they'll talk me through it.",
              "اسکنم سه‌شنبه است. به کاردانِ رادیولوژی گفتم مضطرب می‌شوم — گفتند در طولِ کار با من حرف می‌زنند."),
            P("mira", "Asking for support isn't a shield — it's planning. And if a fear keeps you from scans, work, or the people you love, a therapist trained in exposure can walk the real path with you. That isn't failing the game. It's the real game.",
              "کمک خواستن سپر نیست — برنامه‌ریزی است. و اگر ترسی تو را از اسکن، کار یا آدم‌هایی که دوستشان داری دور نگه می‌دارد، درمانگری که مواجهه‌درمانی بلد است می‌تواند راهِ واقعی را با تو برود. این باختن در بازی نیست. خودِ بازیِ واقعی است."),
          ] },
      ],
    },

    {
      id: "epilogue", kind: "epilogue",
      title: { en: "Epilogue", fa: "پایان‌بخش" },
      beats: [{
        id: "epilogue", lesson: "t.journey",
        title: { en: "Dawn", fa: "سپیده" },
        recap: { en: "All six lanterns burn, and Mira told you her own secret.", fa: "هر شش فانوس روشن‌اند و میرا رازِ خودش را برایت گفت." },
        next: { en: "The valley is yours.", fa: "دره مالِ توست." },
        panels: [
          P("narrator", "Six lanterns burn along the valley, and the paths between them are worn again by people's feet.",
            "شش فانوس در طولِ دره می‌سوزند، و راه‌های میانشان دوباره زیرِ پای مردم صاف شده."),
          P("mira", "I'll tell you a secret. I was afraid of deep water for most of my life. I still swim — slowly, on purpose, every week. The fear didn't vanish; it stopped being in charge.",
            "رازی برایت بگویم. بیشترِ عمرم از آبِ عمیق می‌ترسیدم. هنوز شنا می‌کنم — آهسته، از روی عمد، هر هفته. ترس ناپدید نشد؛ دیگر فرمانده نبود."),
          P("mira", "The lanterns stay lit by walking the paths. Come back whenever you like — and take the real steps out there, where they count most.",
            "فانوس‌ها با رفتن از این راه‌ها روشن می‌مانند. هر وقت خواستی برگرد — و قدم‌های واقعی را آن بیرون بردار، جایی که بیشترین ارزش را دارند."),
        ],
      }],
    },
  ];

  // Index: beat id → { beat, chapter, idx }
  const BEATS = {};
  const ORDER = [];
  CHAPTERS.forEach((ch) => ch.beats.forEach((b, idx) => { BEATS[b.id] = { beat: b, chapter: ch, idx }; ORDER.push(b.id); }));
  const REALM_CHAPTERS = CHAPTERS.filter((c) => c.realm);
  const chapterOfRealm = (k) => REALM_CHAPTERS.find((c) => c.realm === k) || null;
  // Beat turned by finishing trial i of realm k (0..3 → a0..a3, 4 → close).
  const beatAfterTrial = (k, i) => {
    const ch = chapterOfRealm(k);
    if (!ch) return null;
    const n = levelsOf(k);
    return i >= n - 1 ? `${k}.close` : (BEATS[`${k}.a${i}`] ? `${k}.a${i}` : null);
  };

  // ---------------------------------------------------------------------------
  // State (per character, beside progress/log): cs.story = { seen: {id: ts} }
  // ---------------------------------------------------------------------------
  function slice() {
    try {
      const cs = typeof activeCharSlice === "function" ? activeCharSlice() : null;
      if (!cs) return { seen: {} };
      if (!cs.story || typeof cs.story !== "object") cs.story = { seen: {} };
      if (!cs.story.seen) cs.story.seen = {};
      return cs.story;
    } catch { return { seen: {} }; }
  }
  function save() { try { if (typeof saveState === "function") saveState(); } catch {} }
  function isSeen(id) { return !!slice().seen[id]; }
  function markSeen(id) { const s = slice(); if (!s.seen[id]) { s.seen[id] = Date.now(); save(); } }
  function levelsOf(k) { try { return (PHOBIAS[k] && PHOBIAS[k].levels && PHOBIAS[k].levels.length) || 5; } catch { return 5; } }
  function hc(k) { try { const p = getProgress(k); return p && typeof p.highestCompleted === "number" ? p.highestCompleted : -1; } catch { return -1; } }
  function isOpenRealm(k) { try { return typeof realmOpen === "function" ? realmOpen(k) : true; } catch { return true; } }
  function realmLit(k) { return hc(k) >= levelsOf(k) - 1; }
  function storyRealms() { return REALM_CHAPTERS.map((c) => c.realm).filter((k) => { try { return PHOBIAS[k] && isOpenRealm(k); } catch { return false; } }); }
  function allLit() { const r = storyRealms(); return r.length > 0 && r.every(realmLit); }
  function flames(k) { return Math.max(0, Math.min(levelsOf(k), hc(k) + 1)); }

  function isUnlocked(id) {
    const e = BEATS[id];
    if (!e) return false;
    const ch = e.chapter;
    if (ch.kind === "prologue") return true;
    if (ch.kind === "epilogue") return allLit();
    const k = ch.realm, b = e.beat;
    if (!isOpenRealm(k)) return false;
    if (b.id.endsWith(".open")) return true;
    if (b.closes) return realmLit(k);
    const m = /\.a(\d)$/.exec(b.id);
    return m ? hc(k) >= +m[1] : false;
  }
  // The page whose idea is practised IN trial i (its focus line).
  function focusFor(k, i) {
    const id = beatAfterTrial(k, i);
    const e = id && BEATS[id];
    return e && e.beat.focus ? { text: L(e.beat.focus), lesson: LESSONS[e.beat.lesson], page: L(e.beat.title) } : null;
  }

  // The page that belongs BEFORE starting trial `lvl` of realm k: the chapter
  // opening, or — on the way up the ladder — the page the last trial turned
  // and nobody has read yet. Replays never get gated.
  function pendingBefore(k, lvl) {
    if (!chapterOfRealm(k) || !isOpenRealm(k)) return null;
    if (!isSeen(`${k}.open`)) return `${k}.open`;
    const h = hc(k);
    if (lvl >= 1 && lvl === h + 1) {
      const prev = beatAfterTrial(k, lvl - 1);
      if (prev && isUnlocked(prev) && !isSeen(prev)) return prev;
    }
    return null;
  }
  // The page a just-finished trial turned, if still unread.
  function pendingAfter(k, lvl) {
    const id = beatAfterTrial(k, lvl);
    return id && isUnlocked(id) && !isSeen(id) ? id : null;
  }
  // First unlocked, unread page in reading order — counting a realm's opening
  // only once the traveler has set foot in it (or it's their current realm),
  // so six unread openings don't all clamour at once.
  function nextUnread(currentKey) {
    for (const id of ORDER) {
      const e = BEATS[id];
      if (!isUnlocked(id) || isSeen(id)) continue;
      if (e.chapter.realm && id.endsWith(".open") && hc(e.chapter.realm) < 0 && e.chapter.realm !== currentKey) continue;
      return id;
    }
    return null;
  }
  // The most recently read page — the "previously" line on the title screen.
  function lastRead() {
    const seen = slice().seen;
    let best = null, ts = 0;
    for (const id of Object.keys(seen)) if (BEATS[id] && seen[id] > ts) { ts = seen[id]; best = id; }
    return best;
  }
  function titleOf(id) { const e = BEATS[id]; return e ? L(e.beat.title) : ""; }
  function pagesRead() { const seen = slice().seen; return ORDER.filter((id) => seen[id]).length; }
  function lessonsLearned() {
    const seen = slice().seen;
    return ORDER.filter((id) => seen[id]).map((id) => BEATS[id].beat.lesson).filter(Boolean);
  }

  // ---------------------------------------------------------------------------
  // Art: a scene band in SVG (sky, hills, the realm's motif, its lantern) and
  // the cast's portraits. Seeded so a page looks the same every time.
  // ---------------------------------------------------------------------------
  const PALETTE = {
    prologue: { sky: ["#060914", "#1b2550"], orb: "moon", far: "#141b33", near: "#0c1124", stars: 46 },
    epilogue: { sky: ["#2b3a78", "#ffb27a"], orb: "sun",  far: "#4a5a7a", near: "#2e3a55", stars: 8 },
    dogs:     { sky: ["#3b3f6b", "#e9a46a"], orb: "sun",  far: "#5d7a5a", near: "#30503a", stars: 6 },
    spiders:  { sky: ["#141322", "#3a2b22"], orb: "moon", far: "#2b2621", near: "#1b1714", stars: 24 },
    snakes:   { sky: ["#5fa8d3", "#d6ecc6"], orb: "sun",  far: "#7fae6a", near: "#4e8a45", stars: 0 },
    heights:  { sky: ["#1f2a5a", "#f08a6a"], orb: "sun",  far: "#3a3f6a", near: "#262a48", stars: 12 },
    dark:     { sky: ["#070a16", "#1a2140"], orb: "moon", far: "#161b30", near: "#0e1222", stars: 40 },
    enclosed: { sky: ["#1d2b33", "#4d6b70"], orb: "none", far: "#2a3a40", near: "#1a262b", stars: 0 },
  };
  function rng(seed) { let s = 0; for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function motifSVG(k, lit, ink) {
    const glow = lit ? "#ffd68a" : "#3a3f55";
    switch (k) {
      case "dogs": return `<g fill="${ink}" transform="translate(70 104)"><ellipse cx="16" cy="14" rx="15" ry="9"/><circle cx="31" cy="2" r="7"/><path d="M27 -3 l3 -8 l4 7z"/><ellipse cx="37" cy="5" rx="5" ry="3"/><rect x="5" y="18" width="4" height="10" rx="2"/><rect x="22" y="18" width="4" height="10" rx="2"/><path d="M2 10 q-9 -8 -6 -16" stroke="${ink}" stroke-width="3" fill="none" stroke-linecap="round"/></g>
        <g stroke="${ink}" stroke-width="2" opacity=".9"><line x1="20" y1="104" x2="60" y2="104"/><line x1="24" y1="96" x2="24" y2="132"/><line x1="40" y1="96" x2="40" y2="132"/><line x1="56" y1="96" x2="56" y2="132"/><line x1="20" y1="114" x2="60" y2="114"/></g>`;
      case "spiders": return `<g fill="${ink}"><path d="M40 132 V96 L70 76 L100 96 V132z"/><rect x="62" y="108" width="16" height="24" fill="${lit ? "#5a4630" : "#141010"}"/><rect x="52" y="94" width="10" height="9" fill="${glow}" opacity="${lit ? 0.9 : 0.35}"/></g>
        <line x1="118" y1="0" x2="118" y2="70" stroke="${ink}" stroke-width="1" opacity=".7"/><g transform="translate(118 74)" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M-3 -2 l-9 -6 M-3 0 l-10 -1 M-3 2 l-9 5 M-3 3 l-6 9 M3 -2 l9 -6 M3 0 l10 -1 M3 2 l9 5 M3 3 l6 9"/></g><g transform="translate(118 74)" fill="${ink}"><circle r="4"/><circle cy="-5" r="2.6"/></g>`;
      case "snakes": return `<path d="M28 128 C44 112, 64 132, 80 118 S110 104, 120 116" stroke="${ink}" stroke-width="6" fill="none" stroke-linecap="round"/><ellipse cx="124" cy="114" rx="6" ry="4" fill="${ink}"/><path d="M129 114 l6 -1 m-6 1 l6 2" stroke="#c0392b" stroke-width="1"/>
        <path d="M150 132 q8 -18 16 0" fill="${ink}" opacity=".6"/>`;
      case "heights": return `<g fill="${ink}"><rect x="58" y="30" width="26" height="102"/><rect x="50" y="26" width="42" height="7" rx="2"/><rect x="66" y="12" width="10" height="16"/></g>
        <g fill="${glow}" opacity="${lit ? 0.85 : 0.25}">${[44, 62, 80, 98, 116].map((y) => `<rect x="63" y="${y}" width="5" height="6"/><rect x="74" y="${y}" width="5" height="6"/>`).join("")}</g>`;
      case "dark": return `<g fill="${ink}"><path d="M34 132 V92 L72 66 L110 92 V132z"/><rect x="90" y="70" width="8" height="16"/></g><rect x="62" y="98" width="20" height="16" fill="${lit ? "#1a1f33" : "#ffd68a"}" opacity="${lit ? 0.9 : 0.8}"/><line x1="72" y1="98" x2="72" y2="114" stroke="${ink}" stroke-width="2"/>`;
      case "enclosed": return `<g fill="${ink}"><path d="M30 132 V82 q42 -40 84 0 V132z"/></g><path d="M50 132 V92 q22 -22 44 0 V132z" fill="${lit ? "#ffd68a" : "#0b1216"}" opacity="${lit ? 0.55 : 1}"/>`;
      default: return "";
    }
  }
  function lanternSVG(x, y, nLit, total, ignite, noPips) {
    const r = total ? nLit / total : 0;
    const pips = noPips ? "" : Array.from({ length: total }, (_, i) =>
      `<circle cx="${x - (total - 1) * 3.5 + i * 7}" cy="${y + 52}" r="1.7" fill="${i < nLit ? "#ffcf6e" : "rgba(255,255,255,.22)"}"/>`).join("");
    return `<g class="st-lantern${ignite ? " ignite" : ""}">
      <circle class="st-glow" cx="${x}" cy="${y + 10}" r="${26 + r * 30}" fill="url(#stGlow)" opacity="${(0.08 + r * 0.92).toFixed(2)}"/>
      <line x1="${x}" y1="${y - 14}" x2="${x}" y2="${y + 46}" stroke="#2a2a33" stroke-width="3"/>
      <path d="M${x - 12} ${y - 14} h24" stroke="#2a2a33" stroke-width="3"/>
      <path d="M${x + 12} ${y - 14} v6" stroke="#2a2a33" stroke-width="1.6"/>
      <g transform="translate(${x + 12} ${y - 8})">
        <path d="M-6 0 h12 l2 4 v14 l-2 3 h-12 l-2 -3 v-14z" fill="${r > 0 ? "rgba(255,214,140,.25)" : "rgba(30,34,48,.6)"}" stroke="#3b3b46" stroke-width="1.4"/>
        ${r > 0 ? `<path class="st-flame" d="M0 6 q4 5 0 10 q-4 -5 0 -10z" fill="#ffcf6e"/>` : ""}
      </g>
      ${pips}
    </g>`;
  }
  function sceneSVG(sceneKey, opts = {}) {
    const pal = PALETTE[sceneKey] || PALETTE.prologue;
    const R = rng(sceneKey);
    const total = opts.total == null ? 5 : opts.total;
    const nLit = opts.lit || 0;
    const ink = "rgba(8,10,18,.82)";
    const stars = Array.from({ length: pal.stars }, () =>
      `<circle cx="${(R() * 360).toFixed(1)}" cy="${(R() * 80).toFixed(1)}" r="${(R() * 0.9 + 0.3).toFixed(2)}" fill="#fff" opacity="${(R() * 0.6 + 0.3).toFixed(2)}"/>`).join("");
    const orb = pal.orb === "sun" ? `<circle cx="292" cy="54" r="18" fill="#ffe6b0" opacity=".9"/>`
      : pal.orb === "moon" ? `<circle cx="292" cy="34" r="11" fill="#e8e2cf" opacity=".85"/><circle cx="297" cy="31" r="10" fill="${pal.sky[0]}" opacity=".9"/>` : "";
    let body;
    if (sceneKey === "prologue" || sceneKey === "epilogue") {
      // Six lanterns along a winding path — the whole valley at once.
      const keys = ["dogs", "spiders", "snakes", "heights", "dark", "enclosed"];
      const pts = [[40, 100], [92, 86], [146, 98], [200, 82], [254, 96], [308, 84]];
      body = `<path d="M0 140 C60 118, 90 132, 140 116 S240 108, 360 100" stroke="rgba(255,236,200,.16)" stroke-width="4" fill="none" stroke-dasharray="2 8" stroke-linecap="round"/>` +
        pts.map(([x, y], i) => {
          const on = opts.litRealms ? opts.litRealms.includes(keys[i]) : sceneKey === "epilogue";
          return `<g transform="translate(${x} ${y}) scale(.5)">${lanternSVG(0, 0, on ? 5 : 0, 5, false, true)}</g>`;
        }).join("");
    } else {
      body = motifSVG(sceneKey, nLit >= total, ink) + lanternSVG(250, 70, nLit, total, !!opts.ignite);
    }
    return `<svg viewBox="0 0 360 160" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="stSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.sky[0]}"/><stop offset="1" stop-color="${pal.sky[1]}"/></linearGradient>
        <radialGradient id="stGlow"><stop offset="0" stop-color="#ffd68a" stop-opacity=".85"/><stop offset=".45" stop-color="#ffb347" stop-opacity=".28"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="360" height="160" fill="url(#stSky)"/>
      ${stars}${orb}
      <path d="M0 110 C50 92, 90 104, 140 94 S240 86, 360 98 V160 H0z" fill="${pal.far}"/>
      <path d="M0 132 C70 118, 120 136, 190 124 S300 118, 360 128 V160 H0z" fill="${pal.near}"/>
      ${body}
    </svg>`;
  }
  // A portrait starts as the flat avatar (instant, no WebGL) and is swapped
  // for a render of the cast member's 3D figure — the same builder the scenes
  // use — once ShellScenes has baked it (upgradeFaces). Baked faces are kept
  // for the session, so later pages get the picture straight away.
  const _faceURL = {};
  function lookOf(who) {
    const c = CAST[who];
    if (!c || !c.look || !window.Character) return null;
    return Object.assign(window.Character.defaultCharacter(), c.look);
  }
  function portrait(who, size = 52) {
    const c = CAST[who];
    if (!c || !c.look || !window.Character || !window.Character.avatarSVG) {
      return `<span class="st-lamp" style="width:${size}px;height:${size}px" aria-hidden="true">🏮</span>`;
    }
    if (_faceURL[who]) return `<img class="cast-face" src="${_faceURL[who]}" width="${size}" height="${size}" alt="">`;
    try { return `<span class="cast-face" data-face="${who}" data-size="${size}">${window.Character.avatarSVG(lookOf(who), size)}</span>`; }
    catch { return `<span class="st-lamp" aria-hidden="true">🏮</span>`; }
  }
  function upgradeFaces(root) {
    const els = root ? [...root.querySelectorAll("span.cast-face[data-face]")] : [];
    if (!els.length) return;
    const run = () => els.forEach((el) => {
      const who = el.dataset.face, look = lookOf(who);
      if (!look || typeof window.charHexes !== "function" || !window.ShellScenes || !window.ShellScenes.portrait) return;
      window.ShellScenes.portrait(window.charHexes(look), 160).then((url) => {
        if (!url) return;
        _faceURL[who] = url;
        if (!el.isConnected) return;
        const size = +el.dataset.size || 52;
        const img = new Image(size, size);
        img.className = "cast-face baked";
        img.alt = "";
        img.src = url;
        el.replaceWith(img);
      }).catch(() => {});
    });
    if (window.ShellScenes && window.ShellScenes.ready) run();
    else window.addEventListener("scene3d-ready", run, { once: true });
  }

  // ---------------------------------------------------------------------------
  // Chapter labels
  // ---------------------------------------------------------------------------
  const FA_ORD = ["", "یکم", "دوم", "سوم", "چهارم", "پنجم", "ششم"];
  const ROM = ["", "I", "II", "III", "IV", "V", "VI"];
  function chapterLabel(ch) {
    if (!ch.n) return L(ch.title);
    return lang() === "fa" ? `فصلِ ${FA_ORD[ch.n] || ch.n} · ${L(ch.title)}` : `Chapter ${ROM[ch.n] || ch.n} · ${L(ch.title)}`;
  }
  function chapterShort(ch) {
    if (!ch.n) return L(ch.title);
    return lang() === "fa" ? `فصلِ ${FA_ORD[ch.n] || ch.n}` : `Chapter ${ROM[ch.n] || ch.n}`;
  }

  // ---------------------------------------------------------------------------
  // The page player: a full-screen overlay, one panel at a time, tap to turn.
  // Skipping counts as read (every page can be re-read from the book), so a
  // player in a hurry is never nagged twice.
  // ---------------------------------------------------------------------------
  let _open = null;
  function play(id, opts = {}) {
    const e = BEATS[id];
    const done = typeof opts.onDone === "function" ? opts.onDone : () => {};
    if (!e) { done(); return; }
    if (_open) { try { _open.close(true); } catch {} }
    const { beat, chapter } = e;
    const panels = beat.panels;
    const lesson = LESSONS[beat.lesson];
    const sceneKey = chapter.realm || chapter.id;
    const total = chapter.realm ? levelsOf(chapter.realm) : 5;
    // The lantern as it stood at this point in the story — dark on the
    // chapter's opening page, one flame per trial behind the page, and the
    // closing page lights the last one on screen. (Re-reading an opening
    // from a finished realm used to show it blazing while the narrator said
    // it went out years ago.)
    const am = /\.a(\d)$/.exec(beat.id);
    const lit = !chapter.realm ? 0 : beat.closes ? total : am ? Math.min(total, +am[1] + 1) : 0;
    const litRealms = storyRealms().filter(realmLit);
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const prevFocus = document.activeElement;

    const ov = document.createElement("div");
    ov.className = `story-ov st-${sceneKey}`;
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.setAttribute("aria-label", `${L(chapter.title)} — ${L(beat.title)}`);
    ov.innerHTML = `
      <div class="st-scene">${sceneSVG(sceneKey, { lit: beat.closes ? total - 1 : lit, total, litRealms })}</div>
      <div class="st-top">
        <span class="st-chapter">${esc(chapterLabel(chapter))}</span>
        <button type="button" class="st-skip">${T("st.skip", "Skip")}</button>
      </div>
      <div class="st-card">
        <div class="st-page-title">${esc(L(beat.title))}</div>
        <div class="st-body" aria-live="polite"></div>
        <div class="st-foot">
          <div class="st-dots" aria-hidden="true">${Array.from({ length: panels.length + 1 }, () => "<i></i>").join("")}</div>
          <button type="button" class="st-back" aria-label="${T("st.back", "Back")}">‹</button>
          <button type="button" class="st-next btn-primary">${T("st.next", "Next")}</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
    document.body.classList.add("story-open");
    // A tall phone would slice the scene down to a sliver; there it fits the
    // width instead and the sky (and the ground) carry on past its edges.
    const scene = ov.querySelector(".st-scene");
    const pal = PALETTE[sceneKey] || PALETTE.prologue;
    scene.style.backgroundColor = pal.sky[0];
    // On a tall screen the sky runs on above the picture; give a night sky
    // its stars there too (a few CSS dots — no extra drawing per frame).
    if (pal.stars > 10) {
      const R2 = rng(sceneKey + "*");
      scene.style.backgroundImage = Array.from({ length: 34 }, () =>
        `radial-gradient(${(R2() * 1.2 + 0.6).toFixed(1)}px ${(R2() * 1.2 + 0.6).toFixed(1)}px at ${(R2() * 100).toFixed(1)}% ${(R2() * 70).toFixed(1)}%, rgba(255,255,255,${(R2() * 0.5 + 0.3).toFixed(2)}), transparent)`).join(",");
    }
    const fit = () => {
      const svg = scene.querySelector("svg");
      if (!svg || !scene.clientHeight) return;
      const portrait = scene.clientWidth / scene.clientHeight < 1.9;
      svg.setAttribute("preserveAspectRatio", portrait ? "xMidYMax meet" : "xMidYMax slice");
    };
    fit();
    window.addEventListener("resize", fit);
    const body = ov.querySelector(".st-body");
    const nextBtn = ov.querySelector(".st-next");
    const backBtn = ov.querySelector(".st-back");
    const dots = [...ov.querySelectorAll(".st-dots i")];
    let i = 0, closed = false;
    try { if (window.PhobiaAudio) window.PhobiaAudio.ui("whoosh", 0.6); } catch {}

    function show() {
      dots.forEach((d, n) => d.classList.toggle("on", n <= i));
      backBtn.hidden = i === 0;
      if (i < panels.length) {
        const p = panels[i];
        const c = CAST[p.who] || CAST.narrator;
        const isNarr = p.who === "narrator";
        body.innerHTML = `
          <div class="st-panel ${isNarr ? "narr" : "say"}">
            ${isNarr ? "" : `<div class="st-who"><span class="st-portrait">${portrait(p.who, 64)}</span><span><b>${esc(L(c.name))}</b>${c.role ? `<small>${esc(L(c.role))}</small>` : ""}</span></div>`}
            <p class="st-text">${esc(L(p.text))}</p>
          </div>`;
        nextBtn.textContent = T("st.next", "Next");
        // The closing page's first line is the lantern catching.
        if (beat.closes && i === 0) {
          const sc = ov.querySelector(".st-scene");
          setTimeout(() => { if (!closed && sc) { sc.innerHTML = sceneSVG(sceneKey, { lit: total, total, ignite: true }); fit(); try { window.PhobiaAudio && window.PhobiaAudio.ui("spark"); } catch {} } }, reduce ? 0 : 500);
        }
      } else {
        // The lesson card: what this page was about, and what comes next.
        body.innerHTML = `
          <div class="st-panel lesson">
            ${lesson ? `<div class="st-lesson ${lesson.kind}">
              <span class="st-lesson-kind">${lesson.kind === "why" ? T("st.kindWhy", "Why fears start and stay") : T("st.kindWay", "How fears unwind")}</span>
              <strong><span aria-hidden="true">${lesson.icon}</span> ${esc(L(lesson.title))}</strong>
              <p>${esc(L(lesson.body))}</p>
            </div>` : ""}
            ${beat.next ? `<p class="st-nextline">${esc(L(beat.next))}</p>` : ""}
          </div>`;
        nextBtn.textContent = opts.cta || T("st.continue", "Continue");
        try { if (window.PhobiaAudio) window.PhobiaAudio.ui("spark", 0.7); } catch {}
      }
      upgradeFaces(body);
      body.classList.remove("in"); void body.offsetWidth; body.classList.add("in");
      try { nextBtn.focus({ preventScroll: true }); } catch {}
    }
    function close(silent) {
      if (closed) return;
      closed = true;
      markSeen(id);
      _open = null;
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", fit);
      document.body.classList.remove("story-open");
      ov.classList.add("out");
      setTimeout(() => ov.remove(), reduce ? 0 : 220);
      try { if (prevFocus && prevFocus.isConnected && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch {}
      if (!silent) done();
    }
    function next() { if (i < panels.length) { i++; show(); } else close(); }
    function back() { if (i > 0) { i--; show(); } }
    function onKey(ev) {
      if (closed) return;
      const rtl = document.documentElement.dir === "rtl";
      if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); close(); }
      else if (ev.key === "Enter" || ev.key === " " || ev.key === (rtl ? "ArrowLeft" : "ArrowRight")) {
        if (ev.target && ev.target.closest && ev.target.closest("button") && ev.key !== (rtl ? "ArrowLeft" : "ArrowRight")) return;  // a focused button handles itself
        ev.preventDefault(); next();
      }
      else if (ev.key === (rtl ? "ArrowRight" : "ArrowLeft")) { ev.preventDefault(); back(); }
    }
    nextBtn.addEventListener("click", (ev) => { ev.stopPropagation(); next(); });
    backBtn.addEventListener("click", (ev) => { ev.stopPropagation(); back(); });
    ov.querySelector(".st-skip").addEventListener("click", (ev) => { ev.stopPropagation(); close(); });
    // Tap anywhere on the scene or the text to turn the page.
    ov.addEventListener("click", (ev) => { if (!ev.target.closest("button") && i < panels.length) next(); });
    document.addEventListener("keydown", onKey, true);
    _open = { close };
    show();
  }

  // ---------------------------------------------------------------------------
  // Inline pieces the app places on its own pages
  // ---------------------------------------------------------------------------
  // A page waiting to be read (complete screen, camp, title screen).
  function cardHTML(id, opts = {}) {
    const e = BEATS[id];
    if (!e) return "";
    const { beat, chapter } = e;
    const first = beat.panels.find((p) => p.who !== "narrator") || beat.panels[0];
    const who = first.who !== "narrator" ? first.who : (chapter.resident || "mira");
    const quote = L(first.text);
    const short = quote.length > 120 ? quote.slice(0, 117).replace(/\s+\S*$/, "") + "…" : quote;
    const kicker = opts.kicker || (beat.closes ? T("st.cardLit", "🏮 The lantern is lit — the chapter's last page")
      : TF("st.cardNew", "📖 A new page · {ch}", { ch: chapterShort(chapter) }));
    return `
      <div class="story-card${beat.closes ? " closes" : ""}" data-beat="${esc(id)}">
        <span class="sc-portrait" aria-hidden="true">${portrait(who, 54)}</span>
        <div class="sc-body">
          <span class="sc-kicker">${kicker}</span>
          <strong class="sc-title">${esc(L(beat.title))}</strong>
          <p class="sc-quote">${lang() === "fa" ? `«${esc(short)}»` : `“${esc(short)}”`}</p>
        </div>
        <button type="button" class="btn-primary sc-read" data-action="story-play" data-beat="${esc(id)}">${opts.cta || T("st.read", "Read the page")}</button>
      </div>`;
  }
  // The story's beat on a trial's gate page, as one card instead of a
  // slideshow in front of it. A realm's first trial: the resident in their
  // own words, and Mira's promise. On the way up the ladder: the page the
  // last trial turned, if it's still unread. Either way the whole page is
  // one tap away — reading it is a choice, not a toll on the way in.
  function gateHTML(k, lvl) {
    let id = null;
    try { id = pendingBefore(k, lvl); } catch {}
    const ch = chapterOfRealm(k);
    if (!id || !ch || !BEATS[id]) return "";
    const b = BEATS[id].beat;
    if (!id.endsWith(".open")) return cardHTML(id, { kicker: TF("st.gatePrev", "📖 Before you go in · {ch}", { ch: chapterShort(ch) }) });
    const res = b.panels.find((p) => p.who === ch.resident) || b.panels.find((p) => p.who !== "narrator") || b.panels[0];
    const who = res.who !== "narrator" ? res.who : (ch.resident || "mira");
    const q = L(res.text);
    const c = CAST[who] || {};
    return `
      <div class="gate-story">
        <span class="gs-kicker">${esc(chapterLabel(ch))}</span>
        <div class="gs-row">
          <span class="gs-face" aria-hidden="true">${portrait(who, 56)}</span>
          <div class="gs-body">
            <p class="gs-quote">${lang() === "fa" ? `«${esc(q)}»` : `“${esc(q)}”`}</p>
            <span class="gs-who">— ${esc(L(c.name))}${c.role ? `, ${esc(L(c.role))}` : ""}</span>
          </div>
        </div>
        <p class="gs-mira"><span class="gs-mface" aria-hidden="true">${portrait("mira", 28)}</span><span>${esc(T("st.gateMira", "Let's light this lantern together — one small step at a time. I'll be right beside you."))}</span></p>
        <button type="button" class="linklike gs-read" data-action="story-play" data-beat="${esc(id)}">${T("st.readWhole", "Read the whole page")}</button>
      </div>`;
  }
  // Six lanterns in a row, each with its five flames.
  function lanternsHTML(opts = {}) {
    const rows = REALM_CHAPTERS.filter((c) => { try { return PHOBIAS[c.realm] && isOpenRealm(c.realm); } catch { return false; } }).map((c) => {
      const k = c.realm, n = levelsOf(k), f = flames(k), lit = f >= n;
      const nm = (() => { try { return realmOf(k).realmName; } catch { return k; } })();
      return `<li class="ln ${lit ? "lit" : f ? "part" : ""} ${opts.current === k ? "cur" : ""}" title="${esc(nm)} — ${f}/${n}">
        <span class="ln-lamp" aria-hidden="true"><i style="--f:${(f / n).toFixed(2)}"></i></span>
        <span class="ln-flames" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<b class="${i < f ? "on" : ""}"></b>`).join("")}</span>
        ${opts.names ? `<span class="ln-name">${esc(nm)}</span>` : ""}
        <span class="st-sr">${esc(TF("st.lanternAria", "{realm}: {n} of {m} flames", { realm: nm, n: f, m: n }))}</span>
      </li>`;
    }).join("");
    return `<ol class="lanterns${opts.big ? " big" : ""}">${rows}</ol>`;
  }
  // "Today's practice" — the idea the next page will name, shown before the
  // trial so it's something you do, not just something you read.
  function focusHTML(k, i) {
    const f = focusFor(k, i);
    if (!f) return "";
    return `<div class="st-focus">
      <span class="st-focus-k">${T("st.focusK", "🎯 Today's practice")}</span>
      <p>${esc(f.text)}</p>
      <small>${esc(TF("st.focusWhy", "Finish this trial to turn the next page of the story: “{t}”", { t: f.page }))}</small>
    </div>`;
  }
  function recapLine() {
    const id = lastRead();
    return id ? L(BEATS[id].beat.recap) : "";
  }

  // A short note from Mira the first time a returning traveler opens the game
  // on a new day: what they did last time, in numbers they produced, and why
  // coming back today is part of the method (spacing, sleep, return of fear).
  function morningNote() {
    try {
      const log = (state && state.log) || [];
      if (!log.length) return null;
      const last = log[log.length - 1];
      const now = new Date(); now.setHours(0, 0, 0, 0);
      const then = new Date(last.ts); then.setHours(0, 0, 0, 0);
      const days = Math.round((now - then) / 864e5);
      if (days < 1) return null;
      const realm = (() => { try { return realmOf(last.phobia).realmName; } catch { return ""; } })();
      const trial = (() => { try { return lvTitle(last.phobia, last.level); } catch { return ""; } })();
      const lines = [];
      if (last.finished === false) {
        lines.push(TF("st.noteEarly", "Last time you stepped out of “{trial}” early. That's allowed — and today is a fresh try.", { trial }));
      } else if (typeof last.peak === "number" && typeof last.suds === "number" && last.peak > last.suds) {
        lines.push(TF("st.noteDrop", "Last time, in {realm}, your alarm peaked at {peak}/10 and you stayed until it came down to {now}/10.", { realm, peak: last.peak, now: last.suds }));
      } else {
        lines.push(TF("st.noteDid", "Last time you faced “{trial}” in {realm}.", { trial, realm }));
      }
      if (typeof last.predicted === "number" && typeof last.peak === "number" && last.predicted - last.peak >= 2) {
        lines.push(TF("st.noteGuess", "You'd guessed {p}. Fear guessed high — it usually does.", { p: last.predicted }));
      }
      if (days === 1) lines.push(T("st.noteSleep", "Sleep has had a night to settle that learning. One short trial today makes it stronger."));
      else if (days < 7) lines.push(T("st.noteSpaced", "A few days have passed. Spacing practice out like this protects against fear creeping back."));
      else lines.push(TF("st.noteBreak", "It's been {n} days. If the fear feels louder, that's normal after a break — one step back on the ladder brings it down faster than the first time.", { n: days }));
      return { days, lines };
    } catch { return null; }
  }
  // Shown on the first visit of a calendar day — and kept for the rest of
  // that page load, so a re-render (a language switch) doesn't eat it.
  const NOTE_KEY = "fobia.story.noteDay";
  let _noteThisLoad = null;
  function morningNoteHTML() {
    if (_noteThisLoad != null) return _noteThisLoad;
    const n = morningNote();
    if (!n) return "";
    const today = new Date().toDateString();
    try { if (localStorage.getItem(NOTE_KEY) === today) return ""; localStorage.setItem(NOTE_KEY, today); } catch {}
    return (_noteThisLoad = `<div class="mira-note">
      <span class="mn-portrait" aria-hidden="true">${portrait("mira", 40)}</span>
      <div><span class="mn-k">${T("st.noteK", "✉ A note from Mira")}</span>
      <p>${n.lines.map(esc).join(" ")}</p><span class="mn-sig">— ${esc(L(CAST.mira.name))}</span></div>
    </div>`);
  }

  // ---------------------------------------------------------------------------
  // The Story Book (#/story, and #/journal for the Sparks tab)
  // ---------------------------------------------------------------------------
  function viewBook(opts = {}) {
    const tab = opts.tab || "chapters";
    const seen = slice().seen;
    const learned = new Set(lessonsLearned());
    const cur = (() => { try { return currentRealmKey(); } catch { return null; } })();
    const waiting = nextUnread(cur);

    const pageRow = (id, lockMsg) => {
      const e = BEATS[id], b = e.beat, un = isUnlocked(id), rd = !!seen[id];
      const les = LESSONS[b.lesson];
      return `<li class="sb-page ${rd ? "read" : un ? "new" : "locked"}">
        <span class="sb-mark" aria-hidden="true">${rd ? "✓" : un ? "✦" : "🔒"}</span>
        <div class="sb-page-body">
          <strong>${un ? esc(L(b.title)) : T("st.mist", "A page still in the mist")}</strong>
          <small>${un && les ? `${les.icon} ${esc(L(les.title))}` : esc(lockMsg)}</small>
        </div>
        ${un ? `<button type="button" class="${rd ? "btn-ghost" : "btn-primary"} sb-play" data-action="story-play" data-beat="${esc(id)}">${rd ? T("st.reread", "Read again") : T("st.readNow", "Read")}</button>` : ""}
      </li>`;
    };
    const chapterBlock = (ch) => {
      const k = ch.realm;
      const open = !k || isOpenRealm(k);
      if (!open) return "";
      const head = k ? `<span class="sb-portrait" aria-hidden="true">${portrait(ch.resident, 56)}</span>` : `<span class="sb-portrait lamp" aria-hidden="true">🏮</span>`;
      const realmName = k ? (() => { try { return realmOf(k).realmName; } catch { return ""; } })() : "";
      const pages = ch.beats.map((b) => {
        let lock = "";
        if (ch.kind === "epilogue") lock = T("st.lockEpi", "Opens when all six lanterns are lit");
        else if (b.id.endsWith(".open")) lock = T("st.lockOpen", "Opens when you begin this realm");
        else if (b.closes) lock = TF("st.lockTrial", "Unlocks after trial {n}", { n: levelsOf(k) });
        else { const m = /\.a(\d)$/.exec(b.id); lock = TF("st.lockTrial", "Unlocks after trial {n}", { n: m ? +m[1] + 1 : 1 }); }
        return pageRow(b.id, lock);
      }).join("");
      const lit = k ? realmLit(k) : false;
      return `<section class="sb-chapter ${lit ? "lit" : ""}">
        <header>${head}<div>${k ? `<span class="sb-ch-k">${esc(chapterShort(ch))}${realmName ? ` · ${esc(realmName)}` : ""}</span>` : ""}
          <h3>${esc(L(ch.title))}</h3>
          ${k ? `<span class="sb-flames">${Array.from({ length: levelsOf(k) }, (_, i) => `<b class="${i < flames(k) ? "on" : ""}"></b>`).join("")}</span>` : ""}
        </div></header>
        <ol class="sb-pages">${pages}</ol>
      </section>`;
    };

    const lessonList = (kind) => {
      const all = Object.keys(LESSONS).filter((id) => LESSONS[id].kind === kind);
      const have = all.filter((id) => learned.has(id));
      return `<div class="sb-lessons ${kind}">
        <h3>${kind === "why" ? T("st.kindWhy", "Why fears start and stay") : T("st.kindWay", "How fears unwind")}
          <small>${TF("st.haveOf", "{a} of {b}", { a: have.length, b: all.length })}</small></h3>
        <ul>${have.map((id) => { const l = LESSONS[id]; return `<li><span aria-hidden="true">${l.icon}</span><div><strong>${esc(L(l.title))}</strong><p>${esc(L(l.body))}</p></div></li>`; }).join("")}</ul>
        ${all.length > have.length ? `<p class="sb-more">${TF("st.moreToFind", "{n} more to discover — each new page of the story adds one.", { n: all.length - have.length })}</p>` : ""}
      </div>`;
    };

    const tabs = [["chapters", T("st.tabStory", "📖 The story")], ["learned", T("st.tabLearned", "🧠 What you've learned")], ["sparks", T("st.tabSparks", "✦ Sparks")]];
    const sparks = typeof opts.sparksHTML === "string" ? opts.sparksHTML : "";
    return `
    <div class="panel story-book" id="storyBook">
      <span class="badge">${T("st.badge", "The story")}</span>
      <h2 style="margin-top:10px">${T("st.bookH", "The Lanterns of the Valley")}</h2>
      <p class="sb-lede">${T("st.bookP", "A story told one trial at a time. Every page carries one idea from the psychology of fear — why fears start, and how they unwind — and every finished trial turns a page.")}</p>
      ${lanternsHTML({ names: true, big: true, current: cur })}
      ${waiting ? `<div class="sb-waiting">${cardHTML(waiting)}</div>` : ""}
      <div class="sb-continue">
        <button class="btn-primary" data-action="story-continue">${T("st.continueTrial", "Continue the journey →")}</button>
        <span class="sb-count">${TF("st.pagesRead", "{a} of {b} pages read", { a: pagesRead(), b: ORDER.length })}</span>
      </div>
      <div class="sb-tabs" role="tablist">${tabs.map(([id, label]) => `<button type="button" role="tab" class="sb-tab" data-sbtab="${id}" aria-selected="${id === tab}">${label}</button>`).join("")}</div>
      <div class="sb-tabpanel" data-sbpanel="chapters" ${tab === "chapters" ? "" : "hidden"}>
        ${CHAPTERS.map(chapterBlock).join("")}
      </div>
      <div class="sb-tabpanel" data-sbpanel="learned" ${tab === "learned" ? "" : "hidden"}>
        <div class="sb-whatis">
          <strong>${T("st.whatIsH", "What is a phobia?")}</strong>
          <p>${T("st.whatIsP", "A specific phobia is a fear of one particular thing or situation that is far stronger than the real danger, lasts for months, and makes you avoid it or get through it with intense distress. It's one of the most common anxiety problems — and one of the most treatable. Each page of this story carries one piece of how it works.")}</p>
        </div>
        <div class="sb-lessons-grid">${lessonList("why")}${lessonList("way")}</div>
      </div>
      <div class="sb-tabpanel" data-sbpanel="sparks" ${tab === "sparks" ? "" : "hidden"}>${sparks}</div>
    </div>`;
  }
  function mountBook() {
    const root = document.getElementById("storyBook");
    if (!root) return;
    root.querySelectorAll(".sb-tab").forEach((btn) => btn.addEventListener("click", () => {
      const id = btn.dataset.sbtab;
      root.querySelectorAll(".sb-tab").forEach((b) => b.setAttribute("aria-selected", String(b === btn)));
      root.querySelectorAll(".sb-tabpanel").forEach((p) => { p.hidden = p.dataset.sbpanel !== id; });
      try { btn.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {}
    }));
    // On a narrow phone (and in Persian, where the row starts at the right)
    // the open tab could begin scrolled out of view.
    const on = root.querySelector('.sb-tab[aria-selected="true"]');
    if (on) { try { on.scrollIntoView({ block: "nearest", inline: "nearest" }); } catch {} }
  }


  // ---------------------------------------------------------------------------
  // Styles. The page player is always a dark, lit-from-within scene (like the
  // 3D stage); the inline pieces follow the app's theme tokens.
  // ---------------------------------------------------------------------------
  const CSS = `
  .story-ov { position: fixed; inset: 0; z-index: 10050; display: flex; flex-direction: column; background: #070a14; color: #eef2fb;
    animation: stIn .28s ease-out; overscroll-behavior: contain; -webkit-tap-highlight-color: transparent; cursor: pointer; }
  .story-ov.out { opacity: 0; transition: opacity .2s ease; }
  @keyframes stIn { from { opacity: 0; } to { opacity: 1; } }
  .st-scene { position: relative; flex: 1 1 auto; min-height: 26vh; overflow: hidden; }
  .st-scene svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .st-scene::after { content: ""; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(to bottom, rgba(7,10,20,.55) 0%, rgba(7,10,20,0) 28%, rgba(7,10,20,0) 72%, rgba(7,10,20,.92) 100%); }
  .st-top { position: absolute; top: calc(10px + env(safe-area-inset-top, 0px)); left: 14px; right: 14px; z-index: 2;
    display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .st-chapter { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; opacity: .9; text-shadow: 0 1px 4px rgba(0,0,0,.7); }
  html[dir="rtl"] .st-chapter { letter-spacing: 0; text-transform: none; font-size: 13px; }
  .st-skip { min-height: 36px; padding: 6px 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.22); background: rgba(10,14,26,.55);
    color: #eef2fb; font: inherit; font-size: 13px; cursor: pointer; }
  .st-card { position: relative; width: min(680px, 100%); margin: 0 auto; cursor: default;
    padding: 18px 20px calc(16px + env(safe-area-inset-bottom, 0px));
    background: linear-gradient(to bottom, rgba(16,22,40,.97), rgba(10,14,28,.99));
    border: 1px solid rgba(255,255,255,.08); border-bottom: none; border-radius: 22px 22px 0 0; box-shadow: 0 -20px 60px rgba(0,0,0,.5); }
  @media (min-width: 720px) { .st-card { margin-bottom: 4vh; border-radius: 22px; border-bottom: 1px solid rgba(255,255,255,.08); } }
  .st-page-title { font-size: 12px; opacity: .6; margin-bottom: 10px; letter-spacing: .04em; }
  .st-body { min-height: 150px; }
  .st-body.in .st-panel { animation: stPanel .38s cubic-bezier(.22,1,.36,1); }
  @keyframes stPanel { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .st-who { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .st-portrait, .sc-portrait, .sb-portrait, .mn-portrait { border-radius: 50%; overflow: hidden; background: rgba(255,255,255,.07);
    flex: 0 0 auto; display: grid; place-items: center; }
  .st-portrait svg, .sc-portrait svg, .sb-portrait svg, .mn-portrait svg { display: block; }
  .st-portrait { width: 64px; height: 64px; box-shadow: 0 0 0 2px rgba(255, 214, 140, .35), 0 6px 18px rgba(0,0,0,.4); }
  .cast-face { display: block; width: 100%; height: 100%; }
  img.cast-face { object-fit: cover; background: radial-gradient(circle at 50% 30%, #4a4360 0%, #1a2036 70%); }
  img.cast-face.baked { animation: castIn .35s ease; }
  @keyframes castIn { from { opacity: .2; } to { opacity: 1; } }
  .st-who b { display: block; font-size: 15px; }
  .st-who small { display: block; font-size: 12px; opacity: .65; }
  .st-text { font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif; font-size: 18px; line-height: 1.6; margin: 0; }
  html[dir="rtl"] .st-text { font-family: inherit; font-size: 17px; line-height: 1.95; }
  .st-panel.narr .st-text { font-style: italic; color: #f3e6c8; }
  html[dir="rtl"] .st-panel.narr .st-text { font-style: normal; }
  .st-lesson { border-radius: 14px; padding: 12px 14px; background: rgba(124,209,197,.09); border: 1px solid rgba(124,209,197,.32); }
  .st-lesson.why { background: rgba(165,180,252,.09); border-color: rgba(165,180,252,.34); }
  .st-lesson-kind { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; opacity: .75; margin-bottom: 4px; }
  html[dir="rtl"] .st-lesson-kind { letter-spacing: 0; font-size: 12px; }
  .st-lesson strong { display: block; font-size: 16px; margin-bottom: 4px; }
  .st-lesson p { margin: 0; font-size: 14.5px; line-height: 1.55; opacity: .92; }
  .st-nextline { margin: 12px 0 0; font-size: 14px; opacity: .78; }
  .st-foot { display: flex; align-items: center; gap: 10px; margin-top: 14px; }
  .st-dots { display: flex; gap: 6px; flex: 1; }
  .st-dots i { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,.2); }
  .st-dots i.on { background: #ffcf6e; }
  .st-back { min-width: 44px; min-height: 44px; border-radius: 12px; border: 1px solid rgba(255,255,255,.14); background: transparent;
    color: inherit; font-size: 22px; line-height: 1; cursor: pointer; }
  html[dir="rtl"] .st-back { transform: scaleX(-1); }
  .st-next { min-height: 44px; padding: 10px 22px; }
  body.story-open { overflow: hidden; }
  .st-lamp { display: grid; place-items: center; font-size: 26px; }
  .st-lantern .st-flame { animation: stFlicker 2.4s ease-in-out infinite; }
  .st-lantern.ignite .st-glow { animation: stIgnite 1.6s ease-out; }
  @keyframes stFlicker { 0%, 100% { opacity: 1; } 45% { opacity: .78; } 60% { opacity: .95; } }
  @keyframes stIgnite { from { opacity: 0; } }

  .story-card { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 14px; margin: 14px 0;
    border-radius: 16px; text-align: start; background: linear-gradient(135deg, rgba(255,207,110,.10), rgba(165,180,252,.07));
    border: 1px solid rgba(255,207,110,.36); }
  .story-card.closes { border-color: rgba(255,207,110,.75); box-shadow: 0 0 34px rgba(255,190,90,.16); }
  .story-card.read { opacity: .8; border-style: dashed; }
  .sc-portrait { width: 54px; height: 54px; }
  .sc-kicker { display: block; font-size: 12px; color: var(--star, #fcd34d); font-weight: 700; margin-bottom: 2px; }
  .sc-title { display: block; font-size: 16px; }
  .sc-quote { margin: 4px 0 0; font-size: 13.5px; opacity: .8; font-style: italic; line-height: 1.45; }
  html[dir="rtl"] .sc-quote { font-style: normal; }
  .sc-read { white-space: nowrap; }
  @media (max-width: 560px) { .story-card { grid-template-columns: auto 1fr; } .sc-read { grid-column: 1 / -1; width: 100%; } }

  .lanterns { list-style: none; display: flex; justify-content: center; gap: 10px; padding: 0; margin: 10px 0; flex-wrap: wrap; }
  .ln { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 34px; }
  .ln-lamp { position: relative; width: 22px; height: 30px; border-radius: 6px 6px 8px 8px; border: 2px solid rgba(255,255,255,.25);
    background: rgba(20,24,40,.6); }
  .ln-lamp i { position: absolute; inset: 3px; border-radius: 4px; opacity: calc(.08 + var(--f) * .92);
    background: radial-gradient(circle at 50% 62%, #ffe2a3, #ff9f3a 58%, transparent 76%); }
  .ln.lit .ln-lamp { border-color: #ffcf6e; box-shadow: 0 0 16px rgba(255,190,90,.55); }
  .ln.cur .ln-lamp { outline: 2px solid var(--accent, #7cd1c5); outline-offset: 2px; }
  .ln-flames { display: flex; gap: 2px; }
  .ln-flames b { width: 4px; height: 4px; border-radius: 50%; background: rgba(255,255,255,.2); }
  .ln-flames b.on { background: #ffcf6e; }
  .ln-name { font-size: 10.5px; opacity: .72; max-width: 76px; text-align: center; line-height: 1.2; }
  .lanterns.big { gap: 14px; }
  .lanterns.big .ln-lamp { width: 28px; height: 38px; }
  body.light-mode .ln-lamp { background: #2a3048; }
  .st-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .st-focus { border-inline-start: 3px solid var(--star, #fcd34d); padding: 10px 12px; margin: 12px 0; border-radius: 0 12px 12px 0;
    background: rgba(252,211,77,.07); text-align: start; }
  html[dir="rtl"] .st-focus { border-radius: 12px 0 0 12px; }
  .st-focus-k { font-size: 12px; font-weight: 700; color: var(--star, #fcd34d); }
  .st-focus p { margin: 4px 0 2px; font-size: 15px; line-height: 1.45; }
  .st-focus small { display: block; opacity: .68; font-size: 12px; }

  .mira-note { display: flex; gap: 10px; align-items: flex-start; padding: 12px; margin: 0 0 12px; border-radius: 14px; text-align: start;
    background: rgba(255,248,230,.06); border: 1px dashed rgba(255,207,110,.42); }
  .mn-portrait { width: 40px; height: 40px; }
  .mn-k { font-size: 12px; font-weight: 700; color: #ffcf6e; }
  .mira-note p { margin: 4px 0 2px !important; font-size: 13.5px !important; line-height: 1.5; opacity: .92 !important; }
  .mn-sig { font-size: 12px; opacity: .6; font-style: italic; }

  .story-book .sb-lede { opacity: .86; }
  .sb-waiting .story-card { margin-top: 6px; }
  .sb-continue { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin: 12px 0 16px; }
  .sb-count { font-size: 13px; opacity: .7; }
  .sb-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border, #25324f); margin: 8px 0 14px; overflow-x: auto; scrollbar-width: none; }
  .sb-tab { padding: 10px 14px; min-height: 44px; border: none; background: none; color: var(--muted, #94a3b8); font: inherit; font-weight: 650;
    cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
  .sb-tab[aria-selected="true"] { color: var(--text, #e8eef7); border-bottom-color: var(--accent, #7cd1c5); }
  .sb-chapter { border: 1px solid var(--border, #25324f); border-radius: 16px; padding: 14px; margin: 0 0 12px; background: var(--panel-2, #18213a); }
  .sb-chapter.lit { border-color: rgba(255,207,110,.5); }
  .sb-chapter header { display: flex; gap: 12px; align-items: center; margin-bottom: 8px; }
  .sb-portrait { width: 56px; height: 56px; font-size: 28px; }
  .sb-ch-k { font-size: 12px; opacity: .7; }
  .sb-chapter h3 { margin: 2px 0 4px; font-size: 17px; }
  .sb-flames { display: inline-flex; gap: 3px; }
  .sb-flames b { width: 7px; height: 7px; border-radius: 50%; background: rgba(148,163,184,.3); }
  .sb-flames b.on { background: #f5b84b; }
  .sb-pages { list-style: none; margin: 0; padding: 0; }
  .sb-page { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border-2, #243049); }
  .sb-mark { width: 22px; text-align: center; opacity: .85; flex: 0 0 auto; }
  .sb-page.new .sb-mark { color: var(--star, #fcd34d); }
  .sb-page.locked { opacity: .55; }
  .sb-page-body { flex: 1; min-width: 0; }
  .sb-page-body strong { display: block; font-size: 14.5px; }
  .sb-page-body small { display: block; font-size: 12.5px; opacity: .74; }
  .sb-play { min-height: 38px; padding: 6px 12px; font-size: 13px; flex: 0 0 auto; }
  .sb-whatis { padding: 12px 14px; border-radius: 14px; background: var(--panel-2, #18213a); border: 1px solid var(--border, #25324f); margin-bottom: 14px; }
  .sb-whatis p { margin: 6px 0 0; line-height: 1.6; }
  .sb-lessons-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 720px) { .sb-lessons-grid { grid-template-columns: 1fr; } }
  .sb-lessons h3 { font-size: 16px; display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 0 0 6px; }
  .sb-lessons h3 small { font-size: 12px; opacity: .65; font-weight: 500; }
  .sb-lessons ul { list-style: none; padding: 0; margin: 0; }
  .sb-lessons li { display: flex; gap: 10px; padding: 10px 0; border-top: 1px solid var(--border-2, #243049); }
  .sb-lessons li > span { font-size: 20px; line-height: 1.2; }
  .sb-lessons li strong { font-size: 14.5px; }
  .sb-lessons li p { margin: 3px 0 0; font-size: 13.5px; line-height: 1.5; opacity: .86; }
  .sb-more { font-size: 13px; opacity: .65; font-style: italic; }
  @media (prefers-reduced-motion: reduce) {
    .story-ov, .st-body.in .st-panel, .st-lantern .st-flame, .st-lantern.ignite .st-glow { animation: none !important; }
  }`;
  try {
    const st = document.createElement("style");
    st.id = "story-css";
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  } catch {}

  // ---------------------------------------------------------------------------
  // Persian for the chrome above (the pages themselves carry their own).
  // ---------------------------------------------------------------------------
  const FA = {
    "st.skip": "رد شو", "st.back": "قبلی", "st.next": "بعدی", "st.continue": "ادامه",
    "st.kindWhy": "چرا ترس‌ها شروع می‌شوند و می‌مانند", "st.kindWay": "ترس‌ها چطور فروکش می‌کنند",
    "st.cardLit": "🏮 فانوس روشن شد — صفحهٔ آخرِ این فصل", "st.cardNew": "📖 صفحه‌ای تازه · {ch}",
    "st.read": "صفحه را بخوان", "st.readNow": "بخوان", "st.reread": "دوباره بخوان",
    "st.lanternAria": "{realm}: {n} از {m} شعله",
    "st.focusK": "🎯 تمرینِ امروز", "st.focusWhy": "این آزمون را تمام کن تا صفحهٔ بعدیِ داستان ورق بخورد: «{t}»",
    "st.noteK": "✉ یادداشتی از میرا",
    "st.noteEarly": "دفعهٔ پیش زودتر از «{trial}» بیرون آمدی. این مجاز است — و امروز فرصتی تازه است.",
    "st.noteDrop": "دفعهٔ پیش، در {realm}، زنگِ خطرت تا {peak} از ۱۰ بالا رفت و ماندی تا به {now} از ۱۰ رسید.",
    "st.noteDid": "دفعهٔ پیش با «{trial}» در {realm} رو‌به‌رو شدی.",
    "st.noteGuess": "حدس زده بودی {p}. ترس بالا حدس زد — معمولاً همین کار را می‌کند.",
    "st.noteSleep": "خواب یک شب فرصت داشته آن یادگیری را جا بیندازد. یک آزمونِ کوتاهِ امروز محکم‌ترش می‌کند.",
    "st.noteSpaced": "چند روزی گذشته. پخش کردنِ تمرین به این شکل جلوی برگشتنِ ترس را می‌گیرد.",
    "st.noteBreak": "{n} روز گذشته. اگر ترس بلندتر به نظر می‌رسد، پس از وقفه عادی است — یک پله پایین‌تر شروع کن؛ سریع‌تر از بارِ اول پایین می‌آید.",
    "st.mist": "صفحه‌ای هنوز در مه", "st.lockEpi": "وقتی هر شش فانوس روشن شوند باز می‌شود",
    "st.lockOpen": "با شروعِ این قلمرو باز می‌شود", "st.lockTrial": "پس از آزمون {n} باز می‌شود",
    "st.haveOf": "{a} از {b}", "st.moreToFind": "{n} مورد دیگر برای کشف — هر صفحهٔ تازهٔ داستان یکی اضافه می‌کند.",
    "st.tabStory": "📖 داستان", "st.tabLearned": "🧠 آن‌چه یاد گرفته‌ای", "st.tabSparks": "✦ جرقه‌ها",
    "st.badge": "داستان", "st.bookH": "فانوس‌های دره",
    "st.bookP": "داستانی که آزمون‌به‌آزمون روایت می‌شود. هر صفحه یک ایده از روان‌شناسیِ ترس با خود دارد — ترس‌ها چرا شروع می‌شوند و چطور فروکش می‌کنند — و هر آزمونِ تمام‌شده صفحه‌ای را ورق می‌زند.",
    "st.continueTrial": "ادامهٔ سفر ←", "st.pagesRead": "{a} از {b} صفحه خوانده شده",
    "st.whatIsH": "فوبیا چیست؟",
    "st.whatIsP": "فوبیای خاص ترس از یک چیز یا موقعیتِ مشخص است که بسیار بیشتر از خطرِ واقعی است، ماه‌ها ادامه پیدا می‌کند، و باعث می‌شود از آن دوری کنی یا با پریشانیِ شدید تحملش کنی. یکی از رایج‌ترین مشکلاتِ اضطرابی است — و یکی از درمان‌پذیرترین‌ها. هر صفحهٔ این داستان تکه‌ای از چگونگیِ کارکردِ آن را با خود دارد.",
  };
  try { if (window.I18n && window.I18n.registerLang) window.I18n.registerLang("fa", FA); } catch {}

  window.Story = {
    CHAPTERS, LESSONS, CAST, BEATS, ORDER,
    play, isSeen, markSeen, isUnlocked, pendingBefore, pendingAfter, nextUnread, lastRead,
    beatAfterTrial, focusFor, focusHTML, cardHTML, gateHTML, lanternsHTML, recapLine, morningNoteHTML,
    viewBook, mountBook, chapterOfRealm, chapterLabel, pagesRead, titleOf, sceneSVG, portrait, upgradeFaces,
    get isOpen() { return !!_open; },
  };
})();
