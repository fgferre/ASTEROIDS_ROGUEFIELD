# Plano Mestre de Implementação da Pasta `docs`

**Atualizado em 2025-10-10.** Este plano substitui todos os documentos operacionais anteriores localizados em `docs/` (agora arquivados em `docs/archive/2025-plan/`). Ele consolida todas as ações pendentes identificadas durante a revisão documental e define responsáveis, sequência e critérios de aceite para a próxima etapa de desenvolvimento do projeto.

## 1. Governança da Documentação
- **Cadência de revisão:** reunião quinzenal para avaliar progresso deste plano e atualizar o tracker (`docs/progress/docs-review-tracker.md`).
- **Responsáveis:** gpt-5-codex (coordenação), equipe de gameplay (execução), equipe de UI/UX (seções 2.x), equipe de engenharia (seções 3.x e 4.x).
- **Ferramentas:** board único com colunas `Planejado → Em andamento → Em validação → Concluído`, vinculado aos itens deste plano.
- **Check de encerramento:** cada item deve ter link para PR, data de validação e atualização correspondente no tracker.

## 2. UI e Experiência do Jogador

### 2.1 HUD tático minimalista (origem: `hud-redesign-proposal.md`, `hud-refined-redesign.md`, `hud-overlay-refactor.md`, `Guia_impllementação_Melhorias_UIUX`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 2.1.A Consolidar layout final | Escolher versão oficial (Minimal Tactical HUD) conciliando métricas das duas propostas. | (1) Definir wireframe final; (2) validar tokens em `style.css`; (3) aprovar com equipe de gameplay. | Documento de decisão anexado + mockup atualizado na pasta `assets/ui`. | UI/UX |
| 2.1.B Atualizar `HUD_LAYOUT` e `UISystem` | Implementar layout compacto com agrupamento horizontal, sem labels redundantes. | (1) Refatorar `src/data/ui/hudLayout.js`; (2) ajustar componentes em `UISystem`; (3) garantir responsividade 16:9 e 4:3. | Build exibindo HUD reduzido, sem sobreposição nos cantos; screenshot anexada ao PR. | Gameplay |
| 2.1.C Ajustes de acessibilidade e testes | Garantir contraste, leitura e telemetria de foco. | (1) Introduzir modo alto contraste; (2) adicionar métricas de tempo em HUD; (3) validar com checklist UI. | Checklist de acessibilidade preenchido + logs de telemetria disponíveis. | QA/UI |

### 2.2 Tela inicial e onboarding (origem: `start-screen-integration-plan.md`, `start-screen-mockup.html`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 2.2.A Harmonizar assets | Unificar mockup HTML com componentes atuais da UI. | (1) Converter mockup para componente Vite; (2) padronizar fontes/cores; (3) remover duplicações. | Tela inicial idêntica ao mockup aprovado; screenshots anexadas. | UI/UX |
| 2.2.B Fluxo de onboarding | Garantir transição suave entre start screen, seleção e gameplay. | (1) Definir estados no `UISystem`; (2) criar eventos no `gameEvents`; (3) adicionar testes manuais no checklist. | Jogador inicia partida em ≤3 cliques; sem estados quebrados ao reentrar. | Gameplay |

## 3. Progressão, Recompensas e Economia

### 3.1 Sistema de recompensas e orbs (origem: `xp-drop-system-analysis.md`, `orb-reward-mechanics-analysis.md`, `REWARD-SYSTEM-FIX-SUMMARY.md`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 3.1.A Auditoria de drops de XP | Confirmar que fluxos de drop atendem aos thresholds planejados. | (1) Instrumentar métricas por dificuldade; (2) revisar `RewardManager`; (3) atualizar documentação em `GameConstants`. | Relatório com distribuição por wave + ajuste aplicado (se necessário). | Gameplay |
| 3.1.B Recompensas contextuais | Avaliar introdução de variações (combo, streaks) pendentes. | (1) Revisar recomendações do documento; (2) prototipar efeitos; (3) validar impacto em progressão. | Decisão documentada (implementar ou descartar) com justificativa e métricas. | Design |
| 3.1.C Atualizar documentação de referência | Substituir resumo antigo por guia vivo no README de economia. | (1) Criar seção em `GameConstants` docstring; (2) anexar tabelas de drop. | README atualizado, citando commits de ajustes recentes. | Docs |

### 3.2 Evolução de upgrades de motor (origem: `engine-upgrade-system*.md`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 3.2.A Consolidar curva final | Escolher curva definitiva (v3 + ajustes) e documentar trade-offs. | (1) Revisar métricas de performance; (2) definir thresholds; (3) atualizar `src/data/upgrades`. | Gráfico comparativo anexado + planilha de balanceamento atualizada. | Design |
| 3.2.B Telemetria de upgrades | Instrumentar coleta de uso por partida. | (1) Adicionar eventos; (2) enviar dados para painel de analytics; (3) revisar a cada sprint. | Dashboard com % de escolha por nível disponível. | Engenharia |

## 4. Arquitetura e Infraestrutura Técnica

### 4.1 Migração DI + WaveManager (origem: `phase-2-architecture.md`, `phase-2-1-completion-report.md`, `phase-2-2-*`, `EnemySystem.old.js`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 4.1.A Concluir migração para `diContainer` | Eliminar dependências diretas de `gameServices.get()`. | (1) Implementar injeção por construtor; (2) atualizar `ServiceLocatorAdapter`; (3) remover usos legados. | Build sem chamadas diretas a `gameServices` fora do adaptador; testes de fumaça passando. | Engenharia |
| 4.1.B Reativar WaveManager modular | Finalizar etapa 2.2 do plano original. | (1) Extrair lógica de spawn do `EnemySystem`; (2) implementar ciclo de ondas configurável; (3) validar com ferramentas de progressão. | Waves parametrizadas em arquivo de dados + testes manuais validados. | Gameplay |
| 4.1.C Plano de expansão futura | Preparar hooks para telemetria/bosses descritos em `phase-2-2-future-expansion-ready.md`. | (1) Definir interfaces; (2) criar tasks no backlog; (3) documentar dependências. | Roadmap registrado no tracker com responsáveis e estimativas. | Engenharia |

### 4.2 Monitoramento de performance (origem: `baseline-metrics.md`, `performance-monitor-guide.md`, `how-to-send-performance-data.md`, `phase-1-performance.md`, `test-batch-rendering.html`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 4.2.A Atualizar métricas base | Reexecutar benchmarks com build atual. | (1) Rodar `npm run stress` (collision-stress.js) e `node scripts/benchmarks/performance-baseline.js`; (2) registrar FPS, memória, CPU; (3) atualizar doc público. | Planilha com métricas 2025-Q4 anexada ao repositório. | Performance |
| 4.2.B Automação de coleta | Integrar monitoramento ao CI/manual. | (1) Expor CLI para `performanceMonitor`; (2) anexar logs automaticamente ao PR. | Workflow CI gerando artefatos de performance em cada PR relevante. | Engenharia |
| 4.2.C Higienizar protótipos | Revisar protótipos legados (batch/audio). | (1) Documentar quais técnicas já estão no motor; (2) remover código redundante. | README curto anexado ao repositório de protótipos; itens obsoletos removidos do build. | Performance |

## 5. Feedback Sensorial e Polish (origem: `phase-3-juice-polish.md`, `vfx-sfx-current-state.md`, `death-explosion-flow-analysis.md`, `asteroid-break-enhancement.md`, `test-audio-optimization.html`, `consolidation-polish-masterplan.md`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 5.1.A Indicadores direcionais | Implementar setas/compass para objetivos fora da tela. | (1) Definir assets; (2) integrar com `EffectsSystem`; (3) validar UX. | Jogador recebe feedback visual consistente; testado em 3 resoluções. | UI/UX |
| 5.1.B SFX/UI pendentes | Completar sons de interface e eventos de progressão. | (1) Mapear lacunas; (2) produzir assets; (3) ajustar mixagem. | Checklist de áudio atualizado; assets versionados. | Áudio |
| 5.1.C Polimento de asteroides | Aplicar melhorias de fragmentação e feedback descritas. | (1) Revisar colisões no `PhysicsSystem`; (2) adicionar partículas multiestágio; (3) medir impacto em performance. | Quebra de asteroides apresenta feedback visual consistente sem queda de FPS >5%. | Gameplay |
| 5.1.D Revisão explosão da nave | Garantir sincronização entre VFX, delays e retorno ao menu. | (1) Revisar timers; (2) alinhar com novos efeitos; (3) validar com testes de fluxo de game over. | Sequência executa sem congelamentos e com logs de estado no console. | Gameplay |

## 6. Documentação e Processo

### 6.1 Checklists e critérios de saída (origem: `implementation-checklist.md`, `test-checklist.md`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 6.1.A Unificar checklists | Consolidar itens de implementação e teste em um único documento vivo. | (1) Criar novo `docs/checklists/implementation-and-test.md`; (2) remover duplicidades; (3) alinhar com DoD. | Checklist único publicado e referenciado nas PRs. | QA |
| 6.1.B Integrar com CI | Garantir que itens críticos possuem verificação automatizada. | (1) Mapear itens automatizáveis; (2) ajustar pipelines; (3) documentar exceções. | Pipeline CI falha se checklist crítico não estiver marcado. | Engenharia |

### 6.2 Consolidação de backlog e prompts (origem: `completed-prompts.md`, `Guia Completo de Refatoração Modular - Prompts Pas.md`, `improvement-roadmap.md`, `consolidation-polish-masterplan.md`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 6.2.A Normalizar histórico de prompts | Converter prompts relevantes em guias ou remover redundância. | (1) Extrair itens acionáveis; (2) mover para wiki/README; (3) apagar duplicados. | Registro único de prompts ativos + histórico ordenado por data. | Docs |
| 6.2.B Backlog consolidado | Fundir roadmap antigo com este plano. | (1) Revisar `improvement-roadmap`; (2) criar épicos correspondentes no board; (3) atualizar priorização. | Board refletindo 100% das iniciativas listadas aqui. | Coordenação |

### 6.3 Plano de documentação final (origem: `phase-4-documentation.md`, `docs-audit-plan.md`, `README.md`, `week-1-session-1-report.md`)
| Item | Objetivo | Passos principais | Critério de aceite | Responsável |
|------|----------|-------------------|--------------------|-------------|
| 6.3.A Guia de manutenção da pasta `docs` | Criar README único com estrutura simplificada. | (1) Descrever nova hierarquia; (2) definir política de arquivamento; (3) atualizar tracker automaticamente. | `docs/README.md` publicado com fluxos atualizados. | Docs |
| 6.3.B Histórico resumido | Transformar logs antigos em timeline concisa. | (1) Revisar `week-1-session-1-report` e demais registros; (2) agregar em `docs/progress/historico_do_projeto.txt`; (3) adicionar âncoras por fase. | Histórico tem índice cronológico com links para PRs relevantes. | Coordenação |

## 7. Sequenciamento sugerido
1. **Sprint Atual (Semanas 41-42):** Seções 2.1, 4.1.A, 4.2.A, 6.1.A.
2. **Sprint Seguinte (Semanas 43-44):** Seções 2.2, 3.1.A-B, 4.1.B, 5.1.C-D.
3. **Sprint Posterior (Semanas 45-46):** Seções 3.2, 4.1.C, 4.2.B-C, 5.1.A-B, 6.2-6.3.

Progresso deve ser reportado no tracker com data, responsável e link do PR. Ajustes de escopo devem ser aprovados na cadência quinzenal.

## 8. Tabela de rastreabilidade de documentos arquivados
| Documento arquivado (`docs/archive/2025-plan/...`) | Status anterior | Nova referência neste plano |
|----------------------------------------------------|-----------------|-----------------------------|
| analysis/docs-audit-plan.md.old | ✅ Em uso | Seção 6.3.A |
| analysis/hud-redesign-proposal.md.old | ⏳ Não implementado | Seção 2.1 |
| analysis/hud-refined-redesign.md.old | ⏳ Não implementado | Seção 2.1 |
| analysis/vfx-sfx-current-state.md.old | ✅ Implementado (parcial) | Seção 5.1 |
| analysis/death-explosion-flow-analysis.md.old | ✅ Implementado (monitorar) | Seção 5.1 |
| analysis/xp-drop-system-analysis.md.old | ✅ Implementado (monitorar) | Seção 3.1 |
| archive/README.md.old | ✅ Atual | Seção 6.3.A |
| archive/EnemySystem.old.js.old | 📦 Histórico | Seção 4.1 |
| balance/REWARD-SYSTEM-FIX-SUMMARY.md.old | ✅ Implementado | Seção 3.1 |
| balance/baseline-metrics.md.old | ✅ Atual | Seção 4.2 |
| balance/orb-reward-mechanics-analysis.md.old | ⏳ Atualizar | Seção 3.1 |
| design/engine-upgrade-system*.md.old | 📦/✅ misto | Seção 3.2 |
| guides/implementation-checklist.md.old | ✅ Atualizado | Seção 6.1 |
| guides/performance-monitor-guide.md.old | ✅ Implementado | Seção 4.2 |
| guides/how-to-send-performance-data.md.old | ✅ Implementado | Seção 4.2 |
| guides/phase-2-architecture.md.old | ⏳ Em andamento | Seção 4.1 |
| guides/phase-2-1-completion-report.md.old | ✅ Concluído | Seção 4.1 |
| guides/phase-2-2-actual-state.md.old | ✅ Atual | Seção 4.1 |
| guides/phase-2-2-completion-report.md.old | 📦 Histórico | Seção 4.1 |
| guides/phase-3-juice-polish.md.old | ⏳ Em andamento | Seção 5.1 |
| guides/phase-4-documentation.md.old | ⏳ Planejar | Seção 6.3 |
| guides/hud-overlay-refactor.md.old | ⏳ Em andamento | Seção 2.1 |
| guides/asteroid-break-enhancement.md.old | ⏳ Validar | Seção 5.1 |
| guides/improvement-roadmap.md.old | ⏳ Revisar | Seção 6.2 |
| guides/start-screen-integration-plan.md.old | ⏳ Em andamento | Seção 2.2 |
| guides/consolidation-polish-masterplan.md.old | ⏳ Revisar | Seções 5.1 / 6.2 |
| guides/archive/phase-1-performance.md.old | 📦 Arquivado | Seção 4.2 |
| guides/archive/phase-2-2/*.md.old | Variado | Seção 4.1 |
| progress/week-1-session-1-report.md.old | 📦 Registro | Seção 6.3.B |
| prompts/completed-prompts.md.old | ⏳ Atualizar | Seção 6.2 |
| prompts/Guia Completo de Refatoração Modular - Prompts Pas.md.old | 📦 Referência | Seção 6.2 |
| prompts/Guia_impllementação_Melhorias_UIUX.old | ⏳ Padronizar | Seção 2.1 / 5.1 |
| reference/start-screen-mockup.html.old | ⏳ Validar | Seção 2.2 |
| reference/prototypes/*.old | 📦 Referência | Seções 4.2 / 5.1 |
| validation/test-checklist.md.old | ⏳ Revisar | Seção 6.1 |

> **Importante:** qualquer documento futuro criado em `docs/` deve ser incluído no tracker e, quando substituído, movido para uma subpasta datada dentro de `docs/archive/` seguindo esta política.
