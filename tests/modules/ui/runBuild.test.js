import { describe, expect, it } from 'vitest';
import {
  buildBlockMarkup,
  collectBuild,
} from '../../../src/modules/ui/runRecap.js';

const progression = {
  upgradeLookup: new Map([
    ['plasma', { text: { name: 'Plasma Gun' }, levels: [{}, {}, {}] }],
  ]),
  getUpgradeProgressSnapshot: () => [
    { id: 'plasma', level: 2, family: 'thermal' },
  ],
  getSynergySnapshot: () => ({
    families: { thermal: 3 },
    synergies: [{ family: 'thermal', name: 'Overheat' }],
  }),
};
const combat = {
  getWeaponState: () => ({
    weaponId: 'lance',
    name: 'Amber Lance',
    evolutions: [
      { family: 'thermal', id: 'incendiary', name: 'Incendiary Lance' },
    ],
  }),
};

describe('pause build block', () => {
  it('lists the weapon, its evolutions and the lit synergy', () => {
    const markup = buildBlockMarkup(collectBuild(progression, combat));
    expect(markup).toContain('Amber Lance');
    expect(markup).toContain('Incendiary Lance');
    expect(markup).toContain('Thermal · Overheat online');
    expect(markup).toContain('Rank 2 of 3');
  });
});
