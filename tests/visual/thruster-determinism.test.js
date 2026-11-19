import { describe, expect, it, vi } from 'vitest';
import { PALETTE, withAlpha } from '../../src/data/constants/palette.js';
import EffectsSystem from '../../src/modules/EffectsSystem.js';
import { createTestContainer } from '../__helpers__/test-container.js';
import { createSettingsStub } from '../__helpers__/stubs.js';

/**
 * HV-06 — Same seed must produce exactly the same thruster particles.
 * No Math.random() calls should remain in the thruster path.
 */
describe('HV-06: Thruster particle determinism', () => {
  function createEffectsSystem(seed) {
    const container = createTestContainer(seed);
    const random = container.resolve('random');
    const system = new EffectsSystem({
      random,
      settings: createSettingsStub(),
    });
    system.particleDensity = 1;

    // Stub createParticle to avoid GamePools dependency — returns plain object
    // Must NOT consume any random numbers to avoid contaminating fork state
    system.createParticle = function (x, y, vx, vy, color, size, life, type) {
      return {
        x,
        y,
        vx,
        vy,
        color,
        size,
        life,
        maxLife: life,
        alpha: 1,
        type: type || 'normal',
        rotation: 0,
        rotationSpeed: 0,
        active: true,
      };
    };

    return { system, random };
  }

  function captureParticles(system, args) {
    system.particles = [];
    system.spawnThrusterVFX(...args);
    return system.particles.map((p) => ({
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      size: p.size,
      life: p.life,
      color: p.color,
    }));
  }

  it('reset + replay produces identical thruster particles', () => {
    const args = [100, 200, 0, -1, 0.8, 'main', 1.0];
    const { system, random } = createEffectsSystem('thruster-det-1');

    // Reset to establish known baseline fork state
    random.reset();
    system.reset({ refreshForks: true });

    const particlesA = captureParticles(system, args);
    expect(particlesA.length).toBeGreaterThan(0);

    // Reset again to replay
    random.reset();
    system.reset({ refreshForks: true });

    const particlesB = captureParticles(system, args);

    expect(particlesA).toEqual(particlesB);
  });

  it('no Math.random calls during thruster generation', () => {
    const { system } = createEffectsSystem('thruster-det-spy');
    const spy = vi.spyOn(Math, 'random');

    try {
      system.particles = [];
      system.spawnThrusterVFX(100, 200, 0, -1, 0.8, 'main', 1.0);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("paints the sparks in the hull's accent the event carries, the hot core white", () => {
    const { system } = createEffectsSystem('thruster-accent');
    system.particles = [];
    for (let i = 0; i < 20; i += 1) {
      system.playerEffects.onThruster({
        position: { x: 100, y: 200 },
        direction: { x: 0, y: -1 },
        intensity: 1,
        type: 'main',
        visualLevel: 5,
        accent: 'shot',
      });
    }
    const colors = new Set(system.particles.map((p) => p.color));
    expect(colors).toEqual(
      new Set([PALETTE.text, PALETTE.shot, withAlpha(PALETTE.shot, 0.55)])
    );
  });
});
