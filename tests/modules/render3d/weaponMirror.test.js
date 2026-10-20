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

  it("draws the Solar Flare's glow on a burn only while the lance carries the thermal Apex", () => {
    const combat = new CombatSystem({
      eventBus: createEventBusMock(),
      player: { isDead: false, getPosition: () => ({ x: 100, y: 300 }) },
      enemies: { forEachActiveEnemy: () => {}, applyDamage: () => ({}) },
      physics: { forEachBulletCollision: () => {} },
    });
    const burning = { id: 'burning', x: 200, y: 300, radius: 10 };
    combat.cards.ignite(burning, 10, {
      duration: 1.5,
      ticks: 3,
      damageFraction: 0.3,
    });
    const glowsOnBurn = () => {
      const glows = [];
      const batches = {
        ribbons: { ring() {}, tube() {}, path() {}, px: [], py: [] },
        glow: { push: (x, height, y) => glows.push([x, y]) },
      };
      mirrorWeaponEffects(THREE, combat, batches, { observe() {} });
      return glows.filter(([x, y]) => x === burning.x && y === burning.y)
        .length;
    };

    // Sunheart: the Furnace Corona's own Apex.
    combat.weapons.takeWeapon('furnace-corona');
    combat.weapons.apexWeapon('thermal');
    expect(glowsOnBurn()).toBe(1);

    combat.weapons.takeWeapon('lance');
    expect(glowsOnBurn()).toBe(2);
  });
});
