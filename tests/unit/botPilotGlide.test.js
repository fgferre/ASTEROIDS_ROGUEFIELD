// The playtest bot's classic glide: A/D turn, W/S push, the cannon on the nose
// (src/bootstrap/botPilotGlide.js).
import { describe, expect, it } from 'vitest';
import { createBotPilot } from '../../src/bootstrap/botPilot.js';
import {
  COAST,
  KEY_COMBOS,
  decideGlide,
  glideKeys,
  glideRollout,
} from '../../src/bootstrap/botPilotGlide.js';

const KNOBS = { horizon: 0.7, substeps: 5, reactionMs: 0 };
const combo = (turn, push) =>
  KEY_COMBOS.findIndex((c) => c.turn === turn && c.push === push);

function makeWorld(ship = {}, over = {}) {
  return {
    time: 0,
    width: 1920,
    height: 1080,
    movers: [],
    zones: [],
    loot: [],
    boss: null,
    ...over,
    ship: {
      x: 960,
      y: 540,
      vx: 0,
      vy: 0,
      angle: 0,
      spin: 0,
      radius: 15,
      maxSpeed: 220,
      acceleration: 280,
      damping: 3.1,
      braking: 0,
      dashReady: false,
      dashImpulse: 520,
      shieldReady: false,
      invulnerable: 0,
      health: 100,
      maxHealth: 100,
      reach: 400,
      glide: {
        step: 1 / 60,
        accel: 196,
        retro: 0.5,
        damping: 0.35,
        braking: 0,
        maxSpeed: 132,
        turn: 8,
        turnDamping: 6.2,
        bulletSpeed: 600,
        noseAim: true,
        agility: 1,
        baseDamping: 3.1,
      },
      ...ship,
    },
  };
}

const foe = (x, y) => ({
  x,
  y,
  vx: 0,
  vy: 0,
  radius: 20,
  kind: 'enemy',
  ref: {},
});

describe('glideKeys', () => {
  it('holds the keys of a combination and none for no plan', () => {
    expect(glideKeys(combo(-1, 1))).toEqual({
      up: true,
      down: false,
      left: true,
      right: false,
    });
    expect(glideKeys(combo(1, -1))).toMatchObject({ down: true, right: true });
    expect(glideKeys(null)).toEqual({
      up: false,
      down: false,
      left: false,
      right: false,
    });
  });
});

describe('glideRollout', () => {
  it('pushes along the nose and turns it, and coasts on without a key', () => {
    const world = makeWorld({ angle: Math.PI / 2 });
    const idle = KEY_COMBOS[COAST];
    const [push] = [KEY_COMBOS[combo(0, 1)]];
    const pushed = glideRollout(world, push, push, KNOBS, false, idle).at(-1);
    expect(pushed.vy).toBeGreaterThan(50);
    expect(Math.abs(pushed.vx)).toBeLessThan(1);
    const turn = KEY_COMBOS[combo(1, 0)];
    const turned = glideRollout(world, turn, turn, KNOBS, false, idle).at(-1);
    expect(turned.angle).toBeGreaterThan(Math.PI / 2);
    const drifting = makeWorld({ vx: 100 });
    const coast = glideRollout(drifting, idle, idle, KNOBS, false, idle).at(-1);
    expect(coast.vx).toBeGreaterThan(70);
  });

  it('with the Braking System brakes only once every key is let go, a beat later, as the game does', () => {
    const world = makeWorld({ vx: 100 });
    world.ship.glide = {
      ...world.ship.glide,
      autoBrake: true,
      retro: 196,
      idle: 0,
    };
    const idle = KEY_COMBOS[COAST];
    const turn = KEY_COMBOS[combo(1, 0)];
    const turning = glideRollout(world, turn, turn, KNOBS, false, idle).at(-1);
    expect(Math.hypot(turning.vx, turning.vy)).toBeCloseTo(100, 6);
    const path = glideRollout(world, idle, idle, KNOBS, false, idle);
    const early = path.filter((p) => p.t < 0.25);
    expect(early.every((p) => Math.hypot(p.vx, p.vy) === 100)).toBe(true);
    expect(Math.hypot(path.at(-1).vx, path.at(-1).vy)).toBeLessThan(90);
  });
});

describe('decideGlide', () => {
  it('turns the nose toward a foe off to one side', () => {
    const right = makeWorld({}, { movers: [foe(960, 800)] });
    expect(KEY_COMBOS[decideGlide(right, KNOBS).dir].turn).toBe(1);
    const left = makeWorld({}, { movers: [foe(960, 280)] });
    expect(KEY_COMBOS[decideGlide(left, KNOBS).dir].turn).toBe(-1);
  });

  it('does not push into a rock lying across the nose', () => {
    const world = makeWorld({ vx: 90 }, { movers: [foe(1060, 540)] });
    const plan = decideGlide(world, KNOBS);
    expect(KEY_COMBOS[plan.dir].push).not.toBe(1);
  });
});

describe('createBotPilot on the glide', () => {
  it('flies with turn and push keys, nothing held before its first plan', () => {
    const pilot = createBotPilot({ preset: 'good', seed: 1 });
    const world = makeWorld({}, { movers: [foe(960, 800)] });
    const first = pilot.step(world);
    expect(first.left || first.right || first.up || first.down).toBe(false);
    let keys = first;
    for (let t = 1; t <= 30; t += 1) {
      keys = pilot.step({ ...world, time: t / 60 });
    }
    expect(keys.right).toBe(true);
  });
});
