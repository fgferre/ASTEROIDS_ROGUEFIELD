// The world the journeys fly through (travelScene.js): the broken Ring laid
// at `WORLD.scale` × its size, flat, its centre the origin (ring-local axes,
// ring/ringShape.js ringPoint), and the ten places (docs/ROTEIRO.md "Os
// lugares") fixed in it: each at its angle along the Ring (`PLACE_ANGLES`),
// `offRing` off its centre line (places/index.js: inward and over its deck),
// facing down the Ring's arc — the way the field is "up" there, so the ship
// lands nosed that way. The campaign runs down the arc from the Ring's
// break: a journey inside a chapter is a short hop along it; a new chapter
// lies far along, behind a jump. The scene maps this world so the place
// the journey goes to sits on the ship's spawn, facing its heading: the
// same place stands in the same spot whether the ship leaves it or arrives.

import { RING } from '../ring/ringShape.js';
import { PLACE_SETS } from '../places/index.js';

const DEG = Math.PI / 180;

// proposta 13/11: the Ring laid at `scale` × its size (the size the ship
// skims it at); the opening starts `deep` [out, up] world units beyond the
// first place, out in the dark.
export const WORLD = { scale: 5, deep: [16000, 3000] };

// proposta 13/11: each place's angle along the laid Ring (radians, as
// ringPoint: the break at RING.stump, 50°, falling along the arc to its far
// end, −112°). Chapter I from near the break down to Prime's wall; II round
// the crack (the modules missing at −23°); III down to the far broken end;
// the Crucible back toward the middle of the arc.
export const PLACE_ANGLES = Object.freeze({
  'debris-wake': 40 * DEG,
  'salvage-lanes': 27 * DEG,
  'prime-gate': 14 * DEG,
  'furnace-drift': -12 * DEG,
  'crystal-choir': -23 * DEG,
  'dense-core': -34 * DEG,
  'assembly-graveyard': -62 * DEG,
  'quarantine-grid': -78 * DEG,
  'wardens-reach': -102 * DEG,
  'the-crucible': -48 * DEG,
});

/** The laid Ring's radius, world units. */
export const LAID_RADIUS = RING.radius * WORLD.scale;

/**
 * Place `id`'s point in the world and its heading (the field's "up" there,
 * down the Ring's arc, level), into `out` { position, heading } (vectors);
 * the deep space before the first place for an unknown id.
 */
export function placeFrame(id, out) {
  const angle = PLACE_ANGLES[id];
  if (angle === undefined) {
    placeFrame('debris-wake', out);
    const [far, up] = WORLD.deep;
    const c = Math.cos(PLACE_ANGLES['debris-wake']);
    const s = Math.sin(PLACE_ANGLES['debris-wake']);
    // Out past the Ring's break, up the arc from the first place.
    out.position.x += far * (c * 0.3 - s);
    out.position.z += far * (s * 0.3 + c);
    out.position.y += up;
    return out;
  }
  const [side, height] = PLACE_SETS[id]?.offRing ?? [0, 0];
  const r = LAID_RADIUS - side;
  out.position.set(r * Math.cos(angle), height, r * Math.sin(angle));
  out.heading.set(Math.sin(angle), 0, -Math.cos(angle));
  out.angle = angle;
  return out;
}

/**
 * The world's map onto the scene for a journey ending at `to`'s frame on
 * `end` (the ship's spawn, scene) headed `turn` (radians, about y, from −z):
 * a turn about y by `yaw` and a shift.
 */
export class WorldMap {
  constructor(THREE) {
    this.origin = new THREE.Vector3();
    this.end = new THREE.Vector3();
    this.yaw = 0;
  }

  set(to, end, turn) {
    this.origin.copy(to.position);
    this.end.copy(end);
    this.yaw = turn - to.angle;
    return this;
  }

  /** World point `p` into the scene, into `out` (may be `p`). */
  point(p, out) {
    const x = p.x - this.origin.x;
    const z = p.z - this.origin.z;
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return out.set(
      this.end.x + x * c - z * s,
      this.end.y + p.y - this.origin.y,
      this.end.z + x * s + z * c
    );
  }

  /** World direction `d` into the scene, into `out` (may be `d`). */
  direction(d, out) {
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    return out.set(d.x * c - d.z * s, d.y, d.x * s + d.z * c);
  }
}
