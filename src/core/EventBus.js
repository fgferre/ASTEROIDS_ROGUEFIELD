// src/core/EventBus.js
class EventBus {
  constructor() {
    this.events = new Map();
    this.debug = true; // Para debug durante desenvolvimento
    console.log('[EventBus] Initialized');
  }

  // Registrar listener para evento
  on(eventName, callback, context = null) {
    if (typeof eventName !== 'string') {
      console.error('[EventBus] Event name must be string:', eventName);
      return;
    }

    if (typeof callback !== 'function') {
      console.error('[EventBus] Callback must be function:', callback);
      return;
    }

    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }

    this.events.get(eventName).push({ callback, context });

    if (this.debug) {
      console.log(`[EventBus] Registered listener for: ${eventName}`);
    }
  }

  // Disparar evento
  emit(eventName, data = null) {
    if (this.debug) {
      console.log(`[EventBus] Emitting: ${eventName}`, data);
    }

    if (this.events.has(eventName)) {
      const listeners = this.events.get(eventName);
      listeners.forEach(({ callback, context }) => {
        try {
          if (context) {
            callback.call(context, data);
          } else {
            callback(data);
          }
        } catch (error) {
          console.error(
            `[EventBus] Error in listener for ${eventName}:`,
            error
          );
        }
      });
    }
  }

  // Remover listener específico
  off(eventName, callback) {
    if (this.events.has(eventName)) {
      const listeners = this.events.get(eventName);
      const index = listeners.findIndex(
        (listener) => listener.callback === callback
      );
      if (index > -1) {
        listeners.splice(index, 1);
        if (this.debug) {
          console.log(`[EventBus] Removed listener for: ${eventName}`);
        }
      }
    }
  }

  // Remover todos os listeners de um evento
  clear(eventName) {
    if (this.events.has(eventName)) {
      this.events.delete(eventName);
      if (this.debug) {
        console.log(`[EventBus] Cleared all listeners for: ${eventName}`);
      }
    }
  }

  // Debug: listar todos os eventos
  listEvents() {
    const eventNames = Array.from(this.events.keys());
    console.log('[EventBus] Registered events:', eventNames);
    eventNames.forEach((name) => {
      console.log(`  ${name}: ${this.events.get(name).length} listeners`);
    });
  }

  // Limpar tudo
  destroy() {
    this.events.clear();
    console.log('[EventBus] Destroyed');
  }
}

// Singleton global
const gameEvents = new EventBus();

// Para compatibilidade de módulos ES6 e CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = gameEvents;
}

// Para ES6 modules
if (typeof window !== 'undefined') {
  window.gameEvents = gameEvents;
}
