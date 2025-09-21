const HUD_LAYOUT = [
  {
    key: 'health',
    type: 'stat',
    label: 'Integridade',
    description: 'Integridade atual e máxima da nave',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
        },
      ],
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
    label: 'Escudo',
    description: 'Estado do escudo defletor',
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
    key: 'level',
    type: 'stat',
    label: 'Level',
    description: 'Nível atual do piloto',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
        },
      ],
    },
    rootId: 'hud-level',
    valueId: 'level-display',
    initialValue: 'Level 1',
    ariaLive: 'polite',
  },
  {
    key: 'kills',
    type: 'stat',
    label: 'Abates',
    description: 'Total de asteroides destruídos na sessão',
    icon: {
      type: 'svg',
      viewBox: '0 0 24 24',
      paths: [
        {
          d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z',
        },
      ],
    },
    rootId: 'hud-kills',
    valueId: 'kills-display',
    initialValue: '0 asteroides',
    ariaLive: 'polite',
  },
  {
    key: 'time',
    type: 'stat',
    label: 'Tempo',
    description: 'Tempo total de sobrevivência na sessão atual',
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
];

export default HUD_LAYOUT;
