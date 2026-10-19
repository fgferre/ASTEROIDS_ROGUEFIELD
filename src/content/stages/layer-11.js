// Layers 11–12: Seekers and Bulwarks.
import { rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-11',
  order: 11,
  rocks: rockCurve(11),
  roster: [
    { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.1 },
    { kind: 'husk', count: 2, from: 10, every: 12, elite: 0.1 },
    { kind: 'ram', count: 2, from: 12, every: 10, elite: 0.1 },
    { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.1 },
    { kind: 'hunter', count: 2, from: 10, every: 12, elite: 0.1 },
    { kind: 'bulwark', count: 1, from: 20, every: 1, elite: 0.1 },
    { kind: 'caster', count: 2, from: 15, every: 12, elite: 0.1 },
    { kind: 'shade', count: 2, from: 15, every: 12, elite: 0.1 },
    { kind: 'leech', count: 1, from: 20, every: 1, elite: 0.1 },
  ],
  surges: [
    { at: 30, kinds: ['drone'], count: 8, label: 'Mote swarm' },
    { at: 50, kinds: ['shade'], count: 3, label: 'Shade raid' },
  ],
  events: [],
  warden: false,
};
