/**
 * Comes about toward the ship at most `turn` rad/s and drives along its nose
 * at its movement speed (`maxSpeed`): slow to turn, it can be got behind.
 * Its `rotation` is its facing; it spawns facing the ship.
 */
export default {
  params: { turn: 'positive' },
  init(enemy) {
    const target = enemy.system?.getCachedPlayer?.()?.position;
    if (target) {
      enemy.rotation = Math.atan2(target.y - enemy.y, target.x - enemy.x);
    }
  },
  steer(enemy, { turn }, deltaTime, { live, target }) {
    if (!live) return;
    if (target) {
      const want = Math.atan2(target.y - enemy.y, target.x - enemy.x);
      const off = Math.atan2(
        Math.sin(want - enemy.rotation),
        Math.cos(want - enemy.rotation)
      );
      const step = turn * deltaTime;
      enemy.rotation += Math.max(-step, Math.min(step, off));
    }
    const speed = enemy.movementValue('maxSpeed');
    enemy.vx = Math.cos(enemy.rotation) * speed;
    enemy.vy = Math.sin(enemy.rotation) * speed;
  },
};
