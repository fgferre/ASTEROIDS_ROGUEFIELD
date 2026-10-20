// Layer 15: the final Warden with a Seeker escort.
import { rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-15',
  order: 15,
  rocks: rockCurve(15),
  roster: [{ role: 'sniper', count: 2, from: 3, every: 2, elite: 0.3 }],
  surges: [],
  formations: [],
  events: [],
  warden: true,
};
