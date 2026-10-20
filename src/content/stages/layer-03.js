// Layers 1–3: rock; from 2, packs of Mites in formation.
import { ROCKFALL, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-03',
  order: 3,
  rocks: rockCurve(3),
  roster: [],
  surges: [ROCKFALL],
  formations: [
    formation('ring', { role: 'swarmer', count: 6, at: 28, radius: 260 }),
  ],
  events: [],
  warden: false,
  herald: 'dust',
};
