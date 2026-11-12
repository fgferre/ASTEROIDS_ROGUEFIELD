// A sector: a whole chapter played on its own, won at its Warden
// (src/data/sectors.js), with its own stages: Tethers, the Herald of Heat,
// then a Caster, one danger added per stage. Its Caster stage and its Warden
// fly one layer's rocks fewer, so the machines are the threat.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'dense-core',
  order: 6,
  chapter: 2,
  code: 'C',
  name: 'RESONANCE CHAMBER',
  biome: 'dense-core',
  look: { backdrop: 'dense-core' },
  layers: [6, 10],
  headStart: 9, // proposta 12/11
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(6),
      roster: [
        { role: 'skirmisher', count: 3, from: 6, every: 8, elite: 0 },
        { role: 'hazard', count: 2, from: 12, every: 14, elite: 0 },
        { role: 'carrier', count: 1, from: 20, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(7),
      roster: [],
      surges: [],
      formations: [formation('wall', { role: 'hazard', count: 6, at: 22 })],
      events: [fieldEvent('solar-flare', 35)],
      warden: false,
    },
    {
      rocks: rockCurve(8),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: false,
      herald: 'heat',
    },
    {
      rocks: rockCurve(8),
      roster: [
        { role: 'hazard', count: 2, from: 12, every: 12, elite: 0 },
        { role: 'artillery', count: 1, from: 25, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [formation('ring', { role: 'swarmer', count: 6, at: 35 })],
      events: [fieldEvent('solar-flare', 45)],
      warden: false,
    },
    {
      rocks: rockCurve(9),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
