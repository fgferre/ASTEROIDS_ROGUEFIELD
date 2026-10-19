// Layers 11–12: Seekers and Bulwarks.
import { fieldEvent, rockCurve } from '../../data/layerParts.js';

export default {
  id: 'layer-12',
  order: 12,
  rocks: rockCurve(12),
  roster: [
    { role: 'skirmisher', count: 4, from: 5, every: 6, elite: 0.15 },
    { role: 'carrier', count: 3, from: 10, every: 10, elite: 0.15 },
    { role: 'charger', count: 2, from: 12, every: 10, elite: 0.15 },
    { role: 'hazard', count: 2, from: 15, every: 12, elite: 0.15 },
    { role: 'sniper', count: 3, from: 8, every: 10, elite: 0.15 },
    { role: 'tank', count: 2, from: 15, every: 15, elite: 0.15 },
    { role: 'artillery', count: 2, from: 15, every: 12, elite: 0.15 },
    { role: 'flanker', count: 2, from: 15, every: 12, elite: 0.15 },
    { role: 'scavenger', count: 1, from: 20, every: 1, elite: 0.15 },
  ],
  surges: [
    { at: 30, roles: ['charger'], count: 5, label: 'Ram pack' },
    { at: 50, roles: ['artillery', 'flanker'], count: 4, label: 'Crossfire' },
  ],
  events: [fieldEvent('solar-flare', 30)],
  warden: false,
};
