// Layers 1–3: rock only.
import { ROCKFALL, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-03',
  order: 3,
  rocks: rockCurve(3),
  roster: [],
  surges: [ROCKFALL],
  events: [],
  warden: false,
  herald: 'dust',
};
