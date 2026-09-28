// Ship-size copies of the baked dog coat maps. The bakers write lossless
// 1K PNGs (~2 MB each); the game loads these JPEGs instead. Re-run after any
// re-bake: `npm run compress-textures` (bake-all chains it).
const sharp = require("sharp");
const path = require("path");
const DIR = path.join(__dirname, "..", "assets", "models", "textures");
const JOBS = [
  // [source png, quality, chroma]. Normals take 4:2:0: the fur structure
  // rides in luma, and on a dog that fills a fraction of the screen the
  // half-res XY is invisible — 362 KB instead of 948 KB each.
  ["shiba_photo_albedo", 86, "4:4:4"], ["husky_photo_albedo", 86, "4:4:4"],
  ["shiba_photo_normal", 88, "4:2:0"], ["husky_photo_normal", 88, "4:2:0"],
  ["shiba_photo_roughness", 88, "4:4:4"], ["husky_photo_roughness", 88, "4:4:4"],
];
(async () => {
  for (const [name, q, cs] of JOBS) {
    const src = path.join(DIR, name + ".png"), dst = path.join(DIR, name + ".jpg");
    const info = await sharp(src).jpeg({ quality: q, mozjpeg: true, chromaSubsampling: cs }).toFile(dst);
    console.log(name.padEnd(24), Math.round(info.size / 1024) + " KB");
  }
})().catch((e) => { console.error(e); process.exit(1); });
