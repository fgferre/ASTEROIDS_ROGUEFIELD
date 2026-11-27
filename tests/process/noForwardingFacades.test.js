// The player and the combat system no longer forward their parts' fields
// (step 2 of the facade reform, audit 3.2, 26/11): a reader asks the part
// that owns the field — combat.weapons.beams, combat.targeting.aimMode,
// combat.projectiles.bullets, player.shield.shieldHP, player.flight.maxSpeed.
// PlayerSystem's exposeFields copied its parts' fields onto the player, and
// CombatSystem had a getter or setter per field of its parts; neither comes
// back. Methods that forward a call (combat.updateTargeting) are not facades
// and stay.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PARTS = {
  'src/modules/CombatSystem.js': [
    'targeting',
    'projectiles',
    'weapons',
    'cards',
    'hits',
  ],
  'src/modules/PlayerSystem.js': [
    'movementInput',
    'maneuvers',
    'flight',
    'thrusters',
    'shield',
  ],
};

// `get x() { return this.<part>.y; }` or `set x(v) { this.<part>.y = v; }`.
const forwarders = (file) => {
  const parts = PARTS[file].join('|');
  const accessor = new RegExp(
    String.raw`^\s*(?:get|set)\s+\w+\s*\(\s*\w*\s*\)\s*\{\s*` +
      String.raw`(?:return\s+this\.(?:${parts})\.\w+|this\.(?:${parts})\.\w+\s*=\s*\w+)` +
      String.raw`\s*;?\s*\}`,
    'gm'
  );
  return (readFileSync(file, 'utf8').match(accessor) ?? []).map(
    (m) => m.trim().split('\n')[0]
  );
};

describe('no forwarding facades on the player and the combat system', () => {
  it('PlayerSystem has no exposeFields and defines no property by hand', () => {
    const source = readFileSync('src/modules/PlayerSystem.js', 'utf8');
    expect(source).not.toMatch(/exposeFields|Object\.defineProperty/);
  });

  it.each(Object.keys(PARTS))(
    '%s has no getter or setter that only forwards a part',
    (file) => {
      expect(forwarders(file)).toEqual([]);
    }
  );
});
