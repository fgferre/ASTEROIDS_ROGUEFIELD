import { describe, expect, it } from 'vitest';
import { directorFor } from '../../src/data/layers.js';
import { EnemySystem } from '../../src/modules/EnemySystem.js';

describe('EnemySystem.layerDirector', () => {
  it('rolls a layer past the table from the run seed, like WaveManager', () => {
    const runSeed = 3; // seed 0 and seed 3 roll different modifiers on layer 17
    const difficulty = {
      getRunSeed: () => runSeed,
      getModifiers: () => ({ spawnCount: 1 }),
    };
    const system = { waveManager: null, dependencies: { difficulty } };

    const director = EnemySystem.prototype.layerDirector.call(system, 17);
    const waveDirector = directorFor(17, runSeed);

    expect(waveDirector.modifier).not.toBe(directorFor(17, 0).modifier);
    expect(director.modifier).toBe(waveDirector.modifier);
    expect(director.rocks).toBe(waveDirector.rocks);
  });
});
