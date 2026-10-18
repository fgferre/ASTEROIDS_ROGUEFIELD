// The Field's depth (docs/NORTE.md §2 "Fundo com volume"): a far sky
// gradient, haze in layers far below the play plane, a few white stars, the
// broken Ring as a dark arc for scale, and dust drifting between plane and
// haze. Everything sits at real depth, so the perspective camera gives the
// parallax. Each biome (src/data/biomes.js) recolours it through setLook():
// haze and vein colours, the sky, how many far fragments drift below and how
// much of the intact Ring shows.

import { SimplexNoise, createSeededRandom } from './asteroidMesh.js';
import { PointBatch, colorOf } from './batches.js';

const STAR_COUNT = 120;
const STAR_DEPTH = -1500;
const SKY_DEPTH = -1850;
const DUST_COUNT = 40;
const DUST_BOX = { w: 900, h: 700 };
const DEBRIS_COUNT = 48;
const DEBRIS_COLOR = '#16130f';
const STRUCTURE_COLOR = '#07050f';
const STRUCTURE_EDGE = '#8070ff';
const STRUCTURE_EDGE_ALPHA = 0.35;

// A soft white noise cloud on a canvas, faded to transparent at the edges
// (the material colour tints it). `veins` turns the cloud into thin ridges.
function hazeTexture(THREE, seed, veins = false) {
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
      const raw = noise.fbm(u * 3 + seed, v * 3, seed * 0.1, 5);
      const dx = u - 0.5;
      const dy = v - 0.5;
      const edge = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2);
      const n = raw * 0.5 + 0.5;
      const a = veins
        ? Math.pow(Math.max(0, 1 - Math.abs(raw) * 3.2), 3) * edge
        : Math.pow(Math.max(0, n - 0.32) / 0.68, 1.6) * edge * edge;
      const i = (x + y * size) * 4;
      image.data[i] = 255;
      image.data[i + 1] = 255;
      image.data[i + 2] = 255;
      image.data[i + 3] = Math.round(255 * Math.min(1, a));
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.encoding = THREE.sRGBEncoding;
  texture.needsUpdate = true;
  return texture;
}

// The far sky: zenith colour around the field, horizon colour at the rim.
const SKY_VERTEX = `
varying vec2 vPos;
void main() {
  vPos = position.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAGMENT = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
varying vec2 vPos;
void main() {
  float d = length(vPos * vec2(0.8, 1.0)) / 1800.0;
  gl_FragColor = vec4(mix(uZenith, uHorizon, smoothstep(0.0, 1.0, d)), 1.0);
}`;

// The intact Ring of Warden's Reach: two thick arcs and the beams between
// them, far below, as dark silhouettes with a faint lit edge.
function ringStructures(THREE) {
  const group = new THREE.Group();
  const dark = new THREE.MeshBasicMaterial({
    color: colorOf(THREE, STRUCTURE_COLOR),
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const edge = new THREE.MeshBasicMaterial({
    color: colorOf(THREE, STRUCTURE_EDGE),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const center = { x: 1500, z: 1100 };
  const arc = Math.PI * 0.75;
  const start = Math.PI * 0.62;
  [
    { radius: 1500, tube: 46 },
    { radius: 2050, tube: 64 },
  ].forEach(({ radius, tube }) => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 4, 120, arc),
      dark
    );
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(radius - tube, 3, 4, 120, arc),
      edge
    );
    [band, rim].forEach((mesh) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = start;
      mesh.position.set(center.x, 0, center.z);
      group.add(mesh);
    });
  });
  // Beams joining the arcs, every few degrees.
  for (let i = 0; i <= 6; i += 1) {
    const angle = start + (arc * (i + 0.5)) / 7;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(560, 24, 30), dark);
    const mid = 1775;
    beam.position.set(
      center.x + Math.cos(angle) * mid,
      0,
      center.z - Math.sin(angle) * mid
    );
    beam.rotation.y = angle;
    group.add(beam);
  }
  group.position.y = -1080;
  group.traverse((child) => {
    child.renderOrder = -10;
  });
  return { group, dark, edge };
}

export class FieldBackdrop {
  constructor(THREE, scene) {
    this.THREE = THREE;
    const random = createSeededRandom(4242.5);

    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 7000).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: {
          uZenith: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        depthWrite: false,
      })
    );
    this.sky.position.y = SKY_DEPTH;
    this.sky.renderOrder = -30;
    scene.add(this.sky);

    // Near haze over the Ring, veins between, deep haze behind it (the Ring
    // is a silhouette). `opacity` is the haze's at density 1; the vein
    // layer's opacity is the biome's veinDensity. Drawn back to front, the
    // Ring structures between the deep haze and the veins.
    const layers = [
      { y: -300, size: 2600, opacity: 0.2, seed: 3.1, order: -8 },
      { y: -1000, size: 3200, opacity: 1, seed: 5.3, veins: true, order: -9 },
      { y: -1150, size: 5200, opacity: 0.75, seed: 8.7, order: -11 },
    ];
    this.haze = layers.map((layer, i) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(layer.size, layer.size * 0.75).rotateX(
          -Math.PI / 2
        ),
        new THREE.MeshBasicMaterial({
          map: hazeTexture(THREE, layer.seed, layer.veins),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
      mesh.position.set((i - 1) * 300, layer.y, (i % 2 ? -1 : 1) * 200);
      mesh.renderOrder = layer.order;
      mesh.userData = layer;
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

    this.structures = ringStructures(THREE);
    scene.add(this.structures.group);

    // Far fragments drifting well below the field, dark and barely lit;
    // the biome's `debris` share decides how many show.
    this.debris = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({
        color: colorOf(THREE, DEBRIS_COLOR),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
      DEBRIS_COUNT
    );
    this.debrisState = [];
    for (let i = 0; i < DEBRIS_COUNT; i += 1) {
      const depth = 520 + random() * 520;
      this.debrisState.push({
        position: new THREE.Vector3(
          (random() - 0.5) * 2200,
          -depth,
          (random() - 0.5) * 1700
        ),
        rotation: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(random() * 6, random() * 6, random() * 6)
        ),
        scale: new THREE.Vector3(
          1,
          0.5 + random() * 0.6,
          0.7 + random() * 0.6
        ).multiplyScalar(7 + random() * 18),
      });
    }
    this.debrisMatrix = new THREE.Matrix4();
    this.debrisScale = new THREE.Vector3();
    scene.add(this.debris);

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

  /** A biome look from BiomeController. */
  setLook(look) {
    const [near, veins, deep] = this.haze;
    near.material.color.copy(look.hazeColor);
    near.material.opacity = near.userData.opacity * look.hazeDensity;
    deep.material.color.copy(look.hazeColor);
    deep.material.opacity = Math.min(
      1,
      deep.userData.opacity * look.hazeDensity
    );
    veins.material.color.copy(look.veinColor);
    veins.material.opacity = look.veinDensity;
    this.sky.material.uniforms.uZenith.value.copy(look.sky0);
    this.sky.material.uniforms.uHorizon.value.copy(look.sky1);

    const { group, dark, edge } = this.structures;
    group.visible = look.structures > 0.001;
    dark.opacity = look.structures;
    edge.opacity = look.structures * STRUCTURE_EDGE_ALPHA;

    // Fragments past the share shrink away one by one.
    const shown = look.debris * DEBRIS_COUNT;
    for (let i = 0; i < DEBRIS_COUNT; i += 1) {
      const d = this.debrisState[i];
      const k = Math.max(0, Math.min(1, shown - i));
      this.debrisScale.copy(d.scale).multiplyScalar(k);
      this.debrisMatrix.compose(d.position, d.rotation, this.debrisScale);
      this.debris.setMatrixAt(i, this.debrisMatrix);
    }
    this.debris.instanceMatrix.needsUpdate = true;
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
