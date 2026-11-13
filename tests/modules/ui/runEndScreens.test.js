import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import {
  RunEndScreens,
  endingChoiceMarkup,
} from '../../../src/modules/ui/RunEndScreens.js';
import { STORY } from '../../../src/data/story.js';
import { loadRecords } from '../../../src/services/runRecords.js';

describe('Run end screens', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('fills the death screen: headline, killer, quote, run, salvage, invite, seed', () => {
    const gameOver = { body: {}, invite: {}, seed: {}, copySeedBtn: {} };
    const showScreen = vi.fn();
    const screens = new RunEndScreens({
      refs: { gameOver, victory: {} },
      showScreen,
      progression: () => null,
      combat: () => ({
        getWeaponState: () => ({ weaponId: 'lance', name: 'Amber Lance' }),
      }),
      difficulty: () => ({ runLabel: () => 'Seed 42 · Veteran' }),
      hangar: () => ({ lastAward: { amount: 120, total: 340 } }),
      lastTransmission: () => ({ speaker: 'RING', text: 'Pilot down.' }),
    });
    screens.bestAtStart = 12;

    screens.showGameOverScreen({
      data: {
        wave: { current: 9 },
        stats: {
          timeElapsed: 872,
          totalKills: 612,
          timeline: [
            { kind: 'combo', combo: 48, time: 662, layer: 7 },
            { kind: 'death', time: 872, layer: 9, killer: null },
          ],
        },
        killedBy: { type: 'hunter', displayName: 'Elite Seeker', elite: true },
      },
    });

    expect(showScreen).toHaveBeenCalledWith('gameover', {
      overlay: true,
      show: true,
    });
    const body = gameOver.body.innerHTML;
    expect(body).toContain('Layer 9<small>of 15</small>');
    expect(body).toContain(
      'Killed by an <span class="end-killer__who">Elite Seeker</span>'
    );
    expect(body).toContain('Pilot down.');
    expect(body).toContain('×48 combo');
    expect(body).toContain('+120');
    expect(body).toContain('340 to spend in the Hangar');
    expect(gameOver.invite.innerHTML).toBe(
      'Your best is <b>Layer 12</b>. Three layers to go.'
    );
    expect(gameOver.seed.textContent).toBe('Seed 42 · Veteran');
  });

  function victoryScreen() {
    const button = () => {
      const classes = new Set(['hidden']);
      const label = { textContent: '' };
      return {
        dataset: {},
        textContent: '',
        disabled: false,
        label,
        focus() {},
        querySelector: () => label,
        classList: {
          toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)),
          contains: (name) => classes.has(name),
        },
      };
    };
    const victory = {
      body: {},
      invite: {},
      continueBtn: button(),
      nextBtn: button(),
      restartBtn: button(),
      quitBtn: button(),
      menuBtn: button(),
      choiceOptions: {
        innerHTML: '',
        querySelectorAll: () => [button(), button()],
      },
    };
    const showScreen = vi.fn();
    const cinematics = { playEnding: vi.fn() };
    const screens = new RunEndScreens({
      refs: { gameOver: {}, victory },
      showScreen,
      progression: () => null,
      combat: () => null,
      difficulty: () => null,
      hangar: () => ({ lastAward: { amount: 80, total: 80 } }),
      lastTransmission: () => null,
      cinematics,
    });
    const win = (sector) =>
      screens.showVictoryScreen({
        data: {
          wave: { current: 10 },
          stats: { timeElapsed: 512, timeline: [] },
          sector,
        },
      });
    return { victory, win, screens, showScreen, cinematics };
  }

  const CRUCIBLE = {
    id: 'the-crucible',
    time: 512,
    bestTime: 512,
    firstClear: true,
    next: null,
  };

  it('the campaign won opens the choice, never on a replay nor any other sector', () => {
    const { win, screens, showScreen } = victoryScreen();
    win({ ...CRUCIBLE, id: 'wardens-reach', next: 'the-crucible' });
    expect(screens.choice).toBe(null);
    expect(showScreen).toHaveBeenLastCalledWith('victory', {
      overlay: true,
      show: true,
    });

    win(CRUCIBLE);
    expect(screens.choice).not.toBe(null);
    expect(showScreen).toHaveBeenLastCalledWith('ending', {
      overlay: true,
      show: true,
    });

    const replay = victoryScreen();
    replay.screens.noteRunStart({ replay: true });
    replay.win(CRUCIBLE);
    expect(replay.screens.choice).toBe(null);
    expect(replay.victory.body.innerHTML).toContain('The end');
    expect(replay.victory.invite.innerHTML).toContain('0 / 2');
    expect(loadRecords().endings).toEqual([]);
  });

  it('each option of the choice says what it means for the Ring, the archive and the Wake', () => {
    const markup = endingChoiceMarkup();
    Object.values(STORY.ending).forEach(({ title, stakes }) => {
      expect(markup).toContain(title);
      Object.values(stakes).forEach((text) => expect(markup).toContain(text));
    });
  });

  it('a pick records its ending once and plays it, then the final card counts the endings found', () => {
    const { victory, win, screens, showScreen, cinematics } = victoryScreen();
    win(CRUCIBLE);
    expect(screens.chooseEnding('severance')).toBe(true);
    expect(screens.chooseEnding('severance')).toBe(false);
    expect(showScreen).toHaveBeenLastCalledWith('ending', {
      overlay: true,
      show: false,
    });
    expect(loadRecords().endings).toEqual(['severance']);
    expect(cinematics.playEnding).toHaveBeenCalledTimes(1);
    expect(cinematics.playEnding.mock.calls[0][0]).toBe('severance');

    cinematics.playEnding.mock.calls[0][1]();
    expect(victory.body.innerHTML).toContain('The end');
    expect(victory.body.innerHTML).toContain('Severance');
    expect(victory.body.innerHTML).toContain(STORY.ending.severance.epitaph);
    expect(victory.invite.innerHTML).toContain('Endings found <b>1 / 2</b>');
    expect(victory.quitBtn.textContent).toBe('Campaign');
    expect(victory.menuBtn.classList.contains('hidden')).toBe(false);
    expect(victory.restartBtn.classList.contains('hidden')).toBe(true);
    expect(victory.nextBtn.classList.contains('hidden')).toBe(true);
  });

  it('a sector won: the chapter cleared, its badge, Next Chapter and the way back to the map', () => {
    const { victory, win } = victoryScreen();
    win({
      id: 'dense-core',
      time: 512,
      bestTime: 512,
      firstClear: true,
      next: 'wardens-reach',
    });

    expect(victory.body.innerHTML).toContain('Chapter cleared');
    expect(victory.body.innerHTML).toContain('First clear');
    expect(victory.continueBtn.classList.contains('hidden')).toBe(true);
    expect(victory.nextBtn.classList.contains('hidden')).toBe(false);
    expect(victory.nextBtn.dataset.sector).toBe('wardens-reach');
    expect(victory.nextBtn.label.textContent).toBe('Next Chapter');
    expect(victory.quitBtn.textContent).toBe('Campaign map');
  });

  it('a sector won before its chapter ends: Sector cleared, by its name, and Next Sector', () => {
    const { victory, win } = victoryScreen();
    win({
      id: 'debris-wake',
      time: 512,
      bestTime: 512,
      firstClear: false,
      next: 'salvage-lanes',
    });

    expect(victory.body.innerHTML).toContain('Sector cleared');
    expect(victory.body.innerHTML).toContain('DEBRIS WAKE · 8:32');
    expect(victory.nextBtn.dataset.sector).toBe('salvage-lanes');
    expect(victory.nextBtn.label.textContent).toBe('Next Sector');
  });
});
