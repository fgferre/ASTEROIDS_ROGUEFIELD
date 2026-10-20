import { afterEach, describe, expect, it } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import RandomService from '../../src/core/RandomService.js';
import { XP_ORB_BURST } from '../../src/data/constants/gameplay.js';
import XPOrbSystem from '../../src/modules/XPOrbSystem.js';

// A kill's orbs burst out and coast to a stop; inside the ship's magnet they
// accelerate in. A heavier class (higher value) does both slower.

const STEP = 1 / 60;

/** An orb system on a bus that keeps what was collected, and when. */
function orbSystem(player = null) {
  const collected = [];
  let time = 0;
  const eventBus = {
    on() {},
    off() {},
    emit(name, payload) {
      if (name === 'xp-orb-collected') {
        collected.push({ class: payload.class, time });
      }
    },
  };
  const system = new XPOrbSystem({
    eventBus,
    player,
    random: new RandomService('orb-burst'),
  });
  const step = (seconds) => {
    for (let i = 0; i < Math.round(seconds / STEP); i += 1) {
      time += STEP;
      system.update(STEP);
    }
  };
  return { system, step, collected };
}

/** A `className` orb launched at the top burst speed, flown to a stop. */
function burst(className) {
  const { system, step } = orbSystem();
  const orb = system.createXPOrb(400, 300, 5, {
    className,
    vx: XP_ORB_BURST.maxSpeed,
    vy: 0,
  });
  let seconds = 0;
  while (orb.vx || orb.vy) {
    step(STEP);
    seconds += STEP;
  }
  return { seconds, distance: orb.x - 400, orb, step };
}

afterEach(() => GamePools.releaseAll());

describe('XP orb burst', () => {
  it('flies out at its launch speed, slows with drag and settles in about half a second', () => {
    const { seconds, distance, orb, step } = burst('blue');

    expect(seconds).toBeGreaterThan(0.45);
    expect(seconds).toBeLessThan(0.6);
    expect(distance).toBeGreaterThan(30);
    expect(distance).toBeLessThan(50);
    step(0.5);
    expect(orb.x - 400).toBeCloseTo(distance, 6);
  });

  it('a heavier class flies less far and settles sooner', () => {
    const light = burst('blue');
    const heavy = burst('crystal');

    expect(heavy.seconds).toBeLessThan(light.seconds * 0.6);
    expect(heavy.distance).toBeLessThan(light.distance * 0.6);
  });
});

describe('XP orb magnet', () => {
  it('pulls a heavier class in slower, so it arrives later', () => {
    const ship = { getPosition: () => ({ x: 400, y: 300 }) };
    const { system, step, collected } = orbSystem(ship);
    const blue = system.createXPOrb(500, 300, 5);
    const crystal = system.createXPOrb(400, 400, 5, { className: 'crystal' });

    step(0.05);
    expect(Math.hypot(blue.vx, blue.vy)).toBeGreaterThan(
      Math.hypot(crystal.vx, crystal.vy) * 1.5
    );

    step(1);
    expect(collected.map((entry) => entry.class)).toEqual(['blue', 'crystal']);
    const [first, second] = collected;
    expect(second.time - first.time).toBeGreaterThan(0.05);
  });
});
