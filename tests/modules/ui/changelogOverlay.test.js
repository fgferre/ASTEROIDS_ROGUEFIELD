// What's new (ui/CreditsOverlay.js): the version in the menu's corner and the
// list it opens, newest version first.

import { describe, expect, it } from 'vitest';
import {
  changelogMarkup,
  fillChangelog,
} from '../../../src/modules/ui/CreditsOverlay.js';

const RELEASES = [
  {
    version: '0.2.0',
    date: '2026-11-20',
    new: ['A new screen.'],
    improved: [],
    fixed: ['A <broken> thing.'],
  },
  {
    version: '0.1.0',
    date: '2026-11-18',
    new: ['First beta.'],
    improved: [],
    fixed: [],
  },
];

describe("What's new", () => {
  it('lists the newest version first, marked as this one, with only the groups it has', () => {
    const html = changelogMarkup(RELEASES);
    expect(html.indexOf('0.2.0')).toBeLessThan(html.indexOf('0.1.0'));
    expect(html).toContain('20 Nov 2026 · this version');
    expect(html).toContain('18 Nov 2026</span>');
    expect(html.match(/<dt>Improved<\/dt>/g)).toBeNull();
    expect(html.match(/<dt>New<\/dt>/g)).toHaveLength(2);
    expect(html).toContain('<li>A &lt;broken&gt; thing.</li>');
  });

  it("puts the game's own version in the menu's corner", () => {
    const attributes = {};
    const versionButton = {
      textContent: '',
      setAttribute: (name, value) => (attributes[name] = value),
    };
    const body = { innerHTML: '' };
    fillChangelog({ body, versionButton });
    expect(versionButton.textContent).toBe(`v${__GAME_VERSION__}`);
    expect(attributes['aria-label']).toContain(__GAME_VERSION__);
    expect(body.innerHTML).toContain(`${__GAME_VERSION__}<span`);
  });
});
