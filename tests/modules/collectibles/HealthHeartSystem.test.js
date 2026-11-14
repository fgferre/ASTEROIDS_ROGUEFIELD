import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../src/core/GameConstants.js';
import { HealthHeartSystem } from '../../../src/modules/collectibles/HealthHeartSystem.js';

describe('HealthHeartSystem', () => {
  it('keeps a heart dropped past the edge on the field, within reach', () => {
    const hearts = new HealthHeartSystem({ eventBus: null, player: null });
    const reach = hearts.collectionRadius;
    const past = hearts.spawnHeart(GAME_WIDTH + 17, GAME_HEIGHT + 59);
    expect(past.x).toBe(GAME_WIDTH - reach);
    expect(past.y).toBe(GAME_HEIGHT - reach);
    const before = hearts.spawnHeart(-40, -3);
    expect([before.x, before.y]).toEqual([reach, reach]);
    const inside = hearts.spawnHeart(300, 200);
    expect([inside.x, inside.y]).toEqual([300, 200]);
  });
});
