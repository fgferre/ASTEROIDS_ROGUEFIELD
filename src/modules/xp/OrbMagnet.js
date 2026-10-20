import { SHIP_SIZE, XP_ORB_SIZE } from '../../core/GameConstants.js';
import { XP_ORB_MAGNET_RAMP_SECONDS } from '../../data/constants/gameplay.js';
import { getOrbConfig } from './orbClasses.js';

/**
 * The ship's magnet: an orb inside its radius accelerates toward the ship, a
 * heavier class slower (its weight), up to a speed that grows as it nears,
 * and is collected on arrival. An orb it moves is `steered` for this update,
 * so the orb's own coasting (XPOrbSystem.updateFlight) leaves it be.
 */
export class OrbMagnet {
  /**
   * @param {Object} kit
   * @param {Object} kit.field - The OrbField (the loose orbs)
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
    const orbs = this.field.xpOrbs;
    for (let i = 0; i < orbs.length; i += 1) {
      const orb = orbs[i];
      if (!this.field.isOrbActive(orb) || orb.isFusing) {
        continue;
      }

      const dx = playerX - orb.x;
      const dy = playerY - orb.y;
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= collectionRadiusSq) {
        this.collectOrb(orb);
        continue;
      }
      if (distanceSq > magnetismRadiusSq) {
        continue;
      }

      // Steer toward the ship at the speed for this distance, the change in
      // velocity capped by the orb's acceleration (lower when heavier).
      const distance = Math.sqrt(distanceSq);
      const proximity = 1 - distance / magnetismRadius;
      const speed = magnetismForce * (1 + proximity * boostMultiplier);
      const ramp = XP_ORB_MAGNET_RAMP_SECONDS * getOrbConfig(orb.class).weight;
      let changeX = (dx / distance) * speed - orb.vx;
      let changeY = (dy / distance) * speed - orb.vy;
      const change = Math.hypot(changeX, changeY);
      const maxChange = (speed / ramp) * deltaTime;
      if (change > maxChange) {
        changeX *= maxChange / change;
        changeY *= maxChange / change;
      }
      orb.vx += changeX;
      orb.vy += changeY;
      orb.steered = true;
      moved = true;

      // Reaching the ship within this step: collected, not flown past.
      if (Math.hypot(orb.vx, orb.vy) * deltaTime >= distance) {
        this.collectOrb(orb);
        continue;
      }
      orb.x += orb.vx * deltaTime;
      orb.y += orb.vy * deltaTime;

      const postDx = playerX - orb.x;
      const postDy = playerY - orb.y;
      if (postDx * postDx + postDy * postDy <= collectionRadiusSq) {
        this.collectOrb(orb);
      }
    }

    if (moved) {
      this.field.invalidateSpatialIndex();
    }
  }
}
