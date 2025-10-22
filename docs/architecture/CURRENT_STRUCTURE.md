# Current Structure Overview

## 1. Visão Geral
- Organização atual com mais de 120 arquivos dentro de `src/`.
- Padrões arquiteturais existentes: Injeção de Dependências, EventBus desacoplado, pooling extensivo, componentes reutilizados apenas para Asteroid e serviços determinísticos.
- Referência ao grafo de dependências: consulte `docs/architecture/DEPENDENCY_GRAPH.md` para hubs, ciclos e agrupamentos detectados automaticamente.

## 2. Estrutura de Diretórios
- `/src/core` (18 arquivos): infraestrutura central (`EventBus`, `DIContainer`, `GameConstants`, `RandomService`, pools).
- `/src/bootstrap` (2 arquivos): manifesto de serviços e bootstrap inicial.
- `/src/modules` (15+ arquivos): sistemas de gameplay (`EnemySystem`, `PlayerSystem`, `CombatSystem`, `WorldSystem`, `PhysicsSystem`, `ProgressionSystem`, `AudioSystem`, etc.).
- `/src/modules/enemies`:
  - `base/` com `BaseEnemy.js`, `EnemyFactory.js`, auxiliares.
  - `types/` com implementações específicas (`Asteroid`, `Drone`, `Boss`, `Hunter`, `Mine`, etc.).
  - `managers/` com orquestradores (`WaveManager`, `RewardManager`, `EnemySpawnPatterns`).
  - `components/` focados em Asteroid (`AsteroidMovement`, `AsteroidRenderer`).
- `/src/data` (3 arquivos + `ui/`): `upgrades.js` (939 linhas), `shipModels.js`, `settingsSchema.js`.
- `/src/services` (2 arquivos): `GameSessionService.js`, `CommandQueueService.js`.
- `/src/utils` (3 arquivos): `ScreenShake.js`, `PerformanceMonitor.js`, utilitários de random.
- `/src/legacy`: código original preservado (`app-original.js`).
- `src/app.js`: orquestra bootstrap e game loop.
- `/docs`: documentação, planos e checklists.

## 3. Hubs Críticos (segundo DEPENDENCY_GRAPH.md)
- `src/core/GameConstants.js` — 1.771 linhas, 27 dependentes diretos.
- `src/core/RandomService.js` — 23 dependentes diretos.
- `src/bootstrap/bootstrapServices.js` — 1 dependente direto.
- `src/core/EventBus.js` — utilizado em praticamente todos os sistemas.

## 4. Sistemas Principais
- **EnemySystem.js** (4.593 linhas)
  - Monolítico: spawning, dano, rendering, ondas, bosses, colisões.
  - Gerencia `WaveManager`, `RewardManager`, `EnemyFactory` e integra com `PhysicsSystem`, `PlayerSystem`, `ProgressionSystem`.
- **WaveManager.js** (2.937 linhas)
  - Configura waves, bosses, grupos de suporte e progressão de dificuldade.
  - Agenda spawn e sincroniza com timers globais.
- **Asteroid.js** (1.990 linhas)
  - Lógica procedural extensa (linhas 534–1.146 dedicadas a geração de fissuras/cracks).
  - Fragmentação acoplada, variantes (`volatile`, `parasite`) embutidas.
  - Único inimigo que usa componentes (`AsteroidMovement`, `AsteroidRenderer`).
- **PhysicsSystem.js** (2.104 linhas)
  - Spatial hash, colisões, utilitários para inimigos/projéteis.
- **GameSessionService.js** (2.001 linhas)
  - Lifecycle completo: start, death, retry, menu, snapshots, RNG management.
- **ProgressionSystem.js** (1.427 linhas)
  - XP, combo, level-up, aplicação de upgrades lendo `data/upgrades.js`.

## 5. Padrões de Inimigos
- **BaseEnemy**
  - Template method: `initialize`, `onUpdate`, `onDraw`, `takeDamage`, `onDestroyed`.
  - Suporte a componentes (`this.components`) e tags.
- **Asteroid**
  - Usa componentes específicos (`AsteroidMovement`, `AsteroidRenderer`).
  - Fragmentação e variantes inline, sem reutilização por outros inimigos.
- **Drone/Boss/Hunter/Mine**
  - Implementam lógica inline (`onUpdate`, `onDraw`) sem componentes reutilizáveis.
- **EnemyFactory**
  - Registry pattern para criação e pooling.
  - `factory.create(type, config)` devolve instância configurada, com tags e defaults.

## 6. Fluxo de Bootstrap
- `src/app.js` inicializa `DIContainer`, `ServiceRegistry` e `GameSessionService`.
- `ServiceLocatorAdapter` garante compatibilidade com `gameServices` legados.
- `bootstrapServices()` instancia sistemas declarados em `createServiceManifest()`.
- Game loop: update → render, com sistemas consumindo `RandomService`, `EventBus`, pools.

## 7. Dados e Configurações
- `src/core/GameConstants.js` (1.771 linhas)
  - Mistura dimensões, física, presets de asteroides, inimigos, bosses, waves, áudio.
  - Contém perfis de fissuras, regras de fragmentação, variantes.
- `src/data/upgrades.js` (939 linhas)
  - `UPGRADE_CATEGORIES` e `UPGRADE_LIBRARY` com múltiplos upgrades (50–150 linhas cada).
- `src/data/shipModels.js`, `src/data/settingsSchema.js`: dados auxiliares.

## 8. Pontos de Complexidade
- `EnemySystem.js`, `WaveManager.js`, `Asteroid.js`, `PhysicsSystem.js`, `GameConstants.js`, `upgrades.js`.
- Arquivos longos com múltiplas responsabilidades e lógica procedural complexa.

## 9. Inconsistências Arquiteturais
- Asteroid utiliza componentes; demais inimigos não.
- Componentes existentes são específicos, não reutilizáveis.
- Dados misturados com lógica (especialmente em `GameConstants.js`).
- Falta separação clara entre engine, gameplay e dados.

## 10. Pontos Fortes
- Injeção de dependências via manifesto bem estruturado.
- EventBus desacoplado e robusto.
- Pooling eficiente (`GamePools`, `ObjectPool`).
- `RandomService` determinístico para debugging.
- `GameDebugLogger` com histórico de até 50k entradas.
- Scripts de análise de dependências automatizados.
- `BaseEnemy` e `EnemyFactory` fornecem base extensível para inimigos.

## 11. Referências
- `docs/architecture/DEPENDENCY_GRAPH.md`
- `src/bootstrap/serviceManifest.js`
- `docs/plans/architecture-master-plan.md`
- `agents.md`
- Arquivos destacados ao longo deste documento (`EnemySystem.js`, `WaveManager.js`, `Asteroid.js`, `GameConstants.js`, `upgrades.js`).
