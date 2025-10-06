# Plano de Revisão da Pasta `docs`

Este plano descreve como revisar **cada arquivo** existente em `docs/` para confirmar sua relevância, se já teve suas recomendações implementadas ou se deve ser movido para arquivo/seguimento. O resultado esperado é uma pasta `docs` enxuta, com materiais atualizados e rastreáveis.

## Fluxo Geral de Revisão
1. **Inventariar e Contextualizar**
   - Abrir o documento e identificar propósito, data e autor (quando disponível).
   - Registrar em planilha de acompanhamento (sugestão: `docs/progress/docs-review-tracker.md`).
2. **Verificar Implementação**
   - Usar `rg` ou buscas no editor para encontrar termos-chave no código fonte (`src/`), constantes (`GameConstants`, `/src/data`) e relatórios de progresso.
   - Consultar históricos em `docs/progress/` (incluindo `docs/progress/historico_do_projeto.txt`) para cruzar informações.
3. **Classificar Status**
   - `✅ Implementado`: recomendações aplicadas no código e/ou documentação oficial.
   - `📦 Arquivar`: plano obsoleto ou substituído; mover para `docs/archive/` (mantendo referência no tracker).
   - `⏳ Em andamento`: ações pendentes; abrir tarefa no board/issue correspondente.
4. **Registrar Resultado**
   - Atualizar tracker com status, data da revisão, responsável e links para commits ou issues.
   - Se houver tarefas pendentes, criar cards e referenciar o documento original.

## Checklist por Subpasta e Documento

### `docs/analysis`
> Última varredura completa: **2025-10-07** (registrada em `docs/progress/docs-review-tracker.md`).
| Documento | Propósito principal | Como verificar implementação | Entregável após revisão |
|-----------|--------------------|-----------------------------|-------------------------|
| `xp-drop-system-analysis.md` | Avalia comportamento do sistema de XP/drop. | Revisar `src/modules/ProgressionSystem` (ou equivalente) e constantes de XP em `GameConstants`; validar se mudanças sugeridas estão presentes. | Status registrado + lista de divergências ou confirmação de implementação. |
| `hud-redesign-proposal.md` | Propõe redesign inicial do HUD. | Comparar com UI atual (`src/modules/ui`, `assets/ui`) e mockups em `docs/reference`. | Decisão documentada: implementado, arquivar ou replanejar. |
| `hud-refined-redesign.md` | Iteração refinada do redesign do HUD. | Identificar diferenças para a proposta anterior e confrontar com implementação atual. | Escolha oficial da versão adotada e próximos passos. |
| `vfx-sfx-current-state.md` | Levanta estado de efeitos visuais/sonoros. | Auditar `assets/sfx`, `assets/vfx` e sistemas correspondentes (`AudioSystem`, `VfxSystem`). | Checklist atualizada com prioridades e status. |
| `death-explosion-flow-analysis.md` | Analisa fluxo de explosões na morte do jogador. | Conferir lógica em `src/modules/CombatSystem` e `GameConstants` relacionados a explosões; revisar efeitos em `assets`. | Relatório curto com implementação atual e gaps. |

### `docs/archive`
| Documento | Propósito | Verificação | Entregável |
|-----------|-----------|-------------|------------|
| `README.md` | Explica critérios de arquivamento. | Confirmar se o processo descrito ainda faz sentido; atualizar se necessário. | Ajustes ou validação do processo de arquivamento. |
| `EnemySystem.old.js` | Código legado preservado para referência. | Garantir que não há dependências atuais; verificar se comentários refletem por que continua arquivado. | Decidir manter ou remover definitivamente (com justificativa). |

### `docs/balance`
| Documento | Propósito | Como verificar | Entregável |
|-----------|-----------|----------------|------------|
| `REWARD-SYSTEM-FIX-SUMMARY.md` | Resumo das correções do sistema de recompensas. | Conferir se ajustes aparecem em `src/modules/RewardSystem` e dados associados. | Status + tarefas pendentes (se houver). |
| `baseline-metrics.md` | Métricas base atuais do jogo. | Validar com testes recentes (`quick-performance-test.js`, `realistic-performance-test.js`) e dados atuais. | Atualização das métricas ou indicação de desatualização. |
| `orb-reward-mechanics-analysis.md` | Analisa mecânica de orbs/recompensas. | Revisar código de drops e compare com recomendações. | Atualizar backlog com gaps identificados. |

### `docs/design`
| Documento | Propósito | Como verificar | Entregável |
|-----------|-----------|----------------|------------|
| `engine-upgrade-system.md` | Design original do sistema de upgrade de motor. | Verificar implementação em `src/modules/UpgradeSystem` e dados correspondentes. | Classificação do status e próximos passos. |
| `engine-upgrade-system-v2.md` | Revisão v2 (moderada). | Comparar com versão implementada e com `v3`. | Escolher versão vigente e registrar justificativa. |
| `engine-upgrade-system-v3-aggressive.md` | Variante agressiva do design. | Avaliar se alguma parte foi implementada ou descartada; checar impactos de balanceamento. | Decisão de adoção, arquivamento ou backlog. |

### `docs/guides`
| Documento | Propósito | Como verificar | Entregável |
|-----------|-----------|----------------|------------|
| `implementation-checklist.md` | Checklist de implementação geral. | Validar se itens refletem processo atual; cruzar com `docs/validation/test-checklist.md`. | Atualização da checklist ou confirmação de validade. |
| `phase-1-performance.md` | Registro de objetivos da fase 1 (performance). | Conferir se metas estão marcadas como concluídas em relatórios de progresso. | Atualizar status e mover para arquivo se concluído. |
| `phase-2-architecture.md` | Diretrizes da fase 2 de arquitetura. | Avaliar se mudanças planejadas estão concluídas (`src/core`, DI). | Status + tarefas restantes. |
| `phase-2-1-completion-report.md` | Relatório de conclusão da fase 2.1. | Validar se conclusões já constam no histórico oficial; ver se há itens pendentes. | Se concluído, arquivar ou manter como referência com data de revisão. |
| `phase-2-2-actual-state.md` | Estado atual da fase 2.2. | Confrontar com código atual e backlog de DI. | Atualizar dados ou sinalizar pendências. |
| `phase-2-2-completion-report.md` | Relatório de conclusão da fase 2.2. | Confirmar se a fase realmente encerrou; validar com progresso real. | Se encerrado, marcar como implementado/arquivar. |
| `archive/phase-2-2/phase-2-2-branch-readme.md` | README da branch `feature/phase-2-2-enemy-decomposition`. | Garantir que o documento reflita estado atual do WaveManager/EnemyFactory e mantê-lo apenas como histórico se substituído por relatórios recentes. | Decidir manter arquivado ou condensar em relatório final. |
| `phase-3-juice-polish.md` | Roadmap de polish/juice. | Verificar features implementadas (VFX, feedbacks). | Lista de itens concluídos vs pendentes. |
| `phase-4-documentation.md` | Plano de documentação final. | Avaliar status geral da doc e se tarefas foram feitas. | Atualizar plano e distribuir tarefas. |
| `hud-overlay-refactor.md` | Guia de refatoração do HUD overlay. | Revisar implementação do HUD atual. | Registrar status ou abrir tarefas. |
| `asteroid-break-enhancement.md` | Plano de melhorias na quebra de asteroides. | Checar `PhysicsSystem`, `AsteroidSystem` e assets. | Atualização de status. |
| `improvement-roadmap.md` | Roadmap geral de melhorias. | Conferir se itens estão refletidos em backlog atual. | Atualizar roadmap ou arquivar se substituído. |
| `performance-monitor-guide.md` | Guia para monitor de performance. | Verificar se ferramentas (scripts de performance) continuam válidas. | Atualizar instruções ou arquivar. |
| `how-to-send-performance-data.md` | Passo a passo para exportar logs do monitor de performance. | Validar disponibilidade de `window.performanceMonitor.downloadLogs()` no app (`src/app.js`, `src/utils/PerformanceMonitor.js`). | Confirmar que o fluxo funciona e alinhar com onboarding de playtests. |
| `start-screen-integration-plan.md` | Plano para integrar tela inicial. | Conferir `src/modules/ui/start-screen` ou equivalente e `docs/reference/start-screen-mockup.html`. | Status + próximos passos. |

### `docs/progress`
| Documento | Propósito | Como verificar | Entregável |
|-----------|-----------|----------------|------------|
| `week-1-session-1-report.md` | Relatório de progresso inicial. | Validar se informações já estão refletidas em histórico geral. | Manter como registro ou mover para `archive` se redundante. |
| `historico_do_projeto.txt` | Log cronológico de commits com curadoria. | Confirmar se workflow automático continua atualizando e se últimas entradas refletem merges recentes. | Garantir armazenamento em `docs/progress/` e considerar conversão para Markdown futura. |

### `docs/prompts`
| Documento | Propósito | Como verificar | Entregável |
|-----------|-----------|----------------|------------|
| `completed-prompts.md` | Histórico de prompts já utilizados. | Checar se lista está atualizada com entregas recentes; cruzar com `docs/progress/historico_do_projeto.txt`. | Atualizar ou arquivar se duplicado. |
| `Guia Completo de Refatoração Modular - Prompts Pas.md` | Coleção de prompts para refatoração modular. | Verificar se foi incorporado a guias oficiais (`guides/phase-2-architecture.md`). | Decidir manter como referência ou arquivar. |
| `Guia_impllementação_Melhorias_UIUX` | Prompt específico para UI/UX (sem extensão). | Abrir e avaliar utilidade atual; garantir padronização de nome/extensão. | Renomear/adaptar ou arquivar. |

### `docs/reference`
| Documento | Propósito | Como verificar | Entregável |
|-----------|-----------|----------------|------------|
| `start-screen-mockup.html` | Mockup HTML da tela inicial. | Comparar com implementação real no jogo. | Decidir manter como referência, atualizar ou arquivar. |

### `docs/validation`
| Documento | Propósito | Como verificar | Entregável |
|-----------|-----------|----------------|------------|
| `test-checklist.md` | Checklist de validação manual. | Garantir alinhamento com pipelines de build/teste atuais. | Atualizar itens e datas de revisão. |

## Próximos Passos
1. Criar `docs/progress/docs-review-tracker.md` com tabela consolidada (colunas: Documento, Pasta, Status, Evidências, Responsável, Data da revisão, Próximas ações). ✅ Concluído em 2025-02-15.
2. Agendar sessões de revisão (ex.: 2h por subpasta) e designar responsáveis.
3. Após concluir cada revisão, atualizar este plano indicando data da última varredura e eventuais novos documentos.
4. Repetir a varredura a cada final de fase ou quando novos documentos forem adicionados.
