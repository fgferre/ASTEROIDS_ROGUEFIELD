// The broken Ring's shape and look (docs/NORTE.md §1–2), shared by its
// builders (ringParts.js, ringDetail.js), its material and its object.

// proposta 20/10: the broken Ring, an arc of modules in its own plane (x → z,
// y up, risen `tilt` toward the field) about `centre`, `radius` out, from its
// break `stump` (in view, under the field's left half) round to its far end
// `far` (radians). Cross-section in world units: `width` rim to rim, the hull
// `hull` deep under the deck, the rim walls `rim` above it and `wall` thick;
// under the hull a keel `keel` deep, its bottom `keelTaper` × its top wide.
// Plates `module` long, `seam` apart, a rib every `ribEvery`; `gap`: the
// modules missing where it broke again; `follow`: its share of the camera's
// travel (brokenRing.js); `chunk`: modules per draw (and per level of detail).
export const RING = {
  radius: 2200,
  centre: [-1900, -900, -1700],
  tilt: 0.12,
  stump: (50 * Math.PI) / 180,
  far: (-112 * Math.PI) / 180,
  width: 96,
  hull: 24,
  rim: 9,
  wall: 8,
  keel: 12,
  keelTaper: 0.58,
  module: 60,
  seam: 4,
  ribEvery: 6,
  gap: [44, 45],
  follow: 0.5,
  chunk: 8,
};
// proposta 20/10: its look. Matte metal (`albedo`, `roughness`,
// `metalness`) under the field's own lights, the lower faces down to `low`
// of the light (self-shadow), the bevelled rim edges `edge` × brighter (they
// catch the key light; close up a brighter edge reads as a neon line, so it
// dims to `edgeClose` × as the camera comes from `edgeFade[1]` to
// `edgeFade[0]` units). The haze (the biome's sky + haze × `hazeGain`)
// grows with the length of the view ray under the field plane, the same
// from any shot: 63% after `hazeDepth`. Running lights glow `idle` ×
// `idleColor` before the wake (most are dead); in the wake the hull takes
// `spill` of the violet. What hangs under the hull (the keel, its plating,
// pods, masts) is `under` × lighter, so a light from below finds it as lit
// as the deck (the self-shadow leaves `low` there; the field's lights never
// reach it).
export const RING_LOOK = {
  albedo: '#272b32',
  roughness: 0.9,
  metalness: 0.1,
  low: 0.35,
  edge: 6.5,
  edgeClose: 1.8,
  edgeFade: [300, 900],
  hazeGain: 0.05,
  hazeDepth: 1300,
  idleColor: '#ffc27a',
  idle: 0.5,
  spill: 0.25,
  under: 2.1,
};

export const RING_ARC = RING.radius * (RING.stump - RING.far);
export const MODULE_COUNT = Math.floor(
  (RING_ARC + RING.seam) / (RING.module + RING.seam)
);

/** Where module `i` starts along the arc. */
export function moduleStart(i) {
  return i * (RING.module + RING.seam);
}

/** Ring-local position of the point `s` along the arc, `r` out, `y` up. */
export function ringPoint(s, r = 0, y = 0, out = [0, 0, 0]) {
  const phi = RING.stump - s / RING.radius;
  out[0] = (RING.radius + r) * Math.cos(phi);
  out[1] = y;
  out[2] = (RING.radius + r) * Math.sin(phi);
  return out;
}
