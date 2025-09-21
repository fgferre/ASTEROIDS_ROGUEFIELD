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
- [x] Painel de ondas reflete progresso (`wave-state-updated`), mostra countdown entre ondas e aplica destaque de alerta durante a pausa entre setores. Contador agora aparece como overlay no campo de jogo sem deslocar o canvas.
- [x] Barra de XP reage ao evento `experience-changed` e reseta corretamente após level up.

### Viewport reduzida (≤ 900px)

- [x] HUD reorganiza elementos em duas colunas sem sobrepor o canvas.
- [x] Painel de ondas ocupa toda a largura disponível e mantém textos legíveis.
- [x] Contador de ondas permanece visível e alinhado quando ativado. Overlay fixa-se ao topo do campo de jogo e não empurra o conteúdo em telas menores.

## Pós-partida

- [x] Estatísticas finais mantêm consistência com os dados emitidos em `player-died` (level, kills, ondas, tempo).

> Sempre que um cenário acima for impactado, execute a validação correspondente e atualize este checklist com novos casos quando necessário.
