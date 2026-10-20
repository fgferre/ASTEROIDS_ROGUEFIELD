// src/modules/enemies/boss/arrival.js
//
// A Warden's entrance (PLAN.md 14.2b d, the owner's direction of 19/10/2026):
// it is born past the field's left or right edge, the one farther from the
// ship, flies in with its pieces open to where its fight starts, and closes
// up; only then does it fight. Meanwhile it touches nothing and the ship is
// held (PlayerSystem.holdControls, every step: a run's start can reset the
// ship after the spawn). Each Warden's own script is the
// `arrival` recipe in its content file (src/content/bosses/, CONTENT.md),
// timed on screen while the world runs at `world` speed, so here its times
// become world time. Part of the simulation, so replays hold. The live
// camera reads `boss.arrival` (core/cameraDirector.js); the effects follow
// 'boss-arrival-crossed' and 'boss-arrived'.

import { GAME_HEIGHT, GAME_WIDTH } from '../../../core/GameConstants.js';

// How it flies in: progress along the path over the travel (both 0..1).
const MOTIONS = {
  brake: (t) => 1 - (1 - t) ** 3,
  glide: (t) => t * t * (3 - 2 * t),
  heavy: (t) => 1 - (1 - t) ** 2,
};

/** The edge a Warden comes in through: the side the ship is farther from. */
export function arrivalEdge(shipX, fieldWidth = GAME_WIDTH) {
  return shipX > fieldWidth / 2 ? 'left' : 'right';
}

/**
 * Moves `boss`, standing where its fight starts, past `edge` and starts its
 * entrance from `recipe`. Returns what 'boss-spawned' carries: the path and
 * the recipe's screen timing.
 */
export function beginArrival(boss, recipe, edge) {
  const to = { x: boss.x, y: boss.y };
  const past = boss.radius + recipe.start;
  const fromX = edge === 'left' ? -past : GAME_WIDTH + past;
  // A curved path starts toward the field's middle row and swings out to
  // its spot.
  const bow = to.y < GAME_HEIGHT / 2 ? recipe.curve : -recipe.curve;
  const from = { x: fromX, y: to.y + bow };
  boss.arrival = {
    edge,
    from,
    via: { x: (fromX + to.x) / 2, y: from.y },
    to,
    ease: MOTIONS[recipe.motion],
    travel: recipe.travel * recipe.world,
    close: recipe.close * recipe.world,
    spread: recipe.open,
    spin: recipe.spin / recipe.world,
    elapsed: 0,
    // How open its pieces are now (0 shut), and how far along (0..1).
    open: recipe.open,
    progress: 0,
    // Its bodies already past the edge (arrivalBodies).
    crossed: [],
    recipe,
  };
  boss.intangible = true;
  placeOnPath(boss, 0);
  return {
    edge,
    from: { ...from },
    to: { ...to },
    travel: recipe.travel,
    close: recipe.close,
    world: recipe.world,
    recover: recipe.recover,
    flare: recipe.flare,
  };
}

/** World seconds left of its entrance. */
export function arrivalRemaining(boss) {
  const a = boss.arrival;
  return a ? a.travel + a.close - a.elapsed : 0;
}

function placeOnPath(boss, p) {
  const { from, via, to } = boss.arrival;
  const q = 1 - p;
  boss.x = q * q * from.x + 2 * q * p * via.x + p * p * to.x;
  boss.y = q * q * from.y + 2 * q * p * via.y + p * p * to.y;
}

/**
 * One step of the entrance (world `dt`): along the path, then closing up,
 * the Warden's own pose (poseArrival) and the edge crossings. `emit(name,
 * payload)` sends 'boss-arrival-crossed' per body and 'boss-arrived' at the
 * end, when the fight starts.
 */
export function advanceArrival(boss, dt, emit) {
  const a = boss.arrival;
  const x0 = boss.x;
  const y0 = boss.y;
  a.elapsed += dt;
  const total = a.travel + a.close;
  a.progress = Math.min(1, a.elapsed / total);
  placeOnPath(boss, a.ease(Math.min(1, a.elapsed / a.travel)));
  const shut = Math.max(0, Math.min(1, (a.elapsed - a.travel) / a.close));
  // Slow off the mark, then all at once.
  a.open = a.spread * (1 - shut * shut * shut);
  boss.vx = dt > 0 ? (boss.x - x0) / dt : 0;
  boss.vy = dt > 0 ? (boss.y - y0) / dt : 0;
  boss.poseArrival(a.open, a.spin * a.open, dt);

  const edgeX = a.edge === 'left' ? 0 : GAME_WIDTH;
  boss.arrivalBodies().forEach((body, i) => {
    if (a.crossed[i] || body.x < 0 || body.x > GAME_WIDTH) return;
    a.crossed[i] = true;
    emit('boss-arrival-crossed', {
      enemy: boss,
      x: edgeX,
      y: body.y,
      edge: a.edge,
      flare: a.recipe.flare,
    });
  });

  if (a.elapsed < total) return;
  boss.arrival = null;
  boss.intangible = false;
  boss.x = a.to.x;
  boss.y = a.to.y;
  boss.vx = 0;
  boss.vy = 0;
  boss.poseArrival(0, 0, 0);
  emit('boss-arrived', {
    enemy: boss,
    enemyId: boss.id,
    position: { x: boss.x, y: boss.y },
  });
}
