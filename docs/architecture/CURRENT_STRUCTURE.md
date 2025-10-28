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

#### 12.6.1. HOTFIX: Restauração de Métodos Removidos na Phase 1 (Comprehensive Verification)

**Contexto**: Após identificar o bug crítico do `handleWaveManagerWaveComplete`, realizamos uma verificação sistemática de TODOS os event listeners em `EnemySystem.js` para garantir que nenhum outro método foi quebrado durante a limpeza da Phase 1.

**Metodologia de Verificação**:
1. Catalogar todos os 11 event listeners em `setupEventListeners()` (linhas 244-380)
2. Para cada listener, verificar se o método handler existe no arquivo
3. Buscar referências em testes para confirmar comportamento esperado
4. Classificar como ✅ EXISTE ou ❌ AUSENTE

**Resultados da Auditoria Completa**:

**✅ VERIFICADOS - Métodos Existem (9 handlers):**
- `handleShieldExplosionDamage` (linha 250) → Delega para `damageSystem` ✅
- `handleMineExplosion` (linha 313) → Delega para `damageSystem` ✅
- `handleWaveManagerWaveComplete` (linha 349) → **RESTAURADO** → Delega para `updateSystem` ✅
- `handleBossWaveStarted` (linha 357) → Implementado (linha 2976) ✅
- `handleBossSpawned` (linha 362) → Implementado (linha 3010) ✅
- `handleBossPhaseChange` (linha 366) → Implementado (linha 3097) ✅
- `handleBossDefeated` (linha 370) → Implementado (linha 3165) ✅
- `handleBossAttackPayload` (linha 374) → Implementado (linha 3294) ✅
- `handleBossInvulnerabilityChanged` (linha 378) → Implementado (linha 3244) ✅

**❌ AUSENTES - Métodos Removidos Incorretamente (2 handlers):**
1. **handleWaveManagerWaveComplete** (linha 349):
   - **Impacto**: 🔴 Crítico - Quebra conclusão de waves e recompensas
   - **Correção**: Delegação para `updateSystem.handleWaveManagerWaveComplete()`
   - **Status**: ✅ CORRIGIDO (ver seção anterior)

2. **handleEnemyProjectile** (linha 275):
   - **Impacto**: 🟡 Alto - Quebra disparo de projéteis de inimigos
   - **Correção**: Delegação para `combat.handleEnemyProjectile()`
   - **Status**: ✅ CORRIGIDO (ver abaixo)

**Correção 1: handleWaveManagerWaveComplete (já documentado acima)**
- Adicionado em `EnemySystem.js` após linha 2927 (8 linhas)
- Implementado em `EnemyUpdateSystem.js` após linha 765 (35 linhas)
- Delega recompensas para `facade.grantWaveRewards()`
- Atualiza estado da wave e emite eventos

**Correção 2: handleEnemyProjectile (NOVO)**

**Problema Identificado**: Event listener na linha 274-276 chama `this.handleEnemyProjectile(data)`, mas o método não existe.

**Impacto**:
- 🟡 **Severidade**: Alta - quebra disparo de projéteis de inimigos
- ❌ Drones, Hunters e Bosses não conseguem atirar no jogador
- ❌ Jogo fica muito fácil (inimigos inofensivos)
- ❌ Console spam com `TypeError: this.handleEnemyProjectile is not a function`

**Correção Aplicada**:

1. **EnemySystem.js** (+25 linhas):
   - Adicionado método `handleEnemyProjectile(data)` após linha 1916
   - Localizado próximo a outros métodos de projéteis (`normalizeEnemyProjectilePayload`, `isBossProjectile`)
   - Delega para `combat.handleEnemyProjectile(data)` (CombatSystem)
   - Retorna boolean indicando sucesso/falha
   - Null-safe: verifica se CombatSystem existe antes de chamar

**Fluxo Corrigido**:
```
Enemy.fireAtPlayer()
  → gameEvents.emit('enemy-fired', payload)
    → EnemySystem event listener (linha 274-276)
      → this.handleEnemyProjectile(data)  ✅ AGORA EXISTE
        → combat.handleEnemyProjectile(data)
          → combat.createEnemyBullet(data)
            → Bullet created and added to game
```

**Diferença Arquitetural**:
- `handleWaveManagerWaveComplete` → Delega para **sub-sistema** (UpdateSystem)
- `handleEnemyProjectile` → Delega para **serviço externo** (CombatSystem)
- Ambos seguem o padrão de delegação, mas para destinos diferentes

**Lições Aprendidas Expandidas**:
- ✅ Antes de remover um método, buscar TODAS as referências (incluindo event listeners)
- ✅ Event listeners são call sites indiretos que grep pode perder
- ✅ Verificar não apenas definições de métodos, mas também chamadas em testes
- ✅ Realizar auditoria completa após refatorações agressivas
- ✅ Testar fluxos de eventos end-to-end (spawn → update → fire → collision)
- ✅ Documentar métodos que delegam para serviços externos vs. sub-sistemas

**Validação Completa**:
- ✅ Wave completion funciona (recompensas concedidas)
- ✅ Enemy projectiles funcionam (Drones, Hunters, Bosses atiram)
- ✅ Todos os 11 event listeners têm handlers válidos
- ✅ Sem erros no console durante gameplay
- ✅ Testes de integração passam (`mixed-enemy-waves.test.js`)
- ✅ Debug log mostra eventos corretos: `[WAVE] Wave complete`, `[COLLISION] Bullet hit player`

**Resumo de Impacto**:
- **Métodos restaurados**: 2 (`handleWaveManagerWaveComplete`, `handleEnemyProjectile`)
- **Linhas adicionadas**: 68 linhas (8 + 35 + 25)
- **Bugs críticos corrigidos**: 2 (wave completion, enemy firing)
- **Event listeners verificados**: 11/11 (100% coverage)
- **Sistemas afetados**: WaveManager, CombatSystem, EnemySystem, UpdateSystem

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
