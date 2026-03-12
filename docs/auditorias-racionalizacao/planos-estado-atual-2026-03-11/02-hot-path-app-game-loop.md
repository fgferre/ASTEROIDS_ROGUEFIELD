# Frente 2 - Simplificar o Hot Path de `app.js`

## Objetivo

Eliminar a duplicacao de sincronizacao e leitura de estado no hot path do
`gameLoop()` para que cada frame resolva `screen`, `isPaused` e `isRunning`
por um unico caminho local em `src/app.js`, sem alterar o contrato publico de
`game-session`.

## Diagnostico Confirmado

- Equivalentes encontrados antes de criar este arquivo:
  `docs/plans/`,
  `docs/auditorias-racionalizacao/auditoria-profunda-codebase-estado-atual-2026-03-11.md`
  e
  `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/01-tooling-superficie-oficial.md`.
- A pasta
  `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/` ja existia
  no worktree e nao precisou ser recriada.
- `src/app.js` chamava `synchronizeSessionState(currentTime, session)` e depois
  `getSessionFrameState(session)` no mesmo frame.
- Os dois helpers liam o mesmo dominio de estado (`screen` e `isPaused`) e o
  segundo ainda consultava `session.isRunning()`.
- No contrato atual, `GameSessionService.isRunning()` deriva novamente
  `getScreen()` e `isPaused()`, portanto o caminho antigo fazia releitura
  redundante do mesmo trio logico.

## Escopo

- Concentrar a mudanca em `src/app.js`.
- Colapsar os dois helpers antigos em um unico helper local de snapshot por
  frame.
- Preservar o gate legado de `stateDirty` e `lastSyncTime` apenas para
  `session.synchronizeLegacyState()`.
- Ler `session.getScreen()` no maximo uma vez por frame.
- Ler `session.isPaused()` no maximo uma vez por frame.
- Derivar `isRunning` a partir do snapshot final quando `getScreen()` e
  `isPaused()` existirem.
- Usar `session.isRunning()` apenas como fallback para implementacoes
  alternativas que nao exponham ambos os getters.
- Atualizar `gameLoop()` para consumir somente o snapshot unificado.

## Nao-Objetivos

- Nao alterar API publica de `GameSessionService`.
- Nao alterar `src/bootstrap/serviceManifest.js`.
- Nao alterar `ServiceRegistry`, eventos de sessao ou a cadencia do sync legado.
- Nao refatorar renderizacao, bootstrap ou outros ramos de `gameLoop()`.

## Arquivos-Alvo

- `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/02-hot-path-app-game-loop.md`
- `src/app.js`
- `src/services/GameSessionService.js`
- `src/bootstrap/serviceManifest.js`

## Riscos

- Algum fluxo implicito pode depender de `gameState` ser espelhado em dois
  momentos do frame.
- Uma implementacao alternativa pode expor `isRunning()` com semantica
  diferente da derivacao local.
- Remover a duplicacao sem preservar o gate legado pode quebrar outros campos
  espelhados por `synchronizeLegacyState()`.

## Criterios de Aceite

- `gameLoop()` passa a resolver `screen`, `isPaused` e `isRunning` por uma
  unica chamada por frame.
- `src/app.js` deixa de manter helpers separados para sincronizar e reler o
  mesmo dominio de estado.
- No caminho normal com `GameSessionService`, `getScreen()` e `isPaused()` sao
  lidos no maximo uma vez por frame, e `isRunning` sai do mesmo snapshot.
- O comportamento de menu, pause, gameplay e game over permanece inalterado.

## Validacao Minima

- `npm run format:check`
- `npm run validate:deps`
- `npm run test:services`
- Revisao estatica do diff para confirmar origem unica por frame para
  `screen`, `isPaused` e `isRunning`.
- Smoke manual: menu inicial, iniciar partida, pausar/despausar, morrer para
  `gameover` e voltar ao menu.

## Sequencia Executada

1. Verificar equivalentes existentes antes de criar o arquivo desta frente.
2. Registrar este plano em
   `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/02-hot-path-app-game-loop.md`.
3. Substituir em `src/app.js` os helpers separados por um unico helper de
   snapshot por frame.
4. Preservar o gate de `stateDirty` e `lastSyncTime` apenas para
   `synchronizeLegacyState()`.
5. Atualizar `gameLoop()` para consumir somente o snapshot unificado.
6. Executar a validacao minima sem expandir o escopo para outros arquivos de
   runtime.
