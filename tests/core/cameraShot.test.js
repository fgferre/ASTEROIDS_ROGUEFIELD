import { describe, expect, it } from 'vitest';
import {
  fieldFitDistance,
  projectToScreen,
  shotCorners,
  shotExtent,
} from '../../src/core/cameraShot.js';
import { footprint } from '../../src/modules/render3d/cameraRig.js';
import { FOV } from '../../src/modules/render3d/sceneSetup.js';

const W = 800;
const H = 600;
const DEG = Math.PI / 180;
const tanV = Math.tan((FOV * Math.PI) / 360);
const ASPECTS = [9 / 16, 1, 4 / 3, 16 / 9, 21 / 9, 32 / 9];

describe('cameraShot', () => {
  it('reaches as far as the rig footprint at the gameplay tilt', () => {
    for (const aspect of ASPECTS) {
      const lens = { tanV, aspect };
      const e = shotExtent(700, { tilt: 18 * DEG }, lens);
      const f = footprint(700, aspect);
      expect(e.up).toBeCloseTo(f.up, 6);
      expect(e.down).toBeCloseTo(f.down, 6);
      // The far edge is the widest one, centred on the target.
      expect(e.left).toBeCloseTo(f.halfWidth, 6);
      expect(e.right).toBeCloseTo(f.halfWidth, 6);
    }
  });

  it('projects its own ground corners back onto the screen corners', () => {
    const lens = { tanV, aspect: 16 / 9 };
    const pose = {
      x: 380,
      y: 290,
      distance: 650,
      tilt: 28 * DEG,
      yaw: 8 * DEG,
      roll: 2 * DEG,
    };
    const { xs, ys } = shotCorners(pose, lens);
    const expected = [
      [-1, 1],
      [1, 1],
      [1, -1],
      [-1, -1],
    ];
    for (let i = 0; i < 4; i += 1) {
      const p = projectToScreen(pose, lens, pose.x + xs[i], pose.y + ys[i]);
      expect(p.front).toBe(true);
      expect(p.x).toBeCloseTo(expected[i][0], 6);
      expect(p.y).toBeCloseTo(expected[i][1], 6);
    }
    expect(projectToScreen(pose, lens, pose.x, pose.y).x).toBeCloseTo(0, 6);
  });

  it('at zoom 1 touches both field edges on the screen long side', () => {
    const lens = { tanV, aspect: 16 / 9 };
    const a = { tilt: 18 * DEG };
    const e = shotExtent(fieldFitDistance(a, lens, W, H), a, lens);
    expect(e.left + e.right).toBeCloseTo(W, 6);
    expect(e.up + e.down).toBeLessThan(H);
  });
});
