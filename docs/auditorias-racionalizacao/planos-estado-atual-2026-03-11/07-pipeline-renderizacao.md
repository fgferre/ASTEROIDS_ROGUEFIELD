# Plano Arquitetural - Frente 7: Pipeline de Renderizacao

## Resumo

- Busca de equivalentes antes da criacao do arquivo:
  - `docs/auditorias-racionalizacao/` ja continha os planos `01` a `06`.
  - Referencias reutilizaveis encontradas: `docs/plans/architecture-master-plan.md`, `docs/archive/2025-plan/plans/phase3-game-session-service-plan.md`, `scripts/benchmarks/batch-rendering-benchmark.js`, `scripts/benchmarks/performance-baseline.js`, `docs/validation/enemy-rendering-visual-checklist.md` e `scripts/visual-enemy-rendering-test.html`.
  - Nao existia um plano especifico para a frente `07`; por isso este arquivo foi criado.
- Gargalo confirmado: `RenderingSystem` ainda delegava render direto para XP orbs, combat, inimigos e componentes pequenos; `renderBatchedCircles()` e `renderBatchedLines()` existiam, mas nao participavam do caminho vivo.
- Limites confirmados:
  - `RenderBatch` era um batcher de primitivas (`circle|line|rect|path`) e nao suportava `drawImage` nem transformacao por item.
  - `CanvasStateManager` deduplicava estilo/fase, mas nao era dono da pilha de transformacao; seu `save()/restore()` chamava o canvas real.
- Hotspots priorizados:
  - XP orbs com sprite cache, mas `drawImage()` por orb.
  - `CombatSystem` com trail/glow cacheados, mas ainda com transformacoes repetidas e overlays desenhados um a um.
  - Caminho vivo de asteroides via `RenderingSystem -> EnemySystem -> EnemyRenderSystem -> AsteroidRenderer -> Asteroid.draw`.
  - `HealthHeart` recriando gradientes e abrindo `save/restore` por entidade.

## Aprendizados da Primeira Execucao

- Nao assumir causalidade entre regressao visual e a nova pipeline sem auditar o worktree inteiro primeiro. Durante a primeira execucao havia varias mudancas abertas fora desta frente, inclusive em `EffectsSystem`, `EffectEntities`, `GamePools`, `ScreenShake`, `drawEnemyProjectile` e componentes de render de inimigos.
- Thrusters do player nao pertencem ao escopo desta frente:
  - `PlayerSystem` emite `thruster-effect`.
  - `EffectsSystem.spawnThrusterVFX()` materializa o efeito.
  - `EffectEntities.SpaceParticle` desenha as particulas.
  - Portanto, thrusters nao devem ser migrados para `SpriteBatch` nem usados como justificativa para alterar a pipeline sem evidencia direta.
- A primeira tentativa errou ao perseguir hipoteses especulativas de `setTransform`, restauracao de estado de canvas e comparacao visual indireta. Reexecucao futura deve bloquear qualquer "correcao" fora do plano original sem:
  - call graph do caminho real do efeito regressado
  - diff dos arquivos que realmente participam desse efeito
  - criterio objetivo de validacao antes/depois
- Nao usar screenshots/Playwright como substituto de diagnostico causal nesta frente. A validacao visual pode confirmar sintoma, mas nao deve orientar mudancas arquiteturais sem mapear ownership do render.
- Se reaparecer regressao em thrusters ou exhaust, interromper a frente 7 e abrir diagnostico separado, restrito a:
  - `PlayerSystem`
  - `EffectsSystem`
  - `EffectEntities`
  - `GamePools`
  - `RenderComponent`
  - `drawEnemyProjectile`
- Guardrail adicional: nenhuma mudanca em `EffectsSystem`, `EffectEntities`, `GamePools`, `PlayerSystem`, `RenderComponent`, `ScreenShake` ou `drawEnemyProjectile` faz parte desta frente sem aprovacao explicita baseada em evidencia do hot path.

## Objetivos

- Tornar a pipeline de renderizacao explicitamente bifurcada entre primitivas e sprites transformados.
- Reduzir `save/restore` e `translate/rotate` repetitivos nos caminhos quentes priorizados.
- Manter `CanvasStateManager` restrito a fase/estado e `RenderBatch` restrito a primitivas.
- Preservar fallback legado para casos nao migrados, sem duplo draw.

## Escopo

- `RenderingSystem` na fase `objects`.
- Contratos de producao de render para `XPOrbSystem`, `CombatSystem`, `EnemySystem/EnemyRenderSystem/AsteroidRenderer` e `HealthHeartSystem`.
- Instrumentacao e benchmark especificos para os hotspots reais de render.

## Nao-objetivos

- Migracao para WebGL ou reescrita do menu 3D.
- Redesign visual de player, boss ou effects.
- Limpeza repo-wide de todo `save/restore`.
- Unificacao de todos os caches visuais do projeto num unico servico.
- Diagnostico ou alteracao do sistema de particulas de thruster/exhaust.

## Opcoes, Tradeoffs e Recomendacao

| Opcao | Vantagem | Custo/Risco | Decisao |
|---|---|---|---|
| Estender `RenderBatch` para `drawImage`, rotacao e blending | Uma unica abstracao | API inchada e regressao alta em canvas 2D | Nao recomendada |
| Fazer apenas micro-otimizacoes locais | Menor churn imediato | Mantem duplicacao estrutural entre sistemas | Nao recomendada |
| Manter `RenderBatch` para primitivas e criar `SpriteBatch`/`RenderQueue` para sprites/trails | Casa com os hotspots reais e reaproveita caches existentes | Introduz segunda camada de render | Recomendada |

## Mudancas Arquiteturais

- `RenderBatch` passa a ter contrato explicito de batcher de primitivas. Nesta frente ele atende bullet cores e overlays pequenos.
- `CanvasStateManager` passa a ter contrato explicito de gestor de estilo/fase. `save()/restore()` ficam como wrapper de compatibilidade, nao como otimizacao de matriz.
- Novo nucleo `SpriteBatch`:
  - `beginFrame()`
  - `addSprite(command)`
  - `addStretchedSprite(command)`
  - `flush(ctx, stateManager)`
- Novo contrato de produtor:
  - produtores priorizados expoem `emitRenderCommands(renderer)` ou subpasses equivalentes.
  - `render(ctx)` permanece como fallback.
- `RenderingSystem` passa a operar com subpasses batchados por produtor:
  - sprites/trails via `SpriteBatch`
  - primitivas via `RenderBatch`
  - callbacks diretos apenas para casos que nao cabem no batch, como overlays especificos.

## Sequencia de Migracao

1. Baseline e contrato
- Registrar que `batch-rendering-benchmark.js` e `performance-baseline.js` sao sinteticos e insuficientes para os hotspots reais.
- Expor `spriteBatchStats` junto das metricas ja publicadas por `RenderingSystem`.

2. XPOrbSystem
- Reaproveitar `visualCache` e `ensureOrbSprite()`.
- Emitir comandos de sprite no caminho vivo.
- Manter fallback legado quando o sprite nao puder ser materializado.

3. CombatSystem
- Reaproveitar `ensureBulletTrailSegmentCache()` e `ensureBulletGlowCache()`.
- Separar o render de combate em tres subpasses:
  - projectiles do jogador via batch
  - enemy bullets diretas
  - overlays de lock/prediction via batch de primitivas
- Remover `save/restore` internos do hot path dos trails/locks mesmo no fallback.

4. Asteroides
- `EnemySystem` passa a expor `emitRenderCommands(renderer)`.
- `EnemyRenderSystem` delega ao `AsteroidRenderer`.
- `AsteroidRenderer` deixa de ser so uma facade de `asteroid.draw(ctx)` e vira tradutor para sprite commands.
- `Asteroid.draw()` permanece como fallback legado e caminho de construcao do sprite cache.

5. Componentes pequenos
- `HealthHeart` passa a usar sprite prerenderizado com escala de pulso, sem reconstruir gradientes por entidade.
- `HealthHeartSystem` emite sprite commands quando possivel.

## Riscos

- Regressao de ordem visual com `lighter`.
- Vazamento de estado se `setTransform` nao voltar para identidade.
- Invalidacao incorreta de cache para crack stages de asteroides.
- Alocacao excessiva de comandos se o pool do batch nao for reaproveitado.
- Rollout parcial gerar duplo draw entre path batchado e fallback.
- Worktree sujo induzir falsa atribuicao de regressao a esta frente.
- Regressao visual em sistemas fora do escopo ser "corrigida" por tentativa e erro dentro da pipeline.

## Criterios de Aceite

- Limites de `RenderBatch` e `CanvasStateManager` ficam explicitos no proprio codigo.
- `RenderingSystem` publica metricas do `SpriteBatch` e usa batch no caminho vivo dos produtores priorizados.
- XP orbs deixam de chamar `drawImage()` diretamente no steady state do renderer.
- `CombatSystem` deixa de abrir `save/restore` internos para trails/locks no hot path.
- Asteroides deixam de depender de `Asteroid.draw()` como caminho principal por frame.
- `HealthHeart` deixa de recompor gradientes com `save/restore` por entidade.

## Validacao Minima

- Gate automatizado basico:
  - `npm test -- --run tests/visual/rendering-determinism.test.js tests/modules/RenderingSystem.starfield.test.js`
- Cobertura nova da frente:
  - `npm test -- --run tests/core/SpriteBatch.test.js tests/modules/render-producers.test.js`
- Benchmark/harness especifico:
  - `scripts/benchmarks/render-pipeline-hotspots-benchmark.js`
  - cenarios: XP orbs densos, combat com trails/locks, muitos asteroides e hearts.
- Validacao de ownership antes de qualquer correcao de regressao:
  - listar os arquivos que emitem, atualizam e desenham o efeito afetado
  - provar que o efeito passa pelo codigo alterado nesta frente antes de implementar correcoes
- Validacao manual:
  - run com coleta massiva de XP
  - disparo continuo com targeting
  - asteroides em alta densidade
  - pickups/hearts em tela
  - conferencia de ordem de blend e ausencia de vazamento de estado do canvas
  - sanity check explicito de que thrusters do player e exhaust de inimigos nao foram tocados por esta frente

## Defaults

- Renderer alvo permanece Canvas 2D.
- `GradientCache` continua focado em gradientes/canvases compartilhados; esta frente nao unifica todos os caches per-system nele.
- Fallback legado continua ativo enquanto houver casos nao representados pelo produtor batchado.
