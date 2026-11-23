// The card bench: does a card (or a family's form at 3 and 5 cards) change
// the fight with each weapon? The real game, headless, the ship parked at the
// left facing right, the spawner frozen, a fixed field of rocks; each case is
// run twice, without and with what is measured, and every counter compared.
//
//   CARD_BENCH_OUT=/path.json npx vitest run --config vitest.playtest.config.js tests/playtest/cardBench.playtest.js
//   CARD_BENCH_ONLY=furnace-corona   one weapon
//   CARD_BENCH_CARDS=plasma,heat_sink only these cards (families: family:thermal)
//
// Three fields: `pack`, the same rocks as `tank` in a tight group ahead;
// `tank`, wounded rocks that do not die (so the hits pile up the
// same way both times; wounded so Ballast Rounds has something to finish),
// and `crowd`, rocks that die (kills, orbs, kill sparks). `moving`: the ship
// flies at its top speed in place (Momentum Rounds). Dashes are the
// player-dashed event every 2 s (Gyro Servos).
import { writeFileSync } from 'node:fs';
import { afterAll, beforeEach, describe, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { listContent } from '../../src/content/registry.js';
import {
  freezeSpawner,
  spawnViaFactory,
  NO_LEVEL_UP_XP,
} from '../../src/bootstrap/contentScene.js';
import { SECTORS } from '../../src/data/sectors.js';
import UPGRADE_LIBRARY from '../../src/data/upgrades/index.js';
import {
  createHeadlessGame,
  STEP_SECONDS,
} from '../__helpers__/headlessGame.js';
import { installDomStubs } from '../__helpers__/domStubs.js';

const SECONDS = Number(process.env.CARD_BENCH_SECONDS || 10);
const OUT = process.env.CARD_BENCH_OUT || '';
const ONLY = process.env.CARD_BENCH_ONLY || '';
const CARDS = (process.env.CARD_BENCH_CARDS || '').split(',').filter(Boolean);
const FIELDS = (process.env.CARD_BENCH_FIELDS || 'tank,crowd,pack').split(',');
// World seeds, one run each: '1' or a range '1-3' (moving targets differ by seed).
const [seedFrom, seedTo = seedFrom] = (process.env.CARD_BENCH_SEEDS || '1')
  .split('-')
  .map(Number);
const SEEDS = Array.from(
  { length: seedTo - seedFrom + 1 },
  (_, i) => seedFrom + i
);
const SHIP = { x: 160, y: 300 };
const realTimeout = globalThis.setTimeout;
const breathe = () => new Promise((resolve) => realTimeout(resolve, 0));

// Near the ship (aura, orbit, Close Quarters), a line ahead (pierce, range,
// Afterburn), off the line (spread, chains).
const TANK = [
  [230, 300],
  [160, 230],
  [160, 370],
  [95, 300],
  [300, 300],
  [380, 300],
  [470, 300],
  [580, 300],
  [700, 300],
  [400, 190],
  [400, 410],
  [560, 150],
  [560, 450],
  [300, 240],
  [300, 360],
];
// A tight pack ahead (bursts, forks, pierce through a crowd), wounded and tanky.
const PACK = [];
for (let row = -2; row <= 2; row += 1) {
  for (let col = 0; col < 4; col += 1)
    PACK.push([330 + col * 34, 300 + row * 34]);
}
// Machines that fly and shoot (the ship cannot die): a target that moves.
const DRONES = [
  [420, 160],
  [420, 440],
  [560, 300],
  [300, 120],
  [300, 480],
  [650, 200],
  [650, 400],
  [240, 300],
];
// Elite machines (or plain ones, `ring`) and a herald held round the ship, in reach of every weapon
// (the threat focus of the Targeting Matrix only counts on these).
const RING = [
  [240, 300],
  [160, 215],
  [160, 385],
  [90, 300],
];
const CROWD = [];
for (let row = 0; row < 6; row += 1) {
  for (let col = 0; col < 7; col += 1) {
    CROWD.push([215 + col * 80, 70 + row * 92]);
  }
}
CROWD.push([160, 225], [160, 375], [90, 300]);

const weapons = listContent('weapons');
const byId = new Map(UPGRADE_LIBRARY.map((card) => [card.id, card]));

function applyCard(progression, id, ranks = Infinity) {
  const card = byId.get(id);
  for (const { type, id: need, level = 1 } of card.prerequisites ?? []) {
    if (type !== 'upgrade') continue;
    while (progression.getUpgradeCount(need) < level) {
      if (!applyCard(progression, need, 1)) break;
    }
  }
  let applied = 0;
  const pilotLevel = progression.level;
  progression.level = 99;
  // Bounded by the ranks: a fallback card (Hull Patch) never counts as held.
  while (
    applied < Math.min(ranks, card.levels.length) &&
    progression.getUpgradeCount(id) < card.levels.length &&
    progression.applyUpgrade(id)
  ) {
    applied += 1;
  }
  progression.level = pilotLevel;
  return applied;
}

// The card's prerequisites and its ranks' (Targeting Matrix rank 3 asks for
// Multishot), so the case reaches its last rank.
function prerequisitesOf(id, out = []) {
  const card = byId.get(id);
  const all = [
    ...(card.prerequisites ?? []),
    ...card.levels.flatMap((level) => level.prerequisites ?? []),
  ];
  for (const { type, id: need } of all) {
    if (type === 'upgrade' && !out.includes(need)) {
      prerequisitesOf(need, out);
      out.push(need);
    }
  }
  return out;
}

function count(map, key, by = 1) {
  map[key] = (map[key] || 0) + by;
}

function run({
  weapon,
  cards = [],
  family = null,
  stage = 0,
  field,
  moving,
  seed = 1,
}) {
  const game = createHeadlessGame();
  const { services, eventBus, session } = game;
  const { player, enemies, progression, combat } = services;
  session.resolveServiceInstance('difficulty').runSeed = seed;
  session.startNewRun({ source: 'test', sector: SECTORS[0].id });
  progression.experienceToNext = NO_LEVEL_UP_XP;
  enemies.releaseAllAsteroidsToPool();
  freezeSpawner(enemies.waveManager);
  player.setInvulnerableTimer(1e9);

  const m = { events: {} };
  const weaponCard = weapons.find((w) => w.id === weapon)?.card;
  if (weaponCard) applyCard(progression, weaponCard.id);
  for (const id of cards) applyCard(progression, id);
  if (family) {
    eventBus.emit('synergy-unlocked', { family });
    if (stage >= 5) eventBus.emit('apex-unlocked', { family });
  }
  m.ranks = Object.fromEntries(
    cards.map((id) => [id, progression.getUpgradeCount(id)])
  );
  m.weaponId = combat.weapons.weapon.id;
  m.form = combat.weapons.weapon.form?.id ?? null;
  m.evolutions = [...combat.weapons.evolutions];
  m.synergies = [...progression.activeSynergies];

  const layout =
    {
      crowd: CROWD,
      pack: PACK,
      drones: DRONES,
      elites: RING,
      ring: RING,
      herald: RING,
    }[field] ?? TANK;
  const held = ['elites', 'ring', 'herald'].includes(field);
  const rocks = (field === 'herald' ? RING.slice(0, 1) : layout).map(
    ([x, y]) => {
      if (field === 'herald') {
        const herald = spawnViaFactory(enemies, 'herald', {
          heraldKind: 'dust',
          x,
          y,
        });
        herald.maxHealth = 4e5;
        herald.health = 1e5;
        return { rock: herald, x, y };
      }
      if (['drones', 'elites', 'ring'].includes(field)) {
        const drone = spawnViaFactory(enemies, 'drone', {
          x,
          y,
          elite: field === 'elites',
        });
        drone.maxHealth = 4e5;
        drone.health = 1e5;
        return { rock: drone, x, y };
      }
      const rock = spawnViaFactory(enemies, 'asteroid', {
        size: field === 'crowd' ? 'small' : 'medium',
        variant: 'common',
        x,
        y,
        vx: 0,
        vy: 0,
      });
      if (field !== 'crowd') {
        rock.maxHealth = 4e5;
        rock.health = 1e5;
      }
      return { rock, x, y };
    }
  );

  m.elites = rocks.filter(({ rock }) => rock.elite).length;
  const applyDamage = enemies.applyDamage.bind(enemies);
  const hitSet = new Set();
  m.damage = 0;
  m.hits = 0;
  m.reach = 0;
  enemies.applyDamage = (enemy, damage, options) => {
    m.damage += Number.isFinite(damage) ? damage : 0;
    m.hits += 1;
    hitSet.add(enemy);
    m.reach = Math.max(
      m.reach,
      Math.round(Math.hypot(enemy.x - SHIP.x, enemy.y - SHIP.y))
    );
    return applyDamage(enemy, damage, options);
  };
  const emit = eventBus.emit.bind(eventBus);
  eventBus.emit = (name, payload) => {
    count(m.events, name);
    return emit(name, payload);
  };
  const { cards: fx } = combat;
  for (const name of ['ignite', 'pullToward', 'chainFrom', 'addArc']) {
    const original = fx[name].bind(fx);
    fx[name] = (...args) => {
      count(m, name);
      return original(...args);
    };
  }
  const prospector = combat.hits.dropProspectorOrbs.bind(combat.hits);
  combat.hits.dropProspectorOrbs = (rewards, enemy, dropped) => {
    count(m, 'prospector');
    count(m, 'prospectorDropped', dropped);
    return prospector(rewards, enemy, dropped);
  };
  const slowSet = fx.slows.set.bind(fx.slows);
  fx.slows.set = (...args) => {
    count(m, 'slow');
    return slowSet(...args);
  };
  m.wells = 0;
  const killsBefore = enemies.sessionStats.totalKills;
  // Every orb made, the Prospector's extras too (they skip the drop stats).
  const { rewardManager } = enemies;
  const createXPOrbs = rewardManager.createXPOrbs.bind(rewardManager);
  m.orbs = 0;
  rewardManager.createXPOrbs = (enemy, orbCount, ...rest) => {
    m.orbs += Math.max(orbCount, 1);
    return createXPOrbs(enemy, orbCount, ...rest);
  };

  const frames = Math.round(SECONDS / STEP_SECONDS);
  const topSpeed = player.flight.maxSpeed;
  for (let frame = 0; frame < frames; frame += 1) {
    player.position.x = SHIP.x;
    player.position.y = SHIP.y;
    player.angle = 0;
    player.velocity.vx = moving ? topSpeed : 0;
    player.velocity.vy = 0;
    if (frame > 0 && frame % Math.round(2 / STEP_SECONDS) === 0) {
      eventBus.emit('player-dashed', {});
    }
    if (held) {
      for (const { rock, x, y } of rocks) {
        rock.x = x;
        rock.y = y;
      }
    }
    game.step();
    m.wells = Math.max(m.wells, fx.wells.length);
  }
  m.kills = enemies.sessionStats.totalKills - killsBefore;
  m.hitEnemies = hitSet.size;
  m.moved = Math.round(
    rocks.reduce(
      (sum, { rock, x, y }) =>
        sum + (rock.destroyed ? 0 : Math.hypot(rock.x - x, rock.y - y)),
      0
    )
  );
  m.damage = Math.round(m.damage);
  return m;
}

const results = [];
const baselines = new Map();
const chosenWeapons = weapons
  .map((w) => w.id)
  .filter((id) => !ONLY || ONLY.split(',').includes(id));
const benchCards = UPGRADE_LIBRARY.filter(
  (card) => !card.weaponId && (!CARDS.length || CARDS.includes(card.id))
).map((card) => card.id);
// 'a+b+c' in CARD_BENCH_CARDS: one case with those cards together (a family
// reached by real cards).
const combos = CARDS.filter((id) => id.includes('+'));
const families = ['thermal', 'kinetic', 'arc', 'field', 'salvage'].filter(
  (f) => !CARDS.length || CARDS.includes(`family:${f}`)
);

describe('card bench', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Plain no-ops, not spies: a spy keeps every call, and debug logging
    // prints every emit.
    const quiet = ['log', 'info', 'warn', 'error', 'debug'].map((method) => {
      const original = console[method];
      console[method] = () => {};
      return () => (console[method] = original);
    });
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return () => {
      quiet.forEach((restore) => restore());
      vi.useRealTimers();
      vi.restoreAllMocks();
      GamePools.releaseAll();
      restoreDom();
    };
  });

  afterAll(() => {
    if (OUT) writeFileSync(OUT, JSON.stringify(results, null, 1));
    process.stdout.write(`card bench: ${results.length} cases\n`);
  });

  const cases = [];
  for (const weapon of chosenWeapons) {
    for (const field of FIELDS) {
      for (const seed of SEEDS) {
        for (const id of [...benchCards, ...combos]) {
          cases.push({ weapon, field, seed, card: id });
        }
        for (const family of families) {
          for (const stage of [3, 5])
            cases.push({ weapon, field, seed, family, stage });
        }
      }
    }
    if (benchCards.includes('momentum_rounds')) {
      cases.push({
        weapon,
        field: 'tank',
        card: 'momentum_rounds',
        moving: true,
      });
    }
  }
  it.each(cases.map((c) => [JSON.stringify(c), c]))('%s', async (_, c) => {
    await breathe();
    const own = c.card ? c.card.split('+') : [];
    const base = [...new Set(own.flatMap((id) => prerequisitesOf(id)))].filter(
      (id) => !own.includes(id)
    );
    const common = {
      weapon: c.weapon,
      field: c.field,
      moving: c.moving,
      seed: c.seed,
    };
    const key = JSON.stringify({ ...common, base });
    if (!baselines.has(key))
      baselines.set(key, run({ ...common, cards: base }));
    const without = baselines.get(key);
    const withIt = c.card
      ? run({ ...common, cards: [...base, ...own] })
      : run({ ...common, cards: base, family: c.family, stage: c.stage });
    results.push({ ...c, prerequisites: base, without, with: withIt });
  });
});
