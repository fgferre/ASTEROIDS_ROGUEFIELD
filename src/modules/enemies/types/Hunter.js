import { HUNTER_COMPONENTS, HUNTER_CONFIG } from '../../../data/enemies/hunter.js';
import RandomService from '../../../core/RandomService.js';
import { BaseEnemy } from '../base/BaseEnemy.js';
import { MovementComponent } from '../components/MovementComponent.js';
import { WeaponComponent } from '../components/WeaponComponent.js';
import { RenderComponent } from '../components/RenderComponent.js';

const ensureHunterComponents = (hunter, componentConfig = {}) => {
  if (!hunter?.components) {
    return;
  }

  let attached = false;

  if (componentConfig.movement) {
    const existing = hunter.getComponent('movement');
    if (!existing) {
      const movement = new MovementComponent(componentConfig.movement);
      if (typeof movement.setStrategy === 'function' && componentConfig.movement.strategy) {
        movement.setStrategy(componentConfig.movement.strategy);
      }
      hunter.movementStrategy = componentConfig.movement.strategy || hunter.movementStrategy;
      hunter.movementConfig = { ...componentConfig.movement };
      hunter.addComponent('movement', movement);
      attached = true;
    } else if (componentConfig.movement.strategy && typeof existing.setStrategy === 'function') {
      existing.setStrategy(componentConfig.movement.strategy);
      hunter.movementConfig = { ...componentConfig.movement };
    }
  }

  if (componentConfig.weapon) {
    const existing = hunter.getComponent('weapon');
    if (!existing) {
      const weapon = new WeaponComponent(componentConfig.weapon);
      hunter.weaponConfig = { ...componentConfig.weapon };
      if (Array.isArray(componentConfig.weapon.patterns)) {
        hunter.weaponPatterns = [...componentConfig.weapon.patterns];
        hunter.weaponPattern = hunter.weaponPattern || componentConfig.weapon.patterns[0];
      } else if (componentConfig.weapon.pattern) {
        hunter.weaponPattern = componentConfig.weapon.pattern;
      }
      hunter.weaponState = hunter.weaponState || {};
      hunter.addComponent('weapon', weapon);
      if (typeof weapon.reset === 'function') {
        weapon.reset(hunter);
      }
      attached = true;
    } else {
      existing.config = { ...existing.config, ...componentConfig.weapon };
    }
  }

  if (componentConfig.render) {
    const existing = hunter.getComponent('render');
    if (!existing) {
      const render = new RenderComponent(componentConfig.render);
      if (typeof render.setStrategy === 'function' && componentConfig.render.strategy) {
        render.setStrategy(componentConfig.render.strategy);
      }
      hunter.renderStrategy = componentConfig.render.strategy || hunter.renderStrategy;
      hunter.renderConfig = { ...componentConfig.render };
      hunter.addComponent('render', render);
      attached = true;
    } else if (componentConfig.render.strategy && typeof existing.setStrategy === 'function') {
      existing.setStrategy(componentConfig.render.strategy);
      hunter.renderConfig = { ...componentConfig.render };
    }
  }

  if (attached || (hunter.components && hunter.components.size > 0)) {
    hunter.useComponents = true;
  }
};

const HUNTER_DEFAULTS = HUNTER_CONFIG ?? {};

export class Hunter extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = 'hunter';

    this.random = null;
    this.maneuverRandom = null;
    this.aimRandom = null;

    this.preferredDistance = HUNTER_DEFAULTS.preferredDistance ?? 175;
    this.maxSpeed = HUNTER_DEFAULTS.speed ?? 120;
    this.acceleration = HUNTER_DEFAULTS.acceleration ?? 220;
    this.projectileSpeed = HUNTER_DEFAULTS.projectileSpeed ?? 420;
    this.projectileDamage = HUNTER_DEFAULTS.projectileDamage ?? 12;
    this.projectileLifetime = HUNTER_DEFAULTS.projectileLifetime ?? 1.5;
    this.fireRange = HUNTER_DEFAULTS.fireRange ?? 520;
    this.fireSpread = HUNTER_DEFAULTS.fireSpread ?? 0;

    this.burstCount = HUNTER_DEFAULTS.burstCount ?? 3;
    this.burstInterval = HUNTER_DEFAULTS.burstInterval ?? 3.5;
    this.burstDelay = HUNTER_DEFAULTS.burstDelay ?? 0.15;
    this.burstCooldown = this.burstInterval;
    this.burstShotsRemaining = 0;
    this.burstDelayTimer = 0;
    this.currentBurstId = 0;

    this.orbitDirection = 1;
    this.destroyed = false;
    this.turretAngle = this.rotation;
    this.weaponState = {};
    this.movementStrategy = 'orbit';
    this.renderStrategy = 'procedural-diamond';
    this.useComponents = false;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    this.resetForPool();
   super.initialize(config);

    const componentConfig = config.components ?? HUNTER_COMPONENTS;
    if (componentConfig) {
      this.weaponState = this.weaponState || {};
      this.movementStrategy = componentConfig?.movement?.strategy || 'orbit';
      this.renderStrategy = componentConfig?.render?.strategy || 'procedural-diamond';
      this.weaponPattern = componentConfig?.weapon?.pattern || this.weaponPattern;
      if (componentConfig?.movement?.orbitDirection) {
        this.orbitDirection = componentConfig.movement.orbitDirection;
      }
    }

    ensureHunterComponents(this, componentConfig);

    this.radius = config.radius ?? HUNTER_DEFAULTS.radius ?? 16;
    this.maxHealth =
      config.maxHealth ?? config.health ?? HUNTER_DEFAULTS.health ?? 48;
    this.health = config.health ?? this.maxHealth;

    this.preferredDistance =
      config.preferredDistance ?? HUNTER_DEFAULTS.preferredDistance ?? 175;
    this.maxSpeed = config.maxSpeed ?? HUNTER_DEFAULTS.speed ?? 120;
    this.acceleration =
      config.acceleration ?? HUNTER_DEFAULTS.acceleration ?? 220;
    this.projectileSpeed =
      config.projectileSpeed ?? HUNTER_DEFAULTS.projectileSpeed ?? 420;
    this.projectileDamage =
      config.projectileDamage ?? HUNTER_DEFAULTS.projectileDamage ?? 12;
    this.projectileLifetime =
      config.projectileLifetime ?? HUNTER_DEFAULTS.projectileLifetime ?? 1.5;
    this.fireRange = config.fireRange ?? HUNTER_DEFAULTS.fireRange ?? 520;
    this.fireSpread = config.fireSpread ?? HUNTER_DEFAULTS.fireSpread ?? 0;

    this.burstCount = config.burstCount ?? HUNTER_DEFAULTS.burstCount ?? 3;
    this.burstInterval =
      config.burstInterval ?? HUNTER_DEFAULTS.burstInterval ?? 3.5;
    this.burstDelay = config.burstDelay ?? HUNTER_DEFAULTS.burstDelay ?? 0.15;
    this.burstCooldown = this.randomRange(0.5, this.burstInterval);
    this.burstShotsRemaining = 0;
    this.burstDelayTimer = 0;
    this.currentBurstId = 0;

    this.random = this.resolveRandom({ ...config, id: this.id });
    this.aimRandom = this.random?.fork
      ? this.random.fork('hunter:aim')
      : this.random;
    this.maneuverRandom = this.random?.fork
      ? this.random.fork('hunter:maneuver')
      : this.random;

    this.orbitDirection = config.orbitDirection ?? this.randomDirection();
    this.orbitPhase = config.orbitPhase ?? this.randomPhase();
    this.destroyed = false;
    const turretAngle =
      Number.isFinite(config.turretAngle) && config.turretAngle !== null
        ? config.turretAngle
        : this.rotation;
    this.turretAngle = Number.isFinite(turretAngle) ? turretAngle : 0;

    return this;
  }

  resolveRandom(config = {}) {
    if (config.random && typeof config.random.float === 'function') {
      return config.random;
    }

    if (this.system && typeof this.system.getRandomScope === 'function') {
      const scope = config.randomScope || 'hunter';
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

  randomDirection() {
    const randomSource = this.maneuverRandom || this.random;
    if (randomSource && typeof randomSource.chance === 'function') {
      return randomSource.chance(0.5) ? 1 : -1;
    }
    return 1;
  }

  randomPhase() {
    const randomSource = this.maneuverRandom || this.random;
    if (randomSource && typeof randomSource.range === 'function') {
      return randomSource.range(0, Math.PI * 2);
    }
    return 0;
  }

  randomRange(min, max) {
    const randomSource = this.maneuverRandom || this.random;
    if (randomSource && typeof randomSource.range === 'function') {
      return randomSource.range(min, max);
    }
    return (min + max) * 0.5;
  }

  onUpdate(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (!this.useComponents || !this.components?.size) {
      console.error('[Hunter] Components not initialized. Hunter cannot update.');
      return;
    }
    const context = this.buildComponentContext(deltaTime);
    this.runComponentUpdate(context);
  }
  onDraw(ctx) {
    if (!this.useComponents || !this.components?.size) {
      console.error('[Hunter] Components not initialized. Hunter cannot render.');
      return;
    }

    // RenderComponent handles drawing via BaseEnemy.draw()
    return;
  }

  onDestroyed(source) {
    this.destroyed = true;
    super.onDestroyed(source);
  }

  resetForPool() {
    super.resetForPool();

    this.random = null;
    this.maneuverRandom = null;
    this.aimRandom = null;

    this.preferredDistance = HUNTER_DEFAULTS.preferredDistance ?? 175;
    this.maxSpeed = HUNTER_DEFAULTS.speed ?? 120;
    this.acceleration = HUNTER_DEFAULTS.acceleration ?? 220;
    this.projectileSpeed = HUNTER_DEFAULTS.projectileSpeed ?? 420;
    this.projectileDamage = HUNTER_DEFAULTS.projectileDamage ?? 12;
    this.projectileLifetime = HUNTER_DEFAULTS.projectileLifetime ?? 1.5;
    this.fireRange = HUNTER_DEFAULTS.fireRange ?? 520;
    this.fireSpread = HUNTER_DEFAULTS.fireSpread ?? 0;

    this.burstCount = HUNTER_DEFAULTS.burstCount ?? 3;
    this.burstInterval = HUNTER_DEFAULTS.burstInterval ?? 3.5;
    this.burstDelay = HUNTER_DEFAULTS.burstDelay ?? 0.15;
    this.burstCooldown = this.burstInterval;
    this.burstShotsRemaining = 0;
    this.burstDelayTimer = 0;
    this.currentBurstId = 0;

    this.orbitDirection = 1;
    this.orbitPhase = 0;
    this.destroyed = false;
    this.turretAngle = 0;
  }

}

export default Hunter;
