// A hull (see default-hull.js). Solar Slicer: a longer, thinner spine with two
// swept blades whose edges burn amber, twin amber thrusters set wide on the
// blade roots and a low turret housing (playerMirror.js reads `blades` and
// `turret`).
import { SHIP_SIZE } from '../../data/constants/physics.js';
import { panelPair, pt } from './lib/panels.js';

const S = SHIP_SIZE;

const visual = {
  accent: 'shot',
  blades: true,
  turret: 'low',
  panels: [
    ...panelPair({
      points: [
        pt(-0.78, -0.42),
        pt(-1.04, -0.6),
        pt(-1.12, -0.52),
        pt(-0.94, -0.36),
      ],
      facing: { x: -0.6, y: -0.8 },
      minLevel: { key: 'braking', value: 1 },
      grow: { key: 'braking', indices: [1, 2], step: pt(-0.04, -0.05) },
    }),
    // swept blades: a long leading edge from the waist to the tip, the
    // trailing edge cut back to the thruster pod
    ...panelPair({
      points: [
        pt(0.1, -0.13),
        pt(-0.98, -0.8),
        pt(-0.78, -0.5),
        pt(-0.9, -0.38),
        pt(-0.9, -0.2),
        pt(-0.8, -0.13),
      ],
      facing: { x: -0.2, y: -1 },
      grow: { key: 'rcs', indices: [1, 2], step: pt(-0.03, -0.05) },
      rcsPort: 1,
    }),
    // spine
    ...panelPair({
      points: [
        pt(0.55, 0),
        pt(0.55, -0.12),
        pt(-0.3, -0.15),
        pt(-1.0, -0.13),
        pt(-1.1, -0.07),
        pt(-1.1, 0),
      ],
      facing: { x: -0.05, y: -1 },
    }),
    // prow
    ...panelPair({
      points: [pt(1.35, 0), pt(0.55, 0), pt(0.55, -0.12)],
      facing: { x: 0.45, y: -0.9 },
    }),
  ],
  nozzles: [
    { ...pt(-0.9, -0.29), r: 0.075 * S },
    { ...pt(-0.9, 0.29), r: 0.075 * S },
    { ...pt(-1.1, 0), r: 0.055 * S, minLevel: 3 },
  ],
  nozzleLength: 0.16 * S,
  nozzleLengthPerLevel: 0.025 * S,
  retroPorts: [pt(0.55, -0.12), pt(0.55, 0.12)],
  cockpit: { from: pt(0.72, 0), to: pt(1.02, 0), width: 0.06 * S },
  // a long ridged needle, thin lens-section blades, engine pods riding the
  // blade roots, tail fins with the braking upgrade
  form: {
    body: [
      [1.35, 0, 0.15, 0, 0],
      [1.27, 0.02, 0.151, 0.018, 0.012],
      [1.1, 0.05, 0.154, 0.042, 0.026],
      [0.85, 0.085, 0.158, 0.07, 0.04],
      [0.55, 0.12, 0.162, 0.1, 0.052],
      [0.2, 0.135, 0.165, 0.13, 0.058],
      [-0.3, 0.135, 0.166, 0.14, 0.062],
      [-0.7, 0.118, 0.166, 0.125, 0.058],
      [-1.0, 0.095, 0.166, 0.1, 0.052],
      [-1.1, 0.065, 0.166, 0.08, 0.046],
    ],
    deck: [1, 1],
    belly: [2, 1.3],
    spine: 0.3,
    keel: 0.25,
    seams: [0.55, -0.6],
    prow: 0.55,
    wing: { lift: 0.16, cant: -4, tc: [0.07, 0.05], belly: 0.8 },
    flap: { lift: 0.18, cant: 32, tc: [0.1, 0.08], belly: 1 },
    intake: 0.42,
    nacelle: 0.3,
    pods: false,
    canopy: 0.085,
  },
};

export default {
  id: 'solar-slicer',
  order: 2,
  name: 'Solar Slicer',
  // Collision, shield and the menu preview's base plate follow the blades.
  outline: [
    { x: SHIP_SIZE * 1.35, y: 0 },
    { x: SHIP_SIZE * 0.1, y: -SHIP_SIZE * 0.13 },
    { x: -SHIP_SIZE * 0.98, y: -SHIP_SIZE * 0.8 },
    { x: -SHIP_SIZE * 0.78, y: -SHIP_SIZE * 0.5 },
    { x: -SHIP_SIZE * 0.9, y: -SHIP_SIZE * 0.38 },
    { x: -SHIP_SIZE * 1.1, y: -SHIP_SIZE * 0.07 },
    { x: -SHIP_SIZE * 1.1, y: SHIP_SIZE * 0.07 },
    { x: -SHIP_SIZE * 0.9, y: SHIP_SIZE * 0.38 },
    { x: -SHIP_SIZE * 0.78, y: SHIP_SIZE * 0.5 },
    { x: -SHIP_SIZE * 0.98, y: SHIP_SIZE * 0.8 },
    { x: SHIP_SIZE * 0.1, y: SHIP_SIZE * 0.13 },
  ],
  shieldPadding: 14,
  thrusterPorts: {
    main: { x: -SHIP_SIZE * 1.12, y: 0 },
    aux: { x: SHIP_SIZE * 1.15, y: 0 },
    left: { x: -SHIP_SIZE * 0.75, y: -SHIP_SIZE * 0.64 },
    right: { x: -SHIP_SIZE * 0.75, y: SHIP_SIZE * 0.64 },
  },
  stats: {
    acceleration: 1.15,
    maxSpeed: 1.15,
    maxHealth: 0.8,
    dashCooldown: 0.85,
  },
  visual,
};
