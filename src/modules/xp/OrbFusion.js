import { lerp, easeInOutCubic } from '../../utils/mathHelpers.js';
import { ORB_NEXT_CLASS, getOrbConfig } from './orbClasses.js';
import { ORB_SPATIAL_NEIGHBOURS } from './OrbField.js';

/**
 * Orb fusion: clusters of loose orbs of one class find each other, glide to
 * their center and become one orb of the next class (also forced when a class
 * is over its limit).
 */
export class OrbFusion {
  /**
   * @param {Object} kit
   * @param {Object} kit.eventBus - Announces each fusion ('xp-orb-fused')
   * @param {Object} kit.field - The OrbField (orbs, class lists, grid)
   * @param {Object} kit.tuning - The shared OrbTuning (counts, radii, timing)
   * @param {Function} kit.createOrb - (x, y, value, options) => the new orb
   * @param {Function} kit.newAnimationId - (className) => a fusion's id
   */
  constructor({ eventBus, field, tuning, createOrb, newAnimationId }) {
    this.eventBus = eventBus;
    this.field = field;
    this.tuning = tuning;
    this.createOrb = createOrb;
    this.newAnimationId = newAnimationId;

    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];
  }

  reset() {
    this.fusionCheckTimer = 0;
    this.activeFusionAnimations = [];
  }

  enforceClassLimit(className) {
    const pool = this.field.xpOrbPools[className];
    if (!Array.isArray(pool)) {
      return;
    }

    const active = pool.filter((orb) => this.field.isOrbEligibleForFusion(orb));
    const excess = active.length - this.tuning.maxOrbsPerClass;
    if (excess <= 0) {
      return;
    }

    const nextClassName = ORB_NEXT_CLASS[className];
    if (nextClassName) {
      const groupsNeeded = Math.ceil(
        excess / Math.max(this.tuning.clusterFusionCount - 1, 1)
      );
      this.performFusionForClass(
        className,
        nextClassName,
        groupsNeeded,
        'overflow'
      );
    }
  }

  performFusionForClass(
    className,
    nextClassName,
    maxGroups,
    reason = 'interval'
  ) {
    if (!maxGroups || maxGroups <= 0 || !nextClassName) {
      return false;
    }

    const clusters = this.findOrbClusters(className, maxGroups);
    if (!clusters.length) {
      return false;
    }

    let started = false;
    for (let index = 0; index < clusters.length; index += 1) {
      started =
        this.initiateOrbFusion(
          className,
          nextClassName,
          clusters[index],
          reason
        ) || started;
    }
    return started;
  }

  updateFusionAnimations(deltaTime) {
    if (!this.activeFusionAnimations.length) {
      return;
    }

    for (
      let index = this.activeFusionAnimations.length - 1;
      index >= 0;
      index -= 1
    ) {
      const animation = this.activeFusionAnimations[index];
      if (!animation) {
        this.activeFusionAnimations.splice(index, 1);
        continue;
      }

      animation.elapsed = (animation.elapsed || 0) + deltaTime;
      const progress = Math.min(animation.elapsed / animation.duration, 1);
      const eased = easeInOutCubic(progress);

      let activeCount = 0;

      for (let orbIndex = 0; orbIndex < animation.orbs.length; orbIndex += 1) {
        const entry = animation.orbs[orbIndex];
        const orb = entry?.orb;
        if (!this.field.isOrbActive(orb)) {
          continue;
        }

        activeCount += 1;
        orb.x = lerp(entry.startX, animation.center.x, eased);
        orb.y = lerp(entry.startY, animation.center.y, eased);
      }

      if (activeCount < this.tuning.clusterFusionCount) {
        this.activeFusionAnimations.splice(index, 1);
        animation.orbs.forEach(({ orb }) => {
          if (!orb || orb.collected) {
            return;
          }
          orb.isFusing = false;
          delete orb.fusionId;
        });
        continue;
      }

      if (progress >= 1) {
        this.activeFusionAnimations.splice(index, 1);
        const orbsToFuse = animation.orbs
          .map((entry) => entry.orb)
          .filter((orb) => this.field.isOrbActive(orb));
        const hasEnoughOrbs =
          orbsToFuse.length >= this.tuning.clusterFusionCount;

        animation.orbs.forEach((entry) => {
          const orb = entry?.orb;
          if (!orb) {
            return;
          }

          if (!this.field.isOrbActive(orb) || !hasEnoughOrbs) {
            orb.isFusing = false;
            delete orb.fusionId;
          }
        });

        if (hasEnoughOrbs) {
          this.fuseOrbs(
            animation.className,
            animation.targetClassName,
            orbsToFuse,
            animation.reason,
            { center: animation.center }
          );
        }
      }
    }
  }

  findOrbClusters(className, maxClusters = 1) {
    if (!maxClusters || maxClusters <= 0) {
      return [];
    }

    const index = this.field.ensureSpatialIndex();
    const classData = index.get(className);
    if (!classData || !Array.isArray(classData.orbs)) {
      return [];
    }

    const candidates = classData.orbs.filter((orb) =>
      this.field.isOrbEligibleForFusion(orb)
    );
    if (candidates.length < this.tuning.clusterFusionCount) {
      return [];
    }

    const { cellSize, cells } = classData;
    const detectionRadiusSq = this.tuning.fusionDetectionRadiusSq;
    const visited = new Set();
    const clusters = [];

    for (let i = 0; i < candidates.length; i += 1) {
      const seed = candidates[i];
      if (visited.has(seed)) {
        continue;
      }

      const stack = [seed];
      const component = [];
      visited.add(seed);

      while (stack.length > 0) {
        const current = stack.pop();
        if (!this.field.isOrbEligibleForFusion(current)) {
          continue;
        }

        component.push(current);

        const cellX = Math.floor(current.x / cellSize);
        const cellY = Math.floor(current.y / cellSize);

        for (let gx = 0; gx < ORB_SPATIAL_NEIGHBOURS.length; gx += 1) {
          for (let gy = 0; gy < ORB_SPATIAL_NEIGHBOURS.length; gy += 1) {
            const key = `${cellX + ORB_SPATIAL_NEIGHBOURS[gx]}:${cellY + ORB_SPATIAL_NEIGHBOURS[gy]}`;
            const neighbors = cells.get(key);
            if (!neighbors) {
              continue;
            }

            for (let n = 0; n < neighbors.length; n += 1) {
              const neighbor = neighbors[n];
              if (
                visited.has(neighbor) ||
                !this.field.isOrbEligibleForFusion(neighbor)
              ) {
                continue;
              }

              const dx = neighbor.x - current.x;
              const dy = neighbor.y - current.y;
              if (dx * dx + dy * dy <= detectionRadiusSq) {
                visited.add(neighbor);
                stack.push(neighbor);
              }
            }
          }
        }
      }

      if (component.length < this.tuning.clusterFusionCount) {
        continue;
      }

      let sumX = 0;
      let sumY = 0;
      for (let index = 0; index < component.length; index += 1) {
        sumX += component[index].x;
        sumY += component[index].y;
      }

      const centerX = sumX / component.length;
      const centerY = sumY / component.length;

      const ordered = component
        .map((orb) => {
          const dx = orb.x - centerX;
          const dy = orb.y - centerY;
          return {
            orb,
            distanceSq: dx * dx + dy * dy,
            age: orb.age || 0,
          };
        })
        .sort((a, b) => {
          if (a.distanceSq === b.distanceSq) {
            return b.age - a.age;
          }
          return a.distanceSq - b.distanceSq;
        })
        .map((entry) => entry.orb);

      let radiusSq = 0;
      const sampleCount = Math.min(
        ordered.length,
        this.tuning.clusterFusionCount
      );
      for (let index = 0; index < sampleCount; index += 1) {
        const orb = ordered[index];
        const dx = orb.x - centerX;
        const dy = orb.y - centerY;
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) {
          radiusSq = distSq;
        }
      }

      clusters.push({
        orbs: ordered,
        center: { x: centerX, y: centerY },
        radius: Math.sqrt(radiusSq),
        size: component.length,
      });
    }

    clusters.sort((a, b) => {
      if (a.radius === b.radius) {
        return b.size - a.size;
      }
      return a.radius - b.radius;
    });

    return clusters.slice(0, maxClusters);
  }

  initiateOrbFusion(className, targetClassName, cluster, reason = 'interval') {
    if (!cluster || !Array.isArray(cluster.orbs) || !targetClassName) {
      return false;
    }

    const selected = [];
    for (let index = 0; index < cluster.orbs.length; index += 1) {
      const orb = cluster.orbs[index];
      if (!this.field.isOrbEligibleForFusion(orb)) {
        continue;
      }

      selected.push(orb);
      if (selected.length >= this.tuning.clusterFusionCount) {
        break;
      }
    }

    if (selected.length < this.tuning.clusterFusionCount) {
      return false;
    }

    const animationId = this.newAnimationId(className);
    const animation = {
      id: animationId,
      className,
      targetClassName,
      reason,
      duration: this.tuning.fusionAnimationDuration,
      elapsed: 0,
      center: { x: cluster.center.x, y: cluster.center.y },
      orbs: [],
    };

    let sumX = 0;
    let sumY = 0;

    selected.forEach((orb) => {
      orb.isFusing = true;
      orb.fusionId = animationId;
      animation.orbs.push({
        orb,
        startX: orb.x,
        startY: orb.y,
      });
      sumX += orb.x;
      sumY += orb.y;
    });

    if (animation.orbs.length > 0) {
      animation.center.x = sumX / animation.orbs.length;
      animation.center.y = sumY / animation.orbs.length;
    }

    this.activeFusionAnimations.push(animation);
    return true;
  }

  checkOrbFusion(deltaTime) {
    if (this.tuning.clusterFusionCount <= 1) {
      return;
    }

    this.fusionCheckTimer += deltaTime;
    if (this.fusionCheckTimer < this.tuning.fusionCheckInterval) {
      return;
    }

    this.fusionCheckTimer = 0;

    for (let i = 0; i < this.field.orbClasses.length; i += 1) {
      const className = this.field.orbClasses[i];
      const nextClassName = ORB_NEXT_CLASS[className];
      if (!nextClassName) {
        continue;
      }

      const clusters = this.findOrbClusters(className, 1);
      if (!clusters.length) {
        continue;
      }

      this.initiateOrbFusion(className, nextClassName, clusters[0], 'interval');
    }
  }

  fuseOrbs(
    className,
    targetClassName,
    orbs,
    reason = 'interval',
    options = {}
  ) {
    if (!Array.isArray(orbs) || orbs.length === 0) {
      return;
    }

    const targetConfig = getOrbConfig(targetClassName);

    const validOrbs = orbs.filter((orb) => this.field.isOrbActive(orb));
    const count = validOrbs.length;
    if (count < this.tuning.clusterFusionCount) {
      orbs.forEach((orb) => {
        if (!orb) {
          return;
        }
        orb.isFusing = false;
        delete orb.fusionId;
      });
      return;
    }

    let totalValue = 0;
    let centerX = 0;
    let centerY = 0;

    validOrbs.forEach((orb) => {
      totalValue += orb.value;
      centerX += orb.x;
      centerY += orb.y;
      orb.collected = true;
      orb.isFusing = false;
      delete orb.fusionId;
    });

    if (options && options.center) {
      centerX = options.center.x;
      centerY = options.center.y;
    } else {
      centerX /= count;
      centerY /= count;
    }

    const fusedOrb = this.createOrb(centerX, centerY, totalValue, {
      className: targetConfig.name,
      tier: targetConfig.tier,
      source: 'fusion',
      age: 0,
    });

    this.eventBus?.emit?.('xp-orb-fused', {
      fromClass: className,
      toClass: fusedOrb.class,
      consumed: count,
      value: totalValue,
      position: { x: centerX, y: centerY },
      tier: fusedOrb.tier,
      reason,
      color: targetConfig.baseColor,
      glow: targetConfig.glowColor,
      flash: targetConfig.fusionFlash,
    });

    this.enforceClassLimit(fusedOrb.class);
    this.field.invalidateSpatialIndex();
  }
}
