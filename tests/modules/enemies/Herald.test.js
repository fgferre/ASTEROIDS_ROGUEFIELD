import { describe, expect, it, vi } from 'vitest';

import {
  HERALD_KINDS,
  HERALD_SPAWN_INVULNERABILITY,
} from '../../../src/data/enemies/herald.js';
import Herald from '../../../src/modules/enemies/types/Herald.js';
import UISystem from '../../../src/modules/UISystem.js';

const STEP = 0.05;

// System mock: the ship sits at `player`; spawned children and fired
// projectiles are recorded.
const createHerald = (heraldKind, { x = 400, y = 300, enemies = [] } = {}) => {
  const emits = [];
  const eventBus = {
    emit: vi.fn((event, payload) => emits.push({ event, payload })),
  };
  const player = { position: { x: 400, y: 520 } };
  const system = {
    eventBus,
    getCachedPlayer: () => player,
    acquireEnemyViaFactory: vi.fn((type, config) => ({ type, ...config })),
    waveManager: { registerDynamicMinion: vi.fn() },
    forEachActiveEnemy: (callback) => enemies.forEach(callback),
  };
  const herald = new Herald(system, {
    id: `herald-${heraldKind}`,
    heraldKind,
    x,
    y,
    wave: 3,
  });
  const run = (seconds) => {
    for (let t = 0; t < seconds - 1e-9; t += STEP) herald.update(STEP);
  };
  const eventsOf = (name) =>
    emits.filter((e) => e.event === name).map((e) => e.payload);
  return { herald, system, player, run, eventsOf };
};

describe('Herald', () => {
  it('is a Herald, not a Warden, and shrugs off hits for 1.5 s after spawning', () => {
    const { herald, run, eventsOf } = createHerald('dust');

    expect(herald.type).toBe('herald');
    expect(herald.displayName).toBe('Herald of Dust');
    expect(herald.maxHealth).toBe(HERALD_KINDS.dust.health);
    expect(eventsOf('herald-spawned')).toEqual([
      { kind: 'dust', x: 400, y: 300 },
    ]);

    herald.takeDamage(100);
    expect(herald.health).toBe(herald.maxHealth);
    run(HERALD_SPAWN_INVULNERABILITY + STEP);
    herald.takeDamage(100);
    expect(herald.health).toBe(herald.maxHealth - 100);
  });

  it('Dust raises a wall of 5 small rocks toward the ship every 7 s', () => {
    const { herald, system, run } = createHerald('dust', { y: 100 });
    const rocks = () => system.acquireEnemyViaFactory.mock.calls;

    run(HERALD_KINDS.dust.wallInterval - 0.2);
    expect(rocks()).toHaveLength(0);
    expect(herald.telegraphRatio).toBeGreaterThan(0.5); // the slits are lit
    run(0.3);

    expect(rocks()).toHaveLength(5);
    const ys = rocks().map(([, config]) => config.y);
    for (const [type, config] of rocks()) {
      expect(type).toBe('asteroid');
      expect(config).toMatchObject({ size: 'small', variant: 'common' });
      expect(config.spawnedBy).toBe('herald-dust');
      // one line across the way, between the Herald and the ship
      expect(config.y).toBeCloseTo(ys[0], 5);
      expect(config.y).toBeGreaterThan(herald.y);
      expect(config.y).toBeLessThan(520);
      expect(config.vy).toBeGreaterThan(0); // creeping toward the ship
    }
    expect(system.waveManager.registerDynamicMinion).toHaveBeenCalledTimes(5);
  });

  it('Heat ignites the 3 nearest rocks that are not already Volatile and fires a spread', () => {
    const rock = (x, variant = 'common') => ({
      type: 'asteroid',
      x,
      y: 300,
      variant,
      destroyed: false,
      ignite: vi.fn(),
    });
    const enemies = [
      rock(420, 'volatile'),
      rock(700),
      rock(460),
      rock(500),
      rock(150),
      rock(540),
    ];
    const { system, run, eventsOf } = createHerald('heat', { enemies });
    // No ship until just before the ignite: the Herald holds still.
    const ship = system.getCachedPlayer;
    system.getCachedPlayer = () => null;
    run(HERALD_KINDS.heat.igniteInterval - 0.1);
    system.getCachedPlayer = ship;
    run(0.1 + STEP);

    const ignited = enemies.filter((r) => r.ignite.mock.calls.length);
    expect(ignited.map((r) => r.x).sort()).toEqual([460, 500, 540]);
    const shots = eventsOf('enemy-fired');
    expect(shots).toHaveLength(HERALD_KINDS.heat.spreadShots);
    expect(shots[0].enemyType).toBe('herald');
  });

  it('Silence marks its blink with a ring, then blinks 200 px away', () => {
    const { herald, run } = createHerald('silence');
    const { blinkInterval, blinkWindup, blinkDistance } = HERALD_KINDS.silence;
    run(blinkInterval - blinkWindup - 0.1);
    herald.x = 400;
    herald.y = 300;
    expect(herald.blinkTarget).toBeNull();

    run(0.2);
    const target = herald.blinkTarget;
    expect(Math.hypot(target.x - 400, target.y - 300)).toBeCloseTo(
      blinkDistance,
      0
    );
    run(blinkWindup);

    expect(herald.x).toBe(target.x);
    expect(herald.y).toBe(target.y);
    expect(herald.blinkTarget).toBeNull();
  });

  it('Silence jams the radar while it lives (UISystem)', () => {
    const handlers = new Map();
    const hud = { showHeraldBanner: vi.fn(), setRadarJammed: vi.fn() };
    UISystem.prototype.setupEventListeners.call({
      aaaTacticalHud: hud,
      registerEventListener: (name, fn) =>
        handlers.set(name, [...(handlers.get(name) || []), fn]),
    });
    const emit = (name, payload) =>
      handlers.get(name).forEach((fn) => fn(payload));

    emit('herald-spawned', { kind: 'silence', x: 0, y: 0 });
    expect(hud.showHeraldBanner).toHaveBeenCalledWith(
      'Herald of Silence',
      HERALD_KINDS.silence.subtitle
    );
    expect(hud.setRadarJammed).toHaveBeenLastCalledWith(true);

    emit('herald-defeated', { kind: 'silence', x: 0, y: 0 });
    expect(hud.setRadarJammed).toHaveBeenLastCalledWith(false);
  });

  it('Silence steers its shard toward the ship', () => {
    const { system, player, run } = createHerald('silence');
    const bullets = [];
    system.getCachedCombat = () => ({ enemyBullets: bullets });
    system.eventBus.emit.mockImplementation((event, payload) => {
      if (event !== 'enemy-fired') return;
      bullets.push({
        enemyId: payload.enemyId,
        active: true,
        x: payload.position.x,
        y: payload.position.y,
        vx: payload.velocity.x,
        vy: payload.velocity.y,
      });
    });

    run(HERALD_KINDS.silence.shardInterval + STEP);
    const [shard] = bullets;
    expect(shard.vy).toBeGreaterThan(0); // fired at the ship below
    player.position = { x: 700, y: 300 };
    const before = Math.atan2(shard.vy, shard.vx);
    run(0.5);

    expect(Math.atan2(shard.vy, shard.vx)).toBeLessThan(before);
  });

  it('announces its defeat with its kind and position (the guaranteed drop)', () => {
    const { herald, run, eventsOf } = createHerald('heat');
    run(HERALD_SPAWN_INVULNERABILITY + STEP);

    expect(herald.takeDamage(herald.maxHealth)).toBe(true);

    expect(eventsOf('herald-defeated')).toEqual([
      { kind: 'heat', x: herald.x, y: herald.y },
    ]);
    expect(eventsOf('enemy-destroyed')).toHaveLength(1);
  });
});
