import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PlayerSystem from '../../src/modules/PlayerSystem.js';
import {
  bastion,
  defaultHull,
  solarSlicer,
} from '../../src/data/shipModels.js';
import { DASH_COOLDOWN } from '../../src/data/constants/gameplay.js';
import {
  SHIP_ACCELERATION,
  SHIP_MAX_SPEED,
} from '../../src/data/constants/physics.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { cleanupGlobalState, setupGlobalMocks } from '../__helpers__/setup.js';

const makePlayer = (dependencies = {}) =>
  new PlayerSystem({
    eventBus: createEventBusMock(),
    input: { getMovementInput: vi.fn(() => ({})) },
    'command-queue': null,
    ...dependencies,
  });

describe('PlayerSystem hull stats', () => {
  beforeEach(() => setupGlobalMocks());
  afterEach(() => cleanupGlobalState());

  it('flies the Interceptor on the base stats', () => {
    const player = makePlayer();
    player.setHull(defaultHull);
    player.resetStats();
    expect(player.acceleration).toBe(SHIP_ACCELERATION);
    expect(player.maxSpeed).toBe(SHIP_MAX_SPEED);
    expect(player.maxHealth).toBe(100);
    expect(player.dashCooldown).toBe(DASH_COOLDOWN);
  });

  it('makes the Solar Slicer lighter as soon as it is chosen', () => {
    const player = makePlayer();
    player.setHull(solarSlicer);
    expect(player.acceleration).toBeCloseTo(SHIP_ACCELERATION * 1.15, 6);
    expect(player.maxSpeed).toBeCloseTo(SHIP_MAX_SPEED * 1.15, 6);
    expect(player.maxHealth).toBe(80);
    expect(player.health).toBe(80);
    expect(player.dashCooldown).toBeCloseTo(DASH_COOLDOWN * 0.85, 6);

    player.setHull(defaultHull);
    expect(player.maxSpeed).toBe(SHIP_MAX_SPEED);
    expect(player.maxHealth).toBe(100);
  });

  it('makes the Bastion heavier: slower, tougher', () => {
    const player = makePlayer();
    player.setHull(bastion);
    expect(player.acceleration).toBeCloseTo(SHIP_ACCELERATION * 0.85, 6);
    expect(player.maxSpeed).toBeCloseTo(SHIP_MAX_SPEED * 0.9, 6);
    expect(player.maxHealth).toBe(135);
    expect(player.dashCooldown).toBeCloseTo(DASH_COOLDOWN * 1.2, 6);
  });

  it('applies the Hangar modifiers on top of the hull stats', () => {
    const hangar = {
      getModifiers: () => ({
        hullMultiplier: 1.05,
        extraRerolls: 0,
        extraBanishes: 0,
        dashCooldownMultiplier: 0.9,
        pickupRadiusMultiplier: 1,
      }),
    };
    const player = makePlayer({ hangar });
    player.setHull(solarSlicer);
    player.resetStats();
    expect(player.maxHealth).toBe(84);
    expect(player.dashCooldown).toBeCloseTo(DASH_COOLDOWN * 0.85 * 0.9, 6);
  });

  it('draws both hull chips, the Slicer with wide twin thrusters and blades', () => {
    const player = makePlayer();
    const levels = { thruster: 0, rcs: 0, braking: 0 };
    const interceptor = player.getHullGeometry(defaultHull, levels);
    const slicer = player.getHullGeometry(solarSlicer, levels);
    const spread = (geometry) =>
      Math.max(...geometry.nozzles.map((nozzle) => Math.abs(nozzle.y)));
    expect(slicer.nozzles).toHaveLength(2);
    expect(spread(slicer)).toBeGreaterThan(spread(interceptor) * 2);
    expect(slicer.blades).toBe(true);
    expect(interceptor.blades).toBe(false);
    expect(slicer.maxX - slicer.minX).toBeGreaterThan(
      interceptor.maxX - interceptor.minX
    );

    const ctx = new Proxy(
      { canvas: { width: 48, height: 48, clientWidth: 0 } },
      { get: (target, key) => (key in target ? target[key] : () => {}) }
    );
    expect(player.renderHullPreview(ctx, defaultHull, { padding: 4 })).toBe(
      true
    );
    expect(player.renderHullPreview(ctx, solarSlicer, { padding: 4 })).toBe(
      true
    );
  });

  it('draws the Bastion wider, with armoured shoulders on darker steel', () => {
    const player = makePlayer();
    const levels = { thruster: 0, rcs: 0, braking: 0 };
    const interceptor = player.getHullGeometry(defaultHull, levels);
    const geometry = player.getHullGeometry(bastion, levels);
    expect(geometry.maxY).toBeGreaterThan(interceptor.maxY * 1.3);
    expect(geometry.panels.filter((panel) => panel.armor)).toHaveLength(2);
    expect(geometry.albedo).toBeLessThan(interceptor.albedo);
    expect(geometry.nozzles).toHaveLength(2);

    const ctx = new Proxy(
      { canvas: { width: 48, height: 48, clientWidth: 0 } },
      { get: (target, key) => (key in target ? target[key] : () => {}) }
    );
    expect(player.renderHullPreview(ctx, bastion, { padding: 4 })).toBe(true);
  });
});
