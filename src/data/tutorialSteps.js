const TUTORIAL_STEPS = [
  {
    id: 'movement',
    title: 'Domine a pilotagem',
    description:
      'Pressione W ou as setas direcionais para entender como a nave responde.',
    targetSelector: '[data-instruction="movement"]',
    hint: 'Experimente W, A, S, D ou as setas para mover a nave.',
    action: {
      type: 'key',
      keys: ['w', 'keyw', 'arrowup', 'arrowleft', 'arrowright', 'arrowdown'],
      successMessage: 'Movimentação registrada! Continue praticando.',
    },
  },
  {
    id: 'shield',
    title: 'Ative seu escudo defletor',
    description: 'Teste o escudo defensivo para sentir o tempo de recarga.',
    targetSelector: '[data-instruction="shield"]',
    hint: 'Aperte E para ativar o escudo e visualizar o cooldown.',
    action: {
      type: 'key',
      keys: ['e', 'keye'],
      successMessage: 'Escudo ativado — lembre-se do tempo de recarga!',
    },
  },
  {
    id: 'pause',
    title: 'Pausa estratégica',
    description:
      'Use a pausa para respirar, revisar upgrades e planejar a próxima onda.',
    targetSelector: '[data-instruction="pause"]',
    hint: 'Pressione Esc para abrir o menu de pausa a qualquer momento.',
    action: {
      type: 'key',
      keys: ['escape'],
      successMessage: 'Pausa confirmada. Você pode retomá-la sempre que precisar.',
    },
  },
  {
    id: 'launch',
    title: 'Pronto para a missão',
    description:
      'Finalize o treinamento e decole imediatamente rumo ao campo de asteroides.',
    targetSelector: '#start-game-btn',
    hint: 'Clique no botão abaixo para iniciar sua primeira missão oficial.',
    action: {
      type: 'button',
      ctaLabel: 'Concluir treinamento e iniciar missão',
    },
  },
];

export default TUTORIAL_STEPS;
