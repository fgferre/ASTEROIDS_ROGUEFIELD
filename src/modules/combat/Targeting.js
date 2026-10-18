// src/modules/combat/Targeting.js
//
// Who the ship aims at and where: the lock (and the rank-3 multi-lock), the
// danger score that ranks enemies, the lead on a moving target (linear, or the
// dynamic intercept from rank 2), the aim mode (auto/manual) and the right
// stick. CombatSystem owns it, ticks it before shooting, and fires along it.

import { SHIP_SIZE } from '../../core/GameConstants.js';
import {
  COMBAT_TARGETING_RANGE,
  TARGET_UPDATE_INTERVAL,
  COMBAT_PREDICTION_TIME,
  COMBAT_AIMING_UPGRADE_CONFIG,
  COMBAT_AIM_MODE_DEFAULT,
} from '../../data/constants/gameplay.js';
import {
  ASTEROID_VARIANTS,
  ASTEROID_BASE_ORBS,
  ASTEROID_SIZE_ORB_FACTOR,
  ORB_VALUE,
} from '../../data/enemies/asteroid-configs.js';

// Plan 01.07: validate aim mode mutations to prevent T-07-02 tampering.
const VALID_AIM_MODES = new Set(['auto', 'manual']);

export class Targeting {
  /**
   * `player()`: the player service (position, velocity, shield radius).
   * `enemies()`: the enemy service (forEachActiveEnemy).
   * `emit(name, payload)`: sends aim-stick-changed and combat-target-lock.
   * `playerStats()`: the player stats CombatSystem read this tick ({ multishot, damage }), or null.
   * `bulletSpeed()`: the lance's current speed (the lead and the danger speed reference).
   * `spreadMode()`: 'concentrated' or 'fan' (the shots a lock is worth).
   * `computeParallelOffset(playerPos, aimPoint, duplicateIndex, duplicateCount, enemy)`: the lane offset of a duplicate lock.
   */
  constructor({
    player,
    enemies,
    emit,
    playerStats,
    bulletSpeed,
    spreadMode,
    computeParallelOffset,
  }) {
    this.player = player;
    this.enemies = enemies;
    this.emit = emit;
    this.playerStats = playerStats;
    this.bulletSpeed = bulletSpeed;
    this.spreadMode = spreadMode;
    this.computeParallelOffset = computeParallelOffset;

    this.currentTarget = null;
    this.targetUpdateTimer = 0;

    // Plan 01.07 FIX-05 — aim mode state. Default from gameplay.js (auto).
    this.aimMode = VALID_AIM_MODES.has(COMBAT_AIM_MODE_DEFAULT)
      ? COMBAT_AIM_MODE_DEFAULT
      : 'auto';
    // Snapshot of behavioral flags so manual-mode toggle can restore on switchback.
    this._aimModeFlagSnapshot = null;
    this.needsRetarget = false;
    // Right-stick manual aim (PlayerSystem.getAimStick), unit vector or null:
    // while held, no lock and shots go along it; released, auto again.
    this.stickAim = null;

    this.targetingRange = Number.isFinite(COMBAT_TARGETING_RANGE)
      ? Math.max(0, COMBAT_TARGETING_RANGE)
      : 400;
    this.baseTargetUpdateInterval = Number.isFinite(TARGET_UPDATE_INTERVAL)
      ? Math.max(0.05, TARGET_UPDATE_INTERVAL)
      : 0.15;
    this.targetUpdateInterval = this.baseTargetUpdateInterval;
    this.linearPredictionTime = Number.isFinite(COMBAT_PREDICTION_TIME)
      ? Math.max(0, COMBAT_PREDICTION_TIME)
      : 0.5;

    // === CONFIGURAÇÕES DE MIRA AVANÇADA ===
    this.aimingConfig = COMBAT_AIMING_UPGRADE_CONFIG || {};
    this.defaultDangerWeights = this.sanitizeDangerWeights(
      this.aimingConfig?.dangerWeights || {}
    );
    this.dangerWeights = this.cloneDangerWeights(this.defaultDangerWeights);
    this.defaultDynamicPredictionSettings =
      this.sanitizeDynamicPredictionSettings(
        this.aimingConfig?.dynamicPrediction || {}
      );
    if (
      !Number.isFinite(this.defaultDynamicPredictionSettings?.fallbackLeadTime)
    ) {
      this.defaultDynamicPredictionSettings.fallbackLeadTime =
        this.linearPredictionTime;
    }
    this.dynamicPredictionSettings = {
      ...this.defaultDynamicPredictionSettings,
    };
    this.targetPulseDuration =
      this.aimingConfig?.feedback?.lockPulseDuration ?? 0.35;

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
    this.lastPrimaryTargetId = null;

    this.resetAimingBranchState();
  }

  updateStickAim(stick) {
    const wasHeld = Boolean(this.stickAim);
    this.stickAim = stick;
    if (wasHeld === Boolean(stick)) {
      return;
    }
    if (!stick && this.aimMode === 'auto') {
      this.needsRetarget = true;
    }
    // The HUD's AIM chip can show "MANUAL" while the stick aims.
    this.emit('aim-stick-changed', { active: Boolean(stick) });
  }

  updateTargeting(deltaTime) {
    this.targetIndicatorPulse = Math.max(
      0,
      this.targetIndicatorPulse - deltaTime
    );

    // Fix-pass (F7): when manual aim is active, skip target acquisition
    // entirely. The locks are cleared on `setAimMode('manual')` and the
    // plan must_have is "no target lock / no multi-lock while manual." Any
    // attempt to refresh targets here would silently repopulate locks
    // every tick. The right stick aims by hand the same way while held.
    if (this.aimMode === 'manual' || this.stickAim) {
      this.currentTarget = null;
      this.currentTargetLocks = [];
      this.currentLockAssignments = [];
      this.predictedAimPoints = [];
      if (this.predictedAimPointsMap) {
        this.predictedAimPointsMap.clear();
      }
      return;
    }

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
      if (this.lastPrimaryTargetId !== null) {
        this.emit('combat-target-lock', { lost: true });
      }
      this.lastPrimaryTargetId = null;
      this.targetUpdateTimer = 0;
    }

    // Fix-pass (F8): `needsRetarget` is set when manual → auto switchback
    // happens. Consume it here to force a fresh findBestTarget immediately,
    // regardless of the residual targetUpdateTimer. Without this, the timer
    // could delay acquisition by up to a full targetUpdateInterval.
    if (this.needsRetarget) {
      this.findBestTarget();
      this.targetUpdateTimer = this.targetUpdateInterval;
      this.needsRetarget = false;
      this.pruneInvalidLocks();
      this.refreshPredictedAimPoints();
      return;
    }

    this.targetUpdateTimer -= deltaTime;

    if (this.targetUpdateTimer <= 0) {
      this.findBestTarget();
      this.targetUpdateTimer = this.targetUpdateInterval;
    } else if (this.targetingUpgradeLevel >= 3) {
      const desiredLocks = this.computeLockCount(this.playerStats());
      if (desiredLocks !== this.currentLockAssignments.length) {
        this.rebuildLockSet(desiredLocks);
      }
    }

    this.pruneInvalidLocks();
    this.refreshPredictedAimPoints();
  }

  findBestTarget() {
    const player = this.player();
    const playerPos = player.getPosition();
    if (!playerPos) {
      return;
    }

    const playerVelocity = player.getVelocity();
    const playerRadius = player.getShieldRadius();

    const enemies = this.enemies();

    const candidates = [];
    const scoringEnabled = this.dangerScoreEnabled;
    this.targetThreatCache.clear();

    const processEnemy = (enemy) => {
      // a phased Shade (`intangible`) cannot be locked
      if (!enemy || enemy.destroyed || enemy.intangible) {
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
        score:
          scoringEnabled && score && typeof score === 'object'
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

    enemies.forEachActiveEnemy(processEnemy);

    if (!candidates.length) {
      if (this.currentTarget) {
        this.emit('combat-target-lock', { lost: true });
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

    const desiredLocks = this.computeLockCount(this.playerStats());
    this.rebuildLockSet(Math.max(1, desiredLocks));

    this.currentTarget = this.currentTargetLocks[0] || null;

    const newPrimaryId = this.currentTarget ? this.currentTarget.id : null;
    if (this.currentTarget && newPrimaryId !== this.lastPrimaryTargetId) {
      this.targetIndicatorPulse = this.targetPulseDuration;
      this.emit('combat-target-lock', {
        enemyId: newPrimaryId,
        variant: this.currentTarget.variant || 'common',
        score: sorted[0]?.score ?? 0,
        lockCount: this.currentTargetLocks.length,
      });
    }

    this.lastPrimaryTargetId = newPrimaryId;
  }

  isValidTarget(target) {
    if (!target || target.destroyed || target.intangible) return false;

    const playerPos = this.player().getPosition();
    const dx = target.x - playerPos.x;
    const dy = target.y - playerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    return distance <= this.targetingRange;
  }

  getPredictedTargetPosition(enemy = this.currentTarget, playerPos = null) {
    if (!enemy) return null;

    const origin = playerPos || this.player().getPosition();

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
        this.toNumber(config.speedReference, this.bulletSpeed() || 200)
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
    const fallback = this.toNumber(
      config.fallbackLeadTime,
      this.linearPredictionTime
    );

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
    this.targetingRange = COMBAT_TARGETING_RANGE;
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
        this.toNumber(
          overrides.rewardNormalization,
          this.dangerWeights.rewardNormalization
        )
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
        this.toNumber(
          overrides.speedReference,
          this.dangerWeights.speedReference
        )
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
      settings.minLeadTime = Math.max(
        0,
        this.toNumber(overrides.minLeadTime, settings.minLeadTime)
      );
    }

    if (overrides.maxLeadTime !== undefined) {
      settings.maxLeadTime = Math.max(
        0.05,
        this.toNumber(overrides.maxLeadTime, settings.maxLeadTime)
      );
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
      Number.isFinite(Number(value)) ? Math.max(0.05, Number(value)) : null;

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

  /**
   * Damage-aware shot allocation cap. Caps allocation at
   * `Math.ceil(targetHealth / volleyDamage)` so a high-damage build doesn't
   * waste locks on already-dead-by-volley targets.
   *
   * In concentrated mode all shots in a lane group hit (`EXPECTED_HIT_RATE = 1.0`).
   * In fan mode the rate is conservative (`0.6`) to avoid under-allocating.
   *
   * Plan 01.07 Task 3.
   *
   * @param {object} enemy - The enemy to allocate shots against.
   * @param {object} [playerStats] - Reads {damage, multishot}.
   * @returns {number} Number of shots to allocate, capped at multishot.
   */
  computeAllocatedShots(enemy, playerStats = {}) {
    const multishot = Number(playerStats?.multishot);
    const shotCount = Number.isFinite(multishot)
      ? Math.max(1, Math.floor(multishot))
      : 1;

    if (!enemy) {
      return shotCount;
    }

    const damageRaw = Number(playerStats?.damage);
    const damage = Number.isFinite(damageRaw) && damageRaw > 0 ? damageRaw : 0;
    if (damage <= 0) {
      // No damage configured → fall back to multishot cap to avoid divide-by-zero.
      return shotCount;
    }

    const hitRate = this.spreadMode() === 'fan' ? 0.6 : 1.0;
    // Fix-pass-2 C2 (REVERT first fix-pass F2): the cap is BULLET-COUNT, not
    // a single mega-volley damage value. The caller spawns N bullets each
    // dealing `damage` — so per-bullet damage = `damage * hitRate` (hitRate
    // accounts for fan-mode misses). Number of bullets needed to kill =
    // ceil(targetHP / (damage * hitRate)), and we cap that at multishot below.
    //
    // The first fix-pass mistakenly multiplied by shotCount, treating the
    // burst as one big volley that all hits OR all misses together. That
    // UNDER-FIRED mid-HP targets (e.g., HP=500/dmg=100/multi=4 capped at 2
    // bullets, delivering 200 dmg < 500 HP — wasted half the burst the
    // player paid multishot for). See aim-regression.test.js "C2:" tests.
    const volleyDamage = damage * hitRate;
    if (volleyDamage <= 0) {
      return shotCount;
    }

    const healthRaw = Number(enemy?.health);
    const maxHealthRaw = Number(enemy?.maxHealth);
    const targetHealth =
      Number.isFinite(healthRaw) && healthRaw > 0
        ? healthRaw
        : Number.isFinite(maxHealthRaw) && maxHealthRaw > 0
          ? maxHealthRaw
          : 1;

    const needed = Math.max(1, Math.ceil(targetHealth / volleyDamage));
    return Math.min(shotCount, needed);
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
        ? this.computeLockCount(this.playerStats())
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
      const breakdown =
        threat.breakdown?.impact ||
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
      return (
        urgency * (1 + stackMultiplier * 0.5 + remainingBias) + scoreBias * 0.01
      );
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

      counts.set(bestStat.id, (counts.get(bestStat.id) || 0) + 1);
      bestStat.assigned += 1;
      bestStat.remaining = Math.max(
        0,
        bestStat.recommended - bestStat.assigned
      );
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

    // Fix-pass-3 Finding 1: apply the per-enemy overkill cap UPSTREAM inside
    // buildLockAssignments so the returned assignments already reflect the
    // damage-aware shot allocation. Downstream consumers (render lock-ring
    // count, predicted-aim markers, multi-lock indicators, weapon-fired
    // event payload, handleShooting fire loop) all read
    // `currentLockAssignments` — if the cap only ran in handleShooting,
    // those surfaces would see a stale 4-lock layout for a 1-shot enemy.
    // Cap uses this.playerStats() (the same source computeLockCount
    // reads in updateTargeting → rebuildLockSet → buildLockAssignments).
    const cappedAssignments = this.applyPerEnemyOverkillCap(assignments);

    const totals = new Map();
    cappedAssignments.forEach((assignment) => {
      const id = assignment.enemy?.id ?? assignment.priorityIndex;
      totals.set(id, (totals.get(id) || 0) + 1);
    });

    const running = new Map();
    cappedAssignments.forEach((assignment, index) => {
      const id = assignment.enemy?.id ?? assignment.priorityIndex;
      const duplicateIndex = running.get(id) || 0;
      assignment.index = index;
      assignment.duplicateIndex = duplicateIndex;
      assignment.duplicateCount = totals.get(id) || 1;
      running.set(id, duplicateIndex + 1);
    });

    return cappedAssignments;
  }

  /**
   * Fix-pass-3 Finding 1 helper. Apply the per-enemy overkill cap to a list
   * of lock assignments. For each unique enemy, allocate at most
   * `computeAllocatedShots(enemy, playerStats)` slots. Preserves the
   * original priority order (assignments earlier in the list survive when
   * the cap reduces count). Skip enemies with null id (defensive — those
   * are kept as-is so other invariants don't break).
   *
   * Callers must NOT re-key duplicateIndex/duplicateCount before this
   * runs — that re-keying must happen on the filtered list (see
   * buildLockAssignments). Returns a NEW array; does not mutate the input.
   */
  applyPerEnemyOverkillCap(assignments) {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return assignments || [];
    }
    const playerStats = this.playerStats() || {};
    const perEnemyCap = new Map();
    const kept = new Map();
    const filtered = [];
    assignments.forEach((assignment) => {
      const enemy = assignment?.enemy;
      const id = enemy?.id ?? null;
      if (id == null) {
        filtered.push(assignment);
        return;
      }
      if (!perEnemyCap.has(id)) {
        const allocated = this.computeAllocatedShots(enemy, playerStats);
        const cap =
          Number.isFinite(allocated) && allocated > 0 ? allocated : Infinity;
        perEnemyCap.set(id, cap);
      }
      const cap = perEnemyCap.get(id);
      const soFar = kept.get(id) || 0;
      if (soFar < cap) {
        filtered.push(assignment);
        kept.set(id, soFar + 1);
      }
    });
    return filtered;
  }

  refreshPredictedAimPoints() {
    const playerPos = this.player().getPosition();
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

      const predicted = this.getPredictedTargetPosition(enemy, playerPos) || {
        x: enemy.x,
        y: enemy.y,
      };
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
      // Fix-pass-2 (C4): store the CENTERLINE (un-offset predicted aim) in
      // the map keyed by enemy id, not the lane-offset aim. With rank-3
      // duplicate locks (same enemy across multiple slots), this iteration
      // visits the same id multiple times; if we stored the offset aim, the
      // last duplicate would overwrite earlier entries — and downstream
      // weapon-fired.centerlineTarget (which reads from this map) would end
      // up tracking a lane offset instead of the logical center. Per-lane
      // offsets still live in `assignment.predictedAim` and the
      // `predictedAimPoints` list above.
      map.set(enemy.id, { x: predicted.x, y: predicted.y });
    });

    this.predictedAimPoints = list;
    this.predictedAimPointsMap = map;
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
    const speedScore = this.computeSpeedFactor(enemy) * (weights.speed || 0);
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
      Number.isFinite(playerRadius) ? playerRadius : SHIP_SIZE || 24
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
    const maxHealth = Math.max(
      remainingHealth,
      enemy?.maxHealth || remainingHealth
    );
    const hpNormalization = Math.max(
      1,
      weights.hpNormalization || maxHealth || 1
    );
    const hpRatio = Math.min(1, remainingHealth / hpNormalization);
    const hpComponent = hpRatio * (weights.hpWeight || 0);

    const total = distanceComponent + timeComponent + hpComponent;

    const urgencyDistance =
      (weights.urgencyDistance ?? weights.distanceWeight ?? 0) *
      (distanceComponent > 0
        ? distanceComponent / (weights.distanceWeight || 1)
        : 0);
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
      ASTEROID_VARIANTS?.[variantKey] || ASTEROID_VARIANTS?.common || null;
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
    const baseOrbs = ASTEROID_BASE_ORBS?.[size] ?? 1;
    const sizeFactor = ASTEROID_SIZE_ORB_FACTOR?.[size] ?? 1;
    const variantConfig =
      ASTEROID_VARIANTS?.[enemy?.variant] || ASTEROID_VARIANTS?.common || null;
    const orbMultiplier = variantConfig?.orbMultiplier ?? 1;
    const orbValue = ORB_VALUE ?? 5;

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
    const bulletSpeed = this.bulletSpeed();
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

    const minLead = Math.max(
      0,
      this.dynamicPredictionSettings?.minLeadTime ?? 0
    );
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
    // Use proper physics-based intercept calculation (like calculateDynamicIntercept)
    // but with conservative constraints to keep upgrade path valuable
    const bulletSpeed = this.bulletSpeed();

    if (!Number.isFinite(bulletSpeed) || bulletSpeed <= 0) {
      // Fallback to static target position if bullet speed is invalid
      return { x: enemy.x, y: enemy.y };
    }

    const relX = enemy.x - origin.x;
    const relY = enemy.y - origin.y;
    const vx = enemy.vx || 0;
    const vy = enemy.vy || 0;

    // Quadratic intercept formula (same as calculateDynamicIntercept)
    const a = vx * vx + vy * vy - bulletSpeed * bulletSpeed;
    const b = 2 * (relX * vx + relY * vy);
    const c = relX * relX + relY * relY;

    let time = null;

    if (Math.abs(a) < 0.0001) {
      if (Math.abs(b) < 0.0001) {
        return { x: enemy.x, y: enemy.y };
      }
      time = -c / b;
    } else {
      const discriminant = b * b - 4 * a * c;
      if (discriminant < 0) {
        return { x: enemy.x, y: enemy.y };
      }
      const sqrt = Math.sqrt(discriminant);
      const t1 = (-b - sqrt) / (2 * a);
      const t2 = (-b + sqrt) / (2 * a);
      const valid = [t1, t2].filter((t) => t > 0);
      if (!valid.length) {
        return { x: enemy.x, y: enemy.y };
      }
      time = Math.min(...valid);
    }

    if (!Number.isFinite(time) || time <= 0) {
      return { x: enemy.x, y: enemy.y };
    }

    // Use tighter constraints than dynamic prediction to keep upgrades valuable
    // Base aim: 0.1s to 0.6s (conservative)
    // Level 2+ aim: 0.05s to 1.1s (from dynamicPredictionSettings)
    const minLead = 0.1;
    const maxLead = 0.6;
    time = Math.max(minLead, Math.min(maxLead, time));

    return {
      x: enemy.x + (enemy.vx || 0) * time,
      y: enemy.y + (enemy.vy || 0) * time,
    };
  }

  getCurrentTarget() {
    return this.currentTarget;
  }

  /** Where the primary lock is aimed (lead included), or null. */
  getPrimaryAimPoint() {
    const target = this.currentTarget;
    if (!target) return null;
    const predicted = this.predictedAimPointsMap.get(target.id);
    return predicted
      ? { x: predicted.x, y: predicted.y }
      : { x: target.x, y: target.y };
  }

  getAimMode() {
    return this.aimMode;
  }

  setAimMode(value) {
    if (!VALID_AIM_MODES.has(value)) {
      console.warn(`[CombatSystem] Ignoring invalid aimMode "${value}"`);
      return;
    }

    if (this.aimMode === value) {
      return;
    }

    const previousMode = this.aimMode;
    this.aimMode = value;

    if (value === 'manual') {
      // Snapshot the behavioral flags so we can restore them on switchback.
      this._aimModeFlagSnapshot = {
        dangerScoreEnabled: this.dangerScoreEnabled,
        dynamicPredictionEnabled: this.dynamicPredictionEnabled,
      };
      // Force-clear target locks — no leak of stale aim affordances.
      this.currentTarget = null;
      this.currentTargetLocks = [];
      this.currentLockAssignments = [];
      this.predictedAimPoints = [];
      if (this.predictedAimPointsMap) {
        this.predictedAimPointsMap.clear();
      }
      // Pause behavioral aim flags. Rank-3 cooldownMultiplier IS preserved
      // (decision a — it's a weapon stat, not an aim behavior).
      this.dangerScoreEnabled = false;
      this.dynamicPredictionEnabled = false;
    } else if (value === 'auto' && previousMode === 'manual') {
      // Restore behavioral flag snapshot (or re-enable from upgrade rank if no snapshot).
      if (this._aimModeFlagSnapshot) {
        this.dangerScoreEnabled =
          this._aimModeFlagSnapshot.dangerScoreEnabled ??
          this.targetingUpgradeLevel >= 1;
        this.dynamicPredictionEnabled =
          this._aimModeFlagSnapshot.dynamicPredictionEnabled ??
          this.targetingUpgradeLevel >= 2;
        this._aimModeFlagSnapshot = null;
      } else {
        this.dangerScoreEnabled = this.targetingUpgradeLevel >= 1;
        this.dynamicPredictionEnabled = this.targetingUpgradeLevel >= 2;
      }
      // Trigger fresh target acquisition next tick (no stale currentTarget reuse).
      this.needsRetarget = true;
      this.targetUpdateTimer = this.targetUpdateInterval;
    }
  }

  setTargetingRange(range) {
    this.targetingRange = Math.max(50, range);
  }

  // Setters for CombatSystem.applyAimingUpgrade (the Targeting Suite card).
  setUpgradeLevel(level) {
    this.targetingUpgradeLevel = level;
  }

  resetDangerWeights() {
    this.dangerWeights = this.cloneDangerWeights(this.defaultDangerWeights);
  }

  setLinearPredictionTime(seconds) {
    this.linearPredictionTime = seconds;
  }

  setDangerScoreEnabled(enabled) {
    this.dangerScoreEnabled = enabled;
  }

  setDynamicPredictionEnabled(enabled) {
    this.dynamicPredictionEnabled = enabled;
  }

  setMultiLockTargets(count) {
    this.multiLockTargets = count;
  }

  setAimModeFlagSnapshot(snapshot) {
    this._aimModeFlagSnapshot = snapshot;
  }

  setTargetUpdateInterval(interval) {
    this.targetUpdateInterval = interval;
    this.targetUpdateTimer = Math.min(
      this.targetUpdateTimer,
      this.targetUpdateInterval
    );
  }

  // player-reset: every lock goes, and the next lock pulses even on the same enemy.
  onPlayerReset() {
    this.currentTarget = null;
    this.currentTargetLocks = [];
    this.currentLockAssignments = [];
    this.targetingPriorityList = [];
    this.predictedAimPoints = [];
    this.predictedAimPointsMap = new Map();
    this.targetThreatCache.clear();
    this.targetIndicatorPulse = 0;
    this.lastPrimaryTargetId = null;
  }

  // player-died: every lock goes (the last primary is remembered).
  onPlayerDied() {
    this.currentTarget = null;
    this.currentTargetLocks = [];
    this.currentLockAssignments = [];
    this.targetingPriorityList = [];
    this.predictedAimPoints = [];
    this.predictedAimPointsMap.clear();
    this.targetThreatCache.clear();
    this.targetIndicatorPulse = 0;
  }

  // CombatSystem reset/destroy: the locks, the aim points and the threat cache go.
  clearLocks() {
    this.currentTarget = null;
    this.currentTargetLocks = [];
    this.currentLockAssignments = [];
    this.predictedAimPoints = [];
    if (this.predictedAimPointsMap) {
      this.predictedAimPointsMap.clear();
    }
    this.targetThreatCache.clear();
  }

  // Fix-pass-2 (C5): back to the default aim mode, no snapshot, no stick.
  resetAimMode() {
    this.aimMode = VALID_AIM_MODES.has(COMBAT_AIM_MODE_DEFAULT)
      ? COMBAT_AIM_MODE_DEFAULT
      : 'auto';
    this._aimModeFlagSnapshot = null;
    this.needsRetarget = false;
    this.stickAim = null;
  }
}
