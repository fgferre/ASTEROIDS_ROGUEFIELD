// Layers 8–9: Rams and Shades join.
import { rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-08',
  order: 8,
  rocks: rockCurve(8),
  roster: [
    { kind: 'drone', count: 5, from: 5, every: 5, elite: 0.08 },
    { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.08 },
    { kind: 'ram', count: 2, from: 12, every: 10, elite: 0.08 },
    { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.08 },
    { kind: 'caster', count: 2, from: 15, every: 14, elite: 0.08 },
    { kind: 'shade', count: 1, from: 20, every: 1, elite: 0.08 },
    { kind: 'leech', count: 1, from: 25, every: 1, elite: 0.08 },
  ],
  surges: [{ at: 30, kinds: ['ram'], count: 3, label: 'Ram pack' }],
  events: [],
  warden: false,
  herald: 'heat',
};
