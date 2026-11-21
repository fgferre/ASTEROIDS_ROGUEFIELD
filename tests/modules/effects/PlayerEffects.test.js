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
});
