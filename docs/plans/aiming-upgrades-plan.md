# Plano de Evolução do Sistema de Mira

## Diagnóstico do Sistema Atual

### Mecânicas Principais
- O `CombatSystem` mantém referências para jogador, inimigos e física através do service locator, garantindo acesso consistente aos dados necessários para mirar e atirar.【F:src/modules/CombatSystem.js†L70-L155】
- A seleção de alvo ocorre ciclicamente via `updateTargeting`, que redefine o alvo ativo com base no inimigo mais próximo dentro do raio de aquisição definido em constantes globais.【F:src/modules/CombatSystem.js†L158-L218】【F:src/core/GameConstants.js†L1086-L1094】
- O disparo só acontece quando existe alvo válido, respeitando tempo de recarga e aplicando previsão linear simples para calcular o ponto visado antes de instanciar projéteis e emitir eventos globais.【F:src/modules/CombatSystem.js†L236-L321】
- Balas são obtidas de um pool, atualizadas com trilhas e removidas ao expirar, reduzindo custos de alocação e mantendo a cena limpa de projéteis inválidos.【F:src/modules/CombatSystem.js†L323-L404】

### Colisão e Feedback
- Cada impacto processa dano através do sistema de inimigos e dispara evento `bullet-hit`, que serve de gatilho para feedback visual e sonoro contextualizado.【F:src/modules/CombatSystem.js†L406-L465】
- O `EffectsSystem` responde aos eventos de criação de projéteis e acertos para gerar muzzle flash, partículas de impacto e indicadores de dano direcionais.【F:src/modules/EffectsSystem.js†L296-L360】【F:src/modules/EffectsSystem.js†L913-L948】
- O `AudioSystem` sincroniza o disparo e a confirmação de impacto com efeitos sonoros sintetizados, reforçando ritmo de tiro e sensação de acerto.【F:src/modules/AudioSystem.js†L93-L148】【F:src/modules/AudioSystem.js†L344-L372】【F:src/modules/AudioSystem.js†L704-L738】
- O indicador visual de alvo ativo aparece durante o `render` do sistema de combate, conectando nave e inimigo com traço e anel pulsante.【F:src/modules/CombatSystem.js†L500-L585】

### Observações
- A priorização atual considera apenas distância; não há diferenciação por ameaça, tamanho ou valor tático.
- A predição usa tempo fixo, ignorando velocidade do projétil ou variáveis específicas do alvo.
- O feedback audiovisual não diferencia estados de trava (lock-on) ou upgrades aplicados ao subsistema de mira, limitando leitura situacional do jogador.
- O indicador de predição permanece visível mesmo após a nave ser destruída, pois o `render` não valida o estado do jogador antes de desenhar `predictedAimPoints`.【F:src/modules/CombatSystem.js†L1396-L1423】

## Diretrizes Gerais para Upgrades
- Persistir parâmetros em `GameConstants` ou arquivos de dados, mantendo abordagem data-driven já utilizada no projeto.【F:src/core/GameConstants.js†L1086-L1091】
- Reutilizar eventos globais existentes (`weapon-fired`, `bullet-created`, `bullet-hit`) para expandir VFX/SFX sem criar canais paralelos, garantindo compatibilidade com sistemas de efeitos e áudio atuais.【F:src/modules/CombatSystem.js†L269-L360】【F:src/modules/EffectsSystem.js†L296-L339】【F:src/modules/AudioSystem.js†L93-L147】

## Upgrade 1 — Matriz de Aquisição Adaptativa
**Objetivo:** tornar a seleção de alvo responsiva a ameaças ao invés de apenas proximidade, incorporando janela de impacto iminente.

- **Mecânica:** evoluir `calculateDangerScore` para que a variante continue determinando o peso base (caçadora > explosiva > padrão), seguido da recompensa esperada, direção relativa, velocidade, tamanho e um novo termo de iminência de impacto. Esse termo usa o tempo de interceptação calculado em `calculateDynamicIntercept` (quando disponível) para converter janelas curtas em bônus exponencial, caindo para um estimador baseado em distância quando a dinâmica não puder ser calculada. Dessa forma, inimigos com alto HP e contato iminente podem ultrapassar rivais menos urgentes mesmo que estejam mais distantes.【F:src/modules/CombatSystem.js†L175-L327】【F:src/modules/CombatSystem.js†L923-L945】【F:src/modules/CombatSystem.js†L1026-L1077】
- **Progressão:** o nível inicial do galho ativa a matriz adaptativa com pesos parametrizados em `GameConstants`. Introduzir novos campos para `impactWindow` (peso máximo e curva de decaimento) mantendo a configuração data-driven e permitindo reequilíbrio sem tocar na lógica central.【F:src/core/GameConstants.js†L1086-L1094】【F:src/core/GameConstants.js†L1094-L1122】
- **VFX:** reforçar lock em alvo prioritário intensificando o traço renderizado (espessura/alpha temporários) e adicionando breve pulso radial quando a prioridade muda. Ajustar trecho de `render` responsável pelo indicador usando timers ligados ao evento de troca de alvo.【F:src/modules/CombatSystem.js†L565-L585】
- **SFX:** disparar breve blip de aquisição via `AudioSystem` quando o alvo prioritário troca, reaproveitando infraestrutura de agendamento (`_scheduleBatchedSound`) para evitar saturação.【F:src/modules/AudioSystem.js†L344-L372】

## Upgrade 2 — Núcleo de Predição Dinâmica
**Objetivo:** melhorar precisão de tiros em alvos móveis e comunicar claramente o ponto previsto.

- **Mecânica:** atualizar `getPredictedTargetPosition` para calcular tempo de interceptação com base na distância atual e velocidade do projétil (`this.bulletSpeed`), ao invés de tempo fixo. Resolver equação de movimento linear (lead de primeiro grau) e permitir fallback para predição atual se o denominador for instável.【F:src/modules/CombatSystem.js†L288-L321】
- **Progressão:** segundo nível do novo galho habilita o cálculo dinâmico; níveis posteriores podem adicionar ajuste extra (p. ex. compensação de aceleração estimada a partir da diferença de posição entre `target` updates) e reduzir `TARGET_UPDATE_INTERVAL` para reforçar responsividade.【F:src/modules/CombatSystem.js†L158-L218】【F:src/core/GameConstants.js†L1086-L1094】
- **VFX:** renderizar pequeno marcador no ponto previsto (ex.: retículo translúcido) sincronizado com o traço de ligação nave→alvo, reforçando feedback da mira avançada.【F:src/modules/CombatSystem.js†L565-L585】
- **SFX:** adicionar sutil carregamento ascendente misturado ao som padrão de disparo quando a predição dinâmica está ativa, modulando parâmetros do `playLaserShot` (leve aumento de pitch inicial) para comunicar upgrade sem poluir mix.【F:src/modules/AudioSystem.js†L344-L372】

## Upgrade 3 — Bateria de Canhões Coordenada
**Objetivo:** substituir o padrão de spread pelo controle de quatro canhões independentes que respeitam a prioridade de ameaça e podem se concentrar em um único alvo.

- **Mecânica:** reformular `handleShooting` para operar sobre uma fila de ameaças derivada da `dangerScore` extendida. Cada ciclo deve instanciar quatro canhões virtuais que selecionam alvos em ordem de prioridade; quando o tempo de impacto ou HP restante indicar necessidade, múltiplos canhões podem convergir no mesmo inimigo, caso contrário distribuem-se pelos seguintes itens da fila. A lógica passa a ignorar `applyMultishotSpread` sempre que o nível 3 estiver ativo e, em vez disso, recalcula vetores individuais por canhão usando os pontos previstos armazenados em `predictedAimPointsMap`.【F:src/modules/CombatSystem.js†L344-L447】【F:src/modules/CombatSystem.js†L412-L470】【F:src/modules/CombatSystem.js†L508-L526】【F:src/modules/CombatSystem.js†L923-L945】
- **Progressão:** manter o pré-requisito de possuir pelo menos `multishot` nível 1 para desbloquear o upgrade, mas ao atingi-lo travar o número mínimo de canhões em quatro independentemente do multiplicador de disparos original. Ajustar `computeLockCount` e a configuração `multiLockTargets` para refletir o novo teto, além de recalibrar o multiplicador de recarga via `setShootCooldown` para equilibrar o volume de tiros adicionais.【F:src/modules/CombatSystem.js†L632-L678】【F:src/modules/CombatSystem.js†L826-L839】
- **VFX:** redesenhar o feedback de multitrava exibindo quatro canais distintos; quando múltiplos canhões convergirem no mesmo alvo, variar largura e intensidade do feixe para comunicar a concentração de fogo. Manter coesão com os arcos já renderizados em `render` para cada lock.【F:src/modules/CombatSystem.js†L1350-L1393】
- **SFX:** modular `playLaserShot` adicionando camadas rítmicas discretas por canhão. Empilhar ataques no mesmo alvo reforça o volume e mantém pitch consistente com o número de feixes ativos, reutilizando o batching atual para evitar clipping.【F:src/modules/AudioSystem.js†L344-L372】

## Próximos Passos
1. Realizar sessões de playtest direcionadas para validar a nova função de impacto iminente—incluindo cenários em que múltiplos canhões convergem num mesmo alvo—ajustando pesos apenas se parasitas/voláteis perderem prioridade injustificadamente.【F:src/core/GameConstants.js†L1094-L1122】【F:src/modules/CombatSystem.js†L923-L945】
2. Implementar testes automatizados cobrindo o reset de pesos e a distribuição de canhões após `progression-reset`, garantindo que o estado da bateria coordenada retorne ao baseline quando upgrades são removidos.【F:src/modules/CombatSystem.js†L600-L720】【F:src/modules/CombatSystem.js†L344-L447】
3. Corrigir o bug do indicador preditivo garantindo que seja limpo ao detectar `player.isDead` ou que `render` valide esse estado antes de desenhar os círculos auxiliares; adicionar testes de regressão para travas visuais pós-morte.【F:src/modules/CombatSystem.js†L1350-L1423】
4. Avaliar mixagem de áudio e sobreposição visual com quatro canhões simultâneos, certificando-se de que os feixes concentrados não estouram ganho nem saturam a camada de disparo coordenado.【F:src/modules/AudioSystem.js†L344-L372】【F:src/modules/CombatSystem.js†L1350-L1423】
