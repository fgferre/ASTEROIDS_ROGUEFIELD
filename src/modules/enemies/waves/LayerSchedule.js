/**
 * Layer schedule
 *
 * The layer director's timed spawns (src/data/layers.js): the roster, surges,
 * field events and Herald flattened into one schedule and run on the layer's
 * clock, with the support kinds and their type keys.
 */

import { listContent } from '../../../content/registry.js';
import { HERALD_SPAWN_AT } from '../../../data/enemies/herald.js';
import { enemiesFor } from '../../../data/layers.js';

// Support kinds the layer table can list (every src/content/enemies item);
// they spawn at a safe distance from the player (asteroids come in from the
// edges).
export const SUPPORT_KINDS = listContent('enemies').map(({ id }) => id);

export class LayerSchedule {
  /**
   * @param {Object} kit
   * @param {Object} kit.eventBus - Announces surges
   * @param {Object} kit.spawner - Puts the due groups on the field (WaveSpawner);
   *   its `waveRandom` draws between enemies sharing a role
   * @param {Object} kit.layerEvents - Starts and counts down field events
   * @param {Function} kit.getLayer - The layer in progress (currentWave)
   * @param {Function} kit.isFieldEmpty - No enemy left and no rock owed
   * @param {Function} kit.checkWaveCompletion - Completes a finished layer
   */
  constructor({
    eventBus,
    spawner,
    layerEvents,
    getLayer,
    isFieldEmpty,
    checkWaveCompletion,
  }) {
    this.eventBus = eventBus;
    this.spawner = spawner;
    this.layerEvents = layerEvents;
    this.getLayer = getLayer;
    this.isFieldEmpty = isFieldEmpty;
    this.checkWaveCompletion = checkWaveCompletion;

    this.enemyTypeKeys = {
      asteroid: 'asteroid',
      ...Object.fromEntries(SUPPORT_KINDS.map((kind) => [kind, kind])),
    };

    // Timed spawns for the layer in progress (src/data/layers.js), sorted by
    // `at` (seconds into the layer).
    this.layerSchedule = [];
    this.layerElapsed = 0;
  }

  isAsteroidType(type) {
    if (!type) {
      return false;
    }

    const asteroidKey = this.enemyTypeKeys?.asteroid
      ? String(this.enemyTypeKeys.asteroid).toLowerCase()
      : 'asteroid';

    return String(type).toLowerCase() === asteroidKey;
  }

  // The group carries only the kind and count: the factory fills in the
  // rest from the kind's content file.
  createSupportGroup(kind, count) {
    if (!count || count <= 0) {
      return null;
    }

    return SUPPORT_KINDS.includes(kind) ? { type: kind, count } : null;
  }

  /**
   * Flattens a layer's roster, surges and field events into timed entries
   * sorted by `at` (seconds into the layer). Surge roles are taken in turn.
   * Each enemy spawn gets an enemy for its role on this layer (enemiesFor):
   * the only one, with no draw, or one drawn by `weight` for that spawn from
   * the layer's role stream, made at the first such draw. A role no enemy
   * fills yet spawns nothing.
   */
  buildLayerSchedule(director) {
    const layer = this.getLayer();
    let random = null;
    const enemyFor = (role) => {
      if (this.isAsteroidType(role)) return role;
      const enemies = enemiesFor(role, layer);
      if (enemies.length <= 1) return enemies[0]?.id;
      random ??= this.spawner.waveRandom.createRoleRandom(layer);
      return random.weightedPick(
        enemies.map(({ id, weight = 1 }) => [id, weight])
      );
    };
    const schedule = [];

    for (const { role, count, from, every, elite } of director.roster) {
      for (let i = 0; i < count; i += 1) {
        const kind = enemyFor(role);
        if (!kind) continue;
        schedule.push({
          at: from + i * every,
          groups: [{ kind, count: 1 }],
          elite,
          surge: null,
        });
      }
    }

    for (const surge of director.surges) {
      const counts = new Map();
      for (let i = 0; i < surge.count; i += 1) {
        const kind = enemyFor(surge.roles[i % surge.roles.length]);
        if (!kind) continue;
        counts.set(kind, (counts.get(kind) || 0) + 1);
      }
      schedule.push({
        at: surge.at,
        groups: [...counts].map(([kind, count]) => ({ kind, count })),
        elite: 0,
        surge,
      });
    }

    for (const event of director.events) {
      schedule.push({ at: event.at, groups: [], elite: 0, surge: null, event });
    }

    // The Herald counts as one scheduled enemy: the layer holds until it dies.
    if (director.herald) {
      schedule.push({
        at: HERALD_SPAWN_AT,
        groups: [{ kind: 'herald', count: 1 }],
        elite: 0,
        surge: null,
        herald: director.herald,
      });
    }

    // Stable: entries due at the same time keep table order.
    return schedule.sort((a, b) => a.at - b.at);
  }

  /**
   * Advances the layer clock and spawns what is due. An empty field does not
   * wait: the next scheduled spawn comes at once.
   */
  updateLayerSchedule(deltaTime) {
    this.layerElapsed += deltaTime;
    this.layerEvents.updateFieldEvents(deltaTime);

    const next = this.layerSchedule[0];
    if (next && next.at > this.layerElapsed && this.isFieldEmpty()) {
      this.layerElapsed = next.at;
    }

    while (
      this.layerSchedule.length > 0 &&
      this.layerSchedule[0].at <= this.layerElapsed
    ) {
      this.spawnScheduled(this.layerSchedule.shift());
    }

    this.checkWaveCompletion();
  }

  spawnScheduled({ groups, elite, surge, event, herald }) {
    if (event) {
      this.layerEvents.startFieldEvent(event);
      return;
    }

    if (herald) {
      this.spawner.spawnWave({
        enemies: [{ type: 'herald', count: 1, heraldKind: herald }],
        spawnDelayMultiplier: this.spawner.spawnDelayMultiplier,
      });
      return;
    }

    const enemies = [];
    for (const { kind, count } of groups) {
      const group = this.isAsteroidType(kind)
        ? { type: kind, count, size: 'small', variant: 'common' }
        : this.createSupportGroup(kind, count);
      if (group) enemies.push({ ...group, eliteChance: elite });
    }

    this.spawner.spawnWave(
      { enemies, spawnDelayMultiplier: this.spawner.spawnDelayMultiplier },
      { surge: Boolean(surge) }
    );

    if (surge) {
      this.eventBus.emit('surge-started', {
        layer: this.getLayer(),
        label: surge.label,
        kinds: groups.map(({ kind }) => kind),
        count: surge.count,
      });
    }
  }
}
