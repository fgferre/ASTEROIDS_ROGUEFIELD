// Layers 1–3: rock; from 2, packs of Mites in formation.
import {
  ROCKFALL,
  fieldEvent,
  formation,
  rockCurve,
} from '../../data/layerParts.js';

export default {
  id: 'layer-02',
  order: 2,
  rocks: rockCurve(2),
  roster: [],
  surges: [ROCKFALL],
  formations: [formation('swarm', { role: 'swarmer', count: 5, at: 22 })],
  events: [fieldEvent('sensor-jam', 25)],
  warden: false,
};
