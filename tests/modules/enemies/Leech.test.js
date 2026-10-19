import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GamePools } from '../../../src/core/GamePools.js';
import { getContent } from '../../../src/content/registry.js';
import { ORB_VALUE } from '../../../src/data/enemies/asteroid-configs.js';
import { TYPE_CLASSES } from '../../../src/modules/enemies/base/enemyTypeRegistry.js';
import { grow } from '../../../src/modules/enemies/behaviors/forage.js';
import {
  createHeadlessGame,
  installDomStubs,
} from '../../__helpers__/headlessGame.js';

const STEP = 1 / 60;

const Leech = TYPE_CLASSES.leech;
const { config, behaviors } = getContent('enemies', 'leech');
const { health: LEECH_HEALTH, radius: LEECH_RADIUS } = config;
const {
  bonus: LEECH_BURST_BONUS,
  digest: LEECH_DIGEST_INTERVAL,
  drift: LEECH_DRIFT_SPEED,
  flee: LEECH_FLEE_SPEED,
  fullXP: LEECH_FULL_XP,
  maxGrowth: LEECH_MAX_GROWTH,
  maxHealthGain: LEECH_MAX_HEALTH_GAIN,
  pickupOrbs: LEECH_PICKUP_ORBS,
  sense: LEECH_SENSE_RADIUS,
  hunt: LEECH_SPEED,
} = behaviors.forage;

// A field of loose orbs the Leech can see, eat and burst back out.
const setup = ({ ship = { x: 400, y: 300 }, orbs = [] } = {}) => {
  const field = orbs.map(([x, y, value = 5]) => ({ x, y, value }));
  const xpOrbs = {
    nearestOrb: (x, y, max) =>
      field
        .filter((orb) => Math.hypot(orb.x - x, orb.y - y) <= max)
        .sort(
          (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)
        )[0] ?? null,
    consumeOrb: (orb) => {
      field.splice(field.indexOf(orb), 1);
      return orb.value;
    },
  };
  const eventBus = { emit: vi.fn() };
  const system = {
    eventBus,
    getCachedPlayer: () => ({ position: ship }),
    getCachedXPOrbs: () => xpOrbs,
    getCachedPickups: () => null,
  };
  const leech = new Leech(system, { id: 'leech-1', x: 100, y: 300 });
  return { leech, field, eventBus };
};

describe('Leech', () => {
  it('hunts the nearest orb in range, eats it on contact and grows', () => {
    const { leech, field, eventBus } = setup({
      orbs: [
        [100 + LEECH_RADIUS + 4, 300, 10],
        [300, 300],
        [100, 300 + LEECH_SENSE_RADIUS + 50],
      ],
    });
    leech.onUpdate(STEP);
    expect(field).toHaveLength(2);
    expect(leech.stored).toEqual([10]);
    expect(leech.eaten).toBe(10);
    expect(leech.radius).toBeGreaterThan(LEECH_RADIUS);
    expect(leech.maxHealth).toBeGreaterThan(LEECH_HEALTH);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'leech-ate',
      expect.objectContaining({ enemyId: 'leech-1', xp: 10 })
    );
    // the next orb, at the hunting pace
    expect(leech.vx).toBeCloseTo(LEECH_SPEED);
    expect(leech.vy).toBeCloseTo(0);
  });

  it('with nothing in range drifts toward the ship, slowly', () => {
    const { leech } = setup({ ship: { x: 400, y: 300 } });
    leech.onUpdate(STEP);
    expect(leech.vx).toBeCloseTo(LEECH_DRIFT_SPEED);
    expect(LEECH_DRIFT_SPEED).toBeLessThan(LEECH_SPEED);
  });

  it('caps its growth and its health gain', () => {
    const { leech } = setup();
    for (let i = 0; i < 100; i += 1) grow(leech, behaviors.forage, 1);
    expect(leech.radius).toBe(LEECH_RADIUS + LEECH_MAX_GROWTH);
    expect(leech.maxHealth).toBe(LEECH_HEALTH + LEECH_MAX_HEALTH_GAIN);
    expect(leech.health).toBe(LEECH_HEALTH + LEECH_MAX_HEALTH_GAIN);
  });

  it('full: flees the ship on the field and digests an orb every interval until none are left', () => {
    const count = LEECH_FULL_XP / 10;
    const { leech } = setup({
      ship: { x: 400, y: 300 },
      orbs: Array.from({ length: count }, () => [100, 300, 10]),
    });
    for (let i = 0; i < count; i += 1) leech.onUpdate(STEP);
    expect(leech.full).toBe(true);
    expect(leech.fullness).toBe(1);

    leech.onUpdate(STEP);
    expect(leech.vx).toBeCloseTo(-LEECH_FLEE_SPEED); // straight away
    leech.x = 10; // pinned to the left edge: it never leaves the field
    leech.onUpdate(STEP);
    expect(leech.vx).toBe(0);

    leech.onUpdate(LEECH_DIGEST_INTERVAL);
    expect(leech.stored).toHaveLength(count - 1);
    expect(leech.eaten).toBe(LEECH_FULL_XP - 10);
    expect(leech.full).toBe(true); // still full until it is empty
    for (let i = 1; i < count; i += 1) leech.onUpdate(LEECH_DIGEST_INTERVAL);
    expect(leech.stored).toEqual([]);
    expect(leech.full).toBe(false);
  });

  it('a pool reset forgets everything it ate', () => {
    const { leech } = setup({ orbs: [[100, 300, 10]] });
    leech.onUpdate(STEP);
    leech.resetForPool();
    expect(leech.stored).toEqual([]);
    expect(leech.storedPickups).toEqual([]);
    expect(leech.eaten).toBe(0);
    expect(leech.meals).toBe(0);
    expect(leech.full).toBe(false);
  });
});

describe('Leech in the game', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    restoreDom();
    GamePools.releaseAll();
  });

  it('eats real orbs and pickups without granting them, and gives them back with the bonus when killed', () => {
    const game = createHeadlessGame();
    game.session.startNewRun({ source: 'test' });
    const { enemies, pickups } = game.services;
    const xpOrbs = game.services['xp-orbs'];
    const emitted = [];
    const emit = game.eventBus.emit.bind(game.eventBus);
    vi.spyOn(game.eventBus, 'emit').mockImplementation((name, payload) => {
      emitted.push([name, payload]);
      return emit(name, payload);
    });

    const leech = enemies.acquireEnemyViaFactory('leech', {
      x: 120,
      y: 120,
      wave: 7,
    });
    const orbs = [
      xpOrbs.createXPOrb(130, 120, ORB_VALUE),
      xpOrbs.createXPOrb(120, 130, ORB_VALUE),
    ];
    pickups.spawnPickup('magnet', 110, 120);
    for (let i = 0; i < 3; i += 1) leech.onUpdate(1 / 600);

    expect(orbs.every((orb) => orb.collected)).toBe(true);
    expect(pickups.getActivePickups()).toHaveLength(0);
    expect(leech.stored).toEqual([ORB_VALUE, ORB_VALUE]);
    expect(leech.storedPickups).toEqual(['magnet']);
    expect(leech.eaten).toBe(ORB_VALUE * (2 + LEECH_PICKUP_ORBS));
    const names = emitted.map(([name]) => name);
    expect(names).not.toContain('xp-collected');
    expect(names).not.toContain('pickup-collected');

    const createXPOrbs = vi.spyOn(enemies.rewardManager, 'createXPOrbs');
    const bonus = Math.round(2 * ORB_VALUE * LEECH_BURST_BONUS);
    enemies.applyDamage(leech, 1e6, { cause: 'test' });
    expect(createXPOrbs).toHaveBeenCalledWith(leech, 3, [
      ORB_VALUE,
      ORB_VALUE,
      bonus,
    ]);
    expect(pickups.getActivePickups().map((pickup) => pickup.kind)).toContain(
      'magnet'
    );
    expect(emitted).toContainEqual([
      'leech-burst',
      expect.objectContaining({ orbs: 3, xp: 2 * ORB_VALUE + bonus }),
    ]);
  });
});
