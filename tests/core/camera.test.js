import { describe, it, expect } from 'vitest';
import {
  LOOK_AHEAD_MAX,
  createCamera,
  createCameraScene,
  frameFor,
  lookAheadFor,
  threatZoomFor,
} from '../../src/core/camera.js';

const W = 800;
const H = 600;

function settle(camera, x, y, seconds = 3, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) camera.update(x, y, dt);
}

describe('createCamera', () => {
  it('does not move while the target stays inside the dead zone', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H });
    camera.update(W / 2 + 25, H / 2 - 20, 0.1);
    expect(camera.x).toBe(W / 2);
    expect(camera.y).toBe(H / 2);
  });

  it('eases toward the target with a frame-rate independent lag', () => {
    const a = createCamera({ fieldWidth: W, fieldHeight: H });
    const b = createCamera({ fieldWidth: W, fieldHeight: H });
    a.update(W / 2 + 80, H / 2, 0.1);
    for (let i = 0; i < 10; i += 1) b.update(W / 2 + 80, H / 2, 0.01);
    expect(a.x).toBeGreaterThan(W / 2);
    expect(a.x).toBeLessThan(W / 2 + 50);
    expect(a.x).toBeCloseTo(b.x, 6);
  });

  it('settles with the target on the dead zone edge', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H });
    settle(camera, W / 2 + 80, H / 2);
    expect(camera.x).toBeCloseTo(W / 2 + 50, 3);
  });

  it('keeps the view inside the field at the corners', () => {
    const camera = createCamera({ zoom: 1.3, fieldWidth: W, fieldHeight: H });
    settle(camera, 2, 2);
    const view = camera.getView();
    expect(view.x).toBeCloseTo(0, 6);
    expect(view.y).toBeCloseTo(0, 6);
    expect(view.width).toBeCloseTo(W / 1.3, 6);
    settle(camera, W - 2, H - 2);
    const far = camera.getView();
    expect(far.x + far.width).toBeCloseTo(W, 6);
    expect(far.y + far.height).toBeCloseTo(H, 6);
  });

  it('snaps instead of panning across when the target wraps', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H });
    settle(camera, W - 5, H / 2);
    camera.update(5, H / 2, 1 / 60);
    expect(camera.getView().x).toBe(0);
  });

  it('shows the whole field, centered, when disabled', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H });
    camera.setEnabled(false);
    settle(camera, 10, 10);
    expect(camera.getView()).toEqual({ x: 0, y: 0, width: W, height: H });
    const calls = [];
    const ctx = {
      translate: (x, y) => calls.push(['t', x, y]),
      scale: (x, y) => calls.push(['s', x, y]),
    };
    camera.applyTransform(ctx);
    expect(calls).toEqual([
      ['t', W / 2, H / 2],
      ['s', 1, 1],
      ['t', -W / 2, -H / 2],
    ]);
  });

  it('pulses the zoom toward the peak and settles back on the base', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H, zoom: 1.3 });
    camera.pulseZoom(1.5, 0.6);
    camera.update(W / 2, H / 2, 0.18);
    expect(camera.zoom).toBeCloseTo(1.5, 6);
    camera.update(W / 2, H / 2, 0.42);
    expect(camera.zoom).toBe(1.3);
  });

  it('saturates the look-ahead at 90 px toward the aim', () => {
    const scene = { ...createCameraScene(), hasAim: true, aimX: 500, aimY: 0 };
    const near = lookAheadFor({ ...scene, aimX: 100 }, 0, 0, {});
    expect(near.x).toBeCloseTo(50, 6);
    expect(lookAheadFor(scene, 0, 0, {})).toEqual({ x: LOOK_AHEAD_MAX, y: 0 });
    const camera = createCamera({ fieldWidth: 4000, fieldHeight: 3000 });
    camera.snapTo(2000, 1500);
    settle(camera, 2000, 1500, 5);
    for (let t = 0; t < 5; t += 1 / 60) {
      camera.update(2000, 1500, 1 / 60, { ...scene, aimX: 3000, aimY: 1500 });
    }
    // The dead zone (30 px) eats the first part of the 90 px lead.
    expect(camera.x).toBeCloseTo(2000 + LOOK_AHEAD_MAX - 30, 1);
  });

  it('zooms out monotonically with the threat count', () => {
    const zooms = [0, 1, 2, 4, 6, 8, 10, 14].map((n) => threatZoomFor(n));
    expect(zooms[0]).toBeCloseTo(1.3, 6);
    expect(zooms[2]).toBeCloseTo(1.3, 6);
    expect(zooms[6]).toBeCloseTo(1.05, 6);
    expect(zooms[7]).toBeCloseTo(1.05, 6);
    for (let i = 1; i < zooms.length; i += 1) {
      expect(zooms[i]).toBeLessThanOrEqual(zooms[i - 1]);
    }
    const camera = createCamera({ fieldWidth: W, fieldHeight: H });
    settle(camera, W / 2, H / 2, 8, 1 / 60);
    for (let t = 0; t < 8; t += 1 / 60) {
      camera.update(W / 2, H / 2, 1 / 60, {
        ...createCameraScene(),
        threats: 12,
      });
    }
    expect(camera.zoom).toBeCloseTo(1.05, 3);
  });

  it('frames ship and boss at the 60/40 midpoint with the margin', () => {
    const near = frameFor(300, 300, 400, 300, {});
    expect(near.x).toBeCloseTo(340, 6);
    expect(near.y).toBeCloseTo(300, 6);
    expect(near.zoom).toBe(1.3);
    const far = frameFor(200, 300, 600, 300, {});
    expect(far.x).toBeCloseTo(360, 6);
    // Widest half-extent 240 + 120 margin must fit in 800 / (2 zoom).
    expect(far.zoom).toBeCloseTo(W / (2 * 360), 6);
    expect(frameFor(0, 0, 900, 0, {}).zoom).toBe(0.85);
  });

  it('blends into boss framing and reaches its target', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H });
    camera.snapTo(200, 300);
    const scene = {
      ...createCameraScene(),
      hasBoss: true,
      bossX: 700,
      bossY: 300,
    };
    camera.update(200, 300, 0.3, scene);
    expect(camera.frameWeight).toBeGreaterThan(0);
    expect(camera.frameWeight).toBeLessThan(1);
    for (let t = 0; t < 4; t += 1 / 60) camera.update(200, 300, 1 / 60, scene);
    expect(camera.frameWeight).toBe(1);
    const goal = frameFor(200, 300, 700, 300, {});
    expect(camera.zoom).toBeCloseTo(goal.zoom, 3);
    expect(camera.x).toBeCloseTo(W / 2, 6); // zoom < 1: the whole field
    for (let t = 0; t < 4; t += 1 / 60) camera.update(200, 300, 1 / 60);
    expect(camera.frameWeight).toBe(0);
    expect(camera.zoom).toBeCloseTo(1.3, 3);
  });

  it('classic mode ignores the scene and keeps the old numbers', () => {
    const busy = {
      ...createCameraScene(),
      hasAim: true,
      aimX: 790,
      aimY: 300,
      threats: 20,
      hasBoss: true,
      bossX: 600,
      bossY: 200,
    };
    const classic = createCamera({ fieldWidth: W, fieldHeight: H });
    const plain = createCamera({ fieldWidth: W, fieldHeight: H });
    classic.setMode('classic');
    classic.pulseZoom(1.5, 0.6);
    plain.pulseZoom(1.5, 0.6);
    for (let i = 0; i < 90; i += 1) {
      classic.update(W / 2 + 80, H / 2 + 40, 1 / 60, busy);
      plain.update(W / 2 + 80, H / 2 + 40, 1 / 60);
      expect(classic.x).toBe(plain.x);
      expect(classic.y).toBe(plain.y);
      expect(classic.zoom).toBe(plain.zoom);
    }
    expect(classic.zoom).toBe(1.3);
    expect(classic.frameWeight).toBe(0);
  });
});
