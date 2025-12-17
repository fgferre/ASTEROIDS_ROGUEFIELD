/**
 * Canonical asteroid configurations used across balance tests.
 *
 * @type {Record<string, { size: 'large'|'medium'|'small', variant: string, x: number, y: number, vx: number, vy: number, wave: number }>}
 */
export const ASTEROID_TEST_CONFIGS = {
  largeCommon: {
    size: 'large',
    variant: 'common',
    x: 0,
    y: 0,
    vx: 60,
    vy: -40,
    wave: 1,
  },
  largeIron: {
    size: 'large',
    variant: 'iron',
    x: 0,
    y: 0,
    vx: 60,
    vy: -40,
    wave: 1,
  },
  largeDenseCore: {
    size: 'large',
    variant: 'denseCore',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  largeVolatile: {
    size: 'large',
    variant: 'volatile',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  largeCrystal: {
    size: 'large',
    variant: 'crystal',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  mediumCommon: {
    size: 'medium',
    variant: 'common',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  mediumIron: {
    size: 'medium',
    variant: 'iron',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  mediumParasite: {
    size: 'medium',
    variant: 'parasite',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 4,
  },
  mediumVolatile: {
    size: 'medium',
    variant: 'volatile',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  mediumCrystal: {
    size: 'medium',
    variant: 'crystal',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  smallCommon: {
    size: 'small',
    variant: 'common',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 1,
  },
  smallGold: {
    size: 'small',
    variant: 'gold',
    x: 0,
    y: 0,
    vx: 45,
    vy: -30,
    wave: 6,
  },
};

/**
 * Representative wave numbers employed for scaling assertions.
 *
 * @type {number[]}
 */
export const WAVE_TEST_SAMPLES = [1, 4, 7, 10];

/**
 * Exhaustive asteroid sizes used by the balance test suite.
 *
 * @type {Array<'large'|'medium'|'small'>}
 */
export const SIZE_TEST_SAMPLES = ['large', 'medium', 'small'];

/**
 * Asteroid variants with bespoke fragmentation rules.
 *
 * @type {string[]}
 */
export const FRAGMENT_VARIANT_SAMPLES = [
  'common',
  'iron',
  'denseCore',
  'volatile',
  'parasite',
  'crystal',
];
