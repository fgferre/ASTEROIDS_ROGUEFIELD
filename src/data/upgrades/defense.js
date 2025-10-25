// src/data/upgrades/defense.js

import { deepFreeze } from '../../utils/deepFreeze.js';

// === DEFENSIVE UPGRADES ===

export const DEFENSE_UPGRADES = deepFreeze([
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
]);
