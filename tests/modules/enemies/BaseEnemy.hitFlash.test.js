import { describe, expect, it, vi } from 'vitest';
import {
  BaseEnemy,
  HIT_FLASH_MAX_STRETCH,
  HIT_FLASH_SECONDS,
} from '../../../src/modules/enemies/base/BaseEnemy.js';

describe('BaseEnemy hit flash', () => {
  it('flashes fully on damage and fades out over the flash window', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const enemy = new BaseEnemy({});
    enemy.initialize({ id: 'flash-test' });
    expect(enemy.getHitFlash()).toBe(0);

    enemy.takeDamage(5);
    expect(enemy.getHitFlash()).toBe(1);

    now.mockReturnValue(1000 + (HIT_FLASH_SECONDS * 1000) / 2);
    expect(enemy.getHitFlash()).toBeCloseTo(0.5, 6);

    now.mockReturnValue(1000 + HIT_FLASH_SECONDS * 1000);
    expect(enemy.getHitFlash()).toBe(0);
  });

  it('holds the flash longer for bigger hits, up to the cap', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
    const enemy = new BaseEnemy({});
    enemy.initialize({ id: 'flash-heavy', health: 1000 });
    enemy.takeDamage(500);
    now.mockReturnValue(1000 + HIT_FLASH_SECONDS * 1000);
    expect(enemy.getHitFlash()).toBeCloseTo(1 - 1 / HIT_FLASH_MAX_STRETCH, 6);
  });
});
