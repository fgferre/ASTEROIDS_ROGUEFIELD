import { describe, expect, it, vi } from 'vitest';

import RandomService from '../../../src/core/RandomService.js';
import {
  AFFIX_IDS,
  AFFIX_XP_BONUS,
  ELITE_AFFIXES,
  rollAffixes,
} from '../../../src/data/enemies/affixes.js';
import {
  HUSK_COMPONENTS,
  HUSK_CONFIG,
} from '../../../src/data/enemies/husk.js';
import { RAM_COMPONENTS, RAM_CONFIG } from '../../../src/data/enemies/ram.js';
import { EnemyFactory } from '../../../src/modules/enemies/base/EnemyFactory.js';
import { AFFIX_GLYPH_NAMES } from '../../../src/modules/enemies/components/affixGlyphs.js';
import { RewardManager } from '../../../src/modules/enemies/managers/RewardManager.js';
import { EnemyDamageSystem } from '../../../src/modules/enemies/systems/EnemyDamageSystem.js';
import Husk from '../../../src/modules/enemies/types/Husk.js';
import Ram from '../../../src/modules/enemies/types/Ram.js';
import { createDeterministicRandom } from '../../__helpers__/stubs.js';

const SUPPORT_KINDS = [
  'drone',
  'hunter',
  'mine',
  'husk',
  'ram',
  'weaver',
  'bulwark',
];

const createSystem = (overrides = {}) => ({
  eventBus: { emit: vi.fn() },
  getCachedPlayer: () => ({ position: { x: 400, y: 100 } }),
  applyDamage: vi.fn(),
  acquireEnemyViaFactory: vi.fn((type, config) => ({ type, ...config })),
  waveManager: { registerDynamicMinion: vi.fn() },
  ...overrides,
});

const create = (type, config = {}, system = createSystem()) => {
  const factory = new EnemyFactory(system);
  factory.registerType('husk', {
    class: Husk,
    defaults: { ...HUSK_CONFIG, components: HUSK_COMPONENTS },
  });
  factory.registerType('ram', {
    class: Ram,
    defaults: { ...RAM_CONFIG, components: RAM_COMPONENTS },
  });
  return factory.create(type, { x: 100, y: 100, wave: 6, ...config });
};

const xpOf = (enemy) => {
  const createXPOrb = vi.fn();
  new RewardManager({
    xpOrbSystem: { createXPOrb },
    random: createDeterministicRandom({ chanceValue: false }),
  }).dropRewards(enemy);
  return createXPOrb.mock.calls.reduce((sum, call) => sum + call[2], 0);
};

describe('Elite affixes', () => {
  it('table: every affix is labelled, drawable and allowed on support kinds only', () => {
    for (const id of AFFIX_IDS) {
      const affix = ELITE_AFFIXES[id];
      expect(affix.id).toBe(id);
      expect(affix.label).toMatch(/^[A-Z][a-z]+$/);
      expect(AFFIX_GLYPH_NAMES).toContain(affix.glyph);
      expect(affix.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(affix.kinds.length).toBeGreaterThan(0);
      for (const kind of affix.kinds) expect(SUPPORT_KINDS).toContain(kind);
    }
    expect(ELITE_AFFIXES.splitter.kinds).not.toContain('husk');
    expect(ELITE_AFFIXES.shielded.kinds).not.toContain('bulwark');
  });

  it('rolls none before layer 6, one on 6–10, one or two on 11–14, two from 15', () => {
    const counts = (layer) =>
      new Set(
        Array.from(
          { length: 40 },
          (_, i) =>
            rollAffixes('ram', layer, new RandomService(`t:${layer}:${i}`))
              .length
        )
      );
    expect([...counts(1)]).toEqual([0]);
    expect([...counts(5)]).toEqual([0]);
    expect([...counts(6)]).toEqual([1]);
    expect([...counts(10)]).toEqual([1]);
    expect([...counts(12)].sort()).toEqual([1, 2]);
    expect([...counts(15)]).toEqual([2]);
    expect([...counts(30)]).toEqual([2]);

    for (let i = 0; i < 40; i += 1) {
      const picked = rollAffixes('husk', 20, new RandomService(`h:${i}`));
      expect(new Set(picked).size).toBe(2);
      expect(picked).not.toContain('splitter');
    }
    expect(rollAffixes('ram', 15, new RandomService('same'))).toEqual(
      rollAffixes('ram', 15, new RandomService('same'))
    );
  });

  it('names the affixes in the display name and the elite-spawned payload', () => {
    const system = createSystem();
    const ram = create(
      'ram',
      { elite: true, affixes: ['swift', 'volatile'] },
      system
    );
    expect(ram.displayName).toBe('Elite Swift Volatile Ram');
    expect(system.eventBus.emit).toHaveBeenCalledWith(
      'elite-spawned',
      expect.objectContaining({
        displayName: 'Elite Swift Volatile Ram',
        affixes: ['swift', 'volatile'],
      })
    );
    const plain = create('ram', { elite: false }, system);
    expect(plain.affixes).toEqual([]);
    expect(plain.displayName).toBe('Ram');
  });

  it('adds +50 % of the Elite XP per affix', () => {
    const elite = xpOf(create('husk', { elite: true, affixes: [] }));
    const two = xpOf(
      create('husk', { elite: true, affixes: ['warded', 'swift'] })
    );
    expect(two).toBeCloseTo(elite * (1 + 2 * AFFIX_XP_BONUS), 5);
  });

  it('Shielded: a frontal plate soaks 60 damage; hits from behind reach the hull', () => {
    const husk = create('husk', { elite: true, affixes: ['shielded'] });
    husk.update(1 / 60); // turns the plate to the player (+x)
    const hull = husk.health;
    const front = { hitPosition: { x: 120, y: 100 } };
    const rear = { hitPosition: { x: 80, y: 100 } };

    husk.takeDamage(40, front);
    expect(husk.health).toBe(hull);
    expect(husk.shieldHealth).toBe(ELITE_AFFIXES.shielded.shieldHealth - 40);

    husk.takeDamage(10, rear);
    expect(husk.health).toBe(hull - 10);

    husk.takeDamage(30, front); // breaks the plate; 10 overflow
    expect(husk.shieldBroken).toBe(true);
    expect(husk.health).toBe(hull - 20);
  });

  it('Swift: +45 % top speed, charge and acceleration over a plain Elite', () => {
    const elite = create('ram', { elite: true, affixes: [] });
    const swift = create('ram', { elite: true, affixes: ['swift'] });
    for (const key of ['maxSpeed', 'chargeSpeed']) {
      expect(swift.movementConfig[key]).toBeCloseTo(
        elite.movementConfig[key] * ELITE_AFFIXES.swift.speed,
        5
      );
    }
  });

  it('Volatile: a lethal hit lights a 0.6 s fuse, then it blows for 25 within 90 px', () => {
    const player = {
      position: { x: 160, y: 100 },
      takeDamage: vi.fn(() => ({ applied: true })),
    };
    const eventBus = { emit: vi.fn() };
    const facade = {
      asteroids: [],
      eventBus,
      getCachedPlayer: () => player,
      getPlayerPositionSnapshot: (p) => p.position,
    };
    const damage = new EnemyDamageSystem({ facade });
    const husk = create(
      'husk',
      { elite: true, affixes: ['volatile'] },
      createSystem({
        eventBus,
        getCachedPlayer: () => player,
        applyDamage: (enemy, amount, options) =>
          damage.applyDamage(enemy, amount, options),
        triggerVolatileExplosion: (enemy, cause) =>
          damage.triggerVolatileExplosion(enemy, cause),
      })
    );
    facade.asteroids.push(husk);

    expect(husk.takeDamage(husk.maxHealth * 2)).toBe(false);
    expect(husk.alive).toBe(true);
    expect(husk.volatileFuse).toBe(ELITE_AFFIXES.volatile.fuse);
    husk.takeDamage(5); // ignored while the fuse burns
    expect(husk.health).toBe(husk.maxHealth);

    husk.update(0.3);
    expect(husk.alive).toBe(true);
    husk.update(0.31);
    expect(husk.alive).toBe(false);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'asteroid-volatile-exploded',
      expect.objectContaining({ radius: 90, damage: 25 })
    );
    expect(player.takeDamage).toHaveBeenCalled();
  });

  it('Splitter: dies into two Motes flying apart', () => {
    const system = createSystem();
    const ram = create('ram', { elite: true, affixes: ['splitter'] }, system);
    ram.takeDamage(ram.maxHealth);
    const calls = system.acquireEnemyViaFactory.mock.calls;
    expect(calls).toHaveLength(ELITE_AFFIXES.splitter.count);
    for (const [type, config] of calls) {
      expect(type).toBe('drone');
      expect(config.spawnedBy).toBe(ram.id);
      expect(
        (config.x - 100) * config.vx + (config.y - 100) * config.vy
      ).toBeGreaterThan(0);
    }
  });

  it('Warded: takes no damage for 1.5 s after each hit', () => {
    const husk = create('husk', { elite: true, affixes: ['warded'] });
    const hull = husk.health;
    husk.takeDamage(10);
    expect(husk.health).toBe(hull - 10);
    husk.takeDamage(10);
    expect(husk.health).toBe(hull - 10);
    husk.update(ELITE_AFFIXES.warded.immuneSeconds + 0.01);
    husk.takeDamage(10);
    expect(husk.health).toBe(hull - 20);
  });
});
