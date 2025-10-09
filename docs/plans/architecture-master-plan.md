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
- Plano detalhado: [docs/plans/phase2-random-service-plan.md](./phase2-random-service-plan.md).

### Fase 3 – Extrair `GameSessionService`
- Mover `gameState`, `createDeathSnapshot`, `restoreFromSnapshot`, `startRetryCountdown` e utilitários correlatos de `app.js` para um módulo dedicado (`/src/modules/GameSessionService.js`), deixando o bootstrap responsável apenas pelo loop.
- Esse serviço passa a orquestrar player, progressão e inimigos via API pública, reduzindo acoplamento com DOM e preparando terreno para salvar/retomar runs.
- **Benefício:** clarifica a autoridade sobre o estado da run e cria ponto único para futuras features de save/load e modos alternativos (ex.: “daily seed”).

### Fase 4 – Evoluir Input/Combate para Fila de Comandos
- Ajustar `InputSystem` para produzir objetos de comando (`MoveCommand`, `ShootCommand`, etc.) a cada frame, entregando-os a um `CommandQueueService` compartilhado.
- `PlayerSystem` e `CombatSystem` passam a consumir a fila ao invés de consultar estado diretamente (`getMovementInput`, flags, timers), abrindo espaço para bufferização, replays e IA usando o mesmo caminho.
- **Benefício:** reduz checagens espalhadas, facilita entendimento/testes e documenta claramente “quem pediu o quê” em cada frame.

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
