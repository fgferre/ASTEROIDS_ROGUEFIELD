**Arquivo recomendado para salvar:** docs/auditorias-racionalizacao/auditoria-profunda-codebase-estado-atual-2026-03-11.md

# Auditoria Profunda do Codebase - Estado Atual e Proximos Passos

**Repositorio:** ASTEROIDS_ROGUEFIELD  
**Atualizado em:** 2026-03-11  
**Objetivo:** orientar proximas IAs apenas pelo estado atual do codebase, pelas pendencias reais e pelas cautelas de cleanup.

## Resumo executivo

As limpezas mais evidentes da racionalizacao anterior ja avancaram: `gsap.min.js` saiu, `Stats.min.js` ficou dev-only, o HUD multi-layout falso foi removido, `settingsSchema.js` passou a derivar hulls do catalogo canonico, `schema.js` foi rebaixado para modulo de referencia e parte do debug residual saiu do bootstrap.

O trabalho restante esta concentrado em sete frentes reais:

1. tooling heuristico que ainda precisa explicitar limites e superficie oficial;
2. duplicacao de sincronizacao e leitura de estado no `gameLoop()` de `app.js`;
3. contrato incompleto de `validateEnemyConfig()` em `schema.js`;
4. inconsistencias residuais de logging/debug em modulos ja racionalizados;
5. codigo de teste, wrappers de baixo valor e exports mortos ainda presentes em producao;
6. duplicacao de modelos e contratos em pools, particulas e colisao;
7. gargalos reais na pipeline de renderizacao;
8. decomposicao incremental dos monolitos principais.

## Pendencias prioritarias

### 1. Consolidar o tooling como fonte confiavel de manutencao

**Estado atual**
- [scripts/analyze-dependencies.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/analyze-dependencies.js) ja extrai `<script>` de HTML, mas continua sendo um analisador baseado em regex e ainda nao documenta claramente o que detecta e o que nao detecta.
- [scripts/validate-test-optimizations.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/validate-test-optimizations.js) esta corretamente rebaixado para uso advisory.
- [scripts/validate-object-pooling.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/validate-object-pooling.js), [scripts/validate-performance.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/validate-performance.js) e os scripts em [scripts/benchmarks/](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/scripts/benchmarks/) continuam como ferramentas manuais, fora da superficie oficial de validacao.
- `format` e `format:check` em [package.json](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/package.json) usam lista explicita de arquivos. O gate esta saneado, mas novos arquivos relevantes ainda exigem inclusao manual.

**O que fazer**
- documentar no proprio `analyze-dependencies.js` quais tipos de dependencia ele enxerga e quais nao enxerga;
- manter `validate:deps` como sinal complementar, nao como oraculo duro, enquanto o parser continuar heuristico;
- decidir explicitamente se os scripts manuais ficam apenas documentados ou se algum deles vira comando oficial do projeto;
- definir se o gate de formatacao continua por allowlist manual ou se, no medio prazo, migra para glob + `.prettierignore`.

**Criterio de aceite**
- nenhuma IA futura precisa inferir limites do tooling lendo implementacao inteira;
- os comandos oficiais do projeto ficam claramente separados de utilitarios manuais;
- a manutencao do gate de formatacao deixa de depender de memoria informal.

### 2. Simplificar o hot path de `app.js`

**Estado atual**
- [src/app.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/app.js) ainda usa `synchronizeSessionState()` e `getSessionFrameState()` para ler o mesmo dominio de estado no `gameLoop()`.
- Isso mantem branching e `try/catch` redundantes no entrypoint principal.

**O que fazer**
- colapsar a sincronizacao e a leitura de frame para um contrato unico;
- deixar `gameLoop()` dependente de um snapshot coerente por frame, sem espelhar e reler o mesmo estado em blocos separados.

**Criterio de aceite**
- um unico caminho define `screen`, `isPaused` e `isRunning` por frame;
- o `gameLoop()` fica menor e sem duplicacao sem alterar comportamento.

### 3. Fechar o contrato de `schema.js`

**Estado atual**
- [src/data/enemies/schema.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/enemies/schema.js) hoje ja se declara explicitamente como modulo de referencia/tipos e usa `dependency-analyzer: ignore-orphan`.
- Mesmo assim, `validateEnemyConfig()` continua exportada sem consumidor no runtime e mantem uma ambiguidade sobre qual e o papel real do arquivo.

**O que fazer**
- decidir se `validateEnemyConfig()` vira parte de um fluxo real de validacao ou sai do modulo;
- se a funcao continuar apenas como helper de manutencao, deixar isso explicito tambem no contrato publico do arquivo e nas docs vivas relevantes.

**Criterio de aceite**
- `schema.js` deixa de sugerir capacidade de validacao que nao entrega em runtime;
- a funcao deixa de ser pendencia ambigua.

### 4. Fechar inconsistencias residuais de logging e debug

**Estado atual**
- [src/modules/ThrusterLoopManager.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/ThrusterLoopManager.js) ainda tem `console.warn` direto para estados de loop ja ativo ou ausente.
- [src/data/ui/hudLayout.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/ui/hudLayout.js) ainda usa `console.warn` em fallback de layout invalido.
- [src/core/GamePools.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/GamePools.js) ainda mistura `debugLog`, `console.warn`, `console.group/log` e checks baseados em `process.env.NODE_ENV === 'development'`.
- Em `GamePools`, o metodo estatico `debugLog()` ainda concorre em nome com o helper importado `debugLog()` de [src/core/debugLogging.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/debugLogging.js), o que piora a leitura.

**O que fazer**
- padronizar logs residuais em `ThrusterLoopManager`, `hudLayout` e `GamePools` com a estrategia ja adotada no restante do projeto;
- substituir checks de debug ad hoc em `GamePools` por um criterio unico coerente com o projeto;
- renomear o metodo de inspeccao de `GamePools` se ele continuar existindo, para evitar colisao semantica com o helper global de debug.

**Criterio de aceite**
- modulos ja racionalizados deixam de carregar logging residual inconsistente;
- nao sobra mistura arbitraria de `console.*`, `debugLog()` e guards diferentes no mesmo dominio.

### 5. Remover scaffolds de producao e wrappers de baixo valor

**Estado atual**
- [src/core/GamePools.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/GamePools.js) ainda exporta aliases como `BulletPool`, `ParticlePool` e similares via destructuring de `GamePools` no nivel de modulo. Como a destructuring ocorre quando as propriedades da classe ainda sao `null`, esses exports nascem nulos e nao acompanham a inicializacao posterior. Nao ha consumidores encontrados em `src/` ou `tests/`.
- [src/core/ServiceRegistry.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/ServiceRegistry.js) ainda carrega `createTestContainer()` com stub substancial de `game-session` dentro do codigo de producao. Hoje o metodo e acionado a partir de [tests/__helpers__/setup.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/setup.js).
- O mesmo `ServiceRegistry` ainda expoe `exportDependencyGraph()` como wrapper trivial sobre `container.generateDependencyGraph()`, sem consumidores encontrados.
- [src/core/DIContainer.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/DIContainer.js) ainda expoe `getMigrationReport()`, mas o relatorio mantem `legacyServices` e `recommendations` sempre vazios. Ele ainda aparece em testes e no metodo de debug, entao qualquer simplificacao exige ajuste coordenado.

**O que fazer**
- remover os exports mortos de `GamePools`;
- mover `createTestContainer()` para helpers de teste e deixar o codigo de producao livre de stub de sessao;
- remover `ServiceRegistry.exportDependencyGraph()` se continuar sem consumidores;
- reavaliar `DIContainer.getMigrationReport()`: simplificar, renomear ou retirar o enquadramento de "migration" se o relatorio continuar sem semantica real.

**Criterio de aceite**
- o runtime deixa de carregar scaffolds ou exports mortos sem valor operacional;
- APIs auxiliares passam a ter papel claro ou saem da superficie do projeto.

### 6. Consolidar duplicacoes reais de modelo e contrato

**Estado atual**
- [src/core/GamePools.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/GamePools.js) ainda cria particulas pooled com factory inline propria, enquanto [src/modules/EffectEntities.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EffectEntities.js) define `SpaceParticle` com comportamento visual mais rico. [src/modules/EffectsSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EffectsSystem.js) hoje usa ambos os caminhos.
- [src/utils/mathHelpers.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/utils/mathHelpers.js) ja tem helper canonico, mas ainda existem `clamp01()` locais e varios `Math.max(0, Math.min(1, ...))` espalhados em [src/modules/MenuBackgroundSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/MenuBackgroundSystem.js), [src/modules/EffectsSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EffectsSystem.js), [src/modules/enemies/components/RenderComponent.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/components/RenderComponent.js) e outros pontos.
- No gameplay 2D, a duplicacao mais concreta esta entre [src/modules/enemies/components/AsteroidCollision.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/components/AsteroidCollision.js) e o fallback legado em [src/modules/enemies/systems/EnemyUpdateSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/systems/EnemyUpdateSystem.js), que ainda mantem logica propria para colisao asteroid-asteroid.
- [src/modules/enemies/components/CollisionComponent.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/components/CollisionComponent.js) pertence ao mesmo macrodominio de gameplay, mas cumpre papel diferente: ele concentra checagem por raio/ponto e respostas genericas como `bounce`, `damage`, `destroy` e `trigger`. O risco aqui e fronteira arquitetural difusa, nao tres implementacoes identicas do mesmo caso.
- A fisica do menu 3D em [src/modules/MenuBackgroundSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/MenuBackgroundSystem.js), baseada em `CANNON.World` e eventos `collide`, e um dominio separado e nao faz parte desta frente de consolidacao.

**O que fazer**
- decidir qual modelo de particula pooled sera canonico e reduzir o projeto para um caminho principal;
- consolidar `clamp` de forma localizada, sem churn repo-wide;
- documentar explicitamente as fronteiras entre colisao 2D de gameplay e fisica 3D do menu;
- dentro do gameplay, separar o que e colisao asteroid-asteroid duplicada e o que e contrato generico de resposta antes de qualquer consolidacao.

**Criterio de aceite**
- cada dominio passa a ter menos de uma implementacao concorrente sem justificativa clara;
- a consolidacao de utilitarios nao vira refactor cosmetico em massa;
- a parte de colisao ganha mapa arquitetural antes de qualquer remocao, sem misturar menu 3D com gameplay 2D.

### 7. Tratar os gargalos reais da pipeline de renderizacao

**Estado atual**
- [src/modules/RenderingSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/RenderingSystem.js) instancia [src/core/RenderBatch.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/RenderBatch.js) e [src/core/CanvasStateManager.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/CanvasStateManager.js), e usa `transitionToPhase()` no loop principal.
- Apesar disso, os helpers de batching disponiveis em `RenderingSystem` (`renderBatchedCircles()` e `renderBatchedLines()`) aparecem apenas como utilitarios locais e nao participam do caminho principal de render atual.
- O proprio `RenderBatch` hoje so cobre `circle`, `line`, `rect` e `path`; ele nao suporta batching direto de `drawImage`, sprites rotacionados, transformacoes por item ou trails com blending aditivo.
- O proprio `CanvasStateManager` reduz mudancas redundantes de propriedades, mas seu `save()`/`restore()` ainda chama `ctx.save()`/`ctx.restore()` de verdade e ele nao abstrai a pilha de transformacoes. Portanto, ele ajuda no estado, mas nao elimina sozinho o custo matricial do canvas.
- Existem hoje 54 chamadas de `ctx.save()` no repositório de `src/` e 13 delas estao em [src/modules/RenderingSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/RenderingSystem.js).
- [src/modules/XPOrbSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/XPOrbSystem.js) usa sprite cache, mas ainda faz `drawImage()` por orb no loop de render.
- [src/modules/CombatSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/CombatSystem.js) ainda faz render direto de bullets e trails, com `Math.hypot`, `Math.atan2`, `translate`, `rotate`, `drawImage` e multiplos `save/restore` por frame.
- [src/modules/enemies/components/AsteroidRenderer.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/components/AsteroidRenderer.js) ainda e um wrapper fino que delega para `asteroid.draw(ctx)`, e [src/modules/enemies/types/Asteroid.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/types/Asteroid.js) continua concentrando `save`, `translate`, `rotate`, `globalCompositeOperation` e `drawImage` por entidade.
- Ate componentes pequenos como [src/modules/collectibles/HealthHeart.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/collectibles/HealthHeart.js) ainda fazem `save/restore` por render.

**Leitura correta**
- O diagnostico de gargalo e valido: a infraestrutura de renderizacao esta mais avancada do que o uso real dela.
- A solucao proposta no relatorio secundario era otimista demais ao sugerir migracao direta de XP orbs, tiros e asteroides para `RenderBatch`.
- Antes disso, o projeto precisa decidir se expande `RenderBatch` para sprites transformados e `drawImage`, ou se cria uma camada propria para batching de sprites/trails.

**O que fazer**
- tratar a frente de renderizacao como trabalho arquitetural especifico, nao como troca mecanica de chamadas de canvas por `RenderBatch`/`CanvasStateManager`;
- priorizar os pontos com maior churn por frame:
  - render de XP orbs;
  - trails e lock indicators de `CombatSystem`;
  - caminho de render dos asteroides;
  - componentes pequenos com `save/restore` repetitivo, como `HealthHeart`;
- decidir se `RenderBatch` sera estendido para sprites, transformacoes e blending, ou se continuara restrito a primitivas geometricas.

**Criterio de aceite**
- a pipeline principal passa a usar batching real onde a infraestrutura suportar o caso de uso;
- o projeto reduz `save/restore` e mudancas de estado onde elas sao repetitivas e evitaveis;
- a estrategia escolhida para sprites/trails fica explicita antes de novas refatoracoes de render.

### 8. Retomar a decomposicao incremental dos monolitos principais

**Estado atual**

| Arquivo | Linhas atuais | Observacao |
|---|---:|---|
| [src/modules/AudioSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/AudioSystem.js) | 3935 | ainda concentra musica, file tracks, loops, preload, perf e integracao |
| [src/modules/MenuBackgroundSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/MenuBackgroundSystem.js) | 3929 | mistura render 3D, fisica, loading e assets do menu |
| [src/modules/EffectsSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EffectsSystem.js) | 3629 | ainda concentra particulas, shockwaves, freeze frame, flash e utilitarios |
| [src/modules/EnemySystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EnemySystem.js) | 3487 | segue como fachada pesada de integracao |
| [src/modules/enemies/managers/WaveManager.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/enemies/managers/WaveManager.js) | 2670 | progressao, boss e compatibilidade ainda juntos |

**Ja extraido**
- [src/modules/EffectEntities.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/EffectEntities.js)
- [src/modules/ThrusterLoopManager.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/ThrusterLoopManager.js)

**Proximos candidatos coerentes**
- extrair de `AudioSystem` um manager focado apenas em file tracks;
- extrair de `EffectsSystem` um controller focado em screen effects, como shake, freeze frame, flash e time dilation.

**Criterio de aceite**
- cada extracao reduz responsabilidade e leitura necessaria do modulo original;
- os novos modulos ficam testaveis e com contrato claro;
- novas extracoes nao tentam resolver varios dominios ao mesmo tempo.

## Itens que nao devem virar cleanup cego

### Feature flags legacy de waves

Os caminhos ligados a `USE_WAVE_MANAGER` e overrides via `globalThis` ainda sao contrato ativo de teste e compatibilidade. Antes de qualquer remocao, a proxima IA precisa registrar:

1. se o produto ainda quer preservar override/runtime fallback;
2. se os testes atuais documentam contrato vivo ou apenas divida historica;
3. qual sera a estrategia de transicao.

Sem essa decisao, o maximo seguro e:
- consolidar testes duplicados;
- documentar o contrato atual;
- reduzir ruido ao redor sem apagar os caminhos.

### `cannon.min.js`

[src/index.html](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/index.html) ainda carrega `cannon.min.js` porque [src/modules/MenuBackgroundSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/MenuBackgroundSystem.js) usa `CANNON.World`, `Body`, `Sphere` e `Vec3`. Nao remover sem refatorar esse sistema antes.

### Assets de estudo, benchmarks e validadores manuais

Os estudos em `assets/` e os benchmarks/validadores manuais ainda estao mantidos intencionalmente como referencia. So devem sair da arvore viva com decisao explicita, nao como "limpeza automatica".

## Ordem recomendada para os proximos planos

1. Documentar limites de `analyze-dependencies.js` e confirmar a politica do gate de formatacao.
2. Colapsar a duplicacao de estado no `gameLoop()` de [src/app.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/app.js).
3. Fechar o contrato de `validateEnemyConfig()` em [src/data/enemies/schema.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/enemies/schema.js).
4. Limpar inconsistencias residuais de logging/debug em `GamePools`, `ThrusterLoopManager` e `hudLayout`.
5. Remover exports mortos e mover scaffolds de teste para fora do runtime.
6. Consolidar o modelo de particulas e documentar a sobreposicao de colisao.
7. Definir a estrategia da pipeline de renderizacao antes de batching mais agressivo.
8. Retomar extracoes pequenas nos monolitos.

## Validacao minima por frente

- `npm test`
- `npm run format:check`
- `npm run validate:deps`
- `npm run test:validate-optimizations`
- verificacao manual do bootstrap/menu quando houver mudanca em `src/index.html`, `src/app.js` ou `src/modules/MenuBackgroundSystem.js`

## Uso correto deste documento

Este arquivo deve ser tratado como **status operacional atual**, nao como historico. Cada proxima IA deve derivar um plano pequeno, com lista fechada de arquivos, criterio de aceite e validacao minima. Nao executar este documento como backlog linear unico.
