# agents.md

> **Propósito**: guiar IAs (ou humanos) trabalhando como um _time multidisciplinar_ para projetar, implementar, polir e validar um jogo 2D com progressão roguelike e combate arcade — em **arquitetura modular**, com **comunicação desacoplada por eventos** e **entregas verificáveis**.  
> **Escopo**: engine-agnóstico, metas atemporais, sem dependências de versões, marcas ou métricas específicas.

## 1) Princípios que não envelhecem

1. **Modularidade explícita**: responsabilidades pequenas, coesas, com fronteiras publicadas.
2. **Desacoplamento por eventos**: comunicação preferencial via _Event Bus_ / _Message Hub_ + interfaces; evitar referências diretas cruzadas.
3. **Evoluir em passos curtos**: primeiro fazer funcionar, depois fazer direito, depois otimizar; refatorar quando a dor justificar.
4. **Testabilidade como norte**: cada módulo com pontos de prova, estados observáveis e _fixtures_ simples.
5. **Dados fora do código**: estatísticas/balanceamento em _data assets_ (config), sempre que viável.
6. **Validação contínua**: cada entrega acompanha checklist objetivo de aceitação.
7. **Módulos ES6 como padrão**: Utilizar `import`/`export` para consistência e compatibilidade com o ecossistema de build moderno (Vite). Evitar `require`/`module.exports` e exports globais (`window`).

## 2) Mapa de módulos (boundaries)

- **Player**: input, movimento, estados básicos e sinais de intenção. _Não_ gerencia armas, progresso, UI, áudio.
- **Combat**: armas, projéteis, cálculo de dano e _cooldowns_. _Não_ decide AI nem toca som/UI.
- **Enemy**: AI, spawning, _waves_ e comportamento. _Não_ calcula dano nem UI.
- **Progression**: XP/nível, upgrades, _loot_ e meta-progressão. _Não_ desenha UI nem implementa arma.
- **UI**: HUD/menus/feedback visual na interface. _Não_ contém regra de jogo.
- **Audio**: SFX/música/adaptação dinâmica, disparado por eventos. _Não_ decide _quando_ ocorrer algo.
- **World**: colisões, limites, geração/gestão espacial. _Não_ implementa lógica de entidades.
- **Effects**: partículas, _screen shake_, pós-processo e animações não-UI. _Não_ contém lógica de gameplay.

> **Regra de ouro**: módulos conversam por **eventos e interfaces**, não por referências diretas.

## 3) Papéis (Agentes) e responsabilidades

- **Game Designer Agent**
  - Propõe mecânicas, _loops_, progressão e balanceamento.
  - Entrega _design notes_ com hipóteses, riscos e telemetria a coletar.
- **Programmer/Architect Agent**
  - Define APIs, eventos, contratos e _patterns_ (ex.: Strategy/Factory/Observer/DI).
  - Garante isolamento, testes e _lint_; cuida do _tech-debt ledger_.
- **UX/UI Designer Agent**
  - Informa fluxos, _wireframes_, estados vazios, acessibilidade e feedback.
  - Sai com _UI kit_ de componentes reutilizáveis.
- **Artist (2D/3D) Agent**
  - Define linguagem visual, ícones, readability em velocidade, _FX_ não-intrusivos.
  - Entrega _sprite sheets_ / _atlases_ / guias de cores e escalas.
- **Sound Designer/Music Agent**
  - Plano de _SFX_ e música adaptativa por estado de jogo; _ducking_, _layers_ e _stingers_.
  - Entrega _cue sheet_ + _mix map_ (volumes e gatilhos).
- **QA/Test Agent**
  - Define cenários de teste por módulo, critérios de aprovação, testes de regressão e _soak tests_.
  - Reporta _defects_ vinculados a eventos/contratos quebrados.
- **Producer/Coordinator Agent**
  - Orquestra backlog, _Definition of Ready/Done_, integra _PRDs_, bloqueadores e cadência de _reviews_.

## 4) Protocolo de colaboração

**Entrada mínima (para qualquer tarefa)**

- **Contexto** (o que existe), **Objetivo** (resultado mensurável), **Restrições** (tempo/escopo/perf.), **Ambiente** (engine/tooling), **Métricas de aceitação** (checklist).

**Ciclo**

1. **Planejar**: cada agente publica _plano curto_ (o que vai entregar + impacto).
2. **Executar**: produzir artefato aderente ao contrato.
3. **Validar**: passar no checklist do módulo + _smoke tests_ integrados.
4. **Handoff**: anexar artefatos, comandos de teste e _changelog_ enxuto.

**Contratos & eventos (exemplo de estilo, não exaustivo)**

- `OnWeaponFired(weaponType, origin, dir)`
- `OnProjectileImpact(position, impactType)`
- `OnEnemyDied(position, xpReward, lootTableId)`
- `OnPlayerLevelUp(level, availableUpgrades[])`
- `OnPlayerHealthChanged(ratio)`  
  **Padrão de nome**: `On<Origin><Action>`; _payloads_ mínimos, estáveis e versionáveis.

## 5) Templates de prompt (por papel)

**Prompt geral (orquestrador)**

> “Atue como _time multidisciplinar_. Divida a resposta por papéis (Designer, Programmer/Architect, UX/UI, Artist, Sound, QA, Producer). Para cada papel: (1) decisões e porquês, (2) entregáveis concretos (listas, APIs, eventos, wireframes, _cue sheets_, checklists), (3) riscos/mitigações, (4) próximos passos. Termine com um plano integrado de 1–2 iterações.”

**Designer**

> “Proponha mecânicas e progressão alinhadas ao _core loop_. Traga 3 variações testáveis, hipóteses de diversão e métricas a observar. Produza uma _upgrade matrix_ enxuta (nível × efeito) e riscos de _power creep_.”

**Programmer/Architect**

> “Defina interfaces/ eventos/ dados para {módulo X}. Entregue: (a) esquema de eventos, (b) assinatura de APIs, (c) _stubs_ de testes, (d) _lint rules_ relevantes. Explique como evitar acoplamento e como testar em isolamento.”

**UX/UI**

> “Desenhe o fluxo e HUD para {situação}. Entregue: (a) estados, (b) feedbacks (erro/ok/cooldown), (c) regras de legibilidade em movimento, (d) acessibilidade e navegação por teclado.”

**Artist**

> “Defina linguagem visual (formas/tamanhos/contraste) para leitura a alta velocidade. Liste _sprites/atlases_ mínimos, _FX_ úteis e _no-gos_ visuais. Inclua guia de escala relativa (player × inimigo × projétil).”

**Sound**

> “Planeje SFX/música reativa para {estado}. Entregue _cue sheet_ (evento→som), prioridade/mix e variações curtas. Explique _ducking_ e _looping_ suave.”

**QA**

> “Liste testes por módulo e integrados para {feature}. Inclua critérios objetivos de aceite, _edge cases_ e _smoke test_ reproduzível. Proponha coleta de telemetria simples.”

## 6) Rubricas de validação (aceite)

- **Architecture**: nenhum módulo viola boundary; zero referência direta entre módulos que deveriam conversar por evento; contratos versionados.
- **Combat/Enemy**: dano/colisão consistentes; _cooldowns_ honrados; _spawn_ e _waves_ previsíveis.
- **Progression**: XP/level determinísticos, upgrades aplicados sem _side effects_ cruzados.
- **UX/UI**: HUD legível em movimento; estados vazios e erros tratados; interação por teclado/mouse fluida.
- **Audio**: eventos cobertos; volumes equilibrados; _loops_ sem _pops_.
- **Effects**: feedbacks visuais claros; sem poluição; custo por frame dentro do orçamento.
- **QA**: checklist passado; regressão básica; cenários críticos automatizados.

## 7) Padrões e escolhas técnicas

- **Arquitetura**: **modular monolith** com _eventing_; considerar ECS apenas onde há muitas entidades homogêneas; DI/Service-Locator para dependências.
- **Dados**: configurações de armas/itens/curvas fora do código.
- **Sistema de Módulos**: Utilizar exclusivamente Módulos ES6 (`import`/`export`). Não misturar com CommonJS (`require`/`module.exports`) ou `window` globals para garantir a análise estática e o tree-shaking pelo Vite.
- **Performance**: _pooling_ para projéteis/FX; _culling_ espacial simples; telemetria leve para gargalos.
- **Evolução**: reavaliar arquitetura quando _pain points_ surgirem (ex.: dificuldade de teste, cascata de bugs, queda de _fps_ sob carga).

## 8) Definition of Ready / Done

- **Ready**: objetivo mensurável, contexto mínimo, constraints claras, dependências resolvidas, eventos/contratos esboçados.
- **Done**: artefatos anexados, checklists verdes, _smoke test_ ok, _changelog_ curto, _roll-back_ previsto.

## 9) Como atualizar este arquivo

- Adicione novos eventos/contratos sem quebrar clientes; deprecie versões antigas explicitamente.
- Registre decisões arquiteturais (o que/por que/alternativas).
- Mantenha exemplos **curtos e genéricos**; remova datas/links e métricas voláteis.

## 10) Exemplos compactos (agnósticos)

**Ex. A — Nova arma**

- Eventos: `OnWeaponFired`, `OnProjectileImpact`.
- Contratos: `IWeapon.Fire(origin, dir)`, `IProjectile.Update(dt)`.
- Aceite: projéteis respeitam _lifetime_, _cooldown_ e colisão; UI mostra _cooldown_; áudio recebe `OnWeaponFired`.

**Ex. B — Wave de inimigos**

- Eventos: `OnWaveStarted(index)`, `OnEnemySpawned(type)`, `OnEnemyDied(...)`.
- Aceite: densidade alvo atingida; _spawn points_ válidos; queda de _fps_ dentro do orçamento; XP/loot emitidos corretamente.
