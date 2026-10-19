import {
  ASTEROID_VARIANTS,
  ASTEROID_BASE_ORBS,
  ASTEROID_SIZE_ORB_FACTOR,
  ORB_VALUE,
} from '../data/enemies/asteroid-configs.js';
import RandomService from '../core/RandomService.js';
import { BaseSystem } from '../core/BaseSystem.js';
import { resolveService } from '../core/serviceUtils.js';
import { ORB_CLASSES, ORB_CLASS_CONFIG } from './xp/orbClasses.js';
import { OrbTuning } from './xp/OrbTuning.js';
import { OrbField } from './xp/OrbField.js';
import { OrbFusion } from './xp/OrbFusion.js';
import { OrbSpacing } from './xp/OrbSpacing.js';
import { OrbMagnet } from './xp/OrbMagnet.js';

const SERVICE_CACHE_MAP = Object.freeze({
  cachedPlayer: 'player',
  cachedProgression: 'progression',
});

class XPOrbSystem extends BaseSystem {
  constructor({ eventBus, player, progression, random } = {}) {
    super(
      { eventBus, player, progression, random },
      {
        enableRandomManagement: true,
        systemName: 'XPOrbSystem',
        serviceName: 'xp-orbs',
        randomForkLabels: {
          base: 'xp-orbs.base',
          creation: 'xp-orbs.creation',
          clustering: 'xp-orbs.clustering',
          fusion: 'xp-orbs.fusion',
        },
      }
    );

    this._fallbackRandom = null;
    this._randomForkSource = null;
    this._randomForkSignature = null;

    this.globalPull = null;
    this.drift = null;

    this.tuning = new OrbTuning();
    this.field = new OrbField({ tuning: this.tuning });
    this.fusion = new OrbFusion({
      eventBus: this.eventBus,
      field: this.field,
      tuning: this.tuning,
      createOrb: (x, y, value, options) =>
        this.createXPOrb(x, y, value, options),
      newAnimationId: (className) => this.generateFusionAnimationId(className),
    });
    this.spacing = new OrbSpacing({ field: this.field, tuning: this.tuning });
    this.magnet = new OrbMagnet({
      field: this.field,
      tuning: this.tuning,
      getPlayer: () => this.resolvePlayer(),
      getPullScale: () => this.drift?.pullScale ?? 1,
      collectOrb: (orb) => this.collectOrb(orb),
    });

    this.cachedPlayer = this.dependencies.player || null;
    this.cachedProgression = this.dependencies.progression || null;

    this.ensureRandom({ force: true });

    this.missingDependencyWarnings = new Set();

    super.resolveCachedServices(SERVICE_CACHE_MAP, { force: true });
  }

  get xpOrbs() {
    return this.field.xpOrbs;
  }

  resolvePlayer() {
    if (
      !this.cachedPlayer ||
      typeof this.cachedPlayer.getPosition !== 'function'
    ) {
      super.resolveCachedServices(SERVICE_CACHE_MAP);
    }

    return this.cachedPlayer;
  }

  attachProgression(progressionSystem) {
    if (!progressionSystem) {
      this.logMissingDependency('progression');
      return;
    }

    this.dependencies.progression = progressionSystem;
    this.cachedProgression = progressionSystem;
    this.missingDependencyWarnings.delete('progression');
    super.resolveCachedServices(SERVICE_CACHE_MAP, { force: true });
  }

  logMissingDependency(name) {
    if (this.missingDependencyWarnings.has(name)) {
      return;
    }

    this.missingDependencyWarnings.add(name);
    console.warn(`[XPOrbSystem] Missing dependency: ${name}`);
  }

  ensureRandom({ force = false } = {}) {
    let candidate = this.dependencies.random || this.random;
    if (!candidate) {
      const resolvedRandom = resolveService('random', this.dependencies);
      if (resolvedRandom) {
        candidate = resolvedRandom;
        this.dependencies.random = resolvedRandom;
      }
    }

    if (!candidate || typeof candidate.fork !== 'function') {
      if (!this._fallbackRandom) {
        this._fallbackRandom = new RandomService();
      }
      candidate = this._fallbackRandom;
    }

    this.random = candidate;

    const signature = this.captureRandomSignature(candidate);
    const signatureChanged =
      signature !== undefined && signature !== this._randomForkSignature;

    if (force || this._randomForkSource !== candidate || signatureChanged) {
      this.randomForks = this.createRandomForks(
        candidate,
        this.randomForkLabels
      );
      this._randomForkSource = candidate;
      this._randomForkSignature = signature;
      this.captureRandomForkSeeds();
      this.fusion.fusionCheckTimer = this.generateInitialFusionTimer();
    }

    return this.random;
  }

  captureRandomSignature(random) {
    if (!random || typeof random !== 'object') {
      return undefined;
    }

    const seed =
      typeof random.seed === 'number' && Number.isFinite(random.seed)
        ? random.seed >>> 0
        : undefined;

    let resetCount;
    if (typeof random.getResetCount === 'function') {
      resetCount = random.getResetCount();
    } else if (random._stats && random._stats.calls) {
      resetCount = random._stats.calls.reset;
    }

    if (seed === undefined && resetCount === undefined) {
      return undefined;
    }

    const seedPart = seed === undefined ? 'unknown' : String(seed);
    const resetPart =
      typeof resetCount === 'number' && Number.isFinite(resetCount)
        ? String(resetCount >>> 0)
        : 'unknown';

    return `${seedPart}:${resetPart}`;
  }

  generateInitialFusionTimer() {
    if (
      !Number.isFinite(this.tuning.fusionCheckInterval) ||
      this.tuning.fusionCheckInterval <= 0
    ) {
      return 0;
    }

    const clusteringRandom = this.getRandomFork('clustering');
    if (clusteringRandom && typeof clusteringRandom.range === 'function') {
      return clusteringRandom.range(0, this.tuning.fusionCheckInterval);
    }

    if (this.random && typeof this.random.range === 'function') {
      return this.random.range(0, this.tuning.fusionCheckInterval);
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService();
    }

    return this._fallbackRandom.range(0, this.tuning.fusionCheckInterval);
  }

  generateOrbId() {
    const creationRandom = this.getRandomFork('creation');
    if (creationRandom && typeof creationRandom.uuid === 'function') {
      return creationRandom.uuid('xp-orb');
    }

    const randomSource = this.ensureRandom();
    if (randomSource && typeof randomSource.uuid === 'function') {
      return randomSource.uuid('xp-orb');
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService();
    }

    return this._fallbackRandom.uuid('xp-orb');
  }

  generateFusionAnimationId(className = 'unknown') {
    const scopeLabel = `fusion:${className}`;
    const fusionRandom = this.getRandomFork('fusion');
    if (fusionRandom && typeof fusionRandom.uuid === 'function') {
      return fusionRandom.uuid(scopeLabel);
    }

    const randomSource = this.ensureRandom();
    if (randomSource && typeof randomSource.uuid === 'function') {
      return randomSource.uuid(scopeLabel);
    }

    if (!this._fallbackRandom) {
      this._fallbackRandom = new RandomService();
    }

    const fallback = this._fallbackRandom;
    if (typeof fallback.uuid === 'function') {
      return fallback.uuid(scopeLabel);
    }

    const suffixSource =
      fusionRandom && typeof fusionRandom.range === 'function'
        ? fusionRandom
        : randomSource && typeof randomSource.range === 'function'
          ? randomSource
          : fallback;

    const suffix =
      suffixSource && typeof suffixSource.range === 'function'
        ? Math.floor(suffixSource.range(0, Number.MAX_SAFE_INTEGER)).toString(
            16
          )
        : `${Date.now()}`;

    return `${scopeLabel}:${suffix}`;
  }

  setupEventListeners() {
    // ARCHITECTURE NOTE:
    // XPOrbSystem is responsible for MANAGING orbs (pooling, fusion, magnetism, rendering)
    // RewardManager is responsible for DECIDING what to drop (XP orbs, health hearts, coins, etc.)
    // This separation keeps the architecture clean and extensible.
    //
    // The old 'enemy-destroyed' listener here was removed because:
    // - It caused duplicate orb creation (both systems creating orbs)
    // - Drop decisions should be centralized in RewardManager
    // - XPOrbSystem should only receive createXPOrb() calls, not decide when to drop
    //
    // RewardManager now calls xpOrbSystem.createXPOrb() for XP drops
    // HealthHeartSystem handles health hearts
    // Future systems (coins, etc.) will follow the same pattern

    this.registerEventListener('progression-reset', () => {
      super.resolveCachedServices(SERVICE_CACHE_MAP, { force: true });
    });

    this.registerEventListener('player-reset', () => {
      super.resolveCachedServices(SERVICE_CACHE_MAP, { force: true });
    });
  }

  isOrbActive(orb) {
    return this.field.isOrbActive(orb);
  }

  isOrbEligibleForFusion(orb) {
    return this.field.isOrbEligibleForFusion(orb);
  }

  invalidateSpatialIndex() {
    this.field.invalidateSpatialIndex();
  }

  resolveOrbClass(value, options = {}) {
    if (options.className && ORB_CLASSES[options.className]) {
      return ORB_CLASSES[options.className];
    }

    if (typeof options.tier === 'number') {
      const configByTier = ORB_CLASS_CONFIG.find(
        (config) => config.tier === options.tier
      );
      if (configByTier) {
        return configByTier;
      }
    }

    const numericValue = Number.isFinite(value)
      ? value
      : this.tuning.baseOrbValue;
    let tier = 1;
    let threshold = this.tuning.baseOrbValue;

    for (let i = 1; i < ORB_CLASS_CONFIG.length; i += 1) {
      threshold *= this.tuning.clusterFusionCount;
      if (numericValue >= threshold) {
        tier = i + 1;
      } else {
        break;
      }
    }

    return (
      ORB_CLASS_CONFIG.find((config) => config.tier === tier) ||
      ORB_CLASSES.blue
    );
  }

  createXPOrb(x, y, value, options = {}) {
    const resolvedConfig = this.resolveOrbClass(value, options);
    const orb = this.field.acquireOrb();
    this.initializeOrbState(orb, x, y, value, resolvedConfig, options);

    this.field.addOrbToPools(orb);
    this.fusion.enforceClassLimit(orb.class);

    this.eventBus?.emit?.('xp-orb-created', {
      orb,
      position: { x, y },
      value,
      class: orb.class,
      tier: orb.tier,
      source: options.source || 'drop',
    });

    return orb;
  }

  initializeOrbState(orb, x, y, value, resolvedConfig, options = {}) {
    if (!orb) {
      return null;
    }

    orb.id = this.generateOrbId();
    orb.x = x;
    orb.y = y;
    orb.value = Number.isFinite(value) ? value : this.tuning.baseOrbValue;
    orb.class = resolvedConfig.name;
    orb.tier = resolvedConfig.tier;
    orb.collected = false;
    orb.age = options.age ?? 0;
    orb.isFusing = false;
    orb.fusionTimer = 0;
    orb.pulsePhase = orb.pulsePhase ?? 0;
    orb.clusterId = options.clusterId ?? null;
    orb.source = options.source || 'drop';
    orb.pendingRemoval = false;
    orb.active = true;

    return orb;
  }

  update(deltaTime) {
    if (this.globalPull) {
      this.updateGlobalPull(deltaTime);
    }

    if (
      !this.xpOrbs.length &&
      this.fusion.activeFusionAnimations.length === 0
    ) {
      return;
    }

    this.fusion.updateFusionAnimations(deltaTime);

    if (this.xpOrbs.length) {
      this.advanceOrbAges(deltaTime);
      if (this.drift) this.updateDrift(deltaTime);
      this.magnet.updateShipMagnetism(deltaTime);
      this.spacing.updateOrbSoftBounds(deltaTime);
      this.spacing.updateOrbClustering(deltaTime);
      this.fusion.checkOrbFusion(deltaTime);
    }

    this.field.cleanupCollectedOrbs();
  }

  advanceOrbAges(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (!this.xpOrbs.length) {
      return;
    }

    for (let i = 0; i < this.xpOrbs.length; i += 1) {
      const orb = this.xpOrbs[i];
      if (!orb || orb.collected) {
        continue;
      }

      const currentAge = Number.isFinite(orb.age) ? orb.age : 0;
      orb.age = currentAge + deltaTime;
    }
  }

  // Magnet pickup: every orb flies to the ship, faster each second; the
  // ship magnetism below collects them on arrival. `direction` -1 inverts it
  // (Warden Null): every orb flies away from the ship. A `target` {x, y}
  // (Gravity Well) pulls toward that world point instead of the ship.
  startGlobalPull(duration, speed, acceleration, direction = 1, target = null) {
    this.globalPull = {
      remaining: duration,
      elapsed: 0,
      speed,
      acceleration,
      direction,
      target,
    };
  }

  updateGlobalPull(deltaTime) {
    const pull = this.globalPull;
    pull.remaining -= deltaTime;
    pull.elapsed += deltaTime;
    const target = pull.target || this.cachedPlayer?.getPosition();
    if (pull.remaining <= 0 || !target) {
      this.globalPull = null;
      return;
    }
    const step = (pull.speed + pull.acceleration * pull.elapsed) * deltaTime;
    for (const orb of this.xpOrbs) {
      if (!this.isOrbActive(orb) || orb.isFusing) continue;
      const dx = target.x - orb.x;
      const dy = target.y - orb.y;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) continue;
      const move =
        pull.direction < 0
          ? -step / distance
          : Math.min(step, distance) / distance;
      orb.x += dx * move;
      orb.y += dy * move;
    }
    this.invalidateSpatialIndex();
  }

  // Magnetic Storm (layer modifier): `params` {driftSpeed, driftTurn,
  // pullScale} sets every orb drifting on a heading that turns at random
  // (`random`, seeded per layer) and weakens the ship's pull; null ends it.
  setDrift(params, random = null) {
    this.drift = params ? { ...params, random } : null;
  }

  updateDrift(deltaTime) {
    const { driftSpeed, driftTurn, random } = this.drift;
    const step = driftSpeed * deltaTime;
    for (const orb of this.xpOrbs) {
      if (!this.isOrbActive(orb) || orb.isFusing) continue;
      orb.driftHeading =
        (orb.driftHeading ?? random.range(0, Math.PI * 2)) +
        random.range(-driftTurn, driftTurn) * deltaTime;
      orb.x += Math.cos(orb.driftHeading) * step;
      orb.y += Math.sin(orb.driftHeading) * step;
    }
    this.invalidateSpatialIndex();
  }

  collectOrb(orb) {
    if (!orb || orb.collected) {
      return;
    }

    orb.collected = true;

    this.eventBus?.emit?.('xp-collected', {
      orb,
      position: { x: orb.x, y: orb.y },
      value: orb.value,
      class: orb.class,
      tier: orb.tier,
    });

    this.eventBus?.emit?.('xp-orb-collected', {
      value: orb.value,
      position: { x: orb.x, y: orb.y },
      class: orb.class,
      tier: orb.tier,
    });
  }

  getMagnetismRadius() {
    return this.tuning.orbMagnetismRadius;
  }

  setMagnetismRadius(radius) {
    const next = Number(radius);
    if (!Number.isFinite(next)) {
      return;
    }
    this.tuning.orbMagnetismRadius = Math.max(10, next);
  }

  getMagnetismForce() {
    return this.tuning.magnetismForce;
  }

  setMagnetismForce(force) {
    const next = Number(force);
    if (!Number.isFinite(next)) {
      return;
    }
    this.tuning.magnetismForce = Math.max(0, next);
  }

  resetMagnetism() {
    this.tuning.resetMagnetism();
  }

  getActiveOrbs() {
    return this.xpOrbs.filter((orb) => !orb.collected);
  }

  /** The nearest loose orb within `maxDistance` of (x, y), or null; orbs mid-fusion are spoken for. */
  nearestOrb(x, y, maxDistance) {
    let nearest = null;
    let nearestSq = maxDistance * maxDistance;
    for (let i = 0; i < this.xpOrbs.length; i += 1) {
      const orb = this.xpOrbs[i];
      if (!this.isOrbEligibleForFusion(orb)) continue;
      const distanceSq = (orb.x - x) ** 2 + (orb.y - y) ** 2;
      if (distanceSq <= nearestSq) {
        nearest = orb;
        nearestSq = distanceSq;
      }
    }
    return nearest;
  }

  /** Takes a loose orb off the field without granting its XP (a Leech ate it); returns its value. */
  consumeOrb(orb) {
    if (!this.isOrbEligibleForFusion(orb)) return 0;
    orb.collected = true;
    return orb.value;
  }

  getBaseXPValue(size, wave = 1) {
    // ASTEROID_XP_BASE was removed in REFACTOR-020 (replaced by ORB_VALUE system)
    // Inline fallback for backward compatibility
    const baseLookup = {
      large: 15,
      medium: 8,
      small: 5,
    };

    const baseValue = baseLookup[size] ?? baseLookup.small ?? 5;

    // Wave scaling: matches HP difficulty (+12% per wave, cap at wave 10)
    const effectiveWave = Math.max(1, Math.min(wave, 10));
    const waveMultiplier = 1 + (effectiveWave - 1) * 0.12;

    // Player level bonus (small extra reward for progression)
    const progression = this.cachedProgression;
    const level =
      progression && typeof progression.getLevel === 'function'
        ? progression.getLevel()
        : 1;
    const levelBonus = Math.floor(level * 0.3);

    return Math.max(1, Math.round(baseValue * waveMultiplier + levelBonus));
  }

  getVariantConfig(variantKey = 'common') {
    const variants = ASTEROID_VARIANTS || {};
    return variants[variantKey] || variants.common || null;
  }

  buildVariantXPDropPlan(data) {
    if (!data) {
      return [];
    }

    if (!this.cachedProgression) {
      super.resolveCachedServices(SERVICE_CACHE_MAP);
    }

    const size = data.size || data.enemy?.size || 'small';
    const variantKey = data.variant || data.enemy?.variant || 'common';
    const wave = data.wave || data.enemy?.wave || 1;

    // === NEW ORB-BASED SYSTEM ===
    // Calculate number of orbs based on: BASE × SIZE × VARIANT × WAVE
    const orbValue = ORB_VALUE || 5; // Fixed 5 XP per orb
    const baseOrbs = ASTEROID_BASE_ORBS?.[size] ?? 1;
    const sizeFactor = ASTEROID_SIZE_ORB_FACTOR?.[size] ?? 1.0;

    const variantConfig = this.getVariantConfig(variantKey);
    const orbMultiplier = variantConfig?.orbMultiplier ?? 1.0;

    // Wave scaling: +1 orb per 5 waves (wave 1-4: +0, wave 5-9: +1, wave 10+: +2)
    const waveBonus =
      wave <= 10 ? Math.floor(wave / 5) : Math.floor((wave - 10) / 3) + 2;

    // Final orb count (rounded)
    const numOrbs = Math.max(
      1,
      Math.round(baseOrbs * sizeFactor * orbMultiplier + waveBonus)
    );
    const totalValue = numOrbs * orbValue;

    // === SIMPLIFIED ORB DISTRIBUTION ===
    // Distribute totalValue evenly across numOrbs
    // Each orb gets orbValue (5 XP), but may vary slightly due to rounding
    const drops = [];
    const valuePerOrb = Math.floor(totalValue / numOrbs);
    let remainder = totalValue - valuePerOrb * numOrbs;

    for (let i = 0; i < numOrbs; i += 1) {
      let value = valuePerOrb;

      // Distribute remainder across first orbs
      if (remainder > 0) {
        value += 1;
        remainder -= 1;
      }

      drops.push({
        value: Math.max(1, value), // Each orb should be at least 1 XP
        options: {
          variant: variantKey,
          tier: 1, // Always tier 1 (blue) for fusion system
        },
      });
    }

    return drops;
  }

  getDropOffset(index, total) {
    if (!Number.isFinite(index) || !Number.isFinite(total) || total <= 1) {
      return { x: 0, y: 0 };
    }

    const spreadRadius = 12 + Math.min(total * 4, 28);
    const angle = (index / total) * Math.PI * 2;
    return {
      x: Math.cos(angle) * spreadRadius,
      y: Math.sin(angle) * spreadRadius,
    };
  }

  reset() {
    super.reset();
    this.field.reset();
    this.fusion.reset();
    this.globalPull = null;
    this.drift = null;

    this.tuning.reset();
    this.field.invalidateSpatialIndex();

    super.resolveCachedServices(SERVICE_CACHE_MAP, { force: true });
  }
}

export default XPOrbSystem;
