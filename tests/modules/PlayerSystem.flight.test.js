import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

// The flight (flight.js): the jets alone move and turn the ship; the start is
// a simulation with no drag, the cards the computer lighting jets, the Flight
// Computer modern flight with the turbo.
const DT = 1 / 60;
const IDLE = { up: false, down: false, left: false, right: false };
// The start's top speed with no cards: 220 × 0.6.
const START_TOP = 132;

function makePlayer(scheme = 'classic') {
  const eventBus = createEventBusMock();
  const player = new PlayerSystem({
    eventBus,
    input: { getMovementInput: () => ({}) },
    'command-queue': null,
  });
  player.setFlightScheme(scheme, scheme === 'classic');
  player.position = { x: 400, y: 300 };
  player.velocity = { vx: 0, vy: 0 };
  player.angle = 0;
  player.angularVelocity = 0;
  const events = [];
  eventBus.on('thruster-effect', (payload) => events.push(payload));
  const fly = (input, steps) => {
    events.length = 0;
    for (let i = 0; i < steps; i += 1) {
      player.updateMovement(DT, { ...IDLE, ...input });
      player.updatePosition(DT);
    }
    return [...events];
  };
  return { player, fly };
}

const lit = (events, type) =>
  events.filter((e) => e.type === type && e.intensity > 0);
const speedOf = (player) => Math.hypot(player.velocity.vx, player.velocity.vy);
// What the Flight Computer always comes with: Braking System 3, RCS System 3.
const flightComputerCards = (flight) => {
  flight.brakingDamping = flight.baseLinearDamping;
  flight.agility = 1.9;
};

describe('PlayerSystem flight by the jets', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('the start: no drag, a burst then a steady flame while W holds, the trail cards still fed', () => {
    const { player, fly } = makePlayer();
    const burst = fly({ up: true }, 20).filter((e) => e.type === 'main');
    expect(Math.max(...burst.map((e) => e.intensity))).toBe(1);
    fly({ up: true }, 60); // at the top speed
    expect(speedOf(player)).toBeCloseTo(START_TOP, 6);
    const held = fly({ up: true }, 10).filter((e) => e.type === 'main');
    expect(held.every((e) => e.intensity > 0.3 && e.intensity < 0.4)).toBe(
      true
    );
    expect(held.every((e) => e.pilot)).toBe(true);
    fly({}, 120);
    expect(speedOf(player)).toBeCloseTo(START_TOP, 6);
  });

  it('the Braking System stops the travel on the jets against the motion', () => {
    const { player, fly } = makePlayer();
    player.flight.brakingDamping = player.flight.baseLinearDamping;
    fly({ up: true }, 90);
    const coast = fly({}, 90);
    expect(speedOf(player)).toBe(0);
    const retro = lit(coast, 'aux');
    expect(retro.length).toBeGreaterThan(20);
    expect(retro.every((e) => e.isAutomatic && !e.pilot)).toBe(true);
  });

  it('a released turn keeps its momentum, worked off slowly; the RCS System stops it firmer, the Braking System not at all', () => {
    const turnThenLetGo = (setup) => {
      const { player, fly } = makePlayer();
      setup(player.flight);
      fly({ right: true }, 60);
      const spin = player.angularVelocity;
      const steps = [];
      for (let i = 0; i < 150 && player.angularVelocity > 0; i += 1) {
        steps.push(fly({}, 1));
      }
      return { spin, stopSteps: steps.length, lit: steps.flat() };
    };
    const bare = turnThenLetGo(() => {});
    expect(bare.stopSteps).toBeGreaterThan(90); // more than a second and a half
    const pair = bare.lit.filter((e) => e.type === 'side' && e.intensity > 0);
    expect(pair.length).toBeGreaterThan(0);
    expect(pair.every((e) => e.isAutomatic)).toBe(true);
    const braked = turnThenLetGo((f) => {
      f.brakingDamping = f.baseLinearDamping;
    });
    expect(braked.stopSteps).toBe(bare.stopSteps);
    const rcs = turnThenLetGo((f) => {
      f.agility = 1.3; // RCS System 1
    });
    expect(rcs.spin).toBeGreaterThan(bare.spin);
    expect(rcs.stopSteps).toBeLessThan(35);
  });

  it('the Flight Computer: the turbo builds on a straight run and drops on a turn; letting go stops the ship firmly', () => {
    const { player, fly } = makePlayer('modern');
    flightComputerCards(player.flight);
    fly({ right: true }, 150);
    expect(speedOf(player)).toBeGreaterThan(START_TOP * 1.2 * 1.35);
    fly({ up: true }, 24); // the turbo fades over 0.4 s
    expect(speedOf(player)).toBeLessThan(START_TOP * 1.2 * 1.05);
    fly({ right: true }, 150);
    fly({}, 45);
    expect(speedOf(player)).toBeLessThan(2);
  });

  it('the modern nose swings onto the keys with weight, a touch past and back', () => {
    const { player, fly } = makePlayer('modern');
    flightComputerCards(player.flight);
    const angles = [];
    for (let i = 0; i < 60; i += 1) {
      fly({ up: true }, 1);
      angles.push(player.angle);
    }
    const goal = -Math.PI / 2;
    const past = Math.min(...angles) - goal;
    expect(past).toBeLessThan(0); // swung past the heading
    expect(past).toBeGreaterThan(-0.2);
    expect(angles.findIndex((a) => a <= goal + 0.05)).toBeLessThan(24);
    expect(Math.abs(angles[angles.length - 1] - goal)).toBeLessThan(0.02);
  });

  it('at the top speed, W with a turn lights no jet against the motion (the cap trims a hair, silently)', () => {
    const { fly } = makePlayer();
    fly({ up: true }, 90);
    const turning = fly({ up: true, right: true }, 60);
    expect(lit(turning, 'aux')).toEqual([]);
  });

  it('the turbo holds when a second key makes the run diagonal (45°)', () => {
    const { player, fly } = makePlayer('modern');
    flightComputerCards(player.flight);
    fly({ up: true }, 45); // part charged (full at 1.2 s)
    const charge = player.flight.turbo;
    expect(charge).toBeGreaterThan(0.5);
    fly({ up: true, right: true }, 12);
    expect(player.flight.turbo).toBeGreaterThan(charge);
  });
});
