// The matrix's scene: the real game, headless (tests/__helpers__/headlessGame.js),
// a run started, the spawner frozen, the cards applied rank by rank through
// the game's own UpgradeSystem.applyUpgrade, enemies through the factory, and
// the pilot's input as replay frames (InputSystem.setInputSource), so a
// scripted W/A/S/D/dash/shield/strafe takes the same path a key does.
//
// A probe builds two scenes that differ by one rank of one card (the rank
// below and the rank measured) and reads the one number the card promises.

import { vi } from 'vitest';
import { GamePools } from '../../src/core/GamePools.js';
import { createInputFrame } from '../../src/core/replay.js';
import {
  freezeSpawner,
  spawnViaFactory,
  NO_LEVEL_UP_XP,
} from '../../src/bootstrap/contentScene.js';
import { SECTORS } from '../../src/data/sectors.js';
import UPGRADE_LIBRARY, {
  textForWeapon,
} from '../../src/data/upgrades/index.js';
import { listContent } from '../../src/content/registry.js';
import {
  createHeadlessGame,
  STEP_SECONDS,
} from '../__helpers__/headlessGame.js';
import { installDomStubs } from './domStubs.js';
import { resolveService } from '../../src/core/serviceUtils.js';

export { STEP_SECONDS };
export const CARDS = new Map(UPGRADE_LIBRARY.map((card) => [card.id, card]));
export const WEAPONS = listContent('weapons').map((w) => w.id);
export const WEAPON_CARD_OF = Object.fromEntries(
  listContent('weapons')
    .filter((w) => w.card)
    .map((w) => [w.id, w.card.id])
);
export const DEFAULT_WEAPON = 'lance';
// cardBench's spot: left of the 800 × 600 field, facing right, so a line of
// targets 540 px ahead still fits.
export const SHIP = { x: 160, y: 300 };

/** The card's text for `rank` (1-based) with `weapon` in hand. */
export function promiseText(id, rank, weapon = DEFAULT_WEAPON) {
  const text = textForWeapon(CARDS.get(id), weapon);
  return text?.levels?.[rank - 1]?.description ?? '';
}

/** Quiet console, fake timers and clock, DOM stubs: call in beforeEach, run the return in afterEach. */
export function quietWorld() {
  const restoreDom = installDomStubs();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
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
}

// Every upgrade prerequisite of the card and of its ranks up to `rank`,
// followed down, as [id, rank] in the order they must be taken.
export function prerequisitesOf(
  id,
  rank = CARDS.get(id).levels.length,
  out = []
) {
  const card = CARDS.get(id);
  const all = [
    ...(card.prerequisites ?? []),
    ...card.levels.slice(0, rank).flatMap((level) => level.prerequisites ?? []),
  ];
  for (const { type, id: need, level = 1 } of all) {
    if (type !== 'upgrade') continue;
    prerequisitesOf(need, level, out);
    const found = out.find(([other]) => other === need);
    if (found) found[1] = Math.max(found[1], level);
    else out.push([need, level]);
  }
  return out;
}

/**
 * Takes `id` up to `rank` through progression.applyUpgrade (the pilot level
 * lifted for the unlock levels). Returns the rank reached.
 */
export function takeTo(progression, id, rank) {
  const pilotLevel = progression.level;
  progression.level = 99;
  while (progression.getUpgradeCount(id) < rank) {
    if (!progression.applyUpgrade(id)) break;
  }
  progression.level = pilotLevel;
  return progression.getUpgradeCount(id);
}

/**
 * A scene: `weapon` in hand, `cards` ([id, rank] in order, prerequisites
 * added first), `flight` 'classic' (the run's start) or 'modern' (after the
 * Flight Computer: its trail and the briefing's engage event, which the UI
 * sends in the game). The ship parked at SHIP facing right, invulnerable
 * unless `mortal`.
 */
export function createScene({
  weapon = DEFAULT_WEAPON,
  cards = [],
  flight = 'classic',
  mortal = false,
  seed = 1,
  keepSpawner = false,
  // Called with (hangar service, game) before the run starts: items owned,
  // licences, seals, a hull selected.
  hangar = null,
} = {}) {
  const game = createHeadlessGame();
  const { services, eventBus, session } = game;
  const { player, enemies, progression, combat } = services;
  resolveService('difficulty', session.services).runSeed = seed;
  hangar?.(resolveService('hangar', session.services), game);
  session.startNewRun({ source: 'test', sector: SECTORS[0].id });
  progression.experienceToNext = NO_LEVEL_UP_XP;
  enemies.releaseAllAsteroidsToPool();
  if (!keepSpawner) freezeSpawner(enemies.waveManager);
  player.setPosition(SHIP.x, SHIP.y);
  player.angle = 0;
  player.velocity.vx = 0;
  player.velocity.vy = 0;
  player.angularVelocity = 0;
  if (!mortal) player.setInvulnerableTimer(1e9);

  const reached = {};
  // Rank 0: the card's prerequisites (of its rank 1) still taken, so the
  // twin scenes differ by that one card only.
  const take = (id, rank) => {
    for (const [need, level] of prerequisitesOf(id, Math.max(rank, 1))) {
      reached[need] = takeTo(
        progression,
        need,
        Math.max(level, progression.getUpgradeCount(need))
      );
    }
    if (rank > 0) reached[id] = takeTo(progression, id, rank);
  };
  if (flight === 'modern') {
    take('flight_computer', 1);
    eventBus.emit('modern-flight-engaged');
  }
  if (WEAPON_CARD_OF[weapon]) take(WEAPON_CARD_OF[weapon], 1);
  for (const [id, rank] of cards) take(id, rank);

  // Input: one replay frame per step, from `scene.input` (fields of
  // createInputFrame: up, down, left, right, dash, shield, strafeLeft,
  // strafeRight, strafeHold, …). Presses (dash, shield) last one step.
  const scene = {
    game,
    services,
    eventBus,
    player,
    enemies,
    progression,
    combat,
    reached,
    input: {},
    press: new Set(),
    damage: [],
    events: {},
    flight,
    weapon,
  };
  services.input.setInputSource(() => {
    const values = { ...scene.input };
    scene.press.forEach((field) => (values[field] = true));
    scene.press.clear();
    return createInputFrame(values);
  });

  const applyDamage = enemies.applyDamage.bind(enemies);
  enemies.applyDamage = (enemy, damage, options) => {
    scene.damage.push({
      enemy,
      id: enemy.id,
      damage: Number.isFinite(damage) ? damage : 0,
      t: scene.time,
      options,
    });
    return applyDamage(enemy, damage, options);
  };
  const emit = eventBus.emit.bind(eventBus);
  eventBus.emit = (name, payload) => {
    scene.events[name] = (scene.events[name] || 0) + 1;
    scene.onEvent?.(name, payload);
    return emit(name, payload);
  };
  scene.time = 0;
  scene.synergies = [...progression.activeSynergies].sort();
  scene.evolutions = [...combat.weapons.evolutions].sort();
  scene.weaponId = combat.weapons.weaponId;

  /** Steps `seconds`; `each(scene, frame)` runs before every step. */
  scene.run = (seconds, each) => {
    const frames = Math.round(seconds / STEP_SECONDS);
    for (let frame = 0; frame < frames; frame += 1) {
      each?.(scene, frame);
      game.step();
      scene.time += STEP_SECONDS;
    }
  };
  /** Keeps the ship parked (position, velocity, nose) before each step. */
  scene.park = (angle = 0) => {
    player.position.x = SHIP.x;
    player.position.y = SHIP.y;
    player.velocity.vx = 0;
    player.velocity.vy = 0;
    player.angle = angle;
    player.angularVelocity = 0;
  };
  /** One enemy through the factory, tanky and still unless told otherwise. */
  scene.spawn = (type, config = {}, { health = 1e5, maxHealth = 4e5 } = {}) => {
    const enemy = spawnViaFactory(enemies, type, {
      ...(type === 'asteroid' && {
        size: 'medium',
        variant: 'common',
        vx: 0,
        vy: 0,
      }),
      ...config,
    });
    if (enemy && health !== null) {
      enemy.maxHealth = maxHealth;
      enemy.health = health;
    }
    if (enemy) enemy._matrizStart = enemy.health;
    return enemy;
  };
  /** Health an enemy lost since it was spawned, whatever path hit it. */
  scene.healthLost = (enemy) => enemy._matrizStart - enemy.health;
  /** A hit on the hull through the game's enemy-damage path (the one
   * projectiles and blasts use): invulnerability lifted for it, put back. */
  scene.hit = (amount) => {
    const guard = player.invulnerableTimer;
    player.invulnerableTimer = 0;
    const result = enemies.applyDirectDamageToPlayer(amount, {
      cause: 'enemy',
      position: { ...player.position },
    });
    if (!mortal)
      player.invulnerableTimer = Math.max(player.invulnerableTimer, guard);
    return result;
  };
  scene.damageTo = (enemy) =>
    scene.damage
      .filter((d) => d.enemy === enemy)
      .reduce((s, d) => s + d.damage, 0);
  scene.totalDamage = () => scene.damage.reduce((s, d) => s + d.damage, 0);
  return scene;
}
