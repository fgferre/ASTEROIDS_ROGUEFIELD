# agents.md

## Escopo e objetivo

Documento único de referência para agentes e pessoas colaborando neste
repositório. Define limites de atuação, boas práticas de colaboração e o fluxo
para manter a arquitetura modular segura e rastreável.

### **Política de Desenvolvimento para ASTEROIDS_ROGUEFIELD**

#### 1. **Princípios Fundamentais**

- **Escalabilidade por Design:** Novas armas, inimigos e funcionalidades devem ser integrados aos sistemas existentes sem exigir refatoração do núcleo.
- **Dados Centralizados:** Comportamentos e parâmetros devem ser definidos em locais específicos (`/src/core/GameConstants.js`, `/src/data`), evitando números "mágicos" na lógica dos sistemas.
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

O projeto utiliza uma **Arquitetura Modular baseada em Sistemas**, orquestrada por dois padrões centrais:

- **Service Locator (`gameServices`):** Um registro central para que sistemas possam acessar outros sistemas sem acoplamento direto (ex: `CombatSystem` acessando `gameServices.get('player')`).
- **Event Bus (`gameEvents`):** Um barramento de eventos para comunicação desacoplada. Sistemas emitem eventos (`gameEvents.emit('enemy-destroyed', ...)`) e outros sistemas reagem a eles (`gameEvents.on('enemy-destroyed', ...)`), sem se conhecerem diretamente.
- **Sistemas:** Cada arquivo em `/src/modules` é um sistema que encapsula a lógica e o estado de um domínio específico (Player, Inimigos, UI). Novas funcionalidades devem ser adicionadas ao sistema apropriado.
- **PhysicsSystem:** Centraliza a malha espacial de asteroides e oferece utilitários de broad-phase compartilhados (por exemplo, `forEachNearbyAsteroid`, `forEachBulletCollision`) reutilizados por combate, mundo e progressão. Prefira consultar esse serviço a varrer listas completas em hot paths.
- **Data-Driven:** A lógica deve ser parametrizada através de constantes em `GameConstants.js` e arquivos no diretório `/data`. Evite valores fixos dentro dos métodos dos sistemas.

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

Uma nova funcionalidade ou alteração é considerada "concluída" quando:

- A lógica está implementada dentro do(s) sistema(s) apropriado(s).
- Parâmetros e configurações estão em `GameConstants.js` ou `/data`.
- O `test-checklist.md` foi atualizado e os cenários relevantes foram validados.
- A performance se mantém estável (60 FPS) e sem vazamentos de memória.
- O PR é pequeno, focado e descreve claramente a mudança.

#### 7. **Fluxo de Trabalho e Checklists**

O projeto deve seguir o fluxo descrito em `agents.md`, com foco em PRs pequenos e revisões claras.

- **Antes de Codificar:**
  1.  A funcionalidade pode ser controlada por dados em `GameConstants` ou `/data`?
  2.  Qual sistema existente será modificado ou será necessário um novo sistema?
- **Ao Criar um Pull Request:**
  1.  O PR é pequeno e focado (< 300 linhas)?
  2.  As validações do `test-checklist.md` foram realizadas?
  3.  A descrição do PR é clara, explicando o quê e o porquê da mudança?

Esta política adaptada serve como um guia prático para manter a qualidade e a escalabilidade do seu projeto, respeitando a excelente arquitetura que você já implementou.
