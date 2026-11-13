import { describe, expect, it, vi } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../../src/core/GameConstants.js';
import { BOSS_KINDS, WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import { wardenTransmission } from '../../../src/modules/ui/transmissions.js';
import SentinelInterdictor from '../../../src/modules/enemies/types/SentinelInterdictor.js';

const INTERDICTOR = BOSS_KINDS.interdictor;
const STEP = 1 / 60;
const SHIP = { x: 650, y: 420 };

const createInterdictor = (x = 400, y = 300) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const system = {
    dependencies: { eventBus },
    applyDirectDamageToPlayer: vi.fn(),
  };
  const boss = new SentinelInterdictor(system);
  boss.initialize({ id: 'interdictor-test', x, y, wave: INTERDICTOR.layer });
  return { boss, system, eventBus };
};

const target = (position = SHIP) => ({
  position: { ...position },
  player: { velocity: { vx: 0, vy: 0 } },
});

const run = (boss, seconds, aim = target()) => {
  for (let t = 0; t < seconds; t += STEP) boss.handlePhaseIntro(STEP, aim);
};

const runUntil = (boss, test, aim = target(), limit = 30) => {
  for (let t = 0; t < limit && !test(); t += STEP) {
    boss.handlePhaseIntro(STEP, aim);
  }
};

const hits = (system, cause) =>
  system.applyDirectDamageToPlayer.mock.calls.filter(
    ([, hit]) => hit.cause === cause
  ).length;

// The middle of side `i` of the boss's cage (0 top, 1 right, 2 bottom, 3 left).
const sideMiddle = (grid, i) => {
  const h = grid.size / 2;
  return [
    { x: grid.x, y: grid.y - h },
    { x: grid.x + h, y: grid.y },
    { x: grid.x, y: grid.y + h },
    { x: grid.x - h, y: grid.y },
  ][i];
};

describe('Sentinel Interdictor', () => {
  it('is a Sentinel boss with 60 % of Warden Null’s health on layer 15', () => {
    const { boss } = createInterdictor();
    const base = 1500 * 1.2 ** (INTERDICTOR.layer - 1);
    const warden = base * WARDEN_KINDS.null.healthFactor;

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('interdictor');
    expect(boss.tier).toBe('sentinel');
    expect(boss.displayName).toBe('Interdictor');
    expect(boss.maxHealth).toBe(Math.ceil(base * INTERDICTOR.healthFactor));
    expect(boss.maxHealth / warden).toBeCloseTo(0.6, 3);
  });

  it('cages the ship with one open side, farthest from it first, then clockwise', () => {
    const { boss } = createInterdictor();
    runUntil(boss, () => boss.grid);
    const first = boss.grid;
    expect(first).toMatchObject({ type: 'grid', size: 360, phase: 'warn' });
    expect(first.fences).toHaveLength(3);
    expect(first.posts).toHaveLength(4);
    // the right side is the farthest from a boss at (400, 300)
    expect(first.open).toBe(1);
    const opens = [first.open];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      runUntil(boss, () => boss.gridState === 'rest');
      runUntil(boss, () => boss.gridState === 'grid');
      expect(boss.grid.fences).toHaveLength(3);
      opens.push(boss.grid.open);
    }
    expect(opens).toEqual([1, 2, 3, 0, 1]);
  });

  it('keeps the cage inside the field, even with the ship in a corner', () => {
    const { boss } = createInterdictor();
    const corner = target({ x: 20, y: 580 });
    runUntil(boss, () => boss.grid, corner);
    const { x, y, size } = boss.grid;
    expect(x - size / 2).toBeGreaterThanOrEqual(0);
    expect(y + size / 2).toBeLessThanOrEqual(GAME_HEIGHT);
    expect(x + size / 2).toBeLessThanOrEqual(GAME_WIDTH);
    expect(y - size / 2).toBeGreaterThanOrEqual(0);
  });

  it('hurts and pushes a ship on a fence only once solid, never across the open side', () => {
    const { boss, system } = createInterdictor();
    runUntil(boss, () => boss.grid);
    const grid = boss.grid;
    const closed = (grid.open + 2) % 4;
    const fence = target(sideMiddle(grid, closed));
    run(boss, INTERDICTOR.grid.warn - 0.1, fence);
    expect(hits(system, 'boss-barrier')).toBe(0);

    runUntil(boss, () => grid.phase === 'solid', target(grid));
    const open = target(sideMiddle(grid, grid.open));
    boss.handlePhaseIntro(STEP, open);
    expect(hits(system, 'boss-barrier')).toBe(0);
    expect(open.player.velocity).toEqual({ vx: 0, vy: 0 });

    const pressed = target(sideMiddle(grid, closed));
    boss.handlePhaseIntro(STEP, pressed);
    expect(hits(system, 'boss-barrier')).toBe(1);
    // pushed back into the cage, away from that fence
    const inward = {
      x: grid.x - pressed.position.x,
      y: grid.y - pressed.position.y,
    };
    const v = pressed.player.velocity;
    expect(v.vx * inward.x + v.vy * inward.y).toBeGreaterThan(0);
  });

  it('tracks the ship while aiming, then freezes the line where it was', () => {
    const { boss } = createInterdictor();
    runUntil(boss, () => boss.lock);
    expect(boss.lock).toMatchObject({ type: 'lock', phase: 'aim' });
    const elsewhere = { x: 200, y: 500 };
    run(boss, 0.2, target(elsewhere));
    expect(boss.lock.angle).toBeCloseTo(
      Math.atan2(elsewhere.y - boss.y, elsewhere.x - boss.x)
    );
    expect(boss.aimAngle).toBe(boss.lock.angle);

    runUntil(boss, () => boss.lock.phase === 'freeze');
    const frozen = { ...boss.lock };
    run(boss, INTERDICTOR.lock.freeze / 2, target(elsewhere));
    expect(boss.lock).toMatchObject({
      phase: 'freeze',
      angle: frozen.angle,
      x2: frozen.x2,
      y2: frozen.y2,
    });
    // it reaches the field's edge
    const { x2, y2 } = boss.lock;
    expect(Math.min(x2, GAME_WIDTH - x2, y2, GAME_HEIGHT - y2)).toBeLessThan(1);
  });

  it('burns a ship on the frozen line, not one that stepped off it', () => {
    const { boss, system } = createInterdictor();
    runUntil(boss, () => boss.lock?.phase === 'freeze');
    const { angle } = boss.lock;
    const sideways = {
      x: SHIP.x - Math.sin(angle) * 40,
      y: SHIP.y + Math.cos(angle) * 40,
    };
    runUntil(boss, () => !boss.lock, target(sideways));
    expect(hits(system, 'boss-beam')).toBe(0);

    runUntil(boss, () => boss.lock?.phase === 'burn');
    boss.handlePhaseIntro(STEP, target());
    expect(hits(system, 'boss-beam')).toBe(1);
    const [amount] = system.applyDirectDamageToPlayer.mock.calls.find(
      ([, hit]) => hit.cause === 'boss-beam'
    );
    expect(amount).toBe(
      Math.round(boss.contactDamage * INTERDICTOR.lock.damageFactor)
    );
    run(boss, 0.5);
    expect(hits(system, 'boss-beam')).toBe(2);
  });

  it('fires two locked beams per cage, three below half health with a smaller cage', () => {
    const count = (boss) => {
      let beams = 0;
      let had = false;
      runUntil(boss, () => boss.gridState === 'grid');
      while (boss.gridState === 'grid') {
        boss.handlePhaseAssault(STEP, target());
        if (boss.lock && !had) beams += 1;
        had = Boolean(boss.lock);
      }
      return beams;
    };
    const { boss } = createInterdictor();
    expect(count(boss)).toBe(2);

    const late = createInterdictor().boss;
    late.health = late.maxHealth * 0.45;
    late.evaluatePhaseTransition();
    expect(late.currentPhase).toBe(1);
    expect(late.cycle()).toMatchObject({
      size: 320,
      beams: 3,
      aim: 0.8,
      rest: 2.4,
    });
    expect(count(late)).toBe(3);
  });

  it('takes 30 % with a clang unless it rests, then all of it', () => {
    const { boss, eventBus } = createInterdictor();
    const hit = () => {
      const before = boss.health;
      boss.takeDamage(100, { hitPosition: { x: 450, y: 300 } });
      return before - boss.health;
    };

    expect(hit()).toBeCloseTo(100 * INTERDICTOR.shellDamageFactor);
    const sent = eventBus.emit.mock.calls.map(([name]) => name);
    expect(sent).toContain('bulwark-plate-hit');
    runUntil(boss, () => boss.gridState === 'grid');
    expect(hit()).toBeCloseTo(100 * INTERDICTOR.shellDamageFactor);
    runUntil(boss, () => boss.gridState === 'rest');
    expect(hit()).toBeCloseTo(100);
    run(boss, 0.5);
    expect(boss.ventOpen).toBeGreaterThan(0.9);
    expect(boss.grid).toBeNull();
    runUntil(boss, () => boss.gridState === 'drift');
    expect(hit()).toBeCloseTo(100 * INTERDICTOR.shellDamageFactor);
  });

  it('speaks its own lines by kind', () => {
    expect(wardenTransmission(15, 'warning', 'interdictor')).toEqual({
      key: 'sentinel:interdictor:warning',
      speaker: 'THE INTERDICTOR',
      text: 'Quarantine holds. Boundary drawn. You are inside it.',
    });
    expect(wardenTransmission(15, 'defeated', 'interdictor').text).toBe(
      'Interdictor offline. The boundary is open. Null has been waiting for this.'
    );
  });
});
