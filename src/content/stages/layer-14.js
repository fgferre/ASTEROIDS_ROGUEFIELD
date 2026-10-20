// Layers 13–14: everything, Weavers included; every formation by 14.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-14',
  order: 14,
  rocks: rockCurve(14),
  roster: [
    { role: 'skirmisher', count: 6, from: 5, every: 5, elite: 0.3 },
    { role: 'carrier', count: 3, from: 10, every: 10, elite: 0.3 },
    { role: 'charger', count: 3, from: 12, every: 9, elite: 0.3 },
    { role: 'hazard', count: 3, from: 15, every: 10, elite: 0.3 },
    { role: 'sniper', count: 4, from: 8, every: 8, elite: 0.3 },
    { role: 'tank', count: 2, from: 15, every: 15, elite: 0.3 },
    { role: 'minelayer', count: 3, from: 15, every: 10, elite: 0.3 },
    { role: 'artillery', count: 3, from: 15, every: 10, elite: 0.3 },
    { role: 'flanker', count: 3, from: 15, every: 10, elite: 0.3 },
    { role: 'scavenger', count: 2, from: 15, every: 15, elite: 0.3 },
    { role: 'marksman', count: 3, from: 8, every: 10, elite: 0.3 },
    { role: 'support', count: 2, from: 16, every: 14, elite: 0.3 },
  ],
  surges: [
    {
      at: 30,
      roles: [
        'skirmisher',
        'charger',
        'sniper',
        'carrier',
        'artillery',
        'flanker',
      ],
      count: 10,
      label: 'Full field',
    },
  ],
  formations: [
    formation('ring', { role: 'swarmer', count: 12, at: 12, elite: 0.3 }),
    formation('sweep', { role: 'skirmisher', count: 8, at: 26, elite: 0.3 }),
    formation('wall', { role: 'hazard', count: 11, at: 38, elite: 0.3 }),
    formation('swarm', { role: 'swarmer', count: 10, at: 50, elite: 0.3 }),
  ],
  events: [fieldEvent('solar-flare', 20), fieldEvent('sensor-jam', 40)],
  warden: false,
};
