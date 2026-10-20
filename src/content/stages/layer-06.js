// Layers 6–7: Motes, Husks and the first Caster; Tethers, a battery and the
// first Leech from 7. A Surveyor from 6 and an Aegis from 7; a Mite ring,
// then a Tether wall.
import { formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-06',
  order: 6,
  rocks: rockCurve(6),
  roster: [
    { role: 'skirmisher', count: 4, from: 5, every: 6, elite: 0.05 },
    { role: 'carrier', count: 2, from: 15, every: 12, elite: 0.05 },
    { role: 'artillery', count: 1, from: 20, every: 1, elite: 0.05 },
    { role: 'marksman', count: 1, from: 18, every: 1, elite: 0.05 },
  ],
  surges: [{ at: 35, roles: ['skirmisher'], count: 6, label: 'Mote swarm' }],
  formations: [
    formation('ring', { role: 'swarmer', count: 7, at: 26, elite: 0.05 }),
  ],
  events: [],
  warden: false,
};
