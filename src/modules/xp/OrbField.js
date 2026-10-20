import { GamePools } from '../../core/GamePools.js';
import { ORB_CLASS_SEQUENCE } from './orbClasses.js';

export const ORB_SPATIAL_NEIGHBOURS = [-1, 0, 1];

/**
 * Where the XP orbs live: the list, the per-class lists, the GamePools
 * lifecycle that lends and takes back each orb object, and the spatial grid
 * the other modules search. Fusion, spacing and the magnet read and move
 * orbs through it.
 */
export class OrbField {
  /**
   * @param {Object} kit
   * @param {Object} kit.tuning - The shared OrbTuning (the grid cell size)
   */
  constructor({ tuning }) {
    this.tuning = tuning;
    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbs = [];
    this.xpOrbPools = this.createEmptyOrbPools();

    this.spatialIndex = new Map();
    this.spatialIndexDirty = true;

    this.usesOrbPool = false;
    this.setupOrbPoolIntegration();
  }

  reset() {
    this.releaseAllOrbsToPool();
    this.orbClasses = [...ORB_CLASS_SEQUENCE];
    this.xpOrbs = [];
    this.xpOrbPools = this.createEmptyOrbPools();
    this.spatialIndex.clear();
    this.spatialIndexDirty = true;
  }

  createEmptyOrbPools() {
    return this.orbClasses.reduce((pools, className) => {
      pools[className] = [];
      return pools;
    }, {});
  }

  setupOrbPoolIntegration() {
    if (!GamePools || typeof GamePools.configureXPOrbLifecycle !== 'function') {
      this.usesOrbPool = false;
      return;
    }

    try {
      GamePools.configureXPOrbLifecycle({
        create: () => this.createPooledOrb(),
        reset: (orb) => this.resetOrbForPool(orb),
      });
      this.usesOrbPool = true;
    } catch (error) {
      this.usesOrbPool = false;
      console.warn(
        '[XPOrbSystem] Failed to configure XP orb pool lifecycle',
        error
      );
    }
  }

  createPooledOrb() {
    return {
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      steered: false,
      value: 0,
      class: 'blue',
      tier: 1,
      collected: false,
      age: 0,
      isFusing: false,
      fusionTimer: 0,
      pulsePhase: 0,
      clusterId: null,
      source: 'drop',
      pendingRemoval: false,
      active: false,
    };
  }

  resetOrbForPool(orb) {
    if (!orb) {
      return;
    }

    orb.id = 0;
    orb.x = 0;
    orb.y = 0;
    orb.vx = 0;
    orb.vy = 0;
    orb.steered = false;
    orb.value = 0;
    orb.class = 'blue';
    orb.tier = 1;
    orb.collected = false;
    orb.age = 0;
    orb.isFusing = false;
    orb.fusionTimer = 0;
    orb.pulsePhase = 0;
    orb.clusterId = null;
    orb.source = 'drop';
    orb.pendingRemoval = false;
    orb.active = false;
    orb.driftHeading = null;
  }

  acquireOrb() {
    if (
      this.usesOrbPool &&
      GamePools?.xpOrbs &&
      typeof GamePools.xpOrbs.acquire === 'function'
    ) {
      return GamePools.xpOrbs.acquire();
    }

    return this.createPooledOrb();
  }

  releaseOrb(orb) {
    if (
      !orb ||
      !this.usesOrbPool ||
      !GamePools?.xpOrbs ||
      typeof GamePools.xpOrbs.release !== 'function'
    ) {
      return false;
    }

    return GamePools.xpOrbs.release(orb);
  }

  releaseAllOrbsToPool() {
    if (!Array.isArray(this.xpOrbs) || this.xpOrbs.length === 0) {
      return;
    }

    for (let i = 0; i < this.xpOrbs.length; i += 1) {
      this.releaseOrb(this.xpOrbs[i]);
    }

    this.xpOrbs.length = 0;
  }

  invalidateSpatialIndex() {
    this.spatialIndexDirty = true;
  }

  isOrbActive(orb) {
    return Boolean(orb) && !orb.collected;
  }

  isOrbEligibleForFusion(orb) {
    return this.isOrbActive(orb) && !orb.isFusing;
  }

  /** Loose and at rest: a bursting or pulled orb neither clusters nor fuses. */
  isOrbSettled(orb) {
    return this.isOrbEligibleForFusion(orb) && !orb.vx && !orb.vy;
  }

  addOrbToPools(orb) {
    this.xpOrbs.push(orb);
    if (!this.xpOrbPools[orb.class]) {
      this.xpOrbPools[orb.class] = [];
    }
    this.xpOrbPools[orb.class].push(orb);
    this.invalidateSpatialIndex();
  }

  ensureSpatialIndex() {
    if (!this.spatialIndexDirty) {
      return this.spatialIndex;
    }

    const index = new Map();
    const cellSize = Math.max(this.tuning.fusionDetectionRadius, 24);
    let counter = 0;

    for (let i = 0; i < this.orbClasses.length; i += 1) {
      const className = this.orbClasses[i];
      const pool = this.xpOrbPools[className];
      if (!Array.isArray(pool) || pool.length === 0) {
        continue;
      }

      const active = pool.filter((orb) => this.isOrbActive(orb));
      if (!active.length) {
        continue;
      }

      const classData = {
        cellSize,
        cells: new Map(),
        orbs: active,
      };

      for (let j = 0; j < active.length; j += 1) {
        const orb = active[j];
        orb._gridIndex = counter += 1;
        const cellX = Math.floor(orb.x / cellSize);
        const cellY = Math.floor(orb.y / cellSize);
        const key = `${cellX}:${cellY}`;
        const bucket = classData.cells.get(key);
        if (bucket) {
          bucket.push(orb);
        } else {
          classData.cells.set(key, [orb]);
        }
      }

      index.set(className, classData);
    }

    this.spatialIndex = index;
    this.spatialIndexDirty = false;
    return index;
  }

  cleanupCollectedOrbs() {
    if (!this.xpOrbs.length) {
      return;
    }

    const remaining = [];
    const toRelease = [];
    let removed = 0;
    let sawNullEntry = false;

    for (let i = 0; i < this.xpOrbs.length; i += 1) {
      const orb = this.xpOrbs[i];
      if (!orb) {
        removed += 1;
        sawNullEntry = true;
        continue;
      }

      if (orb.collected) {
        orb.active = false;
        toRelease.push(orb);
        removed += 1;
        continue;
      }

      remaining.push(orb);
    }

    this.xpOrbs = remaining;

    if (toRelease.length > 0) {
      const releaseSet = new Set(toRelease);
      const poolNames = Object.keys(this.xpOrbPools);

      for (let i = 0; i < poolNames.length; i += 1) {
        const className = poolNames[i];
        const pool = this.xpOrbPools[className];
        if (!Array.isArray(pool) || pool.length === 0) {
          continue;
        }

        this.xpOrbPools[className] = pool.filter(
          (candidate) => candidate && !releaseSet.has(candidate)
        );
      }

      for (let i = 0; i < toRelease.length; i += 1) {
        this.releaseOrb(toRelease[i]);
      }
    }

    if (sawNullEntry) {
      const poolNames = Object.keys(this.xpOrbPools);
      for (let i = 0; i < poolNames.length; i += 1) {
        const className = poolNames[i];
        const pool = this.xpOrbPools[className];
        if (!Array.isArray(pool) || pool.length === 0) {
          continue;
        }

        this.xpOrbPools[className] = pool.filter(Boolean);
      }
    }

    if (removed > 0) {
      this.invalidateSpatialIndex();
    }
  }
}
