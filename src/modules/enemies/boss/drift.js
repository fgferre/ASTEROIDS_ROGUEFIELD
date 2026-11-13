// src/modules/enemies/boss/drift.js
//
// A sector boss easing toward mid-field: it steers its velocity toward one
// that points at the centre and slows as it arrives, turning at most
// `acceleration` px/s² per second. `drift` is the boss's content block
// { acceleration, maxSpeed, arrive }.

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';

// Toward mid-field, slowing as it arrives.
export function driftToCentre(boss, deltaTime, drift) {
  boss.movementStrategy = 'linear';
  const { acceleration, maxSpeed, arrive } = drift;
  const dx = GAME_WIDTH / 2 - boss.x;
  const dy = GAME_HEIGHT / 2 - boss.y;
  const distance = Math.hypot(dx, dy);
  const wanted = distance > 1 ? maxSpeed * Math.min(1, distance / arrive) : 0;
  const wx = distance > 1 ? (dx / distance) * wanted : 0;
  const wy = distance > 1 ? (dy / distance) * wanted : 0;
  const step = acceleration * deltaTime;
  const ex = wx - boss.vx;
  const ey = wy - boss.vy;
  const gap = Math.hypot(ex, ey);
  const k = gap > step ? step / gap : 1;
  boss.vx += ex * k;
  boss.vy += ey * k;
}
