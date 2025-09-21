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
    tags: ['velocidade', 'mobilidade'],
    text: {
      name: 'Propulsores Melhorados',
      summary:
        'Substitui os bicos principais por modelos mais eficientes e resistentes ao superaquecimento.',
      lore: 'Projeto modular que permite trocas rápidas em estação. Ideal para pilotos que priorizam reposicionamento.',
      levels: [
        {
          title: 'Câmara Reforçada',
          description: 'Aumenta a velocidade máxima em +15%.',
          highlights: ['Multiplica o valor atual de velocidade por 1,15.'],
        },
        {
          title: 'Injeção Vetorial',
          description: 'Eleva o bônus acumulado para +28% de velocidade total.',
          highlights: [
            'Aplica incremento adicional de 10% sobre o valor atual.',
          ],
        },
        {
          title: 'Estágio Criogênico',
          description:
            'Mantém o desempenho em longas sessões, atingindo +40% de velocidade.',
          highlights: ['Adiciona 8% extras ao bônus vigente de velocidade.'],
        },
      ],
    },
    levels: [
      {
        rank: 1,
        effects: [
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.15 },
          },
        ],
      },
      {
        rank: 2,
        effects: [
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.1 },
          },
        ],
      },
      {
        rank: 3,
        effects: [
          {
            type: 'event',
            event: 'upgrade-speed-boost',
            payload: { multiplier: 1.08 },
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
];

export default UPGRADE_LIBRARY;
