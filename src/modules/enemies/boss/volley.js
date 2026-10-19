// src/modules/enemies/boss/volley.js
//
// The volley (phase 2): a burst of aimed shots, one every volleyShotDelay
// seconds, then a cooldown. The functions act on the boss passed first.

export function updateVolleyCycle(boss, deltaTime, target) {
  if (boss.volleyShotsRemaining > 0) {
    boss.volleyShotTimer -= deltaTime;
    if (boss.volleyShotTimer <= 0 && target?.position) {
      fireVolleyShot(boss, target.position);
      boss.volleyShotsRemaining -= 1;
      boss.volleyShotTimer = boss.volleyShotDelay;
    }
    return;
  }

  boss.volleyTimer -= deltaTime;
  if (boss.volleyTimer <= 0 && target?.position) {
    startVolley(boss);
    fireVolleyShot(boss, target.position);
    boss.volleyShotsRemaining -= 1;
    boss.volleyShotTimer = boss.volleyShotDelay;
  }
}

export function startVolley(boss) {
  boss.volleyShotsRemaining = Math.max(0, Math.floor(boss.volleyBurstSize));
  boss.volleyTimer = boss.computeVolleyCooldown();
}

export function fireVolleyShot(boss, targetPosition) {
  const angle =
    boss.angleTo(targetPosition) + boss.sampleVariance(boss.volleySpread);

  boss.emitBossProjectile({
    angle,
    speed: boss.volleyProjectileSpeed,
    damage: boss.projectileDamage,
    pattern: 'volley',
  });
}
