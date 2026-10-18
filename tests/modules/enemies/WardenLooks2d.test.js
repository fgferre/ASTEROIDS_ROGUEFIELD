import { describe, expect, it, vi } from 'vitest';

import { RenderComponent } from '../../../src/modules/enemies/components/RenderComponent.js';
import BossEnemy from '../../../src/modules/enemies/types/BossEnemy.js';
import WardenChoir from '../../../src/modules/enemies/types/WardenChoir.js';
import WardenNull from '../../../src/modules/enemies/types/WardenNull.js';

// A 2D context that records every call.
const fakeContext = () => {
  const calls = [];
  const gradient = { addColorStop: () => {} };
  const ctx = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === 'calls') return calls;
        return (...args) => {
          calls.push([key, ...args]);
          return key.startsWith('create') ? gradient : undefined;
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    }
  );
  return ctx;
};

const spawn = (Kind) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const boss = new Kind({ dependencies: { eventBus }, time: 0 });
  boss.initialize({ id: 'look-test', x: 400, y: 300, wave: 10 });
  return boss;
};

const draw = (boss) => {
  const ctx = fakeContext();
  new RenderComponent({ strategy: 'delegate' }).draw({ enemy: boss, ctx });
  return ctx.calls;
};

// Calls that draw (an arc) or place a part (a translate) at x, y.
const drawnAt = (calls, x, y) =>
  calls.filter(
    ([name, ax, ay]) =>
      (name === 'arc' || name === 'translate') &&
      Math.abs(ax - x) < 1e-6 &&
      Math.abs(ay - y) < 1e-6
  );

describe('Warden looks on the 2D renderer', () => {
  it('draws the Choir with a core where each living core is', () => {
    const boss = spawn(WardenChoir);
    expect(boss.renderStrategy).toBe('procedural-boss');

    const calls = draw(boss);

    for (const core of boss.cores) {
      expect(
        drawnAt(calls, core.x - boss.x, core.y - boss.y).length
      ).toBeGreaterThan(0);
    }
    // Prime's look never draws off the boss centre
    const prime = draw(spawn(BossEnemy));
    const core = boss.cores[0];
    expect(drawnAt(prime, core.x - boss.x, core.y - boss.y)).toHaveLength(0);
  });

  it('draws the Null with eight plates until they are shed', () => {
    const boss = spawn(WardenNull);
    expect(boss.renderStrategy).toBe('procedural-boss');

    const rotations = (calls) => calls.filter(([name]) => name === 'rotate');
    expect(rotations(draw(boss))).toHaveLength(8);

    boss.shellShed = true;
    expect(rotations(draw(boss))).toHaveLength(0);
  });
});
