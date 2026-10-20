import { describe, expect, it, vi } from 'vitest';

import { getContent } from '../../../src/content/registry.js';
import { recipeEnemyClass } from '../../../src/modules/enemies/types/RecipeEnemy.js';
import RandomService from '../../../src/core/RandomService.js';

const recipe = getContent('enemies', 'sower');
const Sower = recipeEnemyClass(recipe);
const SPEED = recipe.components.movement.maxSpeed;
const { interval: LAY } = recipe.behaviors['lay-mines'];
const { offset: OFFSET } = recipe.behaviors['run-lanes'];

// How far `point` is from the line through the Sower along its lane.
const offLane = (sower, point) =>
  Math.abs(
    (point.x - sower.x) * Math.sin(sower.laneAngle) -
      (point.y - sower.y) * Math.cos(sower.laneAngle)
  );

describe('Sower', () => {
  it('runs straight lanes close beside the ship, one side then the other, dropping Tethers along them', () => {
    const player = { position: { x: 400, y: 300 } };
    const mines = [];
    const system = {
      eventBus: { emit: vi.fn() },
      getCachedPlayer: () => player,
      acquireEnemyViaFactory: vi.fn((type, config) => {
        const mine = {
          type,
          id: `mine-${mines.length}`,
          alive: true,
          ...config,
        };
        mines.push(mine);
        return mine;
      }),
    };
    const sower = new Sower(system, {
      id: 'sower-1',
      x: 100,
      y: 300,
      random: new RandomService(5),
    });

    sower.onUpdate(0.1);
    expect(Math.hypot(sower.vx, sower.vy)).toBeCloseTo(SPEED, 6);
    expect(sower.vx).toBeGreaterThan(0); // toward the ship...
    const miss = offLane(sower, player.position);
    expect(miss).toBeGreaterThan(OFFSET * 0.9); // ...but never into it
    expect(miss).toBeLessThanOrEqual(OFFSET);
    const firstSide = Math.sign(sower.vy);

    // the ship moves: the lane holds
    const lane = sower.laneAngle;
    player.position = { x: 400, y: 100 };
    sower.onUpdate(0.1);
    expect(sower.laneAngle).toBe(lane);

    // it drops Tethers where it is as it goes
    for (let t = 0; t < LAY * 3; t += 0.1) {
      sower.x += sower.vx * 0.1;
      sower.y += sower.vy * 0.1;
      sower.onUpdate(0.1);
    }
    expect(mines.length).toBeGreaterThanOrEqual(2);
    expect(mines.every(({ type }) => type === 'mine')).toBe(true);
    expect(mines[1].x).toBeGreaterThan(mines[0].x);

    // at the far edge it turns a new lane, past the ship's other side
    player.position = { x: 400, y: 300 };
    sower.x = 780;
    sower.y = 300;
    sower.onUpdate(0.1);
    expect(sower.vx).toBeLessThan(0);
    expect(Math.sign(sower.vy)).toBe(-firstSide);
    expect(offLane(sower, player.position)).toBeGreaterThan(OFFSET * 0.9);
  });
});
