import { SHIP_SIZE } from '../core/GameConstants.js';

const DEFAULT_HULL_ID = 'default-hull';
const SOLAR_SLICER_HULL_ID = 'solar-slicer';
const BASTION_HULL_ID = 'bastion';
const warnedMissingHullIds = new Set();

const freezeDeep = (value) => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach((entry) => freezeDeep(entry));
  return Object.freeze(value);
};

const clonePoint = (point) => ({
  x: Number(point?.x) || 0,
  y: Number(point?.y) || 0,
});

const clonePointMap = (points) => {
  const entries = Object.entries(points || {}).map(([key, point]) => [
    key,
    clonePoint(point),
  ]);
  return Object.fromEntries(entries);
};

const createHullDefinition = (definition) =>
  freezeDeep({
    ...definition,
    outline: Array.isArray(definition?.outline)
      ? definition.outline.map((point) => clonePoint(point))
      : [],
    thrusterPorts: clonePointMap(definition?.thrusterPorts),
  });

// --- Procedural hull art (docs/NORTE.md §3) ---------------------------------
// Coordinates are in SHIP_SIZE units, nose toward +x. Each panel is a matte
// facet: `facing` is the direction its bevel looks at (ship-local), so the
// renderer lights it against the fixed world key light. Panels are listed
// for the left side (y < 0) and mirrored. `grow` moves the listed vertices by
// `step` per level of the named visual upgrade (thruster | rcs | braking);
// `minLevel` hides a panel until that upgrade level. An `armor` panel rides
// on the plates under it as two stacked plates trimmed in the accent; a
// visual's `albedo` scales its hull tones.
const S = SHIP_SIZE;
const pt = (x, y) => ({ x: x * S, y: y * S });

const mirrorPanel = (panel) => ({
  ...panel,
  points: panel.points.map((p) => ({ x: p.x, y: -p.y })),
  facing: { x: panel.facing.x, y: -panel.facing.y },
  grow: panel.grow
    ? { ...panel.grow, step: { x: panel.grow.step.x, y: -panel.grow.step.y } }
    : undefined,
});

const panelPair = (panel) => [panel, mirrorPanel(panel)];

const interceptorVisual = {
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
};

// Solar Slicer: a longer, thinner spine with two swept blades whose edges
// burn amber, twin amber thrusters set wide on the blade roots and a low
// turret housing (playerMirror.js reads `blades` and `turret`).
const solarSlicerVisual = {
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
};

// Bastion: a broad delta with a blunt prow and a heavy flat stern, layered
// armour plates on the shoulders edged in amber, twin amber thrusters and
// darker steel plates (playerMirror.js reads `armor` and `albedo`).
const BASTION_ALBEDO = 0.7; // proposta 18/10: share of the Interceptor's tones
const bastionVisual = {
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

// Flight stats per hull (proposta 18/10), multiplied in
// PlayerSystem.resetStats before the Hangar's modifiers.
const HULL_STATS = freezeDeep({
  [DEFAULT_HULL_ID]: {
    acceleration: 1,
    maxSpeed: 1,
    maxHealth: 1,
    dashCooldown: 1,
  },
  [SOLAR_SLICER_HULL_ID]: {
    acceleration: 1.15,
    maxSpeed: 1.15,
    maxHealth: 0.8,
    dashCooldown: 0.85,
  },
  // proposta 18/10: the heavy hull also waits longer between dashes.
  [BASTION_HULL_ID]: {
    acceleration: 0.85,
    maxSpeed: 0.9,
    maxHealth: 1.35,
    dashCooldown: 1.2,
  },
});

const defaultHullOutline = [
  { x: SHIP_SIZE, y: 0 },
  { x: -SHIP_SIZE / 2, y: -SHIP_SIZE / 2 },
  { x: -SHIP_SIZE / 3, y: 0 },
  { x: -SHIP_SIZE / 2, y: SHIP_SIZE / 2 },
];

const defaultHull = createHullDefinition({
  id: DEFAULT_HULL_ID,
  name: 'Interceptor',
  outline: defaultHullOutline,
  shieldPadding: 12,
  thrusterPorts: {
    main: { x: -SHIP_SIZE * 0.95, y: 0 },
    aux: { x: SHIP_SIZE * 0.95, y: 0 },
    left: { x: 0, y: -SHIP_SIZE * 0.95 },
    right: { x: 0, y: SHIP_SIZE * 0.95 },
  },
  stats: HULL_STATS[DEFAULT_HULL_ID],
  visual: interceptorVisual,
});

const solarSlicer = createHullDefinition({
  id: SOLAR_SLICER_HULL_ID,
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
  stats: HULL_STATS[SOLAR_SLICER_HULL_ID],
  visual: solarSlicerVisual,
});
const bastion = createHullDefinition({
  id: BASTION_HULL_ID,
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
  stats: HULL_STATS[BASTION_HULL_ID],
  visual: bastionVisual,
});
const ALL_HULLS = freezeDeep([defaultHull, solarSlicer, bastion]);
const HULLS_BY_ID = freezeDeep({
  [defaultHull.id]: defaultHull,
  [solarSlicer.id]: solarSlicer,
  [bastion.id]: bastion,
});

const getAllShipModels = () => ALL_HULLS;
const getShipModelById = (hullId) => {
  if (typeof hullId === 'string' && HULLS_BY_ID[hullId]) {
    return HULLS_BY_ID[hullId];
  }

  if (
    typeof hullId === 'string' &&
    hullId.trim().length > 0 &&
    !warnedMissingHullIds.has(hullId)
  ) {
    warnedMissingHullIds.add(hullId);
    console.warn(
      `[shipModels] Unknown hull id "${hullId}" - falling back to "${DEFAULT_HULL_ID}".`
    );
  }

  return defaultHull;
};

const shipModels = Object.freeze({
  defaultHull,
  solarSlicer,
  bastion,
  all: ALL_HULLS,
  byId: HULLS_BY_ID,
});

export {
  ALL_HULLS,
  BASTION_HULL_ID,
  DEFAULT_HULL_ID,
  SOLAR_SLICER_HULL_ID,
  bastion,
  defaultHull,
  getAllShipModels,
  getShipModelById,
  solarSlicer,
};
export default shipModels;
