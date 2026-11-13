import { describe, expect, it, vi } from 'vitest';

import { BOSS_KINDS, WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import { wardenTransmission } from '../../../src/modules/ui/transmissions.js';
import SentinelFoundryMother from '../../../src/modules/enemies/types/SentinelFoundryMother.js';

const MOTHER = BOSS_KINDS['foundry-mother'];
const STEP = 1 / 60;
const SHIP = { x: 650, y: 420 };
const DEG = Math.PI / 180;

const createMother = (x = 400, y = 300) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const escorts = [];
  const system = {
    dependencies: { eventBus },
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
  const boss = new SentinelFoundryMother(system);
  boss.initialize({ id: 'mother-test', x, y, wave: MOTHER.layer });
  return { boss, system, eventBus, escorts };
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

// Seconds until `test` holds.
const timeUntil = (boss, test, aim = target()) => {
  let t = 0;
  for (; t < 30 && !test(); t += STEP) boss.handlePhaseIntro(STEP, aim);
  return t;
};

// The point `distance` px out along arm 0's centre.
const onArm = (boss, distance = 150) => {
  const { angle } = boss.arms.segments[0];
  return target({
    x: boss.x + Math.cos(angle) * distance,
    y: boss.y + Math.sin(angle) * distance,
  });
};

describe('Sentinel Foundry Mother', () => {
  it('is a Sentinel boss with 55 % of Warden Null’s health on layer 15', () => {
    const { boss } = createMother();
    const base = 1500 * 1.2 ** (MOTHER.layer - 1);
    const warden = base * WARDEN_KINDS.null.healthFactor;

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('foundry-mother');
    expect(boss.tier).toBe('sentinel');
    expect(boss.displayName).toBe('Foundry Mother');
    expect(boss.maxHealth).toBe(Math.ceil(base * MOTHER.healthFactor));
    expect(boss.maxHealth / warden).toBeCloseTo(0.55, 3);
    expect(boss.minionTypes).toEqual(['drone']);
  });

  it('opens its bays, builds, and spawns one escort Drone per bay through the minion path', () => {
    const { boss, system, escorts } = createMother();
    runUntil(boss, () => boss.foundryState === 'assemble');
    expect(boss.bays.map((bay) => bay.progress)).toEqual([0, 0]);
    run(boss, MOTHER.bays.warn + STEP);
    expect(boss.bays.every((bay) => bay.open === 1)).toBe(true);
    run(boss, MOTHER.cycle[0].build / 2);
    expect(boss.bays[0].progress).toBeCloseTo(0.5, 1);
    expect(system.acquireEnemyViaFactory).not.toHaveBeenCalled();

    runUntil(boss, () => boss.foundryState !== 'assemble');
    expect(boss.foundryState).toBe('sweep');
    expect(system.acquireEnemyViaFactory).toHaveBeenCalledTimes(2);
    expect(system.acquireEnemyViaFactory.mock.calls[0][0]).toBe('drone');
    escorts.forEach((escort) => {
      expect(escort.addTag).toHaveBeenCalledWith('minion');
      expect(escort).toMatchObject({
        isBossMinion: true,
        spawnedByBossId: boss.id,
      });
    });
    expect(boss.escortsAlive()).toBe(2);
  });

  it('never keeps more than its cap of escorts alive; a bay over it stays shut', () => {
    const { boss, system, escorts } = createMother();
    const cap = MOTHER.cycle[0].escortCap;
    for (let cycle = 0; cycle < 3; cycle += 1) {
      runUntil(boss, () => boss.foundryState === 'vent');
      runUntil(boss, () => boss.foundryState === 'drift');
    }
    expect(system.acquireEnemyViaFactory).toHaveBeenCalledTimes(cap);
    expect(boss.escortsAlive()).toBe(cap);

    // one lost: only one bay opens next time
    escorts[0].alive = false;
    runUntil(boss, () => boss.foundryState === 'assemble');
    expect(boss.bayCount).toBe(1);
    runUntil(boss, () => boss.foundryState === 'sweep');
    expect(system.acquireEnemyViaFactory).toHaveBeenCalledTimes(cap + 1);
    expect(boss.bays[1].open).toBe(0);
    expect(boss.escortsAlive()).toBe(cap);
  });

  it('scraps the units and vents longer when hit for its scrap share of health while building', () => {
    const { boss, system } = createMother();
    const cycle = MOTHER.cycle[0];
    runUntil(boss, () => boss.foundryState === 'assemble');
    run(boss, MOTHER.bays.warn + 1);
    boss.takeDamage(boss.maxHealth * (MOTHER.scrapShare - 0.02));
    expect(boss.foundryState).toBe('assemble');
    boss.takeDamage(boss.maxHealth * 0.021);
    expect(boss.foundryState).toBe('stagger');
    expect(boss.bays.every((bay) => bay.progress === 0)).toBe(true);

    runUntil(boss, () => boss.foundryState === 'vent');
    expect(system.acquireEnemyViaFactory).not.toHaveBeenCalled();
    const long = timeUntil(boss, () => boss.foundryState === 'drift');
    expect(long).toBeCloseTo(cycle.vent + MOTHER.scrapVent, 1);

    // less than that: the escorts come and the next vent is the usual one
    runUntil(boss, () => boss.foundryState === 'assemble');
    run(boss, MOTHER.bays.warn + 1);
    boss.takeDamage(boss.maxHealth * 0.04);
    runUntil(boss, () => boss.foundryState === 'vent');
    expect(system.acquireEnemyViaFactory).toHaveBeenCalledTimes(2);
    const usual = timeUntil(boss, () => boss.foundryState === 'drift');
    expect(usual).toBeCloseTo(cycle.vent, 1);
  });

  it('takes full damage while its bays are open or it vents, 30 % with a clang otherwise', () => {
    const { boss, eventBus } = createMother();
    const hit = () => {
      const before = boss.health;
      boss.takeDamage(100, { hitPosition: { x: 450, y: 300 } });
      return before - boss.health;
    };

    expect(hit()).toBeCloseTo(100 * MOTHER.shellDamageFactor);
    const sent = eventBus.emit.mock.calls.map(([name]) => name);
    expect(sent).toContain('bulwark-plate-hit');

    runUntil(boss, () => boss.foundryState === 'assemble');
    expect(hit()).toBeCloseTo(100);
    runUntil(boss, () => boss.foundryState === 'sweep');
    expect(hit()).toBeCloseTo(100 * MOTHER.shellDamageFactor);
    runUntil(boss, () => boss.foundryState === 'vent');
    expect(hit()).toBeCloseTo(100);
    run(boss, 0.5);
    expect(boss.ventOpen).toBeGreaterThan(0.9);
    expect(boss.armReach).toBe(1);
    runUntil(boss, () => boss.foundryState === 'drift');
    expect(hit()).toBeCloseTo(100 * MOTHER.shellDamageFactor);
  });

  it('hurts a ship inside a swinging arm, not one outside or during the warning', () => {
    const { boss, system } = createMother();
    runUntil(boss, () => boss.arms);
    expect(boss.arms).toMatchObject({ type: 'arms', phase: 'warn', solid: 0 });
    expect(boss.arms.segments).toHaveLength(2);
    expect(boss.arms.segments[0]).toMatchObject({
      inner: MOTHER.arms.inner,
      outer: MOTHER.arms.outer,
    });
    for (let t = 0; t < MOTHER.arms.warn - 0.05; t += STEP) {
      boss.handlePhaseIntro(STEP, onArm(boss));
    }
    expect(boss.arms.phase).toBe('warn');
    expect(system.applyDirectDamageToPlayer).not.toHaveBeenCalled();

    runUntil(boss, () => boss.arms.phase === 'sweep', onArm(boss, 300));
    run(boss, 0.5, onArm(boss, 300));
    expect(system.applyDirectDamageToPlayer).not.toHaveBeenCalled();

    boss.handlePhaseIntro(STEP, onArm(boss));
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(1);
    const [amount, hit] = system.applyDirectDamageToPlayer.mock.calls[0];
    expect(amount).toBe(
      Math.round(boss.contactDamage * MOTHER.arms.damageFactor)
    );
    expect(hit.cause).toBe('boss-arm');
    for (let t = 0; t < 0.8; t += STEP)
      boss.handlePhaseIntro(STEP, onArm(boss));
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(
      1 + Math.floor(0.8 / MOTHER.burnTick)
    );
  });

  it('swings its arms through the arc, the other way next cycle', () => {
    const { boss } = createMother();
    const arc = MOTHER.cycle[0].sweepArc * DEG;
    runUntil(boss, () => boss.arms?.phase === 'sweep');
    const first = boss.armAngle;
    runUntil(boss, () => boss.foundryState === 'vent');
    const swept = boss.armAngle - first;
    expect(swept).toBeCloseTo(arc, 1);

    runUntil(boss, () => boss.foundryState === 'drift');
    runUntil(boss, () => boss.arms?.phase === 'sweep');
    const second = boss.armAngle;
    runUntil(boss, () => boss.foundryState === 'vent');
    expect(boss.armAngle - second).toBeCloseTo(-swept, 1);
  });

  it('below half health builds faster, sweeps wider, keeps one more escort and vents shorter', () => {
    const { boss } = createMother();
    boss.health = boss.maxHealth * 0.45;
    boss.evaluatePhaseTransition();
    expect(boss.currentPhase).toBe(1);
    expect(boss.cycle()).toMatchObject({
      build: 2.2,
      escortCap: 5,
      sweepArc: 180,
      sweepTime: 2,
      vent: 2,
    });

    const step = () => boss.handlePhaseAssault(STEP, target());
    for (let t = 0; t < 20 && boss.foundryState !== 'assemble'; t += STEP) {
      step();
    }
    let building = 0;
    for (; boss.foundryState === 'assemble'; building += STEP) step();
    expect(building).toBeCloseTo(MOTHER.bays.warn + 2.2, 1);
    for (let t = 0; t < 5 && boss.arms?.phase !== 'sweep'; t += STEP) step();
    const from = boss.armAngle;
    while (boss.foundryState === 'sweep') step();
    expect(Math.abs(boss.armAngle - from)).toBeCloseTo(Math.PI, 1);
  });

  it('speaks its own lines by kind', () => {
    expect(wardenTransmission(15, 'warning', 'foundry-mother')).toEqual({
      key: 'boss:foundry-mother:warning',
      speaker: 'FOUNDRY MOTHER',
      text: 'Assembly line active. Chassis count: unfinished. Intruder count: one.',
    });
    expect(wardenTransmission(15, 'defeated', 'foundry-mother').text).toBe(
      'Foundry Mother stopped. The line is still. The count is wrong and will stay wrong.'
    );
  });
});
