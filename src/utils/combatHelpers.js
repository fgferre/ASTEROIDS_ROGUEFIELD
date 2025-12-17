// Combat utility functions for predictive aiming and velocity resolution
// Used by WeaponComponent weapon patterns (single, burst, volley)

/**
 * Calculates predicted intercept point for moving target using quadratic formula.
 * @param {Object} params - {origin, target, targetVelocity, projectileSpeed}
 * @returns {Object} Predicted intercept point {x, y}
 */
const computeLeadSolution = ({
  origin,
  target,
  targetVelocity,
  projectileSpeed,
}) => {
  if (!Number.isFinite(projectileSpeed) || projectileSpeed <= 0) {
    return { x: target.x, y: target.y };
  }

  const toTargetX = target.x - origin.x;
  const toTargetY = target.y - origin.y;

  const targetSpeedSq =
    targetVelocity.vx * targetVelocity.vx +
    targetVelocity.vy * targetVelocity.vy;
  const projectileSpeedSq = projectileSpeed * projectileSpeed;

  const a = targetSpeedSq - projectileSpeedSq;
  const b = 2 * (toTargetX * targetVelocity.vx + toTargetY * targetVelocity.vy);
  const c = toTargetX * toTargetX + toTargetY * toTargetY;

  if (Math.abs(a) < 1e-6) {
    if (Math.abs(b) < 1e-6) {
      return { x: target.x, y: target.y };
    }

    const time = Math.abs(projectileSpeed) > 1e-6 ? -c / b : 0;
    if (!Number.isFinite(time) || time <= 0) {
      return { x: target.x, y: target.y };
    }

    if (time > 0) {
      return {
        x: target.x + targetVelocity.vx * time,
        y: target.y + targetVelocity.vy * time,
      };
    }
    return { x: target.x, y: target.y };
  }

  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return { x: target.x, y: target.y };
  }

  const sqrt = Math.sqrt(Math.max(discriminant, 0));
  const time1 = (-b - sqrt) / (2 * a);
  const time2 = (-b + sqrt) / (2 * a);

  const time =
    Math.min(time1, time2) > 0
      ? Math.min(time1, time2)
      : Math.max(time1, time2);
  if (time <= 0) {
    return { x: target.x, y: target.y };
  }

  return {
    x: target.x + targetVelocity.vx * time,
    y: target.y + targetVelocity.vy * time,
  };
};

/**
 * Extracts velocity from player object with fallback strategies.
 * @param {Object} player - Player object (may be wrapped entity)
 * @returns {Object} Velocity vector {vx, vy} (defaults to {vx:0, vy:0})
 */
const resolvePlayerVelocity = (player) => {
  if (!player) {
    return { vx: 0, vy: 0 };
  }

  const entity = player.entity ?? player;

  if (typeof entity.getVelocity === 'function') {
    const velocity = entity.getVelocity();
    if (
      velocity &&
      Number.isFinite(velocity.vx) &&
      Number.isFinite(velocity.vy)
    ) {
      return { vx: velocity.vx, vy: velocity.vy };
    }
  }

  if (
    entity.velocity &&
    Number.isFinite(entity.velocity.x) &&
    Number.isFinite(entity.velocity.y)
  ) {
    return { vx: entity.velocity.x, vy: entity.velocity.y };
  }

  return { vx: 0, vy: 0 };
};

/**
 * Applies random angular spread to firing angle.
 * @param {number} angle - Base angle (radians)
 * @param {number} spread - Max spread (radians)
 * @param {Object|Function} random - Random generator
 * @returns {number} Modified angle
 */
const applySpread = (angle, spread, random) => {
  if (!spread) {
    return angle;
  }
  const variance = (random?.float?.() ?? random?.() ?? Math.random()) - 0.5;
  return angle + variance * spread;
};

export { computeLeadSolution, resolvePlayerVelocity, applySpread };
