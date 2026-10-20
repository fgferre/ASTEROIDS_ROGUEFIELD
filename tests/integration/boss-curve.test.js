/**
 * Warden health: the base, the per-wave healthScaling and each Warden's own
 * `healthFactor` (src/content/bosses/), the same whatever cards the run owns.
 * The fight length the factors aim at (60-90 s on the Warden's layer) is
 * measured in full headless runs, not here.
 */

import { describe, it, expect, vi } from 'vitest';
// ESM import shape verified in docs/esm-import-shapes-2026-05-12.md:
// BossEnemy is a NAMED export (not default).
import { BossEnemy } from '../../src/modules/enemies/types/BossEnemy.js';
import WardenChoir from '../../src/modules/enemies/types/WardenChoir.js';
import WardenNull from '../../src/modules/enemies/types/WardenNull.js';
import {
  BOSS_CONFIG,
  BOSS_BY_LAYER,
  WARDEN_KINDS,
} from '../../src/data/enemies/boss.js';

const FIFTEEN_RANKS = new Map([
  ['plasma', 3],
  ['multishot', 3],
  ['braking_system', 3],
  ['propulsors', 3],
  ['rcs_system', 3],
]);
const CLASSES = { prime: BossEnemy, choir: WardenChoir, null: WardenNull };

function createWarden(kind, wave, upgrades = new Map()) {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const progression = { getAllUpgrades: () => new Map(upgrades) };
  const boss = new CLASSES[kind]({
    dependencies: { eventBus, progression },
    time: 0,
  });
  boss.initialize({ id: `${kind}-test`, x: 400, y: 300, wave });
  return boss;
}

describe('Warden health', () => {
  it('per-wave healthScaling applies on top of the base', () => {
    const factor = WARDEN_KINDS.prime.healthFactor;
    expect(createWarden('prime', 1).maxHealth).toBe(
      Math.ceil(BOSS_CONFIG.health * factor)
    );
    expect(createWarden('prime', 3).maxHealth).toBe(
      Math.ceil(BOSS_CONFIG.health * BOSS_CONFIG.healthScaling ** 2 * factor)
    );
  });

  it("each Warden's health is its layer's scaling × its own factor, whatever cards the run owns", () => {
    Object.entries(BOSS_BY_LAYER).forEach(([layer, kind]) => {
      const wave = Number(layer);
      const bare = createWarden(kind, wave);
      expect(bare.maxHealth).toBe(
        Math.ceil(
          BOSS_CONFIG.health *
            BOSS_CONFIG.healthScaling ** (wave - 1) *
            WARDEN_KINDS[kind].healthFactor
        )
      );
      const built = createWarden(kind, wave, FIFTEEN_RANKS);
      expect(built.upgradeLevelSum).toBe(15);
      expect(built.maxHealth).toBe(bare.maxHealth);
    });
  });
});
