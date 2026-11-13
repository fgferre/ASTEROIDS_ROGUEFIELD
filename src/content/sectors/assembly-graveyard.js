// A sector: a stretch of a chapter played on its own (src/data/sectors.js),
// with its own stages and its own end boss.
import { fieldEvent, formation } from '../../data/layerParts.js';

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
    backdrop: 'assembly-graveyard',
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
  // proposta 12/11: every number below. The yard is machines, not stone:
  // few rocks (the layer curve gave 40 a stage, and most of a stage was the
  // mop-up), and the line's one product, the Drone, comes in a batch every
  // stage, two more each time; the Foundry Mother builds the same.
  stages: [
    {
      rocks: 18,
      roster: [
        { role: 'skirmisher', count: 2, from: 8, every: 10, elite: 0 },
        { role: 'carrier', count: 1, from: 10, every: 20, elite: 0 },
      ],
      surges: [],
      formations: [
        formation('sweep', { role: 'skirmisher', count: 4, at: 22 }),
      ],
      events: [],
      warden: false,
    },
    {
      rocks: 20,
      roster: [{ role: 'tank', count: 1, from: 12, every: 25, elite: 0 }],
      // proposta 13/11: a Drone batch at 45 (was none): the good pilot
      // crossed the four stages losing 0-35 hull most stages and won 12/12;
      // chapter II's stages cost it 60-130. A Drone trickle here and in the
      // next stage as well took the average pilot to 0/6. As it stands
      // (with the Mother's arms at 0.6): good 9/12, average 3/6 (were 12/12
      // and 4/6).
      surges: [
        { at: 45, roles: ['skirmisher'], count: 4, label: 'Drone batch' },
      ],
      formations: [
        formation('swarm', { role: 'swarmer', count: 8, at: 20 }),
        formation('wall', { role: 'skirmisher', count: 6, at: 34 }),
      ],
      events: [],
      warden: false,
    },
    {
      rocks: 22,
      roster: [
        { role: 'minelayer', count: 2, from: 10, every: 16, elite: 0 },
        { role: 'support', count: 1, from: 15, every: 30, elite: 0 },
      ],
      // proposta 13/11: a Drone batch at 40 (was none), as above.
      surges: [
        { at: 40, roles: ['skirmisher'], count: 6, label: 'Drone batch' },
      ],
      formations: [formation('ring', { role: 'skirmisher', count: 8, at: 32 })],
      events: [fieldEvent('sensor-jam', 30)],
      warden: false,
    },
    {
      rocks: 24,
      roster: [
        { role: 'tank', count: 2, from: 10, every: 20, elite: 0.2 },
        { role: 'carrier', count: 1, from: 15, every: 20, elite: 0 },
        // proposta 13/11: a Drone trickle and a batch at 40 (were none), as
        // above; 3 every 10 s and a batch of 8 took the average pilot to 0/6.
        { role: 'skirmisher', count: 2, from: 8, every: 12, elite: 0.1 },
      ],
      surges: [
        { at: 40, roles: ['skirmisher'], count: 6, label: 'Drone batch' },
      ],
      formations: [
        formation('wall', { role: 'skirmisher', count: 10, at: 25 }),
      ],
      events: [fieldEvent('gravity-well', 35)],
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
