// src/data/constants/camera.js
//
// Every number of the gameplay camera (core/cameraDirector.js), in one place
// for the owner to tune by playing (PLAN.md 14.2b). The behaviour is the
// page he approved on 19/10/2026
// (https://claude.ai/artifact/DXgVoUtHcjcEob5er2Q69e): top-down while
// playing, near by default, wide when it must show everything. Seconds,
// field units and degrees unless said otherwise.

import { deepFreeze } from '../../utils/deepFreeze.js';

export const CAMERA_DIRECTOR = deepFreeze({
  // Near: follows the ship at today's tilt. `zoom` is how close, over the
  // farthest shot that fits inside the field at that tilt ("como na foto
  // Perto"); `lead` the share of the view it moves ahead toward the aim;
  // `beyondEdge` how much of the half-view may show past the field's edge.
  near: { tilt: 18, zoom: 1.3, lead: 0.12, beyondEdge: 0.4 },

  // Wide: nearly straight down, the whole field and some space around it;
  // `margin` is the share of the screen kept free around the field.
  wide: { tilt: 5, margin: 0.05 },

  // How long the wide view stays at least once open, and at most for the
  // orbs of a cleared wave (it closes earlier when they are all collected).
  wideHold: 3,
  clearedHold: 5,
  // Short wide looks: a wave starting, an elite out of sight, a boss's
  // announced attack, a boss arriving (until the live scene exists).
  glance: { waveStart: 2, elite: 2.5, telegraph: 2, bossArrival: 3 },

  // What opens the wide view during play: something that will hit within
  // `threatHorizon` s is off the near shot (so it opens before it arrives);
  // enemies within `surroundRange` on at least `surroundSides` of the four
  // sides around the ship; the ship reaching an edge within `edgeAhead` s.
  threatHorizon: 2,
  fastThreatSpeed: 140,
  surroundRange: 300,
  surroundSides: 3,
  edgeAhead: 0.45,

  // Springs (about the time to arrive): the view opens fast and closes in
  // slowly; the tilt eases between near and wide.
  springs: { position: 0.3, open: 0.25, close: 1, tilt: 0.6 },
  // The camera's top speed while following, in ship top speeds.
  maxSpeed: 1.6,

  // A slow drift that keeps the calm shot alive: offset as a share of the
  // view's short side, a lean in degrees, over about `period` s. It fades to
  // nothing with any threat close and is off under reduced motion.
  drift: { offset: 0.005, lean: 0.5, period: 8, calmRange: 350 },

  // Strafe bank while near (degrees), none in the wide view.
  roll: 2,

  // Screen shake (utils/ScreenShake.js) on this camera: the most it may move
  // the shot (units) and turn it (degrees); none under reduced motion.
  shake: { maxOffset: 6, maxAngle: 0.6 },

  // A boss falling mid-run: a short push from above, skipped in danger.
  bossDown: { zoom: 1.06, duration: 0.6 },

  // Reduced motion (the system's setting or the game's): no drift, lead,
  // bank or shake; the wide view cuts in and out instead of moving; the
  // rest eases this many times slower.
  reducedMotion: { springScale: 2 },
});
