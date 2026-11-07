// Split the self-hosted rapier3d-compat bundle into JS + a real .wasm file.
// The compat build inlines its 1.44 MB WASM as a 1.92 MB base64 string the
// phone has to download, parse as JS text and decode before a single body
// exists; a separate .wasm compresses better (~550 KB vs ~755 KB gzipped for
// the whole bundle), skips the decode and lets the browser compile it off
// the main thread. The JS is imported through a blob URL (see physics.js),
// so the wasm's address comes from globalThis.__rapierWasmUrl.
//
//   node scripts/split-rapier.cjs            # rewrites assets/vendor/rapier/rapier.es.js in place
//   node scripts/split-rapier.cjs --check    # only report
"use strict";
const fs = require("fs");
const path = require("path");
const DIR = path.join(__dirname, "..", "assets", "vendor", "rapier");
const JS = path.join(DIR, "rapier.es.js");
const WASM = path.join(DIR, "rapier.wasm");
const check = process.argv.includes("--check");

const src = fs.readFileSync(JS, "utf8");
if (src.includes("__rapierWasmUrl")) { console.log("already split"); process.exit(0); }
const re = /fI\.toByteArray\("(AGFzbQ[A-Za-z0-9+/=]+)"\)\.buffer/;
const m = re.exec(src);
if (!m) throw new Error("embedded wasm not found (bundle layout changed?)");
const bytes = Buffer.from(m[1], "base64");
if (bytes.readUInt32LE(0) !== 0x6d736100) throw new Error("decoded bytes are not a wasm module");
const fetchExpr =
  '(yield fetch(globalThis.__rapierWasmUrl||"rapier.wasm")' +
  '.then((r)=>{if(!r.ok)throw new Error("rapier.wasm "+r.status);return r.arrayBuffer()}))';
const out = src.replace(re, fetchExpr);
console.log(`js ${(src.length / 1024).toFixed(0)} KB → ${(out.length / 1024).toFixed(0)} KB, wasm ${(bytes.length / 1024).toFixed(0)} KB`);
if (check) process.exit(0);
fs.writeFileSync(WASM, bytes);
fs.writeFileSync(JS, out);
console.log("wrote", WASM, "and rewrote", JS);
