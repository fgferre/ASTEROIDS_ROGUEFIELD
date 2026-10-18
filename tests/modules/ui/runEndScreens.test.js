import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installDomStubs } from '../../__helpers__/headlessGame.js';
import { RunEndScreens } from '../../../src/modules/ui/RunEndScreens.js';

describe('Run end screens', () => {
  let restoreDom;
  beforeEach(() => {
    restoreDom = installDomStubs();
  });
  afterEach(() => restoreDom());

  it('fills the death recap: run time, killer, salvage, seed, quote', () => {
    const gameOver = { time: {}, killer: {}, salvage: {}, seed: {}, quote: {} };
    const showScreen = vi.fn();
    const screens = new RunEndScreens({
      refs: { gameOver, victory: {} },
      showScreen,
      progression: () => null,
      difficulty: () => ({ runLabel: () => 'Seed 42 · Veteran' }),
      hangar: () => ({ lastAward: { amount: 120, total: 340 } }),
      lastTransmission: () => ({ speaker: 'RING', text: 'Pilot down.' }),
    });

    screens.showGameOverScreen({
      data: {
        stats: { timeElapsed: 125 },
        killedBy: { type: 'hunter', displayName: 'Elite Seeker', elite: true },
      },
    });

    expect(showScreen).toHaveBeenCalledWith('gameover', {
      overlay: true,
      show: true,
    });
    expect(gameOver.time.textContent).toBe('02:05');
    expect(gameOver.killer.textContent).toBe('Killed by Elite Seeker');
    expect(gameOver.salvage.textContent).toBe('SALVAGE +120 (total 340)');
    expect(gameOver.seed.textContent).toBe('Seed 42 · Veteran');
    expect(gameOver.quote.innerHTML).toContain('Pilot down.');
  });
});
