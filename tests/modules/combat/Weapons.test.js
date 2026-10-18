import { describe, expect, it } from 'vitest';
import { Weapons } from '../../../src/modules/combat/Weapons.js';
import { WEAPON_EVOLUTIONS } from '../../../src/data/weapons.js';

const target = { id: 'e1', x: 600, y: 300, radius: 20 };

function makeWeapons() {
  const shots = [];
  const emitted = [];
  const player = {
    getPosition: () => ({ x: 400, y: 300 }),
    getMuzzlePoint: () => ({ x: 410, y: 300 }),
    getTurretAngle: () => 0,
  };
  const targeting = {
    currentTarget: target,
    currentTargetLocks: [target],
    currentLockAssignments: [],
    predictedAimPointsMap: new Map([['e1', { x: 600, y: 300 }]]),
    targetingUpgradeLevel: 0,
    aimMode: 'auto',
    stickAim: null,
    computeAllocatedShots: (enemy, stats) => stats.multishot,
    getPredictedTargetPosition: () => ({ x: 600, y: 300 }),
    usingDynamicPrediction: () => false,
    getPrimaryAimPoint: () => ({ x: 600, y: 300 }),
  };
  const weapons = new Weapons({
    player: () => player,
    enemies: () => ({ forEachActiveEnemy: () => {} }),
    targeting: () => targeting,
    createBullet: (from, to, damage) => shots.push({ from, to, damage }),
    hitEnemy: () => {},
    emit: (name, payload) => emitted.push({ name, payload }),
    cardEffects: () => ({}),
    tuning: () => ({ aimCooldownMultiplier: 1, cooldownTuning: 1 }),
  });
  return { weapons, shots, emitted };
}

describe('Weapons', () => {
  it('fires the multishot volley at the locked target and announces it', () => {
    const { weapons, shots, emitted } = makeWeapons();
    weapons.shootCooldown = 0;

    weapons.handleShooting(0.016, { multishot: 3, damage: 10 });

    expect(shots).toHaveLength(3);
    shots.forEach((shot) => expect(shot.damage).toBe(10));
    expect(weapons.lastShotTime).toBe(0);
    expect(emitted).toEqual([
      {
        name: 'weapon-fired',
        payload: expect.objectContaining({
          weaponType: 'basic',
          primaryTargetId: 'e1',
          centerlineTarget: { x: 600, y: 300 },
        }),
      },
    ]);
  });

  it('evolves the lance and shows it in the weapon state', () => {
    const { weapons, emitted } = makeWeapons();
    expect(weapons.getWeaponState().evolutions).toEqual([]);

    weapons.evolveWeapon('kinetic');

    expect(weapons.getWeaponState().evolutions).toEqual([
      expect.objectContaining({ family: 'kinetic', apex: false }),
    ]);
    expect(weapons.lancePierce).toBe(WEAPON_EVOLUTIONS.kinetic.pierce);
    expect(emitted.map((entry) => entry.name)).toEqual(['weapon-evolved']);
  });
});
