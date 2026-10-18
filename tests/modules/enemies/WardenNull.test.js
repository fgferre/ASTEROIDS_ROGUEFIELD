import { describe, expect, it, vi } from 'vitest';

import { WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import WardenNull from '../../../src/modules/enemies/types/WardenNull.js';

const NULL = WARDEN_KINDS.null;
const STEP = 1 / 60;

const createNull = () => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const xpOrbs = { startGlobalPull: vi.fn() };
  const boss = new WardenNull({
    dependencies: { eventBus },
    getCachedXPOrbs: () => xpOrbs,
    applyDirectDamageToPlayer: vi.fn(),
  });
  boss.initialize({ id: 'null-test', x: 400, y: 300, wave: 15 });
  return { boss, eventBus, xpOrbs };
};

describe('Warden Null', () => {
  it('is a boss whose closed shell hugs the core', () => {
    const { boss } = createNull();

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('null');
    expect(boss.displayName).toBe('Warden Null');
    expect(boss.plates).toHaveLength(NULL.plateCount);
    const plate = boss.plates[0];
    expect(Math.hypot(plate.x - boss.x, plate.y - boss.y)).toBeCloseTo(
      boss.radius,
      5
    );
  });

  it('phase 2 opens the shell and inverts the XP pull after a ring', () => {
    const { boss, xpOrbs } = createNull();
    boss.takeDamage(boss.maxHealth * 0.4);
    expect(boss.currentPhase).toBe(1);

    for (let t = 0; t < NULL.openDuration + 0.05; t += STEP) {
      boss.handlePhaseAssault(STEP, null);
    }
    expect(boss.shellOpen).toBe(1);
    const plate = boss.plates[0];
    expect(Math.hypot(plate.x - boss.x, plate.y - boss.y)).toBeCloseTo(
      NULL.openOrbitRadius,
      5
    );

    let sawWindup = false;
    for (let t = 0; t < NULL.firstPullDelay + NULL.pullWindup; t += STEP) {
      boss.handlePhaseAssault(STEP, null);
      sawWindup ||= boss.pullState === 'windup';
    }
    expect(sawWindup).toBe(true);
    expect(boss.pullState).toBe('inverting');
    expect(xpOrbs.startGlobalPull).toHaveBeenCalledTimes(1);
    expect(xpOrbs.startGlobalPull).toHaveBeenCalledWith(
      NULL.pullDuration,
      NULL.pullSpeed,
      NULL.pullAcceleration,
      -1
    );
  });

  it('phase 1 charges behind a dark lane', () => {
    const { boss } = createNull();
    boss.chargeTimer = 0;

    boss.handlePhaseIntro(STEP, { position: { x: 700, y: 300 } });

    expect(boss.chargeState).toBe('windup');
    expect(boss.telegraph).toMatchObject({ type: 'charge', tone: 'dark' });
  });

  it('phase 3 sheds the plates and charges every finaleChargeCadence seconds', () => {
    const { boss, eventBus } = createNull();
    boss.takeDamage(boss.maxHealth * 0.7);
    expect(boss.currentPhase).toBe(2);
    expect(boss.shellShed).toBe(true);

    const target = { position: { x: 700, y: 300 } };
    const starts = [];
    let time = 0;
    for (let i = 0; i < 15 * 60; i += 1) {
      eventBus.emit.mockClear();
      boss.handlePhaseFinale(STEP, target);
      time += STEP;
      const announced = eventBus.emit.mock.calls.some(
        ([name, p]) =>
          name === 'boss-telegraph' && p.telegraph.type === 'charge'
      );
      if (announced) starts.push(time);
    }

    expect(starts.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i] - starts[i - 1]).toBeCloseTo(
        NULL.finaleChargeCadence,
        1
      );
    }
  });
});
