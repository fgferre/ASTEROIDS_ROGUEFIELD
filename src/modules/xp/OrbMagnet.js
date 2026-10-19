import { SHIP_SIZE, XP_ORB_SIZE } from '../../core/GameConstants.js';

/**
 * The ship's magnet: orbs inside its radius are drawn in, faster the closer
 * they get, and collected on arrival.
 */
export class OrbMagnet {
  /**
   * @param {Object} kit
   * @param {Object} kit.field - The OrbField (the grid of loose orbs)
   * @param {Object} kit.tuning - The shared OrbTuning (radius, force, boost)
   * @param {Function} kit.getPlayer - () => the ship, looked up again if lost
   * @param {Function} kit.getPullScale - () => 1, less in a Magnetic Storm
   * @param {Function} kit.collectOrb - (orb) => takes the orb into the XP
   */
  constructor({ field, tuning, getPlayer, getPullScale, collectOrb }) {
    this.field = field;
    this.tuning = tuning;
    this.getPlayer = getPlayer;
    this.getPullScale = getPullScale;
    this.collectOrb = collectOrb;
  }

  updateShipMagnetism(deltaTime) {
    if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
      return;
    }

    const player = this.getPlayer();
    if (!player || typeof player.getPosition !== 'function') {
      return;
    }

    // A wrecked ship pulls and collects nothing (as with pickups and hearts).
    if (player.isDead || player.isRetrying || player._quitExplosionHidden) {
      return;
    }

    const playerPos = player.getPosition();
    if (
      !playerPos ||
      !Number.isFinite(playerPos.x) ||
      !Number.isFinite(playerPos.y)
    ) {
      return;
    }

    const magnetismRadius =
      (typeof player.getMagnetismRadius === 'function'
        ? player.getMagnetismRadius()
        : this.tuning.orbMagnetismRadius) || this.tuning.orbMagnetismRadius;

    if (!Number.isFinite(magnetismRadius) || magnetismRadius <= 0) {
      return;
    }

    const magnetismRadiusSq = magnetismRadius * magnetismRadius;
    const collectionRadius =
      SHIP_SIZE +
      XP_ORB_SIZE +
      this.tuning.minOrbDistance * this.tuning.collectionRadiusPadding;
    const collectionRadiusSq = collectionRadius * collectionRadius;

    const spatialIndex = this.field.ensureSpatialIndex();
    if (!spatialIndex || spatialIndex.size === 0) {
      return;
    }

    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const magnetismForce =
      (this.tuning.magnetismForce || 0) * this.getPullScale();
    const boostMultiplier =
      Number.isFinite(this.tuning.magnetismBoost) &&
      this.tuning.magnetismBoost >= 0
        ? this.tuning.magnetismBoost
        : 2.2;

    let moved = false;

    spatialIndex.forEach((classData) => {
      if (!classData || !classData.cells || classData.cells.size === 0) {
        return;
      }

      const cellSize =
        Number.isFinite(classData.cellSize) && classData.cellSize > 0
          ? classData.cellSize
          : magnetismRadius;
      if (!Number.isFinite(cellSize) || cellSize <= 0) {
        return;
      }

      const searchRange = Math.max(
        1,
        Math.ceil((magnetismRadius + this.tuning.minOrbDistance) / cellSize)
      );
      const centerCellX = Math.floor(playerX / cellSize);
      const centerCellY = Math.floor(playerY / cellSize);

      for (let offsetX = -searchRange; offsetX <= searchRange; offsetX += 1) {
        for (let offsetY = -searchRange; offsetY <= searchRange; offsetY += 1) {
          const key = `${centerCellX + offsetX}:${centerCellY + offsetY}`;
          const bucket = classData.cells.get(key);
          if (!bucket || bucket.length === 0) {
            continue;
          }

          for (let idx = 0; idx < bucket.length; idx += 1) {
            const orb = bucket[idx];
            if (!this.field.isOrbActive(orb) || orb.isFusing) {
              continue;
            }

            const dx = playerX - orb.x;
            const dy = playerY - orb.y;
            const distanceSq = dx * dx + dy * dy;

            if (distanceSq <= collectionRadiusSq) {
              this.collectOrb(orb);
              moved = true;
              continue;
            }

            if (distanceSq <= 0 || distanceSq > magnetismRadiusSq) {
              continue;
            }

            const distance = Math.sqrt(distanceSq);
            if (!Number.isFinite(distance) || distance === 0) {
              this.collectOrb(orb);
              moved = true;
              continue;
            }

            const normalizedDx = dx / distance;
            const normalizedDy = dy / distance;
            const proximity = 1 - Math.min(distance / magnetismRadius, 1);
            const magnetBoost = 1 + proximity * boostMultiplier;
            const speed = magnetismForce * magnetBoost;
            const step = speed * deltaTime;

            if (!Number.isFinite(step) || step <= 0) {
              continue;
            }

            orb.x += normalizedDx * step;
            orb.y += normalizedDy * step;
            moved = true;

            const postDx = playerX - orb.x;
            const postDy = playerY - orb.y;
            if (postDx * postDx + postDy * postDy <= collectionRadiusSq) {
              this.collectOrb(orb);
            }
          }
        }
      }
    });

    if (moved) {
      this.field.invalidateSpatialIndex();
    }
  }
}
