// Layers 1–3: rock; from 2, packs of Mites in formation.
import { ROCKFALL, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-01',
  order: 1,
  rocks: rockCurve(1),
  roster: [],
  surges: [ROCKFALL],
  formations: [],
  events: [],
  warden: false,
};
