// src/modules/enemies/boss/fan.js
//
// The fan (the spread attack): its cooldown, the wedge that announces it, the
// shots. Both functions act on the boss passed first and reach attackOrigin,
// angleTo and the telegraph through it, so a Warden with several bodies
// (WardenChoir) still fires from the one that sings.

// The fan is announced by a wedge for `spreadWindup` seconds, then fired
// at the player's position at that moment.
export function updateSpreadCycle(boss, deltaTime, target) {
  if (boss.spreadWindupTimer > 0) {
    boss.spreadWindupTimer -= deltaTime;
    if (target?.position) {
      boss.chargeAimAngle = boss.angleTo(target.position);
      if (boss.telegraph?.type === 'fan') {
        const origin = boss.attackOrigin();
        boss.telegraph.x = origin.x;
        boss.telegraph.y = origin.y;
        boss.telegraph.angle = boss.chargeAimAngle;
        boss.telegraph.timer = Math.max(0, boss.spreadWindupTimer);
      }
    }
    if (boss.spreadWindupTimer <= 0) {
      boss.clearTelegraph();
      if (target?.position) {
        fireSpreadPattern(boss, target.position);
      }
      boss.spreadTimer = boss.computeSpreadCooldown();
    }
    return;
  }

  boss.spreadTimer -= deltaTime;
  if (boss.spreadTimer <= 0 && target?.position) {
    const windup = Math.max(0, boss.spreadWindup || 0);
    if (windup <= 0) {
      fireSpreadPattern(boss, target.position);
      boss.spreadTimer = boss.computeSpreadCooldown();
      return;
    }
    boss.spreadWindupTimer = windup;
    boss.chargeAimAngle = boss.angleTo(target.position);
    const origin = boss.attackOrigin();
    boss.setTelegraph({
      type: 'fan',
      x: origin.x,
      y: origin.y,
      angle: boss.chargeAimAngle,
      arc: Math.max(0, boss.spreadArc ?? 0),
      length: 180,
      duration: windup,
      timer: windup,
    });
  }
}

export function fireSpreadPattern(boss, targetPosition) {
  const baseAngle = boss.angleTo(targetPosition);

  const count = Math.max(1, Math.floor(boss.spreadProjectileCount));
  const arc = Math.max(0, boss.spreadArc ?? 0);
  const startAngle = baseAngle - arc / 2;
  const step = count > 1 ? arc / (count - 1) : 0;

  for (let i = 0; i < count; i += 1) {
    const angle =
      startAngle + step * i + boss.sampleVariance(boss.spreadAngleVariance);
    boss.emitBossProjectile({
      angle,
      speed: boss.spreadProjectileSpeed,
      damage: boss.projectileDamage,
      pattern: 'spread',
    });
  }
}
