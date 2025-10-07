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

## Diretrizes Gerais para Upgrades
- Persistir parâmetros em `GameConstants` ou arquivos de dados, mantendo abordagem data-driven já utilizada no projeto.【F:src/core/GameConstants.js†L1086-L1091】
- Reutilizar eventos globais existentes (`weapon-fired`, `bullet-created`, `bullet-hit`) para expandir VFX/SFX sem criar canais paralelos, garantindo compatibilidade com sistemas de efeitos e áudio atuais.【F:src/modules/CombatSystem.js†L269-L360】【F:src/modules/EffectsSystem.js†L296-L339】【F:src/modules/AudioSystem.js†L93-L147】

## Upgrade 1 — Matriz de Aquisição Adaptativa
**Objetivo:** tornar a seleção de alvo responsiva a ameaças ao invés de apenas proximidade.

- **Mecânica:** estender `findBestTarget` para calcular uma `dangerScore` composta. A pontuação começa com o peso da variante (caçadora > explosiva > padrão), adiciona modificador por recompensa prometida e só então avalia direção (vetor apontado para o jogador), velocidade relativa e tamanho como ajustes finos. Cada fator recebe peso configurável, garantindo que a tipagem do inimigo governe a prioridade final enquanto ainda se considera periculosidade derivada de movimento e massa.【F:src/modules/CombatSystem.js†L175-L217】
- **Progressão:** criar um novo galho de upgrades focado em mira; o nível inicial ativa a `dangerScore` básica, níveis seguintes refinam multiplicadores (ex.: valorizam variantes explosivas quando próximas). Persistir pesos em novo bloco de `GameConstants` para permitir ajustes sem tocar na lógica.【F:src/core/GameConstants.js†L1086-L1094】
- **VFX:** reforçar lock em alvo prioritário intensificando o traço renderizado (espessura/alpha temporários) e adicionando breve pulso radial quando a prioridade muda. Ajustar trecho de `render` responsável pelo indicador usando timers ligados ao evento de troca de alvo.【F:src/modules/CombatSystem.js†L565-L585】
- **SFX:** disparar breve blip de aquisição via `AudioSystem` quando o alvo prioritário troca, reaproveitando infraestrutura de agendamento (`_scheduleBatchedSound`) para evitar saturação.【F:src/modules/AudioSystem.js†L344-L372】

## Upgrade 2 — Núcleo de Predição Dinâmica
**Objetivo:** melhorar precisão de tiros em alvos móveis e comunicar claramente o ponto previsto.

- **Mecânica:** atualizar `getPredictedTargetPosition` para calcular tempo de interceptação com base na distância atual e velocidade do projétil (`this.bulletSpeed`), ao invés de tempo fixo. Resolver equação de movimento linear (lead de primeiro grau) e permitir fallback para predição atual se o denominador for instável.【F:src/modules/CombatSystem.js†L288-L321】
- **Progressão:** segundo nível do novo galho habilita o cálculo dinâmico; níveis posteriores podem adicionar ajuste extra (p. ex. compensação de aceleração estimada a partir da diferença de posição entre `target` updates) e reduzir `TARGET_UPDATE_INTERVAL` para reforçar responsividade.【F:src/modules/CombatSystem.js†L158-L218】【F:src/core/GameConstants.js†L1086-L1094】
- **VFX:** renderizar pequeno marcador no ponto previsto (ex.: retículo translúcido) sincronizado com o traço de ligação nave→alvo, reforçando feedback da mira avançada.【F:src/modules/CombatSystem.js†L565-L585】
- **SFX:** adicionar sutil carregamento ascendente misturado ao som padrão de disparo quando a predição dinâmica está ativa, modulando parâmetros do `playLaserShot` (leve aumento de pitch inicial) para comunicar upgrade sem poluir mix.【F:src/modules/AudioSystem.js†L344-L372】

## Upgrade 3 — Suite de Multi-Trava Coordenada
**Objetivo:** explorar sinergia com tiros múltiplos e criar momentos de poder focados.

- **Mecânica:** quando o jogador possuir `multishot > 1`, permitir que níveis avançados de upgrade fixem múltiplos alvos simultâneos antes de cada rajada. A lógica pode iterar `enemies.forEachActiveAsteroid` e preencher lista ordenada por prioridade, aplicando `applyMultishotSpread` em direção a cada alvo individual (caso disponível) e reutilizando disparo atual como fallback.【F:src/modules/CombatSystem.js†L252-L321】【F:src/modules/CombatSystem.js†L193-L321】
- **Progressão:** terceiro nível do galho torna-se disponível apenas após o jogador alcançar ao menos `multishot` nível 1, garantindo sinergia. O primeiro patamar dentro desse nível concede mira dividida entre dois alvos distintos; subsequentes aumentam contagem e reduzem `shootCooldown` via `setShootCooldown`, mantendo limites de balanceamento através de constantes dedicadas.【F:src/modules/CombatSystem.js†L236-L321】【F:src/modules/CombatSystem.js†L588-L595】
- **VFX:** desenhar múltiplos arcos de bloqueio alternando cores, e gerar partículas de muzzle flash extras proporcionalmente ao número de travas para reforçar intensidade visual.【F:src/modules/CombatSystem.js†L565-L585】【F:src/modules/EffectsSystem.js†L296-L360】
- **SFX:** compor corda curta de tons ascendentes (usar camada adicional em `playLaserShot` ou um novo evento dedicado) cuja duração/complexidade acompanha a quantidade de alvos simultâneos, mantendo compatibilidade com batching de áudio.【F:src/modules/AudioSystem.js†L344-L372】

## Próximos Passos
1. Realizar sessões de playtest direcionadas para validar a ordem de prioridade configurada e ajustar pesos apenas se parasitas/voláteis não liderarem os locks como previsto.【F:src/core/GameConstants.js†L1094-L1122】
2. Criar testes automatizados que cubram o reset de pesos ao aplicar o nível 1 e a restauração completa após `progression-reset`, evitando regressões silenciosas no fluxo de upgrades.【F:src/modules/CombatSystem.js†L600-L720】
3. Avaliar mixagem de áudio e sobreposição visual quando `lockCount > 1`, garantindo que o ganho incremental e o pitch escalonado permaneçam audíveis sem clipping durante cenários de multishot prolongados.【F:src/modules/AudioSystem.js†L340-L410】
