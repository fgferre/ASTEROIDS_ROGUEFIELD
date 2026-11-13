import { describe, expect, it, vi } from 'vitest';

import { BOSS_KINDS } from '../../../src/data/enemies/boss.js';
import Sovereign from '../../../src/modules/enemies/types/Sovereign.js';

const SOV = BOSS_KINDS.sovereign;
const STEP = 1 / 60;
const SHIP = { x: 650, y: 300 };

const rock = (x, y) => ({ type: 'asteroid', x, y, vx: 0, vy: 0, radius: 12 });

// Sovereign at the field's centre (400, 300), over a field of `rocks`.
const createSovereign = (rocks = []) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const escorts = [];
  const system = {
    dependencies: { eventBus },
    forEachActiveEnemy: (fn) => rocks.forEach(fn),
    invalidateActiveEnemyCache: vi.fn(),
    waveManager: { onEnemyDestroyed: vi.fn() },
    applyDirectDamageToPlayer: vi.fn(),
    acquireEnemyViaFactory: vi.fn((type, config) => {
      const escort = {
        id: `escort-${escorts.length}`,
        type,
        alive: true,
        x: config.x,
        y: config.y,
        addTag: vi.fn(),
      };
      escorts.push(escort);
      return escort;
    }),
  };
  const boss = new Sovereign(system);
  boss.initialize({ id: 'sovereign-test', x: 400, y: 300, wave: SOV.layer });
  return { boss, system, eventBus, escorts };
};

const target = (position = SHIP, velocity = { vx: 0, vy: 0 }) => ({
  position: { ...position },
  player: { velocity },
});

const run = (boss, seconds, aim = target()) => {
  for (let t = 0; t < seconds; t += STEP) boss.handlePhaseIntro(STEP, aim);
};

const runUntil = (boss, test, aim = target(), limit = 40) => {
  for (let t = 0; t < limit && !test(); t += STEP) {
    boss.handlePhaseIntro(STEP, aim);
  }
};

// Into its last phase, the REBUILD half facing +y (below it on the field).
const splitBoss = () => {
  const made = createSovereign();
  const { boss } = made;
  boss.currentPhase = 2;
  boss.beginSplit();
  boss.splitAngle = 0;
  run(boss, SOV.split.windup + STEP, target({ x: 400, y: 450 }));
  boss.splitAngle = 0;
  return made;
};

describe('Sovereign', () => {
  it('is the final boss: its own rank, three phases, Prime’s base on layer 20 × its factor', () => {
    const { boss } = createSovereign();
    const base = 1500 * 1.2 ** (SOV.layer - 1);

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('sovereign');
    expect(boss.tier).toBe('sovereign');
    expect(boss.displayName).toBe('SOVEREIGN');
    expect(boss.subtitle).toBe('CONTINUANCE');
    expect(boss.maxHealth).toBe(Math.ceil(base * SOV.healthFactor));
    expect(boss.phaseCount).toBe(3);
  });

  it('alternates its orders: a wall that warns then turns, then an open core that pulls and builds escorts', () => {
    const { boss, system } = createSovereign();
    runUntil(boss, () => boss.sovState === 'protect-windup');
    expect(boss.order).toBe('protect');
    expect(boss.barrier).toMatchObject({ type: 'barrier', phase: 'warn' });
    const still = boss.barrier.angle;
    run(boss, SOV.cycle[0].protectWindup / 2);
    expect(boss.barrier.angle).toBe(still);

    runUntil(boss, () => boss.sovState === 'protect');
    run(boss, 1);
    expect(boss.barrier.phase).toBe('solid');
    expect(boss.barrier.angle).not.toBeCloseTo(still, 2);
    expect(boss.plateOpen).toBe(0);

    runUntil(boss, () => boss.sovState === 'rebuild-windup');
    expect(boss.order).toBe('rebuild');
    expect(boss.telegraph).toMatchObject({ type: 'intake', pulling: false });
    runUntil(boss, () => boss.sovState === 'rebuild');
    expect(boss.plateOpen).toBeGreaterThanOrEqual(0.5);
    expect(boss.telegraph.pulling).toBe(true);

    runUntil(boss, () => boss.sovState === 'protect-windup');
    expect(system.acquireEnemyViaFactory).toHaveBeenCalledTimes(
      SOV.cycle[0].escortCap
    );
    // the next wall turns the other way
    expect(Math.sign(boss.barrier.spin)).toBe(-1);
  });

  it('soaks most of a hit shut, takes all of it open', () => {
    const { boss } = createSovereign();
    const full = boss.health;
    boss.takeDamage(100);
    expect(full - boss.health).toBeCloseTo(100 * SOV.protectDamageFactor);

    boss.plateOpen = 1;
    const before = boss.health;
    boss.takeDamage(100);
    expect(before - boss.health).toBeCloseTo(100);
  });

  it('pulls the ship and the rocks in its cone, absorbing rocks into the build', () => {
    const inCone = rock(560, 300);
    const behind = rock(200, 300);
    const { boss } = createSovereign([inCone, behind]);
    const velocity = { vx: 0, vy: 0 };
    runUntil(boss, () => boss.sovState === 'rebuild');
    for (let t = 0; t < 1.5; t += STEP) {
      boss.handlePhaseIntro(STEP, target(SHIP, velocity));
      for (const r of [inCone, behind]) {
        r.x += r.vx * STEP;
        r.y += r.vy * STEP;
      }
    }

    expect(velocity.vx).toBeLessThan(0);
    expect(inCone.destroyed).toBe(true);
    expect(behind.destroyed).toBeUndefined();
  });

  it('a hard hit while it rebuilds scraps the escorts and leaves it reeling, open', () => {
    const { boss, system } = createSovereign();
    runUntil(boss, () => boss.sovState === 'rebuild');
    run(boss, 1);
    boss.takeDamage(boss.maxHealth * 0.02);
    expect(boss.sovState).toBe('rebuild');
    boss.takeDamage(boss.maxHealth * 0.02);
    expect(boss.sovState).toBe('stagger');
    expect(boss.build).toBe(0);
    expect(boss.telegraph).toBeNull();

    run(boss, SOV.stagger / 2);
    expect(boss.plateOpen).toBe(1);
    runUntil(boss, () => boss.sovState === 'protect-windup');
    expect(system.acquireEnemyViaFactory).not.toHaveBeenCalled();
  });

  it('changes phase at its two thresholds; the last gives both orders at once', () => {
    const { boss } = createSovereign();
    boss.plateOpen = 1;
    run(boss, STEP);

    const [first, second] = SOV.phaseThresholds;
    boss.takeDamage(boss.maxHealth * (1 - first - 0.02));
    expect(boss.currentPhase).toBe(0);
    boss.takeDamage(boss.maxHealth * 0.03);
    expect(boss.currentPhase).toBe(1);
    expect(boss.cycle().volleys).toBeGreaterThan(SOV.cycle[0].volleys);
    expect(boss.cycle().shipPull).toBeGreaterThan(SOV.cycle[0].shipPull);

    boss.invulnerable = false;
    boss.plateOpen = 1;
    boss.takeDamage(boss.maxHealth * (first - second));
    expect(boss.currentPhase).toBe(2);
    expect(boss.order).toBe('both');
    expect(boss.split).toMatchObject({ type: 'split', phase: 'warn' });
    expect(boss.barrier).toMatchObject({ type: 'barrier', ray: true });
    expect(boss.telegraph).toBeNull();
  });

  it('fires lanes in its second phase while the wall holds', () => {
    const { boss, eventBus } = createSovereign();
    boss.currentPhase = 1;
    runUntil(boss, () => boss.sovState === 'protect');
    runUntil(boss, () => boss.beams !== null);
    expect(boss.beams.type).toBe('eject');
    expect(boss.beams.lines).toHaveLength(SOV.lanes.count);
    const fired = () =>
      eventBus.emit.mock.calls.filter(([name]) => name === 'enemy-fired')
        .length;
    expect(fired()).toBe(0);
    runUntil(boss, () => boss.beams === null);
    expect(fired()).toBe(SOV.lanes.count * SOV.lanes.shots);
  });

  it('in the last phase takes full damage from the REBUILD half only, and pulls only there', () => {
    const { boss } = splitBoss();
    boss.invulnerable = false;
    boss.splitAngle = 0;

    let before = boss.health;
    boss.takeDamage(100, { hitPosition: { x: 400, y: 380 } });
    expect(before - boss.health).toBeCloseTo(100);
    before = boss.health;
    boss.takeDamage(100, { hitPosition: { x: 400, y: 220 } });
    expect(before - boss.health).toBeCloseTo(100 * SOV.protectDamageFactor);

    const below = { vx: 0, vy: 0 };
    boss.splitAngle = 0;
    boss.updateSplit(0.2, target({ x: 400, y: 600 - 120 }, below));
    expect(below.vy).toBeLessThan(0);
    const above = { vx: 0, vy: 0 };
    boss.splitAngle = 0;
    boss.updateSplit(0.2, target({ x: 400, y: 120 }, above));
    expect(above.vy).toBe(0);
  });

  it('turns its split line, fires its lanes into the PROTECT half and walls its middle', () => {
    const { boss } = splitBoss();
    const start = boss.splitAngle;
    run(boss, 1, target({ x: 400, y: 450 }));
    expect(boss.splitAngle).toBeCloseTo(start + SOV.split.spin, 1);
    expect(boss.barrier.angle).toBeCloseTo(boss.splitAngle - Math.PI / 2);
    expect(boss.barrier.phase).toBe('solid');

    runUntil(boss, () => boss.beams !== null, target({ x: 400, y: 450 }));
    for (const line of boss.beams.lines) {
      expect(Math.sin(line.angle - boss.splitAngle)).toBeLessThan(0);
    }
  });

  it('in the last phase a scrapped or finished assembly trades the halves after a warning', () => {
    const { boss, system } = splitBoss();
    boss.invulnerable = false;
    const below = { x: 400, y: 450 };
    const hit = { hitPosition: { x: 400, y: 380 } };

    boss.takeDamage(boss.maxHealth * SOV.split.scrapShare, hit);
    expect(boss.sovState).toBe('split-flip');
    expect(boss.split.phase).toBe('warn');
    // the wall warns along the middle of the half that is still open
    expect(boss.barrier.phase).toBe('warn');
    run(boss, STEP, target(below));
    expect(Math.sin(boss.barrier.angle)).toBeCloseTo(1);
    expect(boss.shielded(hit.hitPosition)).toBe(false);

    const held = boss.splitAngle;
    run(boss, SOV.split.flipWindup, target(below));
    expect(boss.sovState).toBe('split');
    expect(Math.cos(boss.splitAngle - held)).toBeLessThan(-0.9);
    expect(boss.barrier.phase).toBe('solid');
    expect(boss.shielded(hit.hitPosition)).toBe(true);
    expect(system.acquireEnemyViaFactory).not.toHaveBeenCalled();

    // left alone, the assembly finishes: escorts, and the halves trade again
    runUntil(boss, () => boss.sovState === 'split-flip', target(below));
    expect(system.acquireEnemyViaFactory).toHaveBeenCalled();
  });

  it('hurts and pushes the ship on its solid wall, not in the gap', () => {
    const { boss, system } = createSovereign();
    runUntil(boss, () => boss.sovState === 'protect');
    const b = boss.barrier;
    const along = (d) => ({
      x: b.x + Math.cos(b.angle) * d,
      y: b.y + Math.sin(b.angle) * d,
    });
    const velocity = { vx: 0, vy: 0 };
    boss.updateBarrier(STEP, target(along(-200), velocity));
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ cause: 'boss-barrier' })
    );
    expect(Math.hypot(velocity.vx, velocity.vy)).toBeGreaterThan(0);

    system.applyDirectDamageToPlayer.mockClear();
    boss.updateBarrier(STEP, target(along(SOV.barrier.gapRadius)));
    expect(system.applyDirectDamageToPlayer).not.toHaveBeenCalled();
  });
});
