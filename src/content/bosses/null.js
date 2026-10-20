// A Warden: a dark core inside 8 plates. Phase 2 opens the shell (plates orbit
// as hazards) and inverts the XP pull; phase 3 sheds the plates and charges.
// Listed by src/data/enemies/boss.js. Numbers: proposta 18/10 — the owner's
// play decides.
export default {
  id: 'null',
  order: 3,
  displayName: 'Warden Null',
  subtitle: 'The silence at the center',
  // Its entrance, the weight: slow and heavy with its plates spread wide,
  // and they shut at once when it stops. The camera hugs the field. The
  // fields are explained in prime.js. Numbers: proposta 19/10.
  arrival: {
    start: 160,
    motion: 'heavy',
    curve: 0,
    travel: 1.3,
    close: 0.2,
    open: 1,
    spin: 1.5,
    world: 0.25,
    recover: 0.5,
    flare: '#b48cff',
    shot: { tilt: [76, 70], turn: [12, 0], distance: [560, 440], look: 0.6 },
  },
  radius: 70,
  plateCount: 8,
  plateRadius: 16,
  shellSpin: 0.6, // rad/s, closed
  openSpin: 1.1, // rad/s, open
  openOrbitRadius: 150,
  openDuration: 1.2, // s for the shell to spread
  plateDamageFactor: 0.6, // of contactDamage
  pullInterval: 12,
  firstPullDelay: 2, // s after the shell opens
  pullWindup: 1.0,
  pullDuration: 3,
  pullSpeed: 260,
  pullAcceleration: 120,
  chargeCooldown: 5.5,
  chargeWindup: 0.8,
  chargeProjectileCount: 8,
  openChargeCooldown: 7,
  // phase 3: windup + dash + recover + cooldown = finaleChargeCadence
  finaleChargeCadence: 4,
  finaleChargeWindup: 0.5,
  finaleChargeDuration: 0.9,
  finaleChargeRecovery: 0.6,
  movementPhases: [
    {
      strategy: 'seeking',
      acceleration: 80,
      maxSpeed: 45,
      safeDistance: 300,
      damping: 0.96,
    },
    {
      strategy: 'orbit',
      acceleration: 200,
      maxSpeed: 90,
      preferredDistance: 240,
    },
    {
      strategy: 'seeking',
      acceleration: 140,
      maxSpeed: 80,
      safeDistance: 200,
      damping: 0.95,
    },
  ],
};
