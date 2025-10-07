// src/data/upgrades.js

export const UPGRADE_CATEGORIES = {
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
};

const UPGRADE_LIBRARY = [
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
    id: 'shield',
    category: 'defense',
    icon: '🛡️',
    themeColor: '#4ECDC4',
    unlockLevel: 1,
    tags: ['vida', 'casco'],
    text: {
      name: 'Escudo Energético',
      summary:
        'Instala bobinas regenerativas que aumentam a capacidade estrutural do casco.',
      lore: 'Sistema adaptado dos cargueiros Typhon. Opera em paralelo ao escudo defletor ativável.',
      levels: [
        {
          title: 'Reservas Auxiliares',
          description: 'Aumenta a vida máxima em +50 pontos.',
          highlights: [
            'Aplica bônus direto de +50 HP e cura imediata equivalente.',
          ],
        },
        {
          title: 'Camada de Grafeno',
          description: 'Adiciona mais +50 pontos de vida máxima.',
          highlights: ['Bônus cumulativo, totalizando +100 HP adicionais.'],
        },
        {
          title: 'Matriz Autorreparadora',
          description: 'Amplia a reserva total em +75 pontos extras.',
          highlights: ['Total de +175 HP extras após o terceiro nível.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 50 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 50 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-health-boost',
            payload: { bonus: 75 },
          },
        ],
      },
    ],
  },
  {
    id: 'deflector_shield',
    category: 'defense',
    icon: '💠',
    themeColor: '#5EC8FF',
    unlockLevel: 2,
    tags: ['escudo', 'defesa ativa'],
    prerequisites: [
      {
        type: 'upgrade',
        id: 'shield',
        level: 1,
        text: 'Requer Escudo Energético instalado (Nv. 1).',
      },
    ],
    text: {
      name: 'Matriz de Deflexão',
      summary:
        'Implementa um escudo ativável capaz de absorver impactos diretos.',
      lore: 'Sistema experimental que redistribui energia do reator para um campo direcional rápido.',
      levels: [
        {
          title: 'Campo Inicial',
          description:
            'Escudo ativável absorve até 3 impactos antes de recarregar.',
          highlights: ['Libera a habilidade na tecla configurada (padrão: E).'],
        },
        {
          title: 'Placas Reforçadas',
          description: 'Capacidade aumentada para 4 impactos por ativação.',
          highlights: [
            'Ideal para aguentar ondas médias sem recarga imediata.',
          ],
        },
        {
          title: 'Resfriamento Otimizado',
          description: 'Reduz o tempo de recarga do escudo em 5 segundos.',
          highlights: [
            'Permite reativações mais frequentes em lutas prolongadas.',
          ],
        },
        {
          title: 'Matriz Avançada',
          description: 'Capacidade final de 5 impactos por ativação.',
          highlights: ['Sustenta confrontos contra enxames agressivos.'],
        },
        {
          title: 'Sobrecarga Defletora',
          description: 'Reduz ainda mais o cooldown total do escudo.',
          highlights: ['Libera recarga rápida para contra-ataques sucessivos.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 1 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 2 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 3 },
          },
        ],
      },
      {
        rank: 4,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 4 },
          },
        ],
      },
      {
        rank: 5,
        effects: [
          {
            type: 'event',
            event: 'upgrade-deflector-shield',
            payload: { level: 5 },
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
  {
    id: 'magfield',
    category: 'utility',
    icon: '🧲',
    themeColor: '#C08BFF',
    unlockLevel: 1,
    tags: ['coleta', 'magnetismo'],
    text: {
      name: 'Campo Magnético',
      summary:
        'Amplifica o campo coletor da nave para atrair orbes de experiência mais distantes.',
      lore: 'Bobinas recalibradas com ligas leves permitem magnetismo estável mesmo durante manobras bruscas.',
      levels: [
        {
          title: 'Lentes de Fluxo',
          description: 'Aumenta o alcance de coleta em +40%.',
          highlights: [
            'Multiplica o raio atual e intensifica a força de atração.',
          ],
        },
        {
          title: 'Catalisador Duplo',
          description: 'Amplia o bônus acumulado para +75% de alcance.',
          highlights: [
            'Aplica incremento adicional de 25% sobre o raio vigente.',
          ],
        },
        {
          title: 'Trama de Harmonia',
          description: 'Estabiliza o campo em +105% de alcance total.',
          highlights: [
            'Adiciona 15% extras de raio e reforça a força magnética.',
          ],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.4,
          },
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.35,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.4 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.25,
          },
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.25,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.25 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'progression',
            property: 'orbMagnetismRadius',
            operation: 'multiply',
            value: 1.15,
          },
          {
            type: 'progression',
            property: 'magnetismForce',
            operation: 'multiply',
            value: 1.15,
          },
          {
            type: 'event',
            event: 'upgrade-magnetism',
            payload: { multiplier: 1.15 },
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
];

export default UPGRADE_LIBRARY;
