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
