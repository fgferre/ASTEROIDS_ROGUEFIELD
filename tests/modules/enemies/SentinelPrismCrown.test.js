import { describe, expect, it, vi } from 'vitest';

import { BOSS_KINDS, WARDEN_KINDS } from '../../../src/data/enemies/boss.js';
import { wardenTransmission } from '../../../src/modules/ui/transmissions.js';
import SentinelPrismCrown, {
  distanceToSegment,
  segmentToEdge,
} from '../../../src/modules/enemies/types/SentinelPrismCrown.js';

const CROWN = BOSS_KINDS['prism-crown'];
const STEP = 1 / 60;
const SHIP = { x: 650, y: 420 };

const createCrown = (x = 400, y = 300) => {
  const eventBus = { on: vi.fn(), off: vi.fn(), emit: vi.fn() };
  const system = {
    dependencies: { eventBus },
    applyDirectDamageToPlayer: vi.fn(),
  };
  const boss = new SentinelPrismCrown(system);
  boss.initialize({ id: 'crown-test', x, y, wave: CROWN.layer });
  return { boss, system, eventBus };
};

const target = (position = SHIP) => ({
  position: { ...position },
  player: { velocity: { vx: 0, vy: 0 } },
});

const run = (boss, seconds, aim = target()) => {
  for (let t = 0; t < seconds; t += STEP) boss.handlePhaseIntro(STEP, aim);
};

const runUntil = (boss, test, aim = target(), limit = 20) => {
  for (let t = 0; t < limit && !test(); t += STEP) {
    boss.handlePhaseIntro(STEP, aim);
  }
};

const midpoint = ({ x1, y1, x2, y2 }) => ({
  x: (x1 + x2) / 2,
  y: (y1 + y2) / 2,
});

describe('Sentinel Prism Crown', () => {
  it('measures a point against a segment and runs a ray to the field edge', () => {
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
    expect(distanceToSegment(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5);
    expect(distanceToSegment(2, 2, 1, 1, 1, 1)).toBeCloseTo(Math.SQRT2);
    expect(segmentToEdge(400, 300, 0)).toMatchObject({ x2: 800, y2: 300 });
    const up = segmentToEdge(400, 300, -Math.PI / 2);
    expect(up.x2).toBeCloseTo(400);
    expect(up.y2).toBeCloseTo(0);
    const corner = segmentToEdge(700, 500, Math.PI / 4);
    expect(corner.x2).toBeCloseTo(800);
    expect(corner.y2).toBeCloseTo(600);
  });

  it('is a Sentinel boss with 70 % of Warden Choir’s health on layer 10', () => {
    const { boss } = createCrown();
    const base = 1500 * 1.2 ** (CROWN.layer - 1);
    const choir = base * WARDEN_KINDS.choir.healthFactor;

    expect(boss.type).toBe('boss');
    expect(boss.bossKind).toBe('prism-crown');
    expect(boss.tier).toBe('sentinel');
    expect(boss.displayName).toBe('Prism Crown');
    expect(boss.maxHealth).toBe(Math.ceil(base * CROWN.healthFactor));
    expect(boss.maxHealth / choir).toBeCloseTo(0.7, 3);
  });

  it('shows three separated paths, one through the ship, and hurts nothing while warning', () => {
    const { boss, system } = createCrown();
    runUntil(boss, () => boss.beams);
    const { beams, mirrors } = boss;
    expect(beams).toMatchObject({ type: 'prism', phase: 'warn', solid: 0 });
    expect(mirrors).toHaveLength(3);
    expect(beams.segments).toHaveLength(6);
    const near = beams.segments.some(
      (s) => distanceToSegment(SHIP.x, SHIP.y, s.x1, s.y1, s.x2, s.y2) < 5
    );
    expect(near).toBe(true);
    const turn = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    mirrors.forEach((a, i) =>
      mirrors.slice(i + 1).forEach((b) => {
        const gap = turn(a.angle - b.angle);
        expect(Math.min(gap, Math.PI * 2 - gap)).toBeGreaterThanOrEqual(
          (50 * Math.PI) / 180
        );
      })
    );

    run(boss, beams.duration - 0.05);
    expect(boss.beams.phase).toBe('warn');
    expect(system.applyDirectDamageToPlayer).not.toHaveBeenCalled();
  });

  it('fires along the shown paths, hurting a ship on a beam and not one between', () => {
    const { boss, system } = createCrown();
    runUntil(boss, () => boss.beams);
    const shown = boss.beams.segments.map((s) => ({ ...s }));
    runUntil(boss, () => boss.beams.phase === 'burn');
    // the default ship stands on mirror 0's beam: it was hit as it lit
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(1);
    system.applyDirectDamageToPlayer.mockClear();
    boss.beams.segments.forEach((s, i) => {
      expect(s.x2).toBeCloseTo(shown[i].x2, 0);
      expect(s.y2).toBeCloseTo(shown[i].y2, 0);
    });

    // between beams: the field point farthest from every segment
    const clearance = (p) =>
      Math.min(
        ...boss.beams.segments.map((s) =>
          distanceToSegment(p.x, p.y, s.x1, s.y1, s.x2, s.y2)
        )
      );
    let between = null;
    for (let x = 40; x < 800; x += 40) {
      for (let y = 40; y < 600; y += 40) {
        if (!between || clearance({ x, y }) > clearance(between)) {
          between = { x, y };
        }
      }
    }
    expect(clearance(between)).toBeGreaterThan(60);
    expect(boss.inBeam(between)).toBe(false);
    run(boss, 0.5, target(between));
    expect(system.applyDirectDamageToPlayer).not.toHaveBeenCalled();

    const onBeam = () => target(midpoint(boss.beams.segments[1]));
    boss.handlePhaseIntro(STEP, onBeam());
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(1);
    const [amount, hit] = system.applyDirectDamageToPlayer.mock.calls[0];
    expect(amount).toBe(
      Math.round(boss.contactDamage * CROWN.beam.damageFactor)
    );
    expect(hit.cause).toBe('boss-beam');
    for (let t = 0; t < 1; t += STEP) boss.handlePhaseIntro(STEP, onBeam());
    expect(system.applyDirectDamageToPlayer).toHaveBeenCalledTimes(
      1 + Math.floor(1 / CROWN.burnTick)
    );
  });

  it('turns the whole arrangement while burning, the other way next volley', () => {
    const { boss } = createCrown();
    runUntil(boss, () => boss.beams?.phase === 'burn');
    const first = boss.crownTurn;
    run(boss, 1);
    const swept = boss.crownTurn - first;
    expect(swept).toBeCloseTo((CROWN.cycle[0].sweep * Math.PI) / 180, 1);
    expect(boss.beams.phase).toBe('burn');

    runUntil(boss, () => boss.crownState === 'drift');
    runUntil(boss, () => boss.beams?.phase === 'burn');
    const second = boss.crownTurn;
    run(boss, 1);
    expect(boss.crownTurn - second).toBeCloseTo(-swept, 3);
  });

  it('soaks hits in its core and takes them all while resting, mirrors spread', () => {
    const { boss, eventBus } = createCrown();
    const hit = () => {
      const before = boss.health;
      boss.takeDamage(100, { hitPosition: { x: 450, y: 300 } });
      return before - boss.health;
    };

    expect(hit()).toBeCloseTo(100 * CROWN.coreDamageFactor);
    const sent = eventBus.emit.mock.calls.map(([name]) => name);
    expect(sent).toContain('bulwark-plate-hit');

    runUntil(boss, () => boss.resting);
    expect(boss.beams).toBeNull();
    expect(hit()).toBeCloseTo(100);
    run(boss, 0.6);
    expect(boss.crownOpen).toBeGreaterThan(0.9);
    runUntil(boss, () => !boss.resting);
    expect(boss.crownState).toBe('drift');
    expect(hit()).toBeCloseTo(100 * CROWN.coreDamageFactor);
  });

  it('below half health turns four mirrors faster and rests shorter', () => {
    const { boss } = createCrown();
    boss.health = boss.maxHealth * 0.45;
    boss.evaluatePhaseTransition();
    expect(boss.currentPhase).toBe(1);
    expect(boss.cycle().rest).toBeLessThan(CROWN.cycle[0].rest);
    expect(boss.cycle().sweep).toBeGreaterThan(CROWN.cycle[0].sweep);

    for (let t = 0; t < 20 && !boss.beams; t += STEP) {
      boss.handlePhaseAssault(STEP, target());
    }
    expect(boss.mirrors).toHaveLength(4);
    expect(boss.beams.segments).toHaveLength(8);
  });

  it('speaks its own lines by kind', () => {
    expect(wardenTransmission(10, 'warning', 'prism-crown')).toEqual({
      key: 'boss:prism-crown:warning',
      speaker: 'PRISM CROWN',
      text: 'Six voices sleep in the crystal. The Crown still carries their note.',
    });
    expect(wardenTransmission(10, 'defeated', 'prism-crown').text).toBe(
      'The Crown is dark. The note has stopped. The seam has not.'
    );
  });
});
