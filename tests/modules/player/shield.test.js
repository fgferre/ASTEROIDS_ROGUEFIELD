/**
 * The level 5 shield bursts as it breaks: the shield deals the damage itself
 * (it came from the effects layer, so a run without effects dealt none).
 */

import { describe, expect, it } from 'vitest';
import { PlayerShield } from '../../../src/modules/player/shield.js';

function shieldAt(level) {
  const events = [];
  const shield = new PlayerShield({
    getEventBus: () => ({
      emit: (name, payload) => events.push([name, payload]),
    }),
    getPosition: () => ({ x: 120, y: 80 }),
  });
  shield.applyShieldLevel(level);
  shield.activateShield();
  events.length = 0;
  return { shield, events };
}

describe('PlayerShield', () => {
  it('at level 5, breaking deals the burst damage around the ship', () => {
    const { shield, events } = shieldAt(5);
    shield.shieldTookDamage(1e6);
    expect(events).toContainEqual([
      'shield-explosion-damage',
      { position: { x: 120, y: 80 }, radius: 200, damage: 50 },
    ]);
  });

  it('counts the presses made with no shield card, and only those', () => {
    const { shield } = shieldAt(0);
    expect(shield.lockedPresses).toBe(1);
    shield.activateShield();
    expect(shield.lockedPresses).toBe(2);
    const { shield: owned } = shieldAt(1);
    owned.activateShield(); // already up: refused, but not for the card
    expect(owned.lockedPresses).toBe(0);
  });

  it('below level 5, breaking deals no damage', () => {
    const { shield, events } = shieldAt(4);
    shield.shieldTookDamage(1e6);
    expect(events.map(([name]) => name)).not.toContain(
      'shield-explosion-damage'
    );
  });
});
