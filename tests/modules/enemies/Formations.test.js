// Formations (src/modules/enemies/waves/formations.js): where each shape's
// units come in and how they fly, the stage line that asks for one, and the
// layer director that lights its marks and brings it in after them.
import { describe, expect, it, vi } from 'vitest';

import RandomService from '../../../src/core/RandomService.js';
import { getContent } from '../../../src/content/registry.js';
import {
  FORMATIONS,
  FORMATION_WARN,
  formation,
} from '../../../src/data/layerParts.js';
import {
  FORMATION_INSET,
  RING_MIN,
  formationPoints,
} from '../../../src/modules/enemies/waves/formations.js';
import { LayerEvents } from '../../../src/modules/enemies/waves/LayerEvents.js';
import { LayerSchedule } from '../../../src/modules/enemies/waves/LayerSchedule.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';

const W = 800;
const H = 600;
const place = (shape, count, ship, seed = 3) =>
  formationPoints(formation(shape, { role: 'swarmer', count, at: 10 }), count, {
    ship,
    width: W,
    height: H,
    random: new RandomService(seed),
  });
const inField = ({ x, y }) =>
  x >= FORMATION_INSET - 1e-6 &&
  x <= W - FORMATION_INSET + 1e-6 &&
  y >= FORMATION_INSET - 1e-6 &&
  y <= H - FORMATION_INSET + 1e-6;
const from = (ship, p) => Math.hypot(p.x - ship.x, p.y - ship.y);

describe('formation geometry', () => {
  it('rings the ship and closes in on it; against a wall the ring opens there instead', () => {
    const { radius, speed } = FORMATIONS.ring;
    for (const ship of [
      { x: 400, y: 300 },
      { x: 60, y: 300 },
      { x: 30, y: 570 },
    ]) {
      const { edge, points } = place('ring', 8, ship);
      expect(edge).toBeNull();
      expect(points).toHaveLength(8);
      for (const p of points) {
        expect(inField(p)).toBe(true);
        expect(from(ship, p)).toBeLessThanOrEqual(radius + 1e-6);
        expect(from(ship, p)).toBeGreaterThanOrEqual(radius * RING_MIN - 1e-6);
        // flying straight at the ship
        const toShip = (ship.x - p.x) * p.vx + (ship.y - p.y) * p.vy;
        expect(toShip / (from(ship, p) * speed)).toBeCloseTo(1, 6);
      }
    }
    // in open field it is a whole ring: every unit at its radius, evenly
    const ship = { x: 400, y: 300 };
    const angles = place('ring', 6, ship)
      .points.map((p) => Math.atan2(p.y - ship.y, p.x - ship.x))
      .sort((a, b) => a - b);
    for (const [i, a] of angles.entries()) {
      const next =
        angles[(i + 1) % angles.length] + (i === 5 ? Math.PI * 2 : 0);
      expect(next - a).toBeCloseTo(Math.PI / 3, 1);
    }
  });

  it('sweeps a line from the farthest edge across the ship’s lane and the whole field', () => {
    const { spacing, speed } = FORMATIONS.sweep;
    const ship = { x: 300, y: 520 }; // the top edge is farthest
    const { edge, points } = place('sweep', 5, ship);
    expect(edge).toBe('top');
    const xs = points.map((p) => p.x);
    for (const p of points) {
      expect(p.y).toBe(FORMATION_INSET);
      expect(p).toMatchObject({ vx: 0, vy: speed });
      expect(p.hold).toBeCloseTo((H - 2 * FORMATION_INSET) / speed, 6);
    }
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i] - xs[i - 1]).toBeCloseTo(spacing, 6);
    }
    expect((xs[0] + xs[4]) / 2).toBeCloseTo(ship.x, 6); // centred on its lane
    // a line longer than the edge closes up to fit it
    const long = place('sweep', 20, ship).points;
    expect(long.every(inField)).toBe(true);
  });

  it('brings a dense pack from the farthest edge, all heading at the ship', () => {
    const { spread, speed, hold } = FORMATIONS.swarm;
    const ship = { x: 700, y: 300 }; // the left edge is farthest
    const { edge, points } = place('swarm', 9, ship);
    expect(edge).toBe('left');
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    for (const p of points) {
      expect(inField(p)).toBe(true);
      expect(Math.hypot(p.x - cx, p.y - cy)).toBeLessThanOrEqual(spread * 1.5);
      expect(p.vx).toBeGreaterThan(0);
      expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(speed, 6);
      expect(p.hold).toBe(hold);
    }
    // one heading for the whole pack
    expect(new Set(points.map((p) => p.vx.toFixed(6))).size).toBe(1);
  });

  it('pushes a row across the whole field from the farthest edge, with one gap between two units', () => {
    const { gap, speed } = FORMATIONS.wall;
    const ship = { x: 400, y: 80 }; // the bottom edge is farthest
    for (let seed = 1; seed <= 12; seed += 1) {
      const { edge, points } = place('wall', 8, ship, seed);
      expect(edge).toBe('bottom');
      const xs = points.map((p) => p.x);
      expect(xs[0]).toBe(FORMATION_INSET);
      expect(xs[7]).toBeCloseTo(W - FORMATION_INSET, 6);
      const steps = xs.slice(1).map((x, i) => x - xs[i]);
      const step = (W - 2 * FORMATION_INSET - gap) / 7;
      expect(steps.filter((d) => Math.abs(d - step) < 1e-6)).toHaveLength(6);
      expect(steps.filter((d) => Math.abs(d - step - gap) < 1e-6)).toHaveLength(
        1
      );
      for (const p of points) {
        expect(p.y).toBe(H - FORMATION_INSET);
        expect(p).toMatchObject({ vx: 0, vy: -speed });
        expect(p.hold).toBeCloseTo((H - 2 * FORMATION_INSET) / speed, 6);
      }
    }
  });

  it('places the same formation the same way for the same stream', () => {
    const ship = { x: 250, y: 200 };
    for (const shape of Object.keys(FORMATIONS)) {
      expect(place(shape, 7, ship, 9)).toEqual(place(shape, 7, ship, 9));
    }
  });

  it('is asked for by a stage line carrying its shape’s numbers, and refuses a shape there is not', () => {
    expect(formation('ring', { role: 'swarmer', count: 6, at: 20 })).toEqual({
      kind: 'ring',
      role: 'swarmer',
      count: 6,
      at: 20,
      elite: 0,
      ...FORMATIONS.ring,
    });
    expect(
      formation('wall', { role: 'hazard', count: 8, at: 30, gap: 250 }).gap
    ).toBe(250);
    expect(() =>
      formation('spiral', { role: 'swarmer', count: 3, at: 1 })
    ).toThrow(/spiral/);
  });
});

describe('the layer director and its formations', () => {
  const RING = formation('ring', { role: 'swarmer', count: 4, at: 10 });
  const director = {
    roster: [],
    surges: [],
    formations: [RING],
    events: [],
  };
  const POINTS = Array.from({ length: 4 }, (_, i) => ({
    x: 100 + i,
    y: 100,
    vx: 1,
    vy: 0,
    hold: 0.5,
  }));

  function scheduleOf({ empty = false } = {}) {
    const eventBus = { emit: vi.fn() };
    const spawner = {
      waveRandom: null,
      spawnWave: vi.fn(),
      spawnDelayMultiplier: 1,
      formationPoints: vi.fn(() => ({ edge: null, points: POINTS })),
    };
    const schedule = new LayerSchedule({
      eventBus,
      spawner,
      layerEvents: { updateFieldEvents: () => {}, startFieldEvent: () => {} },
      getLayer: () => 6,
      isFieldEmpty: () => empty,
      checkWaveCompletion: () => {},
    });
    schedule.layerSchedule = schedule.buildLayerSchedule(director);
    return { schedule, eventBus, spawner };
  }

  it('counts a formation’s units as the layer’s, one enemy per unit for its role', () => {
    const { schedule } = scheduleOf();
    expect(schedule.layerSchedule).toHaveLength(1);
    expect(schedule.layerSchedule[0]).toMatchObject({
      at: 10,
      groups: [{ kind: 'mite', count: 4 }],
      formation: RING,
    });
  });

  it('lights its marks at `at` and brings its units onto them FORMATION_WARN s later', () => {
    const { schedule, eventBus, spawner } = scheduleOf();
    schedule.updateLayerSchedule(9.9);
    expect(eventBus.emit).not.toHaveBeenCalled();

    schedule.updateLayerSchedule(0.2);
    expect(spawner.formationPoints).toHaveBeenCalledWith(RING, 4);
    expect(eventBus.emit).toHaveBeenCalledWith('formation-warned', {
      layer: 6,
      kind: 'ring',
      role: 'swarmer',
      edge: null,
      points: POINTS,
      warn: FORMATION_WARN,
    });
    expect(spawner.spawnWave).not.toHaveBeenCalled();

    schedule.updateLayerSchedule(FORMATION_WARN - 0.2);
    expect(spawner.spawnWave).not.toHaveBeenCalled();
    schedule.updateLayerSchedule(0.2);
    expect(spawner.spawnWave).toHaveBeenCalledTimes(1);
    const [config, options] = spawner.spawnWave.mock.calls[0];
    expect(config.enemies).toEqual([
      expect.objectContaining({ type: 'mite', count: 4, eliteChance: 0 }),
    ]);
    expect(options.points).toBe(POINTS);
    expect(schedule.layerSchedule).toHaveLength(0);
  });

  it('comes at once on an empty field, but still after its warning', () => {
    const { schedule, eventBus, spawner } = scheduleOf({ empty: true });
    schedule.updateLayerSchedule(0.1);
    expect(eventBus.emit).toHaveBeenCalledWith(
      'formation-warned',
      expect.any(Object)
    );
    schedule.updateLayerSchedule(0.1);
    expect(spawner.spawnWave).not.toHaveBeenCalled();
    schedule.updateLayerSchedule(FORMATION_WARN);
    expect(spawner.spawnWave).toHaveBeenCalledTimes(1);
  });

  it('keeps only formations of the Hunters’ Moon roles under it', () => {
    const charge = formation('sweep', { role: 'charger', count: 3, at: 5 });
    const moon = new LayerEvents({}).applyHuntersMoon({
      modifier: 'hunters-moon',
      roster: [],
      surges: [],
      formations: [RING, charge],
    });
    expect(moon.formations).toEqual([charge]);
  });
});

describe('a unit in formation', () => {
  it('flies its course whatever its own movement does, then lets go', () => {
    const Ram = recipeEnemyClass(getContent('enemies', 'ram'));
    const player = { position: { x: 100, y: 500 } };
    const ram = new Ram(
      { eventBus: { emit: vi.fn() }, getCachedPlayer: () => player },
      {
        id: 'ram-f',
        x: 100,
        y: 100,
        vx: 200,
        vy: 0,
        course: { vx: 200, vy: 0, left: 0.5 },
      }
    );
    ram.update(0.25);
    expect(ram.x).toBeCloseTo(150, 6);
    expect(ram.y).toBeCloseTo(100, 6);
    expect(ram.rotation).toBe(0);
    ram.update(0.25);
    expect(ram.x).toBeCloseTo(200, 6);
    expect(ram.course).toBeNull();
    ram.update(0.1); // its own approach: down toward the ship
    expect(ram.vy).toBeGreaterThan(0);
  });
});
