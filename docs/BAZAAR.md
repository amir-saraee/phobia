# Lanternwalk on Cafe Bazaar

What it takes to publish Lanternwalk («فانوس‌به‌دست») on Cafe Bazaar, what was reviewed and fixed for it on
2026-11-06, and the steps that are left. The packaging follows the path the studio already used for Haft Eqlim:
a Trusted Web Activity (TWA) built with Bubblewrap, a host that is reachable from Iran, and the same Bazaar
developer account. The Haft Eqlim repository has the full Bubblewrap setup and signing walkthrough
(`~/Desktop/projects/Stragetic-game/docs/ANDROID.md`), and this page does not repeat it.

## 1. Readiness review (2026-11-06)

### Fixed in this pass

| Area | What was wrong | Now |
| --- | --- | --- |
| Persian: progress report | The whole `#/report` page was English by design | Clinical Persian: Iranian dates (۱۵ آبان ۱۴۰۵), Persian digits, localized trial names, conditions, real-world steps and experiments. An «English version» button switches it, chart included, for a clinician who reads English (`reportEnglish`, `rep.*` keys) |
| Persian: oath editor | "Set a goal" dialog and the oath meter were hardcoded English | Translated (`oath.*`), and it now uses the oath wording the button already used |
| Persian: screen reader | The self-check's five answer groups were labelled in English | Labelled with the Persian question |
| Persian: scenes | "ROOF ACCESS" sign (heights) and the MRI screen's first "READY" were English | Translated, drawn right to left |
| Persian: type | System font only, so it rendered differently on every phone | Vazirmatn (SIL OFL, 46 KB, self-hosted in `assets/fonts/`, Arabic-script range only, so English pages never fetch it). Also used on the share card and canvas signs |
| Persian: separators | " · " next to Persian digits read as a zero: «۳ · ۳ · ۲» looked like «۳۰۳۰۲» | Persian pages use " \| " (the render pass in `faDigitsIn`) |
| Persian default in the app | Iranian phones are often set to English, so the app would open in English | `?source=twa` (the app's start URL) opens in Persian unless the player chose English. `?lang=fa` / `?lang=en` links set and save the language (the landing page uses them) |
| Persian install manifest | One English manifest | `manifest.fa.json` (name, description, `dir: rtl`); the page switches its manifest link with the language. Use it as the TWA's `webManifestUrl` |
| Daily reminder on Android | `new Notification()` throws "Illegal constructor" on Android Chrome, so the opt-in reminder never showed on phones; its SVG icon can't be drawn in the Android shade either | Posted through the service worker (`showLocalNotification`), PNG icon, Persian title; a tap opens the game (`notificationclick` in `sw.js`) |
| Contact | Feedback was copy-only ("send it to the person who shared it"), and Google Forms are unreliable from Iran | «فرستادن با ایمیل» opens the mail app with the note written. The address shows in the feedback box, Settings and About (`SUPPORT_EMAIL` in `src/app/boot-guards.js`) |
| Privacy policy | Only an in-app paragraph | `privacy.html`: static, Persian then English, no script, cached for offline. Linked from the first-run notice, Settings and About |
| About | No version, contact, or content-ownership statement | Version and build date, contact, link to the full policy, the "our own work, these assets under free licences" line (Bazaar's copyright academy asks for it), Vazirmatn credit |
| Landing page | None | `landing/`, a static Persian-first page with an English section (below) |
| Store material | None | 8 Persian phone screenshots and a 512 px icon in `docs/store/` |

### Checked and fine

- Every route, drawer and dialog swept in Persian on desktop: no English left except proper nouns (SUDS, CBT,
  MRI, credits) and the closed legacy realms (water and the others, reachable only with `?all=1`).
  A key scan finds every literal `t()`/`tf()` key with a Persian entry.
- No request leaves the game's own host (no CDN, fonts, analytics or ads). Nothing offers another store or an
  APK, which Bazaar forbids inside the app.
- Persian letters stay joined under `letter-spacing` in current Chrome (tested), so no override is needed.
- The smoke test (`npm run smoke`: first run, every realm's trial, phones in English and Persian, touch, the
  story) passes on these changes.
- The Android app's start URL (`?source=twa`) opens in Persian on a phone set to English; a saved English choice
  wins; `?lang=en` saves and drops itself from the address.

### Known limits, not fixed here

- **Small phones (360×640 CSS px):** during a trial the coach panel, the read-the-moment card, the 2×2 action bar
  and the joystick cover most of the 3D view. It works, but the animal has little room. Worth a compact HUD pass
  for phones (also on the ideas list of the 2026-10-25 QA sweep).
- The snake's always-rearing pose (left from the QA sweep: needs a rig pass).
- Dark realm rungs 4–5 are close to pure black, by design; some phones' screens will show nothing at all.
- Captions only, no Persian voice (the neural voice track is retired).

## 2. Decisions for the owner

1. **Where the game is served.** The live site is `https://phobia-kappa.vercel.app/`. Vercel addresses are
   filtered in Iran from time to time, and a Bazaar reviewer, and most players, open the app from inside Iran.
   The TWA can only show what that host serves. Recommended: serve it from the studio's Irancell server as
   `https://lanternwalk.go2game.ir` (a static nginx site next to `eqlim.go2game.ir`; see §5). The game is static
   files with no build step, so a deploy is an `rsync` of the repository minus `.git`, `.claude`, `scripts`,
   `docs` and `.smoke-shots`.
2. **Package id.** Suggested `ir.go2game.lanternwalk`. It can never change after the first upload.
3. **Signing key.** A new keystore for this app (`~/keys/lanternwalk.keystore`), backed up twice. Losing it means
   the app can never be updated.
4. **Support contact.** The game and the policy name `info@go2game.ir`, the studio's address on go2game.ir.
   If Lanternwalk should have its own address, change `SUPPORT_EMAIL` (`src/app/boot-guards.js`),
   `privacy.html` and `landing/index.html` together. Bazaar's contract (6-11 ز) also counts an answering phone
   number; add it to the listing (and, if you want, to `privacy.html`).
5. **Where the landing page lives.** It works as-is at `<game host>/landing/`. To put it at
   `https://go2game.ir/lanternwalk/` instead (the studio site, and the registered website on Bazaar), copy
   `landing/` into `sites/go2game/lanternwalk/` in the Haft Eqlim repository, change its `../` links to the game's
   address and its font path to `/fonts/`, and add a Lanternwalk card to the go2game.ir home page ("بازی‌های بیشتر
   در راه است"). Pushing that repository deploys go2game.ir.

## 3. The Android app (TWA)

Same tools and steps as Haft Eqlim's `docs/ANDROID.md`. The values that differ:

| Field | Value |
| --- | --- |
| `packageId` | `ir.go2game.lanternwalk` (decision 2) |
| `host` | `lanternwalk.go2game.ir` (decision 1) |
| `name` / `launcherName` | `فانوس‌به‌دست` (the listing's name must match the name under the icon) |
| `startUrl` | `/?source=twa` (opens in Persian; see §1) |
| `webManifestUrl` | `https://<host>/manifest.fa.json` |
| `themeColor`, `navigationColor`, `backgroundColor` | `#0f1724`, `#0f1724`, `#050816` (the game's) |
| `iconUrl` / `maskableIconUrl` | `https://<host>/assets/icons/icon-512.png` / `icon-maskable-512.png` |
| `orientation` | `any` (the trials also play in landscape) |
| `display` | `standalone` (the game never goes fullscreen on touch, on purpose) |
| `enableNotifications` | `true`, only for the opt-in daily reminder (Settings → Reminders) |
| `fallbackType` | `webview` (phones without Chrome; the game needs WebGL, WebView 111+) |
| `minSdkVersion` | 24 |

**assetlinks.json.** Serve `https://<host>/.well-known/assetlinks.json` (200, `application/json`, no redirect) with
both statements: Chrome's (the package and the signing key's SHA-256, so the address bar disappears) and
Bazaar's TWA check:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": { "namespace": "android_app", "package_name": "ir.go2game.lanternwalk",
                "sha256_cert_fingerprints": ["<the release key's SHA-256>"] }
  },
  {
    "relation": ["check_validation"],
    "target": { "namespace": "cafebazaar_twa", "package_name": "ir.go2game.lanternwalk" }
  }
]
```

Before uploading, test both paths: a phone with Chrome (full screen, no address bar, opens in Persian) and one
with Chrome disabled (the WebView fallback; Settings → Reminders then says notifications aren't supported,
which is expected).

## 4. The listing, ready to paste

Copy the Persian exactly: the half-spaces (ZWNJ) matter.

| Field | Value |
| --- | --- |
| Type → category | بازی ← **شبیه‌سازی** (alternative: تفننی). Bazaar's game categories are استراتژی، اکشن، امتیازی، تفننی، رانندگی، شبیه‌سازی، کلمات و دانستنی‌ها، کودک، معمایی، ورزشی. Not the «پزشکی» app category: the game is not a medical service |
| Price | رایگان; leave «برنامه نیاز به پرداخت درون‌برنامه‌ای دارد» unticked |
| Name | فانوس‌به‌دست |
| Support email | info@go2game.ir (decision 4) |
| Website | the landing page's address (decision 5) |
| Privacy policy | `https://<host>/privacy.html` |
| Icon | [`docs/store/bazaar-icon-512.png`](store/bazaar-icon-512.png): 512 × 512, full-bleed, no transparency (Bazaar rounds the corners) |
| Screenshots | [`docs/store/screenshots/`](store/screenshots/), in this order: 01-title, 02-dog, 03-heights, 04-spider, 05-snake, 06-lift, 07-ladder, 08-report. 1080 × 1920 JPEG, each under 210 KB, Persian, as the app shows them (touch UI, no browser bar) |
| Age rating (ESRA) | Optional on Bazaar today (the Foundation plans to require it within a year). If you request it, answer the fear questions honestly: fear is the game's subject (a dog that bounds over at rung 5, total darkness, an MRI). Expect 12+ |

Wording to avoid in the listing (Bazaar's deceptive-behaviour rule, and words that suggest a clinical service):
«درمان» as a promise, «روان‌درمانی», «مشاوره», «تشخیص». Naming the fears is fine. Don't present the 123 and
1480 help lines as partners.

### Short description (51 of 60 characters)

```
بازی‌ای آرام برای روبه‌رو شدنِ قدم‌به‌قدم با ترس‌ها
```

### Full description (792 of 800 characters)

```
«فانوس‌به‌دست» بازی سه‌بعدیِ آرامی است دربارهٔ ترس‌های بزرگ: سگ، عنکبوت، مار، ارتفاع، تاریکی و جای تنگ.

هر ترس یک قلمرو با پنج آزمون است، از آسان‌ترین قدم تا سخت‌ترین. پیش از هر آزمون پیش‌بینی می‌کنی ترست تا کجا بالا می‌رود، در صحنه می‌مانی تا موجِ ترس خودش فروکش کند، و بعد پیش‌بینی‌ات را با آنچه واقعاً پیش آمد مقایسه می‌کنی. بازی بر اصولِ مواجههٔ تدریجی در روان‌شناسی ساخته شده است.

داستانِ «فانوس‌های دره» با هر آزمون ورق می‌خورد و ۳۸ درسِ کوتاه دربارهٔ آغاز و آرام گرفتنِ ترس‌ها دارد. ستاره‌ها، قدم‌های زندگیِ واقعی، خودسنجی و گزارش پیشرفت هم کنارش هست.

پیش از نصب بدانید:
• رایگان، بدون تبلیغ و ثبت‌نام؛ داده‌ها فقط روی گوشی می‌ماند.
• بار اول به اینترنت نیاز دارد.
• اندروید ۷ به بالا، با کروم یا Android System WebView به‌روز.
• بازی‌ای تمرینی و آموزشی است و جای متخصص را نمی‌گیرد.
```

### English (optional fields)

Name `Lanternwalk`; short description (56 characters):

```
A gentle game for facing fears, one small step at a time
```

Description (796 characters):

```
Lanternwalk is a calm 3D game about big fears: dogs, spiders, snakes, heights, the dark and tight spaces.

Each fear is a realm of five trials, from the easiest step to the hardest. Predict how high your fear will climb, stay in the scene until the wave settles, then compare your guess with what happened. The game is built on graded exposure.

The story, The Lanterns of the Valley, turns a page with every trial and carries 38 short lessons on how fears start and settle. Stars, real-world steps, a self-check and a progress report sit beside it.

Good to know:
• Free, no ads, no sign-up; your data stays on your phone.
• Needs the internet the first time.
• Android 7+, with Chrome or an up-to-date Android System WebView.
• A practice and learning game, not a substitute for a professional.
```

### What's new (first release)

```
نخستین نسخهٔ فانوس‌به‌دست در بازار. اولین فانوس منتظر توست.
```

### Note for the reviewer («توضیحات بیشتر برای بررسی‌کننده»)

Fill in the host first.

```
این برنامه نسخهٔ اندرویدی (TWA) بازی تحت وب «فانوس‌به‌دست» در نشانی <host> است. عبارت check_validation بازار در فایل assetlinks.json سایت قرار دارد.

بازی رایگان است، تبلیغ و خرید درون‌برنامه‌ای ندارد و حساب کاربری نمی‌خواهد. هیچ داده‌ای به سرور فرستاده نمی‌شود: مسافرها، سابقهٔ تمرین و تنظیمات فقط در حافظهٔ مرورگرِ همان گوشی می‌مانند. سیاست حریم خصوصی در اولین صفحهٔ بازی، در تنظیمات و در «دربارهٔ بازی» پیوند دارد: <host>/privacy.html

برای دیدن بازی: در صفحهٔ آغاز یکی از شش ترس را بزنید (مثلاً «سگ‌ها»)، یادداشت آغاز را بپذیرید و وارد آزمون اول شوید. هر صحنه را هر لحظه می‌شود ترک کرد و دکمهٔ «آرامم کن» تمرینی کوتاه برای آرام شدن باز می‌کند.

بازی دربارهٔ ترس از سگ، عنکبوت، مار، ارتفاع، تاریکی و جای تنگ است و بر اصول مواجههٔ تدریجی ساخته شده. خشونت، خون یا آسیب در آن نیست. خودش را بازی تمرینی و آموزشی معرفی می‌کند، نه درمان یا ابزار پزشکی، و شمارهٔ اورژانس اجتماعی (۱۲۳) و صدای مشاور بهزیستی (۱۴۸۰) را برای مواقع بحران نشان می‌دهد.

دسترسی اعلان (POST_NOTIFICATIONS) فقط برای یادآور روزانهٔ خود بازی است که بازیکن خودش در تنظیمات روشن یا خاموش می‌کند. هیچ اعلان تبلیغاتی فرستاده نمی‌شود.

داستان، شخصیت‌ها، صحنه‌ها، نوشته‌ها و کد کار سازندهٔ بازی است. مدل‌های جانوران (Quaternius، CC0)، صداهای محیط (Mixkit)، نور آسمان (Poly Haven، CC0)، قلم وزیرمتن (SIL OFL) و کتابخانه‌های three.js و Rapier (MIT/Apache) با مجوز آزادشان به کار رفته‌اند و در «دربارهٔ بازی» آمده‌اند.
پشتیبانی: info@go2game.ir
```

## 5. Serving it from go2game.ir (decision 1)

A server block beside the game's in `deploy/nginx-eqlim.conf` of the Haft Eqlim repository, and the certificate
extended with `-d lanternwalk.go2game.ir`. DNS: `A lanternwalk → 2.144.28.115`.

```nginx
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  http2 on;
  server_name lanternwalk.go2game.ir;
  ssl_certificate /etc/letsencrypt/live/eqlim.go2game.ir/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/eqlim.go2game.ir/privkey.pem;
  root /srv/lanternwalk/site;
  index index.html;
  charset utf-8;
  gzip on;
  gzip_types text/css application/javascript text/javascript application/json application/manifest+json image/svg+xml model/gltf-binary model/gltf+json;
  add_header Strict-Transport-Security "max-age=31536000" always;
  add_header X-Content-Type-Options nosniff always;
  # nginx's mime.types has no glTF entry. (Don't add a `types {}` block here:
  # it replaces the whole inherited map instead of adding to it.)
  location ~* \.glb$  { default_type model/gltf-binary; expires 30d; }
  location ~* \.gltf$ { default_type model/gltf+json; expires 30d; }
  location /.well-known/ { default_type application/json; try_files $uri =404; }
  location /assets/ { expires 30d; add_header Cache-Control "public, max-age=2592000"; }
  # The page, the code and the service worker revalidate, so an update shows on reload.
  location / { try_files $uri $uri/ =404; add_header Cache-Control "no-cache"; }
}
```

Check after deploying: `curl -sI https://lanternwalk.go2game.ir/assets/fonts/vazirmatn-arabic-wght-normal.woff2`
(`font/woff2`), the same for a `.wasm` under `assets/vendor/rapier/` (`application/wasm`) and a `.glb` under
`assets/models/`.

The hash router (`#/dogs`) needs no rewrites. Keep the Vercel site up until players who installed the web app
there have moved; they keep their data only on the old address (storage belongs to an origin).

## 6. Store screenshots and landing images

Both come from the real game, in Persian, on a 360 × 640 @3x touch viewport with `?source=twa`, from a staged
traveler with a little history (no player's data). The capture script lived in the session scratchpad; to
retake them, the pattern is: serve the repo, set `fobia.lang=fa`, `fobia.consent.v1=1`,
`fobia.quality=high`, save a `Character.defaultCharacter()` named «سارا», seed a few `recordCompletion` calls,
then screenshot `#/`, `#/dogs/exposure/1`, `#/heights/exposure/3`, `#/spiders/exposure/2`,
`#/snakes/exposure/1`, `#/enclosed/exposure/2`, `#/dogs` and `#/report` after ~10 s each. The landing page's
`img/shot-*.jpg` are the same captures at 540 × 960 (`sips -Z 960 -s formatOptions 72`).

## 7. After approval

- Add Bazaar's official «دریافت از بازار» badge (the unchanged image from Bazaar's developer site, at least 40 px
  tall, linked to `https://cafebazaar.ir/app/<packageId>`) to the landing page's hero and "play" card. Until
  then the listing's contract forbids using Bazaar's marks.
- Google's developer verification reaches certified Android phones worldwide during 2027; from then a
  Bazaar install needs the developer registered with Google (Haft Eqlim's ANDROID.md has the details).
