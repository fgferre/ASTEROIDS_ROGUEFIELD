import { describe, it, expect } from 'vitest';
import { createCamera } from '../../src/core/camera.js';

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
});
