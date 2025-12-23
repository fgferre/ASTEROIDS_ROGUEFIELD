import { SHIP_SIZE } from '../core/GameConstants.js';

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
    position: Object.freeze({ x: SHIP_SIZE / 3, y: 0 }),
    radius: 3,
  }),
  shieldPadding: 12,
});

const shipModels = Object.freeze({
  defaultHull,
});

export { defaultHull };
export default shipModels;
