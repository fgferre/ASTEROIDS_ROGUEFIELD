// src/data/constants/visual.js

const deepFreeze = (obj) => {
  Object.values(obj).forEach((value) => {
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
};

// === ENEMY TYPES ===
export const ENEMY_TYPES = deepFreeze({
  drone: Object.freeze({
    key: 'drone', // Unique identifier consumed by factories and pools
    displayName: 'Assault Drone', // Human-readable label used in UI/debug output
    radius: 12, // Collision radius in world units (pixels)
    health: 30, // Base hit points before modifiers or scaling
    speed: 180, // Maximum travel speed in units per second
    acceleration: 260, // Acceleration applied when chasing the player
    fireRate: 2.0, // Seconds between shots before variance is applied
    fireVariance: 0.35, // +/- randomness added to fireRate for staggering
    fireSpread: 0.06, // Radians of random aim offset per projectile
    projectileSpeed: 340, // Units per second for drone bullets
    projectileDamage: 15, // Damage dealt by each projectile impact
    projectileLifetime: 2.0, // Seconds before projectile despawns (controls effective range)
    targetingRange: 460, // Maximum distance to acquire the player as a target
    contactDamage: 12, // Damage inflicted on direct collision with the player
  }),
  mine: Object.freeze({
    key: 'mine', // Identifier used when spawning or pooling mines
    displayName: 'Proximity Mine', // Label shown in logs, HUD and analytics
    radius: 18, // Collision radius while idle/armed
    health: 20, // Base durability before detonation
    lifetime: 30, // Seconds before automatic detonation if untouched
    armTime: 0.5, // Seconds after spawn before the mine can trigger
    proximityRadius: 80, // Distance that arms detonation when the player enters
    explosionRadius: 120, // Area-of-effect radius applied on detonation
    explosionDamage: 40, // Damage dealt to targets inside explosionRadius
    pulseSpeed: 2.6, // Radians per second driving the pulse animation cycle
    pulseAmount: 0.32, // Scale multiplier applied during pulsing visuals
  }),
  hunter: Object.freeze({
    key: 'hunter', // Identifier for hunter frigates in factories and pools
    displayName: 'Hunter Frigate', // Friendly name for UI and telemetry
    radius: 16, // Collision radius used for physics checks
    health: 48, // Base health pool before modifiers
    speed: 120, // Maximum orbit speed while circling the player
    acceleration: 220, // Acceleration applied when correcting orbit path
    preferredDistance: 175, // Ideal distance maintained from the player
    projectileSpeed: 420, // Units per second for hunter projectiles
    projectileDamage: 12, // Damage per projectile fired by the hunter
    projectileLifetime: 1.5, // Seconds before projectile despawns (controls effective range)
    fireRange: 520, // Maximum distance to start burst firing
    burstCount: 3, // Number of shots emitted per firing burst
    burstInterval: 3.5, // Seconds between consecutive bursts
    burstDelay: 0.15, // Delay between shots inside a burst
    fireSpread: 0.045, // Radians of random aim offset within a burst
  }),
});


// === ENEMY REWARDS ===
export const ENEMY_REWARDS = deepFreeze({
  asteroid: Object.freeze({
    heartDrop: Object.freeze({
      bySize: Object.freeze({
        large: 0.05,
        medium: 0.02,
        small: 0,
      }),
      variantBonus: 0.03,
      specialVariants: Object.freeze(['gold', 'crystal', 'volatile', 'parasite']),
    }),
  }),
  drone: Object.freeze({
    baseOrbs: 2,
    totalXP: 30,
    healthHeartChance: 0.0,
  }),
  mine: Object.freeze({
    baseOrbsMin: 1,
    baseOrbsMax: 2,
    totalXP: 25,
    healthHeartChance: 0.0,
  }),
  hunter: Object.freeze({
    baseOrbs: 3,
    totalXP: 50,
    healthHeartChance: 0.03,
  }),
  boss: Object.freeze({
    baseOrbs: 10,
    totalXP: 500,
    healthHeartChance: 0.25,
  }),
});


// === ENEMY EFFECT COLORS ===
export const ENEMY_EFFECT_COLORS = deepFreeze({
  drone: Object.freeze({
    body: '#5B6B7A',
    bodyHighlight: '#7C8D9C',
    bodyShadow: '#2F3842',
    accent: '#A6E8FF',
    accentGlow: 'rgba(120, 235, 255, 0.45)',
    muzzle: '#7AD7FF',
    muzzleAccent: '#C9F1FF',
    exhaust: 'rgba(110, 200, 255, 0.45)',
    flash: 'rgba(150, 220, 255, 0.35)',
    explosionCore: 'rgba(120, 205, 255, 0.45)',
    explosionSpark: '#E1F6FF',
    explosionSmoke: 'rgba(40, 80, 120, 0.35)',
  }),
  hunter: Object.freeze({
    body: '#64687A',
    bodyHighlight: '#8F94AA',
    bodyShadow: '#2C2F3B',
    accent: '#F4B1FF',
    turret: '#B7A7D9',
    glow: 'rgba(255, 134, 232, 0.35)',
    muzzle: '#FF86E8',
    muzzleAccent: '#FFD6FF',
    burstTrail: '#BE9CFF',
    flash: 'rgba(255, 200, 255, 0.38)',
    explosionCore: 'rgba(250, 150, 255, 0.5)',
    explosionSpark: '#FFE8FF',
    explosionSmoke: 'rgba(70, 30, 110, 0.35)',
  }),
  mine: Object.freeze({
    body: '#5A5046',
    bodyHighlight: '#8E7B68',
    bodyShadow: '#2C2621',
    halo: 'rgba(255, 196, 128, 0.25)',
    core: '#FF9348',
    sparks: '#FFD27F',
    debris: '#7A3B16',
    smoke: 'rgba(90, 40, 20, 0.45)',
    flash: 'rgba(255, 190, 110, 0.4)',
    shockwave: 'rgba(255, 160, 70, 0.35)',
  }),
  boss: Object.freeze({
    core: '#FF6B9C',
    accent: '#F9C74F',
    flash: 'rgba(255, 220, 240, 0.55)',
    smoke: 'rgba(60, 20, 60, 0.35)',
  }),
});


// === ENEMY RENDER PRESETS ===
export const ENEMY_RENDER_PRESETS = deepFreeze({
  drone: Object.freeze({
    hull: Object.freeze({
      noseLengthMultiplier: 1.6,
      tailLengthMultiplier: 1.05,
      halfWidthMultiplier: 0.9,
      innerScale: 0.58,
      strokeWidthMultiplier: 0.12,
      accentStrokeMultiplier: 0.08,
    }),
    fins: Object.freeze({
      lengthMultiplier: 0.9,
      widthMultiplier: 0.35,
      offsetMultiplier: 0.55,
      taperMultiplier: 0.6,
    }),
    accents: Object.freeze({
      ridgeForwardScale: 0.7,
      ridgeTailScale: 0.85,
      ridgeHalfWidthScale: 0.45,
      glowRadiusMultiplier: 0.6,
      glowAlpha: 0.45,
    }),
    exhaust: Object.freeze({
      offsetMultiplier: 0.5,
      lengthMultiplier: 1.55,
      widthMultiplier: 1.05,
      blurBase: 6,
      blurRange: 26,
      alphaMin: 0.28,
      alphaMax: 0.72,
      smoothing: 0.2,
    }),
  }),
  mine: Object.freeze({
    body: Object.freeze({
      coreRadiusMultiplier: 1,
      rimWidthMultiplier: 0.16,
      highlightInsetMultiplier: 0.46,
      rimAlphaRange: Object.freeze([0.55, 0.95]),
      highlightAlpha: 0.85,
    }),
    glow: Object.freeze({
      blurBase: 10,
      blurRange: 24,
      haloRadiusMultiplier: 1.45,
      haloAlpha: 0.32,
      haloPulseExponent: 1.4,
      armedIntensityMultiplier: 1.45,
      armedAlphaBoost: 0.18,
      haloLineWidthMultiplier: 0.08,
    }),
  }),
  hunter: Object.freeze({
    hull: Object.freeze({
      lengthMultiplier: 1.9,
      widthMultiplier: 1.2,
      accentInsetMultiplier: 0.48,
      strokeWidthMultiplier: 0.14,
      accentStrokeMultiplier: 0.1,
      tailLengthRatio: 0.72,
      sideHalfWidthMultiplier: 0.85,
    }),
    turret: Object.freeze({
      lengthMultiplier: 1.25,
      widthMultiplier: 0.28,
      baseRadiusMultiplier: 0.34,
      barrelWidthMultiplier: 0.18,
      baseBacksetMultiplier: 0.5,
      highlight: Object.freeze({
        lengthRatio: 0.7,
        widthRatio: 0.6,
        backsetRatio: 0.2,
        heightRatio: 0.4,
        alpha: 0.45,
      }),
    }),
    shading: Object.freeze({
      shadowStop: 0.12,
      midStop: 0.48,
      highlightStop: 0.88,
    }),
  }),
});


// === BOSS CONFIGURATION ===
export const BOSS_CONFIG = deepFreeze({
  key: 'boss',
  displayName: 'Apex Overlord',
  radius: 60,
  safeDistance: 240,
  entryPadding: 24,
  entryDriftSpeed: 85,
  health: 1500,
  healthScaling: 1.2,
  speed: 60,
  acceleration: 120,
  contactDamage: 45,
  projectileDamage: 35,
  spreadProjectileCount: 7,
  spreadProjectileSpeed: 260,
  spreadInterval: 2.4,
  spreadVariance: 0.45,
  spreadArc: 0.85,
  spreadAngleVariance: 0.12,
  volleyBurstSize: 5,
  volleyShotDelay: 0.16,
  volleyInterval: 1.35,
  volleyVariance: 0.2,
  volleyProjectileSpeed: 320,
  volleySpread: 0.12,
  minionTypes: ['drone', 'hunter'],
  spawnInterval: 6.5,
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
});


// === BOSS PHYSICS ===
export const BOSS_PHYSICS_CONFIG = deepFreeze({
  spatialPadding: 24,
  collisionPadding: 18,
  contactKnockback: 140,
  contactCooldownMs: 140,
  chargeKnockback: 520,
  chargeBossSlow: 320,
  chargeDamageBonus: 18,
  chargeCooldownMs: 260,
  areaDamage: 48,
  areaForce: 360,
  areaRadiusMultiplier: 2.35,
  contactShake: Object.freeze({ intensity: 10, duration: 0.35 }),
  chargeShake: Object.freeze({ intensity: 16, duration: 0.6 }),
  areaShake: Object.freeze({ intensity: 12, duration: 0.45 }),
});


// === BOSS EFFECTS PRESETS ===
export const BOSS_EFFECTS_PRESETS = deepFreeze({
  entrance: Object.freeze({
    swirl: Object.freeze({
      count: 48,
      innerRadius: 42,
      outerRadius: 120,
      speed: Object.freeze({ min: 80, max: 150 }),
      size: Object.freeze({ min: 2.2, max: 3.4 }),
      life: Object.freeze({ min: 0.5, max: 0.8 }),
    }),
    burst: Object.freeze({
      rings: 2,
      particlesPerRing: 22,
      radiusStep: 44,
      speed: Object.freeze({ min: 140, max: 220 }),
      size: Object.freeze({ min: 2.8, max: 4.2 }),
      life: Object.freeze({ min: 0.45, max: 0.75 }),
    }),
    dust: Object.freeze({
      count: 28,
      speed: Object.freeze({ min: 40, max: 90 }),
      size: Object.freeze({ min: 3.2, max: 5.2 }),
      life: Object.freeze({ min: 0.8, max: 1.4 }),
    }),
    colors: Object.freeze({
      core: '#ff6b9c',
      accent: '#ffe066',
      trail: '#ff9f1c',
      smoke: 'rgba(255, 255, 255, 0.24)',
      flash: 'rgba(255, 160, 220, 0.45)',
    }),
    shockwave: Object.freeze({
      radius: 420,
      duration: 0.75,
      baseWidth: 34,
      maxAlpha: 0.7,
      shadowColor: 'rgba(255, 120, 200, 0.45)',
      shadowBlur: 45,
      fillColor: 'rgba(255, 120, 200, 0.12)',
      widthFade: 0.7,
      easingPower: 1.3,
    }),
    screenFlash: Object.freeze({
      color: 'rgba(255, 140, 220, 0.4)',
      duration: 0.45,
      intensity: 0.32,
    }),
    freezeFrame: Object.freeze({ duration: 0.18, fade: 0.2 }),
    slowMotion: Object.freeze({ scale: 0.55, hold: 0.18, duration: 0.65 }),
  }),
  phaseTransition: Object.freeze({
    burst: Object.freeze({
      count: 48,
      speed: Object.freeze({ min: 160, max: 280 }),
      size: Object.freeze({ min: 2.2, max: 3.4 }),
      life: Object.freeze({ min: 0.35, max: 0.65 }),
    }),
    petals: Object.freeze({
      count: 16,
      radius: 110,
      angularJitter: 0.3,
      speed: Object.freeze({ min: 60, max: 120 }),
      size: Object.freeze({ min: 2.6, max: 3.6 }),
      life: Object.freeze({ min: 0.4, max: 0.75 }),
    }),
    embers: Object.freeze({
      count: 24,
      speed: Object.freeze({ min: 35, max: 70 }),
      size: Object.freeze({ min: 2.4, max: 3.4 }),
      life: Object.freeze({ min: 1.1, max: 1.6 }),
    }),
    colors: Object.freeze({
      core: '#ffd166',
      accent: '#5cc8ff',
      smoke: 'rgba(255, 255, 255, 0.28)',
      flash: 'rgba(255, 255, 255, 0.6)',
    }),
    shockwave: Object.freeze({
      radius: 360,
      duration: 0.6,
      baseWidth: 26,
      maxAlpha: 0.65,
      shadowColor: 'rgba(255, 255, 255, 0.45)',
      shadowBlur: 35,
      fillColor: 'rgba(255, 255, 255, 0.12)',
      widthFade: 0.65,
      easingPower: 1.4,
    }),
    screenFlash: Object.freeze({
      color: 'rgba(255, 255, 255, 0.55)',
      duration: 0.36,
      intensity: 0.28,
    }),
    freezeFrame: Object.freeze({ duration: 0.3, fade: 0.25 }),
    slowMotion: Object.freeze({ scale: 0.6, hold: 0.16, duration: 0.6 }),
  }),
  defeated: Object.freeze({
    debris: Object.freeze({
      count: 60,
      speed: Object.freeze({ min: 180, max: 320 }),
      size: Object.freeze({ min: 2.8, max: 4.6 }),
      life: Object.freeze({ min: 0.9, max: 1.4 }),
    }),
    sparks: Object.freeze({
      count: 90,
      speed: Object.freeze({ min: 260, max: 400 }),
      size: Object.freeze({ min: 2.4, max: 3.8 }),
      life: Object.freeze({ min: 0.5, max: 0.85 }),
    }),
    embers: Object.freeze({
      count: 32,
      speed: Object.freeze({ min: 30, max: 60 }),
      size: Object.freeze({ min: 3.2, max: 4.4 }),
      life: Object.freeze({ min: 1.5, max: 2.2 }),
    }),
    smoke: Object.freeze({
      count: 26,
      speed: Object.freeze({ min: 20, max: 55 }),
      size: Object.freeze({ min: 18, max: 26 }),
      life: Object.freeze({ min: 1.6, max: 2.8 }),
    }),
    colors: Object.freeze({
      core: '#ff6b9c',
      accent: '#ffe066',
      flash: '#ffffff',
      smoke: 'rgba(240, 240, 255, 0.25)',
    }),
    shockwave: Object.freeze({
      radius: 520,
      duration: 0.95,
      baseWidth: 42,
      maxAlpha: 0.8,
      shadowColor: 'rgba(255, 255, 255, 0.5)',
      shadowBlur: 50,
      fillColor: 'rgba(255, 255, 255, 0.18)',
      widthFade: 0.7,
      easingPower: 1.2,
    }),
    secondaryShockwave: Object.freeze({
      radius: 360,
      duration: 0.7,
      baseWidth: 22,
      maxAlpha: 0.55,
      fillColor: 'rgba(255, 170, 220, 0.18)',
      widthFade: 0.6,
      easingPower: 1.6,
    }),
    screenFlash: Object.freeze({
      color: 'rgba(255, 255, 255, 0.7)',
      duration: 0.6,
      intensity: 0.5,
    }),
    freezeFrame: Object.freeze({ duration: 0.5, fade: 0.35 }),
    slowMotion: Object.freeze({ scale: 0.38, hold: 0.32, duration: 1.1 }),
  }),
});

// === BOSS SCREEN SHAKES ===
export const BOSS_SCREEN_SHAKES = Object.freeze({
  spawn: Object.freeze({ intensity: 18, duration: 0.65, preset: 'bossSpawn' }),
  phaseChange: Object.freeze({
    intensity: 14,
    duration: 0.5,
    preset: 'bossPhaseChange',
  }),
  defeated: Object.freeze({ intensity: 24, duration: 0.85, preset: 'bossDefeated' }),
});
