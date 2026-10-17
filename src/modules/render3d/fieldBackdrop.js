// The Field's depth (docs/NORTE.md §2 "Fundo com volume"): cold haze in two
// layers far below the play plane, a few white stars further down, the broken
// Ring as a dark arc for scale, and dust drifting between plane and haze.
// Everything sits at real depth, so the perspective camera gives the parallax.

import { FILL_LIGHT } from '../../data/constants/palette.js';
import { SimplexNoise, createSeededRandom } from './asteroidMesh.js';
import { PointBatch, colorOf } from './batches.js';

const STAR_COUNT = 120;
const STAR_DEPTH = -1500;
const DUST_COUNT = 40;
const DUST_BOX = { w: 900, h: 700 };

// A soft noise cloud on a canvas, faded to transparent at the edges.
function hazeTexture(THREE, seed, rgb) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const noise = new SimplexNoise(createSeededRandom(seed));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const n = noise.fbm(u * 3 + seed, v * 3, seed * 0.1, 5) * 0.5 + 0.5;
      const dx = u - 0.5;
      const dy = v - 0.5;
      const edge = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.pow(Math.max(0, n - 0.32) / 0.68, 1.6) * edge * edge;
      const i = (x + y * size) * 4;
      image.data[i] = rgb[0];
      image.data[i + 1] = rgb[1];
      image.data[i + 2] = rgb[2];
      image.data[i + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

export class FieldBackdrop {
  constructor(THREE, scene) {
    this.THREE = THREE;
    const random = createSeededRandom(4242.5);
    const cold = FILL_LIGHT.match(/\d+/g).slice(0, 3).map(Number);
    const warm = [255, 179, 71];

    // Near haze over the Ring, deep haze behind it (the Ring is a silhouette).
    const layers = [
      { y: -300, size: 2600, rgb: cold, opacity: 0.2, seed: 3.1 },
      { y: -1000, size: 3200, rgb: warm, opacity: 0.05, seed: 5.3 },
      { y: -1150, size: 5200, rgb: cold, opacity: 0.75, seed: 8.7 },
    ];
    this.haze = layers.map((layer, i) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(layer.size, layer.size * 0.75).rotateX(
          -Math.PI / 2
        ),
        new THREE.MeshBasicMaterial({
          map: hazeTexture(THREE, layer.seed, layer.rgb),
          transparent: true,
          opacity: layer.opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      mesh.position.set((i - 1) * 300, layer.y, (i % 2 ? -1 : 1) * 200);
      mesh.renderOrder = -10 + i;
      scene.add(mesh);
      return mesh;
    });

    // Stars: white, 1–2 px, a few warm.
    this.stars = new PointBatch(THREE, STAR_COUNT, {
      attenuate: false,
    });
    const starCool = [0.9, 0.93, 0.97];
    const starWarm = [1, 0.9, 0.78];
    this.stars.begin();
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const x = (random() - 0.5) * 3000 + 400;
      const y = (random() - 0.5) * 2300 + 300;
      this.stars.push(
        x,
        STAR_DEPTH - random() * 200,
        y,
        random() < 0.2 ? starWarm : starCool,
        2 + random() * 2.5,
        0.35 + random() * 0.6
      );
    }
    this.stars.end(1);
    this.stars.object.renderOrder = -20;
    scene.add(this.stars.object);

    // The broken Ring: a flattened dark band far below, a faint silhouette
    // whose break sits inside the field's view.
    const arc = Math.PI * 0.9;
    const radius = 2200;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 14, 8, 160, arc),
      new THREE.MeshBasicMaterial({ color: colorOf(THREE, '#030508') })
    );
    ring.rotation.x = Math.PI / 2 - 0.12;
    ring.rotation.z = (50 * Math.PI) / 180 - arc;
    ring.scale.set(1, 1, 0.4);
    ring.position.set(-1900, -900, -1700);
    scene.add(ring);

    // Dust between the play plane and the haze, wrapped around the camera.
    this.dust = new PointBatch(THREE, DUST_COUNT);
    this.dustState = [];
    for (let i = 0; i < DUST_COUNT; i += 1) {
      this.dustState.push({
        x: random() * DUST_BOX.w,
        y: random() * DUST_BOX.h,
        h: -20 - random() * 40,
        vx: (random() - 0.5) * 6,
        vy: (random() - 0.5) * 6,
        size: 1.2 + random() * 1.8,
        alpha: 0.12 + random() * 0.2,
      });
    }
    this.dustRgb = [0.75, 0.72, 0.68];
    scene.add(this.dust.object);
  }

  /** `cx`, `cy`: camera follow point (logical). */
  update(cx, cy, dt, pointScale) {
    const left = cx - DUST_BOX.w / 2;
    const top = cy - DUST_BOX.h / 2;
    this.dust.begin();
    for (let i = 0; i < this.dustState.length; i += 1) {
      const d = this.dustState[i];
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const x =
        left + ((((d.x - left) % DUST_BOX.w) + DUST_BOX.w) % DUST_BOX.w);
      const y = top + ((((d.y - top) % DUST_BOX.h) + DUST_BOX.h) % DUST_BOX.h);
      this.dust.push(x, d.h, y, this.dustRgb, d.size, d.alpha);
    }
    this.dust.end(pointScale);
  }
}
