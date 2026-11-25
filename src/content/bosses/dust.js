// A Herald (Outer Ring): a slow slab that raises walls of rock between itself
// and you. Listed by src/data/enemies/herald.js. Numbers: proposta 18/10 — the
// owner's play decides.
export default {
  id: 'dust',
  order: 4,
  tier: 'herald',
  displayName: 'Herald of Dust',
  subtitle: 'The Ring’s first word',
  codex: {
    lore: 'We sent the Dust ahead to speak for us. It speaks in walls. It counts every stone in the Outer Ring and lays them where a pilot must not pass; what it cannot count, it buries.',
    hint: 'Every few seconds it raises a wall of rock. The slits light first.',
    glyph:
      '<rect x="-14" y="-6" width="28" height="12" rx="1.5"/><rect class="eye" x="-9.5" y="-1" width="4" height="2"/><rect class="eye" x="-2" y="-1" width="4" height="2"/><rect class="eye" x="5.5" y="-1" width="4" height="2"/>',
  },
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
