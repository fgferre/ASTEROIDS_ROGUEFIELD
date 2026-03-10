# Repo Health Status — 2026-03-10

## Quem mantém este arquivo

Este arquivo é mantido por Codex, um agente de engenharia baseado em GPT-5
operando no workspace local. Ele existe para orientar humanos e outras IAs
sobre o estado atual do cleanup aplicado em 2026-03-10.

## Estado atual

- O trilho legado de CI/build foi removido; a validação compartilhada agora usa
  Vite, Vitest e `npm run format:check`.
- Ferramental local de assistentes saiu do versionamento público e ficou apenas
  como configuração local ignorada.
- Documentação histórica pesada foi movida para
  `docs/archive/2026-health-cleanup/`.
- `docs/ui/` saiu da árvore viva; o HUD atual ficou documentado pelo próprio
  código de `AAAHudLayout`, `UISystem` e `hudLayout`.
- Relatórios brutos foram arquivados; os documentos vivos ficaram com resumos
  curtos e comandos de reprodução.
- Mockups PNG grandes sem uso em runtime saíram do repositório principal.

## Onde está o material histórico

- `docs/archive/2026-health-cleanup/README.md` resume o que foi movido ou
  removido.
- O acervo inclui o pacote histórico de migração, planos concluídos, trackers
  administrativos vencidos e relatórios antigos de validação/refatoração.

## Mantido de propósito

- SVGs usados em runtime por `shipModels` e `boss`.
- MP3s usados pelo sistema de áudio.
- Planos ativos em `docs/plans/`.
- Relatórios ativos em `docs/validation/` somente quando ainda são
  reproduzíveis.
- Estudos de referência mantidos para implementação futura, mas fora da
  superfície de runtime:
  - `assets/ui/HUD_layout_mockup.html`
  - `assets/starfield_tela_abertura_estudo/nasa-starfield.html`
  - `assets/procedural/asteroid_generator_study.html`
- `assets/procedural/Criando Asteroides Procedurais Realistas em WebGL2.pdf`
  como referência bibliográfica do mesmo estudo procedural, fora do runtime e
  do gate de formatação.
- `npm run format:check` restrito à superfície oficial mantida por esta
  racionalização: docs vivos, scripts de tooling ativos e arquivos de runtime
  tocados pelo cleanup. A dívida de formatação repo-wide continua fora deste
  gate para evitar um diff mecânico em massa.
- `npm run validate:deps` como gate de dependências; `npm run test:validate-optimizations`
  como checklist heurístico não bloqueante.
- `scripts/validate-object-pooling.js`, `scripts/validate-performance.js` e
  `scripts/benchmarks/*.js` apenas como ferramentas manuais, fora da superfície
  oficial de validação.

## Resíduos periféricos fechados

- `src/styles/`, `src/modules/graphics/` e `exported-assets/` foram
  confirmados vazios e sem referências vivas fora de docs históricas. Não fazem
  parte da árvore versionada e podem ser limpos localmente sem impacto em
  runtime, CI ou build.

## Próximos passos seguros

1. Repetir a mesma política para qualquer novo tooling local de IA: não
   versionar estado efêmero.
2. Revisar periodicamente se relatórios brutos voltaram para a árvore viva.
3. Se esses estudos de referência forem sair do versionamento, movê-los antes
   para um local explícito de acervo ou documentação, sem quebrar a separação
   entre referência e runtime.
4. Avaliar limpeza retroativa de histórico binário apenas se o peso do git
   continuar relevante.
