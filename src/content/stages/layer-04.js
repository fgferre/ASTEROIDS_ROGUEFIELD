// Layer 4: the first Motes, in small swarms; two Sowers sweep in
// seeding lanes, then a Mite swarm.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-04',
  order: 4,
  rocks: rockCurve(4),
  roster: [{ role: 'skirmisher', count: 2, from: 8, every: 8, elite: 0 }],
  surges: [
    { at: 20, roles: ['skirmisher'], count: 4, label: 'Mote swarm' },
    { at: 40, roles: ['skirmisher'], count: 5, label: 'Mote swarm' },
  ],
  formations: [
    formation('sweep', {
      role: 'minelayer',
      count: 2,
      at: 12,
      spacing: 200,
      speed: 110,
    }),
    formation('swarm', { role: 'swarmer', count: 6, at: 28 }),
  ],
  events: [fieldEvent('gravity-well', 30)],
  warden: false,
};
