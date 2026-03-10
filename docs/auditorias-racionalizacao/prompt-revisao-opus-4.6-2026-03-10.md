# Prompt de Revisao

Revise o trabalho implementado neste workspace com base principal em:

- `docs/auditorias-racionalizacao/racionalizacao-codigo-consenso-codex-opus-2026-03-10.md`
- `docs/auditorias-racionalizacao/PLAN.md`

Objetivo:

- verificar se a implementacao respeitou gates, cautelas e prioridades do plano;
- apontar bugs, regressões comportamentais, quebras de contrato e limpeza incompleta;
- confirmar se houve excesso de escopo ou mudancas desnecessarias.

Regras da revisao:

- nao reanalise o repositorio inteiro do zero; foque no diff/worktree atual e nos arquivos tocados por esta racionalizacao;
- trate os tres estudos abaixo como referencias intencionais para futuras implementacoes, nao como lixo morto a ser deletado:
  - `assets/ui/HUD_layout_mockup.html`
  - `assets/starfield_tela_abertura_estudo/nasa-starfield.html`
  - `assets/procedural/asteroid_generator_study.html`
- preserve a regra do plano: nao alterar gameplay, nao mudar contrato persistido sem migracao e nao remover o fallback legacy de waves;
- considere que `npm run format:check` ainda falha por dívida preexistente repo-wide; diferencie isso de regressões introduzidas agora.

Pontos que merecem checagem:

- tooling: `validate:deps` confiavel e `test:validate-optimizations` apenas advisory;
- bootstrap/debug: `Stats.min.js` apenas em dev, sem painel/debug global por padrao em producao, sem `gsap.min.js`;
- app loop: snapshot unico por frame, sem regressao funcional;
- HUD/settings: contrato unico em `hudLayout.js`, remocao do caminho residual de `video.hudLayout`, `selectedHull` derivado de `shipModels.js`;
- cleanup: consolidacao do contrato de `USE_WAVE_MANAGER` sem mexer na semantica legacy;
- extracoes de baixo risco: `EffectEntities.js` e `ThrusterLoopManager.js` sem mudanca comportamental.

Formato da resposta:

- liste findings primeiro, em ordem de severidade, com arquivo e linha quando possivel;
- depois registre assumptons/open questions;
- se nao houver findings, diga isso explicitamente e cite riscos residuais ou lacunas de validacao.
