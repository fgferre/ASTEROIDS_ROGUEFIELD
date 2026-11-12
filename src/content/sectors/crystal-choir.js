// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// with its own stages and its own end boss.
import {
  ROCKFALL,
  fieldEvent,
  formation,
  rockCurve,
} from '../../data/layerParts.js';

export default {
  id: 'crystal-choir',
  order: 5,
  chapter: 2,
  code: 'B',
  name: 'CRYSTAL CHOIR',
  biome: 'dense-core',
  layers: [6, 10],
  headStart: 9, // proposta 12/11
  // proposta 12/11: pale cyan-white, bright crystal veins, clean cool air.
  look: {
    backdrop: 'crystal-choir',
    sky: ['#070b0e', '#020304'],
    hazeColor: '#5cb4d0',
    hazeDensity: 0.7,
    veinColor: '#d8faff',
    veinDensity: 0.95,
    dustColor: '#e4f8ff',
    keyColor: '#eaf8ff',
    keyIntensity: 1.55,
    fillColor: '#5a8aa8',
    fillIntensity: 0.35,
    bloomScale: 1.1,
    debris: 0.4,
    tint: 'rgba(160, 230, 255, 0.05)',
  },
  boss: 'prism-crown',
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(6),
      roster: [{ role: 'sniper', count: 1, from: 12, every: 16, elite: 0 }],
      surges: [ROCKFALL],
      formations: [],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(7),
      roster: [{ role: 'marksman', count: 1, from: 10, every: 18, elite: 0 }],
      surges: [],
      formations: [formation('wall', { role: 'skirmisher', count: 6, at: 20 })],
      events: [fieldEvent('sensor-jam', 30)],
      warden: false,
    },
    {
      rocks: rockCurve(8),
      roster: [{ role: 'sniper', count: 2, from: 8, every: 14, elite: 0.1 }],
      surges: [],
      formations: [
        formation('sweep', {
          role: 'minelayer',
          count: 3,
          at: 15,
          spacing: 200,
          speed: 110,
        }),
      ],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(9),
      roster: [
        { role: 'marksman', count: 2, from: 10, every: 14, elite: 0.15 },
        { role: 'support', count: 1, from: 20, every: 30, elite: 0 },
      ],
      surges: [],
      formations: [formation('ring', { role: 'swarmer', count: 8, at: 25 })],
      events: [fieldEvent('gravity-well', 35)],
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
