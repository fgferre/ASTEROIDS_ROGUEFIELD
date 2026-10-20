import { describe, expect, it } from 'vitest';
import {
  collectBuild,
  endBuildMarkup,
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

// The run end and the pause panel draw the same block.
describe('run build block', () => {
  it('names the weapon by its form, its family track and each family with its cards', () => {
    const markup = endBuildMarkup(collectBuild(progression, combat));
    expect(markup).toContain(
      '<span class="end-weapon__name">Incendiary Lance</span>'
    );
    expect(markup).toContain('<b>Apex 3/5</b> · two cards from Solar Flare');
    expect(markup).toContain('<span class="end-fam__tag">Overheat</span>');
    expect(markup).toContain('<b>Plasma Gun</b><sup>2</sup>');
  });
});
