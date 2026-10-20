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
});
