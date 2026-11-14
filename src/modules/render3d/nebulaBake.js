// The nebula's baked layers (spaceField.js): the noise they share, the
// shaders that bake the far and mid structure into maps over their planes,
// and the mid bands' keys, baked anew as the bands drift.

export const NOISE = `
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i), f), dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
      dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}
float fbm3(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}`;

// A full-target quad whose texel at uv holds the plane's world point (x, z)
// uSize across, centred on uOrigin.
export const FAR_BAKE_VERTEX = `
uniform vec2 uOrigin;
uniform float uSize;
varying vec2 vPos;
void main() {
  vPos = uOrigin + vec2(uv.x - 0.5, 0.5 - uv.y) * uSize;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// The far nebula's bake (once, into a render target over the far plane's
// footprint): gradient-noise fbm, domain-warped twice: a very low-frequency
// mask keeps most of the sky black and gathers the gas into a few regions;
// inside them broad clouds (r, stored before squaring so the dark end keeps
// its precision in 8 bits) and thin filaments (g).
export const FAR_BAKE_FRAGMENT = `
uniform float uScale;
varying vec2 vPos;
${NOISE}
void main() {
  vec2 p = vPos / uScale;
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2)), fbm(p + 3.0 * q + vec2(8.3, 2.8)));
  float n = fbm(p * 1.4 + 2.5 * r);
  float region = smoothstep(-0.05, 0.3, fbm(p * 0.45 + vec2(3.1, 7.7)));
  float cloud = smoothstep(-0.05, 0.45, n) * region;
  float filament = 1.0 - smoothstep(0.0, 0.035, abs(fbm(p * 2.2 + 2.0 * r + 7.3)));
  float veins = filament * smoothstep(0.0, 0.3, n) * region;
  gl_FragColor = vec4(cloud, veins, 0.0, 1.0);
}`;

// Mid bands: a warped, sideways-stretched fbm at the space time uTime,
// stored before it is shaped into a band (the plane does that, so the
// band's edge stays exact between texels).
export const MID_BAKE_FRAGMENT = `
uniform float uTime;
uniform float uScale;
uniform float uDrift;
varying vec2 vPos;
${NOISE}
void main() {
  vec2 p = vPos / uScale + vec2(11.3, -4.1);
  float t = uTime * uDrift;
  float w = fbm3(p * 0.7 + vec2(t, -0.6 * t));
  float n = fbm3(vec2(p.x * 0.6, p.y * 1.4) + 1.8 * w + vec2(-0.5 * t, t));
  gl_FragColor = vec4(n, 0.0, 0.0, 1.0);
}`;

/**
 * A map that drifts with the space time, kept as keys: key k holds it at
 * k × `refresh` seconds (`material`, whose uTime is set per key, baked into
 * a `texture`-texel half-float target). Between keys k and k + 1 the plane
 * shows `keys[0]` and `keys[1]`, `blend` of the way to the second, while
 * key k + 2 is baked into `keys[2]` `strips` rows at a time, paced to be
 * whole by the time it is needed; then the keys move on by one. A jump in
 * the space time (or the first frame) bakes the two shown keys at once.
 */
export class DriftingMap {
  constructor(THREE, material, { texture, refresh, strips }) {
    this.material = material;
    this.size = texture;
    this.refresh = refresh;
    this.strips = strips;
    this.keys = [0, 1, 2].map(
      () =>
        new THREE.WebGLRenderTarget(texture, texture, {
          depthBuffer: false,
          format: THREE.RedFormat,
          type: THREE.HalfFloatType,
          minFilter: THREE.LinearFilter,
        })
    );
    this.key = NaN; // none baked yet
    this.done = 0;
    this.blend = 0;
  }

  /** `bake(target, from, rows)` draws the material over those texel rows (all when rows is 0). */
  update(time, bake) {
    const { refresh, strips, size, keys } = this;
    const span = time / refresh;
    const key = Math.floor(span);
    const strip = (k, from, count) => {
      this.material.uniforms.uTime.value = k * refresh;
      bake(keys[2], (from * size) / strips, (count * size) / strips);
    };
    if (key === this.key + 1) {
      if (this.done < strips) strip(key + 1, this.done, strips - this.done);
      keys.push(keys.shift());
    } else if (key !== this.key) {
      [0, 1].forEach((i) => {
        this.material.uniforms.uTime.value = (key + i) * refresh;
        bake(keys[i], 0, 0);
      });
    }
    if (key !== this.key) {
      this.key = key;
      this.done = 0;
    }
    this.blend = span - key;
    const due = Math.min(strips, Math.floor(this.blend * strips) + 1);
    if (due > this.done) {
      strip(key + 2, this.done, due - this.done);
      this.done = due;
    }
  }
}
