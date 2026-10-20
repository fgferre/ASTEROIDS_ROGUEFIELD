// What a weapon file owes the engine (src/content/weapons/lance.js says what
// each field means), and the cards the catalog builds from them.
import { describe, expect, it } from 'vitest';
import { listContent } from '../../src/content/registry.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import { DEFAULT_WEAPON_ID, WEAPON_FORMS } from '../../src/data/weapons.js';
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
const PATTERN_COLORS = {
  beam: ['glow', 'mid', 'core'],
  chain: ['arc'],
  orbit: ['edge', 'core'],
  aura: ['heat', 'core'],
};
const LOOK_COLORS = { flak: ['tracer', 'core'], seeker: ['tracer', 'core'] };
function colorsNeeded({ fire, projectile }) {
  return [
    ...fire.flatMap((entry) => PATTERN_COLORS[entry.pattern] ?? []),
    ...(LOOK_COLORS[projectile.look] ?? []),
    ...(projectile.burst ? ['burst', 'core'] : []),
  ];
}

// A weapon's forms: itself, and its own evolution and Apex when it has them.
const forms = weapons.flatMap(({ id }) =>
  Object.values(WEAPON_FORMS[id])
    .filter(Boolean)
    .map((form) => ({ label: `${id} ${form.form?.id ?? ''}`.trim(), form }))
);

describe('weapons', () => {
  it.each(forms)(
    '$label fires known patterns, launches a full projectile and has the colours it draws with',
    ({ form: weapon }) => {
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

  it.each(weapons.filter((weapon) => weapon.evolution || weapon.apex))(
    '$id evolves on its card family with a named evolution and Apex of its own',
    ({ id, card, evolution, apex }) => {
      expect(card?.family).toBeTruthy();
      [evolution, apex].forEach((form) => {
        ['id', 'name', 'chip', 'description'].forEach((key) =>
          expect(typeof form?.[key], key).toBe('string')
        );
        expect(form.fire.length).toBeGreaterThan(0);
      });
      expect(WEAPON_FORMS[id].evolution.form).toEqual({
        id: evolution.id,
        stage: 'evolution',
      });
      expect(WEAPON_FORMS[id].apex.form).toEqual({
        id: apex.id,
        stage: 'apex',
      });
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
