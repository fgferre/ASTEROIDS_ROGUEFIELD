import { describe, expect, it, vi } from 'vitest';
import { PlayerEffects } from '../../../src/modules/effects/PlayerEffects.js';

describe('PlayerEffects', () => {
  it("lets the ship's death show the ship: a short flash, hull plates, no rings", () => {
    const particles = [];
    const createShockwaveEffect = vi.fn();
    const addScreenFlash = vi.fn();
    const effects = new PlayerEffects({
      particleEffects: { particles, createShockwaveEffect },
      createParticle: (x, y, vx, vy, color, size, life, type) => ({ type }),
      randomFloat: () => 0.6,
      getScaledParticleCount: (count) => Math.round(count),
      addScreenShake: () => {},
      addScreenFlash,
      addFreezeFrame: () => {},
      playSlowMotion: () => {},
      emit: () => {},
      player: () => null,
    });

    effects.createEpicShipExplosion({ x: 100, y: 100 });
    expect(createShockwaveEffect).not.toHaveBeenCalled();
    expect(addScreenFlash).toHaveBeenCalledTimes(1);
    expect(addScreenFlash.mock.calls[0][1]).toBeLessThanOrEqual(0.05);
    expect(particles.length).toBeGreaterThan(0);
    particles.forEach((p) => {
      expect(p.type).toBe('debris');
      expect(p.material).toBe('metal');
    });
  });

  it("keeps a fusion off the screen while a boss's fall shakes it", () => {
    const addScreenShake = vi.fn();
    const addScreenFlash = vi.fn();
    const effects = new PlayerEffects({
      particleEffects: { particles: [] },
      createParticle: () => ({}),
      randomFloat: () => 0.5,
      getScaledParticleCount: (count) => Math.round(count),
      particleDensity: () => 1,
      addScreenShake,
      addScreenFlash,
      addFreezeFrame: () => {},
      playSlowMotion: () => {},
      emit: () => {},
      player: () => null,
    });
    const fusion = { position: { x: 10, y: 10 }, tier: 2 };

    effects.createOrbFusionEffect(fusion, { screen: false });
    expect(addScreenShake).not.toHaveBeenCalled();
    expect(addScreenFlash).not.toHaveBeenCalled();
    effects.createOrbFusionEffect(fusion);
    expect(addScreenShake).toHaveBeenCalledTimes(1);
    expect(addScreenFlash).toHaveBeenCalledTimes(1);
  });
});
