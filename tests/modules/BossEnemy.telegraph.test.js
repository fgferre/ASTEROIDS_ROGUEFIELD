import { describe, expect, it, vi } from 'vitest';

import BossEnemy from '../../src/modules/enemies/types/BossEnemy.js';

const createBoss = (overrides = {}) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const boss = new BossEnemy({ dependencies: { eventBus }, time: 0 });
  boss.initialize({ id: 'boss-test', x: 100, y: 100, wave: 5, ...overrides });
  return { boss, eventBus };
};

const target = { position: { x: 500, y: 100 } };

describe('boss attack telegraphs', () => {
  it('announces the charge for chargeWindup seconds before launching it', () => {
    const { boss, eventBus } = createBoss();
    boss.chargeTimer = 0;

    boss.updateChargeState(1 / 60, target);

    expect(boss.chargeState).toBe('windup');
    expect(boss.telegraph).toMatchObject({ type: 'charge' });
    expect(boss.telegraph.angle).toBeCloseTo(0, 5);
    expect(boss.vx).toBe(0);
    const telegraphEmit = eventBus.emit.mock.calls.find(
      ([name]) => name === 'boss-telegraph'
    );
    expect(telegraphEmit?.[1]?.telegraph?.type).toBe('charge');

    boss.updateChargeState(boss.chargeWindup + 0.01, target);

    expect(boss.chargeState).toBe('charging');
    expect(boss.telegraph).toBeNull();
    expect(boss.vx).toBeGreaterThan(0);
  });

  it('keeps aiming at the player during the windup', () => {
    const { boss } = createBoss();
    boss.chargeTimer = 0;
    boss.updateChargeState(1 / 60, target);

    boss.updateChargeState(1 / 60, { position: { x: 100, y: 500 } });

    expect(boss.telegraph.angle).toBeCloseTo(Math.PI / 2, 5);
    expect(boss.rotation).toBeCloseTo(Math.PI / 2, 5);
  });

  it('shows the fan wedge for spreadWindup seconds, then fires', () => {
    const { boss, eventBus } = createBoss();
    boss.spreadTimer = 0;

    boss.updateSpreadCycle(1 / 60, target);

    expect(boss.telegraph).toMatchObject({ type: 'fan' });
    expect(boss.telegraph.arc).toBeCloseTo(boss.spreadArc, 5);
    const firedDuringWindup = eventBus.emit.mock.calls.filter(
      ([name]) => name === 'enemy-fired'
    );
    expect(firedDuringWindup).toHaveLength(0);

    boss.updateSpreadCycle(boss.spreadWindup + 0.01, target);

    expect(boss.telegraph).toBeNull();
    const fired = eventBus.emit.mock.calls.filter(
      ([name]) => name === 'enemy-fired'
    );
    expect(fired).toHaveLength(boss.spreadProjectileCount);
    expect(boss.spreadTimer).toBeGreaterThan(0);
  });

  it('fires immediately when a windup is configured as zero', () => {
    const { boss, eventBus } = createBoss();
    boss.chargeWindup = 0;
    boss.chargeTimer = 0;

    boss.updateChargeState(1 / 60, target);

    expect(boss.chargeState).toBe('charging');
    expect(
      eventBus.emit.mock.calls.some(([name]) => name === 'boss-telegraph')
    ).toBe(false);
  });
});
