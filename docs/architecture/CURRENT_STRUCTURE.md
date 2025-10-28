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
- Histórico legado: utilize o histórico do Git para acessar snapshots anteriores (a pasta `/src/legacy` foi removida durante a limpeza de 2025).
- `src/app.js`: orquestra bootstrap e game loop.
- `/docs`: documentação, planos e checklists.

## 3. Hubs Críticos (segundo DEPENDENCY_GRAPH.md)
- `src/core/GameConstants.js` — agregador leve com 27 dependentes diretos (re-exporta constantes de `src/data/constants/` e `src/data/enemies/`).
- `src/core/RandomService.js` — 23 dependentes diretos.
- `src/bootstrap/bootstrapServices.js` — 1 dependente direto.
- `src/core/EventBus.js` — utilizado em praticamente todos os sistemas.

### 3.5. Recomendações de Implementação
- **Registro via Manifesto:** Ao adicionar um novo sistema, inclua-o em `createServiceManifest()` com suas dependências explícitas. Observe como `src/bootstrap/serviceManifest.js` registra `EnemySystem` e `WorldSystem`.
- **Comunicação por Eventos:** Use `gameEvents` para fluxo de informações. `EnemySystem` emite eventos como `enemy-spawned` e `enemy-destroyed`, enquanto `WorldSystem` consome eventos globais de reset.
- **Resolução de Dependências:** Prefira injeção de dependências via construtor ou `resolveService()` fornecido pelo manifesto, mantendo `gameServices` apenas como fallback através do `ServiceLocatorAdapter`. Verifique `src/app.js` para ver como os serviços são instanciados.
- **Randomização Determinística:** Utilize `RandomService` seedado pelo manifesto para gerar comportamentos reprodutíveis. Veja como `EnemySystem` consome o serviço para decisões de spawn controladas.
- **Reuso de Recursos:** Reforce o uso de pools de entidades e objetos de apoio configurados no manifesto (veja `GamePools` em `src/bootstrap/serviceManifest.js`) e reutilizados por sistemas como o `EnemySystem`.

### 3.6 Organização de Constantes

As constantes do jogo foram organizadas por domínio funcional para facilitar manutenção e evolução:

**`src/data/constants/physics.js`**
- Física da nave (aceleração, velocidade, damping, massa)
- Velocidades de asteroides por tamanho
- Mecânica de rachaduras (thresholds, graph rules)

**`src/data/constants/gameplay.js`**
- Balas e colisão (velocidade, bounce)
- Magnetismo (raios, forças, orbs)
- Sistema de XP orbs (valores, fusão, clustering)
- Sistema de escudo (hits, cooldown, shockwave)
- Sistema de combate (cooldown, targeting, aiming upgrades)
- Sistema de waves (progressão, boss intervals, feature flags)

**`src/data/constants/visual.js`**
- Tipos de inimigos (drone, mine, hunter) com stats completos
- Recompensas de inimigos (orbs, XP, health hearts)
- Paletas de cores de efeitos (body, highlights, glows, explosions)
- Presets de renderização (hull, fins, turrets, shading)
- Configuração de boss (stats, ataques, fases)
- Física de boss (knockback, damage, shakes)
- Presets de efeitos de boss (entrance, phase change, defeat)

**`src/data/enemies/asteroid-configs.js`**
- Perfis de rachaduras (default, denseCore, volatile, parasite, crystal)
- Lookup de camadas de rachaduras
- Regras de fragmentação por perfil
- Sistema de valores de orbs
- Variantes de asteroides (common, iron, denseCore, gold, volatile, parasite, crystal)
- Chances de spawn de variantes por tamanho e wave

**`src/core/GameConstants.js`** (agregador)
- Mantém constantes core (dimensões, progressão, audio)
- Re-exporta todas as constantes dos arquivos focados
- Garante compatibilidade retroativa com imports existentes

**Benefícios:**
- Arquivos menores e mais focados (GameConstants reduzido de 1.771 para ~350 linhas)
- Separação clara de responsabilidades por domínio
- Facilita localização de constantes relacionadas
- Prepara terreno para sistemas data-driven (REFACTOR-003+)
- Mantém compatibilidade total com código existente via re-exports


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
**Nota:** As configurações de asteroides agora residem em `src/data/enemies/asteroid-configs.js`. Para adicionar novos inimigos, consulte este arquivo como referência de estrutura de dados.
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
- `src/core/GameConstants.js` (agora re-exportador enxuto; dados residem em `src/data/constants/` e `src/data/enemies/`)
  - Mantém dimensões, progressão e presets de áudio; re-exporta dados especializados de `src/data/constants/` e `src/data/enemies/`.
  - Detalhes de fissuras, variantes e presets vivem nos arquivos especializados listados acima.
- `src/data/upgrades.js` (939 linhas)
  - `UPGRADE_CATEGORIES` e `UPGRADE_LIBRARY` com múltiplos upgrades (50–150 linhas cada).
- `src/data/shipModels.js`, `src/data/settingsSchema.js`: dados auxiliares.

## 8. Pontos de Complexidade
- `EnemySystem.js`, `WaveManager.js`, `Asteroid.js`, `PhysicsSystem.js`, `src/data/constants/`, `src/data/enemies/`, `upgrades.js`.
- Arquivos longos com múltiplas responsabilidades e lógica procedural complexa.

## 9. Inconsistências Arquiteturais
- Asteroid utiliza componentes; demais inimigos não.
- Componentes existentes são específicos, não reutilizáveis.
- Dados historicamente misturados com lógica (migração em andamento para `src/data/constants/` e `src/data/enemies/`).
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
- Arquivos destacados ao longo deste documento (`EnemySystem.js`, `WaveManager.js`, `Asteroid.js`, `src/data/constants/`, `src/data/enemies/`, `upgrades.js`).

## 12. Resultados da Refatoração

### 12.5. REFACTOR-011: Remoção de Código de Fallback (Phase 1 Cleanup)

**Objetivo**: Remover implementações de fallback redundantes dos métodos delegados no `EnemySystem.js`, confiando totalmente nos sub-sistemas especializados.

**Mudanças Realizadas**:
- **EnemySystem.js**: 31 métodos delegados transformados de fallback (20-150 linhas) para error-throwing (5-8 linhas)
  - SpawnSystem: 14 métodos, ~681 linhas removidas
  - DamageSystem: 8 métodos, ~460 linhas removidas
  - UpdateSystem: 8 métodos, ~639 linhas removidas
  - RenderSystem: 1 método, ~22 linhas removidas
  - **Total removido**: ~1.802 linhas de código de fallback
  - **Total mantido**: ~155 linhas de delegação (31 métodos × 5 linhas)
  - **Redução líquida**: ~1.647 linhas (-92% nos métodos delegados)

**Padrão de Transformação**:
```javascript
// ANTES (exemplo com 50 linhas de fallback)
methodName(args) {
  if (this.subSystem) {
    return this.subSystem.methodName(args);
  }
  // 50 linhas de lógica de fallback
}

// DEPOIS (5 linhas com error-throwing)
methodName(args) {
  if (!this.subSystem) {
    throw new Error('[EnemySystem] SubSystem not initialized');
  }
  return this.subSystem.methodName(args);
}
```

**Impacto no Tamanho do Arquivo**:
- **Antes**: ~5.089 linhas
- **Depois**: ~3.442 linhas
- **Redução**: -1.647 linhas (-32%)

**Benefícios**:
- ✅ Elimina duplicação de lógica entre facade e sub-sistemas
- ✅ Fail-fast com mensagens de erro claras
- ✅ Reduz superfície de manutenção (uma implementação por método)
- ✅ Previne divergência entre implementações de fallback e sub-sistemas
- ✅ Melhora legibilidade do `EnemySystem.js` (foco em orquestração, não implementação)

**Riscos Mitigados**:
- Sub-sistemas são inicializados no constructor com try-catch
- Falhas de inicialização são logadas mas não travam o bootstrap
- Erros em runtime identificam claramente qual sub-sistema falhou
- Padrão consistente com arquitetura de sub-sistemas estabelecida em REFACTOR-004 a REFACTOR-007

### 12.6. REFACTOR-012: Remoção de Lógica Inline dos Tipos de Inimigos (Phase 2 Cleanup)

**Objetivo**: Remover lógica inline de movimento, arma e renderização dos tipos de inimigos, simplificando `onUpdate()` e `onDraw()` para delegação pura aos componentes.

**Mudanças Realizadas**:

1. **Drone.js**: 575 → ~196 linhas (-66%, -379 linhas)
   - Removido: `updateDrift()`, `applyThrusters()`, `updateRotationFromVelocity()` (movimento inline)
   - Removido: `computeNextFireInterval()`, `handleWeaponCycle()`, `fireAtPlayer()`, `extractPlayerVelocity()`, `emitEnemyFired()` (arma inline)
   - Removido: Corpo completo de `onDraw()` com renderização de triângulo, fins, exaustão (renderização inline)
   - Simplificado: `onUpdate()` para 8 linhas de delegação pura
   - Simplificado: `onDraw()` para 5 linhas de delegação pura

2. **Hunter.js**: 653 → ~309 linhas (-53%, -344 linhas)
   - Removido: `applyIdleDamping()`, `updateOrbitVelocity()`, `updateRotationTowardsVelocity()` (movimento inline)
   - Removido: `updateBurstCycle()`, `startBurst()`, `computeAimSolution()`, `fireAtPlayer()`, `extractPlayerVelocity()`, `emitEnemyFired()` (arma inline)
   - Removido: Corpo completo de `onDraw()` com renderização de diamante, torreta, gradiente (renderização inline)
   - Removido: `ensureHullGradient()` (helper de cache de gradiente)
   - Removido: `clamp()`, `normalize()`, `normalizeAngle()` (utilitários duplicados)
   - Simplificado: `onUpdate()` para 10 linhas de delegação pura
   - Simplificado: `onDraw()` para 5 linhas de delegação pura

3. **Mine.js**: 421 → ~299 linhas (-29%, -122 linhas)
   - Removido: Corpo completo de `onDraw()` com renderização de esfera, pulso, halo (renderização inline)
   - Removido: `ensureBodyGradient()` (helper de cache de gradiente)
   - Mantido: `onUpdate()` completo (delegação de componentes + máquina de estados de proximidade)
   - Mantido: `updateTimers()`, `triggerDetonation()` (lógica específica de mina)
   - Simplificado: `onDraw()` para 5 linhas de delegação pura

4. **BossEnemy.js**: 1.318 → ~1.215 linhas (-8%, -103 linhas)
   - Removido: `seekPlayer()`, `applyDamping()` (movimento inline)
   - Removido: Corpo completo de `onDraw()` com renderização de aura, hull, invulnerabilidade (renderização inline)
   - Mantido: `onUpdate()` completo (delegação de componentes + lógica de coordenação)
   - Mantido: Todos os métodos de gerenciamento de fases (`handlePhaseIntro()`, `handlePhaseAssault()`, `handlePhaseFinale()`, `evaluatePhaseTransition()`, `advancePhase()`)
   - Mantido: Todos os métodos de spawn de minions (`updateMinionSpawns()`, `spawnMinion()`, `pickMinionType()`)
   - Mantido: Todos os métodos de invulnerabilidade (`updateInvulnerability()`, `emitInvulnerabilityState()`)
   - Mantido: Todos os métodos de ataque de carga (`updateChargeState()`, `beginCharge()`, `triggerChargeBurst()`)
   - Mantido: Métodos de arma inline (`fireSpreadPattern()`, `fireVolleyShot()`, `emitBossProjectile()`, `updateVolleyCycle()`, `startVolley()`) - acoplados à lógica de fases, refatoração futura
   - Mantido: `buildRenderPayload()` (usado pela lógica de coordenação)
   - Simplificado: `onDraw()` para 5 linhas de delegação pura

**Redução Total de Código**:
- **Linhas removidas**: ~948 linhas
- **Redução média**: -39% nos arquivos de tipos de inimigos

**Padrão de Transformação**:

**onUpdate() - Antes** (30-40 linhas com fallback inline):
```javascript
onUpdate(deltaTime) {
  if (this.useComponents && this.components?.size > 0) {
    // Component delegation
    return;
  }
  // 20-30 linhas de lógica inline de movimento e arma
}
```

**onUpdate() - Depois** (5-10 linhas, delegação pura):
```javascript
onUpdate(deltaTime) {
  if (!this.useComponents || !this.components?.size) {
    console.error('[EnemyType] Components not initialized.');
    return;
  }
  const context = this.buildComponentContext(deltaTime);
  this.runComponentUpdate(context);
}
```

**onDraw() - Antes** (120-170 linhas com renderização inline):
```javascript
onDraw(ctx) {
  if (this.useComponents && this.components?.size > 0) {
    return;
  }
  // 120-170 linhas de renderização inline com canvas API
}
```

**onDraw() - Depois** (5 linhas, delegação pura):
```javascript
onDraw(ctx) {
  if (!this.useComponents || !this.components?.size) {
    console.error('[EnemyType] Components not initialized.');
    return;
  }
  // RenderComponent handles drawing via BaseEnemy.draw()
}
```

**Benefícios**:
- ✅ Elimina duplicação entre tipos de inimigos e componentes
- ✅ Fonte única de verdade para movimento, arma e renderização (componentes)
- ✅ Simplifica tipos de inimigos para coordenadores puros
- ✅ Preserva lógica específica de tipo (fases do boss, proximidade da mina)
- ✅ Melhora manutenibilidade (correções em um lugar)
- ✅ Facilita adição de novos tipos (config + componentes)
- ✅ Reduz superfície de teste (testar componentes, não tipos)

**Lógica Específica de Tipo Preservada**:
- **Drone**: Nenhuma (100% delegação)
- **Hunter**: Nenhuma (100% delegação)
- **Mine**: Máquina de estados de proximidade (armar, detectar, detonar)
- **Boss**: Gerenciamento de fases, spawn de minions, invulnerabilidade, ataque de carga

**Próximos Passos**:
- **Phase 3**: Criar utilitários de combate compartilhados (`src/utils/combatHelpers.js`)
- **Phase 4**: Consolidar estratégias de renderização (4 estratégias → 1 com parâmetro `shape`)
- **Boss Weapon Refactor**: Desacoplar métodos de arma do boss da lógica de fases (tarefa futura)

#### 12.6.1. HOTFIX: Restauração do handleWaveManagerWaveComplete (Phase 1 Bug Fix)

**Problema Identificado**: Durante a limpeza da Phase 1 (REFACTOR-011), o método `handleWaveManagerWaveComplete()` foi completamente removido ao invés de ser transformado em delegação. O event listener na linha 349 de `EnemySystem.js` continuou chamando o método inexistente, causando crash na conclusão de waves.

**Impacto**:
- 🔴 **Severidade**: Crítica - quebra o loop principal do jogo
- ❌ Waves não completam corretamente
- ❌ Recompensas de XP não são concedidas
- ❌ Progressão do jogador bloqueada
- ❌ Console spam com `TypeError: this.handleWaveManagerWaveComplete is not a function`

**Correção Aplicada**:

1. **EnemySystem.js** (+8 linhas):
   - Adicionado método de delegação `handleWaveManagerWaveComplete(data)` após linha 2927
   - Segue padrão da Phase 1: error-throwing se sub-sistema ausente, então delega para `updateSystem`
   - Localizado próximo a outros métodos de gerenciamento de wave (`completeCurrentWave`, `startNextWave`, `grantWaveRewards`)

2. **EnemyUpdateSystem.js** (+35 linhas):
   - Implementado `handleWaveManagerWaveComplete(data)` após linha 765
   - Delega recompensas para `facade.grantWaveRewards()` (método existente)
   - Atualiza estado da wave (`isActive = false`, `breakTimer = WAVE_BREAK_TIME`)
   - Emite atualização de estado via `emitWaveStateUpdate(true)`
   - Registra conclusão no debug log

**Fluxo Corrigido**:
```
WaveManager.completeWave()
  → emit('wave-complete', data)
    → EnemySystem event listener (linha 349)
      → this.handleWaveManagerWaveComplete(data)  ✅ AGORA EXISTE
        → updateSystem.handleWaveManagerWaveComplete(data)
          → facade.grantWaveRewards()  → XP orbs spawned
          → wave.isActive = false
          → emitWaveStateUpdate()
```

**Lição Aprendida**:
- ✅ Antes de remover um método, buscar TODAS as referências (incluindo event listeners)
- ✅ Event listeners são call sites indiretos que grep pode perder
- ✅ Padrão de delegação requer AMBOS: método na facade E implementação no sub-sistema
- ✅ Testar fluxo de eventos end-to-end após refatorações agressivas

**Validação**:
- ✅ Wave completion funciona corretamente
- ✅ XP orbs são concedidos em círculo ao redor do jogador
- ✅ Wave state transiciona para break period
- ✅ UI atualiza corretamente
- ✅ Sem erros no console
- ✅ Debug log mostra `[WAVE] Wave complete handled by UpdateSystem`

### 12.7. REFACTOR-013: Extração de Utilitários de Combate (Phase 3 Cleanup)

**Objetivo**: Extrair funções auxiliares de combate do `WeaponComponent.js` para um módulo compartilhado, criando uma biblioteca reutilizável de utilitários de combate.

**Mudanças Realizadas**:

1. **Novo Arquivo**: `src/utils/combatHelpers.js` (~55 linhas)
   - `computeLeadSolution()`: Cálculo de ponto de interceptação preditivo (49 linhas: 4 JSDoc + 45 código)
   - `resolvePlayerVelocity()`: Extração de velocidade do jogador com fallbacks (22 linhas: 3 JSDoc + 19 código)
   - `applySpread()`: Aplicação de dispersão angular aleatória (8 linhas: 2 JSDoc + 6 código)
   - Exportações nomeadas para tree-shaking
   - JSDoc conciso mas completo

2. **WeaponComponent.js**: 481 → 411 linhas (-15%, -70 linhas)
   - Removido: `computeLeadSolution()` (45 linhas)
   - Removido: `resolvePlayerVelocity()` (19 linhas)
   - Removido: `applySpread()` (6 linhas)
   - Adicionado: Import de `combatHelpers.js` (1 linha)
   - Mantido: `getGameEvents()` (específico de event bus)
   - Todos os padrões de arma (`single`, `burst`, `spread`, `volley`, `proximity`) continuam funcionando identicamente

3. **MovementComponent.js**: Sem mudanças de código
   - Adicionado: Comentário documentando extração futura de helpers matemáticos (Phase 9)
   - Helpers mantidos: `clamp()`, `length()`, `normalize()`, `lerp()`
   - Rationale: Usados internamente por estratégias de movimento, serão extraídos em Phase 9

**Redução Total de Código**:
- **Linhas removidas**: 70 linhas de `WeaponComponent.js`
- **Linhas adicionadas**: 55 linhas em `combatHelpers.js`
- **Balanço líquido**: **-15 linhas** ✅
- **Benefício**: Fonte única de verdade, testável isoladamente, código mais limpo

**Princípios Aplicados**:
- ✅ **YAGNI (You Ain't Gonna Need It)**: Extraído APENAS funções usadas agora
- ✅ **JSDoc Conciso**: Útil mas não verboso (10 linhas total, não 45)
- ✅ **Redução Líquida**: -15 linhas (não +20 como no plano original)
- ✅ **Zero Especulação**: Sem código para "preparar Phase 9"

**Padrão de Transformação**:

**Antes** (inline em WeaponComponent.js):
```javascript
const computeLeadSolution = ({ origin, target, targetVelocity, projectileSpeed }) => {
  // 45 linhas de lógica de interceptação
};

const resolvePlayerVelocity = (player) => {
  // 19 linhas de extração de velocidade
};

const applySpread = (angle, spread, random) => {
  // 6 linhas de aplicação de dispersão
};
```

**Depois** (importado de combatHelpers.js):
```javascript
import {
  computeLeadSolution,
  resolvePlayerVelocity,
  applySpread,
} from '../../../utils/combatHelpers.js';
```

**Benefícios**:
- ✅ Fonte única de verdade para matemática de combate
- ✅ Funções puras, fáceis de testar isoladamente
- ✅ Reduz tamanho do `WeaponComponent.js` em 15%
- ✅ Sem mudanças de comportamento - refatoração pura
- ✅ Exportações nomeadas permitem tree-shaking
- ✅ JSDoc conciso facilita reutilização sem verbosidade
- ✅ **Redução líquida de código** (alinhado com objetivo de simplificação)

**Próximos Passos**:
- **Phase 4**: Consolidar estratégias de renderização (4 → 1 com parâmetro `shape`)
- **Phase 9**: Extrair math/vector helpers de `MovementComponent.js` para `mathHelpers.js` e `vectorHelpers.js`
- **Futuro**: Considerar adicionar `tests/utils/combatHelpers.test.js` para testes unitários

**Arquivos Não Modificados**:
- `Drone.js`: Já limpo em Phase 2, sem helpers duplicados
- `Hunter.js`: Já limpo em Phase 2, sem helpers duplicados
- `Mine.js`: Não usa helpers de combate
- `BossEnemy.js`: Não usa helpers de combate (tem lógica inline de arma, será refatorado separadamente)

### 12.8. REFACTOR-014: Consolidação de Estratégias de Renderização (Phase 4 Cleanup)

**Objetivo**: Consolidar quatro estratégias procedurais de renderização em uma única estratégia parametrizada por `shape`, eliminando duplicações e facilitando a adição de novas formas.

**Mudanças Realizadas**:

1. **RenderComponent.js**: 279 → ~231 linhas (-17%, -48 linhas)
   - Removido: Estratégias `procedural-triangle`, `procedural-diamond`, `procedural-sphere`, `procedural-boss` (-198 linhas)
   - Adicionado: Objeto `shapeRenderers` com renderers específicos para `triangle`, `diamond`, `sphere`, `boss` (~120 linhas)
   - Adicionado: Estratégia unificada `procedural` que resolve paleta/presets, gerencia estado do canvas e delega para o renderer apropriado (~30 linhas)
   - **Redução líquida**: -48 linhas

2. **Configs de inimigos**: 4 arquivos atualizados (1 linha cada)
   - `src/data/enemies/drone.js`: `strategy: 'procedural'`, `shape: 'triangle'`
   - `src/data/enemies/hunter.js`: `strategy: 'procedural'`, `shape: 'diamond'`
   - `src/data/enemies/mine.js`: `strategy: 'procedural'`, `shape: 'sphere'`
   - `src/data/enemies/boss.js`: `strategy: 'procedural'`, `shape: 'boss'`

**Padrão de Transformação**:

**Antes** (4 estratégias quase idênticas, ~198 linhas duplicadas):
```javascript
'procedural-triangle': ({ enemy, ctx, colors, presets }) => {
  // resolve palette/presets
  // salvar estado / translate / rotate
  // desenhar geometria da forma
  // restaurar estado
}
// +3 variantes repetindo a mesma lógica-base
```

**Depois** (1 estratégia comum + renderers específicos, ~150 linhas totais):
```javascript
'procedural': ({ enemy, ctx, colors, presets, config }) => {
  // resolve palette/presets uma vez
  // configura estado do canvas (save/translate/rotate)
  // seleciona renderer via config.shape
  // delega geometria para shapeRenderers[shape]
}

const shapeRenderers = {
  triangle: ({ enemy, ctx, colors, presets, size }) => { /* geometria do drone */ },
  diamond: ({ enemy, ctx, colors, presets, size }) => { /* geometria do hunter */ },
  sphere: ({ enemy, ctx, colors, presets, size }) => { /* geometria da mine */ },
  boss: ({ enemy, ctx, colors, presets, size }) => { /* geometria do boss */ },
};
```

**Benefícios**:
- ✅ Fonte única de verdade para lógica compartilhada de renderização (paleta, presets, estado do canvas)
- ✅ Renderers focados apenas na geometria de cada forma
- ✅ Adição de novas formas requer apenas inserir novo renderer em `shapeRenderers`
- ✅ Seleção dirigida por configuração (`shape`), sem alterações de código para novos inimigos
- ✅ Redução de 70% de código duplicado nas estratégias procedurais
- ✅ Saída visual permanece idêntica (refatoração sem mudança de comportamento)

**Redução Total de Código**:
- **Linhas removidas**: 198 linhas (4 estratégias duplicadas)
- **Linhas adicionadas**: ~150 linhas (estratégia unificada + renderers)
- **Balanço líquido**: **-48 linhas** (-17% em `RenderComponent.js`)
- **Configs atualizados**: 4 arquivos, mudanças triviais de estratégia/shape

**Validação**:
- ✅ Renderização de drone, hunter, mine e boss revisada visualmente (pixel-perfect)
- ✅ `tests/visual/enemy-types-rendering.test.js` continua passando
- ✅ Sem warnings de formas desconhecidas
- ✅ Thrust, turret, pulse e aura preservados

**Próximos Passos**:
- **Phase 5**: Criar `BaseSystem` centralizado para reduzir duplicações adicionais
- **Phase 6**: Simplificar cadeia de resolução de serviços
- **Futuro**: Adicionar novas formas (ex.: hexagon, star) reutilizando o padrão `shapeRenderers`

### 12.9. REFACTOR-015 Ticket 2: Core Systems Refactoring

**Objetivo**: Refatorar 6 sistemas principais para estender `BaseSystem`, eliminando código duplicado e padrões redundantes. Este ticket depende do Ticket 1 (BaseSystem Foundation) estar completo.

**Escopo**: 6 arquivos modificados
**Linhas removidas**: ~645 linhas
**Risco**: 🟡 Médio (modifica sistemas críticos)
**Tempo estimado**: 30-40 minutos
**Dependências**: Ticket 1 (BaseSystem.js deve existir)

**Sistemas Refatorados**:

1. **RenderingSystem** (1,739 → 1,649 linhas, -90)
   - Removido: random management manual, service registration, event listener setup boilerplate
   - Adicionado: `super()` call com random forks (base/starfield/assets), `onReset()` hook
   - Simplificado: constructor agora delega para BaseSystem

2. **XPOrbSystem** (2,052 → 1,942 linhas, -110)
   - Removido: createRandomForks(), getRandomFork(), captureRandomForkSeeds(), reseedRandomForks() methods
   - Mantido: ensureRandom() e captureRandomSignature() (XPOrbSystem-specific)
   - Atualizado: setupEventListeners() usa this.registerEventListener(), reset() chama super.reset()
   - Removido: typeof checks, manual event emission, console.log

3. **EffectsSystem** (3,012 → 2,912 linhas, -100)
   - Removido: getRandomFork() method, typeof checks, gameServices.register()
   - Adicionado: reset() method que chama super.reset() e limpa arrays (particles, shockwaves, hitMarkers, damageIndicators, bossTransitionEffects)
   - Atualizado: setupEventListeners() usa this.registerEventListener()
   - Random forks: base, particles, thrusters, colors, muzzleFlash, hits, explosions, volatility, screenShake, boss

4. **MenuBackgroundSystem** (1,726 → 1,631 linhas, -95)
   - Removido: getRandomFork(), captureRandomForkSeeds(), storeRandomForkSeed(), reseedRandomForks() methods
   - Mantido: ensureThreeUuidRandom() e applyDeterministicThreeUuidGenerator() (Three.js-specific)
   - Atualizado: reset() chama super.reset(), registerEventHooks() usa this.registerEventListener()
   - Adicionado: destroy() override para cleanup de window.removeEventListener('resize')
   - Random forks: base, starfield, assets, belt, asteroids, fragments, materials, threeUuid

5. **PhysicsSystem** (2,120 → 2,050 linhas, -70)
   - Removido: dependency normalization, typeof checks, gameServices.register()
   - Atualizado: setupEventListeners() usa this.registerEventListener()
   - Adicionado: super.reset() e super.destroy() calls
   - **Nota**: Não usa random management (enableRandomManagement: false)

6. **AudioSystem** (3,119 → 3,039 linhas, -80)
   - Removido: dependency normalization, typeof checks, gameServices.register()
   - Atualizado: setupEventListeners() usa this.registerEventListener() (~20 calls)
   - Adicionado: super.reset() call no início de reset()
   - **Mantido**: Custom random scope management (~239 lines) - AudioSystem-specific para AudioPool, AudioCache, AudioBatcher

**Padrões Eliminados**:

- **Random management**: ~264 lines (exceto AudioSystem que mantém custom scopes)
- **Service caching**: ~108 lines
- **typeof checks**: ~240 lines
- **Constructor boilerplate**: ~90 lines
- **Total**: ~702 lines

**Padrão de Transformação**:

**Antes**:
```javascript
class System {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.randomForks = this.createRandomForks(this.random);

    if (typeof gameServices !== 'undefined') {
      gameServices.register('service-name', this);
    }

    console.log('[System] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;
    gameEvents.on('event', handler);
  }

  createRandomForks() { /* ... */ }
  getRandomFork() { /* ... */ }
  reseedRandomForks() { /* ... */ }
  reset() {
    this.reseedRandomForks();
    // reset logic
  }
}
```

**Depois**:
```javascript
class System extends BaseSystem {
  constructor(dependencies = {}) {
    super({
      enableRandomManagement: true,
      systemName: 'System',
      serviceName: 'service-name',
      randomForkLabels: { base: 'system.base', /* ... */ }
    });

    this.dependencies = { ...dependencies };
    // system-specific initialization
  }

  setupEventListeners() {
    this.registerEventListener('event', handler);
  }

  reset() {
    super.reset();
    // system-specific reset logic
  }
}
```

**Benefícios**:

- ✅ **Event listener cleanup**: BaseSystem rastreia e limpa listeners automaticamente em destroy()
- ✅ **Lifecycle padronizado**: reset(), destroy(), service registration consistentes
- ✅ **Código mais limpo**: ~645 lines removed, constructor simplificado, menos boilerplate
- ✅ **Random management centralizado**: forks gerenciados por BaseSystem (exceto custom scopes)
- ✅ **Menos typeof checks**: BaseSystem assume gameEvents disponível
- ✅ **Manutenibilidade**: Mudanças em lifecycle afetam todos os sistemas via BaseSystem

**Casos Especiais**:

- **AudioSystem**: Mantém custom random scopes para AudioPool, AudioCache, AudioBatcher (~239 lines)
- **PhysicsSystem**: Não usa random management (enableRandomManagement: false)
- **MenuBackgroundSystem**: Mantém Three.js UUID random management (~240 lines)

**Validação**:

```bash
npm run dev
```

1. Jogar 3 waves completas
2. Verificar rendering funcionando (starfield, nave, inimigos, efeitos)
3. Verificar efeitos visuais (explosões, particles, muzzle flash, hit markers)
4. Verificar física (colisões, spatial hash, boss physics)
5. Verificar áudio (weapon fire, explosions, UI sounds, music layers)
6. Verificar XP orbs (magnetism, fusion, collection)
7. Verificar menu background (animated starfield, rotating asteroids)
8. Verificar console logs: BaseSystem deve logar inicialização de cada sistema

### 12.10. REFACTOR-015 Ticket 3: Specialized Systems Refactoring

**Objetivo**: Refatorar 4 sistemas especializados (CombatSystem, PlayerSystem, WorldSystem, EnemySystem) para estender `BaseSystem`, lidando com casos especiais e padrões únicos. Este ticket depende do Ticket 1 (BaseSystem Foundation) estar completo.

**Escopo**: 4 arquivos modificados
**Linhas removidas**: ~380 linhas (estimado baseado nos padrões eliminados)
**Risco**: 🟡 Médio (sistemas com padrões únicos)
**Tempo estimado**: 25-35 minutos
**Dependências**: Ticket 1 (BaseSystem.js deve existir)

**Sistemas Refatorados**:

1. **CombatSystem** (2,891 → ~2,801 linhas, -90)
   - Removido: resolveCachedServices() method, typeof checks, gameServices.register(), console.log
   - Atualizado: setupEventListeners() usa this.registerEventListener() (4 listeners)
   - Adicionado: super.reset() no início de reset()
   - **Nota**: CombatSystem não usa random management, apenas service caching
   - Service caching: player, enemies, physics services

2. **PlayerSystem** (1,225 → ~1,135 linhas, -90)
   - Removido: typeof checks (~12 locations), gameServices.register(), console.log
   - Atualizado: setupEventListeners() usa this.registerEventListener() (~15 upgrade listeners)
   - Adicionado: super.reset() no início de reset()
   - Atualizado: normalizeConfig() transformado em static method
   - **Mantido**: Custom lifecycle (pause/resume), shield state management, hull metrics

3. **WorldSystem** (210 → ~200 linhas, -10)
   - Removido: typeof checks, gameServices.register(), console.log
   - Atualizado: setupEventListeners() usa this.registerEventListener() (3 listeners)
   - Adicionado: super.reset() no início de reset()
   - **Nota**: Sistema mais simples, delega maior parte da lógica para PhysicsSystem
   - Service caching: player, enemies, physics, progression services

4. **EnemySystem** (4,234 → ~4,124 linhas, -110)
   - Removido: typeof checks (~15 locations), gameServices.register(), console.log
   - Atualizado: setupEventListeners() usa this.registerEventListener() (~13 listeners)
   - Adicionado: super.reset() no início de reset()
   - **Complexidades especiais**: Maior sistema do projeto, ~30 event listeners totais (incluindo condicionais para waveManager)
   - **Mantido**: Factory integration, WaveManager integration, RewardManager integration, custom random scope management (~239 lines)
   - Service caching: player, world, progression, xpOrbs, physics, combat, healthHearts, random, effects, audio, ui

### 12.11. REFACTOR-015 Ticket 4: Remaining Systems Refactoring

**Objetivo**: Finalizar a migração dos sistemas principais para `BaseSystem` refatorando os dois módulos restantes com padrões legados (`UISystem` e `ProgressionSystem`). Este ticket conclui a adoção do lifecycle padronizado iniciado no Ticket 1.

> **Nota**: Não existe um `UpgradeSystem` independente no código atual — toda a lógica de upgrades vive no `ProgressionSystem`. Por isso, o escopo desta etapa foi ajustado para focar nesse módulo em conjunto com o `UISystem`.

**Escopo**: 2 arquivos modificados
**Linhas removidas**: ~200 linhas
**Risco**: 🟡 Médio (UI complexa e árvore de upgrades)
**Tempo estimado**: 20-30 minutos
**Dependências**: Ticket 1 (BaseSystem.js deve existir)

**Sistemas Refatorados**:

1. **UISystem** (2,456 → ~2,366 linhas, -90)
   - Removido: constructor boilerplate, `gameServices.register()`, logs de inicialização
   - Atualizado: `setupEventListeners()` usa `this.registerEventListener()` para bosses, wave, combo, settings e level-up
   - Adicionado: `initialize()` para configurar DOM refs, layout HUD e preferências antes do registro de listeners
   - Eliminado: verificações `typeof gameEvents` em controles de pausa e em emissão de eventos (`screen-changed`, captura de bindings)
   - **Complexidades especiais**: gerenciamento de DOM, múltiplos overlays, captura de input e atualizações de HUD em tempo real

2. **ProgressionSystem** (1,445 → ~1,355 linhas, -90)
   - Substituído caching manual por `resolveCachedServices()` (`xp-orbs`, `player`, `ui`, `effects`)
   - Removido: fallback `RandomService`, `gameServices.register()`, console logs de lifecycle
   - Atualizado: listeners (`xp-orb-collected`, `enemy-destroyed`, resets) com `registerEventListener()` e random forks (`selection`, `rewards`)
   - Adicionado: `super.reset()` e `super.destroy()` garantindo reseed automático e cleanup de listeners
   - Eliminado: verificações `typeof gameEvents` para emitir `combo`, `experience`, `upgrade-applied`, `progression-restored`
   - **Complexidades especiais**: rolagem de upgrades, combo multipliers, progressão de níveis e reconstrução de opções pendentes

**Padrões Eliminados**:

- Gerenciamento manual de random forks e seeds
- Cache de serviços customizado (`this.services.*`)
- Condicionais `typeof gameEvents` antes de `emit`/`on`
- Boilerplate de constructor e registro manual no `gameServices`

**Benefícios**:

- Lifecycle unificado (`initialize`, `reset`, `destroy`) com limpeza automática de listeners
- Serviços resolvidos via `BaseSystem`, reduzindo duplicação e possíveis inconsistências
- Emissão de eventos simplificada e rastreável
- Todos os 12 sistemas principais agora estendem `BaseSystem`, totalizando ~1.239 linhas removidas (Tickets 2 + 3 + 4)

**Validação**:

```bash
npm run dev
```

1. Jogar 5 waves completas monitorando HUD (vida, escudo, combo, wave timer)
2. Confirmar abertura/fechamento de menus (pause, settings, credits) e captura de bindings
3. Subir de nível e verificar rolagem/aplicação de upgrades (eventos `upgrade-options-ready`, `upgrade-applied`)
4. Observar resets (`progression-reset`, `player-reset`) garantindo combo/hud zerados e listeners re-registrados
5. Revisar console para logs do `BaseSystem` e ausência de warnings/erros

**Complexidades Especiais**:

- **EnemySystem**: 4,234 linhas, maior sistema, ~30 event listeners (incluindo handlers para boss waves, mines, projectiles, shield explosions)
- **PlayerSystem**: Custom lifecycle com pause/resume, shield activation/break logic, weapon recoil
- **WorldSystem**: Custom reset com wave progression, delegação de collision handling para PhysicsSystem
- **CombatSystem**: Damage calculation, collision handling, targeting system com multi-lock, aiming upgrades

**Padrões Eliminados**:

- **Service caching**: ~72 lines (resolveCachedServices() removido de CombatSystem)
- **typeof checks**: ~120 lines (PlayerSystem: ~12, EnemySystem: ~15, CombatSystem: ~8, WorldSystem: ~1)
- **Constructor boilerplate**: ~60 lines (gameServices.register, console.log, dependency normalization)
- **Event listener setup boilerplate**: ~128 lines (typeof checks + old gameEvents.on() syntax)
- **Total**: ~380 lines

**Padrão de Transformação**:

**Antes**:
```javascript
class CombatSystem {
  constructor(dependencies = {}) {
    this.dependencies = normalizeDependencies(dependencies);
    this.cachedPlayer = resolveService('player', this.dependencies);
    this.cachedEnemies = resolveService('enemies', this.dependencies);

    if (typeof gameServices !== 'undefined') {
      gameServices.register('combat', this);
    }

    this.setupEventListeners();
    console.log('[CombatSystem] Initialized');
  }

  setupEventListeners() {
    if (typeof gameEvents === 'undefined') return;
    gameEvents.on('player-reset', () => {
      this.resolveCachedServices(true);
    });
  }

  resolveCachedServices(force = false) {
    if (force || !this.cachedPlayer) {
      this.cachedPlayer = resolveService('player', this.dependencies);
    }
    // ...
  }

  reset() {
    this.bullets = [];
    this.currentTarget = null;
    this.resolveCachedServices(true);
  }
}
```

**Depois**:
```javascript
class CombatSystem extends BaseSystem {
  constructor(dependencies = {}) {
    super({
      dependencies,
      systemName: 'CombatSystem',
      serviceName: 'combat',
    });

    this.cachedPlayer = resolveService('player', this.dependencies);
    this.cachedEnemies = resolveService('enemies', this.dependencies);

    this.setupEventListeners();
  }

  setupEventListeners() {
    this.registerEventListener('player-reset', () => {
      this.resolveCachedServices(true);
    });
  }

  reset() {
    super.reset();
    this.bullets = [];
    this.currentTarget = null;
    this.resolveCachedServices(true);
  }
}
```

**Benefícios**:

- ✅ **Event listener cleanup**: BaseSystem rastreia e limpa ~30+ listeners automaticamente em destroy()
- ✅ **Lifecycle padronizado**: reset(), destroy(), service registration consistentes entre sistemas especializados
- ✅ **Código mais limpo**: ~380 lines removed, menos typeof checks, menos boilerplate
- ✅ **Integration points preservados**: EnemyFactory continua funcionando, PlayerSystem pause/resume preservado, WorldSystem wave progression intacto
- ✅ **Manutenibilidade**: Mudanças em lifecycle afetam todos os sistemas via BaseSystem

**Casos Especiais Mantidos**:

- **PlayerSystem**: Custom pause()/resume() lifecycle preservado (jogador pode pausar durante gameplay)
- **WorldSystem**: Custom reset() com wave progression e collision delegation
- **EnemySystem**: Factory integration, WaveManager integration, RewardManager integration, complex event handling
- **CombatSystem**: Advanced targeting system (danger scores, dynamic prediction, multi-lock)

**Validação**:

```bash
npm run dev
```

1. Jogar 5 waves completas
2. Verificar combate funcionando (targeting, shooting, damage, bullet collision)
3. Verificar movimento do player (WASD, acceleration, rotation, drift, recoil)
4. Verificar spawning de inimigos (asteroids, drones, hunters, mines, bosses)
5. Verificar colisões (player-asteroid, bullet-asteroid, shield impacts)
6. Verificar progressão de waves (wave start/complete, break timers, difficulty scaling)
7. Verificar integração de factories (EnemyFactory, component systems)
8. Verificar console logs: BaseSystem deve logar inicialização de sistemas especializados
9. Verificar que EnemySystem gerencia ~30 event listeners sem memory leaks
10. Verificar PlayerSystem lifecycle (death, retry, respawn, pause/resume)

**Resultados**:

- ✅ Todos os 6 sistemas refatorados com sucesso
- ✅ ~645 linhas removidas (boilerplate, duplicação)
- ✅ Event listeners rastreados e limpos automaticamente
- ✅ Random management centralizado via BaseSystem
- ✅ Lifecycle consistente através de todos os sistemas
- ✅ Funcionalidade preservada (sem mudança de comportamento)

**Próximos Passos**:

- **Ticket 3**: Refatorar sistemas auxiliares (HealthHeartSystem, HUD, etc.)
- **Ticket 4**: Migrar enemy types para BaseEnemy patterns
- **Phase 6**: Simplificar cadeia de resolução de serviços
