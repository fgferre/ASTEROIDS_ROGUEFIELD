// The card matrix: every card the game can offer is measured, not just read.
//
// ALWAYS (a few seconds): every card and every rank has a probe; the draw
// never offers a card that could do nothing; every Hangar item has a probe; and
// the probes of tests/__helpers__/cardProbes.js, at the default axis (the
// Lance, classic flight), move the number the card's text promises, rank
// against the rank below (verdict WORKS, tests/__helpers__/cardVerdict.js).
//
// FULL (`CARDS_FULL`: CARTAS_COMPLETA=1 npm test -- tests/modules/upgrades.matrix.test.js):
// every probe on every axis (all weapons, both flights), the draw over 300
// seeds, and the Hangar items measured against the same run without them.
//
// A cell may be excused ONLY by an entry of EXCUSES below, with the card, the
// rank, the weapon and the reason. Anything else that fails stays failing.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import RandomService from '../../src/core/RandomService.js';
import {
  HANGAR_ITEMS,
  CONTROL_ITEMS,
  LICENSES,
} from '../../src/data/hangar.js';
import { pickChestCard } from '../../src/modules/collectibles/chestRewards.js';
import {
  CARDS,
  DEFAULT_WEAPON,
  WEAPONS,
  WEAPON_CARD_OF,
  SHIP,
  STEP_SECONDS,
  createScene,
  promiseText,
  quietWorld,
} from '../__helpers__/cardScene.js';
import { trailSteps } from '../../src/data/upgrades/index.js';
import { PROBES } from '../__helpers__/cardProbes.js';
import { verdict } from '../__helpers__/cardVerdict.js';
import { resolveService } from '../../src/core/serviceUtils.js';

const CARDS_FULL = process.env.CARTAS_COMPLETA === '1';
const FLIGHTS = ['classic', 'modern'];

// === Excuses: the only way a failing cell is allowed to stay ===
// { card, rank, weapon, reason }. `rank` and `weapon` may be '*'.
const NOT_A_DEFECT = 'judged "not a defect" in the findings (25/11)';
// `metric` (optional): only the probes whose metric text contains it.
const EXCUSES = [
  {
    card: 'targeting_suite',
    rank: 2,
    weapon: 'seeker-swarm',
    reason: `${NOT_A_DEFECT}: finding 3, the text says the missiles steer themselves anyway`,
  },
  {
    card: 'targeting_suite',
    rank: 2,
    weapon: 'harmonic',
    reason: `${NOT_A_DEFECT}: finding 3, the beam aims without lead and the lances between do improve`,
  },
  // Limits of the probe, not of the card (its own notMeasured note says why).
  {
    card: 'targeting_suite',
    rank: 3,
    weapon: 'seeker-swarm',
    metric: 'enemies hit per volley',
    reason:
      'probe limit: this scene cannot tell which lock a missile hit came from',
  },
  {
    card: 'afterburn_lance',
    rank: '*',
    weapon: 'scatter',
    metric: 'damage',
    reason:
      "probe limit: the bonus rides the bolt's own hit, and this scene does not split it from the bursts",
  },
];

// The new flight already holds the Flight Computer's way at the ranks it asks
// (Propulsors 1, RCS System 3, Braking System 3, Auto Turret 1): in that
// flight only the ranks above those can be measured; the rest are measured in
// the classic one.
const TRAIL = trailSteps([...CARDS.values()]);

const excuseOf = (card, rank, weapon, metric = '') =>
  EXCUSES.find(
    (e) =>
      e.card === card &&
      (e.rank === '*' || e.rank === rank) &&
      (e.weapon === '*' || e.weapon === weapon) &&
      (!e.metric || metric.includes(e.metric))
  );

// === Cells: one probe, one axis, one rank, in twin scenes ===
const weaponsOf = (probe) =>
  WEAPONS.filter((weapon) => !probe.skipWeapons?.includes(weapon));

function axesOf(probe, full) {
  if (probe.flightsOnly) {
    return probe.flightsOnly.map((flight) => ({
      weapon: DEFAULT_WEAPON,
      flight,
    }));
  }
  if (!full) return [{ weapon: DEFAULT_WEAPON, flight: 'classic' }];
  if (probe.axes === 'weapons') {
    return weaponsOf(probe).map((weapon) => ({ weapon, flight: 'classic' }));
  }
  if (probe.axes === 'flights') {
    return FLIGHTS.map((flight) => ({ weapon: DEFAULT_WEAPON, flight }));
  }
  if (probe.axes === 'weapons+flights') {
    return [
      ...weaponsOf(probe).map((weapon) => ({ weapon, flight: 'classic' })),
      { weapon: DEFAULT_WEAPON, flight: 'modern' },
    ];
  }
  return [{ weapon: DEFAULT_WEAPON, flight: 'classic' }];
}

const metricName = (probe, weapon) =>
  probe.metricOverride ||
  (typeof probe.metric === 'function' ? probe.metric(weapon) : probe.metric);

const read = (probe, result) =>
  probe.read ? result.extra?.[probe.read] ?? 0 : result.value;

function measureAt({ id, probe, rank, weapon, flight, cellRank }) {
  const scene = createScene({
    weapon,
    flight,
    cards: [...(probe.setup ?? []), [id, rank]],
  });
  if (probe.engage && rank > 0) scene.eventBus.emit('modern-flight-engaged');
  const reached =
    rank === 0 ? scene.progression.getUpgradeCount(id) : scene.reached[id];
  const ctx = {
    weapon,
    flight,
    rank,
    cellRank,
    maxHealth: scene.player.maxHealth,
  };
  const result = probe.measure(scene, ctx);
  return {
    scene,
    reached: reached ?? 0,
    value: read(probe, result),
    trigger: result.trigger,
    extra: result.extra ?? null,
  };
}

// Fallback cards are spent on the pick: measured in one scene, before and after.
function measureFallback(id) {
  const scene = createScene();
  if (id === 'hull_patch') {
    scene.player.health = scene.player.maxHealth / 2;
    const before = scene.player.health;
    scene.progression.level = 99;
    scene.progression.applyUpgrade(id);
    return {
      a: 0,
      b: scene.player.health - before,
      e: scene.player.maxHealth * 0.25,
    };
  }
  const hangar = resolveService('hangar', scene.game.session.services);
  const before = hangar.cacheSalvage;
  scene.progression.level = 99;
  scene.progression.applyUpgrade(id);
  return { a: 0, b: hangar.cacheSalvage - before, e: 'more' };
}

const ranksOfProbe = (probe, card) =>
  probe.ranks ?? Array.from({ length: card.levels.length }, (_, i) => i + 1);

// Every failing cell of one card, as readable lines (excused ones are left out).
function measureCard(id, full) {
  const card = CARDS.get(id);
  const failures = [];
  for (const probe of PROBES[id]) {
    if (probe.measureAfterApply) {
      const r = measureFallback(id);
      const v = verdict({
        a: r.a,
        b: r.b,
        e: r.e,
        tol: 1,
        promisesChange: true,
      });
      if (v !== 'WORKS' && !excuseOf(id, 1, DEFAULT_WEAPON)) {
        failures.push(
          `${id} rank 1 (${metricName(probe)}): ${v}, ${r.a} -> ${r.b}, promised ${r.e}`
        );
      }
      continue;
    }
    for (const axis of axesOf(probe, full)) {
      for (const rank of ranksOfProbe(probe, card)) {
        if (axis.flight === 'modern' && rank <= (TRAIL.get(id) ?? 0)) continue;
        if (excuseOf(id, rank, axis.weapon, metricName(probe, axis.weapon)))
          continue;
        const where = `${id} rank ${rank}, ${axis.weapon}, ${axis.flight} flight (${metricName(probe, axis.weapon)})`;
        const base = {
          id,
          probe,
          weapon: axis.weapon,
          flight: axis.flight,
          cellRank: rank,
        };
        let A;
        let B;
        try {
          A = measureAt({ ...base, rank: rank - 1 });
          B = measureAt({ ...base, rank });
        } catch (error) {
          failures.push(`${where}: NOT MEASURED, error: ${error.message}`);
          continue;
        }
        if (A.reached !== rank - 1 || B.reached !== rank) {
          failures.push(
            `${where}: UNREACHABLE, holds rank ${A.reached}/${B.reached}, needed ${rank - 1}/${rank}`
          );
          continue;
        }
        if (!A.trigger || !B.trigger) {
          failures.push(`${where}: NOT MEASURED, trigger count 0`);
          continue;
        }
        if (probe.notMeasured?.(axis)) {
          failures.push(`${where}: NOT MEASURED, ${probe.notMeasured(axis)}`);
          continue;
        }
        const e = probe.expect
          ? probe.expect(rank, A.value, {
              weapon: axis.weapon,
              flight: axis.flight,
              maxHealth: B.scene.player.maxHealth,
              extraA: A.extra,
            })
          : null;
        const tol = probe.tol ?? 0;
        const v = verdict({
          a: A.value,
          b: B.value,
          e,
          tol,
          promisesChange:
            typeof e === 'number'
              ? Math.abs(e - A.value) > tol + 1e-9
              : e !== A.value,
        });
        if (v !== 'WORKS') {
          failures.push(
            `${where}: ${v}, ${A.value} -> ${B.value}, promised ${e} ("${promiseText(id, rank, axis.weapon)}")`
          );
        }
      }
    }
  }
  return failures;
}

let restore;
beforeEach(() => {
  restore = quietWorld();
});
afterEach(() => restore());

// === (c) every card and every rank has a probe ===
describe('card probes exist', () => {
  it('every card and every rank of the catalog has a probe', () => {
    const missing = [];
    for (const [id, card] of CARDS) {
      const probes = PROBES[id];
      if (!probes?.length) {
        missing.push(`${id}: no probe at all (ranks 1-${card.levels.length})`);
        continue;
      }
      for (let rank = 1; rank <= card.levels.length; rank += 1) {
        const covered = probes.some(
          (p) => p.measureAfterApply || ranksOfProbe(p, card).includes(rank)
        );
        if (!covered) missing.push(`${id}: rank ${rank} has no probe`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('no probe belongs to a card that is not in the catalog', () => {
    expect(Object.keys(PROBES).filter((id) => !CARDS.has(id))).toEqual([]);
  });
});

// === (d) the draw ===
const LEVELS = 40;
const SEEDS = CARDS_FULL ? 300 : 100;
const WEAPON_CARDS = Object.values(WEAPON_CARD_OF);
const POLICIES = [
  'random',
  ...WEAPON_CARDS.map((id) => `weapon:${id}`),
  'new',
  'rank',
];

// Why this option could do nothing here, from the catalog's data (empty: fine).
function deadReasons(state, id, deadFor) {
  const card = CARDS.get(id);
  const held = state.held[id] ?? 0;
  const reasons = [];
  if (card.fallback) {
    if (id === 'hull_patch' && state.health >= state.maxHealth) {
      reasons.push('Hull Patch at full hull: repairs nothing');
    }
    if (!state.slotsFull) reasons.push('fallback offered with slots free');
    return reasons;
  }
  if (held >= card.levels.length) reasons.push('already at its top rank');
  if (Number.isFinite(card.unlockLevel) && state.level < card.unlockLevel) {
    reasons.push(`unlocks at level ${card.unlockLevel}`);
  }
  const needs = [
    ...(card.prerequisites ?? []),
    ...(card.levels[held]?.prerequisites ?? []),
  ];
  for (const { type, id: need, level = 1 } of needs) {
    if (type === 'upgrade' && (state.held[need] ?? 0) < level) {
      reasons.push(`needs ${need} ${level}`);
    }
  }
  for (const [other, rank] of Object.entries(state.held)) {
    if (
      rank > 0 &&
      other !== id &&
      ((card.excludes ?? []).includes(other) ||
        (CARDS.get(other)?.excludes ?? []).includes(id))
    ) {
      reasons.push(`ruled out by ${other}`);
    }
  }
  if (!state.pilot.includes(id) && state.open && !state.open.includes(id)) {
    reasons.push('outside the hangar contract');
  }
  if (!state.pilot.includes(id) && state.sealed.includes(id))
    reasons.push('sealed');
  if (state.slotsFull && held === 0 && !state.pilot.includes(id)) {
    reasons.push('new card with the slots full');
  }
  if (deadFor?.includes(state.weapon) && state.pilot.length > 0) {
    reasons.push(`declared dead for ${state.weapon}`);
  }
  return reasons;
}

function snapshot(scene, level) {
  const { progression, player } = scene;
  return {
    level,
    held: Object.fromEntries(
      [...progression.appliedUpgrades].filter(([, r]) => r > 0)
    ),
    weapon: progression.currentWeaponId(),
    flight: player.controlScheme,
    health: player.health,
    maxHealth: player.maxHealth,
    slotsFull: progression.slotsFull(),
    pilot: [...progression.pilotCardIds],
    open: progression.openCards ? [...progression.openCards] : null,
    sealed: [...progression.sealedCards],
  };
}

function drawFailures(seeds) {
  const dead = new Map();
  let options = 0;
  const note = (state, id, extra, reasons) => {
    const rank = (state.held[id] ?? 0) + 1;
    const key = `${id} rank ${rank}, ${state.weapon}: ${reasons.join(', ')}`;
    if (excuseOf(id, rank, state.weapon)) return;
    if (!dead.has(key))
      dead.set(key, `${key}${extra} (first seen at level ${state.level})`);
  };
  for (let seed = 1; seed <= seeds; seed += 1) {
    const policy = POLICIES[seed % POLICIES.length];
    // Odd seeds: every card open (all licences); even: a fresh save's draw.
    const allOpen = seed % 2 === 1;
    const scene = createScene({
      seed,
      hangar: (hangar) => {
        if (allOpen) LICENSES.forEach(({ id }) => (hangar.licenses[id] = true));
      },
    });
    const { progression, player, eventBus } = scene;
    const rng = new RandomService(seed * 7919);
    if (progression.randomForks) {
      progression.randomForks.selection = new RandomService(seed * 104729);
    }
    for (let level = 2; level <= LEVELS; level += 1) {
      progression.level = level;
      // A third of the levels with the hull hurt.
      player.health =
        rng.float() < 0.33
          ? Math.ceil(player.maxHealth * 0.6)
          : player.maxHealth;
      const { options: offered } = progression.prepareUpgradeOptions(3, {
        level,
      });
      const ids = offered.map((o) => o.id);
      // After the offer: a trail step the weapon never needs is installed by it.
      const state = snapshot(scene, level);
      for (const id of ids) {
        options += 1;
        const reasons = deadReasons(state, id, CARDS.get(id).deadFor);
        if (reasons.length) note(state, id, '', reasons);
      }
      // A chest at this level (granted, not chosen), before the pick.
      const chest = pickChestCard(progression, rng);
      if (chest) {
        const reasons = deadReasons(
          state,
          chest.id,
          CARDS.get(chest.id).deadFor
        );
        if (reasons.length) note(state, chest.id, ' [chest]', reasons);
      }
      if (!ids.length) continue;
      let pick;
      if (policy.startsWith('weapon:'))
        pick = ids.find((id) => id === policy.slice(7));
      if (policy === 'new') pick = ids.find((id) => !state.held[id]);
      if (policy === 'rank') pick = ids.find((id) => state.held[id]);
      const pool = policy.startsWith('weapon:')
        ? ids.filter((id) => !WEAPON_CARDS.includes(id))
        : ids;
      pick ??= pool.length ? pool[rng.int(0, pool.length - 1)] : ids[0];
      const flightBefore = player.controlScheme;
      progression.applyUpgrade(pick);
      if (pick === 'flight_computer' && flightBefore !== 'modern') {
        eventBus.emit('modern-flight-engaged');
      }
    }
  }
  return { failures: [...dead.values()], options };
}

describe('the draw', () => {
  it(`over ${SEEDS} seeds x ${LEVELS} levels offers no card that could do nothing`, () => {
    const { failures, options } = drawFailures(SEEDS);
    expect(options).toBeGreaterThan(SEEDS * 20);
    expect(failures).toEqual([]);
  }, 600000);
});

// === (e) Hangar items ===
const own = (ids, extra) => (hangar, game) => {
  ids.forEach((id) => (hangar.owned[id] = true));
  extra?.(hangar, game);
};

function dashGap(s) {
  const times = [];
  s.onEvent = (name) => name === 'player-dashed' && times.push(s.time);
  s.run(6, (sc) => {
    sc.park();
    sc.press.add('dash');
  });
  return times.length > 1 ? times[1] - times[0] : 0;
}
function magnetReach(s) {
  const xp = s.services['xp-orbs'];
  s.run(0.1, (sc) => sc.park());
  let reach = 0;
  for (let d = 20; d <= 400; d += 2) {
    const orb = xp.createXPOrb(SHIP.x + d, SHIP.y, 1);
    const before = orb.x;
    xp.update(STEP_SECONDS);
    if (orb.x !== before) reach = d;
    xp.consumeOrb(orb);
  }
  return reach;
}
// Offers over 60 level-ups: how many show `id`.
function everOffered(s, id) {
  let seen = 0;
  for (let level = 2; level < 62; level += 1) {
    s.progression.level = level;
    const { options } = s.progression.prepareUpgradeOptions(3, { level });
    if (options.some((o) => o.id === id)) seen += 1;
  }
  return seen;
}
function rerolls(s) {
  s.progression.level = 5;
  s.progression.prepareUpgradeOptions(3, { level: 5 });
  let n = 0;
  while (n < 20 && s.progression.rerollUpgradeOptions()) n += 1;
  return n;
}
function banishes(s) {
  s.progression.level = 5;
  s.progression.prepareUpgradeOptions(3, { level: 5 });
  let n = 0;
  while (
    n < 20 &&
    s.progression.pendingUpgradeOptions.length &&
    s.progression.banishUpgrade(s.progression.pendingUpgradeOptions[0].id)
  ) {
    n += 1;
  }
  return n;
}
function holds(s) {
  let n = 0;
  for (let level = 5; level < 15; level += 1) {
    s.progression.level = level;
    const { options } = s.progression.prepareUpgradeOptions(3, { level });
    if (options.length > 1 && s.progression.holdUpgrade(options[0].id)) n += 1;
    s.progression.applyUpgrade(options[options.length - 1].id);
  }
  return n;
}

// [metric, read(scene), expected(base), extra hangar setup, tol, prerequisite items]
const HANGAR_CASES = {
  'reinforced-plating': [
    'max hull',
    (s) => s.player.maxHealth,
    (a) => a * 1.05,
    null,
    1,
  ],
  'spare-capacitor': [
    'rerolls the level-up screen grants',
    rerolls,
    (a) => a + 1,
  ],
  'field-ledger': [
    'banishes the level-up screen grants',
    banishes,
    (a) => a + 1,
  ],
  'dash-coils': [
    'seconds between two dashes, dash held',
    dashGap,
    (a) => a * 0.9,
    null,
    0.034,
  ],
  'salvage-magnet': [
    'farthest orb the magnet moves (px)',
    magnetReach,
    (a) => a * 1.15,
    null,
    2,
  ],
  'solar-slicer-hull': [
    'max hull with the hull selected',
    (s) => s.player.maxHealth,
    () => 'less',
    (h, g) =>
      g.services.settings.setSetting(
        'gameplay',
        'selectedHull',
        'solar-slicer'
      ),
  ],
  'bastion-hull': [
    'max hull with the hull selected',
    (s) => s.player.maxHealth,
    () => 'more',
    (h, g) =>
      g.services.settings.setSetting('gameplay', 'selectedHull', 'bastion'),
  ],
  'reroll-1': ['rerolls the level-up screen grants', rerolls, (a) => a + 1],
  'reroll-2': [
    'rerolls granted (with Reroll I)',
    rerolls,
    (a) => a + 1,
    null,
    0,
    ['reroll-1'],
  ],
  'reroll-3': [
    'rerolls granted (with Reroll I, II)',
    rerolls,
    (a) => a + 1,
    null,
    0,
    ['reroll-1', 'reroll-2'],
  ],
  'banish-1': ['banishes the level-up screen grants', banishes, (a) => a + 1],
  'banish-2': [
    'banishes granted (with Banish I)',
    banishes,
    (a) => a + 1,
    null,
    0,
    ['banish-1'],
  ],
  'banish-3': [
    'banishes granted (with Banish I, II)',
    banishes,
    (a) => a + 1,
    null,
    0,
    ['banish-1', 'banish-2'],
  ],
  'seal-1': [
    'level-ups (of 60) offering Plasma, sealed',
    (s) => everOffered(s, 'plasma'),
    () => 0,
    (h) => (h.sealed = ['plasma']),
  ],
  'seal-2': [
    'level-ups (of 60) offering Heat Sink, sealed second (with Seal 1)',
    (s) => everOffered(s, 'heat_sink'),
    () => 0,
    (h) => (h.sealed = ['plasma', 'heat_sink']),
    0,
    ['seal-1'],
  ],
  hold: ['holds granted over 10 level-ups', holds, (a) => a + 1],
  'flight-school': [
    'Main Thrusters rank at run start (chosen card)',
    (s) => s.progression.getUpgradeCount('propulsors'),
    (a) => a + 1,
    (h) => (h.startingCard = 'propulsors'),
  ],
};

const ALL_HANGAR_ITEMS = [...HANGAR_ITEMS, ...CONTROL_ITEMS];

describe('hangar items', () => {
  it('every Hangar item has a probe', () => {
    expect(
      ALL_HANGAR_ITEMS.filter((item) => !HANGAR_CASES[item.id]).map(
        (item) => item.id
      )
    ).toEqual([]);
    expect(
      Object.keys(HANGAR_CASES).filter(
        (id) => !ALL_HANGAR_ITEMS.some((i) => i.id === id)
      )
    ).toEqual([]);
  });

  describe.skipIf(!CARDS_FULL)('measured (full)', () => {
    for (const item of ALL_HANGAR_ITEMS) {
      it(
        item.id,
        () => {
          const c = HANGAR_CASES[item.id];
          const [metric, readIt, expectIt, extra, tol = 0, base = []] = c;
          const a = readIt(createScene({ hangar: own(base, extra) }));
          const b = readIt(
            createScene({ hangar: own([...base, item.id], extra) })
          );
          const e = expectIt(a);
          const v = verdict({ a, b, e, tol, promisesChange: true });
          expect(
            v === 'WORKS'
              ? []
              : [`${item.id} (${metric}): ${v}, ${a} -> ${b}, promised ${e}`]
          ).toEqual([]);
        },
        120000
      );
    }
  });
});

// === (a/b) the probes ===
describe('the probes at the default axis (Lance, classic flight)', () => {
  for (const id of Object.keys(PROBES)) {
    it(
      id,
      () => {
        expect(measureCard(id, false)).toEqual([]);
      },
      120000
    );
  }
});

describe.skipIf(!CARDS_FULL)(
  'the probes on every axis (all weapons, both flights)',
  () => {
    for (const id of Object.keys(PROBES)) {
      it(
        id,
        () => {
          expect(measureCard(id, true)).toEqual([]);
        },
        600000
      );
    }
  }
);
