# Checklist de Validação de UI

Este documento orienta a execução de testes manuais sempre que fluxos de interface ou HUD forem alterados. Marque cada cenário após validar em build local.

## Base das telas

- [X] Menu principal apresenta título, instruções e botão **Iniciar Missão** funcionais.
- [X] Tela de pausa aparece/oculta corretamente via `Esc`, mantendo o jogo congelado.
- [X] Tela de game over exibe level, kills, ondas e tempo com valores consistentes com a run encerrada.

## HUD unificado e data-driven

### Resolução desktop (≥ 1280px)

- [X] Elementos do HUD são renderizados segundo o esquema `src/data/ui/hudLayout.js`, sem valores estáticos no HTML.
- [X] Indicador de integridade atualiza via evento `player-health-changed` e aplica estado de perigo abaixo de 35% da vida máxima.
- [X] Escudo alterna entre travado, pronto, ativo e cooldown, exibindo overlay proporcional ao tempo restante.
- [X] Painel de ondas reflete progresso (`wave-state-updated`), mostra countdown entre ondas e aplica destaque de alerta durante a pausa entre setores. -> Bug aqui: o wave count down quando aparece joga todo conteúdo incluindo a tela do jogo para baixo. Acho que o wave countdown poderia ser um overlay num canto do mapa para que isso nao aconteça.
- [X] Barra de XP reage ao evento `experience-changed` e reseta corretamente após level up.

### Viewport reduzida (≤ 900px)

- [X] HUD reorganiza elementos em duas colunas sem sobrepor o canvas.
- [X] Painel de ondas ocupa toda a largura disponível e mantém textos legíveis.
- [X] Contador de ondas permanece visível e alinhado quando ativado. -> Bug aqui: o wave count down quando aparece joga todo conteúdo incluindo a tela do jogo para baixo. Acho que o wave countdown poderia ser um overlay num canto do mapa para que isso nao aconteça.


## Pós-partida

- [X] Estatísticas finais mantêm consistência com os dados emitidos em `player-died` (level, kills, ondas, tempo).

> Sempre que um cenário acima for impactado, execute a validação correspondente e atualize este checklist com novos casos quando necessário.
