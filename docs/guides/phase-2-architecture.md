# Fase 2: Refatoração Arquitetural

## 🎯 Objetivo
Refatorar a arquitetura para eliminar tight coupling, quebrar classes monolíticas e estabelecer padrões consistentes que facilitem manutenibilidade e extensibilidade.

## 🏗️ Problemas Arquiteturais Identificados

### **Problema 1: Service Locator Anti-Pattern**
**Localização:** 114+ chamadas `gameServices.get()` em toda a codebase
**Impacto:** Tight coupling, testes difíceis, dependências ocultas
**Solução:** Dependency Injection container

### **Problema 2: Classes Monolíticas**
**Localização:**
- `EnemySystem.js` - 2,738 linhas *(versão original monolítica agora arquivada em [`docs/archive/EnemySystem.old.js`](../archive/EnemySystem.old.js) para referência histórica)*
- `UISystem.js` - 3,031 linhas
- `EffectsSystem.js` - 1,420 linhas
**Impacto:** Difícil manutenção, violação SRP
**Solução:** Decomposição modular

### **Problema 3: Inconsistências de Padrões**
**Localização:** Diversos arquivos
**Impacto:** Curva de aprendizado, bugs por inconsistência
**Solução:** Padronização e convenções

## 🗺️ Plano de Implementação

### **Etapa 2.1: Dependency Injection System** (Dias 1-3)

#### **2.1.1 Criar DI Container**
```javascript
// src/core/DIContainer.js
class DIContainer {
  constructor() {
    this.services = new Map();
    this.singletons = new Map();
    this.factories = new Map();
    this.initializing = new Set(); // Prevent circular dependencies
  }

  register(name, factory, options = {}) {
    const { singleton = true, dependencies = [] } = options;

    this.factories.set(name, {
      factory,
      dependencies,
      singleton
    });

    if (this.services.has(name)) {
      throw new Error(`Service '${name}' already registered`);
    }

    console.log(`[DI] Registered service: ${name}`);
  }

  resolve(name) {
    // Check if already instantiated singleton
    if (this.singletons.has(name)) {
      return this.singletons.get(name);
    }

    const serviceConfig = this.factories.get(name);
    if (!serviceConfig) {
      throw new Error(`Service '${name}' not found`);
    }

    // Prevent circular dependencies
    if (this.initializing.has(name)) {
      throw new Error(`Circular dependency detected: ${name}`);
    }

    this.initializing.add(name);

    try {
      // Resolve dependencies first
      const deps = serviceConfig.dependencies.map(dep => this.resolve(dep));

      // Create instance
      const instance = serviceConfig.factory(...deps);

      // Store singleton
      if (serviceConfig.singleton) {
        this.singletons.set(name, instance);
      }

      this.initializing.delete(name);
      return instance;
    } catch (error) {
      this.initializing.delete(name);
      throw error;
    }
  }

  has(name) {
    return this.factories.has(name) || this.singletons.has(name);
  }

  clear() {
    this.services.clear();
    this.singletons.clear();
    this.factories.clear();
    this.initializing.clear();
  }
}
```

#### **2.1.2 Service Registry**
```javascript
// src/core/ServiceRegistry.js
class ServiceRegistry {
  static setupServices(container) {
    // Core services first (no dependencies)
    container.register('event-bus', () => new EventBus());
    container.register('settings', () => new SettingsSystem(), {
      dependencies: ['event-bus']
    });

    // System services
    container.register('audio', (eventBus, settings) =>
      new AudioSystem(eventBus, settings), {
      dependencies: ['event-bus', 'settings']
    });

    container.register('input', (eventBus) =>
      new InputSystem(eventBus), {
      dependencies: ['event-bus']
    });

    container.register('physics', (eventBus) =>
      new PhysicsSystem(eventBus), {
      dependencies: ['event-bus']
    });

    // Game logic services
    container.register('player', (eventBus, input, audio) =>
      new PlayerSystem(eventBus, input, audio), {
      dependencies: ['event-bus', 'input', 'audio']
    });

    container.register('enemies', (eventBus, physics, audio) =>
      new EnemySystem(eventBus, physics, audio), {
      dependencies: ['event-bus', 'physics', 'audio']
    });

    // UI and effects (depend on multiple systems)
    container.register('effects', (eventBus, audio, settings) =>
      new EffectsSystem(eventBus, audio, settings), {
      dependencies: ['event-bus', 'audio', 'settings']
    });

    container.register('ui', (eventBus, settings, input) =>
      new UISystem(eventBus, settings, input), {
      dependencies: ['event-bus', 'settings', 'input']
    });
  }
}
```

#### **2.1.3 Migração Gradual do Service Locator**
**Estratégia:** Adapter pattern para compatibilidade durante transição

```javascript
// src/core/ServiceLocatorAdapter.js
class ServiceLocatorAdapter {
  constructor(diContainer) {
    this.container = diContainer;
    this.deprecationWarnings = new Set();
  }

  get(serviceName) {
    // Emit deprecation warning once per service
    if (!this.deprecationWarnings.has(serviceName)) {
      console.warn(`[DEPRECATED] gameServices.get('${serviceName}') - Use DI instead`);
      this.deprecationWarnings.add(serviceName);
    }

    return this.container.resolve(serviceName);
  }

  register(name, service) {
    // For legacy compatibility only
    this.container.singletons.set(name, service);
  }

  has(name) {
    return this.container.has(name);
  }
}

// Global replacement
window.gameServices = new ServiceLocatorAdapter(diContainer);
```

### **Etapa 2.2: Decomposição do EnemySystem** (Dias 4-6)

#### **2.2.1 Análise da Responsabilidade Atual**
**EnemySystem.js atualmente faz:**
- Spawning de asteroides ✂️ → `AsteroidSpawner`
- Lógica de movimento ✂️ → `AsteroidMovement`
- Variantes especiais ✂️ → `AsteroidVariants`
- Collision handling ✂️ → `AsteroidCollision`
- Rendering logic ✂️ → `AsteroidRenderer`

#### **2.2.2 Criar Componentes Especializados**

**AsteroidSpawner:**
```javascript
// src/modules/enemies/AsteroidSpawner.js
export class AsteroidSpawner {
  constructor(eventBus, physics, worldBounds) {
    this.eventBus = eventBus;
    this.physics = physics;
    this.worldBounds = worldBounds;
    this.spawnRules = new AsteroidSpawnRules();
  }

  spawnWave(waveConfig) {
    const positions = this.calculateSpawnPositions(waveConfig.count);
    const asteroids = [];

    for (const pos of positions) {
      const asteroid = this.spawnRules.createAsteroid(waveConfig, pos);
      asteroids.push(asteroid);
    }

    return asteroids;
  }

  calculateSpawnPositions(count) {
    // Safe spawn logic avoiding player
    return this.spawnRules.generateSafePositions(count, this.worldBounds);
  }
}
```

**AsteroidMovement:**
```javascript
// src/modules/enemies/AsteroidMovement.js
export class AsteroidMovement {
  constructor() {
    this.movementStrategies = new Map();
    this.registerDefaultStrategies();
  }

  registerDefaultStrategies() {
    this.movementStrategies.set('linear', new LinearMovement());
    this.movementStrategies.set('orbital', new OrbitalMovement());
    this.movementStrategies.set('seeking', new SeekingMovement());
  }

  update(asteroids, deltaTime, playerPosition) {
    for (const asteroid of asteroids) {
      const strategy = this.movementStrategies.get(asteroid.movementType);
      if (strategy) {
        strategy.update(asteroid, deltaTime, playerPosition);
      }
    }
  }
}
```

**AsteroidVariants:**
```javascript
// src/modules/enemies/AsteroidVariants.js
export class AsteroidVariants {
  constructor() {
    this.variants = new Map();
    this.registerVariants();
  }

  registerVariants() {
    this.variants.set('volatile', new VolatileAsteroid());
    this.variants.set('fragmenting', new FragmentingAsteroid());
    this.variants.set('magnetic', new MagneticAsteroid());
  }

  applyVariant(asteroid, variantType) {
    const variant = this.variants.get(variantType);
    if (variant) {
      variant.apply(asteroid);
    }
  }
}
```

#### **2.2.3 Novo EnemySystem Coordenador**
```javascript
// src/modules/EnemySystem.js (Refatorado)
export class EnemySystem {
  constructor(eventBus, physics, audio) {
    this.eventBus = eventBus;
    this.physics = physics;
    this.audio = audio;

    // Specialized components
    this.spawner = new AsteroidSpawner(eventBus, physics, worldBounds);
    this.movement = new AsteroidMovement();
    this.variants = new AsteroidVariants();
    this.collision = new AsteroidCollision(eventBus);
    this.renderer = new AsteroidRenderer();

    this.asteroids = [];
    this.setupEventListeners();
  }

  update(deltaTime) {
    this.movement.update(this.asteroids, deltaTime, this.getPlayerPosition());
    this.collision.checkCollisions(this.asteroids);
    this.updateLifecycle(deltaTime);
  }

  render(ctx) {
    this.renderer.renderAll(ctx, this.asteroids);
  }

  // Simplified coordination logic only
  spawnWave(config) {
    const newAsteroids = this.spawner.spawnWave(config);
    this.asteroids.push(...newAsteroids);
  }
}
```

### **Etapa 2.3: Refatoração do UISystem** (Dias 7-9)

#### **2.3.1 Decomposição em Componentes**
```javascript
// src/modules/ui/HUDManager.js
export class HUDManager {
  constructor(eventBus, layout) {
    this.eventBus = eventBus;
    this.layout = layout;
    this.elements = new Map();
    this.updaters = new Map();
  }

  // Handle only HUD-related logic
}

// src/modules/ui/MenuManager.js
export class MenuManager {
  constructor(eventBus, settings) {
    // Handle menu screens, transitions
  }
}

// src/modules/ui/SettingsUI.js
export class SettingsUI {
  constructor(eventBus, settingsSystem) {
    // Handle settings interface only
  }
}

// src/modules/UISystem.js (Refatorado)
export class UISystem {
  constructor(eventBus, settings, input) {
    this.hud = new HUDManager(eventBus, HUD_LAYOUT);
    this.menu = new MenuManager(eventBus, settings);
    this.settings = new SettingsUI(eventBus, settings);

    // Coordinate between components
  }
}
```

### **Etapa 2.4: Error Boundaries & Exception Handling** (Dias 10-12)

#### **2.4.1 System-Level Error Boundaries**
```javascript
// src/core/ErrorBoundary.js
export class SystemErrorBoundary {
  constructor(systemName) {
    this.systemName = systemName;
    this.errorCount = 0;
    this.maxErrors = 5;
    this.resetTime = 30000; // 30 seconds
    this.lastReset = Date.now();
  }

  wrap(fn) {
    return (...args) => {
      try {
        return fn.apply(this, args);
      } catch (error) {
        this.handleError(error);
        return null; // Safe fallback
      }
    };
  }

  handleError(error) {
    this.errorCount++;
    console.error(`[${this.systemName}] Error:`, error);

    // Reset counter periodically
    if (Date.now() - this.lastReset > this.resetTime) {
      this.errorCount = 0;
      this.lastReset = Date.now();
    }

    // Disable system if too many errors
    if (this.errorCount > this.maxErrors) {
      console.error(`[${this.systemName}] Too many errors, disabling system`);
      gameEvents.emit('system-disabled', { system: this.systemName, error });
    }
  }
}
```

#### **2.4.2 Graceful Degradation**
```javascript
// src/core/SystemManager.js
export class SystemManager {
  constructor(diContainer) {
    this.container = diContainer;
    this.systems = new Map();
    this.disabledSystems = new Set();
    this.errorBoundaries = new Map();
  }

  initializeSystem(systemName) {
    try {
      const system = this.container.resolve(systemName);
      const boundary = new SystemErrorBoundary(systemName);

      this.systems.set(systemName, system);
      this.errorBoundaries.set(systemName, boundary);

      // Wrap critical methods
      if (system.update) {
        system.update = boundary.wrap(system.update);
      }
      if (system.render) {
        system.render = boundary.wrap(system.render);
      }

    } catch (error) {
      console.error(`Failed to initialize ${systemName}:`, error);
      this.disabledSystems.add(systemName);
    }
  }

  updateSystems(deltaTime) {
    for (const [name, system] of this.systems) {
      if (!this.disabledSystems.has(name) && system.update) {
        system.update(deltaTime);
      }
    }
  }
}
```

### **Etapa 2.5: Padrões e Convenções** (Dias 13-14)

#### **2.5.1 Base Classes Padronizadas**
```javascript
// src/core/BaseSystem.js
export class BaseSystem {
  constructor(name, dependencies = []) {
    this.name = name;
    this.dependencies = dependencies;
    this.initialized = false;
    this.enabled = true;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.onInitialize();
      this.initialized = true;
      console.log(`[${this.name}] Initialized`);
    } catch (error) {
      console.error(`[${this.name}] Initialization failed:`, error);
      throw error;
    }
  }

  update(deltaTime) {
    if (!this.enabled || !this.initialized) return;
    this.onUpdate(deltaTime);
  }

  render(ctx) {
    if (!this.enabled || !this.initialized) return;
    this.onRender(ctx);
  }

  reset() {
    if (!this.initialized) return;
    this.onReset();
  }

  destroy() {
    if (!this.initialized) return;
    this.onDestroy();
    this.initialized = false;
  }

  // Abstract methods - subclasses must implement
  async onInitialize() {}
  onUpdate(deltaTime) {}
  onRender(ctx) {}
  onReset() {}
  onDestroy() {}
}
```

#### **2.5.2 Event Patterns Padronizados**
```javascript
// src/core/EventPatterns.js
export class EventPatterns {
  // Standard event naming conventions
  static SYSTEM_EVENTS = {
    INITIALIZED: (system) => `${system}-initialized`,
    UPDATED: (system) => `${system}-updated`,
    ERROR: (system) => `${system}-error`,
    DISABLED: (system) => `${system}-disabled`
  };

  static GAME_EVENTS = {
    PLAYER: {
      SPAWNED: 'player-spawned',
      DIED: 'player-died',
      LEVEL_UP: 'player-level-up',
      DAMAGED: 'player-damaged'
    },
    ENEMY: {
      SPAWNED: 'enemy-spawned',
      DESTROYED: 'enemy-destroyed',
      WAVE_COMPLETE: 'wave-complete'
    }
  };

  // Event payload validation
  static validatePayload(eventName, payload, schema) {
    // JSON Schema validation logic
  }
}
```

## 📊 Métricas de Sucesso

### **Coupling Metrics**
```javascript
// scripts/analysis/coupling-analysis.js
class CouplingAnalyzer {
  static analyzeDependencies() {
    const results = {
      totalServiceCalls: 0,
      filesCoupled: 0,
      averageMethodsPerClass: 0,
      cyclomaticComplexity: {}
    };

    // Analyze service calls, class sizes, complexity
    return results;
  }

  static compareBeforeAfter() {
    // Compare metrics pre and post refactoring
  }
}
```

### **Critérios de Aceitação**
- **Service calls:** Reduzir `gameServices.get()` em 80%+
- **Class size:** Nenhuma classe >500 linhas
- **Cyclomatic complexity:** <10 por método
- **Test coverage:** 70%+ para novos componentes

## 🧪 Estratégia de Testing

### **Integration Tests**
```javascript
// src/__tests__/integration/dependency-injection.test.js
describe('Dependency Injection', () => {
  let container;

  beforeEach(() => {
    container = new DIContainer();
    ServiceRegistry.setupServices(container);
  });

  test('should resolve all services without circular dependencies', () => {
    const serviceNames = ['player', 'enemies', 'physics', 'ui'];

    for (const name of serviceNames) {
      expect(() => container.resolve(name)).not.toThrow();
    }
  });

  test('should inject dependencies correctly', () => {
    const playerSystem = container.resolve('player');

    expect(playerSystem.eventBus).toBeDefined();
    expect(playerSystem.input).toBeDefined();
    expect(playerSystem.audio).toBeDefined();
  });
});
```

### **Component Tests**
```javascript
// src/__tests__/enemies/asteroid-spawner.test.js
describe('AsteroidSpawner', () => {
  test('should spawn asteroids in safe positions', () => {
    const spawner = new AsteroidSpawner(mockEventBus, mockPhysics, worldBounds);
    const config = { count: 5, size: 'large' };

    const asteroids = spawner.spawnWave(config);

    expect(asteroids).toHaveLength(5);
    asteroids.forEach(asteroid => {
      expect(asteroid.x).toBeGreaterThanOrEqual(0);
      expect(asteroid.y).toBeGreaterThanOrEqual(0);
    });
  });
});
```

## 🔄 Migration Strategy

### **Etapa de Migração**
1. **Week 1:** DI Container + Service Registry
2. **Week 2:** Migrate core systems to DI
3. **Week 3:** Decompose EnemySystem
4. **Week 4:** Decompose UISystem + Error boundaries

### **Rollback Safety**
- Feature flags para DI vs Service Locator
- Adapter pattern mantém compatibilidade
- Automated tests validam equivalência funcional

## 📋 Checklist de Implementação

### **Etapa 2.1: Dependency Injection**
- [ ] Implementar DIContainer
- [ ] Criar ServiceRegistry
- [ ] Implementar ServiceLocatorAdapter
- [ ] Migrar sistema por sistema
- [ ] Testes de integração
- [ ] Validar performance (não deve degradar)

### **Etapa 2.2: EnemySystem Decomposition**
- [ ] Criar AsteroidSpawner
- [ ] Criar AsteroidMovement
- [ ] Criar AsteroidVariants
- [ ] Refatorar EnemySystem principal
- [ ] Testes unitários para cada componente
- [ ] Validar gameplay identico

### **Etapa 2.3: UISystem Refactoring**
- [ ] Criar HUDManager
- [ ] Criar MenuManager
- [ ] Criar SettingsUI
- [ ] Refatorar UISystem coordenador
- [ ] Testes de componentes UI
- [ ] Validar UX preservada

### **Etapa 2.4: Error Boundaries**
- [ ] Implementar SystemErrorBoundary
- [ ] Criar SystemManager
- [ ] Adicionar graceful degradation
- [ ] Testes de fault tolerance
- [ ] Logging estruturado

### **Etapa 2.5: Patterns & Conventions**
- [ ] Criar BaseSystem
- [ ] Padronizar event patterns
- [ ] Migrar sistemas existentes
- [ ] Code style validation
- [ ] Documentation update

## 🚨 Riscos e Mitigações

### **Principais Riscos**
1. **Breaking changes durante migração**
   - Mitigação: Adapter pattern, feature flags

2. **Performance degradation com DI**
   - Mitigação: Benchmark contínuo, lazy loading

3. **Circular dependencies**
   - Mitigação: Detection automática, design review

4. **Test complexity increase**
   - Mitigação: Mock factories, test utilities

### **Contingency Plan**
Se refatoração não atingir objetivos:
1. Rollback para service locator
2. Implementar melhorias pontuais
3. Revisitar arquitetura incremental
4. Focar em decomposição sem DI

---

**⚠️ Importante:** Esta fase afeta estrutura fundamental. Validação rigorosa em cada etapa é essencial.

**🎯 Meta:** Arquitetura limpa, testável e extensível sem impacto na funcionalidade existente.