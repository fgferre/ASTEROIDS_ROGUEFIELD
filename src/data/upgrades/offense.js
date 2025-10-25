// src/data/upgrades/offense.js

// === OFFENSIVE UPGRADES ===

export const OFFENSE_UPGRADES = [
  {
    id: 'plasma',
    category: 'offense',
    icon: '⚡',
    themeColor: '#F6C945',
    unlockLevel: 1,
    tags: ['dano', 'armamento'],
    text: {
      name: 'Arma de Plasma',
      summary:
        'Condensa o canhão principal em plasma superaquecido para multiplicar o potencial ofensivo.',
      lore: 'Tecnologia recuperada dos cascos devastados da frota Perseus. Requer monitoramento constante de temperatura.',
      levels: [
        {
          title: 'Bobina de Fusão',
          description: 'Projéteis padrão causam imediatamente +25% de dano.',
          highlights: ['Multiplicador aplicado diretamente ao dano base.'],
        },
        {
          title: 'Condensadores Geminados',
          description:
            'Aprimora o sistema para alcançar +50% de dano acumulado.',
          highlights: ['Aplica 20% adicionais sobre o dano atual.'],
        },
        {
          title: 'Matriz Harmônica',
          description: 'Estabiliza o plasma para +70% de dano total.',
          highlights: [
            'Fornece multiplicador extra de 15% sobre o valor vigente.',
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
            event: 'upgrade-damage-boost',
            payload: { multiplier: 1.25 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-damage-boost',
            payload: { multiplier: 1.2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-damage-boost',
            payload: { multiplier: 1.15 },
          },
        ],
      },
    ],
  },
  {
    id: 'multishot',
    category: 'offense',
    icon: '💥',
    themeColor: '#A56DFF',
    unlockLevel: 1,
    tags: ['projéteis', 'armamento'],
    text: {
      name: 'Tiro Múltiplo',
      summary:
        'Acopla emissores secundários ao canhão principal para liberar mais projéteis.',
      lore: 'Módulos reutilizáveis recuperados de satélites militares desativados.',
      levels: [
        {
          title: 'Duas Saídas',
          description: 'Dispara um projétil adicional por sequência.',
          highlights: ['Aumenta o volume de fogo instantâneo.'],
        },
        {
          title: 'Grade Triangular',
          description:
            'Adiciona um terceiro disparo, formando padrão em leque.',
          highlights: ['Cobre área maior diante da nave.'],
        },
        {
          title: 'Barragem Sincronizada',
          description: 'Inclui um quarto projétil por sequência.',
          highlights: ['Maximiza saturação em curtas distâncias.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-multishot',
            payload: { bonus: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-multishot',
            payload: { bonus: 1 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-multishot',
            payload: { bonus: 1 },
          },
        ],
      },
    ],
  },
  {
    id: 'targeting_suite',
    category: 'offense',
    icon: '🎯',
    themeColor: '#FFD166',
    unlockLevel: 3,
    tags: ['mira', 'tático', 'armamento'],
    text: {
      name: 'Matriz de Mira',
      summary:
        'Implanta heurísticas de combate que priorizam ameaças críticas e refinam a predição de disparos.',
      lore: 'Firmware experimental extraído de drones de escolta, calibrado para leitura instantânea de perigo em cenários caóticos.',
      levels: [
        {
          title: 'Aquisição Adaptativa',
          description:
            'Ativa uma matriz de periculosidade que privilegia variantes perseguidoras e explosivas antes de qualquer outra ameaça.',
          highlights: [
            'Classifica os inimigos por comportamento, recompensa e direção relativa ao jogador.',
            'Linha de mira pulsa ao fixar um novo alvo prioritário.',
          ],
        },
        {
          title: 'Predição Dinâmica',
          description:
            'Calcula interceptações com base na velocidade real do projétil, reduzindo erros em alvos rápidos.',
          highlights: [
            'Marca visualmente o ponto previsto de impacto.',
            'Modula levemente o timbre do disparo para indicar a predição avançada.',
          ],
        },
        {
          title: 'Travas Coordenadas',
          description:
            'Ativa uma bateria de quatro canhões independentes que priorizam ameaças críticas em paralelo.',
          highlights: [
            'Disponível apenas com Tiro Múltiplo instalado (Nv. 1+).',
            'Coordena até quatro travas e pode concentrar fogo em um único alvo iminente.',
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
            event: 'upgrade-aiming-suite',
            payload: {
              resetWeights: true,
            },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-aiming-suite',
            payload: {
              dynamicPrediction: {
                minLeadTime: 0.05,
                maxLeadTime: 1,
                fallbackLeadTime: 0.32,
              },
            },
          },
        ],
      },
      {
        rank: 3,
        prerequisites: [
          {
            type: 'upgrade',
            id: 'multishot',
            level: 1,
            text: 'Requer Tiro Múltiplo instalado (Nv. 1).',
          },
        ],
        effects: [
          {
            type: 'event',
            event: 'upgrade-aiming-suite',
            payload: {
              multiLockTargets: 4,
              cooldownMultiplier: 0.92,
            },
          },
        ],
      },
    ],
  },
];
