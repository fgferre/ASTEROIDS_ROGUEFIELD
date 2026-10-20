// Layers 11–12: Seekers and Bulwarks, Twains from 11, Anvils from 12 (a
// wall of tanks).
import { formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-11',
  order: 11,
  rocks: rockCurve(11),
  roster: [
    { role: 'skirmisher', count: 4, from: 5, every: 6, elite: 0.1 },
    { role: 'carrier', count: 2, from: 10, every: 12, elite: 0.1 },
    { role: 'charger', count: 2, from: 12, every: 10, elite: 0.1 },
    { role: 'hazard', count: 2, from: 15, every: 12, elite: 0.1 },
    { role: 'sniper', count: 2, from: 10, every: 12, elite: 0.1 },
    { role: 'tank', count: 1, from: 20, every: 1, elite: 0.1 },
    { role: 'artillery', count: 2, from: 15, every: 12, elite: 0.1 },
    { role: 'flanker', count: 2, from: 15, every: 12, elite: 0.1 },
    { role: 'scavenger', count: 1, from: 20, every: 1, elite: 0.1 },
    { role: 'marksman', count: 2, from: 14, every: 14, elite: 0.1 },
    { role: 'support', count: 1, from: 24, every: 1, elite: 0.1 },
  ],
  surges: [
    { at: 30, roles: ['skirmisher'], count: 8, label: 'Mote swarm' },
    { at: 50, roles: ['flanker'], count: 3, label: 'Shade raid' },
  ],
  formations: [
    formation('sweep', { role: 'swarmer', count: 8, at: 20, elite: 0.1 }),
    formation('ring', { role: 'skirmisher', count: 6, at: 40, elite: 0.1 }),
  ],
  events: [],
  warden: false,
};
