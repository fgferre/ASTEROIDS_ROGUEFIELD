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
        getActiveEnemies: () => [],
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

  it('projects edge arrows and a hit through each drawn frame, paused too', () => {
    // The camera pans 1:1 along x; worldToScreen sees it as last drawn.
    let cameraX = 0;
    const renderer = {
      shipOnScreen: { x: 400, y: 300 },
      worldToScreen: (x, y) => ({ x: x - cameraX, y }),
    };
    const tacticalHud = new TacticalHud({
      refs: {},
      player: () => ({
        getDashCooldownFraction: () => 0,
        getPosition: () => ({ x: 500, y: 300 }),
      }),
      enemies: () => ({
        getActiveEnemies: () => [{ type: 'boss', x: 2000, y: 300 }],
      }),
      progression: () => null,
      combat: () => null,
      pickups: () => null,
      renderer: () => renderer,
      shieldKey: () => 'E',
    });
    const layout = {
      updateShip: vi.fn(),
      updateNextWaveTimer: vi.fn(),
      updateBoss: vi.fn(),
      tickBuffs: vi.fn(),
      updateEdgeArrows: vi.fn(),
      showDamageFrom: vi.fn(),
      placeOnShip: vi.fn(),
    };
    tacticalHud.layout = layout;
    const arrowX = () => layout.updateEdgeArrows.mock.lastCall[0][0].x;

    tacticalHud.update(0.016);
    tacticalHud.onPlayerTookDamage({
      playerPosition: { x: 500, y: 300 },
      damageSource: { x: 700, y: 300 },
    });
    expect(layout.updateEdgeArrows).not.toHaveBeenCalled();
    expect(layout.showDamageFrom).not.toHaveBeenCalled();

    cameraX = 100; // the frame drawn after that step
    tacticalHud.placeOnField();
    expect(arrowX()).toBe(1900);
    expect(layout.showDamageFrom).toHaveBeenCalledWith(
      { x: 400, y: 300 },
      { x: 600, y: 300 }
    );
    expect(layout.placeOnShip).toHaveBeenCalledWith({ x: 400, y: 300 });

    cameraX = 300; // paused: no step, the camera still moves
    tacticalHud.placeOnField();
    expect(arrowX()).toBe(1700);
    expect(layout.showDamageFrom).toHaveBeenCalledTimes(1);
  });
});
