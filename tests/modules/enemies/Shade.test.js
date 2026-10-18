import { describe, expect, it, vi } from 'vitest';

import Shade from '../../../src/modules/enemies/types/Shade.js';
import {
  SHADE_FADE_SECONDS,
  SHADE_FAN_ARC,
  SHADE_FIRE_DELAY,
  SHADE_FLANK_DISTANCE,
  SHADE_PHASED_SECONDS,
  SHADE_SHOTS,
  SHADE_VISIBLE_SECONDS,
} from '../../../src/data/enemies/shade.js';

const setup = (at) => {
  const player = {
    position: { x: 400, y: 300 },
    velocity: { vx: 0, vy: 0 },
    getVelocity: () => player.velocity,
  };
  const eventBus = { emit: vi.fn() };
  const shade = new Shade(
    { eventBus, getCachedPlayer: () => player },
    { id: 'shade-1', ...at }
  );
  return { player, eventBus, shade };
};

const step = (shade, seconds, dt = 1 / 60) => {
  for (let t = 0; t < seconds - 1e-9; t += dt) shade.update(dt);
};

const shotsOf = (eventBus) =>
  eventBus.emit.mock.calls.filter(([name]) => name === 'enemy-fired');

describe('Shade', () => {
  it('fires one fan of three shots per solid window, just after it is solid', () => {
    const { eventBus, shade } = setup({ x: 400, y: 100 });
    step(shade, SHADE_FADE_SECONDS + SHADE_FIRE_DELAY - 0.05);
    expect(shotsOf(eventBus)).toHaveLength(0);
    step(shade, 0.1);
    const fan = shotsOf(eventBus).map(([, shot]) => shot.projectile.angle);
    expect(fan).toHaveLength(SHADE_SHOTS);
    expect(fan[SHADE_SHOTS - 1] - fan[0]).toBeCloseTo(SHADE_FAN_ARC, 5);

    step(shade, SHADE_VISIBLE_SECONDS);
    expect(shotsOf(eventBus)).toHaveLength(SHADE_SHOTS);
    step(
      shade,
      SHADE_FADE_SECONDS * 2 + SHADE_PHASED_SECONDS + SHADE_FIRE_DELAY
    );
    expect(shotsOf(eventBus)).toHaveLength(SHADE_SHOTS * 2);
  });

  it('phased, it takes no damage and slides to the ship’s flank, solid again beside it', () => {
    const { player, shade } = setup({ x: 700, y: 500 });
    player.velocity = { vx: 120, vy: 0 }; // heading +x: flanks are ±y

    step(shade, SHADE_FADE_SECONDS * 2 + SHADE_VISIBLE_SECONDS + 0.05);
    expect(shade.phase).toBe('phased');
    expect(shade.intangible).toBe(true);
    expect(shade.visibility).toBe(0);
    expect(shade.takeDamage(100)).toBe(false);
    expect(shade.health).toBe(shade.maxHealth);

    step(shade, SHADE_PHASED_SECONDS);
    expect(shade.phase).toBe('fade-in');
    expect(shade.intangible).toBe(false);
    expect(Math.abs(shade.x - player.position.x)).toBeLessThan(15);
    expect(
      Math.abs(Math.abs(shade.y - player.position.y) - SHADE_FLANK_DISTANCE)
    ).toBeLessThan(15);
    shade.takeDamage(10);
    expect(shade.health).toBe(shade.maxHealth - 10);
  });
});
