# Guia de Testes – ASTEROIDS_ROGUEFIELD

## 1. Visão Geral

A suíte de testes cobre hoje **45 arquivos de teste** distribuídos por responsabilidade, com helpers centralizados e diretórios por domínio. A estrutura continua próxima de `/src`, mas não é mais um espelho perfeito e inclui suítes de integração, balanceamento e regressões visuais que cruzam múltiplos módulos. Use este documento como inventário operacional do estado atual de `/tests`.

## 2. Organização de Diretórios

A organização abaixo reflete o estado atual do diretório `/tests`.

```
/tests
├── core/                # espelha src/core/
│   ├── DIContainer.test.js
│   ├── ObjectPool.test.js
│   ├── RandomService.test.js
│   ├── SpatialHash.test.js
│   ├── bossVisualVariant.test.js
│   └── shipModels.test.js
├── modules/             # cobre sistemas em src/modules/
│   ├── AudioBatcher.test.js
│   ├── AudioCache.test.js
│   ├── AudioSystem.randomScopes.test.js
│   ├── BossDamageFeedback.test.js
│   ├── PlayerSystem.commandQueue.test.js
│   ├── ProgressionSystem.test.js
│   ├── RandomHelperExposure.test.js
│   ├── RenderingSystem.starfield.test.js
│   ├── WaveManager.test.js
│   └── enemies/
│       └── RewardManager.test.js
├── utils/               # espelha src/utils/
│   ├── ScreenShake.test.js
│   └── randomHelpers.test.js
├── services/            # espelha src/services/
│   ├── CommandQueueService.test.js
│   └── GameSessionService.test.js
├── integration/         # integra múltiplos sistemas
│   ├── determinism/
│   │   ├── asteroid-edge-wrapping.test.js
│   │   ├── asteroid-movement-migration.test.js
│   │   ├── enemy-system.test.js
│   │   ├── start-reset-cycle.test.js
│   │   └── systems.test.js
│   ├── gameplay/mixed-enemy-waves.test.js
│   └── wavemanager/feature-flags.test.js
├── balance/
│   ├── reward-mechanics.test.js
│   └── asteroid-metrics/
│       ├── determinism.test.js
│       ├── feature-flags.test.js
│       ├── fragmentation.test.js
│       ├── size-distribution.test.js
│       ├── spawn-rates.test.js
│       ├── variant-distribution.test.js
│       └── wave-state-counters.test.js
├── physics/collision-accuracy.test.js
├── visual/
│   ├── audio-determinism.test.js
│   ├── enemy-types-rendering.test.js
│   ├── explosion-light-pool.test.js
│   ├── material-fade-isolation.test.js
│   ├── menu-background-determinism.test.js
│   ├── menu-physics-stepping.test.js
│   ├── rendering-determinism.test.js
│   ├── screen-shake-determinism.test.js
│   └── thruster-determinism.test.js
├── __helpers__/         # helpers reutilizáveis (não são testes)
│   ├── asteroid-helpers.js
│   ├── assertions.js
│   ├── fixtures.js
│   ├── global-setup.js
│   ├── mocks.js
│   ├── setup.js
│   └── stubs.js
└── __fixtures__/
    ├── README.md
    └── enemies.js
```

> `tests/unit/` existe no repositório neste momento, mas está vazio e não entra no inventário acima.

## 3. Executar Testes

### Comandos principais

```bash
npm test                     # Executa todos os 45 arquivos .test/.spec
npm run test:watch           # Vitest em modo watch
npm run test:ui              # Interface visual do Vitest
npm run test:coverage        # Execução com relatório de cobertura
```

### Comandos por categoria

```bash
npm run test:core            # Testes de infraestrutura central (src/core)
npm run test:modules         # Sistemas de gameplay (src/modules)
npm run test:utils           # Utilitários (src/utils)
npm run test:services        # Serviços (src/services)
npm run test:integration     # Testes de integração
npm run test:balance         # Métricas e balanceamento
npm run test:visual          # Rendering e determinismo audiovisual
npm run test:physics         # Física e colisões
npm run test:benchmark       # Benchmarks (scripts/benchmark-tests.js)
npm run test:validate-optimizations  # Valida padrões de otimização
```

## 4. Helpers Disponíveis

Todos os helpers vivem em `tests/__helpers__/`. Utilize-os para evitar código duplicado:

### Mocks (`mocks.js`)

```javascript
import { createEventBusMock } from '../__helpers__/mocks.js';

const eventBus = createEventBusMock();
eventBus.emit('enemy-spawned', { id: 'test' });
```

### Stubs (`stubs.js`)

```javascript
import { createDeterministicRandom } from '../__helpers__/stubs.js';

const random = createDeterministicRandom({ floatValue: 0.5 });
expect(random.float()).toBe(0.5);
```

### Fixtures (`fixtures.js`)

```javascript
import { createTestEnemy } from '../__helpers__/fixtures.js';

const enemy = createTestEnemy('drone', { wave: 5 });
expect(enemy.type).toBe('drone');
```

### Assertions (`assertions.js`)

```javascript
import { expectDeterministicSequence } from '../__helpers__/assertions.js';

expectDeterministicSequence([0.1, 0.2], [0.1, 0.2]);
```

### Setup (`setup.js`)

```javascript
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';

beforeEach(() => setupGlobalMocks());
afterEach(() => cleanupGlobalState());
```

### Asteroid helpers (`asteroid-helpers.js`)

```javascript
import { createEnemySystemHarness } from '../__helpers__/asteroid-helpers.js';

const { enemySystem, simulateWave } = createEnemySystemHarness();
const result = simulateWave({ wave: 12 });
expect(result.spawnedEnemies).toHaveLength(8);
```

## 5. Boas Práticas

### ❌ Anti-padrão: mocks inline

```javascript
// Evite criar mocks manualmente em cada teste
const eventBus = { emit: vi.fn(), on: vi.fn() };
```

### ✅ Padrão recomendado

```javascript
import { createEventBusMock } from '../__helpers__/mocks.js';
const eventBus = createEventBusMock();
```

### Checklist rápido

1. Use helpers centralizados (`mocks`, `stubs`, `fixtures`).
2. Prefira fixtures a objetos literais.
3. Confie no `global-setup.js` para `vi.restoreAllMocks()` – não duplique `afterEach`.
4. Para determinismo, utilize `createDeterministicRandom()`.
5. Use `beforeAll` para setups imutáveis e `it.concurrent` quando apropriado.
6. Respeite o espelhamento: novo módulo → novo teste no diretório equivalente.
7. Consulte `tests/OPTIMIZATION_GUIDE.md` para otimizações adicionais.

## 6. Estrutura de Arquivo de Teste

Modelo base para novos testes unitários seguindo a estrutura atual:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupGlobalMocks, cleanupGlobalState } from '../__helpers__/setup.js';
import { createEventBusMock } from '../__helpers__/mocks.js';
import { MySystem } from '../../src/modules/MySystem.js';

describe('MySystem', () => {
  beforeEach(() => {
    setupGlobalMocks();
  });

  afterEach(() => {
    cleanupGlobalState();
  });

  it('executa comportamento determinístico', () => {
    const eventBus = createEventBusMock();
    const system = new MySystem({ eventBus });
    system.update(1 / 60);
    expect(system.state).toMatchObject({ ready: true });
  });
});
```

## 7. Checklist para Novos Testes

- [ ] Arquivo criado no diretório espelhado (`tests/<domínio>/`).
- [ ] Imports relativos curtos (`../../src/...`).
- [ ] Helpers/fixtures reutilizados em vez de mocks inline.
- [ ] `setupGlobalMocks` / `cleanupGlobalState` utilizados quando necessário.
- [ ] Casos determinísticos usam `createDeterministicRandom()`.
- [ ] Nome do arquivo segue o padrão `<Nome>.test.js`.
- [ ] Comando `npm run test:<categoria>` executa o arquivo recém-criado.

## 8. Resultados da Reorganização

- **45 arquivos de teste** ativos no inventário atual.
- **Cobertura por domínio** em `core`, `modules`, `services`, `utils`, `integration`, `balance`, `physics` e `visual`.
- **Helpers centralizados** em `tests/__helpers__/`.
- **Diretório `tests/unit/`** presente, porém vazio no estado atual.
- **Duplicação de código** reduzida graças aos helpers centralizados.
- **Cobertura de regressões determinísticas** expandida para áudio, menu, render e screen shake.

## 9. Referências

- `tests/OPTIMIZATION_GUIDE.md`
- `agents.md` §5.1 – Estrutura de Testes
- `vite.config.js`
- `package.json` (scripts de teste)
