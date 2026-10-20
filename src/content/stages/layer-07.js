// Layers 6–7: Motes, Husks and the first Caster; Tethers, a battery and the
// first Leech from 7. A Surveyor from 6 and an Aegis from 7; a Mite ring,
// then a Tether wall.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-07',
  order: 7,
  rocks: rockCurve(7),
  roster: [
    { role: 'skirmisher', count: 4, from: 5, every: 6, elite: 0.05 },
    { role: 'carrier', count: 3, from: 10, every: 10, elite: 0.05 },
    { role: 'hazard', count: 2, from: 15, every: 12, elite: 0.05 },
    { role: 'artillery', count: 1, from: 18, every: 1, elite: 0.05 },
    { role: 'scavenger', count: 1, from: 25, every: 1, elite: 0.05 },
    { role: 'support', count: 1, from: 20, every: 1, elite: 0.05 },
  ],
  surges: [
    { at: 35, roles: ['skirmisher'], count: 6, label: 'Mote swarm' },
    { at: 50, roles: ['artillery'], count: 2, label: 'Battery' },
  ],
  formations: [
    formation('wall', { role: 'hazard', count: 8, at: 30, elite: 0.05 }),
  ],
  events: [fieldEvent('solar-flare', 35)],
  warden: false,
};
