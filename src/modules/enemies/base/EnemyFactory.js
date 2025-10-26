import { CollisionComponent } from '../components/CollisionComponent.js';
import { HealthComponent } from '../components/HealthComponent.js';
import { MovementComponent } from '../components/MovementComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';
import { WeaponComponent } from '../components/WeaponComponent.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';

/**
 * Enemy Factory
 *
 * Centralized factory for creating enemy instances of different types.
 * Handles registration, pooling, and instantiation of enemies.
 *
 * Design Pattern: Factory + Registry
 *
 * Benefits:
 * - Easy to add new enemy types without modifying existing code
 * - Automatic pool management
 * - Type validation
 * - Configuration inheritance
 *
 * @example
 * ```javascript
 * const factory = new EnemyFactory(enemySystem);
 *
 * // Register a type
 * factory.registerType('asteroid', {
 *   class: Asteroid,
 *   pool: GamePools.asteroids,
 *   defaults: { size: 'medium' }
 * });
 *
 * // Register pooled enemy ships using GameConstants defaults
 * factory.registerType('drone', {
 *   class: Drone,
 *   pool: GamePools.drones,
 *   defaults: GameConstants.ENEMY_TYPES.drone,
 *   tags: ['enemy', 'hostile', 'ranged']
 * });
 *
 * factory.registerType('mine', {
 *   class: Mine,
 *   pool: GamePools.mines,
 *   defaults: GameConstants.ENEMY_TYPES.mine,
 *   tags: ['enemy', 'explosive']
 * });
 *
 * factory.registerType('hunter', {
 *   class: Hunter,
 *   pool: GamePools.hunters,
 *   defaults: GameConstants.ENEMY_TYPES.hunter,
 *   tags: ['enemy', 'elite']
 * });
 *
 * // Create an instance
 * const asteroid = factory.create('asteroid', {
 *   x: 100,
 *   y: 200,
 *   size: 'large'
 * });
 * ```
 */

export class EnemyFactory {
  /**
   * Creates a new Enemy Factory.
   *
   * @param {Object} system - Reference to parent EnemySystem
   */
  constructor(system) {
    this.system = system;

    /** @type {Map<string, Object>} Registry of enemy type configurations */
    this.registry = new Map();

    /** @type {Map<string, number>} Statistics per enemy type */
    this.stats = new Map();

    console.log('[EnemyFactory] Initialized');
  }

  /**
   * Registers a new enemy type.
   *
   * @param {string} type - Type identifier (e.g., 'asteroid', 'drone')
   * @param {Object} config - Type configuration
   * @param {Function} config.class - Enemy class constructor
   * @param {Object} [config.pool] - Object pool for this type
   * @param {Object} [config.defaults={}] - Default configuration values
   * @param {Array<string>} [config.tags=[]] - Default tags for this type
   * @returns {boolean} True if registered successfully
   */
  registerType(type, config) {
    if (!type || typeof type !== 'string') {
      console.error('[EnemyFactory] Invalid type identifier:', type);
      return false;
    }

    if (!config || typeof config.class !== 'function') {
      console.error('[EnemyFactory] Invalid configuration for type:', type);
      return false;
    }

    if (this.registry.has(type)) {
      console.warn(`[EnemyFactory] Type '${type}' already registered. Overwriting.`);
    }

    // Store configuration
    this.registry.set(type, {
      class: config.class,
      pool: config.pool || null,
      defaults: config.defaults || {},
      tags: config.tags || [],
      enabled: config.enabled !== false
    });

    // Initialize stats
    this.stats.set(type, {
      created: 0,
      pooled: 0,
      active: 0
    });

    console.log(`[EnemyFactory] Registered type: ${type}`);
    return true;
  }

  /**
   * Creates an enemy of the specified type.
   *
   * @param {string} type - Enemy type to create
   * @param {Object} config - Configuration for the enemy
   * @returns {BaseEnemy|null} Created enemy or null if failed
   */
  create(type, config = {}) {
    const typeConfig = this.registry.get(type);

    if (!typeConfig) {
      console.error(`[EnemyFactory] Unknown enemy type: ${type}`);
      console.log('Available types:', Array.from(this.registry.keys()));
      return null;
    }

    if (!typeConfig.enabled) {
      console.warn(`[EnemyFactory] Type '${type}' is disabled`);
      return null;
    }

    let enemy = null;
    const stats = this.stats.get(type);

    // Try to acquire from pool first
    if (typeConfig.pool) {
      enemy = typeConfig.pool.acquire();
      if (enemy) {
        stats.pooled++;
      }
    }

    // Create new instance if pool unavailable or empty
    if (!enemy) {
      try {
        enemy = new typeConfig.class(this.system);
        stats.created++;
      } catch (error) {
        console.error(`[EnemyFactory] Failed to create ${type}:`, error);
        return null;
      }
    }

    // Merge configuration: defaults < provided config
    const finalConfig = {
      ...typeConfig.defaults,
      ...config,
      type: type  // Ensure type is set
    };

    if (type === 'asteroid') {
      GameDebugLogger.log('STATE', 'Factory config merge', {
        type: 'asteroid',
        defaults: {
          size: typeConfig.defaults?.size,
          variant: typeConfig.defaults?.variant,
        },
        provided: {
          size: config?.size,
          variant: config?.variant,
        },
        merged: {
          size: finalConfig?.size,
          variant: finalConfig?.variant,
        },
        mergeCorrect:
          finalConfig?.size === config?.size && finalConfig?.variant === config?.variant,
      });
    }

    const componentConfig = finalConfig.components;

    // Initialize enemy
    try {
      if (typeof enemy.initialize === 'function') {
        if (enemy.initialize.length <= 1) {
          enemy.initialize(finalConfig);
        } else {
          enemy.initialize(this.system, finalConfig);
        }
      }

      if (componentConfig) {
        this.applyComponents(enemy, componentConfig, finalConfig);
      }

      // Apply default tags
      for (const tag of typeConfig.tags) {
        enemy.addTag(tag);
      }

      stats.active++;

      return enemy;
    } catch (error) {
      console.error(`[EnemyFactory] Failed to initialize ${type}:`, error);

      // Return to pool if initialization failed
      if (typeConfig.pool) {
        typeConfig.pool.release(enemy);
      }

      return null;
    }
  }

  /**
   * Creates multiple enemies of the same type.
   *
   * @param {string} type - Enemy type
   * @param {number} count - Number to create
   * @param {Object|Function} config - Config object or generator function
   * @returns {Array<BaseEnemy>} Array of created enemies
   */
  createBatch(type, count, config = {}) {
    const enemies = [];

    for (let i = 0; i < count; i++) {
      // Allow config to be a function for dynamic generation
      const enemyConfig = typeof config === 'function'
        ? config(i, count)
        : { ...config, batchIndex: i };

      const enemy = this.create(type, enemyConfig);

      if (enemy) {
        enemies.push(enemy);
      }
    }

    console.log(`[EnemyFactory] Created batch of ${enemies.length}/${count} ${type}s`);
    return enemies;
  }

  /**
   * Releases an enemy back to its pool.
   *
   * @param {BaseEnemy} enemy - Enemy to release
   * @returns {boolean} True if released to pool
   */
  release(enemy) {
    if (!enemy) return false;

    const typeConfig = this.registry.get(enemy.type);

    if (!typeConfig) {
      console.warn(`[EnemyFactory] Cannot release unknown type: ${enemy.type}`);
      return false;
    }

    // Update stats
    const stats = this.stats.get(enemy.type);
    if (stats && stats.active > 0) {
      stats.active--;
    }

    // Return to pool if available
    if (typeConfig.pool) {
      try {
        typeConfig.pool.release(enemy);
        return true;
      } catch (error) {
        console.error(`[EnemyFactory] Failed to release ${enemy.type} to pool:`, error);
      }
    }

    return false;
  }

  /**
   * Checks if a type is registered.
   *
   * @param {string} type - Type to check
   * @returns {boolean}
   */
  hasType(type) {
    return this.registry.has(type);
  }

  /**
   * Gets configuration for a type.
   *
   * @param {string} type - Type name
   * @returns {Object|null} Type configuration or null
   */
  getTypeConfig(type) {
    return this.registry.get(type) || null;
  }

  /**
   * Gets all registered type names.
   *
   * @returns {Array<string>} Array of type names
   */
  getRegisteredTypes() {
    return Array.from(this.registry.keys());
  }

  /**
   * Gets enabled type names.
   *
   * @returns {Array<string>} Array of enabled type names
   */
  getEnabledTypes() {
    return Array.from(this.registry.entries())
      .filter(([_, config]) => config.enabled)
      .map(([type, _]) => type);
  }

  /**
   * Enables or disables a type.
   *
   * @param {string} type - Type to enable/disable
   * @param {boolean} enabled - New enabled state
   * @returns {boolean} True if successful
   */
  setTypeEnabled(type, enabled) {
    const typeConfig = this.registry.get(type);

    if (!typeConfig) {
      console.error(`[EnemyFactory] Unknown type: ${type}`);
      return false;
    }

    typeConfig.enabled = enabled;
    console.log(`[EnemyFactory] Type '${type}' ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * Gets statistics for all types.
   *
   * @returns {Object} Statistics by type
   */
  getStats() {
    const result = {};

    for (const [type, stats] of this.stats.entries()) {
      result[type] = { ...stats };
    }

    return result;
  }

  /**
   * Gets statistics for a specific type.
   *
   * @param {string} type - Type name
   * @returns {Object|null} Statistics or null
   */
  getTypeStats(type) {
    const stats = this.stats.get(type);
    return stats ? { ...stats } : null;
  }

  /**
   * Resets statistics for all types.
   */
  resetStats() {
    for (const stats of this.stats.values()) {
      stats.created = 0;
      stats.pooled = 0;
      // Don't reset active - it's current state
    }

    console.log('[EnemyFactory] Statistics reset');
  }

  /**
   * Validates that all registered types are properly configured.
   *
   * @returns {Object} Validation result
   */
  validate() {
    const errors = [];
    const warnings = [];

    for (const [type, config] of this.registry.entries()) {
      // Check if class is valid
      if (typeof config.class !== 'function') {
        errors.push(`Type '${type}' has invalid class`);
      }

      // Warn if no pool configured
      if (!config.pool) {
        warnings.push(`Type '${type}' has no pool configured (will create new instances every time)`);
      }

      // Check if defaults are an object
      if (config.defaults && typeof config.defaults !== 'object') {
        errors.push(`Type '${type}' has invalid defaults (must be object)`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      registeredTypes: this.registry.size
    };
  }

  /**
   * Clears all registered types.
   * Use with caution!
   */
  clear() {
    this.registry.clear();
    this.stats.clear();
    console.log('[EnemyFactory] Cleared all registrations');
  }

  /**
   * Gets a summary of the factory state.
   *
   * @returns {Object} Factory summary
   */
  getSummary() {
    const types = Array.from(this.registry.entries()).map(([type, config]) => ({
      type,
      enabled: config.enabled,
      hasPool: !!config.pool,
      defaultTags: config.tags
    }));

    return {
      totalTypes: this.registry.size,
      enabledTypes: this.getEnabledTypes().length,
      types,
      stats: this.getStats()
    };
  }

  /**
   * Logs factory information to console.
   */
  debugLog() {
    console.group('🏭 EnemyFactory Debug Info');

    console.log('Registered Types:', this.getRegisteredTypes());
    console.log('Enabled Types:', this.getEnabledTypes());

    console.group('📊 Statistics');
    console.table(this.getStats());
    console.groupEnd();

    const validation = this.validate();
    if (validation.errors.length > 0) {
      console.group('⚠️ Errors');
      validation.errors.forEach(err => console.error(err));
      console.groupEnd();
    }

    if (validation.warnings.length > 0) {
      console.group('⚡ Warnings');
      validation.warnings.forEach(warn => console.warn(warn));
      console.groupEnd();
    }

    console.groupEnd();
  }

  applyComponents(enemy, components = {}, finalConfig = {}) {
    if (!enemy || !components) {
      return;
    }

    let attachedCount = 0;

    const ensureComponentState = () => {
      if (!enemy.componentState) {
        enemy.componentState = {};
      }
    };

    if (components.movement) {
      const movementComponent = this.createMovementComponent(components.movement, enemy, finalConfig);
      enemy.movementStrategy = components.movement.strategy || enemy.movementStrategy || 'linear';
      enemy.movementConfig = { ...components.movement };
      enemy.addComponent('movement', movementComponent);
      attachedCount++;
    }

    if (components.weapon) {
      const weaponComponent = this.createWeaponComponent(components.weapon, enemy, finalConfig);
      enemy.weaponConfig = { ...components.weapon };
      if (Array.isArray(components.weapon.patterns)) {
        enemy.weaponPatterns = [...components.weapon.patterns];
        enemy.weaponPattern = enemy.weaponPattern || components.weapon.patterns[0];
      } else if (components.weapon.pattern) {
        enemy.weaponPattern = components.weapon.pattern;
      }
      enemy.weaponState = enemy.weaponState || {};
      enemy.addComponent('weapon', weaponComponent);
      if (typeof weaponComponent.reset === 'function') {
        weaponComponent.reset(enemy);
      }
      attachedCount++;
    }

    if (components.render) {
      const renderComponent = this.createRenderComponent(components.render, enemy, finalConfig);
      enemy.renderStrategy = components.render.strategy || enemy.renderStrategy || 'delegate';
      enemy.renderConfig = { ...components.render };
      enemy.addComponent('render', renderComponent);
      attachedCount++;
    }

    if (components.collision) {
      const collisionComponent = this.createCollisionComponent(components.collision, enemy, finalConfig);
      enemy.collisionConfig = { ...components.collision };
      if (Number.isFinite(components.collision.radius)) {
        enemy.collisionRadius = components.collision.radius;
        enemy.radius = enemy.radius || components.collision.radius;
      }
      if (components.collision.response) {
        enemy.collisionResponse = components.collision.response;
      }
      enemy.addComponent('collision', collisionComponent);
      attachedCount++;
    }

    if (components.health) {
      const healthComponent = this.createHealthComponent(components.health, enemy, finalConfig);
      enemy.addComponent('health', healthComponent);
      if (typeof healthComponent.initialize === 'function') {
        healthComponent.initialize(enemy, components.health);
      }
      attachedCount++;
    }

    if (attachedCount > 0) {
      ensureComponentState();
      enemy.useComponents = true;
    } else {
      enemy.useComponents = false;
    }
  }

  createMovementComponent(config = {}) {
    const component = new MovementComponent(config);
    if (typeof component.setStrategy === 'function' && config.strategy) {
      component.setStrategy(config.strategy);
    }
    return component;
  }

  createWeaponComponent(config = {}) {
    return new WeaponComponent(config);
  }

  createRenderComponent(config = {}) {
    const component = new RenderComponent(config);
    if (typeof component.setStrategy === 'function' && config.strategy) {
      component.setStrategy(config.strategy);
    }
    return component;
  }

  createCollisionComponent(config = {}) {
    return new CollisionComponent(config);
  }

  createHealthComponent(config = {}) {
    return new HealthComponent(config);
  }
}
