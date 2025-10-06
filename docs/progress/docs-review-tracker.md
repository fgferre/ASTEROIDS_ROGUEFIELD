# Docs Review Tracker

| Documento | Pasta | Status | Evidências | Responsável | Data da revisão | Próximas ações |
|-----------|-------|--------|------------|-------------|-----------------|----------------|
| `xp-drop-system-analysis.md` | analysis | ✅ Implementado | `RewardManager.dropRewards` controla drops e delega ao `XPOrbSystem`; `EnemySystem` inicializa o manager com o serviço de orbs. | agente | 2025-02-15 | Monitorar métricas de XP quando ajustarmos balanceamento futuro. |
| `hud-redesign-proposal.md` | analysis | ⏳ Em andamento | HUD ainda usa layout em múltiplos painéis (`hud-region-top-left`, `hud-region-top-right`, etc.) no HTML atual. | agente | 2025-02-15 | Abrir tarefa de UI para migrar HUD ao layout compacto proposto, consolidando barras superiores e simplificando painéis inferiores. |
| `hud-refined-redesign.md` | analysis | ⏳ Em andamento | UI mantém cartões separados para vitais/estatísticas; unificação e estética "sleek" não foram aplicadas. | agente | 2025-02-15 | Consolidar propostas v1/v2, definir mockup final e iniciar implementação incremental no `UISystem`. |
| `vfx-sfx-current-state.md` | analysis | ⏳ Em andamento | Sistemas de efeitos avançados estão presentes (shake, freeze frame, thruster ranks), mas lacunas listadas (indicadores de dano direcional, trilhas duplas, SFX de UI) continuam pendentes. | agente | 2025-02-15 | Criar issues específicas para cada gap e priorizar UI SFX antes do próximo playtest. |
| `death-explosion-flow-analysis.md` | analysis | ✅ Implementado | `exitToMenu` agora dispara explosão épica ao sair do pause e oculta a nave durante a animação. | agente | 2025-02-15 | Manter teste manual no checklist de validação para garantir que a sequência continue funcionando em regressões futuras. |
