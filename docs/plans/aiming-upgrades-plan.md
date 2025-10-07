# Plano de Evolução do Sistema de Mira

## Diagnóstico do Sistema Atual

### Mecânicas Principais
- O `CombatSystem` já mantém caches para jogador, inimigos e física, limpando o estado sempre que eventos globais de reset ou morte acontecem, o que garante que travas e pontos preditivos não sobrevivam após a destruição da nave.【F:src/modules/CombatSystem.js†L111-L147】
- A aquisição de alvos recompõe uma lista ordenada sempre que o temporizador expira e, com a mira evoluída, calcula uma `dangerScore` que soma pesos de variante, recompensa, direção, velocidade, tamanho, distância e o termo de impacto iminente antes de ranquear as ameaças.【F:src/modules/CombatSystem.js†L200-L344】【F:src/modules/CombatSystem.js†L1376-L1414】
- A pontuação de impacto estima tempo para colisão, distância projetada, proporção de HP restante e converte esses fatores em urgência e `recommendedShots`, que alimentam o algoritmo de distribuição das travas coordenadas.【F:src/modules/CombatSystem.js†L1418-L1534】【F:src/modules/CombatSystem.js†L1092-L1238】
- O disparo consulta `player.getStats()` para obter dano acumulado (influenciado pelos upgrades de força) e o valor atual de `multishot`, decidindo entre a bateria coordenada ou o padrão de spread legado conforme o nível do upgrade de mira.【F:src/modules/CombatSystem.js†L439-L569】【F:src/modules/PlayerSystem.js†L102-L156】【F:src/modules/PlayerSystem.js†L860-L869】

### Distribuição de Canhões, VFX e SFX
- No nível 3, `computeLockCount` limita travas ativas ao mínimo entre `multiLockTargets` (hoje 4) e os projéteis disponíveis, permitindo dividir ou concentrar fogo de acordo com a urgência calculada.【F:src/modules/CombatSystem.js†L1001-L1014】
- `computeParallelOffset` cria deslocamentos laterais determinísticos para cada canhão redundante, removendo o spread randômico e evitando sobreposição de projéteis quando múltiplos canhões focam o mesmo alvo.【F:src/modules/CombatSystem.js†L1326-L1367】
- O `render` já diferencia indicadores para cada trava (incluindo duplicatas no mesmo inimigo) e só exibe marcadores preditivos quando a predição dinâmica está ativa e o jogador permanece vivo.【F:src/modules/CombatSystem.js†L1935-L2048】
- O `AudioSystem` aumenta discretamente o pitch e o sustain do disparo conforme o número de canhões ativos e sinaliza o uso da predição dinâmica, preservando o batching existente.【F:src/modules/AudioSystem.js†L351-L409】

### Configuração e Dados
- Os pesos padrão, intervalos de atualização, espaçamento paralelo e parâmetros de feedback do ramo de mira já estão centralizados em `COMBAT_AIMING_UPGRADE_CONFIG`, com o termo de impacto calibrado via dados.【F:src/core/GameConstants.js†L1087-L1160】
- O catálogo de upgrades define a árvore da Matriz de Mira com evento de reset de pesos no nível 1, ajustes de predição no nível 2 e carga de quatro travas com redução de cooldown no nível 3, incluindo a exigência explícita de `multishot` nível 1.【F:src/data/upgrades.js†L528-L577】
- O sistema de progressão valida requisitos globais e específicos de cada nível antes de oferecer ou aplicar upgrades, impedindo que a bateria coordenada seja desbloqueada sem o pré-requisito de multishot.【F:src/modules/ProgressionSystem.js†L262-L353】

## Observações e Pontos de Atenção
- O cálculo de `recommendedShots` usa apenas o HP absoluto do alvo e constantes de empilhamento; quando a nave acumula upgrades de dano (`plasma`), ainda podemos acabar dedicando 3–4 canhões a inimigos que cairiam com um único disparo. Precisamos considerar o dano por projétil atual ao estimar quantos canhões valem a pena concentrar.【F:src/modules/CombatSystem.js†L1418-L1534】【F:src/modules/PlayerSystem.js†L102-L156】
- As janelas de tempo e distância para urgência são estáticas. Playtests devem validar se variantes muito rápidas (parasitas/voláteis) continuam liderando o ranking mesmo quando o jogador acelera (`propulsors`) ou quando o alvo se aproxima por ângulos extremos – calibragem fina pode exigir ajustes em `urgencyDistance`/`urgencyTime` ou um leve bias direcional adicional.【F:src/modules/CombatSystem.js†L1444-L1519】
- O espaçamento paralelo usa valores fixos (`parallelSpacing` e `parallelRadiusMultiplier`). Em situações com quatro canhões focando um alvo minúsculo é possível que os offsets ultrapassem o raio visível; vale planejar telemetria ou visual debug para garantir que não ocorram over-shoots ao ajustar esses parâmetros.【F:src/modules/CombatSystem.js†L1326-L1367】【F:src/core/GameConstants.js†L1149-L1154】
- A UI e o áudio já escalam com o número de travas, mas ainda não há teste automatizado garantindo que `player-died` limpe marcadores em todos os estados intermediários (ex.: morte durante animação de aquisição). Cobertura adicional evitará regressões.【F:src/modules/CombatSystem.js†L111-L147】【F:src/modules/CombatSystem.js†L1935-L2048】

## Mapa de Comportamentos por Upgrade

| Upgrade de Mira | Multishot | Comportamento Observado |
| --- | --- | --- |
| Nível 0 | 1 | Mira padrão por distância, um único canhão, sem predição dinâmica. |
| Nível 0 | 2–4 | Multishot aplica spread legado proporcional ao índice do tiro.【F:src/modules/CombatSystem.js†L558-L569】 |
| Nível 1 | 1 | `dangerScore` habilitado com matriz completa de pesos; segue disparando um projétil central.【F:src/modules/CombatSystem.js†L824-L826】【F:src/modules/CombatSystem.js†L439-L571】 |
| Nível 1 | 2–4 | Prioridade de alvo já usa periculosidade, mas spread continua ativo para os tiros extras.【F:src/modules/CombatSystem.js†L558-L569】 |
| Nível 2 | 1 | Predição dinâmica ativa, marcador auxiliar exibido enquanto a nave estiver viva.【F:src/modules/CombatSystem.js†L828-L829】【F:src/modules/CombatSystem.js†L1935-L2048】 |
| Nível 2 | 2–4 | Igual ao nível 1 com spread, porém pontos preditivos são atualizados a cada travamento.【F:src/modules/CombatSystem.js†L439-L569】 |
| Nível 3 | 1 | Mantém mira preditiva, sem spread, e respeita cooldown reduzido mesmo com um único canhão.【F:src/modules/CombatSystem.js†L832-L845】【F:src/modules/CombatSystem.js†L558-L569】 |
| Nível 3 | 2 | Duas travas coordenadas; pode empilhar no mesmo alvo com offset paralelo se a urgência recomendar dois canhões.【F:src/modules/CombatSystem.js†L1092-L1238】【F:src/modules/CombatSystem.js†L1326-L1367】 |
| Nível 3 | 3–4 | Até quatro travas simultâneas, distribuídas pela urgência calculada e limitadas pelo valor de multishot; áudio e indicadores visuais escalam com o número de canhões ativos.【F:src/modules/CombatSystem.js†L1001-L1014】【F:src/modules/AudioSystem.js†L351-L409】【F:src/modules/CombatSystem.js†L1935-L2048】 |

## Diretrizes por Nível de Upgrade

### Upgrade 1 — Matriz de Aquisição Adaptativa
- **Estado Atual:** A matriz data-driven está aplicada e inclui termo de impacto iminente, ordenando variantes parasitas/voláteis com prioridade máxima.【F:src/modules/CombatSystem.js†L1376-L1436】【F:src/core/GameConstants.js†L1094-L1136】
- **Próximos Passos:** Ajustar `recommendedShots` para considerar o dano por disparo e validar, via playtests, se o peso atual de recompensa continua relevante após a introdução da urgência baseada em impacto.【F:src/modules/CombatSystem.js†L1418-L1534】【F:src/modules/PlayerSystem.js†L102-L156】

### Upgrade 2 — Núcleo de Predição Dinâmica
- **Estado Atual:** `calculateDynamicIntercept` limita o tempo de lead conforme parâmetros configurados e o render só exibe o marcador preditivo quando a predição avançada está ativa e o jogador permanece vivo.【F:src/modules/CombatSystem.js†L1047-L1323】【F:src/modules/CombatSystem.js†L1935-L2048】
- **Próximos Passos:** Instrumentar telemetria simples (ex.: comparação entre ponto previsto e impacto real) para calibrar `minLeadTime`/`maxLeadTime` em velocidades extremas e garantir que ajustes no termo de impacto não criem discrepâncias visuais na predição.【F:src/core/GameConstants.js†L1138-L1147】【F:src/modules/CombatSystem.js†L1418-L1519】

### Upgrade 3 — Bateria de Canhões Coordenada
- **Estado Atual:** A lógica de travas múltiplas aloca canhões conforme urgência, aplica offsets paralelos e remove o spread dos tiros extras; áudio e UI já refletem a contagem total de barris ativos.【F:src/modules/CombatSystem.js†L439-L569】【F:src/modules/CombatSystem.js†L1092-L1367】【F:src/modules/AudioSystem.js†L351-L409】
- **Próximos Passos:**
  - Revisar o algoritmo de distribuição para ponderar dano por disparo, evitando overkill quando upgrades de força estiverem ativos.【F:src/modules/CombatSystem.js†L1418-L1534】【F:src/modules/PlayerSystem.js†L102-L156】
  - Validar offsets em alvos pequenos e ajustar `parallelSpacing`/`parallelRadiusMultiplier` via dados se forem observados cruzamentos exagerados.【F:src/modules/CombatSystem.js†L1326-L1367】【F:src/core/GameConstants.js†L1149-L1154】
  - Cobrir via testes ou tooling que eventos de morte limpam imediatamente `currentLockAssignments` e `predictedAimPoints`, prevenindo regressões visuais.【F:src/modules/CombatSystem.js†L111-L147】【F:src/modules/CombatSystem.js†L1935-L2048】

## Próximos Passos Gerais
1. Implementar telemetria leve para correlacionar `recommendedShots` com dano real aplicado e ajustar pesos de impacto com base em playtests (foco nas combinações com Plasma nível 3 + Multishot nível 3).【F:src/modules/CombatSystem.js†L1418-L1534】【F:src/modules/PlayerSystem.js†L102-L156】
2. Criar testes automatizados garantindo que `progression-reset` e `player-died` limpem travas, marcadores preditivos e cooldowns da bateria coordenada.【F:src/modules/CombatSystem.js†L111-L147】【F:src/modules/CombatSystem.js†L771-L797】
3. Documentar guidelines de tuning para `parallelSpacing` e `urgency` no repositório de dados após coletar métricas de playtest, permitindo ajustes futuros sem refatorar a lógica.【F:src/core/GameConstants.js†L1094-L1154】【F:src/modules/CombatSystem.js†L1326-L1367】

