import { describe, expect, it, vi } from 'vitest';
import { MenuButtons } from '../../../src/services/session/menuButtons.js';

const click = (buttons, id, dataset = {}) =>
  buttons.handleDocumentClick({
    target: { closest: () => ({ id, dataset }) },
    preventDefault() {},
  });

describe('menu buttons', () => {
  it('the campaign Launch and Next Chapter start the sector they carry', () => {
    const startNewRun = vi.fn();
    const buttons = new MenuButtons({ eventBus: null, startNewRun });

    click(buttons, 'campaign-launch-btn', { sector: 'dense-core' });
    click(buttons, 'victory-next-btn', { sector: 'wardens-reach' });

    expect(startNewRun.mock.calls).toEqual([
      [{ source: 'campaign-launch-btn', sector: 'dense-core' }],
      [{ source: 'victory-next-btn', sector: 'wardens-reach' }],
    ]);
  });

  it('Descent picks a mode, which clears the sector; New Mission keeps it', () => {
    const startNewRun = vi.fn();
    const buttons = new MenuButtons({ eventBus: null, startNewRun });

    click(buttons, 'start-game-btn');
    click(buttons, 'victory-restart-btn');

    expect(startNewRun.mock.calls).toEqual([
      [{ source: 'start-game-btn', daily: false, bossRush: false }],
      [
        {
          source: 'victory-restart-btn',
          daily: undefined,
          bossRush: undefined,
        },
      ],
    ]);
  });
});
