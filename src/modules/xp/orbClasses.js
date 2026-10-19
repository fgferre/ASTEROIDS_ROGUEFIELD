// The XP orb classes (blue to crystal): tier, colours, and which class a
// fused cluster becomes.

const ORB_CLASS_ORDER = [
  { name: 'blue', tier: 1 },
  { name: 'green', tier: 2 },
  { name: 'yellow', tier: 3 },
  { name: 'purple', tier: 4 },
  { name: 'red', tier: 5 },
  { name: 'crystal', tier: 6 },
];

const ORB_COLOR_PALETTE = {
  blue: {
    baseColor: '#00DDFF',
    glowColor: 'rgba(0, 221, 255, 0.35)',
    highlightColor: '#E9FCFF',
    fusionFlash: 'rgba(0, 221, 255, 0.55)',
  },
  green: {
    baseColor: '#00FF00',
    glowColor: 'rgba(0, 255, 0, 0.35)',
    highlightColor: '#E6FFE6',
    fusionFlash: 'rgba(0, 255, 0, 0.55)',
  },
  yellow: {
    baseColor: '#FFFF00',
    glowColor: 'rgba(255, 255, 0, 0.35)',
    highlightColor: '#FFFFE6',
    fusionFlash: 'rgba(255, 255, 0, 0.55)',
  },
  purple: {
    baseColor: '#9932CC',
    glowColor: 'rgba(153, 50, 204, 0.35)',
    highlightColor: '#F3E6FF',
    fusionFlash: 'rgba(153, 50, 204, 0.55)',
  },
  red: {
    baseColor: '#FF0000',
    glowColor: 'rgba(255, 0, 0, 0.35)',
    highlightColor: '#FFE6E6',
    fusionFlash: 'rgba(255, 0, 0, 0.6)',
  },
  crystal: {
    baseColor: '#8DF7FF',
    glowColor: 'rgba(120, 240, 255, 0.55)',
    highlightColor: '#F2FFFF',
    fusionFlash: 'rgba(135, 255, 255, 0.75)',
  },
};

export const ORB_CLASS_CONFIG = ORB_CLASS_ORDER.map(({ name, tier }) => {
  const palette = ORB_COLOR_PALETTE[name] || {};
  return {
    name,
    tier,
    baseColor: palette.baseColor || '#FFFFFF',
    glowColor: palette.glowColor || 'rgba(255, 255, 255, 0.35)',
    highlightColor: palette.highlightColor || '#FFFFFF',
    fusionFlash: palette.fusionFlash || 'rgba(255, 255, 255, 0.55)',
  };
});

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
