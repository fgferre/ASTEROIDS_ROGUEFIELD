// Layer 4: the first Motes, in small swarms.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-04',
  order: 4,
  rocks: rockCurve(4),
  roster: [{ role: 'skirmisher', count: 2, from: 8, every: 8, elite: 0 }],
  surges: [
    { at: 20, roles: ['skirmisher'], count: 4, label: 'Mote swarm' },
    { at: 40, roles: ['skirmisher'], count: 5, label: 'Mote swarm' },
  ],
  events: [fieldEvent('gravity-well', 30)],
  warden: false,
};
