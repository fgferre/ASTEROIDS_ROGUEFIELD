import { describe, expect, it } from 'vitest';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

/**
 * F9 — Explosion PointLight pool: reuse, return, and exhaustion fallback.
 */
describe('F9: Explosion light pool', () => {
  function createMinimalSystem() {
    const container = createTestContainer('f9-pool');
    const random = container.resolve('random');
    const system = new MenuBackgroundSystem({ random });

    // Simulate pool initialization (normally done when THREE is available)
    system._explosionLightPool = [];
    system._explosionLightPoolSize = 4;
    system.explosions = [];
    system.scene = {
      add() {},
      remove() {},
    };

    // Stub THREE.PointLight
    system.THREE = {
      PointLight: class {
        constructor(color, intensity, distance, decay) {
          this.color = color;
          this.intensity = intensity;
          this.distance = distance;
          this.decay = decay;
          this.visible = true;
          this.position = { copy(p) { this.x = p.x; this.y = p.y; this.z = p.z; }, x: 0, y: 0, z: 0 };
        }
      },
    };

    // Pre-allocate pool like the real init does
    for (let i = 0; i < system._explosionLightPoolSize; i++) {
      const light = new system.THREE.PointLight(0xffaa66, 0, 140, 2);
      light.visible = false;
      system._explosionLightPool.push(light);
    }

    return system;
  }

  it('createExplosion takes light from pool', () => {
    const system = createMinimalSystem();
    expect(system._explosionLightPool.length).toBe(4);

    system.createExplosion({ x: 0, y: 0, z: 0 });

    expect(system._explosionLightPool.length).toBe(3);
    expect(system.explosions.length).toBe(1);
    expect(system.explosions[0].light.visible).toBe(true);
    expect(system.explosions[0].light.intensity).toBe(3.5);
  });

  it('updateExplosions returns expired lights to pool', () => {
    const system = createMinimalSystem();
    system.createExplosion({ x: 0, y: 0, z: 0 });
    expect(system._explosionLightPool.length).toBe(3);

    // Simulate full lifetime elapsed
    system.explosions[0].life = -0.01;
    system.updateExplosions(0.01);

    expect(system.explosions.length).toBe(0);
    expect(system._explosionLightPool.length).toBe(4);
    // Returned light should be invisible
    const returned = system._explosionLightPool[system._explosionLightPool.length - 1];
    expect(returned.visible).toBe(false);
    expect(returned.intensity).toBe(0);
  });

  it('pool exhaustion falls back to allocation without crash', () => {
    const system = createMinimalSystem();

    // Exhaust the pool (4 lights)
    for (let i = 0; i < 4; i++) {
      system.createExplosion({ x: i, y: 0, z: 0 });
    }
    expect(system._explosionLightPool.length).toBe(0);

    // 5th explosion should still work via fallback allocation
    system.createExplosion({ x: 99, y: 0, z: 0 });
    expect(system.explosions.length).toBe(5);
    expect(system.explosions[4].light.intensity).toBe(3.5);
  });

  it('clearActiveExplosions returns all lights to pool', () => {
    const system = createMinimalSystem();
    system.createExplosion({ x: 0, y: 0, z: 0 });
    system.createExplosion({ x: 1, y: 0, z: 0 });
    expect(system._explosionLightPool.length).toBe(2);

    system.clearActiveExplosions();

    expect(system.explosions.length).toBe(0);
    expect(system._explosionLightPool.length).toBe(4);
  });
});
