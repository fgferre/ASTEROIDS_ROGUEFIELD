// A hull (see default-hull.js). Bastion: a broad delta with a blunt prow and a
// heavy flat stern, layered armour plates on the shoulders edged in amber,
// twin amber thrusters and darker steel plates (playerMirror.js reads `armor`
// and `albedo`).
import { SHIP_SIZE } from '../../core/GameConstants.js';
import { panelPair, pt } from './lib/panels.js';

const S = SHIP_SIZE;

const BASTION_ALBEDO = 0.7; // proposta 18/10: share of the Interceptor's tones
const visual = {
  accent: 'shot',
  albedo: BASTION_ALBEDO,
  panels: [
    ...panelPair({
      points: [
        pt(-0.68, -0.44),
        pt(-0.92, -0.64),
        pt(-1.0, -0.58),
        pt(-0.8, -0.38),
      ],
      facing: { x: -0.6, y: -0.8 },
      minLevel: { key: 'braking', value: 1 },
      grow: { key: 'braking', indices: [1, 2], step: pt(-0.04, -0.05) },
    }),
    // delta wings: leading edge from the shoulder to the tip
    ...panelPair({
      points: [
        pt(0.42, -0.24),
        pt(-0.58, -0.9),
        pt(-0.72, -0.86),
        pt(-0.62, -0.36),
      ],
      facing: { x: -0.25, y: -1 },
      grow: { key: 'rcs', indices: [1, 2], step: pt(-0.03, -0.05) },
      rcsPort: 1,
    }),
    // body, wide to the flat stern
    ...panelPair({
      points: [
        pt(0.42, 0),
        pt(0.42, -0.24),
        pt(-0.62, -0.36),
        pt(-0.84, -0.3),
        pt(-0.84, 0),
      ],
      facing: { x: -0.05, y: -1 },
    }),
    // prow
    ...panelPair({
      points: [pt(0.98, 0), pt(0.42, 0), pt(0.42, -0.24)],
      facing: { x: 0.4, y: -0.9 },
    }),
    // shoulder armour over the wing roots
    ...panelPair({
      points: [pt(0.36, -0.2), pt(0, -0.5), pt(-0.42, -0.6), pt(-0.36, -0.26)],
      facing: { x: 0.35, y: -0.95 },
      armor: true,
    }),
  ],
  nozzles: [
    { ...pt(-0.84, -0.17), r: 0.085 * S },
    { ...pt(-0.84, 0.17), r: 0.085 * S },
    { ...pt(-0.84, 0), r: 0.065 * S, minLevel: 3 },
  ],
  nozzleLength: 0.13 * S,
  nozzleLengthPerLevel: 0.025 * S,
  retroPorts: [pt(0.42, -0.24), pt(0.42, 0.24)],
  cockpit: { from: pt(0.48, 0), to: pt(0.72, 0), width: 0.08 * S },
};

export default {
  id: 'bastion',
  order: 3,
  name: 'Bastion',
  outline: [
    { x: SHIP_SIZE * 0.98, y: 0 },
    { x: SHIP_SIZE * 0.42, y: -SHIP_SIZE * 0.24 },
    { x: -SHIP_SIZE * 0.58, y: -SHIP_SIZE * 0.9 },
    { x: -SHIP_SIZE * 0.72, y: -SHIP_SIZE * 0.86 },
    { x: -SHIP_SIZE * 0.62, y: -SHIP_SIZE * 0.36 },
    { x: -SHIP_SIZE * 0.84, y: -SHIP_SIZE * 0.3 },
    { x: -SHIP_SIZE * 0.84, y: SHIP_SIZE * 0.3 },
    { x: -SHIP_SIZE * 0.62, y: SHIP_SIZE * 0.36 },
    { x: -SHIP_SIZE * 0.72, y: SHIP_SIZE * 0.86 },
    { x: -SHIP_SIZE * 0.58, y: SHIP_SIZE * 0.9 },
    { x: SHIP_SIZE * 0.42, y: SHIP_SIZE * 0.24 },
  ],
  shieldPadding: 14,
  thrusterPorts: {
    main: { x: -SHIP_SIZE * 1.0, y: 0 },
    aux: { x: SHIP_SIZE * 1.0, y: 0 },
    left: { x: -SHIP_SIZE * 0.62, y: -SHIP_SIZE * 0.82 },
    right: { x: -SHIP_SIZE * 0.62, y: SHIP_SIZE * 0.82 },
  },
  // proposta 18/10: the heavy hull also waits longer between dashes.
  stats: {
    acceleration: 0.85,
    maxSpeed: 0.9,
    maxHealth: 1.35,
    dashCooldown: 1.2,
  },
  visual,
};
