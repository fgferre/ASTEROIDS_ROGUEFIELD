import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import PhysicsSystem from '../../src/modules/PhysicsSystem.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import { UPGRADE_FAMILIES } from '../../src/data/upgrades/families.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';
import {
  DASH_COOLDOWN,
  DASH_DECAY_SECONDS,
  DASH_DURATION,
  DASH_GHOST_COUNT,
  DASH_GHOST_LIFE,
  DASH_IMPULSE,
  DASH_INVULNERABILITY,
} from '../../src/data/constants/gameplay.js';
import {
  SHIP_MAX_SPEED,
  TURRET_TURN_RATE,
} from '../../src/data/constants/physics.js';

const DELTA_TIME = 1 / 60;

describe('PlayerSystem dash', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  function makePlayer(held = {}) {
    const eventBus = createEventBusMock();
    const movement = { up: false, down: false, left: false, right: false };
    Object.assign(movement, held);
    const input = { getMovementInput: vi.fn(() => ({ ...movement })) };
    const player = new PlayerSystem({ eventBus, input, 'command-queue': null });
    player.position = { x: 400, y: 300 };
    player.velocity = { vx: 0, vy: 0 };
    player.angle = 0;
    return { player, eventBus };
  }

  const steps = (player, count) => {
    for (let i = 0; i < count; i += 1) player.update(DELTA_TIME);
  };

  it('bursts along the nose with brief invulnerability, then settles under max speed', () => {
    const { player, eventBus } = makePlayer();
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);

    expect(player.velocity.vx).toBeGreaterThan(SHIP_MAX_SPEED);
    expect(player.velocity.vx).toBeLessThanOrEqual(DASH_IMPULSE);
    expect(Math.abs(player.velocity.vy)).toBeLessThan(1e-6);
    expect(player.invulnerableTimer).toBeGreaterThan(
      DASH_INVULNERABILITY - 2 * DELTA_TIME
    );
    expect(eventBus.emit).toHaveBeenCalledWith(
      'player-dashed',
      expect.objectContaining({ direction: { x: 1, y: 0 } })
    );

    steps(player, 15);
    expect(player.dashGhosts.length).toBeGreaterThan(0);
    steps(player, 10); // past the dash and its decay
    expect(player.dashGhostsDropped).toBe(DASH_GHOST_COUNT);
    expect(
      Math.hypot(player.velocity.vx, player.velocity.vy)
    ).toBeLessThanOrEqual(SHIP_MAX_SPEED);
    expect(player.invulnerableTimer).toBe(0);
  });

  it('eases from dash speed back to max speed over the decay, not in one frame', () => {
    const { player, eventBus } = makePlayer();
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    while (player.dashTimer > 0) player.update(DELTA_TIME);
    const speed = () => Math.hypot(player.velocity.vx, player.velocity.vy);
    let previous = speed();
    expect(previous).toBeGreaterThan(1.5 * SHIP_MAX_SPEED);
    const decaySteps = Math.round(DASH_DECAY_SECONDS / DELTA_TIME);
    const drops = [];
    for (let i = 0; i < decaySteps; i += 1) {
      player.update(DELTA_TIME);
      const now = speed();
      expect(now).toBeLessThan(previous);
      drops.push(previous - now);
      previous = now;
    }
    // No frame takes a cliff: each loses well under the old 418 → 220 drop.
    expect(Math.max(...drops)).toBeLessThan(0.25 * SHIP_MAX_SPEED);
    expect(previous).toBeLessThanOrEqual(SHIP_MAX_SPEED);
  });

  it('dashes down the screen while only S is held, whatever the heading', () => {
    const { player, eventBus } = makePlayer({ down: true });
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.velocity.vy).toBeGreaterThan(SHIP_MAX_SPEED);
    expect(Math.abs(player.velocity.vx)).toBeLessThan(1e-6);
  });

  it('dashes left on the screen while only A is held', () => {
    const { player, eventBus } = makePlayer({ left: true });
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.velocity.vx).toBeLessThan(-SHIP_MAX_SPEED);
    expect(Math.abs(player.velocity.vy)).toBeLessThan(1e-6);
  });

  it('ignores presses during the cooldown and while dead', () => {
    const { player, eventBus } = makePlayer();
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.getDashCooldownFraction()).toBeGreaterThan(0.95);

    steps(player, 30);
    player.velocity = { vx: 0, vy: 0 };
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.velocity.vx).toBe(0);

    steps(player, Math.ceil(DASH_COOLDOWN / DELTA_TIME));
    expect(player.getDashCooldownFraction()).toBe(0);
    player.markDead();
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
    expect(player.getDashCooldownFraction()).toBe(0);
  });
});

describe('Maneuver cards on the dash', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  function makePlayer() {
    const eventBus = createEventBusMock();
    const movement = { up: false, down: false, left: false, right: false };
    const input = { getMovementInput: vi.fn(() => ({ ...movement })) };
    const player = new PlayerSystem({ eventBus, input, 'command-queue': null });
    player.position = { x: 400, y: 300 };
    player.velocity = { vx: 0, vy: 0 };
    player.angle = 0;
    return { player, eventBus };
  }

  // Emits a card's event effects rank by rank, the way UpgradeSystem does.
  function takeCard(eventBus, id) {
    UPGRADE_LIBRARY.find((card) => card.id === id).levels.forEach((level) =>
      level.effects.forEach((effect) =>
        eventBus.emit(effect.event, { ...effect.payload })
      )
    );
  }

  const steps = (player, count) => {
    for (let i = 0; i < count; i += 1) player.update(DELTA_TIME);
  };

  function dash(player, eventBus) {
    player.dashCooldownTimer = 0;
    eventBus.emit('dash-pressed');
    player.update(DELTA_TIME);
  }

  it('Afterburner: dash cooldown -30% on top of the hull and Hangar', () => {
    const { player, eventBus } = makePlayer();
    const base = player.dashCooldown;
    takeCard(eventBus, 'afterburner');
    expect(player.dashCooldown).toBeCloseTo(base * 0.7, 2);
  });

  it('Inertial Dampers: the dash covers 15% more ground', () => {
    const dashDistance = (card) => {
      const { player, eventBus } = makePlayer();
      if (card) takeCard(eventBus, card);
      dash(player, eventBus);
      while (player.dashTimer > 0) player.update(DELTA_TIME);
      return player.position.x - 400;
    };
    // A shade over 15%: the auto-brake takes the same off both.
    const ratio = dashDistance('inertial_dampers') / dashDistance();
    expect(ratio).toBeGreaterThan(1.14);
    expect(ratio).toBeLessThan(1.17);
  });

  it('Ghost Drive: 0.15 s more invulnerability and afterimages that last twice as long', () => {
    // Past the last afterimage's plain life, inside twice that.
    const ghostsLeft = (card) => {
      const { player, eventBus } = makePlayer();
      if (card) takeCard(eventBus, card);
      dash(player, eventBus);
      const invulnerable = player.invulnerableTimer;
      steps(
        player,
        Math.round((DASH_DURATION + DASH_GHOST_LIFE * 1.2) / DELTA_TIME)
      );
      return { invulnerable, ghosts: player.dashGhosts.length };
    };
    expect(ghostsLeft()).toEqual({
      invulnerable: DASH_INVULNERABILITY - DELTA_TIME,
      ghosts: 0,
    });
    const ghostDrive = ghostsLeft('phase_dash');
    expect(ghostDrive.invulnerable).toBeCloseTo(
      DASH_INVULNERABILITY + 0.15 - DELTA_TIME,
      6
    );
    expect(ghostDrive.ghosts).toBeGreaterThan(0);
  });

  it('Gyro Servos: the turret swings 50% faster onto a target behind', () => {
    const swing = (card) => {
      const { player, eventBus } = makePlayer();
      if (card) takeCard(eventBus, card);
      player.setAimPoint({ x: 300, y: 300 });
      player.updateTurret(DELTA_TIME);
      return Math.abs(player.turretAngle);
    };
    expect(swing()).toBeCloseTo(TURRET_TURN_RATE * DELTA_TIME, 6);
    expect(swing('gyro_servos')).toBeCloseTo(
      TURRET_TURN_RATE * 1.5 * DELTA_TIME,
      6
    );
  });

  it('Ram Plating: a dash hits each enemy it touches once, and only with the card', () => {
    const { player, eventBus } = makePlayer();
    const physics = new PhysicsSystem({ eventBus: createEventBusMock() });
    const enemies = { applyDamage: vi.fn(() => ({ killed: false })) };
    const drone = { id: 'd', x: 405, y: 300, vx: 0, vy: 0, radius: 10 };
    const touch = () => {
      drone.x = player.position.x + 5;
      drone.y = player.position.y;
      physics.handlePlayerAsteroidCollision(player, drone, enemies);
    };

    dash(player, eventBus);
    touch();
    expect(enemies.applyDamage).not.toHaveBeenCalled();

    takeCard(eventBus, 'ram_plating');
    dash(player, eventBus);
    touch();
    touch();
    expect(enemies.applyDamage).toHaveBeenCalledTimes(1);
    expect(enemies.applyDamage).toHaveBeenCalledWith(drone, 50, {
      source: { hitPosition: expect.any(Object) },
    });

    dash(player, eventBus);
    touch();
    expect(enemies.applyDamage).toHaveBeenCalledTimes(2);
  });

  it('Blink (Maneuver Apex): the ship is gone for 0.12 s, then lands with a shockwave', () => {
    const { player, eventBus } = makePlayer();
    const { apex } = UPGRADE_FAMILIES.maneuver;
    const landed = () =>
      eventBus.emit.mock.calls.filter(([name]) => name === 'player-braked');
    eventBus.emit('apex-unlocked', { family: 'thermal' });
    dash(player, eventBus);
    expect(player._quitExplosionHidden).toBeFalsy();

    eventBus.emit('apex-unlocked', { family: 'maneuver' });
    dash(player, eventBus);
    expect(player._quitExplosionHidden).toBe(true);
    steps(player, Math.floor(apex.hide / DELTA_TIME) - 1);
    expect(player._quitExplosionHidden).toBe(true);
    expect(landed()).toHaveLength(0);
    player.update(DELTA_TIME);
    expect(player._quitExplosionHidden).toBe(false);
    expect(landed()).toEqual([
      [
        'player-braked',
        {
          position: { ...player.position },
          radius: apex.radius,
          knockback: apex.knockback,
        },
      ],
    ]);
  });
});
