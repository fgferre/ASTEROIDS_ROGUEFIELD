// A weapon: one file, listed by `order`. The lowest order is the cannon a run
// starts with; the others come from their `card`. Numbers are "proposta 18/10"
// (docs/NORTE.md §7 pillar 4), for the owner to judge by playing.
//
// `fire`: what a shot does. The first pattern due fires: one with `every: n`
//   on every nth shot, one without on any shot. Patterns (FIRE_PATTERNS in
//   src/modules/combat/Weapons.js): `stream`, projectiles on the lock lanes
//   (Multishot adds lanes); `beam`, a segment that hits everything it crosses;
//   `fan`, a fan of projectiles (Multishot adds bolts).
// `projectile`: what `stream` and `fan` launch. `look` is its 3D bolt: 'lance'
//   (the family evolutions restyle it) or 'flak'. Speed and damage multiply
//   the lance's; `range` (px) ends its flight, else the lance's lifetime does;
//   `pierce` lets it take the lance's pierce (Railshot, Coilgun, Recoil
//   Dampers); `trailPoints` caps its trail, else the lance's length does;
//   `burst` bursts it on its first hit or at the end of its range.
// `colors`: what the beam (glow, mid, core) and the flak look (tracer, core,
//   burst) draw with.
// `card`: the card that swaps the cannon for this weapon; src/data/upgrades/
//   index.js gives it its one rank and rules out every other weapon card.
// The Thermal Lens lengthens the beam of a weapon that has one, else it boosts
// the projectile; the Chain Capacitor doubles some projectile hits.
export default {
  id: 'lance',
  order: 1,
  name: 'Amber Lance',
  chip: 'LANCE',
  description: 'Short amber traces from the nose.',
  fire: [{ pattern: 'stream' }],
  projectile: {
    look: 'lance',
    speedMultiplier: 1,
    damageMultiplier: 1,
    range: null,
    pierce: true,
    trailPoints: null,
    burst: null,
  },
};
