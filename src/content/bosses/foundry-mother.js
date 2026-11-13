// A Sentinel (CONTENT.md "Boss"): a factory of the old Ring that keeps
// building the same chassis. A wide slab with two assembly bays and two arms.
// Its loop: ASSEMBLE (it stops; its bays open, then each builds one escort
// Drone through the Warden's minion path, never past `escortCap` of its own
// alive; open, it takes full damage, and `scrapShare` of its health lost
// during one assembly scraps the units in progress, staggers it and adds
// `scrapVent` s to its next vent), SWEEP (two opposite arms reach out to just
// past the ship's distance, each a ring segment round the body, shown, then
// swung through `sweepArc` in
// `sweepTime`, the direction alternating each cycle; they hurt only the
// ship), VENT (the arms hang, the shell is open: full damage), a drift toward
// mid-field, again. Shut, its shell lets `shellDamageFactor` through. Below
// `phaseThresholds`: faster builds, a wider sweep, one more escort, a
// shorter vent. Behavior: src/modules/enemies/types/SentinelFoundryMother.js;
// listed by src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px,
// degrees. Numbers: proposta 12/11 — the owner's play decides.
export default {
  id: 'foundry-mother',
  order: 11,
  tier: 'sentinel',
  displayName: 'Foundry Mother',
  subtitle: 'The line was never told to stop',
  layer: 15, // proposta 12/11: the layer it fights on (health scales by it)
  // 55 % of Warden Null's health on the same layer: Null is Prime's base ×
  // its 1.35 (null.js), so 0.55 × 1.35.
  healthFactor: 0.7425, // proposta 12/11
  radius: 78, // proposta 12/11
  // XP on top of the type-wide boss drop, like the other Sentinels: 100 + 500.
  rewards: { xp: 100 }, // proposta 12/11
  phaseThresholds: [0.5], // proposta 12/11
  phaseCount: 2,
  invulnerabilityDuration: 1, // proposta 12/11: s, at the phase change
  // Its entrance: heavy and short, the arms unfolded, folded when it stops.
  // Fields explained in prime.js.
  arrival: {
    start: 170,
    motion: 'heavy',
    curve: 0,
    travel: 0.7, // proposta 12/11
    close: 0.3, // proposta 12/11
    open: 1,
    spin: 0,
    world: 0.3,
    recover: 0.4,
    flare: '#ffb347',
    shot: { tilt: [66, 64], turn: [-18, -4], distance: [660, 580], look: 0.45 },
  },
  shellDamageFactor: 0.3, // proposta 12/11: shut, 30 % gets through
  // Its escorts, from the minion types the field has (BossWave's filter).
  minionTypes: ['drone'],
  bays: {
    warn: 1.2, // proposta 12/11: s, the bays opening before they build
    closeSpeed: 4, // proposta 12/11: bay open (0..1) per s, shutting
  },
  // proposta 12/11: of max health, lost in one assembly. At 0.05 a strong
  // pilot scrapped eight assemblies in ten and the Mother never built.
  scrapShare: 0.07,
  scrapVent: 1.5, // proposta 12/11: s added to the next vent
  stagger: 0.7, // proposta 12/11: s it reels after a scrap
  // Damage over time: one tick every `burnTick` s while the ship's centre is
  // in a sweeping arm's segment, `damageFactor` of contactDamage.
  burnTick: 0.4, // proposta 12/11
  arms: {
    inner: 78, // proposta 12/11: px from its centre (its own radius)
    // proposta 12/11: px, the least reach; was 230, short of where a pilot
    // stands off a shut boss (~300 px from its centre): in 11 fights the
    // arms never landed. At 320 the pilot parked at the field's edge, past
    // the turret's good range, and two fights in nine ran 14 and 20 minutes.
    outer: 300,
    // proposta 12/11: the arms reach `lead` px past the ship's distance when
    // the warning starts, never under `outer` nor past `maxReach` (was a
    // fixed 300: standing off answered it, 11/12 good wins).
    lead: 80,
    maxReach: 420,
    width: 70, // proposta 12/11: degrees, each segment
    // proposta 12/11: s shown before they swing; was 1.0, and the arm's
    // leading edge reaches a ship mid-swing a quarter second later: a pilot
    // building-side always flew clear of it.
    warn: 0.7,
    reachSpeed: 3, // proposta 12/11: armReach (0..1) per s
    // proposta 12/11: was 0.15; a caught ship lost 7-21 a fight, nothing a
    // health pickup did not undo before the next sweep.
    damageFactor: 0.3,
  },
  ventSpeed: 3, // proposta 12/11: ventOpen (0..1) per s
  drift: {
    acceleration: 80, // proposta 12/11: px/s², toward mid-field
    maxSpeed: 60, // proposta 12/11: px/s
    arrive: 60, // proposta 12/11: px, it slows inside this of the centre
  },
  // The cycle per phase: the drift; how long a bay builds; its escorts alive
  // at most; the arms' swing (degrees) and its time; the vent.
  cycle: [
    {
      drift: 1.6,
      build: 3,
      escortCap: 4,
      sweepArc: 120,
      sweepTime: 1.6,
      vent: 2.5,
    },
    {
      drift: 1.2,
      build: 2.2,
      escortCap: 5,
      sweepArc: 180,
      sweepTime: 2,
      vent: 2,
    },
  ], // proposta 12/11
  // It steers itself (the drift above); the phases only name the strategy.
  movementPhases: [{ strategy: 'linear' }, { strategy: 'linear' }],
};
