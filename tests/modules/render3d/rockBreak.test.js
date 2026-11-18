import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
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

  it('a Pulse breaking a whole field: four cuts a frame, nearest the ship first, the rest drawn whole until their turn', () => {
    const mirror = mirrorOf();
    const ship = { position: { x: 0, y: 300 } };
    const system = { getCachedPlayer: () => ship };
    // far first, so the frame's first four (cut at once) are the far ones
    const field = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100].map(
      (x) => ({ ...rock(`r${x}`, x, 300, 12), system })
    );
    mirror.update(field, 0, 0);
    const { fixed } = mirror.rocks;
    const pieces = () =>
      mirror.rocks.meshes.stone.slice(fixed).filter((m) => m.count).length;
    const whole = () => {
      const xs = [];
      mirror.rocks.meshes.stone.slice(0, fixed).forEach((mesh) => {
        for (let i = 0; i < mesh.count; i += 1)
          xs.push(Math.round(mesh.instanceMatrix.array[i * 16 + 12]));
      });
      return xs.sort((a, b) => a - b);
    };
    const offset = mirror.views.get('r100').object.position.x - 100;

    field.forEach((enemy) => mirror.markDead(enemy));
    mirror.update([], 0.016, 0.016);
    expect(pieces()).toBe(4 * 4);
    expect(whole()).toEqual(
      [100, 200, 300, 400, 500, 600].map((x) => x + offset)
    );
    mirror.update([], 0.032, 0.016);
    expect(pieces()).toBe(8 * 4);
    expect(whole()).toEqual([500, 600].map((x) => x + offset));
    mirror.update([], 0.048, 0.016);
    expect(pieces()).toBe(10 * 4);
    expect(whole()).toEqual([]);
  });

  it('a split waiting its turn: the rock stays whole and its fragments hidden, then they take its pieces', () => {
    const mirror = mirrorOf();
    const parents = [0, 1, 2, 3, 4].map((i) =>
      rock(`p${i}`, 100 + i * 120, 300, 35)
    );
    mirror.update(parents, 0, 0);
    const kids = parents.map((p) => [
      rock(`${p.id}a`, p.x + 20, p.y, 22),
      rock(`${p.id}b`, p.x - 20, p.y, 22),
    ]);
    parents.forEach((p, i) => mirror.splitRock(p, kids[i]));
    mirror.update(kids.flat(), 0.016, 0.016);
    const { fixed } = mirror.rocks;
    const shaped = (id) => mirror.views.get(id).shape >= fixed;
    expect(
      kids
        .slice(0, 4)
        .flat()
        .every((k) => shaped(k.id))
    ).toBe(true);
    const late = kids[4];
    expect(late.some((k) => shaped(k.id))).toBe(false);
    expect(late.every((k) => mirror.views.get(k.id).hidden)).toBe(true);
    const drawnWhole = mirror.rocks.meshes.stone
      .slice(0, fixed)
      .reduce((n, m) => n + m.count, 0);
    expect(drawnWhole).toBe(1);

    // its turn comes at the end of the next frame; its fragments show after
    mirror.update(kids.flat(), 0.032, 0.016);
    mirror.update(kids.flat(), 0.048, 0.016);
    late.forEach((k) => {
      const view = mirror.views.get(k.id);
      expect(view.hidden).toBe(false);
      expect(view.shape).toBeGreaterThanOrEqual(fixed);
      expect(view.rock.heat).toBeGreaterThan(0.9);
    });
  });

  it('a rock the Quarry Maw swallows is crushed in its mouth: pieces and dust out of the sides, the core flaring', () => {
    const mirror = mirrorOf();
    const maw = {
      id: 'maw',
      type: 'boss',
      bossKind: 'quarry-maw',
      x: 400,
      y: 300,
      radius: 66,
      facing: 0,
      jawOpen: 1,
      swallowedTotal: 0,
      getHitFlash: () => 0,
    };
    const enemy = rock('r', 460, 300, 20);
    const sparks = { emit: vi.fn() };
    mirror.update([maw, enemy], 0, 0, sparks);
    const core = mirror.views.get('maw').coreMaterial;
    const before = core.emissiveIntensity;

    enemy.destroyed = true;
    enemy.crushedIn = { x: 459, y: 300, facing: 0 };
    maw.swallowedTotal = 1;
    mirror.update([maw], 0, 0.016, sparks);
    expect(mirror.views.has('r')).toBe(false);
    const pieces = mirror.rocks.meshes.stone
      .slice(mirror.rocks.fixed)
      .filter((m) => m.count);
    expect(pieces.length).toBeGreaterThan(3);
    expect(core.emissiveIntensity).toBeGreaterThan(before + 1);
    // one spray to each side of the jaws
    expect(sparks.emit).toHaveBeenCalledTimes(2);
    const [[, , , upY], [, , , downY]] = sparks.emit.mock.calls;
    expect(upY * downY).toBeLessThan(0);
  });
});
