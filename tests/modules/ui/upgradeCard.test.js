import { describe, expect, it } from 'vitest';
import UPGRADE_LIBRARY from '../../../src/data/upgrades/index.js';
import { buildLine, cardMarkup } from '../../../src/modules/ui/upgradeCard.js';

const card = (id) => UPGRADE_LIBRARY.find((entry) => entry.id === id);
const lance = { weaponId: 'lance', chip: 'LANCE' };
const line = (id, rank, owned) =>
  buildLine(card(id), { rank, owned, weapon: lance });

describe('upgrade card build line', () => {
  it('a third card of a family completes its evolution', () => {
    expect(line('afterburn_lance', 1, 2)).toMatchObject({
      kind: 'completes',
      label: 'Completes',
      title: 'Incendiary Lance',
      note: 'Hits burn for 1.2 s · Overheat +20% damage on every shot',
      end: 'Apex 3/5',
      track: { on: 2, fresh: 1, total: 5, notch: 3 },
    });
  });

  it('a fifth completes its Apex', () => {
    expect(line('afterburn_lance', 1, 4)).toMatchObject({
      label: 'Completes · Apex',
      title: 'Solar Flare Lance',
      end: 'Apex 5/5',
    });
  });

  it('Maneuver completes the dash: its bonus, then Blink', () => {
    expect(line('ram_plating', 1, 2)).toMatchObject({
      title: 'Afterburn',
      note: 'The dash leaves a trail that burns for 0.6s',
    });
    expect(line('ram_plating', 1, 4).title).toBe('Blink');
  });

  it('a rank-up names its rank and leaves the family where it is', () => {
    const ranks = card('propulsors').levels.length;
    expect(line('propulsors', 2, 1)).toMatchObject({
      kind: 'rank',
      label: `Rank 2 of ${ranks}`,
      note: 'Kinetic stays 1/3 · Railshot at 3',
      end: `2/${ranks}`,
      track: { on: 1, fresh: 1, total: ranks },
    });
    expect(line('heat_sink', 2, 3).note).toBe(
      'Thermal stays 3/5 · Solar Flare at 5'
    );
  });

  it('a weapon card replaces the weapon held', () => {
    expect(line('scatter_coil', 1, 0)).toMatchObject({
      kind: 'weapon',
      label: 'Replaces',
      from: 'LANCE',
      to: 'SCATTER COIL',
      note: 'One weapon card per run.',
    });
    expect(line('scatter_coil', 1, 2).note).toBe('Also completes Railshot.');
  });

  it('a new card short of a milestone shows where its family leads', () => {
    expect(line('heat_sink', 1, 0)).toMatchObject({
      kind: 'path',
      label: 'Thermal path',
      end: '1/5',
      steps: [
        { at: 3, name: 'Incendiary Lance', what: 'hits burn for 1.2 s' },
        { at: 5, name: 'Solar Flare Lance', what: 'burns spread' },
      ],
    });
    expect(line('ram_plating', 1, 0).steps.map(({ what }) => what)).toEqual([
      'the dash leaves a trail that burns',
      'the ship vanishes',
    ]);
    expect(line('heat_sink', 1, 3).steps.map(({ at }) => at)).toEqual([5]);
  });

  it('a cursed card has no family to build', () => {
    expect(line('glass_cannon', 1, 0)).toMatchObject({
      kind: 'plain',
      label: 'Cursed · no family',
    });
  });

  it('draws the weapon card apart, with its shot pattern', () => {
    const markup = cardMarkup(
      card('scatter_coil'),
      { rank: 1, owned: 0 },
      { weapon: lance, key: 3 }
    );
    expect(markup).toContain('card__frame');
    expect(markup).toContain('card__pattern');
    expect(markup).toContain('Scatter Coil');
    expect(markup).toContain('<kbd class="card__key">3</kbd>');
  });
});
