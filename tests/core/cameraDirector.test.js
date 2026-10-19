import { describe, expect, it } from 'vitest';
import {
  createDirector,
  createDirectorScene,
  MOMENTS,
  timeToHit,
} from '../../src/core/cameraDirector.js';
import { projectToScreen, shotCorners } from '../../src/core/cameraShot.js';
import { CAMERA_DIRECTOR } from '../../src/data/constants/camera.js';
import { FOV } from '../../src/modules/render3d/sceneSetup.js';

const W = 800;
const H = 600;
const DT = 1 / 60;
const tanV = Math.tan((FOV * Math.PI) / 360);
const M = CAMERA_DIRECTOR.moments;

function director(aspect = 16 / 9) {
  const d = createDirector({ fieldWidth: W, fieldHeight: H });
  d.setLens({ tanV, aspect });
  return d;
}

function scene(x, y, extra = {}) {
  return { ...createDirectorScene(), hasShip: true, x, y, ...extra };
}

function run(d, s, seconds) {
  let pose = null;
  for (let t = 0; t < seconds; t += DT) pose = d.update(s, DT);
  return pose;
}

function lensOf(aspect) {
  return { tanV, aspect };
}

function insideField(pose, aspect) {
  const { xs, ys } = shotCorners(pose, lensOf(aspect));
  return xs.every((x, i) => {
    const px = pose.x + x;
    const py = pose.y + ys[i];
    return px >= -1e-6 && px <= W + 1e-6 && py >= -1e-6 && py <= H + 1e-6;
  });
}

function screenOf(pose, aspect, x, y) {
  return projectToScreen(pose, lensOf(aspect), x, y);
}

// A hostile shot that reaches the ship at (x, y) in `seconds`, from `angle`.
function shotAt(x, y, seconds, angle, speed = 300) {
  const d = speed * seconds + 24 + 4;
  return {
    x: x + Math.cos(angle) * d,
    y: y + Math.sin(angle) * d,
    vx: -Math.cos(angle) * speed,
    vy: -Math.sin(angle) * speed,
    radius: 4,
    active: true,
  };
}

describe('camera director', () => {
  it('times a hit by the closing distance, and never for what moves away', () => {
    expect(timeToHit(100, 0, -50, 0, 10)).toBeCloseTo(1.8, 6);
    expect(timeToHit(100, 0, 50, 0, 10)).toBe(Infinity);
    expect(timeToHit(100, 100, -50, 0, 10)).toBe(Infinity);
    expect(timeToHit(5, 0, 0, 0, 10)).toBe(0);
  });

  it('when calm, comes close to the ship within the calm zoom and keeps it central', () => {
    const d = director();
    const pose = run(d, scene(400, 300), 4);
    expect(d.moment).toBe('calm');
    expect(pose.zoom).toBeGreaterThanOrEqual(M.calm.zoom[0] - 1e-6);
    expect(pose.zoom).toBeLessThanOrEqual(M.calm.zoom[1] + 1e-6);
    const p = screenOf(pose, 16 / 9, 400, 300);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(CAMERA_DIRECTOR.margins.player);
    expect(Math.abs(p.y)).toBeLessThanOrEqual(CAMERA_DIRECTOR.margins.player);
  });

  it('leads toward the aim when calm, and not at all with reduced motion', () => {
    const lead = (reduced) => {
      const d = director();
      d.setReducedMotion(reduced);
      const s = scene(400, 300, { leadX: 90, leadY: 0 });
      return run(d, s, 4).x;
    };
    expect(lead(false)).toBeGreaterThan(400 + 30);
    expect(lead(true)).toBeCloseTo(400, 0);
  });

  it('never shows past the field edge, in any moment, window shape or place', () => {
    const shapes = [9 / 16, 1, 4 / 3, 16 / 9, 21 / 9, 32 / 9];
    const spots = [
      [5, 5],
      [W - 5, 5],
      [W - 5, H - 5],
      [5, H - 5],
      [W / 2, H / 2],
    ];
    for (const aspect of shapes) {
      for (const moment of MOMENTS) {
        const d = director(aspect);
        d.force(moment);
        for (const [x, y] of spots) {
          const boss = { type: 'boss', x: W - x, y: H - y, radius: 80 };
          const pose = run(d, scene(x, y, { enemies: [boss] }), 1);
          expect(
            insideField(pose, aspect),
            `${moment} ${aspect} ${x},${y}`
          ).toBe(true);
        }
      }
    }
  });

  it('keeps the ship whole on screen in every moment, even flying flat out', () => {
    for (const moment of MOMENTS) {
      const d = director();
      d.force(moment);
      run(d, scene(200, 300), 2);
      for (let t = 0; t < 2; t += DT) {
        // Across the field and back at 300 units/s, clear of the side strips.
        const x = 200 + 400 * Math.abs(Math.sin(t * 0.75));
        const pose = d.update(scene(x, 300, { vx: 300 }), DT);
        const p = screenOf(pose, 16 / 9, x, 300);
        expect(Math.abs(p.x), `${moment} at ${x}`).toBeLessThanOrEqual(1);
        expect(Math.abs(p.y), `${moment} at ${x}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('keeps what will hit on screen at once, even from below on an ultrawide', () => {
    // On 32:9 ship and bolt may not both fit: the bolt wins (field, threat,
    // ship), so the ship is only checked on the others.
    for (const aspect of [16 / 9, 21 / 9, 32 / 9]) {
      const d = director(aspect);
      // Settled close in, calm, at the field's top.
      run(d, scene(400, 150), 4);
      const bolt = shotAt(400, 150, 0.6, Math.PI / 2);
      const pose = d.update(scene(400, 150, { shots: [bolt] }), DT);
      const p = screenOf(pose, aspect, bolt.x, bolt.y);
      const margin = CAMERA_DIRECTOR.margins.threat;
      expect(Math.abs(p.x), `aspect ${aspect}`).toBeLessThanOrEqual(margin);
      expect(Math.abs(p.y), `aspect ${aspect}`).toBeLessThanOrEqual(margin);
      if (aspect < 3) {
        const s = screenOf(pose, aspect, 400, 150);
        expect(Math.abs(s.y), `aspect ${aspect}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('calls danger only after a second of it, and lets go after two calm seconds', () => {
    const d = director();
    // Seven enemies on top of the ship: crowd danger.
    const crowd = Array.from({ length: 7 }, (_, i) => ({
      type: 'drone',
      x: 400 + Math.cos(i) * 60,
      y: 300 + Math.sin(i) * 60,
      radius: 12,
    }));
    run(d, scene(400, 300, { enemies: crowd }), 0.8);
    expect(d.moment).not.toBe('danger');
    run(d, scene(400, 300, { enemies: crowd }), 0.4);
    expect(d.moment).toBe('danger');
    run(d, scene(400, 300), 1.5);
    expect(d.moment).toBe('danger');
    run(d, scene(400, 300), 1);
    expect(d.moment).not.toBe('danger');
  });

  it('breathes when the wave is cleared, even straight out of danger', () => {
    const d = director();
    const crowd = Array.from({ length: 7 }, (_, i) => ({
      type: 'drone',
      x: 400 + Math.cos(i) * 60,
      y: 300 + Math.sin(i) * 60,
      radius: 12,
    }));
    run(d, scene(400, 300, { enemies: crowd }), 1.5);
    expect(d.moment).toBe('danger');
    d.trigger('cleared');
    run(d, scene(400, 300), DT);
    expect(d.moment).toBe('cleared');
    run(d, scene(400, 300), M.cleared.minActive + 0.1);
    expect(d.moment).toBe('calm');
  });

  it('feels the pressure of a group close by and opens a little', () => {
    const d = director();
    const group = [0, 1, 2].map((i) => ({
      type: 'hunter',
      x: 600 + i * 30,
      y: 300,
      radius: 14,
    }));
    const pose = run(d, scene(400, 300, { enemies: group }), 3);
    expect(d.moment).toBe('pressure');
    expect(pose.zoom).toBeLessThanOrEqual(M.pressure.zoom[1] + 1e-6);
  });

  it('frames the Warden and the ship, wide and tilted, on its entrance', () => {
    const d = director();
    run(d, scene(150, 300), 3);
    const warden = { type: 'boss', x: 600, y: 300, radius: 90 };
    d.trigger('bossEntrance', warden);
    const pose = run(d, scene(150, 300, { enemies: [warden] }), 1.5);
    expect(d.moment).toBe('bossEntrance');
    expect(pose.zoom).toBeCloseTo(1, 2);
    expect(pose.tilt).toBeGreaterThan(
      (18 + M.bossEntrance.tilt * 0.8) * (Math.PI / 180)
    );
    for (const [x, y] of [
      [150, 300],
      [600, 300],
    ]) {
      const p = screenOf(pose, 16 / 9, x, y);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1);
    }
    // Then the fight: the Warden stays a must.
    run(d, scene(150, 300, { enemies: [warden] }), M.bossEntrance.minActive);
    expect(d.moment).toBe('boss');
  });

  it('ranks death over victory over the entrance, and victory turns and ends on its own', () => {
    const d = director();
    run(d, scene(400, 300), 1);
    d.trigger('bossEntrance', { x: 600, y: 300, radius: 80 });
    d.trigger('victory');
    run(d, scene(400, 300), DT);
    expect(d.moment).toBe('victory');
    const turned = run(d, scene(400, 300), M.victory.minActive - 0.2);
    expect(turned.yaw).toBeGreaterThan(4 * (Math.PI / 180));
    d.trigger('death');
    run(d, scene(400, 300), DT);
    expect(d.moment).toBe('death');
    // Death holds until a reset.
    run(d, scene(400, 300), 10);
    expect(d.moment).toBe('death');
    d.reset();
    run(d, scene(400, 300), DT);
    expect(d.moment).toBe('calm');
  });

  it('closes in on the ship as it dies, in about the death spring', () => {
    const d = director();
    run(d, scene(400, 300), 4);
    d.trigger('death');
    const pose = run(d, scene(400, 300), 3);
    expect(pose.zoom).toBeGreaterThan(M.death.zoom[0] - 0.05);
  });

  it('with reduced motion: no extra angle, never too close, and the special moments cut', () => {
    const d = director();
    d.setReducedMotion(true);
    run(d, scene(400, 300), 4);
    d.trigger('victory');
    const pose = d.update(scene(400, 300), DT);
    expect(pose.zoom).toBeLessThanOrEqual(
      CAMERA_DIRECTOR.reducedMotion.maxZoom + 1e-6
    );
    expect(pose.zoom).toBeCloseTo(
      Math.min(M.victory.zoom[0], CAMERA_DIRECTOR.reducedMotion.maxZoom),
      6
    );
    expect(pose.tilt).toBeCloseTo(18 * (Math.PI / 180), 6);
    expect(pose.yaw).toBe(0);
    expect(pose.rollMax).toBe(0);
  });

  it('slides across the field when the ship wraps, instead of cutting', () => {
    const d = director();
    run(d, scene(790, 300), 4);
    const before = d.update(scene(790, 300), DT).x;
    // A few frames in, it is on its way across, not there.
    const first = run(d, scene(10, 300), 4 * DT).x;
    expect(first).toBeLessThan(before - 10);
    expect(first).toBeGreaterThan(before - 150);
    const after = run(d, scene(10, 300), 1).x;
    const settled = run(director(), scene(10, 300), 4).x;
    expect(after).toBeCloseTo(settled, 0);
  });
});
