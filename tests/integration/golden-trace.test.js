/**
 * Golden trace: fixed headless runs, hashed second by second, must match the fixture byte for byte.
 * Regenerate: GOLDEN_UPDATE=1 npx vitest run tests/integration/golden-trace.test.js
 * The fixture changes only in a commit that means to change behavior; a refactor must leave it alone.
 * It holds on the CPU architecture it was recorded on (`arch`, today the owner's arm64 Mac): Math.sin,
 * cos, exp and friends may differ in the last bit on another architecture (CI runs on x64), and a
 * minute of play amplifies that into a different run. There, each scenario must play the same twice.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { BASTION_HULL_ID } from '../../src/data/shipModels.js';
import {
  createHeadlessGame,
  installDomStubs,
  keyEvent,
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

// What the pilot-route scenarios install first: the hold-S emergency brake
// (Braking System 3 needs RCS 2, which needs Propulsors) and the deflector
// shield (needs Energy Shield).
const PILOT_CARDS = [
  'propulsors',
  'rcs_system',
  'rcs_system',
  'braking_system',
  'braking_system',
  'braking_system',
  'shield',
  'deflector_shield',
];

const SCENARIOS = [
  ...Array.from({ length: 15 }, (_, i) => ({
    name: `layer-${i + 1}`,
    layer: i + 1,
  })),
  { name: 'layer-17-endless', layer: 17 },
  { name: 'boss-rush', bossRush: true },
  { name: 'harmonic', layer: WEAPON_LAYER, cards: ['harmonic_resonator'] },
  { name: 'scatter', layer: WEAPON_LAYER, cards: ['scatter_coil'] },
  { name: 'pilot-route-layer-4', layer: 4, cards: PILOT_CARDS, route: true },
  {
    name: 'pilot-route-bastion',
    layer: WEAPON_LAYER,
    cards: PILOT_CARDS,
    route: true,
    hull: BASTION_HULL_ID,
  },
];

// The pilot's route, by frame number only, through the real key handlers.
// Move keys loop up, right, down, left, one second each. A dash at 1.5 s and
// every 3 s after. Every 5 s the pilot lets go of the loop and holds S alone
// for 0.4 s: the emergency brake fires only when S pushes against the motion
// (at 5 s, 25 s and 45 s, after an 'up' leg), so the others are failed tries.
// The shield key at 8 s (raises it) and 35 s (already up).
const ROUTE_KEYS = ['KeyW', 'KeyD', 'KeyS', 'KeyA'];
const BRAKE_HOLD_FRAMES = 24;

function routeKeys(frame) {
  const second = Math.floor(frame / FRAMES_PER_SECOND);
  const braking =
    second > 0 &&
    second % 5 === 0 &&
    frame - second * FRAMES_PER_SECOND < BRAKE_HOLD_FRAMES;
  const keys = [braking ? 'KeyS' : ROUTE_KEYS[second % ROUTE_KEYS.length]];
  // Taps are held for one frame.
  if (frame % (3 * FRAMES_PER_SECOND) === FRAMES_PER_SECOND * 1.5) {
    keys.push('ShiftLeft');
  }
  if (frame === 8 * FRAMES_PER_SECOND || frame === 35 * FRAMES_PER_SECOND) {
    keys.push('KeyE');
  }
  return keys;
}

function createPilot(input) {
  let pressed = [];
  return (frame) => {
    const next = routeKeys(frame);
    pressed
      .filter((code) => !next.includes(code))
      .forEach((code) => input.onKeyUp(keyEvent(code)));
    next
      .filter((code) => !pressed.includes(code))
      .forEach((code) => input.onKeyDown(keyEvent(code)));
    pressed = next;
  };
}

function jumpToLayer(enemies, layer) {
  enemies.releaseAllAsteroidsToPool();
  enemies.waveManager.currentWave = layer - 1;
  enemies.waveManager.waveInProgress = false;
  enemies.startNextWave();
}

// Cards unlock at pilot level 3 and up: the level is lifted for the picks only.
function applyCards(progression, cards) {
  const { level } = progression;
  progression.level = Math.max(level, 10);
  for (const card of cards) {
    expect(progression.applyUpgrade(card)).toBe(true);
  }
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
function traceScenario({ layer, bossRush, cards = [], route, hull }) {
  const game = createHeadlessGame();
  const { services, eventBus } = game;
  const { player, enemies, progression } = services;

  const events = [];
  const emit = eventBus.emit.bind(eventBus);
  eventBus.emit = (name, ...args) => {
    events.push(name);
    return emit(name, ...args);
  };

  if (hull) {
    game.session.resolveServiceInstance('hangar').owned[`${hull}-hull`] = true;
    services.settings.setSetting('gameplay', 'selectedHull', hull);
  }
  game.session.startNewRun({ source: 'test', bossRush });
  player.setInvulnerableTimer(1e9);
  if (layer) jumpToLayer(enemies, layer);
  applyCards(progression, cards);
  const fly = route ? createPilot(services.input) : null;

  const trace = { state: [], events: [] };
  for (let second = 0; second < SECONDS; second += 1) {
    const state = createHash('sha1');
    const names = createHash('sha1');
    for (let frame = 0; frame < FRAMES_PER_SECOND; frame += 1) {
      if (game.takeOfferedUpgrade()) {
        progression.applyUpgrade(progression.pendingUpgradeOptions[0].id);
      }
      fly?.(second * FRAMES_PER_SECOND + frame);
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
const SAME_ARCH = golden.arch === process.arch;
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
    const fixture = { arch: process.arch };
    for (const { name } of SCENARIOS) {
      const trace = traced[name] ?? (SAME_ARCH ? golden[name] : undefined);
      if (trace) fixture[name] = trace;
    }
    writeFileSync(FIXTURE, `${JSON.stringify(fixture, null, 2)}\n`);
  });

  const title = SAME_ARCH
    ? '$name plays as recorded'
    : '$name plays the same twice';
  it.each(SCENARIOS)(title, (scenario) => {
    const trace = traceScenario(scenario);
    traced[scenario.name] = trace;
    if (UPDATE) return;
    const expected = SAME_ARCH
      ? golden[scenario.name]
      : traceScenario(scenario);
    const message = divergence(scenario.name, trace, expected);
    if (message) throw new Error(message);
  });
});
