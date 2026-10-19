import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  activateProfileHarness,
  composeHeroScene,
} from '../../src/bootstrap/profileHarness.js';
import {
  composeContentScene,
  CONTENT_KINDS,
  enemyPositions,
  freezeSpawner,
  parseContentParams,
  readContentScene,
  resolveContent,
} from '../../src/bootstrap/contentScene.js';
import { EventBus } from '../../src/core/EventBus.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/core/GameConstants.js';

// `?content=<id>` (PLAN.md 0a.2): the URL parsing, the lookup order and the
// spawn layout are pure and tested here; the scene on a live run, for every
// item of the registry, is tests/integration/contentScene.test.js.

describe('parseContentParams', () => {
  it('is null without a content flag', () => {
    expect(parseContentParams('')).toBeNull();
    expect(parseContentParams('?scene=hero&desktop=force')).toBeNull();
  });

  it('reads the id, defaulting to one enemy and no fire', () => {
    expect(parseContentParams('?content=drone')).toEqual({
      ref: 'drone',
      count: 1,
      fire: false,
    });
  });

  it('keeps a kind/id reference whole', () => {
    expect(parseContentParams('?content=cards/plasma').ref).toBe(
      'cards/plasma'
    );
  });

  it('clamps count to 1..300 and ignores what is not a number', () => {
    const count = (value) =>
      parseContentParams(`?content=drone&count=${value}`).count;

    expect(count(200)).toBe(200);
    expect(count(0)).toBe(1);
    expect(count(-5)).toBe(1);
    expect(count(9999)).toBe(300);
    expect(count('2.7')).toBe(2);
    expect(count('many')).toBe(1);
  });

  it('turns fire on only for fire=1', () => {
    expect(parseContentParams('?content=drone&fire=1').fire).toBe(true);
    expect(parseContentParams('?content=drone&fire=0').fire).toBe(false);
    expect(parseContentParams('?content=drone&fire=yes').fire).toBe(false);
  });
});

describe('resolveContent', () => {
  it('looks a bare id up in the kinds in order, the first hit winning', () => {
    const asked = [];
    const lookup = (kind, id) => {
      asked.push(kind);
      return kind === 'hulls' || kind === 'cards' ? { id, kind } : undefined;
    };

    const found = resolveContent('twin', lookup);

    expect(asked).toEqual(['enemies', 'bosses', 'weapons', 'hulls']);
    expect(found.kind).toBe('hulls');
    expect(CONTENT_KINDS).toEqual([
      'enemies',
      'bosses',
      'weapons',
      'hulls',
      'cards',
      'stages',
    ]);
  });

  it('looks <kind>/<id> up in that kind only', () => {
    const lookup = vi.fn((kind, id) => ({ kind, id }));

    expect(resolveContent('cards/plasma', lookup)).toMatchObject({
      kind: 'cards',
      id: 'plasma',
    });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(resolveContent('cards/nope', () => undefined)).toBeNull();
    expect(resolveContent('shapes/plasma', lookup)).toBeNull();
  });

  it('finds an item of every kind in the real registry', () => {
    const kindOf = (ref) => resolveContent(ref)?.kind;

    expect(kindOf('drone')).toBe('enemies');
    expect(kindOf('dust')).toBe('bosses');
    expect(kindOf('harmonic')).toBe('weapons');
    expect(kindOf('bastion')).toBe('hulls');
    expect(kindOf('plasma')).toBe('cards');
    // A weapon card lives in its weapon file, not in the cards folder.
    expect(kindOf('harmonic_resonator')).toBe('cards');
    expect(kindOf('cards/harmonic_resonator')).toBe('cards');
    expect(kindOf('cards/plasma')).toBe('cards');
    expect(kindOf('layer-05')).toBe('stages');
    expect(kindOf('stages/layer-05')).toBe('stages');
    expect(kindOf('nothing-here')).toBeUndefined();
  });
});

describe('readContentScene', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the item with the count and the fire flag', () => {
    const scene = readContentScene('?content=drone&count=12&fire=1');

    expect(scene).toMatchObject({
      kind: 'enemies',
      id: 'drone',
      count: 12,
      fire: true,
    });
    expect(scene.item.id).toBe('drone');
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns once, naming the valid kinds, for an unknown id', () => {
    expect(readContentScene('?content=nothing-here')).toBeNull();

    expect(console.warn).toHaveBeenCalledTimes(1);
    const message = console.warn.mock.calls[0][0];
    expect(message).toContain('nothing-here');
    for (const kind of CONTENT_KINDS) expect(message).toContain(kind);
  });
});

describe('enemyPositions', () => {
  const SHIP_CLEARANCE = 150;

  it('puts one enemy about 300 px ahead of the ship, level with it', () => {
    const [only, ...rest] = enemyPositions(1);

    expect(rest).toEqual([]);
    expect(only.y).toBe(GAME_HEIGHT / 2);
    expect(only.x).toBeGreaterThan(300);
    expect(only.x).toBeLessThan(500);
  });

  it('puts every enemy of a group inside the field, apart and off the ship', () => {
    for (const count of [2, 3, 7, 25, 50, 120, 200, 300]) {
      const positions = enemyPositions(count);

      expect(positions).toHaveLength(count);
      expect(new Set(positions.map(({ x, y }) => `${x},${y}`)).size).toBe(
        count
      );
      for (const { x, y } of positions) {
        expect(x).toBeGreaterThan(GAME_WIDTH / 3);
        expect(x).toBeLessThan(GAME_WIDTH);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(GAME_HEIGHT);
        // The ship is at the left middle: nothing near it.
        expect(Math.hypot(x - 120, y - GAME_HEIGHT / 2)).toBeGreaterThan(
          SHIP_CLEARANCE
        );
      }
    }
  });

  it('keeps 300 enemies far enough apart for the smallest of them', () => {
    const positions = enemyPositions(300);
    let nearest = Infinity;
    positions.forEach((a, i) =>
      positions.slice(i + 1).forEach((b) => {
        nearest = Math.min(nearest, Math.hypot(a.x - b.x, a.y - b.y));
      })
    );

    expect(nearest).toBeGreaterThan(24); // a Mote is 12 px in radius
  });

  it('centers the group in the right two-thirds of the field', () => {
    const positions = enemyPositions(9);
    const mean = (key) =>
      positions.reduce((sum, position) => sum + position[key], 0) /
      positions.length;

    expect(mean('x')).toBeCloseTo((GAME_WIDTH / 3 + 40 + GAME_WIDTH - 40) / 2);
    expect(mean('y')).toBeCloseTo(GAME_HEIGHT / 2);
  });
});

const makeServices = () => ({
  'event-bus': new EventBus(),
  player: {
    position: { x: 500, y: 100 },
    velocity: { vx: 30, vy: -20 },
    angle: 2,
    cachedMovementInput: {
      up: false,
      down: false,
      left: false,
      right: false,
    },
    setInvulnerableTimer: vi.fn(),
  },
  enemies: {
    releaseAllAsteroidsToPool: vi.fn(),
    acquireEnemyViaFactory: vi.fn(() => ({})),
    waveManager: {
      update: vi.fn(),
      updateRockTrickle: vi.fn(),
      waveInProgress: true,
    },
  },
  combat: { weapons: { handleShooting: vi.fn() } },
  progression: { experienceToNext: 100 },
});

describe('composeContentScene', () => {
  const enemyScene = (extra = {}) => ({
    kind: 'enemies',
    id: 'drone',
    item: {},
    count: 3,
    fire: false,
    ...extra,
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('spawns count enemies of that type and freezes the spawner and level-ups', () => {
    const services = makeServices();
    const { waveManager } = services.enemies;
    const update = waveManager.update;

    composeContentScene({ scene: enemyScene(), services });
    waveManager.update(1);

    expect(services.enemies.acquireEnemyViaFactory).toHaveBeenCalledTimes(3);
    expect(services.enemies.acquireEnemyViaFactory.mock.calls[0][0]).toBe(
      'drone'
    );
    expect(update).not.toHaveBeenCalled();
    expect(services.progression.experienceToNext).toBeGreaterThanOrEqual(1e9);
    expect(services.player.setInvulnerableTimer).toHaveBeenCalledWith(
      expect.any(Number)
    );
  });

  it('holds fire at enemies unless fire=1', () => {
    const quiet = makeServices();
    const loud = makeServices();
    const quietShoot = quiet.combat.weapons.handleShooting;
    const loudShoot = loud.combat.weapons.handleShooting;

    composeContentScene({ scene: enemyScene(), services: quiet });
    composeContentScene({ scene: enemyScene({ fire: true }), services: loud });
    quiet.combat.weapons.handleShooting(1, {});
    loud.combat.weapons.handleShooting(1, {});

    expect(quietShoot).not.toHaveBeenCalled();
    expect(loudShoot).toHaveBeenCalledTimes(1);
  });

  it('puts the ship at the left middle, facing right, and keeps it there until the pilot steers', () => {
    const { player, ...rest } = makeServices();
    const services = { player, ...rest };

    composeContentScene({ scene: enemyScene(), services });
    expect(player.position.x).toBeLessThan(GAME_WIDTH / 3);
    expect(player.position.y).toBe(GAME_HEIGHT / 2);
    expect(player.angle).toBe(0);
    expect(player.velocity).toEqual({ vx: 0, vy: 0 });

    // Pushed off the picture: put back.
    player.position.x = 400;
    player.velocity.vx = 90;
    vi.advanceTimersByTime(50);
    expect(player.position.x).toBeLessThan(GAME_WIDTH / 3);
    expect(player.velocity.vx).toBe(0);

    // Steered: the pilot's from then on, even after the key is released.
    player.cachedMovementInput.right = true;
    player.position.x = 400;
    vi.advanceTimersByTime(50);
    player.cachedMovementInput.right = false;
    vi.advanceTimersByTime(50);
    expect(player.position.x).toBe(400);
  });
});

describe('leaving the scene', () => {
  const enemyScene = { kind: 'enemies', id: 'drone', item: {}, count: 1 };
  const endRun = (services, state) =>
    services['event-bus'].emit('session-state-changed', { state });

  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(['menu', 'player-died', 'victory'])(
    'puts back the spawner, the shooting and the ship when the run goes to %s',
    (state) => {
      const services = makeServices();
      const { waveManager } = services.enemies;
      const { weapons } = services.combat;
      const { player } = services;
      const [update, updateRockTrickle, handleShooting] = [
        waveManager.update,
        waveManager.updateRockTrickle,
        weapons.handleShooting,
      ];

      composeContentScene({ scene: enemyScene, services });
      endRun(services, state);

      expect(waveManager.update).toBe(update);
      expect(waveManager.updateRockTrickle).toBe(updateRockTrickle);
      expect(weapons.handleShooting).toBe(handleShooting);
      player.position.x = 400;
      vi.advanceTimersByTime(50);
      expect(player.position.x).toBe(400);
    }
  );

  it.each(['running', 'paused', 'retrying'])(
    'stays composed while the run is %s',
    (state) => {
      const services = makeServices();
      const { waveManager } = services.enemies;
      const update = waveManager.update;

      composeContentScene({ scene: enemyScene, services });
      endRun(services, state);

      expect(waveManager.update).not.toBe(update);
      services.player.position.x = 400;
      vi.advanceTimersByTime(50);
      expect(services.player.position.x).toBeLessThan(GAME_WIDTH / 3);
    }
  );

  it('deletes what it added, leaving the original on the prototype', () => {
    class Waves {
      update() {}
      updateRockTrickle() {}
    }
    const waveManager = new Waves();

    const unfreeze = freezeSpawner(waveManager);
    expect(Object.hasOwn(waveManager, 'update')).toBe(true);
    unfreeze();

    expect(Object.hasOwn(waveManager, 'update')).toBe(false);
    expect(Object.hasOwn(waveManager, 'updateRockTrickle')).toBe(false);
  });

  it('gives the hero scene the same way back', () => {
    const update = vi.fn();
    const waveManager = { update, updateRockTrickle: vi.fn(), spawnQueue: [] };

    const unfreeze = composeHeroScene({
      player: { position: {}, setInvulnerableTimer: vi.fn() },
      enemies: {
        releaseAllAsteroidsToPool: vi.fn(),
        acquireEnemyViaFactory: vi.fn(() => ({})),
        waveManager,
      },
      progression: {},
      xpOrbs: { createXPOrb: vi.fn() },
    });
    expect(waveManager.update).not.toBe(update);
    unfreeze();

    expect(waveManager.update).toBe(update);
  });
});

describe('activateProfileHarness with ?content=', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  let performanceMonitor;
  beforeEach(() => {
    performanceMonitor = { enableAutoLog: vi.fn(), downloadLogs: vi.fn() };
  });
  const activate = (search, getServices) => {
    vi.stubGlobal('window', { location: { search } });
    return activateProfileHarness({
      gameState: { randomSeed: null, randomSeedSource: 'unknown' },
      performanceMonitor,
      getServices,
    });
  };

  it('activates the content scene for a known id', () => {
    expect(activate('?content=bastion&desktop=force')).toEqual({
      active: true,
      scenario: 'content',
    });
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('clicks start, then composes the scene; no auto-log, nothing saved', async () => {
    const services = makeServices();
    const click = vi.fn();
    vi.stubGlobal('document', {
      getElementById: (id) => (id === 'start-game-btn' ? { click } : null),
    });

    activate('?content=drone&count=2', () => services);
    await vi.advanceTimersByTimeAsync(2000);

    expect(click).toHaveBeenCalledTimes(1);
    expect(services.enemies.acquireEnemyViaFactory).toHaveBeenCalledTimes(2);
    expect(performanceMonitor.enableAutoLog).not.toHaveBeenCalled();
    expect(performanceMonitor.downloadLogs).not.toHaveBeenCalled();
  });

  it('falls back to the hero scene, with one warning, for an unknown id', () => {
    expect(activate('?content=nothing-here')).toEqual({
      active: true,
      scenario: 'hero',
    });
    expect(console.warn).toHaveBeenCalledTimes(1);
  });
});
