import { describe, expect, it, vi } from 'vitest';

import Weaver from '../../../src/modules/enemies/types/Weaver.js';
import {
  WEAVER_LAY_INTERVAL,
  WEAVER_MAX_TETHERS,
} from '../../../src/data/enemies/weaver.js';

describe('Weaver', () => {
  it('lays a Tether every interval at its position, up to the live cap', () => {
    const mines = [];
    const acquireEnemyViaFactory = vi.fn((type, config) => {
      const mine = { type, id: `mine-${mines.length}`, alive: true, ...config };
      mines.push(mine);
      return mine;
    });
    const weaver = new Weaver(
      { eventBus: { emit: vi.fn() }, acquireEnemyViaFactory },
      { id: 'weaver-1', x: 300, y: 200 }
    );
    const step = (seconds) => {
      for (let t = 0; t < seconds - 1e-9; t += 0.5) weaver.onUpdate(0.5);
    };

    step(WEAVER_LAY_INTERVAL - 0.5);
    expect(mines).toHaveLength(0);
    step(0.5);
    expect(mines).toHaveLength(1);
    expect(mines[0]).toMatchObject({ type: 'mine', x: 300, y: 200 });

    step(WEAVER_LAY_INTERVAL * 10);
    expect(mines).toHaveLength(WEAVER_MAX_TETHERS);

    mines[0].alive = false; // one detonates: room for another
    step(WEAVER_LAY_INTERVAL);
    expect(mines).toHaveLength(WEAVER_MAX_TETHERS + 1);
  });
});
