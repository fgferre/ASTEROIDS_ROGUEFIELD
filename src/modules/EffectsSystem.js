import { BaseSystem } from '../core/BaseSystem.js';
import { PALETTE, withAlpha } from '../data/constants/palette.js';
import { requireService } from '../core/serviceUtils.js';
import { createRandomHelpers } from '../utils/randomHelpers.js';
import { BossTransitions } from './effects/BossTransitions.js';
import { Draw2D } from './effects/draw2d.js';
import { EnemyEffects } from './effects/EnemyEffects.js';
import { GameTime } from './effects/GameTime.js';
import { Particles } from './effects/Particles.js';
import { PlayerEffects } from './effects/PlayerEffects.js';
import { PLAYER_HIT_SHAKE, ScreenFeedback } from './effects/ScreenFeedback.js';

export default class EffectsSystem extends BaseSystem {
  constructor(config = {}) {
    const normalizedConfig =
      config && typeof config === 'object' && !Array.isArray(config)
        ? config
        : {};
    const parentRandom = normalizedConfig.random;
    const initialRandomSnapshot =
      parentRandom && typeof parentRandom.debugSnapshot === 'function'
        ? parentRandom.debugSnapshot()
        : null;
    // Pass config to BaseSystem with random management options
    super(normalizedConfig, {
      enableRandomManagement: true,
      systemName: 'EffectsSystem',
      serviceName: 'effects',
      randomForkLabels: {
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
      },
    });
    this._initialRandomSnapshot = initialRandomSnapshot
      ? JSON.parse(JSON.stringify(initialRandomSnapshot))
      : null;
    this._initialRandomSeed =
      typeof parentRandom?.seed === 'number' ? parentRandom.seed >>> 0 : null;

    const randomHelpers = createRandomHelpers({
      getRandomFork: (name) => this.getRandomFork(name),
      random: this.random,
      fallbackSeedPrefix: 'effects-system',
    });
    this.randomHelpers = randomHelpers;
    Object.assign(this, randomHelpers);
    this.draw2d = new Draw2D();
    this.particleEffects = new Particles({
      randomRange: randomHelpers.randomRange,
      randomCentered: randomHelpers.randomCentered,
      createMuzzleFlash: (x, y, dirX, dirY) =>
        this.playerEffects.createMuzzleFlash(x, y, dirX, dirY),
      hitMarkersEnabled: () => this.hitMarkersEnabled,
      damageNumbersEnabled: () => this.damageNumbersEnabled,
    });

    this.screenFeedback = new ScreenFeedback({
      random: () => this.getRandomFork('screenShake'),
      screenShakeScale: () => this.screenShakeScale,
      motionReduced: () => this.motionReduced,
      flashingReduced: () => this.flashingReduced,
      damageFlashEnabled: () => this.damageFlashEnabled,
    });
    this.gameTime = new GameTime({
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      motionReduced: () => this.motionReduced,
    });
    this.bossTransitions = new BossTransitions({
      particleEffects: this.particleEffects,
      randomFloat: randomHelpers.randomFloat,
      randomRange: randomHelpers.randomRange,
      randomCentered: randomHelpers.randomCentered,
      getScaledParticleCount: (count, options) =>
        this.getScaledParticleCount(count, options),
      addScreenShake: (presetOrIntensity, durationOrOptions) =>
        this.screenFeedback.addScreenShake(
          presetOrIntensity,
          durationOrOptions
        ),
      addScreenFlash: (color, duration, intensity) =>
        this.screenFeedback.addScreenFlash(color, duration, intensity),
      addFreezeFrame: (duration, fade) =>
        this.gameTime.addFreezeFrame(duration, fade),
      applyTimeDilation: (scale, options) =>
        this.gameTime.applyTimeDilation(scale, options),
    });
    const burstDependencies = {
      particleEffects: this.particleEffects,
      createParticle: (...args) => this.createParticle(...args),
      randomFloat: randomHelpers.randomFloat,
      getScaledParticleCount: (count, options) =>
        this.getScaledParticleCount(count, options),
      particleDensity: () => this.particleDensity,
      addScreenShake: (presetOrIntensity, durationOrOptions) =>
        this.screenFeedback.addScreenShake(
          presetOrIntensity,
          durationOrOptions
        ),
      addScreenFlash: (color, duration, intensity) =>
        this.screenFeedback.addScreenFlash(color, duration, intensity),
    };
    this.playerEffects = new PlayerEffects({
      ...burstDependencies,
      addFreezeFrame: (duration, fade) =>
        this.gameTime.addFreezeFrame(duration, fade),
      playSlowMotion: (preset) => this.gameTime.playSlowMotion(preset),
      emit: (name, payload) => this.eventBus?.emit?.(name, payload),
      // Player is built after effects' own dependencies; resolve on use.
      player: () =>
        requireService('player', this.dependencies, 'EffectsSystem'),
    });
    this.enemyEffects = new EnemyEffects({
      ...burstDependencies,
      randomRange: randomHelpers.randomRange,
      getRandomFork: (name) => this.getRandomFork(name),
      getScaledProbability: (probability) =>
        this.getScaledProbability(probability),
      motionReduced: () => this.motionReduced,
      addHitStop: (kind) => this.gameTime.addHitStop(kind),
    });
    this.lastAdjustedDelta = 0;

    this.settings = requireService(
      'settings',
      this.dependencies,
      'EffectsSystem'
    );
    this.hitMarkersEnabled = true;
    this.damageNumbersEnabled = true;
    this.motionReduced = false;
    this.flashingReduced = false;
    this.screenShakeScale = 1;
    this.damageFlashEnabled = true;
    this.particleDensity = 1;

    this.setupSettingsIntegration();
  }

  // === PARTICLES (effects/Particles.js) ===
  // PlayerEffects and EnemyEffects draw pooled particles through this; the
  // thruster determinism suite stubs it on the effects object.
  createParticle(...args) {
    return this.particleEffects.createParticle(...args);
  }

  setupSettingsIntegration() {
    const accessibility = this.settings.getCategoryValues('accessibility');
    if (accessibility) {
      this.applyAccessibilityPreferences(accessibility);
    }

    const video = this.settings.getCategoryValues('video');
    if (video) {
      this.applyVideoPreferences(video);
    }

    this.registerEventListener(
      'settings-accessibility-changed',
      (payload = {}) => {
        if (payload?.values) {
          this.applyAccessibilityPreferences(payload.values);
        }
      }
    );

    this.registerEventListener('settings-video-changed', (payload = {}) => {
      if (payload?.values) {
        this.applyVideoPreferences(payload.values);
      }
    });

    this.registerEventListener('settings-gameplay-changed', (payload = {}) => {
      if (payload?.values) {
        this.applyGameplayPreferences(payload.values);
      }
    });

    // Also apply initial gameplay preferences
    const gameplay = this.settings.getCategoryValues('gameplay');
    if (gameplay) {
      this.applyGameplayPreferences(gameplay);
    }
  }

  applyAccessibilityPreferences(values = {}) {
    this.motionReduced = Boolean(values.reducedMotion);
    this.flashingReduced = Boolean(values.reduceFlashing);
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

  applyGameplayPreferences(values = {}) {
    this.hitMarkersEnabled = values.hitMarkers !== false;
    this.damageNumbersEnabled = values.damageNumbers !== false;

    if (Number.isFinite(values.screenShake)) {
      this.screenShakeScale = Math.max(
        0,
        Math.min(2, Number(values.screenShake))
      );
      if (this.screenShakeScale <= 0) {
        this.screenShake.reset();
      }
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

      this.registerEventListener(eventName, wrapped);
      this.registerEventListener(`effects-${eventName}`, wrapped);
    };

    registerBossEvent('boss-telegraph', (payload = {}) => {
      this.draw2d.addTelegraph(payload.enemy || payload.boss || null);
    });

    registerBossEvent('boss-spawned', (payload = {}) =>
      this.bossTransitions.onSpawned(payload)
    );

    registerBossEvent('boss-phase-changed', (payload = {}) =>
      this.bossTransitions.onPhaseChanged(payload)
    );

    registerBossEvent('boss-defeated', (payload = {}) =>
      this.bossTransitions.onDefeated(payload)
    );

    this.registerEventListener('bullet-created', (data) =>
      this.playerEffects.onBulletCreated(data)
    );

    this.registerEventListener('enemy-fired', (payload = {}) =>
      this.enemyEffects.onEnemyFired(payload)
    );

    this.registerEventListener('thruster-effect', (data) =>
      this.playerEffects.onThruster(data)
    );

    this.registerEventListener('bullet-hit', (data) =>
      this.playerEffects.onBulletHit(data)
    );

    this.registerEventListener('enemy-destroyed', (data = {}) => {
      if (data?.enemy) {
        this.enemyEffects.createAsteroidExplosion(data.enemy, data);
      }
    });

    this.registerEventListener('enemy-spawned', (payload = {}) =>
      this.enemyEffects.onEnemySpawned(payload)
    );

    this.registerEventListener('mine-exploded', (payload = {}) =>
      this.enemyEffects.createMineExplosion(payload)
    );

    this.registerEventListener('asteroid-crack-stage-changed', (data) => {
      if (data?.position) this.enemyEffects.createCrackDebris(data);
    });

    this.registerEventListener('asteroid-volatile-armed', (data) =>
      this.enemyEffects.onVolatileArmed(data)
    );

    this.registerEventListener('asteroid-volatile-exploded', (data) =>
      this.enemyEffects.createVolatileExplosionEffect(data)
    );

    this.registerEventListener('caster-shell-landed', (data) =>
      this.enemyEffects.createShellImpactEffect(data)
    );

    this.registerEventListener('asteroid-volatile-trail', (data) =>
      this.enemyEffects.spawnVolatileTrail(data)
    );

    this.registerEventListener('player-leveled-up', () =>
      this.playerEffects.onLevelUp()
    );

    this.registerEventListener('xp-collected', (data) => {
      if (data?.position) {
        this.playerEffects.createXPCollectEffect(
          data.position.x,
          data.position.y
        );
      }
    });

    this.registerEventListener('xp-orb-fused', (data) => {
      if (data?.position) this.playerEffects.createOrbFusionEffect(data);
    });

    this.registerEventListener('player-took-damage', (data) => {
      this.screenFeedback.addScreenShake(
        PLAYER_HIT_SHAKE.intensity,
        PLAYER_HIT_SHAKE.duration
      );

      // Red damage flash
      this.screenFeedback.addScreenFlash(
        withAlpha(PALETTE.threat, 0.4),
        0.25,
        0.3
      );

      // Brief freeze frame for impact
      this.gameTime.addFreezeFrame(0.12, 0.15);

      // Directional damage indicator
      if (data?.damageSource && data?.playerPosition) {
        this.draw2d.createDirectionalDamageIndicator(
          data.damageSource,
          data.playerPosition
        );
      }
    });

    this.registerEventListener('enemy-took-damage', (data) => {
      if (data?.enemy && Number.isFinite(data.damage)) {
        this.particleEffects.createFloatingDamageText(
          data.enemy.x,
          data.enemy.y,
          data.damage,
          data.isCritical || false
        );
      }
    });

    this.registerEventListener('shield-deflective-explosion', (data) =>
      this.playerEffects.createShieldDeflectiveExplosion(data)
    );

    // Emergency brake: a small cyan ring the size of its shove.
    this.registerEventListener('player-braked', (data) => {
      this.particleEffects.createShockwaveEffect({
        position: data?.position,
        radius: data?.radius,
        duration: 0.3,
        baseWidth: 6,
        color: withAlpha(PALETTE.player, 0.6),
      });
    });

    this.registerEventListener('player-dashed', (data) => {
      if (data?.position && data?.direction) {
        this.playerEffects.createDashBurst(data.position, data.direction);
      }
    });

    this.registerEventListener('shield-deflected', (data) =>
      this.playerEffects.createShieldHitEffect(data)
    );

    this.registerEventListener('player-died', (data) =>
      this.playerEffects.onDeath(data)
    );
  }

  update(deltaTime) {
    const baseDelta = Number.isFinite(deltaTime) ? Math.max(0, deltaTime) : 0;
    const effectDelta = this.gameTime.update(baseDelta);
    this.screenFeedback.update(effectDelta);

    this.particleEffects.updateParticles(effectDelta);
    this.particleEffects.updateShockwaves(effectDelta);
    this.draw2d.pruneTelegraphs();
    this.particleEffects.updateHitMarkers(effectDelta);
    this.particleEffects.updateDamageTexts(effectDelta);
    this.draw2d.updateDamageIndicators(effectDelta);
    this.bossTransitions.updateBossTransitions(effectDelta);
    this.particleEffects.updateAmbient(effectDelta);

    this.lastAdjustedDelta = effectDelta;
    return effectDelta;
  }

  // === 2D DRAWING (effects/draw2d.js, frozen) ===
  // RenderingSystem shakes the canvas and draws the effects through these.
  applyScreenShake(ctx) {
    this.draw2d.applyScreenShake(ctx, this.screenShake);
  }

  // Queued muzzle flashes become particles first; Renderer3D flushes the
  // queue itself.
  draw(ctx) {
    this.particleEffects.flushMuzzleFlashQueue();
    this.draw2d.draw(ctx, {
      particles: this.particles,
      shockwaves: this.shockwaves,
      hitMarkers: this.hitMarkers,
      damageTexts: this.damageTexts,
      screenFlash: this.screenFlash,
      bossTransitionEffects: this.bossTransitionEffects,
    });
  }

  // Drawn under the entities; `view` is the camera's visible logical rect.
  // Renderer3D passes no ctx: it only sets the view.
  drawAmbient(ctx, view) {
    this.particleEffects.ambientView = view;
    if (ctx) this.draw2d.drawAmbient(ctx, this.ambientChips, this.ambientMotes);
  }

  // Renderer3D and app.js read these lists on the effects object; the
  // thruster suite swaps the particles, the 2D determinism suite the borders.
  get particles() {
    return this.particleEffects.particles;
  }

  set particles(value) {
    this.particleEffects.particles = value;
  }

  get shockwaves() {
    return this.particleEffects.shockwaves;
  }

  get hitMarkers() {
    return this.particleEffects.hitMarkers;
  }

  get damageTexts() {
    return this.particleEffects.damageTexts;
  }

  get ambientChips() {
    return this.particleEffects.ambientChips;
  }

  get ambientMotes() {
    return this.particleEffects.ambientMotes;
  }

  get bossTransitionEffects() {
    return this.bossTransitions.bossTransitionEffects;
  }

  set bossTransitionEffects(value) {
    this.bossTransitions.bossTransitionEffects = value;
  }

  // Called on the effects object: Renderer3D flushes the muzzle flashes,
  // PickupSystem rings a shockwave.
  flushMuzzleFlashQueue() {
    this.particleEffects.flushMuzzleFlashQueue();
  }

  createShockwaveEffect(data) {
    this.particleEffects.createShockwaveEffect(data);
  }

  // === SCREEN FEEDBACK AND GAME TIME (effects/) ===
  // Renderer3D reads the shake and the flash on the effects object; the 2D
  // determinism suite sets the flash and the shake suite swaps the seed.
  get screenShake() {
    return this.screenFeedback.screenShake;
  }

  get screenFlash() {
    return this.screenFeedback.screenFlash;
  }

  set screenFlash(value) {
    this.screenFeedback.screenFlash = value;
  }

  get screenShakeSeedState() {
    return this.screenFeedback.screenShakeSeedState;
  }

  set screenShakeSeedState(value) {
    this.screenFeedback.screenShakeSeedState = value;
  }

  // Called on the effects object: PhysicsSystem, PickupSystem, EnemySystem
  // and WaveManager shake and flash the screen; the hit-stop suite stops it.
  addScreenShake(presetOrIntensity, durationOrOptions) {
    this.screenFeedback.addScreenShake(presetOrIntensity, durationOrOptions);
  }

  addScreenFlash(color, duration, intensity) {
    this.screenFeedback.addScreenFlash(color, duration, intensity);
  }

  addHitStop(kind) {
    this.gameTime.addHitStop(kind);
  }

  // === PLAYER AND ENEMY BURSTS (effects/PlayerEffects.js, EnemyEffects.js) ===
  // Called on the effects object: the thruster determinism suite fires the
  // thrusters, GameSessionService blows up the ship.
  spawnThrusterVFX(...args) {
    this.playerEffects.spawnThrusterVFX(...args);
  }

  createEpicShipExplosion(position) {
    this.playerEffects.createEpicShipExplosion(position);
  }

  captureRandomForkSeeds() {
    super.captureRandomForkSeeds();
    // BaseSystem's constructor calls this before screenFeedback exists.
    this.screenFeedback?.captureSeedState();
  }

  onReset() {
    this.screenFeedback.reseedShake();
  }

  reset(options = {}) {
    const normalized =
      options && typeof options === 'object' && options !== null ? options : {};

    if (normalized.refreshForks) {
      if (
        this._initialRandomSnapshot &&
        this.random &&
        typeof this.random.restore === 'function'
      ) {
        this.random.restore(this._initialRandomSnapshot);
      } else if (
        this._initialRandomSeed !== null &&
        this.random &&
        typeof this.random.reset === 'function'
      ) {
        this.random.reset(this._initialRandomSeed);
      }
    }

    super.reset(normalized);
    this.particleEffects.reset();
    this.bossTransitions.reset();
    this.draw2d.reset();
    this.screenFeedback.reset();
    this.gameTime.reset();
  }
}
