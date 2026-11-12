import { describe, expect, it } from 'vitest';
import {
  BOSS_RUSH_SALVAGE_PER_WARDEN,
  SALVAGE_KILLS_PER_POINT,
  SALVAGE_PER_LAYER,
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

  it('pays a sector run the layers it played, its kills and the victory', () => {
    const kills = 4 * SALVAGE_KILLS_PER_POINT;
    expect(runSalvage({ layer: 8, kills, firstLayer: 6 })).toBe(
      3 * SALVAGE_PER_LAYER + 4
    );
    expect(runSalvage({ layer: 15, kills, won: true, firstLayer: 11 })).toBe(
      5 * SALVAGE_PER_LAYER + 4 + SALVAGE_VICTORY_BONUS
    );
  });
});
