import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DeathBursts } from '../../../src/modules/render3d/dissolve.js';
import { EnemyMirror } from '../../../src/modules/render3d/enemyMirror.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

const mirrorOf = () =>
  new EnemyMirror(
    THREE,
    new THREE.Scene(),
    (fn) => fn(),
    new DeathBursts({ push: () => {} }, { light: () => {} })
  );
const rock = (id, x, y, radius = 24) => ({
  id,
  type: 'asteroid',
  variant: 'common',
  x,
  y,
  radius,
  crackStage: 0,
  getHitFlash: () => 0,
});
const drawn = (mirror, slot) =>
  mirror.rocks.meshes.stone[slot].count +
  mirror.rocks.meshes.crystal[slot].count;

describe('rock breaking', () => {
  it('a killed rock falls apart into pieces of itself, then they go', () => {
    const mirror = mirrorOf();
    const enemy = rock('r', 400, 300, 12);
    mirror.update([enemy], 0, 0);
    const view = mirror.views.get('r');
    const fixed = mirror.rocks.fixed;

    mirror.markDead(enemy);
    mirror.update([], 0, 0.016);
    expect(mirror.dissolve.count).toBe(0);
    expect(drawn(mirror, view.shape)).toBe(0);
    const pieces = mirror.rocks.meshes.stone
      .slice(fixed)
      .filter((m) => m.count);
    expect(pieces).toHaveLength(4);

    mirror.update([], 1, 1);
    expect(mirror.rocks.meshes.stone.slice(fixed).every((m) => !m.count)).toBe(
      true
    );
    expect(mirror.rocks.free).toHaveLength(4);
  });

  it('a split rock’s fragments take its pieces, hot, where it was', () => {
    const mirror = mirrorOf();
    const parent = rock('p', 400, 300, 35);
    mirror.update([parent], 0, 0);
    const kids = [
      rock('a', 420, 300, 22),
      rock('b', 390, 318, 22),
      rock('c', 390, 282, 22),
    ];
    mirror.splitRock(parent, kids);
    mirror.update(kids, 0.016, 0.016);
    kids.forEach((kid) => {
      const view = mirror.views.get(kid.id);
      expect(view.shape).toBeGreaterThanOrEqual(mirror.rocks.fixed);
      expect(view.object.geometry.getAttribute('cut')).toBeTruthy();
      expect(view.rock.heat).toBeGreaterThan(0.9);
    });
    const shapes = kids.map((k) => mirror.views.get(k.id).shape);
    expect(new Set(shapes).size).toBe(3);
  });
});
