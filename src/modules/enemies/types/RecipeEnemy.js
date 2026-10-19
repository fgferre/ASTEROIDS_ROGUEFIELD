import { BEHAVIORS } from '../behaviors/index.js';
import { BaseEnemy } from '../base/BaseEnemy.js';

// A frame runs every behavior's `tick` (timers, what is in flight), then every
// `steer` (velocity, facing), then every `act` (shots), each pass in the
// recipe's order, inside BaseEnemy's onUpdate hook.
const FRAME_HOOKS = ['tick', 'steer', 'act'];

/**
 * An enemy that is its recipe: the `behaviors` of its content file
 * (src/content/enemies/<id>.js), by name with their params, from
 * src/modules/enemies/behaviors/. Built only through recipeEnemyClass, which
 * gives each recipe its own subclass (the pools and the factory build it with
 * `new`). Its stats come from the recipe's `config`; a `seeded` recipe forks
 * its own random stream at spawn, as the class it replaces did (replays and
 * the golden trace depend on which do). It dies once.
 */
export class RecipeEnemy extends BaseEnemy {
  constructor(system, config = {}) {
    super(system, config);
    this.type = this.recipe.id;
    this.random = null;
    this.run('reset');
    this.destroyed = false;
    this.movementStrategy = this.recipe.components.movement.strategy;

    if (Object.keys(config).length > 0) {
      this.initialize(config);
    }
  }

  initialize(config = {}) {
    const { recipe } = this;
    this.resetForPool();
    super.initialize(config);

    this.radius = config.radius ?? recipe.config.radius;
    this.maxHealth = config.maxHealth ?? config.health ?? recipe.config.health;
    this.health = this.maxHealth;
    this.contactDamage = config.contactDamage ?? recipe.config.contactDamage;
    this.movementStrategy = (
      config.components ?? recipe.components
    ).movement.strategy;
    if (recipe.seeded) {
      this.random = this.resolveRandom({ ...config, id: this.id });
    }
    this.run('init', config);
    this.destroyed = false;
    return this;
  }

  /** 0 at full health, 1 near death (the Husk's seams glow with it). */
  get damageRatio() {
    return this.maxHealth > 0 ? 1 - this.health / this.maxHealth : 0;
  }

  /** A movement setting as spawned (Elite and Swift scale it), else the recipe's. */
  movementValue(key) {
    return this.movementConfig?.[key] ?? this.recipe.components.movement[key];
  }

  // Every behavior's `hook`, in the recipe's order.
  run(hook, ...args) {
    for (const [behavior, params] of this.steps) {
      behavior[hook]?.(this, params, ...args);
    }
  }

  onUpdate(deltaTime) {
    const player = this.system?.getCachedPlayer?.() ?? null;
    const frame = {
      live: deltaTime > 0 && this.alive,
      player,
      target: player?.position ?? null,
    };
    for (const hook of FRAME_HOOKS) {
      for (const [behavior, params] of this.steps) {
        behavior[hook]?.(this, params, deltaTime, frame);
      }
    }
  }

  // An event at its own position, plus `extra`.
  emitEvent(name, extra) {
    this.getEventBus()?.emit?.(name, {
      enemy: this,
      enemyId: this.id,
      position: { x: this.x, y: this.y },
      ...extra,
    });
  }

  // Each `takeDamage` behavior passes on what is left, or null for none.
  takeDamage(amount, source = null) {
    let left = amount;
    for (const [behavior, params] of this.steps) {
      if (!behavior.takeDamage) continue;
      left = behavior.takeDamage(this, params, left, source);
      if (left === null) return false;
    }
    return super.takeDamage(left, source);
  }

  // `dying` runs before the base death (events, affixes), `died` after it.
  onDestroyed(source, context = {}) {
    if (this.destroyed) return;
    this.destroyed = true;
    this.run('dying', source, context);
    super.onDestroyed(source, context);
    this.run('died', source, context);
  }

  resetForPool() {
    super.resetForPool();
    this.random = null;
    this.run('reset');
    this.destroyed = false;
  }
}

/**
 * The class for one recipe: its behaviors resolved by name, and their getters
 * (what the views read, e.g. `telegraphRatio`) on its prototype.
 */
export function recipeEnemyClass(recipe) {
  const steps = Object.entries(recipe.behaviors).map(([name, params]) => {
    const behavior = BEHAVIORS[name];
    if (!behavior) {
      throw new Error(`[RecipeEnemy] ${recipe.id}: no behavior '${name}'`);
    }
    return [behavior, params];
  });

  class Recipe extends RecipeEnemy {}
  const { prototype } = Recipe;
  Object.defineProperties(prototype, {
    recipe: { value: recipe },
    steps: { value: steps },
  });
  for (const [behavior, params] of steps) {
    for (const [name, getter] of Object.entries(behavior.getters ?? {})) {
      if (Object.hasOwn(prototype, name)) {
        throw new Error(
          `[RecipeEnemy] ${recipe.id}: two behaviors define '${name}'`
        );
      }
      Object.defineProperty(prototype, name, {
        get() {
          return getter(this, params);
        },
      });
    }
  }
  return Recipe;
}
