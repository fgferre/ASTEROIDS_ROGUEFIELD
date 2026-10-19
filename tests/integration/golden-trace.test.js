/**
 * Golden trace: fixed headless runs, hashed second by second, must match the fixture byte for byte.
 * Regenerate: GOLDEN_UPDATE=1 npx vitest run tests/integration/golden-trace.test.js
 * The fixture changes only in a commit that means to change behavior; a refactor must leave it alone.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import {
  createHeadlessGame,
  installDomStubs,
  STEP_SECONDS,
} from '../__helpers__/headlessGame.js';

const FIXTURE = fileURLToPath(
  new URL('../__fixtures__/golden-trace.json', import.meta.url)
);
const UPDATE = Boolean(process.env.GOLDEN_UPDATE);
const FRAMES_PER_SECOND = Math.round(1 / STEP_SECONDS);
const SECONDS = 60;
const HASH_CHARS = 12;
const WEAPON_LAYER = 9; // seven enemy kinds on the field within 20 s

const SCENARIOS = [
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `layer-${i + 1}`,
    layer: i + 1,
  })),
  { name: 'layer-17-endless', layer: 17 },
  { name: 'boss-rush', bossRush: true },
  { name: 'harmonic', layer: WEAPON_LAYER, card: 'harmonic_resonator' },
  { name: 'scatter', layer: WEAPON_LAYER, card: 'scatter_coil' },
];

function jumpToLayer(enemies, layer) {
  enemies.releaseAllAsteroidsToPool();
  enemies.waveManager.currentWave = layer - 1;
  enemies.waveManager.waveInProgress = false;
  enemies.startNextWave();
}

// Weapon cards unlock at pilot level 3: the level is lifted for the pick only.
function applyCard(progression, card) {
  const { level } = progression;
  progression.level = Math.max(level, 10);
  expect(progression.applyUpgrade(card)).toBe(true);
  progression.level = level;
}

function byTypeThenId(a, b) {
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  const [idA, idB] = [String(a.id), String(b.id)];
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

const points = (list) => list.map((item) => `${item.x},${item.y}`).join(';');

// Everything a refactor must not move, at full precision.
function frameState({ player, enemies, combat, progression, 'xp-orbs': orbs }) {
  const active = [];
  enemies.forEachActiveEnemy((enemy) => active.push(enemy));
  active.sort(byTypeThenId);
  const foes = active.map(
    (e) =>
      `${e.type},${e.x},${e.y},${e.health},${e.state ?? e.phase ?? e.currentPhase ?? e.armed ?? ''}`
  );
  return [
    `p${player.position.x},${player.position.y},${player.angle},${player.health}`,
    `e${foes.join(';')}`,
    `b${combat.bullets.length}:${points(combat.bullets)}`,
    `x${combat.enemyBullets.length}:${points(combat.enemyBullets)}`,
    `o${orbs.getActiveOrbs().length}`,
    `k${enemies.sessionStats.totalKills},${progression.totalExperience},${progression.level}`,
  ].join('|');
}

/** Plays one scenario; returns one short state hash and one event hash per second. */
function traceScenario({ layer, bossRush, card }) {
  const game = createHeadlessGame();
  const { services, eventBus } = game;
  const { player, enemies, progression } = services;

  const events = [];
  const emit = eventBus.emit.bind(eventBus);
  eventBus.emit = (name, ...args) => {
    events.push(name);
    return emit(name, ...args);
  };

  game.session.startNewRun({ source: 'test', bossRush });
  player.setInvulnerableTimer(1e9);
  if (layer) jumpToLayer(enemies, layer);
  if (card) applyCard(progression, card);

  const trace = { state: [], events: [] };
  for (let second = 0; second < SECONDS; second += 1) {
    const state = createHash('sha1');
    const names = createHash('sha1');
    for (let frame = 0; frame < FRAMES_PER_SECOND; frame += 1) {
      if (game.takeOfferedUpgrade()) {
        progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
      }
      game.step();
      state.update(`${frameState(services)}\n`);
      names.update(`${events.join(',')}\n`);
      events.length = 0;
    }
    trace.state.push(state.digest('hex').slice(0, HASH_CHARS));
    trace.events.push(names.digest('hex').slice(0, HASH_CHARS));
  }
  return trace;
}

// Second n is play time n..n+1 s. State and events are told apart: a
// deliberate event rename moves only the events.
function divergence(name, actual, expected) {
  if (!expected) {
    return `scenario ${name}: no golden trace; regenerate the fixture (header)`;
  }
  const found = [
    ['state', 'diverges'],
    ['events', 'diverge'],
  ].flatMap(([kind, verb]) => {
    const length = Math.max(actual[kind].length, expected[kind].length);
    for (let second = 0; second < length; second += 1) {
      if (actual[kind][second] !== expected[kind][second]) {
        return [`${kind} ${verb} at second ${second}`];
      }
    }
    return [];
  });
  return found.length ? `scenario ${name}: ${found.join('; ')}` : null;
}

const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
const traced = {};

describe('golden trace', () => {
  beforeEach(() => {
    const restoreDom = installDomStubs();
    for (const method of ['log', 'info', 'warn', 'error', 'debug']) {
      vi.spyOn(console, method).mockImplementation(() => {});
    }
    // The wall clock stands still: the physics spatial hash resizes on real
    // time, which reorders collisions, so a slow machine played differently.
    vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.spyOn(Date, 'now').mockReturnValue(0);
    return () => {
      GamePools.releaseAll();
      restoreDom();
    };
  });

  afterAll(() => {
    if (!UPDATE) return;
    const fixture = {};
    for (const { name } of SCENARIOS) {
      const trace = traced[name] ?? golden[name];
      if (trace) fixture[name] = trace;
    }
    writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  });

  it.each(SCENARIOS)('$name plays as recorded', (scenario) => {
    const trace = traceScenario(scenario);
    traced[scenario.name] = trace;
    if (UPDATE) return;
    const message = divergence(scenario.name, trace, golden[scenario.name]);
    if (message) throw new Error(message);
  });
});
