// Layers 1–3: rock only.
import { ROCKFALL, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-01',
  order: 1,
  rocks: rockCurve(1),
  roster: [],
  surges: [ROCKFALL],
  events: [],
  warden: false,
};
