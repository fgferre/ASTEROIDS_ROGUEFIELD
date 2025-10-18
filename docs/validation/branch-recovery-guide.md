# Branch Recovery Guide

This guide provides step-by-step instructions for recovering and managing branches in the ASTEROIDS_ROGUEFIELD project.

## Passo 1-5: Branch Recovery Steps

[Previous recovery steps would be documented here]

---

## Passo 6: Atualizar Histórico do Projeto

### Por Que Atualizar

O arquivo `docs/progress/historico_do_projeto.txt` pode estar desatualizado após checkout para branch anterior. Atualizá-lo garante:
- ✅ Rastreabilidade completa de commits
- ✅ Documentação sincronizada com git
- ✅ Visibilidade de branches e merges

### Comando Rápido

```bash
# Atualizar histórico automaticamente
npm run update:history
```

**Ou manualmente:**

```bash
# Linux/Mac/Git Bash
bash scripts/update-project-history.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File scripts/update-project-history.ps1
```

### Verificar Atualização

```bash
# Ver primeiras linhas do arquivo atualizado
head -20 docs/progress/historico_do_projeto.txt

# Verificar data de geração
grep "Gerado em:" docs/progress/historico_do_projeto.txt

# Verificar commit atual
grep "Commit Atual:" docs/progress/historico_do_projeto.txt
```

**Checklist:**
- [ ] Script executado sem erros
- [ ] Arquivo `historico_do_projeto.txt` atualizado
- [ ] Data de geração corresponde a hoje
- [ ] Commit atual corresponde ao HEAD do branch
- [ ] Branches wave-XX listados corretamente

### Commit da Atualização

```bash
# Adicionar arquivo atualizado ao git
git add docs/progress/historico_do_projeto.txt

# Commit
git commit -m "docs: Update project history after branch recovery"

# Push (se apropriado)
git push origin $(git branch --show-current)
```

**Quando atualizar:**
- ✅ Após checkout para branch diferente
- ✅ Após merge de branches
- ✅ Ao finalizar cada wave
- ✅ Antes de criar documentação de release
- ✅ Periodicamente (semanal)

---

## Próximos Passos

Após recuperação de branch e atualização do histórico:
1. Verificar integridade dos arquivos
2. Executar testes relevantes
3. Documentar alterações
4. Revisar commits
