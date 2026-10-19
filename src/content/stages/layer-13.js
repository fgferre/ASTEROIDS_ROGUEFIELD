// Layers 13–14: everything, Weavers included.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-13',
  order: 13,
  rocks: rockCurve(13),
  roster: [
    { kind: 'drone', count: 5, from: 5, every: 5, elite: 0.2 },
    { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.2 },
    { kind: 'ram', count: 3, from: 12, every: 9, elite: 0.2 },
    { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.2 },
    { kind: 'hunter', count: 3, from: 8, every: 10, elite: 0.2 },
    { kind: 'bulwark', count: 2, from: 15, every: 15, elite: 0.2 },
    { kind: 'weaver', count: 2, from: 15, every: 12, elite: 0.2 },
    { kind: 'caster', count: 2, from: 15, every: 12, elite: 0.2 },
    { kind: 'shade', count: 3, from: 15, every: 10, elite: 0.2 },
    { kind: 'leech', count: 2, from: 15, every: 15, elite: 0.2 },
  ],
  surges: [
    {
      at: 30,
      kinds: ['drone', 'ram', 'hunter', 'husk', 'caster', 'shade'],
      count: 8,
      label: 'Full field',
    },
  ],
  events: [fieldEvent('gravity-well', 25)],
  warden: false,
  herald: 'silence',
};
