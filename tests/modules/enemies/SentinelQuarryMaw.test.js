import { describe, expect, it, vi } from 'vitest';

import { BOSS_KINDS, WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import SentinelQuarryMaw from '../../../src/modules/enemies/types/SentinelQuarryMaw.js';

const MAW = BOSS_KINDS['quarry-maw'];
const STEP = 1 / 60;
const SHIP = { x: 700, y: 300 };

const rock = (x, y) => ({ type: 'asteroid', x, y, vx: 0, vy: 0, radius: 12 });

// A Maw at (400, 300) facing the ship at (700, 300), over a field of `rocks`.
const createMaw = (rocks = []) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const system = {
    dependencies: { eventBus },
    forEachActiveEnemy: (fn) => rocks.forEach(fn),
    invalidateActiveEnemyCache: vi.fn(),
    acquireEnemyViaFactory: vi.fn((type, config) => ({ type, ...config })),
    waveManager: { onEnemyDestroyed: vi.fn(), registerDynamicMinion: vi.fn() },
    applyDirectDamageToPlayer: vi.fn(),
  };
  const boss = new SentinelQuarryMaw(system);
  boss.initialize({ id: 'maw-test', x: 400, y: 300, wave: MAW.layer });
  boss.facing = 0;
  // the rocks drift as the field moves them
  const step = (aim) => {
    boss.handlePhaseIntro(STEP, aim);
    for (const r of rocks) {
      r.x += r.vx * STEP;
      r.y += r.vy * STEP;
    }
  };
  return { boss, system, eventBus, step };
};

const target = (velocity = { vx: 0, vy: 0 }) => ({
  position: { ...SHIP },
  player: { velocity },
});

// Runs the loop until it reaches `state` (or `seconds` pass).
const runUntil = ({ boss, step }, state, aim = target()) => {
  for (let t = 0; t < 20 && boss.mawState !== state; t += STEP) step(aim);
};

describe('Sentinel Quarry Maw', () => {
  it('is a Sentinel boss with 70 % of Prime’s health on its layer', () => {
    const { boss } = createMaw();
    const prime =
      1500 * 1.2 ** (MAW.layer - 1) * WARDEN_KINDS.prime.healthFactor;

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('quarry-maw');
    expect(boss.tier).toBe('sentinel');
    expect(boss.displayName).toBe('Quarry Maw');
    expect(boss.maxHealth).toBe(Math.ceil(prime * 0.7));
  });

  it('swallows the rocks its intake pulls in, paying nothing', () => {
    const inCone = rock(560, 300);
    const behind = rock(250, 300);
    const maw = createMaw([inCone, behind]);
    const { boss, system, eventBus } = maw;

    runUntil(maw, 'intake');
    expect(boss.telegraph).toMatchObject({ type: 'intake' });
    runUntil(maw, 'eject-windup');

    expect(inCone.destroyed).toBe(true);
    expect(behind.destroyed).toBeUndefined();
    expect(boss.swallowedTotal).toBe(1);
    expect(system.waveManager.onEnemyDestroyed).toHaveBeenCalledTimes(1);
    const sent = eventBus.emit.mock.calls.map(([name]) => name);
    expect(sent).not.toContain('enemy-destroyed');
  });

  it('pulls the ship toward the open mouth while it is in the cone', () => {
    const maw = createMaw();
    const { boss } = maw;
    const velocity = { vx: 0, vy: 0 };

    runUntil(maw, 'intake', target(velocity));
    for (let t = 0; t < 1; t += STEP) maw.step(target(velocity));

    expect(boss.jawsOpen).toBe(true);
    expect(velocity.vx).toBeLessThan(0);
    expect(velocity.vx).toBeGreaterThan(-MAW.shipPullAcceleration * 1.1);
  });

  it('takes a fraction of the damage shut and all of it open', () => {
    const { boss } = createMaw();
    const full = boss.health;

    boss.takeDamage(100);
    expect(full - boss.health).toBeCloseTo(100 * MAW.closedDamageFactor);

    boss.jawOpen = 1;
    const before = boss.health;
    boss.takeDamage(100);
    expect(before - boss.health).toBeCloseTo(100);
  });

  it('spits as many rocks as it swallowed, within min and max', () => {
    const { boss, system } = createMaw();
    const spat = (swallowed) => {
      system.acquireEnemyViaFactory.mockClear();
      boss.swallowed = swallowed;
      boss.eject(boss.cycle());
      return system.acquireEnemyViaFactory.mock.calls.filter(
        ([type, config]) => type === 'asteroid' && config.size === 'small'
      ).length;
    };

    expect(spat(0)).toBe(MAW.eject.min);
    expect(spat(5)).toBe(5);
    expect(spat(20)).toBe(MAW.eject.max);
  });

  it('changes phase once at half health: a faster cycle, a wider fan', () => {
    const { boss } = createMaw();
    boss.jawOpen = 1;

    boss.takeDamage(boss.maxHealth * 0.45);
    expect(boss.currentPhase).toBe(0);
    boss.takeDamage(boss.maxHealth * 0.1);

    expect(boss.currentPhase).toBe(1);
    expect(boss.cycle().drift).toBeLessThan(MAW.cycle[0].drift);
    expect(boss.cycle().fanArc).toBeGreaterThan(MAW.cycle[0].fanArc);
    boss.invulnerable = false;
    boss.takeDamage(boss.maxHealth * 0.3);
    expect(boss.currentPhase).toBe(1);
  });
});
