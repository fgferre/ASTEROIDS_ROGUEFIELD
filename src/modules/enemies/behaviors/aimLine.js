/**
 * A marksman's long shot. `interval` s after its last shot it draws a line
 * `length` px at the ship (an 'aim' telegraph, render3d/enemies/telegraph.js)
 * for `aim` s, following the ship until the last `lock` s, when the line
 * holds still (`locked`); then one shot flies down the line at `speed` px/s
 * (`damage`, `lifetime` s, tagged `pattern`). It stands still while it aims;
 * `telegraphRatio` (its lens) rises through the aim. Emits `telegraphEvent`
 * when the line appears.
 */
export default {
  params: {
    interval: 'positive',
    aim: 'positive',
    lock: 'number',
    length: 'positive',
    speed: 'positive',
    damage: 'number',
    lifetime: 'positive',
    pattern: 'string',
    telegraphEvent: 'string',
  },
  check: ({ aim, lock }) => (lock > aim ? 'lock is past aim' : null),
  getters: {
    telegraphRatio(enemy, { aim }) {
      const t = enemy.telegraph;
      return t ? Math.min(1, Math.max(0, 1 - t.timer / aim)) : 0;
    },
  },
  reset(enemy, { interval }) {
    enemy.aimTimer = interval;
    enemy.telegraph = null;
  },
  act(enemy, params, deltaTime, { live, target }) {
    if (!live) return;
    const t = enemy.telegraph;
    if (!t) {
      enemy.aimTimer -= deltaTime;
      if (enemy.aimTimer > 0 || !target) return;
      enemy.telegraph = {
        type: 'aim',
        angle: Math.atan2(target.y - enemy.y, target.x - enemy.x),
        length: params.length,
        duration: params.aim,
        timer: params.aim,
        locked: false,
      };
      enemy.emitEvent(params.telegraphEvent, { telegraph: enemy.telegraph });
    } else {
      t.timer = Math.max(0, t.timer - deltaTime);
      t.locked = t.timer <= params.lock;
      if (!t.locked && target) {
        t.angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      }
      if (t.timer <= 0) {
        fire(enemy, params, t.angle);
        enemy.telegraph = null;
        enemy.aimTimer = params.interval;
        return;
      }
    }
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.rotation = enemy.telegraph.angle;
  },
  dying(enemy) {
    enemy.telegraph = null;
  },
};

function fire(enemy, { speed, damage, lifetime, pattern }, angle) {
  enemy.getEventBus()?.emit?.('enemy-fired', {
    enemy,
    enemyId: enemy.id,
    enemyType: enemy.type,
    wave: enemy.wave,
    position: { x: enemy.x, y: enemy.y },
    velocity: { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed },
    damage,
    projectile: { speed, angle, pattern, lifetime },
    source: { id: enemy.id, type: enemy.type, wave: enemy.wave },
  });
}
