"use strict";

// ---------- Localization ----------
// Two first-class languages: English (source of truth, lives inline in the
// app as t() fallbacks) and Persian (فارسی, full pack below — the app's
// second home). API kept from the original scaffold: window.t(key, fallback),
// window.I18n.{setLang,registerLang,availableLangs,currentLanguage}.
//
// Persian is RTL: applyLang() stamps <html lang dir> so the whole layout
// mirrors via the [dir="rtl"] CSS overrides in index.html. Content-layer
// translations (realm names, fear labels, insight cards) use structured keys
// ("realm.dogs.name", "card.wave.title") resolved through the same t()
// machinery — English packs simply omit them and t() returns the English
// fallback passed at the call site. UI strings with variables use {n}-style
// tokens via window.tf(key, fallback, vars).
//
// Level titles/descriptions, per-trial whispers and bridge-step bodies remain
// English in fa mode for now (they fall back gracefully); translate them by
// adding keys — no code changes needed.

const PACKS = {
  en: {
    // English lives inline as fallbacks; this pack exists so t() has a
    // stable base and future keys can be overridden without code edits.
  },

  fa: {
    // ---- Header / HUD ----
    "hud.tag": "سفر شجاعت",
    "hud.camp": "🏕 اردوگاه",
    "hud.courage": "شجاعت — با هر آزمونی که رو‌به‌رو می‌شوی به دست می‌آید",
    "hud.sparks": "کتاب جرقه‌ها — خردی که به دست آورده‌ای",
    "nav.menu": "منو",
    "nav.sound": "صدا",
    "nav.settings": "تنظیمات",
    "nav.progress": "پیشرفت تو",
    "nav.lang": "Switch to English",

    // ---- Menu ----
    "menu.title": "صفحهٔ آغاز — داستان",
    "menu.valley": "🗺 درهٔ ترس‌ها",
    "menu.trials": "⚔ ادامهٔ آزمون‌ها",
    "menu.sparks": "✦ کتاب جرقه‌ها",
    "menu.story": "📜 داستان تو تا این‌جا",
    "menu.report": "📄 گزارش پیشرفت — چاپ / اشتراک",
    "menu.forge": "🛠 ساخت ترس دلخواه",
    "menu.editCharacter": "✎ ویرایش مسافر",
    "menu.switchCharacter": "⇄ تغییر مسافر",
    "menu.settings": "⚙ تنظیمات",
    "menu.footer": "میرا · یک بازی تمرینی، نه درمان.",
    "menu.fears": "ترس",
    "menu.sessions": "جلسه",

    // ---- First-run consent ----
    "consent.kicker": "یک دقیقه صداقت، بعد دره",
    "consent.title": "پیش از آن‌که شروع کنی",
    "consent.game": "میرا یک بازی تمرینی دربارهٔ سازوکار ترس است — برای کنجکاوی و آموزش ساخته شده. درمان نیست و جای درمانگر را نمی‌گیرد.",
    "consent.privacy": "هر کاری این‌جا می‌کنی همین‌جا می‌ماند: در همین مرورگر، روی همین دستگاه. نه حسابی، نه ردیابی، نه ارسال به هیچ سروری.",
    "consent.control": "همیشه اختیار با توست: هر صحنه را هر لحظه می‌توانی ترک کنی و کلید Esc همیشه تو را به آرامش برمی‌گرداند. بیرون رفتن هرگز شکست نیست.",
    "consent.help": "اگر ترسی زندگی‌ات را جدی محدود کرده، یک درمانگر آموزش‌دیده می‌تواند مواجههٔ واقعی را امن با تو پیش ببرد — این بازی می‌تواند شروع آن گفت‌وگو باشد.",
    "consent.crisis": "اگر همین حالا در بحران هستی، لطفاً با یک انسان واقعی تماس بگیر:",
    "consent.more": "بیشتر بخوان",
    "consent.close": "بستن",
    "consent.ok": "می‌فهمم — شروع کنیم",

    // ---- About ----
    "menu.about": "ℹ️ دربارهٔ میرا",
    "about.badge": "درباره",
    "about.title": "میرا — بازی کوچکی دربارهٔ ترس‌های بزرگ",
    "about.intro": "میرا یک بازی تمرینی رایگان دربارهٔ سازوکار ترس است. مسافری می‌سازی، وارد دره‌ای می‌شوی که شش ترس مشهور در آن زندگی می‌کنند، و با هر کدام قدم‌به‌قدم رو‌به‌رو می‌شوی — اول در صحنه‌های سه‌بعدی، بعد با مأموریت‌های کوچک در دنیای واقعی.",
    "about.scienceH": "علمی که به آن تکیه دارد",
    "about.science1": "کل بازی بر مواجههٔ تدریجی بنا شده — مطالعه‌شده‌ترین رویکرد برای ترس‌های خاص. اضطراب بالا می‌رود، به اوج می‌رسد و اگر بمانی خودش فروکش می‌کند؛ این اجتناب است که ترس را زنده نگه می‌دارد. هر «آزمون» از تو می‌خواهد پیش‌بینی کنی، کمی بمانی و بعد مقایسه کنی — یادگیری در همان فاصلهٔ پیش‌بینی و واقعیت اتفاق می‌افتد.",
    "about.science2": "پیشرفت فقط بازی نیست، اندازه‌گیری می‌شود: خودسنجی‌های کوتاه ترس در طول زمان، و گزارشی قابل‌چاپ که می‌توانی به درمانگر بدهی.",
    "about.limitsH": "میرا چه چیزی نیست",
    "about.limits": "درمان نیست، تشخیص نیست، ابزار پزشکی نیست. برای کنجکاوی و آموزش ساخته شده. اگر ترسی زندگی‌ات را جدی محدود کرده، درمانگر آموزش‌دیده می‌تواند مواجههٔ واقعی را امن پیش ببرد — گزارشت را هم ببر؛ شروع خوبی برای گفت‌وگوست.",
    "about.privacyH": "حریم خصوصی",
    "about.privacy": "همه‌چیز در مرورگر خودت می‌ماند: شخصیت‌ها، جلسه‌ها، خودسنجی‌ها — همه در حافظهٔ همین دستگاه. نه حسابی، نه آماری، نه سروری. داده‌ات فقط وقتی خارج می‌شود که خودت خروجی بگیری (تنظیمات ← خروجی).",
    "about.creditsH": "سپاس",
    "about.credits": "ساخته‌شده برای سرگرمی با",
    "about.creditsModels": "مدل‌های جانداران از",
    "about.creditsMade": "با دقت و علاقه ساختهٔ امیر.",
    "about.reread": "بازخوانی یادداشت خوش‌آمد",
    "about.back": "🗺 به دره",

    // ---- Settings: diagnostics / about / backup ----
    "settings.diag": "عیب‌یابی",
    "settings.diagErrors": "دفترچهٔ خطاها",
    "settings.diagCount": "{n} خطا روی این دستگاه ثبت شده.",
    "settings.diagNone": "خطایی ثبت نشده. اگر چیزی خراب شود، این‌جا می‌نشیند.",
    "settings.diagCopy": "کپی",
    "settings.diagClear": "پاک کن",
    "settings.about": "دربارهٔ میرا",
    "settings.aboutSub": "این چیست، علم پشت آن، حریم خصوصی، سپاس‌ها.",
    "settings.aboutOpen": "باز کن",
    "settings.footer": "این یک بازی تمرینی است، نه درمان. اگر ترسی زندگی‌ات را مختل کرده، درمانگر آموزش‌دیده می‌تواند مواجههٔ واقعی را امن با تو پیش ببرد.",
    "camp.backup": "کل سفرت فقط روی همین دستگاه است. یک پاک‌سازی مرورگر می‌تواند همه را پاک کند — یک نسخه برداری؟",
    "camp.backupNow": "دانلود نسخهٔ پشتیبان",
    "camp.backupLater": "بعداً",

    // ---- Title story ----
    "story.kicker": "بازی کوچکی دربارهٔ ترس‌های بزرگ",
    "story.title": "درهٔ ترس‌ها",
    "story.welcomeBack": "خوش برگشتی، {name}. دره جای تو را نگه داشته.",
    "story.firstLine": "هر کسی ترسی با خود دارد. این یکی مال توست — قدم‌به‌قدم، آرام و امن، با آن رو‌به‌رو شو.",
    "story.ctaNew": "✨ مسافرت را بساز",
    "story.ctaBack": "⚔ ادامهٔ سفر",
    "story.hint": "داستان",
    "story.b1h": "ترس کوچک شروع می‌شود.",
    "story.b1p": "پارسی از پشت نرده. عنکبوتی در حمام. بالکنی که رویش نرفتی. اتاقی که نفس‌ات در آن تنگ شد.",
    "story.b2h": "ازش فرار کنی، بزرگ می‌شود.",
    "story.b2p": "هر بار که از آن‌طرف خیابان می‌روی، پله را به آسانسور ترجیح می‌دهی، چراغ را روشن می‌گذاری — آسودگیِ لحظه‌ای عالی است. و سایه یاد می‌گیرد که از او می‌ترسی. همان آسودگی است که سیرش می‌کند.",
    "story.b3h": "اما ترس یک راز دارد.",
    "story.b3p": "اگر کنارش بمانی — آرام و با شرایط خودت — بالا می‌رود، به اوج می‌رسد و خودش فرو می‌نشیند. بدنت چیزی را یاد می‌گیرد که هیچ‌کس نمی‌توانست بگوید: امن است. با سایه رو‌به‌رو شو تا کوچک شود.",
    "story.b4h": "کل بازی همین است.",
    "story.b4p": "شش ترسِ نام‌آشنا در این دره زندگی می‌کنند. هر کدام پنج آزمون دارد، از «نجوایی دور» تا «خودِ واقعی‌اش». با سرعت خودت قدم بزن — هر لحظه می‌توانی بیرون بیایی و بیرون آمدن هرگز شکست نیست.",
    "story.b5h": "سفر تو از کنار آتش شروع می‌شود.",
    "story.b5p": "مسافری بساز — چهره، نام، و ترس‌هایی که می‌خواهی با آن‌ها رو‌به‌رو شوی. او هر صحنه را با تو راه می‌رود: دستِ او روی نرده است و پای او جلوی پله‌های زیرزمین.",
    "story.disclaimer": "یک بازی تمرینی، نه درمان. مواجهه‌درمانی واقعی باید با یک درمانگر آموزش‌دیده انجام شود. از میرا برای کنجکاوی، آموزش یا شروع یک گفت‌وگو استفاده کن — نه به‌جای درمان.",

    // ---- Camp / journey ----
    "camp.empty": "آتشی روشن، در انتظار یک مسافر.",
    "camp.trialWaiting": "«آزمون {n} از {realm} منتظر من است.»",
    "camp.courage": "⚡ {n} شجاعت",
    "camp.trials": "🛡 {a}/{b} آزمون",
    "camp.sparks": "✦ {a}/{b} جرقه",
    "camp.streak": "🔥 شعلهٔ {n} روزه",
    "camp.realsteps": "🌍 {n} قدم واقعی",
    "camp.hint": "مسیر به درون دره سرازیر می‌شود — یک قلمرو انتخاب کن ▾",
    "rank.to": "{a}/{b} ⚡ تا {title}",
    "rank.max": "بالاترین مقام",
    "quest.flag": "🪧 قدمِ امروز",
    "quest.bonus": "+۱۵ اخگر برای اولین آزمون امروز",
    "quest.earned": "🔥 اخگرِ امروز گرفته شد",
    "quest.doneP": "امروز حاضر شدی — شعله روشن است. یک قدم دیگر همیشه جا دارد.",
    "quest.todoP": "روزی یک قدم کوچک، شعله را روشن نگه می‌دارد. هر لحظه می‌توانی بیرون بیایی.",
    "quest.btnDone": "یک قدم دیگر",
    "quest.btnTodo": "⚔ قدمِ امروز را بردار",
    "quest.trial": "آزمون {n}",
    "dawn.h": "آن‌سوی دره",
    "dawn.p": "ترس‌هایی که نقشه هنوز نمی‌شناسد — مسیرشان را خودت بساز.",
    "dawn.forge": "🛠 ساخت ترس دلخواه",
    "dawn.tamed": "🕊 {a} از {b} سایه رام شد — سپیده نزدیک‌تر است.",
    "dawn.story": "📜 داستان تو تا این‌جا",
    "node.enter": "ورود به قلمرو",
    "node.continue": "ادامه",
    "node.again": "دوباره قدم بزن",
    "node.tamed": "🕊 رام شد",
    "node.holds": "{g} هنوز این‌جا را در چنگ دارد.",
    "node.weakening": "{g} دارد ضعیف می‌شود — {n} آزمون مانده.",
    "node.you": "تو",
    "realmWord": "قلمرو",

    // ---- Realm view ----
    "trial.face": "با این آزمون رو‌به‌رو شو",
    "trial.again": "دوباره رو‌به‌رو شو",
    "trial.skip": "جلوتر برو",
    "trial.misty": "🕯 نجوای این آزمون هنوز در مه است…",
    "trial.hold": "ماندن ~{n} ثانیه",
    "trial.lastFear": "آخرین ترس {n}/۱۰",
    "ladder.begin": "شروع — آزمون ۱: {t}",
    "ladder.continue": "ادامه — آزمون {n}: {t}",
    "ladder.again": "دوباره — آزمون {n}: {t}",
    "ladder.sub": "{n} آزمون · به هر ترتیبی، با سرعت خودت · دکمهٔ Esc همیشه تو را به زمین برمی‌گرداند",
    "oath.set": "🎯 برای این قلمرو سوگندی یاد کن",
    "oath.reach": "سوگند: رسیدن به آزمون",
    "oath.week": "این هفته",
    "oath.edit": "ویرایش سوگند",
    "guide.notes": "🧭 یادداشت‌های راهنما — این ترس چیست و چرا رو‌به‌رو شدن جواب می‌دهد",
    "guardian.strength": "قدرت",
    "guardian.tamed": "رام شد",
    "progress.link": "📜 {n} جلسه در این قلمرو · دیدن کارنامه",

    // ---- The Mirror ----
    "mirror.kicker": "🪞 آینه",
    "mirror.before": "🪞 پیش از اولین آزمونت",
    "mirror.title": "آینه را بالا بگیر — ۶۰ ثانیه",
    "mirror.p": "پنج پرسش کوتاه درباره‌ی این ترس در زندگی واقعی. یک بار حالا جواب بده تا آینه‌های بعدی با عدد نشانت بدهند چقدر آرام‌تر شده.",
    "mirror.btn": "در آینه نگاه کن",
    "mirror.chip": "🪞 ترس در بیرون: {n}/۲۰ — {band}",
    "mirror.down": "▼{n} از اولین آینه",
    "mirror.up": "▲{n} از اولین آینه",
    "mirror.recheck": "دوباره بسنج",
    "mirror.modalTitle": "این ترس، آن بیرون، چطور است؟",
    "mirror.modalP": "دربارهٔ زندگی واقعی جواب بده — نه بازی. ۶۰ ثانیه، فقط برای خودت. یک خودسنجی است، نه تشخیص.",
    "mirror.q1": "در زندگی واقعی چقدر راهت را کج می‌کنی تا با آن رو‌به‌رو نشوی؟",
    "mirror.q2": "وقتی با آن رو‌به‌رو می‌شوی، ترس در اوج چقدر شدید است؟",
    "mirror.q3": "بدنت چقدر واکنش نشان می‌دهد — قلب، نفس، عرق، خشک‌شدن؟",
    "mirror.q4": "این ترس چقدر زندگی روزمره‌ات را محدود می‌کند — مسیرها، جاها، برنامه‌ها؟",
    "mirror.q5": "همین حالا چقدر مطمئنی که رو‌به‌رو شدن با آن بد تمام می‌شود؟",
    "mirror.s0": "اصلاً",
    "mirror.s1": "کمی",
    "mirror.s2": "تا حدی",
    "mirror.s3": "زیاد",
    "mirror.s4": "خیلی زیاد",
    "mirror.b0": "یک نجوا",
    "mirror.b1": "شنیدنی",
    "mirror.b2": "بلند",
    "mirror.b3": "خیلی بلند",
    "mirror.first": "این نقطهٔ شروع توست. آینه‌های بعدی تغییر را نشان می‌دهند.",
    "mirror.gotQuieter": "▼ {d} آرام‌تر از اولین آینه‌ات ({a} ← {b}). این تغییر آن بیرون، در زندگی‌ات، اتفاق افتاد.",
    "mirror.gotLouder": "▲ {d} بلندتر از اولین آینه‌ات ({a} ← {b}). ترس نوسان دارد — این اطلاعات است، نه شکست.",
    "mirror.save": "آینه را بالا بگیر",
    "mirror.done": "تمام",
    "mirror.notNow": "حالا نه",
    "mirror.promptMid": "میانهٔ این قلمرو هستی. ۶۰ ثانیه با آینه نشانت می‌دهد از وقتی شروع کردی، آن بیرون چه تغییری کرده.",
    "mirror.promptPost": "به قلهٔ این قلمرو رسیده‌ای. ۶۰ ثانیه با آینه نشانت می‌دهد از وقتی شروع کردی، آن بیرون چه تغییری کرده.",
    "mirror.promptKicker": "🪞 لحظهٔ خوبی برای نگاه کردن",
    "mirror.hold": "آینه را بالا بگیر",

    // ---- The Real Path ----
    "bridge.head": "🌍 مسیر واقعی",
    "bridge.sub": "دره تمرین است. این قدم‌های کوچکِ بیرون، اصلِ ماجرایند — همیشه اختیاری، همیشه با سرعت خودت، با شجاعتِ بیشتر.",
    "bridge.didThis": "این کار را کردم",
    "bridge.locked": "برای باز شدن این قدم، با آزمون {n} در دره رو‌به‌رو شو.",
    "bridge.faced": "انجام شد",
    "bridge.fear": "ترس {n}/۱۰",
    "bridge.inviteKicker": "🌍 قدم واقعی باز شد",
    "bridge.inviteTail": "دره تمرین بود — اصل ماجرا این است. هر وقت آماده بودی؛ {n} شجاعت دارد.",
    "bridge.see": "دیدن مسیر واقعی",
    "ws.kicker": "🌍 مسیر واقعی",
    "ws.p": "این کار را آن بیرون، در دنیای واقعی کردی — شجاعانه‌ترین نوع آزمون. یک پرسش صادقانه:",
    "ws.q": "ترس در اوجش، آن بیرون، چقدر بلند بود؟",
    "ws.save": "🌍 رو‌به‌رو شدم",
    "ws.notYet": "هنوز نه",

    // ---- Predict / rate / breathe / complete ----
    "predict.badge": "آزمون {n} از {m} — {realm}",
    "predict.h2": "پشت دروازه: عددِ ترست را صدا بزن",
    "predict.p": "آیینی که ارزش آزمون را دو برابر می‌کند: پیش‌بینی کن ترس چقدر بلند خواهد بود، بعد ببین واقعاً چه می‌شود. بیشترِ آدم‌ها بیش‌برآورد می‌کنند — و مچِ سایه را هنگام اغراق گرفتن، دقیقاً همان درسی است که مغز لازم دارد.",
    "predict.label": "انتظار داری هنگام «{t}» چقدر مضطرب شوی؟",
    "predict.back": "بازگشت به قلمرو",
    "predict.enter": "⚔ ورود به آزمون",
    "scale.calm": "۰ آرام",
    "scale.panic": "۱۰ وحشت",
    "rate.h2": "آزمون پشت سر توست. چقدر بلند بود؟",
    "rate.p": "ترسی را که همین حالا حس می‌کنی روی مقیاس SUDS ثبت کن. صادق باش؛ این دفترچه فقط مال خودِ توست.",
    "rate.breathe": "اول یک نفس",
    "rate.save": "ذخیره و ادامه",
    "breathe.h2": "نفسِ کنار آتش",
    "breathe.p": "ابزار مسافر: دایره را دنبال کن. ۴ ثانیه دم، نگه‌دار، ۴ ثانیه بازدم — بازدمِ بلند ترمز بدن را می‌گیرد. هر چقدر خواستی بمان؛ آتش جایی نمی‌رود.",
    "breathe.btn": "آرام‌ترم — ادامه",
    "complete.faced": "آزمون {n} انجام شد",
    "complete.early": "آزمون {n} · عقب‌نشینی",
    "complete.h2": "با آزمون رو‌به‌رو شدی. سایه کوچک می‌شود.",
    "complete.h2early": "یک قدم عقب رفتی — حاضر شدن هم حساب است.",
    "complete.next": "⚔ آزمون بعدی: {t}",
    "complete.tamed": "🕊 قلمرو رام شد — ببینش",
    "complete.back": "بازگشت به قلمرو",
    "shadow.weakened": "ضعیف شد — قدرت {a}/{b}.",
    "shadow.tamedLine": "رام شد. قلمرو مال توست.",
    "spark.earned": "یک جرقهٔ خرد به دست آوردی",
    "spark.tap": "برای برگرداندن لمس کن",
    "spark.count": "جرقهٔ {a} از {b} · در {link} نگه‌داری می‌شود",
    "spark.book": "کتاب جرقه‌ها",

    // ---- Journal ----
    "journal.badge": "کتاب جرقه‌ها",
    "journal.h2": "خردی که به دست آورده‌ای",
    "journal.p1": "هر آزمونِ کامل یک جرقه به‌جا می‌گذارد — تکه‌ای از روان‌شناسیِ ترس که با زیستن به دست آمده، نه با خواندن.",
    "journal.have": "{a} از {b} را داری.",
    "journal.empty": "کتابت خالی است — با اولین آزمونت شروعش کن.",
    "journal.lockedT": "جرقهٔ {n}",
    "journal.lockedP": "هنوز آن بیرون است. با آزمون دیگری رو‌به‌رو شو تا به دستش بیاوری.",
    "journal.backValley": "🗺 بازگشت به دره",

    // ---- Ranks ----
    "ranks.0": "مسافر تازه‌کار",
    "ranks.1": "ره‌نورد",
    "ranks.2": "ره‌یاب",
    "ranks.3": "سایه‌رام‌کن",
    "ranks.4": "نگهبان دره",
    "ranks.5": "سپیده‌آور",

    // ---- Fear labels (content layer) ----
    "phobia.dogs.label": "سگ‌ها",
    "phobia.spiders.label": "عنکبوت‌ها",
    "phobia.snakes.label": "مارها",
    "phobia.heights.label": "ارتفاع",
    "phobia.dark.label": "تاریکی",
    "phobia.enclosed.label": "فضاهای بسته",

    // ---- Realm meta (content layer) ----
    "realm.dogs.name": "حیاطِ چمن‌زار",
    "realm.dogs.epithet": "جایی که پارس‌ها زندگی می‌کنند",
    "realm.dogs.guardian": "سایهٔ سگِ شکاری",
    "realm.dogs.line": "هر حیاطی که برای دور زدنش از خیابان رد شدم، پارس را در سرم بلندتر کرد.",
    "realm.dogs.cleared": "حیاط حالا فقط یک حیاط است. سگ فقط یک سگ.",
    "realm.spiders.name": "زیرزمینِ قدیمی",
    "realm.spiders.epithet": "جایی که چیزهای کوچک می‌خزند",
    "realm.spiders.guardian": "سایهٔ بافنده",
    "realm.spiders.line": "مسئله اندازه نیست، پاهاست. اما دیگر نمی‌خواهم گوشه‌های هر اتاق را وارسی کنم.",
    "realm.spiders.cleared": "زیرزمین ساکت است. همیشه هم تقریباً ساکت بود.",
    "realm.snakes.name": "چمن‌زارِ آفتابی",
    "realm.snakes.epithet": "جایی که علف‌ها تکان می‌خورند",
    "realm.snakes.guardian": "سایهٔ رود",
    "realm.snakes.line": "یک بار طنابی روی مسیر قلبم را نگه داشت. قلبم را پس می‌خواهم.",
    "realm.snakes.cleared": "علف تکان می‌خورد. گاهی فقط باد است. حالا می‌توانی تشخیص بدهی.",
    "realm.heights.name": "قله",
    "realm.heights.epithet": "جایی که زمین به تو نگاه می‌کند",
    "realm.heights.guardian": "سایهٔ دلِ خالی",
    "realm.heights.line": "مسئله افتادن نیست؛ کششِ لبه است. می‌خواهم آن‌جا بایستم و فقط نگاه کنم.",
    "realm.heights.cleared": "پرتگاه هنوز عمیق است. فقط پاهایت دیگر علیه تو رأی نمی‌دهند.",
    "realm.dark.name": "خانه در شب",
    "realm.dark.epithet": "جایی که سایه‌ها چشم درمی‌آورند",
    "realm.dark.guardian": "سایهٔ بی‌نور",
    "realm.dark.line": "می‌دانم چیزی آن‌جا نیست. فقط می‌خواهم بدنم هم بداند.",
    "realm.dark.cleared": "تاریکی فقط همان اتاق است با چراغ خاموش. همیشه همین بود.",
    "realm.enclosed.name": "گذرگاهِ تنگ",
    "realm.enclosed.epithet": "جایی که دیوارها نزدیک می‌شوند",
    "realm.enclosed.guardian": "سایهٔ سینه‌تنگ",
    "realm.enclosed.line": "آسانسور، تونل، اتاق تنگ — سینه‌ام پیش از خودم تصمیم می‌گیرد. تصمیم را پس می‌گیرم.",
    "realm.enclosed.cleared": "اتاق‌های کوچک فقط اتاق‌اند. نفس تو در همه‌شان جا می‌شود.",

    // ---- Sparks of Wisdom (content layer) ----
    "card.wave.title": "ترس یک موج است",
    "card.wave.text": "اضطراب بالا می‌رود، به اوج می‌رسد و خودش فرو می‌نشیند — حتی اگر هیچ کاری نکنی و فقط بمانی. همین حالا سوار یکی شدی. هیچ موجی بی‌پایان نیست.",
    "card.avoidance.title": "فرار، سایه را سیر می‌کند",
    "card.avoidance.text": "گریختن از ترس یک دقیقه حال خوب می‌دهد — و به مغزت یاد می‌دهد خطر واقعی بود. هر حیاطِ دورزده، پارس را بلندتر می‌کند. رو‌به‌رو شدن تنها رژیمی است که سایه تابش نمی‌آورد.",
    "card.brave.title": "شجاع یعنی آرام نیست",
    "card.brave.text": "شجاعت نبودِ ترس نیست — لرزیدنِ دست‌هاست وقتی می‌مانی. اگر آن تو ترسیدی، اشتباهش نکرده‌ای؛ دقیقاً درست انجامش داده‌ای.",
    "card.habituation.title": "بدن با ماندن یاد می‌گیرد",
    "card.habituation.text": "به اندازهٔ کافی کنار ترس بمان و هشدارِ بدن خودش خاموش می‌شود. اسمش خوگیری است — اراده نمی‌خواهد، فقط وقت می‌خواهد. حوصله‌سررفتن صدای کار کردنِ آن است.",
    "card.gap.title": "درس در همان فاصله است",
    "card.gap.text": "پیش‌بینی کردی ۸، شد ۴. آن فاصله — که در تن حس شد، نه در کتاب — همان جایی است که مغزت «خطرناک» را از نو می‌نویسد.",
    "card.exhale.title": "بازدمِ بلند",
    "card.exhale.text": "بازدم آهسته پدالِ ترمز بدن را می‌گیرد (عصب واگ). بازدم بلندتر از دم — ۴ تو، ۶ بیرون — و قلب چاره‌ای جز پیروی ندارد.",
    "card.steps.title": "قدم‌های کوچک از پرش‌های بزرگ می‌برند",
    "card.steps.text": "دستگاه عصبی به شواهد تدریجی اعتماد می‌کند، نه پرش‌های قهرمانانه. آزمونی که فقط کمی ترسناک است و تکرار می‌شود، بیش از یک شیرجهٔ وحشتناک سیم‌کشی مغز را عوض می‌کند.",
    "card.newmemory.title": "خاطرهٔ نو، نه پاک‌شده",
    "card.newmemory.text": "مواجهه خاطرهٔ ترس را پاک نمی‌کند — خاطرهٔ قوی‌ترِ «این‌جا امن است» را رویش می‌سازد. برای همین تمرین مهم است: داری خاطرهٔ نو را تغذیه می‌کنی.",
    "card.attention.title": "نگاهش کن، نه آن‌طرف را",
    "card.attention.text": "حواس‌پرتی مهربان‌تر به نظر می‌رسد، اما توجه است که یادگیریِ امنی را می‌چسباند. تماشای عنکبوتی که هیچ کاری نمی‌کند خودِ داروست. نگاه دزدیدن یعنی جا انداختن دوز.",
    "card.openhand.title": "دستِ باز، نه مشتِ گره",
    "card.openhand.text": "جنگیدن با احساس، بزرگش می‌کند. بگذار ترس در اتاق باشد — بی‌جنگ — و تو کارت را بکنی؛ این‌طور زودتر از هر کشمکشی شل می‌شود.",
    "card.spiral.title": "تلوتلو هم جزء مسیر است",
    "card.spiral.text": "یک روزِ ترسیده بعد از یک هفتهٔ شجاع، پس‌رفت نیست. یادگیری مارپیچ است، نه خط — از همان نقطه دوباره می‌گذری، اما بالاتر.",
    "card.bodyfirst.title": "بدن اول رأی می‌دهد",
    "card.bodyfirst.text": "اول قلبِ تند، بعد فکرِ ترسناک — به همین ترتیب. هشدار یک بازتاب است، نه گزارش حقیقت. می‌شود احساس خطر کرد و کاملاً امن بود، هم‌زمان.",
    "card.portable.title": "شجاعت سفر می‌کند",
    "card.portable.text": "تمرین در جاها، حال‌وهواها و ساعت‌های مختلف، یادگیریِ امنی را قابل‌حمل می‌کند — تا در حیاطِ واقعی هم پیدایش شود، نه فقط این‌جا.",
    "card.rest.title": "خواب، آن را ثبت می‌کند",
    "card.rest.text": "مغزت یادگیریِ امنیِ امروز را در خواب تثبیت می‌کند. شجاعانه‌ترین کار بعد از یک آزمون، هیچ‌کاری نکردن است.",
    "card.coach.title": "مثل مربی حرف بزن، نه منتقد",
    "card.coach.text": "«سخت است و می‌توانم بمانم» از «وحشت نکن» می‌بَرد. صدایی که تو را از آزمون رد می‌کند مهربان، دقیق و طرفِ توست — تمرین کن با خودت همان‌طور حرف بزنی.",
  },
};

let currentLang = "en";
try {
  const saved = localStorage.getItem("fobia.lang");
  if (saved && PACKS[saved]) currentLang = saved;
} catch {}

function t(key, fallback) {
  const pack = PACKS[currentLang];
  if (pack && pack[key] != null) return pack[key];
  if (PACKS.en && PACKS.en[key] != null) return PACKS.en[key];
  return fallback != null ? fallback : key;
}
// Template variant: "{n} of {m}" token substitution, RTL-safe (no string
// concatenation at call sites, so word order is the translator's choice).
function tf(key, fallback, vars) {
  let s = t(key, fallback);
  if (vars) for (const k of Object.keys(vars)) s = s.split("{" + k + "}").join(vars[k]);
  return s;
}
function setLang(lang) {
  if (PACKS[lang]) {
    currentLang = lang;
    try { localStorage.setItem("fobia.lang", lang); } catch {}
    applyLang();
    try { window.dispatchEvent(new CustomEvent("lang-changed", { detail: { lang } })); } catch {}
  }
}
// Stamp <html lang dir> so CSS [dir="rtl"] overrides mirror the layout and
// screen readers announce the right language.
function applyLang() {
  const rtl = currentLang === "fa";
  try {
    document.documentElement.setAttribute("lang", currentLang);
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
  } catch {}
}
function registerLang(lang, pack) {
  PACKS[lang] = Object.assign({}, PACKS[lang] || {}, pack);
}
function availableLangs() { return Object.keys(PACKS); }
function currentLanguage() { return currentLang; }
function isRTL() { return currentLang === "fa"; }

applyLang();

window.I18n = { t, tf, setLang, registerLang, availableLangs, currentLanguage, isRTL };
window.t = t;
window.tf = tf;
