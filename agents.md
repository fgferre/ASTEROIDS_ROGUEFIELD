# agents.md

> **Propósito**: guiar IAs (ou humanos) trabalhando como um *time multidisciplinar* para projetar, implementar, polir e validar um jogo 2D com progressão roguelike e combate arcade — em **arquitetura modular**, com **comunicação desacoplada por eventos** e **entregas verificáveis**.  
> **Escopo**: engine-agnóstico, metas atemporais, sem dependências de versões, marcas ou métricas específicas.

## 1) Princípios que não envelhecem
1. **Modularidade explícita**: responsabilidades pequenas, coesas, com fronteiras publicadas.  
2. **Desacoplamento por eventos**: comunicação preferencial via *Event Bus* / *Message Hub* + interfaces; evitar referências diretas cruzadas.  
3. **Evoluir em passos curtos**: primeiro fazer funcionar, depois fazer direito, depois otimizar; refatorar quando a dor justificar.  
4. **Testabilidade como norte**: cada módulo com pontos de prova, estados observáveis e *fixtures* simples.  
5. **Dados fora do código**: estatísticas/balanceamento em *data assets* (config), sempre que viável.  
6. **Validação contínua**: cada entrega acompanha checklist objetivo de aceitação.

## 2) Mapa de módulos (boundaries)
- **Player**: input, movimento, estados básicos e sinais de intenção. *Não* gerencia armas, progresso, UI, áudio.  
- **Combat**: armas, projéteis, cálculo de dano e *cooldowns*. *Não* decide AI nem toca som/UI.  
- **Enemy**: AI, spawning, *waves* e comportamento. *Não* calcula dano nem UI.  
- **Progression**: XP/nível, upgrades, *loot* e meta-progressão. *Não* desenha UI nem implementa arma.  
- **UI**: HUD/menus/feedback visual na interface. *Não* contém regra de jogo.  
- **Audio**: SFX/música/adaptação dinâmica, disparado por eventos. *Não* decide *quando* ocorrer algo.  
- **World**: colisões, limites, geração/gestão espacial. *Não* implementa lógica de entidades.  
- **Effects**: partículas, *screen shake*, pós-processo e animações não-UI. *Não* contém lógica de gameplay.

> **Regra de ouro**: módulos conversam por **eventos e interfaces**, não por referências diretas.

## 3) Papéis (Agentes) e responsabilidades
- **Game Designer Agent**  
  - Propõe mecânicas, *loops*, progressão e balanceamento.  
  - Entrega *design notes* com hipóteses, riscos e telemetria a coletar.
- **Programmer/Architect Agent**  
  - Define APIs, eventos, contratos e *patterns* (ex.: Strategy/Factory/Observer/DI).  
  - Garante isolamento, testes e *lint*; cuida do *tech-debt ledger*.
- **UX/UI Designer Agent**  
  - Informa fluxos, *wireframes*, estados vazios, acessibilidade e feedback.  
  - Sai com *UI kit* de componentes reutilizáveis.
- **Artist (2D/3D) Agent**  
  - Define linguagem visual, ícones, readability em velocidade, *FX* não-intrusivos.  
  - Entrega *sprite sheets* / *atlases* / guias de cores e escalas.
- **Sound Designer/Music Agent**  
  - Plano de *SFX* e música adaptativa por estado de jogo; *ducking*, *layers* e *stingers*.  
  - Entrega *cue sheet* + *mix map* (volumes e gatilhos).
- **QA/Test Agent**  
  - Define cenários de teste por módulo, critérios de aprovação, testes de regressão e *soak tests*.  
  - Reporta *defects* vinculados a eventos/contratos quebrados.
- **Producer/Coordinator Agent**  
  - Orquestra backlog, *Definition of Ready/Done*, integra *PRDs*, bloqueadores e cadência de *reviews*.

## 4) Protocolo de colaboração
**Entrada mínima (para qualquer tarefa)**  
- **Contexto** (o que existe), **Objetivo** (resultado mensurável), **Restrições** (tempo/escopo/perf.), **Ambiente** (engine/tooling), **Métricas de aceitação** (checklist).

**Ciclo**  
1. **Planejar**: cada agente publica *plano curto* (o que vai entregar + impacto).  
2. **Executar**: produzir artefato aderente ao contrato.  
3. **Validar**: passar no checklist do módulo + *smoke tests* integrados.  
4. **Handoff**: anexar artefatos, comandos de teste e *changelog* enxuto.

**Contratos & eventos (exemplo de estilo, não exaustivo)**  
- `OnWeaponFired(weaponType, origin, dir)`  
- `OnProjectileImpact(position, impactType)`  
- `OnEnemyDied(position, xpReward, lootTableId)`  
- `OnPlayerLevelUp(level, availableUpgrades[])`  
- `OnPlayerHealthChanged(ratio)`  
**Padrão de nome**: `On<Origin><Action>`; *payloads* mínimos, estáveis e versionáveis.

## 5) Templates de prompt (por papel)

**Prompt geral (orquestrador)**  
> “Atue como *time multidisciplinar*. Divida a resposta por papéis (Designer, Programmer/Architect, UX/UI, Artist, Sound, QA, Producer). Para cada papel: (1) decisões e porquês, (2) entregáveis concretos (listas, APIs, eventos, wireframes, *cue sheets*, checklists), (3) riscos/mitigações, (4) próximos passos. Termine com um plano integrado de 1–2 iterações.”

**Designer**  
> “Proponha mecânicas e progressão alinhadas ao *core loop*. Traga 3 variações testáveis, hipóteses de diversão e métricas a observar. Produza uma *upgrade matrix* enxuta (nível × efeito) e riscos de *power creep*.”

**Programmer/Architect**  
> “Defina interfaces/ eventos/ dados para {módulo X}. Entregue: (a) esquema de eventos, (b) assinatura de APIs, (c) *stubs* de testes, (d) *lint rules* relevantes. Explique como evitar acoplamento e como testar em isolamento.”

**UX/UI**  
> “Desenhe o fluxo e HUD para {situação}. Entregue: (a) estados, (b) feedbacks (erro/ok/cooldown), (c) regras de legibilidade em movimento, (d) acessibilidade e navegação por teclado.”

**Artist**  
> “Defina linguagem visual (formas/tamanhos/contraste) para leitura a alta velocidade. Liste *sprites/atlases* mínimos, *FX* úteis e *no-gos* visuais. Inclua guia de escala relativa (player × inimigo × projétil).”

**Sound**  
> “Planeje SFX/música reativa para {estado}. Entregue *cue sheet* (evento→som), prioridade/mix e variações curtas. Explique *ducking* e *looping* suave.”

**QA**  
> “Liste testes por módulo e integrados para {feature}. Inclua critérios objetivos de aceite, *edge cases* e *smoke test* reproduzível. Proponha coleta de telemetria simples.”

## 6) Rubricas de validação (aceite)

- **Architecture**: nenhum módulo viola boundary; zero referência direta entre módulos que deveriam conversar por evento; contratos versionados.  
- **Combat/Enemy**: dano/colisão consistentes; *cooldowns* honrados; *spawn* e *waves* previsíveis.  
- **Progression**: XP/level determinísticos, upgrades aplicados sem *side effects* cruzados.  
- **UX/UI**: HUD legível em movimento; estados vazios e erros tratados; interação por teclado/mouse fluida.  
- **Audio**: eventos cobertos; volumes equilibrados; *loops* sem *pops*.  
- **Effects**: feedbacks visuais claros; sem poluição; custo por frame dentro do orçamento.  
- **QA**: checklist passado; regressão básica; cenários críticos automatizados.

## 7) Padrões e escolhas técnicas
- **Arquitetura**: **modular monolith** com *eventing*; considerar ECS apenas onde há muitas entidades homogêneas; DI/Service-Locator para dependências.  
- **Dados**: configurações de armas/itens/curvas fora do código.  
- **Performance**: *pooling* para projéteis/FX; *culling* espacial simples; telemetria leve para gargalos.  
- **Evolução**: reavaliar arquitetura quando *pain points* surgirem (ex.: dificuldade de teste, cascata de bugs, queda de *fps* sob carga).

## 8) Definition of Ready / Done
- **Ready**: objetivo mensurável, contexto mínimo, constraints claras, dependências resolvidas, eventos/contratos esboçados.  
- **Done**: artefatos anexados, checklists verdes, *smoke test* ok, *changelog* curto, *roll-back* previsto.

## 9) Como atualizar este arquivo
- Adicione novos eventos/contratos sem quebrar clientes; deprecie versões antigas explicitamente.  
- Registre decisões arquiteturais (o que/por que/alternativas).  
- Mantenha exemplos **curtos e genéricos**; remova datas/links e métricas voláteis.

## 10) Exemplos compactos (agnósticos)

**Ex. A — Nova arma**  
- Eventos: `OnWeaponFired`, `OnProjectileImpact`.  
- Contratos: `IWeapon.Fire(origin, dir)`, `IProjectile.Update(dt)`.  
- Aceite: projéteis respeitam *lifetime*, *cooldown* e colisão; UI mostra *cooldown*; áudio recebe `OnWeaponFired`.

**Ex. B — Wave de inimigos**  
- Eventos: `OnWaveStarted(index)`, `OnEnemySpawned(type)`, `OnEnemyDied(...)`.  
- Aceite: densidade alvo atingida; *spawn points* válidos; queda de *fps* dentro do orçamento; XP/loot emitidos corretamente.
