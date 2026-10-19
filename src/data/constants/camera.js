// src/data/constants/camera.js
//
// Every number of the camera director (core/cameraDirector.js), in one place
// for the owner to tune by playing (PLAN.md 14.2b). The starting values are
// the ones on the behaviour page he approved on 19/10/2026
// (https://claude.ai/artifact/2SQknYsbX8AxEQpPR5JDpi), taken from
// docs/pesquisa-camera-2026-10-19.md. Zoom 1 is the farthest the shot may
// hang: the whole field from edge to edge on the screen's long side; 1.25 is a
// quarter closer. Seconds and field units unless said otherwise; angles in
// degrees.

import { deepFreeze } from '../../utils/deepFreeze.js';

export const CAMERA_DIRECTOR = deepFreeze({
  // What each moment does. `zoom`: the range it frames in (the closest it
  // goes when what matters fits, the farthest before it gives up on extras);
  // `tilt`: extra tilt over the gameplay 18°; `yaw`: a slow turn about the
  // ship over the moment; `roll`: the most the strafe bank may lean; `lead`:
  // the share of the view it moves ahead toward the aim; `minActive`: the
  // least it stays before another (lower) moment may take over.
  moments: {
    calm: { zoom: [1.15, 1.3], tilt: 0, roll: 2, lead: 0.12, minActive: 3 },
    pressure: { zoom: [1.05, 1.15], tilt: 0, roll: 2, lead: 0, minActive: 1.5 },
    danger: { zoom: [1, 1.05], tilt: 0, roll: 0, lead: 0, minActive: 1 },
    // orbBoost (not on the page): the orb clusters pull this many times harder.
    cleared: {
      zoom: [1.25, 1.25],
      tilt: 0,
      roll: 0,
      lead: 0,
      minActive: 1.5,
      orbBoost: 6,
    },
    bossEntrance: { zoom: [1, 1], tilt: 10, roll: 0, lead: 0, minActive: 3 },
    boss: { zoom: [1, 1.1], tilt: 3, roll: 0, lead: 0, minActive: 2 },
    death: { zoom: [1.6, 1.6], tilt: 6, roll: 0, lead: 0, minActive: 2.5 },
    victory: {
      zoom: [1.35, 1.35],
      tilt: 8,
      yaw: 8,
      roll: 0,
      lead: 0,
      minActive: 4,
    },
  },

  // How hard each thing pulls the camera (the page's "O que puxa a câmera").
  weights: {
    player: 10,
    boss: 8,
    miniBoss: 5, // a Herald
    elite: 4, // an elite: the high-value target, it drops more
    threat: 6, // × urgency (1, 2 or 3)
    orbCluster: 1,
    orbClusters: 3, // at most this many clusters count
    common: 0.3,
    commonTotal: 2, // all common enemies together count at most this much
  },
  // Urgency of a threat by its time to hit: 3 under the first, 2 under the
  // second, else 1. Only what will hit within `horizon` is a threat.
  urgency: { triple: 0.8, double: 1.5, horizon: 3 },
  // Not on the page, to tune too: an enemy closing this fast (units/s) is a
  // "fast threat" (a hostile shot always is); things pull with full weight
  // up to `near` and none past `far`; orbs this close are one cluster.
  fastThreatSpeed: 140,
  pullRange: { near: 120, far: 520 },
  orbClusterRadius: 60,

  // Screen margins, as the share of the half-screen a point may use: what
  // will hit stays in the central 88 %, the ship in the central 60 %.
  margins: { threat: 0.88, player: 0.6, framed: 0.88 },

  // Springs (critically damped, Unity's SmoothDamp): about the time to
  // arrive. The zoom opens fast and closes in slowly.
  springs: {
    position: 0.3,
    zoomIn: 0.9,
    zoomOut: 0.25,
    angle: 0.8,
    death: 1.2,
  },
  // Changes smaller than these are ignored, so the camera never chases a
  // box that flickers: zoom (share) and position (units).
  deadBand: { zoom: 0.04, position: 6 },
  // The camera's top speed, in ship top speeds, so the aim never runs away.
  maxSpeed: 1.6,
  // Crossing the field's edge (the wrap): the camera slides to the other
  // side this fast (his choice on 19/10: slide, not cut).
  wrapSlide: 0.25,

  // Danger: a score from what is about to hit (1 under 0.8 s, 0.5 under
  // 1.5 s, 0.2 later) and how many are close (`crowd` within `crowdRange`
  // make 1). It starts after `enter` held for `enterFor` s and ends after
  // under `exit` for `exitFor` s.
  danger: {
    enter: 1,
    enterFor: 1,
    exit: 0.5,
    exitFor: 2,
    crowd: 6,
    crowdRange: 140,
  },
  // Pressure: this many enemies within `range` (fewer than `exit` ends it).
  pressure: { enter: 3, exit: 2, range: 350 },

  // Screen shake (utils/ScreenShake.js) on this camera: the most it may move
  // the shot (units) and turn it (degrees); none under reduced motion.
  shake: { maxOffset: 6, maxAngle: 0.6 },

  // Reduced motion (the system's setting or the game's): no shake, no extra
  // angle, no lead; springs this many times slower; never closer than
  // `maxZoom`; the special moments cut instead of moving.
  reducedMotion: { springScale: 2, maxZoom: 1.15 },
});
