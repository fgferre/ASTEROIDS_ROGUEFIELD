# agents.md

## Escopo e objetivo

Documento único de referência para agentes e pessoas colaborando neste
repositório. Define limites de atuação, boas práticas de colaboração e o fluxo
para manter a arquitetura modular segura e rastreável.

### **Política de Desenvolvimento para ASTEROIDS_ROGUEFIELD**

#### 1. **Princípios Fundamentais**

- **Escalabilidade por Design:** Novas armas, inimigos e funcionalidades devem ser integrados aos sistemas existentes sem exigir refatoração do núcleo.
- **Dados Centralizados:** Comportamentos e parâmetros devem ser definidos em locais específicos (`/src/core/GameConstants.js`, `/src/data`), evitando números "mágicos" na lógica dos sistemas. Rotinas de renderização de inimigos devem consumir os presets documentados (`ENEMY_EFFECT_COLORS`, `ENEMY_RENDER_PRESETS`) em `GameConstants` em vez de hardcodes locais.
- **Mudanças Atômicas e Verificáveis:** Pull Requests devem ser pequenos, focados em uma única responsabilidade e sempre acompanhados de validação local.
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

#### 3.1. **Guias de Agentes Distribuídos**

Para documentação detalhada de padrões, regras e workflows específicos de cada área do código, consulte os guias de agentes distribuídos:

- **`/src/core/agents.md`** - Infraestrutura central (EventBus, DIContainer, GameConstants, RandomService, pools)
- **`/src/bootstrap/agents.md`** - Bootstrap e manifesto de serviços (serviceManifest.js, ordem de inicialização)
- **`/src/modules/agents.md`** - Padrões de sistemas (lifecycle, eventos, como adicionar novos sistemas)
- **`/src/modules/enemies/agents.md`** - Arquitetura de inimigos (BaseEnemy, EnemyFactory, componentes, waves)
- **`/src/services/agents.md`** - Serviços de sessão e comandos (GameSessionService, CommandQueueService)

**Quando consultar:**
- Modificando arquivos em `/src/core/` → leia `/src/core/agents.md`
- Adicionando novo sistema → leia `/src/modules/agents.md`
- Trabalhando com inimigos → leia `/src/modules/enemies/agents.md`
- Modificando bootstrap → leia `/src/bootstrap/agents.md`
- Trabalhando com sessão/comandos → leia `/src/services/agents.md`

#### 4. **Regras Críticas (Curtas)**

- **Sem efeitos colaterais em import:** inicialize serviços no bootstrap e não registre handlers durante `import`.
- **Sem imports de testes em `/src/`:** mantenha código de produção isolado de fixtures e helpers de teste.

#### 5. **Padrões e Ferramentas**

- **ES6 Modules:** o código é estruturado com `import`/`export` e responsabilidades únicas por arquivo.
- Para testes, ver `tests/README.md` e `tests/OPTIMIZATION_GUIDE.md`.

#### 6. **"Definition of Done" (DoD) para uma Feature**

Considere uma feature pronta quando:

- A mudança é atômica e compreensível em um PR isolado.
- Toda lógica continua parametrizada por `GameConstants.js` e/ou arquivos em `/src/data`.
- O log de debug não possui erros e os eventos críticos aparecem na ordem esperada.

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
  - **Análise de dependências:**
    1. Execute `npm run analyze:deps` e inspecione `dependency-issues.json`.
    2. Consulte `docs/architecture/DEPENDENCY_GRAPH.md` para workflow completo.
    3. Verifique que não há ciclos ou hubs inesperados.

Esta política adaptada serve como um guia prático para manter a qualidade e a escalabilidade do seu projeto, respeitando a excelente arquitetura que você já implementou.

#### 8. **Sistema de Logging Automático e Diagnóstico de Problemas**

##### 8.1. Quick Start

Execute `npm run dev`, reproduza o problema, abra o console (F12) e chame `downloadDebugLog()` para baixar `game-debug.log`; o logger (`GameDebugLogger`) grava até 50.000 eventos em `localStorage.getItem('game-debug-log')`, e você pode usar `downloadDebugLog()`, `showDebugLog()` ou `clearDebugLog()` para operar o histórico.

##### 8.2. Categorias de Log

- **[INIT]** - Inicialização de sistemas, feature flags
- **[WAVE]** - Progressão de waves, boss waves
- **[SPAWN]** - Spawn de inimigos (asteroids, bosses, drones, mines, hunters)
- **[UPDATE]** - Enemies sendo atualizados
- **[RENDER]** - Enemies sendo renderizados
- **[COLLISION]** - Detecção de colisões
- **[DAMAGE]** - Dano aplicado
- **[EVENT]** - Eventos importantes do EventBus
- **[ERROR]** - Erros, exceptions, warnings
- **[STATE]** - Mudanças de estado (phase transitions, wave state)

##### 8.3. Protocolo para Agentes de IA

**Ao receber bug report:**

1. **Solicitar log:** Peça ao usuário para executar `downloadDebugLog()` e compartilhar o arquivo
2. **Ler seções:** [INIT] → [WAVE] → [SPAWN] → [ERROR] → [UPDATE] → [RENDER] → [COLLISION]
3. **Identificar falha:** Procure eventos ausentes, sequências quebradas, erros explícitos, valores inválidos
4. **Propor solução:** Cite linhas do log, identifique onde o fluxo quebra, proponha correção cirúrgica

##### 8.4. Workflow

**Durante desenvolvimento:** `npm run dev` → reproduzir bug → `downloadDebugLog()` → compartilhar com IA

**Durante diagnóstico:** Receber log → ler seções relevantes → identificar quebra → propor correção → repetir até resolver

#### 9. **Documentação Arquitetural e Plano de Evolução**


##### 9.1. Onde encontrar os detalhes

- **Estrutura atual**: `docs/architecture/CURRENT_STRUCTURE.md`
- **Estrutura ideal e princípios**: `docs/architecture/IDEAL_STRUCTURE.md`
- **Plano de migração (FASE 6.x)**: `docs/architecture/MIGRATION_PLAN.md`

##### 9.2. Ponto de partida rápido

- **Hoje**: mantenha o fluxo atual (classe em `src/modules/enemies/types/` + registro no `EnemyFactory`) e use `docs/architecture/CURRENT_STRUCTURE.md#5-padroes-de-inimigos` para o passo a passo completo.
- **Futuro**: planeje a migração para configs em `src/data/enemies/` após concluir a componentização descrita em `docs/architecture/IDEAL_STRUCTURE.md#4-sistema-de-componentes-reutilizaveis`.
- **Antes de qualquer fase 6+**: valide o checklist em `docs/architecture/MIGRATION_PLAN.md#9-checklist-pre-migracao`.

##### 9.3. Referências complementares

- Plano arquitetural (Fases 1–5): `docs/plans/architecture-master-plan.md`
- Grafo de dependências: `docs/architecture/DEPENDENCY_GRAPH.md`
- Relatório de auditoria: `docs/audit-report.md`
