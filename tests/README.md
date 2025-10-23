# Estrutura de Testes - ASTEROIDS_ROGUEFIELD

## Visão Geral

Todos os testes do projeto estão organizados em `/tests` (fora de `/src`) seguindo uma estrutura modular por tipo e responsabilidade. A reorganização foi concluída em janeiro de 2025, consolidando 31 arquivos de teste e criando helpers centralizados para eliminar duplicação de código.

## Organização de Diretórios

### `/tests/unit/`
Testes unitários isolados de módulos individuais.

#### `unit/core/`
Testes de infraestrutura central do jogo:
- `DIContainer.test.js` - Container de injeção de dependências (354 linhas, 9 describes)
- `ObjectPool.test.js` - Pool de objetos reutilizáveis (198 linhas, 6 describes)
- `SpatialHash.test.js` - Malha espacial para detecção de colisões (523 linhas, 8 describes)
- `RandomService.test.js` - Gerador de números aleatórios determinístico (10 testes)

#### `unit/modules/`
Testes de sistemas de gameplay:
- `AudioBatcher.test.js` - Batching de efeitos sonoros
- `AudioCache.test.js` - Cache de buffers de áudio
- `AudioSystem.randomScopes.test.js` - Escopos de randomização de áudio
- `PlayerSystem.commandQueue.test.js` - Fila de comandos do jogador
- `ProgressionSystem.test.js` - Sistema de progressão e upgrades (3 testes)
- `RenderingSystem.starfield.test.js` - Rendering de starfield determinístico
- `RandomHelperExposure.test.js` - Exposição de helpers de randomização
- `WaveManager.test.js` - Gerenciamento de waves e pesos de inimigos
- `enemies/RewardManager.test.js` - Sistema de recompensas (9 testes)

#### `unit/utils/`
Testes de utilitários:
- `ScreenShake.test.js` - Efeito de screen shake (3 testes)
- `randomHelpers.test.js` - Helpers de randomização

#### `unit/services/`
Testes de serviços:
- `GameSessionService.test.js` - Gerenciamento de sessão de jogo (5 testes)
- `CommandQueueService.test.js` - Serviço de fila de comandos (6 testes)

### `/tests/integration/`
Testes de integração entre múltiplos sistemas.

#### `integration/determinism/`
Testes de determinismo de sistemas:
- `systems.test.js` - Determinismo de RenderingSystem, WaveManager, RewardManager (3 testes)
- `enemy-system.test.js` - Determinismo de EnemySystem (1 teste)
- `start-reset-cycle.test.js` - Ciclo de start/reset determinístico (1 teste)

#### `integration/gameplay/`
Testes de gameplay:
- `mixed-enemy-waves.test.js` - Waves com múltiplos tipos de inimigos

#### `integration/wavemanager/`
Testes de integração WaveManager:
- `feature-flags.test.js` - Feature flags USE_WAVE_MANAGER (4 testes)

### `/tests/balance/`
Testes de balanceamento e métricas de jogo.

- `reward-mechanics.test.js` - Mecânicas de recompensa (487 linhas)

#### `balance/asteroid-metrics/`
Métricas de asteroides (quebrado de asteroid-baseline-metrics.test.js de 1197 linhas):
- `spawn-rates.test.js` - Wave spawn rates e baseline formula (11 testes)
- `size-distribution.test.js` - Distribuição 50/30/20 de tamanhos (1 teste)
- `variant-distribution.test.js` - Distribuição de variantes por tamanho e wave (9 testes)
- `fragmentation.test.js` - Regras de fragmentação e média de fragmentos (13 testes)
- `determinism.test.js` - Determinismo de sequências de asteroides (1 teste)

### `/tests/physics/`
Testes de física e colisões.

- `collision-accuracy.test.js` - Precisão de detecção de colisões

### `/tests/visual/`
Testes de rendering e determinismo visual/audio.

- `rendering-determinism.test.js` - Determinismo de rendering
- `audio-determinism.test.js` - Determinismo de áudio
- `screen-shake-determinism.test.js` - Determinismo de screen shake
- `menu-background-determinism.test.js` - Determinismo de background (THREE.js)
- `enemy-types-rendering.test.js` - Rendering de tipos de inimigos (3 testes)

### `/tests/__helpers__/`
Helpers compartilhados (NÃO são testes).

- `mocks.js` - Mocks de serviços (EventBus, ServiceRegistry, RandomService, AudioSystem, GameEvents)
- `stubs.js` - Stubs determinísticos (DeterministicRandom, Gain, Oscillator, BufferSource, Settings, RandomService)
- `fixtures.js` - Fixtures de entidades (Asteroid, Enemy, World, Player, Physics, Progression)
- `assertions.js` - Assertions customizadas (expectDeterministicSequence, expectWithinTolerance, expectSameSeeds)
- `setup.js` - Setup/cleanup de testes individuais (setupGlobalMocks, cleanupGlobalState, withWaveOverrides, createTestContainer)
- `global-setup.js` - Setup global do Vitest (vi.restoreAllMocks automático)
- `asteroid-helpers.js` - 13 helpers especializados para testes de asteroides (createEnemySystemHarness, simulateWave, prepareWave, collectSpawnMetrics, etc)

### `/tests/__fixtures__/`
Fixtures reutilizáveis (NÃO são testes).

- `enemies.js` - Fixtures de inimigos (ASTEROID_TEST_CONFIGS, WAVE_TEST_SAMPLES, SIZE_TEST_SAMPLES, FRAGMENT_VARIANT_SAMPLES)

## Executar Testes

### Comandos Principais

```bash
# Executar todos os testes (~31 arquivos)
npm test

# Modo watch (re-executa ao salvar)
npm run test:watch

# Interface visual do Vitest
npm run test:ui

# Com relatório de cobertura
npm run test:coverage
```

### Comandos por Categoria

```bash
# Apenas testes unitários (core, modules, utils, services)
npm run test:unit

# Apenas testes de integração (determinism, gameplay, wavemanager)
npm run test:integration

# Apenas testes de balanceamento (reward-mechanics, asteroid-metrics)
npm run test:balance

# Apenas testes visuais (rendering, audio, screen-shake determinism)
npm run test:visual

# Apenas testes de física (collision-accuracy)
npm run test:physics
```

### Comandos de Performance

```bash
# Benchmark de performance (5 runs, estatísticas)
npm run test:benchmark

# Validar padrões de otimização (anti-patterns)
npm run test:validate-optimizations
```

## Helpers Disponíveis

### Mocks (`tests/__helpers__/mocks.js`)

```javascript
import { 
  createEventBusMock,        // Mock completo de EventBus
  createServiceRegistryMock, // Mock de ServiceRegistry
  createRandomServiceStub,   // Stub determinístico de RandomService
  createAudioSystemStub,     // Stub de AudioSystem
  createGameEventsMock       // Alias para createEventBusMock
} from '../__helpers__/mocks.js';

// Exemplo
const eventBus = createEventBusMock();
eventBus.on('test-event', handler);
eventBus.emit('test-event', { data: 'test' });
```

### Stubs (`tests/__helpers__/stubs.js`)

```javascript
import { 
  createDeterministicRandom, // Random configurável
  createGainStub,            // Stub de GainNode
  createOscillatorStub,      // Stub de OscillatorNode
  createBufferSourceStub,    // Stub de AudioBufferSourceNode
  createSettingsStub         // Stub de SettingsSystem
} from '../__helpers__/stubs.js';

// Exemplo
const random = createDeterministicRandom({ 
  intValue: 5, 
  chanceValue: true 
});
```

### Fixtures (`tests/__helpers__/fixtures.js`)

```javascript
import { 
  createTestAsteroid,    // Factory de asteroides
  createTestEnemy,       // Factory genérica de inimigos
  createTestWorld,       // Stub de World
  createTestPlayer,      // Stub de Player
  createTestPhysics,     // Stub de PhysicsSystem
  createTestProgression  // Stub de ProgressionSystem
} from '../__helpers__/fixtures.js';

// Exemplo
const asteroid = createTestAsteroid({ size: 'large', variant: 'gold' });
const drone = createTestEnemy('drone', { wave: 5 });
```

### Assertions (`tests/__helpers__/assertions.js`)

```javascript
import { 
  expectDeterministicSequence, // Compara arrays com tolerância
  expectWithinTolerance,       // Compara números com epsilon
  expectSameSeeds              // Compara objetos de seeds
} from '../__helpers__/assertions.js';

// Exemplo
expectDeterministicSequence([0.1, 0.2], [0.1, 0.2], 0.0001);
expectWithinTolerance(actualValue, expectedValue, 0.01);
```

### Setup (`tests/__helpers__/setup.js`)

```javascript
import { 
  setupGlobalMocks,      // Configura globalThis.gameEvents, gameServices
  cleanupGlobalState,    // Limpa globalThis após testes
  withWaveOverrides,     // Wrapper para feature flags de WaveManager
  createTestContainer    // Wrapper para ServiceRegistry.createTestContainer
} from '../__helpers__/setup.js';

// Exemplo
beforeEach(() => {
  setupGlobalMocks();
});

afterEach(() => {
  cleanupGlobalState();
});
```

### Asteroid Helpers (`tests/__helpers__/asteroid-helpers.js`)

13 helpers especializados para testes de asteroides:

```javascript
import { 
  createEnemySystemHarness,           // Setup principal de teste
  simulateWave,                       // Simulação completa de wave
  prepareWave,                        // Preparação de wave
  collectSpawnMetrics,                // Coleta de métricas de spawn
  sampleVariants,                     // Amostragem de variantes
  computeExpectedVariantBreakdown,    // Cálculo de distribuição esperada
  computeAverageFragmentsForSize,     // Média de fragmentos
  getFragmentRuleForVariant,          // Regra de fragmentação por variante
  getFragmentRangeStats,              // Estatísticas de range de fragmentos
  computeFragmentExpectationBounds,   // Bounds de expectativa
  summarizeAsteroid,                  // Resumo de propriedades de asteroid
  createTestEventBus,                 // EventBus mock completo
  TEST_SEED,                          // Constante de seed de teste
  SAMPLE_ASTEROID_COUNT               // Constante de contagem de amostras
} from '../__helpers__/asteroid-helpers.js';
```

## Boas Práticas

### 1. Use Helpers Centralizados

❌ **Evite criar mocks inline:**
```javascript
const eventBus = {
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn()
};
```

✅ **Use helpers centralizados:**
```javascript
import { createEventBusMock } from '../__helpers__/mocks.js';
const eventBus = createEventBusMock();
```

### 2. Use Fixtures

❌ **Evite criar entidades inline:**
```javascript
const asteroid = {
  type: 'asteroid',
  size: 'large',
  variant: 'common',
  x: 100,
  y: 150,
  // ...
};
```

✅ **Use fixtures:**
```javascript
import { createTestAsteroid } from '../__helpers__/fixtures.js';
const asteroid = createTestAsteroid({ size: 'large', variant: 'common' });
```

### 3. Cleanup Automático

✅ **Não adicione `afterEach(() => vi.restoreAllMocks())`:**
- Já está configurado em `tests/__helpers__/global-setup.js`
- Executado automaticamente após cada teste via `vite.config.js`

### 4. Determinismo

✅ **Use `createDeterministicRandom()` para testes determinísticos:**
```javascript
import { createDeterministicRandom } from '../__helpers__/stubs.js';
const random = createDeterministicRandom({ intValue: 5 });
```

### 5. Performance

✅ **Use `beforeAll` para setup imutável:**
```javascript
// ❌ Evite (setup desnecessário)
beforeEach(() => {
  container = new DIContainer();
});

// ✅ Prefira (setup uma vez)
beforeAll(() => {
  container = new DIContainer();
});
```

✅ **Use `vi.useFakeTimers()` para delays:**
```javascript
// ❌ Evite (delay real de 60ms)
await new Promise(resolve => setTimeout(resolve, 60));

// ✅ Prefira (instantâneo)
vi.useFakeTimers();
vi.advanceTimersByTime(60);
vi.useRealTimers();
```

✅ **Use `.concurrent` para paralelização:**
```javascript
// ✅ Testes independentes podem rodar em paralelo
it.concurrent('test 1', () => { ... });
it.concurrent('test 2', () => { ... });
```

### 6. Consulte o Guia de Otimização

Veja `tests/OPTIMIZATION_GUIDE.md` para padrões de otimização aplicados:
- Setup global via vite.config.js
- beforeEach → beforeAll
- vi.useFakeTimers()
- describe.concurrent / it.concurrent
- Helpers centralizados

## Estrutura de Arquivos de Teste

### Template Básico

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { createTestAsteroid } from '../__helpers__/fixtures.js';

// Note: vi.restoreAllMocks() handled by global setup

describe('MySystem', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  it.concurrent('should do something', () => {
    // Test implementation
  });
});
```

## Checklist para Novos Testes

- [ ] Usar helpers de `tests/__helpers__/` ao invés de criar inline
- [ ] Usar fixtures de `tests/__fixtures__/` ao invés de criar entidades inline
- [ ] Usar `beforeAll` se setup é imutável
- [ ] Usar `vi.useFakeTimers()` se teste tem delays
- [ ] Usar `.concurrent` se testes são independentes
- [ ] **NÃO** adicionar `afterEach(() => vi.restoreAllMocks())` (já está no global setup)
- [ ] Adicionar comentários explicando o que o teste valida
- [ ] Seguir padrões de `tests/OPTIMIZATION_GUIDE.md`

## Resultados da Reorganização

- **31 arquivos de teste** reorganizados em estrutura modular
- **Performance:** -50-60% tempo de execução (via beforeAll, fakeTimers, concurrent)
- **Código duplicado:** -70-80% (via helpers centralizados)
- **Manutenibilidade:** Alta (padrões centralizados e validados)
- **Cobertura:** Completa (core, modules, integration, balance, physics, visual)

## Referências

- **Guia de Otimização:** `tests/OPTIMIZATION_GUIDE.md`
- **Documentação Principal:** `agents.md` seção 5.1
- **Configuração Vitest:** `vite.config.js`
- **Scripts de Teste:** `package.json` seção scripts
