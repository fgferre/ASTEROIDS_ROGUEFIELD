const getGameEvents = (system) => {
  if (system?.gameEvents?.emit) {
    return system.gameEvents;
  }
  if (typeof globalThis !== 'undefined' && globalThis.gameEvents?.emit) {
    return globalThis.gameEvents;
  }
  if (typeof gameEvents !== 'undefined' && gameEvents?.emit) {
    return gameEvents;
  }
  return null;
};

export class HealthComponent {
  constructor(config = {}) {
    this.config = { ...config };
  }

  initialize(enemy, overrides = {}) {
    if (!enemy) {
      return;
    }

    const config = { ...this.config, ...overrides };
    const waveMultiplier = this.resolveWaveMultiplier(enemy, config);
    const variantMultiplier = config.variantMultiplier ?? 1;

    enemy.maxHealth = Math.max(
      config.base ?? enemy.maxHealth ?? enemy.health ?? 1,
      1,
    );
    enemy.maxHealth *= waveMultiplier * variantMultiplier;
    enemy.health = Number.isFinite(overrides.health)
      ? overrides.health
      : enemy.maxHealth;

    enemy.armor = config.armor ?? enemy.armor ?? 0;
    enemy.shields = config.shields ?? enemy.shields ?? 0;
    enemy.invulnerable = Boolean(config.invulnerable ?? enemy.invulnerable);
    enemy.invulnerabilityTimer = config.invulnerabilityDuration ?? enemy.invulnerabilityTimer ?? 0;
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

    enemy.health = Math.max((enemy.health ?? this.config.base ?? 1) - remaining, 0);
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
    enemy.health = Math.min(previous + amount, enemy.maxHealth ?? previous + amount);
    return enemy.health - previous;
  }

  isAlive(enemy) {
    return Boolean(enemy && (enemy.health ?? 0) > 0);
  }

  updateInvulnerability(enemy, deltaTime) {
    if (!enemy?.invulnerabilityTimer) {
      return;
    }
    enemy.invulnerabilityTimer = Math.max(enemy.invulnerabilityTimer - deltaTime, 0);
    if (enemy.invulnerabilityTimer === 0) {
      enemy.invulnerable = false;
    }
  }

  emitDamageEvent(enemy, amount, source, context = {}) {
    const bus = getGameEvents(enemy.system);
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
    const bus = getGameEvents(enemy.system);
    if (typeof enemy.onDestroyed === 'function') {
      enemy.onDestroyed(source, context);
    }
    if (bus?.emit) {
      bus.emit('enemy-destroyed', {
        enemyId: enemy.id,
        enemyType: enemy.type,
        wave: enemy.wave,
        source,
        context,
      });
    }
  }
}
