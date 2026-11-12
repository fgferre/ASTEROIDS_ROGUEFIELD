// A Sentinel: the boss that ends a sector (a Warden ends a chapter). A mining
// machine of the old Ring that still eats stone: a heavy hull, two jaw plates
// round a furnace core. Its loop: INTAKE (a cone in front of the mouth, then
// the jaws open and pull: rocks in the cone are swallowed, the ship is drawn
// gently in, the open core takes full damage), EJECT (the jaws shut, it turns
// to the ship and spits what it ate as a fan of small rocks), a drift, again.
// Below `phaseThresholds` one phase change: a faster cycle, a wider fan.
// Behavior: src/modules/enemies/types/SentinelQuarryMaw.js; listed by
// src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px, radians.
// Numbers: proposta 12/11 — the owner's play decides.
export default {
  id: 'quarry-maw',
  order: 7,
  tier: 'sentinel',
  displayName: 'Quarry Maw',
  subtitle: 'It still eats stone',
  layer: 5, // proposta 12/11: the layer it fights on (health scales by it)
  // 70 % of Warden Prime's health on the same layer (prime.js).
  healthFactor: 0.7, // proposta 12/11
  radius: 66, // proposta 12/11
  // XP on top of the type-wide boss drop (RewardManager, the same for every
  // boss): 100 + 500 = 600, 60 % of a Warden's 500 + 500.
  rewards: { xp: 100 }, // proposta 12/11
  phaseThresholds: [0.5], // proposta 12/11
  phaseCount: 2,
  invulnerabilityDuration: 1, // proposta 12/11: s, at the phase change
  // Its entrance: heavy and short, jaws flung open, they slam shut when it
  // stops. Fields explained in prime.js.
  arrival: {
    start: 160,
    motion: 'heavy',
    curve: 0,
    travel: 0.7, // proposta 12/11
    close: 0.2, // proposta 12/11
    open: 1,
    spin: 0,
    world: 0.3,
    recover: 0.4,
    flare: '#ffb347',
    shot: { tilt: [66, 64], turn: [-18, -4], distance: [640, 560], look: 0.45 },
  },
  turnRate: 1.1, // proposta 12/11: rad/s, drifting and announcing the intake
  ejectTurnRate: 1.8, // proposta 12/11: rad/s, turning to spit
  jawSpeed: 3.5, // proposta 12/11: open (0..1) per s
  closedDamageFactor: 0.3, // proposta 12/11: shut plates soak 70 %
  cone: { arc: 1.0, range: 340 }, // proposta 12/11: the intake's wedge
  rockPullAcceleration: 420, // proposta 12/11: px/s², rocks in the cone
  rockPullMaxSpeed: 240, // proposta 12/11
  swallowReach: 24, // proposta 12/11: px past the mouth a rock is eaten
  shipPullAcceleration: 90, // proposta 12/11: px/s²; the ship thrusts 280
  mouthReach: 34, // proposta 12/11: px round the open mouth that hurt
  mouthDamageFactor: 0.6, // proposta 12/11: of contactDamage
  eject: { min: 3, max: 8, speed: 170, size: 'small' }, // proposta 12/11
  // The cycle per phase: drift (recovery), the intake's warning and pull,
  // the eject's warning; the fan's arc.
  cycle: [
    { drift: 2.4, intakeWindup: 1.2, intake: 3, ejectWindup: 0.9, fanArc: 0.8 },
    {
      drift: 1.4,
      intakeWindup: 1.0,
      intake: 2.6,
      ejectWindup: 0.7,
      fanArc: 1.3,
    },
  ], // proposta 12/11
  movementPhases: [
    {
      strategy: 'seeking',
      acceleration: 60,
      maxSpeed: 40,
      safeDistance: 280,
      damping: 0.96,
      jitter: 0.03,
    },
    {
      strategy: 'seeking',
      acceleration: 80,
      maxSpeed: 55,
      safeDistance: 240,
      damping: 0.95,
      jitter: 0.03,
    },
  ], // proposta 12/11
};
