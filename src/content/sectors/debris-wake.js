// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// with its own stages and its own end boss.
import { ROCKFALL, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'debris-wake',
  order: 1,
  chapter: 1,
  code: 'A',
  name: 'DEBRIS WAKE',
  biome: 'outer-ring',
  layers: [1, 5],
  headStart: 0, // proposta 12/11
  // proposta 12/11: cold, sparse, deep blue-black; where things were thrown away.
  look: {
    backdrop: 'debris-wake',
    sky: ['#05080e', '#010203'],
    hazeColor: '#2a4478',
    hazeDensity: 0.55,
    veinDensity: 0.02,
    dustColor: '#9aa6b8',
    keyColor: '#dfe8ff',
    keyIntensity: 1.5,
    fillColor: '#3a4a66',
    debris: 1,
  },
  boss: 'quarry-maw',
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(1),
      roster: [],
      surges: [ROCKFALL],
      formations: [],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(2),
      roster: [],
      surges: [ROCKFALL],
      formations: [formation('swarm', { role: 'swarmer', count: 5, at: 15 })],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(3),
      roster: [],
      surges: [],
      formations: [formation('swarm', { role: 'swarmer', count: 6, at: 35 })],
      events: [],
      warden: false,
      herald: 'dust',
    },
    {
      rocks: rockCurve(4),
      roster: [{ role: 'carrier', count: 1, from: 10, every: 25, elite: 0 }],
      surges: [ROCKFALL],
      formations: [formation('ring', { role: 'swarmer', count: 6, at: 30 })],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(5),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
