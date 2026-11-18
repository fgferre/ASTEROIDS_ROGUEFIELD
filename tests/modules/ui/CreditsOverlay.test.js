import { describe, expect, it } from 'vitest';
import { SUPPORT_SHOWN } from '../../../src/data/credits.js';
import { fillSupport } from '../../../src/modules/ui/CreditsOverlay.js';

// the menu button, the credits section and the end credits' line, plus the
// address link inside them
function page() {
  const support = [{ style: {} }, { style: {} }, { style: {} }];
  const link = {};
  const root = {
    querySelectorAll: (selector) =>
      selector === '[data-support]' ? support : [link],
  };
  return { root, support, link };
}

describe('Support switch', () => {
  it('is off until the old sounds are swapped', () => {
    expect(SUPPORT_SHOWN).toBe(false);
  });

  it('off hides the three support spots, on shows them', () => {
    const off = page();
    fillSupport(off.root, false);
    expect(off.support.map((node) => node.style.display)).toEqual([
      'none',
      'none',
      'none',
    ]);

    const on = page();
    fillSupport(on.root, true);
    expect(on.support.map((node) => node.style.display)).toEqual(['', '', '']);
    expect(on.link.href).toMatch(/^mailto:/);
  });
});
