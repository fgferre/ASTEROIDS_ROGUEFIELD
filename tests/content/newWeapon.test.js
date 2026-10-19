// A new weapon is one content file and no engine line: the Needle Fan
// (tests/__fixtures__/weapons/needle.js, never shipped) joins the registry
// here as if it were src/content/weapons/needle.js.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import needle from '../__fixtures__/weapons/needle.js';
import { createEventBusMock } from '../__helpers__/mocks.js';

// The global setup has already loaded the game on the real registry: the
// modules are loaded again, on this one, before the tests.
let GamePools;
let RandomService;
let UPGRADE_LIBRARY;
let CombatSystem;
let ProgressionSystem;

vi.mock('../../src/content/registry.js', async (importOriginal) => {
  const registry = await importOriginal();
  const { default: weapon } = await import('../__fixtures__/weapons/needle.js');
  const weapons = [...registry.listContent('weapons'), weapon];
  return {
    listContent: (kind) =>
      kind === 'weapons' ? weapons : registry.listContent(kind),
    getContent: (kind, id) =>
      kind === 'weapons' && id === weapon.id
        ? weapon
        : registry.getContent(kind, id),
  };
});

const DAMAGE = 10;

function makeRun() {
  const eventBus = createEventBusMock();
  const progression = new ProgressionSystem({
    random: new RandomService(7),
    eventBus,
    player: {},
    ui: {},
    effects: {},
    'xp-orbs': { attachProgression: () => {} },
  });
  progression.level = 10;
  const combat = new CombatSystem({
    eventBus,
    player: {
      isDead: false,
      getPosition: () => ({ x: 100, y: 300 }),
      getTurretAngle: () => 0,
      getMuzzlePoint: () => ({ x: 116, y: 300 }),
      getStats: () => ({ multishot: 1, damage: DAMAGE }),
    },
    enemies: { forEachActiveEnemy: () => {} },
    physics: { forEachBulletCollision: () => {} },
  });
  return { progression, combat };
}

describe('a weapon defined only as a content file', () => {
  beforeAll(async () => {
    vi.resetModules();
    ({ GamePools } = await import('../../src/core/GamePools.js'));
    ({ default: RandomService } = await import(
      '../../src/core/RandomService.js'
    ));
    ({ default: UPGRADE_LIBRARY } = await import(
      '../../src/data/upgrades/index.js'
    ));
    ({ default: CombatSystem } = await import(
      '../../src/modules/CombatSystem.js'
    ));
    ({ default: ProgressionSystem } = await import(
      '../../src/modules/ProgressionSystem.js'
    ));
    GamePools.initialize();
  });
  afterEach(() => GamePools.releaseAll());

  it('brings its card to the catalog, ruling out the other weapon cards', () => {
    const card = UPGRADE_LIBRARY.at(-1);
    expect(card).toMatchObject({ id: 'needle_coil', order: 900 });
    const otherWeaponCards = UPGRADE_LIBRARY.filter(
      (upgrade) =>
        upgrade.id !== card.id &&
        upgrade.levels.some((level) =>
          level.effects.some((effect) => effect.event === 'upgrade-weapon')
        )
    ).map((upgrade) => upgrade.id);
    expect(otherWeaponCards).toContain('harmonic_resonator');
    expect([...card.excludes].sort()).toEqual(otherWeaponCards.sort());
    const harmonic = UPGRADE_LIBRARY.find(
      (upgrade) => upgrade.id === 'harmonic_resonator'
    );
    expect(harmonic.excludes).toContain('needle_coil');
  });

  it('its card swaps the cannon for it, and it fires its own patterns and numbers', () => {
    const { progression, combat } = makeRun();
    expect(progression.applyUpgrade('needle_coil')).toBe(true);
    expect(combat.getWeaponState()).toMatchObject({
      weaponId: 'needle',
      chip: 'NEEDLE',
      shotsToBeam: 3,
    });

    const stats = { multishot: 1, damage: DAMAGE };
    const [beam, fan] = needle.fire;
    combat.handleShooting(5, stats);
    expect(combat.bullets).toHaveLength(fan.bolts);
    combat.bullets.forEach((bolt) => {
      expect(bolt.kind).toBe('lance');
      expect(Math.hypot(bolt.vx, bolt.vy)).toBeCloseTo(
        combat.bulletSpeed * needle.projectile.speedMultiplier,
        6
      );
      expect(bolt.damage).toBeCloseTo(
        DAMAGE * needle.projectile.damageMultiplier,
        6
      );
    });

    combat.handleShooting(5, stats);
    combat.handleShooting(5, stats);
    expect(combat.bullets).toHaveLength(2 * fan.bolts);
    expect(combat.beams).toHaveLength(1);
    expect(combat.beams[0].colors).toEqual(needle.colors);
    expect(combat.lastShotTime).toBe(-beam.cooldownPenalty);
  });
});
