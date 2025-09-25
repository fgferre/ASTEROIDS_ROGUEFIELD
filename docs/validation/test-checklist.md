# Checklist de Validação de UI

Este documento orienta a execução de testes manuais sempre que fluxos de interface ou HUD forem alterados. Marque cada cenário após validar em build local.

## Base das telas

- [x] Menu principal apresenta título, instruções e botão **Iniciar Missão** funcionais.
- [x] Tela de pausa aparece/oculta corretamente via `Esc`, mantendo o jogo congelado.
- [x] Tela de game over exibe level, kills, ondas e tempo com valores consistentes com a run encerrada.

## HUD unificado e data-driven

### Resolução desktop (≥ 1280px)

- [x] Elementos do HUD são renderizados segundo o esquema `src/data/ui/hudLayout.js`, sem valores estáticos no HTML.
- [x] Indicador de integridade atualiza via evento `player-health-changed` e aplica estado de perigo abaixo de 35% da vida máxima.
- [x] Escudo alterna entre travado, pronto, ativo e cooldown, exibindo overlay proporcional ao tempo restante.
- [x] Consumo de hits do escudo reduz visualmente os segmentos e aplica pulso no cartão.
- [x] Painel de ondas reflete progresso (`wave-state-updated`), mostra countdown entre ondas e aplica destaque de alerta durante a pausa entre setores. Contador agora aparece como overlay no campo de jogo sem deslocar o canvas.
- [x] Countdown de ondas apresenta estado de alerta nos últimos 5 segundos e o painel destaca períodos de intervalo/conclusão.
- [x] Barra de XP reage ao evento `experience-changed` e reseta corretamente após level up.
- [x] Pulses visuais para XP, kills, tempo e level up são disparados ao ganhar experiência, eliminar inimigos ou subir de nível.

### Viewport reduzida (≤ 900px)

- [x] HUD reorganiza elementos em duas colunas sem sobrepor o canvas.
- [x] Painel de ondas ocupa toda a largura disponível e mantém textos legíveis.
- [x] Contador de ondas permanece visível e alinhado quando ativado. Overlay fixa-se ao topo do campo de jogo e não empurra o conteúdo em telas menores.

## Tutorial interativo

- [ ] Primeira execução: ao clicar em **Iniciar missão** o treinamento interativo é exibido e o jogo só começa após o término do tutorial.
- [ ] Após concluir o tutorial uma vez, novas partidas iniciam imediatamente ao clicar em **Iniciar missão**, sem repetir as etapas.
- [ ] O botão **Rever tutorial** reinicia o treinamento completo sem lançar a partida automaticamente ao término.

## Level up e upgrades

- [ ] A tela de level up exibe cards com categoria, nível atual e resumo do próximo nível disponível para cada upgrade.
- [ ] Navegação por teclado ou gamepad percorre as opções na ordem visual e o botão de confirmar aplica o upgrade focado.
- [ ] Pré-requisitos aparecem com indicadores de concluído/bloqueado, refletindo corretamente o estado atual.
- [ ] Quando não há upgrades disponíveis, a partida retorna automaticamente sem ficar presa na tela de seleção.

## Acessibilidade e responsividade

- [ ] O toggle **Modo daltônico** aplica a nova paleta em HUD e cards de upgrade mantendo contraste AA mínimo.
- [ ] O ajuste **Aumentar contraste do HUD** e o tema padrão alternam corretamente os tokens sem gerar conflitos com modo escuro.
- [ ] Ativar **Reduzir movimentos intensos** e **Reduzir partículas** elimina tremores/flashes agressivos e reduz a densidade de efeitos sem travamentos visíveis.
- [ ] Mudança de estágio das rachaduras respeita `Reduzir partículas`, mostrando apenas o overlay sem detritos extras.
- [ ] HUD, menu e tela de level up permanecem legíveis em 1366×768, 1920×1080 e larguras ≤ 900px, sem recortes ou sobreposição do canvas.
- [ ] Verificar contraste (WCAG AA) nos elementos críticos (botões primários, indicadores de HUD, barras de XP) em ambos os temas.

## Pós-partida

- [x] Estatísticas finais mantêm consistência com os dados emitidos em `player-died` (level, kills, ondas, tempo).

## Progressão e Performance

- [ ] Ganho de XP em cadeia (coletar múltiplos orbes grandes) mantém o excedente após subir mais de um nível e dispara os eventos `experience-changed` e `player-leveled-up` na ordem correta.
- [ ] Stress test com 100+ orbes ativos mantém FPS estável após o caching de sprites/gradientes do XPOrbSystem (sem quedas abruptas nem GC visível a cada frame).
- [ ] Stress test com ondas de 25 asteroides e fragmentações em sequência mantém a detecção de colisões responsiva usando o PhysicsSystem (sem projéteis atravessando inimigos ou congelamentos).
- [x] Verificar colisões entre nave e asteroides com o PhysicsSystem habilitado, garantindo que empurrões, danos e escudo sejam aplicados corretamente mesmo em ondas densas _(consolidado no PhysicsSystem; revalidar nos próximos stress tests)._ 

> Sempre que um cenário acima for impactado, execute a validação correspondente e atualize este checklist com novos casos quando necessário.
