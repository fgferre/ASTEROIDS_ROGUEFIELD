import { GAME_HEIGHT, GAME_WIDTH } from '../../core/GameConstants.js';
import { lerp } from '../../utils/mathHelpers.js';
import { ORB_SPATIAL_NEIGHBOURS } from './OrbField.js';
import { getOrbConfig } from './orbClasses.js';

/**
 * How loose orbs sit: those past the field edge ease back in, and orbs of one
 * class at rest draw together to a comfortable spacing without piling up.
 */
export class OrbSpacing {
  /**
   * @param {Object} kit
   * @param {Object} kit.field - The OrbField (orbs, grid)
   * @param {Object} kit.tuning - The shared OrbTuning (margins, cluster force)
   */
  constructor({ field, tuning }) {
    this.field = field;
    this.tuning = tuning;
  }

  updateOrbSoftBounds(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    if (!this.field.xpOrbs.length) {
      return;
    }

    const width = Number.isFinite(GAME_WIDTH) ? GAME_WIDTH : 0;
    const height = Number.isFinite(GAME_HEIGHT) ? GAME_HEIGHT : 0;
    if (width <= 0 || height <= 0) {
      return;
    }

    const margin = Number.isFinite(this.tuning.orbOffscreenMargin)
      ? this.tuning.orbOffscreenMargin
      : 0;
    const duration = Number.isFinite(this.tuning.orbOffscreenReturnDuration)
      ? Math.max(0.05, this.tuning.orbOffscreenReturnDuration)
      : 0.55;
    const ease = 1 - Math.exp(-deltaTime / duration);

    let moved = false;

    for (let i = 0; i < this.field.xpOrbs.length; i += 1) {
      const orb = this.field.xpOrbs[i];
      if (!this.field.isOrbActive(orb) || orb.isFusing) {
        continue;
      }

      const padding = Math.max(0, getOrbConfig(orb.class).radius + margin);
      const minX = padding;
      const maxX = Math.max(minX, width - padding);
      const minY = padding;
      const maxY = Math.max(minY, height - padding);

      const targetX = Math.min(Math.max(orb.x, minX), maxX);
      const targetY = Math.min(Math.max(orb.y, minY), maxY);

      if (targetX !== orb.x || targetY !== orb.y) {
        // A burst stops at the edge: its outward motion goes.
        if ((orb.x - targetX) * orb.vx > 0) orb.vx = 0;
        if ((orb.y - targetY) * orb.vy > 0) orb.vy = 0;
        orb.x = lerp(orb.x, targetX, ease);
        orb.y = lerp(orb.y, targetY, ease);
        moved = true;
      }
    }

    if (moved) {
      this.field.invalidateSpatialIndex();
    }
  }

  updateOrbClustering(deltaTime) {
    if (this.tuning.orbClusterRadius <= 0 || this.tuning.orbClusterForce <= 0) {
      return;
    }

    const index = this.field.ensureSpatialIndex();
    const clusterRadiusSq =
      this.tuning.orbClusterRadius * this.tuning.orbClusterRadius;
    const comfortableSpacingFactor = Number.isFinite(
      this.tuning.clusterConfig.comfortableSpacingFactor
    )
      ? this.tuning.clusterConfig.comfortableSpacingFactor
      : 1.12;
    const idealSpacingFactor = Number.isFinite(
      this.tuning.clusterConfig.idealSpacingFactor
    )
      ? this.tuning.clusterConfig.idealSpacingFactor
      : 0.95;
    const denseSpacingFactor = Number.isFinite(
      this.tuning.clusterConfig.denseSpacingFactor
    )
      ? this.tuning.clusterConfig.denseSpacingFactor
      : 0.75;
    const comfortableSpacing =
      this.tuning.minOrbDistance * comfortableSpacingFactor;
    const idealSpacing = this.tuning.minOrbDistance * idealSpacingFactor;
    const denseSpacing = this.tuning.minOrbDistance * denseSpacingFactor;

    index.forEach((classData) => {
      const { orbs, cells, cellSize } = classData;
      if (!orbs || orbs.length < 2) {
        return;
      }

      for (let i = 0; i < orbs.length; i += 1) {
        const orbA = orbs[i];
        if (!this.field.isOrbSettled(orbA)) {
          continue;
        }

        const cellX = Math.floor(orbA.x / cellSize);
        const cellY = Math.floor(orbA.y / cellSize);

        for (let gx = 0; gx < ORB_SPATIAL_NEIGHBOURS.length; gx += 1) {
          for (let gy = 0; gy < ORB_SPATIAL_NEIGHBOURS.length; gy += 1) {
            const key = `${cellX + ORB_SPATIAL_NEIGHBOURS[gx]}:${cellY + ORB_SPATIAL_NEIGHBOURS[gy]}`;
            const neighbors = cells.get(key);
            if (!neighbors) {
              continue;
            }

            for (let n = 0; n < neighbors.length; n += 1) {
              const orbB = neighbors[n];
              if (
                orbA === orbB ||
                !this.field.isOrbSettled(orbB) ||
                orbB._gridIndex <= orbA._gridIndex
              ) {
                continue;
              }

              const dx = orbB.x - orbA.x;
              const dy = orbB.y - orbA.y;
              const distanceSq = dx * dx + dy * dy;
              if (distanceSq <= 0 || distanceSq > clusterRadiusSq) {
                continue;
              }

              const distance = Math.sqrt(distanceSq);
              const normalizedDx = dx / distance;
              const normalizedDy = dy / distance;
              const closeness = Math.max(
                1 - distance / this.tuning.orbClusterRadius,
                0
              );

              if (distance > comfortableSpacing) {
                const forceBase = Number.isFinite(
                  this.tuning.clusterConfig.comfortableForceBase
                )
                  ? this.tuning.clusterConfig.comfortableForceBase
                  : 0.5;
                const forceCloseness = Number.isFinite(
                  this.tuning.clusterConfig.comfortableForceCloseness
                )
                  ? this.tuning.clusterConfig.comfortableForceCloseness
                  : 1.5;
                const forceOffset = Number.isFinite(
                  this.tuning.clusterConfig.comfortableForceOffset
                )
                  ? this.tuning.clusterConfig.comfortableForceOffset
                  : 30;
                const stepClamp = Number.isFinite(
                  this.tuning.clusterConfig.comfortableStepClamp
                )
                  ? this.tuning.clusterConfig.comfortableStepClamp
                  : 0.9;
                const movementFactor = Number.isFinite(
                  this.tuning.clusterConfig.comfortableMovementFactor
                )
                  ? this.tuning.clusterConfig.comfortableMovementFactor
                  : 0.5;

                const baseStrength =
                  this.tuning.orbClusterForce *
                    (forceBase + closeness * forceCloseness) +
                  forceOffset;
                const step = Math.min(
                  baseStrength * deltaTime,
                  distance * stepClamp
                );
                const movement = step * movementFactor;

                orbA.x += normalizedDx * movement;
                orbA.y += normalizedDy * movement;
                orbB.x -= normalizedDx * movement;
                orbB.y -= normalizedDy * movement;
              } else if (distance > idealSpacing) {
                const forceBase = Number.isFinite(
                  this.tuning.clusterConfig.idealForceBase
                )
                  ? this.tuning.clusterConfig.idealForceBase
                  : 0.3;
                const forceCloseness = Number.isFinite(
                  this.tuning.clusterConfig.idealForceCloseness
                )
                  ? this.tuning.clusterConfig.idealForceCloseness
                  : 1.1;
                const forceOffset = Number.isFinite(
                  this.tuning.clusterConfig.idealForceOffset
                )
                  ? this.tuning.clusterConfig.idealForceOffset
                  : 18;
                const stepClamp = Number.isFinite(
                  this.tuning.clusterConfig.idealStepClamp
                )
                  ? this.tuning.clusterConfig.idealStepClamp
                  : 0.6;
                const movementFactor = Number.isFinite(
                  this.tuning.clusterConfig.idealMovementFactor
                )
                  ? this.tuning.clusterConfig.idealMovementFactor
                  : 0.5;

                const baseStrength =
                  this.tuning.orbClusterForce *
                    (forceBase + closeness * forceCloseness) +
                  forceOffset;
                const step = Math.min(
                  baseStrength * deltaTime,
                  distance * stepClamp
                );
                const movement = step * movementFactor;

                orbA.x += normalizedDx * movement;
                orbA.y += normalizedDy * movement;
                orbB.x -= normalizedDx * movement;
                orbB.y -= normalizedDy * movement;
              } else if (distance < denseSpacing) {
                const overlap = denseSpacing - distance;
                const pushFactor = Number.isFinite(
                  this.tuning.clusterConfig.densePushFactor
                )
                  ? this.tuning.clusterConfig.densePushFactor
                  : 0.5;
                const push = overlap * pushFactor;

                orbA.x -= normalizedDx * push;
                orbA.y -= normalizedDy * push;
                orbB.x += normalizedDx * push;
                orbB.y += normalizedDy * push;
              }
            }
          }
        }
      }
    });

    this.field.invalidateSpatialIndex();
  }
}
