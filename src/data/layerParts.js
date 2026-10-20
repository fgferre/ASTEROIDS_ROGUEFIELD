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

/**
 * Formations (proposta 20/10): `count` enemies of one `role` that come in
 * together, in a shape, FORMATION_WARN s after their marks light up at `at`
 * s into the layer (src/modules/enemies/waves/formations.js places them);
 * each rolls Elite with chance `elite`. Each unit flies its formation's
 * course before its own movement takes over.
 * - ring: round the ship, `radius` px out (never under 0.6 of it on the
 *   field's side), closing in at `speed` px/s for `hold` s;
 * - sweep: a line `spacing` px apart from the edge farthest from the ship,
 *   across the ship's lane, crossing the whole field at `speed` px/s;
 * - swarm: a pack `spread` px across from the farthest edge, at the ship at
 *   `speed` px/s for `hold` s;
 * - wall: a row along the farthest edge with one gap `gap` px wide, pushing
 *   across the whole field at `speed` px/s.
 */
export const FORMATION_WARN = 1.2; // proposta 20/10: s of marks before
export const FORMATIONS = deepFreeze({
  ring: { radius: 240, speed: 90, hold: 0.8 },
  sweep: { spacing: 64, speed: 170 },
  swarm: { spread: 50, speed: 160, hold: 0.9 },
  wall: { gap: 210, speed: 45 },
});

/** A stage's formation line: `formation('ring', { role, count, at })`. */
export function formation(kind, { role, count, at, elite = 0, ...shape }) {
  if (!FORMATIONS[kind]) throw new Error(`[layerParts] no formation '${kind}'`);
  return { kind, role, count, at, elite, ...FORMATIONS[kind], ...shape };
}

export const ROCKFALL = {
  at: 40,
  roles: ['asteroid'],
  count: 6,
  label: 'Rockfall',
};
