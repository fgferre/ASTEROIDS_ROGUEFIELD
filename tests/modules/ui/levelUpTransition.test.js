import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import UISystem from '../../../src/modules/UISystem.js';
import {
  CARD_STAGGER_MS,
  LEVELUP_EXIT_MS,
  playLevelUpExit,
  staggerCardEntry,
} from '../../../src/modules/ui/levelUpTransition.js';

function fakeNode(rect = { left: 0, top: 0, width: 0, height: 0 }, id = '') {
  const classes = new Set();
  const props = {};
  return {
    dataset: { upgradeId: id },
    classes,
    props,
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
    },
    style: { setProperty: (name, value) => (props[name] = value) },
    getBoundingClientRect: () => rect,
  };
}

const cardRect = (left) => ({ left, top: 200, width: 200, height: 300 });

describe('Level-up card transition', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('staggers the cards in by 60 ms each', () => {
    const cards = [fakeNode(), fakeNode(), fakeNode()];
    staggerCardEntry(cards);

    expect(cards.map((card) => card.props['--enter-delay'])).toEqual([
      '0ms',
      `${CARD_STAGGER_MS}ms`,
      `${2 * CARD_STAGGER_MS}ms`,
    ]);
    cards.forEach((card) => expect(card.classes.has('is-entering')).toBe(true));
  });

  it('flies the pick to the HUD, drops the rest, resumes after 350 ms', () => {
    const screen = fakeNode();
    const cards = [100, 400, 700].map((left) => fakeNode(cardRect(left)));
    const target = fakeNode({ left: 40, top: 820, width: 120, height: 30 });
    const done = vi.fn();
    staggerCardEntry(cards);

    playLevelUpExit({
      screen,
      cards,
      picked: cards[1],
      target,
      reducedMotion: false,
      done,
    });

    expect(screen.classes.has('is-leaving')).toBe(true);
    expect([...cards[1].classes]).toEqual(['is-picked']);
    expect([...cards[0].classes]).toEqual(['is-dismissed']);
    expect([...cards[2].classes]).toEqual(['is-dismissed']);
    expect(cards[1].props).toMatchObject({
      '--fly-x': '-400px',
      '--fly-y': '485px',
    });

    vi.advanceTimersByTime(LEVELUP_EXIT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(screen.classes.has('is-leaving')).toBe(false);
  });

  it('resumes at once with reduced motion', () => {
    const screen = fakeNode();
    const cards = [fakeNode(cardRect(0))];
    const done = vi.fn();

    const timer = playLevelUpExit({
      screen,
      cards,
      picked: cards[0],
      target: null,
      reducedMotion: true,
      done,
    });

    expect(timer).toBeNull();
    expect(done).toHaveBeenCalledTimes(1);
    expect(cards[0].classes.size).toBe(0);
    expect(screen.classes.size).toBe(0);
  });

  describe('in UISystem', () => {
    let restoreDom;
    beforeEach(() => {
      restoreDom = installDomStubs();
    });
    afterEach(() => restoreDom());

    it('keeps the cards locked while they leave', () => {
      const screen = fakeNode();
      document.getElementById = (id) =>
        id === 'levelup-screen' ? screen : null;
      const cards = ['a', 'b'].map((id, i) => fakeNode(cardRect(i * 300), id));
      const ui = {
        levelUpState: { buttons: cards, lockedUntil: 0 },
        prefersReducedMotion: () => false,
        showGameUI: vi.fn(),
      };
      const locked = () => UISystem.prototype.isLevelUpLocked.call(ui);

      UISystem.prototype.leaveLevelUp.call(ui, 'b');

      expect(cards[1].classes.has('is-picked')).toBe(true);
      expect(locked()).toBe(true);
      vi.advanceTimersByTime(LEVELUP_EXIT_MS);
      expect(ui.showGameUI).toHaveBeenCalledTimes(1);
    });
  });
});
