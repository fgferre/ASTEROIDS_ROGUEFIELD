// Layer 5: first Warden.
import { rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-05',
  order: 5,
  rocks: rockCurve(5),
  roster: [],
  surges: [],
  events: [],
  warden: true,
};
