import { MINE_CONFIG } from '../../../data/enemies/mine.js';
import {
  ENEMY_EFFECT_COLORS,
  ENEMY_RENDER_PRESETS,
} from '../../../data/constants/visual.js';
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
    this._bodyGradient = null;
    this._bodyGradientKey = null;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

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
    this._bodyGradient = null;
    this._bodyGradientKey = null;

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

  triggerDetonation(reason, context = {}) {
    if (this.detonated || !this.alive) {
      return;
    }

    this.detonated = true;
    this.explosionCause = { cause: reason, context };

    const lethalDamage = Math.max(1, this.health || this.maxHealth || 1);
    this.takeDamage(lethalDamage, {
      cause: 'mine-detonation',
      reason,
      context,
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
    const palette = ENEMY_EFFECT_COLORS?.mine ?? {};
    const presets = ENEMY_RENDER_PRESETS?.mine ?? {};
    const bodyPreset = presets.body ?? {};
    const glowPreset = presets.glow ?? {};
    const baseRadius = this.radius || MINE_CONFIG?.radius || 18;

    const basePulse = 0.5 + 0.5 * Math.sin(this.pulsePhase || 0);
    const intensityMultiplier = this.armed
      ? glowPreset.armedIntensityMultiplier ?? 1.45
      : 1;
    const intensityBoost = this.armed ? glowPreset.armedAlphaBoost ?? 0.18 : 0;
    const pulse = Math.min(1, Math.max(0, basePulse * intensityMultiplier + intensityBoost));
    const haloExponent = glowPreset.haloPulseExponent ?? 1.4;
    const haloStrength = Math.pow(Math.max(0, pulse), haloExponent);

    const payload = {
      type: this.type,
      id: this.id,
      position: { x: this.x, y: this.y },
      radius: baseRadius,
      armed: this.armed,
      pulse,
      colors: {
        body: palette.body,
        highlight: palette.bodyHighlight,
        shadow: palette.bodyShadow,
        glow: palette.flash,
        halo: palette.halo,
      },
    };

    if (!ctx || typeof ctx.save !== 'function') {
      return payload;
    }

    ctx.save();
    ctx.translate(this.x, this.y);

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'transparent';

    const glowBlur = (glowPreset.blurBase ?? 10) + (glowPreset.blurRange ?? 0) * pulse;
    const glowAlpha = Math.min(1, pulse);
    if (glowAlpha > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = glowAlpha;
      ctx.shadowBlur = glowBlur;
      ctx.shadowColor = palette.flash || palette.core || 'rgba(255, 147, 72, 0.45)';
      ctx.fillStyle = palette.core || '#ff9348';
      ctx.beginPath();
      ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const haloRadius = baseRadius * (glowPreset.haloRadiusMultiplier ?? 1.45);
    const haloAlpha = (glowPreset.haloAlpha ?? 0.32) * haloStrength;
    if (haloAlpha > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = haloAlpha;
      ctx.shadowBlur = glowBlur * 0.6;
      ctx.shadowColor = palette.halo || palette.flash || 'rgba(255, 196, 128, 0.25)';
      ctx.lineWidth = baseRadius * (glowPreset.haloLineWidthMultiplier ?? 0.08);
      ctx.strokeStyle = palette.halo || palette.flash || 'rgba(255, 190, 110, 0.4)';
      ctx.beginPath();
      ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const gradient = this.ensureBodyGradient(ctx, baseRadius, palette, bodyPreset);
    const coreRadius = baseRadius * (bodyPreset.coreRadiusMultiplier ?? 1);
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient || palette.body || '#5a5046';
    ctx.fill();

    const rimWidth = baseRadius * (bodyPreset.rimWidthMultiplier ?? 0.16);
    const rimAlphaRange = bodyPreset.rimAlphaRange || [0.55, 0.95];
    const rimAlphaMin = rimAlphaRange[0] ?? 0.55;
    const rimAlphaMax = rimAlphaRange[1] ?? 0.95;
    const rimAlpha = Math.min(1, Math.max(0, rimAlphaMin + (rimAlphaMax - rimAlphaMin) * pulse));
    ctx.lineWidth = rimWidth;
    ctx.strokeStyle = palette.core || '#ff9348';
    ctx.globalAlpha = rimAlpha;
    ctx.beginPath();
    ctx.arc(0, 0, coreRadius, 0, Math.PI * 2);
    ctx.stroke();

    const highlightInset = baseRadius * (bodyPreset.highlightInsetMultiplier ?? 0.46);
    const highlightRadius = Math.max(0, coreRadius - highlightInset);
    const highlightAlpha = bodyPreset.highlightAlpha ?? 0.85;
    if (highlightRadius > 0) {
      const highlightCompositeAlpha = Math.min(1, Math.max(0, highlightAlpha * pulse));
      ctx.globalAlpha = highlightCompositeAlpha;
      ctx.beginPath();
      ctx.arc(0, 0, highlightRadius, 0, Math.PI * 2);
      ctx.fillStyle = palette.bodyHighlight || palette.body || '#8e7b68';
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'transparent';

    ctx.restore();

    return payload;
  }

  ensureBodyGradient(ctx, radius, palette, bodyPreset) {
    if (!ctx || typeof ctx.createRadialGradient !== 'function') {
      return null;
    }

    const highlightInsetMultiplier = bodyPreset.highlightInsetMultiplier ?? 0.46;
    const coreRadiusMultiplier = bodyPreset.coreRadiusMultiplier ?? 1;
    const keyParts = [
      radius,
      palette.body,
      palette.bodyHighlight,
      palette.bodyShadow,
      highlightInsetMultiplier,
      coreRadiusMultiplier,
    ];
    const key = keyParts.join(':');
    if (this._bodyGradient && this._bodyGradientKey === key) {
      return this._bodyGradient;
    }

    const coreRadius = Math.max(1e-3, radius * coreRadiusMultiplier);
    const highlightInset = radius * highlightInsetMultiplier;
    const highlightRadius = Math.max(0, coreRadius - highlightInset);
    const highlightRatio = Math.min(0.95, Math.max(0, highlightRadius / coreRadius));

    const gradient = ctx.createRadialGradient(0, 0, coreRadius * 0.15, 0, 0, coreRadius);
    gradient.addColorStop(0, palette.bodyHighlight || palette.body || '#8e7b68');
    gradient.addColorStop(highlightRatio, palette.body || '#5a5046');
    gradient.addColorStop(1, palette.bodyShadow || '#2c2621');

    this._bodyGradient = gradient;
    this._bodyGradientKey = key;

    return gradient;
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
    this._bodyGradient = null;
    this._bodyGradientKey = null;
  }
}

export default Mine;
