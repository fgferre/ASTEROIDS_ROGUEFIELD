import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';

/** Drops the part of its velocity that would take it further off the field. */
export function holdOnField(enemy, margin) {
  if (
    (enemy.x < margin && enemy.vx < 0) ||
    (enemy.x > GAME_WIDTH - margin && enemy.vx > 0)
  ) {
    enemy.vx = 0;
  }
  if (
    (enemy.y < margin && enemy.vy < 0) ||
    (enemy.y > GAME_HEIGHT - margin && enemy.vy > 0)
  ) {
    enemy.vy = 0;
  }
}
