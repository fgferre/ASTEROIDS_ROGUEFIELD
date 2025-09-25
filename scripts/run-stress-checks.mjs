#!/usr/bin/env node

class StubServiceLocator {
  constructor() {
    this.services = new Map();
  }

  register(name, service) {
    if (typeof name !== 'string') {
      return false;
    }
    this.services.set(name, service);
    return true;
  }

  has(name) {
    return this.services.has(name);
  }

  get(name) {
    return this.services.get(name);
  }

  unregister(name) {
    return this.services.delete(name);
  }
}

class StubEventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, callback, context = null) {
    if (typeof eventName !== 'string' || typeof callback !== 'function') {
      return;
    }
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    this.listeners.get(eventName).push({ callback, context });
  }

  emit(eventName, data = null) {
    const listeners = this.listeners.get(eventName);
    if (!listeners) {
      return;
    }
    for (const { callback, context } of listeners) {
      try {
        if (context) {
          callback.call(context, data);
        } else {
          callback(data);
        }
      } catch (error) {
        console.error(`[stress] listener error for ${eventName}:`, error);
      }
    }
  }

  emitSilently(eventName, data = null) {
    this.emit(eventName, data);
  }
}

if (typeof globalThis.Path2D === 'undefined') {
  globalThis.Path2D = class Path2DStub {
    arc() {}
  };
}

globalThis.gameServices = new StubServiceLocator();
globalThis.gameEvents = new StubEventBus();

globalThis.performance = globalThis.performance || {
  now: () => Date.now(),
};

const eventCounters = {
  experienceChanged: 0,
  playerLeveledUp: 0,
  xpCollected: 0,
  xpOrbCollected: 0,
};

globalThis.gameEvents.on('experience-changed', () => {
  eventCounters.experienceChanged += 1;
});

globalThis.gameEvents.on('player-leveled-up', () => {
  eventCounters.playerLeveledUp += 1;
});

globalThis.gameEvents.on('xp-collected', () => {
  eventCounters.xpCollected += 1;
});

globalThis.gameEvents.on('xp-orb-collected', () => {
  eventCounters.xpOrbCollected += 1;
});

const playerStub = {
  position: { x: 0, y: 0 },
  getPosition() {
    return { x: this.position.x, y: this.position.y };
  },
  setPosition(x, y) {
    this.position.x = x;
    this.position.y = y;
  },
  getMagnetismRadius() {
    return 320;
  },
};

globalThis.gameServices.register('player', playerStub);

const enemiesStub = {
  forEachActiveAsteroid(callback) {
    if (typeof callback !== 'function' || !globalThis.__physicsInstance) {
      return;
    }
    globalThis.__physicsInstance.activeAsteroids.forEach((asteroid) => {
      callback(asteroid);
    });
  },
  getAsteroids() {
    if (!globalThis.__physicsInstance) {
      return [];
    }
    return Array.from(globalThis.__physicsInstance.activeAsteroids);
  },
};

globalThis.gameServices.register('enemies', enemiesStub);

const { default: ProgressionSystem } = await import(
  '../src/modules/ProgressionSystem.js'
);
const { default: XPOrbSystem } = await import(
  '../src/modules/XPOrbSystem.js'
);
const { default: PhysicsSystem } = await import(
  '../src/modules/PhysicsSystem.js'
);

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const progression = new ProgressionSystem();
const xpSystem = new XPOrbSystem();
const physics = new PhysicsSystem();

globalThis.__physicsInstance = physics;

const initialLevel = progression.level;
const initialRequirement = progression.experienceToNext;
const levelScaling = progression.levelScaling;

const overflowGain = initialRequirement * 3 + 50;

function simulateLevelUps(requirement, scaling, xpGain) {
  let remaining = xpGain;
  let currentRequirement = requirement;
  let levels = 0;
  while (remaining >= currentRequirement) {
    remaining -= currentRequirement;
    levels += 1;
    currentRequirement = Math.floor(currentRequirement * scaling);
  }
  return { levels, remaining, nextRequirement: currentRequirement };
}

const expectedProgress = simulateLevelUps(
  initialRequirement,
  levelScaling,
  overflowGain
);

const overflowResult = progression.collectXP(overflowGain);

assertCondition(
  overflowResult.levels === expectedProgress.levels,
  'Level count mismatch during overflow stress scenario.'
);
assertCondition(
  progression.level === initialLevel + expectedProgress.levels,
  'Unexpected player level after overflow scenario.'
);
assertCondition(
  progression.experience === expectedProgress.remaining,
  'Overflow remainder did not match expected leftover XP.'
);
assertCondition(
  progression.experienceToNext === expectedProgress.nextRequirement,
  'Next level requirement mismatch after overflow scenario.'
);

const ORB_STRESS_COUNT = 150;
const ORB_STRESS_RADIUS = 240;
for (let i = 0; i < ORB_STRESS_COUNT; i += 1) {
  const angle = (i / ORB_STRESS_COUNT) * Math.PI * 2;
  const distance = ORB_STRESS_RADIUS + (i % 12);
  xpSystem.createXPOrb(
    Math.cos(angle) * distance,
    Math.sin(angle) * distance,
    xpSystem.baseOrbValue * ((i % 5) + 1)
  );
}

xpSystem.setMagnetismRadius(360);
xpSystem.setMagnetismForce(360);

const frameTime = 1 / 60;
for (let frame = 0; frame < 360; frame += 1) {
  xpSystem.update(frameTime);
}

const remainingOrbs = xpSystem.getActiveOrbs().length;
assertCondition(
  remainingOrbs < ORB_STRESS_COUNT,
  'Magnetism stress test did not collect any orbs.'
);
assertCondition(
  eventCounters.xpOrbCollected > 0,
  'Magnetism stress test did not trigger xp-orb-collected events.'
);
assertCondition(
  progression.totalExperience > overflowGain,
  'XP total did not increase after orb stress scenario.'
);

const ASTEROID_COUNT = 25;
const asteroids = [];
for (let i = 0; i < ASTEROID_COUNT; i += 1) {
  const angle = (i / ASTEROID_COUNT) * Math.PI * 2;
  const distance = 180 + (i % 5) * 12;
  const asteroid = {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
    radius: 22,
    destroyed: false,
  };
  asteroids.push(asteroid);
  physics.registerAsteroid(asteroid);
}

physics.ensureSpatialIndex();

let nearbyCount = 0;
physics.forEachNearbyAsteroid({ x: 0, y: 0 }, 260, () => {
  nearbyCount += 1;
});

assertCondition(
  nearbyCount === ASTEROID_COUNT,
  'Physics broad-phase did not return all nearby asteroids.'
);

const bullets = asteroids.map((asteroid) => ({
  x: asteroid.x + 1,
  y: asteroid.y + 1,
  vx: 0,
  vy: 0,
  hit: false,
  life: 1,
}));

let collisionCount = 0;
physics.forEachBulletCollision(bullets, (bullet, asteroid) => {
  bullet.hit = true;
  collisionCount += 1;
});

assertCondition(
  collisionCount === ASTEROID_COUNT,
  'Physics bullet collision pass missed expected impacts.'
);

const summary = {
  overflow: {
    xpGain: overflowGain,
    levelsGained: overflowResult.levels,
    events: {
      experienceChanged: eventCounters.experienceChanged,
      playerLeveledUp: eventCounters.playerLeveledUp,
    },
  },
  orbStress: {
    spawned: ORB_STRESS_COUNT,
    remaining: remainingOrbs,
    collectedEvents: eventCounters.xpOrbCollected,
  },
  physicsStress: {
    asteroids: ASTEROID_COUNT,
    nearbyCount,
    collisionCount,
  },
};

console.log(JSON.stringify(summary, null, 2));
