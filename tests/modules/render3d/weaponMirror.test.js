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

function makeCombat() {
  return new CombatSystem({
    eventBus: createEventBusMock(),
    player: { isDead: false, getPosition: () => ({ x: 100, y: 300 }) },
    enemies: { forEachActiveEnemy: () => {}, applyDamage: () => ({}) },
    physics: { forEachBulletCollision: () => {} },
  });
}

// Counts what the mirror draws; ribbons keep their point arrays.
function makeBatches(drawn) {
  const count = (key) => () => (drawn[key] = (drawn[key] || 0) + 1);
  return {
    ribbons: {
      ring: count('ring'),
      tube: count('tube'),
      streak: count('streak'),
      path: count('path'),
      px: new Float32Array(64),
      py: new Float32Array(64),
    },
    glow: { push: count('glow') },
    smoke: { push() {} },
  };
}

// A bolt across six kinked segments, as CardEffects.addArc lays one.
function boltArc() {
  const points = [];
  for (let i = 0; i <= 6; i += 1) {
    points.push({
      x: 100 + i * 20,
      y: 300 + (i % 2 ? 6 : -6) * (i % 6 ? 1 : 0),
    });
  }
  return { points, life: 0.2, maxLife: 0.2, bolt: true, heavy: false };
}

describe('weapon mirror', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });

  it('holds a slowed enemy with static on its hull, not a ring round it', () => {
    const combat = makeCombat();
    const slowed = { id: 'drone-7', x: 200, y: 300, radius: 10 };
    combat.cards.slows.set(slowed, { id: slowed.id, timer: 0.4 });
    const drawn = {};
    const batches = makeBatches(drawn);
    const { px } = batches.ribbons;
    mirrorWeaponEffects(THREE, combat, batches, { observe() {} });

    expect(drawn.ring).toBeUndefined();
    expect(drawn.path).toBeGreaterThan(0);
    // laid over the hull, not round it
    expect(Math.abs(px[0] - slowed.x)).toBeLessThan(slowed.radius * 1.5);
  });

  it('strikes as forked lightning and lights the hull once where a bolt lands', () => {
    const combat = makeCombat();
    combat.cards.arcs.push(boltArc());
    const drawn = {};
    const lights = [];
    const flashes = { observe() {}, light: (...args) => lights.push(args) };
    mirrorWeaponEffects(THREE, combat, makeBatches(drawn), flashes);
    mirrorWeaponEffects(THREE, combat, makeBatches({}), flashes);

    expect(drawn.path).toBe(3); // channel, glow, core
    expect(drawn.tube).toBeGreaterThan(0); // forks off its kinks
    expect(lights).toHaveLength(1);
    expect(lights[0][0]).toBe(220); // at its last point
  });
});
