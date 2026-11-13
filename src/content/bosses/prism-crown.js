// A Sentinel (CONTENT.md "Boss"): a crown of crystal mirrors round a core,
// left over from the choir that sang the Ring closed. Its loop: ALIGN (it
// stops; its mirrors turn to a new arrangement and the path of each beam
// shows as a thin line: core to mirror, then reflected to the field's edge;
// one of them passes through the ship), FIRE (the beams burn along exactly
// those paths while the whole crown turns slowly, so they sweep), REST (the
// mirrors spread out and go dark: the damage window), a drift toward
// mid-field, again. Not resting, its core lets `coreDamageFactor` through.
// Below `phaseThresholds`: four mirrors, a faster sweep, a shorter rest.
// Behavior: src/modules/enemies/types/SentinelPrismCrown.js; listed by
// src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px, degrees.
// Numbers: proposta 12/11 — the owner's play decides.
export default {
  id: 'prism-crown',
  order: 10,
  tier: 'sentinel',
  displayName: 'Prism Crown',
  subtitle: 'What is left of the hymn',
  layer: 10, // proposta 12/11: the layer it fights on (health scales by it)
  // 70 % of Warden Choir's health on the same layer: Choir is Prime's base ×
  // its 1.1 (choir.js), so 0.7 × 1.1.
  healthFactor: 0.77, // proposta 12/11
  radius: 70, // proposta 12/11
  // XP on top of the type-wide boss drop, like the other Sentinels: 100 + 500.
  rewards: { xp: 100 }, // proposta 12/11
  phaseThresholds: [0.5], // proposta 12/11
  phaseCount: 2,
  invulnerabilityDuration: 1, // proposta 12/11: s, at the phase change
  // Its entrance: a glide in with the mirrors wide, closing in on the core
  // as it stops. Fields explained in prime.js.
  arrival: {
    start: 160,
    motion: 'glide',
    curve: 0,
    travel: 0.7, // proposta 12/11
    close: 0.25, // proposta 12/11
    open: 1,
    spin: 0,
    world: 0.3,
    recover: 0.4,
    flare: '#9fe8ff',
    shot: { tilt: [64, 64], turn: [-20, -6], distance: [640, 560], look: 0.45 },
  },
  coreDamageFactor: 0.4, // proposta 12/11: not resting, 40 % gets through
  crown: {
    orbit: 1.6, // × radius: the mirrors' distance from the core
    spread: 0.5, // × the orbit: how much farther out they sit at rest
    openSpeed: 2, // proposta 12/11: crownOpen (0..1) per s
    // The reflected beam's bend off the radial, one per volley in turn
    // (mirror 0 is then turned so its beam crosses the ship), and each
    // mirror's own twist on it: they stay ≥ 50° apart.
    bends: [60, -50, 75, -65], // proposta 12/11
    twists: [0, 15, -15, 10], // proposta 12/11
  },
  // Damage over time: one tick every `burnTick` s while the ship's centre is
  // within `width / 2` of a burning segment, `damageFactor` of contactDamage.
  burnTick: 0.4, // proposta 12/11
  beam: {
    width: 20, // proposta 12/11: px
    damageFactor: 0.15, // proposta 12/11
  },
  drift: {
    acceleration: 80, // proposta 12/11: px/s², toward mid-field
    maxSpeed: 60, // proposta 12/11: px/s
    arrive: 60, // proposta 12/11: px, it slows inside this of the centre
  },
  // The cycle per phase: the drift; mirrors; the warning; the burn and how
  // fast the crown turns meanwhile (°/s, its direction alternates by
  // volley); the rest.
  cycle: [
    { drift: 1.6, mirrors: 3, warn: 1.2, burn: 2.2, sweep: 18, rest: 3.4 },
    { drift: 1.2, mirrors: 4, warn: 1.2, burn: 2.2, sweep: 26, rest: 2.8 },
  ], // proposta 12/11
  // It steers itself (the drift above); the phases only name the strategy.
  movementPhases: [{ strategy: 'linear' }, { strategy: 'linear' }],
};
