// A Warden: a dark core inside 8 plates. Phase 2 opens the shell (plates orbit
// as hazards) and inverts the XP pull; phase 3 sheds the plates and charges.
// Listed by src/data/enemies/boss.js. Numbers: proposta 18/10 — the owner's
// play decides.
export default {
  id: 'null',
  order: 3,
  displayName: 'Warden Null',
  subtitle: 'The silence at the center',
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
