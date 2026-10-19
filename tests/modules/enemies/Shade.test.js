import { describe, expect, it, vi } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../src/core/GameConstants.js';
import { getContent } from '../../../src/content/registry.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';

const Shade = recipeEnemyClass(getContent('enemies', 'shade'));
const { phase, 'fan-shot': fan } = getContent('enemies', 'shade').behaviors;
const {
  fade: SHADE_FADE_SECONDS,
  margin: SHADE_FIELD_MARGIN,
  flank: SHADE_FLANK_DISTANCE,
  flankMin: SHADE_FLANK_MIN_DISTANCE,
  phased: SHADE_PHASED_SECONDS,
  visible: SHADE_VISIBLE_SECONDS,
} = phase;
const { arc: SHADE_FAN_ARC, delay: SHADE_FIRE_DELAY, shots: SHADE_SHOTS } = fan;

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

  it('a fan of one shot flies straight at the ship', () => {
    const shade = getContent('enemies', 'shade');
    const Lone = recipeEnemyClass({
      ...shade,
      behaviors: { ...shade.behaviors, 'fan-shot': { ...fan, shots: 1 } },
    });
    const player = { position: { x: 400, y: 300 } };
    const eventBus = { emit: vi.fn() };
    const lone = new Lone(
      { eventBus, getCachedPlayer: () => player },
      { id: 'shade-1', x: 400, y: 100 }
    );

    step(lone, SHADE_FADE_SECONDS + SHADE_FIRE_DELAY + 0.05);
    const shots = shotsOf(eventBus);
    expect(shots).toHaveLength(1);
    const [, { position, velocity, projectile }] = shots[0];
    expect(Number.isFinite(velocity.x) && Number.isFinite(velocity.y)).toBe(
      true
    );
    expect(projectile.angle).toBeCloseTo(
      Math.atan2(300 - position.y, 400 - position.x),
      9
    );
    expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(fan.speed, 6);
  });

  it('announces each dissolve as it starts: out after its solid window, in after the phased one', () => {
    const { eventBus, shade } = setup({ x: 400, y: 100 });
    const phases = () =>
      eventBus.emit.mock.calls.filter(([name]) =>
        name.startsWith('shade-phased')
      );

    step(shade, SHADE_FADE_SECONDS + SHADE_VISIBLE_SECONDS - 0.05);
    expect(phases()).toHaveLength(0);
    step(shade, 0.1);
    expect(shade.phase).toBe('fade-out');
    expect(phases().map(([name]) => name)).toEqual(['shade-phased-out']);

    step(shade, SHADE_FADE_SECONDS + SHADE_PHASED_SECONDS);
    expect(shade.phase).toBe('fade-in');
    const [, [name, payload]] = phases();
    expect(name).toBe('shade-phased-in');
    expect(payload).toMatchObject({
      enemyId: 'shade-1',
      position: { x: expect.any(Number), y: expect.any(Number) },
    });
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

  it('with the ship along a wall, it flanks from the open side, never on top of the ship', () => {
    // Seeded onto the wall side, where the clamped flank point is 10 px away.
    const random = { float: () => 0.5, chance: () => false, range: (a) => a };
    const { player, shade } = setup({ x: 20, y: 300, random });
    player.position = { x: 50, y: 300 };
    player.velocity = { vx: 0, vy: -200 }; // heading up the left wall

    step(
      shade,
      SHADE_FADE_SECONDS * 2 +
        SHADE_VISIBLE_SECONDS +
        SHADE_PHASED_SECONDS +
        0.05
    );
    expect(shade.phase).toBe('fade-in');
    const gap = Math.hypot(
      shade.x - player.position.x,
      shade.y - player.position.y
    );
    expect(gap).toBeGreaterThanOrEqual(SHADE_FLANK_MIN_DISTANCE);
    expect(shade.x).toBeGreaterThanOrEqual(SHADE_FIELD_MARGIN);
    expect(shade.x).toBeLessThanOrEqual(GAME_WIDTH - SHADE_FIELD_MARGIN);
    expect(shade.y).toBeGreaterThanOrEqual(SHADE_FIELD_MARGIN);
    expect(shade.y).toBeLessThanOrEqual(GAME_HEIGHT - SHADE_FIELD_MARGIN);
  });
});
