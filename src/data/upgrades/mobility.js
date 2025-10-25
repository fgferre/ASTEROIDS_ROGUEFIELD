// src/data/upgrades/mobility.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === MOBILITY UPGRADES ===

export const MOBILITY_UPGRADES = deepFreeze([
  {
    id: 'propulsors',
    category: 'mobility',
    icon: '🚀',
    themeColor: '#5DADE2',
    unlockLevel: 1,
    tags: ['velocidade', 'mobilidade', 'aceleração'],
    text: {
      name: 'Propulsores Principais',
      summary:
        'Aprimora os motores principais para melhorar aceleração e velocidade máxima.',
      lore: 'Sistema modular de propulsão que evolui de bicos calibrados até sobrecarga vetorial de plasma.',
      levels: [
        {
          title: 'Bicos Otimizados',
          description: 'Aumenta aceleração em +12% e velocidade máxima em +10%.',
          highlights: ['Resposta ligeiramente mais rápida aos comandos.'],
        },
        {
          title: 'Queima Estável',
          description: 'Aceleração +25% e velocidade +22% (acumulado).',
          highlights: ['Propulsão visivelmente melhorada.'],
        },
        {
          title: 'Injeção Dupla',
          description: 'Aceleração +45% e velocidade +38% (acumulado).',
          highlights: ['Desempenho de caça de combate.'],
        },
        {
          title: 'Plasma Superaquecido',
          description: 'Aceleração +75% e velocidade +60% (acumulado).',
          highlights: ['Propulsores em sobrecarga. Chamas brancas visíveis.'],
        },
        {
          title: 'Sobrecarga Vetorial',
          description: 'Aceleração +110% e velocidade +85% (acumulado).',
          highlights: ['Desempenho extremo. Rastro de íons danifica inimigos.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.12 },
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.10 },
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.116 }, // Total: 1.25
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.109 }, // Total: 1.22
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.16 }, // Total: 1.45
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.131 }, // Total: 1.38
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 3 },
          },
        ],
      },
      {
        rank: 4,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.207 }, // Total: 1.75
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.159 }, // Total: 1.60
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 4 },
          },
        ],
      },
      {
        rank: 5,
        effects: [
          {
            type: 'event',
            event: 'upgrade-acceleration-boost',
            payload: { multiplier: 1.2 }, // Total: 2.10
          },
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.156 }, // Total: 1.85
          },
          {
            type: 'event',
            event: 'upgrade-thruster-visual',
            payload: { level: 5 },
          },
          {
            type: 'event',
            event: 'upgrade-ion-trail',
            payload: { enabled: true },
          },
        ],
      },
    ],
  },
  {
    id: 'rcs_system',
    category: 'mobility',
    icon: '🛰️',
    themeColor: '#5DADE2',
    unlockLevel: 2,
    tags: ['rotação', 'agilidade', 'manobras'],
    prerequisites: [
      {
        type: 'upgrade',
        id: 'propulsors',
        level: 1,
        text: 'Requer Propulsores Principais instalados (Nv. 1).',
      },
    ],
    text: {
      name: 'Sistema RCS',
      summary:
        'Ativa propulsores de manobra para controle preciso de rotação e agilidade.',
      lore: 'Sistema de Controle de Reação recuperado de estações espaciais abandonadas. Permite manobras impossíveis para naves convencionais.',
      levels: [
        {
          title: 'RCS Básico',
          description: 'Ativa propulsores auxiliares para +15% de rotação.',
          highlights: ['Resposta perceptível em curvas apertadas.'],
        },
        {
          title: 'RCS Ativado',
          description: 'Rotação +32% e amortecimento angular -12%.',
          highlights: ['Giros notavelmente mais rápidos e precisos.'],
        },
        {
          title: 'RCS Aprimorado',
          description: 'Rotação +55% e amortecimento angular -25%.',
          highlights: ['Controle de caça espacial. Giros instantâneos.'],
        },
        {
          title: 'RCS Vetorial',
          description: 'Rotação +90% e amortecimento angular -40%.',
          highlights: ['Controle sobre-humano. Reversões instantâneas.'],
        },
        {
          title: 'RCS Omni-direcional',
          description: 'Rotação +130% e movimento lateral desbloqueado.',
          highlights: [
            'Controle total vetorial. Movimento independente da orientação.',
          ],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.15 },
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.148 }, // Total: 1.32
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 0.88 }, // -12%
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.174 }, // Total: 1.55
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 0.852 }, // Total: 0.75
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 3 },
          },
        ],
      },
      {
        rank: 4,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.226 }, // Total: 1.90
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 0.8 }, // Total: 0.60
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 4 },
          },
        ],
      },
      {
        rank: 5,
        effects: [
          {
            type: 'event',
            event: 'upgrade-rotation-boost',
            payload: { multiplier: 1.211 }, // Total: 2.30
          },
          {
            type: 'event',
            event: 'upgrade-angular-damping',
            payload: { multiplier: 1.0 }, // Total: 0.60 (no change)
          },
          {
            type: 'event',
            event: 'upgrade-rcs-visual',
            payload: { level: 5 },
          },
          {
            type: 'event',
            event: 'upgrade-strafe-movement',
            payload: { enabled: true },
          },
        ],
      },
    ],
  },
  {
    id: 'braking_system',
    category: 'mobility',
    icon: '⚙️',
    themeColor: '#5DADE2',
    unlockLevel: 3,
    tags: ['controle', 'frenagem', 'precisão'],
    prerequisites: [
      {
        type: 'upgrade',
        id: 'rcs_system',
        level: 2,
        text: 'Requer Sistema RCS ativado (Nv. 2).',
      },
    ],
    text: {
      name: 'Sistema de Frenagem',
      summary:
        'Instala freios inerciais que permitem paradas rápidas e controle preciso.',
      lore: 'Tecnologia de mineração adaptada para combate. Permite paradas impossíveis e mudanças bruscas de direção.',
      levels: [
        {
          title: 'Freios Inerciais',
          description: 'Amortecimento linear +30%. Paradas mais rápidas.',
          highlights: [
            'Reduz inércia ao soltar teclas de movimento. Controle melhorado.',
          ],
        },
        {
          title: 'Retroimpulsores',
          description: 'Amortecimento linear +60%. Reversões quase instantâneas.',
          highlights: [
            'Paradas muito rápidas. Ideal para combate corpo-a-corpo.',
          ],
        },
        {
          title: 'Freio de Emergência',
          description:
            'Amortecimento linear +100%. Desbloqueia habilidade especial.',
          highlights: [
            'Tecla dedicada (Shift) para parada instantânea com onda de choque.',
          ],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.3 },
          },
          {
            type: 'event',
            event: 'upgrade-braking-visual',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.231 }, // Total: 1.60
          },
          {
            type: 'event',
            event: 'upgrade-braking-visual',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-linear-damping',
            payload: { multiplier: 1.25 }, // Total: 2.00
          },
          {
            type: 'event',
            event: 'upgrade-braking-visual',
            payload: { level: 3 },
          },
          {
            type: 'event',
            event: 'upgrade-emergency-brake',
            payload: { enabled: true },
          },
        ],
      },
    ],
  },
]);
