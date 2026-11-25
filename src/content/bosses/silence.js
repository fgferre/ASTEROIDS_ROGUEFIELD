// A Herald (Warden's Reach): blinks around you, blinds the radar, hunts with
// shards. Listed by src/data/enemies/herald.js. Numbers: proposta 18/10 — the
// owner's play decides.
export default {
  id: 'silence',
  order: 6,
  tier: 'herald',
  displayName: 'Herald of Silence',
  subtitle: 'The Reach stops listening',
  codex: {
    lore: 'Past this point we do not answer. The Silence makes sure of it. It eats every signal in the Reach, yours first, and moves where nothing can hear it go.',
    hint: 'Blinds your radar while it lives. A ring marks where it blinks.',
    glyph:
      '<polygon points="0,-15 5,-5 5,9 0,15 -5,9 -5,-5"/><circle class="eye" cy="-3" r="2"/>',
  },
  health: 950,
  radius: 32,
  contactDamage: 20,
  speed: 40,
  holdDistance: 260,
  jamsRadar: true,
  blinkInterval: 6, // s
  blinkWindup: 0.6, // s the telegraph ring shows before the blink
  blinkDistance: 200,
  shardInterval: 3, // s
  shardSpeed: 120,
  shardTurnRate: 1.6, // rad/s the shard steers toward the ship
  shardLifetime: 5, // s
  shardDamage: 14,
};
