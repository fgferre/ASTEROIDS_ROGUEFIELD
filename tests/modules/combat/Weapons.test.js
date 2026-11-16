import { describe, expect, it } from 'vitest';
import { Weapons } from '../../../src/modules/combat/Weapons.js';
import { WEAPON_EVOLUTIONS } from '../../../src/data/weapons.js';

const target = { id: 'e1', x: 600, y: 300, radius: 20 };

// `lead`: the lock's lead point (Targeting's aim for a travelling shot).
function makeWeapons(lead = { x: 600, y: 300 }) {
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
    predictedAimPointsMap: new Map([['e1', lead]]),
    targetingUpgradeLevel: 0,
    aimMode: 'auto',
    stickAim: null,
    computeAllocatedShots: (enemy, stats) => stats.multishot,
    getPredictedTargetPosition: () => lead,
    usingDynamicPrediction: () => false,
    getPrimaryAimPoint: () => lead,
  };
  const weapons = new Weapons({
    player: () => player,
    enemies: () => ({ forEachActiveEnemy: (callback) => callback(target) }),
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
          pattern: 'stream',
          primaryTargetId: 'e1',
          centerlineTarget: { x: 600, y: 300 },
        }),
      },
    ]);
  });

  it('aims a beam where a crossing lock is now, not at its lead point', () => {
    const { weapons } = makeWeapons({ x: 600, y: 340 });
    weapons.shootCooldown = 0;
    weapons.takeWeapon('harmonic');
    weapons.shots = 3; // the 4th shot is the beam

    weapons.handleShooting(0.016, { multishot: 1, damage: 10 });

    expect(weapons.beams).toHaveLength(1);
    expect(weapons.beams[0].angle).toBeCloseTo(
      Math.atan2(300 - 300, 600 - 410)
    );
  });

  it('still leads a crossing lock with a travelling shot', () => {
    const { weapons, shots } = makeWeapons({ x: 600, y: 340 });
    weapons.shootCooldown = 0;

    weapons.handleShooting(0.016, { multishot: 1, damage: 10 });

    expect(shots).toHaveLength(1);
    expect(shots[0].to).toEqual({ x: 600, y: 340 });
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
