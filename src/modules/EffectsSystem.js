import * as CONSTANTS from '../core/GameConstants.js';
import { GamePools } from '../core/GamePools.js';
import RandomService from '../core/RandomService.js';
import { ScreenShake } from '../utils/ScreenShake.js';
import { normalizeDependencies, resolveService } from '../core/serviceUtils.js';
import { createRandomHelpers } from '../utils/randomHelpers.js';

const MAIN_THRUSTER_FLASH_THRESHOLD = 0.85;
const MAIN_THRUSTER_FLASH_COLOR = '#3399FF';
const MAIN_THRUSTER_FLASH_DURATION = 0.05;
const MAIN_THRUSTER_FLASH_INTENSITY = 0.05;

const BOSS_EFFECTS = CONSTANTS.BOSS_EFFECTS_PRESETS || {};
const BOSS_SHAKES = CONSTANTS.BOSS_SCREEN_SHAKES || {};

class SpaceParticle {
  constructor(x, y, vx, vy, color, size, life, type = 'normal', random = null) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.size = size;
    this.life = life;
    this.maxLife = life;
    this.alpha = 1;
    this.type = type;

    const rng = SpaceParticle.resolveRandom(random);
    const float = () => rng.float();

    if (typeof rng.range === 'function') {
      this.rotation = rng.range(0, Math.PI * 2);
    } else {
      this.rotation = float() * Math.PI * 2;
    }
    this.rotationSpeed = (float() - 0.5) * 4;
  }

  update(deltaTime) {
    this.x += this.vx * deltaTime;
    this.y += this.vy * deltaTime;
    this.life -= deltaTime;
    this.alpha = Math.max(0, this.life / this.maxLife);
    this.rotation += this.rotationSpeed * deltaTime;

    const friction = this.type === 'thruster' ? 0.98 : 0.96;
    this.vx *= friction;
    this.vy *= friction;

    return this.life > 0;
  }

  draw(ctx) {
    if (this.alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    if (this.type === 'spark') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.size * this.alpha;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-this.size, 0);
      ctx.lineTo(this.size, 0);
      ctx.stroke();
    } else if (this.type === 'crack') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = Math.max(0.6, this.size * 0.4);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const length = this.size * 3.2;
      ctx.moveTo(-length * 0.5, 0);
      ctx.lineTo(length * 0.5, 0);
      ctx.stroke();
    } else if (this.type === 'debris') {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      const s = this.size * this.alpha;
      ctx.rect(-s / 2, -s / 2, s, s);
      ctx.fill();
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.size * this.alpha, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

SpaceParticle._fallbackRandom = null;

SpaceParticle.resolveRandom = function resolveRandom(random) {
  if (random && typeof random.float === 'function') {
    return random;
  }

  if (!SpaceParticle._fallbackRandom) {
    SpaceParticle._fallbackRandom = new RandomService('effects-system:particle:fallback');
  }

  return SpaceParticle._fallbackRandom;
};

class HitMarker {
  constructor(x, y, killed, damage) {
    this.x = x;
    this.y = y;
    this.killed = killed;
    this.damage = damage;
    this.life = 0.3; // 0.3s lifetime
    this.maxLife = 0.3;
    this.size = killed ? 12 : 8; // Larger for kills
    this.expansion = 0; // Expands outward
  }

  update(deltaTime) {
    this.life -= deltaTime;
    this.expansion += deltaTime * 20; // Expand at 20px/s
    return this.life > 0;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(this.x, this.y);

    const color = this.killed ? '#FF4444' : '#FFFF88';
    const lineWidth = this.killed ? 2.5 : 2;
    const radius = this.size + this.expansion;

    // Draw X shape for kills, + shape for hits
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    if (this.killed) {
      // X marker (45° rotation)
      ctx.rotate(Math.PI / 4);
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.stroke();
    } else {
      // + marker
      ctx.beginPath();
      ctx.moveTo(-radius, 0);
      ctx.lineTo(radius, 0);
      ctx.moveTo(0, -radius);
      ctx.lineTo(0, radius);
      ctx.stroke();
    }

    ctx.restore();
  }
}

export default class EffectsSystem {
  constructor(config = {}) {
    const normalizedConfig =
      config && typeof config === 'object' && !Array.isArray(config) ? config : {};
    const { audio = null, random = null, ...dependencies } = normalizedConfig;

    this.dependencies = normalizeDependencies(dependencies);
    this.audio = audio ?? resolveService('audio', this.dependencies);
    this.random = random ?? resolveService('random', this.dependencies);
    if (!this.random) {
      this.random = new RandomService('effects-system:fallback');
    }

    if (this.random) {
      this.dependencies.random = this.random;
      this.randomForkLabels = {
        base: 'effects.base',
        particles: 'effects.particles',
        thrusters: 'effects.thrusters',
        colors: 'effects.colors',
        muzzleFlash: 'effects.muzzleFlash',
        hits: 'effects.hitEffects',
        explosions: 'effects.explosions',
        volatility: 'effects.volatility',
        screenShake: 'effects.screenShake',
        boss: 'effects.boss',
      };
      this.randomForks = {
        base: this.random.fork(this.randomForkLabels.base),
        particles: this.random.fork(this.randomForkLabels.particles),
        thrusters: this.random.fork(this.randomForkLabels.thrusters),
        colors: this.random.fork(this.randomForkLabels.colors),
        muzzleFlash: this.random.fork(this.randomForkLabels.muzzleFlash),
        hits: this.random.fork(this.randomForkLabels.hits),
        explosions: this.random.fork(this.randomForkLabels.explosions),
        volatility: this.random.fork(this.randomForkLabels.volatility),
        screenShake: this.random.fork(this.randomForkLabels.screenShake),
        boss: this.random.fork(this.randomForkLabels.boss),
      };
      this.randomForkSeeds = {};
      this.captureRandomForkSeeds();
    } else {
      this.randomForks = null;
      this.randomForkLabels = {};
      this.randomForkSeeds = {};
    }

    const randomHelpers = createRandomHelpers({
      getRandomFork: (name) => this.getRandomFork(name),
      random: this.random,
      fallbackSeedPrefix: 'effects-system',
    });
    this.randomHelpers = randomHelpers;
    Object.assign(this, randomHelpers);
    this.particles = [];
    this.shockwaves = [];
    this.hitMarkers = []; // NEW: Hit marker tracking
    this.damageIndicators = []; // NEW: Directional damage indicators
    this.bossTransitionEffects = [];
    this.processedMineExplosions = new WeakSet();

    // Upgraded screen shake (Week 1: Balance & Feel)
    this.screenShake = new ScreenShake(this.getRandomFork('screenShake'));
    this.screenShakeSeedState =
      this.screenShake && typeof this.screenShake.captureSeedState === 'function'
        ? this.screenShake.captureSeedState()
        : null;
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: '#FFFFFF',
      intensity: 0,
    };
    this.timeDilation = {
      timer: 0,
      duration: 0,
      startScale: 1,
      endScale: 1,
      holdScale: 1,
      holdTimer: 0,
      easing: 'outCubic',
      active: false,
    };
    this.activeBoss = { id: null, lastPhase: 0 };
    this.lastAdjustedDelta = 0;

    this.settings = resolveService('settings', this.dependencies);
    this.motionReduced = false;
    this.screenShakeScale = 1;
    this.damageFlashEnabled = true;
    this.particleDensity = 1;

    if (typeof gameServices !== 'undefined') {
      gameServices.register('effects', this);
    }

    this.setupSettingsIntegration();
    this.setupEventListeners();

    console.log('[EffectsSystem] Initialized');
  }

  getRandomFork(name = 'base') {
    if (!this.randomForks) {
      return null;
    }

    return this.randomForks[name] || this.randomForks.base || null;
  }

  // === PARTICLE POOL HELPERS ===
  createParticle(x, y, vx, vy, color, size, life, type = 'normal') {
    const particle = GamePools.particles.acquire();

    // Configure particle from pool
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.color = color;
    particle.size = size;
    particle.life = life;
    particle.maxLife = life;
    particle.alpha = 1;
    particle.type = type;
    particle.rotation = this.randomRange(0, Math.PI * 2, 'particles');
    particle.rotationSpeed = this.randomCentered(4, 'particles');
    particle.active = true;

    return particle;
  }

  addParticle(x, y, vx, vy, color, size, life, type = 'normal') {
    const particle = this.createParticle(x, y, vx, vy, color, size, life, type);
    this.particles.push(particle);
    return particle;
  }

  releaseParticle(particle) {
    if (!particle) {
      return;
    }

    if (particle.bossEffectTag) {
      delete particle.bossEffectTag;
    }

    if (typeof particle === 'object' && particle !== null) {
      if (Object.prototype.hasOwnProperty.call(particle, 'active')) {
        particle.active = false;
      }

      const ctorName =
        particle.constructor && typeof particle.constructor.name === 'string'
          ? particle.constructor.name
          : null;

      if (ctorName && ctorName !== 'Object') {
        return;
      }

      if (particle.active !== undefined) {
        try {
          GamePools.particles.release(particle);
        } catch (error) {
          console.debug('[EffectsSystem] Particle not from pool, skipping release');
        }
      }
    }
  }

  setupSettingsIntegration() {
    if (!this.settings) {
      this.settings = resolveService('settings', this.dependencies);
    }

    if (
      this.settings &&
      typeof this.settings.getCategoryValues === 'function'
    ) {
      const accessibility = this.settings.getCategoryValues('accessibility');
      if (accessibility) {
        this.applyAccessibilityPreferences(accessibility);
      }

      const video = this.settings.getCategoryValues('video');
      if (video) {
        this.applyVideoPreferences(video);
      }
    }

    if (typeof gameEvents !== 'undefined') {
      gameEvents.on('settings-accessibility-changed', (payload = {}) => {
        if (payload?.values) {
          this.applyAccessibilityPreferences(payload.values);
        }
      });

      gameEvents.on('settings-video-changed', (payload = {}) => {
        if (payload?.values) {
          this.applyVideoPreferences(payload.values);
        }
      });
    }
  }

  applyAccessibilityPreferences(values = {}) {
    this.motionReduced = Boolean(values.reducedMotion);
  }

  applyVideoPreferences(values = {}) {
    if (Number.isFinite(values.screenShakeIntensity)) {
      const normalized = Math.max(
        0,
        Math.min(1.5, Number(values.screenShakeIntensity))
      );
      this.screenShakeScale = normalized;
      if (this.screenShakeScale <= 0) {
        this.screenShake.reset();
      }
    }

    this.damageFlashEnabled = values.damageFlash !== false;
    if (!this.damageFlashEnabled) {
      this.screenFlash.timer = 0;
      this.screenFlash.intensity = 0;
    }

    if (typeof values.reducedParticles === 'boolean') {
      this.particleDensity = values.reducedParticles ? 0.55 : 1;
    }
  }

  getScaledParticleCount(baseCount, options = {}) {
    const numeric = Number(baseCount);
    const allowZero = options.allowZero === true;
    const minimum = Number.isFinite(options.minimum) ? options.minimum : 1;

    if (!Number.isFinite(numeric)) {
      return allowZero ? 0 : minimum;
    }

    const scaled = Math.round(numeric * this.particleDensity);
    if (allowZero) {
      return Math.max(0, scaled);
    }

    return Math.max(minimum, scaled);
  }

  getScaledProbability(probability) {
    const numeric = Number(probability);
    if (!Number.isFinite(numeric)) {
      return 0;
    }

    const clamped = Math.max(0, Math.min(1, numeric));
    return Math.max(0, Math.min(1, clamped * this.particleDensity));
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;

    const registerBossEvent = (eventName, handler) => {
      if (typeof handler !== 'function') {
        return;
      }

      const wrapped = (payload = {}) => {
        try {
          handler(payload ?? {}, eventName);
        } catch (bossError) {
          console.warn(
            '[EffectsSystem] Failed to handle boss effect event',
            eventName,
            bossError
          );
        }
      };

      gameEvents.on(eventName, wrapped);
      gameEvents.on(`effects-${eventName}`, wrapped);
    };

    registerBossEvent('boss-spawned', (payload = {}) => {
      this.clearBossEffectsState();
      this.activeBoss.id = this.resolveBossId(payload);
      if (Number.isFinite(payload?.phase)) {
        this.activeBoss.lastPhase = payload.phase;
      }
      this.createBossEntranceEffect(payload);
      this.triggerBossTransitionEffect('boss-spawned', payload);
    });

    registerBossEvent('boss-phase-changed', (payload = {}) => {
      const bossId = this.resolveBossId(payload);
      if (bossId != null) {
        this.activeBoss.id = bossId;
      }
      if (Number.isFinite(payload?.phase)) {
        this.activeBoss.lastPhase = payload.phase;
      }
      this.createBossPhaseTransition(payload);
      this.triggerBossTransitionEffect('boss-phase-changed', payload);
    });

    registerBossEvent('boss-defeated', (payload = {}) => {
      this.clearBossEffectsState();
      this.createBossDefeatedExplosion(payload);
      this.triggerBossTransitionEffect('boss-defeated', payload);
      this.activeBoss = { id: null, lastPhase: 0 };
    });

    // Weapon fire feedback (Week 1: Balance & Feel)
    gameEvents.on('bullet-created', (data) => {
      if (data?.from && data?.bullet) {
        // Calculate firing direction from bullet velocity
        const vx = data.bullet.vx || 0;
        const vy = data.bullet.vy || 0;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0) {
          this.createMuzzleFlash(data.from.x, data.from.y, vx / speed, vy / speed);
        }
      }
    });

    gameEvents.on('enemy-fired', (payload = {}) => {
      const type = this.resolveEnemyType(payload);
      switch (type) {
        case 'drone':
          this.createDroneMuzzleFlash(payload);
          break;
        case 'hunter':
          this.createHunterBurstEffect(payload);
          break;
        case 'boss':
          this.createBossAttackEffect(payload);
          break;
        default:
          break;
      }
    });

    gameEvents.on('thruster-effect', (data) => {
      if (!data || !data.position || !data.direction) return;

      this.spawnThrusterVFX(
        data.position.x,
        data.position.y,
        data.direction.x,
        data.direction.y,
        data.intensity,
        data.type,
        data.visualLevel || 0
      );

      if (
        data.type === 'main' &&
        typeof data.intensity === 'number' &&
        data.intensity >= MAIN_THRUSTER_FLASH_THRESHOLD
      ) {
        this.addScreenFlash(
          MAIN_THRUSTER_FLASH_COLOR,
          MAIN_THRUSTER_FLASH_DURATION,
          MAIN_THRUSTER_FLASH_INTENSITY
        );
      }
    });

    gameEvents.on('bullet-hit', (data) => {
      if (data?.position) {
        this.createHitMarker(data.position, data.killed || false, data.damage || 0);
        this.createBulletImpact(
          data.position,
          { x: data.enemy?.vx || 0, y: data.enemy?.vy || 0 },
          data.killed || false
        );
      }
    });

    gameEvents.on('enemy-destroyed', (data = {}) => {
      if (data?.enemy) {
        this.createAsteroidExplosion(data.enemy, data);
      }
    });

    gameEvents.on('mine-exploded', (payload = {}) => {
      this.createMineExplosion(payload);
    });

    gameEvents.on('asteroid-crack-stage-changed', (data) => {
      if (data?.position) {
        this.createCrackDebris(data);
      }
    });

    gameEvents.on('asteroid-volatile-armed', (data) => {
      if (data?.position) {
        this.addScreenFlash('rgba(255, 140, 60, 0.18)', 0.12, 0.08);
        this.spawnVolatileWarning(data.position);
      }
    });

    gameEvents.on('asteroid-volatile-exploded', (data) => {
      this.createVolatileExplosionEffect(data);
    });

    gameEvents.on('asteroid-volatile-trail', (data) => {
      this.spawnVolatileTrail(data);
    });

    gameEvents.on('player-leveled-up', () => {
      this.addScreenShake(6, 0.4);
      this.addFreezeFrame(0.2, 0.4);
      this.addScreenFlash('#FFD700', 0.15, 0.2);

      const player = resolveService('player', this.dependencies);
      if (player) {
        this.createLevelUpExplosion(player.position);
      }
    });

    gameEvents.on('xp-collected', (data) => {
      if (data?.position) {
        this.createXPCollectEffect(data.position.x, data.position.y);
      }
    });

    gameEvents.on('xp-orb-fused', (data) => {
      if (data?.position) {
        this.createOrbFusionEffect(data);
      }
    });

    gameEvents.on('player-took-damage', (data) => {
      // Intense screen shake
      this.addScreenShake(8, 0.3);

      // Red damage flash
      this.addScreenFlash('rgba(255, 50, 50, 0.4)', 0.25, 0.3);

      // Brief freeze frame for impact
      this.addFreezeFrame(0.12, 0.15);

      // Directional damage indicator
      if (data?.damageSource && data?.playerPosition) {
        this.createDirectionalDamageIndicator(data.damageSource, data.playerPosition);
      }
    });

    // Level 5 shield: deflective explosion when shield breaks
    gameEvents.on('shield-deflective-explosion', (data) => {
      if (!data?.position) return;

      // Create cyan shockwave effect
      this.createShockwaveEffect({
        position: data.position,
        radius: 200, // AoE damage radius
        color: 'rgba(0, 255, 255, 0.6)',
      });

      // Screen effects
      this.addScreenShake(12, 0.4);
      this.addScreenFlash('rgba(0, 255, 255, 0.4)', 0.3, 0.2);

      // Emit damage event for enemies in radius
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('shield-explosion-damage', {
          position: data.position,
          radius: 200,
          damage: 50, // AoE damage amount
        });
      }
    });

    gameEvents.on('shield-deflected', (data) => {
      this.createShieldHitEffect(data);
    });

    gameEvents.on('player-died', (data) => {
      if (data?.position) {
        this.createEpicShipExplosion(data.position);
      }
    });
  }

  update(deltaTime) {
    const baseDelta = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    let effectDelta = baseDelta;
    let adjustedDelta = baseDelta;

    const freezeMultiplier = this.updateFreezeFrameState(baseDelta);
    effectDelta *= freezeMultiplier;
    adjustedDelta *= freezeMultiplier;

    const timeScale = this.updateTimeDilationState(baseDelta);
    effectDelta *= timeScale;
    adjustedDelta *= timeScale;

    // Update screen shake (new trauma-based system)
    this.screenShake.update(effectDelta);

    if (this.screenFlash.timer > 0) {
      this.screenFlash.timer -= effectDelta;
      if (this.screenFlash.timer < 0) this.screenFlash.timer = 0;
    }

    this.updateParticles(effectDelta);
    this.updateShockwaves(effectDelta);
    this.updateHitMarkers(effectDelta);
    this.updateDamageIndicators(effectDelta);
    this.updateBossTransitions(effectDelta);

    this.lastAdjustedDelta = adjustedDelta;
    return adjustedDelta;
  }

  updateHitMarkers(deltaTime) {
    this.hitMarkers = this.hitMarkers.filter(marker => marker.update(deltaTime));
  }

  updateDamageIndicators(deltaTime) {
    this.damageIndicators = this.damageIndicators.filter(indicator => {
      indicator.life -= deltaTime;
      indicator.expansion += deltaTime * 30; // Expand at 30px/s
      return indicator.life > 0;
    });
  }

  updateFreezeFrameState(baseDelta) {
    if (!this.freezeFrame || this.freezeFrame.timer <= 0) {
      return 1;
    }

    const frame = this.freezeFrame;
    frame.timer = Math.max(0, frame.timer - baseDelta);

    const duration = frame.duration > 0 ? frame.duration : Math.max(frame.timer, 0);
    if (duration <= 0) {
      frame.timer = 0;
      return 1;
    }

    const fade = Math.max(0, Math.min(1, frame.fade ?? 0));
    if (frame.timer <= 0) {
      return 1;
    }

    const remaining = Math.max(0, Math.min(1, frame.timer / duration));
    const normalized = 1 - remaining;
    const multiplier = fade + (1 - fade) * normalized;

    return Math.max(0, Math.min(1, multiplier));
  }

  updateTimeDilationState(baseDelta) {
    if (!this.timeDilation) {
      return 1;
    }

    const state = this.timeDilation;

    if (state.holdTimer > 0) {
      state.holdTimer = Math.max(0, state.holdTimer - baseDelta);
      state.timer = Math.max(state.duration, 0);
      state.active = true;
      const scale = Math.max(0, Math.min(1, state.holdScale ?? 1));
      if (state.holdTimer <= 0 && state.duration <= 0) {
        state.active = false;
      }
      return scale;
    }

    if (state.timer > 0 && state.duration > 0) {
      state.timer = Math.max(0, state.timer - baseDelta);
      const progress = state.duration > 0 ? 1 - state.timer / state.duration : 1;
      const eased = this.easeValue(state.easing, progress);
      const start = Number.isFinite(state.startScale) ? state.startScale : 1;
      const end = Number.isFinite(state.endScale) ? state.endScale : 1;
      const scale = start + (end - start) * eased;

      if (state.timer <= 0) {
        state.timer = 0;
        state.duration = 0;
        state.startScale = 1;
        state.endScale = 1;
        state.holdScale = 1;
        state.active = false;
      } else {
        state.active = true;
      }

      return Math.max(0, Math.min(1, scale));
    }

    state.timer = 0;
    state.duration = 0;
    state.startScale = 1;
    state.endScale = 1;
    state.holdScale = 1;
    state.active = false;
    return 1;
  }

  easeValue(easing, t) {
    const clamped = Math.max(0, Math.min(1, t));
    switch (easing) {
      case 'smooth':
        return clamped * clamped * (3 - 2 * clamped);
      case 'outQuad':
        return 1 - Math.pow(1 - clamped, 2);
      case 'outCubic':
      default:
        return 1 - Math.pow(1 - clamped, 3);
    }
  }

  updateParticles(deltaTime) {
    // Update particles and return expired ones to pool
    const activeParticles = [];
    for (const particle of this.particles) {
      if (particle && typeof particle.update === 'function' && particle.update(deltaTime)) {
        activeParticles.push(particle);
      } else if (particle) {
        this.releaseParticle(particle);
      }
    }
    this.particles = activeParticles;

    // Return oldest particles to pool if we have too many
    if (this.particles.length > 150) {
      const excessParticles = this.particles.splice(0, this.particles.length - 100);
      for (const particle of excessParticles) {
        if (particle) {
          this.releaseParticle(particle);
        }
      }
    }
  }

  updateShockwaves(deltaTime) {
    this.shockwaves = this.shockwaves.filter((wave) => {
      if (!wave) return false;

      wave.timer += deltaTime;
      const progress = Math.min(1, wave.timer / wave.duration);
      const easingPower =
        Number.isFinite(wave.easingPower) && wave.easingPower > 0
          ? wave.easingPower
          : 1;
      const easedProgress =
        easingPower === 1 ? progress : Math.pow(progress, easingPower);

      wave.radius = wave.maxRadius * easedProgress;
      wave.alpha = Math.max(0, wave.maxAlpha * (1 - easedProgress));

      const widthFade = Number.isFinite(wave.widthFade) ? wave.widthFade : 0.6;
      const widthFactor = Math.max(0, 1 - easedProgress * widthFade);
      wave.lineWidth = Math.max(0.35, wave.baseWidth * widthFactor);

      return wave.timer < wave.duration;
    });
  }

  applyScreenShake(ctx) {
    // Apply trauma-based screen shake
    const centerX = CONSTANTS.GAME_WIDTH / 2;
    const centerY = CONSTANTS.GAME_HEIGHT / 2;
    this.screenShake.apply(ctx, centerX, centerY);
  }

  draw(ctx) {
    this.particles.forEach((p) => p.draw(ctx));

    this.drawShockwaves(ctx);

    // Draw hit markers
    this.hitMarkers.forEach((marker) => marker.draw(ctx));

    // Draw directional damage indicators
    this.drawDamageIndicators(ctx);

    if (this.screenFlash.timer > 0) {
      const alpha =
        (this.screenFlash.timer / this.screenFlash.duration) *
        this.screenFlash.intensity;
      ctx.save();
      ctx.fillStyle = this.screenFlash.color;
      ctx.globalAlpha = alpha;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }

    this.drawBossTransitions(ctx);
  }

  drawShockwaves(ctx) {
    if (!ctx) return;

    this.shockwaves.forEach((wave) => {
      if (!wave) return;

      ctx.save();
      ctx.globalAlpha = wave.alpha;
      ctx.strokeStyle = wave.color || 'rgba(0, 191, 255, 1)';
      ctx.lineWidth = Math.max(0.5, wave.lineWidth);

      if (wave.shadowColor) {
        const blurBase = Number.isFinite(wave.shadowBlur)
          ? wave.shadowBlur
          : 25;
        ctx.shadowColor = wave.shadowColor;
        ctx.shadowBlur = blurBase * wave.alpha;
      } else {
        ctx.shadowColor = 'rgba(0, 0, 0, 0)';
        ctx.shadowBlur = 0;
      }

      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      if (wave.fillColor) {
        ctx.fillStyle = wave.fillColor;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  resolveBossTransitionColor(eventName, payload = {}) {
    if (typeof payload.color === 'string' && payload.color.trim().length > 0) {
      return payload.color.trim();
    }

    const palette = Array.isArray(payload.phaseColors)
      ? payload.phaseColors
      : Array.isArray(payload?.enemy?.phaseColors)
      ? payload.enemy.phaseColors
      : Array.isArray(payload?.boss?.phaseColors)
      ? payload.boss.phaseColors
      : null;

    if (palette && palette.length) {
      const phaseIndex = Math.max(
        0,
        Math.min(palette.length - 1, Math.floor(payload.phase ?? 0))
      );
      const candidate = palette[phaseIndex];
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    if (payload.enemy && typeof payload.enemy.color === 'string') {
      return payload.enemy.color;
    }

    if (payload.boss && typeof payload.boss.color === 'string') {
      return payload.boss.color;
    }

    if (eventName === 'boss-phase-changed') {
      return 'rgba(255, 210, 120, 0.9)';
    }

    if (eventName === 'boss-defeated') {
      return 'rgba(255, 245, 235, 0.92)';
    }

    return 'rgba(255, 105, 140, 0.95)';
  }

  triggerBossTransitionEffect(eventName, payload = {}) {
    if (!this.bossTransitionEffects) {
      this.bossTransitionEffects = [];
    }

    const color = this.resolveBossTransitionColor(eventName, payload);
    const presets = {
      'boss-spawned': {
        duration: 1.65,
        maxAlpha: 0.65,
        borderWidth: 30,
        pulseFrequency: 1.8,
        overlayAlpha: 0.18,
        fadePower: 1.5,
      },
      'boss-phase-changed': {
        duration: 1.05,
        maxAlpha: 0.5,
        borderWidth: 24,
        pulseFrequency: 2.4,
        overlayAlpha: 0.12,
        fadePower: 1.6,
      },
      'boss-defeated': {
        duration: 2.15,
        maxAlpha: 0.85,
        borderWidth: 36,
        pulseFrequency: 1.1,
        overlayAlpha: 0.22,
        fadePower: 1.9,
      },
    };
    const preset = presets[eventName] || presets['boss-phase-changed'];
    const effect = {
      event: eventName,
      color,
      duration: preset.duration,
      timer: 0,
      maxAlpha: preset.maxAlpha,
      borderWidth: preset.borderWidth,
      pulseFrequency: preset.pulseFrequency,
      overlayAlpha: preset.overlayAlpha,
      fadePower: preset.fadePower,
    };

    this.bossTransitionEffects.push(effect);
  }

  getBossEffectConfig(name) {
    if (!name) {
      return null;
    }

    return BOSS_EFFECTS && Object.prototype.hasOwnProperty.call(BOSS_EFFECTS, name)
      ? BOSS_EFFECTS[name]
      : null;
  }

  getBossShakePreset(name) {
    if (!name) {
      return null;
    }

    return BOSS_SHAKES && Object.prototype.hasOwnProperty.call(BOSS_SHAKES, name)
      ? BOSS_SHAKES[name]
      : null;
  }

  applyBossScreenShake(name) {
    const preset = this.getBossShakePreset(name);
    if (!preset) {
      return;
    }

    const intensity = Number.isFinite(preset.intensity) ? preset.intensity : null;
    const duration = Number.isFinite(preset.duration) ? preset.duration : null;

    if (intensity != null && duration != null) {
      this.addScreenShake(intensity, duration);
    }
  }

  applyBossEffectTimings(config = {}, palette = {}, eventName = '') {
    if (config.freezeFrame) {
      this.addFreezeFrame(config.freezeFrame.duration, config.freezeFrame.fade);
    }

    if (config.slowMotion) {
      this.applyTimeDilation(config.slowMotion.scale ?? 0.6, {
        duration: config.slowMotion.duration,
        holdDuration: Number.isFinite(config.slowMotion.holdDuration)
          ? config.slowMotion.holdDuration
          : config.slowMotion.hold,
        easing: config.slowMotion.easing,
      });
    }

    const flashConfig = config.screenFlash;
    if (flashConfig) {
      const flashColor =
        flashConfig.color || palette.flash || palette.core || '#ffffff';
      const flashDuration = Number.isFinite(flashConfig.duration)
        ? flashConfig.duration
        : 0.35;
      const flashIntensity = Number.isFinite(flashConfig.intensity)
        ? flashConfig.intensity
        : 0.25;
      this.addScreenFlash(flashColor, flashDuration, flashIntensity);
    }
  }

  tagBossParticle(particle, tag) {
    if (particle && tag) {
      particle.bossEffectTag = tag;
    }
    return particle;
  }

  clearBossEffectsState(options = {}) {
    const preserveEvents = Array.isArray(options.preserveEvents)
      ? new Set(options.preserveEvents)
      : null;

    if (Array.isArray(this.bossTransitionEffects)) {
      if (preserveEvents && preserveEvents.size > 0) {
        this.bossTransitionEffects = this.bossTransitionEffects.filter(
          (effect) => effect && preserveEvents.has(effect.event)
        );
      } else {
        this.bossTransitionEffects = [];
      }
    }

    const preserveTags = Array.isArray(options.preserveTags)
      ? new Set(options.preserveTags)
      : null;

    if (!Array.isArray(this.particles) || this.particles.length === 0) {
      return;
    }

    const survivors = [];
    for (const particle of this.particles) {
      if (particle && particle.bossEffectTag) {
        if (preserveTags && preserveTags.has(particle.bossEffectTag)) {
          survivors.push(particle);
          continue;
        }
        this.releaseParticle(particle);
      } else {
        survivors.push(particle);
      }
    }

    this.particles = survivors;
  }

  resolveBossId(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const source = payload.enemy || payload.boss || payload.source || null;
    if (source && source.id != null) {
      return source.id;
    }

    if (payload.bossId != null) {
      return payload.bossId;
    }

    if (payload.enemyId != null) {
      return payload.enemyId;
    }

    if (payload.id != null) {
      return payload.id;
    }

    return null;
  }

  resolveBossPosition(payload = {}) {
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const input = payload.position;
    if (input && Number.isFinite(input.x) && Number.isFinite(input.y)) {
      return { x: input.x, y: input.y };
    }

    const source = payload.enemy || payload.boss || payload.target || null;
    if (source && Number.isFinite(source.x) && Number.isFinite(source.y)) {
      return { x: source.x, y: source.y };
    }

    if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
      return { x: payload.x, y: payload.y };
    }

    return null;
  }

  resolveBossPalette(payload = {}, configColors = {}, eventName = 'boss-spawned') {
    const colors = configColors || {};
    const coreColor =
      this.resolveBossTransitionColor(eventName, payload) || colors.core || '#ff6b9c';

    const phaseColorsSource = Array.isArray(payload.phaseColors)
      ? payload.phaseColors
      : Array.isArray(payload.enemy?.phaseColors)
      ? payload.enemy.phaseColors
      : Array.isArray(payload.boss?.phaseColors)
      ? payload.boss.phaseColors
      : null;

    const phaseValue = Number(payload.phase);
    const fallbackPhase = Number.isFinite(this.activeBoss?.lastPhase)
      ? this.activeBoss.lastPhase
      : 0;
    const selectedPhase = Number.isFinite(phaseValue) ? phaseValue : fallbackPhase;

    let accentColor = colors.accent || null;
    if (phaseColorsSource && phaseColorsSource.length) {
      const index = Math.max(
        0,
        Math.min(phaseColorsSource.length - 1, Math.round(selectedPhase))
      );
      accentColor = phaseColorsSource[index];
    }

    if (!accentColor) {
      accentColor = colors.accent || coreColor;
    }

    return {
      core: coreColor,
      accent: accentColor,
      trail: colors.trail || accentColor,
      smoke: colors.smoke || 'rgba(255, 255, 255, 0.24)',
      flash: colors.flash || '#ffffff',
    };
  }

  createBossEntranceEffect(payload = {}) {
    const origin = this.resolveBossPosition(payload);
    if (!origin) {
      return;
    }

    const config = this.getBossEffectConfig('entrance') || {};
    const palette = this.resolveBossPalette(payload, config.colors || {}, 'boss-spawned');

    const swirl = config.swirl || {};
    const swirlCount = this.getScaledParticleCount(swirl.count ?? 48, {
      allowZero: true,
    });
    const innerRadius = Number.isFinite(swirl.innerRadius) ? swirl.innerRadius : 36;
    const outerRadius = Number.isFinite(swirl.outerRadius)
      ? swirl.outerRadius
      : Math.max(innerRadius + 40, 120);
    const swirlSpeedMin = swirl.speed?.min ?? 80;
    const swirlSpeedMax = swirl.speed?.max ?? 150;
    const swirlSizeMin = swirl.size?.min ?? 2.2;
    const swirlSizeMax = swirl.size?.max ?? 3.4;
    const swirlLifeMin = swirl.life?.min ?? 0.5;
    const swirlLifeMax = swirl.life?.max ?? 0.8;

    for (let i = 0; i < swirlCount; i += 1) {
      const angle = (i / Math.max(1, swirlCount)) * Math.PI * 2;
      const radius = this.randomRange(innerRadius, outerRadius, 'boss');
      const offsetX = Math.cos(angle) * radius;
      const offsetY = Math.sin(angle) * radius;
      const speed = this.randomRange(swirlSpeedMin, swirlSpeedMax, 'boss');
      const velocityAngle = angle + Math.PI / 2 + this.randomCentered(0.4, 'boss');
      const particle = this.createParticle(
        origin.x + offsetX,
        origin.y + offsetY,
        Math.cos(velocityAngle) * speed,
        Math.sin(velocityAngle) * speed,
        palette.accent,
        this.randomRange(swirlSizeMin, swirlSizeMax, 'boss'),
        this.randomRange(swirlLifeMin, swirlLifeMax, 'boss'),
        'spark'
      );
      particle.rotationSpeed = this.randomCentered(6, 'boss');
      this.tagBossParticle(particle, 'boss-entrance');
      this.particles.push(particle);
    }

    const burst = config.burst || {};
    const rings = Math.max(1, burst.rings ?? 2);
    const perRing = Math.max(1, burst.particlesPerRing ?? 24);
    const radiusStep = Number.isFinite(burst.radiusStep) ? burst.radiusStep : 44;
    const burstSpeedMin = burst.speed?.min ?? 140;
    const burstSpeedMax = burst.speed?.max ?? 220;
    const burstSizeMin = burst.size?.min ?? 2.8;
    const burstSizeMax = burst.size?.max ?? 4.2;
    const burstLifeMin = burst.life?.min ?? 0.45;
    const burstLifeMax = burst.life?.max ?? 0.75;

    for (let ring = 0; ring < rings; ring += 1) {
      const baseRadius = radiusStep * (ring + 1);
      for (let i = 0; i < perRing; i += 1) {
        const angle = (i / perRing) * Math.PI * 2;
        const speed = this.randomRange(burstSpeedMin, burstSpeedMax, 'boss');
        const offsetRadius = baseRadius * 0.28;
        const particle = this.createParticle(
          origin.x + Math.cos(angle) * offsetRadius,
          origin.y + Math.sin(angle) * offsetRadius,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          ring % 2 === 0 ? palette.core : palette.trail,
          this.randomRange(burstSizeMin, burstSizeMax, 'boss'),
          this.randomRange(burstLifeMin, burstLifeMax, 'boss'),
          'spark'
        );
        particle.rotationSpeed = this.randomCentered(4, 'boss');
        this.tagBossParticle(particle, 'boss-entrance');
        this.particles.push(particle);
      }
    }

    const dust = config.dust || {};
    const dustCount = this.getScaledParticleCount(dust.count ?? 28, {
      allowZero: true,
    });
    const dustSpeedMin = dust.speed?.min ?? 40;
    const dustSpeedMax = dust.speed?.max ?? 90;
    const dustSizeMin = dust.size?.min ?? 3.2;
    const dustSizeMax = dust.size?.max ?? 5.2;
    const dustLifeMin = dust.life?.min ?? 0.8;
    const dustLifeMax = dust.life?.max ?? 1.4;

    for (let i = 0; i < dustCount; i += 1) {
      const angle = this.randomFloat('boss') * Math.PI * 2;
      const speed = this.randomRange(dustSpeedMin, dustSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.smoke,
        this.randomRange(dustSizeMin, dustSizeMax, 'boss'),
        this.randomRange(dustLifeMin, dustLifeMax, 'boss'),
        'normal'
      );
      particle.rotationSpeed = this.randomCentered(1.2, 'boss');
      this.tagBossParticle(particle, 'boss-entrance');
      this.particles.push(particle);
    }

    if (config.shockwave) {
      this.createShockwaveEffect({
        position: origin,
        radius: config.shockwave.radius,
        duration: config.shockwave.duration,
        baseWidth: config.shockwave.baseWidth,
        maxAlpha: config.shockwave.maxAlpha,
        widthFade: config.shockwave.widthFade,
        easingPower: config.shockwave.easingPower,
        color: palette.core,
        shadowColor: config.shockwave.shadowColor,
        shadowBlur: config.shockwave.shadowBlur,
        fillColor: config.shockwave.fillColor,
      });
    }

    this.applyBossScreenShake('spawn');
    this.applyBossEffectTimings(config, palette, 'boss-spawned');
  }

  createBossPhaseTransition(payload = {}) {
    const origin = this.resolveBossPosition(payload);
    if (!origin) {
      return;
    }

    const config = this.getBossEffectConfig('phaseTransition') || {};
    const palette = this.resolveBossPalette(
      payload,
      config.colors || {},
      'boss-phase-changed'
    );

    const burst = config.burst || {};
    const burstCount = this.getScaledParticleCount(burst.count ?? 48, {
      allowZero: true,
    });
    const burstSpeedMin = burst.speed?.min ?? 160;
    const burstSpeedMax = burst.speed?.max ?? 280;
    const burstSizeMin = burst.size?.min ?? 2.2;
    const burstSizeMax = burst.size?.max ?? 3.4;
    const burstLifeMin = burst.life?.min ?? 0.35;
    const burstLifeMax = burst.life?.max ?? 0.65;

    for (let i = 0; i < burstCount; i += 1) {
      const angle = this.randomFloat('boss') * Math.PI * 2;
      const speed = this.randomRange(burstSpeedMin, burstSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.core,
        this.randomRange(burstSizeMin, burstSizeMax, 'boss'),
        this.randomRange(burstLifeMin, burstLifeMax, 'boss'),
        'spark'
      );
      particle.rotationSpeed = this.randomCentered(5, 'boss');
      this.tagBossParticle(particle, 'boss-phase');
      this.particles.push(particle);
    }

    const petals = config.petals || {};
    const petalsCount = this.getScaledParticleCount(petals.count ?? 16, {
      allowZero: true,
    });
    const petalRadius = Number.isFinite(petals.radius) ? petals.radius : 110;
    const petalAngularJitter = Number.isFinite(petals.angularJitter)
      ? petals.angularJitter
      : 0.3;
    const petalSpeedMin = petals.speed?.min ?? 60;
    const petalSpeedMax = petals.speed?.max ?? 120;
    const petalSizeMin = petals.size?.min ?? 2.6;
    const petalSizeMax = petals.size?.max ?? 3.6;
    const petalLifeMin = petals.life?.min ?? 0.4;
    const petalLifeMax = petals.life?.max ?? 0.75;

    for (let i = 0; i < petalsCount; i += 1) {
      const baseAngle = (i / Math.max(1, petalsCount)) * Math.PI * 2;
      const jitter = this.randomCentered(petalAngularJitter, 'boss');
      const angle = baseAngle + jitter;
      const speed = this.randomRange(petalSpeedMin, petalSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x + Math.cos(angle) * petalRadius * 0.25,
        origin.y + Math.sin(angle) * petalRadius * 0.25,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.accent,
        this.randomRange(petalSizeMin, petalSizeMax, 'boss'),
        this.randomRange(petalLifeMin, petalLifeMax, 'boss'),
        'spark'
      );
      particle.rotationSpeed = this.randomCentered(4, 'boss');
      this.tagBossParticle(particle, 'boss-phase');
      this.particles.push(particle);
    }

    const embers = config.embers || {};
    const emberCount = this.getScaledParticleCount(embers.count ?? 24, {
      allowZero: true,
    });
    const emberSpeedMin = embers.speed?.min ?? 35;
    const emberSpeedMax = embers.speed?.max ?? 70;
    const emberSizeMin = embers.size?.min ?? 2.4;
    const emberSizeMax = embers.size?.max ?? 3.4;
    const emberLifeMin = embers.life?.min ?? 1.1;
    const emberLifeMax = embers.life?.max ?? 1.6;

    for (let i = 0; i < emberCount; i += 1) {
      const angle = this.randomFloat('boss') * Math.PI * 2;
      const speed = this.randomRange(emberSpeedMin, emberSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.smoke,
        this.randomRange(emberSizeMin, emberSizeMax, 'boss'),
        this.randomRange(emberLifeMin, emberLifeMax, 'boss'),
        'normal'
      );
      particle.rotationSpeed = this.randomCentered(1.5, 'boss');
      this.tagBossParticle(particle, 'boss-phase');
      this.particles.push(particle);
    }

    if (config.shockwave) {
      this.createShockwaveEffect({
        position: origin,
        radius: config.shockwave.radius,
        duration: config.shockwave.duration,
        baseWidth: config.shockwave.baseWidth,
        maxAlpha: config.shockwave.maxAlpha,
        widthFade: config.shockwave.widthFade,
        easingPower: config.shockwave.easingPower,
        color: palette.accent,
        shadowColor: config.shockwave.shadowColor,
        shadowBlur: config.shockwave.shadowBlur,
        fillColor: config.shockwave.fillColor,
      });
    }

    this.applyBossScreenShake('phaseChange');
    this.applyBossEffectTimings(config, palette, 'boss-phase-changed');
  }

  createBossDefeatedExplosion(payload = {}) {
    const origin = this.resolveBossPosition(payload);
    if (!origin) {
      return;
    }

    const config = this.getBossEffectConfig('defeated') || {};
    const palette = this.resolveBossPalette(
      payload,
      config.colors || {},
      'boss-defeated'
    );

    const debris = config.debris || {};
    const debrisCount = this.getScaledParticleCount(debris.count ?? 60);
    const debrisSpeedMin = debris.speed?.min ?? 180;
    const debrisSpeedMax = debris.speed?.max ?? 320;
    const debrisSizeMin = debris.size?.min ?? 2.8;
    const debrisSizeMax = debris.size?.max ?? 4.6;
    const debrisLifeMin = debris.life?.min ?? 0.9;
    const debrisLifeMax = debris.life?.max ?? 1.4;

    for (let i = 0; i < debrisCount; i += 1) {
      const angle = this.randomFloat('boss') * Math.PI * 2;
      const speed = this.randomRange(debrisSpeedMin, debrisSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.core,
        this.randomRange(debrisSizeMin, debrisSizeMax, 'boss'),
        this.randomRange(debrisLifeMin, debrisLifeMax, 'boss'),
        'debris'
      );
      particle.rotationSpeed = this.randomCentered(8, 'boss');
      this.tagBossParticle(particle, 'boss-defeat');
      this.particles.push(particle);
    }

    const sparks = config.sparks || {};
    const sparkCount = this.getScaledParticleCount(sparks.count ?? 90);
    const sparkSpeedMin = sparks.speed?.min ?? 260;
    const sparkSpeedMax = sparks.speed?.max ?? 400;
    const sparkSizeMin = sparks.size?.min ?? 2.4;
    const sparkSizeMax = sparks.size?.max ?? 3.8;
    const sparkLifeMin = sparks.life?.min ?? 0.5;
    const sparkLifeMax = sparks.life?.max ?? 0.85;

    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('boss') * Math.PI * 2;
      const speed = this.randomRange(sparkSpeedMin, sparkSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        i % 3 === 0 ? palette.accent : palette.core,
        this.randomRange(sparkSizeMin, sparkSizeMax, 'boss'),
        this.randomRange(sparkLifeMin, sparkLifeMax, 'boss'),
        'spark'
      );
      particle.rotationSpeed = this.randomCentered(7, 'boss');
      this.tagBossParticle(particle, 'boss-defeat');
      this.particles.push(particle);
    }

    const embers = config.embers || {};
    const emberCount = this.getScaledParticleCount(embers.count ?? 32, {
      allowZero: true,
    });
    const emberSpeedMin = embers.speed?.min ?? 30;
    const emberSpeedMax = embers.speed?.max ?? 60;
    const emberSizeMin = embers.size?.min ?? 3.2;
    const emberSizeMax = embers.size?.max ?? 4.4;
    const emberLifeMin = embers.life?.min ?? 1.5;
    const emberLifeMax = embers.life?.max ?? 2.2;

    for (let i = 0; i < emberCount; i += 1) {
      const angle = this.randomFloat('boss') * Math.PI * 2;
      const speed = this.randomRange(emberSpeedMin, emberSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.trail,
        this.randomRange(emberSizeMin, emberSizeMax, 'boss'),
        this.randomRange(emberLifeMin, emberLifeMax, 'boss'),
        'normal'
      );
      particle.rotationSpeed = this.randomCentered(1.8, 'boss');
      this.tagBossParticle(particle, 'boss-defeat');
      this.particles.push(particle);
    }

    const smoke = config.smoke || {};
    const smokeCount = this.getScaledParticleCount(smoke.count ?? 26, {
      allowZero: true,
    });
    const smokeSpeedMin = smoke.speed?.min ?? 20;
    const smokeSpeedMax = smoke.speed?.max ?? 55;
    const smokeSizeMin = smoke.size?.min ?? 18;
    const smokeSizeMax = smoke.size?.max ?? 26;
    const smokeLifeMin = smoke.life?.min ?? 1.6;
    const smokeLifeMax = smoke.life?.max ?? 2.8;

    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('boss') * Math.PI * 2;
      const speed = this.randomRange(smokeSpeedMin, smokeSpeedMax, 'boss');
      const particle = this.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.smoke,
        this.randomRange(smokeSizeMin, smokeSizeMax, 'boss'),
        this.randomRange(smokeLifeMin, smokeLifeMax, 'boss'),
        'normal'
      );
      particle.rotationSpeed = this.randomCentered(0.9, 'boss');
      this.tagBossParticle(particle, 'boss-defeat');
      this.particles.push(particle);
    }

    if (config.shockwave) {
      this.createShockwaveEffect({
        position: origin,
        radius: config.shockwave.radius,
        duration: config.shockwave.duration,
        baseWidth: config.shockwave.baseWidth,
        maxAlpha: config.shockwave.maxAlpha,
        widthFade: config.shockwave.widthFade,
        easingPower: config.shockwave.easingPower,
        color: palette.core,
        shadowColor: config.shockwave.shadowColor,
        shadowBlur: config.shockwave.shadowBlur,
        fillColor: config.shockwave.fillColor,
      });
    }

    if (config.secondaryShockwave) {
      this.createShockwaveEffect({
        position: origin,
        radius: config.secondaryShockwave.radius,
        duration: config.secondaryShockwave.duration,
        baseWidth: config.secondaryShockwave.baseWidth,
        maxAlpha: config.secondaryShockwave.maxAlpha,
        widthFade: config.secondaryShockwave.widthFade,
        easingPower: config.secondaryShockwave.easingPower,
        color: palette.accent,
        fillColor: config.secondaryShockwave.fillColor,
      });
    }

    this.applyBossScreenShake('defeated');
    this.applyBossEffectTimings(config, palette, 'boss-defeated');
  }

  updateBossTransitions(deltaTime) {
    if (!Array.isArray(this.bossTransitionEffects) || !this.bossTransitionEffects.length) {
      return;
    }

    this.bossTransitionEffects = this.bossTransitionEffects.filter((effect) => {
      if (!effect) {
        return false;
      }

      effect.timer += deltaTime;
      return effect.timer < effect.duration;
    });
  }

  drawBossTransitions(ctx) {
    if (!ctx || !Array.isArray(this.bossTransitionEffects)) {
      return;
    }

    const { width, height } = ctx.canvas || {
      width: CONSTANTS.GAME_WIDTH || 800,
      height: CONSTANTS.GAME_HEIGHT || 600,
    };

    this.bossTransitionEffects.forEach((effect) => {
      if (!effect) {
        return;
      }

      const progress = Math.min(1, effect.timer / effect.duration);
      const fadePower = Number.isFinite(effect.fadePower)
        ? Math.max(0.1, effect.fadePower)
        : 1.5;
      const fade = Math.max(0, 1 - Math.pow(progress, fadePower));
      const pulseFrequency = Number.isFinite(effect.pulseFrequency)
        ? effect.pulseFrequency
        : 1.8;
      const pulse = 0.65 + 0.35 * Math.sin(progress * Math.PI * pulseFrequency);
      const borderAlpha = effect.maxAlpha * fade * pulse;

      if (borderAlpha > 0.01) {
        const strokeWidth = effect.borderWidth * (0.85 + 0.15 * pulse);
        const inset = strokeWidth / 2 + 6;

        ctx.save();
        ctx.globalAlpha = borderAlpha;
        ctx.strokeStyle = effect.color || 'rgba(255, 105, 140, 0.95)';
        ctx.lineWidth = strokeWidth;
        ctx.shadowColor = effect.color || 'rgba(255, 105, 140, 0.95)';
        ctx.shadowBlur = strokeWidth * 1.4 * fade;
        ctx.beginPath();
        ctx.strokeRect(
          inset,
          inset,
          Math.max(0, width - inset * 2),
          Math.max(0, height - inset * 2)
        );
        ctx.restore();
      }

      const overlayAlpha = effect.overlayAlpha * fade * Math.min(1, pulse + 0.15);
      if (overlayAlpha > 0.01) {
        ctx.save();
        ctx.globalAlpha = overlayAlpha;
        ctx.fillStyle = effect.color || 'rgba(255, 105, 140, 0.9)';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }
    });
  }

  addScreenShake(intensity, duration) {
    const inputIntensity = Number.isFinite(intensity) ? intensity : 0;
    const inputDuration = Number.isFinite(duration) ? duration : 0;

    const scale = Math.max(0, this.screenShakeScale ?? 1);
    const motionScale = this.motionReduced ? 0.45 : 1;
    const finalIntensity = inputIntensity * scale * motionScale;

    if (finalIntensity <= 0) {
      return;
    }

    let finalDuration = inputDuration;
    if (this.motionReduced) {
      finalDuration = Math.min(finalDuration, 0.2);
    }
    finalDuration = Math.max(0, finalDuration);
    if (finalDuration <= 0) {
      return;
    }

    // Convert old intensity (0-12 range) to trauma (0-1 range)
    // Old max was ~12, so divide by 15 to get 0-0.8 trauma range
    const trauma = Math.min(1, finalIntensity / 15);
    this.screenShake.add(trauma, finalDuration);
  }

  addFreezeFrame(duration, fade = 0) {
    let finalDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    let finalFade = Number.isFinite(fade) ? fade : 0;

    if (this.motionReduced) {
      finalDuration = Math.min(finalDuration, 0.12);
      finalFade = Math.min(finalFade, 0.2);
    }

    if (finalDuration <= 0) {
      return;
    }

    this.freezeFrame.timer = Math.max(this.freezeFrame.timer, finalDuration);
    this.freezeFrame.duration = Math.max(
      this.freezeFrame.duration,
      finalDuration
    );
    this.freezeFrame.fade = finalFade;
  }

  applyTimeDilation(targetScale, options = {}) {
    if (!this.timeDilation) {
      this.timeDilation = {
        timer: 0,
        duration: 0,
        startScale: 1,
        endScale: 1,
        holdScale: 1,
        holdTimer: 0,
        easing: 'outCubic',
        active: false,
      };
    }

    const rawScale = Number.isFinite(targetScale) ? targetScale : 1;
    let scale = Math.max(0, Math.min(1, rawScale));

    const optionDuration = Number.isFinite(options.duration)
      ? Math.max(0, options.duration)
      : Number.isFinite(options.transition)
      ? Math.max(0, options.transition)
      : 0.45;
    const optionHold = Number.isFinite(options.holdDuration)
      ? Math.max(0, options.holdDuration)
      : Number.isFinite(options.hold)
      ? Math.max(0, options.hold)
      : 0;
    let duration = optionDuration;
    let holdDuration = optionHold;

    if (this.motionReduced) {
      scale = Math.max(scale, 0.7);
      duration = Math.min(duration, 0.35);
      holdDuration = Math.min(holdDuration, 0.12);
    }

    if (scale >= 0.999 && holdDuration <= 0 && duration <= 0) {
      return;
    }

    const easing = typeof options.easing === 'string' ? options.easing : 'outCubic';

    this.timeDilation.holdScale = scale;
    this.timeDilation.holdTimer = holdDuration;
    this.timeDilation.startScale = scale;
    this.timeDilation.endScale = 1;
    this.timeDilation.duration = duration;
    this.timeDilation.timer = duration;
    this.timeDilation.easing = easing;
    this.timeDilation.active = true;
  }

  addScreenFlash(color, duration, intensity) {
    if (!this.damageFlashEnabled) {
      return;
    }

    let finalDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    let finalIntensity = Number.isFinite(intensity)
      ? Math.max(0, intensity)
      : 0;

    if (this.motionReduced) {
      finalDuration = Math.min(finalDuration, 0.18);
      finalIntensity *= 0.6;
    }

    if (finalDuration <= 0 || finalIntensity <= 0) {
      return;
    }

    this.screenFlash.color = color;
    this.screenFlash.duration = finalDuration;
    this.screenFlash.timer = finalDuration;
    this.screenFlash.intensity = finalIntensity;
  }

  spawnThrusterVFX(worldX, worldY, dirX, dirY, intensity = 1, type = 'main', visualLevel = 0) {
    const i = Math.max(0, Math.min(1, intensity));
    const thrusterFork = 'thrusters';
    const colorFork = 'colors';

    // AGGRESSIVE Visual upgrade scaling matching design doc v3:
    // Rank 5 = +150% particles (2.5x), +100% size (2x), +50% lifetime (1.5x), +50% speed (creates longer trail)
    const visualBoost = 1 + (visualLevel * 0.3); // 30% per level = 2.5x at rank 5
    const sizeBoost = 1 + (visualLevel * 0.2); // 20% per level = 2x at rank 5
    const lifeBoost = 1 + (visualLevel * 0.1); // 10% per level = 1.5x at rank 5
    const speedBoost = 1 + (visualLevel * 0.1); // 10% per level = 1.5x at rank 5 (creates "length")

    let baseCount, speedBase, sizeRange, lifeRange, colorFn;

    switch (type) {
      case 'main':
        baseCount = 3 * visualBoost;
        speedBase = 120 * speedBoost; // Faster particles = longer visible trail
        sizeRange = [2.0 * sizeBoost, 3.2 * sizeBoost];
        lifeRange = [0.22 * lifeBoost, 0.28 * lifeBoost];
        // Color progression: Orange → Yellow → Cyan-blue (no white plasma)
        colorFn = () => {
          if (visualLevel >= 5) {
            // RANK 5: Electric cyan-blue (no white)
            return `hsl(${190 + this.randomFloat(colorFork) * 20}, 100%, ${70 + this.randomFloat(colorFork) * 12}%)`;
          } else if (visualLevel >= 4) {
            // RANK 4: Bright cyan
            return `hsl(${185 + this.randomFloat(colorFork) * 25}, 100%, ${68 + this.randomFloat(colorFork) * 14}%)`;
          } else if (visualLevel >= 3) {
            // RANK 3: Bright yellow
            return `hsl(${45 + this.randomFloat(colorFork) * 15}, 100%, ${68 + this.randomFloat(colorFork) * 14}%)`;
          } else if (visualLevel >= 1) {
            // RANK 1-2: Brighter orange
            return `hsl(${25 + this.randomFloat(colorFork) * 20}, 100%, ${63 + this.randomFloat(colorFork) * 14}%)`;
          }
          // Base: Standard orange
          return `hsl(${18 + this.randomFloat(colorFork) * 22}, 100%, ${60 + this.randomFloat(colorFork) * 16}%)`;
        };
        break;
      case 'aux':
        baseCount = 2 * visualBoost;
        speedBase = 105 * speedBoost;
        sizeRange = [1.8 * sizeBoost, 2.6 * sizeBoost];
        lifeRange = [0.18 * lifeBoost, 0.26 * lifeBoost];
        // Braking thrusters get brighter with upgrades
        colorFn = () => {
          if (visualLevel >= 3) {
            return `hsl(${190 + this.randomFloat(colorFork) * 20}, 100%, ${75 + this.randomFloat(colorFork) * 15}%)`;
          }
          return `hsl(${200 + this.randomFloat(colorFork) * 25}, 100%, ${68 + this.randomFloat(colorFork) * 18}%)`;
        };
        break;
      default: // 'side'
        baseCount = 2 * visualBoost;
        speedBase = 110 * speedBoost;
        sizeRange = [1.6 * sizeBoost, 2.2 * sizeBoost];
        lifeRange = [0.16 * lifeBoost, 0.22 * lifeBoost];
        // RCS thrusters: Blue → BRIGHT CYAN
        colorFn = () => {
          if (visualLevel >= 5) {
            // RANK 5: ELECTRIC CYAN
            return `hsl(${180 + this.randomFloat(colorFork) * 10}, 100%, ${80 + this.randomFloat(colorFork) * 15}%)`;
          } else if (visualLevel >= 3) {
            // RANK 3+: Bright cyan
            return `hsl(${180 + this.randomFloat(colorFork) * 20}, 100%, ${75 + this.randomFloat(colorFork) * 15}%)`;
          }
          // Base: Standard blue
          return `hsl(${200 + this.randomFloat(colorFork) * 25}, 100%, ${70 + this.randomFloat(colorFork) * 18}%)`;
        };
    }

    const rawCount = baseCount * (0.8 + i * 2.0);
    const count = this.getScaledParticleCount(rawCount);

    for (let c = 0; c < count; c++) {
      const jitter = (this.randomFloat(thrusterFork) - 0.5) * 0.35;
      const spd = speedBase * (0.8 + i * 1.6) * (0.85 + this.randomFloat(thrusterFork) * 0.3);
      const vx = (-dirX + jitter) * spd + (this.randomFloat(thrusterFork) - 0.5) * 20;
      const vy = (-dirY + jitter) * spd + (this.randomFloat(thrusterFork) - 0.5) * 20;
      const size = sizeRange[0] + this.randomFloat(thrusterFork) * (sizeRange[1] - sizeRange[0]);
      const life = lifeRange[0] + this.randomFloat(thrusterFork) * (lifeRange[1] - lifeRange[0]);

      this.particles.push(
        this.createParticle(
          worldX + (this.randomFloat(thrusterFork) - 0.5) * 3,
          worldY + (this.randomFloat(thrusterFork) - 0.5) * 3,
          vx,
          vy,
          colorFn(),
          size,
          life,
          'thruster'
        )
      );

      // Spark probability increases with visual level (25% → 70% at rank 5)
      const sparkProbability = 0.25 + (visualLevel * 0.09);
      if (this.randomFloat(thrusterFork) < this.getScaledProbability(sparkProbability)) {
        const sparkSpd = spd * (0.9 + this.randomFloat(thrusterFork) * 0.3);
        const sparkSize = (1.2 + this.randomFloat(thrusterFork) * 0.8) * sizeBoost;
        this.particles.push(
          this.createParticle(
            worldX,
            worldY,
            -dirX * sparkSpd,
            -dirY * sparkSpd,
            '#FFFFFF',
            sparkSize,
            0.08 + this.randomFloat(thrusterFork) * 0.06,
            'spark'
          )
        );
      }
    }
  }

  createMuzzleFlash(x, y, dirX, dirY) {
    // Create 5-8 bright particles shooting forward from weapon barrel
    const particleCount = this.getScaledParticleCount(5 + this.randomFloat('muzzleFlash') * 3);

    for (let i = 0; i < particleCount; i++) {
      // Cone spread: ±20° from firing direction (wider cone)
      const spreadAngle = (this.randomFloat('muzzleFlash') - 0.5) * 0.35; // ~20° in radians
      const angle = Math.atan2(dirY, dirX) + spreadAngle;

      // Speed: 200-350 px/s in firing direction (FASTER, more visible)
      const speed = 200 + this.randomFloat('muzzleFlash') * 150;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      // Color: BRIGHT white-yellow (more visible)
      const useWhite = this.randomFloat('muzzleFlash') > 0.5;
      const color = useWhite
        ? '#FFFFFF' // Pure white
        : `hsl(${50 + this.randomFloat('muzzleFlash') * 10}, 100%, 95%)`; // Very bright yellow

      // Size: 3-6px (BIGGER sparks, more visible)
      const size = 3 + this.randomFloat('muzzleFlash') * 3;

      // Lifetime: 0.12-0.20s (longer duration)
      const life = 0.12 + this.randomFloat('muzzleFlash') * 0.08;

      this.particles.push(
        this.createParticle(
          x + dirX * 10, // Spawn further ahead (more visible separation)
          y + dirY * 10,
          vx,
          vy,
          color,
          size,
          life,
          'spark'
        )
      );
    }
  }

  resolveEnemyType(payload = {}, fallbackEnemy = null) {
    if (!payload && !fallbackEnemy) {
      return null;
    }

    const typeCandidate =
      payload?.enemyType ??
      payload?.type ??
      payload?.enemy?.type ??
      payload?.source?.type ??
      fallbackEnemy?.type ??
      null;

    if (typeof typeCandidate === 'string' && typeCandidate.trim().length > 0) {
      return typeCandidate.trim().toLowerCase();
    }

    return null;
  }

  resolveEnemyEffectPalette(type, fallbackType = null) {
    if (!CONSTANTS.ENEMY_EFFECT_COLORS) {
      return {};
    }

    const normalizedType = typeof type === 'string' ? type.toLowerCase() : null;
    const fallback =
      typeof fallbackType === 'string' ? fallbackType.toLowerCase() : null;

    const palette =
      (normalizedType && CONSTANTS.ENEMY_EFFECT_COLORS[normalizedType]) ||
      (fallback && CONSTANTS.ENEMY_EFFECT_COLORS[fallback]) ||
      null;

    return palette || {};
  }

  resolveEnemyProjectileOrigin(payload = {}) {
    const positionCandidate =
      payload?.position || payload?.origin || payload?.source?.position || null;
    const enemy = payload?.enemy || null;

    const x = Number.isFinite(positionCandidate?.x)
      ? positionCandidate.x
      : Number.isFinite(enemy?.x)
      ? enemy.x
      : Number.isFinite(enemy?.position?.x)
      ? enemy.position.x
      : null;
    const y = Number.isFinite(positionCandidate?.y)
      ? positionCandidate.y
      : Number.isFinite(enemy?.y)
      ? enemy.y
      : Number.isFinite(enemy?.position?.y)
      ? enemy.position.y
      : null;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    return { x, y };
  }

  resolveEnemyProjectileDirection(payload = {}) {
    const projectile = payload?.projectile || {};
    let vx = Number.isFinite(payload?.velocity?.x) ? payload.velocity.x : null;
    let vy = Number.isFinite(payload?.velocity?.y) ? payload.velocity.y : null;

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      vx = Number.isFinite(projectile?.vx) ? projectile.vx : vx;
      vy = Number.isFinite(projectile?.vy) ? projectile.vy : vy;
    }

    if (!Number.isFinite(vx) || !Number.isFinite(vy)) {
      const angle = Number.isFinite(projectile?.angle)
        ? projectile.angle
        : Number.isFinite(payload?.angle)
        ? payload.angle
        : null;

      if (Number.isFinite(angle)) {
        const speed = Number.isFinite(projectile?.speed)
          ? Math.max(0, projectile.speed)
          : 1;
        vx = Math.cos(angle) * speed;
        vy = Math.sin(angle) * speed;
      }
    }

    vx = Number.isFinite(vx) ? vx : 0;
    vy = Number.isFinite(vy) ? vy : 0;

    const speed = Math.hypot(vx, vy);
    if (speed <= 0.0001) {
      return { x: 1, y: 0, speed: 0 };
    }

    return { x: vx / speed, y: vy / speed, speed };
  }

  createDroneMuzzleFlash(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    if (!origin) {
      return;
    }

    const enemy = payload?.enemy || null;
    const direction = this.resolveEnemyProjectileDirection(payload);
    const palette = this.resolveEnemyEffectPalette('drone');
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 12;
    const muzzleDistance = radius + 8;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const baseColor = palette.muzzle || '#7AD7FF';
    const accentColor = palette.muzzleAccent || '#C9F1FF';
    const exhaustColor = palette.exhaust || 'rgba(110, 200, 255, 0.45)';
    const flashColor = palette.flash || 'rgba(150, 220, 255, 0.35)';

    const particleCount = this.getScaledParticleCount(4 + this.randomFloat('muzzleFlash') * 3, {
      minimum: 2,
    });

    const baseAngle = Math.atan2(direction.y, direction.x);
    for (let i = 0; i < particleCount; i += 1) {
      const spread = (this.randomFloat('muzzleFlash') - 0.5) * 0.4;
      const angle = baseAngle + spread;
      const speed = 220 + this.randomFloat('muzzleFlash') * 140;
      const size = 2.4 + this.randomFloat('muzzleFlash') * 1.8;
      const life = 0.1 + this.randomFloat('muzzleFlash') * 0.12;
      const color = i % 2 === 0 ? baseColor : accentColor;

      this.particles.push(
        this.createParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'spark'
        )
      );
    }

    const glowCount = this.getScaledParticleCount(3, { allowZero: true });
    for (let i = 0; i < glowCount; i += 1) {
      const backSpeed = 70 + this.randomFloat('muzzleFlash') * 60;
      this.particles.push(
        this.createParticle(
          origin.x,
          origin.y,
          -direction.x * backSpeed * (0.7 + this.randomFloat('muzzleFlash') * 0.5),
          -direction.y * backSpeed * (0.7 + this.randomFloat('muzzleFlash') * 0.5),
          exhaustColor,
          2.6 + this.randomFloat('muzzleFlash') * 2.4,
          0.16 + this.randomFloat('muzzleFlash') * 0.12,
          'normal'
        )
      );
    }

    this.addScreenFlash(flashColor, 0.08, 0.06);
    this.addScreenShake(2.2, 0.1);
  }

  createHunterBurstEffect(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    if (!origin) {
      return;
    }

    const enemy = payload?.enemy || null;
    const direction = this.resolveEnemyProjectileDirection(payload);
    const palette = this.resolveEnemyEffectPalette('hunter');
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 16;
    const muzzleDistance = radius + 10;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const baseColor = palette.muzzle || '#FF86E8';
    const accentColor = palette.muzzleAccent || '#FFD6FF';
    const trailColor = palette.burstTrail || '#BE9CFF';
    const flashColor = palette.flash || 'rgba(255, 200, 255, 0.38)';

    const burstInfo = payload?.projectile?.burst || {};
    const shotsRemaining = Number.isFinite(burstInfo.shotsRemaining)
      ? burstInfo.shotsRemaining
      : null;
    const finalShot = shotsRemaining != null ? shotsRemaining <= 1 : false;
    const baseAngle = Math.atan2(direction.y, direction.x);

    const streakAngles = [-0.1, 0, 0.1];
    streakAngles.forEach((offset, index) => {
      const jitter = (this.randomFloat('muzzleFlash') - 0.5) * 0.12;
      const angle = baseAngle + offset + jitter;
      const speed = 260 + this.randomFloat('muzzleFlash') * 160;
      const size = 3 + this.randomFloat('muzzleFlash') * 2.2;
      const life = 0.12 + this.randomFloat('muzzleFlash') * 0.12;
      const color = index === 1 ? baseColor : accentColor;

      this.particles.push(
        this.createParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'spark'
        )
      );
    });

    const trailCount = this.getScaledParticleCount(4, { allowZero: true });
    for (let i = 0; i < trailCount; i += 1) {
      const backSpeed = 90 + this.randomFloat('muzzleFlash') * 70;
      this.particles.push(
        this.createParticle(
          origin.x,
          origin.y,
          -direction.x * backSpeed * (0.6 + this.randomFloat('muzzleFlash') * 0.4),
          -direction.y * backSpeed * (0.6 + this.randomFloat('muzzleFlash') * 0.4),
          trailColor,
          2.8 + this.randomFloat('muzzleFlash') * 2.6,
          0.18 + this.randomFloat('muzzleFlash') * 0.1,
          'normal'
        )
      );
    }

    const flashDuration = finalShot ? 0.12 : 0.09;
    const flashIntensity = finalShot ? 0.12 : 0.08;
    this.addScreenFlash(flashColor, flashDuration, flashIntensity);
    this.addScreenShake(finalShot ? 3.8 : 2.6, finalShot ? 0.2 : 0.14);
  }

  createBossAttackEffect(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    const enemy = payload?.enemy || payload?.boss || null;
    if (!origin || !enemy) {
      return;
    }

    const direction = this.resolveEnemyProjectileDirection(payload);
    const palette = this.resolveBossPalette(payload, {}, 'boss-phase-changed');
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 60;
    const muzzleDistance = radius + 18;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const coreColor = palette.core || '#ff6b9c';
    const accentColor = palette.accent || '#f9c74f';

    const particleCount = this.getScaledParticleCount(6, { minimum: 3 });
    const baseAngle = Math.atan2(direction.y, direction.x);
    for (let i = 0; i < particleCount; i += 1) {
      const spread = (this.randomFloat('boss') - 0.5) * 0.28;
      const angle = baseAngle + spread;
      const speed = 280 + this.randomFloat('boss') * 160;
      const size = 3.2 + this.randomFloat('boss') * 2.6;
      const life = 0.14 + this.randomFloat('boss') * 0.12;
      const color = i % 2 === 0 ? coreColor : accentColor;

      this.particles.push(
        this.createParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'spark'
        )
      );
    }

    const flashColor = palette.flash || coreColor;
    this.addScreenFlash(flashColor, 0.14, 0.12);
    this.addScreenShake(4.2, 0.18);
  }

  createMineExplosion(payload = {}) {
    if (!payload) {
      return;
    }

    const enemy = payload.enemy || null;
    if (enemy && this.processedMineExplosions instanceof WeakSet) {
      if (this.processedMineExplosions.has(enemy)) {
        return;
      }
      this.processedMineExplosions.add(enemy);
    }

    const positionCandidate = payload.position || (enemy ? { x: enemy.x, y: enemy.y } : null);
    if (!positionCandidate) {
      return;
    }

    const posX = Number.isFinite(positionCandidate.x) ? positionCandidate.x : null;
    const posY = Number.isFinite(positionCandidate.y) ? positionCandidate.y : null;
    if (!Number.isFinite(posX) || !Number.isFinite(posY)) {
      return;
    }

    const position = { x: posX, y: posY };
    const palette = this.resolveEnemyEffectPalette('mine');
    const radius = Number.isFinite(payload.radius)
      ? payload.radius
      : Number.isFinite(enemy?.explosionRadius)
      ? enemy.explosionRadius
      : 120;
    const velocity = payload.velocity || {
      x: Number.isFinite(enemy?.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy?.vy) ? enemy.vy : 0,
    };

    const intensity = Math.max(1, radius / 110);
    const flashColor = palette.flash || 'rgba(255, 190, 110, 0.4)';
    const shockwaveColor = palette.shockwave || palette.flash || 'rgba(255, 160, 70, 0.35)';
    const debrisColor = palette.debris || '#7A3B16';
    const sparkColor = palette.sparks || '#FFD27F';
    const smokeColor = palette.smoke || 'rgba(90, 40, 20, 0.45)';

    this.addScreenShake(6 + radius * 0.025, 0.28 + intensity * 0.08);
    this.addScreenFlash(flashColor, 0.22, 0.2 + intensity * 0.05);
    this.addFreezeFrame(0.14 + Math.min(0.12, intensity * 0.08), 0.18);

    this.createShockwaveEffect({
      position,
      radius: radius * 1.1,
      duration: 0.55,
      baseWidth: 20,
      maxAlpha: 0.72,
      color: shockwaveColor,
      shadowColor: 'rgba(255, 140, 60, 0.5)',
      shadowBlur: 28,
      fillColor: 'rgba(255, 210, 160, 0.18)',
    });

    const sparkCount = this.getScaledParticleCount(24 + Math.round(radius / 4));
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = (140 + this.randomFloat('explosions') * 180) * (0.9 + intensity * 0.25);
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + (velocity.x || 0) * 0.35,
          Math.sin(angle) * speed + (velocity.y || 0) * 0.35,
          sparkColor,
          2.4 + this.randomFloat('explosions') * 2.8,
          0.32 + this.randomFloat('explosions') * 0.18,
          'spark'
        )
      );
    }

    const debrisCount = this.getScaledParticleCount(14 + Math.round(radius / 6));
    for (let i = 0; i < debrisCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 90 + this.randomFloat('explosions') * 110;
      this.particles.push(
        this.createParticle(
          position.x + Math.cos(angle) * radius * 0.18,
          position.y + Math.sin(angle) * radius * 0.18,
          Math.cos(angle) * speed + (velocity.x || 0) * 0.25,
          Math.sin(angle) * speed + (velocity.y || 0) * 0.25,
          debrisColor,
          3.2 + this.randomFloat('explosions') * 2.4,
          0.5 + this.randomFloat('explosions') * 0.3,
          'debris'
        )
      );
    }

    const smokeCount = this.getScaledParticleCount(10 + Math.round(radius / 10), {
      allowZero: true,
    });
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 40 + this.randomFloat('explosions') * 60;
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed * 0.6,
          Math.sin(angle) * speed * 0.6,
          smokeColor,
          6 + this.randomFloat('explosions') * 5,
          0.7 + this.randomFloat('explosions') * 0.4,
          'normal'
        )
      );
    }
  }

  createDroneDestructionEffect(enemy, context = {}) {
    if (!enemy) {
      return;
    }

    const position = {
      x: Number.isFinite(enemy.x) ? enemy.x : Number.isFinite(context?.position?.x) ? context.position.x : null,
      y: Number.isFinite(enemy.y) ? enemy.y : Number.isFinite(context?.position?.y) ? context.position.y : null,
    };

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return;
    }

    const palette = this.resolveEnemyEffectPalette('drone');
    const radius = Number.isFinite(enemy.radius) ? enemy.radius : 12;
    const velocity = {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    this.addScreenShake(3.4, 0.18);
    this.addScreenFlash(palette.flash || 'rgba(150, 220, 255, 0.35)', 0.12, 0.1);

    const sparkCount = this.getScaledParticleCount(14 + Math.round(radius));
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 120 + this.randomFloat('explosions') * 150;
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.3,
          Math.sin(angle) * speed + velocity.y * 0.3,
          palette.explosionSpark || '#E1F6FF',
          2 + this.randomFloat('explosions') * 2.2,
          0.32 + this.randomFloat('explosions') * 0.18,
          'spark'
        )
      );
    }

    const coreCount = this.getScaledParticleCount(6, { allowZero: true });
    for (let i = 0; i < coreCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 70 + this.randomFloat('explosions') * 80;
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.25,
          Math.sin(angle) * speed + velocity.y * 0.25,
          palette.explosionCore || 'rgba(120, 205, 255, 0.45)',
          3 + this.randomFloat('explosions') * 2.8,
          0.4 + this.randomFloat('explosions') * 0.18,
          'normal'
        )
      );
    }

    const smokeCount = this.getScaledParticleCount(5, { allowZero: true });
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 40 + this.randomFloat('explosions') * 60;
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed * 0.5,
          Math.sin(angle) * speed * 0.5,
          palette.explosionSmoke || 'rgba(40, 80, 120, 0.35)',
          4.5 + this.randomFloat('explosions') * 3.2,
          0.55 + this.randomFloat('explosions') * 0.22,
          'normal'
        )
      );
    }
  }

  createHunterDestructionEffect(enemy, context = {}) {
    if (!enemy) {
      return;
    }

    const position = {
      x: Number.isFinite(enemy.x) ? enemy.x : Number.isFinite(context?.position?.x) ? context.position.x : null,
      y: Number.isFinite(enemy.y) ? enemy.y : Number.isFinite(context?.position?.y) ? context.position.y : null,
    };

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return;
    }

    const palette = this.resolveEnemyEffectPalette('hunter');
    const radius = Number.isFinite(enemy.radius) ? enemy.radius : 16;
    const velocity = {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    this.addScreenShake(5.2, 0.22);
    this.addScreenFlash(palette.flash || 'rgba(255, 200, 255, 0.38)', 0.14, 0.14);
    this.createShockwaveEffect({
      position,
      radius: radius * 2.4,
      duration: 0.42,
      baseWidth: 16,
      maxAlpha: 0.55,
      color: palette.explosionCore || 'rgba(250, 150, 255, 0.5)',
      shadowColor: 'rgba(120, 40, 160, 0.45)',
      shadowBlur: 22,
    });

    const sparkCount = this.getScaledParticleCount(18 + Math.round(radius * 1.5));
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 150 + this.randomFloat('explosions') * 170;
      const color = i % 3 === 0
        ? palette.explosionCore || 'rgba(250, 150, 255, 0.5)'
        : palette.explosionSpark || '#FFE8FF';
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.35,
          Math.sin(angle) * speed + velocity.y * 0.35,
          color,
          2.6 + this.randomFloat('explosions') * 2.6,
          0.34 + this.randomFloat('explosions') * 0.2,
          'spark'
        )
      );
    }

    const plumeCount = this.getScaledParticleCount(8, { allowZero: true });
    for (let i = 0; i < plumeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 60 + this.randomFloat('explosions') * 80;
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed + velocity.x * 0.22,
          Math.sin(angle) * speed + velocity.y * 0.22,
          palette.explosionCore || 'rgba(250, 150, 255, 0.5)',
          4.8 + this.randomFloat('explosions') * 3.4,
          0.46 + this.randomFloat('explosions') * 0.24,
          'normal'
        )
      );
    }

    const smokeCount = this.getScaledParticleCount(7, { allowZero: true });
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 40 + this.randomFloat('explosions') * 60;
      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed * 0.55,
          Math.sin(angle) * speed * 0.55,
          palette.explosionSmoke || 'rgba(70, 30, 110, 0.35)',
          5.4 + this.randomFloat('explosions') * 3.6,
          0.6 + this.randomFloat('explosions') * 0.22,
          'normal'
        )
      );
    }
  }

  createHitMarker(position, killed, damage) {
    this.hitMarkers.push(new HitMarker(position.x, position.y, killed, damage));
  }

  createDirectionalDamageIndicator(damageSourcePos, playerPos) {
    // Calculate angle from player to damage source
    const dx = damageSourcePos.x - playerPos.x;
    const dy = damageSourcePos.y - playerPos.y;
    const angle = Math.atan2(dy, dx);

    // Calculate screen edge position
    // Use half screen dimensions to position at edge
    const halfWidth = CONSTANTS.GAME_WIDTH / 2;
    const halfHeight = CONSTANTS.GAME_HEIGHT / 2;

    // Find intersection with screen edge
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // Calculate which edge the indicator should appear on
    let edgeX, edgeY;
    const tanAngle = Math.abs(sin / cos);

    if (tanAngle < halfHeight / halfWidth) {
      // Hit left or right edge
      edgeX = cos > 0 ? CONSTANTS.GAME_WIDTH - 40 : 40;
      edgeY = halfHeight + (edgeX - halfWidth) * (sin / cos);
    } else {
      // Hit top or bottom edge
      edgeY = sin > 0 ? CONSTANTS.GAME_HEIGHT - 40 : 40;
      edgeX = halfWidth + (edgeY - halfHeight) * (cos / sin);
    }

    this.damageIndicators.push({
      x: edgeX,
      y: edgeY,
      angle: angle + Math.PI, // Point inward toward threat
      life: 0.6, // 0.6s visibility
      maxLife: 0.6,
      expansion: 0,
      color: 'rgba(255, 50, 50, 0.9)', // Bright red
    });
  }

  drawDamageIndicators(ctx) {
    this.damageIndicators.forEach((indicator) => {
      ctx.save();

      // Fade out based on remaining life
      const alpha = indicator.life / indicator.maxLife;

      // Translate to indicator position
      ctx.translate(indicator.x, indicator.y);
      ctx.rotate(indicator.angle);

      // Draw chevron (triple arrow: <<<)
      ctx.strokeStyle = indicator.color.replace('0.9)', `${alpha * 0.9})`);
      ctx.fillStyle = indicator.color.replace('0.9)', `${alpha * 0.7})`);
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const size = 15 + indicator.expansion * 0.5; // Slight expansion
      const spacing = 8;

      // Draw three chevrons (>>>)
      for (let i = 0; i < 3; i++) {
        const offsetX = i * spacing;
        ctx.beginPath();
        ctx.moveTo(offsetX, -size);
        ctx.lineTo(offsetX + size, 0);
        ctx.lineTo(offsetX, size);
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  createBulletImpact(position, enemyVelocity, killed) {
    // More particles if killed, fewer for just a hit
    const particleCount = this.getScaledParticleCount(killed ? 12 : 6);

    for (let i = 0; i < particleCount; i++) {
      const angle = this.randomFloat('hits') * Math.PI * 2;
      const speed = 80 + this.randomFloat('hits') * 100; // FASTER (80-180 vs 60-140)

      // Spark color: BRIGHT red if killed, BRIGHT cyan/blue if hit (different from muzzle)
      const color = killed
        ? (this.randomFloat('hits') > 0.3 ? '#FF3333' : '#FFAA00') // Red/orange mix for kills
        : (this.randomFloat('hits') > 0.5 ? '#00FFFF' : '#88FFFF'); // Cyan for hits (contrast with yellow muzzle)

      // Inherit some momentum from the enemy
      const vx = Math.cos(angle) * speed + enemyVelocity.x * 0.3;
      const vy = Math.sin(angle) * speed + enemyVelocity.y * 0.3;

      // BIGGER sparks (more visible)
      const size = killed ? 3 + this.randomFloat('hits') * 2.5 : 2.5 + this.randomFloat('hits') * 2;

      // Longer lifetime
      const life = 0.18 + this.randomFloat('hits') * 0.12; // 0.18-0.30s

      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          vx,
          vy,
          color,
          size,
          life,
          'spark'
        )
      );
    }
  }

  createShockwaveEffect(data) {
    if (!data || !data.position) {
      return;
    }

    const radius =
      typeof data.radius === 'number'
        ? data.radius
        : CONSTANTS.SHIELD_SHOCKWAVE_RADIUS;

    const duration =
      typeof data.duration === 'number' && data.duration > 0
        ? data.duration
        : 0.45;
    const baseWidth =
      typeof data.baseWidth === 'number' && data.baseWidth > 0
        ? data.baseWidth
        : 10;
    const maxAlpha =
      typeof data.maxAlpha === 'number' ? Math.max(0, data.maxAlpha) : 0.6;
    const widthFade = typeof data.widthFade === 'number' ? data.widthFade : 0.6;
    const easingPower =
      typeof data.easingPower === 'number' ? data.easingPower : 1;

    const wave = {
      x: data.position.x,
      y: data.position.y,
      maxRadius: radius,
      radius: 0,
      timer: 0,
      duration,
      baseWidth,
      maxAlpha,
      alpha: maxAlpha,
      widthFade,
      easingPower,
      color: data.color,
      shadowColor: data.shadowColor,
      shadowBlur: data.shadowBlur,
      fillColor: data.fillColor,
    };

    this.shockwaves.push(wave);
    if (this.shockwaves.length > 6) {
      this.shockwaves = this.shockwaves.slice(-6);
    }
  }

  createShieldHitEffect(data = {}) {
    if (!data.position) {
      return;
    }

    const normalInput = data.normal || { x: 0, y: -1 };
    const normalLength = Math.hypot(normalInput.x || 0, normalInput.y || 0);
    const nx = normalLength > 0 ? normalInput.x / normalLength : 0;
    const ny = normalLength > 0 ? normalInput.y / normalLength : -1;

    const level = Number.isFinite(data.level) ? data.level : 1;
    const intensityBase = Number.isFinite(data.intensity) ? data.intensity : 1;
    const intensity = Math.min(2.5, Math.max(0.6, intensityBase));

    const particleCount = this.getScaledParticleCount(
      12 + level * 2 + intensity * 4
    );
    for (let i = 0; i < particleCount; i += 1) {
      const spread = (this.randomFloat('hits') - 0.5) * Math.PI * 0.7;
      const angle = Math.atan2(-ny, -nx) + spread;
      const speed = 140 + this.randomFloat('hits') * 120 * intensity;
      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;
      this.particles.push(
        this.createParticle(
          data.position.x,
          data.position.y,
          vx,
          vy,
          `rgba(80, 220, 255, ${0.6 + this.randomFloat('hits') * 0.3})`,
          2.4 + this.randomFloat('hits') * 1.6,
          0.28 + this.randomFloat('hits') * 0.18,
          'spark'
        )
      );
    }

    const glow = this.createParticle(
      data.position.x,
      data.position.y,
      -nx * 40,
      -ny * 40,
      'rgba(140, 240, 255, 0.4)',
      5 + level * 1.3,
      0.3 + 0.05 * level
    );
    this.particles.push(glow);

    this.addScreenShake(3 + level * 0.6, 0.15 + 0.02 * intensity);
    this.addScreenFlash('rgba(0, 191, 255, 0.22)', 0.12, 0.18 + 0.04 * level);
  }

  createXPCollectEffect(x, y) {
    const count = this.getScaledParticleCount(6);
    for (let i = 0; i < count; i++) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 25 + this.randomFloat('explosions') * 40;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        '#00DDFF',
        1.5 + this.randomFloat('explosions') * 1.5,
        0.3 + this.randomFloat('explosions') * 0.2
      );
      this.particles.push(particle);
    }
  }

  createOrbFusionEffect(data) {
    const tier = data?.tier || 1;
    const consumed = data?.consumed || 0;
    const particleColor = data?.color || '#FFFFFF';
    const glowColor = data?.glow || 'rgba(255, 255, 255, 0.35)';
    const flashColor = data?.flash || 'rgba(255, 255, 255, 0.2)';
    const { x, y } = data.position;

    const particleCount = this.getScaledParticleCount(
      12 + Math.min(24, tier * 4 + Math.floor(consumed / 2))
    );

    for (let i = 0; i < particleCount; i += 1) {
      const angle = (Math.PI * 2 * i) / particleCount + this.randomFloat('explosions') * 0.3;
      const speed = 60 + this.randomFloat('explosions') * 80;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        particleColor,
        1.5 + this.randomFloat('explosions') * 2.5,
        0.4 + this.randomFloat('explosions') * 0.35,
        'spark'
      );
      this.particles.push(particle);
    }

    const halo = this.createParticle(
      x,
      y,
      0,
      0,
      glowColor,
      5 + tier * 1.8,
      0.35 + tier * 0.07
    );
    this.particles.push(halo);

    const ringCount = this.getScaledParticleCount(4 + tier, { minimum: 2 });
    for (let i = 0; i < ringCount; i += 1) {
      const angle = (Math.PI * 2 * i) / ringCount;
      const speed = 40 + tier * 12;
      const particle = this.createParticle(
        x,
        y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        glowColor,
        2.5 + tier * 0.8,
        0.45 + this.randomFloat('explosions') * 0.2
      );
      this.particles.push(particle);
    }

    this.addScreenShake(2 + tier * 0.6, 0.12 + tier * 0.03);
    this.addScreenFlash(flashColor, 0.1, 0.14 + tier * 0.02);
  }

  createEpicShipExplosion(position) {
    // EPIC DEATH EXPLOSION - High velocity fragments + massive shockwave

    // Huge freeze frame for dramatic impact
    this.addFreezeFrame(0.35, 0.4);

    // Massive screen shake
    this.addScreenShake(15, 0.6);

    // Bright white flash
    this.addScreenFlash('rgba(255, 255, 255, 0.8)', 0.4, 0.6);

    // HIGH VELOCITY FRAGMENTS (50-80 particles)
    const fragmentCount = this.getScaledParticleCount(50 + this.randomFloat('explosions') * 30);
    for (let i = 0; i < fragmentCount; i++) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      // HIGH VELOCITY: 250-500 px/s
      const speed = 250 + this.randomFloat('explosions') * 250;

      // Mix of colors: white, yellow, orange, red
      const colorChoice = this.randomFloat('explosions');
      let color;
      if (colorChoice < 0.25) color = '#FFFFFF'; // White hot
      else if (colorChoice < 0.5) color = '#FFFF00'; // Yellow
      else if (colorChoice < 0.75) color = '#FF8800'; // Orange
      else color = '#FF3333'; // Red

      // Large fragments
      const size = 3 + this.randomFloat('explosions') * 4;

      // Long lifetime
      const life = 0.6 + this.randomFloat('explosions') * 0.4;

      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          color,
          size,
          life,
          'debris'
        )
      );
    }

    // MASSIVE DESTRUCTIVE SHOCKWAVE (70% of screen)
    const screenWidth = CONSTANTS.GAME_WIDTH || 1920;
    const screenHeight = CONSTANTS.GAME_HEIGHT || 1080;
    const maxDimension = Math.max(screenWidth, screenHeight);
    const shockwaveRadius = maxDimension * 0.7; // 70% of screen

    this.createShockwaveEffect({
      position: position,
      radius: shockwaveRadius,
      duration: 0.8, // Longer duration
      color: 'rgba(255, 100, 50, 0.6)', // Orange-red
      baseWidth: 8, // Thick wave
      maxAlpha: 0.8 // Very visible
    });

    // Secondary inner shockwave (more intense)
    setTimeout(() => {
      this.createShockwaveEffect({
        position: position,
        radius: shockwaveRadius * 0.5,
        duration: 0.5,
        color: 'rgba(255, 200, 100, 0.7)', // Bright yellow-orange
        baseWidth: 6,
        maxAlpha: 0.9
      });
    }, 100);
  }

  createLevelUpExplosion(player) {
    const count = this.getScaledParticleCount(20);
    for (let i = 0; i < count; i++) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 60 + this.randomFloat('explosions') * 120;
      const particle = this.createParticle(
        player.x,
        player.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        `hsl(${this.randomFloat('explosions') * 40 + 40}, 100%, 60%)`,
        2 + this.randomFloat('explosions') * 2,
        0.6 + this.randomFloat('explosions') * 0.4,
        'spark'
      );
      this.particles.push(particle);
    }
  }

  createAsteroidExplosion(asteroid, context = {}) {
    if (!asteroid) {
      return;
    }

    const enemyType = this.resolveEnemyType({ enemy: asteroid });
    if (enemyType === 'drone') {
      this.createDroneDestructionEffect(asteroid, context);
      return;
    }

    if (enemyType === 'hunter') {
      this.createHunterDestructionEffect(asteroid, context);
      return;
    }

    if (enemyType === 'mine') {
      const minePayload = {
        ...context,
        enemy: asteroid,
      };
      if (!minePayload.position) {
        minePayload.position = {
          x: Number.isFinite(asteroid.x) ? asteroid.x : 0,
          y: Number.isFinite(asteroid.y) ? asteroid.y : 0,
        };
      }
      if (!Number.isFinite(minePayload.radius) && Number.isFinite(asteroid.explosionRadius)) {
        minePayload.radius = asteroid.explosionRadius;
      }
      if (!minePayload.velocity) {
        minePayload.velocity = {
          x: Number.isFinite(asteroid.vx) ? asteroid.vx : 0,
          y: Number.isFinite(asteroid.vy) ? asteroid.vy : 0,
        };
      }
      this.createMineExplosion(minePayload);
      return;
    }

    if (enemyType === 'boss') {
      // Boss explosions are handled by dedicated boss events to avoid duplicates.
      return;
    }

    const variantColors =
      typeof asteroid.getVariantColors === 'function'
        ? asteroid.getVariantColors()
        : null;
    const debrisColor = variantColors?.fill || '#8B4513';
    const sparkColor =
      variantColors?.glow ||
      variantColors?.pulse ||
      `hsl(${this.randomFloat('explosions') * 20 + 30}, 100%, 70%)`;
    const secondarySparkColor = variantColors?.cracks || 'rgba(255, 220, 170, 0.85)';

    const baseCount = { large: 12, medium: 8, small: 5 }[asteroid.size] || 6;
    const radius = Number.isFinite(asteroid.radius) ? Math.max(asteroid.radius, 12) : 20;
    const densityFactor = Math.max(1, radius / 22);
    const particleCount = this.getScaledParticleCount(Math.round(baseCount * densityFactor));

    const parentVx = Number.isFinite(asteroid.vx) ? asteroid.vx : 0;
    const parentVy = Number.isFinite(asteroid.vy) ? asteroid.vy : 0;
    const momentumScale = 0.35;
    const speedScale = Math.max(0.85, Math.min(1.8, radius / 24));

    if (asteroid.size === 'small') {
      this.addScreenShake(2 + radius * 0.01, 0.12);
    } else if (asteroid.size === 'medium') {
      this.addScreenShake(4 + radius * 0.012, 0.18);
    } else if (asteroid.size === 'large') {
      this.addScreenShake(8 + radius * 0.015, 0.28);
      this.addFreezeFrame(0.18, 0.24);
      this.addScreenFlash(variantColors?.glow || '#FF6B6B', 0.22, 0.12);
    }

    for (let i = 0; i < particleCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = (40 + this.randomFloat('explosions') * 80) * speedScale;

      const offset = radius * 0.5 * (this.randomFloat('explosions') - 0.5);
      const spawnX = asteroid.x + Math.cos(angle) * offset;
      const spawnY = asteroid.y + Math.sin(angle) * offset;

      const debris = this.createParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * speed + parentVx * momentumScale,
        Math.sin(angle) * speed + parentVy * momentumScale,
        debrisColor,
        2 + this.randomFloat('explosions') * 3.2,
        0.6 + this.randomFloat('explosions') * 0.45,
        'debris'
      );
      this.particles.push(debris);

      const spark = this.createParticle(
        asteroid.x,
        asteroid.y,
        Math.cos(angle) * speed * 1.25 + parentVx * momentumScale,
        Math.sin(angle) * speed * 1.25 + parentVy * momentumScale,
        sparkColor,
        1.6 + this.randomFloat('explosions') * 1.6,
        0.32 + this.randomFloat('explosions') * 0.22,
        'spark'
      );
      this.particles.push(spark);

      if (this.randomFloat('explosions') < 0.35) {
        const secondary = new SpaceParticle(
          asteroid.x,
          asteroid.y,
          Math.cos(angle + Math.PI / 2) * speed * 0.6,
          Math.sin(angle + Math.PI / 2) * speed * 0.6,
          secondarySparkColor,
          1.2 + this.randomFloat('explosions') * 1,
          0.28 + this.randomFloat('explosions') * 0.18,
          'spark',
          this.getRandomFork('explosions')
        );
        this.particles.push(secondary);
      }
    }
  }

  resolveAsteroidColors(variant, size) {
    const fallbackBySize = {
      large: '#8B4513',
      medium: '#A0522D',
      small: '#CD853F',
    };
    const config =
      CONSTANTS.ASTEROID_VARIANTS?.[variant] ||
      CONSTANTS.ASTEROID_VARIANTS?.common;
    const colors = config?.colors || {};
    const fallbackFill = fallbackBySize[size] || fallbackBySize.medium;

    return {
      cracks: colors.cracks || 'rgba(255, 235, 200, 0.92)',
      glow:
        colors.innerGlow ||
        colors.glow ||
        'rgba(255, 255, 255, 0.28)',
      debris: colors.fill || fallbackFill,
    };
  }

  createCrackDebris(event = {}) {
    if (!event || !event.position) {
      return;
    }

    const position = event.position;
    const rotation = Number.isFinite(event.rotation) ? event.rotation : 0;
    const radius = Number.isFinite(event.radius)
      ? Math.max(event.radius, 6)
      : 18;
    const variant = event.variant || 'common';
    const size = event.size || 'medium';

    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);

    const toWorldPoint = (point) => ({
      x: position.x + point.x * cos - point.y * sin,
      y: position.y + point.x * sin + point.y * cos,
    });

    const rotateVector = (vector) => ({
      x: vector.x * cos - vector.y * sin,
      y: vector.x * sin + vector.y * cos,
    });

    const colors = this.resolveAsteroidColors(variant, size);
    const intensity = Math.max(1, Math.round(event.intensity ?? 1));
    const baseLifetime = 0.2 + intensity * 0.08;
    const burst = event.burst || {};

    const segmentsInput = Array.isArray(event.segments) ? event.segments : [];
    const sanitizedSegments = segmentsInput
      .map((segment) => {
        if (!segment) {
          return null;
        }

        const startX = Number.isFinite(segment.start?.x)
          ? segment.start.x
          : Number.isFinite(segment.x1)
            ? segment.x1
            : 0;
        const startY = Number.isFinite(segment.start?.y)
          ? segment.start.y
          : Number.isFinite(segment.y1)
            ? segment.y1
            : 0;
        const endX = Number.isFinite(segment.end?.x)
          ? segment.end.x
          : Number.isFinite(segment.x2)
            ? segment.x2
            : 0;
        const endY = Number.isFinite(segment.end?.y)
          ? segment.end.y
          : Number.isFinite(segment.y2)
            ? segment.y2
            : 0;
        const length = Number.isFinite(segment.length)
          ? segment.length
          : Math.hypot(endX - startX, endY - startY);

        if (!Number.isFinite(length) || length <= 0.2) {
          return null;
        }

        return {
          id: segment.id || null,
          width: Number.isFinite(segment.width) ? segment.width : 1,
          length,
          start: { x: startX, y: startY },
          end: { x: endX, y: endY },
          type: segment.type || 'line',
        };
      })
      .filter(Boolean);

    const createSegmentKey = (segment) => {
      const startX = Number.isFinite(segment.start?.x) ? segment.start.x : 0;
      const startY = Number.isFinite(segment.start?.y) ? segment.start.y : 0;
      const endX = Number.isFinite(segment.end?.x) ? segment.end.x : 0;
      const endY = Number.isFinite(segment.end?.y) ? segment.end.y : 0;
      const type = segment.type || 'line';
      return [
        segment.id ?? 'no-id',
        startX.toFixed(4),
        startY.toFixed(4),
        endX.toFixed(4),
        endY.toFixed(4),
        type,
      ].join(':');
    };

    const segments = [];
    const seenSegments = new Set();

    sanitizedSegments.forEach((segment) => {
      const key = createSegmentKey(segment);
      if (seenSegments.has(key)) {
        return;
      }

      seenSegments.add(key);
      segments.push(segment);
    });

    if (!segments.length) {
      return;
    }

    segments.sort((a, b) => b.length - a.length);

    const baseCrackCount = Math.max(
      1,
      Math.round(segments.length * (0.65 + this.particleDensity * 0.45))
    );

    const cracksToSpawn = Math.max(
      1,
      Math.min(
        segments.length,
        this.getScaledParticleCount(baseCrackCount, {
          allowZero: false,
          minimum: 1,
        })
      )
    );

    const selectedSegments = segments.slice(0, cracksToSpawn);

    selectedSegments.forEach((segment) => {
      const worldStart = toWorldPoint(segment.start);
      const worldEnd = toWorldPoint(segment.end);
      const midX = (worldStart.x + worldEnd.x) * 0.5;
      const midY = (worldStart.y + worldEnd.y) * 0.5;
      const angle = Math.atan2(worldEnd.y - worldStart.y, worldEnd.x - worldStart.x);
      const crackLength = Math.max(0.5, segment.length);

      const crack = new SpaceParticle(
        midX,
        midY,
        0,
        0,
        colors.cracks,
        Math.max(0.55, crackLength / 3.2),
        baseLifetime + Math.min(0.12, crackLength / (radius * 6)),
        'crack',
        this.getRandomFork('explosions')
      );
      crack.rotation = angle;
      crack.rotationSpeed = 0;
      this.particles.push(crack);

      if (!this.motionReduced) {
        const sparkSpeed = 22 + this.randomFloat('explosions') * 28;
        this.particles.push(
          this.createParticle(
            worldEnd.x,
            worldEnd.y,
            Math.cos(angle) * sparkSpeed * 0.32,
            Math.sin(angle) * sparkSpeed * 0.32,
            colors.glow,
            0.9 + this.randomFloat('explosions') * 0.7,
            0.22 + this.randomFloat('explosions') * 0.16,
            'spark'
          )
        );
      }
    });

    const shardCount = this.getScaledParticleCount(burst.shards ?? 0, {
      allowZero: true,
    });

    if (shardCount > 0 && selectedSegments.length > 0) {
      for (let i = 0; i < shardCount; i += 1) {
        const segment = selectedSegments[i % selectedSegments.length];
        const t = this.randomFloat('explosions');
        const localPoint = {
          x: segment.start.x + (segment.end.x - segment.start.x) * t,
          y: segment.start.y + (segment.end.y - segment.start.y) * t,
        };
        const worldPoint = toWorldPoint(localPoint);
        const direction = rotateVector({
          x: segment.end.x - segment.start.x,
          y: segment.end.y - segment.start.y,
        });
        const dirLength = Math.hypot(direction.x, direction.y) || 1;
        const normalized = {
          x: direction.x / dirLength,
          y: direction.y / dirLength,
        };
        const speed = 22 + this.randomFloat('explosions') * 32;

        this.particles.push(
          this.createParticle(
            worldPoint.x,
            worldPoint.y,
            normalized.x * speed,
            normalized.y * speed,
            colors.debris,
            1.4 + this.randomFloat('explosions') * 1.6,
            0.38 + this.randomFloat('explosions') * 0.22,
            'debris'
          )
        );
      }
    }

    const sparkBase =
      (burst.sparks ?? intensity * 2) +
      Math.max(0, Number.isFinite(burst.cracks) ? burst.cracks * 0.3 : 0);
    const sparkCount = this.getScaledParticleCount(sparkBase, {
      allowZero: true,
    });

    for (let i = 0; i < sparkCount; i += 1) {
      const segment =
        selectedSegments.length > 0
          ? selectedSegments[Math.floor(this.randomFloat('explosions') * selectedSegments.length)]
          : null;
      const t = this.randomFloat('explosions');
      const localOrigin = segment
        ? {
            x: segment.start.x + (segment.end.x - segment.start.x) * t,
            y: segment.start.y + (segment.end.y - segment.start.y) * t,
          }
        : { x: 0, y: 0 };
      const worldOrigin = toWorldPoint(localOrigin);

      let dirX;
      let dirY;

      if (segment) {
        const rotated = rotateVector({
          x: segment.end.x - segment.start.x,
          y: segment.end.y - segment.start.y,
        });
        const dirLength = Math.hypot(rotated.x, rotated.y) || 1;
        dirX = rotated.x / dirLength;
        dirY = rotated.y / dirLength;
      } else {
        const angle = this.randomFloat('explosions') * Math.PI * 2;
        dirX = Math.cos(angle);
        dirY = Math.sin(angle);
      }

      const speed = 35 + this.randomFloat('explosions') * 40;

      this.particles.push(
        this.createParticle(
          worldOrigin.x,
          worldOrigin.y,
          dirX * speed,
          dirY * speed,
          colors.glow,
          1.2 + this.randomFloat('explosions') * 0.8,
          0.24 + this.randomFloat('explosions') * 0.14,
          'spark'
        )
      );
    }
  }

  spawnVolatileTrail(data = {}) {
    if (!data || !data.position) {
      return;
    }

    const config = data.config || {};
    const position = data.position;
    const velocity = data.velocity || { x: 0, y: 0 };
    const hasVelocity =
      Number.isFinite(velocity.x) &&
      Number.isFinite(velocity.y) &&
      (velocity.x !== 0 || velocity.y !== 0);
    const baseAngle = hasVelocity
      ? Math.atan2(velocity.y, velocity.x) + Math.PI
      : this.randomFloat('volatility') * Math.PI * 2;

    const colors = config.colors || {};
    const coreColor = colors.core || 'rgba(255, 200, 130, 0.9)';
    const emberColor = colors.ember || 'rgba(255, 110, 40, 0.85)';
    const smokeColor = colors.smoke || 'rgba(60, 24, 10, 0.35)';

    const resolveRange = (value, fallback) => {
      if (Array.isArray(value)) {
        const min = Number.isFinite(value[0]) ? value[0] : fallback[0];
        const max = Number.isFinite(value[1]) ? value[1] : fallback[1];
        return [min, max];
      }
      if (Number.isFinite(value)) {
        return [value, value];
      }
      return fallback;
    };

    const intensityInput = Number.isFinite(data.intensity)
      ? data.intensity
      : Number.isFinite(data.fuseProgress)
        ? data.fuseProgress
        : 0;
    const intensity = Math.max(0, Math.min(1, intensityInput));
    const armedBonus = data.armed ? 0.15 : 0;
    const totalIntensity = Math.min(1.2, intensity + armedBonus);

    const countRange = config.countRange || [2, 4];
    const countMin = Array.isArray(countRange)
      ? countRange[0] ?? 2
      : countRange;
    const countMax = Array.isArray(countRange)
      ? countRange[1] ?? countMin
      : countMin;
    const spawnCount = this.getScaledParticleCount(
      this.randomRange(countMin, countMax + totalIntensity * 1.2, 'volatility')
    );

    const spread = Number.isFinite(config.spread) ? config.spread : Math.PI / 4;
    const speedRange = resolveRange(config.speedRange, [28, 90]);
    const sizeRange = resolveRange(config.sizeRange, [2.2, 3.6]);
    const lifeRange = resolveRange(config.lifeRange, [0.26, 0.46]);
    const jitter = Number.isFinite(config.emberJitter) ? config.emberJitter : 5;

    const speedMagnitude = Math.hypot(velocity.x || 0, velocity.y || 0);
    const speedScale =
      0.7 + Math.min(1.2, speedMagnitude / 140) * 0.4 + totalIntensity * 0.3;

    for (let i = 0; i < spawnCount; i += 1) {
      const angleOffset = (this.randomFloat('volatility') - 0.5) * spread;
      const angle = baseAngle + angleOffset;
      const offsetMag = this.randomRange(0, jitter, 'volatility');
      const spawnX = position.x + Math.cos(angle + Math.PI) * offsetMag;
      const spawnY = position.y + Math.sin(angle + Math.PI) * offsetMag;

      const emberSpeed =
        this.randomRange(speedRange[0], speedRange[1], 'volatility') * speedScale;
      const emberLife =
        this.randomRange(lifeRange[0], lifeRange[1], 'volatility') *
        (0.7 + totalIntensity * 0.5);
      const emberSize =
        this.randomRange(sizeRange[0], sizeRange[1], 'volatility') *
        (0.75 + totalIntensity * 0.45);

      const spark = this.createParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * emberSpeed,
        Math.sin(angle) * emberSpeed,
        emberColor,
        emberSize * 0.6,
        emberLife * 0.75,
        'spark'
      );
      this.particles.push(spark);

      const core = new SpaceParticle(
        spawnX,
        spawnY,
        Math.cos(angle) * emberSpeed * 0.45,
        Math.sin(angle) * emberSpeed * 0.45,
        coreColor,
        emberSize,
        emberLife,
        'normal',
        this.getRandomFork('volatility')
      );
      this.particles.push(core);

      if (this.randomFloat('volatility') < this.getScaledProbability(0.55)) {
        const smoke = new SpaceParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * emberSpeed * 0.25,
          Math.sin(angle) * emberSpeed * 0.25,
          smokeColor,
          emberSize * (1.2 + this.randomFloat('volatility') * 0.6),
          emberLife * (1.3 + this.randomFloat('volatility') * 0.4),
          'normal',
          this.getRandomFork('volatility')
        );
        this.particles.push(smoke);
      }

      if (this.randomFloat('volatility') < this.getScaledProbability(0.3)) {
        const glint = new SpaceParticle(
          spawnX,
          spawnY,
          Math.cos(angle) * emberSpeed * 0.2,
          Math.sin(angle) * emberSpeed * 0.2,
          'rgba(255, 220, 180, 0.7)',
          emberSize * 0.5,
          emberLife * 0.5,
          'normal',
          this.getRandomFork('volatility')
        );
        this.particles.push(glint);
      }
    }
  }

  spawnVolatileWarning(position) {
    const particles = this.getScaledParticleCount(6);
    for (let i = 0; i < particles; i += 1) {
      const angle = (i / particles) * Math.PI * 2;
      const speed = 20 + this.randomFloat('volatility') * 15;
      const particle = this.createParticle(
        position.x,
        position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        'rgba(255, 120, 0, 0.45)',
        1.8 + this.randomFloat('volatility') * 0.6,
        0.35 + this.randomFloat('volatility') * 0.15,
        'spark'
      );
      this.particles.push(particle);
    }
  }

  createExplosionShockwave(data = {}) {
    if (!data.position) {
      return;
    }

    const radius = data.radius ?? 80;
    this.createShockwaveEffect({
      position: data.position,
      radius,
      duration: data.duration ?? 0.6,
      baseWidth: data.baseWidth ?? 18,
      maxAlpha: data.maxAlpha ?? 0.78,
      widthFade: data.widthFade ?? 0.45,
      easingPower: data.easingPower ?? 0.8,
      color: data.color ?? 'rgba(255, 180, 90, 1)',
      shadowColor: data.shadowColor ?? 'rgba(255, 130, 50, 0.75)',
      shadowBlur: data.shadowBlur ?? 34,
    });

    const innerScale = data.innerScale ?? 0.55;
    if (innerScale > 0) {
      this.createShockwaveEffect({
        position: data.position,
        radius: radius * innerScale,
        duration: data.innerDuration ?? 0.5,
        baseWidth: data.innerBaseWidth ?? 10,
        maxAlpha: data.innerMaxAlpha ?? 0.6,
        widthFade: data.innerWidthFade ?? 0.7,
        easingPower: data.innerEasingPower ?? 1.1,
        color: data.innerColor ?? 'rgba(255, 220, 200, 1)',
        shadowColor: data.innerShadowColor ?? 'rgba(255, 200, 160, 0.55)',
        shadowBlur: data.innerShadowBlur ?? 22,
        fillColor: data.innerFillColor ?? 'rgba(255, 210, 170, 0.12)',
      });
    }
  }

  createVolatileExplosionEffect(data) {
    if (!data || !data.position) {
      return;
    }

    const radius = data.radius ?? 70;
    const position = data.position;
    const intensity = Math.min(1.2, radius / 90);

    this.addScreenShake(7 + radius * 0.025, 0.32);
    this.addScreenFlash('rgba(255, 150, 70, 0.55)', 0.26, 0.24);

    this.createExplosionShockwave({
      position,
      radius: radius * 1.05,
    });

    const particleTotal = this.getScaledParticleCount(
      22 + Math.floor(radius / 5)
    );
    for (let i = 0; i < particleTotal; i += 1) {
      const angle = this.randomFloat('volatility') * Math.PI * 2;
      const speed = (70 + this.randomFloat('volatility') * 150) * (0.8 + intensity * 0.4);

      const flame = new SpaceParticle(
        position.x,
        position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        `rgba(255, ${Math.floor(140 + this.randomFloat('volatility') * 70)}, ${Math.floor(
          40 + this.randomFloat('volatility') * 40
        )}, ${0.7 + this.randomFloat('volatility') * 0.2})`,
        2.4 + this.randomFloat('volatility') * 1.8,
        0.38 + this.randomFloat('volatility') * 0.24,
        'spark',
        this.getRandomFork('volatility')
      );
      this.particles.push(flame);

      const debris = this.createParticle(
        position.x + (this.randomFloat('volatility') - 0.5) * radius * 0.4,
        position.y + (this.randomFloat('volatility') - 0.5) * radius * 0.4,
        Math.cos(angle) * speed * 0.6,
        Math.sin(angle) * speed * 0.6,
        '#5E1A0D',
        2 + this.randomFloat('volatility') * 2,
        0.6 + this.randomFloat('volatility') * 0.2,
        'debris'
      );
      this.particles.push(debris);
    }

    const smokeCount = this.getScaledParticleCount(10 + Math.floor(radius / 8));
    for (let i = 0; i < smokeCount; i += 1) {
      const angle = this.randomFloat('volatility') * Math.PI * 2;
      const distance = this.randomFloat('volatility') * radius * 0.55;
      const speed = 20 + this.randomFloat('volatility') * 50;
      const smoke = new SpaceParticle(
        position.x + Math.cos(angle) * distance,
        position.y + Math.sin(angle) * distance,
        Math.cos(angle) * speed * 0.35,
        Math.sin(angle) * speed * 0.35,
        `rgba(60, 30, 20, ${0.25 + this.randomFloat('volatility') * 0.18})`,
        3.5 + this.randomFloat('volatility') * 3.5,
        0.85 + this.randomFloat('volatility') * 0.5,
        'normal',
        this.getRandomFork('volatility')
      );
      this.particles.push(smoke);
    }

    this.particles.push(
      new SpaceParticle(
        position.x,
        position.y,
        0,
        0,
        'rgba(255, 200, 140, 0.5)',
        radius * 0.24,
        0.45 + this.randomFloat('volatility') * 0.2,
        'normal',
        this.getRandomFork('volatility')
      )
    );
  }

  captureRandomForkSeeds() {
    if (!this.randomForks) {
      this.randomForkSeeds = {};
    }

    if (!this.randomForkSeeds) {
      this.randomForkSeeds = {};
    }

    if (this.randomForks) {
      Object.entries(this.randomForks).forEach(([name, fork]) => {
        if (fork && typeof fork.seed === 'number' && Number.isFinite(fork.seed)) {
          this.randomForkSeeds[name] = fork.seed >>> 0;
        }
      });
    }

    if (this.screenShake && typeof this.screenShake.captureSeedState === 'function') {
      this.screenShakeSeedState = this.screenShake.captureSeedState();
    }
  }

  reseedRandomForks() {
    if (!this.randomForkSeeds) {
      this.captureRandomForkSeeds();
    }

    if (this.randomForks) {
      Object.entries(this.randomForks).forEach(([name, fork]) => {
        if (!fork || typeof fork.reset !== 'function') {
          return;
        }

        const storedSeed = this.randomForkSeeds?.[name];
        if (storedSeed !== undefined) {
          fork.reset(storedSeed);
        } else if (this.random && this.randomForkLabels?.[name]) {
          const replacement = this.random.fork(this.randomForkLabels[name]);
          this.randomForks[name] = replacement;
          if (replacement && typeof replacement.seed === 'number') {
            this.randomForkSeeds[name] = replacement.seed >>> 0;
          }
        }
      });
    }

    if (this.screenShake && typeof this.screenShake.reseed === 'function') {
      const snapshot = this.screenShake.reseed(this.getRandomFork('screenShake'), {
        seedState: this.screenShakeSeedState,
      });
      if (snapshot && typeof snapshot === 'object') {
        this.screenShakeSeedState = { ...snapshot };
      } else if (typeof this.screenShake.captureSeedState === 'function') {
        this.screenShakeSeedState = this.screenShake.captureSeedState();
      }
    }
  }

  reset() {
    this.reseedRandomForks();
    this.particles = [];
    this.shockwaves = [];
    this.hitMarkers = [];
    this.screenShake.reset();
    this.freezeFrame = { timer: 0, duration: 0, fade: 0 };
    this.screenFlash = {
      timer: 0,
      duration: 0,
      color: '#FFFFFF',
      intensity: 0,
    };
  }
}
