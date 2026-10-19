// src/modules/InputSystem.js

import SETTINGS_SCHEMA from '../data/settingsSchema.js';
import { debugLog } from '../core/debugLogging.js';
import {
  normalizeDependencies,
  resolveEventBus,
  resolveService,
} from '../core/serviceUtils.js';
import { createInputFrame } from '../core/replay.js';
import {
  GAMEPAD_NAV_BUTTONS,
  GAMEPAD_NAV_STICK_THRESHOLD,
  GAMEPAD_RUMBLE,
  GAMEPAD_STICK_DEADZONE,
} from '../data/constants/gamepad.js';
import {
  MOVEMENT_ACTIONS,
  buildMovementCommandPayload,
  enqueueActionCommand,
} from './input/commandPayloads.js';

const CONTROLS_CATEGORY_ID = 'controls';
const DEFAULT_GAMEPAD_AXIS_THRESHOLD = 0.45;
const PASSWORD_MANAGER_GUARD_CODES = new Set(['KeyS', 'ArrowDown']);
// Gameplay presses are applied at the next fixed step (not in the DOM handler)
// so a recorded run replays them at the same step.
const STEP_PRESS_FIELDS = {
  activateShield: 'shield',
  toggleSpreadMode: 'spread',
  toggleAimMode: 'aim',
  dash: 'dash',
};

const CENTRED_STICKS = Object.freeze({ moveX: 0, moveY: 0, aimX: 0, aimY: 0 });

/** Radial deadzone; past it the magnitude is rescaled to 0..1. */
export function applyStickDeadzone(x = 0, y = 0) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= GAMEPAD_STICK_DEADZONE) {
    return { x: 0, y: 0 };
  }
  const scaled =
    Math.min(
      1,
      (magnitude - GAMEPAD_STICK_DEADZONE) / (1 - GAMEPAD_STICK_DEADZONE)
    ) / magnitude;
  return { x: x * scaled, y: y * scaled };
}

/** The dominant direction of a raw stick past the menu threshold, or null. */
function stickNavDirection(x = 0, y = 0) {
  if (Math.hypot(x, y) < GAMEPAD_NAV_STICK_THRESHOLD) {
    return null;
  }
  if (Math.abs(x) > Math.abs(y)) {
    return x > 0 ? 'right' : 'left';
  }
  return y > 0 ? 'down' : 'up';
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  if (value === undefined) {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    console.warn('[InputSystem] Failed to clone value:', error);
    return value;
  }
}

class InputSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.commandQueue =
      resolveService('command-queue', this.dependencies) || null;
    this.eventBus = resolveEventBus(this.dependencies);
    this.lastMovementCommand = null;
    this.keys = {};
    this.codes = {};
    this.mousePos = { x: 0, y: 0 };
    this.mouseButtons = {};

    this.gamepadConnected = false;
    this.gamepad = null;
    this.gamepadIndex = 0;
    this.previousGamepadButtons = [];
    this.previousGamepadAxes = [];
    this.gamepadAxisThreshold = DEFAULT_GAMEPAD_AXIS_THRESHOLD;

    this.settings = null;
    this.actionBindings = {};
    this.keyboardBindingMap = new Map();
    this.gamepadButtonMap = new Map();
    this.gamepadAxisMap = new Map();
    this.movementBindings = new Set();
    this.activeKeyboardActions = new Set();
    this.activeGamepadActions = new Set();
    this.keyboardActionInputs = new Map();
    this.isCapturingBinding = false;
    this.pendingStepPresses = new Set();
    this.inputSource = null;
    // The run is a replay ('game-started' says so): the pad stays quiet.
    this.replaying = false;
    // Pad sticks after the deadzone, read at each poll (see sampleInputFrame).
    this.padSticks = CENTRED_STICKS;
    this.padNavDirection = null;
    // Last device used: 'keyboard' or 'gamepad' (tips and hints follow it).
    this.activeDevice = 'keyboard';
    this.menuPollFrame = null;

    this.keyAliases = { w: 'keyw', a: 'keya', s: 'keys', d: 'keyd' };

    this.controlFieldDefinitions = this.resolveControlFieldMap();

    this.setupEventListeners();
    this.initializeBindings();
    this.startMenuPadPolling();

    debugLog('[InputSystem] Initialized');
  }

  resolveCommandQueue(force = false) {
    if (force || !this.commandQueue) {
      this.commandQueue =
        resolveService('command-queue', this.dependencies) || this.commandQueue;
    }
    return this.commandQueue;
  }

  getEventBus() {
    const eventBus = this.eventBus || resolveEventBus(this.dependencies);
    if (eventBus && this.eventBus !== eventBus) {
      this.eventBus = eventBus;
    }
    return eventBus;
  }

  resolveControlFieldMap() {
    const schema = Array.isArray(SETTINGS_SCHEMA) ? SETTINGS_SCHEMA : [];
    const category = schema.find((entry) => entry.id === CONTROLS_CATEGORY_ID);
    if (!category) {
      return new Map();
    }

    const map = new Map();
    category.fields.forEach((field) => {
      map.set(field.key, field);
      const threshold = Number(field.metadata?.gamepad?.threshold);
      if (Number.isFinite(threshold)) {
        this.gamepadAxisThreshold = threshold;
      }
    });
    return map;
  }

  resolveSettingsService() {
    const injected = resolveService('settings', this.dependencies);
    if (injected) {
      return injected;
    }

    return null;
  }

  initializeBindings() {
    this.settings = this.resolveSettingsService();
    let values = null;
    if (
      this.settings &&
      typeof this.settings.getCategoryValues === 'function'
    ) {
      values = this.settings.getCategoryValues(CONTROLS_CATEGORY_ID);
    }

    if (!values) {
      values = this.extractDefaultsFromSchema();
    }

    this.applyControlSettings(values);
  }

  extractDefaultsFromSchema() {
    const defaults = {};
    this.controlFieldDefinitions.forEach((field, key) => {
      defaults[key] = clone(field.default) || { keyboard: [], gamepad: [] };
    });
    return defaults;
  }

  resetBindingMaps() {
    this.keyboardBindingMap.clear();
    this.gamepadButtonMap.clear();
    this.gamepadAxisMap.clear();
    this.movementBindings.clear();
    this.actionBindings = {};
  }

  applyControlSettings(values = {}) {
    this.resetBindingMaps();

    Object.entries(values).forEach(([action, bindingValue]) => {
      const field = this.controlFieldDefinitions.get(action);
      if (field && field.type !== 'binding') {
        return;
      }
      const normalized = this.normalizeBindingStructure(bindingValue);
      this.actionBindings[action] = normalized;

      if (field) {
        const threshold = Number(field.metadata?.gamepad?.threshold);
        if (Number.isFinite(threshold)) {
          this.gamepadAxisThreshold = threshold;
        }
      }

      this.registerKeyboardBindings(action, normalized.keyboard, field);
      this.registerGamepadBindings(action, normalized.gamepad);
    });
  }

  normalizeBindingStructure(binding) {
    if (!binding || typeof binding !== 'object') {
      return { keyboard: [], gamepad: [] };
    }

    return {
      keyboard: ensureArray(binding.keyboard).filter(Boolean),
      gamepad: ensureArray(binding.gamepad).filter(Boolean),
    };
  }

  setupEventListeners() {
    this.handleKeyDownCapture = (event) => {
      if (!this.shouldBlockPasswordManager(event)) {
        return;
      }
      event.stopPropagation();
      this.onKeyDown(event);
    };

    this.handleKeyUpCapture = (event) => {
      if (!this.shouldBlockPasswordManager(event)) {
        return;
      }
      event.stopPropagation();
      this.onKeyUp(event);
    };

    document.addEventListener('keydown', this.handleKeyDownCapture, true);
    document.addEventListener('keyup', this.handleKeyUpCapture, true);

    document.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('keyup', (event) => this.onKeyUp(event));
    document.addEventListener('mousemove', (event) => this.onMouseMove(event));
    document.addEventListener('mousedown', (event) => this.onMouseDown(event));
    document.addEventListener('mouseup', (event) => this.onMouseUp(event));
    window.addEventListener('blur', () => this.onFocusLost());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.onFocusLost();
    });

    window.addEventListener('gamepadconnected', (event) =>
      this.onGamepadConnected(event)
    );
    window.addEventListener('gamepaddisconnected', (event) =>
      this.onGamepadDisconnected(event)
    );

    const eventBus = this.getEventBus();
    if (eventBus?.on) {
      eventBus.on('settings-controls-changed', (payload = {}) => {
        if (payload?.values) {
          this.applyControlSettings(payload.values);
        }
      });

      eventBus.on('input-binding-capture', (payload = {}) => {
        this.isCapturingBinding = payload?.state === 'start';
      });

      eventBus.on('screen-changed', (payload = {}) => {
        if (payload?.screen !== 'playing') {
          this.pendingStepPresses.clear();
        }
      });

      eventBus.on('game-started', (payload = {}) => {
        this.replaying = Boolean(payload.replay);
      });

      eventBus.on('player-took-damage', (payload = {}) => {
        if ((payload.healthDamage ?? payload.damage) > 0) {
          this.rumble(GAMEPAD_RUMBLE.hullHit);
        }
      });
      eventBus.on('boss-spawned', () =>
        this.rumble(GAMEPAD_RUMBLE.wardenSpawn)
      );
      eventBus.on('player-dashed', () => this.rumble(GAMEPAD_RUMBLE.dash));
    }
  }

  /**
   * Off the fixed steps (menus, pause, level-up) nothing else polls the pad,
   * so a frame loop does; during play `update()` polls once per step.
   */
  startMenuPadPolling() {
    if (typeof window.requestAnimationFrame !== 'function') {
      return;
    }
    const tick = () => {
      if (!this.isGameRunning()) {
        this.pollGamepad();
      }
      this.menuPollFrame = window.requestAnimationFrame(tick);
    };
    this.menuPollFrame = window.requestAnimationFrame(tick);
  }

  isGameRunning() {
    const gameState = resolveService('game-state', this.dependencies);
    return gameState?.getScreen?.() === 'playing' && !gameState.isPaused?.();
  }

  setActiveDevice(device) {
    if (this.activeDevice === device) {
      return;
    }
    this.activeDevice = device;
    this.getEventBus()?.emit?.('input-device-changed', { device });
  }

  getActiveDevice() {
    return this.activeDevice;
  }

  /**
   * One dual-rumble effect on the active pad, unless the player turned it off
   * or a replay is playing.
   */
  rumble(effect) {
    const actuator = this.gamepad?.vibrationActuator;
    if (this.replaying || !actuator || !this.isVibrationEnabled()) {
      return;
    }
    actuator
      .playEffect('dual-rumble', { startDelay: 0, ...effect })
      .catch(() => {});
  }

  isVibrationEnabled() {
    const settings = this.settings;
    if (!settings?.getSetting) {
      return true;
    }
    return (
      settings.getSetting(CONTROLS_CATEGORY_ID, 'vibration') !== false &&
      !settings.getSetting('accessibility', 'reducedMotion')
    );
  }

  shouldBlockPasswordManager(event) {
    if (!PASSWORD_MANAGER_GUARD_CODES.has(event.code)) {
      return false;
    }

    if (this.isCapturingBinding) {
      return false;
    }

    const activeElement = document.activeElement;
    if (!activeElement) {
      return true;
    }

    const tagName = activeElement.tagName;
    if (!tagName) {
      return true;
    }

    const normalizedTag = tagName.toLowerCase();
    if (normalizedTag === 'input' || normalizedTag === 'textarea') {
      return false;
    }

    if (activeElement.isContentEditable) {
      return false;
    }

    const role = activeElement.getAttribute?.('role');
    if (role && role.toLowerCase() === 'textbox') {
      return false;
    }

    return true;
  }

  onKeyDown(event) {
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const code = typeof event.code === 'string' ? event.code.toLowerCase() : '';
    const wasPressed = (key && this.keys[key]) || (code && this.codes[code]);

    if (key) this.keys[key] = true;
    if (code) this.codes[code] = true;
    this.setActiveDevice('keyboard');

    if (this.isMovementBinding(key) || this.isMovementBinding(code)) {
      event.preventDefault();
    }

    const normalizedKey = this.normalizeKeyboardBinding(event.key);
    const normalizedCode = this.normalizeKeyboardBinding(event.code);

    const actions = this.collectKeyboardActions(normalizedKey, normalizedCode);

    if (!wasPressed) {
      actions.forEach((action) => {
        this.handleActionPress(action, 'keyboard', {
          event,
          device: 'keyboard',
          inputId: normalizedCode || normalizedKey || key || code,
        });
      });
    }

    const eventBus = this.getEventBus();
    if (!wasPressed && eventBus?.emit) {
      eventBus.emit('key-pressed', {
        key,
        code,
        type: 'down',
        event,
        actions: Array.from(actions),
      });
    }
  }

  onKeyUp(event) {
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    const code = typeof event.code === 'string' ? event.code.toLowerCase() : '';

    if (key) this.keys[key] = false;
    if (code) this.codes[code] = false;

    const normalizedKey = this.normalizeKeyboardBinding(event.key);
    const normalizedCode = this.normalizeKeyboardBinding(event.code);
    const actions = this.collectKeyboardActions(normalizedKey, normalizedCode);

    actions.forEach((action) => {
      this.handleActionRelease(action, 'keyboard', {
        event,
        device: 'keyboard',
        inputId: normalizedCode || normalizedKey || key || code,
      });
    });

    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('key-pressed', {
        key,
        code,
        type: 'up',
        event,
        actions: Array.from(actions),
      });
    }
  }

  onMouseMove(event) {
    this.mousePos.x = event.clientX;
    this.mousePos.y = event.clientY;
  }

  onMouseDown(event) {
    this.mouseButtons[event.button] = true;
    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('mouse-pressed', {
        button: event.button,
        type: 'down',
        pos: { ...this.mousePos },
      });
    }
  }

  onMouseUp(event) {
    this.mouseButtons[event.button] = false;
    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('mouse-pressed', {
        button: event.button,
        type: 'up',
        pos: { ...this.mousePos },
      });
    }
  }

  // The keyup of a key held while the window loses focus goes elsewhere:
  // release every key and button so none stays stuck.
  onFocusLost() {
    Array.from(this.activeKeyboardActions).forEach((action) => {
      this.handleActionRelease(action, 'keyboard', {
        device: 'keyboard',
        forced: true,
      });
    });
    this.keys = {};
    this.codes = {};
    this.keyboardActionInputs.clear();
    this.activeKeyboardActions.clear();
    this.mouseButtons = {};
    this.getEventBus()?.emit?.('input-focus-lost');
  }

  onGamepadConnected(event) {
    this.gamepadConnected = true;
    this.gamepadIndex = event.gamepad?.index ?? 0;
    debugLog('[InputSystem] Gamepad connected:', event.gamepad);
  }

  onGamepadDisconnected() {
    this.gamepadConnected = false;
    this.gamepad = null;
    this.clearGamepadActions();
    debugLog('[InputSystem] Gamepad disconnected');
  }

  collectKeyboardActions(...inputs) {
    const actions = new Set();
    inputs
      .filter((input) => typeof input === 'string' && input.length > 0)
      .forEach((input) => {
        const normalized = input.toLowerCase();
        const mapped = this.keyboardBindingMap.get(normalized);
        if (mapped) {
          mapped.forEach((action) => actions.add(action));
        }
      });
    return actions;
  }

  handleActionPress(action, source, context = {}) {
    if (!action) {
      return;
    }

    if (source === 'keyboard' && this.isCapturingBinding) {
      return;
    }

    const wasActive = this.isActionActive(action);

    if (source === 'keyboard') {
      const inputId = context.inputId;
      if (inputId) {
        if (!this.keyboardActionInputs.has(action)) {
          this.keyboardActionInputs.set(action, new Set());
        }
        this.keyboardActionInputs.get(action).add(inputId);
      }
      this.activeKeyboardActions.add(action);
    } else if (source === 'gamepad') {
      this.activeGamepadActions.add(action);
    }

    if (wasActive) {
      return;
    }

    enqueueActionCommand(
      this.resolveCommandQueue(),
      action,
      'pressed',
      source,
      context
    );
    this.emitActionEvent(action, 'pressed', source, context);
  }

  handleActionRelease(action, source, context = {}) {
    if (!action) {
      return;
    }

    if (source === 'keyboard') {
      const inputId = context.inputId;
      if (inputId && this.keyboardActionInputs.has(action)) {
        const inputSet = this.keyboardActionInputs.get(action);
        inputSet.delete(inputId);
        if (inputSet.size === 0) {
          this.keyboardActionInputs.delete(action);
          this.activeKeyboardActions.delete(action);
        }
      } else {
        this.activeKeyboardActions.delete(action);
      }
    } else if (source === 'gamepad') {
      this.activeGamepadActions.delete(action);
    }

    if (this.isActionActive(action)) {
      return;
    }

    enqueueActionCommand(
      this.resolveCommandQueue(),
      action,
      'released',
      source,
      context
    );
    this.emitActionEvent(action, 'released', source, context);
  }

  emitActionEvent(action, phase, source, context = {}) {
    const eventBus = this.getEventBus();
    if (eventBus?.emit) {
      eventBus.emit('input-action', {
        action,
        phase,
        source,
        context,
      });
    }

    if (phase !== 'pressed') {
      return;
    }

    const stepField = STEP_PRESS_FIELDS[action];
    if (stepField) {
      // A pad button pressed on the pause screen must not fire on resume.
      const live =
        source === 'gamepad'
          ? this.isGameRunning()
          : this.resolveGameScreen() === 'playing';
      if (live) {
        this.pendingStepPresses.add(stepField);
      }
      return;
    }

    switch (action) {
      case 'pause':
        eventBus?.emit?.('toggle-pause');
        break;
      case 'openSettings':
        eventBus?.emit?.('settings-menu-requested', {
          source: context.device || source || 'input',
        });
        break;
      case 'toggleFullscreen':
        eventBus?.emit?.('toggle-fullscreen');
        break;
      case 'confirm':
        eventBus?.emit?.('input-confirmed', {
          source,
          context,
        });
        break;
      default:
        break;
    }
  }

  /**
   * Replaces the per-step input. `source(liveFrame)` runs once per fixed step
   * and returns the frame the simulation uses (null/undefined keeps the live
   * one); a recorder returns the live frame after storing it.
   */
  setInputSource(source) {
    this.inputSource = source || null;
  }

  /** The device input for this step: held movement + presses since last step. */
  sampleInputFrame() {
    const frame = createInputFrame({
      ...this.getMovementBinaryState(),
      ...this.padSticks,
    });
    this.pendingStepPresses.forEach((field) => {
      frame[field] = true;
    });
    this.pendingStepPresses.clear();
    return frame;
  }

  dispatchStepPresses(frame) {
    const eventBus = this.getEventBus();
    if (frame.shield) {
      eventBus?.emit?.('activate-shield-pressed');
    }
    if (frame.dash) {
      eventBus?.emit?.('dash-pressed');
    }
    // CombatSystem no-ops the toggles unless screen === 'playing'.
    if (frame.spread) {
      const screen = this.resolveGameScreen();
      eventBus?.emit?.('toggle-spread-mode', { screen, source: 'step' });
    }
    if (frame.aim) {
      const screen = this.resolveGameScreen();
      eventBus?.emit?.('toggle-aim-mode', { screen, source: 'step' });
    }
  }

  /**
   * Resolve the current game screen state. Reads from the 'game-state' service
   * if available; otherwise returns null and the listener falls through to a
   * conservative no-op for the toggle actions (plan 01.07 Task 5/6).
   *
   * Implementation note: keydown press → 'pressed' phase → emitActionEvent fires
   * only once per press (handleActionPress short-circuits via the `wasActive`
   * gate at line 418), which gives us natural debouncing without extra state.
   *
   * @returns {string|null} The current game screen identifier (e.g. 'playing').
   */
  resolveGameScreen() {
    const gameStateService = resolveService('game-state', this.dependencies);
    if (gameStateService && typeof gameStateService.getScreen === 'function') {
      return gameStateService.getScreen() || null;
    }
    return null;
  }

  emitGamepadDetection(details) {
    const eventBus = this.getEventBus();
    if (!eventBus?.emit) {
      return;
    }

    eventBus.emit('gamepad-input-detected', {
      ...details,
      timestamp:
        typeof performance !== 'undefined' ? performance.now() : Date.now(),
    });
  }

  pollGamepad() {
    if (
      typeof navigator === 'undefined' ||
      typeof navigator.getGamepads !== 'function'
    ) {
      return;
    }

    const pads = navigator.getGamepads();
    const pad =
      pads?.[this.gamepadIndex] ||
      pads?.find((candidate) => Boolean(candidate)) ||
      null;

    if (!pad) {
      if (this.gamepadConnected || this.activeGamepadActions.size > 0) {
        this.clearGamepadActions();
      }
      this.gamepadConnected = false;
      this.gamepad = null;
      this.padSticks = CENTRED_STICKS;
      return;
    }

    this.gamepad = pad;
    this.gamepadConnected = true;
    this.gamepadIndex = pad.index;

    const activeActions = new Set();

    pad.buttons.forEach((button, index) => {
      const pressed = Boolean(button?.pressed);
      if (pressed) {
        const key = `button:${index}`;
        const mapped = this.gamepadButtonMap.get(key);
        if (mapped) {
          mapped.forEach((action) => activeActions.add(action));
        }
      }

      if (pressed && !this.previousGamepadButtons[index]) {
        this.setActiveDevice('gamepad');
        this.emitGamepadDetection({
          type: 'button',
          index,
          value: button?.value ?? 1,
        });
        this.emitPadNav(GAMEPAD_NAV_BUTTONS[index]);
      }

      this.previousGamepadButtons[index] = pressed;
    });

    pad.axes.forEach((value, index) => {
      const positive = value >= this.gamepadAxisThreshold;
      const negative = value <= -this.gamepadAxisThreshold;
      const previous = this.previousGamepadAxes[index] || {
        positive: false,
        negative: false,
      };

      if (positive) {
        const key = `axis:${index}:positive`;
        const mapped = this.gamepadAxisMap.get(key);
        if (mapped) {
          mapped.forEach((action) => activeActions.add(action));
        }
        if (!previous.positive) {
          this.emitGamepadDetection({
            type: 'axis',
            index,
            direction: 'positive',
            value,
          });
        }
      }

      if (negative) {
        const key = `axis:${index}:negative`;
        const mapped = this.gamepadAxisMap.get(key);
        if (mapped) {
          mapped.forEach((action) => activeActions.add(action));
        }
        if (!previous.negative) {
          this.emitGamepadDetection({
            type: 'axis',
            index,
            direction: 'negative',
            value,
          });
        }
      }

      this.previousGamepadAxes[index] = { positive, negative };
    });

    this.readPadSticks(pad.axes);
    this.syncGamepadActions(activeActions);
  }

  readPadSticks(axes) {
    const move = applyStickDeadzone(axes[0], axes[1]);
    const aim = applyStickDeadzone(axes[2], axes[3]);
    this.padSticks = { moveX: move.x, moveY: move.y, aimX: aim.x, aimY: aim.y };
    if (move.x || move.y || aim.x || aim.y) {
      this.setActiveDevice('gamepad');
    }

    const direction = stickNavDirection(axes[0], axes[1]);
    if (direction !== this.padNavDirection) {
      this.padNavDirection = direction;
      this.emitPadNav(direction);
    }
  }

  /** Menu/overlay navigation (UISystem); nothing to navigate during play. */
  emitPadNav(action) {
    if (!action || this.isGameRunning()) {
      return;
    }
    this.getEventBus()?.emit?.('gamepad-ui-nav', { action });
  }

  syncGamepadActions(activeActions) {
    const previous = new Set(this.activeGamepadActions);

    activeActions.forEach((action) => {
      if (!this.activeGamepadActions.has(action)) {
        this.handleActionPress(action, 'gamepad', { device: 'gamepad' });
      }
    });

    previous.forEach((action) => {
      if (!activeActions.has(action)) {
        this.handleActionRelease(action, 'gamepad', { device: 'gamepad' });
      }
    });
  }

  clearGamepadActions() {
    const active = Array.from(this.activeGamepadActions);
    active.forEach((action) => {
      this.handleActionRelease(action, 'gamepad', {
        device: 'gamepad',
        forced: true,
      });
    });
    this.activeGamepadActions.clear();
    this.previousGamepadButtons = [];
    this.previousGamepadAxes = [];
    this.padSticks = CENTRED_STICKS;
    this.padNavDirection = null;
  }

  parseGamepadBinding(binding) {
    if (typeof binding !== 'string') {
      return null;
    }

    const normalized = binding.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    if (normalized.startsWith('button:')) {
      const index = Number(normalized.split(':')[1]);
      return Number.isInteger(index) ? { type: 'button', index } : null;
    }

    if (normalized.startsWith('axis:')) {
      const parts = normalized.split(':');
      if (parts.length < 3) {
        return null;
      }
      const index = Number(parts[1]);
      if (!Number.isInteger(index)) {
        return null;
      }
      const directionPart = parts[2];
      const direction =
        directionPart.startsWith('-') || directionPart === 'negative'
          ? 'negative'
          : 'positive';
      return { type: 'axis', index, direction };
    }

    return null;
  }

  normalizeKeyboardBinding(value) {
    if (typeof value !== 'string') {
      return '';
    }
    return value.trim().toLowerCase();
  }

  getKeyboardSynonyms(binding) {
    const synonyms = new Set();
    if (!binding) {
      return synonyms;
    }

    if (binding.startsWith('key') && binding.length === 4) {
      synonyms.add(binding.slice(3));
    }

    if (binding === 'space') {
      synonyms.add(' ');
      synonyms.add('spacebar');
    }

    if (binding.startsWith('shift')) {
      synonyms.add('shift');
    }

    if (binding.startsWith('control')) {
      synonyms.add('control');
      synonyms.add('ctrl');
    }

    if (binding.startsWith('alt')) {
      synonyms.add('alt');
    }

    if (binding.startsWith('meta')) {
      synonyms.add('meta');
    }

    return synonyms;
  }

  addKeyboardBinding(binding, action) {
    if (!binding) {
      return;
    }

    if (!this.keyboardBindingMap.has(binding)) {
      this.keyboardBindingMap.set(binding, new Set());
    }

    this.keyboardBindingMap.get(binding).add(action);

    if (this.isMovementAction(action)) {
      this.movementBindings.add(binding);
    }
  }

  registerKeyboardBindings(action, bindings = []) {
    const entries = ensureArray(bindings);
    entries.forEach((binding) => {
      const normalized = this.normalizeKeyboardBinding(binding);
      if (!normalized) {
        return;
      }

      this.addKeyboardBinding(normalized, action);
      const synonyms = this.getKeyboardSynonyms(normalized);
      synonyms.forEach((synonym) => this.addKeyboardBinding(synonym, action));
    });
  }

  registerGamepadBindings(action, bindings = []) {
    const entries = ensureArray(bindings);
    entries.forEach((binding) => {
      const parsed = this.parseGamepadBinding(binding);
      if (!parsed) {
        return;
      }

      if (parsed.type === 'button') {
        const key = `button:${parsed.index}`;
        if (!this.gamepadButtonMap.has(key)) {
          this.gamepadButtonMap.set(key, new Set());
        }
        this.gamepadButtonMap.get(key).add(action);
      } else if (parsed.type === 'axis') {
        const key = `axis:${parsed.index}:${parsed.direction}`;
        if (!this.gamepadAxisMap.has(key)) {
          this.gamepadAxisMap.set(key, new Set());
        }
        this.gamepadAxisMap.get(key).add(action);
      }
    });
  }

  isMovementAction(action) {
    return MOVEMENT_ACTIONS.has(action);
  }

  isMovementBinding(binding) {
    if (!binding) {
      return false;
    }
    return this.movementBindings.has(binding.toLowerCase());
  }

  isKeyDown(key) {
    if (!key) return false;

    const normalized = key.toLowerCase();
    if (this.keys[normalized]) return true;
    if (this.codes[normalized]) return true;

    const alias = this.keyAliases[normalized];
    if (alias && this.codes[alias]) {
      return true;
    }

    return false;
  }

  isCodeDown(code) {
    if (!code) return false;
    return !!this.codes[code.toLowerCase()];
  }

  areAnyKeysDown(keys) {
    return keys.some((key) => this.isKeyDown(key));
  }

  areAllKeysDown(keys) {
    return keys.every((key) => this.isKeyDown(key));
  }

  isActionActive(action) {
    return (
      this.activeKeyboardActions.has(action) ||
      this.activeGamepadActions.has(action)
    );
  }

  getMovementBinaryState() {
    return {
      up: this.isActionActive('moveUp'),
      down: this.isActionActive('moveDown'),
      left: this.isActionActive('moveLeft'),
      right: this.isActionActive('moveRight'),
    };
  }

  getLastMoveCommandFromQueue() {
    const queue = this.resolveCommandQueue();
    if (!queue) {
      return null;
    }

    if (typeof queue.peekLast !== 'function') {
      return this.lastMovementCommand || null;
    }

    const latestMove = queue.peekLast({ type: 'move' });
    if (latestMove && latestMove.payload) {
      return latestMove.payload;
    }

    return null;
  }

  getMovementInput() {
    // LEGACY: This adapter reads from the command queue until Step 7 removes it.
    const lastMove = this.getLastMoveCommandFromQueue();

    if (lastMove && lastMove.binary) {
      return {
        up: Boolean(lastMove.binary.up),
        down: Boolean(lastMove.binary.down),
        left: Boolean(lastMove.binary.left),
        right: Boolean(lastMove.binary.right),
      };
    }

    if (this.lastMovementCommand && this.lastMovementCommand.binary) {
      return {
        up: Boolean(this.lastMovementCommand.binary.up),
        down: Boolean(this.lastMovementCommand.binary.down),
        left: Boolean(this.lastMovementCommand.binary.left),
        right: Boolean(this.lastMovementCommand.binary.right),
      };
    }

    return this.getMovementBinaryState();
  }

  getMousePosition() {
    return { ...this.mousePos };
  }

  isMouseButtonDown(button = 0) {
    return !!this.mouseButtons[button];
  }

  getActiveKeys() {
    const activeKeys = Object.keys(this.keys).filter((key) => this.keys[key]);
    const activeCodes = Object.keys(this.codes).filter(
      (code) => this.codes[code]
    );
    return [...new Set([...activeKeys, ...activeCodes])];
  }

  update() {
    this.pollGamepad();

    const liveFrame = this.sampleInputFrame();
    const frame = this.inputSource?.(liveFrame) ?? liveFrame;
    this.dispatchStepPresses(frame);

    const { command, metadata } = buildMovementCommandPayload(frame, {
      activeKeyboardActions: this.activeKeyboardActions,
      activeGamepadActions: this.activeGamepadActions,
      keyboardActionInputs: this.keyboardActionInputs,
    });
    this.lastMovementCommand = command;

    const queue = this.resolveCommandQueue();
    if (!queue) {
      return;
    }

    try {
      queue.enqueue(command, metadata);
    } catch (error) {
      console.warn('[InputSystem] Failed to enqueue movement command:', error);
    }
  }

  destroy() {
    if (this.menuPollFrame !== null) {
      window.cancelAnimationFrame?.(this.menuPollFrame);
      this.menuPollFrame = null;
    }
    if (this.handleKeyDownCapture) {
      document.removeEventListener('keydown', this.handleKeyDownCapture, true);
    }
    if (this.handleKeyUpCapture) {
      document.removeEventListener('keyup', this.handleKeyUpCapture, true);
    }

    debugLog('[InputSystem] Destroyed');
  }
}

export default InputSystem;
