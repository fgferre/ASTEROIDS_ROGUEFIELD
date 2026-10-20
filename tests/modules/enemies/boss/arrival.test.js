import { describe, expect, it } from 'vitest';

import { WARDEN_KINDS } from '../../../../src/data/enemies/boss.js';
import {
  advanceArrival,
  arrivalEdge,
  arrivalRemaining,
  beginArrival,
} from '../../../../src/modules/enemies/boss/arrival.js';

const RECIPE = WARDEN_KINDS.prime.arrival;
const WIDTH = 800;
const STEP = 1 / 60;
const TRAVEL = RECIPE.travel * RECIPE.world;
const TOTAL = TRAVEL + RECIPE.close * RECIPE.world;

// A boss standing at its landing spot, with the poses it was asked for.
function fakeBoss(bodies = 1) {
  const boss = {
    id: 'warden-test',
    x: 640,
    y: 200,
    radius: 60,
    poses: [],
    arrivalBodies() {
      return this.bodies;
    },
    poseArrival(open, spin, dt) {
      this.poses.push({ open, spin, dt });
    },
  };
  boss.bodies = Array.from({ length: bodies }, (_, i) =>
    i === 0 && bodies === 1
      ? boss
      : {
          get x() {
            return boss.x + (i - 1) * 90;
          },
          get y() {
            return boss.y;
          },
        }
  );
  return boss;
}

function recorder() {
  const events = [];
  const emit = (name, payload) => events.push({ name, payload });
  return {
    events,
    emit,
    named: (name) => events.filter((e) => e.name === name),
  };
}

// Steps the entrance until `seconds` of world time have passed (or it ends).
function fly(boss, emit, seconds = TOTAL + 1) {
  for (let t = 0; boss.arrival && t < seconds - 1e-9; t += STEP) {
    advanceArrival(boss, STEP, emit);
  }
}

describe('Warden arrival', () => {
  it('comes in through the edge the ship is farther from', () => {
    expect(arrivalEdge(600)).toBe('left');
    expect(arrivalEdge(401)).toBe('left');
    expect(arrivalEdge(400)).toBe('right');
    expect(arrivalEdge(120)).toBe('right');
  });

  it('starts fully past the chosen edge, untouchable, with the recipe in hand', () => {
    const left = fakeBoss();
    const payload = beginArrival(left, RECIPE, 'left');
    expect(left.x).toBe(-(left.radius + RECIPE.start));
    expect(left.intangible).toBe(true);
    expect(left.arrival.edge).toBe('left');
    expect(left.arrival.open).toBe(RECIPE.open);
    expect(arrivalRemaining(left)).toBeCloseTo(TOTAL, 9);
    expect(payload).toMatchObject({
      edge: 'left',
      to: { x: 640, y: 200 },
      travel: RECIPE.travel,
      close: RECIPE.close,
      world: RECIPE.world,
    });

    const right = fakeBoss();
    beginArrival(right, RECIPE, 'right');
    expect(right.x).toBe(WIDTH + right.radius + RECIPE.start);
    expect(right.intangible).toBe(true);
  });

  it('lands exactly on its spot after travel and close, and can be hit again', () => {
    const boss = fakeBoss();
    const { emit } = recorder();
    beginArrival(boss, RECIPE, 'left');

    fly(boss, emit, TOTAL - 2 * STEP);
    expect(boss.arrival).not.toBeNull();
    expect(boss.intangible).toBe(true);
    expect(arrivalRemaining(boss)).toBeGreaterThan(0);

    fly(boss, emit);
    expect(boss.arrival).toBeNull();
    expect(boss.intangible).toBe(false);
    expect(boss.x).toBe(640);
    expect(boss.y).toBe(200);
    expect(arrivalRemaining(boss)).toBe(0);
  });

  it('tells the edge once for each body, and the end of the entrance once', () => {
    const boss = fakeBoss(3);
    const { emit, named } = recorder();
    beginArrival(boss, RECIPE, 'right');

    fly(boss, emit);

    const crossings = named('boss-arrival-crossed');
    expect(crossings).toHaveLength(3);
    for (const { payload } of crossings) {
      expect(payload).toMatchObject({ enemy: boss, edge: 'right', x: WIDTH });
      expect(payload.flare).toBe(RECIPE.flare);
    }
    expect(named('boss-arrived')).toHaveLength(1);
    expect(named('boss-arrived')[0].payload.position).toEqual({
      x: 640,
      y: 200,
    });
  });

  it('flies open while it travels, closes up as it lands, and is shut at the end', () => {
    const boss = fakeBoss();
    const { emit } = recorder();
    beginArrival(boss, RECIPE, 'left');

    fly(boss, emit, TRAVEL - 2 * STEP);
    expect(boss.arrival.open).toBe(RECIPE.open);
    expect(boss.poses.at(-1).open).toBe(RECIPE.open);

    fly(boss, emit, 2 * STEP + (TOTAL - TRAVEL) / 2);
    expect(boss.arrival.open).toBeGreaterThan(0);
    expect(boss.arrival.open).toBeLessThan(RECIPE.open);

    fly(boss, emit);
    expect(boss.poses.at(-1).open).toBe(0);
    expect(boss.arrival).toBeNull();
  });
});
