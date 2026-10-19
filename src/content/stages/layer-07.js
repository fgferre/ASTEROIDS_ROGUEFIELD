// Layers 6–7: Motes, Husks and the first Caster; Tethers, a battery and the
// first Leech from 7.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-07',
  order: 7,
  rocks: rockCurve(7),
  roster: [
    { kind: 'drone', count: 4, from: 5, every: 6, elite: 0.05 },
    { kind: 'husk', count: 3, from: 10, every: 10, elite: 0.05 },
    { kind: 'mine', count: 2, from: 15, every: 12, elite: 0.05 },
    { kind: 'caster', count: 1, from: 18, every: 1, elite: 0.05 },
    { kind: 'leech', count: 1, from: 25, every: 1, elite: 0.05 },
  ],
  surges: [
    { at: 35, kinds: ['drone'], count: 6, label: 'Mote swarm' },
    { at: 50, kinds: ['caster'], count: 2, label: 'Battery' },
  ],
  events: [fieldEvent('solar-flare', 35)],
  warden: false,
};
