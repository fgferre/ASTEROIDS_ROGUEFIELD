// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// with its own stages and its own end boss.
import {
  ROCKFALL,
  fieldEvent,
  formation,
  rockCurve,
} from '../../data/layerParts.js';

export default {
  id: 'furnace-drift',
  order: 4,
  chapter: 2,
  code: 'A',
  name: 'FURNACE DRIFT',
  biome: 'dense-core',
  layers: [6, 10],
  headStart: 9, // proposta 12/11
  boss: 'kiln-engine',
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(6),
      roster: [{ role: 'skirmisher', count: 2, from: 10, every: 10, elite: 0 }],
      surges: [ROCKFALL],
      formations: [],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(7),
      roster: [{ role: 'artillery', count: 1, from: 12, every: 18, elite: 0 }],
      surges: [],
      formations: [formation('swarm', { role: 'swarmer', count: 6, at: 20 })],
      events: [fieldEvent('solar-flare', 30)],
      warden: false,
    },
    {
      rocks: rockCurve(8),
      roster: [{ role: 'skirmisher', count: 2, from: 8, every: 10, elite: 0 }],
      surges: [],
      formations: [],
      events: [],
      warden: false,
      herald: 'heat',
    },
    {
      rocks: rockCurve(9),
      roster: [
        { role: 'artillery', count: 2, from: 10, every: 14, elite: 0.15 },
      ],
      surges: [
        { at: 40, roles: ['skirmisher'], count: 5, label: 'Mote swarm' },
      ],
      formations: [formation('ring', { role: 'swarmer', count: 8, at: 25 })],
      events: [fieldEvent('solar-flare', 35)],
      warden: false,
    },
    {
      rocks: rockCurve(10),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
