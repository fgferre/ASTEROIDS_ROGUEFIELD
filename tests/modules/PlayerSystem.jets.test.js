import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

// Felipe's one flight algorithm (`?voo=`, jetFlight.js): A keeps today's
// motion and lights the jets that make it; B moves the ship by the jets alone.
const DT = 1 / 60;
const IDLE = { up: false, down: false, left: false, right: false };

function makePlayer(jets, scheme = 'classic', glide = true) {
  const eventBus = createEventBusMock();
  const player = new PlayerSystem({
    eventBus,
    input: { getMovementInput: () => ({}) },
    'command-queue': null,
    newFlight: false,
  });
  player.setFlightScheme(scheme, glide);
  player.flight.jets = jets;
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

describe('PlayerSystem one flight algorithm (?voo=)', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it("A flies today's motion step for step, and the glide's slowing lights the retro that today shows nothing", () => {
    const today = makePlayer(null);
    const a = makePlayer('a');
    const route = [
      [{ up: true }, 70],
      [{ right: true }, 30],
      [{}, 90],
    ];
    route.forEach(([input, steps]) => {
      for (let i = 0; i < steps; i += 1) {
        today.fly(input, 1);
        a.fly(input, 1);
        expect(a.player.velocity).toEqual(today.player.velocity);
        expect(a.player.angle).toBe(today.player.angle);
      }
    });
    a.fly({ up: true }, 70);
    const coast = a.fly({}, 30);
    expect(lit(coast, 'aux').length).toBeGreaterThan(0);
    expect(lit(today.fly({}, 30), 'aux')).toEqual([]);
  });

  it('A: at the top speed the flame is out, but the trail cards still get the pilot burn', () => {
    const { fly } = makePlayer('a');
    fly({ up: true }, 90); // the glide's top speed after ~1 s
    const atTop = fly({ up: true }, 10).filter((e) => e.type === 'main');
    expect(atTop.length).toBe(10);
    expect(atTop.every((e) => e.intensity === 0 && e.pilot)).toBe(true);
  });

  it('B: coasting in the glide keeps its speed, and a released turn is stopped by the other pair', () => {
    const { player, fly } = makePlayer('b');
    fly({ up: true }, 60);
    const speed = Math.hypot(player.velocity.vx, player.velocity.vy);
    fly({}, 120);
    expect(Math.hypot(player.velocity.vx, player.velocity.vy)).toBeCloseTo(
      speed,
      6
    );
    fly({ right: true }, 60);
    expect(player.angularVelocity).toBeGreaterThan(1);
    const release = fly({}, 30);
    expect(player.angularVelocity).toBe(0);
    // the turn to port's pair: the port wingtip and the starboard nose jet
    const stopping = release.filter((e) => e.type === 'side' && e.intensity);
    expect(stopping.length).toBeGreaterThan(0);
    expect(stopping.every((e) => e.isAutomatic)).toBe(true);
  });

  it('B modern: letting go brakes on the jets against the motion until the ship stops', () => {
    const { player, fly } = makePlayer('b', 'modern', false);
    fly({ right: true }, 60);
    expect(player.velocity.vx).toBeCloseTo(88, 0);
    const brake = fly({}, 90);
    expect(Math.hypot(player.velocity.vx, player.velocity.vy)).toBe(0);
    const retro = lit(brake, 'aux');
    expect(retro.length).toBeGreaterThan(20);
    expect(retro.every((e) => e.isAutomatic)).toBe(true);
    expect(lit(brake, 'main')).toEqual([]);
  });
});
