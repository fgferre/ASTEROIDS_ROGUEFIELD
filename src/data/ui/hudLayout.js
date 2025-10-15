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
];

const MINIMAL_TACTICAL_LAYOUT_ITEMS = [
  {
    key: 'health',
    type: 'stat',
    position: 'top-middle',
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
    position: 'top-middle',
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
    position: 'top-middle',
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
    position: 'top-middle',
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
    position: 'bottom-center',
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
    position: 'bottom-center',
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
      'Faixa superior compacta, XP centralizado e status de onda no rodapé.',
    items: MINIMAL_TACTICAL_LAYOUT_ITEMS,
  },
};

export const DEFAULT_HUD_LAYOUT_ID = 'classic';

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
