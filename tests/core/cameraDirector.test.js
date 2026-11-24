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
// The near shot's distance at 16:9: the field's width across the screen.
const NEAR_DISTANCE = W / 2 / (tanV * (16 / 9));

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

  it('follows the ship near, at its tilt, with the ship central', () => {
    const d = director();
    const pose = run(d, scene(400, 300), 3);
    expect(d.moment).toBe('near');
    expect(pose.tilt).toBeCloseTo(T.near.tilt * DEG, 3);
    expect(pose.distance).toBeCloseTo(NEAR_DISTANCE, -1);
    const p = screenOf(pose, 16 / 9, 400, 300);
    expect(Math.abs(p.x)).toBeLessThan(0.15);
    expect(Math.abs(p.y)).toBeLessThan(0.15);
  });

  it('near shows the field’s width across the screen, never moving sideways', () => {
    for (const aspect of [16 / 9, 4 / 3]) {
      const d = director(aspect);
      for (const sx of [100, 700]) {
        const pose = run(d, scene(sx, 300), 3);
        expect(pose.x, `aspect ${aspect}`).toBeCloseTo(W / 2, -1);
        expect(screenOf(pose, aspect, 0, pose.y).x).toBeCloseTo(-1, 1);
        expect(screenOf(pose, aspect, W, pose.y).x).toBeCloseTo(1, 1);
      }
      expect(shown(run(d, scene(400, 10), 3), aspect, 400, 0)).toBe(true);
      expect(shown(run(d, scene(400, 590), 3), aspect, 400, H)).toBe(true);
    }
  });

  it('near, may show past the top edge, but no more than allowed', () => {
    const d = director();
    const pose = run(d, scene(400, 10), 3);
    expect(d.moment).toBe('near');
    // Past the edge: the field's top edge is on screen, below its border.
    const edge = screenOf(pose, 16 / 9, 400, 0);
    expect(edge.y).toBeLessThan(1);
    // But at most `beyondEdge` of the half-view lies past it.
    expect(edge.y).toBeGreaterThanOrEqual(1 - T.near.beyondEdge - 0.05);
    expect(shown(pose, 16 / 9, 400, 10, 0.95)).toBe(true);
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

  it('opens when enemies close in from several sides out of view (a wide window)', () => {
    const d = director(21 / 9);
    const around = [
      { type: 'drone', x: 400, y: 70 },
      { type: 'drone', x: 400, y: 540 },
      { type: 'drone', x: 205, y: 105 },
    ];
    run(d, scene(400, 300, { enemies: around }), 0.5);
    expect(d.moment).toBe('wide');
  });

  it('stays near through an edge crossing, either way', () => {
    const d = director();
    run(d, scene(600, 300), 3);
    for (const [x, y, vx, vy] of [
      [790, 300, 260, 0],
      [10, 300, 260, 0],
      [400, 590, 0, 260],
      [400, 10, 0, 260],
    ]) {
      run(d, scene(x, y, { vx, vy }), 0.2);
      expect(d.moment, `${x},${y}`).toBe('near');
    }
  });

  it('a zoom pulse reaches its size at once, near and wide, and keeps the follow', () => {
    for (const forced of ['near', 'wide']) {
      const d = director();
      d.force(forced);
      const settled = run(d, scene(400, 300), 3).distance;
      expect(d.update(scene(400, 300), DT, 1.1).distance, forced).toBeCloseTo(
        settled / 1.1,
        3
      );
    }
    // The ship on the move: the shot follows it the same with a pulse on.
    const plain = director();
    const pulsed = director();
    let y = 150;
    for (const d of [plain, pulsed]) run(d, scene(400, y, { vy: 160 }), 1);
    for (let t = 0; t < 1; t += DT) {
      y += 160 * DT;
      const a = plain.update(scene(400, y, { vy: 160 }), DT);
      const b = pulsed.update(scene(400, y, { vy: 160 }), DT, 0.94);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1);
    }
  });

  it('counts only enemies out of the near shot as closing in around it', () => {
    const d = director();
    const around = [
      { type: 'drone', x: 550, y: 300 },
      { type: 'drone', x: 250, y: 300 },
      { type: 'drone', x: 400, y: 190 },
    ];
    run(d, scene(400, 300, { enemies: around }), 1);
    expect(d.moment).toBe('near');
  });

  it('opens when a boss is off the near shot', () => {
    const d = director();
    run(d, scene(400, 100), 3);
    const boss = { type: 'boss', x: 400, y: 540, radius: 80 };
    d.update(scene(400, 100, { enemies: [boss] }), DT);
    expect(d.moment).toBe('wide');
  });

  it('opens for a Herald off the near shot, like a boss', () => {
    const d = director();
    run(d, scene(400, 100), 3);
    const herald = { type: 'herald', x: 400, y: 540, radius: 34 };
    d.update(scene(400, 100, { enemies: [herald] }), DT);
    expect(d.moment).toBe('wide');
  });

  it('counts a boss with part of its body out of the shot as out (the Choir’s cores)', () => {
    const d = director();
    run(d, scene(400, 300), 3);
    // Its centre is on screen, a core on its orbit is not.
    const choir = { type: 'boss', x: 400, y: 450, radius: 118 };
    d.update(scene(400, 300, { enemies: [choir] }), DT);
    expect(d.moment).toBe('wide');
  });

  it('dives back near when a boss falls, then opens for the orbs', () => {
    const d = director();
    run(d, scene(400, 300), 2);
    d.trigger('waveStart');
    run(d, scene(400, 300), 1);
    d.trigger('dive');
    d.trigger('cleared');
    const orbs = [{ x: 700, y: 520, collected: false }];
    const pose = run(d, scene(400, 300, { orbs }), T.dive - 0.1);
    expect(d.moment).toBe('near');
    expect(pose.distance).toBeCloseTo(NEAR_DISTANCE, -1);
    run(d, scene(400, 300, { orbs }), 0.2);
    expect(d.moment).toBe('wide');
  });

  it('a dive leans toward the boss that fell, then lets go', () => {
    const d = director();
    const settled = run(d, scene(400, 100), 3).y;
    const boss = { x: 400, y: 480, radius: 60 };
    d.trigger('dive', boss);
    const pose = run(d, scene(400, 100), T.dive - 0.1);
    // Its body on screen (the lean aims at modelReach times its radius).
    expect(shown(pose, 16 / 9, boss.x, boss.y + boss.radius)).toBe(true);
    expect(shown(pose, 16 / 9, 400, 100, 0.95)).toBe(true);
    expect(run(d, scene(400, 100), 3).y).toBeCloseTo(settled, -1);
  });

  it('a look is wide for its own time, then eases back near', () => {
    const d = director();
    run(d, scene(400, 300), 2);
    d.trigger('waveStart');
    run(d, scene(400, 300), T.glance.waveStart - 0.1);
    expect(d.moment).toBe('wide');
    run(d, scene(400, 300), 0.2);
    expect(d.moment).toBe('near');
    const pose = run(d, scene(400, 300), 3);
    expect(Math.abs(pose.distance / NEAR_DISTANCE - 1)).toBeLessThan(0.01);
  });

  it('a threat keeps the view open a while after it is gone', () => {
    const d = director();
    run(d, scene(400, 100), 3);
    const boss = { type: 'boss', x: 400, y: 540, radius: 80 };
    run(d, scene(400, 100, { enemies: [boss] }), 0.5);
    run(d, scene(400, 100), T.wideHold - 0.2);
    expect(d.moment).toBe('wide');
    run(d, scene(400, 100), 0.4);
    expect(d.moment).toBe('near');
  });

  it('looks at an announced attack only when it comes from out of sight', () => {
    const d = director();
    run(d, scene(400, 300), 2);
    d.trigger('telegraph', { x: 440, y: 300 });
    d.update(scene(400, 300), DT);
    expect(d.moment).toBe('near');
    d.trigger('telegraph', { x: 790, y: 20 });
    d.update(scene(400, 300), DT);
    expect(d.moment).toBe('wide');
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
    const a = run(d, scene(400, 300, { leadY: 60 }), 2);
    expect(a.y).toBeCloseTo(300, 3);
    expect(a.roll).toBe(0);
    expect(a.rollMax).toBe(0);
    d.trigger('waveStart');
    const cut = d.update(scene(400, 300), DT);
    expect(d.moment).toBe('wide');
    expect(cut.tilt).toBeCloseTo(T.wide.tilt * DEG, 6);
  });

  it('leads up and down toward the aim when near', () => {
    const d = director();
    const pose = run(d, scene(400, 300, { leadY: 60 }), 3);
    expect(pose.y).toBeGreaterThan(330);
  });

  it('keeps the ship on screen through a wrap, then slides; cuts under reduced motion', () => {
    const d = director();
    d.force('near');
    run(d, scene(400, 590), 3);
    const wrap = d.update(scene(400, 10), DT);
    expect(shown(wrap, 16 / 9, 400, 10)).toBe(true);
    const first = wrap.y;
    const next = run(d, scene(400, 10), 4 * DT).y;
    const settled = run(d, scene(400, 10), 3).y;
    expect(next).toBeLessThan(first - 1);
    expect(next).toBeGreaterThan(settled + 1);

    const r = director();
    r.force('near');
    r.setReducedMotion(true);
    run(r, scene(400, 590), 3);
    const cut = r.update(scene(400, 10), DT).y;
    expect(cut).toBeCloseTo(run(r, scene(400, 10), 3).y, 0);
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

  it('frames the entrance as its recipe did at 38°, from farther at the play lens', () => {
    const at = (lens) => {
      const d = createDirector({ fieldWidth: W, fieldHeight: H });
      d.setLens({ tanV: lens, aspect: 16 / 9 });
      run(d, scene(400, 300), 1);
      return run(d, scene(400, 300, { enemies: [arriving('right')] }), 3)
        .distance;
    };
    const old = Math.tan(19 * DEG);
    expect(at(old)).toBeCloseTo(RECIPE.shot.distance[0], 0);
    expect(at(tanV) / at(old)).toBeCloseTo(old / tanV, 2);
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

describe('camera director, a small screen', () => {
  const PHONE = 844 / 390;
  const FULL = W / 2 / (tanV * PHONE);

  function phone(width) {
    const d = createDirector({ fieldWidth: W, fieldHeight: H });
    d.setLens({ tanV, aspect: PHONE, width });
    return d;
  }

  it('comes closer as if 1155 points wide, at most 1.6 times, not on a wide screen', () => {
    for (const [width, closer] of [
      [844, 1155 / 844],
      [600, 1.6],
      [1155, 1],
      [1920, 1],
    ]) {
      const pose = run(phone(width), scene(400, 300), 3);
      expect(pose.closer, `${width}`).toBeCloseTo(closer, 5);
      expect(pose.distance / (FULL / closer), `${width}`).toBeCloseTo(1, 2);
    }
  });

  it('follows the ship sideways when closer, never past the field’s side', () => {
    const left = run(phone(844), scene(60, 300), 4);
    expect(left.x).toBeLessThan(360);
    expect(screenOf(left, PHONE, 0, 300).x).toBeLessThan(-0.99);
    expect(run(phone(1920), scene(60, 300), 4).x).toBeCloseTo(400, 0);
  });

  it('opens the wide view for what a wide screen would, not for what it leaves out', () => {
    // Inside the full-width view, outside the closer one; then outside both.
    const d = phone(844);
    run(d, scene(400, 300), 2);
    run(d, scene(400, 300, { shots: [shotAt(400, 300, 1.6, 0, 200)] }), 0.2);
    expect(d.moment).toBe('near');
    run(d, scene(400, 300, { shots: [shotAt(400, 300, 1.9, 0, 250)] }), 0.2);
    expect(d.moment).toBe('wide');
  });
});
