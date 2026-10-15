// The fear grade: the in-render desaturate / contrast / vignette pass and the
// fused output-grade pass.

import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

// In-render fear grade. Runs AFTER OutputPass, so it operates on
// display-referred sRGB — every constant below is tuned for that space (moving
// it earlier in the chain would roughly double the perceived strength of the
// black crush and vignette). CSS filters can approximate the desaturation but
// cannot do black crush, edge-weighted chromatic pull, or a vignette that
// throbs with the heartbeat — which is why scenes opt into this pass; the CSS
// pipeline survives only for scenes that don't (the place realms).
// The grade itself, shared by the stand-alone pass and the fused output pass
// below so the two can never drift apart. `col` is display-referred sRGB.
const FEAR_GRADE_GLSL = `
  uniform float uFear; uniform float uBeat;
  // Radial chromatic pull, edge-weighted, grows with fear + heartbeat
  float fearCA(float r) { return (0.0038 * uFear + 0.0022 * uBeat) * smoothstep(0.15, 0.75, r); }
  vec3 fearGrade(vec3 col, float r) {
    float lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(lum), uFear * 0.30);                    // desaturate
    col = (col - 0.5) * (1.0 + uFear * 0.18) + 0.5;             // contrast
    col = max(col - uFear * 0.035, 0.0);                        // black crush
    col *= mix(vec3(1.0), vec3(0.93, 0.97, 1.06), uFear * 0.55); // cold pull
    // Film vignette: tightens with fear, throbs on the heartbeat. At fear 0
    // the corner term (~0.17) replaces the static .vignette overlay div.
    float vr = r * (1.35 + uFear * 0.50 + uBeat * 0.25);
    float vig = smoothstep(0.68, 1.18, vr);
    return col * (1.0 - vig * (0.30 + uFear * 0.50));
  }`;
const FearGradeShader = {
  uniforms: { tDiffuse: { value: null }, uFear: { value: 0 }, uBeat: { value: 0 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; varying vec2 vUv;
    ${FEAR_GRADE_GLSL}
    void main() {
      vec2 c = vUv - 0.5; float r = length(c);
      float ca = fearCA(r);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ca).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ca).b;
      gl_FragColor = vec4(fearGrade(col, r), 1.0);
    }`
};

// OutputPass (tone map + sRGB) with the fear grade fused on the end: one
// full-resolution read/write instead of two, for whenever SMAA is not in the
// chain between them (medium tier always; high tier at DPR ≥ 1.75). Measured
// 0.4–0.5 ms saved at DPR 2 in the dog room (M4, paired A/B). Output matches
// the two-pass chain to 1/255 at fear 0; with fear up, 0.4 % of channels
// differ by more than 2/255, all in the chromatic fringe on hard edges. The chromatic pull samples the
// scene-referred buffer, so each tap is tone-mapped before its channel is
// taken — same result as grading the OutputPass image, three ACES evaluations
// per pixel instead of one texture round trip. Shares uFear/uBeat objects with
// `src` so the per-frame writes to gradePass drive both.
const OUTPUT_GRADE_FRAG = `
  precision highp float;
  uniform sampler2D tDiffuse;
  #include <tonemapping_pars_fragment>
  #include <colorspace_pars_fragment>
  varying vec2 vUv;
  ${FEAR_GRADE_GLSL}
  vec3 toDisplay(vec3 c) {
    #ifdef LINEAR_TONE_MAPPING
      c = LinearToneMapping(c);
    #elif defined( REINHARD_TONE_MAPPING )
      c = ReinhardToneMapping(c);
    #elif defined( CINEON_TONE_MAPPING )
      c = OptimizedCineonToneMapping(c);
    #elif defined( ACES_FILMIC_TONE_MAPPING )
      c = ACESFilmicToneMapping(c);
    #elif defined( AGX_TONE_MAPPING )
      c = AgXToneMapping(c);
    #endif
    #ifdef SRGB_TRANSFER
      c = sRGBTransferOETF(vec4(c, 1.0)).rgb;
    #endif
    return c;
  }
  void main() {
    vec2 c = vUv - 0.5; float r = length(c);
    float ca = fearCA(r);
    vec3 col = toDisplay(texture2D(tDiffuse, vUv).rgb);
    if (ca > 1e-5) {
      col.r = toDisplay(texture2D(tDiffuse, vUv + c * ca).rgb).r;
      col.b = toDisplay(texture2D(tDiffuse, vUv - c * ca).rgb).b;
    }
    gl_FragColor = vec4(fearGrade(col, r), 1.0);
  }`;
function makeOutputGradePass(src) {
  const p = new OutputPass();
  p.uniforms.uFear = src.uniforms.uFear;
  p.uniforms.uBeat = src.uniforms.uBeat;
  p.material.fragmentShader = OUTPUT_GRADE_FRAG;
  p.material.needsUpdate = true;
  return p;
}

export { FearGradeShader, makeOutputGradePass };
