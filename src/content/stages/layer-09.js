// Layers 8–9: Rams and Shades join.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-09',
  order: 9,
  rocks: rockCurve(9),
  roster: [
    { kind: 'drone', count: 5, from: 5, every: 5, elite: 0.08 },
    { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.08 },
    { kind: 'ram', count: 3, from: 12, every: 9, elite: 0.08 },
    { kind: 'mine', count: 3, from: 15, every: 10, elite: 0.08 },
    { kind: 'caster', count: 2, from: 15, every: 12, elite: 0.08 },
    { kind: 'shade', count: 2, from: 15, every: 12, elite: 0.08 },
    { kind: 'leech', count: 1, from: 20, every: 1, elite: 0.08 },
  ],
  surges: [
    { at: 30, kinds: ['ram'], count: 4, label: 'Ram pack' },
    { at: 40, kinds: ['leech', 'asteroid'], count: 4, label: 'Scavengers' },
  ],
  events: [fieldEvent('sensor-jam', 20), fieldEvent('gravity-well', 45)],
  warden: false,
};
