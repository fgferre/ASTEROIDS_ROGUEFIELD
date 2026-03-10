# Plano Executivo de Racionalização

## Resumo
- Executar em 5 frentes separadas, uma PR por frente, usando o handoff de `2026-03-10` como fonte primária e limitando investigação extra aos arquivos citados e seus consumidores diretos.
- Ordem fixa: `PR1 tooling` -> `PR2 debug/bootstrap/app loop` -> `PR3 HUD/settings/canônicos` -> `PR4 ruído operacional + testes duplicados` -> `PR5 monólitos`.
- Regra global: não alterar gameplay, não mudar contrato persistido de settings/save sem migração, e não remover caminhos legacy de waves neste plano.

## Frentes
1. **PR1 — Confiabilidade do tooling**
- Escopo: analisador de dependências, validador de otimizações de testes, `package.json` e docs de tooling.
- Corrigir `validate:deps` para ignorar comentários e dependências fora do escopo real do runtime, eliminando os falsos positivos já apontados no handoff.
- Rebaixar `test:validate-optimizations` para checklist heurístico não bloqueante e alinhar saída/docs para não tratá-lo como oráculo.
- Tratar benchmarks/validators sem superfície oficial como ferramentas manuais; nesta frente eles ficam fora dos gates automáticos e explicitamente documentados como tal.
- Gate: `validate:deps` deixa de acusar os falsos positivos conhecidos e a documentação passa a refletir a superfície oficial real.

2. **PR2 — Debug, observabilidade e bootstrap**
- Escopo: `src/index.html`, `src/app.js`, `src/modules/MenuBackgroundSystem.js` e pontos diretamente ligados ao painel FPS/logging do bootstrap.
- Remover `gsap.min.js`; carregar `Stats.min.js` e criar `window.stats` apenas em dev mode; impedir qualquer UI de debug por padrão em produção.
- Remover `logServiceRegistrationFlow()`, banner/comandos globais de debug e o `console.log` incondicional do bootstrap; manter apenas o logging central realmente necessário.
- Colapsar o `gameLoop()` para um único snapshot de sessão por frame, eliminando a duplicação de `getScreen()/isPaused()` e `try/catch` redundantes.
- Gate: menu e bootstrap sobem sem regressão visual, nenhuma UI/debug aparece por padrão e o loop continua com comportamento equivalente.

3. **PR3 — Canônicos reais em HUD/settings/docs**
- Escopo: `src/data/ui/hudLayout.js`, `src/data/settingsSchema.js`, `src/modules/SettingsSystem.js`, consumidores diretos e docs quebradas associadas.
- Reduzir `hudLayout.js` ao contrato de layout único realmente usado e atualizar consumidores para depender apenas dos exports que continuarem válidos.
- Remover o caminho residual de `video.hudLayout` do estado derivado; não criar migração porque a chave já não é exposta pelo schema atual.
- Derivar `selectedHull` a partir do catálogo canônico de `shipModels.js`, usando `DEFAULT_HULL_ID` e `getAllShipModels()` como fonte única de opções/labels.
- Rebaixar `src/data/enemies/schema.js` explicitamente para documentação/tipos até existir um chamador real de validação; corrigir `src/README.md` e docs/referências quebradas no mesmo PR.
- Gate: uma única fonte de verdade por domínio, nenhum export/layout residual sem consumidor e settings atuais continuam carregando.

4. **PR4 — Ruído operacional e duplicação de manutenção**
- Escopo: assets/mockups de estudo, diretórios vazios, scripts manuais não oficiais, docs que ainda apontam para esse material e testes duplicados de feature flag.
- Consolidar o contrato de `USE_WAVE_MANAGER` na suíte `tests/integration/wavemanager/feature-flags.test.js`; reduzir `tests/balance/asteroid-metrics/feature-flags.test.js` ao que for realmente específico de métricas ou removê-lo se ficar totalmente redundante.
- Limpar referências vivas para estudos/mockups e remover apenas artefatos sem referência em runtime, `package.json`, CI ou docs vivas.
- Se um benchmark/validator continuar útil, documentá-lo como ferramenta manual; se não tiver referência viva após a revisão, removê-lo da superfície ativa.
- Gate: árvore viva sem duplicação de contrato, docs sem links mortos para material de estudo e nenhum cleanup altera a semântica legacy de waves.

5. **PR5 — Dívida estrutural de monólitos**
- Bloqueio de entrada: `PR1` a `PR3` concluídos e verdes; `PR4` pode rodar em paralelo só se não tocar runtime.
- Fase 5A: extração de baixo risco em `EffectsSystem.js`, começando por `SpaceParticle`, `HitMarker` e `DamageText` para módulos próprios com comportamento idêntico.
- Fase 5B: extração de baixo risco em `AudioSystem.js`, começando pelo gerenciamento de thruster loop e utilidades coesas, sem alterar preload, mixagem ou contratos públicos.
- `MenuBackgroundSystem.js`, `EnemySystem.js` e `WaveManager.js` ficam fora deste plano-mãe; cada um exige microplano próprio depois das duas primeiras extrações validarem a abordagem.
- Gate: cada extração reduz contexto/responsabilidade sem mudança comportamental e com cobertura de regressão local.

## Interfaces e contratos afetados
- `hudLayout.js` deixa de fingir suporte multi-layout; o contrato público passa a refletir um único layout suportado.
- `settingsSchema`/`SettingsSystem` passam a tratar casco e HUD com fontes canônicas reais; não há mudança intencional no formato persistido além da remoção de leitura derivada morta.
- `validate:deps` volta a ser gate confiável; `test:validate-optimizations` permanece advisory até futura precisão maior.
- `USE_WAVE_MANAGER`, overrides via `globalThis` e fallback legacy permanecem intactos neste plano.

## Testes e validação
- Após cada PR: `npm test`, `npm run format:check`, `npm run validate:deps`, `npm run test:validate-optimizations`.
- Após `PR2`: smoke manual de bootstrap, menu principal e background animado.
- Após `PR3`: smoke manual de settings, persistência/carregamento de `selectedHull` e HUD com o layout único esperado.
- Após `PR4`: confirmar que a suíte canônica de feature flags continua documentando o contrato atual de override/fallback.
- Após cada fase de `PR5`: rodar testes focados do sistema tocado e um smoke manual curto do fluxo impactado.

## Assunções e defaults
- Não reabrir análise repo-wide; qualquer leitura adicional fica restrita aos arquivos citados no handoff e dependentes diretos.
- Onde o handoff fala em “arquivar”, o default deste plano é despublicar/remover referências e só deletar o que estiver comprovadamente morto; não mover/renomear arquivos sem pedido explícito.
- Gate obrigatório antes de qualquer limpeza estrutural de feature flags legacy: registrar decisão explícita sobre preservação de override/fallback, status dos testes como contrato e estratégia de transição. Sem isso, só consolidar testes/docs e reduzir ruído ao redor.
