// src/core/GameConstants.js

// === DIMENSÕES DO JOGO ===
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const SHIP_SIZE = 15;

// === TAMANHOS DE OBJETOS ===
export const ASTEROID_SIZES = {
  large: 35,
  medium: 22,
  small: 12,
};

export const ASTEROID_BASE_HEALTH = {
  large: 90,
  medium: 50,
  small: 30,
};

export const ASTEROID_HEALTH_SCALING = {
  perWave: 0.12,
  maxMultiplier: 2.2,
};

export const BULLET_SIZE = 3;
export const XP_ORB_SIZE = 8;
export const TRAIL_LENGTH = 6;

// === FÍSICA DA NAVE ===
export const SHIP_ACCELERATION = 280;
export const SHIP_MAX_SPEED = 220;
export const SHIP_LINEAR_DAMPING = 3.1; // s^-1
export const SHIP_ROTATION_SPEED = 8; // rad/s
export const SHIP_ANGULAR_DAMPING = 6.2; // s^-1
export const SHIP_MASS = 60;

// === VELOCIDADES ===
export const ASTEROID_SPEEDS = {
  large: 25,
  medium: 45,
  small: 70,
};

export const ASTEROID_CRACK_THRESHOLDS = [0.7, 0.4, 0.15];

export const ASTEROID_CRACK_GRAPH_RULES = Object.freeze({
  continuationBias: 0.82,
  newRootChance: 0.22,
  childPenalty: 0.45,
  branchParentPenalty: 0.5,
  microParentPenalty: 0.35,
  minSegmentLengthRatio: 0.12,
  surfaceMargin: 0.65,
  branchAnchorJitter: 0.15,
  microAnchorJitter: 0.22,
  continuationJitter: 0.5,
});


// === ASTEROID CRACK PROFILES ===
export const ASTEROID_CRACK_PROFILES = Object.freeze({
  default: {
    key: 'default',
    rotationJitter: 0.28,
    startRadiusRange: [0.18, 0.32],
    lineWidthRange: [0.85, 1.25],
    layers: [
      {
        id: 'default-stage-1',
        mainRays: 3,
        mainLengthRange: [0.48, 0.62],
        startRadiusRange: [0.24, 0.36],
        angularJitter: 0.2,
        branch: {
          count: 1,
          lengthMultiplier: 0.55,
          spread: 0.32,
          offsetFromStart: 0.45,
        },
        micro: {
          count: 0,
          lengthMultiplier: 0.35,
          spread: 0.5,
        },
        ring: null,
        intensity: 0.6,
        burst: {
          cracks: 4,
          sparks: 1,
          shards: 0,
        },
      },
      {
        id: 'default-stage-2',
        mainRays: 4,
        mainLengthRange: [0.6, 0.8],
        startRadiusRange: [0.22, 0.34],
        angularJitter: 0.24,
        branch: {
          count: 2,
          lengthMultiplier: 0.5,
          spread: 0.36,
          offsetFromStart: 0.38,
        },
        micro: {
          count: 2,
          lengthMultiplier: 0.32,
          spread: 0.46,
        },
        ring: {
          segments: 5,
          radiusRange: [0.45, 0.62],
          width: 0.58,
        },
        intensity: 0.85,
        burst: {
          cracks: 6,
          sparks: 2,
          shards: 1,
        },
      },
      {
        id: 'default-stage-3',
        mainRays: 5,
        mainLengthRange: [0.72, 0.92],
        startRadiusRange: [0.18, 0.28],
        angularJitter: 0.3,
        branch: {
          count: 3,
          lengthMultiplier: 0.46,
          spread: 0.38,
          offsetFromStart: 0.32,
        },
        micro: {
          count: 4,
          lengthMultiplier: 0.28,
          spread: 0.5,
        },
        ring: {
          segments: 7,
          radiusRange: [0.5, 0.72],
          width: 0.62,
        },
        intensity: 1,
        burst: {
          cracks: 8,
          sparks: 3,
          shards: 2,
        },
      },
    ],
  },
  denseCore: {
    key: 'denseCore',
    rotationJitter: 0.2,
    startRadiusRange: [0.26, 0.4],
    lineWidthRange: [1.1, 1.6],
    layers: [
      {
        id: 'denseCore-stage-1',
        mainRays: 4,
        mainLengthRange: [0.5, 0.7],
        startRadiusRange: [0.3, 0.4],
        angularJitter: 0.16,
        branch: {
          count: 1,
          lengthMultiplier: 0.58,
          spread: 0.22,
          offsetFromStart: 0.52,
        },
        micro: {
          count: 1,
          lengthMultiplier: 0.32,
          spread: 0.2,
        },
        ring: {
          segments: 4,
          radiusRange: [0.32, 0.42],
          width: 0.5,
        },
        intensity: 0.7,
        burst: {
          cracks: 5,
          sparks: 1,
          shards: 1,
        },
      },
      {
        id: 'denseCore-stage-2',
        mainRays: 5,
        mainLengthRange: [0.62, 0.82],
        startRadiusRange: [0.28, 0.38],
        angularJitter: 0.18,
        branch: {
          count: 2,
          lengthMultiplier: 0.5,
          spread: 0.28,
          offsetFromStart: 0.44,
        },
        micro: {
          count: 2,
          lengthMultiplier: 0.3,
          spread: 0.26,
        },
        ring: {
          segments: 6,
          radiusRange: [0.38, 0.55],
          width: 0.58,
        },
        intensity: 0.95,
        burst: {
          cracks: 7,
          sparks: 2,
          shards: 2,
        },
      },
      {
        id: 'denseCore-stage-3',
        mainRays: 6,
        mainLengthRange: [0.74, 0.94],
        startRadiusRange: [0.26, 0.36],
        angularJitter: 0.22,
        branch: {
          count: 3,
          lengthMultiplier: 0.48,
          spread: 0.3,
          offsetFromStart: 0.36,
        },
        micro: {
          count: 3,
          lengthMultiplier: 0.26,
          spread: 0.28,
        },
        ring: {
          segments: 8,
          radiusRange: [0.42, 0.62],
          width: 0.62,
        },
        intensity: 1.1,
        burst: {
          cracks: 9,
          sparks: 3,
          shards: 3,
        },
      },
    ],
  },
  volatile: {
    key: 'volatile',
    rotationJitter: 0.42,
    startRadiusRange: [0.2, 0.34],
    lineWidthRange: [0.8, 1.3],
    layers: [
      {
        id: 'volatile-stage-1',
        mainRays: 3,
        mainLengthRange: [0.52, 0.7],
        startRadiusRange: [0.22, 0.34],
        angularJitter: 0.34,
        branch: {
          count: 1,
          lengthMultiplier: 0.6,
          spread: 0.46,
          offsetFromStart: 0.4,
        },
        micro: {
          count: 2,
          lengthMultiplier: 0.32,
          spread: 0.52,
        },
        ring: null,
        intensity: 0.75,
        burst: {
          cracks: 5,
          sparks: 2,
          shards: 1,
        },
      },
      {
        id: 'volatile-stage-2',
        mainRays: 4,
        mainLengthRange: [0.66, 0.86],
        startRadiusRange: [0.2, 0.34],
        angularJitter: 0.42,
        branch: {
          count: 2,
          lengthMultiplier: 0.55,
          spread: 0.48,
          offsetFromStart: 0.34,
        },
        micro: {
          count: 3,
          lengthMultiplier: 0.3,
          spread: 0.54,
        },
        ring: {
          segments: 6,
          radiusRange: [0.46, 0.66],
          width: 0.56,
        },
        intensity: 1,
        burst: {
          cracks: 8,
          sparks: 3,
          shards: 2,
        },
      },
      {
        id: 'volatile-stage-3',
        mainRays: 5,
        mainLengthRange: [0.78, 1],
        startRadiusRange: [0.18, 0.3],
        angularJitter: 0.5,
        branch: {
          count: 3,
          lengthMultiplier: 0.5,
          spread: 0.5,
          offsetFromStart: 0.28,
        },
        micro: {
          count: 4,
          lengthMultiplier: 0.28,
          spread: 0.6,
        },
        ring: {
          segments: 7,
          radiusRange: [0.5, 0.7],
          width: 0.62,
        },
        intensity: 1.2,
        burst: {
          cracks: 10,
          sparks: 4,
          shards: 3,
        },
      },
    ],
  },
  parasite: {
    key: 'parasite',
    rotationJitter: 0.34,
    startRadiusRange: [0.24, 0.38],
    lineWidthRange: [0.85, 1.3],
    layers: [
      {
        id: 'parasite-stage-1',
        mainRays: 4,
        mainLengthRange: [0.54, 0.72],
        startRadiusRange: [0.26, 0.38],
        angularJitter: 0.26,
        branch: {
          count: 1,
          lengthMultiplier: 0.62,
          spread: 0.3,
          offsetFromStart: 0.42,
        },
        micro: {
          count: 1,
          lengthMultiplier: 0.32,
          spread: 0.34,
        },
        ring: null,
        intensity: 0.7,
        burst: {
          cracks: 5,
          sparks: 1,
          shards: 1,
        },
      },
      {
        id: 'parasite-stage-2',
        mainRays: 5,
        mainLengthRange: [0.66, 0.86],
        startRadiusRange: [0.24, 0.34],
        angularJitter: 0.32,
        branch: {
          count: 2,
          lengthMultiplier: 0.56,
          spread: 0.34,
          offsetFromStart: 0.36,
        },
        micro: {
          count: 2,
          lengthMultiplier: 0.28,
          spread: 0.4,
        },
        ring: {
          segments: 5,
          radiusRange: [0.46, 0.62],
          width: 0.52,
        },
        intensity: 0.95,
        burst: {
          cracks: 7,
          sparks: 2,
          shards: 2,
        },
      },
      {
        id: 'parasite-stage-3',
        mainRays: 6,
        mainLengthRange: [0.78, 0.98],
        startRadiusRange: [0.22, 0.32],
        angularJitter: 0.36,
        branch: {
          count: 3,
          lengthMultiplier: 0.5,
          spread: 0.36,
          offsetFromStart: 0.3,
        },
        micro: {
          count: 3,
          lengthMultiplier: 0.26,
          spread: 0.46,
        },
        ring: {
          segments: 7,
          radiusRange: [0.5, 0.68],
          width: 0.58,
        },
        intensity: 1.15,
        burst: {
          cracks: 9,
          sparks: 3,
          shards: 3,
        },
      },
    ],
  },
  crystal: {
    key: 'crystal',
    rotationJitter: 0.18,
    startRadiusRange: [0.2, 0.3],
    lineWidthRange: [0.9, 1.35],
    layers: [
      {
        id: 'crystal-stage-1',
        mainRays: 4,
        mainLengthRange: [0.58, 0.74],
        startRadiusRange: [0.22, 0.3],
        angularJitter: 0.14,
        branch: {
          count: 1,
          lengthMultiplier: 0.5,
          spread: 0.2,
          offsetFromStart: 0.4,
        },
        micro: {
          count: 2,
          lengthMultiplier: 0.3,
          spread: 0.22,
        },
        ring: {
          segments: 6,
          radiusRange: [0.44, 0.6],
          width: 0.55,
        },
        intensity: 0.75,
        burst: {
          cracks: 6,
          sparks: 2,
          shards: 1,
        },
      },
      {
        id: 'crystal-stage-2',
        mainRays: 6,
        mainLengthRange: [0.7, 0.88],
        startRadiusRange: [0.2, 0.28],
        angularJitter: 0.18,
        branch: {
          count: 2,
          lengthMultiplier: 0.46,
          spread: 0.24,
          offsetFromStart: 0.36,
        },
        micro: {
          count: 3,
          lengthMultiplier: 0.26,
          spread: 0.28,
        },
        ring: {
          segments: 8,
          radiusRange: [0.48, 0.66],
          width: 0.58,
        },
        intensity: 1,
        burst: {
          cracks: 8,
          sparks: 3,
          shards: 2,
        },
      },
      {
        id: 'crystal-stage-3',
        mainRays: 8,
        mainLengthRange: [0.78, 0.98],
        startRadiusRange: [0.18, 0.26],
        angularJitter: 0.2,
        branch: {
          count: 3,
          lengthMultiplier: 0.44,
          spread: 0.26,
          offsetFromStart: 0.32,
        },
        micro: {
          count: 4,
          lengthMultiplier: 0.22,
          spread: 0.3,
        },
        ring: {
          segments: 10,
          radiusRange: [0.52, 0.7],
          width: 0.6,
        },
        intensity: 1.2,
        burst: {
          cracks: 10,
          sparks: 4,
          shards: 3,
        },
      },
    ],
  },
});
const __crackLayerLookup = {};
Object.values(ASTEROID_CRACK_PROFILES).forEach((profile) => {
  profile.layers.forEach((layer, index) => {
    const layerId = layer.id || `${profile.key}-stage-${index + 1}`;
    __crackLayerLookup[layerId] = Object.freeze({
      id: layerId,
      profile: profile.key,
      index,
      config: layer,
    });
  });
});
export const ASTEROID_CRACK_LAYER_LOOKUP = Object.freeze(__crackLayerLookup);

export const ASTEROID_FRAGMENT_RULES = Object.freeze({
  default: {
    key: 'default',
    inheritVelocity: 0.42,
    angleJitter: 0.45,
    radialDistanceRange: [0.48, 0.92],
    radialOffsetJitter: 0.18,
    speedMultiplierBySize: {
      large: [0.82, 1.12],
      medium: [0.92, 1.22],
      small: [1, 1],
    },
    countBySize: {
      large: [3, 4],
      medium: [2, 3],
      small: [0, 0],
    },
    maxGeneration: 3,
  },
  denseCore: {
    key: 'denseCore',
    inheritVelocity: 0.34,
    angleJitter: 0.32,
    radialDistanceRange: [0.42, 0.78],
    radialOffsetJitter: 0.12,
    speedMultiplierBySize: {
      large: [0.7, 0.95],
      medium: [0.82, 1.08],
      small: [1, 1],
    },
    countBySize: {
      large: [2, 3],
      medium: [2, 2],
      small: [0, 0],
    },
    maxGeneration: 3,
  },
  volatile: {
    key: 'volatile',
    inheritVelocity: 0.55,
    angleJitter: 0.6,
    radialDistanceRange: [0.55, 1.05],
    radialOffsetJitter: 0.24,
    speedMultiplierBySize: {
      large: [0.95, 1.35],
      medium: [1, 1.35],
      small: [1, 1],
    },
    countBySize: {
      large: [3, 4],
      medium: [3, 4],
      small: [0, 0],
    },
    maxGeneration: 3,
  },
  parasite: {
    key: 'parasite',
    inheritVelocity: 0.5,
    angleJitter: 0.5,
    radialDistanceRange: [0.5, 0.9],
    radialOffsetJitter: 0.2,
    speedMultiplierBySize: {
      large: [0.9, 1.25],
      medium: [0.95, 1.25],
      small: [1, 1],
    },
    countBySize: {
      large: [3, 4],
      medium: [3, 3],
      small: [0, 0],
    },
    maxGeneration: 3,
  },
  crystal: {
    key: 'crystal',
    inheritVelocity: 0.4,
    angleJitter: 0.28,
    radialDistanceRange: [0.48, 0.86],
    radialOffsetJitter: 0.16,
    speedMultiplierBySize: {
      large: [0.82, 1.08],
      medium: [0.88, 1.12],
      small: [1, 1],
    },
    countBySize: {
      large: [4, 4],
      medium: [3, 4],
      small: [0, 0],
    },
    maxGeneration: 3,
  },
});

export const ASTEROID_XP_BASE = {
  large: 15,
  medium: 8,
  small: 5,
};

export const ASTEROID_VARIANTS = {
  common: {
    key: 'common',
    displayName: 'Padrão',
    allowedSizes: ['large', 'medium', 'small'],
    hpMultiplier: 1,
    speedMultiplier: 1,
    massMultiplier: 1,
    xpMultiplier: 1,
    crackProfile: 'default',
    fragmentProfile: 'default',
    colors: {
      fill: '#8B4513',
      stroke: '#654321',
      cracks: 'rgba(255, 255, 255, 0.45)',
    },
    drops: {
      baseSplit: 1,
      extraOrbs: [],
    },
  },
  denseCore: {
    key: 'denseCore',
    displayName: 'Núcleo Denso',
    allowedSizes: ['medium'],
    hpMultiplier: 1.8,
    speedMultiplier: 0.65,
    massMultiplier: 1.4,
    xpMultiplier: 2,
    crackProfile: 'denseCore',
    fragmentProfile: 'denseCore',
    colors: {
      fill: '#2F8CA3',
      stroke: '#1F5E6F',
      cracks: 'rgba(163, 227, 255, 0.6)',
      innerGlow: 'rgba(90, 220, 255, 0.35)',
    },
    drops: {
      baseSplit: 1,
      extraOrbs: [
        {
          count: 1,
          valueMultiplier: 1,
          tier: 3,
        },
      ],
    },
  },
  volatile: {
    key: 'volatile',
    displayName: 'Fragmento Volátil',
    allowedSizes: ['medium', 'small'],
    hpMultiplier: 0.6,
    speedMultiplier: 1.4,
    massMultiplier: 0.7,
    xpMultiplier: 1.2,
    crackProfile: 'volatile',
    fragmentProfile: 'volatile',
    colors: {
      fill: '#B64220',
      stroke: '#5E1A0D',
      cracks: 'rgba(255, 200, 120, 0.7)',
      pulse: 'rgba(255, 120, 30, 0.45)',
      glow: 'rgba(255, 180, 90, 0.6)',
      innerGlow: 'rgba(255, 120, 45, 0.5)',
    },
    behavior: {
      type: 'volatile',
      fuseTime: 6,
      armTime: 1.6,
      explosion: {
        radius: 85,
        damage: 35,
      },
    },
    visual: {
      pulse: {
        speed: 2.4,
        amount: 0.75,
        fuseBoost: 0.6,
        armedBoost: 0.25,
        color: 'rgba(255, 160, 70, 0.9)',
      },
      glow: {
        baseBlur: 18,
        pulseBlur: 12,
        armedBlur: 10,
        fuseBlur: 8,
        baseAlpha: 0.5,
        pulseAlpha: 0.28,
        armedAlpha: 0.3,
        fuseAlpha: 0.32,
      },
      trail: {
        interval: 0.055,
        minimumInterval: 0.025,
        accelerationFactor: 0.65,
        countRange: [2, 4],
        speedRange: [32, 96],
        sizeRange: [2.2, 3.8],
        lifeRange: [0.26, 0.48],
        spread: Math.PI / 3,
        emberJitter: 6,
        colors: {
          core: 'rgba(255, 200, 130, 0.9)',
          ember: 'rgba(255, 100, 40, 0.85)',
          smoke: 'rgba(60, 24, 10, 0.35)',
        },
      },
    },
    drops: {
      baseSplit: 1,
      extraOrbs: [
        {
          count: 1,
          valueMultiplier: 0.2,
          tier: 1,
        },
      ],
    },
  },
  parasite: {
    key: 'parasite',
    displayName: 'Parásita',
    allowedSizes: ['medium', 'small'],
    hpMultiplier: 0.8,
    speedMultiplier: 1.2,
    massMultiplier: 0.9,
    xpMultiplier: 1.5,
    crackProfile: 'parasite',
    fragmentProfile: 'parasite',
    colors: {
      fill: '#612E83',
      stroke: '#37154D',
      cracks: 'rgba(190, 120, 255, 0.65)',
      glow: 'rgba(90, 255, 180, 0.35)',
    },
    behavior: {
      type: 'parasite',
      acceleration: 180,
      maxSpeed: 160,
      minDistance: 25,
      contactDamage: 20,
      cooldown: 1.2,
    },
    visual: {
      pulse: {
        speed: 1.7,
        amount: 0.38,
        color: 'rgba(190, 120, 255, 0.75)',
      },
      glow: {
        baseBlur: 10,
        pulseBlur: 6,
        baseAlpha: 0.38,
        pulseAlpha: 0.22,
      },
    },
    availability: {
      minWave: 4,
    },
    drops: {
      baseSplit: 1,
      extraOrbs: [
        {
          count: 1,
          valueMultiplier: 0.5,
          tier: 2,
        },
      ],
    },
  },
  crystal: {
    key: 'crystal',
    displayName: 'Cristal Energético',
    allowedSizes: ['large', 'medium', 'small'],
    hpMultiplier: 0.7,
    speedMultiplier: 0.8,
    massMultiplier: 0.95,
    xpMultiplier: 2.2,
    crackProfile: 'crystal',
    fragmentProfile: 'crystal',
    colors: {
      fill: '#4FD0FF',
      stroke: '#2A8FB4',
      cracks: 'rgba(240, 255, 255, 0.85)',
      glow: 'rgba(120, 240, 255, 0.55)',
    },
    visual: {
      pulse: {
        speed: 1.9,
        amount: 0.35,
        color: 'rgba(220, 255, 255, 0.8)',
      },
      glow: {
        baseBlur: 12,
        pulseBlur: 9,
        baseAlpha: 0.4,
        pulseAlpha: 0.26,
      },
    },
    drops: {
      baseSplit: 0,
      extraOrbs: [
        {
          count: 1,
          valueMultiplier: 2.2,
          className: 'crystal',
        },
      ],
    },
  },
};

export const ASTEROID_VARIANT_CHANCES = {
  large: {
    baseChance: 0.3,
    distribution: {
      denseCore: 0.45,
      volatile: 0.25,
      parasite: 0.2,
      crystal: 0.1,
    },
  },
  medium: {
    baseChance: 0.2,
    distribution: {
      denseCore: 0.3,
      volatile: 0.35,
      parasite: 0.25,
      crystal: 0.1,
    },
  },
  small: {
    baseChance: 0.12,
    distribution: {
      denseCore: 0.1,
      volatile: 0.45,
      parasite: 0.35,
      crystal: 0.1,
    },
  },
  waveBonus: {
    startWave: 4,
    increment: 0.02,
    maxBonus: 0.12,
  },
};

export const BULLET_SPEED = 450;
export const COLLISION_BOUNCE = 0.6;

// === MAGNETISMO ===
export const MAGNETISM_RADIUS = 70;
export const MAGNETISM_FORCE = 120;
export const ENHANCED_SHIP_MAGNETISM_FORCE = 300;
export const ORB_MAGNETISM_RADIUS = 35;
export const ORB_MAGNETISM_FORCE = 150;
export const MIN_ORB_DISTANCE = 18;
export const CLUSTER_FUSION_COUNT = 10;

// === ESCUDO DEFLETOR ===
export const SHIELD_DEFAULT_HITS = 3;
export const SHIELD_COOLDOWN_DURATION = 20; // segundos
export const SHIELD_SHOCKWAVE_RADIUS = 300;
export const SHIELD_SHOCKWAVE_FORCE = 350;
export const SHIELD_HIT_GRACE_TIME = 0.28; // segundos entre absorções consecutivas
export const SHIELD_COLLISION_BOUNCE = 0.85;
export const SHIELD_REFLECT_SPEED = 95; // incremento de velocidade aplicado no impacto
export const SHIELD_IMPACT_DAMAGE_BASE = 10;
export const SHIELD_IMPACT_DAMAGE_PER_LEVEL = 4;

// === SISTEMA DE ONDAS ===
export const TARGET_UPDATE_INTERVAL = 0.15;
export const ASTEROIDS_PER_WAVE_BASE = 4;
export const ASTEROIDS_PER_WAVE_MULTIPLIER = 1.3;
export const WAVE_DURATION = 60; // segundos
export const WAVE_BREAK_TIME = 10; // segundos
export const MAX_ASTEROIDS_ON_SCREEN = 20;

console.log('[GameConstants] Loaded');
