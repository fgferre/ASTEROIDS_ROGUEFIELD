// The Canvas 2D gameplay renderer is frozen as an easter egg (`?renderer=2d`;
// PLAN.md decision 6, 18/10/2026). It gets no new features and no 2D/3D parity
// work: new machines, weapons and effects are built in src/modules/render3d/
// only. This test pins the size of the 2D-only files so the path can shrink or
// be repaired but cannot grow. If it fails on you: you are adding to the 2D
// path. Build the feature in render3d/ instead. A repair that honestly needs
// lines updates the ceiling here, in the same commit.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// file -> line ceiling (newline count at the freeze)
const FROZEN = {
  'src/modules/RenderingSystem.js': 1991,
  'src/modules/enemies/components/RenderComponent.js': 1745,
  'src/modules/enemies/components/AsteroidRenderer.js': 206,
  'src/modules/enemies/systems/EnemyRenderSystem.js': 79,
  'src/modules/effects/draw2d.js': 454,
  'src/modules/combat/draw2d.js': 633,
};

describe('the Canvas 2D renderer is frozen (easter egg)', () => {
  for (const [file, ceiling] of Object.entries(FROZEN)) {
    it(`${file} keeps its FROZEN header and stays at or under ${ceiling} lines`, () => {
      const text = readFileSync(resolve(ROOT, file), 'utf8');
      expect(text.startsWith('// FROZEN (')).toBe(true);
      expect(
        text.split('\n').length - 1,
        `${file} grew: the 2D renderer is frozen (easter egg); build in render3d/ instead`
      ).toBeLessThanOrEqual(ceiling);
    });
  }
});
