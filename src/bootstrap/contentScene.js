/**
 * `?content=<id>` (PLAN.md 0a.2): a real run that puts one item of the content
 * registry in front of the ship, so a new enemy, weapon, card or layer can be
 * seen (and captured) without a custom script. `?content=<kind>/<id>` forces a
 * registry kind, `&count=N` spawns N of an enemy (1..300), `&fire=1` lets the
 * ship shoot at enemies and bosses (it holds fire there, so they stay alive).
 *
 * profileHarness.js reads the URL and starts the run; this file composes the
 * scene through the public spawn paths (factory, upgrade system, game session).
 * Not gated behind IS_DEV: the owner opens it on the published site.
 */

import { getContent, listContent } from '../content/registry.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/GameConstants.js';
import { bossKindForLayer } from '../data/enemies/boss.js';
import { HERALD_KINDS } from '../data/enemies/herald.js';
import UPGRADE_LIBRARY from '../data/upgrades/index.js';

// Registry kinds a bare `?content=<id>` is looked up in, in this order.
export const CONTENT_KINDS = Object.freeze([
  'enemies',
  'bosses',
  'weapons',
  'hulls',
  'cards',
  'stages',
]);

const MAX_COUNT = 300;
// Unreachable level-up: no card screen interrupts the picture.
export const NO_LEVEL_UP_XP = 1e9;
const INVULNERABLE_SECONDS = 1e9;
const CARD_PICK_LEVEL = 10; // cards unlock by pilot level; lifted for the pick

// Logical 800x600 field: the ship at the left middle, facing right.
const SHIP = Object.freeze({ x: 120, y: GAME_HEIGHT / 2 });
const HOLD_TICK_MS = 16;
const SINGLE_ENEMY_DISTANCE = 300;
const BOSS_POSITION = Object.freeze({ x: 560, y: GAME_HEIGHT / 2 });
// Several enemies: a centered grid in the right two-thirds of the field.
const GRID_AREA = Object.freeze({
  left: GAME_WIDTH / 3 + 40,
  right: GAME_WIDTH - 40,
  top: 40,
  bottom: GAME_HEIGHT - 40,
});
const GRID_MAX_SPACING = 70;

// Session states that end the scene: the pilot left to the menu, or the run
// ended (the Retry and New Mission paths start from these).
const RUN_END_STATES = Object.freeze(['menu', 'player-died', 'victory']);

// Targets for the weapon, hull and card scenes. Every prefix is spread out.
const ROCKS = Object.freeze([
  { size: 'large', variant: 'common', x: 440, y: 300, vx: 4, vy: 2 },
  { size: 'medium', variant: 'common', x: 520, y: 150, vx: -3, vy: 3 },
  { size: 'medium', variant: 'common', x: 520, y: 450, vx: 3, vy: -3 },
  { size: 'small', variant: 'common', x: 600, y: 230, vx: -4, vy: 2 },
  { size: 'medium', variant: 'common', x: 600, y: 370, vx: 2, vy: 4 },
  { size: 'large', variant: 'common', x: 690, y: 300, vx: -3, vy: -2 },
]);
const DRONES = Object.freeze([
  { x: 620, y: 130 },
  { x: 660, y: 300 },
  { x: 620, y: 470 },
]);
const HULL_ROCK_COUNT = 3;

/**
 * Reads `?content=…&count=…&fire=…`. Null when there is no `content` flag.
 * The id is not looked up here (see resolveContent).
 */
export function parseContentParams(search) {
  const params = new URLSearchParams(search);
  const ref = params.get('content');
  if (ref === null) return null;

  const count = Number.parseInt(params.get('count'), 10);
  return {
    ref: ref.trim(),
    count: Number.isFinite(count) ? Math.min(MAX_COUNT, Math.max(1, count)) : 1,
    fire: params.get('fire') === '1',
  };
}

// The catalog, not the cards folder: weapon cards live in their weapon file.
function findCard(id) {
  return UPGRADE_LIBRARY.find((candidate) => candidate.id === id);
}

function findContent(kind, id) {
  return kind === 'cards' ? findCard(id) : getContent(kind, id);
}

/**
 * Looks `<id>` up in CONTENT_KINDS in order, or `<kind>/<id>` in that kind
 * only. Returns { kind, id, item }, or null when nothing matches.
 */
export function resolveContent(ref, lookup = findContent) {
  const slash = ref.indexOf('/');
  const kinds = slash < 0 ? CONTENT_KINDS : [ref.slice(0, slash)];
  const id = slash < 0 ? ref : ref.slice(slash + 1);
  for (const kind of kinds) {
    const item = CONTENT_KINDS.includes(kind) ? lookup(kind, id) : undefined;
    if (item) return { kind, id, item };
  }
  return null;
}

/**
 * The scene a URL asks for: { kind, id, item, count, fire }. An unknown id
 * logs one warning and returns null (the caller falls back to the hero scene).
 */
export function readContentScene(search) {
  const params = parseContentParams(search);
  if (!params) return null;

  const found = resolveContent(params.ref);
  if (!found) {
    console.warn(
      `[contentScene] Unknown content "${params.ref}". Valid kinds: ${CONTENT_KINDS.join(', ')}; use ?content=<id> or ?content=<kind>/<id>. Showing the plain hero scene.`
    );
    return null;
  }
  return { ...found, count: params.count, fire: params.fire };
}

/**
 * Where `count` enemies go: one 300 px ahead of the ship, several in a
 * centered grid (rows centered too) in the right two-thirds of the field.
 */
export function enemyPositions(count) {
  if (count <= 1) {
    return [{ x: SHIP.x + SINGLE_ENEMY_DISTANCE, y: SHIP.y }];
  }

  const { left, right, top, bottom } = GRID_AREA;
  const width = right - left;
  const height = bottom - top;
  const columns = Math.ceil(Math.sqrt((count * width) / height));
  const rows = Math.ceil(count / columns);
  const spacing = Math.min(
    GRID_MAX_SPACING,
    columns > 1 ? width / (columns - 1) : Infinity,
    rows > 1 ? height / (rows - 1) : Infinity
  );
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  const positions = [];
  for (let row = 0; row < rows; row += 1) {
    const inRow = Math.min(columns, count - row * columns);
    for (let column = 0; column < inRow; column += 1) {
      positions.push({
        x: centerX + (column - (inRow - 1) / 2) * spacing,
        y: centerY + (row - (rows - 1) / 2) * spacing,
      });
    }
  }
  return positions;
}

/** Sets `target[key]`; returns the call that puts back what was there. */
function override(target, key, value) {
  const wasOwn = Object.hasOwn(target, key);
  const original = target[key];
  target[key] = value;
  return () => {
    if (wasOwn) target[key] = original;
    else delete target[key];
  };
}

/**
 * Runs `undo` once, the first time the run ends. The listener stays on the
 * bus: EventBus.emit skips the next listener when one is removed mid-emit.
 */
export function undoWhenRunEnds(eventBus, undo) {
  let pending = true;
  eventBus.on('session-state-changed', ({ state }) => {
    if (!pending || !RUN_END_STATES.includes(state)) return;
    pending = false;
    undo();
  });
}

/**
 * Stops the layer from spawning on its own: rocks trickle in from
 * updateRockTrickle() and the layer clock (machines, surges, the Warden) runs
 * in update(). Returns the call that lets it spawn again.
 */
export function freezeSpawner(waveManager) {
  const restores = [
    override(waveManager, 'update', () => {}),
    override(waveManager, 'updateRockTrickle', () => {}),
  ];
  waveManager.spawnQueue = [];
  return () => restores.forEach((restore) => restore());
}

/** One enemy through the factory, registered the way the wave spawner does. */
export function spawnViaFactory(enemies, type, config) {
  const enemy = enemies.acquireEnemyViaFactory(type, { wave: 1, ...config });
  if (enemy) {
    enemy[Symbol.for('ASTEROIDS_ROGUEFIELD:factoryRegistered')] = false;
  }
  return enemy;
}

/** Restarts the wave counter as `layer`, like the golden trace jumps layers. */
export function jumpToLayer(enemies, layer) {
  enemies.releaseAllAsteroidsToPool();
  enemies.waveManager.currentWave = layer - 1;
  enemies.waveManager.waveInProgress = false;
  enemies.startNextWave();
  // The HUD reads the layer from rockLayer, which only update() moves: with
  // the spawner frozen it would stay on layer 1.
  enemies.waveManager.rockLayer = layer;
}

/** The card, after the cards it requires (rank 1 of each, recursively). */
function applyCard(progression, cardId) {
  const card = findCard(cardId);
  for (const { type, id, level = 1 } of card.prerequisites ?? []) {
    if (type !== 'upgrade') continue;
    let owned = progression.getUpgradeCount(id);
    while (owned < level && applyCard(progression, id)) owned += 1;
  }

  const pilotLevel = progression.level;
  progression.level = Math.max(pilotLevel, CARD_PICK_LEVEL);
  const applied = progression.applyUpgrade(cardId);
  progression.level = pilotLevel;
  return applied;
}

function spawnRocks(enemies, count) {
  ROCKS.slice(0, count).forEach((rock) =>
    spawnViaFactory(enemies, 'asteroid', rock)
  );
}

function spawnTargets(enemies) {
  spawnRocks(enemies, ROCKS.length);
  DRONES.forEach((drone) => spawnViaFactory(enemies, 'drone', drone));
}

function composeEnemy({ id, count }, { enemies }) {
  const spawned = enemyPositions(count).map(({ x, y }) =>
    spawnViaFactory(enemies, id, { x, y })
  );
  if (!spawned.some(Boolean)) {
    console.warn(`[contentScene] The factory has no enemy type "${id}".`);
  }
}

// The layer a boss belongs to: its Herald's layer, or the Warden's.
function layerOfBoss(id) {
  const stage = listContent('stages').find(
    (candidate) =>
      candidate.herald === id ||
      (candidate.warden && bossKindForLayer(candidate.order) === id)
  );
  return stage?.order ?? 1;
}

// A Herald comes through the factory like the layer's spawner sends it; a
// Warden through BossWave, like the layer's boss spawn.
function composeBoss({ id }, { enemies }) {
  const layer = layerOfBoss(id);
  jumpToLayer(enemies, layer);
  enemies.releaseAllAsteroidsToPool();

  if (HERALD_KINDS[id]) {
    spawnViaFactory(enemies, 'herald', {
      heraldKind: id,
      wave: layer,
      ...BOSS_POSITION,
    });
    return;
  }
  const { bossWave } = enemies.waveManager;
  const entry = bossWave.generateBossWave().boss;
  const boss = bossWave.spawnBossEnemy(
    { ...entry, bossKind: id, spawnPosition: { ...BOSS_POSITION } },
    { enemies: [] }
  );
  if (!boss) console.warn(`[contentScene] Warden "${id}" did not spawn.`);
}

// The weapon's own card switches to it; the ship's default weapon has none.
function composeWeapon({ id, item }, { enemies, progression, combat }) {
  if (item.card) applyCard(progression, item.card.id);
  if (combat.weaponId !== id) {
    console.warn(`[contentScene] No card switches the ship to "${id}".`);
  }
  spawnTargets(enemies);
}

// The same hull call a replay makes: not saved as the owner's hull setting,
// and a hull still locked in the Hangar flies too.
function composeHull({ id }, { enemies, 'game-session': session }) {
  session.applyConfiguredPlayerHull({ hullId: id });
  spawnRocks(enemies, HULL_ROCK_COUNT);
}

function composeCard({ id }, { enemies, progression }) {
  if (!applyCard(progression, id)) {
    console.warn(`[contentScene] Card "${id}" could not be applied.`);
  }
  spawnTargets(enemies);
}

// The layer plays on its own, spawner running.
function composeStage({ item }, { enemies }) {
  jumpToLayer(enemies, item.order);
}

const COMPOSERS = {
  enemies: composeEnemy,
  bosses: composeBoss,
  weapons: composeWeapon,
  hulls: composeHull,
  cards: composeCard,
  stages: composeStage,
};

function placeShip(player) {
  player.position.x = SHIP.x;
  player.position.y = SHIP.y;
  player.velocity.vx = 0;
  player.velocity.vy = 0;
  player.angle = 0;
}

// The ship stays where it was put (a ram or a Warden's charge cannot push it
// off the picture) until the pilot steers; then it is his. Returns the call
// that lets go.
function holdShip(player) {
  let steered = false;
  const intervalId = setInterval(() => {
    const input = player.cachedMovementInput;
    if (input?.up || input?.down || input?.left || input?.right) {
      steered = true;
    }
    if (!steered) placeShip(player);
  }, HOLD_TICK_MS);
  return () => clearInterval(intervalId);
}

/**
 * Composes the scene on a run that has just started: `scene` is what
 * readContentScene returned, `services` the game's service map. Everything
 * the scene overrides is put back when the run ends or the pilot leaves to
 * the menu, so the next run is a normal one.
 */
export function composeContentScene({ scene, services }) {
  const { player, enemies, combat, progression } = services;
  progression.experienceToNext = NO_LEVEL_UP_XP;
  enemies.releaseAllAsteroidsToPool();

  COMPOSERS[scene.kind](scene, services);

  const undo = [];
  if (scene.kind !== 'stages') undo.push(freezeSpawner(enemies.waveManager));
  if (!scene.fire && ['enemies', 'bosses'].includes(scene.kind)) {
    undo.push(override(combat.weapons, 'handleShooting', () => {}));
  }
  player.setInvulnerableTimer(INVULNERABLE_SECONDS);
  placeShip(player);
  undo.push(holdShip(player));
  undoWhenRunEnds(services['event-bus'], () =>
    undo.forEach((restore) => restore())
  );
}
