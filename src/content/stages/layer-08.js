// Layers 8–9: Rams and Shades join; Mote sweeps, Mite rings and swarms, a
// Tether wall.
import { formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-08',
  order: 8,
  rocks: rockCurve(8),
  roster: [
    { role: 'skirmisher', count: 5, from: 5, every: 5, elite: 0.08 },
    { role: 'carrier', count: 3, from: 10, every: 10, elite: 0.08 },
    { role: 'charger', count: 2, from: 12, every: 10, elite: 0.08 },
    { role: 'hazard', count: 2, from: 15, every: 12, elite: 0.08 },
    { role: 'artillery', count: 2, from: 15, every: 14, elite: 0.08 },
    { role: 'flanker', count: 1, from: 20, every: 1, elite: 0.08 },
    { role: 'scavenger', count: 1, from: 25, every: 1, elite: 0.08 },
    { role: 'marksman', count: 1, from: 16, every: 1, elite: 0.08 },
  ],
  surges: [{ at: 30, roles: ['charger'], count: 3, label: 'Ram pack' }],
  formations: [
    formation('sweep', { role: 'skirmisher', count: 6, at: 20, elite: 0.08 }),
    formation('swarm', { role: 'swarmer', count: 8, at: 42, elite: 0.08 }),
  ],
  events: [],
  warden: false,
  herald: 'heat',
};
