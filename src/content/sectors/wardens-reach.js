// A sector: a whole chapter played on its own, won at its Warden
// (src/data/sectors.js), with its own stages: Shades, tanks and Seekers,
// one danger added per stage.
import { fieldEvent, formation } from '../../data/layerParts.js';

export default {
  id: 'wardens-reach',
  order: 9,
  chapter: 3,
  code: 'C',
  name: 'NULL BOUNDARY',
  biome: 'wardens-reach',
  look: { backdrop: 'wardens-reach' },
  layers: [11, 15],
  headStart: 16, // proposta 12/11
  // proposta 12/11: every number below. Few rocks (the layer curve gave 40
  // a stage, and most of a stage was the mop-up).
  stages: [
    {
      rocks: 18,
      roster: [
        { role: 'sniper', count: 1, from: 10, every: 16, elite: 0 },
        { role: 'flanker', count: 1, from: 14, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [],
      events: [],
      warden: false,
    },
    {
      rocks: 20,
      roster: [{ role: 'sniper', count: 1, from: 8, every: 16, elite: 0 }],
      surges: [],
      formations: [
        formation('wall', { role: 'tank', count: 3, at: 22, gap: 240 }),
      ],
      events: [],
      warden: false,
    },
    {
      rocks: 22,
      roster: [{ role: 'sniper', count: 1, from: 12, every: 18, elite: 0 }],
      surges: [],
      formations: [],
      events: [],
      warden: false,
      herald: 'silence',
    },
    {
      rocks: 24,
      roster: [
        { role: 'sniper', count: 2, from: 8, every: 14, elite: 0.2 },
        { role: 'tank', count: 2, from: 12, every: 20, elite: 0.1 },
      ],
      surges: [{ at: 40, roles: ['flanker'], count: 3, label: 'Shade raid' }],
      formations: [],
      events: [fieldEvent('sensor-jam', 30)],
      warden: false,
    },
    {
      rocks: 10,
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
