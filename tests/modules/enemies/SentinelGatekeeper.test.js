import { describe, expect, it, vi } from 'vitest';

import { BOSS_KINDS, WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import { wardenTransmission } from '../../../src/modules/ui/transmissions.js';
import SentinelGatekeeper from '../../../src/modules/enemies/types/SentinelGatekeeper.js';

const GATE = BOSS_KINDS.gatekeeper;
const STEP = 1 / 60;
const SHIP = { x: 700, y: 300 };

// A Gatekeeper at (x, y) facing +x.
const createGate = (x = 400, y = 300) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const system = {
    dependencies: { eventBus },
    applyDirectDamageToPlayer: vi.fn(),
  };
  const boss = new SentinelGatekeeper(system);
  boss.initialize({ id: 'gate-test', x, y, wave: GATE.layer });
  boss.facing = 0;
  return { boss, system, eventBus };
};

const target = (position = SHIP, velocity = { vx: 0, vy: 0 }) => ({
  position: { ...position },
  player: { velocity },
});

const runUntil = (boss, state, aim = target()) => {
  for (let t = 0; t < 20 && boss.gateState !== state; t += STEP) {
    boss.handlePhaseIntro(STEP, aim);
  }
};

// The point on the barrier `along` px from its origin.
const onBarrier = (b, along) => ({
  x: b.x + Math.cos(b.angle) * along,
  y: b.y + Math.sin(b.angle) * along,
});

describe('Sentinel Gatekeeper', () => {
  it('is a Sentinel boss with 80 % of Prime’s health on its layer', () => {
    const { boss } = createGate();
    const prime =
      1500 * 1.2 ** (GATE.layer - 1) * WARDEN_KINDS.prime.healthFactor;

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('gatekeeper');
    expect(boss.tier).toBe('sentinel');
    expect(boss.displayName).toBe('Gatekeeper');
    expect(boss.maxHealth).toBe(Math.ceil(prime * 0.8));
  });

  it('bars the field with a gap away from the ship, wherever they stand', () => {
    const spots = [
      [{ x: 400, y: 300 }, SHIP],
      [
        { x: 100, y: 100 },
        { x: 700, y: 500 },
      ],
      [
        { x: 60, y: 300 },
        { x: 600, y: 320 },
      ],
      [
        { x: 400, y: 550 },
        { x: 420, y: 80 },
      ],
    ];
    for (const [at, ship] of spots) {
      const { boss } = createGate(at.x, at.y);
      runUntil(boss, 'barrier-windup', target(ship));
      const b = boss.barrier;
      const { along } = boss.barrierOffset(ship);
      expect(b.gapWidth).toBe(GATE.barrier.gapWidth);
      expect(b.gapAt - b.gapWidth / 2).toBeGreaterThanOrEqual(b.span[0]);
      expect(b.gapAt + b.gapWidth / 2).toBeLessThanOrEqual(b.span[1]);
      expect(Math.abs(b.gapAt - along)).toBeGreaterThan(b.gapWidth / 2);
    }
  });

  it('hurts and pushes back only when solid and only outside the gap', () => {
    const { boss, system } = createGate();
    runUntil(boss, 'barrier-windup');
    const b = boss.barrier;
    const wall = onBarrier(b, 0);
    expect(b.solid).toBe(0);
    expect(boss.barrierHits(wall)).toBe(false);

    for (let t = 0; t < 2 && b.phase !== 'solid'; t += STEP) {
      boss.updateBarrier(STEP, null);
    }
    expect(b.solid).toBe(1);
    expect(boss.barrierHits(wall)).toBe(true);
    expect(boss.barrierHits(onBarrier(b, b.gapAt))).toBe(false);
    expect(boss.barrierHits({ x: wall.x + 200, y: wall.y })).toBe(false);

    // Flying into it from the ship's side (+x): hurt, and sent back.
    const velocity = { vx: -150, vy: 0 };
    boss.updateBarrier(STEP, target({ x: wall.x + 5, y: wall.y }, velocity));
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(1);
    expect(system.applyDirectDamageToPlayer.mock.calls[0][1].cause).toBe(
      'boss-barrier'
    );
    expect(velocity.vx).toBeCloseTo(GATE.barrier.push);

    // Through the gap: nothing.
    const gap = onBarrier(b, b.gapAt);
    boss.updateBarrier(STEP, target(gap, { vx: -150, vy: 0 }));
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(1);
  });

  it('takes a fraction of a frontal hit, and all of it from behind or recovering', () => {
    const { boss, eventBus } = createGate();
    const hit = (x) => {
      const before = boss.health;
      boss.takeDamage(100, { hitPosition: { x, y: 300 } });
      return before - boss.health;
    };

    expect(hit(500)).toBeCloseTo(100 * GATE.shield.damageFactor);
    const sent = eventBus.emit.mock.calls.map(([name]) => name);
    expect(sent).toContain('bulwark-plate-hit');
    expect(hit(300)).toBeCloseTo(100);
    boss.gateState = 'recover';
    expect(hit(500)).toBeCloseTo(100);
  });

  it('charges along the marked strip, then recovers with its plate lowered', () => {
    const { boss } = createGate();
    runUntil(boss, 'lane-windup');
    const strip = { ...boss.telegraph };
    expect(strip).toMatchObject({ type: 'lane', width: GATE.radius * 2 });
    expect(strip.angle).toBeCloseTo(0);
    expect(strip.length).toBeLessThanOrEqual(GATE.charge.distance);

    runUntil(boss, 'charging');
    let travelled = 0;
    while (boss.gateState === 'charging') {
      boss.handlePhaseIntro(STEP, target());
      const dx = boss.x - strip.x;
      const dy = boss.y - strip.y;
      // on the strip's centre line, never back
      expect(
        Math.abs(-dx * Math.sin(strip.angle) + dy * Math.cos(strip.angle))
      ).toBeLessThan(1e-6);
      const along = dx * Math.cos(strip.angle) + dy * Math.sin(strip.angle);
      expect(along).toBeGreaterThanOrEqual(travelled);
      travelled = along;
    }

    expect(boss.gateState).toBe('recover');
    expect(travelled).toBeCloseTo(strip.length);
    expect(boss.x + boss.radius * 0.5).toBeLessThanOrEqual(800 + 1e-6);
    expect(boss.telegraph).toBeNull();
    for (let t = 0; t < 0.5; t += STEP) boss.handlePhaseIntro(STEP, target());
    expect(boss.shieldUp).toBeLessThan(0.5);
  });

  it('below half health charges twice in a row after a shorter warning', () => {
    const { boss } = createGate();
    boss.takeDamage(boss.maxHealth * 0.55);
    expect(boss.currentPhase).toBe(1);
    expect(boss.cycle().barrierWindup).toBeLessThan(
      GATE.cycle[0].barrierWindup
    );

    let charges = 0;
    let state = boss.gateState;
    for (let t = 0; t < 20 && boss.gateState !== 'recover'; t += STEP) {
      boss.handlePhaseAssault(STEP, target());
      if (boss.gateState === 'charging' && state !== 'charging') charges += 1;
      state = boss.gateState;
    }
    expect(charges).toBe(2);
  });

  it('speaks its own lines by kind', () => {
    expect(wardenTransmission(5, 'warning', 'gatekeeper')).toEqual({
      key: 'sentinel:gatekeeper:warning',
      speaker: 'GATEKEEPER',
      text: 'Lane closed. Gate holds. You are not on the manifest.',
    });
    expect(wardenTransmission(5, 'defeated', 'gatekeeper').text).toBe(
      'Gate open. One hull through. Prime has been told.'
    );
  });
});
