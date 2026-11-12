import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { RunEndScreens } from '../../../src/modules/ui/RunEndScreens.js';

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
    };
    const screens = new RunEndScreens({
      refs: { gameOver: {}, victory },
      showScreen: vi.fn(),
      progression: () => null,
      combat: () => null,
      difficulty: () => null,
      hangar: () => ({ lastAward: { amount: 80, total: 80 } }),
      lastTransmission: () => null,
    });
    const win = (sector) =>
      screens.showVictoryScreen({
        data: {
          wave: { current: 10 },
          stats: { timeElapsed: 512, timeline: [] },
          sector,
        },
      });
    return { victory, win };
  }

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
