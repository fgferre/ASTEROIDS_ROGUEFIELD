/**
 * Boss wave
 *
 * The Warden's layer: its wave config from BOSS_CONFIG (with the minion types
 * the field has), where its fight starts (inside the left or right edge, the
 * one farther from the ship, clear of it) and its spawn, which starts its
 * entrance from past that edge (boss/arrival.js).
 */

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { clamp } from '../../../utils/mathHelpers.js';
import { BOSS_CONFIG } from '../../../data/constants/visual.js';
import { bossKindForLayer, WARDEN_KINDS } from '../../../data/enemies/boss.js';
import { arrivalEdge } from '../boss/arrival.js';

export class BossWave {
  /**
   * @param {Object} kit
   * @param {Object} kit.enemySystem - Spawns the boss
   * @param {Object} kit.waveRandom - The wave's random scopes (WaveRandom)
   * @param {Object} kit.enemyTypeKeys - Enemy type keys (LayerSchedule)
   * @param {Function} kit.getLayer - The layer in progress (currentWave)
   * @param {Function} kit.countSpawn - One more enemy spawned this wave
   */
  constructor({
    enemySystem,
    waveRandom,
    enemyTypeKeys,
    getLayer,
    countSpawn,
  }) {
    this.enemySystem = enemySystem;
    this.waveRandom = waveRandom;
    this.enemyTypeKeys = enemyTypeKeys;
    this.getLayer = getLayer;
    this.countSpawn = countSpawn;
    this.bossEnemyKey = (BOSS_CONFIG && BOSS_CONFIG.key) || 'boss';
  }

  filterAvailableMinionTypes(candidates) {
    const list = Array.isArray(candidates) ? candidates : [];
    const seen = new Set();
    const result = [];
    const availableKeys = new Set(
      Object.values(this.enemyTypeKeys || {}).map((value) =>
        typeof value === 'string'
          ? value.toLowerCase()
          : String(value || '').toLowerCase()
      )
    );

    for (let i = 0; i < list.length; i += 1) {
      const value = list[i];
      if (!value) {
        continue;
      }

      const key = String(value).trim().toLowerCase();
      if (!key || key === 'boss' || seen.has(key)) {
        continue;
      }

      if (availableKeys.size > 0 && !availableKeys.has(key)) {
        continue;
      }

      seen.add(key);
      result.push(key);
    }

    // None available: the first of the base Warden's minion kinds the field
    // has.
    if (!result.length) {
      const fallback = (BOSS_CONFIG?.minionTypes ?? []).find((key) =>
        availableKeys.has(key)
      );
      if (fallback) {
        result.push(fallback);
      }
    }

    return result;
  }

  resolveBossDefaults() {
    const base = BOSS_CONFIG || {};
    const enemySystem = this.enemySystem;

    const minionTypes =
      enemySystem &&
      typeof enemySystem.getAvailableBossMinionTypes === 'function'
        ? enemySystem.getAvailableBossMinionTypes(base.minionTypes)
        : this.filterAvailableMinionTypes(base.minionTypes);

    return { ...base, minionTypes };
  }

  generateBossWave() {
    const bossDefaults = this.resolveBossDefaults();

    const bossRadius = bossDefaults.radius || 60;
    const safeDistance = Math.max(
      Number.isFinite(bossDefaults.safeDistance)
        ? bossDefaults.safeDistance
        : 0,
      bossRadius * 2.4
    );
    const entryPadding = Number.isFinite(bossDefaults.entryPadding)
      ? Math.max(0, bossDefaults.entryPadding)
      : Math.max(20, bossRadius * 0.35);

    const bossEntry = {
      type: this.bossEnemyKey || bossDefaults.key || 'boss',
      key: bossDefaults.key || this.bossEnemyKey || 'boss',
      count: 1,
      displayName: bossDefaults.displayName || 'Boss',
      radius: bossDefaults.radius,
      health: bossDefaults.health,
      healthScaling: bossDefaults.healthScaling,
      spawnStrategy: 'scripted-entrance',
      safeDistance,
      entryPadding,
      rewards: bossDefaults.rewards ? { ...bossDefaults.rewards } : undefined,
      randomScope: 'boss-spawn',
      randomParentScope: 'spawn',
      metadata: {
        minionTypes: Array.isArray(bossDefaults.minionTypes)
          ? [...bossDefaults.minionTypes]
          : undefined,
      },
    };

    return { isBossWave: true, boss: bossEntry, enemies: [] };
  }

  spawnBossEnemy(bossConfig = {}, waveConfig = {}) {
    GameDebugLogger.log('SPAWN', 'Boss spawn attempted', {
      type: bossConfig.type,
      entrance: bossConfig.entrance,
      wave: this.getLayer(),
    });

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

    const spawnRandom = this.waveRandom.resolveScopedRandom(
      this.waveRandom.getRandomScope
        ? this.waveRandom.getRandomScope('boss-spawn')
        : null,
      'spawn',
      'boss-position'
    );

    const baseRadius = bossConfig.radius || BOSS_CONFIG?.radius || 60;
    const requestedSafeDistance = Number.isFinite(bossConfig.safeDistance)
      ? bossConfig.safeDistance
      : Number.isFinite(BOSS_CONFIG?.safeDistance)
        ? BOSS_CONFIG.safeDistance
        : 0;
    const safeDistance = Math.max(baseRadius * 2, requestedSafeDistance);
    const entryPadding = Number.isFinite(bossConfig.entryPadding)
      ? Math.max(0, bossConfig.entryPadding)
      : Number.isFinite(BOSS_CONFIG?.entryPadding)
        ? Math.max(0, BOSS_CONFIG.entryPadding)
        : Math.max(20, baseRadius * 0.35);
    // Its own size keeps the spot inside the field (the Choir is the widest).
    const kind = bossConfig.bossKind ?? bossKindForLayer(this.getLayer());
    const radius = WARDEN_KINDS[kind]?.radius ?? baseRadius;
    const entrance =
      bossConfig.entrance ||
      arrivalEdge(
        playerSnapshot?.x ?? worldBounds.width / 2,
        worldBounds.width
      );

    let spawnPosition;
    if (
      bossConfig?.spawnPosition &&
      Number.isFinite(bossConfig.spawnPosition.x) &&
      Number.isFinite(bossConfig.spawnPosition.y)
    ) {
      spawnPosition = { ...bossConfig.spawnPosition };
    } else {
      spawnPosition = this.calculateBossSpawnPosition(
        worldBounds,
        entrance,
        { safeDistance, entryPadding, radius },
        playerSnapshot,
        spawnRandom
      );
    }

    GameDebugLogger.log('SPAWN', 'Boss position calculated', {
      x: spawnPosition.x,
      y: spawnPosition.y,
      entrance,
      worldBounds,
      safeDistance,
      entryPadding,
    });

    const metadata = {
      ...(bossConfig.metadata || {}),
      wave: this.getLayer(),
      isBossWave: true,
      spawnSource: 'wave-manager',
      entrance,
      supportPlan: Array.isArray(waveConfig.enemies)
        ? waveConfig.enemies.map((group) => ({
            type: group.type,
            count: group.count,
          }))
        : undefined,
    };

    const bossSpawnConfig = {
      ...bossConfig,
      x: spawnPosition.x,
      y: spawnPosition.y,
      wave: this.getLayer(),
      safeDistance,
      entryPadding,
      spawnStrategy: bossConfig.spawnStrategy || 'scripted-entrance',
      entrance,
      spawnOffset: bossConfig.spawnOffset,
      randomScope: bossConfig.randomScope || 'boss-spawn',
      randomParentScope: bossConfig.randomParentScope || 'spawn',
      metadata,
    };

    const boss = this.enemySystem.spawnBoss(bossSpawnConfig);

    if (!boss) {
      GameDebugLogger.log('ERROR', 'Boss spawn failed - no instance returned', {
        config: bossSpawnConfig,
      });
      return null;
    }

    GameDebugLogger.log('SPAWN', 'Boss spawned successfully', {
      id: boss.id,
      type: boss.type,
      position: { x: boss.x, y: boss.y },
      health: boss.health,
      maxHealth: boss.maxHealth,
      phase: boss.currentPhase,
    });

    this.countSpawn();

    return boss;
  }

  calculateBossSpawnPosition(
    worldBounds = { width: 800, height: 600 },
    entrance = 'top-center',
    constraints = {},
    playerSnapshot = null,
    random = this.waveRandom.getRandomScope('spawn')
  ) {
    const bounds = {
      width: worldBounds?.width || GAME_WIDTH || 800,
      height: worldBounds?.height || GAME_HEIGHT || 600,
    };

    const generator = this.waveRandom.resolveScopedRandom(
      random,
      'spawn',
      'boss-position'
    );
    const bossRadius = constraints?.radius || BOSS_CONFIG?.radius || 60;
    const safeDistance = Math.max(
      Number(constraints?.safeDistance) || 0,
      bossRadius * 2
    );
    const entryPadding = Math.max(
      Number(constraints?.entryPadding) || 0,
      Math.max(20, bossRadius * 0.35)
    );
    const horizontalMargin = Math.min(
      bounds.width / 2,
      entryPadding + bossRadius
    );
    const verticalMargin = Math.min(
      bounds.height / 2,
      entryPadding + bossRadius
    );

    const getRange = (min, max) => generator.range(min, max);

    let x = bounds.width / 2;
    let y = verticalMargin;

    switch (entrance) {
      case 'center':
        x = bounds.width / 2;
        y = bounds.height / 2;
        break;
      case 'bottom-center':
      case 'bottom':
        x = getRange(horizontalMargin, bounds.width - horizontalMargin);
        y = bounds.height - verticalMargin;
        break;
      case 'left':
      case 'left-center':
        x = horizontalMargin;
        y = getRange(verticalMargin, bounds.height - verticalMargin);
        break;
      case 'right':
      case 'right-center':
        x = bounds.width - horizontalMargin;
        y = getRange(verticalMargin, bounds.height - verticalMargin);
        break;
      case 'top-center':
      default:
        x = getRange(horizontalMargin, bounds.width - horizontalMargin);
        y = verticalMargin;
        break;
    }

    if (
      playerSnapshot &&
      Number.isFinite(playerSnapshot.x) &&
      Number.isFinite(playerSnapshot.y)
    ) {
      const dx = x - playerSnapshot.x;
      const dy = y - playerSnapshot.y;
      const distance = Math.hypot(dx, dy);

      if (distance < safeDistance) {
        if (distance === 0) {
          x = playerSnapshot.x;
          y = playerSnapshot.y - safeDistance;
        } else {
          const scale = safeDistance / distance;
          x = playerSnapshot.x + dx * scale;
          y = playerSnapshot.y + dy * scale;
        }
      }
    }

    const maxX = bounds.width - horizontalMargin;
    const maxY = bounds.height - verticalMargin;
    x = clamp(x, horizontalMargin, maxX);
    y = clamp(y, verticalMargin, maxY);

    if (
      playerSnapshot &&
      Number.isFinite(playerSnapshot.x) &&
      Number.isFinite(playerSnapshot.y) &&
      safeDistance > 0
    ) {
      let dx = x - playerSnapshot.x;
      let dy = y - playerSnapshot.y;
      let distance = Math.hypot(dx, dy);

      if (distance < safeDistance) {
        let dirX = dx;
        let dirY = dy;
        if (dirX === 0 && dirY === 0) {
          dirX = 0;
          dirY = -1;
        }

        const magnitude = Math.hypot(dirX, dirY) || 1;
        dirX /= magnitude;
        dirY /= magnitude;

        const candidateX = playerSnapshot.x + dirX * safeDistance;
        const candidateY = playerSnapshot.y + dirY * safeDistance;

        let adjustedX = candidateX;
        let adjustedY = candidateY;

        const withinBand =
          adjustedX >= horizontalMargin &&
          adjustedX <= maxX &&
          adjustedY >= verticalMargin &&
          adjustedY <= maxY;

        if (!withinBand) {
          const boundaryTs = [];
          if (dirX > 0) {
            boundaryTs.push((maxX - playerSnapshot.x) / dirX);
          } else if (dirX < 0) {
            boundaryTs.push((horizontalMargin - playerSnapshot.x) / dirX);
          }

          if (dirY > 0) {
            boundaryTs.push((maxY - playerSnapshot.y) / dirY);
          } else if (dirY < 0) {
            boundaryTs.push((verticalMargin - playerSnapshot.y) / dirY);
          }

          const validTs = boundaryTs.filter(
            (t) => Number.isFinite(t) && t >= 0
          );
          let finalT = safeDistance;

          if (validTs.length > 0) {
            const sorted = [...validTs].sort((a, b) => a - b);
            const meetsSafeDistance = sorted.find(
              (t) => t >= safeDistance - 1e-6
            );
            if (Number.isFinite(meetsSafeDistance)) {
              finalT = meetsSafeDistance;
            } else {
              finalT = sorted[sorted.length - 1];
            }
          }

          adjustedX = playerSnapshot.x + dirX * finalT;
          adjustedY = playerSnapshot.y + dirY * finalT;
        }

        adjustedX = clamp(adjustedX, horizontalMargin, maxX);
        adjustedY = clamp(adjustedY, verticalMargin, maxY);

        dx = adjustedX - playerSnapshot.x;
        dy = adjustedY - playerSnapshot.y;
        distance = Math.hypot(dx, dy);

        if (distance < safeDistance) {
          const fallbackMagnitude = Math.max(distance, 1e-6);
          const scale = safeDistance / fallbackMagnitude;
          adjustedX = playerSnapshot.x + dx * scale;
          adjustedY = playerSnapshot.y + dy * scale;
          adjustedX = clamp(adjustedX, horizontalMargin, maxX);
          adjustedY = clamp(adjustedY, verticalMargin, maxY);
          distance = Math.hypot(
            adjustedX - playerSnapshot.x,
            adjustedY - playerSnapshot.y
          );
        }

        x = adjustedX;
        y = adjustedY;

        const finalDistance = Math.hypot(
          x - playerSnapshot.x,
          y - playerSnapshot.y
        );
        const safeSatisfied = finalDistance >= safeDistance - 1e-3;

        GameDebugLogger.log(
          'STATE',
          safeSatisfied
            ? 'Boss spawn adjusted after clamp to respect safe distance'
            : 'Boss spawn constrained by arena bounds',
          {
            player: { x: playerSnapshot.x, y: playerSnapshot.y },
            position: { x, y },
            safeDistance,
            distance: finalDistance,
            safeSatisfied,
          }
        );
      }
    }

    return { x, y };
  }
}
