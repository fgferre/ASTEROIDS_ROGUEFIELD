import { describe, expect, it } from 'vitest';
import MenuBackgroundSystem from '../../src/modules/MenuBackgroundSystem.js';
import { createTestContainer } from '../__helpers__/setup.js';

/**
 * R1 — Fade of one asteroid must NOT alter the opacity of another asteroid
 * that shares the same baseMaterials[] entry.
 */
describe('R1: Material fade isolation', () => {
  function createMinimalSystem() {
    const container = createTestContainer('r1-fade');
    const random = container.resolve('random');
    const system = new MenuBackgroundSystem({ random });

    // Stub the shared material used by baseMaterials[]
    const sharedMaterial = {
      opacity: 1,
      transparent: false,
      needsUpdate: false,
      userData: { isProceduralAsteroid: true },
      clone() {
        return {
          opacity: this.opacity,
          transparent: this.transparent,
          needsUpdate: this.needsUpdate,
          userData: { ...this.userData },
          dispose() {},
          clone() {
            return { ...this, dispose() {} };
          },
        };
      },
      dispose() {},
    };

    system.baseMaterials = [sharedMaterial];

    return { system, sharedMaterial };
  }

  function createAsteroid(system, sharedMaterial) {
    const mesh = {
      material: sharedMaterial,
      visible: true,
      position: { set() {}, copy() {} },
      scale: { copy() {} },
      rotation: { set() {} },
    };
    return {
      active: true,
      fading: false,
      fadeElapsed: 0,
      fragmentationLevel: 0,
      material: sharedMaterial,
      mesh,
      body: {
        sleep() {},
        position: { set() {}, x: 0, y: 0, z: 0 },
        velocity: { set() {} },
        angularVelocity: { set() {} },
      },
      _fadeClonedMaterial: false,
      _sharedMaterial: null,
    };
  }

  it('fading asteroid does not contaminate shared material opacity', () => {
    const { system, sharedMaterial } = createMinimalSystem();

    const asteroidA = createAsteroid(system, sharedMaterial);
    const asteroidB = createAsteroid(system, sharedMaterial);

    // Both start with the same shared material
    expect(asteroidA.material).toBe(asteroidB.material);
    expect(sharedMaterial.opacity).toBe(1);

    // Start fade on asteroid A
    system.startFadeOut(asteroidA);

    // A should now have a cloned material
    expect(asteroidA._fadeClonedMaterial).toBe(true);
    expect(asteroidA.material).not.toBe(sharedMaterial);
    expect(asteroidA.material.transparent).toBe(true);
    expect(asteroidA.mesh.material).toBe(asteroidA.material);

    // B should still reference the shared material
    expect(asteroidB.material).toBe(sharedMaterial);

    // Simulate fade progress on A
    asteroidA.material.opacity = 0.3;
    asteroidA.material.needsUpdate = true;

    // Shared material must remain untouched
    expect(sharedMaterial.opacity).toBe(1);
    expect(asteroidB.material.opacity).toBe(1);
  });

  it('deactivation restores shared material and disposes clone', () => {
    const { system, sharedMaterial } = createMinimalSystem();

    const asteroid = createAsteroid(system, sharedMaterial);
    system.activeAsteroids = [asteroid];
    system.proceduralAsteroidCount = 1;
    system.hasProceduralAsteroids = true;

    system.startFadeOut(asteroid);
    const clonedMaterial = asteroid.material;

    let disposed = false;
    clonedMaterial.dispose = () => {
      disposed = true;
    };

    // Simulate fade completing
    asteroid.material.opacity = 0;

    system.deactivateAsteroid(asteroid);

    // Should restore shared material
    expect(asteroid.material).toBe(sharedMaterial);
    expect(asteroid.mesh.material).toBe(sharedMaterial);
    expect(asteroid._fadeClonedMaterial).toBe(false);
    expect(asteroid._sharedMaterial).toBeNull();
    expect(disposed).toBe(true);
    expect(sharedMaterial.opacity).toBe(1);
  });

  it('two simultaneous fades maintain independent opacities', () => {
    const { system, sharedMaterial } = createMinimalSystem();

    const asteroidA = createAsteroid(system, sharedMaterial);
    const asteroidB = createAsteroid(system, sharedMaterial);

    system.startFadeOut(asteroidA);
    system.startFadeOut(asteroidB);

    // Both cloned, both independent
    expect(asteroidA.material).not.toBe(asteroidB.material);
    expect(asteroidA.material).not.toBe(sharedMaterial);
    expect(asteroidB.material).not.toBe(sharedMaterial);

    // Set different opacities
    asteroidA.material.opacity = 0.7;
    asteroidB.material.opacity = 0.2;

    expect(asteroidA.material.opacity).toBe(0.7);
    expect(asteroidB.material.opacity).toBe(0.2);
    expect(sharedMaterial.opacity).toBe(1);
  });
});
