import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import CombatSystem from '../../src/modules/CombatSystem.js';
import { UPGRADE_FAMILIES } from '../../src/data/upgrades/families.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

// Afterburn, the Maneuver synergy: the dash leaves a trail that burns.
const [BONUS] = UPGRADE_FAMILIES.maneuver.bonus.effects;
const AFTERBURN = BONUS.payload;
const FRAME = 0.05;

function makeEnemy(id, x, y, extra = {}) {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 10,
    health: 100,
    type: 'drone',
    ...extra,
  };
}

function makeCombat(list = []) {
  const eventBus = createEventBusMock();
  const player = {
    isDead: false,
    dashTimer: 0,
    position: { x: 100, y: 300 },
    getPosition() {
      return { ...this.position };
    },
    getStats: () => ({ multishot: 1, damage: 10 }),
  };
  const enemies = {
    forEachActiveEnemy(callback) {
      list.forEach(callback);
    },
    applyDamage(enemy, damage) {
      enemy.health = Math.max(0, enemy.health - damage);
      const killed = enemy.health <= 0;
      if (killed) enemy.destroyed = true;
      return { killed, remainingHealth: enemy.health };
    },
  };
  const physics = { forEachBulletCollision: () => {} };
  const combat = new CombatSystem({ eventBus, player, enemies, physics });
  // The family bonus, emitted the way UpgradeSystem applies it.
  eventBus.emit(BONUS.event, { ...AFTERBURN, synergy: 'maneuver', level: 1 });
  return { combat, player };
}

// A dash from x = 100 to x = 132 along y = 300, in two frames.
function dash(combat, player) {
  player.dashTimer = 0.1;
  combat.updateWeaponEffects(FRAME);
  player.position.x = 132;
  combat.updateWeaponEffects(FRAME);
  player.dashTimer = 0;
}

describe('Afterburn (Maneuver synergy)', () => {
  beforeAll(() => {
    if (!GamePools.initialized) GamePools.initialize();
  });
  beforeEach(() => setupGlobalMocks());
  afterEach(() => {
    GamePools.releaseAll();
    cleanupGlobalState();
  });

  it('drops a point every 8 px of dash travel, and none once the dash ends', () => {
    const { combat, player } = makeCombat();
    dash(combat, player);
    expect(combat.afterburnTrail.map((p) => p.x)).toEqual([
      100, 108, 116, 124, 132,
    ]);
    expect(combat.afterburnTrail.map((p) => p.joined)).toEqual([
      false,
      true,
      true,
      true,
      true,
    ]);

    player.position.x = 170;
    combat.updateWeaponEffects(FRAME);
    expect(combat.afterburnTrail).toHaveLength(5);
  });

  it('burns an enemy on the trail once per tick, never a phased Shade', () => {
    const drone = makeEnemy('drone', 116, 320);
    const shade = makeEnemy('shade', 124, 300, {
      type: 'shade',
      intangible: true,
    });
    const far = makeEnemy('far', 116, 380);
    const { combat, player } = makeCombat([drone, shade, far]);
    dash(combat, player);
    combat.updateWeaponEffects(AFTERBURN.tickInterval);
    expect(drone.health).toBe(100 - AFTERBURN.damage);
    expect(shade.health).toBe(100);
    expect(far.health).toBe(100);
  });

  it('goes out after its life and burns nothing more', () => {
    const drone = makeEnemy('drone', 116, 320);
    const { combat, player } = makeCombat([drone]);
    dash(combat, player);
    combat.updateWeaponEffects(AFTERBURN.tickInterval);
    combat.updateWeaponEffects(AFTERBURN.life);
    expect(combat.afterburnTrail).toHaveLength(0);
    combat.updateWeaponEffects(AFTERBURN.tickInterval);
    expect(drone.health).toBe(100 - AFTERBURN.damage);
  });
});
