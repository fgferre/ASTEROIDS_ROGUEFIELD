/**
 * Create a test asteroid entity with sensible defaults for integration tests.
 *
 * @param {Partial<{type: string, size: string, variant: string, radius: number, x: number, y: number, vx: number, vy: number, rotation: number, rotationSpeed: number, wave: number, crackSeed: number}>} [overrides] - Properties that override the defaults.
 * @returns {{type: string, size: string, variant: string, radius: number, x: number, y: number, vx: number, vy: number, rotation: number, rotationSpeed: number, wave: number, crackSeed: number}}
 * @example
 * const asteroid = createTestAsteroid({ size: 'small', x: 200 });
 * expect(asteroid.size).toBe('small');
 */
export function createTestAsteroid(overrides = {}) {
  return {
    type: 'asteroid',
    size: 'large',
    variant: 'common',
    radius: 24,
    x: 100,
    y: 150,
    vx: 0,
    vy: 0,
    rotation: 0,
    rotationSpeed: 0,
    wave: 1,
    crackSeed: 0,
    ...overrides,
  };
}

/**
 * Create a test enemy entity for multiple enemy types.
 *
 * @param {'asteroid'|'drone'|'mine'|'hunter'|'boss'} type - Enemy type to create.
 * @param {Record<string, any>} [overrides] - Optional overrides for the generated entity.
 * @returns {Record<string, any>}
 * @example
 * const drone = createTestEnemy('drone', { x: 250 });
 */
export function createTestEnemy(type, overrides = {}) {
  const baseByType = {
    asteroid: createTestAsteroid(),
    drone: {
      type: 'drone',
      x: 100,
      y: 150,
      wave: 1,
      radius: 16,
    },
    mine: {
      type: 'mine',
      x: 100,
      y: 150,
      wave: 1,
      radius: 12,
    },
    hunter: {
      type: 'hunter',
      x: 100,
      y: 150,
      wave: 1,
      radius: 18,
    },
    boss: {
      type: 'boss',
      x: 400,
      y: 100,
      wave: 5,
      radius: 60,
      health: 2592,
    },
  };

  if (!baseByType[type]) {
    throw new Error(`Unsupported enemy type: ${type}`);
  }

  const baseEntity = baseByType[type];
  return {
    ...baseEntity,
    ...overrides,
  };
}

/**
 * Create a test world stub that exposes deterministic bounds.
 *
 * @param {{width: number, height: number}} [bounds={ width: 800, height: 600 }] - World bounds to report.
 * @returns {{getBounds: () => {width: number, height: number}}}
 * @example
 * const world = createTestWorld({ width: 1024, height: 768 });
 * expect(world.getBounds().width).toBe(1024);
 */
export function createTestWorld(bounds = { width: 800, height: 600 }) {
  return {
    getBounds() {
      return bounds;
    },
  };
}

/**
 * Create a test player entity with basic kinematic helpers.
 *
 * @param {Partial<{x: number, y: number, position: {x: number, y: number}, velocity: {vx: number, vy: number}, health: number, maxHealth: number, getVelocity: () => {vx: number, vy: number}, getPosition: () => {x: number, y: number}}>} [overrides]
 * @returns {{x: number, y: number, position: {x: number, y: number}, velocity: {vx: number, vy: number}, health: number, maxHealth: number, getVelocity: () => {vx: number, vy: number}, getPosition: () => {x: number, y: number}}}
 * @example
 * const player = createTestPlayer({ health: 75 });
 * expect(player.getVelocity()).toEqual({ vx: 0, vy: 0 });
 */
export function createTestPlayer(overrides = {}) {
  const position = overrides.position ?? { x: 400, y: 300 };
  const velocity = overrides.velocity ?? { vx: 0, vy: 0 };

  return {
    x: position.x,
    y: position.y,
    position,
    velocity,
    health: 100,
    maxHealth: 100,
    getVelocity() {
      return this.velocity;
    },
    getPosition() {
      return this.position;
    },
    ...overrides,
  };
}

/**
 * Create a physics system stub used in integration tests.
 *
 * @returns {{bootstrapFromEnemySystem: () => void}}
 * @example
 * const physics = createTestPhysics();
 * physics.bootstrapFromEnemySystem();
 */
export function createTestPhysics() {
  return {
    bootstrapFromEnemySystem() {},
  };
}

/**
 * Create a deterministic progression system stub.
 *
 * @param {number} [level=1] - Level returned by getLevel.
 * @returns {{getLevel: () => number}}
 * @example
 * const progression = createTestProgression(3);
 * expect(progression.getLevel()).toBe(3);
 */
export function createTestProgression(level = 1) {
  return {
    getLevel() {
      return level;
    },
  };
}
