// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// won at its Warden (no `boss`: Warden Choir ends it), with its own stages:
// Tethers, a stage of rocks alone, then a Caster, one danger added per stage.
// Its Caster stage flies one layer's rocks fewer and its Warden few rocks, so
// the machines are the threat.
import { fieldEvent, formation, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'dense-core',
  order: 6,
  chapter: 2,
  code: 'C',
  name: 'RESONANCE CHAMBER',
  biome: 'dense-core',
  layers: [6, 10],
  headStart: 9, // proposta 12/11
  look: { backdrop: 'dense-core' },
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
      // proposta 12/11: 28 rocks (were the curve's 38): measured on the
      // good bot, 12 seeds: 38 won 6, 20 and 28 won 8 (28: average 2 of 6)
      rocks: 28,
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
