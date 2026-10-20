function setState(enemy, state, duration) {
  enemy.state = state;
  enemy.stateTimer = duration;
}

function approach(enemy, params, target) {
  if (!target) return;
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  const distance = Math.hypot(dx, dy) || 1;
  enemy.rotation = Math.atan2(dy, dx);

  if (distance <= params.engage) {
    beginWindup(enemy, params);
    return;
  }
  const speed = enemy.movementValue('maxSpeed');
  enemy.vx = (dx / distance) * speed;
  enemy.vy = (dy / distance) * speed;
}

function beginWindup(enemy, params) {
  enemy.vx = 0;
  enemy.vy = 0;
  enemy.chargeAngle = enemy.rotation;
  setState(enemy, 'windup', params.windup);
  // Same lane telegraph as the Warden's charge (render3d/enemies/telegraph.js).
  enemy.telegraph = {
    type: 'charge',
    angle: enemy.chargeAngle,
    length: enemy.movementValue('chargeSpeed') * params.charge,
    duration: params.windup,
    timer: params.windup,
  };
  enemy.getEventBus()?.emit?.('boss-telegraph', {
    enemy,
    enemyId: enemy.id,
    telegraph: enemy.telegraph,
  });
}

function windup(enemy, params, target, deltaTime) {
  // Keep aiming through the windup; the lane follows the player.
  if (target) {
    enemy.chargeAngle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    enemy.rotation = enemy.chargeAngle;
  }
  if (enemy.telegraph) {
    enemy.telegraph.angle = enemy.chargeAngle;
    enemy.telegraph.timer = Math.max(0, enemy.telegraph.timer - deltaTime);
  }
  if (enemy.stateTimer > 0) return;

  enemy.telegraph = null;
  const speed = enemy.movementValue('chargeSpeed');
  enemy.vx = Math.cos(enemy.chargeAngle) * speed;
  enemy.vy = Math.sin(enemy.chargeAngle) * speed;
  setState(enemy, 'charge', params.charge);
  enemy.emitEvent(params.chargeEvent);
}

/**
 * Charger. Closes on the ship at its movement speed (`maxSpeed`) until
 * `engage` px away, stops and winds up for `windup` s behind a charge-lane
 * telegraph (aiming all the while), charges straight at `chargeSpeed` for
 * `charge` s, then drifts for `recover` s losing `drag` of its speed per
 * second, and closes in again. `state` is approach / windup / charge /
 * recover; `telegraphRatio` (the lens) rises through the windup and is full
 * in the charge. Emits 'boss-telegraph' (the lane) and `chargeEvent`.
 */
export default {
  params: {
    engage: 'positive',
    windup: 'positive',
    charge: 'positive',
    recover: 'number',
    drag: 'number',
    chargeEvent: 'string',
  },
  getters: {
    telegraphRatio(enemy, params) {
      if (enemy.state === 'charge') return 1;
      if (enemy.state !== 'windup') return 0;
      return Math.min(1, 1 - enemy.stateTimer / params.windup);
    },
  },
  reset(enemy) {
    enemy.state = 'approach';
    enemy.stateTimer = 0;
    enemy.chargeAngle = 0;
    enemy.telegraph = null;
  },
  steer(enemy, params, deltaTime, { live, target }) {
    if (!live) return;
    enemy.stateTimer -= deltaTime;
    switch (enemy.state) {
      case 'approach':
        approach(enemy, params, target);
        break;
      case 'windup':
        windup(enemy, params, target, deltaTime);
        break;
      case 'charge':
        if (enemy.stateTimer <= 0) setState(enemy, 'recover', params.recover);
        break;
      case 'recover': {
        const drag = Math.exp(-params.drag * deltaTime);
        enemy.vx *= drag;
        enemy.vy *= drag;
        if (enemy.stateTimer <= 0) setState(enemy, 'approach', 0);
        break;
      }
      default:
        setState(enemy, 'approach', 0);
    }
  },
  dying(enemy) {
    enemy.telegraph = null;
  },
};
