/**
 * Wave spawner
 *
 * Puts a wave's groups on the field (spawnWave): where each unit enters (a
 * safe distance from the ship, the edges, a surge's burst point), the size of
 * a rock, and the wave's spawn pacing.
 */

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { clamp } from '../../../utils/mathHelpers.js';
import {
  ASTEROID_EDGE_SPAWN_MARGIN,
  ASTEROID_SAFE_SPAWN_DISTANCE,
  WAVE_SPAWN_DELAY,
} from '../../../data/constants/gameplay.js';
import { SUPPORT_KINDS } from './LayerSchedule.js';

// Surge bursts: units spread this far (px) along the edge either side of the
// burst point; support enemies appear this far inside the field.
const SURGE_SPREAD = 70;
const SURGE_INSET = 40;

export class WaveSpawner {
  /**
   * @param {Object} kit
   * @param {Object} kit.enemySystem - Builds and registers each unit
   * @param {Object} kit.waveRandom - The wave's random scopes (WaveRandom)
   * @param {Function} kit.getLayer - The layer in progress (currentWave)
   * @param {Function} kit.countSpawn - One more enemy spawned this wave
   * @param {Function} kit.addExtraRocks - Rocks the plan did not have
   */
  constructor({
    enemySystem,
    waveRandom,
    getLayer,
    countSpawn,
    addExtraRocks,
  }) {
    this.enemySystem = enemySystem;
    this.waveRandom = waveRandom;
    this.getLayer = getLayer;
    this.countSpawn = countSpawn;
    this.addExtraRocks = addExtraRocks;
    this.spawnDelay = WAVE_SPAWN_DELAY || 1.0;
    this.spawnDelayMultiplier = 1;
  }

  getAsteroidDistributionWeights() {
    return { large: 0.5, medium: 0.3, small: 0.2 };
  }

  normalizeAsteroidDistribution(distribution = {}) {
    const weights = {
      large: Math.max(0, Number(distribution.large) || 0),
      medium: Math.max(0, Number(distribution.medium) || 0),
      small: Math.max(0, Number(distribution.small) || 0),
    };

    const total = weights.large + weights.medium + weights.small;

    return { weights, total };
  }

  resolveAsteroidSpawnSize(
    random,
    distribution = this.getAsteroidDistributionWeights()
  ) {
    const { weights, total } = this.normalizeAsteroidDistribution(distribution);
    const fallbackRandom = this.waveRandom.getRandomService();

    let spawnRandom = random;
    if (
      !spawnRandom ||
      (typeof spawnRandom.float !== 'function' &&
        typeof spawnRandom.range !== 'function')
    ) {
      spawnRandom = this.waveRandom.resolveScopedRandom(
        random,
        'spawn',
        'wave-spawn:size'
      );
    }

    const drawFloat = () => {
      if (spawnRandom && typeof spawnRandom.float === 'function') {
        return spawnRandom.float();
      }
      if (spawnRandom && typeof spawnRandom.range === 'function') {
        return spawnRandom.range(0, 1);
      }
      if (fallbackRandom && typeof fallbackRandom.float === 'function') {
        return fallbackRandom.float();
      }
      return 0;
    };

    const sizeOrder = ['large', 'medium', 'small'];
    const normalizedTotal = total > 0 ? total : 1;
    const roll = drawFloat();
    let cumulative = 0;

    for (const size of sizeOrder) {
      const weight = weights[size] / normalizedTotal;
      if (weight <= 0) {
        continue;
      }

      cumulative += weight;
      if (roll < cumulative) {
        return size;
      }
    }

    return sizeOrder[sizeOrder.length - 1];
  }

  /**
   * Resolves a deterministic spawn delay multiplier for the provided wave configuration.
   * The multiplier is cached on the config object so boss support groups reuse the same pacing.
   *
   * @param {Object} waveConfig - Wave configuration
   * @returns {number} Effective spawn delay multiplier
   */
  resolveWaveSpawnDelayMultiplier(waveConfig = {}) {
    const existingMultiplier = Number(waveConfig?.spawnDelayMultiplier);

    if (Number.isFinite(existingMultiplier) && existingMultiplier > 0) {
      return existingMultiplier;
    }

    const spawnDelayRandom = this.waveRandom.resolveScopedRandom(
      this.waveRandom.randomScopes?.spawn,
      'spawn',
      'wave-spawn-delay'
    );

    const generatedMultiplier =
      spawnDelayRandom && typeof spawnDelayRandom.range === 'function'
        ? spawnDelayRandom.range(0.5, 1)
        : 1;

    const sanitizedMultiplier =
      Number.isFinite(generatedMultiplier) && generatedMultiplier > 0
        ? generatedMultiplier
        : 1;

    if (waveConfig && typeof waveConfig === 'object') {
      waveConfig.spawnDelayMultiplier = sanitizedMultiplier;
    }

    return sanitizedMultiplier;
  }

  /**
   * Spawns enemies for the current wave using the factory pattern.
   *
   * @param {Object} waveConfig - Wave configuration
   * @param {Object} [options]
   * @param {boolean} [options.surge] - Burst: every unit (asteroids too)
   *   spawns around one point on the field edge farthest from the player.
   */
  spawnWave(waveConfig, { surge = false } = {}) {
    const enemyGroups = Array.isArray(waveConfig?.enemies)
      ? waveConfig.enemies
      : [];

    // Outside a surge the rocks are EnemySystem's: a group of only rocks
    // spawns nothing here.
    if (!surge) {
      if (enemyGroups.length === 0) {
        return;
      }

      const onlyAsteroids = enemyGroups.every(
        (group) => (group?.type || '').toLowerCase() === 'asteroid'
      );

      if (onlyAsteroids) {
        return;
      }
    }

    const world = this.enemySystem?.getCachedWorld?.();
    const worldBounds =
      world && typeof world.getBounds === 'function'
        ? world.getBounds()
        : {
            width: GAME_WIDTH || 800,
            height: GAME_HEIGHT || 600,
          };
    const player = this.enemySystem.getCachedPlayer();
    const playerSnapshot = this.enemySystem.getPlayerPositionSnapshot(player);
    const safeDistance = ASTEROID_SAFE_SPAWN_DISTANCE || 200;
    const defaultDistributionWeights = this.getAsteroidDistributionWeights();
    const surgeEdge = surge
      ? this.calculateSurgeEdge(worldBounds, playerSnapshot)
      : null;

    const spawnDelayMultiplier =
      this.resolveWaveSpawnDelayMultiplier(waveConfig);
    this.spawnDelayMultiplier = spawnDelayMultiplier;
    const effectiveSpawnDelay = this.spawnDelay * spawnDelayMultiplier;

    for (const enemyGroup of enemyGroups) {
      if (!enemyGroup || typeof enemyGroup !== 'object') {
        continue;
      }

      const typeKey =
        typeof enemyGroup.type === 'string'
          ? enemyGroup.type.toLowerCase()
          : '';
      const isAsteroid = typeKey === 'asteroid';
      // Heralds appear in the field like support enemies (never Elite).
      const isTacticalEnemy =
        SUPPORT_KINDS.includes(typeKey) || typeKey === 'herald';
      // The bridge (registerActiveEnemy) counts rocks; only a surge spawns
      // them here.
      if (isAsteroid && !surgeEdge) {
        continue;
      }

      const groupCount = Math.max(0, Math.floor(Number(enemyGroup.count) || 0));
      if (groupCount <= 0) {
        continue;
      }

      for (let i = 0; i < groupCount; i++) {
        const spawnContext = isAsteroid
          ? this.waveRandom.createLegacyAsteroidScopedRandom()
          : this.waveRandom.createScopedRandom('spawn', 'wave-spawn');

        let position;
        if (surgeEdge) {
          position = this.calculateSurgePosition(
            worldBounds,
            surgeEdge,
            isAsteroid,
            spawnContext.random
          );
        } else if (isTacticalEnemy) {
          const anchor =
            playerSnapshot &&
            Number.isFinite(playerSnapshot.x) &&
            Number.isFinite(playerSnapshot.y)
              ? { x: playerSnapshot.x, y: playerSnapshot.y }
              : {
                  x: worldBounds.width / 2,
                  y: worldBounds.height / 2,
                };

          const tacticalPosition = this.calculatePlayerSafeInboundsPosition(
            worldBounds,
            anchor,
            safeDistance,
            spawnContext.random
          );

          position = { x: tacticalPosition.x, y: tacticalPosition.y };

          let isInBounds = this.isPositionWithinBounds(position, worldBounds);
          let fallbackApplied = false;

          if (!isInBounds) {
            position = this.calculateCenterBandFallbackPosition(
              worldBounds,
              spawnContext.random
            );
            isInBounds = this.isPositionWithinBounds(position, worldBounds);
            fallbackApplied = true;
          }

          GameDebugLogger.log('SPAWN', `${typeKey} spawn position`, {
            type: typeKey,
            position,
            playerPosition: anchor,
            safeDistance,
            isInBounds,
            usedFallback:
              fallbackApplied || Boolean(tacticalPosition.usedFallback),
            clamped: Boolean(tacticalPosition.clamped),
          });
        } else {
          // Modern: spawn at safe distance from player when snapshot is available.
          // Fall back to edge positioning if we cannot resolve the player snapshot.
          if (!playerSnapshot) {
            position = this.calculateEdgeSpawnPosition(
              worldBounds,
              spawnContext.random
            );
          } else {
            position = this.calculateSafeSpawnPosition(
              worldBounds,
              playerSnapshot,
              safeDistance,
              spawnContext.random
            );
          }
        }

        if (
          !position ||
          !Number.isFinite(position.x) ||
          !Number.isFinite(position.y)
        ) {
          position = {
            x: worldBounds.width / 2,
            y: worldBounds.height / 2,
          };
        }

        if (
          position.x < -100 ||
          position.x > worldBounds.width + 100 ||
          position.y < -100 ||
          position.y > worldBounds.height + 100
        ) {
          GameDebugLogger.log('ERROR', 'Enemy spawn position out of bounds', {
            type: typeKey,
            position,
            worldBounds,
          });

          position.x = worldBounds.width / 2;
          position.y = worldBounds.height / 2;
        }

        const {
          count: _omittedCount,
          spawnIndexBase: groupSpawnIndexBase,
          metadata: groupMetadata,
          eliteChance = 0,
          ...groupConfig
        } = enemyGroup;

        const spawnIndexBase = Number.isFinite(groupSpawnIndexBase)
          ? groupSpawnIndexBase
          : 0;
        const spawnIndex = spawnIndexBase + i;

        let resolvedSize = groupConfig.size || enemyGroup.size;
        if (isAsteroid && (!resolvedSize || resolvedSize === 'auto')) {
          const distributionForGroup =
            (groupMetadata && groupMetadata.distributionWeights) ||
            defaultDistributionWeights;

          resolvedSize = this.resolveAsteroidSpawnSize(
            spawnContext.random,
            distributionForGroup
          );
        }

        const enemyConfig = {
          ...groupConfig,
          type: groupConfig.type || enemyGroup.type,
          size: resolvedSize,
          variant: Object.prototype.hasOwnProperty.call(groupConfig, 'variant')
            ? groupConfig.variant
            : enemyGroup.variant,
          x: position.x,
          y: position.y,
          wave: this.getLayer(),
          spawnIndex,
          spawnDelay: effectiveSpawnDelay,
          spawnDelayMultiplier: this.spawnDelayMultiplier,
        };

        if (
          !isAsteroid &&
          (enemyConfig.size === null ||
            typeof enemyConfig.size === 'undefined' ||
            enemyConfig.size === 'auto')
        ) {
          delete enemyConfig.size;
        }

        if (groupMetadata && typeof groupMetadata === 'object') {
          enemyConfig.metadata = {
            ...groupMetadata,
            spawnIndex,
            resolvedSize,
          };
        } else if (isAsteroid) {
          enemyConfig.metadata = { spawnIndex, resolvedSize };
        }

        if (spawnContext.random?.fork) {
          enemyConfig.random = spawnContext.random.fork('asteroid-core');
          enemyConfig.randomScope = 'spawn';
        }

        // Rolled after the core fork so the enemy's own stream is unchanged.
        if (isTacticalEnemy) {
          enemyConfig.elite = spawnContext.random.chance(eliteChance);
        }

        // Centralized acquisition path for factory-backed enemies
        const enemy = this.enemySystem.acquireEnemyViaFactory(
          enemyGroup.type,
          enemyConfig
        );

        if (
          enemy &&
          !enemy[Symbol.for('ASTEROIDS_ROGUEFIELD:factoryRegistered')]
        ) {
          this.enemySystem.registerActiveEnemy(enemy, {
            skipDuplicateCheck: true,
          });
        }

        if (enemy) {
          enemy[Symbol.for('ASTEROIDS_ROGUEFIELD:factoryRegistered')] = false;
        }

        if (enemy && !isAsteroid) {
          this.countSpawn();
        }

        // The bridge counts a surge rock here; the rock plan only had the
        // layer's own rocks, so it joins the plan too.
        if (enemy && isAsteroid) {
          this.addExtraRocks(1);
        }
      }
    }
  }

  /**
   * Calculates a safe spawn position away from player.
   *
   * @param {Object} bounds - World bounds
   * @param {Object} player - Player object
   * @param {number} safeDistance - Minimum distance from player
   * @returns {Object} {x, y} position
   */
  calculatePlayerSafeInboundsPosition(
    bounds,
    player,
    safeDistance,
    random = this.waveRandom.getRandomScope('spawn')
  ) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const horizontalMargin = Math.max(40, Math.floor(width * 0.075));
    const verticalMargin = Math.max(40, Math.floor(height * 0.075));
    const spawnRandom = this.waveRandom.resolveScopedRandom(
      random,
      'spawn',
      'tactical-position'
    );

    const anchorX = player && Number.isFinite(player.x) ? player.x : width / 2;
    const anchorY = player && Number.isFinite(player.y) ? player.y : height / 2;

    const minRadius = Math.max(0, safeDistance);
    const maxRadius = Math.max(minRadius + 80, minRadius * 1.5 || 120);
    const attempts = 8;
    let clamped = false;

    const nextFloat = () => spawnRandom.float();
    const nextRange = (min, max) => {
      if (
        spawnRandom &&
        typeof spawnRandom.range === 'function' &&
        Number.isFinite(min) &&
        Number.isFinite(max)
      ) {
        return spawnRandom.range(min, max);
      }
      const t = nextFloat();
      return min + t * (max - min);
    };

    for (let i = 0; i < attempts; i += 1) {
      const angle = nextFloat() * Math.PI * 2;
      const radius = nextRange(minRadius, maxRadius);

      let candidateX = anchorX + Math.cos(angle) * radius;
      let candidateY = anchorY + Math.sin(angle) * radius;

      const clampedX = clamp(
        candidateX,
        horizontalMargin,
        width - horizontalMargin
      );
      const clampedY = clamp(
        candidateY,
        verticalMargin,
        height - verticalMargin
      );

      if (clampedX !== candidateX || clampedY !== candidateY) {
        clamped = true;
      }

      candidateX = clampedX;
      candidateY = clampedY;

      const dx = candidateX - anchorX;
      const dy = candidateY - anchorY;
      const distance = Math.hypot(dx, dy);

      if (distance >= Math.max(0, safeDistance * 0.85)) {
        return {
          x: candidateX,
          y: candidateY,
          clamped,
          usedFallback: false,
        };
      }
    }

    const centerMarginX = Math.max(horizontalMargin, Math.floor(width * 0.25));
    const centerMarginY = Math.max(verticalMargin, Math.floor(height * 0.25));
    const jitterXRange = Math.max(0, width - centerMarginX * 2);
    const jitterYRange = Math.max(0, height - centerMarginY * 2);

    const jitter = (range) => (nextFloat() - 0.5) * range * 0.5;

    const fallbackX = clamp(
      width / 2 + jitter(jitterXRange),
      centerMarginX,
      width - centerMarginX
    );
    const fallbackY = clamp(
      height / 2 + jitter(jitterYRange),
      centerMarginY,
      height - centerMarginY
    );

    return {
      x: fallbackX,
      y: fallbackY,
      clamped: true,
      usedFallback: true,
    };
  }

  calculateCenterBandFallbackPosition(
    bounds,
    random = this.waveRandom.getRandomScope('spawn')
  ) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const horizontalMargin = Math.max(40, Math.floor(width * 0.25));
    const verticalMargin = Math.max(40, Math.floor(height * 0.25));
    const spawnRandom = this.waveRandom.resolveScopedRandom(
      random,
      'spawn',
      'tactical-center-fallback'
    );

    const nextFloat = () => spawnRandom.float();

    const jitter = (range) => (nextFloat() - 0.5) * range * 0.5;
    const usableWidth = Math.max(0, width - horizontalMargin * 2);
    const usableHeight = Math.max(0, height - verticalMargin * 2);

    return {
      x: clamp(
        width / 2 + jitter(usableWidth),
        horizontalMargin,
        width - horizontalMargin
      ),
      y: clamp(
        height / 2 + jitter(usableHeight),
        verticalMargin,
        height - verticalMargin
      ),
    };
  }

  isPositionWithinBounds(position, bounds, extraMargin = 0) {
    if (
      !position ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      return false;
    }

    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;

    const minX = 0 - extraMargin;
    const maxX = width + extraMargin;
    const minY = 0 - extraMargin;
    const maxY = height + extraMargin;

    return (
      position.x >= minX &&
      position.x <= maxX &&
      position.y >= minY &&
      position.y <= maxY
    );
  }

  calculateSafeSpawnPosition(
    bounds,
    player,
    safeDistance,
    random = this.waveRandom.getRandomScope('spawn')
  ) {
    const spawnRandom = this.waveRandom.resolveScopedRandom(
      random,
      'spawn',
      'spawn-position'
    );
    const margin = 50;
    let x,
      y,
      attempts = 0;
    const maxAttempts = 10;

    do {
      // Random position at screen edges
      const edge = spawnRandom.int(0, 3);

      switch (edge) {
        case 0: // Top
          x = spawnRandom.range(0, bounds.width);
          y = -margin;
          break;
        case 1: // Right
          x = bounds.width + margin;
          y = spawnRandom.range(0, bounds.height);
          break;
        case 2: // Bottom
          x = spawnRandom.range(0, bounds.width);
          y = bounds.height + margin;
          break;
        case 3: // Left
          x = -margin;
          y = spawnRandom.range(0, bounds.height);
          break;
      }

      attempts++;

      // Check distance from player
      if (player && player.x !== undefined && player.y !== undefined) {
        const dx = x - player.x;
        const dy = y - player.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance >= safeDistance) {
          break;
        }
      } else {
        break; // No player, position is fine
      }
    } while (attempts < maxAttempts);

    return { x, y };
  }

  /**
   * Calculates spawn position on one of the 4 edges (legacy asteroid behavior).
   * Replicates EnemySystem.spawnAsteroid() positioning logic (lines 2046-2083).
   *
   * @param {Object} worldBounds - World dimensions {width, height}
   * @param {Object} random - Random service instance
   * @returns {Object} Position {x, y}
   */
  calculateEdgeSpawnPosition(
    worldBounds,
    random = this.waveRandom.getRandomScope('spawn')
  ) {
    const width = worldBounds?.width || GAME_WIDTH || 800;
    const height = worldBounds?.height || GAME_HEIGHT || 600;
    const margin =
      typeof ASTEROID_EDGE_SPAWN_MARGIN === 'number'
        ? ASTEROID_EDGE_SPAWN_MARGIN
        : 80;

    let spawnRandom = this.waveRandom.resolveScopedRandom(
      random,
      'spawn',
      'edge-position'
    );

    if (!spawnRandom || typeof spawnRandom.float !== 'function') {
      const scopedFallback = this.waveRandom.createScopedRandom(
        'spawn',
        'edge-position'
      );
      if (
        scopedFallback?.random &&
        typeof scopedFallback.random.float === 'function'
      ) {
        spawnRandom = scopedFallback.random;
      } else {
        const baseRandom = this.waveRandom.getRandomService();
        if (baseRandom && typeof baseRandom.fork === 'function') {
          spawnRandom = baseRandom.fork(
            'wave-manager:spawn:edge-position:fallback'
          );
        } else {
          spawnRandom = new RandomService(0);
        }
      }
    }

    const getRange = (min, max) => {
      if (typeof spawnRandom.range === 'function') {
        return spawnRandom.range(min, max);
      }
      const span = max - min;
      const base =
        typeof spawnRandom.float === 'function' ? spawnRandom.float() : 0;
      return min + span * base;
    };

    // Select side: 0=top, 1=right, 2=bottom, 3=left
    const side =
      typeof spawnRandom.int === 'function'
        ? spawnRandom.int(0, 3)
        : Math.min(3, Math.floor(getRange(0, 4)));

    let x;
    let y;

    switch (side) {
      case 0: // Top
        x = getRange(0, width);
        y = -margin;
        break;
      case 1: // Right
        x = width + margin;
        y = getRange(0, height);
        break;
      case 2: // Bottom
        x = getRange(0, width);
        y = height + margin;
        break;
      default: // Left (case 3)
        x = -margin;
        y = getRange(0, height);
        break;
    }

    return { x, y };
  }

  /**
   * Burst point for a surge: a random spot on the middle half of the field
   * edge farthest from the player.
   */
  calculateSurgeEdge(bounds, player) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const px = Number.isFinite(player?.x) ? player.x : width / 2;
    const py = Number.isFinite(player?.y) ? player.y : height / 2;

    const edges = [
      { side: 'top', distance: py },
      { side: 'bottom', distance: height - py },
      { side: 'left', distance: px },
      { side: 'right', distance: width - px },
    ];
    const { side } = edges.reduce((best, edge) =>
      edge.distance > best.distance ? edge : best
    );

    const { random } = this.waveRandom.createScopedRandom(
      'spawn',
      'surge-edge'
    );
    const length = side === 'top' || side === 'bottom' ? width : height;
    return { side, along: random.range(0.25, 0.75) * length };
  }

  /**
   * One surge unit near the burst point: asteroids just outside the edge
   * (they drift in), support enemies just inside it.
   */
  calculateSurgePosition(bounds, edge, isAsteroid, random) {
    const width = bounds?.width || GAME_WIDTH || 800;
    const height = bounds?.height || GAME_HEIGHT || 600;
    const depth = isAsteroid ? -ASTEROID_EDGE_SPAWN_MARGIN : SURGE_INSET;
    const length =
      edge.side === 'top' || edge.side === 'bottom' ? width : height;
    const along = clamp(
      edge.along + random.range(-SURGE_SPREAD, SURGE_SPREAD),
      SURGE_INSET,
      length - SURGE_INSET
    );

    switch (edge.side) {
      case 'top':
        return { x: along, y: depth };
      case 'bottom':
        return { x: along, y: height - depth };
      case 'left':
        return { x: depth, y: along };
      default:
        return { x: width - depth, y: along };
    }
  }
}
