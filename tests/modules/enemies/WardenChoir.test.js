import { describe, expect, it, vi } from 'vitest';

import { WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import WardenChoir from '../../../src/modules/enemies/types/WardenChoir.js';

const CHOIR = WARDEN_KINDS.choir;
const STEP = 0.05;

const createChoir = () => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const boss = new WardenChoir({ dependencies: { eventBus }, time: 0 });
  boss.initialize({ id: 'choir-test', x: 400, y: 300, wave: 10 });
  return { boss, eventBus };
};

const run = (boss, seconds, target = null) => {
  for (let t = 0; t < seconds - 1e-9; t += STEP) boss.updateChoir(STEP, target);
};

describe('Warden Choir', () => {
  it('is a boss with three orbiting cores', () => {
    const { boss } = createChoir();

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('choir');
    expect(boss.displayName).toBe('Warden Choir');
    expect(boss.cores).toHaveLength(3);
    for (const core of boss.cores) {
      expect(Math.hypot(core.x - boss.x, core.y - boss.y)).toBeCloseTo(
        CHOIR.coreOrbitRadius,
        5
      );
    }
  });

  it('passes the voice to the next core every singDuration seconds', () => {
    const { boss } = createChoir();

    run(boss, CHOIR.singDuration - 0.2);
    expect(boss.singingIndex).toBe(0);
    run(boss, 0.4);
    expect(boss.singingIndex).toBe(1);
    run(boss, CHOIR.singDuration);
    expect(boss.singingIndex).toBe(2);
  });

  it('dim cores take dimDamageFactor of a hit, the singing core all of it', () => {
    const { boss } = createChoir();
    const [singing, dim] = boss.cores;

    let before = boss.health;
    boss.takeDamage(100, { hitPosition: { x: singing.x, y: singing.y } });
    expect(before - boss.health).toBeCloseTo(100, 5);

    before = boss.health;
    boss.takeDamage(100, { hitPosition: { x: dim.x, y: dim.y } });
    expect(before - boss.health).toBeCloseTo(100 * CHOIR.dimDamageFactor, 5);
  });

  it('breaks the singing core off at phase 2; the rest orbit faster', () => {
    const { boss } = createChoir();
    const before = boss.orbitAngle;
    boss.updateChoir(1, null);
    const slowSpin = boss.orbitAngle - before;

    boss.takeDamage(boss.maxHealth * 0.4);

    expect(boss.currentPhase).toBe(1);
    expect(boss.cores.map((core) => core.alive)).toEqual([false, true, true]);
    expect(boss.cores[boss.singingIndex].alive).toBe(true);
    const mid = boss.orbitAngle;
    boss.updateChoir(1, null);
    expect(boss.orbitAngle - mid).toBeGreaterThan(slowSpin);
  });

  it('announces the chorus with one line per core, then fires from each', () => {
    const { boss, eventBus } = createChoir();
    const target = { position: { x: 400, y: 560 } };
    boss.spreadTimer = 1e9; // fan out of the way
    boss.chorusTimer = 0;

    boss.updateChoir(STEP, target);

    expect(boss.telegraph).toMatchObject({ type: 'chorus' });
    expect(boss.telegraph.lines).toHaveLength(3);
    eventBus.emit.mockClear();
    run(boss, CHOIR.chorusWindup + STEP, target);

    const shots = eventBus.emit.mock.calls.filter(
      ([name, payload]) =>
        name === 'enemy-fired' && payload.projectile.pattern === 'chorus'
    );
    expect(shots).toHaveLength(3 * CHOIR.chorusShots);
    const origins = new Set(
      shots.map(
        ([, p]) => `${Math.round(p.position.x)},${Math.round(p.position.y)}`
      )
    );
    expect(origins.size).toBe(3);
    expect(boss.telegraph).toBeNull();
  });
});
