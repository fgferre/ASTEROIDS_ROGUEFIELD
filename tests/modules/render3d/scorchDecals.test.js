import { describe, expect, it } from 'vitest';
import {
  DECAL_CAP,
  DECAL_LIFE,
  ScorchDecals,
} from '../../../src/modules/render3d/scorchDecals.js';
import THREE from '../../../src/modules/render3d/three.js';

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

  it('puts a mark where the camera sees the shot touch the rock', () => {
    const { rock, view } = setup();
    const camera = new THREE.PerspectiveCamera(40, 4 / 3, 10, 2000);
    camera.position.set(50, 600, 170);
    camera.lookAt(rock.position);
    const decals = new ScorchDecals(THREE, rock.parent, camera);
    // the rock's left edge, logical (world x + HALF_W, z + HALF_H); the
    // direction given (0, 1) is the old aim, and loses to the contact
    expect(decals.hit(view, 0, 1, 0, { x: 50 - 20 + 400, y: -30 + 300 })).toBe(
      true
    );
    decals.update(0, new Map([[7, view]]));
    const p = instancePosition(decals, 0).sub(rock.position);
    expect(p.x).toBeLessThan(-10);
    expect(Math.abs(p.z)).toBeLessThan(8);
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
    // one mark a frame: a frame only takes a few (the budget below)
    for (let i = 0; i < DECAL_CAP + 10; i += 1) {
      decals.hit(view, 1, i * 0.1);
      decals.update(0, views);
    }
    expect(decals.count).toBe(DECAL_CAP);
    expect(decals.update(0, views)).toBe(DECAL_CAP);
  });

  it('casts only a few rays a frame: the rest of the hits leave no mark', () => {
    const { decals, view, views } = setup();
    let made = 0;
    for (let i = 0; i < 20; i += 1) if (decals.hit(view, 1, i * 0.1)) made += 1;
    expect(made).toBeGreaterThan(0);
    expect(made).toBeLessThan(20);
    decals.update(0, views);
    expect(decals.hit(view, 1, 0)).toBe(true);
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
