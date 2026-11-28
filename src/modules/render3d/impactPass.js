// Big hits kick the lens: a brief radial chromatic aberration (R out, B in,
// zero at the centre) plus a short radial blur, as a ShaderPass after the
// bloom. The same pass lays a fine film grain and a soft vignette over every
// frame when the quality preset allows them, and it ends in the tone curve
// and the sRGB step, so the output pass only runs on frames it does not
// (sceneSetup.js).
// The same pass bends space round the ship while the Gravity Brake is held
// (a lens: the band between LENS_INNER and its reach is pulled inward, red
// a little more than blue), and along a line while a Field trench holds
// (the Harmonic's, beamForms.js: the band each side of it pulled toward it,
// every colour alike, so the long seam shows no colour bars). ImpactKick
// holds the decaying strength, the lenses and the grain's per-frame seed
// (plain JS, so it runs in Node tests); createImpactPass builds the pass.

// proposta 17/10: peak values (subtle by design) and decay.
export const IMPACT_MAX_ABERRATION_PX = 3;
export const IMPACT_MAX_BLUR = 0.006; // fraction of the distance to centre
const IMPACT_DECAY_TIME = 0.045; // s, e-folding: under 2 % after 180 ms
const IMPACT_FLOOR = 0.02;
// proposta 18/10: grain amplitude (perceptual, ±) and the vignette's
// darkening at the corners. Both deliberately faint.
export const FILM_GRAIN = 0.025;
export const VIGNETTE = 0.3;
// proposta 17/11 (efeito/impacto, approved as a painted mock-up): the
// lens. The ship's own disc (× the reach) is left whole; the band beyond it
// is pulled in by up to the pull (× the reach) at its middle, from LENS_PULL[0]
// at the card's weakest slow (LENS_SLOW[0]) to LENS_PULL[1] at its strongest;
// red bends LENS_SPLIT more and blue as much less.
export const LENS_INNER = 0.2;
const LENS_PULL = [0.155, 0.21];
const LENS_SLOW = [0.2, 0.5];
const LENS_SPLIT = 0.1;
// The trench's line lens (approved 22/11 from the mock-up, at the Gravity
// Brake's strength): its own seam (× the reach) left whole, the pull fading
// out over the line's ends (× its half length).
export const TRENCH_PULL = 0.19;
const LINE_INNER = 0.08;
const LINE_ENDS = [0.8, 1.15];

/** The lens's pull for a Gravity Brake that slows by `slowFraction`. */
export function lensPull(slowFraction) {
  const t = Math.min(
    1,
    Math.max(0, (slowFraction - LENS_SLOW[0]) / (LENS_SLOW[1] - LENS_SLOW[0]))
  );
  return LENS_PULL[0] + (LENS_PULL[1] - LENS_PULL[0]) * t;
}

/**
 * GLSL for a pass that reads the composer's scene: `sceneAt(uv)` is the
 * scene plus the bloom's half-res result (`tBloom`, × `uBloom`: 1 on frames
 * the bloom ran), the sum UnrealBloomPass's own last draw would have left
 * in the scene target (premultiplied additive: its colour added as it is),
 * tone-mapped with three's Linear curve at `toneMappingExposure` (the scene
 * draws in linear HDR: three tone-maps only what it draws to the screen).
 * sceneSetup.js foldBloom, toneAtEnd.
 */
export const SCENE_READ = `
#include <tonemapping_pars_fragment>
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uBloom;
vec3 sceneAt(vec2 uv) {
  return LinearToneMapping(
    texture2D(tDiffuse, uv).rgb + uBloom * texture2D(tBloom, uv).rgb
  );
}`;

const IMPACT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: null },
    uAberration: { value: 0 },
    uBlur: { value: 0 },
    uGrain: { value: 0 },
    uSeed: { value: 0 },
    uVignette: { value: 0 },
    tBloom: { value: null },
    uBloom: { value: 0 },
    toneMappingExposure: { value: 1 },
    uLensAt: { value: null },
    uLensReach: { value: null },
    uLens: { value: 0 },
    uLineAt: { value: null },
    uLineDir: { value: null },
    uLineHalf: { value: 1 },
    uLineReach: { value: 1 },
    uLine: { value: 0 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
${SCENE_READ}
uniform vec2 uTexel;
uniform float uAberration;
uniform float uBlur;
uniform float uGrain;
uniform float uSeed;
uniform float uVignette;
uniform vec2 uLensAt;
uniform vec2 uLensReach;
uniform float uLens;
uniform vec2 uLineAt;
uniform vec2 uLineDir;
uniform float uLineHalf;
uniform float uLineReach;
uniform float uLine;
varying vec2 vUv;
// Where the trench's lens shows uv from: within its reach of the line (px),
// a point pulled toward it, across the line only.
vec2 lineUv(vec2 uv) {
  if (uLine <= 0.0) return uv;
  vec2 px = (uv - uLineAt) / uTexel;
  float a = dot(px, uLineDir);
  float b = dot(px, vec2(-uLineDir.y, uLineDir.x));
  float r = abs(b) / uLineReach;
  if (r >= 1.0 || r <= ${LINE_INNER.toFixed(2)}) return uv;
  float ends = 1.0 - smoothstep(uLineHalf * ${LINE_ENDS[0].toFixed(2)}, uLineHalf * ${LINE_ENDS[1].toFixed(2)}, abs(a));
  float band = (r - ${LINE_INNER.toFixed(2)}) / ${(1 - LINE_INNER).toFixed(2)};
  float pull = uLine * ends * sin(3.14159265 * band);
  return uv - vec2(-uLineDir.y, uLineDir.x) * sign(b) * pull * uLineReach * uTexel;
}
// Where the lens shows uv from: inside its band, a point pulled toward
// its centre (\`k\` scales the pull per colour).
vec2 lensUv(vec2 uv, float k) {
  if (uLens <= 0.0) return uv;
  vec2 d = (uv - uLensAt) / uLensReach;
  float r = length(d);
  if (r >= 1.0 || r <= ${LENS_INNER.toFixed(2)}) return uv;
  float band = (r - ${LENS_INNER.toFixed(2)}) / ${(1 - LENS_INNER).toFixed(2)};
  float pull = uLens * k * sin(3.14159265 * band);
  return uLensAt + d / r * (r - pull) * uLensReach;
}
float grainHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031 + uSeed);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
void main() {
  vec2 dir = vUv - 0.5;
  vec3 color;
  if (uAberration > 0.0 || uBlur > 0.0) {
    vec2 shift = dir * 2.0 * uAberration * uTexel;
    vec3 sum = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      vec2 uv = lineUv(vUv - dir * uBlur * float(i) / 5.0);
      sum.r += sceneAt(lensUv(uv, ${(1 + LENS_SPLIT).toFixed(2)}) + shift).r;
      sum.g += sceneAt(lensUv(uv, 1.0)).g;
      sum.b += sceneAt(lensUv(uv, ${(1 - LENS_SPLIT).toFixed(2)}) - shift).b;
    }
    color = sum / 6.0;
  } else if (uLens > 0.0 || uLine > 0.0) {
    vec2 uv = lineUv(vUv);
    color = vec3(
      sceneAt(lensUv(uv, ${(1 + LENS_SPLIT).toFixed(2)})).r,
      sceneAt(lensUv(uv, 1.0)).g,
      sceneAt(lensUv(uv, ${(1 - LENS_SPLIT).toFixed(2)})).b
    );
  } else {
    color = sceneAt(vUv);
  }
  // 0 at the centre, 1 in the corners
  color *= 1.0 - uVignette * smoothstep(0.25, 1.0, length(dir) * 1.4142);
  // grain in gamma space, so the darks do not get louder than the lights
  vec3 g = max(
    sqrt(max(color, 0.0)) + (grainHash(gl_FragCoord.xy) - 0.5) * 2.0 * uGrain,
    0.0
  );
  color = g * g;
  gl_FragColor = sRGBTransferOETF(vec4(color, 1.0));
}`,
};

export function createImpactPass(THREE) {
  const pass = new THREE.ShaderPass(IMPACT_SHADER);
  pass.uniforms.uTexel.value = new THREE.Vector2(1, 1);
  pass.uniforms.uLensAt.value = new THREE.Vector2(0.5, 0.5);
  pass.uniforms.uLensReach.value = new THREE.Vector2(0.1, 0.1);
  pass.uniforms.uLineAt.value = new THREE.Vector2(0.5, 0.5);
  pass.uniforms.uLineDir.value = new THREE.Vector2(1, 0);
  pass.enabled = false;
  return pass;
}

export class ImpactKick {
  constructor() {
    this.strength = 0;
    this.aberration = 0;
    this.blur = 0;
    this.frame = 0;
    // Reduce Flashing (Settings → Accessibility) sets it to 0.3
    this.scale = 1;
    // the Gravity Brake's lens, in screen uv: centre, reach (x, y), pull
    this.lensAt = [0.5, 0.5];
    this.lensReach = [0.1, 0.1];
    this.lensPull = 0;
    // the trench's line lens: centre (uv), direction (px), half length and
    // reach (px), pull
    this.lineAt = [0.5, 0.5];
    this.lineDir = [1, 0];
    this.lineHalf = 1;
    this.lineReach = 1;
    this.linePull = 0;
  }

  /** Bends space round (x, y) out to (rx, ry), screen uv; pull 0 is none. */
  lens(x, y, rx, ry, pull) {
    this.lensAt[0] = x;
    this.lensAt[1] = y;
    this.lensReach[0] = Math.max(1e-4, rx);
    this.lensReach[1] = Math.max(1e-4, ry);
    this.lensPull = pull;
  }

  /**
   * Bends space toward the line through (x, y) (screen uv) along (dx, dy),
   * `half` its half length and `reach` how far each side, render px; pull 0
   * is none.
   */
  line(x, y, dx, dy, half, reach, pull) {
    const length = Math.hypot(dx, dy) || 1;
    this.lineAt[0] = x;
    this.lineAt[1] = y;
    this.lineDir[0] = dx / length;
    this.lineDir[1] = dy / length;
    this.lineHalf = Math.max(1, half);
    this.lineReach = Math.max(1, reach);
    this.linePull = pull;
  }

  /** Spikes the kick to `strength` (0..1); never lowers a running one. */
  kick(strength) {
    this.strength = Math.max(this.strength, Math.min(1, strength) * this.scale);
  }

  /**
   * Decays and returns whether the pass should run. `allowed` is false when
   * post-processing is off or motion is reduced; `aberrationOn` follows the
   * chromatic-aberration setting.
   */
  update(dt, allowed, aberrationOn) {
    // the first frame after a kick shows its peak; the decay starts after
    const s = allowed ? this.strength : 0;
    this.aberration = aberrationOn ? IMPACT_MAX_ABERRATION_PX * s : 0;
    this.blur = IMPACT_MAX_BLUR * s;
    this.strength *= Math.exp(-dt / IMPACT_DECAY_TIME);
    if (this.strength < IMPACT_FLOOR) this.strength = 0;
    return s > 0;
  }

  /**
   * `active`: update()'s answer; `grain`: the preset's film grain and
   * vignette (with post-processing on). The pass runs for either.
   */
  apply(pass, width, height, active, grain = false) {
    pass.enabled = active || grain || this.lensPull > 0 || this.linePull > 0;
    if (!pass.enabled) return;
    const { uniforms } = pass;
    uniforms.uLine.value = this.linePull;
    uniforms.uLineAt.value.set(this.lineAt[0], this.lineAt[1]);
    uniforms.uLineDir.value.set(this.lineDir[0], this.lineDir[1]);
    uniforms.uLineHalf.value = this.lineHalf;
    uniforms.uLineReach.value = this.lineReach;
    uniforms.uLens.value = this.lensPull;
    uniforms.uLensAt.value.set(this.lensAt[0], this.lensAt[1]);
    uniforms.uLensReach.value.set(this.lensReach[0], this.lensReach[1]);
    uniforms.uTexel.value.set(1 / width, 1 / height);
    uniforms.uAberration.value = active ? this.aberration : 0;
    uniforms.uBlur.value = active ? this.blur : 0;
    uniforms.uGrain.value = grain ? FILM_GRAIN : 0;
    uniforms.uVignette.value = grain ? VIGNETTE : 0;
    // a new grain pattern every frame (golden-ratio steps never repeat)
    this.frame += 1;
    uniforms.uSeed.value = (this.frame * 0.618034) % 1;
  }
}
