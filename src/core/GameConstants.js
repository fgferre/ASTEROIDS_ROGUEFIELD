// src/core/GameConstants.js

// === DIMENSÕES DO JOGO ===
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const SHIP_SIZE = 15;

// === TAMANHOS DE OBJETOS ===
const ASTEROID_SIZES = {
    large: 35,
    medium: 22,
    small: 12
};

const BULLET_SIZE = 3;
const XP_ORB_SIZE = 8;
const TRAIL_LENGTH = 6;

// === FÍSICA DA NAVE ===
const SHIP_ACCELERATION = 280;
const SHIP_MAX_SPEED = 220;
const SHIP_LINEAR_DAMPING = 3.9; // s^-1
const SHIP_ROTATION_SPEED = 8; // rad/s
const SHIP_ANGULAR_DAMPING = 8.0; // s^-1
const SHIP_MASS = 60;

// === VELOCIDADES ===
const ASTEROID_SPEEDS = {
    large: 25,
    medium: 45,
    small: 70
};

const BULLET_SPEED = 450;
const COLLISION_BOUNCE = 0.6;

// === MAGNETISMO ===
const MAGNETISM_RADIUS = 70;
const MAGNETISM_FORCE = 120;

// === SISTEMA DE ONDAS ===
const TARGET_UPDATE_INTERVAL = 0.15;
const ASTEROIDS_PER_WAVE_BASE = 4;
const ASTEROIDS_PER_WAVE_MULTIPLIER = 1.3;
const WAVE_DURATION = 60; // segundos
const WAVE_BREAK_TIME = 10; // segundos  
const MAX_ASTEROIDS_ON_SCREEN = 20;

// === UPGRADES ===
const SPACE_UPGRADES = [
    { id: 'plasma', name: 'Arma de Plasma', description: '+25% dano', icon: '⚡', color: '#FFD700' },
    { id: 'propulsors', name: 'Propulsores Melhorados', description: '+20% velocidade máxima', icon: '🚀', color: '#00BFFF' },
    { id: 'shield', name: 'Escudo Energético', description: '+50 HP máximo', icon: '🛡️', color: '#32CD32' },
    { id: 'armor', name: 'Blindagem Reativa', description: '+25% resistência', icon: '🔰', color: '#FF6B6B' },
    { id: 'multishot', name: 'Tiro Múltiplo', description: '+1 projétil', icon: '💥', color: '#9932CC' },
    { id: 'magfield', name: 'Campo Magnético', description: '+50% alcance magnético', icon: '🧲', color: '#FF69B4' }
];

// Exportar como CommonJS
module.exports = {
    GAME_WIDTH,
    GAME_HEIGHT,
    SHIP_SIZE,
    ASTEROID_SIZES,
    BULLET_SIZE,
    XP_ORB_SIZE,
    TRAIL_LENGTH,
    SHIP_ACCELERATION,
    SHIP_MAX_SPEED,
    SHIP_LINEAR_DAMPING,
    SHIP_ROTATION_SPEED,
    SHIP_ANGULAR_DAMPING,
    SHIP_MASS,
    ASTEROID_SPEEDS,
    BULLET_SPEED,
    COLLISION_BOUNCE,
    MAGNETISM_RADIUS,
    MAGNETISM_FORCE,
    TARGET_UPDATE_INTERVAL,
    ASTEROIDS_PER_WAVE_BASE,
    ASTEROIDS_PER_WAVE_MULTIPLIER,
    WAVE_DURATION,
    WAVE_BREAK_TIME,
    MAX_ASTEROIDS_ON_SCREEN,
    SPACE_UPGRADES
};

console.log('[GameConstants] Loaded');
