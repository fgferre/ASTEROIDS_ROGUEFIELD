// src/modules/combat/targeting/DangerScore.js
//
// The danger score that ranks enemies when the Targeting Suite is on: the
// weights (sanitized, merged by the cards, reset on a new run) and the score
// itself, from the enemy's variant, reward, direction, speed, size, distance
// and the time it takes to reach the ship. Targeting owns it and asks it for
// the score of each enemy in range.

import { SHIP_SIZE } from '../../../core/GameConstants.js';
import {
  ASTEROID_VARIANTS,
  ASTEROID_BASE_ORBS,
  ASTEROID_SIZE_ORB_FACTOR,
  ORB_VALUE,
} from '../../../data/enemies/asteroid-configs.js';
import { toNumber } from './toNumber.js';

export class DangerScore {
  /**
   * `config`: the dangerWeights block of the aiming config (the defaults).
   * `targetingRange()`: the lock range now (the distance factor reads it).
   * `bulletSpeed()`: the lance's current speed (the default speed reference).
   */
  constructor({ config, targetingRange, bulletSpeed }) {
    this.targetingRange = targetingRange;
    this.bulletSpeed = bulletSpeed;

    this.defaultDangerWeights = this.sanitizeDangerWeights(config);
    this.dangerWeights = this.cloneDangerWeights(this.defaultDangerWeights);
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
      distanceWeight: toNumber(config.distanceWeight, 0),
      distanceNormalization: Math.max(
        1,
        toNumber(config.distanceNormalization, 160)
      ),
      timeWeight: toNumber(config.timeWeight, 0),
      timeNormalization: Math.max(
        0.05,
        toNumber(config.timeNormalization, 1.1)
      ),
      hpWeight: toNumber(config.hpWeight, 0),
      hpNormalization: Math.max(1, toNumber(config.hpNormalization, 140)),
      urgencyDistance: toNumber(
        config.urgencyDistance,
        config.distanceWeight !== undefined ? config.distanceWeight : 0
      ),
      urgencyTime: toNumber(
        config.urgencyTime,
        config.timeWeight !== undefined ? config.timeWeight : 0
      ),
      hpUrgencyMultiplier: Math.max(
        0,
        toNumber(config.hpUrgencyMultiplier, 0.8)
      ),
      stackMultiplier: Math.max(0, toNumber(config.stackMultiplier, 1.2)),
      stackBase: Math.max(0, toNumber(config.stackBase, 0.2)),
      minStackScore: Math.max(0, toNumber(config.minStackScore, 0)),
      maxRecommended: Math.max(
        1,
        Math.floor(toNumber(config.maxRecommended, 4))
      ),
    };

    return sanitized;
  }

  sanitizeDangerWeights(config = {}) {
    return {
      behavior: this.sanitizeWeightMap(config.behavior, 0),
      variantOverrides: this.sanitizeWeightMap(config.variantOverrides, 0),
      reward: toNumber(config.reward, 0),
      rewardNormalization: Math.max(1, toNumber(config.rewardNormalization, 1)),
      direction: toNumber(config.direction, 0),
      directionBias: toNumber(config.directionBias, 0),
      speed: toNumber(config.speed, 0),
      speedReference: Math.max(
        1,
        toNumber(config.speedReference, this.bulletSpeed() || 200)
      ),
      size: this.sanitizeWeightMap(config.size, 0),
      distance: toNumber(config.distance, 0),
      impact: this.sanitizeImpactWeights(config.impact || {}),
    };
  }

  cloneDangerWeights(weights = {}) {
    return {
      behavior: { ...(weights.behavior || {}) },
      variantOverrides: { ...(weights.variantOverrides || {}) },
      reward: toNumber(weights.reward, 0),
      rewardNormalization: toNumber(weights.rewardNormalization, 1),
      direction: toNumber(weights.direction, 0),
      directionBias: toNumber(weights.directionBias, 0),
      speed: toNumber(weights.speed, 0),
      speedReference: toNumber(weights.speedReference, 200),
      size: { ...(weights.size || {}) },
      distance: toNumber(weights.distance, 0),
      impact: { ...(weights.impact || {}) },
    };
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
      this.dangerWeights.reward = toNumber(
        overrides.reward,
        this.dangerWeights.reward
      );
    }

    if (overrides.rewardNormalization !== undefined) {
      this.dangerWeights.rewardNormalization = Math.max(
        1,
        toNumber(
          overrides.rewardNormalization,
          this.dangerWeights.rewardNormalization
        )
      );
    }

    if (overrides.direction !== undefined) {
      this.dangerWeights.direction = toNumber(
        overrides.direction,
        this.dangerWeights.direction
      );
    }

    if (overrides.directionBias !== undefined) {
      this.dangerWeights.directionBias = toNumber(
        overrides.directionBias,
        this.dangerWeights.directionBias
      );
    }

    if (overrides.speed !== undefined) {
      this.dangerWeights.speed = toNumber(
        overrides.speed,
        this.dangerWeights.speed
      );
    }

    if (overrides.speedReference !== undefined) {
      this.dangerWeights.speedReference = Math.max(
        1,
        toNumber(overrides.speedReference, this.dangerWeights.speedReference)
      );
    }

    if (overrides.distance !== undefined) {
      this.dangerWeights.distance = toNumber(
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

  resetDangerWeights() {
    this.dangerWeights = this.cloneDangerWeights(this.defaultDangerWeights);
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

    const range = Math.max(1, this.targetingRange());
    const normalized = Math.min(1, Math.max(0, distance / range));
    return 1 - normalized;
  }
}
