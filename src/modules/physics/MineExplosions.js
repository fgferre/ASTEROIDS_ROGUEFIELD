// src/modules/physics/MineExplosions.js
//
// A mine's blast: when an enemy whose content file has `explodesOnDeath` (a
// mine) dies, physics builds the explosion (where, how wide, how hard) from it
// and its content config and hands it to the enemy system, once per mine. The
// handled marks keep a mine that announced its own blast from going off
// twice; PhysicsSystem clears a mine's marks when the pool brings it back.

import { getContent } from '../../content/registry.js';

export class MineExplosions {
  /**
   * `enemies()`: the enemy system, or nothing (handleMineExplosion).
   * `emit(name, payload)`: sends mine-exploded when there is no enemy system.
   * `trackRadius(payload)`: grows the spatial index's search radius to the blast.
   */
  constructor({ enemies, emit, trackRadius }) {
    this.enemies = enemies;
    this.emit = emit;
    this.trackRadius = trackRadius;
    this._handledMineExplosions = new WeakSet();
    this._handledMineExplosionIds = new Set();
  }

  reset() {
    this._handledMineExplosions = new WeakSet();
    this._handledMineExplosionIds.clear();
  }

  dispatchMineExplosion(enemy, data = {}) {
    if (!enemy) {
      return;
    }

    const enemyId = data.enemyId ?? enemy.id;
    if (this.hasMineExplosionBeenHandled(enemy, enemyId)) {
      return;
    }

    const payload = this.buildMineExplosionPayload(enemy, data);
    if (!payload) {
      return;
    }

    this.markMineExplosionHandled(payload.enemy, payload.enemyId);

    this.trackRadius(payload);

    const enemySystem = this.enemies();
    if (enemySystem) {
      enemySystem.handleMineExplosion(payload);
      return;
    }

    // Fallback: emit event only if not already emitted by Mine itself
    // Prevent double-emission if Mine already emitted the event
    if (data.__emittedByMine || payload.__emittedByMine) {
      return;
    }
    this.emit('mine-exploded', payload);
  }

  buildMineExplosionPayload(enemy, data = {}) {
    if (!enemy) {
      return null;
    }

    const defaults = getContent('enemies', enemy.type)?.config ?? {};
    const position = data.position || {
      x: Number.isFinite(enemy.x) ? enemy.x : 0,
      y: Number.isFinite(enemy.y) ? enemy.y : 0,
    };

    const velocity = data.velocity || {
      x: Number.isFinite(enemy.vx) ? enemy.vx : 0,
      y: Number.isFinite(enemy.vy) ? enemy.vy : 0,
    };

    const radiusCandidates = [
      data.explosionRadius,
      enemy.explosionRadius,
      enemy.radius,
      defaults.explosionRadius,
      defaults.radius,
    ].filter((value) => Number.isFinite(value));

    const damageCandidates = [
      data.explosionDamage,
      enemy.explosionDamage,
      defaults.explosionDamage,
    ].filter((value) => Number.isFinite(value));

    const fallbackRadius = Number.isFinite(defaults.explosionRadius)
      ? defaults.explosionRadius
      : Number.isFinite(defaults.radius)
        ? defaults.radius
        : Number.isFinite(enemy.radius)
          ? enemy.radius
          : 0;
    const radius = radiusCandidates.length
      ? Math.max(...radiusCandidates)
      : fallbackRadius;

    const fallbackDamage = Number.isFinite(defaults.explosionDamage)
      ? defaults.explosionDamage
      : Number.isFinite(enemy.explosionDamage)
        ? enemy.explosionDamage
        : 0;
    const damage = damageCandidates.length
      ? damageCandidates[0]
      : fallbackDamage;

    return {
      enemy,
      enemyId: enemy.id,
      enemyType: enemy.type,
      wave: data.wave ?? enemy.wave,
      position,
      velocity,
      radius,
      damage,
      cause: data.cause ?? enemy.explosionCause?.cause ?? 'detonation',
      context: data.context ?? enemy.explosionCause?.context ?? {},
      source: data.source ?? {
        id: enemy.id,
        type: enemy.type,
        wave: enemy.wave,
      },
    };
  }

  hasMineExplosionBeenHandled(enemy, enemyId) {
    if (enemy && this._handledMineExplosions.has(enemy)) {
      return true;
    }

    const id = enemyId ?? enemy?.id;
    if (id != null && this._handledMineExplosionIds.has(id)) {
      return true;
    }

    return false;
  }

  markMineExplosionHandled(enemy, enemyId) {
    if (enemy && typeof enemy === 'object') {
      this._handledMineExplosions.add(enemy);
      if (enemy.id != null) {
        this._handledMineExplosionIds.add(enemy.id);
      }
    }

    if (enemyId != null) {
      this._handledMineExplosionIds.add(enemyId);
    }
  }

  clearMineExplosionTracking(enemy, enemyId) {
    if (enemy && this._handledMineExplosions) {
      this._handledMineExplosions.delete(enemy);
    }

    const id = enemyId ?? enemy?.id;
    if (id != null) {
      this._handledMineExplosionIds.delete(id);
    }
  }
}
