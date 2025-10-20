/**
 * Wave Manager
 *
 * Manages wave progression, spawning, and difficulty scaling.
 * Supports multiple enemy types and complex wave compositions.
 *
 * Features:
 * - Wave configuration system
 * - Dynamic difficulty scaling
 * - Multiple enemy type support
 * - Procedural wave generation
 * - Wave state tracking
 *
 * @example
 * ```javascript
 * const waveManager = new WaveManager(enemySystem, eventBus);
 * waveManager.startNextWave();
 * waveManager.update(deltaTime);
 * ```
 */

import * as CONSTANTS from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { normalizeDependencies, resolveService } from '../../../core/serviceUtils.js';

export class WaveManager {
  /**
   * Creates a new Wave Manager.
   *
   * @param {Object} enemySystem - Reference to EnemySystem
   * @param {Object} eventBus - Event bus for wave events
   */
  constructor(dependenciesOrEnemySystem = {}, legacyEventBus) {
    const isLegacySignature =
      arguments.length > 1 ||
      !dependenciesOrEnemySystem ||
      (typeof dependenciesOrEnemySystem === 'object' &&
        dependenciesOrEnemySystem !== null &&
        !('enemySystem' in dependenciesOrEnemySystem) &&
        !('eventBus' in dependenciesOrEnemySystem) &&
        !('random' in dependenciesOrEnemySystem));

    const dependencies = isLegacySignature
      ? {
          enemySystem: dependenciesOrEnemySystem,
          eventBus: legacyEventBus,
        }
      : dependenciesOrEnemySystem;

    this.dependencies = normalizeDependencies(dependencies);

    this.enemySystem =
      this.dependencies.enemySystem ||
      resolveService('enemies', this.dependencies) ||
      null;

    this.eventBus =
      this.dependencies.eventBus ||
      legacyEventBus ||
      resolveService('event-bus', this.dependencies) ||
      null;

    this._onEnemyDestroyedHandler = null;
    this._isEnemyDestroyedListenerActive = false;
    this._enemyDestroyedBus = null;

    let resolvedRandom =
      this.dependencies.random ||
      (this.enemySystem &&
        typeof this.enemySystem.getRandomScope === 'function'
        ? this.enemySystem.getRandomScope('wave-manager', {
            label: 'wave-manager',
          })
        : null) ||
      resolveService('random', this.dependencies) ||
      null;

    if (!resolvedRandom || typeof resolvedRandom.float !== 'function') {
      resolvedRandom = new RandomService();
    }

    this.random = resolvedRandom;
    this.randomScopeLabels = {
      spawn: 'wave-manager:spawn',
      variants: 'wave-manager:variants',
      fragments: 'wave-manager:fragments',
    };
    this.randomScopeSeeds = {};
    this.randomScopes = this.createRandomScopes(this.random);
    this.captureRandomScopeSeeds();
    this.randomSequences = { spawn: 0, variants: 0, fragments: 0 };
    this._fallbackRandom = null;

    const enemyTypes = CONSTANTS.ENEMY_TYPES || {};
    this.enemyTypeKeys = {
      asteroid: 'asteroid',
      drone: enemyTypes.drone?.key || 'drone',
      mine: enemyTypes.mine?.key || 'mine',
      hunter: enemyTypes.hunter?.key || 'hunter',
    };
    this.bossEnemyKey = (CONSTANTS.BOSS_CONFIG && CONSTANTS.BOSS_CONFIG.key) || 'boss';
    this.enemyTypeDefaults = {
      drone: enemyTypes.drone || {},
      mine: enemyTypes.mine || {},
      hunter: enemyTypes.hunter || {},
    };

    // Wave state
    this.currentWave = 0;
    this.waveInProgress = false;
    this.wavePaused = false;
    this.waveStartTime = 0;
    this.waveEndTime = 0;

    // Spawn tracking
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.totalEnemiesThisWave = 0;
    this.totalAsteroidEnemiesThisWave = 0;
    this.asteroidsSpawnedThisWave = 0;
    this.asteroidsKilledThisWave = 0;
    this.spawnQueue = [];
    this._legacyRegisteredEnemies = new WeakSet();

    // Timers
    this.spawnTimer = 0;
    this.spawnDelay = CONSTANTS.WAVE_SPAWN_DELAY || 1.0;
    this.spawnDelayMultiplier = 1;
    this.waveDelay = CONSTANTS.WAVE_BREAK_TIME || 10.0; // WAVE-004: Usar WAVE_BREAK_TIME para paridade com sistema legado
    this.waveCountdown = 0;

    // Wave configurations
    this.waveConfigs = this.loadWaveConfigurations();

    this.connectEventListeners();

    console.log('[WaveManager] Initialized');
  }

  /**
   * Loads predefined wave configurations.
   * Can be extended in the future to support multiple enemy types.
   *
   * @returns {Map<number, Object>} Wave configurations by wave number
   */
  loadWaveConfigurations() {
    const configs = new Map();

    // Early waves: Small asteroids
    for (let i = 1; i <= 3; i++) {
      configs.set(i, {
        isBossWave: false,
        enemies: [
          {
            type: 'asteroid',
            count: 3 + i,
            size: 'small',
            variant: 'common'
          }
        ]
      });
    }

    // Mid waves: Mixed sizes
    for (let i = 4; i <= 6; i++) {
      configs.set(i, {
        isBossWave: false,
        enemies: [
          {
            type: 'asteroid',
            count: 2 + i,
            size: 'medium',
            variant: 'common'
          },
          {
            type: 'asteroid',
            count: 2,
            size: 'small',
            variant: 'common'
          }
        ]
      });
    }

    // Later waves: Introduce variants and combatants
    for (let i = 7; i <= 12; i++) {
      const baseGroups = [
        {
          type: 'asteroid',
          count: 3,
          size: 'large',
          variant: 'common'
        },
        {
          type: 'asteroid',
          count: 2,
          size: 'medium',
          variant: 'iron'
        },
        {
          type: 'asteroid',
          count: Math.floor(i / 3),
          size: 'small',
          variant: 'volatile'
        }
      ];

      const baseCount = this.computeBaseEnemyCount(i);

      if (i >= 8) {
        const droneCount = this.computeSupportCount('drone', i, baseCount);
        const droneGroup = this.createSupportGroup('drone', droneCount);
        if (droneGroup) {
          baseGroups.push(droneGroup);
        }
      }

      if (i >= 10) {
        const mineCount = this.computeSupportCount('mine', i, baseCount);
        const mineGroup = this.createSupportGroup('mine', mineCount);
        if (mineGroup) {
          baseGroups.push(mineGroup);
        }
      }

      configs.set(i, { isBossWave: false, enemies: baseGroups });
    }

    // Waves 13+: Dynamic generation
    // (handled by generateDynamicWave)

    return configs;
  }

  connectEventListeners() {
    const eventBus = this.eventBus;
    if (!eventBus || typeof eventBus.on !== 'function') {
      return;
    }

    if (!this._onEnemyDestroyedHandler) {
      this._onEnemyDestroyedHandler = (data) => this.onEnemyDestroyed(data);
    }

    if (this._enemyDestroyedBus && this._enemyDestroyedBus !== eventBus) {
      this.disconnect();
    }

    if (this._isEnemyDestroyedListenerActive) {
      return;
    }

    // WAVE-004: Conectar ao evento de destruição para progressão automática de ondas
    eventBus.on('enemy-destroyed', this._onEnemyDestroyedHandler);
    this._enemyDestroyedBus = eventBus;
    this._isEnemyDestroyedListenerActive = true;
  }

  disconnect() {
    const bus = this._enemyDestroyedBus || this.eventBus;

    if (bus && typeof bus.off === 'function' && this._onEnemyDestroyedHandler) {
      bus.off('enemy-destroyed', this._onEnemyDestroyedHandler);
    }

    this._isEnemyDestroyedListenerActive = false;
    this._enemyDestroyedBus = null;
  }

  cloneWaveConfig(config = {}) {
    if (!config || typeof config !== 'object') {
      return { isBossWave: false, enemies: [] };
    }

    const cloned = {
      ...config,
      enemies: Array.isArray(config.enemies)
        ? config.enemies.map((group) => ({ ...group }))
        : [],
    };

    if (config.boss) {
      cloned.boss = { ...config.boss };
    }

    if (Array.isArray(config.supportGroups)) {
      cloned.supportGroups = config.supportGroups.map((group) => ({ ...group }));
    }

    if (config.metadata && typeof config.metadata === 'object') {
      cloned.metadata = { ...config.metadata };
    }

    return cloned;
  }

  isBossWave(waveNumber) {
    if (!Number.isFinite(waveNumber) || waveNumber <= 0) {
      return false;
    }

    const interval = Number(CONSTANTS.WAVE_BOSS_INTERVAL) || 0;
    if (interval <= 0) {
      return false;
    }

    const normalizedInterval = Math.max(1, Math.floor(interval));
    return normalizedInterval > 0 && waveNumber % normalizedInterval === 0;
  }

  /**
   * Generates a dynamic wave configuration based on wave number.
   * Used for waves beyond predefined configurations.
   *
   * @param {number} waveNumber - The wave number
   * @returns {Object} Wave configuration
   */
  generateDynamicWave(waveNumber) {
    const baseCount = this.computeBaseEnemyCount(waveNumber);

    const enemies = [];
    // WAVE-006: Distribuição de tamanhos configurável via flag
    const useLegacyDistribution =
      CONSTANTS.PRESERVE_LEGACY_SIZE_DISTRIBUTION ?? true;

    const normalizedBaseCount = Math.max(
      0,
      Number.isFinite(baseCount) ? baseCount : 0
    );

    const metadata = {};
    const waveManagerSpawnsAsteroids = this.shouldWaveManagerSpawnAsteroids();
    const strictLegacySequence = this.isStrictLegacySpawnSequenceEnabled();
    const distributionWeights = this.getAsteroidDistributionWeights(useLegacyDistribution);

    if (waveManagerSpawnsAsteroids && normalizedBaseCount > 0) {
      const distributionLabel = useLegacyDistribution
        ? 'legacy-50-30-20'
        : 'mixed-30-40-30';

      if (strictLegacySequence) {
        const groupMetadata = {
          spawnDistribution: distributionLabel,
          strictLegacySequence: true,
          distributionWeights: { ...distributionWeights },
        };

        enemies.push({
          type: 'asteroid',
          count: normalizedBaseCount,
          size: null,
          variant: null,
          metadata: groupMetadata,
        });

        // In strict legacy mode, asteroid size rolls happen during spawn to
        // maintain the exact random call order used by the legacy
        // EnemySystem. Consumers must therefore tolerate null/auto sizes in
        // the wave configuration and rely on spawn-time resolution instead.

        metadata.spawnDistribution = distributionLabel;
        metadata.strictLegacySequence = true;
        metadata.targetAsteroidCount = normalizedBaseCount;
        metadata.distributionWeights = { ...distributionWeights };
      } else {
        const {
          sequence: asteroidSequence,
          counts: asteroidCounts,
        } = this.buildAsteroidSpawnSequence(
          normalizedBaseCount,
          distributionWeights
        );

        asteroidSequence.forEach((size, index) => {
          enemies.push({
            type: 'asteroid',
            count: 1,
            size,
            variant: null,
            spawnIndexBase: index,
          });
        });

        metadata.asteroidCounts = { ...asteroidCounts };
        metadata.asteroidSpawnOrder = asteroidSequence.slice();
        metadata.spawnDistribution = distributionLabel;
        metadata.distributionWeights = { ...distributionWeights };
      }
    }

    const supportWeights = this.computeSupportWeights(waveNumber);
    for (const support of supportWeights) {
      const supportCount = this.computeSupportCount(
        support.key,
        waveNumber,
        baseCount,
        support.weight
      );
      const supportGroup = this.createSupportGroup(support.key, supportCount);
      if (supportGroup) {
        enemies.push(supportGroup);
      }
    }

    if (Object.keys(metadata).length > 0) {
      metadata.generator = 'dynamic';
    }

    const config = { isBossWave: false, enemies };

    if (Object.keys(metadata).length > 0) {
      config.metadata = metadata;
    }

    return config;
  }

  getAsteroidDistributionWeights(
    useLegacy = CONSTANTS.PRESERVE_LEGACY_SIZE_DISTRIBUTION ?? true
  ) {
    if (useLegacy) {
      return { large: 0.5, medium: 0.3, small: 0.2 };
    }

    return { large: 0.3, medium: 0.4, small: 0.3 };
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

  /**
   * Builds a deterministic asteroid spawn sequence by sampling individual spawns
   * using the provided size distribution. Returns both the ordered sequence and
   * aggregate counts to aid accounting/telemetry.
   *
   * @param {number} targetCount - Number of asteroids to spawn
   * @param {Object} distribution - Size weights (e.g., { large: 0.5, medium: 0.3, small: 0.2 })
   * @returns {{sequence: string[], counts: Object}}
   */
  buildAsteroidSpawnSequence(targetCount = 0, distribution = {}) {
    const sanitizedCount = Math.max(0, Math.floor(Number(targetCount) || 0));
    const { weights, total } = this.normalizeAsteroidDistribution(distribution);

    const weightEntries = Object.entries(weights).filter(([, weight]) => weight > 0);
    const totalWeight = total > 0 ? total : weightEntries.reduce((sum, [, weight]) => sum + weight, 0);

    const scopedRandom = this.createScopedRandom('spawn', 'asteroid-size');
    const sizeRandom =
      (scopedRandom && scopedRandom.random) ||
      this.resolveScopedRandom(this.getRandomScope('spawn'), 'spawn', 'asteroid-size');

    let resolvedRandom = sizeRandom;
    if (
      !resolvedRandom ||
      (typeof resolvedRandom.float !== 'function' &&
        typeof resolvedRandom.range !== 'function')
    ) {
      if (!this._fallbackRandom) {
        this._fallbackRandom = new RandomService('wave-manager:fallback');
      }

      resolvedRandom = this._fallbackRandom.fork('wave-manager:asteroid-size-fallback');
    }

    const selectSize = () => {
      if (!weightEntries.length || totalWeight <= 0 || !resolvedRandom) {
        return weightEntries.length ? weightEntries[0][0] : 'small';
      }

      let roll;
      if (typeof resolvedRandom.range === 'function') {
        roll = resolvedRandom.range(0, totalWeight);
      } else {
        const base =
          typeof resolvedRandom.float === 'function'
            ? resolvedRandom.float()
            : 0;
        roll = base * totalWeight;
      }

      for (let i = 0; i < weightEntries.length; i += 1) {
        const [key, weight] = weightEntries[i];
        if (weight <= 0) {
          continue;
        }

        if (roll < weight) {
          return key;
        }

        roll -= weight;
      }

      return weightEntries[weightEntries.length - 1][0];
    };

    const sequence = [];
    const counts = { large: 0, medium: 0, small: 0 };

    for (let i = 0; i < sanitizedCount; i += 1) {
      const size = selectSize();
      sequence.push(size);
      if (typeof counts[size] !== 'number') {
        counts[size] = 0;
      }
      counts[size] += 1;
    }

    return { sequence, counts };
  }

  resolveAsteroidSpawnSize(
    random,
    {
      distribution = this.getAsteroidDistributionWeights(),
      strict = this.isStrictLegacySpawnSequenceEnabled(),
    } = {}
  ) {
    const { weights, total } = this.normalizeAsteroidDistribution(distribution);
    const fallbackRandom = this.getRandomService();

    let spawnRandom = random;
    if (
      !spawnRandom ||
      (typeof spawnRandom.float !== 'function' && typeof spawnRandom.range !== 'function')
    ) {
      spawnRandom = this.resolveScopedRandom(random, 'spawn', 'wave-spawn:size');
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

    if (strict) {
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

    const totalWeight = total > 0 ? total : sizeOrder.reduce((sum, key) => sum + weights[key], 0);
    if (totalWeight <= 0) {
      return sizeOrder[sizeOrder.length - 1];
    }

    let roll;
    if (spawnRandom && typeof spawnRandom.range === 'function') {
      roll = spawnRandom.range(0, totalWeight);
    } else {
      roll = drawFloat() * totalWeight;
    }

    for (const size of sizeOrder) {
      const weight = weights[size];
      if (weight <= 0) {
        continue;
      }

      if (roll < weight) {
        return size;
      }

      roll -= weight;
    }

    return sizeOrder[sizeOrder.length - 1];
  }

  generateBossWave(waveNumber) {
    const bossDefaults = CONSTANTS.BOSS_CONFIG || {};
    const baseCount = this.computeBaseEnemyCount(waveNumber);

    const supportGroups = [];

    const droneCount = this.computeSupportCount('drone', waveNumber, baseCount);
    if (droneCount > 0) {
      const droneGroup = this.createSupportGroup('drone', droneCount);
      if (droneGroup) {
        supportGroups.push(droneGroup);
      }
    }

    const hunterCount = this.computeSupportCount('hunter', waveNumber, baseCount);
    if (hunterCount > 0) {
      const hunterGroup = this.createSupportGroup('hunter', hunterCount);
      if (hunterGroup) {
        supportGroups.push(hunterGroup);
      }
    }

    const safeDistance = Math.max(
      Number(bossDefaults.safeDistance) || 0,
      (CONSTANTS.ASTEROID_SAFE_SPAWN_DISTANCE || 200) * 2,
      (bossDefaults.radius || 60) * 2
    );

    const bossEntry = {
      type: this.bossEnemyKey || bossDefaults.key || 'boss',
      key: bossDefaults.key || this.bossEnemyKey || 'boss',
      count: 1,
      displayName: bossDefaults.displayName || 'Boss',
      radius: bossDefaults.radius,
      health: bossDefaults.health,
      healthScaling: bossDefaults.healthScaling,
      spawnStrategy: 'scripted-entrance',
      entrance: 'top-center',
      safeDistance,
      spawnOffset: Math.max(safeDistance, (bossDefaults.radius || 60) * 1.5),
      rewards: bossDefaults.rewards ? { ...bossDefaults.rewards } : undefined,
      randomScope: 'boss-spawn',
      randomParentScope: 'spawn',
      metadata: {
        minionTypes: Array.isArray(bossDefaults.minionTypes)
          ? [...bossDefaults.minionTypes]
          : undefined,
      },
    };

    return {
      isBossWave: true,
      boss: bossEntry,
      enemies: supportGroups,
      supportGroups: supportGroups.map((group) => ({ ...group })),
      metadata: {
        supportSummary: supportGroups.map((group) => ({
          type: group.type,
          count: group.count,
        })),
      },
    };
  }

  computeTotalEnemies(waveConfig) {
    if (!waveConfig || typeof waveConfig !== 'object') {
      return 0;
    }

    const supportTotal = (Array.isArray(waveConfig.enemies) ? waveConfig.enemies : []).reduce(
      (sum, group) => sum + (Number(group?.count) || 0),
      0
    );

    const bossCount = waveConfig.boss && Number.isFinite(waveConfig.boss.count)
      ? Math.max(0, Math.floor(waveConfig.boss.count))
      : 0;

    return supportTotal + bossCount;
  }

  computeAsteroidOnlyTotal(waveConfig) {
    if (!waveConfig || typeof waveConfig !== 'object') {
      return 0;
    }

    const groups = Array.isArray(waveConfig.enemies) ? waveConfig.enemies : [];

    return groups.reduce((sum, group) => {
      if (!group || group.type !== 'asteroid') {
        return sum;
      }

      const count = Number(group.count);
      return sum + (Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0);
    }, 0);
  }

  filterForLegacyAsteroidFallback(waveConfig = {}) {
    if (this.shouldWaveManagerSpawnAsteroids()) {
      return waveConfig;
    }

    const originalEnemies = Array.isArray(waveConfig.enemies)
      ? waveConfig.enemies
      : [];

    if (originalEnemies.length === 0) {
      if (!waveConfig || typeof waveConfig !== 'object') {
        return { enemies: [] };
      }

      return { ...waveConfig, enemies: [] };
    }

    const filteredEnemies = originalEnemies.filter(
      (group) => group && group.type !== 'asteroid'
    );

    if (filteredEnemies.length === originalEnemies.length) {
      return waveConfig;
    }

    const filteredConfig = {
      ...waveConfig,
      enemies: filteredEnemies.map((group) => ({ ...group })),
    };

    if (waveConfig.boss && typeof waveConfig.boss === 'object') {
      filteredConfig.boss = { ...waveConfig.boss };
    }

    if (Array.isArray(waveConfig.supportGroups)) {
      filteredConfig.supportGroups = waveConfig.supportGroups
        .filter((group) => group && group.type !== 'asteroid')
        .map((group) => ({ ...group }));
    }

    const filteredCount = originalEnemies.length - filteredEnemies.length;
    const metadata = {
      ...(waveConfig.metadata ? { ...waveConfig.metadata } : {}),
      asteroidFallbackFiltered: true,
      filteredAsteroidGroups: filteredCount,
    };

    filteredConfig.metadata = metadata;

    return filteredConfig;
  }

  shouldWaveManagerSpawnAsteroids() {
    const waveManagerHandles = CONSTANTS.WAVEMANAGER_HANDLES_ASTEROID_SPAWN ?? false;
    const useWaveManager = CONSTANTS.USE_WAVE_MANAGER ?? false;

    return Boolean(waveManagerHandles && useWaveManager);
  }

  registerActiveEnemy(enemy, { skipDuplicateCheck = false } = {}) {
    if (!enemy) {
      return false;
    }

    if (!this.waveInProgress) {
      return false;
    }

    if (this.shouldWaveManagerSpawnAsteroids()) {
      return false;
    }

    const asteroidKey =
      (this.enemyTypeKeys && this.enemyTypeKeys.asteroid)
        ? String(this.enemyTypeKeys.asteroid).toLowerCase()
        : 'asteroid';
    const candidateType =
      enemy?.type || enemy?.enemyType || enemy?.enemyKind || enemy?.kind || null;
    const normalizedCandidate =
      typeof candidateType === 'string' ? candidateType.toLowerCase() : null;

    if (normalizedCandidate !== asteroidKey) {
      return false;
    }

    if (!this._legacyRegisteredEnemies) {
      this._legacyRegisteredEnemies = new WeakSet();
    }

    if (this._legacyRegisteredEnemies.has(enemy)) {
      return false;
    }

    this._legacyRegisteredEnemies.add(enemy);

    const coerce = (value) => (Number.isFinite(value) ? value : 0);

    this.enemiesSpawnedThisWave = coerce(this.enemiesSpawnedThisWave) + 1;
    this.totalEnemiesThisWave = coerce(this.totalEnemiesThisWave) + 1;
    this.totalAsteroidEnemiesThisWave =
      coerce(this.totalAsteroidEnemiesThisWave) + 1;
    this.asteroidsSpawnedThisWave = coerce(this.asteroidsSpawnedThisWave) + 1;

    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'development' &&
      typeof console !== 'undefined' &&
      typeof console.debug === 'function'
    ) {
      console.debug(
        `[WaveManager] (legacy bridge) Registered asteroid spawn ${this.asteroidsSpawnedThisWave}/${this.totalAsteroidEnemiesThisWave} for wave ${this.currentWave}`
      );
    }

    return true;
  }

  isLegacyAsteroidCompatibilityEnabled() {
    const preserveLegacy = CONSTANTS.PRESERVE_LEGACY_SIZE_DISTRIBUTION ?? true;
    if (!preserveLegacy) {
      return false;
    }

    return preserveLegacy && this.shouldWaveManagerSpawnAsteroids();
  }

  isStrictLegacySpawnSequenceEnabled() {
    if (!this.shouldWaveManagerSpawnAsteroids()) {
      return false;
    }

    if (typeof CONSTANTS.STRICT_LEGACY_SPAWN_SEQUENCE === 'boolean') {
      return CONSTANTS.STRICT_LEGACY_SPAWN_SEQUENCE;
    }

    return this.isLegacyAsteroidCompatibilityEnabled();
  }

  computeBaseEnemyCount(waveNumber) {
    const baseCount =
      (CONSTANTS.ASTEROIDS_PER_WAVE_BASE ?? 4) *
      Math.pow(CONSTANTS.ASTEROIDS_PER_WAVE_MULTIPLIER ?? 1.3, Math.max(0, waveNumber - 1));

    // WAVE-004: Usar parâmetros legados para preservar densidade de ondas (baseline WAVE-001)
    const normalizedCount = Math.floor(baseCount);
    const maxOnScreen = CONSTANTS.MAX_ASTEROIDS_ON_SCREEN ?? 20;
    return Math.min(normalizedCount, maxOnScreen);
  }

  computeSupportWeights(waveNumber) {
    const weights = [];

    if (waveNumber >= 8) {
      const droneWeight = 1 + Math.max(0, (waveNumber - 8) * 0.08);
      weights.push({ key: 'drone', weight: droneWeight });
    }

    if (waveNumber >= 10) {
      const mineWeight = 1 + Math.max(0, (waveNumber - 10) * 0.07);
      weights.push({ key: 'mine', weight: mineWeight });
    }

    if (waveNumber >= 13) {
      const hunterWeight = 1 + Math.max(0, (waveNumber - 13) * 0.1);
      weights.push({ key: 'hunter', weight: hunterWeight });
    }

    return weights;
  }

  getBaselineSupportCount(kind, waveNumber, baseCount = this.computeBaseEnemyCount(waveNumber)) {
    switch (kind) {
      case 'drone':
        if (waveNumber < 8) return 0;
        if (waveNumber === 8) return 2;
        if (waveNumber === 9) return 3;
        if (waveNumber === 10) return 3;
        if (waveNumber === 11) return 4;
        if (waveNumber === 12) return 4;
        return Math.max(
          3 + Math.floor((waveNumber - 12) / 2),
          Math.max(2, Math.round(baseCount * 0.35))
        );
      case 'mine':
        if (waveNumber < 10) return 0;
        if (waveNumber === 10) return 2;
        if (waveNumber === 11) return 3;
        if (waveNumber === 12) return 3;
        return Math.max(
          3 + Math.floor((waveNumber - 12) / 3),
          Math.max(2, Math.round(baseCount * 0.25))
        );
      case 'hunter':
        if (waveNumber < 13) return 0;
        if (waveNumber === 13) return 1;
        if (waveNumber === 14) return 1;
        return Math.max(
          1 + Math.floor((waveNumber - 13) / 2),
          Math.max(1, Math.round(baseCount * 0.18))
        );
      default:
        return 0;
    }
  }

  computeSupportCount(
    kind,
    waveNumber,
    baseCount = this.computeBaseEnemyCount(waveNumber),
    weight = 1
  ) {
    const baseline = this.getBaselineSupportCount(kind, waveNumber, baseCount);
    if (baseline <= 0) {
      return 0;
    }

    const appliedWeight = Math.max(1, Number.isFinite(weight) ? weight : 1);
    const weighted = Math.round(baseline * appliedWeight);

    return Math.max(baseline, weighted);
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
          pulseSpeed: mineDefaults.pulseSpeed,
          pulseAmount: mineDefaults.pulseAmount,
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
        return null;
    }
  }

  /**
   * Selects a random variant weighted by wave number.
   *
   * @deprecated Asteroid variants are now delegated to EnemySystem.decideVariant().
   * Retained for non-asteroid enemy types that still rely on the legacy
   * WaveManager-driven variant rolls.
   *
   * @param {Array<string>} variants - Available variants
   * @param {number} waveNumber - Current wave
   * @returns {string} Selected variant
   */
  selectRandomVariant(variants, waveNumber, random = this.getRandomScope('variants')) {
    const variantRandom = this.resolveScopedRandom(random, 'variants', 'variant-roll');

    // Higher waves have more chance of rare variants
    const roll = variantRandom.float();

    if (waveNumber < 5) {
      return 'common'; // Early waves are mostly common
    }

    if (roll < 0.5) return 'common';
    if (roll < 0.7) return 'iron';
    if (roll < 0.85) return 'gold';
    if (roll < 0.95) return 'crystal';
    if (roll < 0.98 && variants.includes('volatile')) return 'volatile';
    if (variants.includes('parasite')) return 'parasite';

    return 'common';
  }

  /**
   * Starts the next wave.
   *
   * @returns {boolean} True if wave started successfully
   */
  startNextWave() {
    if (this.waveInProgress) {
      console.warn('[WaveManager] Cannot start wave - wave already in progress');
      return false;
    }

    this.currentWave++;
    this.waveInProgress = true;
    this.waveStartTime = Date.now();
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.asteroidsSpawnedThisWave = 0;
    this.asteroidsKilledThisWave = 0;
    this.totalAsteroidEnemiesThisWave = 0;
    this.spawnQueue = [];
    this._legacyRegisteredEnemies = new WeakSet();

    const waveNumber = this.currentWave;
    const waveManagerSpawnsAsteroids = this.shouldWaveManagerSpawnAsteroids();
    const legacyCompatibilityEnabled = this.isLegacyAsteroidCompatibilityEnabled();
    let config;

    if (this.isBossWave(waveNumber)) {
      config = this.generateBossWave(waveNumber);
    } else {
      if (legacyCompatibilityEnabled) {
        config = this.generateDynamicWave(waveNumber);
      } else {
        const predefined = this.waveConfigs.get(waveNumber);
        config = predefined
          ? this.cloneWaveConfig(predefined)
          : this.generateDynamicWave(waveNumber);
      }
      config.isBossWave = false;
    }

    config.isBossWave = Boolean(config.isBossWave);

    const effectiveConfig = this.filterForLegacyAsteroidFallback(config);
    effectiveConfig.isBossWave = Boolean(effectiveConfig.isBossWave);

    const sharedSpawnDelayMultiplier =
      this.resolveWaveSpawnDelayMultiplier(effectiveConfig);
    effectiveConfig.spawnDelayMultiplier = sharedSpawnDelayMultiplier;

    let computedTotalEnemies = this.computeTotalEnemies(effectiveConfig);
    let asteroidOnlyTotal = this.computeAsteroidOnlyTotal(effectiveConfig);

    if (legacyCompatibilityEnabled && !waveManagerSpawnsAsteroids) {
      computedTotalEnemies = 0;
      asteroidOnlyTotal = 0;
    }

    this.totalEnemiesThisWave = computedTotalEnemies;
    this.totalAsteroidEnemiesThisWave = asteroidOnlyTotal;

    const waveEventPayload = {
      wave: waveNumber,
      totalEnemies: this.totalEnemiesThisWave,
      asteroidTotal: asteroidOnlyTotal,
      isBossWave: effectiveConfig.isBossWave,
      spawnDelayMultiplier: sharedSpawnDelayMultiplier,
    };

    if (this.eventBus) {
      this.eventBus.emit('wave-started', waveEventPayload);

      if (
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV === 'development'
      ) {
        this.eventBus.emit('wave-started-debug', {
          ...waveEventPayload,
          config: this.cloneWaveConfig(effectiveConfig),
        });
      }

      if (effectiveConfig.isBossWave) {
        const supportGroups = Array.isArray(effectiveConfig.supportGroups)
          ? effectiveConfig.supportGroups.map((group) => ({ ...group }))
          : Array.isArray(effectiveConfig.enemies)
            ? effectiveConfig.enemies.map((group) => ({ ...group }))
            : [];

        this.eventBus.emit('boss-wave-started', {
          wave: waveNumber,
          totalEnemies: this.totalEnemiesThisWave,
          asteroidTotal: asteroidOnlyTotal,
          boss: effectiveConfig.boss ? { ...effectiveConfig.boss } : null,
          support: supportGroups,
          config: this.cloneWaveConfig(effectiveConfig),
        });
      }
    }

    if (effectiveConfig.isBossWave) {
      this.queueBossWaveSpawns(effectiveConfig);
    } else {
      this.spawnWave(effectiveConfig);
    }

    console.log(
      `[WaveManager] Started wave ${waveNumber} (${this.totalEnemiesThisWave} enemies${
        effectiveConfig.isBossWave ? ', boss wave' : ''
      })`
    );
    return true;
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

    const spawnDelayRandom = this.resolveScopedRandom(
      this.randomScopes?.spawn,
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
   */
  spawnWave(waveConfig) {
    const worldBounds = this.enemySystem.getCachedWorld()?.getBounds() ||
                       { width: 800, height: 600 };
    const player = this.enemySystem.getCachedPlayer();
    const safeDistance = CONSTANTS.ASTEROID_SAFE_SPAWN_DISTANCE || 200;
    const compatibilityMode = this.isLegacyAsteroidCompatibilityEnabled();
    const useLegacyDistribution = CONSTANTS.PRESERVE_LEGACY_SIZE_DISTRIBUTION ?? true;
    const strictLegacySequence = this.isStrictLegacySpawnSequenceEnabled();
    const defaultDistributionWeights = this.getAsteroidDistributionWeights(
      useLegacyDistribution
    );

    const spawnDelayMultiplier = this.resolveWaveSpawnDelayMultiplier(waveConfig);
    this.spawnDelayMultiplier = spawnDelayMultiplier;
    const effectiveSpawnDelay = this.spawnDelay * spawnDelayMultiplier;

    const enemyGroups = Array.isArray(waveConfig?.enemies)
      ? waveConfig.enemies
      : [];

    const waveManagerSpawnsAsteroids = this.shouldWaveManagerSpawnAsteroids();

    for (const enemyGroup of enemyGroups) {
      if (!enemyGroup || typeof enemyGroup !== 'object') {
        continue;
      }

      const isAsteroid = enemyGroup.type === 'asteroid';

      if (isAsteroid && !waveManagerSpawnsAsteroids) {
        continue;
      }

      const groupCount = Math.max(0, Math.floor(Number(enemyGroup.count) || 0));
      if (groupCount <= 0) {
        continue;
      }

      for (let i = 0; i < groupCount; i++) {
        const spawnContext =
          strictLegacySequence && isAsteroid
            ? this.createLegacyAsteroidScopedRandom()
            : this.createScopedRandom('spawn', 'wave-spawn');
        // WAVE-006: Posicionamento configurável via flag
        const useLegacyPositioning =
          CONSTANTS.PRESERVE_LEGACY_POSITIONING ?? true;

        let position;
        if (useLegacyPositioning && isAsteroid) {
          // Legacy: spawn on one of 4 edges (matches baseline behavior)
          position = this.calculateEdgeSpawnPosition(
            worldBounds,
            spawnContext.random
          );
        } else {
          // Modern: spawn at safe distance from player
          position = this.calculateSafeSpawnPosition(
            worldBounds,
            player,
            safeDistance,
            spawnContext.random
          );
        }

        const {
          count: _omittedCount,
          spawnIndexBase: groupSpawnIndexBase,
          metadata: groupMetadata,
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

          resolvedSize = this.resolveAsteroidSpawnSize(spawnContext.random, {
            distribution: distributionForGroup,
            strict: strictLegacySequence,
          });
        }

        const enemyConfig = {
          ...groupConfig,
          type: groupConfig.type || enemyGroup.type,
          size: resolvedSize,
          variant:
            Object.prototype.hasOwnProperty.call(groupConfig, 'variant')
              ? groupConfig.variant
              : enemyGroup.variant,
          x: position.x,
          y: position.y,
          wave: this.currentWave,
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
        } else if (isAsteroid && strictLegacySequence) {
          enemyConfig.metadata = { spawnIndex, resolvedSize };
        }

        if (spawnContext.random?.fork) {
          enemyConfig.random = spawnContext.random.fork('asteroid-core');
          enemyConfig.randomScope = 'spawn';
        }

        // Use centralized acquisition path when available for factory-backed enemies
        let enemy;
        let registeredEnemy = false;

        if (
          this.enemySystem &&
          typeof this.enemySystem.acquireEnemyViaFactory === 'function'
        ) {
          enemy = this.enemySystem.acquireEnemyViaFactory(enemyGroup.type, enemyConfig);
          registeredEnemy = Boolean(enemy);
        } else if (this.enemySystem?.factory) {
          const factoryHasType =
            typeof this.enemySystem.factory.hasType === 'function'
              ? this.enemySystem.factory.hasType(enemyGroup.type)
              : true;

          if (factoryHasType && typeof this.enemySystem.factory.create === 'function') {
            enemy = this.enemySystem.factory.create(enemyGroup.type, enemyConfig);
          } else if (typeof this.enemySystem.acquireAsteroid === 'function') {
            enemy = this.enemySystem.acquireAsteroid(enemyConfig);
          }
        } else if (typeof this.enemySystem?.acquireAsteroid === 'function') {
          // Legacy: Direct Asteroid creation
          enemy = this.enemySystem.acquireAsteroid(enemyConfig);
        }

        if (!enemy && typeof this.enemySystem?.acquireAsteroid === 'function') {
          enemy = this.enemySystem.acquireAsteroid(enemyConfig);
        }

        if (enemy && !registeredEnemy) {
          if (this.enemySystem && typeof this.enemySystem.registerActiveEnemy === 'function') {
            this.enemySystem.registerActiveEnemy(enemy, { skipDuplicateCheck: true });
            registeredEnemy = true;
          } else {
            console.warn(
              '[WaveManager] Cannot register enemy - registerActiveEnemy() not available on EnemySystem'
            );
          }
        }

        if (enemy) {
          this.enemiesSpawnedThisWave++;
          if (compatibilityMode && isAsteroid) {
            this.asteroidsSpawnedThisWave++;
          }
          if (
            registeredEnemy &&
            typeof process !== 'undefined' &&
            process.env?.NODE_ENV === 'development' &&
            typeof console !== 'undefined' &&
            typeof console.debug === 'function'
          ) {
            console.debug(
              `[WaveManager] Registered enemy: type=${enemyGroup.type}, wave=${this.currentWave}, spawned=${this.enemiesSpawnedThisWave}/${this.totalEnemiesThisWave}`
            );
          }
        }
      }
    }
  }

  queueBossWaveSpawns(waveConfig = {}) {
    const queue = [];

    const sharedSpawnDelayMultiplier = this.resolveWaveSpawnDelayMultiplier(waveConfig);
    const baseConfig = {
      ...waveConfig,
      spawnDelayMultiplier: sharedSpawnDelayMultiplier,
    };

    const bossConfig = baseConfig.boss ? { ...baseConfig.boss } : null;
    if (bossConfig) {
      queue.push({
        type: 'boss',
        execute: () => this.spawnBossEnemy(bossConfig, baseConfig),
      });
    }

    const supportGroups = Array.isArray(baseConfig.enemies)
      ? baseConfig.enemies.map((group) => ({ ...group }))
      : [];

    supportGroups.forEach((group) => {
      queue.push({
        type: 'support-group',
        group,
        execute: () => this.spawnWave({ ...baseConfig, enemies: [group] }),
      });
    });

    this.spawnQueue = queue;
    this.processSpawnQueue();

    return queue;
  }

  processSpawnQueue() {
    if (!Array.isArray(this.spawnQueue)) {
      this.spawnQueue = [];
      return;
    }

    while (this.spawnQueue.length > 0) {
      const entry = this.spawnQueue.shift();

      if (!entry) {
        continue;
      }

      try {
        if (typeof entry === 'function') {
          entry();
        } else if (typeof entry.execute === 'function') {
          entry.execute();
        }
      } catch (error) {
        console.error('[WaveManager] Failed to process spawn queue entry', error);
      }
    }

    this.spawnQueue = [];
  }

  spawnBossEnemy(bossConfig = {}, waveConfig = {}) {
    if (!this.enemySystem || typeof this.enemySystem.spawnBoss !== 'function') {
      console.warn('[WaveManager] Cannot spawn boss - spawnBoss() not available on enemy system');
      return null;
    }

    const worldBounds = this.enemySystem.getCachedWorld()?.getBounds() ||
                       { width: 800, height: 600 };
    const player = this.enemySystem.getCachedPlayer();
    const safeDistance = Math.max(
      Number(bossConfig.safeDistance) || 0,
      (CONSTANTS.ASTEROID_SAFE_SPAWN_DISTANCE || 200) * 2,
      (bossConfig.radius || CONSTANTS.BOSS_CONFIG?.radius || 60) * 1.25
    );

    const spawnPosition = this.resolveBossSpawnPosition(
      bossConfig,
      worldBounds,
      player,
      safeDistance
    );

    const metadata = {
      ...(bossConfig.metadata || {}),
      wave: this.currentWave,
      isBossWave: true,
      spawnSource: 'wave-manager',
      entrance: bossConfig.entrance || 'top-center',
      supportPlan: Array.isArray(waveConfig.enemies)
        ? waveConfig.enemies.map((group) => ({ type: group.type, count: group.count }))
        : undefined,
    };

    const spawnConfig = {
      ...bossConfig,
      x: spawnPosition.x,
      y: spawnPosition.y,
      wave: this.currentWave,
      safeDistance,
      spawnStrategy: bossConfig.spawnStrategy || 'scripted-entrance',
      entrance: bossConfig.entrance || 'top-center',
      spawnOffset: bossConfig.spawnOffset,
      randomScope: bossConfig.randomScope || 'boss-spawn',
      randomParentScope: bossConfig.randomParentScope || 'spawn',
      skipWaveAccounting: true,
      metadata,
    };

    const boss = this.enemySystem.spawnBoss(spawnConfig);
    if (boss) {
      // EnemySystem.spawnBoss() will skip wave accounting when we pass the flag,
      // so we track the spawn locally for wave metrics.
      this.enemiesSpawnedThisWave += 1;
    }

    return boss;
  }

  resolveBossSpawnPosition(
    bossConfig = {},
    bounds = { width: 800, height: 600 },
    player,
    safeDistance = (CONSTANTS.ASTEROID_SAFE_SPAWN_DISTANCE || 200) * 2
  ) {
    const spawnPosition = bossConfig.spawnPosition || {};
    if (Number.isFinite(spawnPosition.x) && Number.isFinite(spawnPosition.y)) {
      return { x: spawnPosition.x, y: spawnPosition.y };
    }

    const entrance = bossConfig.entrance || 'top-center';
    const offset = bossConfig.spawnOffset || Math.max(safeDistance, (bossConfig.radius || 60) * 1.5);

    let x = bounds.width / 2;
    let y = -offset;

    switch (entrance) {
      case 'center':
        x = bounds.width / 2;
        y = bounds.height / 2;
        break;
      case 'bottom-center':
      case 'bottom':
        x = bounds.width / 2;
        y = bounds.height + offset;
        break;
      case 'left':
      case 'left-center':
        x = -offset;
        y = bounds.height / 2;
        break;
      case 'right':
      case 'right-center':
        x = bounds.width + offset;
        y = bounds.height / 2;
        break;
      case 'top-center':
      default:
        x = bounds.width / 2;
        y = -offset;
        break;
    }

    if (player && Number.isFinite(player.x) && Number.isFinite(player.y)) {
      const dx = x - player.x;
      const dy = y - player.y;
      const distance = Math.hypot(dx, dy);

      if (distance < safeDistance) {
        if (distance === 0) {
          x = player.x;
          y = player.y - safeDistance;
        } else {
          const scale = safeDistance / distance;
          x = player.x + dx * scale;
          y = player.y + dy * scale;
        }
      }
    }

    return { x, y };
  }

  /**
   * Calculates a safe spawn position away from player.
   *
   * @param {Object} bounds - World bounds
   * @param {Object} player - Player object
   * @param {number} safeDistance - Minimum distance from player
   * @returns {Object} {x, y} position
   */
  calculateSafeSpawnPosition(bounds, player, safeDistance, random = this.getRandomScope('spawn')) {
    const spawnRandom = this.resolveScopedRandom(random, 'spawn', 'spawn-position');
    const margin = 50;
    let x, y, attempts = 0;
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
    random = this.getRandomScope('spawn')
  ) {
    const width = worldBounds?.width || CONSTANTS.GAME_WIDTH || 800;
    const height = worldBounds?.height || CONSTANTS.GAME_HEIGHT || 600;
    const margin =
      typeof CONSTANTS.ASTEROID_EDGE_SPAWN_MARGIN === 'number'
        ? CONSTANTS.ASTEROID_EDGE_SPAWN_MARGIN
        : 80;

    let spawnRandom = this.resolveScopedRandom(random, 'spawn', 'edge-position');

    if (!spawnRandom || typeof spawnRandom.float !== 'function') {
      const scopedFallback = this.createScopedRandom('spawn', 'edge-position');
      if (scopedFallback?.random && typeof scopedFallback.random.float === 'function') {
        spawnRandom = scopedFallback.random;
      } else {
        const baseRandom = this.getRandomService();
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
      const base = typeof spawnRandom.float === 'function'
        ? spawnRandom.float()
        : 0;
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

  resolveScopedRandom(random, scope = 'base', label = scope) {
    if (random && typeof random.float === 'function') {
      return random;
    }

    const scoped = this.createScopedRandom(scope, label);
    if (scoped?.random && typeof scoped.random.float === 'function') {
      return scoped.random;
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService('wave-manager:fallback');
    }

    return this._fallbackRandom;
  }

  /**
   * Called when an enemy is destroyed.
   */
  onEnemyDestroyed(data = {}) {
    if (!this.waveInProgress || this.totalEnemiesThisWave <= 0) {
      return;
    }

    const fragmentCount = Array.isArray(data?.fragments)
      ? data.fragments.length
      : 0;

    if (fragmentCount > 0) {
      this.totalEnemiesThisWave += fragmentCount;
      this.enemiesSpawnedThisWave += fragmentCount;
      this.totalAsteroidEnemiesThisWave += fragmentCount;
      this.asteroidsSpawnedThisWave += fragmentCount;
    }

    this.enemiesKilledThisWave++;

    const asteroidKey = this.enemyTypeKeys?.asteroid || 'asteroid';
    const destroyedEnemyType =
      data?.enemy?.type ||
      data?.enemy?.enemyType ||
      data?.enemy?.enemyKind ||
      data?.enemy?.kind ||
      data?.type ||
      null;

    if (
      destroyedEnemyType &&
      String(destroyedEnemyType).toLowerCase() === String(asteroidKey).toLowerCase()
    ) {
      this.asteroidsKilledThisWave++;
    }

    if (
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV === 'development' &&
      typeof console !== 'undefined' &&
      typeof console.debug === 'function'
    ) {
      console.debug(
        `[WaveManager] Enemy destroyed: ${this.enemiesKilledThisWave}/${this.totalEnemiesThisWave}`
      );
    }

    // Development assertion: verify accounting consistency
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') {
      this.assertAccountingConsistency();
    }

    // Check if wave is complete
    const killsCleared = this.enemiesKilledThisWave >= this.totalEnemiesThisWave;
    let activeEnemiesCleared = true;

    if (
      this.enemySystem &&
      typeof this.enemySystem.getActiveEnemyCount === 'function'
    ) {
      activeEnemiesCleared = this.enemySystem.getActiveEnemyCount() === 0;
    }

    if (killsCleared && activeEnemiesCleared) {
      this.completeWave();
    }
  }

  /**
   * Development-only assertion to verify wave accounting consistency.
   * Compares WaveManager counts against EnemySystem counts.
   * Only runs in development mode to avoid performance impact.
   */
  assertAccountingConsistency() {
    if (!this.waveInProgress || !this.enemySystem?.waveState) {
      return;
    }

    const compatibilityMode = this.isLegacyAsteroidCompatibilityEnabled();
    if (!compatibilityMode && !this.shouldWaveManagerSpawnAsteroids()) {
      return;
    }

    const waveManagerTotal = compatibilityMode
      ? this.totalAsteroidEnemiesThisWave
      : this.totalEnemiesThisWave;
    const waveManagerSpawned = compatibilityMode
      ? this.asteroidsSpawnedThisWave
      : this.enemiesSpawnedThisWave;
    const enemySystemTotal = this.enemySystem.waveState.totalAsteroids;
    const enemySystemSpawned = this.enemySystem.waveState.asteroidsSpawned;

    // Allow small discrepancies during spawn/death timing
    const totalDelta = Math.abs(waveManagerTotal - enemySystemTotal);
    const spawnedDelta = Math.abs(waveManagerSpawned - enemySystemSpawned);

    if (totalDelta > 1 || spawnedDelta > 1) {
      console.warn(
        `[WaveManager] Accounting discrepancy detected!\n` +
        `  WaveManager: ${waveManagerSpawned}/${waveManagerTotal}\n` +
        `  EnemySystem: ${enemySystemSpawned}/${enemySystemTotal}\n` +
        `  Wave: ${this.currentWave}`
      );
    }
  }

  /**
   * Completes the current wave.
   */
  completeWave() {
    if (!this.waveInProgress) return;

    this.waveInProgress = false;
    this.waveEndTime = Date.now();
    const duration = (this.waveEndTime - this.waveStartTime) / 1000;

    // Emit wave complete event
    if (this.eventBus) {
      const payload = {
        wave: this.currentWave,
        duration: duration,
        enemiesKilled: this.enemiesKilledThisWave,
      };

      this.eventBus.emit('wave-complete', payload);

      if (CONSTANTS.WAVE_MANAGER_EMIT_LEGACY_WAVE_COMPLETED ?? false) {
        this.eventBus.emit('wave-completed', payload);
      }
    }

    // Start countdown for next wave
    this.waveCountdown = this.waveDelay;

    console.log(`[WaveManager] Wave ${this.currentWave} complete in ${duration.toFixed(1)}s`);
  }

  /**
   * Updates the wave manager.
   *
   * @param {number} deltaTime - Time elapsed
   */
  update(deltaTime) {
    // Handle wave countdown
    if (!this.waveInProgress && this.waveCountdown > 0) {
      this.waveCountdown -= deltaTime;
      this.waveCountdown = Math.max(0, this.waveCountdown);
    }

    if (!this.waveInProgress && this.waveCountdown <= 0) {
      this.startNextWave();
    }
  }

  /**
   * Resets the wave manager.
   */
  reset() {
    this.disconnect();

    this.currentWave = 0;
    this.waveInProgress = false;
    this.wavePaused = false;
    this.waveStartTime = 0;
    this.waveEndTime = 0;
    this.enemiesSpawnedThisWave = 0;
    this.enemiesKilledThisWave = 0;
    this.totalEnemiesThisWave = 0;
    this.totalAsteroidEnemiesThisWave = 0;
    this.asteroidsSpawnedThisWave = 0;
    this.asteroidsKilledThisWave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveCountdown = 0;
    this.spawnDelayMultiplier = 1;
    this._legacyRegisteredEnemies = new WeakSet();
    if (this.randomSequences) {
      this.randomSequences.spawn = 0;
      this.randomSequences.variants = 0;
      this.randomSequences.fragments = 0;
    }

    this.connectEventListeners();

    console.log('[WaveManager] Reset');
  }

  /**
   * Gets the current wave state.
   *
   * @returns {Object} Wave state
   */
  getState() {
    const sanitizeCount = (value) =>
      Number.isFinite(value) ? value : 0;

    const compatibilityMode = this.isLegacyAsteroidCompatibilityEnabled();

    const totals = {
      all: sanitizeCount(this.totalEnemiesThisWave),
      asteroids: sanitizeCount(this.totalAsteroidEnemiesThisWave),
    };

    const spawnedCounts = {
      all: sanitizeCount(this.enemiesSpawnedThisWave),
      asteroids: sanitizeCount(this.asteroidsSpawnedThisWave),
    };

    const killedCounts = {
      all: sanitizeCount(this.enemiesKilledThisWave),
      asteroids: sanitizeCount(this.asteroidsKilledThisWave),
    };

    const totalForState = compatibilityMode ? totals.asteroids : totals.all;
    const spawnedForState = compatibilityMode
      ? spawnedCounts.asteroids
      : spawnedCounts.all;
    const killedForState = compatibilityMode
      ? killedCounts.asteroids
      : killedCounts.all;

    const progressDenominator = totalForState > 0 ? totalForState : 0;

    return {
      currentWave: this.currentWave,
      inProgress: this.waveInProgress,
      paused: this.wavePaused,
      spawned: spawnedForState,
      killed: killedForState,
      total: totalForState,
      totals,
      counts: {
        spawned: spawnedCounts,
        killed: killedCounts,
      },
      countdown: this.waveCountdown,
      progress:
        progressDenominator > 0 ? killedForState / progressDenominator : 0,
    };
  }

  createRandomScopes(random) {
    let baseRandom = random;
    if (!baseRandom || typeof baseRandom.fork !== 'function') {
      baseRandom = new RandomService();
      this._fallbackRandom = baseRandom;
    }

    const spawnLabel = this.randomScopeLabels?.spawn || 'wave-manager:spawn';
    const variantLabel = this.randomScopeLabels?.variants || 'wave-manager:variants';
    const fragmentLabel = this.randomScopeLabels?.fragments || 'wave-manager:fragments';

    const scopes = {
      base: baseRandom,
      spawn: baseRandom.fork(spawnLabel),
      variants: baseRandom.fork(variantLabel),
      fragments: baseRandom.fork(fragmentLabel),
    };

    this.captureRandomScopeSeeds(scopes);

    return scopes;
  }

  getRandomService() {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
      this.captureRandomScopeSeeds();
    }
    return this.randomScopes.base;
  }

  getRandomScope(scope) {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
      this.captureRandomScopeSeeds();
    }

    return this.randomScopes[scope] || this.randomScopes.base;
  }

  nextRandomSequence(scope) {
    if (!this.randomSequences) {
      this.randomSequences = {};
    }

    if (typeof this.randomSequences[scope] !== 'number') {
      this.randomSequences[scope] = 0;
    }

    const sequence = this.randomSequences[scope];
    this.randomSequences[scope] += 1;
    return sequence;
  }

  createLegacyAsteroidScopedRandom() {
    const generator = this.getRandomScope('spawn');
    const sequence = this.nextRandomSequence('spawn');
    const label = `enemy-system:asteroid-spawn:${sequence}`;

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(label),
        sequence,
      };
    }

    const fallbackBase =
      this.getRandomService() || this._fallbackRandom || new RandomService('wave-manager:fallback');

    if (typeof fallbackBase.fork === 'function') {
      return {
        random: fallbackBase.fork(`${label}:fallback`),
        sequence,
      };
    }

    return {
      random: fallbackBase,
      sequence,
    };
  }

  createScopedRandom(scope = 'spawn', label = scope) {
    const generator = this.getRandomScope(scope);
    const sequence = this.nextRandomSequence(scope);

    if (generator && typeof generator.fork === 'function') {
      return {
        random: generator.fork(`wave-manager:${label}:${sequence}`),
        sequence,
      };
    }

    const fallback = this._fallbackRandom || new RandomService();
    this._fallbackRandom = fallback;

    return {
      random: fallback.fork(`wave-manager:${label}:${sequence}`),
      sequence,
    };
  }

  captureRandomScopeSeed(scope, generator) {
    if (!generator || typeof generator.seed !== 'number') {
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
    }

    this.randomScopeSeeds[scope] = generator.seed >>> 0;
  }

  captureRandomScopeSeeds(scopes = this.randomScopes) {
    if (!scopes) {
      return;
    }

    Object.entries(scopes).forEach(([scope, generator]) => {
      this.captureRandomScopeSeed(scope, generator);
    });
  }

  reseedRandomScopes({ resetSequences = false } = {}) {
    if (!this.randomScopes) {
      this.randomScopes = this.createRandomScopes(this.random);
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
      this.captureRandomScopeSeeds();
    }

    Object.entries(this.randomScopes).forEach(([scope, generator]) => {
      if (scope === 'base' || !generator || typeof generator.reset !== 'function') {
        return;
      }

      const storedSeed = this.randomScopeSeeds?.[scope];
      if (storedSeed !== undefined) {
        generator.reset(storedSeed);
      }
    });

    if (resetSequences && this.randomSequences) {
      Object.keys(this.randomSequences).forEach((scope) => {
        this.randomSequences[scope] = 0;
      });
    }
  }
}
