import { angleBetween } from '../base/frontalShield.js';

/**
 * Armour on every side but its back. A hit from within ±`rearArc` of its
 * tail (by `source.hitPosition`, the shot; its facing is `rotation`) deals
 * `rear` × its damage; any other `front` ×, sparking off the plates (a hit
 * with no position counts as frontal).
 */
export default {
  params: { front: 'number', rear: 'positive', rearArc: 'positive' },
  check: ({ front, rear }) => (front > rear ? 'front is past rear' : null),
  takeDamage(enemy, { front, rear, rearArc }, amount, source) {
    if (!enemy.alive || !(amount > 0)) return amount;
    const hit = source?.hitPosition;
    const angle = hit ? Math.atan2(hit.y - enemy.y, hit.x - enemy.x) : null;
    if (
      angle !== null &&
      angleBetween(angle, enemy.rotation + Math.PI) <= rearArc
    ) {
      return amount * rear;
    }
    if (hit) {
      enemy.getEventBus()?.emit?.('shield-deflected', {
        position: { x: hit.x, y: hit.y },
        normal: { x: Math.cos(angle), y: Math.sin(angle) },
        level: 0,
        intensity: 0.5,
      });
    }
    const left = amount * front;
    return left > 0 ? left : null;
  },
};
