// Mirrors PickupSystem tokens as machined pucks (fieldTokens.js), instanced
// per kind: a matte body and its light (rim, glyph, hover lens) in the
// pickup colour, which pulses and goes dark in the blink steps of the last
// seconds. Each token hovers and rocks a little. At most POOL drawn.

import { PICKUP_KINDS, PICKUP_TOKEN } from '../../data/pickups.js';
import { rgbOf } from './batches.js';
import { InstanceBatch, tokenParts } from './fieldTokens.js';
import { addRimLight } from './rimLight.js';

const POOL = 8;
const BLINK_WINDOW = 0.12; // s per on/off step
// The light's luminance whatever the pickup colour (amber is dimmer than
// gold or cyan at the same value), just past the bloom threshold.
const LIGHT_LUMA = 0.72;
// the light in a blink's off step: dark glass, the glyph still reads
const BLINK_GAIN = 0.06;
const HOVER = 5;
const WHITE = [1, 1, 1];

export class PickupMirror {
  constructor(THREE, scene) {
    this.THREE = THREE;
    const bodyMaterial = addRimLight(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.2,
        roughness: 0.75,
      })
    );
    const lightMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      toneMapped: false,
    });
    this.kinds = {};
    for (const kind of Object.keys(PICKUP_KINDS)) {
      const { body, light } = tokenParts(THREE, kind);
      const view = {
        body: new InstanceBatch(THREE, body, bodyMaterial, POOL),
        light: new InstanceBatch(THREE, light, lightMaterial, POOL),
      };
      scene.add(view.body.mesh, view.light.mesh);
      this.kinds[kind] = view;
    }
  }

  update(pickups) {
    const views = Object.values(this.kinds);
    views.forEach((view) => {
      view.body.begin();
      view.light.begin();
    });
    const count = Math.min(pickups.length, POOL);
    for (let i = 0; i < count; i += 1) {
      const p = pickups[i];
      const view = this.kinds[p.kind];
      const radius = p.radius || PICKUP_TOKEN.radius;
      const h = HOVER + 0.6 * Math.sin(p.age * 2.4 + i);
      const yaw = 0.3 * Math.sin(p.age * 0.9 + i);
      const pitch = 0.1 * Math.sin(p.age * 1.7 + i);
      const roll = 0.1 * Math.cos(p.age * 1.3 + i);
      view.body.push(p.x, p.y, h, yaw, pitch, roll, radius, WHITE, 1);
      const blinking =
        p.lifetime - p.age < PICKUP_TOKEN.blinkTime &&
        Math.floor(p.age / BLINK_WINDOW) % 2 === 1;
      const rgb = rgbOf(this.THREE, p.color);
      const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      const gain = blinking
        ? BLINK_GAIN
        : (LIGHT_LUMA / luma) * (1 + 0.15 * Math.sin(p.age * 5 + i));
      view.light.push(p.x, p.y, h, yaw, pitch, roll, radius, rgb, gain);
    }
    views.forEach((view) => {
      view.body.end();
      view.light.end();
    });
  }
}
