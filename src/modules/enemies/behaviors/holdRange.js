import { holdOnField } from './field.js';

/**
 * Holds `min`–`max` px from the ship: closes in beyond the band, backs off
 * inside it, holds within, at its movement speed (`speed`); faces the ship and
 * never backs off the field (`margin` px in).
 */
export default {
  params: { min: 'number', max: 'number', margin: 'number' },
  getters: {
    speed: (enemy) => enemy.movementValue('maxSpeed'),
  },
  steer(enemy, { min, max, margin }, deltaTime, { live, target }) {
    if (!live) return;
    if (!target) {
      enemy.vx = 0;
      enemy.vy = 0;
      return;
    }
    const dx = target.x - enemy.x;
    const dy = target.y - enemy.y;
    const distance = Math.hypot(dx, dy) || 1;
    enemy.rotation = Math.atan2(dy, dx);
    const pace =
      distance > max ? enemy.speed : distance < min ? -enemy.speed : 0;
    enemy.vx = (dx / distance) * pace;
    enemy.vy = (dy / distance) * pace;
    holdOnField(enemy, margin);
  },
};
