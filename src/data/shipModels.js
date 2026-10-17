import { SHIP_SIZE } from '../core/GameConstants.js';

const DEFAULT_HULL_ID = 'default-hull';
const SOLAR_SLICER_HULL_ID = 'solar-slicer';
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
// `minLevel` hides a panel until that upgrade level.
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

const solarSlicerVisual = {
  accent: 'shot',
  panels: [
    ...panelPair({
      points: [
        pt(-0.55, -0.19),
        pt(-0.86, -0.38),
        pt(-0.98, -0.33),
        pt(-0.82, -0.15),
      ],
      facing: { x: -0.6, y: -0.8 },
      minLevel: { key: 'braking', value: 1 },
      grow: { key: 'braking', indices: [1, 2], step: pt(-0.04, -0.06) },
    }),
    // crescent blades
    ...panelPair({
      points: [
        pt(0.42, -0.15),
        pt(0.05, -0.5),
        pt(-0.9, -0.98),
        pt(-0.64, -0.6),
        pt(-0.62, -0.21),
      ],
      facing: { x: -0.2, y: -1 },
      grow: { key: 'rcs', indices: [1, 2, 3], step: pt(-0.03, -0.05) },
      rcsPort: 2,
    }),
    ...panelPair({
      points: [
        pt(0.45, 0),
        pt(0.45, -0.15),
        pt(-0.2, -0.22),
        pt(-0.95, -0.18),
        pt(-1.05, -0.1),
        pt(-1.05, 0),
      ],
      facing: { x: -0.05, y: -1 },
    }),
    ...panelPair({
      points: [pt(1.2, 0), pt(0.45, 0), pt(0.45, -0.15)],
      facing: { x: 0.45, y: -0.9 },
    }),
  ],
  nozzles: [
    { ...pt(-1.05, 0), r: 0.1 * S },
    { ...pt(-0.98, -0.15), r: 0.055 * S, minLevel: 3 },
    { ...pt(-0.98, 0.15), r: 0.055 * S, minLevel: 3 },
  ],
  nozzleLength: 0.16 * S,
  nozzleLengthPerLevel: 0.025 * S,
  retroPorts: [pt(0.45, -0.15), pt(0.45, 0.15)],
  cockpit: { from: pt(0.5, 0), to: pt(0.85, 0), width: 0.07 * S },
};

const defaultHullOutline = [
  { x: SHIP_SIZE, y: 0 },
  { x: -SHIP_SIZE / 2, y: -SHIP_SIZE / 2 },
  { x: -SHIP_SIZE / 3, y: 0 },
  { x: -SHIP_SIZE / 2, y: SHIP_SIZE / 2 },
];

const defaultHull = createHullDefinition({
  id: DEFAULT_HULL_ID,
  name: 'Default Interceptor Hull',
  outline: defaultHullOutline,
  shieldPadding: 12,
  thrusterPorts: {
    main: { x: -SHIP_SIZE * 0.95, y: 0 },
    aux: { x: SHIP_SIZE * 0.95, y: 0 },
    left: { x: 0, y: -SHIP_SIZE * 0.95 },
    right: { x: 0, y: SHIP_SIZE * 0.95 },
  },
  visual: interceptorVisual,
});

const solarSlicer = createHullDefinition({
  id: SOLAR_SLICER_HULL_ID,
  name: 'Solar Slicer',
  // Collision and shield use a simplified silhouette; the panels carry the detail.
  outline: [
    { x: SHIP_SIZE * 1.2, y: 0 },
    { x: SHIP_SIZE * 0.45, y: -SHIP_SIZE * 0.72 },
    { x: -SHIP_SIZE * 0.9, y: -SHIP_SIZE * 0.98 },
    { x: -SHIP_SIZE * 1.15, y: 0 },
    { x: -SHIP_SIZE * 0.9, y: SHIP_SIZE * 0.98 },
    { x: SHIP_SIZE * 0.45, y: SHIP_SIZE * 0.72 },
  ],
  shieldPadding: 14,
  thrusterPorts: {
    main: { x: -SHIP_SIZE * 1.14, y: 0 },
    aux: { x: SHIP_SIZE * 1.02, y: 0 },
    left: { x: 0, y: -SHIP_SIZE * 0.82 },
    right: { x: 0, y: SHIP_SIZE * 0.82 },
  },
  visual: solarSlicerVisual,
});
const ALL_HULLS = freezeDeep([defaultHull, solarSlicer]);
const HULLS_BY_ID = freezeDeep({
  [defaultHull.id]: defaultHull,
  [solarSlicer.id]: solarSlicer,
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
  all: ALL_HULLS,
  byId: HULLS_BY_ID,
});

export {
  ALL_HULLS,
  DEFAULT_HULL_ID,
  SOLAR_SLICER_HULL_ID,
  defaultHull,
  getAllShipModels,
  getShipModelById,
  solarSlicer,
};
export default shipModels;
