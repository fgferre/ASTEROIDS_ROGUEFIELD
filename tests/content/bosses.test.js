// What every boss and Herald item (src/content/bosses) owes the lists built
// from it: a `tier` that names its list (boss.js, herald.js, elite.js and the
// Codex read it), a name, a Codex entry, the layer a Sentinel fights on, and
// for a boss the class it is built from (the one hand-kept map left).
import { describe, expect, it } from 'vitest';
import { listContent } from '../../src/content/registry.js';
import { WARDEN_CLASSES } from '../../src/modules/enemies/types/wardens.js';

const TIERS = ['warden', 'sentinel', 'sovereign', 'herald'];
const bosses = listContent('bosses');
const filled = (value) => typeof value === 'string' && value.length > 0;

describe('boss content', () => {
  it.each(bosses)(
    '$id names its list and its name',
    ({ id, tier, displayName }) => {
      expect(
        TIERS.includes(tier),
        `bosses/${id}.js: tier must be one of ${TIERS.join(', ')}`
      ).toBe(true);
      expect(filled(displayName), `bosses/${id}.js: displayName missing`).toBe(
        true
      );
    }
  );

  it.each(bosses)('$id has a Codex entry', ({ id, codex }) => {
    for (const field of ['lore', 'hint', 'glyph']) {
      expect(
        filled(codex?.[field]),
        `bosses/${id}.js: codex.${field} missing`
      ).toBe(true);
    }
  });

  it.each(
    bosses.filter(({ tier }) => ['sentinel', 'sovereign'].includes(tier))
  )('$id names the layer it fights on', ({ id, layer }) => {
    expect(
      Number.isInteger(layer) && layer >= 1,
      `bosses/${id}.js: a Sentinel needs a layer`
    ).toBe(true);
  });

  it.each(bosses.filter(({ tier }) => tier !== 'herald'))(
    '$id has a class to build it from',
    ({ id }) => {
      expect(
        typeof WARDEN_CLASSES[id],
        `bosses/${id}.js: no class for '${id}' in WARDEN_CLASSES (src/modules/enemies/types/wardens.js)`
      ).toBe('function');
    }
  );
});
