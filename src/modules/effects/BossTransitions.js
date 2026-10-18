// src/modules/effects/BossTransitions.js
//
// The boss's arrival, phase change and defeat: the bursts of violet light and
// hull debris, their shockwaves, the shakes, flashes, freezes and slow motion
// that frame them, and the pulsing border drawn over the view. EffectsSystem
// owns it and its boss listeners land here; Renderer3D reads the borders
// through `bossTransitionEffects` on the effects object.

import { PALETTE, withAlpha } from '../../data/constants/palette.js';
import { ShakePresets } from '../../utils/ScreenShake.js';
import { GameDebugLogger } from '../../utils/dev/GameDebugLogger.js';
import {
  BOSS_EFFECTS_PRESETS,
  BOSS_SCREEN_SHAKES,
} from '../../data/constants/visual.js';

const BOSS_EFFECTS = BOSS_EFFECTS_PRESETS || {};
const BOSS_SHAKES = BOSS_SCREEN_SHAKES || {};

// The boss glows violet (docs/NORTE.md §2); EffectsSystem's boss attack
// effects share these colors.
export const BOSS_FX = Object.freeze({
  core: PALETTE.boss,
  accent: PALETTE.text,
  trail: withAlpha(PALETTE.boss, 0.6),
  smoke: withAlpha(PALETTE.rock, 0.35),
  flash: withAlpha(PALETTE.boss, 0.45),
});

export class BossTransitions {
  /**
   * `particleEffects`: the effects' Particles; every burst and shockwave lands there.
   * `randomFloat(fork)`, `randomRange(min, max, fork)`, `randomCentered(span, fork)`: the effects' random helpers; every roll here draws from 'boss'.
   * `getScaledParticleCount(count, options)`: the effects' Reduced Particles scaling of a burst's count.
   * `addScreenShake(presetOrIntensity, durationOrOptions)`, `addScreenFlash(color, duration, intensity)`: the effects' screen feedback.
   * `addFreezeFrame(duration, fade)`, `applyTimeDilation(scale, options)`: the effects' game time.
   */
  constructor({
    particleEffects,
    randomFloat,
    randomRange,
    randomCentered,
    getScaledParticleCount,
    addScreenShake,
    addScreenFlash,
    addFreezeFrame,
    applyTimeDilation,
  }) {
    this.particleEffects = particleEffects;
    this.randomFloat = randomFloat;
    this.randomRange = randomRange;
    this.randomCentered = randomCentered;
    this.getScaledParticleCount = getScaledParticleCount;
    this.addScreenShake = addScreenShake;
    this.addScreenFlash = addScreenFlash;
    this.addFreezeFrame = addFreezeFrame;
    this.applyTimeDilation = applyTimeDilation;

    this.bossTransitionEffects = [];
    this.activeBoss = { id: null, lastPhase: 0 };
  }

  // The borders go; the boss being tracked stays.
  reset() {
    this.bossTransitionEffects = [];
  }

  // EffectsSystem's boss listeners land here.
  onSpawned(payload = {}) {
    this.clearBossEffectsState();
    this.activeBoss.id = this.resolveBossId(payload);
    if (Number.isFinite(payload?.phase)) {
      this.activeBoss.lastPhase = payload.phase;
    }
    this.createBossEntranceEffect(payload);
    this.triggerBossTransitionEffect('boss-spawned');
  }

  onPhaseChanged(payload = {}) {
    const bossId = this.resolveBossId(payload);
    if (bossId != null) {
      this.activeBoss.id = bossId;
    }
    if (Number.isFinite(payload?.phase)) {
      this.activeBoss.lastPhase = payload.phase;
    }
    this.createBossPhaseTransition(payload);
    this.triggerBossTransitionEffect('boss-phase-changed');
  }

  onDefeated(payload = {}) {
    GameDebugLogger.log('EVENT', 'Boss defeated - creating effects', {
      bossId: this.resolveBossId(payload),
      position: this.resolveBossPosition(payload),
      wave: payload?.wave ?? null,
    });
    this.clearBossEffectsState();
    this.createBossDefeatedExplosion(payload);
    this.triggerBossTransitionEffect('boss-defeated');
    this.activeBoss = { id: null, lastPhase: 0 };
  }

  triggerBossTransitionEffect(eventName) {
    if (!this.bossTransitionEffects) {
      this.bossTransitionEffects = [];
    }

    const color = PALETTE.boss;
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

    return BOSS_EFFECTS &&
      Object.prototype.hasOwnProperty.call(BOSS_EFFECTS, name)
      ? BOSS_EFFECTS[name]
      : null;
  }

  getBossShakePreset(name) {
    if (!name) {
      return null;
    }

    return BOSS_SHAKES &&
      Object.prototype.hasOwnProperty.call(BOSS_SHAKES, name)
      ? BOSS_SHAKES[name]
      : null;
  }

  applyBossScreenShake(name) {
    const config = this.getBossShakePreset(name);
    const fallbackMap = {
      spawn: 'bossSpawn',
      phaseChange: 'bossPhaseChange',
      defeated: 'bossDefeated',
    };

    let presetName = null;
    let presetOptions;

    if (typeof config === 'string') {
      presetName = config;
    } else if (config && typeof config === 'object') {
      if (typeof config.preset === 'string') {
        presetName = config.preset;
      } else if (typeof config.shakePreset === 'string') {
        presetName = config.shakePreset;
      }

      if (config.options && typeof config.options === 'object') {
        presetOptions = config.options;
      } else if (config.overrides && typeof config.overrides === 'object') {
        presetOptions = config.overrides;
      }
    }

    if (!presetName && fallbackMap[name]) {
      presetName = fallbackMap[name];
    }

    if (
      presetName &&
      Object.prototype.hasOwnProperty.call(ShakePresets, presetName)
    ) {
      this.addScreenShake(presetName, presetOptions);
      return;
    }

    if (config && typeof config === 'object') {
      const intensity = Number.isFinite(config.intensity)
        ? config.intensity
        : null;
      const duration = Number.isFinite(config.duration)
        ? config.duration
        : null;

      if (intensity != null && duration != null) {
        this.addScreenShake(intensity, duration);
      }
    }
  }

  applyBossEffectTimings(config = {}, palette = {}) {
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
      const flashColor = palette.flash;
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

    if (
      !Array.isArray(this.particleEffects.particles) ||
      this.particleEffects.particles.length === 0
    ) {
      return;
    }

    const survivors = [];
    for (const particle of this.particleEffects.particles) {
      if (particle && particle.bossEffectTag) {
        if (preserveTags && preserveTags.has(particle.bossEffectTag)) {
          survivors.push(particle);
          continue;
        }
        this.particleEffects.releaseParticle(particle);
      } else {
        survivors.push(particle);
      }
    }

    this.particleEffects.particles = survivors;
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

  createBossEntranceEffect(payload = {}) {
    const origin = this.resolveBossPosition(payload);
    if (!origin) {
      return;
    }

    const config = this.getBossEffectConfig('entrance') || {};
    const palette = BOSS_FX;

    const swirl = config.swirl || {};
    const swirlCount = this.getScaledParticleCount(swirl.count ?? 48, {
      allowZero: true,
    });
    const innerRadius = Number.isFinite(swirl.innerRadius)
      ? swirl.innerRadius
      : 36;
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
      const velocityAngle =
        angle + Math.PI / 2 + this.randomCentered(0.4, 'boss');
      const particle = this.particleEffects.createParticle(
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
      this.particleEffects.particles.push(particle);
    }

    const burst = config.burst || {};
    const rings = Math.max(1, burst.rings ?? 2);
    const perRing = Math.max(1, burst.particlesPerRing ?? 24);
    const radiusStep = Number.isFinite(burst.radiusStep)
      ? burst.radiusStep
      : 44;
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
        const particle = this.particleEffects.createParticle(
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
        this.particleEffects.particles.push(particle);
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
      const particle = this.particleEffects.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.smoke,
        this.randomRange(dustSizeMin, dustSizeMax, 'boss'),
        this.randomRange(dustLifeMin, dustLifeMax, 'boss'),
        'smoke'
      );
      particle.rotationSpeed = this.randomCentered(1.2, 'boss');
      this.tagBossParticle(particle, 'boss-entrance');
      this.particleEffects.particles.push(particle);
    }

    if (config.shockwave) {
      this.particleEffects.createShockwaveEffect({
        position: origin,
        radius: config.shockwave.radius,
        duration: config.shockwave.duration,
        baseWidth: config.shockwave.baseWidth,
        maxAlpha: config.shockwave.maxAlpha,
        widthFade: config.shockwave.widthFade,
        easingPower: config.shockwave.easingPower,
        color: palette.core,
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
    const palette = BOSS_FX;

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
      const particle = this.particleEffects.createParticle(
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
      this.particleEffects.particles.push(particle);
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
      const particle = this.particleEffects.createParticle(
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
      this.particleEffects.particles.push(particle);
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
      const particle = this.particleEffects.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.trail,
        this.randomRange(emberSizeMin, emberSizeMax, 'boss'),
        this.randomRange(emberLifeMin, emberLifeMax, 'boss'),
        'normal'
      );
      particle.rotationSpeed = this.randomCentered(1.5, 'boss');
      this.tagBossParticle(particle, 'boss-phase');
      this.particleEffects.particles.push(particle);
    }

    if (config.shockwave) {
      this.particleEffects.createShockwaveEffect({
        position: origin,
        radius: config.shockwave.radius,
        duration: config.shockwave.duration,
        baseWidth: config.shockwave.baseWidth,
        maxAlpha: config.shockwave.maxAlpha,
        widthFade: config.shockwave.widthFade,
        easingPower: config.shockwave.easingPower,
        color: palette.accent,
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
    const palette = BOSS_FX;

    this.addFreezeFrame(0.5, 0.3);
    this.addScreenShake(20, 1.0);
    this.addScreenFlash(PALETTE.text, 0.8, 0.3);

    const burstColor = palette.core;
    const burstCount = 50;
    const scheduleBurst = typeof setTimeout === 'function';

    for (let i = 0; i < burstCount; i += 1) {
      const emitBurst = () => {
        const angle = this.randomFloat('boss') * Math.PI * 2;
        const speed = this.randomRange(200, 400, 'boss');
        const particle = this.particleEffects.createParticle(
          origin.x,
          origin.y,
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          burstColor,
          this.randomRange(4, 12, 'boss'),
          this.randomRange(1, 3, 'boss'),
          'explosion'
        );
        if (!particle) {
          return;
        }
        particle.rotationSpeed = this.randomCentered(6, 'boss');
        this.tagBossParticle(particle, 'boss-defeat');
        this.particleEffects.particles.push(particle);
      };

      if (scheduleBurst) {
        setTimeout(emitBurst, i * 20);
      } else {
        emitBurst();
      }
    }

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
      const particle = this.particleEffects.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        PALETTE.hullLit,
        this.randomRange(debrisSizeMin, debrisSizeMax, 'boss'),
        this.randomRange(debrisLifeMin, debrisLifeMax, 'boss'),
        'debris'
      );
      particle.rotationSpeed = this.randomCentered(8, 'boss');
      this.tagBossParticle(particle, 'boss-defeat');
      this.particleEffects.particles.push(particle);
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
      const particle = this.particleEffects.createParticle(
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
      this.particleEffects.particles.push(particle);
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
      const particle = this.particleEffects.createParticle(
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
      this.particleEffects.particles.push(particle);
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
      const particle = this.particleEffects.createParticle(
        origin.x,
        origin.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        palette.smoke,
        this.randomRange(smokeSizeMin, smokeSizeMax, 'boss'),
        this.randomRange(smokeLifeMin, smokeLifeMax, 'boss'),
        'smoke'
      );
      particle.rotationSpeed = this.randomCentered(0.9, 'boss');
      this.tagBossParticle(particle, 'boss-defeat');
      this.particleEffects.particles.push(particle);
    }

    if (config.shockwave) {
      this.particleEffects.createShockwaveEffect({
        position: origin,
        radius: config.shockwave.radius,
        duration: config.shockwave.duration,
        baseWidth: config.shockwave.baseWidth,
        maxAlpha: config.shockwave.maxAlpha,
        widthFade: config.shockwave.widthFade,
        easingPower: config.shockwave.easingPower,
        color: palette.core,
      });
    }

    if (config.secondaryShockwave) {
      this.particleEffects.createShockwaveEffect({
        position: origin,
        radius: config.secondaryShockwave.radius,
        duration: config.secondaryShockwave.duration,
        baseWidth: config.secondaryShockwave.baseWidth,
        maxAlpha: config.secondaryShockwave.maxAlpha,
        widthFade: config.secondaryShockwave.widthFade,
        easingPower: config.secondaryShockwave.easingPower,
        color: palette.accent,
      });
    }

    this.applyBossScreenShake('defeated');
    this.applyBossEffectTimings(config, palette, 'boss-defeated');

    GameDebugLogger.log('STATE', 'Boss defeat effects created', {
      freezeDuration: 0.5,
      shakeIntensity: 20,
      particleCount: burstCount,
    });
  }

  updateBossTransitions(deltaTime) {
    if (
      !Array.isArray(this.bossTransitionEffects) ||
      !this.bossTransitionEffects.length
    ) {
      return;
    }

    const effects = this.bossTransitionEffects;
    let writeIndex = 0;

    for (let i = 0; i < effects.length; i += 1) {
      const effect = effects[i];
      if (!effect) {
        continue;
      }

      effect.timer += deltaTime;
      if (effect.timer < effect.duration) {
        effects[writeIndex++] = effect;
      }
    }

    effects.length = writeIndex;
  }
}
