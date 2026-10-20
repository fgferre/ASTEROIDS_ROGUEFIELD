// A Warden: the first one, on layer 5 (BOSS_BY_LAYER). `displayName` and
// `subtitle` are its WARDEN_KINDS entry; `config` and `components` are the
// base every Warden is built from (choir and null override part of it).
// Listed by src/data/enemies/boss.js. Numbers: proposta 18/10 — the owner's
// play decides.
export default {
  id: 'prime',
  order: 1,
  displayName: 'Warden Prime',
  subtitle: 'Guardian of the Ring',
  // Its health is config.health × healthScaling per layer past the first ×
  // this, the same whatever cards the run owns: aimed at a 60-90 s fight on
  // its layer. Numbers: proposta 20/10 — the owner's play decides.
  healthFactor: 1.15, // proposta 20/10
  // Its entrance, the charge: straight in and fast with its ring flung open,
  // a hard stop inside the field, the ring slams shut. Every Warden has one
  // (CONTENT.md "Boss"; modules/enemies/boss/arrival.js). Seconds are on
  // screen. Numbers: proposta 19/10 — the owner's play decides.
  arrival: {
    start: 200, // born this far past the edge, beyond its radius
    motion: 'brake', // 'brake' fast then a hard stop, 'glide', 'heavy'
    curve: 0, // the path's sideways bow (0: a straight line)
    travel: 0.9, // from past the edge to where its fight starts
    close: 0.25, // closing up; the fight starts after it
    open: 1, // how open its pieces fly (0 shut .. 1 as open as it opens)
    spin: 0, // extra spin of its pieces while open, rad/s
    world: 0.25, // the world's speed meanwhile
    recover: 0.5, // back to full speed after it closes
    flare: '#ff6b6b', // the edge lights up in this colour where it crosses
    // The live camera, low and moving, from inside the field toward the edge
    // it comes through; each pair goes from the first value to the second
    // over the entrance: tilt from straight down and turn about the edge's
    // facing (degrees), distance (field units) from the point it looks at,
    // which is `look` of the way from its spot to the Warden.
    shot: { tilt: [62, 66], turn: [-28, -8], distance: [760, 620], look: 0.4 },
  },
  config: {
    key: 'boss',
    displayName: 'Warden Prime',
    radius: 60,
    safeDistance: 240,
    entryPadding: 24,
    health: 1500,
    healthScaling: 1.2,
    acceleration: 120,
    contactDamage: 45,
    projectileDamage: 35,
    spreadProjectileCount: 7,
    spreadProjectileSpeed: 260,
    spreadCooldown: 2.4,
    spreadVariance: 0.45,
    spreadArc: 0.85,
    spreadAngleVariance: 0.12,
    volleyBurstSize: 5,
    volleyShotDelay: 0.16,
    volleyCooldown: 1.35,
    volleyVariance: 0.2,
    volleyProjectileSpeed: 320,
    volleySpread: 0.12,
    minionTypes: ['drone', 'hunter'],
    spawnCooldown: 6.5,
    spawnVariance: 1.1,
    chargeCooldown: 6.2,
    chargeDuration: 1.1,
    chargeRecovery: 1.4,
    chargeSpeedMultiplier: 3.1,
    chargeProjectileCount: 10,
    chargeProjectileSpeed: 420,
    chargeProjectileVariance: 0.08,
    chargeAimVariance: 0.18,
    phaseThresholds: [0.66, 0.33],
    phaseCount: 3,
    invulnerabilityDuration: 2.0,
    rewards: Object.freeze({
      xp: 500,
      lootTable: Object.freeze(['core-upgrade', 'weapon-blueprint']),
    }),
    phaseColors: Object.freeze(['#ff6b6b', '#f9c74f', '#4d96ff']),
  },
  components: {
    movement: {
      strategy: 'seeking',
      acceleration: 120,
      maxSpeed: 60,
      safeDistance: 240,
      damping: 0.95,
    },
    movementPhases: [
      {
        strategy: 'seeking',
        acceleration: 80,
        maxSpeed: 45,
        safeDistance: 320,
        damping: 0.96,
        jitter: 0.05,
      },
      {
        strategy: 'orbit',
        acceleration: 240,
        maxSpeed: 120,
        preferredDistance: 180,
      },
      {
        strategy: 'parasite',
        acceleration: 280,
        maxSpeed: 160,
        minDistance: 90,
      },
    ],
    collision: {
      shape: 'circle',
      radius: 60,
      response: 'damage',
      contactDamage: 45,
    },
    health: {
      base: 1500,
      armor: 0,
      scaling: 1.2,
      phaseThresholds: [0.66, 0.33],
      invulnerabilityDuration: 2.0,
    },
  },
};
