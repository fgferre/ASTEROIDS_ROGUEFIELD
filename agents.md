# agents.md

## Escopo e objetivo

Documento único de referência para agentes e pessoas colaborando neste
repositório. Define limites de atuação, boas práticas de colaboração e o fluxo
para manter a arquitetura modular segura e rastreável.

### **Política de Desenvolvimento para ASTEROIDS_ROGUEFIELD**

#### 1. **Princípios Fundamentais**

- **Escalabilidade por Design:** Novas armas, inimigos e funcionalidades devem ser integrados aos sistemas existentes sem exigir refatoração do núcleo.
- **Dados Centralizados:** Comportamentos e parâmetros devem ser definidos em locais específicos (`/src/core/GameConstants.js`, `/src/data`), evitando números "mágicos" na lógica dos sistemas. Rotinas de renderização de inimigos devem consumir os presets documentados (`ENEMY_EFFECT_COLORS`, `ENEMY_RENDER_PRESETS`) em `GameConstants` em vez de hardcodes locais.
- **Mudanças Atômicas e Verificáveis:** Pull Requests devem ser pequenos, focados em uma única responsabilidade e sempre acompanhados de validação (conforme `docs/validation/test-checklist.md`).
- **Sem Dependências Desnecessárias:** Priorizar o uso de APIs nativas da web. Novas bibliotecas só devem ser adicionadas com uma justificativa clara de custo-benefício.
- **Documentação Viva:** Manter a documentação (`agents.md`, `README.md`) atualizada e relevante.

#### 2. **Layout de Pastas (Estrutura Atual)**

A estrutura do projeto está organizada por responsabilidade arquitetônica:

- `/src`: Contém todo o código-fonte do jogo.
  - `/core`: Módulos centrais que fornecem a infraestrutura do jogo (`EventBus`, `ServiceLocator`, `GameConstants`).
  - `/modules`: Os "Sistemas" que contêm a lógica principal do jogo (`PlayerSystem`, `EnemySystem`, `CombatSystem`, etc.). **Esta é a principal área para adicionar e modificar a lógica de gameplay.**
  - `/data`: Modelos de dados e configurações complexas (ex: `shipModels.js`). Ideal para expandir com configurações de inimigos, armas, etc.
  - `/legacy`: Código original mantido como backup histórico (`app-original.js`).
  - `app.js`: O orquestrador principal. Inicializa os sistemas e executa o game loop.
- `/docs`: Documentação, guias de refatoração e checklists de validação.
- `index.html` e `style.css`: Estrutura da página e estilização da UI.

#### 3. **Arquitetura de Código**

O jogo segue uma **Arquitetura Modular baseada em Sistemas** com contratos explícitos de serviços e eventos. A orquestração acontece em torno do manifesto criado por `createServiceManifest()` e aplicado em `ServiceRegistry.setupServices()`, garantindo que cada sistema declare dependências formais desde o bootstrap.

- **Manifesto e Registro:** O arquivo `src/bootstrap/serviceManifest.js` exporta `createServiceManifest()` com os serviços disponíveis e suas dependências declaradas. `ServiceRegistry.setupServices()` consome esse manifesto para registrar os sistemas reais na inicialização, preservando a ordem de carregamento e habilitando validações automáticas.
- **Ponte de Compatibilidade:** `ServiceLocatorAdapter` (instanciado em `src/app.js`) conecta o manifesto estável ao legado `gameServices`, permitindo que sistemas antigos continuem usando o locator enquanto novos módulos podem optar por injeção direta. Ele deve ser encarado apenas como ponte de compatibilidade.
- **Event Bus (`gameEvents`):** Continua sendo o canal primário de comunicação desacoplada. Sistemas emitem (`gameEvents.emit(...)`) e consomem (`gameEvents.on(...)`) eventos sem acoplamento direto.
- **Sistemas:** Cada arquivo em `/src/modules` encapsula um domínio (ex.: `EnemySystem`, `WorldSystem`, `CombatSystem`). Eles são registrados via manifesto, consomem serviços via injeção ou `resolveService()` e se comunicam por eventos.
- **PhysicsSystem:** Centraliza a malha espacial de asteroides e disponibiliza utilitários reutilizáveis (por exemplo, `forEachNearbyAsteroid`, `forEachBulletCollision`), evitando percursos completos em hot paths.
- **Data-Driven:** Parâmetros operacionais residem em `GameConstants.js` e nos arquivos de `/data`. Evite valores fixos na lógica dos sistemas.

##### Recomendações Permanentes

- **Registro via Manifesto:** Ao adicionar um novo sistema, inclua-o em `createServiceManifest()` com suas dependências explícitas. Observe como `src/bootstrap/serviceManifest.js` registra `EnemySystem` e `WorldSystem`, o que permite que `ServiceRegistry.setupServices()` injete ambos corretamente durante o `bootstrap` em `src/app.js`.
- **Comunicação por Eventos:** Use `gameEvents` para fluxo de informações. `EnemySystem` em `src/modules/EnemySystem.js` emite eventos como `enemy-spawned` e `enemy-destroyed`, enquanto `WorldSystem` (`src/modules/WorldSystem.js`) consome eventos globais de reset para sincronizar seu estado sem acoplamento direto.
- **Resolução de Dependências:** Prefira injeção de dependências via construtor ou `resolveService()` fornecido pelo manifest, mantendo `gameServices` apenas como fallback através do `ServiceLocatorAdapter`. Verifique `src/app.js` para ver como os serviços são instanciados com suas dependências resolvidas.
- **Randomização Determinística:** Utilize `RandomService` seedado pelo manifesto para gerar comportamentos reprodutíveis. Veja como `EnemySystem` consome o serviço para decisões de spawn controladas.
- **Reuso de Recursos:** Reforce o uso de pools de entidades e objetos de apoio configurados no manifesto (veja `GamePools` em `src/bootstrap/serviceManifest.js`) e reutilizados por sistemas como o `EnemySystem`, reduzindo alocações e garantindo performance consistente.

#### 4. **HTML & CSS**

- **Estrutura:** O `index.html` define a estrutura das telas (menu, game over) e o contêiner do jogo. A UI é feita com elementos HTML nativos para melhor acessibilidade.
- **Estilização:** O `style.css` utiliza práticas modernas como **design tokens** (`:root` com variáveis CSS) para facilitar a manutenção de temas e estilos.

#### 5. **Padrões e Ferramentas**

- **ES6 Modules:** O projeto utiliza `import`/`export` para modularização. Cada arquivo tem uma única responsabilidade.
- **Tooling:**
  - **Vite:** Servidor de desenvolvimento rápido e build.
  - **Grunt:** Usado para tarefas de build (cópia de arquivos).
  - **Prettier:** Para formatação de código consistente.
  - **GitHub Actions:** Para automação de CI/CD (verificação de formato, build e deploy).
- **Testes (Objetivo):** Implementar `Vitest` para testes unitários da lógica dos sistemas e `Playwright` para testes de fumaça (E2E) que garantam que o jogo carrega e as telas principais funcionam.

#### 5.1. **Estrutura de Testes**

- **Localização:** Todos os testes em `/tests` (fora de `/src`)
- **Organização:**
  - `/tests/core/`: Testes de infraestrutura central (`src/core/`)
    - `DIContainer.test.js`, `ObjectPool.test.js`, `SpatialHash.test.js`, `RandomService.test.js`
  - `/tests/modules/`: Testes de sistemas de gameplay (`src/modules/`)
    - Audio: `AudioBatcher.test.js`, `AudioCache.test.js`, `AudioSystem.randomScopes.test.js`
    - Player: `PlayerSystem.commandQueue.test.js`
    - Rendering: `RenderingSystem.starfield.test.js`
    - Progression: `ProgressionSystem.test.js`
    - Wave: `WaveManager.test.js`
    - Enemies: `enemies/RewardManager.test.js`
    - Utils: `RandomHelperExposure.test.js`
  - `/tests/utils/`: Testes de utilitários (`src/utils/`)
    - `ScreenShake.test.js`, `randomHelpers.test.js`
  - `/tests/services/`: Testes de serviços (`src/services/`)
    - `GameSessionService.test.js`, `CommandQueueService.test.js`
  - `/tests/integration/`: Testes de integração entre múltiplos sistemas
    - `determinism/`: Testes de determinismo (systems, enemy-system, start-reset-cycle)
    - `gameplay/`: Testes de gameplay (mixed-enemy-waves)
    - `wavemanager/`: Testes de integração WaveManager (feature-flags)
  - `/tests/balance/`: Testes de balanceamento e métricas de jogo
    - `reward-mechanics.test.js`: Mecânicas de recompensa
    - `asteroid-metrics/`: Métricas de asteroides (spawn-rates, size-distribution, variant-distribution, fragmentation, determinismo)
  - `/tests/physics/`: Testes de física e colisões
    - `collision-accuracy.test.js`: Precisão de colisões
  - `/tests/visual/`: Testes de rendering e determinismo visual/audio
    - `rendering-determinism.test.js`, `audio-determinism.test.js`, `screen-shake-determinism.test.js`, `menu-background-determinism.test.js`, `enemy-types-rendering.test.js`
  - `/tests/__helpers__/`: Helpers compartilhados (NÃO são testes)
    - `mocks.js`: Mocks de EventBus, ServiceRegistry, RandomService, AudioSystem
    - `stubs.js`: Stubs determinísticos e de áudio
    - `fixtures.js`: Fixtures de entidades (asteroid, enemy, world, player)
    - `assertions.js`: Assertions customizadas para determinismo
    - `setup.js`: Setup/cleanup de testes individuais
    - `global-setup.js`: Setup global do Vitest (vi.restoreAllMocks)
    - `asteroid-helpers.js`: Helpers específicos para testes de asteroides
  - `/tests/__fixtures__/`: Fixtures reutilizáveis (NÃO são testes)
    - `enemies.js`: Fixtures de inimigos e configurações de teste

- **Helpers Disponíveis:**
  - **Mocks:** `createEventBusMock()`, `createServiceRegistryMock()`, `createRandomServiceStub()`, `createAudioSystemStub()`, `createGameEventsMock()`
  - **Stubs:** `createDeterministicRandom()`, `createGainStub()`, `createOscillatorStub()`, `createBufferSourceStub()`, `createSettingsStub()`
  - **Fixtures:** `createTestAsteroid()`, `createTestEnemy()`, `createTestWorld()`, `createTestPlayer()`, `createTestPhysics()`, `createTestProgression()`
  - **Assertions:** `expectDeterministicSequence()`, `expectWithinTolerance()`, `expectSameSeeds()`
  - **Setup:** `setupGlobalMocks()`, `cleanupGlobalState()`, `withWaveOverrides()`, `createTestContainer()`
  - **Asteroid Helpers:** `createEnemySystemHarness()`, `simulateWave()`, `prepareWave()`, `collectSpawnMetrics()`, `sampleVariants()`, e outros 8 helpers especializados

- **Executar Testes:**
  - `npm test` - Todos os testes (~31 arquivos)
  - `npm run test:core` - Testes de infraestrutura central (DIContainer, ObjectPool, SpatialHash, RandomService)
  - `npm run test:modules` - Testes de sistemas de gameplay (Audio, Player, Rendering, Progression, Wave, Enemies)
  - `npm run test:utils` - Testes de utilitários (ScreenShake, randomHelpers)
  - `npm run test:services` - Testes de serviços (GameSession, CommandQueue)
  - `npm run test:integration` - Testes de integração (determinism, gameplay, wavemanager)
  - `npm run test:balance` - Testes de balanceamento (reward-mechanics, asteroid-metrics)
  - `npm run test:visual` - Testes visuais (rendering, audio, screen-shake determinism)
  - `npm run test:physics` - Testes de física (collision-accuracy)
  - `npm run test:watch` - Modo watch (re-executa ao salvar)
  - `npm run test:coverage` - Com relatório de cobertura
  - `npm run test:benchmark` - Benchmark de performance (5 runs)
  - `npm run test:validate-optimizations` - Valida padrões de otimização

- **Boas Práticas:**
  1. **Use helpers centralizados:** Sempre use helpers de `__helpers__/` ao invés de criar mocks inline
  2. **Use fixtures:** Sempre use fixtures de `__fixtures__/` ao invés de criar entidades inline
  3. **Cleanup automático:** `vi.restoreAllMocks()` é executado automaticamente após cada teste via global-setup.js
  4. **Determinismo:** Use `createDeterministicRandom()` para testes determinísticos
  5. **Performance:** Use `beforeAll` para setup imutável, `vi.useFakeTimers()` para delays, `.concurrent` para paralelização
  6. **Espelhamento:** Estrutura de testes espelha estrutura de código (`tests/core/` ↔ `src/core/`, `tests/modules/` ↔ `src/modules/`)
  7. **Consulte o guia:** Veja `tests/OPTIMIZATION_GUIDE.md` para padrões de otimização aplicados

#### 6. **"Definition of Done" (DoD) para uma Feature**

Considere uma feature pronta quando:

- A entrega é atômica e compreensível em um PR isolado, com descrição clara do impacto.
- A lógica reside nos sistemas apropriados e continua parametrizada por `GameConstants.js` e/ou arquivos em `/src/data`.
- Documentação, telemetria e planos relevantes foram atualizados (quando aplicável), mantendo `agents.md`, `README.md` e relatórios consistentes.
- Os planos em `docs/plans/` foram consultados para alinhar a evolução da arquitetura e validar aderência a decisões anteriores.
- Performance (60 FPS) e ausência de vazamentos são observadas, com uso racional de pools e serviços compartilhados.
- Em modo dev, o log de debug foi analisado e não contém erros ou warnings inesperados.
- Todos os eventos críticos aparecem no log na ordem correta (spawn → update → render → collision).
- Não há gaps ou inconsistências no fluxo de eventos registrados.

#### 7. **Fluxo de Trabalho e Planejamento Contínuo**

- **Antes de Codificar:**
  1. Verifique se a mudança pode ser parametrizada em `GameConstants` ou `/src/data`, mantendo o jogo orientado a dados.
  2. Confirme em `docs/plans/` a estratégia vigente para o domínio afetado e qual sistema será ajustado ou criado.
- **Durante o Desenvolvimento:**
  - Utilize o manifesto para registrar novos serviços e mantenha dependências explícitas.
  - Reforce o uso de `gameEvents`, pools e serviços compartilhados (como `RandomService`).
- **Ao Criar um Pull Request:**
  1. Garanta que o PR cubra uma única responsabilidade.
  2. Documente qualquer nova métrica ou ajuste de telemetria.
  3. Relate validações executadas, referenciando planos ou experimentos relevantes em `docs/plans/`.

Esta política adaptada serve como um guia prático para manter a qualidade e a escalabilidade do seu projeto, respeitando a excelente arquitetura que você já implementou.

#### 8. **Sistema de Logging Automático e Diagnóstico de Problemas**

##### 8.1. Visão Geral

O projeto possui um **sistema de logging automático** (`GameDebugLogger`) que registra todos os eventos críticos durante a execução do jogo. Este sistema é **obrigatório para diagnóstico de problemas** e deve ser a **primeira ferramenta consultada** por agentes de IA ao investigar bugs.

##### 8.2. Ativação Automática

O logging é ativado **automaticamente** quando o jogo roda em modo de desenvolvimento:

**Como rodar em modo dev:**
```bash
npm run dev
```

Isso inicia o servidor Vite em `http://localhost:5173` e injeta `process.env.NODE_ENV = 'development'`, ativando o logger automaticamente.

**Importante:** Modo dev ≠ Debugger do VS Code. Você não precisa usar o debugger do VS Code. Apenas execute `npm run dev` no terminal.

##### 8.3. Onde o Log é Gravado

O log é armazenado no **localStorage do navegador** (não no sistema de arquivos) porque browsers não podem escrever arquivos diretamente por segurança.

- **Chave:** `localStorage.getItem('game-debug-log')`
- **Formato:** Texto estruturado com timestamps
- **Limite:** 50.000 entradas (~2-3MB, suficiente para ~30 waves)
- **Persistência:** Mantido entre reloads do navegador
- **Limpeza:** Sobrescrito ao iniciar nova sessão

##### 8.4. Como Obter o Log

**Método 1: Download via Console (RECOMENDADO)**

1. Jogar o jogo normalmente até reproduzir o problema
2. Abrir console do navegador (pressionar **F12**)
3. Executar comando:
   ```javascript
   downloadDebugLog()
   ```
4. Arquivo `game-debug.log` será baixado para pasta Downloads
5. Abrir arquivo em editor de texto (Notepad, VS Code, etc.)
6. Copiar todo o conteúdo
7. Colar no chat com o agente de IA

**Método 2: Visualizar no Console**

```javascript
showDebugLog()
```

Isto exibe o log diretamente no console. Útil para verificação rápida.

**Método 3: Copiar do localStorage**

```javascript
copy(localStorage.getItem('game-debug-log'))
```

Copia o log para área de transferência (função `copy()` disponível no Chrome DevTools).

##### 8.5. Categorias de Log

O log é organizado por categorias para facilitar análise:

- **[INIT]** - Inicialização de sistemas, feature flags, configurações
- **[WAVE]** - Progressão de waves, detecção de boss waves, wave completion
- **[SPAWN]** - Spawn de todos os inimigos (asteroids, bosses, drones, mines, hunters)
- **[UPDATE]** - Quais enemies estão sendo atualizados a cada segundo
- **[RENDER]** - Quais enemies estão sendo renderizados a cada segundo
- **[COLLISION]** - Detecção de colisões (bullets, player, enemies)
- **[DAMAGE]** - Dano aplicado a enemies e player
- **[EVENT]** - Eventos importantes do EventBus
- **[ERROR]** - Erros, exceptions, warnings
- **[STATE]** - Mudanças de estado (phase transitions, wave state, etc.)

##### 8.6. Exemplo de Log

```
[00:00.000] [INIT] GameDebugLogger initialized
[00:00.050] [INIT] Feature Flags - {"USE_WAVE_MANAGER":true,"WAVE_BOSS_INTERVAL":5}
[00:00.051] [INIT] Systems initialized - {"waveManager":true,"factory":true}
[00:05.234] [WAVE] Wave 1 started - {"totalEnemies":4,"isBossWave":false}
[00:05.235] [SPAWN] Asteroid spawned - {"size":"large","position":{"x":750,"y":-80}}
[01:30.123] [WAVE] Wave 5 started - {"totalEnemies":11,"isBossWave":true}
[01:30.124] [WAVE] Boss wave detected - {"wave":5}
[01:30.125] [SPAWN] Boss spawn attempted - {"entrance":"top-center"}
[01:30.126] [SPAWN] Boss position calculated - {"x":400,"y":-100}
[01:30.127] [SPAWN] Boss instance created - {"id":"boss-5-1","health":2592}
[01:30.128] [STATE] Boss registered - {"activeEnemyCount":1}
[01:30.150] [UPDATE] Enemy update loop - {"types":{"boss":1}}
[01:30.151] [RENDER] Enemy render loop - {"types":{"boss":1}}
[01:31.234] [COLLISION] Bullet hit boss - {"damage":10,"health":2582}
[01:35.678] [STATE] Boss phase transition - {"oldPhase":0,"newPhase":1}
[02:15.432] [STATE] Boss destroyed - {"wave":5,"phase":2}
[02:15.433] [WAVE] Wave complete - {"wave":5,"duration":45.3}
```

##### 8.7. Protocolo Obrigatório para Agentes de IA

**IMPORTANTE:** Ao receber um relatório de bug do usuário, agentes de IA devem **SEMPRE** seguir este protocolo:

**Passo 1: Solicitar o Log**

Resposta padrão ao receber bug report:

```
Para diagnosticar este problema, preciso do log de debug.

Por favor:
1. Abra o console do navegador (pressione F12)
2. Execute o comando: downloadDebugLog()
3. Abra o arquivo game-debug.log que foi baixado
4. Copie todo o conteúdo do arquivo
5. Cole aqui no chat

Com o log, posso identificar exatamente onde o problema está ocorrendo.
```

**Passo 2: Ler e Analisar o Log**

Quando o usuário compartilhar o log, ler na seguinte ordem:

1. **Seção [INIT]:** Verificar feature flags e sistemas inicializados
2. **Seção [WAVE]:** Entender progressão de waves e detecção de boss waves
3. **Seção [SPAWN]:** Identificar se enemies foram spawned corretamente
4. **Seção [ERROR]:** Procurar erros explícitos
5. **Seção [UPDATE]:** Verificar se enemies estão sendo atualizados
6. **Seção [RENDER]:** Verificar se enemies estão sendo renderizados
7. **Seção [COLLISION]:** Verificar se colisões estão sendo detectadas

**Passo 3: Identificar Padrão de Falha**

Procurar por:
- Eventos que deveriam acontecer mas não aconteceram
- Sequências quebradas (ex: spawn → update → render, se faltar render, problema está no rendering)
- Erros explícitos marcados como [ERROR]
- Valores inválidos (position undefined, health NaN, etc.)
- Gaps temporais (eventos que param de acontecer)

**Passo 4: Propor Solução Baseada em Evidências**

- Citar linhas específicas do log
- Identificar exatamente onde o fluxo quebra
- Propor correção cirúrgica no arquivo e linha específicos
- Explicar a causa raiz baseado no log

##### 8.8. Exemplo de Diagnóstico

**Usuário reporta:**
"Boss não aparece na wave 5"

**Agente de IA solicita:**
"Por favor, execute `downloadDebugLog()` no console (F12) e compartilhe o conteúdo do arquivo."

**Usuário compartilha log:**
```
[01:30.125] [SPAWN] Boss spawn attempted - {"entrance":"top-center"}
[01:30.126] [SPAWN] Boss position calculated - {"x":400,"y":-100}
[01:30.127] [SPAWN] Boss instance created - {"id":"boss-5-1","health":2592}
[01:30.128] [STATE] Boss registered - {"activeEnemyCount":1}
[01:30.150] [UPDATE] Enemy update loop - {"types":{}}
[01:30.151] [ERROR] Non-asteroid enemy filtered in update loop - {"type":"boss"}
```

**Agente de IA diagnostica:**

"Analisando o log:

✅ Linha 1-4: Boss foi criado e registrado com sucesso
❌ Linha 5: Update loop mostra types:{} (vazio) - boss não está sendo atualizado
❌ Linha 6: Erro explícito - boss está sendo filtrado no update loop

**Causa Raiz:** `EnemySystem.updateAsteroids()` linha 2173 tem filtro `if (enemy.type !== 'asteroid') return;` que exclui o boss.

**Solução:** Remover este filtro e adicionar lógica condicional para chamar `boss.onUpdate()` quando `enemy.type === 'boss'`.

**Arquivo:** `src/modules/EnemySystem.js`
**Linha:** 2173
**Mudança:** Substituir filtro de tipo por lógica condicional"

##### 8.9. Comandos de Debug Disponíveis

Quando o jogo roda em modo dev (`npm run dev`), os seguintes comandos ficam disponíveis no console do navegador:

```javascript
downloadDebugLog()  // Baixa arquivo game-debug.log
showDebugLog()      // Mostra log no console
clearDebugLog()     // Limpa log atual
```

##### 8.10. Tamanho e Performance do Log

- **Limite:** 50.000 entradas
- **Tamanho estimado:** ~2-3MB em localStorage
- **Cobertura:** ~30 waves ou ~15 minutos de gameplay
- **Trimming:** Quando atingir 50.000, remove 10.000 mais antigas (preserva início)
- **Overhead:** <0.5% do frame budget (desprezível)
- **Produção:** Completamente desabilitado (zero overhead)

##### 8.11. Fluxo de Trabalho com Logging

**Durante Desenvolvimento:**
1. Rodar `npm run dev` (logging ativa automaticamente)
2. Jogar o jogo normalmente
3. Reproduzir o bug
4. Executar `downloadDebugLog()` no console
5. Compartilhar arquivo com agente de IA

**Durante Diagnóstico (Agente de IA):**
1. Receber log do usuário
2. Ler seções relevantes ([INIT], [WAVE], [SPAWN], [ERROR])
3. Identificar onde o fluxo quebra
4. Propor correção específica
5. Usuário implementa correção via Codex
6. Repetir até problema resolvido

##### 8.12. Benefícios

- **Zero Esforço do Usuário:** Log gerado automaticamente, sem configuração
- **Diagnóstico Preciso:** IA vê exatamente o que aconteceu, não especulação
- **Reproduzível:** Cada sessão gera seu próprio log
- **Completo:** Captura todos os eventos críticos do jogo
- **Eficiente:** Resolve problemas em minutos ao invés de horas
- **Não Invasivo:** Apenas em modo dev, zero impacto em produção

#### 9. **Sistema de Análise de Dependências e Arquivos Críticos**

##### 9.1. Visão Geral

- O pipeline de análise (`scripts/analyze-dependencies.js` + `scripts/generate-mermaid-graph.js`) monitora o grafo de imports/exports para prevenir regressões arquiteturais.
- Artefatos gerados no modo completo (`npm run analyze:deps`): `dependency-graph.json`, `dependency-issues.json`, `dependency-graph.dot` e `docs/architecture/dependency-graph.mmd`.
- Utilize `docs/architecture/DEPENDENCY_GRAPH.md` para visualizar os hubs, ciclos e agrupamentos gerados automaticamente.

##### 9.2. Arquivos Críticos e Regras de Manutenção

- **`src/core/GameConstants.js`**
  - Nunca duplique constantes em sistemas; adicione chaves novas neste arquivo.
  - Checklist rápido: (1) evitar números mágicos em módulos, (2) atualizar comentários/descrições relevantes, (3) validar que presets continuam consumidos pelos sistemas dependentes.
- **`src/core/EventBus.js`**
  - Proíba side effects durante importação; apenas exporte instância singleton.
  - Checklist rápido: (1) novos eventos documentados com descrição, (2) handlers registrados/desregistrados no lifecycle correto, (3) evitar chamadas encadeadas que bloqueiem o loop principal.
- **`src/bootstrap/serviceManifest.js`**
  - Toda dependência deve ser explícita; não omitir serviços implícitos.
  - Checklist rápido: (1) declarar ordem correta, (2) atualizar `ServiceRegistry.setupServices()` se um construtor mudar, (3) refletir alterações no manifesto antes de tocar em `src/app.js`.
- **`src/app.js`**
  - Mantém o bootstrap determinístico; qualquer novo serviço deve passar pelo manifesto.
  - Checklist rápido: (1) preservar inicialização do `ServiceLocatorAdapter`, (2) garantir que seeds e RandomService sejam configurados antes de qualquer sistema consumir aleatoriedade, (3) manter logging de bootstrap intacto.

##### 9.3. Execução e Interpretação

- Rodar localmente: `npm run analyze:deps` (gera artefatos) ou `npm run validate:deps` (modo validação).
- `dependency-issues.json` contém três chaves:
  - `cycles`: lista cada ciclo em formato `A -> B -> C -> A`.
  - `hubs`: arquivos com mais de 10 dependentes diretos (marcados como críticos no JSON e no Mermaid).
  - `orphans`: módulos sem consumidores (excluindo entry points definidos no script).
- Em caso de alerta, tratar a causa antes de abrir PR; se for falso positivo, documentar no corpo do PR com justificativa.

##### 9.4. Workflow Codex/Claude Pré-PR

1. Executar `npm run analyze:deps` e inspecionar `dependency-issues.json`.
2. Atualizar documentação impactada (`agents.md`, `docs/architecture/DEPENDENCY_GRAPH.md`, outros planos) conforme necessário.
3. Adicionar resultados relevantes na descrição do PR (ex.: "Nenhum ciclo detectado").
4. Se surgirem novas dependências críticas, explicar a motivação na seção de resumo do PR.

##### 9.5. Cobertura em CI

- Workflow `validate-dependencies.yml` roda em `pull_request` para `main` quando arquivos em `src/**/*.js` ou `scripts/**/*.js` mudam.
- Etapas: `npm ci`, `npm run analyze:deps` (gera artefatos para download) e validação customizada que falha somente se `dependency-issues.json` apontar ciclos.
- Artefatos enviados: `dependency-graph.json`, `dependency-issues.json`, `dependency-graph.dot`, `docs/architecture/dependency-graph.mmd` + resumo no Job Summary do GitHub Actions.

##### 9.6. Padrões de Import/Export

- Preferir imports relativos curtos; reorganize arquivos para evitar cadeias `../../..` sempre que possível.
- Reexportações centrais são proibidas (evite criar "index barrels" que escondem dependências reais).
- Apenas exports nomeados para múltiplas entidades; usar `export default` somente quando houver um ponto de entrada claro para o módulo.

##### 9.7. Adicionando Novos Sistemas

1. Criar o módulo em `src/modules/<NomeDoSistema>.js` seguindo os padrões de serviço.
2. Declarar o sistema e dependências em `src/bootstrap/serviceManifest.js`.
3. Ajustar `docs/architecture/DEPENDENCY_GRAPH.md` se o novo sistema introduzir hubs propositais ou dependências cíclicas justificadas (explicar em nota).
4. Rodar `npm run analyze:deps` para garantir que o grafo reflita o novo módulo.

##### 9.8. Anti-padrões a Evitar

- Instanciar serviços diretamente sem passar pelo manifesto.
- Consumir `GameConstants` apenas parcialmente e replicar objetos internamente.
- Importar arquivos do diretório `tests/` dentro do código de produção.
- Criar dependências cruzadas entre sistemas (ex.: `EnemySystem` importando diretamente `PlayerSystem`). Utilize eventos ou serviços compartilhados.

##### 9.9. Referências Cruzadas

- Guia visual e histórico: `docs/architecture/DEPENDENCY_GRAPH.md`.
- Checklist geral de validação: `docs/validation/test-checklist.md`.
- Logs e métricas adicionais podem ser anexados em PRs na seção de "Validações" conforme a política de documentação viva.

##### 9.10. Checklist Pré-PR (Dependências)

- [ ] `npm run analyze:deps` executado após as alterações.
- [ ] `dependency-issues.json` revisado (sem ciclos ou hubs inesperados, órfãos justificados).
- [ ] Documentação relevante atualizada (`agents.md`, `docs/architecture/DEPENDENCY_GRAPH.md`, outros planos afetados).
- [ ] CI (`validate-dependencies.yml`) passando ou com justificativa clara caso esteja em vermelho.
- [ ] Resumo do PR menciona o estado da análise de dependências.

#### 10. **Documentação Arquitetural e Plano de Evolução**

##### 10.1. Onde encontrar os detalhes

- **Estrutura atual**: `docs/architecture/CURRENT_STRUCTURE.md`
- **Estrutura ideal e princípios**: `docs/architecture/IDEAL_STRUCTURE.md`
- **Plano de migração (FASE 6.x)**: `docs/architecture/MIGRATION_PLAN.md`

##### 10.2. Ponto de partida rápido

- **Hoje**: mantenha o fluxo atual (classe em `src/modules/enemies/types/` + registro no `EnemyFactory`) e use `docs/architecture/CURRENT_STRUCTURE.md#5-padroes-de-inimigos` para o passo a passo completo.
- **Futuro**: planeje a migração para configs em `src/data/enemies/` após concluir a componentização descrita em `docs/architecture/IDEAL_STRUCTURE.md#4-sistema-de-componentes-reutilizaveis`.
- **Antes de qualquer fase 6+**: valide o checklist em `docs/architecture/MIGRATION_PLAN.md#9-checklist-pre-migracao`.

##### 10.3. Referências complementares

- Plano arquitetural (Fases 1–5): `docs/plans/architecture-master-plan.md`
- Grafo de dependências: `docs/architecture/DEPENDENCY_GRAPH.md`
- Checklist geral de validação: `docs/validation/test-checklist.md`
