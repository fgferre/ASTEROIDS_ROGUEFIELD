# WAVE-007: Plano de Rollback de Emergência

## Objetivo
Fornecer procedimento rápido e seguro para reverter a ativação do WaveManager em caso de problemas críticos detectados em produção ou durante validação.

## Quando Executar Rollback

### Gatilhos Automáticos (Se Monitoramento Implementado)
- Crash rate >1% em 1 hora
- FPS médio <45 por >10 minutos
- Error rate >5% em 30 minutos
- Memory leak detectado (heap growth >50MB/hora)

### Gatilhos Manuais
- Bloqueador identificado durante WAVE-007
- Feedback negativo consistente de usuários
- Boss waves quebrando progressão
- Baseline metrics divergindo >10%
- Decisão da equipe/stakeholders

## Procedimento de Rollback

### Opção 1: Rollback Rápido (Desativar Flags)

**Tempo estimado:** 2-5 minutos

**Passos:**

1. **Desativar Feature Flags:**
   ```bash
   # Abrir GameConstants.js
   code src/core/GameConstants.js

   # Alterar linhas 1742-1745:
   USE_WAVE_MANAGER = false
   WAVEMANAGER_HANDLES_ASTEROID_SPAWN = false
   # (manter outras flags inalteradas)
   ```

2. **Commit e Deploy:**
   ```bash
   git add src/core/GameConstants.js
   git commit -m "ROLLBACK: Disable WaveManager flags (WAVE-007)"
   git push origin main
   # Executar deploy conforme processo da equipe
   ```

3. **Validar Rollback:**
   - Abrir aplicação em produção
   - Verificar console: deve aparecer `[EnemySystem] Wave system: Legacy`
   - Jogar 2 waves completas
   - Confirmar ausência de erros

4. **Notificar Equipe:**
   - Enviar mensagem: "WaveManager rollback executado. Sistema legado ativo."
   - Registrar motivo do rollback
   - Criar issue no GitHub com detalhes

**Vantagens:**
- Rápido (2-5 min)
- Não requer rebuild
- Preserva código do WaveManager para debug

**Desvantagens:**
- Flags permanecem no código
- Requer novo deploy

### Opção 2: Rollback Completo (Reverter Commit)

**Tempo estimado:** 5-10 minutos

**Passos:**

1. **Identificar Commit Anterior:**
   ```bash
   git log --oneline -10
   # Identificar commit ANTES de "WAVE-007: Activate feature flags"
   # Exemplo: abc1234
   ```

2. **Reverter para Commit Anterior:**
   ```bash
   # Opção A: Revert (cria novo commit)
   git revert <commit-sha-wave-007>
   git push origin main

   # Opção B: Reset (reescreve histórico - usar com cautela)
   git reset --hard <commit-sha-anterior>
   git push origin main --force
   ```

3. **Rebuild e Deploy:**
   ```bash
   npm install
   npm run build
   # Executar deploy conforme processo da equipe
   ```

4. **Validar Rollback:**
   - Executar `npm run test:baseline`
   - Confirmar que todos os testes passam
   - Abrir aplicação e jogar 2 waves
   - Verificar ausência de erros

5. **Notificar Equipe:**
   - Enviar mensagem: "Rollback completo executado. Código revertido para commit <sha>."
   - Registrar motivo e lições aprendidas

**Vantagens:**
- Remove completamente código problemático
- Histórico limpo (se usar revert)

**Desvantagens:**
- Mais lento (5-10 min)
- Requer rebuild
- Perde código do WaveManager (precisa re-aplicar depois)

### Opção 3: Rollback Parcial (Desativar Apenas Spawn)

**Tempo estimado:** 2-5 minutos

**Quando usar:** Se WaveManager funciona mas spawn de asteroides tem problemas.

**Passos:**

1. **Desativar Apenas Spawn de Asteroides:**
   ```bash
   # Alterar apenas linha 1745:
   WAVEMANAGER_HANDLES_ASTEROID_SPAWN = false
   # (manter USE_WAVE_MANAGER = true)
   ```

2. **Commit e Deploy:**
   ```bash
   git add src/core/GameConstants.js
   git commit -m "PARTIAL ROLLBACK: Disable asteroid spawn via WaveManager"
   git push origin main
   ```

3. **Validar:**
   - WaveManager continua ativo para novos inimigos
   - Asteroides usam sistema legado
   - Jogar até wave 10 (incluindo boss)

**Vantagens:**
- Preserva novos inimigos (Drone, Mine, Hunter, Boss)
- Isola problema de spawn de asteroides

**Desvantagens:**
- Sistema híbrido (pode ter inconsistências)

## Checklist Pós-Rollback

### Validação Técnica
- [ ] Aplicação carrega sem erros
- [ ] Console mostra sistema correto ativo (Legacy ou WaveManager)
- [ ] Testes baseline passam: `npm run test:baseline`
- [ ] Jogar 5 waves completas sem erros
- [ ] Performance estável (≥55 FPS)
- [ ] Memory usage normal (<100MB após 5 waves)

### Comunicação
- [ ] Equipe notificada sobre rollback
- [ ] Motivo do rollback documentado
- [ ] Issue criado no GitHub com:
  - Descrição do problema
  - Logs/screenshots relevantes
  - Passos para reproduzir
  - Prioridade (bloqueador/crítico)
- [ ] Stakeholders informados (se aplicável)

### Análise Pós-Mortem
- [ ] Revisar logs de erro
- [ ] Identificar causa raiz
- [ ] Documentar lições aprendidas
- [ ] Atualizar WAVE-007 checklist com novos testes
- [ ] Planejar correção

## Prevenção de Rollbacks Futuros

### Antes de Ativar Flags
- [ ] Executar WAVE-007 checklist completo
- [ ] Todos os testes automatizados passando
- [ ] Validação manual em ambiente de staging
- [ ] Code review por pelo menos 2 pessoas
- [ ] Aprovação de stakeholders

### Durante Ativação
- [ ] Ativar flags em horário de baixo tráfego
- [ ] Monitorar métricas em tempo real (primeiros 30 min)
- [ ] Ter equipe disponível para rollback rápido
- [ ] Comunicar ativação para equipe

### Após Ativação
- [ ] Monitorar métricas por 24-48 horas
- [ ] Coletar feedback de usuários
- [ ] Revisar logs diariamente
- [ ] Manter plano de rollback acessível

## Contatos de Emergência

_Preencher com informações da equipe:_

- **Tech Lead:** _____________
- **DevOps:** _____________
- **QA Lead:** _____________
- **Product Owner:** _____________

## Histórico de Rollbacks

| Data | Motivo | Opção Usada | Tempo | Responsável | Notas |
|------|--------|-------------|-------|-------------|-------|
| ___ | ___ | ___ | ___ | ___ | ___ |

## Referências

- Checklist de Validação: `docs/validation/wave-007-final-validation-checklist.md`
- Plano de Fase 1: `docs/plans/phase1-enemy-foundation-plan.md`
- Relatório de Integração: `docs/validation/wavemanager-integration-report.md`
- GameConstants.js: `src/core/GameConstants.js` (linhas 1742-1747)
