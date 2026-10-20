// Frontal shield plate shared by the Bulwark and the Shielded Elite affix:
// the enemy keeps `facing` (toward the player), `shieldHealth`,
// `maxShieldHealth` and `shieldBroken`. Hits within ±halfArc of the facing
// drain the plate first; a broken plate stays broken.

/** The angle between two directions, 0..π. */
export const angleBetween = (a, b) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

export function faceTarget(enemy) {
  const target = enemy.system?.getCachedPlayer?.()?.position;
  if (target) {
    enemy.facing = Math.atan2(target.y - enemy.y, target.x - enemy.x);
  }
}

/** True when a hit from `point` lands on the intact plate. */
export function hitsFrontalShield(enemy, point, halfArc) {
  if (enemy.shieldBroken || !(enemy.shieldHealth > 0) || !point) return false;
  const angle = Math.atan2(point.y - enemy.y, point.x - enemy.x);
  return angleBetween(angle, enemy.facing ?? 0) <= halfArc;
}

/** Drains the plate by a hit at `point`; returns the damage left for the hull. */
export function absorbFrontalHit(enemy, amount, point) {
  const absorbed = Math.min(enemy.shieldHealth, amount);
  enemy.shieldHealth -= absorbed;
  if (enemy.shieldHealth <= 0) {
    enemy.shieldHealth = 0;
    enemy.shieldBroken = true;
  }
  const bus = enemy.getEventBus();
  bus?.emit?.('shield-deflected', {
    position: { x: point.x, y: point.y },
    normal: { x: Math.cos(enemy.facing), y: Math.sin(enemy.facing) },
    level: 0,
    intensity: enemy.shieldBroken ? 2 : 0.8,
  });
  // The plate's own clang (and crack when it breaks), for the Bulwark and
  // for Shielded Elites alike.
  bus?.emit?.(
    enemy.shieldBroken ? 'bulwark-plate-broken' : 'bulwark-plate-hit',
    {
      enemy,
      enemyId: enemy.id,
      position: { x: point.x, y: point.y },
    }
  );
  return amount - absorbed;
}
