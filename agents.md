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

#### 6. **"Definition of Done" (DoD) para uma Feature**

Considere uma feature pronta quando:

- A entrega é atômica e compreensível em um PR isolado, com descrição clara do impacto.
- A lógica reside nos sistemas apropriados e continua parametrizada por `GameConstants.js` e/ou arquivos em `/src/data`.
- Documentação, telemetria e planos relevantes foram atualizados (quando aplicável), mantendo `agents.md`, `README.md` e relatórios consistentes.
- Os planos em `docs/plans/` foram consultados para alinhar a evolução da arquitetura e validar aderência a decisões anteriores.
- Performance (60 FPS) e ausência de vazamentos são observadas, com uso racional de pools e serviços compartilhados.

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
