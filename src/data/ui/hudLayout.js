// src/data/ui/hudLayout.js

const CLASSIC_LAYOUT_ITEMS = [
  {
    key: 'health',
    type: 'stat',
    position: 'top-left',
    group: 'status-progress',
    layout: 'inline-progress',
    description: 'Current and maximum ship health',
    icon: {
      type: 'text',
      value: '❤️',
    },
    rootId: 'hud-health',
    valueId: 'health-display',
    initialValue: '0/0',
    thresholds: {
      danger: 0.35,
    },
    ariaLive: 'polite',
  },
  {
    key: 'shield',
    type: 'shield',
    position: 'top-left',
    group: 'status-progress',
    layout: 'inline-progress',
    description: 'Deflector shield status',
    icon: {
      type: 'text',
      value: '💠',
    },
    rootId: 'shield-status',
    valueId: 'shield-hit-count',
    overlayId: 'shield-cooldown-overlay',
    initialValue: '--',
    ariaLive: 'polite',
  },
  {
    key: 'xp',
    type: 'xp',
    position: 'top-left',
    group: 'status-progress',
    layout: 'inline-progress',
    description: 'Experience towards the next level',
    icon: {
      type: 'text',
      value: '⚡',
    },
    metaPosition: 'after-value',
    meta: {
      id: 'xp-level-indicator',
      initialValue: 'Lv 1',
      ariaLabel: 'Current pilot level',
      classes: ['hud-item__meta--level'],
    },
    rootId: 'hud-xp-inline',
    valueId: 'xp-display',
    initialValue: '0/1',
    ariaLive: 'polite',
  },
  {
    key: 'wave',
    type: 'wave',
    position: 'top-left',
    group: 'wave-status',
    layout: 'inline-progress',
    description: 'Current wave progress',
    icon: {
      type: 'svg',
      viewBox: '0 0 32 32',
      paths: [
        {
          d: 'M12.2 4.5 5.7 12.3 4 21.9l6.4 5.6h10.5l5.8-8.4-1.7-10.4L18 4.5z',
          fill: 'currentColor',
        },
        {
          d: 'M13.6 8.2 9.1 14.1l-.8 5.8 3.7 3.2h7.6l4.2-6.1-1.2-7.2-4.8-2.7z',
          fill: 'rgba(255, 255, 255, 0.45)',
        },
      ],
    },
    rootId: 'hud-wave',
    progressBarId: 'wave-progress',
    progressFillId: 'wave-progress-bar',
    valueId: 'wave-enemies',
    initialValue: '0/0',
    ariaLive: 'polite',
    metaPosition: 'after-value',
    meta: {
      id: 'wave-number',
      initialValue: 'Wave 1',
      ariaLabel: 'Current wave number',
      classes: ['hud-item__meta--wave'],
    },
  },
  {
    key: 'kills',
    type: 'stat',
    position: 'top-left',
    group: 'wave-status',
    layout: 'inline-value',
    description: 'Total asteroids destroyed in session',
    icon: {
      type: 'svg',
      viewBox: '0 0 32 32',
      paths: [
        {
          d: 'M12.2 4.5 5.7 12.3 4 21.9l6.4 5.6h10.5l5.8-8.4-1.7-10.4L18 4.5z',
          fill: 'currentColor',
        },
        {
          d: 'M13.6 8.2 9.1 14.1l-.8 5.8 3.7 3.2h7.6l4.2-6.1-1.2-7.2-4.8-2.7z',
          fill: 'rgba(255, 255, 255, 0.45)',
        },
      ],
    },
    rootId: 'hud-kills',
    valueId: 'kills-display',
    initialValue: '0',
    ariaLive: 'polite',
  },
  {
    key: 'time',
    type: 'stat',
    position: 'top-right',
    label: 'Time',
    description: 'Total survival time in current session',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
        },
        {
          d: 'M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z',
        },
      ],
    },
    rootId: 'hud-time',
    valueId: 'time-display',
    initialValue: '0s',
    ariaLive: 'polite',
  },
  {
    key: 'boss',
    type: 'boss',
    position: 'top-middle',
    layout: 'boss',
    description: 'Boss encounter status',
    rootId: 'hud-boss',
  },
  {
    key: 'minimap',
    type: 'minimap',
    position: 'top-right',
    group: 'status-intel',
    layout: 'custom',
    label: '',
    description: 'Tactical minimap showing nearby threats within radar range.',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18.5A8.5 8.5 0 1 1 20.5 12 8.5 8.5 0 0 1 12 20.5z',
          fill: 'currentColor',
        },
        {
          d: 'M12 6.75a5.25 5.25 0 1 0 5.25 5.25A5.25 5.25 0 0 0 12 6.75zm0 8.25a3 3 0 1 1 3-3 3 3 0 0 1-3 3z',
          fill: 'rgba(255, 255, 255, 0.65)',
        },
        {
          d: 'M12 3.75v3M20.25 12h-3M12 20.25v-3M4.75 12H8',
          fill: 'currentColor',
        },
      ],
    },
    rootId: 'hud-minimap',
    ariaLive: 'off',
    initialValue: '',
    meta: {
      id: 'minimap-range',
      initialValue: 'Range 300u',
      ariaLabel: 'Radar coverage radius in units',
      classes: ['minimap-range'],
    },
    custom: {
      element: 'canvas',
      id: 'minimap-canvas',
      width: 120,
      height: 120,
      classes: ['minimap-canvas'],
      dataset: {
        range: 300,
      },
    },
  },
  {
    key: 'threatIndicators',
    type: 'threat-indicators',
    position: 'top-middle',
    group: 'status-alerts',
    layout: 'custom',
    label: '',
    description:
      'Directional indicators highlighting off-screen hostile contacts.',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M12 3.5L4 20.5l8-3 8 3z',
          fill: 'currentColor',
        },
        {
          d: 'M12 6.5L7 17.1l5-1.9 5 1.9z',
          fill: 'rgba(255, 255, 255, 0.5)',
        },
      ],
    },
    rootId: 'threat-indicators-container',
    ariaLive: 'off',
    initialValue: '',
    custom: {
      element: 'div',
      id: 'threat-indicators-overlay',
      classes: ['threat-indicators-container'],
    },
    accessibilityHint:
      'Indicators pulse to show the direction and relative urgency of approaching enemies.',
  },
  {
    key: 'comboMeter',
    type: 'combo',
    position: 'top-left',
    group: 'status-progress',
    layout: 'inline-value',
    description: 'Active combo streak and multiplier from recent eliminations.',
    icon: {
      type: 'text',
      value: '🔥',
    },
    rootId: 'hud-combo',
    valueId: 'combo-display',
    initialValue: '0 Hits',
    ariaLive: 'polite',
    metaPosition: 'after-value',
    meta: {
      id: 'combo-multiplier',
      initialValue: 'x1.0',
      ariaLabel: 'Current combo multiplier',
      classes: ['combo-multiplier'],
    },
  },
];

const MINIMAL_TACTICAL_LAYOUT_ITEMS = [
  {
    key: 'health',
    type: 'stat',
    position: 'top-left',
    group: 'tactical-vitals',
    layout: 'inline-progress',
    description: 'Current and maximum ship health',
    icon: {
      type: 'text',
      value: '❤️',
    },
    rootId: 'hud-health',
    valueId: 'health-display',
    initialValue: '0/0',
    thresholds: {
      danger: 0.35,
    },
    ariaLive: 'polite',
  },
  {
    key: 'shield',
    type: 'shield',
    position: 'top-left',
    group: 'tactical-vitals',
    layout: 'inline-progress',
    description: 'Deflector shield status',
    icon: {
      type: 'text',
      value: '💠',
    },
    rootId: 'shield-status',
    valueId: 'shield-hit-count',
    overlayId: 'shield-cooldown-overlay',
    initialValue: '--',
    ariaLive: 'polite',
  },
  {
    key: 'kills',
    type: 'stat',
    position: 'top-right',
    group: 'tactical-session',
    layout: 'inline-value',
    description: 'Total asteroids destroyed in session',
    icon: {
      type: 'svg',
      viewBox: '0 0 32 32',
      paths: [
        {
          d: 'M12.2 4.5 5.7 12.3 4 21.9l6.4 5.6h10.5l5.8-8.4-1.7-10.4L18 4.5z',
          fill: 'currentColor',
        },
        {
          d: 'M13.6 8.2 9.1 14.1l-.8 5.8 3.7 3.2h7.6l4.2-6.1-1.2-7.2-4.8-2.7z',
          fill: 'rgba(255, 255, 255, 0.45)',
        },
      ],
    },
    rootId: 'hud-kills',
    valueId: 'kills-display',
    initialValue: '0',
    ariaLive: 'polite',
  },
  {
    key: 'time',
    type: 'stat',
    position: 'top-right',
    group: 'tactical-session',
    layout: 'inline-value',
    description: 'Total survival time in current session',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z',
        },
        {
          d: 'M12.5 7H11v6l5.25 3.15.75-1.23-4.5-2.67z',
        },
      ],
    },
    rootId: 'hud-time',
    valueId: 'time-display',
    initialValue: '0s',
    ariaLive: 'polite',
  },
  {
    key: 'boss',
    type: 'boss',
    position: 'top-middle',
    layout: 'boss',
    description: 'Boss encounter status',
    rootId: 'hud-boss',
  },
  {
    key: 'xp',
    type: 'xp',
    position: 'bottom-left',
    layout: 'inline-progress',
    description: 'Experience towards the next level',
    icon: {
      type: 'text',
      value: '⚡',
    },
    leading: {
      id: 'xp-label',
      initialValue: 'XP / Lvl 1',
      classes: ['hud-item__leading--xp'],
    },
    rootId: 'hud-xp',
    valueId: 'xp-display',
    initialValue: '0/1',
    ariaLive: 'polite',
  },
  {
    key: 'wave',
    type: 'wave',
    position: 'bottom-right',
    layout: 'inline-progress',
    description: 'Current wave progress',
    leading: {
      id: 'wave-label',
      initialValue: 'WAVE 1',
      classes: ['hud-item__leading--wave'],
    },
    icon: {
      type: 'svg',
      viewBox: '0 0 32 32',
      paths: [
        {
          d: 'M12.2 4.5 5.7 12.3 4 21.9l6.4 5.6h10.5l5.8-8.4-1.7-10.4L18 4.5z',
          fill: 'currentColor',
        },
        {
          d: 'M13.6 8.2 9.1 14.1l-.8 5.8 3.7 3.2h7.6l4.2-6.1-1.2-7.2-4.8-2.7z',
          fill: 'rgba(255, 255, 255, 0.45)',
        },
      ],
    },
    rootId: 'hud-wave',
    progressBarId: 'wave-progress',
    progressFillId: 'wave-progress-bar',
    valueId: 'wave-enemies',
    initialValue: '0/0',
    ariaLive: 'polite',
    meta: {
      id: 'wave-number',
      initialValue: 'Wave 1',
      ariaLabel: 'Current wave number',
      classes: ['hud-item__meta--wave'],
    },
  },
  {
    key: 'minimap',
    type: 'minimap',
    position: 'bottom-center',
    group: 'tactical-intel',
    layout: 'custom',
    label: '',
    description:
      'Compact tactical minimap showing entities within a 300 unit radius.',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18.25A8.25 8.25 0 1 1 20.25 12 8.26 8.26 0 0 1 12 20.25z',
          fill: 'currentColor',
        },
        {
          d: 'M12 7.25a4.75 4.75 0 1 0 4.75 4.75A4.75 4.75 0 0 0 12 7.25zm0 7a2.25 2.25 0 1 1 2.25-2.25A2.25 2.25 0 0 1 12 14.25z',
          fill: 'rgba(255, 255, 255, 0.65)',
        },
        {
          d: 'M12 4.25v2.5M19.25 12h-2.5M12 19.75v-2.5M6.75 12H9.5',
          fill: 'currentColor',
        },
      ],
    },
    rootId: 'hud-minimap',
    ariaLive: 'off',
    initialValue: '',
    meta: {
      id: 'minimap-range',
      initialValue: 'Range 300u',
      ariaLabel: 'Radar coverage radius in units',
      classes: ['minimap-range'],
    },
    custom: {
      element: 'canvas',
      id: 'minimap-canvas',
      width: 120,
      height: 120,
      classes: ['minimap-canvas'],
      dataset: {
        range: 300,
      },
    },
  },
  {
    key: 'threatIndicators',
    type: 'threat-indicators',
    position: 'top-middle',
    group: 'tactical-alerts',
    layout: 'custom',
    label: '',
    description:
      'Directional threat indicators for enemies outside the camera view.',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M12 3L5 21l7-2.6L19 21z',
          fill: 'currentColor',
        },
        {
          d: 'M12 6.25L7.9 16.4l4.1-1.5 4.1 1.5z',
          fill: 'rgba(255, 255, 255, 0.5)',
        },
      ],
    },
    rootId: 'threat-indicators-container',
    ariaLive: 'off',
    initialValue: '',
    custom: {
      element: 'div',
      id: 'threat-indicators-overlay',
      classes: ['threat-indicators-container'],
    },
    accessibilityHint:
      'Indicators pulse to show the direction and relative urgency of approaching enemies.',
  },
  {
    key: 'comboMeter',
    type: 'combo',
    position: 'top-left',
    group: 'tactical-vitals',
    layout: 'inline-value',
    description:
      'Current combo streak and multiplier earned from consecutive hits.',
    icon: {
      type: 'text',
      value: '🔥',
    },
    rootId: 'hud-combo',
    valueId: 'combo-display',
    initialValue: '0 Hits',
    ariaLive: 'polite',
    metaPosition: 'after-value',
    meta: {
      id: 'combo-multiplier',
      initialValue: 'x1.0',
      ariaLabel: 'Current combo multiplier',
      classes: ['combo-multiplier'],
    },
  },
];

const AAA_LAYOUT_ITEMS = [
  // --- TOP LEFT: Stats ---
  {
    key: 'comboMeter',
    type: 'combo',
    position: 'top-left',
    group: 'aaa-stats',
    layout: 'aaa-combo', // Custom layout for Phase 3
    description: 'Active combo streak',
    rootId: 'hud-combo',
    valueId: 'combo-display',
    initialValue: 'x0',
    ariaLive: 'polite',
  },
  {
    key: 'statsWidget',
    type: 'composite',
    position: 'top-left',
    group: 'aaa-stats-grid',
    layout: 'aaa-stats-widget',
    rootId: 'hud-stats-grid',
  },

  // --- TOP MIDDLE: Boss & Threats ---
  {
    key: 'boss',
    type: 'boss',
    position: 'top-middle',
    layout: 'aaa-boss', // Custom skull layout
    rootId: 'hud-boss',
  },
  {
    key: 'threatIndicators',
    type: 'threat-indicators',
    position: 'top-middle',
    rootId: 'threat-indicators-container',
  },

  // --- TOP RIGHT: Radar ---
  {
    key: 'minimap',
    type: 'minimap',
    position: 'top-right',
    layout: 'aaa-radar', // Custom radar layout
    rootId: 'hud-minimap',
    custom: {
      element: 'div', // Changed to div wrapper structure
      id: 'radar-root',
      classes: ['radar-structure'],
    },
  },

  // --- BOTTOM LEFT: Vitals (Unified Status Widget) ---
  {
    key: 'statusWidget',
    type: 'composite', // Special type for multi-data widget
    position: 'bottom-left',
    group: 'aaa-vitals',
    layout: 'aaa-status-widget',
    rootId: 'hud-status-area',
  },

  // --- BOTTOM CENTER: Wave & XP ---
  {
    key: 'wave',
    type: 'wave',
    position: 'bottom-center',
    layout: 'aaa-wave-circle', // Rotating circle layout
    rootId: 'hud-wave',
    valueId: 'wave-current',
    initialValue: '0',
  },
  {
    key: 'xp',
    type: 'xp',
    position: 'bottom-center',
    layout: 'aaa-xp-bar', // Styled XP bar
    rootId: 'hud-xp',
    valueId: 'xp-display',
    initialValue: '0%',
  },

  // --- BOTTOM RIGHT: Systems ---
  {
    key: 'nav',
    type: 'stat', // Generic stat for now
    position: 'bottom-right',
    layout: 'aaa-nav-block', // Skewed block layout
    label: 'NAV SYSTEMS',
    rootId: 'hud-nav',
    valueId: 'nav-display',
    initialValue: 'ONLINE',
  },
];

const HUD_LAYOUTS = {
  classic: {
    id: 'classic',
    label: 'HUD Clássico',
    description:
      'Layout original com colunas laterais e indicadores empilhados.',
    items: CLASSIC_LAYOUT_ITEMS,
  },
  minimal: {
    id: 'minimal',
    label: 'HUD Tático Minimalista',
    description:
      'Faixa superior compacta, XP à esquerda, minimapa central e onda à direita no rodapé.',
    items: MINIMAL_TACTICAL_LAYOUT_ITEMS,
  },
  aaa: {
    id: 'aaa',
    label: 'AAA High-Fidelity',
    description:
      'Interface avançada com visual Sci-Fi, glassmorphism e efeitos de neon.',
    items: AAA_LAYOUT_ITEMS,
  },
  aaa_tactical: {
    id: 'aaa_tactical',
    label: 'AAA Tactical (Mockup)',
    description: 'HUD tático AAA integrado via módulo (layoutmockupstudy.html).',
    plugin: {
      module: 'AAAHudLayout',
      radarRange: 1500,
    },
    items: [],
  },
};

export const DEFAULT_HUD_LAYOUT_ID = 'aaa_tactical'; // Switch default to AAA for testing

export const HUD_LAYOUT_IDS = {
  AAA_TACTICAL: 'aaa_tactical',
};

export const HUD_LAYOUT_OPTIONS = Object.values(HUD_LAYOUTS).map(
  ({ id, label, description }) => ({
    id,
    value: id,
    label,
    description,
  })
);

export const HUD_LAYOUT_OPTION_LABELS = HUD_LAYOUT_OPTIONS.reduce(
  (accumulator, option) => {
    accumulator[option.value] = option.label;
    return accumulator;
  },
  {}
);

export function getHudLayoutDefinition(id = DEFAULT_HUD_LAYOUT_ID) {
  return HUD_LAYOUTS[id] || HUD_LAYOUTS[DEFAULT_HUD_LAYOUT_ID];
}

export function getHudLayoutItems(id = DEFAULT_HUD_LAYOUT_ID) {
  const layout = getHudLayoutDefinition(id);
  return Array.isArray(layout.items) ? layout.items : [];
}

export default HUD_LAYOUTS;
