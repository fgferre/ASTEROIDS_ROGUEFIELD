# Frente 5: Remover Scaffolds de Producao e Wrappers de Baixo Valor

## Resumo
- Objetivo: retirar do runtime apenas o que ja esta confirmado como export morto, wrapper trivial ou scaffold de teste em [GamePools.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/GamePools.js), [ServiceRegistry.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/ServiceRegistry.js) e [DIContainer.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/DIContainer.js), sem expandir para outras frentes.
- Escopo: confirmar consumidores reais, limpar a superficie publica desses tres modulos e ajustar helpers/testes afetados para manter a cobertura.
- Nao-objetivos: nao mexer em logging/debug da frente 4, nao revisar `window.GamePools` ou `window.__gamePoolsDebug`, nao tocar em gameplay/rendering e nao atualizar documentacao historica em `docs/archive`.
- Equivalentes ja existentes encontrados antes de qualquer pasta/arquivo novo: `docs/plans`, `docs/archive/2025-plan/plans`, `docs/archive/2026-health-cleanup/plans`; em `docs/auditorias-racionalizacao` existe o arquivo de estado atual e a pasta `planos-estado-atual-2026-03-11/` com os planos `01` a `04`. Para testes, ja existem [tests/__helpers__/setup.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/setup.js), [tests/__helpers__/mocks.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/mocks.js) e [tests/__helpers__/stubs.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/stubs.js); nao existe helper dedicado de `game-session`.

## Mudancas Principais
- `GamePools`:
  - Confirmar como fato de remocao que nao ha consumidores em `src/` nem `tests/` para `BulletPool`, `ParticlePool`, `AsteroidPool`, `DronePool`, `MinePool`, `HunterPool`, `BossPool`, `XPOrbPool`, `ShockwavePool` e `TempObjectPool`.
  - Remover os aliases exportados por destructuring no fim do modulo e manter apenas `GamePools` como API publica.
  - Nao alterar o restante da inicializacao ou os pools reais; a mudanca aqui e so de superficie morta.
- `ServiceRegistry`:
  - Remover `exportDependencyGraph()`; a busca atual mostra zero consumidores e o caminho canonico passa a ser `container.generateDependencyGraph()` diretamente.
  - Remover `createTestContainer()` de producao. O unico consumidor direto hoje e [tests/__helpers__/setup.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/setup.js), que irradia para 16 arquivos de teste.
  - Reaproveitar `tests/__helpers__/setup.js` como ponto publico unico de `createTestContainer(seed)` para evitar churn nos consumidores atuais.
  - Reaproveitar `tests/__helpers__/mocks.js` para `event-bus` e `tests/__helpers__/stubs.js` para stubs reutilizaveis; adicionar nele o stub de `game-session`, ja que hoje nao ha equivalente.
  - Montar o conteiner de teste em helper de teste usando `DIContainer` diretamente e preservar os registros hoje necessarios: `event-bus`, `settings`, `audio`, `random`, `game-session` e overrides adicionais.
- `DIContainer`:
  - Substituir `getMigrationReport()` por `getServiceReport()` como API enxuta e coerente com o uso real.
  - Reduzir o retorno para dados vivos: `summary` e `services`; remover `legacyServices`, `containerServices` e `recommendations`, que hoje sao vazios ou redundantes.
  - Atualizar `debugLog()` para usar o novo relatorio e eliminar a secao de "migration recommendations".

## Impacto em Testes e Helpers
- Helpers afetados: [tests/__helpers__/setup.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/setup.js), [tests/__helpers__/mocks.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/mocks.js), [tests/__helpers__/stubs.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/stubs.js) e [tests/__helpers__/asteroid-helpers.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/__helpers__/asteroid-helpers.js).
- Testes impactados por `createTestContainer`: 16 arquivos, com uso concentrado em `tests/visual/*`, `tests/integration/determinism/*`, `tests/integration/gameplay/mixed-enemy-waves.test.js` e `tests/modules/ProgressionSystem.test.js`.
- Testes impactados por `getMigrationReport()`: apenas [tests/core/DIContainer.test.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/core/DIContainer.test.js).
- Nao ha impacto esperado em testes por remocao de aliases de `GamePools`, porque a busca atual nao encontrou consumidores em `src/` ou `tests/`.

## Riscos, Aceite e Validacao
- Riscos:
  - quebrar determinismo se o helper de teste nao preservar o contrato atual de `random`, `event-bus`, `audio`, `settings` e `game-session`;
  - quebrar uso ad hoc de desenvolvimento se existir consumidor externo nao versionado de `getMigrationReport()`;
  - confiar so em `npm run format:check`, que nao cobre `src/core/*`, `tests/__helpers__/*` nem este Markdown.
- Criterios de aceite:
  - busca repo-wide nao encontra mais `BulletPool`/aliases equivalentes, `ServiceRegistry.createTestContainer`, `ServiceRegistry.exportDependencyGraph` nem `getMigrationReport`;
  - `src/` nao contem mais stubs de teste de sessao/event bus no runtime;
  - `createTestContainer(seed)` continua disponivel via helper de teste e os consumidores atuais continuam usando o mesmo ponto de entrada;
  - `DIContainer.debugLog()` e [tests/core/DIContainer.test.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/tests/core/DIContainer.test.js) passam a refletir o novo relatorio enxuto.
- Validacao minima:
  - `npm test -- tests/core/DIContainer.test.js tests/modules/ProgressionSystem.test.js tests/integration/determinism/start-reset-cycle.test.js tests/integration/gameplay/mixed-enemy-waves.test.js`
  - `npm test`
  - `npm run validate:deps`
  - `npm run format:check`
  - `npx prettier --check` nos arquivos tocados e neste plano

## Pressupostos
- A frente 5 fica limitada aos itens ja confirmados na auditoria: aliases mortos de `GamePools`, `createTestContainer()` e `exportDependencyGraph()` em `ServiceRegistry`, e o relatorio ocioso de `DIContainer`.
- O helper publico de teste permanece em `tests/__helpers__/setup.js`; nenhum arquivo novo e necessario para o conteiner de teste se `mocks.js` e `stubs.js` forem reaproveitados.
- Este plano fica salvo em [05-scaffolds-wrappers-runtime.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/05-scaffolds-wrappers-runtime.md) para acompanhar os planos `01` a `04` ja presentes na mesma pasta.
