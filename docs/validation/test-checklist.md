# Checklist de Validação

## Automação
- [ ] `npm test -- --run src/__tests__/core/RandomService.test.js`
- [ ] `npm test -- --run src/__tests__/progression/progression-determinism.test.js`
- [ ] `npm test -- --run src/__tests__/audio/audio-determinism.test.js`
- [ ] `npm test -- --run src/__tests__/rendering/rendering-determinism.test.js`
- [ ] `npm test -- --run src/__tests__/rendering/screen-shake-determinism.test.js`
- [ ] `npm test -- --run tests/integration/deterministic-systems.test.js`
- [ ] `npm test -- --run tests/integration/enemy-system-determinism.test.js`
- [ ] `npm test`

## Execução determinística (manual)
- [ ] Iniciar o jogo com uma seed conhecida, ex.: abrir `http://localhost:5173/?seed=1337` após rodar `npm run dev`.
- [ ] Confirmar nos logs do console que o bootstrap registrou a seed informada e que o guardião de `Math.random()` emite aviso caso algum módulo bypass o `RandomService`.
- [ ] Reiniciar a run (usar "Restart" ou recarregar com a mesma seed) e verificar que starfield, ondas iniciais e drops de orbes se mantêm idênticos.
- [ ] Usar `ServiceRegistry.createTestContainer({ randomSeed: 123 })` para validar que resets sucessivos do `EnemySystem` mantêm lado de spawn, variante e UUID dos inimigos.
- [ ] Documentar seeds usadas e resultados relevantes no relatório de validação ou anotações de QA.

## Ciclo de sessão (manual)
- [ ] Com o servidor (`npm run dev`) ativo, iniciar uma run a partir do menu principal e confirmar que a UI troca para o HUD de jogo, o áudio é inicializado e o console registra os logs `[Random]` referentes a `bootstrap`/`run.start`.
- [ ] Jogar até morrer propositalmente; conferir que a tela de game over aparece, que o console imprime `death.snapshot` com o seed/snapshot da run e que o áudio/UI pausam conforme esperado.
- [ ] Acionar "Retry" e observar a contagem regressiva (`3 → 2 → 1`) no overlay, o retorno automático do HUD e os logs `[Random] retry.respawn`; confirmar que o jogador reaparece com o mesmo loadout/seed e que o áudio retoma a trilha de gameplay.
- [ ] Abrir o menu de pausa, solicitar "Quit" e validar que a explosão épica é renderizada antes de voltar ao menu (`screen-changed` para `menu`, log `[Random] menu.exit`) e que a UI volta ao estado inicial sem manter contadores de retry.
- [ ] Iniciar uma nova run a partir do menu e verificar que nenhum estado residual (pausa, retry countdown, HUD oculto) persiste.
- [ ] Na aba **Application** das DevTools, checar em `Local Storage` → `roguefield.lastSeed` se o último seed persiste após as transições; recarregar a página e confirmar que o valor permanece sincronizado com os logs finais.
