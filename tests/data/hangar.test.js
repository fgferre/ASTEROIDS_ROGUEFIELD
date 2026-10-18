import { describe, expect, it } from 'vitest';
import {
  BOSS_RUSH_SALVAGE_PER_WARDEN,
  SALVAGE_VICTORY_BONUS,
  runSalvage,
} from '../../src/data/hangar.js';

describe('runSalvage', () => {
  it('pays a Boss Rush per Warden killed and the victory, not per layer or kill', () => {
    expect(runSalvage({ layer: 10, kills: 50, bossRushWardens: 1 })).toBe(
      BOSS_RUSH_SALVAGE_PER_WARDEN
    );
    expect(
      runSalvage({ layer: 15, kills: 50, won: true, bossRushWardens: 3 })
    ).toBe(3 * BOSS_RUSH_SALVAGE_PER_WARDEN + SALVAGE_VICTORY_BONUS);
  });
});
