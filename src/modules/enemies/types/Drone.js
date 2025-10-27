import { DRONE_COMPONENTS, DRONE_CONFIG } from '../../../data/enemies/drone.js';
import { GAME_WIDTH, GAME_HEIGHT } from '../../../core/GameConstants.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import { GameDebugLogger } from '../../../utils/dev/GameDebugLogger.js';
import { MovementComponent } from '../components/MovementComponent.js';
import { WeaponComponent } from '../components/WeaponComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';

const ensureDroneComponents = (drone, componentConfig = {}) => {
  if (!drone?.components) {
    return;
  }

  let attached = false;

  if (componentConfig.movement) {
    const existing = drone.getComponent('movement');
    if (!existing) {
      const movement = new MovementComponent(componentConfig.movement);
      if (typeof movement.setStrategy === 'function' && componentConfig.movement.strategy) {
        movement.setStrategy(componentConfig.movement.strategy);
      }
      drone.movementStrategy = componentConfig.movement.strategy || drone.movementStrategy;
      drone.movementConfig = { ...componentConfig.movement };
      drone.addComponent('movement', movement);
      attached = true;
    } else if (componentConfig.movement.strategy && typeof existing.setStrategy === 'function') {
      existing.setStrategy(componentConfig.movement.strategy);
      drone.movementConfig = { ...componentConfig.movement };
    }
  }

  if (componentConfig.weapon) {
    const existing = drone.getComponent('weapon');
    if (!existing) {
      const weapon = new WeaponComponent(componentConfig.weapon);
      drone.weaponConfig = { ...componentConfig.weapon };
      if (Array.isArray(componentConfig.weapon.patterns)) {
        drone.weaponPatterns = [...componentConfig.weapon.patterns];
        drone.weaponPattern = drone.weaponPattern || componentConfig.weapon.patterns[0];
      } else if (componentConfig.weapon.pattern) {
        drone.weaponPattern = componentConfig.weapon.pattern;
      }
      drone.weaponState = drone.weaponState || {};
      drone.addComponent('weapon', weapon);
      if (typeof weapon.reset === 'function') {
        weapon.reset(drone);
      }
      attached = true;
    } else {
      existing.config = { ...existing.config, ...componentConfig.weapon };
    }
  }

  if (componentConfig.render) {
    const existing = drone.getComponent('render');
    if (!existing) {
      const render = new RenderComponent(componentConfig.render);
      if (typeof render.setStrategy === 'function' && componentConfig.render.strategy) {
        render.setStrategy(componentConfig.render.strategy);
      }
      drone.renderStrategy = componentConfig.render.strategy || drone.renderStrategy;
      drone.renderConfig = { ...componentConfig.render };
      drone.addComponent('render', render);
      attached = true;
    } else if (componentConfig.render.strategy && typeof existing.setStrategy === 'function') {
      existing.setStrategy(componentConfig.render.strategy);
      drone.renderConfig = { ...componentConfig.render };
    }
  }

  if (attached || (drone.components && drone.components.size > 0)) {
    drone.useComponents = true;
  }
};

const DRONE_DEFAULTS = DRONE_CONFIG ?? {};

export class Drone extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'drone';

    this.random = null;
    this.aimRandom = null;
    this.maneuverRandom = null;

    this.fireTimer = 0;
    this.fireInterval = DRONE_DEFAULTS.fireRate ?? 2;
    this.fireVariance = DRONE_DEFAULTS.fireVariance ?? 0;
    this.fireSpread = DRONE_DEFAULTS.fireSpread ?? 0;
    this.projectileSpeed = DRONE_DEFAULTS.projectileSpeed ?? 340;
    this.projectileDamage = DRONE_DEFAULTS.projectileDamage ?? 15;
    this.projectileLifetime = DRONE_DEFAULTS.projectileLifetime ?? 2.0;
    this.targetingRange = DRONE_DEFAULTS.targetingRange ?? 460;
    this.maxSpeed = DRONE_DEFAULTS.speed ?? 180;
    this.acceleration = DRONE_DEFAULTS.acceleration ?? 220;
    this.contactDamage = DRONE_DEFAULTS.contactDamage ?? 12;
    this.destroyed = false;
    this._renderThrust = 0;
    this.weaponState = {};
    this.movementStrategy = 'tracking';
    this.renderStrategy = 'procedural-triangle';
    this.useComponents = false;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
    super.initialize(config);

    const componentConfig = config.components ?? DRONE_COMPONENTS;
    if (componentConfig) {
      this.weaponState = this.weaponState || {};
      this.movementStrategy = componentConfig?.movement?.strategy || 'tracking';
      this.renderStrategy = componentConfig?.render?.strategy || 'procedural-triangle';
      this.weaponPattern = componentConfig?.weapon?.pattern || this.weaponPattern;
    }

    ensureDroneComponents(this, componentConfig);

    this.radius = config.radius ?? DRONE_DEFAULTS.radius ?? 12;
    this.maxHealth =
      config.maxHealth ?? config.health ?? DRONE_DEFAULTS.health ?? 30;
    this.health = config.health ?? this.maxHealth;
    this.contactDamage =
      config.contactDamage ?? DRONE_DEFAULTS.contactDamage ?? 12;

    this.maxSpeed = config.maxSpeed ?? DRONE_DEFAULTS.speed ?? 180;
    this.acceleration =
      config.acceleration ?? DRONE_DEFAULTS.acceleration ?? 220;

    this.projectileSpeed =
      config.projectileSpeed ?? DRONE_DEFAULTS.projectileSpeed ?? 340;
    this.projectileDamage =
      config.projectileDamage ?? DRONE_DEFAULTS.projectileDamage ?? 15;
    this.projectileLifetime =
      config.projectileLifetime ?? DRONE_DEFAULTS.projectileLifetime ?? 2.0;

    this.fireInterval = config.fireRate ?? DRONE_DEFAULTS.fireRate ?? 2;
    this.fireVariance = config.fireVariance ?? DRONE_DEFAULTS.fireVariance ?? 0;
    this.fireSpread = config.fireSpread ?? DRONE_DEFAULTS.fireSpread ?? 0;
    this.targetingRange =
      config.targetingRange ?? DRONE_DEFAULTS.targetingRange ?? 460;

    this.random = this.resolveRandom({ ...config, id: this.id });
    this.aimRandom = this.random?.fork
      ? this.random.fork('drone:aim')
      : this.random;
    this.maneuverRandom = this.random?.fork
      ? this.random.fork('drone:maneuver')
      : this.random;

    this.fireTimer = 0;
    this.destroyed = false;
    this._renderThrust = 0;

    if (Number.isFinite(config.x)) {
      this.x = config.x;
    }
    if (Number.isFinite(config.y)) {
      this.y = config.y;
    }

    const boundsWidth = Number.isFinite(GAME_WIDTH) ? GAME_WIDTH : 0;
    const boundsHeight = Number.isFinite(GAME_HEIGHT) ? GAME_HEIGHT : 0;
    const inBounds =
      this.x >= 0 &&
      this.x <= boundsWidth &&
      this.y >= 0 &&
      this.y <= boundsHeight;

    GameDebugLogger.log('SPAWN', 'Drone initialized', {
      id: this.id,
      position: { x: Math.round(this.x ?? 0), y: Math.round(this.y ?? 0) },
      wave: this.wave,
      isInBounds: inBounds,
    });

    const outOfPlayableBounds =
      this.x < -100 ||
      this.x > boundsWidth + 100 ||
      this.y < -100 ||
      this.y > boundsHeight + 100;

    if (outOfPlayableBounds) {
      GameDebugLogger.log('ERROR', 'Drone spawned out of bounds', {
        position: { x: this.x, y: this.y },
        bounds: { width: boundsWidth, height: boundsHeight },
      });

      const centerX = boundsWidth > 0 ? boundsWidth / 2 : 0;
      const centerY = boundsHeight > 0 ? boundsHeight / 2 : 0;
      const offsetGenerator =
        this.random && typeof this.random.range === 'function'
          ? () => this.random.range(-100, 100)
          : () => (Math.random() - 0.5) * 200;
      this.x = centerX + offsetGenerator();
      this.y = centerY + offsetGenerator();

      GameDebugLogger.log('STATE', 'Drone position corrected to center area', {
        newPosition: {
          x: Math.round(this.x ?? 0),
          y: Math.round(this.y ?? 0),
        },
      });
    }

    return this;
  }

  resolveRandom(config = {}) {
    if (config.random && typeof config.random.float === 'function') {
      return config.random;
    }

    if (this.system && typeof this.system.getRandomScope === 'function') {
      const scope = config.randomScope || 'drone';
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
    if (!this.useComponents || !this.components?.size) {
      console.error('[Drone] Components not initialized. Drone cannot update.');
      return;
    }

    const context = this.buildComponentContext(deltaTime);
    this.runComponentUpdate(context);
  }

  onDestroyed(source) {
    this.destroyed = true;
    super.onDestroyed(source);
  }

  onDraw(ctx) {
    if (!this.useComponents || !this.components?.size) {
      console.error('[Drone] Components not initialized. Drone cannot render.');
      return;
    }

    // RenderComponent handles drawing via BaseEnemy.draw()
    return;
  }

  resetForPool() {
    super.resetForPool();

    this.random = null;
    this.aimRandom = null;
    this.maneuverRandom = null;

    this.fireTimer = 0;
    this.fireInterval = DRONE_DEFAULTS.fireRate ?? 2;
    this.fireVariance = DRONE_DEFAULTS.fireVariance ?? 0;
    this.fireSpread = DRONE_DEFAULTS.fireSpread ?? 0;
    this.projectileSpeed = DRONE_DEFAULTS.projectileSpeed ?? 340;
    this.projectileDamage = DRONE_DEFAULTS.projectileDamage ?? 15;
    this.projectileLifetime = DRONE_DEFAULTS.projectileLifetime ?? 2.0;
    this.targetingRange = DRONE_DEFAULTS.targetingRange ?? 460;
    this.maxSpeed = DRONE_DEFAULTS.speed ?? 180;
    this.acceleration = DRONE_DEFAULTS.acceleration ?? 220;
    this.contactDamage = DRONE_DEFAULTS.contactDamage ?? 12;
    this.destroyed = false;
    this._renderThrust = 0;
  }
}

export default Drone;
