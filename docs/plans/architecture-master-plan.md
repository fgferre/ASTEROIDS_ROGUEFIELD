# Master Plan – Migração Arquitetural por Fases

## Resumo Executivo
- O bootstrap ainda instancia cada sistema manualmente e mantém `gameServices` como fonte única de dependências enquanto o `ServiceRegistry` apenas espelha placeholders no `DIContainer`, resultando em duas infraestruturas paralelas.
- O fluxo de sessão (estado global, snapshots de morte, respawn) permanece concentrado em `app.js`, conversando diretamente com vários serviços e espalhando lógica de jogo fora dos módulos especializados.
- Diversos sistemas ainda chamam `Math.random()` diretamente, impedindo seeds determinísticos, sincronização entre subsistemas e futuras funcionalidades de replay/telemetria.

## Plano Prioritário por Fase

### Fase 1 – Centralizar Bootstrap e Adoção Real do DI
- Criar um orquestrador único (`bootstrapServices`) responsável por instanciar cada serviço via fábricas registradas no `ServiceRegistry`, injetando dependências explicitamente e só então expondo as instâncias no `gameServices` enquanto durar a transição legada.
- **Benefício:** elimina duplicidade entre Service Locator e DI, deixa explícitas as dependências e facilita a troca de implementações sem caça manual a `gameServices.get()`.
- **Escopo inicial:** mover a sequência de `new ...System()` de `app.js` para o manifesto, adaptar construtores para receber dependências opcionais e adicionar uma fase de validação (`diContainer.validate()`) que garanta resolução antes do loop principal.

### Fase 2 – Introduzir `RandomService` Seedado e Substituir `Math.random()`
- Registrar um serviço singleton `random` no contêiner e injetá-lo progressivamente nos sistemas que hoje usam `Math.random()` diretamente (efeitos, áudio procedural, spawns, drops).
- Começar por sistemas cosméticos para validar a API sem risco, avançando para progressão, loot e IA conforme as dependências forem injetadas.
- **Benefício:** desbloqueia replays determinísticos, seeds compartilháveis (daily challenges) e debugging reproduzível com baixo custo adicional após a fase 1.
- Plano detalhado: [docs/archive/2025-plan/plans/phase2-random-service-plan.md](../archive/2025-plan/plans/phase2-random-service-plan.md).

### Fase 3 – Extrair `GameSessionService`
- Mover `gameState`, `createDeathSnapshot`, `restoreFromSnapshot`, `startRetryCountdown` e utilitários correlatos de `app.js` para um módulo dedicado (`/src/modules/GameSessionService.js`), deixando o bootstrap responsável apenas pelo loop.
- Esse serviço passa a orquestrar player, progressão e inimigos via API pública, reduzindo acoplamento com DOM e preparando terreno para salvar/retomar runs.
- **Benefício:** clarifica a autoridade sobre o estado da run e cria ponto único para futuras features de save/load e modos alternativos (ex.: “daily seed”).
- Plano detalhado: [docs/archive/2025-plan/plans/phase3-game-session-service-plan.md](../archive/2025-plan/plans/phase3-game-session-service-plan.md).

### Fase 4 – Evoluir Input/Combate para Fila de Comandos
- Ajustar `InputSystem` para produzir objetos de comando (`MoveCommand`, `ShootCommand`, etc.) a cada frame, entregando-os a um `CommandQueueService` compartilhado.
- `PlayerSystem` e `CombatSystem` passam a consumir a fila ao invés de consultar estado diretamente (`getMovementInput`, flags, timers), abrindo espaço para bufferização, replays e IA usando o mesmo caminho.
- **Benefício:** reduz checagens espalhadas, facilita entendimento/testes e documenta claramente “quem pediu o quê” em cada frame.
- Plano detalhado: [ver seção dedicada](#plano-de-execução-–-fase-4-fila-de-comandos-para-inputcombat).

### Fase 5 – Consolidar Utilidades Globais em Serviços Específicos (Opcional após Fases 2–4)
- Reposicionar lógica de UI (ex.: retry countdown) para `UISystem`/`GameSessionService`, encapsular interações com DOM em helpers e deixar `app.js` apenas com inicialização do loop e delegação.
- **Benefício:** diminui responsabilidades do arquivo principal e mantém comportamentos próximos dos sistemas responsáveis, evitando paralelismo e redundâncias.

## Dependências e Pré-requisitos Entre Fases
1. **Fase 1** é pré-requisito direto para as Fases 2, 3 e 4, pois a injeção explícita de dependências e o manifesto DI fornecem o mecanismo necessário para substituir serviços e mover responsabilidades.
2. **Fase 2** depende da Fase 1 para garantir que o `RandomService` seja resolvido e injetado sem buscas diretas ao Service Locator; ela também prepara terreno para as Fases 3 e 4 ao oferecer determinismo compartilhado.
3. **Fase 3** requer a infraestrutura de bootstrap consolidada na Fase 1 para obter referências aos sistemas via DI e reorganizar o fluxo de sessão sem recriar instâncias manualmente.
4. **Fase 4** depende das Fases 1 e 3: precisa de injeção limpa para compartilhar a fila de comandos e do `GameSessionService` para coordenar consumo de comandos com o estado global.
5. **Fase 5** é opcional e deve ocorrer após 2–4 quando os serviços já estiverem centralizados e o estado da run tiver autoridade definida.

## Critérios Gerais de Aceite
- Cada fase deve manter o jogo funcional sem regressões perceptíveis (menu, gameplay, retry, transição entre telas).
- Mudanças devem permanecer data-driven quando aplicável, registrando novos parâmetros em `GameConstants` ou `/src/data`.
- Logs e métricas de desempenho existentes devem continuar operando para suportar validação manual após cada fase.

## Plano de Execução – Fase 4 (Fila de Comandos para Input/Combat)

### 1. Objetivos da fase
- Introduzir um `CommandQueueService` singleton registrado via manifesto para armazenar comandos de entrada (movimento, disparo, habilidades) com suporte a múltiplos produtores (jogador, replay, IA) e consumo determinístico a cada frame.【F:src/bootstrap/serviceManifest.js†L300-L311】【F:src/app.js†L385-L404】
- Migrar `PlayerSystem` para calcular física, ângulo e emissões de efeitos a partir de comandos enfileirados em vez de `getMovementInput`, mantendo integridade com colisões, buffs e VFX que dependem do estado da nave.【F:src/modules/PlayerSystem.js†L396-L595】【F:src/modules/PhysicsSystem.js†L602-L712】【F:src/modules/EffectsSystem.js†L391-L415】
- Fazer `CombatSystem` reagir a comandos explícitos (ex.: disparo primário, travas de alvo) preservando suas heurísticas de mira baseadas em stats do jogador e garantindo compatibilidade com resets de sessão.【F:src/modules/CombatSystem.js†L178-L217】【F:src/modules/CombatSystem.js†L417-L520】
- Integrar a fila com `GameSessionService`, eventos globais e UI, assegurando que escudos, pausa e menus continuem respondendo aos sinais emitidos pelo `InputSystem` e que a fila seja limpa em resets, morte e troca de tela.【F:src/modules/InputSystem.js†L311-L413】【F:src/services/GameSessionService.js†L499-L547】【F:src/modules/UISystem.js†L1085-L1092】

### 2. Diagnóstico atual (evidências)
1. `InputSystem` expõe `getMovementInput()` que retorna flags booleans derivadas do estado interno (`activeKeyboardActions`/`activeGamepadActions`), exigindo polling direto dos consumidores.【F:src/modules/InputSystem.js†L722-L735】
2. `PlayerSystem.update()` resolve o serviço `input`, chama `getMovementInput()` e usa os flags para aplicar aceleração, amortecimento angular e emitir eventos de thruster; se o jogador estiver morto/retry, a atualização aborta sem processar entrada.【F:src/modules/PlayerSystem.js†L396-L459】【F:src/modules/PlayerSystem.js†L462-L595】
3. O loop principal atualiza serviços em ordem fixa (`input` → `player` → `enemies` → `combat`), tornando a leitura de estado imediato a única forma de sincronizar Input e Player dentro do mesmo frame.【F:src/app.js†L385-L404】
4. `CombatSystem` depende de `player.isDead`, `player.isRetrying`, `_quitExplosionHidden` e de snapshots (`getStats`, `getPosition`, `getVelocity`) para decidir quando mirar e atirar, mas não possui hook para ações explícitas do jogador.【F:src/modules/CombatSystem.js†L178-L217】【F:src/modules/CombatSystem.js†L417-L520】
5. `PhysicsSystem` manipula `player.position`, `player.velocity`, timers de invulnerabilidade e perfis de escudo diretamente durante colisões, assumindo que esses valores já refletem a entrada do frame corrente.【F:src/modules/PhysicsSystem.js†L602-L712】
6. `WorldSystem` ignora colisões quando `player.isDead`/`isRetrying`, marca a morte e emite `player-died`, dependendo de estados mutados pelo Player antes da verificação de colisão.【F:src/modules/WorldSystem.js†L67-L184】
7. O `InputSystem` já emite eventos (`input-action`, `activate-shield-pressed`, `toggle-pause`) que abastecem UI e `GameSessionService`, impondo compatibilidade de fase com esses canais durante a migração para comandos.【F:src/modules/InputSystem.js†L311-L413】【F:src/modules/UISystem.js†L1085-L1092】【F:src/services/GameSessionService.js†L499-L547】
8. Os eventos de thruster dependem do cálculo de força dentro de `updateMovement`, alimentando a pipeline de efeitos visuais e feedbacks de tela.【F:src/modules/PlayerSystem.js†L548-L595】【F:src/modules/EffectsSystem.js†L391-L415】
9. O manifesto DI conecta `PlayerSystem` diretamente ao serviço `input`, o que precisa ser revisado para introduzir a fila compartilhada e permitir injeção de produtores/consumidores adicionais.【F:src/bootstrap/serviceManifest.js†L300-L311】

### 3. Estratégia geral
- Criar um `CommandQueueService` com API minimalista (`enqueue`, `dequeueAll`, `peek`, `clear`, `recordSource`) e registro no manifesto antes de `player`/`combat`, expondo hooks para produtores humanos, IA ou playback de replays.【F:src/bootstrap/serviceManifest.js†L300-L311】
- Adaptar `InputSystem.update()` para traduzir o estado acumulado em comandos normalizados por frame (incluindo direção analógica e eventos discretos), empurrando-os para a fila e mantendo `input-action`/eventos globais para menus e escudos até que consumidores sejam migrados.【F:src/modules/InputSystem.js†L311-L413】【F:src/modules/InputSystem.js†L722-L735】
- Introduzir um adaptador de leitura no `PlayerSystem` que consome comandos de movimento por frame, reconstroi vetores de força e mantém os mesmos efeitos colaterais (thrust, recoil, drift) já usados por Physics e Effects, garantindo que o estado público continue consistente para colisões e UI.【F:src/modules/PlayerSystem.js†L396-L595】【F:src/modules/PhysicsSystem.js†L602-L712】
- Evoluir `CombatSystem` para observar comandos de disparo/lock (ex.: `firePrimary`, `cycleTarget`) em paralelo às rotinas de mira, permitindo alternar entre autofire e input explícito e facilitando injeção futura de scripts/replays.【F:src/modules/CombatSystem.js†L178-L217】【F:src/modules/CombatSystem.js†L417-L520】
- Integrar `GameSessionService` e o loop de atualização para limpar a fila em resets, pausar consumo quando a tela não estiver em `playing` e registrar métricas (contagem de comandos processados) para monitorar regressões.【F:src/app.js†L385-L404】【F:src/services/GameSessionService.js†L499-L547】【F:src/services/GameSessionService.js†L1300-L1339】

### 4. Sequenciamento detalhado
| Ordem | Passo | Descrição | Pré-requisito | Critério de aceite |
|-------|-------|-----------|---------------|--------------------|
| 1 | Mapear contratos de comando | Listar ações necessárias (movimento analógico, disparo primário, habilidades, foco de UI), produtores existentes (`InputSystem`, replay futuro) e consumidores (`PlayerSystem`, `CombatSystem`, `GameSessionService`, UI). Documentar formatos e prioridades de processamento por frame. | — | Documento técnico descrevendo comandos alvo com referências aos consumidores atuais (`PlayerSystem`, `CombatSystem`, UI). |
| 2 | Adicionar `CommandQueueService` | Criar serviço singleton com buffer por frame, registrar no manifesto antes de `player`/`combat` e expor métodos de limpeza. Preparar `ServiceRegistry` para permitir injeção em testes. | Passo 1 | `gameServices.get('command-queue')` retorna instância funcional; manifesto injeta serviço em dependentes sem quebrar bootstrap.【F:src/bootstrap/serviceManifest.js†L300-L311】 |
| 3 | Adaptar `InputSystem` para enfileirar comandos | Converter `getMovementInput` em adaptador que consulta a fila; gerar comandos de movimento e ações discretas em `update()`/listeners mantendo eventos globais (`input-action`, `activate-shield`). | Passo 2 | Logs mostram comandos enfileirados por frame; UI continua recebendo `input-action` via event bus.【F:src/modules/InputSystem.js†L311-L413】【F:src/modules/InputSystem.js†L722-L735】 |
| 4 | Migrar `PlayerSystem` para consumo da fila | Introduzir leitura de comandos no início de `update`, traduzindo-os em vetores/flags usados por `updateMovement` e efeitos; manter fallback temporário para chamadas diretas enquanto módulos legados não migrarem. | Passo 3 | Nave responde aos comandos e continua emitindo `thruster-effect`; colisões preservam comportamento original.【F:src/modules/PlayerSystem.js†L396-L595】【F:src/modules/EffectsSystem.js†L391-L415】 |
| 5 | Ensinar `CombatSystem` a processar comandos | Acrescentar suporte a comandos de disparo/lock, inclusive estados “hold” vs “tap”, garantindo que auto-fire siga ativo quando nenhum comando estiver presente. | Passo 4 | Comandos de disparo manual produzem `weapon-fired` mantendo cadência e targeting existentes.【F:src/modules/CombatSystem.js†L178-L217】【F:src/modules/CombatSystem.js†L417-L520】 |
| 6 | Sincronizar sessão, UI e resets | Fazer `GameSessionService` pausar/limpar fila fora de `playing`, incluir limpeza em `resetSystems` e assegurar que UI/menu ignore comandos quando ocultos. | Passo 5 | Após morrer/retry, a fila é limpa e nenhum comando “fantasma” é processado; shield/pause continuam funcionando.【F:src/services/GameSessionService.js†L499-L547】【F:src/services/GameSessionService.js†L1300-L1339】 |
| 7 | Desativar polling legado | Remover dependência direta de `player` no serviço `input`, atualizar manifesto/dependências e expor APIs de replay/IA (ex.: `recordCommands(frame)`). | Passo 6 | `PlayerSystem` não usa mais `getMovementInput` e o manifesto aponta para `command-queue` como dependência primária. Logs confirmam ausência de chamadas a `resolveService('input')` no `PlayerSystem`. |
| 8 | Instrumentação e testes | Adicionar contadores de comandos processados, validar movimento/combate manualmente (gamepad/teclado) e preparar script de gravação/reprodução simples. | Passo 7 | Checklist de validação preenchido; métricas mostram fila vazia após cada frame ativo. |

### 5. Ajustes específicos por componente
- **`CommandQueueService` (novo):** implementar buffer circular com capacidade configurável, marcação de frame/timestamp e métodos `enqueueCommand`, `consumeCommands({ consumerId })`, `drainByType`. Deve oferecer `clear(reason)` e eventos opcionais para observabilidade, além de hooks para registrar produtores (Input, IA, replay).【F:src/bootstrap/serviceManifest.js†L300-L311】【F:src/services/GameSessionService.js†L1300-L1339】
- **`InputSystem`:** transformar o estado de teclas/axes em comandos (ex.: `move` com eixo x/y normalizado, `firePrimary` com fase `pressed/released`), publicando-os na fila antes do fim de `update()`. Manter `input-action` para UI e eventos (`activate-shield-pressed`, `toggle-pause`) para a sessão. Ajustar `getMovementInput()` para delegar à fila (ou marcar como legado a ser removido após a fase).【F:src/modules/InputSystem.js†L311-L413】【F:src/modules/InputSystem.js†L722-L735】
- **`PlayerSystem`:** introduzir cache por frame de comandos de movimento (permitindo múltiplos comandos no mesmo frame) e converter para intensidades dos thrusters antes de chamar `updateMovement`. Garantir que drift, amortecimento, recoil e emissões de evento permaneçam idênticos e que `update()` ignore comandos quando `isDead/isRetrying` for verdadeiro.【F:src/modules/PlayerSystem.js†L396-L595】
- **`CombatSystem`:** além do autofire, ler comandos de disparo para permitir modo manual ou híbrido; registrar último comando processado para respeitar cadência (`lastShotTime`). Preparar ganchos para futuros comandos de mira (`cycleTarget`, `focusTarget`) que alimentem `rebuildLockSet`.【F:src/modules/CombatSystem.js†L178-L217】【F:src/modules/CombatSystem.js†L417-L520】
- **`GameSessionService`:** bloquear consumo quando `screen !== 'playing'`, limpar fila em `resetSystems`, `startNewRun`, `exitToMenu` e em `handlePlayerDiedEvent`. Opcionalmente registrar métricas (`commandsProcessed`, `commandsDropped`) para debugging de replay.【F:src/services/GameSessionService.js†L499-L547】【F:src/services/GameSessionService.js†L1300-L1339】
- **`WorldSystem` & `PhysicsSystem`:** validar que, após a migração, os estados usados para colisões (`player.position`, `velocity`, `invulnerableTimer`, `shieldState`) continuam atualizados antes das verificações, possivelmente introduzindo uma etapa de flush no início do frame. Nenhuma alteração estrutural além de garantir leitura do novo adaptador de movimento quando necessário.【F:src/modules/WorldSystem.js†L67-L184】【F:src/modules/PhysicsSystem.js†L602-L712】
- **`EffectsSystem`:** continuar reagindo aos eventos `thruster-effect`; adicionar suporte opcional a comandos (ex.: intensidade agregada) para validação futura e garantir que enfileiramento de comandos não reduza frequência dos eventos.【F:src/modules/EffectsSystem.js†L391-L415】
- **`UISystem`:** manter uso de `input-action` para menus/level-up e considerar observação direta da fila para futuros atalhos ou suporte a inputs alternativos (gamepad focus).【F:src/modules/UISystem.js†L1085-L1092】
- **Manifesto/DI:** atualizar dependências para que `PlayerSystem` e `CombatSystem` recebam `command-queue` (além de `input` quando necessário para eventos), expondo nova entrada pública no `ServiceLocatorAdapter` para código legado. Atualizar `ServiceRegistry.createTestContainer` com stubs da fila.【F:src/bootstrap/serviceManifest.js†L300-L311】

### 6. Validação e monitoramento
- **Smoke de controle:** iniciar run, mover nave em todas as direções, testar gamepad e teclado para confirmar que comandos viram deslocamento contínuo e eventos de thruster continuam disparando.【F:src/modules/PlayerSystem.js†L548-L595】【F:src/modules/EffectsSystem.js†L391-L415】
- **Combate manual:** validar disparo automático e (quando habilitado) manual via comandos, garantindo emissão de `weapon-fired` e manutenção da cadência/lock-on.【F:src/modules/CombatSystem.js†L417-L520】
- **Eventos de sessão:** morrer, executar retry e sair para o menu assegurando que nenhum comando residual seja processado após reset (especialmente escudo/pause).【F:src/services/GameSessionService.js†L499-L547】【F:src/services/GameSessionService.js†L1300-L1339】
- **Observabilidade:** instrumentar contadores de comandos processados/droppados e monitorar logs em desenvolvimento para detectar underflow/overflow da fila. Integrar métricas ao `performanceMonitor` se possível.【F:src/app.js†L321-L371】

### 7. Riscos e mitigação
- **Perda ou duplicação de comandos:** se a fila não for esvaziada por frame, comandos podem acumular e causar “input lag”. Mitigar consumindo comandos no início de `PlayerSystem.update()` e limpando buffer em resets/pause.【F:src/modules/PlayerSystem.js†L396-L459】【F:src/services/GameSessionService.js†L1300-L1339】
- **Quebra de compatibilidade com eventos globais:** migrar entrada para comandos não pode interromper `activate-shield-pressed`/`toggle-pause`. Manter eventos emitidos na camada de Input e roteá-los para a fila apenas quando necessário.【F:src/modules/InputSystem.js†L311-L413】【F:src/services/GameSessionService.js†L499-L547】
- **Integração com autofire e targeting:** comandos manuais podem conflitar com heurísticas de mira do `CombatSystem`. Introduzir modo híbrido e priorizar comandos explícitos apenas quando presentes, caindo para autofire em ausência deles.【F:src/modules/CombatSystem.js†L178-L217】【F:src/modules/CombatSystem.js†L417-L520】
- **Reset inconsistentes:** se a fila não for limpa em `resetSystems`, comandos antigos podem disparar imediatamente após respawn. Certificar-se de limpar fila em todos os caminhos de reset e adicionar testes manuais para fluxo morte→retry.【F:src/services/GameSessionService.js†L1300-L1339】

### 8. Checklist de saída da Fase 4
- [ ] `CommandQueueService` registrado no manifesto, acessível via DI e Service Locator, com API documentada.
- [ ] `InputSystem` empurra comandos por frame e `getMovementInput` deixa de ser fonte primária de estado.【F:src/modules/InputSystem.js†L722-L735】
- [ ] `PlayerSystem` consome exclusivamente a fila para atualizar movimento e continua emitindo eventos de thruster/`player-moved`.【F:src/modules/PlayerSystem.js†L396-L595】
- [ ] `CombatSystem` respeita comandos de disparo sem regressar mira automática, emitindo `weapon-fired` normalmente.【F:src/modules/CombatSystem.js†L417-L520】
- [ ] `GameSessionService` limpa a fila em resets, troca de tela e morte, prevenindo comandos residuais.【F:src/services/GameSessionService.js†L499-L547】【F:src/services/GameSessionService.js†L1300-L1339】
- [ ] Smoke tests (movimento, combate, escudo, retry) executados em teclado e gamepad, sem comandos perdidos ou repetidos.
- [ ] Métricas/telemetria confirmam fila vazia ao final de cada frame ativo e ausência de warnings no console durante o ciclo completo.

### 9. Matriz de contratos da fila de comandos
| Comando | Produtores previstos | Consumidores principais | Payload principal | Notas / Reset |
|---------|----------------------|-------------------------|-------------------|---------------|
| `move` | `InputSystem`, replay recorder, IA futura | `PlayerSystem`, `EffectsSystem` (para telemetria) | Vetor bidimensional normalizado, intensidade analógica, flags de origem (teclado/gamepad). | Processado uma vez por frame; limpar em `GameSessionService.resetSystems`/`startNewRun`.【F:src/modules/InputSystem.js†L722-L735】【F:src/modules/PlayerSystem.js†L396-L595】【F:src/modules/EffectsSystem.js†L391-L415】【F:src/services/GameSessionService.js†L1300-L1339】 |
| `firePrimary` | `InputSystem`, scripts de replay/IA | `CombatSystem` | Fase (`pressed`/`released`), intensidade opcional (auto-fire, burst), timestamp. | Ausência de comando mantém autofire padrão; reset limpa estados de hold.【F:src/modules/CombatSystem.js†L417-L520】【F:src/modules/InputSystem.js†L311-L413】 |
| `ability:shield` | `InputSystem`, replay/IA | `GameSessionService` → `PlayerSystem` | Evento discreto (`pressed`), origem (teclado/gamepad) para telemetria. | Continua emitindo `activate-shield-pressed`; fila registra para replays, mas evento precisa disparar imediatamente. Limpar em resets/menu.【F:src/modules/InputSystem.js†L384-L393】【F:src/services/GameSessionService.js†L499-L547】 |
| `ui-confirm` | `InputSystem`, automações de menu | `UISystem`, `GameSessionService` (menus) | Fase (`pressed`), contexto (level-up/menu). | Mantém compat com `input-confirmed`; ignorado quando UI não está ativa. Reset ao fechar telas.【F:src/modules/InputSystem.js†L400-L408】【F:src/modules/UISystem.js†L1085-L1092】 |

