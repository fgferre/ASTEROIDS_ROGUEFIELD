// src/data/upgrades/utility.js

// === UTILITY UPGRADES ===

export const UTILITY_UPGRADES = [
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
