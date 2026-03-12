# Frente 4 - Logging/debug residual

## Objetivos

- Padronizar o uso residual de logging/debug em `GamePools`, `ThrusterLoopManager` e `hudLayout`.
- Fechar guards ad hoc de ambiente nesses alvos sem ampliar escopo para outros dominios.
- Preservar `console.warn/error` apenas onde o contrato invalido ou a falha operacional precisam continuar visiveis.

## Equivalentes encontrados antes de criar pasta/arquivo

- Pastas de plano ja existentes:
  - [docs/plans](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/plans)
  - [docs/archive/2025-plan/plans](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/archive/2025-plan/plans)
  - [docs/archive/2026-health-cleanup/plans](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/archive/2026-health-cleanup/plans)
- Pasta-alvo ja existente:
  - [docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11)
- Frentes ja presentes no mesmo diretorio:
  - [01-tooling-superficie-oficial.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/01-tooling-superficie-oficial.md)
  - [02-hot-path-app-game-loop.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/02-hot-path-app-game-loop.md)
  - [03-contrato-schema-enemies.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/03-contrato-schema-enemies.md)
- Conclusao:
  - nao foi necessario criar nova pasta;
  - o arquivo correto desta frente e [04-logging-debug-residual.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/04-logging-debug-residual.md).

## Lista fechada de arquivos

- [src/core/GamePools.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/GamePools.js)
- [src/modules/ThrusterLoopManager.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/ThrusterLoopManager.js)
- [src/data/ui/hudLayout.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/ui/hudLayout.js)
- [docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/04-logging-debug-residual.md](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/04-logging-debug-residual.md)

## Escopo

- Fechar apenas incoerencias de logging/debug.
- Ajustar guards de debug, helper de inspecao manual e comportamento de warning residual.
- Manter o comportamento funcional de pools, loop de thruster e fallback de HUD.

## Nao-objetivos

- Nao refatorar outros `console.*` do repositorio.
- Nao tocar [src/core/ObjectPool.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/ObjectPool.js), [src/core/DIContainer.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/DIContainer.js), [src/core/EventBus.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/EventBus.js), [src/modules/AudioSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/modules/AudioSystem.js) ou [src/core/BaseSystem.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/BaseSystem.js).
- Nao alterar ciclo de vida de pools, contrato do HUD nem fluxo de audio alem do necessario para remover ruido de logging.

## Helpers canonicos e pontos aceitaveis de `console.*`

- `debugLog()` de [src/core/debugLogging.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/debugLogging.js):
  - usar para telemetria informativa e no-op debug-only.
- `isDebugLoggingEnabled()` de [src/core/debugLogging.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/core/debugLogging.js):
  - usar apenas quando o ramo monta payload custoso antes de logar.
- `isDevEnvironment()` de [src/utils/dev/GameDebugLogger.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/utils/dev/GameDebugLogger.js):
  - usar para expor superficies dev-only em `window`.
- `console.warn` aceitavel:
  - fallback de contrato invalido com frequencia limitada;
  - configuracao de lifecycle invalida em `GamePools`.
- `console.error` aceitavel:
  - falha real em `reconfigure()` de pool.
- `console.group/log/table` aceitavel:
  - apenas no helper manual de inspecao de `GamePools`, nunca em caminho automatico.

## Padronizacao minima por arquivo

### `GamePools`

- Remover guard ad hoc com `process.env.NODE_ENV` do dump de configuracao e usar `isDebugLoggingEnabled()`.
- Tratar `initialize()` duplicado como no-op debug-only via `debugLog()`.
- Limitar o warning de `update()` antes da inicializacao a uma emissao por sessao, evitando ruido por frame.
- Renomear o metodo manual `debugLog()` para `logPoolDiagnostics()` para eliminar a colisao semantica com o helper global.
- Expor `window.GamePools` e `window.__gamePoolsDebug` via `isDevEnvironment()`.
- Tornar `window.__gamePoolsDebug.logPoolDiagnostics()` o nome canonico e manter `debugLog` apenas como alias compativel.

### `ThrusterLoopManager`

- Remover `console.warn` de `startLoop()` para loop duplicado.
- Remover `console.warn` de `updateLoop()` para loop ausente.
- Manter ambos como guards silenciosos, porque representam idempotencia/race normal do fluxo do `AudioSystem`.

### `hudLayout`

- Manter fallback para `DEFAULT_HUD_LAYOUT_ID`.
- Manter `console.warn` por se tratar de contrato invalido na fronteira do catalogo.
- Limitar a emissao a uma vez por `id` invalido com `Set` local, espelhando o padrao de [src/data/shipModels.js](C:/Users/fgfer/OneDrive/Documents/GitHub/ASTEROIDS_ROGUEFIELD/src/data/shipModels.js).

## Riscos

- Uso manual antigo de `window.__gamePoolsDebug.debugLog` pode existir fora do repo; o alias compativel mitiga a quebra imediata.
- O `Set` de warn-once em `hudLayout` persiste no escopo do modulo e precisa ser considerado em qualquer teste futuro.
- A suite atual ja imprime logs de debug em alguns testes; validacoes devem mirar warnings especificos, nao silencio absoluto de console.

## Criterios de aceite

- `GamePools` deixa de misturar `process.env.NODE_ENV`, `debugLog()` e `console.*` em caminhos automaticos sem regra clara.
- `ThrusterLoopManager` nao emite `console.warn` residual.
- `hudLayout` continua fazendo fallback correto e alerta no maximo uma vez por layout invalido.
- A API manual de inspecao de `GamePools` deixa de usar o nome `debugLog()` na classe.
- Nenhum arquivo fora da lista fechada e alterado.

## Validacao minima

- Rerodar `npm test -- tests/core/shipModels.test.js`.
- Rerodar `npm test -- tests/visual/audio-determinism.test.js`.
- Smoke manual em dev:
  - chamar `window.__gamePoolsDebug.logPoolDiagnostics()`;
  - chamar `getHudLayoutDefinition('invalido')` duas vezes e verificar um unico warning;
  - exercitar start/update/stop de thruster e confirmar ausencia de warnings de loop duplicado/ausente.

## Baseline observada

- `npm test -- tests/core/shipModels.test.js` passou em 2026-03-11.
- `npm test -- tests/visual/audio-determinism.test.js` passou em 2026-03-11.
