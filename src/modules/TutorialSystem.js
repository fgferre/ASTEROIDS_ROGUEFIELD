// src/modules/TutorialSystem.js

import TUTORIAL_STEPS from '../data/tutorialSteps.js';

const STORAGE_KEY = 'astro:tutorial:completed:v1';

class TutorialSystem {
  constructor() {
    this.storageKey = STORAGE_KEY;
    this.steps = Array.isArray(TUTORIAL_STEPS) ? [...TUTORIAL_STEPS] : [];
    this.currentStepIndex = -1;
    this.currentAction = null;
    this.isActive = false;
    this.resolvingStep = false;
    this.autoAdvanceTimeout = null;
    this.activeHighlights = [];
    this.panelState = 'idle';
    this.runContext = { fromStartRequest: false };

    this.dom = this.cacheDom();
    this.completionPersisted = this.loadCompletion();

    this.bindUiEvents();
    this.subscribeToEvents();
    this.applyInitialState();

    if (typeof gameServices !== 'undefined') {
      gameServices.register('tutorial', this);
    }

    console.log('[TutorialSystem] Initialized');
  }

  cacheDom() {
    return {
      panel: document.getElementById('tutorial-panel') || null,
      status: document.getElementById('tutorial-status') || null,
      progress: document.getElementById('tutorial-progress') || null,
      title: document.getElementById('tutorial-step-title') || null,
      description: document.getElementById('tutorial-step-description') || null,
      hint: document.getElementById('tutorial-step-hint') || null,
      primaryButton: document.getElementById('tutorial-primary-btn') || null,
      replayButton: document.getElementById('tutorial-replay-btn') || null,
      startButton: document.getElementById('start-game-btn') || null,
    };
  }

  loadCompletion() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }

      const stored = window.localStorage.getItem(this.storageKey);
      return stored === '1' || stored === 'true';
    } catch (error) {
      console.warn('[TutorialSystem] Unable to access localStorage:', error);
      return false;
    }
  }

  saveCompletion(value) {
    this.completionPersisted = Boolean(value);
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return;
      }

      window.localStorage.setItem(
        this.storageKey,
        this.completionPersisted ? '1' : '0'
      );
    } catch (error) {
      console.warn('[TutorialSystem] Failed to persist tutorial completion:', error);
    }
  }

  applyInitialState() {
    const state = this.completionPersisted ? 'completed' : 'idle';
    this.setPanelState(state);
    this.refreshIdleView();
  }

  bindUiEvents() {
    if (this.dom.primaryButton) {
      this.dom.primaryButton.addEventListener('click', () => {
        this.handlePrimaryButton();
      });
    }

    if (this.dom.replayButton) {
      this.dom.replayButton.addEventListener('click', () => {
        this.handleReplayButton();
      });
    }
  }

  subscribeToEvents() {
    if (typeof gameEvents === 'undefined') {
      return;
    }

    gameEvents.on('key-pressed', (payload) => {
      this.handleKeyEvent(payload);
    });
  }

  shouldInterceptStart() {
    return !this.completionPersisted && this.steps.length > 0;
  }

  requestStart() {
    if (!this.shouldInterceptStart()) {
      return false;
    }

    if (this.isActive) {
      return true;
    }

    this.begin({ fromStartRequest: true });
    return true;
  }

  begin(options = {}) {
    if (!this.dom.panel || this.steps.length === 0) {
      return;
    }

    const { fromStartRequest = false } = options;
    this.isActive = true;
    this.resolvingStep = false;
    this.currentStepIndex = 0;
    this.runContext = { fromStartRequest };
    this.setPanelState('active');
    this.clearHighlight();
    this.clearAutoAdvance();

    this.updateStatus('Treinamento ativo');
    if (this.dom.replayButton) {
      this.dom.replayButton.disabled = true;
    }
    if (this.dom.startButton) {
      this.dom.startButton.disabled = true;
    }

    this.updateStepUI();

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('tutorial-started', { fromStartRequest });
      gameEvents.emit('ui-show-screen', { screen: 'menu' });
    }
  }

  handlePrimaryButton() {
    if (!this.isActive) {
      if (this.steps.length > 0) {
        this.begin({ fromStartRequest: false });
      }
      return;
    }

    const actionType = this.currentAction?.type;
    if (actionType === 'ack' || actionType === 'button' || !actionType) {
      this.advanceStep();
    }
  }

  handleReplayButton() {
    if (this.isActive || this.steps.length === 0) {
      return;
    }

    this.begin({ fromStartRequest: false });
  }

  handleKeyEvent(payload = {}) {
    if (!this.isActive || this.steps.length === 0) {
      return;
    }

    if (!payload || payload.type !== 'down') {
      return;
    }

    const step = this.steps[this.currentStepIndex];
    if (!step) {
      return;
    }

    const action = step.action || {};
    if (action.type !== 'key') {
      return;
    }

    const normalizedKey = this.normalizeInput(payload.key || payload.code);
    if (!normalizedKey) {
      return;
    }

    const keys = Array.isArray(action.keys) ? action.keys : [];
    const matched = keys.some((key) => this.normalizeInput(key) === normalizedKey);
    if (!matched || this.resolvingStep) {
      return;
    }

    this.resolvingStep = true;

    if (action.successMessage) {
      this.updateHint(action.successMessage);
    }

    this.scheduleAdvance();
  }

  scheduleAdvance() {
    this.clearAutoAdvance();
    const timerHost = typeof window !== 'undefined' ? window : globalThis;
    const delay = 500;
    this.autoAdvanceTimeout = timerHost.setTimeout(() => {
      this.advanceStep();
    }, delay);
  }

  clearAutoAdvance() {
    if (!this.autoAdvanceTimeout) {
      return;
    }

    const timerHost = typeof window !== 'undefined' ? window : globalThis;
    timerHost.clearTimeout(this.autoAdvanceTimeout);
    this.autoAdvanceTimeout = null;
  }

  advanceStep() {
    this.clearAutoAdvance();
    this.clearHighlight();

    this.currentStepIndex += 1;
    this.resolvingStep = false;

    if (this.currentStepIndex >= this.steps.length) {
      this.completeTutorial();
      return;
    }

    this.updateStepUI();
  }

  updateStepUI() {
    const step = this.steps[this.currentStepIndex];
    if (!step) {
      this.completeTutorial();
      return;
    }

    this.currentAction = step.action || null;

    const totalSteps = this.steps.length;
    this.updateStatus('Treinamento ativo');
    this.updateProgress(`${this.currentStepIndex + 1}/${totalSteps}`);
    this.updateTitle(step.title || 'Tutorial');
    this.updateDescription(step.description || '');
    const hintText = step.hint || this.buildHintFromAction(step.action);
    this.updateHint(hintText);

    this.configurePrimaryButton(step.action);
    this.applyHighlight(step.targetSelector);
  }

  configurePrimaryButton(action = {}) {
    const button = this.dom.primaryButton;
    if (!button) {
      return;
    }

    const actionType = action?.type;
    if (actionType === 'key') {
      button.disabled = true;
      button.textContent = action?.ctaLabel || 'Aguardando interação...';
    } else if (actionType === 'button') {
      button.disabled = false;
      button.textContent =
        action?.ctaLabel || 'Concluir treinamento e iniciar missão';
    } else if (actionType === 'ack') {
      button.disabled = false;
      button.textContent = action?.ctaLabel || 'Continuar';
    } else {
      button.disabled = false;
      button.textContent = action?.ctaLabel || 'Continuar';
    }
  }

  buildHintFromAction(action = {}) {
    if (!action || action.type !== 'key') {
      return '';
    }

    const keys = Array.isArray(action.keys) ? action.keys : [];
    if (keys.length === 0) {
      return '';
    }

    const labels = [...new Set(keys.map((key) => this.getKeyLabel(key)))].filter(
      Boolean
    );
    if (labels.length === 0) {
      return '';
    }

    if (labels.length === 1) {
      return `Pressione ${labels[0]}.`;
    }

    const last = labels.pop();
    return `Pressione ${labels.join(', ')} ou ${last}.`;
  }

  completeTutorial() {
    this.isActive = false;
    this.currentStepIndex = -1;
    this.currentAction = null;
    this.clearAutoAdvance();
    this.clearHighlight();

    if (this.dom.startButton) {
      this.dom.startButton.disabled = false;
    }
    if (this.dom.replayButton) {
      this.dom.replayButton.disabled = false;
    }
    if (this.dom.primaryButton) {
      this.dom.primaryButton.disabled = false;
    }

    this.saveCompletion(true);
    this.setPanelState('completed');
    this.refreshIdleView();

    if (typeof gameEvents !== 'undefined') {
      gameEvents.emit('tutorial-completed', {
        fromStartRequest: Boolean(this.runContext?.fromStartRequest),
      });
    }

    this.runContext = { fromStartRequest: false };
  }

  refreshIdleView() {
    const isCompleted =
      this.completionPersisted || this.panelState === 'completed';
    const statusText = isCompleted
      ? 'Treinamento concluído'
      : 'Tutorial inicial';
    const description = isCompleted
      ? 'Você já conhece os controles principais. Revise o tutorial quando quiser.'
      : 'Clique em “Iniciar missão” para iniciar o treinamento guiado antes da primeira partida.';
    const hint = isCompleted
      ? 'Use “Rever tutorial” para praticar novamente sem iniciar uma partida.'
      : 'O jogo começa somente após concluir o treinamento inicial.';

    this.updateStatus(statusText);
    this.updateProgress(isCompleted ? '✔' : '--');
    this.updateTitle('Centro de treinamento');
    this.updateDescription(description);
    this.updateHint(hint);

    if (this.dom.replayButton) {
      this.dom.replayButton.textContent = isCompleted
        ? 'Rever tutorial'
        : 'Executar tutorial agora';
      this.dom.replayButton.disabled = this.isActive;
    }
  }

  setPanelState(state) {
    this.panelState = state;
    if (this.dom.panel) {
      this.dom.panel.setAttribute('data-state', state);
    }
  }

  updateStatus(text) {
    if (this.dom.status) {
      this.dom.status.textContent = text;
    }
  }

  updateProgress(text) {
    if (this.dom.progress) {
      this.dom.progress.textContent = text;
    }
  }

  updateTitle(text) {
    if (this.dom.title) {
      this.dom.title.textContent = text;
    }
  }

  updateDescription(text) {
    if (this.dom.description) {
      this.dom.description.textContent = text;
    }
  }

  updateHint(text) {
    if (this.dom.hint) {
      this.dom.hint.textContent = text || '';
    }
  }

  applyHighlight(selector) {
    if (!selector) {
      return;
    }

    try {
      const elements = document.querySelectorAll(selector);
      this.activeHighlights = Array.from(elements);
      this.activeHighlights.forEach((element) => {
        element.classList.add('is-tutorial-highlight');
      });
    } catch (error) {
      console.warn('[TutorialSystem] Failed to highlight element:', error);
    }
  }

  clearHighlight() {
    if (!Array.isArray(this.activeHighlights)) {
      this.activeHighlights = [];
      return;
    }

    this.activeHighlights.forEach((element) => {
      element.classList.remove('is-tutorial-highlight');
    });
    this.activeHighlights = [];
  }

  normalizeInput(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.toLowerCase();
  }

  getKeyLabel(key) {
    const normalized = this.normalizeInput(key);
    if (!normalized) {
      return '';
    }

    const arrowMap = {
      arrowup: 'Seta ↑',
      arrowdown: 'Seta ↓',
      arrowleft: 'Seta ←',
      arrowright: 'Seta →',
    };

    if (arrowMap[normalized]) {
      return arrowMap[normalized];
    }

    if (normalized === 'escape') {
      return 'Esc';
    }

    if (normalized.startsWith('key') && normalized.length === 4) {
      return normalized[3].toUpperCase();
    }

    return normalized.length === 1 ? normalized.toUpperCase() : normalized;
  }

  isCompleted() {
    return this.completionPersisted;
  }
}

export default TutorialSystem;
