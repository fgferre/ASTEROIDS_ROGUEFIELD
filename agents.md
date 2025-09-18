# agents.md

## Escopo e objetivo

Documento único de referência para agentes e pessoas colaborando neste
repositório. Define limites de atuação, boas práticas de colaboração e o fluxo
para manter a arquitetura modular segura e rastreável.

## Princípios operacionais

- Priorize **mudanças pequenas e reversíveis**; valide cada passo antes de seguir.
- **Fonte única de verdade**: toda decisão relevante deve constar em PRs, issues
  ou no `historico_do_projeto.txt`.
- **Explícito > implícito**: documente inputs, outputs e dependências dos
  sistemas (especialmente EventBus e ServiceLocator).
- **Supervisão humana obrigatória**: a IA sugere; humanos aprovam e aplicam.
- **Sem dados sensíveis**: não exponha segredos ou informações pessoais em
  prompts, commits ou artefatos.

## Papéis

- **Owner/Maintainer**: define prioridades, aprova merges e conduz rollbacks.
- **Contributor**: implementa e testa seguindo este guia.
- **AI Coder**: gera diffs enxutos com justificativa, evidências e testes.
- **AI Reviewer**: aponta riscos (bugs, segurança, estilo) com referências.
- **AI Doc Writer**: mantém documentação, histórico e changelog alinhados ao diff.

## Guardrails técnicos

- Preserve a arquitetura baseada em `ServiceLocator` e `EventBus`; não quebre
  contratos públicos de sistemas sem plano de migração.
- Evite dependências novas. Se inevitável, forneça motivação clara e validação
  de impacto.
- Trabalhe em **um módulo ou funcionalidade por vez**, mantendo compatibilidade
  da API pública e dos eventos existentes.
- Prefira ES Modules, funções puras e early returns. Não envolva imports em
  blocos `try/catch`.

## Fluxo de trabalho padrão

1. Confirme o escopo da tarefa e critérios de aceite.
2. Produza diffs atômicos. Execute `npm run test` (mesmo que seja um no-op) e
   demais checagens pertinentes.
3. Anexe resultados e contexto no PR/commit.
4. Atualize documentação afetada (ex.: `docs/validation/test-checklist.md`,
   README, diagramas) antes de solicitar revisão.
5. Revisões humanas ou automatizadas liberam o merge apenas com evidências
   verdes.

## Qualidade e risco

### Quality gates obrigatórios

- Build/tests sem falhas bloqueantes.
- Formatação/lint em conformidade com ferramentas existentes.
- Sem vulnerabilidades críticas conhecidas.
- Escopo do PR aderente à tarefa original e granular.

### Gestão de risco

- **Red flags**: diffs grandes, mudanças em segurança/build, redução de
  cobertura, novos contratos quebrando compatibilidade.
- **Mitigações**: feature toggles, caminhos de rollback, comunicação clara de
  breaking changes e validação incremental.

## Testes e observabilidade

- Rode os scripts disponíveis (`npm run test`, `npm run build`, etc.) e inclua o
  output relevante nas notas.
- Utilize `docs/validation/test-checklist.md` para validar manualmente o jogo.
  Registre quando cada cenário foi coberto e mantenha o checklist atualizado.
- Garanta logs e métricas suficientes para reproduzir bugs e auditar decisões.

## Documentação e comunicação

- Atualize docs, comentários e histórico sempre que alterar APIs, eventos ou
  fluxos de jogo.
- Commits precisam contar a história: contexto → mudança → impacto.
- PRs devem mencionar alternativas descartadas, trade-offs e links úteis.
