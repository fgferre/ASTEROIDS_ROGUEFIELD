// src/data/upgrades/categories.js

import { deepFreeze } from '../../utils/deepFreeze.js';

/**
 * @typedef {Object} UpgradeCategory
 * @property {string} id Unique identifier for the category.
 * @property {string} label Human-readable label displayed to players.
 * @property {string} description Summary of the category focus.
 * @property {string} icon Emoji or icon string representing the category.
 * @property {string} themeColor Hex color used for UI theming.
 */

export const UPGRADE_CATEGORIES = deepFreeze({
  offense: {
    id: 'offense',
    label: 'Ofensiva',
    description:
      'Potencializa o armamento principal e aumenta o dano por disparo.',
    icon: '✴️',
    themeColor: '#F6C945',
  },
  defense: {
    id: 'defense',
    label: 'Defensiva',
    description:
      'Fortalece o casco, reforça o escudo e amplia a sobrevivência.',
    icon: '🛡️',
    themeColor: '#4ECDC4',
  },
  mobility: {
    id: 'mobility',
    label: 'Mobilidade',
    description: 'Aprimora propulsores, aceleração e controle da nave.',
    icon: '🛰️',
    themeColor: '#5DADE2',
  },
  utility: {
    id: 'utility',
    label: 'Utilitária',
    description: 'Otimiza coleta, magnetismo e suporte tático.',
    icon: '🧲',
    themeColor: '#C08BFF',
  },
});
