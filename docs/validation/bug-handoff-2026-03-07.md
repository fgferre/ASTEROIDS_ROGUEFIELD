# Handoff Consolidado de Validacao

Data base: 2026-03-07
Ultima consolidacao: 2026-03-09 (HV-05 fechado)

Objetivo: este e o unico handoff vivo do repositorio. Ele existe para reduzir custo de contexto da proxima IA.

## Como usar

1. Leia primeiro `Estado Atual`.
2. Trabalhe apenas os itens em `Fila Ativa`.
3. Trate `Itens Arquivados` como fechados, salvo nova evidencia concreta no codigo atual.
4. Nao reabra item arquivado por intuicao; reabra apenas com reproducao, teste ou leitura de fluxo contraditoria.

## Estado Atual

- Fonte unica de backlog, status e proximos passos: este arquivo.
- Itens realmente abertos hoje: `F4`, `F6`.
- Itens ja resolvidos e arquivados: `HV-01/02/03/04/05/06/07/08/09/10/11`, `LP-01`, `R1`, `F3`, `F9`, `F10`.
- Regra operacional: se surgir duvida sobre item arquivado, consultar o codigo atual primeiro; usar Git history so se a evidencia local for insuficiente.

## Fila Ativa

### F4 - Cadencia da fisica do menu reduzida para 30Hz

Status: IMPLEMENTADO COM EVIDENCIA LOCAL; falta validacao visual/runtime final
Prioridade: baixa

Estado atual:
- `world.step(1/30, delta, 1)` substituiu `world.step(1/60, delta, 3)`
- o teste dedicado prende essa configuracao em `animate()`
- benchmark local mediu reducao media de `48.8%` com 18 corpos e `51.0%` com 28 corpos no custo de `world.step`

Abrir primeiro:
- `src/modules/MenuBackgroundSystem.js:3912-3913`
- `tests/visual/menu-physics-stepping.test.js`

Fechar quando:
- houver smoke visual em browser confirmando ausencia de regressao perceptivel nas colisoes e fragmentacoes do menu

### F6 - Lazy-load/boot continua deferido por gate

Status: ABERTO, MAS DEFERIDO
Prioridade: media

Motivo de continuar aberto:
- ainda nao existe medicao de boot real confirmando ganho suficiente
- ainda nao existe mapa de dependencias confiavel para separar `menu-critical` de `gameplay-only`

Abrir primeiro:
- `src/bootstrap/serviceManifest.js`
- `src/app.js`

Fechar quando:
- existir profiling before/after com ganho claro
- existir mapa de dependencias que permita lazy-load sem regressao de menu, pause, retry, gameover ou retorno ao menu

## Itens Arquivados

Arquivados e nao devem ser reabertos sem nova evidencia no runtime atual:

- `HV-01`: listeners duplicados em subclasses de `BaseSystem` nao se confirmam mais; `EnemySystem` limpa handlers herdados antes de re-registrar.
- `HV-02`: HP do boss nao e mais sobrescrito; `HealthComponent.initialize()` respeita `enemy.healthInitialized`.
- `HV-03`: hipotese sobre `DIContainer.register(name, instance)` ficou obsoleta para a API atual.
- `HV-04`: duplicacao principal de pipeline de eventos do boss foi eliminada; `forwardBossEvent()` virou no-op.
- `HV-06`: determinismo de thruster/muzzle flash corrigido; teste em `tests/visual/thruster-determinism.test.js`.
- `HV-07`: stacking de screen shake corrigido.
- `HV-08`: drift de camera no menu corrigido.
- `HV-09`: primeiro shake voltou a respeitar o decay esperado.
- `HV-10`: `boss-wave-started` voltou a disparar feedback proprio sem reintroduzir duplicacao.
- `HV-11`: shake deixou de contaminar background e overlays full-screen; regressao coberta em `tests/visual/rendering-determinism.test.js`.
- `LP-01`: boss desenhado duas vezes nao se confirmou no runtime atual.
- `R1`: fade de material compartilhado corrigido; teste em `tests/visual/material-fade-isolation.test.js`.
- `F3`: `CustomFX` agora desliga quando `chromaticAberration` e `grainAmount` sao zero.
- `F9`: pool de `PointLight` para explosoes corrigido; teste em `tests/visual/explosion-light-pool.test.js`; benchmark local `0.0687ms -> 0.0031ms` por burst de 4 explosoes.
- `F10`: temporarios reutilizaveis aplicados em `fragmentAsteroid()` e hot paths de debris; benchmarks locais mostraram ganhos de `-22.9%`, `-26.6%` e `-13.7%` nos caminhos amostrados.
- `HV-05`: `Math.random()` eliminado de `createAtmosphere()`; fork `atmosphere` registrado em `randomForkLabels`; 4 chamadas substituidas por `rng.float()` via `ensureRandom('atmosphere')`; teste de determinismo em `tests/visual/menu-background-determinism.test.js` confirma rotacoes identicas e buffer de poeira identico entre duas runs com mesma seed, e ausencia de `Math.random()` no caminho.

## Evidencia Rapida

- Build validado durante a rodada de revalidacao: `npm run build`
- Testes direcionados que ja passaram nessa rodada:
  - `tests/visual/material-fade-isolation.test.js`
  - `tests/visual/thruster-determinism.test.js`
  - `tests/visual/explosion-light-pool.test.js`
  - `tests/visual/menu-physics-stepping.test.js`
  - `tests/visual/menu-background-determinism.test.js`
  - `tests/visual/rendering-determinism.test.js`

## Proxima IA

Ordem de trabalho recomendada:
1. `F4` (smoke visual em browser)
2. `F6` (profiling + mapa de dependencias)

Saida esperada:
1. dizer se cada item continua aberto, foi encerrado ou foi descartado
2. registrar evidencia curta
3. se houver mudanca, adicionar o teste/regressao minimo necessario
