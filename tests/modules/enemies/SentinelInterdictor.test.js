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

  it('cages the ship with a doorway in the side that faces it, the first one wider', () => {
    const { boss } = createInterdictor();
    runUntil(boss, () => boss.grid);
    const first = boss.grid;
    const { first: lesson } = INTERDICTOR.grid;
    expect(first).toMatchObject({
      type: 'grid',
      size: INTERDICTOR.cycle[0].size,
      phase: 'warn',
      door: lesson.door,
      closeTime: lesson.closeTime,
    });
    // three sides and the doorway's two stubs
    expect(first.fences).toHaveLength(5);
    expect(first.posts).toHaveLength(4);
    // the left side is the nearest to a boss at (400, 300)
    expect(first.open).toBe(3);
    const [a, b] = first.fences.slice(3);
    const gap = Math.hypot(b.x1 - a.x2, b.y1 - a.y2);
    expect(gap).toBeCloseTo(lesson.door);
    runUntil(boss, () => boss.gridState === 'rest');
    runUntil(boss, () => boss.gridState === 'grid');
    expect(boss.grid.door).toBe(INTERDICTOR.cycle[0].door);
    expect(boss.grid.closeTime).toBe(INTERDICTOR.cycle[0].closeTime);
  });

  it('draws the cage round where a moving ship is heading', () => {
    const { boss } = createInterdictor();
    const flying = target({ x: 100, y: 100 });
    flying.player.velocity = { vx: 0, vy: 200 };
    runUntil(boss, () => boss.grid, flying);
    expect(boss.grid.y).toBeCloseTo(100 + 200 * INTERDICTOR.grid.lead);
    // kept inside the field
    expect(boss.grid.x).toBeCloseTo(boss.grid.size / 2);
  });

  it('slides the cage clear of its own body, so that it can close', () => {
    const { boss } = createInterdictor();
    const near = target({ x: 480, y: 310 });
    runUntil(boss, () => boss.grid, near);
    const { x, y, size, closes } = boss.grid;
    expect(closes).toBe(true);
    expect(
      Math.max(Math.abs(boss.x - x), Math.abs(boss.y - y))
    ).toBeGreaterThanOrEqual(size / 2 + boss.radius);
    // the ship is still inside it
    expect(Math.abs(near.position.x - x)).toBeLessThan(size / 2);
    expect(Math.abs(near.position.y - y)).toBeLessThan(size / 2);
  });

  it('throws its four emitters out to the corners, then calls them home', () => {
    const { boss } = createInterdictor();
    expect(boss.emitters).toHaveLength(4);
    const docked = boss.emitters.map((e) => ({ ...e }));
    docked.forEach((e) => {
      expect(e.docked).toBe(true);
      expect(Math.hypot(e.x - boss.x, e.y - boss.y)).toBeCloseTo(
        boss.radius * INTERDICTOR.grid.dock
      );
    });
    runUntil(boss, () => boss.grid);
    const grid = boss.grid;
    run(boss, INTERDICTOR.grid.deploy / 2, target(grid));
    expect(boss.emitters.every((e) => !e.docked && e.lift > 0.5)).toBe(true);
    runUntil(boss, () => grid.phase === 'solid', target(grid));
    boss.emitters.forEach((e, i) => {
      expect(e.x).toBeCloseTo(grid.posts[i].x, 0);
      expect(e.y).toBeCloseTo(grid.posts[i].y, 0);
    });
    runUntil(boss, () => !boss.grid, target(grid));
    expect(boss.emitters.every((e) => !e.docked)).toBe(true);
    run(boss, INTERDICTOR.grid.recall + 0.05, target(grid));
    expect(boss.emitters.map((e) => e.docked)).toEqual([
      true,
      true,
      true,
      true,
    ]);
  });

  it('announces its attack once a cage, as it turns solid', () => {
    const { boss, eventBus } = createInterdictor();
    const attacks = () =>
      eventBus.emit.mock.calls.filter(
        ([name]) => name === 'boss-attack-started'
      );
    runUntil(boss, () => boss.grid);
    expect(attacks()).toHaveLength(0);
    runUntil(boss, () => boss.grid.phase === 'solid', target(boss.grid));
    expect(attacks()).toHaveLength(1);
    expect(attacks()[0][1].enemy).toBe(boss);
    expect(attacks()[0][1].position).toEqual({ x: boss.x, y: boss.y });
    runUntil(boss, () => boss.gridState === 'rest');
    expect(attacks()).toHaveLength(1);
    runUntil(boss, () => boss.grid?.phase === 'solid');
    expect(attacks()).toHaveLength(2);
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

  it('hurts a ship on a fence once and pushes it back, never across the doorway', () => {
    const { boss, system } = createInterdictor();
    runUntil(boss, () => boss.grid);
    const grid = boss.grid;
    const closed = (grid.open + 2) % 4;
    const fence = target(sideMiddle(grid, closed));
    run(boss, INTERDICTOR.grid.deploy, fence);
    expect(hits(system, 'boss-barrier')).toBe(0);

    runUntil(boss, () => grid.phase === 'solid', target(grid));
    const door = target(sideMiddle(grid, grid.open));
    boss.handlePhaseIntro(STEP, door);
    expect(hits(system, 'boss-barrier')).toBe(0);
    expect(door.player.velocity).toEqual({ vx: 0, vy: 0 });

    // just inside the fence (the solid cage closes in a little each step)
    const edge = sideMiddle(grid, closed);
    const inside = {
      x: edge.x + Math.sign(grid.x - edge.x) * 4,
      y: edge.y + Math.sign(grid.y - edge.y) * 4,
    };
    const pressed = target(inside);
    boss.handlePhaseIntro(STEP, pressed);
    expect(hits(system, 'boss-barrier')).toBe(1);
    // pushed back into the cage, away from that fence
    const inward = { x: grid.x - inside.x, y: grid.y - inside.y };
    const v = pressed.player.velocity;
    expect(v.vx * inward.x + v.vy * inward.y).toBeGreaterThan(0);
    // held on it, it does not hurt again within the grace
    run(boss, INTERDICTOR.grid.grace - 0.1, target(inside));
    expect(hits(system, 'boss-barrier')).toBe(1);
  });

  it('spits a ship squeezed in a closing cage out of the doorway, not back and forth', () => {
    const { boss, system } = createInterdictor(100, 100);
    runUntil(boss, () => boss.grid);
    const grid = boss.grid;
    runUntil(boss, () => grid.phase === 'solid', target(grid));
    // nearly closed: the ship touches two opposite fences at once
    runUntil(boss, () => grid.size < 40, target(grid));
    const caught = target({ x: grid.x + 3, y: grid.y + 2 });
    boss.handlePhaseIntro(STEP, caught);
    const door = sideMiddle(grid, grid.open);
    const out = { x: door.x - grid.x, y: door.y - grid.y };
    const v = caught.player.velocity;
    const along = (v.vx * out.x + v.vy * out.y) / Math.hypot(out.x, out.y);
    expect(along).toBeGreaterThanOrEqual(INTERDICTOR.grid.push * 0.99);
    expect(hits(system, 'boss-barrier')).toBe(1);
  });

  it('pushes a ship behind the back fence of a nearly closed cage away, not through it', () => {
    const { boss } = createInterdictor(100, 100);
    runUntil(boss, () => boss.grid);
    const grid = boss.grid;
    runUntil(boss, () => grid.phase === 'solid', target(grid));
    runUntil(boss, () => grid.size < 40, target(grid));
    // 5 px outside the side opposite the doorway, on its middle
    const back = sideMiddle(grid, (grid.open + 2) % 4);
    const away = { x: back.x - grid.x, y: back.y - grid.y };
    const length = Math.hypot(away.x, away.y);
    const spot = {
      x: back.x + (away.x / length) * 5,
      y: back.y + (away.y / length) * 5,
    };
    // the back fence and both side fences' ends touch it
    expect(boss.fencesHit(spot).length).toBeGreaterThanOrEqual(3);
    const behind = target(spot);
    boss.handlePhaseIntro(STEP, behind);
    const v = behind.player.velocity;
    expect((v.vx * away.x + v.vy * away.y) / length).toBeGreaterThanOrEqual(
      INTERDICTOR.grid.push * 0.99
    );
  });

  it('never opens the doorway on the field’s edge, even in a corner', () => {
    // its body in a cage clamped into the bottom-left corner: the nearest
    // side to it is the left one, on the field's edge
    const { boss } = createInterdictor(80, 500);
    boss.beginGrid(boss.cycle(), { x: 40, y: 560 });
    const grid = boss.grid;
    expect(grid.closes).toBe(false);
    expect(grid.x - grid.size / 2).toBe(0);
    expect(grid.y + grid.size / 2).toBe(GAME_HEIGHT);
    const door = sideMiddle(grid, grid.open);
    expect(door.x).toBeGreaterThan(0);
    expect(door.y).toBeLessThan(GAME_HEIGHT);
  });

  it('closes the solid cage round its centre, the doorway still open', () => {
    const { boss } = createInterdictor(100, 100);
    runUntil(boss, () => boss.grid);
    const grid = boss.grid;
    const { x, y, open, full } = grid;
    runUntil(boss, () => grid.phase === 'solid', target(grid));
    expect(grid.size).toBeCloseTo(full, 0);
    runUntil(boss, () => grid.phase === 'fade', target(grid));
    expect(grid.size).toBeCloseTo(full * INTERDICTOR.grid.close, 0);
    expect(grid).toMatchObject({ x, y, open });
    // narrower than the doorway, the side has no stubs left
    expect(grid.fences).toHaveLength(3);
  });

  it('does not close a cage it cannot slide clear of its own body', () => {
    const { boss } = createInterdictor(200, 300);
    const near = target({ x: 150, y: 300 });
    runUntil(boss, () => boss.grid, near);
    const grid = boss.grid;
    expect(grid.closes).toBe(false);
    runUntil(boss, () => grid.phase === 'fade', near);
    expect(grid.size).toBe(grid.full);
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

  it('fires one locked beam in its first cage, two after, three below half health in a smaller cage', () => {
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
    expect(count(boss)).toBe(1);
    expect(count(boss)).toBe(2);

    const late = createInterdictor().boss;
    late.cages = 1;
    late.health = late.maxHealth * 0.45;
    late.evaluatePhaseTransition();
    expect(late.currentPhase).toBe(1);
    expect(late.cycle()).toMatchObject({
      size: INTERDICTOR.cycle[0].size - 40,
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
      key: 'boss:interdictor:warning',
      speaker: 'THE INTERDICTOR',
      text: 'Quarantine holds. Boundary drawn. You are inside it.',
    });
    expect(wardenTransmission(15, 'defeated', 'interdictor').text).toBe(
      'Interdictor offline. The boundary is open. Null has been waiting for this.'
    );
  });
});
