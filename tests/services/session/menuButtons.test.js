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
      [{ source: 'campaign-launch-btn', sector: 'dense-core', carry: false }],
      [{ source: 'victory-next-btn', sector: 'wardens-reach', carry: true }],
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

  it('a run from the menu starts under the remote link; a run from a run does not', () => {
    const startNewRun = vi.fn();
    const linked = [];
    const linkIn = (options, start) => linked.push([options.source, start]);
    const buttons = new MenuButtons({ eventBus: null, startNewRun, linkIn });

    click(buttons, 'campaign-launch-btn', { sector: 'debris-wake' });
    click(buttons, 'boss-rush-btn');
    click(buttons, 'victory-next-btn', { sector: 'salvage-lanes' });
    click(buttons, 'restart-game-btn');

    expect(linked.map(([source]) => source)).toEqual([
      'campaign-launch-btn',
      'boss-rush-btn',
    ]);
    expect(startNewRun.mock.calls.map(([o]) => o.source)).toEqual([
      'victory-next-btn',
      'restart-game-btn',
    ]);
    linked[0][1]();
    expect(startNewRun).toHaveBeenLastCalledWith({
      source: 'campaign-launch-btn',
      sector: 'debris-wake',
      carry: false,
    });
  });
});
