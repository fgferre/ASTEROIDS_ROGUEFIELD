// The space behind the Field (PLAN.md R5.10): no floor, only depth. Three
// layers of stars at real distances below the play plane, so the perspective
// camera parallaxes them against each other; a dozen bright stars with a soft
// cross; a shader nebula on a far plane; and sparse dust in a thin slab
// around the plane, lit by the ship. Each biome recolours the nebula and the
// dust through setLook(). Everything here is one draw call per layer.

import { createSeededRandom } from './asteroidMesh.js';
import { HALF_H, HALF_W } from './batches.js';

// proposta 18/10: depth below the play plane, star count and size range (px
// at a 900-px-tall frame) per layer. The near layer is the densest and the
// biggest, so it visibly slides against the small, faint far ones (~90 /
// ~110 / ~60 on screen at the follow shot).
export const STAR_LAYERS = [
  { depth: 600, count: 1400, size: [1.6, 3.2], gain: 1 },
  { depth: 1400, count: 900, size: [1.3, 2.4], gain: 0.85 },
  { depth: 3000, count: 400, size: [1.1, 1.9], gain: 0.75 },
];
// The bright dozen sit in the middle of their span (`spread`), so a few are
// always in view; gain > 1 lets their cores bloom.
export const BRIGHT_STARS = {
  depth: 2000,
  count: 12,
  size: [9, 15],
  gain: 2.4,
  spread: 0.45,
};
export const NEBULA_DEPTH = 3600;
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

// Twinkle is per star: phase, rate (rad/s) and depth of the dip.
const STAR_VERTEX = `
attribute vec3 aColor;
attribute float aSize;
attribute vec3 aTwinkle;
uniform float uTime;
uniform float uPixel;
varying vec3 vColor;
void main() {
  float k = 1.0 - aTwinkle.z * (0.5 + 0.5 * sin(uTime * aTwinkle.y + aTwinkle.x));
  float size = aSize * uPixel;
  gl_PointSize = max(1.0, size);
  vColor = aColor * k * clamp(size, 0.0, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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

const NEBULA_VERTEX = `
varying vec2 vPos;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vPos = world.xz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

// Gradient-noise fbm, domain-warped twice: a very low-frequency mask keeps
// most of the sky black and gathers the gas into a few regions; inside them
// broad clouds in the haze colour and thin filaments in the vein colour,
// over a dark base that goes from sky0 at the centre to sky1 at the rim.
const NEBULA_FRAGMENT = `
uniform float uTime;
uniform vec3 uBase0;
uniform vec3 uBase1;
uniform vec3 uHaze;
uniform vec3 uVeins;
uniform float uHazeDensity;
uniform float uVeinDensity;
uniform vec2 uCenter;
varying vec2 vPos;
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
void main() {
  vec2 p = vPos / 2600.0;
  float t = uTime * 0.003;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t * 0.7));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2)), fbm(p + 3.0 * q + vec2(8.3, 2.8) + t * 0.4));
  float n = fbm(p * 1.4 + 2.5 * r);
  float region = smoothstep(-0.05, 0.3, fbm(p * 0.45 + vec2(3.1, 7.7)));
  float cloud = smoothstep(-0.05, 0.45, n) * region;
  cloud *= cloud;
  float filament = 1.0 - smoothstep(0.0, 0.035, abs(fbm(p * 2.2 + 2.0 * r + 7.3)));
  float veins = filament * smoothstep(0.0, 0.3, n) * region;
  float rim = length((vPos - uCenter) / vec2(5200.0, 4200.0));
  vec3 color = mix(uBase0, uBase1, smoothstep(0.0, 1.0, rim));
  color += uHaze * cloud * uHazeDensity + uVeins * veins * uVeinDensity;
  gl_FragColor = vec4(color, 1.0);
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
  const { count, depth, size, gain, spread = 1 } = layer;
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
    colors[i * 3] = rgb[0] * bright;
    colors[i * 3 + 1] = rgb[1] * bright;
    colors[i * 3 + 2] = rgb[2] * bright;
    sizes[i] = size[0] + (size[1] - size[0]) * random() ** 2;
    twinkle[i * 3] = random() * Math.PI * 2;
    twinkle[i * 3 + 1] = 0.3 + random() * 1.2;
    twinkle[i * 3 + 2] = 0.1 + random() * 0.4;
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

export class SpaceField {
  constructor(THREE, scene) {
    const random = createSeededRandom(5150.9);
    this.time = { value: 0 };
    this.pixel = { value: 1 };
    const starMaterial = (cross) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: this.time,
          uPixel: this.pixel,
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

    const { half, cx, cz } = layerSpan(NEBULA_DEPTH);
    this.nebulaUniforms = {
      uTime: this.time,
      uBase0: { value: new THREE.Color() },
      uBase1: { value: new THREE.Color() },
      uHaze: { value: new THREE.Color() },
      uVeins: { value: new THREE.Color() },
      uHazeDensity: { value: 0 },
      uVeinDensity: { value: 0 },
      uCenter: { value: new THREE.Vector2(cx, cz) },
    };
    this.nebula = new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2.2, half * 2.2).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: this.nebulaUniforms,
        vertexShader: NEBULA_VERTEX,
        fragmentShader: NEBULA_FRAGMENT,
        depthWrite: false,
      })
    );
    this.nebula.position.set(cx, -NEBULA_DEPTH, cz);
    this.nebula.renderOrder = -40;
    scene.add(this.nebula);

    this.dust = this.buildDust(THREE, random);
    scene.add(this.dust);
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

  /** A biome look from BiomeController. */
  setLook(look) {
    const u = this.nebulaUniforms;
    u.uBase0.value.copy(look.sky0);
    u.uBase1.value.copy(look.sky1);
    u.uHaze.value.copy(look.hazeColor);
    u.uVeins.value.copy(look.veinColor);
    u.uHazeDensity.value = look.hazeDensity * NEBULA_GAIN.haze;
    u.uVeinDensity.value = look.veinDensity * NEBULA_GAIN.veins;
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
    u.uShipGlow.value = ship
      ? DUST_LIGHT.base + DUST_LIGHT.perIntensity * shipLight
      : 0;
    if (ship) u.uShip.value.set(ship.x - HALF_W, 0, ship.y - HALF_H);
  }
}
