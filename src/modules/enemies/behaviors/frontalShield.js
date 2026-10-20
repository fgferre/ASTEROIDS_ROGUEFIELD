import {
  absorbFrontalHit,
  faceTarget,
  hitsFrontalShield,
} from '../base/frontalShield.js';

/**
 * A frontal shield plate of `health` (±`halfArc` around its `facing`, which
 * tracks the player). Hits on the plate drain it first; hits from behind, or
 * with no `source.hitPosition` (the bullet's position, from CombatSystem), go
 * straight to the hull. A broken plate stays broken.
 */
export default {
  params: { health: 'positive', halfArc: 'positive' },
  reset(enemy, { health }) {
    enemy.facing = 0;
    enemy.shieldHealth = health;
    enemy.maxShieldHealth = health;
    enemy.shieldBroken = false;
  },
  init(enemy, { health }) {
    enemy.maxShieldHealth = health;
    enemy.shieldHealth = health;
    enemy.shieldBroken = false;
  },
  act(enemy) {
    faceTarget(enemy);
  },
  takeDamage(enemy, { halfArc }, amount, source) {
    const hit = source?.hitPosition;
    if (
      !enemy.alive ||
      !(amount > 0) ||
      enemy.isDamageBlocked() ||
      !hitsFrontalShield(enemy, hit, halfArc)
    ) {
      return amount;
    }
    const overflow = absorbFrontalHit(enemy, amount, hit);
    return overflow > 0 ? overflow : null;
  },
};
