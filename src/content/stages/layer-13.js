// Layers 13–14: everything, Weavers included.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

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
  events: [fieldEvent('gravity-well', 25)],
  warden: false,
  herald: 'silence',
};
