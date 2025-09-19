import * as CONSTANTS from '../core/GameConstants.js';

const defaultHullOutline = [
  { x: CONSTANTS.SHIP_SIZE, y: 0 },
  { x: -CONSTANTS.SHIP_SIZE / 2, y: -CONSTANTS.SHIP_SIZE / 2 },
  { x: -CONSTANTS.SHIP_SIZE / 3, y: 0 },
  { x: -CONSTANTS.SHIP_SIZE / 2, y: CONSTANTS.SHIP_SIZE / 2 },
];

const defaultHullAccents = [
  [
    { x: -CONSTANTS.SHIP_SIZE / 3, y: -CONSTANTS.SHIP_SIZE / 3 },
    { x: -CONSTANTS.SHIP_SIZE, y: -CONSTANTS.SHIP_SIZE },
    { x: -CONSTANTS.SHIP_SIZE / 2, y: -CONSTANTS.SHIP_SIZE / 2 },
  ],
  [
    { x: -CONSTANTS.SHIP_SIZE / 3, y: CONSTANTS.SHIP_SIZE / 3 },
    { x: -CONSTANTS.SHIP_SIZE, y: CONSTANTS.SHIP_SIZE },
    { x: -CONSTANTS.SHIP_SIZE / 2, y: CONSTANTS.SHIP_SIZE / 2 },
  ],
];

const defaultHull = Object.freeze({
  id: 'default-hull',
  name: 'Default Interceptor Hull',
  outline: Object.freeze(
    defaultHullOutline.map((point) => Object.freeze({ ...point }))
  ),
  accents: Object.freeze(
    defaultHullAccents.map((polygon) =>
      Object.freeze(polygon.map((point) => Object.freeze({ ...point })))
    )
  ),
  cockpit: Object.freeze({
    position: Object.freeze({ x: CONSTANTS.SHIP_SIZE / 3, y: 0 }),
    radius: 3,
  }),
  shieldPadding: 12,
});

const shipModels = Object.freeze({
  defaultHull,
});

export { defaultHull };
export default shipModels;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ...shipModels,
    defaultHull,
  };
}
