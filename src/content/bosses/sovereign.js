// The campaign's last boss (docs/ROTEIRO.md "Final — The Crucible"): the
// machine at the Ring's centre that executes two orders that cannot both be
// obeyed, PROTECT and REBUILD; the fight is reading which one it obeys. A
// faceted core inside a ring of armour plates. PROTECT (cool): the plates
// shut and turn, it soaks most of every hit, and a wall through its centre
// sweeps the field with one gap (the Gatekeeper's barrier, turning); from the
// second phase lanes of shots fire at the ship as well. REBUILD (warm): the
// plates open and the core is exposed (full damage); a cone draws rocks and
// the ship in (the Quarry Maw's pull) while it assembles escorts, and enough
// damage during the assembly scraps it (the Foundry Mother's), leaving it
// reeling and open. Third phase, "the orders do not agree": both at once,
// split by a turning line through it; hits from the REBUILD half land in
// full, from the PROTECT half they are soaked, and the PROTECT half carries
// a wall and the lanes; every assembly, done or scrapped, the two halves
// trade places after a warning, so the open side has to be chased round it. It ends the Crucible, the campaign's tenth sector,
// asked for by kind like a Sentinel but ranked above the Wardens (`tier`).
// Behavior: src/modules/enemies/types/Sovereign.js; listed by
// src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px, radians.
// Numbers: proposta 12/11 — the owner's play decides.
export default {
  id: 'sovereign',
  order: 13,
  tier: 'sovereign',
  displayName: 'SOVEREIGN',
  subtitle: 'CONTINUANCE',
  layer: 20, // proposta 12/11: the layer it fights on (health scales by it)
  // × Prime's base on layer 20 (prime.js): 23k, about Warden Null's on
  // its own layer 15 (Null: 1.35 × the base there); shut half the time, it
  // soaks far more. Measured on the bot, the boss fight alone: at 0.4 it
  // never died; at 0.55 it lost 4 of 7; at 0.48 it won 4 of 4 in 183-213 s,
  // the average one once with 6 hull left.
  healthFactor: 0.48, // proposta 12/11
  radius: 84, // proposta 12/11
  // XP on top of the type-wide boss drop, like the Sentinels'.
  rewards: { xp: 300 }, // proposta 12/11
  // proposta 12/11: the last phase is the longest stretch of its health
  phaseThresholds: [0.7, 0.4],
  phaseCount: 3,
  invulnerabilityDuration: 1.5, // proposta 12/11: s, at each phase change
  // Its entrance: slow and heavy, every plate flung open, shut as it stops.
  // Fields explained in prime.js.
  arrival: {
    start: 180,
    motion: 'heavy',
    curve: 0,
    travel: 1.2, // proposta 12/11
    close: 0.35, // proposta 12/11
    open: 1,
    spin: 1.2,
    world: 0.25,
    recover: 0.5,
    flare: '#fff3d6',
    shot: { tilt: [72, 68], turn: [10, 0], distance: [620, 520], look: 0.55 },
  },
  plateSpeed: 2.5, // proposta 12/11: plateOpen (0..1) per s
  // proposta 12/11: rad/s the plate ring turns, shut (PROTECT) and open
  plateSpin: { protect: 0.9, rebuild: 0.15 },
  protectDamageFactor: 0.15, // proposta 12/11: shut, 15 % gets through
  // Its escorts, from the minion types the field has (BossWave's filter).
  minionTypes: ['drone', 'hunter'],
  // The PROTECT wall: a line through its centre, its gap `gapRadius` px out
  // on the half that reaches the ship first; it warns still, then turns
  // `cycle.sweep` rad/s, starting `lead` rad short of the ship.
  barrier: {
    gapWidth: 170, // proposta 12/11: px
    gapRadius: 220, // proposta 12/11: px from its centre
    lead: 0.9, // proposta 12/11: rad
    thickness: 14, // proposta 12/11: px, like the Gatekeeper's
    // proposta 12/11: softer than the Gatekeeper's (0.4, 260): a turning
    // wall meets the ship more than once
    damageFactor: 0.3, // of contactDamage
    push: 200, // px/s away from the line (the ship thrusts 280)
    fade: 0.3, // proposta 12/11: s
  },
  // A lane volley: `count` lines from the core, `spread` rad apart, round
  // the ship's bearing; they warn, then `shots` shots run down each.
  lanes: {
    count: 3, // proposta 12/11
    warn: 0.9, // proposta 12/11: s
    length: 520, // proposta 12/11: px, the warning lines
    spread: 0.34, // proposta 12/11: rad
    shots: 3, // proposta 12/11
    shotGap: 0.12, // proposta 12/11: s
    speed: 330, // proposta 12/11: px/s
    damageFactor: 0.6, // proposta 12/11: of projectileDamage
  },
  // The REBUILD pull: rocks in the cone (or, third phase, in the REBUILD
  // half within `split.range`) are dragged in and absorbed at the hull; each
  // adds `rockWorth` to the assembly.
  pull: {
    turnRate: 0.6, // proposta 12/11: rad/s, the cone following the ship
    // proposta 12/11: slower than the Maw's (420, 240): the cone faces the
    // ship, so what it drags in passes the ship
    rockAcceleration: 260, // px/s²
    rockMaxSpeed: 150, // px/s
    absorbReach: 28, // proposta 12/11: px past its hull
    rockWorth: 0.05, // proposta 12/11: of a whole assembly
  },
  scrapShare: 0.035, // proposta 12/11: of max health, lost in one assembly
  stagger: 3, // proposta 12/11: s it reels, open, after a scrap
  drift: {
    acceleration: 60, // proposta 12/11: px/s², toward mid-field
    maxSpeed: 45, // proposta 12/11: px/s
    arrive: 80, // proposta 12/11: px, it slows inside this of the centre
  },
  // The orders per phase (first, second): PROTECT's warning and hold, the
  // wall's turn and the lane volleys in the hold; REBUILD's warning and
  // assembly, the cone, the ship's pull (px/s²; the ship thrusts 280) and
  // its escorts alive at most.
  cycle: [
    {
      protectWindup: 1.2,
      protect: 4,
      sweep: 0.2,
      volleys: 1,
      rebuildWindup: 1.2,
      build: 6,
      arc: 1.2,
      range: 380,
      shipPull: 90,
      escortCap: 2,
    },
    {
      protectWindup: 1.0,
      protect: 4.5,
      sweep: 0.26,
      volleys: 3,
      rebuildWindup: 0.9,
      build: 5,
      arc: 1.6,
      range: 420,
      shipPull: 170,
      escortCap: 3,
    },
  ], // proposta 12/11
  // Third phase: the split line turns `spin` rad/s; the PROTECT half fires a
  // lane volley every `volleyEvery` s and carries a wall along its middle;
  // the REBUILD half pulls (`shipPull`, `range`) and assembles (`build` s).
  // An assembly done, or scrapped by `scrapShare` of its max health lost in
  // it, trades the halves: `flipWindup` s of warning, then a lane volley
  // `flipVolley` s after the turn.
  split: {
    windup: 1.5,
    spin: 0.44,
    volleyEvery: 2.3,
    range: 420,
    shipPull: 160,
    build: 6,
    escortCap: 3,
    scrapShare: 0.05,
    flipWindup: 1.4,
    flipVolley: 0.8,
  }, // proposta 12/11
  // It steers itself (the drift above); the phases only name the strategy.
  movementPhases: [
    { strategy: 'linear' },
    { strategy: 'linear' },
    { strategy: 'linear' },
  ],
};
