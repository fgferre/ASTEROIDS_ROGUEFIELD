// src/data/constants/gameplay.js

const deepFreeze = (obj) => {
  Object.values(obj).forEach((value) => {
    if (value && typeof value === 'object') {
      deepFreeze(value);
    }
  });
  return Object.freeze(obj);
};

// === BULLETS & COLLISION ===
export const BULLET_SPEED = 450;
export const COLLISION_BOUNCE = 0.6;

// === MAGNETISM ===
export const MAGNETISM_RADIUS = 70;
export const MAGNETISM_FORCE = 120;
export const ENHANCED_SHIP_MAGNETISM_FORCE = 300;
export const ORB_MAGNETISM_RADIUS = 35;
export const ORB_MAGNETISM_FORCE = 150;
export const MIN_ORB_DISTANCE = 18;
export const CLUSTER_FUSION_COUNT = 10;

// === XP ORBS ===
export const XP_ORB_BASE_VALUE = 5;
export const XP_ORB_MAX_PER_CLASS = 100;
export const XP_ORB_FUSION_CHECK_INTERVAL = 0.3;
export const XP_ORB_FUSION_ANIMATION_DURATION = 0.82;
export const XP_ORB_MAGNETISM_BOOST = 2.2;
export const XP_ORB_COLLECTION_RADIUS_PADDING = 0.1;
export const XP_ORB_CLUSTER_CONFIG = deepFreeze({
  radiusMultiplier: 1.55,
  minRadius: 52,
  forceMultiplier: 2.4,
  detectionRadiusFactor: 0.85,
  detectionMinRadius: 48,
  comfortableSpacingFactor: 1.12,
  idealSpacingFactor: 0.95,
  denseSpacingFactor: 0.75,
  comfortableForceBase: 0.5,
  comfortableForceCloseness: 1.5,
  comfortableForceOffset: 30,
  comfortableStepClamp: 0.9,
  comfortableMovementFactor: 0.5,
  idealForceBase: 0.3,
  idealForceCloseness: 1.1,
  idealForceOffset: 18,
  idealStepClamp: 0.6,
  idealMovementFactor: 0.5,
  densePushFactor: 0.5,
});

// === SHIELD SYSTEM ===
export const SHIELD_DEFAULT_HITS = 3;
export const SHIELD_COOLDOWN_DURATION = 20; // segundos
export const SHIELD_SHOCKWAVE_RADIUS = 300;
export const SHIELD_SHOCKWAVE_FORCE = 350;
export const SHIELD_HIT_GRACE_TIME = 0.28; // segundos entre absorções consecutivas
export const SHIELD_COLLISION_BOUNCE = 0.85;
export const SHIELD_REFLECT_SPEED = 95; // incremento de velocidade aplicado no impacto
export const SHIELD_IMPACT_DAMAGE_BASE = 10;
export const SHIELD_IMPACT_DAMAGE_PER_LEVEL = 4;

// === COMBAT ===
export const COMBAT_SHOOT_COOLDOWN = 0.3;
export const COMBAT_TARGETING_RANGE = 400;
export const COMBAT_BULLET_LIFETIME = 1.8;
export const COMBAT_PREDICTION_TIME = 0.5;
export const COMBAT_MULTISHOT_SPREAD_STEP = 0.3;
export const TARGET_UPDATE_INTERVAL = 0.15;

export const COMBAT_AIMING_UPGRADE_CONFIG = deepFreeze({
  dangerWeights: {
    behavior: {
      parasite: 240,
      volatile: 200,
      default: 140,
    },
    variantOverrides: {
      parasite: 240,
      volatile: 200,
      gold: 170,
      crystal: 160,
      denseCore: 150,
      iron: 140,
      common: 120,
    },
    reward: 30,
    rewardNormalization: 20,
    direction: 6,
    directionBias: 0.12,
    speed: 4,
    speedReference: 180,
    size: {
      large: 3,
      medium: 2,
      small: 1,
    },
    distance: 0.75,
    impact: {
      distanceWeight: 18,
      distanceNormalization: 150,
      timeWeight: 12,
      timeNormalization: 1.25,
      hpWeight: 8,
      hpNormalization: 180,
      urgencyDistance: 12,
      urgencyTime: 10,
      hpUrgencyMultiplier: 1.1,
      stackMultiplier: 1.35,
      stackBase: 0.4,
      minStackScore: 0.15,
      maxRecommended: 4,
    },
  },
  dynamicPrediction: {
    minLeadTime: 0.05,
    maxLeadTime: 1.1,
    fallbackLeadTime: 0.35,
  },
  targetUpdateIntervals: {
    base: TARGET_UPDATE_INTERVAL,
    adaptive: 0.14,
    dynamic: 0.12,
    multiLock: 0.1,
  },
  multiLock: {
    baseTargetCount: 4,
    cooldownMultiplier: 0.92,
    parallelSpacing: 14,
    parallelRadiusMultiplier: 0.55,
  },
  feedback: {
    lockPulseDuration: 0.4,
    lockLineAlpha: 0.35,
    lockHighlightAlpha: 0.75,
    predictedMarkerRadius: 14,
  },
});

// === WAVE SYSTEM ===
export const ASTEROIDS_PER_WAVE_BASE = 4;
export const ASTEROIDS_PER_WAVE_MULTIPLIER = 1.3;
export const WAVE_DURATION = 60; // segundos
export const WAVE_BREAK_TIME = 10; // segundos
export const WAVE_BOSS_INTERVAL = 5;
export const MAX_ASTEROIDS_ON_SCREEN = 20;
export const SUPPORT_ENEMY_PROGRESSION = deepFreeze({
  drone: deepFreeze({
    startWave: 8,
    baseWeight: 1,
    weightScaling: 0.08,
  }),
  mine: deepFreeze({
    startWave: 10,
    baseWeight: 1,
    weightScaling: 0.07,
  }),
  hunter: deepFreeze({
    startWave: 13,
    baseWeight: 1,
    weightScaling: 0.1,
  }),
});
export const USE_WAVE_MANAGER = true; // Feature flag para ativar o novo WaveManager (experimental). Consulte docs/plans/phase1-enemy-foundation-plan.md para critérios de remoção.
export const PRESERVE_LEGACY_SIZE_DISTRIBUTION = true; // WAVE-006: Preservar distribuição legada de tamanhos de asteroides (50/30/20) para paridade com baseline
export const PRESERVE_LEGACY_POSITIONING = true; // WAVE-006: Preservar posicionamento legado de asteroides (4 bordas) vs. safe distance
export const WAVEMANAGER_HANDLES_ASTEROID_SPAWN = false; // WAVE-006: Ativar controle de spawn de asteroides pelo WaveManager (requer USE_WAVE_MANAGER=true)
export const WAVE_MANAGER_EMIT_LEGACY_WAVE_COMPLETED = false; // WAVE-004: Emite evento legado 'wave-completed' somente quando compatibilidade for necessária
export const ASTEROID_EDGE_SPAWN_MARGIN = 80; // WAVE-006: Margem para posicionamento de spawn nas bordas (paridade com legado)
export const STRICT_LEGACY_SPAWN_SEQUENCE = true; // WAVE-006: Garante que posição e tamanho reutilizem o mesmo stream de randomização
