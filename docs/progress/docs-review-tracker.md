# Rastreador da Revisão da Pasta `docs`

**Atualizado em 2025-10-10.** A partir desta data, o acompanhamento passa a refletir exclusivamente o `docs/plans/docs-implementation-master-plan.md`. Todos os documentos anteriores foram movidos para `docs/archive/2025-plan/` com notas de rastreabilidade.

## Itens ativos do plano mestre

| Item  | Seção                          | Status       | Responsável | Última atualização | Observações                                                                                                   |
| ----- | ------------------------------ | ------------ | ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| 2.1.A | HUD tático minimalista         | ✅ Concluído | UI/UX       | 2025-10-06         | Layout consolidado em `docs/ui/hud-minimal-tactical-layout.md` + mockup `assets/ui/minimal-tactical-hud.svg`. |
| 2.1.B | HUD tático minimalista         | 📋 Planejado | Gameplay    | —                  | Depende da aprovação do item 2.1.A.                                                                           |
| 2.1.C | HUD tático minimalista         | 📋 Planejado | QA/UI       | —                  | Checklist de acessibilidade será criado junto ao item 6.1.A.                                                  |
| 2.2.A | Tela inicial e onboarding      | 📋 Planejado | UI/UX       | —                  | Mockup já disponível na pasta de assets.                                                                      |
| 2.2.B | Tela inicial e onboarding      | 📋 Planejado | Gameplay    | —                  | Criar cenários de teste no checklist após implementação.                                                      |
| 3.1.A | Recompensas e orbs             | 📋 Planejado | Gameplay    | —                  | Necessário instrumentar métricas no RewardManager.                                                            |
| 3.1.B | Recompensas e orbs             | 📋 Planejado | Design      | —                  | Avaliar impacto em ritmo de progressão antes de implementar.                                                  |
| 3.1.C | Recompensas e orbs             | 📋 Planejado | Docs        | —                  | Depende da conclusão dos itens 3.1.A-B.                                                                       |
| 3.2.A | Upgrades de motor              | 📋 Planejado | Design      | —                  | Requer dados atualizados de telemetria.                                                                       |
| 3.2.B | Upgrades de motor              | 📋 Planejado | Engenharia  | —                  | Aguardando definição da curva final (3.2.A).                                                                  |
| 4.1.A | Migração DI + WaveManager      | 📋 Planejado | Engenharia  | —                  | Mapear módulos que ainda usam `gameServices`.                                                                 |
| 4.1.B | Migração DI + WaveManager      | 📋 Planejado | Gameplay    | —                  | Bloqueado até 4.1.A liberar API unificada.                                                                    |
| 4.1.C | Migração DI + WaveManager      | 📋 Planejado | Engenharia  | —                  | Criar épicos para features futuras (telemetria/bosses).                                                       |
| 4.2.A | Monitoramento de performance   | 📋 Planejado | Performance | —                  | Reexecutar scripts de benchmark com build atual.                                                              |
| 4.2.B | Monitoramento de performance   | 📋 Planejado | Engenharia  | —                  | Integrar coleta de métricas ao CI.                                                                            |
| 4.2.C | Monitoramento de performance   | 📋 Planejado | Performance | —                  | Documentar destino dos protótipos legados.                                                                    |
| 5.1.A | Feedback Sensorial             | 📋 Planejado | UI/UX       | —                  | Aguardando definição dos assets de direção.                                                                   |
| 5.1.B | Feedback Sensorial             | 📋 Planejado | Áudio       | —                  | Necessário inventário de SFX faltantes.                                                                       |
| 5.1.C | Feedback Sensorial             | 📋 Planejado | Gameplay    | —                  | Testar impacto de partículas extras na performance.                                                           |
| 5.1.D | Feedback Sensorial             | 📋 Planejado | Gameplay    | —                  | Revisar timers após alterações do WaveManager.                                                                |
| 6.1.A | Checklists unificados          | 📋 Planejado | QA          | —                  | Criar novo diretório `docs/checklists/`.                                                                      |
| 6.1.B | Checklists unificados          | 📋 Planejado | Engenharia  | —                  | Identificar itens automatizáveis.                                                                             |
| 6.2.A | Consolidação de backlog/prompt | 📋 Planejado | Docs        | —                  | Extrair prompts relevantes antes de arquivar redundâncias.                                                    |
| 6.2.B | Consolidação de backlog/prompt | 📋 Planejado | Coordenação | —                  | Sincronizar prioridades com board geral do projeto.                                                           |
| 6.3.A | Plano de documentação final    | 📋 Planejado | Docs        | —                  | Criar README descrevendo nova hierarquia.                                                                     |
| 6.3.B | Plano de documentação final    | 📋 Planejado | Coordenação | —                  | Compilar timeline resumida em `historico_do_projeto.txt`.                                                     |

## Documentos arquivados

Todos os arquivos anteriores foram movidos para `docs/archive/2025-plan/` com sufixo `.old`. Cada documento contém uma nota no cabeçalho apontando para a seção correspondente do plano mestre.

## Próximas ações administrativas

- Configurar lembrete quinzenal para revisar esta tabela.
- Atualizar a coluna **Status** conforme os itens avançarem (📋 Planejado → 🚧 Em andamento → ✅ Concluído).
- Garantir que novos documentos sigam a política descrita em `docs/docs-review-plan.md`.
