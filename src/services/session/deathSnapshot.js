// src/services/session/deathSnapshot.js
//
// What a retry rewinds to: the snapshot taken when the ship dies (hull and
// health, build, field, physics, RNG state) and its restoration, with the
// upgrade effects re-applied on top of the reset stats.

import { debugLog } from '../../core/debugLogging.js';
import { logRandomSnapshot } from './randomScopes.js';

export class DeathSnapshot {
  /**
   * `random`: the seeded random service, serialized into the snapshot.
   * `gameState`: the raw game state; mirrors the snapshot.
   * `seedInfo`: the boot seed `{ seed, source }` (the RNG scopes' own object).
   * `currentRandomSnapshot()`: the RNG snapshot of the current scope, or null.
   * `prepareRandomForScope(scope, options)`: resets or restores the RNG.
   * `resolveServiceInstance(name)`: a session service by name, or null.
   * `getConfiguredHullId()`: the hull the player flies.
   * `applyConfiguredPlayerHull({ hullId })`: puts a hull on the player.
   */
  constructor({
    random,
    gameState,
    seedInfo,
    currentRandomSnapshot,
    prepareRandomForScope,
    resolveServiceInstance,
    getConfiguredHullId,
    applyConfiguredPlayerHull,
  }) {
    this.random = random;
    this.gameState = gameState;
    this.seedInfo = seedInfo;
    this.currentRandomSnapshot = currentRandomSnapshot;
    this.prepareRandomForScope = prepareRandomForScope;
    this.resolveServiceInstance = resolveServiceInstance;
    this.getConfiguredHullId = getConfiguredHullId;
    this.applyConfiguredPlayerHull = applyConfiguredPlayerHull;
    this.randomSnapshot = null;
    this.deathSnapshot = null;
  }

  clearDeathSnapshot() {
    this.deathSnapshot = null;
    this.randomSnapshot = null;

    if (this.gameState) {
      this.gameState.deathSnapshot = null;
      this.gameState.randomSnapshot = null;
    }
  }

  hasDeathSnapshot() {
    return Boolean(this.deathSnapshot || this.gameState?.deathSnapshot);
  }

  getDeathSnapshot() {
    return this.deathSnapshot || this.gameState?.deathSnapshot || null;
  }

  createDeathSnapshot() {
    const player = this.resolveServiceInstance('player');
    const enemies = this.resolveServiceInstance('enemies');
    const physics = this.resolveServiceInstance('physics');
    const progression = this.resolveServiceInstance('progression');

    if (!player || !enemies || !physics || !progression) {
      console.warn(
        '[Retry] Unable to capture snapshot - required services unavailable.'
      );
      return null;
    }

    let randomSnapshot = null;
    if (this.random && typeof this.random.serialize === 'function') {
      try {
        randomSnapshot = this.random.serialize();
      } catch (error) {
        console.warn(
          '[Random] Failed to serialize RNG during death snapshot:',
          error
        );
      }
    }

    if (!randomSnapshot) {
      randomSnapshot =
        this.currentRandomSnapshot() || this.gameState?.randomSnapshot || null;
    }

    if (randomSnapshot) {
      logRandomSnapshot('death.snapshot', randomSnapshot, {
        mode: 'snapshot',
      });
    }

    const playerSnapshot = {
      maxHealth: Number.isFinite(player.maxHealth) ? player.maxHealth : null,
      health: Number.isFinite(player.health) ? player.health : null,
      position: player.position ? { ...player.position } : null,
      hullId:
        typeof player.currentHull?.id === 'string'
          ? player.currentHull.id
          : this.getConfiguredHullId(),
    };

    if (Array.isArray(player.upgrades)) {
      playerSnapshot.upgrades = [...player.upgrades];
    }

    const progressionSnapshot =
      typeof progression.serialize === 'function'
        ? progression.serialize()
        : null;

    const enemySnapshot =
      typeof enemies.getSnapshotState === 'function'
        ? enemies.getSnapshotState()
        : typeof enemies.exportState === 'function'
          ? enemies.exportState()
          : null;

    const physicsSnapshot =
      typeof physics.getSnapshotState === 'function'
        ? physics.getSnapshotState()
        : typeof physics.exportState === 'function'
          ? physics.exportState()
          : null;

    const snapshot = {
      player: playerSnapshot,
      progression: progressionSnapshot,
      enemies: enemySnapshot,
      physics: physicsSnapshot,
      timestamp: Date.now(),
      randomSeed: this.gameState?.randomSeed ?? this.seedInfo.seed,
      random: randomSnapshot,
    };

    this.deathSnapshot = snapshot;
    this.randomSnapshot = randomSnapshot;

    if (this.gameState) {
      this.gameState.deathSnapshot = snapshot;
      if (randomSnapshot) {
        this.gameState.randomSnapshot = randomSnapshot;
      }
    }

    debugLog('[Retry] Death snapshot created', snapshot);
    return snapshot;
  }

  restoreFromSnapshot({ snapshot } = {}) {
    const payload =
      snapshot || this.deathSnapshot || this.gameState?.deathSnapshot;

    if (!payload) {
      console.warn('[Retry] No snapshot available');
      return false;
    }

    const player = this.resolveServiceInstance('player');
    const enemies = this.resolveServiceInstance('enemies');
    const physics = this.resolveServiceInstance('physics');
    const progression = this.resolveServiceInstance('progression');

    if (!player || !enemies || !physics || !progression) {
      console.warn('[Retry] Cannot restore snapshot - missing services');
      return false;
    }

    const rngSnapshot =
      payload.random ||
      this.randomSnapshot ||
      this.currentRandomSnapshot() ||
      null;

    if (rngSnapshot) {
      this.prepareRandomForScope('snapshot.restore', {
        mode: 'restore',
        snapshot: rngSnapshot,
      });
    } else {
      this.prepareRandomForScope('snapshot.restore', { mode: 'reset' });
    }

    let hadFallback = false;

    if (typeof player.reset === 'function') {
      try {
        player.reset();
      } catch (error) {
        console.warn(
          '[Retry] Failed to reset player before restoration:',
          error
        );
      }
    }

    this.applyConfiguredPlayerHull({ hullId: payload.player?.hullId });
    // The orbs' pull starts from base too: the upgrades are re-applied below.
    this.resolveServiceInstance('xpOrbs').resetMagnetism();

    let progressionRestored = false;
    if (payload.progression && typeof progression.restoreState === 'function') {
      try {
        progressionRestored =
          progression.restoreState(payload.progression) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to restore progression snapshot:', error);
      }
    } else if (
      payload.progression &&
      typeof progression.deserialize === 'function'
    ) {
      try {
        progression.deserialize(payload.progression, { suppressEvents: false });
        progressionRestored = true;
      } catch (error) {
        console.warn(
          '[Retry] Failed to deserialize progression snapshot:',
          error
        );
      }
    }

    if (!progressionRestored) {
      hadFallback = true;
      console.warn(
        '[Retry] Progression snapshot unavailable - performing reset.'
      );
      if (typeof progression.reset === 'function') {
        progression.reset();
      }
    }

    if (progressionRestored) {
      const {
        reapplied: reappliedUpgrades,
        total: totalUpgradeLevels,
        errors: upgradeReapplyErrors,
      } = this.reapplyProgressionUpgrades({
        progression,
        snapshot: payload.progression,
      });

      if (totalUpgradeLevels > 0) {
        if (upgradeReapplyErrors > 0) {
          hadFallback = true;
          console.warn(
            '[Retry] Failed to fully reapply upgrade effects after restoration.',
            {
              reapplied: reappliedUpgrades,
              total: totalUpgradeLevels,
              errors: upgradeReapplyErrors,
            }
          );
        } else {
          debugLog(
            '[Retry] Reapplied upgrade effects after snapshot restore:',
            reappliedUpgrades
          );
        }
      }
    }

    // After the upgrades, which rebuilt every stat from the reset ones: the
    // hull at death (its max included) comes back as it was, at full health.
    if (payload.player) {
      const { maxHealth, health, position, upgrades } = payload.player;

      const hasValidMaxHealth = Number.isFinite(maxHealth) && maxHealth > 0;
      if (hasValidMaxHealth) {
        player.maxHealth = maxHealth;
      }

      if (Array.isArray(upgrades)) {
        player.upgrades = [...upgrades];
      }

      let nextHealth = null;
      if (hasValidMaxHealth) {
        nextHealth = maxHealth;
      } else if (Number.isFinite(health) && health > 0) {
        nextHealth = health;
      }

      if (Number.isFinite(nextHealth)) {
        player.health = nextHealth;
      } else if (Number.isFinite(player.maxHealth) && player.maxHealth > 0) {
        player.health = player.maxHealth;
      }

      if (position && typeof position === 'object') {
        if (!player.position) {
          player.position = { x: 0, y: 0 };
        }

        if (Number.isFinite(position.x)) {
          player.position.x = position.x;
        }

        if (Number.isFinite(position.y)) {
          player.position.y = position.y;
        }
      }
    } else {
      hadFallback = true;
      console.warn(
        '[Retry] Player snapshot missing - player reset to defaults.'
      );
    }

    let enemiesRestored = false;
    if (payload.enemies && typeof enemies.restoreSnapshotState === 'function') {
      try {
        enemiesRestored =
          enemies.restoreSnapshotState(payload.enemies) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to restore enemy snapshot:', error);
      }
    } else if (payload.enemies && typeof enemies.importState === 'function') {
      try {
        enemiesRestored = enemies.importState(payload.enemies) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to import enemy snapshot:', error);
      }
    }

    if (!enemiesRestored) {
      hadFallback = true;
      console.warn('[Retry] Enemy snapshot unavailable - performing reset.');
      if (typeof enemies.reset === 'function') {
        enemies.reset();
      }
    }

    let physicsRestored = false;
    if (payload.physics && typeof physics.restoreSnapshotState === 'function') {
      try {
        physicsRestored =
          physics.restoreSnapshotState(payload.physics) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to restore physics snapshot:', error);
      }
    } else if (payload.physics && typeof physics.importState === 'function') {
      try {
        physicsRestored = physics.importState(payload.physics) !== false;
      } catch (error) {
        console.warn('[Retry] Failed to import physics snapshot:', error);
      }
    }

    if (!physicsRestored) {
      hadFallback = true;
      console.warn('[Retry] Physics snapshot unavailable - performing reset.');
      if (typeof physics.reset === 'function') {
        physics.reset();
      }
    }

    this.deathSnapshot = payload;
    if (payload.random) {
      this.randomSnapshot = payload.random;
      if (this.gameState) {
        this.gameState.randomSnapshot = payload.random;
      }
    }

    if (!hadFallback) {
      debugLog('[Retry] Game state restored from snapshot');
    } else {
      console.warn('[Retry] Snapshot restore completed with fallbacks.');
    }

    return true;
  }

  reapplyProgressionUpgrades({ progression, snapshot } = {}) {
    if (!progression || typeof progression.applyUpgradeEffects !== 'function') {
      return { reapplied: 0, total: 0, errors: 0 };
    }

    let entries = [];

    if (Array.isArray(snapshot?.appliedUpgrades)) {
      entries = snapshot.appliedUpgrades
        .map((entry) => {
          if (Array.isArray(entry) && entry.length >= 2) {
            return [entry[0], entry[1]];
          }

          if (entry && typeof entry === 'object') {
            return [entry.id, entry.level];
          }

          return null;
        })
        .filter((entry) => entry && typeof entry[0] === 'string');
    }

    if (
      entries.length === 0 &&
      typeof progression.getAllUpgrades === 'function'
    ) {
      entries = Array.from(progression.getAllUpgrades().entries());
    }

    if (!entries.length) {
      return { reapplied: 0, total: 0, errors: 0 };
    }

    if (typeof progression.refreshInjectedServices === 'function') {
      try {
        progression.refreshInjectedServices(true);
      } catch (error) {
        console.warn(
          '[Retry] Failed to refresh progression services before reapply:',
          error
        );
      }
    }

    let reapplied = 0;
    let total = 0;
    let errors = 0;

    const upgradeLookup = progression && progression.upgradeLookup;

    entries.forEach(([upgradeId, level]) => {
      if (!upgradeId || !Number.isFinite(level)) {
        return;
      }

      const normalizedLevel = Math.max(0, Math.floor(level));
      if (normalizedLevel <= 0) {
        return;
      }

      const definition =
        upgradeLookup && typeof upgradeLookup.get === 'function'
          ? upgradeLookup.get(upgradeId)
          : null;
      if (!definition) {
        total += normalizedLevel;
        errors += normalizedLevel;
        console.warn(
          '[Retry] Missing upgrade definition during reapply:',
          upgradeId
        );
        return;
      }

      const levels = Array.isArray(definition.levels) ? definition.levels : [];

      for (let index = 0; index < normalizedLevel; index += 1) {
        total += 1;
        const levelDefinition = levels[index];

        if (!levelDefinition) {
          errors += 1;
          console.warn(
            '[Retry] Missing level definition during upgrade reapply:',
            upgradeId,
            'level',
            index + 1
          );
          continue;
        }

        try {
          progression.applyUpgradeEffects(
            definition,
            levelDefinition,
            index + 1
          );
          reapplied += 1;
        } catch (error) {
          errors += 1;
          console.warn(
            '[Retry] Failed to apply upgrade effect during reapply:',
            upgradeId,
            'level',
            index + 1,
            error
          );
        }
      }
    });

    return { reapplied, total, errors };
  }
}
