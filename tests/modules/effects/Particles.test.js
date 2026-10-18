import { describe, expect, it } from 'vitest';
import { Particles } from '../../../src/modules/effects/Particles.js';

describe('Particles', () => {
  let hitMarkersEnabled = false;
  const particles = new Particles({
    randomRange: () => 0,
    randomCentered: () => 0,
    createMuzzleFlash: () => {},
    hitMarkersEnabled: () => hitMarkersEnabled,
    damageNumbersEnabled: () => true,
  });

  it('adds a hit marker only while the setting is on, read live', () => {
    particles.createHitMarker({ x: 10, y: 20 }, false, 5);
    expect(particles.hitMarkers).toHaveLength(0);

    hitMarkersEnabled = true;
    particles.createHitMarker({ x: 10, y: 20 }, false, 5);
    expect(particles.hitMarkers).toHaveLength(1);
  });

  it('drops a shockwave once it outlives its duration', () => {
    particles.createShockwaveEffect({
      position: { x: 0, y: 0 },
      duration: 0.3,
    });
    particles.updateShockwaves(0.2);
    expect(particles.shockwaves).toHaveLength(1);
    particles.updateShockwaves(0.2);
    expect(particles.shockwaves).toHaveLength(0);
  });
});
