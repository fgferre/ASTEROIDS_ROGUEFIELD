// A Sentinel (CONTENT.md "Boss"): the furnace that still burns where the Ring
// told it to. A squat drum ringed by six cooling fins. Its loop: HEAT
// SECTORS (it stops; the field round it splits into `sectors.count` wedges
// and every other one burns: marked, then hot for a while, then the pattern
// steps one wedge over and burns again), SLAG (it lobs shots at marked
// circles round where the ship is and is heading; each landing leaves a
// burning pool), VENT (the fins open: the damage window), a drift toward
// mid-field, again. Shut, its shell lets `shellDamageFactor` through. Below
// `phaseThresholds`: one more step, one more slag shot, a shorter vent.
// Behavior: src/modules/enemies/types/SentinelKilnEngine.js; listed by
// src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px, radians.
// Numbers: proposta 12/11 — the owner's play decides.
export default {
  id: 'kiln-engine',
  order: 9,
  tier: 'sentinel',
  displayName: 'Kiln Engine',
  subtitle: 'The fire was never told to stop',
  layer: 10, // proposta 12/11: the layer it fights on (health scales by it)
  // 55 % of Warden Choir's health on the same layer: Choir is Prime's base ×
  // its 1.1 (choir.js), so 0.55 × 1.1 (was 65 %: the first Sentinel of
  // chapter II outlasted Warden Choir, its fight about 3 minutes long).
  healthFactor: 0.605, // proposta 12/11
  radius: 72, // proposta 12/11
  // XP on top of the type-wide boss drop, like the other Sentinels: 100 + 500.
  rewards: { xp: 100 }, // proposta 12/11
  phaseThresholds: [0.5], // proposta 12/11
  phaseCount: 2,
  invulnerabilityDuration: 1, // proposta 12/11: s, at the phase change
  // Its entrance: heavy and short, the fins flung open, shut when it stops.
  // Fields explained in prime.js.
  arrival: {
    start: 160,
    motion: 'heavy',
    curve: 0,
    travel: 0.7, // proposta 12/11
    close: 0.25, // proposta 12/11
    open: 1,
    spin: 0,
    world: 0.3,
    recover: 0.4,
    flare: '#ff7b2e',
    shot: { tilt: [66, 64], turn: [-18, -4], distance: [640, 560], look: 0.45 },
  },
  shellDamageFactor: 0.4, // proposta 12/11: shut, 40 % gets through
  finSpeed: 3, // proposta 12/11: fins open (0..1) per s
  // Damage over time: one tick every `burnTick` s while the ship's centre is
  // in a burning wedge or pool, `damageFactor` of contactDamage.
  burnTick: 0.4, // proposta 12/11
  sectors: {
    count: 6, // wedges; every other one burns
    // proposta 12/11: was 0.15; the wedges killed the good bot at the Kiln
    // 5 times in 12 seeds, the chapter's first Sentinel
    damageFactor: 0.1,
  },
  slag: {
    radius: 55, // proposta 12/11: px, the pool
    damageFactor: 0.15, // proposta 12/11
    lead: 0.6, // proposta 12/11: s, the middle one lands ahead of the ship
    spread: 110, // proposta 12/11: px, the others round it
    edgeMargin: 30, // proposta 12/11: px, landings stay inside the field
  },
  drift: {
    acceleration: 80, // proposta 12/11: px/s², toward mid-field
    maxSpeed: 60, // proposta 12/11: px/s
    arrive: 60, // proposta 12/11: px, it slows inside this of the centre
  },
  // The cycle per phase: the drift; the first wedge warning, the next ones'
  // warning, each burn, how many times the pattern steps; slag shots, their
  // flight (the marks' warning), how long a pool burns; the vent.
  cycle: [
    {
      drift: 1.8,
      sectorWarn: 1.6,
      sectorStepWarn: 1.1,
      sectorBurn: 2.5,
      sectorSteps: 1,
      slagShots: 4,
      slagFlight: 1.0,
      poolBurn: 4,
      vent: 3.6,
    },
    {
      drift: 1.4,
      sectorWarn: 1.6,
      sectorStepWarn: 1.1,
      sectorBurn: 2.5,
      sectorSteps: 2,
      slagShots: 5,
      slagFlight: 1.0,
      poolBurn: 4,
      vent: 3,
    },
  ], // proposta 12/11
  // It steers itself (the drift above); the phases only name the strategy.
  movementPhases: [{ strategy: 'linear' }, { strategy: 'linear' }],
};
