// The space behind the Field (PLAN.md R5.10): no floor, only depth. Three
// layers of stars at real distances below the play plane, so the perspective
// camera parallaxes them against each other, smaller, dimmer and bluer the
// deeper they sit; a dozen bright stars with a soft cross; a nebula in three
// depths (a far plane baked once into a texture, live mid bands and near
// wisps); soft dust clouds between the field and the stars; and sparse dust
// in a thin slab around the plane, lit by the ship. Each biome recolours the
// nebula, the clouds and the dust through setLook(). One draw call per layer;
// nothing here is lit or takes shadows.

import { createSeededRandom } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';

// proposta 18/10: depth below the play plane, star count, size range (px at
// a 900-px-tall frame), brightness, share of the cool tint and of the
// twinkle per layer. The near layer is the densest, the biggest and the only
// one that twinkles fully; the far one is small, dim, bluer and steady (~90 /
// ~110 / ~60 on screen at the follow shot).
export const STAR_LAYERS = [
  { depth: 600, count: 1400, size: [1.5, 3], gain: 1, cool: 0, twinkle: 1 },
  {
    depth: 1400,
    count: 900,
    size: [1.2, 2.2],
    gain: 0.75,
    cool: 0.15,
    twinkle: 0.6,
  },
  {
    depth: 3000,
    count: 400,
    size: [1.1, 1.7],
    gain: 0.55,
    cool: 0.35,
    twinkle: 0,
  },
];
// The bright dozen sit in the middle of their span (`spread`), so a few are
// always in view; gain > 1 lets their cores bloom.
export const BRIGHT_STARS = {
  depth: 2000,
  count: 12,
  size: [9, 15],
  gain: 2.4,
  spread: 0.45,
  cool: 0,
  twinkle: 0.5,
};
// proposta 18/10: the blue-white the deeper layers lean toward (linear).
const COOL_TINT = [0.72, 0.84, 1];
// proposta 18/10: each star's brightness swings up to ±amount, at a rate
// (rad/s) drawn from `rate`: slow, never a flicker.
export const TWINKLE = { amount: 0.15, rate: [0.25, 0.9] };
// proposta 18/10: point size scales with (ref / distance to the camera) ^
// power, clamped to [min, max]; brightness with the same factor, never
// above 1. ref ≈ the mid layer at the follow shot, so a dolly-out shrinks the
// near layer more than the far one.
export const STAR_FALLOFF = { ref: 1900, power: 0.5, min: 0.5, max: 1.4 };
// proposta 18/10: the nebula in three depths, each wider than the last shot
// sees (layerSpan × 2.2).
// FAR: the old fbm, baked once into a `texture`-texel target as structure
// (clouds, veins) and recoloured live per biome, `dim`mer and `desaturate`d
// toward grey; `scale` world units per noise unit; `rim` the sky's
// centre-to-rim ellipse, in layer half-spans.
export const NEBULA_FAR = {
  depth: 4400,
  texture: 1024,
  scale: 3000,
  dim: 0.8,
  desaturate: 0.3,
  rim: [1.24, 1],
};
// MID: broad soft bands of haze, live (3 octaves, two calls), drifting at
// `drift` noise units/s; `gain` of the haze added, `veil` of what lies
// behind (the far stars, the far nebula) hidden under a full band.
export const NEBULA_MID = {
  depth: 2700,
  scale: 1900,
  drift: 0.004,
  gain: 0.2,
  veil: 0.22,
};
// NEAR: sparse thin filaments, additive, at most `alpha` of their colour,
// the core lifted `edgeLift` toward white, the halo `halo` of the core's
// strength; colour between the haze and the veins by density, the haze's
// weighed by `hazeShare`.
export const NEBULA_NEAR = {
  depth: 1600,
  scale: 1100,
  drift: 0.002,
  alpha: 0.1,
  edgeLift: 0.2,
  halo: 0.45,
  hazeShare: 0.5,
};
// proposta 18/10: soft lumpy clouds lying flat between the field and the
// stars, wrapped around the camera target (like the dust) so they parallax
// for real. `size`: world units across (≈120–400 px at the follow shot);
// opacity at most `alpha` (× base + perHaze × the biome's haze density,
// capped at 1); colour the haze × `lift`; each `stretch`ed along its own
// axis; drift (units/s) and spin (rad/s) at most; `texture` px per cell of
// a 2×2 atlas of shapes.
export const DUST_CLOUDS = {
  count: 40,
  top: -300,
  bottom: -900,
  size: [110, 420],
  box: { w: 2600, h: 2200 },
  edge: 320,
  alpha: 0.12,
  base: 0.4,
  perHaze: 0.48,
  lift: 0.9,
  stretch: [1, 2.4],
  drift: 6,
  spin: 0.02,
  texture: 128,
};
// proposta 18/10: each atlas shape is `blobs` gaussian lumps (radius in
// cell widths) within `spread` of the centre, under a window of squared
// radius `window` (zero before the cell edge).
const CLOUD_SHAPE = {
  blobs: 9,
  spread: 0.6,
  radius: [0.05, 0.15],
  window: 0.2,
};
// proposta 18/10: layers drawn per `spaceLayers` of the quality preset.
// 1: far nebula only; 2: + mid bands; 3: + near wisps and clouds.
export const SPACE_LAYERS = { mid: 2, near: 3 };
// Highest camera any shot takes (the intro, ~3.2× the follow distance) and
// the footprint slope of the widest view: a layer at depth D spans
// (CAMERA_REACH + D) × SPAN either side, so no shot sees its edge.
const CAMERA_REACH = 2000;
const SPAN = 0.75;
// The tilted camera looks "up" the field: deeper layers centre further up.
const LEAD = 0.4;
// Dust: a slab around the play plane, wrapped around the camera target.
export const DUST = {
  count: 700,
  top: 40,
  bottom: -80,
  box: { w: 1100, h: 900 },
  edge: 90,
};
// How far the ship's light reaches into the dust, and the dust's own share.
const DUST_LIGHT = { radius: 150, base: 0.9, perIntensity: 0.5, ambient: 0.16 };
// Nebula brightness per unit of the biome's haze/vein density.
export const NEBULA_GAIN = { haze: 0.32, veins: 0.6 };

// Twinkle is per star: phase, rate (rad/s) and swing. uFalloff: ref,
// power, min, max of the distance falloff (STAR_FALLOFF).
const STAR_VERTEX = `
attribute vec3 aColor;
attribute float aSize;
attribute vec3 aTwinkle;
uniform float uTime;
uniform float uPixel;
uniform vec4 uFalloff;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float near = pow(uFalloff.x / max(1.0, -mv.z), uFalloff.y);
  near = clamp(near, uFalloff.z, uFalloff.w);
  float k = 1.0 + aTwinkle.z * sin(uTime * aTwinkle.y + aTwinkle.x);
  float size = aSize * uPixel * near;
  gl_PointSize = max(1.0, size);
  vColor = aColor * k * min(near, 1.0) * clamp(size, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

// A soft dot; with uCross, a hot core and two thin spikes (bright stars).
const STAR_FRAGMENT = `
uniform float uCross;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float soft = exp(-d * 3.5);
  float spikes = exp(-abs(c.x) * 18.0) * exp(-abs(c.y) * 3.0)
    + exp(-abs(c.y) * 18.0) * exp(-abs(c.x) * 3.0);
  float shape = mix(soft, exp(-d * 14.0) + 0.55 * spikes * (1.0 - d), uCross);
  gl_FragColor = vec4(vColor * shape, 1.0);
}`;

// The nebula planes: world position for the noise, uv for the baked map.
const NEBULA_VERTEX = `
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPos = world.xz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const NOISE = `
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

// The far nebula's bake (once, into a render target over the far plane's
// footprint): gradient-noise fbm, domain-warped twice: a very low-frequency
// mask keeps most of the sky black and gathers the gas into a few regions;
// inside them broad clouds (r, stored before squaring so the dark end keeps
// its precision in 8 bits) and thin filaments (g).
const FAR_BAKE_VERTEX = `
uniform vec2 uOrigin;
uniform float uSize;
varying vec2 vPos;
void main() {
  vPos = uOrigin + vec2(uv.x - 0.5, 0.5 - uv.y) * uSize;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FAR_BAKE_FRAGMENT = `
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

// The far plane: the baked structure over a dark base that goes from sky0
// at the centre to sky1 at the rim (uRim: the ellipse's half-axes).
const FAR_FRAGMENT = `
uniform sampler2D uMap;
uniform vec3 uBase0;
uniform vec3 uBase1;
uniform vec3 uHaze;
uniform vec3 uVeins;
uniform float uHazeDensity;
uniform float uVeinDensity;
uniform vec2 uCenter;
uniform vec2 uRim;
varying vec2 vPos;
varying vec2 vUv;
void main() {
  vec4 baked = texture2D(uMap, vUv);
  float rim = length((vPos - uCenter) / uRim);
  vec3 color = mix(uBase0, uBase1, smoothstep(0.0, 1.0, rim));
  color += uHaze * baked.r * baked.r * uHazeDensity + uVeins * baked.g * uVeinDensity;
  gl_FragColor = vec4(color, 1.0);
}`;

// Mid bands: a warped, sideways-stretched fbm; premultiplied, so the haze
// adds and the band's veil hides a share of what is behind.
const MID_FRAGMENT = `
uniform float uTime;
uniform float uScale;
uniform float uDrift;
uniform vec3 uHaze;
uniform float uGain;
uniform float uVeil;
varying vec2 vPos;
${NOISE}
void main() {
  vec2 p = vPos / uScale + vec2(11.3, -4.1);
  float t = uTime * uDrift;
  float w = fbm3(p * 0.7 + vec2(t, -0.6 * t));
  float n = fbm3(vec2(p.x * 0.6, p.y * 1.4) + 1.8 * w + vec2(-0.5 * t, t));
  float band = smoothstep(-0.12, 0.38, n);
  band *= band;
  gl_FragColor = vec4(uHaze * band * uGain, band * uVeil);
}`;

// Near wisps: a low-frequency mask keeps most of the plane empty (and
// skips the rest of the work there); inside it, the zero line of a warped
// fbm as a thin bright core in a faint halo, broken into strands.
const NEAR_FRAGMENT = `
uniform float uTime;
uniform float uScale;
uniform float uDrift;
uniform vec3 uColor;
uniform vec3 uEdge;
uniform float uHalo;
varying vec2 vPos;
${NOISE}
void main() {
  vec2 p = vPos / uScale + vec2(-7.7, 3.3);
  float t = uTime * uDrift;
  float region = smoothstep(0.04, 0.26, noise(p * 0.55 + vec2(t, 0.0)));
  if (region <= 0.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  float w = noise(p * 0.9 - vec2(0.0, t));
  float f = abs(fbm3(p * 1.6 + 1.5 * w + vec2(t, 0.0)));
  float core = 1.0 - smoothstep(0.0, 0.016, f);
  float halo = (1.0 - smoothstep(0.0, 0.05, f)) * uHalo;
  float broken = smoothstep(-0.25, 0.3, noise(p * 2.3 + vec2(0.0, t)));
  gl_FragColor = vec4(mix(uColor * halo, uEdge, core) * region * broken, 1.0);
}`;

// Dust drifts on the GPU: each mote's start plus drift × time, wrapped into
// a box around the camera target, faded at the box edges (no popping) and
// toward the slab's top and bottom; the ship's light brightens it nearby.
const DUST_VERTEX = `
attribute float aSize;
attribute float aAlpha;
attribute vec2 aDrift;
uniform float uTime;
uniform float uScale;
uniform vec2 uCenter;
uniform vec2 uBox;
uniform float uEdge;
uniform vec2 uSlab;
uniform vec3 uShip;
uniform float uShipGlow;
uniform float uLightRadius;
uniform float uAmbient;
varying float vLight;
void main() {
  vec2 lo = uCenter - uBox * 0.5;
  vec2 p = lo + mod(position.xz + aDrift * uTime - lo, uBox);
  vec3 world = vec3(p.x, position.y, p.y);
  vec2 edges = min(p - lo, lo + uBox - p);
  float fade = smoothstep(0.0, uEdge, min(edges.x, edges.y));
  fade *= smoothstep(uSlab.x, uSlab.x + 40.0, world.y);
  fade *= 1.0 - smoothstep(uSlab.y - 25.0, uSlab.y, world.y);
  float d = distance(world, uShip) / uLightRadius;
  float light = uAmbient + uShipGlow / (1.0 + d * d * 4.0);
  vec4 mv = viewMatrix * vec4(world, 1.0);
  float size = aSize * uScale / max(1.0, -mv.z);
  gl_PointSize = max(1.0, size);
  vLight = aAlpha * fade * light * clamp(size, 0.0, 1.0);
  gl_Position = projectionMatrix * mv;
}`;

const DUST_FRAGMENT = `
uniform vec3 uColor;
varying float vLight;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  gl_FragColor = vec4(uColor * vLight * (1.0 - d) * (1.0 - d), 1.0);
}`;

// Clouds: each quad's centre drifts and wraps into a box around the camera
// target (shifted up the field by its depth, like the layers), fades at the
// box edges and spins slowly in the plane. aShape: size, angle, spin, alpha;
// aStretch: length over width.
const CLOUD_VERTEX = `
attribute vec2 aCorner;
attribute vec4 aShape;
attribute float aStretch;
attribute vec2 aDrift;
attribute vec2 aCell;
uniform float uTime;
uniform vec2 uCenter;
uniform vec2 uBox;
uniform float uEdge;
uniform float uLead;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec2 lo = uCenter + vec2(0.0, position.y * uLead) - uBox * 0.5;
  vec2 p = lo + mod(position.xz + aDrift * uTime - lo, uBox);
  vec2 edges = min(p - lo, lo + uBox - p);
  float a = aShape.y + aShape.z * uTime;
  vec2 stretch = vec2(sqrt(aStretch), 1.0 / sqrt(aStretch));
  vec2 corner = mat2(cos(a), sin(a), -sin(a), cos(a)) * aCorner * stretch * aShape.x * 0.5;
  vUv = aCell + (aCorner * 0.5 + 0.5) * 0.5;
  vAlpha = aShape.w * smoothstep(0.0, uEdge, min(edges.x, edges.y));
  gl_Position = projectionMatrix * viewMatrix * vec4(p.x + corner.x, position.y, p.y + corner.y, 1.0);
}`;

const CLOUD_FRAGMENT = `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uAlpha;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float a = texture2D(uMap, vUv).r * vAlpha * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;

// Star tints (linear): mostly white, some blue-white, a few warm.
const STAR_TINTS = [
  { share: 0.8, rgb: [0.92, 0.95, 1] },
  { share: 0.12, rgb: [0.62, 0.74, 1] },
  { share: 0.08, rgb: [1, 0.78, 0.55] },
];

function tintOf(roll) {
  let acc = 0;
  for (let i = 0; i < STAR_TINTS.length; i += 1) {
    acc += STAR_TINTS[i].share;
    if (roll < acc) return STAR_TINTS[i].rgb;
  }
  return STAR_TINTS[0].rgb;
}

/** Half-extent and centre (world x, z) of a layer at `depth`. */
export function layerSpan(depth) {
  const half = (CAMERA_REACH + depth) * SPAN;
  return { half, cx: 0, cz: -depth * LEAD };
}

function starPoints(THREE, layer, material, random) {
  const { count, depth, size, gain, cool, twinkle: swing, spread = 1 } = layer;
  const { half: span, cx, cz } = layerSpan(depth);
  const half = span * spread;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const twinkle = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = cx + (random() * 2 - 1) * half;
    positions[i * 3 + 1] = -depth - random() * depth * 0.08;
    positions[i * 3 + 2] = cz + (random() * 2 - 1) * half;
    // Many faint, few bright.
    const bright = (0.3 + 0.7 * random() ** 3) * gain;
    const rgb = tintOf(random());
    for (let c = 0; c < 3; c += 1) {
      colors[i * 3 + c] = (rgb[c] + (COOL_TINT[c] - rgb[c]) * cool) * bright;
    }
    sizes[i] = size[0] + (size[1] - size[0]) * random() ** 2;
    const [slow, fast] = TWINKLE.rate;
    twinkle[i * 3] = random() * Math.PI * 2;
    twinkle[i * 3 + 1] = slow + random() * (fast - slow);
    twinkle[i * 3 + 2] = TWINKLE.amount * swing * (0.5 + 0.5 * random());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aTwinkle', new THREE.BufferAttribute(twinkle, 3));
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

// Four lumpy cloud shapes in a 2×2 atlas (opacity in red): a few soft blobs
// near each cell's centre under a round window that reaches zero inside the
// cell, so linear filtering never pulls a neighbour in.
function cloudAtlas(THREE, random) {
  const cell = DUST_CLOUDS.texture;
  const size = cell * 2;
  const data = new Uint8Array(size * size * 4);
  const values = new Float32Array(cell * cell);
  const { blobs, spread, radius, window } = CLOUD_SHAPE;
  for (let k = 0; k < 4; k += 1) {
    const lumps = Array.from({ length: blobs }, () => ({
      x: (random() - 0.5) * spread,
      y: (random() - 0.5) * spread,
      r: radius[0] + random() * (radius[1] - radius[0]),
    }));
    let peak = 0;
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        const u = (x + 0.5) / cell - 0.5;
        const v = (y + 0.5) / cell - 0.5;
        let sum = 0;
        lumps.forEach(({ x: bx, y: by, r }) => {
          sum += Math.exp(-((u - bx) ** 2 + (v - by) ** 2) / (r * r));
        });
        const value = sum * Math.max(0, 1 - (u * u + v * v) / window) ** 2;
        values[y * cell + x] = value;
        peak = Math.max(peak, value);
      }
    }
    const ox = (k % 2) * cell;
    const oy = Math.floor(k / 2) * cell;
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        const i = ((oy + y) * size + ox + x) * 4;
        data[i] = Math.round((values[y * cell + x] / peak) * 255);
        data[i + 3] = 255;
      }
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

// The far layer's palette: pulled toward its own grey, then dimmed.
function farTone(color) {
  const { desaturate, dim } = NEBULA_FAR;
  const grey = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return color.setRGB(
    (color.r + (grey - color.r) * desaturate) * dim,
    (color.g + (grey - color.g) * desaturate) * dim,
    (color.b + (grey - color.b) * desaturate) * dim
  );
}

export class SpaceField {
  constructor(THREE, scene) {
    const random = createSeededRandom(5150.9);
    this.time = { value: 0 };
    this.pixel = { value: 1 };
    const { ref, power, min, max } = STAR_FALLOFF;
    const falloff = { value: new THREE.Vector4(ref, power, min, max) };
    const starMaterial = (cross) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: this.time,
          uPixel: this.pixel,
          uFalloff: falloff,
          uCross: { value: cross },
        },
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

    // Drawn far to near; the Ring's structures (renderOrder −10) sit
    // between the far layers and the near one.
    const normal = starMaterial(0);
    this.layers = STAR_LAYERS.map((layer, i) => {
      const points = starPoints(THREE, layer, normal, random);
      points.renderOrder = [-8, -25, -30][i];
      scene.add(points);
      return points;
    });

    this.bright = starPoints(THREE, BRIGHT_STARS, starMaterial(1), random);
    this.bright.renderOrder = -22;
    scene.add(this.bright);

    this.buildNebula(THREE, scene);

    this.dust = this.buildDust(THREE, random);
    scene.add(this.dust);
    this.clouds = this.buildClouds(THREE, random);
    scene.add(this.clouds);
  }

  // Three planes, far to near between the star layers (renderOrder). The
  // far one shows a target baked before the first frame the scene draws:
  // scene.onBeforeRender is where the renderer is known.
  buildNebula(THREE, scene) {
    const plane = (depth, material, renderOrder) => {
      const { half, cx, cz } = layerSpan(depth);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(half * 2.2, half * 2.2).rotateX(-Math.PI / 2),
        material
      );
      mesh.position.set(cx, -depth, cz);
      mesh.renderOrder = renderOrder;
      scene.add(mesh);
      return mesh;
    };
    const live = (layer) => ({
      uTime: this.time,
      uScale: { value: layer.scale },
      uDrift: { value: layer.drift },
    });

    const far = layerSpan(NEBULA_FAR.depth);
    const { texture, scale, rim } = NEBULA_FAR;
    this.farTarget = new THREE.WebGLRenderTarget(texture, texture, {
      depthBuffer: false,
    });
    this.bakeScene = new THREE.Scene();
    this.bakeCamera = new THREE.Camera();
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: {
          uOrigin: { value: new THREE.Vector2(far.cx, far.cz) },
          uSize: { value: far.half * 2.2 },
          uScale: { value: scale },
        },
        vertexShader: FAR_BAKE_VERTEX,
        fragmentShader: FAR_BAKE_FRAGMENT,
        depthTest: false,
        depthWrite: false,
      })
    );
    quad.frustumCulled = false;
    this.bakeScene.add(quad);
    this.baked = false;
    scene.onBeforeRender = (renderer) => this.bake(renderer);

    this.farUniforms = {
      uMap: { value: this.farTarget.texture },
      uBase0: { value: new THREE.Color() },
      uBase1: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() },
      uVeins: { value: new THREE.Color() },
      uHazeDensity: { value: 0 },
      uVeinDensity: { value: 0 },
      uCenter: { value: new THREE.Vector2(far.cx, far.cz) },
      uRim: { value: new THREE.Vector2(far.half * rim[0], far.half * rim[1]) },
    };
    this.far = plane(
      NEBULA_FAR.depth,
      new THREE.ShaderMaterial({
        uniforms: this.farUniforms,
        vertexShader: NEBULA_VERTEX,
        fragmentShader: FAR_FRAGMENT,
        depthWrite: false,
      }),
      -40
    );

    this.midUniforms = {
      ...live(NEBULA_MID),
      uHaze: { value: new THREE.Color() },
      uGain: { value: 0 },
      uVeil: { value: NEBULA_MID.veil },
    };
    this.mid = plane(
      NEBULA_MID.depth,
      new THREE.ShaderMaterial({
        uniforms: this.midUniforms,
        vertexShader: NEBULA_VERTEX,
        fragmentShader: MID_FRAGMENT,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
      }),
      -28
    );

    this.nearUniforms = {
      ...live(NEBULA_NEAR),
      uColor: { value: new THREE.Color() },
      uEdge: { value: new THREE.Color() },
      uHalo: { value: NEBULA_NEAR.halo },
    };
    this.near = plane(
      NEBULA_NEAR.depth,
      new THREE.ShaderMaterial({
        uniforms: this.nearUniforms,
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
      -26
    );
    this.white = new THREE.Color(1, 1, 1);
  }

  // The far nebula's structure, drawn once into its target.
  bake(renderer) {
    if (this.baked) return;
    this.baked = true;
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.farTarget);
    renderer.render(this.bakeScene, this.bakeCamera);
    renderer.setRenderTarget(target);
  }

  buildDust(THREE, random) {
    const { count, top, bottom, box, edge } = DUST;
    const positions = new Float32Array(count * 3);
    const drift = new Float32Array(count * 2);
    const sizes = new Float32Array(count);
    const alphas = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = random() * box.w;
      positions[i * 3 + 1] = bottom + random() * (top - bottom);
      positions[i * 3 + 2] = random() * box.h;
      drift[i * 2] = (random() - 0.5) * 8;
      drift[i * 2 + 1] = (random() - 0.5) * 8;
      sizes[i] = 1 + random() * 1.8;
      alphas[i] = 0.25 + random() * 0.5;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aDrift', new THREE.BufferAttribute(drift, 2));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    this.dustUniforms = {
      uTime: this.time,
      uScale: { value: 1 },
      uCenter: { value: new THREE.Vector2() },
      uBox: { value: new THREE.Vector2(box.w, box.h) },
      uEdge: { value: edge },
      uSlab: { value: new THREE.Vector2(bottom, top) },
      uShip: { value: new THREE.Vector3() },
      uShipGlow: { value: 0 },
      uLightRadius: { value: DUST_LIGHT.radius },
      uAmbient: { value: DUST_LIGHT.ambient },
      uColor: { value: new THREE.Color() },
    };
    const points = new THREE.Points(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.dustUniforms,
        vertexShader: DUST_VERTEX,
        fragmentShader: DUST_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    points.frustumCulled = false;
    return points;
  }

  // One mesh of `count` flat quads; each vertex carries its quad's centre.
  buildClouds(THREE, random) {
    const { count, top, bottom, size, box, edge, drift, spin, stretch } =
      DUST_CLOUDS;
    const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
    const positions = new Float32Array(count * 12);
    const corner = new Float32Array(count * 8);
    const shape = new Float32Array(count * 16);
    const stretches = new Float32Array(count * 4);
    const drifts = new Float32Array(count * 8);
    const cells = new Float32Array(count * 8);
    const index = [];
    for (let i = 0; i < count; i += 1) {
      const centre = [
        random() * box.w,
        bottom + random() * (top - bottom),
        random() * box.h,
      ];
      const look = [
        size[0] + (size[1] - size[0]) * random(),
        random() * Math.PI * 2,
        (random() * 2 - 1) * spin,
        0.5 + 0.5 * random(),
      ];
      const move = [(random() * 2 - 1) * drift, (random() * 2 - 1) * drift];
      const long = stretch[0] + (stretch[1] - stretch[0]) * random();
      const cell = Math.floor(random() * 4);
      const uv = [(cell % 2) * 0.5, Math.floor(cell / 2) * 0.5];
      for (let v = 0; v < 4; v += 1) {
        const k = i * 4 + v;
        positions.set(centre, k * 3);
        corner.set([corners[v * 2], corners[v * 2 + 1]], k * 2);
        shape.set(look, k * 4);
        stretches[k] = long;
        drifts.set(move, k * 2);
        cells.set(uv, k * 2);
      }
      const o = i * 4;
      index.push(o, o + 1, o + 2, o, o + 2, o + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(index);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aCorner', new THREE.BufferAttribute(corner, 2));
    geometry.setAttribute('aShape', new THREE.BufferAttribute(shape, 4));
    geometry.setAttribute('aStretch', new THREE.BufferAttribute(stretches, 1));
    geometry.setAttribute('aDrift', new THREE.BufferAttribute(drifts, 2));
    geometry.setAttribute('aCell', new THREE.BufferAttribute(cells, 2));
    this.cloudUniforms = {
      uTime: this.time,
      uCenter: { value: new THREE.Vector2() },
      uBox: { value: new THREE.Vector2(box.w, box.h) },
      uEdge: { value: edge },
      uLead: { value: LEAD },
      uMap: { value: cloudAtlas(THREE, random) },
      uColor: { value: new THREE.Color() },
      uAlpha: { value: 0 },
    };
    const mesh = new THREE.Mesh(
      geometry,
      new THREE.ShaderMaterial({
        uniforms: this.cloudUniforms,
        vertexShader: CLOUD_VERTEX,
        fragmentShader: CLOUD_FRAGMENT,
        transparent: true,
        premultipliedAlpha: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    mesh.frustumCulled = false;
    // after the Ring's structures (−10), before the near stars
    mesh.renderOrder = -9;
    return mesh;
  }

  /** The quality preset's `spaceLayers` (SPACE_LAYERS). */
  setLayers(count) {
    this.mid.visible = count >= SPACE_LAYERS.mid;
    this.near.visible = count >= SPACE_LAYERS.near;
    this.clouds.visible = count >= SPACE_LAYERS.near;
  }

  /** A biome look from BiomeController. */
  setLook(look) {
    const { hazeColor, veinColor, hazeDensity, veinDensity } = look;
    const u = this.farUniforms;
    u.uBase0.value.copy(look.sky0);
    u.uBase1.value.copy(look.sky1);
    farTone(u.uHaze.value.copy(hazeColor));
    farTone(u.uVeins.value.copy(veinColor));
    u.uHazeDensity.value = hazeDensity * NEBULA_GAIN.haze;
    u.uVeinDensity.value = veinDensity * NEBULA_GAIN.veins;

    this.midUniforms.uHaze.value.copy(hazeColor);
    this.midUniforms.uGain.value = hazeDensity * NEBULA_MID.gain;

    const { alpha, edgeLift, hazeShare } = NEBULA_NEAR;
    const weight = hazeDensity * hazeShare + veinDensity;
    const near = this.nearUniforms;
    near.uColor.value
      .copy(hazeColor)
      .lerp(veinColor, weight > 0 ? veinDensity / weight : 0);
    near.uEdge.value.copy(near.uColor.value).lerp(this.white, edgeLift);
    const strength = alpha * Math.min(1, weight);
    near.uColor.value.multiplyScalar(strength);
    near.uEdge.value.multiplyScalar(strength);

    const { lift, base, perHaze } = DUST_CLOUDS;
    this.cloudUniforms.uColor.value.copy(hazeColor).multiplyScalar(lift);
    this.cloudUniforms.uAlpha.value =
      DUST_CLOUDS.alpha * Math.min(1, base + perHaze * hazeDensity);
    this.dustUniforms.uColor.value.copy(look.dustColor);
  }

  /**
   * `cx`, `cy`: camera follow point (logical); `ship`: logical position or
   * null when hidden, `shipLight` its light's intensity; `pointScale` the
   * world→pixel factor of attenuated points, `pixel` the frame's height
   * over 900.
   */
  update(cx, cy, dt, { ship, shipLight, pointScale, pixel }) {
    this.time.value += dt;
    this.pixel.value = pixel;
    const u = this.dustUniforms;
    u.uScale.value = pointScale;
    u.uCenter.value.set(cx - HALF_W, cy - HALF_H);
    this.cloudUniforms.uCenter.value.copy(u.uCenter.value);
    u.uShipGlow.value = ship
      ? DUST_LIGHT.base + DUST_LIGHT.perIntensity * shipLight
      : 0;
    if (ship) u.uShip.value.set(ship.x - HALF_W, 0, ship.y - HALF_H);
  }
}
