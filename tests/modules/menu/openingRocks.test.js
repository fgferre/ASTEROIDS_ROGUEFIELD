import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOpeningRocks } from '../../../src/modules/menu/openingRocks.js';
import { createSeededRandom } from '../../../src/modules/render3d/asteroidMesh.js';
import { FieldBackdrop } from '../../../src/modules/render3d/fieldBackdrop.js';

const THREE = {};
new Function(
  'exports',
  'module',
  readFileSync(
    new URL('../../../src/public/libs/three.min.js', import.meta.url),
    'utf8'
  )
)(THREE, {});

// The game's rock views, reduced to what the menu's rocks use; `frame` holds
// the views pushed since the last begin().
function rockViews() {
  const frame = [];
  return {
    frame,
    createRock: () => ({
      object: new THREE.Object3D(),
      rock: { vein: new THREE.Color(), glow: [0, 0, 0, 0] },
    }),
    bindRock: () => {},
    rocks: {
      begin: () => (frame.length = 0),
      push: (view) => frame.push(view),
      end: () => {},
    },
  };
}

describe('opening rocks', () => {
  it("draws the game's rocks, small and still, where the backdrop's dark fragments stand", () => {
    const backdrop = new FieldBackdrop(THREE, new THREE.Scene());
    backdrop.setLook({
      structures: 0,
      debris: 0.35,
      sky0: new THREE.Color(),
      hazeColor: new THREE.Color(),
      hazeDensity: 1,
    });
    const views = rockViews();
    const rocks = createOpeningRocks({
      THREE,
      world: new THREE.Scene(),
      frame: new THREE.Matrix4(),
      fov: 40,
      aspect: 16 / 9,
      field: { near: 180, far: 700, count: 0 },
      rockViews: views,
      random: createSeededRandom(5),
      debris: backdrop.debris,
    });
    expect(backdrop.debris.visible).toBe(false);

    const fragment = new THREE.Matrix4();
    const shown = [];
    for (let i = 0; i < backdrop.debris.count; i += 1) {
      backdrop.debris.getMatrixAt(i, fragment);
      if (fragment.determinant() !== 0) shown.push(fragment.clone());
    }
    const poses = () => views.frame.map((v) => v.object.matrixWorld.clone());
    rocks.update(1 / 60, 0, false, 500);
    const first = poses();
    expect(first).toHaveLength(shown.length);
    first.forEach((pose, k) => {
      const at = new THREE.Vector3().setFromMatrixPosition(pose);
      expect(at).toEqual(new THREE.Vector3().setFromMatrixPosition(shown[k]));
      const size = new THREE.Vector3().setFromMatrixScale(pose);
      const was = new THREE.Vector3().setFromMatrixScale(shown[k]);
      expect(size.x).toBeCloseTo(was.x * 0.35);
    });

    for (let n = 0; n < 120; n += 1) rocks.update(1 / 60, n / 60, false, 500);
    expect(poses()).toEqual(first);
  });
});
