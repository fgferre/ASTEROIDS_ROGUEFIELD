# Frente 1 - Tooling como Superficie Oficial de Manutencao

## Objetivo

Tornar explicita a superficie oficial de manutencao do projeto para que humanos
e futuras IAs saibam, sem ler implementacao inteira, quais comandos sao
oficiais, quais sao apenas advisory e quais seguem como utilitarios manuais.

## Diagnostico Confirmado

- Equivalentes encontrados antes de criar esta pasta/arquivo:
  `docs/plans/`, `docs/archive/2026-health-cleanup/plans/` e
  `docs/repo-health-audit-2026-03-10.md`.
- A pasta `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/` nao
  existia no estado inicial e foi criada para concentrar os planos desta
  auditoria.
- `package.json` mantem `format` e `format:check` como allowlist manual; o gate
  funciona hoje, mas qualquer novo arquivo da superficie oficial exige inclusao
  explicita.
- `scripts/analyze-dependencies.js` continua heuristico: cobre `import`
  estatico, `<script src>` em HTML e `loadExternalScript(...)`; resolve apenas
  caminhos locais relativos `.js/.mjs/.cjs`, usa entrypoints hardcoded e nao
  deve ser tratado como parser completo.
- `npm run validate:deps` passa no estado atual, mas ja emite advisories
  nao-bloqueantes para hubs.
- `scripts/validate-test-optimizations.js` segue advisory por padrao;
  `npm run test:validate-optimizations` retorna codigo 0 mesmo com findings
  heuristicas.
- `docs/repo-health-audit-2026-03-10.md` e `tests/README.md` ainda misturam
  comandos oficiais com tooling heuristico/manual.

## Escopo

- Documentar no proprio `scripts/analyze-dependencies.js`:
  - o que o analisador enxerga;
  - o que ele nao enxerga;
  - quais saidas sao bloqueantes e quais sao apenas advisory.
- Consolidar a classificacao da superficie de manutencao nos docs vivos
  tocados nesta frente.
- Registrar e manter explicita a politica atual do gate de formatacao:
  allowlist manual, sem migracao nesta frente para glob + `.prettierignore`.

## Nao-Objetivos

- Nao reescrever `scripts/analyze-dependencies.js` para AST parser.
- Nao promover benchmarks, validadores manuais ou checks heuristicos a gate
  oficial.
- Nao expandir o gate de formatacao para o repositorio inteiro.
- Nao alterar runtime, build, testes automatizados ou comportamento do jogo.

## Arquivos-Alvo

- `docs/auditorias-racionalizacao/planos-estado-atual-2026-03-11/01-tooling-superficie-oficial.md`
- `scripts/analyze-dependencies.js`
- `docs/repo-health-audit-2026-03-10.md`
- `tests/README.md`
- `package.json`

## Classificacao Explicita

### Documentacao

- Este plano.
- `docs/repo-health-audit-2026-03-10.md`
- `tests/README.md`

### Tooling Advisory

- `npm run test:validate-optimizations`
- warnings de hubs emitidos por `npm run validate:deps`
- `scripts/validate-object-pooling.js`
- `scripts/validate-performance.js`
- `scripts/benchmarks/*.js`

### Comandos Oficiais do Projeto

- `npm run format:check`
- `npm run validate:deps`

### Conveniencia Local Nao-Gate

- `npm run format`

### Utilitarios Manuais / Diagnostico

- `npm run analyze:deps`
- `npm run analyze:deps:watch`
- `npm run test:benchmark`
- `npm run stress`
- `npm run test:visual-enemies`

## Riscos

- Tratar `validate:deps` como oraculo duro criaria falsa confianca porque a
  cobertura do parser e parcial.
- Nao registrar a politica da allowlist manteria o gate de formatacao
  dependente de memoria informal.
- Deixar `tests/README.md` sem classificacao preservaria drift entre docs e
  scripts reais.

## Criterios de Aceite

- Os limites de `scripts/analyze-dependencies.js` ficam explicitos no proprio
  arquivo.
- A documentacao distingue sem ambiguidade documentacao, tooling advisory e
  comando oficial do projeto.
- A politica do gate de formatacao fica explicita: allowlist manual mantida por
  enquanto, com inclusao explicita quando um novo arquivo entra na superficie
  oficial tocada.
- Nenhuma alteracao de runtime ou de escopo fora desta frente e puxada junto.

## Validacao Minima

- `npm run format:check`
- `npm run validate:deps`
- `npm run test:validate-optimizations`
- Revisao manual da matriz documental para confirmar que cada comando citado
  existe em `package.json` e aparece classificado da mesma forma nos docs
  tocados.

## Sequencia Sugerida

1. Criar esta pasta e registrar o plano da frente 1.
2. Documentar limites e saidas oficiais/advisory em
   `scripts/analyze-dependencies.js`.
3. Alinhar `docs/repo-health-audit-2026-03-10.md` com a matriz fechada de
   comandos oficiais, advisory e manuais.
4. Alinhar `tests/README.md` para que comandos heuristicos/manuais nao aparecam
   como equivalentes aos comandos centrais da suite.
5. Incluir na allowlist de `format`/`format:check` os docs vivos novos ou
   recem-promovidos tocados nesta frente.
6. Reexecutar a validacao minima e encerrar a frente sem expandir escopo.
