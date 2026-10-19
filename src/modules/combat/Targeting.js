// src/modules/combat/Targeting.js
//
// Who the ship aims at and where: the lock (and the rank-3 multi-lock), the
// danger score that ranks enemies, the lead on a moving target (linear, or the
// dynamic intercept from rank 2), the aim mode (auto/manual) and the right
// stick. CombatSystem owns it, ticks it before shooting, and fires along it.
// The danger score, the lead and the lock slots live in ./targeting/.

import {
  COMBAT_TARGETING_RANGE,
  TARGET_UPDATE_INTERVAL,
  COMBAT_PREDICTION_TIME,
  COMBAT_AIMING_UPGRADE_CONFIG,
  COMBAT_AIM_MODE_DEFAULT,
} from '../../data/constants/gameplay.js';
import { DangerScore } from './targeting/DangerScore.js';
import { Lead } from './targeting/Lead.js';
import { LockPlanner } from './targeting/LockPlanner.js';

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
    this.danger = new DangerScore({
      config: this.aimingConfig?.dangerWeights || {},
      targetingRange: () => this.targetingRange,
      bulletSpeed: this.bulletSpeed,
    });
    this.lead = new Lead({
      config: this.aimingConfig?.dynamicPrediction || {},
      player: this.player,
      bulletSpeed: this.bulletSpeed,
      linearPredictionTime: () => this.linearPredictionTime,
      usingDynamicPrediction: () => this.usingDynamicPrediction(),
    });
    this.locks = new LockPlanner({
      playerStats: this.playerStats,
      spreadMode: this.spreadMode,
      isValidTarget: (enemy) => this.isValidTarget(enemy),
      dangerWeights: () => this.danger.dangerWeights,
      targetingPriorityList: () => this.targetingPriorityList,
      targetThreatCache: () => this.targetThreatCache,
    });
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
        ? this.danger.calculateDangerScore(
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
    return this.lead.getPredictedTargetPosition(enemy, playerPos);
  }

  resetAimingBranchState() {
    this.danger.resetDangerWeights();
    this.lead.resetDynamicPredictionSettings();
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
    this.danger.mergeDangerWeights(overrides);
  }

  updateDynamicPredictionSettings(overrides = {}) {
    this.lead.updateDynamicPredictionSettings(overrides);
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

  computeAllocatedShots(enemy, playerStats = {}) {
    return this.locks.computeAllocatedShots(enemy, playerStats);
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
    const assignments = this.locks.buildLockAssignments(count);

    this.currentLockAssignments = assignments;
    this.currentTargetLocks = assignments.map((assignment) => assignment.enemy);
    this.currentTarget = this.currentTargetLocks[0] || null;
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

  usingDynamicPrediction() {
    return this.dynamicPredictionEnabled && this.targetingUpgradeLevel >= 2;
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

  // Setters for CardEffects.applyAimingUpgrade (the Targeting Suite card).
  setUpgradeLevel(level) {
    this.targetingUpgradeLevel = level;
  }

  resetDangerWeights() {
    this.danger.resetDangerWeights();
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
