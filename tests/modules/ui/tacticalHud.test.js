import { describe, expect, it, vi } from 'vitest';
import { TacticalHud } from '../../../src/modules/ui/TacticalHud.js';

describe('Tactical HUD', () => {
  it("pushes the ship's hull, shield and kills into the layout each frame", () => {
    const tacticalHud = new TacticalHud({
      refs: {},
      player: () => ({
        health: 80,
        maxHealth: 120,
        getShieldState: () => ({ currentHP: 30, maxHP: 50 }),
        getDashCooldownFraction: () => 0.5,
        getPosition: () => ({ x: 0, y: 0 }),
      }),
      enemies: () => ({
        getSessionStats: () => ({ timeElapsed: 75, totalKills: 12 }),
      }),
      progression: () => null,
      combat: () => null,
      physics: () => null,
      pickups: () => null,
      renderer: () => null,
    });
    const layout = {
      updateVitals: vi.fn(),
      updateDashCooldown: vi.fn(),
      updateStats: vi.fn(),
      updateNextWaveTimer: vi.fn(),
      updateEdgeArrows: vi.fn(),
      updateBoss: vi.fn(),
      tickBuffs: vi.fn(),
    };
    tacticalHud.layout = layout;

    tacticalHud.update(0.016);

    expect(layout.updateVitals).toHaveBeenCalledWith(30, 50, 80, 120);
    expect(layout.updateDashCooldown).toHaveBeenCalledWith(0.5);
    expect(layout.updateStats).toHaveBeenCalledWith('00:01:15', 12, undefined);
    expect(layout.tickBuffs).toHaveBeenCalledWith(0.016);
  });
});
