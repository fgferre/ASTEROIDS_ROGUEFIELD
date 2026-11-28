// A Herald (Dense Core): circles you and sets the nearest rocks burning.
// Listed by src/data/enemies/herald.js. Numbers: proposta 18/10 — the owner's
// play decides.
export default {
  id: 'heat',
  order: 5,
  tier: 'herald',
  displayName: 'Herald of Heat',
  subtitle: 'The Core remembers fire',
  codex: {
    lore: 'The Core still burns where we told it to. The Heat carries the flame from rock to rock and knows each one by its temperature. A pilot is one more reading, and the reading is rising.',
    hint: 'Its seam brightens, then the rocks nearest it turn Volatile.',
    glyph:
      '<circle r="12"/><path class="eye" fill-rule="evenodd" d="M-10.5 0a10.5 10.5 0 1 0 21 0a10.5 10.5 0 1 0 -21 0Z M-8.5 0a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0 -17 0Z"/>',
  },
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
