// A Herald (Dense Core): circles you and sets the nearest rocks burning.
// Listed by src/data/enemies/herald.js. Numbers: proposta 18/10 — the owner's
// play decides.
export default {
  id: 'heat',
  order: 5,
  displayName: 'Herald of Heat',
  subtitle: 'The Core remembers fire',
  health: 700,
  radius: 30,
  contactDamage: 20,
  speed: 120, // px/s max
  orbitDistance: 240,
  orbitSpeed: 0.35, // rad/s around the ship
  igniteInterval: 9, // s
  igniteWindup: 1.2, // s the seam brightens before igniting
  igniteCount: 3,
  spreadShots: 3,
  spreadArc: 0.5, // rad
  shotSpeed: 230,
  shotDamage: 12,
};
