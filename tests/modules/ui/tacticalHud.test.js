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
        shield: {
          shieldUpgradeLevel: 1,
          isShieldActive: false,
          shieldCooldownTimer: 0,
          shieldMaxCooldown: 15,
        },
      }),
      enemies: () => ({
        getSessionStats: () => ({ timeElapsed: 75, totalKills: 12 }),
      }),
      progression: () => null,
      combat: () => null,
      physics: () => null,
      pickups: () => null,
      renderer: () => null,
      shieldKey: () => 'E',
    });
    const layout = {
      updateShip: vi.fn(),
      updateStats: vi.fn(),
      updateNextWaveTimer: vi.fn(),
      updateEdgeArrows: vi.fn(),
      updateBoss: vi.fn(),
      tickBuffs: vi.fn(),
    };
    tacticalHud.layout = layout;

    tacticalHud.update(0.016);

    expect(layout.updateShip).toHaveBeenCalledWith({
      shield: 30,
      maxShield: 50,
      hull: 80,
      maxHull: 120,
      ship: null,
      dash: 0.5,
      shieldMode: 'ready',
      shieldSeconds: 0,
      shieldCooldown: 0,
      shieldKey: 'E',
    });
    expect(layout.updateStats).toHaveBeenCalledWith({
      clock: '00:01:15',
      seconds: 75,
      layer: 1,
      kills: 12,
      combo: 0,
      multiplier: undefined,
    });
    expect(layout.tickBuffs).toHaveBeenCalledWith(0.016);
  });
});
