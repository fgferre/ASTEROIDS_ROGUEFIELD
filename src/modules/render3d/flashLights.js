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
// proposta 21/11 (38): a shot's hit lights what it struck in the shot's own
// colour, low and short-reaching (HIT_HEIGHT, HIT_REACH), HIT_PEAK for one
// Lance shot (HIT_DAMAGE) up to twice that; one new hit light a frame, on
// the dimmest of the pool so a bright explosion keeps its light.
const HIT_HEIGHT = 10;
const HIT_REACH = 120;
const HIT_PEAK = 1.4;
const HIT_DAMAGE = 25;

export class FlashLights {
  constructor(THREE, scene) {
    this.seen = new WeakSet();
    this.lights = [];
    this.next = 0;
    this.hitReady = true;
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
    light.distance = LIGHT_DISTANCE;
    light.intensity = intensity;
  }

  /** A shot of `rgb` and `damage` hit something at (x, y) logical. */
  hit(x, y, rgb, damage) {
    if (!this.hitReady) return;
    this.hitReady = false;
    let light = this.lights[0];
    for (const other of this.lights) {
      if (other.intensity < light.intensity) light = other;
    }
    light.color.setRGB(rgb[0], rgb[1], rgb[2]);
    light.position.set(x - HALF_W, HIT_HEIGHT, y - HALF_H);
    light.distance = HIT_REACH;
    light.intensity = HIT_PEAK * Math.min(2, (damage || 0) / HIT_DAMAGE);
  }

  update(dt) {
    this.hitReady = true;
    const k = Math.exp(-dt / DECAY_TIME);
    for (let i = 0; i < this.lights.length; i += 1) {
      const light = this.lights[i];
      light.intensity = light.intensity > 0.02 ? light.intensity * k : 0;
    }
  }
}

// proposta 21/11 (38): a rock whose veins glow (gold, volatile, parasite,
// crystal) lights the field round it in its veins' colour, as its light
// pulses: VEIN_COUNT lights, created up front like the flashes, on the
// veined rocks that glow most, at VEIN_PEAK × their glow, reaching
// VEIN_REACH × their radius from VEIN_RISE × it above their centre.
const VEIN_COUNT = 3;
const VEIN_PEAK = 6;
const VEIN_REACH = 4;
const VEIN_RISE = 1.2;

export class VeinLights {
  constructor(THREE, scene) {
    this.enabled = true;
    this.lights = [];
    for (let i = 0; i < VEIN_COUNT; i += 1) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      scene.add(light);
      this.lights.push(light);
    }
    this.picked = [];
  }

  /** Puts the lights on the brightest veined rocks of `views` (id → view). */
  update(views) {
    const picked = this.picked;
    picked.length = 0;
    if (this.enabled) {
      for (const view of views.values()) {
        if (!view.look?.vein || view.hidden || !view.object.visible) continue;
        const glow = view.rock.glow[0] * view.radius;
        if (picked.length < VEIN_COUNT) picked.push(view);
        else if (
          glow >
          picked[VEIN_COUNT - 1].rock.glow[0] * picked[VEIN_COUNT - 1].radius
        ) {
          picked[VEIN_COUNT - 1] = view;
        } else continue;
        picked.sort(
          (a, b) => b.rock.glow[0] * b.radius - a.rock.glow[0] * a.radius
        );
      }
    }
    this.lights.forEach((light, i) => {
      const view = picked[i];
      if (!view) {
        light.intensity = 0;
        return;
      }
      const { position } = view.object;
      light.color.copy(view.rock.vein);
      light.position.set(position.x, view.radius * VEIN_RISE, position.z);
      light.distance = view.radius * VEIN_REACH;
      light.intensity = VEIN_PEAK * view.rock.glow[0];
    });
  }
}
