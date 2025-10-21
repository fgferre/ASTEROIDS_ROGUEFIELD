// src/core/GameConstants.js

// === DIMENSÕES DO JOGO ===
export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 600;
export const SHIP_SIZE = 15;
export const DEFAULT_SAFE_SPAWN_DISTANCE = 300;
export const PLAYER_SAFE_SPAWN_DISTANCE = 300;

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
  maxMultiplier: 2.2, // Only applies up to wave 10
  // Infinite scaling formula for wave 11+:
  // multiplier = 2.2 + (wave - 10) * 0.08 (logarithmic slow growth)
  // Wave 15: 2.2 + 5*0.08 = 2.6x
  // Wave 20: 2.2 + 10*0.08 = 3.0x
  // Wave 30: 2.2 + 20*0.08 = 3.8x
  infiniteScaling: {
    enabled: true,
    startWave: 11,
    perWaveIncrement: 0.08, // Slower than early game
    softCapWave: 50, // Start diminishing returns
    maxMultiplier: 10.0, // Hard cap at 10x base HP
  },
};

export const BULLET_SIZE = 3;
export const XP_ORB_SIZE = 8;
export const TRAIL_LENGTH = 6;
export const PHYSICS_CELL_SIZE = 96;

// === PROGRESSÃO ===
export const PROGRESSION_INITIAL_LEVEL = 1;
export const PROGRESSION_INITIAL_XP_REQUIREMENT = 100;
export const PROGRESSION_LEVEL_SCALING = 1.2;
export const PROGRESSION_UPGRADE_ROLL_COUNT = 3;
export const PROGRESSION_UPGRADE_FALLBACK_COUNT = 3;
export const PROGRESSION_COMBO_TIMEOUT = 3.0;
export const PROGRESSION_COMBO_MULTIPLIER_STEP = 0.1;
export const PROGRESSION_COMBO_MULTIPLIER_CAP = 2.0;

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

// === ORB VALUE SYSTEM ===
// Each orb has FIXED value of 5 XP (tier 1 blue orb)
// Reward is calculated by NUMBER OF ORBS, not XP directly
export const ORB_VALUE = 5;

// Base orbs = 1 for all sizes (size multiplier defines actual count)
export const ASTEROID_BASE_ORBS = {
  large: 1,
  medium: 1,
  small: 1,
};

// Size factor: how many orbs each size drops (multiplicative)
export const ASTEROID_SIZE_ORB_FACTOR = {
  large: 3.0,   // 3x orbs
  medium: 2.0,  // 2x orbs (baseline)
  small: 1.0,   // 1x orbs
};

// DEPRECATED: Old XP-based system (kept for backward compatibility during migration)
export const ASTEROID_XP_BASE = {
  large: 15,
  medium: 10,
  small: 5,
};

export const ASTEROID_ORB_DROP_MULTIPLIER = {
  large: 2.0,
  medium: 1.0,
  small: 0.6,
};

export const ASTEROID_VARIANTS = {
  common: {
    key: 'common',
    displayName: 'Padrão',
    allowedSizes: ['large', 'medium', 'small'],
    hpMultiplier: 1.0,
    speedMultiplier: 1.0,
    massMultiplier: 1.0,

    // NEW ORB SYSTEM:
    orbMultiplier: 1.0,       // Base multiplier (size × stats × rarity)
    statsFactor: 1.0,         // HP × speed × danger = 1.0 × 1.0 × 1.0
    rarityBonus: 1.0,         // Common = baseline (70% spawn)

    // DEPRECATED:
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
  iron: {
    key: 'iron',
    displayName: 'Blindado',
    allowedSizes: ['large', 'medium', 'small'],
    hpMultiplier: 1.3,
    speedMultiplier: 0.85,
    massMultiplier: 1.2,

    // NEW ORB SYSTEM:
    orbMultiplier: 2.53,      // stats × rarity = 1.1 × 2.3
    statsFactor: 1.1,         // HP × speed × danger = 1.3 × 0.85 × 1.0
    rarityBonus: 2.3,         // 8% spawn rate

    // DEPRECATED:
    xpMultiplier: 1.4,

    crackProfile: 'default',
    fragmentProfile: 'default',
    colors: {
      fill: '#5A6F7F',
      stroke: '#3A4A57',
      cracks: 'rgba(180, 200, 220, 0.5)',
      innerGlow: 'rgba(120, 140, 160, 0.25)',
    },
    drops: {
      baseSplit: 1,
      extraOrbs: [],
    },
  },
  denseCore: {
    key: 'denseCore',
    displayName: 'Núcleo Denso',
    allowedSizes: ['large', 'medium'],
    hpMultiplier: 1.8,
    speedMultiplier: 0.65,
    massMultiplier: 1.4,

    // NEW ORB SYSTEM:
    orbMultiplier: 2.93,      // stats × rarity = 1.17 × 2.5
    statsFactor: 1.17,        // HP × speed × danger = 1.8 × 0.65 × 1.0
    rarityBonus: 2.5,         // 7% spawn rate

    // DEPRECATED:
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
      baseSplit: 2,
      extraOrbs: [],
    },
  },
  gold: {
    key: 'gold',
    displayName: 'Tesouro Dourado 💰',
    allowedSizes: ['medium', 'small'],
    hpMultiplier: 0.4,        // ULTRA FRÁGIL (vidro!)
    speedMultiplier: 1.8,     // ULTRA RÁPIDO (foge!)
    massMultiplier: 0.6,

    // NEW ORB SYSTEM:
    orbMultiplier: 4.90,      // stats × rarity = 0.72 × 6.8
    statsFactor: 0.72,        // HP × speed × danger = 0.4 × 1.8 × 1.0
    rarityBonus: 6.8,         // 0.4% spawn rate (ULTRA RARO!)

    // DEPRECATED:
    xpMultiplier: 4.0,

    crackProfile: 'crystal',
    fragmentProfile: 'crystal',
    colors: {
      fill: '#FFD700',
      stroke: '#DAA520',
      cracks: 'rgba(255, 250, 205, 0.95)',
      glow: 'rgba(255, 223, 0, 0.8)',  // Glow intenso!
    },
    visual: {
      pulse: {
        speed: 3.0,           // Pulso RÁPIDO (atenção!)
        amount: 0.6,          // Pulso FORTE
        color: 'rgba(255, 240, 150, 1.0)',
      },
      glow: {
        baseBlur: 20,         // Glow GRANDE
        pulseBlur: 15,
        baseAlpha: 0.6,       // MUITO visível
        pulseAlpha: 0.4,
      },
    },
    drops: {
      baseSplit: 1,
      extraOrbs: [],
      dropPattern: 'explosion',  // Mecânica especial: orbs explodem radialmente!
    },
  },
  volatile: {
    key: 'volatile',
    displayName: 'Fragmento Volátil',
    allowedSizes: ['large', 'medium', 'small'],
    hpMultiplier: 0.6,
    speedMultiplier: 1.4,
    massMultiplier: 0.7,

    // NEW ORB SYSTEM:
    orbMultiplier: 5.46,      // stats × rarity = 2.1 × 2.6
    statsFactor: 2.1,         // HP × speed × danger = 0.6 × 1.4 × 2.5 (explosion!)
    rarityBonus: 2.6,         // 6.5% spawn rate

    // DEPRECATED:
    xpMultiplier: 3.2,

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
      baseSplit: 3, // 3 blue orbs - DANGER = REWARD (26 XP at wave 1)
      extraOrbs: [],
    },
  },
  parasite: {
    key: 'parasite',
    displayName: 'Parásita',
    allowedSizes: ['large', 'medium', 'small'],
    hpMultiplier: 0.8,
    speedMultiplier: 1.2,
    massMultiplier: 0.9,

    // NEW ORB SYSTEM:
    orbMultiplier: 8.10,      // stats × rarity = 2.7 × 3.0
    statsFactor: 2.7,         // HP × speed × danger = 0.8 × 1.2 × 2.8 (persegue + contato!)
    rarityBonus: 3.0,         // 4.5% spawn rate

    // DEPRECATED:
    xpMultiplier: 3.5,

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
      baseSplit: 4, // 4 blue orbs - hardest enemy = biggest reward (28 XP at wave 1)
      extraOrbs: [],
    },
  },
  crystal: {
    key: 'crystal',
    displayName: 'Cristal Energético',
    allowedSizes: ['large', 'medium', 'small'],
    hpMultiplier: 0.7,
    speedMultiplier: 1.3,     // AUMENTADO de 0.8 para 1.3 (ágil!)
    massMultiplier: 0.95,

    // NEW ORB SYSTEM:
    orbMultiplier: 4.73,      // stats × rarity = 0.91 × 5.2
    statsFactor: 0.91,        // HP × speed × danger = 0.7 × 1.3 × 1.0
    rarityBonus: 5.2,         // 1.5% spawn rate (raro!)

    // DEPRECATED:
    xpMultiplier: 3.0,

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
      baseSplit: 3, // 3 blue orbs base (24 XP at wave 1)
      extraOrbs: [
        {
          count: 1, // +1 orb per 3 waves (wave scaling)
          valueMultiplier: 1.0,
          tier: 1, // Always blue tier for clustering
          waveScaling: true, // Flag for XPOrbSystem to handle
        },
      ],
    },
  },
};

export const ASTEROID_VARIANT_CHANCES = {
  large: {
    baseChance: 0.35,
    distribution: {
      iron: 0.27,       // 9.45% total
      denseCore: 0.30,  // 10.5% total
      volatile: 0.22,   // 7.7% total
      parasite: 0.16,   // 5.6% total
      gold: 0.00,       // Gold não spawna em large
      crystal: 0.05,    // 1.75% total (raro!)
    },
  },
  medium: {
    baseChance: 0.25,
    distribution: {
      iron: 0.30,       // 7.5% total
      denseCore: 0.20,  // 5% total
      volatile: 0.25,   // 6.25% total
      parasite: 0.15,   // 3.75% total
      gold: 0.02,       // 0.5% total (ULTRA RARO! 💰)
      crystal: 0.08,    // 2% total (raro)
    },
  },
  small: {
    baseChance: 0.15,
    distribution: {
      iron: 0.35,       // 5.25% total
      volatile: 0.30,   // 4.5% total
      parasite: 0.20,   // 3% total
      gold: 0.02,       // 0.3% total (ULTRA RARO! 💰)
      crystal: 0.13,    // 1.95% total (raro)
    },
  },
  waveBonus: {
    startWave: 4,
    increment: 0.025,
    maxBonus: 0.15,
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

// === ENEMY TYPES ===
export const ENEMY_TYPES = Object.freeze({
  drone: Object.freeze({
    key: 'drone', // Unique identifier consumed by factories and pools
    displayName: 'Assault Drone', // Human-readable label used in UI/debug output
    radius: 12, // Collision radius in world units (pixels)
    health: 30, // Base hit points before modifiers or scaling
    maxHealth: 30, // Maximum health before modifiers
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
    maxHealth: 20, // Maximum durability for UI calculations
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
    maxHealth: 48, // Maximum health reference used by HUD/UI
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

export const ENEMY_REWARDS = Object.freeze({
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

export const ENEMY_EFFECT_COLORS = Object.freeze({
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

export const ENEMY_RENDER_PRESETS = Object.freeze({
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

export const BOSS_CONFIG = Object.freeze({
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

export const BOSS_PHYSICS_CONFIG = Object.freeze({
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

export const BOSS_EFFECTS_PRESETS = Object.freeze({
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

export const BOSS_SCREEN_SHAKES = Object.freeze({
  spawn: Object.freeze({ intensity: 18, duration: 0.65, preset: 'bossSpawn' }),
  phaseChange: Object.freeze({
    intensity: 14,
    duration: 0.5,
    preset: 'bossPhaseChange',
  }),
  defeated: Object.freeze({ intensity: 24, duration: 0.85, preset: 'bossDefeated' }),
});

// === AUDIO PRESETS ===
export const BOSS_AUDIO_FREQUENCY_PRESETS = Object.freeze({
  roar: Object.freeze({
    duration: 1.2,
    attackGain: 0.22,
    sustainGain: 0.16,
    releaseDuration: 0.5,
    sweep: Object.freeze({ start: 80, end: 150, duration: 0.7 }),
    vibrato: Object.freeze({ depth: 8, speed: 5.5 }),
    harmonics: Object.freeze([220, 330]),
    tail: Object.freeze({ frequency: 58, duration: 0.5, gain: 0.12 }),
    filter: Object.freeze({ type: 'lowpass', frequency: 360 }),
  }),
  phaseChange: Object.freeze({
    duration: 0.6,
    sweep: Object.freeze({ start: 220, end: 820 }),
    shimmer: Object.freeze({
      frequencies: Object.freeze([660, 880, 990, 1320]),
      spacing: 0.08,
      gain: 0.1,
    }),
    swell: Object.freeze({ frequency: 180, duration: 0.8, gain: 0.12 }),
  }),
  defeated: Object.freeze({
    duration: 2.0,
    fanfare: Object.freeze({
      notes: Object.freeze([
        Object.freeze({ frequency: 392, delay: 0, duration: 0.5, gain: 0.16 }),
        Object.freeze({ frequency: 523, delay: 0.18, duration: 0.6, gain: 0.18 }),
        Object.freeze({ frequency: 659, delay: 0.38, duration: 0.7, gain: 0.18 }),
        Object.freeze({ frequency: 784, delay: 0.58, duration: 0.75, gain: 0.2 }),
      ]),
      harmony: Object.freeze({
        frequencies: Object.freeze([196, 294, 392]),
        duration: 1.6,
        gain: 0.12,
      }),
    }),
    choir: Object.freeze({ frequency: 220, duration: 1.8, gain: 0.08 }),
    sparkle: Object.freeze({
      frequencies: Object.freeze([1046, 1318, 1567]),
      spacing: 0.12,
      duration: 0.5,
      gain: 0.08,
    }),
  }),
});

export const MUSIC_LAYER_CONFIG = Object.freeze({
  layers: Object.freeze({
    base: Object.freeze({
      frequency: 110,
      type: 'sine',
      modulationDepth: 0.55,
      modulationRate: 0.07,
      modulationType: 'sine',
      randomDetuneCents: 8,
      filter: Object.freeze({
        type: 'lowpass',
        frequency: 420,
        Q: 0.8,
      }),
    }),
    tension: Object.freeze({
      frequency: 220,
      type: 'triangle',
      modulationDepth: 0.4,
      modulationRate: 0.12,
      modulationType: 'sine',
      randomDetuneCents: 6,
      filter: Object.freeze({
        type: 'bandpass',
        frequency: 680,
        Q: 1.1,
      }),
    }),
    danger: Object.freeze({
      frequency: 330,
      type: 'sawtooth',
      modulationDepth: 0.32,
      modulationRate: 0.18,
      modulationType: 'triangle',
      randomDetuneCents: 5,
      filter: Object.freeze({
        type: 'bandpass',
        frequency: 940,
        Q: 1.3,
      }),
    }),
    climax: Object.freeze({
      frequency: 440,
      type: 'square',
      modulationDepth: 0.26,
      modulationRate: 0.24,
      modulationType: 'sine',
      randomDetuneCents: 4,
      filter: Object.freeze({
        type: 'highpass',
        frequency: 520,
        Q: 0.7,
      }),
    }),
  }),
  intensities: Object.freeze([
    Object.freeze({ base: 0.0, tension: 0.0, danger: 0.0, climax: 0.0 }),
    Object.freeze({ base: 0.18, tension: 0.08, danger: 0.0, climax: 0.0 }),
    Object.freeze({ base: 0.2, tension: 0.12, danger: 0.08, climax: 0.0 }),
    Object.freeze({ base: 0.22, tension: 0.16, danger: 0.12, climax: 0.08 }),
  ]),
  initialIntensity: 0,
  relaxedIntensity: 0,
  bossIntensity: 3,
  rampDurations: Object.freeze({
    rise: 1.2,
    fall: 2.0,
    bossRise: 0.6,
    bossFall: 2.8,
  }),
});

// === XP ORBS ===
export const XP_ORB_BASE_VALUE = 5;
export const XP_ORB_MAX_PER_CLASS = 100;
export const XP_ORB_FUSION_CHECK_INTERVAL = 0.3;
export const XP_ORB_FUSION_ANIMATION_DURATION = 0.82;
export const XP_ORB_MAGNETISM_BOOST = 2.2;
export const XP_ORB_COLLECTION_RADIUS_PADDING = 0.1;
export const XP_ORB_CLUSTER_CONFIG = Object.freeze({
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

// === COMBATE ===
export const COMBAT_SHOOT_COOLDOWN = 0.3;
export const COMBAT_TARGETING_RANGE = 400;
export const COMBAT_BULLET_LIFETIME = 1.8;
export const COMBAT_PREDICTION_TIME = 0.5;
export const COMBAT_MULTISHOT_SPREAD_STEP = 0.3;
export const TARGET_UPDATE_INTERVAL = 0.15;

export const COMBAT_AIMING_UPGRADE_CONFIG = Object.freeze({
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

// === SISTEMA DE ONDAS ===
export const ASTEROIDS_PER_WAVE_BASE = 4;
export const ASTEROIDS_PER_WAVE_MULTIPLIER = 1.3;
export const WAVE_DURATION = 60; // segundos
export const WAVE_BREAK_TIME = 10; // segundos
export const WAVE_BOSS_INTERVAL = 5;
export const MAX_ASTEROIDS_ON_SCREEN = 20;
export const SUPPORT_ENEMY_PROGRESSION = Object.freeze({
  drone: Object.freeze({
    startWave: 8,
    baseWeight: 1,
    weightScaling: 0.08,
  }),
  mine: Object.freeze({
    startWave: 10,
    baseWeight: 1,
    weightScaling: 0.07,
  }),
  hunter: Object.freeze({
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

if (
  typeof process !== 'undefined' &&
  process?.env?.NODE_ENV === 'development'
) {
  console.log('[GameConstants] ENEMY_TYPES health values:', {
    drone: ENEMY_TYPES?.drone?.health,
    mine: ENEMY_TYPES?.mine?.health,
    hunter: ENEMY_TYPES?.hunter?.health,
  });
}

console.log('[GameConstants] Loaded');
