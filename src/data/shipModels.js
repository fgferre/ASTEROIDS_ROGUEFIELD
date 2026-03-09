import { SHIP_SIZE } from '../core/GameConstants.js';
import solarSlicerSvgRaw from '../../assets/inpirational mockups/solar slicer.svg?raw';

const DEFAULT_HULL_ID = 'default-hull';
const SOLAR_SLICER_HULL_ID = 'solar-slicer';
const SOLAR_SLICER_BACKGROUND_FILL = '#1b1b22';

const SVG_VIEW_BOX_PATTERN = /<svg\b[^>]*\bviewBox="([^"]+)"/i;
const PATH_TAG_PATTERN = /<path\b[^>]*>/gi;
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

const clonePolygon = (polygon) =>
  Array.isArray(polygon) ? polygon.map((point) => clonePoint(point)) : [];

const clonePointMap = (points) => {
  const entries = Object.entries(points || {}).map(([key, point]) => [
    key,
    clonePoint(point),
  ]);
  return Object.fromEntries(entries);
};

const extractSvgAttribute = (tag, attributeName) => {
  const pattern = new RegExp(`\\b${attributeName}="([^"]*)"`, 'i');
  return tag.match(pattern)?.[1] || '';
};

const parseSvgViewBox = (svgMarkup) => {
  const viewBoxValue = svgMarkup.match(SVG_VIEW_BOX_PATTERN)?.[1] || '';
  const values = viewBoxValue
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (values.length !== 4) {
    return null;
  }

  return {
    minX: values[0],
    minY: values[1],
    width: values[2],
    height: values[3],
  };
};

const parseScaleTransform = (transformValue) => {
  const scaleMatch = transformValue.match(/scale\(([^)]+)\)/i);
  if (!scaleMatch) {
    return { x: 1, y: 1 };
  }

  const values = scaleMatch[1]
    .trim()
    .split(/[\s,]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return { x: 1, y: 1 };
  }

  if (values.length === 1) {
    return { x: values[0], y: values[0] };
  }

  return { x: values[0], y: values[1] };
};

const isSolarSlicerBackgroundPath = (tag, viewBox) => {
  if (!viewBox) {
    return false;
  }

  const fill = extractSvgAttribute(tag, 'fill').trim().toLowerCase();
  if (fill !== SOLAR_SLICER_BACKGROUND_FILL) {
    return false;
  }

  const d = extractSvgAttribute(tag, 'd');
  const commands = (d.match(/[a-z]/gi) || []).join('').toUpperCase();
  if (commands !== 'MLLLLZ') {
    return false;
  }

  const numbers = (d.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/gi) || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (numbers.length !== 10) {
    return false;
  }

  const [x0, y0, x1, y1, x2, y2, x3, y3, x4, y4] = numbers;
  const scale = parseScaleTransform(extractSvgAttribute(tag, 'transform'));
  const tolerance = 1.5;

  const isRectangleFromOrigin =
    Math.abs(x0) <= tolerance &&
    Math.abs(y0) <= tolerance &&
    Math.abs(y1) <= tolerance &&
    Math.abs(x1 - x2) <= tolerance &&
    Math.abs(y2 - y3) <= tolerance &&
    Math.abs(x3) <= tolerance &&
    Math.abs(x4) <= tolerance &&
    Math.abs(y4) <= tolerance;

  if (!isRectangleFromOrigin) {
    return false;
  }

  const renderedWidth = Math.abs(x1 * scale.x);
  const renderedHeight = Math.abs(y2 * scale.y);

  return (
    Math.abs(renderedWidth - viewBox.width) <= tolerance &&
    Math.abs(renderedHeight - viewBox.height) <= tolerance
  );
};

const stripSolarSlicerBackground = (svgMarkup) => {
  const viewBox = parseSvgViewBox(svgMarkup);
  return svgMarkup.replace(PATH_TAG_PATTERN, (tag) =>
    isSolarSlicerBackgroundPath(tag, viewBox) ? '' : tag
  );
};

const createSvgDataUrl = (svgMarkup) => {
  const sanitizedMarkup =
    typeof svgMarkup === 'string'
      ? svgMarkup
          .replace(/^<\?xml[^>]*>\s*/i, '')
          .trim()
          .replace(/\r\n/g, '\n')
      : '';

  const withoutBackground = sanitizedMarkup
    ? stripSolarSlicerBackground(sanitizedMarkup)
      : '';

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    withoutBackground
  )}`;
};

const createHullDefinition = (definition) =>
  freezeDeep({
    ...definition,
    outline: Array.isArray(definition?.outline)
      ? definition.outline.map((point) => clonePoint(point))
      : [],
    accents: Array.isArray(definition?.accents)
      ? definition.accents.map((polygon) => clonePolygon(polygon))
      : [],
    cockpit:
      definition?.cockpit && typeof definition.cockpit === 'object'
        ? {
            ...definition.cockpit,
            position: clonePoint(definition.cockpit.position),
          }
        : null,
    thrusterPorts: clonePointMap(definition?.thrusterPorts),
    visual:
      definition?.visual && typeof definition.visual === 'object'
        ? {
            ...definition.visual,
            offset: clonePoint(definition.visual.offset),
          }
        : null,
  });

const defaultHullOutline = [
  { x: SHIP_SIZE, y: 0 },
  { x: -SHIP_SIZE / 2, y: -SHIP_SIZE / 2 },
  { x: -SHIP_SIZE / 3, y: 0 },
  { x: -SHIP_SIZE / 2, y: SHIP_SIZE / 2 },
];

const defaultHullAccents = [
  [
    { x: -SHIP_SIZE / 3, y: -SHIP_SIZE / 3 },
    { x: -SHIP_SIZE, y: -SHIP_SIZE },
    { x: -SHIP_SIZE / 2, y: -SHIP_SIZE / 2 },
  ],
  [
    { x: -SHIP_SIZE / 3, y: SHIP_SIZE / 3 },
    { x: -SHIP_SIZE, y: SHIP_SIZE },
    { x: -SHIP_SIZE / 2, y: SHIP_SIZE / 2 },
  ],
];

const defaultHull = createHullDefinition({
  id: DEFAULT_HULL_ID,
  name: 'Default Interceptor Hull',
  outline: defaultHullOutline,
  accents: defaultHullAccents,
  cockpit: {
    position: { x: SHIP_SIZE / 3, y: 0 },
    radius: 3,
  },
  shieldPadding: 12,
  thrusterPorts: {
    main: { x: -SHIP_SIZE * 0.95, y: 0 },
    aux: { x: SHIP_SIZE * 0.95, y: 0 },
    left: { x: 0, y: -SHIP_SIZE * 0.95 },
    right: { x: 0, y: SHIP_SIZE * 0.95 },
  },
});

const solarSlicer = createHullDefinition({
  id: SOLAR_SLICER_HULL_ID,
  name: 'Solar Slicer',
  // Collision and shield use a simplified silhouette; the sprite carries the detail.
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
  visual: {
    type: 'svg-sprite',
    source: createSvgDataUrl(solarSlicerSvgRaw),
    width: SHIP_SIZE * 3.7,
    height: SHIP_SIZE * 2.33,
    rotation: Math.PI / 2,
    offset: { x: 0, y: 0 },
    // Crops the empty margin around the imported SVG so the ship fills its intended footprint.
    sourceBounds: {
      x: 0.109,
      y: 0.0565,
      width: 0.7798,
      height: 0.8387,
    },
    glowColor: 'rgba(0, 212, 255, 0.28)',
    shadowBlur: 18,
  },
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
