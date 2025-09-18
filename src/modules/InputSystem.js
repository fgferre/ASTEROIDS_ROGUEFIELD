// src/modules/InputSystem.js

class InputSystem {
  constructor() {
    this.keys = {}; // Estado atual das teclas
    this.codes = {}; // Estado atual baseado no código físico da tecla
    this.mousePos = { x: 0, y: 0 };
    this.mouseButtons = {};
    this.gamepadConnected = false;
    this.gamepad = null;

    this.movementBindings = new Set([
      'w',
      'a',
      's',
      'd',
      'keyw',
      'keya',
      'keys',
      'keyd',
      'arrowup',
      'arrowdown',
      'arrowleft',
      'arrowright',
    ]);

    this.keyAliases = {
      w: 'keyw',
      a: 'keya',
      s: 'keys',
      d: 'keyd',
    };

    this.setupEventListeners();

    // Registrar no ServiceLocator
    if (typeof gameServices !== 'undefined') {
      gameServices.register('input', this);
    }

    console.log('[InputSystem] Initialized');
  }

  setupEventListeners() {
    // Keyboard events
    document.addEventListener('keydown', (e) => {
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';
      const wasPressed = (key && this.keys[key]) || (code && this.codes[code]);

      if (key) this.keys[key] = true;
      if (code) this.codes[code] = true;

      if (this.isMovementBinding(key) || this.isMovementBinding(code)) {
        e.preventDefault();
      }

      const isEscape = key === 'escape' || code === 'escape';
      if (isEscape) {
        e.preventDefault();
        if (!wasPressed && typeof gameEvents !== 'undefined') {
          gameEvents.emit('toggle-pause');
        }
      }

      if (
        !wasPressed &&
        typeof gameEvents !== 'undefined' &&
        (key === 'e' || code === 'keye')
      ) {
        gameEvents.emit('activate-shield-pressed');
      }

      // Emit event apenas na primeira pressão
      if (!wasPressed && typeof gameEvents !== 'undefined') {
        gameEvents.emit('key-pressed', { key, code, type: 'down', event: e });
      }
    });

    document.addEventListener('keyup', (e) => {
      const key = typeof e.key === 'string' ? e.key.toLowerCase() : '';
      const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';

      if (key) this.keys[key] = false;
      if (code) this.codes[code] = false;

      if (this.isMovementBinding(key) || this.isMovementBinding(code)) {
        e.preventDefault();
      }

      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('key-pressed', { key, code, type: 'up', event: e });
      }
    });

    // Mouse events
    document.addEventListener('mousemove', (e) => {
      this.mousePos.x = e.clientX;
      this.mousePos.y = e.clientY;
    });

    document.addEventListener('mousedown', (e) => {
      this.mouseButtons[e.button] = true;
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('mouse-pressed', {
          button: e.button,
          type: 'down',
          pos: { ...this.mousePos },
        });
      }
    });

    document.addEventListener('mouseup', (e) => {
      this.mouseButtons[e.button] = false;
      if (typeof gameEvents !== 'undefined') {
        gameEvents.emit('mouse-pressed', {
          button: e.button,
          type: 'up',
          pos: { ...this.mousePos },
        });
      }
    });

    // Gamepad support (futuro)
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepadConnected = true;
      console.log('[InputSystem] Gamepad connected:', e.gamepad);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
      this.gamepadConnected = false;
      console.log('[InputSystem] Gamepad disconnected');
    });
  }

  // === MÉTODOS PÚBLICOS ===

  isMovementBinding(binding) {
    if (!binding) return false;
    return this.movementBindings.has(binding.toLowerCase());
  }

  // Verificar se tecla está pressionada
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

  // Verificar múltiplas teclas (OR logic)
  areAnyKeysDown(keys) {
    return keys.some((key) => this.isKeyDown(key));
  }

  // Verificar todas as teclas (AND logic)
  areAllKeysDown(keys) {
    return keys.every((key) => this.isKeyDown(key));
  }

  // Obter input de movimento (compatível com código atual)
  getMovementInput() {
    return {
      up: this.isKeyDown('w') || this.isKeyDown('arrowup'),
      down: this.isKeyDown('s') || this.isKeyDown('arrowdown'),
      left: this.isKeyDown('a') || this.isKeyDown('arrowleft'),
      right: this.isKeyDown('d') || this.isKeyDown('arrowright'),
    };
  }

  // Posição do mouse
  getMousePosition() {
    return { ...this.mousePos };
  }

  // Estado do mouse
  isMouseButtonDown(button = 0) {
    return !!this.mouseButtons[button];
  }

  // Debug: listar teclas pressionadas
  getActiveKeys() {
    const activeKeys = Object.keys(this.keys).filter((key) => this.keys[key]);
    const activeCodes = Object.keys(this.codes).filter(
      (code) => this.codes[code]
    );
    return [...new Set([...activeKeys, ...activeCodes])];
  }

  // Update (chamado pelo game loop)
  update(deltaTime) {
    // Input system é baseado em eventos, não precisa update por frame
    // Mas mantemos interface consistente para futuras expansões

    // Futuro: gamepad polling aqui
    if (this.gamepadConnected) {
      this.updateGamepad();
    }
  }

  updateGamepad() {
    const gamepads = navigator.getGamepads();
    this.gamepad = gamepads?.[0]; // Primeiro gamepad

    // Implementar lógica de gamepad no futuro
  }

  // Cleanup
  destroy() {
    // Remove event listeners se necessário
    console.log('[InputSystem] Destroyed');
  }
}

export default InputSystem;

// Compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InputSystem;
}
