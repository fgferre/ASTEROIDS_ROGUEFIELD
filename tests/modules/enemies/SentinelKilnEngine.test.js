import { describe, expect, it, vi } from 'vitest';

import { BOSS_KINDS, WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import { wardenTransmission } from '../../../src/modules/ui/transmissions.js';
import SentinelKilnEngine from '../../../src/modules/enemies/types/SentinelKilnEngine.js';

const KILN = BOSS_KINDS['kiln-engine'];
const STEP = 1 / 60;
const SHIP = { x: 600, y: 300 };

const createKiln = (x = 400, y = 300) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const system = {
    dependencies: { eventBus },
    applyDirectDamageToPlayer: vi.fn(),
  };
  const boss = new SentinelKilnEngine(system);
  boss.initialize({ id: 'kiln-test', x, y, wave: KILN.layer });
  return { boss, system, eventBus };
};

const target = (position = SHIP, velocity = { vx: 0, vy: 0 }) => ({
  position: { ...position },
  player: { velocity },
});

const run = (boss, seconds, aim = target()) => {
  for (let t = 0; t < seconds; t += STEP) boss.handlePhaseIntro(STEP, aim);
};

const runUntil = (boss, test, aim = target(), limit = 20) => {
  for (let t = 0; t < limit && !test(); t += STEP) {
    boss.handlePhaseIntro(STEP, aim);
  }
};

// The middle of wedge `i` of the boss's sectors, `distance` px out.
const inWedge = (boss, i, distance = 150) => {
  const s = boss.sectors;
  const angle = s.angle + ((i + 0.5) * Math.PI * 2) / s.count;
  return {
    x: s.x + Math.cos(angle) * distance,
    y: s.y + Math.sin(angle) * distance,
  };
};

describe('Sentinel Kiln Engine', () => {
  it('is a Sentinel boss with 65 % of Warden Choir’s health on layer 10', () => {
    const { boss } = createKiln();
    const base = 1500 * 1.2 ** (KILN.layer - 1);
    const choir = base * WARDEN_KINDS.choir.healthFactor;

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('kiln-engine');
    expect(boss.tier).toBe('sentinel');
    expect(boss.displayName).toBe('Kiln Engine');
    expect(KILN.layer).toBe(10);
    expect(boss.maxHealth).toBe(Math.ceil(base * KILN.healthFactor));
    expect(boss.maxHealth / choir).toBeCloseTo(0.65, 3);
  });

  it('burns the ship only in a hot wedge, only while burning, a tick at a time', () => {
    const { boss, system } = createKiln();
    runUntil(boss, () => boss.sectors);
    const s = boss.sectors;
    expect(s.phase).toBe('warn');
    // wedge 0 is centred on the ship and burns first
    expect(boss.sectorAt(SHIP)).toBe(0);
    expect(boss.sectorHot(SHIP)).toBe(true);
    expect(boss.sectorHot(inWedge(boss, 1))).toBe(false);

    const hot = target(inWedge(boss, 2));
    run(boss, s.duration - 0.05, hot);
    expect(system.applyDirectDamageToPlayer).not.toHaveBeenCalled();

    run(boss, 0.1, hot);
    expect(s.phase).toBe('burn');
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(1);
    expect(system.applyDirectDamageToPlayer.mock.calls[0][1].cause).toBe(
      'boss-heat'
    );
    run(boss, 1, hot);
    const ticks = system.applyDirectDamageToPlayer.mock.calls.length;
    expect(ticks).toBe(1 + Math.floor(1 / KILN.burnTick));

    run(boss, 0.5, target(inWedge(boss, 3)));
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(ticks);
  });

  it('steps the hot wedges over by one, with a shorter warning', () => {
    const { boss } = createKiln();
    runUntil(boss, () => boss.sectors?.phase === 'burn');
    const s = boss.sectors;
    const before = boss.sectorHot(inWedge(boss, 0));
    runUntil(boss, () => s.phase === 'warn');
    expect(s.offset).toBe(1);
    expect(s.duration).toBe(KILN.cycle[0].sectorStepWarn);
    expect(boss.sectorHot(inWedge(boss, 0))).toBe(!before);
    expect(boss.sectorHot(inWedge(boss, 1))).toBe(before);
  });

  it('lands slag pools that burn only inside and only once landed, then cool', () => {
    const { boss, system } = createKiln();
    runUntil(boss, () => boss.kilnState === 'slag');
    expect(boss.pools).toHaveLength(KILN.cycle[0].slagShots);
    const [pool] = boss.pools;
    expect(pool).toMatchObject({ phase: 'warn', radius: KILN.slag.radius });
    system.applyDirectDamageToPlayer.mockClear();
    const onPool = target(pool);

    run(boss, KILN.cycle[0].slagFlight - 0.05, onPool);
    expect(system.applyDirectDamageToPlayer).not.toHaveBeenCalled();
    run(boss, 0.1, onPool);
    expect(pool.phase).toBe('burn');
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(1);
    expect(boss.poolAt(pool)).toBe(pool);
    const edge = { x: pool.x, y: pool.y - pool.radius - 1 };
    expect(boss.poolAt(edge)).not.toBe(pool);

    run(boss, KILN.cycle[0].poolBurn, target({ x: 790, y: 590 }));
    expect(boss.pools).toHaveLength(0);
  });

  it('soaks hits with its shell shut and takes them all while venting', () => {
    const { boss, eventBus } = createKiln();
    const hit = () => {
      const before = boss.health;
      boss.takeDamage(100, { hitPosition: { x: 450, y: 300 } });
      return before - boss.health;
    };

    expect(hit()).toBeCloseTo(100 * KILN.shellDamageFactor);
    const sent = eventBus.emit.mock.calls.map(([name]) => name);
    expect(sent).toContain('bulwark-plate-hit');

    runUntil(boss, () => boss.venting);
    expect(hit()).toBeCloseTo(100);
    run(boss, 0.5);
    expect(boss.ventOpen).toBeGreaterThan(0.5);
    runUntil(boss, () => !boss.venting);
    expect(boss.kilnState).toBe('drift');
    expect(hit()).toBeCloseTo(100 * KILN.shellDamageFactor);
  });

  it('below half health burns three times, lobs one more shot and vents shorter', () => {
    const { boss } = createKiln();
    boss.health = boss.maxHealth * 0.45;
    boss.evaluatePhaseTransition();
    expect(boss.currentPhase).toBe(1);
    expect(boss.cycle().vent).toBeLessThan(KILN.cycle[0].vent);

    let burns = 0;
    let phase = null;
    for (let t = 0; t < 30 && boss.kilnState !== 'slag'; t += STEP) {
      boss.handlePhaseAssault(STEP, target());
      const now = boss.sectors?.phase ?? null;
      if (now === 'burn' && phase !== 'burn') burns += 1;
      phase = now;
    }
    expect(burns).toBe(3);
    expect(boss.pools).toHaveLength(KILN.cycle[0].slagShots + 1);
  });

  it('speaks its own lines by kind', () => {
    expect(wardenTransmission(10, 'warning', 'kiln-engine')).toEqual({
      key: 'sentinel:kiln-engine:warning',
      speaker: 'KILN ENGINE',
      text: 'Furnace lit. Core temperature rising. One hull, unlisted, entering the fire.',
    });
    expect(wardenTransmission(10, 'defeated', 'kiln-engine').text).toBe(
      'Kiln Engine cold. Heat released: all of it. Seams: one, opening.'
    );
  });
});
