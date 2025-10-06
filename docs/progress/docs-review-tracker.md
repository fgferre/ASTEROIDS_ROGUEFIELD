# Rastreador da Revisão da Pasta `docs`

Atualizado em 2025-10-06 para consolidar o status de cada documento conforme o plano em `docs/docs-review-plan.md`.

## `docs/analysis`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| xp-drop-system-analysis.md | ✅ Implementado | `EnemySystem.setupEventListeners()` delega `enemy-destroyed` para `RewardManager.dropRewards`, que instancia orbs via `xpOrbSystem.createXPOrb` (`src/modules/EnemySystem.js`, `src/modules/enemies/managers/RewardManager.js`). | gpt-5-codex | 2025-10-07 | Manter monitoramento de métricas ao adicionar novas recompensas. |
| hud-redesign-proposal.md | ⏳ Não implementado | HUD continua usando layout em blocos `top-left/top-right/top-middle` definido em `HUD_LAYOUT` (`src/data/ui/hudLayout.js`); nenhum dos agrupamentos compactos foi aplicado. | gpt-5-codex | 2025-10-07 | Decidir se o redesign será adotado ou arquivar proposta. |
| hud-refined-redesign.md | ⏳ Não implementado | UI ainda apresenta cartões separados e sem o estilo unificado com glow; `HUD_LAYOUT` permanece igual e `UISystem` renderiza estrutura anterior (`src/data/ui/hudLayout.js`, `src/modules/UISystem.js`). | gpt-5-codex | 2025-10-07 | Consolidar versão oficial do HUD antes de iniciar implementação. |
| vfx-sfx-current-state.md | ✅ Implementado | `EffectsSystem` possui shake/flash/freeze frame ativos e thrusters escalonados (`addScreenShake`, `addScreenFlash`, `spawnThrusterVFX`), integrados ao loop via `effects.update()` em `app.js`. | gpt-5-codex | 2025-10-07 | Registrar roadmap para indicadores direcionais e SFX de UI ausentes. |
| death-explosion-flow-analysis.md | ✅ Implementado | `exitToMenu({source:'pause-menu'})` despausa, aciona `createEpicShipExplosion`, esconde a nave e aguarda 3.5 s antes do menu (`src/app.js`); flags `_quitExplosionHidden` usadas na renderização. | gpt-5-codex | 2025-10-07 | Avaliar mover para arquivo após documentar regressões cobertas. |
| docs-audit-plan.md | ✅ Em uso | Plano orienta auditoria contínua de `docs/`; complementa o `docs-review-plan` com checklist individual de auditoria. | gpt-5-codex | 2025-10-07 | Manter sincronizado com progresso da revisão e registrar logs conforme sessões. |

## `docs/archive`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| README.md | ✅ Atual | Processo de arquivamento alinhado; nenhum arquivo carregado no build atual. | gpt-5-codex | 2025-10-05 | Revisar novamente ao arquivar novos módulos. |
| EnemySystem.old.js | 📦 Arquivo histórico | Código legado isolado, sem referências no build atual. | gpt-5-codex | 2025-10-05 | Manter somente como referência até conclusão da migração da fase 2. |

## `docs/balance`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| REWARD-SYSTEM-FIX-SUMMARY.md | ✅ Implementado | `variantMultiplier` lê `GameConstants`; testes de recompensa cobrem casos. | gpt-5-codex | 2025-10-05 | Mantê-lo como referência do fix; atualizar se novas variantes surgirem. |
| baseline-metrics.md | ✅ Atual | Constantes de movimento e economia correspondem a `GameConstants` e upgrades ativos. | gpt-5-codex | 2025-10-05 | Revalidar após futuras fases de balanceamento. |
| orb-reward-mechanics-analysis.md | ⏳ Atualizar | Documento ainda descreve discrepância antiga das variantes. | gpt-5-codex | 2025-10-05 | Atualizar seções destacando correção aplicada ou mover para arquivo. |

## `docs/design`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| engine-upgrade-system.md | 📦 Substituído | Versão inicial substituída pelos planos v2/v3 e pelos dados atuais de upgrades. | gpt-5-codex | 2025-10-05 | Arquivar junto de histórico após registrar referência cruzada. |
| engine-upgrade-system-v2.md | 📦 Substituído | Curva intermediária; valores finais diferentes dos aplicados. | gpt-5-codex | 2025-10-05 | Registrar diferenças e mover para arquivo para evitar confusão. |
| engine-upgrade-system-v3-aggressive.md | ✅ Implementado | Biblioteca de upgrades aplica multiplicadores e níveis visuais conforme doc v3. | gpt-5-codex | 2025-10-05 | Manter como fonte principal; adicionar métricas de telemetria quando disponíveis. |

## `docs/docs-review-plan.md`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| docs-review-plan.md | ✅ Em uso | Plano seguido para criação deste rastreador e classificação inicial. | gpt-5-codex | 2025-10-05 | Atualizar conforme novas revisões de subpastas forem concluídas. |

## `docs/guides`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| implementation-checklist.md | ⏳ Revisar | Checklist não alinhada ao fluxo atualizado de testes/DI; precisa conciliar com `validation/test-checklist.md`. | gpt-5-codex | 2025-10-05 | Atualizar itens ou consolidar com checklists atuais. |
| phase-1-performance.md | 📦 Encerrar | Objetivos concluídos e já refletidos nos relatórios; candidato a arquivo. | gpt-5-codex | 2025-10-05 | Mover para `docs/guides/archive` com nota histórica. |
| phase-2-architecture.md | ⏳ Em andamento | Parte das ações (DI container) ainda em progresso. | gpt-5-codex | 2025-10-05 | Revisitar quando migração para DI concluir. |
| phase-2-1-completion-report.md | ✅ Concluído | Síntese de entrega fase 2.1; não há ações pendentes. | gpt-5-codex | 2025-10-05 | Arquivar como registro oficial após duplicar em histórico. |
| phase-2-2-actual-state.md | ✅ Atual | Documento descreve componentes ativos (`useComponents`) e registra WaveManager pendente, alinhado ao código atual (`EnemySystem.updateAsteroids`, ausência de `waveManager.update`). | gpt-5-codex | 2025-10-07 | Reabrir após integração do WaveManager para atualizar métricas. |
| phase-2-2-completion-report.md | 📦 Histórico | Relatório otimista agora anota que movimento via componente está ativo, mas permanece como registro anterior à conclusão real do WaveManager. | gpt-5-codex | 2025-10-07 | Considerar mover para `archive/` quando a fase 2.2 encerrar oficialmente. |
| phase-3-juice-polish.md | ⏳ Em andamento | Muitos itens (indicadores direcionais, SFX UI) ainda pendentes. | gpt-5-codex | 2025-10-05 | Priorizar backlog de polish após revisão atual. |
| phase-4-documentation.md | ⏳ Planejar | Plano de documentação final depende desta revisão. | gpt-5-codex | 2025-10-05 | Atualizar milestones conforme limpeza avançar. |
| hud-overlay-refactor.md | ⏳ Em andamento | HUD atual segue layout antigo; refatoração não aplicada. | gpt-5-codex | 2025-10-05 | Consolidar com plano de redesign antes de codificar. |
| asteroid-break-enhancement.md | ⏳ Validar | Necessário checar `PhysicsSystem`/`AsteroidSystem` para ver se melhorias foram incorporadas. | gpt-5-codex | 2025-10-05 | Rodar auditoria de colisão/quebra e atualizar doc. |
| improvement-roadmap.md | ⏳ Revisar | Roadmap contém itens já executados e outros obsoletos. | gpt-5-codex | 2025-10-05 | Atualizar estado de cada iniciativa ou mover para histórico. |
| performance-monitor-guide.md | ✅ Implementado | Scripts `quick-performance-test.js` e `realistic-performance-test.js` seguem instruções do guia. | gpt-5-codex | 2025-10-05 | Acrescentar notas de uso em CI futuramente. |
| start-screen-integration-plan.md | ⏳ Em andamento | Necessário verificar integração final da tela inicial com UI atual. | gpt-5-codex | 2025-10-05 | Validar assets versus implementação e atualizar doc. |
| consolidation-polish-masterplan.md | ⏳ Revisar | Documento mestre contém itens duplicados com outros planos. | gpt-5-codex | 2025-10-05 | Consolidar com roadmap final ou arquivar se fragmentado. |

### `docs/guides/archive/phase-2-2`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| README.md | 📦 Arquivo histórico | Plano da fase 2.2 preservado para consulta, já substituído por relatórios recentes. | gpt-5-codex | 2025-10-05 | Manter apenas como referência histórica. |
| phase-2-2-1-activation-plan.md | 📦 Arquivo histórico | Plano concluído; funcionalidades ativadas conforme relatórios. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |
| phase-2-2-1-test-plan.md | 📦 Arquivo histórico | Testes executados durante fase 2.2; hoje apenas referência. | gpt-5-codex | 2025-10-05 | Considerar migração para `docs/validation` se ainda útil. |
| phase-2-2-2-wavemanager-activation-plan.md | ⏳ Em andamento | WaveManager ainda não finalizado; plano permanece relevante. | gpt-5-codex | 2025-10-05 | Atualizar conforme implementação progride. |
| phase-2-2-3-detailed-removal-analysis.md | 📦 Arquivo histórico | Análise concluída durante fase 2.2. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |
| phase-2-2-future-expansion-ready.md | ⏳ Em andamento | Itens de expansão futura (telemetria, bosses) ainda pendentes. | gpt-5-codex | 2025-10-05 | Revisar backlog quando fase 2.2 encerrar oficialmente. |
| phase-2-2-priority-analysis.md | 📦 Arquivo histórico | Priorização utilizada durante execução; hoje serve de registro. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |

## `docs/progress`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| week-1-session-1-report.md | 📦 Registro | Informações já consolidadas no histórico do projeto. | gpt-5-codex | 2025-10-05 | Avaliar mover para `docs/archive` junto de outros relatórios antigos. |

## `docs/prompts`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| completed-prompts.md | ⏳ Atualizar | Lista desatualizada comparada ao `historico_do_projeto.txt`. | gpt-5-codex | 2025-10-05 | Sincronizar com histórico recente de entregas. |
| Guia Completo de Refatoração Modular - Prompts Pas.md | 📦 Referência | Conteúdo redundante com `phase-2-architecture`. | gpt-5-codex | 2025-10-05 | Padronizar nomenclatura e arquivar após extrair itens úteis. |
| Guia_impllementação_Melhorias_UIUX | ⏳ Padronizar | Arquivo sem extensão e com prompt bruto; precisa higienização. | gpt-5-codex | 2025-10-05 | Definir formato (`.md`), revisar conteúdo e decidir manter/arquivar. |

## `docs/reference`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| start-screen-mockup.html | ⏳ Validar | Mockup precisa ser comparado com implementação real da start screen. | gpt-5-codex | 2025-10-05 | Revisar componentes UI e atualizar referências. |
| prototypes/README.md | 📦 Referência | Protótipos experimentais mantidos para consulta; não fazem parte do build. | gpt-5-codex | 2025-10-05 | Manter isolados; documentar acesso se reutilizar. |
| prototypes/test-audio-optimization.html | 📦 Referência | Protótipo legado não integrado ao app. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |
| prototypes/test-batch-rendering.html | 📦 Referência | Protótipo legado; técnicas já aplicadas no motor atual. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |
| prototypes/test.html | 📦 Referência | Protótipo genérico antigo. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |

## `docs/validation`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| test-checklist.md | ⏳ Revisar | Precisa alinhar com scripts de teste atuais e planos de CI. | gpt-5-codex | 2025-10-05 | Atualizar itens obrigatórios e inserir data de revisão. |

