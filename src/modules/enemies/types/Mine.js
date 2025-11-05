import { MINE_COMPONENTS, MINE_CONFIG } from '../../../data/enemies/mine.js';
import { ENEMY_EFFECT_COLORS } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

const MINE_DEFAULTS = MINE_CONFIG ?? {};

export class Mine extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'mine';

    this.random = null;
    this.armed = false;
    this.detonated = false;
    this.armTimer = MINE_DEFAULTS.armTime ?? 0.5;
    this.lifetime = MINE_DEFAULTS.lifetime ?? 30;
    this.remainingLifetime = this.lifetime;
    this.proximityRadius = MINE_DEFAULTS.proximityRadius ?? 80;
    this.explosionRadius = MINE_DEFAULTS.explosionRadius ?? 120;
    this.explosionDamage = MINE_DEFAULTS.explosionDamage ?? 40;
    this.pulsePhase = 0;
    this.pulseSpeed = MINE_DEFAULTS.pulseSpeed ?? 2.6;
    this.pulseAmount = MINE_DEFAULTS.pulseAmount ?? 0.3;
    this.explosionCause = null;
    this.destroyed = false;
    this.weaponState = {};
    this.movementStrategy = 'proximity';
    this.renderStrategy = 'procedural-sphere';
    this.useComponents = false;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const componentConfig = config.components ?? MINE_COMPONENTS;
    if (componentConfig) {
      this.weaponState = this.weaponState || {};
      this.movementStrategy = componentConfig?.movement?.strategy || 'proximity';
      this.renderStrategy = componentConfig?.render?.strategy || 'procedural-sphere';
      this.weaponPattern = componentConfig?.weapon?.pattern || this.weaponPattern;
    }

    this.radius = config.radius ?? MINE_DEFAULTS.radius ?? 18;
    this.maxHealth =
      config.maxHealth ?? config.health ?? MINE_DEFAULTS.health ?? 20;
    this.health = config.health ?? this.maxHealth;

    this.armTimer = config.armTime ?? MINE_DEFAULTS.armTime ?? 0.5;
    this.lifetime = config.lifetime ?? MINE_DEFAULTS.lifetime ?? 30;
    this.remainingLifetime = this.lifetime;
    this.proximityRadius =
      config.proximityRadius ?? MINE_DEFAULTS.proximityRadius ?? 80;
    this.explosionRadius =
      config.explosionRadius ?? MINE_DEFAULTS.explosionRadius ?? 120;
    this.explosionDamage =
      config.explosionDamage ?? MINE_DEFAULTS.explosionDamage ?? 40;
    this.pulseSpeed = config.pulseSpeed ?? MINE_DEFAULTS.pulseSpeed ?? 2.6;
    this.pulseAmount = config.pulseAmount ?? MINE_DEFAULTS.pulseAmount ?? 0.3;
    this.pulsePhase = 0;

    this.random = this.resolveRandom({ ...config, id: this.id });
    this.armed = false;
    this.detonated = false;
    this.explosionCause = null;
    this.destroyed = false;

    return this;
  }

  resolveRandom(config = {}) {
    if (config.random && typeof config.random.float === 'function') {
      return config.random;
    }

    if (this.system && typeof this.system.getRandomScope === 'function') {
      const scope = config.randomScope || 'mine';
      const generator = this.system.getRandomScope(scope, {
        parentScope: config.randomParentScope || 'spawn',
        label: `enemy:${this.type}:${config.id || this.id || 'spawn'}`,
      });

      if (generator && typeof generator.fork === 'function') {
        return generator.fork(`${this.type}:core`);
      }

      return generator || null;
    }

    return new RandomService(`enemy:${this.type}`);
  }

  onUpdate(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    this.updateTimers(deltaTime);

    if (!this.alive || this.detonated) {
      return;
    }

    if (this.remainingLifetime <= 0) {
      this.triggerDetonation('timeout');
      return;
    }

    if (!this.armed) {
      return;
    }

    const player =
      this.system && typeof this.system.getCachedPlayer === 'function'
        ? this.system.getCachedPlayer()
        : null;
    const playerPosition =
      this.system && typeof this.system.getPlayerPositionSnapshot === 'function'
        ? this.system.getPlayerPositionSnapshot(player)
        : player?.position;

    if (!playerPosition) {
      return;
    }

    const dx = playerPosition.x - this.x;
    const dy = playerPosition.y - this.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= this.proximityRadius) {
      this.triggerDetonation('proximity', { distance });
    }
  }

  updateTimers(deltaTime) {
    this.age += deltaTime;
    this.armTimer -= deltaTime;
    this.remainingLifetime -= deltaTime;
    this.pulsePhase = (this.pulsePhase + this.pulseSpeed * deltaTime) % (Math.PI * 2);

    if (!this.armed && this.armTimer <= 0) {
      this.armed = true;
    }
  }

  triggerDetonation(reasonOrPayload, context = {}) {
    if (this.detonated || !this.alive) {
      return;
    }

    let cause = reasonOrPayload;
    let resolvedContext = context;

    if (typeof reasonOrPayload === 'object' && reasonOrPayload !== null) {
      const { reason, cause: causeOverride, ...rest } = reasonOrPayload;
      cause = causeOverride ?? reason ?? 'detonation';
      resolvedContext = { ...rest };
      if (context && typeof context === 'object' && Object.keys(context).length > 0) {
        resolvedContext = { ...resolvedContext, ...context };
      }
    }

    if (typeof cause !== 'string' || !cause.length) {
      cause = 'detonation';
    }

    this.detonated = true;
    this.explosionCause = { cause, context: resolvedContext };

    const lethalDamage = Math.max(1, this.health || this.maxHealth || 1);
    this.takeDamage(lethalDamage, {
      cause: 'mine-detonation',
      reason: cause,
      context: resolvedContext,
    });
  }

  onDestroyed(source) {
    const safeSource = source ?? {};

    this.destroyed = true;
    super.onDestroyed(safeSource);

    if (typeof gameEvents === 'undefined' || !gameEvents?.emit) {
      return;
    }

    const cause =
      safeSource.reason ??
      safeSource.cause ??
      this.explosionCause?.cause ??
      'detonation';
    const context =
      safeSource.context ?? this.explosionCause?.context ?? {};

    gameEvents.emit('mine-exploded', {
      enemy: this,
      enemyId: this.id,
      enemyType: this.type,
      wave: this.wave,
      position: { x: this.x, y: this.y },
      velocity: { x: this.vx, y: this.vy },
      radius: this.explosionRadius,
      damage: this.explosionDamage,
      cause,
      context,
      source: {
        id: this.id,
        type: this.type,
        wave: this.wave,
      },
      __emittedByMine: true,
    });
  }

  onDraw(ctx) {
    if (!this.useComponents || !this.components?.size) {
      // Fallback: Generate payload without components (for testing)
      const pulse = Math.sin(this.pulsePhase || 0);

      return {
        type: 'mine',
        id: this.id,
        x: this.x,
        y: this.y,
        radius: this.radius,
        armed: this.armed,
        pulse: pulse,
        colors: {
          body: ENEMY_EFFECT_COLORS.mine.body,
          warning: ENEMY_EFFECT_COLORS.mine.warning,
        },
      };
    }

    // RenderComponent handles drawing via BaseEnemy.draw()
    return;
  }

  resetForPool() {
    super.resetForPool();

    this.random = null;
    this.armed = false;
    this.detonated = false;
    this.armTimer = MINE_DEFAULTS.armTime ?? 0.5;
    this.lifetime = MINE_DEFAULTS.lifetime ?? 30;
    this.remainingLifetime = this.lifetime;
    this.proximityRadius = MINE_DEFAULTS.proximityRadius ?? 80;
    this.explosionRadius = MINE_DEFAULTS.explosionRadius ?? 120;
    this.explosionDamage = MINE_DEFAULTS.explosionDamage ?? 40;
    this.pulsePhase = 0;
    this.pulseSpeed = MINE_DEFAULTS.pulseSpeed ?? 2.6;
    this.pulseAmount = MINE_DEFAULTS.pulseAmount ?? 0.3;
    this.explosionCause = null;
    this.destroyed = false;
  }

}

export default Mine;
