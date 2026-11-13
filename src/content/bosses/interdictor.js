// A Sentinel (CONTENT.md "Boss"): the machine that kept the Reach
// quarantined. A low slab with an emitter mast. Its loop: GRID (it stops and
// raises a square cage of energy fences round the ship, one side left open,
// the open side turning clockwise each cycle; touching a solid fence hurts
// and pushes the ship back like the Gatekeeper's barrier), LOCK (while the
// cage stands it fires locked beams from itself: a line tracks the ship,
// freezes, then burns along the frozen line to the field's edge), REST (the
// cage is down, it cools: full damage), a drift toward mid-field, again.
// Not resting, its shell lets `shellDamageFactor` through. Below
// `phaseThresholds`: one more beam, a faster aim, a smaller cage, a shorter
// rest. Behavior: src/modules/enemies/types/SentinelInterdictor.js; listed by
// src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px. Numbers:
// proposta 12/11 — the owner's play decides.
export default {
  id: 'interdictor',
  order: 12,
  tier: 'sentinel',
  displayName: 'Interdictor',
  subtitle: 'The boundary was drawn on purpose',
  layer: 15, // proposta 12/11: the layer it fights on (health scales by it)
  // 60 % of Warden Null's health on the same layer: Null is Prime's base ×
  // its 1.35 (null.js), so 0.6 × 1.35.
  healthFactor: 0.81, // proposta 12/11
  radius: 72, // proposta 12/11
  // XP on top of the type-wide boss drop, like the other Sentinels: 100 + 500.
  rewards: { xp: 100 }, // proposta 12/11
  phaseThresholds: [0.5], // proposta 12/11
  phaseCount: 2,
  invulnerabilityDuration: 1, // proposta 12/11: s, at the phase change
  // Its entrance: short, the emitter mast rising as it stops. Fields
  // explained in prime.js.
  arrival: {
    start: 160,
    motion: 'heavy',
    curve: 0,
    travel: 0.6, // proposta 12/11
    close: 0.25, // proposta 12/11
    open: 1,
    spin: 0,
    world: 0.3,
    recover: 0.4,
    flare: '#ff5a6e',
    shot: { tilt: [64, 64], turn: [-18, -4], distance: [640, 560], look: 0.45 },
  },
  shellDamageFactor: 0.3, // proposta 12/11: not resting, 30 % gets through
  // The cage: a square round the ship, kept inside the field.
  grid: {
    warn: 1.2, // proposta 12/11: s of thin lines before it is solid
    fade: 0.3, // proposta 12/11: s, it fades after its hold (harmless)
    thickness: 14, // proposta 12/11: px, a solid fence
    damageFactor: 0.4, // proposta 12/11: of contactDamage, like the barrier
    push: 260, // proposta 12/11: px/s away from the fence (the ship thrusts 280)
  },
  // A locked beam: aims (the cycle's `aim`), freezes, burns to the edge.
  // Damage over time: one tick every `burnTick` s while the ship's centre is
  // within `width / 2` of the burning line, `damageFactor` of contactDamage.
  lock: {
    freeze: 0.4, // proposta 12/11: s, the line stops following
    burn: 0.6, // proposta 12/11: s
    gap: 0.5, // proposta 12/11: s between one beam's end and the next aim
    width: 24, // proposta 12/11: px
    damageFactor: 0.15, // proposta 12/11
  },
  burnTick: 0.4, // proposta 12/11
  ventSpeed: 3, // proposta 12/11: ventOpen (0..1) per s
  drift: {
    acceleration: 80, // proposta 12/11: px/s², toward mid-field
    maxSpeed: 60, // proposta 12/11: px/s
    arrive: 60, // proposta 12/11: px, it slows inside this of the centre
  },
  // The cycle per phase: the drift; the cage's side and solid hold; beams
  // per cage and each one's aim; the rest. The first aim starts with the
  // cage's warning.
  cycle: [
    // solid 3.6: the cage drops soon after its second beam (12/11: it stood
    // empty for two seconds)
    // rest 3 and 2.4 (were 2.5 and 2): it was open a quarter of the time and
    // the fight ran three minutes and more
    { drift: 1.6, size: 360, solid: 3.6, beams: 2, aim: 1.0, rest: 3 },
    { drift: 1.2, size: 320, solid: 5.5, beams: 3, aim: 0.8, rest: 2.4 },
  ], // proposta 12/11
  // It steers itself (the drift above); the phases only name the strategy.
  movementPhases: [{ strategy: 'linear' }, { strategy: 'linear' }],
};
