import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import UPGRADE_LIBRARY from '../../../src/data/upgrades/index.js';
import {
  CHEST_REVEAL_MS,
  ChestCeremony,
} from '../../../src/modules/ui/ChestCeremony.js';
import { SCREEN_INPUT_LOCKOUT_MS } from '../../../src/modules/ui/LevelUpScreen.js';

function node() {
  const classes = new Set();
  return {
    classes,
    children: [],
    style: { setProperty: () => {} },
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
      replace: (from, to) => classes.delete(from) && classes.add(to),
      contains: (name) => classes.has(name),
    },
    set className(value) {
      classes.clear();
      value.split(' ').forEach((name) => classes.add(name));
    },
    appendChild(child) {
      this.children.push(child);
    },
    set innerHTML(value) {
      if (value === '') this.children = [];
    },
    focus: () => {},
    addEventListener: () => {},
  };
}

// A real progression's lookups over a few granted cards, a screen that
// records what was shown, and whether a level-up's cards are open.
function ceremony({ reducedMotion = false } = {}) {
  const counts = new Map();
  const progression = {
    upgradeLookup: new Map(UPGRADE_LIBRARY.map((card) => [card.id, card])),
    getUpgradeCount: (id) => counts.get(id) ?? 0,
    getFamilyCounts: () => ({ thermal: 1 }),
  };
  const refs = {
    screen: node(),
    title: node(),
    count: node(),
    cards: node(),
    continueBtn: node(),
  };
  const screens = [];
  const state = { levelUpOpen: false, played: 0 };
  const chest = new ChestCeremony({
    refs,
    progression: () => progression,
    combat: () => ({
      getWeaponState: () => ({ weaponId: 'lance', chip: 'LANCE' }),
    }),
    showScreen: (name, { show }) => screens.push(show ? name : `-${name}`),
    showGameUI: () => {
      state.played += 1;
      chest.openNext();
    },
    cardChoiceOpen: () => state.levelUpOpen,
    prefersReducedMotion: () => reducedMotion,
  });
  // A chest grants `ids` (each applied first, as chests.js does), then is spent.
  const grant = (ids) => {
    ids.forEach((id) => {
      counts.set(id, (counts.get(id) ?? 0) + 1);
      chest.addCard({ id });
    });
    chest.chestSpent();
  };
  const shown = () =>
    refs.cards.children.filter((card) => !card.classes.has('is-waiting'))
      .length;
  return { chest, refs, screens, state, grant, shown };
}

describe('chest ceremony', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
    document.createElement = () => node();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    restoreDom();
  });

  it('stops the run and reveals the cards one by one, then Continue goes back', () => {
    const { chest, refs, screens, state, grant, shown } = ceremony();
    grant(['heat_sink', 'plasma', 'heat_sink']);

    expect(screens).toEqual(['chest']);
    expect(refs.count.textContent).toBe('3 cards');
    expect(shown()).toBe(1);
    // Too soon: a held key does not skip it.
    chest.continue();
    expect(shown()).toBe(1);
    vi.advanceTimersByTime(CHEST_REVEAL_MS);
    expect(shown()).toBe(2);
    vi.advanceTimersByTime(CHEST_REVEAL_MS);
    expect(shown()).toBe(3);
    expect(refs.continueBtn.classes.has('is-ready')).toBe(true);
    expect(state.played).toBe(0);

    chest.continue();
    expect(screens).toEqual(['chest', '-chest']);
    expect(state.played).toBe(1);
    expect(chest.isVisible).toBe(false);
  });

  it('a first press during the reveal shows the rest at once', () => {
    const { chest, grant, shown, state } = ceremony();
    grant(['heat_sink', 'plasma', 'multishot', 'propulsors', 'shield']);
    vi.advanceTimersByTime(SCREEN_INPUT_LOCKOUT_MS);
    expect(shown()).toBeLessThan(5);

    chest.continue();
    expect(shown()).toBe(5);
    expect(state.played).toBe(0);
  });

  it('shows everything at once with Reduce Motion', () => {
    const { grant, shown } = ceremony({ reducedMotion: true });
    grant(['heat_sink', 'plasma', 'multishot']);
    expect(shown()).toBe(3);
  });

  it('waits for an open level-up, and shows chests one after the other', () => {
    const { chest, screens, state, grant, refs } = ceremony({
      reducedMotion: true,
    });
    state.levelUpOpen = true;
    grant(['heat_sink']);
    grant(['plasma', 'multishot', 'shield']);
    expect(screens).toEqual([]);

    // The level-up closes through showGameUI, which opens the next chest.
    state.levelUpOpen = false;
    expect(chest.openNext()).toBe(true);
    expect(refs.count.textContent).toBe('1 card');

    vi.advanceTimersByTime(SCREEN_INPUT_LOCKOUT_MS);
    chest.continue();
    expect(refs.count.textContent).toBe('3 cards');
    expect(screens).toEqual(['chest', '-chest', 'chest']);
  });

  it('a run that ends drops what was waiting', () => {
    const { chest, state, grant, screens } = ceremony();
    state.levelUpOpen = true;
    grant(['heat_sink']);
    chest.clear();
    state.levelUpOpen = false;
    expect(chest.openNext()).toBe(false);
    expect(screens).toEqual([]);
  });
});
