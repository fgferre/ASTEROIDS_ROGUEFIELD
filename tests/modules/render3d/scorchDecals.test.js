import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DECAL_CAP,
  DECAL_LIFE,
  ScorchDecals,
} from '../../../src/modules/render3d/scorchDecals.js';

// The vendored r128 build is UMD: evaluated with an `exports` object.
const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

function setup() {
  const scene = new THREE.Scene();
  const decals = new ScorchDecals(THREE, scene);
  const rock = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial()
  );
  rock.scale.setScalar(20);
  rock.position.set(50, 0, -30);
  scene.add(rock);
  const view = { kind: 'asteroid', id: 7, object: rock };
  const views = new Map([[7, view]]);
  return { decals, rock, view, views };
}

function instancePosition(decals, i) {
  const m = new THREE.Matrix4();
  decals.mesh.getMatrixAt(i, m);
  return new THREE.Vector3().setFromMatrixPosition(m);
}

describe('ScorchDecals', () => {
  it('places a mark on the rock surface, on the hit side, and moves with the rock', () => {
    const { decals, rock, view, views } = setup();
    expect(decals.hit(view, 1, 0)).toBe(true);
    expect(decals.update(0, views)).toBe(1);
    const p = instancePosition(decals, 0).sub(rock.position);
    expect(p.length()).toBeGreaterThan(19);
    expect(p.length()).toBeLessThan(21);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(0);

    rock.position.x += 100;
    rock.rotation.y = Math.PI;
    decals.update(0, views);
    const moved = instancePosition(decals, 0).sub(rock.position);
    expect(moved.length()).toBeCloseTo(p.length(), 3);
    expect(moved.x).toBeLessThan(0);
  });

  it('fades out over its life and drops marks whose rock is gone', () => {
    const { decals, view, views } = setup();
    decals.hit(view, 0, 1);
    decals.update(DECAL_LIFE / 2, views);
    expect(decals.fade.array[0]).toBeGreaterThan(0);
    expect(decals.fade.array[0]).toBeLessThan(1);
    expect(decals.update(DECAL_LIFE / 2, views)).toBe(0);

    decals.hit(view, 0, 1);
    expect(decals.update(0, new Map())).toBe(0);
    expect(decals.count).toBe(0);
  });

  it(`never holds more than ${DECAL_CAP} marks: the oldest gives way`, () => {
    const { decals, view, views } = setup();
    for (let i = 0; i < DECAL_CAP + 10; i += 1) decals.hit(view, 1, i * 0.1);
    expect(decals.count).toBe(DECAL_CAP);
    expect(decals.update(0, views)).toBe(DECAL_CAP);
  });

  it('does nothing when the preset turns marks off', () => {
    const { decals, view, views } = setup();
    decals.hit(view, 1, 0);
    decals.setEnabled(false);
    expect(decals.hit(view, 1, 0)).toBe(false);
    expect(decals.update(0, views)).toBe(0);
    expect(decals.mesh.visible).toBe(false);
  });
});
