// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// with its own stages and its own end boss.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'quarantine-grid',
  order: 8,
  chapter: 3,
  code: 'B',
  name: 'QUARANTINE GRID',
  biome: 'wardens-reach',
  layers: [11, 15],
  headStart: 8, // proposta 12/11
  boss: 'interdictor',
  // proposta 12/11: every number below
  stages: [
    {
      rocks: rockCurve(11),
      roster: [
        { role: 'marksman', count: 1, from: 10, every: 16, elite: 0 },
        { role: 'flanker', count: 1, from: 14, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [],
      events: [],
      warden: false,
    },
    {
      rocks: rockCurve(12),
      roster: [{ role: 'flanker', count: 2, from: 8, every: 14, elite: 0.1 }],
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
      events: [fieldEvent('sensor-jam', 30)],
      warden: false,
    },
    {
      rocks: rockCurve(13),
      roster: [{ role: 'marksman', count: 1, from: 12, every: 18, elite: 0 }],
      surges: [],
      formations: [],
      events: [],
      warden: false,
      herald: 'silence',
    },
    {
      rocks: rockCurve(14),
      roster: [
        { role: 'support', count: 1, from: 12, every: 30, elite: 0 },
        { role: 'marksman', count: 2, from: 10, every: 14, elite: 0.2 },
        { role: 'flanker', count: 2, from: 15, every: 16, elite: 0 },
      ],
      surges: [],
      formations: [formation('ring', { role: 'swarmer', count: 10, at: 25 })],
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
