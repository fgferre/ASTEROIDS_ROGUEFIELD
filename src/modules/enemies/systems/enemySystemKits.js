// src/modules/enemies/systems/enemySystemKits.js
// What each part of EnemySystem is handed of it: getters that read the
// system when called, so a part always sees its current state, and the
// calls it makes back. EnemySystem's constructor builds the parts in order
// (rewards, bosses, field, combat relay, snapshots), so a part handed an
// earlier one gets it already built; the update sub-system's context is the
// last, built in setupUpdateSystem.

/** The reward helpers: the bus, the reward manager, the wave, the orbs and the ship. */
export function rewardsKit(system) {
  return {
    getEventBus: () => system.eventBus,
    getRewardManager: () => system.rewardManager,
    getWaveState: () => system.waveState,
    getXPOrbs: () => system.xpOrbs,
    getPlayer: () => system.player,
  };
}

/** The boss module: the rewards, the field and the calls that register, track and release an enemy. */
export function bossesKit(system) {
  return {
    rewards: system.rewards,
    getFactory: () => system.factory,
    getWaveState: () => system.waveState,
    getAsteroids: () => system.asteroids,
    getPhysics: () => system.physics,
    getSessionStats: () => system.sessionStats,
    getCachedUI: () => system.getCachedUI(),
    getCachedEffects: () => system.getCachedEffects(),
    getCachedAudio: () => system.getCachedAudio(),
    registerActiveEnemy: (...args) => system.registerActiveEnemy(...args),
    warnIfWaveManagerRegistrationFailed: (...args) =>
      system.warnIfWaveManagerRegistrationFailed(...args),
    registerEnemyWithPhysics: (enemy) => system.registerEnemyWithPhysics(enemy),
    unregisterEnemyFromPhysics: (enemy) =>
      system.unregisterEnemyFromPhysics(enemy),
    removeActiveEnemy: (enemy) => system.removeActiveEnemy(enemy),
    releaseAsteroid: (asteroid) => system.releaseAsteroid(asteroid),
  };
}

/** The field: the list, the factory and the calls that let an enemy go. */
export function fieldKit(system) {
  return {
    bosses: system.bosses,
    getAsteroids: () => system.asteroids,
    getFactory: () => system.factory,
    getUseFactory: () => system.useFactory,
    unregisterEnemyFromPhysics: (enemy) =>
      system.unregisterEnemyFromPhysics(enemy),
    clearAsteroidPoolId: (asteroid) => system.clearAsteroidPoolId(asteroid),
  };
}

/** The relay between enemy fire and the combat, the physics and the ship. */
export function combatRelayKit(system) {
  return {
    bosses: system.bosses,
    enemyRandom: system.enemyRandom,
    getAsteroids: () => system.asteroids,
    getPhysics: () => system.physics,
    getCachedCombat: () => system.getCachedCombat(),
    applyDirectDamageToPlayer: (...args) =>
      system.applyDirectDamageToPlayer(...args),
    // A boss's attack goes on to the physics with the enemy system in hand.
    getCachedPlayer: () => system.getCachedPlayer(),
    getEnemySystem: () => system,
  };
}

/** A Retry's snapshot: what it reads and writes back on the system, and how it builds an enemy again. */
export function snapshotsKit(system) {
  return {
    bosses: system.bosses,
    enemyRandom: system.enemyRandom,
    field: system.field,
    getAsteroids: () => system.asteroids,
    setAsteroids: (asteroids) => (system.asteroids = asteroids),
    getSessionStats: () => system.sessionStats,
    setSessionStats: (sessionStats) => (system.sessionStats = sessionStats),
    getSessionActive: () => system.sessionActive,
    setSessionActive: (sessionActive) => (system.sessionActive = sessionActive),
    setLastWaveManagerCompletionHandled: (wave) =>
      (system._lastWaveManagerCompletionHandled = wave),
    setSnapshotFallbackWarningIssued: (issued) =>
      (system._snapshotFallbackWarningIssued = issued),
    getWaveState: () => system.waveState,
    getWaveManager: () => system.waveManager,
    getFactory: () => system.factory,
    getUseFactory: () => system.useFactory,
    createInitialSessionStats: () => system.createInitialSessionStats(),
    assignAsteroidPoolId: (...args) => system.assignAsteroidPoolId(...args),
    acquireAsteroid: (config) => system.acquireAsteroid(config),
    acquireEnemyViaFactory: (type, config) =>
      system.acquireEnemyViaFactory(type, config),
    registerActiveEnemy: (...args) => system.registerActiveEnemy(...args),
    warnIfWaveManagerRegistrationFailed: (...args) =>
      system.warnIfWaveManagerRegistrationFailed(...args),
    syncPhysicsIntegration: (force) => system.syncPhysicsIntegration(force),
    handleSnapshotFallback: (reason) => system._handleSnapshotFallback(reason),
    createEnemy: (EnemyClass, config) => new EnemyClass(system, config),
  };
}

/** The update sub-system: the field, the components and the services it steps. */
export function updateContext(system) {
  return {
    facade: system,
    get spawnSystem() {
      return system.spawnSystem;
    },
    get damageSystem() {
      return system.damageSystem;
    },
    get asteroids() {
      return system.asteroids;
    },
    get sessionStats() {
      return system.sessionStats;
    },
    get useComponents() {
      return system.useComponents;
    },
    get movementComponent() {
      return system.movementComponent;
    },
    get collisionComponent() {
      return system.collisionComponent;
    },
    get genericMovement() {
      return system.genericMovement;
    },
    get waveManager() {
      return system.waveManager;
    },
    refreshServiceState: (...args) => system.refreshServiceState?.(...args),
    getCachedPlayer: (...args) => system.getCachedPlayer?.(...args),
    getCachedWorld: (...args) => system.getCachedWorld?.(...args),
    getCachedPhysics: (...args) => system.getCachedPhysics?.(...args),
    getRandomScope: (...args) => system.getRandomScope?.(...args),
    getRandomService: (...args) => system.getRandomService?.(...args),
    getActiveEnemyCount: (...args) => system.getActiveEnemyCount?.(...args),
    invalidateActiveEnemyCache: (...args) =>
      system.invalidateActiveEnemyCache?.(...args),
    releaseAsteroid: (...args) => system.releaseAsteroid?.(...args),
  };
}
