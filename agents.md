# agents.md

## Escopo e objetivo

Documento único de referência para agentes e pessoas colaborando neste
repositório. Define limites de atuação, boas práticas de colaboração e o fluxo
para manter a arquitetura modular segura e rastreável.

### **Política de Desenvolvimento para ASTEROIDS_ROGUEFIELD**

#### 1. **Princípios Fundamentais**

- **Escalabilidade por Design:** Novas armas, inimigos e funcionalidades devem ser integrados aos sistemas existentes sem exigir refatoração do núcleo.
- **Dados Centralizados:** Comportamentos e parâmetros devem ser definidos em locais específicos (`/src/data/constants/`, `/src/data/enemies/`, `/src/data`), evitando números "mágicos" na lógica dos sistemas. Constantes são organizadas por domínio: `physics.js` (física), `gameplay.js` (mecânicas), `visual.js` (renderização/efeitos), `asteroid-configs.js` (configuração de asteroides). `GameConstants.js` re-exporta tudo para compatibilidade. Rotinas de renderização de inimigos devem consumir os presets documentados (`ENEMY_EFFECT_COLORS`, `ENEMY_RENDER_PRESETS`) em vez de hardcodes locais.
- **Mudanças Atômicas e Verificáveis:** Pull Requests devem ser pequenos, focados em uma única responsabilidade e sempre acompanhados de validação (conforme `docs/validation/test-checklist.md`).
- **Sem Dependências Desnecessárias:** Priorizar o uso de APIs nativas da web. Novas bibliotecas só devem ser adicionadas com uma justificativa clara de custo-benefício.
- **Documentação Viva:** Manter a documentação (`agents.md`, `README.md`) atualizada e relevante.

#### 2. **Layout de Pastas (Estrutura Atual)**

A estrutura do projeto está organizada por responsabilidade arquitetônica:

- `/src`: Contém todo o código-fonte do jogo.
  - `/core`: Módulos centrais que fornecem a infraestrutura do jogo (`EventBus`, `ServiceLocator`, `GameConstants`).
  - `/modules`: Os "Sistemas" que contêm a lógica principal do jogo (`PlayerSystem`, `EnemySystem`, `CombatSystem`, etc.). **Esta é a principal área para adicionar e modificar a lógica de gameplay.**
  - `/data`: Modelos de dados e configurações complexas organizadas por domínio:
    - `/constants`: Constantes de física (`physics.js`), gameplay (`gameplay.js`), e visuais (`visual.js`)
    - `/enemies`: Configurações de inimigos (`asteroid-configs.js`, futuramente `drone.js`, `boss.js`, etc.)
    - `/ui`: Layouts de HUD e UI
    - Arquivos raiz: `shipModels.js`, `upgrades.js`, `settingsSchema.js`
  - Histórico legado: consulte o histórico do Git para snapshots antigos (a pasta `/legacy` foi removida na limpeza de 2025).
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

Ver `docs/architecture/CURRENT_STRUCTURE.md` para detalhes de implementação e recomendações práticas.

#### 4. **HTML & CSS**

- **Estrutura:** `index.html` define telas e UI com elementos nativos e overlays do jogo.
- **Estilização:** `style.css` aplica tokens em `:root`, utilitários e componentes responsivos.
- Ver `src/README.md` para descrição completa da UI e da organização de estilos.

#### 5. **Padrões e Ferramentas**

- **ES6 Modules:** O projeto utiliza `import`/`export` para modularização. Cada arquivo tem uma única responsabilidade.
- **Tooling Essencial:** Vite, Grunt, Prettier, GitHub Actions e Vitest sustentam build, automação e qualidade.
- Ver `docs/development/TOOLING.md` para configuração e uso detalhado de cada ferramenta.

**Testes:** Ver `tests/README.md` para estrutura completa, helpers disponíveis e comandos de execução.

#### 6. **"Definition of Done" (DoD) para uma Feature**

Considere uma feature pronta quando:

- A entrega é atômica e compreensível em um PR isolado, com descrição clara do impacto.
- A lógica reside nos sistemas apropriados e continua parametrizada por constantes em `/src/data/constants/` e `/src/data/enemies/` (acessíveis via `GameConstants.js` ou imports diretos).
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

#### 7.4. Creating New Systems with BaseSystem

All new game systems should extend `BaseSystem` to maintain consistency and leverage automatic lifecycle management.

##### Template Básico

```javascript
import { BaseSystem } from '../core/BaseSystem.js';

class MySystem extends BaseSystem {
  constructor(dependencies = {}) {
    super(dependencies, {
      systemName: 'MySystem',           // Nome para logs
      serviceName: 'my-system',         // Chave no ServiceLocator
      enableRandomManagement: true,     // Se precisa de randomness
      randomForkLabels: ['base', 'feature1']  // Labels dos forks
    });
    
    // Inicialização específica do sistema
    this.myState = {};
  }
  
  setupEventListeners() {
    // Use registerEventListener ao invés de gameEvents.on()
    this.registerEventListener('event:name', this.handleEvent.bind(this));
  }
  
  handleEvent(data) {
    // Lógica do handler
  }
  
  reset() {
    super.reset();  // SEMPRE chamar super primeiro
    // Reset específico do sistema
    this.myState = {};
  }
  
  destroy() {
    super.destroy();  // SEMPRE chamar super primeiro
    // Cleanup específico do sistema
    this.myState = null;
  }
}

export default MySystem;
```

##### Opções do Constructor

- **systemName** (obrigatório): Nome do sistema para logs e debugging
- **serviceName** (obrigatório): Chave de registro no ServiceLocator
- **enableRandomManagement** (opcional): `true` para habilitar random forks
- **randomForkLabels** (opcional): Array de labels para random forks
- **enablePerformanceMonitoring** (opcional): `true` para tracking de performance

##### Regras Importantes

1. **SEMPRE** chame `super()` primeiro no constructor
2. **SEMPRE** chame `super.reset()` e `super.destroy()` primeiro nos overrides
3. **USE** `this.registerEventListener()` ao invés de `gameEvents.on()` diretamente
4. **USE** `this.getRandomFork(label)` para randomness determinística
5. **DEIXE** BaseSystem gerenciar registro de serviços e cleanup
6. **IMPLEMENTE** `setupEventListeners()` para registrar eventos

##### Benefícios

- ✅ Event listeners são automaticamente limpos no `destroy()`
- ✅ Random management é centralizado e determinístico
- ✅ Lifecycle é padronizado (reset, destroy)
- ✅ Menos código boilerplate
- ✅ Registro automático no ServiceLocator
- ✅ Logs consistentes de inicialização

##### Casos Especiais

- **Sem randomness**: Use `enableRandomManagement: false` (ex: PhysicsSystem)
- **Random customizado**: Implemente sua própria lógica se o fork model não servir (ex: AudioSystem)
- **Lifecycle customizado**: Adicione métodos como `pause()`/`resume()` conforme necessário (ex: PlayerSystem)

##### Referências

- **Guia completo**: `docs/refactoring/REFACTOR-015-BASESYSTEM-MIGRATION.md`
- **Código fonte**: `src/core/BaseSystem.js`
- **Exemplos**: Todos os 12 sistemas principais em `src/modules/`


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

**Análise de Dependências:** Ver `docs/architecture/DEPENDENCY_GRAPH.md` para hubs, ciclos, órfãos e workflow completo.

#### 10. **Documentação Arquitetural e Plano de Evolução**

##### 10.1. Onde encontrar os detalhes

- **Estrutura atual**: `docs/architecture/CURRENT_STRUCTURE.md`
- **Estrutura ideal e princípios**: `docs/architecture/IDEAL_STRUCTURE.md`
- **Plano de migração (FASE 6.x)**: `docs/architecture/MIGRATION_PLAN.md`

##### 10.2. Ponto de partida rápido

- **Hoje**: mantenha o fluxo atual (classe em `src/modules/enemies/types/` + registro no `EnemyFactory`) e use `docs/architecture/CURRENT_STRUCTURE.md#5-padroes-de-inimigos` para o passo a passo completo.
- **Futuro**: planeje a migração para configs em `src/data/enemies/` após concluir a componentização descrita em `docs/architecture/IDEAL_STRUCTURE.md#4-sistema-de-componentes-reutilizaveis`.
- **Antes de qualquer fase 6+**: valide o checklist em `docs/architecture/MIGRATION_PLAN.md#9-checklist-pre-migracao`.

**Organização de Constantes (REFACTOR-002):** Ver `docs/architecture/CURRENT_STRUCTURE.md` §3.6 para detalhes sobre a nova estrutura de constantes organizadas por domínio (`physics.js`, `gameplay.js`, `visual.js`, `asteroid-configs.js`).

##### 10.3. Referências complementares

- Plano arquitetural (Fases 1–5): `docs/plans/architecture-master-plan.md`
- Grafo de dependências: `docs/architecture/DEPENDENCY_GRAPH.md`
- Checklist geral de validação: `docs/validation/test-checklist.md`
