/**
 * Base Enemy Class
 *
 * Provides a common interface and shared functionality for all enemy types.
 * This enables extensibility - new enemy types (drones, turrets, bosses) can
 * be added by extending this class and implementing the required methods.
 *
 * Design Patterns:
 * - Template Method: Defines lifecycle structure
 * - Composition: Components for rendering, movement, etc.
 * - Object Pool: resetForPool() support
 *
 * @example
 * ```javascript
 * class Drone extends BaseEnemy {
 *   constructor(system, config) {
 *     super(system, config);
 *     this.type = 'drone';
 *   }
 *
 *   update(deltaTime) {
 *     // Drone-specific update logic
 *   }
 * }
 * ```
 */

import {
  ENEMY_EFFECT_COLORS,
  ENEMY_RENDER_PRESETS,
} from '../../../data/constants/visual.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';
import { resolveEventBus } from '../../../core/serviceUtils.js';
import RandomService from '../../../core/RandomService.js';
import { ELITE_AFFIXES } from '../../../data/enemies/affixes.js';
import {
  absorbFrontalHit,
  faceTarget,
  hitsFrontalShield,
} from './frontalShield.js';

// docs/NORTE.md §2: a white flash on any damage. PROPOSAL 17/10 (was none).
export const HIT_FLASH_SECONDS = 0.06;
// Bigger hits hold the flash longer: × damage / reference, up to the cap
// (PLAN.md R5.9, proposta 18/10).
export const HIT_FLASH_REFERENCE_DAMAGE = 20;
export const HIT_FLASH_MAX_STRETCH = 2.5;

let fallbackEnemyIdSequence = 0;

export class BaseEnemy {
  /**
   * Creates a base enemy instance.
   *
   * @param {Object} system - Reference to parent EnemySystem
   */
  constructor(system) {
    // System reference
    this.system = system;

    // Identity
    this.id = null;
    this.type = 'base'; // Override in subclasses: 'asteroid', 'drone', 'turret', 'boss'

    // Core state
    this.alive = false;
    this.initialized = false;

    // Position & velocity
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    // Physical properties
    this.radius = 0;
    this.mass = 1;

    // Health & damage
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    // Seconds left frozen (Solar Flare): EnemyUpdateSystem skips the update.
    this.stunTimer = 0;

    // Lifecycle
    this.age = 0; // Time since spawn
    this.wave = 0; // Wave number
    this.generation = 0; // For fragments

    // Rendering
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.visible = true;
    this.lastHitTime = -Infinity; // performance.now() of the last damage taken
    this.hitFlashSeconds = HIT_FLASH_SECONDS;

    // Components (to be set by subclasses)
    this.components = new Map();
    this.componentState = {};
    this._componentsInvoked = false;
    this.useComponents = false;

    // Metadata
    this.tags = new Set(); // For categorization: 'boss', 'minion', 'volatile'
    this.spawnedBy = null; // Parent enemy reference

    // Elite affixes (src/data/enemies/affixes.js), set by EnemyFactory.
    this.resetAffixes([]);
  }

  /** Affix ids and their live state; every factory spawn sets them anew. */
  resetAffixes(affixes) {
    this.affixes = affixes;
    this.wardedUntil = -Infinity; // age until which Warded takes no damage
    this.volatileFuse = null; // seconds left once Volatile's fuse is lit
    this.volatileSpent = false;
    this.splitSpent = false;
    this.blastSpent = false;
  }

  hasAffix(id) {
    return this.affixes.includes(id);
  }

  /**
   * Initializes the enemy with configuration.
   * Called after construction or when reusing from pool.
   *
   * @param {Object} config - Configuration object
   */
  initialize(config = {}) {
    this.id = config.id || this.generateId();
    this.wave = config.wave || 1;
    this.generation = config.generation || 0;
    this.spawnedBy = config.spawnedBy || null;

    // Position
    this.x = config.x || 0;
    this.y = config.y || 0;
    this.vx = config.vx || 0;
    this.vy = config.vy || 0;

    // State
    this.alive = true;
    this.initialized = true;
    this.age = 0;
    this.lastHitTime = -Infinity;
    this.stunTimer = 0;

    // Rotation
    this.rotation = config.rotation || 0;
    this.rotationSpeed = config.rotationSpeed || 0;
  }

  /**
   * Updates the enemy state.
   * Template method - subclasses should override.
   *
   * @param {number} deltaTime - Time elapsed since last update
   */
  update(deltaTime) {
    if (!this.alive || !this.initialized) return;

    this.age += deltaTime;

    const hasMovementComponent =
      this.useComponents && this.hasComponent('movement');

    // Update position only when no movement component is responsible for integration
    if (!hasMovementComponent) {
      this.x += this.vx * deltaTime;
      this.y += this.vy * deltaTime;
    }

    // Update rotation
    this.rotation += this.rotationSpeed * deltaTime;

    const context = this.buildComponentContext(deltaTime);
    this._componentsInvoked = true;
    this.runComponentUpdate(context);

    // Subclass hook
    this.onUpdate(deltaTime);
    this._componentsInvoked = false;

    if (this.affixes.length) this.updateAffixes(deltaTime);
  }

  /** Shielded turns its plate to the player; a lit Volatile fuse burns down. */
  updateAffixes(deltaTime) {
    if (this.hasAffix('shielded')) faceTarget(this);
    if (this.volatileFuse === null) return;
    this.volatileFuse -= deltaTime;
    if (this.volatileFuse > 0) return;
    // The kill takes the normal path; onDestroyed sets off the blast.
    this.volatileFuse = null;
    this.volatileSpent = true;
    this.wardedUntil = -Infinity;
    const lethal = this.health + (this.armor || 0) + (this.shields || 0) + 1;
    this.system.applyDamage(this, lethal, { cause: 'volatile-fuse' });
  }

  /** Warded's window is open, or the Volatile fuse is burning. */
  isDamageBlocked() {
    return this.volatileFuse !== null || this.age < this.wardedUntil;
  }

  /**
   * Damage left after the affixes: none while Warded or while the Volatile
   * fuse burns; the Shielded plate drains first on frontal hits; a lethal hit
   * on a Volatile lights its fuse instead of killing.
   */
  affixDamage(amount, source) {
    const hit = source?.hitPosition;
    if (this.isDamageBlocked()) {
      if (hit && this.volatileFuse === null) {
        const angle = Math.atan2(hit.y - this.y, hit.x - this.x);
        this.getEventBus()?.emit?.('shield-deflected', {
          position: { x: hit.x, y: hit.y },
          normal: { x: Math.cos(angle), y: Math.sin(angle) },
          level: 0,
          intensity: 0.5,
        });
      }
      return 0;
    }
    let left = amount;
    if (
      this.hasAffix('shielded') &&
      hitsFrontalShield(this, hit, ELITE_AFFIXES.shielded.halfArc)
    ) {
      left = absorbFrontalHit(this, left, hit);
    }
    if (
      left > 0 &&
      this.hasAffix('volatile') &&
      !this.volatileSpent &&
      left - (this.armor || 0) - (this.shields || 0) >= this.health
    ) {
      this.volatileFuse = ELITE_AFFIXES.volatile.fuse;
      this.markHit(left);
      this.getEventBus()?.emit?.('asteroid-volatile-armed', {
        asteroid: this,
        position: { x: this.x, y: this.y },
      });
      return 0;
    }
    return left;
  }

  /**
   * Hook for subclass-specific update logic.
   * Override this instead of update() to preserve base behavior.
   *
   * @param {number} deltaTime - Time elapsed
   */
  onUpdate() {
    // Override in subclasses
  }

  /**
   * Renders the enemy.
   * Template method - subclasses should override.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  draw(ctx) {
    if (!this.alive || !this.visible) return;

    // Delegate to render component if available
    const renderComponent = this.components.get('render');
    if (renderComponent && renderComponent.draw) {
      const renderContext = {
        enemy: this,
        ctx,
        colors: this.getColors(),
        presets: this.getPresets(),
        system: this.system,
      };

      if (renderComponent.draw.length <= 1) {
        renderComponent.draw(renderContext);
      } else {
        renderComponent.draw(ctx, this, renderContext);
      }
      return;
    }

    // Subclass hook
    this.onDraw(ctx);
  }

  /**
   * Hook for subclass-specific rendering logic.
   * Override this instead of draw() to preserve base behavior.
   *
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   */
  onDraw() {
    // Override in subclasses
  }

  /**
   * Applies damage to the enemy.
   *
   * @param {number} amount - Damage amount
   * @param {Object} source - Damage source (for tracking)
   * @returns {boolean} True if enemy was destroyed
   */
  takeDamage(amount, source = null) {
    if (!this.alive) return false;
    if (this.affixes.length) {
      amount = this.affixDamage(amount, source);
      if (!(amount > 0)) return false;
    }

    const healthComponent = this.getComponent('health');
    if (healthComponent && typeof healthComponent.takeDamage === 'function') {
      const before = this.health;
      healthComponent.takeDamage(this, amount, source);
      if (this.health < before) this.markHit(before - this.health);
      return this.health <= 0;
    }

    // Apply armor reduction
    const actualDamage = Math.max(0, amount - this.armor);

    this.health -= actualDamage;
    if (actualDamage > 0) this.markHit(actualDamage);

    // Hook for damage reactions
    this.onDamaged(actualDamage, source);

    // Check for death
    if (this.health <= 0) {
      this.onDestroyed(source);
      return true;
    }

    return false;
  }

  /** Every hit that costs health lands here (flash, and Warded's window). */
  markHit(damage = 0) {
    this.lastHitTime = performance.now();
    if (this.hasAffix('warded')) {
      this.wardedUntil = this.age + ELITE_AFFIXES.warded.immuneSeconds;
    }
    this.hitFlashSeconds =
      HIT_FLASH_SECONDS *
      Math.min(
        HIT_FLASH_MAX_STRETCH,
        Math.max(1, damage / HIT_FLASH_REFERENCE_DAMAGE)
      );
  }

  /**
   * Hit-flash strength, 1 right after damage fading to 0. The Warden keeps its
   * own timed, damage-scaled flash (BossEnemy.triggerDamageFlash).
   *
   * @returns {number} 0-1
   */
  getHitFlash() {
    if (this.damageFlashDuration > 0) {
      return (
        Math.min(
          1,
          Math.max(0, this.damageFlashTimer / this.damageFlashDuration)
        ) * Math.min(1, Math.max(0, this.damageFlashStrength || 1))
      );
    }
    const elapsed = (performance.now() - this.lastHitTime) / 1000;
    return Math.min(1, Math.max(0, 1 - elapsed / this.hitFlashSeconds));
  }

  /**
   * Hook called when enemy takes damage.
   *
   * @param {number} amount - Damage taken
   * @param {Object} source - Damage source
   */
  onDamaged() {
    // Override in subclasses for reactions
  }

  /**
   * Hook called when enemy is destroyed.
   *
   * @param {Object} source - What destroyed this enemy
   */
  onDestroyed(source, context = null) {
    this.alive = false;

    const eventContext = context || {};
    const payload = {
      enemy: this,
      type: this.type,
      source,
      position:
        Number.isFinite(this.x) && Number.isFinite(this.y)
          ? { x: this.x, y: this.y }
          : null,
      context: eventContext,
    };

    if (!eventContext?.healthComponentManaged) {
      const eventBus = this.getEventBus();
      eventBus?.emit?.('enemy-destroyed', payload);
    }

    // Volatile blows before Splitter's Motes are out, so it spares them.
    if (this.hasAffix('volatile') && !this.blastSpent) {
      this.blastSpent = true;
      this.system.triggerVolatileExplosion(this, 'volatile-fuse');
    }
    if (this.hasAffix('splitter') && !this.splitSpent) {
      this.splitSpent = true;
      this.splitIntoMotes();
    }

    // Override in subclasses for death effects
  }

  /** Splitter: Motes fly out to both sides of the heading. */
  splitIntoMotes() {
    const { count, speed } = ELITE_AFFIXES.splitter;
    const heading = Math.atan2(this.vy, this.vx) || this.rotation || 0;
    for (let i = 0; i < count; i += 1) {
      const angle = heading + Math.PI / 2 + (i * Math.PI * 2) / count;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      this.spawnChild('drone', {
        x: this.x + dx * this.radius * 0.6,
        y: this.y + dy * this.radius * 0.6,
        vx: dx * speed,
        vy: dy * speed,
      });
    }
  }

  /**
   * Heals the enemy.
   *
   * @param {number} amount - Heal amount
   */
  heal(amount) {
    if (!this.alive) return;

    this.health = Math.min(this.maxHealth, this.health + amount);
  }

  /**
   * Checks if enemy is within screen bounds.
   *
   * @param {Object} bounds - {width, height}
   * @param {number} margin - Extra margin
   * @returns {boolean}
   */
  isOnScreen(bounds, margin = 0) {
    return (
      this.x >= -margin &&
      this.x <= bounds.width + margin &&
      this.y >= -margin &&
      this.y <= bounds.height + margin
    );
  }

  /**
   * Gets current velocity magnitude.
   *
   * @returns {number} Speed
   */
  getSpeed() {
    return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
  }

  /**
   * Gets distance to a point.
   *
   * @param {number} x - Target X
   * @param {number} y - Target Y
   * @returns {number} Distance
   */
  distanceTo(x, y) {
    const dx = this.x - x;
    const dy = this.y - y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Adds a component to this enemy.
   *
   * @param {string} name - Component name
   * @param {Object} component - Component instance
   */
  addComponent(name, component) {
    this.components.set(name, component);

    // Link component to enemy
    if (component.setEnemy) {
      component.setEnemy(this);
    }
  }

  hasComponent(name) {
    return this.components.has(name);
  }

  /**
   * Gets a component by name.
   *
   * @param {string} name - Component name
   * @returns {Object|null} Component or null
   */
  getComponent(name) {
    return this.components.get(name) || null;
  }

  /**
   * Checks if enemy has a specific tag.
   *
   * @param {string} tag - Tag name
   * @returns {boolean}
   */
  hasTag(tag) {
    return this.tags.has(tag);
  }

  /**
   * Adds a tag to this enemy.
   *
   * @param {string} tag - Tag name
   */
  addTag(tag) {
    this.tags.add(tag);
  }

  /**
   * Resets enemy state for object pooling.
   * Called when returning enemy to pool.
   */
  resetForPool() {
    // Reset core state
    this.alive = false;
    this.initialized = false;
    this.visible = true;
    this.lastHitTime = -Infinity;
    this.useComponents = false;

    // Reset position & velocity
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    // Steering strategies read `velocity` before vx/vy and the proximity one
    // keeps its clock in `movementState`: a reused enemy starts from neither.
    this.velocity = null;
    this.movementState = null;

    // Reset health
    this.health = 0;
    this.maxHealth = 100;
    this.armor = 0;
    this.stunTimer = 0;

    // Reset lifecycle
    this.age = 0;
    this.wave = 0;
    this.generation = 0;

    // Reset rotation
    this.rotation = 0;
    this.rotationSpeed = 0;

    // Clear metadata
    this.tags.clear();
    this.spawnedBy = null;
    this.resetAffixes([]);

    // Reset components
    for (const component of this.components.values()) {
      if (component.reset) {
        component.reset(this);
      }
    }

    this.componentState = {};

    // Subclass hook
    this.onReset();
  }

  buildComponentContext(deltaTime) {
    const system = this.system || null;
    const player =
      system && typeof system.getCachedPlayer === 'function'
        ? system.getCachedPlayer()
        : null;
    const playerPosition =
      player && typeof system?.getPlayerPositionSnapshot === 'function'
        ? system.getPlayerPositionSnapshot(player)
        : player?.position ||
          (Number.isFinite(player?.x) && Number.isFinite(player?.y)
            ? { x: player.x, y: player.y }
            : null);

    const validPlayerPosition =
      playerPosition &&
      Number.isFinite(playerPosition.x) &&
      Number.isFinite(playerPosition.y)
        ? playerPosition
        : null;

    const random =
      this.random ||
      (system && typeof system.getRandomService === 'function'
        ? system.getRandomService()
        : null);

    const worldBounds = this.resolveWorldBounds(system);

    return {
      enemy: this,
      deltaTime,
      system,
      player: validPlayerPosition
        ? {
            entity: player ?? null,
            position: validPlayerPosition,
          }
        : null,
      playerEntity: player ?? null,
      playerPosition: validPlayerPosition,
      random,
      worldBounds,
    };
  }

  resolveWorldBounds(system) {
    const bounds =
      system?.worldBounds ||
      (typeof system?.getWorldBounds === 'function'
        ? system.getWorldBounds()
        : null);

    if (bounds) {
      return {
        left: bounds.left ?? 0,
        top: bounds.top ?? 0,
        right: bounds.right ?? bounds.width ?? GAME_WIDTH,
        bottom: bounds.bottom ?? bounds.height ?? GAME_HEIGHT,
        width:
          bounds.width ?? (bounds.right ?? GAME_WIDTH) - (bounds.left ?? 0),
        height:
          bounds.height ?? (bounds.bottom ?? GAME_HEIGHT) - (bounds.top ?? 0),
      };
    }

    return {
      left: 0,
      top: 0,
      right: GAME_WIDTH,
      bottom: GAME_HEIGHT,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    };
  }

  getColors() {
    return ENEMY_EFFECT_COLORS?.[this.type] ?? {};
  }

  getPresets() {
    return ENEMY_RENDER_PRESETS?.[this.type] ?? {};
  }

  runComponentUpdate(context) {
    if (!this.components || this.components.size === 0) {
      return;
    }

    for (const component of this.components.values()) {
      if (typeof component?.update !== 'function') {
        continue;
      }

      if (component.update.length >= 3) {
        component.update(this, context?.deltaTime, context);
      } else if (component.update.length === 2) {
        component.update(this, context?.deltaTime);
      } else {
        component.update(context);
      }
    }
  }

  /**
   * Seeded random for this enemy: the spawn's own stream when given, else a
   * fork of the system's scope for this type.
   */
  resolveRandom(config = {}) {
    if (config.random && typeof config.random.float === 'function') {
      return config.random;
    }

    if (this.system && typeof this.system.getRandomScope === 'function') {
      const generator = this.system.getRandomScope(
        config.randomScope || this.type,
        {
          parentScope: config.randomParentScope || 'spawn',
          label: `enemy:${this.type}:${config.id || this.id || 'spawn'}`,
        }
      );
      return generator?.fork ? generator.fork(`${this.type}:core`) : generator;
    }

    return new RandomService(`enemy:${this.type}`);
  }

  /**
   * Spawns an enemy this one releases (Husk Motes, Weaver Tethers) through the
   * same path as the Warden's minions: factory acquire, then counted in the
   * running wave.
   */
  spawnChild(type, config = {}) {
    const system = this.system;
    const child = system?.acquireEnemyViaFactory?.(type, {
      wave: this.wave,
      spawnedBy: this.id,
      randomParentScope: `${this.type}:${this.id}`,
      ...config,
    });
    if (!child) return null;
    child[Symbol.for('ASTEROIDS_ROGUEFIELD:factoryRegistered')] = false;
    system.waveManager?.registerDynamicMinion?.(child, {
      parentId: this.id,
      minionType: type,
    });
    return child;
  }

  getEventBus() {
    const eventBus =
      this.system?.eventBus || resolveEventBus(this.system?.dependencies);
    if (eventBus?.emit) {
      return eventBus;
    }
    return resolveEventBus();
  }

  /**
   * Hook for subclass-specific reset logic.
   */
  onReset() {
    // Override in subclasses
  }

  /**
   * Generates a unique ID for this enemy.
   *
   * @returns {string} Unique ID
   */
  generateId() {
    const randomService =
      this.system && typeof this.system.getRandomService === 'function'
        ? this.system.getRandomService()
        : null;

    if (randomService && typeof randomService.uuid === 'function') {
      return randomService.uuid(this.type);
    }

    fallbackEnemyIdSequence += 1;
    return `${this.type}-${fallbackEnemyIdSequence}`;
  }

  /**
   * Gets a debug-friendly string representation.
   *
   * @returns {string}
   */
  toString() {
    return `${this.type}[${this.id}] (${Math.round(this.x)}, ${Math.round(this.y)}) HP:${this.health}/${this.maxHealth}`;
  }
}
