// src/modules/enemies/boss/charge.js
//
// The charge (phase 3): idle -> windup (the lane telegraph) -> charging (the
// dash, with a ring of shots as it starts and as it ends) -> recover -> idle.
// The functions act on the boss passed first; the idle state starts a charge
// through boss.beginCharge, which WardenNull extends.

export function updateChargeState(boss, deltaTime, target) {
  switch (boss.chargeState) {
    case 'windup':
      // Slow to a near stop, keep tracking the player, show the lane.
      boss.vx *= Math.max(0, 1 - 6 * deltaTime);
      boss.vy *= Math.max(0, 1 - 6 * deltaTime);
      if (target?.position) {
        boss.chargeAimAngle = boss.angleTo(target.position);
        boss.rotation = boss.chargeAimAngle;
        if (boss.telegraph?.type === 'charge') {
          boss.telegraph.angle = boss.chargeAimAngle;
        }
      }
      boss.chargeStateTimer -= deltaTime;
      if (boss.telegraph?.type === 'charge') {
        boss.telegraph.timer = Math.max(0, boss.chargeStateTimer);
      }
      if (boss.chargeStateTimer <= 0) {
        launchCharge(boss);
      }
      break;
    case 'charging':
      boss.chargeStateTimer -= deltaTime;
      if (boss.chargeStateTimer <= 0) {
        boss.chargeState = 'recover';
        boss.chargeStateTimer = boss.chargeRecovery;
        boss.applyPhaseMovement(true);
        triggerChargeBurst(boss, 'end');
      }
      break;
    case 'recover':
      boss.chargeStateTimer -= deltaTime;
      if (boss.chargeStateTimer <= 0) {
        boss.chargeState = 'idle';
        boss.chargeTimer = boss.chargeCooldown;
      }
      break;
    default:
      boss.chargeTimer -= deltaTime;
      if (boss.chargeTimer <= 0) {
        boss.beginCharge(target);
      }
      break;
  }
}

export function beginCharge(boss, target) {
  const aimPosition = target?.position || null;
  boss.chargeAimAngle = aimPosition ? boss.angleTo(aimPosition) : 0;

  // The phase movement would steer and cap the dash; drift on vx/vy instead
  // until the charge ends.
  boss.movementStrategy = 'linear';

  const windup = Math.max(0, boss.chargeWindup || 0);
  if (windup <= 0) {
    launchCharge(boss);
    return;
  }

  const chargeSpeed = (boss.speed || 0) * (boss.chargeSpeedMultiplier || 3);
  boss.chargeState = 'windup';
  boss.chargeStateTimer = windup;
  boss.rotation = boss.chargeAimAngle;
  boss.setTelegraph({
    type: 'charge',
    angle: boss.chargeAimAngle,
    length: chargeSpeed * (boss.chargeDuration || 1),
    duration: windup,
    timer: windup,
  });
}

export function launchCharge(boss) {
  boss.clearTelegraph();
  const angle =
    boss.chargeAimAngle + boss.sampleVariance(boss.chargeAimVariance);

  const chargeSpeed = (boss.speed || 0) * (boss.chargeSpeedMultiplier || 3);
  boss.vx = Math.cos(angle) * chargeSpeed;
  boss.vy = Math.sin(angle) * chargeSpeed;
  boss.rotation = angle;

  boss.chargeState = 'charging';
  boss.chargeStateTimer = boss.chargeDuration;
  triggerChargeBurst(boss, 'start');
}

export function triggerChargeBurst(boss, stage) {
  if (!boss.chargeProjectileCount || boss.chargeProjectileCount <= 0) {
    return;
  }

  const count = Math.max(1, Math.floor(boss.chargeProjectileCount));
  const angleStep = (Math.PI * 2) / count;
  const baseOffset = boss.sampleVariance(boss.chargeProjectileVariance);

  for (let i = 0; i < count; i += 1) {
    const angle = baseOffset + i * angleStep;
    boss.emitBossProjectile({
      angle,
      speed: boss.chargeProjectileSpeed,
      damage: boss.projectileDamage,
      pattern: 'charge-burst',
      meta: { stage },
    });
  }
}
