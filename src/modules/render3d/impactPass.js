// Big hits kick the lens: a brief radial chromatic aberration (R out, B in,
// zero at the centre) plus a short radial blur, as a ShaderPass after the
// bloom. The same pass lays a fine film grain and a soft vignette over every
// frame when the quality preset allows them, and it ends in the sRGB step,
// so the output pass only runs on frames it does not (sceneSetup.js).
// The same pass bends space round the ship while the Gravity Brake is held
// (a lens: the band between LENS_INNER and its reach is pulled inward, red
// a little more than blue). ImpactKick holds the decaying strength, the
// lens and the grain's per-frame seed (plain JS, so it runs in Node tests);
// createImpactPass builds the pass.

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
 * in the scene target (additive, × its alpha). sceneSetup.js foldBloom.
 */
export const SCENE_READ = `
uniform sampler2D tDiffuse;
uniform sampler2D tBloom;
uniform float uBloom;
vec3 sceneAt(vec2 uv) {
  vec4 bloom = texture2D(tBloom, uv);
  return texture2D(tDiffuse, uv).rgb + uBloom * bloom.a * bloom.rgb;
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
    uLensAt: { value: null },
    uLensReach: { value: null },
    uLens: { value: 0 },
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
varying vec2 vUv;
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
      vec2 uv = vUv - dir * uBlur * float(i) / 5.0;
      sum.r += sceneAt(lensUv(uv, ${(1 + LENS_SPLIT).toFixed(2)}) + shift).r;
      sum.g += sceneAt(lensUv(uv, 1.0)).g;
      sum.b += sceneAt(lensUv(uv, ${(1 - LENS_SPLIT).toFixed(2)}) - shift).b;
    }
    color = sum / 6.0;
  } else if (uLens > 0.0) {
    color = vec3(
      sceneAt(lensUv(vUv, ${(1 + LENS_SPLIT).toFixed(2)})).r,
      sceneAt(lensUv(vUv, 1.0)).g,
      sceneAt(lensUv(vUv, ${(1 - LENS_SPLIT).toFixed(2)})).b
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
  gl_FragColor = LinearTosRGB(vec4(color, 1.0));
}`,
};

export function createImpactPass(THREE) {
  const pass = new THREE.ShaderPass(IMPACT_SHADER);
  pass.uniforms.uTexel.value = new THREE.Vector2(1, 1);
  pass.uniforms.uLensAt.value = new THREE.Vector2(0.5, 0.5);
  pass.uniforms.uLensReach.value = new THREE.Vector2(0.1, 0.1);
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
  }

  /** Bends space round (x, y) out to (rx, ry), screen uv; pull 0 is none. */
  lens(x, y, rx, ry, pull) {
    this.lensAt[0] = x;
    this.lensAt[1] = y;
    this.lensReach[0] = Math.max(1e-4, rx);
    this.lensReach[1] = Math.max(1e-4, ry);
    this.lensPull = pull;
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
    pass.enabled = active || grain || this.lensPull > 0;
    if (!pass.enabled) return;
    const { uniforms } = pass;
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
