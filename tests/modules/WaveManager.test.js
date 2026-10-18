import { describe, expect, it, vi } from 'vitest';
import { WaveManager } from '../../src/modules/enemies/managers/WaveManager.js';
import {
  LAYER_MODIFIERS,
  directorFor,
  modifierFor,
} from '../../src/data/layers.js';
import { createDeterministicRandom } from '../__helpers__/stubs.js';
import { withWaveOverrides } from '../__helpers__/setup.js';

// Field mock: every factory spawn lands in `active`, in spawn order.
function createField({ player = { x: 400, y: 300 } } = {}) {
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
  return { manager, active, emits, enemySystem, kill, xpOrbs, effects };
}

function startLayer(field, layer) {
  field.manager.currentWave = layer - 1;
  expect(field.manager.startNextWave()).toBe(true);
}

const ofType = (active, type) => active.filter((e) => e.type === type);

describe('WaveManager layer director', () => {
  it('trickles the layer 4 roster in on its schedule', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
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
  });

  it('fires a surge with its banner event at the far edge from the player', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
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
  });

  it('pulls the next scheduled spawn forward when the field is empty', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, 4);

      field.manager.update(0.1);

      expect(ofType(field.active, 'drone')).toHaveLength(1);
      expect(field.manager.layerElapsed).toBe(8);
    });
  });

  it('rolls elites with the roster entry chance', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, 13);
      const chance = vi.spyOn(field.manager.randomScopes.spawn, 'chance');

      field.manager.update(5);

      expect(chance).toHaveBeenCalledWith(0.2);
    });
  });

  it('does not complete a layer while scheduled spawns are pending', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, 4);
      field.manager.update(8);
      const [first] = ofType(field.active, 'drone');

      field.kill(first);

      expect(field.manager.waveInProgress).toBe(true);
      expect(field.manager.layerSchedule.length).toBeGreaterThan(0);
    });
  });

  it('tracks the layer 10 Warden and its Motes, completing when the boss dies last', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, 10);
      const { manager, active, emits } = field;

      // Warden at once, 4 Motes on the schedule.
      expect(manager.totalEnemiesThisWave).toBe(5);
      const [boss] = ofType(active, 'boss');
      expect(boss).toBeTruthy();

      manager.update(60);
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
});

describe('WaveManager Heralds', () => {
  it('brings the layer 3 Herald of Dust at 15 s and holds the layer until it dies', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
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
      active.filter((e) => e !== herald && !e.destroyed).forEach(field.kill);
      expect(manager.waveInProgress).toBe(true);

      field.kill(herald);
      expect(manager.waveInProgress).toBe(false);
    });
  });
});

describe('WaveManager field events', () => {
  const eventsOf = (field, name) =>
    field.emits.filter((e) => e.event === name).map((e) => e.payload);

  it('starts the layer 2 Sensor Jam at 25 s and ends it 10 s later', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
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
  });

  it('pulls the XP sparks to a Gravity Well point 220-320 px from the ship', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
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
  });

  it('stuns every enemy and flashes the screen on a Solar Flare', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, 7);
      field.active.push({ type: 'asteroid', destroyed: false });

      field.manager.update(35);

      expect(eventsOf(field, 'field-event-started')[0].kind).toBe(
        'solar-flare'
      );
      const drones = ofType(field.active, 'drone');
      expect(drones.length).toBeGreaterThan(0);
      for (const drone of drones) expect(drone.stunTimer).toBe(1);
      expect(field.effects.addScreenFlash).toHaveBeenCalledTimes(1);
    });
  });

  it('does not hold a cleared layer open for an event still to come', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, 9);
      field.active.push({ type: 'asteroid', destroyed: false });
      field.manager.update(20);
      field.manager.update(20);
      // Everything spawned by 40 s; the Gravity Well (45 s) is still pending.
      expect(field.manager.layerSchedule.map((e) => e.event?.kind)).toEqual([
        'gravity-well',
      ]);

      field.active.forEach((enemy) => field.kill(enemy));
      field.manager.update(0.1);

      expect(field.manager.waveInProgress).toBe(false);
      expect(eventsOf(field, 'field-event-ended')).toEqual([
        { kind: 'sensor-jam' },
      ]);
    });
  });
});

describe('WaveManager layer modifiers', () => {
  const eventsOf = (field, name) =>
    field.emits.filter((e) => e.event === name).map((e) => e.payload);
  // The stub random has no seed: the run seed is 0.
  const firstFieldLayerWith = (id) => {
    let n = 16;
    while (modifierFor(n, 0) !== id || n % 5 === 0) n += 1;
    return n;
  };

  it("keeps only Seekers and Rams on a Hunters' Moon, 30 % more of each", async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
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
      const scaled = (kind) =>
        Math.round(base.find((e) => e.kind === kind).count * 1.3);
      expect(Object.fromEntries(trickled)).toEqual({
        ram: scaled('ram'),
        hunter: scaled('hunter'),
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
  });

  it('flags a Glass Field for the rock spawns until the layer ends', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, firstFieldLayerWith('glass-field'));
      expect(field.manager.layerModifier).toBe('glass-field');

      field.manager.completeWave();

      expect(field.manager.layerModifier).toBeNull();
      expect(eventsOf(field, 'layer-modifier-ended')).toEqual([
        { id: 'glass-field' },
      ]);
    });
  });

  it('sets the XP sparks drifting through a Magnetic Storm, and stops them', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, firstFieldLayerWith('magnetic-storm'));

      expect(field.xpOrbs.setDrift).toHaveBeenCalledWith(
        LAYER_MODIFIERS['magnetic-storm'],
        expect.objectContaining({ range: expect.any(Function) })
      );

      field.manager.completeWave();

      expect(field.xpOrbs.setDrift).toHaveBeenLastCalledWith(null);
    });
  });

  it('rolls no modifier inside the 15-layer table', async () => {
    await withWaveOverrides({ managerHandlesAsteroids: false }, () => {
      const field = createField();
      startLayer(field, 14);
      expect(field.manager.layerModifier).toBeNull();
      expect(eventsOf(field, 'layer-modifier-started')).toEqual([]);
    });
  });
});
