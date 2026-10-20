// Layers 13–14: everything, Weavers included; every formation by 14.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-13',
  order: 13,
  rocks: rockCurve(13),
  roster: [
    { role: 'skirmisher', count: 5, from: 5, every: 5, elite: 0.2 },
    { role: 'carrier', count: 3, from: 10, every: 10, elite: 0.2 },
    { role: 'charger', count: 3, from: 12, every: 9, elite: 0.2 },
    { role: 'hazard', count: 2, from: 15, every: 12, elite: 0.2 },
    { role: 'sniper', count: 3, from: 8, every: 10, elite: 0.2 },
    { role: 'tank', count: 2, from: 15, every: 15, elite: 0.2 },
    { role: 'minelayer', count: 2, from: 15, every: 12, elite: 0.2 },
    { role: 'artillery', count: 2, from: 15, every: 12, elite: 0.2 },
    { role: 'flanker', count: 3, from: 15, every: 10, elite: 0.2 },
    { role: 'scavenger', count: 2, from: 15, every: 15, elite: 0.2 },
    { role: 'marksman', count: 2, from: 10, every: 12, elite: 0.2 },
    { role: 'support', count: 2, from: 18, every: 16, elite: 0.2 },
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
      count: 8,
      label: 'Full field',
    },
  ],
  formations: [
    formation('sweep', { role: 'swarmer', count: 9, at: 14, elite: 0.2 }),
    formation('wall', { role: 'hazard', count: 10, at: 40, elite: 0.2 }),
    formation('swarm', { role: 'carrier', count: 5, at: 52, elite: 0.2 }),
  ],
  events: [fieldEvent('gravity-well', 25)],
  warden: false,
  herald: 'silence',
};
