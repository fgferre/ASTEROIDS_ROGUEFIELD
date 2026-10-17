// The floor of the Field (docs/NORTE.md §2 "Fundo com volume"): a sheet of
// dark dust some distance below the play plane, lit only faintly by the key
// so the ship's own light pools on it and sweeps as it moves, with a soft
// shadow blob under every mass. Being deeper than the play plane, the
// perspective camera parallaxes it against the field for free.

import { KEY_LIGHT_DIR, PALETTE } from '../../data/constants/palette.js';
import { SimplexNoise, createSeededRandom } from './asteroidMesh.js';
import { HALF_H, HALF_W, colorOf } from './batches.js';

// proposta 17/10: depth and size of the dust sheet. 140 below the plane at a
// ~650-unit camera height parallaxes ~18% against the field; 3600×3000 is
// wider than the footprint at the widest dolly-out from any clamped follow
// point.
export const FLOOR_DEPTH = 140;
const FLOOR_SIZE = { w: 3600, h: 3000 };
const FLOOR_SEGMENTS = { w: 36, h: 30 };
// One texture tile covers this many world units (grain stays ~1–2 units).
const TILE_UNITS = 420;
const TEXTURE_SIZE = 256;
const DUST_ALBEDO = '#8c867c';
// Share of the key light the floor receives: low, so local lights dominate.
const KEY_SHARE = 0.14;
const ENV_SHARE = 0.4;
// Ship pool: a cyan-white light between the plane and the floor, under the
// ship.
const SHIP_POOL = {
  lift: 70,
  distance: 340,
  base: 2.2,
  thrust: 0.6,
  whiten: 0.45,
};
// Shadows: fraction of the physical throw along the key light (the full one
// would detach the blob from its caster), size and darkness per radius. The
// blob is also pulled back by the tilt's parallax at FLOOR_DEPTH, so it sits
// beside its caster on screen instead of sliding below it.
const KEY_ELEVATION = (40 * Math.PI) / 180;
const SHADOW_THROW = 0.3;
const SHADOW_SIZE = 2.6;
const SHADOW_ALPHA = 0.85;
const MAX_SHADOWS = 96;

// Tileable fbm: four shifted samples cross-faded, so the edges wrap.
function tileNoise(noise, u, v, scale) {
  const a = noise.fbm(u * scale, v * scale, 0.5, 4);
  const b = noise.fbm((u - 1) * scale, v * scale, 0.5, 4);
  const c = noise.fbm(u * scale, (v - 1) * scale, 0.5, 4);
  const d = noise.fbm((u - 1) * scale, (v - 1) * scale, 0.5, 4);
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Dust density in alpha (clumped clouds + seeded grains), albedo in rgb.
function dustTexture(THREE) {
  const size = TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const random = createSeededRandom(7171.3);
  const noise = new SimplexNoise(createSeededRandom(9191.7));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = tileNoise(noise, x / size, y / size, 3) * 0.5 + 0.5;
      const grain = random();
      const speck = grain > 0.985 ? 0.5 : grain * 0.18;
      const density = Math.min(1, Math.pow(n, 1.8) * 1.15 + speck);
      const i = (x + y * size) * 4;
      const tone = 200 + Math.round(55 * speck);
      image.data[i] = tone;
      image.data[i + 1] = tone;
      image.data[i + 2] = tone;
      image.data[i + 3] = Math.round(255 * (0.18 + 0.72 * density));
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_SIZE.w / TILE_UNITS, FLOOR_SIZE.h / TILE_UNITS);
  texture.encoding = THREE.sRGBEncoding;
  return texture;
}

// Large-scale density in vertex colors, so the tile never reads as a grid.
function floorGeometry(THREE) {
  const geometry = new THREE.PlaneGeometry(
    FLOOR_SIZE.w,
    FLOOR_SIZE.h,
    FLOOR_SEGMENTS.w,
    FLOOR_SEGMENTS.h
  ).rotateX(-Math.PI / 2);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const noise = new SimplexNoise(createSeededRandom(5353.1));
  for (let i = 0; i < position.count; i += 1) {
    const n =
      noise.fbm(position.getX(i) / 900, position.getZ(i) / 900, 2.5, 3) * 0.5 +
      0.5;
    const k = 0.25 + 0.9 * n * n;
    colors[i * 3] = k;
    colors[i * 3 + 1] = k;
    colors[i * 3 + 2] = k;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function patchFloor(THREE, shader) {
  shader.uniforms.uKeyShare = { value: KEY_SHARE };
  const lights = THREE.ShaderChunk.lights_fragment_begin.replace(
    'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );',
    'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );\n\t\tdirectLight.color *= uKeyShare;'
  );
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform float uKeyShare;\nvoid main() {')
    .replace('#include <lights_fragment_begin>', lights);
}

// Alpha for a dark disc with a smooth falloff (alphaMap reads green).
function shadowTexture(THREE) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  gradient.addColorStop(0, '#ffffff');
  gradient.addColorStop(0.35, '#cccccc');
  gradient.addColorStop(1, '#000000');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export class DustFloor {
  /** `tilt`: camera tilt in radians (the floor's parallax shift). */
  constructor(THREE, scene, tilt) {
    const material = new THREE.MeshStandardMaterial({
      color: colorOf(THREE, DUST_ALBEDO),
      map: dustTexture(THREE),
      vertexColors: true,
      roughness: 1,
      metalness: 0,
      envMapIntensity: ENV_SHARE,
      transparent: true,
      depthWrite: false,
    });
    material.onBeforeCompile = (shader) => patchFloor(THREE, shader);
    this.floor = new THREE.Mesh(floorGeometry(THREE), material);
    this.floor.position.y = -FLOOR_DEPTH;
    this.floor.renderOrder = -5;
    scene.add(this.floor);

    this.light = new THREE.PointLight(
      colorOf(THREE, PALETTE.player).lerp(
        new THREE.Color(1, 1, 1),
        SHIP_POOL.whiten
      ),
      0,
      SHIP_POOL.distance,
      2
    );
    scene.add(this.light);

    const reach = (FLOOR_DEPTH / Math.tan(KEY_ELEVATION)) * SHADOW_THROW;
    this.shadowDx = -KEY_LIGHT_DIR.x * reach;
    this.shadowDy = -KEY_LIGHT_DIR.y * reach - FLOOR_DEPTH * Math.tan(tilt);
    this.shadows = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        alphaMap: shadowTexture(THREE),
        opacity: SHADOW_ALPHA,
        transparent: true,
        depthWrite: false,
      }),
      MAX_SHADOWS
    );
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = -4;
    scene.add(this.shadows);
    this.matrix = new THREE.Matrix4();
  }

  begin() {
    this.shadows.count = 0;
  }

  /** A shadow under a caster at logical (x, y) with `radius`. */
  shadow(x, y, radius) {
    const i = this.shadows.count;
    if (i >= MAX_SHADOWS || !(radius > 0)) return;
    const s = radius * SHADOW_SIZE;
    this.matrix.makeScale(s, 1, s);
    this.matrix.setPosition(
      x + this.shadowDx - HALF_W,
      -FLOOR_DEPTH + 0.5,
      y + this.shadowDy - HALF_H
    );
    this.shadows.setMatrixAt(i, this.matrix);
    this.shadows.count = i + 1;
  }

  /** `ship`: logical position or null when hidden; `thrust` light 0..~2.4. */
  end(ship, thrust) {
    this.shadows.instanceMatrix.needsUpdate = true;
    this.light.intensity = ship
      ? SHIP_POOL.base + SHIP_POOL.thrust * thrust
      : 0;
    if (ship) {
      this.light.position.set(
        ship.x - HALF_W,
        -FLOOR_DEPTH + SHIP_POOL.lift,
        ship.y - HALF_H
      );
    }
  }
}
