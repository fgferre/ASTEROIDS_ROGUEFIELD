import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';

/**
 * Runs straight lanes at its movement speed (`maxSpeed`), facing the way it
 * goes: each lane passes `offset` px beside where the ship is when it
 * starts, on the side away from where the last one passed (`lanePoint`), and
 * lasts until it would come within `margin` px of the field's edge
 * (`laneAngle`). In a formation's course it runs none; its first lane starts
 * when that ends.
 */
export default {
  params: { margin: 'number', offset: 'number' },
  reset(enemy) {
    enemy.laneAngle = null;
    enemy.lanePoint = null;
  },
  steer(enemy, { margin, offset }, deltaTime, { live, target }) {
    if (!live || enemy.course) return;
    const heading = enemy.laneAngle;
    const dx = Math.cos(heading ?? 0);
    const dy = Math.sin(heading ?? 0);
    const leaving =
      (enemy.x < margin && dx < 0) ||
      (enemy.x > GAME_WIDTH - margin && dx > 0) ||
      (enemy.y < margin && dy < 0) ||
      (enemy.y > GAME_HEIGHT - margin && dy > 0);
    if ((heading === null || leaving) && target) {
      const tx = target.x - enemy.x;
      const ty = target.y - enemy.y;
      const distance = Math.hypot(tx, ty) || 1;
      const [a, b] = [1, -1].map((side) => ({
        x: target.x - (ty / distance) * offset * side,
        y: target.y + (tx / distance) * offset * side,
      }));
      const last = enemy.lanePoint;
      const far = (p) => (last ? Math.hypot(p.x - last.x, p.y - last.y) : 0);
      const point = far(b) > far(a) ? b : a;
      enemy.lanePoint = point;
      enemy.laneAngle = Math.atan2(point.y - enemy.y, point.x - enemy.x);
    }
    if (enemy.laneAngle === null) return;
    const speed = enemy.movementValue('maxSpeed');
    enemy.vx = Math.cos(enemy.laneAngle) * speed;
    enemy.vy = Math.sin(enemy.laneAngle) * speed;
    enemy.rotation = enemy.laneAngle;
  },
};
