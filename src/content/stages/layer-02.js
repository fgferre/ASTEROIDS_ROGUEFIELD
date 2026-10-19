// Layers 1–3: rock only.
import { ROCKFALL, fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-02',
  order: 2,
  rocks: rockCurve(2),
  roster: [],
  surges: [ROCKFALL],
  events: [fieldEvent('sensor-jam', 25)],
  warden: false,
};
