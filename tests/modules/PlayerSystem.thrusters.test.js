import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

// What the thrusters show (thruster-effect events): the pilot's intent, not
// the flight solver's corrections.
const DT = 1 / 60;
const IDLE = { up: false, down: false, left: false, right: false };

function makePlayer(controlScheme = 'modern') {
  const eventBus = createEventBusMock();
  const player = new PlayerSystem({
    eventBus,
    input: { getMovementInput: () => ({}) },
    'command-queue': null,
    newFlight: false,
    controlScheme,
  });
  player.controlScheme = controlScheme;
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
    return events.filter((event) => event.intensity > 0);
  };
  return { player, eventBus, fly };
}

describe('PlayerSystem thrusters show the pilot, not the solver', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('A1: an idle ship kicked by its own shots shows no jet, while the auto-brake still slows it', () => {
    const { player, eventBus, fly } = makePlayer();
    const shot = { position: { x: 400, y: 300 }, target: { x: 700, y: 300 } };
    let lit = [];
    for (let i = 0; i < 20; i += 1) {
      eventBus.emit('weapon-fired', shot);
      lit = lit.concat(fly({}, 6));
    }
    expect(lit).toEqual([]);
    const kicked = Math.abs(player.velocity.vx);
    fly({}, 6);
    expect(Math.abs(player.velocity.vx)).toBeLessThan(kicked);
  });

  it("A2: after the pilot thrusts, the coast shows the auto-brake's own push on the jet along the nose until the ship stops, then disarms", () => {
    ['modern', 'classic'].forEach((scheme) => {
      const { player, fly } = makePlayer(scheme);
      fly(scheme === 'modern' ? { right: true } : { up: true }, 60);
      const coast = fly({}, 90);
      expect(coast.length, scheme).toBeGreaterThan(0);
      expect(new Set(coast.map((e) => e.type)), scheme).toEqual(
        new Set(['aux'])
      );
      expect(coast.every((e) => e.isAutomatic)).toBe(true);
      // the brake's push: it eases with the speed but stays lit (its least
      // push, eased by the drift) as long as it brakes
      const levels = coast.map((e) => e.intensity);
      expect(levels[levels.length - 1]).toBeLessThan(levels[0]);
      expect(Math.min(...levels.slice(0, -1)), scheme).toBeGreaterThan(0.2);
      fly({}, 120);
      expect(Math.hypot(player.velocity.vx, player.velocity.vy)).toBeLessThan(
        2
      );
      expect(fly({}, 30), scheme).toEqual([]);
    });
  });

  it('A2b: the auto-brake lights the jets that push against the motion, whatever way the hull points', () => {
    const brakeAt = (scheme, angle) => {
      const { player, fly } = makePlayer(scheme);
      player.angle = angle;
      player.velocity = { vx: 150, vy: 0 }; // moving to screen +x
      player.thrusters.coastArmed = true;
      fly({}, 1);
      const { main, aux, brakeStarboard, brakePort } = player.lastThrusterState;
      return { main, aux, brakeStarboard, brakePort };
    };
    ['modern', 'classic'].forEach((scheme) => {
      // Nose-first: the retro. Tail-first: the main engine.
      expect(brakeAt(scheme, 0).aux, scheme).toBeGreaterThan(0.3);
      expect(brakeAt(scheme, 0).main, scheme).toBe(0);
      expect(brakeAt(scheme, Math.PI).main, scheme).toBeGreaterThan(0.3);
      expect(brakeAt(scheme, Math.PI).aux, scheme).toBe(0);
    });
    // Modern brakes across the hull too: drifting to starboard (nose up the
    // screen), the starboard flank; on a diagonal, flank and retro both.
    const side = brakeAt('modern', -Math.PI / 2);
    expect(side.brakeStarboard).toBeGreaterThan(0.3);
    expect(side.brakePort).toBe(0);
    const diagonal = brakeAt('modern', -Math.PI / 4);
    expect(diagonal.brakeStarboard).toBeGreaterThan(0.3);
    expect(diagonal.aux).toBeGreaterThan(0.3);
    // Classic has no brake across the hull: no flank jet.
    expect(brakeAt('classic', -Math.PI / 2).brakeStarboard).toBe(0);
  });

  it('A3: a modern reversal shows the retro first and the flame once the nose arrives; a 45° change keeps the flame', () => {
    const { player, fly } = makePlayer();
    fly({ right: true }, 60);
    const first = fly({ left: true }, 1);
    expect(first.find((e) => e.type === 'aux')?.intensity).toBeCloseTo(0.7, 1);
    expect(first.some((e) => e.type === 'main')).toBe(false);
    fly({ left: true }, 40);
    expect(Math.cos(player.angle)).toBeCloseTo(-1, 3);
    expect(player.lastThrusterState).toMatchObject({ main: 1, aux: 0 });

    const diagonal = fly({ left: true, up: true }, 1);
    expect(diagonal.find((e) => e.type === 'main')?.intensity).toBe(1);
  });

  it('A4: a turn shows the couple that causes it, in both schemes, and nothing while coasting', () => {
    const modern = makePlayer();
    modern.fly({ right: true }, 60);
    // nose from +x to +y (screen down): toward the ship's starboard
    const turn = modern.fly({ down: true }, 6).filter((e) => e.type === 'side');
    expect(turn.length).toBeGreaterThan(0);
    expect(turn.every((e) => e.side === 'right')).toBe(true);
    const swinging = modern.fly({}, 30).filter((e) => e.type === 'side');
    expect(swinging).toEqual([]);

    const classic = makePlayer('classic');
    const left = classic
      .fly({ left: true }, 1)
      .filter((e) => e.type === 'side');
    expect(left.map((e) => e.side)).toEqual(['left', 'left']);
    // the aft port wingtip blows outboard to port, the nose jet to starboard
    const local = left.map((e) => ({
      x: e.position.x - classic.player.position.x,
      y: e.position.y - classic.player.position.y,
    }));
    const aft = local.find((p) => p.x < 0);
    const nose = local.find((p) => p.x > 0);
    expect(aft.y).toBeLessThan(0);
    expect(nose.y).toBeGreaterThan(0);
  });

  it('flying straight after a turn, the turn jets go out (the nose never quite reaches its heading)', () => {
    const { fly } = makePlayer();
    fly({ up: true }, 60);
    fly({ right: true }, 60);
    const straight = fly({ right: true }, 120);
    expect(straight.filter((e) => e.type === 'side')).toEqual([]);
    expect(straight.some((e) => e.type === 'main')).toBe(true);
  });
});
