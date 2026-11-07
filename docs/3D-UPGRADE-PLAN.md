# Better 3D on the phones that will actually run it

Research done 2026-11-07 on three questions: which AI-assisted tools can raise the quality of the game's models,
animations and textures; which rendering techniques matter for the phones Cafe Bazaar players own; and what
Bazaar itself requires. The short answer is that the biggest gains are not in new models but in how the existing
ones are delivered and lit on the low tier, because that is the tier most Iranian players will see.

## 1. What we ship today (measured)

| Item | Now | Note |
| --- | --- | --- |
| three.js | r160 (Dec 2023), self-hosted | current is r187 (Oct 2026) |
| Rapier physics | rapier3d-compat 0.12, 2.0 MB raw / 755 KB gzip | WASM inlined as base64; lazy-loaded by the dog realm |
| Game JS (classic + 3D core + dog realm) | ~770 KB gzip | plus 166 KB gzip for three.js |
| Creature GLBs | Husky 748 KB, Shiba 712 KB, Spider 440 KB, Snake 212 KB | 1.6–2.7k tris, 15–49 bones, no mesh compression |
| Dog coat textures (fetched) | 6 JPEGs, ~1.2 MB | 2 MB PNG sources also sit in `assets/models/textures/` (18 MB, never fetched) |
| Environment | `meadow_1k.hdr`, 1.4 MB, PMREM at runtime | half-float PMREM on first frame |
| Decoders | GLTFLoader only | no Draco, meshopt or KTX2 |
| Low tier | composer (RenderPass + fused OutputPass), DPR 1, no AA, no shadows, no bloom | Mali-G52/G57 and Adreno < 615 land here |
| First visit, dog realm | ~4.5 MB over the wire before the dog appears | three + rapier + game JS + 2 GLBs + coats + HDR |

The GPU grading in `src/3d/renderer.js` puts every Mali below G60 on the low tier. Bazaar's own 2025 device data
and StatCounter (Oct 2026) say the best-selling phones in Iran are the Galaxy A16/A06/A56 and Redmi 14C/13/A5 and
Poco C71: Helio G85/G99, Exynos 1330/1480 and Unisoc T7250, which means **Mali-G52 and G57 are the typical GPU,
not Adreno 6xx**. Whatever the low tier looks like is what most players get.

## 2. AI-assisted tools: what is usable from Iran, and for what

### Model generation
| Tool | Verdict |
| --- | --- |
| **Tripo AI** (tripo3d.com) | The only service with **serpentine, octopod and quadruped auto-rigging**, i.e. snake, spider and dog. Commercial rights only on Pro (~$20/mo). Needs VPN + foreign card. Best fit if we want new creature meshes. |
| **Meshy** (meshy.ai) | Free tier outputs are CC BY (attribution on the About page), paid outputs are private. Auto-rig is free but covers humanoid and "quadruped dog" with a clip library; its generic Smart Rig gives a snake/spider skeleton but **no clips**. VPN + foreign card. |
| **Rodin / Hyper3D** | Best raw geometry in 2026 reviews, quad export; output licence text could not be read. Verify before relying on it. |
| **Hunyuan3D 2.1** (open weights, Tencent) | Royalty-free commercial licence that does **not** exclude Iran; runs on a 16 GB Apple Silicon Mac via MPS (shape fine, texture step fragile). Sanction-proof. |
| **TRELLIS.2** (open weights, Microsoft, MIT) | Excellent PBR GLBs; needs a 24 GB NVIDIA card, Mac port is partial; depends on nvdiffrast whose licence needs an audit. |
| Luma Genie | Shut down Jan 2026. Kaedim: enterprise pricing. Skip both. |

Every generator produces a high-poly static mesh. None gives game-ready low-poly quads, so a Blender pass
(retopo or decimate to 2–5k tris, bake to 1024² PBR, rig) follows regardless. Hugging Face and Replicate are
network-blocked or embargoed from Iran, so **only downloaded open weights work without a VPN**.

### Animation
Mixamo, DeepMotion, Rokoko Vision, Move One, Plask and Krikey are **humanoid only**. **Cascadeur Pro** (~$33/mo)
added quadruped auto-posing in 2025.3 and is the one commercial path to better dog clips. Snake and spider motion
has no mature tool; the research models (Kirin, AnyTop, MoCapAnything) are CUDA research code. Our procedural
SpiderController and SnakeController layers remain the pragmatic answer there. Retarget quadrupeds in Blender,
not with three.js SkeletonUtils (its default hip name is `hip`, rest poses must match, and retargetClip was already
rejected for the humanoid).

### Texturing and environment
Offline and therefore Iran-friendly: **Real-ESRGAN** (2× upscale of the photo-baked coats), **DeepBump**
(Blender add-on, albedo → normal/height/curvature), **Stable Projectorz** or **Dream Textures** (SD/Flux projection
painting). Meshy's re-texturing and Adobe Substance Sampler are paid and region-blocked. For skies, Blockade
Labs' HDRI export sits on its Business tier; **Poly Haven** HDRIs are CC0 and good enough.

### Blender automation
Anthropic shipped an official Blender connector (Apr 2026) and the community `blender-mcp` exists, so Claude can
drive `bpy` for decimation, LOD generation, baking and glTF export. Delivery then runs through gltf-transform or
gltfpack (meshopt + KTX2 in one step).

### Where the free rigs stand
Quaternius now publishes its own asset licence (updated Aug 2026). Our four GLBs predate it and were downloaded
under CC0; keep that record. No newer CC0 rigged dog, spider or snake of higher quality was found on Kenney,
KayKit, Poly Haven or Sketchfab/Fab.

## 3. Rendering: what to adopt and what to skip

### Adopt
1. **KTX2 textures.** ETC1S for albedo, roughness and AO; UASTC for normals. On Mali and Adreno these land as
   ETC2/ASTC: 4–8× less GPU texture memory, no main-thread decode, fewer context losses on 3–4 GB phones. Needs
   `KTX2Loader` plus the two basis transcoder files self-hosted under `assets/vendor/three/addons/libs/basis/`,
   added to the service-worker shell and the smoke test's lists. One loader instance, `detectSupport(renderer)`.
2. **meshopt, not Draco.** `EXT_meshopt_compression` decodes much faster than Draco and also compresses animation
   keyframes, which is most of a Quaternius GLB. `gltfpack -i in.glb -o out.glb -c -kn -km` keeps the node and
   material names our controllers look up. Expect 30–60 % smaller GLBs before gzip.
3. **Shrink the HDR.** PMREM output is 256² anyway; a 512×256 `.hdr` (or a gain-map JPEG via `@monogrid/gainmap-js`)
   turns 1.4 MB into 100–300 KB and shortens the first-frame PMREM pass.
4. **Low and mid tiers render straight to the canvas with MSAA, no composer.** Tile-based GPUs resolve MSAA in tile
   memory almost for free, while every full-resolution render-to-texture pass costs a tile write plus a read of a
   1080×2400 target. Today the low tier pays for the composer and gets no anti-aliasing at all. Tone mapping stays
   on `renderer.toneMapping`; the fear grade becomes a cheap final quad only where a composer still exists (high).
5. **Guard half-float.** `EffectComposer`, bloom, VSM shadows and PMREM default to `HalfFloatType`; some Android
   WebGL2 drivers lack `EXT_color_buffer_half_float` and the passes fail silently (three.js PR 33114). Check
   `renderer.extensions.has(...)` at boot and fall back to UnsignedByte or drop bloom/VSM. No guard exists today.
6. **Low-tier shadows.** A single 512–1024 `PCFShadowMap` from the fitted sun is affordable on Mali-G52 when the
   composer is gone; shadows are the cheapest "grounded" cue we currently deny the biggest audience.
7. **Rapier without the base64.** The non-compat Rapier build ships a separate `.wasm` (streaming-compiled, better
   compressed) instead of a 2 MB JS string that must be parsed; or defer physics until the first prop is touched.
8. **Precompute per-tier texture caps** (512 on low for the canvas-baked materials) and keep draw calls under ~120
   on low. `InstancedMesh` where many copies share one geometry; `BatchedMesh` only for many *different* static
   geometries sharing a material.

### Skip for now
- **WebGPURenderer.** Still labelled experimental in the r187 manual; 2025–26 reports show ~2× CPU cost and 5–10×
  slower first frame on many-mesh scenes; `EffectComposer`, `ShaderMaterial` and `onBeforeCompile` are unsupported,
  so the whole post chain would be rewritten in TSL. About a quarter of Android lacks the Vulkan 1.1 core WebGPU
  needs, and WebView only gained compatibility mode in 146 (Mar 2026). Re-evaluate in 2027.
- **Runtime ML** (texture super-resolution, behaviour models in ONNX/TF.js). The same four cores already run
  Rapier, skinning and audio.
- **A full three.js jump to r187 before launch.** Worth doing after release for the loader and PMREM
  improvements, but r160 → r187 touches colour management and addon paths; not a pre-launch change.

### Measuring on a real phone
No GPU timers on Android (`EXT_disjoint_timer_query_webgl2` is ~0.4 % available). Use `chrome://inspect`
remote DevTools, a histogram of rAF deltas plus `renderer.info` in the errlog ring buffer, and Spector.js or
Ispettore on desktop against the same page for draw-call audits.

## 4. Cafe Bazaar: hard requirements vs. our state

Official TWA page: https://developers.cafebazaar.ir/fa/guidelines/feature/trusted-web-application

| Requirement | Status |
| --- | --- |
| APK or AAB; `targetSdkVersion ≥ 32`; APK ≤ 150 MB; release key, stable package id | Bubblewrap defaults satisfy it; plain APK is simpler than Bazaar's offline Bundle Signer |
| `assetlinks.json` with the `android_app` statement **and** `cafebazaar_twa` / `check_validation` | Documented in docs/BAZAAR.md; must be live on the host before upload (validated automatically) |
| `DEFAULT_URL` meta-data in the manifest | Bubblewrap writes it |
| Persian name, short description ≤ 60 chars, full description, **support email** (mandatory); pricing is irreversible | Ready in docs/BAZAAR.md |
| Icon PNG 1:1, ≥ 512 px, no rounded corners; 1–12 screenshots ≤ 1 MB each | Ready in docs/store/ |
| Store name and icon identical to launcher name and icon | Set `launcherName` = فانوس‌به‌دست |
| Quality rule: no web-only delivery "without good reason"; app must open during review | Our defence is the TWA doc plus the offline shell; add a Persian "needs internet the first time" screen rather than a white page |
| Fear content: horror games must mention it in the description and are asked to seek an ESRA rating | Description already names the fears; **add one line that the game contains startle moments and is a practice game**. ESRA is optional today (doc updated 2026-09-28) but "ترس" is a rated axis; expect 7+ or 12+ |
| Deceptive-behaviour rule: describe weaknesses and hardware minimums | Add Chrome ≥ 72 / WebGL2 / 4 GB RAM guidance to the description |
| Permissions justified | POST_NOTIFICATIONS only for the opt-in reminder; explain it in the reviewer note (already drafted) |
| Review 1–3 working days; neutral rating prompts only; no links to other stores | Fine |

Market facts that shape the 3D budget: a 1 GB monthly plan costs ~20,000 toman (Feb 2026 tariffs), so the ~4.5 MB
first load of the dog realm is real money and the 755 KB physics bundle is the first thing to cut. Chrome is
installed on 63 %+ of Iranian Android and distributed through Bazaar itself; Chrome 109 still shows at 2.7 %, so
keep the WebGL2 feature check and the WebView fallback. Vercel, Netlify and Cloudflare are intermittently
unreachable from Iran; ArvanCloud or Iranserver object storage for the static site also counts as domestic
traffic on most plans (unverified per host).

## 5. Recommended order of work

1. **Low-tier rendering pass** (one or two days): direct-to-canvas MSAA, PCF sun shadow, half-float guard,
   512-px canvas textures. Test on a Galaxy A1x or Redmi 1x if one is available; otherwise force the tier.
2. **Delivery pass** (one day): meshopt + KTX2 on the four GLBs and six coat maps, 512×256 HDR, Rapier as a
   separate `.wasm`. Update the service-worker shell and the smoke test lists. Target: dog realm under 2.5 MB.
3. **Listing fixes** (an hour): the two description lines above, then the ESRA request through Pishkhan.
4. **Surface upgrade of the existing dogs** (two or three days, offline tools only): Real-ESRGAN 2× on the
   photo-baked coats, DeepBump normals, re-bake at 1024², then back through step 2.
5. **Only then** consider new creature meshes via Tripo (snake and spider auto-rig) or Hunyuan3D locally,
   with a Blender retopo and bake, and Cascadeur Pro for dog clips.

Steps 1–3 are pre-launch. Steps 4–5 are content work that can land in updates.

## Not verified
Vendor Iran policies (none publish a country list), Rodin and Hitem3D output licences, Fab's CC0 status, whether
Bazaar reviewers test offline or on phones without Chrome, ASTC-HDR support per GPU model, and the exact
WebView milestone for core WebGPU. Full source notes from the three research threads are kept with the session.

## Status, 2026-11-07: steps 1 and 2 landed

Done in this pass (verified in the preview on the forced low, medium and high tiers; `npm run smoke` in `scripts/`):

- **Low tier renders without a composer**: straight to an MSAA canvas, tone mapping in the material shaders. The
  fear grade there is the DOM vignette alone (no canvas CSS filter: the compositor would filter at device
  resolution). `src/3d/engine.js`, `src/3d/renderer.js`.
- **Shadows on the low tier**: `shadowMap` is on for every tier (PCF on low); the dog, spider and snake realms
  cast one 512 map from their key light, the shells stay receivers, and the governor still sheds it first.
- **Half-float guard**: `halfFloatTargetsOK(renderer)`; without the extension the composer runs on 8-bit buffers,
  bloom is dropped and VSM becomes PCFSoft instead of silently drawing nothing.
- **meshopt GLBs**: `gltfpack -c -kn -km -ke -ac -vpf -vtf` (keep names and extras, keep constant animation
  tracks so a clip still resets every bone, float positions and UVs so no node transform or texture transform
  sneaks in). Husky 765 → 456 KB, Shiba 728 → 433 KB, Spider 449 → 145 KB, Snake 217 → 60 KB. Decoder vendored at
  `assets/vendor/three/addons/libs/meshopt_decoder.module.js`.
- **Rapier split**: `scripts/split-rapier.cjs` turns the 2 MB base64 bundle into a 126 KB script plus
  `rapier.wasm` (520 KB gzipped against 755 KB). `physics.js` hands the wasm URL over as `__rapierWasmUrl`.
- **Sky**: `assets/env/meadow_512.hdr` (381 KB, `scripts/downsample-hdr.cjs`) lights the low tier; other tiers
  keep the 1k the snake meadow shows as its dome.
- **KTX2 coats**: `scripts/encode-coats-ktx2.cjs` (needs a native gltfpack, `GLTFPACK=`; the npm build has no
  Basis encoder) writes ETC1S `.ktx2` copies of the six coat maps with full mip chains; `loadDogCoatTextures`
  takes them below the high tier (`ktx2: true` in `DOG_COAT_MAPS`, `fobia.noKtx2=1` forces the JPEGs). A breed is
  ~530 KB on the wire against ~590 KB of JPEG at a quarter of the GPU memory; UASTC normals were 1.27 MB each and
  are opt-in (`--uastc-normal`). Orientation verified by rendering both textures and comparing pixels (direct
  5/255 apart, flipped 40/255).

Dog realm first visit, over the wire: three.js 166 KB + game JS ~770 KB + two dogs ~250 KB gzipped + coats
~530 KB + physics 545 KB when a prop is reached, down from ~4.5 MB.
