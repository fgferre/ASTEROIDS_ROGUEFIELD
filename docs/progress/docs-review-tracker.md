# Rastreador da Revisão da Pasta `docs`

**Atualizado em 2025-10-11.** A partir desta data o acompanhamento reflete exclusivamente os itens pendentes descritos no `docs/plans/docs-implementation-master-plan.md`.

## Status consolidado
- ✅ Upgrades de motor, WaveManager, recompensas de XP e tela inicial 3D confirmados como concluídos (ver §1.1 do plano).
- ⚠️ Itens pendentes listados abaixo devem ter evidências anexadas em `docs/progress/` assim que avançarem.

## Itens ativos do plano mestre
| Item | Seção | Status | Responsável sugerido | Última atualização | Próximo entregável |
|------|-------|--------|----------------------|--------------------|--------------------|
| 2.1 | HUD sobreposto sem bordas | 📋 Planejado | UI/UX | — | Layout overlay validado + screenshots |
| 2.2 | Modularização do `UISystem` | 📋 Planejado | UI/UX / Engenharia | — | Novos módulos + guia de uso |
| 3.1 | Telemetria de orbs | 📋 Planejado | Gameplay / Data | — | Relatório `xp-drop-report-*.md` |
| 4.1 | Migração para `diContainer` | 📋 Planejado | Engenharia | — | Busca `gameServices.get` restrita ao adaptador |
| 4.2 | Fatiar `app.js` e bootstrap | 📋 Planejado | Engenharia | — | `RetryManager`/`GameBootstrap` extraídos |
| 4.3 | Automação de performance | 📋 Planejado | Engenharia / QA | — | Comando `npm run perf:record` + relatório JSON |
| 5.1 | Sistema de easing/tween | 📋 Planejado | Engenharia / VFX | — | `src/core/Easing.js` + showcase |
| 5.2 | Indicadores fora de tela | 📋 Planejado | Gameplay / VFX | — | Vídeo curto + validação de FPS |
| 6.1 | Checklist unificado | 📋 Planejado | QA / Coordenação | — | `docs/checklists/implementation-and-test.md` |
| 6.2 | Histórico e prompts | 📋 Planejado | Coordenação / Docs | — | `docs/progress/historico_do_projeto.md` atualizado |

## Regras rápidas
- Atualize a coluna **Status** para 🚧 quando houver PR em andamento e para ✅ somente após merge e anexação das evidências.
- Registre na coluna **Última atualização** a data (AAAA-MM-DD) do último movimento relevante.
- Quando um item for concluído, mova os artefatos gerados para `docs/progress/` e mantenha o link no tracker para fácil consulta.
