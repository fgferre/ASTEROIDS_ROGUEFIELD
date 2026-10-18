// Explosions light their surroundings: a fixed pool of point lights, all
// created up front (Three recompiles every lit material when the light count
// changes), idle at intensity 0. Each new shockwave lights one, which decays
// fast; the oldest is reused when the pool is full.

import { HALF_H, HALF_W } from './batches.js';

// proposta 17/10: pool size, height over the plane, reach and decay.
const POOL_SIZE = 6;
const LIGHT_HEIGHT = 30;
const LIGHT_DISTANCE = 340;
const PEAK = 3.2;
// Waves this big (logical radius) light at full PEAK; smaller ones less.
const FULL_RADIUS = 120;
const DECAY_TIME = 0.16;

export class FlashLights {
  constructor(THREE, scene) {
    this.seen = new WeakSet();
    this.lights = [];
    this.next = 0;
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, LIGHT_DISTANCE, 2);
      scene.add(light);
      this.lights.push(light);
    }
  }

  /**
   * Lights a flash for each wave not seen before; `rgb` its color. Returns
   * true the first time a wave is seen.
   */
  observe(wave, rgb) {
    if (this.seen.has(wave)) return false;
    this.seen.add(wave);
    this.light(
      wave.x,
      wave.y,
      rgb[0],
      rgb[1],
      rgb[2],
      PEAK * Math.min(1, Math.max(0.25, (wave.maxRadius || 0) / FULL_RADIUS))
    );
    return true;
  }

  /** Lights the next pooled light at (x, y) logical. */
  light(x, y, r, g, b, intensity) {
    const light = this.lights[this.next];
    this.next = (this.next + 1) % this.lights.length;
    light.color.setRGB(r, g, b);
    light.position.set(x - HALF_W, LIGHT_HEIGHT, y - HALF_H);
    light.intensity = intensity;
  }

  update(dt) {
    const k = Math.exp(-dt / DECAY_TIME);
    for (let i = 0; i < this.lights.length; i += 1) {
      const light = this.lights[i];
      light.intensity = light.intensity > 0.02 ? light.intensity * k : 0;
    }
  }
}
