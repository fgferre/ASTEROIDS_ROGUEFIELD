// Big hits kick the lens: a brief radial chromatic aberration (R out, B in,
// zero at the centre) plus a short radial blur, as a ShaderPass between the
// bloom and the sRGB output. ImpactKick holds the decaying strength (plain
// JS, so it runs in Node tests); createImpactPass builds the pass.

// proposta 17/10: peak values (subtle by design) and decay.
export const IMPACT_MAX_ABERRATION_PX = 3;
export const IMPACT_MAX_BLUR = 0.006; // fraction of the distance to centre
const IMPACT_DECAY_TIME = 0.045; // s, e-folding: under 2 % after 180 ms
const IMPACT_FLOOR = 0.02;

const IMPACT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: null },
    uAberration: { value: 0 },
    uBlur: { value: 0 },
  },
  vertexShader: `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
  fragmentShader: `
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
uniform float uAberration;
uniform float uBlur;
varying vec2 vUv;
void main() {
  vec2 dir = vUv - 0.5;
  vec2 shift = dir * 2.0 * uAberration * uTexel;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 6; i++) {
    vec2 uv = vUv - dir * uBlur * float(i) / 5.0;
    sum.r += texture2D(tDiffuse, uv + shift).r;
    sum.g += texture2D(tDiffuse, uv).g;
    sum.b += texture2D(tDiffuse, uv - shift).b;
  }
  gl_FragColor = vec4(sum / 6.0, 1.0);
}`,
};

export function createImpactPass(THREE) {
  const pass = new THREE.ShaderPass(IMPACT_SHADER);
  pass.uniforms.uTexel.value = new THREE.Vector2(1, 1);
  pass.enabled = false;
  return pass;
}

export class ImpactKick {
  constructor() {
    this.strength = 0;
    this.aberration = 0;
    this.blur = 0;
  }

  /** Spikes the kick to `strength` (0..1); never lowers a running one. */
  kick(strength) {
    this.strength = Math.max(this.strength, Math.min(1, strength));
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

  apply(pass, width, height, active) {
    pass.enabled = active;
    if (!active) return;
    const { uniforms } = pass;
    uniforms.uTexel.value.set(1 / width, 1 / height);
    uniforms.uAberration.value = this.aberration;
    uniforms.uBlur.value = this.blur;
  }
}
