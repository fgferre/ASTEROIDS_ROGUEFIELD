// Layers 8–9: Rams and Shades join; Mote sweeps, Mite rings and swarms, a
// Tether wall.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-09',
  order: 9,
  rocks: rockCurve(9),
  roster: [
    { role: 'skirmisher', count: 5, from: 5, every: 5, elite: 0.08 },
    { role: 'carrier', count: 3, from: 10, every: 10, elite: 0.08 },
    { role: 'charger', count: 3, from: 12, every: 9, elite: 0.08 },
    { role: 'hazard', count: 3, from: 15, every: 10, elite: 0.08 },
    { role: 'artillery', count: 2, from: 15, every: 12, elite: 0.08 },
    { role: 'flanker', count: 2, from: 15, every: 12, elite: 0.08 },
    { role: 'scavenger', count: 1, from: 20, every: 1, elite: 0.08 },
    { role: 'support', count: 1, from: 22, every: 1, elite: 0.08 },
    { role: 'minelayer', count: 1, from: 28, every: 1, elite: 0.08 },
  ],
  surges: [
    { at: 30, roles: ['charger'], count: 4, label: 'Ram pack' },
    { at: 40, roles: ['scavenger', 'asteroid'], count: 4, label: 'Scavengers' },
  ],
  formations: [
    formation('ring', { role: 'swarmer', count: 8, at: 16, elite: 0.08 }),
    formation('wall', { role: 'hazard', count: 9, at: 36, elite: 0.08 }),
  ],
  events: [fieldEvent('sensor-jam', 20), fieldEvent('gravity-well', 45)],
  warden: false,
};
