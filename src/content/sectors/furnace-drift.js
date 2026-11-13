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
  // proposta 12/11: hot orange haze, ember dust, a strong warm key.
  look: {
    backdrop: 'furnace-drift',
    sky: ['#0c0705', '#030202'],
    hazeColor: '#d2621a',
    hazeDensity: 1.35,
    veinColor: '#ffa030',
    veinDensity: 0.8,
    dustColor: '#ffb050',
    keyColor: '#ffb878',
    keyIntensity: 1.7,
    fillColor: '#8a401e',
    debris: 0.4,
    tint: 'rgba(255, 130, 40, 0.12)',
  },
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
      // One layer's rocks fewer and a slower trickle of Drones: the Herald
      // is the stage (measured 12/11: it ran four to five minutes).
      rocks: rockCurve(7),
      roster: [{ role: 'skirmisher', count: 2, from: 8, every: 16, elite: 0 }],
      surges: [],
      formations: [],
      events: [],
      warden: false,
      herald: 'heat',
    },
    {
      rocks: rockCurve(8),
      // One Caster at a time: its blast is wider than the ship can fly out
      // of (measured 12/11: only a dash clears it), so two of them asked
      // for a dash every 1.6 s, the dash's whole cooldown.
      roster: [
        { role: 'artillery', count: 1, from: 10, every: 12, elite: 0 },
        { role: 'skirmisher', count: 2, from: 16, every: 14, elite: 0 },
      ],
      surges: [
        { at: 40, roles: ['skirmisher'], count: 5, label: 'Mote swarm' },
      ],
      formations: [formation('ring', { role: 'swarmer', count: 8, at: 25 })],
      events: [fieldEvent('solar-flare', 35)],
      warden: false,
    },
    {
      // Two layers' rocks fewer: the fight is the Kiln's fire, not the field.
      rocks: rockCurve(8),
      roster: [],
      surges: [],
      formations: [],
      events: [],
      warden: true,
    },
  ],
};
