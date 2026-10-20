// A hull: its collision outline, thruster ports, flight stats (multiplied in
// PlayerSystem.resetStats before the Hangar's modifiers; proposta 18/10) and
// procedural art (see ./lib/panels.js). Listed by src/data/shipModels.js.
import { SHIP_SIZE } from '../../data/constants/physics.js';
import { panelPair, pt } from './lib/panels.js';

const S = SHIP_SIZE;

const visual = {
  accent: 'player',
  panels: [
    // aft plates (braking upgrade): flaps behind the fins
    ...panelPair({
      points: [
        pt(-0.38, -0.26),
        pt(-0.64, -0.44),
        pt(-0.74, -0.38),
        pt(-0.52, -0.2),
      ],
      facing: { x: -0.6, y: -0.8 },
      minLevel: { key: 'braking', value: 1 },
      grow: { key: 'braking', indices: [1, 2], step: pt(-0.05, -0.05) },
    }),
    // swept fins (rcs upgrade grows the span)
    ...panelPair({
      points: [
        pt(0.06, -0.24),
        pt(-0.6, -0.64),
        pt(-0.7, -0.6),
        pt(-0.42, -0.27),
      ],
      facing: { x: -0.3, y: -1 },
      grow: { key: 'rcs', indices: [1, 2], step: pt(-0.045, -0.075) },
      rcsPort: 1,
    }),
    // body
    ...panelPair({
      points: [
        pt(0.3, 0),
        pt(0.3, -0.21),
        pt(-0.28, -0.31),
        pt(-0.5, -0.2),
        pt(-0.5, 0),
      ],
      facing: { x: -0.05, y: -1 },
    }),
    // nose
    ...panelPair({
      points: [pt(1, 0), pt(0.3, 0), pt(0.3, -0.21)],
      facing: { x: 0.5, y: -0.85 },
    }),
  ],
  nozzles: [
    { ...pt(-0.5, -0.12), r: 0.075 * S },
    { ...pt(-0.5, 0.12), r: 0.075 * S },
    { ...pt(-0.5, 0), r: 0.06 * S, minLevel: 3 },
    { ...pt(-0.42, -0.25), r: 0.055 * S, minLevel: 5 },
    { ...pt(-0.42, 0.25), r: 0.055 * S, minLevel: 5 },
  ],
  nozzleLength: 0.14 * S,
  nozzleLengthPerLevel: 0.025 * S,
  retroPorts: [pt(0.3, -0.21), pt(0.3, 0.21)],
  cockpit: { from: pt(0.4, 0), to: pt(0.66, 0), width: 0.07 * S },
  // a needle prow swelling into a rounded deck, swept fins with a slight
  // droop, canted tail fins with the braking upgrade, wingtip pods
  form: {
    body: [
      [1.0, 0, 0.15, 0, 0],
      [0.94, 0.028, 0.152, 0.022, 0.016],
      [0.82, 0.066, 0.156, 0.055, 0.035],
      [0.62, 0.12, 0.162, 0.1, 0.058],
      [0.4, 0.18, 0.168, 0.14, 0.072],
      [0.15, 0.235, 0.172, 0.168, 0.082],
      [-0.1, 0.268, 0.174, 0.175, 0.086],
      [-0.3, 0.27, 0.174, 0.16, 0.085],
      [-0.44, 0.232, 0.174, 0.142, 0.08],
      [-0.5, 0.2, 0.174, 0.13, 0.076],
    ],
    deck: [2, 1.5],
    belly: [1.7, 1.2],
    spine: 0.32,
    keel: 0.22,
    seams: [0.3, -0.25],
    prow: 0.3,
    wing: { lift: 0.17, cant: -4, tc: [0.2, 0.12], belly: 0.7 },
    flap: { lift: 0.2, cant: 38, tc: [0.12, 0.1], belly: 1 },
    intake: 0.22,
    nacelle: 0.28,
    pods: true,
    canopy: 0.1,
  },
};

export default {
  id: 'default-hull',
  order: 1,
  name: 'Interceptor',
  outline: [
    { x: SHIP_SIZE, y: 0 },
    { x: -SHIP_SIZE / 2, y: -SHIP_SIZE / 2 },
    { x: -SHIP_SIZE / 3, y: 0 },
    { x: -SHIP_SIZE / 2, y: SHIP_SIZE / 2 },
  ],
  shieldPadding: 12,
  thrusterPorts: {
    main: { x: -SHIP_SIZE * 0.95, y: 0 },
    aux: { x: SHIP_SIZE * 0.95, y: 0 },
    left: { x: 0, y: -SHIP_SIZE * 0.95 },
    right: { x: 0, y: SHIP_SIZE * 0.95 },
  },
  stats: {
    acceleration: 1,
    maxSpeed: 1,
    maxHealth: 1,
    dashCooldown: 1,
  },
  visual,
};
