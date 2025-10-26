// src/data/enemies/asteroid-configs.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === CRACK PROFILES ===


export const ASTEROID_CRACK_PROFILES = deepFreeze({
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

// === CRACK LAYER LOOKUP ===
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


// === FRAGMENT RULES ===
// Used by FragmentationSystem to generate fragments when enemies are destroyed.
// Each variant defines fragmentation behavior (count, velocity, spread, etc.).
/**
 * Fragment generation rules for asteroid destruction.
 *
 * Used by FragmentationSystem.generateFragments(entity, rules)
 *
 * @property {string} key - Unique identifier for the rule set
 * @property {number} inheritVelocity - Fraction of parent velocity inherited (0-1)
 * @property {number} angleJitter - Angular spread of fragments in radians
 * @property {[number, number]} radialDistanceRange - Spawn distance from parent [min, max] as fraction of radius
 * @property {number} radialOffsetJitter - Random offset in spawn angle
 * @property {Object} speedMultiplierBySize - Speed multiplier ranges per size
 * @property {Object} countBySize - Fragment count ranges per size
 * @property {number} maxGeneration - Maximum fragmentation depth
 *
 * @example
 * const fragments = FragmentationSystem.generateFragments(
 *   asteroid,
 *   ASTEROID_FRAGMENT_RULES.volatile,
 * );
 */
export const ASTEROID_FRAGMENT_RULES = deepFreeze({
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
export const ASTEROID_BASE_ORBS = Object.freeze({
  large: 1,
  medium: 1,
  small: 1,
});

// Size factor: how many orbs each size drops (multiplicative)
export const ASTEROID_SIZE_ORB_FACTOR = Object.freeze({
  large: 3.0,   // 3x orbs
  medium: 2.0,  // 2x orbs (baseline)
  small: 1.0,   // 1x orbs
});

// DEPRECATED: Old XP-based system (kept for backward compatibility during migration)
export const ASTEROID_XP_BASE = Object.freeze({
  large: 15,
  medium: 10,
  small: 5,
});

export const ASTEROID_ORB_DROP_MULTIPLIER = Object.freeze({
  large: 2.0,
  medium: 1.0,
  small: 0.6,
});


// === ASTEROID VARIANTS ===
export const ASTEROID_VARIANTS = deepFreeze({
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
});


// === VARIANT SPAWN CHANCES ===
export const ASTEROID_VARIANT_CHANCES = deepFreeze({
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
});
