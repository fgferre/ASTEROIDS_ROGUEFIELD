// Layers 13–14: everything, Weavers included.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-14',
  order: 14,
  rocks: rockCurve(14),
  roster: [
    { kind: 'drone', count: 6, from: 5, every: 5, elite: 0.3 },
    { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.3 },
    { kind: 'ram', count: 3, from: 12, every: 9, elite: 0.3 },
    { kind: 'mine', count: 3, from: 15, every: 10, elite: 0.3 },
    { kind: 'hunter', count: 4, from: 8, every: 8, elite: 0.3 },
    { kind: 'bulwark', count: 2, from: 15, every: 15, elite: 0.3 },
    { kind: 'weaver', count: 3, from: 15, every: 10, elite: 0.3 },
    { kind: 'caster', count: 3, from: 15, every: 10, elite: 0.3 },
    { kind: 'shade', count: 3, from: 15, every: 10, elite: 0.3 },
    { kind: 'leech', count: 2, from: 15, every: 15, elite: 0.3 },
  ],
  surges: [
    {
      at: 30,
      kinds: ['drone', 'ram', 'hunter', 'husk', 'caster', 'shade'],
      count: 10,
      label: 'Full field',
    },
  ],
  events: [fieldEvent('solar-flare', 20), fieldEvent('sensor-jam', 40)],
  warden: false,
};
