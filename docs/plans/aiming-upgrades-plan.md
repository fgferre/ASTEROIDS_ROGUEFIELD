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

## Upgrade 1 — Matriz de Ameaça Adaptativa
**Objetivo:** tornar a seleção de alvo responsiva a ameaças reais, levando em conta periculosidade, iminência de impacto e robustez do inimigo.

- **Mecânica:** reestruturar `findBestTarget` para calcular uma `dangerScore` em camadas. A pontuação inicia com a variante (caçadora > explosiva > padrão), soma o valor de recompensa e aplica ajustes por direção, velocidade e tamanho. Em seguida, introduzir um termo de **iminência de impacto** que estima o tempo até colisão projetando a trajetória relativa entre inimigo e nave. Esse termo aumenta exponencialmente quando o tempo estimado fica abaixo de limites configuráveis e pode multiplicar-se por um fator dependente do HP atual do inimigo, permitindo distinguir ameaças que exigem fogo concentrado.【F:src/modules/CombatSystem.js†L175-L217】
- **Distribuição de Canhões:** expor a `dangerScore` reordenada para um escalonador que define quantos canhões devem mirar cada alvo prioritário. O escalonador deve ponderar `dangerScore` e HP residual para decidir entre concentrar (todos os canhões em uma ameaça crítica) ou dividir (alocar canhões diferentes para alvos com tempos de impacto semelhantes). Parametrizar limites em `GameConstants` para evitar decisões erráticas.
- **Progressão:** o primeiro nível do novo galho habilita essa matriz completa com termos configuráveis e mantém compatibilidade com o tiro padrão (uma emissão). Persistir pesos, limites de iminência e curvas de concentração em novo bloco de `GameConstants` para ajustes futuros.【F:src/core/GameConstants.js†L1086-L1094】
- **VFX:** reforçar lock no alvo principal intensificando o traço e acrescentar ícones sutis sobre alvos secundários quando canhões forem divididos, permitindo leitura rápida da distribuição. Ajustar `render` para piscar o retículo quando a concentração for alterada.【F:src/modules/CombatSystem.js†L565-L585】
- **SFX:** reaproveitar o blip de aquisição com variantes de pitch que indiquem redistribuição de canhões (grave para foco total, agudo para divisão), usando `_scheduleBatchedSound` para evitar saturação.【F:src/modules/AudioSystem.js†L344-L372】

## Upgrade 2 — Núcleo de Predição Dinâmica
**Objetivo:** melhorar precisão de tiros em alvos móveis e comunicar claramente o ponto previsto.

- **Mecânica:** atualizar `getPredictedTargetPosition` para calcular tempo de interceptação com base na distância atual e velocidade do projétil (`this.bulletSpeed`), ao invés de tempo fixo. Resolver equação de movimento linear (lead de primeiro grau) e permitir fallback para predição atual se o denominador for instável.【F:src/modules/CombatSystem.js†L288-L321】
- **Integração com a Matriz de Ameaça:** alimentar o termo de iminência com o tempo de interceptação calculado, garantindo que a redistribuição de canhões reaja imediatamente quando uma ameaça passa a ter trajetória crítica.
- **Progressão:** segundo nível do galho refina o cálculo dinâmico, desbloqueia filtros de suavização para evitar jitter e reduz `TARGET_UPDATE_INTERVAL` para reforçar responsividade.【F:src/modules/CombatSystem.js†L158-L218】【F:src/core/GameConstants.js†L1086-L1094】
- **VFX:** renderizar pequeno marcador no ponto previsto (retículo translúcido) sincronizado com o traço de ligação nave→alvo, reforçando feedback da mira avançada. O marcador deve apagar imediatamente quando a nave é destruída para evitar resíduos visuais.【F:src/modules/CombatSystem.js†L565-L585】
- **SFX:** adicionar sutil carregamento ascendente misturado ao som padrão de disparo quando a predição dinâmica está ativa, modulando parâmetros do `playLaserShot` (leve aumento de pitch inicial) para comunicar upgrade sem poluir mix.【F:src/modules/AudioSystem.js†L344-L372】

## Upgrade 3 — Quádrupla de Canhões Coordenados
**Objetivo:** transformar o arsenal em quatro canhões independentes com protocolo de priorização inteligente, abolindo o padrão de `spread shot`.

- **Mecânica:** ao alcançar o nível 3 (exige `multishot` nível 1 já adquirido), substituir completamente o disparo em leque por quatro canhões independentes. Cada canhão recebe do escalonador a lista ordenada de alvos e decide em tempo real se mantém foco conjunto ou alterna para um alvo secundário. Caso o sistema identifique ameaça singular com `dangerScore` muito acima do restante, todos os canhões são sincronizados nesse alvo; caso contrário, o algoritmo distribui 2-1-1 ou 1-1-1-1 conforme pesos parametrizados. Os disparos continuam obedecendo ao tempo de recarga global, mas a emissão passa a ser simultânea, cada canhão aplicando predição própria sobre o alvo designado.【F:src/modules/CombatSystem.js†L236-L321】【F:src/modules/CombatSystem.js†L588-L595】
- **Balanceamento:** introduzir constantes dedicadas para limites de concentração (diferença mínima de `dangerScore` para focar), custo de energia/recarga ao usar quatro canhões e curvas de priorização quando múltiplos inimigos possuem HP elevado.
- **VFX:** remover completamente efeitos de dispersão; em seu lugar, quatro traços retos partem da nave com códigos de cor distintos para cada canhão, além de partículas extras nos pontos de impacto simultâneos. Integrar com o renderizador de indicadores para destacar visualmente quais alvos recebem múltiplos canhões.【F:src/modules/CombatSystem.js†L565-L585】【F:src/modules/EffectsSystem.js†L296-L360】
- **SFX:** substituir o som de disparo em leque por camada densa de quatro impulsos sincronizados, mantendo controle de mixagem via `AudioSystem`. O volume/pitch deve refletir se os canhões estão concentrados ou divididos, evitando clipping quando todos atingem o mesmo alvo.【F:src/modules/AudioSystem.js†L344-L372】

## Próximos Passos
1. Realizar sessões de playtest focadas em confirmar que a matriz de ameaça reage corretamente a inimigos perseguidores e ao termo de iminência, validando também o algoritmo de concentração/divisão dos quatro canhões.【F:src/core/GameConstants.js†L1094-L1122】
2. Criar testes automatizados que cubram reset de pesos, limites de iminência e desativação imediata dos indicadores preditivos quando `playerDestroyed` é emitido, prevenindo resíduos visuais após morte.【F:src/modules/CombatSystem.js†L600-L720】
3. Avaliar mixagem e feedback visual dos quatro canhões em cenários de foco total versus distribuição, garantindo leitura clara e sem clipping mesmo quando múltiplos impactos ocorrem simultaneamente.【F:src/modules/AudioSystem.js†L340-L410】
