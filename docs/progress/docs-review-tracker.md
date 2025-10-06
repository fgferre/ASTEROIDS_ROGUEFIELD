# Rastreador da Revisão da Pasta `docs`

Atualizado em 2025-10-10 para consolidar o status de cada documento conforme o plano em `docs/docs-review-plan.md`.

## `docs/analysis`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| xp-drop-system-analysis.md | ✅ Implementado | `RewardManager.dropRewards` centraliza os drops e chama `xpOrbSystem.createXPOrb` (`src/modules/enemies/managers/RewardManager.js`); `XPOrbSystem` mantém apenas ciclo de vida e registra a remoção do antigo listener (`src/modules/XPOrbSystem.js`). | gpt-5-codex | 2025-10-06 | Monitorar métricas quando adicionar novos tipos de recompensa. |
| hud-redesign-proposal.md | ⏳ Não implementado | Layout ainda definido por `HUD_LAYOUT` com blocos em `top-left`, `top-right` e `top-middle` (`src/data/ui/hudLayout.js`), mantendo cartões grandes previstos na análise atual. | gpt-5-codex | 2025-10-06 | Abrir decisão: implementar redesign compacto ou arquivar proposta com justificativa. |
| hud-refined-redesign.md | ⏳ Não implementado | HUD segue cartões separados sem unificação/glow descritos; `hudLayout.js` continua refletindo a versão antiga e o `UISystem` renderiza os cards originais (`src/modules/UISystem.js`). | gpt-5-codex | 2025-10-06 | Consolidar versão de HUD desejada e estimar esforço de implementação. |
| vfx-sfx-current-state.md | ✅ Implementado | `EffectsSystem` contém sistemas de shake, flash, thrusters agressivos; `ScreenShake` ativo no loop. | gpt-5-codex | 2025-10-05 | Revisitar lacunas (indicador direcional, SFX UI) em roadmap de polish. |
| death-explosion-flow-analysis.md | ✅ Implementado | `exitToMenu` agora dispara explosão épica e esconde nave antes do menu. | gpt-5-codex | 2025-10-05 | Considerar mover para arquivo após registrar correção. |

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
| orb-reward-mechanics-analysis.md | 🔄 Desatualizado | Ainda afirma que `RewardManager` usa multiplicadores simplificados, mas o código lê `orbMultiplier` diretamente de `CONSTANTS.ASTEROID_VARIANTS` (`src/modules/enemies/managers/RewardManager.js`). | gpt-5-codex | 2025-10-10 | Reescrever seção de variantes alinhando com `GameConstants.ASTEROID_VARIANTS`. |

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
| implementation-checklist.md | 🔄 Divergente | Checkboxes seguem vazios para pools e benchmarks já ativos (`src/core/ObjectPool.js`, `src/app.js`, `CombatSystem`), ignorando o checklist vivo em `docs/validation/test-checklist.md`. | gpt-5-codex | 2025-10-07 | Revisar documento marcando entregas reais ou movê-lo para histórico para evitar duplicidade. |
| phase-1-performance.md | 📦 Encerrar | Objetivos concluídos e já refletidos nos relatórios; candidato a arquivo. | gpt-5-codex | 2025-10-05 | Mover para `docs/guides/archive` com nota histórica. |
| phase-2-architecture.md | 🔄 Desatualizado | Ainda instrui substituir `window.gameServices` pelo adapter e mantém checklist Fase 2.1 em aberto, enquanto o app preserva o locator legado e só inicializa o adapter sem ativá-lo. | gpt-5-codex | 2025-10-07 | Atualizar narrativa da migração para refletir o estado real e separar backlog futuro. |
| phase-2-1-completion-report.md | ✅ Concluído | Síntese de entrega fase 2.1; não há ações pendentes. | gpt-5-codex | 2025-10-05 | Arquivar como registro oficial após duplicar em histórico. |
| phase-2-2-actual-state.md | ⏳ Em andamento | Confirma RewardManager ativo, mas `EnemySystem.update()` continua chamando `updateWaveLogic` legado e `WaveManager` permanece sem `update()`, assim como a flag do `EnemyFactory`. | gpt-5-codex | 2025-10-07 | Decidir se o WaveManager será conectado ou se o plano será reescrito antes da próxima revisão. |
| phase-2-2-completion-report.md | ⚠️ Otimista | Relato marca a fase como concluída mesmo registrando WaveManager sem loop e EnemySystem retendo lógica de waves. | gpt-5-codex | 2025-10-07 | Rebaixar para histórico parcial ou alinhar com o estado real descrito em `phase-2-2-actual-state.md`. |
| phase-3-juice-polish.md | 🔄 Divergente | Plano ainda exige criar `Easing.js`/`TweenSystem` e `UIAnimations` que não existem no core ou nos módulos atuais, mostrando que o backlog não saiu do papel. | gpt-5-codex | 2025-10-09 | Reescrever alinhando com o estado real e extrair apenas iniciativas ainda válidas (indicadores, SFX, haptics). |
| phase-4-documentation.md | 🔄 Divergente | Gap analysis ignora a bateria atual de testes (`src/__tests__/core|balance|physics`) e referencia utilitários inexistentes (`__utils__/TestEnvironment`). | gpt-5-codex | 2025-10-09 | Levantar inventário real de testes/CI e redefinir metas factíveis para cobertura e documentação. |
| hud-overlay-refactor.md | ⏳ Em andamento | HUD atual segue layout antigo; refatoração não aplicada. | gpt-5-codex | 2025-10-05 | Consolidar com plano de redesign antes de codificar. |
| asteroid-break-enhancement.md | 🔄 Desatualizado | Sistema atual já usa perfis de rachadura em `ASTEROID_CRACK_PROFILES` e gera camadas/fragmentos via tipo `Asteroid` (`src/core/GameConstants.js`, `src/modules/enemies/types/Asteroid.js`). | gpt-5-codex | 2025-10-08 | Atualizar guia para refletir pipeline data-driven ou arquivar como histórico. |
| improvement-roadmap.md | 🔄 Desatualizado | Continua priorizando pooling, spatial hash e batch rendering já presentes em `GamePools`, `PhysicsSystem` e `RenderingSystem`, além de metas genéricas sem owner. | gpt-5-codex | 2025-10-09 | Converter em retro/post-mortem ou atualizar com lacunas reais (áudio, docs, QA). |
| performance-monitor-guide.md | ✅ Implementado | Scripts `quick-performance-test.js` e `realistic-performance-test.js` seguem instruções do guia. | gpt-5-codex | 2025-10-05 | Acrescentar notas de uso em CI futuramente. |
| start-screen-integration-plan.md | ✅ Implementado | Menu atual replica layout 3D com canvas dedicado, botões e créditos em `src/index.html`, fundo animado via `MenuBackgroundSystem` e slider `menuAsteroidNormalIntensity` controlando normal map (`src/modules/MenuBackgroundSystem.js`, `src/data/settingsSchema.js`, `src/app.js`). | gpt-5-codex | 2025-10-08 | Registrar retroativo da migração e decidir se o plano migra para histórico. |
| consolidation-polish-masterplan.md | 🔁 Redundante | Repete fases cobrindo as mesmas entregas dos guias individuais e não registra o estado atual das iniciativas concluídas. | gpt-5-codex | 2025-10-09 | Decidir se vira sumário executivo ou arquivar após distribuir itens para documentos focados. |

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
| completed-prompts.md | ❌ Vazio | Documento contém apenas o cabeçalho `# Completed Prompts`, sem registrar execuções. | gpt-5-codex | 2025-10-08 | Preencher com histórico real ou remover para evitar documentação duplicada. |
| Guia Completo de Refatoração Modular - Prompts Pas.md | 📦 Redundante | Prompts obrigam copiar versão antiga do `EventBus` e recriar estrutura monolítica, destoando do core atual com debug controller (`src/core/EventBus.js`). | gpt-5-codex | 2025-10-08 | Arquivar como legado ou extrair apenas trechos ainda válidos. |
| Guia_impllementação_Melhorias_UIUX | ✏️ Padronizar | Conteúdo reflete bem o estado atual (`src/app.js`, `src/modules/SettingsSystem.js`, `src/data/settingsSchema.js`, `docs/validation/test-checklist.md`), mas o arquivo não tem extensão `.md` nem headings formatados. | gpt-5-codex | 2025-10-10 | Renomear para `.md`, regularizar Markdown e manter links consistentes. |

## `docs/reference`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| start-screen-mockup.html | 📦 Diverge | Mantém layout com Tailwind/CDNs e Stats fixo, diferente do menu real com estrutura nativa e canvas em `src/index.html` e animação controlada pelo `MenuBackgroundSystem`. | gpt-5-codex | 2025-10-10 | Salvar como mockup histórico ou alinhar markup com a tela atual. |
| prototypes/README.md | 📦 Referência | Protótipos experimentais mantidos para consulta; não fazem parte do build. | gpt-5-codex | 2025-10-05 | Manter isolados; documentar acesso se reutilizar. |
| prototypes/test-audio-optimization.html | 📦 Referência | Protótipo legado não integrado ao app. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |
| prototypes/test-batch-rendering.html | 📦 Referência | Protótipo legado; técnicas já aplicadas no motor atual. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |
| prototypes/test.html | 📦 Referência | Protótipo genérico antigo. | gpt-5-codex | 2025-10-05 | Nenhuma ação. |

## `docs/validation`

| Documento | Status | Evidências principais | Responsável | Data da revisão | Próximas ações |
|-----------|--------|-----------------------|-------------|-----------------|----------------|
| test-checklist.md | ⏳ Revisar | Checklist cobre HUD overlay, menu 3D e stress tests (`npm run stress`), porém não registra a data de última execução nem integra com os scripts reais (`package.json`, `src/modules/MenuBackgroundSystem.js`). | gpt-5-codex | 2025-10-10 | Documentar quando cada cenário foi validado e ligar com plano de automação/CI. |

