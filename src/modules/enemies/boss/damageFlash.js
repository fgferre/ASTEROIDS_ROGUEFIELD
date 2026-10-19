// src/modules/enemies/boss/damageFlash.js
//
// The Warden's own damage flash: brighter for a bigger hit, it fades over
// damageFlashDuration (BaseEnemy.getHitFlash reads it). The functions act on
// the boss passed first.

export function updateFeedbackState(boss, deltaTime) {
  if (!Number.isFinite(deltaTime) || deltaTime <= 0) {
    return;
  }

  if (boss.damageFlashTimer > 0) {
    boss.damageFlashTimer = Math.max(0, boss.damageFlashTimer - deltaTime);
    if (boss.damageFlashTimer === 0) {
      boss.damageFlashStrength = 0;
    }
  }
}

export function triggerDamageFlash(boss, amount = 0) {
  const normalizedDamage = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  const maxHealth =
    Number.isFinite(boss.maxHealth) && boss.maxHealth > 0 ? boss.maxHealth : 1;
  const relativeDamage = Math.min(
    1,
    normalizedDamage / Math.max(24, maxHealth * 0.12)
  );

  boss.damageFlashStrength = Math.max(
    boss.damageFlashStrength || 0,
    0.45 + relativeDamage * 0.55
  );
  boss.damageFlashTimer = Math.max(
    boss.damageFlashTimer || 0,
    boss.damageFlashDuration
  );
}

export function resetFeedbackState(boss) {
  boss.damageFlashTimer = 0;
  boss.damageFlashStrength = 0;
}
