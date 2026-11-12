// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// with its own stages and its own end boss.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'assembly-graveyard',
  order: 7,
  chapter: 3,
  code: 'A',
  name: 'ASSEMBLY GRAVEYARD',
  biome: 'wardens-reach',
  layers: [11, 15],
  headStart: 16, // proposta 12/11
  // proposta 12/11: grey-green industrial murk among dead hulls, dim.
  look: {
    sky: ['#080a08', '#020302'],
    hazeColor: '#5e6e50',
    hazeDensity: 1.15,
    veinColor: '#3e4a38',
    veinDensity: 0.25,
    dustColor: '#a8b098',
    keyColor: '#d8dccb',
    keyIntensity: 1.15,
    fillColor: '#55604a',
    fillIntensity: 0.35,
    bloomScale: 1,
    debris: 1,
    tint: 'rgba(110, 130, 100, 0.06)',
  },
  boss: 'foundry-mother',
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(11),
      roster: [
        { role: 'skirmisher', count: 2, from: 8, every: 10, elite: 0 },
        { role: 'carrier', count: 1, from: 10, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(12),
      roster: [{ role: 'tank', count: 1, from: 12, every: 25, elite: 0 }],
      surges: [],
      formations: [formation('swarm', { role: 'swarmer', count: 8, at: 20 })],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(13),
      roster: [
        { role: 'minelayer', count: 2, from: 10, every: 16, elite: 0 },
        { role: 'support', count: 1, from: 15, every: 30, elite: 0 },
      ],
      surges: [],
      formations: [],
      events: [fieldEvent('sensor-jam', 30)],
      warden: false,
    },
    {
      rocks: rockCurve(14),
      roster: [
        { role: 'tank', count: 2, from: 10, every: 20, elite: 0.2 },
        { role: 'carrier', count: 1, from: 15, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [formation('wall', { role: 'skirmisher', count: 8, at: 25 })],
      events: [fieldEvent('gravity-well', 35)],
      warden: false,
    },
    {
      rocks: rockCurve(15),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
