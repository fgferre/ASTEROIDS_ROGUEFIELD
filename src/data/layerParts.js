// src/data/layerParts.js

import { deepFreeze } from '../utils/deepFreeze.js';
import {
  ASTEROIDS_PER_WAVE_BASE,
  ASTEROIDS_PER_WAVE_MULTIPLIER,
  MAX_ASTEROIDS_ON_SCREEN,
} from './constants/gameplay.js';

// The pieces the layer files in src/content/stages/ are built from. They live
// here, not in layers.js, because layers.js imports those files through the
// registry: sharing them from layers.js would make an import cycle.

/** Today's rock curve, floor(6 × 1.26^(layer − 1)) capped at 40. */
export function rockCurve(layer) {
  return Math.min(
    MAX_ASTEROIDS_ON_SCREEN,
    Math.floor(
      ASTEROIDS_PER_WAVE_BASE *
        Math.pow(ASTEROIDS_PER_WAVE_MULTIPLIER, layer - 1)
    )
  );
}

/**
 * Field events (proposta 18/10). Gravity Well: every XP spark drifts to a
 * point `minDistance`–`maxDistance` px from the ship (`pullSpeed` px/s, faster
 * by `pullAcceleration` each second). Solar Flare: every enemy stunned for the
 * duration. Sensor Jam: the radar shows noise.
 */
export const FIELD_EVENTS = deepFreeze({
  'gravity-well': {
    label: 'Gravity Well',
    duration: 8,
    pullSpeed: 40,
    pullAcceleration: 20,
    minDistance: 220,
    maxDistance: 320,
  },
  'solar-flare': { label: 'Solar Flare', duration: 1 },
  'sensor-jam': { label: 'Sensor Jam', duration: 10 },
});

export const fieldEvent = (kind, at) => ({
  at,
  kind,
  label: FIELD_EVENTS[kind].label,
});

export const ROCKFALL = {
  at: 40,
  roles: ['asteroid'],
  count: 6,
  label: 'Rockfall',
};
