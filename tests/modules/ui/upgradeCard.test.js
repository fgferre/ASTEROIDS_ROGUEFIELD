import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import UPGRADE_LIBRARY, {
  pilotCardIds,
  trailSteps,
} from '../../../src/data/upgrades/index.js';
import { UPGRADE_FAMILIES } from '../../../src/data/upgrades/families.js';
import {
  buildLine,
  cardMarkup,
  cardState,
  familyColor,
  runTrayMarkup,
} from '../../../src/modules/ui/upgradeCard.js';

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

  it("with the Scatter Coil a family completes under the Scatter's own form name, never the lance's", () => {
    const scatter = { weaponId: 'scatter', chip: 'SCATTER' };
    const title = (id, owned) =>
      buildLine(card(id), { rank: 1, owned, weapon: scatter }).title;
    expect(title('afterburn_lance', 2)).toBe('Kindling');
    expect(title('afterburn_lance', 4)).toBe('Kindling');
    expect(title('arc_lattice', 2)).toBe('Discharge');
    expect(title('shield', 2)).toBe('Implosion');
    expect(title('magfield', 2)).toBe('Scrap Rounds');
    expect(title('multishot', 2)).toBe('Grapeshot');
    expect(title('multishot', 4)).toBe('Hailstorm');
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
    // Kinetic is the Scatter's own family: its own form.
    expect(line('scatter_coil', 1, 2).note).toBe('Also completes Grapeshot.');
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

  it('a family form that does nothing for the weapon in hand says so', () => {
    const held = (weaponId) => ({ weaponId, chip: weaponId });
    const what = (id, owned, weaponId) =>
      buildLine(card(id), { rank: 1, owned, weapon: held(weaponId) }).steps.map(
        (step) => step.what
      );
    // The Arc Caster carries it too: its own wording.
    expect(what('multishot', 0, 'arc-caster')).toEqual([
      'jumps keep 90% of their strength',
      'jumps keep full strength, casts hit 25% harder',
    ]);
    // The Shard Halo carries it too: its own wording.
    expect(what('multishot', 0, 'shard-halo')).toEqual([
      'cuts hit 10% harder and shove enemies off the hull',
      'cuts hit 25% harder, shoved three times as far',
    ]);
    // The Furnace Corona carries the family: its own wording.
    expect(what('multishot', 0, 'furnace-corona')).toEqual([
      'pulses hit 15% harder and throw further',
      'pulses hit 30% harder and throw twice as far',
    ]);
    // Kinetic is the Scatter's own: its forms, Grapeshot and Hailstorm.
    expect(what('multishot', 0, 'scatter')).toEqual([
      'bolts glance off what they hit',
      'bolts glance twice',
    ]);
    // Its own family evolves the weapon itself.
    expect(what('heat_sink', 0, 'furnace-corona')[0]).toBe(
      'every 3rd pulse is a nova'
    );
    // The Seeker Swarm's missiles burst: its own kinetic wording.
    expect(what('multishot', 0, 'seeker-swarm')).toEqual([
      'missile bursts 80% wider',
      'missile bursts 120% wider, missiles 25% harder',
    ]);
  });

  it('the card face reads the text for the weapon in hand', () => {
    const face = (weaponId) =>
      cardMarkup(
        card('multishot'),
        { rank: 1, owned: 0 },
        { weapon: { weaponId, chip: weaponId } }
      );
    expect(face('lance')).toContain('Fires one additional projectile');
    expect(face('furnace-corona')).toContain('The ring reaches');
    expect(face('furnace-corona')).not.toContain('projectile');
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

  it('family and rarity accents are style.css tokens Colorblind Mode swaps', () => {
    const css = readFileSync(
      new URL('../../../src/style.css', import.meta.url),
      'utf8'
    );
    const tokens = (selector) =>
      Object.fromEntries(
        [
          ...css
            .slice(css.indexOf(`${selector} {`))
            .split('}')[0]
            .matchAll(/(--[\w-]+):\s*([^;]+);/g),
        ].map(([, name, value]) => [name, value])
      );
    const base = tokens(':root');
    const assist = tokens(":root[data-color-vision='assist']");
    Object.keys(UPGRADE_FAMILIES).forEach((family) => {
      expect(familyColor(family)).toMatch(/^var\(--family-/);
      expect(base).toHaveProperty(`--family-${family}`);
    });
    // Field stays white; the five hues red-green blindness mixes up change,
    // each to its own, and the rare and cursed edges move off them too.
    const families = ['kinetic', 'thermal', 'arc', 'salvage', 'maneuver'];
    const swapped = families.map((family) => assist[`--family-${family}`]);
    expect(new Set(swapped).size).toBe(families.length);
    expect(assist['--rarity-rare']).toBeTruthy();
    expect(assist['--rarity-cursed']).toBeTruthy();
    expect(assist['--rarity-rare']).not.toBe(assist['--rarity-cursed']);
  });
});

describe('card slots and piloting trail', () => {
  // The new flight's catalog, with `held` cards at their ranks.
  const run = (held, openCards = null) => {
    const applied = new Map(Object.entries(held));
    const pilot = pilotCardIds(UPGRADE_LIBRARY);
    const ids = [...applied.keys()].filter((id) => !pilot.includes(id));
    return {
      upgradeLookup: new Map(UPGRADE_LIBRARY.map((entry) => [entry.id, entry])),
      pilotCardIds: pilot,
      trailSteps: trailSteps(UPGRADE_LIBRARY),
      getUpgradeCount: (id) => applied.get(id) ?? 0,
      getFamilyCounts: () => ({}),
      openCards,
      sealedCards: new Set(),
      isOutOfContract: ({ id }) =>
        !pilot.includes(id) && openCards !== null && !openCards.has(id),
      getCardSlots: () => ({ used: ids.length, max: 8, ids }),
    };
  };
  const build = {
    plasma: 2,
    multishot: 1,
    heat_sink: 1,
    shield: 1,
    scatter_coil: 1,
    propulsors: 1,
    braking_system: 2,
  };
  const count = (html, name) => html.split(name).length - 1;

  it('counts the held cards outside the trail, the weapon card first', () => {
    const html = runTrayMarkup(run(build));
    expect(html).toContain('5<small>/8</small>');
    expect(html.indexOf('is-weapon')).toBeLessThan(html.indexOf('<em>2</em>'));
    expect(count(html, 'run-slot is-empty')).toBe(3);
    expect(html).not.toContain('Full · upgrades only');
  });

  it('a new card shows as a ghost in the next free slot; a trail or fallback card does not', () => {
    const progression = run(build);
    expect(runTrayMarkup(progression, { ghost: 'magfield' })).toContain(
      'is-ghost'
    );
    ['braking_system', 'hull_patch', 'plasma'].forEach((ghost) =>
      expect(runTrayMarkup(progression, { ghost })).not.toContain('is-ghost')
    );
  });

  it('full at eight: amber count, the tag, and no ghost', () => {
    const full = { ...build, magfield: 1, cinder_trail: 1, static_shell: 1 };
    const html = runTrayMarkup(run(full), { ghost: 'wide_net' });
    expect(html).toContain('is-full');
    expect(html).toContain('Full · upgrades only');
    expect(html).not.toContain('is-ghost');
  });

  it('the trail counts its steps and rings the one an offered card brings', () => {
    const progression = run(build);
    const html = runTrayMarkup(progression, { offered: ['braking_system'] });
    expect(html).toContain('3<small>/9</small>');
    expect(html).toContain('Brakes 2/3');
    expect(count(html, 'trail-map__ring')).toBe(1);
    const state = cardState(progression, 'braking_system');
    expect(state.trail).toEqual({ step: 4, total: 9 });
    expect(cardMarkup(state.definition, state, { weapon: lance })).toContain(
      'Trail · step 4 of 9'
    );
    expect(cardState(progression, 'plasma').trail).toBeNull();
  });
});

describe('honest text about the hangar and the trail', () => {
  const pilot = pilotCardIds(UPGRADE_LIBRARY);
  const fourPerFamily = new Set(
    [
      'plasma',
      'heat_sink',
      'afterburn_lance',
      'cinder_trail',
      'multishot',
    ].concat(['ballast_rounds', 'recoil_dampers', 'momentum_rounds'])
  );
  const run = (openCards) => ({
    upgradeLookup: new Map(UPGRADE_LIBRARY.map((entry) => [entry.id, entry])),
    pilotCardIds: pilot,
    trailSteps: trailSteps(UPGRADE_LIBRARY),
    getUpgradeCount: () => 0,
    getFamilyCounts: () => ({}),
    openCards,
    sealedCards: new Set(),
    isOutOfContract: ({ id }) =>
      !pilot.includes(id) && openCards !== null && !openCards.has(id),
  });
  const offer = (progression, id) => {
    const state = cardState(progression, id);
    return cardMarkup(state.definition, state, { weapon: lance });
  };

  it('a family with only four open cards says its 5th opens in the hangar', () => {
    expect(offer(run(fourPerFamily), 'heat_sink')).toContain(
      '5th card in the hangar'
    );
  });

  it('with every card open the path says nothing of the hangar', () => {
    expect(offer(run(null), 'heat_sink')).not.toContain('hangar');
  });

  it('a piloting-trail card shows no family tag; a regular card keeps it', () => {
    const progression = run(null);
    const trailCard = offer(progression, 'braking_system');
    expect(trailCard).not.toContain('Kinetic');
    expect(trailCard).toContain('New');
    expect(offer(progression, 'multishot')).toContain('Kinetic');
  });
});

describe('upgrade card icons', () => {
  it('the kinetic cards draw their own icon, not the family glyph', () => {
    for (const id of ['momentum_rounds', 'close_quarters']) {
      const html = cardMarkup(
        card(id),
        { rank: 1, owned: 0 },
        { weapon: lance }
      );
      expect(html).toContain('class="card__icon"');
      expect(html).not.toContain('translate(5 5)');
    }
  });
});
