import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import RandomService from '../../src/core/RandomService.js';
import { listContent } from '../../src/content/registry.js';
import { HERALD_KINDS } from '../../src/data/enemies/herald.js';
import {
  SENTINEL_KINDS,
  bossKindForLayer,
} from '../../src/data/enemies/boss.js';
import { BaseEnemy } from '../../src/modules/enemies/base/BaseEnemy.js';
import { WEAPON_EVOLUTIONS } from '../../src/data/weapons.js';
import {
  freezeSpawner,
  jumpToLayer,
  spawnViaFactory,
} from '../../src/bootstrap/contentScene.js';
import { createHeadlessGame } from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

// After a Retry the fight goes on exactly where it stopped (the coordinator's
// rule, 26/11/2026, Felipe: "Não, antes"): every boss and every enemy comes
// back as it was at the death, the attack under way included, and every
// random stream stands where it stood. Each boss of the registry dies in the
// middle of an attack, each enemy type of the registry mid-life; the whole
// fight (every enemy field by field, the enemy bullets, every stream's
// position) is dumped at the death and after the real Retry path, and the
// two dumps must be equal but for EXCEPTIONS, each with its reason.

const DEATH_STEPS = 180; // the field plays on 3 s under the end screen
const WARMUP_LIMIT = 3600; // steps a boss gets to start an attack
const AFTER_STEPS = 600; // the fight played on after the Retry
const PLAYED_LAYER = 9; // a layer with every rock variant and Elites

// A Herald's strike, announced (its windup) and not yet thrown.
const heraldWindup = (b) => b.cycleTimer > 0 && b.cycleTimer <= b.cycleWindup();

// What "an attack under way" is, per boss, and the phase it is brought to
// first (the Null pulls from its second phase on). A boss of the registry
// missing here fails: say what its attack is before it can pass.
const ATTACKS = {
  prime: {
    phase: 1,
    on: (b) =>
      Boolean(b.telegraph) ||
      b.chargeState !== 'idle' ||
      b.volleyShotsRemaining > 0,
  },
  choir: {
    phase: 1,
    on: (b) => Boolean(b.telegraph) || b.chorusWindupTimer > 0,
  },
  null: { phase: 1, on: (b) => b.pullState !== 'idle' },
  sovereign: {
    phase: 1,
    on: (b) => /windup/.test(b.sovState),
  },
  gatekeeper: { on: (b) => /windup|charging/.test(b.gateState) },
  interdictor: { on: (b) => b.gridState === 'grid' },
  'kiln-engine': {
    on: (b) => b.kilnState === 'sectors' || b.kilnState === 'slag',
  },
  'quarry-maw': { on: (b) => /intake|eject/.test(b.mawState) },
  'prism-crown': { on: (b) => b.crownState === 'fire' },
  'foundry-mother': {
    on: (b, game) => b.foundryState === 'sweep' && escortsOf(game, b) > 0,
  },
  dust: { on: heraldWindup },
  heat: { on: heraldWindup },
  silence: { on: heraldWindup },
};

// What may differ after a Retry, and why. Paths are matched against the
// dump's flat keys.
const EXCEPTIONS = [
  {
    path: /^streams\.effects\.randomForks\./,
    why:
      "the Effects' draws spin and spread particles and shake the screen " +
      '(CrackEffects, EnemyEffects, VolatileEffects, Particles); nothing in ' +
      "the simulation reads them, and the death's explosions draw them in " +
      'the 3 s under the end screen',
  },
];

const escortsOf = (game, boss) => {
  let count = 0;
  game.services.enemies.forEachActiveEnemy((e) => {
    if (e.spawnedByBossId === boss.id) count += 1;
  });
  return count;
};

// What the dump cannot read and leaves to the rebuilt enemy, with why. Any
// other field holding something that is not plain data (a Map, a Set, a typed
// array, a class instance) fails the test by name: the Retry's copy skips it
// by the same rule, so it would come back wrong unseen.
const UNREAD = {
  system: 'the EnemySystem, a service: the rebuilt enemy is given the same one',
  'Symbol(ASTEROIDS_ROGUEFIELD:asteroidPoolId)':
    "its place in the pools: the snapshot's poolId, set again on the rebuilt enemy",
  'Symbol(ASTEROIDS_ROGUEFIELD:factoryRegistered)':
    "the spawner's mark of who registers it, set and cleared by the build itself",
  components:
    'built by the factory from the type at birth, the Retry rebuilds it the ' +
    'same way; no fight state in them (movement and weapon state live on the ' +
    'enemy); the dump compares their strategy and config (`built`)',
};

const isPlain = (value) => {
  const proto = Object.getPrototypeOf(value);
  return (
    proto === Object.prototype ||
    proto === null ||
    Array.isArray(value) ||
    value instanceof Set
  );
};

// Every own field of `root`, at depth. Another enemy is written `#type:id`,
// the ship `[ship]`, a stream `seed/state`; anything else that is not plain
// data is written `[Type]` and reported in `unread` unless UNREAD names it.
function fields(root, game, unread) {
  const seen = new WeakSet();
  const owner = root.constructor.name;
  const report = (field, what) => {
    if (!UNREAD[field]) unread?.add(`${owner}.${field} holds a ${what}`);
  };
  // What the Retry's copy skips on the enemy itself: a key that is a Symbol
  // or not enumerable.
  for (const key of Object.getOwnPropertySymbols(root)) {
    report(String(key), 'Symbol key');
  }
  for (const key of Object.getOwnPropertyNames(root)) {
    if (!Object.prototype.propertyIsEnumerable.call(root, key)) {
      report(key, 'hidden field');
    }
  }
  const write = (value, path) => {
    const nested = path.includes('.');
    const field = path.replace(/\.\d+(?=\.|$)/g, '[]');
    if (value === undefined) return undefined;
    // Inside plain data the copy keeps a function by reference; one of the
    // enemy's own fields that is a function it leaves to the rebuilt enemy.
    if (typeof value === 'function') {
      if (nested) return `[function ${value.name}]`;
      report(field, 'function');
      return undefined;
    }
    if (typeof value === 'number' && !Number.isFinite(value))
      return String(value);
    if (!value || typeof value !== 'object') return value;
    if (value instanceof RandomService)
      return `${value.seed >>> 0}/${value._state >>> 0}`;
    if (value === game.services.player) {
      if (!nested) report(field, 'reference to the ship');
      return '[ship]';
    }
    if (value !== root && value instanceof BaseEnemy)
      return `#${value.type}:${value.id}`;
    if (value !== root && !isPlain(value)) {
      report(field, value.constructor?.name ?? 'object');
      return `[${value.constructor?.name ?? 'object'}]`;
    }
    if (seen.has(value)) return '[seen]';
    seen.add(value);
    if (value instanceof Set)
      return { set: [...value].map((v, i) => write(v, `${path}.${i}`)) };
    if (Array.isArray(value))
      return value.map((v, i) => write(v, `${path}.${i}`));
    const out = {};
    for (const key of Object.keys(value)) {
      const written = write(value[key], path ? `${path}.${key}` : key);
      if (written !== undefined) out[key] = written;
    }
    return out;
  };
  return write(root, '');
}

// Plain objects (not frozen) reachable from `start` without entering an
// enemy (nor, with `enter`, anything not plain), each with its first path.
function plainObjects(start, label, enter) {
  const found = new Map();
  const seen = new Set();
  const stack = Object.keys(start).map((k) => [start[k], `${label}.${k}`, 1]);
  while (stack.length) {
    const [value, path, depth] = stack.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (value instanceof BaseEnemy || value instanceof RandomService) continue;
    if (value.nodeType || value === globalThis || depth > 8) continue;
    const plain = isPlain(value);
    if (!plain && !enter) continue;
    if (plain && !Object.isFrozen(value) && !found.has(value)) {
      found.set(value, path);
    }
    const entries =
      value instanceof Map || value instanceof Set
        ? [...value.entries()].map(([k, v], i) => [
            value instanceof Set ? i : k,
            v,
          ])
        : Object.keys(value).map((k) => [k, value[k]]);
    for (const [k, v] of entries) stack.push([v, `${path}.${k}`, depth + 1]);
  }
  return found;
}

// An object an enemy holds that another enemy or a system holds too: the
// Retry copies it, so the two would come back as two (the Herald of
// Silence's shards were the combat system's bullets).
function sharedWithOthers(game) {
  const { enemies, physics, combat } = game.services;
  const owners = new Map();
  const note = (map) => {
    for (const [object, path] of map) {
      if (!owners.has(object)) owners.set(object, []);
      owners.get(object).push(path);
    }
  };
  enemies.forEachActiveEnemy((e) =>
    note(plainObjects(e, `${e.type}#${e.id}`, false))
  );
  const fromEnemies = new Set(owners.keys());
  for (const [name, service] of Object.entries({ enemies, physics, combat })) {
    note(
      new Map(
        [...plainObjects(service, name, true)].filter(([o]) =>
          fromEnemies.has(o)
        )
      )
    );
  }
  return [...owners.values()]
    .filter((paths) => paths.length > 1)
    .map((paths) => paths.join(' = '));
}

// Every RandomService reachable from the services, by its shortest path.
function streams(services) {
  const found = {};
  const seen = new Set();
  let frontier = Object.keys(services)
    .sort()
    .map((k) => [k, services[k]]);
  for (let depth = 0; depth < 8 && frontier.length; depth += 1) {
    const next = [];
    for (const [path, value] of frontier) {
      if (!value || typeof value !== 'object' || seen.has(value)) continue;
      seen.add(value);
      if (value.nodeType || value === globalThis) continue;
      if (value instanceof RandomService) {
        found[path] = `${value.seed >>> 0}/${value._state >>> 0}`;
        continue;
      }
      const entries =
        value instanceof Map
          ? [...value.entries()].map(([k, v]) => [String(k), v])
          : Object.keys(value).map((k) => [k, value[k]]);
      for (const [k, v] of entries) {
        if (!v || typeof v !== 'object') continue;
        const label = v instanceof BaseEnemy ? `[${v.type}#${v.id}]` : `.${k}`;
        next.push([`${path}${label}`, v]);
      }
    }
    frontier = next;
  }
  return found;
}

// The whole fight: every enemy by id, the enemy bullets, every stream.
function dump(game, unread) {
  const enemies = {};
  game.services.enemies.forEachActiveEnemy((e) => {
    enemies[`${e.type}#${e.id}`] = {
      ...fields(e, game, unread),
      built: [...(e.components ?? [])].map(([name, c]) => [
        name,
        c.strategy ?? null,
        { ...c.config },
      ]),
    };
  });
  return {
    enemies,
    enemyBullets: game.services.combat.projectiles.enemyBullets.map((b) =>
      fields(b, game, unread)
    ),
    // The cards' effects on enemies (burns, slows, pulls) and the pull wells;
    // a burn's spread list as the enemies of it still alive.
    cards: Object.fromEntries(
      ['burns', 'slows', 'pulls'].map((name) => [
        name,
        [...game.services.combat.cards[name]].map(([enemy, entry]) =>
          fields(
            {
              enemy,
              ...entry,
              ...(entry.spreadTo && {
                spreadTo: entry.spreadTo.filter((e) => !e.destroyed),
              }),
            },
            game,
            unread
          )
        ),
      ])
    ),
    wells: game.services.combat.cards.wells.map((well) =>
      fields(well, game, unread)
    ),
    // The layer's counters: what the wave manager reports and keeps.
    layer: JSON.parse(
      JSON.stringify({
        wave: game.services.enemies.waveState,
        progress: game.services.enemies.waveManager.captureLayerProgress(),
        spawnTimer: game.services.enemies.waveManager.spawnTimer,
      })
    ),
    streams: streams(game.services),
  };
}

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (!keys.length) out[prefix] = Array.isArray(value) ? '[]' : '{}';
    keys.forEach((k) => flatten(value[k], prefix ? `${prefix}.${k}` : k, out));
  } else out[prefix] = value;
  return out;
}

function differences(before, after) {
  const a = flatten(before);
  const b = flatten(after);
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .sort()
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .filter((k) => !EXCEPTIONS.some(({ path }) => path.test(k)))
    .map((k) => `${k}: ${JSON.stringify(a[k])} -> ${JSON.stringify(b[k])}`);
}

function newGame() {
  const game = createHeadlessGame();
  game.session.startNewRun({ source: 'test' });
  game.services.player.setInvulnerableTimer(1e9);
  game.services.enemies.releaseAllAsteroidsToPool();
  return game;
}

// The layer a boss fights on, as the content scene finds it.
function layerOfBoss(id) {
  if (SENTINEL_KINDS[id]) return SENTINEL_KINDS[id].layer;
  const stage = listContent('stages').find(
    (s) => s.herald === id || (s.warden && bossKindForLayer(s.order) === id)
  );
  return stage?.order ?? 1;
}

// A Herald through the factory, a Warden or Sentinel through BossWave, as
// the layer sends them.
function spawnBoss(game, id) {
  const { enemies } = game.services;
  const layer = layerOfBoss(id);
  jumpToLayer(enemies, layer);
  enemies.releaseAllAsteroidsToPool();
  freezeSpawner(enemies.waveManager);
  if (HERALD_KINDS[id]) {
    return spawnViaFactory(enemies, 'herald', {
      heraldKind: id,
      wave: layer,
      x: 420,
      y: 260,
    });
  }
  const { bossWave } = enemies.waveManager;
  const entry = bossWave.generateBossWave().boss;
  return bossWave.spawnBossEnemy(
    { ...entry, bossKind: id, spawnPosition: { x: 420, y: 260 } },
    { enemies: [] }
  );
}

// The real path: the death, the seconds the field plays on, the end screen,
// the Retry and its 3-2-1 (the game does not step under the countdown).
function retry(game, underTheEndScreen = () => {}) {
  game.services.player.setInvulnerableTimer(0);
  game.services.world.handlePlayerDeath();
  underTheEndScreen(game);
  for (let i = 0; i < DEATH_STEPS; i += 1) game.step();
  vi.advanceTimersByTime(3000);
  const flow = game.session.retry;
  flow.retryCountdownElement = {
    textContent: '',
    isConnected: true,
    classList: { add() {}, remove() {} },
  };
  expect(flow.requestRetry({ source: 'test' })).toBe(true);
  vi.advanceTimersByTime(3000);
  expect(game.session.getScreen()).toBe('playing');
}

// A boss of the registry, brought to its attack. Returns the attack's test.
function setUpBoss(game, id) {
  const spawned = spawnBoss(game, id);
  expect(spawned, `${id} did not spawn`).toBeTruthy();
  const boss = () =>
    game.services.enemies.asteroids.find(
      (e) => e && !e.destroyed && e.id === spawned.id
    );
  const attack = ATTACKS[id];
  for (let i = 0; i < 120; i += 1) game.step();
  if (attack.phase) {
    const b = boss();
    b.health = b.maxHealth * (1 - (attack.phase + 0.5) / (b.phaseCount + 1));
    while (b.currentPhase < attack.phase) b.advancePhase();
  }
  const on = () => Boolean(boss()) && attack.on(boss(), game);
  for (let i = 0; i < WARMUP_LIMIT && boss() && !on(); i += 1) game.step();
  expect(on(), `${id} never attacked`).toBe(true);
  return on;
}

// An enemy of the registry, 5 s into its life.
function setUpEnemy(game, id) {
  freezeSpawner(game.services.enemies.waveManager);
  spawnViaFactory(game.services.enemies, id, { x: 260, y: 200 });
  for (let i = 0; i < 300; i += 1) game.step();
  return null;
}

// The death, the Retry, then 600 steps with no input. What each moment holds.
function fight(id, setUp, underTheEndScreen) {
  const game = newGame();
  const attacking = setUp(game, id);
  const unread = new Set();
  const atDeath = dump(game, unread);
  const shared = sharedWithOthers(game);
  retry(game, underTheEndScreen);
  const afterRetry = dump(game, unread);
  const errorsBefore = console.error.mock.calls.length;
  let attackEnded = !attacking;
  for (let i = 0; i < AFTER_STEPS; i += 1) {
    game.step();
    if (attacking && !attacking()) attackEnded = true;
  }
  return {
    atDeath,
    afterRetry,
    shared,
    unread: [...unread].sort(),
    errors: console.error.mock.calls.slice(errorsBefore).map(String),
    attackEnded,
    end: dump(game),
  };
}

function expectTheFightGoesOn(id, run) {
  const first = run();
  expect(first.unread).toEqual([]);
  expect(first.shared).toEqual([]);
  const lost = differences(first.atDeath, first.afterRetry);
  expect(lost.join('\n')).toBe('');
  expect(first.errors.join('\n')).toBe('');
  expect(first.attackEnded, `${id}'s attack never ended`).toBe(true);
  // The same death twice ends in the same field: nothing in the Retry hangs
  // on an iteration order or a draw outside the streams.
  expect(differences(first.end, run().end).join('\n')).toBe('');
}

// A layer played for real: its spawner on (rocks of each variant it draws,
// its enemies, Elites), the ship firing with the cards it is offered for
// 30 s; then its death with enemy shots in the air, the run's one Retry and
// 10 s more.
function playedLayer() {
  const game = newGame();
  const { enemies, progression } = game.services;
  enemies.waveManager.currentWave = PLAYED_LAYER - 1;
  enemies.waveManager.waveInProgress = false;
  enemies.startNextWave();
  const play = (steps) => {
    for (let i = 0; i < steps; i += 1) {
      if (game.takeOfferedUpgrade()) {
        progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
      }
      game.step();
    }
  };
  play(1800);
  // The death comes with enemy shots in the air.
  const { combat } = game.services;
  for (let i = 0; i < 1800 && !combat.projectiles.enemyBullets.length; i += 1)
    play(1);
  const kills = enemies.sessionStats.totalKills;
  const unread = new Set();
  const atDeath = dump(game, unread);
  const shared = sharedWithOthers(game);
  retry(game);
  const lost = differences(atDeath, dump(game, unread));
  game.services.player.setInvulnerableTimer(1e9);
  play(AFTER_STEPS);
  return {
    kills,
    shots: atDeath.enemyBullets.length,
    unread: [...unread].sort(),
    shared,
    lost,
    end: dump(game),
  };
}

const bossIds = listContent('bosses').map(({ id }) => id);
const enemyIds = ['asteroid', ...listContent('enemies').map(({ id }) => id)];

describe('a Retry continues the fight where it stopped', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, m).mockImplementation(() => {});
    }
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return restoreDom;
  });
  afterEach(() => {
    vi.useRealTimers();
    GamePools.releaseAll();
    vi.restoreAllMocks();
  });

  it('knows the attack of every boss in the registry', () => {
    expect(bossIds.filter((id) => !ATTACKS[id])).toEqual([]);
  });

  it('sees a changed clock and an object two hold (the same dump twice is equal)', () => {
    const game = newGame();
    const spawned = spawnBoss(game, 'prime');
    for (let i = 0; i < 120; i += 1) game.step();
    const a = dump(game);
    expect(differences(a, dump(game))).toEqual([]);
    spawned.spreadTimer += 1;
    expect(differences(a, dump(game))).toHaveLength(1);
    expect(sharedWithOthers(game)).toEqual([]);
    spawned.held = game.services.combat.projectiles.enemyBullets;
    expect(sharedWithOthers(game)).toHaveLength(1);
  });

  it.each(bossIds)('boss %s, killed mid-attack', (id) => {
    expectTheFightGoesOn(id, () => fight(id, setUpBoss));
  });

  it.each(enemyIds)('enemy %s, killed mid-life', (id) => {
    expectTheFightGoesOn(id, () => fight(id, setUpEnemy));
  });

  it.each(['prime', 'foundry-mother'])(
    'boss %s, the ship killed during its entrance',
    (id) => {
      // Untouchable as it enters, but the step it is born in comes before
      // its first update: the death is forced there.
      const entering = (game) => {
        const boss = spawnBoss(game, id);
        game.step();
        expect(boss.arrival).toBeTruthy();
        return null;
      };
      expectTheFightGoesOn(id, () => fight(id, entering));
    }
  );

  it('the cards burning, slowing and pulling enemies keep at it', () => {
    // The calls the cards make on a hit (HitResolution): a Foundry Mother
    // and an escort burning (the Solar Flare's spread list), an escort
    // slowed, another pulled into a Singularity well; a little later, the
    // death.
    const withCards = (game) => {
      const on = setUpBoss(game, 'foundry-mother');
      const { cards } = game.services.combat;
      const field = [];
      game.services.enemies.forEachActiveEnemy((e) => field.push(e));
      const boss = field.find((e) => e.type === 'boss');
      const [first, second] = field.filter((e) => e.type === 'drone');
      cards.ignite(boss, 40, WEAPON_EVOLUTIONS.thermal.burn, []);
      cards.ignite(first, 40, WEAPON_EVOLUTIONS.thermal.burn, null);
      cards.slows.set(first, {
        id: first.id,
        timer: WEAPON_EVOLUTIONS.field.slow.duration,
      });
      cards.pullToward(second, true, second.x + 40, second.y);
      for (let i = 0; i < 20; i += 1) game.step();
      expect(cards.burns.size + cards.slows.size + cards.pulls.size).toBe(4);
      return on;
    };
    expectTheFightGoesOn('foundry-mother', () =>
      fight('foundry-mother', withCards)
    );
  });

  it('a random scope first opened under the end screen is gone after the Retry', () => {
    // A type of enemy first born in the seconds the field plays on after the
    // death opens its scope then; the Retry brings back the scopes there
    // were at the death, no other.
    const newcomer = (game) =>
      spawnViaFactory(game.services.enemies, 'hunter', { x: 600, y: 120 });
    expectTheFightGoesOn('drone', () => fight('drone', setUpEnemy, newcomer));
  });

  it('a heart, a pickup, a chest and XP orbs on the field keep their streams', () => {
    // Laid in the corners, far from the ship, by the calls the drops make; a
    // heart holds a stream of its own, the others draw from their system's.
    // Each stream has drawn, so one brought back to its seed alone shows.
    const onTheField = (game) => {
      const { enemies, healthHearts, pickups } = game.services;
      const xpOrbs = game.services['xp-orbs'];
      freezeSpawner(enemies.waveManager);
      // A second into the run: no death comes before the first steps.
      for (let i = 0; i < 60; i += 1) game.step();
      const random = new RandomService('retry:heart');
      random.range(0, 1);
      healthHearts.spawnHeart(120, 100, { random, pulsePhase: 1 });
      pickups.spawnPickup('magnet', 680, 100);
      pickups.chests.spawn('warden', 120, 500);
      for (let i = 0; i < 3; i += 1) xpOrbs.createXPOrb(680 + i * 20, 500, 5);
      const dumped = Object.values(streams(game.services));
      const drawn = [
        random,
        pickups.random,
        pickups.chestRandom,
        xpOrbs.randomForks.creation,
      ];
      for (const stream of drawn) {
        expect(stream._state).not.toBe(stream.seed);
        expect(dumped).toContain(`${stream.seed >>> 0}/${stream._state >>> 0}`);
      }
      return null;
    };
    expectTheFightGoesOn('field', () => fight('field', onTheField));
  });

  // Two whole layers played: 4 s alone, but over 20 s when the machine runs
  // several suites at once, so this case has its own, generous limit.
  it('a layer played with cards, killed and retried', () => {
    const first = playedLayer();
    expect(first.kills).toBeGreaterThan(0);
    expect(first.shots).toBeGreaterThan(0);
    expect(first.unread).toEqual([]);
    expect(first.shared).toEqual([]);
    expect(first.lost.join('\n')).toBe('');
    expect(differences(first.end, playedLayer().end).join('\n')).toBe('');
  }, 90_000);
});
