// Layer 4: the first Motes, in small swarms.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-04',
  order: 4,
  rocks: rockCurve(4),
  roster: [{ kind: 'drone', count: 2, from: 8, every: 8, elite: 0 }],
  surges: [
    { at: 20, kinds: ['drone'], count: 4, label: 'Mote swarm' },
    { at: 40, kinds: ['drone'], count: 5, label: 'Mote swarm' },
  ],
  events: [fieldEvent('gravity-well', 30)],
  warden: false,
};
