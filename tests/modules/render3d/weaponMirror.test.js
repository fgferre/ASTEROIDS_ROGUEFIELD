import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { GamePools } from '../../../src/core/GamePools.js';
import CombatSystem from '../../../src/modules/CombatSystem.js';
import { mirrorWeaponEffects } from '../../../src/modules/render3d/weaponMirror.js';
import { createEventBusMock } from '../../__helpers__/mocks.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

describe('weapon mirror', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });

  it('holds a slowed enemy with static on its hull, not a ring round it', () => {
    const combat = new CombatSystem({
      eventBus: createEventBusMock(),
      player: { isDead: false, getPosition: () => ({ x: 100, y: 300 }) },
      enemies: { forEachActiveEnemy: () => {}, applyDamage: () => ({}) },
      physics: { forEachBulletCollision: () => {} },
    });
    const slowed = { id: 'drone-7', x: 200, y: 300, radius: 10 };
    combat.cards.slows.set(slowed, { id: slowed.id, timer: 0.4 });
    const drawn = { ring: 0, path: 0 };
    const px = [];
    const batches = {
      ribbons: {
        ring: () => (drawn.ring += 1),
        tube() {},
        streak() {},
        path: () => (drawn.path += 1),
        px,
        py: [],
      },
      glow: { push() {} },
      smoke: { push() {} },
    };
    mirrorWeaponEffects(THREE, combat, batches, { observe() {} });

    expect(drawn.ring).toBe(0);
    expect(drawn.path).toBeGreaterThan(0);
    // laid over the hull, not round it
    expect(Math.abs(px[0] - slowed.x)).toBeLessThan(slowed.radius * 1.5);
  });
});
