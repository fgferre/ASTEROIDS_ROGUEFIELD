# Checklist de Validação

## Automação

- [ ] `npm test -- --run src/__tests__/core/RandomService.test.js`
- [ ] `npm test -- --run tests/unit/modules/ProgressionSystem.test.js`
  - Nota: toda a suíte de determinismo do ProgressionSystem reside em `tests/unit/modules/ProgressionSystem.test.js`.
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

## Renderização de inimigos (visual)

- [ ] Executar `npm run test:visual-enemies` e abrir `http://localhost:5173/scripts/visual-enemy-rendering-test.html`.
- [ ] **Drone:** Confirmar que nave triangular renderiza com proporções corretas (nose ≈ 1.6 × radius, fins laterais visíveis).
- [ ] **Drone:** Ajustar slider de velocidade e verificar que exhaust glow cresce/diminui suavemente sem transições abruptas.
- [ ] **Drone:** Validar cores: body metálico frio (`#5b6b7a`), accent ridges ciano (`#a6e8ff`), exhaust quente quando em movimento.
- [ ] **Mine:** Confirmar esfera perfeita com gradiente radial visível (centro mais claro, borda mais escura).
- [ ] **Mine:** Observar pulsação contínua (~2.4 s de período), sem jitter ou popping.
- [ ] **Mine:** Clicar "Toggle Armed" e verificar que intensidade da pulsação aumenta (halo mais brilhante, rim com alpha maior).
- [ ] **Mine:** Validar cores: core laranja/dourado (`#ff9348`), halo mais claro (`#ffc480`).
- [ ] **Hunter:** Confirmar diamante com 4 vértices definidos (front pontiagudo, rear mais curto).
- [ ] **Hunter:** Verificar que turret (base circular + barrel) rotaciona independentemente do hull.
- [ ] **Hunter:** Ajustar slider de turret speed e confirmar rotação suave sem jitter.
- [ ] **Hunter:** Validar cores: body cinza-azulado (`#64687a`), accent magenta (`#f4b1ff`), turret mais claro (`#b7a7d9`).
- [ ] **Hunter:** Confirmar gradiente linear front-to-rear visível no hull.
- [ ] **Performance:** Verificar FPS counter mantendo 60 FPS com os 3 tipos renderizando.
- [ ] **Performance:** Deixar harness rodando por 1 minuto e confirmar ausência de memory leaks (DevTools → Memory → comparação de snapshots).
- [ ] **Canvas State:** Ativar checkbox "Show Bounding Circles" e confirmar que círculos de debug não afetam renderização (estado preservado).
- [ ] Preencher checklist completa em `docs/validation/enemy-rendering-visual-checklist.md` e registrar resultado (Aprovado/Aprovado com ressalvas/Reprovado).
- [ ] Se aprovado, marcar WAVE-003 como concluído em `docs/plans/phase1-enemy-foundation-plan.md` e prosseguir para WAVE-004.

**Critério de bloqueio:** Falha em geometria, cores ou performance impede avanço. Revisar implementações de `onDraw()` e constantes em `GameConstants.ENEMY_EFFECT_COLORS` / `ENEMY_RENDER_PRESETS` antes de integrar o WaveManager.
