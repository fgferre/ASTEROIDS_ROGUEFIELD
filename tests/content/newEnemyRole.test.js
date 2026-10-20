// A new enemy that declares a role the layers already ask for shares that
// role's spawns from its `fromLayer`, with no stage or engine line: the Gnat
// (tests/__fixtures__/enemies/gnat.js, never shipped) joins the registry here
// as if it were src/content/enemies/gnat.js.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import gnat from '../__fixtures__/enemies/gnat.js';

// The global setup has already loaded the game on the real registry: the
// modules are loaded again, on this one, before the tests.
let RandomService;
let directorFor;
let LayerSchedule;
let WaveRandom;

vi.mock('../../src/content/registry.js', async (importOriginal) => {
  const registry = await importOriginal();
  const { default: enemy } = await import('../__fixtures__/enemies/gnat.js');
  const enemies = [...registry.listContent('enemies'), enemy];
  return {
    listContent: (kind) =>
      kind === 'enemies' ? enemies : registry.listContent(kind),
    getContent: (kind, id) =>
      kind === 'enemies' && id === enemy.id
        ? enemy
        : registry.getContent(kind, id),
  };
});

const SEED = 7;
const SKIRMISHERS = ['drone', 'gnat'];

/**
 * Plays layer `n`'s plan (director of layer `plan`, default `n`) to the end
 * through the schedule; returns the enemy kinds it spawned, in order, and
 * whether the role stream was made.
 */
function spawnsOn(n, plan = n) {
  const waveRandom = new WaveRandom(new RandomService(SEED));
  const roleRandom = vi.spyOn(waveRandom, 'createRoleRandom');
  const spawnWave = vi.fn();
  const schedule = new LayerSchedule({
    eventBus: { emit: () => {} },
    spawner: {
      waveRandom,
      spawnWave,
      spawnDelayMultiplier: 1,
      formationPoints: () => ({ edge: null, points: [] }),
    },
    layerEvents: { updateFieldEvents: () => {}, startFieldEvent: () => {} },
    getLayer: () => n,
    isFieldEmpty: () => false,
    checkWaveCompletion: () => {},
  });
  schedule.layerSchedule = schedule.buildLayerSchedule(directorFor(plan));
  // the second step brings the formations their first one warned of
  schedule.updateLayerSchedule(1e6);
  schedule.updateLayerSchedule(1e6);
  const kinds = spawnWave.mock.calls.flatMap(([{ enemies }]) =>
    enemies.flatMap(({ type, count }) => Array(count).fill(type))
  );
  return { kinds, drew: roleRandom.mock.calls.length > 0 };
}

const others = (kinds) => kinds.filter((kind) => !SKIRMISHERS.includes(kind));
const countOf = (kinds, kind) => kinds.filter((k) => k === kind).length;

describe('an enemy defined only as a content file, in a shared role', () => {
  beforeAll(async () => {
    vi.resetModules();
    ({ default: RandomService } = await import(
      '../../src/core/RandomService.js'
    ));
    ({ directorFor } = await import('../../src/data/layers.js'));
    ({ LayerSchedule } = await import(
      '../../src/modules/enemies/waves/LayerSchedule.js'
    ));
    ({ WaveRandom } = await import(
      '../../src/modules/enemies/waves/WaveRandom.js'
    ));
  });

  it('never comes before its first layer, and nothing is drawn there', () => {
    for (let n = 1; n < gnat.fromLayer; n += 1) {
      const { kinds, drew } = spawnsOn(n);
      expect(kinds, `layer ${n}`).not.toContain('gnat');
      expect(drew, `layer ${n}`).toBe(false);
    }
  });

  it('shares the skirmisher spawns from its first layer on, by draw', () => {
    for (let n = gnat.fromLayer; n <= 14; n += 1) {
      const { kinds, drew } = spawnsOn(n);
      expect(kinds, `layer ${n}`).toContain('gnat');
      expect(drew, `layer ${n}`).toBe(true);
    }
    expect(spawnsOn(17).kinds).toContain('gnat');
  });

  it('takes skirmisher spawns one draw each: Motes stay, the rest spawns as before', () => {
    const n = gnat.fromLayer;
    const before = spawnsOn(n - 1, n).kinds;
    const after = spawnsOn(n).kinds;
    expect(countOf(before, 'gnat')).toBe(0);
    expect(countOf(after, 'drone') + countOf(after, 'gnat')).toBe(
      countOf(before, 'drone')
    );
    expect(countOf(after, 'drone')).toBeGreaterThan(0);
    expect(others(after)).toEqual(others(before));
  });

  it('draws the same spawns for the same run', () => {
    expect(spawnsOn(11).kinds).toEqual(spawnsOn(11).kinds);
  });
});
