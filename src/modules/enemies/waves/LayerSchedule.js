/**
 * Layer schedule
 *
 * The layer director's timed spawns (src/data/layers.js): the roster, surges,
 * field events and Herald flattened into one schedule and run on the layer's
 * clock, with the support kinds, their type keys and their defaults.
 */

import { ENEMY_TYPES } from '../../../data/constants/visual.js';
import { HERALD_SPAWN_AT } from '../../../data/enemies/herald.js';

// Support kinds the layer table can list; they spawn at a safe distance from
// the player (asteroids come in from the edges).
export const SUPPORT_KINDS = [
  'drone',
  'mine',
  'hunter',
  'husk',
  'ram',
  'bulwark',
  'weaver',
  'caster',
  'shade',
  'leech',
];

export class LayerSchedule {
  /**
   * @param {Object} kit
   * @param {Object} kit.eventBus - Announces surges
   * @param {Object} kit.spawner - Puts the due groups on the field (WaveSpawner)
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

    const enemyTypes = ENEMY_TYPES || {};
    this.enemyTypeKeys = {
      asteroid: 'asteroid',
      drone: enemyTypes.drone?.key || 'drone',
      mine: enemyTypes.mine?.key || 'mine',
      hunter: enemyTypes.hunter?.key || 'hunter',
    };
    this.enemyTypeDefaults = {
      drone: enemyTypes.drone || {},
      mine: enemyTypes.mine || {},
      hunter: enemyTypes.hunter || {},
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

  createSupportGroup(kind, count) {
    if (!count || count <= 0) {
      return null;
    }

    const defaults = this.enemyTypeDefaults || {};

    switch (kind) {
      case 'drone': {
        const droneDefaults = defaults.drone || {};
        return {
          type: this.enemyTypeKeys?.drone || 'drone',
          count,
          fireRate: droneDefaults.fireRate,
          fireVariance: droneDefaults.fireVariance,
          fireSpread: droneDefaults.fireSpread,
          projectileSpeed: droneDefaults.projectileSpeed,
          projectileDamage: droneDefaults.projectileDamage,
          targetingRange: droneDefaults.targetingRange,
          speed: droneDefaults.speed,
          acceleration: droneDefaults.acceleration,
        };
      }
      case 'mine': {
        const mineDefaults = defaults.mine || {};
        return {
          type: this.enemyTypeKeys?.mine || 'mine',
          count,
          armTime: mineDefaults.armTime,
          proximityRadius: mineDefaults.proximityRadius,
          explosionRadius: mineDefaults.explosionRadius,
          explosionDamage: mineDefaults.explosionDamage,
          lifetime: mineDefaults.lifetime,
        };
      }
      case 'hunter': {
        const hunterDefaults = defaults.hunter || {};
        return {
          type: this.enemyTypeKeys?.hunter || 'hunter',
          count,
          preferredDistance: hunterDefaults.preferredDistance,
          burstCount: hunterDefaults.burstCount,
          burstInterval: hunterDefaults.burstInterval,
          burstDelay: hunterDefaults.burstDelay,
          fireSpread: hunterDefaults.fireSpread,
          projectileSpeed: hunterDefaults.projectileSpeed,
          projectileDamage: hunterDefaults.projectileDamage,
          fireRange: hunterDefaults.fireRange,
          speed: hunterDefaults.speed,
          acceleration: hunterDefaults.acceleration,
        };
      }
      default:
        return SUPPORT_KINDS.includes(kind) ? { type: kind, count } : null;
    }
  }

  /**
   * Flattens a layer's roster, surges and field events into timed entries
   * sorted by `at` (seconds into the layer). Surge kinds are taken in turn.
   */
  buildLayerSchedule(director) {
    const schedule = [];

    for (const { kind, count, from, every, elite } of director.roster) {
      for (let i = 0; i < count; i += 1) {
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
        const kind = surge.kinds[i % surge.kinds.length];
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
        kinds: [...surge.kinds],
        count: surge.count,
      });
    }
  }
}
