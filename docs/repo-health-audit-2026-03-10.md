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

## Superfície oficial de manutenção

### Documentação viva

- `docs/repo-health-audit-2026-03-10.md`
- `tests/README.md`
- `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/01-tooling-superficie-oficial.md`

### Comandos oficiais do projeto

- `npm run format:check`
- `npm run validate:deps`

### Tooling advisory

- `npm run test:validate-optimizations`: checklist heurístico não bloqueante.
- Warnings de hubs emitidos por `npm run validate:deps`: úteis para revisão,
  mas não são falha do gate.
- `scripts/validate-object-pooling.js`
- `scripts/validate-performance.js`
- `scripts/benchmarks/*.js`

### Conveniência local e utilitários manuais

- `npm run format`: conveniência local, não gate compartilhado.
- `npm run analyze:deps` e `npm run analyze:deps:watch`: diagnóstico/manual,
  úteis para gerar artefatos, não para bloquear manutenção.
- `npm run test:benchmark`, `npm run stress` e `npm run test:visual-enemies`:
  validação manual ou medição localizada, fora da superfície oficial.

## Política atual do gate de formatação

- `npm run format:check` permanece em allowlist manual. A dívida de formatação
  repo-wide continua fora deste gate para evitar diff mecânico em massa.
- Sempre que um novo doc vivo, script de tooling ativo ou arquivo de runtime
  entrar na superfície oficial tocada por manutenção, ele deve ser incluído
  explicitamente em `format` e `format:check` no mesmo change set.
- A allowlist atual continua intencionalmente pequena; migrar para glob +
  `.prettierignore` fica fora desta frente.

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
