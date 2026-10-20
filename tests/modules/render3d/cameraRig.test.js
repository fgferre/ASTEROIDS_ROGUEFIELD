import { describe, expect, it } from 'vitest';
import { CAMERA_ZOOM, createCamera } from '../../../src/core/camera.js';
import {
  CameraRig,
  footprint,
} from '../../../src/modules/render3d/cameraRig.js';
import { FOV } from '../../../src/modules/render3d/sceneSetup.js';

const W = 800;
const H = 600;
const EPSILON = 1e-6;

// The rig over a logical camera at `zoom` on an `aspect` screen.
function rigAt(aspect, zoom, dolly = 1) {
  const camera = createCamera();
  camera.setAspect(aspect);
  camera.setZoom(zoom);
  const rig = new CameraRig(camera);
  rig.dolly = dolly;
  return { camera, rig };
}

describe('CameraRig field fit', () => {
  // The classic shot: a pull-out under the field, the field, the base, a
  // push-in.
  const zooms = [0.85, 1.05, 1, CAMERA_ZOOM, 1.5];
  const aspects = [1, 4 / 3, 16 / 10, 16 / 9, 21 / 9, 32 / 9];
  const corners = [
    [5, 5],
    [W - 5, 5],
    [5, H - 5],
    [W - 5, H - 5],
  ];

  it('never shows past the field edge, at any aspect, zoom, dolly or corner', () => {
    for (const aspect of aspects) {
      for (const zoom of zooms) {
        for (const dolly of [0.94, 1, 1.08]) {
          const { camera, rig } = rigAt(aspect, zoom, dolly);
          const distance = rig.frameShot(aspect);
          const { halfWidth, up, down } = footprint(distance, aspect);
          for (const [x, y] of corners) {
            camera.snapTo(x, y);
            const at = rig.clampToField(distance, aspect);
            const shot = `aspect ${aspect} zoom ${zoom} dolly ${dolly} at ${x},${y}`;
            expect(at.x - halfWidth, shot).toBeGreaterThanOrEqual(-EPSILON);
            expect(at.x + halfWidth, shot).toBeLessThanOrEqual(W + EPSILON);
            expect(at.y - up, shot).toBeGreaterThanOrEqual(-EPSILON);
            expect(at.y + down, shot).toBeLessThanOrEqual(H + EPSILON);
          }
        }
      }
    }
  });

  it('follows up to every field edge, so no strip of the field is never shown', () => {
    for (const aspect of aspects) {
      const { camera, rig } = rigAt(aspect, CAMERA_ZOOM);
      const distance = rig.frameShot(aspect);
      const { halfWidth, up, down } = footprint(distance, aspect);
      // the shot with the follow target on the field's (x, y)
      const at = (x, y) => {
        camera.snapTo(x, y);
        return rig.clampToField(distance, aspect);
      };
      const shot = `aspect ${aspect}`;
      expect(at(W / 2, H).y + down, shot).toBeCloseTo(H, 6);
      expect(at(W / 2, 0).y - up, shot).toBeCloseTo(0, 6);
      expect(at(0, H / 2).x - halfWidth, shot).toBeCloseTo(0, 6);
      expect(at(W, H / 2).x + halfWidth, shot).toBeCloseTo(W, 6);
    }
  });

  it('shows the whole field width on 21:9, its far edge on the field edge', () => {
    const { rig } = rigAt(21 / 9, CAMERA_ZOOM);
    const { halfWidth } = footprint(rig.frameShot(21 / 9), 21 / 9);
    expect(2 * halfWidth).toBeCloseTo(W, 6);
  });

  it('keeps the 4:3 shot of before: 800 / zoom across, times the dolly', () => {
    const tanV = Math.tan((FOV * Math.PI) / 360);
    for (const dolly of [1, 1.08]) {
      const { rig } = rigAt(4 / 3, CAMERA_ZOOM, dolly);
      const before = (W / CAMERA_ZOOM / (2 * tanV * (4 / 3))) * dolly;
      expect(rig.frameShot(4 / 3)).toBeCloseTo(before, 9);
    }
  });
});
