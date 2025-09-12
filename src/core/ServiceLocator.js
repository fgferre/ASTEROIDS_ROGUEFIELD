// src/core/ServiceLocator.js
class ServiceLocator {
  constructor() {
    this.services = new Map();
    this.debug = true;
    console.log('[ServiceLocator] Initialized');
  }

  // Registrar serviço
  register(name, service) {
    if (typeof name !== 'string') {
      console.error('[ServiceLocator] Service name must be string:', name);
      return false;
    }

    if (!service) {
      console.error('[ServiceLocator] Service cannot be null/undefined');
      return false;
    }

    if (this.services.has(name)) {
      console.warn(
        `[ServiceLocator] Service '${name}' already exists. Overwriting.`
      );
    }

    this.services.set(name, service);

    if (this.debug) {
      console.log(`[ServiceLocator] Registered service: ${name}`);
    }

    return true;
  }

  // Obter serviço
  get(name) {
    const service = this.services.get(name);
    if (!service) {
      console.error(`[ServiceLocator] Service not found: ${name}`);
      console.log('Available services:', Array.from(this.services.keys()));
      return null;
    }
    return service;
  }

  // Verificar se serviço existe
  has(name) {
    return this.services.has(name);
  }

  // Remover serviço
  unregister(name) {
    const existed = this.services.delete(name);
    if (existed && this.debug) {
      console.log(`[ServiceLocator] Unregistered service: ${name}`);
    }
    return existed;
  }

  // Debug: listar serviços
  listServices() {
    const serviceNames = Array.from(this.services.keys());
    console.log('[ServiceLocator] Registered services:', serviceNames);
    return serviceNames;
  }

  // Limpar todos os serviços
  clear() {
    this.services.clear();
    if (this.debug) {
      console.log('[ServiceLocator] Cleared all services');
    }
  }
}

// Singleton global
const gameServices = new ServiceLocator();

// Compatibilidade
if (typeof module !== 'undefined' && module.exports) {
  module.exports = gameServices;
}

if (typeof window !== 'undefined') {
  window.gameServices = gameServices;
}
