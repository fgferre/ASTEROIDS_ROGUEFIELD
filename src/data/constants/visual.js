// src/data/constants/visual.js

import { deepFreeze } from '../../utils/deepFreeze.js';
import { DRONE_CONFIG, DRONE_REWARDS } from '../enemies/drone.js';
import { HUNTER_CONFIG, HUNTER_REWARDS } from '../enemies/hunter.js';
import { MINE_CONFIG, MINE_REWARDS } from '../enemies/mine.js';
import {
  BOSS_CONFIG,
  BOSS_PHYSICS_CONFIG,
  BOSS_EFFECTS_PRESETS,
  BOSS_SCREEN_SHAKES,
  BOSS_REWARDS,
} from '../enemies/boss.js';

// === RE-EXPORTS FOR BACKWARD COMPATIBILITY ===
// NOTE: Enemy stats have been moved to dedicated config files in src/data/enemies/
// This file now focuses on visual/rendering constants while re-exporting the data
// for consumers that still import from visual.js directly.
export const ENEMY_TYPES = deepFreeze({
  drone: DRONE_CONFIG,
  mine: MINE_CONFIG,
  hunter: HUNTER_CONFIG,
});

export { BOSS_CONFIG, BOSS_PHYSICS_CONFIG, BOSS_EFFECTS_PRESETS, BOSS_SCREEN_SHAKES };


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
  drone: DRONE_REWARDS,
  mine: MINE_REWARDS,
  hunter: HUNTER_REWARDS,
  boss: BOSS_REWARDS,
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


