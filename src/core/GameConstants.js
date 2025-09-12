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

export const BULLET_SIZE = 3;
export const XP_ORB_SIZE = 8;
export const TRAIL_LENGTH = 6;

// === FÍSICA DA NAVE ===
export const SHIP_ACCELERATION = 280;
export const SHIP_MAX_SPEED = 220;
export const SHIP_LINEAR_DAMPING = 3.9; // s^-1
export const SHIP_ROTATION_SPEED = 8; // rad/s
export const SHIP_ANGULAR_DAMPING = 8.0; // s^-1
export const SHIP_MASS = 60;

// === VELOCIDADES ===
export const ASTEROID_SPEEDS = {
  large: 25,
  medium: 45,
  small: 70,
};

export const BULLET_SPEED = 450;
export const COLLISION_BOUNCE = 0.6;

// === MAGNETISMO ===
export const MAGNETISM_RADIUS = 70;
export const MAGNETISM_FORCE = 120;

// === SISTEMA DE ONDAS ===
export const TARGET_UPDATE_INTERVAL = 0.15;
export const ASTEROIDS_PER_WAVE_BASE = 4;
export const ASTEROIDS_PER_WAVE_MULTIPLIER = 1.3;
export const WAVE_DURATION = 60; // segundos
export const WAVE_BREAK_TIME = 10; // segundos
export const MAX_ASTEROIDS_ON_SCREEN = 20;

// === UPGRADES ===
export const SPACE_UPGRADES = [
  {
    id: 'plasma',
    name: 'Arma de Plasma',
    description: '+25% dano',
    icon: '⚡',
    color: '#FFD700',
  },
  {
    id: 'propulsors',
    name: 'Propulsores Melhorados',
    description: '+20% velocidade máxima',
    icon: '🚀',
    color: '#00BFFF',
  },
  {
    id: 'shield',
    name: 'Escudo Energético',
    description: '+50 HP máximo',
    icon: '🛡️',
    color: '#32CD32',
  },
  {
    id: 'armor',
    name: 'Blindagem Reativa',
    description: '+25% resistência',
    icon: '🔰',
    color: '#FF6B6B',
  },
  {
    id: 'multishot',
    name: 'Tiro Múltiplo',
    description: '+1 projétil',
    icon: '💥',
    color: '#9932CC',
  },
  {
    id: 'magfield',
    name: 'Campo Magnético',
    description: '+50% alcance magnético',
    icon: '🧲',
    color: '#FF69B4',
  },
];

console.log('[GameConstants] Loaded');
