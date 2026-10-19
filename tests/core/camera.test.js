import { describe, it, expect } from 'vitest';
import {
  LOOK_AHEAD_MAX,
  createCamera,
  createCameraScene,
  lookAheadFor,
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

  it('frames 4:3 until told the screen aspect, then shows more across, never past the field', () => {
    const camera = createCamera({ zoom: 1.3 });
    expect(camera.getView().width).toBeCloseTo(W / 1.3, 6);
    expect(camera.getView().height).toBeCloseTo(H / 1.3, 6);
    camera.setAspect(16 / 10);
    expect(camera.getView().width).toBeCloseTo((H / 1.3) * 1.6, 6);
    expect(camera.getView().height).toBeCloseTo(H / 1.3, 6);
    // 21:9: the field's whole width, less height
    camera.setAspect(21 / 9);
    expect(camera.getView().width).toBeCloseTo(W, 6);
    expect(camera.getView().height).toBeCloseTo((W * 9) / 21, 6);
    // a pull-out stops at the field
    camera.setAspect(1);
    camera.setZoom(0.85);
    expect(camera.getView()).toEqual({ x: 100, y: 0, width: H, height: H });
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

  it('pulls the zoom out for a peak under the base and settles back', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H, zoom: 1.3 });
    camera.pulseZoom(1.3 * 0.94, 0.3);
    camera.update(W / 2, H / 2, 0.09);
    expect(camera.zoom).toBeCloseTo(1.3 * 0.94, 6);
    camera.update(W / 2, H / 2, 0.3);
    expect(camera.zoom).toBe(1.3);
  });

  it('drops a pulse weaker than the running one at its peak', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H, zoom: 1.3 });
    camera.pulseZoom(1.42, 0.45); // level-up
    camera.update(W / 2, H / 2, 0.135); // at its peak
    camera.pulseZoom(1.3 * 0.94, 0.3); // a dash
    camera.update(W / 2, H / 2, 1 / 60);
    expect(camera.zoom).toBeGreaterThan(1.4);
  });

  it('drops a weaker pulse in the first frames of a stronger one, which still peaks', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H, zoom: 1.3 });
    camera.pulseZoom(1.42, 0.45); // level-up
    camera.update(W / 2, H / 2, 1 / 60);
    camera.update(W / 2, H / 2, 1 / 60);
    camera.pulseZoom(1.3 * 0.94, 0.3); // a dash, two frames in
    let highest = 0;
    for (let t = 0; t < 0.45; t += 1 / 60) {
      camera.update(W / 2, H / 2, 1 / 60);
      highest = Math.max(highest, camera.zoom);
    }
    expect(highest).toBeCloseTo(1.42, 2);
  });

  it('starts a replacing pulse from the zoom the running one left', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H, zoom: 1.3 });
    camera.pulseZoom(1.3 * 0.94, 0.3);
    camera.update(W / 2, H / 2, 0.09);
    const before = camera.zoom;
    camera.pulseZoom(1.5, 0.6);
    camera.update(W / 2, H / 2, 1 / 240);
    expect(Math.abs(camera.zoom - before)).toBeLessThan(0.02);
  });

  it('saturates the look-ahead at 90 px toward the aim', () => {
    const scene = { ...createCameraScene(), hasAim: true, aimX: 500, aimY: 0 };
    const near = lookAheadFor({ ...scene, aimX: 100 }, 0, 0, {});
    expect(near.x).toBeCloseTo(50, 6);
    expect(lookAheadFor(scene, 0, 0, {})).toEqual({ x: LOOK_AHEAD_MAX, y: 0 });
  });

  it('leads along the hull heading, not the aim, on Camera Lead: Hull', () => {
    // Aim to the right, nose straight down the screen.
    const scene = {
      ...createCameraScene(),
      hasAim: true,
      aimX: 3000,
      aimY: 1500,
      heading: Math.PI / 2,
    };
    const lead = lookAheadFor(scene, 2000, 1500, {}, 'hull');
    expect(lead.x).toBeCloseTo(0, 6);
    expect(lead.y).toBeCloseTo(LOOK_AHEAD_MAX, 6);
  });

  it('hands the dynamic shot to the director when the scene has a ship', () => {
    const camera = createCamera({ fieldWidth: W, fieldHeight: H });
    camera.setAspect(16 / 9);
    const scene = { ...createCameraScene(), hasShip: true, x: 400, y: 300 };
    camera.update(400, 300, 1 / 60, scene);
    expect(camera.directed).not.toBeNull();
    expect(camera.moment).toBe('calm');
    expect(camera.x).toBe(camera.directed.x);
    camera.setMode('classic');
    camera.update(400, 300, 1 / 60, scene);
    expect(camera.directed).toBeNull();
  });

  it('classic mode ignores the scene and keeps the old numbers', () => {
    const busy = {
      ...createCameraScene(),
      hasShip: true,
      x: W / 2 + 80,
      y: H / 2 + 40,
      hasAim: true,
      aimX: 790,
      aimY: 300,
      enemies: [{ type: 'boss', x: 600, y: 200, radius: 80 }],
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
  });
});
