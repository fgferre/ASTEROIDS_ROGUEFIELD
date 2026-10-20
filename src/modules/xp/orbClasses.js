// The XP orb classes (blue to crystal): tier, size, weight, colours, and
// which class a fused cluster becomes.
import { XP_ORB_SIZE } from '../../core/GameConstants.js';

// proposta 20/10: each class is told apart by its size (× XP_ORB_SIZE) as
// well as its colour, and from yellow up by its shards (fieldTokens.js).
// `weight` slows it: the burst drags it harder and the magnet ramps it up
// slower (XP_ORB_BURST, XP_ORB_MAGNET_RAMP_SECONDS).
const ORB_CLASS_ORDER = [
  { name: 'blue', tier: 1, size: 1, weight: 1 },
  { name: 'green', tier: 2, size: 1.25, weight: 1.2 },
  { name: 'yellow', tier: 3, size: 1.55, weight: 1.45 },
  { name: 'purple', tier: 4, size: 1.9, weight: 1.75 },
  { name: 'red', tier: 5, size: 2.25, weight: 2.1 },
  { name: 'crystal', tier: 6, size: 2.7, weight: 2.5 },
];

// proposta 20/10: one gold family (docs/NORTE.md §2, XP is gold), climbing
// with value from the XP gold to white-hot and an icy crystal; the class
// names are the old 2D colours.
const ORB_COLOR_PALETTE = {
  blue: {
    baseColor: '#FFD700',
    glowColor: 'rgba(255, 215, 0, 0.35)',
    highlightColor: '#FFF6CC',
    fusionFlash: 'rgba(255, 215, 0, 0.55)',
  },
  green: {
    baseColor: '#FFE45C',
    glowColor: 'rgba(255, 228, 92, 0.35)',
    highlightColor: '#FFF8D6',
    fusionFlash: 'rgba(255, 228, 92, 0.55)',
  },
  yellow: {
    baseColor: '#FFEE99',
    glowColor: 'rgba(255, 238, 153, 0.35)',
    highlightColor: '#FFFAE0',
    fusionFlash: 'rgba(255, 238, 153, 0.55)',
  },
  purple: {
    baseColor: '#FFF5C7',
    glowColor: 'rgba(255, 245, 199, 0.35)',
    highlightColor: '#FFFDF0',
    fusionFlash: 'rgba(255, 245, 199, 0.55)',
  },
  red: {
    baseColor: '#FFFBEB',
    glowColor: 'rgba(255, 251, 235, 0.4)',
    highlightColor: '#FFFFFF',
    fusionFlash: 'rgba(255, 251, 235, 0.6)',
  },
  crystal: {
    baseColor: '#EFFBFF',
    glowColor: 'rgba(225, 248, 255, 0.55)',
    highlightColor: '#FFFFFF',
    fusionFlash: 'rgba(225, 248, 255, 0.75)',
  },
};

export const ORB_CLASS_CONFIG = ORB_CLASS_ORDER.map(
  ({ name, tier, size, weight }) => {
    const palette = ORB_COLOR_PALETTE[name] || {};
    return {
      name,
      tier,
      radius: XP_ORB_SIZE * size,
      weight,
      baseColor: palette.baseColor || '#FFFFFF',
      glowColor: palette.glowColor || 'rgba(255, 255, 255, 0.35)',
      highlightColor: palette.highlightColor || '#FFFFFF',
      fusionFlash: palette.fusionFlash || 'rgba(255, 255, 255, 0.55)',
    };
  }
);

export const ORB_CLASSES = ORB_CLASS_CONFIG.reduce((lookup, config) => {
  lookup[config.name] = config;
  return lookup;
}, {});

export const ORB_CLASS_SEQUENCE = ORB_CLASS_CONFIG.map((config) => config.name);

export const ORB_NEXT_CLASS = ORB_CLASS_CONFIG.reduce(
  (lookup, config, index, array) => {
    lookup[config.name] = array[index + 1]?.name || null;
    return lookup;
  },
  {}
);

export function getOrbConfig(className) {
  return ORB_CLASSES[className] || ORB_CLASSES.blue;
}
