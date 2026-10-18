// Mirrors PickupSystem tokens into Three objects: a dark matte disc, an
// emissive ring that pulses (and blinks in the last seconds) and a small
// additive core, all in the pickup colour. Pooled; hidden when unused.

import { PICKUP_TOKEN } from '../../data/pickups.js';
import { HALF_H, HALF_W, colorOf } from './batches.js';

const POOL = 8;
const BLINK_WINDOW = 0.12; // s per on/off step
const RING_GAIN = 1.0;

export class PickupMirror {
  constructor(THREE, scene) {
    this.THREE = THREE;
    this.views = [];
    const discGeo = new THREE.CircleGeometry(1, 24);
    const ringGeo = new THREE.RingGeometry(0.78, 1, 32);
    const coreGeo = new THREE.CircleGeometry(0.34, 16);
    for (let i = 0; i < POOL; i += 1) {
      const group = new THREE.Group();
      group.visible = false;
      const disc = new THREE.Mesh(
        discGeo,
        new THREE.MeshStandardMaterial({
          color: colorOf(THREE, '#0b0e14'),
          roughness: 0.85,
          metalness: 0.1,
        })
      );
      const ring = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(),
          toneMapped: false,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const core = new THREE.Mesh(
        coreGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(),
          toneMapped: false,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      ring.position.y = 0.2;
      core.position.y = 0.3;
      for (const m of [disc, ring, core]) {
        m.rotation.x = -Math.PI / 2;
        group.add(m);
      }
      scene.add(group);
      this.views.push({ group, disc, ring, core, kind: null });
    }
  }

  update(pickups) {
    const count = Math.min(pickups.length, POOL);
    for (let i = 0; i < POOL; i += 1) {
      const view = this.views[i];
      if (i >= count) {
        view.group.visible = false;
        continue;
      }
      const p = pickups[i];
      const radius = p.radius || PICKUP_TOKEN.radius;
      view.group.visible = true;
      view.group.position.set(p.x - HALF_W, 3, p.y - HALF_H);
      view.group.scale.setScalar(radius);
      if (view.kind !== p.color) {
        view.kind = p.color;
        view.ring.material.color
          .copy(colorOf(this.THREE, p.color))
          .multiplyScalar(RING_GAIN);
        view.core.material.color.copy(colorOf(this.THREE, p.color));
      }
      const pulse = 1 + 0.12 * Math.sin(p.age * 5 + i);
      view.ring.scale.setScalar(pulse);
      view.core.scale.setScalar(pulse);
      const blinking =
        p.lifetime - p.age < PICKUP_TOKEN.blinkTime &&
        Math.floor(p.age / BLINK_WINDOW) % 2 === 1;
      view.ring.visible = !blinking;
    }
  }
}
