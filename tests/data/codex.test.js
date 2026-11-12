import { describe, expect, it } from 'vitest';
import { CODEX_ENTRIES, codexIdOf } from '../../src/data/codex.js';

describe('Codex entries', () => {
  it('files a Sentinel under its own id, beside the Wardens', () => {
    const id = codexIdOf({ type: 'boss', bossKind: 'quarry-maw' });
    expect(id).toBe('sentinel-quarry-maw');
    expect(codexIdOf({ type: 'boss', bossKind: 'choir' })).toBe('warden-choir');
    expect(CODEX_ENTRIES.find((entry) => entry.id === id)).toMatchObject({
      name: 'Quarry Maw',
      warden: true,
      fromLayer: 5,
    });
  });

  it('has a glyph, lore and hint for every boss', () => {
    const bosses = CODEX_ENTRIES.filter((entry) => entry.warden);
    expect(bosses.map((entry) => entry.id)).toContain('sentinel-gatekeeper');
    for (const entry of bosses) {
      expect(entry.glyph, entry.id).toBeTruthy();
      expect(entry.lore, entry.id).toBeTruthy();
      expect(entry.hint, entry.id).toBeTruthy();
    }
  });
});
