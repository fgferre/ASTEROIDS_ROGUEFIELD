// src/modules/combat/targeting/Lead.js
//
// The lead on a moving target: where a shot must go to meet it. The linear
// lead (conservative clamp) from the start, the dynamic intercept (wider,
// tunable clamp) from rank 2. Targeting owns it and asks it for the aim point
// of each lock.

import { toNumber } from './toNumber.js';

export class Lead {
  /**
   * `config`: the dynamicPrediction block of the aiming config (the defaults).
   * `player()`: the player service (position).
   * `bulletSpeed()`: the lance's current speed (the intercept's shot speed).
   * `linearPredictionTime()`: the fallback lead time of the settings.
   * `usingDynamicPrediction()`: true once rank 2 has the dynamic intercept on.
   */
  constructor({
    config,
    player,
    bulletSpeed,
    linearPredictionTime,
    usingDynamicPrediction,
  }) {
    this.player = player;
    this.bulletSpeed = bulletSpeed;
    this.linearPredictionTime = linearPredictionTime;
    this.usingDynamicPrediction = usingDynamicPrediction;

    this.defaultDynamicPredictionSettings =
      this.sanitizeDynamicPredictionSettings(config);
    if (
      !Number.isFinite(this.defaultDynamicPredictionSettings?.fallbackLeadTime)
    ) {
      this.defaultDynamicPredictionSettings.fallbackLeadTime =
        this.linearPredictionTime();
    }
    this.dynamicPredictionSettings = {
      ...this.defaultDynamicPredictionSettings,
    };
  }

  resetDynamicPredictionSettings() {
    this.dynamicPredictionSettings = {
      ...this.defaultDynamicPredictionSettings,
    };
  }

  getPredictedTargetPosition(enemy, playerPos = null) {
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

  sanitizeDynamicPredictionSettings(config = {}) {
    const minLead = toNumber(config.minLeadTime, 0.05);
    const maxLead = toNumber(config.maxLeadTime, 1.2);
    const fallback = toNumber(
      config.fallbackLeadTime,
      this.linearPredictionTime()
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

  updateDynamicPredictionSettings(overrides = {}) {
    if (!overrides || typeof overrides !== 'object') {
      return;
    }

    const settings = { ...this.dynamicPredictionSettings };

    if (overrides.minLeadTime !== undefined) {
      settings.minLeadTime = Math.max(
        0,
        toNumber(overrides.minLeadTime, settings.minLeadTime)
      );
    }

    if (overrides.maxLeadTime !== undefined) {
      settings.maxLeadTime = Math.max(
        0.05,
        toNumber(overrides.maxLeadTime, settings.maxLeadTime)
      );
    }

    if (overrides.fallbackLeadTime !== undefined) {
      settings.fallbackLeadTime = Math.max(
        0,
        toNumber(overrides.fallbackLeadTime, settings.fallbackLeadTime)
      );
    }

    if (settings.maxLeadTime < settings.minLeadTime) {
      settings.maxLeadTime = settings.minLeadTime;
    }

    this.dynamicPredictionSettings = settings;
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
}
