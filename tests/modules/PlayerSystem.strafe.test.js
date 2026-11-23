import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import {
  TURRET_BARREL_LENGTH,
  TURRET_PIVOT_X,
} from '../../src/data/constants/physics.js';
import shipModels from '../../src/data/shipModels.js';
import { padForce } from '../../src/modules/player/movementInput.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

const DELTA_TIME = 1 / 60;

describe('PlayerSystem control schemes', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
    vi.unstubAllGlobals();
  });

  function makePlayer(held = {}, controlScheme = 'modern') {
    const eventBus = createEventBusMock();
    const movement = { up: false, down: false, left: false, right: false };
    Object.assign(movement, held);
    const input = { getMovementInput: vi.fn(() => ({ ...movement })) };
    const player = new PlayerSystem({
      eventBus,
      input,
      'command-queue': null,
    });
    // The Auto Turret taken; modern is the Flight Computer's flight.
    player.setFlightScheme(controlScheme, controlScheme === 'classic');
    player.noseAim = false;
    player.position = { x: 400, y: 300 };
    player.velocity = { vx: 0, vy: 0 };
    return player;
  }

  const steps = (player, count) => {
    for (let i = 0; i < count; i += 1) player.update(DELTA_TIME);
  };

  it('WASD moves on the screen axes and the hull turns onto the motion, not the aim', () => {
    const player = makePlayer({ right: true });
    player.angle = -Math.PI / 2; // nose up the screen
    player.setAimPoint({ x: 400, y: -1e6 }); // target straight up
    steps(player, 60);

    expect(player.velocity.vx).toBeGreaterThan(50);
    expect(Math.abs(player.velocity.vy)).toBeLessThan(5);
    expect(player.angle).toBeCloseTo(0, 2);
  });

  it('W moves up the screen whatever the hull heading', () => {
    const player = makePlayer({ up: true });
    player.angle = 0;
    steps(player, 60); // the nose swings past and settles (flight.test.js)

    expect(player.velocity.vy).toBeLessThan(-50);
    expect(Math.abs(player.velocity.vx)).toBeLessThan(20);
    expect(player.angle).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('on a pad, the d-pad moves at full push while the right stick aims; the left stick pushes as far as it leans', () => {
    const fly = (input) => {
      const player = makePlayer();
      player.angle = -Math.PI / 2;
      for (let i = 0; i < 30; i += 1) {
        player.updateMovement(DELTA_TIME, {
          up: false,
          down: false,
          left: false,
          right: false,
          ...input,
        });
        player.updatePosition(DELTA_TIME);
      }
      return Math.hypot(player.velocity.vx, player.velocity.vy);
    };
    const dpad = fly({ up: true });
    expect(dpad).toBeGreaterThan(50);
    const sticks = { pad: true, moveX: 0, moveY: 0, aimX: 0.8, aimY: 0 };
    expect(fly({ ...sticks, up: true })).toBeCloseTo(dpad, 5);
    const halfLean = fly({ ...sticks, moveY: -0.5 });
    expect(halfLean).toBeGreaterThan(5);
    expect(halfLean).toBeLessThan(dpad * 0.6);
  });

  it('Modern on a pad: the flame (and its sound) burns as hard as the stick pushes; keys and the d-pad stay full', () => {
    // The main flame shown after 20 steps, and whether its last event is
    // the pilot's own burn (the one the trail cards drop on).
    const shownMain = (input) => {
      const player = makePlayer();
      let pilot = false;
      player.eventBus.on('thruster-effect', (event) => {
        if (event.type === 'main') pilot = event.pilot;
      });
      player.angle = -Math.PI / 2; // nose up the screen, along the move
      for (let i = 0; i < 20; i += 1) {
        player.updateMovement(DELTA_TIME, {
          up: false,
          down: false,
          left: false,
          right: false,
          ...input,
        });
        player.updatePosition(DELTA_TIME);
      }
      return { main: player.lastThrusterState.main, pilot };
    };
    expect(shownMain({ up: true }).main).toBe(1);
    expect(shownMain({ pad: true, moveX: 0, moveY: 0, up: true }).main).toBe(1);
    // At its speed a half-leaned stick holds the steady flame (a third of
    // the burst, flight.js CRUISE_FLAME) × its push.
    expect(shownMain({ pad: true, moveX: 0, moveY: -0.5 }).main).toBeCloseTo(
      0.35 * 0.5 ** 1.5,
      2
    );
    // A barely leaning stick still burns for the trail cards, though its
    // flame is too faint to show.
    expect(shownMain({ pad: true, moveX: 0, moveY: -0.05 }).pilot).toBe(true);
  });

  it("a run's start holds the cannon on the nose, whatever the aim point", () => {
    const player = makePlayer({ left: true }, 'classic');
    player.noseAim = true;
    player.angle = 0;
    player.setAimPoint({ x: 400, y: -1e6 }); // target straight up
    steps(player, 20);

    expect(player.angle).toBeLessThan(-0.1);
    expect(player.getTurretAngle()).toBe(player.angle);
  });

  it("with the cannon on the nose shots leave the hull's nose muzzle; the Auto Turret card brings back the turret's", () => {
    const eventBus = createEventBusMock();
    const player = new PlayerSystem({
      eventBus,
      input: { getMovementInput: vi.fn(() => ({})) },
      'command-queue': null,
    });
    player.setHull(shipModels.bastion);
    player.position = { x: 400, y: 300 };
    player.angle = Math.PI / 2; // nose down the screen
    player.turretAngle = Math.PI / 2;
    const muzzle = () => {
      const { x, y } = player.getMuzzlePoint();
      return [x, y].map((v) => Math.round(v * 100) / 100);
    };

    expect(muzzle()).toEqual([400, 300 + shipModels.bastion.noseMuzzle]);

    eventBus.emit('upgrade-auto-aim', {});
    expect(muzzle()).toEqual([
      400,
      300 + TURRET_PIVOT_X + TURRET_BARREL_LENGTH,
    ]);
  });

  it('every run starts classic, gliding and aimed by the nose; its cards lift each', () => {
    const eventBus = createEventBusMock();
    const player = new PlayerSystem({
      eventBus,
      input: { getMovementInput: vi.fn(() => ({})) },
      'command-queue': null,
    });
    const flying = () => [
      player.controlScheme,
      player.flight.glide,
      player.noseAim,
    ];
    expect(flying()).toEqual(['classic', true, true]);

    eventBus.emit('upgrade-auto-aim', {});
    eventBus.emit('modern-flight-engaged');
    expect(flying()).toEqual(['modern', false, false]);

    player.reset();
    expect(flying()).toEqual(['classic', true, true]);
  });

  it('in glide the RCS System turns the hull quicker too', () => {
    const turnAfterHalfSecond = (agility) => {
      const player = makePlayer({ left: true }, 'classic');
      player.flight.glide = true;
      player.flight.agility = agility;
      player.angle = 0;
      steps(player, 30);
      return -player.angle;
    };

    expect(turnAfterHalfSecond(1.9)).toBeGreaterThan(
      turnAfterHalfSecond(1) * 1.8
    );
  });

  it('the turret turns onto the aim point on its own, and the muzzle follows it', () => {
    const player = makePlayer({ right: true });
    player.angle = 0;
    player.setAimPoint({ x: 400, y: -1e6 }); // straight up: -PI/2
    player.update(DELTA_TIME);
    expect(player.getTurretAngle()).toBeGreaterThan(-Math.PI / 2 + 0.1);
    steps(player, 20);

    expect(player.getTurretAngle()).toBeCloseTo(-Math.PI / 2, 2);
    expect(player.angle).toBeCloseTo(0, 2);
    const pivot = player.getTurretPivot();
    const muzzle = player.getMuzzlePoint();
    expect(muzzle.x).toBeCloseTo(pivot.x, 1);
    expect(muzzle.y).toBeLessThan(pivot.y);
  });

  it('without a lock the turret settles back onto the nose', () => {
    const player = makePlayer();
    player.angle = 0.5;
    player.turretAngle = -1.5;
    steps(player, 30);

    expect(player.getTurretAngle()).toBeCloseTo(0.5, 2);
  });

  it('classic still rotates on A/D instead of strafing', () => {
    const player = makePlayer({ right: true }, 'classic');
    player.angle = 0;
    steps(player, 30);

    expect(player.angle).toBeGreaterThan(0.3);
    expect(Math.hypot(player.velocity.vx, player.velocity.vy)).toBeLessThan(1);
  });

  it('classic turns the turret onto the aim point, not the nose', () => {
    const player = makePlayer({ right: true }, 'classic');
    player.angle = 0;
    player.setAimPoint({ x: 400, y: -1e6 }); // straight up: -PI/2
    steps(player, 30);

    expect(player.angle).toBeGreaterThan(0.3); // the hull turned clockwise
    expect(player.getTurretAngle()).toBeCloseTo(-Math.PI / 2, 2);
  });

  it('the Stick Sensitivity setting sets how far a part-tilted stick pushes, mid-run too; full tilt is full push', () => {
    const eventBus = createEventBusMock();
    const player = new PlayerSystem({
      eventBus,
      input: { getMovementInput: vi.fn(() => ({})) },
      'command-queue': null,
      settings: {
        getCategoryValues: (id) =>
          id === 'controls' ? { stickSensitivity: 'high' } : null,
      },
    });
    expect(player.stickSensitivity).toBe('high');
    // From the pause menu too.
    eventBus.emit('settings-controls-changed', {
      values: { stickSensitivity: 'low' },
    });
    expect(player.stickSensitivity).toBe('low');

    const push = (sensitivity, tilt) =>
      padForce({ pad: true, sensitivity }, tilt);
    expect(push('medium', 0.5)).toBeCloseTo(0.5 ** 1.5, 9);
    expect(push('low', 0.5)).toBeLessThan(push('medium', 0.5));
    expect(push('high', 0.5)).toBeCloseTo(0.5, 9);
    for (const step of ['low', 'medium', 'high']) {
      expect(push(step, 1)).toBe(1);
    }
    // A frame without the setting (no player stamped it) flies Medium.
    expect(padForce({ pad: true }, 0.5)).toBeCloseTo(0.5 ** 1.5, 9);
  });
});
