// A Sentinel (CONTENT.md "Boss"): the machine that still guards the lane
// into Prime's gate. A wide, flat-faced blockade hull behind a broad shield
// plate; it closes space, then runs you down. Its loop: BAR THE LANE (it
// stops; a line across the field through it, square to the ship, warns, then
// turns solid with one gap: touching it hurts and pushes back), CHARGE THE
// LANE (a strip toward the ship, then the dash along it), RECOVER (plate
// lowered, back turned: the damage window), a drift, again. The plate soaks
// hits on its front arc unless it is recovering. Below `phaseThresholds`:
// two charges in a row and a shorter barrier warning.
// Behavior: src/modules/enemies/types/SentinelGatekeeper.js; listed by
// src/data/enemies/boss.js (SENTINEL_KINDS). Seconds, field px, radians.
// Numbers: proposta 12/11 — the owner's play decides.
export default {
  id: 'gatekeeper',
  order: 8,
  tier: 'sentinel',
  displayName: 'Gatekeeper',
  subtitle: 'The lane is closed',
  layer: 5, // proposta 12/11: the layer it fights on (health scales by it)
  // 80 % of Warden Prime's health on the same layer (prime.js).
  healthFactor: 0.8, // proposta 12/11
  radius: 70, // proposta 12/11
  // XP on top of the type-wide boss drop, like Quarry Maw's: 100 + 500.
  rewards: { xp: 100 }, // proposta 12/11
  phaseThresholds: [0.5], // proposta 12/11
  phaseCount: 2,
  invulnerabilityDuration: 1, // proposta 12/11: s, at the phase change
  // Its entrance: heavy and short, the plate flung open (lowered), raised
  // when it stops. Fields explained in prime.js.
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
    flare: '#ffd166',
    shot: { tilt: [66, 64], turn: [-18, -4], distance: [640, 560], look: 0.45 },
  },
  turnRate: 0.9, // proposta 12/11: rad/s, drifting and barring (slow)
  aimTurnRate: 1.6, // proposta 12/11: rad/s, turning onto the marked strip
  shield: {
    halfArc: Math.PI / 3, // proposta 12/11: ±60° of its facing
    damageFactor: 0.2, // proposta 12/11: the raised plate lets 20 % through
    speed: 3, // proposta 12/11: raised (0..1) per s
  },
  barrier: {
    gapWidth: 140, // proposta 12/11: px
    gapOffset: 220, // proposta 12/11: px along the line from the ship's spot
    edgeMargin: 40, // proposta 12/11: px, the gap stays this far inside
    thickness: 14, // proposta 12/11: px, the solid line
    damageFactor: 0.4, // proposta 12/11: of contactDamage
    push: 260, // proposta 12/11: px/s away from the line (the ship thrusts 280)
    fade: 0.3, // proposta 12/11: s, it fades after its hold (harmless)
  },
  charge: {
    speed: 560, // proposta 12/11: px/s
    distance: 560, // proposta 12/11: px, unless the field edge comes first
  },
  // The cycle per phase: the drift (reposition), the barrier's warning and
  // hold, each strip's warning, charges in a row, the recovery.
  cycle: [
    {
      drift: 2.2,
      barrierWindup: 1.2,
      barrier: 4.5,
      laneWindup: 0.9,
      charges: 1,
      recover: 2.5,
    },
    {
      drift: 1.5,
      barrierWindup: 0.8,
      barrier: 4.5,
      laneWindup: 0.7,
      charges: 2,
      recover: 2.5,
    },
  ], // proposta 12/11
  movementPhases: [
    {
      strategy: 'seeking',
      acceleration: 70,
      maxSpeed: 45,
      safeDistance: 300,
      damping: 0.96,
      jitter: 0.02,
    },
    {
      strategy: 'seeking',
      acceleration: 90,
      maxSpeed: 60,
      safeDistance: 260,
      damping: 0.95,
      jitter: 0.02,
    },
  ], // proposta 12/11
};
