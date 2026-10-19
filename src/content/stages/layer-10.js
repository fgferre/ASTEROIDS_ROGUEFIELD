// Layer 10: Warden, Motes trickling in.
import { rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-10',
  order: 10,
  rocks: rockCurve(10),
  roster: [{ role: 'skirmisher', count: 4, from: 10, every: 8, elite: 0.1 }],
  surges: [],
  events: [],
  warden: true,
};
