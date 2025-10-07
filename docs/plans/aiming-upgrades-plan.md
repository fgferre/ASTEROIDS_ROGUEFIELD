# Plano de Evolução do Sistema de Mira

## Diagnóstico do Sistema Atual

### Mecânicas Principais
- O `CombatSystem` mantém referências para jogador, inimigos e física através do service locator, garantindo acesso consistente aos dados necessários para mirar e atirar.【F:src/modules/CombatSystem.js†L70-L155】
- A cada ciclo `findBestTarget` recompõe a lista ordenada de inimigos; quando `dangerScoreEnabled` está ativo o ranking usa `calculateDangerScore`, caso contrário aplica a ordenação por distância como fallback.【F:src/modules/CombatSystem.js†L240-L340】
- O disparo só acontece quando existe alvo válido, respeitando tempo de recarga e aplicando predição linear ou dinâmica antes de instanciar projéteis e emitir eventos globais.【F:src/modules/CombatSystem.js†L386-L470】
- Balas são obtidas de um pool, atualizadas com trilhas e removidas ao expirar, reduzindo custos de alocação e mantendo a cena limpa de projéteis inválidos.【F:src/modules/CombatSystem.js†L508-L618】

### Colisão e Feedback
- Cada impacto processa dano através do sistema de inimigos e dispara evento `bullet-hit`, que serve de gatilho para feedback visual e sonoro contextualizado.【F:src/modules/CombatSystem.js†L406-L465】
- O `EffectsSystem` responde aos eventos de criação de projéteis e acertos para gerar muzzle flash, partículas de impacto e indicadores de dano direcionais.【F:src/modules/EffectsSystem.js†L296-L360】【F:src/modules/EffectsSystem.js†L913-L948】
- O `AudioSystem` sincroniza o disparo e a confirmação de impacto com efeitos sonoros sintetizados, reforçando ritmo de tiro e sensação de acerto.【F:src/modules/AudioSystem.js†L93-L148】【F:src/modules/AudioSystem.js†L344-L372】【F:src/modules/AudioSystem.js†L704-L738】
- O indicador visual de alvo ativo aparece durante o `render` do sistema de combate, conectando nave e inimigo com traço e anel pulsante.【F:src/modules/CombatSystem.js†L500-L585】

### Observações
- A matriz de periculosidade soma pesos de variante, recompensa, direção, velocidade, tamanho e distância, mas não inclui nenhum termo de iminência de impacto apesar de já existir cálculo de interceptação dinâmica para tiros.【F:src/modules/CombatSystem.js†L923-L1039】
- O `computeLockCount` limita o número de travas ao mínimo entre `multiLockTargets` e o valor atual de multishot, enquanto `handleShooting` continua aplicando `applyMultishotSpread` para projéteis excedentes; assim, mesmo com nível 3 instalado o padrão de espalhamento permanece ativo além das travas prioritárias.【F:src/modules/CombatSystem.js†L408-L516】【F:src/modules/CombatSystem.js†L826-L839】【F:src/core/GameConstants.js†L1094-L1136】
- O indicador de predição permanece visível mesmo após a nave ser destruída, pois o `render` não valida o estado do jogador antes de desenhar `predictedAimPoints`.【F:src/modules/CombatSystem.js†L1294-L1404】

### Achados da Revisão de Código
- A lógica atual do upgrade 1 ativa a matriz de perigo existente, mas a fórmula não reflete o termo de impacto iminente descrito no plano anterior nem há parâmetros correspondentes em `GameConstants`.
- O upgrade 3 continua limitado a duas travas simultâneas e mantém a lógica de spread para multishot acima do limite, não implementando a bateria de quatro canhões independentes prevista.
- O bug visual do indicador preditivo pós-morte continua reproduzível; nenhuma limpeza adicional acontece no evento `player-died`.

## Diretrizes Gerais para Upgrades
- Persistir parâmetros em `GameConstants` ou arquivos de dados, mantendo abordagem data-driven já utilizada no projeto.【F:src/core/GameConstants.js†L1086-L1091】
- Reutilizar eventos globais existentes (`weapon-fired`, `bullet-created`, `bullet-hit`) para expandir VFX/SFX sem criar canais paralelos, garantindo compatibilidade com sistemas de efeitos e áudio atuais.【F:src/modules/CombatSystem.js†L269-L360】【F:src/modules/EffectsSystem.js†L296-L339】【F:src/modules/AudioSystem.js†L93-L147】

## Upgrade 1 — Matriz de Aquisição Adaptativa
**Objetivo:** tornar a seleção de alvo responsiva a ameaças ao invés de apenas proximidade, incorporando janela de impacto iminente.

- **Estado Atual:** `calculateDangerScore` adiciona os pesos de variante, recompensa, direção, velocidade, tamanho e distância definidos em `COMBAT_AIMING_UPGRADE_CONFIG`, porém não utiliza o tempo de interceptação para ajustar a prioridade de alvos com impacto iminente.【F:src/modules/CombatSystem.js†L923-L945】【F:src/core/GameConstants.js†L1094-L1121】
- **Ajustes Necessários:** introduzir um termo de iminência que consuma o tempo retornado por `calculateDynamicIntercept` quando disponível, além de um fallback proporcional à distância em casos degenerados. Incluir parâmetros data-driven (ex.: peso máximo, curva de decaimento, amortização por HP) em `COMBAT_AIMING_UPGRADE_CONFIG` para calibrar o ganho do novo termo.【F:src/modules/CombatSystem.js†L1026-L1078】【F:src/core/GameConstants.js†L1094-L1121】
- **VFX/SFX:** manter o pulso de travamento já existente e planejar um incremento leve quando o termo de iminência elevar a prioridade (ex.: reforço temporário do arco e um ping curto de aquisição via `AudioSystem`).【F:src/modules/CombatSystem.js†L344-L371】【F:src/modules/AudioSystem.js†L93-L148】

## Upgrade 2 — Núcleo de Predição Dinâmica
**Objetivo:** melhorar precisão de tiros em alvos móveis e comunicar claramente o ponto previsto.

- **Estado Atual:** `getPredictedTargetPosition` já tenta resolver o intercepto balístico via `calculateDynamicIntercept`, recortando o tempo pelas janelas configuradas e caindo para a predição linear padrão quando necessário.【F:src/modules/CombatSystem.js†L484-L507】【F:src/modules/CombatSystem.js†L1026-L1078】
- **Ajustes Necessários:** validar o comportamento sob o novo termo de iminência (Upgrade 1), garantindo que a mesma janela de tempo seja usada para pontuação e mira. Avaliar redução adicional em `targetUpdateInterval` para nivel 2 e adicionar telemetria mínima para aferir ganhos de precisão durante playtests.【F:src/modules/CombatSystem.js†L240-L340】【F:src/modules/CombatSystem.js†L795-L839】
- **VFX/SFX:** manter o marcador translúcido do ponto previsto e planejar nuance sonora discreta (leve swell no disparo) para diferenciar tiros com predição dinâmica ativa.【F:src/modules/CombatSystem.js†L1294-L1404】【F:src/modules/AudioSystem.js†L93-L148】

## Upgrade 3 — Bateria de Canhões Coordenada
**Objetivo:** substituir o padrão de spread pelo controle de quatro canhões independentes que respeitam a prioridade de ameaça e podem se concentrar em um único alvo.

- **Estado Atual:** o terceiro nível apenas reduz o `shootCooldown`, limita `multiLockTargets` a duas ameaças e deixa a distribuição adicional de multishot a cargo do spread convencional.【F:src/data/upgrades.js†L528-L577】【F:src/modules/CombatSystem.js†L408-L444】【F:src/modules/CombatSystem.js†L826-L839】
- **Ajustes Necessários:**
  - Fixar `multiLockTargets` em quatro canhões virtuais e reformular `handleShooting` para que cada canhão selecione alvo a partir da fila ordenada pela `dangerScore`, podendo convergir quando a iminência/HP justificar.
  - Desativar `applyMultishotSpread` para todo o ciclo enquanto o nível 3 estiver ativo, substituindo-o pela distribuição coordenada e por possível reutilização do mesmo alvo.
  - Atualizar `COMBAT_AIMING_UPGRADE_CONFIG` e a carga do upgrade (event payload) para refletir o novo limite e ajustes de cooldown necessários.【F:src/modules/CombatSystem.js†L408-L516】【F:src/modules/CombatSystem.js†L1094-L1136】
- **VFX/SFX:** estender o `render` para diferenciar os quatro feixes (largura/alpha) e escalonar o `playLaserShot` com camadas discretas que reflitam o número de canhões ativos, preservando o batch atual para evitar clipping.【F:src/modules/CombatSystem.js†L1294-L1404】【F:src/modules/AudioSystem.js†L93-L148】

## Próximos Passos
1. Realizar sessões de playtest direcionadas para validar a nova função de impacto iminente—incluindo cenários em que múltiplos canhões convergem num mesmo alvo—ajustando pesos apenas se parasitas/voláteis perderem prioridade injustificadamente.【F:src/core/GameConstants.js†L1094-L1122】【F:src/modules/CombatSystem.js†L923-L945】
2. Implementar testes automatizados cobrindo o reset de pesos e a distribuição de canhões após `progression-reset`, garantindo que o estado da bateria coordenada retorne ao baseline quando upgrades são removidos.【F:src/modules/CombatSystem.js†L600-L720】【F:src/modules/CombatSystem.js†L344-L447】
3. Corrigir o bug do indicador preditivo garantindo que `player-died` limpe `predictedAimPoints` ou que `render` cheque o estado da nave antes de desenhar os círculos auxiliares; adicionar testes de regressão para travas visuais pós-morte.【F:src/modules/CombatSystem.js†L114-L327】【F:src/modules/CombatSystem.js†L1294-L1404】
4. Avaliar mixagem de áudio e sobreposição visual com quatro canhões simultâneos, certificando-se de que os feixes concentrados não estouram ganho nem saturam a camada de disparo coordenado.【F:src/modules/AudioSystem.js†L93-L148】【F:src/modules/CombatSystem.js†L1294-L1404】
