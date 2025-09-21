# Checklist de Validação de UI

Este documento orienta a execução de testes manuais sempre que fluxos de interface ou HUD forem alterados. Marque cada cenário após validar em build local.

## Base das telas

- [ ] Menu principal apresenta título, instruções e botão **Iniciar Missão** funcionais.
- [ ] Tela de pausa aparece/oculta corretamente via `Esc`, mantendo o jogo congelado.
- [ ] Tela de game over exibe level, kills, ondas e tempo com valores consistentes com a run encerrada.

## HUD unificado e data-driven

### Resolução desktop (≥ 1280px)

- [ ] Elementos do HUD são renderizados segundo o esquema `src/data/ui/hudLayout.js`, sem valores estáticos no HTML.
- [ ] Indicador de integridade atualiza via evento `player-health-changed` e aplica estado de perigo abaixo de 35% da vida máxima.
- [ ] Escudo alterna entre travado, pronto, ativo e cooldown, exibindo overlay proporcional ao tempo restante.
- [ ] Painel de ondas reflete progresso (`wave-state-updated`), mostra countdown entre ondas e aplica destaque de alerta durante a pausa entre setores.
- [ ] Barra de XP reage ao evento `experience-changed` e reseta corretamente após level up.

### Viewport reduzida (≤ 900px)

- [ ] HUD reorganiza elementos em duas colunas sem sobrepor o canvas.
- [ ] Painel de ondas ocupa toda a largura disponível e mantém textos legíveis.
- [ ] Contador de ondas permanece visível e alinhado quando ativado.

## Pós-partida

- [ ] Estatísticas finais mantêm consistência com os dados emitidos em `player-died` (level, kills, ondas, tempo).

> Sempre que um cenário acima for impactado, execute a validação correspondente e atualize este checklist com novos casos quando necessário.
