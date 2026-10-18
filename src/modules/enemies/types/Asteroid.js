// src/modules/enemies/types/Asteroid.js
import {
  ASTEROID_BASE_HEALTH,
  ASTEROID_HEALTH_SCALING,
  ASTEROID_SIZES,
  ASTEROID_ENTRY_ANGLE_VARIANCE,
  GAME_HEIGHT,
  GAME_WIDTH,
  SHIP_SIZE,
} from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import FragmentationSystem from '../systems/FragmentationSystem.js';
import CrackGenerationService from '../../../services/CrackGenerationService.js';
import {
  ASTEROID_CRACK_THRESHOLDS,
  ASTEROID_SPEEDS,
} from '../../../data/constants/physics.js';
import {
  ASTEROID_CRACK_PROFILES,
  ASTEROID_FRAGMENT_RULES,
  ASTEROID_VARIANTS,
} from '../../../data/enemies/asteroid-configs.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { getRenderScale } from '../../../core/viewport.js';
import { getEmissive } from '../../../core/bloomLayer.js';
import {
  HIT_FLASH_BODY_ALPHA,
  HIT_FLASH_EMISSIVE_ALPHA,
  whiteSilhouette,
} from '../components/RenderComponent.js';
import {
  FILL_LIGHT,
  KEY_LIGHT_ANGLE,
  KEY_LIGHT_DIR,
  LINE,
  PALETTE,
  withAlpha,
} from '../../../data/constants/palette.js';
import { requireRandom } from '../../../utils/randomHelpers.js';

/**
 * Asteroid Enemy Type
 *
 * The iconic asteroid enemy with advanced crack systems, variant behaviors,
 * and fragmentation mechanics. Extends BaseEnemy to integrate with the new
 * enemy system architecture.
 *
 * Features:
 * - Procedural shape generation with seeded randomness
 * - Multi-stage crack system with visual damage progression
 *   (delegated to CrackGenerationService for reusability)
 * - Variant system (common, iron, gold, crystal, volatile, parasite)
 * - Advanced fragmentation with inheritance (delegated to FragmentationSystem)
 * - Behavior systems (parasite tracking, volatile explosion)
 * - Visual effects (glow, pulse, trails)
 *
 * @extends BaseEnemy
 */
export class Asteroid extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'asteroid';

    // Asteroid-specific properties initialization
    this.size = 'small';
    this.variant = 'common';
    this.variantConfig = null;
    this.crackProfileKey = 'default';
    this.fragmentProfileKey = 'default';
    this.crackProfile = null;
    this.fragmentProfile = null;
    this.behavior = null;

    this.lastDamageTime = 0;
    this.shieldHitCooldown = 0;
    this.destroyed = false;

    this.crackSeed = 0;
    this.crackStage = 0;

    this.vertices = [];
    this.polygonEdges = [];
    this.minSurfaceRadius = 0;
    this.crackLayers = [];
    this.variantState = {};
    this.visualState = {};
    this.spawnTime = 0;
    this.offscreenTimer = 0;
    this.random = null;
    this.randomScopes = null;
    this.randomScopeSeeds = null;
    this.randomScopeLabels = {
      movement: 'movement',
      visual: 'visual',
      collision: 'collision',
      cracks: 'cracks',
    };

    // Initialize if config was provided
    if (system && Object.keys(config).length > 0) {
      this.initialize(system, config);
    }
  }

  setRandomSource(random) {
    if (random && typeof random.float === 'function') {
      this.random = random;
    } else {
      this.random = new RandomService();
    }
    this.randomScopes = null;
    this.randomScopeSeeds = null;
    return this.random;
  }

  ensureRandomScopes() {
    if (!this.random) {
      this.setRandomSource();
    }

    if (!this.randomScopes) {
      this.randomScopes = {
        core: this.random,
        movement: this.random.fork(this.randomScopeLabels.movement),
        visual: this.random.fork(this.randomScopeLabels.visual),
        collision: this.random.fork(this.randomScopeLabels.collision),
        cracks: this.random.fork(this.randomScopeLabels.cracks),
      };
      this.randomScopeSeeds = {};
      this.captureRandomScopeSeeds();
    }

    return this.randomScopes;
  }

  getRandomFor(scope = 'core') {
    const scopes = this.ensureRandomScopes();
    if (scope === 'core') {
      return scopes.core;
    }

    if (!scopes[scope]) {
      const label = this.randomScopeLabels?.[scope] || `asteroid:${scope}`;
      scopes[scope] = this.random.fork(label);
      this.captureRandomScopeSeed(scope, scopes[scope]);
    }

    return scopes[scope];
  }

  /**
   * Initializes the asteroid with configuration.
   * Overrides BaseEnemy.initialize() to add asteroid-specific setup.
   */
  initialize(system, config) {
    const options = config || {};

    // Reset first
    this.resetForPool();

    this.system = system;
    const scopeHint =
      options.randomScope || (options.spawnedBy ? 'fragments' : 'spawn');
    let randomSource = options.random;
    if (
      !randomSource &&
      this.system &&
      typeof this.system.getRandomScope === 'function'
    ) {
      const scopedRandom = this.system.getRandomScope(scopeHint, {
        label: `asteroid-fallback:${scopeHint}`,
      });
      if (scopedRandom && typeof scopedRandom.fork === 'function') {
        randomSource = scopedRandom.fork('asteroid-core');
      } else {
        randomSource = scopedRandom;
      }
    }

    const baseRandom = this.setRandomSource(randomSource);
    const movementRandom = this.getRandomFor('movement');
    const cracksRandom = this.getRandomFor('cracks');

    this.id = options.id ?? baseRandom.uuid('asteroid');
    this.size = options.size ?? 'small';
    if (
      typeof this.size !== 'string' ||
      !['small', 'medium', 'large'].includes(this.size)
    ) {
      this.size = 'small';
    }
    this.variant = options.variant ?? null;
    this.wave = options.wave || 1;
    this.spawnedBy = options.spawnedBy ?? null;
    this.generation = options.generation ?? 0;

    // WAVE-006: Auto-decide variant if not provided (delegates to EnemySystem)
    if (!this.variant || this.variant === 'auto') {
      if (this.system && typeof this.system.decideVariant === 'function') {
        const variantContext = {
          wave: this.wave,
          spawnType: options.spawnedBy ? 'fragment' : 'spawn',
          parent: options.parent || null,
          disallowedVariants: options.disallowedVariants || [],
        };

        if (this.system && typeof this.system.getRandomScope === 'function') {
          const systemVariantRandom = this.system.getRandomScope('variants');
          if (systemVariantRandom) {
            variantContext.random = systemVariantRandom;
          }
        }

        this.variant = this.system.decideVariant(this.size, variantContext);
      } else {
        // Fallback to common if decideVariant not available
        this.variant = 'common';
      }
    }

    if (!this.variant) {
      this.variant = 'common';
    }

    this.radius = ASTEROID_SIZES[this.size] || 12;
    this.variantConfig =
      ASTEROID_VARIANTS[this.variant] || ASTEROID_VARIANTS.common;

    GameDebugLogger.log('STATE', 'Asteroid initialized', {
      configReceived: {
        size: options?.size,
        variant: options?.variant,
      },
      propertiesSet: {
        size: this.size,
        variant: this.variant,
        radius: this.radius,
        variantKey: this.variantConfig?.key,
      },
      expectedRadius: ASTEROID_SIZES[this.size],
      radiusMatch: this.radius === ASTEROID_SIZES[this.size],
      configApplied:
        this.size === options?.size && this.variant === options?.variant,
    });

    this.crackProfileKey =
      this.variantConfig?.crackProfile || this.variant || 'default';
    this.fragmentProfileKey =
      this.variantConfig?.fragmentProfile || this.variant || 'default';
    this.crackProfile =
      ASTEROID_CRACK_PROFILES[this.crackProfileKey] ||
      ASTEROID_CRACK_PROFILES.default;
    this.fragmentProfile =
      ASTEROID_FRAGMENT_RULES[this.fragmentProfileKey] ||
      ASTEROID_FRAGMENT_RULES.default;

    this.behavior = this.variantConfig?.behavior || null;

    // Copy movement strategy and config from variant config
    this.movementStrategy =
      this.variantConfig?.movementStrategy || this.movementStrategy || 'linear';
    this.movementConfig = {
      ...(this.movementConfig || {}),
      ...(this.variantConfig?.movementConfig || {}),
    };

    const baseMass = this.radius * this.radius * 0.05;
    this.mass = baseMass * (this.variantConfig?.massMultiplier ?? 1);

    const baseSpeed = ASTEROID_SPEEDS[this.size] || 40;
    const randomSpeed = baseSpeed * movementRandom.range(0.8, 1.2);
    const speedMultiplier = this.variantConfig?.speedMultiplier ?? 1;
    const finalSpeed = randomSpeed * speedMultiplier;

    this.x = options.x ?? 0;
    this.y = options.y ?? 0;

    if (Number.isFinite(options.vx) || Number.isFinite(options.vy)) {
      this.vx = (options.vx ?? 0) * speedMultiplier;
      this.vy = (options.vy ?? 0) * speedMultiplier;

      if (this.vx === 0 && this.vy === 0) {
        const angle = movementRandom.range(0, Math.PI * 2);
        this.vx = Math.cos(angle) * finalSpeed;
        this.vy = Math.sin(angle) * finalSpeed;
      }
    } else {
      const angle = options.angle ?? movementRandom.range(0, Math.PI * 2);
      this.vx = Math.cos(angle) * finalSpeed;
      this.vy = Math.sin(angle) * finalSpeed;
    }

    const hasExplicitDirection =
      Number.isFinite(options.vx) ||
      Number.isFinite(options.vy) ||
      Number.isFinite(options.angle);
    const offscreenMargin = Math.max(0, Number(this.radius) || 0);
    const isOutsideScreen =
      this.x < -offscreenMargin ||
      this.x > GAME_WIDTH + offscreenMargin ||
      this.y < -offscreenMargin ||
      this.y > GAME_HEIGHT + offscreenMargin;

    if (isOutsideScreen && !hasExplicitDirection && !options.spawnedBy) {
      const angleVariance = Number.isFinite(ASTEROID_ENTRY_ANGLE_VARIANCE)
        ? ASTEROID_ENTRY_ANGLE_VARIANCE
        : Math.PI / 4;
      const angleOffset =
        typeof movementRandom.range === 'function'
          ? movementRandom.range(-angleVariance, angleVariance)
          : requireRandom(
              movementRandom,
              'enemy.asteroid.entry-angle'
            ).float() *
              2 *
              angleVariance -
            angleVariance;
      const targetAngle = Math.atan2(
        GAME_HEIGHT / 2 - this.y,
        GAME_WIDTH / 2 - this.x
      );
      const entrySpeed = Math.max(1, Math.hypot(this.vx, this.vy));
      this.vx = Math.cos(targetAngle + angleOffset) * entrySpeed;
      this.vy = Math.sin(targetAngle + angleOffset) * entrySpeed;
    }

    this.rotation = options.rotation ?? movementRandom.range(0, Math.PI * 2);
    const baseRotationSpeed =
      options.rotationSpeed ?? movementRandom.range(-0.75, 0.75);
    this.rotationSpeed =
      baseRotationSpeed * (this.variantConfig?.rotationMultiplier ?? 1);

    const baseHealth =
      ASTEROID_BASE_HEALTH[this.size] ?? ASTEROID_BASE_HEALTH.small ?? 10;
    const waveMultiplier = this.computeWaveHealthMultiplier(this.wave);
    const variantHP = this.variantConfig?.hpMultiplier ?? 1;

    this.maxHealth = Math.max(
      1,
      Math.round(baseHealth * waveMultiplier * variantHP)
    );
    this.health = this.maxHealth;

    this.lastDamageTime = 0;
    this.shieldHitCooldown = 0;
    this.destroyed = false;
    this.alive = true;
    this.initialized = true;

    this.crackSeed = cracksRandom.int(0, 999999);
    this.crackStage = 0;

    this.vertices = this.generateVertices();
    this.rebuildPolygonCache();

    const crackData = this.generateCrackLayers();
    this.crackLayers = crackData.layers;

    this.variantState = this.initializeVariantState();
    this.visualState = this.initializeVisualState();
    this.offscreenTimer = 0;
  }

  /**
   * Resets asteroid state for object pooling.
   * Overrides BaseEnemy.resetForPool() to add asteroid-specific resets.
   */
  resetForPool() {
    // Call parent reset
    super.resetForPool();

    // Asteroid-specific resets
    this.system = null;
    this.id = 0;
    this.size = null;
    this.variant = null;
    this.wave = 1;
    this.spawnedBy = null;
    this.generation = 0;
    this.radius = 0;
    this.variantConfig = null;
    this.crackProfileKey = 'default';
    this.fragmentProfileKey = 'default';
    this.crackProfile = null;
    this.fragmentProfile = null;
    this.behavior = null;
    this.mass = 0;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.maxHealth = 0;
    this.health = 0;
    this.lastDamageTime = 0;
    this.shieldHitCooldown = 0;
    this.destroyed = true;
    this.crackSeed = 0;
    this.crackStage = 0;
    this.vertices = [];
    this.polygonEdges = [];
    this.minSurfaceRadius = 0;
    this.crackLayers = [];
    this.variantState = {};
    this.visualState = {};
    this.spawnTime = 0;
    this.offscreenTimer = 0;
    this.random = null;
    this.randomScopes = null;
    this.randomScopeSeeds = null;
    this.spriteCache = null;
  }

  computeWaveHealthMultiplier(wave) {
    const scaling = ASTEROID_HEALTH_SCALING || {};
    const currentWave = wave || 1;

    // Waves 1-10: Original scaling with cap at 2.2x
    if (currentWave <= 10) {
      const perWave = scaling.perWave ?? 0.12;
      const maxMultiplier = scaling.maxMultiplier ?? 2.2;
      const waveIndex = Math.max(0, currentWave - 1);
      const multiplier = 1 + perWave * waveIndex;
      return Math.min(multiplier, maxMultiplier);
    }

    // Waves 11+: Infinite scaling with soft cap and hard cap
    const infiniteConfig = scaling.infiniteScaling || {};
    if (!infiniteConfig.enabled) {
      return scaling.maxMultiplier ?? 2.2;
    }

    const baseMultiplier = scaling.maxMultiplier ?? 2.2;
    const startWave = infiniteConfig.startWave ?? 11;
    const increment = infiniteConfig.perWaveIncrement ?? 0.08;
    const softCapWave = infiniteConfig.softCapWave ?? 50;
    const hardCap = infiniteConfig.maxMultiplier ?? 10.0;

    const wavesAboveStart = currentWave - startWave;

    // Before soft cap: linear scaling
    if (currentWave < softCapWave) {
      const multiplier = baseMultiplier + wavesAboveStart * increment;
      return Math.min(multiplier, hardCap);
    }

    // After soft cap: logarithmic diminishing returns
    // Formula: base + (softCapBonus) + log2(wavesAboveSoftCap) * increment
    const softCapBonus = (softCapWave - startWave) * increment;
    const wavesAboveSoftCap = currentWave - softCapWave;
    const logBonus = Math.log2(wavesAboveSoftCap + 1) * increment;
    const multiplier = baseMultiplier + softCapBonus + logBonus;

    return Math.min(multiplier, hardCap);
  }

  /**
   * The Herald of Heat sets this rock alight: it turns Volatile, its fuse
   * starting now. Returns false when it already was.
   */
  ignite() {
    if (this.variant === 'volatile') return false;
    this.variant = 'volatile';
    this.variantConfig = ASTEROID_VARIANTS.volatile;
    this.behavior = this.variantConfig.behavior;
    this.movementStrategy = this.variantConfig.movementStrategy;
    this.variantState = this.initializeVariantState();
    this.visualState = this.initializeVisualState();
    return true;
  }

  initializeVariantState() {
    if (!this.behavior) {
      return {};
    }

    if (this.behavior.type === 'volatile') {
      return {
        fuseTimer: this.behavior.fuseTime ?? 0,
        armed: false,
        exploded: false,
      };
    }

    if (this.behavior.type === 'parasite') {
      return {
        attackCooldown: 0,
      };
    }

    return {};
  }

  initializeVisualState() {
    const visual = this.variantConfig?.visual;
    if (!visual) {
      return {};
    }

    const state = {};
    const visualRandom = this.getRandomFor('visual');

    if (visual.pulse) {
      state.glowTime = visualRandom.range(0, Math.PI * 2);
    }

    if (this.behavior?.type === 'volatile' && visual.trail) {
      const baseInterval = visual.trail.interval ?? 0.05;
      state.trailCooldown = visualRandom.range(0, baseInterval);
    }

    return state;
  }

  createSeededRandom(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6d2b79f5;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  generateVertices() {
    const vertices = [];
    const seededRandom = this.createSeededRandom(this.crackSeed ^ 0x45f1);
    const numVertices = 7 + Math.floor(seededRandom() * 4);

    for (let i = 0; i < numVertices; i += 1) {
      const angle = (i / numVertices) * Math.PI * 2;
      const radiusVariation = 0.78 + seededRandom() * 0.42;
      const radius = this.radius * radiusVariation;
      vertices.push({
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }

    return vertices;
  }

  rebuildPolygonCache() {
    if (!Array.isArray(this.vertices) || this.vertices.length < 3) {
      this.polygonEdges = [];
      this.minSurfaceRadius = this.radius;
      return;
    }

    const edges = [];
    for (let i = 0; i < this.vertices.length; i += 1) {
      const current = this.vertices[i];
      const next = this.vertices[(i + 1) % this.vertices.length];
      edges.push({
        ax: current.x,
        ay: current.y,
        bx: next.x,
        by: next.y,
        dx: next.x - current.x,
        dy: next.y - current.y,
      });
    }

    this.polygonEdges = edges;
    this.minSurfaceRadius = CrackGenerationService.computeMinSurfaceRadius(
      this.polygonEdges,
      this.radius,
      this.vertices
    );
  }

  generateCrackLayers() {
    const crackRandomSeed = this.crackSeed ^ 0x9e3779;
    const crackRng = this.createSeededRandom(crackRandomSeed);

    const context = {
      vertices: this.vertices,
      polygonEdges: this.polygonEdges,
      radius: this.radius,
      minSurfaceRadius: this.minSurfaceRadius,
      crackSeed: this.crackSeed,
      randomSeed: crackRandomSeed,
      rng: crackRng,
      crackProfileKey: this.crackProfileKey,
      id: this.id,
      generation: this.generation,
    };

    return CrackGenerationService.generateCrackLayers(
      context,
      this.crackProfile
    );
  }

  updateVisualState(deltaTime) {
    if (!this.variantConfig?.visual) {
      return;
    }

    if (!this.visualState) {
      this.visualState = {};
    }

    const pulse = this.variantConfig.visual.pulse;
    if (pulse) {
      if (typeof this.visualState.glowTime !== 'number') {
        this.visualState.glowTime = this.getRandomFor('visual').range(
          0,
          Math.PI * 2
        );
      }

      const speed = Math.max(0, pulse.speed ?? 1);
      if (speed > 0) {
        const angularSpeed = speed * Math.PI * 2;
        this.visualState.glowTime += deltaTime * angularSpeed;

        if (this.visualState.glowTime > Math.PI * 512) {
          this.visualState.glowTime -= Math.PI * 512;
        }
      }
    }
  }

  /**
   * Updates asteroid state.
   * Overrides BaseEnemy.update() to add asteroid-specific behavior.
   */
  update(deltaTime) {
    if (this.destroyed) {
      return;
    }

    // Check if using external movement component
    const useExternalMovement =
      this.system?.useComponents && this.system?.movementComponent;

    // Always update visual state
    this.updateVisualState(deltaTime);

    // Behavior updates (non-movement)
    if (this.behavior?.type === 'volatile') {
      this.updateVolatileBehavior(deltaTime);
    }

    // Movement - only if NOT using component
    if (!useExternalMovement) {
      // Parasite behavior (movement + attack)
      if (this.behavior?.type === 'parasite') {
        this.updateParasiteBehavior(deltaTime);
      }

      // Linear movement
      this.x += this.vx * deltaTime;
      this.y += this.vy * deltaTime;
      this.rotation += this.rotationSpeed * deltaTime;

      // Screen wrapping
      const margin = this.radius;
      if (this.x < -margin) this.x = GAME_WIDTH + margin;
      if (this.x > GAME_WIDTH + margin) this.x = -margin;
      if (this.y < -margin) this.y = GAME_HEIGHT + margin;
      if (this.y > GAME_HEIGHT + margin) this.y = -margin;
    }

    // Timers (always update)
    if (this.lastDamageTime > 0) {
      this.lastDamageTime = Math.max(0, this.lastDamageTime - deltaTime);
    }

    if (this.shieldHitCooldown > 0) {
      this.shieldHitCooldown = Math.max(0, this.shieldHitCooldown - deltaTime);
    }
  }

  updateVolatileBehavior(deltaTime) {
    if (!this.variantState) {
      this.variantState = {};
    }

    if (typeof this.variantState.fuseTimer !== 'number') {
      return;
    }

    this.variantState.fuseTimer -= deltaTime;

    if (!this.variantState.exploded) {
      this.maybeEmitVolatileTrail(deltaTime);
    }

    if (
      !this.variantState.armed &&
      typeof this.behavior?.armTime === 'number' &&
      this.variantState.fuseTimer <= this.behavior.armTime
    ) {
      this.variantState.armed = true;
      const eventBus = this.getEventBus();
      if (eventBus?.emit) {
        eventBus.emit('asteroid-volatile-armed', {
          asteroid: this,
          position: { x: this.x, y: this.y },
        });
      }
    }

    if (this.variantState.fuseTimer <= 0 && !this.variantState.exploded) {
      this.variantState.exploded = true;
      if (
        this.system &&
        typeof this.system.handleVolatileTimeout === 'function'
      ) {
        this.system.handleVolatileTimeout(this);
      }
    }
  }

  getVolatileFuseProgress() {
    if (this.behavior?.type !== 'volatile') {
      return 0;
    }

    const fuseTime = this.behavior?.fuseTime ?? 0;
    if (!Number.isFinite(fuseTime) || fuseTime <= 0) {
      return 1;
    }

    const remaining = Number.isFinite(this.variantState?.fuseTimer)
      ? Math.max(0, this.variantState.fuseTimer)
      : fuseTime;
    const normalized = 1 - remaining / fuseTime;
    return Math.max(0, Math.min(1, normalized));
  }

  maybeEmitVolatileTrail(deltaTime) {
    if (this.behavior?.type !== 'volatile') {
      return;
    }

    if (this.variantState?.exploded) {
      return;
    }

    const visual = this.variantConfig?.visual;
    const trail = visual?.trail;
    if (!trail) {
      return;
    }

    if (!this.visualState) {
      this.visualState = {};
    }

    if (typeof this.visualState.trailCooldown !== 'number') {
      this.visualState.trailCooldown = 0;
    }

    const fuseProgress = this.getVolatileFuseProgress();
    const baseInterval = trail.interval ?? 0.05;
    const minInterval = Math.max(0.005, trail.minimumInterval ?? baseInterval);
    const acceleration = Math.max(0, trail.accelerationFactor ?? 0);
    const desiredInterval = Math.max(
      minInterval,
      baseInterval * (1 - acceleration * fuseProgress)
    );

    this.visualState.trailCooldown -= deltaTime;
    const bursts = Math.min(
      3,
      Math.max(1, Math.ceil(deltaTime / desiredInterval))
    );
    let emitted = 0;

    while (this.visualState.trailCooldown <= 0 && emitted < bursts) {
      this.visualState.trailCooldown += desiredInterval;
      emitted += 1;

      const eventBus = this.getEventBus();
      if (eventBus?.emit) {
        eventBus.emit('asteroid-volatile-trail', {
          asteroidId: this.id,
          position: { x: this.x, y: this.y },
          velocity: { x: this.vx, y: this.vy },
          config: trail,
          armed: !!this.variantState?.armed,
          fuseProgress,
          intensity: Math.min(
            1,
            0.35 + fuseProgress * 0.55 + (this.variantState?.armed ? 0.2 : 0)
          ),
        });
      }
    }
  }

  updateParasiteBehavior(deltaTime) {
    const behavior = this.behavior;
    if (!behavior) return;

    const player =
      this.system && typeof this.system.getCachedPlayer === 'function'
        ? this.system.getCachedPlayer()
        : null;

    if (!player || !player.position) {
      return;
    }

    const dx = player.position.x - this.x;
    const dy = player.position.y - this.y;
    const distance = Math.hypot(dx, dy) || 0.0001;
    const dirX = dx / distance;
    const dirY = dy / distance;

    const acceleration = behavior.acceleration ?? 0;
    this.vx += dirX * acceleration * deltaTime;
    this.vy += dirY * acceleration * deltaTime;

    const maxSpeed = behavior.maxSpeed ?? Infinity;
    const currentSpeed = Math.hypot(this.vx, this.vy);
    if (currentSpeed > maxSpeed) {
      const scale = maxSpeed / currentSpeed;
      this.vx *= scale;
      this.vy *= scale;
    }

    const minDistance = behavior.minDistance ?? 0;
    if (distance < minDistance) {
      const repelStrength = (minDistance - distance) / Math.max(minDistance, 1);
      this.vx -= dirX * acceleration * repelStrength * deltaTime * 1.2;
      this.vy -= dirY * acceleration * repelStrength * deltaTime * 1.2;
    }

    // Handle attack logic via separate method (works with both internal and external movement)
    this.updateParasiteAttack(deltaTime);
  }

  /**
   * Updates parasite attack behavior (cooldown + contact damage)
   * Separated from movement logic to work with external movement components
   * @param {number} deltaTime - Time elapsed since last frame
   */
  updateParasiteAttack(deltaTime) {
    if (this.behavior?.type !== 'parasite') return;

    const player =
      this.system && typeof this.system.getCachedPlayer === 'function'
        ? this.system.getCachedPlayer()
        : this.system?.getPlayer?.();

    if (!player) return;

    // Initialize attack cooldown if needed
    if (!this.variantState) {
      this.variantState = {};
    }
    if (this.variantState.attackCooldown === undefined) {
      this.variantState.attackCooldown = 0;
    }

    // Update cooldown timer
    if (this.variantState.attackCooldown > 0) {
      this.variantState.attackCooldown -= deltaTime;
    }

    // Calculate distance to player
    const playerPos = player.position || player;
    const dx = playerPos.x - this.x;
    const dy = playerPos.y - this.y;
    const distance = Math.hypot(dx, dy) || 0.0001;

    // Attack range from behavior config (default 25)
    const playerRadius =
      typeof player.getHullBoundingRadius === 'function'
        ? player.getHullBoundingRadius()
        : SHIP_SIZE;
    const attackRange =
      (this.behavior.minDistance || 25) + this.radius + playerRadius + 6;
    const cooldown = this.behavior.cooldown || 1.2;

    // Execute contact attack if in range and off cooldown
    if (distance <= attackRange && this.variantState.attackCooldown <= 0) {
      if (
        this.system &&
        typeof this.system.applyDirectDamageToPlayer === 'function'
      ) {
        const damage = this.behavior.contactDamage || 20;
        const result = this.system.applyDirectDamageToPlayer(damage, {
          cause: 'parasite',
          position: { x: this.x, y: this.y },
          source: this,
        });

        if (result?.applied) {
          this.variantState.attackCooldown = cooldown;
        }
      }
    }
  }

  updateCrackStage() {
    const thresholds = ASTEROID_CRACK_THRESHOLDS || [];
    if (!thresholds.length || this.maxHealth <= 0) {
      return;
    }

    const ratio = this.health / this.maxHealth;
    let newStage = 0;

    for (let i = 0; i < thresholds.length; i += 1) {
      if (ratio <= thresholds[i]) {
        newStage = i + 1;
      }
    }

    if (newStage !== this.crackStage) {
      this.crackStage = newStage;
      const eventBus = this.getEventBus();
      if (eventBus?.emit) {
        const layer = this.crackLayers[this.crackStage - 1] || null;
        const segmentList = Array.isArray(layer?.segments)
          ? layer.segments.map((segment) => {
              if (!segment) {
                return null;
              }

              const startX = Number.isFinite(segment.x1)
                ? segment.x1
                : Number.isFinite(segment.start?.x)
                  ? segment.start.x
                  : 0;
              const startY = Number.isFinite(segment.y1)
                ? segment.y1
                : Number.isFinite(segment.start?.y)
                  ? segment.start.y
                  : 0;
              const endX = Number.isFinite(segment.x2)
                ? segment.x2
                : Number.isFinite(segment.end?.x)
                  ? segment.end.x
                  : 0;
              const endY = Number.isFinite(segment.y2)
                ? segment.y2
                : Number.isFinite(segment.end?.y)
                  ? segment.end.y
                  : 0;
              const length = Number.isFinite(segment.length)
                ? segment.length
                : Math.hypot(endX - startX, endY - startY);

              return {
                id: segment.id || null,
                parentId: segment.parentId ?? null,
                rootId: segment.rootId ?? null,
                stage: segment.stage ?? this.crackStage,
                type: segment.type || 'line',
                width: Number.isFinite(segment.width) ? segment.width : 1,
                length,
                start: { x: startX, y: startY },
                end: { x: endX, y: endY },
              };
            })
          : [];

        const seenSegmentKeys = new Set();
        const sanitizedSegments = [];

        segmentList.forEach((segment) => {
          if (!segment) {
            return;
          }

          const startX = Number.isFinite(segment.start?.x)
            ? segment.start.x
            : 0;
          const startY = Number.isFinite(segment.start?.y)
            ? segment.start.y
            : 0;
          const endX = Number.isFinite(segment.end?.x) ? segment.end.x : 0;
          const endY = Number.isFinite(segment.end?.y) ? segment.end.y : 0;
          const type = segment.type || 'line';
          const key = [
            segment.id ?? 'no-id',
            startX.toFixed(4),
            startY.toFixed(4),
            endX.toFixed(4),
            endY.toFixed(4),
            type,
          ].join(':');

          if (seenSegmentKeys.has(key)) {
            return;
          }

          seenSegmentKeys.add(key);
          sanitizedSegments.push(segment);
        });

        const sanitizedSegmentIds = [];
        const seenSegmentIds = new Set();

        sanitizedSegments.forEach((segment) => {
          if (!segment?.id) {
            return;
          }

          if (seenSegmentIds.has(segment.id)) {
            return;
          }

          seenSegmentIds.add(segment.id);
          sanitizedSegmentIds.push(segment.id);
        });

        if (layer) {
          layer.segmentIds = sanitizedSegmentIds;
        }

        eventBus.emit('asteroid-crack-stage-changed', {
          asteroidId: this.id,
          layerId: layer?.id ?? null,
          profile: this.crackProfileKey,
          stage: this.crackStage,
          intensity: layer?.intensity ?? this.crackStage,
          burst: layer?.burst ?? null,
          ratio,
          variant: this.variant,
          size: this.size,
          position: { x: this.x, y: this.y },
          radius: this.radius,
          velocity: { x: this.vx, y: this.vy },
          rotation: this.rotation,
          segmentIds: sanitizedSegmentIds,
          segments: sanitizedSegments,
        });
      }
    }
  }

  /**
   * Applies damage to the asteroid.
   * Overrides BaseEnemy.takeDamage() to add crack stage tracking.
   */
  takeDamage(damage) {
    if (this.destroyed) {
      return false;
    }

    const appliedDamage = Math.max(0, damage);
    if (appliedDamage <= 0) {
      return false;
    }

    this.health = Math.max(0, this.health - appliedDamage);
    this.lastDamageTime = 0.12;
    this.markHit();
    this.updateCrackStage();
    return this.health <= 0;
  }

  getVariantColors() {
    const fallback = {
      fill: PALETTE.rock,
      stroke: PALETTE.rockShadow,
      cracks: PALETTE.shot,
    };

    const colors = this.variantConfig?.colors;
    if (!colors) {
      return fallback;
    }

    return {
      fill: colors.fill || fallback.fill,
      stroke: colors.stroke || fallback.stroke,
      cracks: colors.cracks || fallback.cracks,
      glow: colors.glow,
      innerGlow: colors.innerGlow,
      pulse: colors.pulse,
      tint: colors.tint,
      veins: colors.veins,
      rim: colors.rim,
    };
  }

  invalidateCache() {
    this.spriteCache = null;
  }

  /**
   * Bakes the Ring fragment (docs/NORTE.md §3): matte faceted stone lit by the
   * key light, crater pits, a dark 1 px edge, and cracks/veins as amber light.
   * Two canvases: `canvas` (the stone, cracks included) and `glow` (only the
   * light sources, drawn into the bloom layer every frame). Baked in local
   * space and rotated at draw time, so the key light turns with the rock —
   * accepted at this size.
   */
  ensureSpriteCache() {
    const scale = getRenderScale();
    const key = `${this.variant}|${this.size}|${this.crackStage}|${scale}`;
    if (this.spriteCache && this.spriteCache.key === key) {
      return this.spriteCache;
    }

    const padding = 10;
    const size = Math.ceil((this.radius + padding) * 2);
    const offset = size / 2;
    const makeLayer = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(size * scale);
      canvas.height = Math.ceil(size * scale);
      const layerCtx = canvas.getContext('2d');
      if (!layerCtx) return null;
      layerCtx.scale(scale, scale);
      layerCtx.translate(offset, offset);
      return { canvas, ctx: layerCtx };
    };

    const body = makeLayer();
    if (!body) return null;
    const colors = this.getVariantColors();
    const lights = this.collectLightStrokes(colors);
    const glow = lights.length > 0 || colors.rim ? makeLayer() : null;

    this.bakeStone(body.ctx, colors, scale);
    this.bakeLights(body.ctx, glow?.ctx ?? null, colors, lights, scale);

    this.spriteCache = {
      key,
      canvas: body.canvas,
      glow: glow?.canvas ?? null,
      offset,
      size,
      scale,
    };
    return this.spriteCache;
  }

  traceOutline(ctx) {
    ctx.beginPath();
    this.vertices.forEach((v, i) => {
      if (i === 0) ctx.moveTo(v.x, v.y);
      else ctx.lineTo(v.x, v.y);
    });
    ctx.closePath();
  }

  bakeStone(ctx, colors, scale) {
    const vertices = this.vertices;
    if (!Array.isArray(vertices) || vertices.length < 3) return;
    const r = this.radius;
    const rand = this.createSeededRandom(this.crackSeed ^ 0x51ed27);
    const translucent = Boolean(colors.rim);
    const base = colors.tint
      ? this.mixColor(colors.fill, colors.tint, 0.18)
      : colors.fill;
    const tone = (shade) =>
      shade >= 0
        ? this.mixColor(base, PALETTE.rockLit, Math.min(1, shade * 0.75))
        : this.mixColor(base, PALETTE.rockShadow, Math.min(1, -shade * 0.85));

    // Facet planes: the outline split into 3–6 fans around a jittered center.
    const n = vertices.length;
    const cx = (rand() - 0.5) * r * 0.3;
    const cy = (rand() - 0.5) * r * 0.3;
    const facetCount = Math.min(n, 3 + Math.floor(rand() * 4));
    const start = Math.floor(rand() * n);
    const cuts = [];
    for (let i = 0; i < facetCount; i += 1) {
      const jitter = i === 0 ? 0 : Math.round((rand() - 0.5) * 0.8);
      cuts.push((start + Math.round((i * n) / facetCount) + jitter + n) % n);
    }

    ctx.save();
    this.traceOutline(ctx);
    ctx.clip();
    ctx.globalAlpha = translucent ? 0.55 : 1;
    for (let i = 0; i < facetCount; i += 1) {
      const from = cuts[i];
      const to = cuts[(i + 1) % facetCount];
      const span = (to - from + n) % n || n;
      let sx = 0;
      let sy = 0;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      for (let k = 0; k <= span; k += 1) {
        const v = vertices[(from + k) % n];
        ctx.lineTo(v.x, v.y);
        sx += v.x;
        sy += v.y;
      }
      ctx.closePath();
      const len = Math.hypot(sx, sy) || 1;
      const facing =
        (sx / len) * KEY_LIGHT_DIR.x + (sy / len) * KEY_LIGHT_DIR.y;
      ctx.fillStyle = tone(facing * 0.8 + (rand() - 0.5) * 0.3);
      ctx.fill();
      ctx.strokeStyle = translucent
        ? withAlpha(colors.rim, 0.3)
        : withAlpha(PALETTE.rockShadow, 0.45);
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }

    // Volume: lit toward the key light, falling into shadow opposite.
    const light = ctx.createRadialGradient(
      KEY_LIGHT_DIR.x * r * 0.4,
      KEY_LIGHT_DIR.y * r * 0.4,
      0,
      KEY_LIGHT_DIR.x * r * 0.2,
      KEY_LIGHT_DIR.y * r * 0.2,
      r * 1.25
    );
    light.addColorStop(0, withAlpha(PALETTE.rockLit, 0.22));
    light.addColorStop(0.5, withAlpha(PALETTE.rockShadow, 0));
    light.addColorStop(1, withAlpha(PALETTE.rockShadow, 0.75));
    ctx.globalAlpha = 1;
    ctx.fillStyle = light;
    ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);

    // Cool fill light bouncing from below-right.
    const fill = ctx.createLinearGradient(
      KEY_LIGHT_DIR.x * r * 0.1,
      KEY_LIGHT_DIR.y * r * 0.1,
      -KEY_LIGHT_DIR.x * r,
      -KEY_LIGHT_DIR.y * r
    );
    fill.addColorStop(0.45, withAlpha(PALETTE.background, 0));
    fill.addColorStop(1, FILL_LIGHT);
    ctx.fillStyle = fill;
    ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);

    // Crater pits: dark ellipse, thin lit lip on the key side.
    const surface = r * 0.78;
    const sizeRatio = Math.max(0, Math.min(1, (r - 12) / 23));
    const craters = Math.round(10 + 15 * sizeRatio);
    for (let i = 0; i < craters; i += 1) {
      const angle = rand() * Math.PI * 2;
      const dist = Math.sqrt(rand()) * surface * 0.88;
      const pitRadius = Math.max(0.7, r * (0.03 + rand() * 0.08));
      const squash = 1 - (dist / r) * 0.45;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      ctx.beginPath();
      ctx.ellipse(x, y, pitRadius * squash, pitRadius, angle, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(PALETTE.rockShadow, 0.6);
      ctx.fill();
      const lip = KEY_LIGHT_ANGLE - angle;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        pitRadius * squash,
        pitRadius,
        angle,
        lip - 1.1,
        lip + 1.1
      );
      ctx.strokeStyle = withAlpha(PALETTE.rockLit, 0.45);
      ctx.lineWidth = Math.min(0.8, pitRadius * 0.45);
      ctx.stroke();
    }

    // Edges facing the key light catch it.
    for (let i = 0; i < n; i += 1) {
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = (b.y - a.y) / len;
      const ny = -(b.x - a.x) / len;
      const facing = nx * KEY_LIGHT_DIR.x + ny * KEY_LIGHT_DIR.y;
      if (facing <= 0.15) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = withAlpha(PALETTE.rockLit, 0.55 * facing);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    this.traceOutline(ctx);
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = LINE.hair;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (translucent) {
      ctx.save();
      ctx.shadowBlur = 3 * scale;
      ctx.shadowColor = withAlpha(colors.rim, 0.6);
      ctx.strokeStyle = withAlpha(colors.rim, 0.55);
      ctx.lineWidth = LINE.hair;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Crack segments up to the current stage, plus variant veins. */
  collectLightStrokes(colors) {
    const strokes = [];
    if (colors.veins) {
      const rand = this.createSeededRandom(this.crackSeed ^ 0x7e1a5);
      const reach = Math.max(this.radius * 0.5, this.minSurfaceRadius || 0);
      const veinCount = 2 + Math.floor(rand() * 3);
      for (let v = 0; v < veinCount; v += 1) {
        let angle = rand() * Math.PI * 2;
        let dist = reach * (0.05 + rand() * 0.2);
        let x = Math.cos(angle) * dist;
        let y = Math.sin(angle) * dist;
        const steps = 3 + Math.floor(rand() * 3);
        for (let s = 0; s < steps; s += 1) {
          dist = Math.min(reach * 0.85, dist + reach * (0.15 + rand() * 0.12));
          angle += (rand() - 0.5) * 0.7;
          const nx = Math.cos(angle) * dist;
          const ny = Math.sin(angle) * dist;
          strokes.push({ x1: x, y1: y, x2: nx, y2: ny, width: 1.1 - s * 0.12 });
          x = nx;
          y = ny;
        }
      }
    }

    for (let stage = 0; stage < this.crackStage; stage += 1) {
      const layer = this.crackLayers[stage];
      const segments = layer?.segments || layer?.lines || [];
      segments.forEach((line) => {
        strokes.push({
          x1: line.x1 ?? line.start?.x ?? 0,
          y1: line.y1 ?? line.start?.y ?? 0,
          x2: line.x2 ?? line.end?.x ?? 0,
          y2: line.y2 ?? line.end?.y ?? 0,
          width: Number.isFinite(line.width) ? line.width : 1,
        });
      });
    }
    return strokes;
  }

  bakeLights(ctx, glowCtx, colors, strokes, scale) {
    const light = colors.veins || colors.cracks;
    const core = this.mixColor(light, PALETTE.text, 0.45);
    const strokeAll = (target, color, widthScale, minWidth) => {
      target.strokeStyle = color;
      for (const s of strokes) {
        target.lineWidth = Math.max(minWidth, s.width * widthScale);
        target.beginPath();
        target.moveTo(s.x1, s.y1);
        target.lineTo(s.x2, s.y2);
        target.stroke();
      }
    };

    // cracks are light inside the stone: keep them within the silhouette
    if (strokes.length > 0) {
      ctx.save();
      this.traceOutline(ctx);
      ctx.clip();
      ctx.lineCap = 'round';
      ctx.shadowBlur = 5 * scale;
      ctx.shadowColor = light;
      strokeAll(ctx, withAlpha(light, 0.75), 0.7, 0.7);
      ctx.shadowBlur = 0;
      strokeAll(ctx, core, 0.35, 0.4);
      ctx.restore();
    }

    if (!glowCtx) return;
    glowCtx.save();
    this.traceOutline(glowCtx);
    glowCtx.clip();
    glowCtx.lineCap = 'round';
    strokeAll(glowCtx, light, 1.2, 1);
    glowCtx.restore();
    if (colors.rim) {
      this.traceOutline(glowCtx);
      glowCtx.strokeStyle = withAlpha(colors.rim, 0.45);
      glowCtx.lineWidth = LINE.hair;
      glowCtx.stroke();
    }
  }

  /** Light intensity (0..~1.6) for veins and cracks this frame. */
  getLightIntensity() {
    const pulse = this.variantConfig?.visual?.pulse;
    if (!pulse) return 1;
    const wave = 0.5 + 0.5 * Math.sin(this.visualState?.glowTime ?? 0);
    const amount = Math.max(0, Math.min(1, pulse.amount ?? 0.4));
    let intensity = 1 - amount + amount * wave;
    if (this.behavior?.type === 'volatile') {
      intensity *= 1 + (pulse.fuseBoost ?? 0) * this.getVolatileFuseProgress();
      if (this.variantState?.armed) {
        intensity *= 1 + (pulse.armedBoost ?? 0);
      }
    }
    return intensity;
  }

  /**
   * Renders the asteroid.
   * Overrides BaseEnemy.draw() to provide asteroid-specific rendering.
   */
  draw(ctx) {
    if (!ctx) return;

    const sprite = this.ensureSpriteCache();
    if (!sprite) return;

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);
    ctx.drawImage(
      sprite.canvas,
      -sprite.offset,
      -sprite.offset,
      sprite.size,
      sprite.size
    );

    const pulsing = Boolean(this.variantConfig?.visual?.pulse);
    const intensity = this.getLightIntensity();
    if (sprite.glow && pulsing) {
      // the pulse lives in the light, not in a re-bake
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, Math.max(0, (intensity - 0.4) * 0.6));
      ctx.drawImage(
        sprite.glow,
        -sprite.offset,
        -sprite.offset,
        sprite.size,
        sprite.size
      );
    }

    const flash = this.getHitFlash();
    const blitFlash = (target, alpha) => {
      sprite.flash ??= whiteSilhouette(sprite.canvas);
      if (!sprite.flash) return;
      target.globalCompositeOperation = 'source-over';
      target.globalAlpha = alpha * flash;
      target.drawImage(
        sprite.flash,
        -sprite.offset,
        -sprite.offset,
        sprite.size,
        sprite.size
      );
    };
    if (flash > 0) blitFlash(ctx, HIT_FLASH_BODY_ALPHA);

    const blink =
      this.behavior?.type === 'volatile' &&
      this.variantState?.armed &&
      Math.sin(Date.now() * 0.02) > 0;
    if (blink) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      this.traceOutline(ctx);
      ctx.strokeStyle = PALETTE.threat;
      ctx.lineWidth = LINE.thin;
      ctx.stroke();
    }
    ctx.restore();

    const emissive = getEmissive();
    if (!emissive || (!sprite.glow && !blink && flash <= 0)) return;
    emissive.save();
    emissive.translate(this.x, this.y);
    emissive.rotate(this.rotation);
    if (sprite.glow) {
      emissive.globalAlpha = Math.min(1, intensity);
      emissive.drawImage(
        sprite.glow,
        -sprite.offset,
        -sprite.offset,
        sprite.size,
        sprite.size
      );
    }
    if (flash > 0) blitFlash(emissive, HIT_FLASH_EMISSIVE_ALPHA);
    if (blink) {
      emissive.globalAlpha = 1;
      this.traceOutline(emissive);
      emissive.strokeStyle = PALETTE.threat;
      emissive.lineWidth = LINE.base;
      emissive.stroke();
    }
    emissive.restore();
  }

  parseColor(color) {
    if (typeof color !== 'string') {
      return { r: 255, g: 255, b: 255 };
    }

    if (color.startsWith('#')) {
      let hex = color.slice(1);
      if (hex.length === 3) {
        hex = hex
          .split('')
          .map((c) => c + c)
          .join('');
      }
      if (hex.length === 6) {
        const bigint = Number.parseInt(hex, 16);
        return {
          r: (bigint >> 16) & 255,
          g: (bigint >> 8) & 255,
          b: bigint & 255,
        };
      }
    }

    const rgbaMatch = color.match(/rgba?\s*\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgbaMatch) {
      return {
        r: Number.parseInt(rgbaMatch[1], 10) || 255,
        g: Number.parseInt(rgbaMatch[2], 10) || 255,
        b: Number.parseInt(rgbaMatch[3], 10) || 255,
      };
    }

    return { r: 255, g: 255, b: 255 };
  }

  mixColor(baseColor, overlayColor, factor) {
    if (factor <= 0) return baseColor;
    if (factor >= 1) return overlayColor;

    const base = this.parseColor(baseColor);
    const overlay = this.parseColor(overlayColor);

    const mix = (component) =>
      Math.round(
        base[component] + (overlay[component] - base[component]) * factor
      );

    return `rgb(${mix('r')}, ${mix('g')}, ${mix('b')})`;
  }

  generateFragments() {
    return FragmentationSystem.generateFragments(this, this.fragmentProfile);
  }

  captureRandomScopeSeed(scope, generator) {
    if (!generator || typeof generator.seed !== 'number') {
      return;
    }

    if (!this.randomScopeSeeds) {
      this.randomScopeSeeds = {};
    }

    this.randomScopeSeeds[scope] = generator.seed >>> 0;
  }

  captureRandomScopeSeeds(scopes = this.randomScopes) {
    if (!scopes) {
      return;
    }

    Object.entries(scopes).forEach(([scope, generator]) => {
      if (scope === 'core') {
        return;
      }
      this.captureRandomScopeSeed(scope, generator);
    });
  }

  reseedRandomScopes() {
    if (!this.randomScopes || !this.randomScopeSeeds) {
      return;
    }

    Object.entries(this.randomScopes).forEach(([scope, generator]) => {
      if (
        scope === 'core' ||
        !generator ||
        typeof generator.reset !== 'function'
      ) {
        return;
      }

      const storedSeed = this.randomScopeSeeds?.[scope];
      if (storedSeed !== undefined) {
        generator.reset(storedSeed);
      }
    });
  }
}
