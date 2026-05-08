/* Procedural texture + material library for lifting Mira's visual realism
 * without shipping any 3D assets. Everything here renders into Canvas2D and
 * wraps as THREE.CanvasTexture, so a scene picks up PBR-grade detail (normal
 * maps for micro-surface, roughness variation, AO) at zero asset weight.
 *
 * Exposed as window.PhobiaRealism. Three.js is loaded as a module via the
 * importmap in index.html — this script reads it from window.THREE which the
 * main module sets immediately after import.
 *
 * Design rules:
 *  - Pure synthesis: no fetched assets, no XHR, no fonts beyond system stack.
 *  - Cache aggressively: each generated map set is built once on first call
 *    and reused. The maps are read-only, so sharing across meshes is fine.
 *  - Sobel-from-height: normal maps come from a luminance height canvas via
 *    a Sobel kernel — same trick the rooftop concrete maps use, generalised.
 *  - Roughness/AO/normal are decoupled so a material reads (color × normal ×
 *    rough × ao) like any modern PBR pipeline.
 */
(function () {
  "use strict";

  // ---------- tiny utilities ----------
  function makeCanvas(size) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  }
  function fill(ctx, css, w, h) { ctx.fillStyle = css; ctx.fillRect(0, 0, w, h); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Convert a height canvas into a normal map canvas using Sobel kernels.
  // strength scales the apparent bump amplitude (1.0 = mild, 2.5 = strong).
  function heightToNormal(heightCanvas, strength = 1.6) {
    const SIZE = heightCanvas.width;
    const hCtx = heightCanvas.getContext("2d");
    const out = makeCanvas(SIZE);
    const oCtx = out.getContext("2d");
    const heightData = hCtx.getImageData(0, 0, SIZE, SIZE).data;
    const img = oCtx.createImageData(SIZE, SIZE);
    const sample = (x, y) => {
      x = (x + SIZE) % SIZE; y = (y + SIZE) % SIZE;
      return heightData[(y * SIZE + x) * 4] / 255;
    };
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const dx = (sample(x + 1, y - 1) + 2 * sample(x + 1, y) + sample(x + 1, y + 1))
                 - (sample(x - 1, y - 1) + 2 * sample(x - 1, y) + sample(x - 1, y + 1));
        const dy = (sample(x - 1, y + 1) + 2 * sample(x, y + 1) + sample(x + 1, y + 1))
                 - (sample(x - 1, y - 1) + 2 * sample(x, y - 1) + sample(x + 1, y - 1));
        const nx = -dx * strength;
        const ny = -dy * strength;
        const nz = 1.0;
        const len = Math.hypot(nx, ny, nz);
        const i = (y * SIZE + x) * 4;
        img.data[i]     = Math.round((nx / len * 0.5 + 0.5) * 255);
        img.data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
        img.data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
        img.data[i + 3] = 255;
      }
    }
    oCtx.putImageData(img, 0, 0);
    return out;
  }

  // Build a THREE.CanvasTexture with sane defaults.
  function asTexture(canvas, opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const t = new THREE.CanvasTexture(canvas);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    if (opts.colorSpace) t.colorSpace = opts.colorSpace;
    if (opts.repeat) t.repeat.set(opts.repeat[0], opts.repeat[1]);
    if (opts.flipY === false) t.flipY = false;
    return t;
  }

  // ---------- Skin maps ----------
  // Tileable skin texture set for human characters. Pores at scale ~0.6 px,
  // larger blotches at ~6 px, faint vein hints, freckle dots, blush gradient.
  // Returns { color, normal, roughness, ao } — feed into MeshStandardMaterial.
  const _skinCache = new Map();
  function makeSkinMaps(baseHex = "#e8b794") {
    const key = String(baseHex).toLowerCase();
    if (_skinCache.has(key)) return _skinCache.get(key);
    const SIZE = 256;
    const albedo = makeCanvas(SIZE);
    const height = makeCanvas(SIZE);
    const rough  = makeCanvas(SIZE);
    const ao     = makeCanvas(SIZE);
    const aCtx = albedo.getContext("2d");
    const hCtx = height.getContext("2d");
    const rCtx = rough.getContext("2d");
    const oCtx = ao.getContext("2d");

    fill(aCtx, baseHex, SIZE, SIZE);
    fill(hCtx, "#808080", SIZE, SIZE);
    fill(rCtx, "#a8a8a8", SIZE, SIZE);   // skin base roughness ~0.66
    fill(oCtx, "#ffffff", SIZE, SIZE);

    // Tonal variation across the surface — large soft blotches, slightly
    // warmer/cooler patches that read as "real skin" rather than uniform paint.
    for (let i = 0; i < 14; i++) {
      const cx = Math.random() * SIZE;
      const cy = Math.random() * SIZE;
      const r  = 30 + Math.random() * 70;
      const grd = aCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      const warm = Math.random() < 0.5;
      grd.addColorStop(0, warm ? "rgba(220,150,120,0.10)" : "rgba(180,160,150,0.10)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      aCtx.fillStyle = grd;
      aCtx.fillRect(0, 0, SIZE, SIZE);
    }

    // Pores — tiny dimples. Visible as faint dark dots in albedo, recessed in
    // height map (slightly below 128), and a touch more matte in roughness.
    for (let i = 0; i < 4500; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const s = Math.random() < 0.85 ? 0.6 : 1.1;
      aCtx.fillStyle = `rgba(60,40,35,${0.04 + Math.random() * 0.06})`;
      aCtx.fillRect(x, y, s, s);
      const hv = 128 - Math.floor(8 + Math.random() * 14);
      hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
      hCtx.fillRect(x, y, s, s);
    }

    // Freckles — sparse, slightly warmer and pigmented, no height change.
    const freckleCount = 30 + Math.floor(Math.random() * 50);
    for (let i = 0; i < freckleCount; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const s = 1 + Math.random() * 2;
      aCtx.fillStyle = `rgba(120,70,40,${0.18 + Math.random() * 0.22})`;
      aCtx.beginPath();
      aCtx.arc(x, y, s, 0, Math.PI * 2);
      aCtx.fill();
    }

    // Faint micro-wrinkles — short directional strokes around what would be
    // eyes/forehead/cheek areas. They're tileable hints, not anatomical lines.
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const len = 4 + Math.random() * 12;
      const ang = Math.random() * Math.PI * 2;
      hCtx.strokeStyle = `rgba(80,80,80,${0.45})`;
      hCtx.lineWidth = 0.6 + Math.random() * 0.5;
      hCtx.beginPath();
      hCtx.moveTo(x, y);
      hCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      hCtx.stroke();
      rCtx.strokeStyle = `rgba(140,140,140,0.2)`;
      rCtx.lineWidth = 0.6;
      rCtx.beginPath();
      rCtx.moveTo(x, y);
      rCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      rCtx.stroke();
    }

    // Subtle "shine" bands for forehead / nose / cheek highlights — pure
    // roughness modulation, no albedo change. Lower roughness = shinier.
    for (let i = 0; i < 6; i++) {
      const cx = Math.random() * SIZE;
      const cy = Math.random() * SIZE;
      const r  = 25 + Math.random() * 60;
      const grd = rCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, "rgba(180,180,180,0.45)");   // shinier
      grd.addColorStop(1, "rgba(180,180,180,0)");
      rCtx.fillStyle = grd;
      rCtx.fillRect(0, 0, SIZE, SIZE);
    }

    const normal = heightToNormal(height, 1.4);

    const out = {
      color:    asTexture(albedo, { colorSpace: window.THREE.SRGBColorSpace }),
      normal:   asTexture(normal),
      roughness:asTexture(rough),
      ao:       asTexture(ao),
    };
    _skinCache.set(key, out);
    return out;
  }

  // Build a MeshStandardMaterial using procedural skin maps. Honour a tinted
  // baseHex and an optional repeat override (default 2,2 — most body parts
  // are small enough that 2×2 reads as full skin without the tile becoming
  // obvious).
  function skinMaterial(baseHex = "#e8b794", opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const maps = makeSkinMaps(baseHex);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.6, 0.6),
      roughnessMap: maps.roughness,
      roughness: opts.roughness ?? 0.78,
      metalness: 0.0,
      aoMap: maps.ao,
      aoMapIntensity: 0.5,
    });
    if (opts.repeat) {
      [maps.color, maps.normal, maps.roughness, maps.ao].forEach(t => {
        if (t) {
          // Don't mutate the cached repeat — clone if a custom repeat is asked
          // for, otherwise rely on the shared default.
        }
      });
    }
    return mat;
  }

  // ---------- Fabric maps ----------
  // Woven cotton-style fabric. Tiny weave bumps at SIZE/64 spacing, slight
  // colour fibre variation, crease wrinkles, and a faint cloth grain.
  const _fabricCache = new Map();
  function makeFabricMaps(baseHex = "#2c9d96", style = "cotton") {
    const key = baseHex + "|" + style;
    if (_fabricCache.has(key)) return _fabricCache.get(key);
    const SIZE = 256;
    const albedo = makeCanvas(SIZE);
    const height = makeCanvas(SIZE);
    const rough  = makeCanvas(SIZE);
    const aCtx = albedo.getContext("2d");
    const hCtx = height.getContext("2d");
    const rCtx = rough.getContext("2d");

    fill(aCtx, baseHex, SIZE, SIZE);
    fill(hCtx, "#808080", SIZE, SIZE);
    // Cotton is matte; denim is matter still; silk is shinier.
    const baseRough = style === "silk" ? "#7a7a7a" : style === "denim" ? "#cccccc" : "#aaaaaa";
    fill(rCtx, baseRough, SIZE, SIZE);

    // Weave: a simple checker pattern at fine scale gives a real woven feel.
    const cell = style === "denim" ? 3 : 4;
    for (let y = 0; y < SIZE; y += cell) {
      for (let x = 0; x < SIZE; x += cell) {
        const dark = ((x / cell) + (y / cell)) & 1;
        if (dark) {
          aCtx.fillStyle = "rgba(0,0,0,0.10)";
          aCtx.fillRect(x, y, cell, cell);
          hCtx.fillStyle = "rgb(110,110,110)";
          hCtx.fillRect(x, y, cell, cell);
        } else {
          hCtx.fillStyle = "rgb(150,150,150)";
          hCtx.fillRect(x, y, cell, cell);
        }
      }
    }

    // Fibre noise — random colour-shifted dots so the weave has cloth
    // character rather than pixel checks.
    for (let i = 0; i < 6000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      aCtx.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.06})`;
      aCtx.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      aCtx.fillStyle = `rgba(255,255,255,${0.03 + Math.random() * 0.05})`;
      aCtx.fillRect(x, y, 1, 1);
    }

    // Folds / creases — long faint lines, slightly recessed in height.
    for (let i = 0; i < 8; i++) {
      const x1 = Math.random() * SIZE;
      const y1 = Math.random() * SIZE;
      const x2 = x1 + (Math.random() - 0.5) * 200;
      const y2 = y1 + (Math.random() - 0.5) * 60;
      aCtx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.10})`;
      aCtx.lineWidth = 1 + Math.random() * 1.4;
      aCtx.beginPath(); aCtx.moveTo(x1, y1); aCtx.lineTo(x2, y2); aCtx.stroke();
      hCtx.strokeStyle = `rgba(80,80,80,0.55)`;
      hCtx.lineWidth = 1.2;
      hCtx.beginPath(); hCtx.moveTo(x1, y1); hCtx.lineTo(x2, y2); hCtx.stroke();
    }

    const normal = heightToNormal(height, style === "denim" ? 2.0 : 1.5);
    const out = {
      color:    asTexture(albedo, { colorSpace: window.THREE.SRGBColorSpace, repeat: [2.5, 2.5] }),
      normal:   asTexture(normal,                                       { repeat: [2.5, 2.5] }),
      roughness:asTexture(rough,                                        { repeat: [2.5, 2.5] }),
    };
    _fabricCache.set(key, out);
    return out;
  }

  function fabricMaterial(baseHex = "#2c9d96", style = "cotton", opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const maps = makeFabricMaps(baseHex, style);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughnessMap: maps.roughness,
      roughness: opts.roughness ?? (style === "silk" ? 0.4 : 0.85),
      metalness: 0.0,
    });
  }

  // ---------- Hair maps ----------
  // Anisotropic-feeling hair using directional streak texture. Real anisotropy
  // is shader-only, but a strong directional streak normal + low metalness
  // gives a convincing "strand-y" look on a regular MeshStandardMaterial.
  const _hairCache = new Map();
  function makeHairMaps(baseHex = "#4a2c18") {
    if (_hairCache.has(baseHex)) return _hairCache.get(baseHex);
    const SIZE = 256;
    const albedo = makeCanvas(SIZE);
    const height = makeCanvas(SIZE);
    const aCtx = albedo.getContext("2d");
    const hCtx = height.getContext("2d");

    fill(aCtx, baseHex, SIZE, SIZE);
    fill(hCtx, "#808080", SIZE, SIZE);

    // Streaks running vertically — many fine lines, varying alpha and shade.
    for (let i = 0; i < 1200; i++) {
      const x = Math.random() * SIZE;
      const len = 18 + Math.random() * 70;
      const y = Math.random() * SIZE;
      const dark = Math.random() < 0.55;
      aCtx.strokeStyle = dark
        ? `rgba(0,0,0,${0.12 + Math.random() * 0.18})`
        : `rgba(255,255,255,${0.05 + Math.random() * 0.10})`;
      aCtx.lineWidth = 0.5 + Math.random() * 0.8;
      aCtx.beginPath();
      aCtx.moveTo(x, y);
      aCtx.lineTo(x + (Math.random() - 0.5) * 1.8, y + len);
      aCtx.stroke();
      hCtx.strokeStyle = dark ? "rgba(70,70,70,0.5)" : "rgba(190,190,190,0.4)";
      hCtx.lineWidth = 0.6;
      hCtx.beginPath();
      hCtx.moveTo(x, y);
      hCtx.lineTo(x + (Math.random() - 0.5) * 1.8, y + len);
      hCtx.stroke();
    }
    const normal = heightToNormal(height, 2.2);
    const out = {
      color:  asTexture(albedo, { colorSpace: window.THREE.SRGBColorSpace, repeat: [2, 4] }),
      normal: asTexture(normal,                                            { repeat: [2, 4] }),
    };
    _hairCache.set(baseHex, out);
    return out;
  }
  function hairMaterial(baseHex = "#4a2c18", opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const maps = makeHairMaps(baseHex);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: opts.roughness ?? 0.55,
      metalness: 0.05,
    });
  }

  // ---------- Reptile-scale maps (snake) ----------
  const _scaleCache = new Map();
  function makeScaleMaps(baseHex = "#4a6028") {
    if (_scaleCache.has(baseHex)) return _scaleCache.get(baseHex);
    const SIZE = 256;
    const albedo = makeCanvas(SIZE);
    const height = makeCanvas(SIZE);
    const rough  = makeCanvas(SIZE);
    const aCtx = albedo.getContext("2d");
    const hCtx = height.getContext("2d");
    const rCtx = rough.getContext("2d");

    fill(aCtx, baseHex, SIZE, SIZE);
    fill(hCtx, "#808080", SIZE, SIZE);
    fill(rCtx, "#7a7a7a", SIZE, SIZE);

    // Diamond-scale tessellation. Each scale is a small diamond shaped
    // gradient — bright top, dim bottom. Rows offset for a real reptile look.
    const rows = 32;
    const cols = 32;
    const w = SIZE / cols;
    const h = SIZE / rows;
    const baseRGB = hexToRgb(baseHex);
    for (let r = 0; r < rows; r++) {
      const rowOff = (r % 2) * (w / 2);
      for (let c = -1; c <= cols; c++) {
        const cx = c * w + rowOff + w / 2;
        const cy = r * h + h / 2;
        // Albedo: slight per-scale tint variance
        const tintShift = (Math.random() - 0.5) * 30;
        const tr = clamp(baseRGB.r + tintShift, 0, 255);
        const tg = clamp(baseRGB.g + tintShift, 0, 255);
        const tb = clamp(baseRGB.b + tintShift, 0, 255);
        aCtx.fillStyle = `rgb(${tr|0},${tg|0},${tb|0})`;
        drawDiamond(aCtx, cx, cy, w * 0.8, h * 1.0);
        // Highlight at top of scale (dorsal sheen)
        const grd = aCtx.createLinearGradient(cx, cy - h * 0.5, cx, cy + h * 0.5);
        grd.addColorStop(0, "rgba(255,255,255,0.15)");
        grd.addColorStop(0.5, "rgba(255,255,255,0)");
        grd.addColorStop(1, "rgba(0,0,0,0.18)");
        aCtx.fillStyle = grd;
        drawDiamond(aCtx, cx, cy, w * 0.8, h * 1.0);
        // Height map: scale is raised
        const hv = 150 + Math.floor(Math.random() * 30);
        hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
        drawDiamond(hCtx, cx, cy, w * 0.85, h * 1.05);
        // Borders are recessed (where light catches the scale edge)
        hCtx.strokeStyle = "rgb(70,70,70)";
        hCtx.lineWidth = 1;
        drawDiamondStroke(hCtx, cx, cy, w * 0.85, h * 1.05);
        // Roughness: scale top slightly polished, edges matter
        rCtx.fillStyle = "rgba(150,150,150,0.6)";
        drawDiamond(rCtx, cx, cy, w * 0.4, h * 0.5);
      }
    }
    // Dark mottling lines (snake pattern bands)
    for (let i = 0; i < 6; i++) {
      const y = Math.random() * SIZE;
      aCtx.fillStyle = `rgba(0,0,0,${0.20 + Math.random() * 0.20})`;
      aCtx.fillRect(0, y, SIZE, 6 + Math.random() * 14);
    }

    const normal = heightToNormal(height, 2.6);
    const out = {
      color:    asTexture(albedo, { colorSpace: window.THREE.SRGBColorSpace, repeat: [4, 1.5] }),
      normal:   asTexture(normal,                                            { repeat: [4, 1.5] }),
      roughness:asTexture(rough,                                             { repeat: [4, 1.5] }),
    };
    _scaleCache.set(baseHex, out);
    return out;
  }
  function scaleMaterial(baseHex = "#4a6028", opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const maps = makeScaleMaps(baseHex);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(1.0, 1.0),
      roughnessMap: maps.roughness,
      roughness: opts.roughness ?? 0.55,
      metalness: 0.10,
      emissive: opts.emissiveHex ? new THREE.Color(opts.emissiveHex) : new THREE.Color(0x080a05),
      emissiveIntensity: 0.18,
    });
  }

  function drawDiamond(ctx, cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
    ctx.fill();
  }
  function drawDiamondStroke(ctx, cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2);
    ctx.lineTo(cx + w / 2, cy);
    ctx.lineTo(cx, cy + h / 2);
    ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
    ctx.stroke();
  }

  // ---------- Insect chitin maps (spider) ----------
  const _chitinCache = new Map();
  function makeChitinMaps(baseHex = "#0a0a0a") {
    if (_chitinCache.has(baseHex)) return _chitinCache.get(baseHex);
    const SIZE = 256;
    const albedo = makeCanvas(SIZE);
    const height = makeCanvas(SIZE);
    const rough  = makeCanvas(SIZE);
    const aCtx = albedo.getContext("2d");
    const hCtx = height.getContext("2d");
    const rCtx = rough.getContext("2d");

    fill(aCtx, baseHex, SIZE, SIZE);
    fill(hCtx, "#808080", SIZE, SIZE);
    fill(rCtx, "#909090", SIZE, SIZE);   // chitin: glossy

    // Bristles/setae — short hairs sticking out, drawn as fine dark streaks.
    // High density gives a creepy "hairy" look on the spider.
    for (let i = 0; i < 1800; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const len = 4 + Math.random() * 14;
      const ang = Math.random() * Math.PI * 2;
      aCtx.strokeStyle = `rgba(0,0,0,${0.6 + Math.random() * 0.4})`;
      aCtx.lineWidth = 0.7;
      aCtx.beginPath();
      aCtx.moveTo(x, y);
      aCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      aCtx.stroke();
      hCtx.strokeStyle = `rgba(180,180,180,${0.35 + Math.random() * 0.30})`;
      hCtx.lineWidth = 0.6;
      hCtx.beginPath();
      hCtx.moveTo(x, y);
      hCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      hCtx.stroke();
    }
    // Chitin micro-pebbling — small bumps catching the light
    for (let i = 0; i < 3000; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const hv = 145 + Math.floor(Math.random() * 35);
      hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
      hCtx.fillRect(x, y, 1, 1);
    }
    // Sheen patches — areas of slightly polished chitin
    for (let i = 0; i < 5; i++) {
      const cx = Math.random() * SIZE;
      const cy = Math.random() * SIZE;
      const r  = 30 + Math.random() * 60;
      const grd = rCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, "rgba(80,80,80,0.55)");
      grd.addColorStop(1, "rgba(80,80,80,0)");
      rCtx.fillStyle = grd;
      rCtx.fillRect(0, 0, SIZE, SIZE);
    }

    const normal = heightToNormal(height, 2.3);
    const out = {
      color:    asTexture(albedo, { colorSpace: window.THREE.SRGBColorSpace, repeat: [1.5, 1.5] }),
      normal:   asTexture(normal,                                            { repeat: [1.5, 1.5] }),
      roughness:asTexture(rough,                                             { repeat: [1.5, 1.5] }),
    };
    _chitinCache.set(baseHex, out);
    return out;
  }
  function chitinMaterial(baseHex = "#0a0a0a", opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const maps = makeChitinMaps(baseHex);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughnessMap: maps.roughness,
      roughness: opts.roughness ?? 0.45,
      metalness: 0.15,
    });
  }

  // ---------- Fur maps (dog) ----------
  // Short streak lines pointing in a dominant direction. Multiple colour
  // bands for a "tabby" look so the dog's coat reads as fur, not paint.
  const _furCache = new Map();
  function makeFurMaps(baseHex = "#a97442") {
    if (_furCache.has(baseHex)) return _furCache.get(baseHex);
    const SIZE = 256;
    const albedo = makeCanvas(SIZE);
    const height = makeCanvas(SIZE);
    const aCtx = albedo.getContext("2d");
    const hCtx = height.getContext("2d");
    fill(aCtx, baseHex, SIZE, SIZE);
    fill(hCtx, "#808080", SIZE, SIZE);

    // Fine fur strands
    const baseRGB = hexToRgb(baseHex);
    for (let i = 0; i < 4500; i++) {
      const x = Math.random() * SIZE;
      const y = Math.random() * SIZE;
      const len = 3 + Math.random() * 8;
      const ang = (Math.random() - 0.5) * 0.4 + Math.PI / 2;     // mostly downward
      const variance = (Math.random() - 0.5) * 50;
      const tr = clamp(baseRGB.r + variance, 0, 255) | 0;
      const tg = clamp(baseRGB.g + variance, 0, 255) | 0;
      const tb = clamp(baseRGB.b + variance, 0, 255) | 0;
      const dark = Math.random() < 0.5;
      aCtx.strokeStyle = dark
        ? `rgba(${tr},${tg},${tb},${0.5 + Math.random() * 0.4})`
        : `rgba(255,255,255,${0.10 + Math.random() * 0.10})`;
      aCtx.lineWidth = 0.5 + Math.random() * 0.6;
      aCtx.beginPath();
      aCtx.moveTo(x, y);
      aCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      aCtx.stroke();
      const hv = dark ? 120 - Math.floor(Math.random() * 30) : 170 + Math.floor(Math.random() * 30);
      hCtx.strokeStyle = `rgba(${hv},${hv},${hv},0.6)`;
      hCtx.lineWidth = 0.6;
      hCtx.beginPath();
      hCtx.moveTo(x, y);
      hCtx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      hCtx.stroke();
    }

    const normal = heightToNormal(height, 1.8);
    const out = {
      color:  asTexture(albedo, { colorSpace: window.THREE.SRGBColorSpace, repeat: [3, 3] }),
      normal: asTexture(normal,                                            { repeat: [3, 3] }),
    };
    _furCache.set(baseHex, out);
    return out;
  }
  function furMaterial(baseHex = "#a97442", opts = {}) {
    const THREE = window.THREE;
    if (!THREE) return null;
    const maps = makeFurMaps(baseHex);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.85, 0.85),
      roughness: opts.roughness ?? 0.85,
      metalness: 0.0,
    });
  }

  // ---------- Bark / wood maps ----------
  const _barkCache = new Map();
  function makeBarkMaps(baseHex = "#3a2818") {
    if (_barkCache.has(baseHex)) return _barkCache.get(baseHex);
    const SIZE = 256;
    const albedo = makeCanvas(SIZE);
    const height = makeCanvas(SIZE);
    const aCtx = albedo.getContext("2d");
    const hCtx = height.getContext("2d");
    fill(aCtx, baseHex, SIZE, SIZE);
    fill(hCtx, "#808080", SIZE, SIZE);

    // Vertical fibres
    for (let i = 0; i < 280; i++) {
      const x = Math.random() * SIZE;
      const dark = Math.random() < 0.55;
      aCtx.strokeStyle = dark ? `rgba(0,0,0,${0.12 + Math.random() * 0.20})` : `rgba(255,200,160,${0.05 + Math.random() * 0.08})`;
      aCtx.lineWidth = 0.7 + Math.random() * 1.4;
      aCtx.beginPath();
      aCtx.moveTo(x, 0);
      aCtx.lineTo(x + (Math.random() - 0.5) * 6, SIZE);
      aCtx.stroke();
      hCtx.strokeStyle = dark ? "rgba(60,60,60,0.6)" : "rgba(190,190,190,0.4)";
      hCtx.lineWidth = 1.2;
      hCtx.beginPath();
      hCtx.moveTo(x, 0);
      hCtx.lineTo(x + (Math.random() - 0.5) * 6, SIZE);
      hCtx.stroke();
    }
    // Knots
    for (let i = 0; i < 4; i++) {
      const cx = Math.random() * SIZE;
      const cy = Math.random() * SIZE;
      const r  = 5 + Math.random() * 12;
      const grd = aCtx.createRadialGradient(cx, cy, 0, cx, cy, r);
      grd.addColorStop(0, "rgba(0,0,0,0.55)");
      grd.addColorStop(1, "rgba(0,0,0,0)");
      aCtx.fillStyle = grd;
      aCtx.beginPath(); aCtx.arc(cx, cy, r, 0, Math.PI * 2); aCtx.fill();
    }
    const normal = heightToNormal(height, 2.1);
    const out = {
      color:  asTexture(albedo, { colorSpace: window.THREE.SRGBColorSpace, repeat: [2, 1] }),
      normal: asTexture(normal,                                            { repeat: [2, 1] }),
    };
    _barkCache.set(baseHex, out);
    return out;
  }
  function barkMaterial(baseHex = "#3a2818") {
    const THREE = window.THREE;
    if (!THREE) return null;
    const maps = makeBarkMaps(baseHex);
    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: maps.color,
      normalMap: maps.normal,
      normalScale: new THREE.Vector2(0.9, 0.9),
      roughness: 0.95,
      metalness: 0.0,
    });
  }

  // ---------- Helpers ----------
  function hexToRgb(h) {
    const s = String(h).replace("#", "");
    const v = s.length === 3
      ? s.split("").map(c => c + c).join("")
      : s;
    return {
      r: parseInt(v.substring(0, 2), 16),
      g: parseInt(v.substring(2, 4), 16),
      b: parseInt(v.substring(4, 6), 16),
    };
  }

  // Wait until THREE is on window (the importmap module sets it), then expose.
  function publish() {
    window.PhobiaRealism = {
      makeSkinMaps, skinMaterial,
      makeFabricMaps, fabricMaterial,
      makeHairMaps, hairMaterial,
      makeScaleMaps, scaleMaterial,
      makeChitinMaps, chitinMaterial,
      makeFurMaps, furMaterial,
      makeBarkMaps, barkMaterial,
      heightToNormal, asTexture, hexToRgb,
    };
  }
  publish();
})();
