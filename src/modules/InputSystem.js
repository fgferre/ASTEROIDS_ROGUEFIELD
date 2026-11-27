// src/modules/InputSystem.js
//
// Keys, mouse and pads in; each fixed step's input frame out (update()), and
// the press events the menus and the flight hear. The bindings live in
// input/keyBindings.js, the pad's reading in input/gamepadReading.js.

import { debugLog } from '../core/debugLogging.js';
import {
  normalizeDependencies,
  resolveEventBus,
  resolveService,
} from '../core/serviceUtils.js';
import { createInputFrame } from '../core/replay.js';
import { GAMEPAD_RUMBLE } from '../data/constants/gamepad.js';
import {
  CONTROLS_CATEGORY_ID,
  applyControlSettings,
  collectKeyboardActions,
  extractDefaultsFromSchema,
  isMovementBinding,
  normalizeKeyboardBinding,
  resolveControlFieldMap,
} from './input/keyBindings.js';
import {
  CENTRED_STICKS,
  DEFAULT_GAMEPAD_AXIS_THRESHOLD,
  clearGamepadActions,
  pollGamepad,
  rumble,
  startMenuPadPolling,
} from './input/gamepadReading.js';
import { inputLayers } from './input/inputLayers.js';

const PASSWORD_MANAGER_GUARD_CODES = new Set(['KeyS', 'ArrowDown']);
// Gameplay presses are applied at the next fixed step (not in the DOM handler)
// so a recorded run replays them at the same step.
const STEP_PRESS_FIELDS = {
  activateShield: 'shield',
  toggleSpreadMode: 'spread',
  toggleAimMode: 'aim',
  dash: 'dash',
};

class InputSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.eventBus = resolveEventBus(this.dependencies);
    // This step's frame (update()); the ship takes it once (takeStepFrame).
    this.stepFrame = null;
    this.stepFrameTaken = true;
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
    this.spaceFromFlight = false;
    // Pad sticks after the deadzone, read at each poll (see sampleInputFrame).
    this.padSticks = CENTRED_STICKS;
    // TouchControls on a touch device (app.js): its stick joins each step.
    this.touch = null;
    // Last device used: 'keyboard', 'gamepad' or 'touch' (tips and hints follow it).
    this.activeDevice = 'keyboard';
    this.menuPollFrame = null;

    this.keyAliases = { w: 'keyw', a: 'keya', s: 'keys', d: 'keyd' };

    this.controlFieldDefinitions = resolveControlFieldMap(this);

    this.setupEventListeners();
    this.initializeBindings();
    startMenuPadPolling(this);

    debugLog('[InputSystem] Initialized');
  }

  getEventBus() {
    const eventBus = this.eventBus || resolveEventBus(this.dependencies);
    if (eventBus && this.eventBus !== eventBus) {
      this.eventBus = eventBus;
    }
    return eventBus;
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
      values = extractDefaultsFromSchema(this);
    }

    applyControlSettings(this, values);
  }

  setupEventListeners() {
    // The screens' layer stack hears each key first (window capture): only
    // the screen on top acts on it. This system still hears every key and
    // asks the stack whether a game action passes (emitActionEvent).
    inputLayers.install(this.getEventBus());

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
          applyControlSettings(this, payload.values);
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

      eventBus.on('pause-state-changed', (payload = {}) => {
        if (payload?.isPaused) {
          this.pendingStepPresses.clear();
        }
      });

      eventBus.on('game-started', (payload = {}) => {
        this.replaying = Boolean(payload.replay);
      });

      eventBus.on('player-took-damage', (payload = {}) => {
        if ((payload.healthDamage ?? payload.damage) > 0) {
          rumble(this, GAMEPAD_RUMBLE.hullHit);
        }
      });
      eventBus.on('boss-spawned', () =>
        rumble(this, GAMEPAD_RUMBLE.wardenSpawn)
      );
      eventBus.on('player-dashed', () => rumble(this, GAMEPAD_RUMBLE.dash));
    }
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
    // A key a screen took (input/inputLayers.js) is its alone: no action
    // here, and no default held back (the HUD editor's text fields type it).
    const taken = inputLayers.took(event);

    if (
      !taken &&
      (isMovementBinding(this, key) || isMovementBinding(this, code))
    ) {
      event.preventDefault();
    }
    // A Space's repeats arm no button, nor does the release of one begun in
    // flight (the strafe) on a screen opened under it: pressed again, it does.
    if (code === 'space' && !taken) {
      if (!event.repeat) this.spaceFromFlight = this.isGameRunning();
      if (this.spaceFromFlight || event.repeat) event.preventDefault();
    }

    const normalizedKey = normalizeKeyboardBinding(event.key);
    const normalizedCode = normalizeKeyboardBinding(event.code);

    const actions = collectKeyboardActions(this, normalizedKey, normalizedCode);

    if (!wasPressed && !taken) {
      actions.forEach((action) => {
        // A repeat (the keys dropped on a focus loss) never confirms.
        if (event.repeat && action === 'confirm') return;
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
    if (code === 'space' && this.spaceFromFlight) event.preventDefault();

    const normalizedKey = normalizeKeyboardBinding(event.key);
    const normalizedCode = normalizeKeyboardBinding(event.code);
    const actions = collectKeyboardActions(this, normalizedKey, normalizedCode);

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
    clearGamepadActions(this);
    debugLog('[InputSystem] Gamepad disconnected');
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
      // A press made on the pause screen must not fire on resume, nor one
      // made under a screen (a card picked by its key resumes the run).
      if (this.isGameRunning() && inputLayers.passes(action, context.event)) {
        this.pendingStepPresses.add(stepField);
      }
      return;
    }

    switch (action) {
      // The screen on top and the cinematic playing decide (input/inputLayers.js).
      case 'pause':
        if (inputLayers.passes('pause', context.event)) {
          eventBus?.emit?.('toggle-pause');
        }
        break;
      case 'openSettings':
        if (!inputLayers.passes('openSettings', context.event)) break;
        eventBus?.emit?.('settings-menu-requested', {
          source: context.device || source || 'input',
        });
        break;
      case 'toggleFullscreen':
        eventBus?.emit?.('toggle-fullscreen');
        break;
      case 'confirm':
        // Nothing in flight takes it: no select sound on each Space strafe.
        if (!this.isGameRunning()) {
          eventBus?.emit?.('input-confirmed', { source, context });
        }
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
    const held = { ...this.getMovementBinaryState(), ...this.padSticks };
    const frame = createInputFrame(this.touch ? this.touch.merge(held) : held);
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

  /** The game screen ('playing', …) from the 'game-state' service, or null. */
  resolveGameScreen() {
    const gameStateService = resolveService('game-state', this.dependencies);
    if (gameStateService && typeof gameStateService.getScreen === 'function') {
      return gameStateService.getScreen() || null;
    }
    return null;
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
      strafeLeft: this.isActionActive('strafeLeft'),
      strafeRight: this.isActionActive('strafeRight'),
      strafeHold: this.isActionActive('strafeHold'),
    };
  }

  /** The four move keys of the last step's frame (the first-visit tips). */
  getMovementInput() {
    const held = this.stepFrame ?? this.getMovementBinaryState();
    return {
      up: Boolean(held.up),
      down: Boolean(held.down),
      left: Boolean(held.left),
      right: Boolean(held.right),
    };
  }

  /**
   * The frame the last update() made, once: the ship flies by it
   * (player/movementInput.js); null until the next update().
   */
  takeStepFrame() {
    if (this.stepFrameTaken) return null;
    this.stepFrameTaken = true;
    return this.stepFrame;
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
    pollGamepad(this);

    const liveFrame = this.sampleInputFrame();
    const frame = this.inputSource?.(liveFrame) ?? liveFrame;
    this.dispatchStepPresses(frame);
    this.stepFrame = frame;
    this.stepFrameTaken = false;
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
