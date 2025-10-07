// src/data/settingsSchema.js

import {
  DEFAULT_HUD_LAYOUT_ID,
  HUD_LAYOUT_OPTIONS,
  HUD_LAYOUT_OPTION_LABELS,
} from './ui/hudLayout.js';

const DEFAULT_BINDING_METADATA = {
  keyboard: {
    max: 2,
    label: 'Teclado',
  },
  gamepad: {
    max: 2,
    label: 'Gamepad',
    allowAxis: true,
    threshold: 0.45,
  },
};

const SETTINGS_SCHEMA = [
  {
    id: 'audio',
    label: 'Áudio',
    description:
      'Ajuste a mixagem geral do jogo, controlando volumes individuais e opção de silêncio total.',
    fields: [
      {
        key: 'muteAll',
        type: 'toggle',
        label: 'Silenciar tudo',
        description: 'Interrompe imediatamente toda saída sonora.',
        default: false,
      },
      {
        key: 'masterVolume',
        type: 'range',
        label: 'Volume geral',
        description: 'Controla o volume global aplicado a todos os canais.',
        default: 0.7,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: 'musicVolume',
        type: 'range',
        label: 'Trilha sonora',
        description:
          'Define a intensidade da música ambiente e futuras faixas temáticas.',
        default: 0.6,
        min: 0,
        max: 1,
        step: 0.05,
      },
      {
        key: 'effectsVolume',
        type: 'range',
        label: 'Efeitos sonoros',
        description:
          'Afeta tiros, explosões, coleta de XP e demais efeitos instantâneos.',
        default: 0.85,
        min: 0,
        max: 1,
        step: 0.05,
      },
    ],
  },
  {
    id: 'controls',
    label: 'Controles',
    description:
      'Remapeie as ações principais para teclado e gamepad. Todas as alterações têm efeito imediato e ficam salvas para as próximas sessões.',
    fields: [
      {
        key: 'moveUp',
        type: 'binding',
        label: 'Mover-se para cima',
        description: 'Acelerar a nave adiante.',
        default: {
          keyboard: ['KeyW', 'ArrowUp'],
          gamepad: ['axis:1:-', 'button:12'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'moveDown',
        type: 'binding',
        label: 'Mover-se para baixo',
        description: 'Acionar propulsores traseiros para desacelerar.',
        default: {
          keyboard: ['KeyS', 'ArrowDown'],
          gamepad: ['axis:1:+', 'button:13'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'moveLeft',
        type: 'binding',
        label: 'Derivar para esquerda',
        description: 'Controle lateral do casco para ajustar a mira.',
        default: {
          keyboard: ['KeyA', 'ArrowLeft'],
          gamepad: ['axis:0:-', 'button:14'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'moveRight',
        type: 'binding',
        label: 'Derivar para direita',
        description: 'Aplicar impulso lateral em direção ao alvo.',
        default: {
          keyboard: ['KeyD', 'ArrowRight'],
          gamepad: ['axis:0:+', 'button:15'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'activateShield',
        type: 'binding',
        label: 'Ativar escudo',
        description: 'Dispara a proteção energética quando disponível.',
        default: {
          keyboard: ['KeyE', 'ShiftLeft'],
          gamepad: ['button:2', 'button:4'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'pause',
        type: 'binding',
        label: 'Pausar / Retomar',
        description: 'Congela o jogo e exibe o menu rápido.',
        default: {
          keyboard: ['Escape', 'KeyP'],
          gamepad: ['button:9'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'openSettings',
        type: 'binding',
        label: 'Abrir configurações',
        description: 'Atalho direto para o painel de configurações.',
        default: {
          keyboard: ['F10'],
          gamepad: ['button:8'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
      {
        key: 'confirm',
        type: 'binding',
        label: 'Confirmar / Interagir',
        description: 'Confirma seleções em menus e diálogos.',
        default: {
          keyboard: ['Enter', 'Space'],
          gamepad: ['button:0'],
        },
        metadata: {
          keyboard: { ...DEFAULT_BINDING_METADATA.keyboard },
          gamepad: { ...DEFAULT_BINDING_METADATA.gamepad },
        },
      },
    ],
  },
  {
    id: 'accessibility',
    label: 'Acessibilidade',
    description:
      'Opções para reduzir desconfortos visuais e reforçar dicas durante o jogo.',
    fields: [
      {
        key: 'reducedMotion',
        type: 'toggle',
        label: 'Reduzir movimentos intensos',
        description: 'Atenua efeitos como screen shake e flashes rápidos.',
        default: false,
      },
      {
        key: 'highContrastHud',
        type: 'toggle',
        label: 'Aumentar contraste do HUD',
        description: 'Aplica cores mais fortes aos indicadores principais.',
        default: false,
      },
      {
        key: 'colorBlindPalette',
        type: 'toggle',
        label: 'Modo daltônico',
        description:
          'Ativa uma paleta alternativa com maior distinção entre categorias e alertas.',
        default: false,
      },
    ],
  },
  {
    id: 'video',
    label: 'Vídeo e HUD',
    description:
      'Personalize a apresentação visual do HUD e dos efeitos de impacto.',
    fields: [
      {
        key: 'hudScale',
        type: 'range',
        label: 'Escala do HUD',
        description: 'Ajusta o tamanho dos elementos da interface.',
        default: 1,
        min: 0.8,
        max: 1.3,
        step: 0.05,
      },
      {
        key: 'hudLayout',
        type: 'select',
        label: 'Layout do HUD',
        description:
          'Alterne entre o visual clássico e o HUD tático minimalista.',
        default: DEFAULT_HUD_LAYOUT_ID,
        options: HUD_LAYOUT_OPTIONS.map((option) => option.value),
        optionLabels: HUD_LAYOUT_OPTION_LABELS,
      },
      {
        key: 'screenShakeIntensity',
        type: 'range',
        label: 'Intensidade do impacto',
        description: 'Controla o quanto a tela treme em eventos fortes.',
        default: 1,
        min: 0,
        max: 1,
        step: 0.1,
      },
      {
        key: 'menuAsteroidNormalIntensity',
        type: 'range',
        label: 'Relevo dos asteroides do menu',
        description:
          'Ajusta a intensidade do normal map na tela inicial para destacar os detalhes sem perder desempenho.',
        default: 1,
        min: 0,
        max: 2.5,
        step: 0.1,
      },
      {
        key: 'damageFlash',
        type: 'toggle',
        label: 'Flash de dano',
        description:
          'Habilita ou desabilita o flash branco rápido ao levar dano.',
        default: true,
      },
      {
        key: 'reducedParticles',
        type: 'toggle',
        label: 'Reduzir partículas',
        description:
          'Simplifica efeitos visuais intensos como fagulhas, detritos e trilhas.',
        default: false,
      },
    ],
  },
];

export function getSettingsSchema() {
  return SETTINGS_SCHEMA;
}

export default SETTINGS_SCHEMA;
