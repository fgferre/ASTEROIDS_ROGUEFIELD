// The Field's distant structures (docs/NORTE.md §2 "Fundo com volume"): the
// broken Ring as a dark arc for scale, the intact Ring of Warden's Reach, and
// dark fragments drifting below the field — 3D silhouettes at real depth in
// front of the space behind them (spaceField.js). Each biome
// (src/data/biomes.js) decides through setLook() how many far fragments
// drift below and how much of the intact Ring shows.

import { createSeededRandom } from './asteroidMesh.js';
import { colorOf } from './batches.js';

const DEBRIS_COUNT = 48;
const DEBRIS_COLOR = '#16130f';
const STRUCTURE_COLOR = '#07050f';
const STRUCTURE_EDGE = '#8070ff';
const STRUCTURE_EDGE_ALPHA = 0.35;
// The victory epilogue's "wake" (setWake): the Ring and the structures light
// up from their dark silhouettes to these, bright enough to bloom.
const RING_COLOR = '#030508';
// The dark Ring lets a little of the nebula through, as if far away in haze.
const RING_OPACITY = 0.7;
const RING_WAKE_COLOR = '#9a8cff';
const RING_WAKE_GAIN = 2.4;
const STRUCTURE_WAKE_COLOR = '#2c2470';

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

    // The broken Ring: a flattened dark band far below, a faint silhouette
    // whose break sits inside the field's view.
    const arc = Math.PI * 0.9;
    const radius = 2200;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 9, 8, 160, arc),
      new THREE.MeshBasicMaterial({
        color: colorOf(THREE, RING_COLOR),
        transparent: true,
        opacity: RING_OPACITY,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2 - 0.12;
    ring.rotation.z = (50 * Math.PI) / 180 - arc;
    ring.scale.set(1, 1, 0.4);
    ring.position.set(-1900, -900, -1700);
    ring.renderOrder = -10;
    scene.add(ring);
    this.ring = ring;
    this.ringColor = colorOf(THREE, RING_COLOR);
    this.ringWakeColor = colorOf(THREE, RING_WAKE_COLOR).multiplyScalar(
      RING_WAKE_GAIN
    );

    this.structures = ringStructures(THREE);
    scene.add(this.structures.group);
    this.structureColor = colorOf(THREE, STRUCTURE_COLOR);
    this.structureWakeColor = colorOf(THREE, STRUCTURE_WAKE_COLOR);
    this.structureShare = 0;
    this.wake = 0;

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
  }

  /** A biome look from BiomeController. */
  setLook(look) {
    this.structureShare = look.structures;
    this.applyStructures();

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

  /** The Ring's wake, 0 (dark silhouette) to 1 (lit), for the epilogue. */
  setWake(wake) {
    if (wake === this.wake) return;
    this.wake = wake;
    this.ring.material.color
      .copy(this.ringColor)
      .lerp(this.ringWakeColor, wake);
    this.ring.material.opacity = RING_OPACITY + (1 - RING_OPACITY) * wake;
    this.structures.dark.color
      .copy(this.structureColor)
      .lerp(this.structureWakeColor, wake);
    this.applyStructures();
  }

  // The biome's share of the intact Ring, raised to full while it wakes.
  applyStructures() {
    const { group, dark, edge } = this.structures;
    const share = Math.max(this.structureShare, this.wake);
    group.visible = share > 0.001;
    dark.opacity = share;
    edge.opacity =
      share * (STRUCTURE_EDGE_ALPHA + (1 - STRUCTURE_EDGE_ALPHA) * this.wake);
  }
}
