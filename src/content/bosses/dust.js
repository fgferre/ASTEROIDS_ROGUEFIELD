// A Herald (Outer Ring): a slow slab that raises walls of rock between itself
// and you. Listed by src/data/enemies/herald.js. Numbers: proposta 18/10 — the
// owner's play decides.
export default {
  id: 'dust',
  order: 4,
  displayName: 'Herald of Dust',
  subtitle: 'The Ring’s first word',
  health: 420,
  radius: 34,
  contactDamage: 20,
  speed: 28, // px/s drift
  holdDistance: 230, // stops closing in here
  wallInterval: 7, // s
  wallWindup: 1.2, // s the slits light before the wall
  wallRocks: 5,
  wallSpacing: 30, // px between rocks
  wallDrift: 14, // px/s the wall creeps toward the ship
};
