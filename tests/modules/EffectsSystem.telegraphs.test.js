import { describe, expect, it, vi } from 'vitest';

import { Draw2D } from '../../src/modules/effects/draw2d.js';
import WardenChoir from '../../src/modules/enemies/types/WardenChoir.js';

// A 2D context that records every call.
const fakeContext = () => {
  const calls = [];
  const ctx = new Proxy(
    { calls },
    {
      get(target, key) {
        if (key in target) return target[key];
        return (...args) => calls.push([key, ...args]);
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }
  );
  return ctx;
};

const drawTelegraph = (boss) => {
  const ctx = fakeContext();
  const draw2d = new Draw2D();
  draw2d.addTelegraph(boss);
  draw2d.drawTelegraphs(ctx);
  return ctx.calls;
};

const spawnChoir = () => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const boss = new WardenChoir({ dependencies: { eventBus }, time: 0 });
  boss.initialize({ id: 'choir-telegraph', x: 400, y: 300, wave: 10 });
  return boss;
};

const target = { position: { x: 700, y: 500 } };

describe('boss telegraphs on the 2D renderer', () => {
  it('starts the fan at its origin, not the boss centre', () => {
    const boss = spawnChoir();
    boss.spreadTimer = 0;
    boss.updateSpreadCycle(1 / 60, target);
    const core = boss.singingCore();

    const calls = drawTelegraph(boss);

    expect(calls.find(([name]) => name === 'translate')).toEqual([
      'translate',
      core.x,
      core.y,
    ]);
  });

  it('draws one chorus line from each living core', () => {
    const boss = spawnChoir();
    boss.chorusTimer = 0;
    boss.updateChorus(1 / 60, target);

    const moves = drawTelegraph(boss).filter(([name]) => name === 'moveTo');

    for (const core of boss.cores) {
      expect(
        moves.some(
          ([, x, y]) =>
            Math.abs(x - (core.x - boss.x)) < 1e-6 &&
            Math.abs(y - (core.y - boss.y)) < 1e-6
        )
      ).toBe(true);
    }
  });
});
