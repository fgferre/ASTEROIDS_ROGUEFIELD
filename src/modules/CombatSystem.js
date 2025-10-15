// src/modules/CombatSystem.js
import * as CONSTANTS from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';

class CombatSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.commandQueue = resolveService('command-queue', this.dependencies) || null;
    this.commandQueueConsumerId = 'combat-system';
    // === ESTADO DO SISTEMA DE COMBATE ===
    this.bullets = [];
    this.currentTarget = null;
    this.targetUpdateTimer = 0;
    this.lastShotTime = 0;
    this.shootCooldown =
      Number.isFinite(CONSTANTS.COMBAT_SHOOT_COOLDOWN)
        ? Math.max(0, CONSTANTS.COMBAT_SHOOT_COOLDOWN)
        : 0.3;

    // === CONFIGURAÇÕES ===
    this.targetingRange =
      Number.isFinite(CONSTANTS.COMBAT_TARGETING_RANGE)
        ? Math.max(0, CONSTANTS.COMBAT_TARGETING_RANGE)
        : 400;
    this.baseTargetUpdateInterval = Number.isFinite(
      CONSTANTS.TARGET_UPDATE_INTERVAL
    )
      ? Math.max(0.05, CONSTANTS.TARGET_UPDATE_INTERVAL)
      : 0.15;
    this.targetUpdateInterval = this.baseTargetUpdateInterval;
    this.bulletSpeed = CONSTANTS.BULLET_SPEED;
    this.bulletLifetime =
      Number.isFinite(CONSTANTS.COMBAT_BULLET_LIFETIME)
        ? Math.max(0, CONSTANTS.COMBAT_BULLET_LIFETIME)
        : 1.8;
    this.trailLength = CONSTANTS.TRAIL_LENGTH;
    this.baseShootCooldown = this.shootCooldown;
    this.linearPredictionTime =
      Number.isFinite(CONSTANTS.COMBAT_PREDICTION_TIME)
        ? Math.max(0, CONSTANTS.COMBAT_PREDICTION_TIME)
        : 0.5;

    // === CONFIGURAÇÕES DE MIRA AVANÇADA ===
    this.aimingConfig = CONSTANTS.COMBAT_AIMING_UPGRADE_CONFIG || {};
    this.defaultDangerWeights = this.sanitizeDangerWeights(
      this.aimingConfig?.dangerWeights || {}
    );
    this.dangerWeights = this.cloneDangerWeights(this.defaultDangerWeights);
    this.defaultDynamicPredictionSettings =
      this.sanitizeDynamicPredictionSettings(
        this.aimingConfig?.dynamicPrediction || {}
      );
    if (
      !Number.isFinite(
        this.defaultDynamicPredictionSettings?.fallbackLeadTime
      )
    ) {
      this.defaultDynamicPredictionSettings.fallbackLeadTime =
        this.linearPredictionTime;
    }
    this.dynamicPredictionSettings = {
      ...this.defaultDynamicPredictionSettings,
    };
    this.targetPulseDuration =
      this.aimingConfig?.feedback?.lockPulseDuration ?? 0.35;
    this.lockLineAlpha = this.aimingConfig?.feedback?.lockLineAlpha ?? 0.35;
    this.lockHighlightAlpha =
      this.aimingConfig?.feedback?.lockHighlightAlpha ?? 0.75;
    this.predictedMarkerRadius =
      this.aimingConfig?.feedback?.predictedMarkerRadius ?? 12;

    this.targetingUpgradeLevel = 0;
    this.dangerScoreEnabled = false;
    this.dynamicPredictionEnabled = false;
    this.multiLockTargets = Math.max(
      1,
      Math.floor(this.aimingConfig?.multiLock?.baseTargetCount || 1)
    );

    // === ESTADO DE TARGETING ===
    this.targetingPriorityList = [];
    this.currentTargetLocks = [];
    this.predictedAimPoints = [];
    this.predictedAimPointsMap = new Map();
    this.currentLockAssignments = [];
    this.targetThreatCache = new Map();
    this.targetIndicatorPulse = 0;
    this.lastKnownPlayerStats = null;
    this.lastPrimaryTargetId = null;

    this.resetAimingBranchState();

    // === CACHES DE SERVIÇOS ===
    this.cachedPlayer = resolveService('player', this.dependencies);
    this.cachedEnemies = resolveService('enemies', this.dependencies);
    this.cachedPhysics = resolveService('physics', this.dependencies);
    this.bulletGlowCache = null;

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('combat', this);
    }

    this.setupEventListeners();
    this.resolveCachedServices(true);

    console.log('[CombatSystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('player-reset', () => {
      this.resolveCachedServices(true);
      this.currentTarget = null;
      this.currentTargetLocks = [];
      this.currentLockAssignments = [];
      this.targetingPriorityList = [];
      this.predictedAimPoints = [];
      this.predictedAimPointsMap = new Map();
      this.targetThreatCache.clear();
      this.targetIndicatorPulse = 0;
      this.lastKnownPlayerStats = null;
      this.lastPrimaryTargetId = null;
    });

    gameEvents.on('progression-reset', () => {
      this.resolveCachedServices(true);
      this.resetAimingBranchState();
      this.targetThreatCache.clear();
    });

    gameEvents.on('physics-reset', () => {
      this.resolveCachedServices(true);
    });

    gameEvents.on('player-died', () => {
      // Clear target when player dies (bullets keep flying)
      this.currentTarget = null;
      this.currentTargetLocks = [];
      this.currentLockAssignments = [];
      this.targetingPriorityList = [];
      this.predictedAimPoints = [];
      this.predictedAimPointsMap.clear();
      this.targetThreatCache.clear();
      this.targetIndicatorPulse = 0;
      console.log('[CombatSystem] Player died - cleared target');
    });

    gameEvents.on('upgrade-aiming-suite', (data) => {
      this.applyAimingUpgrade(data || {});
    });
  }

  resolveCachedServices(force = false) {
    if (force || !this.cachedPlayer) {
      this.cachedPlayer = resolveService('player', this.dependencies);
    }

    if (force || !this.cachedEnemies) {
      this.cachedEnemies = resolveService('enemies', this.dependencies);
    }

    if (force || !this.cachedPhysics) {
      this.cachedPhysics = resolveService('physics', this.dependencies);
    }

    if (force || !this.commandQueue) {
      this.commandQueue = resolveService('command-queue', this.dependencies) || null;
    }
  }

  getCachedPlayer() {
    if (!this.cachedPlayer) {
      this.resolveCachedServices();
    }
    return this.cachedPlayer;
  }

  // === UPDATE PRINCIPAL ===
  update(deltaTime) {
    this.resolveCachedServices();

    const player = this.cachedPlayer;
    const playerStats =
      player && typeof player.getStats === 'function'
        ? player.getStats()
        : null;
    this.lastKnownPlayerStats = playerStats || null;

    // Only target and shoot when ship hull exists (visible and alive)
    if (player && !player.isDead && !player.isRetrying && !player._quitExplosionHidden) {
      this.updateTargeting(deltaTime);

      if (playerStats) {
        this.handleShooting(deltaTime, playerStats);
      }
    }

    // Always update bullets - they keep flying even without ship hull
    this.updateBullets(deltaTime);

    const enemies = this.cachedEnemies;
    const physics = this.cachedPhysics;

    if (
      physics &&
      enemies &&
      typeof physics.forEachBulletCollision === 'function'
    ) {
      physics.forEachBulletCollision(this.bullets, (bullet, asteroid) => {
        if (!asteroid || bullet.hit) {
          return;
        }
        this.processBulletHit(bullet, asteroid, enemies);
      });
    } else if (enemies) {
      this.checkBulletCollisions(enemies);
    }
  }

  // === SISTEMA DE TARGETING ===
  updateTargeting(deltaTime) {
    this.targetIndicatorPulse = Math.max(
      0,
      this.targetIndicatorPulse - deltaTime
    );

    if (
      this.currentTarget &&
      (this.currentTarget.destroyed || !this.isValidTarget(this.currentTarget))
    ) {
      this.currentTarget = null;
      this.currentTargetLocks = [];
      this.currentLockAssignments = [];
      this.targetingPriorityList = [];
      this.predictedAimPoints = [];
      this.predictedAimPointsMap.clear();
      this.targetThreatCache.clear();
      if (this.lastPrimaryTargetId !== null && typeof gameEvents !== 'undefined') {
        gameEvents.emit('combat-target-lock', { lost: true });
      }
      this.lastPrimaryTargetId = null;
      this.targetUpdateTimer = 0;
    }

    this.targetUpdateTimer -= deltaTime;

    if (this.targetUpdateTimer <= 0) {
      this.findBestTarget();
      this.targetUpdateTimer = this.targetUpdateInterval;
    } else if (this.targetingUpgradeLevel >= 3) {
      const desiredLocks = this.computeLockCount(this.lastKnownPlayerStats);
      if (desiredLocks !== this.currentLockAssignments.length) {
        this.rebuildLockSet(desiredLocks);
      }
    }

    this.pruneInvalidLocks();
    this.refreshPredictedAimPoints();
  }

  findBestTarget() {
    const player = this.getCachedPlayer();
    if (!player || typeof player.getPosition !== 'function') {
      this.currentTarget = null;
      this.currentTargetLocks = [];
      this.currentLockAssignments = [];
      this.targetingPriorityList = [];
      return;
    }

    const playerPos = player.getPosition();
    if (!playerPos) {
      return;
    }

    const playerVelocity =
      typeof player.getVelocity === 'function' ? player.getVelocity() : null;
    const playerRadius =
      typeof player.getShieldRadius === 'function'
        ? player.getShieldRadius()
        : typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : CONSTANTS.SHIP_SIZE || 24;

    const enemies = this.cachedEnemies;
    if (!enemies) {
      return;
    }

    const candidates = [];
    const scoringEnabled = this.dangerScoreEnabled;
    this.targetThreatCache.clear();

    const processEnemy = (enemy) => {
      if (!enemy || enemy.destroyed) {
        return;
      }

      const dx = enemy.x - playerPos.x;
      const dy = enemy.y - playerPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (!Number.isFinite(distance) || distance > this.targetingRange) {
        return;
      }

      const score = scoringEnabled
        ? this.calculateDangerScore(
            enemy,
            playerPos,
            distance,
            playerVelocity,
            playerRadius
          )
        : -distance;

      const candidateEntry = {
        enemy,
        distance,
        score: scoringEnabled && score && typeof score === 'object'
          ? score.total
          : score,
      };

      if (scoringEnabled && score && typeof score === 'object') {
        candidateEntry.breakdown = score;
        candidateEntry.score = score.total;
        this.targetThreatCache.set(enemy.id, {
          enemy,
          distance,
          score: score.total,
          breakdown: score,
        });
      } else {
        this.targetThreatCache.set(enemy.id, {
          enemy,
          distance,
          score: candidateEntry.score,
          breakdown: null,
        });
      }

      candidates.push(candidateEntry);
    };

    if (typeof enemies.forEachActiveEnemy === 'function') {
      enemies.forEachActiveEnemy(processEnemy);
    } else if (typeof enemies.forEachActiveAsteroid === 'function') {
      enemies.forEachActiveAsteroid(processEnemy);
    } else if (typeof enemies.getActiveEnemies === 'function') {
      const activeEnemies = enemies.getActiveEnemies();
      for (let i = 0; i < activeEnemies.length; i += 1) {
        processEnemy(activeEnemies[i]);
      }
    } else if (typeof enemies.getAsteroids === 'function') {
      const asteroids = enemies.getAsteroids();
      for (let i = 0; i < asteroids.length; i += 1) {
        processEnemy(asteroids[i]);
      }
    }

    if (!candidates.length) {
      if (this.currentTarget && typeof gameEvents !== 'undefined') {
        gameEvents.emit('combat-target-lock', { lost: true });
      }
      this.currentTarget = null;
      this.currentTargetLocks = [];
      this.targetingPriorityList = [];
      this.predictedAimPoints = [];
      this.predictedAimPointsMap.clear();
      this.lastPrimaryTargetId = null;
      return;
    }

    const sorted = candidates.sort((a, b) => {
      if (scoringEnabled && b.score !== a.score) {
        return b.score - a.score;
      }
      if (a.distance !== b.distance) {
        return a.distance - b.distance;
      }
      return 0;
    });

    this.targetingPriorityList = sorted;

    const desiredLocks = this.computeLockCount(this.lastKnownPlayerStats);
    this.rebuildLockSet(Math.max(1, desiredLocks));

    this.currentTarget = this.currentTargetLocks[0] || null;

    const newPrimaryId = this.currentTarget ? this.currentTarget.id : null;
    if (this.currentTarget && newPrimaryId !== this.lastPrimaryTargetId) {
      this.targetIndicatorPulse = this.targetPulseDuration;
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('combat-target-lock', {
          enemyId: newPrimaryId,
          variant: this.currentTarget.variant || 'common',
          score: sorted[0]?.score ?? 0,
          lockCount: this.currentTargetLocks.length,
        });
      }
    }

    this.lastPrimaryTargetId = newPrimaryId;
  }

  isValidTarget(target) {
    if (!target || target.destroyed) return false;

    const player = this.getCachedPlayer();
    if (!player || typeof player.getPosition !== 'function') {
      return false;
    }

    const playerPos = player.getPosition();
    const dx = target.x - playerPos.x;
    const dy = target.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= this.targetingRange;
  }

  // === SISTEMA DE TIRO ===
  handleShooting(deltaTime, playerStats) {
    this.lastShotTime += deltaTime;

    if (!this.canShoot()) return;

    const player = this.getCachedPlayer();
    if (!player || typeof player.getPosition !== 'function') return;

    const playerPos = player.getPosition();
    if (!playerPos) return;

    const lockTargets =
      this.currentTargetLocks && this.currentTargetLocks.length
        ? this.currentTargetLocks
        : this.currentTarget
        ? [this.currentTarget]
        : [];

    if (!lockTargets.length) {
      return;
    }

    const totalShots = Math.max(1, Math.floor(playerStats?.multishot ?? 1));
    const usingAdvancedBattery = this.targetingUpgradeLevel >= 3;

    const assignments = usingAdvancedBattery
      ? (Array.isArray(this.currentLockAssignments) &&
          this.currentLockAssignments.length
          ? this.currentLockAssignments
          : lockTargets.map((enemy, index) => ({
              enemy,
              predictedAim:
                this.predictedAimPointsMap.get(enemy.id) ||
                this.getPredictedTargetPosition(enemy, playerPos) ||
                { x: enemy.x, y: enemy.y },
              fireOrigin: { ...playerPos },
              fireOffset: { x: 0, y: 0 },
              duplicateIndex: index,
              duplicateCount: lockTargets.length,
              index,
            })))
      : lockTargets.map((enemy, index) => ({
          enemy,
          predictedAim:
            this.predictedAimPointsMap.get(enemy.id) ||
            this.getPredictedTargetPosition(enemy, playerPos) ||
            { x: enemy.x, y: enemy.y },
          fireOrigin: { ...playerPos },
          fireOffset: { x: 0, y: 0 },
          duplicateIndex: index,
          duplicateCount: lockTargets.length,
          index,
        }));

    if (!assignments.length) {
      return;
    }

    const multiLockActive = usingAdvancedBattery && lockTargets.length > 1;

    const firedTargets = [];

    for (let shotIndex = 0; shotIndex < totalShots; shotIndex += 1) {
      const assignment = usingAdvancedBattery
        ? assignments[Math.min(assignments.length - 1, shotIndex)] ||
          assignments[assignments.length - 1]
        : assignments[Math.min(assignments.length - 1, 0)];

      if (!assignment || !assignment.enemy) {
        continue;
      }

      const duplicateCount = Math.max(1, assignment.duplicateCount || 1);
      const duplicateIndex = assignment.duplicateIndex || 0;

      let fireOrigin = assignment.fireOrigin
        ? { ...assignment.fireOrigin }
        : { ...playerPos };
      let aimPoint = assignment.predictedAim
        ? { ...assignment.predictedAim }
        : null;

      if (!aimPoint) {
        const predicted =
          this.getPredictedTargetPosition(assignment.enemy, playerPos) ||
          { x: assignment.enemy.x, y: assignment.enemy.y };
        if (usingAdvancedBattery) {
          const offset = this.computeParallelOffset(
            playerPos,
            predicted,
            duplicateIndex,
            duplicateCount,
            assignment.enemy
          );
          fireOrigin = {
            x: playerPos.x + offset.x,
            y: playerPos.y + offset.y,
          };
          aimPoint = {
            x: predicted.x + offset.x,
            y: predicted.y + offset.y,
          };
        } else {
          aimPoint = predicted;
          fireOrigin = { ...playerPos };
        }
      }

      if (usingAdvancedBattery && assignment.fireOffset) {
        fireOrigin = {
          x: playerPos.x + assignment.fireOffset.x,
          y: playerPos.y + assignment.fireOffset.y,
        };
        aimPoint = {
          x: (assignment.predictedAim?.x ?? aimPoint.x),
          y: (assignment.predictedAim?.y ?? aimPoint.y),
        };
      }

      if (!usingAdvancedBattery && totalShots > 1) {
        const shouldApplySpread =
          totalShots > assignments.length || assignments.length <= 1;
        if (shouldApplySpread) {
          aimPoint = this.applyMultishotSpread(
            playerPos,
            aimPoint,
            shotIndex,
            totalShots
          );
        }
      }

      this.createBullet(fireOrigin, aimPoint, playerStats.damage);
      firedTargets.push({
        enemyId: assignment.enemy?.id ?? null,
        position: { ...aimPoint },
      });
    }

    this.lastShotTime = 0;

      if (typeof gameEvents !== 'undefined') {
        const firstTarget = firedTargets[0]?.position || null;
        gameEvents.emit('weapon-fired', {
          position: playerPos,
          target: firstTarget,
          weaponType: 'basic',
          primaryTargetId: this.currentTarget ? this.currentTarget.id : null,
          targeting: {
            dynamicPrediction: this.usingDynamicPrediction(),
            lockCount: lockTargets.length,
            multiLockActive,
            predictedPoints: firedTargets.map((entry) => ({
              enemyId: entry.enemyId,
              position: entry.position,
            })),
          },
        });
      }
  }

  canShoot() {
    return (
      this.lastShotTime >= this.shootCooldown &&
      this.currentTarget &&
      !this.currentTarget.destroyed &&
      this.isValidTarget(this.currentTarget)
    );
  }

  getPredictedTargetPosition(enemy = this.currentTarget, playerPos = null) {
    if (!enemy) return null;

    const player = this.getCachedPlayer();
    const origin =
      playerPos ||
      (player && typeof player.getPosition === 'function'
        ? player.getPosition()
        : null);

    if (!origin) {
      return null;
    }

    if (this.usingDynamicPrediction()) {
      const intercept = this.calculateDynamicIntercept(origin, enemy);
      if (intercept) {
        return intercept;
      }
    }

    return this.calculateLinearPrediction(origin, enemy);
  }

  applyMultishotSpread(playerPos, targetPos, shotIndex, totalShots) {
    const spreadStep = Number.isFinite(CONSTANTS.COMBAT_MULTISHOT_SPREAD_STEP)
      ? CONSTANTS.COMBAT_MULTISHOT_SPREAD_STEP
      : 0.3;
    const spreadAngle = (shotIndex - (totalShots - 1) / 2) * spreadStep;

    const dx = targetPos.x - playerPos.x;
    const dy = targetPos.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return targetPos;

    const baseAngle = Math.atan2(dy, dx);
    const finalAngle = baseAngle + spreadAngle;

    return {
      x: playerPos.x + Math.cos(finalAngle) * distance,
      y: playerPos.y + Math.sin(finalAngle) * distance,
    };
  }

  toNumber(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  sanitizeWeightMap(source = {}, fallback = 0) {
    const map = {};
    if (!source || typeof source !== 'object') {
      return map;
    }

    Object.entries(source).forEach(([key, value]) => {
      const numeric = Number(value);
      if (Number.isFinite(numeric)) {
        map[key] = numeric;
      } else if (fallback !== undefined) {
        map[key] = fallback;
      }
    });

    return map;
  }

  sanitizeImpactWeights(config = {}) {
    const sanitized = {
      distanceWeight: this.toNumber(config.distanceWeight, 0),
      distanceNormalization: Math.max(
        1,
        this.toNumber(config.distanceNormalization, 160)
      ),
      timeWeight: this.toNumber(config.timeWeight, 0),
      timeNormalization: Math.max(
        0.05,
        this.toNumber(config.timeNormalization, 1.1)
      ),
      hpWeight: this.toNumber(config.hpWeight, 0),
      hpNormalization: Math.max(1, this.toNumber(config.hpNormalization, 140)),
      urgencyDistance: this.toNumber(
        config.urgencyDistance,
        config.distanceWeight !== undefined ? config.distanceWeight : 0
      ),
      urgencyTime: this.toNumber(
        config.urgencyTime,
        config.timeWeight !== undefined ? config.timeWeight : 0
      ),
      hpUrgencyMultiplier: Math.max(
        0,
        this.toNumber(config.hpUrgencyMultiplier, 0.8)
      ),
      stackMultiplier: Math.max(0, this.toNumber(config.stackMultiplier, 1.2)),
      stackBase: Math.max(0, this.toNumber(config.stackBase, 0.2)),
      minStackScore: Math.max(0, this.toNumber(config.minStackScore, 0)),
      maxRecommended: Math.max(
        1,
        Math.floor(this.toNumber(config.maxRecommended, 4))
      ),
    };

    return sanitized;
  }

  sanitizeDangerWeights(config = {}) {
    return {
      behavior: this.sanitizeWeightMap(config.behavior, 0),
      variantOverrides: this.sanitizeWeightMap(config.variantOverrides, 0),
      reward: this.toNumber(config.reward, 0),
      rewardNormalization: Math.max(
        1,
        this.toNumber(config.rewardNormalization, 1)
      ),
      direction: this.toNumber(config.direction, 0),
      directionBias: this.toNumber(config.directionBias, 0),
      speed: this.toNumber(config.speed, 0),
      speedReference: Math.max(
        1,
        this.toNumber(config.speedReference, this.bulletSpeed || 200)
      ),
      size: this.sanitizeWeightMap(config.size, 0),
      distance: this.toNumber(config.distance, 0),
      impact: this.sanitizeImpactWeights(config.impact || {}),
    };
  }

  cloneDangerWeights(weights = {}) {
    return {
      behavior: { ...(weights.behavior || {}) },
      variantOverrides: { ...(weights.variantOverrides || {}) },
      reward: this.toNumber(weights.reward, 0),
      rewardNormalization: this.toNumber(weights.rewardNormalization, 1),
      direction: this.toNumber(weights.direction, 0),
      directionBias: this.toNumber(weights.directionBias, 0),
      speed: this.toNumber(weights.speed, 0),
      speedReference: this.toNumber(weights.speedReference, 200),
      size: { ...(weights.size || {}) },
      distance: this.toNumber(weights.distance, 0),
      impact: { ...(weights.impact || {}) },
    };
  }

  sanitizeDynamicPredictionSettings(config = {}) {
    const minLead = this.toNumber(config.minLeadTime, 0.05);
    const maxLead = this.toNumber(config.maxLeadTime, 1.2);
    const fallback = this.toNumber(config.fallbackLeadTime, this.linearPredictionTime);

    const settings = {
      minLeadTime: Math.max(0, minLead),
      maxLeadTime: Math.max(0.05, maxLead),
      fallbackLeadTime: Math.max(0, fallback),
    };

    if (settings.maxLeadTime < settings.minLeadTime) {
      settings.maxLeadTime = settings.minLeadTime;
    }

    return settings;
  }

  resetAimingBranchState() {
    this.dangerWeights = this.cloneDangerWeights(this.defaultDangerWeights);
    this.dynamicPredictionSettings = {
      ...this.defaultDynamicPredictionSettings,
    };
    this.targetingUpgradeLevel = 0;
    this.dangerScoreEnabled = false;
    this.dynamicPredictionEnabled = false;
    this.multiLockTargets = Math.max(
      1,
      Math.floor(this.aimingConfig?.multiLock?.baseTargetCount || 1)
    );
    this.targetUpdateInterval = this.baseTargetUpdateInterval;
    this.targetIndicatorPulse = 0;
    this.currentTargetLocks = [];
    this.currentLockAssignments = [];
    this.targetingPriorityList = [];
    this.predictedAimPoints = [];
    if (this.predictedAimPointsMap) {
      this.predictedAimPointsMap.clear();
    } else {
      this.predictedAimPointsMap = new Map();
    }
    this.targetThreatCache.clear();
    this.lastPrimaryTargetId = null;
    this.shootCooldown = this.baseShootCooldown;
  }

  applyAimingUpgrade(data = {}) {
    const levelValue = Number(data?.level);
    if (Number.isFinite(levelValue)) {
      this.targetingUpgradeLevel = Math.max(
        this.targetingUpgradeLevel,
        Math.floor(levelValue)
      );
    }

    if (data?.resetWeights) {
      this.dangerWeights = this.cloneDangerWeights(this.defaultDangerWeights);
    }

    if (data?.dangerWeights) {
      this.mergeDangerWeights(data.dangerWeights);
    }

    if (Number.isFinite(data?.linearLeadTime)) {
      this.linearPredictionTime = Math.max(0, Number(data.linearLeadTime));
    }

    if (data?.dynamicPrediction) {
      this.updateDynamicPredictionSettings(data.dynamicPrediction);
    }

    if (this.targetingUpgradeLevel >= 1) {
      this.dangerScoreEnabled = true;
    }

    if (this.targetingUpgradeLevel >= 2) {
      this.dynamicPredictionEnabled = true;
    }

    if (this.targetingUpgradeLevel >= 3) {
      const targetCount = Number(data?.multiLockTargets);
      if (Number.isFinite(targetCount) && targetCount > 0) {
        this.multiLockTargets = Math.max(1, Math.floor(targetCount));
      }

      const cooldownMultiplier = Number(data?.cooldownMultiplier);
      if (Number.isFinite(cooldownMultiplier) && cooldownMultiplier > 0) {
        this.setShootCooldown(this.baseShootCooldown * cooldownMultiplier);
      } else if (Number.isFinite(this.aimingConfig?.multiLock?.cooldownMultiplier)) {
        this.setShootCooldown(
          this.baseShootCooldown * this.aimingConfig.multiLock.cooldownMultiplier
        );
      }
    }

    if (Number.isFinite(data?.targetUpdateInterval)) {
      this.targetUpdateInterval = Math.max(
        0.05,
        Number(data.targetUpdateInterval)
      );
    } else {
      this.targetUpdateInterval = this.resolveTargetUpdateInterval();
    }

    this.targetUpdateTimer = Math.min(
      this.targetUpdateTimer,
      this.targetUpdateInterval
    );
  }

  mergeDangerWeights(overrides = {}) {
    if (!overrides || typeof overrides !== 'object') {
      return;
    }

    if (overrides.behavior) {
      const sanitized = this.sanitizeWeightMap(overrides.behavior);
      Object.assign(this.dangerWeights.behavior, sanitized);
    }

    if (overrides.variantOverrides) {
      const sanitized = this.sanitizeWeightMap(overrides.variantOverrides);
      Object.assign(this.dangerWeights.variantOverrides, sanitized);
    }

    if (overrides.size) {
      const sanitized = this.sanitizeWeightMap(overrides.size);
      Object.assign(this.dangerWeights.size, sanitized);
    }

    if (overrides.reward !== undefined) {
      this.dangerWeights.reward = this.toNumber(
        overrides.reward,
        this.dangerWeights.reward
      );
    }

    if (overrides.rewardNormalization !== undefined) {
      this.dangerWeights.rewardNormalization = Math.max(
        1,
        this.toNumber(overrides.rewardNormalization, this.dangerWeights.rewardNormalization)
      );
    }

    if (overrides.direction !== undefined) {
      this.dangerWeights.direction = this.toNumber(
        overrides.direction,
        this.dangerWeights.direction
      );
    }

    if (overrides.directionBias !== undefined) {
      this.dangerWeights.directionBias = this.toNumber(
        overrides.directionBias,
        this.dangerWeights.directionBias
      );
    }

    if (overrides.speed !== undefined) {
      this.dangerWeights.speed = this.toNumber(
        overrides.speed,
        this.dangerWeights.speed
      );
    }

    if (overrides.speedReference !== undefined) {
      this.dangerWeights.speedReference = Math.max(
        1,
        this.toNumber(overrides.speedReference, this.dangerWeights.speedReference)
      );
    }

    if (overrides.distance !== undefined) {
      this.dangerWeights.distance = this.toNumber(
        overrides.distance,
        this.dangerWeights.distance
      );
    }

    if (overrides.impact) {
      const sanitized = this.sanitizeImpactWeights(overrides.impact);
      this.dangerWeights.impact = {
        ...(this.dangerWeights.impact || {}),
        ...sanitized,
      };
    }
  }

  updateDynamicPredictionSettings(overrides = {}) {
    if (!overrides || typeof overrides !== 'object') {
      return;
    }

    const settings = { ...this.dynamicPredictionSettings };

    if (overrides.minLeadTime !== undefined) {
      settings.minLeadTime = Math.max(0, this.toNumber(overrides.minLeadTime, settings.minLeadTime));
    }

    if (overrides.maxLeadTime !== undefined) {
      settings.maxLeadTime = Math.max(0.05, this.toNumber(overrides.maxLeadTime, settings.maxLeadTime));
    }

    if (overrides.fallbackLeadTime !== undefined) {
      settings.fallbackLeadTime = Math.max(
        0,
        this.toNumber(overrides.fallbackLeadTime, settings.fallbackLeadTime)
      );
    }

    if (settings.maxLeadTime < settings.minLeadTime) {
      settings.maxLeadTime = settings.minLeadTime;
    }

    this.dynamicPredictionSettings = settings;
  }

  resolveTargetUpdateInterval() {
    const intervals = this.aimingConfig?.targetUpdateIntervals || {};

    const pick = (value) =>
      Number.isFinite(Number(value))
        ? Math.max(0.05, Number(value))
        : null;

    if (this.targetingUpgradeLevel >= 3) {
      const chosen = pick(intervals.multiLock);
      if (chosen !== null) return chosen;
    }

    if (this.targetingUpgradeLevel >= 2) {
      const chosen = pick(intervals.dynamic);
      if (chosen !== null) return chosen;
    }

    if (this.targetingUpgradeLevel >= 1) {
      const chosen = pick(intervals.adaptive);
      if (chosen !== null) return chosen;
    }

    const base = pick(intervals.base);
    if (base !== null) {
      return base;
    }

    return this.baseTargetUpdateInterval;
  }

  computeLockCount(playerStats) {
    if (this.targetingUpgradeLevel < 3) {
      return 1;
    }

    const multishot = Number(playerStats?.multishot);
    const shotCount = Number.isFinite(multishot)
      ? Math.max(1, Math.floor(multishot))
      : 1;

    const targetCap = Math.max(1, Math.floor(this.multiLockTargets || 1));

    return Math.min(targetCap, shotCount);
  }

  pruneInvalidLocks() {
    if (
      !Array.isArray(this.currentLockAssignments) ||
      !this.currentLockAssignments.length
    ) {
      this.currentTargetLocks = [];
      if (!this.currentTarget || !this.isValidTarget(this.currentTarget)) {
        this.currentTarget = null;
      }
      return;
    }

    const filteredAssignments = this.currentLockAssignments.filter(
      (assignment) =>
        assignment &&
        assignment.enemy &&
        !assignment.enemy.destroyed &&
        this.isValidTarget(assignment.enemy)
    );

    if (filteredAssignments.length !== this.currentLockAssignments.length) {
      this.currentLockAssignments = filteredAssignments;
    }

    if (!this.currentLockAssignments.length) {
      this.currentTargetLocks = [];
      this.currentTarget = null;
      return;
    }

    const desiredCount =
      this.targetingUpgradeLevel >= 3
        ? this.computeLockCount(this.lastKnownPlayerStats)
        : 1;

    if (
      this.targetingUpgradeLevel >= 3 &&
      this.currentLockAssignments.length !== desiredCount
    ) {
      this.rebuildLockSet(desiredCount);
      return;
    }

    this.currentTargetLocks = this.currentLockAssignments.map(
      (assignment) => assignment.enemy
    );
    this.currentTarget = this.currentTargetLocks[0] || null;
  }

  rebuildLockSet(desiredCount) {
    const count = Math.max(1, Math.floor(desiredCount));
    const assignments = this.buildLockAssignments(count);

    this.currentLockAssignments = assignments;
    this.currentTargetLocks = assignments.map((assignment) => assignment.enemy);
    this.currentTarget = this.currentTargetLocks[0] || null;
  }

  buildLockAssignments(desiredCount) {
    const count = Math.max(0, Math.floor(desiredCount));
    if (count <= 0) {
      return [];
    }

    const validEntries = this.targetingPriorityList.filter(
      (entry) =>
        entry &&
        entry.enemy &&
        !entry.enemy.destroyed &&
        this.isValidTarget(entry.enemy)
    );

    if (!validEntries.length) {
      return [];
    }

    const stats = validEntries.map((entry, index) => {
      const enemy = entry.enemy;
      const threat = this.targetThreatCache.get(enemy.id) || {};
      const breakdown = threat.breakdown?.impact ||
        (threat.breakdown ? threat.breakdown.impact : null) ||
        entry.breakdown?.impact ||
        null;
      const recommended = Math.max(
        1,
        Math.min(
          count,
          Math.round(
            breakdown && Number.isFinite(breakdown.recommendedShots)
              ? breakdown.recommendedShots
              : threat.breakdown?.impact?.recommendedShots || 1
          )
        )
      );
      const urgency = Number.isFinite(breakdown?.urgency)
        ? breakdown.urgency
        : Number.isFinite(threat.breakdown?.impact?.urgency)
        ? threat.breakdown.impact.urgency
        : entry.score ?? 0;
      return {
        enemy,
        index,
        threat,
        breakdown: threat.breakdown || entry.breakdown || null,
        recommended,
        urgency,
        score: entry.score ?? 0,
        id: enemy.id,
        assigned: 0,
        remaining: recommended,
      };
    });

    const counts = new Map();
    let remaining = count;

    // Baseline assignment - ensure each top priority target receives at least one slot
    for (let i = 0; i < stats.length && remaining > 0; i += 1) {
      const stat = stats[i];
      counts.set(stat.id, 1);
      stat.assigned = 1;
      stat.remaining = Math.max(0, stat.recommended - 1);
      remaining -= 1;
    }

    const computePriority = (stat) => {
      if (!stat) {
        return -Infinity;
      }
      const urgency = Number.isFinite(stat.urgency) ? stat.urgency : 0;
      const stackMultiplier = Math.max(
        0,
        this.dangerWeights?.impact?.stackMultiplier || 0
      );
      const remainingBias = Math.max(0, stat.remaining || 0);
      const scoreBias = Number.isFinite(stat.score) ? stat.score : 0;
      return urgency * (1 + stackMultiplier * 0.5 + remainingBias) + scoreBias * 0.01;
    };

    while (remaining > 0 && stats.length) {
      let bestStat = null;
      let bestValue = -Infinity;
      for (const stat of stats) {
        const value = computePriority(stat);
        if (value > bestValue) {
          bestValue = value;
          bestStat = stat;
        }
      }

      if (!bestStat) {
        break;
      }

      counts.set(
        bestStat.id,
        (counts.get(bestStat.id) || 0) + 1
      );
      bestStat.assigned += 1;
      bestStat.remaining = Math.max(0, bestStat.recommended - bestStat.assigned);
      remaining -= 1;
    }

    const topStat = stats[0];
    while (remaining > 0 && topStat) {
      counts.set(topStat.id, (counts.get(topStat.id) || 0) + 1);
      topStat.assigned += 1;
      topStat.remaining = Math.max(0, topStat.recommended - topStat.assigned);
      remaining -= 1;
    }

    const assignments = [];
    stats.forEach((stat) => {
      const totalForTarget = counts.get(stat.id) || 0;
      for (let i = 0; i < totalForTarget; i += 1) {
        assignments.push({
          enemy: stat.enemy,
          priorityIndex: stat.index,
          threat: stat.threat,
          breakdown: stat.breakdown,
          urgency: stat.urgency,
        });
      }
    });

    if (assignments.length > count) {
      assignments.length = count;
    }

    while (assignments.length < count && topStat) {
      assignments.push({
        enemy: topStat.enemy,
        priorityIndex: topStat.index,
        threat: topStat.threat,
        breakdown: topStat.breakdown,
        urgency: topStat.urgency,
      });
    }

    assignments.sort((a, b) => {
      if (a.priorityIndex !== b.priorityIndex) {
        return a.priorityIndex - b.priorityIndex;
      }
      return 0;
    });

    const totals = new Map();
    assignments.forEach((assignment) => {
      const id = assignment.enemy?.id ?? assignment.priorityIndex;
      totals.set(id, (totals.get(id) || 0) + 1);
    });

    const running = new Map();
    assignments.forEach((assignment, index) => {
      const id = assignment.enemy?.id ?? assignment.priorityIndex;
      const duplicateIndex = running.get(id) || 0;
      assignment.index = index;
      assignment.duplicateIndex = duplicateIndex;
      assignment.duplicateCount = totals.get(id) || 1;
      running.set(id, duplicateIndex + 1);
    });

    return assignments;
  }

  refreshPredictedAimPoints() {
    const player = this.getCachedPlayer();
    if (!player || typeof player.getPosition !== 'function') {
      return;
    }

    const playerPos = player.getPosition();
    if (!playerPos) {
      return;
    }
    const assignments =
      Array.isArray(this.currentLockAssignments) &&
      this.currentLockAssignments.length
        ? this.currentLockAssignments
        : this.currentTarget
        ? [
            {
              enemy: this.currentTarget,
              priorityIndex: 0,
              duplicateIndex: 0,
              duplicateCount: 1,
            },
          ]
        : [];

    if (!assignments.length) {
      this.predictedAimPoints = [];
      if (this.predictedAimPointsMap) {
        this.predictedAimPointsMap.clear();
      }
      return;
    }

    const map = new Map();
    const list = [];

    assignments.forEach((assignment, index) => {
      const enemy = assignment.enemy;
      if (!enemy) {
        return;
      }

      const predicted =
        this.getPredictedTargetPosition(enemy, playerPos) ||
        { x: enemy.x, y: enemy.y };
      const duplicateIndex = Number.isFinite(assignment.duplicateIndex)
        ? assignment.duplicateIndex
        : 0;
      const duplicateCount = Number.isFinite(assignment.duplicateCount)
        ? assignment.duplicateCount
        : 1;
      const offset = this.computeParallelOffset(
        playerPos,
        predicted,
        duplicateIndex,
        duplicateCount,
        enemy
      );

      const aimPoint = {
        x: predicted.x + offset.x,
        y: predicted.y + offset.y,
      };
      assignment.predictedAim = aimPoint;
      assignment.fireOffset = offset;
      assignment.fireOrigin = {
        x: playerPos.x + offset.x,
        y: playerPos.y + offset.y,
      };
      assignment.index = index;

      list.push({
        enemy,
        position: aimPoint,
        index,
        duplicateIndex,
        duplicateCount,
      });
      map.set(enemy.id, aimPoint);
    });

    this.predictedAimPoints = list;
    this.predictedAimPointsMap = map;
  }

  computeParallelOffset(
    playerPos,
    aimPoint,
    duplicateIndex,
    duplicateCount,
    enemy
  ) {
    if (!Number.isFinite(duplicateCount) || duplicateCount <= 1) {
      return { x: 0, y: 0 };
    }

    const dx = aimPoint.x - playerPos.x;
    const dy = aimPoint.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) {
      return { x: 0, y: 0 };
    }

    const slotCenter = (duplicateCount - 1) / 2;
    const offsetIndex = duplicateIndex - slotCenter;
    if (Math.abs(offsetIndex) < 0.0001) {
      return { x: 0, y: 0 };
    }

    const spacing = this.aimingConfig?.multiLock?.parallelSpacing ?? 10;
    const maxOffsetSetting = this.aimingConfig?.multiLock?.parallelMaxOffset;
    const radiusMultiplier =
      this.aimingConfig?.multiLock?.parallelRadiusMultiplier ?? 0.5;

    let magnitude = offsetIndex * spacing;
    const targetRadius = enemy?.radius || 16;
    const clampLimit = Number.isFinite(maxOffsetSetting)
      ? Math.max(spacing, maxOffsetSetting)
      : Math.max(spacing, targetRadius * radiusMultiplier);
    magnitude = Math.max(-clampLimit, Math.min(clampLimit, magnitude));

    const perpX = (-dy / distance) * magnitude;
    const perpY = (dx / distance) * magnitude;

    return { x: perpX, y: perpY };
  }

  calculateDangerScore(
    enemy,
    playerPos,
    distance,
    playerVelocity = null,
    playerRadius = null
  ) {
    const weights = this.dangerWeights || {};
    const variantWeight = this.resolveVariantWeight(enemy);
    const rewardValue = this.estimateRewardValue(enemy);
    const rewardScore =
      (rewardValue / (weights.rewardNormalization || 1)) *
      (weights.reward || 0);
    const directionScore =
      this.computeDirectionFactor(enemy, playerPos) * (weights.direction || 0);
    const speedScore =
      this.computeSpeedFactor(enemy) * (weights.speed || 0);
    const sizeScore = weights.size?.[enemy?.size] ?? 0;
    const distanceScore =
      this.computeDistanceFactor(distance) * (weights.distance || 0);
    const impactDetails = this.calculateImpactThreat(
      enemy,
      playerPos,
      distance,
      playerVelocity,
      playerRadius
    );

    const total =
      variantWeight +
      rewardScore +
      directionScore +
      speedScore +
      sizeScore +
      distanceScore +
      impactDetails.total;

    return {
      total,
      variant: variantWeight,
      reward: rewardScore,
      direction: directionScore,
      speed: speedScore,
      size: sizeScore,
      distance: distanceScore,
      impact: impactDetails,
    };
  }

  calculateImpactThreat(
    enemy,
    playerPos,
    distance,
    playerVelocity = null,
    playerRadius = null
  ) {
    const weights = this.dangerWeights?.impact;
    if (!weights) {
      return {
        total: 0,
        distanceComponent: 0,
        timeComponent: 0,
        hpComponent: 0,
        timeToImpact: Infinity,
        projectedDistance: Number.isFinite(distance) ? distance : Infinity,
        urgency: 0,
        recommendedShots: 1,
      };
    }

    const vx = enemy?.vx || 0;
    const vy = enemy?.vy || 0;
    const playerVx = playerVelocity?.x || 0;
    const playerVy = playerVelocity?.y || 0;

    const relVx = vx - playerVx;
    const relVy = vy - playerVy;
    const relSpeedSq = relVx * relVx + relVy * relVy;

    const dx = enemy.x - playerPos.x;
    const dy = enemy.y - playerPos.y;
    const baseDistance = Number.isFinite(distance)
      ? distance
      : Math.sqrt(dx * dx + dy * dy);

    let timeToImpact = Infinity;
    if (relSpeedSq > 0.0001) {
      const projection = (dx * relVx + dy * relVy) / relSpeedSq;
      if (projection > 0) {
        timeToImpact = projection;
      } else {
        timeToImpact = 0;
      }
    }

    const maxTime = Math.max(0.1, weights.timeNormalization || 1);
    const clampedTime = Math.min(timeToImpact, maxTime);
    const timeComponent =
      (1 - clampedTime / maxTime) * (weights.timeWeight || 0);

    let projectedDistance = baseDistance;
    if (Number.isFinite(timeToImpact) && timeToImpact !== Infinity) {
      const futureDx = dx + relVx * timeToImpact;
      const futureDy = dy + relVy * timeToImpact;
      projectedDistance = Math.sqrt(futureDx * futureDx + futureDy * futureDy);
    }

    const effectiveRadius = Math.max(
      1,
      Number.isFinite(playerRadius)
        ? playerRadius
        : CONSTANTS.SHIP_SIZE || 24
    );
    const distanceNormalization = Math.max(
      effectiveRadius * 2,
      weights.distanceNormalization || effectiveRadius * 3
    );
    const clampedDistance = Math.min(projectedDistance, distanceNormalization);
    const distanceComponent =
      (1 - clampedDistance / distanceNormalization) *
      (weights.distanceWeight || 0);

    const remainingHealth = Math.max(
      0,
      Number.isFinite(enemy?.health)
        ? enemy.health
        : Number.isFinite(enemy?.maxHealth)
        ? enemy.maxHealth
        : 0
    );
    const maxHealth = Math.max(remainingHealth, enemy?.maxHealth || remainingHealth);
    const hpNormalization = Math.max(
      1,
      weights.hpNormalization || maxHealth || 1
    );
    const hpRatio = Math.min(1, remainingHealth / hpNormalization);
    const hpComponent = hpRatio * (weights.hpWeight || 0);

    const total = distanceComponent + timeComponent + hpComponent;

    const urgencyDistance =
      (weights.urgencyDistance ?? weights.distanceWeight ?? 0) *
      (distanceComponent > 0 ? distanceComponent / (weights.distanceWeight || 1) : 0);
    const urgencyTime =
      (weights.urgencyTime ?? weights.timeWeight ?? 0) *
      (timeComponent > 0 ? timeComponent / (weights.timeWeight || 1) : 0);

    const urgencyBase = urgencyDistance + urgencyTime;
    const hpUrgencyMultiplier = Math.max(0, weights.hpUrgencyMultiplier || 0);
    const urgency = urgencyBase * (1 + hpUrgencyMultiplier * hpRatio);

    const stackMultiplier = Math.max(0, weights.stackMultiplier || 0);
    const stackBase = Math.max(0, weights.stackBase || 0);
    const minStackScore = Math.max(0, weights.minStackScore || 0);
    let stackPressure = urgency * stackMultiplier + stackBase * hpRatio;
    if (stackPressure < minStackScore) {
      stackPressure = minStackScore * hpRatio;
    }

    const maxRecommended = Math.max(1, weights.maxRecommended || 4);
    const recommendedShots = Math.max(
      1,
      Math.min(maxRecommended, Math.round(1 + stackPressure))
    );

    return {
      total,
      distanceComponent,
      timeComponent,
      hpComponent,
      timeToImpact,
      projectedDistance,
      urgency,
      hpRatio,
      recommendedShots,
    };
  }

  resolveVariantWeight(enemy) {
    const weights = this.dangerWeights || {};
    const variantKey = enemy?.variant || 'common';
    const override = weights.variantOverrides?.[variantKey];
    if (Number.isFinite(override)) {
      return override;
    }

    const variantConfig =
      CONSTANTS.ASTEROID_VARIANTS?.[variantKey] ||
      CONSTANTS.ASTEROID_VARIANTS?.common ||
      null;
    const behaviorType = variantConfig?.behavior?.type || 'default';
    const behaviorWeight = weights.behavior?.[behaviorType];
    if (Number.isFinite(behaviorWeight)) {
      return behaviorWeight;
    }

    const defaultWeight = weights.behavior?.default;
    return Number.isFinite(defaultWeight) ? defaultWeight : 0;
  }

  estimateRewardValue(enemy) {
    const size = enemy?.size || 'small';
    const baseOrbs = CONSTANTS.ASTEROID_BASE_ORBS?.[size] ?? 1;
    const sizeFactor = CONSTANTS.ASTEROID_SIZE_ORB_FACTOR?.[size] ?? 1;
    const variantConfig =
      CONSTANTS.ASTEROID_VARIANTS?.[enemy?.variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common ||
      null;
    const orbMultiplier = variantConfig?.orbMultiplier ?? 1;
    const orbValue = CONSTANTS.ORB_VALUE ?? 5;

    return baseOrbs * sizeFactor * orbMultiplier * orbValue;
  }

  computeDirectionFactor(enemy, playerPos) {
    const vx = enemy?.vx || 0;
    const vy = enemy?.vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    if (speed === 0) {
      return -Math.abs(this.dangerWeights?.directionBias || 0);
    }

    const dx = playerPos.x - enemy.x;
    const dy = playerPos.y - enemy.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance === 0) {
      return 1;
    }

    const dot = (vx * dx + vy * dy) / (speed * distance);
    const bias = this.dangerWeights?.directionBias || 0;
    return dot - bias;
  }

  computeSpeedFactor(enemy) {
    const vx = enemy?.vx || 0;
    const vy = enemy?.vy || 0;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const reference = Math.max(1, this.dangerWeights?.speedReference || 200);
    return Math.min(1, speed / reference);
  }

  computeDistanceFactor(distance) {
    if (!Number.isFinite(distance)) {
      return 0;
    }

    const range = Math.max(1, this.targetingRange);
    const normalized = Math.min(1, Math.max(0, distance / range));
    return 1 - normalized;
  }

  usingDynamicPrediction() {
    return this.dynamicPredictionEnabled && this.targetingUpgradeLevel >= 2;
  }

  calculateDynamicIntercept(origin, enemy) {
    const bulletSpeed = this.bulletSpeed;
    if (!Number.isFinite(bulletSpeed) || bulletSpeed <= 0) {
      return null;
    }

    const relX = enemy.x - origin.x;
    const relY = enemy.y - origin.y;
    const vx = enemy.vx || 0;
    const vy = enemy.vy || 0;

    const a = vx * vx + vy * vy - bulletSpeed * bulletSpeed;
    const b = 2 * (relX * vx + relY * vy);
    const c = relX * relX + relY * relY;

    let time = null;

    if (Math.abs(a) < 0.0001) {
      if (Math.abs(b) < 0.0001) {
        return null;
      }
      time = -c / b;
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) {
        return null;
      }
      const sqrt = Math.sqrt(discriminant);
      const t1 = (-b - sqrt) / (2 * a);
      const t2 = (-b + sqrt) / (2 * a);
      const valid = [t1, t2].filter((t) => t > 0);
      if (!valid.length) {
        return null;
      }
      time = Math.min(...valid);
    }

    if (!Number.isFinite(time) || time <= 0) {
      return null;
    }

    const minLead = Math.max(0, this.dynamicPredictionSettings?.minLeadTime ?? 0);
    const maxLead = Math.max(
      minLead,
      this.dynamicPredictionSettings?.maxLeadTime ?? minLead
    );
    time = Math.max(minLead, Math.min(maxLead, time));

    return {
      x: enemy.x + (enemy.vx || 0) * time,
      y: enemy.y + (enemy.vy || 0) * time,
    };
  }

  calculateLinearPrediction(origin, enemy) {
    const fallback = Number.isFinite(
      this.dynamicPredictionSettings?.fallbackLeadTime
    )
      ? this.dynamicPredictionSettings.fallbackLeadTime
      : this.linearPredictionTime;
    const leadTime = Math.max(0, fallback);

    return {
      x: enemy.x + (enemy.vx || 0) * leadTime,
      y: enemy.y + (enemy.vy || 0) * leadTime,
    };
  }

  // === SISTEMA DE PROJÉTEIS ===
  createBullet(fromPos, toPos, damage) {
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance === 0) return;

    // Use object pool instead of creating new object
    const bullet = GamePools.bullets.acquire();

    // Configure bullet properties
    bullet.x = fromPos.x;
    bullet.y = fromPos.y;
    bullet.vx = (dx / distance) * this.bulletSpeed;
    bullet.vy = (dy / distance) * this.bulletSpeed;
    bullet.damage = damage;
    bullet.life = this.bulletLifetime;
    bullet.maxLife = this.bulletLifetime;
    bullet.hit = false;
    bullet.active = true;
    bullet.type = 'player';

    // Initialize trail array
    if (!bullet.trail) {
      bullet.trail = [];
    } else {
      bullet.trail.length = 0; // Clear existing trail
    }

    this.bullets.push(bullet);

    // Emitir evento para efeitos
    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('bullet-created', {
        bullet: bullet,
        from: fromPos,
        to: toPos,
      });
    }
  }

  updateBullets(deltaTime) {
    this.bullets.forEach((bullet) => {
      if (bullet.hit) return;

      // Atualizar trail
      bullet.trail.push({ x: bullet.x, y: bullet.y });
      if (bullet.trail.length > this.trailLength) {
        bullet.trail.shift();
      }

      // Atualizar posição
      bullet.x += bullet.vx * deltaTime;
      bullet.y += bullet.vy * deltaTime;
      bullet.life -= deltaTime;

      // Remover projéteis que saem da tela para evitar "ricochete"
      const outOfBounds =
        bullet.x < 0 ||
        bullet.x > CONSTANTS.GAME_WIDTH ||
        bullet.y < 0 ||
        bullet.y > CONSTANTS.GAME_HEIGHT;

      if (outOfBounds) {
        bullet.life = 0;
        return;
      }
    });

    // Return expired bullets to pool and remove from active list
    const activeBullets = [];
    for (const bullet of this.bullets) {
      if (bullet.life > 0 && !bullet.hit) {
        activeBullets.push(bullet);
      } else {
        // Return to pool
        GamePools.bullets.release(bullet);
      }
    }
    this.bullets = activeBullets;
  }

  // === DETECÇÃO DE COLISÃO ===
  checkBulletCollisions(enemiesSystem) {
    const iterateAsteroids = (handler) => {
      if (typeof enemiesSystem.forEachActiveEnemy === 'function') {
        enemiesSystem.forEachActiveEnemy(handler);
      } else if (typeof enemiesSystem.forEachActiveAsteroid === 'function') {
        enemiesSystem.forEachActiveAsteroid(handler);
      } else if (typeof enemiesSystem.getActiveEnemies === 'function') {
        const enemies = enemiesSystem.getActiveEnemies();
        for (let i = 0; i < enemies.length; i += 1) {
          handler(enemies[i]);
        }
      } else if (typeof enemiesSystem.getAsteroids === 'function') {
        const asteroids = enemiesSystem.getAsteroids();
        for (let i = 0; i < asteroids.length; i += 1) {
          handler(asteroids[i]);
        }
      }
    };

    for (const bullet of this.bullets) {
      if (bullet.hit) continue;

      iterateAsteroids((enemy) => {
        if (!enemy || enemy.destroyed || bullet.hit) {
          return;
        }

        const dx = bullet.x - enemy.x;
        const dy = bullet.y - enemy.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < CONSTANTS.BULLET_SIZE + enemy.radius) {
          this.processBulletHit(bullet, enemy, enemiesSystem);
        }
      });
    }
  }

  processBulletHit(bullet, enemy, enemiesSystem) {
    if (!bullet || !enemy || bullet.hit) {
      return;
    }

    bullet.hit = true;

    const damageResult = enemiesSystem
      ? this.applyDamageToEnemy(enemiesSystem, enemy, bullet.damage)
      : {
          killed: Boolean(enemy.destroyed),
          remainingHealth: Math.max(0, enemy.health ?? 0),
        };

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('bullet-hit', {
        bullet: bullet,
        enemy: enemy,
        position: { x: bullet.x, y: bullet.y },
        damage: bullet.damage,
        killed: damageResult.killed,
        remainingHealth: damageResult.remainingHealth,
      });
    }

    return damageResult;
  }

  applyDamageToEnemy(enemiesSystem, enemy, damage) {
    if (typeof enemiesSystem.applyDamage === 'function') {
      const result = enemiesSystem.applyDamage(enemy, damage);
      return {
        killed: !!result?.killed,
        remainingHealth: Math.max(
          0,
          result?.remainingHealth ?? enemy.health ?? 0
        ),
      };
    }

    const killed = enemy.takeDamage(damage);
    if (killed) {
      enemy.destroyed = true;
      return { killed: true, remainingHealth: 0 };
    }

    return { killed: false, remainingHealth: Math.max(0, enemy.health ?? 0) };
  }

  // === GETTERS PÚBLICOS ===
  getBullets() {
    return [...this.bullets]; // Cópia para segurança
  }

  getCurrentTarget() {
    return this.currentTarget;
  }

  getBulletCount() {
    return this.bullets.length;
  }

  ensureBulletGlowCache() {
    const glowRadius = (CONSTANTS.BULLET_SIZE || 0) * 3;

    if (!Number.isFinite(glowRadius) || glowRadius <= 0) {
      this.bulletGlowCache = null;
      return null;
    }

    if (
      this.bulletGlowCache &&
      this.bulletGlowCache.radius === glowRadius &&
      this.bulletGlowCache.canvas
    ) {
      return this.bulletGlowCache;
    }

    if (typeof document === 'undefined') {
      return null;
    }

    const diameter = Math.ceil(glowRadius * 2);
    const offscreen = document.createElement('canvas');
    offscreen.width = diameter;
    offscreen.height = diameter;
    const offscreenCtx = offscreen.getContext('2d');

    if (!offscreenCtx) {
      return null;
    }

    const gradient = offscreenCtx.createRadialGradient(
      glowRadius,
      glowRadius,
      0,
      glowRadius,
      glowRadius,
      glowRadius
    );
    gradient.addColorStop(0, '#FFFF00');
    gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.4)');
    gradient.addColorStop(1, 'transparent');

    offscreenCtx.clearRect(0, 0, diameter, diameter);
    offscreenCtx.fillStyle = gradient;
    offscreenCtx.beginPath();
    offscreenCtx.arc(glowRadius, glowRadius, glowRadius, 0, Math.PI * 2);
    offscreenCtx.fill();

    this.bulletGlowCache = {
      canvas: offscreen,
      radius: glowRadius
    };

    return this.bulletGlowCache;
  }

  render(ctx) {
    if (!ctx) return;

    const player = this.getCachedPlayer();

    // Always render bullets - they keep flying
    this.bullets.forEach((bullet) => {
      if (bullet.hit) return;

      if (bullet.trail.length > 1) {
        ctx.save();
        ctx.lineCap = 'round';

        // Draw glow layer (wider, softer)
        for (let i = 1; i < bullet.trail.length; i++) {
          const alpha = (i / bullet.trail.length) * 0.4; // Fade toward tail
          ctx.strokeStyle = `rgba(255, 255, 100, ${alpha})`;
          ctx.lineWidth = 4;
          ctx.globalAlpha = alpha;

          ctx.beginPath();
          ctx.moveTo(bullet.trail[i - 1].x, bullet.trail[i - 1].y);
          ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
          ctx.stroke();
        }

        // Draw core trail (bright, thin)
        for (let i = 1; i < bullet.trail.length; i++) {
          const alpha = (i / bullet.trail.length) * 0.8; // Fade toward tail
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.globalAlpha = alpha;

          ctx.beginPath();
          ctx.moveTo(bullet.trail[i - 1].x, bullet.trail[i - 1].y);
          ctx.lineTo(bullet.trail[i].x, bullet.trail[i].y);
          ctx.stroke();
        }

        ctx.restore();
      }

      const glowSprite = this.ensureBulletGlowCache();

      if (glowSprite) {
        ctx.drawImage(
          glowSprite.canvas,
          bullet.x - glowSprite.radius,
          bullet.y - glowSprite.radius
        );
      } else {
        const gradient = ctx.createRadialGradient(
          bullet.x,
          bullet.y,
          0,
          bullet.x,
          bullet.y,
          CONSTANTS.BULLET_SIZE * 3
        );
        gradient.addColorStop(0, '#FFFF00');
        gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.4)');
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, CONSTANTS.BULLET_SIZE * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, CONSTANTS.BULLET_SIZE, 0, Math.PI * 2);
      ctx.fill();
    });

    const playerPosition =
      (player && player.position) ||
      (player && typeof player.getPosition === 'function'
        ? player.getPosition()
        : null);

    const lockAssignments =
      Array.isArray(this.currentLockAssignments) &&
      this.currentLockAssignments.length
        ? this.currentLockAssignments
        : this.currentTarget
        ? [
            {
              enemy: this.currentTarget,
              index: 0,
              duplicateIndex: 0,
              duplicateCount: 1,
            },
          ]
        : [];

    if (
      lockAssignments.length &&
      player &&
      !player.isDead &&
      !player.isRetrying &&
      !player._quitExplosionHidden &&
      playerPosition
    ) {
      const pulseDuration = this.targetPulseDuration || 0.0001;
      const pulseRatio = Math.max(
        0,
        Math.min(1, this.targetIndicatorPulse / pulseDuration)
      );

      const duplicateTotals = new Map();
      lockAssignments.forEach((assignment) => {
        const target = assignment.enemy;
        if (!target || target.destroyed) {
          return;
        }
        const id = target.id || assignment.index;
        duplicateTotals.set(id, assignment.duplicateCount || 1);
      });

      lockAssignments.forEach((assignment, index) => {
        const target = assignment.enemy;
        if (!target || target.destroyed) {
          return;
        }

        const duplicateIndex = assignment.duplicateIndex || 0;
        const duplicateCount = duplicateTotals.get(target.id || index) || 1;
        const hue = 52 + index * 36;
        const baseAlpha =
          index === 0 ? this.lockHighlightAlpha : this.lockLineAlpha;
        const lineAlpha = Math.min(1, baseAlpha + pulseRatio * 0.25);
        const radiusBase = target.radius || 16;
        const arcRadius =
          radiusBase +
          6 +
          duplicateIndex * 4 +
          pulseRatio * (index === 0 ? 6 : 3.5);

        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = index === 0 ? 2.6 + pulseRatio * 1.4 : 2.1;
        ctx.strokeStyle = `hsla(${hue}, 90%, 62%, ${lineAlpha})`;
        ctx.beginPath();
        ctx.arc(target.x, target.y, arcRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        ctx.save();
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = `hsla(${hue}, 90%, 55%, ${lineAlpha * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(playerPosition.x, playerPosition.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        ctx.restore();
      });
    }

    if (this.predictedAimPoints.length && this.usingDynamicPrediction()) {
      this.predictedAimPoints.forEach(
        ({ position, index, duplicateIndex, duplicateCount }) => {
          if (!position) {
            return;
          }

          const hue = 52 + index * 36;
          const alpha = index === 0 ? 0.55 : 0.38;
          const radius =
            (this.predictedMarkerRadius || 12) *
            (index === 0 ? 1 : 0.82 + duplicateIndex * 0.04);

          ctx.save();
          ctx.setLineDash([]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = `hsla(${hue}, 95%, 72%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
        ctx.stroke();

        ctx.globalAlpha = alpha * 0.45;
        ctx.fillStyle = `hsla(${hue}, 95%, 65%, ${alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(position.x, position.y, radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        }
      );
    }
  }

  // === CONFIGURAÇÃO ===
  setShootCooldown(cooldown) {
    this.shootCooldown = Math.max(0.1, cooldown);
  }

  setTargetingRange(range) {
    this.targetingRange = Math.max(50, range);
  }

  // === CLEANUP ===
  reset() {
    // Return all bullets to pool before clearing array
    for (const bullet of this.bullets) {
      GamePools.bullets.release(bullet);
    }
    this.bullets = [];
    this.currentTarget = null;
    this.currentTargetLocks = [];
    this.currentLockAssignments = [];
    this.predictedAimPoints = [];
    if (this.predictedAimPointsMap) {
      this.predictedAimPointsMap.clear();
    }
    this.targetThreatCache.clear();
    this.lastShotTime = 0;
    this.resolveCachedServices(true);
    console.log('[CombatSystem] Reset');
  }

  destroy() {
    // Return all bullets to pool before destroying
    for (const bullet of this.bullets) {
      GamePools.bullets.release(bullet);
    }
    this.bullets = [];
    this.currentTarget = null;
    this.currentTargetLocks = [];
    this.currentLockAssignments = [];
    this.predictedAimPoints = [];
    if (this.predictedAimPointsMap) {
      this.predictedAimPointsMap.clear();
    }
    this.targetThreatCache.clear();
    console.log('[CombatSystem] Destroyed');
  }
}

export default CombatSystem;
