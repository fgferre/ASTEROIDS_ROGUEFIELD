import { resolveEventBus } from '../../../core/serviceUtils.js';

const getEventBus = (system) => {
  if (system?.eventBus?.emit) {
    return system.eventBus;
  }
  return resolveEventBus(system?.dependencies);
};

export class HealthComponent {
  constructor(config = {}) {
    this.config = { ...config };
  }

  /**
   * Initializes the enemy's health values.
   * When an explicit `overrides.health` is provided it is applied directly to both
   * `health` and `maxHealth` without wave or variant scaling. Otherwise the
   * configured base value is scaled according to wave and variant multipliers.
   *
   * @param {Object} enemy
   * @param {Object} overrides
   */
  initialize(enemy, overrides = {}) {
    if (!enemy) {
      return;
    }

    const config = { ...this.config, ...overrides };
    const hasExplicitHealth = Number.isFinite(overrides.health);
    const waveMultiplier = hasExplicitHealth
      ? 1
      : this.resolveWaveMultiplier(enemy, config);
    const variantMultiplier = hasExplicitHealth
      ? 1
      : config.variantMultiplier ?? 1;

    if (hasExplicitHealth) {
      enemy.maxHealth = overrides.health;
      enemy.health = overrides.health;
    } else {
      const baseValue = Math.max(
        config.base ?? enemy.maxHealth ?? enemy.health ?? 1,
        1
      );
      const scaled = baseValue * waveMultiplier * variantMultiplier;
      enemy.maxHealth = scaled;
      enemy.health = scaled;
    }

    enemy.armor = config.armor ?? enemy.armor ?? 0;
    enemy.shields = config.shields ?? enemy.shields ?? 0;
    enemy.invulnerable = Boolean(config.invulnerable ?? enemy.invulnerable);
    enemy.invulnerabilityTimer =
      config.invulnerabilityDuration ?? enemy.invulnerabilityTimer ?? 0;
    enemy.healthConfig = config;
  }

  resolveWaveMultiplier(enemy, config) {
    if (!enemy) {
      return config.scaling ?? 1;
    }
    const base = config.scaling ?? 1;
    const wave = enemy.wave ?? 1;
    if (!config.waveScaling) {
      return base;
    }
    const perWave = config.waveScaling.perWave ?? 0;
    return base * (1 + perWave * Math.max(wave - 1, 0));
  }

  takeDamage(enemy, amount, source, context = {}) {
    if (!enemy || !Number.isFinite(amount)) {
      return 0;
    }

    if (enemy.invulnerable) {
      return 0;
    }

    const armor = enemy.armor ?? this.config.armor ?? 0;
    const effectiveDamage = Math.max(amount - armor, 0);
    let remaining = effectiveDamage;

    if (enemy.shields && enemy.shields > 0) {
      const absorbed = Math.min(enemy.shields, remaining);
      enemy.shields -= absorbed;
      remaining -= absorbed;
      if (remaining <= 0) {
        this.emitDamageEvent(enemy, absorbed, source, { type: 'shield' });
        return effectiveDamage;
      }
    }

    enemy.health = Math.max(
      (enemy.health ?? this.config.base ?? 1) - remaining,
      0
    );
    this.emitDamageEvent(enemy, effectiveDamage, source, context);

    if (enemy.health <= 0) {
      this.onDestroyed(enemy, source, context);
    } else if (typeof enemy.onDamaged === 'function') {
      enemy.onDamaged(remaining, source, context);
    }

    return effectiveDamage;
  }

  heal(enemy, amount) {
    if (!enemy || !Number.isFinite(amount) || amount <= 0) {
      return 0;
    }
    const previous = enemy.health ?? 0;
    enemy.health = Math.min(
      previous + amount,
      enemy.maxHealth ?? previous + amount
    );
    return enemy.health - previous;
  }

  isAlive(enemy) {
    return Boolean(enemy && (enemy.health ?? 0) > 0);
  }

  updateInvulnerability(enemy, deltaTime) {
    if (!enemy?.invulnerabilityTimer) {
      return;
    }
    enemy.invulnerabilityTimer = Math.max(
      enemy.invulnerabilityTimer - deltaTime,
      0
    );
    if (enemy.invulnerabilityTimer === 0) {
      enemy.invulnerable = false;
    }
  }

  emitDamageEvent(enemy, amount, source, context = {}) {
    const bus = getEventBus(enemy.system);
    if (!bus?.emit) {
      return;
    }
    bus.emit('enemy-damaged', {
      enemyId: enemy.id,
      enemyType: enemy.type,
      wave: enemy.wave,
      amount,
      remaining: enemy.health,
      source,
      context,
    });
  }

  onDestroyed(enemy, source, context = {}) {
    const bus = getEventBus(enemy.system);
    const enrichedContext = { ...context, healthComponentManaged: true };
    if (typeof enemy.onDestroyed === 'function') {
      enemy.onDestroyed(source, enrichedContext);
    }
    if (bus?.emit) {
      const hasPosition =
        Number.isFinite(enemy?.x) && Number.isFinite(enemy?.y);
      const payload = {
        enemy,
        enemyId: enemy.id,
        enemyType: enemy.type,
        wave: enemy.wave,
        position: hasPosition ? { x: enemy.x, y: enemy.y } : null,
        source,
        context: enrichedContext,
      };

      bus.emit('enemy-destroyed', payload);
    }
  }
}
