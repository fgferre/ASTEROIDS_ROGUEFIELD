// A Warden: three cores orbiting a shared centre; one sings (lit, vulnerable,
// fires) and the voice passes every `singDuration` s. Each phase breaks one
// core. Listed by src/data/enemies/boss.js. Numbers: proposta 18/10 — the
// owner's play decides.
export default {
  id: 'choir',
  order: 2,
  displayName: 'Warden Choir',
  subtitle: 'Three voices of the Ring',
  healthFactor: 1.7, // proposta 20/10: explained in prime.js
  // Its entrance, the choir gathers: a curve in, spinning, the three cores
  // far apart (each lights the edge as it crosses), then they draw in. The
  // fields are explained in prime.js. Numbers: proposta 19/10.
  arrival: {
    start: 200,
    motion: 'glide',
    curve: 150,
    travel: 1.3,
    close: 0.35,
    open: 1,
    spin: 4,
    world: 0.25,
    recover: 0.5,
    flare: '#f9c74f',
    shot: { tilt: [60, 64], turn: [-45, 5], distance: [920, 780], look: 0.5 },
  },
  radius: 118, // covers the cores: orbit + core radius
  coreCount: 3,
  coreOrbitRadius: 90,
  coreRadius: 28,
  orbitSpeed: 0.35, // rad/s
  orbitSpeedPerLostCore: 0.35, // rad/s added per broken core
  singDuration: 6,
  dimDamageFactor: 0.25,
  spreadProjectileCount: 5,
  spreadArc: 0.6,
  spreadCooldown: 2.2,
  spreadVariance: 0.3,
  spreadWindup: 0.45,
  chorusInterval: 10,
  chorusWindup: 1.1,
  chorusShots: 3,
  chorusSpread: 0.07,
  chorusProjectileSpeed: 300,
  movementPhases: [
    {
      strategy: 'seeking',
      acceleration: 70,
      maxSpeed: 40,
      safeDistance: 300,
      damping: 0.96,
    },
    {
      strategy: 'seeking',
      acceleration: 80,
      maxSpeed: 50,
      safeDistance: 280,
      damping: 0.96,
    },
    {
      strategy: 'seeking',
      acceleration: 90,
      maxSpeed: 60,
      safeDistance: 260,
      damping: 0.96,
    },
  ],
};
