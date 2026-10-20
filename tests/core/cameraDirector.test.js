import { describe, expect, it } from 'vitest';
import {
  createDirector,
  createDirectorScene,
  timeToHit,
} from '../../src/core/cameraDirector.js';
import { projectToScreen } from '../../src/core/cameraShot.js';
import { CAMERA_DIRECTOR } from '../../src/data/constants/camera.js';
import { WARDEN_KINDS } from '../../src/data/enemies/boss.js';
import { beginArrival } from '../../src/modules/enemies/boss/arrival.js';
import { FOV } from '../../src/modules/render3d/sceneSetup.js';

const W = 800;
const H = 600;
const DT = 1 / 60;
const DEG = Math.PI / 180;
const tanV = Math.tan((FOV * Math.PI) / 360);
const T = CAMERA_DIRECTOR;
const SHAPES = [9 / 16, 1, 4 / 3, 16 / 9, 21 / 9, 32 / 9];

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
  for (let t = 0; t < seconds - 1e-9; t += DT) pose = d.update(s, DT);
  return pose;
}

function screenOf(pose, aspect, x, y) {
  return projectToScreen(pose, { tanV, aspect }, x, y);
}

function shown(pose, aspect, x, y, margin = 1) {
  const p = screenOf(pose, aspect, x, y);
  return p.front && Math.abs(p.x) <= margin && Math.abs(p.y) <= margin;
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

  it('follows the ship near, at today’s tilt, with the ship central', () => {
    const d = director();
    const pose = run(d, scene(400, 300), 3);
    expect(d.moment).toBe('near');
    expect(pose.tilt).toBeCloseTo(T.near.tilt * DEG, 3);
    expect(pose.zoom).toBeCloseTo(T.near.zoom, 1);
    const p = screenOf(pose, 16 / 9, 400, 300);
    expect(Math.abs(p.x)).toBeLessThan(0.15);
    expect(Math.abs(p.y)).toBeLessThan(0.15);
  });

  it('near, may show past the field edge, but no more than allowed', () => {
    const d = director();
    const pose = run(d, scene(10, 300), 3);
    expect(d.moment).toBe('near');
    // Past the edge: the field's left edge is on screen, right of its border.
    const edge = screenOf(pose, 16 / 9, 0, 300);
    expect(edge.x).toBeGreaterThan(-1);
    // But at most `beyondEdge` of the half-view lies past it.
    expect(edge.x).toBeLessThanOrEqual(-1 + 2 * T.near.beyondEdge * 0.5 + 0.05);
    expect(shown(pose, 16 / 9, 10, 300, 0.95)).toBe(true);
  });

  it('wide shows the whole field from nearly above, at every window shape', () => {
    for (const aspect of SHAPES) {
      const d = director(aspect);
      d.force('wide');
      const pose = run(d, scene(200, 200), 2);
      expect(pose.tilt, `aspect ${aspect}`).toBeCloseTo(T.wide.tilt * DEG, 2);
      for (const [x, y] of [
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
      ]) {
        expect(shown(pose, aspect, x, y), `aspect ${aspect} ${x},${y}`).toBe(
          true
        );
      }
    }
  });

  it('opens before something that will hit arrives from off screen', () => {
    for (const aspect of [16 / 9, 21 / 9]) {
      const d = director(aspect);
      run(d, scene(400, 150), 3);
      // From below, inside the field (shots leaving it are removed).
      const bolt = shotAt(400, 150, 1.2, Math.PI / 2);
      d.update(scene(400, 150, { shots: [bolt] }), DT);
      expect(d.moment, `aspect ${aspect}`).toBe('wide');
      // It has opened well before the bolt lands.
      const pose = run(d, scene(400, 150, { shots: [bolt] }), 0.6);
      expect(shown(pose, aspect, bolt.x, bolt.y), `aspect ${aspect}`).toBe(
        true
      );
    }
  });

  it('stays near for what is already on screen, even a crowd close by', () => {
    const d = director();
    const crowd = [0, 1, 2, 3].map((i) => ({
      type: 'drone',
      x: 440 + i * 12,
      y: 300 + i * 6,
      radius: 12,
    }));
    run(d, scene(400, 300, { enemies: crowd }), 2);
    expect(d.moment).toBe('near');
  });

  it('opens when enemies close in from several sides', () => {
    const d = director();
    const around = [
      { type: 'drone', x: 650, y: 300 },
      { type: 'drone', x: 150, y: 300 },
      { type: 'drone', x: 400, y: 80 },
    ];
    run(d, scene(400, 300, { enemies: around }), 0.5);
    expect(d.moment).toBe('wide');
  });

  it('opens just before the ship crosses a field edge', () => {
    const d = director();
    run(d, scene(600, 300), 3);
    d.update(scene(720, 300, { vx: 260 }), DT);
    expect(d.moment).toBe('wide');
  });

  it('opens when a boss is off the near shot', () => {
    const d = director();
    run(d, scene(100, 300), 3);
    const boss = { type: 'boss', x: 720, y: 300, radius: 80 };
    d.update(scene(100, 300, { enemies: [boss] }), DT);
    expect(d.moment).toBe('wide');
  });

  it('stays wide at least a while, then eases back near', () => {
    const d = director();
    run(d, scene(400, 300), 2);
    d.trigger('waveStart');
    run(d, scene(400, 300), T.glance.waveStart + T.wideHold - 0.2);
    expect(d.moment).toBe('wide');
    const pose = run(d, scene(400, 300), 3);
    expect(d.moment).toBe('near');
    expect(pose.zoom).toBeCloseTo(T.near.zoom, 1);
  });

  it('opens for the orbs of a cleared wave and closes once they are taken', () => {
    const d = director();
    run(d, scene(400, 300), 2);
    const orbs = [{ x: 700, y: 520, collected: false }];
    d.trigger('cleared');
    run(d, scene(400, 300, { orbs }), 1);
    expect(d.moment).toBe('wide');
    orbs[0].collected = true;
    run(d, scene(400, 300, { orbs }), T.wideHold + 0.2);
    expect(d.moment).toBe('near');
  });

  it('looks at an elite only when it spawns out of sight', () => {
    const d = director();
    run(d, scene(400, 300), 2);
    d.trigger('elite', { x: 420, y: 300 });
    d.update(scene(400, 300), DT);
    expect(d.moment).toBe('near');
    d.trigger('elite', { x: 790, y: 20 });
    d.update(scene(400, 300), DT);
    expect(d.moment).toBe('wide');
  });

  it('keeps the ship on screen in both states, flying flat out', () => {
    for (const forced of [null, 'near', 'wide']) {
      const d = director();
      d.force(forced);
      run(d, scene(200, 300), 2);
      for (let t = 0; t < 3; t += DT) {
        const x = 40 + 720 * Math.abs(Math.sin(t * 0.9));
        const pose = d.update(scene(x, 300, { vx: 300 }), DT);
        expect(shown(pose, 16 / 9, x, 300), `${forced} at ${x}`).toBe(true);
      }
    }
  });

  it('drifts slowly when calm, and holds still with an enemy close', () => {
    const calm = director();
    const a = run(calm, scene(400, 300), 2).x;
    const b = run(calm, scene(400, 300), 2).x;
    expect(Math.abs(a - b)).toBeGreaterThan(0.05);
    expect(Math.abs(a - b)).toBeLessThan(10);

    const busy = director();
    const close = [{ type: 'drone', x: 430, y: 300, radius: 12 }];
    const c = run(busy, scene(400, 300, { enemies: close }), 2).x;
    const e = run(busy, scene(400, 300, { enemies: close }), 2).x;
    expect(Math.abs(c - e)).toBeLessThan(0.01);
  });

  it('with reduced motion: no drift or lead, and the wide view cuts in', () => {
    const d = director();
    d.setReducedMotion(true);
    const a = run(d, scene(400, 300, { leadX: 90, leadY: 0 }), 2);
    expect(a.x).toBeCloseTo(400, 3);
    expect(a.roll).toBe(0);
    expect(a.rollMax).toBe(0);
    d.trigger('waveStart');
    const cut = d.update(scene(400, 300), DT);
    expect(d.moment).toBe('wide');
    expect(cut.tilt).toBeCloseTo(T.wide.tilt * DEG, 6);
  });

  it('leads toward the aim when near', () => {
    const d = director();
    const pose = run(d, scene(400, 300, { leadX: 90, leadY: 0 }), 3);
    expect(pose.x).toBeGreaterThan(430);
  });

  it('keeps the ship on screen through a wrap, then slides; cuts under reduced motion', () => {
    const d = director();
    d.force('near');
    run(d, scene(790, 300), 3);
    const wrap = d.update(scene(10, 300), DT);
    expect(shown(wrap, 16 / 9, 10, 300)).toBe(true);
    const first = wrap.x;
    const next = run(d, scene(10, 300), 4 * DT).x;
    const settled = run(d, scene(10, 300), 3).x;
    expect(next).toBeLessThan(first - 1);
    expect(next).toBeGreaterThan(settled + 1);

    const r = director();
    r.force('near');
    r.setReducedMotion(true);
    run(r, scene(790, 300), 3);
    const cut = r.update(scene(10, 300), DT).x;
    expect(cut).toBeCloseTo(run(r, scene(10, 300), 3).x, 0);
  });
});

describe('camera director, a Warden’s entrance', () => {
  const RECIPE = WARDEN_KINDS.prime.arrival;

  // A Warden that has just begun its entrance through `edge`.
  function arriving(edge) {
    const boss = {
      type: 'boss',
      x: 640,
      y: 200,
      radius: 60,
      destroyed: false,
      poseArrival() {},
    };
    beginArrival(boss, RECIPE, edge);
    return boss;
  }

  it('goes low and turns to the edge it comes through, mirrored per edge', () => {
    for (const [edge, side] of [
      ['right', 1],
      ['left', -1],
    ]) {
      const d = director();
      run(d, scene(400, 300), 1);
      const boss = arriving(edge);
      const pose = run(d, scene(400, 300, { enemies: [boss] }), 1.5);
      expect(d.moment, edge).toBe('arrival');
      expect(pose.tilt, edge).toBeGreaterThan(45 * DEG);
      expect(pose.tilt, edge).toBeCloseTo(RECIPE.shot.tilt[0] * DEG, 1);
      expect(pose.yaw, edge).toBeCloseTo(
        side * (90 + RECIPE.shot.turn[0]) * DEG,
        1
      );
    }
  });

  it('hands back to the play view once the entrance ends, the yaw back to 0', () => {
    const d = director();
    run(d, scene(400, 300), 1);
    const boss = arriving('right');
    run(d, scene(400, 300, { enemies: [boss] }), 1.5);
    expect(
      Math.abs(d.update(scene(400, 300, { enemies: [boss] }), DT).yaw)
    ).toBeGreaterThan(45 * DEG);

    boss.arrival = null;
    d.update(scene(400, 300, { enemies: [boss] }), DT);
    expect(d.moment).not.toBe('arrival');
    const pose = run(d, scene(400, 300, { enemies: [boss] }), 4);
    expect(Math.abs(pose.yaw)).toBeLessThan(0.05);
    expect(pose.tilt).toBeLessThan(45 * DEG);
  });

  it('never enters the entrance shot under reduced motion', () => {
    const d = director();
    d.setReducedMotion(true);
    const boss = arriving('left');
    for (let t = 0; t < 2; t += DT) {
      const pose = d.update(scene(400, 300, { enemies: [boss] }), DT);
      expect(d.moment).not.toBe('arrival');
      expect(pose.yaw).toBe(0);
    }
  });
});
