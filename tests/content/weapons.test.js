// What a weapon file owes the engine (src/content/weapons/lance.js says what
// each field means), and the cards the catalog builds from them.
import { describe, expect, it } from 'vitest';
import { listContent } from '../../src/content/registry.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import { DEFAULT_WEAPON_ID } from '../../src/data/weapons.js';
import { FIRE_PATTERNS } from '../../src/modules/combat/Weapons.js';

const weapons = listContent('weapons');
const armed = weapons.filter((weapon) => weapon.card);
const PROJECTILE_FIELDS = [
  'burst',
  'damageMultiplier',
  'look',
  'pierce',
  'range',
  'speedMultiplier',
  'trailPoints',
];

// The colours each part draws with in 3D.
function colorsNeeded({ fire, projectile }) {
  return [
    ...(fire.some((entry) => entry.pattern === 'beam')
      ? ['glow', 'mid', 'core']
      : []),
    ...(projectile.look === 'flak' ? ['tracer', 'core'] : []),
    ...(projectile.burst ? ['burst', 'core'] : []),
  ];
}

describe('weapons', () => {
  it.each(weapons)(
    '$id fires known patterns, launches a full projectile and has the colours it draws with',
    (weapon) => {
      weapon.fire.forEach((entry) =>
        expect(Object.keys(FIRE_PATTERNS)).toContain(entry.pattern)
      );
      // The last pattern fires whenever no every-nth one is due.
      expect(weapon.fire.at(-1).every).toBeUndefined();
      expect(Object.keys(weapon.projectile).sort()).toEqual(PROJECTILE_FIELDS);
      colorsNeeded(weapon).forEach((key) =>
        expect(typeof weapon.colors?.[key], key).toBe('string')
      );
    }
  );

  it('a run starts with the lowest order; each weapon card takes its weapon and rules out the others', () => {
    expect(DEFAULT_WEAPON_ID).toBe(weapons[0].id);
    const cardIds = armed.map(({ card }) => card.id);
    armed.forEach(({ id, card }) => {
      const entry = UPGRADE_LIBRARY.find((upgrade) => upgrade.id === card.id);
      expect([...entry.excludes].sort()).toEqual(
        cardIds.filter((other) => other !== card.id).sort()
      );
      expect(entry.levels).toEqual([
        {
          rank: 1,
          effects: [
            {
              type: 'event',
              event: 'upgrade-weapon',
              payload: { weaponId: id },
            },
          ],
        },
      ]);
    });
    const orders = UPGRADE_LIBRARY.map((upgrade) => upgrade.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});
