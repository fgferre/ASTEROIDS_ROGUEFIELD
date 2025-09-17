# agents.md

## 1) Propósito & Escopo

Estabelecer **regras de colaboração** entre pessoas e agentes de IA em qualquer código, garantindo **segurança, qualidade, rastreabilidade** e **velocidade**. Este documento **não** descreve planos de entrega específicos.

## 2) Princípios Operacionais

- **Menor mudança segura**: evoluir em passos pequenos e reversíveis.
- **Fonte única de verdade**: decisões registradas em PRs/issues.
- **Explícito > implícito**: entradas, saídas e limites sempre documentados.
- **Automação com supervisão**: IA propõe; humanos decidem.
- **Privacidade/segurança primeiro**: sem dados sensíveis em prompts/commits.
- **Observabilidade**: tudo auditável (commits, logs, diffs, testes).

## 3) Papéis

- **Owner/Maintainer (humano)**: define prioridades, aprova merges, resolve conflitos.
- **Contributor (humano)**: implementa, revisa e aciona IAs conforme políticas.
- **AI Reviewer**: revisão estática (bug smells, style, segurança, licenças).
- **AI Coder**: gera diffs **pequenos**, com testes e justificativas.
- **AI Doc Writer**: atualiza docs/CHANGELOG a partir de diffs/PRs.
- **CI/CD**: executa testes, linters, SCA/SAST/DAST, cobertura, build.

## 4) Limites & Permissões (o que a IA **pode/não pode**)

**Pode**

- Sugerir/gerar mudanças **isoladas** com escopo claro.
- Propor refactors **contidos** (1 módulo/feature por vez).
- Criar/atualizar testes e docs relativos à mudança.
- Abrir/atualizar issues com contexto e next steps.

**Não pode**

- Alterar chaves, segredos, políticas de acesso.
- Introduzir dependências externas sem justificativa & aprovação.
- Fazer mudanças transversais múltiplas em um único PR.
- Comitar arquivos binários não rastreados sem aprovação.

## 5) Fluxo de Trabalho (resumo)

1. **Issue/Task clara** → critérios de pronto/aceite definidos.
2. **Branch curta** → **AI Coder** gera um **diff pequeno** + testes.
3. **AI Reviewer** roda checagens → anexa evidências (linhas, regras).
4. **Humano** revisa, decide **merge** ou **rework**.
5. **CI** passa? → merge. Falhou? → correção incremental.
6. **AI Doc Writer** atualiza docs/CHANGELOG.

## 6) Quality Gates (bloqueios de merge)

- **Build & Test**: 100% verde; cobertura mínima definida pelo time.
- **Linters/Format**: zero erros bloqueantes.
- **SAST/SCA**: sem vulnerabilidades de severidade alta/crit.
- **Licenças**: compatíveis com o projeto.
- **Escopo**: PR cumpre apenas a issue alvo e mantém granularidade.

## 7) Decisão & Escalação

- **Owner** tem voto final de **merge/rollback**.
- Conflito persistente → **tríade** (Owner + Revisor humano + Autor).
- Incidentes de qualidade/segurança → **freeze** de merges até remediação.

## 8) Rastreabilidade & Auditoria

- Commits com **mensagem estruturada** (contexto → mudança → impacto).
- PR descreve **motivo, alternativa considerada, trade-offs**.
- As IAs devem **citar**: regra/regra-linters, CVE/regra de segurança, doc fonte.

## 9) Gestão de Risco

- **Red flags**: diffs grandes, dependências novas sem razão, alterações em segurança/build, redução de cobertura.
- **Mitigações**: feature toggles, canary, rollback script, migrations reversíveis.

## 10) Manutenção de Documentação

- Toda mudança **visível** ao usuário/SDK/API → doc atualizada no mesmo PR.
- **CHANGELOG** semanticamente versionado (Keep a Changelog / SemVer).
- Docs de arquitetura descrevem **contratos**, não implementações pontuais.

## 11) Templates de Prompt (curtos)

**AI Reviewer – pedido de revisão**

```
Tarefa: Revisar este diff pequeno para bugs, breaking changes, segurança e style.
Entrada: <diff/PR link + contexto curto>
Saída esperada: lista numerada de achados (linha/regra), risco, correção sugerida.
Limites: não reescreva tudo; foque no escopo do diff.
```

**AI Coder – geração de patch pequena**

```
Tarefa: Produzir um diff pequeno que resolva <issue>.
Requisitos: testes cobrindo caso feliz e borda; comentários mínimos; sem novas deps salvo justificativa.
Saída: patch + notas (motivo, trade-off, rollback).
```

**AI Doc Writer – atualização de docs**

```
Tarefa: Atualizar docs/CHANGELOG conforme diffs.
Saída: texto curto, factual, sem marketing. Linkar PR/commit.
```

## 12) Conformidade & Privacidade

- Sem PII/segredos em prompts, commits e artefatos de CI.
- Logs retidos apenas pelo tempo mínimo necessário.

---

### O que mudou em relação ao seu arquivo anterior

- **Removido**: guia de refatoração e qualquer detalhe de stack/eventos do jogo.
- **Compactado**: princípios em bullets, gates claros, papéis objetivos.
- **Generalizado**: serve para qualquer repo (web, backend, data, infra).
- **Prompts curtos**: prontos para colar em qualquer ferramenta de IA.

### Próximos passos rápidos

1. Renomeie o atual para `refactor-guide.md` e deixe **apenas** o plano lá.
2. Adote este texto como `agents-policy.md` (ou substitua `agents.md`).
3. Linke ambos no `README` em “Processo & Governança”.
