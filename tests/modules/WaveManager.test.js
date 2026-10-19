import { describe, expect, it, vi } from 'vitest';
import { WaveManager } from '../../src/modules/enemies/managers/WaveManager.js';
import {
  BOSS_RUSH_BREATHER_SECONDS,
  LAYER_MODIFIERS,
  directorFor,
  modifierFor,
} from '../../src/data/layers.js';
import { getContent } from '../../src/content/registry.js';
import { recipeEnemyClass } from '../../src/modules/enemies/types/RecipeEnemy.js';
import { createDeterministicRandom } from '../__helpers__/stubs.js';

const Husk = recipeEnemyClass(getContent('enemies', 'husk'));

// Field mock: every factory spawn lands in `active`, in spawn order.
function createField({ player = { x: 400, y: 300 }, runSeed } = {}) {
  const random = createDeterministicRandom({ floatValue: 0.5 });
  const active = [];
  const emits = [];
  const xpOrbs = { startGlobalPull: vi.fn(), setDrift: vi.fn() };
  const effects = { addScreenFlash: vi.fn() };
  const eventBus = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn((event, payload) => emits.push({ event, payload })),
  };
  const enemySystem = {
    dependencies:
      runSeed === undefined
        ? {}
        : {
            difficulty: {
              getRunSeed: () => runSeed,
              getModifiers: () => ({ spawnCount: 1 }),
            },
          },
    asteroids: active,
    getRandomScope: () => random,
    getCachedWorld: () => ({
      getBounds: () => ({ width: 800, height: 600 }),
    }),
    getCachedPlayer: () => ({ position: player }),
    getPlayerPositionSnapshot: () => player,
    spawnBoss: vi.fn((config) => {
      const boss = { type: 'boss', destroyed: false, wave: config.wave };
      active.push(boss);
      return boss;
    }),
    acquireEnemyViaFactory: vi.fn((type, config) => {
      const enemy = { type, ...config, destroyed: false };
      active.push(enemy);
      return enemy;
    }),
    registerActiveEnemy: vi.fn(() => true),
    forEachActiveEnemy: (callback) =>
      active.filter((e) => !e.destroyed).forEach(callback),
    getCachedXPOrbs: () => xpOrbs,
    getCachedEffects: () => effects,
  };
  const manager = new WaveManager({ enemySystem, random, eventBus });
  const kill = (enemy) => {
    enemy.destroyed = true;
    manager.onEnemyDestroyed({ enemy });
  };
  // The layer's own rocks trickle in from EnemySystem's frame
  // (updateRockTrickle); here they have all come and gone.
  const clearRocks = () => {
    manager.rocksSpawned = manager.rocksTotal;
  };
  return {
    manager,
    active,
    emits,
    enemySystem,
    kill,
    clearRocks,
    xpOrbs,
    effects,
  };
}

function startLayer(field, layer) {
  field.manager.currentWave = layer - 1;
  expect(field.manager.startNextWave()).toBe(true);
}

const ofType = (active, type) => active.filter((e) => e.type === type);

describe('WaveManager layer director', () => {
  it('rolls a layer past the table from the run seed', () => {
    const runSeed = 3; // seed 0 and seed 3 roll different modifiers on layer 17
    const director = createField({ runSeed }).manager.layerDirector(17);
    const seeded = directorFor(17, runSeed);

    expect(seeded.modifier).not.toBe(directorFor(17, 0).modifier);
    expect(director.modifier).toBe(seeded.modifier);
    expect(director.rocks).toBe(seeded.rocks);
  });

  it('trickles the layer 4 roster in on its schedule', () => {
    const field = createField();
    startLayer(field, 4);
    // Keep the field busy so the schedule runs on its own clock.
    field.active.push({ type: 'asteroid', destroyed: false });

    expect(ofType(field.active, 'drone')).toHaveLength(0);
    field.manager.update(7.9);
    expect(ofType(field.active, 'drone')).toHaveLength(0);
    field.manager.update(0.2);
    expect(ofType(field.active, 'drone')).toHaveLength(1);
    field.manager.update(8);
    expect(ofType(field.active, 'drone')).toHaveLength(2);
  });

  it('fires a surge with its banner event at the far edge from the player', () => {
    const field = createField({ player: { x: 100, y: 300 } });
    startLayer(field, 4);
    field.active.push({ type: 'asteroid', destroyed: false });

    field.manager.update(20);

    const surge = field.emits.find((e) => e.event === 'surge-started');
    expect(surge.payload).toEqual({
      layer: 4,
      label: 'Mote swarm',
      kinds: ['drone'],
      count: 4,
    });
    const swarm = ofType(field.active, 'drone').slice(-4);
    expect(swarm).toHaveLength(4);
    // Player on the left: the burst comes in from the right edge.
    for (const drone of swarm) expect(drone.x).toBeGreaterThan(700);
  });

  it('pulls the next scheduled spawn forward when the field is empty', () => {
    const field = createField();
    startLayer(field, 4);

    field.manager.update(0.1);

    expect(ofType(field.active, 'drone')).toHaveLength(1);
    expect(field.manager.layerElapsed).toBe(8);
  });

  it('rolls elites with the roster entry chance', () => {
    const field = createField();
    startLayer(field, 13);
    const chance = vi.spyOn(field.manager.randomScopes.spawn, 'chance');

    field.manager.update(5);

    expect(chance).toHaveBeenCalledWith(0.2);
  });

  it('does not complete a layer while scheduled spawns are pending', () => {
    const field = createField();
    startLayer(field, 4);
    field.manager.update(8);
    const [first] = ofType(field.active, 'drone');

    field.kill(first);

    expect(field.manager.waveInProgress).toBe(true);
    expect(field.manager.layerSchedule.length).toBeGreaterThan(0);
  });

  it('tracks the layer 10 Warden and its Motes, completing when the boss dies last', () => {
    const field = createField();
    startLayer(field, 10);
    const { manager, active, emits } = field;

    // Warden at once, 4 Motes on the schedule.
    expect(manager.totalEnemiesThisWave).toBe(5);
    const [boss] = ofType(active, 'boss');
    expect(boss).toBeTruthy();

    manager.update(60);
    field.clearRocks();
    const motes = ofType(active, 'drone');
    expect(motes).toHaveLength(4);

    motes.forEach(field.kill);
    expect(manager.waveInProgress).toBe(true);
    expect(manager.enemiesKilledThisWave).toBe(4);

    field.kill(boss);

    expect(manager.waveInProgress).toBe(false);
    expect(emits).toContainEqual({
      event: 'wave-complete',
      payload: expect.objectContaining({ wave: 10, enemiesKilled: 5 }),
    });
  });
});

describe('WaveManager accounting', () => {
  // The rock plan as the trickle leaves it mid-layer.
  const startWithRocks = (layer) => {
    const field = createField();
    startLayer(field, layer);
    Object.assign(field.manager, {
      rocksActive: true,
      rocksTotal: 9,
      rocksSpawned: 0,
    });
    return field;
  };

  it('keeps the rock counts in step when a Husk splits mid-wave', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const field = startWithRocks(6);
    Object.assign(field.enemySystem, {
      eventBus: { emit: vi.fn() },
      waveManager: field.manager,
    });
    const husk = new Husk(field.enemySystem, { id: 'husk', x: 400, y: 200 });

    husk.takeDamage(husk.maxHealth);
    const motes = ofType(field.active, 'drone');
    field.kill(motes[0]);

    expect(motes).toHaveLength(3);
    expect(field.manager.rocksSpawned).toBe(0);
    expect(warn).not.toHaveBeenCalledWith(
      expect.stringContaining('Accounting discrepancy')
    );
    warn.mockRestore();
  });

  it('registers a pooled rock again when it comes back as a new life', () => {
    const { manager } = startWithRocks(1);
    const rock = { type: 'asteroid', id: 'first-life' };

    expect(manager.registerActiveEnemy(rock)).toBe(true);
    expect(manager.registerActiveEnemy(rock)).toBe(false);
    rock.id = 'second-life';
    expect(manager.registerActiveEnemy(rock)).toBe(true);
    expect(manager.asteroidsSpawnedThisWave).toBe(2);
  });

  it('counts a Herald wall rock once on each side', () => {
    const field = startWithRocks(3);
    const { manager } = field;
    const rock = { type: 'asteroid', id: 'wall-rock' };

    // spawnChild: the factory bridge registers it, then the minion path.
    manager.registerActiveEnemy(rock);
    manager.registerDynamicMinion(rock, { minionType: 'asteroid' });

    expect(manager.enemiesSpawnedThisWave).toBe(1);
    expect(manager.asteroidsSpawnedThisWave).toBe(1);
    expect(manager.rocksSpawned).toBe(1);
  });

  it('adds surge rocks to the rock plan', () => {
    const field = startWithRocks(1);
    field.active.push({ type: 'asteroid', destroyed: false });

    field.manager.update(40); // the Rockfall surge: six rocks

    expect(field.manager).toMatchObject({
      rocksTotal: 15,
      rocksSpawned: 6,
    });
  });
});

describe('WaveManager Heralds', () => {
  it('brings the layer 3 Herald of Dust at 15 s and holds the layer until it dies', () => {
    const field = createField();
    startLayer(field, 3);
    const { manager, active } = field;
    active.push({ type: 'asteroid', destroyed: false });

    manager.update(14.9);
    expect(ofType(active, 'herald')).toHaveLength(0);
    manager.update(0.2);
    const [herald] = ofType(active, 'herald');
    expect(herald).toMatchObject({ heraldKind: 'dust', elite: false });

    manager.update(60); // the Rockfall surge too
    field.clearRocks();
    active.filter((e) => e !== herald && !e.destroyed).forEach(field.kill);
    expect(manager.waveInProgress).toBe(true);

    field.kill(herald);
    expect(manager.waveInProgress).toBe(false);
  });
});

describe('WaveManager field events', () => {
  const eventsOf = (field, name) =>
    field.emits.filter((e) => e.event === name).map((e) => e.payload);

  it('starts the layer 2 Sensor Jam at 25 s and ends it 10 s later', () => {
    const field = createField();
    startLayer(field, 2);
    field.active.push({ type: 'asteroid', destroyed: false });

    field.manager.update(24.9);
    expect(eventsOf(field, 'field-event-started')).toHaveLength(0);
    field.manager.update(0.2);
    expect(eventsOf(field, 'field-event-started')).toEqual([
      {
        layer: 2,
        kind: 'sensor-jam',
        label: 'Sensor Jam',
        duration: 10,
        x: 400,
        y: 300,
      },
    ]);

    field.manager.update(9.9);
    expect(eventsOf(field, 'field-event-ended')).toHaveLength(0);
    field.manager.update(0.2);
    expect(eventsOf(field, 'field-event-ended')).toEqual([
      { kind: 'sensor-jam' },
    ]);
  });

  it('pulls the XP sparks to a Gravity Well point 220-320 px from the ship', () => {
    const field = createField();
    startLayer(field, 4);
    field.active.push({ type: 'asteroid', destroyed: false });

    field.manager.update(30);

    const [well] = eventsOf(field, 'field-event-started');
    expect(well.kind).toBe('gravity-well');
    // The stub rolls the range minimum: angle 0, 220 px.
    expect({ x: well.x, y: well.y }).toEqual({ x: 620, y: 300 });
    expect(field.xpOrbs.startGlobalPull).toHaveBeenCalledWith(
      8,
      expect.any(Number),
      expect.any(Number),
      1,
      { x: 620, y: 300 }
    );
  });

  it('stuns every enemy and flashes the screen on a Solar Flare', () => {
    const field = createField();
    startLayer(field, 7);
    field.active.push({ type: 'asteroid', destroyed: false });

    field.manager.update(35);

    expect(eventsOf(field, 'field-event-started')[0].kind).toBe('solar-flare');
    const drones = ofType(field.active, 'drone');
    expect(drones.length).toBeGreaterThan(0);
    for (const drone of drones) expect(drone.stunTimer).toBe(1);
    expect(field.effects.addScreenFlash).toHaveBeenCalledTimes(1);
  });

  it('leaves a phased Shade unstunned on a Solar Flare', () => {
    const field = createField();
    startLayer(field, 7);
    const shade = { type: 'shade', destroyed: false, intangible: true };
    field.active.push({ type: 'asteroid', destroyed: false }, shade);

    field.manager.update(35);

    expect(eventsOf(field, 'field-event-started')[0].kind).toBe('solar-flare');
    expect(shade.stunTimer).toBeUndefined();
  });

  it('does not hold a cleared layer open for an event still to come', () => {
    const field = createField();
    startLayer(field, 9);
    field.active.push({ type: 'asteroid', destroyed: false });
    field.manager.update(20);
    field.manager.update(20);
    // Everything spawned by 40 s; the Gravity Well (45 s) is still pending.
    expect(field.manager.layerSchedule.map((e) => e.event?.kind)).toEqual([
      'gravity-well',
    ]);

    field.clearRocks();
    field.active.forEach((enemy) => field.kill(enemy));
    field.manager.update(0.1);

    expect(field.manager.waveInProgress).toBe(false);
    expect(eventsOf(field, 'field-event-ended')).toEqual([
      { kind: 'sensor-jam' },
    ]);
  });
});

describe('WaveManager layer modifiers', () => {
  const eventsOf = (field, name) =>
    field.emits.filter((e) => e.event === name).map((e) => e.payload);
  // No difficulty service in the stub field: the run seed is 0.
  const firstFieldLayerWith = (id) => {
    let n = 16;
    while (modifierFor(n, 0) !== id || n % 5 === 0) n += 1;
    return n;
  };

  it("keeps only Seekers and Rams on a Hunters' Moon, 30 % more of each", () => {
    const field = createField();
    const layer = firstFieldLayerWith('hunters-moon');
    startLayer(field, layer);

    const trickled = new Map();
    for (const entry of field.manager.layerSchedule) {
      if (entry.surge || entry.event) continue;
      for (const { kind, count } of entry.groups) {
        trickled.set(kind, (trickled.get(kind) || 0) + count);
      }
    }
    const base = directorFor(layer).roster;
    const scaled = (role) =>
      Math.round(base.find((e) => e.role === role).count * 1.3);
    expect(Object.fromEntries(trickled)).toEqual({
      ram: scaled('charger'),
      hunter: scaled('sniper'),
    });
    const surgeKinds = field.manager.layerSchedule
      .filter((entry) => entry.surge)
      .flatMap((entry) => entry.groups.map((g) => g.kind));
    expect(new Set(surgeKinds)).toEqual(new Set(['ram', 'hunter']));
    expect(eventsOf(field, 'layer-modifier-started')).toEqual([
      {
        layer,
        id: 'hunters-moon',
        label: "Hunters' Moon",
        color: LAYER_MODIFIERS['hunters-moon'].color,
      },
    ]);
  });

  it('flags a Glass Field for the rock spawns until the layer ends', () => {
    const field = createField();
    startLayer(field, firstFieldLayerWith('glass-field'));
    expect(field.manager.layerModifier).toBe('glass-field');

    field.manager.completeWave();

    expect(field.manager.layerModifier).toBeNull();
    expect(eventsOf(field, 'layer-modifier-ended')).toEqual([
      { id: 'glass-field' },
    ]);
  });

  it('sets the XP sparks drifting through a Magnetic Storm, and stops them', () => {
    const field = createField();
    startLayer(field, firstFieldLayerWith('magnetic-storm'));

    expect(field.xpOrbs.setDrift).toHaveBeenCalledWith(
      LAYER_MODIFIERS['magnetic-storm'],
      expect.objectContaining({ range: expect.any(Function) })
    );

    field.manager.completeWave();

    expect(field.xpOrbs.setDrift).toHaveBeenLastCalledWith(null);
  });

  it('seeds the Magnetic Storm drift from the run seed', () => {
    const driftDraws = (runSeed) => {
      const field = createField({ runSeed });
      field.manager.currentWave = 5;
      field.manager.startLayerModifier('magnetic-storm');
      const random = field.xpOrbs.setDrift.mock.calls[0][1];
      return Array.from({ length: 4 }, () => random.range(0, 1));
    };
    const runA = driftDraws(1234);

    expect(driftDraws(1234)).toEqual(runA);
    expect(driftDraws(98765)).not.toEqual(runA);
  });

  it('rolls the endless modifiers from the run seed', () => {
    const modifiersFor = (runSeed) =>
      Array.from({ length: 12 }, (_, i) => {
        const field = createField({ runSeed });
        startLayer(field, 16 + i);
        return field.manager.layerModifier;
      });
    const runA = modifiersFor(1234);

    expect(runA).toEqual(
      Array.from({ length: 12 }, (_, i) => modifierFor(16 + i, 1234))
    );
    expect(modifiersFor(1234)).toEqual(runA);
    expect(modifiersFor(98765)).not.toEqual(runA);
  });

  it('rolls no modifier inside the 15-layer table', () => {
    const field = createField();
    startLayer(field, 14);
    expect(field.manager.layerModifier).toBeNull();
    expect(eventsOf(field, 'layer-modifier-started')).toEqual([]);
  });
});

describe('WaveManager Boss Rush', () => {
  it('plays only the Warden layers, a breather and a warning between them', () => {
    const field = createField();
    const { manager, active, emits } = field;
    manager.bossRush = true;
    const clearLayer = () => {
      manager.update(60);
      field.clearRocks();
      active.filter((e) => !e.destroyed).forEach(field.kill);
    };

    expect(manager.startNextWave()).toBe(true);
    expect(manager.currentWave).toBe(5);
    expect(emits).toContainEqual({
      event: 'wave-started',
      payload: expect.objectContaining({ wave: 5, bossRush: true }),
    });
    clearLayer();
    expect(manager.waveInProgress).toBe(false);
    expect(manager.waveCountdown).toBe(BOSS_RUSH_BREATHER_SECONDS);
    expect(emits).toContainEqual({
      event: 'boss-warning',
      payload: { wave: 5, nextBossWave: 10 },
    });

    manager.update(BOSS_RUSH_BREATHER_SECONDS - 0.5);
    expect(manager.waveInProgress).toBe(false);
    manager.update(0.5);
    expect(manager.currentWave).toBe(10);

    clearLayer();
    manager.update(BOSS_RUSH_BREATHER_SECONDS);
    expect(manager.currentWave).toBe(15);
    clearLayer();
    expect(manager.waveInProgress).toBe(false);
    expect(emits.filter(({ event }) => event === 'boss-warning')).toHaveLength(
      2
    );
  });
});
