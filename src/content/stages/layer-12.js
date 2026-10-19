// Layers 11–12: Seekers and Bulwarks.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-12',
  order: 12,
  rocks: rockCurve(12),
  roster: [
    { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.15 },
    { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.15 },
    { kind: 'ram', count: 2, from: 12, every: 10, elite: 0.15 },
    { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.15 },
    { kind: 'hunter', count: 3, from: 8, every: 10, elite: 0.15 },
    { kind: 'bulwark', count: 2, from: 15, every: 15, elite: 0.15 },
    { kind: 'caster', count: 2, from: 15, every: 12, elite: 0.15 },
    { kind: 'shade', count: 2, from: 15, every: 12, elite: 0.15 },
    { kind: 'leech', count: 1, from: 20, every: 1, elite: 0.15 },
  ],
  surges: [
    { at: 30, kinds: ['ram'], count: 5, label: 'Ram pack' },
    { at: 50, kinds: ['caster', 'shade'], count: 4, label: 'Crossfire' },
  ],
  events: [fieldEvent('solar-flare', 30)],
  warden: false,
};
