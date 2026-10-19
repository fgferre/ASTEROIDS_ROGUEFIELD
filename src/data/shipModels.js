import { listContent } from '../content/registry.js';

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

// `order` is the registry's bookkeeping, not part of a hull's shape.
const createHullDefinition = ({ order: _order, ...definition }) =>
  freezeDeep({
    ...definition,
    outline: Array.isArray(definition?.outline)
      ? definition.outline.map((point) => clonePoint(point))
      : [],
    thrusterPorts: clonePointMap(definition?.thrusterPorts),
  });

// One file per hull in src/content/hulls/, listed by `order`: outline, ports,
// flight stats and procedural art (docs/NORTE.md §3) all live in the hull's file.
const ALL_HULLS = freezeDeep(
  listContent('hulls').map((hull) => createHullDefinition(hull))
);
const HULLS_BY_ID = freezeDeep(
  Object.fromEntries(ALL_HULLS.map((hull) => [hull.id, hull]))
);
const defaultHull = HULLS_BY_ID[DEFAULT_HULL_ID];
const solarSlicer = HULLS_BY_ID[SOLAR_SLICER_HULL_ID];
const bastion = HULLS_BY_ID[BASTION_HULL_ID];

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
