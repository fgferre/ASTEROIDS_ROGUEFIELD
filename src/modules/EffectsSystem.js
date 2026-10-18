import { BaseSystem } from '../core/BaseSystem.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../core/GameConstants.js';
import { PALETTE, withAlpha } from '../data/constants/palette.js';
import { SpaceParticle } from './EffectEntities.js';
import { ShakePresets } from '../utils/ScreenShake.js';
import { requireService } from '../core/serviceUtils.js';
import { createRandomHelpers } from '../utils/randomHelpers.js';
import { DASH_SHAKE } from '../data/constants/gameplay.js';
import { ASTEROID_VARIANTS } from '../data/enemies/asteroid-configs.js';
import { BOSS_FX, BossTransitions } from './effects/BossTransitions.js';
import { Draw2D } from './effects/draw2d.js';
import {
  DEATH_SLOW_MO,
  GameTime,
  LEVEL_UP_SLOW_MO,
} from './effects/GameTime.js';
import { Particles } from './effects/Particles.js';
import { PLAYER_HIT_SHAKE, ScreenFeedback } from './effects/ScreenFeedback.js';

const MAIN_THRUSTER_FLASH_THRESHOLD = 0.85;
const MAIN_THRUSTER_FLASH_COLOR = PALETTE.player;
const MAIN_THRUSTER_FLASH_DURATION = 0.05;
const MAIN_THRUSTER_FLASH_INTENSITY = 0.05;

// Light lingers (docs/NORTE.md §2): PROPOSAL from 17/10, judged by playing.
// Multipliers on the old lifetimes: XP collect sparks were 0.3–0.5 s, asteroid
// explosion embers 0.32–0.54 s (secondary 0.28–0.46 s). Thruster embers keep
// their lifetimes. Stone chips are mass, not light, and are unchanged.
const XP_SPARK_LIFE_SCALE = 1.5; // was 1
const EXPLOSION_EMBER_LIFE_SCALE = 1.3; // was 1

// A Caster shell landing: lighter than the Volatile rock's blast it used to
// borrow (shake 7 + radius × 0.025 for 0.32 s, a full-screen flash, ~110
// particles), since 2-4 Casters land one every 3.2 s each. No flash, the same
// shockwave, about half the particles, all amber like the shot.
const SHELL_IMPACT = Object.freeze({
  shake: 4, // proposta 18/10
  shakeSeconds: 0.25, // proposta 18/10
  shockwaveScale: 1.05, // proposta 18/10: × the blast radius
  sparks: 36, // proposta 18/10
  sparkSpeedMin: 70, // proposta 18/10: px/s
  sparkSpeedMax: 210, // proposta 18/10
  sparkAlphaMin: 0.7, // proposta 18/10
  sparkAlphaMax: 0.9, // proposta 18/10
  sparkSizeMin: 2, // proposta 18/10
  sparkSizeMax: 3.6, // proposta 18/10
  sparkLifeMin: 0.3, // proposta 18/10: s
  sparkLifeMax: 0.5, // proposta 18/10
  embers: 18, // proposta 18/10: slower, they linger
  emberSpeedMax: 45, // proposta 18/10: px/s
  emberAlpha: 0.5, // proposta 18/10
  emberSizeMin: 1.2, // proposta 18/10
  emberSizeMax: 2.2, // proposta 18/10
  emberLifeMin: 0.6, // proposta 18/10: s
  emberLifeMax: 1, // proposta 18/10
  emberReach: 0.45, // proposta 18/10: × the blast radius
  glowScale: 0.2, // proposta 18/10: × the blast radius
  glowAlpha: 0.45, // proposta 18/10
  glowLife: 0.35, // proposta 18/10: s
});

// One light per source (docs/NORTE.md §2). Machine enemies glow threat-red and
// shed matte hull chips; the boss glows violet (BOSS_FX, in BossTransitions).
// Data-file colors are ignored here on purpose: they predate the palette.
const ENEMY_FX = Object.freeze({
  spark: PALETTE.threat,
  sparkDim: withAlpha(PALETTE.threat, 0.7),
  glow: withAlpha(PALETTE.threat, 0.45),
  chip: PALETTE.hullLit,
  smoke: withAlpha(PALETTE.rock, 0.45),
});

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
    this.processedMineExplosions = new WeakSet();
    this.draw2d = new Draw2D();
    this.particleEffects = new Particles({
      randomRange: randomHelpers.randomRange,
      randomCentered: randomHelpers.randomCentered,
      createMuzzleFlash: (x, y, dirX, dirY) =>
        this.createMuzzleFlash(x, y, dirX, dirY),
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
  // The per-event builders below draw pooled particles through this; the
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

    // Weapon fire feedback (Week 1: Balance & Feel)
    this.registerEventListener('bullet-created', (data) => {
      if (data?.from && data?.bullet) {
        // Calculate firing direction from bullet velocity
        const vx = data.bullet.vx || 0;
        const vy = data.bullet.vy || 0;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0) {
          this.particleEffects.queueMuzzleFlash(
            data.from.x,
            data.from.y,
            vx / speed,
            vy / speed
          );
        }
      }
    });

    this.registerEventListener('enemy-fired', (payload = {}) => {
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

    this.registerEventListener('thruster-effect', (data) => {
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
        this.screenFeedback.addScreenFlash(
          MAIN_THRUSTER_FLASH_COLOR,
          MAIN_THRUSTER_FLASH_DURATION,
          MAIN_THRUSTER_FLASH_INTENSITY
        );
      }
    });

    this.registerEventListener('bullet-hit', (data) => {
      if (data?.position) {
        const effectiveDamage = Number.isFinite(data?.effectiveDamage)
          ? data.effectiveDamage
          : Number.isFinite(data?.damage)
            ? data.damage
            : 0;
        const blocked = Boolean(data?.blocked);
        if (!blocked && (effectiveDamage > 0 || data.killed)) {
          this.particleEffects.createHitMarker(
            data.position,
            data.killed || false,
            effectiveDamage
          );
        }
        this.createBulletImpact(
          data.position,
          { x: data.enemy?.vx || 0, y: data.enemy?.vy || 0 },
          data.killed || false,
          { blocked }
        );
      }
    });

    this.registerEventListener('enemy-destroyed', (data = {}) => {
      if (data?.enemy) {
        this.createAsteroidExplosion(data.enemy, data);
      }
    });

    this.registerEventListener('enemy-spawned', (payload = {}) => {
      const enemy = payload?.enemy;
      if (!enemy || !(this.processedMineExplosions instanceof WeakSet)) {
        return;
      }

      const isMine = enemy.type === 'mine' || payload.type === 'mine';
      if (!isMine) {
        return;
      }

      this.processedMineExplosions.delete(enemy);
    });

    this.registerEventListener('mine-exploded', (payload = {}) => {
      this.createMineExplosion(payload);
    });

    this.registerEventListener('asteroid-crack-stage-changed', (data) => {
      if (data?.position) {
        this.createCrackDebris(data);
      }
    });

    this.registerEventListener('asteroid-volatile-armed', (data) => {
      if (data?.position) {
        this.screenFeedback.addScreenFlash(
          withAlpha(PALETTE.shot, 0.18),
          0.12,
          0.08
        );
        this.spawnVolatileWarning(data.position);
      }
    });

    this.registerEventListener('asteroid-volatile-exploded', (data) => {
      this.createVolatileExplosionEffect(data);
    });

    this.registerEventListener('caster-shell-landed', (data) => {
      this.createShellImpactEffect(data);
    });

    this.registerEventListener('asteroid-volatile-trail', (data) => {
      this.spawnVolatileTrail(data);
    });

    this.registerEventListener('player-leveled-up', () => {
      this.screenFeedback.addScreenShake(6, 0.4);
      this.gameTime.playSlowMotion(LEVEL_UP_SLOW_MO);
      this.screenFeedback.addScreenFlash(PALETTE.xp, 0.15, 0.2);

      // Player is built after effects' own dependencies; resolve on use.
      const player = requireService(
        'player',
        this.dependencies,
        'EffectsSystem'
      );
      this.createLevelUpExplosion(player.position);
    });

    this.registerEventListener('xp-collected', (data) => {
      if (data?.position) {
        this.createXPCollectEffect(data.position.x, data.position.y);
      }
    });

    this.registerEventListener('xp-orb-fused', (data) => {
      if (data?.position) {
        this.createOrbFusionEffect(data);
      }
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

    // Level 5 shield: deflective explosion when shield breaks
    this.registerEventListener('shield-deflective-explosion', (data) => {
      if (!data?.position) return;

      this.particleEffects.createShockwaveEffect({
        position: data.position,
        radius: 200, // AoE damage radius
        color: withAlpha(PALETTE.player, 0.6),
      });

      // Screen effects
      this.screenFeedback.addScreenShake(12, 0.4);
      this.screenFeedback.addScreenFlash(
        withAlpha(PALETTE.player, 0.4),
        0.3,
        0.2
      );

      // Emit damage event for enemies in radius
      this.eventBus?.emit?.('shield-explosion-damage', {
        position: data.position,
        radius: 200,
        damage: 50, // AoE damage amount
      });
    });

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
        this.createDashBurst(data.position, data.direction);
      }
    });

    this.registerEventListener('shield-deflected', (data) => {
      this.createShieldHitEffect(data);
    });

    this.registerEventListener('player-died', (data) => {
      this.gameTime.playSlowMotion(DEATH_SLOW_MO);
      if (data?.position) {
        this.createEpicShipExplosion(data.position);
      }
    });
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

  // Dash kick (PLAN.md step 6, proposal 17/10): a short shake and a hard
  // thruster burst out of the tail; the afterimages are the hull's own
  // (PlayerSystem.renderDashGhosts).
  createDashBurst(position, direction) {
    this.screenFeedback.addScreenShake(
      DASH_SHAKE.intensity,
      DASH_SHAKE.duration
    );
    const tailX = position.x - direction.x * 12;
    const tailY = position.y - direction.y * 12;
    for (let i = 0; i < 4; i += 1) {
      this.spawnThrusterVFX(
        tailX,
        tailY,
        direction.x,
        direction.y,
        3,
        'main',
        3
      );
    }
  }

  spawnThrusterVFX(
    worldX,
    worldY,
    dirX,
    dirY,
    intensity = 1,
    type = 'main',
    visualLevel = 0
  ) {
    if (this.particleDensity < 0.1) return; // Optimization

    const thrusterFork = 'thrusters';

    // === UPGRADE SCALING: SPRAY -> AFTERBURNER ===
    // We want a massive feeling of power at high levels.

    let countMultiplier = 1;
    let speedMultiplier = 1;
    let spreadFactor = 1;
    let lifeMultiplier = 1;
    let colorPalette = 'orange'; // orange, blue, neon

    // Scale based on Visual Level (0 to 5+)
    if (type === 'main') {
      if (visualLevel >= 5) {
        // ULTRA AFTERBURNER
        countMultiplier = 4.0; // Huge density
        speedMultiplier = 2.5; // Very fast jets
        spreadFactor = 0.3; // Tight focused beam
        lifeMultiplier = 0.6; // Short intense life
        colorPalette = 'neon';
      } else if (visualLevel >= 3) {
        // PLASMA JET
        countMultiplier = 2.5;
        speedMultiplier = 1.8;
        spreadFactor = 0.6;
        colorPalette = 'blue';
      } else {
        // STANDARD SPRAY
        countMultiplier = 1.0;
        speedMultiplier = 1.0;
        spreadFactor = 1.2; // Loose spray
        colorPalette = 'orange';
      }
    } else {
      // Side/Aux thrusters - also need juice!
      if (visualLevel >= 5) {
        // PRECISION JETS (Rank 5+)
        countMultiplier = 3.0;
        speedMultiplier = 2.0;
        spreadFactor = 0.4; // Very tight
        colorPalette = 'neon';
      } else if (visualLevel >= 3) {
        // ION BURSTS (Rank 3-4)
        countMultiplier = 1.8;
        speedMultiplier = 1.4;
        spreadFactor = 0.8;
        colorPalette = 'blue';
      } else {
        // GAS PUFFS (Rank 0-2)
        countMultiplier = 1.0;
        speedMultiplier = 1.0;
        spreadFactor = 1.5; // Wide gas cloud
        colorPalette = 'orange'; // Or white/grey for gas? Keep orange for consistency
      }
    }

    // Base Configuration
    let baseCount = (type === 'main' ? 1 : 0.6) * countMultiplier * intensity;
    // Fractional parts accumulation (deterministic probabalistic check)
    if (this.randomFloat(thrusterFork) > baseCount % 1)
      baseCount = Math.floor(baseCount);
    else baseCount = Math.ceil(baseCount);
    if (intensity > 0) baseCount = Math.max(1, baseCount);

    const baseSpeed = (type === 'main' ? 140 : 100) * speedMultiplier;

    for (let c = 0; c < baseCount; c++) {
      const spread = (this.randomFloat(thrusterFork) - 0.5) * spreadFactor;

      // Calculate velocity vector with spread
      // Main thrusters point opposite to direction
      const angleBase = Math.atan2(-dirY, -dirX);
      const angle = angleBase + spread * 0.5; // +/- 0.25 radians approx

      const speed = baseSpeed * (0.8 + this.randomFloat(thrusterFork) * 0.5);

      const vx = Math.cos(angle) * speed;
      const vy = Math.sin(angle) * speed;

      // One light, the player's (docs/NORTE.md §2): white-hot core, cyan
      // body, dimmer cyan tail. Upgrade tiers change count, speed and
      // spread above, not the hue.
      let color;
      const t = this.randomFloat(thrusterFork);
      const hot = colorPalette === 'neon' ? 0.6 : 0.8;
      if (t > hot) color = PALETTE.text;
      else if (t > 0.35) color = PALETTE.player;
      else color = withAlpha(PALETTE.player, 0.55);

      this.particles.push(
        this.createParticle(
          worldX + (this.randomFloat(thrusterFork) - 0.5) * 4,
          worldY + (this.randomFloat(thrusterFork) - 0.5) * 4,
          vx + (this.randomFloat(thrusterFork) - 0.5) * 10,
          vy + (this.randomFloat(thrusterFork) - 0.5) * 10,
          color,
          (1.5 + this.randomFloat(thrusterFork) * 2) *
            (type === 'main' ? 1.5 : 1), // Size
          (0.2 + this.randomFloat(thrusterFork) * 0.3) * lifeMultiplier, // Life
          'thruster'
        )
      );
    }
  }

  // A crisp amber flare at the nose plus a few embers. It must read as the
  // gun firing, not as a projectile: small, short, no stretch along the shot.
  // The random rolls stay in the old order so the muzzleFlash fork is stable.
  createMuzzleFlash(x, y, dirX, dirY) {
    const flareJitter = this.randomFloat('muzzleFlash');
    this.particles.push(
      this.createParticle(
        x + dirX * 18,
        y + dirY * 18,
        dirX * 30,
        dirY * 30,
        PALETTE.shot,
        3 + flareJitter * 0.4, // radius: a 6 px flare, 2 px hot core
        0.06,
        'flare'
      )
    );

    const sparkCount = this.getScaledParticleCount(
      5 + this.randomFloat('muzzleFlash') * 3
    );
    const baseAngle = Math.atan2(dirY, dirX);

    for (let i = 0; i < sparkCount; i++) {
      const angle = baseAngle + (this.randomFloat('muzzleFlash') - 0.5) * 1.2;
      const speed = 60 + this.randomFloat('muzzleFlash') * 90;
      const hot = this.randomFloat('muzzleFlash') > 0.7;
      const size = 0.5 + this.randomFloat('muzzleFlash') * 0.5;
      const life = 0.08 + this.randomFloat('muzzleFlash') * 0.1;
      if (i >= 4) continue;

      this.particles.push(
        this.createParticle(
          x + dirX * 19,
          y + dirY * 19,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          hot ? PALETTE.text : PALETTE.shot,
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
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 12;
    const muzzleDistance = radius + 8;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const baseColor = ENEMY_FX.spark;
    const accentColor = ENEMY_FX.sparkDim;
    const exhaustColor = ENEMY_FX.glow;
    const flashColor = withAlpha(PALETTE.threat, 0.35);

    const particleCount = this.getScaledParticleCount(
      4 + this.randomFloat('muzzleFlash') * 3,
      {
        minimum: 2,
      }
    );

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
          -direction.x *
            backSpeed *
            (0.7 + this.randomFloat('muzzleFlash') * 0.5),
          -direction.y *
            backSpeed *
            (0.7 + this.randomFloat('muzzleFlash') * 0.5),
          exhaustColor,
          2.6 + this.randomFloat('muzzleFlash') * 2.4,
          0.16 + this.randomFloat('muzzleFlash') * 0.12,
          'normal'
        )
      );
    }

    this.screenFeedback.addScreenFlash(flashColor, 0.08, 0.06);
    this.screenFeedback.addScreenShake(2.2, 0.1);
  }

  createHunterBurstEffect(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    if (!origin) {
      return;
    }

    const enemy = payload?.enemy || null;
    const direction = this.resolveEnemyProjectileDirection(payload);
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 16;
    const muzzleDistance = radius + 10;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const baseColor = ENEMY_FX.spark;
    const accentColor = ENEMY_FX.sparkDim;
    const trailColor = ENEMY_FX.glow;
    const flashColor = withAlpha(PALETTE.threat, 0.38);

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
          -direction.x *
            backSpeed *
            (0.6 + this.randomFloat('muzzleFlash') * 0.4),
          -direction.y *
            backSpeed *
            (0.6 + this.randomFloat('muzzleFlash') * 0.4),
          trailColor,
          2.8 + this.randomFloat('muzzleFlash') * 2.6,
          0.18 + this.randomFloat('muzzleFlash') * 0.1,
          'normal'
        )
      );
    }

    const flashDuration = finalShot ? 0.12 : 0.09;
    const flashIntensity = finalShot ? 0.12 : 0.08;
    this.screenFeedback.addScreenFlash(
      flashColor,
      flashDuration,
      flashIntensity
    );
    this.screenFeedback.addScreenShake(
      finalShot ? 3.8 : 2.6,
      finalShot ? 0.2 : 0.14
    );
  }

  createBossAttackEffect(payload = {}) {
    const origin = this.resolveEnemyProjectileOrigin(payload);
    const enemy = payload?.enemy || payload?.boss || null;
    if (!origin || !enemy) {
      return;
    }

    const direction = this.resolveEnemyProjectileDirection(payload);
    const radius = Number.isFinite(enemy?.radius) ? enemy.radius : 60;
    const muzzleDistance = radius + 18;
    const spawnX = origin.x + direction.x * muzzleDistance;
    const spawnY = origin.y + direction.y * muzzleDistance;

    const coreColor = BOSS_FX.core;
    const accentColor = BOSS_FX.accent;

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

    this.screenFeedback.addScreenFlash(BOSS_FX.flash, 0.14, 0.12);
    this.screenFeedback.addScreenShake('bossAttack');
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

    const positionCandidate =
      payload.position || (enemy ? { x: enemy.x, y: enemy.y } : null);
    if (!positionCandidate) {
      return;
    }

    const posX = Number.isFinite(positionCandidate.x)
      ? positionCandidate.x
      : null;
    const posY = Number.isFinite(positionCandidate.y)
      ? positionCandidate.y
      : null;
    if (!Number.isFinite(posX) || !Number.isFinite(posY)) {
      return;
    }

    const position = { x: posX, y: posY };
    const radius = Number.isFinite(payload.radius)
      ? payload.radius
      : Number.isFinite(enemy?.explosionRadius)
        ? enemy.explosionRadius
        : 120;
    const velocity = payload.velocity || {
      x: Number.isFinite(enemy?.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy?.vy) ? enemy.vy : 0,
    };

    const radiusFactor = Math.max(1, radius / 110);
    const flashColor = withAlpha(PALETTE.threat, 0.4);
    const shockwaveColor = withAlpha(PALETTE.threat, 0.35);
    const debrisColor = ENEMY_FX.chip;
    const sparkColor = ENEMY_FX.spark;
    const smokeColor = ENEMY_FX.smoke;

    const shakePreset = ShakePresets.mineExplosion;
    const baseShakeIntensity = 6 + 110 * 0.025;
    const shakeIntensity = 6 + radius * 0.025;
    const traumaMultiplier = Math.max(
      0.6,
      Math.min(1.6, shakeIntensity / baseShakeIntensity)
    );
    const baseDuration = Number.isFinite(shakePreset?.duration)
      ? shakePreset.duration
      : 0.36;
    const targetDuration = 0.28 + radiusFactor * 0.08;
    const durationOffset = targetDuration - baseDuration;

    this.screenFeedback.addScreenShake('mineExplosion', {
      traumaMultiplier,
      durationOffset,
      maxTrauma: 1,
      minDuration: 0.2,
      maxDuration: 1.2,
    });
    this.screenFeedback.addScreenFlash(
      flashColor,
      0.22,
      0.2 + radiusFactor * 0.05
    );
    this.gameTime.addHitStop('mine');

    this.particleEffects.createShockwaveEffect({
      position,
      radius: radius * 1.1,
      duration: 0.55,
      baseWidth: 20,
      maxAlpha: 0.72,
      color: shockwaveColor,
    });

    const sparkCount = this.getScaledParticleCount(24 + Math.round(radius / 4));
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed =
        (140 + this.randomFloat('explosions') * 180) *
        (0.9 + radiusFactor * 0.25);
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

    const debrisCount = this.getScaledParticleCount(
      14 + Math.round(radius / 6)
    );
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

    const smokeCount = this.getScaledParticleCount(
      10 + Math.round(radius / 10),
      {
        allowZero: true,
      }
    );
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
          'smoke'
        )
      );
    }
  }

  createDroneDestructionEffect(enemy, context = {}) {
    if (!enemy) {
      return;
    }

    const position = {
      x: Number.isFinite(enemy.x)
        ? enemy.x
        : Number.isFinite(context?.position?.x)
          ? context.position.x
          : null,
      y: Number.isFinite(enemy.y)
        ? enemy.y
        : Number.isFinite(context?.position?.y)
          ? context.position.y
          : null,
    };

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return;
    }

    const radius = Number.isFinite(enemy.radius) ? enemy.radius : 12;
    const velocity = {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    this.screenFeedback.addScreenShake('droneDestroyed');
    this.gameTime.addHitStop('drone');
    this.screenFeedback.addScreenFlash(
      withAlpha(PALETTE.threat, 0.35),
      0.12,
      0.1
    );

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
          ENEMY_FX.spark,
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
          ENEMY_FX.glow,
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
          ENEMY_FX.chip,
          4.5 + this.randomFloat('explosions') * 3.2,
          0.55 + this.randomFloat('explosions') * 0.22,
          'debris'
        )
      );
    }
  }

  createHunterDestructionEffect(enemy, context = {}) {
    if (!enemy) {
      return;
    }

    const position = {
      x: Number.isFinite(enemy.x)
        ? enemy.x
        : Number.isFinite(context?.position?.x)
          ? context.position.x
          : null,
      y: Number.isFinite(enemy.y)
        ? enemy.y
        : Number.isFinite(context?.position?.y)
          ? context.position.y
          : null,
    };

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      return;
    }

    const radius = Number.isFinite(enemy.radius) ? enemy.radius : 16;
    const velocity = {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    this.screenFeedback.addScreenShake('hunterDestroyed');
    this.gameTime.addHitStop('hunter');
    this.screenFeedback.addScreenFlash(
      withAlpha(PALETTE.threat, 0.38),
      0.14,
      0.14
    );
    this.particleEffects.createShockwaveEffect({
      position,
      radius: radius * 2.4,
      duration: 0.42,
      baseWidth: 16,
      maxAlpha: 0.55,
      color: withAlpha(PALETTE.threat, 0.5),
    });

    const sparkCount = this.getScaledParticleCount(
      18 + Math.round(radius * 1.5)
    );
    for (let i = 0; i < sparkCount; i += 1) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      const speed = 150 + this.randomFloat('explosions') * 170;
      const color = i % 3 === 0 ? ENEMY_FX.sparkDim : ENEMY_FX.spark;
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
          ENEMY_FX.glow,
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
          ENEMY_FX.chip,
          5.4 + this.randomFloat('explosions') * 3.6,
          0.6 + this.randomFloat('explosions') * 0.22,
          'debris'
        )
      );
    }
  }

  createBulletImpact(position, enemyVelocity, killed, options = {}) {
    const blocked = Boolean(options?.blocked);
    // More particles if killed, fewer for just a hit
    const particleCount = this.getScaledParticleCount(
      blocked ? 8 : killed ? 12 : 6
    );

    for (let i = 0; i < particleCount; i++) {
      const angle = this.randomFloat('hits') * Math.PI * 2;
      const speed = blocked
        ? 60 + this.randomFloat('hits') * 90
        : 80 + this.randomFloat('hits') * 100;

      // The shot's amber light on a hit; a blocked hit only knocks off matte
      // chips so it doesn't read as successful damage.
      const roll = this.randomFloat('hits');
      const color = blocked
        ? PALETTE.neutral
        : roll > (killed ? 0.3 : 0.5)
          ? PALETTE.shot
          : PALETTE.text;

      // Inherit some momentum from the enemy
      const vx = Math.cos(angle) * speed + enemyVelocity.x * 0.3;
      const vy = Math.sin(angle) * speed + enemyVelocity.y * 0.3;

      // BIGGER sparks (more visible)
      const size = blocked
        ? 2 + this.randomFloat('hits') * 1.4
        : killed
          ? 3 + this.randomFloat('hits') * 2.5
          : 2.5 + this.randomFloat('hits') * 2;

      // Longer lifetime
      const life = blocked
        ? 0.12 + this.randomFloat('hits') * 0.08
        : 0.18 + this.randomFloat('hits') * 0.12;

      this.particles.push(
        this.createParticle(
          position.x,
          position.y,
          vx,
          vy,
          color,
          size,
          life,
          blocked ? 'debris' : 'spark'
        )
      );
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
          withAlpha(PALETTE.player, 0.6 + this.randomFloat('hits') * 0.3),
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
      withAlpha(PALETTE.player, 0.4),
      5 + level * 1.3,
      0.3 + 0.05 * level
    );
    this.particles.push(glow);

    this.screenFeedback.addScreenShake(
      3 + level * 0.6,
      0.15 + 0.02 * intensity
    );
    this.screenFeedback.addScreenFlash(
      withAlpha(PALETTE.player, 0.22),
      0.12,
      0.18 + 0.04 * level
    );
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
        PALETTE.xp,
        1.5 + this.randomFloat('explosions') * 1.5,
        (0.3 + this.randomFloat('explosions') * 0.2) * XP_SPARK_LIFE_SCALE
      );
      this.particles.push(particle);
    }
  }

  createOrbFusionEffect(data) {
    const tier = data?.tier || 1;
    const consumed = data?.consumed || 0;
    const particleColor = data?.color || PALETTE.xp;
    const glowColor = data?.glow || withAlpha(PALETTE.xp, 0.35);
    const flashColor = data?.flash || withAlpha(PALETTE.xp, 0.2);
    const { x, y } = data.position;

    const particleCount = this.getScaledParticleCount(
      12 + Math.min(24, tier * 4 + Math.floor(consumed / 2))
    );

    for (let i = 0; i < particleCount; i += 1) {
      const angle =
        (Math.PI * 2 * i) / particleCount +
        this.randomFloat('explosions') * 0.3;
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

    this.screenFeedback.addScreenShake(2 + tier * 0.6, 0.12 + tier * 0.03);
    this.screenFeedback.addScreenFlash(flashColor, 0.1, 0.14 + tier * 0.02);
  }

  createEpicShipExplosion(position) {
    // EPIC DEATH EXPLOSION - High velocity fragments + massive shockwave

    // Huge freeze frame for dramatic impact
    this.gameTime.addFreezeFrame(0.35, 0.4);

    // Massive screen shake
    this.screenFeedback.addScreenShake(15, 0.6);

    // Bright white flash
    this.screenFeedback.addScreenFlash(withAlpha(PALETTE.text, 0.8), 0.4, 0.6);

    // HIGH VELOCITY FRAGMENTS (50-80 particles)
    const fragmentCount = this.getScaledParticleCount(
      50 + this.randomFloat('explosions') * 30
    );
    for (let i = 0; i < fragmentCount; i++) {
      const angle = this.randomFloat('explosions') * Math.PI * 2;
      // HIGH VELOCITY: 250-500 px/s
      const speed = 250 + this.randomFloat('explosions') * 250;

      // Half light (the ship's cyan, white-hot), half matte hull chips
      const colorChoice = this.randomFloat('explosions');
      const light = colorChoice < 0.5;
      let color;
      if (colorChoice < 0.25) color = PALETTE.text;
      else if (colorChoice < 0.5) color = PALETTE.player;
      else if (colorChoice < 0.75) color = PALETTE.hullLit;
      else color = PALETTE.hull;

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
          light ? 'spark' : 'debris'
        )
      );
    }

    // MASSIVE DESTRUCTIVE SHOCKWAVE (70% of screen)
    const screenWidth = GAME_WIDTH || 1920;
    const screenHeight = GAME_HEIGHT || 1080;
    const maxDimension = Math.max(screenWidth, screenHeight);
    const shockwaveRadius = maxDimension * 0.7; // 70% of screen

    this.particleEffects.createShockwaveEffect({
      position: position,
      radius: shockwaveRadius,
      duration: 0.8, // Longer duration
      color: withAlpha(PALETTE.player, 0.6),
      baseWidth: 8, // Thick wave
      maxAlpha: 0.8, // Very visible
    });

    // Secondary inner shockwave (more intense)
    setTimeout(() => {
      this.particleEffects.createShockwaveEffect({
        position: position,
        radius: shockwaveRadius * 0.5,
        duration: 0.5,
        color: withAlpha(PALETTE.text, 0.7),
        baseWidth: 6,
        maxAlpha: 0.9,
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
        this.randomFloat('explosions') > 0.75 ? PALETTE.text : PALETTE.xp,
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
      if (
        !Number.isFinite(minePayload.radius) &&
        Number.isFinite(asteroid.explosionRadius)
      ) {
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
    // Matte rock chips plus embers in the variant's vein color (the crystal
    // inside the Ring stone).
    const debrisColor = variantColors?.fill || PALETTE.rock;
    const sparkColor =
      variantColors?.veins || variantColors?.cracks || PALETTE.shot;
    if (!variantColors?.glow && !variantColors?.pulse) {
      this.randomFloat('explosions'); // the old hue roll; keeps the fork in step
    }

    const baseCount = { large: 12, medium: 8, small: 5 }[asteroid.size] || 6;
    const radius = Number.isFinite(asteroid.radius)
      ? Math.max(asteroid.radius, 12)
      : 20;
    const densityFactor = Math.max(1, radius / 22);
    const particleCount = this.getScaledParticleCount(
      Math.round(baseCount * densityFactor)
    );

    const parentVx = Number.isFinite(asteroid.vx) ? asteroid.vx : 0;
    const parentVy = Number.isFinite(asteroid.vy) ? asteroid.vy : 0;
    const momentumScale = 0.35;
    const speedScale = Math.max(0.85, Math.min(1.8, radius / 24));

    if (asteroid.size === 'small') {
      this.screenFeedback.addScreenShake(2 + radius * 0.01, 0.12);
      this.gameTime.addHitStop('small');
      // Small shockwave
      this.particleEffects.createShockwaveEffect({
        position: { x: asteroid.x, y: asteroid.y },
        radius: 60,
        duration: 0.3,
        color: sparkColor,
        baseWidth: 6,
      });
    } else if (asteroid.size === 'medium') {
      this.screenFeedback.addScreenShake(4 + radius * 0.012, 0.18);
      this.gameTime.addHitStop('medium');
      // Medium shockwave
      this.particleEffects.createShockwaveEffect({
        position: { x: asteroid.x, y: asteroid.y },
        radius: 120,
        duration: 0.4,
        color: sparkColor,
        baseWidth: 10,
      });
    } else if (asteroid.size === 'large') {
      this.screenFeedback.addScreenShake(8 + radius * 0.015, 0.28);
      this.gameTime.addHitStop('large');
      this.screenFeedback.addScreenFlash(
        variantColors?.glow || withAlpha(sparkColor, 0.6),
        0.22,
        0.12
      );
      // Massive shockwave
      this.particleEffects.createShockwaveEffect({
        position: { x: asteroid.x, y: asteroid.y },
        radius: 250,
        duration: 0.6,
        color: sparkColor,
        baseWidth: 20,
      });
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

      // every other one is a lit chip: mostly stone, a few embers
      const ember = i % 2 === 0;
      const spark = this.createParticle(
        asteroid.x,
        asteroid.y,
        Math.cos(angle) * speed * 1.25 + parentVx * momentumScale,
        Math.sin(angle) * speed * 1.25 + parentVy * momentumScale,
        ember ? sparkColor : PALETTE.rockLit,
        1.6 + this.randomFloat('explosions') * 1.6,
        (0.32 + this.randomFloat('explosions') * 0.22) *
          (ember ? EXPLOSION_EMBER_LIFE_SCALE : 1),
        ember ? 'spark' : 'debris'
      );
      this.particles.push(spark);

      if (this.randomFloat('explosions') < 0.35) {
        const secondary = new SpaceParticle(
          asteroid.x,
          asteroid.y,
          Math.cos(angle + Math.PI / 2) * speed * 0.6,
          Math.sin(angle + Math.PI / 2) * speed * 0.6,
          sparkColor,
          1.2 + this.randomFloat('explosions') * 1,
          (0.28 + this.randomFloat('explosions') * 0.18) *
            EXPLOSION_EMBER_LIFE_SCALE,
          'spark',
          this.getRandomFork('explosions')
        );
        this.particles.push(secondary);
      }
    }
  }

  resolveAsteroidColors(variant) {
    const config = ASTEROID_VARIANTS?.[variant] || ASTEROID_VARIANTS?.common;
    const colors = config?.colors || {};
    const vein = colors.veins || colors.cracks || PALETTE.shot;

    return {
      cracks: vein,
      glow: vein,
      debris: colors.fill || PALETTE.rock,
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

    const colors = this.resolveAsteroidColors(variant);
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
      const angle = Math.atan2(
        worldEnd.y - worldStart.y,
        worldEnd.x - worldStart.x
      );
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
          ? selectedSegments[
              Math.floor(
                this.randomFloat('explosions') * selectedSegments.length
              )
            ]
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

    const coreColor = withAlpha(PALETTE.shot, 0.9);
    const emberColor = withAlpha(PALETTE.shot, 0.85);
    const smokeColor = withAlpha(PALETTE.rock, 0.35);

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
        this.randomRange(speedRange[0], speedRange[1], 'volatility') *
        speedScale;
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
          'smoke',
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
          withAlpha(PALETTE.text, 0.7),
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
        withAlpha(PALETTE.shot, 0.45),
        1.8 + this.randomFloat('volatility') * 0.6,
        0.35 + this.randomFloat('volatility') * 0.15,
        'spark'
      );
      this.particles.push(particle);
    }
  }

  createVolatileExplosionEffect(data) {
    if (!data || !data.position) {
      return;
    }

    const radius = data.radius ?? 70;
    const position = data.position;
    const intensity = Math.min(1.2, radius / 90);

    this.screenFeedback.addScreenShake(7 + radius * 0.025, 0.32);
    this.screenFeedback.addScreenFlash(
      withAlpha(PALETTE.shot, 0.55),
      0.26,
      0.24
    );

    this.particleEffects.createExplosionShockwave({
      position,
      radius: radius * 1.05,
    });

    const particleTotal = this.getScaledParticleCount(
      22 + Math.floor(radius / 5)
    );
    for (let i = 0; i < particleTotal; i += 1) {
      const angle = this.randomFloat('volatility') * Math.PI * 2;
      const speed =
        (70 + this.randomFloat('volatility') * 150) * (0.8 + intensity * 0.4);

      // two unused rolls were the old green/blue jitter; kept for the fork
      this.randomFloat('volatility');
      this.randomFloat('volatility');
      const flameAlpha = 0.7 + this.randomFloat('volatility') * 0.2;
      const flame = new SpaceParticle(
        position.x,
        position.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        withAlpha(PALETTE.shot, flameAlpha),
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
        PALETTE.rock,
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
        withAlpha(PALETTE.rock, 0.25 + this.randomFloat('volatility') * 0.18),
        3.5 + this.randomFloat('volatility') * 3.5,
        0.85 + this.randomFloat('volatility') * 0.5,
        'smoke',
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
        withAlpha(PALETTE.shot, 0.5),
        radius * 0.24,
        0.45 + this.randomFloat('volatility') * 0.2,
        'normal',
        this.getRandomFork('volatility')
      )
    );
  }

  // SHELL_IMPACT; rolls from the 'volatility' fork, which the shell's
  // borrowed Volatile blast drew from before.
  createShellImpactEffect({ position, radius }) {
    const fx = SHELL_IMPACT;
    const { x, y } = position;
    const roll = (min, max) =>
      min + this.randomFloat('volatility') * (max - min);

    this.screenFeedback.addScreenShake(fx.shake, fx.shakeSeconds);
    this.particleEffects.createExplosionShockwave({
      position,
      radius: radius * fx.shockwaveScale,
    });

    const sparks = this.getScaledParticleCount(fx.sparks);
    for (let i = 0; i < sparks; i += 1) {
      const angle = roll(0, Math.PI * 2);
      const speed = roll(fx.sparkSpeedMin, fx.sparkSpeedMax);
      this.particles.push(
        new SpaceParticle(
          x,
          y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          withAlpha(PALETTE.shot, roll(fx.sparkAlphaMin, fx.sparkAlphaMax)),
          roll(fx.sparkSizeMin, fx.sparkSizeMax),
          roll(fx.sparkLifeMin, fx.sparkLifeMax),
          'spark',
          this.getRandomFork('volatility')
        )
      );
    }

    const embers = this.getScaledParticleCount(fx.embers);
    for (let i = 0; i < embers; i += 1) {
      const angle = roll(0, Math.PI * 2);
      const distance = roll(0, radius * fx.emberReach);
      const speed = roll(0, fx.emberSpeedMax);
      this.particles.push(
        new SpaceParticle(
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          withAlpha(PALETTE.shot, fx.emberAlpha),
          roll(fx.emberSizeMin, fx.emberSizeMax),
          roll(fx.emberLifeMin, fx.emberLifeMax),
          'normal',
          this.getRandomFork('volatility')
        )
      );
    }

    this.particles.push(
      new SpaceParticle(
        x,
        y,
        0,
        0,
        withAlpha(PALETTE.shot, fx.glowAlpha),
        radius * fx.glowScale,
        fx.glowLife,
        'normal',
        this.getRandomFork('volatility')
      )
    );
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
