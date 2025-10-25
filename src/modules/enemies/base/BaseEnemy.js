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

let fallbackEnemyIdSequence = 0;

export class BaseEnemy {
  /**
   * Creates a base enemy instance.
   *
   * @param {Object} system - Reference to parent EnemySystem
   * @param {Object} config - Configuration options
   */
  constructor(system, config = {}) {
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

    // Lifecycle
    this.age = 0;           // Time since spawn
    this.wave = 0;          // Wave number
    this.generation = 0;    // For fragments

    // Rendering
    this.rotation = 0;
    this.rotationSpeed = 0;
    this.visible = true;

    // Components (to be set by subclasses)
    this.components = new Map();
    this.componentState = {};
    this._componentsInvoked = false;
    this.useComponents = false;

    // Metadata
    this.tags = new Set();  // For categorization: 'boss', 'minion', 'volatile'
    this.spawnedBy = null;  // Parent enemy reference
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

    const hasMovementComponent = this.useComponents && this.hasComponent('movement');

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
  }

  /**
   * Hook for subclass-specific update logic.
   * Override this instead of update() to preserve base behavior.
   *
   * @param {number} deltaTime - Time elapsed
   */
  onUpdate(deltaTime) {
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
  onDraw(ctx) {
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

    const healthComponent = this.getComponent('health');
    if (healthComponent && typeof healthComponent.takeDamage === 'function') {
      healthComponent.takeDamage(this, amount, source);
      return this.health <= 0;
    }

    // Apply armor reduction
    const actualDamage = Math.max(0, amount - this.armor);

    this.health -= actualDamage;

    // Hook for damage reactions
    this.onDamaged(actualDamage, source);

    // Check for death
    if (this.health <= 0) {
      this.onDestroyed(source);
      return true;
    }

    return false;
  }

  /**
   * Hook called when enemy takes damage.
   *
   * @param {number} amount - Damage taken
   * @param {Object} source - Damage source
   */
  onDamaged(amount, source) {
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
      const gameEvents = this.system?.gameEvents?.emit ? this.system.gameEvents : null;
      if (gameEvents) {
        gameEvents.emit('enemy-destroyed', payload);
      } else if (this.system?.eventBus?.emit) {
        this.system.eventBus.emit('enemy-destroyed', payload);
      }
    }

    // Override in subclasses for death effects
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
    this.useComponents = false;

    // Reset position & velocity
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;

    // Reset health
    this.health = 0;
    this.maxHealth = 100;
    this.armor = 0;

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
      (typeof system?.getWorldBounds === 'function' ? system.getWorldBounds() : null);

    if (bounds) {
      return {
        left: bounds.left ?? 0,
        top: bounds.top ?? 0,
        right: bounds.right ?? bounds.width ?? GAME_WIDTH,
        bottom: bounds.bottom ?? bounds.height ?? GAME_HEIGHT,
        width: bounds.width ?? (bounds.right ?? GAME_WIDTH) - (bounds.left ?? 0),
        height: bounds.height ?? (bounds.bottom ?? GAME_HEIGHT) - (bounds.top ?? 0),
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
